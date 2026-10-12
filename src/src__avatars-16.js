// src__avatars 16 — copy
// Lines 4363-6722 of readable/src__avatars.pretty.js (statement-aligned).
class Avatar {
  constructor(mgr, id, opts) {
    this.mgr = mgr;
    this.id = id;
    this.slot = (((opts.slot | 0) % 4) + 4) % 4;
    this.name = opts.name || "";
    this.C = CHARACTERS[this.slot];
    const D = (this.D = mgr._charData(this.slot));
    this.k = D.k;
    const rest = D.rest;
    this.root = new THREE.Group();
    this.root.name = "avatar_" + id;
    this.bones = BONES.map((n) => {
      const b = new THREE.Bone();
      b.name = n;
      return b;
    });
    for (let i = 0; i < NB; i++) {
      const b = this.bones[i],
        p = PARENT[i];
      if (p < 0) {
        this.root.add(b);
        b.position.copy(rest[i]);
      } else {
        this.bones[p].add(b);
        b.position.copy(rest[i]).sub(rest[p]);
      }
    }
    this.root.updateMatrixWorld(true);
    this.skeleton = new THREE.Skeleton(
      this.bones,
      rest.map((p) => new M4().makeTranslation(-p.x, -p.y, -p.z)),
    );
    this.meshes = [];
    for (const k of ["cloth", "leather", "skin", "metal"]) {
      if (!D.geos[k]) continue;
      const m = new THREE.SkinnedMesh(
        D.geos[k],
        k === "skin" ? mgr._skinMat(this.slot) : mgr.mats[k],
      );
      m.name = "avatar_" + k;
      m.castShadow = true;
      m.receiveShadow = true;
      m.bind(this.skeleton, new M4());
      m.boundingSphere = new THREE.Sphere(new V3(0, 0.9, 0), 1.7);
      m.boundingBox = new THREE.Box3(
        new V3(-1.4, -0.3, -1.4),
        new V3(1.4, 2.2, 1.4),
      );
      this.root.add(m);
      this.meshes.push(m);
    }
    // restLen
    this.L1 = rest[B.faL].distanceTo(rest[B.uaL]);
    this.L2 = rest[B.handL].distanceTo(rest[B.faL]);
    this.T1 = rest[B.shL].distanceTo(rest[B.thL]);
    this.T2 = rest[B.ftL].distanceTo(rest[B.shL]);
    this.ankleH = rest[B.ftL].y;
    this.ballOff = new V3().subVectors(rest[B.toeL], rest[B.ftL]); // ankle -> ball (bind)
    this.hipsRestY = rest[B.hips].y;
    // world-space pose buffers
    this.Wp = rest.map((p) => p.clone());
    this.Wq = rest.map(() => new Q4());
    this.off = rest.map((p, i) =>
      PARENT[i] < 0 ? p.clone() : p.clone().sub(rest[PARENT[i]]),
    );
    // state
    this.st = {
      pos: new V3(),
      yaw: 0,
      pitch: 0,
      vel: new V3(),
      grounded: true,
      crouching: false,
      sprinting: false,
      ads: false,
      reloading: false,
      downed: false,
      reviving: false,
      beingRevived: false,
      weaponId: "m1911",
      upgraded: false,
      alive: true,
    };
    this.stAge = 0;
    this.started = false;
    this.rpos = new V3();
    this.prev = new V3();
    this.vs = new V3();
    this.accel = new V3();
    this.aimYaw = 0;
    this.aimPitch = 0;
    this.bodyYaw = 0;
    this.turning = false;
    this.b = {
      crouch: 0,
      sprint: 0,
      ads: 0,
      downed: 0,
      kneel: 0,
      air: 0,
      move: 0,
      pistol: 1,
      beingRev: 0,
    };
    this.time = 0;
    this.visible = true;
    this.userVisible = true;
    // gait
    this.phase = 0.25;
    this.parked = true;
    this.settle = -1;
    this.crawlPh = 0;
    this.feet = [0, 1].map((i) => ({
      lock: new V3(),
      yaw: 0,
      swing: false,
      from: new V3(),
      fromYaw: 0,
      cur: new V3(),
      curYaw: 0,
      pitch: 0,
      lift: 0,
      land: 0,
    }));
    this.landDip = 0;
    this.landVel = 0;
    this.airT = 0;
    this.vy = 0;
    // recoil / flinch springs
    this.rec = { x: 0, v: 0 };
    this.flinch = { x: 0, v: 0, yaw: 0, roll: 0 };
    this.act = null;
    this.reload = null;
    this.cycle = null;
    this.P1 = new Pose();
    this.P2 = new Pose();
    // weapon
    this.gun = null;
    this.gunId = null;
    this.gunUp = false;
    this.swapT = 1;
    this.pendingGun = null;
    this.flash = mgr._makeFlash();
    this.flashT = 0;
    this.flashScale = 1;
    this.props = mgr._makeProps();
    this.root.add(this.props.root);
    this.mgr.scene.add(this.root);
    this.muzzleW = new V3();
    this.headW = new V3();
    this._tmp = Array.from({ length: 16 }, () => new V3());
    this._tq = Array.from({ length: 8 }, () => new Q4());
    this.footsteps = mgr.footsteps;
    this._fwd = new V3();
    this._left = new V3();
    this._fwd2 = new V3();
    this._left2 = new V3();
    this._fp = [new V3(), new V3()];
    this._fq = [new Q4(), new Q4()];
    this.gunP = new V3();
    this.gunQ = new Q4();
    this.gripW = [new V3(), new V3()];
    this.handQW = [new Q4(), new Q4()];
    for (let i = 0; i <= 10; i++) this["_ik" + i] = new V3();
    for (let i = 0; i <= 3; i++) this["_fk" + i] = new V3();
    this._pole = new V3();
    this._gq = new Q4();
    this._gp = new V3();
    this.handErr = [0, 0];
  }
  dispose() {
    this.root.removeFromParent();
    if (this.gun) this.gun.removeFromParent();
  }

  // ---------------------------------------------------------------- state input
  setState(s) {
    const S = this.st;
    if (s.pos) S.pos.copy(s.pos);
    if (s.vel) S.vel.set(s.vel.x || 0, 0, s.vel.z || 0);
    for (const k of ["yaw", "pitch"])
      if (typeof s[k] === "number" && isFinite(s[k])) S[k] = s[k];
    for (const k of [
      "grounded",
      "crouching",
      "sprinting",
      "ads",
      "reloading",
      "downed",
      "reviving",
      "beingRevived",
      "upgraded",
      "alive",
    ])
      if (s[k] !== undefined) S[k] = !!s[k];
    if (s.weaponId) S.weaponId = s.weaponId;
    this.stAge = 0;
    if (!this.started) {
      this.started = true;
      this.rpos.copy(S.pos);
      this.prev.copy(S.pos);
      this.aimYaw = this.bodyYaw = S.yaw + PI;
      this.aimPitch = S.pitch;
      this.b.downed = S.downed ? 1 : 0;
      this.b.crouch = S.crouching ? 1 : 0;
      this._resetFeet();
    }
    if (S.reloading && !this.reload) this._startReload(false);
  }
  _resetFeet() {
    for (let i = 0; i < 2; i++) {
      const f = this.feet[i];
      this._home(i, f.lock);
      f.cur.copy(f.lock);
      f.yaw = f.curYaw = f.fromYaw = this._homeYaw(i);
      f.swing = false;
    }
    this.parked = true;
  }
  event(type, data = {}) {
    const S = this.st;
    switch (type) {
      case "fire":
        this._fire(data);
        break;
      case "reload":
        this._startReload(!!data.empty, data.weaponId);
        break;
      case "knife":
        this.act = {
          type: "knife",
          t: 0,
          dur: 0.62,
          side: Math.random() < 0.5 ? 1 : -1,
        };
        break;
      case "grenade":
        this.act = { type: "grenade", t: 0, dur: 1.05 };
        break;
      case "swap":
        this.pendingGun = data.weaponId || S.weaponId;
        this.swapT = 0;
        if (data.weaponId) S.weaponId = data.weaponId;
        break;
      case "drink":
        this.act = { type: "drink", t: 0, dur: 2.3, color: data.color };
        this.props.setBottleColor(data.color);
        break;
      case "hurt":
        this.flinch.v += 9 + Math.random() * 4;
        this.flinch.yaw = (Math.random() - 0.5) * 0.5;
        this.flinch.roll = (Math.random() - 0.5) * 0.4;
        break;
      case "revived":
        this.act = { type: "revived", t: 0, dur: 1.0 };
        break;
      default:
        break;
    }
  }
  _fire(data) {
    const id = this.gunId || this.st.weaponId;
    const kick =
      {
        m1911: 1.0,
        aether: 0.8,
        kar98k: 1.5,
        trench: 1.8,
        mp40: 0.55,
        thompson: 0.6,
        stg44: 0.7,
        mg42: 0.65,
      }[id] || 1;
    this.rec.v += 26 * kick;
    this.flashT = 0.055 + (id === "mg42" || id === "trench" ? 0.015 : 0);
    this.flashScale =
      (id === "trench"
        ? 1.5
        : id === "mg42"
          ? 1.3
          : PISTOLS.has(id)
            ? 0.8
            : 1.1) *
      (0.85 + Math.random() * 0.3);
    this.flashRoll = Math.random() * TAU;
    this.flash.material =
      id === "aether" ? this.mgr._flashMatAether : this.mgr._flashMat;
    this.firedAt = this.time;
    this.mgr._pulseLight(this, id);
    if (id === "kar98k") this.cycle = { type: "bolt", t: -0.12, dur: 0.95 };
    if (id === "trench") this.cycle = { type: "pump", t: -0.1, dur: 0.6 };
  }
  _startReload(empty, wid) {
    const id = wid || this.gunId || this.st.weaponId;
    const d = RELOAD_DUR[id] || [2.2, 2.6];
    const cls = RELOAD_CLASS[id] || "mag";
    this.reload = {
      cls,
      id,
      t: 0,
      dur: empty ? d[1] : d[0],
      empty,
      loop: cls === "shell",
    };
    this.cycle = null;
  }

  // ---------------------------------------------------------------- helpers
  _home(i, out) {
    const b = this.b,
      s = i === 0 ? 1 : -1,
      ps = b.pistol;
    const yaw = this.bodyYaw;
    const w = lerp(0.115, 0.1, b.move) + 0.035 * b.crouch;
    // bladed stance: left foot forward, right foot back (rifle); squarer for pistols
    const st = (1 - b.move) * (1 - b.sprint);
    const f =
      s > 0
        ? lerp(0.085, 0.045, ps) * st + 0.07 * b.crouch * st
        : lerp(-0.075, -0.035, ps) * st - 0.08 * b.crouch * st;
    const F = fwdOf(yaw, this._hf || (this._hf = new V3())),
      L = leftOf(yaw, this._hl || (this._hl = new V3()));
    return out
      .copy(this.rpos)
      .addScaledVector(L, s * w)
      .addScaledVector(F, f)
      .setY(this.rpos.y);
  }
  _homeYaw(i) {
    const s = i === 0 ? 1 : -1,
      b = this.b;
    const still = 1 - b.move;
    const out =
      s > 0
        ? 0.12 + 0.1 * still * (1 - b.pistol)
        : -0.14 - 0.42 * still * (1 - b.pistol) - 0.3 * b.crouch * still;
    return this.bodyYaw + out;
  }

