// UNBURIED — fx.js  (vfx agent)
// Pooled GPU particles (2 instanced quad pools: lit alpha-blended + additive HDR),
// instanced lit decals (atlas + generated normal/roughness maps), instanced rigid debris
// (brass casings + gore/rubble chunks), noise-shaded fireball meshes, pooled dynamic
// lights, and floating power-up icons. Every texture is generated procedurally here.
//
// Per-frame cost: ~4-9 draw calls total regardless of how many effects are live.
// No per-frame allocations in update(): all state lives in preallocated typed arrays.

import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

/* ============================================================== RNG ==== */
let _seed = 0x2545f491;
function rnd() {
  _seed = (_seed + 0x6d2b79f5) | 0;
  let t = Math.imul(_seed ^ (_seed >>> 15), 1 | _seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const rr = (a, b) => a + (b - a) * rnd();
const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
const sstep = (a, b, x) => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};
const TAU = Math.PI * 2;

/* ======================================================= canvas noise ==== */
function h2(x, y, s) {
  let h =
    (Math.imul(x | 0, 374761393) +
      Math.imul(y | 0, 668265263) +
      Math.imul(s | 0, 1442695041)) |
    0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
function vn(x, y, s) {
  const xi = Math.floor(x),
    yi = Math.floor(y);
  const xf = x - xi,
    yf = y - yi;
  const u = xf * xf * (3 - 2 * xf),
    v = yf * yf * (3 - 2 * yf);
  const a = h2(xi, yi, s),
    b = h2(xi + 1, yi, s),
    c = h2(xi, yi + 1, s),
    d = h2(xi + 1, yi + 1, s);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
function fbm(x, y, s, oct = 5) {
  let a = 0.5,
    f = 1,
    sum = 0,
    n = 0;
  for (let i = 0; i < oct; i++) {
    sum += a * vn(x * f, y * f, s + i * 131);
    n += a;
    a *= 0.5;
    f *= 2.03;
  }
  return sum / n;
}
// angular noise without seam
const angN = (ang, freq, s, oct = 4) =>
  fbm(Math.cos(ang) * freq + 7.3, Math.sin(ang) * freq + 3.1, s, oct);

/* =========================================================== atlases ==== */
const CELL = 256,
  GRID = 4,
  ASZ = CELL * GRID;
function canvasOf(size = ASZ) {
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const ctx = c.getContext("2d");
  return { c, ctx, img: ctx.createImageData(size, size) };
}
const _o = new Float32Array(8);
// fn(u, v, out, x, y): u,v in [-1,1], v positive = canvas down (= quad bottom)
function paintCell(img, idx, fn, H) {
  const ox = (idx % GRID) * CELL,
    oy = ((idx / GRID) | 0) * CELL,
    d = img.data;
  for (let y = 0; y < CELL; y++)
    for (let x = 0; x < CELL; x++) {
      const u = ((x + 0.5) / CELL) * 2 - 1,
        v = ((y + 0.5) / CELL) * 2 - 1;
      _o.fill(0);
      fn(u, v, _o, x, y);
      const k = ((oy + y) * ASZ + ox + x) * 4;
      d[k] = clamp(_o[0], 0, 1) * 255;
      d[k + 1] = clamp(_o[1], 0, 1) * 255;
      d[k + 2] = clamp(_o[2], 0, 1) * 255;
      d[k + 3] = clamp(_o[3], 0, 1) * 255;
      if (H) {
        H.h[(oy + y) * ASZ + ox + x] = _o[4];
        H.p[k + 1] = clamp(_o[5], 0, 1) * 255;
        H.p[k + 2] = clamp(_o[6], 0, 1) * 255;
        H.p[k] = 0;
        H.p[k + 3] = 255;
      }
    }
}

// --- lit volumetric puff: lobed density eroded by warped fbm, self-shadowed toward the top light
function puffCell(img, idx, seed, o) {
  const D = new Float32Array(CELL * CELL);
  const lobes = [[0, 0.05, o.core]];
  for (let i = 0; i < o.lobes; i++) {
    const a = h2(i, 3, seed) * TAU,
      r = 0.15 + 0.3 * h2(i, 7, seed);
    lobes.push([
      Math.cos(a) * r,
      Math.sin(a) * r * 0.9,
      0.22 + 0.2 * h2(i, 11, seed),
    ]);
  }
  for (let y = 0; y < CELL; y++)
    for (let x = 0; x < CELL; x++) {
      const u = ((x + 0.5) / CELL) * 2 - 1,
        v = ((y + 0.5) / CELL) * 2 - 1;
      const wx = u + (fbm(u * 1.7 + 3, v * 1.7, seed + 1, 3) - 0.5) * o.warp;
      const wy = v + (fbm(u * 1.7, v * 1.7 + 9, seed + 2, 3) - 0.5) * o.warp;
      let m = 0;
      for (const [lx, ly, lr] of lobes) {
        const dd = ((wx - lx) ** 2 + (wy - ly) ** 2) / (lr * lr);
        m = Math.max(m, 1 - dd);
      }
      const n = fbm(wx * o.freq + 11, wy * o.freq + 5, seed + 3, 5);
      let dd = m * 1.15 + (n - 0.5) * o.erode - 0.12;
      dd = sstep(0, o.soft, dd);
      const r = Math.hypot(u, v);
      dd *= sstep(1.0, 0.78, r);
      dd *= 0.75 + 0.5 * fbm(u * 7 + 1, v * 7, seed + 9, 3);
      D[y * CELL + x] = clamp(dd * o.maxA, 0, 1);
    }
  // self-shadow: march toward light (up-left on canvas)
  const lx = -0.33,
    ly = -0.94;
  paintCell(img, idx, (u, v, out, x, y) => {
    const dd = D[y * CELL + x];
    let acc = 0;
    for (let s = 1; s <= 12; s++) {
      const sx = Math.round(x + lx * s * 5),
        sy = Math.round(y + ly * s * 5);
      if (sx < 0 || sy < 0 || sx >= CELL || sy >= CELL) break;
      acc += D[sy * CELL + sx];
    }
    const T = Math.exp(-acc * o.absorb);
    const lit = 0.16 + 0.84 * T + (1 - dd) * 0.12;
    out[0] = out[1] = out[2] = clamp(lit, 0, 1);
    out[3] = dd;
  });
}

// irregular polygon chip (debris), facet-shaded
function chipCell(img, idx, seed, elong = 1) {
  const nv = 6 + ((h2(1, 1, seed) * 3) | 0);
  const R = [],
    A = [];
  for (let i = 0; i < nv; i++) {
    A.push(((i + 0.2 + 0.6 * h2(i, 2, seed)) / nv) * TAU);
    R.push(0.55 + 0.35 * h2(i, 5, seed));
  }
  const shade = [];
  for (let i = 0; i < nv; i++) shade.push(0.35 + 0.65 * h2(i, 9, seed));
  paintCell(img, idx, (u, v, out) => {
    const uu = u,
      vv = v / elong;
    const r = Math.hypot(uu, vv);
    let a = Math.atan2(vv, uu);
    if (a < 0) a += TAU;
    let k = 0;
    while (k < nv - 1 && a > A[k + 1]) k++;
    let a0 = A[k],
      a1 = k + 1 < nv ? A[k + 1] : A[0] + TAU,
      aa = a < a0 ? a + TAU : a;
    const t = (aa - a0) / (a1 - a0);
    const Rb = (R[k] * (1 - t) + R[(k + 1) % nv] * t) * 0.9;
    const alpha = sstep(Rb, Rb - 0.06, r);
    const lit =
      shade[k] * (0.75 + 0.25 * (1 - r / Rb)) +
      (fbm(u * 9, v * 9, seed, 3) - 0.5) * 0.25;
    out[0] = out[1] = out[2] = lit;
    out[3] = alpha;
  });
}

function buildAlphaAtlas() {
  const { c, ctx, img } = canvasOf();
  const puff = {
    core: 0.5,
    lobes: 6,
    warp: 0.55,
    freq: 3.2,
    erode: 1.2,
    soft: 0.55,
    maxA: 1,
    absorb: 0.075,
  };
  for (let i = 0; i < 4; i++) puffCell(img, i, 100 + i * 17, puff); // 0-3 smoke
  puffCell(img, 4, 222, {
    core: 0.45,
    lobes: 4,
    warp: 0.9,
    freq: 4.5,
    erode: 1.6,
    soft: 0.8,
    maxA: 0.8,
    absorb: 0.05,
  }); // 4 dust
  // 5 blood mist: blotchy speckled haze
  paintCell(img, 5, (u, v, o) => {
    const r = Math.hypot(u, v);
    const n = fbm(u * 3 + 2, v * 3, 51, 5),
      sp = fbm(u * 14, v * 14, 52, 3);
    const a =
      sstep(0.95, 0.1, r + (n - 0.5) * 0.7) *
      (0.35 + 0.65 * sstep(0.35, 0.75, sp)) *
      sstep(1, 0.85, r);
    o[0] = o[1] = o[2] = 0.7 + 0.3 * n;
    o[3] = a;
  });
  // 6 blood droplet (round, glossy highlight toward quad top/head)
  paintCell(img, 6, (u, v, o) => {
    const r = Math.hypot(u, v * 0.92);
    const hl = Math.exp(-((u + 0.2) ** 2 + (v + 0.3) ** 2) * 40);
    o[0] = o[1] = o[2] = 0.45 + 0.4 * (1 - r) + hl * 1.2;
    o[3] = sstep(0.82, 0.62, r);
  });
  chipCell(img, 7, 71); // 7 chip
  // 8 splinter: long thin jagged shard along quad y
  paintCell(img, 8, (u, v, o) => {
    const w =
      0.22 * (1 - Math.abs(v) ** 1.6) * (0.7 + 0.6 * vn(v * 6 + 3, 1, 81));
    const a =
      sstep(w, w - 0.07, Math.abs(u + 0.05 * Math.sin(v * 5))) *
      sstep(0.98, 0.85, Math.abs(v));
    const grain = fbm(u * 30, v * 3, 82, 3);
    o[0] = o[1] = o[2] = 0.55 + 0.45 * grain - Math.abs(u) * 0.8;
    o[3] = a;
  });
  // 9 dirt clod: lumpy sphere-shaded
  paintCell(img, 9, (u, v, o) => {
    const ang = Math.atan2(v, u),
      r = Math.hypot(u, v);
    const R = 0.62 + (angN(ang, 1.5, 91) - 0.5) * 0.5;
    const a = sstep(R, R - 0.08, r);
    const nz = Math.sqrt(Math.max(0, 1 - (r / R) ** 2));
    const lit =
      clamp(-u * 0.3 - v * 0.6 + nz * 0.7, 0, 1) *
      (0.6 + 0.6 * fbm(u * 10, v * 10, 92, 4));
    o[0] = o[1] = o[2] = 0.15 + lit * 0.85;
    o[3] = a;
  });
  // 10 blood clump: cluster of droplets
  const drops = [];
  for (let i = 0; i < 9; i++)
    drops.push([
      rrH(i, 1) * 1.1 - 0.55,
      rrH(i, 2) * 1.1 - 0.55,
      0.08 + 0.18 * rrH(i, 3),
    ]);
  function rrH(i, k) {
    return h2(i, k, 101);
  }
  paintCell(img, 10, (u, v, o) => {
    let m = 0,
      lit = 0;
    for (const [x, y, r] of drops) {
      const d = Math.hypot(u - x, v - y) / r;
      if (d < 1) {
        const e = 1 - d;
        if (e > m) {
          m = e;
          lit =
            0.45 +
            0.4 * e +
            Math.exp(
              -(((u - x + r * 0.35) ** 2 + (v - y + r * 0.35) ** 2) / (r * r)) *
                18,
            );
        }
      }
    }
    o[0] = o[1] = o[2] = lit;
    o[3] = sstep(0, 0.2, m);
  });
  // 11 soft round
  paintCell(img, 11, (u, v, o) => {
    const r = Math.hypot(u, v);
    o[0] = o[1] = o[2] = 0.9 - r * 0.3;
    o[3] = Math.exp(-r * r * 4) * sstep(1, 0.8, r);
  });
  // 12 wispy streak smoke
  puffCell(img, 12, 333, {
    core: 0.35,
    lobes: 3,
    warp: 1.2,
    freq: 5.5,
    erode: 1.9,
    soft: 0.9,
    maxA: 0.75,
    absorb: 0.05,
  });
  // 13 sand grains cluster
  paintCell(img, 13, (u, v, o) => {
    const r = Math.hypot(u, v);
    const g = vn(u * 22, v * 22, 131);
    o[0] = o[1] = o[2] = 0.6 + 0.4 * g;
    o[3] = sstep(0.75, 0.9, g) * sstep(0.95, 0.4, r);
  });
  chipCell(img, 14, 141, 1.6); // 14 elongated chip
  chipCell(img, 15, 151); // 15 chip variant
  ctx.putImageData(img, 0, 0);
  return c;
}

function buildAddAtlas() {
  const { c, ctx, img } = canvasOf();
  // 0 glow
  paintCell(img, 0, (u, v, o) => {
    const r = Math.hypot(u, v);
    const g =
      (0.55 * Math.exp(-r * r * 5) + 0.45 * Math.exp(-r * r * 40)) *
      sstep(1, 0.7, r);
    o[0] = o[1] = o[2] = g;
    o[3] = 1;
  });
  // 1 spark (round hot dot; stretched on GPU)
  // 1 streak: capsule with hot core, brighter toward the head (quad top = direction of travel)
  paintCell(img, 1, (u, v, o) => {
    const across =
      Math.exp(-((u * 3.2) ** 2)) * 0.55 + Math.exp(-((u * 9) ** 2)) * 0.7;
    const along = sstep(1, 0.55, Math.abs(v)) * (0.55 + 0.45 * (1 - v) * 0.5);
    o[0] = o[1] = o[2] = across * along * sstep(1, 0.8, Math.abs(u));
    o[3] = 1;
  });
  // 2-5 fire puffs
  for (let i = 0; i < 4; i++) {
    const s = 200 + i * 13;
    paintCell(img, 2 + i, (u, v, o) => {
      const wx = u + (fbm(u * 2 + 1, v * 2, s, 3) - 0.5) * 0.7,
        wy = v + (fbm(u * 2, v * 2 + 4, s + 1, 3) - 0.5) * 0.7;
      const r = Math.hypot(wx, wy * 0.95);
      const n = fbm(wx * 3.5 + 5, wy * 3.5 - 2, s + 2, 5);
      const rid = 1 - Math.abs(fbm(wx * 6, wy * 6, s + 3, 4) * 2 - 1);
      let d = sstep(0.95, 0.15, r + (n - 0.5) * 0.9);
      d *= 0.55 + 0.45 * rid * rid + 0.3 * n;
      d *= sstep(1, 0.85, Math.hypot(u, v));
      o[0] = o[1] = o[2] = clamp(d * d * 1.3, 0, 1);
      o[3] = 1;
    });
  }
  // 6 thin ring
  paintCell(img, 6, (u, v, o) => {
    const r = Math.hypot(u, v),
      a = Math.atan2(v, u);
    const g =
      Math.exp(-(((r - 0.8) / 0.055) ** 2)) * (0.6 + 0.4 * angN(a, 3, 61)) +
      Math.exp(-(((r - 0.72) / 0.14) ** 2)) * 0.25;
    o[0] = o[1] = o[2] = g * sstep(1, 0.93, r);
    o[3] = 1;
  });
  // 7 sparkle star
  paintCell(img, 7, (u, v, o) => {
    const r = Math.hypot(u, v);
    const cross =
      Math.exp(-Math.abs(u) * 40) * Math.exp(-Math.abs(v) * 2.6) +
      Math.exp(-Math.abs(v) * 40) * Math.exp(-Math.abs(u) * 2.6);
    const du = (u + v) * 0.7071,
      dv = (u - v) * 0.7071;
    const diag =
      (Math.exp(-Math.abs(du) * 50) * Math.exp(-Math.abs(dv) * 6) +
        Math.exp(-Math.abs(dv) * 50) * Math.exp(-Math.abs(du) * 6)) *
      0.4;
    o[0] =
      o[1] =
      o[2] =
        (cross * 0.8 +
          diag +
          Math.exp(-r * r * 30) * 0.9 +
          Math.exp(-r * r * 5) * 0.15) *
        sstep(1, 0.8, r);
    o[3] = 1;
  });
  // 8 flare burst: radial rays
  paintCell(img, 8, (u, v, o) => {
    const r = Math.hypot(u, v),
      a = Math.atan2(v, u);
    const rays = Math.pow(angN(a, 9, 81, 3), 3) * 2.4;
    o[0] =
      o[1] =
      o[2] =
        (Math.exp(-r * r * 12) + rays * Math.exp(-r * 2.8) * 0.6) *
        sstep(1, 0.6, r);
    o[3] = 1;
  });
  // 9 plasma filaments
  paintCell(img, 9, (u, v, o) => {
    const r = Math.hypot(u, v);
    const n1 = 1 - Math.abs(fbm(u * 3 + 1, v * 3, 91, 5) * 2 - 1),
      n2 = 1 - Math.abs(fbm(u * 5 - 3, v * 5, 92, 4) * 2 - 1);
    const f = Math.pow(n1, 8) + Math.pow(n2, 10) * 0.7;
    o[0] =
      o[1] =
      o[2] =
        (f * 1.2 + Math.exp(-r * r * 6) * 0.35) * sstep(1, 0.55, r);
    o[3] = 1;
  });
  // 10 ember (irregular hot fleck)
  paintCell(img, 10, (u, v, o) => {
    const a = Math.atan2(v, u),
      r = Math.hypot(u, v);
    const R = 0.35 + 0.2 * angN(a, 2, 101);
    o[0] =
      o[1] =
      o[2] =
        (sstep(R, R * 0.3, r) * 0.9 + Math.exp(-r * r * 6) * 0.25) *
        sstep(1, 0.8, r);
    o[3] = 1;
  });
  // 11 flame tongue (tall)
  paintCell(img, 11, (u, v, o) => {
    const w = 0.5 * (1 - ((v + 1) / 2) ** 0.7) + 0.08;
    const n = fbm(u * 4, v * 3 + 7, 111, 5);
    const d =
      sstep(w, w * 0.2, Math.abs(u + (n - 0.5) * 0.4)) *
      sstep(-1, -0.6, v) *
      sstep(1, 0.5, v);
    o[0] = o[1] = o[2] = d * (0.6 + 0.6 * n);
    o[3] = 1;
  });
  // 12 soft wide ring (ground shock)
  paintCell(img, 12, (u, v, o) => {
    const r = Math.hypot(u, v),
      a = Math.atan2(v, u);
    o[0] =
      o[1] =
      o[2] =
        Math.exp(-(((r - 0.74) / 0.16) ** 2)) *
        (0.5 + 0.5 * angN(a, 4, 121)) *
        sstep(1, 0.9, r);
    o[3] = 1;
  });
  // 13 electric arc streak (for stretched mode)
  paintCell(img, 13, (u, v, o) => {
    const x = u + (fbm(v * 3, 1, 131, 4) - 0.5) * 0.6;
    o[0] =
      o[1] =
      o[2] =
        Math.exp(-((x / 0.07) ** 2)) *
        sstep(1, 0.6, Math.abs(v)) *
        sstep(1, 0.8, Math.abs(u));
    o[3] = 1;
  });
  // 14 heat soft disc (dim core glow)
  paintCell(img, 14, (u, v, o) => {
    const r = Math.hypot(u, v);
    o[0] = o[1] = o[2] = Math.exp(-r * r * 2.5) * sstep(1, 0.6, r);
    o[3] = 1;
  });
  // 15 smoky fire (dirty flame)
  paintCell(img, 15, (u, v, o) => {
    const r = Math.hypot(u, v);
    const n = fbm(u * 5, v * 5, 151, 5);
    o[0] =
      o[1] =
      o[2] =
        sstep(0.9, 0.1, r + (n - 0.5)) * n * n * 1.6 * sstep(1, 0.85, r);
    o[3] = 1;
  });
  ctx.putImageData(img, 0, 0);
  return c;
}

/* ------------------------------------------------------------------ decals */
const DF = {
  bullet_concrete: 0,
  bullet_wood: 1,
  bullet_metal: 2,
  bullet_dirt: 3,
  blood0: 4,
  blood1: 5,
  blood2: 6,
  blood3: 7,
  blood_wall: 8,
  blood_drop: 9,
  bullet_sandbag: 10,
  scorch0: 11,
  scorch1: 12,
  dirt: 13,
  scorch_aether: 14,
  bullet_flesh: 15,
};
function buildDecalAtlas() {
  const col = canvasOf(),
    nrm = canvasOf(),
    prp = canvasOf();
  const H = { h: new Float32Array(ASZ * ASZ), p: prp.img.data };
  const polar = (u, v) => [Math.hypot(u, v), Math.atan2(v, u)];
  // bullet holes are painted in a +-0.6 domain so the crater fills most of the quad
  const zoom = (k, fn) => (u, v, o) => {
    fn(u * k, v * k, o);
    o[3] *= sstep(1, 0.88, Math.hypot(u, v));
  };

  // ---- bullet hole: concrete / plaster
  paintCell(
    col.img,
    0,
    zoom(0.62, (u, v, o) => {
      const [r, a] = polar(u, v);
      const Rh = 0.1 * (0.8 + 0.5 * angN(a, 2, 11));
      const Rc = 0.36 * (0.6 + 0.8 * angN(a, 1.4, 12));
      const sp = fbm(u * 18, v * 18, 13, 3);
      let crack = 0;
      for (let k = 0; k < 6; k++) {
        const ca = h2(k, 1, 14) * TAU,
          len = 0.45 + 0.45 * h2(k, 2, 14);
        const wig = ca + (vn(r * 7, k, 15) - 0.5) * 0.35;
        let da = Math.abs(((a - wig + Math.PI * 3) % TAU) - Math.PI);
        const w = (0.018 * (1 - r / len)) / Math.max(r, 0.05);
        if (r < len)
          crack = Math.max(crack, sstep(w * 1.4, w * 0.3, da) * (1 - r / len));
      }
      if (r < Rh) {
        o[0] = o[1] = o[2] = 0.03;
        o[3] = 1;
        o[4] = -1;
      } else if (r < Rc) {
        const t = (r - Rh) / (Rc - Rh);
        const g = 0.36 + 0.18 * sp - 0.16 * (1 - t);
        o[0] = g * 1.02;
        o[1] = g;
        o[2] = g * 0.95;
        o[3] = 1;
        o[4] = -0.7 * (1 - t) ** 1.4 + (sp - 0.5) * 0.15;
      } else {
        const halo =
          sstep(Rc + 0.4, Rc, r) * (0.3 + 0.5 * fbm(u * 6, v * 6, 16, 4));
        o[0] = o[1] = o[2] = 0.14;
        o[3] = halo * 0.55;
        o[4] = 0;
      }
      if (crack > 0.05) {
        o[0] = o[0] * (1 - crack) + 0.05 * crack;
        o[1] = o[1] * (1 - crack) + 0.05 * crack;
        o[2] = o[2] * (1 - crack) + 0.05 * crack;
        o[3] = Math.max(o[3], crack);
        o[4] -= crack * 0.3;
      }
      o[3] *= sstep(1, 0.9, r);
      o[5] = 0.95;
    }),
    H,
  );
  // ---- wood: torn fibres along grain (x)
  paintCell(
    col.img,
    1,
    zoom(0.62, (u, v, o) => {
      const [r, a] = polar(u * 0.85, v * 1.3);
      const Rh = 0.1 * (0.8 + 0.5 * angN(a, 2, 21));
      const fib = fbm(u * 2.5, v * 34, 22, 4);
      const Rr =
        0.17 +
        0.32 * Math.pow(Math.abs(Math.cos(a)), 6) * (0.35 + fib) +
        0.08 * angN(a, 3, 23);
      const grain = fbm(u * 3, v * 40, 24, 3);
      if (r < Rh) {
        o[0] = 0.03;
        o[1] = 0.02;
        o[2] = 0.012;
        o[3] = 1;
        o[4] = -1;
      } else if (r < Rr) {
        const t = (r - Rh) / (Rr - Rh);
        const g = 0.3 + 0.2 * grain + 0.08 * t;
        o[0] = g;
        o[1] = g * 0.74;
        o[2] = g * 0.48;
        o[3] = 1 - t * t * 0.55;
        o[4] = 0.35 * (grain - 0.5) - 0.5 * (1 - t);
      } else {
        o[0] = 0.07;
        o[1] = 0.05;
        o[2] = 0.03;
        o[3] = sstep(Rr + 0.18, Rr, r) * 0.4 * (0.5 + grain);
        o[4] = 0;
      }
      o[5] = 0.85;
    }),
    H,
  );
  // ---- metal: dented hole, bright raised rim, flaked paint -> bare steel
  paintCell(
    col.img,
    2,
    zoom(0.62, (u, v, o) => {
      const [r, a] = polar(u, v);
      const Rh = 0.085 * (0.9 + 0.2 * angN(a, 2, 31));
      const Rr = 0.16 * (0.9 + 0.2 * angN(a, 2, 32));
      const Rf = 0.34 * (0.5 + angN(a, 1.7, 33));
      const n = fbm(u * 20, v * 20, 34, 3);
      if (r < Rh) {
        o[0] = o[1] = o[2] = 0.02;
        o[3] = 1;
        o[4] = -1;
        o[5] = 0.6;
        o[6] = 0.2;
      } else if (r < Rr) {
        const t = (r - Rh) / (Rr - Rh);
        o[0] = o[1] = o[2] = 0.42 + 0.12 * n;
        o[3] = 1;
        o[4] = 0.8 * Math.sin(t * Math.PI);
        o[5] = 0.3;
        o[6] = 1;
      } else if (r < Rf) {
        const t = (r - Rr) / (Rf - Rr);
        o[0] = o[1] = o[2] = 0.3 + 0.12 * n - 0.1 * t;
        o[3] = 1;
        o[4] = 0.1 * (1 - t);
        o[5] = 0.45 + 0.2 * n;
        o[6] = 1;
      } else {
        o[0] = 0.06;
        o[1] = 0.05;
        o[2] = 0.04;
        o[3] = sstep(Rf + 0.2, Rf, r) * 0.45;
        o[5] = 0.8;
      }
      o[3] *= sstep(1, 0.9, r);
    }),
    H,
  );
  // ---- dirt / generic crater
  paintCell(
    col.img,
    3,
    zoom(0.8, (u, v, o) => {
      const [r, a] = polar(u, v);
      const n = fbm(u * 8, v * 8, 41, 4);
      const R = 0.4 * (0.7 + 0.6 * angN(a, 2, 42));
      o[0] = 0.07 + 0.08 * n;
      o[1] = o[0] * 0.8;
      o[2] = o[0] * 0.6;
      o[3] = sstep(R + 0.3, R * 0.6, r) * (0.65 + 0.35 * n);
      o[4] = -0.8 * sstep(R, 0, r) + (n - 0.5) * 0.4;
      o[5] = 1;
    }),
    H,
  );
  // ---- blood splats
  const bloodCell = (idx, seed, mode) => {
    const dirA = h2(1, 1, seed) * TAU,
      dx = Math.cos(dirA),
      dy = Math.sin(dirA);
    const sats = [];
    const nS = mode === "drops" ? 34 : 22;
    for (let i = 0; i < nS; i++) {
      const along =
        mode === "drops" ? rrS(i, 1) * 1.6 - 0.8 : 0.25 + 0.6 * rrS(i, 1);
      const side =
        (rrS(i, 2) - 0.5) * (mode === "drops" ? 1.6 : 0.7) * (0.4 + along);
      const x = mode === "drops" ? along : dx * along - dy * side,
        y = mode === "drops" ? side : dy * along + dx * side;
      sats.push([
        x,
        y,
        (mode === "drops" ? 0.02 : 0.015) +
          0.05 * rrS(i, 3) ** 2 * (1.2 - Math.abs(along)),
        1 + rrS(i, 4) * 2.2 * (mode === "drops" ? 0 : 1),
      ]);
    }
    function rrS(i, k) {
      return h2(i, k, seed);
    }
    paintCell(
      col.img,
      idx,
      (u, v, o) => {
        const [r, a] = polar(u, v);
        let m = -1;
        if (mode === "wall") {
          // blob at top + gravity runs downward (canvas +v)
          const R = 0.28 * (0.75 + 0.5 * angN(a, 2.2, seed + 1));
          m = (R - Math.hypot(u, v + 0.35)) / R;
          for (let k = 0; k < 6; k++) {
            const x = -0.28 + 0.56 * h2(k, 5, seed),
              len = 0.25 + 0.6 * h2(k, 6, seed),
              w = 0.018 + 0.02 * h2(k, 7, seed);
            const yy = v + 0.35;
            if (yy > 0 && yy < len) {
              const ww = w * (1 - (0.5 * yy) / len);
              m = Math.max(m, (ww - Math.abs(u - x)) / ww);
            }
            const bd = Math.hypot(u - x, v + 0.35 - len) / (w * 1.5);
            m = Math.max(m, 1 - bd);
          }
        } else if (mode !== "drops") {
          const spike = Math.pow(angN(a, 6, seed + 2, 3), 4) * 0.8;
          const R = 0.3 * (0.7 + 0.6 * angN(a, 1.8, seed + 1)) + spike * 0.35;
          m = (R - r) / R;
        }
        for (const [x, y, rad, st] of sats) {
          // streaked satellite droplets pointing away from impact
          const ux = u - x,
            uy = v - y;
          const al = (ux * dx + uy * dy) / st,
            pe = -ux * dy + uy * dx;
          const d =
            mode === "drops"
              ? Math.hypot(ux, uy) / rad
              : Math.hypot(al, pe) / rad;
          if (d < 1.4) m = Math.max(m, 1 - d);
        }
        const n = fbm(u * 6, v * 6, seed + 3, 4);
        const inside = sstep(-0.02, 0.06, m);
        const ring = sstep(0.28, 0.02, m); // coffee-ring dark edge
        o[0] = 0.26 - 0.13 * ring + 0.07 * (n - 0.5);
        o[1] = 0.012;
        o[2] = 0.012 + 0.006 * n;
        o[3] = inside * 0.96;
        o[4] = inside * (0.25 + 0.2 * sstep(0, 0.5, m));
        o[5] = 0.12 + 0.35 * ring * n;
        o[3] *= sstep(1, 0.92, r);
      },
      H,
    );
  };
  bloodCell(4, 401, "splat");
  bloodCell(5, 402, "splat");
  bloodCell(6, 403, "splat");
  bloodCell(7, 404, "splat");
  bloodCell(8, 405, "wall");
  bloodCell(9, 406, "drops");
  // ---- sandbag: dark hole, frayed burlap, sand spill
  paintCell(
    col.img,
    10,
    zoom(0.62, (u, v, o) => {
      const [r, a] = polar(u, v);
      const weave = Math.sin(u * 90) * Math.sin(v * 90) * 0.5 + 0.5;
      const R = 0.14 * (0.8 + 0.5 * angN(a, 3, 101));
      const fray = sstep(R + 0.12, R, r) * (0.5 + 0.5 * weave);
      if (r < R) {
        o[0] = 0.05;
        o[1] = 0.04;
        o[2] = 0.03;
        o[3] = 1;
        o[4] = -1;
      } else {
        const sand = fbm(u * 25, v * 25, 102, 3);
        o[0] = 0.55 + 0.2 * sand;
        o[1] = o[0] * 0.85;
        o[2] = o[0] * 0.6;
        o[3] = Math.max(fray, sstep(0.55, R, r) * 0.5 * sstep(0.45, 0.7, sand));
        o[4] = fray * 0.2;
      }
      o[3] *= sstep(1, 0.9, r);
      o[5] = 1;
    }),
    H,
  );
  // ---- scorch (two variants) — soot with radial streaks, ashy centre
  const scorch = (idx, seed, green) =>
    paintCell(
      col.img,
      idx,
      (u, v, o) => {
        const [r, a] = polar(u, v);
        const n = fbm(u * 4, v * 4, seed, 5);
        const rays = Math.pow(angN(a, 10, seed + 1, 3), 2);
        const d = sstep(0.98, 0.1, r * (0.75 + 0.5 * n) - rays * 0.25);
        const ash =
          sstep(0.4, 0.0, r) *
          sstep(0.45, 0.7, fbm(u * 12, v * 12, seed + 2, 3));
        const g = 0.025 + ash * 0.12;
        o[0] = g;
        o[1] = green ? g * 1.6 + 0.02 * d : g * 0.95;
        o[2] = g * 0.9;
        o[3] = d * 0.93 * sstep(1, 0.9, r);
        o[4] = -0.3 * sstep(0.5, 0, r) + (n - 0.5) * 0.3;
        o[5] = 1;
      },
      H,
    );
  scorch(11, 501);
  scorch(12, 502);
  scorch(14, 503, true);
  // ---- disturbed earth (zombie rising)
  paintCell(
    col.img,
    13,
    (u, v, o) => {
      const [r, a] = polar(u, v);
      const n = fbm(u * 5, v * 5, 601, 5),
        cl = vn(u * 14, v * 14, 602);
      const R = 0.7 * (0.75 + 0.4 * angN(a, 2, 603));
      o[0] = 0.13 + 0.12 * n + 0.08 * cl;
      o[1] = o[0] * 0.78;
      o[2] = o[0] * 0.55;
      o[3] = sstep(R, R * 0.6, r + (cl - 0.5) * 0.2);
      o[4] = sstep(R, 0.2, r) * 0.6 * (0.3 + cl) - sstep(0.25, 0, r) * 0.8;
      o[5] = 1;
    },
    H,
  );
  // ---- flesh wound hole
  paintCell(
    col.img,
    15,
    (u, v, o) => {
      const r = Math.hypot(u, v);
      o[0] = 0.12;
      o[1] = 0.01;
      o[2] = 0.01;
      o[3] = sstep(0.5, 0.2, r);
      o[4] = -sstep(0.3, 0, r);
      o[5] = 0.2;
    },
    H,
  );

  col.ctx.putImageData(col.img, 0, 0);
  // normal map from height (per cell, clamped at cell edges)
  const nd = nrm.img.data,
    hh = H.h;
  const str = 5.0;
  for (let y = 0; y < ASZ; y++)
    for (let x = 0; x < ASZ; x++) {
      const cx0 = x - (x % CELL),
        cy0 = y - (y % CELL);
      const xl = Math.max(cx0, x - 1),
        xr = Math.min(cx0 + CELL - 1, x + 1);
      const yu = Math.max(cy0, y - 1),
        yd = Math.min(cy0 + CELL - 1, y + 1);
      const nx = -(hh[y * ASZ + xr] - hh[y * ASZ + xl]) * str;
      const ny = (hh[yd * ASZ + x] - hh[yu * ASZ + x]) * str;
      const l = Math.hypot(nx, ny, 1);
      const k = (y * ASZ + x) * 4;
      nd[k] = ((nx / l) * 0.5 + 0.5) * 255;
      nd[k + 1] = ((ny / l) * 0.5 + 0.5) * 255;
      nd[k + 2] = ((1 / l) * 0.5 + 0.5) * 255;
      nd[k + 3] = 255;
    }
  nrm.ctx.putImageData(nrm.img, 0, 0);
  prp.ctx.putImageData(prp.img, 0, 0);
  return { col: col.c, nrm: nrm.c, prp: prp.c };
}

function glowCanvas(size = 128) {
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const ctx = c.getContext("2d");
  const g = ctx.createRadialGradient(
    size / 2,
    size / 2,
    0,
    size / 2,
    size / 2,
    size / 2,
  );
  g.addColorStop(0, "rgba(255,255,255,1)");
  g.addColorStop(0.15, "rgba(255,255,255,0.55)");
  g.addColorStop(0.4, "rgba(255,255,255,0.16)");
  g.addColorStop(0.7, "rgba(255,255,255,0.04)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  return c;
}

/* ========================================================= particles ==== */
// per-particle sim layout (floats)
const PX = 0,
  PY = 1,
  PZ = 2,
  VX = 3,
  VY = 4,
  VZ = 5,
  AGE = 6,
  LIFE = 7,
  S0 = 8,
  S1 = 9,
  ROT = 10,
  SPIN = 11,
  R0 = 12,
  G0 = 13,
  B0 = 14,
  A0 = 15,
  R1 = 16,
  G1 = 17,
  B1 = 18,
  GRAV = 19,
  DRAG = 20,
  FRAME = 21,
  STR = 22,
  EM = 23,
  BOUNCE = 24,
  EVT = 25,
  FIN = 26,
  FOUT = 27,
  RAMP = 28,
  SPOW = 29,
  TURB = 30,
  SOFT = 31,
  ST = 32;
const NOFLOOR = -2,
  DIE = -1,
  STICK = 0;
const M_BILL = 0,
  M_STRETCH = 16,
  M_FLAT = 32;

// colour ramps (t, r, g, b) — HDR
const RAMPS = [
  null,
  [
    0, 2.6, 2.0, 1.3, 0.1, 2.2, 1.0, 0.3, 0.28, 1.2, 0.38, 0.07, 0.5, 0.4, 0.09,
    0.015, 0.75, 0.07, 0.025, 0.012, 1, 0.02, 0.012, 0.01,
  ], // 1 fire
  [0, 14, 9, 4.5, 0.25, 7, 2.6, 0.6, 0.65, 1.8, 0.35, 0.06, 1, 0.3, 0.05, 0.0], // 2 spark
  [0, 7, 14, 7, 0.2, 1.4, 9, 2.0, 0.6, 0.25, 2.6, 0.6, 1, 0.0, 0.35, 0.12], // 3 aether
  [0, 12, 11, 6, 0.3, 5, 4.2, 1.2, 1, 0.5, 1.6, 0.25], // 4 gold->green
];
const _rc = new Float32Array(3);
function sampleRamp(ri, t) {
  const R = RAMPS[ri];
  for (let i = 4; i < R.length; i += 4) {
    if (t <= R[i] || i === R.length - 4) {
      const t0 = R[i - 4],
        k = clamp((t - t0) / (R[i] - t0 || 1), 0, 1);
      _rc[0] = R[i - 3] + (R[i + 1] - R[i - 3]) * k;
      _rc[1] = R[i - 2] + (R[i + 2] - R[i - 2]) * k;
      _rc[2] = R[i - 1] + (R[i + 3] - R[i - 1]) * k;
      return _rc;
    }
  }
  return _rc;
}

const PART_VS = /* glsl */ `
attribute vec4 iPos; attribute vec4 iCol; attribute vec4 iMisc; attribute vec3 iVel;
uniform mat4 uCamWorld;
uniform vec3 uAmb; uniform vec4 uLP[8]; uniform vec3 uLC[8];
varying vec2 vUv; varying vec4 vCol; varying float vEm; varying vec3 vLight; varying vec3 vFade; varying float vFrame;
void main(){
  float fr = mod(iMisc.y, 16.0); float mode = floor(iMisc.y / 16.0 + 0.001);
  vFrame = fr; vUv = uv; vCol = iCol; vEm = iMisc.w;
  vec2 c = position.xy; float size = iPos.w;
  vec4 mv;
  float soft = 0.0;
  if (mode < 0.5) {
    mv = viewMatrix * vec4(iPos.xyz, 1.0);
    float s = sin(iMisc.x), co = cos(iMisc.x);
    mv.xy += vec2(c.x * co - c.y * s, c.x * s + c.y * co) * size;
    soft = iMisc.z;
  } else if (mode < 1.5) {
    mv = viewMatrix * vec4(iPos.xyz, 1.0);
    vec3 vv = (viewMatrix * vec4(iVel, 0.0)).xyz;
    vec2 ax = vv.xy; float l = length(ax);
    ax = l > 1e-4 ? ax / l : vec2(0.0, 1.0);
    vec2 pp = vec2(ax.y, -ax.x);
    float len = size + iMisc.z * l;
    mv.xy += pp * c.x * size + ax * ((c.y + 0.5) * len - len + size * 0.5);
  } else {
    float s = sin(iMisc.x), co = cos(iMisc.x);
    vec2 r = vec2(c.x * co - c.y * s, c.x * s + c.y * co) * size;
    mv = viewMatrix * vec4(iPos.xyz + vec3(r.x, 0.0, -r.y), 1.0);
  }
  vec3 wp = (uCamWorld * mv).xyz;
  vFade = vec3(-mv.z, wp.y, soft);   // near-camera + floor soft fades resolved per fragment
#ifndef ADDITIVE
  vec3 L = uAmb;
  for (int k = 0; k < 8; k++) {
    vec3 d = uLP[k].xyz - iPos.xyz; float dist2 = max(dot(d, d), 0.04);
    float cut = uLP[k].w;
    float f = cut > 0.0 ? pow(clamp(1.0 - pow(dist2 / (cut * cut), 2.0), 0.0, 1.0), 2.0) : 1.0;
    L += uLC[k] * f / dist2;
  }
  vLight = L;
#endif
  gl_Position = projectionMatrix * mv;
}`;
const PART_FS = /* glsl */ `
uniform sampler2D uMap; uniform vec3 uEmCol;
varying vec2 vUv; varying vec4 vCol; varying float vEm; varying vec3 vLight; varying vec3 vFade; varying float vFrame;
void main(){
  float fade = smoothstep(0.08, 0.6, vFade.x);
  if (vFade.z > 0.0) fade *= smoothstep(0.0, vFade.z, vFade.y);
  vec2 cell = vec2(mod(vFrame, 4.0), floor(vFrame / 4.0 + 0.001));
  vec2 uv = vec2((cell.x + vUv.x) * 0.25, 1.0 - (cell.y + 1.0 - vUv.y) * 0.25);
  vec4 t = texture2D(uMap, uv);
#ifdef ADDITIVE
  float i = t.r * vCol.a * fade;
  gl_FragColor = vec4(vCol.rgb * i + vec3(i * i * i) * vEm, 1.0);
#else
  float a = t.a * vCol.a * fade;
  if (a < 0.003) discard;
  vec3 c = vCol.rgb * vLight * mix(0.14, 1.15, t.r);
  c += uEmCol * vEm * (1.15 - t.r) * vCol.rgb * 4.0;
  gl_FragColor = vec4(c, a);
#endif
}`;

class ParticlePool {
  constructor(max, map, additive, fx) {
    this.max = max;
    this.n = 0;
    this.fx = fx;
    this.d = new Float32Array(max * ST);
    this.keys = new Uint32Array(max);
    const g = new THREE.InstancedBufferGeometry();
    const base = new THREE.PlaneGeometry(1, 1);
    g.index = base.index;
    g.setAttribute("position", base.getAttribute("position"));
    g.setAttribute("uv", base.getAttribute("uv"));
    const mk = (n) => {
      const a = new THREE.InstancedBufferAttribute(
        new Float32Array(max * n),
        n,
      );
      a.setUsage(THREE.DynamicDrawUsage);
      return a;
    };
    this.aPos = mk(4);
    this.aCol = mk(4);
    this.aMisc = mk(4);
    this.aVel = mk(3);
    g.setAttribute("iPos", this.aPos);
    g.setAttribute("iCol", this.aCol);
    g.setAttribute("iMisc", this.aMisc);
    g.setAttribute("iVel", this.aVel);
    g.instanceCount = 0;
    this.geo = g;
    this.mat = new THREE.ShaderMaterial({
      uniforms: {
        uMap: { value: map },
        uCamWorld: fx._uCamWorld,
        uAmb: fx._uAmb,
        uLP: fx._uLP,
        uLC: fx._uLC,
        uEmCol: { value: new THREE.Color(1.0, 0.42, 0.12) },
      },
      vertexShader: PART_VS,
      fragmentShader: PART_FS,
      defines: additive ? { ADDITIVE: 1 } : {},
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    this.mesh = new THREE.Mesh(g, this.mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = additive ? 12 : 10;
    this.mesh.name = additive ? "fx.additive" : "fx.alpha";
    this.sorted = !additive;
  }
  // returns float offset of the new particle (always succeeds: recycles when full)
  emit(x, y, z, vx, vy, vz, life, s0, s1, frame) {
    let i = this.n;
    if (i >= this.max) i = (rnd() * this.max) | 0;
    else this.n++;
    const d = this.d,
      o = i * ST;
    d[o + PX] = x;
    d[o + PY] = y;
    d[o + PZ] = z;
    d[o + VX] = vx;
    d[o + VY] = vy;
    d[o + VZ] = vz;
    d[o + AGE] = 0;
    d[o + LIFE] = life;
    d[o + S0] = s0;
    d[o + S1] = s1;
    d[o + ROT] = rnd() * TAU;
    d[o + SPIN] = 0;
    d[o + R0] = d[o + G0] = d[o + B0] = d[o + A0] = 1;
    d[o + R1] = d[o + G1] = d[o + B1] = 1;
    d[o + GRAV] = 0;
    d[o + DRAG] = 0;
    d[o + FRAME] = frame;
    d[o + STR] = 0;
    d[o + EM] = 0;
    d[o + BOUNCE] = NOFLOOR;
    d[o + EVT] = 0;
    d[o + FIN] = 0.05;
    d[o + FOUT] = 0.55;
    d[o + RAMP] = 0;
    d[o + SPOW] = 1;
    d[o + TURB] = 0;
    d[o + SOFT] = 0;
    return o;
  }
  col(o, r, g, b, a = 1, r1 = r, g1 = g, b1 = b) {
    const d = this.d;
    d[o + R0] = r;
    d[o + G0] = g;
    d[o + B0] = b;
    d[o + A0] = a;
    d[o + R1] = r1;
    d[o + G1] = g1;
    d[o + B1] = b1;
    return o;
  }
  phys(o, grav, drag, bounce = NOFLOOR) {
    const d = this.d;
    d[o + GRAV] = grav;
    d[o + DRAG] = drag;
    d[o + BOUNCE] = bounce;
    return o;
  }
  fade(o, fin, fout) {
    this.d[o + FIN] = fin;
    this.d[o + FOUT] = fout;
    return o;
  }

  sim(dt) {
    const d = this.d;
    let n = this.n;
    const fx = this.fx;
    for (let i = 0; i < n;) {
      const o = i * ST;
      const age = d[o + AGE] + dt;
      if (age >= d[o + LIFE]) {
        n--;
        if (i !== n) d.copyWithin(o, n * ST, n * ST + ST);
        continue;
      }
      d[o + AGE] = age;
      const dr = d[o + DRAG];
      if (dr > 0) {
        const k = Math.exp(-dr * dt);
        d[o + VX] *= k;
        d[o + VY] *= k;
        d[o + VZ] *= k;
      }
      const tb = d[o + TURB];
      if (tb > 0) {
        d[o + VX] += (rnd() - 0.5) * tb * dt;
        d[o + VY] += (rnd() - 0.5) * tb * dt;
        d[o + VZ] += (rnd() - 0.5) * tb * dt;
      }
      d[o + VY] -= d[o + GRAV] * dt;
      d[o + PX] += d[o + VX] * dt;
      d[o + PY] += d[o + VY] * dt;
      d[o + PZ] += d[o + VZ] * dt;
      d[o + ROT] += d[o + SPIN] * dt;
      const b = d[o + BOUNCE];
      if (b > -1.5 && d[o + PY] < 0.006) {
        if (b < -0.5) {
          d[o + AGE] = d[o + LIFE];
        } else if (b === STICK) {
          if (d[o + EVT] === 1) {
            fx._bloodLand(d[o + PX], d[o + PZ], d[o + S0]);
            d[o + AGE] = d[o + LIFE];
          }
          d[o + PY] = 0.006;
          d[o + VX] = d[o + VY] = d[o + VZ] = 0;
          d[o + SPIN] = 0;
          d[o + GRAV] = 0;
        } else {
          d[o + PY] = 0.006;
          if (d[o + VY] < -0.4) {
            d[o + VY] = -d[o + VY] * b;
            d[o + VX] *= 0.6;
            d[o + VZ] *= 0.6;
            d[o + SPIN] *= 0.5;
          } else {
            d[o + VY] = 0;
            const k = Math.exp(-6 * dt);
            d[o + VX] *= k;
            d[o + VZ] *= k;
            d[o + SPIN] *= k;
          }
        }
      }
      i++;
    }
    this.n = n;
  }

  write(camPos, camFwd) {
    const d = this.d,
      n = this.n;
    const P = this.aPos.array,
      C = this.aCol.array,
      M = this.aMisc.array,
      V = this.aVel.array;
    const keys = this.keys;
    if (this.sorted) {
      keys.fill(0xffffffff);
      for (let i = 0; i < n; i++) {
        const o = i * ST;
        const dep =
          (d[o + PX] - camPos.x) * camFwd.x +
          (d[o + PY] - camPos.y) * camFwd.y +
          (d[o + PZ] - camPos.z) * camFwd.z;
        const q = clamp(Math.round(dep * 4000) + 8, 0, 1048575);
        keys[i] = ((1048575 - q) * 4096 + i) >>> 0; // farthest first
      }
      keys.sort();
    }
    for (let j = 0; j < n; j++) {
      const i = this.sorted ? keys[j] & 4095 : j,
        o = i * ST;
      const t = d[o + AGE] / d[o + LIFE];
      const sp = d[o + SPOW];
      const size =
        d[o + S0] +
        (d[o + S1] - d[o + S0]) * (sp === 1 ? t : 1 - Math.pow(1 - t, sp));
      const fin = d[o + FIN],
        fout = d[o + FOUT];
      let a = d[o + A0] * (fin > 0 ? Math.min(1, t / fin) : 1);
      if (t > fout) a *= 1 - sstep(0, 1, (t - fout) / (1 - fout));
      let r, g, b;
      const ri = d[o + RAMP];
      if (ri > 0) {
        const c = sampleRamp(ri, t);
        r = c[0] * d[o + R0];
        g = c[1] * d[o + G0];
        b = c[2] * d[o + B0];
      } else {
        r = d[o + R0] + (d[o + R1] - d[o + R0]) * t;
        g = d[o + G0] + (d[o + G1] - d[o + G0]) * t;
        b = d[o + B0] + (d[o + B1] - d[o + B0]) * t;
      }
      const k4 = j * 4,
        k3 = j * 3;
      P[k4] = d[o + PX];
      P[k4 + 1] = d[o + PY];
      P[k4 + 2] = d[o + PZ];
      P[k4 + 3] = size;
      C[k4] = r;
      C[k4 + 1] = g;
      C[k4 + 2] = b;
      C[k4 + 3] = a;
      const mode = d[o + FRAME] >= 32 ? 2 : d[o + FRAME] >= 16 ? 1 : 0;
      M[k4] = d[o + ROT];
      M[k4 + 1] = d[o + FRAME];
      M[k4 + 2] = mode === 1 ? d[o + STR] : d[o + SOFT];
      M[k4 + 3] = d[o + EM] * (1 - t) * (1 - t);
      V[k3] = d[o + VX];
      V[k3 + 1] = d[o + VY];
      V[k3 + 2] = d[o + VZ];
    }
    for (const at of [this.aPos, this.aCol, this.aMisc, this.aVel]) {
      at.clearUpdateRanges();
      at.addUpdateRange(0, Math.max(1, n) * at.itemSize);
      at.needsUpdate = true;
    }
    this.geo.instanceCount = n;
    this.mesh.visible = n > 0;
  }
}

/* ==================================================== rigid debris ==== */
const _q = new THREE.Quaternion(),
  _q2 = new THREE.Quaternion(),
  _m4 = new THREE.Matrix4();
const _va = new THREE.Vector3(),
  _vb = new THREE.Vector3(),
  _vc = new THREE.Vector3(),
  _vs = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0),
  ZAX = new THREE.Vector3(0, 0, 1);

class RigidPool {
  constructor(
    geo,
    mat,
    max,
    { radius, halfLen, colored = false, life = 10, rest = 0.35, name },
  ) {
    this.max = max;
    this.n = 0;
    this.radius = radius;
    this.halfLen = halfLen;
    this.life = life;
    this.rest = rest;
    this.p = new Float32Array(max * 3);
    this.v = new Float32Array(max * 3);
    this.q = new Float32Array(max * 4);
    this.w = new Float32Array(max * 3);
    this.age = new Float32Array(max);
    this.sc = new Float32Array(max);
    this.lf = new Float32Array(max);
    this.flag = new Uint8Array(max);
    this.kind = new Uint8Array(max);
    this.col = colored ? new Float32Array(max * 3) : null;
    this.mesh = new THREE.InstancedMesh(geo, mat, max);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    if (colored) {
      this.mesh.instanceColor = new THREE.InstancedBufferAttribute(
        new Float32Array(max * 3),
        3,
      );
      this.mesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
    }
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    this.mesh.castShadow = false;
    this.mesh.receiveShadow = true;
    this.mesh.name = name;
    this.onBounce = null;
    this.onFly = null;
  }
  spawn(pos, vel, scale, kind = 0, r = 1, g = 1, b = 1) {
    let i = this.n;
    if (i >= this.max) i = (rnd() * this.max) | 0;
    else this.n++;
    const i3 = i * 3,
      i4 = i * 4;
    this.p[i3] = pos.x;
    this.p[i3 + 1] = pos.y;
    this.p[i3 + 2] = pos.z;
    this.v[i3] = vel.x;
    this.v[i3 + 1] = vel.y;
    this.v[i3 + 2] = vel.z;
    _q.setFromEuler(_eul.set(rnd() * TAU, rnd() * TAU, rnd() * TAU));
    this.q[i4] = _q.x;
    this.q[i4 + 1] = _q.y;
    this.q[i4 + 2] = _q.z;
    this.q[i4 + 3] = _q.w;
    this.w[i3] = rr(-25, 25);
    this.w[i3 + 1] = rr(-25, 25);
    this.w[i3 + 2] = rr(-25, 25);
    this.age[i] = 0;
    this.sc[i] = scale;
    this.lf[i] = this.life * rr(0.85, 1.15);
    this.flag[i] = 0;
    this.kind[i] = kind;
    if (this.col) {
      this.col[i3] = r;
      this.col[i3 + 1] = g;
      this.col[i3 + 2] = b;
    }
    return i;
  }
  _copy(dst, src) {
    for (let k = 0; k < 3; k++) {
      this.p[dst * 3 + k] = this.p[src * 3 + k];
      this.v[dst * 3 + k] = this.v[src * 3 + k];
      this.w[dst * 3 + k] = this.w[src * 3 + k];
      if (this.col) this.col[dst * 3 + k] = this.col[src * 3 + k];
    }
    for (let k = 0; k < 4; k++) this.q[dst * 4 + k] = this.q[src * 4 + k];
    this.age[dst] = this.age[src];
    this.sc[dst] = this.sc[src];
    this.lf[dst] = this.lf[src];
    this.flag[dst] = this.flag[src];
    this.kind[dst] = this.kind[src];
  }
  update(dt) {
    let n = this.n;
    const P = this.p,
      V = this.v,
      Q = this.q,
      W = this.w;
    for (let i = 0; i < n;) {
      this.age[i] += dt;
      if (this.age[i] >= this.lf[i]) {
        n--;
        if (i !== n) this._copy(i, n);
        continue;
      }
      const i3 = i * 3,
        i4 = i * 4;
      const settled = this.flag[i] & 2;
      if (!settled) V[i3 + 1] -= 9.8 * dt;
      const dk = Math.exp(-0.25 * dt);
      V[i3] *= dk;
      V[i3 + 2] *= dk;
      P[i3] += V[i3] * dt;
      P[i3 + 1] += V[i3 + 1] * dt;
      P[i3 + 2] += V[i3 + 2] * dt;
      // integrate orientation
      _q.set(Q[i4], Q[i4 + 1], Q[i4 + 2], Q[i4 + 3]);
      const wx = W[i3],
        wy = W[i3 + 1],
        wz = W[i3 + 2];
      const wl = Math.hypot(wx, wy, wz);
      if (wl > 1e-4) {
        _q2.setFromAxisAngle(_va.set(wx / wl, wy / wl, wz / wl), wl * dt);
        _q.premultiply(_q2);
      }
      // collision with floor using oriented extent
      _vb.set(0, 1, 0).applyQuaternion(_q);
      const s = this.sc[i];
      const ext = (Math.abs(_vb.y) * this.halfLen + this.radius) * s;
      if (P[i3 + 1] < ext) {
        P[i3 + 1] = ext;
        if (V[i3 + 1] < -0.6) {
          if (!(this.flag[i] & 1) && this.onBounce)
            this.onBounce(P[i3], P[i3 + 1], P[i3 + 2], -V[i3 + 1]);
          this.flag[i] |= 1;
          V[i3 + 1] = -V[i3 + 1] * this.rest * rr(0.7, 1.1);
          V[i3] = V[i3] * 0.55 + rr(-0.3, 0.3);
          V[i3 + 2] = V[i3 + 2] * 0.55 + rr(-0.3, 0.3);
          W[i3] = W[i3] * 0.5 + rr(-8, 8);
          W[i3 + 1] *= 0.5;
          W[i3 + 2] = W[i3 + 2] * 0.5 + rr(-8, 8);
        } else {
          V[i3 + 1] = 0;
          this.flag[i] |= 2;
          const f = Math.exp(-5 * dt);
          V[i3] *= f;
          V[i3 + 2] *= f;
          const fw = Math.exp(-4 * dt);
          W[i3] *= fw;
          W[i3 + 1] *= fw;
          W[i3 + 2] *= fw;
          // topple onto side: rotate long axis toward the horizontal plane
          if (this.halfLen > this.radius) {
            _vc.set(_vb.x, 0, _vb.z);
            if (_vc.lengthSq() < 1e-6) _vc.set(1, 0, 0);
            _vc.normalize();
            _q2.setFromUnitVectors(_vb, _vc);
            _q.premultiply(_q2.slerp(_qI, 1 - Math.min(1, dt * 10)));
          }
        }
      } else if (settled && P[i3 + 1] > ext + 0.01) this.flag[i] &= ~2;
      _q.normalize();
      Q[i4] = _q.x;
      Q[i4 + 1] = _q.y;
      Q[i4 + 2] = _q.z;
      Q[i4 + 3] = _q.w;
      if (this.onFly && !(this.flag[i] & 2))
        this.onFly(i, P[i3], P[i3 + 1], P[i3 + 2], V[i3], V[i3 + 1], V[i3 + 2]);
      i++;
    }
    this.n = n;
    const im = this.mesh.instanceMatrix.array;
    for (let i = 0; i < n; i++) {
      const i3 = i * 3,
        i4 = i * 4;
      const left = this.lf[i] - this.age[i];
      const s = this.sc[i] * (left < 1 ? left : 1);
      _q.set(this.q[i4], this.q[i4 + 1], this.q[i4 + 2], this.q[i4 + 3]);
      _m4.compose(
        _va.set(
          this.p[i3],
          this.p[i3 + 1] - (left < 1 ? (1 - left) * this.radius * s : 0),
          this.p[i3 + 2],
        ),
        _q,
        _vs.set(s, s, s),
      );
      _m4.toArray(im, i * 16);
      if (this.col) {
        const ic = this.mesh.instanceColor.array;
        ic[i3] = this.col[i3];
        ic[i3 + 1] = this.col[i3 + 1];
        ic[i3 + 2] = this.col[i3 + 2];
      }
    }
    this.mesh.count = n;
    this.mesh.visible = n > 0;
    this.mesh.instanceMatrix.clearUpdateRanges();
    this.mesh.instanceMatrix.addUpdateRange(0, Math.max(1, n) * 16);
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.col) {
      this.mesh.instanceColor.clearUpdateRanges();
      this.mesh.instanceColor.addUpdateRange(0, Math.max(1, n) * 3);
      this.mesh.instanceColor.needsUpdate = true;
    }
  }
}
const _eul = new THREE.Euler(),
  _qI = new THREE.Quaternion();

/* ========================================================= fireball ==== */
const NOISE3 = /* glsl */ `
vec3 mod289(vec3 x){return x-floor(x*(1.0/289.0))*289.0;} vec4 mod289(vec4 x){return x-floor(x*(1.0/289.0))*289.0;}
vec4 permute(vec4 x){return mod289(((x*34.0)+1.0)*x);} vec4 taylorInvSqrt(vec4 r){return 1.79284291400159-0.85373472095314*r;}
float snoise(vec3 v){const vec2 C=vec2(1.0/6.0,1.0/3.0);const vec4 D=vec4(0.0,0.5,1.0,2.0);
vec3 i=floor(v+dot(v,C.yyy));vec3 x0=v-i+dot(i,C.xxx);vec3 g=step(x0.yzx,x0.xyz);vec3 l=1.0-g;vec3 i1=min(g.xyz,l.zxy);vec3 i2=max(g.xyz,l.zxy);
vec3 x1=x0-i1+C.xxx;vec3 x2=x0-i2+C.yyy;vec3 x3=x0-D.yyy;i=mod289(i);
vec4 p=permute(permute(permute(i.z+vec4(0.0,i1.z,i2.z,1.0))+i.y+vec4(0.0,i1.y,i2.y,1.0))+i.x+vec4(0.0,i1.x,i2.x,1.0));
float n_=0.142857142857;vec3 ns=n_*D.wyz-D.xzx;vec4 j=p-49.0*floor(p*ns.z*ns.z);vec4 x_=floor(j*ns.z);vec4 y_=floor(j-7.0*x_);
vec4 x=x_*ns.x+ns.yyyy;vec4 y=y_*ns.x+ns.yyyy;vec4 h=1.0-abs(x)-abs(y);vec4 b0=vec4(x.xy,y.xy);vec4 b1=vec4(x.zw,y.zw);
vec4 s0=floor(b0)*2.0+1.0;vec4 s1=floor(b1)*2.0+1.0;vec4 sh=-step(h,vec4(0.0));vec4 a0=b0.xzyw+s0.xzyw*sh.xxyy;vec4 a1=b1.xzyw+s1.xzyw*sh.zzww;
vec3 p0=vec3(a0.xy,h.x);vec3 p1=vec3(a0.zw,h.y);vec3 p2=vec3(a1.xy,h.z);vec3 p3=vec3(a1.zw,h.w);
vec4 norm=taylorInvSqrt(vec4(dot(p0,p0),dot(p1,p1),dot(p2,p2),dot(p3,p3)));p0*=norm.x;p1*=norm.y;p2*=norm.z;p3*=norm.w;
vec4 m=max(0.6-vec4(dot(x0,x0),dot(x1,x1),dot(x2,x2),dot(x3,x3)),0.0);m=m*m;
return 42.0*dot(m*m,vec4(dot(p0,x0),dot(p1,x1),dot(p2,x2),dot(p3,x3)));}
`;
function makeFireballMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uSeed: { value: 0 },
      uHeat: { value: 1 },
      uErode: { value: 0 },
      uAmp: { value: 0.25 },
      uOpacity: { value: 1 },
    },
    vertexShader:
      NOISE3 +
      `
      uniform float uTime, uSeed, uAmp; varying vec3 vN; varying vec3 vN2; varying vec3 vP; varying vec3 vV; varying vec3 vLocal;
      vec3 disp(vec3 n){
        // billowy displacement: smooth low octave + abs-noise detail lobes
        float d = (snoise(n * 1.3 + vec3(uSeed, uSeed * 0.7, -uTime * 0.9)) * 0.5 + 0.5) * 0.7
                + abs(snoise(n * 3.1 + vec3(-uSeed, uTime * 0.7, 0.0))) * 0.3
                + abs(snoise(n * 6.5 + vec3(uSeed * 1.3, 0.0, uTime))) * 0.1;
        return n * (1.0 + (d - 0.45) * uAmp * 1.4);
      }
      void main(){
        vec3 n = normalize(position);
        vec3 t1 = normalize(cross(n, abs(n.y) < 0.95 ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0)));
        vec3 t2 = cross(n, t1);
        vec3 p = disp(n);
        vec3 pa = disp(normalize(n + t1 * 0.03)), pb = disp(normalize(n + t2 * 0.03));
        vec3 N = normalize(cross(pa - p, pb - p)); if (dot(N, n) < 0.0) N = -N;   // smooth displaced normal
        vLocal = p;
        vec4 wp = modelMatrix * vec4(p, 1.0);
        vP = wp.xyz; vN = normalize(mat3(modelMatrix) * n); vN2 = normalize(mat3(modelMatrix) * N); vV = normalize(cameraPosition - wp.xyz);
        gl_Position = projectionMatrix * viewMatrix * wp;
      }`,
    fragmentShader:
      NOISE3 +
      `
      uniform float uTime, uSeed, uHeat, uErode, uOpacity; varying vec3 vN; varying vec3 vN2; varying vec3 vP; varying vec3 vV; varying vec3 vLocal;
      vec3 ramp(float h){
        h = clamp(h, 0.0, 1.4);
        vec3 c = mix(vec3(0.02,0.012,0.01), vec3(0.55,0.06,0.01), smoothstep(0.0,0.25,h));
        c = mix(c, vec3(1.3,0.32,0.04), smoothstep(0.2,0.55,h));
        c = mix(c, vec3(2.4,1.15,0.25), smoothstep(0.5,0.85,h));
        c = mix(c, vec3(3.6,2.6,1.4), smoothstep(0.85,1.25,h));
        return c;
      }
      void main(){
        float f = clamp(dot(normalize(vN), vV), 0.0, 1.0);          // smooth sphere facing -> heat (gaseous look)
        float fs = clamp(dot(normalize(vN2), vV), 0.0, 1.0);        // displaced facing -> soft lobe silhouettes
        vec3 q = vLocal * 2.2 + vec3(uSeed, -uTime * 1.6, uSeed * 0.3);
        float n1 = snoise(q) * 0.5 + 0.5;
        float n2 = snoise(q * 2.3 + 4.0) * 0.5 + 0.5;
        float n3 = snoise(q * 5.1 - 2.0) * 0.5 + 0.5;
        float n = n1 * 0.55 + n2 * 0.3 + n3 * 0.15;
        float cells = 1.0 - abs(snoise(q * 1.7 + 9.0));            // bright ridges between billows
        float heat = uHeat * (0.3 + 0.8 * f) * (0.35 + 0.75 * n + 0.35 * cells * cells);
        float mask = n * 0.7 + f * 0.5 - 0.15;                     // erodes from the limb inward
        float a = smoothstep(uErode, uErode + 0.22, mask) * uOpacity;
        a *= smoothstep(0.0, 0.3, f + 0.05) * smoothstep(0.0, 0.35, fs);
        if (a < 0.004) discard;
        vec3 col = ramp(heat);
        // cooled regions read as sooty smoke, not holes
        col = mix(vec3(0.035, 0.03, 0.026) * (0.6 + 0.8 * n), col, smoothstep(0.12, 0.5, heat));
        gl_FragColor = vec4(col, a);
      }`,
    transparent: true,
    depthWrite: false,
  });
}

/* ========================================================= power-ups ==== */
function nonIdx(g) {
  const r = g.index ? g.toNonIndexed() : g;
  if (!r.getAttribute("uv"))
    r.setAttribute(
      "uv",
      new THREE.BufferAttribute(
        new Float32Array(r.getAttribute("position").count * 2),
        2,
      ),
    );
  return r;
}
function place(g, x, y, z, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) {
  _m4.compose(
    _va.set(x, y, z),
    _q.setFromEuler(_eul.set(rx, ry, rz)),
    _vs.set(sx, sy, sz),
  );
  g.applyMatrix4(_m4);
  return nonIdx(g);
}
function strokeShape(pts, w) {
  // polyline -> closed outline polygon of width w (miter joins)
  const L = [],
    R = [];
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i],
      a = pts[Math.max(0, i - 1)],
      b = pts[Math.min(pts.length - 1, i + 1)];
    let tx = b[0] - a[0],
      ty = b[1] - a[1];
    const tl = Math.hypot(tx, ty) || 1;
    tx /= tl;
    ty /= tl;
    let nx = -ty,
      ny = tx,
      sc = 1;
    if (i > 0 && i < pts.length - 1) {
      let t0x = p[0] - a[0],
        t0y = p[1] - a[1];
      const l0 = Math.hypot(t0x, t0y) || 1;
      t0x /= l0;
      t0y /= l0;
      sc = 1 / Math.max(0.35, -t0y * nx + t0x * ny);
    }
    L.push(
      new THREE.Vector2(p[0] + nx * w * 0.5 * sc, p[1] + ny * w * 0.5 * sc),
    );
    R.push(
      new THREE.Vector2(p[0] - nx * w * 0.5 * sc, p[1] - ny * w * 0.5 * sc),
    );
  }
  return new THREE.Shape(L.concat(R.reverse()));
}
function buildPowerupGeos() {
  const G = {}; // type -> {gold: geo, dark: geo}
  const ext = (shape, depth, bev = 0.012) =>
    new THREE.ExtrudeGeometry(shape, {
      depth,
      bevelEnabled: true,
      bevelThickness: bev,
      bevelSize: bev * 0.8,
      bevelSegments: 3,
      curveSegments: 10,
    });
  // --- max ammo: ammo crate with rope handles + rounds on top
  {
    const gold = [],
      dark = [];
    gold.push(place(new THREE.BoxGeometry(0.36, 0.2, 0.22), 0, 0, 0));
    for (const sx of [-1, 1])
      for (const sz of [-1, 1])
        dark.push(
          place(
            new THREE.BoxGeometry(0.03, 0.212, 0.03),
            sx * 0.168,
            0,
            sz * 0.098,
          ),
        );
    dark.push(place(new THREE.BoxGeometry(0.37, 0.03, 0.23), 0, 0.085, 0));
    dark.push(place(new THREE.BoxGeometry(0.2, 0.06, 0.005), 0, -0.01, 0.112)); // stencil band
    for (const sx of [-1, 1])
      dark.push(
        place(
          new THREE.TorusGeometry(0.04, 0.009, 8, 16, Math.PI),
          sx * 0.18,
          0.02,
          0,
          Math.PI / 2,
          0,
          (-sx * Math.PI) / 2,
        ),
      );
    for (let i = 0; i < 5; i++) {
      const x = -0.1 + i * 0.05,
        tilt = (i - 2) * 0.06;
      gold.push(
        place(
          new THREE.CylinderGeometry(0.013, 0.013, 0.075, 12),
          x,
          0.14,
          -0.01,
          0,
          0,
          tilt,
        ),
      );
      gold.push(
        place(
          new THREE.ConeGeometry(0.013, 0.035, 12),
          x - Math.sin(tilt) * 0.055,
          0.195,
          -0.01,
          0,
          0,
          tilt,
        ),
      );
    }
    G.maxammo = { gold, dark };
  }
  // --- insta-kill: grinning skull
  {
    const gold = [],
      dark = [];
    gold.push(
      place(
        new THREE.SphereGeometry(0.13, 32, 24),
        0,
        0.035,
        -0.01,
        0,
        0,
        0,
        1,
        0.98,
        1.12,
      ),
    ); // cranium
    gold.push(
      place(
        new THREE.CylinderGeometry(0.078, 0.062, 0.08, 20),
        0,
        -0.075,
        0.04,
        0,
        0,
        0,
        1,
        1,
        0.95,
      ),
    ); // maxilla
    for (const sx of [-1, 1]) {
      dark.push(
        place(
          new THREE.SphereGeometry(0.041, 18, 14),
          sx * 0.049,
          -0.012,
          0.118,
          0,
          0,
          sx * 0.25,
          1.05,
          0.9,
          0.55,
        ),
      ); // sockets
      gold.push(
        place(
          new THREE.SphereGeometry(0.026, 12, 10),
          sx * 0.07,
          -0.052,
          0.07,
          0,
          0,
          0,
          0.8,
          0.7,
          1,
        ),
      ); // zygomatic
    }
    dark.push(
      place(
        new THREE.ConeGeometry(0.017, 0.036, 3),
        0,
        -0.05,
        0.128,
        0,
        0,
        0,
        1,
        1,
        0.45,
      ),
    ); // nasal cavity
    const toothRow = (y, z0, curve, h) => {
      for (let i = 0; i < 10; i++) {
        const t = (i - 4.5) / 4.5,
          x = t * 0.058;
        gold.push(
          place(
            new THREE.BoxGeometry(0.0105, h, 0.012),
            x,
            y + t * t * curve,
            z0 - t * t * 0.03,
            0,
            t * 0.55,
            0,
          ),
        );
      }
    };
    toothRow(-0.113, 0.103, 0.018, 0.022); // upper teeth, grin curving up
    toothRow(-0.137, 0.098, 0.014, 0.018); // lower teeth
    dark.push(place(new THREE.BoxGeometry(0.085, 0.04, 0.02), 0, -0.125, 0.08)); // mouth gap behind teeth
    gold.push(
      place(
        new THREE.TorusGeometry(0.062, 0.015, 8, 20, Math.PI),
        0,
        -0.15,
        0.035,
        Math.PI / 2,
        0,
        0,
        1,
        1,
        1.1,
      ),
    ); // mandible
    G.instakill = { gold, dark };
  }
  // --- double points: bold extruded "x2"
  {
    const gold = [],
      dark = [];
    const xw = 0.05;
    const xa = strokeShape(
        [
          [-0.07, -0.07],
          [0.07, 0.07],
        ],
        xw,
      ),
      xb = strokeShape(
        [
          [-0.07, 0.07],
          [0.07, -0.07],
        ],
        xw,
      );
    const two = [];
    for (let i = 0; i <= 12; i++) {
      const a = Math.PI * 0.95 - (i / 12) * Math.PI * 1.2;
      two.push([0.075 * Math.cos(a), 0.06 + 0.075 * Math.sin(a)]);
    }
    two.push([-0.08, -0.105]);
    two.push([0.09, -0.105]);
    const s2 = strokeShape(two, 0.052);
    for (const [s, dx] of [
      [xa, -0.14],
      [xb, -0.14],
      [s2, 0.09],
    ]) {
      const g = ext(s, 0.05);
      g.translate(dx, 0, -0.025);
      gold.push(nonIdx(g));
    }
    G.doublepoints = { gold, dark };
  }
  // --- nuke: old aerial bomb
  {
    const gold = [],
      dark = [];
    const prof = [];
    for (let i = 0; i <= 20; i++) {
      const t = i / 20;
      const y = -0.2 + t * 0.4;
      const r =
        0.085 *
        Math.pow(Math.sin(Math.PI * Math.min(1, 0.12 + t * 0.95)), 0.6) *
        (t < 0.5 ? 1 : 1 - (t - 0.5) * 0.9);
      prof.push(new THREE.Vector2(Math.max(0.004, r), y));
    }
    const body = new THREE.LatheGeometry(prof, 28);
    gold.push(place(body, 0, 0, 0));
    for (let k = 0; k < 4; k++)
      gold.push(
        place(
          new THREE.BoxGeometry(0.004, 0.11, 0.075),
          Math.sin((k * Math.PI) / 2) * 0.037,
          0.25,
          Math.cos((k * Math.PI) / 2) * 0.037,
          0,
          (k * Math.PI) / 2 + Math.PI / 2,
          0,
        ),
      );
    for (let k = 0; k < 4; k++)
      gold.push(
        place(
          new THREE.BoxGeometry(0.106, 0.045, 0.004),
          Math.sin((k * Math.PI) / 2) * 0.053,
          0.28,
          Math.cos((k * Math.PI) / 2) * 0.053,
          0,
          (k * Math.PI) / 2,
          0,
        ),
      ); // box-fin shroud
    dark.push(
      place(new THREE.CylinderGeometry(0.087, 0.087, 0.03, 28), 0, -0.03, 0),
    );
    dark.push(
      place(new THREE.CylinderGeometry(0.015, 0.02, 0.03, 12), 0, -0.21, 0),
    );
    const merge = (arr) =>
      arr.map((g) => {
        g.rotateZ(Math.PI / 2 + 0.35);
        return g;
      });
    merge(gold);
    merge(dark);
    G.nuke = { gold, dark };
  }
  // --- carpenter: claw hammer
  {
    const gold = [],
      dark = [];
    gold.push(
      place(new THREE.CylinderGeometry(0.013, 0.017, 0.34, 12), 0, -0.06, 0),
    ); // handle
    dark.push(
      place(new THREE.CylinderGeometry(0.02, 0.019, 0.13, 12), 0, -0.17, 0),
    ); // grip
    gold.push(
      place(new THREE.BoxGeometry(0.075, 0.042, 0.036), 0.012, 0.13, 0),
    ); // head body (eye)
    gold.push(
      place(
        new THREE.CylinderGeometry(0.02, 0.024, 0.045, 16),
        0.07,
        0.13,
        0,
        0,
        0,
        Math.PI / 2,
      ),
    ); // neck
    gold.push(
      place(
        new THREE.CylinderGeometry(0.027, 0.027, 0.018, 18),
        0.098,
        0.13,
        0,
        0,
        0,
        Math.PI / 2,
      ),
    ); // striking face
    for (const sz of [-1, 1]) {
      const curve = new THREE.QuadraticBezierCurve3(
        new THREE.Vector3(-0.025, 0.135, sz * 0.008),
        new THREE.Vector3(-0.08, 0.14, sz * 0.01),
        new THREE.Vector3(-0.1, 0.09, sz * 0.013),
      );
      gold.push(nonIdx(new THREE.TubeGeometry(curve, 10, 0.012, 8, false)));
      gold.push(
        place(
          new THREE.ConeGeometry(0.012, 0.022, 8),
          -0.103,
          0.082,
          sz * 0.013,
          0,
          0,
          Math.PI + 0.35,
        ),
      );
    }
    for (const g of gold.concat(dark)) g.rotateZ(-0.5);
    G.carpenter = { gold, dark };
  }
  const out = {};
  for (const k in G)
    out[k] = {
      gold: mergeGeometries(G[k].gold, false),
      dark: G[k].dark.length ? mergeGeometries(G[k].dark, false) : null,
    };
  return out;
}

