// src__avatars 01 — math
// Lines 1-365 of readable/src__avatars.pretty.js (statement-aligned).
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
