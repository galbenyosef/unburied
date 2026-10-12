// src__zombies 08 — math
// Lines 2466-4661 of readable/src__zombies.pretty.js (statement-aligned).
export class ZombieManager {
  constructor(o = {}) {
    const { scene, level, T, audio, fx } = o;
    this.scene = scene;
    this.level = level;
    this.T = T;
    this.audio = audio;
    this.fx = fx;
    this.zombies = [];
    this._hb = [];
    this._hbDirty = true;
    this.instaKill = false;
    this.onAttack = () => {};
    this.onKill = () => {};
    this._mats = buildMaterials(T);
    this._variants = [];
    this._occ = new Map();
    this._props = [];
    this._pending = [];
    this._groanTok = 2;
    this._stepTok = 6;
    this._deathTok = 3;
    this._time = 0;
    this._P = new Float32Array(PL);
    this._P2 = new Float32Array(PL);
    this.debug = false; // test harness: freeze AI
    // co-op / net
    this.netMode = null; // null (solo) | 'host' | 'client'
    this.netDelay = 0.1; // client interpolation delay behind the snapshot frontier (s)
    this._nextId = 1;
    this._byId = new Map();
    this._netBuf = new Map(); // id -> [{t,x,z,yaw,c,at,fl}] sorted by t
    this._netLatest = -1;
    this._netLatestAt = 0;
    this._rt = null;
    this._deadIds = new Set();
    this._players = [];
    this._valid = [];
    this.hitGeo = new THREE.BoxGeometry(1, 1, 1);
    if (o.prewarm !== false) this.prewarm(); // ~0.4 s of geometry building: do it at load, not on first spawn
  }

  // ------------------------------------------------------------------ public API
  get hitboxes() {
    if (this._hbDirty) {
      this._hb.length = 0;
      for (const z of this.zombies)
        if (!z.dead)
          for (const h of z.hb) if (!h.userData.off) this._hb.push(h);
      this._hbDirty = false;
    }
    return this._hb;
  }
  get alive() {
    let n = 0;
    for (const z of this.zombies) if (!z.dead) n++;
    return n;
  }
  get list() {
    return this.zombies.filter((z) => !z.dead);
  }
  setInstaKill(b) {
    this.instaKill = !!b;
  }
  variantCount() {
    return VARIANTS.length;
  }
  prewarm() {
    for (let i = 0; i < VARIANTS.length; i++) this._variant(i);
  }

  spawn(win, o = {}) {
    if (o.id != null && this._byId.has(o.id)) return this._byId.get(o.id); // idempotent
    let vi = o.variant;
    if (vi == null || !VARIANTS[vi]) {
      const tot = VARIANTS.reduce((a, v) => a + v.weight, 0);
      let r = Math.random() * tot;
      vi = 0;
      for (let i = 0; i < VARIANTS.length; i++) {
        r -= VARIANTS[i].weight;
        if (r <= 0) {
          vi = i;
          break;
        }
      }
    }
    // every per-instance random choice comes from this seed, so a client can rebuild the same zombie
    const seed =
      o.seed != null ? o.seed >>> 0 : (Math.random() * 0x7fffffff) | 0;
    const R = rng(seed * 2654435761 + 97);
    const z = this._create(vi, { ...o, _R: R, seed });
    z.win = win || null;
    z.health = z.maxHealth = o.health ?? 150;
    const a = R() * TAU,
      r = R() * 0.35;
    if (win && win.outsidePos) {
      z.root.position.set(
        win.outsidePos.x + Math.cos(a) * r,
        0,
        win.outsidePos.z + Math.sin(a) * r,
      );
      const t = win.attackPos || win.insidePos;
      if (t)
        z.yaw = Math.atan2(t.x - z.root.position.x, t.z - z.root.position.z);
      this._setState(z, "rise", true);
      this._fx("dirtBurst", z.root.position.clone());
      this._snd("zombie_spawn", z.root.position, { volume: 0.7 });
    } else {
      if (o.pos) z.root.position.copy(o.pos);
      if (o.yaw != null) z.yaw = o.yaw;
      this._setState(z, o.state || "chase", true);
    }
    z.root.rotation.y = z.yaw;
    this.scene.add(z.root);
    this.zombies.push(z);
    this._byId.set(z.id, z);
    this._hbDirty = true;
    return z;
  }

  damage(z, dmg, part, point, dir, info = {}) {
    if (!z || z.dead)
      return { killed: false, headshot: false, deathVariant: null };
    const headshot = part === "head";
    if (this.netMode === "client") {
      // puppets: the host owns health; show feedback only
      this.remoteHit(z.id, part, point, dir);
      return { killed: false, headshot, deathVariant: null, predicted: true };
    }
    if (this.instaKill) dmg = Math.max(dmg, z.health + 1);
    z.health -= dmg;
    const d = dir ? dir.clone().normalize() : new V3(0, 0, -1);
    if (point && !info.explosive)
      this._fx("blood", point.clone(), d.clone(), headshot ? 1.4 : 1);
    if (z.health <= 0) {
      const deathVariant = this._kill(z, {
        headshot,
        dir: d,
        info,
        part,
        point,
      });
      return { killed: true, headshot, deathVariant };
    }
    this._flinch(z, part, d, dmg / Math.max(60, z.maxHealth * 0.25));
    return { killed: false, headshot, deathVariant: null };
  }

  explode(pos, radius, damage, info = {}) {
    const kills = [];
    if (this.netMode === "client") return kills;
    for (const z of this.zombies.slice()) {
      if (z.dead) continue;
      const c = _v3.copy(z.root.position);
      c.y += 0.9;
      const dist = c.distanceTo(pos);
      if (dist > radius) continue;
      const f = 1 - dist / radius;
      const dir = c.clone().sub(pos);
      dir.y = Math.max(dir.y, 0.2);
      dir.normalize();
      const r = this.damage(
        z,
        damage * (0.3 + 0.7 * f),
        "torso",
        c.clone(),
        dir,
        { ...info, explosive: true, explosionPos: pos.clone(), blast: f },
      );
      if (r.killed) kills.push(z);
      else if (
        f > 0.3 &&
        !z.crawler &&
        z.state !== "rise" &&
        z.state !== "vaulting" &&
        Math.random() < 0.45
      )
        this._makeCrawler(z);
    }
    return kills;
  }

  killAll(info = {}) {
    if (this.netMode === "client") return;
    for (const z of this.zombies)
      if (!z.dead && !z._nuked) {
        z._nuked = true;
        this._pending.push({
          z,
          t: Math.random() * 1.5,
          info: { ...info, nuke: true },
        });
      }
  }

  clear() {
    for (const z of this.zombies) this._dispose(z);
    this.zombies.length = 0;
    for (const p of this._props) p.mesh.parent && p.mesh.parent.remove(p.mesh);
    this._props.length = 0;
    this._pending.length = 0;
    this._occ.clear();
    this._byId.clear();
    this._netBuf.clear();
    this._deadIds.clear();
    this._rt = null;
    this._hbDirty = true;
  }

  // ================================================================== co-op / net
  setNetMode(m) {
    this.netMode = m === "host" || m === "client" ? m : null;
    this._rt = null;
  }
  byId(id) {
    return this._byId.get(id) || null;
  }

  _netSpawnObj(z) {
    const ws = this.level && this.level.windows;
    const c = SC.indexOf(z.state);
    return {
      id: z.id,
      win: ws && z.win ? ws.indexOf(z.win) : -1,
      variant: z.variant,
      seed: z.netSeed,
      helmet: !!z.hadHelmet,
      speed: z.gait,
      spd: z.speed,
      health: z.maxHealth,
      // current motion state, so late joiners don't see a fresh rise
      x: r2(z.root.position.x),
      z: r2(z.root.position.z),
      yaw: r2(z.yaw),
      st: c < 0 ? 4 : c,
      crawler: z.crawler ? 1 : 0,
    };
  }

  // host → clients, ~20 Hz, unreliable. Row: [id, x, z, yaw, stateCode, animTime, flags]
  netExport() {
    const out = [];
    for (const z of this.zombies) {
      if (z.dead) continue;
      const c = SC.indexOf(z.state);
      const at =
        z.state === "tearing" ? z.tearT : z.state === "attack" ? z.atkT : z.stT;
      out.push([
        z.id,
        r2(z.root.position.x),
        r2(z.root.position.z),
        r2(angDiff(z.yaw, 0)),
        c < 0 ? 4 : c,
        r2(at),
        z.crawler ? 1 : 0,
      ]);
    }
    return out;
  }

  // client: buffer rows (may arrive late, lost, or out of order)
  netApply(rows, serverTime) {
    if (!Array.isArray(rows) || !(serverTime >= 0)) return;
    if (serverTime > this._netLatest) {
      this._netLatest = serverTime;
      this._netLatestAt = this._time;
    }
    for (const r of rows) {
      if (!Array.isArray(r) || r.length < 5) continue;
      const id = r[0] | 0;
      if (this._deadIds.has(id)) continue;
      let buf = this._netBuf.get(id);
      if (!buf) {
        buf = [];
        this._netBuf.set(id, buf);
      }
      const smp = {
        t: serverTime,
        x: +r[1] || 0,
        z: +r[2] || 0,
        yaw: +r[3] || 0,
        c: r[4] | 0,
        at: +r[5] || 0,
        fl: r[6] | 0,
      };
      let i = buf.length;
      while (i > 0 && buf[i - 1].t > serverTime) i--;
      if (i > 0 && buf[i - 1].t === serverTime) buf[i - 1] = smp;
      else buf.splice(i, 0, smp);
      if (buf.length > 16) buf.splice(0, buf.length - 16);
    }
  }

