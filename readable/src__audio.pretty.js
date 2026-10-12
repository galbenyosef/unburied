// UNBURIED — audio engine.
// 100% synthesized WebAudio. One-shots are pre-rendered into AudioBuffers at init with
// OfflineAudioContext (several seeded variants each); music is generated live by a lookahead
// scheduler; stingers are synthesized live. No audio files anywhere.
//
//   sfx ─┐                                   ┌─ ui ─────────────┐
//   music┼─► duckIn ─► duckLP ─► masterGain ─┴─► compressor ─► limiter ─► out
//   reverb (bunker IR convolver) ─┘

const TAU = Math.PI * 2;
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);
const rr = (R, a, b) => a + (b - a) * R();
const pick = (R, arr) => arr[Math.floor(R() * arr.length) % arr.length];

function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function hash(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

// ───────────────────────────────────────────────────────────── shared buffers
let NZ = null;
function makeNoise(sr) {
  if (NZ) return NZ;
  const len = Math.floor(sr * 3);
  const mk = (ch = 1, l = len) =>
    new AudioBuffer({ length: l, sampleRate: sr, numberOfChannels: ch });
  const w = mk(),
    p = mk(),
    b = mk();
  const W = w.getChannelData(0),
    P = p.getChannelData(0),
    B = b.getChannelData(0);
  let b0 = 0,
    b1 = 0,
    b2 = 0,
    b3 = 0,
    b4 = 0,
    b5 = 0,
    b6 = 0,
    br = 0;
  const R = rng(1234567);
  for (let i = 0; i < len; i++) {
    const x = R() * 2 - 1;
    W[i] = x;
    b0 = 0.99886 * b0 + x * 0.0555179;
    b1 = 0.99332 * b1 + x * 0.0750759;
    b2 = 0.969 * b2 + x * 0.153852;
    b3 = 0.8665 * b3 + x * 0.3104856;
    b4 = 0.55 * b4 + x * 0.5329522;
    b5 = -0.7616 * b5 - x * 0.016898;
    P[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + x * 0.5362) * 0.2;
    b6 = x * 0.115926;
    br = (br + 0.02 * x) / 1.02;
    B[i] = br * 3.5;
  }
  // make each loop seamless (sources loop from random offsets)
  const xf = Math.floor(sr * 0.05);
  for (const A of [W, P, B]) {
    for (let i = 0; i < xf; i++) {
      const k = i / xf;
      A[i] = A[i] * k + A[len - xf + i] * (1 - k);
    }
    let m = 0;
    for (let i = 0; i < len; i++) m += A[i];
    m /= len;
    for (let i = 0; i < len; i++) A[i] -= m;
  }
  // vinyl crackle (stereo, 6 s): sparse clicks + pops + faint hiss
  const cl = Math.floor(sr * 6),
    cr = mk(2, cl);
  for (let chn = 0; chn < 2; chn++) {
    const C = cr.getChannelData(chn),
      Rc = rng(99 + chn);
    for (let i = 0; i < cl; i++) C[i] = (Rc() * 2 - 1) * 0.02;
    const nClicks = 110;
    for (let k = 0; k < nClicks; k++) {
      const at = Math.floor(Rc() * (cl - 400)),
        amp = Math.pow(Rc(), 3) * 0.9 + 0.05,
        n = 2 + Math.floor(Rc() * 30);
      const sgn = Rc() < 0.5 ? -1 : 1;
      for (let i = 0; i < n; i++)
        C[at + i] += sgn * amp * Math.exp(-i / (n * 0.3)) * (i % 2 ? -0.6 : 1);
    }
  }
  NZ = { sr, w, p, b, cr };
  return NZ;
}

function makeIR(sr, t60 = 1.6) {
  const len = Math.floor(sr * (t60 + 0.25));
  const ir = new AudioBuffer({
    length: len,
    sampleRate: sr,
    numberOfChannels: 2,
  });
  for (let chn = 0; chn < 2; chn++) {
    const D = ir.getChannelData(chn),
      R = rng(777 + chn * 31);
    let y = 0;
    const pre = 0.007;
    for (let i = 0; i < len; i++) {
      const t = i / sr;
      if (t < pre) {
        D[i] = 0;
        continue;
      }
      const fc = 9000 * Math.exp(-t * 2.2) + 900; // concrete: highs die first
      const a = Math.exp((-TAU * fc) / sr);
      y = a * y + (1 - a) * (R() * 2 - 1);
      const build = Math.min(1, (t - pre) / 0.025);
      D[i] = y * Math.exp((-6.9 * t) / t60) * build * 2.2;
    }
    // early reflections off close concrete walls
    for (let k = 0; k < 14; k++) {
      const t = 0.004 + Math.pow(R(), 1.4) * 0.07,
        at = Math.floor(t * sr),
        amp = (0.9 - t * 8) * (0.5 + R() * 0.5);
      for (let i = 0; i < 24 && at + i < len; i++)
        D[at + i] += amp * Math.exp(-i / 5) * (i % 2 ? -0.4 : 1);
    }
    // flutter echo between parallel walls
    const fl = 0.021 + chn * 0.0027;
    for (let k = 1; k < 16; k++) {
      const at = Math.floor(k * fl * sr);
      if (at >= len) break;
      const amp = 0.35 * Math.pow(0.78, k);
      for (let i = 0; i < 16 && at + i < len; i++)
        D[at + i] += amp * Math.exp(-i / 4);
    }
  }
  return ir;
}

// ───────────────────────────────────────────────────────────── node helpers
const G = (c, v = 1) => {
  const n = c.createGain();
  n.gain.value = v;
  return n;
};
const F = (c, type, f, Q = 0.707, gain = 0) => {
  const n = c.createBiquadFilter();
  n.type = type;
  n.frequency.value = Math.min(f, 18000);
  n.Q.value = Q;
  if (gain) n.gain.value = gain;
  return n;
};
const FMAX = 16000;
const O = (c, type, f, t, d) => {
  const n = c.createOscillator();
  n.type = type;
  n.frequency.value = Math.min(f, FMAX);
  n.start(t);
  n.stop(t + d);
  return n;
};
function NS(c, t, d, kind = "w", rate = 1) {
  const s = c.createBufferSource();
  s.buffer = NZ[kind];
  s.loop = true;
  s.playbackRate.value = rate;
  s.start(t, Math.random() * 2.5);
  s.stop(t + d);
  return s;
}
function ch(...n) {
  for (let i = 0; i < n.length - 1; i++) n[i].connect(n[i + 1]);
  return n[n.length - 1];
}
// Build part of a sound just before it is needed. Nodes created up-front sit in the graph for the whole
// render and cost CPU, so offline renders defer via suspend() and live contexts via a short timer.
function later(c, t, fn) {
  if (c.__defer) return c.__defer(t - 0.03, fn);
  const lead = t - c.currentTime;
  if (lead > 0.35 && typeof setTimeout === "function")
    setTimeout(
      () => {
        try {
          fn();
        } catch (e) {
          console.error("[audio]", e);
        }
      },
      (lead - 0.25) * 1000,
    );
  else fn();
}
// envelope: segs = [[dt, value, 'l'|'e'|'s'], ...]
function E(p, t, v0, segs) {
  p.setValueAtTime(v0, t);
  let tt = t;
  for (const [dt, v, k] of segs) {
    tt += Math.max(0.0001, dt);
    if (k === "e") p.exponentialRampToValueAtTime(Math.max(1e-5, v), tt);
    else if (k === "s") p.setValueAtTime(v, tt);
    else p.linearRampToValueAtTime(v, tt);
  }
  return tt;
}
const AD = (p, t, a, d, peak = 1) =>
  E(p, t, 0, [
    [a, peak],
    [d, 1e-5, "e"],
  ]);

const SATC = {};
function sat(c, k = 2) {
  const w = c.createWaveShaper();
  if (!SATC[k]) {
    const n = 2048,
      cv = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const x = (i / (n - 1)) * 2 - 1;
      cv[i] = Math.tanh(k * x) / Math.tanh(k);
    }
    SATC[k] = cv;
  }
  w.curve = SATC[k];
  w.oversample = "2x";
  return w;
}

function burst(
  c,
  o,
  t,
  {
    k = "w",
    type = "bandpass",
    f = 1000,
    Q = 1,
    f2,
    a = 0.001,
    d = 0.1,
    amp = 1,
    rate = 1,
    sweep,
  } = {},
) {
  const n = NS(c, t, a + d + 0.05, k, rate),
    fl = F(c, type, f, Q),
    g = G(c, 0);
  if (f2) {
    fl.frequency.setValueAtTime(f, t);
    fl.frequency.exponentialRampToValueAtTime(f2, t + (sweep ?? a + d));
  }
  AD(g.gain, t, a, d, amp);
  ch(n, fl, g, o);
  return g;
}
function tone(
  c,
  o,
  t,
  {
    type = "sine",
    f = 440,
    f2,
    sw,
    a = 0.002,
    d = 0.2,
    amp = 1,
    detune = 0,
  } = {},
) {
  if (f > FMAX) return null; // keep synth partials below 16 kHz
  if (f2) f2 = Math.min(f2, FMAX);
  const s = O(c, type, f, t, a + d + 0.05);
  if (detune) s.detune.value = detune;
  if (f2) {
    s.frequency.setValueAtTime(f, t);
    s.frequency.exponentialRampToValueAtTime(f2, t + (sw ?? d));
  }
  const g = G(c, 0);
  AD(g.gain, t, a, d, amp);
  ch(s, g, o);
  return s;
}
const thump = (c, o, t, f, f2, d, amp = 1) =>
  tone(c, o, t, { f, f2, sw: d * 0.8, a: 0.001, d, amp });
function ping(c, o, t, f, d, amp) {
  tone(c, o, t, { f, a: 0.0005, d, amp });
  tone(c, o, t, { f: f * 2.71, a: 0.0005, d: d * 0.45, amp: amp * 0.4 });
  tone(c, o, t, { f: f * 5.13, a: 0.0005, d: d * 0.2, amp: amp * 0.2 });
}
function clk(c, o, t, amp = 1, f = 3000, ring = 0.03) {
  burst(c, o, t, {
    type: "highpass",
    f: f * 0.6,
    Q: 0.7,
    a: 0.0002,
    d: 0.004,
    amp,
  });
  ping(c, o, t, f, ring, amp * 0.3);
  ping(c, o, t, f * 1.53, ring * 0.6, amp * 0.18);
}
function clack(c, o, t, amp = 1, f = 2500, body = 260) {
  clk(c, o, t, amp, f, 0.045);
  tone(c, o, t, {
    f: body,
    f2: body * 0.6,
    a: 0.0008,
    d: 0.06,
    amp: amp * 0.7,
  });
  burst(c, o, t, {
    type: "bandpass",
    f: 900,
    Q: 1,
    a: 0.0005,
    d: 0.025,
    amp: amp * 0.6,
  });
}
function curveOf(n, fn) {
  const a = new Float32Array(n);
  for (let i = 0; i < n; i++) a[i] = fn(i / (n - 1));
  return a;
}
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
function choir(
  c,
  o,
  t,
  f,
  d,
  amp,
  R,
  {
    vow = [
      [0, "o"],
      [1, "a"],
    ],
    env = [
      [0, 0],
      [0.3, 1],
      [0.8, 0.85],
      [1, 0],
    ],
    f0,
  } = {},
) {
  const g = G(c, amp * CHOIR);
  g.connect(o);
  voice(c, g, t, R, {
    dur: d,
    f0: f0 || [
      [0, f],
      [1, f],
    ],
    vow,
    fscale: f > 220 ? 1.17 : 1,
    bw: 1.1,
    jitter: 0.006,
    jitRate: 3,
    vib: [rr(R, 4.8, 5.6), 0.011],
    rasp: 0.02,
    breath: 0.05,
    env,
    ampJit: 0.08,
  });
}
function pluck(c, o, t, f, amp = 0.3, d = 0.35) {
  const s = O(c, "sawtooth", f, t, d + 0.05),
    s2 = O(c, "square", f * 1.002, t, d + 0.05),
    lp = F(c, "lowpass", 4000, 2),
    g = G(c, 0);
  lp.frequency.setValueAtTime(Math.min(9000, f * 8), t);
  lp.frequency.exponentialRampToValueAtTime(
    Math.max(200, f * 1.2),
    t + d * 0.6,
  );
  const g2 = G(c, 0.4);
  s2.connect(g2);
  g2.connect(lp);
  s.connect(lp);
  ch(lp, g, o);
  AD(g.gain, t, 0.002, d, amp);
}
function organ(c, o, t, f, d, amp = 0.15) {
  const lp = F(c, "lowpass", 2500, 0.7),
    g = G(c, 0);
  ch(lp, g, o);
  for (const [r, a, ty] of [
    [1, 1, "sine"],
    [2, 0.5, "sine"],
    [3, 0.25, "sine"],
    [1, 0.25, "square"],
  ]) {
    const s = O(c, ty, f * r, t, d + 0.1);
    const sg = G(c, a);
    ch(s, sg, lp);
  }
  E(g.gain, t, 0, [
    [0.01, amp],
    [d - 0.03, amp * 0.9],
    [0.05, 0],
  ]);
}
function uprightBass(c, o, t, f, amp = 0.5, d = 0.4) {
  const s = O(c, "triangle", f, t, d + 0.05),
    s2 = O(c, "sine", f, t, d + 0.05),
    lp = F(c, "lowpass", 700, 1),
    g = G(c, 0);
  s.connect(lp);
  s2.connect(lp);
  ch(lp, g, o);
  AD(g.gain, t, 0.004, d, amp);
  burst(c, o, t, {
    type: "bandpass",
    f: 1200,
    Q: 2,
    a: 0.001,
    d: 0.02,
    amp: amp * 0.25,
  });
}
function mixBus(c, o, w, dry = 1, wet = 0.4) {
  const b = G(c, 1),
    dg = G(c, dry),
    wg = G(c, wet);
  b.connect(dg);
  dg.connect(o);
  b.connect(wg);
  wg.connect(w);
  return b;
}

// ───────────────────────────────────────────────────────────── sound definitions
const DEFS = {};
function def(name, o, build) {
  DEFS[name] = {
    n: 4,
    dur: 1,
    ch: 1,
    vol: 1,
    rev: 0.2,
    bus: "sfx",
    cap: 8,
    jit: 0.03,
    peak: 0.89,
    ...o,
    build,
  };
}

// ── gunshots (phase 2: layered) ──
// Each shot_* is a composite played by the engine from separately pre-rendered layers:
//   core  (<name>)       — supersonic crack / muzzle transient + sub punch + calibre body + gun-specific action
//   tail  (<name>:tail)  — interior slap (early reflections off the bunker walls) + concrete room tail
//   mech  (<name>:mech)  — full-auto only: bolt / belt-feed rattle, round-robined and jittered per shot
//   far   (<name>:far)   — distant version: dull low-passed crack, soft thump, long rolling tail
// At play time the engine jitters pitch (±3 %) and layer timing, adds a random tone filter per shot,
// round-robins variants and crossfades to :far beyond ~20–28 m (with a speed-of-sound delay).
function nwave(c, o, t, amp, len) {
  const cs = c.createConstantSource();
  cs.offset.value = 0;
  cs.offset.setValueAtTime(0, t);
  cs.offset.linearRampToValueAtTime(amp, t + 0.00012);
  cs.offset.linearRampToValueAtTime(-amp * 0.85, t + len);
  cs.offset.linearRampToValueAtTime(0, t + len * 1.35);
  cs.start(t);
  cs.stop(t + len * 2 + 0.01);
  ch(cs, F(c, "highpass", 150), o);
}
function gunCore(c, o, t, R, p) {
  const j = (x, a = 0.08) => x * (1 + (R() - 0.5) * 2 * a);
  // everything transient goes through a hot saturator: "slightly distorted", glued
  const hot = G(c, 1);
  ch(hot, sat(c, p.drive || 4), o);
  const cr = p.crack;
  nwave(c, hot, t, j(cr.amp), j(cr.nw));
  burst(c, hot, t, {
    type: "highpass",
    f: j(cr.hp),
    Q: 0.7,
    a: 0.0001,
    d: j(cr.nd),
    amp: cr.amp * 0.9,
  });
  burst(c, hot, t + 0.0004, {
    type: "bandpass",
    f: j(cr.hp * 1.9),
    Q: 1.1,
    a: 0.0001,
    d: cr.nd * 0.7,
    amp: cr.amp * 0.45,
  });
  // low-end punch: sub thump with a fast pitch drop + a click to make it read on small speakers
  const pu = p.punch;
  tone(c, hot, t, {
    f: j(pu.f0),
    f2: j(pu.f1),
    sw: pu.dec * 0.45,
    a: 0.0006,
    d: j(pu.dec),
    amp: pu.amp,
  });
  tone(c, hot, t, {
    type: "triangle",
    f: j(pu.f0 * 2.1),
    f2: pu.f1 * 1.6,
    sw: pu.dec * 0.25,
    a: 0.0006,
    d: pu.dec * 0.35,
    amp: pu.amp * 0.35,
  });
  // calibre body: band-limited noise burst (+ optional low boom and barrel ring)
  for (const b of p.body)
    burst(c, hot, t, {
      k: b.k || "p",
      type: b.type || "bandpass",
      f: j(b.f),
      f2: b.f2,
      Q: b.Q ?? 0.9,
      a: 0.0005,
      d: j(b.dec),
      amp: b.amp,
    });
  if (p.ring)
    burst(c, hot, t, {
      k: "w",
      type: "bandpass",
      f: j(p.ring.f, 0.04),
      Q: 11,
      a: 0.0004,
      d: j(p.ring.dec),
      amp: p.ring.amp,
    });
  // gun-specific action, dry (not through the saturator)
  if (p.act)
    for (const [dt, kind, f, amp, bodyF] of p.act) {
      const at = t + j(dt, 0.15);
      if (kind === "clack") clack(c, o, at, amp, j(f, 0.05), bodyF || 260);
      else clk(c, o, at, amp, j(f, 0.05), 0.025);
    }
}
function gunTail(c, o, t, R, p) {
  const tl = p.tail,
    j = (x, a = 0.1) => x * (1 + (R() - 0.5) * 2 * a);
  // interior slap: discrete early reflections off near concrete, each duller than the last
  const taps = tl.taps ?? 7;
  for (let i = 0; i < taps; i++) {
    const dt =
        0.006 + Math.pow((i + R() * 0.8) / taps, 1.35) * (tl.slapSpan ?? 0.075),
      k = 1 - i / (taps + 1);
    burst(c, o, t + dt, {
      k: "p",
      type: "bandpass",
      f: (tl.slapF ?? 1400) * (0.55 + 0.45 * k) * rr(R, 0.85, 1.15),
      Q: 0.9,
      a: 0.0006,
      d: 0.018 + i * 0.004,
      amp: tl.slap * k * rr(R, 0.6, 1),
    });
    if (i < 3)
      tone(c, o, t + dt, {
        f: p.punch.f1 * 1.3,
        a: 0.001,
        d: 0.04,
        amp: tl.slap * 0.35 * k,
      });
  }
  // room boom (mode ringing) + concrete tail: brown/pink noise, highs die first
  tone(c, o, t + 0.01, {
    f: rr(R, 62, 78),
    a: 0.01,
    d: tl.dur * 0.35,
    amp: tl.boom ?? 0.3,
  });
  burst(c, o, t + 0.004, {
    k: "b",
    type: "lowpass",
    f: tl.lp,
    f2: tl.lp * 0.25,
    Q: 0.5,
    a: 0.015,
    d: j(tl.dur),
    amp: tl.amp,
    sweep: tl.dur,
  });
  burst(c, o, t + 0.006, {
    k: "p",
    type: "bandpass",
    f: tl.lp * 1.7,
    f2: tl.lp * 0.6,
    Q: 0.6,
    a: 0.008,
    d: tl.dur * 0.45,
    amp: tl.amp * 0.55,
    sweep: tl.dur * 0.45,
  });
  // rolling echoes down the corridors (big calibres)
  if (tl.echoes)
    for (const [dt, a] of tl.echoes) {
      const at = t + j(dt),
        rr1 = R();
      later(c, at, () => {
        burst(c, o, at, {
          k: "p",
          type: "lowpass",
          f: tl.lp * (0.8 + 0.3 * rr1),
          Q: 0.6,
          a: 0.006,
          d: 0.14 + dt * 0.35,
          amp: a * tl.amp * 1.8,
        });
        tone(c, o, at, {
          f: p.punch.f1 * 1.2,
          a: 0.004,
          d: 0.12,
          amp: a * 0.3,
        });
      });
    }
}
function gunFar(c, o, t, R, p) {
  const f = p.far || {},
    tl = p.tail,
    j = (x, a = 0.1) => x * (1 + (R() - 0.5) * 2 * a);
  const dull = F(c, "lowpass", f.lp ?? 1800, 0.7);
  dull.connect(o);
  nwave(c, dull, t, p.crack.amp * 0.3, p.crack.nw * 1.6); // crack, low-passed by air
  burst(c, dull, t, {
    type: "bandpass",
    f: 1100,
    Q: 0.8,
    a: 0.0008,
    d: 0.02,
    amp: p.crack.amp * 0.5,
  });
  tone(c, o, t, {
    f: p.punch.f0 * 0.8,
    f2: p.punch.f1,
    sw: 0.1,
    a: 0.002,
    d: p.punch.dec * 1.4,
    amp: p.punch.amp * 0.45,
  }); // soft thump
  burst(c, dull, t, {
    k: "p",
    type: "lowpass",
    f: 700,
    a: 0.002,
    d: 0.12,
    amp: 0.8,
  });
  const dur = f.dur ?? tl.dur * 1.6;
  burst(c, o, t + 0.01, {
    k: "b",
    type: "lowpass",
    f: 480,
    f2: 140,
    Q: 0.5,
    a: 0.06,
    d: j(dur),
    amp: tl.amp * 1.6,
    sweep: dur,
  });
  const echoes = tl.echoes || [
    [0.2, 0.35],
    [0.45, 0.2],
  ];
  for (const [dt, a] of echoes) {
    const at = t + j(dt * 1.3);
    later(c, at, () =>
      burst(c, o, at, {
        k: "p",
        type: "lowpass",
        f: 520,
        Q: 0.6,
        a: 0.01,
        d: 0.25 + dt * 0.4,
        amp: a * 1.1,
      }),
    );
  }
}
function gunMech(c, o, t, R, p) {
  // full-auto mechanism / belt rattle
  const m = p.mech;
  for (let i = 0; i < m.n; i++) {
    const at = t + rr(R, 0, m.span),
      f = rr(R, m.f * 0.8, m.f * 1.3);
    if (R() < 0.55) clk(c, o, at, rr(R, 0.3, 1) * m.amp, f, 0.02);
    else
      burst(c, o, at, {
        type: "bandpass",
        f,
        Q: 5,
        a: 0.0003,
        d: rr(R, 0.004, 0.012),
        amp: rr(R, 0.3, 1) * m.amp,
      });
  }
  if (m.thunk)
    tone(c, o, t + rr(R, 0, 0.01), {
      f: m.thunk,
      f2: m.thunk * 0.7,
      a: 0.0006,
      d: 0.03,
      amp: m.amp * 0.6,
    });
}

