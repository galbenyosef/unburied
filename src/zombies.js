// UNBURIED — zombies.js
// Procedural undead WWII-era infantry: skinned (rigid+blended) procedural meshes, procedural
// animation (IK legs, phase-locked footfalls), window AI, hit reactions, ragdoll-ish deaths.
// Owner: zombies agent. Only contract APIs of other modules are used.
import * as THREE from 'three';

const V3 = THREE.Vector3;
const TAU = Math.PI * 2;
const TILE = 0.3;                         // character textures: 1 tile ≈ 0.3 m
const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (t) => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };
const sstep = (a, b, x) => smooth((x - a) / (b - a));
const damp = (a, b, k, dt) => lerp(a, b, 1 - Math.exp(-k * dt));
const angDiff = (a, b) => { let d = (a - b) % TAU; if (d > Math.PI) d -= TAU; if (d < -Math.PI) d += TAU; return d; };

function rng(seed) {
  let s = seed >>> 0 || 1;
  return () => {
    s = (s + 0x6D2B79F5) >>> 0; let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function hash(ix, iy, iz, s) {
  let h = Math.imul(ix, 374761393) ^ Math.imul(iy, 668265263) ^ Math.imul(iz, 1274126177) ^ Math.imul(s, 1442695041);
  h = Math.imul(h ^ (h >>> 13), 1274126177); h ^= h >>> 16;
  return (h >>> 0) / 4294967295;
}
function vnoise(x, y, z, s = 0) {
  const ix = Math.floor(x), iy = Math.floor(y), iz = Math.floor(z);
  const fx = x - ix, fy = y - iy, fz = z - iz;
  const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy), w = fz * fz * (3 - 2 * fz);
  const a = lerp(hash(ix, iy, iz, s), hash(ix + 1, iy, iz, s), u);
  const b = lerp(hash(ix, iy + 1, iz, s), hash(ix + 1, iy + 1, iz, s), u);
  const c = lerp(hash(ix, iy, iz + 1, s), hash(ix + 1, iy, iz + 1, s), u);
  const d = lerp(hash(ix, iy + 1, iz + 1, s), hash(ix + 1, iy + 1, iz + 1, s), u);
  return lerp(lerp(a, b, v), lerp(c, d, v), w);
}
function fbm(x, y, z, s = 0, o = 3) {
  let a = 0, amp = 0.5, f = 1, n = 0;
  for (let i = 0; i < o; i++) { a += amp * vnoise(x * f, y * f, z * f, s + i * 17); n += amp; f *= 2.03; amp *= 0.5; }
  return a / n;
}

// ======================================================================= skeleton
// All bones have identity rest rotation; limbs hang along -Y; character faces +Z; its LEFT is +X.
const BN = ['hips', 'spine', 'chest', 'neck', 'head', 'jaw', 'uaL', 'faL', 'hL', 'uaR', 'faR', 'hR', 'thL', 'shL', 'ftL', 'thR', 'shR', 'ftR'];
const BI = Object.fromEntries(BN.map((n, i) => [n, i]));
const PARENT = [-1, 0, 1, 2, 3, 4, 2, 6, 7, 2, 9, 10, 0, 12, 13, 0, 15, 16];
const NB = BN.length, H0 = NB * 3, BY = H0 + 3, BP = H0 + 4, PL = H0 + 5;
const ARM_TILT = 0.10, UA_LEN = 0.295, FA_LEN = 0.265;
const THIGH = 0.43, SHIN = 0.415, ANKLE = 0.085, HIPX = 0.092;
const SH = (s) => new V3(0.19 * s, 1.435, -0.005);
const ADIR = (s) => new V3(Math.sin(ARM_TILT * s), -Math.cos(ARM_TILT * s), 0);
const HEAD_C_OFF = new V3(0, 0.085, 0.013);            // head centre relative to head bone

const BONE_POS = (() => {
  const p = [];
  p[0] = new V3(0, 0.97, 0); p[1] = new V3(0, 1.10, -0.005); p[2] = new V3(0, 1.28, 0);
  p[3] = new V3(0, 1.50, -0.004); p[4] = new V3(0, 1.625, 0.008);
  p[5] = p[4].clone().add(HEAD_C_OFF).add(new V3(0, -0.014, -0.006));
  for (const s of [1, -1]) {
    const b = s > 0 ? 6 : 9, sh = SH(s), d = ADIR(s);
    p[b] = sh; p[b + 1] = sh.clone().addScaledVector(d, UA_LEN); p[b + 2] = p[b + 1].clone().addScaledVector(d, FA_LEN);
    const l = s > 0 ? 12 : 15;
    p[l] = new V3(HIPX * s, 0.93, 0); p[l + 1] = new V3(HIPX * s, 0.50, 0.0); p[l + 2] = new V3(HIPX * s, ANKLE, 0);
  }
  return p;
})();
const BONE_INV = BONE_POS.map((p) => new THREE.Matrix4().makeTranslation(-p.x, -p.y, -p.z));

// ======================================================================= geometry helpers
const _p = new V3(), _n = new V3();
const WHITE = [1, 1, 1];
function posKey(x, y, z) { return `${Math.round(x * 2e4)},${Math.round(y * 2e4)},${Math.round(z * 2e4)}`; }
function fixSeams(geo) {
  const P = geo.attributes.position, N = geo.attributes.normal, map = new Map();
  for (let i = 0; i < P.count; i++) {
    const k = posKey(P.getX(i), P.getY(i), P.getZ(i));
    let a = map.get(k); if (!a) map.set(k, a = []); a.push(i);
  }
  for (const a of map.values()) {
    if (a.length < 2) continue;
    let x = 0, y = 0, z = 0;
    for (const i of a) { x += N.getX(i); y += N.getY(i); z += N.getZ(i); }
    const l = Math.hypot(x, y, z) || 1;
    for (const i of a) N.setXYZ(i, x / l, y / l, z / l);
  }
}
function cutTris(geo, pred) {
  const P = geo.attributes.position, I = geo.index.array, out = [];
  for (let t = 0; t < I.length; t += 3) {
    const a = I[t], b = I[t + 1], c = I[t + 2];
    const cx = (P.getX(a) + P.getX(b) + P.getX(c)) / 3, cy = (P.getY(a) + P.getY(b) + P.getY(c)) / 3, cz = (P.getZ(a) + P.getZ(b) + P.getZ(c)) / 3;
    if (!pred(cx, cy, cz)) out.push(a, b, c);
  }
  geo.setIndex(out);
}
function packW(w, si, sw) {
  if (typeof w === 'number') { si.push(w, 0, 0, 0); sw.push(1, 0, 0, 0); return; }
  let L = Array.isArray(w[0]) ? w : [[w[0], 1 - w[2]], [w[1], w[2]]];
  L = L.filter((e) => e[1] > 1e-4).sort((a, b) => b[1] - a[1]).slice(0, 4);
  let s = 0; for (const e of L) s += e[1];
  if (!L.length) { L = [[0, 1]]; s = 1; }
  for (let i = 0; i < 4; i++) { const e = L[i]; si.push(e ? e[0] : 0); sw.push(e ? e[1] / s : 0); }
}

class Acc {
  constructor() { this.b = Object.create(null); }
  add(bucket, geo, o = {}) {
    if (!geo.index) { const a = []; for (let i = 0; i < geo.attributes.position.count; i++) a.push(i); geo.setIndex(a); }
    if (o.m) geo.applyMatrix4(o.m);
    if (o.cut) cutTris(geo, o.cut);
    const P = geo.attributes.position;
    if (o.noise) {
      geo.computeVertexNormals(); fixSeams(geo);
      const N = geo.attributes.normal, f = o.freq || 30, a = o.noise, sd = o.seed || 0;
      for (let i = 0; i < P.count; i++) {
        const x = P.getX(i), y = P.getY(i), z = P.getZ(i);
        const d = (fbm(x * f, y * f, z * f, sd, 3) - 0.5) * 2 * a;
        P.setXYZ(i, x + N.getX(i) * d, y + N.getY(i) * d, z + N.getZ(i) * d);
      }
    }
    if (o.post) for (let i = 0; i < P.count; i++) { _p.fromBufferAttribute(P, i); o.post(_p); P.setXYZ(i, _p.x, _p.y, _p.z); }
    if (!o.flat) { geo.computeVertexNormals(); fixSeams(geo); }
    const N = geo.attributes.normal, UV = geo.attributes.uv;
    const B = this.b[bucket] || (this.b[bucket] = { p: [], n: [], uv: [], c: [], si: [], sw: [], ix: [] });
    const base = B.p.length / 3, us = (o.uvScale || 1) * (bucket === 'skin' ? 2.2 : 1);
    for (let i = 0; i < P.count; i++) {
      _p.fromBufferAttribute(P, i); _n.fromBufferAttribute(N, i);
      B.p.push(_p.x, _p.y, _p.z); B.n.push(_n.x, _n.y, _n.z);
      if (UV) B.uv.push(UV.getX(i) * us, UV.getY(i) * us); else B.uv.push((_p.x + _p.z) / TILE, _p.y / TILE);
      const c = typeof o.color === 'function' ? o.color(_p, _n) : (o.color || WHITE);
      B.c.push(c[0], c[1], c[2]);
      packW(typeof o.w === 'function' ? o.w(_p) : (o.w ?? 0), B.si, B.sw);
    }
    const I = geo.index.array;
    for (let k = 0; k < I.length; k++) B.ix.push(base + I[k]);
    geo.dispose();
  }
  finish() {
    const out = {};
    for (const k in this.b) {
      const B = this.b[k], g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(B.p, 3));
      g.setAttribute('normal', new THREE.Float32BufferAttribute(B.n, 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute(B.uv, 2));
      g.setAttribute('color', new THREE.Float32BufferAttribute(B.c, 3));
      g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(B.si, 4));
      g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(B.sw, 4));
      g.setIndex(B.ix);
      g.computeBoundingSphere(); g.computeBoundingBox();
      out[k] = g;
    }
    return out;
  }
}

