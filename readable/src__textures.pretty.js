// UNBURIED — procedural material library (textures agent).
//
// Everything here is generated at load time: tileable Perlin fBm / Worley fields in typed arrays,
// canvas-2D strokes for cracks / scratches / tears, height maps -> Sobel normal maps, and packed
// ORM data maps (R = ambient occlusion, G = roughness, B = metalness — three.js reads exactly those
// channels, so one texture feeds aoMap + roughnessMap + metalnessMap).
//
// Conventions (see docs/CONTRACT.md):
//   architecture: 1 tile = 2 m x 2 m (consumers use UV = metres / 2), 1024^2
//   props / characters: 1 tile ~= 0.3 m, 512^2
//   wood_board: 1 plank (1.2 m x 0.2 m) over UV 0..1, grain along U
//   grain / board direction for every wood runs along U (texture X). "Down" (drips, streaks) is -V.

import * as THREE from "three";

const ARCH = [
  "brick_old",
  "concrete_wall",
  "concrete_floor",
  "plaster_damaged",
  "wood_planks",
  "wood_floor",
  "tile_floor",
  "metal_painted_green",
  "metal_rusty",
  "corrugated_metal",
  "dirt_ground",
  "sandbag",
  "crate_wood",
  "wood_board",
];
const PROPS = [
  "gun_metal",
  "gun_metal_parkerized",
  "wood_stock",
  "bakelite",
  "brass",
  "leather",
  "rubber_black",
  "cloth_canvas",
  "cloth_fieldgrey",
  "skin_rotten",
  "bone",
  "helmet_steel",
  "glove_leather",
  "sleeve_olive",
  "packed_camo",
];
// rough relative generation cost (for pool scheduling only)
const COST = {
  brick_old: 8,
  wood_planks: 8,
  concrete_floor: 6,
  concrete_wall: 6,
  skin_rotten: 3,
  plaster_damaged: 3,
  tile_floor: 3,
  wood_floor: 3,
  gun_metal: 3,
  gun_metal_parkerized: 3,
  crate_wood: 2.5,
  dirt_ground: 2.5,
  sandbag: 2.5,
  corrugated_metal: 2.5,
  metal_painted_green: 2.5,
  metal_rusty: 2.5,
  helmet_steel: 2,
};