const GUNS = {
  shot_pistol: {
    // M1911: snappy .45 bark, slide cycle
    core: 0.32,
    loud: -9,
    n: 5,
    auto: false,
    crack: { amp: 0.8, nw: 0.0005, hp: 2500, nd: 0.004 },
    drive: 4,
    punch: { f0: 105, f1: 48, dec: 0.09, amp: 1 },
    body: [
      { f: 1000, Q: 0.9, dec: 0.06, amp: 0.95 },
      { type: "lowpass", f: 600, dec: 0.08, amp: 0.45 },
    ],
    ring: { f: 2400, dec: 0.03, amp: 0.35 },
    act: [
      [0.013, "clack", 2600, 0.32, 420],
      [0.043, "clk", 3300, 0.22],
    ],
    tail: { dur: 0.9, lp: 1400, amp: 0.35, slap: 0.5, slapF: 1300 },
    tailLoud: -20,
  },
  shot_rifle: {
    // Kar98k: massive crack + long rolling tail
    core: 0.45,
    loud: -7,
    n: 4,
    auto: false,
    crack: { amp: 1.3, nw: 0.001, hp: 1800, nd: 0.008 },
    drive: 5,
    punch: { f0: 78, f1: 34, dec: 0.2, amp: 1.3 },
    body: [
      { f: 700, Q: 0.5, dec: 0.12, amp: 1.1 },
      { type: "lowpass", f: 350, dec: 0.25, amp: 0.9 },
    ],
    ring: { f: 1500, dec: 0.05, amp: 0.3 },
    tail: {
      dur: 2.2,
      lp: 900,
      amp: 0.55,
      slap: 0.7,
      slapF: 1100,
      slapSpan: 0.09,
      boom: 0.4,
      echoes: [
        [0.18, 0.5],
        [0.42, 0.3],
        [0.75, 0.18],
        [1.1, 0.1],
      ],
    },
    tailLoud: -15,
    far: { dur: 3.0, lp: 1500 },
  },
  shot_shotgun: {
    // Trench gun: huge wide boom
    core: 0.5,
    loud: -7,
    n: 4,
    auto: false,
    crack: { amp: 0.8, nw: 0.0014, hp: 1200, nd: 0.012 },
    drive: 4.5,
    punch: { f0: 68, f1: 30, dec: 0.26, amp: 1.5 },
    body: [
      { type: "lowpass", f: 2200, f2: 500, dec: 0.18, amp: 1.3 },
      { f: 450, Q: 0.6, dec: 0.2, amp: 0.9 },
    ],
    tail: {
      dur: 1.6,
      lp: 1000,
      amp: 0.55,
      slap: 0.75,
      slapF: 900,
      slapSpan: 0.085,
      boom: 0.5,
      echoes: [
        [0.15, 0.4],
        [0.36, 0.2],
      ],
    },
    tailLoud: -15,
    far: { dur: 2.4, lp: 1200 },
  },
  shot_smg: {
    // MP40: tight 9 mm, open-bolt chug
    core: 0.2,
    loud: -10,
    n: 6,
    auto: true,
    crack: { amp: 0.7, nw: 0.0006, hp: 2800, nd: 0.004 },
    drive: 3.5,
    punch: { f0: 118, f1: 55, dec: 0.06, amp: 0.9 },
    body: [{ f: 1500, Q: 1, dec: 0.04, amp: 0.8 }],
    ring: { f: 2900, dec: 0.02, amp: 0.3 },
    act: [[0.03, "clack", 1900, 0.42, 220]],
    mech: { n: 3, span: 0.05, f: 2600, amp: 0.35, thunk: 190 },
    tail: { dur: 0.55, lp: 1500, amp: 0.3, slap: 0.4, slapF: 1500 },
    tailLoud: -24,
  },
  shot_smg2: {
    // Thompson: heavier .45 chug
    core: 0.22,
    loud: -9.5,
    n: 6,
    auto: true,
    crack: { amp: 0.75, nw: 0.0006, hp: 2300, nd: 0.005 },
    drive: 3.8,
    punch: { f0: 98, f1: 45, dec: 0.075, amp: 1.1 },
    body: [
      { f: 1050, Q: 0.9, dec: 0.055, amp: 1 },
      { type: "lowpass", f: 550, dec: 0.07, amp: 0.4 },
    ],
    ring: { f: 2100, dec: 0.025, amp: 0.3 },
    act: [[0.026, "clack", 1600, 0.5, 170]],
    mech: { n: 3, span: 0.05, f: 2100, amp: 0.4, thunk: 160 },
    tail: { dur: 0.65, lp: 1250, amp: 0.32, slap: 0.45, slapF: 1250 },
    tailLoud: -23,
  },
  shot_assault: {
    // StG44: sharp mid-weight crack
    core: 0.28,
    loud: -8.5,
    n: 6,
    auto: true,
    crack: { amp: 1.0, nw: 0.0008, hp: 2100, nd: 0.006 },
    drive: 4.5,
    punch: { f0: 92, f1: 42, dec: 0.1, amp: 1.1 },
    body: [
      { f: 1200, Q: 0.8, dec: 0.07, amp: 0.9 },
      { type: "lowpass", f: 500, dec: 0.12, amp: 0.5 },
    ],
    ring: { f: 1800, dec: 0.03, amp: 0.3 },
    act: [[0.022, "clack", 2200, 0.33, 260]],
    mech: { n: 2, span: 0.04, f: 2800, amp: 0.3, thunk: 230 },
    tail: {
      dur: 1.0,
      lp: 1100,
      amp: 0.4,
      slap: 0.55,
      slapF: 1200,
      echoes: [[0.2, 0.25]],
    },
    tailLoud: -20,
  },
  shot_lmg: {
    // MG42: 1200 rpm tearing buzz — short core that stacks
    core: 0.1,
    loud: -11.5,
    n: 8,
    auto: true,
    crack: { amp: 1.0, nw: 0.0007, hp: 3000, nd: 0.003 },
    drive: 6,
    punch: { f0: 100, f1: 55, dec: 0.04, amp: 1 },
    body: [
      { f: 1900, Q: 1.3, dec: 0.03, amp: 1 },
      { f: 900, Q: 1, dec: 0.035, amp: 0.6 },
    ],
    ring: { f: 3200, dec: 0.015, amp: 0.3 },
    mech: { n: 4, span: 0.03, f: 3400, amp: 0.4, thunk: 260 },
    tail: {
      dur: 0.45,
      lp: 1600,
      amp: 0.25,
      slap: 0.35,
      slapF: 1600,
      taps: 5,
      slapSpan: 0.05,
    },
    tailLoud: -27,
  },
  shot_aether: {
    // Aether pistol: sci-fi core, ethereal tail
    core: 1.3,
    loud: -9,
    n: 3,
    auto: false,
    custom: true,
    crack: { amp: 0.5, nw: 0.0006 },
    punch: { f0: 220, f1: 38, dec: 0.35, amp: 1.1 },
    tail: { dur: 1.2, lp: 2200, amp: 0.3, slap: 0.3, slapF: 2600 },
    tailLoud: -21,
  },
};
function aetherCore(c, o, t, R) {
  const s = O(c, "sawtooth", rr(R, 2200, 2800), t, 0.45);
  s.frequency.setValueAtTime(rr(R, 2200, 2800), t);
  s.frequency.exponentialRampToValueAtTime(rr(R, 150, 220), t + 0.3);
  const bp = F(c, "bandpass", 3500, 2);
  bp.frequency.setValueAtTime(3500, t);
  bp.frequency.exponentialRampToValueAtTime(400, t + 0.3);
  const g = G(c, 0);
  AD(g.gain, t, 0.002, 0.35, 0.9);
  ch(s, bp, g, o);
  const car = O(c, "sine", 900, t, 0.55),
    mod = O(c, "sine", rr(R, 70, 110), t, 0.55),
    md = G(c, 500);
  mod.connect(md);
  md.connect(car.frequency);
  car.frequency.setValueAtTime(900, t);
  car.frequency.exponentialRampToValueAtTime(120, t + 0.45);
  const cg = G(c, 0);
  AD(cg.gain, t, 0.005, 0.45, 0.5);
  ch(car, cg, o);
  thump(c, o, t, 220, 38, 0.4, 1.1);
  burst(c, o, t, { type: "highpass", f: 3000, a: 0.0005, d: 0.08, amp: 0.6 });
  const nz = NS(c, t, 0.9, "w"),
    sbp = F(c, "bandpass", 5000, 1.2),
    sg = G(c, 0),
    am = G(c, 0),
    sq = O(c, "square", rr(R, 55, 75), t, 0.9),
    sqg = G(c, 0.5);
  ch(sq, sqg, am.gain);
  ch(nz, sbp, am, sg, o);
  AD(sg.gain, t + 0.03, 0.02, 0.8, 0.35);
  for (let i = 0; i < 6; i++)
    ping(c, o, t + rr(R, 0.02, 0.35), rr(R, 3000, 7000), 0.08, 0.07);
}
for (const [name, g] of Object.entries(GUNS)) {
  def(
    name,
    {
      n: g.n,
      dur: g.core,
      rev: 0.1,
      cap: g.auto ? 10 : 6,
      jit: 0.03,
      ref: 6,
      roll: 0.9,
      loud: g.loud,
      soft: 2.2,
      gun: true,
      auto: g.auto,
    },
    g.custom
      ? (c, o, t, R) => aetherCore(c, o, t, R)
      : (c, o, t, R) => gunCore(c, o, t, R, g),
  );
  def(
    name + ":tail",
    {
      n: 3,
      dur: g.tail.dur + 0.2,
      rev: 0,
      cap: g.auto ? 12 : 6,
      jit: 0.02,
      loud: g.tailLoud,
      layer: true,
    },
    (c, o, t, R) => gunTail(c, o, t, R, g),
  );
  def(
    name + ":far",
    {
      n: 3,
      dur: (g.far?.dur ?? g.tail.dur * 1.6) + 0.3,
      rev: 0,
      cap: g.auto ? 8 : 5,
      jit: 0.03,
      loud: g.loud + 1,
      soft: 3,
      layer: true,
    },
    (c, o, t, R) => gunFar(c, o, t, R, g),
  );
  if (g.mech)
    def(
      name + ":mech",
      {
        n: 6,
        dur: 0.1,
        rev: 0,
        cap: 8,
        jit: 0.05,
        loud: g.loud - 16,
        layer: true,
      },
      (c, o, t, R) => gunMech(c, o, t, R, g),
    );
}
def("shot_upgraded", { n: 4, dur: 0.8, rev: 0.3, ref: 5 }, (c, o, t, R) => {
  // electric / ethereal sweetener
  for (let i = 0; i < 9; i++)
    burst(c, o, t + rr(R, 0, 0.22) * rr(R, 0.3, 1), {
      type: "bandpass",
      f: rr(R, 2000, 7000),
      Q: rr(R, 3, 8),
      a: 0.0005,
      d: rr(R, 0.01, 0.05),
      amp: rr(R, 0.4, 1),
    });
  const sq = O(c, "square", rr(R, 55, 70), t, 0.4),
    hp = F(c, "highpass", 800),
    g = G(c, 0);
  AD(g.gain, t, 0.002, 0.3, 0.3);
  ch(sq, hp, sat(c, 4), g, o);
  tone(c, o, t, {
    f: rr(R, 3800, 4600),
    f2: 700,
    sw: 0.18,
    a: 0.001,
    d: 0.2,
    amp: 0.3,
  });
  // ethereal shimmer: detuned glassy partials that bloom and fade
  const base = rr(R, 1100, 1500);
  for (const [r, a] of [
    [1, 0.25],
    [1.004, 0.2],
    [1.5, 0.15],
    [2.01, 0.12],
    [2.99, 0.06],
  ])
    tone(c, o, t + 0.01, { f: base * r, a: 0.03, d: 0.6, amp: a });
  tone(c, o, t, {
    type: "triangle",
    f: 180,
    f2: 50,
    a: 0.001,
    d: 0.2,
    amp: 0.5,
  });
});

// ── mechanical foley ──
def("dryfire", { n: 4, dur: 0.25, rev: 0.12 }, (c, o, t, R) => {
  // hammer / striker falling on an empty chamber: sharp click, hollow receiver ring, trigger reset tick
  clk(c, o, t, 1, rr(R, 2700, 3300), 0.03);
  tone(c, o, t, { f: rr(R, 1050, 1250), a: 0.0004, d: 0.045, amp: 0.35 });
  tone(c, o, t, { f: rr(R, 2250, 2500), a: 0.0004, d: 0.03, amp: 0.2 });
  tone(c, o, t, { f: 380, f2: 220, a: 0.0005, d: 0.035, amp: 0.45 });
  clk(c, o, t + rr(R, 0.06, 0.09), 0.35, rr(R, 3800, 4600), 0.015);
});
def("mag_out", { n: 4, dur: 0.45, rev: 0.12, peak: 0.75 }, (c, o, t, R) => {
  clk(c, o, t, 0.8, rr(R, 2800, 3600), 0.03);
  scrape(
    c,
    o,
    t + 0.015,
    rr(R, 0.07, 0.11),
    { f: 1800, f2: 1200, Q: 2.5, amp: 0.5 },
    R,
  );
  clack(c, o, t + rr(R, 0.1, 0.14), 0.5, rr(R, 1600, 2200), 220);
});
def("mag_in", { n: 4, dur: 0.45, rev: 0.12, peak: 0.8 }, (c, o, t, R) => {
  scrape(
    c,
    o,
    t,
    rr(R, 0.08, 0.12),
    { f: 1300, f2: 2100, Q: 2.5, amp: 0.45 },
    R,
  );
  const at = t + rr(R, 0.1, 0.13);
  clack(c, o, at, 1, rr(R, 2200, 2800), 180);
  clk(c, o, at + rr(R, 0.025, 0.04), 0.7, rr(R, 3400, 4200));
});
def("bolt_back", { n: 4, dur: 0.4, rev: 0.12, peak: 0.8 }, (c, o, t, R) => {
  clk(c, o, t, 0.9, rr(R, 2400, 2900), 0.03);
  scrape(
    c,
    o,
    t + 0.02,
    rr(R, 0.1, 0.14),
    { f: 2800, f2: 2000, Q: 3, amp: 0.55, rough: 0.8 },
    R,
  );
  clack(c, o, t + rr(R, 0.13, 0.16), 0.9, rr(R, 1800, 2300), 300);
});
def("bolt_forward", { n: 4, dur: 0.4, rev: 0.12, peak: 0.85 }, (c, o, t, R) => {
  scrape(
    c,
    o,
    t,
    rr(R, 0.08, 0.11),
    { f: 2000, f2: 2900, Q: 3, amp: 0.5, rough: 0.8 },
    R,
  );
  const at = t + rr(R, 0.09, 0.12);
  clack(c, o, at, 1.1, rr(R, 1700, 2100), 240);
  clk(c, o, at + rr(R, 0.05, 0.08), 0.8, rr(R, 3000, 3600));
});
def(
  "slide_release",
  { n: 4, dur: 0.35, rev: 0.15, peak: 0.85 },
  (c, o, t, R) => {
    clk(c, o, t, 0.5, 4200, 0.02);
    const at = t + rr(R, 0.03, 0.045);
    clack(c, o, at, 1.2, rr(R, 1700, 2000), 330);
    ping(c, o, at, rr(R, 3300, 3700), 0.09, 0.25);
  },
);
def("pump", { n: 4, dur: 0.55, rev: 0.15, peak: 0.85 }, (c, o, t, R) => {
  scrape(c, o, t, 0.08, { f: 1100, f2: 700, Q: 2, amp: 0.55, k: "p" }, R);
  clack(c, o, t + 0.08, 1, rr(R, 1400, 1700), 170);
  const t2 = t + rr(R, 0.19, 0.24);
  scrape(c, o, t2, 0.07, { f: 700, f2: 1200, Q: 2, amp: 0.5, k: "p" }, R);
  clack(c, o, t2 + 0.07, 1.1, rr(R, 1500, 1900), 200);
});
def("shell_insert", { n: 4, dur: 0.3, rev: 0.12, peak: 0.7 }, (c, o, t, R) => {
  scrape(c, o, t, 0.06, { f: 1500, f2: 900, Q: 2, amp: 0.4 }, R);
  clack(c, o, t + rr(R, 0.05, 0.07), 0.6, rr(R, 2000, 2500), 350);
  ping(c, o, t + 0.06, rr(R, 4500, 5200), 0.05, 0.12);
});
def("weapon_raise", { n: 4, dur: 0.5, rev: 0.1, peak: 0.6 }, (c, o, t, R) => {
  burst(c, o, t, {
    k: "p",
    type: "bandpass",
    f: 900,
    f2: 1800,
    Q: 0.8,
    a: 0.08,
    d: 0.2,
    amp: 0.5,
  });
  for (let i = 0; i < 3; i++)
    clk(c, o, t + rr(R, 0.05, 0.3), rr(R, 0.15, 0.35), rr(R, 2500, 5000), 0.02);
  clack(c, o, t + rr(R, 0.25, 0.32), 0.45, 2200, 260);
});
def("weapon_swap", { n: 4, dur: 0.5, rev: 0.1, peak: 0.6 }, (c, o, t, R) => {
  burst(c, o, t, {
    k: "p",
    type: "bandpass",
    f: 1400,
    f2: 700,
    Q: 0.8,
    a: 0.05,
    d: 0.18,
    amp: 0.5,
  });
  for (let i = 0; i < 4; i++)
    clk(c, o, t + rr(R, 0.02, 0.3), rr(R, 0.15, 0.3), rr(R, 2500, 5000), 0.02);
});
function whoosh(c, o, t, d, f1, f2, amp, k = "p") {
  const n = NS(c, t, d + 0.05, k),
    bp = F(c, "bandpass", f1, 1.2),
    g = G(c, 0);
  bp.frequency.setValueAtTime(f1, t);
  bp.frequency.exponentialRampToValueAtTime(f2, t + d * 0.5);
  bp.frequency.exponentialRampToValueAtTime(f1 * 0.8, t + d);
  E(g.gain, t, 0, [
    [d * 0.45, amp],
    [d * 0.55, 0],
  ]);
  ch(n, bp, g, o);
}
def("knife_swing", { n: 4, dur: 0.35, rev: 0.1, peak: 0.7 }, (c, o, t, R) => {
  whoosh(c, o, t, rr(R, 0.18, 0.25), 600, rr(R, 2200, 3000), 1, "w");
});
def("knife_miss", { n: 4, dur: 0.3, rev: 0.1, peak: 0.55 }, (c, o, t, R) => {
  whoosh(c, o, t, rr(R, 0.15, 0.2), 700, rr(R, 1800, 2500), 1, "w");
});
def("knife_hit", { n: 5, dur: 0.45, rev: 0.12, peak: 0.9 }, (c, o, t, R) => {
  whoosh(c, o, t, 0.08, 800, 2000, 0.3, "w");
  const at = t + 0.06;
  thump(c, o, at, rr(R, 130, 160), 60, 0.12, 1);
  const nz = NS(c, at, 0.25, "p"),
    bp = F(c, "bandpass", 600, 3),
    g = G(c, 0);
  bp.frequency.setValueCurveAtTime(
    curveOf(24, (x) => 400 + 500 * Math.abs(Math.sin(x * rr(R, 12, 20)))),
    at,
    0.2,
  );
  AD(g.gain, at, 0.004, 0.2, 0.9);
  ch(nz, bp, g, o);
  for (let i = 0; i < 4; i++)
    burst(c, o, at + rr(R, 0, 0.05), {
      type: "bandpass",
      f: rr(R, 1500, 3000),
      Q: 2,
      a: 0.0005,
      d: 0.01,
      amp: 0.4,
    });
});
def("grenade_pin", { n: 3, dur: 0.45, rev: 0.12, peak: 0.7 }, (c, o, t, R) => {
  scrape(c, o, t, 0.06, { f: 3500, Q: 4, amp: 0.4 }, R);
  ping(c, o, t + 0.06, rr(R, 3000, 3400), 0.25, 0.6);
  clk(c, o, t + 0.07, 0.4, 4500);
});
def("grenade_throw", { n: 3, dur: 0.45, rev: 0.1, peak: 0.6 }, (c, o, t, R) => {
  whoosh(c, o, t, 0.3, 400, 1400, 1);
  whoosh(c, o, t + 0.05, 0.25, 900, 2400, 0.4, "w");
});
def(
  "grenade_bounce",
  { n: 4, dur: 0.4, rev: 0.25, peak: 0.8, ref: 3 },
  (c, o, t, R) => {
    thump(c, o, t, rr(R, 180, 240), 90, 0.06, 0.8);
    ping(c, o, t, rr(R, 1000, 1300), 0.12, 0.5);
    ping(c, o, t, rr(R, 2300, 2700), 0.08, 0.3);
    burst(c, o, t, {
      type: "bandpass",
      f: 2500,
      Q: 1,
      a: 0.0005,
      d: 0.02,
      amp: 0.4,
    });
  },
);
def(
  "explosion",
  { n: 4, dur: 3.4, rev: 0.6, peak: 0.95, cap: 4, ref: 8, roll: 0.7 },
  (c, o, t, R) => {
    const bus = G(c, 1);
    ch(bus, sat(c, 3), o);
    const cs = c.createConstantSource();
    cs.offset.value = 0;
    cs.offset.setValueAtTime(0, t);
    cs.offset.linearRampToValueAtTime(1, t + 0.0005);
    cs.offset.linearRampToValueAtTime(-0.8, t + 0.003);
    cs.offset.linearRampToValueAtTime(0, t + 0.005);
    cs.start(t);
    cs.stop(t + 0.02);
    cs.connect(bus);
    burst(c, bus, t, { type: "highpass", f: 1500, a: 0.0003, d: 0.03, amp: 1 });
    thump(c, bus, t, rr(R, 75, 90), 24, 0.7, 1.6);
    burst(c, bus, t, {
      k: "p",
      type: "lowpass",
      f: 1400,
      f2: 200,
      Q: 0.7,
      a: 0.002,
      d: 0.7,
      amp: 1.4,
      sweep: 0.5,
    });
    burst(c, o, t + 0.02, {
      k: "b",
      type: "lowpass",
      f: 260,
      f2: 70,
      Q: 0.6,
      a: 0.08,
      d: 2.8,
      amp: 0.9,
      sweep: 2.5,
    });
    for (let i = 0; i < 26; i++) {
      const at = t + 0.15 + Math.pow(R(), 1.6) * 1.8,
        q = [R(), R(), R(), R(), R()];
      later(c, at, () => {
        if (q[0] < 0.5)
          burst(c, o, at, {
            type: "bandpass",
            f: 1500 + 3500 * q[1],
            Q: 3,
            a: 0.0005,
            d: 0.01 + 0.02 * q[2],
            amp: 0.05 + 0.15 * q[3],
          });
        else
          thump(
            c,
            o,
            at,
            120 + 280 * q[1],
            60 + 60 * q[2],
            0.03 + 0.03 * q[3],
            0.05 + 0.15 * q[4],
          );
      });
    }
  },
);
def("aether_impact", { n: 4, dur: 1.2, rev: 0.4, ref: 5 }, (c, o, t, R) => {
  thump(c, o, t, 160, 35, 0.5, 1.2);
  const s = O(c, "sawtooth", 300, t, 0.6),
    bp = F(c, "bandpass", 1200, 3),
    g = G(c, 0);
  s.frequency.setValueAtTime(300, t);
  s.frequency.exponentialRampToValueAtTime(1800, t + 0.08);
  s.frequency.exponentialRampToValueAtTime(200, t + 0.5);
  bp.frequency.setValueAtTime(800, t);
  bp.frequency.exponentialRampToValueAtTime(4000, t + 0.08);
  bp.frequency.exponentialRampToValueAtTime(500, t + 0.5);
  AD(g.gain, t, 0.003, 0.5, 0.6);
  ch(s, bp, g, o);
  burst(c, o, t, { type: "highpass", f: 2500, a: 0.001, d: 0.25, amp: 0.6 });
  for (let i = 0; i < 10; i++)
    ping(c, o, t + rr(R, 0.02, 0.6), rr(R, 3000, 8000), 0.06, 0.08);
});

