// UNBURIED — avatars.js
// Third-person co-op teammates. Four original, procedurally built WWII characters (one skinned mesh
// per material bucket sharing a 53-bone skeleton: spine chain, clavicles, twist forearms, 3-bone
// fingers, toes). Everything is procedural animation:
//   * distance-driven stepping gait with world-space foot locking (no sliding in any direction),
//     Raibert-style foot placement, heel-strike / toe-off, turn-in-place steps, jump / land dip
//   * aim pitch + yaw distributed through hips -> spine -> chest -> neck -> head, bladed rifle stance
//   * the real weapon model (LOD'd copy of buildWeaponModel) in the shoulder pocket / cheek weld,
//     two-bone IK arms solved onto the gun's grips with forearm twist, finger curls per grip
//   * per-weapon-class reload gestures that move the real mag / bolt / pump / belt parts, knife,
//     grenade throw, perk drink, weapon swap, recoil springs, pooled muzzle light + flash
//   * downed (propped on an elbow, pistol up, crawling), reviving (kneel, hand out), revived get-up
// Owner: avatar agent. Only contract APIs of other modules are used (T.mat / T.tex,
// buildWeaponModel(id, T, upgraded).userData.grips, optional fx / audio).
//
// API (docs/CONTRACT-COOP.md):
//   const avatars = new AvatarManager({ scene, T, buildWeaponModel, fx?, audio?, footsteps = true, lights = 2 })
//   avatars.add(id, { name, slot })        slot 0..3 -> Cole / Alfie / Yuri / Élodie (geometry built lazily, cached)
//   avatars.remove(id) ; has(id) ; setVisible(id, bool)
//   avatars.setState(id, { pos /*feet*/, yaw, pitch, vel {x,z}, grounded, crouching, sprinting, ads, reloading,
//                          downed, reviving, beingRevived?, weaponId, upgraded, alive })   any subset; call per tick
//   avatars.event(id, 'fire'|'reload'|'knife'|'grenade'|'swap'|'drink'|'hurt'|'revived', data)
//   avatars.getMuzzle(id, out) ; avatars.getHead(id, out)       world space
//   avatars.update(dt, camera) ; avatars.prewarm(slots?, weaponIds?) ; avatars.stats() ; avatars.dispose()
// yaw / pitch use the player's convention (forward = (-sin yaw, 0, -cos yaw), +pitch looks up). Positions are
// smoothed + extrapolated internally, so 20-30 Hz snapshots are fine. Muzzle lights are a fixed pool created in
// the constructor (never added / removed later). Footstep sounds use audio.play('footstep_concrete', {position})
// unless footsteps:false.
import * as THREE from "three";

const V3 = THREE.Vector3,
  Q4 = THREE.Quaternion,
  M4 = THREE.Matrix4;
const PI = Math.PI,
  TAU = PI * 2;
const TILE = 0.3;
const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (t) => {
  t = clamp(t, 0, 1);
  return t * t * (3 - 2 * t);
};
const sstep = (a, b, x) => smooth((x - a) / (b - a));
const damp = (a, b, k, dt) => a + (b - a) * (1 - Math.exp(-k * dt));
const wrapA = (a) => {
  a = (a + PI) % TAU;
  if (a < 0) a += TAU;
  return a - PI;
};
const dampA = (a, b, k, dt) => a + wrapA(b - a) * (1 - Math.exp(-k * dt));
const gauss = (x, s) => Math.exp(-(x * x) / (2 * s * s));
const bell = (t, a, b, c, d) => sstep(a, b, t) * (1 - sstep(c, d, t)); // 0 -> 1 (a..b) hold -> 0 (c..d)
const srgb = (c) => c.map((v) => Math.pow(v, 2.2));
const mix3 = (a, b, t) => [
  lerp(a[0], b[0], t),
  lerp(a[1], b[1], t),
  lerp(a[2], b[2], t),
];
const mul3 = (a, s) => [a[0] * s, a[1] * s, a[2] * s];

