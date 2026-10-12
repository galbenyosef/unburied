// src__audio 18 — math
// Lines 4811-5122 of readable/src__audio.pretty.js (statement-aligned).
class Mixer {
  constructor(eng, ctx, gr) {
    this.eng = eng;
    this.ctx = ctx;
    this.gr = gr;
    this.voices = {};
    this.all = [];
    this.last = {};
    this.bags = {};
    this.lpos = null;
    this.maxVoices = 72;
  }
  _dist(p) {
    const l = this.lpos || { x: 0, y: 0, z: 0 };
    return Math.hypot((p.x || 0) - l.x, (p.y || 0) - l.y, (p.z || 0) - l.z);
  }
  _rr(key, n) {
    // shuffled round-robin, never the same variant twice in a row
    let bag = this.bags[key];
    if (!bag || !bag.length || bag.n !== n) {
      bag = [];
      for (let i = 0; i < n; i++) bag.push(i);
      for (let i = n - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [bag[i], bag[j]] = [bag[j], bag[i]];
      }
      if (n > 1 && bag[bag.length - 1] === this.last[key])
        [bag[0], bag[bag.length - 1]] = [bag[bag.length - 1], bag[0]];
      bag.n = n;
      this.bags[key] = bag;
    }
    const i = bag.pop();
    this.last[key] = i;
    return i;
  }
  _cap(name, d, when) {
    // voice stealing happens at the new voice's start time (matters for scheduled/offline use)
    const arr = this.voices[name] || (this.voices[name] = []);
    while (arr.length >= d.cap) arr.shift().stop(0.025, when);
    if (this.all.length >= this.maxVoices) {
      const v = this.all.find((x) => !x.loop && !x._stopping) || this.all[0];
      if (v) v.stop(0.03, when);
    }
    return arr;
  }
  _panner(d, p) {
    return new PannerNode(this.ctx, {
      panningModel: "HRTF",
      distanceModel: "inverse",
      refDistance: d.ref ?? 2,
      rolloffFactor: d.roll ?? 1.1,
      maxDistance: 120,
      positionX: p.x || 0,
      positionY: p.y || 0,
      positionZ: p.z || 0,
    });
  }
  _track(name, h, arr, nodes) {
    arr.push(h);
    this.all.push(h);
    h._done = () => {
      if (h.ended) return;
      h.ended = true;
      const i = arr.indexOf(h);
      if (i >= 0) arr.splice(i, 1);
      const j = this.all.indexOf(h);
      if (j >= 0) this.all.splice(j, 1);
      try {
        for (const n of nodes) if (n) n.disconnect();
      } catch (e) {}
    };
  }

  play(name, d, list, o = {}, when) {
    const ctx = this.ctx,
      now = when ?? ctx.currentTime;
    const idx =
      o.variant != null
        ? ((o.variant % list.length) + list.length) % list.length
        : this._rr(name, list.length);
    const arr = this._cap(name, d, now);
    const src = ctx.createBufferSource();
    src.buffer = list[idx];
    const loop = !!(o.loop ?? d.loop);
    src.loop = loop;
    src.playbackRate.value =
      (o.pitch ?? 1) * (1 + (Math.random() * 2 - 1) * (d.jit ?? 0.03));
    const g = G(
      ctx,
      (o.volume ?? 1) * d.vol * (loop ? 1 : 1 + (Math.random() - 0.5) * 0.14),
    );
    src.connect(g);
    const bus = d.bus === "ui" ? this.gr.uiBus : this.gr.sfxBus;
    let pan = null,
      send = null,
      revAmt = d.bus === "ui" ? 0 : d.rev;
    if (o.position) {
      pan = this._panner(d, o.position);
      g.connect(pan);
      pan.connect(bus);
      const ref = d.ref ?? 2,
        roll = d.roll ?? 1.1,
        dist = this._dist(o.position);
      revAmt *= clamp(
        Math.sqrt(ref / (ref + roll * (Math.max(dist, ref) - ref))) * 1.15,
        0.12,
        1.15,
      ); // distant = wetter
    } else g.connect(bus);
    if (revAmt > 0) {
      send = G(ctx, revAmt);
      g.connect(send);
      send.connect(this.gr.revIn);
    }
    src.start(now);
    const h = {
      name,
      loop,
      ended: false,
      src,
      gain: g,
      panner: pan,
      stop: (fade = 0.05, at) => {
        if (h.ended || h._stopping) return;
        h._stopping = true;
        const t = Math.max(ctx.currentTime, at || 0);
        fade = Math.max(0.005, fade);
        g.gain.cancelScheduledValues(t);
        g.gain.setValueAtTime(g.gain.value, t);
        g.gain.linearRampToValueAtTime(0, t + fade);
        try {
          src.stop(t + fade + 0.01);
        } catch (e) {}
      },
      setVolume: (v, ramp = 0.05) => {
        if (!h._stopping)
          g.gain.setTargetAtTime(
            v * d.vol,
            ctx.currentTime,
            Math.max(0.001, ramp / 3),
          );
      },
      setPitch: (p) => {
        src.playbackRate.setTargetAtTime(p, ctx.currentTime, 0.02);
      },
      setPosition: (p) => {
        if (!pan || !p) return;
        const t = ctx.currentTime;
        pan.positionX.setTargetAtTime(p.x, t, 0.02);
        pan.positionY.setTargetAtTime(p.y, t, 0.02);
        pan.positionZ.setTargetAtTime(p.z, t, 0.02);
      },
    };
    this._track(name, h, arr, [g, pan, send]);
    src.onended = () => h._done();
    return h;
  }