// loft: rings bottom→top around Y. ring {y, rx, rz, x, z, p (superellipse), back (rz mult for back), dr(th), dy(th)}
// θ = 0 is +Z (front), increasing toward +X.
function loft(rings, seg, o = {}) {
  const pos = [], uv = [], idx = [];
  const n = rings.length, cols = seg + 1;
  const r0 = rings[Math.min(1, n - 1)];
  const uRep = Math.max(1, Math.round(Math.PI * (r0.rx + r0.rz) / TILE));
  for (let i = 0; i < n; i++) {
    const R = rings[i], e = 2 / (R.p || 2), cx = R.x || 0, cz = R.z || 0, back = R.back || 1;
    for (let j = 0; j <= seg; j++) {
      const th = (j / seg) * TAU, s = Math.sin(th), c = Math.cos(th);
      const dr = R.dr ? R.dr(th) : 0;
      const sx = Math.sign(s) * Math.pow(Math.abs(s), e), sz = Math.sign(c) * Math.pow(Math.abs(c), e);
      pos.push(cx + sx * (R.rx + dr), R.y + (R.dy ? R.dy(th) : 0), cz + sz * (R.rz + dr) * (c < 0 ? back : 1));
    }
  }
  // v = true arc length down each column (no stretching where rings differ per angle)
  const vcol = new Float32Array(cols);
  for (let i = 0; i < n; i++) for (let j = 0; j <= seg; j++) {
    const k = (i * cols + j) * 3;
    if (i > 0) { const q = k - cols * 3; vcol[j] += Math.hypot(pos[k] - pos[q], pos[k + 1] - pos[q + 1], pos[k + 2] - pos[q + 2]); }
    uv.push((j / seg) * uRep, vcol[j] / TILE);
  }
  for (let i = 0; i < n - 1; i++) for (let j = 0; j < seg; j++) {
    const a = i * cols + j, b = a + 1, c = a + cols, d = c + 1;
    idx.push(a, b, d, a, d, c);
  }
  const cap = (ri, top) => {
    const R = rings[ri], ci = pos.length / 3;
    pos.push(R.x || 0, R.y, R.z || 0); uv.push(0.5, top ? vcol[0] / TILE : 0);
    for (let j = 0; j < seg; j++) { const a = ri * cols + j; top ? idx.push(ci, a, a + 1) : idx.push(ci, a + 1, a); }
  };
  if (o.capBottom) cap(0, false);
  if (o.capTop) cap(n - 1, true);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  return g;
}
// thin strap with rectangular section along points lying on a surface with normals
function ribbon(pts, nrms, w, t) {
  const pos = [], idx = [], uv = [], n = pts.length, T = new V3(), Bn = new V3();
  const corners = [];
  for (let i = 0; i < n; i++) {
    T.subVectors(pts[Math.min(n - 1, i + 1)], pts[Math.max(0, i - 1)]).normalize();
    Bn.crossVectors(T, nrms[i]).normalize();
    const P = pts[i], N = nrms[i];
    corners.push([
      P.clone().addScaledVector(Bn, w / 2).addScaledVector(N, t), P.clone().addScaledVector(Bn, -w / 2).addScaledVector(N, t),
      P.clone().addScaledVector(Bn, -w / 2), P.clone().addScaledVector(Bn, w / 2)]);
  }
  let len = 0;
  for (let k = 0; k < 4; k++) {
    const base = pos.length / 3; len = 0;
    for (let i = 0; i < n; i++) {
      if (i) len += pts[i].distanceTo(pts[i - 1]);
      const A = corners[i][k], B = corners[i][(k + 1) % 4];
      pos.push(A.x, A.y, A.z, B.x, B.y, B.z); uv.push(0, len / TILE, w / TILE, len / TILE);
    }
    for (let i = 0; i < n - 1; i++) {
      const A = base + i * 2, B = A + 1, C = A + 2, D = A + 3;
      idx.push(A, C, D, A, D, B);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  return g;
}
function sphere(rx, ry, rz, ws = 12, hs = 9) { const g = new THREE.SphereGeometry(1, ws, hs); g.scale(rx, ry, rz); return g; }
const M4 = () => new THREE.Matrix4();
const mT = (x, y, z) => new THREE.Matrix4().makeTranslation(x, y, z);
const mR = (x, y, z, order = 'XYZ') => new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(x, y, z, order));
const mul = (...ms) => ms.reduce((a, b) => a.multiply(b), new THREE.Matrix4());

// ======================================================================= torso surface
const TORSO = [ // y, rx, rz, zc
  [0.79, 0.190, 0.152, -0.004], [0.84, 0.185, 0.146, -0.004], [0.92, 0.178, 0.136, -0.008], [1.00, 0.169, 0.124, -0.004],
  [1.06, 0.164, 0.119, 0.0], [1.14, 0.169, 0.123, 0.004], [1.22, 0.181, 0.131, 0.010], [1.30, 0.191, 0.136, 0.016],
  [1.37, 0.197, 0.131, 0.014], [1.42, 0.199, 0.121, 0.006], [1.46, 0.186, 0.104, 0.0], [1.49, 0.152, 0.091, 0.0],
  [1.512, 0.098, 0.079, 0.004], [1.528, 0.076, 0.071, 0.008], [1.562, 0.07, 0.066, 0.010]];
const TP = 2.6;
function torsoAt(y) {
  const T = TORSO;
  if (y <= T[0][0]) return T[0];
  for (let i = 1; i < T.length; i++) if (y <= T[i][0]) {
    const a = T[i - 1], b = T[i], t = (y - a[0]) / (b[0] - a[0]);
    return [y, lerp(a[1], b[1], t), lerp(a[2], b[2], t), lerp(a[3], b[3], t)];
  }
  return T[T.length - 1];
}
function sePt(th, rx, rz, p, back = 0.93) {
  const s = Math.sin(th), c = Math.cos(th), e = 2 / p;
  return [Math.sign(s) * Math.pow(Math.abs(s), e) * rx, Math.sign(c) * Math.pow(Math.abs(c), e) * rz * (c < 0 ? back : 1)];
}
function torsoSurf(y, th, off = 0) {
  const r = torsoAt(y), p = y > 1.5 ? 2.0 : TP;
  const [x, z] = sePt(th, r[1] + off, r[2] + off, p);
  return new V3(x, y, z + r[3]);
}
function torsoNormal(y, th) {
  const e = 0.004, a = torsoSurf(y, th - e), b = torsoSurf(y, th + e), c = torsoSurf(y - e, th), d = torsoSurf(y + e, th);
  return new V3().crossVectors(b.sub(a), d.sub(c)).normalize();
}
function surfMatrix(y, th, off, flatUp = true) {
  const n = torsoNormal(y, th); if (flatUp) { n.y = 0; n.normalize(); }
  const up = new V3(0, 1, 0), x = new V3().crossVectors(up, n).normalize(), yy = new V3().crossVectors(n, x);
  return new THREE.Matrix4().makeBasis(x, yy, n).setPosition(torsoSurf(y, th, off));
}
function paramOf(x, y, z) { const r = torsoAt(y); return Math.atan2(x, z - r[3]); }

// ======================================================================= weights
function torsoW(p, skirt = 0.5) {
  const y = p.y;
  let wh = 0, ws = 0, wc = 0, wn = 0;
  if (y < 1.0) wh = 1;
  else if (y < 1.12) { const t = sstep(1.0, 1.12, y); wh = 1 - t; ws = t; }
  else if (y < 1.24) { const t = sstep(1.12, 1.24, y); ws = 1 - t; wc = t; }
  else if (y < 1.53) wc = 1;
  else { const t = sstep(1.53, 1.6, y) * 0.6; wc = 1 - t; wn = t; }
  const L = [[0, wh], [1, ws], [2, wc], [3, wn]];
  if (y < 0.92 && skirt > 0) {
    const t = sstep(0.92, 0.5, y) * skirt;
    const a = t * sstep(-0.05, 0.09, p.x), b = t * sstep(0.05, -0.09, p.x);
    L[0][1] = Math.max(0, 1 - a - b); L.push([12, a], [15, b]);
  }
  return L;
}
function armW(p, s) {
  const sh = SH(s), d = ADIR(s), ua = s > 0 ? 6 : 9;
  const t = (p.x - sh.x) * d.x + (p.y - sh.y) * d.y + (p.z - sh.z) * d.z;
  if (t < 0.245) return ua; if (t > 0.345) return ua + 1;
  return [ua, ua + 1, sstep(0.245, 0.345, t)];
}
function legW(p, s) {
  const th = s > 0 ? 12 : 15, d = 0.93 - p.y;
  if (d < 0.36) return th; if (d > 0.5) return th + 1;
  return [th, th + 1, sstep(0.36, 0.5, d)];
}
function footW(p, s) {
  const sh = s > 0 ? 13 : 16;
  if (p.y > 0.125) return sh; if (p.y < 0.075 || p.z > 0.06) return sh + 1;
  return [sh + 1, sh, sstep(0.075, 0.125, p.y)];
}
function neckW(p) {
  const y = p.y;
  if (y < 1.485) return 2; if (y < 1.53) return [2, 3, sstep(1.485, 1.53, y)];
  if (y < 1.592) return 3; if (y < 1.635) return [3, 4, sstep(1.592, 1.635, y)];
  return 4;
}

// ======================================================================= variants
const VARIANTS = [
  { name: 'Grenadier', helmetP: 1.0, hair: 'short', sleeves: { L: 'full', R: 'full' }, ribs: false, wounds: [{ y: 1.08, th: -0.55, hy: 0.035, hth: 0.22 }],
    gear: { ystraps: true, pouches: true, breadbag: true, canteen: true }, pockets: true, jaw: 0.05, weight: 1.2 },
  { name: 'Rotter', helmetP: 0.15, hair: 'patchy', sleeves: { L: 'ripped', R: 'ripped' }, ribs: true, wounds: [],
    gear: { pouches: false, canteen: true }, pockets: false, tunicHem: 0.06, jaw: 0.12, weight: 1.0 },
  { name: 'Amputee', helmetP: 0.9, hair: 'short', missing: 'L', sleeves: { L: 'none', R: 'ripped' }, ribs: false,
    wounds: [{ y: 1.1, th: 0.25, hy: 0.06, hth: 0.42 }], gear: { ystraps: true, pouches: true }, pockets: true, jaw: 0.3, weight: 0.9 },
  { name: 'Gasser', helmetP: 0.0, hair: 'bald', tornCheek: 1, sleeves: { L: 'ripped', R: 'full' }, ribs: false,
    wounds: [{ y: 1.2, th: -0.95, hy: 0.05, hth: 0.3 }], gear: { pouches: true, gasmask: true, breadbag: true }, pockets: true, jaw: 0.18, weight: 1.0 },
  { name: 'Greatcoat', helmetP: 0.85, hair: 'short', greatcoat: true, sleeves: { L: 'full', R: 'full' }, ribs: false, wounds: [],
    gear: { pouches: true, ystraps: false }, pockets: false, jaw: 0.08, weight: 0.8 },
];

// ---------- colour helpers
const mulc = (a, b) => [a[0] * b[0], a[1] * b[1], a[2] * b[2]];
const mix3 = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
const GORE = [0.2, 0.03, 0.028], GORE_DK = [0.06, 0.012, 0.012], BONEC = [0.8, 0.74, 0.58], TOOTH = [0.5, 0.42, 0.26];
const BLOODSTAIN = [0.5, 0.26, 0.22];

function skinColor(seed) {
  return (p) => {
    const m = fbm(p.x * 14, p.y * 14, p.z * 14, seed, 3);
    const b = fbm(p.x * 5 + 3, p.y * 5, p.z * 5, seed + 5, 2);
    let c = [0.72 + 0.45 * m, 0.72 + 0.45 * m, 0.72 + 0.42 * m];
    if (b > 0.58) c = mix3(c, mulc(c, [0.85, 0.62, 0.8]), sstep(0.58, 0.72, b));   // bruising
    if (m < 0.33) c = mix3(c, mulc(c, [0.6, 0.35, 0.3]), sstep(0.33, 0.22, m));    // lesions
    return c;
  };
}

function buildVariant(vi) {
  const cfg = VARIANTS[vi];
  const rnd = rng(9173 + vi * 7919), seed = 11 + vi * 31;
  const A = new Acc();
  const coat = !!cfg.greatcoat;
  const skinC = skinColor(seed);

  // ---------------------------------------------------------------- tunic / greatcoat
  const strips = [];
  for (let i = 0; i < 5; i++) strips.push({ a: rnd() * TAU, w: 0.08 + rnd() * 0.16, d: 0.03 + rnd() * 0.06 });
  const hemDy = (th) => {
    let d = -(cfg.tunicHem || 0.035) * fbm(Math.cos(th) * 3 + 7, Math.sin(th) * 3, 0.5, seed, 3) * 1.6;
    d -= 0.012 * vnoise(th * 9, 0, 0, seed + 3);
    for (const s of strips) d -= s.d * Math.max(0, 1 - Math.abs(angDiff(th, s.a)) / s.w);
    return d;
  };
  const off = coat ? 0.012 : 0;
  const holes0 = (cfg.wounds && cfg.wounds.length) || cfg.ribs;
  const holeYs = (cfg.wounds || []).map((w) => [w.y - w.hy * 1.6, w.y + w.hy * 1.6]);
  if (cfg.ribs) holeYs.push([1.27 - 0.12 * 1.5, 1.27 + 0.12 * 1.5]);
  const rings = [];
  if (coat) {
    rings.push({ y: 0.40, rx: 0.245, rz: 0.215, z: -0.01, p: 2.2, dy: hemDy },
      { y: 0.50, rx: 0.232, rz: 0.2, z: -0.01, p: 2.3 }, { y: 0.62, rx: 0.218, rz: 0.184, z: -0.008, p: 2.4 },
      { y: 0.72, rx: 0.206, rz: 0.17, z: -0.006, p: 2.5 });
  }
  // torso rings, subdivided finely through the chest/abdomen so torn holes get ragged edges
  const tys = [];
  TORSO.forEach((r, i) => {
    if (coat && i === 0) return;
    if (tys.length) { const y0 = tys[tys.length - 1], y1 = r[0]; const near = holeYs.some(([a, b]) => y1 > a && y0 < b); const n = near ? Math.ceil((y1 - y0) / 0.022) : 1; for (let k = 1; k < n; k++) tys.push(lerp(y0, y1, k / n)); }
    tys.push(r[0]);
  });
  tys.forEach((y, i) => {
    const r = torsoAt(y);
    const R = { y, rx: r[1] + off, rz: r[2] + off, z: r[3], p: y > 1.5 ? 2.0 : TP, back: 0.93 };
    if (i === 0 && !coat) R.dy = hemDy;
    if (y > 1.51) { R.rx += coat ? 0.02 : 0; R.rz += coat ? 0.018 : 0; }
    rings.push(R);
  });
  const holes = [];
  for (const w of cfg.wounds || []) holes.push({ ...w, j: 0.85 });
  if (cfg.ribs) holes.push({ y: 1.27, th: 0.33, hy: 0.12, hth: 0.55, j: 0.75 });
  const inHole = (x, y, z, scale = 1) => {
    const th = paramOf(x, y, z);
    for (const h of holes) {
      const u = (y - h.y) / (h.hy * scale), v = angDiff(th, h.th) / (h.hth * scale);
      const jag = 1 + h.j * (fbm(th * 11, y * 55, 0, seed + 9, 3) - 0.5) * 2;
      if (u * u + v * v < jag) return true;
    }
    return false;
  };
  const clothC = (p, n) => {
    let c = [1, 1, 1];
    const g = fbm(p.x * 9, p.y * 9, p.z * 9, seed + 1, 3);
    c = mulc(c, [0.82 + 0.3 * g, 0.82 + 0.3 * g, 0.82 + 0.3 * g]);
    c = mulc(c, [lerp(0.55, 1, sstep(0.5, 1.0, p.y)), lerp(0.55, 1, sstep(0.5, 1.0, p.y)), lerp(0.5, 1, sstep(0.5, 1.0, p.y))]);
    const bl = fbm(p.x * 6 + 11, p.y * 6, p.z * 6, seed + 2, 3);
    if (bl > 0.66) c = mix3(c, mulc(c, BLOODSTAIN), sstep(0.66, 0.78, bl) * 0.7);
    if (p.y > 1.525) c = mulc(c, [0.62, 0.7, 0.62]);                  // dark green collar
    if (holes.length) for (const h of holes) {                         // blood around wounds
      const th = paramOf(p.x, p.y, p.z); const u = (p.y - h.y) / (h.hy * 2.2), v = angDiff(th, h.th) / (h.hth * 2.2);
      const k = 1 - clamp(u * u + v * v, 0, 1); if (k > 0) c = mix3(c, mulc(c, [0.42, 0.16, 0.13]), k * 0.9);
    }
    return c;
  };
  A.add('cloth', loft(rings, holes0 ? 64 : 44, {}), {
    w: (p) => torsoW(p, coat ? 0.75 : 0.5), color: clothC, noise: 0.004, freq: 22, seed,
    cut: holes.length ? (x, y, z) => inHole(x, y, z) : null,
  });
  // coat: skirt split at front + double-breasted buttons + wide lapels suggested by colour
  // gore / cavity patches behind holes
  const patch = (h, depth, scaleOut, bucket, color, cut) => {
    const rows = 20, cols = 26, pos = [], idx = [], uv = [];
    for (let i = 0; i <= rows; i++) for (let j = 0; j <= cols; j++) {
      const v = -1 + (2 * i) / rows, u = -1 + (2 * j) / cols;
      const y = h.y + v * h.hy * scaleOut, th = h.th + u * h.hth * scaleOut;
      const r2 = u * u + v * v;
      const P = torsoSurf(y, th, -(0.004 + off * 0) - depth * Math.max(0, 1 - r2));
      pos.push(P.x, P.y, P.z); uv.push(j / cols, i / rows);
    }
    for (let i = 0; i < rows; i++) for (let j = 0; j < cols; j++) {
      const a = i * (cols + 1) + j, b = a + 1, c = a + cols + 1, d = c + 1; idx.push(a, b, d, a, d, c);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx);
    A.add(bucket, g, { w: (p) => torsoW(p, 0), color, noise: 0.004, freq: 60, seed: seed + 4, cut });
  };
  for (const w of cfg.wounds || []) {
    patch({ ...w }, 0.03, 1.6, 'flesh', (p) => { const th = paramOf(p.x, p.y, p.z); const r = Math.hypot((p.y - w.y) / w.hy, angDiff(th, w.th) / w.hth); return mix3(mix3(GORE, GORE_DK, fbm(p.x * 60, p.y * 60, p.z * 60, seed, 2)), [0.02, 0.005, 0.005], 1 - sstep(0.0, 0.8, r)); });
  }
  if (cfg.ribs) {
    const H = { y: 1.27, th: 0.33, hy: 0.12, hth: 0.55 };
    // rotten skin rim between torn cloth and cavity
    patch(H, 0.006, 1.3, 'skin', (p) => mulc(skinC(p), [0.8, 0.72, 0.7]), (x, y, z) => inHole(x, y, z, 0.72));
    // deep cavity
    patch(H, 0.045, 1.0, 'flesh', (p) => mix3([0.02, 0.005, 0.005], GORE, fbm(p.x * 50, p.y * 50, p.z * 50, seed + 3, 2) * 0.7));
    // ribs sloping down toward the sternum
    for (let k = 0; k < 5; k++) {
      const y0 = 1.165 + k * 0.047, pts = [];
      for (let i = 0; i <= 14; i++) {
        const th = -0.3 + (i / 14) * 1.35;
        const y = y0 + 0.035 * Math.min(1, Math.abs(th - 0.05) / 0.9) - 0.01;
        pts.push(torsoSurf(y, th, -0.012));
      }
      const tg = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 18, 0.0062, 5, false);
      A.add('flesh', tg, { w: (p) => torsoW(p, 0), color: (p) => { const g = fbm(p.x * 90, p.y * 90, p.z * 90, seed, 2); return mulc(BONEC, [0.36 + 0.25 * g, 0.28 + 0.2 * g, 0.2 + 0.15 * g]); } });
    }
    const st = []; for (let i = 0; i <= 6; i++) st.push(torsoSurf(1.15 + i * 0.04, 0.05, -0.01));
    A.add('flesh', new THREE.TubeGeometry(new THREE.CatmullRomCurve3(st), 8, 0.0075, 5, false), { w: (p) => torsoW(p, 0), color: mulc(BONEC, [0.32, 0.25, 0.2]) });
  }
  // buttons (plain, no insignia)
  const btn = (y, th) => A.add('gear', sphere(0.0075, 0.0075, 0.004, 6, 4), { m: surfMatrix(y, th, off + 0.003, false), w: (p) => torsoW(p, 0), color: [0.55, 0.55, 0.5] });
  if (coat) { for (let i = 0; i < 6; i++) { const y = 1.02 + Math.floor(i / 2) * 0.12; btn(y, i % 2 ? 0.28 : -0.28); } }
  else for (let i = 0; i < 5; i++) { const y = 1.13 + i * 0.085; if (!inHole(0, y, torsoSurf(y, 0).z)) btn(y, 0.0); }
  if (cfg.pockets && !coat) for (const s of [1, -1]) {
    const th = 0.52 * s;
    if (inHole(torsoSurf(1.3, th).x, 1.3, torsoSurf(1.3, th).z, 1.6)) continue;
    A.add('cloth', new THREE.BoxGeometry(0.11, 0.038, 0.012), { m: surfMatrix(1.355, th, 0.006), w: (p) => torsoW(p, 0), color: (p, n) => mulc(clothC(p, n), [0.85, 0.85, 0.85]), flat: true });
    A.add('cloth', new THREE.BoxGeometry(0.1, 0.11, 0.006), { m: surfMatrix(1.29, th, 0.002), w: (p) => torsoW(p, 0), color: (p, n) => mulc(clothC(p, n), [0.95, 0.95, 0.95]), flat: true });
    btn(1.35, th);
  }
  // shoulder boards (plain)
  for (const s of [1, -1]) {
    A.add('cloth', new THREE.BoxGeometry(0.12, 0.01, 0.048), { m: mul(mT(0.125 * s, 1.487, 0.0), mR(0, 0, -0.32 * s)), w: 2, color: [0.62, 0.7, 0.62], flat: true });
  }

  // ---------------------------------------------------------------- belt & webbing
  const beltY0 = 1.005, beltY1 = 1.055;
  const bt = (y, extra) => { const r = torsoAt(y); return { y, rx: r[1] + off + extra, rz: r[2] + off + extra, z: r[3], p: TP, back: 0.93 }; };
  A.add('gear', loft([bt(beltY0, 0.002), bt(beltY0, 0.009), bt(beltY1, 0.009), bt(beltY1, 0.002)], 40, {}),
    { w: (p) => torsoW(p, 0), color: [0.34, 0.32, 0.31] });
  A.add('gear', new THREE.BoxGeometry(0.055, 0.044, 0.01), { m: surfMatrix(1.03, 0, off + 0.012), w: (p) => torsoW(p, 0), color: [1.1, 1.08, 1.0], flat: true });
  const G = cfg.gear || {};
  if (G.pouches) for (const s of [1, -1]) for (let k = 0; k < 3; k++) {
    const th = (0.3 + k * 0.27) * s, M = surfMatrix(1.0, th, off + 0.026);
    const tilt = (rnd() - 0.5) * 0.12;
    A.add('gear', new THREE.BoxGeometry(0.046, 0.074, 0.034), { m: mul(M, mR(0, 0, tilt)), w: (p) => torsoW(p, 0), color: [0.36, 0.3, 0.27], flat: true });
    A.add('gear', new THREE.BoxGeometry(0.05, 0.028, 0.038), { m: mul(M, mR(0, 0, tilt), mT(0, 0.026, 0.002)), w: (p) => torsoW(p, 0), color: [0.3, 0.26, 0.23], flat: true });
  }
  if (G.ystraps && !coat) {
    const addStrap = (path) => {
      const pts = [], nrm = [];
      for (let i = 0; i < path.length - 1; i++) for (let k = 0; k < 4; k++) {
        const t = k / 4, y = lerp(path[i][0], path[i + 1][0], t), th = lerp(path[i][1], path[i + 1][1], t);
        pts.push(torsoSurf(y, th, off + 0.004)); nrm.push(torsoNormal(y, th));
      }
      const L = path[path.length - 1]; pts.push(torsoSurf(L[0], L[1], off + 0.004)); nrm.push(torsoNormal(L[0], L[1]));
      A.add('gear', ribbon(pts, nrm, 0.032, 0.006), { w: (p) => torsoW(p, 0), color: [0.4, 0.34, 0.3], flat: false });
    };
    for (const s of [1, -1]) addStrap([[1.05, 0.42 * s], [1.3, 0.5 * s], [1.43, 0.72 * s], [1.485, 1.25 * s], [1.49, 1.75 * s], [1.43, 2.35 * s], [1.3, 2.85 * s], [1.26, Math.PI * s]]);
    addStrap([[1.27, Math.PI - 0.001], [1.04, Math.PI - 0.001]]);
    A.add('gear', new THREE.TorusGeometry(0.014, 0.004, 4, 10), { m: surfMatrix(1.265, Math.PI - 0.001, 0.006), w: 2, color: [0.9, 0.9, 0.85] });
  }
  if (G.breadbag) {
    const M = surfMatrix(0.92, -2.25, off + 0.04);
    A.add('cloth', new THREE.BoxGeometry(0.2, 0.16, 0.06, 3, 3, 2), { m: mul(M, mR(0.08, 0, 0.05)), w: 0, color: [1.2, 1.08, 0.82], noise: 0.004, freq: 40, seed });
    A.add('cloth', new THREE.BoxGeometry(0.205, 0.07, 0.066), { m: mul(M, mR(0.08, 0, 0.05), mT(0, 0.05, 0.003)), w: 0, color: [1.05, 0.95, 0.72], flat: true });
  }
  if (G.canteen) {
    const M = surfMatrix(0.95, 2.35, off + 0.035);
    A.add('gear', new THREE.CylinderGeometry(0.045, 0.047, 0.17, 12), { m: mul(M, mR(0, 0, -0.1), new THREE.Matrix4().makeScale(1, 1, 0.62)), w: 0, color: [0.62, 0.5, 0.36] });
    A.add('gear', new THREE.CylinderGeometry(0.02, 0.02, 0.03, 8), { m: mul(M, mR(0, 0, -0.1), mT(0, 0.1, 0)), w: 0, color: [0.3, 0.3, 0.3] });
  }
  if (G.gasmask) {
    const M = surfMatrix(0.98, -2.75, off + 0.055);
    const cg = new THREE.CylinderGeometry(0.052, 0.052, 0.27, 14, 9);
    A.add('gear', cg, {
      m: mul(M, mR(0, 0, 0.18)), w: 0,
      color: (p) => { const k = Math.sin(p.y * 190) > 0.55 ? 0.62 : 1; return [0.62 * k, 0.68 * k, 0.56 * k]; },
    });
  }

  // ---------------------------------------------------------------- trousers, boots, crotch
  A.add('cloth', sphere(0.16, 0.1, 0.125, 16, 10), { m: mT(0, 0.905, -0.012), w: 0, color: [0.78, 0.8, 0.76] });
  for (const s of [1, -1]) {
    const hx = HIPX * s;
    const R = (d, rx, rz, z = 0) => ({ y: -d, rx, rz, z, p: 2.0 });
    const tr = [R(0.535, 0.054, 0.058, -0.002), R(0.48, 0.056, 0.06, 0.0), R(0.43, 0.059, 0.063, 0.004), R(0.36, 0.068, 0.07, 0.006),
      R(0.28, 0.079, 0.081, 0.008), R(0.18, 0.087, 0.089, 0.01), R(0.08, 0.087, 0.092, 0.008), R(0.0, 0.086, 0.092, 0.0), R(-0.09, 0.08, 0.09, -0.004)];
    const tc = (p) => {
      const g = fbm(p.x * 10, p.y * 10, p.z * 10, seed + 7, 3);
      let c = [0.74 + 0.3 * g, 0.76 + 0.3 * g, 0.72 + 0.28 * g];
      c = mulc(c, [lerp(0.55, 1, sstep(0.35, 0.8, p.y)), lerp(0.52, 1, sstep(0.35, 0.8, p.y)), lerp(0.48, 1, sstep(0.35, 0.8, p.y))]);
      const kn = Math.exp(-((p.y - 0.5) ** 2) / 0.004) * (p.z > 0 ? 1 : 0.3); c = mulc(c, [1 - 0.35 * kn, 1 - 0.38 * kn, 1 - 0.4 * kn]);
      return c;
    };
    A.add('cloth', loft(tr, 20, { capTop: true }), { m: mT(hx, 0.93, 0), w: (p) => legW(p, s), color: tc, noise: 0.004, freq: 25, seed: seed + s });
    // jackboot shaft
    const B = (y, rx, rz, z = 0) => ({ y, rx, rz, z, p: 2.0 });
    const boot = [B(0.07, 0.05, 0.056, 0.004), B(0.11, 0.049, 0.054), B(0.17, 0.053, 0.057), B(0.25, 0.058, 0.062), B(0.34, 0.062, 0.066),
      B(0.43, 0.064, 0.068), B(0.475, 0.066, 0.07), B(0.482, 0.058, 0.062)];
    const bc = (p) => { const g = fbm(p.x * 20, p.y * 20, p.z * 20, seed + 8, 3); const k = 0.3 + 0.16 * g; const mud = sstep(0.22, 0.04, p.y); return mix3([k * 0.55, k * 0.6, k * 0.7], [0.5, 0.42, 0.3], mud * 0.6); };
    A.add('gear', loft(boot, 18, {}), { m: mT(hx, 0, 0), w: (p) => footW(p, s), color: bc, noise: 0.0025, freq: 30, seed });
    // foot (sculpted ellipsoid, flat sole)
    const fg = new THREE.SphereGeometry(1, 16, 10);
    A.add('gear', fg, {
      w: (p) => footW(p, s), color: (p) => (p.y < 0.022 ? [0.16, 0.14, 0.12] : bc(p)),
      post: (v) => {
        let x = v.x * 0.046, y = v.y * 0.05, z = v.z * 0.13;
        const t = sstep(-0.03, 0.13, z); x *= 1 - 0.3 * t; if (y > 0) y *= 1 - 0.5 * t;
        v.set(hx * 1.02 + x, Math.max(0.0, y + 0.045), 0.052 + z);
      },
    });
  }

  // ---------------------------------------------------------------- arms & hands
  const buildHand = (s) => {
    const M0 = mul(mT(BONE_POS[s > 0 ? 8 : 11].x, BONE_POS[s > 0 ? 8 : 11].y, BONE_POS[s > 0 ? 8 : 11].z), mR(0, 0, ARM_TILT * s));
    const hb = s > 0 ? 8 : 11;
    const hcol = (p) => mulc(skinC(p), [0.85, 0.85, 0.85]);
    A.add('skin', sphere(0.017, 0.048, 0.04, 12, 10), { m: mul(M0.clone(), mT(0, -0.047, 0.004)), w: hb, color: hcol, noise: 0.002, freq: 60, seed });
    const zs = [0.026, 0.0095, -0.0075, -0.024], lens = [[0.04, 0.026, 0.02], [0.045, 0.028, 0.021], [0.042, 0.026, 0.02], [0.033, 0.021, 0.017]];
    for (let k = 0; k < 4; k++) {
      let M = mul(M0.clone(), mT(0, -0.084, zs[k]), mR(0, 0, 0, 'XYZ'));
      const claw = 0.8 + rnd() * 0.5;
      const radii = [0.0082, 0.0072, 0.0062];
      for (let j = 0; j < 3; j++) {
        M = M.multiply(mR((rnd() - 0.5) * 0.12, 0, -[0.38, 0.55, 0.45][j] * claw * s));
        const L = lens[k][j];
        const cg = new THREE.CapsuleGeometry(radii[j], L, 1, 5); cg.translate(0, -L / 2, 0);
        A.add('skin', cg, { m: M.clone(), w: hb, color: (p) => mulc(hcol(p), [0.7 - j * 0.1, 0.66 - j * 0.1, 0.62 - j * 0.1]) });
        M = M.multiply(mT(0, -L, 0));
      }
      const nail = new THREE.ConeGeometry(0.0048, 0.014, 5); nail.rotateX(Math.PI); nail.translate(0, -0.004, 0.0);
      A.add('flesh', nail, { m: mul(M.clone(), mR(0, 0, -0.3 * s)), w: hb, color: [0.42, 0.36, 0.22] });
    }
    // thumb
    let M = mul(M0.clone(), mT(-0.004 * s, -0.028, 0.034), mR(-0.75, 0, -0.35 * s));
    for (let j = 0; j < 2; j++) {
      const L = [0.036, 0.028][j];
      const cg = new THREE.CapsuleGeometry([0.0095, 0.008][j], L, 1, 5); cg.translate(0, -L / 2, 0);
      A.add('skin', cg, { m: M.clone(), w: hb, color: hcol });
      M = M.multiply(mT(0, -L, 0)).multiply(mR(0, 0, -0.45 * s));
    }
  };
  for (const s of [1, -1]) {
    const side = s > 0 ? 'L' : 'R';
    const sl = cfg.sleeves[side];
    const sh = SH(s), MA = mul(mT(sh.x, sh.y, sh.z), mR(0, 0, ARM_TILT * s));
    const aw = (p) => armW(p, s);
    const R = (d, r, rz = r, z = 0, dy) => ({ y: -d, rx: r, rz, z, p: 2.0, dy });
    if (cfg.missing === side) {
      // torn stump: short ragged sleeve, gore cap, bone jutting out
      const jag = (th) => 0.03 * (vnoise(th * 5, 0, 0, seed + 21) - 0.5) * 2;
      A.add('cloth', loft([R(0.12, 0.052, 0.052, 0, jag), R(0.06, 0.058), R(0.0, 0.06), R(-0.04, 0.048), R(-0.06, 0.03)], 18, { capTop: true }),
        { m: MA.clone(), w: s > 0 ? 6 : 9, color: clothC, noise: 0.004, freq: 30, seed });
      A.add('flesh', sphere(0.05, 0.02, 0.05, 12, 6), { m: mul(MA.clone(), mT(0, -0.115, 0)), w: s > 0 ? 6 : 9, color: (p) => mix3(GORE, GORE_DK, fbm(p.x * 90, p.y * 90, p.z * 90, seed, 2)), noise: 0.004, freq: 90, seed });
      const bone = new THREE.CylinderGeometry(0.011, 0.013, 0.09, 7); bone.translate(0, -0.15, 0.004);
      A.add('flesh', bone, { m: MA.clone(), w: s > 0 ? 6 : 9, color: BONEC, noise: 0.002, freq: 120, seed });
      continue;
    }
    const full = sl === 'full';
    const rj = (th) => 0.035 * (fbm(Math.cos(th) * 2, Math.sin(th) * 2, s, seed + 13, 3) - 0.5) * 2 - 0.02 * Math.max(0, Math.cos(th * 2 + s));
    const sleeve = full
      ? [R(0.548, 0.039, 0.039), R(0.5, 0.039), R(0.42, 0.041), R(0.34, 0.042), R(0.295, 0.042), R(0.25, 0.044), R(0.17, 0.047), R(0.09, 0.05), R(0.03, 0.052), R(0.0, 0.048), R(-0.025, 0.038), R(-0.04, 0.02)]
      : [R(0.37, 0.044, 0.044, 0, rj), R(0.34, 0.043), R(0.295, 0.043), R(0.25, 0.045), R(0.17, 0.048), R(0.09, 0.051), R(0.03, 0.052), R(0.0, 0.048), R(-0.025, 0.038), R(-0.04, 0.02)];
    A.add('cloth', loft(sleeve, 18, { capTop: true }), { m: MA.clone(), w: aw, color: clothC, noise: 0.004, freq: 26, seed: seed + s });
    // forearm / wrist skin (skinny, sinewy)
    const fa = full ? [R(0.585, 0.022, 0.02), R(0.56, 0.025, 0.022), R(0.5, 0.03, 0.026)]
      : [R(0.585, 0.022, 0.02), R(0.555, 0.025, 0.022), R(0.5, 0.028, 0.025), R(0.42, 0.033, 0.029), R(0.35, 0.037, 0.033), R(0.3, 0.04, 0.036)];
    A.add('skin', loft(fa, 12, { capBottom: true }), { m: MA.clone(), w: aw, color: skinC, noise: full ? 0.001 : 0.0035, freq: 45, seed: seed + 2 * s });
    buildHand(s);
  }

  // ---------------------------------------------------------------- neck
  const NR = (y, rx, rz, z) => ({ y, rx, rz, z, p: 2.0 });
  A.add('skin', loft([NR(1.44, 0.05, 0.047, 0.0), NR(1.5, 0.044, 0.041, 0.004), NR(1.555, 0.041, 0.039, 0.012), NR(1.61, 0.044, 0.042, 0.014), NR(1.67, 0.042, 0.042, 0.006)], 18, {}),
    { w: neckW, color: (p) => mulc(skinC(p), [0.8, 0.8, 0.8]), noise: 0.004, freq: 60, seed });
  // decapitation stump (hidden inside the neck until the head is gone)
  const cap = new THREE.CircleGeometry(0.036, 14); cap.rotateX(-Math.PI / 2);
  A.add('flesh', cap, { m: mT(0, 1.585, 0.01), w: 3, color: (p) => mix3(GORE, GORE_DK, fbm(p.x * 90, p.z * 90, 0, seed, 2)), noise: 0.004, freq: 80, seed });
  const vert = new THREE.CylinderGeometry(0.009, 0.012, 0.035, 6); vert.translate(0, 1.595, -0.01);
  A.add('flesh', vert, { w: 3, color: mulc(BONEC, [0.55, 0.45, 0.4]) });

  // ---------------------------------------------------------------- head
  const HB = BONE_POS[4], C = HB.clone().add(HEAD_C_OFF);
  const G2 = (x, y, cx, cy, sx, sy) => Math.exp(-((x - cx) ** 2 / (2 * sx * sx) + (y - cy) ** 2 / (2 * sy * sy)));
  const sculpt = (nx, ny, nz) => {
    { const kb = 1 / Math.pow(Math.abs(nx) ** 2.6 + Math.abs(ny) ** 2.6 + Math.abs(nz) ** 2.6, 1 / 2.6); const f = lerp(1, kb, 0.75 * sstep(-0.3, 0.25, ny)); nx *= f; ny *= f; nz *= f; }
    let x = nx * 0.077, y = ny * 0.104, z = nz * 0.1;
    if (ny < 0) { const t = -ny; x *= 1 - 0.2 * t * t - 0.1 * Math.max(0, t - 0.6); z *= nz < 0 ? 1 - 0.45 * t : 1 - 0.04 * t; }
    else { if (nz < 0) z *= 1.05; if (ny > 0.55) y *= 1 - 0.06 * (ny - 0.55); }
    if (nz > 0) x *= 1 - 0.07 * nz * nz;
    const fw = sstep(0.0, 0.05, z);
    let dz = 0, dx = 0, dy = 0;
    const sock = G2(x, y, 0.031, 0.004, 0.0155, 0.0125) + G2(x, y, -0.031, 0.004, 0.0155, 0.0125);
    dz -= 0.034 * sock;
    const brow = G2(x, y, 0.03, 0.026, 0.024, 0.007) + G2(x, y, -0.03, 0.026, 0.024, 0.007);
    dz += 0.016 * brow; dy -= 0.004 * brow;
    dz += 0.012 * G2(x, y, 0, 0.004, 0.0065, 0.013);                  // nasal bridge remnant
    dz -= 0.02 * G2(x, y, 0, -0.027, 0.0085, 0.009);                  // rotted-away nose: cavity
    const cb = G2(x, y, 0.05, -0.016, 0.012, 0.009) + G2(x, y, -0.05, -0.016, 0.012, 0.009);
    dz += 0.009 * cb; dx += Math.sign(x) * 0.006 * cb;
    const ch = G2(x, y, 0.041, -0.048, 0.014, 0.016) + G2(x, y, -0.041, -0.048, 0.014, 0.016);
    dz -= 0.017 * ch; dx -= Math.sign(x) * 0.009 * ch;
    const tmp = G2(x, y, 0.066, 0.03, 0.012, 0.016) + G2(x, y, -0.066, 0.03, 0.012, 0.016);
    dx -= Math.sign(x) * 0.006 * tmp;
    dz += 0.013 * G2(x, y, 0, -0.098, 0.018, 0.012);                  // chin
    dz -= 0.006 * G2(x, y, 0, -0.056, 0.022, 0.012);                  // mouth recess
    return [x + dx * fw + dx * (1 - fw) * 0.5, y + dy * fw, z + dz * fw];
  };
  const hg = new THREE.SphereGeometry(1, 48, 36);
  hg.rotateZ(Math.PI / 2);   // poles at the ears (hidden), not the crown
  {
    const P = hg.attributes.position;
    for (let i = 0; i < P.count; i++) {
      const [x, y, z] = sculpt(P.getX(i), P.getY(i), P.getZ(i));
      P.setXYZ(i, C.x + x, C.y + y, C.z + z);
    }
  }
  // surface z lookup (for placing eyes / teeth)
  const surfZ = (lx, ly) => {
    const P = hg.attributes.position; let best = -1, bz = 0;
    for (let i = 0; i < P.count; i++) {
      const x = P.getX(i) - C.x, y = P.getY(i) - C.y, z = P.getZ(i) - C.z;
      if (z < 0) continue; const d = (x - lx) ** 2 + (y - ly) ** 2;
      if (best < 0 || d < best) { best = d; bz = z; }
    }
    return bz;
  };
  const eyeZ = surfZ(0.031, 0.004), mouthZ = surfZ(0, -0.056);
  const cheek = cfg.tornCheek ? { x: 0.036 * cfg.tornCheek, y: -0.048, r: 0.019 } : null;
  const mouthCut = (x, y, z) => {
    const lx = x - C.x, ly = y - C.y, lz = z - C.z;
    if (lz < 0.02) return false;
    const jag = 1 + 0.35 * (vnoise(lx * 300, ly * 300, 0, seed + 5) - 0.5);
    if ((lx / 0.029) ** 2 + ((ly + 0.056) / 0.0125) ** 2 < jag) return true;
    if (cheek && ((lx - cheek.x) ** 2 + (ly - cheek.y) ** 2) < (cheek.r * jag) ** 2) return true;
    return false;
  };
  const headW = (p) => {
    const ly = p.y - C.y, lz = p.z - C.z;
    const w = sstep(-0.05, -0.066, ly) * sstep(-0.045, 0.01, lz);
    return w > 0.001 ? [4, 5, w] : 4;
  };
  const bald = cfg.hair === 'bald';
  const headCol = (p) => {
    const lx = p.x - C.x, ly = p.y - C.y, lz = p.z - C.z;
    let c = skinC(p);
    const sock = G2(lx, ly, 0.031, 0.004, 0.019, 0.015) + G2(lx, ly, -0.031, 0.004, 0.019, 0.015);
    const front = sstep(0.02, 0.06, lz);
    c = mulc(c, [1 - 0.82 * sock * front, 1 - 0.85 * sock * front, 1 - 0.82 * sock * front]);
    const nose = G2(lx, ly, 0, -0.027, 0.01, 0.01) * front; c = mix3(c, [0.06, 0.025, 0.025], nose * 0.95);
    const md = ((lx / 0.04) ** 2 + ((ly + 0.056) / 0.022) ** 2); c = mix3(c, [0.16, 0.08, 0.07], (1 - sstep(0.6, 1.6, md)) * front * 0.85);
    if (cheek) { const cd = Math.hypot(lx - cheek.x, ly - cheek.y) / (cheek.r * 1.9); c = mix3(c, [0.3, 0.08, 0.07], (1 - sstep(0.5, 1, cd)) * front); }
    const cheekHollow = G2(lx, ly, 0.042, -0.05, 0.016, 0.018) + G2(lx, ly, -0.042, -0.05, 0.016, 0.018);
    c = mulc(c, [1 - 0.3 * cheekHollow * front, 1 - 0.3 * cheekHollow * front, 1 - 0.25 * cheekHollow * front]);
    if (bald && ly > 0.03) { const l = fbm(p.x * 40, p.y * 40, p.z * 40, seed + 17, 2); if (l > 0.62) c = mix3(c, [0.35, 0.12, 0.1], sstep(0.62, 0.75, l)); }
    return c;
  };
  A.add('skin', hg, { w: headW, color: headCol, noise: 0.0022, freq: 45, seed, cut: mouthCut, uvScale: 1.8 });
  // mouth interior
  A.add('flesh', sphere(0.033, 0.022, 0.03, 12, 8), { m: mT(C.x, C.y - 0.058, C.z + mouthZ - 0.035), w: (p) => [4, 5, sstep(C.y - 0.05, C.y - 0.066, p.y)], color: [0.03, 0.008, 0.008] });
  if (cheek) A.add('flesh', sphere(0.022, 0.02, 0.03, 10, 8), { m: mT(C.x + cheek.x * 0.55, C.y + cheek.y, C.z + mouthZ - 0.05), w: [4, 5, 0.3], color: [0.05, 0.01, 0.01] });
  // teeth: upper on the skull, lower on the jaw; some missing, crooked, yellowed
  for (const up of [true, false]) {
    const n = 9;
    for (let i = 0; i < n; i++) {
      if (rnd() < 0.14) continue;
      const a = -1.05 + (2.1 * i) / (n - 1);
      const tx = 0.0255 * Math.sin(a), tz = mouthZ - 0.006 - 0.02 * (1 - Math.cos(a)) - (up ? 0 : 0.003);
      const h = (0.0075 + rnd() * 0.004) * (Math.abs(a) > 0.7 ? 0.8 : 1);
      const tg = new THREE.BoxGeometry(0.0058 * (Math.abs(a) > 0.7 ? 1.25 : 1), h, 0.0055);
      const ty = up ? -0.045 - h / 2 : -0.069 + h / 2;
      const M = mul(mT(C.x + tx, C.y + ty, C.z + tz), mR((rnd() - 0.5) * 0.14, a, (rnd() - 0.5) * 0.12));
      const col = mulc(TOOTH, [0.55 + rnd() * 0.35, 0.55 + rnd() * 0.3, 0.5 + rnd() * 0.3]);
      A.add('flesh', tg, { m: M, w: up ? 4 : 5, color: col, flat: true });
    }
    // gum line
    for (let i = 0; i < 7; i++) {
      const a = -1.0 + (2 * i) / 6;
      const tx = 0.024 * Math.sin(a), tz = mouthZ - 0.011 - 0.02 * (1 - Math.cos(a));
      const M = mul(mT(C.x + tx, C.y + (up ? -0.043 : -0.071), C.z + tz), mR(0, a, 0));
      A.add('flesh', new THREE.BoxGeometry(0.012, 0.007, 0.008), { m: M, w: up ? 4 : 5, color: [0.07, 0.025, 0.02], flat: true });
    }
  }
  // eyes (glowing, own bucket) + dark socket cups behind them
  for (const s of [1, -1]) {
    const ex = 0.031 * s, ey = 0.003;
    A.add('eyes', sphere(0.0072, 0.0056, 0.006, 10, 8), { m: mT(C.x + ex, C.y + ey, C.z + eyeZ - 0.001), w: 4, color: WHITE });
    A.add('flesh', sphere(0.0135, 0.011, 0.009, 10, 6), { m: mT(C.x + ex, C.y + ey, C.z + eyeZ - 0.0065), w: 4, color: [0.04, 0.015, 0.015] });
    // ears (rotted nubs)
    A.add('skin', sphere(0.008, 0.022, 0.014, 8, 6), { m: mul(mT(C.x + 0.073 * s, C.y - 0.008, C.z - 0.012), mR(0, 0.35 * s, 0.1 * s)), w: 4, color: (p) => mulc(skinC(p), [0.8, 0.75, 0.75]), noise: 0.002, freq: 90, seed });
  }
  // hair
  if (cfg.hair && cfg.hair !== 'bald') {
    const hr = new THREE.SphereGeometry(1, 34, 22); hr.rotateZ(Math.PI / 2);
    const P = hr.attributes.position;
    for (let i = 0; i < P.count; i++) {
      const [x, y, z] = sculpt(P.getX(i), P.getY(i), P.getZ(i));
      const l = Math.hypot(x, y, z) || 1, k = 1 + 0.0028 / l;
      P.setXYZ(i, C.x + x * k, C.y + y * k + 0.001, C.z + z * k);
    }
    const patchy = cfg.hair === 'patchy';
    A.add('cloth', hr, {
      w: 4, color: (p) => { const g = fbm(p.x * 80, p.y * 80, p.z * 80, seed + 2, 2); return [0.12 + 0.08 * g, 0.1 + 0.06 * g, 0.08 + 0.05 * g]; },
      cut: (x, y, z) => {
        const lx = x - C.x, ly = y - C.y, lz = z - C.z;
        if (ly < 0.01 + (lz > 0 ? 0.045 * sstep(0.0, 0.09, lz) : -0.03 * sstep(0, -0.08, lz))) return true;   // hairline
        if (lz > 0.06 && ly < 0.07) return true;
        if (Math.abs(lx) > 0.06 && ly < 0.035) return true;
        const n = fbm(lx * 70 + 3, ly * 70, lz * 70, seed + 3, 3);
        return patchy ? n < 0.5 : n < 0.3;
      },
    });
  }

  // ---------------------------------------------------------------- crawler stumps (hidden inside trousers)
  for (const s of [1, -1]) A.add('flesh', sphere(0.075, 0.03, 0.075, 10, 6), { m: mT(HIPX * s, 0.905, 0), w: 0, color: GORE });

  const geos = A.finish();

  // ---------------------------------------------------------------- helmet (separate rigid mesh, can fly off)
  const HA = new Acc();
  const D = (th) => { const f = Math.pow(Math.max(0, Math.cos(th)), 1.6), b = Math.pow(Math.max(0, -Math.cos(th)), 1.5); return 0.058 - 0.037 * f + 0.012 * b; };
  const F = (th) => { const f = Math.pow(Math.max(0, Math.cos(th)), 1.6), b = Math.pow(Math.max(0, -Math.cos(th)), 1.5); return 0.023 - 0.014 * f + 0.005 * b; };
  const Rx = 0.099, Rz = 0.118, Hh = 0.079, eqY = 0.128;
  const hr = [];
  hr.push({ y: eqY, rx: Rx - 0.008, rz: Rz - 0.008, dy: (th) => -D(th) + 0.004, dr: (th) => F(th) - 0.004 });
  hr.push({ y: eqY, rx: Rx, rz: Rz, dy: (th) => -D(th), dr: (th) => F(th) });
  hr.push({ y: eqY, rx: Rx, rz: Rz, dy: (th) => -0.72 * D(th), dr: (th) => 0.62 * F(th) });
  hr.push({ y: eqY, rx: Rx, rz: Rz, dy: (th) => -0.42 * D(th), dr: (th) => 0.2 * F(th) });
  hr.push({ y: eqY, rx: Rx + 0.001, rz: Rz + 0.001, dy: (th) => -0.16 * D(th) });
  for (let k = 1; k <= 9; k++) {
    const ph = (k / 9) * (Math.PI / 2);
    hr.push({ y: eqY + Hh * Math.sin(ph), rx: Math.max(0.004, Rx * Math.cos(ph)), rz: Math.max(0.004, Rz * Math.cos(ph)) });
  }
  hr.forEach((r) => { r.z = 0.006; r.p = 2.15; });
  HA.add('h', loft(hr, 40, { capTop: true }), {
    color: (p) => { const g = fbm(p.x * 30, p.y * 30, p.z * 30, seed + 30, 3); const k = 0.8 + 0.35 * g; return [k, k, k * 0.97]; },
    noise: 0.0012, freq: 40, seed,
  });
  for (const s of [1, -1]) HA.add('h', new THREE.CylinderGeometry(0.0065, 0.0065, 0.008, 8), { m: mul(mT(s * (Rx - 0.006), eqY + 0.026, 0.006), mR(0, 0, Math.PI / 2)), color: [0.7, 0.7, 0.7] });
  // broken chin strap dangling
  const csPts = [], csN = [];
  for (let i = 0; i <= 8; i++) { const t = i / 8; csPts.push(new V3(-0.08 - 0.004 * t, eqY - 0.045 - t * 0.085, 0.005 + 0.02 * Math.sin(t * 3))); csN.push(new V3(-1, 0, 0)); }
  HA.add('h', ribbon(csPts, csN, 0.014, 0.003), { color: [0.3, 0.25, 0.2] });
  const hgeo = HA.finish().h;
  hgeo.deleteAttribute('skinIndex'); hgeo.deleteAttribute('skinWeight');
  hgeo.translate(-HEAD_C_OFF.x * 0, 0, 0);
  // helmet built relative to the head bone origin: shift by head centre offset
  hgeo.translate(0, 0, HEAD_C_OFF.z - 0.006);
  hgeo.computeBoundingSphere();

  let tris = 0; for (const k in geos) tris += geos[k].index.count / 3;
  return { cfg, geos, helmet: hgeo, tris, helmetTris: hgeo.index.count / 3 };
}

