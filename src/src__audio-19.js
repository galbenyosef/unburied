// src__audio 19 — ctx
// Lines 5123-5636 of readable/src__audio.pretty.js (statement-aligned).
export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.ready = false;
    this.bufs = {};
    this.mx = null;
    this._warned = new Set();
    this.initMs = 0;
    this.loadMs = 0;
    this.firstPassMs = 0;
    this.vol = { master: 1, music: 0.6, sfx: 1 };
    this.music = null;
    this._ducked = false;
    this.names = Object.keys(DEFS).filter((n) => !n.includes(":"));
    this.stingNames = Object.keys(STINGS);
    this.musicNames = ["menu", "gameover"];
    this.renderStats = RSTATS;
    this._jobs = [];
    this._waiters = {};
    this._loadedP = null;
    // The loader starts at construction (OfflineAudioContext needs no user gesture) and doesn't wait on
    // the realtime context, so by the time init() runs from the first click most buffers already exist.
    if (
      typeof window !== "undefined" &&
      typeof OfflineAudioContext !== "undefined"
    )
      setTimeout(() => {
        this._startLoader(this.ctx ? this.ctx.sampleRate : 48000);
        setTimeout(() => this._boot(), 0);
      }, 0);
  }
  _boot() {
    if (this.ctx) return;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AC({ latencyHint: "interactive" });
    } catch (e) {
      console.warn("[audio] context unavailable", e);
    }
  }
  async init() {
    if (!this._initP) this._initP = this._init();
    return this._initP;
  }
  async _init() {
    const t0 = performance.now();
    this._boot();
    const ctx = this.ctx;
    if (!ctx) return this;
    this._startLoader(ctx.sampleRate);
    const tc = performance.now();
    // init() is called from a user gesture: resume synchronously inside it (never block on the promise)
    try {
      const p = ctx.resume();
      if (p && p.catch) p.catch(() => {});
    } catch (e) {}
    if (typeof document !== "undefined" && ctx.state !== "running") {
      const kick = () => {
        if (ctx.state !== "running") ctx.resume().catch(() => {});
        else
          ["pointerdown", "keydown", "touchend"].forEach((e) =>
            document.removeEventListener(e, kick, true),
          );
      };
      ["pointerdown", "keydown", "touchend"].forEach((e) =>
        document.addEventListener(e, kick, true),
      );
    }
    const tn = performance.now();
    this.ir = makeIR(ctx.sampleRate, 1.6);
    this.gr = buildGraph(ctx, this.vol, this.ir);
    Object.assign(this, {
      master: this.gr.master,
      sfxBus: this.gr.sfxBus,
      musicBus: this.gr.musicBus,
      bedBus: this.gr.bedBus,
      uiBus: this.gr.uiBus,
      conv: this.gr.conv,
      revIn: this.gr.revIn,
      musicRev: this.gr.musicRev,
      duckIn: this.gr.duckIn,
      duckLP: this.gr.duckLP,
    });
    this.mx = new Mixer(this, ctx, this.gr);
    this.ready = true;
    this.initMs = performance.now() - t0;
    this.initBreakdown = {
      context: +(tc - t0).toFixed(1),
      resume: +(tn - tc).toFixed(1),
      graphAndIR: +(performance.now() - tn).toFixed(1),
    };
    this._timer = setInterval(() => this._tick(), 50);
    return this;
  }

  // ── background pre-render queue ──
  _startLoader(sr) {
    if (this._loaderStarted) return;
    this._loaderStarted = true;
    const t0 = performance.now();
    this._sr = sr;
    makeNoise(sr);
    const first = (d) => Math.min(d.n, d.dur > 2.5 ? 1 : 2);
    for (const name of PRIORITY) {
      const d = DEFS[name];
      this.bufs[name] = [];
      this._jobs.push({ name, v0: 0, v1: first(d) });
    }
    for (const name of PRIORITY) {
      const d = DEFS[name];
      for (let v = first(d); v < d.n; v += 2)
        this._jobs.push({ name, v0: v, v1: Math.min(d.n, v + 2) });
    }
    this._firstPassLeft = PRIORITY.length;
    let doneResolve;
    this._loadedP = new Promise((r) => (doneResolve = r));
    const CONC = 3;
    let running = 0;
    const next = () => {
      while (running < CONC && this._jobs.length) {
        const job = this._jobs.shift();
        running++;
        renderDef(job.name, DEFS[job.name], this._sr, job.v0, job.v1)
          .then((bufs) => {
            this.bufs[job.name].push(...bufs);
            if (job.v0 === 0) {
              if (--this._firstPassLeft === 0)
                this.firstPassMs = performance.now() - t0;
              const w = this._waiters[job.name];
              if (w) {
                delete this._waiters[job.name];
                w.forEach((f) => f());
              }
            }
          })
          .catch((e) => console.error("[audio] render failed", job.name, e))
          .finally(() => {
            running--;
            if (!this._jobs.length && !running) {
              this.loadMs = performance.now() - t0;
              doneResolve();
            } else setTimeout(next, 0); // yield to the game loop between jobs
          });
      }
    };
    next();
  }
  _request(name) {
    // bump a not-yet-rendered sound (and its layers) to the front of the queue
    for (const n of [name + ":mech", name + ":tail", name]) {
      const i = this._jobs.findIndex((j) => j.name === n && j.v0 === 0);
      if (i > 0) this._jobs.unshift(this._jobs.splice(i, 1)[0]);
    }
  }
  whenLoaded() {
    return this._loadedP || Promise.resolve();
  }
  isLoaded(name) {
    return !!(this.bufs[name] && this.bufs[name].length);
  }
  _warn(name) {
    if (!this._warned.has(name)) {
      this._warned.add(name);
      console.warn(`[audio] unknown sound "${name}"`);
    }
  }

  play(name, o = {}) {
    const d = DEFS[name];
    if (!d) {
      this._warn(name);
      return NOOP;
    }
    if (!this.ready) return NOOP;
    const launch = (opts) =>
      d.gun
        ? this.mx.playGun(name, d, opts)
        : this.mx.play(name, d, this.bufs[name], opts);
    if (this.isLoaded(name)) return launch(o);
    // not rendered yet: render it next, and start it if it arrives quickly (loops always start)
    this._request(name);
    const loop = !!(o.loop ?? d.loop),
      asked = this.ctx.currentTime;
    const opts = {
      ...o,
      position: o.position
        ? { x: o.position.x, y: o.position.y, z: o.position.z }
        : undefined,
    };
    const h = {
      name,
      loop,
      _real: null,
      _cancel: false,
      _gone: false,
      get ended() {
        return h._real ? h._real.ended : h._gone;
      },
      stop: (f) => {
        h._cancel = true;
        if (h._real) h._real.stop(f);
        else h._gone = true;
      },
      setVolume: (v, r) => {
        opts.volume = v;
        if (h._real) h._real.setVolume(v, r);
      },
      setPitch: (p) => {
        opts.pitch = p;
        if (h._real) h._real.setPitch(p);
      },
      setPosition: (p) => {
        if (opts.position) opts.position = { x: p.x, y: p.y, z: p.z };
        if (h._real) h._real.setPosition(p);
      },
    };
    (this._waiters[name] || (this._waiters[name] = [])).push(() => {
      if (h._cancel || (!loop && this.ctx.currentTime - asked > 0.3)) {
        h._gone = true;
        return;
      }
      h._real = launch(opts);
    });
    return h;
  }

  playMusic(name, { loop } = {}) {
    if (!this.ready) return;
    if (name !== "menu" && name !== "gameover") {
      this._warn("music:" + name);
      return;
    }
    if (
      this.music &&
      !this.music.dead &&
      this.music.kind === name &&
      !this.music.done
    )
      return;
    if (this.music) this.music.stop(1.5);
    this.music = new Music(this.ctx, this.bedBus, this.musicRev, name, {
      loop,
    });
    this.music.schedule(this.ctx.currentTime + 0.5);
  }
  stopMusic(fade = 1) {
    if (this.music) {
      this.music.stop(fade);
      this.music = null;
    }
  }

  sting(name, opts = {}) {
    const s = STINGS[name];
    if (!s) {
      this._warn("sting:" + name);
      return NOOP;
    }
    if (!this.ready) return NOOP;
    const ctx = this.ctx,
      t = ctx.currentTime + 0.03,
      g = G(ctx, s.gain ?? 1),
      w = G(ctx, s.gain ?? 1);
    g.connect(this.musicBus);
    w.connect(this.musicRev);
    try {
      s.fn(ctx, g, w, t, rng((Math.random() * 1e9) | 0), opts);
    } catch (e) {
      console.error("[audio] sting failed", name, e);
    }
    // dip the music bed under the stinger
    const bg = this.bedBus.gain;
    bg.cancelScheduledValues(t);
    bg.setValueAtTime(bg.value, t);
    bg.linearRampToValueAtTime(0.4, t + 0.3);
    bg.setValueAtTime(0.4, t + s.len * 0.7);
    bg.linearRampToValueAtTime(1, t + s.len + 0.5);
    setTimeout(
      () => {
        try {
          g.disconnect();
          w.disconnect();
        } catch (e) {}
      },
      (s.len + 2.5) * 1000,
    );
    return {
      name,
      ended: false,
      stop: (fade = 0.3) => {
        const n = ctx.currentTime;
        for (const x of [g, w]) {
          x.gain.cancelScheduledValues(n);
          x.gain.setValueAtTime(x.gain.value, n);
          x.gain.linearRampToValueAtTime(0, n + fade);
        }
      },
      setVolume: (v) => {
        g.gain.value = v * (s.gain ?? 1);
        w.gain.value = v * (s.gain ?? 1);
      },
      setPosition() {},
      setPitch() {},
    };
  }

  setListener(pos, q) {
    if (!this.ctx || !pos) return;
    const L = this.ctx.listener;
    let fx = 0,
      fy = 0,
      fz = -1,
      ux = 0,
      uy = 1,
      uz = 0;
    if (q) {
      const { x, y, z, w } = q;
      const rot = (vx, vy, vz) => {
        const tx = 2 * (y * vz - z * vy),
          ty = 2 * (z * vx - x * vz),
          tz = 2 * (x * vy - y * vx);
        return [
          vx + w * tx + (y * tz - z * ty),
          vy + w * ty + (z * tx - x * tz),
          vz + w * tz + (x * ty - y * tx),
        ];
      };
      [fx, fy, fz] = rot(0, 0, -1);
      [ux, uy, uz] = rot(0, 1, 0);
    }
    this._lpos = { x: pos.x, y: pos.y, z: pos.z };
    if (this.mx) this.mx.lpos = this._lpos;
    if (L.positionX) {
      L.positionX.value = pos.x;
      L.positionY.value = pos.y;
      L.positionZ.value = pos.z;
      L.forwardX.value = fx;
      L.forwardY.value = fy;
      L.forwardZ.value = fz;
      L.upX.value = ux;
      L.upY.value = uy;
      L.upZ.value = uz;
    } else {
      L.setPosition(pos.x, pos.y, pos.z);
      L.setOrientation(fx, fy, fz, ux, uy, uz);
    }
  }

  setVolume(v = {}) {
    for (const k of ["master", "music", "sfx"])
      if (typeof v[k] === "number" && isFinite(v[k]))
        this.vol[k] = clamp(v[k], 0, 1);
    if (!this.ctx || !this.gr) return;
    const t = this.ctx.currentTime,
      g = this.gr;
    g.master.gain.setTargetAtTime(this.vol.master, t, 0.03);
    g.musicBus.gain.setTargetAtTime(this.vol.music, t, 0.03);
    g.musicRev.gain.setTargetAtTime(this.vol.music, t, 0.03);
    g.sfxBus.gain.setTargetAtTime(this.vol.sfx * SFX_TRIM, t, 0.03);
    g.uiBus.gain.setTargetAtTime(this.vol.sfx, t, 0.03);
  }

  setDucked(on) {
    on = !!on;
    if (on === this._ducked) return;
    this._ducked = on;
    if (!this.ctx || !this.gr) return;
    const t = this.ctx.currentTime,
      g = this.gr;
    g.duckLP.frequency.cancelScheduledValues(t);
    g.duckLP.frequency.setTargetAtTime(on ? 650 : 18000, t, on ? 0.12 : 0.25);
    g.duckIn.gain.cancelScheduledValues(t);
    g.duckIn.gain.setTargetAtTime(on ? 0.55 : 1, t, 0.15);
  }

  _tick() {
    if (!this.ctx) return;
    const m = this.music;
    if (m) {
      m.schedule(this.ctx.currentTime + 0.5);
      if (m.done && m.stopAt && this.ctx.currentTime > m.stopAt)
        this.music = null;
    }
  }
  update(dt) {
    if (this.ready) this._tick();
  }

  // ── test hooks ──
  // kind 'sound' returns variant 0 exactly as play() would use it (normalised, with the mix trim applied).
  async renderOffline(kind, name, seconds = 8, opts = {}) {
    const sr = this._sr || (this.ctx ? this.ctx.sampleRate : 48000);
    makeNoise(sr);
    if (kind === "sound") {
      const d = DEFS[name];
      const [b] = await renderDef(
        name,
        d,
        sr,
        opts.variant ?? 0,
        (opts.variant ?? 0) + 1,
      );
      for (let k = 0; k < b.numberOfChannels; k++) {
        const A = b.getChannelData(k);
        for (let i = 0; i < A.length; i++) A[i] *= d.vol;
      }
      return b;
    }
    const oc = new OfflineAudioContext({
      numberOfChannels: 2,
      length: Math.ceil(seconds * sr),
      sampleRate: sr,
    });
    const ctl = installDefer(oc, sr);
    const out = G(oc, this.vol.music);
    out.connect(oc.destination);
    const cv = oc.createConvolver();
    cv.buffer = this.ir || makeIR(sr);
    const rv = G(oc, 0.8);
    ch(cv, rv, out);
    if (kind === "sting") {
      const sg = G(oc, STINGS[name].gain ?? 1),
        sw = G(oc, STINGS[name].gain ?? 1);
      sg.connect(out);
      sw.connect(cv);
      STINGS[name].fn(oc, sg, sw, 0.01, rng(opts.seed ?? 5), opts);
    } else if (kind === "music") {
      const m = new Music(oc, out, cv, name, {
        loop: opts.loop,
        seed: opts.seed ?? 11,
        fadeIn: 0.5,
      });
      const step = (t) => {
        m.schedule(t + 1.5);
        if (t + 1 < seconds) oc.__defer(t + 1, () => step(t + 1));
      };
      step(0);
    }
    ctl.started = true;
    return oc.startRendering();
  }

  // Render a whole scene through the real mix graph (buses, reverb, compressor, limiter) offline.
  // events: [{ t, name, opts }] (name 'sting:<x>' for stingers). Returns the buffer plus compressor /
  // limiter gain-reduction traces sampled every 10 ms.
  async renderScene(
    events,
    seconds = 4,
    { listener = { x: 0, y: 1.65, z: 0 }, raw = false, warm = 2 } = {},
  ) {
    // `warm` s of silence are rendered first and cut: Chrome's DynamicsCompressor starts fully clamped
    // and takes ~1 s to release, which would otherwise pollute the gain-reduction traces.
    await this.whenLoaded();
    const sr = this._sr || 48000,
      total = seconds + warm;
    const oc = new OfflineAudioContext({
      numberOfChannels: 2,
      length: Math.ceil(total * sr),
      sampleRate: sr,
    });
    const ctl = installDefer(oc, sr);
    const gr = buildGraph(oc, this.vol, this.ir || makeIR(sr), raw),
      mx = new Mixer(this, oc, gr);
    mx.lpos = listener;
    const L = oc.listener;
    if (L.positionX) {
      L.positionX.value = listener.x;
      L.positionY.value = listener.y;
      L.positionZ.value = listener.z;
    }
    for (const ev of events) {
      // built up-front: suspend round-trips are the slow part of offline renders
      const t = ev.t + warm;
      (() => {
        if (ev.name.startsWith("sting:")) {
          const s = STINGS[ev.name.slice(6)],
            g = G(oc, s.gain ?? 1),
            w = G(oc, s.gain ?? 1);
          g.connect(gr.musicBus);
          w.connect(gr.musicRev);
          s.fn(oc, g, w, t, rng(7), ev.opts || {});
          return;
        }
        const d = DEFS[ev.name];
        if (!d) return;
        if (d.gun) mx.playGun(ev.name, d, ev.opts || {}, t);
        else mx.play(ev.name, d, this.bufs[ev.name], ev.opts || {}, t);
      })();
    }
    const comp = [],
      lim = [],
      dt = 0.02;
    const probe = (t) => {
      if (t >= warm - 1e-6) {
        comp.push(gr.comp.reduction);
        lim.push(gr.lim.reduction);
      }
      if (t + dt < total) oc.__defer(t + dt, () => probe(t + dt));
    };
    oc.__defer(dt, () => probe(dt));
    ctl.started = true;
    const full = await oc.startRendering();
    const off = Math.floor(warm * sr),
      buf = new AudioBuffer({
        length: full.length - off,
        numberOfChannels: 2,
        sampleRate: sr,
      });
    for (let c = 0; c < 2; c++)
      buf.getChannelData(c).set(full.getChannelData(c).subarray(off));
    return { buf, comp, lim, dt };
  }
}