// ------------------------------------------------------------------------------------------------
// GEN(): the whole pure generator (no THREE, no DOM beyond OffscreenCanvas). It is self-contained so
// its source can be shipped to Blob workers via GEN.toString() and run in parallel.
// ------------------------------------------------------------------------------------------------
function GEN() {
  let PROF = {};
  function fbm(...a) {
    const t = performance.now();
    const r = fbm_(...a);
    PROF.fbm = (PROF.fbm || 0) + performance.now() - t;
    return r;
  }
  function worley(...a) {
    const t = performance.now();
    const r = worley_(...a);
    PROF.worley = (PROF.worley || 0) + performance.now() - t;
    return r;
  }
  function grain(...a) {
    const t = performance.now();
    const r = grain_(...a);
    PROF.grain = (PROF.grain || 0) + performance.now() - t;
    return r;
  }
  function blur(...a) {
    const t = performance.now();
    const r = blur_(...a);
    PROF.blur = (PROF.blur || 0) + performance.now() - t;
    return r;
  }
  function paint(...a) {
    const t = performance.now();
    const r = paint_(...a);
    PROF.paint = (PROF.paint || 0) + performance.now() - t;
    return r;
  }
  function drip(...a) {
    const t = performance.now();
    const r = drip_(...a);
    PROF.drip = (PROF.drip || 0) + performance.now() - t;
    return r;
  }
  function normalBytes(...a) {
    const t = performance.now();
    const r = normalBytes_(...a);
    PROF.normalBytes = (PROF.normalBytes || 0) + performance.now() - t;
    return r;
  }
  function cavity(...a) {
    const t = performance.now();
    const r = cavity_(...a);
    PROF.cavity = (PROF.cavity || 0) + performance.now() - t;
    return r;
  }
  function upsample(...a) {
    return upsample_(...a);
  }
  // ------------------------------------------------------------------------------------------------
  // math / noise kernel
  // ------------------------------------------------------------------------------------------------
  const TAU = Math.PI * 2;
  const clamp = (x, a = 0, b = 1) => (x < a ? a : x > b ? b : x);
  const mix = (a, b, t) => a + (b - a) * t;
  const sstep = (e0, e1, x) => {
    let t = (x - e0) / (e1 - e0);
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    return t * t * (3 - 2 * t);
  };
  const fract = (x) => x - Math.floor(x);

  function RNG(seed) {
    let a = Math.imul(seed | 0, 2654435761) >>> 0 || 1;
    return function () {
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function hsh(a, b = 0) {
    let h =
      (Math.imul(a | 0, 0x27d4eb2d) ^
        Math.imul((b | 0) + 0x165667b1, 0x9e3779b1)) |
      0;
    h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
    h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  }

  // one periodic Perlin octave with fx x fy lattice cells across the W x H tile, accumulated into out.
  // Separable form: along a lattice row the x-interpolated gradient term is A(x) + fv * B(x), so we
  // precompute A/B per lattice row and each pixel is 4 contiguous loads + a lerp.
  function perlinOct(out, W, H, fx, fy, amp, R) {
    const n = fx * fy,
      gx = new Float32Array(n),
      gy = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const a = R() * TAU;
      gx[i] = Math.cos(a);
      gy[i] = Math.sin(a);
    }
    const A = new Float32Array(fy * W),
      B = new Float32Array(fy * W);
    for (let x = 0; x < W; x++) {
      const t = ((x + 0.5) * fx) / W,
        i = Math.floor(t),
        f = t - i;
      const x0 = i % fx,
        x1 = (i + 1) % fx,
        u = f * f * f * (f * (f * 6 - 15) + 10),
        f1 = f - 1;
      for (let j = 0, r = 0, o = x; j < fy; j++, r += fx, o += W) {
        const a0 = gx[r + x0] * f,
          a1 = gx[r + x1] * f1;
        A[o] = a0 + (a1 - a0) * u;
        const b0 = gy[r + x0];
        B[o] = b0 + (gy[r + x1] - b0) * u;
      }
    }
    for (let y = 0; y < H; y++) {
      const t = ((y + 0.5) * fy) / H,
        j = Math.floor(t),
        fv = t - j;
      const o0 = (j % fy) * W,
        o1 = ((j + 1) % fy) * W;
      const v = fv * fv * fv * (fv * (fv * 6 - 15) + 10),
        fv1 = fv - 1;
      const o = y * W;
      for (let x = 0; x < W; x++) {
        const a = A[o0 + x] + fv * B[o0 + x],
          b = A[o1 + x] + fv1 * B[o1 + x];
        out[o + x] += amp * (a + (b - a) * v);
      }
    }
  }
  function normalize01(F) {
    let mn = Infinity,
      mx = -Infinity;
    for (let i = 0; i < F.length; i++) {
      const v = F[i];
      if (v < mn) mn = v;
      if (v > mx) mx = v;
    }
    const k = mx > mn ? 1 / (mx - mn) : 0;
    for (let i = 0; i < F.length; i++) F[i] = (F[i] - mn) * k;
    return F;
  }
  // bilinear upsample of a tileable w x h field to W x H
  function upsample_(F, w, h, W, H) {
    const out = new Float32Array(W * H);
    const X0 = new Int32Array(W),
      X1 = new Int32Array(W),
      FX = new Float32Array(W);
    for (let x = 0; x < W; x++) {
      const t = ((x + 0.5) * w) / W - 0.5,
        i = Math.floor(t);
      FX[x] = t - i;
      X0[x] = (i + w) % w;
      X1[x] = (i + 1) % w;
    }
    for (let y = 0; y < H; y++) {
      const t = ((y + 0.5) * h) / H - 0.5,
        j = Math.floor(t),
        fy = t - j;
      const r0 = ((j + h) % h) * w,
        r1 = ((j + 1) % h) * w,
        o = y * W;
      for (let x = 0; x < W; x++) {
        const a = F[r0 + X0[x]],
          b = F[r0 + X1[x]],
          c = F[r1 + X0[x]],
          d = F[r1 + X1[x]],
          fx = FX[x];
        const ab = a + (b - a) * fx,
          cd = c + (d - c) * fx;
        out[o + x] = ab + (cd - ab) * fy;
      }
    }
    return out;
  }
  // tileable fBm normalised to 0..1. fx/fy = base lattice cells across the tile (anisotropic allowed).
  // Evaluated at the lowest power-of-two resolution that still gives >= 4 px per top-octave cell, then
  // upsampled — low-frequency fields cost a fraction of a full-res evaluation.
  function fbm_(W, H, fx, fy, oct, seed, gain = 0.5) {
    let n = 0,
      cx = fx,
      cy = fy;
    while (n < oct && cx <= W / 1.5 && cy <= H / 1.5) {
      n++;
      cx *= 2;
      cy *= 2;
    }
    if (!n) n = 1;
    const tx = fx * (1 << (n - 1)),
      ty = fy * (1 << (n - 1));
    let Wr = W,
      Hr = H;
    while (Wr > 16 && Wr / 2 >= tx * 4) Wr >>= 1;
    while (Hr > 16 && Hr / 2 >= ty * 4) Hr >>= 1;
    const lo = new Float32Array(Wr * Hr),
      R = RNG(seed * 7919 + 13);
    let amp = 1;
    cx = fx;
    cy = fy;
    for (let o = 0; o < n; o++) {
      perlinOct(lo, Wr, Hr, cx, cy, amp, R);
      amp *= gain;
      cx *= 2;
      cy *= 2;
    }
    normalize01(lo);
    return Wr === W && Hr === H ? lo : upsample(lo, Wr, Hr, W, H);
  }
  // cheap fine grain: white noise, box-blurred, normalised
  function grain_(W, H, seed, r = 1) {
    const F = new Float32Array(W * H),
      R = RNG(seed * 31 + 5);
    for (let i = 0; i < F.length; i++) F[i] = R();
    return normalize01(r > 0 ? blur(F, W, H, r) : F);
  }
  // tileable Worley: distances in cell units; id = cell index of nearest feature point
  function worley_(W, H, cx, cy, seed, jit = 0.9) {
    const R = RNG(seed * 104729 + 7),
      n = cx * cy;
    const px = new Float32Array(n),
      py = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      px[i] = 0.5 + (R() - 0.5) * jit;
      py[i] = 0.5 + (R() - 0.5) * jit;
    }
    const f1 = new Float32Array(W * H),
      f2 = new Float32Array(W * H),
      id = new Int32Array(W * H);
    const sx = cx / W,
      sy = cy / H;
    const XC = new Int32Array(W * 3),
      XO = new Float32Array(W * 3),
      GX = new Float32Array(W);
    for (let x = 0; x < W; x++) {
      const gx = (x + 0.5) * sx,
        jx = Math.floor(gx);
      GX[x] = gx;
      for (let d = 0; d < 3; d++) {
        const c = jx + d - 1;
        XC[x * 3 + d] = ((c % cx) + cx) % cx;
        XO[x * 3 + d] = c;
      }
    }
    const RI = new Int32Array(3),
      RO = new Float32Array(3);
    for (let y = 0; y < H; y++) {
      const gy = (y + 0.5) * sy,
        jy = Math.floor(gy);
      for (let d = 0; d < 3; d++) {
        const c = jy + d - 1;
        RI[d] = (((c % cy) + cy) % cy) * cx;
        RO[d] = gy - c;
      }
      const o = y * W;
      for (let x = 0; x < W; x++) {
        const gx = GX[x],
          x3 = x * 3;
        let d1 = 9,
          d2 = 9,
          best = 0;
        for (let dj = 0; dj < 3; dj++) {
          const ri = RI[dj],
            oy = RO[dj];
          for (let di = 0; di < 3; di++) {
            const k = ri + XC[x3 + di];
            const dx = gx - XO[x3 + di] - px[k],
              dy = oy - py[k];
            const d = dx * dx + dy * dy;
            if (d < d1) {
              d2 = d1;
              d1 = d;
              best = k;
            } else if (d < d2) d2 = d;
          }
        }
        f1[o + x] = Math.sqrt(d1);
        f2[o + x] = Math.sqrt(d2);
        id[o + x] = best;
      }
    }
    return { f1, f2, id };
  }
  // bilinear wrap sample (W, H powers of two)
  function samp(F, W, H, x, y) {
    const x0f = Math.floor(x),
      y0f = Math.floor(y),
      fx = x - x0f,
      fy = y - y0f;
    const mx = W - 1,
      my = H - 1;
    const x0 = x0f & mx,
      x1 = (x0f + 1) & mx,
      y0 = (y0f & my) * W,
      y1 = ((y0f + 1) & my) * W;
    const a = F[y0 + x0],
      b = F[y0 + x1],
      c = F[y1 + x0],
      d = F[y1 + x1];
    const ab = a + (b - a) * fx,
      cd = c + (d - c) * fx;
    return ab + (cd - ab) * fy;
  }
  // separable wrapping box blur (row-oriented running sums; no modulo in the inner loops)
  function blur_(F, W, H, r, passes = 1) {
    let src = F;
    const inv = 1 / (2 * r + 1);
    const ADD = new Int32Array(W),
      SUB = new Int32Array(W);
    for (let x = 0; x < W; x++) {
      ADD[x] = (x + r + 1) % W;
      SUB[x] = (((x - r) % W) + W) % W;
    }
    for (let p = 0; p < passes; p++) {
      const tmp = new Float32Array(W * H),
        dst = new Float32Array(W * H);
      for (let y = 0; y < H; y++) {
        const o = y * W;
        let s = 0;
        for (let k = -r; k <= r; k++) s += src[o + (((k % W) + W) % W)];
        for (let x = 0; x < W; x++) {
          tmp[o + x] = s * inv;
          s += src[o + ADD[x]] - src[o + SUB[x]];
        }
      }
      const acc = new Float32Array(W);
      for (let k = -r; k <= r; k++) {
        const ro = (((k % H) + H) % H) * W;
        for (let x = 0; x < W; x++) acc[x] += tmp[ro + x];
      }
      for (let y = 0; y < H; y++) {
        const o = y * W,
          ao = ((y + r + 1) % H) * W,
          so = ((((y - r) % H) + H) % H) * W;
        for (let x = 0; x < W; x++) {
          dst[o + x] = acc[x] * inv;
          acc[x] += tmp[ao + x] - tmp[so + x];
        }
      }
      src = dst;
    }
    return src;
  }
  // streak a source mask "downwards" (towards -V, i.e. decreasing row index), wrapping
  function drip_(S, W, H, dec = 0.985, jitter = 0.01, seed = 1) {
    const D = new Float32Array(S),
      R = RNG(seed);
    const decs = new Float32Array(W);
    for (let x = 0; x < W; x++)
      decs[x] = clamp(dec + (R() - 0.5) * 2 * jitter, 0, 0.9995);
    for (let pass = 0; pass < 2; pass++) {
      for (let x = 0; x < W; x++) {
        let c = pass ? D[x] : 0;
        const dx = decs[x];
        for (let y = H - 1; y >= 0; y--) {
          const i = y * W + x;
          c *= dx;
          if (D[i] > c) c = D[i];
          else D[i] = c;
        }
      }
    }
    return D;
  }
  function stamp(F, W, H, cx, cy, rx, ry, val, mode = "max") {
    const x0 = Math.floor(cx - rx * 2.5),
      x1 = Math.ceil(cx + rx * 2.5);
    const y0 = Math.floor(cy - ry * 2.5),
      y1 = Math.ceil(cy + ry * 2.5);
    for (let y = y0; y <= y1; y++) {
      const yy = ((y % H) + H) % H,
        dy = (y - cy) / ry;
      for (let x = x0; x <= x1; x++) {
        const xx = ((x % W) + W) % W,
          dx = (x - cx) / rx;
        const v = val * Math.exp(-(dx * dx + dy * dy));
        const i = yy * W + xx;
        if (mode === "add") F[i] += v;
        else if (v > F[i]) F[i] = v;
      }
    }
  }
  const wrapd = (d, P) => d - P * Math.round(d / P);

  // canvas 2D helper: draws with additive compositing into RGB channels, tiled 3x3 for seamless wrap
  function mkCanvas(W, H) {
    if (typeof OffscreenCanvas !== "undefined")
      return new OffscreenCanvas(W, H);
    const c = document.createElement("canvas");
    c.width = W;
    c.height = H;
    return c;
  }
  function paint_(W, H, fn) {
    const c = mkCanvas(W, H);
    const ctx = c.getContext("2d", { willReadFrequently: true });
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, W, H);
    ctx.globalCompositeOperation = "lighter";
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    const tiled = (draw) => {
      for (let oy = -1; oy <= 1; oy++)
        for (let ox = -1; ox <= 1; ox++) {
          ctx.save();
          ctx.translate(ox * W, oy * H);
          draw();
          ctx.restore();
        }
    };
    fn(ctx, tiled);
    const d = ctx.getImageData(0, 0, W, H).data,
      n = W * H;
    const R = new Float32Array(n),
      G = new Float32Array(n),
      B = new Float32Array(n);
    for (let i = 0, j = 0; i < n; i++, j += 4) {
      R[i] = d[j] / 255;
      G[i] = d[j + 1] / 255;
      B[i] = d[j + 2] / 255;
    }
    return { R, G, B };
  }
  function crackLines(
    R,
    W,
    H,
    n,
    lmin,
    lmax,
    w0,
    branchP = 0.018,
    wander = 0.55,
    step = 3,
  ) {
    const out = [],
      q = [];
    for (let k = 0; k < n; k++)
      q.push([
        R() * W,
        R() * H,
        R() * TAU,
        lmin + R() * (lmax - lmin),
        w0 * (0.7 + R() * 0.6),
        0,
      ]);
    while (q.length) {
      const [x0, y0, a0, len, w, dep] = q.pop();
      let x = x0,
        y = y0,
        a = a0;
      const pts = [[x, y]];
      for (let s = 0; s < len; s += step) {
        a += (R() - 0.5) * wander * 0.55 + (R() < 0.12 ? (R() - 0.5) * 1.1 : 0);
        a += (a0 - a) * 0.04;
        x += Math.cos(a) * step;
        y += Math.sin(a) * step;
        pts.push([x, y]);
        if (dep < 2 && R() < branchP)
          q.push([
            x,
            y,
            a + (R() < 0.5 ? -1 : 1) * (0.4 + R() * 0.8),
            len * (0.2 + R() * 0.4),
            w * 0.6,
            dep + 1,
          ]);
      }
      out.push({ pts, w });
    }
    return out;
  }
  // core into R (tapered), soft halo into G
  function drawCracks(ctx, tiled, lines, halo = 4, haloV = 70) {
    tiled(() => {
      for (const L of lines) {
        const p = L.pts,
          n = p.length;
        if (halo) {
          ctx.strokeStyle = `rgb(0,${haloV},0)`;
          ctx.lineWidth = L.w * halo;
          ctx.beginPath();
          ctx.moveTo(p[0][0], p[0][1]);
          for (let k = 1; k < n; k++) ctx.lineTo(p[k][0], p[k][1]);
          ctx.stroke();
        }
        ctx.strokeStyle = "rgb(255,0,0)";
        for (let k = 1; k < n; k++) {
          const t = k / n;
          ctx.lineWidth = Math.max(
            0.4,
            L.w *
              Math.pow(Math.sin(Math.PI * Math.min(0.98, t * 0.9 + 0.1)), 0.6),
          );
          ctx.beginPath();
          ctx.moveTo(p[k - 1][0], p[k - 1][1]);
          ctx.lineTo(p[k][0], p[k][1]);
          ctx.stroke();
        }
      }
    });
  }
  // fine straight-ish scratches into the given channel
  function drawScratches(
    ctx,
    tiled,
    R,
    W,
    H,
    n,
    {
      lmin = 4,
      lmax = 40,
      ang = 0,
      spread = Math.PI,
      wmin = 0.5,
      wmax = 1.1,
      amin = 0.2,
      amax = 0.9,
      ch = "r",
      curve = 0.02,
    } = {},
  ) {
    const segs = [];
    for (let k = 0; k < n; k++) {
      const x = R() * W,
        y = R() * H,
        a = ang + (R() - 0.5) * spread,
        len = lmin + Math.pow(R(), 2) * (lmax - lmin);
      segs.push({
        x,
        y,
        a,
        len,
        w: wmin + R() * (wmax - wmin),
        al: amin + R() * (amax - amin),
        c: (R() - 0.5) * curve,
      });
    }
    const col = ch === "r" ? "255,0,0" : ch === "g" ? "0,255,0" : "0,0,255";
    tiled(() => {
      for (const s of segs) {
        ctx.strokeStyle = `rgba(${col},${s.al})`;
        ctx.lineWidth = s.w;
        ctx.beginPath();
        ctx.moveTo(s.x, s.y);
        let x = s.x,
          y = s.y,
          a = s.a;
        const steps = Math.max(1, Math.round(s.len / 6));
        for (let k = 0; k < steps; k++) {
          a += s.c;
          x += (Math.cos(a) * s.len) / steps;
          y += (Math.sin(a) * s.len) / steps;
          ctx.lineTo(x, y);
        }
        ctx.stroke();
      }
    });
  }

  // ------------------------------------------------------------------------------------------------
  // layer (float working set) and output
  // ------------------------------------------------------------------------------------------------
  function layer(W, H) {
    const n = W * H;
    return {
      W,
      H,
      n,
      r: new Float32Array(n),
      g: new Float32Array(n),
      b: new Float32Array(n),
      h: new Float32Array(n),
      ro: new Float32Array(n).fill(0.8),
      me: null,
    };
  }
  function cavity_(h, W, H, r, k) {
    const b = blur(h, W, H, r, 2),
      ao = new Float32Array(W * H);
    for (let i = 0; i < ao.length; i++)
      ao[i] = clamp(1 - Math.max(0, b[i] - h[i]) * k, 0.15, 1);
    return ao;
  }
  function normalBytes_(h, W, H, s) {
    const out = new Uint8ClampedArray(W * H * 4),
      k = s / 8;
    const XM = new Int32Array(W),
      XP = new Int32Array(W);
    for (let x = 0; x < W; x++) {
      XM[x] = (x - 1 + W) % W;
      XP[x] = (x + 1) % W;
    }
    for (let y = 0; y < H; y++) {
      const ym = ((y - 1 + H) % H) * W,
        y0 = y * W,
        yp = ((y + 1) % H) * W;
      for (let x = 0; x < W; x++) {
        const xm = XM[x],
          xp = XP[x];
        const dx =
          h[ym + xp] +
          2 * h[y0 + xp] +
          h[yp + xp] -
          (h[ym + xm] + 2 * h[y0 + xm] + h[yp + xm]);
        const dy =
          h[yp + xm] +
          2 * h[yp + x] +
          h[yp + xp] -
          (h[ym + xm] + 2 * h[ym + x] + h[ym + xp]);
        const nx = -dx * k,
          ny = -dy * k;
        const il = 127.5 / Math.sqrt(nx * nx + ny * ny + 1);
        const j = (y0 + x) * 4;
        out[j] = nx * il + 127.5;
        out[j + 1] = ny * il + 127.5;
        out[j + 2] = il + 127.5;
        out[j + 3] = 255;
      }
    }
    return out;
  }
  // float layer -> byte buffers (colour sRGB, tangent-space normal, packed ORM, optional emissive)
  function bake(def) {
    const L = def.L,
      { W, H, n } = L;
    const ao = def.aoR ? cavity(L.h, W, H, def.aoR, def.aoK || 3) : null;
    const bk = def.aoBake ?? 0.5;
    const col = new Uint8ClampedArray(n * 4),
      orm = new Uint8ClampedArray(n * 4);
    const me = L.me;
    for (let i = 0, j = 0; i < n; i++, j += 4) {
      const a = ao ? (1 - (1 - ao[i]) * bk) * 255 : 255;
      col[j] = L.r[i] * a;
      col[j + 1] = L.g[i] * a;
      col[j + 2] = L.b[i] * a;
      col[j + 3] = 255;
      orm[j] = ao ? ao[i] * 255 : 255;
      orm[j + 1] = L.ro[i] * 255;
      orm[j + 2] = me ? me[i] * 255 : 0;
      orm[j + 3] = 255;
    }
    const out = {
      W,
      H,
      col,
      orm,
      nrm: normalBytes(L.h, W, H, def.ns || 4),
      emi: null,
      meta: {
        env: def.env ?? 0.5,
        metal: !!me,
        ao: !!ao,
        emissive: !!def.emissive,
      },
    };
    if (def.emissive) {
      const e = def.emissive,
        eb = new Uint8ClampedArray(n * 4);
      for (let i = 0, j = 0; i < n; i++, j += 4) {
        eb[j] = e.r[i] * 255;
        eb[j + 1] = e.g[i] * 255;
        eb[j + 2] = e.b[i] * 255;
        eb[j + 3] = 255;
      }
      out.emi = eb;
    }
    return out;
  }
  const setc = (L, i, r, g, b) => {
    L.r[i] = r;
    L.g[i] = g;
    L.b[i] = b;
  };

  // ------------------------------------------------------------------------------------------------
  // shared wood-board generator (planks, floor, crate, barricade plank)
  // ------------------------------------------------------------------------------------------------
  function woodBoards(W, H, o) {
    const {
      boards = 10,
      joints = [0, 1],
      gap = 3,
      E,
      Lt,
      grey = [0.47, 0.45, 0.42],
      weather = 0.5,
      rings = 9,
      knots = 0.8,
      seed = 1,
      nails = null,
      bevel = 4,
      tone = 0.2,
      wear = 0,
      dirt = 0.35,
      checks = 12,
      ringContrast = 0.75,
      endDark = 0,
      px = 1,
    } = o;
    const L = layer(W, H),
      bw = H / boards;
    const warpA = fbm(W, H, 2, Math.max(2, boards * 2), 4, seed + 1);
    const fyF = Math.min(H >> 1, 512);
    const fib = fbm(W, H, 8, fyF, 1, seed + 2),
      fib2 = fbm(W, H, 32, fyF >> 1, 1, seed + 8);
    const blot = fbm(W, H, 4, 4, 4, seed + 3),
      fine = grain(W, H, seed + 4, 1);
    const dirtN = fbm(W, H, 6, 6, 3, seed + 5),
      wearN = wear ? fbm(W, H, 3, 3, 4, seed + 6) : null;
    const R = RNG(seed + 7);
    const B = [];
    for (let b = 0; b < boards; b++) {
      const nj = joints[0] + Math.floor(R() * (joints[1] - joints[0] + 1));
      const breaks = [];
      if (nj > 0) {
        const off = R() * W;
        for (let s = 0; s < nj; s++)
          breaks.push((off + ((s + 0.2 + R() * 0.6) * W) / nj) % W);
        breaks.sort((a, c) => a - c);
      }
      const segInfo = [],
        ns = Math.max(1, nj);
      for (let s = 0; s < ns; s++) {
        const a = nj ? breaks[s] : 0,
          len = nj ? (s + 1 < nj ? breaks[s + 1] - a : breaks[0] + W - a) : W;
        const ks = [];
        const nk =
          R() < ((knots * len) / W) * 1.5
            ? 1 + (R() < knots * 0.35 ? 1 : 0)
            : 0;
        for (let k = 0; k < nk; k++)
          ks.push({
            x: a + (0.1 + R() * 0.8) * len,
            y: (0.2 + R() * 0.6) * bw,
            r: bw * (0.05 + R() * 0.07),
            amp: 1.5 + R() * 2,
            dead: R() < 0.3,
          });
        segInfo.push({
          tone: 1 + (R() - 0.5) * tone,
          ph: R() * 10,
          rf: 0.75 + R() * 0.5,
          cx: a + len * (0.2 + R() * 0.6),
          curv: (1 + R() * 5) * (R() < 0.5 ? 1 : -1),
          wth: clamp(weather + (R() - 0.5) * 0.35),
          ks,
          grey: R(),
        });
      }
      // per-column segment index + distance to nearest butt joint (row-invariant within a board)
      const SI = new Uint8Array(W),
        DB = new Float32Array(W).fill(1e9);
      for (let x = 0; x < W; x++) {
        if (!nj) continue;
        let si = nj - 1,
          d = 1e9;
        for (let k = 0; k < nj; k++) {
          if (x >= breaks[k]) si = k;
          const dd = Math.abs(wrapd(x - breaks[k], W));
          if (dd < d) d = dd;
        }
        SI[x] = si;
        DB[x] = d;
      }
      B.push({ breaks, segInfo, SI, DB, cup: (R() - 0.5) * 0.1 });
    }
    const ck = paint(W, H, (ctx, tiled) => {
      const lines = [];
      for (let k = 0; k < checks; k++) {
        const x = R() * W,
          y = R() * H,
          len = 30 * px + R() * W * 0.25;
        const pts = [];
        let yy = y;
        for (let s = 0; s <= len; s += 4 * px) {
          yy += (R() - 0.5) * 0.8 * px;
          pts.push([x + s, yy]);
        }
        lines.push({ pts, w: (0.8 + R() * 1.4) * px });
      }
      drawCracks(ctx, tiled, lines, 3, 50);
    });
    const nailList = nails ? nails(bw, B) : [];
    let rust = null;
    if (nailList.length) {
      const rustS = new Float32Array(W * H);
      for (const nl of nailList)
        stamp(
          rustS,
          W,
          H,
          nl.x,
          nl.y - nl.r * 0.8,
          nl.r * 1.6,
          nl.r * 2.4,
          0.9,
        );
      rust = blur(
        drip(rustS, W, H, 1 - 0.025 / px, 0.012 / px, seed + 9),
        W,
        H,
        1,
      );
    }
    for (let y = 0; y < H; y++) {
      const b = Math.floor(y / bw) % boards,
        ly = y - b * bw,
        BB = B[b];
      const vy = ly / bw,
        edgeY = Math.min(ly, bw - ly),
        SI = BB.SI,
        DB = BB.DB;
      for (let x = 0; x < W; x++) {
        const i = y * W + x;
        const dBreak = DB[x];
        const S = BB.segInfo[SI[x]];
        const edge = Math.min(edgeY, dBreak) - gap / 2;
        if (edge < 0) {
          L.r[i] = 0.03;
          L.g[i] = 0.024;
          L.b[i] = 0.019;
          L.h[i] = 0;
          L.ro[i] = 0.95;
          continue;
        }
        const dxn = wrapd(x - S.cx, W) / (W * 0.5);
        let rc =
          vy * rings * S.rf +
          (warpA[i] - 0.5) * 3.2 +
          S.curv * dxn * dxn +
          S.ph;
        let knot = 0,
          kring = 0;
        for (let q = 0; q < S.ks.length; q++) {
          const K = S.ks[q];
          const dy = ly - K.y;
          if (dy > K.r * 4 || dy < -K.r * 4) continue;
          let dx = x - K.x;
          if (dx > W / 2) dx -= W;
          else if (dx < -W / 2) dx += W;
          if (dx > K.r * 8 || dx < -K.r * 8) continue;
          const r2 = K.r * K.r;
          rc +=
            K.amp * Math.exp(-((dx * dx) / (r2 * 16) + (dy * dy) / (r2 * 2.2)));
          const dk = Math.sqrt((dx * dx) / 1.7 + dy * dy) / K.r;
          if (dk < 1.15) {
            knot = Math.max(knot, 1 - sstep(0.85, 1.15, dk));
            kring = fract(dk * 2.6);
            if (dk > 0.85 && dk < 1.1) knot = Math.max(knot, 1.3);
            if (K.dead && dk < 0.8) knot = 2;
          }
        }
        const t = fract(rc);
        const lt = clamp(
          sstep(0.5, 0.96, t) * ringContrast +
            (fib[i] - 0.5) * 0.5 +
            (fib2[i] - 0.5) * 0.25,
        );
        let cr = mix(E[0], Lt[0], lt),
          cg = mix(E[1], Lt[1], lt),
          cb = mix(E[2], Lt[2], lt);
        const tn = S.tone * (0.9 + 0.2 * blot[i]);
        cr *= tn;
        cg *= tn;
        cb *= tn;
        const wth = clamp(
          S.wth * (0.6 + 0.8 * blot[i]) * (0.8 + 0.4 * (1 - lt)),
        );
        const lum = cr * 0.3 + cg * 0.59 + cb * 0.11,
          gk = (0.8 + 0.4 * S.grey) * (0.6 + lum);
        cr = mix(cr, grey[0] * gk, wth);
        cg = mix(cg, grey[1] * gk, wth);
        cb = mix(cb, grey[2] * gk, wth);
        let h =
          0.75 +
          BB.cup * (vy - 0.5) * (vy - 0.5) * 4 -
          (1 - sstep(0, bevel, edge)) * 0.45 -
          (1 - lt) * 0.08 * (0.3 + wth) +
          (fib[i] - 0.5) * 0.06 +
          (fine[i] - 0.5) * 0.02;
        let ro = 0.72 + 0.2 * wth + (fine[i] - 0.5) * 0.08;
        if (knot > 0) {
          if (knot === 2) {
            cr = 0.05;
            cg = 0.035;
            cb = 0.025;
            h -= 0.3;
          } else if (knot > 1) {
            cr *= 0.35;
            cg *= 0.3;
            cb *= 0.28;
          } else {
            const kd = 0.45 + 0.25 * kring;
            cr = mix(cr, cr * kd * 0.9 + 0.02, knot);
            cg = mix(cg, cg * kd * 0.8, knot);
            cb = mix(cb, cb * kd * 0.7, knot);
            h += 0.04 * knot;
            ro -= 0.1 * knot;
          }
        }
        const c = ck.R[i] * (0.4 + wth),
          chh = ck.G[i];
        const cd = 1 - 0.8 * c - 0.15 * chh;
        cr *= cd;
        cg *= cd;
        cb *= cd;
        h -= 0.35 * c;
        const ge = 1 - sstep(0, 10 * px, edge);
        const dk = 1 - dirt * (0.35 * ge + 0.5 * sstep(0.5, 0.85, dirtN[i]));
        cr *= dk;
        cg *= dk;
        cb *= dk * 0.97;
        if (endDark) {
          const ed = 1 - sstep(0, W * 0.06, Math.min(x, W - x));
          cr *= 1 - endDark * ed;
          cg *= 1 - endDark * ed;
          cb *= 1 - endDark * ed;
        }
        if (wearN) {
          const w = sstep(0.45, 0.8, wearN[i]) * wear;
          cr = mix(cr, cr * 1.2 + 0.025, w);
          cg = mix(cg, cg * 1.18 + 0.02, w);
          cb = mix(cb, cb * 1.15 + 0.015, w);
          ro -= 0.25 * w;
          h -= 0.03 * w;
        }
        if (rust) {
          const rs = clamp(rust[i] * 1.1);
          if (rs > 0.01) {
            cr = mix(cr, 0.33, rs * 0.55);
            cg = mix(cg, 0.16, rs * 0.6);
            cb = mix(cb, 0.08, rs * 0.6);
          }
        }
        L.r[i] = cr;
        L.g[i] = cg;
        L.b[i] = cb;
        L.h[i] = h;
        L.ro[i] = clamp(ro, 0.3, 1);
      }
    }
    for (const nl of nailList) {
      const r = nl.r,
        x0 = Math.floor(nl.x - r - 2),
        y0 = Math.floor(nl.y - r - 2);
      for (let y = y0; y <= nl.y + r + 2; y++)
        for (let x = x0; x <= nl.x + r + 2; x++) {
          const d = Math.hypot(x - nl.x, y - nl.y);
          if (d > r + 1.5) continue;
          const i = (((y % H) + H) % H) * W + (((x % W) + W) % W);
          if (nl.hole) {
            const k = sstep(r, r - 1, d);
            L.r[i] = mix(L.r[i], 0.03, k);
            L.g[i] = mix(L.g[i], 0.025, k);
            L.b[i] = mix(L.b[i], 0.02, k);
            L.h[i] -= 0.4 * k;
            continue;
          }
          if (d > r) {
            L.h[i] -= 0.15 * (1 - (d - r) / 1.5);
            L.r[i] *= 0.6;
            L.g[i] *= 0.55;
            L.b[i] *= 0.5;
            continue;
          }
          const dome = Math.sqrt(1 - (d / r) * (d / r)),
            rr = hsh(x * 7 + y, nl.x | 0);
          L.r[i] = 0.2 + 0.1 * rr + 0.06 * dome;
          L.g[i] = 0.13 + 0.05 * rr;
          L.b[i] = 0.09 + 0.03 * rr;
          L.h[i] = 0.72 + 0.1 * dome;
          L.ro[i] = 0.75;
          if (L.me) L.me[i] = 0.3;
        }
    }
    return L;
  }

  function weaveAt(x, y, T, W, H, twill, jx, jy) {
    const u = (x * T) / W + jx,
      v = (y * T) / H + jy;
    const iu = Math.floor(u),
      iv = Math.floor(v),
      fu = u - iu,
      fv = v - iv;
    const over = twill ? (((iu - iv) % 4) + 4) % 4 < 2 : ((iu + iv) & 1) === 0;
    const pu = Math.sin(Math.PI * fu),
      pv = Math.sin(Math.PI * fv);
    // warp yarns run along V (profile across U); weft along U
    const h = over ? pu * (0.55 + 0.45 * pv) : pv * (0.55 + 0.45 * pu);
    return { h, over, iu, iv, gap: over ? pu : pv };
  }

  // ------------------------------------------------------------------------------------------------
  // generators — each returns { L, ns (normal strength), aoR?, aoK?, aoBake?, env?, ... }
  // ------------------------------------------------------------------------------------------------
  const G = {};

  G.brick_old = () => {
    const W = 1024,
      H = 1024,
      L = layer(W, H);
    const rows = 26,
      cols = 9,
      rh = H / rows,
      cw = W / cols;
    const wx = fbm(W, H, 32, 32, 2, 101),
      wy = fbm(W, H, 32, 32, 2, 102);
    const fine = fbm(W, H, 128, 128, 2, 103, 0.55);
    const mott = fbm(W, H, 32, 32, 3, 104);
    const chipN = fbm(W, H, 48, 48, 3, 105);
    const soot = fbm(W, H, 2, 2, 5, 106);
    const damp = fbm(W, H, 3, 3, 5, 107);
    const sand = grain(W, H, 108, 1);
    const streak = fbm(W, H, 128, 2, 2, 109);
    const spk = dots(W, H, 110, 2600, 0.8, 2.8);
    const NB = rows * cols,
      BR = new Float32Array(NB * 5);
    for (let id = 0; id < NB; id++)
      for (let k = 0; k < 5; k++) BR[id * 5 + k] = hsh(id, k + 1);
    const RO = new Float32Array(rows);
    for (let r = 0; r < rows; r++)
      RO[r] = (r & 1 ? 0.5 : 0) + (hsh(r, 77) - 0.5) * 0.08;
    const PAL = [
      [0.47, 0.23, 0.16],
      [0.42, 0.2, 0.14],
      [0.52, 0.27, 0.19],
      [0.38, 0.21, 0.16],
      [0.29, 0.15, 0.11],
      [0.55, 0.33, 0.24],
      [0.41, 0.25, 0.19],
      [0.46, 0.27, 0.2],
      [0.34, 0.18, 0.13],
    ];
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) {
        const i = y * W + x;
        const px = x + (wx[i] - 0.5) * 5,
          py = y + (wy[i] - 0.5) * 4;
        const rowF = py / rh;
        let row = Math.floor(rowF);
        const ly = (rowF - row) * rh;
        row = ((row % rows) + rows) % rows;
        const cf = px / cw + RO[row];
        let col = Math.floor(cf);
        const lx = (cf - col) * cw;
        col = ((col % cols) + cols) % cols;
        const b5 = (row * cols + col) * 5;
        const r1 = BR[b5],
          r2 = BR[b5 + 1],
          r3 = BR[b5 + 2],
          r4 = BR[b5 + 3],
          r5 = BR[b5 + 4];
        const jh = 2.4 + r3 * 1.8;
        const ax = Math.min(lx, cw - lx) - jh,
          ay = Math.min(ly, rh - ly) - jh;
        const qx = 3.5 - ax,
          qy = 3.5 - ay;
        const e =
          qx > 0 && qy > 0
            ? 3.5 - Math.sqrt(qx * qx + qy * qy)
            : ax < ay
              ? ax
              : ay;
        const cn = chipN[i];
        const chipD = cn > 0.45 ? (cn - 0.45) * (r4 < 0.3 ? 34 : 12) : 0;
        let h, cr, cg, cb, ro;
        if (e < 0) {
          const s = sand[i];
          const eros = sstep(0.45, 0.75, damp[i] * 0.6 + mott[i] * 0.4);
          h = 0.3 + (s - 0.5) * 0.2 - eros * 0.14;
          const m = (0.75 + 0.4 * s) * (1 - 0.25 * eros);
          cr = 0.5 * m;
          cg = 0.475 * m;
          cb = 0.43 * m;
          ro = 0.96;
        } else {
          const p = PAL[(r1 * 9) | 0];
          let mm = (0.78 + 0.44 * mott[i]) * (0.82 + 0.36 * r2);
          const sp = spk.F[i];
          if (sp > 0) {
            if (spk.C[i] < 0.65) mm *= 1 - 0.5 * Math.min(1, sp * 2);
            else if (spk.C[i] > 0.85) mm *= 1 + 0.25 * Math.min(1, sp * 2);
          }
          if (r3 > 0.7) {
            const t = r5 < 0.5 ? lx / cw : 1 - lx / cw;
            mm *= 1 - 0.5 * sstep(0.45, 1, t);
          }
          cr = p[0] * mm;
          cg = p[1] * mm;
          cb = p[2] * mm;
          if (e < chipD) {
            h =
              0.5 +
              (cn - 0.5) * 0.3 +
              (fine[i] - 0.5) * 0.3 +
              sstep(0, chipD, e) * 0.08;
            cr = cr * 1.1 + 0.06;
            cg = cg * 1.05 + 0.04;
            cb = cb + 0.03;
            ro = 0.93;
          } else {
            h =
              0.62 +
              0.38 * sstep(0, 5, e - chipD) +
              (r5 - 0.5) * 0.14 +
              (lx / cw - 0.5) * (r2 - 0.5) * 0.12 +
              (fine[i] - 0.5) * 0.16;
            ro = 0.8 + (fine[i] - 0.5) * 0.16;
          }
        }
        const so = sstep(0.4, 0.95, soot[i]),
          k1 = 1 - 0.22 * so;
        cr *= k1;
        cg *= k1;
        cb *= k1;
        const st =
          sstep(0.5, 0.85, streak[i]) *
          sstep(0.3, 0.7, soot[i] * 0.5 + damp[i] * 0.5);
        cr *= 1 - 0.28 * st;
        cg *= 1 - 0.26 * st;
        cb *= 1 - 0.24 * st;
        const dm = sstep(0.58, 0.76, damp[i]);
        cr *= 1 - 0.22 * dm;
        cg *= 1 - 0.16 * dm;
        cb *= 1 - 0.18 * dm;
        ro -= 0.3 * dm;
        const ef =
          sstep(0.05, 0, Math.abs(damp[i] - 0.53)) *
          sstep(0.35, 0.75, sand[i]) *
          (e < 2 ? 1 : 0.45);
        cr = mix(cr, 0.72, ef * 0.5);
        cg = mix(cg, 0.71, ef * 0.5);
        cb = mix(cb, 0.68, ef * 0.5);
        ro += ef * 0.1;
        L.r[i] = cr;
        L.g[i] = cg;
        L.b[i] = cb;
        L.h[i] = h;
        L.ro[i] = clamp(ro, 0.3, 1);
      }
    return { L, ns: 9, aoR: 6, aoK: 3.2, aoBake: 0.55, env: 0.35 };
  };

  G.concrete_wall = () => {
    const W = 1024,
      H = 1024,
      L = layer(W, H);
    const boards = 10,
      bh = H / boards;
    const blot = fbm(W, H, 3, 3, 5, 201),
      blot2 = fbm(W, H, 12, 12, 3, 202);
    const grainF = fbm(W, H, 4, 256, 2, 203),
      fine = grain(W, H, 204, 1);
    const streak = fbm(W, H, 128, 2, 2, 205),
      smask = fbm(W, H, 5, 2, 3, 206);
    const pits = dots(W, H, 207, 1400, 1.2, 4.5);
    const R = RNG(208);
    const cr = paint(W, H, (ctx, tiled) =>
      drawCracks(ctx, tiled, crackLines(R, W, H, 4, 180, 520, 1.7), 5, 60),
    );
    const holes = [];
    for (const hx of [0.25, 0.75])
      for (const hb of [2, 7])
        holes.push([hx * W + (R() - 0.5) * 20, (hb + 0.5) * bh]);
    const holeH = new Float32Array(W * H),
      holeD = new Float32Array(W * H),
      S = new Float32Array(W * H);
    for (const [hx, hy] of holes) {
      for (let dy = -19; dy <= 19; dy++)
        for (let dx = -19; dx <= 19; dx++) {
          const x = Math.round(hx) + dx,
            y = Math.round(hy) + dy;
          const i = (((y % H) + H) % H) * W + (((x % W) + W) % W);
          const d = Math.sqrt((x - hx) * (x - hx) + (y - hy) * (y - hy));
          if (d < 13) {
            holeH[i] = -0.6 * Math.sqrt(1 - d / 13);
            holeD[i] = 1 - sstep(4, 13, d);
          } else if (d < 18) holeH[i] = 0.03 * (1 - Math.abs(d - 15.5) / 2.5);
        }
      stamp(S, W, H, hx, hy - 12, 7, 9, 1);
    }
    const rust = blur(drip(S, W, H, 0.993, 0.004, 209), W, H, 2);
    const wet = blur(drip(S, W, H, 0.997, 0.002, 210), W, H, 3);
    for (let y = 0; y < H; y++) {
      const b = Math.floor(y / bh),
        ly = y - b * bh,
        rb = hsh(b, 211),
        seamD = Math.min(ly, bh - ly);
      const fin = 1 - sstep(0, 2.5, seamD);
      for (let x = 0; x < W; x++) {
        const i = y * W + x;
        let h =
          0.6 +
          (rb - 0.5) * 0.08 +
          (grainF[i] - 0.5) * 0.035 +
          (fine[i] - 0.5) * 0.06 +
          (blot2[i] - 0.5) * 0.06 +
          fin * 0.1 +
          holeH[i];
        const pit = pits.F[i];
        if (pit > 0) h -= 0.3 * Math.sqrt(pit);
        const c = cr.R[i],
          ha = cr.G[i];
        h -= c * 0.5 + ha * 0.08;
        const m =
          (0.8 + 0.38 * blot[i]) *
          (0.94 + 0.12 * rb) *
          (0.92 + 0.16 * blot2[i]) *
          (0.98 + 0.04 * grainF[i]) *
          (0.9 + 0.2 * fine[i]);
        let r = 0.29 * m * (1 + (blot2[i] - 0.5) * 0.05),
          g = 0.305 * m,
          bl = 0.335 * m * (1 - (blot2[i] - 0.5) * 0.05);
        const dk =
          (1 - 0.25 * fin) *
          (1 - 0.55 * pit) *
          (1 - 0.8 * holeD[i]) *
          (1 - 0.6 * c) *
          (1 - 0.12 * ha);
        r *= dk;
        g *= dk;
        bl *= dk;
        const ws =
          sstep(0.45, 0.85, streak[i]) * sstep(0.4, 0.72, smask[i]) +
          wet[i] * 0.5;
        r *= 1 - 0.32 * ws;
        g *= 1 - 0.3 * ws;
        bl *= 1 - 0.28 * ws;
        const rs = clamp(rust[i] * 1.2);
        r = mix(r, 0.34, rs * 0.55);
        g = mix(g, 0.2, rs * 0.55);
        bl = mix(bl, 0.11, rs * 0.6);
        L.r[i] = r;
        L.g[i] = g;
        L.b[i] = bl;
        L.h[i] = h;
        L.ro[i] = clamp(
          0.88 + (fine[i] - 0.5) * 0.12 - 0.28 * ws - 0.1 * rs,
          0.3,
          1,
        );
      }
    }
    return { L, ns: 6, aoR: 5, aoK: 2.5, aoBake: 0.5, env: 0.35 };
  };

  G.concrete_floor = () => {
    const W = 1024,
      H = 1024,
      L = layer(W, H);
    const blot = fbm(W, H, 2, 2, 5, 301),
      blot2 = fbm(W, H, 16, 16, 3, 302),
      fine = grain(W, H, 303, 1);
    const trow = fbm(W, H, 3, 3, 3, 305),
      stain = fbm(W, H, 3, 3, 5, 306),
      dust = fbm(W, H, 3, 3, 4, 307);
    const wear = fbm(W, H, 6, 6, 3, 308),
      edgeN = fbm(W, H, 32, 32, 2, 310);
    const agg = dots(W, H, 304, 5000, 1, 3.8, 0.4);
    const R = RNG(309);
    const cr = paint(W, H, (ctx, tiled) => {
      drawCracks(
        ctx,
        tiled,
        crackLines(R, W, H, 3, 300, 700, 1.8, 0.012),
        5,
        60,
      );
      drawScratches(ctx, tiled, R, W, H, 500, {
        lmin: 10,
        lmax: 90,
        wmin: 0.6,
        wmax: 2.2,
        amin: 0.05,
        amax: 0.3,
        ch: "b",
        curve: 0.04,
      });
    });
    const sc = paint(W, H, (ctx, tiled) =>
      drawScratches(ctx, tiled, R, W, H, 170, {
        lmin: 20,
        lmax: 150,
        wmin: 2,
        wmax: 8,
        amin: 0.05,
        amax: 0.25,
        ch: "g",
        curve: 0.06,
      }),
    );
    for (let i = 0; i < L.n; i++) {
      const sw = 0.5 + 0.5 * Math.sin(trow[i] * 90);
      const wr = sstep(0.5, 0.8, wear[i]);
      let h =
        0.55 +
        (fine[i] - 0.5) * 0.05 +
        (blot2[i] - 0.5) * 0.05 +
        (sw - 0.5) * 0.01;
      const m =
        (0.8 + 0.35 * blot[i]) *
        (0.92 + 0.16 * blot2[i]) *
        (0.97 + 0.06 * sw) *
        (0.94 + 0.12 * fine[i]);
      let r = 0.23 * m,
        g = 0.24 * m,
        b = 0.26 * m;
      let ro = 0.78 + (sw - 0.5) * 0.14 + (fine[i] - 0.5) * 0.1;
      const a = agg.F[i];
      if (a > 0 && wr > 0.05) {
        const k = wr * sstep(0, 0.3, a),
          t = agg.C[i];
        r = mix(r, 0.2 + 0.26 * t, k);
        g = mix(g, 0.2 + 0.24 * t, k);
        b = mix(b, 0.19 + 0.22 * t, k);
        h += 0.02 * k;
        ro -= 0.12 * k;
      }
      r *= 1 + 0.1 * wr;
      g *= 1 + 0.1 * wr;
      b *= 1 + 0.1 * wr;
      const sv = stain[i] + (edgeN[i] - 0.5) * 0.06;
      const os = sstep(0.76, 0.86, sv),
        osE = sstep(0.02, 0, Math.abs(sv - 0.68));
      r = mix(r, 0.08, os * 0.6);
      g = mix(g, 0.076, os * 0.6);
      b = mix(b, 0.07, os * 0.6);
      ro -= 0.4 * os;
      r *= 1 - 0.08 * osE;
      g *= 1 - 0.08 * osE;
      b *= 1 - 0.08 * osE;
      const ds = sstep(0.5, 0.8, dust[i]) * (1 - os);
      r = mix(r, 0.43, ds * 0.35);
      g = mix(g, 0.42, ds * 0.35);
      b = mix(b, 0.4, ds * 0.35);
      ro += 0.1 * ds;
      const c = cr.R[i],
        ha = cr.G[i],
        scr = cr.B[i],
        scuff = sc.G[i];
      h -= c * 0.5 + ha * 0.06;
      const dk = (1 - 0.8 * c) * (1 - 0.18 * ha) * (1 - 0.55 * scuff);
      r = r * dk + scr * 0.07;
      g = g * dk + scr * 0.07;
      b = b * dk + scr * 0.07;
      ro += scr * 0.1 - scuff * 0.15;
      L.r[i] = r;
      L.g[i] = g;
      L.b[i] = b;
      L.h[i] = h;
      L.ro[i] = clamp(ro, 0.25, 1);
    }
    return { L, ns: 6, aoR: 4, aoK: 2.5, aoBake: 0.5, env: 0.4 };
  };

  G.plaster_damaged = () => {
    const W = 512,
      H = 512,
      L = layer(W, H);
    const lossN = fbm(W, H, 3, 3, 5, 401),
      wA = fbm(W, H, 6, 6, 3, 402),
      wB = fbm(W, H, 6, 6, 3, 403);
    const edgeN = fbm(W, H, 48, 48, 3, 404),
      lump = fbm(W, H, 16, 16, 3, 405),
      fine = grain(W, H, 406, 1);
    const stain = fbm(W, H, 3, 3, 5, 407),
      peel = fbm(W, H, 10, 10, 4, 408),
      dirt = fbm(W, H, 4, 4, 4, 409);
    const fib = fbm(W, H, 8, 256, 1, 410),
      keyN = fbm(W, H, 64, 16, 2, 411);
    const R = RNG(412);
    const cr = paint(W, H, (ctx, tiled) =>
      drawCracks(
        ctx,
        tiled,
        crackLines(R, W, H, 6, 50, 160, 0.8, 0.012, 0.55, 2),
        4,
        50,
      ),
    );
    const strips = 42,
      sp = H / strips,
      gap = 3;
    const src = new Float32Array(W * H);
    for (let i = 0; i < src.length; i++)
      src[i] = sstep(0.66, 0.7, stain[i]) * 0.8;
    const drips = blur(drip(src, W, H, 0.992, 0.006, 413), W, H, 1);
    for (let y = 0; y < H; y++) {
      const s = Math.floor(y / sp),
        ls = y - s * sp,
        bx = hsh(s, 1) * W,
        stone = hsh(s, 2);
      for (let x = 0; x < W; x++) {
        const i = y * W + x;
        const lv =
          samp(lossN, W, H, x + (wA[i] - 0.5) * 45, y + (wB[i] - 0.5) * 45) +
          (edgeN[i] - 0.5) * 0.09;
        const thr = 0.75;
        let r, g, b, h, ro;
        if (lv > thr) {
          const dxb = Math.abs(wrapd(x - bx, W));
          const inStrip = ls > gap / 2 && ls < sp - gap / 2 && dxb > 1;
          const deep = sstep(0, 0.03, lv - thr);
          if (inStrip) {
            const pr = Math.sin((Math.PI * (ls - gap / 2)) / (sp - gap));
            h = 0.32 + 0.07 * pr + (fib[i] - 0.5) * 0.06;
            const k = (0.7 + 0.5 * stone) * (0.8 + 0.4 * fib[i]);
            r = 0.34 * k;
            g = 0.26 * k;
            b = 0.18 * k;
            ro = 0.85;
            const res =
              sstep(0.6, 0.68, lump[i] * 0.7 + keyN[i] * 0.3) *
              (1 - deep * 0.5);
            r = mix(r, 0.52, res * 0.8);
            g = mix(g, 0.5, res * 0.8);
            b = mix(b, 0.46, res * 0.8);
            h += res * 0.05;
          } else if (keyN[i] > 0.5) {
            h = 0.24 + (fine[i] - 0.5) * 0.05;
            const k = 0.7 + 0.4 * fine[i];
            r = 0.42 * k;
            g = 0.41 * k;
            b = 0.38 * k;
            ro = 0.95;
          } else {
            h = 0.04;
            r = 0.03;
            g = 0.028;
            b = 0.026;
            ro = 1;
          }
          const band = 1 - sstep(0, 0.018, lv - thr);
          r = mix(r, 0.46, band * 0.8);
          g = mix(g, 0.43, band * 0.8);
          b = mix(b, 0.38, band * 0.8);
          h = mix(h, 0.55, band * 0.6);
        } else {
          const dE = thr - lv;
          h =
            0.86 +
            (lump[i] - 0.5) * 0.08 +
            (fine[i] - 0.5) * 0.03 -
            (1 - sstep(0, 0.035, dE)) * 0.22;
          const pm =
            sstep(0.71, 0.73, peel[i]) * (1 - sstep(0.1, 0.2, dE) * 0.5);
          const dd = 0.7 + 0.38 * dirt[i];
          r = mix(0.66, 0.55, pm) * dd;
          g = mix(0.66, 0.52, pm) * dd;
          b = mix(0.63, 0.46, pm) * dd;
          h -= pm * 0.035;
          ro = mix(0.78, 0.92, pm) + (fine[i] - 0.5) * 0.08;
          const lip = sstep(0.012, 0, Math.abs(peel[i] - 0.715));
          r *= 1 - 0.18 * lip;
          g *= 1 - 0.18 * lip;
          b *= 1 - 0.18 * lip;
          const ring = 1 - sstep(0.0, 0.07, dE);
          r *= 1 - 0.2 * ring;
          g *= 1 - 0.22 * ring;
          b *= 1 - 0.25 * ring;
          const st = stain[i],
            tide = sstep(0.012, 0, Math.abs(st - 0.7));
          if (st > 0.7) {
            r *= 0.93;
            g *= 0.9;
            b *= 0.82;
          }
          r *= 1 - 0.18 * tide;
          g *= 1 - 0.22 * tide;
          b *= 1 - 0.3 * tide;
          const c = cr.R[i],
            ha = cr.G[i];
          h -= c * 0.45 + ha * 0.05;
          const dk = (1 - 0.55 * c) * (1 - 0.1 * ha);
          r *= dk;
          g *= dk;
          b *= dk;
        }
        const dp = clamp(drips[i]);
        r *= 1 - 0.3 * dp;
        g *= 1 - 0.33 * dp;
        b *= 1 - 0.4 * dp;
        L.r[i] = r;
        L.g[i] = g;
        L.b[i] = b;
        L.h[i] = h;
        L.ro[i] = clamp(ro, 0.3, 1);
      }
    }
    return { L, ns: 4, aoR: 3, aoK: 3.5, aoBake: 0.55, env: 0.3 };
  };

  G.wood_planks = () => {
    const W = 1024,
      H = 1024;
    const L = woodBoards(W, H, {
      boards: 10,
      joints: [0, 1],
      gap: 4,
      seed: 500,
      rings: 9,
      knots: 0.7,
      weather: 0.55,
      tone: 0.3,
      E: [0.5, 0.38, 0.26],
      Lt: [0.27, 0.18, 0.11],
      grey: [0.46, 0.44, 0.41],
      dirt: 0.4,
      checks: 14,
      nails: (bw) => {
        const out = [];
        for (let b = 0; b < 10; b++)
          for (let s = 0; s < 4; s++)
            for (const f of [0.28, 0.72]) {
              if (hsh(b * 8 + s, f * 10) < 0.12) continue;
              out.push({
                x: ((s + 0.5) * W) / 4 + (hsh(b, s) - 0.5) * 8,
                y: (b + f) * bw + (hsh(s, b) - 0.5) * 6,
                r: 3.2,
                hole: hsh(b + 50, s + f * 3) < 0.2,
              });
            }
        return out;
      },
    });
    return { L, ns: 7, aoR: 5, aoK: 3, aoBake: 0.5, env: 0.3 };
  };

  G.wood_floor = () => {
    // long dark oak floorboards: 13 boards per 2 m (~0.15 m), one staggered butt joint per board per tile
    const W = 512,
      H = 512;
    const L = woodBoards(W, H, {
      boards: 13,
      joints: [1, 1],
      gap: 1.4,
      seed: 600,
      rings: 6,
      knots: 0.3,
      weather: 0.06,
      tone: 0.14,
      E: [0.38, 0.27, 0.16],
      Lt: [0.19, 0.125, 0.07],
      grey: [0.3, 0.26, 0.22],
      dirt: 0.5,
      wear: 0.6,
      checks: 6,
      bevel: 1.5,
      px: 0.5,
      ringContrast: 0.85,
      nails: (bw, B) => {
        const out = [];
        B.forEach((BB, b) =>
          BB.breaks.forEach((bx) => {
            for (const s of [-1, 1])
              for (const f of [0.3, 0.7])
                out.push({ x: bx + s * 3.5, y: (b + f) * bw, r: 1.3 });
          }),
        );
        return out;
      },
    });
    const R = RNG(601);
    const sc = paint(W, H, (ctx, tiled) =>
      drawScratches(ctx, tiled, R, W, H, 500, {
        lmin: 4,
        lmax: 40,
        wmin: 0.5,
        wmax: 1.2,
        amin: 0.08,
        amax: 0.35,
        curve: 0.05,
      }),
    );
    for (let i = 0; i < L.n; i++) {
      const s = sc.R[i];
      L.r[i] += s * 0.05;
      L.g[i] += s * 0.04;
      L.b[i] += s * 0.03;
      L.ro[i] = clamp(L.ro[i] - 0.1 + s * 0.12);
    }
    return { L, ns: 3.5, aoR: 2, aoK: 3, aoBake: 0.5, env: 0.45 };
  };

  G.crate_wood = () => {
    const W = 512,
      H = 512;
    const L = woodBoards(W, H, {
      boards: 16,
      joints: [1, 2],
      gap: 1.6,
      seed: 700,
      rings: 6,
      knots: 0.55,
      weather: 0.25,
      tone: 0.24,
      px: 0.5,
      E: [0.6, 0.48, 0.32],
      Lt: [0.42, 0.3, 0.18],
      grey: [0.5, 0.48, 0.43],
      dirt: 0.45,
      checks: 8,
      bevel: 2,
      nails: (bw, B) => {
        const out = [];
        B.forEach((BB, b) =>
          BB.breaks.forEach((bx) => {
            for (const s of [-1, 1])
              for (const f of [0.35, 0.65])
                out.push({ x: bx + s * 4.5, y: (b + f) * bw, r: 1.2 });
          }),
        );
        return out;
      },
    });
    return { L, ns: 3, aoR: 2, aoK: 3, aoBake: 0.45, env: 0.3 };
  };

  G.wood_board = () => {
    const W = 512,
      H = 128;
    const L = woodBoards(W, H, {
      boards: 1,
      joints: [0, 0],
      gap: 0,
      seed: 800,
      rings: 8,
      knots: 0.9,
      weather: 0.6,
      tone: 0.1,
      px: 0.5,
      E: [0.5, 0.38, 0.26],
      Lt: [0.27, 0.18, 0.1],
      grey: [0.47, 0.45, 0.42],
      dirt: 0.4,
      checks: 5,
      bevel: 6,
      endDark: 0.35,
      nails: () => [
        { x: 0.045 * W, y: 0.3 * H, r: 2.5 },
        { x: 0.05 * W, y: 0.72 * H, r: 2.5 },
        { x: 0.955 * W, y: 0.28 * H, r: 2.5 },
        { x: 0.95 * W, y: 0.7 * H, r: 2.5 },
      ],
    });
    const tear = fbm(W, H, 64, 2, 2, 801);
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) {
        const i = y * W + x,
          e = Math.min(y, H - 1 - y) - tear[i] * 5;
        const k = 1 - sstep(0, 7, e);
        L.r[i] *= 1 - 0.45 * k;
        L.g[i] *= 1 - 0.47 * k;
        L.b[i] *= 1 - 0.5 * k;
        L.h[i] -= 0.2 * k;
      }
    return { L, ns: 2.5, aoR: 2, aoK: 3, aoBake: 0.45, env: 0.3 };
  };

  G.tile_floor = () => {
    // dirty off-white ceramic tiles, 0.2 m, grimy grout, crazing, cracks, chips, a few missing
    const W = 512,
      H = 512,
      L = layer(W, H);
    const n = 10,
      ts = W / n,
      grout = 1.8;
    const fine = grain(W, H, 901, 1),
      mott = fbm(W, H, 24, 24, 3, 902),
      dirt = fbm(W, H, 4, 4, 5, 903);
    const wear = fbm(W, H, 5, 5, 4, 904),
      chipN = fbm(W, H, 64, 64, 2, 905),
      craze = worley(W, H, 36, 36, 907);
    const R = RNG(906);
    const cr = paint(W, H, (ctx, tiled) => {
      drawCracks(
        ctx,
        tiled,
        crackLines(R, W, H, 8, 30, 110, 0.8, 0.02, 0.35, 2),
        3,
        40,
      );
      drawScratches(ctx, tiled, R, W, H, 500, {
        lmin: 2,
        lmax: 20,
        wmin: 0.4,
        wmax: 0.9,
        amin: 0.15,
        amax: 0.6,
        ch: "b",
      });
    });
    const TI = new Float32Array(n * n * 6);
    for (let id = 0; id < n * n; id++)
      for (let k = 0; k < 6; k++) TI[id * 6 + k] = hsh(id, k + 1);
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) {
        const i = y * W + x;
        const tx = Math.floor(x / ts),
          ty = Math.floor(y / ts),
          lx = x - tx * ts,
          ly = y - ty * ts;
        const t6 = (ty * n + tx) * 6,
          r1 = TI[t6],
          r2 = TI[t6 + 1],
          r3 = TI[t6 + 2],
          kind = TI[t6 + 3],
          miss = TI[t6 + 4],
          cz = TI[t6 + 5];
        const ax = Math.min(lx, ts - lx) - grout / 2,
          ay = Math.min(ly, ts - ly) - grout / 2;
        const qx = 1.2 - ax,
          qy = 1.2 - ay;
        const e =
          qx > 0 && qy > 0
            ? 1.2 - Math.sqrt(qx * qx + qy * qy)
            : Math.min(ax, ay);
        const cornerD = Math.hypot(
          Math.min(lx, ts - lx),
          Math.min(ly, ts - ly),
        );
        const chipD =
          Math.max(0, chipN[i] - 0.5) *
          (r3 < 0.35 ? 18 : 4) *
          (cornerD < 11 ? 1.6 : 0.6);
        const dd = 0.55 + 0.5 * dirt[i];
        let r, g, b, h, ro;
        if (e < 0) {
          h = 0.2 + (fine[i] - 0.5) * 0.08;
          const k = (0.7 + 0.3 * fine[i]) * dd;
          r = 0.16 * k;
          g = 0.15 * k;
          b = 0.13 * k;
          ro = 0.95;
        } else if (miss < 0.04) {
          const comb = 0.5 + 0.5 * Math.sin(ly * 1.1 + fine[i] * 2);
          h = 0.08 + comb * 0.06 + (fine[i] - 0.5) * 0.08;
          const k = (0.75 + 0.3 * fine[i]) * dd;
          r = 0.33 * k;
          g = 0.32 * k;
          b = 0.29 * k;
          ro = 0.95;
        } else {
          let base;
          if (kind < 0.18) base = [0.56, 0.56, 0.54];
          else if (kind < 0.3) base = [0.66, 0.62, 0.52];
          else base = [0.7, 0.69, 0.64];
          const k = (0.9 + 0.18 * r1) * (0.93 + 0.14 * mott[i]);
          r = base[0] * k;
          g = base[1] * k;
          b = base[2] * k;
          h =
            0.78 +
            0.2 * sstep(0, 2, e) +
            (r2 - 0.5) * 0.06 +
            (fine[i] - 0.5) * 0.01;
          const w = sstep(0.55, 0.85, wear[i]);
          ro = 0.24 + 0.4 * w + cr.B[i] * 0.3 + (1 - dd) * 0.2;
          if (cz < 0.35) {
            const cl = 1 - sstep(0, 0.025, craze.f2[i] - craze.f1[i]);
            r *= 1 - 0.25 * cl;
            g *= 1 - 0.26 * cl;
            b *= 1 - 0.28 * cl;
          }
          if (e < chipD) {
            r = 0.6;
            g = 0.55;
            b = 0.47;
            h = 0.62 + (fine[i] - 0.5) * 0.1;
            ro = 0.9;
          }
          const gr = 1 - sstep(0, 6, e);
          const dk = dd * (1 - 0.3 * gr);
          r = r * dk + 0.04 * (1 - dd);
          g = g * dk + 0.035 * (1 - dd);
          b = b * dk + 0.025 * (1 - dd);
          const c = cr.R[i],
            ha = cr.G[i];
          h -= c * 0.4;
          const cd = 1 - 0.75 * c - 0.1 * ha;
          r *= cd;
          g *= cd;
          b *= cd;
          ro += c * 0.4;
        }
        L.r[i] = r;
        L.g[i] = g;
        L.b[i] = b;
        L.h[i] = h;
        L.ro[i] = clamp(ro, 0.15, 1);
      }
    return { L, ns: 4, aoR: 2, aoK: 3, aoBake: 0.5, env: 0.6 };
  };

  G.metal_painted_green = () => {
    const W = 512,
      H = 512,
      L = layer(W, H);
    L.me = new Float32Array(W * H);
    const peelN = fbm(W, H, 12, 12, 4, 1101, 0.55),
      chipS = worley(W, H, 40, 40, 1102),
      orange = grain(W, H, 1103, 1);
    const mott = fbm(W, H, 6, 6, 4, 1104),
      grime = fbm(W, H, 3, 3, 5, 1105),
      rustN = fbm(W, H, 32, 32, 2, 1106),
      fine = grain(W, H, 1107, 1);
    const R = RNG(1108);
    const sc = paint(W, H, (ctx, tiled) =>
      drawScratches(ctx, tiled, R, W, H, 380, {
        lmin: 3,
        lmax: 45,
        wmin: 0.5,
        wmax: 1,
        amin: 0.4,
        amax: 1,
        curve: 0.03,
      }),
    );
    const chipV = new Float32Array(W * H),
      rsrc = new Float32Array(W * H);
    for (let i = 0; i < chipV.length; i++) {
      chipV[i] =
        peelN[i] * 0.75 +
        (1 - chipS.f1[i]) * 0.25 * (hsh(chipS.id[i], 1) < 0.5 ? 1 : 0.5) +
        (fine[i] - 0.5) * 0.05;
      rsrc[i] = sstep(0.72, 0.78, chipV[i]) * (0.5 + 0.5 * rustN[i]);
    }
    const streak = blur(drip(rsrc, W, H, 0.98, 0.012, 1109), W, H, 1);
    for (let i = 0; i < L.n; i++) {
      const c = chipV[i],
        s = sc.R[i];
      let r,
        g,
        b,
        h,
        ro,
        me = 0;
      const pk = 0.85 + 0.3 * mott[i];
      r = 0.23 * pk;
      g = 0.29 * pk;
      b = 0.19 * pk;
      const fade = sstep(0.55, 0.9, mott[i]);
      r = mix(r, 0.34, fade * 0.35);
      g = mix(g, 0.38, fade * 0.35);
      b = mix(b, 0.3, fade * 0.35);
      h = 1 + (orange[i] - 0.5) * 0.03;
      ro = 0.6 + (orange[i] - 0.5) * 0.1 + fade * 0.12;
      if (c > 0.66) {
        const t = sstep(0.66, 0.7, c);
        r = mix(r, 0.42, t);
        g = mix(g, 0.19, t);
        b = mix(b, 0.12, t);
        h -= 0.08 * t;
        ro = mix(ro, 0.8, t);
        if (c > 0.71) {
          const rk = sstep(0.4, 0.65, rustN[i]) * sstep(0.71, 0.8, c);
          r = mix(0.46, 0.36, rk);
          g = mix(0.46, 0.17, rk);
          b = mix(0.47, 0.08, rk);
          me = 1 - rk;
          ro = mix(0.42, 0.88, rk) + (fine[i] - 0.5) * 0.1;
          h = 0.86 - rk * 0.04 + (fine[i] - 0.5) * 0.04;
        }
      }
      if (s > 0.05 && c <= 0.71) {
        r = mix(r, 0.5, s * 0.85);
        g = mix(g, 0.5, s * 0.85);
        b = mix(b, 0.51, s * 0.85);
        me = Math.max(me, s * 0.9);
        ro = mix(ro, 0.35, s);
        h -= s * 0.06;
      }
      const st = clamp(streak[i] * 0.9) * (c > 0.71 ? 0.3 : 1);
      r = mix(r, 0.34, st * 0.7);
      g = mix(g, 0.17, st * 0.7);
      b = mix(b, 0.09, st * 0.7);
      me *= 1 - st;
      ro += st * 0.15;
      const gm = sstep(0.4, 0.9, grime[i]);
      r *= 1 - 0.4 * gm;
      g *= 1 - 0.4 * gm;
      b *= 1 - 0.38 * gm;
      ro += 0.08 * gm;
      L.r[i] = r;
      L.g[i] = g;
      L.b[i] = b;
      L.h[i] = h;
      L.ro[i] = clamp(ro, 0.2, 1);
      L.me[i] = me;
    }
    return { L, ns: 5, aoR: 2, aoK: 3, aoBake: 0.4, env: 0.7 };
  };

  G.metal_rusty = () => {
    const W = 512,
      H = 512,
      L = layer(W, H);
    L.me = new Float32Array(W * H);
    const base = fbm(W, H, 6, 6, 5, 1201),
      mid = fbm(W, H, 32, 32, 3, 1202),
      fine = grain(W, H, 1203, 1);
    const flake = worley(W, H, 24, 24, 1204),
      pits = dots(W, H, 1205, 2500, 0.7, 2.2),
      steelM = fbm(W, H, 4, 4, 4, 1206);
    const streak = fbm(W, H, 128, 2, 2, 1207),
      orange = fbm(W, H, 10, 10, 3, 1208);
    for (let i = 0; i < L.n; i++) {
      const t = base[i] * 0.65 + mid[i] * 0.35;
      let r, g, b;
      if (t < 0.5) {
        const k = t / 0.5;
        r = mix(0.15, 0.34, k);
        g = mix(0.08, 0.16, k);
        b = mix(0.05, 0.075, k);
      } else {
        const k = (t - 0.5) / 0.5;
        r = mix(0.34, 0.5, k);
        g = mix(0.16, 0.25, k);
        b = mix(0.075, 0.09, k);
      }
      const or = sstep(0.6, 0.85, orange[i]);
      r = mix(r, 0.56, or * 0.4);
      g = mix(g, 0.29, or * 0.4);
      b = mix(b, 0.11, or * 0.35);
      const fk = 0.85 + 0.3 * fine[i];
      r *= fk;
      g *= fk;
      b *= fk;
      let h = 0.5 + (mid[i] - 0.5) * 0.2 + (fine[i] - 0.5) * 0.12,
        ro = 0.88 + (fine[i] - 0.5) * 0.1,
        me = 0;
      const fid = flake.id[i],
        edge = flake.f2[i] - flake.f1[i];
      if (hsh(fid, 1) < 0.45) {
        h += (0.1 + 0.12 * hsh(fid, 2)) * sstep(0, 0.08, edge);
        const cv = (1 - sstep(0.0, 0.04, edge)) * (0.4 + 0.6 * hsh(fid, 4));
        r *= 1 - 0.45 * cv;
        g *= 1 - 0.45 * cv;
        b *= 1 - 0.4 * cv;
        if (hsh(fid, 3) < 0.4) {
          r *= 1.12;
          g *= 1.08;
        }
      }
      const pk = pits.F[i];
      if (pk > 0 && pits.C[i] < 0.6) {
        h -= 0.2 * pk;
        r *= 1 - 0.5 * pk;
        g *= 1 - 0.55 * pk;
        b *= 1 - 0.5 * pk;
      }
      const st = sstep(0.62, 0.7, steelM[i]) * (1 - sstep(0.55, 0.75, mid[i]));
      if (st > 0) {
        const sg = 0.33 + 0.12 * fine[i];
        r = mix(r, sg * 1.05, st);
        g = mix(g, sg, st);
        b = mix(b, sg * 0.95, st);
        me = st * 0.8;
        ro = mix(ro, 0.55, st);
        h = mix(h, 0.45, st);
      }
      const sk = sstep(0.55, 0.85, streak[i]);
      r *= 1 - 0.25 * sk;
      g *= 1 - 0.27 * sk;
      b *= 1 - 0.2 * sk;
      L.r[i] = r;
      L.g[i] = g;
      L.b[i] = b;
      L.h[i] = h;
      L.ro[i] = clamp(ro, 0.3, 1);
      L.me[i] = me;
    }
    return { L, ns: 4, aoR: 2, aoK: 3, aoBake: 0.4, env: 0.5 };
  };

  G.corrugated_metal = () => {
    // galvanised corrugated sheet: vertical ridges (profile varies along U), 26 waves per 2 m
    const W = 512,
      H = 512,
      L = layer(W, H);
    L.me = new Float32Array(W * H);
    const waves = 26,
      per = W / waves;
    const spang = worley(W, H, 50, 50, 1301),
      patch = fbm(W, H, 5, 5, 5, 1302),
      fine = grain(W, H, 1303, 1);
    const white = fbm(W, H, 8, 8, 4, 1304),
      dent = fbm(W, H, 4, 4, 3, 1305),
      mott = fbm(W, H, 16, 16, 3, 1306);
    const prof = new Float32Array(W);
    for (let x = 0; x < W; x++)
      prof[x] = 0.5 + 0.5 * Math.sin(((x + 0.5) / per) * TAU);
    // fasteners on every other crest in two rows; rust weeps from them and from sparse corrosion
    const src = new Float32Array(W * H),
      fast = [];
    for (const fy of [0.14, 0.64])
      for (let k = 0; k < waves; k += 2) fast.push([(k + 0.25) * per, fy * H]);
    for (const [fx, fy] of fast)
      stamp(src, W, H, fx, fy - 2, 2.2, 2.8, 0.9 + 0.1 * hsh(fx | 0, 3));
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) {
        const i = y * W + x,
          p = sstep(0.76, 0.86, patch[i] + (1 - prof[x]) * 0.06);
        if (p > src[i]) src[i] = p * 0.85;
      }
    const streak = blur(drip(src, W, H, 0.988, 0.01, 1307), W, H, 1);
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) {
        const i = y * W + x,
          pv = prof[x];
        let h = pv + (dent[i] - 0.5) * 0.25 + (fine[i] - 0.5) * 0.01;
        const sp = hsh(spang.id[i], 1);
        const k =
          (0.86 + 0.16 * sp) * (0.9 + 0.2 * mott[i]) * (0.78 + 0.3 * pv);
        let r = 0.5 * k,
          g = 0.51 * k,
          b = 0.52 * k,
          me = 0.75,
          ro = 0.42 + sp * 0.1 + (fine[i] - 0.5) * 0.08 + (1 - pv) * 0.1;
        const wr = sstep(0.68, 0.86, white[i]);
        r = mix(r, 0.6, wr * 0.25);
        g = mix(g, 0.6, wr * 0.25);
        b = mix(b, 0.58, wr * 0.25);
        me -= 0.4 * wr;
        ro += 0.3 * wr;
        const core = src[i],
          sk = clamp(streak[i]);
        const tint = clamp(sk * 0.75);
        r = mix(r, 0.44, tint);
        g = mix(g, 0.22, tint);
        b = mix(b, 0.1, tint);
        me *= 1 - tint;
        ro = mix(ro, 0.8, tint);
        const deep = clamp(core * 1.2);
        r = mix(r, 0.24, deep);
        g = mix(g, 0.12, deep);
        b = mix(b, 0.06, deep);
        me *= 1 - deep;
        ro = mix(ro, 0.92, deep);
        h -= deep * 0.04 * fine[i];
        L.r[i] = r;
        L.g[i] = g;
        L.b[i] = b;
        L.h[i] = h;
        L.ro[i] = clamp(ro, 0.2, 1);
        L.me[i] = clamp(me);
      }
    // fastener heads: domed washer + screw
    for (const [fx, fy] of fast) {
      for (let y = Math.floor(fy - 5); y <= fy + 5; y++)
        for (let x = Math.floor(fx - 5); x <= fx + 5; x++) {
          const d = Math.hypot(x + 0.5 - fx, y + 0.5 - fy);
          if (d > 4) continue;
          const i = (((y % H) + H) % H) * W + (((x % W) + W) % W);
          const dome = Math.sqrt(1 - (d / 4) * (d / 4));
          L.h[i] = 1.05 + 0.25 * dome;
          const c = d < 1.8 ? 0.2 : 0.34;
          L.r[i] = c * 1.3;
          L.g[i] = c * 0.8;
          L.b[i] = c * 0.55;
          L.me[i] = 0.3;
          L.ro[i] = 0.7;
        }
    }
    return { L, ns: 6, aoR: 4, aoK: 1.5, aoBake: 0.35, env: 0.8 };
  };

  G.dirt_ground = () => {
    // dark damp forest soil: crumbly clods, half-buried pebbles, roots, pine needles, leaf litter
    const W = 512,
      H = 512,
      L = layer(W, H);
    const low = fbm(W, H, 4, 4, 5, 1401),
      mid = fbm(W, H, 24, 24, 3, 1402),
      fine = grain(W, H, 1403, 1);
    const moist = fbm(W, H, 3, 3, 4, 1404),
      clod = fbm(W, H, 48, 48, 2, 1405),
      litter = fbm(W, H, 3, 3, 4, 1409),
      jagN = fbm(W, H, 64, 64, 1, 1410);
    const peb = dots(W, H, 1406, 170, 1.2, 7, 0.35, jagN);
    const R = RNG(1408);
    const lv = paint(W, H, (ctx, tiled) => {
      ctx.globalCompositeOperation = "source-over";
      const leaves = [];
      let tries = 0;
      while (leaves.length < 200 && tries++ < 4000) {
        const x = R() * W,
          y = R() * H;
        if (litter[((y | 0) % H) * W + ((x | 0) % W)] < 0.42 + R() * 0.25)
          continue;
        leaves.push([
          x,
          y,
          R() * TAU,
          5 + R() * 6,
          0.35 + R() * 0.25,
          40 + ((R() * 215) | 0),
          0.4 + R() * 0.6,
        ]);
      }
      tiled(() => {
        for (const [x, y, a, l, wd, v, curl] of leaves) {
          ctx.save();
          ctx.translate(x, y);
          ctx.rotate(a);
          ctx.fillStyle = `rgb(255,${v},${(curl * 90) | 0})`;
          ctx.beginPath();
          ctx.moveTo(-l, 0);
          ctx.quadraticCurveTo(0, -l * wd * 2 * curl, l, 0);
          ctx.quadraticCurveTo(0, l * wd * 2, -l, 0);
          ctx.fill();
          ctx.strokeStyle = `rgb(255,${v},255)`;
          ctx.lineWidth = 0.6;
          ctx.beginPath();
          ctx.moveTo(-l * 0.9, 0);
          ctx.lineTo(l * 1.2, 0);
          ctx.stroke();
          ctx.restore();
        }
      });
    });
    const dbr = paint(W, H, (ctx, tiled) => {
      const needles = [],
        roots = [],
        twigs = [];
      for (let k = 0; k < 700; k++)
        needles.push([
          R() * W,
          R() * H,
          R() * TAU,
          5 + R() * 7,
          0.4 + 0.6 * R(),
        ]);
      for (let k = 0; k < 6; k++) {
        const pts = [];
        let x = R() * W,
          y = R() * H,
          a = R() * TAU;
        const len = 80 + R() * 200;
        for (let s = 0; s < len; s += 3) {
          a += (R() - 0.5) * 0.35;
          x += Math.cos(a) * 3;
          y += Math.sin(a) * 3;
          pts.push([x, y]);
        }
        roots.push({ pts, w: 2 + R() * 2.5 });
      }
      for (let k = 0; k < 10; k++)
        twigs.push([R() * W, R() * H, R() * TAU, 15 + R() * 40]);
      tiled(() => {
        for (const [x, y, a, l, v] of needles) {
          ctx.strokeStyle = `rgba(255,0,0,${v})`;
          ctx.lineWidth = 0.7;
          ctx.beginPath();
          ctx.moveTo(x, y);
          ctx.quadraticCurveTo(
            x + Math.cos(a) * l * 0.5 + 1,
            y + Math.sin(a) * l * 0.5,
            x + Math.cos(a) * l,
            y + Math.sin(a) * l,
          );
          ctx.stroke();
        }
        for (const rt of roots) {
          const p = rt.pts;
          for (let k = 1; k < p.length; k++) {
            ctx.strokeStyle = "rgb(0,255,0)";
            ctx.lineWidth = rt.w * (1 - (0.7 * k) / p.length);
            ctx.beginPath();
            ctx.moveTo(p[k - 1][0], p[k - 1][1]);
            ctx.lineTo(p[k][0], p[k][1]);
            ctx.stroke();
          }
        }
        for (const [x, y, a, l] of twigs) {
          ctx.strokeStyle = "rgb(0,0,255)";
          ctx.lineWidth = 1.3;
          ctx.beginPath();
          ctx.moveTo(x, y);
          ctx.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l);
          ctx.stroke();
        }
      });
    });
    for (let i = 0; i < L.n; i++) {
      const t = low[i] * 0.55 + mid[i] * 0.45;
      let r = mix(0.11, 0.27, t),
        g = mix(0.085, 0.2, t),
        b = mix(0.06, 0.14, t);
      const cl = sstep(0.5, 0.85, clod[i]);
      const fk = (0.7 + 0.6 * fine[i]) * (0.85 + 0.45 * cl);
      r *= fk;
      g *= fk;
      b *= fk;
      let h =
        0.35 +
        low[i] * 0.18 +
        mid[i] * 0.12 +
        clod[i] * 0.1 +
        (fine[i] - 0.5) * 0.07;
      let ro = 0.93;
      const pv = peb.F[i];
      if (pv > 0) {
        const d = 1 - pv,
          dome = Math.sqrt(1 - d * d),
          ph = 0.4 + dome * 0.3;
        if (ph > h) {
          const tn = peb.C[i],
            sh = 0.7 + 0.4 * dome;
          r = (0.22 + 0.2 * tn) * sh;
          g = (0.2 + 0.17 * tn) * sh;
          b = (0.17 + 0.14 * tn) * sh;
          const mud = sstep(0.1, 0, ph - h);
          r = mix(r, 0.1, mud * 0.6);
          g = mix(g, 0.075, mud * 0.6);
          b = mix(b, 0.05, mud * 0.6);
          h = ph;
          ro = 0.6;
        }
      }
      const rt = dbr.G[i],
        nd = dbr.R[i],
        tw = dbr.B[i];
      if (rt > 0) {
        r = mix(r, 0.2, rt);
        g = mix(g, 0.12, rt);
        b = mix(b, 0.075, rt);
        h += 0.14 * rt;
        ro = mix(ro, 0.75, rt);
      }
      if (nd > 0) {
        const v = fine[(i * 7) % L.n];
        r = mix(r, 0.22 + 0.12 * v, nd);
        g = mix(g, 0.12 + 0.06 * v, nd);
        b = mix(b, 0.06, nd);
        h += 0.04 * nd;
      }
      if (tw > 0) {
        r = mix(r, 0.2, tw);
        g = mix(g, 0.15, tw);
        b = mix(b, 0.1, tw);
        h += 0.08 * tw;
      }
      const cov = lv.R[i];
      if (cov > 0) {
        const v = lv.G[i],
          rib = lv.B[i] > 0.99 ? 1 : 0,
          curl = lv.B[i];
        let lr, lg, lb;
        if (v < 0.5) {
          const q = v * 2;
          lr = mix(0.11, 0.24, q);
          lg = mix(0.085, 0.16, q);
          lb = mix(0.06, 0.09, q);
        } else {
          const q = (v - 0.5) * 2;
          lr = mix(0.24, 0.36, q);
          lg = mix(0.16, 0.25, q);
          lb = mix(0.09, 0.12, q);
        }
        const sh = 0.8 + 0.3 * fine[i];
        lr *= sh * (1 - 0.3 * rib);
        lg *= sh * (1 - 0.3 * rib);
        lb *= sh * (1 - 0.3 * rib);
        r = mix(r, lr, cov);
        g = mix(g, lg, cov);
        b = mix(b, lb, cov);
        h += cov * (0.06 + 0.04 * curl) - rib * 0.02;
        ro = mix(ro, 0.75, cov);
      }
      const m = sstep(0.45, 0.75, moist[i]);
      r *= 1 - 0.25 * m;
      g *= 1 - 0.25 * m;
      b *= 1 - 0.23 * m;
      ro -= 0.35 * m;
      L.r[i] = r;
      L.g[i] = g;
      L.b[i] = b;
      L.h[i] = h;
      L.ro[i] = clamp(ro, 0.3, 1);
    }
    return { L, ns: 4, aoR: 2, aoK: 3, aoBake: 0.6, env: 0.25 };
  };

  G.sandbag = () => {
    // tan hessian (burlap) plain weave, 128 yarns per tile each way, sewn seams, damp/earth staining
    const W = 512,
      H = 512,
      L = layer(W, H);
    const T = 128;
    const jx = fbm(W, H, 16, 16, 2, 1501),
      jy = fbm(W, H, 16, 16, 2, 1502);
    const slubU = fbm(W, H, 8, 128, 1, 1503),
      slubV = fbm(W, H, 128, 8, 1, 1504);
    const lump = fbm(W, H, 4, 4, 4, 1505),
      dust = fbm(W, H, 5, 5, 4, 1506),
      fuzz = grain(W, H, 1507, 1),
      damp = fbm(W, H, 3, 3, 4, 1508);
    const YT = new Float32Array(T * 2);
    for (let k = 0; k < T * 2; k++) YT[k] = hsh(k, 1509);
    const seamY = H * 0.5,
      seamX = W * 0.25;
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) {
        const i = y * W + x;
        const wv = weaveAt(
          x,
          y,
          T,
          W,
          H,
          false,
          (jx[i] - 0.5) * 0.5,
          (jy[i] - 0.5) * 0.5,
        );
        const yi = wv.over
          ? ((wv.iu % T) + T) % T
          : T + (((wv.iv % T) + T) % T);
        const th = 0.75 + 0.5 * YT[yi];
        const sl = wv.over ? slubU[i] : slubV[i];
        const hh = clamp(wv.h * (0.7 + 0.6 * sl) * th);
        const open = 1 - sstep(0.04, 0.3, hh);
        const k =
          (0.72 + 0.38 * hh) *
          (0.88 + 0.24 * YT[(yi + 37) % (T * 2)]) *
          (0.93 + 0.14 * fuzz[i]);
        let r = 0.55 * k,
          g = 0.45 * k,
          b = 0.3 * k;
        r = mix(r, 0.16, open * 0.5);
        g = mix(g, 0.13, open * 0.5);
        b = mix(b, 0.09, open * 0.5);
        let h = hh * 0.16 + lump[i] * 0.35 + (fuzz[i] - 0.5) * 0.03;
        // seams: folded ridge with coarse twine stitches
        const dY = Math.abs(y - seamY),
          dX = Math.abs(wrapd(x - seamX, W));
        const fold = Math.exp(-(dY * dY) / 18) + Math.exp(-(dX * dX) / 18);
        h += fold * 0.6;
        const fd =
          Math.exp(-((dY - 3.5) * (dY - 3.5)) / 1.5) +
          Math.exp(-((dX - 3.5) * (dX - 3.5)) / 1.5);
        r *= 1 - 0.4 * fd;
        g *= 1 - 0.4 * fd;
        b *= 1 - 0.4 * fd;
        const stY = Math.abs(y - (seamY - 5)) < 1.2 && x % 9 < 5.5,
          stX = Math.abs(wrapd(x - (seamX + 5), W)) < 1.2 && y % 9 < 5.5;
        if (stY || stX) {
          r = 0.6;
          g = 0.53;
          b = 0.38;
          h += 0.15;
        }
        const ds = sstep(0.5, 0.8, dust[i]) * 0.3;
        r = mix(r, 0.36, ds);
        g = mix(g, 0.3, ds);
        b = mix(b, 0.22, ds);
        const dm = sstep(0.55, 0.8, damp[i]) * 0.22;
        r *= 1 - dm;
        g *= 1 - dm;
        b *= 1 - dm * 0.95;
        L.r[i] = r;
        L.g[i] = g;
        L.b[i] = b;
        L.h[i] = h;
        L.ro[i] = clamp(0.95 - dm * 0.2);
      }
    return { L, ns: 4, aoR: 1, aoK: 5, aoBake: 0.35, env: 0.2 };
  };

  function dots(W, H, seed, n, rmin, rmax, elong = 0, jag = null) {
    const F = new Float32Array(W * H),
      C = new Float32Array(W * H),
      R = RNG(seed);
    for (let k = 0; k < n; k++) {
      const cx = R() * W,
        cy = R() * H,
        r = rmin + R() * R() * (rmax - rmin),
        tone = R();
      const sq = 1 + (R() - 0.5) * 2 * elong,
        a = R() * TAU,
        ca = Math.cos(a),
        sa = Math.sin(a);
      const ext = Math.ceil(r * Math.max(sq, 1 / sq) * 1.4) + 1;
      const rx = 1 / (r * sq),
        ry = sq / r;
      for (let y = Math.floor(cy - ext); y <= cy + ext; y++) {
        const yy = ((y % H) + H) % H,
          dy = y + 0.5 - cy;
        for (let x = Math.floor(cx - ext); x <= cx + ext; x++) {
          const xx = ((x % W) + W) % W,
            dx = x + 0.5 - cx,
            i = yy * W + xx;
          const u = (dx * ca + dy * sa) * rx,
            v = (dy * ca - dx * sa) * ry;
          let d = Math.sqrt(u * u + v * v);
          if (jag) d += (jag[i] - 0.5) * 0.6;
          if (d < 1) {
            const val = 1 - d;
            if (val > F[i]) {
              F[i] = val;
              C[i] = tone;
            }
          }
        }
      }
    }
    return { F, C };
  }

  // ---------------------------------------------------------------- props ----
  const P = 512;

  function gunMetal(seed, o) {
    const S = P,
      L = layer(S, S);
    L.me = new Float32Array(S * S);
    const wear = fbm(S, S, 3, 3, 6, seed + 1),
      wear2 = fbm(S, S, 16, 16, 4, seed + 2),
      tint = fbm(S, S, 3, 3, 5, seed + 3);
    const fine = fbm(S, S, 128, 128, 2, seed + 4, 0.6),
      pit = worley(S, S, 70, 70, seed + 5),
      grain = fbm(S, S, 256, 256, 1, seed + 6);
    const R = RNG(seed + 7);
    const sc = paint(S, S, (ctx, tiled) => {
      drawScratches(ctx, tiled, R, S, S, o.scratches, {
        lmin: 3,
        lmax: 45,
        ang: 0,
        spread: 0.5,
        wmin: 0.45,
        wmax: 0.9,
        amin: 0.15,
        amax: 0.8,
      });
      drawScratches(ctx, tiled, R, S, S, o.scratches / 3, {
        lmin: 3,
        lmax: 25,
        spread: TAU,
        wmin: 0.45,
        wmax: 0.8,
        amin: 0.1,
        amax: 0.5,
      });
    });
    for (let i = 0; i < L.n; i++) {
      const w = sstep(
        o.wearLo,
        o.wearLo + 0.25,
        wear[i] * 0.7 + wear2[i] * 0.3,
      );
      const pl = sstep(0.5, 0.8, tint[i]);
      const gk = o.grainy
        ? (0.8 + 0.4 * grain[i]) * (0.9 + 0.2 * fine[i])
        : 0.95 + 0.1 * fine[i];
      let r = mix(o.base[0], o.alt[0], pl) * gk,
        g = mix(o.base[1], o.alt[1], pl) * gk,
        b = mix(o.base[2], o.alt[2], pl) * gk;
      r = mix(r, o.worn[0], w * 0.85);
      g = mix(g, o.worn[1], w * 0.85);
      b = mix(b, o.worn[2], w * 0.85);
      let ro =
        mix(o.ro, o.roWorn, w) +
        (fine[i] - 0.5) * 0.1 +
        (o.grainy ? (grain[i] - 0.5) * 0.15 : 0);
      let me = mix(o.me, 1, w);
      const s = sc.R[i];
      r = mix(r, 0.58, s * 0.8);
      g = mix(g, 0.58, s * 0.8);
      b = mix(b, 0.59, s * 0.8);
      ro = mix(ro, 0.22, s * 0.8);
      me = mix(me, 1, s);
      let h = (fine[i] - 0.5) * (o.grainy ? 0.06 : 0.02) - s * 0.08;
      if (hsh(pit.id[i], 1) < 0.18 && pit.f1[i] < 0.14) {
        const k = 1 - pit.f1[i] / 0.14;
        r = mix(r, 0.22, k);
        g = mix(g, 0.12, k);
        b = mix(b, 0.07, k);
        me *= 1 - k;
        ro = mix(ro, 0.85, k);
        h -= 0.1 * k;
      }
      setc(L, i, r, g, b);
      L.h[i] = h;
      L.ro[i] = clamp(ro, 0.1, 1);
      L.me[i] = me;
    }
    return L;
  }
  G.gun_metal = () => ({
    L: gunMetal(3000, {
      base: [0.1, 0.11, 0.14],
      alt: [0.14, 0.11, 0.115],
      worn: [0.5, 0.5, 0.51],
      ro: 0.32,
      roWorn: 0.24,
      me: 0.9,
      wearLo: 0.5,
      scratches: 1600,
    }),
    ns: 3,
    env: 1.0,
  });
  G.gun_metal_parkerized = () => ({
    L: gunMetal(3100, {
      base: [0.27, 0.285, 0.25],
      alt: [0.19, 0.2, 0.19],
      worn: [0.46, 0.46, 0.44],
      ro: 0.66,
      roWorn: 0.36,
      me: 0.55,
      wearLo: 0.56,
      scratches: 900,
      grainy: true,
    }),
    ns: 5,
    env: 0.8,
  });

  G.wood_stock = () => {
    const S = P,
      L = layer(S, S);
    const w1 = fbm(S, S, 2, 6, 5, 3201),
      w2 = fbm(S, S, 4, 24, 4, 3202),
      fig = fbm(S, S, 3, 6, 5, 3203);
    const pores = fbm(S, S, 16, 256, 1, 3204),
      fine = fbm(S, S, 128, 128, 2, 3205),
      wear = fbm(S, S, 4, 4, 5, 3206),
      streak = fbm(S, S, 2, 32, 4, 3207);
    const R = RNG(3208);
    const sc = paint(S, S, (ctx, tiled) => {
      drawScratches(ctx, tiled, R, S, S, 160, {
        lmin: 4,
        lmax: 40,
        spread: TAU,
        wmin: 0.6,
        wmax: 1.4,
        amin: 0.2,
        amax: 0.7,
      });
      const dn = [];
      for (let k = 0; k < 40; k++)
        dn.push([R() * S, R() * S, 1.5 + R() * 3, R() * TAU]);
      tiled(() => {
        for (const [x, y, r, a] of dn) {
          ctx.fillStyle = "rgba(0,255,0,0.7)";
          ctx.beginPath();
          ctx.ellipse(x, y, r * 1.8, r * 0.7, a, 0, TAU);
          ctx.fill();
        }
      });
    });
    for (let y = 0; y < S; y++)
      for (let x = 0; x < S; x++) {
        const i = y * S + x;
        const rc = (y / S) * 11 + (w1[i] - 0.5) * 7 + (w2[i] - 0.5) * 1.8;
        const t = fract(rc),
          late = sstep(0.45, 0.95, t);
        let r = mix(0.35, 0.19, late * 0.8),
          g = mix(0.215, 0.105, late * 0.8),
          b = mix(0.12, 0.055, late * 0.8);
        const f =
          sstep(0.5, 0.8, fig[i]) * 0.6 + sstep(0.55, 0.85, streak[i]) * 0.4;
        r = mix(r, 0.13, f * 0.45);
        g = mix(g, 0.07, f * 0.45);
        b = mix(b, 0.04, f * 0.45);
        const pr = 1 - sstep(0.18, 0.32, pores[i]);
        r *= 1 - 0.45 * pr;
        g *= 1 - 0.5 * pr;
        b *= 1 - 0.5 * pr;
        const wr = sstep(0.6, 0.85, wear[i]);
        r = mix(r, r * 1.2 + 0.04, wr);
        g = mix(g, g * 1.2 + 0.025, wr);
        b = mix(b, b * 1.15 + 0.012, wr);
        const s = sc.R[i],
          dn = sc.G[i];
        r = mix(r, 0.52, s * 0.35);
        g = mix(g, 0.36, s * 0.35);
        b = mix(b, 0.22, s * 0.35);
        r *= 1 - 0.25 * dn;
        g *= 1 - 0.28 * dn;
        b *= 1 - 0.3 * dn;
        setc(L, i, r, g, b);
        L.h[i] =
          late * 0.03 -
          pr * 0.05 -
          s * 0.05 -
          dn * 0.2 +
          (fine[i] - 0.5) * 0.01;
        L.ro[i] = clamp(
          0.38 + pr * 0.15 + wr * 0.25 + s * 0.2 + (fine[i] - 0.5) * 0.06,
        );
      }
    return { L, ns: 3, env: 0.6 };
  };

  G.bakelite = () => {
    const S = P,
      L = layer(S, S);
    const a = fbm(S, S, 3, 3, 5, 3301),
      wx = fbm(S, S, 4, 4, 4, 3302),
      wy = fbm(S, S, 4, 4, 4, 3303),
      fine = fbm(S, S, 128, 128, 2, 3304),
      wear = fbm(S, S, 5, 5, 5, 3305);
    const R = RNG(3306);
    const sc = paint(S, S, (ctx, tiled) =>
      drawScratches(ctx, tiled, R, S, S, 500, {
        lmin: 3,
        lmax: 30,
        spread: TAU,
        wmin: 0.4,
        wmax: 0.9,
        amin: 0.1,
        amax: 0.5,
      }),
    );
    for (let y = 0; y < S; y++)
      for (let x = 0; x < S; x++) {
        const i = y * S + x;
        const v = samp(
          a,
          S,
          S,
          x + (wx[i] - 0.5) * 160,
          y + (wy[i] - 0.5) * 160,
        );
        const band = sstep(0.4, 0.6, v),
          vein = sstep(0.04, 0, Math.abs(fract(v * 4) - 0.5) - 0.44);
        let r = mix(0.2, 0.1, band),
          g = mix(0.065, 0.032, band),
          b = mix(0.042, 0.022, band);
        r = mix(r, 0.3, vein * 0.35);
        g = mix(g, 0.1, vein * 0.35);
        b = mix(b, 0.06, vein * 0.35);
        const wr = sstep(0.62, 0.85, wear[i]);
        r = mix(r, r * 1.25 + 0.03, wr);
        g = mix(g, g * 1.2 + 0.015, wr);
        b = mix(b, b * 1.15 + 0.01, wr);
        const s = sc.R[i];
        setc(L, i, r + s * 0.05, g + s * 0.03, b + s * 0.02);
        L.h[i] = (fine[i] - 0.5) * 0.01 - s * 0.05;
        L.ro[i] = clamp(0.17 + wr * 0.25 + s * 0.3 + (fine[i] - 0.5) * 0.05);
      }
    return { L, ns: 3, env: 0.7 };
  };

  G.brass = () => {
    const S = P,
      L = layer(S, S);
    L.me = new Float32Array(S * S).fill(1);
    const tar = fbm(S, S, 4, 4, 6, 3401),
      brushed = fbm(S, S, 4, 256, 1, 3402),
      fine = fbm(S, S, 128, 128, 2, 3403),
      verd = worley(S, S, 30, 30, 3404),
      smudge = fbm(S, S, 8, 8, 4, 3405);
    for (let i = 0; i < L.n; i++) {
      const t = sstep(0.45, 0.8, tar[i]);
      let r = mix(0.8, 0.46, t),
        g = mix(0.62, 0.33, t),
        b = mix(0.3, 0.14, t);
      const bk = 0.94 + 0.12 * brushed[i];
      r *= bk;
      g *= bk;
      b *= bk;
      let ro =
          mix(0.26, 0.5, t) +
          (brushed[i] - 0.5) * 0.12 +
          sstep(0.6, 0.8, smudge[i]) * 0.12,
        me = 1;
      if (t > 0.6 && hsh(verd.id[i], 1) < 0.25 && verd.f1[i] < 0.2) {
        const k = (1 - verd.f1[i] / 0.2) * sstep(0.6, 0.9, t);
        r = mix(r, 0.25, k);
        g = mix(g, 0.42, k);
        b = mix(b, 0.33, k);
        me = 1 - k;
        ro = mix(ro, 0.9, k);
      }
      setc(L, i, r, g, b);
      L.h[i] = (fine[i] - 0.5) * 0.015 + brushed[i] * 0.01;
      L.ro[i] = clamp(ro);
      L.me[i] = me;
    }
    return { L, ns: 3, env: 1.0 };
  };

  function leatherGen(seed, o) {
    const S = P,
      L = layer(S, S);
    const peb = worley(S, S, 110, 110, seed + 1),
      mott = fbm(S, S, 6, 6, 5, seed + 2),
      wear = fbm(S, S, 4, 4, 6, seed + 3),
      fine = fbm(S, S, 256, 256, 1, seed + 4);
    const R = RNG(seed + 5);
    const cr = paint(S, S, (ctx, tiled) =>
      drawCracks(
        ctx,
        tiled,
        crackLines(R, S, S, o.creases, 30, 120, 0.9, 0.02, 0.25, 4),
        5,
        80,
      ),
    );
    for (let i = 0; i < L.n; i++) {
      const e = peb.f2[i] - peb.f1[i],
        crease = 1 - sstep(0, 0.12, e);
      const dome = 1 - peb.f1[i];
      const m = 0.9 + 0.2 * mott[i];
      let r = o.base[0] * m,
        g = o.base[1] * m,
        b = o.base[2] * m;
      const w = sstep(0.6, 0.9, wear[i]) * 0.7;
      r = mix(r, o.worn[0], w);
      g = mix(g, o.worn[1], w);
      b = mix(b, o.worn[2], w);
      const c = cr.R[i],
        ha = cr.G[i];
      const dk = (1 - 0.3 * crease) * (1 - 0.3 * c) * (1 - 0.15 * ha);
      r *= dk;
      g *= dk;
      b *= dk;
      r = mix(r, o.worn[0], ha * w * 0.5);
      setc(L, i, r, g, b);
      L.h[i] =
        dome * 0.08 -
        crease * 0.05 -
        c * 0.15 -
        ha * 0.1 +
        (fine[i] - 0.5) * 0.01;
      L.ro[i] = clamp(o.ro + crease * 0.1 + w * 0.12 - (dome - 0.5) * 0.05);
    }
    return L;
  }
  G.leather = () => ({
    L: leatherGen(3500, {
      base: [0.33, 0.19, 0.1],
      worn: [0.47, 0.32, 0.19],
      creases: 18,
      ro: 0.55,
    }),
    ns: 5,
    env: 0.5,
  });
  G.glove_leather = () => ({
    L: leatherGen(3600, {
      base: [0.21, 0.13, 0.075],
      worn: [0.36, 0.25, 0.16],
      creases: 22,
      ro: 0.62,
    }),
    ns: 6,
    env: 0.45,
  });

  G.rubber_black = () => {
    const S = P,
      L = layer(S, S);
    const fine = fbm(S, S, 128, 128, 2, 3701),
      dust = fbm(S, S, 5, 5, 5, 3702),
      grain = fbm(S, S, 256, 256, 1, 3703);
    const R = RNG(3704);
    const sc = paint(S, S, (ctx, tiled) =>
      drawScratches(ctx, tiled, R, S, S, 200, {
        lmin: 3,
        lmax: 20,
        spread: TAU,
        wmin: 0.6,
        wmax: 1.4,
        amin: 0.1,
        amax: 0.4,
      }),
    );
    for (let i = 0; i < L.n; i++) {
      const d = sstep(0.55, 0.85, dust[i]) * 0.5,
        s = sc.R[i];
      const v = 0.04 + (fine[i] - 0.5) * 0.015 + d * 0.12 + s * 0.08;
      setc(L, i, v, v, v * 0.97);
      L.h[i] = grain[i] * 0.05 + fine[i] * 0.03 - s * 0.05;
      L.ro[i] = clamp(0.82 + d * 0.12 - s * 0.1);
    }
    return { L, ns: 4, env: 0.4 };
  };

  function clothGen(seed, o) {
    const S = P,
      L = layer(S, S);
    const jx = fbm(S, S, 16, 16, 3, seed + 1),
      jy = fbm(S, S, 16, 16, 3, seed + 2),
      fuzz = fbm(S, S, 128, 128, 2, seed + 3, 0.7);
    const mott = fbm(S, S, 5, 5, 5, seed + 4),
      stainA = fbm(S, S, 4, 4, 6, seed + 5),
      stainB = fbm(S, S, 5, 5, 6, seed + 6),
      slub = fbm(S, S, 16, 128, 2, seed + 7);
    const R = RNG(seed + 8);
    let tear = null;
    if (o.tears) {
      tear = paint(S, S, (ctx, tiled) => {
        const lines = crackLines(R, S, S, o.tears, 30, 110, 4.5, 0.02, 0.35, 3);
        drawCracks(ctx, tiled, lines, 3.2, 120);
      });
    }
    for (let i = 0; i < L.n; i++) {
      const x = i % S,
        y = (i / S) | 0;
      const wv = weaveAt(
        x,
        y,
        o.T,
        S,
        S,
        o.twill,
        (jx[i] - 0.5) * 0.5,
        (jy[i] - 0.5) * 0.5,
      );
      const hh = clamp(wv.h * (0.8 + 0.4 * slub[i]));
      const yarnT = wv.over ? hsh(wv.iu, seed) : hsh(wv.iv, seed + 1);
      const mk = o.mottK ?? 0.24;
      const m =
        (0.82 + 0.3 * hh * o.weaveC + (1 - o.weaveC) * 0.3) *
        (1 - mk / 2 + mk * mott[i]) *
        (0.94 + 0.12 * yarnT) *
        (0.9 + 0.2 * fuzz[i]);
      let r = o.base[0] * m,
        g = o.base[1] * m,
        b = o.base[2] * m;
      const sa = sstep(0.66, 0.78, stainA[i]) * o.stainA,
        sb = sstep(0.64, 0.8, stainB[i]) * o.stainB;
      r = mix(r, 0.13, sa);
      g = mix(g, 0.06, sa);
      b = mix(b, 0.045, sa);
      r = mix(r, 0.27, sb);
      g = mix(g, 0.22, sb);
      b = mix(b, 0.15, sb);
      let h = hh * o.weaveH + fuzz[i] * 0.06,
        ro = clamp(0.9 + (fuzz[i] - 0.5) * 0.1 - sa * 0.35);
      if (tear) {
        const t = tear.R[i],
          f = tear.G[i];
        r = mix(r * (1 + 0.2 * f), 0.025, t);
        g = mix(g * (1 + 0.2 * f), 0.02, t);
        b = mix(b * (1 + 0.2 * f), 0.018, t);
        h -= t * 0.6 - f * 0.05;
      }
      setc(L, i, r, g, b);
      L.h[i] = h;
      L.ro[i] = ro;
    }
    return L;
  }
  G.cloth_canvas = () => ({
    L: clothGen(3800, {
      T: 128,
      twill: false,
      base: [0.44, 0.4, 0.28],
      weaveC: 1,
      weaveH: 0.5,
      stainA: 0.15,
      stainB: 0.28,
      mottK: 0.14,
    }),
    ns: 5,
    env: 0.25,
  });
  G.cloth_fieldgrey = () => ({
    L: clothGen(3900, {
      T: 150,
      twill: true,
      base: [0.3, 0.335, 0.3],
      weaveC: 0.6,
      weaveH: 0.35,
      stainA: 0.6,
      stainB: 0.35,
      tears: 9,
    }),
    ns: 5,
    env: 0.2,
  });
  G.sleeve_olive = () => ({
    L: clothGen(4000, {
      T: 128,
      twill: true,
      base: [0.31, 0.3, 0.18],
      weaveC: 1,
      weaveH: 0.55,
      stainA: 0.1,
      stainB: 0.45,
      mottK: 0.4,
    }),
    ns: 5,
    env: 0.25,
  });

  G.skin_rotten = () => {
    const S = P,
      L = layer(S, S);
    const m1 = fbm(S, S, 3, 3, 6, 4101),
      m2 = fbm(S, S, 6, 6, 5, 4102),
      m3 = fbm(S, S, 4, 4, 5, 4103),
      fine = fbm(S, S, 128, 128, 3, 4104, 0.55);
    const wx = fbm(S, S, 6, 6, 4, 4105),
      wy = fbm(S, S, 6, 6, 4, 4106);
    const vb = worley(S, S, 7, 7, 4107),
      vs = worley(S, S, 22, 22, 4108),
      les = worley(S, S, 9, 9, 4109, 0.7),
      pores = worley(S, S, 160, 160, 4110);
    const vmask = fbm(S, S, 3, 3, 5, 4111);
    const eb = new Float32Array(L.n),
      es = new Float32Array(L.n);
    for (let i = 0; i < L.n; i++) {
      eb[i] = vb.f2[i] - vb.f1[i];
      es[i] = vs.f2[i] - vs.f1[i];
    }
    for (let y = 0; y < S; y++)
      for (let x = 0; x < S; x++) {
        const i = y * S + x;
        const ox = (wx[i] - 0.5) * 60,
          oy = (wy[i] - 0.5) * 60;
        const veinB = 1 - sstep(0.0, 0.045, samp(eb, S, S, x + ox, y + oy));
        const veinS =
          1 - sstep(0.0, 0.03, samp(es, S, S, x + ox * 0.6, y + oy * 0.6));
        const vm = sstep(0.4, 0.7, vmask[i]);
        const vein = clamp(veinB * vm * 0.9 + veinS * vm * 0.45);
        let r = 0.43,
          g = 0.47,
          b = 0.38;
        const k = 0.85 + 0.3 * m1[i];
        r *= k;
        g *= k;
        b *= k;
        const bru = sstep(0.55, 0.8, m2[i]);
        r = mix(r, 0.36, bru * 0.7);
        g = mix(g, 0.29, bru * 0.7);
        b = mix(b, 0.36, bru * 0.7);
        const yel = sstep(0.6, 0.85, m3[i]);
        r = mix(r, 0.52, yel * 0.6);
        g = mix(g, 0.47, yel * 0.6);
        b = mix(b, 0.26, yel * 0.6);
        const dk = sstep(0.1, 0.35, m2[i] * (1 - m3[i]));
        r = mix(r, 0.2, (1 - dk) * 0.5);
        g = mix(g, 0.24, (1 - dk) * 0.5);
        b = mix(b, 0.19, (1 - dk) * 0.5);
        r = mix(r, 0.2, vein * 0.75);
        g = mix(g, 0.17, vein * 0.75);
        b = mix(b, 0.3, vein * 0.75);
        let h =
          0.5 + (m1[i] - 0.5) * 0.15 + (fine[i] - 0.5) * 0.12 + vein * 0.12;
        let ro = 0.62 + (fine[i] - 0.5) * 0.12 - bru * 0.1;
        const pid = pores.id[i];
        if (pores.f1[i] < 0.22 && hsh(pid, 1) < 0.6) {
          const kk = 1 - pores.f1[i] / 0.22;
          h -= 0.08 * kk;
          r *= 1 - 0.2 * kk;
          g *= 1 - 0.2 * kk;
          b *= 1 - 0.2 * kk;
        }
        // lesions: raised angry rims, wet necrotic centres
        const lid = les.id[i],
          lr = 0.1 + 0.3 * hsh(lid, 2) * hsh(lid, 3);
        if (hsh(lid, 1) < 0.2) {
          const d =
            les.f1[i] / lr +
            (samp(m3, S, S, x * 3.7, y * 3.7) - 0.5) * 0.9 +
            (fine[i] - 0.5) * 0.15;
          if (d < 1.5) {
            const rim = Math.exp(-((d - 1) * (d - 1)) / 0.03);
            const inner = 1 - sstep(0.75, 1.0, d);
            r = mix(r, 0.48, rim * 0.6);
            g = mix(g, 0.27, rim * 0.6);
            b = mix(b, 0.24, rim * 0.6);
            const wet = inner * (0.7 + 0.3 * fine[i]);
            r = mix(r, mix(0.3, 0.16, fine[i]), wet * 0.85);
            g = mix(g, 0.07, wet * 0.85);
            b = mix(b, mix(0.06, 0.04, fine[i]), wet * 0.85);
            h += rim * 0.2 - inner * 0.35 + inner * (fine[i] - 0.5) * 0.2;
            ro = mix(ro, 0.22, wet);
          }
        }
        setc(L, i, r, g, b);
        L.h[i] = h;
        L.ro[i] = clamp(ro);
      }
    return { L, ns: 6, env: 0.45 };
  };

  G.bone = () => {
    const S = P,
      L = layer(S, S);
    const m = fbm(S, S, 4, 4, 6, 4201),
      fine = fbm(S, S, 128, 128, 2, 4202),
      por = worley(S, S, 120, 120, 4203),
      st = fbm(S, S, 6, 6, 5, 4204),
      fib = fbm(S, S, 16, 128, 2, 4205);
    const R = RNG(4206);
    const cr = paint(S, S, (ctx, tiled) =>
      drawCracks(ctx, tiled, crackLines(R, S, S, 5, 30, 110, 1, 0.02), 3, 60),
    );
    for (let i = 0; i < L.n; i++) {
      const k = 0.88 + 0.2 * m[i] + (fib[i] - 0.5) * 0.08;
      let r = 0.8 * k,
        g = 0.74 * k,
        b = 0.6 * k;
      const s = sstep(0.5, 0.85, st[i]);
      r = mix(r, 0.55, s * 0.35);
      g = mix(g, 0.45, s * 0.35);
      b = mix(b, 0.3, s * 0.35);
      let h = m[i] * 0.2 + fib[i] * 0.05;
      if (por.f1[i] < 0.25 && hsh(por.id[i], 1) < 0.5) {
        const q = 1 - por.f1[i] / 0.25;
        h -= 0.12 * q;
        r *= 1 - 0.35 * q;
        g *= 1 - 0.4 * q;
        b *= 1 - 0.45 * q;
      }
      const c = cr.R[i],
        ha = cr.G[i];
      r *= 1 - 0.6 * c - 0.1 * ha;
      g *= 1 - 0.65 * c - 0.12 * ha;
      b *= 1 - 0.7 * c - 0.14 * ha;
      h -= c * 0.3;
      setc(L, i, r, g, b);
      L.h[i] = h;
      L.ro[i] = clamp(0.55 + (fine[i] - 0.5) * 0.15 + s * 0.15);
    }
    return { L, ns: 5, env: 0.5 };
  };

  G.helmet_steel = () => {
    const S = P,
      L = layer(S, S);
    L.me = new Float32Array(S * S);
    const grit = fbm(S, S, 256, 256, 1, 4301),
      mott = fbm(S, S, 5, 5, 5, 4302),
      chipN = fbm(S, S, 8, 8, 5, 4303, 0.6),
      chipH = fbm(S, S, 32, 32, 3, 4304, 0.6);
    const grime = fbm(S, S, 3, 3, 6, 4305),
      rustN = fbm(S, S, 24, 24, 4, 4306),
      fine = fbm(S, S, 128, 128, 2, 4307);
    const R = RNG(4308);
    const sc = paint(S, S, (ctx, tiled) =>
      drawScratches(ctx, tiled, R, S, S, 240, {
        lmin: 5,
        lmax: 60,
        spread: TAU,
        wmin: 0.6,
        wmax: 1.5,
        amin: 0.4,
        amax: 1,
        curve: 0.04,
      }),
    );
    for (let i = 0; i < L.n; i++) {
      const cv = chipN[i] * 0.55 + chipH[i] * 0.45 + 0.02;
      const k = (0.76 + 0.46 * mott[i]) * (0.86 + 0.28 * grit[i]);
      let r = 0.32 * k,
        g = 0.345 * k,
        b = 0.31 * k,
        h = 0.8 + grit[i] * 0.08 + (fine[i] - 0.5) * 0.03,
        ro = 0.72 + (grit[i] - 0.5) * 0.12,
        me = 0;
      const edge = sstep(0.62, 0.65, cv) * (1 - sstep(0.66, 0.68, cv));
      r *= 1 - 0.3 * edge;
      g *= 1 - 0.3 * edge;
      b *= 1 - 0.3 * edge;
      if (cv > 0.665) {
        const rk = sstep(0.45, 0.7, rustN[i]) * 0.8;
        r = mix(0.36, 0.34, rk);
        g = mix(0.36, 0.17, rk);
        b = mix(0.37, 0.08, rk);
        me = 1 - rk;
        ro = mix(0.38, 0.85, rk) + (fine[i] - 0.5) * 0.1;
        h = 0.68 + (fine[i] - 0.5) * 0.04;
      }
      const s = sc.R[i] * (cv > 0.665 ? 0 : 1);
      r = mix(r, 0.5, s * 0.8);
      g = mix(g, 0.5, s * 0.8);
      b = mix(b, 0.5, s * 0.8);
      me = Math.max(me, s * 0.85);
      ro = mix(ro, 0.35, s);
      h -= s * 0.08;
      const gm = sstep(0.45, 0.9, grime[i]);
      r = mix(r, r * 0.55 + 0.02, gm);
      g = mix(g, g * 0.55 + 0.018, gm);
      b = mix(b, b * 0.5 + 0.01, gm);
      ro += gm * 0.1;
      setc(L, i, r, g, b);
      L.h[i] = h;
      L.ro[i] = clamp(ro);
      L.me[i] = me;
    }
    return { L, ns: 6, env: 0.7 };
  };

  G.packed_camo = () => {
    const S = P,
      L = layer(S, S);
    L.me = new Float32Array(S * S);
    const a = fbm(S, S, 3, 3, 5, 4401),
      b0 = fbm(S, S, 3, 3, 5, 4402),
      c0 = fbm(S, S, 4, 4, 5, 4403),
      d0 = fbm(S, S, 4, 4, 5, 4404),
      fine = fbm(S, S, 64, 64, 3, 4405);
    const E = {
      r: new Float32Array(L.n),
      g: new Float32Array(L.n),
      b: new Float32Array(L.n),
    };
    for (let y = 0; y < S; y++)
      for (let x = 0; x < S; x++) {
        const i = y * S + x;
        const qx = a[i],
          qy = b0[i];
        const rx = samp(c0, S, S, x + qx * S * 0.4, y + qy * S * 0.4),
          ry = samp(d0, S, S, x + qx * S * 0.4 + 97, y + qy * S * 0.4 + 31);
        const v = samp(a, S, S, x + rx * S * 0.55, y + ry * S * 0.55);
        const t = clamp((v - 0.2) / 0.6);
        let r, g, b;
        if (t < 0.5) {
          const k = t * 2;
          r = mix(0.07, 0.42, k);
          g = mix(0.01, 0.06, k);
          b = mix(0.16, 0.72, k);
        } else {
          const k = (t - 0.5) * 2;
          r = mix(0.42, 0.04, k);
          g = mix(0.06, 0.8, k);
          b = mix(0.72, 0.95, k);
        }
        const band = fract(v * 6 + rx * 2.5);
        const fil =
          sstep(0.07, 0.0, Math.abs(band - 0.5)) * (0.5 + 0.5 * fine[i]);
        setc(
          L,
          i,
          r * 0.8 + fil * 0.3,
          g * 0.8 + fil * 0.3,
          b * 0.8 + fil * 0.3,
        );
        const gl = 0.25 + 0.75 * sstep(0.45, 1.0, t);
        E.r[i] = clamp(r * gl + fil * 0.75);
        E.g[i] = clamp(g * gl + fil * 0.85);
        E.b[i] = clamp(b * gl + fil * 0.9);
        L.h[i] = v * 0.4 + fil * 0.05;
        L.ro[i] = 0.25 + (fine[i] - 0.5) * 0.1;
        L.me[i] = 0.55;
      }
    return { L, ns: 2, env: 0.9, emissive: E };
  };

  return {
    run(name) {
      const f = G[name];
      if (!f) throw new Error("no generator " + name);
      PROF = {};
      const t = performance.now();
      const d = f();
      PROF.gen = performance.now() - t;
      const o = bake(d);
      PROF.total = performance.now() - t;
      for (const k in PROF) PROF[k] = Math.round(PROF[k]);
      o.meta.prof = PROF;
      return o;
    },
    has(name) {
      return !!G[name];
    },
  };
}

