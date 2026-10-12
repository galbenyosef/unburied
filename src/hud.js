// UNBURIED — HUD & menus.  Pure DOM / CSS / inline SVG / canvas-generated textures.
// Owner: hud agent.  Interface: see docs/CONTRACT.md (hud.js section).

const FONT_HREF = 'https://fonts.googleapis.com/css2?family=Oswald:wght@400;500;600;700&family=Special+Elite&family=Stardos+Stencil:wght@400;700&display=swap';
const SVGNS = 'http://www.w3.org/2000/svg';

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
function rng(seed) {                     // mulberry32
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const clamp01 = (v) => Math.max(0, Math.min(1, v));
function colorStr(c, fallback = '#888') {
  if (typeof c === 'number') return '#' + c.toString(16).padStart(6, '0');
  if (typeof c === 'string' && c) return c;
  if (c && typeof c.getHexString === 'function') return '#' + c.getHexString();
  return fallback;
}
function shade(hex, amt) {             // amt -1..1
  let m = /^#?([0-9a-f]{6})$/i.exec(hex); if (!m) return hex;
  const n = parseInt(m[1], 16);
  let r = n >> 16, g = (n >> 8) & 255, b = n & 255;
  const f = (v) => Math.round(amt < 0 ? v * (1 + amt) : v + (255 - v) * amt);
  return `rgb(${f(r)},${f(g)},${f(b)})`;
}
function fmtTime(sec) {
  sec = Math.max(0, Math.floor(sec || 0));
  const hh = Math.floor(sec / 3600), mm = Math.floor((sec % 3600) / 60), ss = sec % 60;
  const p = (v) => String(v).padStart(2, '0');
  return hh ? `${hh}:${p(mm)}:${p(ss)}` : `${p(mm)}:${p(ss)}`;
}
function esc(t) { return String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }

// ---------------------------------------------------------------- canvas textures
function canvas(w, hgt) { const c = document.createElement('canvas'); c.width = w; c.height = hgt; return c; }

function texNoise(size = 192, seed = 1) {
  const c = canvas(size, size), g = c.getContext('2d');
  const img = g.createImageData(size, size), r = rng(seed);
  for (let i = 0; i < img.data.length; i += 4) {
    const v = r() * 255;
    img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
    img.data[i + 3] = 40 + r() * 70;
  }
  g.putImageData(img, 0, 0);
  return c.toDataURL();
}

function texPaper(seed = 7) {
  const W = 512, c = canvas(W, W), g = c.getContext('2d'), r = rng(seed);
  g.fillStyle = '#cdbf9f'; g.fillRect(0, 0, W, W);
  for (let i = 0; i < 26; i++) {                         // tea / damp stains
    const x = r() * W, y = r() * W, rad = 30 + r() * 140;
    const gr = g.createRadialGradient(x, y, rad * 0.2, x, y, rad);
    const a = 0.04 + r() * 0.08;
    gr.addColorStop(0, `rgba(120,86,40,${a * 0.4})`);
    gr.addColorStop(0.85, `rgba(110,74,30,${a})`);
    gr.addColorStop(1, 'rgba(110,74,30,0)');
    g.fillStyle = gr; g.fillRect(x - rad, y - rad, rad * 2, rad * 2);
  }
  g.lineWidth = 0.6;
  for (let i = 0; i < 900; i++) {                        // fibres
    const x = r() * W, y = r() * W, a = r() * Math.PI, l = 3 + r() * 14;
    g.strokeStyle = `rgba(${r() < 0.5 ? '255,250,235' : '70,50,25'},${0.05 + r() * 0.08})`;
    g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); g.stroke();
  }
  const img = g.getImageData(0, 0, W, W);
  for (let i = 0; i < img.data.length; i += 4) {
    const n = (r() - 0.5) * 22;
    img.data[i] += n; img.data[i + 1] += n; img.data[i + 2] += n * 0.8;
  }
  g.putImageData(img, 0, 0);
  return c.toDataURL('image/jpeg', 0.86);
}

function texSplatter(seed, size = 512) {
  const c = canvas(size, size), g = c.getContext('2d'), r = rng(seed);
  const cx = size / 2, cy = size / 2;
  const col = (a) => `rgba(${70 + r() * 40 | 0},${r() * 8 | 0},${r() * 6 | 0},${a})`;
  // streaks radiating
  for (let i = 0; i < 26; i++) {
    const ang = r() * Math.PI * 2, len = size * (0.18 + r() * 0.3);
    let w = 5 + r() * 12, x = cx, y = cy;
    const steps = 18;
    for (let k = 0; k < steps; k++) {
      const nx = cx + Math.cos(ang) * len * (k + 1) / steps, ny = cy + Math.sin(ang) * len * (k + 1) / steps;
      g.strokeStyle = col(0.8); g.lineWidth = w; g.lineCap = 'round';
      g.beginPath(); g.moveTo(x, y); g.lineTo(nx, ny); g.stroke();
      x = nx; y = ny; w *= 0.86;
    }
    g.fillStyle = col(0.85); g.beginPath(); g.arc(x, y, 1.5 + r() * 5, 0, 7); g.fill();
  }
  // core blob
  for (let i = 0; i < 70; i++) {
    const a = r() * Math.PI * 2, d = Math.pow(r(), 1.6) * size * 0.14;
    g.fillStyle = col(0.9); g.beginPath();
    g.arc(cx + Math.cos(a) * d, cy + Math.sin(a) * d, size * (0.02 + r() * 0.06), 0, 7); g.fill();
  }
  // flung droplets
  for (let i = 0; i < 160; i++) {
    const a = r() * Math.PI * 2, d = size * (0.12 + Math.pow(r(), 0.7) * 0.36);
    g.fillStyle = col(0.6 + r() * 0.35); g.beginPath();
    g.arc(cx + Math.cos(a) * d, cy + Math.sin(a) * d, 0.8 + Math.pow(r(), 3) * 9, 0, 7); g.fill();
  }
  // darker wet centre
  const gr = g.createRadialGradient(cx, cy, 0, cx, cy, size * 0.2);
  gr.addColorStop(0, 'rgba(25,0,0,0.55)'); gr.addColorStop(1, 'rgba(25,0,0,0)');
  g.globalCompositeOperation = 'source-atop'; g.fillStyle = gr; g.fillRect(0, 0, size, size);
  return c.toDataURL();
}

function texSmear(rgb, seed = 3, W = 512, H = 64, dry = true) {
  const c = canvas(W, H), g = c.getContext('2d'), r = rng(seed);
  for (let i = 0; i < 90; i++) {                           // bristle lines
    const y0 = H * 0.18 + r() * H * 0.64, th = 1 + r() * 3.5;
    const end = W * (0.55 + r() * 0.45), start = r() * W * 0.06;
    const a = 0.25 + r() * 0.6;
    g.strokeStyle = `rgba(${rgb},${a})`; g.lineWidth = th; g.lineCap = 'round';
    g.beginPath(); g.moveTo(start, y0);
    const wob = (r() - 0.5) * 6;
    g.bezierCurveTo(W * 0.3, y0 + wob, W * 0.6, y0 - wob, end, y0 + (r() - 0.5) * 8);
    g.stroke();
  }
  if (dry) {                                               // dry-brush break-up toward the right
    g.globalCompositeOperation = 'destination-out';
    for (let i = 0; i < 700; i++) {
      const x = Math.pow(r(), 0.5) * W, y = r() * H;
      g.fillStyle = `rgba(0,0,0,${(x / W) * 0.9})`;
      g.fillRect(x, y, 2 + r() * 20, 1 + r() * 2);
    }
  }
  return c.toDataURL();
}

function tornPolygon(seed, amp = 0.9) {                   // % based jagged clip-path
  const r = rng(seed), pts = [];
  const j = () => (r() * amp).toFixed(2);
  for (let x = 0; x <= 100; x += 2.5) pts.push(`${x}% ${j()}%`);
  for (let y = 0; y <= 100; y += 2.5) pts.push(`${(100 - r() * amp * 0.6).toFixed(2)}% ${y}%`);
  for (let x = 100; x >= 0; x -= 2.5) pts.push(`${x}% ${(100 - r() * amp).toFixed(2)}%`);
  for (let y = 100; y >= 0; y -= 2.5) pts.push(`${(r() * amp * 0.6).toFixed(2)}% ${y}%`);
  return `polygon(${pts.join(',')})`;
}

// ---------------------------------------------------------------- painted round art
// Digit strokes in a 60 x 100 box (top y=0). Each entry: array of stroke paths; drip anchor xs.
const DIGITS = {
  0: { p: ['M31 5 C 10 5, 5 30, 6 52 C 7 80, 15 96, 31 96 C 50 96, 56 74, 55 50 C 55 24, 49 5, 29 7'], d: [30] },
  1: { p: ['M15 23 L33 5 L32 96'], d: [32] },
  2: { p: ['M8 26 C 10 9, 25 3, 35 5 C 52 8, 56 27, 47 43 C 38 59, 20 76, 6 95 L 57 93'], d: [22, 52] },
  3: { p: ['M8 15 C 20 2, 50 2, 50 25 C 50 40, 38 46, 25 47', 'M25 47 C 44 47, 56 58, 55 72 C 54 92, 30 100, 6 88'], d: [20] },
  4: { p: ['M41 97 L41 5 L5 67 L58 66'], d: [41] },
  5: { p: ['M53 6 L15 7', 'M15 7 L11 45 C 22 36, 48 36, 54 58 C 58 80, 44 96, 26 96 C 16 96, 9 92, 5 86'], d: [28] },
  6: { p: ['M49 8 C 30 1, 10 20, 7 52 C 5 80, 16 96, 32 96 C 50 96, 56 80, 55 66 C 54 50, 42 42, 30 43 C 18 44, 9 54, 7 63'], d: [30] },
  7: { p: ['M5 8 L56 6 C 40 31, 28 60, 22 97'], d: [22] },
  8: { p: ['M30 48 C 11 44, 10 5, 30 5 C 50 5, 51 44, 30 48 C 8 52, 6 96, 30 96 C 54 96, 53 52, 30 48'], d: [30] },
  9: { p: ['M52 38 C 50 50, 38 56, 28 55 C 12 54, 6 40, 7 30 C 8 12, 20 4, 32 5 C 48 6, 54 20, 53 40 C 52 70, 40 96, 12 94'], d: [14] },
};

/** Build a painted round-number SVG.  opts: {animate, delay (s), seed, strokeTime, skipStrokes} */
function roundArt(n, opts = {}) {
  n = Math.max(0, Math.floor(n || 0));
  const r = rng(opts.seed ?? (n <= 5 ? 4242 : n * 977 + 13));
  const from = opts.from || 0;
  const strokes = [];   // {d, w}
  const drips = [];     // {x, y, len}
  let W;
  if (n >= 1 && n <= 5) {
    W = 104;
    const cnt = Math.min(n, 4);
    for (let i = 0; i < cnt; i++) {
      const x = 12 + i * 24 + (r() - 0.5) * 3;
      const x2 = x + (r() - 0.5) * 6, xm = x + (r() - 0.5) * 7;
      const y0 = 4 + r() * 6, y1 = 92 + r() * 6;
      strokes.push({ d: `M${x.toFixed(1)} ${y0.toFixed(1)} Q${xm.toFixed(1)} 50 ${x2.toFixed(1)} ${y1.toFixed(1)}`, w: 12 + r() * 2.5, si: i });
      const dp = r() < 0.55, dl = 10 + r() * 26;
      if (dp) drips.push({ x: x2, y: y1 - 4, len: dl, si: i });
    }
    if (n === 5) {
      strokes.push({ d: 'M-6 80 C 26 64, 62 44, 108 18', w: 12.5, si: 4 });
      drips.push({ x: 8, y: 76, len: 18 + r() * 16, si: 4 });
    }
  } else {
    const str = String(n);
    W = str.length * 64 - 4;
    [...str].forEach((ch, i) => {
      const def = DIGITS[ch]; const ox = i * 64;
      def.p.forEach((d) => {
        // offset the digit path by translating numbers: easiest via transform attribute per path
        strokes.push({ d, w: 13.5 + r() * 1.5, ox });
      });
      def.d.forEach((dx) => { if (r() < 0.8) drips.push({ x: ox + dx + (r() - 0.5) * 4, y: 88 + r() * 4, len: 10 + r() * 30 }); });
    });
  }

  const svg = s('svg', { viewBox: `-14 -12 ${W + 28} 164`, class: 'ub-paint', 'aria-label': `Round ${n}` });
  svg.style.setProperty('--vbw', (W + 28) / 164);
  const g = s('g', { filter: 'url(#ub-brush)', transform: n > 5 ? 'skewX(-7) translate(8 0)' : '' });
  svg.appendChild(g);
  const animate = !!opts.animate;
  let t = opts.delay || 0;
  const st = opts.strokeTime || (n > 5 ? 0.3 : 0.34);
  const skip = opts.skipStrokes || 0;
  const pathEls = [];
  strokes.forEach((k, i) => {
    if (k.si != null && k.si < from) return;
    const tf = k.ox ? `translate(${k.ox} 0)` : '';
    const main = s('path', { d: k.d, pathLength: 1, class: 'ub-stroke', 'stroke-width': k.w.toFixed(1), transform: tf });
    const hi = s('path', { d: k.d, pathLength: 1, class: 'ub-stroke ub-stroke-hi', 'stroke-width': (k.w * 0.28).toFixed(1), transform: `${tf} translate(-2.2 -1.5)` });
    const inst = !animate || i < skip;
    for (const p of [main, hi]) {
      if (inst) p.classList.add('ub-inst');
      else { p.style.animationDelay = `${t.toFixed(2)}s`; p.style.animationDuration = `${st}s`; }
      g.appendChild(p);
    }
    pathEls.push(main);
    if (!inst) t += st + 0.08;
  });
  drips.forEach((d) => {
    if (d.si != null && d.si < from) return;
    const dr = s('path', { d: `M${d.x.toFixed(1)} ${d.y.toFixed(1)} l0 ${d.len.toFixed(1)}`, pathLength: 1, class: 'ub-drip', 'stroke-width': (3 + r() * 2.2).toFixed(1) });
    const bulb = s('circle', { cx: d.x.toFixed(1), cy: d.y.toFixed(1), r: (2.6 + r() * 1.4).toFixed(1), class: 'ub-bulb' });
    bulb.style.setProperty('--len', `${d.len.toFixed(1)}px`);
    const dl = animate ? t + 0.1 + r() * 0.6 : 0;
    const dur = 1.2 + r() * 1.6;
    for (const e of [dr, bulb]) {
      if (!animate) e.classList.add('ub-inst');
      else { e.style.animationDelay = `${dl.toFixed(2)}s`; e.style.animationDuration = `${dur.toFixed(2)}s`; }
      g.appendChild(e);
    }
  });
  return { svg, endTime: t, n };
}

// ---------------------------------------------------------------- glyphs
const PERK_GLYPH = {
  ironhide: '<path d="M0-11.5 L9.5-7.8 V-1.5 C9.5 5.5 5 9.8 0 12 C-5 9.8 -9.5 5.5 -9.5-1.5 V-7.8Z" class="f"/><path d="M-5-2.5 L0 2 L5-2.5 M-5 2.5 L0 7 L5 2.5" class="k" stroke-width="2.1"/>',
  quickhands: '<g class="s" stroke-width="2.7"><path d="M-6 1 V-8.5 M-2 -0.5 V-11 M2 -0.5 V-10 M5.8 1.5 V-6.5"/><path d="M-6 3 L-10 -1.5"/><path d="M-6.5 1 C-7.5 7.5 -3.5 11.5 0.5 11.5 C5 11.5 7 7.5 5.8 1"/></g><path d="M9.5-5 h3 M10-1 h4.2 M9.5 3 h3" class="s" stroke-width="1.6"/>',
  rapidfire: [-7, 0, 7].map((x) => `<path d="M${x - 2.6} -1.5 Q${x} -13 ${x + 2.6} -1.5 Z" class="f"/><rect x="${x - 2.6}" y="-0.2" width="5.2" height="11" rx="0.6" class="f"/><rect x="${x - 3}" y="8.3" width="6" height="2.6" class="k0"/>`).join(''),
  secondwind: '<path d="M0-12 V-2.5 M0-2.5 L-3.4 1 M0-2.5 L3.4 1" class="s" stroke-width="2.2"/><path d="M-2.4-6 C-7.5-8 -11.5 0 -11 6.5 C-10.5 10.5 -6.5 11.8 -3 9.8 C-1.8 5 -1.8 0 -2.4-6Z" class="f"/><path d="M2.4-6 C7.5-8 11.5 0 11 6.5 C10.5 10.5 6.5 11.8 3 9.8 C1.8 5 1.8 0 2.4-6Z" class="f"/>',
};
const POWERUP_GLYPH = {
  maxammo: '<rect x="-11" y="-2" width="22" height="13" rx="1" class="f"/><path d="M-11 2 H11" class="k"/><rect x="-3" y="4" width="6" height="3.5" class="k0"/>' + [-6.5, -2.2, 2.2, 6.5].map((x) => `<path d="M${x - 1.6} -2 V-8 Q${x} -12.5 ${x + 1.6} -8 V-2Z" class="f"/>`).join(''),
  instakill: '<path d="M0-12 C-8-12 -11-6 -11 0 C-11 4 -9 6 -7 7 V11 H7 V7 C9 6 11 4 11 0 C11-6 8-12 0-12Z" class="f"/><ellipse cx="-4.4" cy="-0.5" rx="3" ry="3.4" class="k0"/><ellipse cx="4.4" cy="-0.5" rx="3" ry="3.4" class="k0"/><path d="M0 3.5 L-1.4 6 H1.4Z" class="k0"/><path d="M-3.5 8 V11 M0 8 V11 M3.5 8 V11" class="k" stroke-width="1.1"/>',
  doublepoints: '<text x="0" y="7.5" text-anchor="middle" class="t">x2</text>',
  nuke: '<circle cx="-1.5" cy="3" r="9" class="f"/><rect x="-4" y="-9" width="6" height="5" rx="1" class="f" transform="rotate(20 -1 -6)"/><path d="M1.5-8.5 C4-13 8-11 9-8" class="s" stroke-width="1.6"/><path d="M9-8 l2.5-2 M9-8 l3 .8 M9-8 l.6 3" class="s" stroke-width="1.2"/><path d="M-6 0 A5 5 0 0 1 -2 -3.5" class="k" stroke-width="1.6"/>',
  carpenter: '<rect x="-1.6" y="-3" width="3.4" height="15" rx="1" class="f" transform="rotate(-28)"/><path d="M-10-6 L7-10.5 L9.5-7.5 L10-3 L-9.5 0.5 C-11-1 -11-4.5 -10-6Z" class="f" transform="rotate(-28)"/>',
};