// ── hits / impacts ──
def(
  "hitmarker",
  { n: 3, dur: 0.12, rev: 0, peak: 0.55, cap: 4, jit: 0.02 },
  (c, o, t, R) => {
    tone(c, o, t, {
      type: "triangle",
      f: rr(R, 2050, 2150),
      a: 0.0005,
      d: 0.035,
      amp: 1,
    });
    clk(c, o, t, 0.4, 5000, 0.01);
  },
);
def(
  "hitmarker_kill",
  { n: 3, dur: 0.2, rev: 0, peak: 0.65, cap: 4, jit: 0.02 },
  (c, o, t, R) => {
    tone(c, o, t, { type: "triangle", f: 1800, a: 0.0005, d: 0.05, amp: 1 });
    tone(c, o, t + 0.045, {
      type: "triangle",
      f: 2400,
      a: 0.0005,
      d: 0.06,
      amp: 0.8,
    });
    thump(c, o, t, 200, 90, 0.05, 0.5);
  },
);
def(
  "headshot",
  { n: 4, dur: 0.5, rev: 0.15, peak: 0.85, ref: 3 },
  (c, o, t, R) => {
    burst(c, o, t, { type: "highpass", f: 2500, a: 0.0003, d: 0.012, amp: 1 });
    for (let i = 0; i < 5; i++)
      burst(c, o, t + rr(R, 0, 0.03), {
        type: "bandpass",
        f: rr(R, 1200, 3500),
        Q: 4,
        a: 0.0003,
        d: 0.012,
        amp: 0.6,
      });
    thump(c, o, t, 180, 70, 0.08, 0.8);
    const nz = NS(c, t + 0.01, 0.3, "p"),
      bp = F(c, "bandpass", 700, 2.5),
      g = G(c, 0);
    bp.frequency.setValueAtTime(1200, t + 0.01);
    bp.frequency.exponentialRampToValueAtTime(300, t + 0.25);
    AD(g.gain, t + 0.01, 0.005, 0.25, 0.8);
    ch(nz, bp, g, o);
    ping(c, o, t + 0.005, 2600, 0.05, 0.25);
  },
);
def(
  "flesh_impact",
  { n: 6, dur: 0.35, rev: 0.12, peak: 0.8, ref: 2.5, cap: 6 },
  (c, o, t, R) => {
    thump(c, o, t, rr(R, 90, 130), 50, 0.1, 1);
    burst(c, o, t, {
      k: "p",
      type: "lowpass",
      f: rr(R, 800, 1400),
      a: 0.001,
      d: 0.06,
      amp: 0.8,
    });
    const nz = NS(c, t + 0.005, 0.25, "w"),
      bp = F(c, "bandpass", 500, 4),
      g = G(c, 0);
    bp.frequency.setValueCurveAtTime(
      curveOf(16, (x) => 350 + 450 * Math.abs(Math.sin(x * rr(R, 8, 14)))),
      t + 0.005,
      0.18,
    );
    AD(g.gain, t + 0.005, 0.003, 0.18, 0.5);
    ch(nz, bp, g, o);
  },
);
def(
  "bullet_concrete",
  { n: 6, dur: 0.45, rev: 0.25, peak: 0.75, ref: 2, cap: 6 },
  (c, o, t, R) => {
    burst(c, o, t, {
      type: "highpass",
      f: rr(R, 2500, 3500),
      a: 0.0003,
      d: 0.02,
      amp: 1,
    });
    thump(c, o, t, rr(R, 400, 600), 200, 0.03, 0.5);
    burst(c, o, t + 0.005, {
      k: "p",
      type: "bandpass",
      f: 1500,
      f2: 600,
      Q: 0.8,
      a: 0.003,
      d: 0.12,
      amp: 0.4,
    });
    for (let i = 0; i < 7; i++)
      burst(c, o, t + rr(R, 0.03, 0.3), {
        type: "bandpass",
        f: rr(R, 2000, 5000),
        Q: 3,
        a: 0.0005,
        d: 0.008,
        amp: rr(R, 0.05, 0.2),
      });
  },
);
def(
  "bullet_wood",
  { n: 6, dur: 0.4, rev: 0.2, peak: 0.75, ref: 2, cap: 6 },
  (c, o, t, R) => {
    burst(c, o, t, { type: "highpass", f: 2000, a: 0.0003, d: 0.01, amp: 0.6 });
    const f = rr(R, 420, 560);
    burst(c, o, t, { type: "bandpass", f, Q: 6, a: 0.0005, d: 0.08, amp: 1.2 });
    burst(c, o, t, {
      type: "bandpass",
      f: f * 2.2,
      Q: 6,
      a: 0.0005,
      d: 0.05,
      amp: 0.5,
    });
    thump(c, o, t, 220, 120, 0.05, 0.5);
    for (let i = 0; i < 8; i++)
      burst(c, o, t + rr(R, 0.005, 0.12), {
        type: "bandpass",
        f: rr(R, 2500, 4500),
        Q: 4,
        a: 0.0003,
        d: 0.006,
        amp: rr(R, 0.1, 0.3),
      });
  },
);
def(
  "bullet_metal",
  { n: 6, dur: 0.8, rev: 0.25, peak: 0.75, ref: 2, cap: 6 },
  (c, o, t, R) => {
    clk(c, o, t, 1, rr(R, 3000, 4000), 0.05);
    ping(c, o, t, rr(R, 900, 1400), 0.25, 0.5);
    if (R() < 0.6) {
      const f = rr(R, 2600, 4200);
      tone(c, o, t + 0.01, {
        f,
        f2: f * rr(R, 0.55, 0.75),
        sw: 0.45,
        a: 0.01,
        d: 0.5,
        amp: 0.35,
      });
    }
  },
);
def(
  "shell_drop",
  { n: 8, dur: 0.8, rev: 0.12, peak: 0.55, ref: 1.5, cap: 6, jit: 0.06 },
  (c, o, t, R) => {
    const f = rr(R, 3800, 5600);
    let at = t,
      amp = 0.9,
      gap = rr(R, 0.11, 0.16);
    const bounces = 3 + Math.floor(R() * 3);
    for (let i = 0; i < bounces; i++) {
      ping(c, o, at, f * rr(R, 0.97, 1.03), 0.12 * amp + 0.02, amp * 0.6);
      ping(c, o, at, f * 1.62, 0.05, amp * 0.3);
      burst(c, o, at, {
        type: "highpass",
        f: 3000,
        a: 0.0003,
        d: 0.003,
        amp: amp * 0.3,
      });
      at += gap;
      gap *= rr(R, 0.55, 0.75);
      amp *= rr(R, 0.5, 0.7);
    }
  },
);

// ── zombies (formant voice) ──
const ZV = ["u", "o", "uh", "a", "er", "ae", "oo"];
function vowSeq(R, nv, set = ZV) {
  const v = [];
  for (let i = 0; i < nv; i++)
    v.push([nv === 1 ? 0 : i / (nv - 1), pick(R, set)]);
  if (nv === 1) v.push([1, v[0][1]]);
  return v;
}
def(
  "zombie_groan",
  { n: 12, dur: 2.8, rev: 0.3, vol: 0.8, cap: 6, jit: 0.07, ref: 2, roll: 1.2 },
  (c, o, t, R) => {
    const d = rr(R, 1.1, 2.6),
      b = rr(R, 58, 118),
      shape = Math.floor(R() * 3);
    const f0 =
      shape === 0
        ? [
            [0, b * 0.9],
            [0.3, b * 1.15],
            [1, b * 0.7],
          ]
        : shape === 1
          ? [
              [0, b * 1.2],
              [0.5, b],
              [1, b * 0.6],
            ]
          : [
              [0, b],
              [0.25, b * 1.3],
              [0.5, b * 0.9],
              [0.75, b * 1.1],
              [1, b * 0.65],
            ];
    voice(c, o, t, R, {
      dur: d,
      f0,
      vow: vowSeq(R, 2 + Math.floor(R() * 3)),
      fscale: rr(R, 0.7, 0.88),
      bw: rr(R, 1.3, 2.2),
      jitter: rr(R, 0.03, 0.09),
      rasp: rr(R, 0.25, 0.7),
      fry: rr(R, 0.15, 0.7),
      breath: rr(R, 0.05, 0.2),
      trem: [rr(R, 3, 9), rr(R, 0.15, 0.5)],
      drive: rr(R, 1.5, 4),
      env: [
        [0, 0],
        [rr(R, 0.08, 0.2), 1],
        [0.6, 0.8],
        [1, 0],
      ],
    });
    if (R() < 0.4)
      burst(c, o, t, {
        k: "p",
        type: "bandpass",
        f: 1200,
        Q: 1.2,
        a: 0.15,
        d: 0.25,
        amp: 0.15,
      });
  },
);
def(
  "zombie_growl",
  {
    n: 8,
    dur: 1.5,
    rev: 0.25,
    vol: 0.85,
    cap: 5,
    jit: 0.06,
    ref: 2,
    roll: 1.2,
  },
  (c, o, t, R) => {
    const d = rr(R, 0.6, 1.3),
      b = rr(R, 45, 75);
    voice(c, o, t, R, {
      dur: d,
      f0: [
        [0, b],
        [0.4, b * rr(R, 1.1, 1.4)],
        [1, b * 0.8],
      ],
      vow: vowSeq(R, 2, ["o", "uh", "er", "oo"]),
      fscale: rr(R, 0.68, 0.8),
      bw: 2,
      jitter: rr(R, 0.06, 0.12),
      rasp: rr(R, 0.5, 0.9),
      fry: rr(R, 0.6, 0.9),
      breath: 0.1,
      trem: [rr(R, 12, 25), 0.45],
      drive: rr(R, 4, 6),
      env: [
        [0, 0],
        [0.1, 1],
        [0.7, 0.9],
        [1, 0],
      ],
    });
  },
);
def(
  "zombie_scream",
  { n: 6, dur: 1.7, rev: 0.4, vol: 0.85, cap: 3, jit: 0.05, ref: 3, roll: 1 },
  (c, o, t, R) => {
    const d = rr(R, 0.8, 1.5),
      b = rr(R, 260, 480);
    const sp = {
      dur: d,
      f0: [
        [0, b * 0.7],
        [0.2, b * 1.2],
        [0.7, b],
        [1, b * 0.6],
      ],
      vow: vowSeq(R, 3, ["a", "ae", "e", "a"]),
      fscale: rr(R, 1, 1.2),
      bw: rr(R, 2, 3),
      jitter: rr(R, 0.08, 0.15),
      rasp: rr(R, 0.6, 1),
      fry: 0.2,
      breath: 0.2,
      trem: [rr(R, 6, 11), 0.3],
      drive: rr(R, 5, 8),
      env: [
        [0, 0],
        [0.12, 1],
        [0.7, 0.8],
        [1, 0],
      ],
    };
    voice(c, o, t, R, sp);
    const g2 = G(c, 0.5);
    g2.connect(o);
    voice(c, g2, t + 0.02, R, {
      ...sp,
      f0: sp.f0.map(([x, v]) => [x, v * 1.06]),
    });
    burst(c, o, t, {
      type: "highpass",
      f: 3000,
      a: 0.1,
      d: d * 0.8,
      amp: 0.15,
    });
  },
);
def(
  "zombie_attack",
  { n: 8, dur: 0.9, rev: 0.2, vol: 0.9, cap: 4, jit: 0.06, ref: 2 },
  (c, o, t, R) => {
    const d = rr(R, 0.35, 0.7),
      b = rr(R, 140, 240);
    voice(c, o, t, R, {
      dur: d,
      f0: [
        [0, b * 0.8],
        [0.2, b * 1.3],
        [1, b * 0.8],
      ],
      vow: [
        [0, "uh"],
        [0.3, "a"],
        [1, "ae"],
      ],
      fscale: rr(R, 0.8, 0.95),
      bw: 2.2,
      jitter: 0.1,
      rasp: 0.8,
      fry: rr(R, 0.3, 0.6),
      breath: 0.15,
      trem: [rr(R, 15, 30), 0.4],
      drive: 6,
      env: [
        [0, 0],
        [0.08, 1],
        [0.7, 0.7],
        [1, 0],
      ],
    });
    for (let i = 0; i < 2; i++)
      clk(c, o, t + d * rr(R, 0.6, 1), 0.35, rr(R, 1200, 1800), 0.015); // teeth gnash
  },
);
def(
  "zombie_death",
  { n: 8, dur: 2.2, rev: 0.3, vol: 0.85, cap: 5, jit: 0.05, ref: 2 },
  (c, o, t, R) => {
    const d = rr(R, 1.2, 1.9),
      b = rr(R, 100, 140);
    voice(c, o, t, R, {
      dur: d,
      f0: [
        [0, b],
        [0.15, b * 1.15],
        [1, rr(R, 35, 45)],
      ],
      vow: [
        [0, "o"],
        [0.5, "u"],
        [1, "uh"],
      ],
      fscale: rr(R, 0.72, 0.85),
      bw: 2,
      jitter: 0.1,
      rasp: 0.5,
      fry: 0.8,
      breath: 0.15,
      trem: [rr(R, 5, 12), 0.5],
      drive: 3,
      env: [
        [0, 0],
        [0.1, 1],
        [0.5, 0.6],
        [1, 0],
      ],
    });
    bubbles(c, o, t + d * 0.3, d * 0.7, 18 + Math.floor(R() * 12), R, {
      amp: 0.25,
    });
    burst(c, o, t + d * 0.8, {
      k: "p",
      type: "bandpass",
      f: 900,
      Q: 1,
      a: 0.1,
      d: 0.35,
      amp: 0.2,
    });
  },
);
def(
  "zombie_spawn",
  { n: 5, dur: 2.0, rev: 0.3, vol: 0.9, cap: 4, ref: 3 },
  (c, o, t, R) => {
    burst(c, o, t, {
      k: "b",
      type: "lowpass",
      f: 320,
      Q: 0.7,
      a: 0.1,
      d: 0.9,
      amp: 1,
    });
    for (let i = 0; i < 16; i++) {
      const at = t + rr(R, 0, 1.0),
        q = [R(), R(), R(), R(), R()];
      later(c, at, () => {
        thump(
          c,
          o,
          at,
          90 + 130 * q[0],
          60,
          0.03 + 0.04 * q[1],
          0.2 + 0.3 * q[2],
        );
        if (q[3] < 0.5)
          burst(c, o, at, {
            type: "bandpass",
            f: 800 + 1200 * q[4],
            Q: 2,
            a: 0.001,
            d: 0.02,
            amp: 0.2,
          });
      });
    }
    const g = G(c, 0.55);
    g.connect(o);
    const vr = rng((R() * 1e9) | 0);
    later(c, t + 0.45, () =>
      voice(c, g, t + 0.45, vr, {
        dur: 1.3,
        f0: [
          [0, 55],
          [0.5, 75],
          [1, 50],
        ],
        vow: [
          [0, "u"],
          [1, "o"],
        ],
        fscale: 0.72,
        bw: 2,
        rasp: 0.5,
        fry: 0.6,
        trem: [5, 0.3],
        drive: 3,
        env: [
          [0, 0],
          [0.3, 1],
          [1, 0],
        ],
      }),
    );
  },
);
def(
  "zombie_footstep",
  {
    n: 8,
    dur: 0.5,
    rev: 0.12,
    vol: 0.6,
    cap: 6,
    jit: 0.08,
    ref: 1.5,
    roll: 1.4,
  },
  (c, o, t, R) => {
    scrape(
      c,
      o,
      t,
      rr(R, 0.18, 0.32),
      { f: rr(R, 500, 800), f2: 350, Q: 0.9, amp: 0.4, k: "p" },
      R,
    );
    const at = t + rr(R, 0.15, 0.28);
    thump(c, o, at, rr(R, 80, 110), 50, 0.08, 0.8);
    burst(c, o, at, {
      k: "p",
      type: "lowpass",
      f: 600,
      a: 0.002,
      d: 0.05,
      amp: 0.4,
    });
  },
);

