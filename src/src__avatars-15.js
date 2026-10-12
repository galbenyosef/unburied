// src__avatars 15 — math
// Lines 4115-4362 of readable/src__avatars.pretty.js (statement-aligned).
const HP = {
  relax: [
    0.35, 0.1, 0.2, 0.2, 0.22, 0.3, 0.2, 0.28, 0.38, 0.22, 0.34, 0.44, 0.26,
    0.4, 0.5, 0.3, 0,
  ],
  grip: [
    1.05, 0.35, 0.45, 0.35, -0.16, 0.1, 0.06, 1.38, 1.5, 0.75, 1.42, 1.5, 0.75,
    1.46, 1.42, 0.7, 0,
  ],
  trigger: [
    1.05, 0.35, 0.45, 0.35, 0.72, 1.0, 0.5, 1.38, 1.5, 0.75, 1.42, 1.5, 0.75,
    1.46, 1.42, 0.7, 0,
  ],
  support: [
    0.5, 0.15, 0.25, 0.2, 0.62, 0.85, 0.45, 0.72, 0.9, 0.5, 0.78, 0.92, 0.5,
    0.85, 0.95, 0.5, 0,
  ],
  wrap: [
    0.95, 0.25, 0.35, 0.25, 1.1, 1.15, 0.6, 1.2, 1.2, 0.6, 1.25, 1.2, 0.6, 1.3,
    1.2, 0.6, 0,
  ],
  fist: [
    1.1, 0.45, 0.6, 0.5, 1.5, 1.6, 0.9, 1.55, 1.6, 0.9, 1.55, 1.6, 0.9, 1.55,
    1.6, 0.9, 0,
  ],
  flat: [
    0.2, 0.05, 0.05, 0.05, 0.06, 0.08, 0.05, 0.05, 0.08, 0.05, 0.06, 0.08, 0.05,
    0.08, 0.1, 0.05, 0,
  ],
  cup: [
    0.9, 0.2, 0.3, 0.3, 0.75, 0.85, 0.45, 0.8, 0.9, 0.45, 0.85, 0.9, 0.45, 0.9,
    0.9, 0.45, 0,
  ],
  pinch: [
    0.9, 0.3, 0.5, 0.4, 0.7, 0.8, 0.5, 0.9, 1.1, 0.6, 1.1, 1.2, 0.6, 1.2, 1.2,
    0.6, 0,
  ],
};
// grip centre (object axis) in the hand frame [f, t, p] for poses that hold something
const GRIP_OFF = {
  grip: [0.084, -0.006, 0.03],
  trigger: [0.084, -0.006, 0.03],
  support: [0.066, 0.004, 0.022],
  wrap: [0.078, 0.0, 0.03],
  fist: [0.08, 0.0, 0.026],
  cup: [0.08, 0.0, 0.04],
  pinch: [0.1, 0.02, 0.03],
  flat: [0.09, 0.0, 0.02],
  relax: [0.09, 0, 0.02],
};

// ====================================================================================== grip solving
/** planar wrap of a 3-segment finger around a circle (object axis parallel to the hand's T axis).
 *  (bf, bp) finger base, (of, op) circle centre, all in hand (f, p) coordinates. Writes 3 curls. */