// ------------------------------------------------------------------------------------------------
// environment map: dim, warm-bulb bunker interior with a cold moonlit window
// ------------------------------------------------------------------------------------------------
function buildEnv(renderer) {
  const scene = new THREE.Scene();
  const geos = [],
    mats = [];
  const add = (geo, color, pos, rot) => {
    const m = new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide });
    const mesh = new THREE.Mesh(geo, m);
    geos.push(geo);
    mats.push(m);
    if (pos) mesh.position.set(...pos);
    if (rot) mesh.rotation.set(...rot);
    scene.add(mesh);
    return mesh;
  };
  // room shell with vertical gradient (vertex colours)
  const box = new THREE.BoxGeometry(14, 4.5, 14, 8, 6, 8);
  const cols = [],
    p = box.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i),
      x = p.getX(i),
      z = p.getZ(i);
    const t = (y + 2.25) / 4.5;
    const hv =
      Math.sin(
        Math.round(x * 3) * 12.9898 +
          Math.round(z * 3) * 78.233 +
          Math.round(y * 3) * 37.719,
      ) * 43758.5453;
    const n = 0.8 + 0.4 * (hv - Math.floor(hv));
    cols.push(
      (0.018 + 0.035 * t) * n,
      (0.015 + 0.027 * t) * n,
      (0.012 + 0.02 * t) * n,
    );
  }
  box.setAttribute("color", new THREE.Float32BufferAttribute(cols, 3));
  const shellM = new THREE.MeshBasicMaterial({
    vertexColors: true,
    side: THREE.BackSide,
  });
  scene.add(new THREE.Mesh(box, shellM));
  geos.push(box);
  mats.push(shellM);
  // bulbs + their warm pools on ceiling/walls
  const bulbs = [
    [-3, 1.6, -2.5],
    [3.5, 1.7, 2.5],
    [0, 1.7, -5.5],
    [-4.5, 1.6, 4],
  ];
  const sg = new THREE.SphereGeometry(0.13, 12, 8);
  for (const b of bulbs) {
    add(sg, new THREE.Color(9, 5.2, 2.2), b);
    add(
      new THREE.CircleGeometry(1.4, 24),
      new THREE.Color(0.16, 0.1, 0.05),
      [b[0], 2.24, b[2]],
      [Math.PI / 2, 0, 0],
    );
  }
  // moon window on +X wall with mullions, plus its floor spill
  add(
    new THREE.PlaneGeometry(2.6, 1.5),
    new THREE.Color(0.55, 0.68, 1.0).multiplyScalar(1.6),
    [6.95, 0.9, 0.5],
    [0, -Math.PI / 2, 0],
  );
  add(
    new THREE.PlaneGeometry(0.12, 1.6),
    new THREE.Color(0.01, 0.01, 0.012),
    [6.9, 0.9, 0.5],
    [0, -Math.PI / 2, 0],
  );
  add(
    new THREE.PlaneGeometry(2.7, 0.1),
    new THREE.Color(0.01, 0.01, 0.012),
    [6.9, 0.9, 0.5],
    [0, -Math.PI / 2, 0],
  );
  add(
    new THREE.PlaneGeometry(3, 2.2),
    new THREE.Color(0.035, 0.045, 0.07),
    [5, -2.23, 0.5],
    [-Math.PI / 2, 0, 0],
  );
  // a warm fire glow low on the -X side (burning barrel)
  add(
    new THREE.SphereGeometry(0.35, 12, 8),
    new THREE.Color(2.2, 0.8, 0.2),
    [-6.2, -1.3, -1],
  );
  const pm = new THREE.PMREMGenerator(renderer);
  const rt = pm.fromScene(scene, 0.035);
  pm.dispose();
  for (const g of geos) g.dispose();
  for (const m of mats) m.dispose();
  return rt.texture;
}

