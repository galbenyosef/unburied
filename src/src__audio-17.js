// src__audio 17 — math
// Lines 4593-4810 of readable/src__audio.pretty.js (statement-aligned).
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