// ── barricades / world ──
def(
  "plank_tear",
  { n: 5, dur: 1.2, rev: 0.25, cap: 4, ref: 3 },
  (c, o, t, R) => {
    creak(
      c,
      o,
      t,
      rr(R, 0.25, 0.4),
      { f: rr(R, 700, 1000), rate: rr(R, 30, 60), Q: 7, amp: 0.6 },
      R,
    );
    const at = t + rr(R, 0.25, 0.35);
    burst(c, o, at, { type: "highpass", f: 1000, a: 0.0005, d: 0.04, amp: 1 });
    thump(c, o, at, 200, 90, 0.06, 0.6);
    for (let i = 0; i < 16; i++)
      burst(c, o, at + rr(R, 0, 0.3), {
        type: "bandpass",
        f: rr(R, 1800, 4500),
        Q: 3,
        a: 0.0003,
        d: 0.006,
        amp: rr(R, 0.1, 0.45),
      });
    if (R() < 0.7) {
      const s = O(c, "sine", 1400, at - 0.1, 0.25),
        g = G(c, 0);
      s.frequency.setValueAtTime(1500, at - 0.1);
      s.frequency.linearRampToValueAtTime(1050, at + 0.1);
      AD(g.gain, at - 0.1, 0.05, 0.18, 0.12);
      ch(s, g, o);
    }
    const land = at + rr(R, 0.35, 0.5);
    thump(c, o, land, 170, 110, 0.1, 0.6);
    burst(c, o, land, {
      type: "bandpass",
      f: 400,
      Q: 3,
      a: 0.001,
      d: 0.08,
      amp: 0.7,
    });
    burst(c, o, land + 0.13, {
      type: "bandpass",
      f: 520,
      Q: 3,
      a: 0.001,
      d: 0.05,
      amp: 0.3,
    });
  },
);
def(
  "plank_place",
  { n: 5, dur: 0.8, rev: 0.25, cap: 4, ref: 3 },
  (c, o, t, R) => {
    whoosh(c, o, t, 0.12, 500, 1300, 0.3);
    const at = t + 0.12;
    burst(c, o, at, {
      type: "bandpass",
      f: 230,
      Q: 4,
      a: 0.001,
      d: 0.1,
      amp: 1,
    });
    burst(c, o, at, {
      type: "bandpass",
      f: 560,
      Q: 5,
      a: 0.001,
      d: 0.07,
      amp: 0.6,
    });
    for (const dt of [0.3, 0.46]) {
      const h = t + dt + rr(R, -0.02, 0.02);
      clack(c, o, h, 0.7, rr(R, 1800, 2200), 400);
      ping(c, o, h, rr(R, 2400, 2700), 0.05, 0.15);
    }
  },
);
def(
  "plank_rebuild_points",
  { n: 2, dur: 0.6, rev: 0, bus: "ui", peak: 0.5, jit: 0 },
  (c, o, t, R) => {
    tone(c, o, t, { f: 1568, a: 0.002, d: 0.25, amp: 0.7 });
    tone(c, o, t + 0.07, { f: 2093, a: 0.002, d: 0.4, amp: 0.8 });
    tone(c, o, t + 0.07, { f: 4186, a: 0.002, d: 0.15, amp: 0.15 });
  },
);
def(
  "buy",
  { n: 3, dur: 1.2, rev: 0, bus: "ui", peak: 0.75, jit: 0.01 },
  (c, o, t, R) => {
    for (let i = 0; i < 4; i++)
      clk(c, o, t + i * 0.028, 0.6, rr(R, 2500, 3200), 0.02);
    burst(c, o, t + 0.1, {
      k: "p",
      type: "bandpass",
      f: 1200,
      Q: 1,
      a: 0.01,
      d: 0.08,
      amp: 0.4,
    });
    const bt = t + 0.16;
    const f = 1760;
    for (const [r, a, d] of [
      [1, 1, 0.8],
      [2.32, 0.5, 0.5],
      [4.25, 0.25, 0.25],
      [6.63, 0.12, 0.12],
    ])
      tone(c, o, bt, { f: f * r, a: 0.001, d, amp: a * 0.6 });
    for (const [r, a, d] of [
      [1, 1, 0.6],
      [2.32, 0.5, 0.4],
    ])
      tone(c, o, bt + 0.09, { f: f * 1.26 * r, a: 0.001, d, amp: a * 0.5 });
    for (let i = 0; i < 6; i++)
      ping(c, o, bt + rr(R, 0.02, 0.3), rr(R, 5000, 8000), 0.05, 0.08);
  },
);
def(
  "deny",
  { n: 2, dur: 0.5, rev: 0, bus: "ui", peak: 0.6, jit: 0 },
  (c, o, t, R) => {
    const lp = F(c, "lowpass", 1400, 1),
      g = G(c, 0);
    ch(lp, sat(c, 2), g, o);
    O(c, "square", 98, t, 0.4).connect(lp);
    O(c, "square", 104, t, 0.4).connect(lp);
    E(g.gain, t, 0, [
      [0.005, 0.8],
      [0.14, 0.7],
      [0.02, 0.1],
      [0.02, 0.7],
      [0.14, 0.6],
      [0.04, 0],
    ]);
  },
);
def("door_open", { n: 3, dur: 2.6, rev: 0.4, cap: 2, ref: 4 }, (c, o, t, R) => {
  burst(c, o, t, {
    k: "b",
    type: "lowpass",
    f: 500,
    f2: 150,
    Q: 0.7,
    a: 0.1,
    d: 1.8,
    amp: 1,
  });
  for (let i = 0; i < 24; i++) {
    const at = t + Math.pow(R(), 1.3) * 1.6,
      q = [R(), R(), R(), R(), R(), R(), R()];
    later(c, at, () => {
      thump(
        c,
        o,
        at,
        80 + 220 * q[0],
        50 + 40 * q[1],
        0.04 + 0.06 * q[2],
        0.2 + 0.4 * q[3],
      );
      if (q[4] < 0.6)
        burst(c, o, at, {
          type: "bandpass",
          f: 700 + 2300 * q[5],
          Q: 2,
          a: 0.001,
          d: 0.02,
          amp: 0.1 + 0.2 * q[6],
        });
    });
  }
  creak(
    c,
    o,
    t + 0.1,
    0.9,
    { f: 480, f2: 380, rate: 24, rate2: 14, Q: 5, amp: 0.4 },
    R,
  );
  const s = O(c, "sawtooth", 45, t + 0.4, 1.4),
    bp = F(c, "bandpass", 1200, 12),
    g = G(c, 0);
  s.frequency.setValueCurveAtTime(
    curveOf(40, (x) => 45 + 20 * Math.sin(x * 9) + x * 20),
    t + 0.4,
    1.3,
  );
  bp.frequency.setValueAtTime(1100, t + 0.4);
  bp.frequency.linearRampToValueAtTime(1500, t + 1.7);
  E(g.gain, t + 0.4, 0, [
    [0.3, 0.35],
    [0.8, 0.25],
    [0.2, 0],
  ]);
  ch(s, bp, g, o);
});
def(
  "box_open",
  { n: 2, dur: 2.2, rev: 0.35, cap: 2, ref: 4, jit: 0 },
  (c, o, t, R) => {
    creak(
      c,
      o,
      t,
      0.5,
      { f: 800, f2: 1100, rate: 30, rate2: 50, Q: 7, amp: 0.4 },
      R,
    );
    [81, 84, 88, 93, 96].forEach((m, i) =>
      mbox(c, o, t + 0.25 + i * 0.09, mtof(m), 0.35, 1.3, R),
    );
    for (let i = 0; i < 10; i++) {
      const at = t + 0.3 + R() * 1.2,
        f = rr(R, 3500, 7000);
      tone(c, o, at, { f, a: 0.1, d: 0.5, amp: 0.05 });
    }
  },
);
const BOX_TUNE = [
  0, 7, 12, 7, 3, 7, 12, 15, 14, 11, 7, 11, 14, 19, 17, 14, 12, 8, 3, 8, 12, 15,
  20, 15, 19, 15, 12, 11, 12, 7, 3, 0,
];
def(
  "box_spin",
  { n: 1, dur: 5.6, rev: 0.3, cap: 1, ref: 4, jit: 0, peak: 0.8 },
  (c, o, t, R) => {
    let at = t;
    BOX_TUNE.forEach((s, i) => {
      const m = 76 + s,
        tt = at,
        r1 = R(),
        r2 = R();
      later(c, tt, () => {
        mbox(c, o, tt, mtof(m), 0.3, 0.9, () => r1);
        if (i % 4 === 0)
          mbox(
            c,
            o,
            tt,
            mtof(52 + [0, 0, 8, 8, 5, 5, 7, 7][(i / 4) % 8] + 12),
            0.22,
            1.1,
            () => r2,
          );
        burst(c, o, tt, {
          type: "bandpass",
          f: 3000,
          Q: 2,
          a: 0.0003,
          d: 0.004,
          amp: 0.05,
        });
      });
      at += 0.155 * (i > 23 ? 1 + (i - 23) * 0.04 : 1);
    });
  },
);
def("box_close", { n: 3, dur: 0.8, rev: 0.3, cap: 2, ref: 4 }, (c, o, t, R) => {
  creak(c, o, t, 0.2, { f: 900, f2: 700, rate: 40, Q: 6, amp: 0.25 }, R);
  const at = t + 0.2;
  thump(c, o, at, 120, 60, 0.18, 1);
  burst(c, o, at, {
    type: "bandpass",
    f: 320,
    Q: 3,
    a: 0.001,
    d: 0.12,
    amp: 0.8,
  });
  clack(c, o, at + 0.08, 0.5, 2000, 300);
  burst(c, o, at, {
    k: "p",
    type: "lowpass",
    f: 2000,
    a: 0.01,
    d: 0.3,
    amp: 0.2,
  });
});
def(
  "box_bye",
  { n: 2, dur: 3.2, rev: 0.6, cap: 1, ref: 4, jit: 0 },
  (c, o, t, R) => {
    whoosh(c, o, t, 1.2, 300, 900, 0.3);
    const f0s = [175, 168, 158, 145, 125];
    f0s.forEach((f, i) => {
      const at = t + 0.25 + i * 0.26,
        r1 = rng((R() * 1e9) | 0),
        r2 = rng((R() * 1e9) | 0);
      const sp = {
        dur: 0.22,
        f0: [
          [0, f * 1.05],
          [1, f * 0.85],
        ],
        vow: [
          [0, "a"],
          [1, "uh"],
        ],
        fscale: 0.82,
        bw: 1.6,
        jitter: 0.1,
        rasp: 0.5,
        fry: 0.4,
        breath: 0.2,
        drive: 3,
        env: [
          [0, 0],
          [0.15, 1],
          [1, 0],
        ],
      };
      later(c, at, () => {
        burst(c, o, at, {
          k: "w",
          type: "bandpass",
          f: 1400,
          Q: 1,
          a: 0.01,
          d: 0.06,
          amp: 0.25,
        }); // aspirated 'h'
        voice(c, o, at + 0.04, r1, sp);
      });
      later(c, at + 0.34, () => {
        const e = G(c, 0.3);
        e.connect(o);
        voice(c, e, at + 0.34, r2, { ...sp, fscale: 0.8 });
      }); // slap echo
    });
    later(c, t + 1.7, () => bell(c, o, t + 1.7, mtof(41), 1.4, 0.35));
  },
);

// ── power-ups ──
def(
  "powerup_spawn",
  { n: 2, dur: 1.6, rev: 0.4, cap: 2, ref: 4, jit: 0.01 },
  (c, o, t, R) => {
    [84, 88, 91, 96, 100].forEach((m, i) =>
      tone(c, o, t + i * 0.06, { f: mtof(m), a: 0.003, d: 0.9, amp: 0.3 }),
    );
    whoosh(c, o, t, 0.8, 500, 5000, 0.5, "w");
    thump(c, o, t, 110, 55, 0.4, 0.5);
  },
);
def(
  "powerup_loop",
  {
    n: 1,
    dur: 3,
    ch: 1,
    loop: true,
    rev: 0.3,
    cap: 6,
    ref: 3,
    jit: 0,
    peak: 0.6,
  },
  (c, o, t, R) => {
    const d = 4.0;
    for (const [f, a] of [
      [440, 0.4],
      [441.5, 0.3],
      [660, 0.25],
      [662, 0.18],
      [880, 0.12],
    ]) {
      const s = O(c, "sine", f, t, d);
      const g = G(c, a);
      ch(s, g, o);
    }
    const nz = NS(c, t, d, "w"),
      bp = F(c, "bandpass", 4500, 3),
      am = G(c, 0),
      l = O(c, "sine", 3, t, d),
      lg = G(c, 0.05);
    ch(l, lg, am.gain);
    ch(nz, bp, am, o);
  },
);
def("powerup_grab", { n: 2, dur: 1.2, rev: 0.3, jit: 0.01 }, (c, o, t, R) => {
  [88, 93, 100, 105].forEach((m, i) =>
    tone(c, o, t + i * 0.045, { f: mtof(m), a: 0.002, d: 0.6, amp: 0.3 }),
  );
  whoosh(c, o, t, 0.4, 1500, 7000, 0.4, "w");
  thump(c, o, t, 200, 80, 0.15, 0.4);
});
function announce(c, o, t, R, syl, pitch = 92) {
  let at = t;
  syl.forEach(([cons, v, d], i) => {
    const t0 = at,
      r = rng((R() * 1e9) | 0);
    later(c, t0, () => sylNow(c, o, t0, r, cons, v, d, i, pitch));
    at +=
      (cons === "s" ? 0.08 : "ktp".includes(cons) && cons ? 0.035 : 0) +
      d +
      0.04;
  });
}
function sylNow(c, o, at, R, cons, v, d, i, pitch) {
  {
    if (cons === "s")
      (burst(c, o, at, {
        type: "highpass",
        f: 4000,
        a: 0.02,
        d: 0.07,
        amp: 0.25,
      }),
        (at += 0.08));
    else if (cons && "ktp".includes(cons))
      (burst(c, o, at, {
        type: "bandpass",
        f: cons === "k" ? 1800 : cons === "t" ? 3500 : 900,
        Q: 1,
        a: 0.001,
        d: 0.025,
        amp: 0.4,
      }),
        (at += 0.035));
    const vs = Array.isArray(v)
      ? [
          [0, v[0]],
          [1, v[1]],
        ]
      : [
          [0, v],
          [1, v],
        ];
    const f = pitch * (i === 0 ? 1.12 : 1 - i * 0.05);
    const g = G(c, "bmdn".includes(cons) && cons ? 1 : 1);
    g.connect(o);
    voice(c, g, at, R, {
      dur: d,
      f0: [
        [0, f * 1.04],
        [1, f * 0.9],
      ],
      vow: vs,
      fscale: 0.94,
      bw: 1.2,
      jitter: 0.015,
      jitRate: 6,
      rasp: 0.15,
      breath: 0.06,
      drive: 2,
      ampJit: 0.1,
      env: [
        [0, 0],
        [0.12, 1],
        [0.8, 0.85],
        [1, 0],
      ],
    });
  }
}
function stab(c, o, t, notes, d, amp) {
  for (const m of notes)
    brass(c, o, t, mtof(m), d, amp, { a: 0.03, r: 0.4, bright: 3 });
}
const PWR = {
  maxammo: {
    syl: [
      ["m", "ae", 0.26],
      ["", "a", 0.14],
      ["m", "o", 0.42],
    ],
    chord: (c, o, t) => {
      stab(c, o, t, [48, 55, 60, 64], 0.35, 0.35);
      stab(c, o, t + 0.45, [53, 60, 65, 69], 0.7, 0.4);
    },
  },
  instakill: {
    syl: [
      ["", "i", 0.14],
      ["s", "a", 0.16],
      ["k", "i", 0.4],
    ],
    chord: (c, o, t) => {
      stab(c, o, t, [45, 48, 51, 57], 1.0, 0.4);
      thump(c, o, t, 60, 30, 0.8, 0.6);
    },
  },
  doublepoints: {
    syl: [
      ["d", "uh", 0.2],
      ["b", "uh", 0.13],
      ["p", ["o", "i"], 0.36],
    ],
    chord: (c, o, t) => {
      stab(c, o, t, [53, 57, 60], 0.25, 0.35);
      stab(c, o, t + 0.3, [55, 59, 62, 67], 0.8, 0.4);
    },
  },
  nuke: {
    syl: [
      ["k", "a", 0.13],
      ["b", "u", 0.55],
    ],
    chord: (c, o, t) => {
      stab(c, o, t, [38, 44, 50], 1.2, 0.45);
      thump(c, o, t + 0.2, 70, 25, 1.2, 0.9);
    },
  },
  carpenter: {
    syl: [
      ["k", "a", 0.22],
      ["p", "e", 0.16],
      ["t", "er", 0.36],
    ],
    chord: (c, o, t, R) => {
      for (const dt of [0, 0.2, 0.4]) clack(c, o, t + dt, 0.6, 2000, 300);
      stab(c, o, t + 0.55, [53, 57, 60, 65], 0.7, 0.35);
    },
  },
};
for (const [name, p] of Object.entries(PWR)) {
  def(
    name,
    { n: 1, dur: 2.2, rev: 0.45, cap: 1, jit: 0, peak: 0.85 },
    (c, o, t, R) => {
      const vg = G(c, 1.2);
      vg.connect(o);
      announce(c, vg, t + 0.05, R, p.syl);
      const cg = G(c, 0.55);
      cg.connect(o);
      p.chord(c, cg, t + 0.02, R);
    },
  );
}
def(
  "powerup_end",
  { n: 1, dur: 1.0, rev: 0.3, bus: "ui", jit: 0, peak: 0.6 },
  (c, o, t, R) => {
    for (const [dt, f] of [
      [0, 660],
      [0.28, 494],
    ]) {
      const s = O(c, "sawtooth", f, t + dt, 0.35),
        lp = F(c, "lowpass", 800, 4),
        g = G(c, 0);
      lp.frequency.setValueAtTime(2400, t + dt);
      lp.frequency.exponentialRampToValueAtTime(400, t + dt + 0.3);
      s.frequency.setValueAtTime(f, t + dt);
      s.frequency.linearRampToValueAtTime(f * 0.94, t + dt + 0.3);
      AD(g.gain, t + dt, 0.01, 0.3, 0.6);
      ch(s, lp, g, o);
    }
  },
);

// ── player ──
def(
  "player_hurt",
  { n: 5, dur: 0.6, rev: 0.12, cap: 2, jit: 0.04 },
  (c, o, t, R) => {
    thump(c, o, t, 90, 45, 0.15, 1);
    burst(c, o, t, {
      k: "p",
      type: "lowpass",
      f: 900,
      a: 0.001,
      d: 0.08,
      amp: 0.7,
    });
    const g = G(c, 0.7);
    g.connect(o);
    voice(c, g, t + 0.02, R, {
      dur: rr(R, 0.2, 0.32),
      f0: [
        [0, rr(R, 130, 160)],
        [1, rr(R, 95, 110)],
      ],
      vow: [
        [0, "uh"],
        [1, "u"],
      ],
      fscale: 1,
      bw: 1.3,
      jitter: 0.05,
      rasp: 0.3,
      breath: 0.2,
      drive: 2,
      env: [
        [0, 0],
        [0.1, 1],
        [1, 0],
      ],
    });
  },
);
def(
  "heartbeat",
  { n: 2, dur: 0.7, rev: 0, bus: "ui", peak: 0.8, jit: 0.02 },
  (c, o, t, R) => {
    const lp = F(c, "lowpass", 140, 0.8);
    lp.connect(o);
    thump(c, lp, t, 62, 44, 0.14, 1);
    thump(c, lp, t + 0.27, 52, 38, 0.17, 0.75);
    burst(c, lp, t, {
      k: "b",
      type: "lowpass",
      f: 120,
      a: 0.004,
      d: 0.1,
      amp: 0.4,
    });
  },
);
def(
  "player_down",
  { n: 1, dur: 3.8, rev: 0.3, cap: 1, jit: 0 },
  (c, o, t, R) => {
    thump(c, o, t, 80, 35, 0.3, 1);
    burst(c, o, t, {
      k: "p",
      type: "lowpass",
      f: 700,
      a: 0.002,
      d: 0.2,
      amp: 0.8,
    });
    thump(c, o, t + 0.05, 55, 24, 1.4, 0.9);
    const s = O(c, "sine", 3400, t, 3.6),
      g = G(c, 0);
    E(g.gain, t, 0, [
      [0.6, 0.12],
      [1.2, 0.1],
      [1.8, 0],
    ]);
    ch(s, g, o);
    const g2 = G(c, 0.7);
    g2.connect(o);
    voice(c, g2, t + 0.05, R, {
      dur: 0.6,
      f0: [
        [0, 150],
        [1, 80],
      ],
      vow: [
        [0, "a"],
        [1, "uh"],
      ],
      fscale: 1,
      bw: 1.4,
      jitter: 0.06,
      rasp: 0.4,
      breath: 0.3,
      drive: 2,
      env: [
        [0, 0],
        [0.1, 1],
        [1, 0],
      ],
    });
  },
);
function step(c, o, t, R, wood) {
  const hd = wood ? 0.07 : 0.045;
  if (wood) {
    tone(c, o, t, { f: rr(R, 140, 170), f2: 100, a: 0.001, d: 0.08, amp: 0.6 });
    burst(c, o, t, {
      type: "bandpass",
      f: rr(R, 330, 420),
      Q: 3,
      a: 0.001,
      d: 0.07,
      amp: 0.8,
    });
    burst(c, o, t, {
      type: "bandpass",
      f: rr(R, 650, 800),
      Q: 7,
      a: 0.001,
      d: 0.05,
      amp: 0.3,
    });
  } else {
    burst(c, o, t, {
      k: "p",
      type: "lowpass",
      f: 450,
      a: 0.001,
      d: hd,
      amp: 0.9,
    });
    burst(c, o, t, {
      type: "bandpass",
      f: rr(R, 2000, 3200),
      Q: 1,
      a: 0.001,
      d: 0.03,
      amp: 0.35,
    });
  }
  const tt = t + rr(R, 0.045, 0.07);
  burst(c, o, tt, {
    k: "p",
    type: "lowpass",
    f: 600,
    a: 0.001,
    d: 0.03,
    amp: 0.4,
  });
  scrape(
    c,
    o,
    tt,
    rr(R, 0.05, 0.09),
    { f: wood ? 1400 : 2600, Q: 1.2, amp: 0.2, rough: 0.9 },
    R,
  );
  if (wood && R() < 0.35)
    creak(c, o, tt, 0.14, { f: 1100, rate: 60, Q: 10, amp: 0.12 }, R);
}
def(
  "footstep_concrete",
  { n: 8, dur: 0.3, rev: 0.12, vol: 0.55, cap: 4, jit: 0.06, peak: 0.7 },
  (c, o, t, R) => step(c, o, t, R, false),
);
def(
  "footstep_wood",
  { n: 8, dur: 0.35, rev: 0.12, vol: 0.55, cap: 4, jit: 0.06, peak: 0.7 },
  (c, o, t, R) => step(c, o, t, R, true),
);
def("jump", { n: 3, dur: 0.4, rev: 0.1, vol: 0.6, peak: 0.6 }, (c, o, t, R) => {
  whoosh(c, o, t, 0.2, 700, 1500, 0.6);
  for (let i = 0; i < 3; i++)
    clk(c, o, t + rr(R, 0, 0.1), 0.2, rr(R, 3000, 5000), 0.02);
  burst(c, o, t, {
    k: "p",
    type: "bandpass",
    f: 1500,
    Q: 1,
    a: 0.02,
    d: 0.1,
    amp: 0.3,
  });
});
def(
  "land",
  { n: 4, dur: 0.4, rev: 0.12, vol: 0.7, peak: 0.8 },
  (c, o, t, R) => {
    thump(c, o, t, rr(R, 70, 90), 40, 0.14, 1);
    burst(c, o, t, {
      k: "p",
      type: "lowpass",
      f: 500,
      a: 0.001,
      d: 0.08,
      amp: 0.8,
    });
    burst(c, o, t, {
      type: "bandpass",
      f: 2500,
      Q: 1,
      a: 0.001,
      d: 0.04,
      amp: 0.3,
    });
    for (let i = 0; i < 3; i++)
      clk(c, o, t + rr(R, 0.01, 0.1), 0.2, rr(R, 3000, 5000), 0.02);
  },
);
def(
  "perk_drink",
  { n: 2, dur: 2.2, rev: 0.12, cap: 1, jit: 0.02, peak: 0.8 },
  (c, o, t, R) => {
    clk(c, o, t, 0.7, 3200, 0.03);
    tone(c, o, t + 0.01, { f: 600, f2: 200, a: 0.001, d: 0.04, amp: 0.6 }); // cap pop
    ping(c, o, t + 0.22, 3200, 0.2, 0.3); // glass clink
    for (const dt of [0.6, 1.0, 1.38]) {
      const at = t + dt + rr(R, -0.03, 0.03),
        r = rng((R() * 1e9) | 0);
      later(c, at, () => {
        burst(c, o, at, {
          k: "p",
          type: "bandpass",
          f: 250,
          f2: 700,
          Q: 4,
          a: 0.01,
          d: 0.12,
          amp: 1,
        });
        tone(c, o, at, { f: 170, f2: 330, a: 0.005, d: 0.1, amp: 0.5 });
        bubbles(c, o, at + 0.03, 0.1, 4, r, { lo: 400, hi: 900, amp: 0.2 });
      });
    }
    later(c, t + 1.7, () =>
      burst(c, o, t + 1.7, {
        k: "p",
        type: "bandpass",
        f: 1100,
        Q: 0.8,
        a: 0.05,
        d: 0.35,
        amp: 0.4,
      }),
    ); // "ahh"
  },
);
def(
  "perk_burp",
  { n: 3, dur: 1.0, rev: 0.15, cap: 1, jit: 0.04 },
  (c, o, t, R) => {
    voice(c, o, t, R, {
      dur: rr(R, 0.5, 0.8),
      f0: [
        [0, 95],
        [0.5, 82],
        [1, 68],
      ],
      vow: [
        [0, "o"],
        [0.5, "a"],
        [1, "uh"],
      ],
      fscale: 0.9,
      bw: 1.6,
      jitter: 0.12,
      rasp: 0.6,
      fry: 0.9,
      drive: 4,
      trem: [22, 0.6],
      env: [
        [0, 0],
        [0.06, 1],
        [0.8, 0.7],
        [1, 0],
      ],
    });
  },
);
def(
  "power_switch",
  { n: 1, dur: 1.2, rev: 0.4, cap: 1, ref: 4, jit: 0 },
  (c, o, t, R) => {
    scrape(c, o, t, 0.2, { f: 1800, f2: 1100, Q: 3, amp: 0.4 }, R);
    const at = t + 0.22;
    clack(c, o, at, 1.2, 1500, 90);
    thump(c, o, at, 60, 30, 0.4, 0.9);
    for (let i = 0; i < 10; i++)
      burst(c, o, at + rr(R, 0, 0.25), {
        type: "bandpass",
        f: rr(R, 2500, 7000),
        Q: 5,
        a: 0.0003,
        d: rr(R, 0.005, 0.03),
        amp: rr(R, 0.2, 0.6),
      });
    const s = O(c, "sawtooth", 50, at, 0.8),
      hp = F(c, "bandpass", 400, 2),
      g = G(c, 0);
    AD(g.gain, at, 0.01, 0.7, 0.3);
    ch(s, hp, g, o);
  },
);
def(
  "ui_hover",
  { n: 3, dur: 0.1, rev: 0, bus: "ui", peak: 0.3, cap: 3, jit: 0.02 },
  (c, o, t, R) => {
    tone(c, o, t, {
      type: "triangle",
      f: rr(R, 1900, 2100),
      a: 0.001,
      d: 0.03,
      amp: 0.6,
    });
    burst(c, o, t, {
      type: "highpass",
      f: 4000,
      a: 0.0003,
      d: 0.004,
      amp: 0.3,
    });
  },
);
def(
  "ui_click",
  { n: 3, dur: 0.18, rev: 0, bus: "ui", peak: 0.5, cap: 3, jit: 0.02 },
  (c, o, t, R) => {
    clk(c, o, t, 1, rr(R, 2300, 2700), 0.03);
    thump(c, o, t, 190, 110, 0.04, 0.6);
    tone(c, o, t + 0.01, {
      type: "triangle",
      f: 1200,
      a: 0.001,
      d: 0.05,
      amp: 0.25,
    });
  },
);