function hash3(ix, iy, iz, s) {
  let h =
    Math.imul(ix, 374761393) ^
    Math.imul(iy, 668265263) ^
    Math.imul(iz, 1274126177) ^
    Math.imul(s + 7, 1442695041);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967295;
}
function vnoise(x, y, z, s = 0) {
  const ix = Math.floor(x),
    iy = Math.floor(y),
    iz = Math.floor(z);
  const fx = x - ix,
    fy = y - iy,
    fz = z - iz;
  const u = fx * fx * (3 - 2 * fx),
    v = fy * fy * (3 - 2 * fy),
    w = fz * fz * (3 - 2 * fz);
  const a = lerp(hash3(ix, iy, iz, s), hash3(ix + 1, iy, iz, s), u);
  const b = lerp(hash3(ix, iy + 1, iz, s), hash3(ix + 1, iy + 1, iz, s), u);
  const c = lerp(hash3(ix, iy, iz + 1, s), hash3(ix + 1, iy, iz + 1, s), u);
  const d = lerp(
    hash3(ix, iy + 1, iz + 1, s),
    hash3(ix + 1, iy + 1, iz + 1, s),
    u,
  );
  return lerp(lerp(a, b, v), lerp(c, d, v), w);
}
function fbm(x, y, z, s = 0, o = 3) {
  let a = 0,
    amp = 0.5,
    f = 1,
    n = 0;
  for (let i = 0; i < o; i++) {
    a += amp * vnoise(x * f, y * f, z * f, s + i * 13);
    n += amp;
    f *= 2.07;
    amp *= 0.5;
  }
  return a / n;
}
function mulberry(seed) {
  let s = seed >>> 0 || 1;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// scratch objects
const _v1 = new V3(),
  _v2 = new V3(),
  _v3 = new V3(),
  _v4 = new V3(),
  _v5 = new V3(),
  _v6 = new V3();
const _q1 = new Q4(),
  _q2 = new Q4(),
  _q3 = new Q4();
const _m1 = new M4(),
  _m2 = new M4();
const AX = new V3(1, 0, 0),
  AY = new V3(0, 1, 0),
  AZ = new V3(0, 0, 1);
const _e = new THREE.Euler();

/** world-space bone orientation from yaw (about +Y), fwd pitch (+ tilts +Y toward +Z), roll (about +Z) */
function qYPR(out, yaw, pitch, roll = 0) {
  _e.set(pitch, yaw, roll, "YXZ");
  return out.setFromEuler(_e);
}
function qFromBasis(out, x, y, z) {
  _m1.makeBasis(x, y, z);
  return out.setFromRotationMatrix(_m1);
}
/** quaternion rotating frame (a0 primary, s0 secondary) onto (a1, s1) — exact on the primary axis */
const _qa = [
  new V3(),
  new V3(),
  new V3(),
  new V3(),
  new V3(),
  new V3(),
  new V3(),
  new V3(),
];
const _qm1 = new M4(),
  _qm2 = new M4(),
  _qq = new Q4();
function qAlign(out, a0, s0, a1, s1) {
  const A0 = _qa[0].copy(a0),
    S0 = _qa[1].copy(s0),
    A1 = _qa[2].copy(a1),
    S1 = _qa[3].copy(s1);
  const e1 = A0.normalize(),
    e3 = _qa[4].crossVectors(e1, S0).normalize(),
    e2 = _qa[5].crossVectors(e3, e1);
  _qm1.makeBasis(e1, e2, e3);
  const f1 = A1.normalize(),
    f3 = _qa[6].crossVectors(f1, S1);
  if (f3.lengthSq() < 1e-10)
    f3.copy(e3).applyQuaternion(_qq.setFromUnitVectors(e1, f1));
  f3.normalize();
  const f2 = _qa[7].crossVectors(f3, f1);
  _qm2.makeBasis(f1, f2, f3);
  _qm1.transpose();
  _qm2.multiply(_qm1);
  return out.setFromRotationMatrix(_qm2);
}
function qAxis(out, axis, ang) {
  return out.setFromAxisAngle(axis, ang);
}
function keyf(t, ks) {
  // smooth scalar keyframes [[t, v], ...]
  if (t <= ks[0][0]) return ks[0][1];
  for (let i = 1; i < ks.length; i++) {
    if (t <= ks[i][0]) {
      const a = ks[i - 1],
        b = ks[i];
      return lerp(a[1], b[1], smooth((t - a[0]) / (b[0] - a[0] || 1)));
    }
  }
  return ks[ks.length - 1][1];
}

// ====================================================================================== characters
// No national / political insignia anywhere — plain buttons, plain buckles, no badges.
export const CHARACTERS = [
  {
    key: "cole",
    name: "Pvt. Cole Harlan",
    nation: "US",
    height: 1.8,
    female: false,
    shoulder: 1.0,
    hip: 1.0,
    girth: 1.0,
    hand: 1.0,
    seed: 11,
    skin: [0.8, 0.6, 0.47],
    hair: [0.25, 0.17, 0.11],
    iris: [0.36, 0.47, 0.58],
    brow: [0.2, 0.14, 0.09],
    face: {
      width: 1.0,
      jaw: 1.07,
      chin: 1.1,
      nose: 1.0,
      noseW: 1.0,
      brow: 1.0,
      cheek: 1.0,
      lips: 0.9,
      stubble: 0.24,
      mustache: 0,
      age: 0.2,
      ears: 1.0,
    },
    top: "shirt",
    topCol: [0.47, 0.41, 0.28],
    trouserCol: [0.4, 0.36, 0.26],
    legwear: "leggings",
    legCol: [0.62, 0.57, 0.42],
    boot: "low",
    bootCol: [0.42, 0.27, 0.16],
    head: "m1",
    headCol: [0.33, 0.34, 0.23],
    webCol: [0.55, 0.51, 0.37],
    gear: "m1936",
  },
  {
    key: "alfie",
    name: "Sgt. Alfie Marsh",
    nation: "UK",
    height: 1.76,
    female: false,
    shoulder: 0.98,
    hip: 1.0,
    girth: 0.97,
    hand: 1.0,
    seed: 23,
    skin: [0.84, 0.6, 0.49],
    hair: [0.43, 0.31, 0.19],
    iris: [0.33, 0.25, 0.15],
    brow: [0.36, 0.25, 0.15],
    face: {
      width: 0.96,
      jaw: 0.96,
      chin: 1.0,
      nose: 1.15,
      noseW: 0.95,
      brow: 1.05,
      cheek: 0.9,
      lips: 0.8,
      stubble: 0.16,
      mustache: 1,
      age: 0.6,
      ears: 1.08,
    },
    top: "battledress",
    topCol: [0.46, 0.38, 0.24],
    trouserCol: [0.44, 0.37, 0.24],
    legwear: "anklets",
    legCol: [0.56, 0.53, 0.4],
    boot: "low",
    bootCol: [0.09, 0.08, 0.07],
    head: "brodie",
    headCol: [0.34, 0.34, 0.25],
    webCol: [0.56, 0.54, 0.4],
    gear: "p37",
  },
  {
    key: "yuri",
    name: "Cpl. Yuri Volkov",
    nation: "SU",
    height: 1.83,
    female: false,
    shoulder: 1.04,
    hip: 1.02,
    girth: 1.05,
    hand: 1.04,
    seed: 37,
    skin: [0.83, 0.64, 0.52],
    hair: [0.56, 0.43, 0.28],
    iris: [0.45, 0.49, 0.5],
    brow: [0.42, 0.32, 0.2],
    face: {
      width: 1.06,
      jaw: 1.1,
      chin: 1.0,
      nose: 0.95,
      noseW: 1.12,
      brow: 1.15,
      cheek: 1.2,
      lips: 0.9,
      stubble: 0.32,
      mustache: 0,
      age: 0.35,
      ears: 1.0,
    },
    top: "gymnastyorka",
    topCol: [0.56, 0.52, 0.37],
    trouserCol: [0.4, 0.38, 0.28],
    legwear: "tallboots",
    legCol: [0.08, 0.07, 0.06],
    boot: "tall",
    bootCol: [0.08, 0.07, 0.06],
    head: "pilotka",
    headCol: [0.53, 0.49, 0.34],
    webCol: [0.4, 0.25, 0.15],
    gear: "soviet",
  },
  {
    key: "elodie",
    name: "Élodie Fournier",
    nation: "FR",
    height: 1.72,
    female: true,
    shoulder: 0.9,
    hip: 1.03,
    girth: 0.88,
    hand: 0.9,
    seed: 51,
    skin: [0.86, 0.67, 0.56],
    hair: [0.32, 0.16, 0.09],
    iris: [0.33, 0.44, 0.3],
    brow: [0.26, 0.14, 0.08],
    face: {
      width: 0.93,
      jaw: 0.86,
      chin: 0.9,
      nose: 0.85,
      noseW: 0.85,
      brow: 0.7,
      cheek: 1.1,
      lips: 1.25,
      stubble: 0,
      mustache: 0,
      age: 0.1,
      ears: 0.9,
      lipCol: [0.62, 0.3, 0.29],
    },
    top: "leather",
    topCol: [0.4, 0.25, 0.15],
    trouserCol: [0.25, 0.25, 0.27],
    legwear: "none",
    legCol: [0.25, 0.25, 0.27],
    boot: "ankle",
    bootCol: [0.23, 0.15, 0.1],
    head: "beret",
    headCol: [0.11, 0.12, 0.15],
    webCol: [0.5, 0.44, 0.32],
    scarfCol: [0.56, 0.14, 0.12],
    shirtCol: [0.78, 0.73, 0.62],
    gear: "resistance",
  },
];

// ====================================================================================== skeleton
// Bind pose: faces +Z, character's LEFT is +X, feet at y = 0, arms in a 17° A-pose, identity bone
// rest rotations (so a bone's world quaternion is simply "how far it turned from the bind pose").
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

class Acc {
  constructor() {
    this.b = Object.create(null);
    this.tris = 0;
  }
  add(bucket, geo, o = {}) {
    if (!geo.index) {
      const a = [];
      for (let i = 0; i < geo.attributes.position.count; i++) a.push(i);
      geo.setIndex(a);
    }
    let P = geo.attributes.position;
    if (o.pre)
      for (let i = 0; i < P.count; i++) {
        _p.fromBufferAttribute(P, i);
        o.pre(_p, i);
        P.setXYZ(i, _p.x, _p.y, _p.z);
      }
    if (o.m) geo.applyMatrix4(o.m);
    P = geo.attributes.position;
    if (o.post)
      for (let i = 0; i < P.count; i++) {
        _p.fromBufferAttribute(P, i);
        o.post(_p, i);
        P.setXYZ(i, _p.x, _p.y, _p.z);
      }
    if (!o.keepNormals || !geo.attributes.normal) {
      geo.computeVertexNormals();
      if (o.seams !== false) fixSeams(geo);
    }
    if (o.flip) {
      const I = geo.index.array;
      for (let k = 0; k < I.length; k += 3) {
        const t = I[k + 1];
        I[k + 1] = I[k + 2];
        I[k + 2] = t;
      }
      const N = geo.attributes.normal;
      for (let i = 0; i < N.count; i++)
        N.setXYZ(i, -N.getX(i), -N.getY(i), -N.getZ(i));
    }
    const N = geo.attributes.normal,
      UV = geo.attributes.uv;
    const Bk =
      this.b[bucket] ||
      (this.b[bucket] = {
        p: [],
        n: [],
        uv: [],
        c: [],
        si: [],
        sw: [],
        ix: [],
      });
    const base = Bk.p.length / 3,
      us = o.uvScale || 1;
    for (let i = 0; i < P.count; i++) {
      _p.fromBufferAttribute(P, i);
      _n.fromBufferAttribute(N, i);
      Bk.p.push(_p.x, _p.y, _p.z);
      Bk.n.push(_n.x, _n.y, _n.z);
      if (bucket === "skin" && !o.keepUV) Bk.uv.push(UV_WHITE[0], UV_WHITE[1]);
      else if (UV && !o.boxUV) Bk.uv.push(UV.getX(i) * us, UV.getY(i) * us);
      else {
        // tri-planar-ish fallback in metres / TILE
        const ax = Math.abs(_n.x),
          ay = Math.abs(_n.y),
          az = Math.abs(_n.z);
        if (ax > ay && ax > az)
          Bk.uv.push((_p.z / TILE) * us, (_p.y / TILE) * us);
        else if (ay > az) Bk.uv.push((_p.x / TILE) * us, (_p.z / TILE) * us);
        else Bk.uv.push((_p.x / TILE) * us, (_p.y / TILE) * us);
      }
      const c =
        typeof o.color === "function"
          ? o.color(_p, _n, i)
          : o.color || [1, 1, 1];
      Bk.c.push(c[0], c[1], c[2]);
      packW(typeof o.w === "function" ? o.w(_p, i) : (o.w ?? 0), Bk.si, Bk.sw);
    }
    const I = geo.index.array;
    for (let k = 0; k < I.length; k++) Bk.ix.push(base + I[k]);
    this.tris += I.length / 3;
    geo.dispose();
  }
  finish(scale) {
    const out = {};
    for (const k in this.b) {
      const Bk = this.b[k],
        g = new THREE.BufferGeometry();
      const P = new Float32Array(Bk.p);
      if (scale !== 1) for (let i = 0; i < P.length; i++) P[i] *= scale;
      g.setAttribute("position", new THREE.BufferAttribute(P, 3));
      g.setAttribute("normal", new THREE.Float32BufferAttribute(Bk.n, 3));
      g.setAttribute("uv", new THREE.Float32BufferAttribute(Bk.uv, 2));
      g.setAttribute("color", new THREE.Float32BufferAttribute(Bk.c, 3));
      g.setAttribute("skinIndex", new THREE.Uint16BufferAttribute(Bk.si, 4));
      g.setAttribute("skinWeight", new THREE.Float32BufferAttribute(Bk.sw, 4));
      g.setIndex(
        Bk.p.length / 3 > 65535
          ? new THREE.Uint32BufferAttribute(Bk.ix, 1)
          : new THREE.Uint16BufferAttribute(Bk.ix, 1),
      );
      g.computeBoundingBox();
      g.boundingSphere = new THREE.Sphere(
        new V3(0, 0.9 * scale, 0),
        1.35 * scale,
      );
      out[k] = g;
    }
    return out;
  }
}

/**
 * Generic ring loft. ring = { c: V3 centre, ax: V3 (theta = 90° side), az: V3 (theta = 0 "front"),
 *   rx, rz, rzb? (radius toward -az), p? (superellipse exponent, 2 = ellipse), dr?(th) radial add }
 */
function loft(rings, seg, o = {}) {
  const pos = [],
    uv = [],
    idx = [];
  const n = rings.length,
    cols = seg + 1;
  const r0 = rings[Math.min(1, n - 1)];
  const uRep = o.uRep ?? Math.max(1, Math.round((PI * (r0.rx + r0.rz)) / TILE));
  const th0 = o.th0 || 0,
    thSpan = o.thSpan || TAU;
  for (let i = 0; i < n; i++) {
    const R = rings[i],
      e = 2 / (R.p || 2),
      back = R.rzb ?? R.rz;
    for (let j = 0; j <= seg; j++) {
      const th = th0 + (j / seg) * thSpan,
        s = Math.sin(th),
        c = Math.cos(th);
      const dr = R.dr ? R.dr(th) : 0;
      const sx = Math.sign(s) * Math.pow(Math.abs(s), e),
        sz = Math.sign(c) * Math.pow(Math.abs(c), e);
      const rx = R.rx + dr,
        rz = (c >= 0 ? R.rz : back) + dr;
      const ly = R.dy ? R.dy * (1 - c) * 0.5 : 0;
      pos.push(
        R.c.x + R.ax.x * sx * rx + R.az.x * sz * rz,
        R.c.y + R.ax.y * sx * rx + R.az.y * sz * rz + ly,
        R.c.z + R.ax.z * sx * rx + R.az.z * sz * rz,
      );
    }
  }
  const vcol = new Float32Array(cols);
  for (let i = 0; i < n; i++)
    for (let j = 0; j <= seg; j++) {
      const k = (i * cols + j) * 3;
      if (i > 0) {
        const q = k - cols * 3;
        vcol[j] += Math.hypot(
          pos[k] - pos[q],
          pos[k + 1] - pos[q + 1],
          pos[k + 2] - pos[q + 2],
        );
      }
      uv.push((j / seg) * uRep, vcol[j] / TILE);
    }
  for (let i = 0; i < n - 1; i++)
    for (let j = 0; j < seg; j++) {
      const a = i * cols + j,
        b = a + 1,
        c = a + cols,
        d = c + 1;
      if (o.flip) idx.push(a, d, b, a, c, d);
      else idx.push(a, b, d, a, d, c);
    }
  const cap = (ri, top) => {
    const R = rings[ri],
      ci = pos.length / 3;
    const pc = o.capPull
      ? R.c.clone().addScaledVector(o.capPull, top ? 1 : -1)
      : R.c;
    pos.push(pc.x, pc.y, pc.z);
    uv.push(0.5, 0.5);
    for (let j = 0; j < seg; j++) {
      const a = ri * cols + j;
      if (top !== !!o.flip) idx.push(ci, a, a + 1);
      else idx.push(ci, a + 1, a);
    }
  };
  if (o.capStart) cap(0, false);
  if (o.capEnd) cap(n - 1, true);
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  return g;
}
/** rings along a straight axis: list of [t, rx, rz, ox?, oz?, p?, rzb?] */
function axisLoft(start, dir, front, list, seg, o = {}) {
  const d = dir.clone().normalize();
  const az = front
    .clone()
    .sub(d.clone().multiplyScalar(front.dot(d)))
    .normalize();
  const ax = new V3().crossVectors(d, az).normalize();
  const rings = list.map((r) => ({
    c: start
      .clone()
      .addScaledVector(d, r[0])
      .addScaledVector(ax, r[3] || 0)
      .addScaledVector(az, r[4] || 0),
    ax,
    az,
    rx: r[1],
    rz: r[2],
    p: r[5] || 2,
    rzb: r[6] ?? r[2],
  }));
  return loft(rings, seg, o);
}
/** insert interpolated rings so consecutive rings are at most maxStep apart (for folds) */
function densify(list, maxStep) {
  const out = [list[0]];
  for (let i = 1; i < list.length; i++) {
    const a = list[i - 1],
      b = list[i],
      n = Math.max(1, Math.ceil(Math.abs(b[0] - a[0]) / maxStep));
    for (let k = 1; k <= n; k++) {
      const t = k / n;
      out.push(
        a.map((v, j) =>
          typeof v === "number" && typeof b[j] === "number"
            ? lerp(v, b[j], t)
            : t < 0.5
              ? v
              : b[j],
        ),
      );
    }
  }
  return out;
}
/** procedural cloth folds: returns radial displacement (m) for a limb/torso parameterisation */
function foldArm(t, th, seed) {
  const inner = 0.5 + 0.5 * Math.cos(th); // elbow crease sits on the front/inner side
  const n = vnoise(t * 40, th * 1.5, seed, 3) - 0.5;
  let d =
    0.0042 *
    gauss(t - 0.29, 0.045) *
    Math.sin(t * 190 + 2.2 * Math.sin(th * 2) + n * 3) *
    (0.35 + 0.65 * inner);
  d += 0.0026 * gauss(t - 0.475, 0.028) * Math.sin(t * 260 + th * 1.5); // cuff bunching
  d +=
    0.0018 *
    Math.sin(t * 70 + th * 3 + n * 4) *
    sstep(0.02, 0.12, t) *
    (1 - sstep(0.22, 0.26, t)); // loose sleeve
  return d;
}
function foldLeg(t, th, seed, blouse) {
  const back = 0.5 - 0.5 * Math.cos(th),
    n = vnoise(t * 30, th * 1.5, seed, 5) - 0.5;
  let d =
    0.0036 *
    gauss(t - 0.46, 0.05) *
    Math.sin(t * 150 + n * 3 + Math.sin(th) * 1.5) *
    (0.3 + 0.7 * back);
  d += 0.0022 * gauss(t - 0.06, 0.05) * Math.sin(t * 110 + th * 2 + n * 3); // hip / crotch pull
  if (blouse > 0)
    d +=
      blouse *
      gauss(t - blouse * 0 - 0.74, 0.05) *
      (0.6 + 0.4 * Math.sin(th * 7 + n * 4));
  d += 0.0014 * Math.sin(t * 45 + th * 2 + n * 5);
  return d;
}
/** tube along a polyline (parallel transport frames); rad = number | (i, u) => r */
function tube(pts, rad, seg = 8, o = {}) {
  const n = pts.length,
    rings = [];
  let prevN = null;
  for (let i = 0; i < n; i++) {
    const t = new V3()
      .subVectors(pts[Math.min(n - 1, i + 1)], pts[Math.max(0, i - 1)])
      .normalize();
    let nn;
    if (!prevN) {
      nn = Math.abs(t.y) < 0.9 ? new V3(0, 1, 0) : new V3(1, 0, 0);
      nn.sub(t.clone().multiplyScalar(nn.dot(t))).normalize();
      if (o.up)
        nn.copy(o.up)
          .sub(t.clone().multiplyScalar(o.up.dot(t)))
          .normalize();
    } else {
      nn = prevN
        .clone()
        .sub(t.clone().multiplyScalar(prevN.dot(t)))
        .normalize();
    }
    prevN = nn;
    const bx = new V3().crossVectors(nn, t).normalize();
    const r = typeof rad === "function" ? rad(i, i / (n - 1)) : rad;
    const rz = o.flat ? r * o.flat : r;
    rings.push({ c: pts[i], ax: bx, az: nn, rx: r, rz, p: o.p || 2 });
  }
  return loft(rings, seg, o);
}
/** flat strap with rectangular section along pts lying on a surface with normals nrm */
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
function headSculpt(C) {
  const F = C.face;
  const rx = 0.0785 * F.width,
    ry = 0.114,
    rz = 0.098;
  const pH = 2.25;
  const e = 2 / pH;
  const noseP = (y) => {
    // nose profile protrusion (m) by height
    const n = F.nose;
    if (y > 0.02) return 0.0015 * sstep(0.036, 0.02, y);
    if (y > -0.027)
      return lerp(0.0015, 0.0275 * n, sstep(0.02, -0.027, y) ** 0.8);
    if (y > -0.049)
      return lerp(0.0275 * n, 0.0035, Math.pow(sstep(-0.027, -0.049, y), 0.7));
    return 0.0035 * sstep(-0.058, -0.049, y);
  };
  const noseW = (y) => lerp(0.005, 0.0086, sstep(0.02, -0.03, y)) * F.noseW;
  return (d, out = new V3()) => {
    const h = Math.hypot(d.x, d.z),
      ph = Math.atan2(d.x, d.z);
    const s = Math.sin(ph),
      c = Math.cos(ph);
    let x = h * rx * Math.sign(s) * Math.pow(Math.abs(s), e);
    let z = h * rz * Math.sign(c) * Math.pow(Math.abs(c), e);
    let y = d.y * ry;
    // cranium fuller at the back-top, flatter crown
    z -= 0.01 * sstep(0.0, -0.08, z) * sstep(-0.04, 0.06, y);
    y -= 0.006 * sstep(0.08, 0.117, y);
    // lower face: longer toward the chin, tapered jaw
    const front = sstep(-0.05, 0.06, z);
    const low = sstep(0.0, -0.105, y);
    if (z > 0) z *= 1 + 0.16 * low * sstep(-0.02, 0.05, z);
    x *= lerp(1, 0.66 * F.jaw, low * front * sstep(-0.04, -0.112, y) * 1.25);
    x *= lerp(1, 0.86, low * (1 - front));
    if (z < 0) z *= lerp(1, 0.62, sstep(-0.03, -0.1, y));
    // facial profile: pull the front of the ellipsoid onto a human face curve (brow, flat mid-face, chin)
    {
      const plane = keyf(y, [
        [-0.122, 0.05],
        [-0.112, 0.068],
        [-0.1, 0.0815],
        [-0.085, 0.0895],
        [-0.06, 0.0932],
        [-0.03, 0.0948],
        [0.0, 0.0955],
        [0.034, 0.097],
        [0.055, 0.09],
        [0.08, 0.078],
      ]);
      const curve = plane - x * x * lerp(6.2, 8.5, sstep(0.0, -0.1, y));
      const m = sstep(0.2, 0.55, d.z) * sstep(0.03, 0.06, curve);
      if (curve > z) z = lerp(z, curve, m);
    }
    // jaw angle + line: full at the gonion, cut in behind/below it so the mandible reads in profile
    x +=
      Math.sign(x) *
      0.0045 *
      F.jaw *
      gauss(y + 0.066, 0.014) *
      gauss(z + 0.0, 0.03);
    const behindJaw = sstep(0.01, -0.03, z) * sstep(-0.06, -0.095, y);
    x *= 1 - 0.14 * behindJaw;
    if (y < -0.085 && z < 0.06)
      y = lerp(y, -0.085 - (y + 0.085) * 0.45, sstep(0.06, 0.0, z) * 0.8);
    // face features (front surface only)
    const fz = sstep(0.035, 0.075, z),
      ax = Math.abs(x);
    let dz = 0;
    dz -=
      0.0115 * gauss(ax - 0.033 * F.width, 0.0135) * gauss(y - 0.013, 0.0095); // eye sockets
    dz += 0.0062 * F.brow * gauss(y - 0.034, 0.0075) * gauss(ax - 0.028, 0.02); // brow ridge
    dz += 0.0045 * gauss(x, 0.013) * gauss(y - 0.031, 0.009); // glabella
    dz += noseP(y) * gauss(x, noseW(y)); // nose
    dz +=
      0.0062 * gauss(ax - 0.0138 * F.noseW, 0.005) * gauss(y + 0.036, 0.0062); // alae
    dz += 0.005 * F.cheek * gauss(ax - 0.046, 0.012) * gauss(y + 0.002, 0.011); // cheekbones
    dz -= 0.0028 * F.age * gauss(ax - 0.04, 0.011) * gauss(y + 0.04, 0.011); // cheek hollow

    dz += 0.0024 * F.lips * gauss(x, 0.0165) * gauss(y + 0.0565, 0.0042); // upper lip
    dz += 0.0028 * F.lips * gauss(x, 0.0155) * gauss(y + 0.0705, 0.0048); // lower lip
    dz -= 0.0032 * gauss(x, 0.02) * gauss(y + 0.0632, 0.0016); // mouth line
    dz -= 0.0022 * gauss(ax - 0.022, 0.0035) * gauss(y + 0.0635, 0.004); // corners
    dz -= 0.0022 * gauss(x, 0.012) * gauss(y + 0.083, 0.005); // under lip
    dz += 0.0062 * F.chin * gauss(x, 0.017) * gauss(y + 0.096, 0.0105); // chin

    z += dz * fz;
    x +=
      Math.sign(x) *
      0.0042 *
      F.cheek *
      gauss(ax - 0.05, 0.012) *
      gauss(y + 0.004, 0.014) *
      fz;
    x -= Math.sign(x) * 0.0042 * gauss(y - 0.03, 0.018) * gauss(z - 0.05, 0.02); // temples
    return out.set(x, y, z);
  };
}
/** surface point of the sculpt nearest to the head-local (x, y) on the front */
function sculptFront(sc, x, y) {
  let best = null,
    bd = 1e9;
  const d = new V3(),
    p = new V3();
  for (let i = 0; i <= 40; i++)
    for (let j = 0; j <= 40; j++) {
      const u = -1.3 + (2.6 * i) / 40,
        v = -1.2 + (2.4 * j) / 40;
      d.set(Math.sin(u) * Math.cos(v), Math.sin(v), Math.cos(u) * Math.cos(v));
      sc(d, p);
      const dd = (p.x - x) ** 2 + (p.y - y) ** 2;
      if (p.z > 0 && dd < bd) {
        bd = dd;
        best = { dir: d.clone(), p: p.clone() };
      }
    }
  // refine
  for (let it = 0; it < 30; it++) {
    for (const [du, dv] of [
      [0.004, 0],
      [-0.004, 0],
      [0, 0.004],
      [0, -0.004],
    ]) {
      const u = Math.atan2(best.dir.x, best.dir.z) + du,
        v = Math.asin(clamp(best.dir.y, -1, 1)) + dv;
      d.set(Math.sin(u) * Math.cos(v), Math.sin(v), Math.cos(u) * Math.cos(v));
      sc(d, p);
      const dd = (p.x - x) ** 2 + (p.y - y) ** 2;
      if (dd < bd) {
        bd = dd;
        best = { dir: d.clone(), p: p.clone() };
      }
    }
  }
  return best;
}

// ---------------------------------------------------------------- head, face, eyes, ears, hair
function hairLine(th, fem = true) {
  return keyf(Math.abs(th), [
    [0, 0.066],
    [0.55, 0.058],
    [0.95, 0.04],
    [1.2, 0.014],
    [1.3, -0.016],
    [1.42, -0.012],
    [1.52, 0.03],
    [1.78, 0.024],
    [2.0, fem ? -0.012 : 0.0],
    [2.5, fem ? -0.05 : -0.026],
    [3.15, fem ? -0.064 : -0.04],
  ]);
}
const FACE_W = 1024,
  FACE_H = 576,
  FACE_V0 = 64 / 576,
  FACE_YMIN = -0.135,
  FACE_YMAX = 0.132;
const faceV = (y) =>
  FACE_V0 +
  ((clamp(y, FACE_YMIN, FACE_YMAX) - FACE_YMIN) / (FACE_YMAX - FACE_YMIN)) *
    (1 - FACE_V0);
const UV_WHITE = [0.5, 0.02];
/** warped UV sphere: more longitude samples on the face, more latitude samples between brow and chin */
function headGrid(nLon, nLat) {
  const pos = [],
    uv = [],
    idx = [],
    dirs = [];
  for (let i = 0; i <= nLat; i++) {
    const t = i / nLat; // 0 top .. 1 bottom
    const w = t + 0.1 * Math.sin(TAU * t) * 0.9; // denser around the middle band
    const lat = PI * (0.5 - clamp(w, 0, 1));
    for (let j = 0; j <= nLon; j++) {
      const q = (j / nLon) * 2 - 1; // -1..1, 0 = front
      const lon = PI * Math.sign(q) * Math.pow(Math.abs(q), 1.28);
      const d = new V3(
        Math.sin(lon) * Math.cos(lat),
        Math.sin(lat),
        Math.cos(lon) * Math.cos(lat),
      );
      dirs.push(d);
      pos.push(d.x, d.y, d.z);
      uv.push(lon / TAU + 0.5, 0);
    }
  }
  const C = nLon + 1;
  for (let i = 0; i < nLat; i++)
    for (let j = 0; j < nLon; j++) {
      const a = i * C + j,
        b = a + 1,
        c = a + C,
        d = c + 1;
      if (i > 0) idx.push(a, c, b);
      if (i < nLat - 1) idx.push(b, c, d);
    }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  return { g, dirs };
}
function buildHead(acc, C, textured) {
  const F = C.face,
    sc = headSculpt(C);
  const skin = srgb(C.skin),
    hair = srgb(C.hair),
    brow = srgb(C.brow);
  const lip = srgb(
    F.lipCol || [C.skin[0] * 0.86, C.skin[1] * 0.6, C.skin[2] * 0.58],
  );
  const stub = mix3(
    skin,
    srgb([C.hair[0] * 0.8, C.hair[1] * 0.8, C.hair[2] * 0.9]),
    0.55,
  );
  const fem = C.female;
  const { g, dirs } = headGrid(56, 42);
  const P = g.attributes.position,
    UV = g.attributes.uv,
    n = P.count;
  const cols = new Array(n),
    p = new V3();
  for (let i = 0; i < n; i++) {
    const d = dirs[i];
    sc(d, p);
    const th = Math.atan2(d.x, d.z),
      ax = Math.abs(p.x);
    const hl = hairLine(th, fem) + (fem ? 0.004 : 0);
    const hw = sstep(hl - 0.004, hl + 0.006, p.y) * sstep(-0.085, -0.07, p.y);
    const thick = fem
      ? lerp(0.008, 0.016, sstep(0.0, 0.08, p.y))
      : lerp(0.0025, 0.0072, sstep(0.02, 0.09, p.y));
    const mus = F.mustache
      ? sstep(0.036, 0.028, ax) *
        bell(p.y, -0.058, -0.053, -0.047, -0.043) *
        sstep(0.05, 0.08, p.z)
      : 0;
    const push = hw * thick + mus * 0.0028;
    p.addScaledVector(d, push);
    P.setXYZ(i, p.x + HC.x, p.y + HC.y, p.z + HC.z);
    UV.setY(i, faceV(p.y));
    if (textured) {
      cols[i] = [1, 1, 1];
      continue;
    }
    // untextured fallback: vertex colours
    let c = mul3(skin, 0.95);
    c = mix3(
      c,
      lip,
      clamp(
        sstep(0.026, 0.017, ax) *
          (bell(p.y, -0.0625, -0.06, -0.053, -0.0505) +
            bell(p.y, -0.078, -0.075, -0.066, -0.0635)) *
          sstep(0.07, 0.09, p.z),
        0,
        1,
      ) * 0.7,
    );
    if (!fem && F.stubble > 0)
      c = mix3(
        c,
        stub,
        sstep(-0.018, -0.034, p.y) * sstep(1.45, 1.2, Math.abs(th)) * F.stubble,
      );
    const browY = 0.0345 + 0.003 * gauss(ax - 0.03, 0.012);
    c = mix3(
      c,
      brow,
      clamp(
        bell(ax, 0.009, 0.016, 0.046, 0.056) *
          gauss(p.y - browY, 0.0034) *
          sstep(0.05, 0.075, p.z) *
          1.4,
        0,
        1,
      ) * 0.9,
    );
    if (mus) c = mix3(c, hair, clamp(mus * 1.3, 0, 1));
    if (hw > 0) c = mix3(c, hair, clamp(hw * 1.2, 0, 1));
    cols[i] = c;
  }
  acc.add("skin", g, { w: B.head, color: (_, __, i) => cols[i], keepUV: true });
  const face = textured ? paintFace(C, sc) : null;

  // ---- eyes + lids
  const iris = srgb(C.iris),
    eyes = [];
  for (const s of [1, -1]) {
    const ex = 0.0318 * F.width * s,
      ey = 0.0128;
    const f = sculptFront(sc, ex, ey);
    const r = 0.0118;
    const ec = new V3(ex, ey, f.p.z - r + 0.0022).add(HC);
    eyes.push(ec.clone());
    const eg = new THREE.SphereGeometry(r, 14, 10);
    const EP = eg.attributes.position,
      ecol = [];
    for (let i = 0; i < EP.count; i++) {
      const v = new V3().fromBufferAttribute(EP, i).normalize();
      const a = Math.acos(clamp(v.z, -1, 1));
      let c;
      if (a < 0.16) c = [0.008, 0.006, 0.006];
      else if (a < 0.45) {
        const ring = sstep(0.36, 0.45, a),
          streak = vnoise(Math.atan2(v.y, v.x) * 9, a * 30, 1, 5);
        const inner = sstep(0.24, 0.16, a);
        c = mix3(mul3(iris, 0.7 + 0.55 * streak), mul3(iris, 0.25), ring);
        c = mix3(c, mul3(iris, 0.45), inner * 0.6);
      } else
        c = mix3(
          [0.6, 0.55, 0.5],
          [0.62, 0.4, 0.37],
          sstep(0.8, 1.35, a) * 0.7,
        );
      c = mul3(
        c,
        1 - 0.55 * sstep(0.12, 0.62, v.y) - 0.15 * sstep(-0.2, -0.6, v.y),
      ); // lid shadow
      ecol.push(c);
    }
    acc.add("skin", eg, {
      m: mT(ec.x, ec.y, ec.z),
      w: B.head,
      color: (_, __, i) => ecol[i],
    });
    // lids: shell around the eyeball with an almond opening
    const lg = new THREE.SphereGeometry(r + 0.0012, 20, 14).toNonIndexed();
    const LP = lg.attributes.position,
      keep = [];
    const lc = new V3();
    for (let t = 0; t < LP.count; t += 3) {
      lc.set(0, 0, 0);
      for (let k = 0; k < 3; k++)
        ((lc.x += LP.getX(t + k) / 3),
          (lc.y += LP.getY(t + k) / 3),
          (lc.z += LP.getZ(t + k) / 3));
      lc.normalize();
      const u = Math.atan2(lc.x * s, lc.z),
        v = Math.asin(lc.y) - 0.05 * u;
      const e = clamp(1 - (u / 0.92) ** 2, 0, 1);
      const open =
        Math.abs(u) < 0.92 &&
        v < 0.3 * Math.pow(e, 0.55) - 0.035 &&
        v > -0.24 * Math.pow(e, 0.75) + 0.01;
      if (lc.z > -0.3 && !open) keep.push(t);
    }
    const pos = [];
    for (const t of keep)
      for (let k = 0; k < 3; k++)
        pos.push(LP.getX(t + k), LP.getY(t + k), LP.getZ(t + k));
    const lid = new THREE.BufferGeometry();
    lid.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    acc.add("skin", lid, {
      m: mT(ec.x, ec.y, ec.z),
      w: B.head,
      seams: false,
      color: (q) => {
        const lq = _v4.copy(q).sub(ec).normalize();
        const u = Math.atan2(lq.x * s, lq.z),
          v = Math.asin(lq.y) - 0.05 * u;
        const e = clamp(1 - (u / 0.92) ** 2, 0, 1);
        const up = v > 0,
          edge = up
            ? sstep(0.12, 0.0, v - (0.3 * Math.pow(e, 0.55) - 0.035))
            : sstep(0.06, 0.0, -0.24 * Math.pow(e, 0.75) + 0.01 - v) * 0.4;
        const crease = up ? gauss(v - 0.62, 0.06) * 0.35 : 0;
        return mix3(
          mix3(mul3(skin, 0.86), mul3(skin, 0.5), crease),
          [0.03, 0.02, 0.018],
          clamp(edge * (C.female ? 1.25 : 0.95), 0, 1),
        );
      },
    });
  }
  // ---- ears
  for (const s of [1, -1]) {
    const eg = new THREE.SphereGeometry(1, 16, 12),
      EP = eg.attributes.position;
    const ry = 0.031 * F.ears,
      rzz = 0.0185 * F.ears;
    for (let i = 0; i < EP.count; i++) {
      let x = EP.getX(i),
        y = EP.getY(i),
        z = EP.getZ(i);
      const rn = Math.hypot(y, z);
      if (x > 0) x -= 0.62 * (1 - sstep(0.55, 0.92, rn)) * x; // concave bowl, thick helix rim
      const lobe = sstep(-0.3, -0.9, y);
      EP.setXYZ(
        i,
        x * 0.0068,
        y * ry * (1 + 0.1 * lobe),
        z * rzz * (1 - 0.25 * lobe),
      );
    }
    const ex = 0.0735 * F.width + 0.0015;
    acc.add("skin", eg, {
      m: mm(
        mT(HC.x + ex * s, HC.y + 0.002, HC.z - 0.009),
        mR(-0.14, s > 0 ? -0.35 : PI + 0.35, 0),
      ),
      w: B.head,
      color: (q) =>
        mix3(skin, [skin[0] * 1.04, skin[1] * 0.82, skin[2] * 0.8], 0.45),
    });
  }
  return { sc, eyes, face };
}

// ---------------------------------------------------------------- painted face texture
function frontLUT(sc) {
  const NU = 90,
    NV = 70,
    pts = [],
    d = new V3();
  for (let j = 0; j < NV; j++)
    for (let i = 0; i < NU; i++) {
      const lon = -1.45 + (2.9 * i) / (NU - 1),
        lat = -1.2 + (2.25 * j) / (NV - 1);
      d.set(
        Math.sin(lon) * Math.cos(lat),
        Math.sin(lat),
        Math.cos(lon) * Math.cos(lat),
      );
      const q = sc(d, new V3());
      pts.push({ lon, lat, x: q.x, y: q.y, z: q.z });
    }
  return (x, y) => {
    let best = pts[0],
      bd = 1e9;
    for (const q of pts) {
      const dd = (q.x - x) ** 2 + (q.y - y) ** 2;
      if (dd < bd && q.z > 0) {
        bd = dd;
        best = q;
      }
    }
    let lon = best.lon,
      lat = best.lat,
      step = 0.01;
    const ev = (lo, la) => {
      d.set(
        Math.sin(lo) * Math.cos(la),
        Math.sin(la),
        Math.cos(lo) * Math.cos(la),
      );
      const q = sc(d, _v6);
      return (q.x - x) ** 2 + (q.y - y) ** 2;
    };
    let cur = ev(lon, lat);
    for (let it = 0; it < 40; it++) {
      let moved = false;
      for (const [a, b] of [
        [step, 0],
        [-step, 0],
        [0, step],
        [0, -step],
      ]) {
        const e = ev(lon + a, lat + b);
        if (e < cur) {
          cur = e;
          lon += a;
          lat += b;
          moved = true;
        }
      }
      if (!moved) step *= 0.5;
    }
    return lon;
  };
}
function paintFace(C, sc) {
  if (typeof document === "undefined") return null;
  const W = FACE_W,
    H = FACE_H,
    F = C.face,
    fem = C.female,
    R = mulberry(C.seed * 31 + 5);
  const cv = document.createElement("canvas");
  cv.width = W;
  cv.height = H;
  const x = cv.getContext("2d");
  const lut = frontLUT(sc);
  const px = (hx, hy) => [(lut(hx, hy) / TAU + 0.5) * W, (1 - faceV(hy)) * H];
  const rgb = (c, a = 1) =>
    `rgba(${Math.round(c[0] * 255)},${Math.round(c[1] * 255)},${Math.round(c[2] * 255)},${a})`;
  const skin = C.skin,
    hair = C.hair,
    brow = C.brow;
  // ---- per-texel base: skin mottling, hair, stubble
  const img = x.createImageData(W, H),
    D = img.data;
  const headRows = Math.round((1 - FACE_V0) * H);
  for (let r = 0; r < H; r++) {
    const v = 1 - (r + 0.5) / H;
    const y =
      FACE_YMIN + ((v - FACE_V0) / (1 - FACE_V0)) * (FACE_YMAX - FACE_YMIN);
    for (let c = 0; c < W; c++) {
      const o = (r * W + c) * 4;
      if (r >= headRows) {
        D[o] = D[o + 1] = D[o + 2] = 255;
        D[o + 3] = 255;
        continue;
      }
      const th = (c / W - 0.5) * TAU,
        ath = Math.abs(th);
      const m = vnoise(th * 9, y * 70, 1.3, C.seed) - 0.5,
        fine = hash3(c, r, 7, C.seed) - 0.5;
      let k = 1 + m * 0.09 + fine * 0.035;
      let col = [skin[0] * k, skin[1] * k, skin[2] * k];
      // warmer / darker toward the sides and under the jaw
      col = mix3(
        col,
        [col[0] * 0.92, col[1] * 0.82, col[2] * 0.8],
        sstep(0.9, 1.7, ath) * 0.3 + sstep(-0.09, -0.125, y) * 0.5,
      );
      col = mix3(
        col,
        [col[0] * 1.04, col[1] * 0.98, col[2] * 0.86],
        sstep(0.03, 0.07, y) * 0.35,
      ); // warmer / yellower forehead
      if (!fem) {
        const gr =
          sstep(0.5, 0.8, vnoise(th * 14, y * 90, 7.7, C.seed + 9)) *
          (0.6 + 0.4 * hash3(c, r, 5, 1));
        col = mix3(col, [col[0] * 0.8, col[1] * 0.74, col[2] * 0.68], gr * 0.2);
      }
      if (!fem && F.stubble > 0) {
        const beard =
          sstep(-0.03, -0.05, y) *
          sstep(1.5, 1.2, ath) *
          (1 - gauss(th, 0.24) * bell(y, -0.082, -0.077, -0.05, -0.045));
        const bm =
          clamp(beard, 0, 1) *
          F.stubble *
          (1 - 0.6 * gauss(th, 0.3) * sstep(-0.075, -0.06, y));
        const dot = hash3(c * 3, r * 3, 11, C.seed) < 0.55 ? 1 : 0.35;
        col = mix3(
          col,
          [
            skin[0] * 0.5 + hair[0] * 0.18,
            skin[1] * 0.47 + hair[1] * 0.18,
            skin[2] * 0.52 + hair[2] * 0.22,
          ],
          clamp(bm * dot * 1.9, 0, 0.62),
        );
      }
      const hl = hairLine(th, fem) + (fem ? 0.004 : 0);
      const hw = sstep(hl - 0.004, hl + 0.006, y) * sstep(-0.085, -0.07, y);
      if (hw > 0) {
        const strand = fem
          ? vnoise(th * 60, y * 7, 3.1, C.seed + 2)
          : vnoise(th * 110, y * 160, 3.1, C.seed + 2);
        const strand2 = fem
          ? vnoise(th * 150, y * 14, 5.3, C.seed + 3)
          : vnoise(th * 260, y * 300, 5.3, C.seed + 3);
        const hk =
          0.62 +
          0.55 * strand +
          0.25 * (strand2 - 0.5) -
          0.18 * sstep(hl + 0.012, hl, y);
        const hc = [hair[0] * hk, hair[1] * hk, hair[2] * hk];
        const edge =
          hash3(c, r, 3, 9) < sstep(hl - 0.004, hl + 0.008, y) ? 1 : 0.35;
        col = mix3(col, hc, clamp(hw * 1.15, 0, 1) * edge);
      }
      D[o] = clamp(col[0] * 255, 0, 255);
      D[o + 1] = clamp(col[1] * 255, 0, 255);
      D[o + 2] = clamp(col[2] * 255, 0, 255);
      D[o + 3] = 255;
    }
  }
  x.putImageData(img, 0, 0);
  const blob = (hx, hy, rx, ry, color, a0, rot = 0) => {
    const [X, Y] = px(hx, hy);
    x.save();
    x.translate(X, Y);
    x.rotate(rot);
    x.scale(rx, ry);
    const g = x.createRadialGradient(0, 0, 0, 0, 0, 1);
    g.addColorStop(0, rgb(color, a0));
    g.addColorStop(1, rgb(color, 0));
    x.fillStyle = g;
    x.beginPath();
    x.arc(0, 0, 1, 0, TAU);
    x.fill();
    x.restore();
  };
  const stroke = (pts, w, color, a) => {
    x.strokeStyle = rgb(color, a);
    x.lineWidth = w;
    x.lineCap = "round";
    x.lineJoin = "round";
    x.beginPath();
    pts.forEach(([hx, hy], i) => {
      const [X, Y] = px(hx, hy);
      if (i) x.lineTo(X, Y);
      else x.moveTo(X, Y);
    });
    x.stroke();
  };
  const fill = (pts, color, a) => {
    x.fillStyle = rgb(color, a);
    x.beginPath();
    pts.forEach(([hx, hy], i) => {
      const [X, Y] = px(hx, hy);
      if (i) x.lineTo(X, Y);
      else x.moveTo(X, Y);
    });
    x.closePath();
    x.fill();
  };
  const red = [skin[0] * 1.02, skin[1] * 0.62, skin[2] * 0.58],
    dark = [skin[0] * 0.45, skin[1] * 0.32, skin[2] * 0.3];
  const ew = 0.0328 * F.width;
  for (const s of [1, -1]) {
    blob(0.047 * s, -0.016, 34, 26, red, fem ? 0.3 : 0.2); // cheek colour
    blob(ew * s, 0.022, 28, 12, dark, 0.42); // upper socket shadow
    blob(ew * s, -0.004, 24, 9, dark, 0.3 + 0.15 * F.age); // under-eye
    blob(0.0165 * s, 0.012, 6, 10, dark, 0.14); // inner corner / nose side
    blob(ew * s, 0.0128, 13, 6, [0.16, 0.1, 0.08], 0.6); // behind the eyeball
    blob(0.0088 * s, -0.0418, 3.2, 1.8, [0.22, 0.11, 0.09], 0.4); // nostril
    stroke(
      [
        [0.0175 * s, -0.032],
        [0.023 * s, -0.046],
        [0.027 * s, -0.06],
      ],
      3,
      dark,
      0.14 + 0.18 * F.age,
    ); // nasolabial
    blob(0.038 * s, -0.085, 30, 10, dark, 0.2); // jaw shadow
    if (fem) {
      blob(0.05 * s, -0.03, 26, 12, dark, 0.14); // cheekbone contour
      stroke(
        [
          [(ew - 0.012) * s, 0.0128],
          [ew * s, 0.018],
          [(ew + 0.013) * s, 0.0145],
        ],
        2.4,
        [0.08, 0.05, 0.04],
        0.5,
      ); // lash line
    }
    // eyebrow: short hairs along an arch, dense at the inner end
    const nB = fem ? 26 : 34;
    for (let i = 0; i < nB; i++) {
      const t = i / (nB - 1),
        bx = lerp(0.011, 0.053, t);
      const by =
        0.0335 +
        0.0055 * Math.sin(PI * clamp(t * 1.15, 0, 1)) -
        0.004 * t +
        (R() - 0.5) * 0.0016;
      const len = (fem ? 0.005 : 0.0062) * (1.2 - 0.5 * t),
        ang = lerp(0.9, 0.15, t);
      const th = (fem ? 1.05 : 1.25) * Math.max(0.8, F.brow) * (1.3 - 0.6 * t);
      for (let k = 0; k < 2; k++) {
        const oy = (R() - 0.5) * 0.003;
        stroke(
          [
            [bx * s, by + oy],
            [
              (bx + Math.cos(ang) * len) * s,
              by + oy + Math.sin(ang) * len * 0.6,
            ],
          ],
          1.9 * th,
          brow,
          0.45,
        );
      }
    }
    // upper lid crease + lash line hint
    stroke(
      [
        [(ew - 0.012) * s, 0.0205],
        [ew * s, 0.0235],
        [(ew + 0.013) * s, 0.0205],
      ],
      2,
      dark,
      0.35,
    );
  }
  // nose tip + bridge highlight
  blob(0, -0.028, 12, 9, red, 0.18);
  // lips
  const lipC = F.lipCol || [skin[0] * 0.86, skin[1] * 0.58, skin[2] * 0.55];
  const mw = 0.0235;
  fill(
    [
      [-mw, -0.0633],
      [-0.013, -0.0566],
      [-0.0045, -0.0548],
      [0, -0.0562],
      [0.0045, -0.0548],
      [0.013, -0.0566],
      [mw, -0.0633],
      [0.01, -0.0628],
      [0, -0.063],
      [-0.01, -0.0628],
    ],
    lipC,
    fem ? 0.95 : 0.42,
  );
  fill(
    [
      [-mw, -0.0633],
      [-0.01, -0.0638],
      [0, -0.0636],
      [0.01, -0.0638],
      [mw, -0.0633],
      [0.014, -0.0705],
      [0, -0.0745],
      [-0.014, -0.0705],
    ],
    lipC,
    fem ? 0.9 : 0.4,
  );
  blob(0, -0.0695, 14, 4, [1, 0.85, 0.8], fem ? 0.22 : 0.1); // lower lip sheen
  stroke(
    [
      [-mw, -0.0634],
      [-0.012, -0.0628],
      [0, -0.0633],
      [0.012, -0.0628],
      [mw, -0.0634],
    ],
    2.2,
    [0.25, 0.1, 0.09],
    0.75,
  );
  blob(
    0,
    -0.047,
    16,
    8,
    [skin[0] * 1.12, skin[1] * 1.08, skin[2] * 1.05],
    0.32,
  ); // light under the nose (counters its shadow)
  if (F.mustache) {
    // full-width chevron that extends past the mouth corners and turns up at the tips
    for (let i = 0; i < 420; i++) {
      const t = R() * 2 - 1,
        at = Math.abs(t),
        bx = t * 0.034;
      const tipLift = 0.009 * sstep(0.7, 1.0, at);
      const by =
        -0.0535 +
        (R() - 0.5) * 0.008 * (1 - 0.55 * at) -
        0.003 * sstep(0.2, 0.7, at) +
        tipLift;
      const dx = Math.sign(t) * (0.004 + 0.002 * at),
        dy = -0.003 + 0.006 * sstep(0.75, 1.0, at);
      stroke(
        [
          [bx, by + 0.002],
          [bx + dx, by + dy],
        ],
        1.7,
        [hair[0] * 0.9, hair[1] * 0.85, hair[2] * 0.8],
        0.62,
      );
    }
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

// ---------------------------------------------------------------- neck
function buildNeck(acc, C) {
  const skin = srgb(C.skin);
  const g = axisLoft(
    new V3(0, 1.462, -0.02),
    AY,
    AZ,
    [
      [0, 0.064, 0.062, 0, 0.0],
      [0.04, 0.061, 0.061, 0, 0.004],
      [0.09, 0.0585 * C.face.width, 0.059, 0, 0.004],
      [0.135, 0.058 * C.face.width, 0.057, 0, 0.004],
      [0.18, 0.05, 0.048, 0, 0.01],
    ],
    16,
  );
  if (!C.female) {
    // larynx
    const P = g.attributes.position;
    for (let i = 0; i < P.count; i++) {
      const x = P.getX(i),
        y = P.getY(i),
        z = P.getZ(i);
      if (z > 0.02)
        P.setZ(i, z + 0.006 * gauss(x, 0.008) * gauss(y - 1.545, 0.012));
    }
  }
  acc.add("skin", g, {
    w: wNeck,
    color: (q) =>
      mul3(
        skin,
        0.9 *
          lerp(0.62, 1, sstep(1.49, 1.55, q.y)) *
          (1 - 0.32 * sstep(1.585, 1.635, q.y) * sstep(-0.01, 0.03, q.z)) *
          (1 - 0.28 * sstep(1.54, 1.6, q.y) * sstep(0.0, -0.03, q.z)),
      ),
  });
}

// ---------------------------------------------------------------- arms + hands
function buildArms(acc, C, bucket, col, cuffCol) {
  const g0 = C.female ? 0.92 : 1.08;
  for (const s of [1, -1]) {
    const sh = new V3(0.182 * C.shoulder * s, 1.438, -0.012),
      d = ADIR(s);
    const leather = bucket === "leather";
    const L = [
      [-0.05, 0.022 * g0, 0.026 * g0],
      [-0.042, 0.041 * g0, 0.045 * g0],
      [-0.026, 0.053 * g0, 0.056 * g0],
      [-0.004, 0.058 * g0, 0.059 * g0],
      [0.03, 0.058 * g0, 0.058 * g0],
      [0.08, 0.052 * g0, 0.054 * g0],
      [0.15, 0.048 * g0, 0.05 * g0],
      [0.22, 0.045 * g0, 0.046 * g0],
      [0.28, 0.042 * g0, 0.044 * g0],
      [0.32, 0.043 * g0, 0.047 * g0],
      [0.38, 0.042 * g0, 0.044 * g0],
      [0.45, 0.037 * g0, 0.037 * g0],
      [0.505, 0.033 * g0, 0.032 * g0],
      [0.512, 0.0365 * g0, 0.036 * g0],
      [0.548, 0.0368 * g0, 0.0362 * g0],
      [0.553, 0.029 * g0, 0.028 * g0],
    ];
    if (leather)
      for (const r of L) {
        r[1] += 0.004;
        r[2] += 0.004;
      }
    const g = axisLoft(sh, d, AZ, densify(L, 0.022), 16, { capStart: true });
    const shade = [];
    const side = new V3().crossVectors(d, AZ).normalize();
    acc.add(bucket, g, {
      w: (p) => wArm(p, s, C),
      post: (p, i) => {
        const t = armT(p, s, C);
        const rad = _v5.copy(p).sub(sh).addScaledVector(d, -t);
        const r = rad.length();
        if (r < 1e-5) {
          shade[i] = 0;
          return;
        }
        rad.multiplyScalar(1 / r);
        const th = Math.atan2(rad.dot(side), rad.z);
        const f = leather
          ? foldArm(t, th, C.seed) * 0.7
          : foldArm(t, th, C.seed);
        p.addScaledVector(rad, f);
        shade[i] = f;
      },
      color: (p, nn, i) => {
        const t = armT(p, s, C),
          m = fbm(p.x * 20, p.y * 20, p.z * 20, C.seed + 2, 3);
        let c = mul3(
          col,
          (0.86 + 0.28 * m) * (1 + clamp(shade[i] || 0, -0.005, 0.005) * 55),
        );
        if (t > 0.505) c = cuffCol ? cuffCol : mul3(c, 0.92);
        c = mul3(c, 1 - 0.18 * gauss(t - 0.285, 0.02)); // elbow crease shading
        c = mul3(c, 1 - 0.22 * sstep(-0.02, -0.065, t)); // armpit / top occlusion
        return c;
      },
    });
  }
}
function buildHands(acc, C) {
  const skin = srgb(C.skin),
    hs = C.hand;
  for (const S of ["L", "R"]) {
    const s = SIDE[S],
      H = S === "L" ? HR.L : HR.R;
    const sh = new V3(0.182 * C.shoulder * s, 1.438, -0.012),
      wr = sh.clone().addScaledVector(ADIR(s), 0.555);
    const M = mBasis(H.T, H.F, H.P, wr).multiply(mS(hs, hs, hs)); // hand space: x = t, y = f, z = p
    const flip = S === "L";
    const col = (p) => {
      const m = fbm(p.x * 90, p.y * 90, p.z * 90, C.seed + 9, 2);
      return mul3(skin, 0.9 + 0.16 * m);
    };
    // palm
    const palm = axisLoft(
      new V3(0, -0.05, 0.0),
      AY,
      AZ,
      [
        [0, 0.024, 0.019, 0, 0.0, 2, 0.019],
        [0.03, 0.0265, 0.0175, 0, 0.001, 2.1, 0.0165],
        [0.055, 0.0325, 0.0175, -0.001, 0.003, 2.5, 0.0135],
        [0.085, 0.039, 0.0165, -0.002, 0.004, 2.9, 0.0122],
        [0.115, 0.0415, 0.0135, -0.002, 0.004, 3.0, 0.012],
        [0.137, 0.039, 0.0095, -0.002, 0.003, 2.7, 0.0105],
        [0.145, 0.031, 0.005, -0.002, 0.002, 2.3, 0.006],
      ],
      16,
      { capEnd: true },
    );
    acc.add("skin", palm, {
      pre: (q) => {
        // dorsal side (z < 0): arch across the metacarpals + a bump over each MCP head
        if (q.z < 0) {
          const back = Math.min(1, -q.z / 0.008);
          let bump = 0;
          for (const fn of ["ix", "md", "rg", "pk"]) {
            const fd = FING[fn];
            bump +=
              gauss(q.x - fd.base[1], 0.0075) *
              gauss(q.y - (fd.base[0] - 0.004), 0.009);
          }
          q.z -=
            back *
            (0.0035 * bump + 0.0022 * gauss(q.x, 0.03) * sstep(0.0, 0.05, q.y));
        }
        // heel of the hand fuller on the palm side
        if (q.z > 0) q.z += 0.002 * gauss(q.y - 0.02, 0.02);
      },
      m: M,
      flip,
      w: (p) => {
        const f = _v5.copy(p).sub(wr).dot(H.F);
        return wb(B["tw" + S], B["hand" + S], sstep(-0.03, -0.004, f));
      },
      color: col,
    });
    // thenar
    acc.add("skin", ellip(0.017, 0.027, 0.0125, 12, 9), {
      m: M.clone().multiply(mm(mT(0.019, 0.032, 0.009), mR(0, 0, -0.55))),
      flip,
      w: [
        [B["hand" + S], 0.7],
        [B["th0" + S], 0.3],
      ],
      color: col,
    });
    // fingers
    for (const fn of FINGER_NAMES) {
      const fd = FING[fn];
      const base = new V3(fd.base[1], fd.base[0], fd.base[2]);
      const dir = new V3(fd.dir[1], fd.dir[0], fd.dir[2]).normalize();
      const [l0, l1, l2] = fd.len,
        [r0, r1, r2] = fd.rad,
        tot = l0 + l1 + l2;
      const th = fn === "th";
      const Lr = th
        ? [
            [-0.016, r0 * 1.2, r0 * 1.1],
            [0, r0 * 1.12, r0 * 1.02],
            [l0 * 0.5, r0 * 1.02, r0 * 0.95],
            [l0, r1 * 1.05, r1 * 0.98],
            [l0 + l1 * 0.5, r1 * 0.97, r1 * 0.9],
            [l0 + l1, r2 * 1.03, r2 * 0.95],
            [l0 + l1 + l2 * 0.55, r2 * 0.97, r2 * 0.88],
            [tot - 0.004, r2 * 0.78, r2 * 0.7],
            [tot - 0.001, r2 * 0.42, r2 * 0.38],
          ]
        : [
            [-0.012, r0 * 1.08, r0 * 0.95],
            [0, r0 * 1.06, r0 * 0.9],
            [l0 * 0.5, r0 * 0.97, r0 * 0.8],
            [l0, r1 * 1.06, r1 * 0.9],
            [l0 + l1 * 0.5, r1 * 0.95, r1 * 0.8],
            [l0 + l1, r2 * 1.02, r2 * 0.86],
            [l0 + l1 + l2 * 0.5, r2 * 0.96, r2 * 0.78],
            [tot - 0.0045, r2 * 0.82, r2 * 0.66],
            [tot - 0.0012, r2 * 0.52, r2 * 0.42],
            [tot, r2 * 0.12, r2 * 0.1],
          ];
      const fg = axisLoft(base, dir, new V3(0, 0, 1), Lr, 8, {
        capEnd: true,
        uRep: 1,
      });
      const bw = wr
        .clone()
        .add(hf(s, fd.base[0] * hs, fd.base[1] * hs, fd.base[2] * hs));
      const dw = hf(s, fd.dir[0], fd.dir[1], fd.dir[2]).normalize();
      const b0 = B[fn + 0 + S],
        b1 = B[fn + 1 + S],
        b2 = B[fn + 2 + S],
        bh = B["hand" + S];
      const j1 = l0 * hs,
        j2 = (l0 + l1) * hs;
      acc.add("skin", fg, {
        m: M,
        flip,
        w: (p) => {
          const u = _v5.copy(p).sub(bw).dot(dw);
          if (u < 0.004 * hs)
            return wb(
              bh,
              b0,
              sstep(-0.006 * hs, 0.004 * hs, u) * (th ? 0.75 : 1),
            );
          if (u < j1 - 0.004) return b0;
          if (u < j1 + 0.004)
            return wb(b0, b1, sstep(j1 - 0.004, j1 + 0.004, u));
          if (u < j2 - 0.004) return b1;
          if (u < j2 + 0.004)
            return wb(b1, b2, sstep(j2 - 0.004, j2 + 0.004, u));
          return b2;
        },
        color: (p, nn) => {
          const u = _v5.copy(p).sub(bw).dot(dw);
          let c = col(p);
          const dorsal = -nn.dot(H.P);
          if (u > (tot - 0.013) * hs && dorsal > 0.35)
            c = mix3(c, [0.8, 0.62, 0.58], 0.55); // nail
          c = mix3(
            c,
            [c[0] * 1.05, c[1] * 0.82, c[2] * 0.8],
            (gauss(u - j1, 0.004) + gauss(u, 0.005)) *
              0.35 *
              sstep(0, 0.5, dorsal),
          );
          return c;
        },
      });
    }
  }
}

// ---------------------------------------------------------------- legs + boots
function buildLegs(acc, C, trouserCol) {
  const brc = C.top === "gymnastyorka";
  const wide = C.female ? 1.08 : 1;
  const T = [
    [1.0, 0.09, 0.098, 0, -0.004],
    [0.93, 0.093, 0.098, 0.003, 0.0],
    [0.85, 0.089, 0.093, 0.005, 0.004],
    [0.75, 0.08, 0.084, 0.005, 0.006],
    [0.65, 0.07, 0.074, 0.004, 0.006],
    [0.57, 0.062, 0.066, 0.002, 0.006],
    [0.51, 0.058, 0.061, 0.0, 0.008],
    [0.45, 0.059, 0.062, 0, 0.002],
    [0.37, 0.061, 0.066, 0, -0.006],
    [0.28, 0.056, 0.059, 0, -0.004],
    [0.19, 0.05, 0.052, 0, -0.001],
    [0.13, 0.048, 0.05, 0, 0.0],
    [0.095, 0.046, 0.048, 0, 0.0],
  ];
  for (const s of [1, -1]) {
    const hx = 0.092 * C.hip * s;
    const L = T.map(([y, rx, rz, out, oz]) => {
      const bag = C.female ? 1.02 : 1 + 0.1 * sstep(0.2, 0.5, y) + 0.04;
      let bx = rx * C.girth * bag,
        bz = rz * C.girth * bag,
        o = out;
      if (brc) {
        const b = gauss(y - 0.74, 0.08);
        bx += 0.022 * b;
        o += 0.016 * b;
        bz += 0.006 * b;
        if (y < 0.45) {
          bx *= 0.92;
          bz *= 0.92;
        }
      }
      if (C.female && y < 0.45) {
        bx *= wide;
        bz *= wide;
      }
      return [0.995 - y, bx, bz, -s * o, oz];
    });
    const g = axisLoft(
      new V3(hx, 0.995, -0.004),
      new V3(0, -1, 0),
      AZ,
      densify(L, 0.032),
      16,
    );
    const shade = [],
      blouse = brc
        ? 0.006
        : C.legwear === "leggings"
          ? 0.0035
          : C.legwear === "anklets"
            ? 0.004
            : 0.0;
    acc.add("cloth", g, {
      w: (p) => wLeg(p, s),
      post: (p, i) => {
        const t = 0.995 - p.y;
        const rx = p.x - hx,
          rz = p.z + 0.004,
          r = Math.hypot(rx, rz) || 1;
        const th = Math.atan2(rx * s, rz);
        let f = foldLeg(t, th, C.seed + s, 0);
        if (blouse)
          f +=
            blouse *
            gauss(
              p.y - (brc ? 0.47 : C.legwear === "leggings" ? 0.345 : 0.205),
              0.025,
            ) *
            (0.5 + 0.5 * Math.sin(th * 6 + t * 40));
        p.x += (rx / r) * f;
        p.z += (rz / r) * f;
        shade[i] = f;
      },
      color: (p, nn, i) => {
        const m = fbm(p.x * 18, p.y * 18, p.z * 18, C.seed + 4, 3);
        let c = mul3(
          trouserCol,
          (0.85 + 0.3 * m) * (1 + clamp(shade[i] || 0, -0.005, 0.005) * 55),
        );
        c = mul3(
          c,
          1 - 0.15 * gauss(p.y - 0.51, 0.025) * sstep(0, -0.03, p.z - 0.0),
        ); // back of knee
        c = mul3(c, 1 - 0.12 * sstep(0.2, 0.1, p.y)); // dirt / occlusion low
        const dirt =
          sstep(0.35, 0.12, p.y) * fbm(p.x * 30, p.y * 30, p.z * 30, 77, 2);
        return mix3(c, [0.13, 0.11, 0.08], dirt * 0.5);
      },
    });
    // side seam pocket / map pocket (UK)
    if (C.top === "battledress" && s > 0) {
      acc.add("cloth", sbox(0.13, 0.17, 0.028, 5, 10, 8), {
        m: mm(mT(hx + 0.072, 0.72, 0.03), mR(0, 0.72, 0)),
        w: (p) => wLeg(p, s),
        color: mul3(trouserCol, 0.97),
      });
      acc.add("cloth", sbox(0.135, 0.045, 0.032, 5, 10, 6), {
        m: mm(mT(hx + 0.074, 0.79, 0.032), mR(0, 0.72, 0)),
        w: (p) => wLeg(p, s),
        color: mul3(trouserCol, 0.9),
      });
    }
  }
}
function legwear(acc, C) {
  const col = srgb(C.legCol);
  for (const s of [1, -1]) {
    const hx = 0.092 * C.hip * s;
    let L = null,
      bucket = "cloth";
    if (C.legwear === "leggings")
      L = [
        [0.335, 0.064, 0.068, 0.0],
        [0.33, 0.066, 0.07, 0],
        [0.28, 0.062, 0.064, 0],
        [0.19, 0.056, 0.058, 0],
        [0.12, 0.054, 0.056, 0],
        [0.085, 0.056, 0.058, 0.012],
      ];
    else if (C.legwear === "anklets")
      L = [
        [0.195, 0.058, 0.061, 0],
        [0.19, 0.06, 0.063, 0],
        [0.12, 0.057, 0.06, 0],
        [0.085, 0.058, 0.061, 0.012],
      ];
    else if (C.legwear === "tallboots") {
      bucket = "leather";
      L = [
        [0.46, 0.066, 0.072, -0.004],
        [0.455, 0.068, 0.074, -0.004],
        [0.4, 0.066, 0.07, -0.006],
        [0.33, 0.062, 0.066, -0.006],
        [0.24, 0.055, 0.058, -0.003],
        [0.16, 0.05, 0.053, 0],
        [0.1, 0.052, 0.056, 0.004],
      ];
    }
    if (!L) continue;
    const g = axisLoft(
      new V3(hx, 0, -0.004),
      AY,
      AZ,
      L.map(([y, rx, rz, oz]) => [
        y,
        rx * C.girth,
        rz * C.girth,
        0,
        oz,
      ]).reverse(),
      18,
    );
    acc.add(bucket, g, {
      w: (p) => wLeg(p, s),
      color: (p) => {
        const m = fbm(p.x * 25, p.y * 25, p.z * 25, C.seed + 5, 3);
        let c = mul3(col, 0.82 + 0.3 * m);
        if (C.legwear === "leggings") {
          // lace line + hooks on the outer side
          const th = Math.atan2((p.x - hx) * s, p.z);
          if (Math.abs(th - 1.6) < 0.1) c = mul3(c, 0.55);
          if (
            Math.abs(th - 1.6) < 0.16 &&
            Math.abs(((p.y * 40) % 1) - 0.5) < 0.12
          )
            c = [0.12, 0.11, 0.1];
        }
        if (
          C.legwear === "anklets" &&
          (Math.abs(p.y - 0.165) < 0.01 || Math.abs(p.y - 0.115) < 0.01)
        )
          c = mul3(c, 0.7);
        if (C.legwear === "tallboots")
          c = mul3(
            c,
            1 +
              0.25 *
                sstep(
                  0.06,
                  0.02,
                  Math.abs(
                    ((p.y * 9 + fbm(p.x * 40, p.y * 10, p.z * 40, 8, 2)) % 1) -
                      0.5,
                  ),
                ) *
                sstep(0.3, 0.12, p.y),
          );
        return mix3(c, [0.12, 0.1, 0.07], sstep(0.2, 0.08, p.y) * 0.4);
      },
    });
  }
}
function buildBoots(acc, C) {
  const col = srgb(C.bootCol),
    sole = [0.03, 0.025, 0.02];
  const R = [
    [-0.082, 0.024, 0.006, 0.06],
    [-0.076, 0.035, 0.0, 0.084],
    [-0.052, 0.043, 0.0, 0.104],
    [-0.012, 0.046, 0.0, 0.112],
    [0.03, 0.048, 0.0, 0.1],
    [0.07, 0.05, 0.0, 0.08],
    [0.11, 0.052, 0.0, 0.064],
    [0.15, 0.05, 0.0, 0.052],
    [0.185, 0.044, 0.0, 0.046],
    [0.207, 0.034, 0.002, 0.039],
    [0.219, 0.018, 0.007, 0.03],
  ];
  const fs = C.female ? 0.93 : 1;
  for (const s of [1, -1]) {
    const hx = 0.092 * C.hip * s;
    const rings = R.map(([z, w, y0, y1]) => ({
      c: new V3(hx, (y0 + y1) / 2, z * fs - 0.004),
      ax: AX,
      az: AY,
      rx: w * fs,
      rz: (y1 - y0) / 2,
      p: 2.8,
    }));
    const g = loft(rings, 18, { capStart: true, capEnd: true });
    acc.add("leather", g, {
      w: (p) => wFoot(p, s),
      color: (p) => {
        let c = mul3(
          col,
          0.85 + 0.3 * fbm(p.x * 50, p.y * 50, p.z * 50, 21, 2),
        );
        if (p.y < 0.013) c = sole;
        else if (p.y < 0.02) c = mul3(col, 0.45);
        c = mix3(
          c,
          [0.16, 0.13, 0.1],
          fbm(p.x * 30, p.y * 30, p.z * 30, 5, 2) * sstep(0.06, 0.0, p.y) * 0.5,
        );
        return c;
      },
    });
    // shaft around the ankle
    const top = C.boot === "ankle" ? 0.15 : 0.125;
    if (C.boot !== "tall") {
      const sg = axisLoft(
        new V3(hx, 0.05, -0.014),
        AY,
        AZ,
        [
          [0, 0.046, 0.05],
          [top - 0.05, 0.048, 0.052],
          [top - 0.045, 0.05, 0.054],
          [top - 0.04, 0.046, 0.05],
        ],
        16,
      );
      acc.add("leather", sg, {
        w: (p) => wFoot(p, s),
        color: (p) => mul3(col, p.y > top - 0.012 + 0.05 ? 0.7 : 0.95),
      });
    }
  }
}

// ---------------------------------------------------------------- torso garments
function clothCol(base, seed, dirt = 0.25) {
  return (p) => {
    const m = fbm(p.x * 16, p.y * 16, p.z * 16, seed, 3),
      f = fbm(p.x * 55, p.y * 55, p.z * 55, seed + 1, 2);
    let c = mul3(base, 0.84 + 0.26 * m + 0.08 * (f - 0.5));
    const st = fbm(p.x * 7 + 3, p.y * 7, p.z * 7, seed + 2, 3);
    c = mix3(c, mul3(c, 0.7), sstep(0.58, 0.72, st) * dirt);
    return c;
  };
}
function buildTorso(acc, C, TS) {
  const top = srgb(C.topCol),
    trs = srgb(C.trouserCol);
  const topB = C.top === "leather" ? "leather" : "cloth";
  // trousers (pelvis)
  const lowTop = C.top === "shirt" ? 1.07 : 1.06;
  const lr = TS.rings(0.8, lowTop, 9, (y) => (y > 0.99 ? -0.002 : 0));
  acc.add(
    "cloth",
    loft(lr, 28, { capStart: true, capPull: new V3(0, -0.01, 0) }),
    {
      w: (p) => wTorso(p, 1),
      color: (p) => {
        let c = clothCol(trs, C.seed + 20)(p);
        c = mul3(
          c,
          1 - 0.3 * sstep(0.9, 0.8, p.y) * (0.6 + 0.4 * gauss(p.x, 0.06)),
        ); // crotch occlusion
        return c;
      },
    },
  );
  // upper garment
  const hem = {
    shirt: 0.985,
    battledress: 0.955,
    gymnastyorka: 0.8,
    leather: 0.915,
  }[C.top];
  const flare = {
    shirt: 0.0,
    battledress: 0.004,
    gymnastyorka: 0.012,
    leather: 0.01,
  }[C.top];
  const topOff = (y) =>
    0.003 + flare * sstep(1.08, hem, y) + (C.top === "leather" ? 0.004 : 0);
  const ur = TS.rings(hem, 1.535, 24, topOff);
  const ccol = clothCol(top, C.seed + 30, C.top === "leather" ? 0.1 : 0.25);
  const tshade = [];
  const beltY =
    C.top === "gymnastyorka" ? 1.005 : C.top === "leather" ? 0.94 : 1.0;
  acc.add(topB, loft(ur, 32), {
    w: (p) => wTorso(p, 0.8),
    post: (p, i) => {
      const th = Math.atan2(p.x, p.z),
        n = vnoise(th * 3, p.y * 20, C.seed, 9) - 0.5;
      let f =
        0.0038 * gauss(p.y - (beltY + 0.06), 0.035) * Math.sin(th * 13 + n * 4); // bloused over the belt
      if (C.top === "gymnastyorka")
        f += 0.005 * sstep(0.97, 0.84, p.y) * Math.sin(th * 9 + n * 3); // skirt pleats
      f +=
        0.0022 *
        gauss(Math.abs(th) - 1.5, 0.3) *
        gauss(p.y - 1.33, 0.06) *
        Math.sin(p.y * 90 + th * 4); // armpit
      f += 0.0012 * Math.sin(th * 7 + p.y * 30 + n * 5);
      if (C.top === "leather") f *= 0.6;
      const r = Math.hypot(p.x, p.z) || 1;
      p.x += (p.x / r) * f;
      p.z += (p.z / r) * f;
      tshade[i] = f;
    },
    color: (p, nn, i) => {
      let c = mul3(ccol(p), 1 + clamp(tshade[i] || 0, -0.005, 0.005) * 50);
      const th = Math.atan2(p.x, p.z);
      // folds: vertical creases below the belt / waistband bunching
      c = mul3(
        c,
        1 -
          0.1 *
            sstep(0.6, 0.9, Math.sin(th * 9 + p.y * 12)) *
            sstep(1.05, 0.95, p.y),
      );
      c = mul3(
        c,
        1 - 0.18 * gauss(Math.abs(th) - 1.45, 0.25) * gauss(p.y - 1.36, 0.05),
      ); // armpit shade
      c = mul3(c, 1 - 0.25 * sstep(hem + 0.02, hem, p.y));
      return c;
    },
  });
  // ---- garment details
  const addBox = (bucket, w, h, d, y, th, off, col, o = {}) => {
    const M = TS.frame(y, th, off).multiply(o.rot ? mR(...o.rot) : new M4());
    acc.add(bucket, sbox(w, h, d, o.p || 6, o.ws || 8, o.hs || 6), {
      m: M,
      w: (p) => wTorso(p, o.skirt ?? 0.8),
      color: col,
    });
  };
  const button = (y, th, off, col) => {
    const M = TS.frame(y, th, off).multiply(mR(PI / 2, 0, 0));
    acc.add("metal", cyl(0.0065, 0.0065, 0.004, 8), {
      m: M,
      w: (p) => wTorso(p),
      color: col,
    });
  };
  const btn = [0.32, 0.28, 0.2];
  if (C.top === "shirt") {
    for (const s of [1, -1]) {
      // breast pockets + flaps
      addBox(
        "cloth",
        0.105,
        0.125,
        0.014,
        1.295,
        0.44 * s,
        0.001,
        mul3(top, 0.96),
      );
      addBox(
        "cloth",
        0.112,
        0.042,
        0.016,
        1.35,
        0.44 * s,
        0.004,
        mul3(top, 0.86),
      );
      button(1.345, 0.44 * s, 0.013, btn);
    }
    addBox("cloth", 0.03, 0.44, 0.008, 1.24, 0.0, 0.002, mul3(top, 0.94), {
      p: 8,
    }); // placket
    for (let i = 0; i < 5; i++) button(1.06 + i * 0.09, 0.0, 0.007, btn);
  } else if (C.top === "battledress") {
    for (const s of [1, -1]) {
      addBox(
        "cloth",
        0.115,
        0.14,
        0.018,
        1.29,
        0.46 * s,
        0.001,
        mul3(top, 0.97),
      );
      addBox(
        "cloth",
        0.024,
        0.13,
        0.02,
        1.29,
        0.46 * s,
        0.004,
        mul3(top, 0.88),
      ); // box pleat
      addBox(
        "cloth",
        0.122,
        0.046,
        0.02,
        1.355,
        0.46 * s,
        0.004,
        mul3(top, 0.86),
      );
      button(1.35, 0.46 * s, 0.016, btn);
    }
    // waistband
    const wbR = TS.rings(0.955, 1.02, 3, (y) => 0.009);
    acc.add("cloth", loft(wbR, 32), {
      w: (p) => wTorso(p, 0.8),
      color: (p) => mul3(top, Math.abs(p.y - 0.988) < 0.03 ? 0.9 : 0.75),
    });
    addBox("cloth", 0.036, 0.05, 0.02, 0.99, -0.12, 0.012, mul3(top, 0.85));
    button(0.99, -0.12, 0.024, btn);
  } else if (C.top === "gymnastyorka") {
    addBox("cloth", 0.038, 0.19, 0.01, 1.4, 0.0, 0.002, mul3(top, 0.93), {
      p: 8,
    }); // placket
    for (let i = 0; i < 3; i++)
      button(1.34 + i * 0.058, 0.0, 0.008, [0.3, 0.3, 0.22]);
    // skirt hem band
    const hr = TS.rings(0.8, 0.83, 2, (y) => 0.017);
    acc.add("cloth", loft(hr, 32), {
      w: (p) => wTorso(p, 0.9),
      color: mul3(top, 0.8),
    });
  } else if (C.top === "leather") {
    // zipper line + side pockets + waistband
    addBox("leather", 0.012, 0.5, 0.008, 1.2, 0.0, 0.004, [0.2, 0.17, 0.13], {
      p: 10,
    });
    for (const s of [1, -1])
      addBox(
        "leather",
        0.13,
        0.03,
        0.012,
        1.03,
        0.62 * s,
        0.013,
        mul3(top, 0.7),
        { rot: [0, 0, 0.5 * s] },
      );
    const wbR = TS.rings(0.915, 0.965, 3, (y) => 0.019);
    acc.add("leather", loft(wbR, 32), {
      w: (p) => wTorso(p, 0.8),
      color: mul3(top, 0.8),
    });
    const sh = srgb(C.shirtCol);
    addBox("cloth", 0.09, 0.08, 0.02, 1.47, 0.0, 0.0, sh); // shirt at the opening
  }
}

// ---------------------------------------------------------------- collars, scarf
function buildCollar(acc, C, TS) {
  const top = srgb(C.topCol);
  const neckRing = (y, r, zc = -0.012, back = 0) => ({
    c: new V3(0, y, zc),
    ax: AX,
    az: AZ,
    rx: r,
    rz: r * 1.02,
    p: 2,
    dy: back,
  });
  if (C.top === "shirt" || C.top === "battledress") {
    const g = loft(
      [
        neckRing(1.49, 0.077, -0.012, 0.012),
        neckRing(1.525, 0.072, -0.012, 0.02),
        neckRing(1.552, 0.07, -0.012, 0.024),
        neckRing(1.555, 0.075, -0.012, 0.024),
        neckRing(1.528, 0.081, -0.012, 0.02),
        neckRing(1.5, 0.089, -0.012, 0.012),
      ],
      24,
    );
    acc.add("cloth", g, {
      w: wNeckCollar,
      color: (p) =>
        mul3(top, p.y > 1.552 + 0.02 * sstep(0.0, -0.06, p.z) ? 0.8 : 0.95),
    });
    if (C.top === "shirt")
      for (const s of [1, -1]) {
        // collar points
        const ex = new THREE.ExtrudeGeometry(
          new THREE.Shape([
            new THREE.Vector2(0, 0),
            new THREE.Vector2(0.04 * s, -0.024),
            new THREE.Vector2(0.02 * s, -0.056),
          ]),
          { depth: 0.004, bevelEnabled: false },
        );
        acc.add("cloth", ex, {
          m: mm(mT(0.01 * s, 1.52, 0.064), mR(-0.42, 0, 0)),
          w: (p) => wTorso(p),
          color: mul3(top, 0.92),
          flip: s < 0,
        });
      }
  } else if (C.top === "gymnastyorka") {
    const g = loft(
      [
        neckRing(1.495, 0.077, -0.012, 0.01),
        neckRing(1.52, 0.072, -0.012, 0.014),
        neckRing(1.562, 0.07, -0.012, 0.016),
        neckRing(1.565, 0.066, -0.012, 0.016),
      ],
      24,
    );
    acc.add("cloth", g, {
      w: wNeckCollar,
      color: (p) => mul3(top, p.y > 1.562 ? 0.78 : 0.97),
    });
    for (const y of [1.528, 1.552])
      acc.add("metal", cyl(0.005, 0.005, 0.004, 8), {
        m: mm(mT(0, y, 0.058), mR(PI / 2, 0, 0)),
        w: wNeckCollar,
        color: [0.3, 0.3, 0.22],
      });
  } else if (C.top === "leather") {
    // wide collar folded over the shoulders
    const lc = srgb(C.topCol);
    const g = loft(
      [
        neckRing(1.48, 0.095, -0.015, 0.01),
        neckRing(1.52, 0.083, -0.015, 0.016),
        neckRing(1.55, 0.079, -0.018, 0.02),
        neckRing(1.555, 0.087, -0.02, 0.02),
        neckRing(1.51, 0.115, -0.02, 0.012),
        neckRing(1.47, 0.14, -0.02, 0.0),
      ],
      28,
      { th0: 0.55, thSpan: TAU - 1.1 },
    );
    acc.add("leather", g, {
      w: wNeckCollar,
      color: (p) => mul3(lc, p.y > 1.548 ? 0.7 : 0.9),
    });
  }
  if (C.scarfCol) {
    const sc = srgb(C.scarfCol);
    const pts = [];
    for (let i = 0; i <= 28; i++) {
      const a = (i / 28) * TAU;
      pts.push(
        new V3(
          Math.sin(a) * 0.08,
          1.515 + 0.012 * Math.cos(a) + 0.012 * (1 - Math.cos(a)) * 0.5,
          Math.cos(a) * 0.084 - 0.012,
        ),
      );
    }
    const col = (p) => {
      const k = fbm(p.x * 40, p.y * 40, p.z * 40, 31, 2);
      const stripe = Math.abs(((p.y + p.x) * 45) % 1) < 0.18 ? 0.78 : 1;
      return mul3(sc, (0.85 + 0.3 * k) * stripe);
    };
    acc.add("cloth", tube(pts, 0.021, 10, { flat: 0.8 }), {
      w: wNeckCollar,
      color: col,
    });
    acc.add("cloth", sbox(0.05, 0.042, 0.04, 4, 10, 8), {
      m: mT(0.012, 1.49, 0.075),
      w: (p) => wTorso(p),
      color: col,
    });
    const tail = [
      new V3(0.014, 1.48, 0.085),
      new V3(0.03, 1.43, 0.1),
      new V3(0.04, 1.36, 0.115),
      new V3(0.045, 1.3, 0.12),
    ];
    acc.add(
      "cloth",
      tube(tail, (i, u) => 0.02 + 0.006 * u, 8, { flat: 0.3 }),
      { w: (p) => wTorso(p), color: col },
    );
  }
}
function wNeckCollar(p) {
  return p.y > 1.53
    ? wb(B.chest, B.neck, sstep(1.53, 1.57, p.y) * 0.7)
    : B.chest;
}

// ---------------------------------------------------------------- belts, straps, gear
function beltBand(acc, TS, y0, y1, off, bucket, col, seed) {
  const g = loft(
    [
      ...TS.rings(y0, y0, 0, () => off - 0.006),
      ...TS.rings(y0, y1, 2, () => off),
      ...TS.rings(y1, y1, 0, () => off - 0.006),
    ],
    32,
  );
  acc.add(bucket, g, {
    w: (p) => wTorso(p, 0.6),
    color: (p) =>
      mul3(col, 0.85 + 0.3 * fbm(p.x * 30, p.y * 30, p.z * 30, seed, 2)),
  });
}
function torsoStrap(acc, TS, path, w, off, bucket, col, t = 0.004) {
  const pts = [],
    nrm = [];
  for (let i = 0; i < path.length - 1; i++) {
    const [y0, a0] = path[i],
      [y1, a1] = path[i + 1];
    const n = 6;
    for (let k = i ? 1 : 0; k <= n; k++) {
      const y = lerp(y0, y1, k / n),
        a = lerp(a0, a1, k / n);
      pts.push(TS.surf(y, a, off));
      nrm.push(TS.normal(y, a));
    }
  }
  acc.add(bucket, strap(pts, nrm, w, t), {
    w: (p) => wTorso(p, 0.5),
    color: col,
  });
}
function buildGear(acc, C, TS) {
  const web = srgb(C.webCol),
    metal = [0.42, 0.4, 0.34],
    brass = [0.62, 0.5, 0.26];
  const box = (bucket, w, h, d, y, th, off, col, o = {}) => {
    const M = TS.frame(y, th, off).multiply(o.rot ? mR(...o.rot) : new M4());
    acc.add(bucket, sbox(w, h, d, o.p || 6, o.ws || 8, o.hs || 6), {
      m: M,
      w: (p) => wTorso(p, o.skirt ?? 0.6),
      color:
        typeof col === "function"
          ? col
          : (p) =>
              mul3(col, 0.86 + 0.25 * fbm(p.x * 40, p.y * 40, p.z * 40, 3, 2)),
    });
  };
  if (C.gear === "m1936") {
    beltBand(acc, TS, 0.975, 1.035, 0.016, "cloth", web, 41);
    for (const s of [1, -1]) {
      for (let i = 0; i < 4; i++) {
        // cartridge pockets
        const th = s * (0.42 + i * 0.3);
        box("cloth", 0.058, 0.074, 0.03, 1.0, th, 0.03, web, { ws: 6, hs: 4 });
        box("cloth", 0.062, 0.022, 0.034, 1.034, th, 0.032, mul3(web, 0.8), {
          ws: 6,
          hs: 4,
        });
        acc.add("metal", cyl(0.0045, 0.0045, 0.004, 6), {
          m: TS.frame(1.03, th, 0.05).multiply(mR(PI / 2, 0, 0)),
          w: (p) => wTorso(p),
          color: metal,
        });
      }
      // suspenders: front belt -> over the shoulder -> back belt
      torsoStrap(
        acc,
        TS,
        [
          [1.04, 0.5 * s],
          [1.2, 0.48 * s],
          [1.38, 0.55 * s],
          [1.47, 0.75 * s],
          [1.505, 1.2 * s],
          [1.47, 2.3 * s],
          [1.3, 2.55 * s],
          [1.04, 2.6 * s],
        ],
        0.032,
        0.006,
        "cloth",
        mul3(web, 0.92),
      );
      box("metal", 0.024, 0.03, 0.008, 1.14, 0.49 * s, 0.012, metal);
    }
    box("metal", 0.07, 0.05, 0.012, 1.005, 0.0, 0.026, brass, { p: 8 }); // buckle
    // canteen on the right hip + cover
    box("cloth", 0.13, 0.17, 0.07, 0.92, -1.9, 0.055, mul3(web, 0.85), {
      p: 4,
      skirt: 0.9,
    });
    box("cloth", 0.13, 0.05, 0.075, 0.99, -1.9, 0.058, mul3(web, 0.75), {
      p: 5,
      skirt: 0.9,
    });
    box("metal", 0.03, 0.03, 0.03, 1.02, -1.9, 0.07, [0.3, 0.3, 0.28], {
      p: 3,
    });
    // first-aid pouch at the back left
    box("cloth", 0.09, 0.085, 0.045, 0.99, 2.2, 0.04, web);
  } else if (C.gear === "p37") {
    beltBand(acc, TS, 0.98, 1.035, 0.02, "cloth", web, 42);
    box("metal", 0.06, 0.045, 0.01, 1.008, 0.0, 0.03, brass, { p: 8 });
    for (const s of [1, -1]) {
      // basic pouches on the chest
      box("cloth", 0.115, 0.19, 0.065, 1.16, 0.5 * s, 0.05, web, {
        p: 5,
        rot: [0.1, 0, 0],
      });
      box("cloth", 0.12, 0.06, 0.072, 1.26, 0.5 * s, 0.055, mul3(web, 0.85), {
        p: 5,
        rot: [0.1, 0, 0],
      });
      acc.add("metal", cyl(0.006, 0.006, 0.004, 6), {
        m: TS.frame(1.235, 0.5 * s, 0.095).multiply(mR(PI / 2, 0, 0)),
        w: (p) => wTorso(p),
        color: brass,
      });
      // braces: pouch top -> over the shoulder -> cross at the back
      torsoStrap(
        acc,
        TS,
        [
          [1.28, 0.5 * s],
          [1.4, 0.58 * s],
          [1.475, 0.78 * s],
          [1.505, 1.25 * s],
          [1.46, 2.4 * s],
          [1.3, 2.85 * s],
          [1.1, 3.1 * s],
          [1.03, 3.3 * s],
        ],
        0.028,
        0.008,
        "cloth",
        mul3(web, 0.93),
      );
    }
    // small pack on the back + water bottle on the right hip
    box("cloth", 0.26, 0.22, 0.09, 1.3, PI, 0.07, mul3(web, 0.95), { p: 4 });
    box("cloth", 0.25, 0.06, 0.1, 1.4, PI, 0.08, mul3(web, 0.82), { p: 5 });
    box("cloth", 0.1, 0.16, 0.08, 0.92, -2.0, 0.06, mul3(web, 0.9), {
      p: 3,
      skirt: 0.9,
    });
  } else if (C.gear === "soviet") {
    const belt = srgb(C.webCol);
    beltBand(acc, TS, 0.985, 1.03, 0.018, "leather", belt, 43);
    box("metal", 0.052, 0.05, 0.01, 1.008, 0.0, 0.028, [0.5, 0.46, 0.34], {
      p: 8,
    }); // plain frame buckle
    for (const s of [1, -1])
      box("leather", 0.1, 0.085, 0.05, 0.99, 0.55 * s, 0.04, mul3(belt, 0.95), {
        p: 5,
      });
    // shoulder belt (portupeya-like strap) omitted: bedroll loop over the left shoulder
    const ctrl = [
      [1.43, 0.72],
      null,
      [1.43, 2.42],
      [1.26, 3.14],
      [1.08, 3.9],
      [0.985, 4.5],
      [0.97, 4.75],
      [0.99, 5.1],
      [1.1, 5.65],
      [1.25, 6.28],
      [1.36, 6.7],
    ].map((c) =>
      c ? TS.surf(c[0], c[1], 0.046) : new V3(0.118, 1.548, -0.012),
    );
    const curve = new THREE.CatmullRomCurve3(ctrl, true, "centripetal");
    const pts = curve.getPoints(56);
    const bed = srgb([0.45, 0.4, 0.33]);
    acc.add(
      "cloth",
      tube(pts, (i) => 0.042 + 0.004 * Math.sin(i * 1.7), 12),
      {
        w: (p) => wTorso(p, 0.3),
        color: (p) => {
          const k = fbm(p.x * 30, p.y * 30, p.z * 30, 12, 3);
          const roll =
            0.85 + 0.2 * Math.sin(Math.atan2(p.y - 1.2, p.x) * 40 + k * 6);
          return mul3(bed, (0.8 + 0.3 * k) * roll);
        },
      },
    );
    for (const th of [0.75, -0.6, 2.4]) {
      // ties around the roll
      const y = 1.22 + 0.265 * Math.sin(th) - 0.02 * Math.cos(2 * th);
      const c = TS.surf(y, th, 0.045),
        nn = TS.normal(y, th);
      acc.add("leather", new THREE.TorusGeometry(0.046, 0.005, 6, 14), {
        m: mBasis(
          nn,
          new V3().crossVectors(AY, nn).normalize(),
          AY,
          c,
        ).multiply(mR(0, PI / 2, 0.4)),
        w: (p) => wTorso(p, 0.3),
        color: mul3(belt, 0.8),
      });
    }
  } else if (C.gear === "resistance") {
    const belt = [0.2, 0.13, 0.08];
    beltBand(acc, TS, 1.035, 1.065, 0.004, "leather", belt, 44);
    // satchel strap: right shoulder -> across the chest -> left hip, bag on the left hip
    const strapCol = srgb([0.36, 0.24, 0.14]);
    torsoStrap(
      acc,
      TS,
      [
        [1.02, 1.35],
        [1.12, 0.9],
        [1.26, 0.35],
        [1.38, -0.2],
        [1.47, -0.55],
        [1.51, -1.1],
        [1.47, -2.0],
        [1.3, -2.6],
        [1.14, -3.38],
        [1.03, -4.38],
      ],
      0.03,
      0.02,
      "leather",
      strapCol,
      0.004,
    );
    const sat = srgb(C.webCol);
    box("cloth", 0.24, 0.2, 0.07, 0.92, 1.55, 0.07, sat, { p: 5, skirt: 0.9 });
    box(
      "leather",
      0.245,
      0.11,
      0.075,
      0.975,
      1.55,
      0.075,
      mul3(strapCol, 0.9),
      { p: 6, skirt: 0.9 },
    );
    box("metal", 0.02, 0.028, 0.01, 0.93, 1.55, 0.115, [0.5, 0.45, 0.3], {
      skirt: 0.9,
    });
  }
}

// ---------------------------------------------------------------- headgear + long hair
function lathe(profile, seg) {
  return new THREE.LatheGeometry(
    profile.map(([r, y]) => new THREE.Vector2(r, y)),
    seg,
  );
}
function buildHeadgear(acc, C, sc) {
  const col = srgb(C.headCol);
  const place = (off, rot, sx = 1, sz = 1) =>
    mm(
      mT(HC.x + off[0], HC.y + off[1], HC.z + off[2]),
      mR(rot[0], rot[1], rot[2], "YXZ"),
      mS(sx, 1, sz),
    );
  const paint =
    (seed, k = 0.3) =>
    (p) =>
      mul3(col, 1 - k / 2 + k * fbm(p.x * 25, p.y * 25, p.z * 25, seed, 3));
  if (C.head === "m1") {
    const prof = [
      [0.0, 0.152],
      [0.04, 0.15],
      [0.075, 0.142],
      [0.1, 0.128],
      [0.118, 0.108],
      [0.13, 0.085],
      [0.136, 0.06],
      [0.139, 0.038],
      [0.141, 0.022],
      [0.143, 0.012],
      [0.147, 0.006],
      [0.149, 0.003],
      [0.149, -0.002],
      [0.144, 0.0],
      [0.137, 0.01],
      [0.134, 0.035],
      [0.13, 0.06],
      [0.124, 0.085],
      [0.111, 0.108],
      [0.093, 0.126],
      [0.068, 0.138],
      [0.035, 0.145],
      [0.0, 0.147],
    ];
    const dip = (p) => {
      const a = Math.atan2(p.x, p.z);
      if (p.y < 0.06)
        p.y -= 0.008 * sstep(0.6, 1.6, Math.abs(a)) * sstep(0.06, 0.02, p.y);
    };
    const M = place([0, 0.046, -0.01], [0.12, 0, 0], 0.84, 0.95);
    acc.add("metal", lathe(prof, 36), {
      pre: dip,
      m: M,
      w: B.head,
      color: paint(61),
    });
    // net lattice over the dome
    const ng = lathe(
      [
        [0.0, 0.156],
        [0.042, 0.154],
        [0.078, 0.146],
        [0.104, 0.132],
        [0.122, 0.112],
        [0.134, 0.088],
        [0.14, 0.062],
        [0.143, 0.04],
        [0.145, 0.026],
      ],
      44,
    ).toNonIndexed();
    const NP = ng.attributes.position,
      keep = [];
    for (let t = 0; t < NP.count; t += 3) {
      let x = 0,
        y = 0,
        z = 0;
      for (let k = 0; k < 3; k++) {
        x += NP.getX(t + k);
        y += NP.getY(t + k);
        z += NP.getZ(t + k);
      }
      const lon = Math.atan2(x, z),
        lat = Math.atan2(y / 3, Math.hypot(x, z) / 3);
      const a = lon * 5.2 + lat * 7,
        b2 = lon * 5.2 - lat * 7;
      const fa = a - Math.floor(a),
        fb = b2 - Math.floor(b2);
      if (fa < 0.2 || fb < 0.2) keep.push(t);
    }
    const npos = [];
    for (const t of keep)
      for (let k = 0; k < 3; k++)
        npos.push(NP.getX(t + k), NP.getY(t + k), NP.getZ(t + k));
    const net = new THREE.BufferGeometry();
    net.setAttribute("position", new THREE.Float32BufferAttribute(npos, 3));
    acc.add("cloth", net, {
      pre: dip,
      m: M,
      w: B.head,
      color: [0.1, 0.1, 0.06],
      seams: false,
      boxUV: true,
    });
    // chin straps hanging loose from the bails
    for (const s of [1, -1]) {
      const pts = [
        new V3(0.118 * s, 0.0, -0.004),
        new V3(0.108 * s, -0.035, 0.004),
        new V3(0.096 * s, -0.075, 0.018),
        new V3(0.086 * s, -0.11, 0.03),
      ];
      const nrm = pts.map(() => new V3(s, 0, 0.25).normalize());
      acc.add("cloth", strap(pts, nrm, 0.017, 0.0025), {
        m: M,
        w: B.head,
        color: srgb([0.4, 0.37, 0.25]),
      });
      if (s < 0)
        acc.add("metal", sbox(0.022, 0.028, 0.006, 6, 8, 6), {
          m: M.clone().multiply(mT(0.086 * s, -0.118, 0.032)),
          w: B.head,
          color: [0.35, 0.33, 0.27],
        });
    }
  }
  if (C.head === "brodie") {
    const prof = [
      [0, 0.172],
      [0.05, 0.169],
      [0.085, 0.16],
      [0.108, 0.145],
      [0.122, 0.126],
      [0.129, 0.108],
      [0.133, 0.1],
      [0.15, 0.094],
      [0.168, 0.088],
      [0.176, 0.085],
      [0.177, 0.08],
      [0.17, 0.082],
      [0.148, 0.088],
      [0.13, 0.095],
      [0.122, 0.106],
      [0.115, 0.124],
      [0.1, 0.14],
      [0.078, 0.152],
      [0.045, 0.16],
      [0, 0.163],
    ];
    acc.add("metal", lathe(prof, 44), {
      m: place([0, -0.004, 0.004], [-0.07, 0, 0], 0.91, 1),
      w: B.head,
      color: paint(62, 0.35),
    });
    // chinstrap along the face surface
    for (const s of [1, -1]) {
      const dirs = [
        [0.93, 0.5, -0.02],
        [0.96, 0.18, 0.1],
        [0.9, -0.22, 0.34],
        [0.66, -0.58, 0.5],
        [0.3, -0.8, 0.58],
        [0.0, -0.84, 0.62],
      ];
      const pts = [],
        nrm = [];
      for (const [x, y, z] of dirs) {
        const d = new V3(x * s, y, z).normalize(),
          p = sc(d, new V3());
        const nn = d.clone();
        pts.push(p.addScaledVector(nn, 0.004).add(HC));
        nrm.push(nn);
      }
      acc.add("leather", strap(pts, nrm, 0.014, 0.002), {
        w: B.head,
        color: [0.14, 0.1, 0.07],
      });
    }
  }
  if (C.head === "pilotka") {
    const rings = [];
    const N = 14;
    for (let i = 0; i <= N; i++) {
      const u = i / N,
        z = lerp(0.108, -0.108, u);
      const w = 0.071 * Math.pow(Math.sin(PI * lerp(0.08, 0.92, u)), 0.45);
      const h = 0.024 + 0.05 * Math.pow(Math.sin(PI * u), 0.7) + 0.008 * u;
      rings.push({
        c: new V3(0, 0, z),
        ax: AX,
        az: AY,
        rx: w,
        rz: h,
        rzb: 0.006,
        p: 1.45,
      });
    }
    const g = loft(rings, 20, { capStart: true, capEnd: true });
    acc.add("cloth", g, {
      m: place([-0.006, 0.058, -0.006], [0.0, 0.07, 0.2]),
      w: B.head,
      color: (p) => {
        const q = _v4.copy(p).sub(HC);
        let c = paint(63, 0.25)(p);
        return c;
      },
    });
    // curtain fold line (a slightly proud band along the lower edge)
    const band = [];
    for (let i = 0; i <= N; i++) {
      const u = i / N,
        z = lerp(0.106, -0.106, u);
      const w = 0.074 * Math.pow(Math.sin(PI * lerp(0.08, 0.92, u)), 0.45);
      band.push({
        c: new V3(0, 0.012, z),
        ax: AX,
        az: AY,
        rx: w,
        rz: 0.019,
        rzb: 0.012,
        p: 2.6,
      });
    }
    acc.add("cloth", loft(band, 20, { capStart: true, capEnd: true }), {
      m: place([-0.006, 0.058, -0.006], [0.0, 0.07, 0.2]),
      w: B.head,
      color: mul3(col, 0.9),
    });
  }
  if (C.head === "beret") {
    const prof = [
      [0.064, -0.004],
      [0.069, 0.008],
      [0.071, 0.018],
      [0.083, 0.026],
      [0.099, 0.034],
      [0.107, 0.043],
      [0.108, 0.05],
      [0.102, 0.058],
      [0.09, 0.066],
      [0.05, 0.071],
      [0.0, 0.072],
    ];
    const M = place([-0.012, 0.064, -0.012], [0.0, -0.16, 0.26], 0.98, 1.3);
    acc.add("cloth", lathe(prof, 36), {
      m: M,
      w: B.head,
      color: (p) =>
        mul3(col, 0.85 + 0.3 * fbm(p.x * 60, p.y * 60, p.z * 60, 64, 2)),
    });
    acc.add(
      "cloth",
      lathe(
        [
          [0.064, -0.004],
          [0.058, 0.03],
          [0.0, 0.05],
        ],
        24,
      ),
      { m: M, w: B.head, color: mul3(col, 0.5), flip: true },
    );
    acc.add("cloth", cyl(0.003, 0.004, 0.014, 6), {
      m: M.clone().multiply(mT(0, 0.078, 0)),
      w: B.head,
      color: mul3(col, 0.8),
    });
  }
  if (C.female) {
    // bob: falls to the jaw, curled under
    const hair = srgb(C.hair);
    const L = [
      [0.03, 0.084, 0.1],
      [0.0, 0.088, 0.1],
      [-0.03, 0.091, 0.099],
      [-0.058, 0.094, 0.097],
      [-0.074, 0.09, 0.092],
      [-0.08, 0.08, 0.084],
      [-0.075, 0.07, 0.076],
      [-0.05, 0.064, 0.072],
    ];
    const edge = (th) => {
      const e = Math.min(th - 1.12, TAU - 1.12 - th);
      return -0.017 * sstep(0.45, 0.0, e);
    };
    const rings = L.map(([y, rx, rz]) => ({
      c: new V3(HC.x, HC.y + y, HC.z - 0.012),
      ax: AX,
      az: AZ,
      rx: rx * C.face.width,
      rz,
      p: 2.2,
      dr: edge,
    }));
    const inner = L.map(([y, rx, rz]) => ({
      c: new V3(HC.x, HC.y + y, HC.z - 0.012),
      ax: AX,
      az: AZ,
      rx: rx * C.face.width - 0.009,
      rz: rz - 0.009,
      p: 2.2,
      dr: edge,
    }));
    acc.add("skin", loft(rings, 36, { th0: 1.12, thSpan: TAU - 2.24 }), {
      w: B.head,
      color: (p) => {
        const th = Math.atan2(p.x, p.z - HC.z);
        const k = vnoise(th * 60, ((p.y * 7) / 0.267) * 0.27, 3.1, 7);
        return srgb(mul3(C.hair, 0.72 + 0.5 * k));
      },
    });
    acc.add(
      "skin",
      loft(inner, 36, { th0: 1.12, thSpan: TAU - 2.24, flip: true }),
      { w: B.head, color: srgb(mul3(C.hair, 0.55)) },
    );
  }
}

// ---------------------------------------------------------------- assembly
function buildCharacter(C) {
  const acc = new Acc();
  const TS = makeTorso(C);
  const topB = C.top === "leather" ? "leather" : "cloth";
  buildTorso(acc, C, TS);
  buildCollar(acc, C, TS);
  buildNeck(acc, C);
  const textured = typeof document !== "undefined";
  const head = buildHead(acc, C, textured);
  buildHeadgear(acc, C, head.sc);
  buildArms(
    acc,
    C,
    topB,
    srgb(C.topCol),
    C.top === "leather" ? mul3(srgb(C.topCol), 0.75) : null,
  );
  buildHands(acc, C);
  buildLegs(acc, C, srgb(C.trouserCol));
  legwear(acc, C);
  buildBoots(acc, C);
  buildGear(acc, C, TS);
  const k = C.height / BASE_H;
  const geos = acc.finish(k);
  const rest = restPositions(C).map((p) => p.multiplyScalar(k));
  const headB = rest[B.head];
  return {
    geos,
    rest,
    k,
    tris: acc.tris,
    face: head.face,
    // head-bone-relative points (bind rotation is identity so these stay valid in bone space)
    eyeL: head.eyes[0].clone().multiplyScalar(k).sub(headB),
    eyeR: head.eyes[1].clone().multiplyScalar(k).sub(headB),
    headC: HC.clone().multiplyScalar(k).sub(headB),
    mouth: new V3(0, -0.064, 0.09).add(HC).multiplyScalar(k).sub(headB),
    // chest-bone-relative shoulder pocket (right) and sternum
    pocket: new V3(-0.118 * C.shoulder, 1.412, 0.1)
      .multiplyScalar(k)
      .sub(rest[B.chest]),
    sternum: new V3(0, 1.36, 0.13).multiplyScalar(k).sub(rest[B.chest]),
    pouchL: new V3(0.12, 1.0, 0.13).multiplyScalar(k).sub(rest[B.hips]),
    pouchR: new V3(-0.12, 1.0, 0.13).multiplyScalar(k).sub(rest[B.hips]),
  };
}

// ---------------------------------------------------------------- materials
const lin8 = (() => {
  const t = new Float32Array(256);
  for (let i = 0; i < 256; i++) {
    const c = i / 255;
    t[i] = c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  }
  return t;
})();
function avgLinear(tex) {
  const img = tex && tex.image;
  if (!img || !img.data || !img.data.length) return null;
  const d = img.data;
  let r = 0,
    g = 0,
    b = 0,
    n = 0;
  for (let i = 0; i < d.length; i += 4 * 29) {
    r += lin8[d[i]];
    g += lin8[d[i + 1]];
    b += lin8[d[i + 2]];
    n++;
  }
  return n ? [r / n, g / n, b / n] : null;
}
/** cheap subsurface look: wrapped diffuse with a warm red tint where light wraps past the terminator */
const SKIN_CHUNK = (() => {
  const src = THREE.ShaderChunk.lights_physical_pars_fragment;
  const a = "vec3 irradiance = dotNL * directLight.color;";
  const b =
    "reflectedLight.directDiffuse += irradiance * BRDF_Lambert( material.diffuseContribution );";
  if (!src || src.indexOf(a) < 0 || src.indexOf(b) < 0) return null;
  return src
    .replace(
      a,
      a +
        `
	float skMask = smoothstep( 0.06, 0.2, dot( material.diffuseContribution, vec3( 0.3, 0.59, 0.11 ) ) ) * step( material.diffuseContribution.b * 1.15, material.diffuseContribution.r );
	float skWrapNL = saturate( ( dot( geometryNormal, directLight.direction ) + 0.36 * skMask ) / ( 1.0 + 0.36 * skMask ) );
	vec3 skIrr = directLight.color * skWrapNL * mix( vec3( 1.0 ), vec3( 1.0, 0.45, 0.32 ), saturate( ( skWrapNL - dotNL ) * 1.7 ) * skMask );`,
    )
    .replace(
      b,
      "reflectedLight.directDiffuse += skIrr * BRDF_Lambert( material.diffuseContribution );",
    );
})();
function skinShader(m) {
  if (!SKIN_CHUNK) return m;
  m.onBeforeCompile = (sh) => {
    sh.fragmentShader = sh.fragmentShader.replace(
      "#include <lights_physical_pars_fragment>",
      SKIN_CHUNK,
    );
  };
  m.customProgramCacheKey = () => "avatar_skin_wrap";
  return m;
}
function makeMaterials(T) {
  const env = T && T.envMap ? T.envMap : null;
  const texOf = (name) => {
    try {
      return T && T.tex ? T.tex(name) : null;
    } catch (e) {
      return null;
    }
  };
  const fromTex = (name, o) => {
    const m = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: o.rough ?? 1,
      metalness: 0,
      envMap: env,
      envMapIntensity: o.env ?? 0.35,
    });
    const tx = texOf(name);
    const avg = tx && tx.map ? avgLinear(tx.map) : null;
    if (avg) {
      m.map = tx.map;
      m.color.setRGB(
        1 / Math.max(0.02, avg[0]),
        1 / Math.max(0.02, avg[1]),
        1 / Math.max(0.02, avg[2]),
      );
    } else m.roughness = o.fallRough ?? 0.85;
    if (tx && tx.normalMap) {
      m.normalMap = tx.normalMap;
      m.normalScale = new THREE.Vector2(o.ns ?? 1, o.ns ?? 1);
    }
    if (tx && tx.roughnessMap && avg) m.roughnessMap = tx.roughnessMap;
    m.name = "avatar_" + name;
    return m;
  };
  const cloth = fromTex("sleeve_olive", { env: 0.25, ns: 0.8 });
  const leather = fromTex("leather", { env: 0.5, ns: 0.8, fallRough: 0.6 });
  const metal = fromTex("helmet_steel", { env: 0.6, ns: 1, fallRough: 0.6 });
  try {
    const hm = T && T.mat ? T.mat("helmet_steel") : null;
    if (hm && hm.metalnessMap) {
      metal.metalnessMap = hm.metalnessMap;
      metal.metalness = 1;
    }
  } catch (e) {
    /* stub */
  }
  const skin = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.64,
    metalness: 0,
    envMap: env,
    envMapIntensity: 0.22,
    name: "avatar_skin",
  });
  skin.emissive = new THREE.Color(0.022, 0.006, 0.003);
  skin.emissiveIntensity = 1;
  const ltx = texOf("leather");
  if (ltx && ltx.normalMap) {
    skin.normalMap = ltx.normalMap;
    skin.normalScale = new THREE.Vector2(0.22, 0.22);
  }
  skinShader(skin);
  return { cloth, leather, metal, skin };
}