  spawnRemote(n) {
    if (!n || n.id == null) return null;
    const id = n.id | 0;
    if (this._byId.has(id)) return this._byId.get(id); // idempotent
    if (this._deadIds.has(id)) return null; // already killed (raced)
    const ws = this.level && this.level.windows;
    const win = ws && n.win != null && n.win >= 0 ? ws[n.win] || null : null;
    const st = n.st | 0;
    const o = {
      id,
      variant: n.variant,
      seed: n.seed,
      helmet: n.helmet,
      speed: typeof n.spd === "number" ? n.spd : n.speed,
      gait: n.speed,
      health: n.health,
    };
    let z;
    if (st === 0 || n.x == null) z = this.spawn(win, o);
    else {
      z = this.spawn(null, {
        ...o,
        pos: new V3(n.x, 0, n.z),
        yaw: n.yaw ?? 0,
        state: SC[st] || "chase",
      });
      z.win = win;
    }
    z.puppet = true;
    if (n.crawler) this._makeCrawler(z, true);
    return z;
  }

  remoteHit(id, part, point, dir) {
    const z = typeof id === "object" && id ? id : this._byId.get(id);
    if (!z || z.dead) return;
    const d = toV3(dir, new V3(0, 0, -1)).normalize();
    const pt = toV3(point, null);
    if (pt) this._fx("blood", pt, d.clone(), part === "head" ? 1.4 : 1);
    this._flinch(z, part || "torso", d, 0.8);
  }

  remoteKill(id, o = {}) {
    const z = this._byId.get(id);
    if (!z || z.dead) return; // unknown yet / already dying → ignore
    const d = toV3(o.dir, new V3(0, 0, -1)).normalize();
    const pt = toV3(o.point, null);
    if (pt && !o.explosive && !o.nuke)
      this._fx("blood", pt, d.clone(), o.headshot ? 1.4 : 1);
    let dv = o.deathVariant;
    if (dv == null)
      dv =
        DEATHS.indexOf(
          o.nuke
            ? "nuke"
            : o.explosive
              ? "blast"
              : o.headshot
                ? "headshot"
                : "back",
        ) +
        8 * 12;
    this._kill(z, {
      headshot: !!o.headshot,
      dir: d,
      info: {
        remote: true,
        explosive: !!o.explosive,
        nuke: !!o.nuke,
        deathVariant: dv,
      },
      part: o.headshot ? "head" : "torso",
    });
  }

  _clientRenderTime(dt) {
    if (this._netLatest < 0) return null;
    const target =
      this._netLatest + (this._time - this._netLatestAt) - this.netDelay;
    if (this._rt == null || Math.abs(target - this._rt) > 0.5)
      this._rt = target;
    else this._rt += dt + (target - this._rt) * Math.min(1, dt * 1.5);
    return this._rt;
  }

  _pruneNet() {
    if (this._netLatest < 0) return;
    for (const [id, buf] of this._netBuf) {
      if (!buf.length || this._netLatest - buf[buf.length - 1].t > 3) {
        this._netBuf.delete(id);
        continue;
      }
      // keep a little history behind the render time
      if (this._rt != null) {
        let k = 0;
        while (k < buf.length - 2 && buf[k + 1].t < this._rt - 0.25) k++;
        if (k) buf.splice(0, k);
      }
    }
  }

  // drive a puppet from interpolated host snapshots (no AI, no attacks, no plank tearing)
  _puppet(z, dt, rt) {
    const buf = this._netBuf.get(z.id);
    if (!buf || !buf.length || rt == null) {
      z.gspeed = damp(z.gspeed, 0, 8, dt);
      return;
    }
    let i = buf.length - 1;
    while (i > 0 && buf[i].t > rt) i--;
    const a = buf[i],
      b = buf[i + 1];
    let x, zz, yaw;
    if (a.t >= rt || (!b && i === 0)) {
      x = a.x;
      zz = a.z;
      yaw = a.yaw;
    } else if (b) {
      const f = clamp((rt - a.t) / Math.max(1e-4, b.t - a.t), 0, 1);
      if (Math.hypot(b.x - a.x, b.z - a.z) > 3) {
        x = b.x;
        zz = b.z;
        yaw = b.yaw;
      } // teleport: snap
      else {
        x = lerp(a.x, b.x, f);
        zz = lerp(a.z, b.z, f);
        yaw = a.yaw + angDiff(b.yaw, a.yaw) * f;
      }
    } else {
      // past the newest sample: extrapolate at most 100 ms, then hold
      const q = buf[i - 1],
        ex = Math.min(rt - a.t, 0.1),
        span = a.t - q.t;
      if (span > 1e-4 && Math.hypot(a.x - q.x, a.z - q.z) < 3 && a.c === q.c) {
        x = a.x + ((a.x - q.x) / span) * ex;
        zz = a.z + ((a.z - q.z) / span) * ex;
      } else {
        x = a.x;
        zz = a.z;
      }
      yaw = a.yaw;
    }
    const p = z.root.position,
      ox = p.x,
      oz = p.z;
    const fresh = !z.netStarted;
    z.netStarted = true;
    p.x = x;
    p.z = zz;
    const moved = fresh ? 0 : Math.hypot(p.x - ox, p.z - oz) / dt;
    if (!fresh && moved > 25) z.gspeed = 0;
    else z.gspeed = damp(z.gspeed, moved, 12, dt);
    if (!fresh) {
      z.vel.set((p.x - ox) / dt, 0, (p.z - oz) / dt);
    }
    z.yaw = yaw;
    z.root.rotation.y = yaw;
    // state + anim clock from the governing sample
    const st = SC[a.c] || "chase";
    if (st !== z.state) {
      if (!(st === "rise" && z.state !== "rise")) this._setState(z, st, fresh);
    }
    const at = a.at + Math.max(0, rt - a.t);
    if (z.state === "rise") z.stT = Math.min(at, RISE_T);
    else if (z.state === "vaulting") z.stT = Math.min(at, VAULT_T);
    else if (z.state === "tearing") {
      const prev = z.tearT,
        nt = at % TEAR_T,
        hit = TEAR_T * TEAR_HIT;
      if (!fresh && ((prev < hit && nt >= hit) || (nt < prev && hit > prev))) {
        if (z.win && (z.win.planks ?? 0) > 0)
          this._snd("plank_tear", z.win.attackPos || p, { volume: 0.9 });
        z.vocal = 1;
      }
      z.tearT = nt;
    } else if (z.state === "attack") {
      z.atkT = Math.min(at, ATK_T);
      this._attackSound(z);
    }
    if (a.fl & 1 && !z.crawler) this._makeCrawler(z);
  }

  update(dt, players, opts = {}) {
    dt = Math.min(dt, 0.05);
    if (dt <= 0) return;
    this._time += dt;
    this._groanTok = Math.min(3, this._groanTok + dt * 0.9);
    this._stepTok = Math.min(8, this._stepTok + dt * 14);
    this._deathTok = Math.min(4, this._deathTok + dt * 3);
    // players: array of {id, pos, eye, alive, downed}; a single object is still accepted
    const list = Array.isArray(players) ? players : players ? [players] : [];
    this._players = list.filter((p) => p && p.pos);
    this._valid = this._players.filter((p) => p.alive !== false && !p.downed);
    const client = this.netMode === "client";
    const rt = client ? (opts.renderTime ?? this._clientRenderTime(dt)) : null;
    // staggered nuke deaths (host / solo)
    for (let i = this._pending.length - 1; i >= 0; i--) {
      const p = this._pending[i];
      p.t -= dt;
      if (p.t <= 0) {
        this._pending.splice(i, 1);
        if (!p.z.dead && this.zombies.includes(p.z))
          this._kill(p.z, {
            headshot: false,
            dir: new V3(
              Math.random() - 0.5,
              0.3,
              Math.random() - 0.5,
            ).normalize(),
            info: p.info,
          });
      }
    }
    for (let i = this.zombies.length - 1; i >= 0; i--) {
      const z = this.zombies[i];
      z.t += dt;
      z.stT += dt;
      if (z.dead) {
        this._deathUpdate(z, dt);
        if (z.D.t > 9.5) {
          this._dispose(z);
          this.zombies.splice(i, 1);
        }
        continue;
      }
      if (client) {
        // safety: a puppet missing from snapshots for > 1 s is removed silently
        const buf = this._netBuf.get(z.id);
        const seen = Math.max(
          z.netSeenT ?? -1,
          buf && buf.length ? buf[buf.length - 1].t : -1,
        );
        if (this._netLatest >= 0 && seen >= 0 && this._netLatest - seen > 1.0) {
          this._dispose(z);
          this.zombies.splice(i, 1);
          continue;
        }
        if (seen < 0 && this._netLatest >= 0 && z.netSeenT == null)
          z.netSeenT = this._netLatest;
        this._puppet(z, dt, rt);
      } else if (!this.debug || z.debugAI) this._ai(z, dt);
      else this._debugDrive(z, dt);
      this._audio(z, dt);
      this._animate(z, dt);
    }
    this._propsUpdate(dt);
    if (client) this._pruneNet();
  }

  // ------------------------------------------------------------------ construction
  _variant(i) {
    return this._variants[i] || (this._variants[i] = buildVariant(i));
  }

