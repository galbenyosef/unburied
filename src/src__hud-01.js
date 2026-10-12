// src__hud 01 — math
// Lines 1-312 of readable/src__hud.pretty.js (statement-aligned).
// UNBURIED — HUD & menus.  Pure DOM / CSS / inline SVG / canvas-generated textures.
// Owner: hud agent.  Interface: see docs/CONTRACT.md (hud.js section).

const FONT_HREF =
  "https://fonts.googleapis.com/css2?family=Oswald:wght@400;500;600;700&family=Special+Elite&family=Stardos+Stencil:wght@400;700&display=swap";
const SVGNS = "http://www.w3.org/2000/svg";

// ---------------------------------------------------------------- utilities
function h(tag, cls, html) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html != null) e.innerHTML = html;
  return e;
}
function s(tag, attrs = {}) {
  const e = document.createElementNS(SVGNS, tag);
  for (const k in attrs) e.setAttribute(k, attrs[k]);
  return e;
}
function rng(seed) {
  // mulberry32
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const clamp01 = (v) => Math.max(0, Math.min(1, v));
function colorStr(c, fallback = "#888") {
  if (typeof c === "number") return "#" + c.toString(16).padStart(6, "0");
  if (typeof c === "string" && c) return c;
  if (c && typeof c.getHexString === "function") return "#" + c.getHexString();
  return fallback;
}
function shade(hex, amt) {
  // amt -1..1
  let m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  let r = n >> 16,
    g = (n >> 8) & 255,
    b = n & 255;
  const f = (v) => Math.round(amt < 0 ? v * (1 + amt) : v + (255 - v) * amt);
  return `rgb(${f(r)},${f(g)},${f(b)})`;
}
function fmtTime(sec) {
  sec = Math.max(0, Math.floor(sec || 0));
  const hh = Math.floor(sec / 3600),
    mm = Math.floor((sec % 3600) / 60),
    ss = sec % 60;
  const p = (v) => String(v).padStart(2, "0");
  return hh ? `${hh}:${p(mm)}:${p(ss)}` : `${p(mm)}:${p(ss)}`;
}
function esc(t) {
  return String(t).replace(
    /[&<>"]/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c],
  );
}

// ---------------------------------------------------------------- canvas textures
function canvas(w, hgt) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = hgt;
  return c;
}

function texNoise(size = 192, seed = 1) {
  const c = canvas(size, size),
    g = c.getContext("2d");
  const img = g.createImageData(size, size),
    r = rng(seed);
  for (let i = 0; i < img.data.length; i += 4) {
    const v = r() * 255;
    img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
    img.data[i + 3] = 40 + r() * 70;
  }
  g.putImageData(img, 0, 0);
  return c.toDataURL();
}

function texPaper(seed = 7) {
  const W = 512,
    c = canvas(W, W),
    g = c.getContext("2d"),
    r = rng(seed);
  g.fillStyle = "#cdbf9f";
  g.fillRect(0, 0, W, W);
  for (let i = 0; i < 26; i++) {
    // tea / damp stains
    const x = r() * W,
      y = r() * W,
      rad = 30 + r() * 140;
    const gr = g.createRadialGradient(x, y, rad * 0.2, x, y, rad);
    const a = 0.04 + r() * 0.08;
    gr.addColorStop(0, `rgba(120,86,40,${a * 0.4})`);
    gr.addColorStop(0.85, `rgba(110,74,30,${a})`);
    gr.addColorStop(1, "rgba(110,74,30,0)");
    g.fillStyle = gr;
    g.fillRect(x - rad, y - rad, rad * 2, rad * 2);
  }
  g.lineWidth = 0.6;
  for (let i = 0; i < 900; i++) {
    // fibres
    const x = r() * W,
      y = r() * W,
      a = r() * Math.PI,
      l = 3 + r() * 14;
    g.strokeStyle = `rgba(${r() < 0.5 ? "255,250,235" : "70,50,25"},${0.05 + r() * 0.08})`;
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l);
    g.stroke();
  }
  const img = g.getImageData(0, 0, W, W);
  for (let i = 0; i < img.data.length; i += 4) {
    const n = (r() - 0.5) * 22;
    img.data[i] += n;
    img.data[i + 1] += n;
    img.data[i + 2] += n * 0.8;
  }
  g.putImageData(img, 0, 0);
  return c.toDataURL("image/jpeg", 0.86);
}

function texSplatter(seed, size = 512) {
  const c = canvas(size, size),
    g = c.getContext("2d"),
    r = rng(seed);
  const cx = size / 2,
    cy = size / 2;
  const col = (a) =>
    `rgba(${(70 + r() * 40) | 0},${(r() * 8) | 0},${(r() * 6) | 0},${a})`;
  // streaks radiating
  for (let i = 0; i < 26; i++) {
    const ang = r() * Math.PI * 2,
      len = size * (0.18 + r() * 0.3);
    let w = 5 + r() * 12,
      x = cx,
      y = cy;
    const steps = 18;
    for (let k = 0; k < steps; k++) {
      const nx = cx + (Math.cos(ang) * len * (k + 1)) / steps,
        ny = cy + (Math.sin(ang) * len * (k + 1)) / steps;
      g.strokeStyle = col(0.8);
      g.lineWidth = w;
      g.lineCap = "round";
      g.beginPath();
      g.moveTo(x, y);
      g.lineTo(nx, ny);
      g.stroke();
      x = nx;
      y = ny;
      w *= 0.86;
    }
    g.fillStyle = col(0.85);
    g.beginPath();
    g.arc(x, y, 1.5 + r() * 5, 0, 7);
    g.fill();
  }
  // core blob
  for (let i = 0; i < 70; i++) {
    const a = r() * Math.PI * 2,
      d = Math.pow(r(), 1.6) * size * 0.14;
    g.fillStyle = col(0.9);
    g.beginPath();
    g.arc(
      cx + Math.cos(a) * d,
      cy + Math.sin(a) * d,
      size * (0.02 + r() * 0.06),
      0,
      7,
    );
    g.fill();
  }
  // flung droplets
  for (let i = 0; i < 160; i++) {
    const a = r() * Math.PI * 2,
      d = size * (0.12 + Math.pow(r(), 0.7) * 0.36);
    g.fillStyle = col(0.6 + r() * 0.35);
    g.beginPath();
    g.arc(
      cx + Math.cos(a) * d,
      cy + Math.sin(a) * d,
      0.8 + Math.pow(r(), 3) * 9,
      0,
      7,
    );
    g.fill();
  }
  // darker wet centre
  const gr = g.createRadialGradient(cx, cy, 0, cx, cy, size * 0.2);
  gr.addColorStop(0, "rgba(25,0,0,0.55)");
  gr.addColorStop(1, "rgba(25,0,0,0)");
  g.globalCompositeOperation = "source-atop";
  g.fillStyle = gr;
  g.fillRect(0, 0, size, size);
  return c.toDataURL();
}