// ======================================================================= materials
function buildMaterials(T) {
  const get = (name, fb) => {
    let m = null;
    try { m = T && T.mat ? T.mat(name) : null; } catch (e) { m = null; }
    if (!m || !m.isMaterial) m = new THREE.MeshStandardMaterial({ color: fb, roughness: 0.85 });
    return m;
  };
  const mk = (name, fb, tint = [1, 1, 1], o = {}) => {
    const m = get(name, fb).clone();
    m.vertexColors = true;
    m.color = m.color.clone().multiply(new THREE.Color(tint[0], tint[1], tint[2]));
    for (const k in o) m[k] = o[k];
    m.needsUpdate = true;
    return m;
  };
  const skinT = [[0.62, 0.74, 0.6], [0.58, 0.68, 0.6], [0.7, 0.72, 0.64]];
  const clothT = [[0.62, 0.72, 0.64], [0.56, 0.64, 0.64], [0.66, 0.68, 0.58]];
  const M = {
    skin: skinT.map((t) => mk('skin_rotten', 0x7d8a70, t)),
    cloth: clothT.map((t) => mk('cloth_fieldgrey', 0x5d6152, t, { side: THREE.DoubleSide })),
    gear: [mk('leather', 0x3a2c22, [0.5, 0.58, 0.66])],
    flesh: [mk('bone', 0xd8cdb0, [1, 1, 1], { roughness: 0.58, metalness: 0 })],
    helmet: [[0.5, 0.54, 0.5], [0.44, 0.47, 0.45]].map((t) => { const m = mk('helmet_steel', 0x5a5f58, t, { side: THREE.DoubleSide }); return m; }),
    eyes: [new THREE.MeshBasicMaterial({ color: new THREE.Color(1.0, 0.48, 0.07).multiplyScalar(2.0), fog: false })],
    hit: new THREE.MeshBasicMaterial({ visible: false }),
  };
  const burn = (m) => { const b = m.clone(); b.color = m.color.clone().multiplyScalar(0.16); b.roughness = 1; if (b.emissive) b.emissive = new THREE.Color(0x120400); return b; };
  M.burnt = { skin: burn(M.skin[0]), cloth: burn(M.cloth[0]), gear: burn(M.gear[0]), flesh: burn(M.flesh[0]), helmet: burn(M.helmet[0]) };
  return M;
}

