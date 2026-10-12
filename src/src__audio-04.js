// src__audio 04 — amp
// Lines 943-1248 of readable/src__audio.pretty.js (statement-aligned).
function gunFar(c, o, t, R, p) {
  const f = p.far || {},
    tl = p.tail,
    j = (x, a = 0.1) => x * (1 + (R() - 0.5) * 2 * a);
  const dull = F(c, "lowpass", f.lp ?? 1800, 0.7);
  dull.connect(o);
  nwave(c, dull, t, p.crack.amp * 0.3, p.crack.nw * 1.6); // crack, low-passed by air
  burst(c, dull, t, {
    type: "bandpass",
    f: 1100,
    Q: 0.8,
    a: 0.0008,
    d: 0.02,
    amp: p.crack.amp * 0.5,
  });
  tone(c, o, t, {
    f: p.punch.f0 * 0.8,
    f2: p.punch.f1,
    sw: 0.1,
    a: 0.002,
    d: p.punch.dec * 1.4,
    amp: p.punch.amp * 0.45,
  }); // soft thump
  burst(c, dull, t, {
    k: "p",
    type: "lowpass",
    f: 700,
    a: 0.002,
    d: 0.12,
    amp: 0.8,
  });
  const dur = f.dur ?? tl.dur * 1.6;
  burst(c, o, t + 0.01, {
    k: "b",
    type: "lowpass",
    f: 480,
    f2: 140,
    Q: 0.5,
    a: 0.06,
    d: j(dur),
    amp: tl.amp * 1.6,
    sweep: dur,
  });
  const echoes = tl.echoes || [
    [0.2, 0.35],
    [0.45, 0.2],
  ];
  for (const [dt, a] of echoes) {
    const at = t + j(dt * 1.3);
    later(c, at, () =>
      burst(c, o, at, {
        k: "p",
        type: "lowpass",
        f: 520,
        Q: 0.6,
        a: 0.01,
        d: 0.25 + dt * 0.4,
        amp: a * 1.1,
      }),
    );
  }
}
function gunMech(c, o, t, R, p) {
  // full-auto mechanism / belt rattle
  const m = p.mech;
  for (let i = 0; i < m.n; i++) {
    const at = t + rr(R, 0, m.span),
      f = rr(R, m.f * 0.8, m.f * 1.3);
    if (R() < 0.55) clk(c, o, at, rr(R, 0.3, 1) * m.amp, f, 0.02);
    else
      burst(c, o, at, {
        type: "bandpass",
        f,
        Q: 5,
        a: 0.0003,
        d: rr(R, 0.004, 0.012),
        amp: rr(R, 0.3, 1) * m.amp,
      });
  }
  if (m.thunk)
    tone(c, o, t + rr(R, 0, 0.01), {
      f: m.thunk,
      f2: m.thunk * 0.7,
      a: 0.0006,
      d: 0.03,
      amp: m.amp * 0.6,
    });
}