/* ================================================================ FX ==== */
const BLOOD_R = 0.1,
  BLOOD_G = 0.011,
  BLOOD_B = 0.009;
const LIGHT_POOL = 4;

export class FX {
  constructor(scene, camera) {
    this.scene = scene;
    this.camera = camera;
    this.time = 0;
    this.raycast = null; // optional: (origin, dir, range) -> {point, normal} | null   (wall blood)
    this.onSound = null; // optional: (name, pos) -> void   ('shell_drop')
    this.ambient = new THREE.Color(0.012, 0.013, 0.016); // extra ambient for particles (added to scene's)
    this.root = new THREE.Group();
    this.root.name = "fx";
    scene.add(this.root);

    // shared particle lighting uniforms
    this._uCamWorld = { value: camera.matrixWorld };
    this._uAmb = { value: new THREE.Vector3() };
    this._uLP = {
      value: Array.from({ length: 8 }, () => new THREE.Vector4(0, -999, 0, 1)),
    };
    this._uLC = { value: Array.from({ length: 8 }, () => new THREE.Vector3()) };

    // textures
    const tex = (c, srgb) => {
      const t = new THREE.CanvasTexture(c);
      t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
      t.generateMipmaps = true;
      t.minFilter = THREE.LinearMipmapLinearFilter;
      t.anisotropy = 4;
      return t;
    };
    this.texAlpha = tex(buildAlphaAtlas(), false);
    this.texAdd = tex(buildAddAtlas(), false);
    const dc = buildDecalAtlas();
    this.texDecal = tex(dc.col, true);
    this.texDecalN = tex(dc.nrm, false);
    this.texDecalP = tex(dc.prp, false);
    this.texGlow = tex(glowCanvas(), false);

    // particle pools
    this.alpha = new ParticlePool(3000, this.texAlpha, false, this);
    this.add = new ParticlePool(3000, this.texAdd, true, this);
    this.root.add(this.alpha.mesh, this.add.mesh);

    this._initDecals();
    this._initRigid();
    this._initFireballs();
    this._initLights();

    this.emitters = Array.from({ length: 48 }, () => ({
      on: false,
      type: 0,
      x: 0,
      y: 0,
      z: 0,
      dx: 0,
      dy: 0,
      dz: 0,
      t: 0,
      dur: 0,
      acc: 0,
      rate: 0,
      s: 1,
    }));
    this.powerups = [];
    this._puGeos = null;
    this._puMats = null;
    this._lastBloodLand = -1;
    this._camPos = new THREE.Vector3();
    this._camFwd = new THREE.Vector3(0, 0, -1);
    this._lightScan = 0;
    this._sceneLights = [];
    this._sceneAmb = new THREE.Vector3();
    this._ensurePowerups(); // build icon geometry now so the first drop doesn't hitch
  }