// ------------------------------------------------------------------------------------------------
// worker pool + IndexedDB cache
// ------------------------------------------------------------------------------------------------
// Runs inside each Blob worker. Self-contained (serialised with toString()).
function workerMain(g) {
  let dbp = null;
  const openDB = () =>
    dbp ||
    (dbp = new Promise((res) => {
      try {
        const rq = indexedDB.open("unburied-textures", 1);
        rq.onupgradeneeded = () => rq.result.createObjectStore("tex");
        rq.onsuccess = () => res(rq.result);
        rq.onerror = () => res(null);
        rq.onblocked = () => res(null);
      } catch (e) {
        res(null);
      }
    }));
  const get = async (key) => {
    const db = await openDB();
    if (!db) return null;
    return new Promise((res) => {
      try {
        const rq = db
          .transaction("tex", "readonly")
          .objectStore("tex")
          .get(key);
        rq.onsuccess = () => res(rq.result || null);
        rq.onerror = () => res(null);
      } catch (e) {
        res(null);
      }
    });
  };
  const put = async (key, val) => {
    const db = await openDB();
    if (!db) return;
    try {
      db.transaction("tex", "readwrite").objectStore("tex").put(val, key);
    } catch (e) {
      /* quota etc. */
    }
  };
  self.onmessage = async (e) => {
    const { name, version, cache } = e.data;
    try {
      let out = null,
        hit = false;
      if (cache) {
        const c = await get(name);
        if (c && c.version === version) {
          out = c.out;
          hit = true;
        }
      }
      if (!out) {
        out = g.run(name);
        if (cache) await put(name, { version, out }); // clones synchronously, before we transfer
      }
      const tr = [out.col.buffer, out.orm.buffer, out.nrm.buffer];
      if (out.emi) tr.push(out.emi.buffer);
      self.postMessage({ name, out, hit }, tr);
    } catch (err) {
      self.postMessage({ name, error: String((err && err.stack) || err) });
    }
  };
}