const GUNS = {
  shot_pistol: {
    // M1911: snappy .45 bark, slide cycle
    core: 0.32,
    loud: -9,
    n: 5,
    auto: false,
    crack: { amp: 0.8, nw: 0.0005, hp: 2500, nd: 0.004 },
    drive: 4,
    punch: { f0: 105, f1: 48, dec: 0.09, amp: 1 },
    body: [
      { f: 1000, Q: 0.9, dec: 0.06, amp: 0.95 },
      { type: "lowpass", f: 600, dec: 0.08, amp: 0.45 },
    ],
    ring: { f: 2400, dec: 0.03, amp: 0.35 },
    act: [
      [0.013, "clack", 2600, 0.32, 420],
      [0.043, "clk", 3300, 0.22],
    ],
    tail: { dur: 0.9, lp: 1400, amp: 0.35, slap: 0.5, slapF: 1300 },
    tailLoud: -20,
  },
  shot_rifle: {
    // Kar98k: massive crack + long rolling tail
    core: 0.45,
    loud: -7,
    n: 4,
    auto: false,
    crack: { amp: 1.3, nw: 0.001, hp: 1800, nd: 0.008 },
    drive: 5,
    punch: { f0: 78, f1: 34, dec: 0.2, amp: 1.3 },
    body: [
      { f: 700, Q: 0.5, dec: 0.12, amp: 1.1 },
      { type: "lowpass", f: 350, dec: 0.25, amp: 0.9 },
    ],
    ring: { f: 1500, dec: 0.05, amp: 0.3 },
    tail: {
      dur: 2.2,
      lp: 900,
      amp: 0.55,
      slap: 0.7,
      slapF: 1100,
      slapSpan: 0.09,
      boom: 0.4,
      echoes: [
        [0.18, 0.5],
        [0.42, 0.3],
        [0.75, 0.18],
        [1.1, 0.1],
      ],
    },
    tailLoud: -15,
    far: { dur: 3.0, lp: 1500 },
  },
  shot_shotgun: {
    // Trench gun: huge wide boom
    core: 0.5,
    loud: -7,
    n: 4,
    auto: false,
    crack: { amp: 0.8, nw: 0.0014, hp: 1200, nd: 0.012 },
    drive: 4.5,
    punch: { f0: 68, f1: 30, dec: 0.26, amp: 1.5 },
    body: [
      { type: "lowpass", f: 2200, f2: 500, dec: 0.18, amp: 1.3 },
      { f: 450, Q: 0.6, dec: 0.2, amp: 0.9 },
    ],
    tail: {
      dur: 1.6,
      lp: 1000,
      amp: 0.55,
      slap: 0.75,
      slapF: 900,
      slapSpan: 0.085,
      boom: 0.5,
      echoes: [
        [0.15, 0.4],
        [0.36, 0.2],
      ],
    },
    tailLoud: -15,
    far: { dur: 2.4, lp: 1200 },
  },
  shot_smg: {
    // MP40: tight 9 mm, open-bolt chug
    core: 0.2,
    loud: -10,
    n: 6,
    auto: true,
    crack: { amp: 0.7, nw: 0.0006, hp: 2800, nd: 0.004 },
    drive: 3.5,
    punch: { f0: 118, f1: 55, dec: 0.06, amp: 0.9 },
    body: [{ f: 1500, Q: 1, dec: 0.04, amp: 0.8 }],
    ring: { f: 2900, dec: 0.02, amp: 0.3 },
    act: [[0.03, "clack", 1900, 0.42, 220]],
    mech: { n: 3, span: 0.05, f: 2600, amp: 0.35, thunk: 190 },
    tail: { dur: 0.55, lp: 1500, amp: 0.3, slap: 0.4, slapF: 1500 },
    tailLoud: -24,
  },
  shot_smg2: {
    // Thompson: heavier .45 chug
    core: 0.22,
    loud: -9.5,
    n: 6,
    auto: true,
    crack: { amp: 0.75, nw: 0.0006, hp: 2300, nd: 0.005 },
    drive: 3.8,
    punch: { f0: 98, f1: 45, dec: 0.075, amp: 1.1 },
    body: [
      { f: 1050, Q: 0.9, dec: 0.055, amp: 1 },
      { type: "lowpass", f: 550, dec: 0.07, amp: 0.4 },
    ],
    ring: { f: 2100, dec: 0.025, amp: 0.3 },
    act: [[0.026, "clack", 1600, 0.5, 170]],
    mech: { n: 3, span: 0.05, f: 2100, amp: 0.4, thunk: 160 },
    tail: { dur: 0.65, lp: 1250, amp: 0.32, slap: 0.45, slapF: 1250 },
    tailLoud: -23,
  },
  shot_assault: {
    // StG44: sharp mid-weight crack
    core: 0.28,
    loud: -8.5,
    n: 6,
    auto: true,
    crack: { amp: 1.0, nw: 0.0008, hp: 2100, nd: 0.006 },
    drive: 4.5,
    punch: { f0: 92, f1: 42, dec: 0.1, amp: 1.1 },
    body: [
      { f: 1200, Q: 0.8, dec: 0.07, amp: 0.9 },
      { type: "lowpass", f: 500, dec: 0.12, amp: 0.5 },
    ],
    ring: { f: 1800, dec: 0.03, amp: 0.3 },
    act: [[0.022, "clack", 2200, 0.33, 260]],
    mech: { n: 2, span: 0.04, f: 2800, amp: 0.3, thunk: 230 },
    tail: {
      dur: 1.0,
      lp: 1100,
      amp: 0.4,
      slap: 0.55,
      slapF: 1200,
      echoes: [[0.2, 0.25]],
    },
    tailLoud: -20,
  },
  shot_lmg: {
    // MG42: 1200 rpm tearing buzz — short core that stacks
    core: 0.1,
    loud: -11.5,
    n: 8,
    auto: true,
    crack: { amp: 1.0, nw: 0.0007, hp: 3000, nd: 0.003 },
    drive: 6,
    punch: { f0: 100, f1: 55, dec: 0.04, amp: 1 },
    body: [
      { f: 1900, Q: 1.3, dec: 0.03, amp: 1 },
      { f: 900, Q: 1, dec: 0.035, amp: 0.6 },
    ],
    ring: { f: 3200, dec: 0.015, amp: 0.3 },
    mech: { n: 4, span: 0.03, f: 3400, amp: 0.4, thunk: 260 },
    tail: {
      dur: 0.45,
      lp: 1600,
      amp: 0.25,
      slap: 0.35,
      slapF: 1600,
      taps: 5,
      slapSpan: 0.05,
    },
    tailLoud: -27,
  },
  shot_aether: {
    // Aether pistol: sci-fi core, ethereal tail
    core: 1.3,
    loud: -9,
    n: 3,
    auto: false,
    custom: true,
    crack: { amp: 0.5, nw: 0.0006 },
    punch: { f0: 220, f1: 38, dec: 0.35, amp: 1.1 },
    tail: { dur: 1.2, lp: 2200, amp: 0.3, slap: 0.3, slapF: 2600 },
    tailLoud: -21,
  },
};
function aetherCore(c, o, t, R) {
  const s = O(c, "sawtooth", rr(R, 2200, 2800), t, 0.45);
  s.frequency.setValueAtTime(rr(R, 2200, 2800), t);
  s.frequency.exponentialRampToValueAtTime(rr(R, 150, 220), t + 0.3);
  const bp = F(c, "bandpass", 3500, 2);
  bp.frequency.setValueAtTime(3500, t);
  bp.frequency.exponentialRampToValueAtTime(400, t + 0.3);
  const g = G(c, 0);
  AD(g.gain, t, 0.002, 0.35, 0.9);
  ch(s, bp, g, o);
  const car = O(c, "sine", 900, t, 0.55),
    mod = O(c, "sine", rr(R, 70, 110), t, 0.55),
    md = G(c, 500);
  mod.connect(md);
  md.connect(car.frequency);
  car.frequency.setValueAtTime(900, t);
  car.frequency.exponentialRampToValueAtTime(120, t + 0.45);
  const cg = G(c, 0);
  AD(cg.gain, t, 0.005, 0.45, 0.5);
  ch(car, cg, o);
  thump(c, o, t, 220, 38, 0.4, 1.1);
  burst(c, o, t, { type: "highpass", f: 3000, a: 0.0005, d: 0.08, amp: 0.6 });
  const nz = NS(c, t, 0.9, "w"),
    sbp = F(c, "bandpass", 5000, 1.2),
    sg = G(c, 0),
    am = G(c, 0),
    sq = O(c, "square", rr(R, 55, 75), t, 0.9),
    sqg = G(c, 0.5);
  ch(sq, sqg, am.gain);
  ch(nz, sbp, am, sg, o);
  AD(sg.gain, t + 0.03, 0.02, 0.8, 0.35);
  for (let i = 0; i < 6; i++)
    ping(c, o, t + rr(R, 0.02, 0.35), rr(R, 3000, 7000), 0.08, 0.07);
}
