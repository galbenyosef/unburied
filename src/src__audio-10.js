// src__audio 10 — amp
// Lines 2874-3214 of readable/src__audio.pretty.js (statement-aligned).
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