function strHash(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(36);
}

// dispatch jobs to up to n workers; resolves with the names that could not be done in a worker
function runPool(jobs, n, version, cache, onResult) {
  return new Promise((resolve) => {
    let url;
    try {
      const src = `const GEN = ${GEN.toString()};\nconst g = GEN();\n(${workerMain.toString()})(g);\n`;
      url = URL.createObjectURL(new Blob([src], { type: "text/javascript" }));
    } catch (e) {
      resolve(jobs.slice());
      return;
    }
    const queue = jobs.slice(),
      failed = [];
    let live = 0,
      outstanding = jobs.length;
    const finish = () => {
      if (outstanding > 0 && live > 0) return;
      URL.revokeObjectURL(url);
      resolve(failed.concat(queue.splice(0)));
    };
    const feed = (w) => {
      const name = queue.shift();
      if (!name) {
        w.terminate();
        live--;
        w.cur = null;
        finish();
        return;
      }
      w.cur = name;
      w.postMessage({ name, version, cache });
    };
    for (let k = 0; k < n; k++) {
      let w;
      try {
        w = new Worker(url);
      } catch (e) {
        continue;
      }
      live++;
      w.onmessage = (e) => {
        const d = e.data;
        outstanding--;
        if (d.error) {
          console.warn(
            "[textures] worker failed on",
            d.name,
            d.error.slice(0, 300),
          );
          failed.push(d.name);
        } else {
          try {
            onResult(d.name, d.out, d.hit);
          } catch (err) {
            console.error("[textures]", d.name, err);
            failed.push(d.name);
          }
        }
        feed(w);
      };
      w.onerror = (ev) => {
        ev.preventDefault?.();
        if (w.cur) {
          failed.push(w.cur);
          outstanding--;
        }
        w.cur = null;
        try {
          w.terminate();
        } catch (e) {
          /* */
        }
        live--;
        finish();
      };
      feed(w);
    }
    if (!live) {
      URL.revokeObjectURL(url);
      resolve(jobs.slice());
    }
  });
}

