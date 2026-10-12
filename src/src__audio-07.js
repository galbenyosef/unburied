// src__audio 07 — amp
// Lines 1870-2193 of readable/src__audio.pretty.js (statement-aligned).
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