// ── phase 2: co-op / feel foley ──
function cloth(c, o, t, d, amp, R, f = 1100) {
  // fabric rustle: rough pink noise swish
  scrape(
    c,
    o,
    t,
    d,
    {
      f: f * rr(R, 0.8, 1.2),
      f2: f * rr(R, 1.2, 1.8),
      Q: 0.8,
      amp,
      k: "p",
      rough: 0.75,
    },
    R,
  );
}
function buckles(c, o, t, n, span, amp, R) {
  for (let i = 0; i < n; i++)
    clk(
      c,
      o,
      t + rr(R, 0, span),
      rr(R, 0.3, 1) * amp,
      rr(R, 2400, 5200),
      rr(R, 0.012, 0.03),
    );
}
function breath(c, o, t, d, amp, R, inhale) {
  // breathy formant noise (no voicing)
  const n = NS(c, t, d + 0.02, "p"),
    m = G(c, 1),
    g = G(c, 0);
  const f1 = inhale ? 1300 : 900,
    f2 = inhale ? 2600 : 1700;
  const b1 = F(c, "bandpass", f1 * rr(R, 0.9, 1.1), 3),
    b2 = F(c, "bandpass", f2 * rr(R, 0.9, 1.1), 4),
    g2 = G(c, 0.6);
  ch(n, b1, m);
  ch(n, b2, g2, m);
  ch(m, g, o);
  if (inhale) {
    b1.frequency.setValueAtTime(f1 * 0.9, t);
    b1.frequency.linearRampToValueAtTime(f1 * 1.25, t + d);
  }
  E(
    g.gain,
    t,
    0,
    inhale
      ? [
          [d * 0.7, amp],
          [d * 0.3, 0],
        ]
      : [
          [d * 0.15, amp],
          [d * 0.85, 0],
        ],
  );
}
def(
  "ads_in",
  { n: 3, dur: 0.3, rev: 0.05, cap: 2, jit: 0.04 },
  (c, o, t, R) => {
    cloth(c, o, t, rr(R, 0.1, 0.14), 0.6, R, 1300);
    const at = t + rr(R, 0.09, 0.12);
    tone(c, o, at, {
      f: rr(R, 140, 170),
      f2: 90,
      a: 0.002,
      d: 0.06,
      amp: 0.55,
    }); // stock meets shoulder
    burst(c, o, at, {
      k: "p",
      type: "lowpass",
      f: 700,
      a: 0.002,
      d: 0.04,
      amp: 0.4,
    });
    clk(c, o, at + 0.01, 0.35, rr(R, 3000, 4200), 0.02); // sling swivel / metal
  },
);
def(
  "ads_out",
  { n: 3, dur: 0.25, rev: 0.05, cap: 2, jit: 0.04 },
  (c, o, t, R) => {
    cloth(c, o, t, rr(R, 0.08, 0.12), 0.5, R, 1600);
    clk(c, o, t + rr(R, 0.04, 0.07), 0.25, rr(R, 3500, 4800), 0.015);
  },
);
def(
  "gear_rattle",
  { n: 5, dur: 0.45, rev: 0.05, cap: 2, jit: 0.06 },
  (c, o, t, R) => {
    buckles(c, o, t, 4 + Math.floor(R() * 3), 0.22, 0.5, R);
    cloth(c, o, t, rr(R, 0.18, 0.28), 0.35, R, 900);
    tone(c, o, t + rr(R, 0.02, 0.12), {
      f: rr(R, 420, 560),
      a: 0.002,
      d: 0.05,
      amp: 0.3,
    }); // canteen knock
  },
);
def(
  "jump_foley",
  { n: 3, dur: 0.45, rev: 0.08, cap: 2, jit: 0.05 },
  (c, o, t, R) => {
    whoosh(c, o, t, rr(R, 0.18, 0.24), 700, 1600, 0.6);
    buckles(c, o, t + 0.02, 4, 0.14, 0.4, R);
    tone(c, o, t + rr(R, 0.03, 0.08), {
      f: rr(R, 430, 520),
      a: 0.002,
      d: 0.05,
      amp: 0.2,
    });
  },
);
def(
  "slide_step",
  { n: 4, dur: 0.65, rev: 0.1, cap: 2, jit: 0.05 },
  (c, o, t, R) => {
    const d = rr(R, 0.4, 0.55);
    scrape(
      c,
      o,
      t,
      d,
      { f: rr(R, 1400, 1900), f2: 700, Q: 0.7, amp: 0.8, k: "p", rough: 0.6 },
      R,
    );
    burst(c, o, t, {
      k: "b",
      type: "lowpass",
      f: 300,
      a: 0.02,
      d: d * 0.8,
      amp: 0.6,
    });
    for (let i = 0; i < 18; i++)
      burst(c, o, t + rr(R, 0, d), {
        type: "bandpass",
        f: rr(R, 2500, 6000),
        Q: 3,
        a: 0.0003,
        d: 0.005,
        amp: rr(R, 0.05, 0.25),
      }); // grit
    buckles(c, o, t, 3, d * 0.6, 0.25, R);
  },
);
def(
  "breath_exhausted",
  { n: 3, dur: 2.2, rev: 0.05, cap: 1, jit: 0.03 },
  (c, o, t, R) => {
    let at = t;
    const nb = 3 + Math.floor(R() * 2);
    for (let i = 0; i < nb; i++) {
      const di = rr(R, 0.18, 0.24),
        de = rr(R, 0.24, 0.32),
        a = 1 - i * 0.12;
      breath(c, o, at, di, 0.55 * a, R, true);
      at += di + rr(R, 0.02, 0.05);
      breath(c, o, at, de, 0.8 * a, R, false);
      at += de + rr(R, 0.04, 0.1);
    }
  },
);
def(
  "revive_start",
  { n: 2, dur: 0.9, rev: 0.12, cap: 2, ref: 3, jit: 0.03 },
  (c, o, t, R) => {
    cloth(c, o, t, 0.25, 0.7, R, 900);
    buckles(c, o, t + 0.05, 5, 0.3, 0.45, R);
    tone(c, o, t + 0.22, { f: 95, f2: 60, a: 0.004, d: 0.12, amp: 0.6 }); // knee down
    breath(c, o, t + 0.3, 0.35, 0.5, R, false);
    whoosh(c, o, t, 0.6, 250, 700, 0.25);
  },
);
def(
  "revive_loop",
  { n: 1, dur: 2.4, loop: true, rev: 0.15, cap: 4, ref: 3, jit: 0 },
  (c, o, t, R) => {
    const d = 3.4;
    // tense pulse: soft heartbeat every 0.8 s under a beating high drone, bandage/cloth pats
    for (let k = 0; k < 5; k++) {
      const at = t + k * 0.8;
      tone(c, o, at, { f: 58, f2: 44, a: 0.004, d: 0.14, amp: 0.7 });
      tone(c, o, at + 0.24, { f: 50, f2: 38, a: 0.004, d: 0.16, amp: 0.5 });
    }
    for (const [f, a] of [
      [880, 0.05],
      [883, 0.05],
      [1320, 0.025],
    ]) {
      const s = O(c, "sine", f, t, d),
        g = G(c, a);
      ch(s, g, o);
    }
    for (let k = 0; k < 8; k++)
      cloth(
        c,
        o,
        t + k * 0.42 + rr(R, 0, 0.1),
        rr(R, 0.1, 0.16),
        0.25,
        R,
        1000,
      );
  },
);
def(
  "revive_done",
  { n: 2, dur: 1.6, rev: 0.25, cap: 2, ref: 3, jit: 0.01 },
  (c, o, t, R) => {
    breath(c, o, t, 0.45, 0.9, R, true); // gasp back to life
    [72, 76, 79, 84].forEach((m, i) =>
      tone(c, o, t + 0.15 + i * 0.07, {
        f: mtof(m),
        a: 0.004,
        d: 1.0,
        amp: 0.25,
      }),
    );
    whoosh(c, o, t + 0.1, 0.5, 600, 3500, 0.35, "w");
    cloth(c, o, t + 0.5, 0.25, 0.4, R, 1200);
  },
);
function radioClick(c, o, t, amp = 0.6) {
  clk(c, o, t, amp, 2200, 0.01);
  burst(c, o, t, {
    type: "bandpass",
    f: 1800,
    Q: 1,
    a: 0.001,
    d: 0.05,
    amp: amp * 0.4,
  });
}
function beep(c, o, t, f, d, amp) {
  const s = O(c, "square", f, t, d + 0.02),
    bp = F(c, "bandpass", f * 1.5, 1.5),
    g = G(c, 0);
  E(g.gain, t, 0, [
    [0.005, amp],
    [d - 0.01, amp * 0.8],
    [0.01, 0],
  ]);
  ch(s, bp, g, o);
  const s2 = O(c, "sine", f, t, d + 0.02),
    g2 = G(c, 0);
  E(g2.gain, t, 0, [
    [0.005, amp * 0.6],
    [d - 0.01, amp * 0.5],
    [0.01, 0],
  ]);
  ch(s2, g2, o);
}
def(
  "player_join",
  { n: 1, dur: 0.9, rev: 0, bus: "ui", jit: 0 },
  (c, o, t, R) => {
    radioClick(c, o, t);
    beep(c, o, t + 0.06, 880, 0.09, 0.5);
    beep(c, o, t + 0.18, 1319, 0.16, 0.5);
    burst(c, o, t + 0.36, {
      type: "bandpass",
      f: 2500,
      Q: 0.7,
      a: 0.005,
      d: 0.08,
      amp: 0.15,
    });
  },
);
def(
  "player_leave",
  { n: 1, dur: 0.9, rev: 0, bus: "ui", jit: 0 },
  (c, o, t, R) => {
    burst(c, o, t, {
      type: "bandpass",
      f: 2200,
      Q: 0.6,
      a: 0.01,
      d: 0.14,
      amp: 0.3,
    }); // static
    beep(c, o, t + 0.1, 1319, 0.1, 0.5);
    beep(c, o, t + 0.23, 740, 0.2, 0.5);
    radioClick(c, o, t + 0.47, 0.5);
  },
);
def("chat", { n: 2, dur: 0.3, rev: 0, bus: "ui", jit: 0.01 }, (c, o, t, R) => {
  clk(c, o, t, 0.5, 2600, 0.01);
  tone(c, o, t + 0.01, { f: 1760, a: 0.002, d: 0.22, amp: 0.4 });
  tone(c, o, t + 0.01, { f: 1760 * 2.32, a: 0.002, d: 0.1, amp: 0.12 });
});
def(
  "teammate_down",
  { n: 1, dur: 1.8, rev: 0.2, bus: "ui", jit: 0 },
  (c, o, t, R) => {
    radioClick(c, o, t, 0.5);
    burst(c, o, t + 0.02, {
      type: "bandpass",
      f: 2000,
      Q: 0.6,
      a: 0.01,
      d: 0.25,
      amp: 0.2,
    });
    const st = G(c, 0.5);
    st.connect(o);
    for (const [m, dm] of [
      [62, -3],
      [63, -4],
      [50, -2],
    ]) {
      // dissonant falling stab
      const f0 = mtof(m),
        f1 = mtof(m + dm),
        s = O(c, "sawtooth", f0, t + 0.08, 1.4),
        lp = F(c, "lowpass", 1800, 1),
        g = G(c, 0);
      s.frequency.setValueAtTime(f0, t + 0.3);
      s.frequency.linearRampToValueAtTime(f1, t + 1.3);
      lp.frequency.setValueAtTime(2400, t + 0.08);
      lp.frequency.exponentialRampToValueAtTime(500, t + 1.4);
      E(g.gain, t + 0.08, 0, [
        [0.03, 0.4],
        [1.0, 0.25],
        [0.3, 0],
      ]);
      ch(s, lp, g, st);
    }
    thump(c, o, t + 0.08, 70, 35, 0.5, 0.6);
  },
);
def("bleedout", { n: 1, dur: 4.2, rev: 0.25, cap: 1, jit: 0 }, (c, o, t, R) => {
  let at = t;
  for (const [gap, a] of [
    [0.85, 1],
    [1.1, 0.8],
    [1.45, 0.6],
  ]) {
    // heart slowing to a stop
    tone(c, o, at, { f: 60, f2: 42, a: 0.004, d: 0.16, amp: a });
    tone(c, o, at + 0.28, { f: 50, f2: 36, a: 0.004, d: 0.18, amp: a * 0.7 });
    at += gap;
  }
  const s = O(c, "sawtooth", 55, t, 4.1),
    s2 = O(c, "sawtooth", 55.6, t, 4.1),
    lp = F(c, "lowpass", 200, 1),
    g = G(c, 0);
  lp.frequency.setValueAtTime(200, t);
  lp.frequency.linearRampToValueAtTime(700, t + 3.2);
  s.connect(lp);
  s2.connect(lp);
  E(g.gain, t, 0, [
    [3.0, 0.35],
    [1.0, 0],
  ]);
  ch(lp, g, o);
  breath(c, o, t + 3.2, 0.7, 0.6, R, false);
  tone(c, o, t + 2.4, { f: 1046, a: 0.6, d: 1.5, amp: 0.06 });
});

// ── ambient loops (stereo) ──
def(
  "ambient_wind",
  { n: 1, dur: 12, ch: 2, loop: true, rev: 0.1, cap: 2, jit: 0, peak: 0.55 },
  (c, o, t, R) => {
    const d = 13.2,
      N = 300;
    const m = c.createChannelMerger(2);
    m.connect(o);
    for (let chn = 0; chn < 2; chn++) {
      const gust = smooth(R, N, 9),
        cf = smooth(R, N, 7);
      const nz = NS(c, t, d, "p"),
        bp = F(c, "bandpass", 500, 0.9),
        g = G(c, 0);
      bp.frequency.setValueCurveAtTime(
        curveOf(N, (x) => 380 + 260 * cf[Math.round(x * (N - 1))]),
        t,
        d,
      );
      g.gain.setValueCurveAtTime(
        curveOf(N, (x) => 0.5 + 0.4 * gust[Math.round(x * (N - 1))]),
        t,
        d,
      );
      ch(nz, bp, g);
      g.connect(m, 0, chn);
      const wn = NS(c, t, d, "w"),
        wb = F(c, "bandpass", 900, 28),
        wg = G(c, 0); // whistle through gaps
      wb.frequency.setValueCurveAtTime(
        curveOf(
          N,
          (x) =>
            900 +
            350 * cf[Math.round(x * (N - 1))] +
            150 * gust[Math.round(x * (N - 1))],
        ),
        t,
        d,
      );
      wg.gain.setValueCurveAtTime(
        curveOf(N, (x) => 0.9 * Math.max(0, gust[Math.round(x * (N - 1))])),
        t,
        d,
      );
      ch(wn, wb, wg);
      wg.connect(m, 0, chn);
      const rn = NS(c, t, d, "b"),
        rl = F(c, "lowpass", 110),
        rg = G(c, 0.5);
      ch(rn, rl, rg);
      rg.connect(m, 0, chn);
    }
  },
);
def(
  "ambient_drone",
  { n: 1, dur: 12, ch: 2, loop: true, rev: 0.2, cap: 2, jit: 0, peak: 0.5 },
  (c, o, t, R) => {
    const d = 13.2;
    const m = c.createChannelMerger(2);
    m.connect(o);
    for (let chn = 0; chn < 2; chn++) {
      const lp = F(c, "lowpass", 320, 1.2);
      const lg = G(c, 1);
      ch(lp, lg);
      lg.connect(m, 0, chn);
      lp.frequency.setValueCurveAtTime(
        curveOf(200, (x) => 260 + 120 * Math.sin(TAU * x * 2 + chn)),
        t,
        d,
      );
      for (const [f, a, ty] of [
        [55, 0.5, "sawtooth"],
        [55.4, 0.4, "sawtooth"],
        [82.4, 0.3, "sawtooth"],
        [116.5, 0.18, "sawtooth"],
        [27.5, 0.6, "sine"],
      ]) {
        const s = O(c, ty, f * (1 + (chn ? 0.003 : -0.002)), t, d);
        const g = G(c, a);
        ch(s, g, lp);
      }
      const hum = O(c, "square", 50, t, d),
        hl = F(c, "bandpass", 150, 3),
        hg = G(c, 0.06);
      ch(hum, hl, hg);
      hg.connect(m, 0, chn);
      const wf = chn ? 1310 : 1240,
        w = O(c, "sine", wf, t, d),
        wg = G(c, 0);
      w.frequency.setValueCurveAtTime(
        curveOf(100, (x) => wf * (1 + 0.03 * Math.sin(TAU * x * 3 + chn))),
        t,
        d,
      );
      wg.gain.setValueCurveAtTime(
        curveOf(
          100,
          (x) => 0.03 * Math.max(0, Math.sin(TAU * x * 2 + chn * 2)),
        ),
        t,
        d,
      );
      ch(w, wg);
      wg.connect(m, 0, chn);
    }
  },
);