  // ---------------------------------------------------------------- per-frame
  update(dt) {
    if (!this.started) return;
    dt = clamp(dt, 0.0001, 0.05);
    this.time += dt;
    this.stAge += dt;
    const S = this.st,
      b = this.b;
    const vis = S.alive && this.userVisible;
    this.root.visible = vis;
    if (!vis) {
      this.rpos.copy(S.pos);
      this.prev.copy(S.pos);
      this._hiddenFrames = (this._hiddenFrames || 0) + 1;
      return;
    }
    if (this._hiddenFrames) {
      this._hiddenFrames = 0;
      this._resetFeet();
    }
    this._syncGun(dt);
    // ---- smoothing of network state
    const tgt = _v1
      .copy(S.pos)
      .addScaledVector(S.vel, Math.min(this.stAge, 0.12));
    if (tgt.distanceToSquared(this.rpos) > 6.25) {
      this.rpos.copy(tgt);
      this.prev.copy(tgt);
      this.vs.set(0, 0, 0);
      this._resetFeet();
    } else {
      this.rpos.x = damp(this.rpos.x, tgt.x, 18, dt);
      this.rpos.z = damp(this.rpos.z, tgt.z, 18, dt);
      this.rpos.y = damp(this.rpos.y, tgt.y, 24, dt);
    }
    const vmx = (this.rpos.x - this.prev.x) / dt,
      vmz = (this.rpos.z - this.prev.z) / dt,
      vmy = (this.rpos.y - this.prev.y) / dt;
    this.prev.copy(this.rpos);
    const ovx = this.vs.x,
      ovz = this.vs.z;
    this.vs.x = damp(this.vs.x, vmx, 14, dt);
    this.vs.z = damp(this.vs.z, vmz, 14, dt);
    this.accel.x = damp(this.accel.x, (this.vs.x - ovx) / dt, 6, dt);
    this.accel.z = damp(this.accel.z, (this.vs.z - ovz) / dt, 6, dt);
    this.vy = damp(this.vy, vmy, 20, dt);
    const speed = Math.hypot(this.vs.x, this.vs.z);
    this.aimYaw = dampA(this.aimYaw, S.yaw + PI, 20, dt);
    this.aimPitch = damp(this.aimPitch, clamp(S.pitch, -1.35, 1.35), 20, dt);
    // ---- blends
    const busyHands =
      !!(this.act && this.act.type !== "revived") || !!this.reload;
    b.crouch = damp(b.crouch, S.crouching && !S.downed ? 1 : 0, 9, dt);
    b.sprint = damp(
      b.sprint,
      S.sprinting && speed > 2.2 && !S.downed && !busyHands ? 1 : 0,
      7,
      dt,
    );
    b.ads = damp(
      b.ads,
      S.ads && !S.sprinting && !S.downed && !busyHands ? 1 : 0,
      13,
      dt,
    );
    b.downed = S.downed
      ? Math.min(1, b.downed + dt * 1.7)
      : Math.max(0, b.downed - dt * 1.25);
    b.kneel = damp(b.kneel, S.reviving && !S.downed ? 1 : 0, 6, dt);
    b.air = damp(
      b.air,
      S.grounded || S.downed ? 0 : 1,
      S.grounded ? 16 : 9,
      dt,
    );
    b.move = damp(b.move, speed > 0.3 ? 1 : 0, 6, dt);
    b.beingRev = damp(b.beingRev, S.beingRevived ? 1 : 0, 4, dt);
    const gi = this.gun ? this.gun.userData.info : null;
    b.pistol = damp(b.pistol, gi && gi.pistol ? 1 : 0, 12, dt);
    // ---- springs
    const R = this.rec;
    R.v += (-260 * R.x - 22 * R.v) * dt;
    R.x += R.v * dt;
    const Fl = this.flinch;
    Fl.v += (-140 * Fl.x - 13 * Fl.v) * dt;
    Fl.x += Fl.v * dt;
    this.landVel += (-180 * this.landDip - 16 * this.landVel) * dt;
    this.landDip += this.landVel * dt;
    // ---- action timers
    if (this.act) {
      this.act.t += dt;
      if (this.act.t >= this.act.dur) this.act = null;
    }
    if (this.cycle) {
      this.cycle.t += dt;
      if (this.cycle.t >= this.cycle.dur) this.cycle = null;
    }
    if (this.reload) {
      const r = this.reload;
      const fast = !S.reloading && r.t > 0.25 && !r.loop ? 3 : 1;
      r.t += dt * fast;
      if (r.loop) {
        if (!S.reloading && r.t > 0.4) {
          r.loop = false;
          r.end = r.t;
        }
      }
      if (
        !r.loop &&
        r.t >= (r.end !== undefined ? r.end + (r.empty ? 0.85 : 0.45) : r.dur)
      )
        this.reload = null;
    }
    if (this.swapT < 1) this.swapT = Math.min(1, this.swapT + dt / 0.72);
    if (this.flashT > 0) this.flashT -= dt;
    // ---- body yaw (hips / legs)
    const bladeIdle = lerp(-0.42, -0.1, b.pistol);
    if (S.downed) this.bodyYaw = dampA(this.bodyYaw, this.aimYaw, 5, dt);
    else if (speed > 0.35) {
      const mv = Math.atan2(this.vs.x, this.vs.z),
        rel = wrapA(mv - this.aimYaw);
      const off =
        Math.abs(rel) <= PI / 2 + 0.2
          ? rel * 0.5
          : wrapA(rel - PI * Math.sign(rel)) * 0.45;
      const blade = bladeIdle * (1 - clamp(speed / 2.5, 0, 1)) * (1 - b.sprint);
      this.bodyYaw = dampA(
        this.bodyYaw,
        this.aimYaw + off * (1 - b.sprint * 0.5) + blade,
        8,
        dt,
      );
      this.turning = false;
    } else {
      const desired = this.aimYaw + bladeIdle * (1 - b.kneel);
      const diff = wrapA(desired - this.bodyYaw);
      if (Math.abs(diff) > 0.87 || this.turning) {
        this.turning = Math.abs(diff) > 0.06;
        const step = clamp(diff * 6 * dt, -4.5 * dt, 4.5 * dt);
        this.bodyYaw += step;
      }
    }
    // ---- gait + pose
    this._gait(dt, speed);
    const P = this._standPose(this.P1, dt, speed);
    if (b.downed > 0.001)
      P.blend(this._downedPose(this.P2, dt, speed), smooth(b.downed));
    this._animGun(dt);
    this._solve(P, dt);
  }

  // ---------------------------------------------------------------- gait (feet in world space)
  _gait(dt, speed) {
    const b = this.b,
      S = this.st,
      feet = this.feet;
    const run = sstep(1.8, 4.3, speed),
      spr = sstep(4.9, 6.6, speed);
    let cad = lerp(lerp(0.9 + 0.12 * speed, 1.55, run), 1.66, spr);
    cad = lerp(cad, 1.05 + 0.2 * speed, b.crouch);
    const stanceF = clamp(
      lerp(lerp(0.6, 0.34, run), 0.22, spr) + 0.04 * b.crouch,
      0.2,
      0.64,
    );
    const swingF = 1 - stanceF;
    const Tc = 1 / cad;
    this.gaitRun = run;
    this.gaitSpr = spr;
    this.swingF = swingF;
    this.stanceF = stanceF;
    this.cad = cad;
    const grounded = S.grounded || S.downed;
    // landing: re-lock feet under the body
    if (grounded && this.wasAir) {
      this.wasAir = false;
      const imp = clamp(-this.airVy * 0.022, 0.02, 0.14);
      this.landVel -= imp * 9;
      for (let i = 0; i < 2; i++) {
        const f = feet[i];
        this._home(i, f.lock);
        f.lock.addScaledVector(this.vs, 0.05);
        f.cur.copy(f.lock);
        f.yaw = f.curYaw;
        f.swing = false;
        f.lift = 0;
      }
      this.parked = speed < 0.35;
      this.phase = 0.5 - swingF * 0.5;
      this._step(0, 0.7);
    }
    if (!grounded) {
      this.wasAir = true;
      this.airVy = Math.min(this.airVy ?? 0, this.vy);
      if (this.vy > 0) this.airVy = 0;
      return;
    }
    this.airVy = 0;
    if (b.downed > 0.6) {
      for (const f of feet) {
        f.swing = false;
        this._home(feet.indexOf(f), f.lock);
        f.cur.copy(f.lock);
      }
      this.parked = true;
      return;
    }
    const moving = speed > 0.3;
    let dphi = 0;
    if (moving) {
      if (this.parked) {
        const vx = this.vs.x / speed,
          vz = this.vs.z / speed;
        const d0 =
          (feet[0].lock.x - this.rpos.x) * vx +
          (feet[0].lock.z - this.rpos.z) * vz;
        const d1 =
          (feet[1].lock.x - this.rpos.x) * vx +
          (feet[1].lock.z - this.rpos.z) * vz;
        this.phase = (d0 < d1 ? 0 : 0.5) + 0.001;
        this.parked = false;
      }
      dphi = cad * dt;
    } else {
      const anySwing = feet[0].swing || feet[1].swing;
      if (anySwing) {
        dphi = (swingF / 0.26) * dt;
        this.parked = false;
      } else {
        let worst = -1,
          we = 0.085;
        for (let i = 0; i < 2; i++) {
          this._home(i, _v2);
          const e =
            Math.hypot(feet[i].lock.x - _v2.x, feet[i].lock.z - _v2.z) +
            0.1 * Math.abs(wrapA(feet[i].yaw - this._homeYaw(i)));
          if (e > we) {
            we = e;
            worst = i;
          }
        }
        if (worst >= 0) {
          this.phase = worst * 0.5 + 0.0005;
          this.parked = false;
          dphi = (swingF / 0.26) * dt;
        } else this.parked = true;
      }
    }
    this.phase = (this.phase + dphi) % 1;
    const H =
      lerp(lerp(lerp(0.055, 0.17, run), 0.3, spr), 0.075, b.crouch) *
      (moving ? 1 : 0.8);
    for (let i = 0; i < 2; i++) {
      const f = feet[i];
      let local = this.phase - i * 0.5;
      local -= Math.floor(local);
      const inSw = !this.parked && local < swingF;
      if (inSw && !f.swing) {
        f.swing = true;
        f.from.copy(f.lock);
        f.fromYaw = f.yaw;
      }
      const hy = this._homeYaw(i);
      if (f.swing) {
        const u = inSw ? clamp(local / swingF, 0, 1) : 1;
        const tg = this._home(i, _v3);
        if (moving) {
          const lead = Tc * ((1 - u) * swingF + stanceF * 0.42);
          tg.x += this.vs.x * lead;
          tg.z += this.vs.z * lead;
        }
        const e = Math.pow(smooth(u), lerp(1, 1.35, run));
        f.cur.lerpVectors(f.from, tg, e);
        f.cur.y = this.rpos.y;
        f.lift =
          H * Math.pow(Math.sin(PI * Math.pow(u, lerp(1, 0.72, run))), 0.9);
        f.curYaw = f.fromYaw + wrapA(hy - f.fromYaw) * smooth(u);
        f.pitch = moving
          ? lerp(
              lerp(-0.5, -1.0, run),
              lerp(0.22, 0.1, run),
              sstep(0.05, 0.92, u),
            ) *
            (1 - b.crouch * 0.5)
          : 0.12 * Math.sin(PI * u);
        if (u >= 1) {
          f.swing = false;
          f.lock.copy(tg);
          f.yaw = f.curYaw;
          f.lift = 0;
          f.cur.copy(f.lock);
          this._step(i, moving ? clamp(speed / 5, 0.25, 1) : 0.2);
        }
      } else {
        f.cur.copy(f.lock);
        f.curYaw = f.yaw;
        f.lift = 0;
        if (!this.parked && moving) {
          const v = (local - swingF) / stanceF;
          f.pitch =
            lerp(lerp(0.22, 0.1, run), 0, sstep(0.0, 0.14, v)) +
            lerp(0, lerp(-0.5, -0.75, run), sstep(0.62, 1.0, v));
        } else f.pitch = damp(f.pitch, 0, 12, dt);
      }
    }
  }
  _step(i, vol) {
    const a = this.mgr.audio;
    if (!this.footsteps || !a || !a.play) return;
    try {
      a.play("footstep_concrete", {
        volume: 0.35 * vol,
        position: this.feet[i].lock,
        pitch: 0.9 + Math.random() * 0.2,
      });
    } catch (e) {
      /* optional */
    }
  }

