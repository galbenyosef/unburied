// src__avatars 04 — sstep
// Lines 919-1233 of readable/src__avatars.pretty.js (statement-aligned).
function strap(pts, nrm, w, t) {
  const pos = [],
    idx = [],
    uv = [],
    n = pts.length,
    T = new V3(),
    Bn = new V3();
  const corners = [];
  for (let i = 0; i < n; i++) {
    T.subVectors(
      pts[Math.min(n - 1, i + 1)],
      pts[Math.max(0, i - 1)],
    ).normalize();
    Bn.crossVectors(T, nrm[i]).normalize();
    const P = pts[i],
      N = nrm[i];
    corners.push([
      P.clone()
        .addScaledVector(Bn, w / 2)
        .addScaledVector(N, t),
      P.clone()
        .addScaledVector(Bn, -w / 2)
        .addScaledVector(N, t),
      P.clone().addScaledVector(Bn, -w / 2),
      P.clone().addScaledVector(Bn, w / 2),
    ]);
  }
  for (let k = 0; k < 4; k++) {
    const base = pos.length / 3;
    let len = 0;
    for (let i = 0; i < n; i++) {
      if (i) len += pts[i].distanceTo(pts[i - 1]);
      const A = corners[i][k],
        Bq = corners[i][(k + 1) % 4];
      pos.push(A.x, A.y, A.z, Bq.x, Bq.y, Bq.z);
      uv.push(0, len / TILE, w / TILE, len / TILE);
    }
    for (let i = 0; i < n - 1; i++) {
      const A = base + i * 2,
        Bq = A + 1,
        C = A + 2,
        D = A + 3;
      idx.push(A, C, D, A, D, Bq);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  return g;
}
function ellip(rx, ry, rz, ws = 12, hs = 8) {
  const g = new THREE.SphereGeometry(1, ws, hs);
  g.scale(rx, ry, rz);
  return g;
}
/** superellipsoid "soft box" (p ~ 4-8) */
function sbox(w, h, d, p = 6, ws = 8, hs = 6) {
  const g = new THREE.SphereGeometry(1, ws, hs),
    P = g.attributes.position,
    e = 2 / p;
  for (let i = 0; i < P.count; i++) {
    const x = P.getX(i),
      y = P.getY(i),
      z = P.getZ(i);
    const f = (v) => Math.sign(v) * Math.pow(Math.abs(v), e);
    P.setXYZ(i, (f(x) * w) / 2, (f(y) * h) / 2, (f(z) * d) / 2);
  }
  return g;
}
function cyl(rt, rb, h, seg = 10, open = false) {
  return new THREE.CylinderGeometry(rt, rb, h, seg, 1, open);
}
const mT = (x, y, z) => new M4().makeTranslation(x, y, z);
const mR = (x, y, z, o = "XYZ") =>
  new M4().makeRotationFromEuler(new THREE.Euler(x, y, z, o));
const mS = (x, y, z) => new M4().makeScale(x, y, z);
const mm = (...ms) => ms.reduce((a, b) => a.multiply(b), new M4());
function mBasis(x, y, z, pos) {
  return new M4().makeBasis(x, y, z).setPosition(pos);
}

// ====================================================================================== body builder
// All geometry is built at a 1.78 m base scale in the bind pose, then uniformly scaled per character.
const BASE_H = 1.78;
const HC = new V3(0, 1.664, 0.014); // head centre (sculpt origin) in bind space

// torso surface profile: [y, rx, rzFront, rzBack, zc, p]
const TORSO_M = [
  [0.8, 0.128, 0.056, 0.092, -0.012, 2.2],
  [0.825, 0.16, 0.08, 0.118, -0.014, 2.3],
  [0.86, 0.178, 0.096, 0.132, -0.014, 2.5],
  [0.91, 0.18, 0.104, 0.13, -0.01, 2.5],
  [0.98, 0.172, 0.11, 0.118, -0.004, 2.5],
  [1.04, 0.163, 0.112, 0.11, 0.0, 2.5],
  [1.1, 0.162, 0.115, 0.108, 0.004, 2.5],
  [1.18, 0.17, 0.122, 0.112, 0.008, 2.6],
  [1.26, 0.18, 0.129, 0.116, 0.011, 2.7],
  [1.33, 0.188, 0.13, 0.119, 0.011, 2.8],
  [1.39, 0.192, 0.123, 0.12, 0.006, 2.9],
  [1.43, 0.188, 0.111, 0.114, 0.002, 2.9],
  [1.46, 0.17, 0.095, 0.102, -0.002, 2.7],
  [1.485, 0.138, 0.081, 0.088, -0.006, 2.4],
  [1.505, 0.097, 0.071, 0.076, -0.01, 2.1],
  [1.52, 0.073, 0.065, 0.068, -0.013, 2.0],
  [1.535, 0.064, 0.06, 0.064, -0.015, 2.0],
];

function makeTorso(C) {
  const T = TORSO_M.map((r) => r.slice());
  for (const r of T) {
    const y = r[0];
    const up = sstep(1.2, 1.42, y),
      mid = gauss(y - 1.05, 0.08),
      low = gauss(y - 0.88, 0.07);
    let sx = C.girth * lerp(1, C.shoulder, up);
    if (C.female) {
      sx *= 1 - 0.07 * mid;
      sx *= 1 + 0.045 * low;
    } else {
      sx *= 1 + 0.05 * gauss(y - 1.33, 0.08);
      r[2] += 0.006 * gauss(y - 1.3, 0.07);
      r[3] += 0.006 * gauss(y - 1.34, 0.08);
    }
    r[1] *= sx;
    r[2] *= C.girth;
    r[3] *= C.girth;
    if (C.female) r[2] += 0.014 * gauss(y - 1.285, 0.045); // bust under the jacket
    if (C.top === "gymnastyorka") {
      r[1] += 0.006 * sstep(1.0, 0.8, y);
      r[2] += 0.006 * sstep(0.95, 0.8, y);
    }
  }
  const at = (y) => {
    if (y <= T[0][0]) return T[0];
    for (let i = 1; i < T.length; i++)
      if (y <= T[i][0]) {
        const a = T[i - 1],
          b = T[i],
          t = (y - a[0]) / (b[0] - a[0]);
        return [
          y,
          lerp(a[1], b[1], t),
          lerp(a[2], b[2], t),
          lerp(a[3], b[3], t),
          lerp(a[4], b[4], t),
          lerp(a[5], b[5], t),
        ];
      }
    return T[T.length - 1];
  };
  const surf = (y, th, off = 0, out = new V3()) => {
    const r = at(y),
      e = 2 / r[5],
      s = Math.sin(th),
      c = Math.cos(th);
    const sx = Math.sign(s) * Math.pow(Math.abs(s), e),
      sz = Math.sign(c) * Math.pow(Math.abs(c), e);
    return out.set(
      sx * (r[1] + off),
      y,
      sz * ((c >= 0 ? r[2] : r[3]) + off) + r[4],
    );
  };
  const normal = (y, th) => {
    const e = 0.004,
      a = surf(y, th - e),
      b = surf(y, th + e),
      c = surf(y - e, th),
      d = surf(y + e, th);
    return new V3().crossVectors(b.sub(a), d.sub(c)).normalize();
  };
  /** frame on the surface: x = tangent (toward +theta), y = up along surface, z = outward normal */
  const frame = (y, th, off = 0, flatUp = true) => {
    const n = normal(y, th);
    if (flatUp) {
      n.y = 0;
      n.normalize();
    }
    const x = new V3().crossVectors(AY, n).normalize(),
      yy = new V3().crossVectors(n, x);
    return mBasis(x, yy, n, surf(y, th, off));
  };
  const rings = (y0, y1, n, off = (y) => 0, dr = null) => {
    const out = [];
    for (let i = 0; i <= n; i++) {
      const y = n > 0 ? lerp(y0, y1, i / n) : y0,
        r = at(y),
        o = off(y);
      out.push({
        c: new V3(0, y, r[4]),
        ax: AX,
        az: AZ,
        rx: r[1] + o,
        rz: r[2] + o,
        rzb: r[3] + o,
        p: r[5],
        dr: dr ? (th) => dr(y, th) : null,
      });
    }
    return out;
  };
  return { T, at, surf, normal, frame, rings };
}

// ---------------------------------------------------------------- skin weights (bind space)
function wTorso(p, skirt = 1) {
  const y = p.y,
    ax = Math.abs(p.x),
    s = p.x >= 0 ? "L" : "R";
  const L = [];
  let wh = 0,
    ws = 0,
    wc = 0,
    wn = 0;
  if (y < 1.0) wh = 1;
  else if (y < 1.12) {
    const t = sstep(1.0, 1.12, y);
    wh = 1 - t;
    ws = t;
  } else if (y < 1.22) {
    const t = sstep(1.12, 1.22, y);
    ws = 1 - t;
    wc = t;
  } else if (y < 1.48) wc = 1;
  else {
    const t = sstep(1.48, 1.545, y);
    wc = 1 - t;
    wn = t;
  }
  // shoulders ride on the clavicle / upper arm
  const cl = sstep(0.085, 0.165, ax) * sstep(1.3, 1.43, y) * 0.75 * wc;
  const ua = sstep(0.16, 0.205, ax) * sstep(1.34, 1.43, y) * 0.55 * wc;
  wc -= cl + ua;
  L.push(
    [B.hips, wh],
    [B.spine, ws],
    [B.chest, wc],
    [B.neck, wn],
    [B["clav" + s], cl],
    [B["ua" + s], ua],
  );
  if (y < 0.95 && skirt > 0) {
    const t = sstep(0.95, 0.74, y) * skirt;
    const a = t * sstep(-0.045, 0.1, p.x),
      b = t * sstep(0.045, -0.1, p.x);
    L[0][1] = Math.max(0, wh - a - b);
    L.push([B.thL, a], [B.thR, b]);
  }
  return L;
}
function armT(p, s, C) {
  const sh = _v1.set(0.182 * C.shoulder * s, 1.438, -0.012),
    d = ADIR(s);
  return (p.x - sh.x) * d.x + (p.y - sh.y) * d.y + (p.z - sh.z) * d.z;
}
function wArm(p, s, C) {
  const S = s > 0 ? "L" : "R",
    t = armT(p, s, C);
  const cv = B["clav" + S],
    ua = B["ua" + S],
    fa = B["fa" + S],
    tw = B["tw" + S],
    hd = B["hand" + S];
  if (t < -0.02)
    return [
      [B.chest, 0.35],
      [cv, 0.65],
    ];
  if (t < 0.07) {
    const k = sstep(-0.02, 0.07, t);
    return [
      [B.chest, 0.35 * (1 - k)],
      [cv, 0.65 * (1 - k)],
      [ua, k],
    ];
  }
  if (t < 0.25) return ua;
  if (t < 0.335) return wb(ua, fa, sstep(0.25, 0.335, t));
  if (t < 0.37) return fa;
  if (t < 0.52) return wb(fa, tw, sstep(0.37, 0.52, t));
  if (t < 0.545) return tw;
  if (t < 0.57) return wb(tw, hd, sstep(0.545, 0.57, t));
  return hd;
}
function wLeg(p, s) {
  const S = s > 0 ? "L" : "R",
    th = B["th" + S],
    sh = B["sh" + S],
    ft = B["ft" + S];
  const y = p.y;
  if (y > 0.9) return wb(th, B.hips, sstep(0.9, 1.0, y) * 0.8);
  if (y > 0.555) return th;
  if (y > 0.45) return wb(sh, th, sstep(0.45, 0.555, y));
  if (y > 0.14) return sh;
  return wb(ft, sh, sstep(0.09, 0.14, y));
}
function wFoot(p, s) {
  const S = s > 0 ? "L" : "R",
    sh = B["sh" + S],
    ft = B["ft" + S],
    toe = B["toe" + S];
  if (p.y > 0.12) return wb(ft, sh, sstep(0.12, 0.16, p.y));
  return wb(ft, toe, sstep(0.105, 0.155, p.z));
}
function wNeck(p) {
  const y = p.y;
  if (y < 1.475) return B.chest;
  if (y < 1.53) return wb(B.chest, B.neck, sstep(1.475, 1.53, y));
  if (y < 1.585) return B.neck;
  if (y < 1.63) return wb(B.neck, B.head, sstep(1.585, 1.63, y));
  return B.head;
}

// ---------------------------------------------------------------- head sculpt
