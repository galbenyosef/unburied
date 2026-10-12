// src__audio 03 — amp
// Lines 647-942 of readable/src__audio.pretty.js (statement-aligned).
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