  // ---------------------------------------------------------------- FK helpers
  _torsoFK(P) {
    const Wp = this.Wp,
      Wq = this.Wq,
      off = this.off;
    Wp[B.hips].copy(P.hipsP);
    Wq[B.hips].copy(P.tq[0]);
    const chain = [B.spine, B.chest, B.neck, B.head];
    for (let i = 0; i < 4; i++) {
      const bi = chain[i],
        pa = PARENT[bi];
      Wq[bi].copy(P.tq[i + 1]);
      Wp[bi].copy(off[bi]).applyQuaternion(Wq[pa]).add(Wp[pa]);
    }
    for (const S of ["L", "R"]) {
      const c = B["clav" + S],
        u = B["ua" + S];
      Wq[c].copy(Wq[B.chest]);
      Wp[c].copy(off[c]).applyQuaternion(Wq[B.chest]).add(Wp[B.chest]);
      Wp[u].copy(off[u]).applyQuaternion(Wq[c]).add(Wp[c]);
    }
  }
  cp(out, x, y, z) {
    // chest-frame point (metres at base scale)
    return out
      .set(x * this.k, y * this.k, z * this.k)
      .applyQuaternion(this.Wq[B.chest])
      .add(this.Wp[B.chest]);
  }
  hp(out, v) {
    return out.copy(v).applyQuaternion(this.Wq[B.hips]).add(this.Wp[B.hips]);
  }
  /** hand orientation from world "fingers" direction F and palm normal P */
  _handQ(out, side, F, Pn) {
    const H = side === 0 ? HR.L : HR.R;
    const Fc = (this._hqF || (this._hqF = new V3())).copy(F),
      Pc = (this._hqP || (this._hqP = new V3())).copy(Pn);
    const T = this._hqT || (this._hqT = new V3());
    if (side === 0) T.crossVectors(Pc, Fc);
    else T.crossVectors(Fc, Pc);
    return qAlign(out, H.F, H.T, Fc, T);
  }
  _footXf(f, qOut, pOut) {
    const k = this.k;
    const pitch = f.pitch;
    qYPR(qOut, f.curYaw, -pitch, 0);
    const cz = pitch < 0 ? 0.15 * k : -0.07 * k;
    const c = _v4.set(0, -this.ankleH, cz);
    qYPR(_q3, f.curYaw, 0, 0);
    pOut.copy(f.cur);
    pOut.y += this.ankleH + f.lift;
    pOut
      .add(_v5.copy(c).applyQuaternion(_q3))
      .sub(_v6.copy(c).applyQuaternion(qOut));
    return pOut;
  }

  // ---------------------------------------------------------------- standing pose
  _standPose(P, dt, speed) {
    const b = this.b,
      S = this.st,
      k = this.k;
    const run = this.gaitRun || 0,
      spr = this.gaitSpr || 0,
      swingF = this.swingF || 0.4;
    const fwd = fwdOf(this.bodyYaw, this._fwd),
      left = leftOf(this.bodyYaw, this._left);
    const phase = this.phase,
      moving = !this.parked && speed > 0.3;
    // ---- gesture tracks
    const g = this._gestures();
    // ---- pelvis
    const bobA = lerp(0.016, -0.03, run) * b.move * (1 - b.crouch * 0.5);
    const bob = moving
      ? bobA * Math.cos(TAU * 2 * (phase - (1 + swingF) / 2))
      : 0;
    const breathe = Math.sin(this.time * 1.7) * 0.004 * (1 - b.move);
    const sway =
      Math.sin(this.time * 0.43) * 0.012 * (1 - b.move) * (1 - b.crouch);
    let hy =
      this.rpos.y +
      this.hipsRestY * lerp(0.998, 0.66, b.crouch) -
      0.03 * run * (1 - b.crouch) -
      0.03 * spr +
      bob +
      this.landDip +
      breathe * 0.5;
    hy = lerp(hy, this.rpos.y + 0.5 * k, b.kneel);
    const oscY = moving
      ? -lerp(0.05, 0.16, run) *
        Math.cos(TAU * (phase - swingF)) *
        (1 - b.crouch * 0.5)
      : 0;
    const oscR = moving
      ? 0.045 * Math.sin(TAU * (phase - swingF * 0.5)) * (1 - run * 0.5)
      : 0;
    const accF = this.accel.x * fwd.x + this.accel.z * fwd.z;
    const lean =
      0.04 +
      0.1 * run * b.move +
      0.26 * spr +
      0.22 * b.crouch +
      clamp(accF * 0.02, -0.1, 0.12) +
      0.3 * b.kneel +
      g.lean;
    P.hipsP
      .copy(this.rpos)
      .setY(hy)
      .addScaledVector(left, sway)
      .addScaledVector(fwd, -0.03 * b.kneel * k);
    const still = (1 - b.move) * (1 - b.crouch) * (1 - b.kneel);
    const contra = still * (0.035 + 0.02 * Math.sin(this.time * 0.43 + 1));
    qYPR(
      P.tq[0],
      this.bodyYaw + oscY,
      0.07 * run + 0.12 * spr + 0.18 * b.crouch + 0.12 * b.kneel,
      oscR + sway * 0.8 - contra,
    );
    // leg reach: lower the pelvis if a planted foot would over-extend
    const Lmax = (this.T1 + this.T2) * 0.996;
    const fp = this._fp,
      fq = this._fq;
    for (let i = 0; i < 2; i++) this._footXf(this.feet[i], fq[i], fp[i]);
    let limit = 1e9;
    for (let i = 0; i < 2; i++) {
      if (this.feet[i].lift > 0.03 * k || b.air > 0.5) continue;
      const hj = _v3
        .copy(this.off[i === 0 ? B.thL : B.thR])
        .applyQuaternion(P.tq[0])
        .add(P.hipsP);
      const h2 = (fp[i].x - hj.x) ** 2 + (fp[i].z - hj.z) ** 2;
      const lim =
        fp[i].y +
        Math.sqrt(Math.max(0.01, Lmax * Lmax - h2)) -
        (hj.y - P.hipsP.y);
      limit = Math.min(limit, lim);
    }
    if (limit < P.hipsP.y + 0.05) {
      const a = P.hipsP.y,
        bb = limit,
        kk = 0.05,
        h = Math.max(kk - Math.abs(a - bb), 0) / kk;
      P.hipsP.y = Math.min(a, bb) - h * h * kk * 0.25;
    }
    // ---- torso chain
    const ap = this.aimPitch;
    const blade = lerp(-0.44, -0.1, b.pistol) * (1 - b.sprint) * (1 - b.kneel);
    const chestYaw =
      this.aimYaw +
      blade -
      oscY * 0.55 +
      g.chestYaw +
      this.flinch.yaw * this.flinch.x;
    const spineYaw =
      this.bodyYaw + oscY + wrapA(chestYaw - (this.bodyYaw + oscY)) * 0.5;
    const rec = this.rec.x,
      fl = this.flinch.x;
    const adsL = b.ads * (1 - b.pistol);
    qYPR(P.tq[1], spineYaw, lean * 0.8 - ap * 0.14 - fl * 0.08, -oscR * 0.5);
    qYPR(
      P.tq[2],
      chestYaw,
      lean * 0.75 - ap * 0.32 - rec * 0.012 - fl * 0.12 + g.chestPitch,
      -oscR * 0.3 + this.flinch.roll * fl * 0.5 + adsL * 0.04,
    );
    const headYaw = this.aimYaw + g.headYaw + this.flinch.yaw * fl * 0.5;
    const headPitch =
      -ap + g.headPitch - fl * 0.1 + 0.25 * b.kneel * (1 - g.drink);
    qYPR(
      P.tq[3],
      lerp(chestYaw, headYaw, 0.55),
      lerp(lean * 0.75 - ap * 0.32, headPitch, 0.45) + adsL * 0.32,
      adsL * 0.06,
    );
    qYPR(
      P.tq[4],
      headYaw,
      headPitch + adsL * 0.04,
      adsL * 0.2 + this.flinch.roll * fl,
    );
    this._torsoFK(P);
    // ---- gun
    this._gunPose(P, g, fwd, left, moving);
    // ---- hands
    for (let i = 0; i < 2; i++) {
      const H = P.hand[i];
      H.onGun = i === 0 ? g.onL : g.onR;
      H.gp = i === 0 ? g.poseL : g.poseR;
      const base = this._poseArr(H.gp, i);
      for (let j = 0; j < 17; j++) H.pose[j] = base[j];
      H.p.copy(i === 0 ? g.pL : g.pR);
      H.q.copy(i === 0 ? g.qL : g.qR);
    }
    // ---- feet
    for (let i = 0; i < 2; i++) {
      const F = P.foot[i],
        f = this.feet[i];
      F.p.copy(fp[i]);
      F.q.copy(fq[i]);
      if (f.lift < 0.01 * k && f.pitch < 0) qYPR(F.toe, f.curYaw, 0, 0);
      else F.toe.copy(F.q);
      const hj = _v3
        .copy(this.off[i === 0 ? B.thL : B.thR])
        .applyQuaternion(P.tq[0])
        .add(P.hipsP);
      const ff = fwdOf(f.curYaw, _v4)
        .multiplyScalar(0.6)
        .addScaledVector(fwd, 0.4)
        .normalize();
      F.pole
        .copy(hj)
        .addScaledVector(ff, 0.5)
        .addScaledVector(left, (i === 0 ? 1 : -1) * 0.06);
      // airborne: tuck
      if (b.air > 0.001) {
        const tuck = _v5
          .set(
            (i === 0 ? 1 : -1) * 0.1 * k,
            -0.62 * k,
            (i === 0 ? 0.14 : 0.02) * k,
          )
          .applyQuaternion(P.tq[0])
          .add(P.hipsP);
        F.p.lerp(tuck, b.air);
        qYPR(_q3, this.bodyYaw + (i === 0 ? 0.1 : -0.12), 0.35, 0);
        F.q.slerp(_q3, b.air);
        F.toe.slerp(_q3, b.air);
      }
      // kneeling (reviving): right knee on the ground, left foot forward
      if (b.kneel > 0.001) {
        const kp = _v5.copy(this.rpos);
        if (i === 1) {
          kp.addScaledVector(fwd, -0.34 * k).addScaledVector(left, -0.12 * k);
          kp.y += 0.1 * k;
          qYPR(_q3, this.bodyYaw - 0.05, 1.15, 0);
          const pole = _v6
            .copy(this.rpos)
            .addScaledVector(fwd, 0.25 * k)
            .addScaledVector(left, -0.12 * k);
          F.pole.lerp(pole, b.kneel);
          F.toe.slerp(qYPR(_q2, this.bodyYaw, 0, 0), b.kneel);
        } else {
          kp.addScaledVector(fwd, 0.36 * k).addScaledVector(left, 0.14 * k);
          kp.y += this.ankleH;
          qYPR(_q3, this.bodyYaw + 0.1, 0, 0);
          const pole = _v6
            .copy(kp)
            .addScaledVector(fwd, 0.4)
            .setY(kp.y + 0.6);
          F.pole.lerp(pole, b.kneel);
          F.toe.slerp(_q3, b.kneel);
        }
        F.p.lerp(kp, b.kneel);
        F.q.slerp(_q3, b.kneel);
      }
    }
    P.clav[0] = g.clavL;
    P.clav[1] = g.clavR + adsL * 0.1;
    return P;
  }