// ───────────────────────────────────────────────────────────── stingers (live)
const PERK_TUNES = [
  [
    [0, 0.5],
    [4, 0.5],
    [7, 0.5],
    [12, 1],
    [11, 0.5],
    [9, 0.5],
    [7, 1],
    [5, 0.5],
    [4, 0.5],
    [2, 0.5],
    [7, 0.5],
    [0, 2],
  ],
  [
    [7, 0.25],
    [9, 0.25],
    [11, 0.25],
    [12, 0.25],
    [14, 0.5],
    [12, 0.5],
    [9, 0.5],
    [7, 0.5],
    [4, 0.25],
    [5, 0.25],
    [7, 0.5],
    [12, 1],
    [0, 1.5],
  ],
  [
    [0, 0.5],
    [0, 0.25],
    [4, 0.25],
    [7, 0.5],
    [4, 0.5],
    [9, 0.5],
    [7, 0.5],
    [4, 0.5],
    [2, 0.5],
    [5, 0.5],
    [4, 0.5],
    [2, 0.5],
    [11, 0.5],
    [12, 2],
  ],
  [
    [4, 1],
    [2, 0.5],
    [0, 0.5],
    [2, 1],
    [7, 1],
    [9, 0.5],
    [7, 0.5],
    [4, 0.5],
    [2, 0.5],
    [0, 2],
  ],
];
const PERK_IDX = { ironhide: 0, quickhands: 1, rapidfire: 2, secondwind: 3 };
const STINGS = {
  round_start: {
    gain: 1.0,
    len: 7,
    fn(c, o, w, t, R) {
      const b = mixBus(c, o, w, 1, 0.5);
      thump(c, b, t, 70, 32, 1.6, 0.8);
      burst(c, b, t, {
        k: "b",
        type: "lowpass",
        f: 200,
        a: 0.005,
        d: 1.2,
        amp: 0.4,
      });
      [0, 1.8, 3.6].forEach((dt, i) =>
        bell(c, b, t + dt, mtof(i === 2 ? 45 : 50), 5.5, 0.5 * (1 - i * 0.2)),
      );
      for (const m of [38, 45, 50, 53])
        brass(c, b, t + 0.2, mtof(m), 5.0, 0.12, {
          a: 1.6,
          r: 1.5,
          bright: 1.8,
        });
      for (const m of [62, 65, 69])
        choir(c, b, t + 0.6, mtof(m), 5.6, 0.22, R, {
          vow: [
            [0, "u"],
            [0.4, "o"],
            [1, "a"],
          ],
          env: [
            [0, 0],
            [0.35, 1],
            [0.75, 0.8],
            [1, 0],
          ],
        });
    },
  },
  round_end: {
    gain: 2.6,
    len: 7,
    fn(c, o, w, t, R) {
      const b = mixBus(c, o, w, 1, 0.6);
      [
        [50, 57],
        [53, 62],
        [57, 65],
        [60, 69],
      ].forEach(([a, z], i) =>
        choir(c, b, t + i * 0.15, mtof(a), 6, 0.2, R, {
          f0: [
            [0, mtof(a)],
            [0.65, mtof(z)],
            [1, mtof(z)],
          ],
          vow: [
            [0, "o"],
            [0.6, "a"],
            [1, "a"],
          ],
          env: [
            [0, 0],
            [0.62, 1],
            [0.8, 0.7],
            [1, 0],
          ],
        }),
      );
      for (let i = 0; i < 8; i++)
        tone(c, b, t + 3.4 + i * 0.12, {
          f: mtof(pick(R, [81, 86, 88, 93])),
          a: 0.05,
          d: 1.4,
          amp: 0.05,
        });
      bell(c, b, t + 3.9, mtof(62), 3, 0.25);
    },
  },
  box_jingle: {
    gain: 0.8,
    len: 3.5,
    fn(c, o, w, t, R) {
      const b = mixBus(c, o, w, 1, 0.5);
      [
        [0, 81],
        [0.12, 84],
        [0.24, 88],
        [0.36, 93],
        [0.6, 91],
        [0.72, 88],
        [0.84, 84],
        [0.96, 86],
        [1.2, 88],
        [1.32, 85],
        [1.44, 81],
      ].forEach(([dt, m]) =>
        later(c, t + dt, () => mbox(c, b, t + dt, mtof(m), 0.3, 1.2, R)),
      );
      later(c, t + 1.7, () => {
        for (const m of [69, 73, 76, 81])
          mbox(c, b, t + 1.7, mtof(m), 0.25, 2, R);
        bell(c, b, t + 1.7, mtof(57), 2.5, 0.25);
      });
    },
  },
  perk_jingle: {
    gain: 1.0,
    len: 5.5,
    fn(c, o, w, t, R, opts = {}) {
      const vi = opts.variant ?? PERK_IDX[opts.perk] ?? Math.floor(R() * 4),
        tune = PERK_TUNES[vi % 4];
      const root = [60, 62, 65, 58][vi % 4],
        beat = 0.3;
      const radio = G(c, 1),
        hp = F(c, "highpass", 350),
        lp = F(c, "lowpass", 3200),
        out = mixBus(c, o, w, 1, 0.25);
      ch(radio, hp, lp, sat(c, 1.6), out);
      const cr = c.createBufferSource();
      cr.buffer = NZ.cr;
      cr.start(t, R() * 2);
      cr.stop(t + 5.2);
      const crg = G(c, 0.25);
      ch(cr, crg, radio);
      let at = t;
      tune.forEach(([s, bts]) => {
        const nt = at;
        later(c, nt, () => {
          pluck(
            c,
            radio,
            nt,
            mtof(root + 12 + s),
            0.3,
            Math.min(0.6, bts * beat * 1.2),
          );
          organ(c, radio, nt, mtof(root + s), bts * beat * 0.95, 0.08);
        });
        at += bts * beat;
      });
      const total = at - t,
        prog = [0, 5, 7, 0];
      for (let i = 0; i * 2 * beat < total; i++) {
        const bt = t + i * 2 * beat,
          r = root - 24 + prog[Math.floor(i / 2) % 4];
        later(c, bt, () => {
          uprightBass(c, radio, bt, mtof(r), 0.5, 0.35);
          uprightBass(c, radio, bt + beat, mtof(r + 7), 0.4, 0.3);
          burst(c, radio, bt + beat, {
            type: "bandpass",
            f: 5000,
            Q: 0.8,
            a: 0.002,
            d: 0.08,
            amp: 0.15,
          });
        });
      }
      const end = at;
      later(c, end, () => {
        for (const s of [0, 4, 7, 12])
          organ(c, radio, end, mtof(root + s), 1.0, 0.07);
        pluck(c, radio, end, mtof(root + 24), 0.3, 0.8);
      });
    },
  },
  anvil: {
    gain: 1.7,
    len: 5,
    fn(c, o, w, t, R) {
      const b = mixBus(c, o, w, 1, 0.5);
      [0, 0.75, 1.5].forEach((dt, i) => {
        const f = [180, 190, 170][i],
          at = t + dt;
        for (const [r, a, d] of [
          [1, 1, 1.8],
          [2.76, 0.6, 1.2],
          [5.4, 0.4, 0.6],
          [8.93, 0.25, 0.3],
          [13.34, 0.15, 0.2],
        ])
          tone(c, b, at, { f: f * r, a: 0.0005, d, amp: a * 0.15 });
        burst(c, b, at, {
          type: "highpass",
          f: 2000,
          a: 0.0003,
          d: 0.03,
          amp: 0.4,
        });
        thump(c, b, at, 120, 60, 0.15, 0.4);
        for (let k = 0; k < 6; k++)
          ping(c, b, at + rr(R, 0.01, 0.3), rr(R, 4000, 8000), 0.05, 0.04);
      });
      for (const m of [36, 43, 48, 51])
        brass(c, b, t + 1.5, mtof(m), 2.4, 0.12, {
          a: 1.0,
          r: 1.2,
          bright: 1.6,
        });
      const s = O(c, "sawtooth", 50, t + 1.6, 3.2),
        bp = F(c, "bandpass", 200, 2),
        g = G(c, 0);
      bp.frequency.setValueAtTime(200, t + 1.6);
      bp.frequency.exponentialRampToValueAtTime(1200, t + 4);
      E(g.gain, t + 1.6, 0, [
        [1.8, 0.12],
        [1.2, 0],
      ]);
      ch(s, bp, g, b);
    },
  },
  power_on: {
    gain: 0.7,
    len: 6,
    fn(c, o, w, t, R) {
      const b = mixBus(c, o, w, 1, 0.45);
      const k = G(c, 1);
      ch(k, sat(c, 3), b);
      thump(c, k, t, 65, 28, 0.9, 1);
      burst(c, k, t, {
        k: "p",
        type: "lowpass",
        f: 1500,
        f2: 150,
        a: 0.001,
        d: 0.5,
        amp: 0.8,
      });
      clack(c, b, t + 0.14, 0.5, 1600, 120);
      clack(c, b, t + 0.23, 0.4, 1900, 140);
      const hum = G(c, 0),
        hbp = F(c, "bandpass", 150, 1.5);
      ch(hbp, hum, b);
      for (const [ty, m] of [
        ["sawtooth", 1],
        ["square", 2],
        ["sawtooth", 3.01],
      ]) {
        const s = O(c, ty, 30 * m, t + 0.1, 5.5);
        s.frequency.setValueAtTime(30 * m, t + 0.1);
        s.frequency.exponentialRampToValueAtTime(60 * m, t + 3);
        s.connect(hbp);
      }
      hbp.frequency.setValueAtTime(150, t + 0.1);
      hbp.frequency.exponentialRampToValueAtTime(1400, t + 3);
      E(hum.gain, t + 0.1, 0, [
        [2.6, 0.25],
        [1.5, 0.12],
        [1.3, 0],
      ]);
      for (let i = 0; i < 14; i++)
        burst(c, b, t + rr(R, 0.1, 2.2), {
          type: "bandpass",
          f: rr(R, 2500, 7000),
          Q: 5,
          a: 0.0003,
          d: rr(R, 0.005, 0.04),
          amp: rr(R, 0.1, 0.4),
        });
      for (const m of [48, 55, 60, 64, 67])
        brass(c, b, t + 1.0, mtof(m), 3.6, 0.1, {
          a: 1.6,
          r: 1.2,
          bright: 2.2,
        });
    },
  },
  powerup_fanfare: {
    gain: 2.8,
    len: 2.8,
    fn(c, o, w, t, R) {
      const b = mixBus(c, o, w, 1, 0.4);
      [
        [0, 67],
        [0.14, 72],
        [0.28, 76],
      ].forEach(([dt, m]) =>
        brass(c, b, t + dt, mtof(m), 0.12, 0.3, {
          a: 0.02,
          r: 0.08,
          bright: 3,
        }),
      );
      for (const m of [60, 64, 67, 72, 79])
        brass(c, b, t + 0.46, mtof(m), 1.3, 0.18, {
          a: 0.04,
          r: 0.6,
          bright: 2.6,
        });
      for (const m of [72, 76, 79])
        choir(c, b, t + 0.46, mtof(m), 1.8, 0.12, R, {
          vow: [
            [0, "a"],
            [1, "a"],
          ],
          env: [
            [0, 0],
            [0.15, 1],
            [0.7, 0.8],
            [1, 0],
          ],
        });
    },
  },
};

// ───────────────────────────────────────────────────────────── music (live, lookahead)
const CH = {
  Dm: [50, 57, 62, 65],
  Bb: [46, 58, 62, 65],
  Gm: [43, 55, 58, 62],
  A: [45, 57, 61, 64],
  Am: [45, 57, 60, 64],
  F: [41, 53, 60, 65],
  C: [48, 55, 60, 64],
  Eb: [39, 55, 58, 63],
  E: [40, 56, 59, 64],
  Dmg: [38, 50, 57, 62, 65],
};
const MENU_PROGS = [
  ["Dm", "Bb", "Gm", "A"],
  ["Dm", "F", "C", "Bb"],
  ["Dm", "Eb", "Dm", "A"],
  ["Dm", "Bb", "F", "A"],
  ["Gm", "Dm", "Eb", "A"],
  ["Dm", "Am", "Bb", "A"],
];
const GO_PROGS = [
  ["Am", "F", "Dmg", "E"],
  ["Am", "Dmg", "F", "E"],
  ["F", "C", "Dmg", "E"],
];
const GO_MEL = [
  [
    [0, 76],
    [1, 74],
    [2, 72],
    [3, 71],
  ],
  [
    [0, 72],
    [1.5, 71],
    [2, 69],
  ],
  [
    [0, 74],
    [1, 72],
    [2, 71],
    [3, 69],
  ],
  [
    [0, 68],
    [2, 64],
  ],
  [
    [0, 76],
    [1, 77],
    [2, 76],
    [3, 74],
  ],
  [
    [0, 72],
    [1.5, 74],
    [2, 72],
    [3, 71],
  ],
  [
    [0, 69],
    [1, 71],
    [1.5, 69],
    [2, 68],
    [3, 64],
  ],
  [[0, 69]],
];
const GO_CH = ["Am", "F", "Dmg", "E", "Am", "F", "Dmg", "Am"];

class Music {
  constructor(c, out, rev, kind, opts = {}) {
    this.c = c;
    this.kind = kind;
    this.menu = kind !== "gameover";
    this.loop = opts.loop ?? this.menu;
    this.R = rng(opts.seed ?? (Math.random() * 1e9) | 0);
    const t0 = c.currentTime + 0.06;
    this.t0 = t0;
    this.osc = [];
    this.done = false;
    this.dead = false;
    this.g = G(c, 0);
    this.g.connect(out);
    this.rv = G(c, 0);
    this.rv.connect(rev);
    const fi = opts.fadeIn ?? 2;
    for (const x of [this.g, this.rv]) {
      x.gain.setValueAtTime(0, t0);
      x.gain.linearRampToValueAtTime(1, t0 + fi);
    }
    // pad bus + slow stereo chorus
    this.pad = G(c, 1);
    const dry = G(c, 0.7);
    ch(this.pad, dry, this.g);
    for (const [dt, rate, pan] of [
      [0.017, 0.21, -0.8],
      [0.024, 0.29, 0.8],
    ]) {
      const dl = c.createDelay(0.1);
      dl.delayTime.value = dt;
      const l = c.createOscillator();
      l.frequency.value = rate;
      const lg = G(c, 0.004);
      ch(l, lg, dl.delayTime);
      l.start(t0);
      this.osc.push(l);
      const p = c.createStereoPanner();
      p.pan.value = pan;
      ch(this.pad, dl, p, G(c, 0.5), this.g);
    }
    const ps = G(c, 0.35);
    ch(this.pad, ps, this.rv);
    // music box bus + echo
    this.box = G(c, 1);
    this.box.connect(this.g);
    const dl = c.createDelay(1);
    dl.delayTime.value = this.menu ? 0.625 : 0.9;
    const fb = G(c, 0.33),
      dlp = F(c, "lowpass", 2400),
      wet = G(c, 0.28);
    ch(this.box, dl, dlp, fb, dl);
    dlp.connect(wet);
    wet.connect(this.g);
    const bs = G(c, 0.5);
    ch(this.box, bs, this.rv);
    // bells (distant)
    this.bell = G(c, 1);
    const blp = F(c, "lowpass", 2000),
      bd = G(c, 0.5),
      bw = G(c, 1.1);
    ch(this.bell, blp, bd, this.g);
    blp.connect(bw);
    bw.connect(this.rv);
    // wow for the music box
    const wo = c.createOscillator();
    wo.frequency.value = 0.43;
    this.wow = G(c, 7);
    wo.connect(this.wow);
    wo.start(t0);
    this.osc.push(wo);
    // sub drone
    const root = this.menu ? 26 : 33;
    const dg = G(c, 0),
      dlp2 = F(c, "lowpass", 150);
    ch(dlp2, dg, this.g);
    dg.gain.setValueAtTime(0, t0);
    dg.gain.linearRampToValueAtTime(0.32, t0 + 6);
    for (const [m, ty, a] of [
      [root, "sine", 1],
      [root + 12, "triangle", 0.5],
      [root + 12.1, "triangle", 0.4],
    ]) {
      const s = c.createOscillator();
      s.type = ty;
      s.frequency.value = mtof(m);
      const sg = G(c, a);
      ch(s, sg, dlp2);
      s.start(t0);
      this.osc.push(s);
    }
    const tl = c.createOscillator();
    tl.frequency.value = 0.07;
    const tg = G(c, 0.12);
    ch(tl, tg, dg.gain);
    tl.start(t0);
    this.osc.push(tl);
    this.drone = dg;
    // vinyl crackle
    const cr = c.createBufferSource();
    cr.buffer = NZ.cr;
    cr.loop = true;
    cr.start(t0);
    this.osc.push(cr);
    const chp = F(c, "highpass", 900),
      cg = G(c, this.menu ? 0.07 : 0.09);
    ch(cr, chp, cg, this.g);

    this.beat = this.menu ? 60 / 72 : 60 / 52;
    this.nextBar = t0 + 0.4;
    this.bar = 0;
    this.last = null;
    this.motif = null;
    this.sec = "C";
    this.prog = this.menu ? MENU_PROGS[0] : GO_PROGS[0];
    this.scaleP = this.menu ? [2, 4, 5, 7, 9, 10, 0] : [9, 11, 0, 2, 4, 5, 7];
    this.lead = this.menu ? [0, 1] : [7, 8]; // raised 7th over the dominant
    this.dom = this.menu ? "A" : "E";
    this.lo = this.menu ? 74 : 69;
    this.hi = this.menu ? 93 : 88;
  }
  barLen() {
    return (
      4 *
      this.beat *
      (this.menu || this.bar < 8 || this.loop
        ? this.menu
          ? 1
          : 1 + 0.035 * Math.min(this.bar, 8)
        : 1)
    );
  }
  schedule(until) {
    while (!this.done && this.nextBar < until) {
      const t = this.nextBar,
        L = this.barLen();
      this._bar(t, L);
      this.nextBar += L;
      this.bar++;
    }
  }
  stop(fade = 1) {
    if (this.dead) return;
    this.dead = true;
    this.done = true;
    const now = this.c.currentTime;
    for (const x of [this.g, this.rv]) {
      x.gain.cancelScheduledValues(now);
      x.gain.setValueAtTime(x.gain.value, now);
      x.gain.linearRampToValueAtTime(0, now + Math.max(0.02, fade));
    }
    for (const o of this.osc) {
      try {
        o.stop(now + fade + 0.1);
      } catch (e) {}
    }
    this.stopAt = now + fade + 0.2;
  }
  _scale(chord) {
    const pcs = CH[chord].map((m) => m % 12);
    const sc = this.scaleP.map((p) =>
      chord === this.dom && p === this.lead[0] ? this.lead[1] : p,
    );
    const out = [];
    for (let m = this.lo - 5; m <= this.hi + 5; m++)
      if (sc.includes(((m % 12) + 12) % 12)) out.push(m);
    return { out, pcs };
  }
  _pad(t, notes, d) {
    const c = this.c,
      R = this.R;
    const lp = F(c, "lowpass", rr(R, 500, 1000), 0.8),
      pk = F(c, "peaking", 720, 2, 5),
      pk2 = F(c, "peaking", 1150, 3, 3),
      g = G(c, 0);
    ch(lp, pk, pk2, g, this.pad);
    const a = Math.min(2.2, d * 0.4),
      rel = 3.2;
    E(g.gain, t, 0, [
      [a, 1],
      [d - a, 0.85],
      [rel, 0],
    ]);
    lp.frequency.setValueAtTime(lp.frequency.value, t);
    lp.frequency.linearRampToValueAtTime(rr(R, 800, 1700), t + d * 0.6);
    lp.frequency.linearRampToValueAtTime(rr(R, 400, 800), t + d + rel);
    for (const m of notes)
      for (const det of [-10, 0, 9]) {
        const s = O(c, "sawtooth", mtof(m), t, d + rel + 0.1);
        s.detune.value = det + (R() - 0.5) * 5;
        const sg = G(c, 0.05);
        ch(s, sg, lp);
      }
    const root = Math.min(...notes),
      sb = O(c, "sine", mtof(root - 12), t, d + rel + 0.1),
      sbg = G(c, 0);
    E(sbg.gain, t, 0, [
      [a, 0.16],
      [d - a, 0.14],
      [rel, 0],
    ]);
    ch(sb, sbg, this.g);
  }
  _note(t, m, amp) {
    mbox(
      this.c,
      this.box,
      t + (this.R() - 0.5) * 0.016,
      mtof(m),
      amp,
      this.menu ? 2.2 : 2.8,
      this.R,
      this.wow,
    );
  }
  _melody(t, chord, density, dyad) {
    const R = this.R,
      e = this.beat / 2,
      { out: sc, pcs } = this._scale(chord);
    const inR = sc.filter((m) => m >= this.lo && m <= this.hi);
    let notes = [];
    if (this.sec === "D" && this.motif && this.bar % 2 === 1) {
      notes = this.motif.map(([s, m]) => {
        if (R() < 0.25) m = pick(R, inR);
        if (R() < 0.5 && !pcs.includes(m % 12)) {
          const ct = inR.filter((x) => pcs.includes(x % 12));
          m = ct.reduce(
            (b, x) => (Math.abs(x - m) < Math.abs(b - m) ? x : b),
            ct[0],
          );
        }
        return [s, m];
      });
    } else {
      for (let s = 0; s < 8; s++) {
        const strong = s % 4 === 0 ? 1.6 : s % 2 === 0 ? 1.0 : 0.55;
        if (R() > density * strong) continue;
        let m;
        if (this.last == null || R() < 0.25 || (s === 0 && R() < 0.6)) {
          const ct = inR.filter((x) => pcs.includes(x % 12));
          m =
            this.last == null
              ? pick(R, ct)
              : ct.sort(
                  (a, b) => Math.abs(a - this.last) - Math.abs(b - this.last),
                )[Math.floor(R() * Math.min(3, ct.length))];
        } else {
          let i = sc.indexOf(this.last);
          if (i < 0) i = sc.findIndex((x) => x >= this.last);
          i = clamp(
            i + pick(R, [-2, -1, -1, -1, 1, 1, 2, -3, 3]),
            0,
            sc.length - 1,
          );
          m = sc[i];
          if (m > this.hi || m < this.lo)
            m =
              sc[
                clamp(sc.indexOf(m) + (m > this.hi ? -3 : 3), 0, sc.length - 1)
              ];
        }
        notes.push([s, m]);
        this.last = m;
      }
      if (this.sec === "D") this.motif = notes;
    }
    for (const [s, m] of notes) {
      const at = t + s * e,
        amp = (s % 4 === 0 ? 0.26 : 0.19) * rr(R, 0.8, 1.05);
      this._note(at, m, amp);
      if (R() < 0.08) {
        const i = sc.indexOf(m);
        if (i >= 0 && i + 1 < sc.length)
          this._note(at - 0.06, sc[i + 1], amp * 0.4);
      }
      if (dyad && R() < 0.35) {
        const i = sc.indexOf(m);
        if (i >= 2) this._note(at, sc[i - 2], amp * 0.6);
      }
    }
  }
  _bar(t, L) {
    const R = this.R,
      c = this.c;
    if (this.menu) {
      if (this.bar % 8 === 0) {
        const secs = ["A", "B", "C", "D"].filter((s) => s !== this.sec);
        this.sec = this.bar === 0 ? "C" : this.bar === 8 ? "A" : pick(R, secs);
        this.prog = pick(R, MENU_PROGS);
        if (this.sec === "C") {
          this.drone.gain.setValueAtTime(0.32, t);
          this.drone.gain.linearRampToValueAtTime(0.45, t + L * 3);
          this.drone.gain.linearRampToValueAtTime(0.32, t + L * 8);
        }
      }
      const chord = this.prog[Math.floor((this.bar % 8) / 2)];
      if (this.bar % 2 === 0) this._pad(t, CH[chord], 2 * L);
      const dens = { A: 0.32, B: 0.55, C: 0.1, D: 0.5 }[this.sec];
      if (!(this.bar === 0)) this._melody(t, chord, dens, this.sec === "B");
      if (R() < (this.sec === "C" ? 0.5 : 0.15) || this.bar === 0)
        bell(
          c,
          this.bell,
          t + rr(R, 0, L * 0.5),
          mtof(pick(R, [50, 57, 45, 62])),
          6,
          0.4,
        );
      return;
    }
    // gameover: fixed composition, then (loop) sparse variations or fade
    if (this.bar < 8) {
      const e = L / 4;
      this._pad(t, CH[GO_CH[this.bar]], L);
      for (const [b, m] of GO_MEL[this.bar])
        this._note(t + b * e, m + 12, this.bar === 7 ? 0.3 : 0.24);
      if (this.bar === 0) bell(c, this.bell, t, mtof(45), 7, 0.45);
      if (this.bar === 7) {
        bell(c, this.bell, t + 0.05, mtof(57), 7, 0.4);
        if (!this.loop) {
          const end = t + L * 0.6,
            f = 7;
          for (const x of [this.g, this.rv]) {
            x.gain.setValueAtTime(1, end);
            x.gain.linearRampToValueAtTime(0, end + f);
          }
          for (const o of this.osc) o.stop(end + f + 0.1);
          this.done = true;
          this.stopAt = end + f + 0.2;
        }
      }
      return;
    }
    const k = this.bar - 8;
    if (k % 8 === 0) {
      this.prog = pick(R, GO_PROGS);
      this.sec = pick(R, ["A", "C"]);
    }
    const chord = this.prog[Math.floor((k % 8) / 2)];
    if (k % 2 === 0) this._pad(t, CH[chord], 2 * L);
    this._melody(t, chord, this.sec === "A" ? 0.25 : 0.1, false);
    if (R() < 0.2) bell(c, this.bell, t, mtof(pick(R, [45, 57])), 6, 0.35);
  }
}

