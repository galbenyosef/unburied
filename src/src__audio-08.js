// src__audio 08 — amp
// Lines 2194-2535 of readable/src__audio.pretty.js (statement-aligned).
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