  // ---------------------------------------------------------------- gestures (scalars)
  _gestures() {
    const g =
      this._g ||
      (this._g = { pL: new V3(), pR: new V3(), qL: new Q4(), qR: new Q4() });
    g.lean = 0;
    g.chestYaw = 0;
    g.chestPitch = 0;
    g.headYaw = 0;
    g.headPitch = 0;
    g.drink = 0;
    g.lowR = 0;
    g.lowL = 0;
    g.down = 0;
    g.tiltW = 0;
    g.tRoll = 0;
    g.tPitch = 0;
    g.tYaw = 0;
    g.tBack = 0;
    g.tDown = 0;
    g.tIn = 0;
    g.onL = 1;
    g.onR = 1;
    g.clavL = 0;
    g.clavR = 0;
    g.knife = 0;
    g.grenade = 0;
    g.bottle = 0;
    const gi = this.gun ? this.gun.userData.info : null;
    g.poseR = this.time - (this.firedAt ?? -9) < 0.16 ? "gunRfire" : "gunR";
    g.poseL = "gunL";
    const r = this.reload;
    if (r) {
      const w =
        r.cls === "shell"
          ? sstep(0, 0.25, r.t) *
            (r.end !== undefined
              ? 1 - sstep(r.end + 0.15, r.end + (r.empty ? 0.8 : 0.42), r.t)
              : 1)
          : bell(r.t, 0, 0.22, r.dur - 0.3, r.dur);
      g.tiltW = w;
      const T = {
        mag: [0.55, -0.1, 0.18, 0.07, 0.05, 0.03],
        pistol: [0.45, 0.25, 0.05, 0.05, 0.02, 0.04],
        capsule: [0.35, 0.3, 0.1, 0.06, 0.02, 0.04],
        bolt: [-0.35, 0.14, 0.04, 0.05, 0.0, 0.02],
        shell: [0.75, 0.06, 0.1, 0.06, 0.05, 0.04],
        belt: [-0.12, 0.05, 0.08, 0.03, 0.02, 0.0],
      }[r.cls] || [0.4, 0, 0.1, 0.05, 0.03, 0.03];
      g.tRoll = T[0];
      g.tPitch = T[1];
      g.tYaw = T[2];
      g.tBack = T[3];
      g.tDown = T[4];
      g.tIn = T[5];
      g.headPitch += 0.28 * w;
      g.headYaw += 0.1 * w;
      g.lean += 0.05 * w;
    }
    const a = this.act;
    if (a) {
      const t = a.t;
      if (a.type === "knife") {
        const w = bell(t, 0, 0.07, a.dur - 0.16, a.dur);
        g.lowL = w;
        g.onR = 1 - bell(t, 0.0, 0.07, a.dur - 0.2, a.dur - 0.06);
        g.chestYaw += keyf(t, [
          [0, 0],
          [0.12, -0.4],
          [0.27, 0.42],
          [0.42, 0.12],
          [0.62, 0],
        ]);
        g.lean += 0.16 * w;
        g.knife = g.onR < 0.6 ? 1 : 0;
        g.poseR = g.onR < 0.5 ? "fist" : g.poseR;
        g.clavR += 0.12 * bell(t, 0.05, 0.12, 0.2, 0.3);
      } else if (a.type === "grenade") {
        const w = bell(t, 0, 0.12, a.dur - 0.25, a.dur);
        g.lowR = w;
        g.onL = 1 - bell(t, 0.02, 0.12, a.dur - 0.22, a.dur - 0.06);
        g.chestYaw += keyf(t, [
          [0, 0],
          [0.3, 0.1],
          [0.5, 0.45],
          [0.62, -0.35],
          [0.8, -0.1],
          [1.05, 0],
        ]);
        g.lean += keyf(t, [
          [0, 0],
          [0.48, -0.1],
          [0.64, 0.22],
          [1.05, 0],
        ]);
        g.headPitch += keyf(t, [
          [0, 0],
          [0.2, 0.25],
          [0.35, 0],
          [0.5, -0.12],
          [1.05, 0],
        ]);
        g.grenade = t > 0.12 && t < 0.6 ? 1 : 0;
        g.poseL = g.onL < 0.5 ? (g.grenade ? "cup" : "relax") : g.poseL;
        g.clavL += 0.22 * bell(t, 0.4, 0.5, 0.6, 0.72);
      } else if (a.type === "drink") {
        const w = bell(t, 0, 0.25, a.dur - 0.3, a.dur);
        g.lowR = w;
        g.onL = 1 - bell(t, 0.02, 0.2, a.dur - 0.35, a.dur - 0.08);
        g.drink = bell(t, 0.5, 0.75, 1.45, 1.7);
        g.headPitch -= 0.55 * g.drink;
        g.lean -= 0.08 * g.drink;
        g.bottle = t > 0.22 && t < 1.95 ? 1 : 0;
        g.poseL = g.onL < 0.5 ? (g.bottle ? "wrap" : "relax") : g.poseL;
        g.clavL += 0.12 * g.drink;
      } else if (a.type === "revived") {
        g.headPitch += 0.15 * Math.sin(t * 9) * (1 - t);
      }
    }
    if (this.swapT < 1)
      g.down = keyf(this.swapT, [
        [0, 0],
        [0.42, 1],
        [0.58, 1],
        [1, 0],
      ]);
    if (this.st.reviving && !this.st.downed) {
      g.lowR = Math.max(g.lowR, this.b.kneel);
      g.onL = Math.min(g.onL, 1 - this.b.kneel);
      g.poseL = this.b.kneel > 0.5 ? "flat" : g.poseL;
    }
    if (this.b.kneel > 0.01) {
      g.headPitch += 0.35 * this.b.kneel;
      g.lean += 0.12 * this.b.kneel;
    }
    return g;
  }

  // ---------------------------------------------------------------- gun pose
  _gunPose(P, g, fwd, left, moving) {
    const gi = this.gun ? this.gun.userData.info : null;
    const b = this.b,
      k = this.k,
      Wp = this.Wp,
      Wq = this.Wq;
    if (!gi) {
      P.gunP.copy(Wp[B.chest]);
      P.gunQ.identity();
      this._gestureHands(P, g, null);
      return;
    }
    const ap = this.aimPitch;
    const qAim = qYPR(this._tq[0], this.aimYaw, -ap, 0);
    const drop = lerp(0.06, 0.08, b.pistol) * (1 - b.ads);
    const qG = this._tq[1]
      .copy(qAim)
      .multiply(Q_GUN)
      .multiply(_q1.setFromAxisAngle(AZ, -drop));
    const pReady = this._tmp[0],
      pAds = this._tmp[1];
    const eye = this._tmp[3]
      .copy(this.D.eyeR)
      .applyQuaternion(Wq[B.head])
      .add(Wp[B.head]);
    if (!gi.pistol) {
      const pocket = _v3
        .copy(this.D.pocket)
        .applyQuaternion(Wq[B.chest])
        .add(Wp[B.chest]);
      pReady.copy(gi.stock).applyQuaternion(qG).negate().add(pocket);
      const ex = gi.stock.x + 0.15;
      pAds
        .set(ex, sightY(gi, ex) + 0.014, 0)
        .applyQuaternion(qG)
        .negate()
        .add(eye);
    } else {
      const sh = _v3.copy(Wp[B.uaL]).add(Wp[B.uaR]).multiplyScalar(0.5);
      pReady
        .set(-0.05 * k, -0.11 * k, 0.4 * k)
        .applyQuaternion(qAim)
        .add(sh)
        .sub(_v4.copy(gi.right).applyQuaternion(qG));
      pAds
        .set(gi.sightR.x - 0.5 * k, gi.sightR.y + 0.01, 0)
        .applyQuaternion(qG)
        .negate()
        .add(eye);
    }
    P.gunP.lerpVectors(pReady, pAds, smooth(b.ads));
    P.gunQ.copy(qG);
    // idle sway + stride bob (the chest carries most of it)
    const sw = 1 - b.ads * 0.7;
    P.gunQ.multiply(
      _q1.setFromEuler(
        _e.set(
          Math.sin(this.time * 1.3) * 0.012 * sw,
          Math.sin(this.time * 0.9) * 0.018 * sw,
          Math.sin(this.time * 1.1 + 1) * 0.01 * sw,
        ),
      ),
    );
    // recoil: kick back + muzzle climb
    const rc = this.rec.x;
    P.gunP.addScaledVector(
      _v3.set(1, 0, 0).applyQuaternion(P.gunQ),
      -rc * 0.0022,
    );
    P.gunQ.multiply(_q1.setFromAxisAngle(AZ, rc * 0.0065));
    // sprint carry
    if (b.sprint > 0.001) {
      const qB = qYPR(_q2, this.bodyYaw, 0.2, 0);
      const qS = this._tq[2],
        pS = this._tmp[2];
      const ph = TAU * this.phase;
      if (!gi.pistol) {
        const X = _v3
          .set(0.6, 0.56 + 0.05 * Math.sin(ph * 2), 0.5)
          .normalize()
          .applyQuaternion(qB);
        const Y = _v4.set(-0.25, 0.3, 1).applyQuaternion(qB);
        Y.sub(_v5.copy(X).multiplyScalar(Y.dot(X))).normalize();
        qFromBasis(qS, X, Y, _v5.crossVectors(X, Y));
        qS.premultiply(_q3.setFromAxisAngle(AY, 0.16 * Math.sin(ph)));
        qS.premultiply(_q3.setFromAxisAngle(this._fwd, 0.08 * Math.sin(ph)));
        const mid = _v6.copy(gi.right).lerp(gi.left, 0.5).applyQuaternion(qS);
        this.cp(
          pS,
          0.03 - 0.025 * Math.sin(ph),
          -0.02 + 0.022 * Math.sin(ph * 2),
          0.29,
        ).sub(mid);
      } else {
        qS.copy(qYPR(_q3, this.bodyYaw - 0.25, 0.95, 0.2)).multiply(Q_GUN);
        this.cp(
          pS,
          -0.13,
          -0.12 + 0.02 * Math.sin(ph * 2),
          0.25 + 0.03 * Math.sin(ph),
        ).sub(_v6.copy(gi.right).applyQuaternion(qS));
      }
      const s = smooth(b.sprint);
      P.gunP.lerp(pS, s);
      P.gunQ.slerp(qS, s);
    }
    // reload tilt (rotate about the grip, pull toward the chest)
    if (g.tiltW > 0.001) {
      const w = g.tiltW;
      _q1.setFromEuler(_e.set(g.tRoll * w, g.tYaw * w, g.tPitch * w, "XYZ"));
      P.gunQ.multiply(_q1);
      fwdOf(this.aimYaw, _v3);
      leftOf(this.aimYaw, _v4);
      P.gunP
        .addScaledVector(_v3, -g.tBack * w * k)
        .addScaledVector(_v4, g.tIn * w * k);
      P.gunP.y -= g.tDown * w * k;
    }
    // lowered carries: right hand only / left hand only / swap
    const low = (w, qT, anchor, gripV) => {
      if (w <= 0.001) return;
      const pT = _v6.copy(gripV).applyQuaternion(qT).negate().add(anchor);
      P.gunP.lerp(pT, smooth(w));
      P.gunQ.slerp(qT, smooth(w));
    };
    // anchors hang off the shoulder (always within reach), expressed in the chest frame
    const shA = (out, S, x, y, z) =>
      out
        .set(x * k, y * k, z * k)
        .applyQuaternion(Wq[B.chest])
        .add(Wp[S === "R" ? B.uaR : B.uaL]);
    if (g.lowR > 0.001)
      low(
        g.lowR,
        qYPR(this._tq[3], this.bodyYaw - 0.3, 0.78, 0.35).multiply(Q_GUN),
        shA(this._tmp[4], "R", -0.03, -0.3, 0.22),
        gi.right,
      );
    if (g.lowL > 0.001)
      low(
        g.lowL,
        qYPR(this._tq[3], this.bodyYaw + 0.55, 0.6, -0.5).multiply(Q_GUN),
        shA(this._tmp[4], "L", -0.04, -0.3, 0.27),
        gi.left,
      );
    if (g.down > 0.001)
      low(
        g.down,
        qYPR(this._tq[3], this.bodyYaw - 0.15, 1.15, 0.25).multiply(Q_GUN),
        shA(this._tmp[4], "R", 0.0, -0.33, 0.18),
        gi.right,
      );
    this._gestureHands(P, g, gi);
  }

