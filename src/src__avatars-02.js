// src__avatars 02 — base
// Lines 366-613 of readable/src__avatars.pretty.js (statement-aligned).
const BONES = [
  "hips",
  "spine",
  "chest",
  "neck",
  "head",
  "clavL",
  "uaL",
  "faL",
  "twL",
  "handL",
  "clavR",
  "uaR",
  "faR",
  "twR",
  "handR",
  "thL",
  "shL",
  "ftL",
  "toeL",
  "thR",
  "shR",
  "ftR",
  "toeR",
];
const FINGER_NAMES = ["th", "ix", "md", "rg", "pk"];
for (const s of ["L", "R"])
  for (const f of FINGER_NAMES)
    for (let k = 0; k < 3; k++) BONES.push(f + k + s);
const B = Object.fromEntries(BONES.map((n, i) => [n, i]));
const NB = BONES.length;
const PARENT = BONES.map((n) => {
  switch (n) {
    case "hips":
      return -1;
    case "spine":
      return B.hips;
    case "chest":
      return B.spine;
    case "neck":
      return B.chest;
    case "head":
      return B.neck;
    case "clavL":
    case "clavR":
      return B.chest;
    case "uaL":
      return B.clavL;
    case "faL":
      return B.uaL;
    case "twL":
      return B.faL;
    case "handL":
      return B.twL;
    case "uaR":
      return B.clavR;
    case "faR":
      return B.uaR;
    case "twR":
      return B.faR;
    case "handR":
      return B.twR;
    case "thL":
    case "thR":
      return B.hips;
    case "shL":
      return B.thL;
    case "ftL":
      return B.shL;
    case "toeL":
      return B.ftL;
    case "shR":
      return B.thR;
    case "ftR":
      return B.shR;
    case "toeR":
      return B.ftR;
    default: {
      const side = n[n.length - 1],
        k = +n[2];
      return k === 0 ? B["hand" + side] : B[n.slice(0, 2) + (k - 1) + side];
    }
  }
});

const ARM_A = 0.3; // bind-pose arm abduction (rad)
const SIDE = { L: 1, R: -1 };
const ADIR_L = new V3(Math.sin(ARM_A), -Math.cos(ARM_A), 0),
  ADIR_R = new V3(-Math.sin(ARM_A), -Math.cos(ARM_A), 0);
const ADIR = (s) => (s > 0 ? ADIR_L : ADIR_R).clone();
/** rest hand frame: F wrist->knuckles, T thumb side (forward), P palm normal (toward the body) */
function handRest(s) {
  const F = ADIR(s),
    T = new V3(0, 0, 1);
  const P = s < 0 ? new V3().crossVectors(T, F) : new V3().crossVectors(F, T);
  return { F, T, P: P.normalize() };
}
const HR = { L: handRest(1), R: handRest(-1) };
// finger layout in the hand frame (f along F, t along T, p along P), metres at hand scale 1
const FING = {
  th: {
    base: [0.024, 0.024, 0.012],
    dir: [0.62, 0.72, 0.3],
    len: [0.042, 0.033, 0.027],
    rad: [0.0125, 0.0112, 0.0098],
  },
  ix: {
    base: [0.093, 0.027, 0.002],
    dir: [1, 0.05, 0],
    len: [0.043, 0.025, 0.021],
    rad: [0.0098, 0.0091, 0.0083],
  },
  md: {
    base: [0.096, 0.007, 0.001],
    dir: [1, 0, 0],
    len: [0.047, 0.029, 0.022],
    rad: [0.0101, 0.0094, 0.0085],
  },
  rg: {
    base: [0.091, -0.013, 0.001],
    dir: [1, -0.04, 0],
    len: [0.044, 0.027, 0.021],
    rad: [0.0094, 0.0088, 0.0079],
  },
  pk: {
    base: [0.081, -0.031, 0.003],
    dir: [1, -0.1, 0],
    len: [0.035, 0.021, 0.019],
    rad: [0.0084, 0.0078, 0.007],
  },
};
function hf(s, f, t, p, out = new V3()) {
  // hand-frame coords -> bind-space offset
  const H = s > 0 ? HR.L : HR.R;
  return out
    .set(0, 0, 0)
    .addScaledVector(H.F, f)
    .addScaledVector(H.T, t)
    .addScaledVector(H.P, p);
}

