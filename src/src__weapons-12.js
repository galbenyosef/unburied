// src__weapons 12 — out
// Lines 3372-3665 of readable/src__weapons.pretty.js (statement-aligned).
class Arm {
  constructor(parent, mats, side) {
    const U = unitGeos();
    this.side = side;
    const mk = (geo, mat) => {
      const m = new THREE.Mesh(geo, mat);
      m.matrixAutoUpdate = false;
      m.frustumCulled = false;
      parent.add(m);
      return m;
    };
    this.upper = mk(U.taper, mats.sleeve);
    this.elbow = mk(U.sph, mats.sleeve);
    this.fore = mk(U.taper, mats.sleeve);
    this.roll = mk(U.roll, mats.sleeve);
    this.skin = mk(U.taper, mats.skin);
    this.cuff = mk(U.cuffC, mats.glove);
    this.S = new V3(side * 0.21, -0.33, 0.1);
    this.pole = new V3(side * 0.7, -1, 0.15).normalize();
    this.E = new V3();
    this.style = { rolled: true, gloved: true, scale: 1 };
  }
  setStyle({ sleeve, skin, glove, rolled = true, scale = 1 }) {
    this.upper.material =
      this.elbow.material =
      this.fore.material =
      this.roll.material =
        sleeve;
    this.skin.material = skin;
    this.cuff.material = glove || skin;
    this.style = { rolled, gloved: !!glove, scale };
  }
  update(W) {
    const S = this.S;
    const La = 0.3,
      Lf = 0.27;
    const d = new V3().subVectors(W, S);
    const dist = Math.max(1e-4, d.length());
    let a = La,
      b = Lf;
    const maxR = (a + b) * 0.995;
    if (dist > maxR) {
      const k = dist / maxR;
      a *= k;
      b *= k;
    }
    d.normalize();
    const x = (a * a - b * b + dist * dist) / (2 * dist);
    const h = Math.sqrt(Math.max(0, a * a - x * x));
    const pv = this.pole
      .clone()
      .addScaledVector(d, -this.pole.dot(d))
      .normalize();
    const E = this.E.copy(S).addScaledVector(d, x).addScaledVector(pv, h);
    const k = this.style.scale;
    placeSeg(this.upper, S, E, 0.052 * k);
    placeSph(this.elbow, E, 0.047 * k);
    const P = (t) => new V3().lerpVectors(E, W, t);
    if (this.style.rolled) {
      placeSeg(this.fore, E, P(0.56), 0.047 * k);
      placeSeg(this.roll, P(0.5), P(0.62), 0.045 * k);
      placeSeg(this.skin, P(0.58), P(0.95), 0.036 * k);
    } else {
      // full-length sleeve with a buttoned cuff band at the wrist
      placeSeg(this.fore, E, P(0.9), 0.047 * k);
      placeSeg(this.roll, P(0.83), P(0.92), 0.039 * k);
      placeSeg(this.skin, P(0.88), P(0.99), 0.031 * k);
    }
    this.cuff.visible = this.style.gloved;
    placeSeg(this.cuff, P(0.84), P(1.02), 0.0335 * k);
    // reverse taper direction for the skin (thicker at elbow side): taper geo is thin at top already
  }
}

// ======================================================================================
// Keyframes: monotone cubic per channel. keys = [[t, v0, v1, ...], ...]
// ======================================================================================