// ───────────────────────────────────────────────────────────── mix table
// [loudness target in dBFS of the loudest 50 ms RMS window, variant count]. Every buffer is also
// ceiling-limited to 0.8 peak (-2 dBFS). Guns dominate, foley sits under, voices behind, UI quiet.
const MIX = {
  shot_upgraded: [-15, 3],
  dryfire: [-19, 3],
  mag_out: [-18, 3],
  mag_in: [-17, 3],
  bolt_back: [-17, 3],
  bolt_forward: [-16, 3],
  slide_release: [-16, 2],
  pump: [-16, 3],
  shell_insert: [-18, 3],
  weapon_raise: [-22, 2],
  weapon_swap: [-22, 2],
  knife_swing: [-18, 3],
  knife_hit: [-13, 3],
  knife_miss: [-20, 2],
  grenade_pin: [-20, 2],
  grenade_throw: [-20, 2],
  grenade_bounce: [-16, 3],
  explosion: [-6, 3],
  aether_impact: [-10, 3],
  hitmarker: [-21, 2],
  hitmarker_kill: [-19, 2],
  headshot: [-14, 3],
  flesh_impact: [-16, 5],
  bullet_concrete: [-17, 4],
  bullet_wood: [-17, 4],
  bullet_metal: [-17, 4],
  shell_drop: [-25, 5],
  zombie_groan: [-20, 8],
  zombie_growl: [-18, 6],
  zombie_scream: [-15, 3],
  zombie_attack: [-15, 5],
  zombie_death: [-17, 5],
  zombie_spawn: [-17, 3],
  zombie_footstep: [-22, 5],
  plank_tear: [-15, 3],
  plank_place: [-16, 3],
  plank_rebuild_points: [-22, 1],
  buy: [-17, 2],
  deny: [-19, 1],
  door_open: [-13, 2],
  box_open: [-16, 2],
  box_spin: [-18, 1],
  box_close: [-16, 2],
  box_bye: [-16, 2],
  powerup_spawn: [-16, 2],
  powerup_loop: [-24, 1],
  powerup_grab: [-15, 2],
  maxammo: [-12, 1],
  instakill: [-12, 1],
  doublepoints: [-12, 1],
  nuke: [-12, 1],
  carpenter: [-12, 1],
  powerup_end: [-18, 1],
  player_hurt: [-14, 4],
  heartbeat: [-16, 2],
  player_down: [-12, 1],
  footstep_concrete: [-23, 6],
  footstep_wood: [-23, 6],
  jump: [-24, 2],
  land: [-19, 3],
  perk_drink: [-17, 1],
  perk_burp: [-15, 2],
  power_switch: [-12, 1],
  ui_hover: [-30, 2],
  ui_click: [-25, 2],
  ambient_wind: [-23, 1],
  ambient_drone: [-23, 1],
  ads_in: [-22, 3],
  ads_out: [-24, 3],
  gear_rattle: [-25, 5],
  jump_foley: [-24, 3],
  slide_step: [-19, 4],
  breath_exhausted: [-20, 3],
  revive_start: [-18, 2],
  revive_loop: [-24, 1],
  revive_done: [-15, 2],
  player_join: [-20, 1],
  player_leave: [-20, 1],
  chat: [-24, 2],
  teammate_down: [-16, 1],
  bleedout: [-14, 1],
};
for (const [name, [loud, n]] of Object.entries(MIX))
  if (DEFS[name]) Object.assign(DEFS[name], { loud, n, vol: 1 });
DEFS.explosion.soft = 2.2;
for (const n of [
  "knife_hit",
  "headshot",
  "bullet_concrete",
  "bullet_wood",
  "bullet_metal",
  "flesh_impact",
  "power_switch",
  "door_open",
])
  DEFS[n].soft = 1.5;
const CEIL = 0.8;
// background render order (first pass renders 1–2 variants of each, second pass the rest)
const PRIORITY = [
  "ui_hover",
  "ui_click",
  "shot_pistol",
  "dryfire",
  "mag_out",
  "mag_in",
  "slide_release",
  "weapon_raise",
  "ads_in",
  "ads_out",
  "hitmarker",
  "hitmarker_kill",
  "zombie_groan",
  "footstep_concrete",
  "flesh_impact",
  "headshot",
  "bullet_concrete",
  "zombie_attack",
  "zombie_death",
  "zombie_spawn",
  "zombie_footstep",
  "plank_tear",
  "ambient_wind",
  "ambient_drone",
  "knife_swing",
  "knife_hit",
  "knife_miss",
  "player_hurt",
  "buy",
  "deny",
  "shell_drop",
  "plank_place",
  "plank_rebuild_points",
  "zombie_growl",
  "zombie_scream",
  "weapon_swap",
  "land",
  "jump",
  "shot_rifle",
  "bolt_back",
  "bolt_forward",
  "shot_shotgun",
  "pump",
  "shell_insert",
  "shot_smg",
  "shot_smg2",
  "shot_assault",
  "shot_lmg",
  "shot_aether",
  "aether_impact",
  "shot_upgraded",
  "grenade_pin",
  "grenade_throw",
  "grenade_bounce",
  "explosion",
  "bullet_wood",
  "bullet_metal",
  "footstep_wood",
  "door_open",
  "box_open",
  "box_spin",
  "box_close",
  "box_bye",
  "powerup_spawn",
  "powerup_loop",
  "powerup_grab",
  "maxammo",
  "instakill",
  "doublepoints",
  "nuke",
  "carpenter",
  "powerup_end",
  "heartbeat",
  "player_down",
  "perk_drink",
  "perk_burp",
  "power_switch",
  "gear_rattle",
  "jump_foley",
  "slide_step",
  "breath_exhausted",
  "player_join",
  "player_leave",
  "chat",
  "teammate_down",
  "revive_start",
  "revive_loop",
  "revive_done",
  "bleedout",
];
// gun layers: tail + mech right behind their core, distant variants after the first-pass essentials
for (let i = PRIORITY.length - 1; i >= 0; i--) {
  const n = PRIORITY[i];
  if (DEFS[n] && DEFS[n].gun)
    PRIORITY.splice(
      i + 1,
      0,
      ...[n + ":tail", n + ":mech"].filter((x) => DEFS[x]),
    );
}
PRIORITY.splice(
  PRIORITY.indexOf("shot_rifle"),
  0,
  ...Object.keys(GUNS).map((n) => n + ":far"),
);
for (const n of Object.keys(DEFS)) if (!PRIORITY.includes(n)) PRIORITY.push(n);

// ───────────────────────────────────────────────────────────── offline rendering
const LOOPXF = 1.0;
const RSTATS = [];
function maxWindowRms(chans, sr) {
  const w = Math.max(1, Math.floor(sr * 0.05)),
    hop = Math.max(1, w >> 2),
    n = chans[0].length,
    nc = chans.length;
  if (n <= w) {
    let sum = 0;
    for (let i = 0; i < n; i++) {
      let x = 0;
      for (let k = 0; k < nc; k++) x += chans[k][i];
      x /= nc;
      sum += x * x;
    }
    return Math.sqrt(sum / Math.max(1, n));
  }
  const sq = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    let x = chans[0][i];
    for (let k = 1; k < nc; k++) x += chans[k][i];
    x /= nc;
    sq[i] = x * x;
  }
  let sum = 0;
  for (let i = 0; i < w; i++) sum += sq[i];
  let best = sum;
  for (let s = 0; s + w < n; s++) {
    sum += sq[s + w] - sq[s];
    if ((s & (hop - 1)) === 0 && sum > best) best = sum;
  }
  return Math.sqrt(Math.max(0, best) / w);
}
// deferred construction for offline contexts: group callbacks per render quantum, run them at suspend() points
function installDefer(
  oc,
  sr,
  run = (fn) => {
    try {
      fn();
    } catch (e) {
      console.error("[audio] deferred build failed", e);
    }
  },
) {
  const Q = 128,
    pend = new Map(),
    ctl = { started: false };
  oc.__defer = (time, fn) => {
    const cur = ctl.started ? Math.round(oc.currentTime * sr) : 0;
    const q = Math.floor((Math.max(0, time) * sr) / Q) * Q;
    if (q <= cur || q >= oc.length) return run(fn);
    let list = pend.get(q);
    if (!list) {
      list = [];
      pend.set(q, list);
      oc.suspend(q / sr)
        .then(
          () => {
            pend.delete(q);
            for (const f of list) run(f);
          },
          (e) => {
            console.warn("[audio] suspend rejected", q, e && e.message);
            for (const f of list) run(f);
          },
        )
        .finally(() => oc.resume().catch(() => {}));
    }
    list.push(fn);
  };
  return ctl;
}
async function renderDef(name, d, sr, v0 = 0, v1 = d.n) {
  v1 = Math.min(v1, d.n);
  const n = v1 - v0;
  if (n <= 0) return [];
  const Q = 128,
    slot = d.dur + (d.loop ? LOOPXF : 0) + 0.06,
    slotN = Math.ceil((slot * sr) / Q) * Q;
  const tb = performance.now();
  const oc = new OfflineAudioContext({
    numberOfChannels: d.ch,
    length: slotN * n,
    sampleRate: sr,
  });
  let buildMs = 0;
  const run = (fn) => {
    const t = performance.now();
    try {
      fn();
    } catch (e) {
      console.error(`[audio] build failed: ${name}`, e);
    }
    buildMs += performance.now() - t;
  };
  const ctl = installDefer(oc, sr, run);
  for (let j = 0; j < n; j++) {
    const v = v0 + j,
      t0 = (j * slotN) / sr;
    oc.__defer(t0, () => {
      const o = G(oc, 1);
      o.connect(oc.destination);
      d.build(oc, o, t0 + 0.001, rng(hash(name) + v * 7919), v);
    });
  }
  const tr = performance.now();
  ctl.started = true;
  const buf = await oc.startRendering();
  const te = performance.now();
  const out = [];
  for (let j = 0; j < n; j++) {
    const chans = [];
    for (let k = 0; k < d.ch; k++)
      chans.push(buf.getChannelData(k).subarray(j * slotN, (j + 1) * slotN));
    let peak = 0;
    const Rdc = 1 - (TAU * 18) / sr; // one-pole DC blocker (~18 Hz)
    for (const A of chans) {
      let xp = 0,
        yp = 0;
      for (let i = 0; i < A.length; i++) {
        let x = A[i];
        if (x !== x) x = 0;
        const y = x - xp + Rdc * yp;
        xp = x;
        yp = y;
        A[i] = y;
        const a = Math.abs(y);
        if (a > peak) peak = a;
      }
    }
    if (peak < 1e-6) {
      console.warn(`[audio] silent render: ${name}#${v0 + j}`);
      continue;
    }
    if (d.soft) {
      // soft-knee saturation: lowers crest factor so transient-heavy sounds read louder
      const k0 = d.soft / peak,
        nrm = 1 / Math.tanh(d.soft);
      peak = 0;
      for (const A of chans)
        for (let i = 0; i < A.length; i++) {
          const y = Math.tanh(A[i] * k0) * nrm;
          A[i] = y;
          const a = Math.abs(y);
          if (a > peak) peak = a;
        }
    }
    const loud = maxWindowRms(chans, sr);
    const k = Math.min(
      CEIL / peak,
      loud > 0 ? Math.pow(10, (d.loud ?? -14) / 20) / loud : Infinity,
    );
    let len = slotN;
    if (d.loop) {
      len = Math.floor(d.dur * sr);
      const xf = Math.floor(LOOPXF * sr);
      for (const A of chans)
        for (let i = 0; i < xf; i++) {
          const a = i / xf;
          A[i] =
            A[i] * Math.sin((a * Math.PI) / 2) +
            A[len + i] * Math.cos((a * Math.PI) / 2);
        }
    } else {
      const thr = 3e-4 / k;
      let last = 0;
      for (const A of chans)
        for (let i = A.length - 1; i > last; i--)
          if (Math.abs(A[i]) > thr) {
            last = i;
            break;
          }
      len = Math.max(64, Math.min(slotN, last + Math.floor(0.012 * sr)));
    }
    const ab = new AudioBuffer({
      length: len,
      numberOfChannels: d.ch,
      sampleRate: sr,
    });
    chans.forEach((A, ci) => {
      const D = ab.getChannelData(ci);
      for (let i = 0; i < len; i++) D[i] = A[i] * k;
      if (!d.loop) {
        const f = Math.min(len, Math.floor(0.008 * sr));
        for (let i = 0; i < f; i++) D[len - 1 - i] *= i / f;
      }
    });
    out.push(ab);
  }
  RSTATS.push({
    at: +performance.now().toFixed(0),
    name,
    v0,
    v1,
    buildMs: +buildMs.toFixed(1),
    renderMs: +(te - tr).toFixed(1),
    postMs: +(performance.now() - te).toFixed(1),
  });
  return out;
}

export function analyzeBuffer(ab) {
  let peak = 0,
    sum = 0,
    nan = 0,
    n = 0,
    dc = 0;
  for (let k = 0; k < ab.numberOfChannels; k++) {
    const A = ab.getChannelData(k);
    for (let i = 0; i < A.length; i++) {
      const x = A[i];
      if (x !== x) {
        nan++;
        continue;
      }
      const a = Math.abs(x);
      if (a > peak) peak = a;
      sum += x * x;
      dc += x;
      n++;
    }
  }
  const chans = [];
  for (let k = 0; k < ab.numberOfChannels; k++)
    chans.push(ab.getChannelData(k));
  const db = (x) => (x > 0 ? +(20 * Math.log10(x)).toFixed(1) : -Infinity);
  return {
    dur: +ab.duration.toFixed(3),
    peak: +peak.toFixed(3),
    peakDb: db(peak),
    rmsDb: db(Math.sqrt(sum / Math.max(1, n))),
    loudDb: db(maxWindowRms(chans, ab.sampleRate)),
    dc: +(dc / Math.max(1, n)).toFixed(5),
    nan,
  };
}

// ───────────────────────────────────────────────────────────── mix graph
const SFX_TRIM = 0.82; // headroom into the bus compressor
const REMOTE_GUN = 0.7; // teammates' guns sit ~3 dB under your own (on top of distance rolloff)
function buildGraph(ctx, vol, ir, raw = false) {
  const g = {};
  g.master = G(ctx, vol.master);
  // Glue compressor: wide knee, low ratio, slow-ish release so sustained fire holds a steady, small
  // reduction instead of pumping the groans; then a fast peak limiter that only catches overs.
  // (WebAudio compressors add automatic make-up gain, so thresholds sit high to keep it small: guns stay on top.)
  g.comp = new DynamicsCompressorNode(ctx, {
    threshold: -8,
    knee: 10,
    ratio: 2,
    attack: 0.012,
    release: 0.45,
  });
  g.lim = new DynamicsCompressorNode(ctx, {
    threshold: -1.5,
    knee: 0,
    ratio: 20,
    attack: 0.001,
    release: 0.1,
  });
  g.out = G(ctx, 0.93);
  if (raw) ch(g.master, g.out, ctx.destination);
  else ch(g.master, g.comp, g.lim, g.out, ctx.destination); // raw: measure the pre-dynamics sum
  g.duckIn = G(ctx, 1);
  g.duckLP = F(ctx, "lowpass", 18000, 0.6);
  ch(g.duckIn, g.duckLP, g.master);
  g.sfxBus = G(ctx, vol.sfx * SFX_TRIM);
  g.sfxBus.connect(g.duckIn);
  g.musicBus = G(ctx, vol.music);
  g.musicBus.connect(g.duckIn);
  g.bedBus = G(ctx, 1);
  g.bedBus.connect(g.musicBus);
  g.uiBus = G(ctx, vol.sfx);
  g.uiBus.connect(g.master);
  g.conv = ctx.createConvolver();
  g.conv.buffer = ir;
  g.revIn = G(ctx, 1);
  g.revOut = G(ctx, 0.8);
  ch(g.revIn, F(ctx, "highpass", 140), g.conv, g.revOut, g.duckIn);
  g.musicRev = G(ctx, vol.music);
  g.musicRev.connect(g.conv);
  return g;
}
const smoothstep = (a, b, x) => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};

// A mixer = a context + graph + voice bookkeeping. The engine has one on the realtime context;
// tests build extra ones on OfflineAudioContexts to measure the whole chain (limiter included).
class Mixer {
  constructor(eng, ctx, gr) {
    this.eng = eng;
    this.ctx = ctx;
    this.gr = gr;
    this.voices = {};
    this.all = [];
    this.last = {};
    this.bags = {};
    this.lpos = null;
    this.maxVoices = 72;
  }
  _dist(p) {
    const l = this.lpos || { x: 0, y: 0, z: 0 };
    return Math.hypot((p.x || 0) - l.x, (p.y || 0) - l.y, (p.z || 0) - l.z);
  }
  _rr(key, n) {
    // shuffled round-robin, never the same variant twice in a row
    let bag = this.bags[key];
    if (!bag || !bag.length || bag.n !== n) {
      bag = [];
      for (let i = 0; i < n; i++) bag.push(i);
      for (let i = n - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [bag[i], bag[j]] = [bag[j], bag[i]];
      }
      if (n > 1 && bag[bag.length - 1] === this.last[key])
        [bag[0], bag[bag.length - 1]] = [bag[bag.length - 1], bag[0]];
      bag.n = n;
      this.bags[key] = bag;
    }
    const i = bag.pop();
    this.last[key] = i;
    return i;
  }
  _cap(name, d, when) {
    // voice stealing happens at the new voice's start time (matters for scheduled/offline use)
    const arr = this.voices[name] || (this.voices[name] = []);
    while (arr.length >= d.cap) arr.shift().stop(0.025, when);
    if (this.all.length >= this.maxVoices) {
      const v = this.all.find((x) => !x.loop && !x._stopping) || this.all[0];
      if (v) v.stop(0.03, when);
    }
    return arr;
  }
  _panner(d, p) {
    return new PannerNode(this.ctx, {
      panningModel: "HRTF",
      distanceModel: "inverse",
      refDistance: d.ref ?? 2,
      rolloffFactor: d.roll ?? 1.1,
      maxDistance: 120,
      positionX: p.x || 0,
      positionY: p.y || 0,
      positionZ: p.z || 0,
    });
  }
  _track(name, h, arr, nodes) {
    arr.push(h);
    this.all.push(h);
    h._done = () => {
      if (h.ended) return;
      h.ended = true;
      const i = arr.indexOf(h);
      if (i >= 0) arr.splice(i, 1);
      const j = this.all.indexOf(h);
      if (j >= 0) this.all.splice(j, 1);
      try {
        for (const n of nodes) if (n) n.disconnect();
      } catch (e) {}
    };
  }

  play(name, d, list, o = {}, when) {
    const ctx = this.ctx,
      now = when ?? ctx.currentTime;
    const idx =
      o.variant != null
        ? ((o.variant % list.length) + list.length) % list.length
        : this._rr(name, list.length);
    const arr = this._cap(name, d, now);
    const src = ctx.createBufferSource();
    src.buffer = list[idx];
    const loop = !!(o.loop ?? d.loop);
    src.loop = loop;
    src.playbackRate.value =
      (o.pitch ?? 1) * (1 + (Math.random() * 2 - 1) * (d.jit ?? 0.03));
    const g = G(
      ctx,
      (o.volume ?? 1) * d.vol * (loop ? 1 : 1 + (Math.random() - 0.5) * 0.14),
    );
    src.connect(g);
    const bus = d.bus === "ui" ? this.gr.uiBus : this.gr.sfxBus;
    let pan = null,
      send = null,
      revAmt = d.bus === "ui" ? 0 : d.rev;
    if (o.position) {
      pan = this._panner(d, o.position);
      g.connect(pan);
      pan.connect(bus);
      const ref = d.ref ?? 2,
        roll = d.roll ?? 1.1,
        dist = this._dist(o.position);
      revAmt *= clamp(
        Math.sqrt(ref / (ref + roll * (Math.max(dist, ref) - ref))) * 1.15,
        0.12,
        1.15,
      ); // distant = wetter
    } else g.connect(bus);
    if (revAmt > 0) {
      send = G(ctx, revAmt);
      g.connect(send);
      send.connect(this.gr.revIn);
    }
    src.start(now);
    const h = {
      name,
      loop,
      ended: false,
      src,
      gain: g,
      panner: pan,
      stop: (fade = 0.05, at) => {
        if (h.ended || h._stopping) return;
        h._stopping = true;
        const t = Math.max(ctx.currentTime, at || 0);
        fade = Math.max(0.005, fade);
        g.gain.cancelScheduledValues(t);
        g.gain.setValueAtTime(g.gain.value, t);
        g.gain.linearRampToValueAtTime(0, t + fade);
        try {
          src.stop(t + fade + 0.01);
        } catch (e) {}
      },
      setVolume: (v, ramp = 0.05) => {
        if (!h._stopping)
          g.gain.setTargetAtTime(
            v * d.vol,
            ctx.currentTime,
            Math.max(0.001, ramp / 3),
          );
      },
      setPitch: (p) => {
        src.playbackRate.setTargetAtTime(p, ctx.currentTime, 0.02);
      },
      setPosition: (p) => {
        if (!pan || !p) return;
        const t = ctx.currentTime;
        pan.positionX.setTargetAtTime(p.x, t, 0.02);
        pan.positionY.setTargetAtTime(p.y, t, 0.02);
        pan.positionZ.setTargetAtTime(p.z, t, 0.02);
      },
    };
    this._track(name, h, arr, [g, pan, send]);
    src.onended = () => h._done();
    return h;
  }