  /** Compile every pooled material up front (call once after the level is built) to avoid first-use hitches. */
  prewarm(renderer) {
    const hidden = [];
    this.root.traverse((o) => {
      if (!o.visible) {
        hidden.push(o);
        o.visible = true;
      }
    });
    const tmp = [];
    for (const k of Object.keys(this._puGeos)) {
      const g = this._puGeos[k];
      const m = new THREE.Mesh(g.gold, this._puMats.gold);
      tmp.push(m);
      if (g.dark) tmp.push(new THREE.Mesh(g.dark, this._puMats.dark));
      break;
    }
    const spr = new THREE.Sprite(this._puMats.halo),
      gr = new THREE.Mesh(this._puGround, this._puMats.ground);
    tmp.push(spr, gr);
    for (const m of tmp) this.root.add(m);
    try {
      renderer.compile(this.scene, this.camera);
    } catch (e) {
      /* ignore */
    }
    for (const m of tmp) this.root.remove(m);
    for (const o of hidden) o.visible = false;
  }

  /** deterministic RNG (tests) */
  seed(n) {
    _seed = n | 0;
  }

  /* ------------------------------------------------------------ decals */
  _initDecals() {
    const cap = (this.decalCap = 176);
    this.decalRanges = { bullet: [0, 96], blood: [96, 160], big: [160, 176] };
    this.decalCursor = { bullet: 0, blood: 0, big: 0 };
    const geo = new THREE.PlaneGeometry(1, 1);
    this.aDecal = new THREE.InstancedBufferAttribute(
      new Float32Array(cap * 4),
      4,
    );
    for (let i = 0; i < cap; i++) this.aDecal.array[i * 4 + 1] = -1e6;
    geo.setAttribute("aDecal", this.aDecal);
    const mat = new THREE.MeshStandardMaterial({
      map: this.texDecal,
      normalMap: this.texDecalN,
      roughnessMap: this.texDecalP,
      metalnessMap: this.texDecalP,
      roughness: 1,
      metalness: 1,
      transparent: true,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -4,
      normalScale: new THREE.Vector2(1.3, 1.3),
    });
    const uTime = (this._uDecalTime = { value: 0 });
    mat.onBeforeCompile = (sh) => {
      sh.uniforms.uDecalTime = uTime;
      sh.vertexShader =
        "attribute vec4 aDecal;\nuniform float uDecalTime;\nvarying float vDecalA;\n" +
        sh.vertexShader.replace(
          "#include <uv_vertex>",
          `#include <uv_vertex>
      {
        float f = aDecal.x; vec2 cell = vec2(mod(f, 4.0), floor(f / 4.0 + 0.001));
        vec2 auv = vec2((cell.x + uv.x) * 0.25, 1.0 - (cell.y + 1.0 - uv.y) * 0.25);
        #ifdef USE_MAP
          vMapUv = auv;
        #endif
        #ifdef USE_NORMALMAP
          vNormalMapUv = auv;
        #endif
        #ifdef USE_ROUGHNESSMAP
          vRoughnessMapUv = auv;
        #endif
        #ifdef USE_METALNESSMAP
          vMetalnessMapUv = auv;
        #endif
        float age = uDecalTime - aDecal.y;
        vDecalA = clamp(age / 0.06, 0.0, 1.0) * (1.0 - smoothstep(aDecal.z - 4.0, aDecal.z, age));
      }`,
        );
      sh.fragmentShader =
        "varying float vDecalA;\n" +
        sh.fragmentShader.replace(
          "#include <map_fragment>",
          "#include <map_fragment>\n diffuseColor.a *= vDecalA; if (diffuseColor.a < 0.004) discard;",
        );
    };
    this.decalMesh = new THREE.InstancedMesh(geo, mat, cap);
    this.decalMesh.instanceColor = new THREE.InstancedBufferAttribute(
      new Float32Array(cap * 3).fill(1),
      3,
    );
    _m4.makeScale(0, 0, 0);
    for (let i = 0; i < cap; i++) this.decalMesh.setMatrixAt(i, _m4);
    this.decalMesh.frustumCulled = false;
    this.decalMesh.receiveShadow = true;
    this.decalMesh.renderOrder = 5;
    this.decalMesh.name = "fx.decals";
    this.root.add(this.decalMesh);
  }