  // ---------------------------------------------------------------- grips
  _gripGun(side, out) {
    const gi = this.gun.userData.info;
    if (side === 1) return out.copy(gi.right);
    const parts = this.gun.userData.parts;
    if (gi.leftPart && parts[gi.leftPart]) {
      const pt = parts[gi.leftPart];
      return out
        .copy(gi.leftLocal)
        .applyQuaternion(pt.quaternion)
        .add(pt.position);
    }
    return out.copy(gi.left);
  }
  _gripQ(side, gunQ, out) {
    const gi = this.gun.userData.info;
    const qm = side === 1 ? gi.rightQ : gi.leftQ;
    const Y = _v1.set(0, 1, 0).applyQuaternion(qm);
    let F;
    if (side === 1) {
      // right: fingers forward around the front strap, palm on the right side
      F = _v2.set(1, 0, 0);
      F.sub(_v3.copy(Y).multiplyScalar(F.dot(Y))).normalize();
      F.applyAxisAngle(Y, gi.pistol ? -0.1 : -0.15);
      Y.applyQuaternion(gunQ);
      F.applyQuaternion(gunQ);
      return qAlign(out, HR.R.F, HR.R.T, F, Y);
    }
    if (!gi.leftHoriz) {
      // vertical grip / mag housing / pistol support: fingers forward, palm right
      F = _v2.set(1, 0, 0);
      F.sub(_v3.copy(Y).multiplyScalar(F.dot(Y))).normalize();
      F.applyAxisAngle(Y, gi.pistol ? 0.12 : 0.1);
      if (gi.pistol) {
        const Pz = _v3.crossVectors(F, Y).normalize();
        F.applyAxisAngle(Pz, -0.2);
        Y.applyAxisAngle(Pz, -0.2);
      }
      Y.applyQuaternion(gunQ);
      F.applyQuaternion(gunQ);
      return qAlign(out, HR.L.F, HR.L.T, F, Y);
    }
    // handguard: palm under, the handguard runs along the fist axis, fingers up the far side
    const Pn = _v3.set(1, 0, 0).applyQuaternion(qm);
    F = _v2.set(0, 0, -1).applyQuaternion(qm).applyAxisAngle(Pn, -0.15);
    const T = _v4.crossVectors(Pn, F);
    T.applyQuaternion(gunQ);
    F.applyQuaternion(gunQ);
    return qAlign(out, HR.L.F, HR.L.T, F, T);
  }
  /** Solve how each hand wraps this gun (static relative to the gun): finger curls, thumb, index on the trigger,
   *  and the grip-centre offset in the hand frame (metres). Result in this.gp[side]. */
  _solveGunHands() {
    const gi = this.gun.userData.info,
      hs = this.C.hand * this.k;
    const qI = new Q4();
    const gp = (this.gp = [null, null]);
    for (const side of [1, 0]) {
      const s = side === 0 ? 1 : -1;
      const pistolSupport = side === 0 && gi.pistol;
      const R = side === 1 ? gi.rR : gi.rL;
      const Robj = pistolSupport ? gi.rR + 0.012 * hs : R;
      const f0 = (side === 1 ? 0.073 : pistolSupport ? 0.07 : 0.072) * hs;
      let t0 = (side === 1 ? -0.004 : pistolSupport ? -0.007 : 0.0) * hs;
      const p0 = (side === 1 ? R : pistolSupport ? gi.rR : R) + 0.0165 * hs;
      const pose = new Float32Array(17);
      // index onto the trigger (right hand): slide the hand along the grip so the index sits at trigger height
      let trig = null;
      if (side === 1 && gi.markers.trigTip) {
        const hq = this._gripQ(1, qI, new Q4());
        const wrist = new V3()
          .copy(gi.right)
          .sub(hf(s, f0, t0, p0).applyQuaternion(hq));
        trig = _hc(
          s,
          gi.markers.trigTip.pos
            .clone()
            .sub(wrist)
            .applyQuaternion(hq.clone().invert()),
          new V3(),
        );
        const delta = clamp(trig.y - FING.ix.base[1] * hs, -0.012, 0.016);
        t0 -= delta;
        trig.y -= delta;
      }
      const off = [f0, t0, p0];
      // fingers wrap the object circle
      const ofc = f0 + (pistolSupport ? 0.012 * hs : 0),
        rf = 0.0095 * hs + 0.0005;
      for (let fi = 1; fi < 5; fi++) {
        const fd = FING[FINGER_NAMES[fi]];
        wrapCurls(
          fd.base[0] * hs,
          fd.base[2] * hs,
          fd.len.map((l) => l * hs),
          ofc,
          p0,
          Robj + rf,
          pose,
          4 + (fi - 1) * 3,
        );
        if (pistolSupport) {
          const o = 4 + (fi - 1) * 3;
          pose[o + 1] *= 0.72;
          pose[o + 2] *= 0.6;
        }
      }
      const fire = new Float32Array(17);
      if (trig) {
        // DIP just in front of the trigger blade, finger on the palm side of it
        reachCurls(
          FING.ix.base[0] * hs,
          FING.ix.base[2] * hs,
          FING.ix.len[0] * hs,
          FING.ix.len[1] * hs,
          trig.x + 0.005,
          trig.z - 0.003,
          pose,
          4,
          0.95,
        );
      }
      // thumb
      const axP = hf(s, ofc, t0, p0, new V3()),
        axD = (s > 0 ? HR.L : HR.R).T.clone();
      let tgt;
      if (side === 1)
        tgt = hf(
          s,
          f0 + 0.018 * hs,
          t0 + (gi.pistol ? 0.036 : 0.03) * hs,
          p0 + R + 0.004 * hs,
          new V3(),
        );
      else if (gi.leftHoriz)
        tgt = hf(
          s,
          f0 - (R + 0.009 * hs),
          t0 + 0.068 * hs,
          p0 + 0.002 * hs,
          new V3(),
        );
      else
        tgt = hf(
          s,
          f0 + 0.045 * hs,
          t0 + 0.034 * hs,
          p0 - gi.rR - 0.006 * hs,
          new V3(),
        );
      const th = solveThumb(
        s,
        hs,
        tgt,
        axP,
        axD,
        (side === 1 ? R : Robj) + 0.0105 * hs,
      );
      for (let j = 0; j < 4; j++) pose[j] = th[j];
      pose[16] = th[4];
      fire.set(pose);
      if (trig)
        reachCurls(
          FING.ix.base[0] * hs,
          FING.ix.base[2] * hs,
          FING.ix.len[0] * hs,
          FING.ix.len[1] * hs,
          trig.x - 0.003,
          trig.z - 0.002,
          fire,
          4,
          1.1,
        );
      gp[side] = { pose, fire, off };
    }
  }
  _poseArr(name, side) {
    if (this.gp && this.gp[side]) {
      if (name === "gunR" || name === "gunL") return this.gp[side].pose;
      if (name === "gunRfire") return this.gp[side].fire;
    }
    return (
      HP[name] ||
      HP[
        name === "gunL"
          ? "support"
          : name === "gunRfire"
            ? "trigger"
            : name === "gunR"
              ? "grip"
              : "relax"
      ] ||
      HP.relax
    );
  }
  _gripOffM(side, name, out) {
    if (
      this.gp &&
      this.gp[side] &&
      (name === "gunR" || name === "gunL" || name === "gunRfire")
    ) {
      const o = this.gp[side].off;
      out[0] = o[0];
      out[1] = o[1];
      out[2] = o[2];
      return out;
    }
    const go =
        GRIP_OFF[name] ||
        GRIP_OFF[
          name === "gunL"
            ? "support"
            : name === "gunR" || name === "gunRfire"
              ? "grip"
              : "relax"
        ] ||
        GRIP_OFF.relax,
      hs = this.C.hand * this.k;
    out[0] = go[0] * hs;
    out[1] = go[1] * hs;
    out[2] = go[2] * hs;
    return out;
  }
  _markerGun(name, out) {
    const gi = this.gun.userData.info,
      m = gi.markers[name];
    if (!m) return null;
    const pt = m.part ? this.gun.userData.parts[m.part] : null;
    if (pt && m.local)
      return out.copy(m.local).applyQuaternion(pt.quaternion).add(pt.position);
    return out.copy(m.pos);
  }
  _part(name, tx = 0, ty = 0, tz = 0, rx = 0, ry = 0, rz = 0, vis) {
    const p = this.gun && this.gun.userData.parts[name];
    if (!p) return;
    p.position.copy(p.userData.restPos).add(_v6.set(tx, ty, tz));
    p.quaternion.copy(p.userData.restQuat);
    if (rx || ry || rz)
      p.quaternion.multiply(_q3.setFromEuler(_e.set(rx, ry, rz, "XYZ")));
    if (vis !== undefined) p.visible = vis;
  }

