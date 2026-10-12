// src__audio 05 — dur
// Lines 1249-1533 of readable/src__audio.pretty.js (statement-aligned).
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
