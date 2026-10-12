// src__audio 02 — math
// Lines 336-646 of readable/src__audio.pretty.js (statement-aligned).
function scrape(
  c,
  o,
  t,
  d,
  { f = 2500, f2, Q = 3, amp = 0.5, k = "w", rough = 0.6 } = {},
  R = Math.random,
) {
  const n = NS(c, t, d + 0.02, k),
    fl = F(c, "bandpass", f, Q),
    g = G(c, 0);
  if (f2) {
    fl.frequency.setValueAtTime(f, t);
    fl.frequency.linearRampToValueAtTime(f2, t + d);
  }
  const N = Math.max(4, Math.ceil(d * 220));
  const cv = curveOf(
    N,
    (x) =>
      amp * Math.pow(Math.sin(Math.PI * x), 0.6) * (1 - rough + rough * R()),
  );
  cv[0] = 0;
  cv[N - 1] = 0;
  g.gain.setValueCurveAtTime(cv, t, d);
  ch(n, fl, g, o);
}
function smooth(R, n, k) {
  k = Math.max(1, k);
  const cp = [];
  for (let i = 0; i < k + 3; i++) cp.push(R() * 2 - 1);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * k,
      i0 = Math.floor(x),
      fr = x - i0,
      w = (1 - Math.cos(fr * Math.PI)) / 2;
    out[i] = cp[i0] * (1 - w) + cp[i0 + 1] * w;
  }
  return out;
}
function ip(pts, x) {
  if (typeof pts === "number") return pts;
  if (x <= pts[0][0]) return pts[0][1];
  for (let i = 1; i < pts.length; i++)
    if (x <= pts[i][0]) {
      const [x0, y0] = pts[i - 1],
        [x1, y1] = pts[i];
      return y0 + ((y1 - y0) * (x - x0)) / (x1 - x0 || 1);
    }
  return pts[pts.length - 1][1];
}
// wood creak: stick-slip pulse train through a resonant body
function creak(
  c,
  o,
  t,
  d,
  { f = 900, f2, rate = 40, rate2, Q = 7, amp = 0.5 } = {},
  R = Math.random,
) {
  const s = O(c, "sawtooth", rate, t, d + 0.05);
  const N = Math.max(8, Math.ceil(d * 120));
  const r2 = rate2 ?? rate * 0.6;
  const jn = smooth(R, N, Math.ceil(d * 12));
  s.frequency.setValueCurveAtTime(
    curveOf(
      N,
      (x) =>
        (rate + (r2 - rate) * x) * (1 + 0.35 * jn[Math.round(x * (N - 1))]),
    ),
    t,
    d,
  );
  const bp = F(c, "bandpass", f, Q),
    bp2 = F(c, "bandpass", f * 2.3, Q * 1.2),
    g = G(c, 0),
    m = G(c, 1);
  if (f2) {
    bp.frequency.setValueAtTime(f, t);
    bp.frequency.linearRampToValueAtTime(f2, t + d);
  }
  s.connect(bp);
  s.connect(bp2);
  bp.connect(m);
  const g2 = G(c, 0.4);
  bp2.connect(g2);
  g2.connect(m);
  E(g.gain, t, 0, [
    [d * 0.15, amp],
    [d * 0.7, amp * 0.8],
    [d * 0.15, 0],
  ]);
  ch(m, g, o);
}

// ───────────────────────────────────────────────────────────── formant voice
const VOW = {
  a: [730, 1090, 2440],
  o: [570, 840, 2410],
  u: [300, 870, 2240],
  e: [530, 1840, 2480],
  i: [300, 2200, 2950],
  uh: [640, 1190, 2390],
  er: [490, 1350, 1690],
  ae: [660, 1720, 2410],
  oo: [350, 700, 2300],
};
function voice(c, o, t, R, s) {
  const d = s.dur,
    n = Math.max(16, Math.ceil(d * 100));
  const jn = smooth(R, n, Math.round(d * (s.jitRate || 14))),
    an = smooth(R, n, Math.round(d * (s.ampRate || 10)));
  const vib = s.vib || [0, 0],
    jit = s.jitter ?? 0.05,
    aj = s.ampJit ?? 0.35;
  const f0 = new Float32Array(n),
    fh = new Float32Array(n),
    en = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = i / (n - 1),
      tt = x * d;
    const v =
      ip(s.f0, x) * (1 + jit * jn[i] + vib[1] * Math.sin(TAU * vib[0] * tt));
    f0[i] = Math.max(20, v);
    fh[i] = f0[i] * 0.5;
    en[i] = Math.max(0, ip(s.env, x) * (1 + aj * an[i]));
  }
  en[0] = 0;
  en[n - 1] = 0;
  const src = c.createOscillator();
  src.type = s.wave || "sawtooth";
  src.frequency.setValueCurveAtTime(f0, t, d);
  src.start(t);
  src.stop(t + d + 0.02);
  const glot = G(c, s.fry ? 1 - s.fry * 0.6 : 1);
  src.connect(glot);
  if (s.fry) {
    // period-doubling vocal fry -> growl
    const so = c.createOscillator();
    so.type = "square";
    so.frequency.setValueCurveAtTime(fh, t, d);
    so.start(t);
    so.stop(t + d + 0.02);
    const sg = G(c, s.fry * 0.6);
    so.connect(sg);
    sg.connect(glot.gain);
  }
  const mix = G(c, 1);
  glot.connect(mix);
  if (s.rasp) {
    // noise gated by the glottal pulse -> rough, wet rasp
    const nz = NS(c, t, d + 0.02, "w"),
      hp = F(c, "highpass", 900, 0.5),
      rg = G(c, 0),
      drv = G(c, s.rasp * 1.4);
    glot.connect(drv);
    drv.connect(rg.gain);
    ch(nz, hp, rg, mix);
  }
  if (s.breath) {
    const nz = NS(c, t, d + 0.02, "p"),
      bp = F(c, "bandpass", 1800, 0.6),
      bg = G(c, s.breath);
    ch(nz, bp, bg, mix);
  }
  const fsum = G(c, 1),
    sc = s.fscale || 1,
    bwm = s.bw || 1.4,
    vw = s.vow;
  const BW = [90, 120, 170],
    FG = [1, 0.55, 0.3];
  for (let k = 0; k < 3; k++) {
    const v0 = VOW[vw[0][1]][k] * sc,
      bp = F(c, "bandpass", v0, v0 / (BW[k] * bwm));
    bp.frequency.setValueAtTime(v0, t);
    for (const [x, vn] of vw)
      bp.frequency.linearRampToValueAtTime(
        VOW[vn][k] * sc * (1 + (R() - 0.5) * 0.06),
        t + x * d,
      );
    const fg = G(c, FG[k] * Math.sqrt(bp.Q.value) * 1.5);
    ch(mix, bp, fg, fsum);
  }
  const low = F(c, "lowpass", 260, 0.7),
    lg = G(c, 0.25);
  ch(mix, low, lg, fsum);
  let node = fsum;
  if (s.drive) {
    const w = sat(c, s.drive);
    fsum.connect(w);
    node = w;
  }
  const tr = G(c, 1);
  if (s.trem) {
    const [rate, dep] = s.trem;
    tr.gain.value = 1 - dep / 2;
    const l = O(c, "sine", rate, t, d + 0.02),
      l2 = G(c, dep / 2);
    ch(l, l2, tr.gain);
  }
  const eg = G(c, 0);
  eg.gain.setValueCurveAtTime(en, t, d);
  ch(node, tr, eg);
  eg.connect(o);
  return eg;
}