function wrapCurls(bf, bp, lens, of, op, Rc, out, o) {
  const bx = bf - of,
    by = bp - op,
    dB = Math.hypot(bx, by),
    phiB = Math.atan2(by, bx),
    L0 = lens[0];
  const pts = [[bf, bp]];
  let phi;
  if (dB <= Rc + 1e-4) phi = phiB + L0 / Rc;
  else if (dB >= Rc + L0) phi = null;
  else
    phi =
      phiB +
      Math.acos(clamp((dB * dB + Rc * Rc - L0 * L0) / (2 * dB * Rc), -1, 1));
  if (phi === null) {
    // cannot reach: reach toward it, curl the rest
    const a = Math.atan2(op - bp, of - bf);
    pts.push([bf + Math.cos(a) * L0, bp + Math.sin(a) * L0]);
    let th = a;
    for (let k = 1; k < 3; k++) {
      th += 0.9;
      const q = pts[pts.length - 1];
      pts.push([q[0] + Math.cos(th) * lens[k], q[1] + Math.sin(th) * lens[k]]);
    }
  } else {
    pts.push([of + Rc * Math.cos(phi), op + Rc * Math.sin(phi)]);
    for (let k = 1; k < 3; k++) {
      phi += 2 * Math.asin(Math.min(1, lens[k] / (2 * Rc)));
      pts.push([of + Rc * Math.cos(phi), op + Rc * Math.sin(phi)]);
    }
  }
  let prev = 0;
  const lim = [
    [-0.25, 1.65],
    [0, 1.9],
    [0, 1.45],
  ];
  for (let k = 0; k < 3; k++) {
    const th = Math.atan2(pts[k + 1][1] - pts[k][1], pts[k + 1][0] - pts[k][0]);
    out[o + k] = clamp(wrapA(th - prev), lim[k][0], lim[k][1]);
    prev += out[o + k];
  }
}
/** 2-bone planar reach of the index finger: DIP joint onto (tf, tp); distal follows */
function reachCurls(bf, bp, L0, L1, tf, tp, out, o, distal = 0.55) {
  const dx = tf - bf,
    dy = tp - bp;
  const d = clamp(
    Math.hypot(dx, dy),
    Math.abs(L0 - L1) + 1e-4,
    (L0 + L1) * 0.999,
  );
  const a = Math.atan2(dy, dx),
    beta = Math.acos(clamp((L0 * L0 + d * d - L1 * L1) / (2 * L0 * d), -1, 1));
  const c0 = a - beta;
  const jx = bf + Math.cos(c0) * L0,
    jy = bp + Math.sin(c0) * L0;
  const t1 = Math.atan2(tp - jy, tf - jx);
  out[o] = clamp(c0, -0.35, 1.6);
  out[o + 1] = clamp(wrapA(t1 - c0), 0, 1.9);
  out[o + 2] = clamp(out[o + 1] * distal, 0, 1.3);
}
/** thumb: coordinate descent on (opposition, c0, c1, c2) toward a tip target, avoiding the object cylinder */
function solveThumb(s, hs, target, axP, axD, Rt, init) {
  const H = s > 0 ? HR.L : HR.R,
    fd = FING.th;
  const base = hf(
    s,
    fd.base[0] * hs,
    fd.base[1] * hs,
    fd.base[2] * hs,
    new V3(),
  );
  const D = hf(s, fd.dir[0], fd.dir[1], fd.dir[2], new V3()).normalize();
  const opp = new V3().crossVectors(H.T, H.P).normalize();
  const kt = new V3()
    .crossVectors(D, new V3().copy(H.P).addScaledVector(H.T, -0.4))
    .normalize();
  const L = fd.len.map((l) => l * hs);
  const q0 = new Q4(),
    q1 = new Q4(),
    q2 = new Q4(),
    qa = new Q4(),
    j1 = new V3(),
    j2 = new V3(),
    tip = new V3(),
    tmp = new V3(),
    m = new V3();
  const cyl = (p) => {
    tmp.subVectors(p, axP);
    const al = tmp.dot(axD);
    const r = Math.sqrt(Math.max(0, tmp.lengthSq() - al * al));
    return r < Rt ? (Rt - r) ** 2 : 0;
  };
  const cost = (x) => {
    q0.setFromAxisAngle(opp, x[0])
      .multiply(qa.setFromAxisAngle(H.P, x[4] * -s))
      .multiply(qa.setFromAxisAngle(kt, x[1]));
    q1.copy(q0).multiply(qa.setFromAxisAngle(kt, x[2]));
    q2.copy(q1).multiply(qa.setFromAxisAngle(kt, x[3]));
    j1.copy(D).multiplyScalar(L[0]).applyQuaternion(q0).add(base);
    j2.copy(D).multiplyScalar(L[1]).applyQuaternion(q1).add(j1);
    tip.copy(D).multiplyScalar(L[2]).applyQuaternion(q2).add(j2);
    let c = tip.distanceToSquared(target);
    c +=
      6 *
      (cyl(j1) +
        cyl(j2) +
        cyl(tip) +
        cyl(m.addVectors(j1, j2).multiplyScalar(0.5)) +
        cyl(m.addVectors(j2, tip).multiplyScalar(0.5)));
    return c;
  };
  const lo = [0, -0.4, 0, 0, -0.3],
    hi = [1.7, 1.3, 1.2, 1.2, 1.1];
  const x = init ? init.slice() : [0.7, 0.2, 0.2, 0.2, 0.3];
  let best = cost(x),
    step = 0.3;
  for (let it = 0; it < 120 && step > 0.003; it++) {
    let moved = false;
    for (let i = 0; i < 5; i++)
      for (const sg of [1, -1]) {
        const old = x[i];
        x[i] = clamp(old + sg * step, lo[i], hi[i]);
        const c = cost(x);
        if (c < best - 1e-12) {
          best = c;
          moved = true;
        } else x[i] = old;
      }
    if (!moved) step *= 0.5;
  }
  return x;
}
const _hc = (s, v, out) => {
  // bind-space vector -> hand (f, t, p) coords
  const H = s > 0 ? HR.L : HR.R;
  return out.set(v.dot(H.F), v.dot(H.T), v.dot(H.P));
};