// ====================================================================================== weapons (3rd person)
const PISTOLS = new Set(["m1911", "aether"]);
const RELOAD_CLASS = {
  m1911: "pistol",
  aether: "capsule",
  kar98k: "bolt",
  trench: "shell",
  mp40: "mag",
  thompson: "mag",
  stg44: "mag",
  mg42: "belt",
};
const RELOAD_DUR = {
  m1911: [1.5, 1.9],
  aether: [2.2, 2.2],
  kar98k: [3.1, 3.1],
  trench: [0.5, 0.5],
  mp40: [2.2, 2.8],
  thompson: [2.3, 2.9],
  stg44: [2.4, 3.0],
  mg42: [5.0, 5.0],
};
const KEEP_PARTS = new Set([
  "mag",
  "bolt",
  "pump",
  "cover",
  "belt",
  "clip",
  "capsule",
]);
const FALLBACK_LEFT = {
  kar98k: [0.41, 0.04, 0],
  trench: [0.4, 0, 0],
  mp40: [0.12, 0.018, 0],
  thompson: [0.3, 0.04, 0],
  stg44: [0.32, 0.0, 0],
  mg42: [0.33, 0.0, 0],
  m1911: [0.006, -0.009, -0.002],
  aether: [0.006, -0.008, -0.002],
};