  // Layered gunshot: core + tail (+ mech) near, crossfading to the :far layer with distance.
  playGun(name, d, o = {}, when) {
    const ctx = this.ctx,
      B = this.eng.bufs,
      now = when ?? ctx.currentTime;
    const core = B[name] || [],
      tail = B[name + ":tail"] || [],
      far = B[name + ":far"] || [],
      mech = B[name + ":mech"] || [];
    const positional = !!o.position,
      hasDist = positional || o.distance != null;
    const dist = o.distance ?? (positional ? this._dist(o.position) : 0);
    let wFar = hasDist ? smoothstep(18, 28, dist) : 0;
    if (!far.length) wFar = 0;
    if (!core.length) wFar = 1;
    if (!core.length && !far.length) return NOOP;
    const delay = hasDist ? Math.min(dist / 343, 0.25) : 0,
      t0 = now + delay;
    const arr = this._cap(name, d, t0);
    const ref = d.ref ?? 6,
      roll = d.roll ?? 0.9,
      direct = hasDist ? ref / (ref + roll * (Math.max(dist, ref) - ref)) : 1;
    let vol = (o.volume ?? 1) * d.vol * (1 + (Math.random() - 0.5) * 0.08);
    if (hasDist && !positional) vol *= direct; // distance given without a position: attenuate by hand
    if (positional) vol *= REMOTE_GUN;
    const gb = G(ctx, vol);
    let pan = null;
    if (positional) {
      pan = this._panner(d, o.position);
      gb.connect(pan);
      pan.connect(this.gr.sfxBus);
    } else gb.connect(this.gr.sfxBus);
    const send = G(
      ctx,
      d.rev *
        (1 + 2.5 * wFar) *
        (positional ? 1.3 * clamp(Math.sqrt(direct) * 1.15, 0.12, 1.15) : 1),
    );
    gb.connect(send);
    send.connect(this.gr.revIn); // distant = wetter, but still falls off
    const srcs = [],
      nodes = [gb, pan, send];
    const pitch = (o.pitch ?? 1) * (1 + (Math.random() * 2 - 1) * 0.03);
    const add = (key, list, gain, at, rate, filt) => {
      const s = ctx.createBufferSource();
      s.buffer = list[this._rr(key, list.length)];
      s.playbackRate.value = rate;
      const g = G(ctx, gain);
      if (filt) {
        s.connect(filt);
        filt.connect(g);
        nodes.push(filt);
      } else s.connect(g);
      g.connect(gb);
      nodes.push(g);
      s.start(at);
      srcs.push(s);
    };
    if (wFar < 1 && core.length) {
      const near = Math.cos((wFar * Math.PI) / 2);
      // per-shot tone variation so consecutive rounds are never identical
      const filt = F(
        ctx,
        "peaking",
        600 + Math.random() * 2800,
        0.8,
        (Math.random() * 2 - 1) * 3,
      );
      add(name, core, near, t0, pitch, filt);
      if (tail.length)
        add(
          name + ":tail",
          tail,
          near * (0.85 + Math.random() * 0.2),
          t0 + Math.random() * 0.004,
          pitch * (1 + (Math.random() * 2 - 1) * 0.02),
        );
      if (mech.length && Math.random() < 0.9)
        add(
          name + ":mech",
          mech,
          near * (0.5 + Math.random() * 0.5),
          t0 + Math.random() * 0.003,
          1 + (Math.random() * 2 - 1) * 0.05,
        );
    }
    if (wFar > 0 && far.length)
      add(
        name + ":far",
        far,
        Math.sin((wFar * Math.PI) / 2),
        t0,
        pitch * (1 + (Math.random() * 2 - 1) * 0.02),
      );
    let left = srcs.length;
    const h = {
      name,
      loop: false,
      ended: false,
      far: wFar,
      delay,
      stop: (fade = 0.04, at) => {
        if (h.ended || h._stopping) return;
        h._stopping = true;
        const t = Math.max(ctx.currentTime, at || 0);
        fade = Math.max(0.005, fade);
        gb.gain.cancelScheduledValues(t);
        gb.gain.setValueAtTime(gb.gain.value, t);
        gb.gain.linearRampToValueAtTime(0, t + fade);
        for (const s of srcs) {
          try {
            s.stop(Math.max(t, t0) + fade + 0.01);
          } catch (e) {}
        }
      },
      setVolume: (v, ramp = 0.05) => {
        if (!h._stopping)
          gb.gain.setTargetAtTime(
            v * d.vol * (positional ? REMOTE_GUN : 1),
            ctx.currentTime,
            Math.max(0.001, ramp / 3),
          );
      },
      setPitch: (p) => {
        for (const s of srcs)
          s.playbackRate.setTargetAtTime(p, ctx.currentTime, 0.02);
      },
      setPosition: (p) => {
        if (!pan || !p) return;
        const t = ctx.currentTime;
        pan.positionX.setTargetAtTime(p.x, t, 0.02);
        pan.positionY.setTargetAtTime(p.y, t, 0.02);
        pan.positionZ.setTargetAtTime(p.z, t, 0.02);
      },
    };
    this._track(name, h, arr, nodes);
    for (const s of srcs)
      s.onended = () => {
        if (--left <= 0) h._done();
      };
    return h;
  }
}

// ───────────────────────────────────────────────────────────── engine
const NOOP = Object.freeze({
  stop() {},
  setVolume() {},
  setPosition() {},
  setPitch() {},
  ended: true,
  name: null,
});

