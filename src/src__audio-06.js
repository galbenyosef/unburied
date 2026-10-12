// src__audio 06 — amp
// Lines 1534-1869 of readable/src__audio.pretty.js (statement-aligned).
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