/** vertex-clustering decimation (cell in metres). Keeps creases by splitting normals into bins. */
function clusterDecimate(geo, cell) {
  const P = geo.attributes.position,
    N = geo.attributes.normal,
    UV = geo.attributes.uv;
  const idx = geo.index ? geo.index.array : null;
  const nIdx = idx ? idx.length : P.count;
  const cells = new Map(),
    cpos = [],
    vkeys = new Map(),
    verts = [];
  const cid = new Int32Array(P.count),
    vid = new Int32Array(P.count);
  for (let i = 0; i < P.count; i++) {
    const x = P.getX(i),
      y = P.getY(i),
      z = P.getZ(i);
    const ck = `${Math.floor(x / cell)},${Math.floor(y / cell)},${Math.floor(z / cell)}`;
    let c = cells.get(ck);
    if (c === undefined) {
      c = cpos.length;
      cells.set(ck, c);
      cpos.push([0, 0, 0, 0]);
    }
    const C = cpos[c];
    C[0] += x;
    C[1] += y;
    C[2] += z;
    C[3]++;
    cid[i] = c;
    const nx = N ? N.getX(i) : 0,
      ny = N ? N.getY(i) : 1,
      nz = N ? N.getZ(i) : 0;
    const vk =
      c +
      "|" +
      Math.round(nx * 1.6) +
      "," +
      Math.round(ny * 1.6) +
      "," +
      Math.round(nz * 1.6);
    let v = vkeys.get(vk);
    if (v === undefined) {
      v = verts.length;
      vkeys.set(vk, v);
      verts.push({
        c,
        n: [0, 0, 0],
        uv: UV ? [UV.getX(i), UV.getY(i)] : [0, 0],
      });
    }
    const V = verts[v];
    V.n[0] += nx;
    V.n[1] += ny;
    V.n[2] += nz;
    vid[i] = v;
  }
  const out = [];
  for (let t = 0; t < nIdx; t += 3) {
    const i0 = idx ? idx[t] : t,
      i1 = idx ? idx[t + 1] : t + 1,
      i2 = idx ? idx[t + 2] : t + 2;
    if (cid[i0] === cid[i1] || cid[i1] === cid[i2] || cid[i0] === cid[i2])
      continue;
    out.push(vid[i0], vid[i1], vid[i2]);
  }
  const pos = new Float32Array(verts.length * 3),
    nor = new Float32Array(verts.length * 3),
    uv = new Float32Array(verts.length * 2);
  verts.forEach((V, i) => {
    const C = cpos[V.c];
    pos[i * 3] = C[0] / C[3];
    pos[i * 3 + 1] = C[1] / C[3];
    pos[i * 3 + 2] = C[2] / C[3];
    const l = Math.hypot(V.n[0], V.n[1], V.n[2]) || 1;
    nor[i * 3] = V.n[0] / l;
    nor[i * 3 + 1] = V.n[1] / l;
    nor[i * 3 + 2] = V.n[2] / l;
    uv[i * 2] = V.uv[0];
    uv[i * 2 + 1] = V.uv[1];
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  g.setAttribute("normal", new THREE.BufferAttribute(nor, 3));
  g.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
  g.setIndex(out);
  g.computeBoundingSphere();
  return g;
}
function mergeGeos(list) {
  let nv = 0,
    ni = 0;
  for (const g of list) {
    nv += g.attributes.position.count;
    ni += g.index ? g.index.count : g.attributes.position.count;
  }
  const pos = new Float32Array(nv * 3),
    nor = new Float32Array(nv * 3),
    uv = new Float32Array(nv * 2),
    ix = new Uint32Array(ni);
  let ov = 0,
    oi = 0;
  for (const g of list) {
    const P = g.attributes.position,
      N = g.attributes.normal,
      U = g.attributes.uv,
      n = P.count;
    pos.set(P.array.subarray(0, n * 3), ov * 3);
    if (N) nor.set(N.array.subarray(0, n * 3), ov * 3);
    if (U) uv.set(U.array.subarray(0, n * 2), ov * 2);
    if (g.index) {
      const I = g.index.array;
      for (let k = 0; k < I.length; k++) ix[oi + k] = I[k] + ov;
      oi += I.length;
    } else {
      for (let k = 0; k < n; k++) ix[oi + k] = ov + k;
      oi += n;
    }
    ov += n;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  g.setAttribute("normal", new THREE.BufferAttribute(nor, 3));
  g.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
  g.setIndex(new THREE.BufferAttribute(ix, 1));
  return g;
}
/** Build a cached third-person template of a weapon: merged by (part, material), decimated. */
function buildGunTemplate(bwm, T, id, upgraded, cell0 = 0.0028) {
  const src = bwm(id, T, upgraded);
  src.updateMatrixWorld(true);
  const inv = new M4().copy(src.matrixWorld).invert();
  const partFrame = new Map(); // part object -> {pos, quat, inv}
  const frameOf = (part) => {
    let f = partFrame.get(part);
    if (!f) {
      const m = new M4().multiplyMatrices(inv, part.matrixWorld);
      const pos = new V3(),
        quat = new Q4(),
        scl = new V3();
      m.decompose(pos, quat, scl);
      const pose = new M4().compose(pos, quat, new V3(1, 1, 1));
      f = {
        name: part.name,
        pos,
        quat,
        inv: pose.clone().invert(),
        restVis: part.userData.restVis !== false,
      };
      partFrame.set(part, f);
    }
    return f;
  };
  const ownerOf = (o) => {
    let q = o.parent;
    while (q && q !== src) {
      if (q.userData && q.userData.part && KEEP_PARTS.has(q.name)) return q;
      q = q.parent;
    }
    return null;
  };
  const buckets = new Map(),
    rawList = [];
  const markers = {};
  let rawTris = 0;
  src.traverse((o) => {
    if (o.userData && o.userData.marker) {
      const m = new M4().multiplyMatrices(inv, o.matrixWorld),
        pos = new V3(),
        quat = new Q4(),
        scl = new V3();
      m.decompose(pos, quat, scl);
      const owner = ownerOf(o);
      const mk = { pos, quat, part: owner ? owner.name : null, local: null };
      if (owner) mk.local = pos.clone().applyMatrix4(frameOf(owner).inv);
      markers[o.name] = mk;
      return;
    }
    if (!o.isMesh) return;
    const owner = ownerOf(o);
    for (let q = o; q && q !== src && q !== owner; q = q.parent)
      if (
        !q.visible &&
        !(q.userData && q.userData.restVis === false && q === owner)
      )
        return;
    const f = owner ? frameOf(owner) : null;
    const m = new M4().multiplyMatrices(inv, o.matrixWorld);
    if (f) m.premultiply(f.inv);
    const g = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone();
    for (const k of Object.keys(g.attributes))
      if (!["position", "normal", "uv"].includes(k)) g.deleteAttribute(k);
    if (!g.attributes.normal) g.computeVertexNormals();
    g.applyMatrix4(m);
    rawTris += g.attributes.position.count / 3;
    const mat = Array.isArray(o.material) ? o.material[0] : o.material;
    rawList.push({ owner: f, mat, g });
  });
  // fold minor dark / small-part materials into the gun's primary metal (fewer draw calls at 3rd-person range)
  const area = new Map();
  for (const r of rawList)
    area.set(r.mat, (area.get(r.mat) || 0) + r.g.attributes.position.count);
  const isCamo = (m) => !!(m && /camo/.test(m.name || ""));
  const special = (m) =>
    !m ||
    m.transparent ||
    (!isCamo(m) &&
      m.emissive &&
      m.emissive.getHex &&
      m.emissive.getHex() !== 0 &&
      (m.emissiveIntensity ?? 1) > 0.05) ||
    /wood|bakelite/.test(m.name || "");
  let primary = null,
    best = -1;
  for (const [m, a] of area)
    if (!special(m) && (isCamo(m) ? a * 4 : a) > best) {
      best = isCamo(m) ? a * 4 : a;
      primary = m;
    }
  for (const r of rawList) {
    const m = r.mat && !special(r.mat) && primary ? primary : r.mat;
    const key = (r.owner ? r.owner.name : "") + "|" + (m ? m.uuid : "none");
    let bk = buckets.get(key);
    if (!bk) buckets.set(key, (bk = { owner: r.owner, mat: m, geos: [] }));
    bk.geos.push(r.g);
  }
  const root = new THREE.Group();
  root.name = "tp_" + id;
  const parts = {};
  let tris = 0;
  const cell = rawTris > 15000 ? cell0 * 1.3 : cell0;
  for (const bk of buckets.values()) {
    const merged = mergeGeos(bk.geos);
    const dec = clusterDecimate(merged, cell);
    merged.dispose();
    for (const g of bk.geos) g.dispose();
    tris += dec.index.count / 3;
    const mesh = new THREE.Mesh(dec, bk.mat);
    mesh.castShadow = true;
    mesh.receiveShadow = false;
    if (bk.owner) {
      let pg = parts[bk.owner.name];
      if (!pg) {
        pg = parts[bk.owner.name] = new THREE.Group();
        pg.name = bk.owner.name;
        pg.position.copy(bk.owner.pos);
        pg.quaternion.copy(bk.owner.quat);
        pg.userData.restPos = bk.owner.pos.clone();
        pg.userData.restQuat = bk.owner.quat.clone();
        pg.userData.restVis = bk.owner.restVis;
        pg.visible = bk.owner.restVis;
        root.add(pg);
      }
      pg.add(mesh);
    } else root.add(mesh);
  }
  // dispose the source
  src.traverse((o) => {
    if (o.isMesh && o.geometry) o.geometry.dispose();
  });
  // ---- grips (weapons agent's userData.grips first, then markers, then bbox fallback)
  const bb = new THREE.Box3().setFromObject(root);
  const G = src.userData.grips || {};
  const mk = (n) => markers[n];
  const pistol = PISTOLS.has(id);
  const right = G.right
    ? G.right.clone()
    : mk("hR")
      ? mk("hR").pos.clone()
      : new V3();
  const rightQ = G.rightQuat
    ? G.rightQuat.clone()
    : mk("hR")
      ? mk("hR").quat.clone()
      : new Q4().setFromAxisAngle(AZ, -0.35);
  const left = G.left
    ? G.left.clone()
    : mk("hL")
      ? mk("hL").pos.clone()
      : new V3(...(FALLBACK_LEFT[id] || [0.3, 0, 0]));
  const leftQ = G.leftQuat
    ? G.leftQuat.clone()
    : mk("hL")
      ? mk("hL").quat.clone()
      : pistol
        ? new Q4().setFromEuler(new THREE.Euler(-PI / 2, -PI / 2, 0))
        : new Q4().setFromEuler(new THREE.Euler(PI / 2, 0, PI / 2));
  const muzzle = G.muzzle
    ? G.muzzle.clone()
    : mk("muzzle")
      ? mk("muzzle").pos.clone()
      : new V3(bb.max.x, (bb.max.y + bb.min.y) * 0.6, 0);
  let stock = pistol
    ? null
    : G.stock
      ? G.stock.clone()
      : mk("stock")
        ? mk("stock").pos.clone()
        : null;
  if (!pistol && !stock) {
    // derive: centre of the rearmost 2 cm of the model
    const s = new V3();
    let n = 0;
    root.traverse((o) => {
      if (!o.isMesh || o.parent !== root) return;
      const P = o.geometry.attributes.position;
      for (let i = 0; i < P.count; i++)
        if (P.getX(i) < bb.min.x + 0.02) {
          s.x += P.getX(i);
          s.y += P.getY(i);
          s.z += P.getZ(i);
          n++;
        }
    });
    stock = n ? s.multiplyScalar(1 / n) : new V3(bb.min.x, 0, 0);
  }
  const sightR = mk("sightRear")
    ? mk("sightRear").pos.clone()
    : new V3(0, bb.max.y, 0);
  const sightF = mk("sightFront")
    ? mk("sightFront").pos.clone()
    : new V3(muzzle.x, bb.max.y, 0);
  // left grip riding on a moving part (trench pump)?
  let leftPart = null,
    leftLocal = null;
  if (mk("hL") && mk("hL").part && left.distanceTo(mk("hL").pos) < 0.01) {
    leftPart = mk("hL").part;
    leftLocal = mk("hL").local.clone();
  }
  const partLocal = (name, p) =>
    parts[name]
      ? p
          .clone()
          .applyMatrix4(
            new M4()
              .compose(
                parts[name].userData.restPos,
                parts[name].userData.restQuat,
                new V3(1, 1, 1),
              )
              .invert(),
          )
      : null;
  const axisR = new V3(0, 1, 0).applyQuaternion(rightQ),
    axisL = new V3(0, 1, 0).applyQuaternion(leftQ);
  const leftHoriz = Math.abs(axisL.x) > 0.7;
  const rR = Math.min(
    pistol ? 0.019 : 0.022,
    measureRadius(root, right, axisR, 0.034, 0.01, 0.55, 0.016),
  );
  const rL = pistol
    ? rR
    : Math.min(
        leftHoriz ? 0.022 : 0.026,
        measureRadius(root, left, axisL, 0.04, 0.02, 0.6, 0.018),
      );
  const info = {
    gripAxisR: axisR,
    gripAxisL: axisL,
    leftHoriz,
    rR,
    rL,
    id,
    upgraded,
    pistol,
    cls: RELOAD_CLASS[id] || "mag",
    rawTris,
    tris,
    bbox: bb,
    right,
    rightQ,
    left,
    leftQ,
    leftPart,
    leftLocal,
    muzzle,
    stock,
    sightR,
    sightF,
    markers: Object.fromEntries(
      Object.entries(markers).map(([k, v]) => [
        k,
        { pos: v.pos, quat: v.quat, part: v.part, local: v.local },
      ]),
    ),
    magLocal: parts.mag ? partLocal("mag", parts.mag.userData.restPos) : null,
    drawCalls: 0,
  };
  root.traverse((o) => {
    if (o.isMesh) info.drawCalls++;
  });
  root.userData.info = info;
  return root;
}
/** typical radius of the solid around a grip axis (for finger wrapping) */
function measureRadius(root, C, A, maxR, slab, pct, fallback) {
  const ds = [],
    v = new V3(),
    d = new V3();
  root.updateMatrixWorld(true);
  root.traverse((o) => {
    if (!o.isMesh) return;
    const P = o.geometry.attributes.position;
    for (let i = 0; i < P.count; i++) {
      v.fromBufferAttribute(P, i).applyMatrix4(o.matrixWorld);
      d.subVectors(v, C);
      const al = d.dot(A);
      if (Math.abs(al) > slab) continue;
      const r = Math.sqrt(Math.max(0, d.lengthSq() - al * al));
      if (r < maxR) ds.push(r);
    }
  });
  if (ds.length < 12) return fallback;
  ds.sort((a, b) => a - b);
  return clamp(ds[Math.floor(ds.length * pct)], 0.011, maxR * 0.85);
}
function cloneGun(tpl) {
  const info = tpl.userData.info;
  const keep = new Map();
  tpl.traverse((o) => {
    keep.set(o, o.userData);
    o.userData = {};
  });
  const g = tpl.clone(true);
  for (const [o, u] of keep) o.userData = u;
  g.userData = { info, parts: {} };
  for (const c of g.children) {
    if (c.isGroup) {
      c.userData = {
        restPos: c.position.clone(),
        restQuat: c.quaternion.clone(),
        restVis: c.visible,
      };
      g.userData.parts[c.name] = c;
    }
  }
  return g;
}

// ====================================================================================== hand poses
// 16 numbers: thumb [opposition, c0, c1, c2], then index / middle / ring / pinky [c0, c1, c2]
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

class Avatar {
  constructor(mgr, id, opts) {
    this.mgr = mgr;
    this.id = id;
    this.slot = (((opts.slot | 0) % 4) + 4) % 4;
    this.name = opts.name || "";
    this.C = CHARACTERS[this.slot];
    const D = (this.D = mgr._charData(this.slot));
    this.k = D.k;
    const rest = D.rest;
    this.root = new THREE.Group();
    this.root.name = "avatar_" + id;
    this.bones = BONES.map((n) => {
      const b = new THREE.Bone();
      b.name = n;
      return b;
    });
    for (let i = 0; i < NB; i++) {
      const b = this.bones[i],
        p = PARENT[i];
      if (p < 0) {
        this.root.add(b);
        b.position.copy(rest[i]);
      } else {
        this.bones[p].add(b);
        b.position.copy(rest[i]).sub(rest[p]);
      }
    }
    this.root.updateMatrixWorld(true);
    this.skeleton = new THREE.Skeleton(
      this.bones,
      rest.map((p) => new M4().makeTranslation(-p.x, -p.y, -p.z)),
    );
    this.meshes = [];
    for (const k of ["cloth", "leather", "skin", "metal"]) {
      if (!D.geos[k]) continue;
      const m = new THREE.SkinnedMesh(
        D.geos[k],
        k === "skin" ? mgr._skinMat(this.slot) : mgr.mats[k],
      );
      m.name = "avatar_" + k;
      m.castShadow = true;
      m.receiveShadow = true;
      m.bind(this.skeleton, new M4());
      m.boundingSphere = new THREE.Sphere(new V3(0, 0.9, 0), 1.7);
      m.boundingBox = new THREE.Box3(
        new V3(-1.4, -0.3, -1.4),
        new V3(1.4, 2.2, 1.4),
      );
      this.root.add(m);
      this.meshes.push(m);
    }
    // restLen
    this.L1 = rest[B.faL].distanceTo(rest[B.uaL]);
    this.L2 = rest[B.handL].distanceTo(rest[B.faL]);
    this.T1 = rest[B.shL].distanceTo(rest[B.thL]);
    this.T2 = rest[B.ftL].distanceTo(rest[B.shL]);
    this.ankleH = rest[B.ftL].y;
    this.ballOff = new V3().subVectors(rest[B.toeL], rest[B.ftL]); // ankle -> ball (bind)
    this.hipsRestY = rest[B.hips].y;
    // world-space pose buffers
    this.Wp = rest.map((p) => p.clone());
    this.Wq = rest.map(() => new Q4());
    this.off = rest.map((p, i) =>
      PARENT[i] < 0 ? p.clone() : p.clone().sub(rest[PARENT[i]]),
    );
    // state
    this.st = {
      pos: new V3(),
      yaw: 0,
      pitch: 0,
      vel: new V3(),
      grounded: true,
      crouching: false,
      sprinting: false,
      ads: false,
      reloading: false,
      downed: false,
      reviving: false,
      beingRevived: false,
      weaponId: "m1911",
      upgraded: false,
      alive: true,
    };
    this.stAge = 0;
    this.started = false;
    this.rpos = new V3();
    this.prev = new V3();
    this.vs = new V3();
    this.accel = new V3();
    this.aimYaw = 0;
    this.aimPitch = 0;
    this.bodyYaw = 0;
    this.turning = false;
    this.b = {
      crouch: 0,
      sprint: 0,
      ads: 0,
      downed: 0,
      kneel: 0,
      air: 0,
      move: 0,
      pistol: 1,
      beingRev: 0,
    };
    this.time = 0;
    this.visible = true;
    this.userVisible = true;
    // gait
    this.phase = 0.25;
    this.parked = true;
    this.settle = -1;
    this.crawlPh = 0;
    this.feet = [0, 1].map((i) => ({
      lock: new V3(),
      yaw: 0,
      swing: false,
      from: new V3(),
      fromYaw: 0,
      cur: new V3(),
      curYaw: 0,
      pitch: 0,
      lift: 0,
      land: 0,
    }));
    this.landDip = 0;
    this.landVel = 0;
    this.airT = 0;
    this.vy = 0;
    // recoil / flinch springs
    this.rec = { x: 0, v: 0 };
    this.flinch = { x: 0, v: 0, yaw: 0, roll: 0 };
    this.act = null;
    this.reload = null;
    this.cycle = null;
    this.P1 = new Pose();
    this.P2 = new Pose();
    // weapon
    this.gun = null;
    this.gunId = null;
    this.gunUp = false;
    this.swapT = 1;
    this.pendingGun = null;
    this.flash = mgr._makeFlash();
    this.flashT = 0;
    this.flashScale = 1;
    this.props = mgr._makeProps();
    this.root.add(this.props.root);
    this.mgr.scene.add(this.root);
    this.muzzleW = new V3();
    this.headW = new V3();
    this._tmp = Array.from({ length: 16 }, () => new V3());
    this._tq = Array.from({ length: 8 }, () => new Q4());
    this.footsteps = mgr.footsteps;
    this._fwd = new V3();
    this._left = new V3();
    this._fwd2 = new V3();
    this._left2 = new V3();
    this._fp = [new V3(), new V3()];
    this._fq = [new Q4(), new Q4()];
    this.gunP = new V3();
    this.gunQ = new Q4();
    this.gripW = [new V3(), new V3()];
    this.handQW = [new Q4(), new Q4()];
    for (let i = 0; i <= 10; i++) this["_ik" + i] = new V3();
    for (let i = 0; i <= 3; i++) this["_fk" + i] = new V3();
    this._pole = new V3();
    this._gq = new Q4();
    this._gp = new V3();
    this.handErr = [0, 0];
  }
  dispose() {
    this.root.removeFromParent();
    if (this.gun) this.gun.removeFromParent();
  }

  // ---------------------------------------------------------------- state input
  setState(s) {
    const S = this.st;
    if (s.pos) S.pos.copy(s.pos);
    if (s.vel) S.vel.set(s.vel.x || 0, 0, s.vel.z || 0);
    for (const k of ["yaw", "pitch"])
      if (typeof s[k] === "number" && isFinite(s[k])) S[k] = s[k];
    for (const k of [
      "grounded",
      "crouching",
      "sprinting",
      "ads",
      "reloading",
      "downed",
      "reviving",
      "beingRevived",
      "upgraded",
      "alive",
    ])
      if (s[k] !== undefined) S[k] = !!s[k];
    if (s.weaponId) S.weaponId = s.weaponId;
    this.stAge = 0;
    if (!this.started) {
      this.started = true;
      this.rpos.copy(S.pos);
      this.prev.copy(S.pos);
      this.aimYaw = this.bodyYaw = S.yaw + PI;
      this.aimPitch = S.pitch;
      this.b.downed = S.downed ? 1 : 0;
      this.b.crouch = S.crouching ? 1 : 0;
      this._resetFeet();
    }
    if (S.reloading && !this.reload) this._startReload(false);
  }
  _resetFeet() {
    for (let i = 0; i < 2; i++) {
      const f = this.feet[i];
      this._home(i, f.lock);
      f.cur.copy(f.lock);
      f.yaw = f.curYaw = f.fromYaw = this._homeYaw(i);
      f.swing = false;
    }
    this.parked = true;
  }
  event(type, data = {}) {
    const S = this.st;
    switch (type) {
      case "fire":
        this._fire(data);
        break;
      case "reload":
        this._startReload(!!data.empty, data.weaponId);
        break;
      case "knife":
        this.act = {
          type: "knife",
          t: 0,
          dur: 0.62,
          side: Math.random() < 0.5 ? 1 : -1,
        };
        break;
      case "grenade":
        this.act = { type: "grenade", t: 0, dur: 1.05 };
        break;
      case "swap":
        this.pendingGun = data.weaponId || S.weaponId;
        this.swapT = 0;
        if (data.weaponId) S.weaponId = data.weaponId;
        break;
      case "drink":
        this.act = { type: "drink", t: 0, dur: 2.3, color: data.color };
        this.props.setBottleColor(data.color);
        break;
      case "hurt":
        this.flinch.v += 9 + Math.random() * 4;
        this.flinch.yaw = (Math.random() - 0.5) * 0.5;
        this.flinch.roll = (Math.random() - 0.5) * 0.4;
        break;
      case "revived":
        this.act = { type: "revived", t: 0, dur: 1.0 };
        break;
      default:
        break;
    }
  }
  _fire(data) {
    const id = this.gunId || this.st.weaponId;
    const kick =
      {
        m1911: 1.0,
        aether: 0.8,
        kar98k: 1.5,
        trench: 1.8,
        mp40: 0.55,
        thompson: 0.6,
        stg44: 0.7,
        mg42: 0.65,
      }[id] || 1;
    this.rec.v += 26 * kick;
    this.flashT = 0.055 + (id === "mg42" || id === "trench" ? 0.015 : 0);
    this.flashScale =
      (id === "trench"
        ? 1.5
        : id === "mg42"
          ? 1.3
          : PISTOLS.has(id)
            ? 0.8
            : 1.1) *
      (0.85 + Math.random() * 0.3);
    this.flashRoll = Math.random() * TAU;
    this.flash.material =
      id === "aether" ? this.mgr._flashMatAether : this.mgr._flashMat;
    this.firedAt = this.time;
    this.mgr._pulseLight(this, id);
    if (id === "kar98k") this.cycle = { type: "bolt", t: -0.12, dur: 0.95 };
    if (id === "trench") this.cycle = { type: "pump", t: -0.1, dur: 0.6 };
  }
  _startReload(empty, wid) {
    const id = wid || this.gunId || this.st.weaponId;
    const d = RELOAD_DUR[id] || [2.2, 2.6];
    const cls = RELOAD_CLASS[id] || "mag";
    this.reload = {
      cls,
      id,
      t: 0,
      dur: empty ? d[1] : d[0],
      empty,
      loop: cls === "shell",
    };
    this.cycle = null;
  }

  // ---------------------------------------------------------------- helpers
  _home(i, out) {
    const b = this.b,
      s = i === 0 ? 1 : -1,
      ps = b.pistol;
    const yaw = this.bodyYaw;
    const w = lerp(0.115, 0.1, b.move) + 0.035 * b.crouch;
    // bladed stance: left foot forward, right foot back (rifle); squarer for pistols
    const st = (1 - b.move) * (1 - b.sprint);
    const f =
      s > 0
        ? lerp(0.085, 0.045, ps) * st + 0.07 * b.crouch * st
        : lerp(-0.075, -0.035, ps) * st - 0.08 * b.crouch * st;
    const F = fwdOf(yaw, this._hf || (this._hf = new V3())),
      L = leftOf(yaw, this._hl || (this._hl = new V3()));
    return out
      .copy(this.rpos)
      .addScaledVector(L, s * w)
      .addScaledVector(F, f)
      .setY(this.rpos.y);
  }
  _homeYaw(i) {
    const s = i === 0 ? 1 : -1,
      b = this.b;
    const still = 1 - b.move;
    const out =
      s > 0
        ? 0.12 + 0.1 * still * (1 - b.pistol)
        : -0.14 - 0.42 * still * (1 - b.pistol) - 0.3 * b.crouch * still;
    return this.bodyYaw + out;
  }

  // ---------------------------------------------------------------- per-frame
  update(dt) {
    if (!this.started) return;
    dt = clamp(dt, 0.0001, 0.05);
    this.time += dt;
    this.stAge += dt;
    const S = this.st,
      b = this.b;
    const vis = S.alive && this.userVisible;
    this.root.visible = vis;
    if (!vis) {
      this.rpos.copy(S.pos);
      this.prev.copy(S.pos);
      this._hiddenFrames = (this._hiddenFrames || 0) + 1;
      return;
    }
    if (this._hiddenFrames) {
      this._hiddenFrames = 0;
      this._resetFeet();
    }
    this._syncGun(dt);
    // ---- smoothing of network state
    const tgt = _v1
      .copy(S.pos)
      .addScaledVector(S.vel, Math.min(this.stAge, 0.12));
    if (tgt.distanceToSquared(this.rpos) > 6.25) {
      this.rpos.copy(tgt);
      this.prev.copy(tgt);
      this.vs.set(0, 0, 0);
      this._resetFeet();
    } else {
      this.rpos.x = damp(this.rpos.x, tgt.x, 18, dt);
      this.rpos.z = damp(this.rpos.z, tgt.z, 18, dt);
      this.rpos.y = damp(this.rpos.y, tgt.y, 24, dt);
    }
    const vmx = (this.rpos.x - this.prev.x) / dt,
      vmz = (this.rpos.z - this.prev.z) / dt,
      vmy = (this.rpos.y - this.prev.y) / dt;
    this.prev.copy(this.rpos);
    const ovx = this.vs.x,
      ovz = this.vs.z;
    this.vs.x = damp(this.vs.x, vmx, 14, dt);
    this.vs.z = damp(this.vs.z, vmz, 14, dt);
    this.accel.x = damp(this.accel.x, (this.vs.x - ovx) / dt, 6, dt);
    this.accel.z = damp(this.accel.z, (this.vs.z - ovz) / dt, 6, dt);
    this.vy = damp(this.vy, vmy, 20, dt);
    const speed = Math.hypot(this.vs.x, this.vs.z);
    this.aimYaw = dampA(this.aimYaw, S.yaw + PI, 20, dt);
    this.aimPitch = damp(this.aimPitch, clamp(S.pitch, -1.35, 1.35), 20, dt);
    // ---- blends
    const busyHands =
      !!(this.act && this.act.type !== "revived") || !!this.reload;
    b.crouch = damp(b.crouch, S.crouching && !S.downed ? 1 : 0, 9, dt);
    b.sprint = damp(
      b.sprint,
      S.sprinting && speed > 2.2 && !S.downed && !busyHands ? 1 : 0,
      7,
      dt,
    );
    b.ads = damp(
      b.ads,
      S.ads && !S.sprinting && !S.downed && !busyHands ? 1 : 0,
      13,
      dt,
    );
    b.downed = S.downed
      ? Math.min(1, b.downed + dt * 1.7)
      : Math.max(0, b.downed - dt * 1.25);
    b.kneel = damp(b.kneel, S.reviving && !S.downed ? 1 : 0, 6, dt);
    b.air = damp(
      b.air,
      S.grounded || S.downed ? 0 : 1,
      S.grounded ? 16 : 9,
      dt,
    );
    b.move = damp(b.move, speed > 0.3 ? 1 : 0, 6, dt);
    b.beingRev = damp(b.beingRev, S.beingRevived ? 1 : 0, 4, dt);
    const gi = this.gun ? this.gun.userData.info : null;
    b.pistol = damp(b.pistol, gi && gi.pistol ? 1 : 0, 12, dt);
    // ---- springs
    const R = this.rec;
    R.v += (-260 * R.x - 22 * R.v) * dt;
    R.x += R.v * dt;
    const Fl = this.flinch;
    Fl.v += (-140 * Fl.x - 13 * Fl.v) * dt;
    Fl.x += Fl.v * dt;
    this.landVel += (-180 * this.landDip - 16 * this.landVel) * dt;
    this.landDip += this.landVel * dt;
    // ---- action timers
    if (this.act) {
      this.act.t += dt;
      if (this.act.t >= this.act.dur) this.act = null;
    }
    if (this.cycle) {
      this.cycle.t += dt;
      if (this.cycle.t >= this.cycle.dur) this.cycle = null;
    }
    if (this.reload) {
      const r = this.reload;
      const fast = !S.reloading && r.t > 0.25 && !r.loop ? 3 : 1;
      r.t += dt * fast;
      if (r.loop) {
        if (!S.reloading && r.t > 0.4) {
          r.loop = false;
          r.end = r.t;
        }
      }
      if (
        !r.loop &&
        r.t >= (r.end !== undefined ? r.end + (r.empty ? 0.85 : 0.45) : r.dur)
      )
        this.reload = null;
    }
    if (this.swapT < 1) this.swapT = Math.min(1, this.swapT + dt / 0.72);
    if (this.flashT > 0) this.flashT -= dt;
    // ---- body yaw (hips / legs)
    const bladeIdle = lerp(-0.42, -0.1, b.pistol);
    if (S.downed) this.bodyYaw = dampA(this.bodyYaw, this.aimYaw, 5, dt);
    else if (speed > 0.35) {
      const mv = Math.atan2(this.vs.x, this.vs.z),
        rel = wrapA(mv - this.aimYaw);
      const off =
        Math.abs(rel) <= PI / 2 + 0.2
          ? rel * 0.5
          : wrapA(rel - PI * Math.sign(rel)) * 0.45;
      const blade = bladeIdle * (1 - clamp(speed / 2.5, 0, 1)) * (1 - b.sprint);
      this.bodyYaw = dampA(
        this.bodyYaw,
        this.aimYaw + off * (1 - b.sprint * 0.5) + blade,
        8,
        dt,
      );
      this.turning = false;
    } else {
      const desired = this.aimYaw + bladeIdle * (1 - b.kneel);
      const diff = wrapA(desired - this.bodyYaw);
      if (Math.abs(diff) > 0.87 || this.turning) {
        this.turning = Math.abs(diff) > 0.06;
        const step = clamp(diff * 6 * dt, -4.5 * dt, 4.5 * dt);
        this.bodyYaw += step;
      }
    }
    // ---- gait + pose
    this._gait(dt, speed);
    const P = this._standPose(this.P1, dt, speed);
    if (b.downed > 0.001)
      P.blend(this._downedPose(this.P2, dt, speed), smooth(b.downed));
    this._animGun(dt);
    this._solve(P, dt);
  }

  // ---------------------------------------------------------------- gait (feet in world space)
  _gait(dt, speed) {
    const b = this.b,
      S = this.st,
      feet = this.feet;
    const run = sstep(1.8, 4.3, speed),
      spr = sstep(4.9, 6.6, speed);
    let cad = lerp(lerp(0.9 + 0.12 * speed, 1.55, run), 1.66, spr);
    cad = lerp(cad, 1.05 + 0.2 * speed, b.crouch);
    const stanceF = clamp(
      lerp(lerp(0.6, 0.34, run), 0.22, spr) + 0.04 * b.crouch,
      0.2,
      0.64,
    );
    const swingF = 1 - stanceF;
    const Tc = 1 / cad;
    this.gaitRun = run;
    this.gaitSpr = spr;
    this.swingF = swingF;
    this.stanceF = stanceF;
    this.cad = cad;
    const grounded = S.grounded || S.downed;
    // landing: re-lock feet under the body
    if (grounded && this.wasAir) {
      this.wasAir = false;
      const imp = clamp(-this.airVy * 0.022, 0.02, 0.14);
      this.landVel -= imp * 9;
      for (let i = 0; i < 2; i++) {
        const f = feet[i];
        this._home(i, f.lock);
        f.lock.addScaledVector(this.vs, 0.05);
        f.cur.copy(f.lock);
        f.yaw = f.curYaw;
        f.swing = false;
        f.lift = 0;
      }
      this.parked = speed < 0.35;
      this.phase = 0.5 - swingF * 0.5;
      this._step(0, 0.7);
    }
    if (!grounded) {
      this.wasAir = true;
      this.airVy = Math.min(this.airVy ?? 0, this.vy);
      if (this.vy > 0) this.airVy = 0;
      return;
    }
    this.airVy = 0;
    if (b.downed > 0.6) {
      for (const f of feet) {
        f.swing = false;
        this._home(feet.indexOf(f), f.lock);
        f.cur.copy(f.lock);
      }
      this.parked = true;
      return;
    }
    const moving = speed > 0.3;
    let dphi = 0;
    if (moving) {
      if (this.parked) {
        const vx = this.vs.x / speed,
          vz = this.vs.z / speed;
        const d0 =
          (feet[0].lock.x - this.rpos.x) * vx +
          (feet[0].lock.z - this.rpos.z) * vz;
        const d1 =
          (feet[1].lock.x - this.rpos.x) * vx +
          (feet[1].lock.z - this.rpos.z) * vz;
        this.phase = (d0 < d1 ? 0 : 0.5) + 0.001;
        this.parked = false;
      }
      dphi = cad * dt;
    } else {
      const anySwing = feet[0].swing || feet[1].swing;
      if (anySwing) {
        dphi = (swingF / 0.26) * dt;
        this.parked = false;
      } else {
        let worst = -1,
          we = 0.085;
        for (let i = 0; i < 2; i++) {
          this._home(i, _v2);
          const e =
            Math.hypot(feet[i].lock.x - _v2.x, feet[i].lock.z - _v2.z) +
            0.1 * Math.abs(wrapA(feet[i].yaw - this._homeYaw(i)));
          if (e > we) {
            we = e;
            worst = i;
          }
        }
        if (worst >= 0) {
          this.phase = worst * 0.5 + 0.0005;
          this.parked = false;
          dphi = (swingF / 0.26) * dt;
        } else this.parked = true;
      }
    }
    this.phase = (this.phase + dphi) % 1;
    const H =
      lerp(lerp(lerp(0.055, 0.17, run), 0.3, spr), 0.075, b.crouch) *
      (moving ? 1 : 0.8);
    for (let i = 0; i < 2; i++) {
      const f = feet[i];
      let local = this.phase - i * 0.5;
      local -= Math.floor(local);
      const inSw = !this.parked && local < swingF;
      if (inSw && !f.swing) {
        f.swing = true;
        f.from.copy(f.lock);
        f.fromYaw = f.yaw;
      }
      const hy = this._homeYaw(i);
      if (f.swing) {
        const u = inSw ? clamp(local / swingF, 0, 1) : 1;
        const tg = this._home(i, _v3);
        if (moving) {
          const lead = Tc * ((1 - u) * swingF + stanceF * 0.42);
          tg.x += this.vs.x * lead;
          tg.z += this.vs.z * lead;
        }
        const e = Math.pow(smooth(u), lerp(1, 1.35, run));
        f.cur.lerpVectors(f.from, tg, e);
        f.cur.y = this.rpos.y;
        f.lift =
          H * Math.pow(Math.sin(PI * Math.pow(u, lerp(1, 0.72, run))), 0.9);
        f.curYaw = f.fromYaw + wrapA(hy - f.fromYaw) * smooth(u);
        f.pitch = moving
          ? lerp(
              lerp(-0.5, -1.0, run),
              lerp(0.22, 0.1, run),
              sstep(0.05, 0.92, u),
            ) *
            (1 - b.crouch * 0.5)
          : 0.12 * Math.sin(PI * u);
        if (u >= 1) {
          f.swing = false;
          f.lock.copy(tg);
          f.yaw = f.curYaw;
          f.lift = 0;
          f.cur.copy(f.lock);
          this._step(i, moving ? clamp(speed / 5, 0.25, 1) : 0.2);
        }
      } else {
        f.cur.copy(f.lock);
        f.curYaw = f.yaw;
        f.lift = 0;
        if (!this.parked && moving) {
          const v = (local - swingF) / stanceF;
          f.pitch =
            lerp(lerp(0.22, 0.1, run), 0, sstep(0.0, 0.14, v)) +
            lerp(0, lerp(-0.5, -0.75, run), sstep(0.62, 1.0, v));
        } else f.pitch = damp(f.pitch, 0, 12, dt);
      }
    }
  }
  _step(i, vol) {
    const a = this.mgr.audio;
    if (!this.footsteps || !a || !a.play) return;
    try {
      a.play("footstep_concrete", {
        volume: 0.35 * vol,
        position: this.feet[i].lock,
        pitch: 0.9 + Math.random() * 0.2,
      });
    } catch (e) {
      /* optional */
    }
  }

  // ---------------------------------------------------------------- FK helpers
  _torsoFK(P) {
    const Wp = this.Wp,
      Wq = this.Wq,
      off = this.off;
    Wp[B.hips].copy(P.hipsP);
    Wq[B.hips].copy(P.tq[0]);
    const chain = [B.spine, B.chest, B.neck, B.head];
    for (let i = 0; i < 4; i++) {
      const bi = chain[i],
        pa = PARENT[bi];
      Wq[bi].copy(P.tq[i + 1]);
      Wp[bi].copy(off[bi]).applyQuaternion(Wq[pa]).add(Wp[pa]);
    }
    for (const S of ["L", "R"]) {
      const c = B["clav" + S],
        u = B["ua" + S];
      Wq[c].copy(Wq[B.chest]);
      Wp[c].copy(off[c]).applyQuaternion(Wq[B.chest]).add(Wp[B.chest]);
      Wp[u].copy(off[u]).applyQuaternion(Wq[c]).add(Wp[c]);
    }
  }
  cp(out, x, y, z) {
    // chest-frame point (metres at base scale)
    return out
      .set(x * this.k, y * this.k, z * this.k)
      .applyQuaternion(this.Wq[B.chest])
      .add(this.Wp[B.chest]);
  }
  hp(out, v) {
    return out.copy(v).applyQuaternion(this.Wq[B.hips]).add(this.Wp[B.hips]);
  }
  /** hand orientation from world "fingers" direction F and palm normal P */
  _handQ(out, side, F, Pn) {
    const H = side === 0 ? HR.L : HR.R;
    const Fc = (this._hqF || (this._hqF = new V3())).copy(F),
      Pc = (this._hqP || (this._hqP = new V3())).copy(Pn);
    const T = this._hqT || (this._hqT = new V3());
    if (side === 0) T.crossVectors(Pc, Fc);
    else T.crossVectors(Fc, Pc);
    return qAlign(out, H.F, H.T, Fc, T);
  }
  _footXf(f, qOut, pOut) {
    const k = this.k;
    const pitch = f.pitch;
    qYPR(qOut, f.curYaw, -pitch, 0);
    const cz = pitch < 0 ? 0.15 * k : -0.07 * k;
    const c = _v4.set(0, -this.ankleH, cz);
    qYPR(_q3, f.curYaw, 0, 0);
    pOut.copy(f.cur);
    pOut.y += this.ankleH + f.lift;
    pOut
      .add(_v5.copy(c).applyQuaternion(_q3))
      .sub(_v6.copy(c).applyQuaternion(qOut));
    return pOut;
  }

  // ---------------------------------------------------------------- standing pose
  _standPose(P, dt, speed) {
    const b = this.b,
      S = this.st,
      k = this.k;
    const run = this.gaitRun || 0,
      spr = this.gaitSpr || 0,
      swingF = this.swingF || 0.4;
    const fwd = fwdOf(this.bodyYaw, this._fwd),
      left = leftOf(this.bodyYaw, this._left);
    const phase = this.phase,
      moving = !this.parked && speed > 0.3;
    // ---- gesture tracks
    const g = this._gestures();
    // ---- pelvis
    const bobA = lerp(0.016, -0.03, run) * b.move * (1 - b.crouch * 0.5);
    const bob = moving
      ? bobA * Math.cos(TAU * 2 * (phase - (1 + swingF) / 2))
      : 0;
    const breathe = Math.sin(this.time * 1.7) * 0.004 * (1 - b.move);
    const sway =
      Math.sin(this.time * 0.43) * 0.012 * (1 - b.move) * (1 - b.crouch);
    let hy =
      this.rpos.y +
      this.hipsRestY * lerp(0.998, 0.66, b.crouch) -
      0.03 * run * (1 - b.crouch) -
      0.03 * spr +
      bob +
      this.landDip +
      breathe * 0.5;
    hy = lerp(hy, this.rpos.y + 0.5 * k, b.kneel);
    const oscY = moving
      ? -lerp(0.05, 0.16, run) *
        Math.cos(TAU * (phase - swingF)) *
        (1 - b.crouch * 0.5)
      : 0;
    const oscR = moving
      ? 0.045 * Math.sin(TAU * (phase - swingF * 0.5)) * (1 - run * 0.5)
      : 0;
    const accF = this.accel.x * fwd.x + this.accel.z * fwd.z;
    const lean =
      0.04 +
      0.1 * run * b.move +
      0.26 * spr +
      0.22 * b.crouch +
      clamp(accF * 0.02, -0.1, 0.12) +
      0.3 * b.kneel +
      g.lean;
    P.hipsP
      .copy(this.rpos)
      .setY(hy)
      .addScaledVector(left, sway)
      .addScaledVector(fwd, -0.03 * b.kneel * k);
    const still = (1 - b.move) * (1 - b.crouch) * (1 - b.kneel);
    const contra = still * (0.035 + 0.02 * Math.sin(this.time * 0.43 + 1));
    qYPR(
      P.tq[0],
      this.bodyYaw + oscY,
      0.07 * run + 0.12 * spr + 0.18 * b.crouch + 0.12 * b.kneel,
      oscR + sway * 0.8 - contra,
    );
    // leg reach: lower the pelvis if a planted foot would over-extend
    const Lmax = (this.T1 + this.T2) * 0.996;
    const fp = this._fp,
      fq = this._fq;
    for (let i = 0; i < 2; i++) this._footXf(this.feet[i], fq[i], fp[i]);
    let limit = 1e9;
    for (let i = 0; i < 2; i++) {
      if (this.feet[i].lift > 0.03 * k || b.air > 0.5) continue;
      const hj = _v3
        .copy(this.off[i === 0 ? B.thL : B.thR])
        .applyQuaternion(P.tq[0])
        .add(P.hipsP);
      const h2 = (fp[i].x - hj.x) ** 2 + (fp[i].z - hj.z) ** 2;
      const lim =
        fp[i].y +
        Math.sqrt(Math.max(0.01, Lmax * Lmax - h2)) -
        (hj.y - P.hipsP.y);
      limit = Math.min(limit, lim);
    }
    if (limit < P.hipsP.y + 0.05) {
      const a = P.hipsP.y,
        bb = limit,
        kk = 0.05,
        h = Math.max(kk - Math.abs(a - bb), 0) / kk;
      P.hipsP.y = Math.min(a, bb) - h * h * kk * 0.25;
    }
    // ---- torso chain
    const ap = this.aimPitch;
    const blade = lerp(-0.44, -0.1, b.pistol) * (1 - b.sprint) * (1 - b.kneel);
    const chestYaw =
      this.aimYaw +
      blade -
      oscY * 0.55 +
      g.chestYaw +
      this.flinch.yaw * this.flinch.x;
    const spineYaw =
      this.bodyYaw + oscY + wrapA(chestYaw - (this.bodyYaw + oscY)) * 0.5;
    const rec = this.rec.x,
      fl = this.flinch.x;
    const adsL = b.ads * (1 - b.pistol);
    qYPR(P.tq[1], spineYaw, lean * 0.8 - ap * 0.14 - fl * 0.08, -oscR * 0.5);
    qYPR(
      P.tq[2],
      chestYaw,
      lean * 0.75 - ap * 0.32 - rec * 0.012 - fl * 0.12 + g.chestPitch,
      -oscR * 0.3 + this.flinch.roll * fl * 0.5 + adsL * 0.04,
    );
    const headYaw = this.aimYaw + g.headYaw + this.flinch.yaw * fl * 0.5;
    const headPitch =
      -ap + g.headPitch - fl * 0.1 + 0.25 * b.kneel * (1 - g.drink);
    qYPR(
      P.tq[3],
      lerp(chestYaw, headYaw, 0.55),
      lerp(lean * 0.75 - ap * 0.32, headPitch, 0.45) + adsL * 0.32,
      adsL * 0.06,
    );
    qYPR(
      P.tq[4],
      headYaw,
      headPitch + adsL * 0.04,
      adsL * 0.2 + this.flinch.roll * fl,
    );
    this._torsoFK(P);
    // ---- gun
    this._gunPose(P, g, fwd, left, moving);
    // ---- hands
    for (let i = 0; i < 2; i++) {
      const H = P.hand[i];
      H.onGun = i === 0 ? g.onL : g.onR;
      H.gp = i === 0 ? g.poseL : g.poseR;
      const base = this._poseArr(H.gp, i);
      for (let j = 0; j < 17; j++) H.pose[j] = base[j];
      H.p.copy(i === 0 ? g.pL : g.pR);
      H.q.copy(i === 0 ? g.qL : g.qR);
    }
    // ---- feet
    for (let i = 0; i < 2; i++) {
      const F = P.foot[i],
        f = this.feet[i];
      F.p.copy(fp[i]);
      F.q.copy(fq[i]);
      if (f.lift < 0.01 * k && f.pitch < 0) qYPR(F.toe, f.curYaw, 0, 0);
      else F.toe.copy(F.q);
      const hj = _v3
        .copy(this.off[i === 0 ? B.thL : B.thR])
        .applyQuaternion(P.tq[0])
        .add(P.hipsP);
      const ff = fwdOf(f.curYaw, _v4)
        .multiplyScalar(0.6)
        .addScaledVector(fwd, 0.4)
        .normalize();
      F.pole
        .copy(hj)
        .addScaledVector(ff, 0.5)
        .addScaledVector(left, (i === 0 ? 1 : -1) * 0.06);
      // airborne: tuck
      if (b.air > 0.001) {
        const tuck = _v5
          .set(
            (i === 0 ? 1 : -1) * 0.1 * k,
            -0.62 * k,
            (i === 0 ? 0.14 : 0.02) * k,
          )
          .applyQuaternion(P.tq[0])
          .add(P.hipsP);
        F.p.lerp(tuck, b.air);
        qYPR(_q3, this.bodyYaw + (i === 0 ? 0.1 : -0.12), 0.35, 0);
        F.q.slerp(_q3, b.air);
        F.toe.slerp(_q3, b.air);
      }
      // kneeling (reviving): right knee on the ground, left foot forward
      if (b.kneel > 0.001) {
        const kp = _v5.copy(this.rpos);
        if (i === 1) {
          kp.addScaledVector(fwd, -0.34 * k).addScaledVector(left, -0.12 * k);
          kp.y += 0.1 * k;
          qYPR(_q3, this.bodyYaw - 0.05, 1.15, 0);
          const pole = _v6
            .copy(this.rpos)
            .addScaledVector(fwd, 0.25 * k)
            .addScaledVector(left, -0.12 * k);
          F.pole.lerp(pole, b.kneel);
          F.toe.slerp(qYPR(_q2, this.bodyYaw, 0, 0), b.kneel);
        } else {
          kp.addScaledVector(fwd, 0.36 * k).addScaledVector(left, 0.14 * k);
          kp.y += this.ankleH;
          qYPR(_q3, this.bodyYaw + 0.1, 0, 0);
          const pole = _v6
            .copy(kp)
            .addScaledVector(fwd, 0.4)
            .setY(kp.y + 0.6);
          F.pole.lerp(pole, b.kneel);
          F.toe.slerp(_q3, b.kneel);
        }
        F.p.lerp(kp, b.kneel);
        F.q.slerp(_q3, b.kneel);
      }
    }
    P.clav[0] = g.clavL;
    P.clav[1] = g.clavR + adsL * 0.1;
    return P;
  }

  // ---------------------------------------------------------------- gestures (scalars)
  _gestures() {
    const g =
      this._g ||
      (this._g = { pL: new V3(), pR: new V3(), qL: new Q4(), qR: new Q4() });
    g.lean = 0;
    g.chestYaw = 0;
    g.chestPitch = 0;
    g.headYaw = 0;
    g.headPitch = 0;
    g.drink = 0;
    g.lowR = 0;
    g.lowL = 0;
    g.down = 0;
    g.tiltW = 0;
    g.tRoll = 0;
    g.tPitch = 0;
    g.tYaw = 0;
    g.tBack = 0;
    g.tDown = 0;
    g.tIn = 0;
    g.onL = 1;
    g.onR = 1;
    g.clavL = 0;
    g.clavR = 0;
    g.knife = 0;
    g.grenade = 0;
    g.bottle = 0;
    const gi = this.gun ? this.gun.userData.info : null;
    g.poseR = this.time - (this.firedAt ?? -9) < 0.16 ? "gunRfire" : "gunR";
    g.poseL = "gunL";
    const r = this.reload;
    if (r) {
      const w =
        r.cls === "shell"
          ? sstep(0, 0.25, r.t) *
            (r.end !== undefined
              ? 1 - sstep(r.end + 0.15, r.end + (r.empty ? 0.8 : 0.42), r.t)
              : 1)
          : bell(r.t, 0, 0.22, r.dur - 0.3, r.dur);
      g.tiltW = w;
      const T = {
        mag: [0.55, -0.1, 0.18, 0.07, 0.05, 0.03],
        pistol: [0.45, 0.25, 0.05, 0.05, 0.02, 0.04],
        capsule: [0.35, 0.3, 0.1, 0.06, 0.02, 0.04],
        bolt: [-0.35, 0.14, 0.04, 0.05, 0.0, 0.02],
        shell: [0.75, 0.06, 0.1, 0.06, 0.05, 0.04],
        belt: [-0.12, 0.05, 0.08, 0.03, 0.02, 0.0],
      }[r.cls] || [0.4, 0, 0.1, 0.05, 0.03, 0.03];
      g.tRoll = T[0];
      g.tPitch = T[1];
      g.tYaw = T[2];
      g.tBack = T[3];
      g.tDown = T[4];
      g.tIn = T[5];
      g.headPitch += 0.28 * w;
      g.headYaw += 0.1 * w;
      g.lean += 0.05 * w;
    }
    const a = this.act;
    if (a) {
      const t = a.t;
      if (a.type === "knife") {
        const w = bell(t, 0, 0.07, a.dur - 0.16, a.dur);
        g.lowL = w;
        g.onR = 1 - bell(t, 0.0, 0.07, a.dur - 0.2, a.dur - 0.06);
        g.chestYaw += keyf(t, [
          [0, 0],
          [0.12, -0.4],
          [0.27, 0.42],
          [0.42, 0.12],
          [0.62, 0],
        ]);
        g.lean += 0.16 * w;
        g.knife = g.onR < 0.6 ? 1 : 0;
        g.poseR = g.onR < 0.5 ? "fist" : g.poseR;
        g.clavR += 0.12 * bell(t, 0.05, 0.12, 0.2, 0.3);
      } else if (a.type === "grenade") {
        const w = bell(t, 0, 0.12, a.dur - 0.25, a.dur);
        g.lowR = w;
        g.onL = 1 - bell(t, 0.02, 0.12, a.dur - 0.22, a.dur - 0.06);
        g.chestYaw += keyf(t, [
          [0, 0],
          [0.3, 0.1],
          [0.5, 0.45],
          [0.62, -0.35],
          [0.8, -0.1],
          [1.05, 0],
        ]);
        g.lean += keyf(t, [
          [0, 0],
          [0.48, -0.1],
          [0.64, 0.22],
          [1.05, 0],
        ]);
        g.headPitch += keyf(t, [
          [0, 0],
          [0.2, 0.25],
          [0.35, 0],
          [0.5, -0.12],
          [1.05, 0],
        ]);
        g.grenade = t > 0.12 && t < 0.6 ? 1 : 0;
        g.poseL = g.onL < 0.5 ? (g.grenade ? "cup" : "relax") : g.poseL;
        g.clavL += 0.22 * bell(t, 0.4, 0.5, 0.6, 0.72);
      } else if (a.type === "drink") {
        const w = bell(t, 0, 0.25, a.dur - 0.3, a.dur);
        g.lowR = w;
        g.onL = 1 - bell(t, 0.02, 0.2, a.dur - 0.35, a.dur - 0.08);
        g.drink = bell(t, 0.5, 0.75, 1.45, 1.7);
        g.headPitch -= 0.55 * g.drink;
        g.lean -= 0.08 * g.drink;
        g.bottle = t > 0.22 && t < 1.95 ? 1 : 0;
        g.poseL = g.onL < 0.5 ? (g.bottle ? "wrap" : "relax") : g.poseL;
        g.clavL += 0.12 * g.drink;
      } else if (a.type === "revived") {
        g.headPitch += 0.15 * Math.sin(t * 9) * (1 - t);
      }
    }
    if (this.swapT < 1)
      g.down = keyf(this.swapT, [
        [0, 0],
        [0.42, 1],
        [0.58, 1],
        [1, 0],
      ]);
    if (this.st.reviving && !this.st.downed) {
      g.lowR = Math.max(g.lowR, this.b.kneel);
      g.onL = Math.min(g.onL, 1 - this.b.kneel);
      g.poseL = this.b.kneel > 0.5 ? "flat" : g.poseL;
    }
    if (this.b.kneel > 0.01) {
      g.headPitch += 0.35 * this.b.kneel;
      g.lean += 0.12 * this.b.kneel;
    }
    return g;
  }

  // ---------------------------------------------------------------- gun pose
  _gunPose(P, g, fwd, left, moving) {
    const gi = this.gun ? this.gun.userData.info : null;
    const b = this.b,
      k = this.k,
      Wp = this.Wp,
      Wq = this.Wq;
    if (!gi) {
      P.gunP.copy(Wp[B.chest]);
      P.gunQ.identity();
      this._gestureHands(P, g, null);
      return;
    }
    const ap = this.aimPitch;
    const qAim = qYPR(this._tq[0], this.aimYaw, -ap, 0);
    const drop = lerp(0.06, 0.08, b.pistol) * (1 - b.ads);
    const qG = this._tq[1]
      .copy(qAim)
      .multiply(Q_GUN)
      .multiply(_q1.setFromAxisAngle(AZ, -drop));
    const pReady = this._tmp[0],
      pAds = this._tmp[1];
    const eye = this._tmp[3]
      .copy(this.D.eyeR)
      .applyQuaternion(Wq[B.head])
      .add(Wp[B.head]);
    if (!gi.pistol) {
      const pocket = _v3
        .copy(this.D.pocket)
        .applyQuaternion(Wq[B.chest])
        .add(Wp[B.chest]);
      pReady.copy(gi.stock).applyQuaternion(qG).negate().add(pocket);
      const ex = gi.stock.x + 0.15;
      pAds
        .set(ex, sightY(gi, ex) + 0.014, 0)
        .applyQuaternion(qG)
        .negate()
        .add(eye);
    } else {
      const sh = _v3.copy(Wp[B.uaL]).add(Wp[B.uaR]).multiplyScalar(0.5);
      pReady
        .set(-0.05 * k, -0.11 * k, 0.4 * k)
        .applyQuaternion(qAim)
        .add(sh)
        .sub(_v4.copy(gi.right).applyQuaternion(qG));
      pAds
        .set(gi.sightR.x - 0.5 * k, gi.sightR.y + 0.01, 0)
        .applyQuaternion(qG)
        .negate()
        .add(eye);
    }
    P.gunP.lerpVectors(pReady, pAds, smooth(b.ads));
    P.gunQ.copy(qG);
    // idle sway + stride bob (the chest carries most of it)
    const sw = 1 - b.ads * 0.7;
    P.gunQ.multiply(
      _q1.setFromEuler(
        _e.set(
          Math.sin(this.time * 1.3) * 0.012 * sw,
          Math.sin(this.time * 0.9) * 0.018 * sw,
          Math.sin(this.time * 1.1 + 1) * 0.01 * sw,
        ),
      ),
    );
    // recoil: kick back + muzzle climb
    const rc = this.rec.x;
    P.gunP.addScaledVector(
      _v3.set(1, 0, 0).applyQuaternion(P.gunQ),
      -rc * 0.0022,
    );
    P.gunQ.multiply(_q1.setFromAxisAngle(AZ, rc * 0.0065));
    // sprint carry
    if (b.sprint > 0.001) {
      const qB = qYPR(_q2, this.bodyYaw, 0.2, 0);
      const qS = this._tq[2],
        pS = this._tmp[2];
      const ph = TAU * this.phase;
      if (!gi.pistol) {
        const X = _v3
          .set(0.6, 0.56 + 0.05 * Math.sin(ph * 2), 0.5)
          .normalize()
          .applyQuaternion(qB);
        const Y = _v4.set(-0.25, 0.3, 1).applyQuaternion(qB);
        Y.sub(_v5.copy(X).multiplyScalar(Y.dot(X))).normalize();
        qFromBasis(qS, X, Y, _v5.crossVectors(X, Y));
        qS.premultiply(_q3.setFromAxisAngle(AY, 0.16 * Math.sin(ph)));
        qS.premultiply(_q3.setFromAxisAngle(this._fwd, 0.08 * Math.sin(ph)));
        const mid = _v6.copy(gi.right).lerp(gi.left, 0.5).applyQuaternion(qS);
        this.cp(
          pS,
          0.03 - 0.025 * Math.sin(ph),
          -0.02 + 0.022 * Math.sin(ph * 2),
          0.29,
        ).sub(mid);
      } else {
        qS.copy(qYPR(_q3, this.bodyYaw - 0.25, 0.95, 0.2)).multiply(Q_GUN);
        this.cp(
          pS,
          -0.13,
          -0.12 + 0.02 * Math.sin(ph * 2),
          0.25 + 0.03 * Math.sin(ph),
        ).sub(_v6.copy(gi.right).applyQuaternion(qS));
      }
      const s = smooth(b.sprint);
      P.gunP.lerp(pS, s);
      P.gunQ.slerp(qS, s);
    }
    // reload tilt (rotate about the grip, pull toward the chest)
    if (g.tiltW > 0.001) {
      const w = g.tiltW;
      _q1.setFromEuler(_e.set(g.tRoll * w, g.tYaw * w, g.tPitch * w, "XYZ"));
      P.gunQ.multiply(_q1);
      fwdOf(this.aimYaw, _v3);
      leftOf(this.aimYaw, _v4);
      P.gunP
        .addScaledVector(_v3, -g.tBack * w * k)
        .addScaledVector(_v4, g.tIn * w * k);
      P.gunP.y -= g.tDown * w * k;
    }
    // lowered carries: right hand only / left hand only / swap
    const low = (w, qT, anchor, gripV) => {
      if (w <= 0.001) return;
      const pT = _v6.copy(gripV).applyQuaternion(qT).negate().add(anchor);
      P.gunP.lerp(pT, smooth(w));
      P.gunQ.slerp(qT, smooth(w));
    };
    // anchors hang off the shoulder (always within reach), expressed in the chest frame
    const shA = (out, S, x, y, z) =>
      out
        .set(x * k, y * k, z * k)
        .applyQuaternion(Wq[B.chest])
        .add(Wp[S === "R" ? B.uaR : B.uaL]);
    if (g.lowR > 0.001)
      low(
        g.lowR,
        qYPR(this._tq[3], this.bodyYaw - 0.3, 0.78, 0.35).multiply(Q_GUN),
        shA(this._tmp[4], "R", -0.03, -0.3, 0.22),
        gi.right,
      );
    if (g.lowL > 0.001)
      low(
        g.lowL,
        qYPR(this._tq[3], this.bodyYaw + 0.55, 0.6, -0.5).multiply(Q_GUN),
        shA(this._tmp[4], "L", -0.04, -0.3, 0.27),
        gi.left,
      );
    if (g.down > 0.001)
      low(
        g.down,
        qYPR(this._tq[3], this.bodyYaw - 0.15, 1.15, 0.25).multiply(Q_GUN),
        shA(this._tmp[4], "R", 0.0, -0.33, 0.18),
        gi.right,
      );
    this._gestureHands(P, g, gi);
  }

  // ---------------------------------------------------------------- grips
  _gripGun(side, out) {
    const gi = this.gun.userData.info;
    if (side === 1) return out.copy(gi.right);
    const parts = this.gun.userData.parts;
    if (gi.leftPart && parts[gi.leftPart]) {
      const pt = parts[gi.leftPart];
      return out
        .copy(gi.leftLocal)
        .applyQuaternion(pt.quaternion)
        .add(pt.position);
    }
    return out.copy(gi.left);
  }
  _gripQ(side, gunQ, out) {
    const gi = this.gun.userData.info;
    const qm = side === 1 ? gi.rightQ : gi.leftQ;
    const Y = _v1.set(0, 1, 0).applyQuaternion(qm);
    let F;
    if (side === 1) {
      // right: fingers forward around the front strap, palm on the right side
      F = _v2.set(1, 0, 0);
      F.sub(_v3.copy(Y).multiplyScalar(F.dot(Y))).normalize();
      F.applyAxisAngle(Y, gi.pistol ? -0.1 : -0.15);
      Y.applyQuaternion(gunQ);
      F.applyQuaternion(gunQ);
      return qAlign(out, HR.R.F, HR.R.T, F, Y);
    }
    if (!gi.leftHoriz) {
      // vertical grip / mag housing / pistol support: fingers forward, palm right
      F = _v2.set(1, 0, 0);
      F.sub(_v3.copy(Y).multiplyScalar(F.dot(Y))).normalize();
      F.applyAxisAngle(Y, gi.pistol ? 0.12 : 0.1);
      if (gi.pistol) {
        const Pz = _v3.crossVectors(F, Y).normalize();
        F.applyAxisAngle(Pz, -0.2);
        Y.applyAxisAngle(Pz, -0.2);
      }
      Y.applyQuaternion(gunQ);
      F.applyQuaternion(gunQ);
      return qAlign(out, HR.L.F, HR.L.T, F, Y);
    }
    // handguard: palm under, the handguard runs along the fist axis, fingers up the far side
    const Pn = _v3.set(1, 0, 0).applyQuaternion(qm);
    F = _v2.set(0, 0, -1).applyQuaternion(qm).applyAxisAngle(Pn, -0.15);
    const T = _v4.crossVectors(Pn, F);
    T.applyQuaternion(gunQ);
    F.applyQuaternion(gunQ);
    return qAlign(out, HR.L.F, HR.L.T, F, T);
  }
  /** Solve how each hand wraps this gun (static relative to the gun): finger curls, thumb, index on the trigger,
   *  and the grip-centre offset in the hand frame (metres). Result in this.gp[side]. */
  _solveGunHands() {
    const gi = this.gun.userData.info,
      hs = this.C.hand * this.k;
    const qI = new Q4();
    const gp = (this.gp = [null, null]);
    for (const side of [1, 0]) {
      const s = side === 0 ? 1 : -1;
      const pistolSupport = side === 0 && gi.pistol;
      const R = side === 1 ? gi.rR : gi.rL;
      const Robj = pistolSupport ? gi.rR + 0.012 * hs : R;
      const f0 = (side === 1 ? 0.073 : pistolSupport ? 0.07 : 0.072) * hs;
      let t0 = (side === 1 ? -0.004 : pistolSupport ? -0.007 : 0.0) * hs;
      const p0 = (side === 1 ? R : pistolSupport ? gi.rR : R) + 0.0165 * hs;
      const pose = new Float32Array(17);
      // index onto the trigger (right hand): slide the hand along the grip so the index sits at trigger height
      let trig = null;
      if (side === 1 && gi.markers.trigTip) {
        const hq = this._gripQ(1, qI, new Q4());
        const wrist = new V3()
          .copy(gi.right)
          .sub(hf(s, f0, t0, p0).applyQuaternion(hq));
        trig = _hc(
          s,
          gi.markers.trigTip.pos
            .clone()
            .sub(wrist)
            .applyQuaternion(hq.clone().invert()),
          new V3(),
        );
        const delta = clamp(trig.y - FING.ix.base[1] * hs, -0.012, 0.016);
        t0 -= delta;
        trig.y -= delta;
      }
      const off = [f0, t0, p0];
      // fingers wrap the object circle
      const ofc = f0 + (pistolSupport ? 0.012 * hs : 0),
        rf = 0.0095 * hs + 0.0005;
      for (let fi = 1; fi < 5; fi++) {
        const fd = FING[FINGER_NAMES[fi]];
        wrapCurls(
          fd.base[0] * hs,
          fd.base[2] * hs,
          fd.len.map((l) => l * hs),
          ofc,
          p0,
          Robj + rf,
          pose,
          4 + (fi - 1) * 3,
        );
        if (pistolSupport) {
          const o = 4 + (fi - 1) * 3;
          pose[o + 1] *= 0.72;
          pose[o + 2] *= 0.6;
        }
      }
      const fire = new Float32Array(17);
      if (trig) {
        // DIP just in front of the trigger blade, finger on the palm side of it
        reachCurls(
          FING.ix.base[0] * hs,
          FING.ix.base[2] * hs,
          FING.ix.len[0] * hs,
          FING.ix.len[1] * hs,
          trig.x + 0.005,
          trig.z - 0.003,
          pose,
          4,
          0.95,
        );
      }
      // thumb
      const axP = hf(s, ofc, t0, p0, new V3()),
        axD = (s > 0 ? HR.L : HR.R).T.clone();
      let tgt;
      if (side === 1)
        tgt = hf(
          s,
          f0 + 0.018 * hs,
          t0 + (gi.pistol ? 0.036 : 0.03) * hs,
          p0 + R + 0.004 * hs,
          new V3(),
        );
      else if (gi.leftHoriz)
        tgt = hf(
          s,
          f0 - (R + 0.009 * hs),
          t0 + 0.068 * hs,
          p0 + 0.002 * hs,
          new V3(),
        );
      else
        tgt = hf(
          s,
          f0 + 0.045 * hs,
          t0 + 0.034 * hs,
          p0 - gi.rR - 0.006 * hs,
          new V3(),
        );
      const th = solveThumb(
        s,
        hs,
        tgt,
        axP,
        axD,
        (side === 1 ? R : Robj) + 0.0105 * hs,
      );
      for (let j = 0; j < 4; j++) pose[j] = th[j];
      pose[16] = th[4];
      fire.set(pose);
      if (trig)
        reachCurls(
          FING.ix.base[0] * hs,
          FING.ix.base[2] * hs,
          FING.ix.len[0] * hs,
          FING.ix.len[1] * hs,
          trig.x - 0.003,
          trig.z - 0.002,
          fire,
          4,
          1.1,
        );
      gp[side] = { pose, fire, off };
    }
  }
  _poseArr(name, side) {
    if (this.gp && this.gp[side]) {
      if (name === "gunR" || name === "gunL") return this.gp[side].pose;
      if (name === "gunRfire") return this.gp[side].fire;
    }
    return (
      HP[name] ||
      HP[
        name === "gunL"
          ? "support"
          : name === "gunRfire"
            ? "trigger"
            : name === "gunR"
              ? "grip"
              : "relax"
      ] ||
      HP.relax
    );
  }
  _gripOffM(side, name, out) {
    if (
      this.gp &&
      this.gp[side] &&
      (name === "gunR" || name === "gunL" || name === "gunRfire")
    ) {
      const o = this.gp[side].off;
      out[0] = o[0];
      out[1] = o[1];
      out[2] = o[2];
      return out;
    }
    const go =
        GRIP_OFF[name] ||
        GRIP_OFF[
          name === "gunL"
            ? "support"
            : name === "gunR" || name === "gunRfire"
              ? "grip"
              : "relax"
        ] ||
        GRIP_OFF.relax,
      hs = this.C.hand * this.k;
    out[0] = go[0] * hs;
    out[1] = go[1] * hs;
    out[2] = go[2] * hs;
    return out;
  }
  _markerGun(name, out) {
    const gi = this.gun.userData.info,
      m = gi.markers[name];
    if (!m) return null;
    const pt = m.part ? this.gun.userData.parts[m.part] : null;
    if (pt && m.local)
      return out.copy(m.local).applyQuaternion(pt.quaternion).add(pt.position);
    return out.copy(m.pos);
  }
  _part(name, tx = 0, ty = 0, tz = 0, rx = 0, ry = 0, rz = 0, vis) {
    const p = this.gun && this.gun.userData.parts[name];
    if (!p) return;
    p.position.copy(p.userData.restPos).add(_v6.set(tx, ty, tz));
    p.quaternion.copy(p.userData.restQuat);
    if (rx || ry || rz)
      p.quaternion.multiply(_q3.setFromEuler(_e.set(rx, ry, rz, "XYZ")));
    if (vis !== undefined) p.visible = vis;
  }

  // ---------------------------------------------------------------- gesture hand paths
  _gestureHands(P, g, gi) {
    const k = this.k;
    if (this.gun)
      for (const n in this.gun.userData.parts) {
        const p = this.gun.userData.parts[n];
        p.position.copy(p.userData.restPos);
        p.quaternion.copy(p.userData.restQuat);
        p.visible = p.userData.restVis;
      }
    if (!gi) {
      this.cp(g.pL, 0.2, -0.3, 0.05);
      this.cp(g.pR, -0.2, -0.3, 0.05);
      g.onL = g.onR = 0;
      g.poseL = g.poseR = "relax";
      this._handQ(g.qL, 0, _v1.set(0, -1, 0), _v2.set(-1, 0, 0));
      this._handQ(g.qR, 1, _v1.set(0, -1, 0), _v2.set(1, 0, 0));
      return;
    }
    const gw = (v, out) => out.copy(v).applyQuaternion(P.gunQ).add(P.gunP);
    const T = this._tmp;
    gw(this._gripGun(0, T[5]), g.pL);
    gw(gi.right, g.pR);
    this._gripQ(0, P.gunQ, g.qL);
    this._gripQ(1, P.gunQ, g.qR);
    const qGL = this._tq[4].copy(g.qL),
      qGR = this._tq[5].copy(g.qR);
    const pouchL = this.hp(T[7], this.D.pouchL),
      pouchR = this.hp(T[8], this.D.pouchR);
    const down = _v1.set(0, -1, 0);
    // generic path follower: keys [[t, V3], ...]
    const path = (t, keys, out) => {
      if (t <= keys[0][0]) return out.copy(keys[0][1]);
      for (let i = 1; i < keys.length; i++)
        if (t <= keys[i][0]) {
          const a = keys[i - 1],
            c = keys[i];
          return out.lerpVectors(
            a[1],
            c[1],
            smooth((t - a[0]) / (c[0] - a[0] || 1)),
          );
        }
      return out.copy(keys[keys.length - 1][1]);
    };
    const palmDownQ = (side, out, fx = 0) =>
      this._handQ(
        out,
        side,
        _v3
          .copy(this._fwd)
          .addScaledVector(this._left, fx)
          .setY(-0.35)
          .normalize(),
        _v4.set(0, -1, 0),
      );
    // ---------------- reloads
    const r = this.reload;
    if (r && gi) {
      const u = r.cls === "shell" ? r.t : r.t / r.dur;
      const mkp = (name, fb, out) =>
        this._markerGun(name, out) ? gw(out, out) : gw(fb, out);
      if (r.cls === "mag" || r.cls === "pistol" || r.cls === "capsule") {
        const isP = r.cls !== "mag";
        const grabName = r.cls === "capsule" ? "hL_cap" : "hL_mag";
        const grabG =
          this._markerGun(grabName, T[9]) ||
          T[9].copy(gi.right).add(_v6.set(0.02, -0.06, 0));
        const M = gw(grabG, T[10]);
        const partName = r.cls === "capsule" ? "capsule" : "mag";
        const outDir =
          r.cls === "capsule" ? _v6.set(0, 0.12, 0) : _v6.set(0, -0.15, 0);
        const Mout = gw(T[11].copy(grabG).add(outDir), T[11]);
        const Mpre = gw(T[12].copy(grabG).addScaledVector(outDir, 0.65), T[12]);
        let keys,
          att = [];
        if (!isP) {
          keys = [
            [0, g.pL],
            [0.14, M],
            [0.26, Mout],
            [0.42, pouchL],
            [0.5, pouchL],
            [0.64, Mpre],
            [0.71, M],
            [0.75, M],
          ];
          att = [
            [0.14, 0.43],
            [0.48, 0.73],
          ];
          if (r.empty) {
            const CH = mkp("hL_charge", gi.left, T[13]);
            const CH2 = T[14]
              .copy(CH)
              .addScaledVector(_v5.set(-1, 0, 0).applyQuaternion(P.gunQ), 0.07);
            keys.push([0.83, CH], [0.88, CH2], [0.94, g.pL]);
          } else keys.push([0.9, g.pL]);
        } else {
          keys = [
            [0, g.pL],
            [0.14, pouchL],
            [0.3, pouchL],
            [0.5, Mpre],
            [0.6, M],
            [0.64, M],
          ];
          att = [[0.3, 0.62]];
          if (r.cls === "capsule") {
            keys = [
              [0, g.pL],
              [0.1, M],
              [0.2, Mout],
              [0.34, pouchL],
              [0.44, pouchL],
              [0.6, Mpre],
              [0.68, M],
              [0.72, M],
            ];
            att = [
              [0.1, 0.33],
              [0.44, 0.7],
            ];
          }
          if (r.empty && r.cls === "pistol") {
            const SL = gw(_v5.set(0.03, 0.07, -0.02), T[13]);
            keys.push([0.74, SL], [0.8, SL]);
          }
          keys.push([0.92, g.pL]);
        }
        const hw = bell(u, 0.02, 0.1, 0.88, 0.96);
        g.onL = Math.min(g.onL, 1 - hw);
        path(u, keys, T[15]);
        const handP = T[15];
        g.pL.copy(handP);
        g.qL.slerp(palmDownQ(0, _q2, 0.3), bell(u, 0.3, 0.42, 0.5, 0.6));
        g.poseL = hw > 0.5 ? "cup" : g.poseL;
        // magazine / capsule follows the hand while held, hidden in the pouch
        let attached = 0;
        for (const [a0, a1] of att) if (u >= a0 && u <= a1) attached = 1;
        const inPouch = isP ? u > 0.14 && u < 0.3 : u > 0.43 && u < 0.48;
        if (attached) {
          const hg = _v5
            .copy(handP)
            .sub(P.gunP)
            .applyQuaternion(_q3.copy(P.gunQ).invert());
          const dlt = hg.sub(grabG);
          this._part(partName, dlt.x, dlt.y, dlt.z);
        } else if (r.cls === "pistol" && u > 0.04 && u < 0.3) {
          const fall = sstep(0.04, 0.2, u);
          this._part("mag", 0, -0.25 * fall, 0, 0, 0, 0, u < 0.2);
        }
        if (inPouch) this._part(partName, 0, 0, 0, 0, 0, 0, false);
      } else if (r.cls === "bolt") {
        const bolt = (w1, w2) =>
          this._part("bolt", -0.086 * w2, 0, 0, -1.45 * w1, 0, 0);
        const w1 = sstep(0.12, 0.2, u) * (1 - sstep(0.74, 0.8, u)),
          w2 = sstep(0.2, 0.26, u) * (1 - sstep(0.68, 0.74, u));
        bolt(w1, w2);
        const BH = mkp("hR_bolt", gi.right, T[10]);
        const CL = mkp("hR_clip", gi.right, T[11]),
          PU = mkp("hR_push", gi.right, T[12]);
        const keys = [
          [0, g.pR],
          [0.12, BH],
          [0.26, T[13].copy(BH)],
          [0.38, pouchR],
          [0.44, pouchR],
          [0.52, CL],
          [0.56, CL],
          [0.64, PU],
          [0.69, BH],
          [0.8, BH],
          [0.94, g.pR],
        ];
        path(u, keys, T[15]);
        const hw = bell(u, 0.02, 0.11, 0.84, 0.95);
        g.onR = Math.min(g.onR, 1 - hw);
        g.pR.copy(T[15]);
        g.poseR = hw > 0.5 ? "pinch" : g.poseR;
        g.qR.slerp(palmDownQ(1, _q2, -0.2), hw * 0.6);
        this._part("clip", 0, 0, 0, 0, 0, 0, u > 0.46 && u < 0.66);
      } else if (r.cls === "shell") {
        const PORT = mkp("hL_shell", gi.left, T[10]),
          PORT2 = T[11]
            .copy(PORT)
            .addScaledVector(_v5.set(0.03, 0.02, 0).applyQuaternion(P.gunQ), 1);
        const t0 = r.t;
        const inLoop = t0 > 0.3 && (r.end === undefined || t0 < r.end);
        let hp;
        if (!inLoop && t0 <= 0.3)
          hp = path(
            t0,
            [
              [0, g.pL],
              [0.3, pouchL],
            ],
            T[15],
          );
        else if (inLoop) {
          const c = (t0 - 0.3) % 0.5;
          hp = path(
            c,
            [
              [0, pouchL],
              [0.2, PORT],
              [0.28, PORT2],
              [0.36, PORT],
              [0.5, pouchL],
            ],
            T[15],
          );
          this._part("shell", 0, 0, 0, 0, 0, 0, c > 0.06 && c < 0.3);
        } else {
          const e = t0 - r.end;
          hp = path(
            e,
            [
              [0, pouchL],
              [0.3, g.pL],
            ],
            T[15],
          );
          if (r.empty) {
            const pw = bell(e, 0.35, 0.45, 0.5, 0.62);
            this._part("pump", -0.09 * pw);
          }
        }
        const hw =
          r.end === undefined
            ? sstep(0, 0.12, t0)
            : 1 - sstep(r.end + 0.15, r.end + 0.3, t0);
        g.onL = Math.min(g.onL, 1 - hw);
        g.pL.copy(hp);
        g.poseL = hw > 0.5 ? "pinch" : g.poseL;
        g.qL.slerp(palmDownQ(0, _q2, 0.2), hw * 0.5);
      } else if (r.cls === "belt") {
        const cov = sstep(0.14, 0.24, u) * (1 - sstep(0.7, 0.78, u));
        this._part("cover", 0, 0, 0, 0, 0, -1.05 * cov);
        const CV = mkp("hR_cover", gi.right, T[10]),
          BL = mkp("hL_belt", gi.left, T[11]),
          CHG = mkp("hR_charge", gi.right, T[12]);
        const CHG2 = T[13]
          .copy(CHG)
          .addScaledVector(_v5.set(-1, 0, 0).applyQuaternion(P.gunQ), 0.1);
        path(
          u,
          [
            [0, g.pR],
            [0.12, CV],
            [0.24, CV],
            [0.3, pouchR],
            [0.66, pouchR],
            [0.72, CV],
            [0.78, CV],
            [0.84, CHG],
            [0.88, CHG2],
            [0.96, g.pR],
          ],
          T[15],
        );
        const hwR = bell(u, 0.02, 0.1, 0.9, 0.97);
        g.onR = Math.min(g.onR, 1 - hwR);
        g.pR.copy(T[15]);
        g.poseR = hwR > 0.5 ? "pinch" : g.poseR;
        const BL2 = T[6].copy(BL);
        BL2.y -= 0.12;
        const lp = path(
          u,
          [
            [0, g.pL],
            [0.2, g.pL],
            [0.3, BL],
            [0.38, BL2],
            [0.48, pouchL],
            [0.56, pouchL],
            [0.64, BL],
            [0.7, BL],
            [0.8, g.pL],
          ],
          T[9],
        );
        const hwL = bell(u, 0.2, 0.28, 0.72, 0.8);
        g.onL = Math.min(g.onL, 1 - hwL);
        g.pL.copy(lp);
        g.poseL = hwL > 0.5 ? "pinch" : g.poseL;
        this._part(
          "belt",
          0,
          -0.1 * bell(u, 0.3, 0.4, 0.42, 0.44),
          0,
          0,
          0,
          0,
          !(u > 0.43 && u < 0.58),
        );
      }
    }
    // ---------------- post-shot cycling
    const c = this.cycle;
    if (c && gi && !r) {
      const t = c.t;
      if (c.type === "bolt") {
        const w1 = sstep(0.16, 0.26, t) * (1 - sstep(0.6, 0.68, t)),
          w2 = sstep(0.28, 0.4, t) * (1 - sstep(0.46, 0.57, t));
        this._part("bolt", -0.086 * w2, 0, 0, -1.45 * w1, 0, 0);
        const BH = this._markerGun("hR_bolt", T[10])
          ? gw(T[10], T[10])
          : gw(gi.right, T[10]);
        const hw = bell(t, 0.0, 0.15, 0.66, 0.82);
        g.onR = Math.min(g.onR, 1 - hw);
        g.pR.lerp(BH, hw);
        g.poseR = hw > 0.5 ? "pinch" : g.poseR;
        g.qR.slerp(palmDownQ(1, _q2, -0.3), hw * 0.5);
      } else if (c.type === "pump") {
        const pw = bell(t, 0.0, 0.14, 0.24, 0.38);
        this._part("pump", -0.09 * pw);
      }
    }
    // ---------------- actions
    const a = this.act;
    if (a) {
      const t = a.t;
      if (a.type === "knife") {
        path(
          t,
          [
            [0, g.pR],
            [0.12, this.cp(T[9], -0.24, 0.26, 0.04)],
            [0.25, this.cp(T[10], 0.02, 0.06, 0.55)],
            [0.33, this.cp(T[11], 0.24, -0.12, 0.38)],
            [0.46, this.cp(T[12], -0.1, -0.08, 0.3)],
            [0.58, g.pR],
          ],
          T[15],
        );
        g.pR.copy(T[15]);
        // blade leads: fingers point along the slash direction, palm down-inward
        const dir = _v3
          .subVectors(
            this.cp(T[13], 0.24, -0.12, 0.38),
            this.cp(T[14], -0.24, 0.26, 0.04),
          )
          .normalize();
        this._handQ(
          _q2,
          1,
          _v4
            .copy(this._left)
            .multiplyScalar(-0.3)
            .add(_v5.set(0, -0.2, 0))
            .addScaledVector(this._fwd, 0.8)
            .normalize(),
          _v6.copy(dir).negate(),
        );
        g.qR.slerp(_q2, 1 - g.onR);
      } else if (a.type === "grenade") {
        path(
          t,
          [
            [0, g.pL],
            [0.12, this.cp(T[9], 0.1, -0.12, 0.2)],
            [0.26, this.cp(T[10], 0.02, 0.06, 0.3)],
            [0.47, this.cp(T[11], 0.3, 0.34, -0.2)],
            [0.58, this.cp(T[12], 0.14, 0.38, 0.45)],
            [0.72, this.cp(T[13], -0.1, -0.08, 0.42)],
            [0.95, g.pL],
          ],
          T[15],
        );
        g.pL.copy(T[15]);
        this._handQ(
          _q2,
          0,
          _v4.set(0, 1, 0).addScaledVector(this._fwd, 0.4).normalize(),
          _v5
            .copy(this._fwd)
            .negate()
            .addScaledVector(this._left, -0.3)
            .normalize(),
        );
        g.qL.slerp(_q2, (1 - g.onL) * bell(t, 0.3, 0.45, 0.6, 0.75));
      } else if (a.type === "drink") {
        const mouth = _v3
          .copy(this.D.mouth)
          .applyQuaternion(this.Wq[B.head])
          .add(this.Wp[B.head]);
        const atMouth = T[11].copy(mouth).addScaledVector(this._fwd, 0.035 * k);
        atMouth.y -= 0.02 * k;
        path(
          t,
          [
            [0, g.pL],
            [0.25, pouchL],
            [0.34, pouchL],
            [0.62, this.cp(T[10], 0.06, 0.12, 0.28)],
            [0.78, atMouth],
            [1.45, atMouth],
            [1.65, this.cp(T[12], 0.1, 0.0, 0.3)],
            [1.85, this.cp(T[13], 0.3, -0.1, 0.35)],
            [2.1, g.pL],
          ],
          T[15],
        );
        g.pL.copy(T[15]);
        // bottle axis tilts up toward the mouth while drinking
        const tilt = bell(t, 0.62, 0.8, 1.45, 1.6);
        this._handQ(
          _q2,
          0,
          _v4
            .set(0, 0.2 + 0.7 * tilt, 0)
            .addScaledVector(this._fwd, 0.6)
            .addScaledVector(this._left, -0.4)
            .normalize(),
          _v5
            .copy(this._left)
            .negate()
            .addScaledVector(this._fwd, -0.3)
            .normalize(),
        );
        g.qL.slerp(_q2, 1 - g.onL);
      }
    }
    // reviving: left hand reaches down to the teammate
    if (this.b.kneel > 0.01 && !this.st.downed) {
      const tgt = T[14]
        .copy(this.rpos)
        .addScaledVector(this._fwd, 0.5 * k)
        .addScaledVector(this._left, 0.08 * k);
      tgt.y += 0.32 * k + 0.02 * Math.sin(this.time * 3);
      g.pL.lerp(tgt, this.b.kneel * (1 - g.onL));
      palmDownQ(0, _q2, 0.2);
      g.qL.slerp(_q2, this.b.kneel);
    }
    // free left hand while sprinting with a pistol: arm pump
    if (gi.pistol && this.b.sprint > 0.01 && g.onL > 0) {
      const ph = TAU * this.phase;
      const sw = Math.sin(ph);
      const tgt = this.cp(
        T[14],
        0.18,
        -0.12 + 0.07 * Math.max(0, sw),
        0.1 + 0.22 * sw,
      );
      const w = this.b.sprint;
      g.pL.lerp(tgt, w);
      g.onL *= 1 - w;
      g.poseL = w > 0.5 ? "fist" : g.poseL;
      this._handQ(
        _q2,
        0,
        _v4.copy(this._fwd).setY(0.3).normalize(),
        _v5.copy(this._left).negate(),
      );
      g.qL.slerp(_q2, w);
    }
  }

  // ---------------------------------------------------------------- downed pose
  _downedPose(P, dt, speed) {
    const k = this.k,
      b = this.b;
    const yaw = this.bodyYaw;
    const fwd = fwdOf(yaw, this._fwd2),
      left = leftOf(yaw, this._left2);
    const cr = sstep(0.12, 0.5, speed);
    this.crawlPh += (speed / (0.55 * k)) * TAU * dt;
    const sw = Math.sin(this.crawlPh) * cr,
      cw = Math.cos(this.crawlPh) * cr;
    const br = b.beingRev;
    P.hipsP
      .copy(this.rpos)
      .addScaledVector(fwd, (-0.05 + 0.025 * sw) * k)
      .addScaledVector(left, 0.03 * k);
    P.hipsP.y = this.rpos.y + 0.135 * k + 0.012 * Math.abs(sw);
    qYPR(P.tq[0], yaw + 0.08 * sw, -1.25, -0.2 + 0.06 * sw);
    qYPR(P.tq[1], yaw + 0.04 * sw, -1.02 + 0.12 * br, -0.24);
    qYPR(
      P.tq[2],
      yaw - 0.12 - 0.05 * sw,
      -0.78 + 0.3 * br + 0.04 * Math.sin(this.time * 2.1),
      -0.3 + 0.1 * br + 0.04 * cw,
    );
    const ap = clamp(this.aimPitch, -0.45, 0.7);
    qYPR(P.tq[3], lerp(yaw - 0.12, this.aimYaw, 0.5), -0.3, -0.12);
    qYPR(P.tq[4], this.aimYaw, -ap * 0.8 + 0.05, 0.02 + this.flinch.x * 0.1);
    this._torsoFK(P);
    // legs: left leg long, right knee up; shuffle when crawling
    const hL = _v3.copy(this.off[B.thL]).applyQuaternion(P.tq[0]).add(P.hipsP);
    const hR = _v4.copy(this.off[B.thR]).applyQuaternion(P.tq[0]).add(P.hipsP);
    const FL = P.foot[0],
      FR = P.foot[1];
    FL.p
      .copy(this.rpos)
      .addScaledVector(fwd, (0.78 + 0.08 * cw) * k)
      .addScaledVector(left, 0.19 * k);
    FL.p.y = this.rpos.y + 0.075 * k;
    qYPR(FL.q, yaw + 0.35, -1.0, 0.15);
    FL.toe.copy(FL.q);
    FL.pole
      .copy(hL)
      .addScaledVector(fwd, 0.3)
      .addScaledVector(AY, 0.35)
      .addScaledVector(left, 0.1);
    FR.p
      .copy(this.rpos)
      .addScaledVector(fwd, (0.44 - 0.12 * sw) * k)
      .addScaledVector(left, -0.1 * k);
    FR.p.y = this.rpos.y + 0.088 * k;
    qYPR(FR.q, yaw - 0.25, -0.1, 0);
    FR.toe.copy(FR.q);
    FR.pole
      .copy(hR)
      .addScaledVector(fwd, 0.2)
      .addScaledVector(AY, 0.6)
      .addScaledVector(left, -0.25);
    // left arm: propped on the elbow (or reaching up to the reviver)
    const Sl = this.Wp[B.uaL];
    const E = this._tmp[9]
      .set(Sl.x, this.rpos.y + 0.055 * k, Sl.z)
      .addScaledVector(fwd, (-0.04 + 0.03 * sw) * k)
      .addScaledVector(left, 0.05 * k);
    const HL = P.hand[0];
    HL.p
      .copy(E)
      .addScaledVector(fwd, 0.23 * k)
      .addScaledVector(left, 0.02 * k);
    HL.p.y = this.rpos.y + 0.035 * k;
    this._handQ(
      HL.q,
      0,
      _v5.copy(fwd).addScaledVector(left, -0.25).normalize(),
      _v6.set(0, -1, 0),
    );
    HL.pole.copy(E).addScaledVector(AY, -0.15);
    HL.onGun = 0;
    HL.gp = "flat";
    for (let j = 0; j < 17; j++) HL.pose[j] = HP.flat[j];
    if (br > 0.01) {
      const up = this._tmp[10]
        .copy(Sl)
        .addScaledVector(fwd, 0.32 * k)
        .addScaledVector(left, -0.05 * k);
      up.y += 0.26 * k;
      HL.p.lerp(up, br);
      this._handQ(
        _q2,
        0,
        _v5.copy(fwd).setY(0.6).normalize(),
        _v6.copy(left).negate(),
      );
      HL.q.slerp(_q2, br);
      HL.pole.lerp(
        _v5.copy(Sl).addScaledVector(AY, -0.3).addScaledVector(left, 0.2),
        br,
      );
      for (let j = 0; j < 17; j++)
        HL.pose[j] = lerp(HL.pose[j], HP.relax[j], br);
    }
    // right arm: sidearm aimed one-handed
    const gi = this.gun ? this.gun.userData.info : null;
    const HR_ = P.hand[1];
    HR_.onGun = 1;
    HR_.gp = this.time - (this.firedAt ?? -9) < 0.16 ? "gunRfire" : "gunR";
    const hpR = this._poseArr(HR_.gp, 1);
    for (let j = 0; j < 17; j++) HR_.pose[j] = hpR[j];
    const qA = qYPR(this._tq[6], this.aimYaw, -ap, 0);
    P.gunQ
      .copy(qA)
      .multiply(Q_GUN)
      .multiply(_q1.setFromAxisAngle(AZ, this.rec.x * 0.008));
    const Sr = this.Wp[B.uaR];
    if (gi) {
      const reach = gi.pistol
        ? _v5.set(0.03, -0.03, 0.44)
        : _v5.set(0.0, -0.12, 0.3);
      P.gunP
        .copy(reach.multiplyScalar(k).applyQuaternion(qA))
        .add(Sr)
        .sub(_v6.copy(gi.right).applyQuaternion(P.gunQ));
      HR_.p.copy(gi.right).applyQuaternion(P.gunQ).add(P.gunP);
    } else {
      P.gunP.copy(Sr);
      HR_.p.copy(Sr);
    }
    HR_.q.identity();
    P.clav[0] = 0;
    P.clav[1] = 0.05;
    return P;
  }

  // ---------------------------------------------------------------- IK
  _solveArm(side, grip, handQ, preset, pole, clavExtra) {
    const S = side === 0 ? "L" : "R",
      s = side === 0 ? 1 : -1;
    const Wp = this.Wp,
      Wq = this.Wq,
      off = this.off;
    const c = B["clav" + S],
      ua = B["ua" + S],
      fa = B["fa" + S],
      tw = B["tw" + S],
      hd = B["hand" + S];
    const go = this._gripOffM(side, preset, this._go || (this._go = [0, 0, 0]));
    const offW = hf(s, go[0], go[1], go[2], this._ik0).applyQuaternion(handQ);
    const W = this._ik1.copy(grip).sub(offW);
    const L1 = this.L1,
      L2 = this.L2,
      maxR = (L1 + L2) * 0.999;
    // clavicle: shrug up when the hand is high, protract when reaching
    const S0 = this._ik2.copy(off[ua]).applyQuaternion(Wq[B.chest]).add(Wp[c]);
    const reach = W.distanceTo(S0);
    const elev =
      clamp((W.y - S0.y) / (0.5 * this.k), -0.4, 1) * 0.16 + clavExtra;
    const prot = clamp((reach - maxR * 0.86) / (0.14 * this.k), 0, 1.4) * 0.3;
    Wq[c]
      .copy(Wq[B.chest])
      .multiply(_q1.setFromEuler(_e.set(0, -s * prot, s * elev, "XYZ")));
    Wp[ua].copy(off[ua]).applyQuaternion(Wq[c]).add(Wp[c]);
    const Sh = Wp[ua];
    const D = this._ik3.subVectors(W, Sh);
    let d = D.length();
    const dir = D.multiplyScalar(1 / (d || 1));
    d = clamp(d, Math.abs(L1 - L2) + 0.01, maxR);
    const a = (L1 * L1 - L2 * L2 + d * d) / (2 * d),
      h = Math.sqrt(Math.max(0, L1 * L1 - a * a));
    const pp = this._ik4.subVectors(pole, Sh);
    pp.addScaledVector(dir, -pp.dot(dir));
    if (pp.lengthSq() < 1e-8) pp.set(0, -1, 0).addScaledVector(dir, -dir.y);
    pp.normalize();
    const E = this._ik5.copy(Sh).addScaledVector(dir, a).addScaledVector(pp, h);
    const Wc = this._ik6.copy(Sh).addScaledVector(dir, d);
    const ad = s > 0 ? ADIR_L : ADIR_R;
    const ua1 = _v1.subVectors(E, Sh),
      bend = _v2.subVectors(Wc, E);
    const sec = this._ik7
      .copy(bend)
      .addScaledVector(ua1, -bend.dot(ua1) / ua1.lengthSq());
    if (sec.lengthSq() < 1e-8) sec.copy(pp).negate();
    const ua1c = this._ik8.copy(ua1),
      bendc = this._ik9.copy(bend);
    qAlign(Wq[ua], ad, AZ, ua1c, sec);
    const hinge = this._ik10.crossVectors(ua1c, sec).normalize();
    const sec2 = this._ik7.crossVectors(hinge, bendc);
    qAlign(Wq[fa], ad, AZ, bendc, sec2);
    // forearm twist toward the hand's roll
    _q2.copy(Wq[fa]).invert().multiply(handQ);
    const tdot = _q2.x * ad.x + _q2.y * ad.y + _q2.z * ad.z;
    const tau = 2 * Math.atan2(tdot, _q2.w);
    Wq[tw].copy(Wq[fa]).multiply(_q1.setFromAxisAngle(ad, wrapA(tau) * 0.6));
    Wq[hd].copy(handQ);
    Wp[fa].copy(off[fa]).applyQuaternion(Wq[ua]).add(Sh);
    Wp[tw].copy(off[tw]).applyQuaternion(Wq[fa]).add(Wp[fa]);
    Wp[hd].copy(off[hd]).applyQuaternion(Wq[tw]).add(Wp[tw]);
    return d >= maxR - 1e-4 ? W.distanceTo(Wp[hd]) : 0;
  }
  _fingers(side, handQ, pose) {
    const S = side === 0 ? "L" : "R",
      s = side === 0 ? 1 : -1,
      H = side === 0 ? HR.L : HR.R;
    const Wp = this.Wp,
      Wq = this.Wq,
      off = this.off,
      hd = B["hand" + S];
    const K = this._fk0.crossVectors(H.F, H.P).normalize();
    for (let f = 0; f < 5; f++) {
      const fn = FINGER_NAMES[f];
      const b0 = B[fn + 0 + S],
        b1 = b0 + 1,
        b2 = b0 + 2;
      if (f === 0) {
        const D = hf(
          s,
          FING.th.dir[0],
          FING.th.dir[1],
          FING.th.dir[2],
          this._fk1,
        ).normalize();
        const opp = this._fk2.crossVectors(H.T, H.P).normalize();
        const kt = this._fk3
          .crossVectors(D, _v1.copy(H.P).addScaledVector(H.T, -0.4))
          .normalize();
        Wq[b0]
          .copy(handQ)
          .multiply(_q1.setFromAxisAngle(opp, pose[0]))
          .multiply(_q2.setFromAxisAngle(H.P, (pose[16] || 0) * -s))
          .multiply(_q1.setFromAxisAngle(kt, pose[1]));
        Wq[b1].copy(Wq[b0]).multiply(_q1.setFromAxisAngle(kt, pose[2]));
        Wq[b2].copy(Wq[b1]).multiply(_q1.setFromAxisAngle(kt, pose[3]));
      } else {
        const o = 4 + (f - 1) * 3;
        Wq[b0].copy(handQ).multiply(_q1.setFromAxisAngle(K, pose[o]));
        Wq[b1].copy(Wq[b0]).multiply(_q1.setFromAxisAngle(K, pose[o + 1]));
        Wq[b2].copy(Wq[b1]).multiply(_q1.setFromAxisAngle(K, pose[o + 2]));
      }
      Wp[b0].copy(off[b0]).applyQuaternion(handQ).add(Wp[hd]);
      Wp[b1].copy(off[b1]).applyQuaternion(Wq[b0]).add(Wp[b0]);
      Wp[b2].copy(off[b2]).applyQuaternion(Wq[b1]).add(Wp[b1]);
    }
  }
  _solveLeg(side, ankle, footQ, toeQ, pole) {
    const S = side === 0 ? "L" : "R";
    const Wp = this.Wp,
      Wq = this.Wq,
      off = this.off;
    const th = B["th" + S],
      sh = B["sh" + S],
      ft = B["ft" + S],
      toe = B["toe" + S];
    Wq[th].copy(Wq[B.hips]);
    Wp[th].copy(off[th]).applyQuaternion(Wq[B.hips]).add(Wp[B.hips]);
    const Hj = Wp[th],
      L1 = this.T1,
      L2 = this.T2,
      maxR = (L1 + L2) * 0.9995;
    const D = this._ik3.subVectors(ankle, Hj);
    let d = D.length();
    const dir = D.multiplyScalar(1 / (d || 1));
    d = clamp(d, Math.abs(L1 - L2) + 0.02, maxR);
    const a = (L1 * L1 - L2 * L2 + d * d) / (2 * d),
      h = Math.sqrt(Math.max(0, L1 * L1 - a * a));
    const pp = this._ik4.subVectors(pole, Hj);
    pp.addScaledVector(dir, -pp.dot(dir));
    if (pp.lengthSq() < 1e-8) pp.copy(this._fwd);
    pp.normalize();
    const K = this._ik5.copy(Hj).addScaledVector(dir, a).addScaledVector(pp, h);
    const A = this._ik6.copy(Hj).addScaledVector(dir, d);
    const t1 = this._ik8.subVectors(K, Hj),
      t2 = this._ik9.subVectors(A, K);
    const sec = this._ik7.copy(pp);
    qAlign(Wq[th], _v1.set(0, -1, 0), AZ, t1, sec);
    const hinge = this._ik10.crossVectors(t1, sec).normalize();
    const sec2 = this._ik7.crossVectors(hinge, t2);
    qAlign(Wq[sh], _v1.set(0, -1, 0), AZ, t2, sec2);
    Wp[sh].copy(off[sh]).applyQuaternion(Wq[th]).add(Hj);
    Wp[ft].copy(off[ft]).applyQuaternion(Wq[sh]).add(Wp[sh]);
    Wq[ft].copy(footQ);
    Wq[toe].copy(toeQ);
    Wp[toe].copy(off[toe]).applyQuaternion(Wq[ft]).add(Wp[ft]);
  }

  // ---------------------------------------------------------------- final solve + write
  _solve(P, dt) {
    const Wp = this.Wp,
      Wq = this.Wq,
      k = this.k;
    this._torsoFK(P);
    for (let i = 0; i < 2; i++)
      this._solveLeg(
        i,
        P.foot[i].p,
        P.foot[i].q,
        P.foot[i].toe,
        P.foot[i].pole,
      );
    this.gunP.copy(P.gunP);
    this.gunQ.copy(P.gunQ);
    const hasGun = !!this.gun;
    for (const side of [1, 0]) {
      const H = P.hand[side];
      const on = hasGun ? clamp(H.onGun, 0, 1) : 0;
      const grip = this.gripW[side],
        q = this.handQW[side];
      grip.copy(H.p);
      q.copy(H.q);
      if (on > 0) {
        const g0 = this._gripGun(side, this._gp)
          .applyQuaternion(this.gunQ)
          .add(this.gunP);
        this._gripQ(side, this.gunQ, this._gq);
        grip.lerp(g0, on);
        q.slerp(this._gq, on);
      }
      // elbow pole: mostly "down and out", partly "forearm in line with the hand"
      const H0 = side === 0 ? HR.L : HR.R,
        s = side === 0 ? 1 : -1;
      const Fw = _v3.copy(H0.F).applyQuaternion(q);
      const pole = this._pole
        .copy(grip)
        .addScaledVector(Fw, -(this.L2 + 0.08 * k) * 0.35);
      pole.y -= 0.34 * k;
      pole
        .addScaledVector(this._left, s * 0.16 * k)
        .addScaledVector(this._fwd, -0.08 * k);
      if (side === 1) {
        pole.addScaledVector(
          this._left,
          -0.12 * k * this.b.ads * (1 - this.b.pistol),
        );
        pole.y += 0.1 * k * this.b.ads * (1 - this.b.pistol);
      }
      if (this.b.downed > 0.01 && side === 0) pole.lerp(H.pole, this.b.downed);
      if (this.b.downed > 0.01 && side === 1) {
        pole.y -= 0.1 * this.b.downed;
      }
      let err = this._solveArm(side, grip, q, H.gp, pole, P.clav[side]);
      // support hand out of reach on a long handguard: slide it back along the gun like a real shooter
      if (
        err > 0.003 &&
        side === 0 &&
        on > 0.5 &&
        this.gun &&
        !this.gun.userData.info.pistol
      ) {
        const gx = _v4.set(1, 0, 0).applyQuaternion(this.gunQ);
        for (let it = 0; it < 3 && err > 0.003; it++) {
          grip.addScaledVector(gx, -Math.min(0.2, err * 1.25));
          err = this._solveArm(side, grip, q, H.gp, pole, P.clav[side]);
        }
      }
      this.handErr[side] = err;
      this._fingers(side, q, H.pose);
    }
    // ---- write bones (root group sits at the smoothed feet position, no rotation)
    this.root.position.copy(this.rpos);
    const bones = this.bones;
    bones[0].position.copy(Wp[0]).sub(this.rpos);
    bones[0].quaternion.copy(Wq[0]);
    for (let i = 1; i < NB; i++)
      bones[i].quaternion.copy(
        _q1.copy(Wq[PARENT[i]]).invert().multiply(Wq[i]),
      );
    // ---- gun + muzzle + head
    if (this.gun) {
      this.gun.position.copy(this.gunP).sub(this.rpos);
      this.gun.quaternion.copy(this.gunQ);
      const gi = this.gun.userData.info;
      this.muzzleW.copy(gi.muzzle).applyQuaternion(this.gunQ).add(this.gunP);
    } else this.muzzleW.copy(Wp[B.handR]);
    this.headW.copy(this.D.headC).applyQuaternion(Wq[B.head]).add(Wp[B.head]);
    // ---- props in hand
    const g = this._g || {};
    const pr = this.props;
    pr.knife.visible = !!g.knife && this.b.downed < 0.5;
    pr.grenade.visible = !!g.grenade && this.b.downed < 0.5;
    pr.bottle.visible = !!g.bottle && this.b.downed < 0.5;
    if (pr.knife.visible) this._attach(pr.knife, 1, 0);
    if (pr.grenade.visible) this._attach(pr.grenade, 0, 0);
    if (pr.bottle.visible) this._attach(pr.bottle, 0, 0);
  }
  _attach(obj, side, along) {
    const H0 = side === 0 ? HR.L : HR.R;
    const q = this.Wq[side === 0 ? B.handL : B.handR];
    const s = side === 0 ? 1 : -1;
    const pose = side === 0 ? this._g.poseL : this._g.poseR;
    const go = this._gripOffM(side, pose, this._go2 || (this._go2 = [0, 0, 0]));
    const p = hf(s, go[0], go[1], go[2], _v4)
      .applyQuaternion(q)
      .add(this.Wp[side === 0 ? B.handL : B.handR]);
    // prop local +Y runs along the fist axis (pinky -> index/thumb side)
    const T = _v5.copy(H0.T).applyQuaternion(q),
      F = _v6.copy(H0.F).applyQuaternion(q);
    qFromBasis(obj.quaternion, _v1.crossVectors(T, F).normalize(), T, F);
    obj.position.copy(p).sub(this.rpos);
  }
  _animGun() {
    const f = this.flash;
    if (!this.gun) {
      f.visible = false;
      return;
    }
    const on = (this.flashT > 0 && this.b.downed < 0.99) || this.flashT > 0;
    f.visible = on;
    if (on) {
      const gi = this.gun.userData.info;
      f.position.copy(gi.muzzle);
      f.rotation.set(this.flashRoll, 0, 0);
      const s = this.flashScale * (0.7 + 0.6 * clamp(this.flashT / 0.06, 0, 1));
      f.scale.set(s, s, s);
    }
  }
  _syncGun() {
    const S = this.st;
    const want = S.weaponId || "m1911",
      up = !!S.upgraded;
    if (!this.gun) {
      this._setGun(want, up);
      return;
    }
    if (want !== this.gunId || up !== this.gunUp) {
      if (this.swapT >= 1) this.swapT = 0;
      if (this.swapT >= 0.45 || this.b.downed > 0.5) this._setGun(want, up);
    }
  }
  _setGun(id, up) {
    if (this.gun) {
      this.gun.remove(this.flash);
      this.gun.removeFromParent();
    }
    this.gun = this.mgr._gunFor(id, up);
    this.gunId = id;
    this.gunUp = up;
    if (this.gun) {
      this.root.add(this.gun);
      this.gun.add(this.flash);
      this._solveGunHands();
    }
    this.reload = null;
    this.cycle = null;
  }
}

function sightY(gi, x) {
  const a = gi.sightR,
    c = gi.sightF;
  const t = (x - a.x) / (c.x - a.x || 1);
  return a.y + (c.y - a.y) * t;
}

// ====================================================================================== manager
function flashTexture() {
  if (typeof document === "undefined") return null;
  const W = 256,
    H = 128,
    c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  const x = c.getContext("2d");
  x.globalCompositeOperation = "lighter";
  // left half: front-on star
  const cx = 64,
    cy = 64;
  let g = x.createRadialGradient(cx, cy, 0, cx, cy, 60);
  g.addColorStop(0, "rgba(255,250,235,1)");
  g.addColorStop(0.18, "rgba(255,214,140,0.95)");
  g.addColorStop(0.5, "rgba(255,140,40,0.35)");
  g.addColorStop(1, "rgba(255,90,10,0)");
  x.fillStyle = g;
  x.beginPath();
  x.arc(cx, cy, 60, 0, TAU);
  x.fill();
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * TAU + 0.3,
      l = 50 + (i % 2) * 10;
    x.save();
    x.translate(cx, cy);
    x.rotate(a);
    const gg = x.createLinearGradient(0, 0, l, 0);
    gg.addColorStop(0, "rgba(255,230,170,0.9)");
    gg.addColorStop(1, "rgba(255,120,30,0)");
    x.fillStyle = gg;
    x.beginPath();
    x.moveTo(0, -6);
    x.lineTo(l, 0);
    x.lineTo(0, 6);
    x.fill();
    x.restore();
  }
  // right half: side-on flame cone (base at the left edge of the half)
  const ox = 128;
  g = x.createLinearGradient(ox, 0, W, 0);
  g.addColorStop(0, "rgba(255,250,230,1)");
  g.addColorStop(0.3, "rgba(255,200,110,0.9)");
  g.addColorStop(0.75, "rgba(255,110,30,0.35)");
  g.addColorStop(1, "rgba(255,80,10,0)");
  x.fillStyle = g;
  x.beginPath();
  x.moveTo(ox, 64 - 16);
  x.quadraticCurveTo(ox + 60, 64 - 40, W - 6, 64);
  x.quadraticCurveTo(ox + 60, 64 + 40, ox, 64 + 16);
  x.fill();
  for (const [dy, l] of [
    [-22, 70],
    [22, 66],
    [0, 120],
  ]) {
    const gg = x.createLinearGradient(ox, 0, ox + l, 0);
    gg.addColorStop(0, "rgba(255,235,180,0.8)");
    gg.addColorStop(1, "rgba(255,120,30,0)");
    x.fillStyle = gg;
    x.beginPath();
    x.moveTo(ox, 64 - 5);
    x.lineTo(ox + l, 64 + dy);
    x.lineTo(ox, 64 + 5);
    x.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
function flashGeometry() {
  // quad 1: facing +X (front star, uv left half); quads 2,3: crossed along +X (flame, uv right half)
  const pos = [],
    uv = [],
    idx = [];
  const quad = (a, b, c, d, uvs) => {
    const o = pos.length / 3;
    pos.push(...a, ...b, ...c, ...d);
    uv.push(...uvs);
    idx.push(o, o + 1, o + 2, o, o + 2, o + 3);
  };
  const r = 0.07;
  quad(
    [0.005, -r, -r],
    [0.005, -r, r],
    [0.005, r, r],
    [0.005, r, -r],
    [0, 0, 0.5, 0, 0.5, 1, 0, 1],
  );
  const L = 0.2,
    w = 0.055;
  quad(
    [0, -w, 0],
    [L, -w, 0],
    [L, w, 0],
    [0, w, 0],
    [0.5, 0, 1, 0, 1, 1, 0.5, 1],
  );
  quad(
    [0, 0, -w],
    [L, 0, -w],
    [L, 0, w],
    [0, 0, w],
    [0.5, 0, 1, 0, 1, 1, 0.5, 1],
  );
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  return g;
}

export class AvatarManager {
  /**
   * @param {{scene: THREE.Scene, T: object, buildWeaponModel: Function, fx?: object, audio?: object,
   *          footsteps?: boolean, lights?: number}} opts
   */
  constructor({
    scene,
    T,
    buildWeaponModel,
    fx = null,
    audio = null,
    footsteps = true,
    lights = 2,
  } = {}) {
    this.scene = scene;
    this.T = T;
    this.bwm = buildWeaponModel;
    this.fx = fx;
    this.audio = audio;
    this.footsteps = footsteps;
    this.mats = makeMaterials(T);
    this.avatars = new Map();
    this._chars = [];
    this._guns = new Map();
    this._flashMat = new THREE.MeshBasicMaterial({
      map: flashTexture(),
      color: 0xffffff,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
      toneMapped: false,
      fog: false,
    });
    this._flashMatAether = this._flashMat.clone();
    this._flashMatAether.color.setHex(0x7dffa0);
    this._flashGeo = flashGeometry();
    // pooled muzzle lights: created once, never added / removed at runtime (no shader recompiles)
    this.lights = [];
    for (let i = 0; i < lights; i++) {
      const L = new THREE.PointLight(0xffb45a, 0, 7, 2);
      L.castShadow = false;
      L.name = "avatar_muzzle_light_" + i;
      L.userData = { t: 0, owner: null, peak: 0 };
      scene.add(L);
      this.lights.push(L);
    }
    const m = (n, fb) => {
      try {
        const mm = T && T.mat ? T.mat(n) : null;
        if (mm) return mm;
      } catch (e) {
        /* stub */
      }
      return new THREE.MeshStandardMaterial({
        color: fb,
        roughness: 0.5,
        metalness: 0.5,
      });
    };
    this._propMats = {
      steel: m("gun_metal", 0x444850),
      grip: m("leather", 0x4a3020),
      olive: m("metal_painted_green", 0x445032),
      brass: m("brass", 0xb08a40),
    };
    this._time = 0;
  }
  _skinMat(slot) {
    this._skins = this._skins || [];
    if (!this._skins[slot]) {
      const D = this._charData(slot),
        m = skinShader(this.mats.skin.clone());
      if (D.face) {
        m.map = D.face;
        m.needsUpdate = true;
      }
      m.name = "avatar_skin_" + slot;
      this._skins[slot] = m;
    }
    return this._skins[slot];
  }
  _charData(slot) {
    if (!this._chars[slot])
      this._chars[slot] = buildCharacter(CHARACTERS[slot]);
    return this._chars[slot];
  }
  _gunFor(id, up) {
    if (!this.bwm) return null;
    const key = id + "|" + (up ? 1 : 0);
    let tpl = this._guns.get(key);
    if (!tpl) {
      try {
        tpl = buildGunTemplate(this.bwm, this.T, id, up);
      } catch (e) {
        console.warn("[avatars] gun build failed", id, e);
        tpl = null;
      }
      this._guns.set(key, tpl);
    }
    return tpl ? cloneGun(tpl) : null;
  }
  _makeFlash() {
    const f = new THREE.Mesh(this._flashGeo, this._flashMat);
    f.visible = false;
    f.renderOrder = 10;
    f.frustumCulled = false;
    f.name = "avatar_flash";
    return f;
  }
  _makeProps() {
    const M = this._propMats;
    const root = new THREE.Group();
    root.name = "avatar_props";
    const knife = new THREE.Group();
    const blade = new THREE.Mesh(sbox(0.004, 0.17, 0.024, 8, 8, 6), M.steel);
    blade.position.set(0, 0.11, 0.004);
    knife.add(blade);
    const tip = new THREE.Mesh(new THREE.ConeGeometry(0.012, 0.04, 4), M.steel);
    tip.position.set(0, 0.215, 0.004);
    tip.scale.set(0.3, 1, 1);
    knife.add(tip);
    const handle = new THREE.Mesh(cyl(0.013, 0.012, 0.11, 8), M.grip);
    handle.position.set(0, -0.01, 0);
    knife.add(handle);
    const bottle = new THREE.Group();
    const glassMat = new THREE.MeshStandardMaterial({
      color: 0xc03020,
      roughness: 0.15,
      metalness: 0,
      transparent: true,
      opacity: 0.85,
      emissive: 0x401008,
      emissiveIntensity: 0.6,
    });
    const body = new THREE.Mesh(
      new THREE.LatheGeometry(
        [
          [0, -0.07],
          [0.028, -0.07],
          [0.03, -0.06],
          [0.03, 0.02],
          [0.012, 0.05],
          [0.011, 0.075],
          [0, 0.075],
        ].map(([a, b]) => new THREE.Vector2(a, b)),
        12,
      ),
      glassMat,
    );
    bottle.add(body);
    const cap = new THREE.Mesh(cyl(0.013, 0.013, 0.012, 8), M.brass);
    cap.position.y = 0.08;
    bottle.add(cap);
    const gren = new THREE.Group();
    const gb = new THREE.Mesh(ellip(0.029, 0.04, 0.029, 10, 8), M.olive);
    gren.add(gb);
    const fz = new THREE.Mesh(cyl(0.01, 0.012, 0.03, 8), M.steel);
    fz.position.y = 0.05;
    gren.add(fz);
    const lever = new THREE.Mesh(sbox(0.008, 0.06, 0.012, 6, 6, 4), M.steel);
    lever.position.set(0.02, 0.03, 0);
    gren.add(lever);
    for (const o of [knife, bottle, gren]) {
      o.visible = false;
      o.traverse((q) => {
        if (q.isMesh) q.castShadow = true;
      });
      root.add(o);
    }
    return {
      root,
      knife,
      bottle,
      grenade: gren,
      setBottleColor(c) {
        try {
          const col = new THREE.Color(c ?? 0xc03020);
          glassMat.color.copy(col);
          glassMat.emissive.copy(col).multiplyScalar(0.35);
        } catch (e) {
          /* ignore */
        }
      },
    };
  }
  _pulseLight(av, id) {
    if (!this.lights.length) return;
    let L =
      this.lights.find((l) => l.userData.owner === av) ||
      this.lights.reduce((a, b) => (a.userData.t < b.userData.t ? a : b));
    L.userData.owner = av;
    L.userData.t = 0.07;
    L.userData.peak =
      id === "aether" ? 9 : id === "trench" || id === "mg42" ? 14 : 10;
    L.color.setHex(id === "aether" ? 0x7dff9a : 0xffb45a);
  }

  // ---------------------------------------------------------------- public API
  add(id, { name = "", slot = 0 } = {}) {
    const ex = this.avatars.get(id);
    if (ex) {
      if ((((slot | 0) % 4) + 4) % 4 === ex.slot) {
        ex.name = name;
        return ex;
      }
      this.remove(id);
    }
    const av = new Avatar(this, id, { name, slot });
    this.avatars.set(id, av);
    return av;
  }
  remove(id) {
    const av = this.avatars.get(id);
    if (!av) return;
    for (const L of this.lights)
      if (L.userData.owner === av) {
        L.userData.owner = null;
        L.intensity = 0;
        L.userData.t = 0;
      }
    av.dispose();
    this.avatars.delete(id);
  }
  has(id) {
    return this.avatars.has(id);
  }
  setVisible(id, v) {
    const av = this.avatars.get(id);
    if (av) av.userVisible = !!v;
  }
  setState(id, s) {
    const av = this.avatars.get(id);
    if (av && s) av.setState(s);
  }
  event(id, type, data) {
    const av = this.avatars.get(id);
    if (av) av.event(type, data || {});
  }
  getMuzzle(id, out = new V3()) {
    const av = this.avatars.get(id);
    return av ? out.copy(av.muzzleW) : out.set(0, 0, 0);
  }
  getHead(id, out = new V3()) {
    const av = this.avatars.get(id);
    return av ? out.copy(av.headW) : out.set(0, 0, 0);
  }
  /** optional: build character meshes / gun LODs ahead of time to avoid a hitch when someone joins */
  prewarm(slots = [0, 1, 2, 3], weapons = []) {
    for (const s of slots) this._charData((((s | 0) % 4) + 4) % 4);
    for (const w of weapons) {
      const g = this._gunFor(w, false);
      if (g) g.traverse(() => {});
    }
  }
  update(dt, camera) {
    this._time += dt;
    let camo = false;
    for (const av of this.avatars.values()) {
      av.update(dt, camera);
      if (av.gunUp) camo = true;
    }
    if (camo && this.T && this.T.mat) {
      try {
        const m = this.T.mat("packed_camo");
        if (m && m.userData && m.userData.update) m.userData.update(this._time);
      } catch (e) {
        /* ignore */
      }
    }
    for (const L of this.lights) {
      const u = L.userData;
      if (u.t > 0 && u.owner && u.owner.root.visible) {
        u.t -= dt;
        L.position.copy(u.owner.muzzleW);
        L.intensity = u.peak * clamp(u.t / 0.07, 0, 1) ** 1.5;
      } else {
        L.intensity = 0;
        u.t = 0;
      }
    }
  }
  stats() {
    let calls = 0,
      tris = 0;
    const per = [];
    for (const av of this.avatars.values()) {
      let c = 0,
        t = 0;
      av.root.traverse((o) => {
        if (o.isMesh && o.visible && o.parent && o.parent.visible !== false) {
          let vis = true;
          for (let q = o; q; q = q.parent)
            if (!q.visible) {
              vis = false;
              break;
            }
          if (!vis) return;
          c++;
          t +=
            (o.geometry.index
              ? o.geometry.index.count
              : o.geometry.attributes.position.count) / 3;
        }
      });
      per.push({
        id: av.id,
        slot: av.slot,
        calls: c,
        tris: Math.round(t),
        gun: av.gunId,
      });
      calls += c;
      tris += t;
    }
    return { avatars: this.avatars.size, calls, tris: Math.round(tris), per };
  }
  dispose() {
    for (const id of [...this.avatars.keys()]) this.remove(id);
    for (const L of this.lights) L.removeFromParent();
  }
}

// test / debug hooks
export const _debug = {
  B,
  BONES,
  HP,
  GRIP_OFF,
  buildCharacter,
  buildGunTemplate,
  headSculpt,
};