  _create(vi, o) {
    const V = this._variant(vi),
      M = this._mats;
    const R = o._R || Math.random;
    const root = new THREE.Group(),
      rig = new THREE.Group();
    root.name = "zombie";
    root.add(rig);
    const bones = BN.map((n, i) => {
      const b = new THREE.Bone();
      b.name = n;
      return b;
    });
    bones.forEach((b, i) => {
      const p = BONE_POS[i],
        pp = PARENT[i] >= 0 ? BONE_POS[PARENT[i]] : new V3();
      b.position.set(p.x - pp.x, p.y - pp.y, p.z - pp.z);
      if (PARENT[i] >= 0) bones[PARENT[i]].add(b);
      else rig.add(b);
    });
    bones[BI.thL].rotation.order = "ZXY";
    bones[BI.thR].rotation.order = "ZXY";
    const skeleton = new THREE.Skeleton(
      bones,
      BONE_INV.map((m) => m.clone()),
    );
    const tintS = (R() * 3) | 0,
      tintC = (R() * 3) | 0;
    const mats = {
      skin: M.skin[tintS],
      cloth: M.cloth[tintC],
      gear: M.gear[0],
      flesh: M.flesh[0],
      eyes: M.eyes[0],
    };
    const meshes = {};
    for (const k of ["skin", "cloth", "gear", "flesh", "eyes"]) {
      if (!V.geos[k]) continue;
      const m = new THREE.SkinnedMesh(V.geos[k], mats[k]);
      m.bind(skeleton, IDENT);
      m.frustumCulled = false;
      m.castShadow = k !== "eyes";
      m.receiveShadow = k !== "eyes";
      root.add(m);
      meshes[k] = m;
    }
    let helmet = null;
    // always draw the same number of values so host and client stay in lock-step
    const hRoll = R(),
      hMat = (R() * 2) | 0,
      hr = [-0.1 + R() * 0.12, (R() - 0.5) * 0.1, (R() - 0.5) * 0.14];
    const hasHelmet = o.helmet != null ? !!o.helmet : hRoll < V.cfg.helmetP;
    if (hasHelmet) {
      helmet = new THREE.Mesh(V.helmet, M.helmet[hMat]);
      helmet.castShadow = true;
      helmet.receiveShadow = true;
      helmet.rotation.set(hr[0], hr[1], hr[2]);
      bones[BI.head].add(helmet);
    }
    const sRoll = R();
    const scale = o.scale ?? 0.97 + sRoll * 0.08;
    root.scale.setScalar(scale);
    const z = {
      id: 0,
      variant: vi,
      variantName: V.cfg.name,
      root,
      rig,
      bones,
      skeleton,
      meshes,
      helmet,
      netSeed: o.seed >>> 0,
      hadHelmet: hasHelmet,
      pos: root.position,
      scale,
      yaw: 0,
      vel: new V3(),
      gspeed: 0,
      state: "chase",
      stT: 0,
      t: R() * 10,
      dead: false,
      alive: true,
      health: 100,
      maxHealth: 100,
      crawler: false,
      missing: V.cfg.missing || null,
      gait: "walk",
      speed: 1.1,
      phase: R(),
      prevPhase: 0,
      P: new Float32Array(PL),
      Pfrom: new Float32Array(PL),
      blend: 1,
      blendDur: 0.25,
      fl: new Float32Array(5),
      flv: new Float32Array(5),
      slow: 0,
      seed: R() * 100,
      limp: R() < 0.7 ? (R() < 0.5 ? 1 : -1) : 0,
      armH: R(),
      armDrop: V.cfg.missing ? 0 : R() < 0.18 ? (R() < 0.5 ? 1 : -1) : 0,
      headTilt: (R() - 0.5) * 0.5,
      jawBase: V.cfg.jaw || 0.1,
      vocal: 0,
      repath: R() * 0.5,
      path: null,
      pathI: 0,
      groanT: 1 + R() * 5,
      tgtKey: null,
      tgtT: 0,
      lastTgt: new V3(),
      hasLast: false,
      wanderC: null,
      wanderP: null,
      wanderT: 0,
      pauseT: 0,
      stuckT: 0,
      tearT: 0,
      tearHit: false,
      atkT: 0,
      atkHit: false,
      atkCd: 0,
      hb: [],
      D: null,
      fountain: 0,
      fountT: 0,
    };
    // gait
    let sp = o.speed ?? "walk";
    const jRoll = R();
    if (typeof sp === "number") {
      z.speed = sp;
      sp = sp >= 3.5 ? "sprint" : sp >= 1.8 ? "run" : "walk";
    } else {
      if (!GAIT[sp]) sp = "walk";
      z.speed = GAIT[sp].speed * (0.94 + jRoll * 0.12);
    }
    z.gait = GAIT[o.gait] ? o.gait : sp;
    // stable integer id (host assigns; client passes the host's)
    if (o.id != null) {
      z.id = o.id | 0;
      this._nextId = Math.max(this._nextId, z.id + 1);
    } else z.id = this._nextId++;
    z.netSpawn = () => this._netSpawnObj(z);
    // hitboxes
    const hb = (bone, part, sx, sy, sz, cx, cy, cz) => {
      const m = new THREE.Mesh(this.hitGeo, M.hit);
      m.scale.set(sx, sy, sz);
      m.position.set(cx, cy, cz);
      m.visible = false;
      m.userData = { zombie: z, part, bone };
      bones[bone].add(m);
      z.hb.push(m);
    };
    if (helmet) hb(4, "head", 0.25, 0.27, 0.29, 0, 0.1, 0.013);
    else hb(4, "head", 0.19, 0.25, 0.235, 0, 0.085, 0.018);
    hb(2, "torso", 0.42, 0.36, 0.28, 0, 0.08, 0.005);
    hb(0, "torso", 0.38, 0.34, 0.27, 0, 0.0, 0);
    for (const s of [1, -1]) {
      const u = s > 0 ? 6 : 9,
        side = s > 0 ? "L" : "R";
      if (z.missing !== side) {
        hb(u, "limb", 0.13, 0.32, 0.13, 0.014 * s, -0.15, 0);
        hb(u + 1, "limb", 0.11, 0.42, 0.12, 0.012 * s, -0.2, 0);
      } else hb(u, "limb", 0.12, 0.16, 0.12, 0.01 * s, -0.05, 0);
      const l = s > 0 ? 12 : 15;
      hb(l, "limb", 0.18, 0.45, 0.19, 0, -0.21, 0.005);
      hb(l + 1, "limb", 0.14, 0.44, 0.16, 0, -0.2, 0);
      hb(l + 2, "limb", 0.11, 0.1, 0.27, 0, -0.03, 0.06);
    }
    if (z.missing) {
      const a = z.missing === "L" ? 1 : -1;
      z.armDrop = 0;
      z.missingS = a;
    }
    return z;
  }

  _dispose(z) {
    this._release(z);
    if (this._byId.get(z.id) === z) this._byId.delete(z.id);
    if (z.root.parent) z.root.parent.remove(z.root);
    if (z.helmet && z.helmet.parent) z.helmet.parent.remove(z.helmet);
    this._props = this._props.filter((p) => {
      if (p.owner === z) {
        p.mesh.parent && p.mesh.parent.remove(p.mesh);
        return false;
      }
      return true;
    });
    try {
      z.skeleton.dispose();
    } catch (e) {
      /* ignore */
    }
    this._hbDirty = true;
  }

  // ------------------------------------------------------------------ helpers
  _snd(name, pos, o = {}) {
    const a = this.audio;
    if (!a || !a.play) return;
    try {
      a.play(name, {
        position: pos ? pos.clone() : undefined,
        volume: o.volume ?? 1,
        pitch: o.pitch ?? 0.9 + Math.random() * 0.2,
        variant: o.variant,
      });
    } catch (e) {
      /* ignore */
    }
  }
  _fx(fn, ...args) {
    const f = this.fx;
    if (f && typeof f[fn] === "function") {
      try {
        f[fn](...args);
      } catch (e) {
        /* ignore */
      }
    }
  }
  _setState(z, s, instant = false) {
    if (z.state === s && !instant) return;
    z.state = s;
    z.stT = 0;
    if (instant) z.blend = 1;
    else {
      z.Pfrom.set(z.P);
      z.blend = 0;
      z.blendDur = s === "vaulting" || s === "attack" ? 0.18 : 0.28;
    }
    if (s === "tearing") {
      z.tearT = 0;
      z.tearHit = false;
    }
    if (s === "attack") {
      z.atkT = 0;
      z.atkHit = false;
      z.atkSnd = false;
    }
  }
  _release(z) {
    if (z.win && this._occ.get(z.win) === z) this._occ.delete(z.win);
  }
  _faceTo(z, yaw, rate, dt) {
    const d = angDiff(yaw, z.yaw);
    z.yaw += clamp(d, -rate * dt, rate * dt);
    z.root.rotation.y = z.yaw;
  }
  _chest(z, out) {
    return out.set(z.root.position.x, 1.25 * z.scale, z.root.position.z);
  }