function texSmear(rgb, seed = 3, W = 512, H = 64, dry = true) {
  const c = canvas(W, H),
    g = c.getContext("2d"),
    r = rng(seed);
  for (let i = 0; i < 90; i++) {
    // bristle lines
    const y0 = H * 0.18 + r() * H * 0.64,
      th = 1 + r() * 3.5;
    const end = W * (0.55 + r() * 0.45),
      start = r() * W * 0.06;
    const a = 0.25 + r() * 0.6;
    g.strokeStyle = `rgba(${rgb},${a})`;
    g.lineWidth = th;
    g.lineCap = "round";
    g.beginPath();
    g.moveTo(start, y0);
    const wob = (r() - 0.5) * 6;
    g.bezierCurveTo(
      W * 0.3,
      y0 + wob,
      W * 0.6,
      y0 - wob,
      end,
      y0 + (r() - 0.5) * 8,
    );
    g.stroke();
  }
  if (dry) {
    // dry-brush break-up toward the right
    g.globalCompositeOperation = "destination-out";
    for (let i = 0; i < 700; i++) {
      const x = Math.pow(r(), 0.5) * W,
        y = r() * H;
      g.fillStyle = `rgba(0,0,0,${(x / W) * 0.9})`;
      g.fillRect(x, y, 2 + r() * 20, 1 + r() * 2);
    }
  }
  return c.toDataURL();
}

function tornPolygon(seed, amp = 0.9) {
  // % based jagged clip-path
  const r = rng(seed),
    pts = [];
  const j = () => (r() * amp).toFixed(2);
  for (let x = 0; x <= 100; x += 2.5) pts.push(`${x}% ${j()}%`);
  for (let y = 0; y <= 100; y += 2.5)
    pts.push(`${(100 - r() * amp * 0.6).toFixed(2)}% ${y}%`);
  for (let x = 100; x >= 0; x -= 2.5)
    pts.push(`${x}% ${(100 - r() * amp).toFixed(2)}%`);
  for (let y = 100; y >= 0; y -= 2.5)
    pts.push(`${(r() * amp * 0.6).toFixed(2)}% ${y}%`);
  return `polygon(${pts.join(",")})`;
}

// ---------------------------------------------------------------- painted round art
// Digit strokes in a 60 x 100 box (top y=0). Each entry: array of stroke paths; drip anchor xs.
const DIGITS = {
  0: {
    p: [
      "M31 5 C 10 5, 5 30, 6 52 C 7 80, 15 96, 31 96 C 50 96, 56 74, 55 50 C 55 24, 49 5, 29 7",
    ],
    d: [30],
  },
  1: { p: ["M15 23 L33 5 L32 96"], d: [32] },
  2: {
    p: [
      "M8 26 C 10 9, 25 3, 35 5 C 52 8, 56 27, 47 43 C 38 59, 20 76, 6 95 L 57 93",
    ],
    d: [22, 52],
  },
  3: {
    p: [
      "M8 15 C 20 2, 50 2, 50 25 C 50 40, 38 46, 25 47",
      "M25 47 C 44 47, 56 58, 55 72 C 54 92, 30 100, 6 88",
    ],
    d: [20],
  },
  4: { p: ["M41 97 L41 5 L5 67 L58 66"], d: [41] },
  5: {
    p: [
      "M53 6 L15 7",
      "M15 7 L11 45 C 22 36, 48 36, 54 58 C 58 80, 44 96, 26 96 C 16 96, 9 92, 5 86",
    ],
    d: [28],
  },
  6: {
    p: [
      "M49 8 C 30 1, 10 20, 7 52 C 5 80, 16 96, 32 96 C 50 96, 56 80, 55 66 C 54 50, 42 42, 30 43 C 18 44, 9 54, 7 63",
    ],
    d: [30],
  },
  7: { p: ["M5 8 L56 6 C 40 31, 28 60, 22 97"], d: [22] },
  8: {
    p: [
      "M30 48 C 11 44, 10 5, 30 5 C 50 5, 51 44, 30 48 C 8 52, 6 96, 30 96 C 54 96, 53 52, 30 48",
    ],
    d: [30],
  },
  9: {
    p: [
      "M52 38 C 50 50, 38 56, 28 55 C 12 54, 6 40, 7 30 C 8 12, 20 4, 32 5 C 48 6, 54 20, 53 40 C 52 70, 40 96, 12 94",
    ],
    d: [14],
  },
};

/** Build a painted round-number SVG.  opts: {animate, delay (s), seed, strokeTime, skipStrokes} */