  /**
   * decal(pos, normal, kind, size?)
   * kind: 'bullet' | 'bullet_<surface>' | 'blood' | 'blood_drop' | 'blood_wall' | 'scorch' | 'scorch_aether' | 'dirt'
   */
  decal(pos, normal, kind = "bullet", size) {
    let frame,
      range,
      life = 30,
      sz,
      tint = 1,
      rot = rnd() * TAU,
      off = 0.004;
    const n = normal || UP;
    switch (kind) {
      case "bullet":
      case "bullet_concrete":
        frame = DF.bullet_concrete;
        range = "bullet";
        sz = rr(0.09, 0.13);
        break;
      case "bullet_wood":
        frame = DF.bullet_wood;
        range = "bullet";
        sz = rr(0.1, 0.14);
        break;
      case "bullet_metal":
        frame = DF.bullet_metal;
        range = "bullet";
        sz = rr(0.07, 0.1);
        break;
      case "bullet_dirt":
        frame = DF.bullet_dirt;
        range = "bullet";
        sz = rr(0.12, 0.18);
        break;
      case "bullet_sandbag":
        frame = DF.bullet_sandbag;
        range = "bullet";
        sz = rr(0.11, 0.15);
        break;
      case "blood":
        frame = DF.blood0 + ((rnd() * 4) | 0);
        range = "blood";
        sz = rr(0.45, 0.95);
        tint = rr(0.75, 1.15);
        break;
      case "blood_drop":
        frame = rnd() < 0.5 ? DF.blood_drop : DF.blood0 + ((rnd() * 4) | 0);
        range = "blood";
        sz = rr(0.12, 0.26);
        tint = rr(0.8, 1.1);
        break;
      case "blood_wall":
        frame = DF.blood_wall;
        range = "blood";
        sz = rr(0.5, 0.8);
        tint = rr(0.8, 1.1);
        break;
      case "scorch":
        frame = rnd() < 0.5 ? DF.scorch0 : DF.scorch1;
        range = "big";
        sz = rr(2.6, 3.4);
        life = 45;
        off = 0.006;
        break;
      case "scorch_aether":
        frame = DF.scorch_aether;
        range = "big";
        sz = rr(0.9, 1.2);
        life = 30;
        off = 0.006;
        break;
      case "dirt":
        frame = DF.dirt;
        range = "big";
        sz = rr(1.2, 1.5);
        life = 25;
        off = 0.005;
        break;
      default:
        frame = DF.bullet_concrete;
        range = "bullet";
        sz = 0.1;
    }
    if (size) sz = size;
    const [a, b] = this.decalRanges[range];
    const i = a + (this.decalCursor[range]++ % (b - a));
    _q.setFromUnitVectors(ZAX, n);
    if (kind === "blood_wall" && Math.abs(n.y) < 0.9) {
      // align the drips with gravity: local +Y (texture top) -> world up projected on the wall
      _va.set(0, 1, 0).applyQuaternion(_q);
      _vb.set(0, 1, 0).addScaledVector(n, -n.y).normalize();
      _vc.crossVectors(_va, _vb);
      rot = Math.atan2(_vc.dot(n), _va.dot(_vb));
    }
    _q2.setFromAxisAngle(ZAX, rot);
    _q.multiply(_q2);
    _va.copy(pos).addScaledVector(n, off + (i % 7) * 0.0004);
    _m4.compose(_va, _q, _vs.set(sz, sz, 1));
    this.decalMesh.setMatrixAt(i, _m4);
    this.decalMesh.instanceMatrix.needsUpdate = true;
    const A = this.aDecal.array;
    A[i * 4] = frame;
    A[i * 4 + 1] = this.time;
    A[i * 4 + 2] = life;
    A[i * 4 + 3] = 0;
    this.aDecal.needsUpdate = true;
    const ic = this.decalMesh.instanceColor.array;
    ic[i * 3] = tint;
    ic[i * 3 + 1] = tint;
    ic[i * 3 + 2] = tint;
    this.decalMesh.instanceColor.needsUpdate = true;
  }

