// src__audio 09 — amp
// Lines 2536-2873 of readable/src__audio.pretty.js (statement-aligned).
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