function sampleKeys(keys, t, out) {
  const n = keys[0].length - 1;
  if (t <= keys[0][0] || keys.length === 1) {
    for (let i = 0; i < n; i++) out[i] = keys[0][i + 1];
    return out;
  }
  const last = keys[keys.length - 1];
  if (t >= last[0]) {
    for (let i = 0; i < n; i++) out[i] = last[i + 1];
    return out;
  }
  let k = 0;
  while (t >= keys[k + 1][0]) k++;
  const a = keys[k],
    b = keys[k + 1];
  const h = b[0] - a[0];
  const u = (t - a[0]) / h;
  const u2 = u * u,
    u3 = u2 * u;
  const h00 = 2 * u3 - 3 * u2 + 1,
    h10 = u3 - 2 * u2 + u,
    h01 = -2 * u3 + 3 * u2,
    h11 = u3 - u2;
  const pk = keys[k - 1],
    nk = keys[k + 2];
  for (let i = 0; i < n; i++) {
    const i1 = i + 1;
    const d = (b[i1] - a[i1]) / h;
    let m0 = 0,
      m1 = 0;
    if (pk) {
      const d0 = (a[i1] - pk[i1]) / (a[0] - pk[0]);
      m0 = d0 * d > 0 ? 2 / (1 / d0 + 1 / d) : 0;
    }
    if (nk) {
      const d1 = (nk[i1] - b[i1]) / (nk[0] - b[0]);
      m1 = d1 * d > 0 ? 2 / (1 / d + 1 / d1) : 0;
    }
    out[i] = h00 * a[i1] + h10 * h * m0 + h01 * b[i1] + h11 * h * m1;
  }
  return out;
}
const Z6 = [0, 0, 0, 0, 0, 0];
const K = (t, ...v) => [t, ...v];
const add6 = (a, b) => a.map((v, i) => v + (b[i] || 0));

// ======================================================================================
// Per-weapon view configuration + animation scripts
// gun keys: view-space offsets [px,py,pz (m), rx,ry,rz (rad)] ; part keys: parent-space [mm, rad]
// L/R: [[startTime, blendDur, anchorName], ...]
// ======================================================================================

const SPRINT_RIFLE = { p: [-0.06, -0.035, 0.03], r: [-0.3, 0.8, 0.45] };
const SPRINT_PISTOL = { p: [-0.03, -0.025, 0.04], r: [-0.42, 0.38, 0.28] };
const VIEW = {
  m1911: {
    hip: [0.128, -0.132, -0.38],
    rot: [0.02, 0.07, 0],
    ads: 0.44,
    sprint: SPRINT_PISTOL,
    flash: 1.0,
  },
  kar98k: {
    hip: [0.135, -0.155, -0.3],
    rot: [0.06, 0.035, 0],
    ads: 0.42,
    sprint: SPRINT_RIFLE,
    flash: 1.15,
  },
  trench: {
    hip: [0.135, -0.152, -0.3],
    rot: [0.06, 0.035, 0],
    ads: 0.4,
    sprint: SPRINT_RIFLE,
    flash: 1.45,
  },
  mp40: {
    hip: [0.13, -0.14, -0.3],
    rot: [0.06, 0.035, 0],
    ads: 0.23,
    sprint: SPRINT_RIFLE,
    flash: 0.9,
  },
  thompson: {
    hip: [0.13, -0.148, -0.3],
    rot: [0.06, 0.035, 0],
    ads: 0.22,
    sprint: SPRINT_RIFLE,
    flash: 0.95,
  },
  stg44: {
    hip: [0.135, -0.15, -0.3],
    rot: [0.06, 0.035, 0],
    ads: 0.34,
    sprint: SPRINT_RIFLE,
    flash: 1.05,
  },
  mg42: {
    hip: [0.145, -0.165, -0.3],
    rot: [0.06, 0.035, 0],
    ads: 0.42,
    sprint: SPRINT_RIFLE,
    flash: 1.25,
  },
  aether: {
    hip: [0.128, -0.132, -0.38],
    rot: [0.02, 0.07, 0],
    ads: 0.42,
    sprint: SPRINT_PISTOL,
    flash: 0.9,
  },
};

// view-space anchors for hands (frames in metres, shapes above)
const VIEW_ANCHORS = {
  pouchL: {
    p: [-0.2, -0.42, -0.2],
    r: [0.3, 0, 1.2],
    shape: { ...FIST, mirror: true },
  },
  pouchR: { p: [0.26, -0.42, -0.12], r: [0.3, 0, -1.2], shape: FIST },
};