  _moveToward(z, tx, tz, speed, dt, stop, collide, noSep = false) {
    const p = z.root.position;
    let dx = tx - p.x,
      dz = tz - p.z;
    const d = Math.hypot(dx, dz);
    let dvx = 0,
      dvz = 0;
    if (d > stop) {
      const k = (speed * Math.min(1, (d - stop) / 0.4 + 0.15)) / d;
      dvx = dx * k;
      dvz = dz * k;
    }
    // separation
    let sx = 0,
      sz = 0;
    if (!noSep)
      for (const o of this.zombies) {
        if (o === z || o.dead || o.state === "rise") continue;
        const ox = p.x - o.root.position.x,
          oz = p.z - o.root.position.z,
          od2 = ox * ox + oz * oz;
        if (od2 < 0.5 && od2 > 1e-6) {
          const od = Math.sqrt(od2),
            f = (0.71 - od) / 0.71;
          sx += (ox / od) * f * 2.2;
          sz += (oz / od) * f * 2.2;
        }
      }
    // players are obstacles: downed ones get a wide berth (zombies walk past / circle them)
    for (const pl of this._players) {
      const r = pl.downed || pl.alive === false ? 0.8 : 0.5;
      const ox = p.x - pl.pos.x,
        oz = p.z - pl.pos.z,
        od2 = ox * ox + oz * oz;
      if (od2 < r * r && od2 > 1e-6) {
        const od = Math.sqrt(od2),
          f = (r - od) / r;
        sx += (ox / od) * f * 3;
        sz += (oz / od) * f * 3;
        if (pl.downed) {
          const tl = Math.sign(dvx * oz - dvz * ox) || 1;
          sx += (-oz / od) * f * 1.5 * tl;
          sz += (ox / od) * f * 1.5 * tl;
        } // slide round
      }
    }
    dvx += sx;
    dvz += sz;
    const acc = 1 - Math.exp(-dt * (z.gait === "sprint" ? 5 : 7));
    z.vel.x += (dvx - z.vel.x) * acc;
    z.vel.z += (dvz - z.vel.z) * acc;
    const ox = p.x,
      oz = p.z;
    p.x += z.vel.x * dt;
    p.z += z.vel.z * dt;
    if (collide && this.level && this.level.resolveCircle) {
      try {
        this.level.resolveCircle(p, 0.28 * z.scale, 1.8);
      } catch (e) {
        /* ignore */
      }
    }
    const moved = Math.hypot(p.x - ox, p.z - oz) / dt;
    z.gspeed = damp(z.gspeed, moved, 12, dt);
    const sp = Math.hypot(z.vel.x, z.vel.z);
    if (sp > 0.15)
      this._faceTo(
        z,
        Math.atan2(z.vel.x, z.vel.z),
        z.gait === "sprint" ? 6 : 4,
        dt,
      );
    return d;
  }

  // ------------------------------------------------------------------ AI
  _ai(z, dt) {
    const w = z.win;
    if (z.slow > 0) z.slow -= dt;
    const spd = z.crawler ? 0.55 : z.speed * (z.slow > 0 ? 0.35 : 1);
    switch (z.state) {
      case "rise":
        z.gspeed = 0;
        if (z.stT >= RISE_T) this._setState(z, w ? "toWindow" : "chase");
        break;
      case "toWindow": {
        if (!w || !w.attackPos) {
          this._setState(z, "chase");
          break;
        }
        let occ = this._occ.get(w);
        if (!occ || occ.dead || !this.zombies.includes(occ)) {
          this._occ.set(w, z);
          occ = z;
        } // first come, first served
        let tx = w.attackPos.x,
          tz = w.attackPos.z,
          stop = 0.05;
        if (occ && occ !== z) {
          if (!z.waitOff) {
            const out = _v.copy(w.attackPos).sub(w.insidePos || w.outsidePos);
            out.y = 0;
            out.normalize();
            z.waitOff = [
              out.x * 1.0 - out.z * (Math.random() - 0.5) * 1.2,
              out.z * 1.0 + out.x * (Math.random() - 0.5) * 1.2,
            ];
          }
          tx += z.waitOff[0];
          tz += z.waitOff[1];
          stop = 0.2;
        }
        const d = this._moveToward(
          z,
          tx,
          tz,
          Math.min(spd, 2.6),
          dt,
          stop,
          false,
          occ === z,
        );
        if (occ && occ !== z) {
          if (d < 0.4 && w.insidePos)
            this._faceTo(
              z,
              Math.atan2(
                w.insidePos.x - z.root.position.x,
                w.insidePos.z - z.root.position.z,
              ),
              3,
              dt,
            );
        } else if (d < 0.25) {
          z.root.position.x = w.attackPos.x;
          z.root.position.z = w.attackPos.z;
          z.vel.set(0, 0, 0);
          this._setState(z, (w.planks ?? 0) > 0 ? "tearing" : "vaulting");
          if (z.state === "vaulting") this._startVault(z);
        }
        break;
      }
      case "tearing": {
        z.gspeed = damp(z.gspeed, 0, 10, dt);
        if (w.insidePos)
          this._faceTo(
            z,
            Math.atan2(
              w.insidePos.x - w.attackPos.x,
              w.insidePos.z - w.attackPos.z,
            ),
            5,
            dt,
          );
        z.tearT += dt;
        if (!z.tearHit && z.tearT >= TEAR_T * TEAR_HIT) {
          z.tearHit = true;
          let ok = false;
          try {
            ok = (w.planks ?? 0) > 0 && w.tearPlank && w.tearPlank();
          } catch (e) {
            ok = false;
          }
          if (ok) {
            this._snd("plank_tear", w.attackPos, { volume: 0.9 });
            z.vocal = 1;
          }
        }
        if (z.tearT >= TEAR_T) {
          z.tearT -= TEAR_T;
          z.tearHit = false;
          if ((w.planks ?? 0) <= 0) {
            this._setState(z, "vaulting");
            this._startVault(z);
          }
        }
        break;
      }
      case "vaulting": {
        const u = Math.min(1, z.stT / VAULT_T);
        const e = smooth(sstep(0.05, 0.95, u));
        z.root.position.x = lerp(z.vA.x, z.vI.x, e);
        z.root.position.z = lerp(z.vA.z, z.vI.z, e);
        z.gspeed = 0;
        if (u >= 1) {
          this._setState(z, "chase");
          z.repath = 0;
        }
        break;
      }
      case "chase": {
        const tgt = this._target(z, dt);
        if (!tgt) {
          this._wander(z, dt, spd);
          z.atkCd -= dt;
          break;
        }
        z.wanderC = null;
        z.wanderP = null;
        const p = z.root.position,
          pp = tgt.pos;
        z.lastTgt.set(pp.x, 0, pp.z);
        z.hasLast = true;
        const dist = Math.hypot(pp.x - p.x, pp.z - p.z);
        z.repath -= dt;
        if (z.repath <= 0) {
          z.repath = 0.4 + Math.random() * 0.2;
          let los = dist < 30;
          if (los && this.level && this.level.lineOfSight) {
            try {
              los = this.level.lineOfSight(
                this._chest(z, _v),
                _v3.set(pp.x, 1.2, pp.z),
              );
            } catch (e) {
              los = true;
            }
          }
          if (los) z.path = null;
          else if (this.level && this.level.nav && this.level.nav.findPath) {
            try {
              z.path =
                this.level.nav.findPath(
                  p.clone(),
                  _v3.set(pp.x, 0, pp.z).clone(),
                ) || [];
            } catch (e) {
              z.path = [];
            }
            z.pathI = 0;
          } else z.path = null;
        }
        let tx = pp.x,
          tz = pp.z,
          stop = 0.72;
        if (z.path) {
          while (
            z.pathI < z.path.length &&
            Math.hypot(z.path[z.pathI].x - p.x, z.path[z.pathI].z - p.z) <
              0.45 &&
            z.pathI < z.path.length - 1
          )
            z.pathI++;
          if (z.path.length === 0) {
            tx = p.x;
            tz = p.z;
            stop = 0.1;
          } else {
            const wp = z.path[z.pathI];
            tx = wp.x;
            tz = wp.z;
            if (z.pathI < z.path.length - 1) stop = 0.0;
          }
        }
        this._moveToward(z, tx, tz, spd, dt, stop, true);
        if (dist < 2.2)
          this._faceTo(z, Math.atan2(pp.x - p.x, pp.z - p.z), 5, dt);
        z.atkCd -= dt;
        if (dist < (z.crawler ? 0.95 : 1.1) && z.atkCd <= 0)
          this._setState(z, "attack");
        break;
      }
      case "attack": {
        const p = z.root.position;
        const tgt = this._valid.find((q) => keyOf(q) === z.tgtKey) || null;
        z.gspeed = damp(z.gspeed, 0, 10, dt);
        z.vel.multiplyScalar(0.85);
        if (tgt)
          this._faceTo(z, Math.atan2(tgt.pos.x - p.x, tgt.pos.z - p.z), 6, dt);
        z.atkT += dt;
        this._attackSound(z);
        if (!z.atkHit && z.atkT >= ATK_T * ATK_HIT) {
          z.atkHit = true;
          // victim: nearest valid player within reach, roughly in front (the target usually)
          let victim = null,
            best = 1.6;
          const fx = Math.sin(z.yaw),
            fz = Math.cos(z.yaw);
          for (const q of this._valid) {
            const dx = q.pos.x - p.x,
              dz = q.pos.z - p.z,
              d = Math.hypot(dx, dz);
            if (d < best && (d < 0.5 || (dx * fx + dz * fz) / d > 0.2)) {
              best = d;
              victim = q;
            }
          }
          if (victim) {
            try {
              this.onAttack && this.onAttack(ATK_DMG, victim.id, z);
            } catch (e) {
              /* ignore */
            }
          }
        }
        if (z.atkT >= ATK_T) {
          z.atkCd = 0.15;
          this._setState(z, "chase");
        }
        break;
      }
    }
  }

  _attackSound(z) {
    if (!z.atkSnd && z.atkT > 0.15) {
      z.atkSnd = true;
      this._snd("zombie_attack", z.root.position, { volume: 0.9 });
      z.vocal = 1;
    }
  }

