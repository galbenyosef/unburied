// src__zombies 01 — geo
// Lines 1-312 of readable/src__zombies.pretty.js (statement-aligned).
// UNBURIED — zombies.js
// Procedural undead WWII-era infantry: skinned (rigid+blended) procedural meshes, procedural
// animation (IK legs, phase-locked footfalls), window AI, hit reactions, ragdoll-ish deaths.
// Owner: zombies agent. Only contract APIs of other modules are used.
import * as THREE from "three";

const V3 = THREE.Vector3;
const TAU = Math.PI * 2;
const TILE = 0.3; // character textures: 1 tile ≈ 0.3 m
const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (t) => {
  t = clamp(t, 0, 1);
  return t * t * (3 - 2 * t);
};
const sstep = (a, b, x) => smooth((x - a) / (b - a));
const damp = (a, b, k, dt) => lerp(a, b, 1 - Math.exp(-k * dt));
const angDiff = (a, b) => {
  let d = (a - b) % TAU;
  if (d > Math.PI) d -= TAU;
  if (d < -Math.PI) d += TAU;
  return d;
};

function rng(seed) {
  let s = seed >>> 0 || 1;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function hash(ix, iy, iz, s) {
  let h =
    Math.imul(ix, 374761393) ^
    Math.imul(iy, 668265263) ^
    Math.imul(iz, 1274126177) ^
    Math.imul(s, 1442695041);
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
  const a = lerp(hash(ix, iy, iz, s), hash(ix + 1, iy, iz, s), u);
  const b = lerp(hash(ix, iy + 1, iz, s), hash(ix + 1, iy + 1, iz, s), u);
  const c = lerp(hash(ix, iy, iz + 1, s), hash(ix + 1, iy, iz + 1, s), u);
  const d = lerp(
    hash(ix, iy + 1, iz + 1, s),
    hash(ix + 1, iy + 1, iz + 1, s),
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
    a += amp * vnoise(x * f, y * f, z * f, s + i * 17);
    n += amp;
    f *= 2.03;
    amp *= 0.5;
  }
  return a / n;
}

// ======================================================================= skeleton
// All bones have identity rest rotation; limbs hang along -Y; character faces +Z; its LEFT is +X.
const BN = [
  "hips",
  "spine",
  "chest",
  "neck",
  "head",
  "jaw",
  "uaL",
  "faL",
  "hL",
  "uaR",
  "faR",
  "hR",
  "thL",
  "shL",
  "ftL",
  "thR",
  "shR",
  "ftR",
];
const BI = Object.fromEntries(BN.map((n, i) => [n, i]));
const PARENT = [-1, 0, 1, 2, 3, 4, 2, 6, 7, 2, 9, 10, 0, 12, 13, 0, 15, 16];
const NB = BN.length,
  H0 = NB * 3,
  BY = H0 + 3,
  BP = H0 + 4,
  PL = H0 + 5;
const ARM_TILT = 0.1,
  UA_LEN = 0.295,
  FA_LEN = 0.265;
const THIGH = 0.43,
  SHIN = 0.415,
  ANKLE = 0.085,
  HIPX = 0.092;
const SH = (s) => new V3(0.19 * s, 1.435, -0.005);
const ADIR = (s) => new V3(Math.sin(ARM_TILT * s), -Math.cos(ARM_TILT * s), 0);
const HEAD_C_OFF = new V3(0, 0.085, 0.013); // head centre relative to head bone

const BONE_POS = (() => {
  const p = [];
  p[0] = new V3(0, 0.97, 0);
  p[1] = new V3(0, 1.1, -0.005);
  p[2] = new V3(0, 1.28, 0);
  p[3] = new V3(0, 1.5, -0.004);
  p[4] = new V3(0, 1.625, 0.008);
  p[5] = p[4]
    .clone()
    .add(HEAD_C_OFF)
    .add(new V3(0, -0.014, -0.006));
  for (const s of [1, -1]) {
    const b = s > 0 ? 6 : 9,
      sh = SH(s),
      d = ADIR(s);
    p[b] = sh;
    p[b + 1] = sh.clone().addScaledVector(d, UA_LEN);
    p[b + 2] = p[b + 1].clone().addScaledVector(d, FA_LEN);
    const l = s > 0 ? 12 : 15;
    p[l] = new V3(HIPX * s, 0.93, 0);
    p[l + 1] = new V3(HIPX * s, 0.5, 0.0);
    p[l + 2] = new V3(HIPX * s, ANKLE, 0);
  }
  return p;
})();
const BONE_INV = BONE_POS.map((p) =>
  new THREE.Matrix4().makeTranslation(-p.x, -p.y, -p.z),
);

// ======================================================================= geometry helpers
const _p = new V3(),
  _n = new V3();
const WHITE = [1, 1, 1];
function posKey(x, y, z) {
  return `${Math.round(x * 2e4)},${Math.round(y * 2e4)},${Math.round(z * 2e4)}`;
}
function fixSeams(geo) {
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
function cutTris(geo, pred) {
  const P = geo.attributes.position,
    I = geo.index.array,
    out = [];
  for (let t = 0; t < I.length; t += 3) {
    const a = I[t],
      b = I[t + 1],
      c = I[t + 2];
    const cx = (P.getX(a) + P.getX(b) + P.getX(c)) / 3,
      cy = (P.getY(a) + P.getY(b) + P.getY(c)) / 3,
      cz = (P.getZ(a) + P.getZ(b) + P.getZ(c)) / 3;
    if (!pred(cx, cy, cz)) out.push(a, b, c);
  }
  geo.setIndex(out);
}
function packW(w, si, sw) {
  if (typeof w === "number") {
    si.push(w, 0, 0, 0);
    sw.push(1, 0, 0, 0);
    return;
  }
  let L = Array.isArray(w[0])
    ? w
    : [
        [w[0], 1 - w[2]],
        [w[1], w[2]],
      ];
  L = L.filter((e) => e[1] > 1e-4)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4);
  let s = 0;
  for (const e of L) s += e[1];
  if (!L.length) {
    L = [[0, 1]];
    s = 1;
  }
  for (let i = 0; i < 4; i++) {
    const e = L[i];
    si.push(e ? e[0] : 0);
    sw.push(e ? e[1] / s : 0);
  }
}

class Acc {
  constructor() {
    this.b = Object.create(null);
  }
  add(bucket, geo, o = {}) {
    if (!geo.index) {
      const a = [];
      for (let i = 0; i < geo.attributes.position.count; i++) a.push(i);
      geo.setIndex(a);
    }
    if (o.m) geo.applyMatrix4(o.m);
    if (o.cut) cutTris(geo, o.cut);
    const P = geo.attributes.position;
    if (o.noise) {
      geo.computeVertexNormals();
      fixSeams(geo);
      const N = geo.attributes.normal,
        f = o.freq || 30,
        a = o.noise,
        sd = o.seed || 0;
      for (let i = 0; i < P.count; i++) {
        const x = P.getX(i),
          y = P.getY(i),
          z = P.getZ(i);
        const d = (fbm(x * f, y * f, z * f, sd, 3) - 0.5) * 2 * a;
        P.setXYZ(i, x + N.getX(i) * d, y + N.getY(i) * d, z + N.getZ(i) * d);
      }
    }
    if (o.post)
      for (let i = 0; i < P.count; i++) {
        _p.fromBufferAttribute(P, i);
        o.post(_p);
        P.setXYZ(i, _p.x, _p.y, _p.z);
      }
    if (!o.flat) {
      geo.computeVertexNormals();
      fixSeams(geo);
    }
    const N = geo.attributes.normal,
      UV = geo.attributes.uv;
    const B =
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
    const base = B.p.length / 3,
      us = (o.uvScale || 1) * (bucket === "skin" ? 2.2 : 1);
    for (let i = 0; i < P.count; i++) {
      _p.fromBufferAttribute(P, i);
      _n.fromBufferAttribute(N, i);
      B.p.push(_p.x, _p.y, _p.z);
      B.n.push(_n.x, _n.y, _n.z);
      if (UV) B.uv.push(UV.getX(i) * us, UV.getY(i) * us);
      else B.uv.push((_p.x + _p.z) / TILE, _p.y / TILE);
      const c =
        typeof o.color === "function" ? o.color(_p, _n) : o.color || WHITE;
      B.c.push(c[0], c[1], c[2]);
      packW(typeof o.w === "function" ? o.w(_p) : (o.w ?? 0), B.si, B.sw);
    }
    const I = geo.index.array;
    for (let k = 0; k < I.length; k++) B.ix.push(base + I[k]);
    geo.dispose();
  }
  finish() {
    const out = {};
    for (const k in this.b) {
      const B = this.b[k],
        g = new THREE.BufferGeometry();
      g.setAttribute("position", new THREE.Float32BufferAttribute(B.p, 3));
      g.setAttribute("normal", new THREE.Float32BufferAttribute(B.n, 3));
      g.setAttribute("uv", new THREE.Float32BufferAttribute(B.uv, 2));
      g.setAttribute("color", new THREE.Float32BufferAttribute(B.c, 3));
      g.setAttribute("skinIndex", new THREE.Uint16BufferAttribute(B.si, 4));
      g.setAttribute("skinWeight", new THREE.Float32BufferAttribute(B.sw, 4));
      g.setIndex(B.ix);
      g.computeBoundingSphere();
      g.computeBoundingBox();
      out[k] = g;
    }
    return out;
  }
}

// loft: rings bottom→top around Y. ring {y, rx, rz, x, z, p (superellipse), back (rz mult for back), dr(th), dy(th)}
// θ = 0 is +Z (front), increasing toward +X.