// ---------------------------------------------------------------- style
const CSS = `
.ub-root{position:fixed;inset:0;pointer-events:none;z-index:20;overflow:hidden;
  --blood:#a3120e;--blood-hi:#c8261c;--blood-dk:#4c0605;--bone:#e8dfca;--bone-dim:#b9ae96;--ink:#0a0908;
  --gold:#f0c95a;--gold-dk:#a47a1c;--purple:#b77dff;--green:#b7f26a;
  --f-stencil:'Stardos Stencil','Stencil Std','Stencil',Impact,'Arial Narrow Bold',sans-serif;
  --f-type:'Special Elite','American Typewriter','Courier New',Courier,monospace;
  --f-cond:'Oswald','Bebas Neue','Arial Narrow','Helvetica Neue Condensed',Impact,sans-serif;
  font-size:clamp(11px,calc(0.62vw + 0.42vh),22px);color:var(--bone);font-family:var(--f-cond);
  -webkit-font-smoothing:antialiased;user-select:none;-webkit-user-select:none;line-height:1.2}
.ub-root *{box-sizing:border-box}
.ub-root button{font:inherit;color:inherit;background:none;border:0;padding:0;cursor:pointer;text-align:left}
.ub-defs{position:absolute;width:0;height:0;overflow:hidden}

/* ---------- layers ---------- */
.ub-fx,.ub-hud{position:absolute;inset:0;pointer-events:none;transition:opacity .45s}
.ub-hud.off,.ub-fx.off{opacity:0}
.ub-screen{position:absolute;inset:0;opacity:0;visibility:hidden;pointer-events:none;transition:opacity .5s,visibility 0s linear .5s}
.ub-screen.on{opacity:1;visibility:visible;pointer-events:auto;transition:opacity .5s,visibility 0s}
.ub-grain{position:absolute;inset:-50%;background-image:var(--tx-noise);background-size:192px;opacity:.16;mix-blend-mode:overlay;
  animation:ub-grain .6s steps(1) infinite;pointer-events:none}
@keyframes ub-grain{0%{transform:translate(0,0)}17%{transform:translate(-7%,4%)}33%{transform:translate(5%,-9%)}50%{transform:translate(-3%,8%)}67%{transform:translate(9%,2%)}83%{transform:translate(-8%,-5%)}}
.ub-vig{position:absolute;inset:0;pointer-events:none;background:radial-gradient(ellipse 75% 70% at 50% 50%,transparent 45%,rgba(0,0,0,.72) 100%)}

/* ---------- painted strokes ---------- */
.ub-paint{display:block;overflow:visible;color:var(--blood)}
.ub-paint .ub-stroke{fill:none;stroke:currentColor;stroke-linecap:round;stroke-linejoin:round;stroke-dasharray:1 2;stroke-dashoffset:1;opacity:0;
  animation:ub-paint .32s cubic-bezier(.35,.05,.3,1) both}
.ub-paint .ub-stroke-hi{stroke:rgba(255,160,140,.32);animation-name:ub-paint-hi}
.ub-paint .ub-drip{fill:none;stroke:currentColor;stroke-linecap:round;stroke-dasharray:1 2;stroke-dashoffset:1;animation:ub-drip 1.6s cubic-bezier(.2,.6,.3,1) both}
.ub-paint .ub-bulb{fill:currentColor;animation:ub-bulb 1.6s cubic-bezier(.2,.6,.3,1) both}
.ub-paint .ub-inst{animation:none!important;stroke-dashoffset:0;opacity:1;transform-box:view-box}
.ub-paint .ub-bulb.ub-inst{transform:translateY(var(--len))}
@keyframes ub-paint{0%{stroke-dashoffset:1;opacity:0}1%{opacity:1}100%{stroke-dashoffset:0;opacity:1}}
@keyframes ub-paint-hi{0%{stroke-dashoffset:1;opacity:0}1%{opacity:1}100%{stroke-dashoffset:0;opacity:1}}
@keyframes ub-drip{0%{stroke-dashoffset:1}100%{stroke-dashoffset:0}}
@keyframes ub-bulb{0%{transform:translateY(0);opacity:0}8%{opacity:1}100%{transform:translateY(var(--len));opacity:1}}

/* ---------- round ---------- */
.ub-bl{position:absolute;left:clamp(14px,2.6vw,56px);bottom:clamp(12px,2.6vh,44px);display:flex;flex-direction:column;align-items:flex-start;gap:.7em}
.ub-round{position:relative;height:10.5em;min-width:8em;filter:drop-shadow(0 0 .5em rgba(110,0,0,.45)) drop-shadow(.12em .18em 0 rgba(0,0,0,.55))}
.ub-round .ub-paint{position:absolute;left:0;bottom:0;height:100%;width:auto}
.ub-round .ub-paint.out{animation:ub-throb-out 2.9s ease-in-out forwards}
.ub-round .ub-paint.throb{animation:ub-throb 2.3s ease-in-out}
@keyframes ub-throb-out{0%{color:var(--blood)}14%{color:#fff}30%{color:var(--blood-hi)}46%{color:#fff}62%{color:var(--blood-hi)}74%{color:#fff;opacity:1}100%{color:#fff;opacity:0}}
@keyframes ub-throb{0%{color:var(--blood)}18%{color:#fff}38%{color:var(--blood-hi)}58%{color:#fff}80%{color:var(--blood-hi)}100%{color:var(--blood)}}

/* ---------- perks ---------- */
.ub-perks{display:flex;gap:.45em;min-height:3.4em;align-items:flex-end}
.ub-perk{width:3.4em;height:3.4em;filter:drop-shadow(0 .15em .25em rgba(0,0,0,.7));animation:ub-cap-in .6s cubic-bezier(.2,1.6,.4,1) both}
.ub-perk svg{width:100%;height:100%;display:block;overflow:visible}
.ub-perk .f{fill:#f4ead3}.ub-perk .k{fill:none;stroke:rgba(0,0,0,.55);stroke-linecap:round;stroke-linejoin:round}.ub-perk .k0{fill:rgba(0,0,0,.45)}
.ub-perk .s{fill:none;stroke:#f4ead3;stroke-linecap:round;stroke-linejoin:round}
@keyframes ub-cap-in{0%{transform:scale(2.2) rotate(-40deg);opacity:0}60%{opacity:1}100%{transform:none;opacity:1}}

/* ---------- bottom right: points + ammo ---------- */
.ub-corner-shade{position:absolute;width:48vw;height:40vh;pointer-events:none}
.ub-corner-shade.l{left:0;bottom:0;background:radial-gradient(ellipse at 0 100%,rgba(0,0,0,.55),transparent 65%)}
.ub-corner-shade.r{right:0;bottom:0;background:radial-gradient(ellipse at 100% 100%,rgba(0,0,0,.6),transparent 65%)}
.ub-br{position:absolute;right:clamp(14px,2.6vw,56px);bottom:clamp(12px,2.6vh,44px);display:flex;flex-direction:column;align-items:flex-end;gap:.9em}
.ub-points-wrap{position:relative;padding:.1em .7em .1em 1.6em}
.ub-points-wrap::before{content:"";position:absolute;inset:-.2em -.4em -.2em -.2em;background:var(--tx-smear-dark) no-repeat center/100% 100%;transform:scaleX(-1);opacity:.9}
.ub-points{position:relative;font-family:var(--f-cond);font-weight:600;font-size:2.35em;letter-spacing:.02em;color:var(--gold);
  text-shadow:0 0 .35em rgba(240,180,60,.35),0 .06em 0 #3a2400,0 0 .08em #000}
.ub-points.bump{animation:ub-bump .25s ease-out}
@keyframes ub-bump{0%{transform:scale(1.12)}100%{transform:scale(1)}}
.ub-pops{position:absolute;left:1.2em;top:50%;width:0;height:0}
.ub-pop{position:absolute;left:0;top:0;transform:translate(-50%,-50%);font-family:var(--f-cond);font-weight:700;font-size:1.45em;white-space:nowrap;
  color:var(--gold);text-shadow:0 0 .3em rgba(255,190,60,.55),0 .06em .02em #000;will-change:transform,opacity}
.ub-pop.neg{color:#ff3b2f;text-shadow:0 0 .3em rgba(255,40,20,.5),0 .06em .02em #000}
.ub-ammo{display:flex;flex-direction:column;align-items:flex-end;gap:.15em}
.ub-wname{font-family:var(--f-stencil);font-weight:700;font-size:1.25em;letter-spacing:.14em;color:var(--bone);text-shadow:0 .08em .1em #000;text-transform:uppercase}
.ub-wname.up{color:#e9d8ff;text-shadow:0 0 .35em rgba(170,90,255,.95),0 0 .9em rgba(140,60,255,.6),0 .08em .1em #000;animation:ub-pap 2.4s ease-in-out infinite}
@keyframes ub-pap{50%{text-shadow:0 0 .55em rgba(190,120,255,1),0 0 1.4em rgba(120,200,255,.55),0 .08em .1em #000}}
.ub-ammo-row{display:flex;align-items:baseline;gap:.25em;font-family:var(--f-cond);line-height:1}
.ub-mag{font-size:3.4em;font-weight:600;color:var(--bone);text-shadow:0 .05em .1em #000;min-width:1.2em;text-align:right;font-variant-numeric:tabular-nums}
.ub-mag.low{color:#ff4a36;animation:ub-lowmag .7s ease-in-out infinite}
.ub-mag.empty{color:#ff2a1a}
@keyframes ub-lowmag{50%{opacity:.45;text-shadow:0 0 .35em rgba(255,40,20,.9)}}
.ub-slash{font-size:2em;color:var(--bone-dim);opacity:.6;transform:skewX(-12deg)}
.ub-res{font-size:1.75em;font-weight:500;color:var(--bone-dim);font-variant-numeric:tabular-nums;text-shadow:0 .05em .1em #000}
.ub-res.zero{color:#b13a2c}
.ub-ticks{display:flex;gap:2px;height:.55em;justify-content:flex-end;max-width:16em;flex-wrap:nowrap}
.ub-ticks i{width:.28em;height:100%;background:var(--bone);opacity:.85;box-shadow:0 0 2px #000;transform:skewX(-14deg)}
.ub-ticks i.gone{opacity:.14}
.ub-ticks.bar{width:10em;height:.3em;background:rgba(232,223,202,.14);position:relative}
.ub-ticks.bar b{position:absolute;right:0;top:0;bottom:0;background:var(--bone);opacity:.85}
.ub-nades{display:flex;gap:.3em;margin-top:.25em;height:1.5em}
.ub-nade{width:1.1em;height:1.5em;opacity:.95;filter:drop-shadow(0 .05em .08em #000)}
.ub-nade.empty{opacity:.18}
.ub-nade svg{width:100%;height:100%;display:block}

/* ---------- powerups ---------- */
.ub-pu{position:absolute;left:50%;bottom:clamp(12px,3vh,48px);transform:translateX(-50%);display:flex;gap:1.1em}
.ub-pu-i{display:flex;flex-direction:column;align-items:center;gap:.25em;animation:ub-cap-in .5s cubic-bezier(.2,1.5,.4,1) both}
.ub-pu-ic{width:3.5em;height:3.5em;border-radius:50%;background:radial-gradient(circle,rgba(190,255,110,.35),rgba(80,160,30,.18) 55%,transparent 72%);
  display:grid;place-items:center;filter:drop-shadow(0 0 .35em rgba(170,255,90,.6))}
.ub-pu-ic svg{width:78%;height:78%;overflow:visible}
.ub-pu-ic .f{fill:#e3ffb4}.ub-pu-ic .k{fill:none;stroke:rgba(20,50,0,.8);stroke-width:1.3;stroke-linecap:round}.ub-pu-ic .k0{fill:rgba(20,50,0,.85)}
.ub-pu-ic .s{fill:none;stroke:#e3ffb4;stroke-linecap:round}
.ub-pu-ic .t{fill:#e3ffb4;font-family:var(--f-cond);font-weight:700;font-size:21px}
.ub-pu-t{font-family:var(--f-type);font-size:.95em;color:#dff7c0;text-shadow:0 0 .3em #000,0 0 .1em #000}
.ub-pu-i.blink .ub-pu-ic{animation:ub-blink .5s steps(1) infinite}
.ub-pu-i.blink.fast .ub-pu-ic{animation-duration:.22s}
@keyframes ub-blink{50%{opacity:.15}}

/* ---------- centre: crosshair / hitmarker / hints / prompt ---------- */
.ub-cross{position:absolute;left:50%;top:50%;width:0;height:0;transition:opacity .12s}
.ub-cross.off{opacity:0}
.ub-cross i{position:absolute;background:rgba(245,240,228,.92);box-shadow:0 0 0 1px rgba(0,0,0,.45);border-radius:1px}
.ub-cross i.v{width:2px;height:.75em;left:-1px}.ub-cross i.hz{height:2px;width:.75em;top:-1px}
.ub-cross .dot{width:2px;height:2px;left:-1px;top:-1px;opacity:.7}
.ub-hit{position:absolute;left:50%;top:50%;width:2.8em;height:2.8em;margin:-1.4em 0 0 -1.4em;opacity:0}
.ub-hit svg{width:100%;height:100%;overflow:visible}
.ub-hit path{stroke:#fff;stroke-width:2.6;stroke-linecap:square;filter:drop-shadow(0 0 1px #000)}
.ub-hit.kill path{stroke:#ff3a2a}
.ub-hit.head{width:3.8em;height:3.8em;margin:-1.9em 0 0 -1.9em}
.ub-hit.head path{stroke:#ff2a1a;stroke-width:3.2}
.ub-hit.pop{animation:ub-hit .32s ease-out}
.ub-hit.head.pop{animation-duration:.42s}
@keyframes ub-hit{0%{opacity:1;transform:scale(1.55)}25%{opacity:1;transform:scale(.92)}60%{opacity:1;transform:scale(1)}100%{opacity:0;transform:scale(1.05)}}
.ub-hint{position:absolute;left:50%;top:calc(50% + 4.2em);transform:translateX(-50%);font-family:var(--f-stencil);font-weight:700;font-size:1.25em;letter-spacing:.35em;
  padding-left:.35em;color:var(--bone);text-shadow:0 0 .4em #000,0 .08em .1em #000;opacity:0;transition:opacity .15s}
.ub-hint.on{opacity:1;animation:ub-hintp 1s ease-in-out infinite}
.ub-hint.red{color:#ff4030}
@keyframes ub-hintp{50%{opacity:.35}}
.ub-prompt{position:absolute;left:50%;top:64%;transform:translateX(-50%);font-family:var(--f-type);font-size:1.3em;color:var(--bone);white-space:nowrap;
  padding:.45em 1.3em .5em;opacity:0;transition:opacity .15s;text-shadow:0 .06em .15em #000,0 0 .4em rgba(0,0,0,.8)}
.ub-prompt::before{content:"";position:absolute;inset:0 -1.2em;background:radial-gradient(ellipse 50% 50% at 50% 50%,rgba(0,0,0,.6),transparent 100%);z-index:-1}
.ub-prompt.on{opacity:1}
.ub-prompt .cost{color:var(--gold)}
.ub-key{display:inline-block;min-width:1.7em;padding:.08em .38em .02em;margin:0 .2em;border-radius:.2em;font-family:var(--f-cond);font-weight:600;font-size:.9em;text-align:center;
  color:#1a1510;background:linear-gradient(#f2e9d4,#c9bc9d);box-shadow:0 .14em 0 #6d624d,0 .2em .3em rgba(0,0,0,.6),inset 0 1px 0 #fff8e8;vertical-align:.08em;text-shadow:none;letter-spacing:.02em}

/* ---------- banner / message ---------- */
.ub-banner{position:absolute;left:50%;top:11%;transform:translateX(-50%);text-align:center;pointer-events:none}
.ub-banner .t{font-family:var(--f-stencil);font-weight:700;font-size:4.2em;letter-spacing:.08em;line-height:1;color:var(--bone);white-space:nowrap;
  text-shadow:0 0 .12em rgba(255,210,120,.6),0 0 .5em rgba(230,150,40,.45),.04em .06em 0 #2a0400;filter:url(#ub-distress)}
.ub-banner .sb{font-family:var(--f-type);font-size:1.2em;letter-spacing:.25em;margin-top:.4em;color:#e9d9b5;text-shadow:0 0 .3em #000}
.ub-banner .ink{position:absolute;left:50%;top:48%;width:150%;height:130%;transform:translate(-50%,-50%);background:var(--tx-smear-dark) no-repeat center/100% 100%;opacity:.75;z-index:-1}
.ub-banner.go{animation:ub-slam 3.2s cubic-bezier(.2,.8,.2,1) both}
@keyframes ub-slam{0%{opacity:0;transform:translateX(-50%) scale(2.6) rotate(-4deg)}9%{opacity:1;transform:translateX(-50%) scale(.93) rotate(-1.5deg)}
  14%{transform:translateX(-50%) scale(1.03) rotate(-1deg)}19%{transform:translateX(-50%) scale(1) rotate(-1deg)}82%{opacity:1;transform:translateX(-50%) scale(1) rotate(-1deg)}
  100%{opacity:0;transform:translateX(-50%) translateY(-.6em) scale(1.02) rotate(-1deg)}}
.ub-msg{position:absolute;left:clamp(14px,2.6vw,56px);top:clamp(14px,4vh,60px);max-width:min(30em,70vw);padding:.7em 1.1em .75em 1.2em;
  font-family:var(--f-type);font-size:1.02em;color:#1d1812;background:var(--tx-paper) center/320px;opacity:0;transform:translateX(-1em) rotate(-.6deg);
  transition:opacity .35s,transform .35s;box-shadow:0 .3em .8em rgba(0,0,0,.55)}
.ub-msg.on{opacity:.94;transform:rotate(-.6deg)}
.ub-msg::after{content:"";display:inline-block;width:.5em;height:1em;background:#1d1812;margin-left:.1em;vertical-align:-.12em;animation:ub-caret .8s steps(1) infinite}
.ub-msg.done::after{display:none}
.ub-msg .tag{display:block;font-family:var(--f-stencil);font-weight:700;font-size:.72em;letter-spacing:.3em;color:#8b150f;margin-bottom:.2em}
@keyframes ub-caret{50%{opacity:0}}

/* ---------- damage / health / downed ---------- */
.ub-hurt{position:absolute;inset:0;opacity:0;background:radial-gradient(ellipse 80% 75% at 50% 50%,transparent 38%,rgba(120,0,0,.5) 78%,rgba(60,0,0,.92) 100%);transition:opacity .4s}
.ub-hurt-sp{position:absolute;inset:0;opacity:0;transition:opacity .6s}
.ub-hurt-sp b{position:absolute;width:62vmin;height:62vmin;background-size:100% 100%;transform:translate(-50%,-50%)}
.ub-splat{position:absolute;background-size:100% 100%;transform:translate(-50%,-50%);opacity:0;will-change:opacity,transform}
.ub-flash{position:absolute;inset:0;background:radial-gradient(ellipse at center,transparent 40%,rgba(170,0,0,.55));opacity:0}
.ub-downed{position:absolute;inset:0;opacity:0;visibility:hidden;transition:opacity .8s,visibility 0s linear .8s;
  backdrop-filter:grayscale(.85) contrast(1.08) brightness(.8);-webkit-backdrop-filter:grayscale(.85) contrast(1.08) brightness(.8)}
.ub-downed.on{opacity:1;visibility:visible;transition:opacity .8s,visibility 0s}
.ub-downed::before{content:"";position:absolute;inset:0;background:radial-gradient(ellipse 70% 65% at 50% 50%,rgba(120,0,0,.25),rgba(70,0,0,.85));mix-blend-mode:multiply;animation:ub-beat 1.1s ease-in-out infinite}
@keyframes ub-beat{0%,100%{opacity:.85}12%{opacity:1}24%{opacity:.8}36%{opacity:1}}
.ub-bleed{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);display:flex;flex-direction:column;align-items:center;gap:.6em}
.ub-bleed svg{width:7em;height:7em;overflow:visible}
.ub-bleed .bg{fill:none;stroke:rgba(0,0,0,.5);stroke-width:7}
.ub-bleed .ring{fill:none;stroke:#c41a12;stroke-width:5;stroke-linecap:round;transform:rotate(-90deg);transform-origin:center;filter:drop-shadow(0 0 4px rgba(255,30,10,.7))}
.ub-bleed .lbl{font-family:var(--f-stencil);font-weight:700;letter-spacing:.4em;font-size:1.3em;color:#f0d6cc;text-shadow:0 0 .4em #000;padding-left:.4em}
.ub-bleed .sub{font-family:var(--f-type);font-size:.95em;color:#d8b8ad;opacity:.8}

/* ---------- menus shared ---------- */
.ub-item{position:relative;display:block;padding:.18em 0 .22em;font-family:var(--f-cond);font-weight:600;text-transform:uppercase;letter-spacing:.06em;color:var(--bone-dim);outline:none;width:max-content}
.ub-item .lbl{position:relative;z-index:1;display:inline-block;transition:transform .28s cubic-bezier(.2,.8,.2,1),color .2s,text-shadow .2s;text-shadow:0 .05em .1em #000}
.ub-item .smear{position:absolute;left:-.25em;right:-.6em;bottom:.12em;height:.52em;background:var(--tx-smear) no-repeat left center/100% 100%;
  clip-path:inset(0 100% 0 0);transition:clip-path .38s cubic-bezier(.3,.7,.2,1),transform .28s cubic-bezier(.2,.8,.2,1);opacity:.95}
.ub-item::before{content:"";position:absolute;left:-.9em;top:50%;width:.45em;height:.14em;margin-top:-.06em;background:var(--blood-hi);transform:scaleX(0);transform-origin:left;transition:transform .25s}
.ub-item.is-sel{color:#fff}
.ub-item.is-sel .lbl{transform:translateX(.55em);text-shadow:0 0 .4em rgba(255,60,40,.35),0 .05em .1em #000}
.ub-item.is-sel .smear{clip-path:inset(0 0 0 0);transform:translateX(.55em)}
.ub-item.is-sel::before{transform:scaleX(1)}
.ub-item.dis{opacity:.35}

/* ---------- loading ---------- */
.ub-loading{background:#070605;z-index:30;display:grid;place-items:center}
.ub-loading .inner{position:relative;width:min(40em,86vw);text-align:center}
.ub-load-title{font-family:var(--f-stencil);font-weight:700;font-size:4.8em;letter-spacing:.12em;color:var(--bone);line-height:1;filter:url(#ub-distress);
  text-shadow:0 0 .25em rgba(160,10,5,.55),.03em .05em 0 #3a0000;padding-left:.12em}
.ub-load-sub{font-family:var(--f-type);letter-spacing:.55em;font-size:1em;color:#a99b82;margin:.9em 0 3em;padding-left:.55em}
.ub-fuse{position:relative;height:1.1em;margin:0 1em}
.ub-fuse .rope{position:absolute;top:50%;height:.42em;margin-top:-.21em;left:0;right:0;border-radius:.2em;
  background:repeating-linear-gradient(115deg,#8a7152 0 .22em,#5b4631 .22em .34em,#a38a67 .34em .52em);box-shadow:0 .08em .12em #000,inset 0 .08em .05em rgba(255,240,200,.2)}
.ub-fuse .burnt{position:absolute;top:50%;height:.3em;margin-top:-.15em;left:0;width:0;border-radius:.15em;
  background:linear-gradient(90deg,#1a1512,#2a211b 70%,#6b2a0c 94%,#ff8a2a);box-shadow:0 0 .4em rgba(255,110,20,.25)}
.ub-fuse .cov{position:absolute;inset:0;right:auto;width:0;background:#070605}
.ub-fuse .spark{position:absolute;top:50%;left:0;width:0;height:0}
.ub-fuse .spark::before{content:"";position:absolute;width:2.4em;height:2.4em;left:-1.2em;top:-1.2em;border-radius:50%;
  background:radial-gradient(circle,#fff6c8 0,#ffc347 18%,rgba(255,110,20,.55) 38%,transparent 70%);animation:ub-fl .09s steps(2) infinite alternate}
.ub-fuse .spark i{position:absolute;width:3px;height:3px;border-radius:50%;background:#ffd07a;box-shadow:0 0 4px #ff8a20;animation:ub-sp .7s ease-out infinite}
@keyframes ub-fl{to{transform:scale(.8);opacity:.85}}
@keyframes ub-sp{0%{transform:translate(0,0);opacity:1}100%{transform:translate(var(--dx),var(--dy));opacity:0}}
.ub-load-row{display:flex;justify-content:space-between;margin:1.3em 1em 0;font-family:var(--f-type);font-size:.95em;color:#bfb196}
.ub-load-pct{color:var(--gold);font-variant-numeric:tabular-nums}
.ub-load-flav{margin-top:3.2em;min-height:3em;font-family:var(--f-type);font-size:1em;color:#8f846f;line-height:1.5;transition:opacity .6s;font-style:normal}
.ub-load-flav.fade{opacity:0}

/* ---------- main menu ---------- */
.ub-menu{z-index:10}
.ub-menu .shade{position:absolute;inset:0;background:linear-gradient(90deg,rgba(6,5,4,.94) 0%,rgba(6,5,4,.82) 30%,rgba(6,5,4,.35) 58%,rgba(6,5,4,0) 80%),
  linear-gradient(0deg,rgba(0,0,0,.6),transparent 30%)}
.ub-menu .panel{position:absolute;left:clamp(20px,7vw,160px);top:0;bottom:0;display:flex;flex-direction:column;justify-content:center;max-width:min(46em,90vw)}
.ub-kicker{font-family:var(--f-type);font-size:.95em;letter-spacing:.35em;color:#9a2b20;margin-bottom:.4em;padding-left:.2em}
.ub-title{margin:0;font-family:var(--f-stencil);font-weight:700;font-size:clamp(3.2rem,9.6vw,13rem);line-height:.9;letter-spacing:.02em;color:#e3d7bd;
  text-shadow:0 0 .04em rgba(255,240,210,.35),0 0 .22em rgba(150,8,4,.55),.03em .05em 0 #3b0402,0 0 .6em rgba(0,0,0,.8);filter:url(#ub-distress);
  animation:ub-bulb-flick 9s linear infinite;white-space:nowrap}
@keyframes ub-bulb-flick{0%,19%,21.5%,23%,62%,64%,100%{opacity:1}20%,22.5%{opacity:.55}63%{opacity:.78}
  40%{opacity:1;text-shadow:0 0 .04em rgba(255,240,210,.35),0 0 .3em rgba(170,10,4,.7),.03em .05em 0 #3b0402,0 0 .6em rgba(0,0,0,.8)}}
.ub-subtitle{display:flex;align-items:center;white-space:nowrap;width:max-content;gap:.8em;margin:.55em 0 0 .15em;font-family:var(--f-stencil);font-weight:700;font-size:clamp(1rem,1.7vw,2.1rem);letter-spacing:.42em;color:#b4a88f}
.ub-subtitle .rule{flex:0 0 2.2em;height:2px;background:linear-gradient(90deg,transparent,var(--blood))}
.ub-subtitle .rule:last-child{background:linear-gradient(90deg,var(--blood),transparent)}
.ub-items{margin-top:clamp(1.6em,6vh,4.5em);display:flex;flex-direction:column;gap:.1em;padding-left:.9em}
.ub-items .ub-item{font-size:clamp(1.8rem,2.9vw,3.9rem)}
.ub-desc{height:1.6em;margin:1.1em 0 0 .95em;font-family:var(--f-type);font-size:1em;color:#948a76;letter-spacing:.04em}
.ub-foot{position:absolute;bottom:clamp(14px,3.5vh,40px);left:0;display:flex;gap:1.6em;font-family:var(--f-type);font-size:.85em;color:#6f675a;white-space:nowrap}
.ub-foot .ub-key{font-size:.85em}
.ub-ver{position:absolute;right:clamp(14px,2.5vw,40px);bottom:clamp(14px,3.5vh,40px);font-family:var(--f-type);font-size:.8em;color:rgba(200,190,170,.4);letter-spacing:.2em}

/* ---------- paper panels (settings / controls) ---------- */
.ub-sheet{z-index:14;background:rgba(0,0,0,.35)}
.ub-sheet .paper{position:absolute;right:clamp(16px,6vw,140px);top:50%;width:min(36em,92vw);max-height:92vh;overflow:auto;transform:translateY(-50%) rotate(.6deg);
  padding:2.2em 2.5em 2em;color:#1c1712;font-family:var(--f-type);background:var(--tx-paper) center/420px,#cdbf9f;
  box-shadow:0 1.2em 3em rgba(0,0,0,.7);scrollbar-width:none}
.ub-sheet .paper::-webkit-scrollbar{display:none}
.ub-sheet.on .paper{animation:ub-sheet-in .45s cubic-bezier(.2,.9,.25,1) both}
@keyframes ub-sheet-in{0%{transform:translateY(-46%) translateX(3em) rotate(3deg);opacity:0}100%{transform:translateY(-50%) rotate(.6deg);opacity:1}}
.ub-sheet .paper::before{content:"";position:absolute;inset:0;pointer-events:none;box-shadow:inset 0 0 4em rgba(90,60,20,.45)}
.ub-sheet h2{margin:0;font-family:var(--f-stencil);font-weight:700;font-size:2.5em;letter-spacing:.1em;line-height:1;color:#1c1712}
.ub-sheet .form{font-size:.8em;letter-spacing:.2em;color:#5b4c3a;margin:.4em 0 1.2em;display:flex;justify-content:space-between;border-bottom:2px solid #2a221a;padding-bottom:.6em}
.ub-stamp{position:absolute;right:1.6em;top:1.5em;font-family:var(--f-stencil);font-weight:700;font-size:1.05em;letter-spacing:.2em;color:rgba(160,20,14,.8);
  border:.16em solid rgba(160,20,14,.75);padding:.15em .5em .1em;transform:rotate(-9deg);filter:url(#ub-distress);mix-blend-mode:multiply}
.ub-row{display:grid;grid-template-columns:1fr 12em 3.6em;align-items:center;gap:.9em;padding:.55em .5em;margin:0 -.5em;border-bottom:1px dashed rgba(60,45,30,.35);position:relative}
.ub-row .nm{font-size:1.02em;letter-spacing:.06em;text-transform:uppercase}
.ub-row .val{text-align:right;font-variant-numeric:tabular-nums;color:#6a160f}
.ub-row.is-sel{background:rgba(140,20,10,.1)}
.ub-row.is-sel::before{content:"";position:absolute;left:-.9em;top:50%;border:.38em solid transparent;border-left:.5em solid #8b150f;transform:translateY(-50%)}
.ub-range{-webkit-appearance:none;appearance:none;width:100%;height:1.4em;background:transparent;cursor:pointer;margin:0;
  --p:50%}
.ub-range::-webkit-slider-runnable-track{height:.28em;background:linear-gradient(90deg,#8b150f 0 var(--p),rgba(40,30,20,.35) var(--p) 100%);border-radius:.1em}
.ub-range::-moz-range-track{height:.28em;background:linear-gradient(90deg,#8b150f 0 var(--p),rgba(40,30,20,.35) var(--p) 100%)}
.ub-range::-webkit-slider-thumb{-webkit-appearance:none;width:.8em;height:1.35em;margin-top:-.54em;border-radius:.15em;
  background:linear-gradient(90deg,#8a6a2a,#e7c46e 45%,#9a7630);box-shadow:0 .1em .2em rgba(0,0,0,.6);border:1px solid #4a3510}
.ub-range::-moz-range-thumb{width:.8em;height:1.35em;border-radius:.15em;background:linear-gradient(90deg,#8a6a2a,#e7c46e 45%,#9a7630);border:1px solid #4a3510}
.ub-seg{display:flex;border:2px solid #2a221a;grid-column:2 / 4}
.ub-seg button{flex:1;text-align:center;padding:.3em 0 .2em;font-family:var(--f-stencil);font-weight:700;letter-spacing:.14em;font-size:.95em;color:#2a221a}
.ub-seg button.act{background:#2a221a;color:#e8dcc0}
.ub-sheet .back{margin-top:1.5em;font-family:var(--f-stencil);font-weight:700;font-size:1.35em;letter-spacing:.2em;color:#1c1712;padding:.2em .1em}
.ub-sheet .back.is-sel{color:#8b150f}
.ub-sheet .back .ub-key{font-size:.65em;margin-left:.8em;vertical-align:.25em}
.ub-ctl{display:grid;grid-template-columns:1fr auto;gap:.1em 1.5em;align-items:center}
.ub-ctl .a{font-size:1.02em;text-transform:uppercase;letter-spacing:.06em;padding:.42em 0;border-bottom:1px dashed rgba(60,45,30,.35)}
.ub-ctl .k{text-align:right;padding:.3em 0;border-bottom:1px dashed rgba(60,45,30,.35);white-space:nowrap}
.ub-ctl .k .or{font-size:.8em;color:#6a5a45;margin:0 .15em}
.ub-sheet .ub-key{font-size:.85em}

/* ---------- pause ---------- */
.ub-pause{z-index:12;background:linear-gradient(90deg,rgba(5,4,3,.9),rgba(5,4,3,.6) 55%,rgba(5,4,3,.35));backdrop-filter:blur(3px) grayscale(.4);-webkit-backdrop-filter:blur(3px) grayscale(.4)}
.ub-pause .panel{position:absolute;left:clamp(20px,7vw,160px);top:0;bottom:0;display:flex;flex-direction:column;justify-content:center}
.ub-pause h2{margin:0;font-family:var(--f-stencil);font-weight:700;font-size:clamp(3rem,6.5vw,8rem);line-height:.95;letter-spacing:.06em;color:#e3d7bd;
  text-shadow:0 0 .22em rgba(150,8,4,.5),.03em .05em 0 #3b0402;filter:url(#ub-distress)}
.ub-pause .info{font-family:var(--f-type);letter-spacing:.3em;color:#a4987f;margin:.5em 0 0 .2em;font-size:1.05em}
.ub-pause .ub-items .ub-item{font-size:clamp(1.6rem,2.4vw,3.1rem)}

/* ---------- game over ---------- */
.ub-go{z-index:16;background:radial-gradient(ellipse at 50% 45%,rgba(20,0,0,.72),rgba(0,0,0,.96) 75%);display:grid;place-items:center;transition:opacity 1.4s,visibility 0s linear 1.4s}
.ub-go.on{transition:opacity 1.4s,visibility 0s}
.ub-go .inner{position:relative;display:flex;flex-direction:column;align-items:center;text-align:center;width:min(44em,92vw)}
.ub-go .l1{font-family:var(--f-stencil);font-weight:700;font-size:2.4em;letter-spacing:.4em;padding-left:.4em;color:var(--bone);opacity:0;text-shadow:0 0 .3em rgba(0,0,0,.9)}
.ub-go .l1.in{animation:ub-l1 1.4s cubic-bezier(.2,.8,.2,1) forwards}
@keyframes ub-l1{0%{opacity:0;letter-spacing:1.1em;filter:blur(6px)}100%{opacity:1;letter-spacing:.4em;filter:blur(0)}}
.ub-go .rn{height:11em;margin:.6em 0 .2em;filter:drop-shadow(0 0 .7em rgba(140,0,0,.55))}
.ub-go .rn .ub-paint{height:100%;width:auto}
.ub-go .l2{font-family:var(--f-stencil);font-weight:700;font-size:1.9em;letter-spacing:.55em;padding-left:.55em;color:#c9bca2;opacity:0;transition:opacity .9s}
.ub-go .l2.in{opacity:1}
.ub-go .stats{margin-top:2.2em;width:min(27em,88vw);font-family:var(--f-type);font-size:1.12em;color:#d8ccb2}
.ub-go .st{display:flex;align-items:baseline;gap:.4em;padding:.18em 0;min-height:1.6em}
.ub-go .st .k{white-space:nowrap}
.ub-go .st .dots{flex:1;border-bottom:2px dotted rgba(200,185,160,.35);transform:translateY(-.25em);opacity:0;transition:opacity .3s}
.ub-go .st.full .dots{opacity:1}
.ub-go .st .v{color:var(--gold);white-space:nowrap}
.ub-go .btns{display:flex;gap:3em;margin-top:2.4em;opacity:0;transform:translateY(.6em);transition:opacity .6s,transform .6s}
.ub-go .btns.in{opacity:1;transform:none}
.ub-go .btns .ub-item{font-size:2em}
.ub-go .skip{position:absolute;bottom:-4em;font-family:var(--f-type);font-size:.8em;color:#5d554a;letter-spacing:.2em}

/* ---------- responsive ---------- */
@media (max-width:760px){
  .ub-menu .shade{background:linear-gradient(0deg,rgba(6,5,4,.95) 0%,rgba(6,5,4,.8) 55%,rgba(6,5,4,.55) 100%)}
  .ub-menu .panel,.ub-pause .panel{left:18px;right:18px;max-width:none;justify-content:flex-end;padding-bottom:18vh}
  .ub-title{font-size:clamp(2.6rem,15vw,5rem)}
  .ub-subtitle{letter-spacing:.25em}
  .ub-foot{display:none}
  .ub-sheet .paper{right:50%;transform:translate(50%,-50%);padding:1.6em 1.3em}
  .ub-sheet.on .paper{animation:none;transform:translate(50%,-50%)}
  .ub-row{grid-template-columns:1fr 3.4em;grid-template-areas:"n v" "r r"}
  .ub-row .nm{grid-area:n}.ub-row .val{grid-area:v}.ub-row .ub-range{grid-area:r}.ub-row .ub-seg{grid-area:r}
  .ub-go .btns{gap:1.6em}
  .ub-banner .t{font-size:2.6em}
  .ub-prompt{font-size:1.05em;white-space:normal;width:90vw;text-align:center}
}
`;