// liquid bubbles (death gurgle, drinking)
function bubbles(c, o, t, d, n, R, { lo = 250, hi = 700, amp = 0.3 } = {}) {
  for (let i = 0; i < n; i++) {
    const at = t + R() * d,
      f = rr(R, lo, hi),
      dd = rr(R, 0.015, 0.045);
    tone(c, o, at, {
      f,
      f2: f * rr(R, 1.4, 2.2),
      sw: dd,
      a: 0.002,
      d: dd,
      amp: amp * rr(R, 0.3, 1),
    });
  }
}

// ───────────────────────────────────────────────────────────── instruments (music / stingers)
function mbox(c, o, t, f, amp = 0.3, d = 2.2, R = Math.random, wow = null) {
  const det = (R() - 0.5) * 18; // worn, slightly out-of-tune comb
  const parts = [
    [1, 1, d],
    [1.0035, 0.5, d * 0.9],
    [2, 0.1, d * 0.35],
    [5.93, 0.09, d * 0.08],
    [9.7, 0.035, d * 0.04],
  ];
  for (const [r, a, dd] of parts) {
    const fr = f * r;
    if (fr > 15000) continue;
    const s = O(c, "sine", fr, t, dd + 0.05);
    s.detune.value = det;
    if (wow) wow.connect(s.detune);
    const pg = G(c, 0);
    AD(pg.gain, t, 0.0012, dd, a * amp);
    ch(s, pg, o);
  }
  burst(c, o, t, {
    type: "highpass",
    f: 5000,
    a: 0.0003,
    d: 0.006,
    amp: amp * 0.2,
  });
}
const RIS = [
  [0.56, 0, 1, 1],
  [0.56, 1, 0.67, 0.9],
  [0.92, 0, 1, 0.65],
  [0.92, 1.7, 1.8, 0.55],
  [1.19, 0, 2.67, 0.325],
  [1.7, 0, 1.67, 0.35],
  [2, 0, 1.46, 0.25],
  [2.74, 0, 1.33, 0.2],
  [3, 0, 1.33, 0.15],
  [3.76, 0, 1, 0.1],
  [4.07, 0, 1.33, 0.075],
];
function bell(c, o, t, f, d = 5, amp = 0.4) {
  for (const [r, off, a, dr] of RIS) {
    const fr = f * r + off;
    if (fr > 14000) continue;
    tone(c, o, t, { f: fr, a: 0.002, d: d * dr, amp: (amp * a) / 6 });
  }
}
function brass(
  c,
  o,
  t,
  f,
  d,
  amp,
  { a = 0.12, r = 0.6, bright = 2.2, vib = 0.004 } = {},
) {
  const lp = F(c, "lowpass", f * 1.2, 1.2),
    g = G(c, 0);
  ch(lp, g, o);
  const lfo = O(c, "sine", 5.3, t, d + r + 0.1),
    lg = G(c, f * vib);
  lfo.connect(lg);
  for (const cents of [-9, 0, 8]) {
    const s = O(c, "sawtooth", f, t, d + r + 0.1);
    s.detune.value = cents;
    lg.connect(s.frequency);
    s.connect(lp);
  }
  lp.frequency.setValueAtTime(f * 1.1, t);
  lp.frequency.linearRampToValueAtTime(
    Math.min(12000, f * bright * 2.5),
    t + a,
  );
  lp.frequency.linearRampToValueAtTime(
    Math.min(12000, f * bright),
    t + a + 0.3,
  );
  lp.frequency.linearRampToValueAtTime(f * 1.1, t + d + r);
  E(g.gain, t, 0, [
    [a, amp / 3],
    [0.3, amp * 0.24],
    [Math.max(0.01, d - a - 0.3), amp * 0.22],
    [r, 0],
  ]);
}
const CHOIR = 0.5;