  _bloodLand(x, z, s) {
    if (this.time - this._lastBloodLand < 0.03 || rnd() > 0.45) return;
    this._lastBloodLand = this.time;
    this.decal(
      _vs.set(x, 0, z),
      UP,
      "blood_drop",
      rr(0.08, 0.2) * clamp(s / 0.03, 0.7, 1.6),
    );
  }

  /* ------------------------------------------------------------ rigid */
  _initRigid() {
    const brass = (this.brassMat = new THREE.MeshStandardMaterial({
      color: 0xc9a14a,
      metalness: 1,
      roughness: 0.3,
      emissive: 0x1a1206,
    }));
    const hull = new THREE.MeshStandardMaterial({
      color: 0x8e1b14,
      metalness: 0,
      roughness: 0.55,
    });
    const lathe = (pts) =>
      new THREE.LatheGeometry(
        pts.map(([r, y]) => new THREE.Vector2(r, y)),
        12,
      );
    // .45 ACP (straight wall, rim groove), 7.92 mm (bottleneck), 12 ga (brass head + red hull)
    const pistol = lathe([
      [0.0001, 0],
      [0.0059, 0],
      [0.006, 0.0012],
      [0.0051, 0.0016],
      [0.0051, 0.0026],
      [0.006, 0.003],
      [0.006, 0.0228],
      [0.0055, 0.0228],
      [0.0052, 0.019],
      [0.0001, 0.019],
    ]);
    const rifle = lathe([
      [0.0001, 0],
      [0.0059, 0],
      [0.006, 0.0012],
      [0.005, 0.0016],
      [0.005, 0.0028],
      [0.006, 0.0032],
      [0.0058, 0.044],
      [0.0046, 0.0485],
      [0.0045, 0.057],
      [0.0038, 0.057],
      [0.0036, 0.05],
      [0.0001, 0.05],
    ]);
    const shotBase = lathe([
      [0.0001, 0],
      [0.0112, 0],
      [0.0113, 0.0015],
      [0.0103, 0.0019],
      [0.0104, 0.014],
      [0.0098, 0.0145],
      [0.0001, 0.0145],
    ]);
    const shotHull = lathe([
      [0.0098, 0.013],
      [0.0102, 0.013],
      [0.0102, 0.065],
      [0.0085, 0.069],
      [0.0001, 0.069],
    ]);
    for (const g of [pistol, rifle, shotBase, shotHull])
      g.translate(
        0,
        g === pistol ? -0.0114 : g === rifle ? -0.0285 : -0.035,
        0,
      );
    const shotgun = mergeGeometries([shotBase, shotHull], true); // group 0 brass head, group 1 red hull
    this.shells = {
      pistol: new RigidPool(pistol, brass, 64, {
        radius: 0.006,
        halfLen: 0.0114,
        life: 10,
        rest: 0.35,
        name: "fx.shell.pistol",
      }),
      rifle: new RigidPool(rifle, brass, 48, {
        radius: 0.006,
        halfLen: 0.0285,
        life: 10,
        rest: 0.3,
        name: "fx.shell.rifle",
      }),
      shotgun: new RigidPool(shotgun, [brass, hull], 24, {
        radius: 0.011,
        halfLen: 0.035,
        life: 10,
        rest: 0.25,
        name: "fx.shell.shotgun",
      }),
    };
    for (const k in this.shells)
      this.shells[k].onBounce = (x, y, z, sp) => {
        if (this.onSound && sp > 1) {
          _vs.set(x, y, z);
          this.onSound("shell_drop", _vs);
        }
      };
    for (const k in this.shells) this.root.add(this.shells[k].mesh);
    // gore / rubble chunks
    const cg = new THREE.IcosahedronGeometry(0.5, 0); // polyhedra are already non-indexed (flat facets)
    const pa = cg.getAttribute("position");
    for (let i = 0; i < pa.count; i++) {
      const x = pa.getX(i),
        y = pa.getY(i),
        z = pa.getZ(i);
      const k =
        0.75 +
        0.5 *
          h2(
            Math.round(x * 10),
            Math.round(y * 10) * 3 + Math.round(z * 10),
            7,
          );
      pa.setXYZ(i, x * k, y * k * 0.7, z * k);
    }
    cg.computeVertexNormals();
    this.chunkMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.55,
      metalness: 0,
    });
    this.chunks = new RigidPool(cg, this.chunkMat, 64, {
      radius: 0.3,
      halfLen: 0.3,
      colored: true,
      life: 7,
      rest: 0.25,
      name: "fx.chunks",
    });
    this.chunks.onFly = (i, x, y, z, vx, vy, vz) => {
      if (this.chunks.kind[i] === 1 && rnd() < 0.5) {
        const o = this.alpha.emit(
          x,
          y,
          z,
          vx * 0.2,
          vy * 0.2,
          vz * 0.2,
          rr(0.6, 1.2),
          rr(0.012, 0.022),
          0.01,
          6 + M_STRETCH,
        );
        this.alpha.col(o, BLOOD_R, BLOOD_G, BLOOD_B, 1);
        this.alpha.phys(o, 9.8, 0.3, STICK);
        this.alpha.d[o + STR] = 0.02;
        this.alpha.d[o + EVT] = 1;
      }
    };
    this.root.add(this.chunks.mesh);
  }

  shell(pos, vel, kind = "pistol") {
    const pool = this.shells[kind] || this.shells.pistol;
    const i = pool.spawn(pos, vel, 1);
    // spin mostly end-over-end
    pool.w[i * 3] = rr(-30, 30);
    pool.w[i * 3 + 1] = rr(-6, 6);
    pool.w[i * 3 + 2] = rr(-30, 30);
  }

  /* ---------------------------------------------------------- fireball */
  _initFireballs() {
    this.fireballs = [];
    const geo = new THREE.IcosahedronGeometry(1, 20);
    for (let i = 0; i < 3; i++) {
      const m = new THREE.Mesh(geo, makeFireballMaterial());
      m.visible = false;
      m.frustumCulled = false;
      m.renderOrder = 11;
      this.root.add(m);
      this.fireballs.push({
        mesh: m,
        t: 0,
        dur: 0,
        scale: 1,
        on: false,
        x: 0,
        y: 0,
        z: 0,
      });
    }
  }

  /* ------------------------------------------------------------ lights */
  _initLights() {
    this.lights = [];
    for (let i = 0; i < LIGHT_POOL; i++) {
      const L = new THREE.PointLight(0xffffff, 0, 16, 2);
      L.castShadow = false;
      L.name = "fx.light";
      this.root.add(L);
      this.lights.push({
        L,
        t: 0,
        dur: 0,
        peak: 0,
        flick: 0,
        on: false,
        shape: 0,
      });
    }
  }
  _pulse(pos, r, g, b, peak, dur, flick = 0, shape = 0, range = 16) {
    let best = this.lights[0],
      bestLeft = 1e9;
    for (const s of this.lights) {
      if (!s.on) {
        best = s;
        bestLeft = -1;
        break;
      }
      const left = (s.dur - s.t) * s.peak;
      if (left < bestLeft) {
        bestLeft = left;
        best = s;
      }
    }
    best.on = true;
    best.t = 0;
    best.dur = dur;
    best.peak = peak;
    best.flick = flick;
    best.shape = shape;
    best.L.position.copy(pos);
    best.L.color.setRGB(r, g, b);
    best.L.distance = range;
  }

  /* ------------------------------------------------------------ emitters */
  _emitter(type, pos, dur, rate, dir, s = 1) {
    let e = null;
    for (const x of this.emitters)
      if (!x.on) {
        e = x;
        break;
      }
    if (!e) return null;
    e.on = true;
    e.type = type;
    e.x = pos.x;
    e.y = pos.y;
    e.z = pos.z;
    e.t = 0;
    e.dur = dur;
    e.rate = rate;
    e.acc = 0;
    e.s = s;
    if (dir) {
      e.dx = dir.x;
      e.dy = dir.y;
      e.dz = dir.z;
    } else {
      e.dx = 0;
      e.dy = 1;
      e.dz = 0;
    }
    return e;
  }

  /* ============================================================ EFFECTS */

  blood(pos, dir, amount = 1) {
    const A = this.alpha,
      am = clamp(amount, 0.2, 3);
    _va.copy(dir || UP);
    if (_va.lengthSq() < 1e-6) _va.set(0, 0, 1);
    _va.normalize();
    const dx = _va.x,
      dy = _va.y,
      dz = _va.z;
    // droplet spray cone
    const nd = Math.round(26 * am);
    for (let i = 0; i < nd; i++) {
      const sp = rr(0.8, 3.8) * (0.75 + 0.25 * am);
      const cx = dx + rr(-0.45, 0.45),
        cy = dy + rr(-0.2, 0.6),
        cz = dz + rr(-0.45, 0.45);
      const s = rr(0.008, 0.028);
      const o = A.emit(
        pos.x,
        pos.y,
        pos.z,
        cx * sp,
        cy * sp,
        cz * sp,
        rr(0.7, 1.6),
        s,
        s * 0.85,
        6 + M_STRETCH,
      );
      A.col(o, BLOOD_R * rr(0.7, 1.2), BLOOD_G, BLOOD_B, 1);
      A.phys(o, 9.8, rr(0.2, 1.2), STICK);
      A.fade(o, 0.0, 0.85);
      A.d[o + STR] = 0.012;
      A.d[o + EVT] = 1;
    }
    // heavier clumps
    for (let i = 0; i < Math.round(4 * am); i++) {
      const sp = rr(1, 3);
      const o = A.emit(
        pos.x,
        pos.y,
        pos.z,
        (dx + rr(-0.3, 0.3)) * sp,
        (dy + rr(0, 0.6)) * sp,
        (dz + rr(-0.3, 0.3)) * sp,
        rr(0.5, 1.0),
        rr(0.05, 0.09),
        0.08,
        10,
      );
      A.col(o, BLOOD_R * 0.9, BLOOD_G, BLOOD_B, 1);
      A.phys(o, 9.8, 0.5, STICK);
      A.fade(o, 0, 0.7);
      A.d[o + SPIN] = rr(-4, 4);
      A.d[o + EVT] = 1;
    }
    // mist
    for (let i = 0; i < Math.round(5 * am); i++) {
      const sp = rr(0.4, 1.6);
      const o = A.emit(
        pos.x + rr(-0.05, 0.05),
        pos.y + rr(-0.05, 0.05),
        pos.z + rr(-0.05, 0.05),
        (dx + rr(-0.5, 0.5)) * sp,
        (dy + rr(-0.2, 0.5)) * sp,
        (dz + rr(-0.5, 0.5)) * sp,
        rr(0.5, 1.0),
        rr(0.12, 0.22),
        rr(0.5, 0.85) * (0.7 + 0.3 * am),
        5,
      );
      A.col(o, 0.1, 0.02, 0.016, rr(0.3, 0.5));
      A.phys(o, 0.3, 3.2);
      A.fade(o, 0.06, 0.15);
      A.d[o + SPIN] = rr(-1, 1);
      A.d[o + SPOW] = 2.5;
      A.d[o + SOFT] = 0.15;
    }
    // drips off the wound
    this._emitter(3, pos, 0.5 * am, 10, null, am);
    // splat on floor below / ahead
    if (rnd() < 0.55 * am && pos.y < 2.2) {
      _vb.set(pos.x + dx * rr(0.2, 0.8), 0, pos.z + dz * rr(0.2, 0.8));
      this.decal(_vb, UP, "blood", rr(0.4, 0.8) * (0.7 + 0.3 * am));
    }
    if (this.raycast && rnd() < 0.6 * am) {
      const hit = this.raycast(pos, _va, 2.6);
      if (hit && hit.normal && Math.abs(hit.normal.y) < 0.7)
        this.decal(hit.point, hit.normal, "blood_wall");
    }
  }

  impact(pos, normal, surface = "concrete") {
    const A = this.alpha,
      D = this.add;
    const n = normal || UP;
    const nx = n.x,
      ny = n.y,
      nz = n.z;
    const x = pos.x + nx * 0.01,
      y = pos.y + ny * 0.01,
      z = pos.z + nz * 0.01;
    const burst = (r, g, b, a, sz) => {
      // instant fast-expanding puff so the hit reads on frame 1
      for (let k = 0; k < 2; k++) {
        const o = A.emit(
          x + nx * 0.03,
          y + ny * 0.03,
          z + nz * 0.03,
          nx * rr(1.5, 3),
          ny * rr(1.5, 3),
          nz * rr(1.5, 3),
          rr(0.35, 0.55),
          sz * 0.4,
          sz * rr(1.1, 1.5),
          4 + k * 8,
        );
        A.col(o, r * 0.6, g * 0.6, b * 0.6, a * 0.6);
        A.phys(o, 0, 7);
        A.d[o + SPOW] = 4;
        A.fade(o, 0, 0.15);
        A.d[o + SPIN] = rr(-2, 2);
      }
    };
    const hemi = (sp, spread) => {
      _vc
        .set(
          nx + rr(-spread, spread),
          ny + rr(-spread, spread),
          nz + rr(-spread, spread),
        )
        .normalize()
        .multiplyScalar(sp);
      return _vc;
    };
    switch (surface) {
      case "flesh":
        this.blood(pos, n, 0.6);
        return;
      case "metal": {
        for (let i = 0; i < 16; i++) {
          const v = hemi(rr(3, 10), 0.9);
          const o = D.emit(
            x,
            y,
            z,
            v.x,
            v.y,
            v.z,
            rr(0.18, 0.6),
            rr(0.007, 0.012),
            0.005,
            1 + M_STRETCH,
          );
          D.col(o, 1, 1, 1, 1);
          D.d[o + RAMP] = 2;
          D.phys(o, 9.8, 1.2, 0.35);
          D.d[o + STR] = 0.03;
          D.fade(o, 0, 0.5);
          D.d[o + EM] = 0.5;
        }
        let o = D.emit(x, y, z, 0, 0, 0, 0.05, 0.18, 0.26, 7);
        D.col(o, 5, 3.8, 2.4, 1);
        D.fade(o, 0, 0.2);
        o = D.emit(x, y, z, 0, 0, 0, 0.07, 0.16, 0.22, 0);
        D.col(o, 2, 1.2, 0.5, 1);
        D.fade(o, 0, 0.1);
        o = A.emit(
          x,
          y,
          z,
          nx * 0.4,
          ny * 0.4 + 0.1,
          nz * 0.4,
          rr(0.7, 1.1),
          0.06,
          0.28,
          4,
        );
        A.col(o, 0.3, 0.3, 0.3, 0.35);
        A.phys(o, -0.1, 2);
        A.d[o + SPOW] = 2;
        _va.set(x, y, z);
        if (rnd() < 0.5) this._pulse(_va, 1, 0.7, 0.4, 3, 0.06, 0, 0, 5);
        this.decal(pos, n, "bullet_metal");
        return;
      }
      case "wood": {
        for (let i = 0; i < 9; i++) {
          const v = hemi(rr(2, 5.5), 0.8);
          const o = A.emit(
            x,
            y,
            z,
            v.x,
            v.y,
            v.z,
            rr(0.8, 1.6),
            rr(0.02, 0.05),
            0.04,
            8,
          );
          A.col(o, 0.55, 0.38, 0.22, 1);
          A.phys(o, 9.8, 0.6, 0.3);
          A.d[o + SPIN] = rr(-18, 18);
          A.fade(o, 0, 0.8);
        }
        for (let i = 0; i < 3; i++) {
          const v = hemi(rr(0.3, 1.2), 0.4);
          const o = A.emit(
            x,
            y,
            z,
            v.x,
            v.y,
            v.z,
            rr(0.8, 1.4),
            rr(0.05, 0.1),
            rr(0.3, 0.5),
            4,
          );
          A.col(o, 0.36, 0.27, 0.18, 0.5);
          A.phys(o, 0.2, 2.5);
          A.d[o + SPOW] = 2.5;
          A.fade(o, 0.08, 0.25);
        }
        burst(0.33, 0.25, 0.17, 0.55, 0.22);
        this.decal(pos, n, "bullet_wood");
        return;
      }
      case "dirt":
      case "sandbag": {
        const sand = surface === "sandbag";
        const cr = sand ? 0.5 : 0.28,
          cg = sand ? 0.42 : 0.21,
          cb = sand ? 0.3 : 0.14;
        for (let i = 0; i < (sand ? 16 : 10); i++) {
          const v = hemi(rr(1.2, 4.5), 0.6);
          v.y += rr(0.5, 2);
          const o = A.emit(
            x,
            y,
            z,
            v.x,
            v.y,
            v.z,
            rr(0.6, 1.3),
            sand ? rr(0.02, 0.05) : rr(0.02, 0.045),
            0.03,
            sand ? 13 : 9,
          );
          A.col(o, cr, cg, cb, 1);
          A.phys(o, 9.8, 0.4, DIE);
          A.d[o + SPIN] = rr(-8, 8);
          A.fade(o, 0, 0.85);
        }
        for (let i = 0; i < 4; i++) {
          const v = hemi(rr(0.3, 1.4), 0.5);
          const o = A.emit(
            x,
            y,
            z,
            v.x,
            v.y + 0.2,
            v.z,
            rr(1.2, 2.2),
            rr(0.06, 0.12),
            rr(0.4, 0.75),
            4,
          );
          A.col(o, cr * 0.9, cg * 0.9, cb * 0.9, 0.55);
          A.phys(o, 0.25, 2.2);
          A.d[o + SPOW] = 3;
          A.fade(o, 0.06, 0.3);
          A.d[o + SOFT] = 0.2;
        }
        burst(cr, cg, cb, 0.6, 0.26);
        this.decal(pos, n, sand ? "bullet_sandbag" : "bullet_dirt");
        return;
      }
      default: {
        // concrete / brick / plaster
        for (let i = 0; i < 10; i++) {
          const v = hemi(rr(2, 6), 0.75);
          const o = A.emit(
            x,
            y,
            z,
            v.x,
            v.y,
            v.z,
            rr(0.6, 1.4),
            rr(0.012, 0.03),
            0.02,
            rnd() < 0.5 ? 7 : 15,
          );
          const g = rr(0.28, 0.45);
          A.col(o, g, g * 0.97, g * 0.93, 1);
          A.phys(o, 9.8, 0.5, 0.3);
          A.d[o + SPIN] = rr(-15, 15);
          A.fade(o, 0, 0.8);
        }
        for (let i = 0; i < 5; i++) {
          const v = hemi(rr(0.25, 1.5), 0.5);
          const o = A.emit(
            x,
            y,
            z,
            v.x,
            v.y + 0.1,
            v.z,
            rr(1.2, 2.2),
            rr(0.05, 0.1),
            rr(0.35, 0.7),
            rnd() < 0.5 ? 4 : 12,
          );
          A.col(o, 0.45, 0.43, 0.4, rr(0.4, 0.6));
          A.phys(o, 0.15, 2.4);
          A.d[o + SPOW] = 3;
          A.fade(o, 0.05, 0.3);
          A.d[o + SPIN] = rr(-0.8, 0.8);
          A.d[o + SOFT] = 0.2;
        }
        if (rnd() < 0.5)
          for (let i = 0; i < 3; i++) {
            const v = hemi(rr(2, 5), 0.8);
            const o = D.emit(
              x,
              y,
              z,
              v.x,
              v.y,
              v.z,
              rr(0.08, 0.2),
              0.007,
              0.005,
              1 + M_STRETCH,
            );
            D.col(o, 1, 1, 1, 1);
            D.d[o + RAMP] = 2;
            D.phys(o, 9.8, 1, DIE);
            D.d[o + STR] = 0.028;
          }
        burst(0.42, 0.41, 0.39, 0.6, 0.24);
        this.decal(pos, n, "bullet_concrete");
      }
    }
  }

  tracer(from, to, color) {
    const D = this.add;
    _va.subVectors(to, from);
    const dist = _va.length();
    if (dist < 0.5) return;
    _va.divideScalar(dist);
    const sp = 260;
    const o = D.emit(
      from.x + _va.x * 1.2,
      from.y + _va.y * 1.2,
      from.z + _va.z * 1.2,
      _va.x * sp,
      _va.y * sp,
      _va.z * sp,
      Math.max(0.02, (dist - 1.2) / sp),
      0.02,
      0.02,
      1 + M_STRETCH,
    );
    if (color && color.isColor)
      D.col(o, color.r * 6, color.g * 6, color.b * 6, 0.9);
    else D.col(o, 6, 3.6, 1.6, 0.9);
    D.d[o + STR] = 0.008;
    D.fade(o, 0, 1.0);
  }

  muzzleWorld(pos, dir) {
    this._pulse(pos, 1, 0.66, 0.35, 12, 0.06, 0, 0, 8);
    const D = this.add;
    const o = D.emit(pos.x, pos.y, pos.z, 0, 0, 0, 0.05, 0.25, 0.35, 0);
    D.col(o, 6, 3.5, 1.4, 1);
    D.fade(o, 0, 0.3);
    if (dir) {
      const A = this.alpha;
      const s = A.emit(
        pos.x,
        pos.y,
        pos.z,
        dir.x * 1.2,
        dir.y * 1.2 + 0.2,
        dir.z * 1.2,
        0.7,
        0.06,
        0.3,
        4,
      );
      A.col(s, 0.5, 0.5, 0.5, 0.25);
      A.phys(s, -0.2, 2.5);
      A.d[s + SPOW] = 2;
    }
  }

  explosion(pos, scale = 1) {
    const A = this.alpha,
      D = this.add,
      s = scale;
    const x = pos.x,
      y = Math.max(pos.y, 0.05),
      z = pos.z;
    // core flash + flare
    let o = D.emit(x, y + 0.3 * s, z, 0, 0, 0, 0.14, 1.6 * s, 3.2 * s, 0);
    D.col(o, 4, 3, 2, 1);
    D.fade(o, 0, 0.1);
    o = D.emit(x, y + 0.3 * s, z, 0, 0, 0, 0.1, 2.4 * s, 3.6 * s, 8);
    D.col(o, 1.6, 1.1, 0.6, 1);
    D.fade(o, 0, 0.2);
    // noise-shaded fireball
    const fb = this.fireballs.find((f) => !f.on) || this.fireballs[0];
    fb.on = true;
    fb.t = 0;
    fb.dur = 1.1;
    fb.scale = s;
    fb.x = x;
    fb.y = y + 0.35 * s;
    fb.z = z;
    fb.mesh.material.uniforms.uSeed.value = rnd() * 50;
    fb.mesh.visible = true;
    // fire puffs
    for (let i = 0; i < 26; i++) {
      _va.set(rr(-1, 1), rr(0.15, 1.2), rr(-1, 1)).normalize();
      const sp = rr(3, 9) * s;
      o = D.emit(
        x + _va.x * 0.3 * s,
        y + 0.3 * s + _va.y * 0.3 * s,
        z + _va.z * 0.3 * s,
        _va.x * sp,
        _va.y * sp * 0.8,
        _va.z * sp,
        rr(0.45, 1.0),
        rr(0.5, 0.9) * s,
        rr(1.3, 2.2) * s,
        2 + ((rnd() * 4) | 0),
      );
      D.col(o, rr(0.8, 1.1), 1, 1, rr(0.35, 0.6));
      D.d[o + RAMP] = 1;
      D.phys(o, -1.5, 4.5);
      D.d[o + SPIN] = rr(-2, 2);
      D.fade(o, 0.02, 0.35);
      D.d[o + SPOW] = 3;
      D.d[o + SOFT] = 0.4 * s;
      D.d[o + EM] = 0.25;
    }
    // smoke — dark, billowing, fire-lit underside early
    for (let i = 0; i < 26; i++) {
      _va.set(rr(-1, 1), rr(0.1, 1.3), rr(-1, 1)).normalize();
      const sp = rr(1.5, 5) * s;
      o = A.emit(
        x + _va.x * 0.5 * s,
        y + 0.4 * s + _va.y * 0.4 * s,
        z + _va.z * 0.5 * s,
        _va.x * sp,
        _va.y * sp * 0.7 + 0.5,
        _va.z * sp,
        rr(3.5, 6.5),
        rr(0.8, 1.3) * s,
        rr(2.6, 4.2) * s,
        (rnd() * 4) | 0,
      );
      const g = rr(0.05, 0.1);
      A.col(o, g, g * 0.95, g * 0.9, rr(0.7, 0.9));
      A.phys(o, -0.45, 1.6);
      A.d[o + SPIN] = rr(-0.5, 0.5);
      A.fade(o, 0.03, 0.4);
      A.d[o + SPOW] = 3;
      A.d[o + EM] = rr(0.6, 1.2);
      A.d[o + SOFT] = 0.5 * s;
      A.d[o + TURB] = 0.6;
    }
    this._emitter(1, _va.set(x, y + 0.6 * s, z), 1.4, 16, null, s); // rising smoke column
    // ground dust ring
    for (let i = 0; i < 18; i++) {
      const a = (i / 18) * TAU + rr(-0.15, 0.15),
        sp = rr(5, 8) * s;
      o = A.emit(
        x + Math.cos(a) * 0.4,
        0.25 * s,
        z + Math.sin(a) * 0.4,
        Math.cos(a) * sp,
        rr(0.2, 0.8),
        Math.sin(a) * sp,
        rr(1.8, 3.2),
        0.5 * s,
        rr(1.8, 2.6) * s,
        4,
      );
      A.col(o, 0.17, 0.155, 0.14, 0.55);
      A.phys(o, -0.1, 2.6);
      A.d[o + SPOW] = 3;
      A.fade(o, 0.03, 0.35);
      A.d[o + SOFT] = 0.35 * s;
    }
    // sparks
    for (let i = 0; i < 46; i++) {
      _va.set(rr(-1, 1), rr(0.1, 1.5), rr(-1, 1)).normalize();
      const sp = rr(6, 20) * s;
      o = D.emit(
        x,
        y + 0.3 * s,
        z,
        _va.x * sp,
        _va.y * sp,
        _va.z * sp,
        rr(0.5, 1.6),
        rr(0.01, 0.02),
        0.006,
        1 + M_STRETCH,
      );
      D.col(o, 1, 1, 1, 1);
      D.d[o + RAMP] = 2;
      D.phys(o, 9.8, 1.2, 0.35);
      D.d[o + STR] = 0.022;
      D.fade(o, 0, 0.6);
      D.d[o + EM] = 0.6;
    }
    // dark debris flecks + rubble chunks
    for (let i = 0; i < 22; i++) {
      _va.set(rr(-1, 1), rr(0.4, 1.6), rr(-1, 1)).normalize();
      const sp = rr(4, 11) * s;
      o = A.emit(
        x,
        y + 0.2,
        z,
        _va.x * sp,
        _va.y * sp,
        _va.z * sp,
        rr(0.8, 1.8),
        rr(0.03, 0.07),
        0.05,
        rnd() < 0.5 ? 7 : 14,
      );
      A.col(o, 0.12, 0.11, 0.1, 1);
      A.phys(o, 9.8, 0.4, 0.25);
      A.d[o + SPIN] = rr(-15, 15);
      A.fade(o, 0, 0.85);
    }
    for (let i = 0; i < 8; i++) {
      _va
        .set(rr(-1, 1), rr(0.6, 1.8), rr(-1, 1))
        .normalize()
        .multiplyScalar(rr(3, 8) * s);
      const g = rr(0.2, 0.35);
      this.chunks.spawn(
        _vb.set(x, y + 0.2, z),
        _va,
        rr(0.05, 0.11),
        0,
        g,
        g * 0.95,
        g * 0.9,
      );
    }
    // shockwave: ground ring + air ring
    o = D.emit(x, 0.03, z, 0, 0, 0, 0.45, 0.6 * s, 9 * s, 12 + M_FLAT);
    D.col(o, 1.1, 0.7, 0.4, 1);
    D.fade(o, 0, 0.1);
    D.d[o + SPOW] = 2.5;
    o = D.emit(x, y + 0.5 * s, z, 0, 0, 0, 0.3, 0.5 * s, 7 * s, 6);
    D.col(o, 0.45, 0.35, 0.28, 0.6);
    D.fade(o, 0, 0.2);
    D.d[o + SPOW] = 2;
    // lingering embers
    for (let i = 0; i < 24; i++) {
      o = D.emit(
        x + rr(-1, 1) * s,
        y + rr(0.2, 1.5) * s,
        z + rr(-1, 1) * s,
        rr(-1, 1),
        rr(0.5, 2.5),
        rr(-1, 1),
        rr(1.5, 3.5),
        rr(0.02, 0.04),
        0.01,
        10,
      );
      D.col(o, 1, 1, 1, 1);
      D.d[o + RAMP] = 2;
      D.phys(o, -0.4, 0.8);
      D.d[o + TURB] = 6;
      D.fade(o, 0.05, 0.6);
    }
    _vb.set(x, 0, z);
    this.decal(_vb, UP, "scorch", 3 * s * rr(0.9, 1.1));
    this._pulse(
      _va.set(x, y + 1, z),
      1,
      0.55,
      0.22,
      70 * s,
      0.75,
      0.3,
      1,
      16 * s,
    );
  }

  aetherImpact(pos) {
    const A = this.alpha,
      D = this.add;
    const x = pos.x,
      y = pos.y,
      z = pos.z;
    let o = D.emit(x, y, z, 0, 0, 0, 0.16, 0.6, 1.6, 0);
    D.col(o, 0.9, 2.6, 1.0, 1);
    D.fade(o, 0, 0.1);
    o = D.emit(x, y, z, 0, 0, 0, 0.12, 0.9, 1.8, 8);
    D.col(o, 0.5, 1.5, 0.6, 1);
    D.fade(o, 0, 0.15);
    for (let i = 0; i < 9; i++) {
      o = D.emit(
        x + rr(-0.1, 0.1),
        y + rr(-0.1, 0.1),
        z + rr(-0.1, 0.1),
        rr(-1.5, 1.5),
        rr(-0.5, 2),
        rr(-1.5, 1.5),
        rr(0.35, 0.7),
        rr(0.25, 0.4),
        rr(0.8, 1.4),
        9,
      );
      D.col(o, 0.3, 0.3, 0.3, 1);
      D.d[o + RAMP] = 3;
      D.phys(o, -0.5, 3);
      D.d[o + SPIN] = rr(-6, 6);
      D.fade(o, 0.05, 0.3);
      D.d[o + SPOW] = 2;
      D.d[o + EM] = 0.4;
    }
    for (let i = 0; i < 34; i++) {
      _va.set(rr(-1, 1), rr(-0.4, 1.2), rr(-1, 1)).normalize();
      const sp = rr(3, 12);
      o = D.emit(
        x,
        y,
        z,
        _va.x * sp,
        _va.y * sp,
        _va.z * sp,
        rr(0.25, 0.8),
        rr(0.008, 0.016),
        0.005,
        (rnd() < 0.3 ? 13 : 1) + M_STRETCH,
      );
      D.col(o, 1, 1, 1, 1);
      D.d[o + RAMP] = 3;
      D.phys(o, 4, 2.2, 0.3);
      D.d[o + STR] = 0.02;
      D.fade(o, 0, 0.5);
      D.d[o + EM] = 0.5;
    }
    o = D.emit(x, y, z, 0, 0, 0, 0.35, 0.3, 2.6, 6);
    D.col(o, 0.35, 1.2, 0.45, 1);
    D.fade(o, 0, 0.1);
    D.d[o + SPOW] = 2.5;
    if (y < 1.2) {
      o = D.emit(x, 0.03, z, 0, 0, 0, 0.5, 0.3, 4.5, 12 + M_FLAT);
      D.col(o, 0.3, 1.1, 0.4, 1);
      D.fade(o, 0, 0.2);
      D.d[o + SPOW] = 2.5;
    }
    for (let i = 0; i < 14; i++) {
      o = D.emit(
        x + rr(-0.5, 0.5),
        y + rr(-0.3, 0.5),
        z + rr(-0.5, 0.5),
        rr(-0.3, 0.3),
        rr(0.2, 0.9),
        rr(-0.3, 0.3),
        rr(0.8, 1.8),
        rr(0.03, 0.06),
        0.01,
        7,
      );
      D.col(o, 0.6, 2.2, 0.8, 1);
      D.phys(o, -0.2, 1);
      D.d[o + TURB] = 3;
      D.fade(o, 0.1, 0.5);
      D.d[o + SPIN] = rr(-2, 2);
    }
    o = A.emit(x, y, z, 0, 0.3, 0, 1.4, 0.3, 1.2, 4);
    A.col(o, 0.2, 0.28, 0.22, 0.35);
    A.phys(o, -0.2, 1.5);
    A.d[o + SPOW] = 3;
    A.d[o + SOFT] = 0.2;
    _vb.set(x, 0, z);
    if (y < 0.6) this.decal(_vb, UP, "scorch_aether");
    this._pulse(_va.set(x, y + 0.2, z), 0.35, 1, 0.4, 22, 0.5, 0.2, 1, 10);
  }

  dirtBurst(pos) {
    const A = this.alpha;
    const x = pos.x,
      z = pos.z;
    for (let i = 0; i < 18; i++) {
      const a = rnd() * TAU,
        r = rr(0, 0.35),
        sp = rr(0.5, 2);
      const o = A.emit(
        x + Math.cos(a) * r,
        0.05,
        z + Math.sin(a) * r,
        Math.cos(a) * sp,
        rr(2, 4.5),
        Math.sin(a) * sp,
        rr(0.9, 1.6),
        rr(0.035, 0.08),
        0.05,
        9,
      );
      const g = rr(0.6, 1.0);
      A.col(o, 0.11 * g, 0.08 * g, 0.055 * g, 1);
      A.phys(o, 9.8, 0.3, 0.2);
      A.d[o + SPIN] = rr(-8, 8);
      A.fade(o, 0, 0.9);
    }
    for (let i = 0; i < 10; i++) {
      const a = rnd() * TAU,
        r = rr(0, 0.4);
      const o = A.emit(
        x + Math.cos(a) * r,
        0.15,
        z + Math.sin(a) * r,
        Math.cos(a) * rr(0.3, 0.9),
        rr(0.3, 1.1),
        Math.sin(a) * rr(0.3, 0.9),
        rr(1.8, 3),
        rr(0.2, 0.35),
        rr(0.8, 1.3),
        rnd() < 0.5 ? 4 : 12,
      );
      A.col(o, 0.16, 0.13, 0.095, 0.4);
      A.phys(o, 0.05, 1.3);
      A.d[o + SPOW] = 2.5;
      A.fade(o, 0.08, 0.35);
      A.d[o + SOFT] = 0.25;
      A.d[o + TURB] = 0.5;
    }
    this._emitter(2, pos, 1.3, 14);
    _vb.set(x, 0, z);
    this.decal(_vb, UP, "dirt");
  }

  gib(pos, dir, kind = "head") {
    const d = dir || UP;
    for (let i = 0; i < 10; i++) {
      _va
        .set(d.x * 1.5 + rr(-1, 1), rr(1.5, 3.5), d.z * 1.5 + rr(-1, 1))
        .multiplyScalar(rr(0.8, 1.4));
      const bone = rnd() < 0.45;
      const k = rr(0.8, 1.1);
      this.chunks.spawn(
        pos,
        _va,
        rr(0.025, 0.06),
        bone ? 0 : 1,
        bone ? 0.62 * k : 0.28 * k,
        bone ? 0.55 * k : 0.035 * k,
        bone ? 0.42 * k : 0.03 * k,
      );
    }
    this.blood(pos, d, 1.6);
    this.blood(pos, UP, 1.0);
    this._emitter(4, pos, 0.9, 60); // fountain from the neck
    this.decal(
      _vb.set(pos.x + d.x * 0.4, 0, pos.z + d.z * 0.4),
      UP,
      "blood",
      rr(0.8, 1.1),
    );
  }

  powerupGrab(pos) {
    const D = this.add;
    const y = pos.y + 0.8;
    let o = D.emit(pos.x, y, pos.z, 0, 0, 0, 0.35, 0.5, 2.0, 8);
    D.col(o, 0.25, 0.25, 0.25, 1);
    D.d[o + RAMP] = 4;
    D.fade(o, 0, 0.2);
    o = D.emit(pos.x, y, pos.z, 0, 0, 0, 0.25, 0.8, 1.6, 0);
    D.col(o, 0.2, 0.2, 0.2, 1);
    D.d[o + RAMP] = 4;
    D.fade(o, 0, 0.1);
    o = D.emit(pos.x, y, pos.z, 0, 0, 0, 0.4, 0.2, 2.4, 6);
    D.col(o, 0.4, 0.65, 0.25, 1);
    D.fade(o, 0, 0.2);
    D.d[o + SPOW] = 2.5;
    for (let i = 0; i < 30; i++) {
      _va.set(rr(-1, 1), rr(-0.6, 1.2), rr(-1, 1)).normalize();
      const sp = rr(1.5, 4.5);
      o = D.emit(
        pos.x,
        y,
        pos.z,
        _va.x * sp,
        _va.y * sp,
        _va.z * sp,
        rr(0.5, 1.1),
        rr(0.06, 0.12),
        0.02,
        7,
      );
      D.col(o, 0.45, 0.45, 0.45, 1);
      D.d[o + RAMP] = 4;
      D.phys(o, 1.5, 2.5);
      D.fade(o, 0, 0.4);
      D.d[o + SPIN] = rr(-3, 3);
    }
    this._pulse(_va.set(pos.x, y, pos.z), 0.7, 1, 0.45, 18, 0.45, 0, 1, 8);
  }

  nukeFlash() {
    const c = this.camera;
    c.getWorldPosition(_va);
    _va.y += 3;
    this._pulse(_va, 1, 0.92, 0.8, 4000, 1.4, 0.1, 1, 60);
    c.getWorldDirection(_vb);
    const D = this.add;
    const o = D.emit(
      _va.x + _vb.x * 30,
      _va.y + 6,
      _va.z + _vb.z * 30,
      0,
      0,
      0,
      0.9,
      30,
      60,
      0,
    );
    D.col(o, 10, 9, 7, 1);
    D.fade(o, 0, 0.1);
  }

  embers(pos) {
    const e = this._emitter(0, pos, 1e9, 13);
    return {
      stop: () => {
        if (e) e.on = false;
      },
    };
  }

  /* ---------------------------------------------------------- power-ups */
  _ensurePowerups() {
    if (this._puGeos) return;
    this._puGeos = buildPowerupGeos();
    const rim = { value: new THREE.Color(0.45, 1.4, 0.35) },
      pulse = (this._puPulse = { value: 1 });
    const inject = (m) => {
      m.onBeforeCompile = (sh) => {
        sh.uniforms.uRim = rim;
        sh.uniforms.uPulse = pulse;
        sh.fragmentShader =
          "uniform vec3 uRim; uniform float uPulse;\n" +
          sh.fragmentShader.replace(
            "#include <emissivemap_fragment>",
            "#include <emissivemap_fragment>\n totalEmissiveRadiance += uRim * pow(1.0 - clamp(dot(normal, normalize(vViewPosition)), 0.0, 1.0), 2.2) * uPulse;",
          );
      };
      return m;
    };
    this._puMats = {
      gold: inject(
        new THREE.MeshStandardMaterial({
          color: 0xe0b850,
          metalness: 0.85,
          roughness: 0.28,
          emissive: 0xa07818,
          emissiveIntensity: 0.55,
        }),
      ),
      dark: inject(
        new THREE.MeshStandardMaterial({
          color: 0x3a2a0c,
          metalness: 0.6,
          roughness: 0.5,
          emissive: 0x1a2a05,
          emissiveIntensity: 0.6,
        }),
      ),
      halo: new THREE.SpriteMaterial({
        map: this.texGlow,
        color: new THREE.Color(0.4, 1.1, 0.25),
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        transparent: true,
      }),
      ground: new THREE.MeshBasicMaterial({
        map: this.texGlow,
        color: new THREE.Color(0.35, 1.0, 0.25),
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        transparent: true,
      }),
    };
    this._puGround = new THREE.PlaneGeometry(1.4, 1.4).rotateX(-Math.PI / 2);
  }

  spawnPowerup(type, pos) {
    this._ensurePowerups();
    const G = this._puGeos[type] || this._puGeos.maxammo;
    const group = new THREE.Group();
    group.name = "powerup." + type;
    group.position.set(pos.x, pos.y, pos.z);
    const model = new THREE.Group();
    const gm = new THREE.Mesh(G.gold, this._puMats.gold);
    gm.castShadow = false;
    model.add(gm);
    if (G.dark) model.add(new THREE.Mesh(G.dark, this._puMats.dark));
    const sc =
      type === "doublepoints" ? 1.5 : type === "instakill" ? 1.45 : 1.3;
    model.scale.setScalar(sc);
    model.position.y = 0.8;
    const halo = new THREE.Sprite(this._puMats.halo);
    halo.scale.set(1.25, 1.25, 1);
    halo.position.y = 0.8;
    halo.renderOrder = 13;
    const ground = new THREE.Mesh(this._puGround, this._puMats.ground);
    ground.position.y = 0.02;
    ground.renderOrder = 6;
    group.add(model, halo, ground);
    this.root.add(group);
    const h = {
      object: group,
      type,
      age: 0,
      pos: group.position,
      _model: model,
      _halo: halo,
      _acc: 0,
      _phase: rnd() * TAU,
      _fx: this,
      dispose: () => {
        const i = this.powerups.indexOf(h);
        if (i >= 0) this.powerups.splice(i, 1);
        this.root.remove(group);
      },
    };
    this.powerups.push(h);
    return h;
  }

  /* ============================================================ UPDATE */
  update(dt) {
    dt = Math.min(Math.max(dt || 0, 0), 0.05);
    this.time += dt;
    this._uDecalTime.value = this.time;
    const cam = this.camera;
    const e = cam.matrixWorld.elements;
    this._camPos.set(e[12], e[13], e[14]);
    this._camFwd.set(-e[8], -e[9], -e[10]).normalize();

    this._runEmitters(dt);

    // fireballs
    for (const f of this.fireballs) {
      if (!f.on) continue;
      f.t += dt;
      const t = f.t / f.dur;
      if (t >= 1) {
        f.on = false;
        f.mesh.visible = false;
        continue;
      }
      const u = f.mesh.material.uniforms;
      const grow = 1 - Math.pow(1 - Math.min(1, f.t / 0.32), 3);
      f.mesh.scale.setScalar(f.scale * (0.35 + 1.25 * grow + t * 0.4));
      f.mesh.position.set(f.x, f.y + t * 0.9 * f.scale, f.z);
      u.uTime.value = f.t * 1.5;
      u.uHeat.value = 0.98 * Math.pow(1 - t, 1.8);
      u.uErode.value = -0.2 + Math.pow(t, 1.25) * 1.25;
      u.uAmp.value = 0.4 + 0.15 * t;
      // fade out when the camera gets close to / inside the shell (avoids faceted lobes filling the view)
      const rad = f.mesh.scale.x * 1.3,
        cd = this._camPos.distanceTo(f.mesh.position);
      u.uOpacity.value =
        (1 - sstep(0.5, 1, t)) * sstep(rad * 1.05, rad * 1.9, cd);
    }

    // lights
    for (const s of this.lights) {
      if (!s.on) {
        s.L.intensity = 0;
        continue;
      }
      s.t += dt;
      if (s.t >= s.dur) {
        s.on = false;
        s.L.intensity = 0;
        continue;
      }
      const k = s.t / s.dur;
      let I = s.shape === 1 ? Math.pow(1 - k, 2.2) : 1 - k;
      if (s.flick > 0) I *= 1 - s.flick * rnd();
      s.L.intensity = s.peak * I;
    }

    // power-ups
    if (this.powerups.length) {
      this._puPulse.value = 0.8 + 0.25 * Math.sin(this.time * 5);
      for (const h of this.powerups) {
        h.age += dt;
        if (h.type === "doublepoints" || h.type === "instakill")
          h._model.rotation.y = Math.sin(h.age * 1.1 + h._phase) * 0.95;
        else h._model.rotation.y += dt * 1.3;
        h._model.position.y = 0.8 + Math.sin(h.age * 2.2 + h._phase) * 0.07;
        h._halo.position.y = h._model.position.y;
        let vis = true;
        if (h.age > 20) {
          const f = 2 + (h.age - 20) * 0.7;
          vis = Math.sin(h.age * f * TAU) > -0.2;
        }
        h.object.visible = vis;
        h._acc += dt;
        while (h._acc > 0.09) {
          h._acc -= 0.09;
          if (!vis) continue;
          const a = rnd() * TAU,
            r = rr(0.15, 0.45);
          const o = this.add.emit(
            h.pos.x + Math.cos(a) * r,
            h.pos.y + rr(0.45, 1.1),
            h.pos.z + Math.sin(a) * r,
            0,
            rr(0.2, 0.5),
            0,
            rr(0.6, 1.1),
            rr(0.05, 0.1),
            0.01,
            7,
          );
          this.add.col(o, 0.5, 0.9, 0.6, 1);
          this.add.d[o + RAMP] = 4;
          this.add.fade(o, 0.25, 0.4);
          this.add.d[o + SPIN] = rr(-2, 2);
        }
      }
    }

    // particle + rigid sims
    this.alpha.sim(dt);
    this.add.sim(dt);
    for (const k in this.shells) this.shells[k].update(dt);
    this.chunks.update(dt);

    this._updateLighting(dt);
    this.alpha.write(this._camPos, this._camFwd);
    this.add.write(this._camPos, this._camFwd);
  }

  _runEmitters(dt) {
    const A = this.alpha,
      D = this.add;
    for (const e of this.emitters) {
      if (!e.on) continue;
      e.t += dt;
      if (e.t > e.dur) {
        e.on = false;
        continue;
      }
      e.acc += dt * e.rate;
      const k = e.t / e.dur;
      while (e.acc >= 1) {
        e.acc -= 1;
        let o;
        switch (e.type) {
          case 0: // embers (burning barrel)
            o = D.emit(
              e.x + rr(-0.22, 0.22),
              e.y + rr(0, 0.15),
              e.z + rr(-0.22, 0.22),
              rr(-0.2, 0.2),
              rr(0.6, 1.6),
              rr(-0.2, 0.2),
              rr(1.4, 3),
              rr(0.015, 0.035),
              0.008,
              10,
            );
            D.col(o, rr(0.7, 1.2), 1, 1, 1);
            D.d[o + RAMP] = 2;
            D.phys(o, -0.25, 0.5);
            D.d[o + TURB] = 5;
            D.fade(o, 0.08, 0.5);
            D.d[o + SOFT] = 0;
            break;
          case 1: {
            // explosion smoke column
            const s = e.s;
            o = A.emit(
              e.x + rr(-0.4, 0.4) * s,
              e.y + k * 1.2 * s,
              e.z + rr(-0.4, 0.4) * s,
              rr(-0.3, 0.3),
              rr(1.2, 2.4) * s,
              rr(-0.3, 0.3),
              rr(3.5, 6),
              rr(0.8, 1.2) * s,
              rr(2.2, 3.6) * s,
              (rnd() * 4) | 0,
            );
            const g = rr(0.06, 0.11);
            A.col(o, g, g, g * 0.95, 0.7 * (1 - k * 0.5));
            A.phys(o, -0.3, 0.7);
            A.d[o + SPOW] = 2;
            A.fade(o, 0.1, 0.4);
            A.d[o + EM] = 0.5 * (1 - k);
            A.d[o + SPIN] = rr(-0.4, 0.4);
            A.d[o + TURB] = 0.5;
            A.d[o + SOFT] = 0.4;
            break;
          }
          case 2: {
            // dirt rising dust + pebbles
            const a = rnd() * TAU,
              r = rr(0, 0.35);
            if (rnd() < 0.5) {
              o = A.emit(
                e.x + Math.cos(a) * r,
                0.03,
                e.z + Math.sin(a) * r,
                Math.cos(a) * rr(0.2, 1),
                rr(1.2, 3),
                Math.sin(a) * rr(0.2, 1),
                rr(0.6, 1.1),
                rr(0.02, 0.05),
                0.03,
                9,
              );
              A.col(o, 0.1, 0.075, 0.05, 1);
              A.phys(o, 9.8, 0.3, DIE);
              A.d[o + SPIN] = rr(-8, 8);
            } else {
              o = A.emit(
                e.x + Math.cos(a) * r,
                0.1,
                e.z + Math.sin(a) * r,
                rr(-0.2, 0.2),
                rr(0.2, 0.7),
                rr(-0.2, 0.2),
                rr(1.5, 2.6),
                rr(0.2, 0.3),
                rr(0.7, 1.1),
                4,
              );
              A.col(o, 0.15, 0.125, 0.09, 0.3 * (1 - k));
              A.phys(o, 0, 1.2);
              A.d[o + SPOW] = 2;
              A.fade(o, 0.1, 0.35);
              A.d[o + SOFT] = 0.25;
            }
            break;
          }
          case 3: // drips from a wound
            o = A.emit(
              e.x + rr(-0.03, 0.03),
              e.y - 0.02,
              e.z + rr(-0.03, 0.03),
              rr(-0.1, 0.1),
              rr(-0.5, 0),
              rr(-0.1, 0.1),
              1.2,
              rr(0.01, 0.018),
              0.012,
              6 + M_STRETCH,
            );
            A.col(o, BLOOD_R, BLOOD_G, BLOOD_B, 1);
            A.phys(o, 9.8, 0.1, STICK);
            A.d[o + STR] = 0.014;
            A.d[o + EVT] = 1;
            A.fade(o, 0, 0.9);
            break;
          case 4: {
            // blood fountain (decapitation)
            const sp = rr(2, 4.5) * (1 - k * 0.6);
            o = A.emit(
              e.x,
              e.y,
              e.z,
              rr(-0.5, 0.5) + e.dx * 0.5,
              sp,
              rr(-0.5, 0.5) + e.dz * 0.5,
              rr(0.7, 1.4),
              rr(0.01, 0.025),
              0.018,
              6 + M_STRETCH,
            );
            A.col(o, BLOOD_R, BLOOD_G, BLOOD_B, 1);
            A.phys(o, 9.8, 0.4, STICK);
            A.d[o + STR] = 0.014;
            A.d[o + EVT] = 1;
            A.fade(o, 0, 0.9);
            if (rnd() < 0.12) {
              o = A.emit(
                e.x,
                e.y + 0.1,
                e.z,
                rr(-0.3, 0.3),
                rr(0.4, 1),
                rr(-0.3, 0.3),
                0.7,
                0.1,
                0.45,
                5,
              );
              A.col(o, 0.36, 0.025, 0.02, 0.45);
              A.phys(o, 0.4, 2.5);
              A.d[o + SPOW] = 2;
            }
            break;
          }
        }
      }
    }
  }

  _updateLighting(dt) {
    // (re)discover scene lights every 2 s — cheap cached traversal
    this._lightScan -= dt;
    if (this._lightScan <= 0) {
      this._lightScan = 2;
      const L = this._sceneLights;
      L.length = 0;
      const amb = this._sceneAmb.set(0, 0, 0);
      this.scene.traverseVisible((o) => {
        if (!o.isLight || o.name === "fx.light") return;
        if (o.isPointLight || o.isSpotLight) L.push(o);
        else if (o.isAmbientLight)
          ((amb.x += o.color.r * o.intensity),
            (amb.y += o.color.g * o.intensity),
            (amb.z += o.color.b * o.intensity));
        else if (o.isHemisphereLight)
          ((amb.x += (o.color.r + o.groundColor.r) * 0.5 * o.intensity),
            (amb.y += (o.color.g + o.groundColor.g) * 0.5 * o.intensity),
            (amb.z += (o.color.b + o.groundColor.b) * 0.5 * o.intensity));
        else if (o.isDirectionalLight)
          ((amb.x += o.color.r * o.intensity * 0.35),
            (amb.y += o.color.g * o.intensity * 0.35),
            (amb.z += o.color.b * o.intensity * 0.35));
      });
    }
    const INV_PI = 1 / Math.PI,
      SCAT = 0.6;
    const a = this._sceneAmb,
      amb = this._uAmb.value;
    amb.set(
      a.x * INV_PI + this.ambient.r,
      a.y * INV_PI + this.ambient.g,
      a.z * INV_PI + this.ambient.b,
    );
    const LP = this._uLP.value,
      LC = this._uLC.value;
    for (let i = 0; i < LIGHT_POOL; i++) {
      const s = this.lights[i].L;
      LP[i].set(s.position.x, s.position.y, s.position.z, s.distance);
      LC[i]
        .set(s.color.r, s.color.g, s.color.b)
        .multiplyScalar(s.intensity * INV_PI * SCAT);
    }
    // 4 nearest scene point lights to the camera
    const sl = this._sceneLights,
      cp = this._camPos;
    for (let k = 0; k < 4; k++) {
      let best = null,
        bd = 1e18;
      for (let j = 0; j < sl.length; j++) {
        const l = sl[j];
        if (l.intensity <= 0 || l._fxPick === this.time) continue;
        const m = l.matrixWorld.elements;
        const d2 =
          (m[12] - cp.x) ** 2 + (m[13] - cp.y) ** 2 + (m[14] - cp.z) ** 2;
        if (d2 < bd) {
          bd = d2;
          best = l;
        }
      }
      const idx = LIGHT_POOL + k;
      if (best) {
        best._fxPick = this.time;
        const m = best.matrixWorld.elements;
        LP[idx].set(m[12], m[13], m[14], best.distance || 0);
        LC[idx]
          .set(best.color.r, best.color.g, best.color.b)
          .multiplyScalar(best.intensity * INV_PI * SCAT);
      } else {
        LC[idx].set(0, 0, 0);
      }
    }
  }

  /** debug counters */
  stats() {
    return {
      alpha: this.alpha.n,
      additive: this.add.n,
      shells:
        this.shells.pistol.n + this.shells.rifle.n + this.shells.shotgun.n,
      chunks: this.chunks.n,
      powerups: this.powerups.length,
      lights: this.lights.filter((l) => l.on).length,
    };
  }
}