// ---------------------------------------------------------------- co-op style (phase 2)
const CSS_COOP = `
/* ---------- team score list (bottom-right, above local points) ---------- */
.ub-team{display:flex;flex-direction:column;align-items:flex-end;gap:.05em;margin-bottom:-.55em;padding-right:.7em}
.ub-tm{display:flex;align-items:center;gap:.5em;transition:opacity .6s,transform .5s;animation:ub-fd-in .4s ease-out both}
.ub-tm .nm{font-family:var(--f-type);font-size:.78em;color:var(--c);opacity:.8;max-width:9em;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;text-shadow:0 1px 2px #000,0 0 .3em #000}
.ub-tm .pt{font-family:var(--f-cond);font-weight:600;font-size:1.6em;line-height:1.1;color:var(--c);min-width:2.6em;text-align:right;font-variant-numeric:tabular-nums;
  text-shadow:0 0 .3em rgba(0,0,0,.85),0 .06em 0 rgba(0,0,0,.8)}
.ub-medic{width:1em;height:1em;display:none;flex:0 0 auto;filter:drop-shadow(0 0 .2em rgba(255,20,10,.6))}
.ub-tm.down .ub-medic,.ub-points-wrap.down .ub-medic{display:block;animation:ub-hintp .9s ease-in-out infinite}
.ub-tm.down .pt{color:#8d867a}
.ub-tm.down .nm{color:#e0473a;opacity:1}
.ub-tm.dc{opacity:.28}
.ub-tm.dc .nm::after{content:" \\2014 lost signal";color:#8d867a}
.ub-tm.gone{opacity:0;transform:translateX(1.2em)}
.ub-points-wrap .ub-medic{position:absolute;left:.1em;top:50%;width:1.3em;height:1.3em;margin-top:-.65em}
.ub-points-wrap.down .ub-points{color:#8d867a!important;text-shadow:0 .06em 0 #000}
.ub-points.slot{text-shadow:0 0 .35em rgba(0,0,0,.6),0 .06em 0 rgba(0,0,0,.85),0 0 .08em #000}

/* ---------- markers ---------- */
.ub-marks{position:absolute;inset:0;overflow:hidden}
.ub-mk{position:absolute;left:0;top:0;width:0;height:0;will-change:transform}
.ub-mk>*{position:absolute;left:0;top:0}
.ub-mk .plate{transform:translate(-50%,-100%);display:flex;flex-direction:column;align-items:center;white-space:nowrap;transform-origin:50% 100%}
.ub-mk .plate .nm{font-family:var(--f-cond);font-weight:600;font-size:.95em;letter-spacing:.08em;text-transform:uppercase;color:var(--c);
  text-shadow:0 0 .25em rgba(0,0,0,.95),0 1px 1px #000}
.ub-mk .plate .chev{width:0;height:0;border:.3em solid transparent;border-top:.36em solid var(--c);margin-top:.05em;filter:drop-shadow(0 1px 1px #000)}
.ub-mk .dn,.ub-mk .arr{display:none}
.ub-mk.down .plate{display:none}
.ub-mk.down .dn{display:flex}
.ub-mk .dn{flex-direction:column;align-items:center;transform:translate(-50%,-50%)}
.ub-mk .dn svg{width:3.2em;height:3.2em;overflow:visible}
.ub-mk .dn .bg{fill:rgba(20,0,0,.55);stroke:rgba(0,0,0,.6);stroke-width:5}
.ub-mk .dn .ring{fill:none;stroke:#d8261a;stroke-width:3.6;stroke-linecap:round;stroke-dasharray:1 1;transform:rotate(-90deg);filter:drop-shadow(0 0 3px rgba(255,40,20,.8))}
.ub-mk .dn .cross{fill:#e32a1c;stroke:#2a0000;stroke-width:1;transform-origin:center;animation:ub-cross 1s ease-in-out infinite}
.ub-mk.rev .dn .ring{stroke:#f2ead8;filter:drop-shadow(0 0 3px rgba(255,255,230,.8))}
.ub-mk.rev .dn .cross{fill:#f2ead8;animation:none}
@keyframes ub-cross{50%{transform:scale(.8);opacity:.7}}
.ub-mk .dl{margin-top:.25em;font-family:var(--f-stencil);font-weight:700;font-size:.72em;letter-spacing:.18em;color:#ffd5cc;text-shadow:0 0 .3em #000,0 1px 1px #000;white-space:nowrap}
.ub-mk .dl .who{color:var(--c)}
.ub-mk.edge .dn svg{width:2.7em;height:2.7em}
.ub-mk.edge.lab-up .dn{flex-direction:column-reverse}
.ub-mk.edge.lab-up .dl{margin:0 0 .25em}
.ub-mk.edge .arr{display:block;width:0;height:0}
.ub-mk .arr i{position:absolute;left:-.6em;top:-.65em;width:0;height:0;border-top:.65em solid transparent;border-bottom:.65em solid transparent;border-left:1.05em solid #ef3322;
  transform:translateX(2.35em);filter:drop-shadow(0 0 3px rgba(0,0,0,.9));animation:ub-arr 1s ease-in-out infinite}
@keyframes ub-arr{50%{transform:translateX(2.75em)}}

/* ---------- revive bar ---------- */
.ub-revive{position:absolute;left:50%;top:calc(50% + 7em);transform:translateX(-50%);width:19em;text-align:center;opacity:0;transition:opacity .15s}
.ub-revive.on{opacity:1}
.ub-revive .t{display:flex;align-items:center;justify-content:center;gap:.5em;font-family:var(--f-stencil);font-weight:700;letter-spacing:.2em;font-size:1.02em;
  color:var(--bone);text-shadow:0 0 .4em #000,0 1px 1px #000;margin-bottom:.5em;white-space:nowrap;text-transform:uppercase}
.ub-revive .t svg{width:1.1em;height:1.1em}
.ub-revive .bar{position:relative;height:.62em;background:rgba(0,0,0,.6);border:1px solid rgba(232,223,202,.5);padding:2px;box-shadow:0 0 .8em rgba(0,0,0,.7)}
.ub-revive .fill{height:100%;width:0;background:linear-gradient(90deg,#8e1a12,#e04a30);box-shadow:0 0 .6em rgba(255,80,40,.55)}
.ub-revive .bar::after{content:"";position:absolute;inset:2px;background:repeating-linear-gradient(90deg,transparent 0 calc(10% - 1px),rgba(0,0,0,.55) calc(10% - 1px) 10%)}

/* ---------- feed ---------- */
.ub-feed{position:absolute;left:clamp(14px,2.6vw,56px);top:30%;display:flex;flex-direction:column;align-items:flex-start;gap:.3em;max-width:min(28em,60vw)}
.ub-fd{font-family:var(--f-type);font-size:.95em;color:#e0d5bd;padding:.28em 1.4em .26em .7em;background:linear-gradient(90deg,rgba(0,0,0,.62),rgba(0,0,0,0));
  border-left:3px solid var(--c,#a3120e);text-shadow:0 1px 2px #000;animation:ub-fd-in .35s ease-out both;transition:opacity .6s,transform .6s}
.ub-fd b{font-weight:normal}
.ub-fd.out{opacity:0;transform:translateX(-.8em)}
@keyframes ub-fd-in{from{opacity:0;transform:translateX(-1.2em)}}

/* ---------- chat ---------- */
.ub-chat{position:absolute;left:clamp(14px,2.6vw,56px);bottom:calc(clamp(12px,2.6vh,44px) + 16em);width:min(30em,64vw);display:flex;flex-direction:column;align-items:stretch;gap:.18em;
  padding:.5em .6em;margin-left:-.6em;transition:background .2s}
.ub-chat.open{background:linear-gradient(90deg,rgba(0,0,0,.55),rgba(0,0,0,.25) 70%,transparent)}
.ub-cl{font-family:var(--f-type);font-size:.95em;line-height:1.35;color:#ece3cf;text-shadow:0 1px 2px #000,0 0 .35em #000;transition:opacity .9s;overflow-wrap:anywhere;animation:ub-fd-in .25s ease-out both}
.ub-cl .n{color:var(--c)}
.ub-cl .n::after{content:":";color:#9e937e;margin-right:.35em}
.ub-cl.sys{color:#a99d86}
.ub-cl.old{opacity:0}
.ub-chat.open .ub-cl.old{opacity:.8}
.ub-chatin{display:none;align-items:center;gap:.6em;margin-top:.35em;padding:.4em .7em;background:rgba(10,8,6,.85);border:1px solid rgba(232,223,202,.3);border-left:3px solid var(--blood-hi)}
.ub-chat.open .ub-chatin{display:flex}
.ub-chatin .lb{font-family:var(--f-stencil);font-weight:700;letter-spacing:.22em;font-size:.78em;color:#b3a68d;white-space:nowrap}
.ub-chatin input{flex:1;min-width:0;background:none;border:0;outline:0;color:#f3ead6;font-family:var(--f-type);font-size:1em;pointer-events:auto;caret-color:#e04a30;padding:0}
.ub-chatin .ct{font-family:var(--f-type);font-size:.72em;color:#6f675a}

/* ---------- net status ---------- */
.ub-net{position:absolute;right:clamp(14px,2.6vw,56px);top:clamp(12px,2.6vh,40px);display:flex;align-items:center;gap:.5em;font-family:var(--f-type);font-size:.82em;
  color:rgba(232,223,202,.72);text-shadow:0 1px 2px #000;opacity:0;transition:opacity .3s;white-space:nowrap}
.ub-net.on{opacity:1}
.ub-net svg{width:1.2em;height:1.2em}
.ub-net .ic{fill:none;stroke:currentColor;stroke-width:1.6;stroke-linecap:round}
.ub-bars{display:inline-flex;align-items:flex-end;gap:2px;height:.95em;vertical-align:-.08em}
.ub-bars i{width:3px;background:rgba(232,223,202,.22)}
.ub-bars i:nth-child(1){height:30%}.ub-bars i:nth-child(2){height:55%}.ub-bars i:nth-child(3){height:78%}.ub-bars i:nth-child(4){height:100%}
.ub-bars i.on{background:#a9d47c}
.ub-bars.q2 i.on{background:#e6c14f}.ub-bars.q1 i.on{background:#ef5a3c}
.ub-net.warn{color:#ff6a52}
.ub-net.warn .ub-bars i.on{background:#ff4030}
.ub-net.warn .ic,.ub-net.warn .wt{animation:ub-hintp .8s ease-in-out infinite}
.ub-net .wt{display:none;font-family:var(--f-stencil);font-weight:700;letter-spacing:.2em}
.ub-net.warn .wt{display:inline}

/* ---------- spectating ---------- */
.ub-spec{position:absolute;inset:0;opacity:0;transition:opacity .5s}
.ub-spec.on{opacity:1}
.ub-spec::before,.ub-spec::after{content:"";position:absolute;left:0;right:0;height:7vh;background:#000}
.ub-spec::before{top:0}.ub-spec::after{bottom:0}
.ub-spec .box{position:absolute;left:50%;top:calc(7vh + 1.2em);transform:translateX(-50%);text-align:center;white-space:nowrap}
.ub-spec .a{font-family:var(--f-stencil);font-weight:700;letter-spacing:.35em;font-size:1.45em;color:var(--bone);text-shadow:0 0 .4em #000}
.ub-spec .a b{color:var(--c);font-weight:700}
.ub-spec .b{font-family:var(--f-type);font-size:.95em;color:#bcae95;margin-top:.35em;text-shadow:0 1px 2px #000}
.ub-spec .rec{display:inline-block;width:.55em;height:.55em;border-radius:50%;background:#d8261a;margin-right:.7em;vertical-align:.15em;animation:ub-blink 1.2s steps(1) infinite}

/* ---------- scoreboard (field report) ---------- */
.ub-sb{position:absolute;left:50%;top:45%;width:min(52em,94vw);transform:translate(-50%,-50%) rotate(-.4deg);padding:1.7em 2.2em 1.5em;
  background:var(--tx-paper) center/420px,#cdbf9f;color:#1c1712;font-family:var(--f-type);box-shadow:0 1em 3em rgba(0,0,0,.75);opacity:0;visibility:hidden;transition:opacity .12s,visibility 0s linear .12s}
.ub-sb.on{opacity:.97;visibility:visible;transition:opacity .12s,visibility 0s}
.ub-sb::before{content:"";position:absolute;inset:0;pointer-events:none;box-shadow:inset 0 0 4em rgba(90,60,20,.45)}
.ub-sb .hd{display:flex;align-items:flex-end;justify-content:space-between;border-bottom:2px solid #2a221a;padding-bottom:.5em;margin-bottom:.3em}
.ub-sb h3{margin:0;font-family:var(--f-stencil);font-weight:700;font-size:2.2em;letter-spacing:.1em;line-height:1}
.ub-sb .meta{font-size:.8em;letter-spacing:.18em;color:#5b4c3a;text-align:right;line-height:1.5}
.ub-sb .r{display:grid;grid-template-columns:.55em minmax(7em,1fr) 5.4em 3.6em 4.2em 4.4em 3.6em 5em;align-items:center;gap:0 .8em;padding:.5em .5em;margin:0 -.5em;border-bottom:1px dashed rgba(60,45,30,.4)}
.ub-sb .r.h{color:#5b4c3a;border-bottom:1px solid rgba(40,30,20,.6);padding:.35em .5em}
.ub-sb .r.h>span{font-size:.7em;letter-spacing:.14em;white-space:nowrap}
.ub-sb .r.me{background:rgba(140,20,10,.09)}
.ub-sb .tab{height:1.6em;background:var(--c);border:1px solid rgba(0,0,0,.65);box-shadow:inset 0 1px 0 rgba(255,255,255,.4)}
.ub-sb .nm{text-transform:uppercase;letter-spacing:.05em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.ub-sb .nm small{display:block;font-size:.66em;letter-spacing:.14em;color:#6a5a45;margin-top:.1em}
.ub-sb .nm .dn{color:#a3120e;font-size:.7em;letter-spacing:.15em;margin-left:.6em}
.ub-sb .n{text-align:right;font-variant-numeric:tabular-nums}
.ub-sb .pts{font-weight:bold;color:#6a160f;font-size:1.08em}
.ub-sb .ping{text-align:right;white-space:nowrap;font-size:.9em}
.ub-sb .ping .ub-bars i{background:rgba(40,30,20,.2)}.ub-sb .ping .ub-bars i.on{background:#2a221a}
.ub-sb .ub-stamp{top:1.1em;right:13em}
.ub-sb .foot{margin-top:.8em;font-size:.75em;letter-spacing:.2em;color:#6a5a45;display:flex;justify-content:space-between}

/* ---------- co-op sheet (join/host) ---------- */
.ub-coop .paper{width:min(38em,92vw)}
.ub-fld{display:block;padding:.7em .6em;margin:0 -.6em;position:relative}
.ub-fld.is-sel{background:rgba(140,20,10,.08)}
.ub-fld.is-sel::before{content:"";position:absolute;left:-.9em;top:50%;border:.38em solid transparent;border-left:.5em solid #8b150f;transform:translateY(-50%)}
.ub-fld .lb{display:block;font-size:.78em;letter-spacing:.24em;color:#5b4c3a;margin-bottom:.4em}
.ub-name{width:100%;font-family:var(--f-type);font-size:1.35em;color:#1c1712;background:transparent;border:0;border-bottom:2px solid #2a221a;outline:0;padding:.15em .1em;
  text-transform:uppercase;letter-spacing:.08em;pointer-events:auto;caret-color:#8b150f}
.ub-name::placeholder{color:rgba(40,30,20,.35)}
.ub-fld .cnt{position:absolute;right:.6em;bottom:.95em;font-size:.72em;color:#7a6a55}
.ub-root .ub-big{display:flex;align-items:center;justify-content:space-between;width:100%;padding:.75em .9em;margin:.2em 0;border:2px solid #2a221a;background:rgba(42,34,26,.04);position:relative}
.ub-big .l{font-family:var(--f-stencil);font-weight:700;font-size:1.55em;letter-spacing:.16em;color:#1c1712}
.ub-big .d{font-size:.8em;color:#5b4c3a;text-align:right;max-width:14em}
.ub-root .ub-big.is-sel{background:#2a221a}
.ub-big.is-sel .l{color:#efe4c8}.ub-big.is-sel .d{color:#b9ab8f}
.ub-or{display:flex;align-items:center;gap:1em;margin:.9em 0 .3em;font-size:.78em;letter-spacing:.3em;color:#6a5a45}
.ub-or::before,.ub-or::after{content:"";flex:1;border-top:1px dashed rgba(60,45,30,.5)}
.ub-joinrow{display:flex;align-items:center;gap:1em;flex-wrap:wrap}
.ub-cells{position:relative;display:flex;gap:.35em}
.ub-cells span{width:1.55em;height:1.9em;display:grid;place-items:center;font-family:var(--f-type);font-size:1.7em;color:#1c1712;border:2px solid #2a221a;background:rgba(255,250,235,.25)}
.ub-cells span.cur{box-shadow:inset 0 -.18em 0 #8b150f;animation:ub-caretb 1s steps(1) infinite}
@keyframes ub-caretb{50%{box-shadow:none}}
.ub-cells input{position:absolute;inset:0;opacity:0;width:100%;font-size:16px;pointer-events:auto;cursor:text;text-transform:uppercase}
.ub-cells.bad{animation:ub-shake .4s}
@keyframes ub-shake{20%,60%{transform:translateX(-.35em)}40%,80%{transform:translateX(.35em)}}
.ub-root .ub-jbtn{font-family:var(--f-stencil);font-weight:700;font-size:1.35em;letter-spacing:.16em;padding:.35em .9em .3em;border:2px solid #2a221a;color:#1c1712}
.ub-root .ub-jbtn.ready{background:#8b150f;border-color:#5d0d09;color:#f3e6cc}
.ub-coop .note{margin-top:.5em;font-size:.82em;color:#8b150f;min-height:1.2em}
.ub-coop .hint{margin-top:1em;padding:.7em .9em;border-left:3px solid #8b150f;background:rgba(140,20,10,.07);font-size:.85em;line-height:1.45;color:#3b3024}

/* ---------- lobby ---------- */
.ub-lobby{z-index:11}
.ub-lobby .shade{position:absolute;inset:0;background:linear-gradient(90deg,rgba(6,5,4,.95) 0%,rgba(6,5,4,.86) 45%,rgba(6,5,4,.6) 75%,rgba(6,5,4,.45) 100%)}
.ub-lobby .wrap{position:absolute;left:clamp(20px,7vw,160px);right:clamp(20px,6vw,140px);top:0;bottom:0;display:flex;align-items:center;justify-content:space-between;gap:clamp(2em,5vw,7em)}
.ub-lobby .colL{flex:0 1 30em;min-width:0}
.ub-lobby .colR{flex:0 1 32em;min-width:0}
.ub-lobby h2{margin:0;font-family:var(--f-stencil);font-weight:700;font-size:clamp(3rem,6vw,7.5rem);line-height:.95;letter-spacing:.06em;color:#e3d7bd;
  text-shadow:0 0 .22em rgba(150,8,4,.5),.03em .05em 0 #3b0402;filter:url(#ub-distress)}
.ub-lobby .lbl2{font-family:var(--f-stencil);font-weight:700;letter-spacing:.35em;font-size:.9em;color:#b3392b;margin:1.8em 0 .6em}
.ub-code{display:flex;gap:.3em;position:relative;width:max-content}
.ub-code span{width:1.2em;height:1.45em;display:grid;place-items:center;font-family:var(--f-type);font-size:clamp(2.2rem,3.6vw,4.2rem);color:#17130f;line-height:1;
  background:var(--tx-paper) center/220px,#cdbf9f;box-shadow:0 .08em .25em rgba(0,0,0,.7),inset 0 0 .35em rgba(90,60,20,.55);transform:rotate(var(--r));animation:ub-stamp-in .45s cubic-bezier(.2,1.4,.4,1) both}
@keyframes ub-stamp-in{0%{opacity:0;transform:scale(1.8) rotate(var(--r))}100%{opacity:1;transform:rotate(var(--r))}}
.ub-code .ub-stamp{position:absolute;top:-1.5em;right:-4.4em;font-size:.85em;color:rgba(200,40,28,.9);border-color:rgba(200,40,28,.85);mix-blend-mode:normal;background:rgba(0,0,0,.001)}
.ub-root .ub-copy{display:inline-flex;align-items:center;gap:.6em;margin-top:1.1em;padding:.5em 1em .45em;border:2px solid rgba(232,223,202,.55);font-family:var(--f-stencil);font-weight:700;
  letter-spacing:.2em;font-size:.95em;color:var(--bone);transition:background .2s,color .2s,border-color .2s}
.ub-copy svg{width:1.1em;height:1.1em;fill:none;stroke:currentColor;stroke-width:2}
.ub-copy.is-sel{background:var(--bone);color:#16120e;border-color:var(--bone)}
.ub-copy.done{border-color:#9fd46a;color:#b7f26a;background:rgba(120,190,60,.12)}
.ub-copy.fail{border-color:#e04a30;color:#ff8a70}
.ub-url{margin-top:.6em;font-family:var(--f-type);font-size:.8em;color:#7d7362;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:100%}
.ub-lobby .ub-items{margin-top:1.8em;padding-left:.9em}
.ub-lobby .ub-items .ub-item{font-size:clamp(1.7rem,2.5vw,3.2rem)}
.ub-wait{margin:1.6em 0 .2em .1em;font-family:var(--f-type);font-size:1.15em;color:#c9bca2}
.ub-wait::after{content:"";display:inline-block;width:1.2em;text-align:left;animation:ub-ell 1.6s steps(4) infinite}
@keyframes ub-ell{0%{content:""}25%{content:"."}50%{content:".."}75%{content:"..."}}
.ub-lstatus{display:flex;align-items:center;gap:.7em;margin-top:1.4em;font-family:var(--f-type);font-size:.9em;color:#8f846f;letter-spacing:.04em}
.ub-lstatus i{width:.5em;height:.5em;border-radius:50%;background:#9fd46a;box-shadow:0 0 .5em #9fd46a;animation:ub-hintp 1.6s ease-in-out infinite;flex:0 0 auto}
.ub-roster-h{display:flex;justify-content:space-between;align-items:baseline;font-family:var(--f-stencil);font-weight:700;letter-spacing:.3em;font-size:.9em;color:#b3a68d;
  border-bottom:1px solid rgba(232,223,202,.2);padding-bottom:.5em;margin-bottom:1.1em}
.ub-roster-h span:last-child{font-family:var(--f-type);font-weight:normal;letter-spacing:.1em;color:#7d7362}
.ub-tags{display:flex;flex-direction:column;gap:.85em}
.ub-tag{position:relative;height:4.7em;display:flex;align-items:center;gap:1em;padding:0 1.4em 0 3.3em;border:.26em solid var(--c);
  border-radius:1.1em 2.35em 2.35em 1.1em;color:#211d18;
  background:var(--tx-noise),linear-gradient(165deg,#e3dfd6 0%,#a6a298 38%,#cfcbc1 58%,#7d796f 100%);background-size:160px,100% 100%;background-blend-mode:overlay,normal;
  box-shadow:0 .3em .7em rgba(0,0,0,.65),inset 0 1px 0 rgba(255,255,255,.65),inset 0 -2px 4px rgba(0,0,0,.35);animation:ub-tag-in .5s cubic-bezier(.2,1.2,.4,1) both}
.ub-tag::before{content:"";position:absolute;left:1em;top:50%;width:1em;height:1em;margin-top:-.5em;border-radius:50%;background:#15120e;box-shadow:inset 0 .12em .2em rgba(0,0,0,.9),0 1px 0 rgba(255,255,255,.55)}
.ub-tag::after{content:"";position:absolute;left:-.26em;top:50%;width:.55em;height:1.3em;margin-top:-.65em;background:var(--c);clip-path:polygon(0 0,100% 18%,100% 82%,0 100%)}
@keyframes ub-tag-in{0%{opacity:0;transform:translateX(2em) rotate(2deg)}100%{opacity:1;transform:none}}
.ub-tag .who{flex:1;min-width:0}
.ub-tag .nm{font-family:var(--f-cond);font-weight:700;font-size:1.45em;letter-spacing:.1em;text-transform:uppercase;line-height:1.05;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;
  color:#2b2620;text-shadow:0 1px 0 rgba(255,255,255,.55),0 -1px 0 rgba(0,0,0,.3)}
.ub-tag .sub{font-family:var(--f-type);font-size:.78em;letter-spacing:.1em;color:#4a443a;margin-top:.15em;white-space:nowrap}
.ub-tag .you{font-family:var(--f-stencil);font-weight:700;font-size:.7em;letter-spacing:.2em;color:#fff;background:#2a251e;padding:.12em .45em .05em;margin-left:.6em;vertical-align:.25em}
.ub-tag .host{font-family:var(--f-stencil);font-weight:700;font-size:1em;letter-spacing:.2em;color:#a3160f;border:.15em solid #a3160f;padding:.14em .5em .04em;transform:rotate(-7deg);
  mix-blend-mode:multiply;opacity:.92}
.ub-tag .pg{display:flex;flex-direction:column;align-items:flex-end;gap:.2em;font-family:var(--f-type);font-size:.78em;color:#3b352c;min-width:3.6em}
.ub-tag .pg .ub-bars i{background:rgba(30,25,20,.2)}.ub-tag .pg .ub-bars i.on{background:#2a251e}
.ub-tag .pg .ub-bars.q1 i.on{background:#a3120e}
.ub-tag.empty{background:rgba(232,223,202,.035);border:2px dashed rgba(232,223,202,.22);box-shadow:none;color:#8a8070;animation:none}
.ub-tag.empty::before{background:transparent;border:2px dashed rgba(232,223,202,.2);box-shadow:none}
.ub-tag.empty::after{display:none}
.ub-tag.empty .nm{font-family:var(--f-type);font-weight:normal;font-size:1.05em;letter-spacing:.06em;text-transform:none;color:#8a8070;text-shadow:none;animation:ub-hintp 2.4s ease-in-out infinite}
.ub-tag.empty .sub{color:#5d564b}

/* ---------- connecting ---------- */
.ub-conn{z-index:24;background:rgba(3,3,2,.84);display:grid;place-items:center}
.ub-conn .box{display:flex;flex-direction:column;align-items:center;text-align:center;max-width:90vw}
.ub-conn .radio{width:7em;height:7em;overflow:visible}
.ub-conn .radio .w{fill:none;stroke:#c9bca2;stroke-width:2.2;stroke-linecap:round;opacity:.15;animation:ub-wave 1.6s ease-out infinite}
.ub-conn .radio .w:nth-of-type(2){animation-delay:.2s}.ub-conn .radio .w:nth-of-type(3){animation-delay:.4s}
@keyframes ub-wave{0%{opacity:.1}25%{opacity:1;stroke:#e04a30}60%,100%{opacity:.12}}
.ub-conn .radio .m{fill:#c9bca2}
.ub-conn .t{margin-top:1.3em;font-family:var(--f-type);font-size:1.3em;color:var(--bone);letter-spacing:.04em}
.ub-conn .t::after{content:"";display:inline-block;width:1.3em;text-align:left;animation:ub-ell 1.6s steps(4) infinite}
.ub-conn .morse{margin-top:.8em;display:flex;gap:.35em;height:.4em;align-items:center}
.ub-conn .morse i{height:.32em;background:#a3120e;border-radius:.16em;opacity:.2;animation:ub-morse 2.4s steps(1) infinite}
@keyframes ub-morse{0%,8%{opacity:1}9%,100%{opacity:.18}}
.ub-conn .ub-items{margin-top:2.4em;padding-left:0;align-items:center}
.ub-conn .ub-items .ub-item{font-size:1.9em}

/* ---------- error telegram ---------- */
.ub-err{z-index:26;background:rgba(0,0,0,.72);display:grid;place-items:center}
.ub-err .tg{position:relative;width:min(36em,92vw);padding:1.5em 2.1em 1.4em;background:var(--tx-paper) center/420px,#d6c7a4;color:#1c1712;font-family:var(--f-type);
  box-shadow:0 1.2em 3em rgba(0,0,0,.8);transform:rotate(-1deg)}
.ub-err.on .tg{animation:ub-tg-in .5s cubic-bezier(.2,1.2,.3,1) both}
@keyframes ub-tg-in{0%{opacity:0;transform:translateY(2em) rotate(-4deg)}100%{opacity:1;transform:rotate(-1deg)}}
.ub-err .tg::before{content:"";position:absolute;inset:0;pointer-events:none;box-shadow:inset 0 0 4em rgba(90,60,20,.45)}
.ub-err .hd{display:flex;justify-content:space-between;font-size:.75em;letter-spacing:.22em;color:#5b4c3a;border-bottom:2px solid #2a221a;padding-bottom:.5em}
.ub-err .ttl{display:inline-block;margin:.9em 0 .7em;font-family:var(--f-stencil);font-weight:700;font-size:2.3em;letter-spacing:.1em;line-height:1.05;color:#a3160f;
  border:.12em solid #a3160f;padding:.12em .4em .04em;transform:rotate(-2.5deg);filter:url(#ub-distress)}
.ub-err .tx{font-size:1.08em;line-height:1.6;text-transform:uppercase;letter-spacing:.04em;min-height:3.2em}
.ub-err .tx .stop{color:#6a5a45}
.ub-err .ft{display:flex;justify-content:space-between;align-items:center;margin-top:1.1em;border-top:1px dashed rgba(60,45,30,.5);padding-top:.7em;font-size:.72em;letter-spacing:.2em;color:#6a5a45}
.ub-err .ok{font-family:var(--f-stencil);font-weight:700;font-size:1.9em;letter-spacing:.2em;color:#1c1712;padding:.1em .7em 0;border:2px solid #2a221a}
.ub-err .ok.is-sel{background:#2a221a;color:#efe4c8}

@media (max-width:900px){
  .ub-lobby .wrap{flex-direction:column;justify-content:center;align-items:stretch;gap:1.4em;overflow:auto;padding:4vh 0}
  .ub-lobby .colL,.ub-lobby .colR{flex:none;width:100%}
  .ub-lobby h2{font-size:2.8rem}
  .ub-lobby .lbl2{margin-top:.8em}
  .ub-tag{height:3.8em}
  .ub-sb .r{grid-template-columns:.5em minmax(5em,1fr) 4.5em 3em 3.8em;font-size:.9em}
  .ub-sb .r>:nth-child(6),.ub-sb .r>:nth-child(7),.ub-sb .r>:nth-child(8){display:none}
  .ub-sb .ub-stamp{display:none}
  .ub-feed{top:22%}
}
`;