  // Layered gunshot: core + tail (+ mech) near, crossfading to the :far layer with distance.
  playGun(name, d, o = {}, when) {
    const ctx = this.ctx,
      B = this.eng.bufs,
      now = when ?? ctx.currentTime;
    const core = B[name] || [],
      tail = B[name + ":tail"] || [],
      far = B[name + ":far"] || [],
      mech = B[name + ":mech"] || [];
    const positional = !!o.position,
      hasDist = positional || o.distance != null;
    const dist = o.distance ?? (positional ? this._dist(o.position) : 0);
    let wFar = hasDist ? smoothstep(18, 28, dist) : 0;
    if (!far.length) wFar = 0;
    if (!core.length) wFar = 1;
    if (!core.length && !far.length) return NOOP;
    const delay = hasDist ? Math.min(dist / 343, 0.25) : 0,
      t0 = now + delay;
    const arr = this._cap(name, d, t0);
    const ref = d.ref ?? 6,
      roll = d.roll ?? 0.9,
      direct = hasDist ? ref / (ref + roll * (Math.max(dist, ref) - ref)) : 1;
    let vol = (o.volume ?? 1) * d.vol * (1 + (Math.random() - 0.5) * 0.08);
    if (hasDist && !positional) vol *= direct; // distance given without a position: attenuate by hand
    if (positional) vol *= REMOTE_GUN;
    const gb = G(ctx, vol);
    let pan = null;
    if (positional) {
      pan = this._panner(d, o.position);
      gb.connect(pan);
      pan.connect(this.gr.sfxBus);
    } else gb.connect(this.gr.sfxBus);
    const send = G(
      ctx,
      d.rev *
        (1 + 2.5 * wFar) *
        (positional ? 1.3 * clamp(Math.sqrt(direct) * 1.15, 0.12, 1.15) : 1),
    );
    gb.connect(send);
    send.connect(this.gr.revIn); // distant = wetter, but still falls off
    const srcs = [],
      nodes = [gb, pan, send];
    const pitch = (o.pitch ?? 1) * (1 + (Math.random() * 2 - 1) * 0.03);
    const add = (key, list, gain, at, rate, filt) => {
      const s = ctx.createBufferSource();
      s.buffer = list[this._rr(key, list.length)];
      s.playbackRate.value = rate;
      const g = G(ctx, gain);
      if (filt) {
        s.connect(filt);
        filt.connect(g);
        nodes.push(filt);
      } else s.connect(g);
      g.connect(gb);
      nodes.push(g);
      s.start(at);
      srcs.push(s);
    };
    if (wFar < 1 && core.length) {
      const near = Math.cos((wFar * Math.PI) / 2);
      // per-shot tone variation so consecutive rounds are never identical
      const filt = F(
        ctx,
        "peaking",
        600 + Math.random() * 2800,
        0.8,
        (Math.random() * 2 - 1) * 3,
      );
      add(name, core, near, t0, pitch, filt);
      if (tail.length)
        add(
          name + ":tail",
          tail,
          near * (0.85 + Math.random() * 0.2),
          t0 + Math.random() * 0.004,
          pitch * (1 + (Math.random() * 2 - 1) * 0.02),
        );
      if (mech.length && Math.random() < 0.9)
        add(
          name + ":mech",
          mech,
          near * (0.5 + Math.random() * 0.5),
          t0 + Math.random() * 0.003,
          1 + (Math.random() * 2 - 1) * 0.05,
        );
    }
    if (wFar > 0 && far.length)
      add(
        name + ":far",
        far,
        Math.sin((wFar * Math.PI) / 2),
        t0,
        pitch * (1 + (Math.random() * 2 - 1) * 0.02),
      );
    let left = srcs.length;
    const h = {
      name,
      loop: false,
      ended: false,
      far: wFar,
      delay,
      stop: (fade = 0.04, at) => {
        if (h.ended || h._stopping) return;
        h._stopping = true;
        const t = Math.max(ctx.currentTime, at || 0);
        fade = Math.max(0.005, fade);
        gb.gain.cancelScheduledValues(t);
        gb.gain.setValueAtTime(gb.gain.value, t);
        gb.gain.linearRampToValueAtTime(0, t + fade);
        for (const s of srcs) {
          try {
            s.stop(Math.max(t, t0) + fade + 0.01);
          } catch (e) {}
        }
      },
      setVolume: (v, ramp = 0.05) => {
        if (!h._stopping)
          gb.gain.setTargetAtTime(
            v * d.vol * (positional ? REMOTE_GUN : 1),
            ctx.currentTime,
            Math.max(0.001, ramp / 3),
          );
      },
      setPitch: (p) => {
        for (const s of srcs)
          s.playbackRate.setTargetAtTime(p, ctx.currentTime, 0.02);
      },
      setPosition: (p) => {
        if (!pan || !p) return;
        const t = ctx.currentTime;
        pan.positionX.setTargetAtTime(p.x, t, 0.02);
        pan.positionY.setTargetAtTime(p.y, t, 0.02);
        pan.positionZ.setTargetAtTime(p.z, t, 0.02);
      },
    };
    this._track(name, h, arr, nodes);
    for (const s of srcs)
      s.onended = () => {
        if (--left <= 0) h._done();
      };
    return h;
  }
}

// ───────────────────────────────────────────────────────────── engine
const NOOP = Object.freeze({
  stop() {},
  setVolume() {},
  setPosition() {},
  setPitch() {},
  ended: true,
  name: null,
});

export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.ready = false;
    this.bufs = {};
    this.mx = null;
    this._warned = new Set();
    this.initMs = 0;
    this.loadMs = 0;
    this.firstPassMs = 0;
    this.vol = { master: 1, music: 0.6, sfx: 1 };
    this.music = null;
    this._ducked = false;
    this.names = Object.keys(DEFS).filter((n) => !n.includes(":"));
    this.stingNames = Object.keys(STINGS);
    this.musicNames = ["menu", "gameover"];
    this.renderStats = RSTATS;
    this._jobs = [];
    this._waiters = {};
    this._loadedP = null;
    // The loader starts at construction (OfflineAudioContext needs no user gesture) and doesn't wait on
    // the realtime context, so by the time init() runs from the first click most buffers already exist.
    if (
      typeof window !== "undefined" &&
      typeof OfflineAudioContext !== "undefined"
    )
      setTimeout(() => {
        this._startLoader(this.ctx ? this.ctx.sampleRate : 48000);
        setTimeout(() => this._boot(), 0);
      }, 0);
  }
  _boot() {
    if (this.ctx) return;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AC({ latencyHint: "interactive" });
    } catch (e) {
      console.warn("[audio] context unavailable", e);
    }
  }
  async init() {
    if (!this._initP) this._initP = this._init();
    return this._initP;
  }
  async _init() {
    const t0 = performance.now();
    this._boot();
    const ctx = this.ctx;
    if (!ctx) return this;
    this._startLoader(ctx.sampleRate);
    const tc = performance.now();
    // init() is called from a user gesture: resume synchronously inside it (never block on the promise)
    try {
      const p = ctx.resume();
      if (p && p.catch) p.catch(() => {});
    } catch (e) {}
    if (typeof document !== "undefined" && ctx.state !== "running") {
      const kick = () => {
        if (ctx.state !== "running") ctx.resume().catch(() => {});
        else
          ["pointerdown", "keydown", "touchend"].forEach((e) =>
            document.removeEventListener(e, kick, true),
          );
      };
      ["pointerdown", "keydown", "touchend"].forEach((e) =>
        document.addEventListener(e, kick, true),
      );
    }
    const tn = performance.now();
    this.ir = makeIR(ctx.sampleRate, 1.6);
    this.gr = buildGraph(ctx, this.vol, this.ir);
    Object.assign(this, {
      master: this.gr.master,
      sfxBus: this.gr.sfxBus,
      musicBus: this.gr.musicBus,
      bedBus: this.gr.bedBus,
      uiBus: this.gr.uiBus,
      conv: this.gr.conv,
      revIn: this.gr.revIn,
      musicRev: this.gr.musicRev,
      duckIn: this.gr.duckIn,
      duckLP: this.gr.duckLP,
    });
    this.mx = new Mixer(this, ctx, this.gr);
    this.ready = true;
    this.initMs = performance.now() - t0;
    this.initBreakdown = {
      context: +(tc - t0).toFixed(1),
      resume: +(tn - tc).toFixed(1),
      graphAndIR: +(performance.now() - tn).toFixed(1),
    };
    this._timer = setInterval(() => this._tick(), 50);
    return this;
  }

  // ── background pre-render queue ──
  _startLoader(sr) {
    if (this._loaderStarted) return;
    this._loaderStarted = true;
    const t0 = performance.now();
    this._sr = sr;
    makeNoise(sr);
    const first = (d) => Math.min(d.n, d.dur > 2.5 ? 1 : 2);
    for (const name of PRIORITY) {
      const d = DEFS[name];
      this.bufs[name] = [];
      this._jobs.push({ name, v0: 0, v1: first(d) });
    }
    for (const name of PRIORITY) {
      const d = DEFS[name];
      for (let v = first(d); v < d.n; v += 2)
        this._jobs.push({ name, v0: v, v1: Math.min(d.n, v + 2) });
    }
    this._firstPassLeft = PRIORITY.length;
    let doneResolve;
    this._loadedP = new Promise((r) => (doneResolve = r));
    const CONC = 3;
    let running = 0;
    const next = () => {
      while (running < CONC && this._jobs.length) {
        const job = this._jobs.shift();
        running++;
        renderDef(job.name, DEFS[job.name], this._sr, job.v0, job.v1)
          .then((bufs) => {
            this.bufs[job.name].push(...bufs);
            if (job.v0 === 0) {
              if (--this._firstPassLeft === 0)
                this.firstPassMs = performance.now() - t0;
              const w = this._waiters[job.name];
              if (w) {
                delete this._waiters[job.name];
                w.forEach((f) => f());
              }
            }
          })
          .catch((e) => console.error("[audio] render failed", job.name, e))
          .finally(() => {
            running--;
            if (!this._jobs.length && !running) {
              this.loadMs = performance.now() - t0;
              doneResolve();
            } else setTimeout(next, 0); // yield to the game loop between jobs
          });
      }
    };
    next();
  }
  _request(name) {
    // bump a not-yet-rendered sound (and its layers) to the front of the queue
    for (const n of [name + ":mech", name + ":tail", name]) {
      const i = this._jobs.findIndex((j) => j.name === n && j.v0 === 0);
      if (i > 0) this._jobs.unshift(this._jobs.splice(i, 1)[0]);
    }
  }
  whenLoaded() {
    return this._loadedP || Promise.resolve();
  }
  isLoaded(name) {
    return !!(this.bufs[name] && this.bufs[name].length);
  }
  _warn(name) {
    if (!this._warned.has(name)) {
      this._warned.add(name);
      console.warn(`[audio] unknown sound "${name}"`);
    }
  }

  play(name, o = {}) {
    const d = DEFS[name];
    if (!d) {
      this._warn(name);
      return NOOP;
    }
    if (!this.ready) return NOOP;
    const launch = (opts) =>
      d.gun
        ? this.mx.playGun(name, d, opts)
        : this.mx.play(name, d, this.bufs[name], opts);
    if (this.isLoaded(name)) return launch(o);
    // not rendered yet: render it next, and start it if it arrives quickly (loops always start)
    this._request(name);
    const loop = !!(o.loop ?? d.loop),
      asked = this.ctx.currentTime;
    const opts = {
      ...o,
      position: o.position
        ? { x: o.position.x, y: o.position.y, z: o.position.z }
        : undefined,
    };
    const h = {
      name,
      loop,
      _real: null,
      _cancel: false,
      _gone: false,
      get ended() {
        return h._real ? h._real.ended : h._gone;
      },
      stop: (f) => {
        h._cancel = true;
        if (h._real) h._real.stop(f);
        else h._gone = true;
      },
      setVolume: (v, r) => {
        opts.volume = v;
        if (h._real) h._real.setVolume(v, r);
      },
      setPitch: (p) => {
        opts.pitch = p;
        if (h._real) h._real.setPitch(p);
      },
      setPosition: (p) => {
        if (opts.position) opts.position = { x: p.x, y: p.y, z: p.z };
        if (h._real) h._real.setPosition(p);
      },
    };
    (this._waiters[name] || (this._waiters[name] = [])).push(() => {
      if (h._cancel || (!loop && this.ctx.currentTime - asked > 0.3)) {
        h._gone = true;
        return;
      }
      h._real = launch(opts);
    });
    return h;
  }

  playMusic(name, { loop } = {}) {
    if (!this.ready) return;
    if (name !== "menu" && name !== "gameover") {
      this._warn("music:" + name);
      return;
    }
    if (
      this.music &&
      !this.music.dead &&
      this.music.kind === name &&
      !this.music.done
    )
      return;
    if (this.music) this.music.stop(1.5);
    this.music = new Music(this.ctx, this.bedBus, this.musicRev, name, {
      loop,
    });
    this.music.schedule(this.ctx.currentTime + 0.5);
  }
  stopMusic(fade = 1) {
    if (this.music) {
      this.music.stop(fade);
      this.music = null;
    }
  }

  sting(name, opts = {}) {
    const s = STINGS[name];
    if (!s) {
      this._warn("sting:" + name);
      return NOOP;
    }
    if (!this.ready) return NOOP;
    const ctx = this.ctx,
      t = ctx.currentTime + 0.03,
      g = G(ctx, s.gain ?? 1),
      w = G(ctx, s.gain ?? 1);
    g.connect(this.musicBus);
    w.connect(this.musicRev);
    try {
      s.fn(ctx, g, w, t, rng((Math.random() * 1e9) | 0), opts);
    } catch (e) {
      console.error("[audio] sting failed", name, e);
    }
    // dip the music bed under the stinger
    const bg = this.bedBus.gain;
    bg.cancelScheduledValues(t);
    bg.setValueAtTime(bg.value, t);
    bg.linearRampToValueAtTime(0.4, t + 0.3);
    bg.setValueAtTime(0.4, t + s.len * 0.7);
    bg.linearRampToValueAtTime(1, t + s.len + 0.5);
    setTimeout(
      () => {
        try {
          g.disconnect();
          w.disconnect();
        } catch (e) {}
      },
      (s.len + 2.5) * 1000,
    );
    return {
      name,
      ended: false,
      stop: (fade = 0.3) => {
        const n = ctx.currentTime;
        for (const x of [g, w]) {
          x.gain.cancelScheduledValues(n);
          x.gain.setValueAtTime(x.gain.value, n);
          x.gain.linearRampToValueAtTime(0, n + fade);
        }
      },
      setVolume: (v) => {
        g.gain.value = v * (s.gain ?? 1);
        w.gain.value = v * (s.gain ?? 1);
      },
      setPosition() {},
      setPitch() {},
    };
  }

  setListener(pos, q) {
    if (!this.ctx || !pos) return;
    const L = this.ctx.listener;
    let fx = 0,
      fy = 0,
      fz = -1,
      ux = 0,
      uy = 1,
      uz = 0;
    if (q) {
      const { x, y, z, w } = q;
      const rot = (vx, vy, vz) => {
        const tx = 2 * (y * vz - z * vy),
          ty = 2 * (z * vx - x * vz),
          tz = 2 * (x * vy - y * vx);
        return [
          vx + w * tx + (y * tz - z * ty),
          vy + w * ty + (z * tx - x * tz),
          vz + w * tz + (x * ty - y * tx),
        ];
      };
      [fx, fy, fz] = rot(0, 0, -1);
      [ux, uy, uz] = rot(0, 1, 0);
    }
    this._lpos = { x: pos.x, y: pos.y, z: pos.z };
    if (this.mx) this.mx.lpos = this._lpos;
    if (L.positionX) {
      L.positionX.value = pos.x;
      L.positionY.value = pos.y;
      L.positionZ.value = pos.z;
      L.forwardX.value = fx;
      L.forwardY.value = fy;
      L.forwardZ.value = fz;
      L.upX.value = ux;
      L.upY.value = uy;
      L.upZ.value = uz;
    } else {
      L.setPosition(pos.x, pos.y, pos.z);
      L.setOrientation(fx, fy, fz, ux, uy, uz);
    }
  }

  setVolume(v = {}) {
    for (const k of ["master", "music", "sfx"])
      if (typeof v[k] === "number" && isFinite(v[k]))
        this.vol[k] = clamp(v[k], 0, 1);
    if (!this.ctx || !this.gr) return;
    const t = this.ctx.currentTime,
      g = this.gr;
    g.master.gain.setTargetAtTime(this.vol.master, t, 0.03);
    g.musicBus.gain.setTargetAtTime(this.vol.music, t, 0.03);
    g.musicRev.gain.setTargetAtTime(this.vol.music, t, 0.03);
    g.sfxBus.gain.setTargetAtTime(this.vol.sfx * SFX_TRIM, t, 0.03);
    g.uiBus.gain.setTargetAtTime(this.vol.sfx, t, 0.03);
  }

  setDucked(on) {
    on = !!on;
    if (on === this._ducked) return;
    this._ducked = on;
    if (!this.ctx || !this.gr) return;
    const t = this.ctx.currentTime,
      g = this.gr;
    g.duckLP.frequency.cancelScheduledValues(t);
    g.duckLP.frequency.setTargetAtTime(on ? 650 : 18000, t, on ? 0.12 : 0.25);
    g.duckIn.gain.cancelScheduledValues(t);
    g.duckIn.gain.setTargetAtTime(on ? 0.55 : 1, t, 0.15);
  }

  _tick() {
    if (!this.ctx) return;
    const m = this.music;
    if (m) {
      m.schedule(this.ctx.currentTime + 0.5);
      if (m.done && m.stopAt && this.ctx.currentTime > m.stopAt)
        this.music = null;
    }
  }
  update(dt) {
    if (this.ready) this._tick();
  }

  // ── test hooks ──
  // kind 'sound' returns variant 0 exactly as play() would use it (normalised, with the mix trim applied).
  async renderOffline(kind, name, seconds = 8, opts = {}) {
    const sr = this._sr || (this.ctx ? this.ctx.sampleRate : 48000);
    makeNoise(sr);
    if (kind === "sound") {
      const d = DEFS[name];
      const [b] = await renderDef(
        name,
        d,
        sr,
        opts.variant ?? 0,
        (opts.variant ?? 0) + 1,
      );
      for (let k = 0; k < b.numberOfChannels; k++) {
        const A = b.getChannelData(k);
        for (let i = 0; i < A.length; i++) A[i] *= d.vol;
      }
      return b;
    }
    const oc = new OfflineAudioContext({
      numberOfChannels: 2,
      length: Math.ceil(seconds * sr),
      sampleRate: sr,
    });
    const ctl = installDefer(oc, sr);
    const out = G(oc, this.vol.music);
    out.connect(oc.destination);
    const cv = oc.createConvolver();
    cv.buffer = this.ir || makeIR(sr);
    const rv = G(oc, 0.8);
    ch(cv, rv, out);
    if (kind === "sting") {
      const sg = G(oc, STINGS[name].gain ?? 1),
        sw = G(oc, STINGS[name].gain ?? 1);
      sg.connect(out);
      sw.connect(cv);
      STINGS[name].fn(oc, sg, sw, 0.01, rng(opts.seed ?? 5), opts);
    } else if (kind === "music") {
      const m = new Music(oc, out, cv, name, {
        loop: opts.loop,
        seed: opts.seed ?? 11,
        fadeIn: 0.5,
      });
      const step = (t) => {
        m.schedule(t + 1.5);
        if (t + 1 < seconds) oc.__defer(t + 1, () => step(t + 1));
      };
      step(0);
    }
    ctl.started = true;
    return oc.startRendering();
  }

  // Render a whole scene through the real mix graph (buses, reverb, compressor, limiter) offline.
  // events: [{ t, name, opts }] (name 'sting:<x>' for stingers). Returns the buffer plus compressor /
  // limiter gain-reduction traces sampled every 10 ms.
  async renderScene(
    events,
    seconds = 4,
    { listener = { x: 0, y: 1.65, z: 0 }, raw = false, warm = 2 } = {},
  ) {
    // `warm` s of silence are rendered first and cut: Chrome's DynamicsCompressor starts fully clamped
    // and takes ~1 s to release, which would otherwise pollute the gain-reduction traces.
    await this.whenLoaded();
    const sr = this._sr || 48000,
      total = seconds + warm;
    const oc = new OfflineAudioContext({
      numberOfChannels: 2,
      length: Math.ceil(total * sr),
      sampleRate: sr,
    });
    const ctl = installDefer(oc, sr);
    const gr = buildGraph(oc, this.vol, this.ir || makeIR(sr), raw),
      mx = new Mixer(this, oc, gr);
    mx.lpos = listener;
    const L = oc.listener;
    if (L.positionX) {
      L.positionX.value = listener.x;
      L.positionY.value = listener.y;
      L.positionZ.value = listener.z;
    }
    for (const ev of events) {
      // built up-front: suspend round-trips are the slow part of offline renders
      const t = ev.t + warm;
      (() => {
        if (ev.name.startsWith("sting:")) {
          const s = STINGS[ev.name.slice(6)],
            g = G(oc, s.gain ?? 1),
            w = G(oc, s.gain ?? 1);
          g.connect(gr.musicBus);
          w.connect(gr.musicRev);
          s.fn(oc, g, w, t, rng(7), ev.opts || {});
          return;
        }
        const d = DEFS[ev.name];
        if (!d) return;
        if (d.gun) mx.playGun(ev.name, d, ev.opts || {}, t);
        else mx.play(ev.name, d, this.bufs[ev.name], ev.opts || {}, t);
      })();
    }
    const comp = [],
      lim = [],
      dt = 0.02;
    const probe = (t) => {
      if (t >= warm - 1e-6) {
        comp.push(gr.comp.reduction);
        lim.push(gr.lim.reduction);
      }
      if (t + dt < total) oc.__defer(t + dt, () => probe(t + dt));
    };
    oc.__defer(dt, () => probe(dt));
    ctl.started = true;
    const full = await oc.startRendering();
    const off = Math.floor(warm * sr),
      buf = new AudioBuffer({
        length: full.length - off,
        numberOfChannels: 2,
        sampleRate: sr,
      });
    for (let c = 0; c < 2; c++)
      buf.getChannelData(c).set(full.getChannelData(c).subarray(off));
    return { buf, comp, lim, dt };
  }
}

export const SOUND_NAMES = Object.keys(DEFS).filter((n) => !n.includes(":"));
export const STING_NAMES = Object.keys(STINGS);
export default AudioEngine;