  // nearest reachable alive & !downed player, sticky for ~1.5 s
  _target(z, dt) {
    z.tgtT -= dt;
    const valid = this._valid;
    let cur =
      z.tgtKey != null
        ? valid.find((q) => keyOf(q) === z.tgtKey) || null
        : null;
    if (cur && z.tgtT > 0) return cur;
    let best = null,
      bestC = Infinity,
      curC = Infinity;
    for (const q of valid) {
      const c = this._reachCost(z, q);
      if (c == null) continue;
      if (q === cur) curC = c;
      if (c < bestC) {
        bestC = c;
        best = q;
      }
    }
    if (cur && curC <= bestC * 1.25 + 0.75) best = cur; // hysteresis: don't flip-flop
    z.tgtT = 1.5 + Math.random() * 0.4;
    const k = best ? keyOf(best) : null;
    if (k !== z.tgtKey) {
      z.tgtKey = k;
      z.repath = 0;
    }
    return best;
  }
  _reachCost(z, q) {
    const p = z.root.position,
      d = Math.hypot(q.pos.x - p.x, q.pos.z - p.z);
    const L = this.level;
    if (d < 25 && L && L.lineOfSight) {
      let los = true;
      try {
        los = L.lineOfSight(this._chest(z, _v), _v3.set(q.pos.x, 1.2, q.pos.z));
      } catch (e) {
        los = true;
      }
      if (los) return d;
    } else if (!L || !L.lineOfSight) return d;
    if (!L || !L.nav || !L.nav.findPath) return d;
    let path;
    try {
      path = L.nav.findPath(p.clone(), new V3(q.pos.x, 0, q.pos.z));
    } catch (e) {
      return d;
    }
    if (!path || !path.length) return null; // unreachable (closed doors)
    let len = 0,
      px = p.x,
      pz = p.z;
    for (const w of path) {
      len += Math.hypot(w.x - px, w.z - pz);
      px = w.x;
      pz = w.z;
    }
    return len;
  }
  // no valid target (everyone downed / menu): shamble around near the last target area, staring
  _wander(z, dt, spd) {
    const p = z.root.position;
    let near = null,
      nd = Infinity;
    for (const q of this._players) {
      const d = Math.hypot(q.pos.x - p.x, q.pos.z - p.z);
      if (d < nd) {
        nd = d;
        near = q;
      }
    }
    if (!z.wanderC) {
      z.wanderC = new V3().copy(z.hasLast ? z.lastTgt : near ? near.pos : p);
      z.wanderC.y = 0;
      z.wanderP = null;
      z.wanderT = 0;
      z.pauseT = 0.3 + Math.random();
    }
    z.wanderT -= dt;
    if (!z.wanderP || z.wanderT <= 0) {
      z.wanderT = 4 + Math.random() * 4;
      z.stuckT = 0;
      let pick = null;
      for (let k = 0; k < 8 && !pick; k++) {
        const a = Math.random() * TAU,
          r = 1.5 + Math.random() * 2.5;
        const c = new V3(
          z.wanderC.x + Math.cos(a) * r,
          0,
          z.wanderC.z + Math.sin(a) * r,
        );
        if (this.level && this.level.resolveCircle) {
          try {
            this.level.resolveCircle(c, 0.3, 1.8);
          } catch (e) {
            /* ignore */
          }
        }
        if (
          this._players.every(
            (q) => Math.hypot(q.pos.x - c.x, q.pos.z - c.z) > 2.6,
          )
        )
          pick = c;
      }
      z.wanderP = pick || p.clone();
    }
    const d = Math.hypot(z.wanderP.x - p.x, z.wanderP.z - p.z);
    if (z.pauseT > 0 || d < 0.4) {
      if (d < 0.4 && z.pauseT <= 0) {
        z.pauseT = 1.5 + Math.random() * 3;
        z.wanderT = z.pauseT + 0.1;
      }
      z.pauseT -= dt;
      this._moveToward(z, p.x, p.z, 0, dt, 1, true);
      if (near)
        this._faceTo(
          z,
          Math.atan2(near.pos.x - p.x, near.pos.z - p.z),
          1.6,
          dt,
        ); // menacing stare
      if (z.pauseT <= 0) z.wanderT = 0;
      return;
    }
    this._moveToward(
      z,
      z.wanderP.x,
      z.wanderP.z,
      Math.min(spd, 1.25) * 0.85,
      dt,
      0.3,
      true,
    );
    z.stuckT = z.gspeed < 0.12 ? z.stuckT + dt : 0;
    if (z.stuckT > 1.5) z.wanderT = 0;
  }

  _startVault(z) {
    this._release(z);
    const w = z.win;
    z.vA = (w.attackPos || z.root.position).clone();
    z.vI = (w.insidePos || z.root.position).clone();
    z.yaw = Math.atan2(z.vI.x - z.vA.x, z.vI.z - z.vA.z);
    z.root.rotation.y = z.yaw;
  }
  _debugDrive(z, dt) {
    const m = z.debugMode || "walk";
    const enter = (st) => {
      if (z.state !== st) {
        const k = [z.tearT, z.atkT, z.stT];
        this._setState(z, st, true);
        [z.tearT, z.atkT, z.stT] = k;
      }
    };
    if (GAIT[m]) {
      z.gait = m;
      z.speed = GAIT[m].speed;
      z.gspeed = z.speed;
      enter("chase");
    } else if (m === "idle") {
      z.gspeed = 0;
    } else if (m === "crawl") {
      z.gspeed = 0.55;
    } else if (m === "tear") {
      enter("tearing");
      z.tearT = (z.tearT + dt) % TEAR_T;
    } else if (m === "attack") {
      enter("attack");
      z.atkT = (z.atkT + dt) % ATK_T;
    } else if (m === "vault") {
      enter("vaulting");
      z.stT %= VAULT_T;
    } else if (m === "rise") {
      enter("rise");
      z.stT = Math.min(z.stT, RISE_T);
    }
  }

  // ------------------------------------------------------------------ audio
  _audio(z, dt) {
    z.vocal = Math.max(0, z.vocal - dt * 1.6);
    z.groanT -= dt;
    if (z.groanT <= 0) {
      z.groanT = 2.5 + Math.random() * 6;
      if (this._groanTok >= 1) {
        this._groanTok -= 1;
        const fast = z.gait !== "walk";
        const name = fast
          ? Math.random() < 0.18
            ? "zombie_scream"
            : "zombie_growl"
          : "zombie_groan";
        this._snd(name, z.root.position, {
          volume: fast ? 0.85 : 0.75,
          pitch: 0.82 + Math.random() * 0.3,
        });
        z.vocal = 1;
      }
    }
    // footfalls for runners / sprinters
    if (
      (z.gait === "sprint" || z.gait === "run") &&
      z.gspeed > 1 &&
      z.state === "chase" &&
      !z.crawler
    ) {
      const a = z.prevPhase,
        b = z.phase;
      const crossed = b < a || (a < 0.5 && b >= 0.5);
      if (crossed && this._stepTok >= 1) {
        this._stepTok -= 1;
        this._snd("zombie_footstep", z.root.position, {
          volume: z.gait === "sprint" ? 0.55 : 0.35,
        });
      }
    }
  }

  // ------------------------------------------------------------------ animation
  _animate(z, dt) {
    const P = this._P;
    P.fill(0);
    const g = GAIT[z.gait] || GAIT.walk;
    z.prevPhase = z.phase;
    const cyc = z.crawler ? 1.3 : g.cycle;
    const nominal = z.crawler ? 0.55 : z.speed;
    if (z.gspeed > 0.02)
      z.phase = (z.phase + ((z.gspeed / nominal) * dt) / cyc) % 1;
    if (z.crawler) this._poseCrawl(z, P, dt);
    else
      switch (z.state) {
        case "rise":
          sampleKeys(RISE_KEYS, Math.min(1, z.stT / RISE_T), P);
          this._riseExtras(z, P);
          break;
        case "tearing":
          sampleKeys(TEAR_KEYS, (z.tearT % TEAR_T) / TEAR_T, P);
          this._plantFeet(z, P, 0.16, -0.2);
          this._headNoise(z, P, 0.5);
          break;
        case "attack":
          sampleKeys(ATK_KEYS, Math.min(1, z.atkT / ATK_T), P);
          this._plantFeet(z, P, 0.2, -0.18);
          break;
        case "vaulting":
          sampleKeys(VAULT_KEYS, Math.min(1, z.stT / VAULT_T), P);
          break;
        default:
          this._poseLoco(z, P, g);
          break;
      }
    P[BI.jaw * 3] += z.jawBase + z.vocal * 0.45;
    // crossfade from previous state
    if (z.blend < 1) {
      z.blend = Math.min(1, z.blend + dt / z.blendDur);
      const t = smooth(z.blend),
        F = z.Pfrom;
      for (let i = 0; i < PL; i++) P[i] = F[i] + (P[i] - F[i]) * t;
    }
    // additive flinch springs
    const fl = z.fl,
      fv = z.flv;
    for (let i = 0; i < 5; i++) {
      fv[i] += (-95 * fl[i] - 12 * fv[i]) * dt;
      fl[i] += fv[i] * dt;
    }
    P[BI.neck * 3] += fl[0] * 0.45;
    P[BI.head * 3] += fl[0];
    P[BI.spine * 3] += fl[1] * 0.5;
    P[BI.chest * 3] += fl[1] * 0.7;
    P[BI.spine * 3 + 1] += fl[2] * 0.4;
    P[BI.chest * 3 + 1] += fl[2] * 0.7;
    P[BI.head * 3 + 2] += fl[2] * 0.4;
    P[BI.uaL * 3] += fl[3];
    P[BI.uaR * 3] += fl[4];
    z.P.set(P);
    this._apply(z, P);
  }