const SLOT_COLORS = ['#e9e4d8', '#4f8fe6', '#e6c14f', '#5cc26b'];
const SLOT_CHAR = ['Pvt. Cole Harlan', 'Sgt. Alfie Marsh', 'Cpl. Yuri Volkov', 'Élodie Fournier'];
const slotColor = (s) => SLOT_COLORS[s] || SLOT_COLORS[0];
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const CODE_RE = new RegExp(`^[${CODE_ALPHABET}]{5}$`);
const MEDIC_SVG = '<svg class="ub-medic" viewBox="-10 -10 20 20"><path d="M-3-9h6v6h6v6h-6v6h-6v-6h-6v-6h6z" rx="1" fill="#e32a1c" stroke="#2a0000" stroke-width="1.2" stroke-linejoin="round"/></svg>';
function sanitizeName(s, trim = false) {
  let v = String(s || '').normalize('NFKC').replace(/[^\p{L}\p{N} _.'\-]/gu, '').replace(/\s+/g, ' ');
  if (trim) v = v.trim();
  return v.slice(0, 16);
}
function cleanCode(s) {
  const str = String(s || '');
  const m = /[?&#]join=([A-Za-z0-9]{5})/i.exec(str);
  const src = m ? m[1] : str;
  return src.toUpperCase().split('').filter((c) => CODE_ALPHABET.includes(c)).join('').slice(0, 5);
}
function pingQ(ms) {
  if (ms == null || !isFinite(ms)) return 0;
  return ms < 70 ? 4 : ms < 130 ? 3 : ms < 220 ? 2 : 1;
}
function barsHTML(ms) {
  const q = pingQ(ms);
  return `<span class="ub-bars q${q}">${[1, 2, 3, 4].map((k) => `<i class="${k <= q ? 'on' : ''}"></i>`).join('')}</span>`;
}
function reEsc(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

const DEFS = `
<svg class="ub-defs" aria-hidden="true" focusable="false"><defs>
  <filter id="ub-brush" x="-15%" y="-15%" width="130%" height="130%" color-interpolation-filters="sRGB">
    <feTurbulence type="fractalNoise" baseFrequency="0.045" numOctaves="2" seed="3" result="warp"/>
    <feDisplacementMap in="SourceGraphic" in2="warp" scale="6.5" xChannelSelector="R" yChannelSelector="G" result="disp"/>
    <feTurbulence type="fractalNoise" baseFrequency="0.55 0.045" numOctaves="2" seed="8" result="streak"/>
    <feColorMatrix in="streak" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 -3.4 2.55" result="streakA"/>
    <feComposite in="disp" in2="streakA" operator="in" result="dry"/>
    <feColorMatrix in="streak" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 2.2 -1.2" result="darkA"/>
    <feFlood flood-color="#2a0000" flood-opacity=".55"/>
    <feComposite in2="darkA" operator="in" result="darkS"/>
    <feComposite in="darkS" in2="dry" operator="in" result="darkIn"/>
    <feMerge><feMergeNode in="dry"/><feMergeNode in="darkIn"/></feMerge>
  </filter>
  <filter id="ub-distress" x="-5%" y="-10%" width="110%" height="120%">
    <feTurbulence type="fractalNoise" baseFrequency="0.55" numOctaves="3" seed="11" result="n"/>
    <feColorMatrix in="n" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 -4 2.95" result="holes"/>
    <feComposite in="SourceGraphic" in2="holes" operator="in" result="pitted"/>
    <feTurbulence type="fractalNoise" baseFrequency="0.035" numOctaves="2" seed="4" result="w"/>
    <feDisplacementMap in="pitted" in2="w" scale="3.5" xChannelSelector="R" yChannelSelector="G"/>
  </filter>
</defs></svg>`;

const FLAVOUR = [
  'Field log, Nov. 1944 — the dead at Blackwald do not stay buried.',
  'Board the windows. Every plank buys you a breath.',
  'Power to the generator vault was cut three weeks ago. Someone should fix that.',
  'The box in the command post hums at night. Nobody remembers who left it there.',
  'Aim for the head. Everything else just makes them angry.',
  'Radio operator’s last entry: “They are coming up through the clearing again.”',
  'Grenades are resupplied at the start of every round.',
  'The anvil in the vault takes steel and gives back something worse.',
];

const CONTROLS = [
  ['Move', ['W', 'A', 'S', 'D']], ['Sprint', ['Shift']], ['Jump', ['Space']], ['Crouch', ['C', '/', 'Ctrl']],
  ['Fire', ['Mouse 1']], ['Aim down sights', ['Mouse 2']], ['Reload', ['R']], ['Interact / Buy', ['F', ' hold']],
  ['Knife', ['V']], ['Grenade', ['G']], ['Swap weapon', ['1', '/', '2', '/', 'Q', '/', 'Wheel']], ['Pause', ['Esc']],
];

const SETTING_DEFS = [
  { key: 'sensitivity', name: 'Mouse sensitivity', min: 0.1, max: 3, step: 0.05, fmt: (v) => v.toFixed(2) },
  { key: 'fov', name: 'Field of view', min: 65, max: 100, step: 1, fmt: (v) => `${Math.round(v)}°` },
  { key: 'master', name: 'Master volume', min: 0, max: 1, step: 0.05, fmt: (v) => `${Math.round(v * 100)}%` },
  { key: 'music', name: 'Music volume', min: 0, max: 1, step: 0.05, fmt: (v) => `${Math.round(v * 100)}%` },
  { key: 'sfx', name: 'Effects volume', min: 0, max: 1, step: 0.05, fmt: (v) => `${Math.round(v * 100)}%` },
  { key: 'quality', name: 'Graphics quality', options: ['high', 'medium'] },
];
const SETTING_DEFAULTS = { sensitivity: 1, fov: 80, master: 0.8, music: 0.6, sfx: 0.9, quality: 'high' };

const NADE_SVG = '<svg viewBox="0 0 20 28"><rect x="7" y="1" width="6" height="5" rx="1" fill="#b9ab8a"/><path d="M13 3 h3 v5" fill="none" stroke="#b9ab8a" stroke-width="1.6"/><circle cx="15.5" cy="1.8" r="1.6" fill="none" stroke="#b9ab8a" stroke-width="1.2"/><ellipse cx="10" cy="16.5" rx="8" ry="10" fill="#7f8a5a"/><path d="M2.5 13 h15 M2.5 18 h15 M2.5 23 h14 M6.5 7.5 v18 M10 6.5 v20 M13.5 7.5 v18" stroke="rgba(0,0,0,.35)" stroke-width="1.2"/><ellipse cx="7" cy="12" rx="2" ry="3.5" fill="rgba(255,255,230,.25)"/></svg>';

// ============================================================== HUD
export class HUD {
  constructor(rootEl) {
    this.parent = rootEl || document.body;
    this.onUiSound = null;
    this._timers = new Set();
    this._round = 0;
    this._points = 0;
    this._health = 1;
    this._settings = { ...SETTING_DEFAULTS };
    this._ammoKey = '';
    this._perkKey = '';
    this._puKey = '';
    this._navs = {};
    // co-op state
    this._localSlot = null;
    this._known = new Map();      // name -> slot (for colouring names in feed text)
    this._team = new Map();       // id -> row element
    this._marks = new Map();      // id -> marker element
    this._chatActive = false;
    this.onChatSend = null;
    this._lobbyCb = {};
    this._name = '';
    this._injectHead();
    this._buildTextures();
    this._build();
    this._onKey = this._onKey.bind(this);
    window.addEventListener('keydown', this._onKey, true);
  }

  // ------------------------------------------------------------ setup
  _injectHead() {
    if (!document.getElementById('ub-hud-style')) {
      if (!document.querySelector(`link[href="${FONT_HREF}"]`)) {
        const pc = document.createElement('link'); pc.rel = 'preconnect'; pc.href = 'https://fonts.gstatic.com'; pc.crossOrigin = '';
        const l = document.createElement('link'); l.rel = 'stylesheet'; l.href = FONT_HREF;
        document.head.append(pc, l);
      }
      const st = document.createElement('style'); st.id = 'ub-hud-style'; st.textContent = CSS + CSS_COOP;
      document.head.appendChild(st);
    }
  }

  _buildTextures() {
    const tx = {};
    try {
      tx.noise = texNoise(192, 5);
      tx.paper = texPaper(7);
      tx.smear = texSmear('150,14,10', 3);
      tx.smearDark = texSmear('0,0,0', 9, 512, 80, true);
      tx.splat = [11, 23, 37, 51, 68].map((sd) => texSplatter(sd));
    } catch (e) { console.warn('[hud] texture generation failed', e); tx.splat = []; }
    this._tx = tx;
  }

  _build() {
    const R = this.root = h('div', 'ub-root');
    const tx = this._tx;
    const u = (d) => (d ? `url(${d})` : 'none');
    R.style.setProperty('--tx-noise', u(tx.noise));
    R.style.setProperty('--tx-paper', u(tx.paper));
    R.style.setProperty('--tx-smear', u(tx.smear));
    R.style.setProperty('--tx-smear-dark', u(tx.smearDark));
    R.insertAdjacentHTML('beforeend', DEFS);

    // ---- fx layer (under hud)
    const fx = this.fx = h('div', 'ub-fx off');
    this.elHurt = h('div', 'ub-hurt');
    this.elHurtSp = h('div', 'ub-hurt-sp');
    if (tx.splat.length) {
      [[0, 100, 0], [100, 0, 2], [100, 100, 4]].forEach(([x, y, i]) => {
        const b = h('b'); b.style.left = x + '%'; b.style.top = y + '%'; b.style.backgroundImage = `url(${tx.splat[i]})`;
        b.style.transform = `translate(-50%,-50%) rotate(${i * 67}deg)`; this.elHurtSp.appendChild(b);
      });
    }
    this.elDmg = h('div'); this.elDmg.style.cssText = 'position:absolute;inset:0';
    this.elFlash = h('div', 'ub-flash');
    this.elDowned = h('div', 'ub-downed');
    this.elDowned.innerHTML = `<div class="ub-bleed"><svg viewBox="-40 -40 80 80"><circle r="34" class="bg"/><circle r="34" class="ring" pathLength="1" stroke-dasharray="1 1"/></svg><div class="lbl">BLEEDING OUT</div><div class="sub">Hold on, soldier...</div></div>`;
    this.elRing = this.elDowned.querySelector('.ring');
    fx.append(this.elHurt, this.elHurtSp, this.elDmg, this.elFlash, this.elDowned);

    // ---- hud layer
    const hud = this.hud = h('div', 'ub-hud off');
    hud.append(h('div', 'ub-corner-shade l'), h('div', 'ub-corner-shade r'));
    const bl = h('div', 'ub-bl');
    this.elPerks = h('div', 'ub-perks');
    this.elRound = h('div', 'ub-round');
    bl.append(this.elPerks, this.elRound);

    const br = h('div', 'ub-br');
    const pw = h('div', 'ub-points-wrap');
    this.elPops = h('div', 'ub-pops');
    this.elPoints = h('div', 'ub-points', '0');
    this.elMedic = h('span', '', MEDIC_SVG).firstChild;
    pw.append(this.elMedic, this.elPops, this.elPoints);
    this.elPW = pw;
    this.elTeam = h('div', 'ub-team');
    const am = h('div', 'ub-ammo');
    this.elWName = h('div', 'ub-wname', '');
    const row = h('div', 'ub-ammo-row');
    this.elMag = h('span', 'ub-mag', '0'); this.elRes = h('span', 'ub-res', '0');
    row.append(this.elMag, h('span', 'ub-slash', '/'), this.elRes);
    this.elTicks = h('div', 'ub-ticks');
    this.elNades = h('div', 'ub-nades');
    am.append(this.elWName, row, this.elTicks, this.elNades);
    br.append(this.elTeam, pw, am);

    this.elPU = h('div', 'ub-pu');
    this.elCross = h('div', 'ub-cross');
    this.elCross.innerHTML = '<i class="v t"></i><i class="v b"></i><i class="hz l"></i><i class="hz r"></i><i class="dot"></i>';
    this._cl = [...this.elCross.querySelectorAll('i')];
    this.elHit = h('div', 'ub-hit', '<svg viewBox="-20 -20 40 40"><path d="M-6-6 L-14-14 M6-6 L14-14 M-6 6 L-14 14 M6 6 L14 14"/></svg>');
    this.elHint = h('div', 'ub-hint');
    this.elPrompt = h('div', 'ub-prompt');
    this.elBanner = h('div', 'ub-banner');
    this.elMsg = h('div', 'ub-msg');
    this._buildCoopHud();
    hud.append(this.elMarks, this.elSpec, bl, br, this.elPU, this.elCross, this.elHit, this.elHint, this.elRevive, this.elPrompt, this.elBanner, this.elMsg,
      this.elFeed, this.elChat, this.elNet, this.elSB);
    this.crosshair(0, true);

    // ---- screens
    this._buildLoading();
    this._buildMenu();
    this._buildPause();
    this._buildGameOver();
    this._buildSheets();
    this._buildCoopScreens();

    R.append(fx, hud, this.scrMenu, this.scrLobby, this.scrPause, this.scrGo, this.scrCoop, this.scrSettings, this.scrControls, this.scrConn, this.scrErr, this.scrLoading);
    this.parent.appendChild(R);
  }

  _sound(name) { try { this.onUiSound && this.onUiSound(name); } catch (e) { /* never throw */ } }
  _after(ms, fn) { const id = setTimeout(() => { this._timers.delete(id); fn(); }, ms); this._timers.add(id); return id; }

  // ------------------------------------------------------------ nav (keyboard + mouse)
  _makeNav(name, items, opts = {}) {
    const nav = { items, index: 0, ...opts };
    items.forEach((it) => {
      it.addEventListener('mouseenter', () => { const i = nav.items.indexOf(it); if (nav.enabled === false || i < 0) return; if (nav.index !== i) { this._sound('ui_hover'); } this._select(nav, i); });
      it.addEventListener('click', (e) => { const i = nav.items.indexOf(it); if (nav.enabled === false || i < 0) return; if (it._noClick) return; e.preventDefault(); this._select(nav, i); this._activate(nav); });
    });
    this._navs[name] = nav;
    return nav;
  }
  _select(nav, i, fromKey = false) {
    const n = nav.items.length; if (!n) return;
    nav.index = (i + n) % n;
    nav.items.forEach((it, k) => it.classList.toggle('is-sel', k === nav.index));
    if (nav.onSelect) nav.onSelect(nav.items[nav.index], nav.index, fromKey);
    const it = nav.items[nav.index];
    if (fromKey) {
      const ae = document.activeElement;
      if (it._input) it._input.focus({ preventScroll: true });
      else if (ae && ae.tagName === 'INPUT' && ae.type !== 'range' && this.root.contains(ae)) ae.blur();
    }
  }
  _activate(nav) {
    const it = nav.items[nav.index]; if (!it || it.classList.contains('dis')) return;
    this._sound('ui_click');
    it._act && it._act();
  }
  _currentNav() {
    const on = (el) => el && el.classList.contains('on');
    if (on(this.scrLoading)) return null;
    if (on(this.scrErr)) return this._navs.error;
    if (on(this.scrConn)) return this._navs.conn;
    if (on(this.scrSettings)) return this._navs.settings;
    if (on(this.scrControls)) return this._navs.controls;
    if (on(this.scrCoop)) return this._navs.coop;
    if (on(this.scrGo)) return this._navs.gameover;
    if (on(this.scrLobby)) return this._navs.lobby;
    if (on(this.scrPause)) return this._navs.pause;
    if (on(this.scrMenu)) return this._navs.menu;
    return null;
  }
  _onKey(e) {
    const nav = this._currentNav(); if (!nav) return;
    const k = e.key;
    const tg = e.target;
    if (tg && tg.tagName === 'INPUT' && tg.type !== 'range') {
      // typing into a text field: only navigation keys are ours
      if (k === 'ArrowUp' || k === 'ArrowDown' || k === 'Tab') {
        this._select(nav, nav.index + (k === 'ArrowUp' || (k === 'Tab' && e.shiftKey) ? -1 : 1), true); this._sound('ui_hover'); e.preventDefault();
      } else if (k === 'Enter') { this._activate(nav); e.preventDefault(); }
      else if (k === 'Escape' && nav.back) { tg.blur(); this._sound('ui_click'); nav.back(); e.preventDefault(); }
      return;
    }
    if (nav.onAnyKey && nav.onAnyKey(e)) { e.preventDefault(); return; }
    if (nav.enabled === false) return;
    const vert = nav.horizontal ? ['ArrowLeft', 'ArrowRight'] : ['ArrowUp', 'ArrowDown'];
    if (k === vert[0] || (!nav.horizontal && (k === 'w' || k === 'W'))) { this._select(nav, nav.index - 1, true); this._sound('ui_hover'); e.preventDefault(); }
    else if (k === vert[1] || (!nav.horizontal && (k === 's' || k === 'S'))) { this._select(nav, nav.index + 1, true); this._sound('ui_hover'); e.preventDefault(); }
    else if ((k === 'ArrowLeft' || k === 'ArrowRight' || k === 'a' || k === 'd' || k === 'A' || k === 'D') && nav.onLR) {
      nav.onLR(nav.items[nav.index], (k === 'ArrowLeft' || k === 'a' || k === 'A') ? -1 : 1); e.preventDefault();
    }
    else if (k === 'Enter' || k === ' ') { this._activate(nav); e.preventDefault(); }
    else if ((k === 'Escape' || k === 'Backspace') && nav.back) { this._sound('ui_click'); nav.back(); e.preventDefault(); }
  }
  _item(label, act, cls = 'ub-item') {
    const b = h('button', cls, `<span class="smear"></span><span class="lbl">${esc(label)}</span>`);
    b.type = 'button'; b.tabIndex = -1; b._act = act;
    return b;
  }

  // ------------------------------------------------------------ loading
  _buildLoading() {
    const L = this.scrLoading = h('div', 'ub-screen ub-loading');
    L.innerHTML = `<div class="ub-grain"></div><div class="ub-vig"></div>
      <div class="inner">
        <div class="ub-load-title">UNBURIED</div>
        <div class="ub-load-sub">BLACKWALD BUNKER</div>
        <div class="ub-fuse"><div class="rope"></div><div class="cov"></div><div class="burnt"></div><div class="spark">${
          Array.from({ length: 7 }, (_, i) => `<i style="--dx:${(Math.cos(i * 1.9) * 26 - 8).toFixed(0)}px;--dy:${(-10 - Math.abs(Math.sin(i * 2.3)) * 22).toFixed(0)}px;animation-delay:${(i * 0.1).toFixed(2)}s"></i>`).join('')}</div></div>
        <div class="ub-load-row"><span class="st">Loading...</span><span class="ub-load-pct">0%</span></div>
        <div class="ub-load-flav"></div>
      </div>`;
    this._ld = { burnt: L.querySelector('.burnt'), cov: L.querySelector('.cov'), spark: L.querySelector('.spark'),
      st: L.querySelector('.st'), pct: L.querySelector('.ub-load-pct'), flav: L.querySelector('.ub-load-flav') };
  }
  showLoading(progress = 0, text) {
    const p = clamp01(progress), L = this._ld;
    const pc = `${(p * 100).toFixed(1)}%`;
    L.burnt.style.width = pc; L.cov.style.width = pc; L.spark.style.left = pc;
    L.pct.textContent = `${Math.round(p * 100)}%`;
    if (text != null) L.st.textContent = text;
    if (!this.scrLoading.classList.contains('on')) {
      this.scrLoading.classList.add('on');
      let i = Math.floor(Math.random() * FLAVOUR.length);
      L.flav.textContent = FLAVOUR[i];
      clearInterval(this._flavInt);
      this._flavInt = setInterval(() => {
        L.flav.classList.add('fade');
        setTimeout(() => { i = (i + 1) % FLAVOUR.length; L.flav.textContent = FLAVOUR[i]; L.flav.classList.remove('fade'); }, 600);
      }, 4200);
    }
  }
  hideLoading() { this.scrLoading.classList.remove('on'); clearInterval(this._flavInt); }

  // ------------------------------------------------------------ main menu
  _buildMenu() {
    const M = this.scrMenu = h('div', 'ub-screen ub-menu');
    M.innerHTML = `<div class="shade"></div><div class="ub-grain"></div><div class="ub-vig"></div>
      <div class="panel">
        <div class="ub-kicker">A ROUND-BASED SURVIVAL</div>
        <h1 class="ub-title">UNBURIED</h1>
        <div class="ub-subtitle"><span class="rule"></span>BLACKWALD BUNKER<span class="rule"></span></div>
        <nav class="ub-items"></nav>
        <div class="ub-desc"></div>
        <div class="ub-foot"><span><span class="ub-key">↑</span><span class="ub-key">↓</span> Select</span><span><span class="ub-key">Enter</span> Confirm</span></div>
      </div>
      <div class="ub-ver">WINTER 1944 · BUILD 1.0</div>`;
    const list = M.querySelector('.ub-items'), desc = M.querySelector('.ub-desc');
    const defs = [
      ['Solo', 'Hold the bunker alone. Survive the night.', () => this._menuCb.onPlay && this._menuCb.onPlay()],
      ['Co-op', 'Up to four soldiers online. Host a room or join with a code.', () => this.showCoop()],
      ['Settings', 'Sensitivity, field of view, audio, graphics.', () => this._openSettingsFrom('menu')],
      ['Controls', 'Field manual: movement, weapons, equipment.', () => this.showControls()],
    ];
    const items = defs.map(([l, , a]) => this._item(l, a));
    items.forEach((b) => list.appendChild(b));
    this._coopItem = items[1];
    this._makeNav('menu', items, { onSelect: (_, i) => { desc.textContent = defs[i][1]; } });
    this._menuCb = {};
  }
  showMenu(cb = {}) {
    this._menuCb = cb || {};
    if (typeof this._menuCb.name === 'string' && this._menuCb.name) this._setName(this._menuCb.name, false);
    this._coopItem.classList.toggle('dis', !this._menuCb.onHost && !this._menuCb.onJoin);
    this.scrMenu.classList.add('on');
    this._select(this._navs.menu, 0);
  }
  hideMenu() { this.scrMenu.classList.remove('on'); this._closeSheets(); this.hideCoop(); }

  _openSettingsFrom(where) {
    const cb = where === 'pause' ? this._pauseCb : this._menuCb;
    if (cb && typeof cb.onSettings === 'function') cb.onSettings();
    else this.showSettings(this._settings, null, null);
  }

  // ------------------------------------------------------------ settings + controls sheets
  _buildSheets() {
    // settings
    const S = this.scrSettings = h('div', 'ub-screen ub-sheet');
    const paper = h('div', 'paper');
    paper.style.clipPath = tornPolygon(41, 1.1);
    paper.innerHTML = `<div class="ub-stamp">RESTRICTED</div><h2>SETTINGS</h2><div class="form"><span>FORM 7-B · FIELD CONFIG</span><span>BLACKWALD</span></div><div class="rows"></div>`;
    const rows = paper.querySelector('.rows');
    const items = [];
    this._setRows = {};
    for (const d of SETTING_DEFS) {
      const r = h('div', 'ub-row'); r.tabIndex = -1;
      r.innerHTML = `<span class="nm">${d.name}</span>`;
      if (d.options) {
        const seg = h('div', 'ub-seg');
        d.options.forEach((o) => {
          const b = h('button', '', o.toUpperCase()); b.type = 'button'; b.tabIndex = -1; b.dataset.v = o;
          b.addEventListener('click', (e) => { e.stopPropagation(); this._setVal(d.key, o, true); this._sound('ui_click'); });
          seg.appendChild(b);
        });
        r.appendChild(seg);
        r._set = (v) => seg.querySelectorAll('button').forEach((b) => b.classList.toggle('act', b.dataset.v === v));
        r._lr = (dir) => { const i = d.options.indexOf(this._settings[d.key]); const n = d.options[(i + dir + d.options.length) % d.options.length]; this._setVal(d.key, n, true); this._sound('ui_hover'); };
        r._act = () => r._lr(1);
      } else {
        const inp = h('input', 'ub-range'); inp.type = 'range'; inp.min = d.min; inp.max = d.max; inp.step = d.step; inp.tabIndex = -1;
        const val = h('span', 'val');
        inp.addEventListener('input', () => this._setVal(d.key, parseFloat(inp.value), true));
        r.append(inp, val);
        r._noClick = true;
        r._set = (v) => { inp.value = v; inp.style.setProperty('--p', `${((v - d.min) / (d.max - d.min)) * 100}%`); val.textContent = d.fmt(v); };
        r._lr = (dir) => { const v = Math.min(d.max, Math.max(d.min, +(this._settings[d.key] + dir * d.step * (d.key === 'fov' ? 1 : 1)).toFixed(4))); this._setVal(d.key, v, true); this._sound('ui_hover'); };
        r._act = () => {};
      }
      this._setRows[d.key] = r;
      rows.appendChild(r); items.push(r);
    }
    const back = h('button', 'back', 'BACK<span class="ub-key">Esc</span>'); back.type = 'button'; back.tabIndex = -1;
    back._act = () => this.hideSettings();
    paper.appendChild(back); items.push(back);
    S.appendChild(paper);
    S.addEventListener('mousedown', (e) => { if (e.target === S) { this._sound('ui_click'); this.hideSettings(); } });
    this._makeNav('settings', items, { back: () => this.hideSettings(), onLR: (it, dir) => it._lr && it._lr(dir) });

    // controls
    const C = this.scrControls = h('div', 'ub-screen ub-sheet');
    const p2 = h('div', 'paper');
    p2.style.clipPath = tornPolygon(77, 1.1);
    p2.innerHTML = `<div class="ub-stamp">FIELD MANUAL</div><h2>CONTROLS</h2><div class="form"><span>FM 44-12 · SECTION II</span><span>KEYBOARD / MOUSE</span></div>
      <div class="ub-ctl">${CONTROLS.map(([a, ks]) => `<div class="a">${a}</div><div class="k">${ks.map((k) => (k === '/' ? '<span class="or">/</span>' : k.startsWith(' ') ? `<span class="or">${k.trim()}</span>` : `<span class="ub-key">${k}</span>`)).join('')}</div>`).join('')}</div>`;
    const b2 = h('button', 'back', 'BACK<span class="ub-key">Esc</span>'); b2.type = 'button'; b2.tabIndex = -1;
    b2._act = () => this.hideControls();
    p2.appendChild(b2);
    C.appendChild(p2);
    C.addEventListener('mousedown', (e) => { if (e.target === C) { this._sound('ui_click'); this.hideControls(); } });
    this._makeNav('controls', [b2], { back: () => this.hideControls() });
  }
  _setVal(key, v, fire) {
    this._settings[key] = v;
    const r = this._setRows[key]; r && r._set(v);
    if (fire && this._setOnChange) { try { this._setOnChange({ ...this._settings }, key, v); } catch (e) { console.error(e); } }
  }
  showSettings(values, onChange, onClose) {
    this._settings = { ...SETTING_DEFAULTS, ...this._settings, ...(values || {}) };
    for (const d of SETTING_DEFS) this._setVal(d.key, this._settings[d.key], false);
    this._setOnChange = onChange || null;
    this._setOnClose = onClose || null;
    this.scrControls.classList.remove('on');
    this.scrSettings.classList.add('on');
    this._select(this._navs.settings, 0);
  }
  hideSettings() {
    if (!this.scrSettings.classList.contains('on')) return;
    this.scrSettings.classList.remove('on');
    const cb = this._setOnClose; this._setOnClose = null;
    if (cb) { try { cb({ ...this._settings }); } catch (e) { console.error(e); } }
  }
  showControls() { this.scrSettings.classList.remove('on'); this.scrControls.classList.add('on'); this._select(this._navs.controls, 0); }
  hideControls() { this.scrControls.classList.remove('on'); }
  _closeSheets() { this.hideSettings(); this.hideControls(); }

  // ------------------------------------------------------------ pause
  _buildPause() {
    const P = this.scrPause = h('div', 'ub-screen ub-pause');
    P.innerHTML = `<div class="ub-grain"></div><div class="ub-vig"></div><div class="panel"><div class="ub-kicker">OPERATION SUSPENDED</div><h2>PAUSED</h2><div class="info"></div><nav class="ub-items"></nav></div>`;
    const list = P.querySelector('.ub-items');
    this._pauseInfo = P.querySelector('.info');
    const items = [
      this._item('Resume', () => this._pauseCb.onResume && this._pauseCb.onResume()),
      this._item('Settings', () => this._openSettingsFrom('pause')),
      this._item('Controls', () => this.showControls()),
      this._item('Quit to menu', () => this._pauseCb.onQuit && this._pauseCb.onQuit()),
    ];
    items.forEach((b) => list.appendChild(b));
    this._makeNav('pause', items);
    this._pauseCb = {};
  }
  showPause(cb = {}) {
    this._pauseCb = cb || {};
    this.closeChat(); this.showScoreboard(null);
    this._pauseInfo.textContent = `ROUND ${this._round || 1}  ·  ${this._points} POINTS`;
    this.scrPause.classList.add('on');
    this._select(this._navs.pause, 0);
  }
  hidePause() { this.scrPause.classList.remove('on'); this._closeSheets(); }

  // ------------------------------------------------------------ game over
  _buildGameOver() {
    const G = this.scrGo = h('div', 'ub-screen ub-go');
    G.innerHTML = `<div class="ub-grain"></div><div class="ub-vig"></div><div class="inner"><div class="l1">YOU HAVE SURVIVED</div><div class="rn"></div><div class="l2">ROUNDS</div><div class="stats"></div><div class="btns"></div><div class="skip">PRESS ANY KEY</div></div>`;
    this._go = { l1: G.querySelector('.l1'), rn: G.querySelector('.rn'), l2: G.querySelector('.l2'), stats: G.querySelector('.stats'), btns: G.querySelector('.btns'), skip: G.querySelector('.skip') };
    const items = [
      this._item('Restart', () => this._goCb.onRestart && this._goCb.onRestart()),
      this._item('Main menu', () => this._goCb.onMenu && this._goCb.onMenu()),
    ];
    items.forEach((b) => this._go.btns.appendChild(b));
    const nav = this._makeNav('gameover', items, { horizontal: true });
    nav.onAnyKey = (e) => { if (nav.enabled === false) { this._goFinish(); return true; } return false; };
    G.addEventListener('mousedown', () => { if (nav.enabled === false) this._goFinish(); });
    this._goCb = {};
  }
  showGameOver(stats = {}, cb = {}) {
    this._goCb = cb || {};
    this._goClear();
    const g = this._go, n = Math.max(0, stats.round | 0);
    g.l1.classList.remove('in'); g.l2.classList.remove('in'); g.btns.classList.remove('in');
    g.l2.textContent = n === 1 ? 'ROUND' : 'ROUNDS';
    g.rn.innerHTML = '';
    g.skip.style.opacity = '1';
    const rows = [
      ['Rounds survived', String(n)], ['Kills', String(stats.kills ?? 0)], ['Headshots', String(stats.headshots ?? 0)],
      ['Points earned', String(stats.points ?? 0)], ['Times downed', String(stats.downs ?? 0)], ['Time survived', fmtTime(stats.timeSec)],
    ];
    g.stats.innerHTML = rows.map(() => '<div class="st"><span class="k"></span><span class="dots"></span><span class="v"></span></div>').join('');
    this._goRows = rows; this._goN = n;
    const nav = this._navs.gameover; nav.enabled = false; nav.items.forEach((it) => it.classList.remove('is-sel'));
    this.scrGo.classList.add('on');
    this._after(900, () => g.l1.classList.add('in'));
    this._after(2000, () => { g.rn.appendChild(roundArt(n, { animate: true, delay: 0, seed: n * 31 + 5 }).svg); });
    this._after(3400, () => g.l2.classList.add('in'));
    this._goTypeRows(4100);
  }
  _goTypeRows(start) {
    const els = [...this._go.stats.children];
    let t = start;
    this._goRows.forEach(([k, v], i) => {
      const el = els[i];
      this._after(t, () => this._type(el.querySelector('.k'), k.toUpperCase(), 26, () => { el.classList.add('full'); this._type(el.querySelector('.v'), v, 40); }));
      t += 360;
    });
    this._after(t + 700, () => this._goReady());
  }
  _goReady() {
    const g = this._go, nav = this._navs.gameover;
    g.btns.classList.add('in'); g.skip.style.opacity = '0';
    nav.enabled = true; this._select(nav, 0);
  }
  _goFinish() {          // skip the reveal
    this._goClear();
    const g = this._go;
    g.l1.classList.add('in'); g.l2.classList.add('in');
    if (!g.rn.firstChild) g.rn.appendChild(roundArt(this._goN, { animate: false, seed: this._goN * 31 + 5 }).svg);
    else g.rn.querySelectorAll('.ub-stroke,.ub-drip,.ub-bulb').forEach((p) => p.classList.add('ub-inst'));
    [...g.stats.children].forEach((el, i) => { el.querySelector('.k').textContent = this._goRows[i][0].toUpperCase(); el.querySelector('.v').textContent = this._goRows[i][1]; el.classList.add('full'); });
    this._goReady();
  }
  _goClear() { for (const id of this._timers) clearTimeout(id); this._timers.clear(); }
  hideGameOver() { this._goClear(); this.scrGo.classList.remove('on'); }

  _type(el, text, cps = 30, done) {
    el.textContent = ''; let i = 0;
    const step = () => { i++; el.textContent = text.slice(0, i); if (i < text.length) this._after(1000 / cps, step); else done && done(); };
    if (text.length) this._after(1000 / cps, step); else done && done();
  }

  // ------------------------------------------------------------ in-game HUD
  setVisible(v) { this.hud.classList.toggle('off', !v); this.fx.classList.toggle('off', !v); }

  setRound(n, animate = false) {
    n = Math.max(0, n | 0);
    const prev = this._round; this._round = n;
    const box = this.elRound;
    box.querySelectorAll('.ub-paint.out').forEach((e) => e.remove());
    const curs = [...box.querySelectorAll('.ub-paint')];
    if (!animate || !curs.length || n === prev) {
      box.innerHTML = '';
      if (n > 0) box.appendChild(roundArt(n, { animate }).svg);
      return;
    }
    if (prev >= 1 && prev <= 4 && n === prev + 1) {
      // tally: existing strokes throb white/red, then the new stroke is painted over them
      curs.forEach((c) => { c.classList.remove('throb'); void c.getBoundingClientRect(); c.classList.add('throb'); });
      box.appendChild(roundArt(n, { animate: true, delay: 2.0, from: prev, strokeTime: 0.55 }).svg);
      return;
    }
    curs.forEach((c) => c.classList.add('out'));
    box.appendChild(roundArt(n, { animate: true, delay: 2.1 }).svg);
    setTimeout(() => curs.forEach((c) => c.remove()), 3000);
  }

  setPoints(total) {
    total = Math.round(total || 0);
    if (total === this._points) return;
    this._points = total;
    this.elPoints.textContent = String(total);
    this.elPoints.classList.remove('bump'); void this.elPoints.offsetWidth; this.elPoints.classList.add('bump');
  }

  pointsPopup(delta) {
    delta = Math.round(delta || 0); if (!delta) return;
    const el = h('div', 'ub-pop' + (delta < 0 ? ' neg' : ''), (delta > 0 ? '+' : '−') + Math.abs(delta));
    this.elPops.appendChild(el);
    while (this.elPops.childElementCount > 14) this.elPops.firstChild.remove();
    const neg = delta < 0;
    const dx = -(70 + Math.random() * 90) * (neg ? 0.55 : 1);
    const dy = neg ? 30 + Math.random() * 25 : -(10 + Math.random() * 70) * (Math.random() < 0.2 ? -0.6 : 1);
    const cx = dx * (0.3 + Math.random() * 0.3), cy = dy - 25 - Math.random() * 35;
    const frames = [];
    const N = 9;
    for (let i = 0; i <= N; i++) {
      const t = i / N, u = 1 - t;
      const x = 2 * u * t * cx + t * t * dx, y = 2 * u * t * cy + t * t * dy;
      const sc = i === 0 ? 0.5 : i === 1 ? 1.2 : 1 - t * 0.25;
      frames.push({ transform: `translate(calc(-50% + ${x.toFixed(1)}px), calc(-50% + ${y.toFixed(1)}px)) scale(${sc.toFixed(2)})`, opacity: i === 0 ? 0 : t < 0.55 ? 1 : 1 - (t - 0.55) / 0.45, offset: t });
    }
    const a = el.animate(frames, { duration: 950 + Math.random() * 350, easing: 'cubic-bezier(.25,.6,.4,1)', fill: 'forwards' });
    a.onfinish = () => el.remove();
  }

  setAmmo(a = {}) {
    const key = `${a.name}|${a.mag}|${a.reserve}|${a.magSize}|${a.upgraded}|${a.grenades}|${a.reloading}`;
    if (key === this._ammoKey) return; this._ammoKey = key;
    const mag = a.mag | 0, res = a.reserve | 0, ms = Math.max(1, a.magSize | 0);
    this.elWName.textContent = a.name || '';
    this.elWName.classList.toggle('up', !!a.upgraded);
    this.elMag.textContent = String(mag); this.elRes.textContent = String(res);
    const low = mag > 0 && mag <= Math.max(1, Math.ceil(ms * 0.25));
    this.elMag.classList.toggle('low', low);
    this.elMag.classList.toggle('empty', mag === 0);
    this.elRes.classList.toggle('zero', res === 0);
    // magazine ticks
    if (this._tickMs !== ms) {
      this._tickMs = ms;
      this.elTicks.innerHTML = '';
      this.elTicks.className = 'ub-ticks' + (ms > 40 ? ' bar' : '');
      if (ms > 40) this.elTicks.appendChild(h('b'));
      else for (let i = 0; i < ms; i++) this.elTicks.appendChild(h('i'));
    }
    if (ms > 40) this.elTicks.firstChild.style.width = `${(mag / ms) * 100}%`;
    else [...this.elTicks.children].forEach((t, i) => t.classList.toggle('gone', i >= mag));
    // grenades
    const g = Math.max(0, a.grenades | 0), slots = Math.max(4, g);
    if (this.elNades.childElementCount !== slots) {
      this.elNades.innerHTML = '';
      for (let i = 0; i < slots; i++) this.elNades.appendChild(h('div', 'ub-nade', NADE_SVG));
    }
    [...this.elNades.children].forEach((n, i) => n.classList.toggle('empty', i >= g));
    // centre hint
    let hint = '';
    if (!a.reloading) {
      if (mag === 0 && res === 0) hint = 'NO AMMO';
      else if (mag === 0 || (low && res > 0)) hint = 'RELOAD';
    }
    this._setHint(hint);
  }
  _setHint(t) {
    if (t === this._hint) return; this._hint = t;
    if (t) this.elHint.textContent = t;
    this.elHint.classList.toggle('on', !!t);
    this.elHint.classList.toggle('red', t === 'NO AMMO');
  }

  setPerks(list = []) {
    const key = list.map((p) => p.id + colorStr(p.color)).join(',');
    if (key === this._perkKey) return; this._perkKey = key;
    const had = new Set([...this.elPerks.children].map((e) => e.dataset.id));
    this.elPerks.innerHTML = '';
    list.forEach((p, i) => {
      const c = colorStr(p.color, '#8a2a2a');
      const el = h('div', 'ub-perk'); el.dataset.id = p.id; el.title = p.name || p.id;
      if (had.has(p.id)) el.style.animation = 'none';
      const gid = `ubcap-${p.id}-${i}`;
      let teeth = '';
      const T = 21;
      for (let k = 0; k < T * 2; k++) {
        const a = (k / (T * 2)) * Math.PI * 2, rr = k % 2 ? 17.4 : 19.4;
        teeth += `${k ? 'L' : 'M'}${(Math.cos(a) * rr).toFixed(2)} ${(Math.sin(a) * rr).toFixed(2)}`;
      }
      el.innerHTML = `<svg viewBox="-21 -21 42 42"><defs><radialGradient id="${gid}" cx="35%" cy="30%" r="80%"><stop offset="0" stop-color="${shade(c, 0.35)}"/><stop offset=".55" stop-color="${c}"/><stop offset="1" stop-color="${shade(c, -0.55)}"/></radialGradient>
        <linearGradient id="${gid}r" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#e9e2d0"/><stop offset=".5" stop-color="#8d8778"/><stop offset="1" stop-color="#3a372f"/></linearGradient></defs>
        <path d="${teeth}Z" fill="url(#${gid}r)" stroke="rgba(0,0,0,.6)" stroke-width=".6" stroke-linejoin="round"/>
        <circle r="16" fill="url(#${gid})" stroke="rgba(0,0,0,.45)" stroke-width="1"/>
        <circle r="13.6" fill="none" stroke="rgba(255,245,220,.35)" stroke-width=".9" stroke-dasharray="1.6 1.4"/>
        <g transform="scale(.82)">${PERK_GLYPH[p.id] || `<text x="0" y="6" text-anchor="middle" font-size="16" font-weight="700" fill="#f4ead3">${esc((p.name || p.id || '?')[0].toUpperCase())}</text>`}</g>
        <ellipse cx="-6" cy="-9" rx="7" ry="3.4" fill="rgba(255,255,255,.22)" transform="rotate(-30 -6 -9)"/></svg>`;
      this.elPerks.appendChild(el);
    });
  }

  setPowerups(list = []) {
    const key = list.map((p) => p.type).join(',');
    if (key !== this._puKey) {
      this._puKey = key;
      const had = new Set([...this.elPU.children].map((e) => e.dataset.type));
      this.elPU.innerHTML = '';
      list.forEach((p) => {
        const el = h('div', 'ub-pu-i'); el.dataset.type = p.type;
        if (had.has(p.type)) el.style.animation = 'none';
        el.innerHTML = `<div class="ub-pu-ic"><svg viewBox="-20 -20 40 40">${POWERUP_GLYPH[p.type] || '<text x="0" y="7" text-anchor="middle" class="t">?</text>'}</svg></div><div class="ub-pu-t"></div>`;
        this.elPU.appendChild(el);
      });
    }
    [...this.elPU.children].forEach((el, i) => {
      const rem = Math.max(0, list[i].remaining || 0);
      const t = String(Math.ceil(rem));
      const tEl = el.lastChild; if (tEl.textContent !== t) tEl.textContent = t;
      el.classList.toggle('blink', rem < 5); el.classList.toggle('fast', rem < 2);
    });
  }

  banner(text, sub) {
    const b = this.elBanner;
    b.innerHTML = `<div class="ink"></div><div class="t">${esc(text || '')}</div>${sub ? `<div class="sb">${esc(sub)}</div>` : ''}`;
    b.classList.remove('go'); void b.offsetWidth; b.classList.add('go');
  }

  prompt(text) {
    if (text === this._promptText) return; this._promptText = text;
    if (!text) { this.elPrompt.classList.remove('on'); return; }
    let html = esc(text)
      .replace(/\[(?:Cost|COST):\s*([^\]]+)\]/g, '<span class="cost">[Cost: $1]</span>')
      .replace(/\[([A-Za-z0-9]{1,6})\]/g, '<span class="ub-key">$1</span>');
    this.elPrompt.innerHTML = html;
    this.elPrompt.classList.add('on');
  }

  hitmarker(kind = 'hit') {
    const e = this.elHit;
    e.classList.remove('pop', 'kill', 'head');
    void e.offsetWidth;
    if (kind === 'kill') e.classList.add('kill');
    if (kind === 'head') e.classList.add('kill', 'head');
    e.classList.add('pop');
  }

  crosshair(spread = 0, visible = true) {
    const gap = (0.35 + clamp01(spread) * 2.6).toFixed(3);
    const key = gap + visible;
    if (key === this._crossKey) return; this._crossKey = key;
    this.elCross.classList.toggle('off', !visible);
    const [t, b, l, r] = this._cl;
    t.style.transform = `translateY(calc(-100% - ${gap}em))`;
    b.style.transform = `translateY(${gap}em)`;
    l.style.transform = `translateX(calc(-100% - ${gap}em))`;
    r.style.transform = `translateX(${gap}em)`;
  }

  damage(amount = 0.3) {
    amount = clamp01(amount);
    const sp = this._tx.splat; if (!sp.length) return;
    const lowH = 1 - this._health;
    const count = amount > 0.5 ? 2 : 1;
    for (let c = 0; c < count; c++) {
      const el = h('div', 'ub-splat');
      el.style.backgroundImage = `url(${sp[(Math.random() * sp.length) | 0]})`;
      // pick an edge point
      const side = (Math.random() * 4) | 0, t = 0.1 + Math.random() * 0.8;
      const [x, y] = side === 0 ? [t * 100, -2] : side === 1 ? [102, t * 100] : side === 2 ? [t * 100, 102] : [-2, t * 100];
      const size = (38 + Math.random() * 22) * (0.7 + amount * 0.5 + lowH * 0.45);
      el.style.cssText += `left:${x}%;top:${y}%;width:${size}vmin;height:${size}vmin`;
      this.elDmg.appendChild(el);
      const rot = Math.random() * 360, op = Math.min(1, 0.5 + amount * 0.5 + lowH * 0.25);
      const hold = 500 + lowH * 900;
      const dur = hold + 2200;
      const a = el.animate([
        { opacity: 0, transform: `translate(-50%,-50%) rotate(${rot}deg) scale(.7)` },
        { opacity: op, transform: `translate(-50%,-50%) rotate(${rot}deg) scale(1)`, offset: 80 / dur },
        { opacity: op, transform: `translate(-50%,-50%) rotate(${rot}deg) scale(1.02)`, offset: hold / dur },
        { opacity: 0, transform: `translate(-50%,-50%) rotate(${rot}deg) scale(1.06)` },
      ], { duration: dur, easing: 'ease-out', fill: 'forwards' });
      a.onfinish = () => el.remove();
    }
    while (this.elDmg.childElementCount > 12) this.elDmg.firstChild.remove();
    this.elFlash.animate([{ opacity: 0.35 + amount * 0.65 }, { opacity: 0 }], { duration: 450, easing: 'ease-out' });
  }

  setHealth(frac) {
    frac = clamp01(frac ?? 1);
    if (Math.abs(frac - this._health) < 0.005 && this._healthSet) return;
    this._healthSet = true; this._health = frac;
    const d = 1 - frac;
    this.elHurt.style.opacity = (Math.pow(d, 1.25) * 0.95).toFixed(3);
    this.elHurtSp.style.opacity = (Math.max(0, (d - 0.35) / 0.65) * 0.85).toFixed(3);
  }

  setDowned(on, progress = 0) {
    this.elDowned.classList.toggle('on', !!on);
    if (on) this.elRing.style.strokeDashoffset = String(clamp01(progress));
  }

  message(text, seconds = 3) {
    const m = this.elMsg;
    clearTimeout(this._msgHide); clearTimeout(this._msgType);
    m.classList.remove('done');
    m.innerHTML = '<span class="tag">NOTICE</span><span class="tx"></span>';
    const tx = m.lastChild; const str = String(text || '');
    m.classList.add('on');
    let i = 0;
    const step = () => { i++; tx.textContent = str.slice(0, i); if (i < str.length) this._msgType = setTimeout(step, 28); else m.classList.add('done'); };
    this._msgType = setTimeout(step, 120);
    this._msgHide = setTimeout(() => m.classList.remove('on'), Math.max(1, seconds) * 1000 + str.length * 28);
  }

  // ============================================================ CO-OP (phase 2)
  _learn(name, slot) { if (name && slot != null && slot >= 0) this._known.set(String(name), slot | 0); }

  _buildCoopHud() {
    this.elMarks = h('div', 'ub-marks');
    this.elSpec = h('div', 'ub-spec', '<div class="box"><div class="a"></div><div class="b">You will respawn next round</div></div>');
    this.elRevive = h('div', 'ub-revive', `<div class="t">${MEDIC_SVG}<span></span></div><div class="bar"><div class="fill"></div></div>`);
    this.elRevive.querySelector('.ub-medic').style.display = 'block';
    this.elFeed = h('div', 'ub-feed');
    this.elChat = h('div', 'ub-chat');
    this.elChatLog = h('div'); this.elChatLog.style.cssText = 'display:flex;flex-direction:column;gap:.18em';
    const cin = h('div', 'ub-chatin', '<span class="lb">SAY</span><input type="text" maxlength="120" autocomplete="off" spellcheck="false"><span class="ct">ENTER send · ESC cancel</span>');
    this.elChatIn = cin.querySelector('input');
    this.elChat.append(this.elChatLog, cin);
    this.elChatIn.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Enter') {
        e.preventDefault();
        const txt = this.elChatIn.value.replace(/\s+/g, ' ').trim().slice(0, 120);
        this.closeChat();
        if (txt && this.onChatSend) { try { this.onChatSend(txt); } catch (err) { console.error(err); } }
      } else if (e.key === 'Escape') { e.preventDefault(); this.closeChat(); }
    });
    this.elChatIn.addEventListener('keyup', (e) => e.stopPropagation());
    this.elChatIn.addEventListener('blur', () => { if (this._chatActive) setTimeout(() => { if (this._chatActive && document.activeElement !== this.elChatIn) this.closeChat(); }, 60); });
    this.elNet = h('div', 'ub-net', '<svg viewBox="-10 -10 20 20" class="ic"><path d="M0 8 V-2 M-3 8 H3"/><circle cx="0" cy="-3" r="1.4" fill="currentColor"/><path d="M-4.5-6.5 A6 6 0 0 0 -4.5 .5 M4.5-6.5 A6 6 0 0 1 4.5 .5"/></svg><span class="bw"></span><span class="tx"></span><span class="wt">UNSTABLE</span>');
    this.elSB = h('div', 'ub-sb');
  }

  _buildCoopScreens() {
    // ---------------- co-op sheet (menu -> CO-OP)
    const C = this.scrCoop = h('div', 'ub-screen ub-sheet ub-coop');
    const paper = h('div', 'paper');
    paper.style.clipPath = tornPolygon(113, 1.1);
    paper.innerHTML = `<div class="ub-stamp">SQUAD ORDERS</div><h2>CO-OP</h2><div class="form"><span>FORM 12-C · UP TO 4 SOLDIERS</span><span>ONLINE</span></div>`;
    // name
    const nameRow = h('label', 'ub-fld', '<span class="lb">YOUR CALLSIGN</span><input class="ub-name" type="text" maxlength="16" placeholder="Soldier" autocomplete="off" spellcheck="false"><span class="cnt">0/16</span>');
    const nameIn = this.elNameIn = nameRow.querySelector('input'); const cnt = nameRow.querySelector('.cnt');
    nameRow._input = nameIn; nameRow._noClick = true;
    nameIn.addEventListener('input', () => { const v = sanitizeName(nameIn.value); if (v !== nameIn.value) nameIn.value = v; cnt.textContent = `${v.length}/16`; });
    nameIn.addEventListener('change', () => this._commitName());
    nameIn.addEventListener('blur', () => this._commitName());
    this._nameCnt = cnt;
    nameRow._act = () => { this._commitName(); this._select(this._navs.coop, 1, true); };
    // host
    const host = h('button', 'ub-big', '<span class="l">HOST GAME</span><span class="d">Open a room and invite your squad</span>');
    host.type = 'button'; host.tabIndex = -1;
    host._act = () => { const n = this._commitName(); this._menuCb.onHost && this._menuCb.onHost(n); };
    const or = h('div', 'ub-or', 'OR JOIN A SQUAD');
    // join
    const joinRow = h('div', 'ub-fld', `<span class="lb">ROOM CODE</span><div class="ub-joinrow"><div class="ub-cells">${'<span></span>'.repeat(5)}<input type="text" maxlength="40" autocomplete="off" autocapitalize="characters" spellcheck="false" aria-label="Room code"></div><button type="button" class="ub-jbtn" tabindex="-1">JOIN →</button></div><div class="note"></div>`);
    const codeIn = this.elCodeIn = joinRow.querySelector('input');
    const cells = [...joinRow.querySelectorAll('.ub-cells span')];
    const cellsBox = joinRow.querySelector('.ub-cells');
    const jbtn = joinRow.querySelector('.ub-jbtn');
    const note = joinRow.querySelector('.note');
    joinRow._input = codeIn; joinRow._noClick = true;
    const paint = () => {
      const v = codeIn.value; const foc = document.activeElement === codeIn;
      cells.forEach((c, i) => { c.textContent = v[i] || ''; c.classList.toggle('cur', foc && i === v.length); });
      jbtn.classList.toggle('ready', v.length === 5);
    };
    codeIn.addEventListener('input', () => { const v = cleanCode(codeIn.value); if (v !== codeIn.value) codeIn.value = v; note.textContent = ''; paint(); });
    codeIn.addEventListener('paste', (e) => {
      const txt = (e.clipboardData || window.clipboardData)?.getData('text'); if (txt == null) return;
      e.preventDefault(); codeIn.value = cleanCode(txt); note.textContent = ''; paint();
      if (codeIn.value.length === 5) this._sound('ui_hover');
    });
    codeIn.addEventListener('focus', paint); codeIn.addEventListener('blur', paint);
    const tryJoin = () => {
      const code = codeIn.value;
      if (!CODE_RE.test(code)) {
        note.textContent = code.length ? `Room codes are 5 characters — ${5 - code.length} more to go.` : 'Type the 5-character room code from your host.';
        cellsBox.classList.remove('bad'); void cellsBox.offsetWidth; cellsBox.classList.add('bad');
        codeIn.focus({ preventScroll: true });
        return;
      }
      const n = this._commitName();
      this._menuCb.onJoin && this._menuCb.onJoin(code, n);
    };
    joinRow._act = tryJoin;
    jbtn.addEventListener('click', (e) => { e.preventDefault(); this._sound('ui_click'); tryJoin(); });
    this._codePaint = paint; this._codeNote = note;
    const hint = h('div', 'hint', '<b>Got an invite link?</b> Just open it — invite links drop you straight into the squad’s lobby.');
    const back = h('button', 'back', 'BACK<span class="ub-key">Esc</span>'); back.type = 'button'; back.tabIndex = -1;
    back._act = () => this.hideCoop();
    paper.append(nameRow, host, or, joinRow, hint, back);
    C.appendChild(paper);
    C.addEventListener('mousedown', (e) => { if (e.target === C) { this._sound('ui_click'); this.hideCoop(); } });
    this._makeNav('coop', [nameRow, host, joinRow, back], { back: () => this.hideCoop() });

    // ---------------- lobby
    const L = this.scrLobby = h('div', 'ub-screen ub-lobby');
    L.innerHTML = `<div class="shade"></div><div class="ub-grain"></div><div class="ub-vig"></div>
      <div class="wrap">
        <div class="colL">
          <div class="ub-kicker">CO-OP · SQUAD ASSEMBLY</div>
          <h2>LOBBY</h2>
          <div class="lbl2">ROOM CODE</div>
          <div class="ub-code"></div>
          <div class="ub-url"></div>
          <div class="acts"></div>
          <div class="ub-wait">Waiting for host to start</div>
          <div class="ub-items"></div>
          <div class="ub-lstatus"><i></i><span></span></div>
        </div>
        <div class="colR">
          <div class="ub-roster-h"><span>THE SQUAD</span><span class="cnt">0 / 4</span></div>
          <div class="ub-tags"></div>
        </div>
      </div>`;
    this._lb = { code: L.querySelector('.ub-code'), url: L.querySelector('.ub-url'), acts: L.querySelector('.acts'), wait: L.querySelector('.ub-wait'),
      items: L.querySelector('.ub-items'), status: L.querySelector('.ub-lstatus span'), tags: L.querySelector('.ub-tags'), cnt: L.querySelector('.ub-roster-h .cnt') };
    const copy = this._lbCopy = h('button', 'ub-copy', '<svg viewBox="0 0 24 24"><path d="M10 14a4 4 0 0 0 5.7 0l3.5-3.5a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3.5 3.5a4 4 0 0 0 5.7 5.7l1-1"/></svg><span>COPY INVITE LINK</span>');
    copy.type = 'button'; copy.tabIndex = -1;
    copy._act = () => this._copyInvite();
    this._lb.acts.appendChild(copy);
    this._lbStart = this._item('Start', () => this._lobbyCb.onStart && this._lobbyCb.onStart());
    this._lbLeave = this._item('Leave', () => this._lobbyCb.onLeave && this._lobbyCb.onLeave());
    this._lb.items.append(this._lbStart, this._lbLeave);
    this._lbNavAll = [copy, this._lbStart, this._lbLeave];
    this._makeNav('lobby', this._lbNavAll.slice());
    this._lb.tags.innerHTML = [0, 1, 2, 3].map(() => '<div class="ub-tag empty"></div>').join('');

    // ---------------- connecting
    const K = this.scrConn = h('div', 'ub-screen ub-conn');
    K.innerHTML = `<div class="ub-grain"></div><div class="box">
      <svg class="radio" viewBox="-40 -40 80 80"><path class="w" d="M-12-18 A22 22 0 0 0 -12 18 M12-18 A22 22 0 0 1 12 18"/><path class="w" d="M-20-27 A34 34 0 0 0 -20 27 M20-27 A34 34 0 0 1 20 27"/><path class="w" d="M-28-35 A46 46 0 0 0 -28 35 M28-35 A46 46 0 0 1 28 35"/>
        <circle class="m" r="5"/><path class="m" d="M-3 4 L-8 30 H8 L3 4Z"/></svg>
      <div class="t"></div>
      <div class="morse">${[1, 0, 1, 1, 0, 0, 1, 1, 1, 0, 1, 0].map((d, i) => `<i style="width:${d ? 1.3 : 0.35}em;animation-delay:${(i * 0.2).toFixed(1)}s"></i>`).join('')}</div>
      <div class="ub-items"></div></div>`;
    this._connT = K.querySelector('.t');
    const cancel = this._item('Cancel', () => { const cb = this._connCb.onCancel; this.hideConnecting(); cb && cb(); });
    K.querySelector('.ub-items').appendChild(cancel);
    this._makeNav('conn', [cancel], { back: () => cancel._act() });
    this._connCb = {};

    // ---------------- error telegram
    const E = this.scrErr = h('div', 'ub-screen ub-err');
    E.innerHTML = `<div class="tg"><div class="hd"><span>SIGNAL CORPS · PRIORITY MESSAGE</span><span class="no"></span></div>
      <div class="ttl"></div><div class="tx"></div>
      <div class="ft"><span>BLACKWALD RELAY STATION</span><button type="button" class="ok" tabindex="-1">OK</button></div></div>`;
    this._err = { ttl: E.querySelector('.ttl'), tx: E.querySelector('.tx'), no: E.querySelector('.no') };
    const ok = E.querySelector('.ok');
    ok._act = () => { const cb = this._errCb.onOk; this.hideError(); cb && cb(); };
    this._makeNav('error', [ok], { back: () => ok._act() });
    this._errCb = {};
  }

  // ---------------- co-op sheet
  _setName(n, fire) {
    const v = sanitizeName(n, true);
    this._name = v;
    if (this.elNameIn) { this.elNameIn.value = v; this._nameCnt.textContent = `${v.length}/16`; }
    if (fire && this._menuCb.onName) { try { this._menuCb.onName(v); } catch (e) { console.error(e); } }
    return v;
  }
  _commitName() {
    let v = sanitizeName(this.elNameIn.value, true);
    if (!v) v = this._name || 'Soldier';
    if (v !== this._lastFiredName) { this._lastFiredName = v; return this._setName(v, true); }
    return this._setName(v, false);
  }
  showCoop() {
    this.scrSettings.classList.remove('on'); this.scrControls.classList.remove('on');
    this._lastFiredName = this._name;
    this._codeNote.textContent = '';
    this._codePaint();
    this.scrCoop.classList.add('on');
    this._select(this._navs.coop, this._name ? 2 : 0, true);
  }
  hideCoop() {
    if (!this.scrCoop.classList.contains('on')) return;
    if (this.root.contains(document.activeElement)) document.activeElement.blur();
    this.scrCoop.classList.remove('on');
  }
  /** Pre-fill the join code (e.g. from an invite link that failed). */
  setJoinCode(code) { this.elCodeIn.value = cleanCode(code); this._codePaint(); }

  // ---------------- lobby
  showLobby(lobby = {}, cb = {}) {
    this._lobbyCb = cb || {};
    this.hideCoop();
    this._lobbyCode = null; this._lobbyHost = null; this._lobbyKey = null;
    this._lbCopy.classList.remove('done', 'fail'); this._lbCopy.lastChild.textContent = 'COPY INVITE LINK';
    this.updateLobby(lobby);
    this.scrLobby.classList.add('on');
    this._select(this._navs.lobby, lobby.isHost ? 1 : 0);
  }
  updateLobby(lobby = {}) {
    const L = this._lb;
    const code = String(lobby.code || '-----').toUpperCase();
    if (code !== this._lobbyCode) {
      this._lobbyCode = code;
      const r = rng(code.charCodeAt(0) * 7 + code.length);
      L.code.innerHTML = [...code].map((c, i) => `<span style="--r:${((r() - 0.5) * 5).toFixed(1)}deg;animation-delay:${(i * 0.07).toFixed(2)}s">${esc(c)}</span>`).join('') + '<div class="ub-stamp">INVITE</div>';
    }
    L.url.textContent = lobby.inviteUrl || '';
    const isHost = !!lobby.isHost;
    if (isHost !== this._lobbyHost) {
      this._lobbyHost = isHost;
      this._lbStart.style.display = isHost ? '' : 'none';
      L.wait.style.display = isHost ? 'none' : '';
      const nav = this._navs.lobby;
      nav.items = isHost ? this._lbNavAll.slice() : [this._lbCopy, this._lbLeave];
      this._lbStart.classList.remove('is-sel');
      this._select(nav, Math.min(nav.index, nav.items.length - 1));
    }
    const players = (lobby.players || []).slice(0, 4);
    const bySlot = [null, null, null, null];
    players.forEach((p, i) => { let s = p.slot != null ? p.slot | 0 : i; if (s < 0 || s > 3 || bySlot[s]) s = bySlot.indexOf(null); if (s >= 0) bySlot[s] = p; this._learn(p.name, s); });
    const tags = [...L.tags.children];
    bySlot.forEach((p, s) => {
      const el = tags[s];
      const key = p ? `${p.id}|${p.name}|${p.isHost}|${p.isLocal}|${pingQ(p.ping)}|${p.ping == null ? '' : Math.round(p.ping / 5)}` : 'empty';
      if (el.dataset.key === key) return;
      const wasEmpty = el.dataset.key === 'empty' || !el.dataset.key;
      el.dataset.key = key;
      if (!p) {
        el.className = 'ub-tag empty'; el.style.removeProperty('--c');
        el.innerHTML = `<div class="who"><div class="nm">Awaiting soldier…</div><div class="sub">SLOT ${s + 1} · OPEN</div></div>`;
        return;
      }
      el.className = 'ub-tag';
      if (!wasEmpty) el.style.animation = 'none'; else el.style.animation = '';
      el.style.setProperty('--c', slotColor(s));
      const ping = (p.isHost || p.isLocal) && p.ping == null ? '' : `${barsHTML(p.ping)}<span>${p.ping == null ? '—' : Math.round(p.ping) + ' ms'}</span>`;
      el.innerHTML = `<div class="who"><div class="nm">${esc(p.name || 'Soldier')}${p.isLocal ? '<span class="you">YOU</span>' : ''}</div><div class="sub">${esc(SLOT_CHAR[s].toUpperCase())} · SLOT ${s + 1}</div></div>
        ${p.isHost ? '<div class="host">HOST</div>' : ''}<div class="pg">${ping}</div>`;
    });
    const n = bySlot.filter(Boolean).length;
    L.cnt.textContent = `${n} / 4`;
    L.status.textContent = lobby.status || (n >= 4 ? 'Squad full — ready to deploy.' : isHost ? `${n} of 4 soldiers assembled · share the invite link` : `${n} of 4 soldiers assembled`);
  }
  hideLobby() { this.scrLobby.classList.remove('on'); }
  _copyInvite() {
    const b = this._lbCopy, lbl = b.lastChild;
    const done = (ok) => {
      b.classList.toggle('done', ok); b.classList.toggle('fail', !ok);
      lbl.textContent = ok ? 'COPIED ✓' : 'COPY FAILED — USE THE LINK BELOW';
      clearTimeout(this._copyT);
      this._copyT = setTimeout(() => { b.classList.remove('done', 'fail'); lbl.textContent = 'COPY INVITE LINK'; }, 1900);
    };
    let r;
    try { r = this._lobbyCb.onCopyInvite ? this._lobbyCb.onCopyInvite() : undefined; } catch (e) { done(false); return; }
    if (r && typeof r.then === 'function') r.then((v) => done(v !== false), () => done(false));
    else done(r !== false);
  }

  // ---------------- connecting / error
  showConnecting(text = 'Contacting squad', cb = {}) {
    this._connCb = cb || {};
    this._connT.textContent = String(text).replace(/[.…]+$/, '');
    this.scrConn.classList.add('on');
    this._select(this._navs.conn, 0);
  }
  hideConnecting() { this.scrConn.classList.remove('on'); }
  showError(title = 'SIGNAL LOST', text = '', cb = {}) {
    this._errCb = cb || {};
    this.hideConnecting();
    this._err.ttl.textContent = String(title).toUpperCase();
    const body = esc(String(text || '').trim());
    this._err.tx.innerHTML = body.replace(/([.!?])(\s+|$)/g, '$1 <span class="stop">STOP</span> ');
    this._err.no.textContent = `No. ${String(1000 + ((Date.now() / 1000) | 0) % 9000)}`;
    this.scrErr.classList.remove('on'); void this.scrErr.offsetWidth;
    this.scrErr.classList.add('on');
    this._select(this._navs.error, 0);
    this._sound('ui_click');
  }
  hideError() { this.scrErr.classList.remove('on'); }

  // ---------------- in-game team
  setLocalSlot(slot) {
    this._localSlot = slot == null ? null : slot | 0;
    if (this._localSlot == null) { this.elPoints.style.color = ''; this.elPoints.classList.remove('slot'); }
    else { this.elPoints.style.color = slotColor(this._localSlot); this.elPoints.classList.add('slot'); }
  }

  setTeamPoints(rows = []) {
    const seen = new Set();
    const others = [];
    for (const r of rows) {
      this._learn(r.name, r.slot);
      if (r.isLocal) {
        this.elPW.classList.toggle('down', !!r.downed);
        if (r.points != null) this.setPoints(r.points);
        if (r.slot != null && r.slot !== this._localSlot) this.setLocalSlot(r.slot);
        continue;
      }
      others.push(r);
    }
    others.sort((a, b) => (a.slot ?? 9) - (b.slot ?? 9));
    others.forEach((r) => {
      const id = String(r.id ?? r.name);
      seen.add(id);
      let el = this._team.get(id);
      if (!el) {
        el = h('div', 'ub-tm', `${MEDIC_SVG}<span class="nm"></span><span class="pt"></span>`);
        el._nm = el.querySelector('.nm'); el._pt = el.querySelector('.pt');
        this._team.set(id, el);
      }
      if (el._gone) { clearTimeout(el._gone); el._gone = null; el.classList.remove('gone'); }
      const c = slotColor(r.slot);
      if (el._c !== c) { el._c = c; el.style.setProperty('--c', c); }
      const nm = r.name || 'Soldier'; if (el._nm.textContent !== nm) el._nm.textContent = nm;
      const pt = String(Math.round(r.points || 0)); if (el._pt.textContent !== pt) el._pt.textContent = pt;
      el.classList.toggle('down', !!r.downed && !r.disconnected);
      el.classList.toggle('dc', !!r.disconnected);
      this.elTeam.appendChild(el);            // keeps order (append moves existing nodes)
    });
    for (const [id, el] of this._team) {
      if (seen.has(id) || el._gone) continue;
      el.classList.add('gone');
      el._gone = setTimeout(() => { el.remove(); this._team.delete(id); }, 650);
    }
  }

  showScoreboard(rows) {
    if (!rows) { this.elSB.classList.remove('on'); this._sbKey = null; return; }
    const key = JSON.stringify(rows) + this._round;
    if (key !== this._sbKey) {
      this._sbKey = key;
      const sorted = rows.slice().sort((a, b) => (b.points || 0) - (a.points || 0));
      const head = `<div class="r h"><span></span><span>SOLDIER</span><span class="n">POINTS</span><span class="n">KILLS</span><span class="n">HEADS</span><span class="n">REVIVES</span><span class="n">DOWNS</span><span class="n">PING</span></div>`;
      const body = sorted.map((r) => {
        this._learn(r.name, r.slot);
        const s = r.slot ?? 0;
        return `<div class="r${r.isLocal ? ' me' : ''}" style="--c:${slotColor(s)}"><span class="tab"></span>
          <span class="nm">${esc(r.name || 'Soldier')}${r.downed ? '<span class="dn">DOWN</span>' : ''}${r.disconnected ? '<span class="dn">LOST</span>' : ''}<small>${esc(SLOT_CHAR[s] ? SLOT_CHAR[s].toUpperCase() : '')}${r.isHost ? ' · HOST' : ''}</small></span>
          <span class="n pts">${Math.round(r.points || 0)}</span><span class="n">${r.kills ?? 0}</span><span class="n">${r.headshots ?? 0}</span><span class="n">${r.revives ?? 0}</span><span class="n">${r.downs ?? 0}</span>
          <span class="ping">${r.ping == null ? (r.isHost ? 'HOST' : '—') : `${barsHTML(r.ping)} ${Math.round(r.ping)}`}</span></div>`;
      }).join('');
      this.elSB.innerHTML = `<div class="ub-stamp">FIELD REPORT</div><div class="hd"><h3>SQUAD STATUS</h3><div class="meta">BLACKWALD BUNKER<br>ROUND ${this._round || 1} · ${rows.length} OF 4 SOLDIERS</div></div>${head}${body}
        <div class="foot"><span>FORM 20-A · CASUALTY &amp; ENGAGEMENT REPORT</span><span>HOLD TAB</span></div>`;
    }
    this.elSB.classList.add('on');
  }

  setMarkers(list = []) {
    const W = this.root.clientWidth || innerWidth, H = this.root.clientHeight || innerHeight;
    const seen = new Set();
    for (const m of list) {
      const id = String(m.id ?? m.name);
      seen.add(id);
      let el = this._marks.get(id);
      if (!el) {
        el = h('div', 'ub-mk', `<div class="plate"><span class="nm"></span><i class="chev"></i></div>
          <div class="dn"><svg viewBox="-24 -24 48 48"><circle r="19" class="bg"/><circle r="19" class="ring" pathLength="1"/><path class="cross" d="M-3-10h6v7h7v6h-7v7h-6v-7h-7v-6h7z"/></svg><div class="dl"><span class="who"></span> <span class="ds"></span></div></div>
          <div class="arr"><i></i></div>`);
        el._nm = el.querySelector('.plate .nm'); el._ring = el.querySelector('.ring'); el._who = el.querySelector('.who'); el._ds = el.querySelector('.ds');
        el._arr = el.querySelector('.arr'); el._plate = el.querySelector('.plate');
        this.elMarks.appendChild(el); this._marks.set(id, el);
      }
      this._learn(m.name, m.slot);
      const c = slotColor(m.slot);
      if (el._c !== c) { el._c = c; el.style.setProperty('--c', c); }
      const nm = (m.name || '').toUpperCase(); if (el._nm.textContent !== nm) { el._nm.textContent = nm; el._who.textContent = nm; }
      const down = !!m.downed;
      el.classList.toggle('down', down);
      el.classList.toggle('rev', down && !!m.beingRevived);
      const dist = m.dist != null && isFinite(m.dist) ? m.dist : null;
      if (down) {
        el._ring.style.strokeDashoffset = String(clamp01(m.bleed ?? 0));
        const ds = m.beingRevived ? 'REVIVING' : dist != null ? `${Math.round(dist)}M` : 'DOWN';
        if (el._ds.textContent !== ds) el._ds.textContent = ds;
      }
      let px = +m.x, py = +m.y;
      const finite = isFinite(px) && isFinite(py);
      if (finite && Math.abs(px) <= 2 && Math.abs(py) <= 2) { px *= W; py *= H; }
      const on = m.onScreen !== false && finite && px >= 0 && py >= 0 && px <= W && py <= H;
      if (on) {
        el.classList.remove('edge');
        el.style.display = '';
        el.style.transform = `translate(${px.toFixed(1)}px,${py.toFixed(1)}px)`;
        if (!down) {
          const o = dist == null ? 1 : dist < 10 ? 1 : Math.max(0.3, 1 - (dist - 10) / 40);
          const sc = dist == null ? 1 : Math.max(0.72, 1 - dist / 90);
          el._plate.style.opacity = o.toFixed(2);
          el._plate.style.transform = `translate(-50%,-100%) scale(${sc.toFixed(3)})`;
        }
      } else if (down) {
        // off-screen: pin to the screen edge, arrow points toward the teammate
        let dx, dy;
        if (typeof m.angle === 'number' && isFinite(m.angle)) { dx = Math.sin(m.angle); dy = -Math.cos(m.angle); }
        else if (finite) { dx = px - W / 2; dy = py - H / 2; }
        else { dx = 0; dy = 1; }
        const len = Math.hypot(dx, dy) || 1; dx /= len; dy /= len;
        // keep clear of the corner HUD clusters: larger bottom margin
        const mx = Math.max(70, W * 0.1), mt = Math.max(60, H * 0.12), mb = Math.max(110, H * 0.24);
        const t = Math.min((W / 2 - mx) / Math.max(1e-4, Math.abs(dx)), (H / 2 - (dy > 0 ? mb : mt)) / Math.max(1e-4, Math.abs(dy)));
        const ex = W / 2 + dx * t, ey = H / 2 + dy * t;
        el.classList.add('edge');
        el.classList.toggle('lab-up', dy > 0.35);
        el.style.display = '';
        el.style.transform = `translate(${ex.toFixed(1)}px,${ey.toFixed(1)}px)`;
        el._arr.style.transform = `rotate(${(Math.atan2(dy, dx) * 180 / Math.PI).toFixed(1)}deg)`;
      } else {
        el.style.display = 'none';
      }
    }
    for (const [id, el] of this._marks) if (!seen.has(id)) { el.remove(); this._marks.delete(id); }
  }

  reviveProgress(frac, text) {
    const r = this.elRevive;
    if (frac == null || frac === false) { r.classList.remove('on'); return; }
    r.classList.add('on');
    if (text != null && text !== this._revText) { this._revText = text; r.querySelector('.t span').innerHTML = this._colorNames(esc(text)); }
    r.querySelector('.fill').style.width = `${(clamp01(frac) * 100).toFixed(1)}%`;
  }

  _colorNames(html) {
    const names = [...this._known.keys()].filter((n) => n.length > 1).sort((a, b) => b.length - a.length);
    if (!names.length) return html;
    const marks = [];
    for (const n of names) {
      const re = new RegExp(`(?<![\\p{L}\\p{N}])${reEsc(esc(n))}(?![\\p{L}\\p{N}])`, 'gu');
      html = html.replace(re, (m0) => { marks.push(`<b style="color:${slotColor(this._known.get(n))}">${m0}</b>`); return `\u0000${marks.length - 1}\u0000`; });
    }
    return html.replace(/\u0000(\d+)\u0000/g, (_, i) => marks[+i]);
  }

  feed(text, slot) {
    const el = h('div', 'ub-fd');
    if (slot != null && slot >= 0) el.style.setProperty('--c', slotColor(slot));
    el.innerHTML = this._colorNames(esc(text || ''));
    this.elFeed.appendChild(el);
    while (this.elFeed.childElementCount > 5) this.elFeed.firstChild.remove();
    setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 650); }, 6000);
  }

  chat(name, slot, text) {
    this._learn(name, slot);
    const el = h('div', 'ub-cl' + (name ? '' : ' sys'));
    el.style.setProperty('--c', slotColor(slot));
    el.innerHTML = `${name ? `<span class="n">${esc(name)}</span>` : ''}${esc(String(text || '').slice(0, 200))}`;
    this.elChatLog.appendChild(el);
    while (this.elChatLog.childElementCount > 6) this.elChatLog.firstChild.remove();
    setTimeout(() => el.classList.add('old'), 8000);
  }
  openChat() {
    if (this._chatActive) return;
    this._chatActive = true;
    this.elChatIn.value = '';
    this.elChat.classList.add('open');
    // focus on the next task so the key that opened chat (T) is not typed into the field
    setTimeout(() => { if (this._chatActive) this.elChatIn.focus({ preventScroll: true }); }, 0);
  }
  closeChat() {
    if (!this._chatActive) return;
    this._chatActive = false;
    this.elChat.classList.remove('open');
    if (document.activeElement === this.elChatIn) this.elChatIn.blur();
  }
  get chatActive() { return this._chatActive; }

  setNetStatus(st) {
    const n = this.elNet;
    if (!st) { n.classList.remove('on'); this._netKey = null; return; }
    const ping = st.ping == null ? null : Math.round(st.ping);
    let loss = st.loss || 0; if (loss > 1) loss /= 100;
    const key = `${ping}|${Math.round(loss * 100)}|${!!st.warn}`;
    n.classList.add('on');
    if (key === this._netKey) return; this._netKey = key;
    n.classList.toggle('warn', !!st.warn);
    n.querySelector('.bw').innerHTML = barsHTML(ping);
    n.querySelector('.tx').textContent = `${ping == null ? '—' : ping + ' ms'}${loss >= 0.02 ? ` · ${Math.round(loss * 100)}% loss` : ''}`;
  }

  setSpectating(name) {
    const s = this.elSpec;
    if (!name) { s.classList.remove('on'); return; }
    const slot = this._known.get(String(name));
    s.style.setProperty('--c', slot != null ? slotColor(slot) : 'var(--bone)');
    s.querySelector('.a').innerHTML = `<span class="rec"></span>SPECTATING <b>${esc(String(name).toUpperCase())}</b>`;
    s.classList.add('on');
  }

  update(dt) { /* all HUD animation is CSS / WAAPI driven; kept for interface compatibility */ this._t = (this._t || 0) + (dt || 0); }

  destroy() {
    window.removeEventListener('keydown', this._onKey, true);
    this._goClear(); clearInterval(this._flavInt);
    this.root.remove();
  }
}

export default HUD;