// ======================================================================= animation data
const GAIT = {
  walk: { speed: 1.1, cycle: 0.95, stance: 0.56, lift: 0.075, drop: 0.06, bob: 0.022, lean: 0.2 },
  run: { speed: 2.6, cycle: 0.7, stance: 0.36, lift: 0.15, drop: 0.08, bob: 0.04, lean: 0.34 },
  sprint: { speed: 4.4, cycle: 0.56, stance: 0.3, lift: 0.2, drop: 0.1, bob: 0.05, lean: 0.52 },
};
const MIRROR = { ua: ['uaL', 'uaR'], fa: ['faL', 'faR'], hd: ['hL', 'hR'], th: ['thL', 'thR'], sh: ['shL', 'shR'], ft: ['ftL', 'ftR'] };
function kp(o) {
  const a = new Float32Array(PL);
  for (const k in o) {
    const v = o[k];
    if (k === 'h') { a[H0] = v[0]; a[H0 + 1] = v[1]; a[H0 + 2] = v[2]; }
    else if (k === 'by') a[BY] = v; else if (k === 'bp') a[BP] = v;
    else if (MIRROR[k]) { const [l, r] = MIRROR[k]; a.set([v[0], v[1] || 0, v[2] || 0], BI[l] * 3); a.set([v[0], -(v[1] || 0), -(v[2] || 0)], BI[r] * 3); }
    else a.set([v[0], v[1] || 0, v[2] || 0], BI[k] * 3);
  }
  return a;
}
function sampleKeys(keys, u, out) {
  let i = 0; while (i < keys.length - 2 && u > keys[i + 1][0]) i++;
  const [u0, A] = keys[i], [u1, B] = keys[i + 1], t = smooth((u - u0) / (u1 - u0 || 1));
  for (let k = 0; k < PL; k++) out[k] = A[k] + (B[k] - A[k]) * t;
}
const TEAR_T = 1.4, TEAR_HIT = 0.64;
const TEAR_KEYS = (() => {
  const reach = kp({ h: [0, -0.05, 0.03], spine: [0.2], chest: [0.24], neck: [0.1], head: [0.12, 0, 0.1], jaw: [0.35], uaL: [-2.05, 0, -0.2], faL: [-0.25], hL: [0.35, -1.2, 0], uaR: [-1.82, 0, 0.12], faR: [-0.4], hR: [0.35, 1.2, 0] });
  const deep = kp({ h: [0, -0.07, 0.06], spine: [0.26], chest: [0.3], neck: [0.12], head: [0.2, 0, 0.05], jaw: [0.5], uaL: [-1.78, 0, -0.14], faL: [-0.45], hL: [-0.2, -1.2, 0], uaR: [-1.7, 0, 0.1], faR: [-0.5], hR: [-0.2, 1.2, 0] });
  const yank = kp({ h: [0, -0.09, -0.1], spine: [-0.06, 0.12], chest: [-0.14, 0.32], neck: [0.05], head: [-0.15, 0.2, -0.1], jaw: [0.7], uaL: [-0.5, 0, -0.1], faL: [-1.55], hL: [-0.3, -1.0, 0], uaR: [-0.7, 0, 0.06], faR: [-1.35], hR: [-0.3, 1.0, 0] });
  const hold = kp({ h: [0, -0.07, -0.05], spine: [0.05, 0.06], chest: [0.02, 0.18], neck: [0.1], head: [0.05, 0.1], jaw: [0.3], uaL: [-0.85, 0, -0.14], faL: [-1.2], hL: [0.2, -1.1, 0], uaR: [-0.95, 0, 0.1], faR: [-1.0], hR: [0.2, 1.1, 0] });
  return [[0, reach], [0.34, deep], [0.52, deep], [0.66, yank], [0.84, hold], [1.0, reach]];
})();
const ATK_T = 1.05, ATK_HIT = 0.44, ATK_DMG = 45;
const ATK_KEYS = (() => {
  const ready = kp({ h: [0, -0.05, 0], spine: [0.15], chest: [0.12], neck: [0.1], head: [0.1], jaw: [0.2], ua: [-1.25, 0, -0.1], fa: [-0.35], hd: [0.5, -1.2, 0] });
  const wind = kp({ h: [0, -0.04, -0.04], spine: [-0.06, -0.1], chest: [-0.14, -0.12], neck: [-0.05], head: [-0.25], jaw: [0.75], ua: [-2.75, 0, 0.42], fa: [-0.7], hd: [0.2, -0.6, 0] });
  const swipe = kp({ h: [0, -0.1, 0.09], spine: [0.24, 0.1], chest: [0.38, 0.12], neck: [0.15], head: [0.25], jaw: [0.55], ua: [-0.7, 0, -0.5], fa: [-0.2], hd: [0.3, -1.4, 0] });
  const follow = kp({ h: [0, -0.1, 0.07], spine: [0.26], chest: [0.3], neck: [0.1], head: [0.18], jaw: [0.35], ua: [-0.3, 0, -0.3], fa: [-0.45], hd: [0.5, -1.2, 0] });
  return [[0, ready], [0.3, wind], [0.42, swipe], [0.6, follow], [1.0, ready]];
})();
const VAULT_T = 1.55;
const VAULT_KEYS = (() => {
  const a = kp({ by: 0, bp: 0.15, spine: [0.3], chest: [0.25], neck: [0.1], head: [-0.1], jaw: [0.3], ua: [-1.35, 0, -0.1], fa: [-0.2], hd: [0.6, -1.2, 0], th: [-0.1], sh: [0.2], ft: [0] });
  const b = kp({ by: 0.42, bp: 0.35, spine: [0.35], chest: [0.3], neck: [0.0], head: [-0.25], jaw: [0.5], ua: [-0.9, 0, -0.05], fa: [-0.1], hd: [1.0, -1.2, 0], thL: [-1.7, 0, 0.1], shL: [1.9], ftL: [0.2], thR: [0.15, 0, -0.05], shR: [0.35], ftR: [0.3] });
  const c = kp({ by: 0.55, bp: 0.55, spine: [0.3], chest: [0.3], neck: [-0.1], head: [-0.35], jaw: [0.5], ua: [-0.35, 0, -0.1], fa: [-0.1], hd: [1.1, -1.2, 0], thL: [-1.3, 0, 0.1], shL: [1.4], ftL: [0.4], thR: [-1.45, 0, -0.1], shR: [1.9], ftR: [0.5] });
  const d = kp({ by: 0.2, bp: 0.3, spine: [0.2], chest: [0.15], neck: [0.05], head: [-0.1], jaw: [0.4], ua: [-1.1, 0, -0.1], fa: [-0.2], hd: [0.5, -1.2, 0], thL: [-0.35, 0, 0.05], shL: [0.4], ftL: [0.2], thR: [-0.8, 0, -0.05], shR: [1.1], ftR: [0.3] });
  const e = kp({ by: 0, bp: 0.05, h: [0, -0.06, 0], spine: [0.15], chest: [0.12], neck: [0.1], head: [0.1], jaw: [0.2], ua: [-1.2, 0, -0.1], fa: [-0.3], hd: [0.5, -1.2, 0], th: [-0.15], sh: [0.3], ft: [-0.15] });
  return [[0, a], [0.3, b], [0.55, c], [0.8, d], [1.0, e]];
})();
const RISE_T = 2.5;
const DEATHS = ['forward', 'back', 'spin', 'headshot', 'freeze', 'crawl', 'blast', 'nuke'];
const SC = ['rise', 'toWindow', 'tearing', 'vaulting', 'chase', 'attack'];      // net state codes
const RISE_KEYS = (() => {
  const a = kp({ by: -1.9, bp: 0.5, spine: [0.1], chest: [-0.1], neck: [-0.2], head: [-0.4], jaw: [0.8], uaL: [-2.95, 0, 0.1], faL: [-0.2], hL: [-0.3], uaR: [-2.7, 0, -0.1], faR: [-0.4], hR: [-0.3], th: [-0.3], sh: [0.6] });
  const b = kp({ by: -1.25, bp: 0.6, spine: [0.2], chest: [0.1], neck: [-0.2], head: [-0.3], jaw: [0.6], uaL: [-2.2, 0, 0.3], faL: [-0.4], hL: [0.8], uaR: [-2.5, 0, -0.2], faR: [-0.3], hR: [0.8], th: [-0.6], sh: [1.1] });
  const c = kp({ by: -0.7, bp: 0.75, spine: [0.3], chest: [0.3], neck: [-0.1], head: [-0.2], jaw: [0.5], uaL: [-0.9, 0, 0.35], faL: [-0.35], hL: [1.0, -0.4], uaR: [-1.1, 0, -0.3], faR: [-0.25], hR: [1.0, 0.4], th: [-1.2], sh: [1.8] });
  const d = kp({ by: -0.22, bp: 0.45, spine: [0.3], chest: [0.2], neck: [0.1], head: [0.1, 0, 0.2], jaw: [0.3], ua: [-0.6, 0, 0.1], fa: [-0.3], hd: [0.5], thL: [-1.0], shL: [1.4], thR: [-0.4], shR: [0.6] });
  const e = kp({ by: 0, bp: 0.02, h: [0, -0.04, 0], spine: [0.14], chest: [0.1], neck: [0.1], head: [0.15, 0, 0.18], jaw: [0.2], ua: [-0.95, 0, -0.1], fa: [-0.4], hd: [0.5, -1.2, 0], th: [-0.1], sh: [0.2] });
  return [[0, a], [0.3, b], [0.55, c], [0.8, d], [1.0, e]];
})();
// lying poses (targets for the post-fall settle)
const LIE = {
  down: kp({ spine: [0.05], chest: [0, 0.1], neck: [0, 0.5], head: [0.1, 0.9, 0.1], jaw: [0.35], uaL: [-2.5, 0, 0.55], faL: [-0.45], hL: [0.3], uaR: [-0.25, 0, -0.25], faR: [-0.7], hR: [0.3, 0.8], thL: [0.08, 0, 0.12], shL: [0.25], ftL: [1.2], thR: [-0.25, 0, -0.14], shR: [0.55], ftR: [1.0] }),
  up: kp({ spine: [-0.05], chest: [-0.05, 0.1], neck: [-0.1, 0.4], head: [-0.2, 0.7, 0.15], jaw: [0.55], uaL: [-0.35, 0, 1.25], faL: [-0.7], hL: [0.2], uaR: [-0.2, 0, -1.05], faR: [-0.35], hR: [0.2], thL: [-0.5, 0, 0.14], shL: [1.0], ftL: [0.3], thR: [0.05, 0, -0.1], shR: [0.1], ftR: [0.6] }),
  side: kp({ spine: [0.2, 0, 0.1], chest: [0.1, 0.1, 0.1], neck: [0.1, 0, 0.3], head: [0.2, 0.2, 0.35], jaw: [0.4], uaL: [-1.2, 0, 0.2], faL: [-0.8], hL: [0.4], uaR: [-1.6, 0, -0.3], faR: [-0.3], hR: [0.3], thL: [-0.75], shL: [1.2], ftL: [0.4], thR: [-0.15], shR: [0.35], ftR: [0.6] }),
};
const FALL = {
  forward: kp({ h: [0, -0.42, 0], spine: [0.35], chest: [0.3], neck: [0.2], head: [0.3, 0.3], jaw: [0.6], ua: [-0.6, 0, 0.3], fa: [-0.5], hd: [0.5], th: [-0.2, 0, 0.05], sh: [1.65], ft: [0.4] }),
  back: kp({ h: [0, -0.12, 0], spine: [-0.2], chest: [-0.25], neck: [-0.2], head: [-0.5], jaw: [0.8], ua: [-2.3, 0, 0.7], fa: [-0.6], hd: [0.2], th: [-0.35], sh: [0.7], ft: [0.2] }),
  spin: kp({ h: [0, -0.15, 0], spine: [0.1, 0.3, 0.1], chest: [0.1, 0.3], neck: [0], head: [0, 0.4, 0.3], jaw: [0.6], ua: [-0.5, 0, 1.3], fa: [-0.5], thL: [-0.5], shL: [0.9], thR: [-0.1], shR: [0.3] }),
  limp: kp({ h: [0, -0.2, 0], spine: [0.1], chest: [0.05], neck: [0.3], head: [0.4], ua: [-0.15, 0, 0.15], fa: [-0.3], th: [-0.3], sh: [0.7], ft: [0.2] }),
  blast: kp({ spine: [-0.3], chest: [-0.3], neck: [-0.3], head: [-0.5], jaw: [0.8], ua: [-2.6, 0, 1.0], fa: [-0.3], thL: [-0.9, 0, 0.3], shL: [0.9], thR: [0.3, 0, -0.3], shR: [0.4] }),
};
const SPRING_K = new Float32Array(PL).fill(60);
(() => {
  const set = (names, k) => names.forEach((n) => { for (let j = 0; j < 3; j++) SPRING_K[BI[n] * 3 + j] = k; });
  set(['uaL', 'uaR', 'faL', 'faR', 'hL', 'hR'], 34); set(['neck', 'head'], 26); set(['jaw'], 18);
  set(['thL', 'thR', 'shL', 'shR', 'ftL', 'ftR'], 48); set(['hips', 'spine', 'chest'], 60);
  for (let j = H0; j < PL; j++) SPRING_K[j] = 40;
})();