  _apply(z, P) {
    const b = z.bones;
    for (let i = 0; i < NB; i++)
      b[i].rotation.set(P[i * 3], P[i * 3 + 1], P[i * 3 + 2]);
    b[0].position.set(
      HIPS_REST.x + P[H0],
      HIPS_REST.y + P[H0 + 1],
      HIPS_REST.z + P[H0 + 2],
    );
    if (!z.dead) {
      // body pitch about the hip point, plus vertical body offset (rise / vault / crawl)
      _q.setFromAxisAngle(AX, P[BP]);
      z.rig.quaternion.copy(_q);
      _v.copy(HIPS_REST).applyQuaternion(_q);
      z.rig.position.set(
        HIPS_REST.x - _v.x,
        HIPS_REST.y - _v.y + P[BY],
        HIPS_REST.z - _v.z,
      );
    }
  }

  _headNoise(z, P, amt) {
    const t = z.t,
      s = z.seed;
    P[BI.head * 3 + 2] += (z.headTilt + 0.22 * Math.sin(t * 0.8 + s)) * amt;
    P[BI.head * 3] += 0.08 * Math.sin(t * 1.3 + s * 2) * amt;
    P[BI.head * 3 + 1] += 0.15 * Math.sin(t * 0.55 + s * 3) * amt;
  }
  _plantFeet(z, P, fz, bz) {
    legIK(P, 1, 0.115, ANKLE, fz, 0);
    legIK(P, -1, -0.12, ANKLE, bz, 0);
  }
  _riseExtras(z, P) {
    const u = z.stT / RISE_T,
      t = z.t;
    const claw = 1 - sstep(0.3, 0.5, u);
    P[BI.uaL * 3] += 0.35 * Math.sin(t * 8) * claw;
    P[BI.uaR * 3] += 0.35 * Math.sin(t * 8 + Math.PI) * claw;
    P[BI.faL * 3] += -0.3 * (0.5 + 0.5 * Math.sin(t * 8 + 1)) * claw;
    P[BI.faR * 3] += -0.3 * (0.5 + 0.5 * Math.sin(t * 8 + 4)) * claw;
    if (u > 0.85) this._plantFeet(z, P, 0.05, -0.06);
  }

  _poseLoco(z, P, g) {
    const t = z.t,
      s0 = z.seed,
      φ = z.phase;
    const move = clamp(z.gspeed / 0.35, 0, 1);
    const Pi = this._P2;
    Pi.fill(0);
    // ---- idle pose (swaying, arms half raised, breathing)
    Pi[H0 + 1] = -0.045 + 0.01 * Math.sin(t * 1.1 + s0);
    setB(
      Pi,
      BI.hips,
      0,
      0.04 * Math.sin(t * 0.5 + s0),
      0.03 * Math.sin(t * 0.7 + s0),
    );
    setB(
      Pi,
      BI.spine,
      0.18,
      0.05 * Math.sin(t * 0.45),
      -0.02 * Math.sin(t * 0.7 + s0),
    );
    setB(
      Pi,
      BI.chest,
      0.17 + 0.035 * Math.sin(t * 1.7),
      0.08 * Math.sin(t * 0.5 + 1),
    );
    setB(Pi, BI.neck, 0.3);
    setB(Pi, BI.head, -0.55);
    for (const s of [1, -1]) {
      const drop = z.armDrop === s || z.missingS === s;
      if (drop)
        arm(
          Pi,
          s,
          0.05 + 0.04 * Math.sin(t * 0.9 + s),
          0,
          0.06,
          -0.2,
          0,
          0,
          0.2,
          0,
          0,
        );
      else
        arm(
          Pi,
          s,
          -1.0 -
            z.armH * 0.35 * (s > 0 ? 1 : 0.6) +
            0.08 * Math.sin(t * 1.2 + s),
          0,
          -0.12,
          -0.4,
          0,
          0,
          0.55,
          -1.25,
          0,
        );
    }
    this._headNoise(z, Pi, 1.25);
    legIK(Pi, 1, 0.11, ANKLE, 0.07 + 0.03 * Math.sin(s0), 0);
    legIK(Pi, -1, -0.115, ANKLE, -0.06, 0);
    if (move < 0.01) {
      P.set(Pi);
      return;
    }

    // ---- moving
    const gait = z.gait,
      E = (g.speed * g.cycle * g.stance * (z.speed / g.speed)) / z.scale,
      S = g.stance;
    const sinP = Math.sin(φ * TAU),
      cosP = Math.cos(φ * TAU);
    let hy = -g.drop - g.bob * (0.5 - 0.5 * Math.cos(φ * TAU * 2));
    let hipRoll = 0,
      lurch = 0;
    const limp = gait === "walk" ? z.limp : 0;
    const legs = [];
    for (const s of [1, -1]) {
      const ph = (φ + (s > 0 ? 0 : 0.5)) % 1,
        bad = s === limp;
      let fz, fy, pitch;
      if (ph < S) {
        const tt = ph / S;
        fz = 0.02 + E / 2 - E * tt;
        fy = 0;
        pitch = 0;
        if (gait !== "walk" && tt > 0.7)
          ((pitch = -0.5 * sstep(0.7, 1, tt)), (fy = 0.03 * sstep(0.7, 1, tt)));
        if (bad) {
          hy -= 0.035 * Math.sin(Math.PI * tt);
          hipRoll += 0.07 * s * Math.sin(Math.PI * tt);
          lurch += 0.08 * s * Math.sin(Math.PI * tt);
        }
      } else {
        const tt = (ph - S) / (1 - S),
          e = smooth(tt);
        fz = 0.02 - E / 2 + E * e;
        const lift = g.lift * (bad ? 0.3 : 1);
        fy = lift * Math.sin(Math.PI * tt);
        pitch = bad
          ? 0.45 * Math.sin(Math.PI * tt) + 0.2
          : (gait === "walk" ? -0.2 : -0.5) * Math.sin(Math.PI * tt) +
            (gait === "walk" ? 0 : 0.35 * (1 - tt));
      }
      legs.push([s, fz, fy, pitch]);
    }
    P[H0 + 1] = hy;
    P[H0 + 2] = gait === "sprint" ? -0.04 : 0;
    const lean = g.lean;
    setB(P, BI.hips, gait === "sprint" ? 0.14 : 0.04, 0.13 * sinP, hipRoll);
    setB(
      P,
      BI.spine,
      lean * 0.45 + 0.03 * Math.sin(φ * TAU * 2),
      0.08 * sinP,
      -lurch + 0.04 * sinP,
    );
    setB(P, BI.chest, lean * 0.4, -0.2 * sinP, -lurch * 0.5);
    for (const [s, fz, fy, pitch] of legs)
      legIK(P, s, 0.1 * s, ANKLE + fy, fz, pitch);
    if (gait === "walk") {
      setB(P, BI.neck, 0.3);
      setB(P, BI.head, -0.42);
      this._headNoise(z, P, 1);
      for (const s of [1, -1]) {
        const drop = z.armDrop === s || z.missingS === s;
        if (drop)
          arm(
            P,
            s,
            0.08 + 0.25 * Math.sin(φ * TAU + (s > 0 ? Math.PI : 0)),
            0,
            0.06,
            -0.25,
            0,
            0,
            0.2,
            0,
            0,
          );
        else
          arm(
            P,
            s,
            -1.2 -
              z.armH * 0.3 * (s > 0 ? 1 : 0.5) +
              0.1 * Math.sin(φ * TAU + (s > 0 ? 1 : 2.5)),
            0,
            -0.12 + 0.05 * sinP * s,
            -0.3,
            0,
            0,
            0.6,
            -1.3,
            0,
          );
      }
    } else if (gait === "run") {
      setB(P, BI.neck, 0.15);
      setB(P, BI.head, -0.4);
      this._headNoise(z, P, 0.5);
      for (const s of [1, -1]) {
        const drop = z.missingS === s;
        if (drop)
          arm(P, s, 0.2 * Math.sin(φ * TAU), 0, 0.1, -0.3, 0, 0, 0.2, 0, 0);
        else
          arm(
            P,
            s,
            -1.45 + 0.24 * Math.sin(φ * TAU + (s > 0 ? 0 : Math.PI)),
            0,
            -0.1,
            -0.35,
            0,
            0,
            0.4,
            -1.3,
            0,
          );
      }
    } else {
      setB(P, BI.neck, -0.05);
      setB(P, BI.head, -0.38, 0, 0.05 * sinP);
      for (const s of [1, -1]) {
        const sw = Math.cos(TAU * (φ - (s > 0 ? 0.5 : 0)));
        arm(
          P,
          s,
          -0.35 - 0.85 * sw,
          0,
          0.14,
          -1.45 + 0.2 * sw,
          0,
          0,
          0.3,
          -0.4,
          0,
        );
      }
      P[BI.jaw * 3] += 0.35 + 0.1 * Math.sin(t * 7);
    }
    if (move < 1) {
      const k = move;
      for (let i = 0; i < PL; i++) P[i] = Pi[i] + (P[i] - Pi[i]) * k;
    }
  }

