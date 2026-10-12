// src__audio 11 — amp
// Lines 3215-3524 of readable/src__audio.pretty.js (statement-aligned).
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