// ======================================================================= scratch
const _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _e = new THREE.Euler(), _v = new V3(), _v2 = new V3(), _v3 = new V3(), _m = new THREE.Matrix4();
const AX = new V3(1, 0, 0), AY = new V3(0, 1, 0), AZ = new V3(0, 0, 1);
const IDENT = new THREE.Matrix4();
const HIPS_REST = BONE_POS[0];
const keyOf = (p) => (p.id != null ? p.id : p);
const r2 = (v) => Math.round(v * 100) / 100, r3 = (v) => Math.round(v * 1000) / 1000;
function toV3(v, fb) {
  if (!v) return fb;
  if (v.isVector3) return v.clone();
  if (Array.isArray(v)) return new V3(+v[0] || 0, +v[1] || 0, +v[2] || 0);
  if (typeof v === 'object') return new V3(+v.x || 0, +v.y || 0, +v.z || 0);
  return fb;
}

function setB(P, b, x, y = 0, z = 0) { P[b * 3] = x; P[b * 3 + 1] = y; P[b * 3 + 2] = z; }
function arm(P, s, ux, uy, uz, fx, fy, fz, hx, hy, hz) {
  const u = s > 0 ? 6 : 9;
  setB(P, u, ux, uy * s, uz * s); setB(P, u + 1, fx, fy * s, fz * s); setB(P, u + 2, hx, hy * s, hz * s);
}
// two-bone leg IK in root space (unscaled), foot target = ankle point
function legIK(P, s, fx, fy, fz, pitch) {
  _e.set(P[0], P[1], P[2], 'XYZ'); _q.setFromEuler(_e);
  _v.set(HIPX * s, -0.04, 0).applyQuaternion(_q);
  const hx = _v.x + P[H0], hy = _v.y + HIPS_REST.y + P[H0 + 1], hz = _v.z + P[H0 + 2];
  _v2.set(fx - hx, fy - hy, fz - hz).applyQuaternion(_q.invert());
  const dx = _v2.x, dy = _v2.y, dz = _v2.z;
  const planar = Math.hypot(dy, dz);
  const L = clamp(Math.hypot(dx, planar), 0.15, THIGH + SHIN - 0.002);
  const alpha = Math.atan2(dz, -dy);
  const knee = Math.PI - Math.acos(clamp((THIGH * THIGH + SHIN * SHIN - L * L) / (2 * THIGH * SHIN), -1, 1));
  const beta = Math.acos(clamp((THIGH * THIGH + L * L - SHIN * SHIN) / (2 * THIGH * L), -1, 1));
  const tx = -(alpha + beta), tz = Math.atan2(dx, Math.max(planar, 1e-3));
  const t = s > 0 ? 12 : 15;
  setB(P, t, tx, 0, tz); setB(P, t + 1, knee, 0, 0); setB(P, t + 2, pitch - (P[0] + tx + knee), 0, 0);
}

// ======================================================================= manager
export class ZombieManager {
  constructor(o = {}) {
    const { scene, level, T, audio, fx } = o;
    this.scene = scene; this.level = level; this.T = T; this.audio = audio; this.fx = fx;
    this.zombies = [];
    this._hb = []; this._hbDirty = true;
    this.instaKill = false;
    this.onAttack = () => {}; this.onKill = () => {};
    this._mats = buildMaterials(T);
    this._variants = [];
    this._occ = new Map();
    this._props = [];
    this._pending = [];
    this._groanTok = 2; this._stepTok = 6; this._deathTok = 3;
    this._time = 0;
    this._P = new Float32Array(PL); this._P2 = new Float32Array(PL);
    this.debug = false;            // test harness: freeze AI
    // co-op / net
    this.netMode = null;           // null (solo) | 'host' | 'client'
    this.netDelay = 0.1;           // client interpolation delay behind the snapshot frontier (s)
    this._nextId = 1;
    this._byId = new Map();
    this._netBuf = new Map();      // id -> [{t,x,z,yaw,c,at,fl}] sorted by t
    this._netLatest = -1; this._netLatestAt = 0; this._rt = null;
    this._deadIds = new Set();
    this._players = []; this._valid = [];
    this.hitGeo = new THREE.BoxGeometry(1, 1, 1);
    if (o.prewarm !== false) this.prewarm();   // ~0.4 s of geometry building: do it at load, not on first spawn
  }

  // ------------------------------------------------------------------ public API
  get hitboxes() {
    if (this._hbDirty) {
      this._hb.length = 0;
      for (const z of this.zombies) if (!z.dead) for (const h of z.hb) if (!h.userData.off) this._hb.push(h);
      this._hbDirty = false;
    }
    return this._hb;
  }
  get alive() { let n = 0; for (const z of this.zombies) if (!z.dead) n++; return n; }
  get list() { return this.zombies.filter((z) => !z.dead); }
  setInstaKill(b) { this.instaKill = !!b; }
  variantCount() { return VARIANTS.length; }
  prewarm() { for (let i = 0; i < VARIANTS.length; i++) this._variant(i); }

  spawn(win, o = {}) {
    if (o.id != null && this._byId.has(o.id)) return this._byId.get(o.id);       // idempotent
    let vi = o.variant;
    if (vi == null || !VARIANTS[vi]) {
      const tot = VARIANTS.reduce((a, v) => a + v.weight, 0); let r = Math.random() * tot; vi = 0;
      for (let i = 0; i < VARIANTS.length; i++) { r -= VARIANTS[i].weight; if (r <= 0) { vi = i; break; } }
    }
    // every per-instance random choice comes from this seed, so a client can rebuild the same zombie
    const seed = o.seed != null ? (o.seed >>> 0) : ((Math.random() * 0x7fffffff) | 0);
    const R = rng(seed * 2654435761 + 97);
    const z = this._create(vi, { ...o, _R: R, seed });
    z.win = win || null;
    z.health = z.maxHealth = o.health ?? 150;
    const a = R() * TAU, r = R() * 0.35;
    if (win && win.outsidePos) {
      z.root.position.set(win.outsidePos.x + Math.cos(a) * r, 0, win.outsidePos.z + Math.sin(a) * r);
      const t = win.attackPos || win.insidePos;
      if (t) z.yaw = Math.atan2(t.x - z.root.position.x, t.z - z.root.position.z);
      this._setState(z, 'rise', true);
      this._fx('dirtBurst', z.root.position.clone());
      this._snd('zombie_spawn', z.root.position, { volume: 0.7 });
    } else {
      if (o.pos) z.root.position.copy(o.pos);
      if (o.yaw != null) z.yaw = o.yaw;
      this._setState(z, o.state || 'chase', true);
    }
    z.root.rotation.y = z.yaw;
    this.scene.add(z.root);
    this.zombies.push(z);
    this._byId.set(z.id, z);
    this._hbDirty = true;
    return z;
  }

  damage(z, dmg, part, point, dir, info = {}) {
    if (!z || z.dead) return { killed: false, headshot: false, deathVariant: null };
    const headshot = part === 'head';
    if (this.netMode === 'client') {       // puppets: the host owns health; show feedback only
      this.remoteHit(z.id, part, point, dir);
      return { killed: false, headshot, deathVariant: null, predicted: true };
    }
    if (this.instaKill) dmg = Math.max(dmg, z.health + 1);
    z.health -= dmg;
    const d = dir ? dir.clone().normalize() : new V3(0, 0, -1);
    if (point && !info.explosive) this._fx('blood', point.clone(), d.clone(), headshot ? 1.4 : 1);
    if (z.health <= 0) {
      const deathVariant = this._kill(z, { headshot, dir: d, info, part, point });
      return { killed: true, headshot, deathVariant };
    }
    this._flinch(z, part, d, dmg / Math.max(60, z.maxHealth * 0.25));
    return { killed: false, headshot, deathVariant: null };
  }

  explode(pos, radius, damage, info = {}) {
    const kills = [];
    if (this.netMode === 'client') return kills;
    for (const z of this.zombies.slice()) {
      if (z.dead) continue;
      const c = _v3.copy(z.root.position); c.y += 0.9;
      const dist = c.distanceTo(pos);
      if (dist > radius) continue;
      const f = 1 - dist / radius;
      const dir = c.clone().sub(pos); dir.y = Math.max(dir.y, 0.2); dir.normalize();
      const r = this.damage(z, damage * (0.3 + 0.7 * f), 'torso', c.clone(), dir, { ...info, explosive: true, explosionPos: pos.clone(), blast: f });
      if (r.killed) kills.push(z);
      else if (f > 0.3 && !z.crawler && z.state !== 'rise' && z.state !== 'vaulting' && Math.random() < 0.45) this._makeCrawler(z);
    }
    return kills;
  }

  killAll(info = {}) {
    if (this.netMode === 'client') return;
    for (const z of this.zombies) if (!z.dead && !z._nuked) { z._nuked = true; this._pending.push({ z, t: Math.random() * 1.5, info: { ...info, nuke: true } }); }
  }

  clear() {
    for (const z of this.zombies) this._dispose(z);
    this.zombies.length = 0;
    for (const p of this._props) p.mesh.parent && p.mesh.parent.remove(p.mesh);
    this._props.length = 0; this._pending.length = 0; this._occ.clear();
    this._byId.clear(); this._netBuf.clear(); this._deadIds.clear(); this._rt = null;
    this._hbDirty = true;
  }

  // ================================================================== co-op / net
  setNetMode(m) { this.netMode = m === 'host' || m === 'client' ? m : null; this._rt = null; }
  byId(id) { return this._byId.get(id) || null; }

  _netSpawnObj(z) {
    const ws = this.level && this.level.windows;
    const c = SC.indexOf(z.state);
    return {
      id: z.id, win: ws && z.win ? ws.indexOf(z.win) : -1, variant: z.variant, seed: z.netSeed, helmet: !!z.hadHelmet,
      speed: z.gait, spd: z.speed, health: z.maxHealth,
      // current motion state, so late joiners don't see a fresh rise
      x: r2(z.root.position.x), z: r2(z.root.position.z), yaw: r2(z.yaw), st: c < 0 ? 4 : c, crawler: z.crawler ? 1 : 0,
    };
  }

  // host → clients, ~20 Hz, unreliable. Row: [id, x, z, yaw, stateCode, animTime, flags]
  netExport() {
    const out = [];
    for (const z of this.zombies) {
      if (z.dead) continue;
      const c = SC.indexOf(z.state);
      const at = z.state === 'tearing' ? z.tearT : z.state === 'attack' ? z.atkT : z.stT;
      out.push([z.id, r2(z.root.position.x), r2(z.root.position.z), r2(angDiff(z.yaw, 0)), c < 0 ? 4 : c, r2(at), (z.crawler ? 1 : 0)]);
    }
    return out;
  }

  // client: buffer rows (may arrive late, lost, or out of order)
  netApply(rows, serverTime) {
    if (!Array.isArray(rows) || !(serverTime >= 0)) return;
    if (serverTime > this._netLatest) { this._netLatest = serverTime; this._netLatestAt = this._time; }
    for (const r of rows) {
      if (!Array.isArray(r) || r.length < 5) continue;
      const id = r[0] | 0;
      if (this._deadIds.has(id)) continue;
      let buf = this._netBuf.get(id);
      if (!buf) { buf = []; this._netBuf.set(id, buf); }
      const smp = { t: serverTime, x: +r[1] || 0, z: +r[2] || 0, yaw: +r[3] || 0, c: r[4] | 0, at: +r[5] || 0, fl: r[6] | 0 };
      let i = buf.length;
      while (i > 0 && buf[i - 1].t > serverTime) i--;
      if (i > 0 && buf[i - 1].t === serverTime) buf[i - 1] = smp; else buf.splice(i, 0, smp);
      if (buf.length > 16) buf.splice(0, buf.length - 16);
    }
  }

  spawnRemote(n) {
    if (!n || n.id == null) return null;
    const id = n.id | 0;
    if (this._byId.has(id)) return this._byId.get(id);                 // idempotent
    if (this._deadIds.has(id)) return null;                             // already killed (raced)
    const ws = this.level && this.level.windows;
    const win = ws && n.win != null && n.win >= 0 ? ws[n.win] || null : null;
    const st = n.st | 0;
    const o = { id, variant: n.variant, seed: n.seed, helmet: n.helmet, speed: typeof n.spd === 'number' ? n.spd : n.speed, gait: n.speed, health: n.health };
    let z;
    if (st === 0 || n.x == null) z = this.spawn(win, o);
    else {
      z = this.spawn(null, { ...o, pos: new V3(n.x, 0, n.z), yaw: n.yaw ?? 0, state: SC[st] || 'chase' });
      z.win = win;
    }
    z.puppet = true;
    if (n.crawler) this._makeCrawler(z, true);
    return z;
  }

  remoteHit(id, part, point, dir) {
    const z = typeof id === 'object' && id ? id : this._byId.get(id);
    if (!z || z.dead) return;
    const d = toV3(dir, new V3(0, 0, -1)).normalize();
    const pt = toV3(point, null);
    if (pt) this._fx('blood', pt, d.clone(), part === 'head' ? 1.4 : 1);
    this._flinch(z, part || 'torso', d, 0.8);
  }

  remoteKill(id, o = {}) {
    const z = this._byId.get(id);
    if (!z || z.dead) return;                                           // unknown yet / already dying → ignore
    const d = toV3(o.dir, new V3(0, 0, -1)).normalize();
    const pt = toV3(o.point, null);
    if (pt && !o.explosive && !o.nuke) this._fx('blood', pt, d.clone(), o.headshot ? 1.4 : 1);
    let dv = o.deathVariant;
    if (dv == null) dv = DEATHS.indexOf(o.nuke ? 'nuke' : o.explosive ? 'blast' : o.headshot ? 'headshot' : 'back') + 8 * 12;
    this._kill(z, { headshot: !!o.headshot, dir: d, info: { remote: true, explosive: !!o.explosive, nuke: !!o.nuke, deathVariant: dv }, part: o.headshot ? 'head' : 'torso' });
  }

  _clientRenderTime(dt) {
    if (this._netLatest < 0) return null;
    const target = this._netLatest + (this._time - this._netLatestAt) - this.netDelay;
    if (this._rt == null || Math.abs(target - this._rt) > 0.5) this._rt = target;
    else this._rt += dt + (target - this._rt) * Math.min(1, dt * 1.5);
    return this._rt;
  }

  _pruneNet() {
    if (this._netLatest < 0) return;
    for (const [id, buf] of this._netBuf) {
      if (!buf.length || this._netLatest - buf[buf.length - 1].t > 3) { this._netBuf.delete(id); continue; }
      // keep a little history behind the render time
      if (this._rt != null) { let k = 0; while (k < buf.length - 2 && buf[k + 1].t < this._rt - 0.25) k++; if (k) buf.splice(0, k); }
    }
  }

  // drive a puppet from interpolated host snapshots (no AI, no attacks, no plank tearing)
  _puppet(z, dt, rt) {
    const buf = this._netBuf.get(z.id);
    if (!buf || !buf.length || rt == null) { z.gspeed = damp(z.gspeed, 0, 8, dt); return; }
    let i = buf.length - 1;
    while (i > 0 && buf[i].t > rt) i--;
    const a = buf[i], b = buf[i + 1];
    let x, zz, yaw;
    if (a.t >= rt || !b && i === 0) { x = a.x; zz = a.z; yaw = a.yaw; }
    else if (b) {
      const f = clamp((rt - a.t) / Math.max(1e-4, b.t - a.t), 0, 1);
      if (Math.hypot(b.x - a.x, b.z - a.z) > 3) { x = b.x; zz = b.z; yaw = b.yaw; }       // teleport: snap
      else { x = lerp(a.x, b.x, f); zz = lerp(a.z, b.z, f); yaw = a.yaw + angDiff(b.yaw, a.yaw) * f; }
    } else {
      // past the newest sample: extrapolate at most 100 ms, then hold
      const q = buf[i - 1], ex = Math.min(rt - a.t, 0.1), span = a.t - q.t;
      if (span > 1e-4 && Math.hypot(a.x - q.x, a.z - q.z) < 3 && a.c === q.c) { x = a.x + (a.x - q.x) / span * ex; zz = a.z + (a.z - q.z) / span * ex; }
      else { x = a.x; zz = a.z; }
      yaw = a.yaw;
    }
    const p = z.root.position, ox = p.x, oz = p.z;
    const fresh = !z.netStarted; z.netStarted = true;
    p.x = x; p.z = zz;
    const moved = fresh ? 0 : Math.hypot(p.x - ox, p.z - oz) / dt;
    if (!fresh && moved > 25) z.gspeed = 0; else z.gspeed = damp(z.gspeed, moved, 12, dt);
    if (!fresh) { z.vel.set((p.x - ox) / dt, 0, (p.z - oz) / dt); }
    z.yaw = yaw; z.root.rotation.y = yaw;
    // state + anim clock from the governing sample
    const st = SC[a.c] || 'chase';
    if (st !== z.state) {
      if (!(st === 'rise' && z.state !== 'rise')) this._setState(z, st, fresh);
    }
    const at = a.at + Math.max(0, rt - a.t);
    if (z.state === 'rise') z.stT = Math.min(at, RISE_T);
    else if (z.state === 'vaulting') z.stT = Math.min(at, VAULT_T);
    else if (z.state === 'tearing') {
      const prev = z.tearT, nt = at % TEAR_T, hit = TEAR_T * TEAR_HIT;
      if (!fresh && ((prev < hit && nt >= hit) || (nt < prev && hit > prev))) {
        if (z.win && (z.win.planks ?? 0) > 0) this._snd('plank_tear', z.win.attackPos || p, { volume: 0.9 });
        z.vocal = 1;
      }
      z.tearT = nt;
    } else if (z.state === 'attack') { z.atkT = Math.min(at, ATK_T); this._attackSound(z); }
    if ((a.fl & 1) && !z.crawler) this._makeCrawler(z);
  }

