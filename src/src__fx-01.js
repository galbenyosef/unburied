// src__fx 01 — math
// Lines 1-320 of readable/src__fx.pretty.js (statement-aligned).
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

