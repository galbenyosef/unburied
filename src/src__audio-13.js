// src__audio 13 — mtof
// Lines 3585-3918 of readable/src__audio.pretty.js (statement-aligned).
const STINGS = {
  round_start: {
    gain: 1.0,
    len: 7,
    fn(c, o, w, t, R) {
      const b = mixBus(c, o, w, 1, 0.5);
      thump(c, b, t, 70, 32, 1.6, 0.8);
      burst(c, b, t, {
        k: "b",
        type: "lowpass",
        f: 200,
        a: 0.005,
        d: 1.2,
        amp: 0.4,
      });
      [0, 1.8, 3.6].forEach((dt, i) =>
        bell(c, b, t + dt, mtof(i === 2 ? 45 : 50), 5.5, 0.5 * (1 - i * 0.2)),
      );
      for (const m of [38, 45, 50, 53])
        brass(c, b, t + 0.2, mtof(m), 5.0, 0.12, {
          a: 1.6,
          r: 1.5,
          bright: 1.8,
        });
      for (const m of [62, 65, 69])
        choir(c, b, t + 0.6, mtof(m), 5.6, 0.22, R, {
          vow: [
            [0, "u"],
            [0.4, "o"],
            [1, "a"],
          ],
          env: [
            [0, 0],
            [0.35, 1],
            [0.75, 0.8],
            [1, 0],
          ],
        });
    },
  },
  round_end: {
    gain: 2.6,
    len: 7,
    fn(c, o, w, t, R) {
      const b = mixBus(c, o, w, 1, 0.6);
      [
        [50, 57],
        [53, 62],
        [57, 65],
        [60, 69],
      ].forEach(([a, z], i) =>
        choir(c, b, t + i * 0.15, mtof(a), 6, 0.2, R, {
          f0: [
            [0, mtof(a)],
            [0.65, mtof(z)],
            [1, mtof(z)],
          ],
          vow: [
            [0, "o"],
            [0.6, "a"],
            [1, "a"],
          ],
          env: [
            [0, 0],
            [0.62, 1],
            [0.8, 0.7],
            [1, 0],
          ],
        }),
      );
      for (let i = 0; i < 8; i++)
        tone(c, b, t + 3.4 + i * 0.12, {
          f: mtof(pick(R, [81, 86, 88, 93])),
          a: 0.05,
          d: 1.4,
          amp: 0.05,
        });
      bell(c, b, t + 3.9, mtof(62), 3, 0.25);
    },
  },
  box_jingle: {
    gain: 0.8,
    len: 3.5,
    fn(c, o, w, t, R) {
      const b = mixBus(c, o, w, 1, 0.5);
      [
        [0, 81],
        [0.12, 84],
        [0.24, 88],
        [0.36, 93],
        [0.6, 91],
        [0.72, 88],
        [0.84, 84],
        [0.96, 86],
        [1.2, 88],
        [1.32, 85],
        [1.44, 81],
      ].forEach(([dt, m]) =>
        later(c, t + dt, () => mbox(c, b, t + dt, mtof(m), 0.3, 1.2, R)),
      );
      later(c, t + 1.7, () => {
        for (const m of [69, 73, 76, 81])
          mbox(c, b, t + 1.7, mtof(m), 0.25, 2, R);
        bell(c, b, t + 1.7, mtof(57), 2.5, 0.25);
      });
    },
  },
  perk_jingle: {
    gain: 1.0,
    len: 5.5,
    fn(c, o, w, t, R, opts = {}) {
      const vi = opts.variant ?? PERK_IDX[opts.perk] ?? Math.floor(R() * 4),
        tune = PERK_TUNES[vi % 4];
      const root = [60, 62, 65, 58][vi % 4],
        beat = 0.3;
      const radio = G(c, 1),
        hp = F(c, "highpass", 350),
        lp = F(c, "lowpass", 3200),
        out = mixBus(c, o, w, 1, 0.25);
      ch(radio, hp, lp, sat(c, 1.6), out);
      const cr = c.createBufferSource();
      cr.buffer = NZ.cr;
      cr.start(t, R() * 2);
      cr.stop(t + 5.2);
      const crg = G(c, 0.25);
      ch(cr, crg, radio);
      let at = t;
      tune.forEach(([s, bts]) => {
        const nt = at;
        later(c, nt, () => {
          pluck(
            c,
            radio,
            nt,
            mtof(root + 12 + s),
            0.3,
            Math.min(0.6, bts * beat * 1.2),
          );
          organ(c, radio, nt, mtof(root + s), bts * beat * 0.95, 0.08);
        });
        at += bts * beat;
      });
      const total = at - t,
        prog = [0, 5, 7, 0];
      for (let i = 0; i * 2 * beat < total; i++) {
        const bt = t + i * 2 * beat,
          r = root - 24 + prog[Math.floor(i / 2) % 4];
        later(c, bt, () => {
          uprightBass(c, radio, bt, mtof(r), 0.5, 0.35);
          uprightBass(c, radio, bt + beat, mtof(r + 7), 0.4, 0.3);
          burst(c, radio, bt + beat, {
            type: "bandpass",
            f: 5000,
            Q: 0.8,
            a: 0.002,
            d: 0.08,
            amp: 0.15,
          });
        });
      }
      const end = at;
      later(c, end, () => {
        for (const s of [0, 4, 7, 12])
          organ(c, radio, end, mtof(root + s), 1.0, 0.07);
        pluck(c, radio, end, mtof(root + 24), 0.3, 0.8);
      });
    },
  },
  anvil: {
    gain: 1.7,
    len: 5,
    fn(c, o, w, t, R) {
      const b = mixBus(c, o, w, 1, 0.5);
      [0, 0.75, 1.5].forEach((dt, i) => {
        const f = [180, 190, 170][i],
          at = t + dt;
        for (const [r, a, d] of [
          [1, 1, 1.8],
          [2.76, 0.6, 1.2],
          [5.4, 0.4, 0.6],
          [8.93, 0.25, 0.3],
          [13.34, 0.15, 0.2],
        ])
          tone(c, b, at, { f: f * r, a: 0.0005, d, amp: a * 0.15 });
        burst(c, b, at, {
          type: "highpass",
          f: 2000,
          a: 0.0003,
          d: 0.03,
          amp: 0.4,
        });
        thump(c, b, at, 120, 60, 0.15, 0.4);
        for (let k = 0; k < 6; k++)
          ping(c, b, at + rr(R, 0.01, 0.3), rr(R, 4000, 8000), 0.05, 0.04);
      });
      for (const m of [36, 43, 48, 51])
        brass(c, b, t + 1.5, mtof(m), 2.4, 0.12, {
          a: 1.0,
          r: 1.2,
          bright: 1.6,
        });
      const s = O(c, "sawtooth", 50, t + 1.6, 3.2),
        bp = F(c, "bandpass", 200, 2),
        g = G(c, 0);
      bp.frequency.setValueAtTime(200, t + 1.6);
      bp.frequency.exponentialRampToValueAtTime(1200, t + 4);
      E(g.gain, t + 1.6, 0, [
        [1.8, 0.12],
        [1.2, 0],
      ]);
      ch(s, bp, g, b);
    },
  },
  power_on: {
    gain: 0.7,
    len: 6,
    fn(c, o, w, t, R) {
      const b = mixBus(c, o, w, 1, 0.45);
      const k = G(c, 1);
      ch(k, sat(c, 3), b);
      thump(c, k, t, 65, 28, 0.9, 1);
      burst(c, k, t, {
        k: "p",
        type: "lowpass",
        f: 1500,
        f2: 150,
        a: 0.001,
        d: 0.5,
        amp: 0.8,
      });
      clack(c, b, t + 0.14, 0.5, 1600, 120);
      clack(c, b, t + 0.23, 0.4, 1900, 140);
      const hum = G(c, 0),
        hbp = F(c, "bandpass", 150, 1.5);
      ch(hbp, hum, b);
      for (const [ty, m] of [
        ["sawtooth", 1],
        ["square", 2],
        ["sawtooth", 3.01],
      ]) {
        const s = O(c, ty, 30 * m, t + 0.1, 5.5);
        s.frequency.setValueAtTime(30 * m, t + 0.1);
        s.frequency.exponentialRampToValueAtTime(60 * m, t + 3);
        s.connect(hbp);
      }
      hbp.frequency.setValueAtTime(150, t + 0.1);
      hbp.frequency.exponentialRampToValueAtTime(1400, t + 3);
      E(hum.gain, t + 0.1, 0, [
        [2.6, 0.25],
        [1.5, 0.12],
        [1.3, 0],
      ]);
      for (let i = 0; i < 14; i++)
        burst(c, b, t + rr(R, 0.1, 2.2), {
          type: "bandpass",
          f: rr(R, 2500, 7000),
          Q: 5,
          a: 0.0003,
          d: rr(R, 0.005, 0.04),
          amp: rr(R, 0.1, 0.4),
        });
      for (const m of [48, 55, 60, 64, 67])
        brass(c, b, t + 1.0, mtof(m), 3.6, 0.1, {
          a: 1.6,
          r: 1.2,
          bright: 2.2,
        });
    },
  },
  powerup_fanfare: {
    gain: 2.8,
    len: 2.8,
    fn(c, o, w, t, R) {
      const b = mixBus(c, o, w, 1, 0.4);
      [
        [0, 67],
        [0.14, 72],
        [0.28, 76],
      ].forEach(([dt, m]) =>
        brass(c, b, t + dt, mtof(m), 0.12, 0.3, {
          a: 0.02,
          r: 0.08,
          bright: 3,
        }),
      );
      for (const m of [60, 64, 67, 72, 79])
        brass(c, b, t + 0.46, mtof(m), 1.3, 0.18, {
          a: 0.04,
          r: 0.6,
          bright: 2.6,
        });
      for (const m of [72, 76, 79])
        choir(c, b, t + 0.46, mtof(m), 1.8, 0.12, R, {
          vow: [
            [0, "a"],
            [1, "a"],
          ],
          env: [
            [0, 0],
            [0.15, 1],
            [0.7, 0.8],
            [1, 0],
          ],
        });
    },
  },
};

// ───────────────────────────────────────────────────────────── music (live, lookahead)
const CH = {
  Dm: [50, 57, 62, 65],
  Bb: [46, 58, 62, 65],
  Gm: [43, 55, 58, 62],
  A: [45, 57, 61, 64],
  Am: [45, 57, 60, 64],
  F: [41, 53, 60, 65],
  C: [48, 55, 60, 64],
  Eb: [39, 55, 58, 63],
  E: [40, 56, 59, 64],
  Dmg: [38, 50, 57, 62, 65],
};
const MENU_PROGS = [
  ["Dm", "Bb", "Gm", "A"],
  ["Dm", "F", "C", "Bb"],
  ["Dm", "Eb", "Dm", "A"],
  ["Dm", "Bb", "F", "A"],
  ["Gm", "Dm", "Eb", "A"],
  ["Dm", "Am", "Bb", "A"],
];
const GO_PROGS = [
  ["Am", "F", "Dmg", "E"],
  ["Am", "Dmg", "F", "E"],
  ["F", "C", "Dmg", "E"],
];