  // ---------------------------------------------------------------- gesture hand paths
  _gestureHands(P, g, gi) {
    const k = this.k;
    if (this.gun)
      for (const n in this.gun.userData.parts) {
        const p = this.gun.userData.parts[n];
        p.position.copy(p.userData.restPos);
        p.quaternion.copy(p.userData.restQuat);
        p.visible = p.userData.restVis;
      }
    if (!gi) {
      this.cp(g.pL, 0.2, -0.3, 0.05);
      this.cp(g.pR, -0.2, -0.3, 0.05);
      g.onL = g.onR = 0;
      g.poseL = g.poseR = "relax";
      this._handQ(g.qL, 0, _v1.set(0, -1, 0), _v2.set(-1, 0, 0));
      this._handQ(g.qR, 1, _v1.set(0, -1, 0), _v2.set(1, 0, 0));
      return;
    }
    const gw = (v, out) => out.copy(v).applyQuaternion(P.gunQ).add(P.gunP);
    const T = this._tmp;
    gw(this._gripGun(0, T[5]), g.pL);
    gw(gi.right, g.pR);
    this._gripQ(0, P.gunQ, g.qL);
    this._gripQ(1, P.gunQ, g.qR);
    const qGL = this._tq[4].copy(g.qL),
      qGR = this._tq[5].copy(g.qR);
    const pouchL = this.hp(T[7], this.D.pouchL),
      pouchR = this.hp(T[8], this.D.pouchR);
    const down = _v1.set(0, -1, 0);
    // generic path follower: keys [[t, V3], ...]
    const path = (t, keys, out) => {
      if (t <= keys[0][0]) return out.copy(keys[0][1]);
      for (let i = 1; i < keys.length; i++)
        if (t <= keys[i][0]) {
          const a = keys[i - 1],
            c = keys[i];
          return out.lerpVectors(
            a[1],
            c[1],
            smooth((t - a[0]) / (c[0] - a[0] || 1)),
          );
        }
      return out.copy(keys[keys.length - 1][1]);
    };
    const palmDownQ = (side, out, fx = 0) =>
      this._handQ(
        out,
        side,
        _v3
          .copy(this._fwd)
          .addScaledVector(this._left, fx)
          .setY(-0.35)
          .normalize(),
        _v4.set(0, -1, 0),
      );
    // ---------------- reloads
    const r = this.reload;
    if (r && gi) {
      const u = r.cls === "shell" ? r.t : r.t / r.dur;
      const mkp = (name, fb, out) =>
        this._markerGun(name, out) ? gw(out, out) : gw(fb, out);
      if (r.cls === "mag" || r.cls === "pistol" || r.cls === "capsule") {
        const isP = r.cls !== "mag";
        const grabName = r.cls === "capsule" ? "hL_cap" : "hL_mag";
        const grabG =
          this._markerGun(grabName, T[9]) ||
          T[9].copy(gi.right).add(_v6.set(0.02, -0.06, 0));
        const M = gw(grabG, T[10]);
        const partName = r.cls === "capsule" ? "capsule" : "mag";
        const outDir =
          r.cls === "capsule" ? _v6.set(0, 0.12, 0) : _v6.set(0, -0.15, 0);
        const Mout = gw(T[11].copy(grabG).add(outDir), T[11]);
        const Mpre = gw(T[12].copy(grabG).addScaledVector(outDir, 0.65), T[12]);
        let keys,
          att = [];
        if (!isP) {
          keys = [
            [0, g.pL],
            [0.14, M],
            [0.26, Mout],
            [0.42, pouchL],
            [0.5, pouchL],
            [0.64, Mpre],
            [0.71, M],
            [0.75, M],
          ];
          att = [
            [0.14, 0.43],
            [0.48, 0.73],
          ];
          if (r.empty) {
            const CH = mkp("hL_charge", gi.left, T[13]);
            const CH2 = T[14]
              .copy(CH)
              .addScaledVector(_v5.set(-1, 0, 0).applyQuaternion(P.gunQ), 0.07);
            keys.push([0.83, CH], [0.88, CH2], [0.94, g.pL]);
          } else keys.push([0.9, g.pL]);
        } else {
          keys = [
            [0, g.pL],
            [0.14, pouchL],
            [0.3, pouchL],
            [0.5, Mpre],
            [0.6, M],
            [0.64, M],
          ];
          att = [[0.3, 0.62]];
          if (r.cls === "capsule") {
            keys = [
              [0, g.pL],
              [0.1, M],
              [0.2, Mout],
              [0.34, pouchL],
              [0.44, pouchL],
              [0.6, Mpre],
              [0.68, M],
              [0.72, M],
            ];
            att = [
              [0.1, 0.33],
              [0.44, 0.7],
            ];
          }
          if (r.empty && r.cls === "pistol") {
            const SL = gw(_v5.set(0.03, 0.07, -0.02), T[13]);
            keys.push([0.74, SL], [0.8, SL]);
          }
          keys.push([0.92, g.pL]);
        }
        const hw = bell(u, 0.02, 0.1, 0.88, 0.96);
        g.onL = Math.min(g.onL, 1 - hw);
        path(u, keys, T[15]);
        const handP = T[15];
        g.pL.copy(handP);
        g.qL.slerp(palmDownQ(0, _q2, 0.3), bell(u, 0.3, 0.42, 0.5, 0.6));
        g.poseL = hw > 0.5 ? "cup" : g.poseL;
        // magazine / capsule follows the hand while held, hidden in the pouch
        let attached = 0;
        for (const [a0, a1] of att) if (u >= a0 && u <= a1) attached = 1;
        const inPouch = isP ? u > 0.14 && u < 0.3 : u > 0.43 && u < 0.48;
        if (attached) {
          const hg = _v5
            .copy(handP)
            .sub(P.gunP)
            .applyQuaternion(_q3.copy(P.gunQ).invert());
          const dlt = hg.sub(grabG);
          this._part(partName, dlt.x, dlt.y, dlt.z);
        } else if (r.cls === "pistol" && u > 0.04 && u < 0.3) {
          const fall = sstep(0.04, 0.2, u);
          this._part("mag", 0, -0.25 * fall, 0, 0, 0, 0, u < 0.2);
        }
        if (inPouch) this._part(partName, 0, 0, 0, 0, 0, 0, false);
      } else if (r.cls === "bolt") {
        const bolt = (w1, w2) =>
          this._part("bolt", -0.086 * w2, 0, 0, -1.45 * w1, 0, 0);
        const w1 = sstep(0.12, 0.2, u) * (1 - sstep(0.74, 0.8, u)),
          w2 = sstep(0.2, 0.26, u) * (1 - sstep(0.68, 0.74, u));
        bolt(w1, w2);
        const BH = mkp("hR_bolt", gi.right, T[10]);
        const CL = mkp("hR_clip", gi.right, T[11]),
          PU = mkp("hR_push", gi.right, T[12]);
        const keys = [
          [0, g.pR],
          [0.12, BH],
          [0.26, T[13].copy(BH)],
          [0.38, pouchR],
          [0.44, pouchR],
          [0.52, CL],
          [0.56, CL],
          [0.64, PU],
          [0.69, BH],
          [0.8, BH],
          [0.94, g.pR],
        ];
        path(u, keys, T[15]);
        const hw = bell(u, 0.02, 0.11, 0.84, 0.95);
        g.onR = Math.min(g.onR, 1 - hw);
        g.pR.copy(T[15]);
        g.poseR = hw > 0.5 ? "pinch" : g.poseR;
        g.qR.slerp(palmDownQ(1, _q2, -0.2), hw * 0.6);
        this._part("clip", 0, 0, 0, 0, 0, 0, u > 0.46 && u < 0.66);
      } else if (r.cls === "shell") {
        const PORT = mkp("hL_shell", gi.left, T[10]),
          PORT2 = T[11]
            .copy(PORT)
            .addScaledVector(_v5.set(0.03, 0.02, 0).applyQuaternion(P.gunQ), 1);
        const t0 = r.t;
        const inLoop = t0 > 0.3 && (r.end === undefined || t0 < r.end);
        let hp;
        if (!inLoop && t0 <= 0.3)
          hp = path(
            t0,
            [
              [0, g.pL],
              [0.3, pouchL],
            ],
            T[15],
          );
        else if (inLoop) {
          const c = (t0 - 0.3) % 0.5;
          hp = path(
            c,
            [
              [0, pouchL],
              [0.2, PORT],
              [0.28, PORT2],
              [0.36, PORT],
              [0.5, pouchL],
            ],
            T[15],
          );
          this._part("shell", 0, 0, 0, 0, 0, 0, c > 0.06 && c < 0.3);
        } else {
          const e = t0 - r.end;
          hp = path(
            e,
            [
              [0, pouchL],
              [0.3, g.pL],
            ],
            T[15],
          );
          if (r.empty) {
            const pw = bell(e, 0.35, 0.45, 0.5, 0.62);
            this._part("pump", -0.09 * pw);
          }
        }
        const hw =
          r.end === undefined
            ? sstep(0, 0.12, t0)
            : 1 - sstep(r.end + 0.15, r.end + 0.3, t0);
        g.onL = Math.min(g.onL, 1 - hw);
        g.pL.copy(hp);
        g.poseL = hw > 0.5 ? "pinch" : g.poseL;
        g.qL.slerp(palmDownQ(0, _q2, 0.2), hw * 0.5);
      } else if (r.cls === "belt") {
        const cov = sstep(0.14, 0.24, u) * (1 - sstep(0.7, 0.78, u));
        this._part("cover", 0, 0, 0, 0, 0, -1.05 * cov);
        const CV = mkp("hR_cover", gi.right, T[10]),
          BL = mkp("hL_belt", gi.left, T[11]),
          CHG = mkp("hR_charge", gi.right, T[12]);
        const CHG2 = T[13]
          .copy(CHG)
          .addScaledVector(_v5.set(-1, 0, 0).applyQuaternion(P.gunQ), 0.1);
        path(
          u,
          [
            [0, g.pR],
            [0.12, CV],
            [0.24, CV],
            [0.3, pouchR],
            [0.66, pouchR],
            [0.72, CV],
            [0.78, CV],
            [0.84, CHG],
            [0.88, CHG2],
            [0.96, g.pR],
          ],
          T[15],
        );
        const hwR = bell(u, 0.02, 0.1, 0.9, 0.97);
        g.onR = Math.min(g.onR, 1 - hwR);
        g.pR.copy(T[15]);
        g.poseR = hwR > 0.5 ? "pinch" : g.poseR;
        const BL2 = T[6].copy(BL);
        BL2.y -= 0.12;
        const lp = path(
          u,
          [
            [0, g.pL],
            [0.2, g.pL],
            [0.3, BL],
            [0.38, BL2],
            [0.48, pouchL],
            [0.56, pouchL],
            [0.64, BL],
            [0.7, BL],
            [0.8, g.pL],
          ],
          T[9],
        );
        const hwL = bell(u, 0.2, 0.28, 0.72, 0.8);
        g.onL = Math.min(g.onL, 1 - hwL);
        g.pL.copy(lp);
        g.poseL = hwL > 0.5 ? "pinch" : g.poseL;
        this._part(
          "belt",
          0,
          -0.1 * bell(u, 0.3, 0.4, 0.42, 0.44),
          0,
          0,
          0,
          0,
          !(u > 0.43 && u < 0.58),
        );
      }
    }
    // ---------------- post-shot cycling
    const c = this.cycle;
    if (c && gi && !r) {
      const t = c.t;
      if (c.type === "bolt") {
        const w1 = sstep(0.16, 0.26, t) * (1 - sstep(0.6, 0.68, t)),
          w2 = sstep(0.28, 0.4, t) * (1 - sstep(0.46, 0.57, t));
        this._part("bolt", -0.086 * w2, 0, 0, -1.45 * w1, 0, 0);
        const BH = this._markerGun("hR_bolt", T[10])
          ? gw(T[10], T[10])
          : gw(gi.right, T[10]);
        const hw = bell(t, 0.0, 0.15, 0.66, 0.82);
        g.onR = Math.min(g.onR, 1 - hw);
        g.pR.lerp(BH, hw);
        g.poseR = hw > 0.5 ? "pinch" : g.poseR;
        g.qR.slerp(palmDownQ(1, _q2, -0.3), hw * 0.5);
      } else if (c.type === "pump") {
        const pw = bell(t, 0.0, 0.14, 0.24, 0.38);
        this._part("pump", -0.09 * pw);
      }
    }
    // ---------------- actions
    const a = this.act;
    if (a) {
      const t = a.t;
      if (a.type === "knife") {
        path(
          t,
          [
            [0, g.pR],
            [0.12, this.cp(T[9], -0.24, 0.26, 0.04)],
            [0.25, this.cp(T[10], 0.02, 0.06, 0.55)],
            [0.33, this.cp(T[11], 0.24, -0.12, 0.38)],
            [0.46, this.cp(T[12], -0.1, -0.08, 0.3)],
            [0.58, g.pR],
          ],
          T[15],
        );
        g.pR.copy(T[15]);
        // blade leads: fingers point along the slash direction, palm down-inward
        const dir = _v3
          .subVectors(
            this.cp(T[13], 0.24, -0.12, 0.38),
            this.cp(T[14], -0.24, 0.26, 0.04),
          )
          .normalize();
        this._handQ(
          _q2,
          1,
          _v4
            .copy(this._left)
            .multiplyScalar(-0.3)
            .add(_v5.set(0, -0.2, 0))
            .addScaledVector(this._fwd, 0.8)
            .normalize(),
          _v6.copy(dir).negate(),
        );
        g.qR.slerp(_q2, 1 - g.onR);
      } else if (a.type === "grenade") {
        path(
          t,
          [
            [0, g.pL],
            [0.12, this.cp(T[9], 0.1, -0.12, 0.2)],
            [0.26, this.cp(T[10], 0.02, 0.06, 0.3)],
            [0.47, this.cp(T[11], 0.3, 0.34, -0.2)],
            [0.58, this.cp(T[12], 0.14, 0.38, 0.45)],
            [0.72, this.cp(T[13], -0.1, -0.08, 0.42)],
            [0.95, g.pL],
          ],
          T[15],
        );
        g.pL.copy(T[15]);
        this._handQ(
          _q2,
          0,
          _v4.set(0, 1, 0).addScaledVector(this._fwd, 0.4).normalize(),
          _v5
            .copy(this._fwd)
            .negate()
            .addScaledVector(this._left, -0.3)
            .normalize(),
        );
        g.qL.slerp(_q2, (1 - g.onL) * bell(t, 0.3, 0.45, 0.6, 0.75));
      } else if (a.type === "drink") {
        const mouth = _v3
          .copy(this.D.mouth)
          .applyQuaternion(this.Wq[B.head])
          .add(this.Wp[B.head]);
        const atMouth = T[11].copy(mouth).addScaledVector(this._fwd, 0.035 * k);
        atMouth.y -= 0.02 * k;
        path(
          t,
          [
            [0, g.pL],
            [0.25, pouchL],
            [0.34, pouchL],
            [0.62, this.cp(T[10], 0.06, 0.12, 0.28)],
            [0.78, atMouth],
            [1.45, atMouth],
            [1.65, this.cp(T[12], 0.1, 0.0, 0.3)],
            [1.85, this.cp(T[13], 0.3, -0.1, 0.35)],
            [2.1, g.pL],
          ],
          T[15],
        );
        g.pL.copy(T[15]);
        // bottle axis tilts up toward the mouth while drinking
        const tilt = bell(t, 0.62, 0.8, 1.45, 1.6);
        this._handQ(
          _q2,
          0,
          _v4
            .set(0, 0.2 + 0.7 * tilt, 0)
            .addScaledVector(this._fwd, 0.6)
            .addScaledVector(this._left, -0.4)
            .normalize(),
          _v5
            .copy(this._left)
            .negate()
            .addScaledVector(this._fwd, -0.3)
            .normalize(),
        );
        g.qL.slerp(_q2, 1 - g.onL);
      }
    }
    // reviving: left hand reaches down to the teammate
    if (this.b.kneel > 0.01 && !this.st.downed) {
      const tgt = T[14]
        .copy(this.rpos)
        .addScaledVector(this._fwd, 0.5 * k)
        .addScaledVector(this._left, 0.08 * k);
      tgt.y += 0.32 * k + 0.02 * Math.sin(this.time * 3);
      g.pL.lerp(tgt, this.b.kneel * (1 - g.onL));
      palmDownQ(0, _q2, 0.2);
      g.qL.slerp(_q2, this.b.kneel);
    }
    // free left hand while sprinting with a pistol: arm pump
    if (gi.pistol && this.b.sprint > 0.01 && g.onL > 0) {
      const ph = TAU * this.phase;
      const sw = Math.sin(ph);
      const tgt = this.cp(
        T[14],
        0.18,
        -0.12 + 0.07 * Math.max(0, sw),
        0.1 + 0.22 * sw,
      );
      const w = this.b.sprint;
      g.pL.lerp(tgt, w);
      g.onL *= 1 - w;
      g.poseL = w > 0.5 ? "fist" : g.poseL;
      this._handQ(
        _q2,
        0,
        _v4.copy(this._fwd).setY(0.3).normalize(),
        _v5.copy(this._left).negate(),
      );
      g.qL.slerp(_q2, w);
    }
  }