  update(dt, players, opts = {}) {
    dt = Math.min(dt, 0.05);
    if (dt <= 0) return;
    this._time += dt;
    this._groanTok = Math.min(3, this._groanTok + dt * 0.9);
    this._stepTok = Math.min(8, this._stepTok + dt * 14);
    this._deathTok = Math.min(4, this._deathTok + dt * 3);
    // players: array of {id, pos, eye, alive, downed}; a single object is still accepted
    const list = Array.isArray(players) ? players : (players ? [players] : []);
    this._players = list.filter((p) => p && p.pos);
    this._valid = this._players.filter((p) => p.alive !== false && !p.downed);
    const client = this.netMode === 'client';
    const rt = client ? (opts.renderTime ?? this._clientRenderTime(dt)) : null;
    // staggered nuke deaths (host / solo)
    for (let i = this._pending.length - 1; i >= 0; i--) {
      const p = this._pending[i]; p.t -= dt;
      if (p.t <= 0) { this._pending.splice(i, 1); if (!p.z.dead && this.zombies.includes(p.z)) this._kill(p.z, { headshot: false, dir: new V3(Math.random() - 0.5, 0.3, Math.random() - 0.5).normalize(), info: p.info }); }
    }
    for (let i = this.zombies.length - 1; i >= 0; i--) {
      const z = this.zombies[i];
      z.t += dt; z.stT += dt;
      if (z.dead) {
        this._deathUpdate(z, dt);
        if (z.D.t > 9.5) { this._dispose(z); this.zombies.splice(i, 1); }
        continue;
      }
      if (client) {
        // safety: a puppet missing from snapshots for > 1 s is removed silently
        const buf = this._netBuf.get(z.id);
        const seen = Math.max(z.netSeenT ?? -1, buf && buf.length ? buf[buf.length - 1].t : -1);
        if (this._netLatest >= 0 && seen >= 0 && this._netLatest - seen > 1.0) { this._dispose(z); this.zombies.splice(i, 1); continue; }
        if (seen < 0 && this._netLatest >= 0 && z.netSeenT == null) z.netSeenT = this._netLatest;
        this._puppet(z, dt, rt);
      } else if (!this.debug || z.debugAI) this._ai(z, dt);
      else this._debugDrive(z, dt);
      this._audio(z, dt);
      this._animate(z, dt);
    }
    this._propsUpdate(dt);
    if (client) this._pruneNet();
  }

  // ------------------------------------------------------------------ construction
  _variant(i) { return this._variants[i] || (this._variants[i] = buildVariant(i)); }

  _create(vi, o) {
    const V = this._variant(vi), M = this._mats;
    const R = o._R || Math.random;
    const root = new THREE.Group(), rig = new THREE.Group();
    root.name = 'zombie'; root.add(rig);
    const bones = BN.map((n, i) => { const b = new THREE.Bone(); b.name = n; return b; });
    bones.forEach((b, i) => {
      const p = BONE_POS[i], pp = PARENT[i] >= 0 ? BONE_POS[PARENT[i]] : new V3();
      b.position.set(p.x - pp.x, p.y - pp.y, p.z - pp.z);
      if (PARENT[i] >= 0) bones[PARENT[i]].add(b); else rig.add(b);
    });
    bones[BI.thL].rotation.order = 'ZXY'; bones[BI.thR].rotation.order = 'ZXY';
    const skeleton = new THREE.Skeleton(bones, BONE_INV.map((m) => m.clone()));
    const tintS = (R() * 3) | 0, tintC = (R() * 3) | 0;
    const mats = { skin: M.skin[tintS], cloth: M.cloth[tintC], gear: M.gear[0], flesh: M.flesh[0], eyes: M.eyes[0] };
    const meshes = {};
    for (const k of ['skin', 'cloth', 'gear', 'flesh', 'eyes']) {
      if (!V.geos[k]) continue;
      const m = new THREE.SkinnedMesh(V.geos[k], mats[k]);
      m.bind(skeleton, IDENT);
      m.frustumCulled = false;
      m.castShadow = k !== 'eyes'; m.receiveShadow = k !== 'eyes';
      root.add(m); meshes[k] = m;
    }
    let helmet = null;
    // always draw the same number of values so host and client stay in lock-step
    const hRoll = R(), hMat = (R() * 2) | 0, hr = [-0.1 + R() * 0.12, (R() - 0.5) * 0.1, (R() - 0.5) * 0.14];
    const hasHelmet = o.helmet != null ? !!o.helmet : hRoll < V.cfg.helmetP;
    if (hasHelmet) {
      helmet = new THREE.Mesh(V.helmet, M.helmet[hMat]);
      helmet.castShadow = true; helmet.receiveShadow = true;
      helmet.rotation.set(hr[0], hr[1], hr[2]);
      bones[BI.head].add(helmet);
    }
    const sRoll = R();
    const scale = o.scale ?? (0.97 + sRoll * 0.08);
    root.scale.setScalar(scale);
    const z = {
      id: 0, variant: vi, variantName: V.cfg.name, root, rig, bones, skeleton, meshes, helmet,
      netSeed: o.seed >>> 0, hadHelmet: hasHelmet,
      pos: root.position, scale, yaw: 0, vel: new V3(), gspeed: 0,
      state: 'chase', stT: 0, t: R() * 10, dead: false, alive: true,
      health: 100, maxHealth: 100, crawler: false, missing: V.cfg.missing || null,
      gait: 'walk', speed: 1.1, phase: R(), prevPhase: 0,
      P: new Float32Array(PL), Pfrom: new Float32Array(PL), blend: 1, blendDur: 0.25,
      fl: new Float32Array(5), flv: new Float32Array(5), slow: 0,
      seed: R() * 100, limp: R() < 0.7 ? (R() < 0.5 ? 1 : -1) : 0,
      armH: R(), armDrop: V.cfg.missing ? 0 : (R() < 0.18 ? (R() < 0.5 ? 1 : -1) : 0),
      headTilt: (R() - 0.5) * 0.5, jawBase: V.cfg.jaw || 0.1, vocal: 0,
      repath: R() * 0.5, path: null, pathI: 0, groanT: 1 + R() * 5,
      tgtKey: null, tgtT: 0, lastTgt: new V3(), hasLast: false, wanderC: null, wanderP: null, wanderT: 0, pauseT: 0, stuckT: 0,
      tearT: 0, tearHit: false, atkT: 0, atkHit: false, atkCd: 0,
      hb: [], D: null, fountain: 0, fountT: 0,
    };
    // gait
    let sp = o.speed ?? 'walk';
    const jRoll = R();
    if (typeof sp === 'number') { z.speed = sp; sp = sp >= 3.5 ? 'sprint' : sp >= 1.8 ? 'run' : 'walk'; }
    else { if (!GAIT[sp]) sp = 'walk'; z.speed = GAIT[sp].speed * (0.94 + jRoll * 0.12); }
    z.gait = GAIT[o.gait] ? o.gait : sp;
    // stable integer id (host assigns; client passes the host's)
    if (o.id != null) { z.id = o.id | 0; this._nextId = Math.max(this._nextId, z.id + 1); }
    else z.id = this._nextId++;
    z.netSpawn = () => this._netSpawnObj(z);
    // hitboxes
    const hb = (bone, part, sx, sy, sz, cx, cy, cz) => {
      const m = new THREE.Mesh(this.hitGeo, M.hit);
      m.scale.set(sx, sy, sz); m.position.set(cx, cy, cz); m.visible = false;
      m.userData = { zombie: z, part, bone };
      bones[bone].add(m); z.hb.push(m);
    };
    if (helmet) hb(4, 'head', 0.25, 0.27, 0.29, 0, 0.1, 0.013); else hb(4, 'head', 0.19, 0.25, 0.235, 0, 0.085, 0.018);
    hb(2, 'torso', 0.42, 0.36, 0.28, 0, 0.08, 0.005);
    hb(0, 'torso', 0.38, 0.34, 0.27, 0, 0.0, 0);
    for (const s of [1, -1]) {
      const u = s > 0 ? 6 : 9, side = s > 0 ? 'L' : 'R';
      if (z.missing !== side) {
        hb(u, 'limb', 0.13, 0.32, 0.13, 0.014 * s, -0.15, 0);
        hb(u + 1, 'limb', 0.11, 0.42, 0.12, 0.012 * s, -0.2, 0);
      } else hb(u, 'limb', 0.12, 0.16, 0.12, 0.01 * s, -0.05, 0);
      const l = s > 0 ? 12 : 15;
      hb(l, 'limb', 0.18, 0.45, 0.19, 0, -0.21, 0.005);
      hb(l + 1, 'limb', 0.14, 0.44, 0.16, 0, -0.2, 0);
      hb(l + 2, 'limb', 0.11, 0.1, 0.27, 0, -0.03, 0.06);
    }
    if (z.missing) { const a = z.missing === 'L' ? 1 : -1; z.armDrop = 0; z.missingS = a; }
    return z;
  }

  _dispose(z) {
    this._release(z);
    if (this._byId.get(z.id) === z) this._byId.delete(z.id);
    if (z.root.parent) z.root.parent.remove(z.root);
    if (z.helmet && z.helmet.parent) z.helmet.parent.remove(z.helmet);
    this._props = this._props.filter((p) => { if (p.owner === z) { p.mesh.parent && p.mesh.parent.remove(p.mesh); return false; } return true; });
    try { z.skeleton.dispose(); } catch (e) { /* ignore */ }
    this._hbDirty = true;
  }

  // ------------------------------------------------------------------ helpers
  _snd(name, pos, o = {}) {
    const a = this.audio; if (!a || !a.play) return;
    try { a.play(name, { position: pos ? pos.clone() : undefined, volume: o.volume ?? 1, pitch: o.pitch ?? (0.9 + Math.random() * 0.2), variant: o.variant }); } catch (e) { /* ignore */ }
  }
  _fx(fn, ...args) { const f = this.fx; if (f && typeof f[fn] === 'function') { try { f[fn](...args); } catch (e) { /* ignore */ } } }
  _setState(z, s, instant = false) {
    if (z.state === s && !instant) return;
    z.state = s; z.stT = 0;
    if (instant) z.blend = 1; else { z.Pfrom.set(z.P); z.blend = 0; z.blendDur = s === 'vaulting' || s === 'attack' ? 0.18 : 0.28; }
    if (s === 'tearing') { z.tearT = 0; z.tearHit = false; }
    if (s === 'attack') { z.atkT = 0; z.atkHit = false; z.atkSnd = false; }
  }
  _release(z) { if (z.win && this._occ.get(z.win) === z) this._occ.delete(z.win); }
  _faceTo(z, yaw, rate, dt) { const d = angDiff(yaw, z.yaw); z.yaw += clamp(d, -rate * dt, rate * dt); z.root.rotation.y = z.yaw; }
  _chest(z, out) { return out.set(z.root.position.x, 1.25 * z.scale, z.root.position.z); }

  _moveToward(z, tx, tz, speed, dt, stop, collide, noSep = false) {
    const p = z.root.position;
    let dx = tx - p.x, dz = tz - p.z; const d = Math.hypot(dx, dz);
    let dvx = 0, dvz = 0;
    if (d > stop) { const k = speed * Math.min(1, (d - stop) / 0.4 + 0.15) / d; dvx = dx * k; dvz = dz * k; }
    // separation
    let sx = 0, sz = 0;
    if (!noSep) for (const o of this.zombies) {
      if (o === z || o.dead || o.state === 'rise') continue;
      const ox = p.x - o.root.position.x, oz = p.z - o.root.position.z, od2 = ox * ox + oz * oz;
      if (od2 < 0.5 && od2 > 1e-6) { const od = Math.sqrt(od2), f = (0.71 - od) / 0.71; sx += (ox / od) * f * 2.2; sz += (oz / od) * f * 2.2; }
    }
    // players are obstacles: downed ones get a wide berth (zombies walk past / circle them)
    for (const pl of this._players) {
      const r = pl.downed || pl.alive === false ? 0.8 : 0.5;
      const ox = p.x - pl.pos.x, oz = p.z - pl.pos.z, od2 = ox * ox + oz * oz;
      if (od2 < r * r && od2 > 1e-6) {
        const od = Math.sqrt(od2), f = (r - od) / r;
        sx += (ox / od) * f * 3; sz += (oz / od) * f * 3;
        if (pl.downed) { const tl = Math.sign(dvx * oz - dvz * ox) || 1; sx += (-oz / od) * f * 1.5 * tl; sz += (ox / od) * f * 1.5 * tl; }   // slide round
      }
    }
    dvx += sx; dvz += sz;
    const acc = 1 - Math.exp(-dt * (z.gait === 'sprint' ? 5 : 7));
    z.vel.x += (dvx - z.vel.x) * acc; z.vel.z += (dvz - z.vel.z) * acc;
    const ox = p.x, oz = p.z;
    p.x += z.vel.x * dt; p.z += z.vel.z * dt;
    if (collide && this.level && this.level.resolveCircle) { try { this.level.resolveCircle(p, 0.28 * z.scale, 1.8); } catch (e) { /* ignore */ } }
    const moved = Math.hypot(p.x - ox, p.z - oz) / dt;
    z.gspeed = damp(z.gspeed, moved, 12, dt);
    const sp = Math.hypot(z.vel.x, z.vel.z);
    if (sp > 0.15) this._faceTo(z, Math.atan2(z.vel.x, z.vel.z), z.gait === 'sprint' ? 6 : 4, dt);
    return d;
  }

  // ------------------------------------------------------------------ AI
  _ai(z, dt) {
    const w = z.win;
    if (z.slow > 0) z.slow -= dt;
    const spd = z.crawler ? 0.55 : z.speed * (z.slow > 0 ? 0.35 : 1);
    switch (z.state) {
      case 'rise':
        z.gspeed = 0;
        if (z.stT >= RISE_T) this._setState(z, w ? 'toWindow' : 'chase');
        break;
      case 'toWindow': {
        if (!w || !w.attackPos) { this._setState(z, 'chase'); break; }
        let occ = this._occ.get(w);
        if (!occ || occ.dead || !this.zombies.includes(occ)) { this._occ.set(w, z); occ = z; }   // first come, first served
        let tx = w.attackPos.x, tz = w.attackPos.z, stop = 0.05;
        if (occ && occ !== z) {
          if (!z.waitOff) { const out = _v.copy(w.attackPos).sub(w.insidePos || w.outsidePos); out.y = 0; out.normalize(); z.waitOff = [out.x * 1.0 - out.z * (Math.random() - 0.5) * 1.2, out.z * 1.0 + out.x * (Math.random() - 0.5) * 1.2]; }
          tx += z.waitOff[0]; tz += z.waitOff[1]; stop = 0.2;
        }
        const d = this._moveToward(z, tx, tz, Math.min(spd, 2.6), dt, stop, false, occ === z);
        if (occ && occ !== z) {
          if (d < 0.4 && w.insidePos) this._faceTo(z, Math.atan2(w.insidePos.x - z.root.position.x, w.insidePos.z - z.root.position.z), 3, dt);
        } else if (d < 0.25) {
          z.root.position.x = w.attackPos.x; z.root.position.z = w.attackPos.z; z.vel.set(0, 0, 0);
          this._setState(z, (w.planks ?? 0) > 0 ? 'tearing' : 'vaulting');
          if (z.state === 'vaulting') this._startVault(z);
        }
        break;
      }
      case 'tearing': {
        z.gspeed = damp(z.gspeed, 0, 10, dt);
        if (w.insidePos) this._faceTo(z, Math.atan2(w.insidePos.x - w.attackPos.x, w.insidePos.z - w.attackPos.z), 5, dt);
        z.tearT += dt;
        if (!z.tearHit && z.tearT >= TEAR_T * TEAR_HIT) {
          z.tearHit = true;
          let ok = false;
          try { ok = (w.planks ?? 0) > 0 && w.tearPlank && w.tearPlank(); } catch (e) { ok = false; }
          if (ok) { this._snd('plank_tear', w.attackPos, { volume: 0.9 }); z.vocal = 1; }
        }
        if (z.tearT >= TEAR_T) {
          z.tearT -= TEAR_T; z.tearHit = false;
          if ((w.planks ?? 0) <= 0) { this._setState(z, 'vaulting'); this._startVault(z); }
        }
        break;
      }
      case 'vaulting': {
        const u = Math.min(1, z.stT / VAULT_T);
        const e = smooth(sstep(0.05, 0.95, u));
        z.root.position.x = lerp(z.vA.x, z.vI.x, e); z.root.position.z = lerp(z.vA.z, z.vI.z, e);
        z.gspeed = 0;
        if (u >= 1) { this._setState(z, 'chase'); z.repath = 0; }
        break;
      }
      case 'chase': {
        const tgt = this._target(z, dt);
        if (!tgt) { this._wander(z, dt, spd); z.atkCd -= dt; break; }
        z.wanderC = null; z.wanderP = null;
        const p = z.root.position, pp = tgt.pos;
        z.lastTgt.set(pp.x, 0, pp.z); z.hasLast = true;
        const dist = Math.hypot(pp.x - p.x, pp.z - p.z);
        z.repath -= dt;
        if (z.repath <= 0) {
          z.repath = 0.4 + Math.random() * 0.2;
          let los = dist < 30;
          if (los && this.level && this.level.lineOfSight) { try { los = this.level.lineOfSight(this._chest(z, _v), _v3.set(pp.x, 1.2, pp.z)); } catch (e) { los = true; } }
          if (los) z.path = null;
          else if (this.level && this.level.nav && this.level.nav.findPath) {
            try { z.path = this.level.nav.findPath(p.clone(), _v3.set(pp.x, 0, pp.z).clone()) || []; } catch (e) { z.path = []; }
            z.pathI = 0;
          } else z.path = null;
        }
        let tx = pp.x, tz = pp.z, stop = 0.72;
        if (z.path) {
          while (z.pathI < z.path.length && Math.hypot(z.path[z.pathI].x - p.x, z.path[z.pathI].z - p.z) < 0.45 && z.pathI < z.path.length - 1) z.pathI++;
          if (z.path.length === 0) { tx = p.x; tz = p.z; stop = 0.1; }
          else { const wp = z.path[z.pathI]; tx = wp.x; tz = wp.z; if (z.pathI < z.path.length - 1) stop = 0.0; }
        }
        this._moveToward(z, tx, tz, spd, dt, stop, true);
        if (dist < 2.2) this._faceTo(z, Math.atan2(pp.x - p.x, pp.z - p.z), 5, dt);
        z.atkCd -= dt;
        if (dist < (z.crawler ? 0.95 : 1.1) && z.atkCd <= 0) this._setState(z, 'attack');
        break;
      }
      case 'attack': {
        const p = z.root.position;
        const tgt = this._valid.find((q) => keyOf(q) === z.tgtKey) || null;
        z.gspeed = damp(z.gspeed, 0, 10, dt); z.vel.multiplyScalar(0.85);
        if (tgt) this._faceTo(z, Math.atan2(tgt.pos.x - p.x, tgt.pos.z - p.z), 6, dt);
        z.atkT += dt;
        this._attackSound(z);
        if (!z.atkHit && z.atkT >= ATK_T * ATK_HIT) {
          z.atkHit = true;
          // victim: nearest valid player within reach, roughly in front (the target usually)
          let victim = null, best = 1.6;
          const fx = Math.sin(z.yaw), fz = Math.cos(z.yaw);
          for (const q of this._valid) {
            const dx = q.pos.x - p.x, dz = q.pos.z - p.z, d = Math.hypot(dx, dz);
            if (d < best && (d < 0.5 || (dx * fx + dz * fz) / d > 0.2)) { best = d; victim = q; }
          }
          if (victim) { try { this.onAttack && this.onAttack(ATK_DMG, victim.id, z); } catch (e) { /* ignore */ } }
        }
        if (z.atkT >= ATK_T) { z.atkCd = 0.15; this._setState(z, 'chase'); }
        break;
      }
    }
  }