// ====================================================================================== avatar
const FOOT_NAMES = ["L", "R"];
class Pose {
  constructor() {
    this.hipsP = new V3();
    this.tq = [new Q4(), new Q4(), new Q4(), new Q4(), new Q4()]; // hips spine chest neck head
    this.foot = [0, 1].map(() => ({
      p: new V3(),
      q: new Q4(),
      toe: new Q4(),
      pole: new V3(),
    }));
    this.hand = [0, 1].map(() => ({
      p: new V3(),
      q: new Q4(),
      pose: new Float32Array(17),
      pole: new V3(),
      onGun: 1,
      gp: "grip",
    }));
    this.gunP = new V3();
    this.gunQ = new Q4();
    this.clav = [0, 0]; // extra clavicle elevation (L, R)
  }
  blend(o, t) {
    if (t <= 0) return this;
    this.hipsP.lerp(o.hipsP, t);
    for (let i = 0; i < 5; i++) this.tq[i].slerp(o.tq[i], t);
    for (let i = 0; i < 2; i++) {
      const a = this.foot[i],
        b = o.foot[i];
      a.p.lerp(b.p, t);
      a.q.slerp(b.q, t);
      a.toe.slerp(b.toe, t);
      a.pole.lerp(b.pole, t);
      const h = this.hand[i],
        k = o.hand[i];
      h.p.lerp(k.p, t);
      h.q.slerp(k.q, t);
      h.pole.lerp(k.pole, t);
      h.onGun = lerp(h.onGun, k.onGun, t);
      for (let j = 0; j < 17; j++) h.pose[j] = lerp(h.pose[j], k.pose[j], t);
      if (t > 0.5) h.gp = k.gp;
      this.clav[i] = lerp(this.clav[i], o.clav[i], t);
    }
    this.gunP.lerp(o.gunP, t);
    this.gunQ.slerp(o.gunQ, t);
    return this;
  }
}
const fwdOf = (yaw, out) => out.set(Math.sin(yaw), 0, Math.cos(yaw));
const leftOf = (yaw, out) => out.set(Math.cos(yaw), 0, -Math.sin(yaw));
const Q_GUN = new Q4().setFromAxisAngle(AY, -PI / 2); // gun +X -> model +Z