/** bind positions for a character (before height scaling) */
function restPositions(C) {
  const p = new Array(NB);
  const sw = C.shoulder,
    hw = C.hip;
  p[B.hips] = new V3(0, 0.975, -0.005);
  p[B.spine] = new V3(0, 1.085, -0.012);
  p[B.chest] = new V3(0, 1.26, -0.008);
  p[B.neck] = new V3(0, 1.49, -0.018);
  p[B.head] = new V3(0, 1.585, -0.008);
  for (const S of ["L", "R"]) {
    const s = SIDE[S],
      d = ADIR(s);
    p[B["clav" + S]] = new V3(0.028 * s, 1.44, 0.03);
    const sh = new V3(0.182 * sw * s, 1.438, -0.012);
    p[B["ua" + S]] = sh;
    p[B["fa" + S]] = sh.clone().addScaledVector(d, 0.295);
    p[B["tw" + S]] = sh.clone().addScaledVector(d, 0.43);
    const wr = sh.clone().addScaledVector(d, 0.555);
    p[B["hand" + S]] = wr;
    const hs = C.hand;
    for (const fn of FINGER_NAMES) {
      const fd = FING[fn];
      const base = wr
        .clone()
        .add(hf(s, fd.base[0] * hs, fd.base[1] * hs, fd.base[2] * hs));
      const dir = hf(s, fd.dir[0], fd.dir[1], fd.dir[2]).normalize();
      let q = base.clone();
      for (let k = 0; k < 3; k++) {
        p[B[fn + k + S]] = q.clone();
        q.addScaledVector(dir, fd.len[k] * hs);
      }
    }
    const hx = 0.092 * hw * s;
    p[B["th" + S]] = new V3(hx, 0.93, 0.0);
    p[B["sh" + S]] = new V3(hx, 0.505, 0.008);
    p[B["ft" + S]] = new V3(hx, 0.085, -0.012);
    p[B["toe" + S]] = new V3(hx, 0.028, 0.138);
  }
  return p;
}

// ====================================================================================== geometry kit
const _p = new V3(),
  _n = new V3();
function posKey(x, y, z) {
  return `${Math.round(x * 3e4)},${Math.round(y * 3e4)},${Math.round(z * 3e4)}`;
}
function fixSeams(geo) {
  // average normals of coincident vertices (loft seams, caps)
  const P = geo.attributes.position,
    N = geo.attributes.normal,
    map = new Map();
  for (let i = 0; i < P.count; i++) {
    const k = posKey(P.getX(i), P.getY(i), P.getZ(i));
    let a = map.get(k);
    if (!a) map.set(k, (a = []));
    a.push(i);
  }
  for (const a of map.values()) {
    if (a.length < 2) continue;
    let x = 0,
      y = 0,
      z = 0;
    for (const i of a) {
      x += N.getX(i);
      y += N.getY(i);
      z += N.getZ(i);
    }
    const l = Math.hypot(x, y, z) || 1;
    for (const i of a) N.setXYZ(i, x / l, y / l, z / l);
  }
}
function packW(w, si, sw) {
  if (typeof w === "number") {
    si.push(w, 0, 0, 0);
    sw.push(1, 0, 0, 0);
    return;
  }
  const L = w
    .filter((e) => e[1] > 1e-4)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4);
  let s = 0;
  for (const e of L) s += e[1];
  if (!L.length) {
    si.push(0, 0, 0, 0);
    sw.push(1, 0, 0, 0);
    return;
  }
  for (let i = 0; i < 4; i++) {
    const e = L[i];
    si.push(e ? e[0] : 0);
    sw.push(e ? e[1] / s : 0);
  }
}
/** weight blend helper: blend from bone a to bone b as t goes 0..1 */
const wb = (a, b, t) =>
  t <= 0
    ? a
    : t >= 1
      ? b
      : [
          [a, 1 - t],
          [b, t],
        ];