function magScripts(o) {
  // generic detachable box-magazine reload (tactical + empty w/ charging handle)
  const G0 = o.pose;
  const tac = {
    dur: o.dur,
    commit: o.seat,
    events: [
      [o.out + 0.02, "mag_out"],
      [o.seat - 0.02, "mag_in"],
    ],
    gun: [
      K(0, ...Z6),
      K(0.28, ...G0),
      K(o.out + 0.04, ...add6(G0, [0, -0.006, 0, -0.02])),
      K(o.out + 0.2, ...G0),
      K(o.seat - 0.06, ...G0),
      K(o.seat + 0.02, ...add6(G0, [0, 0.008, 0, 0.035])),
      K(o.seat + 0.12, ...G0),
      K(o.dur, ...Z6),
    ],
    parts: { mag: o.magKeys(o.out, o.seat) },
    L: [
      [0.16, 0.2, "hL_mag"],
      [o.seat + 0.06, 0.26, "hL"],
    ],
  };
  if (!o.charge) return { reload: tac };
  const c = o.charge; // {pose, grab, pull, rel?, rest, back, fwd?}
  const E = o.durEmpty;
  const emp = {
    dur: E,
    commit: o.seat,
    events: [
      ...tac.events,
      [c.pull - 0.02, "bolt_back"],
      ...(c.rel ? [[c.rel - 0.02, "bolt_forward"]] : []),
    ],
    gun: [
      ...tac.gun.slice(0, -1),
      K(c.grab, ...c.pose),
      K(c.pull + 0.02, ...add6(c.pose, [0, -0.005, 0.01, -0.02])),
      K((c.rel || c.pull) + 0.12, ...c.pose),
      K(E, ...Z6),
    ],
    parts: {
      mag: tac.parts.mag,
      charge: c.rel
        ? [
            K(0, 0, 0, 0, 0, 0, 0),
            K(c.pull - 0.14, 0, 0, 0, 0, 0, 0),
            K(c.pull, c.back, 0, 0, 0, 0, 0),
            K(c.rel, 0, 0, 0, 0, 0, 0),
          ]
        : [
            K(0, c.fwd, 0, 0, 0, 0, 0),
            K(c.pull - 0.14, c.fwd, 0, 0, 0, 0, 0),
            K(c.pull, 0, 0, 0, 0, 0, 0),
          ],
    },
    L:
      c.hand === "R"
        ? tac.L
        : [
            [0.16, 0.2, "hL_mag"],
            [o.seat + 0.06, 0.2, "hL_charge"],
            [(c.rel || c.pull) + 0.1, 0.28, "hL"],
          ],
    R:
      c.hand === "R"
        ? [
            [c.grab - 0.12, 0.22, "hR_charge"],
            [(c.rel || c.pull) + 0.1, 0.28, "hR"],
          ]
        : undefined,
  };
  return { reload: tac, reload_empty: emp };
}

const DROP = (dx, dy, dz, r) => [dx, dy, dz, r, 0, r * 0.6];
function stickMagKeys(off) {
  return (out, seat) => [
    K(0, 0, 0, 0, 0, 0, 0),
    K(out - 0.08, 0, 0, 0, 0, 0, 0),
    K(out + 0.06, 0, -38, 0, 0, 0, 0),
    K(out + 0.26, -20, -150, -10, 0, 0, 0.25),
    K(out + 0.55, -80, -430, -90, 0.3, 0, 0.5),
    K(seat - 0.42, -80, -430, -90, 0.3, 0, 0.5),
    K(seat - 0.16, -6, -70 - off, -4, 0, 0, 0.06),
    K(seat - 0.05, 0, -12, 0, 0, 0, 0),
    K(seat, 0, 0, 0, 0, 0, 0),
  ];
}