// ------------------------------------------------------------------------------------------------
// public API
// ------------------------------------------------------------------------------------------------
const yieldFrame = () =>
  new Promise((r) => {
    if (
      typeof document !== "undefined" &&
      document.hidden &&
      typeof MessageChannel !== "undefined"
    ) {
      const c = new MessageChannel();
      c.port1.onmessage = () => r();
      c.port2.postMessage(0);
    } else setTimeout(r, 0);
  });

function mkTex(bytes, W, H, srgb, aniso) {
  const t = new THREE.DataTexture(
    new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength),
    W,
    H,
    THREE.RGBAFormat,
    THREE.UnsignedByteType,
  );
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.magFilter = THREE.LinearFilter;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.generateMipmaps = true;
  t.anisotropy = aniso;
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.needsUpdate = true;
  return t;
}

// opts: { workers?: number (0 = main thread only), cache?: bool (IndexedDB, default true) }
export async function createTextures(renderer, onProgress, opts = {}) {
  const T0 = performance.now();
  const aniso =
    renderer && renderer.capabilities && renderer.capabilities.getMaxAnisotropy
      ? renderer.capabilities.getMaxAnisotropy()
      : 1;
  const names = [...ARCH, ...PROPS];
  const total = names.length + 1;
  let done = 0;
  const prog = () => {
    try {
      onProgress && onProgress(Math.min(1, done / total));
    } catch (e) {
      /* ignore */
    }
  };
  prog();

  const store = new Map(),
    timings = {};
  let cacheHits = 0;
  const prof = {};
  const accept = (name, out, hit) => {
    const tx = {
      map: mkTex(out.col, out.W, out.H, true, aniso),
      normalMap: mkTex(out.nrm, out.W, out.H, false, aniso),
      roughnessMap: mkTex(out.orm, out.W, out.H, false, aniso),
    };
    if (out.meta.metal) tx.metalnessMap = tx.roughnessMap;
    if (out.meta.ao) tx.aoMap = tx.roughnessMap;
    if (out.emi) tx.emissiveMap = mkTex(out.emi, out.W, out.H, true, aniso);
    for (const k of ["map", "normalMap", "roughnessMap", "emissiveMap"]) {
      if (tx[k] && renderer && renderer.initTexture) {
        try {
          renderer.initTexture(tx[k]);
        } catch (e) {
          /* uploads lazily */
        }
      }
    }
    store.set(name, { tx, meta: out.meta });
    prof[name] = out.meta.prof;
    if (hit) cacheHits++;
    timings[name] = Math.round(performance.now() - T0);
    done++;
    prog();
  };

  // environment first (GPU work on the main thread while workers crunch)
  let envMap = null;
  const hc =
    (typeof navigator !== "undefined" && navigator.hardwareConcurrency) || 4;
  const nWorkers = opts.workers ?? Math.max(0, Math.min(6, hc - 1));
  const canWork =
    nWorkers > 0 &&
    typeof Worker !== "undefined" &&
    typeof Blob !== "undefined" &&
    typeof OffscreenCanvas !== "undefined";
  const version = strHash(GEN.toString());
  // biggest jobs first so the pool drains evenly
  const jobs = names.slice().sort((a, b) => (COST[b] || 1) - (COST[a] || 1));
  const poolP = canWork
    ? runPool(
        jobs,
        nWorkers,
        version,
        opts.cache !== false && typeof indexedDB !== "undefined",
        accept,
      )
    : Promise.resolve(jobs);
  try {
    if (renderer) envMap = buildEnv(renderer);
  } catch (e) {
    console.warn("[textures] envMap failed", e);
  }
  done++;
  prog();

  const leftovers = await poolP;
  if (leftovers.length) {
    let g = null;
    try {
      g = GEN();
    } catch (e) {
      console.error("[textures] generator init failed", e);
    }
    for (const name of leftovers) {
      await yieldFrame();
      const t0 = performance.now();
      try {
        accept(name, g.run(name), false);
      } catch (e) {
        console.error("[textures] generation failed for", name, e);
      }
      timings[name + " (main)"] = Math.round(performance.now() - t0);
    }
  }

  const baseCache = new Map(),
    ovCache = new Map(),
    warned = new Set();
  let fallback = null;
  const getFallback = () =>
    fallback ||
    (fallback = new THREE.MeshStandardMaterial({
      color: 0x808080,
      roughness: 0.85,
      metalness: 0,
      name: "fallback",
    }));

  function camoUpdate(m, t) {
    if (m.map) m.map.offset.set(t * 0.031, t * 0.019);
    if (m.emissiveMap) m.emissiveMap.offset.set(-t * 0.024, t * 0.041);
    m.emissiveIntensity =
      (m.userData.baseEmissive || 1.6) *
      (0.82 + 0.12 * Math.sin(t * 2.6) + 0.06 * Math.sin(t * 7.1));
  }

  function build(name) {
    const e = store.get(name);
    if (!e) return null;
    const { tx, meta } = e;
    const m = new THREE.MeshStandardMaterial({
      map: tx.map,
      normalMap: tx.normalMap,
      roughnessMap: tx.roughnessMap,
      roughness: 1,
      metalness: meta.metal ? 1 : 0,
      envMap,
      envMapIntensity: meta.env ?? 0.5,
    });
    if (meta.metal) m.metalnessMap = tx.metalnessMap;
    if (meta.ao) {
      m.aoMap = tx.aoMap;
      m.aoMapIntensity = 1;
    }
    m.name = name;
    if (name === "packed_camo" && tx.emissiveMap) {
      // emissive layer scrolls against the base map -> slowly churning swirl
      m.emissiveMap = tx.emissiveMap;
      m.emissive = new THREE.Color(1, 1, 1);
      m.userData.baseEmissive = 1.6;
      m.emissiveIntensity = 1.6;
      m.userData.update = (t) => camoUpdate(m, t);
    }
    return m;
  }

  const T = {
    envMap,
    names: names.filter((n) => store.has(n)),
    timings,
    prof,
    workers: canWork ? nWorkers : 0,
    cacheHit: cacheHits,
    genMs: 0,
    mat(name, overrides) {
      let base = baseCache.get(name);
      if (!base) {
        base = build(name);
        if (!base) {
          if (!warned.has(name)) {
            warned.add(name);
            console.warn(
              `[textures] unknown material "${name}" — using neutral grey`,
            );
          }
          base = getFallback();
        } else baseCache.set(name, base);
      }
      if (!overrides) return base;
      let key;
      try {
        key = name + "|" + JSON.stringify(overrides);
      } catch (e) {
        key = null;
      }
      if (key && ovCache.has(key)) return ovCache.get(key);
      const m = base.clone();
      try {
        m.setValues(overrides);
      } catch (e) {
        console.warn("[textures] bad overrides for", name, e);
      }
      if (base.userData.update) {
        m.userData.baseEmissive =
          overrides.emissiveIntensity ?? base.userData.baseEmissive;
        m.userData.update = (t) => camoUpdate(m, t);
      }
      if (key) ovCache.set(key, m);
      return m;
    },
    tex(name) {
      const e = store.get(name);
      if (!e) {
        if (!warned.has("tex:" + name)) {
          warned.add("tex:" + name);
          console.warn(`[textures] unknown texture set "${name}"`);
        }
        return { map: null, normalMap: null, roughnessMap: null };
      }
      return { ...e.tx };
    },
  };
  T.genMs = Math.round(performance.now() - T0);
  try {
    onProgress && onProgress(1);
  } catch (e) {
    /* ignore */
  }
  return T;
}