  _poseCrawl(z, P, dt) {
    const φ = z.phase,
      t = z.t;
    P[BY] = -0.77;
    P[BP] = 1.33;
    setB(P, BI.spine, -0.12, 0, 0.1 * Math.sin(φ * TAU));
    setB(P, BI.chest, -0.18, 0.1 * Math.sin(φ * TAU));
    setB(P, BI.neck, -0.55);
    setB(P, BI.head, -0.55, 0.2 * Math.sin(t * 0.7), 0.2 * Math.sin(t * 0.9));
    P[BI.jaw * 3] = 0.45;
    const atk =
      z.state === "attack"
        ? Math.sin(Math.PI * Math.min(1, z.atkT / ATK_T))
        : 0;
    for (const s of [1, -1]) {
      if (z.missingS === s) {
        arm(P, s, -0.3, 0, 0.3, -0.3, 0, 0, 0.2, 0, 0);
        continue;
      }
      const c = 0.5 + 0.5 * Math.sin(TAU * (φ + (s > 0 ? 0 : 0.5)));
      arm(
        P,
        s,
        -2.75 + 1.1 * c - atk * 0.4,
        0,
        -0.25 + 0.15 * c,
        -0.25 - 0.95 * c,
        0,
        0,
        0.8 * c,
        -1.3,
        0,
      );
    }
  }

  // ------------------------------------------------------------------ hits
  _flinch(z, part, dir, k) {
    k = clamp(k, 0.35, 1.3);
    const c = Math.cos(z.yaw),
      s = Math.sin(z.yaw);
    const lx = dir.x * c - dir.z * s,
      lz = dir.x * s + dir.z * c; // hit direction in zombie space
    const back = lz < 0 ? 1 : -0.6; // shot from the front pushes back
    if (part === "head") {
      z.flv[0] += -9 * k * back;
      z.flv[2] += lx * 5 * k;
    } else if (part === "limb") {
      z.flv[3] += (Math.random() < 0.5 ? 6 : 0) * k;
      z.flv[4] += (Math.random() < 0.5 ? 6 : 0) * k;
      z.flv[2] += lx * 3 * k;
    } else {
      z.flv[1] += -5 * k * back;
      z.flv[2] += (lx * 7 + (Math.random() - 0.5) * 3) * k;
      z.flv[0] += -2.5 * k * back;
    }
    z.slow = Math.max(z.slow, 0.18 * k);
  }

  _makeCrawler(z, quiet = false) {
    if (z.crawler) return;
    z.crawler = true;
    z.bones[BI.thL].scale.setScalar(0.001);
    z.bones[BI.thR].scale.setScalar(0.001);
    for (const h of z.hb) if (h.userData.bone >= 12) h.userData.off = true;
    this._hbDirty = true;
    z.Pfrom.set(z.P);
    z.blend = 0;
    z.blendDur = 0.45;
    if (z.state !== "chase") {
      this._release(z);
      z.state = "chase";
      z.stT = 0;
    }
    if (quiet) return;
    this._fx("blood", z.root.position.clone().setY(0.8), new V3(0, -1, 0), 2);
    this._fx(
      "blood",
      z.root.position.clone().setY(0.5),
      new V3(0.3, 0.6, 0.2).normalize(),
      2,
    );
  }

  _kill(z, { headshot, dir, info = {}, part, point }) {
    if (z.dead) return null;
    const prev = z.state;
    z.dead = true;
    z.alive = false;
    z.state = "dead";
    this._deadIds.add(z.id);
    if (this._deadIds.size > 600)
      this._deadIds.delete(this._deadIds.values().next().value);
    this._release(z);
    this._hbDirty = true;
    // deathVariant: forced (net / caller) or chosen here; encodes kind + blast strength + seed
    let dv = info.deathVariant;
    if (dv == null) {
      const kindName = this._pickDeath(z, prev, headshot, dir, info);
      const fq = Math.round(clamp(info.blast ?? 0.8, 0, 1) * 15);
      dv =
        DEATHS.indexOf(kindName) + 8 * fq + 128 * ((Math.random() * 8191) | 0);
    }
    dv = dv | 0;
    z.deathVariant = dv;
    z.deathDir = dir ? dir.clone() : new V3(0, 0, -1);
    z.deathPoint = point
      ? point.isVector3
        ? point.clone()
        : toV3(point, null)
      : null;
    z.deathHeadshot = !!headshot;
    if (!info.remote) {
      try {
        this.onKill &&
          this.onKill(z, {
            headshot,
            info,
            deathVariant: dv,
            dir: z.deathDir,
            point: z.deathPoint,
          });
      } catch (e) {
        /* ignore */
      }
    }
    const p = z.root.position;
    if (this._deathTok >= 1) {
      this._deathTok -= 1;
      this._snd("zombie_death", p, { volume: 0.85 });
    }
    const kind = DEATHS[dv & 7] || "back";
    this._startDeath(z, kind, dir, {
      ...info,
      _hs: headshot || kind === "headshot",
      blast: ((dv >> 3) & 15) / 15,
      dseed: dv >> 7,
    });
    return dv;
  }

  _pickDeath(z, prev, headshot, dir, info) {
    let kind;
    if (info.nuke) kind = "nuke";
    else if (info.explosive) kind = "blast";
    else if (z.crawler) kind = "crawl";
    else if (headshot) kind = "headshot";
    else {
      const c = Math.cos(z.yaw),
        s = Math.sin(z.yaw),
        lz = dir.x * s + dir.z * c;
      const r = Math.random();
      kind =
        lz > 0.3
          ? r < 0.75
            ? "forward"
            : "spin"
          : r < 0.45
            ? "back"
            : r < 0.75
              ? "forward"
              : "spin";
      if (info.melee) kind = r < 0.5 ? "back" : "spin";
    }
    if (info.forceDeath && DEATHS.includes(info.forceDeath))
      kind = info.forceDeath;
    if (prev === "rise" && kind !== "blast" && kind !== "nuke") kind = "freeze";
    return kind;
  }

  _startDeath(z, kind, dir, info) {
    const D = (z.D = {
      kind,
      t: 0,
      ang: 0,
      av: 0,
      landed: false,
      pre: 0,
      pivot: new V3(),
      axis: AX,
      sign: 1,
      lift: 0.12,
      spin: 0,
      spinT: 0,
      fall: FALL.back,
      lie: LIE.up,
      targ: new Float32Array(PL),
      vel: new Float32Array(PL),
      cur: new Float32Array(PL),
      q: new THREE.Quaternion(),
      c: new V3(0, 1.0, 0),
      cv: new V3(),
      w: new V3(),
      bounces: 0,
      settleT: -1,
      qFrom: new THREE.Quaternion(),
      qTo: new THREE.Quaternion(),
      faceDown: false,
    });
    D.cur.set(z.P);
    const DR = (D.rng = rng(((info.dseed ?? 0) + 1) * 40503 + z.id * 7));
    // current rig transform as the start (rise/vault/crawl offsets)
    D.q.copy(z.rig.quaternion);
    const c = Math.cos(z.yaw),
      s = Math.sin(z.yaw);
    const lx = dir.x * c - dir.z * s,
      lz = dir.x * s + dir.z * c;
    const side = DR() < 0.5 ? 1 : -1;
    switch (kind) {
      case "forward":
        D.pivot.set(0, 0.05, 0.1);
        D.sign = 1;
        D.pre = 0.32;
        D.av = 0.5;
        D.fall = FALL.forward;
        D.lie = LIE.down;
        D.lift = 0.1;
        break;
      case "back":
        D.pivot.set(0, 0.02, -0.08);
        D.sign = -1;
        D.pre = 0.14;
        D.av = 0.75;
        D.fall = FALL.back;
        D.lie = LIE.up;
        D.lift = 0.12;
        break;
      case "spin":
        D.pivot.set(0.1 * side, 0, 0);
        D.axis = AZ;
        D.sign = side;
        D.pre = 0.42;
        D.av = 0.4;
        D.spin = 1.9 * side;
        D.fall = FALL.spin;
        D.lie = LIE.side;
        D.lift = 0.17;
        break;
      case "headshot":
        D.pivot.set(0, 0.02, -0.08);
        D.sign = -1;
        D.pre = 0.05;
        D.av = 1.25;
        D.fall = FALL.limp;
        D.lie = LIE.up;
        D.lift = 0.12;
        this._decap(z, dir);
        break;
      case "freeze":
        D.pre = 0;
        D.fall = z.P.slice();
        D.lie = D.fall;
        D.static = true;
        if (info._hs) this._decap(z, dir);
        break;
      case "crawl":
        D.pivot.set(0, 0, 0);
        D.pre = 0;
        D.fall = kp({
          by: -0.8,
          bp: 1.45,
          ua: [-2.6, 0, 0.4],
          fa: [-0.3],
          neck: [0.2],
          head: [0.3, 0.8],
        });
        D.lie = D.fall;
        D.static = true;
        break;
      default: {
        // blast / nuke: ballistic body
        const nuke = kind === "nuke";
        const f = info.blast ?? 0.8;
        const v = nuke ? 1.2 + DR() * 1.2 : 3 + 5 * f;
        D.cv.set(lx * v, nuke ? 2 + DR() * 1.5 : 3 + 4 * f, lz * v);
        D.w.set(-lz, 0, lx);
        if (D.w.lengthSq() < 1e-6) D.w.set(1, 0, 0);
        D.w.normalize().multiplyScalar((nuke ? 3 : 6) + DR() * 4);
        D.w.x += (DR() - 0.5) * 3;
        D.w.y += (DR() - 0.5) * 4;
        D.c.set(0, 1.0, 0);
        D.fall = FALL.blast;
        D.ballistic = true;
        if (nuke) this._burn(z);
        else {
          this._fx(
            "blood",
            z.root.position.clone().setY(1.0),
            dir.clone(),
            2.5,
          );
          if (DR() < 0.5 && z.helmet) this._popHelmet(z, dir, 5);
        }
      }
    }
    D.targ.set(D.fall);
    // keep ongoing root offsets (hips) from the current pose where fall pose leaves them 0
    if (!D.ballistic && !D.static) {
      D.targ[BY] = 0;
      D.targ[BP] = 0;
    }
    z.eyesOffAt = 1.2 + DR();
  }

