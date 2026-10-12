// src__audio 15 — bar
// Lines 3964-4311 of readable/src__audio.pretty.js (statement-aligned).
class Music {
  constructor(c, out, rev, kind, opts = {}) {
    this.c = c;
    this.kind = kind;
    this.menu = kind !== "gameover";
    this.loop = opts.loop ?? this.menu;
    this.R = rng(opts.seed ?? (Math.random() * 1e9) | 0);
    const t0 = c.currentTime + 0.06;
    this.t0 = t0;
    this.osc = [];
    this.done = false;
    this.dead = false;
    this.g = G(c, 0);
    this.g.connect(out);
    this.rv = G(c, 0);
    this.rv.connect(rev);
    const fi = opts.fadeIn ?? 2;
    for (const x of [this.g, this.rv]) {
      x.gain.setValueAtTime(0, t0);
      x.gain.linearRampToValueAtTime(1, t0 + fi);
    }
    // pad bus + slow stereo chorus
    this.pad = G(c, 1);
    const dry = G(c, 0.7);
    ch(this.pad, dry, this.g);
    for (const [dt, rate, pan] of [
      [0.017, 0.21, -0.8],
      [0.024, 0.29, 0.8],
    ]) {
      const dl = c.createDelay(0.1);
      dl.delayTime.value = dt;
      const l = c.createOscillator();
      l.frequency.value = rate;
      const lg = G(c, 0.004);
      ch(l, lg, dl.delayTime);
      l.start(t0);
      this.osc.push(l);
      const p = c.createStereoPanner();
      p.pan.value = pan;
      ch(this.pad, dl, p, G(c, 0.5), this.g);
    }
    const ps = G(c, 0.35);
    ch(this.pad, ps, this.rv);
    // music box bus + echo
    this.box = G(c, 1);
    this.box.connect(this.g);
    const dl = c.createDelay(1);
    dl.delayTime.value = this.menu ? 0.625 : 0.9;
    const fb = G(c, 0.33),
      dlp = F(c, "lowpass", 2400),
      wet = G(c, 0.28);
    ch(this.box, dl, dlp, fb, dl);
    dlp.connect(wet);
    wet.connect(this.g);
    const bs = G(c, 0.5);
    ch(this.box, bs, this.rv);
    // bells (distant)
    this.bell = G(c, 1);
    const blp = F(c, "lowpass", 2000),
      bd = G(c, 0.5),
      bw = G(c, 1.1);
    ch(this.bell, blp, bd, this.g);
    blp.connect(bw);
    bw.connect(this.rv);
    // wow for the music box
    const wo = c.createOscillator();
    wo.frequency.value = 0.43;
    this.wow = G(c, 7);
    wo.connect(this.wow);
    wo.start(t0);
    this.osc.push(wo);
    // sub drone
    const root = this.menu ? 26 : 33;
    const dg = G(c, 0),
      dlp2 = F(c, "lowpass", 150);
    ch(dlp2, dg, this.g);
    dg.gain.setValueAtTime(0, t0);
    dg.gain.linearRampToValueAtTime(0.32, t0 + 6);
    for (const [m, ty, a] of [
      [root, "sine", 1],
      [root + 12, "triangle", 0.5],
      [root + 12.1, "triangle", 0.4],
    ]) {
      const s = c.createOscillator();
      s.type = ty;
      s.frequency.value = mtof(m);
      const sg = G(c, a);
      ch(s, sg, dlp2);
      s.start(t0);
      this.osc.push(s);
    }
    const tl = c.createOscillator();
    tl.frequency.value = 0.07;
    const tg = G(c, 0.12);
    ch(tl, tg, dg.gain);
    tl.start(t0);
    this.osc.push(tl);
    this.drone = dg;
    // vinyl crackle
    const cr = c.createBufferSource();
    cr.buffer = NZ.cr;
    cr.loop = true;
    cr.start(t0);
    this.osc.push(cr);
    const chp = F(c, "highpass", 900),
      cg = G(c, this.menu ? 0.07 : 0.09);
    ch(cr, chp, cg, this.g);

    this.beat = this.menu ? 60 / 72 : 60 / 52;
    this.nextBar = t0 + 0.4;
    this.bar = 0;
    this.last = null;
    this.motif = null;
    this.sec = "C";
    this.prog = this.menu ? MENU_PROGS[0] : GO_PROGS[0];
    this.scaleP = this.menu ? [2, 4, 5, 7, 9, 10, 0] : [9, 11, 0, 2, 4, 5, 7];
    this.lead = this.menu ? [0, 1] : [7, 8]; // raised 7th over the dominant
    this.dom = this.menu ? "A" : "E";
    this.lo = this.menu ? 74 : 69;
    this.hi = this.menu ? 93 : 88;
  }
  barLen() {
    return (
      4 *
      this.beat *
      (this.menu || this.bar < 8 || this.loop
        ? this.menu
          ? 1
          : 1 + 0.035 * Math.min(this.bar, 8)
        : 1)
    );
  }
  schedule(until) {
    while (!this.done && this.nextBar < until) {
      const t = this.nextBar,
        L = this.barLen();
      this._bar(t, L);
      this.nextBar += L;
      this.bar++;
    }
  }
  stop(fade = 1) {
    if (this.dead) return;
    this.dead = true;
    this.done = true;
    const now = this.c.currentTime;
    for (const x of [this.g, this.rv]) {
      x.gain.cancelScheduledValues(now);
      x.gain.setValueAtTime(x.gain.value, now);
      x.gain.linearRampToValueAtTime(0, now + Math.max(0.02, fade));
    }
    for (const o of this.osc) {
      try {
        o.stop(now + fade + 0.1);
      } catch (e) {}
    }
    this.stopAt = now + fade + 0.2;
  }
  _scale(chord) {
    const pcs = CH[chord].map((m) => m % 12);
    const sc = this.scaleP.map((p) =>
      chord === this.dom && p === this.lead[0] ? this.lead[1] : p,
    );
    const out = [];
    for (let m = this.lo - 5; m <= this.hi + 5; m++)
      if (sc.includes(((m % 12) + 12) % 12)) out.push(m);
    return { out, pcs };
  }
  _pad(t, notes, d) {
    const c = this.c,
      R = this.R;
    const lp = F(c, "lowpass", rr(R, 500, 1000), 0.8),
      pk = F(c, "peaking", 720, 2, 5),
      pk2 = F(c, "peaking", 1150, 3, 3),
      g = G(c, 0);
    ch(lp, pk, pk2, g, this.pad);
    const a = Math.min(2.2, d * 0.4),
      rel = 3.2;
    E(g.gain, t, 0, [
      [a, 1],
      [d - a, 0.85],
      [rel, 0],
    ]);
    lp.frequency.setValueAtTime(lp.frequency.value, t);
    lp.frequency.linearRampToValueAtTime(rr(R, 800, 1700), t + d * 0.6);
    lp.frequency.linearRampToValueAtTime(rr(R, 400, 800), t + d + rel);
    for (const m of notes)
      for (const det of [-10, 0, 9]) {
        const s = O(c, "sawtooth", mtof(m), t, d + rel + 0.1);
        s.detune.value = det + (R() - 0.5) * 5;
        const sg = G(c, 0.05);
        ch(s, sg, lp);
      }
    const root = Math.min(...notes),
      sb = O(c, "sine", mtof(root - 12), t, d + rel + 0.1),
      sbg = G(c, 0);
    E(sbg.gain, t, 0, [
      [a, 0.16],
      [d - a, 0.14],
      [rel, 0],
    ]);
    ch(sb, sbg, this.g);
  }
  _note(t, m, amp) {
    mbox(
      this.c,
      this.box,
      t + (this.R() - 0.5) * 0.016,
      mtof(m),
      amp,
      this.menu ? 2.2 : 2.8,
      this.R,
      this.wow,
    );
  }
  _melody(t, chord, density, dyad) {
    const R = this.R,
      e = this.beat / 2,
      { out: sc, pcs } = this._scale(chord);
    const inR = sc.filter((m) => m >= this.lo && m <= this.hi);
    let notes = [];
    if (this.sec === "D" && this.motif && this.bar % 2 === 1) {
      notes = this.motif.map(([s, m]) => {
        if (R() < 0.25) m = pick(R, inR);
        if (R() < 0.5 && !pcs.includes(m % 12)) {
          const ct = inR.filter((x) => pcs.includes(x % 12));
          m = ct.reduce(
            (b, x) => (Math.abs(x - m) < Math.abs(b - m) ? x : b),
            ct[0],
          );
        }
        return [s, m];
      });
    } else {
      for (let s = 0; s < 8; s++) {
        const strong = s % 4 === 0 ? 1.6 : s % 2 === 0 ? 1.0 : 0.55;
        if (R() > density * strong) continue;
        let m;
        if (this.last == null || R() < 0.25 || (s === 0 && R() < 0.6)) {
          const ct = inR.filter((x) => pcs.includes(x % 12));
          m =
            this.last == null
              ? pick(R, ct)
              : ct.sort(
                  (a, b) => Math.abs(a - this.last) - Math.abs(b - this.last),
                )[Math.floor(R() * Math.min(3, ct.length))];
        } else {
          let i = sc.indexOf(this.last);
          if (i < 0) i = sc.findIndex((x) => x >= this.last);
          i = clamp(
            i + pick(R, [-2, -1, -1, -1, 1, 1, 2, -3, 3]),
            0,
            sc.length - 1,
          );
          m = sc[i];
          if (m > this.hi || m < this.lo)
            m =
              sc[
                clamp(sc.indexOf(m) + (m > this.hi ? -3 : 3), 0, sc.length - 1)
              ];
        }
        notes.push([s, m]);
        this.last = m;
      }
      if (this.sec === "D") this.motif = notes;
    }
    for (const [s, m] of notes) {
      const at = t + s * e,
        amp = (s % 4 === 0 ? 0.26 : 0.19) * rr(R, 0.8, 1.05);
      this._note(at, m, amp);
      if (R() < 0.08) {
        const i = sc.indexOf(m);
        if (i >= 0 && i + 1 < sc.length)
          this._note(at - 0.06, sc[i + 1], amp * 0.4);
      }
      if (dyad && R() < 0.35) {
        const i = sc.indexOf(m);
        if (i >= 2) this._note(at, sc[i - 2], amp * 0.6);
      }
    }
  }
  _bar(t, L) {
    const R = this.R,
      c = this.c;
    if (this.menu) {
      if (this.bar % 8 === 0) {
        const secs = ["A", "B", "C", "D"].filter((s) => s !== this.sec);
        this.sec = this.bar === 0 ? "C" : this.bar === 8 ? "A" : pick(R, secs);
        this.prog = pick(R, MENU_PROGS);
        if (this.sec === "C") {
          this.drone.gain.setValueAtTime(0.32, t);
          this.drone.gain.linearRampToValueAtTime(0.45, t + L * 3);
          this.drone.gain.linearRampToValueAtTime(0.32, t + L * 8);
        }
      }
      const chord = this.prog[Math.floor((this.bar % 8) / 2)];
      if (this.bar % 2 === 0) this._pad(t, CH[chord], 2 * L);
      const dens = { A: 0.32, B: 0.55, C: 0.1, D: 0.5 }[this.sec];
      if (!(this.bar === 0)) this._melody(t, chord, dens, this.sec === "B");
      if (R() < (this.sec === "C" ? 0.5 : 0.15) || this.bar === 0)
        bell(
          c,
          this.bell,
          t + rr(R, 0, L * 0.5),
          mtof(pick(R, [50, 57, 45, 62])),
          6,
          0.4,
        );
      return;
    }
    // gameover: fixed composition, then (loop) sparse variations or fade
    if (this.bar < 8) {
      const e = L / 4;
      this._pad(t, CH[GO_CH[this.bar]], L);
      for (const [b, m] of GO_MEL[this.bar])
        this._note(t + b * e, m + 12, this.bar === 7 ? 0.3 : 0.24);
      if (this.bar === 0) bell(c, this.bell, t, mtof(45), 7, 0.45);
      if (this.bar === 7) {
        bell(c, this.bell, t + 0.05, mtof(57), 7, 0.4);
        if (!this.loop) {
          const end = t + L * 0.6,
            f = 7;
          for (const x of [this.g, this.rv]) {
            x.gain.setValueAtTime(1, end);
            x.gain.linearRampToValueAtTime(0, end + f);
          }
          for (const o of this.osc) o.stop(end + f + 0.1);
          this.done = true;
          this.stopAt = end + f + 0.2;
        }
      }
      return;
    }
    const k = this.bar - 8;
    if (k % 8 === 0) {
      this.prog = pick(R, GO_PROGS);
      this.sec = pick(R, ["A", "C"]);
    }
    const chord = this.prog[Math.floor((k % 8) / 2)];
    if (k % 2 === 0) this._pad(t, CH[chord], 2 * L);
    this._melody(t, chord, this.sec === "A" ? 0.25 : 0.1, false);
    if (R() < 0.2) bell(c, this.bell, t, mtof(pick(R, [45, 57])), 6, 0.35);
  }
}

// ───────────────────────────────────────────────────────────── mix table
// [loudness target in dBFS of the loudest 50 ms RMS window, variant count]. Every buffer is also
// ceiling-limited to 0.8 peak (-2 dBFS). Guns dominate, foley sits under, voices behind, UI quiet.