  // ---------------------------------------------------------------- downed pose
  _downedPose(P, dt, speed) {
    const k = this.k,
      b = this.b;
    const yaw = this.bodyYaw;
    const fwd = fwdOf(yaw, this._fwd2),
      left = leftOf(yaw, this._left2);
    const cr = sstep(0.12, 0.5, speed);
    this.crawlPh += (speed / (0.55 * k)) * TAU * dt;
    const sw = Math.sin(this.crawlPh) * cr,
      cw = Math.cos(this.crawlPh) * cr;
    const br = b.beingRev;
    P.hipsP
      .copy(this.rpos)
      .addScaledVector(fwd, (-0.05 + 0.025 * sw) * k)
      .addScaledVector(left, 0.03 * k);
    P.hipsP.y = this.rpos.y + 0.135 * k + 0.012 * Math.abs(sw);
    qYPR(P.tq[0], yaw + 0.08 * sw, -1.25, -0.2 + 0.06 * sw);
    qYPR(P.tq[1], yaw + 0.04 * sw, -1.02 + 0.12 * br, -0.24);
    qYPR(
      P.tq[2],
      yaw - 0.12 - 0.05 * sw,
      -0.78 + 0.3 * br + 0.04 * Math.sin(this.time * 2.1),
      -0.3 + 0.1 * br + 0.04 * cw,
    );
    const ap = clamp(this.aimPitch, -0.45, 0.7);
    qYPR(P.tq[3], lerp(yaw - 0.12, this.aimYaw, 0.5), -0.3, -0.12);
    qYPR(P.tq[4], this.aimYaw, -ap * 0.8 + 0.05, 0.02 + this.flinch.x * 0.1);
    this._torsoFK(P);
    // legs: left leg long, right knee up; shuffle when crawling
    const hL = _v3.copy(this.off[B.thL]).applyQuaternion(P.tq[0]).add(P.hipsP);
    const hR = _v4.copy(this.off[B.thR]).applyQuaternion(P.tq[0]).add(P.hipsP);
    const FL = P.foot[0],
      FR = P.foot[1];
    FL.p
      .copy(this.rpos)
      .addScaledVector(fwd, (0.78 + 0.08 * cw) * k)
      .addScaledVector(left, 0.19 * k);
    FL.p.y = this.rpos.y + 0.075 * k;
    qYPR(FL.q, yaw + 0.35, -1.0, 0.15);
    FL.toe.copy(FL.q);
    FL.pole
      .copy(hL)
      .addScaledVector(fwd, 0.3)
      .addScaledVector(AY, 0.35)
      .addScaledVector(left, 0.1);
    FR.p
      .copy(this.rpos)
      .addScaledVector(fwd, (0.44 - 0.12 * sw) * k)
      .addScaledVector(left, -0.1 * k);
    FR.p.y = this.rpos.y + 0.088 * k;
    qYPR(FR.q, yaw - 0.25, -0.1, 0);
    FR.toe.copy(FR.q);
    FR.pole
      .copy(hR)
      .addScaledVector(fwd, 0.2)
      .addScaledVector(AY, 0.6)
      .addScaledVector(left, -0.25);
    // left arm: propped on the elbow (or reaching up to the reviver)
    const Sl = this.Wp[B.uaL];
    const E = this._tmp[9]
      .set(Sl.x, this.rpos.y + 0.055 * k, Sl.z)
      .addScaledVector(fwd, (-0.04 + 0.03 * sw) * k)
      .addScaledVector(left, 0.05 * k);
    const HL = P.hand[0];
    HL.p
      .copy(E)
      .addScaledVector(fwd, 0.23 * k)
      .addScaledVector(left, 0.02 * k);
    HL.p.y = this.rpos.y + 0.035 * k;
    this._handQ(
      HL.q,
      0,
      _v5.copy(fwd).addScaledVector(left, -0.25).normalize(),
      _v6.set(0, -1, 0),
    );
    HL.pole.copy(E).addScaledVector(AY, -0.15);
    HL.onGun = 0;
    HL.gp = "flat";
    for (let j = 0; j < 17; j++) HL.pose[j] = HP.flat[j];
    if (br > 0.01) {
      const up = this._tmp[10]
        .copy(Sl)
        .addScaledVector(fwd, 0.32 * k)
        .addScaledVector(left, -0.05 * k);
      up.y += 0.26 * k;
      HL.p.lerp(up, br);
      this._handQ(
        _q2,
        0,
        _v5.copy(fwd).setY(0.6).normalize(),
        _v6.copy(left).negate(),
      );
      HL.q.slerp(_q2, br);
      HL.pole.lerp(
        _v5.copy(Sl).addScaledVector(AY, -0.3).addScaledVector(left, 0.2),
        br,
      );
      for (let j = 0; j < 17; j++)
        HL.pose[j] = lerp(HL.pose[j], HP.relax[j], br);
    }
    // right arm: sidearm aimed one-handed
    const gi = this.gun ? this.gun.userData.info : null;
    const HR_ = P.hand[1];
    HR_.onGun = 1;
    HR_.gp = this.time - (this.firedAt ?? -9) < 0.16 ? "gunRfire" : "gunR";
    const hpR = this._poseArr(HR_.gp, 1);
    for (let j = 0; j < 17; j++) HR_.pose[j] = hpR[j];
    const qA = qYPR(this._tq[6], this.aimYaw, -ap, 0);
    P.gunQ
      .copy(qA)
      .multiply(Q_GUN)
      .multiply(_q1.setFromAxisAngle(AZ, this.rec.x * 0.008));
    const Sr = this.Wp[B.uaR];
    if (gi) {
      const reach = gi.pistol
        ? _v5.set(0.03, -0.03, 0.44)
        : _v5.set(0.0, -0.12, 0.3);
      P.gunP
        .copy(reach.multiplyScalar(k).applyQuaternion(qA))
        .add(Sr)
        .sub(_v6.copy(gi.right).applyQuaternion(P.gunQ));
      HR_.p.copy(gi.right).applyQuaternion(P.gunQ).add(P.gunP);
    } else {
      P.gunP.copy(Sr);
      HR_.p.copy(Sr);
    }
    HR_.q.identity();
    P.clav[0] = 0;
    P.clav[1] = 0.05;
    return P;
  }