  _decap(z, dir) {
    const head = z.bones[BI.head];
    head.updateWorldMatrix(true, false);
    const hp = new V3(0, 0.09, 0.015).applyMatrix4(head.matrixWorld);
    head.scale.setScalar(0.001);
    head.position.y -= 0.06;
    this._fx("gib", hp.clone(), dir.clone(), "head");
    this._fx("blood", hp.clone(), dir.clone(), 2.2);
    if (z.helmet) this._popHelmet(z, dir, 4.5);
    z.fountain = 1.4;
    z.fountT = 0;
    z.headless = true;
    this._snd("headshot", hp, { volume: 0.6 });
  }

  _popHelmet(z, dir, v) {
    const h = z.helmet;
    if (!h) return;
    h.updateWorldMatrix(true, false);
    this.scene.attach(h);
    h.scale.setScalar(z.scale);
    const R = (z.D && z.D.rng) || Math.random;
    const vel = new V3(
      dir.x * v * 0.6 + (R() - 0.5),
      2.5 + R() * 2,
      dir.z * v * 0.6 + (R() - 0.5),
    );
    const w = new V3((R() - 0.5) * 16, (R() - 0.5) * 10, (R() - 0.5) * 16);
    this._props.push({ mesh: h, vel, w, owner: z, rest: false });
    z.helmet = null;
    for (const hb of z.hb)
      if (hb.userData.part === "head") {
        hb.scale.set(0.19, 0.25, 0.235);
        hb.position.set(0, 0.085, 0.018);
      }
  }

  _burn(z) {
    const B = this._mats.burnt;
    for (const k in z.meshes) if (B[k]) z.meshes[k].material = B[k];
    if (z.helmet) z.helmet.material = B.helmet;
    z.burnt = true;
  }

  _propsUpdate(dt) {
    for (const p of this._props) {
      if (p.rest) continue;
      const m = p.mesh;
      p.vel.y -= 9.8 * dt;
      m.position.addScaledVector(p.vel, dt);
      _q.setFromEuler(_e.set(p.w.x * dt, p.w.y * dt, p.w.z * dt));
      m.quaternion.premultiply(_q);
      if (this.level && this.level.resolveCircle) {
        try {
          this.level.resolveCircle(m.position, 0.12, 0.3);
        } catch (e) {
          /* ignore */
        }
      }
      if (m.position.y < 0.07) {
        m.position.y = 0.07;
        if (p.vel.y < -1.2) {
          p.vel.y *= -0.35;
          p.vel.x *= 0.6;
          p.vel.z *= 0.6;
          p.w.multiplyScalar(0.5);
          this._snd("bullet_metal", m.position, { volume: 0.3 });
        } else {
          p.vel.set(0, 0, 0);
          p.rest = true;
        }
      }
    }
  }

  _deathUpdate(z, dt) {
    const D = z.D;
    D.t += dt;
    const P = D.cur,
      V = D.vel,
      T = D.targ;
    // neck fountain
    if (z.fountain > 0) {
      z.fountain -= dt;
      z.fountT -= dt;
      if (z.fountT <= 0) {
        z.fountT = 0.08;
        const nb = z.bones[BI.neck];
        nb.updateWorldMatrix(true, false);
        const np = new V3(0, 0.1, 0).applyMatrix4(nb.matrixWorld),
          up = new V3(0, 1, 0).transformDirection(nb.matrixWorld);
        up.x += (Math.random() - 0.5) * 0.4;
        up.z += (Math.random() - 0.5) * 0.4;
        this._fx("blood", np, up.normalize(), 0.5 + z.fountain * 0.5);
      }
    }
    if (z.eyesOffAt != null && D.t > z.eyesOffAt && z.meshes.eyes)
      z.meshes.eyes.visible = false;
    let landedNow = false;
    if (D.ballistic) {
      if (D.settleT < 0) {
        D.cv.y -= 9.8 * dt;
        D.c.addScaledVector(D.cv, dt);
        _v.copy(D.w).multiplyScalar(dt);
        const a = _v.length();
        if (a > 1e-6) {
          _q.setFromAxisAngle(_v.normalize(), a);
          D.q.premultiply(_q);
        }
        // walls: resolve in world space
        if (this.level && this.level.resolveCircle) {
          _v2.copy(D.c);
          z.root.localToWorld(_v2);
          const bx = _v2.x,
            bz = _v2.z;
          try {
            this.level.resolveCircle(_v2, 0.25, 1.8);
          } catch (e) {
            /* ignore */
          }
          if (_v2.x !== bx || _v2.z !== bz) {
            z.root.worldToLocal(_v2);
            D.c.x = _v2.x;
            D.c.z = _v2.z;
            D.cv.x *= -0.2;
            D.cv.z *= -0.2;
          }
        }
        const floor = 0.16 / z.scale;
        if (D.c.y < floor && D.cv.y < 0) {
          D.c.y = floor;
          landedNow = true;
          if (D.cv.y < -2.5 && D.bounces < 2) {
            D.cv.y *= -0.28;
            D.cv.x *= 0.5;
            D.cv.z *= 0.5;
            D.w.multiplyScalar(0.45);
            D.bounces++;
          } else {
            D.settleT = 0;
            D.qFrom.copy(D.q);
            const up = _v.set(0, 1, 0).applyQuaternion(D.q),
              fw = _v2.set(0, 0, 1).applyQuaternion(D.q);
            D.faceDown = fw.y < 0;
            const hdir = new V3(up.x, 0, up.z);
            if (hdir.lengthSq() < 1e-4) hdir.set(fw.x, 0, fw.z);
            if (hdir.lengthSq() < 1e-4) hdir.set(0, 0, 1);
            hdir.normalize();
            const Zb = new V3(0, D.faceDown ? -1 : 1, 0),
              Xb = new V3().crossVectors(hdir, Zb);
            D.qTo.setFromRotationMatrix(_m.makeBasis(Xb, hdir, Zb));
            D.lie = D.faceDown ? LIE.down : LIE.up;
            T.set(D.lie);
            D.landed = true;
          }
        }
      } else {
        D.settleT += dt;
        const k = smooth(D.settleT / 0.45);
        D.q.slerpQuaternions(D.qFrom, D.qTo, k);
        D.cv.multiplyScalar(Math.exp(-dt * 6));
        D.c.x += D.cv.x * dt;
        D.c.z += D.cv.z * dt;
        D.c.y = lerp(D.c.y, 0.14, k);
      }
      z.rig.quaternion.copy(D.q);
      _v.copy(D.c).sub(_v3.set(0, 1.0, 0).applyQuaternion(D.q));
      z.rig.position.copy(_v);
    } else if (!D.static) {
      if (D.t > D.pre) {
        if (D.spin && D.spinT < 1) D.spinT = Math.min(1, D.spinT + dt / 0.5);
        const target = Math.PI / 2;
        D.av += 8.5 * Math.sin(D.ang + 0.12) * dt;
        D.ang += D.av * dt;
        if (D.ang >= target) {
          D.ang = target;
          if (!D.landed) {
            D.landed = true;
            landedNow = true;
            T.set(D.lie);
            T[H0] = P[H0];
            T[H0 + 1] = P[H0 + 1];
            T[H0 + 2] = P[H0 + 2];
          }
          D.av = -D.av * 0.22;
          if (Math.abs(D.av) < 0.35) D.av = 0;
        }
      } else if (D.spin) D.spinT = Math.min(1, D.spinT + dt / 0.5);
      _q.setFromAxisAngle(AY, D.spin * smooth(D.spinT));
      _q2.setFromAxisAngle(D.axis, D.sign * D.ang * (D.axis === AZ ? -1 : 1));
      _q2.multiply(_q);
      z.rig.quaternion.copy(_q2);
      _v.copy(D.pivot).applyQuaternion(_q2);
      z.rig.position.set(
        D.pivot.x - _v.x,
        D.pivot.y - _v.y + D.lift * (D.ang / (Math.PI / 2)),
        D.pivot.z - _v.z,
      );
    } else {
      // crawler collapse: keep rig transform from the crawl pose
      _q.setFromAxisAngle(AX, P[BP]);
      z.rig.quaternion.copy(_q);
      _v.copy(HIPS_REST).applyQuaternion(_q);
      z.rig.position.set(
        HIPS_REST.x - _v.x,
        HIPS_REST.y - _v.y + P[BY],
        HIPS_REST.z - _v.z,
      );
    }
    if (landedNow && !D.thud) {
      D.thud = true;
      for (let i = 0; i < NB * 3; i++) V[i] += (D.rng() - 0.5) * 7;
      _v.set(0, 0.1, 0);
      z.root.localToWorld(_v);
    }
    // ragdoll-ish settle: damped springs toward the fall / lying targets
    for (let i = 0; i < PL; i++) {
      if (!D.static && (i === BY || i === BP)) continue;
      const k = SPRING_K[i] * (D.landed ? 1.2 : 1),
        c = 2 * Math.sqrt(k) * 0.45;
      V[i] += (k * (T[i] - P[i]) - c * V[i]) * dt;
      P[i] += V[i] * dt;
    }
    const b = z.bones;
    for (let i = 0; i < NB; i++)
      b[i].rotation.set(P[i * 3], P[i * 3 + 1], P[i * 3 + 2]);
    b[0].position.set(
      HIPS_REST.x + P[H0],
      HIPS_REST.y + P[H0 + 1],
      HIPS_REST.z + P[H0 + 2],
    );
    // linger, then sink into the floor
    if (D.t > 5.5) z.root.position.y -= dt * 0.22;
  }
}