  _attackSound(z) {
    if (!z.atkSnd && z.atkT > 0.15) { z.atkSnd = true; this._snd('zombie_attack', z.root.position, { volume: 0.9 }); z.vocal = 1; }
  }

  // nearest reachable alive & !downed player, sticky for ~1.5 s
  _target(z, dt) {
    z.tgtT -= dt;
    const valid = this._valid;
    let cur = z.tgtKey != null ? valid.find((q) => keyOf(q) === z.tgtKey) || null : null;
    if (cur && z.tgtT > 0) return cur;
    let best = null, bestC = Infinity, curC = Infinity;
    for (const q of valid) {
      const c = this._reachCost(z, q);
      if (c == null) continue;
      if (q === cur) curC = c;
      if (c < bestC) { bestC = c; best = q; }
    }
    if (cur && curC <= bestC * 1.25 + 0.75) best = cur;          // hysteresis: don't flip-flop
    z.tgtT = 1.5 + Math.random() * 0.4;
    const k = best ? keyOf(best) : null;
    if (k !== z.tgtKey) { z.tgtKey = k; z.repath = 0; }
    return best;
  }
  _reachCost(z, q) {
    const p = z.root.position, d = Math.hypot(q.pos.x - p.x, q.pos.z - p.z);
    const L = this.level;
    if (d < 25 && L && L.lineOfSight) {
      let los = true;
      try { los = L.lineOfSight(this._chest(z, _v), _v3.set(q.pos.x, 1.2, q.pos.z)); } catch (e) { los = true; }
      if (los) return d;
    } else if (!L || !L.lineOfSight) return d;
    if (!L || !L.nav || !L.nav.findPath) return d;
    let path;
    try { path = L.nav.findPath(p.clone(), new V3(q.pos.x, 0, q.pos.z)); } catch (e) { return d; }
    if (!path || !path.length) return null;                        // unreachable (closed doors)
    let len = 0, px = p.x, pz = p.z;
    for (const w of path) { len += Math.hypot(w.x - px, w.z - pz); px = w.x; pz = w.z; }
    return len;
  }
  // no valid target (everyone downed / menu): shamble around near the last target area, staring
  _wander(z, dt, spd) {
    const p = z.root.position;
    let near = null, nd = Infinity;
    for (const q of this._players) { const d = Math.hypot(q.pos.x - p.x, q.pos.z - p.z); if (d < nd) { nd = d; near = q; } }
    if (!z.wanderC) {
      z.wanderC = new V3().copy(z.hasLast ? z.lastTgt : near ? near.pos : p); z.wanderC.y = 0;
      z.wanderP = null; z.wanderT = 0; z.pauseT = 0.3 + Math.random();
    }
    z.wanderT -= dt;
    if (!z.wanderP || z.wanderT <= 0) {
      z.wanderT = 4 + Math.random() * 4; z.stuckT = 0;
      let pick = null;
      for (let k = 0; k < 8 && !pick; k++) {
        const a = Math.random() * TAU, r = 1.5 + Math.random() * 2.5;
        const c = new V3(z.wanderC.x + Math.cos(a) * r, 0, z.wanderC.z + Math.sin(a) * r);
        if (this.level && this.level.resolveCircle) { try { this.level.resolveCircle(c, 0.3, 1.8); } catch (e) { /* ignore */ } }
        if (this._players.every((q) => Math.hypot(q.pos.x - c.x, q.pos.z - c.z) > 2.6)) pick = c;
      }
      z.wanderP = pick || p.clone();
    }
    const d = Math.hypot(z.wanderP.x - p.x, z.wanderP.z - p.z);
    if (z.pauseT > 0 || d < 0.4) {
      if (d < 0.4 && z.pauseT <= 0) { z.pauseT = 1.5 + Math.random() * 3; z.wanderT = z.pauseT + 0.1; }
      z.pauseT -= dt;
      this._moveToward(z, p.x, p.z, 0, dt, 1, true);
      if (near) this._faceTo(z, Math.atan2(near.pos.x - p.x, near.pos.z - p.z), 1.6, dt);   // menacing stare
      if (z.pauseT <= 0) z.wanderT = 0;
      return;
    }
    this._moveToward(z, z.wanderP.x, z.wanderP.z, Math.min(spd, 1.25) * 0.85, dt, 0.3, true);
    z.stuckT = z.gspeed < 0.12 ? z.stuckT + dt : 0;
    if (z.stuckT > 1.5) z.wanderT = 0;
  }

  _startVault(z) {
    this._release(z);
    const w = z.win;
    z.vA = (w.attackPos || z.root.position).clone(); z.vI = (w.insidePos || z.root.position).clone();
    z.yaw = Math.atan2(z.vI.x - z.vA.x, z.vI.z - z.vA.z); z.root.rotation.y = z.yaw;
  }
  _debugDrive(z, dt) {
    const m = z.debugMode || 'walk';
    const enter = (st) => { if (z.state !== st) { const k = [z.tearT, z.atkT, z.stT]; this._setState(z, st, true); [z.tearT, z.atkT, z.stT] = k; } };
    if (GAIT[m]) { z.gait = m; z.speed = GAIT[m].speed; z.gspeed = z.speed; enter('chase'); }
    else if (m === 'idle') { z.gspeed = 0; }
    else if (m === 'crawl') { z.gspeed = 0.55; }
    else if (m === 'tear') { enter('tearing'); z.tearT = (z.tearT + dt) % TEAR_T; }
    else if (m === 'attack') { enter('attack'); z.atkT = (z.atkT + dt) % ATK_T; }
    else if (m === 'vault') { enter('vaulting'); z.stT %= VAULT_T; }
    else if (m === 'rise') { enter('rise'); z.stT = Math.min(z.stT, RISE_T); }
  }

  // ------------------------------------------------------------------ audio
  _audio(z, dt) {
    z.vocal = Math.max(0, z.vocal - dt * 1.6);
    z.groanT -= dt;
    if (z.groanT <= 0) {
      z.groanT = 2.5 + Math.random() * 6;
      if (this._groanTok >= 1) {
        this._groanTok -= 1;
        const fast = z.gait !== 'walk';
        const name = fast ? (Math.random() < 0.18 ? 'zombie_scream' : 'zombie_growl') : 'zombie_groan';
        this._snd(name, z.root.position, { volume: fast ? 0.85 : 0.75, pitch: 0.82 + Math.random() * 0.3 });
        z.vocal = 1;
      }
    }
    // footfalls for runners / sprinters
    if ((z.gait === 'sprint' || z.gait === 'run') && z.gspeed > 1 && z.state === 'chase' && !z.crawler) {
      const a = z.prevPhase, b = z.phase;
      const crossed = (b < a) || (a < 0.5 && b >= 0.5);
      if (crossed && this._stepTok >= 1) { this._stepTok -= 1; this._snd('zombie_footstep', z.root.position, { volume: z.gait === 'sprint' ? 0.55 : 0.35 }); }
    }
  }

  // ------------------------------------------------------------------ animation
  _animate(z, dt) {
    const P = this._P;
    P.fill(0);
    const g = GAIT[z.gait] || GAIT.walk;
    z.prevPhase = z.phase;
    const cyc = z.crawler ? 1.3 : g.cycle;
    const nominal = z.crawler ? 0.55 : z.speed;
    if (z.gspeed > 0.02) z.phase = (z.phase + (z.gspeed / nominal) * dt / cyc) % 1;
    if (z.crawler) this._poseCrawl(z, P, dt);
    else switch (z.state) {
      case 'rise': sampleKeys(RISE_KEYS, Math.min(1, z.stT / RISE_T), P); this._riseExtras(z, P); break;
      case 'tearing': sampleKeys(TEAR_KEYS, (z.tearT % TEAR_T) / TEAR_T, P); this._plantFeet(z, P, 0.16, -0.2); this._headNoise(z, P, 0.5); break;
      case 'attack': sampleKeys(ATK_KEYS, Math.min(1, z.atkT / ATK_T), P); this._plantFeet(z, P, 0.2, -0.18); break;
      case 'vaulting': sampleKeys(VAULT_KEYS, Math.min(1, z.stT / VAULT_T), P); break;
      default: this._poseLoco(z, P, g); break;
    }
    P[BI.jaw * 3] += z.jawBase + z.vocal * 0.45;
    // crossfade from previous state
    if (z.blend < 1) {
      z.blend = Math.min(1, z.blend + dt / z.blendDur);
      const t = smooth(z.blend), F = z.Pfrom;
      for (let i = 0; i < PL; i++) P[i] = F[i] + (P[i] - F[i]) * t;
    }
    // additive flinch springs
    const fl = z.fl, fv = z.flv;
    for (let i = 0; i < 5; i++) { fv[i] += (-95 * fl[i] - 12 * fv[i]) * dt; fl[i] += fv[i] * dt; }
    P[BI.neck * 3] += fl[0] * 0.45; P[BI.head * 3] += fl[0];
    P[BI.spine * 3] += fl[1] * 0.5; P[BI.chest * 3] += fl[1] * 0.7;
    P[BI.spine * 3 + 1] += fl[2] * 0.4; P[BI.chest * 3 + 1] += fl[2] * 0.7; P[BI.head * 3 + 2] += fl[2] * 0.4;
    P[BI.uaL * 3] += fl[3]; P[BI.uaR * 3] += fl[4];
    z.P.set(P);
    this._apply(z, P);
  }

  _apply(z, P) {
    const b = z.bones;
    for (let i = 0; i < NB; i++) b[i].rotation.set(P[i * 3], P[i * 3 + 1], P[i * 3 + 2]);
    b[0].position.set(HIPS_REST.x + P[H0], HIPS_REST.y + P[H0 + 1], HIPS_REST.z + P[H0 + 2]);
    if (!z.dead) {
      // body pitch about the hip point, plus vertical body offset (rise / vault / crawl)
      _q.setFromAxisAngle(AX, P[BP]);
      z.rig.quaternion.copy(_q);
      _v.copy(HIPS_REST).applyQuaternion(_q);
      z.rig.position.set(HIPS_REST.x - _v.x, HIPS_REST.y - _v.y + P[BY], HIPS_REST.z - _v.z);
    }
  }

  _headNoise(z, P, amt) {
    const t = z.t, s = z.seed;
    P[BI.head * 3 + 2] += (z.headTilt + 0.22 * Math.sin(t * 0.8 + s)) * amt;
    P[BI.head * 3] += 0.08 * Math.sin(t * 1.3 + s * 2) * amt;
    P[BI.head * 3 + 1] += 0.15 * Math.sin(t * 0.55 + s * 3) * amt;
  }
  _plantFeet(z, P, fz, bz) {
    legIK(P, 1, 0.115, ANKLE, fz, 0);
    legIK(P, -1, -0.12, ANKLE, bz, 0);
  }
  _riseExtras(z, P) {
    const u = z.stT / RISE_T, t = z.t;
    const claw = 1 - sstep(0.3, 0.5, u);
    P[BI.uaL * 3] += 0.35 * Math.sin(t * 8) * claw; P[BI.uaR * 3] += 0.35 * Math.sin(t * 8 + Math.PI) * claw;
    P[BI.faL * 3] += -0.3 * (0.5 + 0.5 * Math.sin(t * 8 + 1)) * claw; P[BI.faR * 3] += -0.3 * (0.5 + 0.5 * Math.sin(t * 8 + 4)) * claw;
    if (u > 0.85) this._plantFeet(z, P, 0.05, -0.06);
  }

  _poseLoco(z, P, g) {
    const t = z.t, s0 = z.seed, φ = z.phase;
    const move = clamp(z.gspeed / 0.35, 0, 1);
    const Pi = this._P2; Pi.fill(0);
    // ---- idle pose (swaying, arms half raised, breathing)
    Pi[H0 + 1] = -0.045 + 0.01 * Math.sin(t * 1.1 + s0);
    setB(Pi, BI.hips, 0, 0.04 * Math.sin(t * 0.5 + s0), 0.03 * Math.sin(t * 0.7 + s0));
    setB(Pi, BI.spine, 0.18, 0.05 * Math.sin(t * 0.45), -0.02 * Math.sin(t * 0.7 + s0));
    setB(Pi, BI.chest, 0.17 + 0.035 * Math.sin(t * 1.7), 0.08 * Math.sin(t * 0.5 + 1));
    setB(Pi, BI.neck, 0.3); setB(Pi, BI.head, -0.55);
    for (const s of [1, -1]) {
      const drop = z.armDrop === s || z.missingS === s;
      if (drop) arm(Pi, s, 0.05 + 0.04 * Math.sin(t * 0.9 + s), 0, 0.06, -0.2, 0, 0, 0.2, 0, 0);
      else arm(Pi, s, -1.0 - z.armH * 0.35 * (s > 0 ? 1 : 0.6) + 0.08 * Math.sin(t * 1.2 + s), 0, -0.12, -0.4, 0, 0, 0.55, -1.25, 0);
    }
    this._headNoise(z, Pi, 1.25);
    legIK(Pi, 1, 0.11, ANKLE, 0.07 + 0.03 * Math.sin(s0), 0);
    legIK(Pi, -1, -0.115, ANKLE, -0.06, 0);
    if (move < 0.01) { P.set(Pi); return; }

    // ---- moving
    const gait = z.gait, E = g.speed * g.cycle * g.stance * (z.speed / g.speed) / z.scale, S = g.stance;
    const sinP = Math.sin(φ * TAU), cosP = Math.cos(φ * TAU);
    let hy = -g.drop - g.bob * (0.5 - 0.5 * Math.cos(φ * TAU * 2));
    let hipRoll = 0, lurch = 0;
    const limp = gait === 'walk' ? z.limp : 0;
    const legs = [];
    for (const s of [1, -1]) {
      const ph = (φ + (s > 0 ? 0 : 0.5)) % 1, bad = s === limp;
      let fz, fy, pitch;
      if (ph < S) {
        const tt = ph / S; fz = 0.02 + E / 2 - E * tt; fy = 0; pitch = 0;
        if (gait !== 'walk' && tt > 0.7) pitch = -0.5 * sstep(0.7, 1, tt), fy = 0.03 * sstep(0.7, 1, tt);
        if (bad) { hy -= 0.035 * Math.sin(Math.PI * tt); hipRoll += 0.07 * s * Math.sin(Math.PI * tt); lurch += 0.08 * s * Math.sin(Math.PI * tt); }
      } else {
        const tt = (ph - S) / (1 - S), e = smooth(tt);
        fz = 0.02 - E / 2 + E * e;
        const lift = g.lift * (bad ? 0.3 : 1);
        fy = lift * Math.sin(Math.PI * tt);
        pitch = bad ? 0.45 * Math.sin(Math.PI * tt) + 0.2 : (gait === 'walk' ? -0.2 : -0.5) * Math.sin(Math.PI * tt) + (gait === 'walk' ? 0 : 0.35 * (1 - tt));
      }
      legs.push([s, fz, fy, pitch]);
    }
    P[H0 + 1] = hy;
    P[H0 + 2] = gait === 'sprint' ? -0.04 : 0;
    const lean = g.lean;
    setB(P, BI.hips, gait === 'sprint' ? 0.14 : 0.04, 0.13 * sinP, hipRoll);
    setB(P, BI.spine, lean * 0.45 + 0.03 * Math.sin(φ * TAU * 2), 0.08 * sinP, -lurch + 0.04 * sinP);
    setB(P, BI.chest, lean * 0.4, -0.2 * sinP, -lurch * 0.5);
    for (const [s, fz, fy, pitch] of legs) legIK(P, s, 0.1 * s, ANKLE + fy, fz, pitch);
    if (gait === 'walk') {
      setB(P, BI.neck, 0.3); setB(P, BI.head, -0.42);
      this._headNoise(z, P, 1);
      for (const s of [1, -1]) {
        const drop = z.armDrop === s || z.missingS === s;
        if (drop) arm(P, s, 0.08 + 0.25 * Math.sin(φ * TAU + (s > 0 ? Math.PI : 0)), 0, 0.06, -0.25, 0, 0, 0.2, 0, 0);
        else arm(P, s, -1.2 - z.armH * 0.3 * (s > 0 ? 1 : 0.5) + 0.1 * Math.sin(φ * TAU + (s > 0 ? 1 : 2.5)), 0, -0.12 + 0.05 * sinP * s, -0.3, 0, 0, 0.6, -1.3, 0);
      }
    } else if (gait === 'run') {
      setB(P, BI.neck, 0.15); setB(P, BI.head, -0.4);
      this._headNoise(z, P, 0.5);
      for (const s of [1, -1]) {
        const drop = z.missingS === s;
        if (drop) arm(P, s, 0.2 * Math.sin(φ * TAU), 0, 0.1, -0.3, 0, 0, 0.2, 0, 0);
        else arm(P, s, -1.45 + 0.24 * Math.sin(φ * TAU + (s > 0 ? 0 : Math.PI)), 0, -0.1, -0.35, 0, 0, 0.4, -1.3, 0);
      }
    } else {
      setB(P, BI.neck, -0.05); setB(P, BI.head, -0.38, 0, 0.05 * sinP);
      for (const s of [1, -1]) {
        const sw = Math.cos(TAU * (φ - (s > 0 ? 0.5 : 0)));
        arm(P, s, -0.35 - 0.85 * sw, 0, 0.14, -1.45 + 0.2 * sw, 0, 0, 0.3, -0.4, 0);
      }
      P[BI.jaw * 3] += 0.35 + 0.1 * Math.sin(t * 7);
    }
    if (move < 1) { const k = move; for (let i = 0; i < PL; i++) P[i] = Pi[i] + (P[i] - Pi[i]) * k; }
  }