  // ---------------------------------------------------------------- IK
  _solveArm(side, grip, handQ, preset, pole, clavExtra) {
    const S = side === 0 ? "L" : "R",
      s = side === 0 ? 1 : -1;
    const Wp = this.Wp,
      Wq = this.Wq,
      off = this.off;
    const c = B["clav" + S],
      ua = B["ua" + S],
      fa = B["fa" + S],
      tw = B["tw" + S],
      hd = B["hand" + S];
    const go = this._gripOffM(side, preset, this._go || (this._go = [0, 0, 0]));
    const offW = hf(s, go[0], go[1], go[2], this._ik0).applyQuaternion(handQ);
    const W = this._ik1.copy(grip).sub(offW);
    const L1 = this.L1,
      L2 = this.L2,
      maxR = (L1 + L2) * 0.999;
    // clavicle: shrug up when the hand is high, protract when reaching
    const S0 = this._ik2.copy(off[ua]).applyQuaternion(Wq[B.chest]).add(Wp[c]);
    const reach = W.distanceTo(S0);
    const elev =
      clamp((W.y - S0.y) / (0.5 * this.k), -0.4, 1) * 0.16 + clavExtra;
    const prot = clamp((reach - maxR * 0.86) / (0.14 * this.k), 0, 1.4) * 0.3;
    Wq[c]
      .copy(Wq[B.chest])
      .multiply(_q1.setFromEuler(_e.set(0, -s * prot, s * elev, "XYZ")));
    Wp[ua].copy(off[ua]).applyQuaternion(Wq[c]).add(Wp[c]);
    const Sh = Wp[ua];
    const D = this._ik3.subVectors(W, Sh);
    let d = D.length();
    const dir = D.multiplyScalar(1 / (d || 1));
    d = clamp(d, Math.abs(L1 - L2) + 0.01, maxR);
    const a = (L1 * L1 - L2 * L2 + d * d) / (2 * d),
      h = Math.sqrt(Math.max(0, L1 * L1 - a * a));
    const pp = this._ik4.subVectors(pole, Sh);
    pp.addScaledVector(dir, -pp.dot(dir));
    if (pp.lengthSq() < 1e-8) pp.set(0, -1, 0).addScaledVector(dir, -dir.y);
    pp.normalize();
    const E = this._ik5.copy(Sh).addScaledVector(dir, a).addScaledVector(pp, h);
    const Wc = this._ik6.copy(Sh).addScaledVector(dir, d);
    const ad = s > 0 ? ADIR_L : ADIR_R;
    const ua1 = _v1.subVectors(E, Sh),
      bend = _v2.subVectors(Wc, E);
    const sec = this._ik7
      .copy(bend)
      .addScaledVector(ua1, -bend.dot(ua1) / ua1.lengthSq());
    if (sec.lengthSq() < 1e-8) sec.copy(pp).negate();
    const ua1c = this._ik8.copy(ua1),
      bendc = this._ik9.copy(bend);
    qAlign(Wq[ua], ad, AZ, ua1c, sec);
    const hinge = this._ik10.crossVectors(ua1c, sec).normalize();
    const sec2 = this._ik7.crossVectors(hinge, bendc);
    qAlign(Wq[fa], ad, AZ, bendc, sec2);
    // forearm twist toward the hand's roll
    _q2.copy(Wq[fa]).invert().multiply(handQ);
    const tdot = _q2.x * ad.x + _q2.y * ad.y + _q2.z * ad.z;
    const tau = 2 * Math.atan2(tdot, _q2.w);
    Wq[tw].copy(Wq[fa]).multiply(_q1.setFromAxisAngle(ad, wrapA(tau) * 0.6));
    Wq[hd].copy(handQ);
    Wp[fa].copy(off[fa]).applyQuaternion(Wq[ua]).add(Sh);
    Wp[tw].copy(off[tw]).applyQuaternion(Wq[fa]).add(Wp[fa]);
    Wp[hd].copy(off[hd]).applyQuaternion(Wq[tw]).add(Wp[tw]);
    return d >= maxR - 1e-4 ? W.distanceTo(Wp[hd]) : 0;
  }
  _fingers(side, handQ, pose) {
    const S = side === 0 ? "L" : "R",
      s = side === 0 ? 1 : -1,
      H = side === 0 ? HR.L : HR.R;
    const Wp = this.Wp,
      Wq = this.Wq,
      off = this.off,
      hd = B["hand" + S];
    const K = this._fk0.crossVectors(H.F, H.P).normalize();
    for (let f = 0; f < 5; f++) {
      const fn = FINGER_NAMES[f];
      const b0 = B[fn + 0 + S],
        b1 = b0 + 1,
        b2 = b0 + 2;
      if (f === 0) {
        const D = hf(
          s,
          FING.th.dir[0],
          FING.th.dir[1],
          FING.th.dir[2],
          this._fk1,
        ).normalize();
        const opp = this._fk2.crossVectors(H.T, H.P).normalize();
        const kt = this._fk3
          .crossVectors(D, _v1.copy(H.P).addScaledVector(H.T, -0.4))
          .normalize();
        Wq[b0]
          .copy(handQ)
          .multiply(_q1.setFromAxisAngle(opp, pose[0]))
          .multiply(_q2.setFromAxisAngle(H.P, (pose[16] || 0) * -s))
          .multiply(_q1.setFromAxisAngle(kt, pose[1]));
        Wq[b1].copy(Wq[b0]).multiply(_q1.setFromAxisAngle(kt, pose[2]));
        Wq[b2].copy(Wq[b1]).multiply(_q1.setFromAxisAngle(kt, pose[3]));
      } else {
        const o = 4 + (f - 1) * 3;
        Wq[b0].copy(handQ).multiply(_q1.setFromAxisAngle(K, pose[o]));
        Wq[b1].copy(Wq[b0]).multiply(_q1.setFromAxisAngle(K, pose[o + 1]));
        Wq[b2].copy(Wq[b1]).multiply(_q1.setFromAxisAngle(K, pose[o + 2]));
      }
      Wp[b0].copy(off[b0]).applyQuaternion(handQ).add(Wp[hd]);
      Wp[b1].copy(off[b1]).applyQuaternion(Wq[b0]).add(Wp[b0]);
      Wp[b2].copy(off[b2]).applyQuaternion(Wq[b1]).add(Wp[b1]);
    }
  }
  _solveLeg(side, ankle, footQ, toeQ, pole) {
    const S = side === 0 ? "L" : "R";
    const Wp = this.Wp,
      Wq = this.Wq,
      off = this.off;
    const th = B["th" + S],
      sh = B["sh" + S],
      ft = B["ft" + S],
      toe = B["toe" + S];
    Wq[th].copy(Wq[B.hips]);
    Wp[th].copy(off[th]).applyQuaternion(Wq[B.hips]).add(Wp[B.hips]);
    const Hj = Wp[th],
      L1 = this.T1,
      L2 = this.T2,
      maxR = (L1 + L2) * 0.9995;
    const D = this._ik3.subVectors(ankle, Hj);
    let d = D.length();
    const dir = D.multiplyScalar(1 / (d || 1));
    d = clamp(d, Math.abs(L1 - L2) + 0.02, maxR);
    const a = (L1 * L1 - L2 * L2 + d * d) / (2 * d),
      h = Math.sqrt(Math.max(0, L1 * L1 - a * a));
    const pp = this._ik4.subVectors(pole, Hj);
    pp.addScaledVector(dir, -pp.dot(dir));
    if (pp.lengthSq() < 1e-8) pp.copy(this._fwd);
    pp.normalize();
    const K = this._ik5.copy(Hj).addScaledVector(dir, a).addScaledVector(pp, h);
    const A = this._ik6.copy(Hj).addScaledVector(dir, d);
    const t1 = this._ik8.subVectors(K, Hj),
      t2 = this._ik9.subVectors(A, K);
    const sec = this._ik7.copy(pp);
    qAlign(Wq[th], _v1.set(0, -1, 0), AZ, t1, sec);
    const hinge = this._ik10.crossVectors(t1, sec).normalize();
    const sec2 = this._ik7.crossVectors(hinge, t2);
    qAlign(Wq[sh], _v1.set(0, -1, 0), AZ, t2, sec2);
    Wp[sh].copy(off[sh]).applyQuaternion(Wq[th]).add(Hj);
    Wp[ft].copy(off[ft]).applyQuaternion(Wq[sh]).add(Wp[sh]);
    Wq[ft].copy(footQ);
    Wq[toe].copy(toeQ);
    Wp[toe].copy(off[toe]).applyQuaternion(Wq[ft]).add(Wp[ft]);
  }

  // ---------------------------------------------------------------- final solve + write
  _solve(P, dt) {
    const Wp = this.Wp,
      Wq = this.Wq,
      k = this.k;
    this._torsoFK(P);
    for (let i = 0; i < 2; i++)
      this._solveLeg(
        i,
        P.foot[i].p,
        P.foot[i].q,
        P.foot[i].toe,
        P.foot[i].pole,
      );
    this.gunP.copy(P.gunP);
    this.gunQ.copy(P.gunQ);
    const hasGun = !!this.gun;
    for (const side of [1, 0]) {
      const H = P.hand[side];
      const on = hasGun ? clamp(H.onGun, 0, 1) : 0;
      const grip = this.gripW[side],
        q = this.handQW[side];
      grip.copy(H.p);
      q.copy(H.q);
      if (on > 0) {
        const g0 = this._gripGun(side, this._gp)
          .applyQuaternion(this.gunQ)
          .add(this.gunP);
        this._gripQ(side, this.gunQ, this._gq);
        grip.lerp(g0, on);
        q.slerp(this._gq, on);
      }
      // elbow pole: mostly "down and out", partly "forearm in line with the hand"
      const H0 = side === 0 ? HR.L : HR.R,
        s = side === 0 ? 1 : -1;
      const Fw = _v3.copy(H0.F).applyQuaternion(q);
      const pole = this._pole
        .copy(grip)
        .addScaledVector(Fw, -(this.L2 + 0.08 * k) * 0.35);
      pole.y -= 0.34 * k;
      pole
        .addScaledVector(this._left, s * 0.16 * k)
        .addScaledVector(this._fwd, -0.08 * k);
      if (side === 1) {
        pole.addScaledVector(
          this._left,
          -0.12 * k * this.b.ads * (1 - this.b.pistol),
        );
        pole.y += 0.1 * k * this.b.ads * (1 - this.b.pistol);
      }
      if (this.b.downed > 0.01 && side === 0) pole.lerp(H.pole, this.b.downed);
      if (this.b.downed > 0.01 && side === 1) {
        pole.y -= 0.1 * this.b.downed;
      }
      let err = this._solveArm(side, grip, q, H.gp, pole, P.clav[side]);
      // support hand out of reach on a long handguard: slide it back along the gun like a real shooter
      if (
        err > 0.003 &&
        side === 0 &&
        on > 0.5 &&
        this.gun &&
        !this.gun.userData.info.pistol
      ) {
        const gx = _v4.set(1, 0, 0).applyQuaternion(this.gunQ);
        for (let it = 0; it < 3 && err > 0.003; it++) {
          grip.addScaledVector(gx, -Math.min(0.2, err * 1.25));
          err = this._solveArm(side, grip, q, H.gp, pole, P.clav[side]);
        }
      }
      this.handErr[side] = err;
      this._fingers(side, q, H.pose);
    }
    // ---- write bones (root group sits at the smoothed feet position, no rotation)
    this.root.position.copy(this.rpos);
    const bones = this.bones;
    bones[0].position.copy(Wp[0]).sub(this.rpos);
    bones[0].quaternion.copy(Wq[0]);
    for (let i = 1; i < NB; i++)
      bones[i].quaternion.copy(
        _q1.copy(Wq[PARENT[i]]).invert().multiply(Wq[i]),
      );
    // ---- gun + muzzle + head
    if (this.gun) {
      this.gun.position.copy(this.gunP).sub(this.rpos);
      this.gun.quaternion.copy(this.gunQ);
      const gi = this.gun.userData.info;
      this.muzzleW.copy(gi.muzzle).applyQuaternion(this.gunQ).add(this.gunP);
    } else this.muzzleW.copy(Wp[B.handR]);
    this.headW.copy(this.D.headC).applyQuaternion(Wq[B.head]).add(Wp[B.head]);
    // ---- props in hand
    const g = this._g || {};
    const pr = this.props;
    pr.knife.visible = !!g.knife && this.b.downed < 0.5;
    pr.grenade.visible = !!g.grenade && this.b.downed < 0.5;
    pr.bottle.visible = !!g.bottle && this.b.downed < 0.5;
    if (pr.knife.visible) this._attach(pr.knife, 1, 0);
    if (pr.grenade.visible) this._attach(pr.grenade, 0, 0);
    if (pr.bottle.visible) this._attach(pr.bottle, 0, 0);
  }
  _attach(obj, side, along) {
    const H0 = side === 0 ? HR.L : HR.R;
    const q = this.Wq[side === 0 ? B.handL : B.handR];
    const s = side === 0 ? 1 : -1;
    const pose = side === 0 ? this._g.poseL : this._g.poseR;
    const go = this._gripOffM(side, pose, this._go2 || (this._go2 = [0, 0, 0]));
    const p = hf(s, go[0], go[1], go[2], _v4)
      .applyQuaternion(q)
      .add(this.Wp[side === 0 ? B.handL : B.handR]);
    // prop local +Y runs along the fist axis (pinky -> index/thumb side)
    const T = _v5.copy(H0.T).applyQuaternion(q),
      F = _v6.copy(H0.F).applyQuaternion(q);
    qFromBasis(obj.quaternion, _v1.crossVectors(T, F).normalize(), T, F);
    obj.position.copy(p).sub(this.rpos);
  }
  _animGun() {
    const f = this.flash;
    if (!this.gun) {
      f.visible = false;
      return;
    }
    const on = (this.flashT > 0 && this.b.downed < 0.99) || this.flashT > 0;
    f.visible = on;
    if (on) {
      const gi = this.gun.userData.info;
      f.position.copy(gi.muzzle);
      f.rotation.set(this.flashRoll, 0, 0);
      const s = this.flashScale * (0.7 + 0.6 * clamp(this.flashT / 0.06, 0, 1));
      f.scale.set(s, s, s);
    }
  }
  _syncGun() {
    const S = this.st;
    const want = S.weaponId || "m1911",
      up = !!S.upgraded;
    if (!this.gun) {
      this._setGun(want, up);
      return;
    }
    if (want !== this.gunId || up !== this.gunUp) {
      if (this.swapT >= 1) this.swapT = 0;
      if (this.swapT >= 0.45 || this.b.downed > 0.5) this._setGun(want, up);
    }
  }
  _setGun(id, up) {
    if (this.gun) {
      this.gun.remove(this.flash);
      this.gun.removeFromParent();
    }
    this.gun = this.mgr._gunFor(id, up);
    this.gunId = id;
    this.gunUp = up;
    if (this.gun) {
      this.root.add(this.gun);
      this.gun.add(this.flash);
      this._solveGunHands();
    }
    this.reload = null;
    this.cycle = null;
  }
}

