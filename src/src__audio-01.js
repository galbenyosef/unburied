// src__audio 01 — math
// Lines 1-335 of readable/src__audio.pretty.js (statement-aligned).
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