  _poseCrawl(z, P, dt) {
    const φ = z.phase, t = z.t;
    P[BY] = -0.77; P[BP] = 1.33;
    setB(P, BI.spine, -0.12, 0, 0.1 * Math.sin(φ * TAU)); setB(P, BI.chest, -0.18, 0.1 * Math.sin(φ * TAU));
    setB(P, BI.neck, -0.55); setB(P, BI.head, -0.55, 0.2 * Math.sin(t * 0.7), 0.2 * Math.sin(t * 0.9));
    P[BI.jaw * 3] = 0.45;
    const atk = z.state === 'attack' ? Math.sin(Math.PI * Math.min(1, z.atkT / ATK_T)) : 0;
    for (const s of [1, -1]) {
      if (z.missingS === s) { arm(P, s, -0.3, 0, 0.3, -0.3, 0, 0, 0.2, 0, 0); continue; }
      const c = 0.5 + 0.5 * Math.sin(TAU * (φ + (s > 0 ? 0 : 0.5)));
      arm(P, s, -2.75 + 1.1 * c - atk * 0.4, 0, -0.25 + 0.15 * c, -0.25 - 0.95 * c, 0, 0, 0.8 * c, -1.3, 0);
    }
  }

  // ------------------------------------------------------------------ hits
  _flinch(z, part, dir, k) {
    k = clamp(k, 0.35, 1.3);
    const c = Math.cos(z.yaw), s = Math.sin(z.yaw);
    const lx = dir.x * c - dir.z * s, lz = dir.x * s + dir.z * c;     // hit direction in zombie space
    const back = lz < 0 ? 1 : -0.6;                                    // shot from the front pushes back
    if (part === 'head') { z.flv[0] += -9 * k * back; z.flv[2] += lx * 5 * k; }
    else if (part === 'limb') { z.flv[3] += (Math.random() < 0.5 ? 6 : 0) * k; z.flv[4] += (Math.random() < 0.5 ? 6 : 0) * k; z.flv[2] += lx * 3 * k; }
    else { z.flv[1] += -5 * k * back; z.flv[2] += (lx * 7 + (Math.random() - 0.5) * 3) * k; z.flv[0] += -2.5 * k * back; }
    z.slow = Math.max(z.slow, 0.18 * k);
  }

  _makeCrawler(z, quiet = false) {
    if (z.crawler) return;
    z.crawler = true;
    z.bones[BI.thL].scale.setScalar(0.001); z.bones[BI.thR].scale.setScalar(0.001);
    for (const h of z.hb) if (h.userData.bone >= 12) h.userData.off = true;
    this._hbDirty = true;
    z.Pfrom.set(z.P); z.blend = 0; z.blendDur = 0.45;
    if (z.state !== 'chase') { this._release(z); z.state = 'chase'; z.stT = 0; }
    if (quiet) return;
    this._fx('blood', z.root.position.clone().setY(0.8), new V3(0, -1, 0), 2);
    this._fx('blood', z.root.position.clone().setY(0.5), new V3(0.3, 0.6, 0.2).normalize(), 2);
  }

  _kill(z, { headshot, dir, info = {}, part, point }) {
    if (z.dead) return null;
    const prev = z.state;
    z.dead = true; z.alive = false; z.state = 'dead';
    this._deadIds.add(z.id); if (this._deadIds.size > 600) this._deadIds.delete(this._deadIds.values().next().value);
    this._release(z);
    this._hbDirty = true;
    // deathVariant: forced (net / caller) or chosen here; encodes kind + blast strength + seed
    let dv = info.deathVariant;
    if (dv == null) {
      const kindName = this._pickDeath(z, prev, headshot, dir, info);
      const fq = Math.round(clamp(info.blast ?? 0.8, 0, 1) * 15);
      dv = DEATHS.indexOf(kindName) + 8 * fq + 128 * ((Math.random() * 8191) | 0);
    }
    dv = dv | 0;
    z.deathVariant = dv;
    z.deathDir = dir ? dir.clone() : new V3(0, 0, -1);
    z.deathPoint = point ? (point.isVector3 ? point.clone() : toV3(point, null)) : null;
    z.deathHeadshot = !!headshot;
    if (!info.remote) { try { this.onKill && this.onKill(z, { headshot, info, deathVariant: dv, dir: z.deathDir, point: z.deathPoint }); } catch (e) { /* ignore */ } }
    const p = z.root.position;
    if (this._deathTok >= 1) { this._deathTok -= 1; this._snd('zombie_death', p, { volume: 0.85 }); }
    const kind = DEATHS[dv & 7] || 'back';
    this._startDeath(z, kind, dir, { ...info, _hs: headshot || kind === 'headshot', blast: ((dv >> 3) & 15) / 15, dseed: dv >> 7 });
    return dv;
  }

  _pickDeath(z, prev, headshot, dir, info) {
    let kind;
    if (info.nuke) kind = 'nuke';
    else if (info.explosive) kind = 'blast';
    else if (z.crawler) kind = 'crawl';
    else if (headshot) kind = 'headshot';
    else {
      const c = Math.cos(z.yaw), s = Math.sin(z.yaw), lz = dir.x * s + dir.z * c;
      const r = Math.random();
      kind = lz > 0.3 ? (r < 0.75 ? 'forward' : 'spin') : (r < 0.45 ? 'back' : r < 0.75 ? 'forward' : 'spin');
      if (info.melee) kind = r < 0.5 ? 'back' : 'spin';
    }
    if (info.forceDeath && DEATHS.includes(info.forceDeath)) kind = info.forceDeath;
    if (prev === 'rise' && kind !== 'blast' && kind !== 'nuke') kind = 'freeze';
    return kind;
  }

  _startDeath(z, kind, dir, info) {
    const D = z.D = {
      kind, t: 0, ang: 0, av: 0, landed: false, pre: 0, pivot: new V3(), axis: AX, sign: 1, lift: 0.12,
      spin: 0, spinT: 0, fall: FALL.back, lie: LIE.up, targ: new Float32Array(PL), vel: new Float32Array(PL), cur: new Float32Array(PL),
      q: new THREE.Quaternion(), c: new V3(0, 1.0, 0), cv: new V3(), w: new V3(), bounces: 0, settleT: -1, qFrom: new THREE.Quaternion(), qTo: new THREE.Quaternion(), faceDown: false,
    };
    D.cur.set(z.P);
    const DR = D.rng = rng(((info.dseed ?? 0) + 1) * 40503 + z.id * 7);
    // current rig transform as the start (rise/vault/crawl offsets)
    D.q.copy(z.rig.quaternion);
    const c = Math.cos(z.yaw), s = Math.sin(z.yaw);
    const lx = dir.x * c - dir.z * s, lz = dir.x * s + dir.z * c;
    const side = DR() < 0.5 ? 1 : -1;
    switch (kind) {
      case 'forward': D.pivot.set(0, 0.05, 0.1); D.sign = 1; D.pre = 0.32; D.av = 0.5; D.fall = FALL.forward; D.lie = LIE.down; D.lift = 0.1; break;
      case 'back': D.pivot.set(0, 0.02, -0.08); D.sign = -1; D.pre = 0.14; D.av = 0.75; D.fall = FALL.back; D.lie = LIE.up; D.lift = 0.12; break;
      case 'spin': D.pivot.set(0.1 * side, 0, 0); D.axis = AZ; D.sign = side; D.pre = 0.42; D.av = 0.4; D.spin = 1.9 * side; D.fall = FALL.spin; D.lie = LIE.side; D.lift = 0.17; break;
      case 'headshot': D.pivot.set(0, 0.02, -0.08); D.sign = -1; D.pre = 0.05; D.av = 1.25; D.fall = FALL.limp; D.lie = LIE.up; D.lift = 0.12; this._decap(z, dir); break;
      case 'freeze': D.pre = 0; D.fall = z.P.slice(); D.lie = D.fall; D.static = true; if (info._hs) this._decap(z, dir); break;
      case 'crawl': D.pivot.set(0, 0, 0); D.pre = 0; D.fall = kp({ by: -0.8, bp: 1.45, ua: [-2.6, 0, 0.4], fa: [-0.3], neck: [0.2], head: [0.3, 0.8] }); D.lie = D.fall; D.static = true; break;
      default: { // blast / nuke: ballistic body
        const nuke = kind === 'nuke';
        const f = info.blast ?? 0.8;
        const v = nuke ? 1.2 + DR() * 1.2 : 3 + 5 * f;
        D.cv.set(lx * v, nuke ? 2 + DR() * 1.5 : 3 + 4 * f, lz * v);
        D.w.set(-lz, 0, lx); if (D.w.lengthSq() < 1e-6) D.w.set(1, 0, 0);
        D.w.normalize().multiplyScalar((nuke ? 3 : 6) + DR() * 4);
        D.w.x += (DR() - 0.5) * 3; D.w.y += (DR() - 0.5) * 4;
        D.c.set(0, 1.0, 0);
        D.fall = FALL.blast; D.ballistic = true;
        if (nuke) this._burn(z);
        else { this._fx('blood', z.root.position.clone().setY(1.0), dir.clone(), 2.5); if (DR() < 0.5 && z.helmet) this._popHelmet(z, dir, 5); }
      }
    }
    D.targ.set(D.fall);
    // keep ongoing root offsets (hips) from the current pose where fall pose leaves them 0
    if (!D.ballistic && !D.static) { D.targ[BY] = 0; D.targ[BP] = 0; }
    z.eyesOffAt = 1.2 + DR();
  }

  _decap(z, dir) {
    const head = z.bones[BI.head];
    head.updateWorldMatrix(true, false);
    const hp = new V3(0, 0.09, 0.015).applyMatrix4(head.matrixWorld);
    head.scale.setScalar(0.001); head.position.y -= 0.06;
    this._fx('gib', hp.clone(), dir.clone(), 'head');
    this._fx('blood', hp.clone(), dir.clone(), 2.2);
    if (z.helmet) this._popHelmet(z, dir, 4.5);
    z.fountain = 1.4; z.fountT = 0;
    z.headless = true;
    this._snd('headshot', hp, { volume: 0.6 });
  }

  _popHelmet(z, dir, v) {
    const h = z.helmet; if (!h) return;
    h.updateWorldMatrix(true, false);
    this.scene.attach(h);
    h.scale.setScalar(z.scale);
    const R = (z.D && z.D.rng) || Math.random;
    const vel = new V3(dir.x * v * 0.6 + (R() - 0.5), 2.5 + R() * 2, dir.z * v * 0.6 + (R() - 0.5));
    const w = new V3((R() - 0.5) * 16, (R() - 0.5) * 10, (R() - 0.5) * 16);
    this._props.push({ mesh: h, vel, w, owner: z, rest: false });
    z.helmet = null;
    for (const hb of z.hb) if (hb.userData.part === 'head') { hb.scale.set(0.19, 0.25, 0.235); hb.position.set(0, 0.085, 0.018); }
  }

  _burn(z) {
    const B = this._mats.burnt;
    for (const k in z.meshes) if (B[k]) z.meshes[k].material = B[k];
    if (z.helmet) z.helmet.material = B.helmet;
    z.burnt = true;
  }

  _propsUpdate(dt) {
    for (const p of this._props) {
      if (p.rest) continue;
      const m = p.mesh;
      p.vel.y -= 9.8 * dt;
      m.position.addScaledVector(p.vel, dt);
      _q.setFromEuler(_e.set(p.w.x * dt, p.w.y * dt, p.w.z * dt)); m.quaternion.premultiply(_q);
      if (this.level && this.level.resolveCircle) { try { this.level.resolveCircle(m.position, 0.12, 0.3); } catch (e) { /* ignore */ } }
      if (m.position.y < 0.07) {
        m.position.y = 0.07;
        if (p.vel.y < -1.2) { p.vel.y *= -0.35; p.vel.x *= 0.6; p.vel.z *= 0.6; p.w.multiplyScalar(0.5); this._snd('bullet_metal', m.position, { volume: 0.3 }); }
        else { p.vel.set(0, 0, 0); p.rest = true; }
      }
    }
  }

  _deathUpdate(z, dt) {
    const D = z.D; D.t += dt;
    const P = D.cur, V = D.vel, T = D.targ;
    // neck fountain
    if (z.fountain > 0) {
      z.fountain -= dt; z.fountT -= dt;
      if (z.fountT <= 0) {
        z.fountT = 0.08;
        const nb = z.bones[BI.neck]; nb.updateWorldMatrix(true, false);
        const np = new V3(0, 0.1, 0).applyMatrix4(nb.matrixWorld), up = new V3(0, 1, 0).transformDirection(nb.matrixWorld);
        up.x += (Math.random() - 0.5) * 0.4; up.z += (Math.random() - 0.5) * 0.4;
        this._fx('blood', np, up.normalize(), 0.5 + z.fountain * 0.5);
      }
    }
    if (z.eyesOffAt != null && D.t > z.eyesOffAt && z.meshes.eyes) z.meshes.eyes.visible = false;
    let landedNow = false;
    if (D.ballistic) {
      if (D.settleT < 0) {
        D.cv.y -= 9.8 * dt;
        D.c.addScaledVector(D.cv, dt);
        _v.copy(D.w).multiplyScalar(dt); const a = _v.length();
        if (a > 1e-6) { _q.setFromAxisAngle(_v.normalize(), a); D.q.premultiply(_q); }
        // walls: resolve in world space
        if (this.level && this.level.resolveCircle) {
          _v2.copy(D.c); z.root.localToWorld(_v2);
          const bx = _v2.x, bz = _v2.z;
          try { this.level.resolveCircle(_v2, 0.25, 1.8); } catch (e) { /* ignore */ }
          if (_v2.x !== bx || _v2.z !== bz) { z.root.worldToLocal(_v2); D.c.x = _v2.x; D.c.z = _v2.z; D.cv.x *= -0.2; D.cv.z *= -0.2; }
        }
        const floor = 0.16 / z.scale;
        if (D.c.y < floor && D.cv.y < 0) {
          D.c.y = floor;
          landedNow = true;
          if (D.cv.y < -2.5 && D.bounces < 2) { D.cv.y *= -0.28; D.cv.x *= 0.5; D.cv.z *= 0.5; D.w.multiplyScalar(0.45); D.bounces++; }
          else {
            D.settleT = 0; D.qFrom.copy(D.q);
            const up = _v.set(0, 1, 0).applyQuaternion(D.q), fw = _v2.set(0, 0, 1).applyQuaternion(D.q);
            D.faceDown = fw.y < 0;
            const hdir = new V3(up.x, 0, up.z); if (hdir.lengthSq() < 1e-4) hdir.set(fw.x, 0, fw.z); if (hdir.lengthSq() < 1e-4) hdir.set(0, 0, 1); hdir.normalize();
            const Zb = new V3(0, D.faceDown ? -1 : 1, 0), Xb = new V3().crossVectors(hdir, Zb);
            D.qTo.setFromRotationMatrix(_m.makeBasis(Xb, hdir, Zb));
            D.lie = D.faceDown ? LIE.down : LIE.up;
            T.set(D.lie); D.landed = true;
          }
        }
      } else {
        D.settleT += dt;
        const k = smooth(D.settleT / 0.45);
        D.q.slerpQuaternions(D.qFrom, D.qTo, k);
        D.cv.multiplyScalar(Math.exp(-dt * 6));
        D.c.x += D.cv.x * dt; D.c.z += D.cv.z * dt;
        D.c.y = lerp(D.c.y, 0.14, k);
      }
      z.rig.quaternion.copy(D.q);
      _v.copy(D.c).sub(_v3.set(0, 1.0, 0).applyQuaternion(D.q));
      z.rig.position.copy(_v);
    } else if (!D.static) {
      if (D.t > D.pre) {
        if (D.spin && D.spinT < 1) D.spinT = Math.min(1, D.spinT + dt / 0.5);
        const target = Math.PI / 2;
        D.av += 8.5 * Math.sin(D.ang + 0.12) * dt;
        D.ang += D.av * dt;
        if (D.ang >= target) {
          D.ang = target;
          if (!D.landed) { D.landed = true; landedNow = true; T.set(D.lie); T[H0] = P[H0]; T[H0 + 1] = P[H0 + 1]; T[H0 + 2] = P[H0 + 2]; }
          D.av = -D.av * 0.22; if (Math.abs(D.av) < 0.35) D.av = 0;
        }
      } else if (D.spin) D.spinT = Math.min(1, D.spinT + dt / 0.5);
      _q.setFromAxisAngle(AY, D.spin * smooth(D.spinT));
      _q2.setFromAxisAngle(D.axis, D.sign * D.ang * (D.axis === AZ ? -1 : 1));
      _q2.multiply(_q);
      z.rig.quaternion.copy(_q2);
      _v.copy(D.pivot).applyQuaternion(_q2);
      z.rig.position.set(D.pivot.x - _v.x, D.pivot.y - _v.y + D.lift * (D.ang / (Math.PI / 2)), D.pivot.z - _v.z);
    } else {
      // crawler collapse: keep rig transform from the crawl pose
      _q.setFromAxisAngle(AX, P[BP]); z.rig.quaternion.copy(_q);
      _v.copy(HIPS_REST).applyQuaternion(_q);
      z.rig.position.set(HIPS_REST.x - _v.x, HIPS_REST.y - _v.y + P[BY], HIPS_REST.z - _v.z);
    }
    if (landedNow && !D.thud) {
      D.thud = true;
      for (let i = 0; i < NB * 3; i++) V[i] += (D.rng() - 0.5) * 7;
      _v.set(0, 0.1, 0); z.root.localToWorld(_v);
    }
    // ragdoll-ish settle: damped springs toward the fall / lying targets
    for (let i = 0; i < PL; i++) {
      if (!D.static && (i === BY || i === BP)) continue;
      const k = SPRING_K[i] * (D.landed ? 1.2 : 1), c = 2 * Math.sqrt(k) * 0.45;
      V[i] += (k * (T[i] - P[i]) - c * V[i]) * dt; P[i] += V[i] * dt;
    }
    const b = z.bones;
    for (let i = 0; i < NB; i++) b[i].rotation.set(P[i * 3], P[i * 3 + 1], P[i * 3 + 2]);
    b[0].position.set(HIPS_REST.x + P[H0], HIPS_REST.y + P[H0 + 1], HIPS_REST.z + P[H0 + 2]);
    // linger, then sink into the floor
    if (D.t > 5.5) z.root.position.y -= dt * 0.22;
  }
}

export const ZOMBIE_VARIANTS = VARIANTS.map((v) => v.name);
export const _internal = { buildVariant, GAIT, BONE_POS, BN };
