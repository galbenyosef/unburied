// src__weapons 16 — math
// Lines 4660-6909 of readable/src__weapons.pretty.js (statement-aligned).
export class WeaponSystem {
  constructor({ T, audio, fx, hooks } = {}) {
    this.T = T;
    this.audio = audio || { play() {} };
    this.fx = fx || {};
    this.hooks = hooks || {};
    this.mats = matSet(T, false);

    this.viewScene = new THREE.Scene();
    this.viewCamera = new THREE.PerspectiveCamera(
      50,
      typeof innerWidth !== "undefined" ? innerWidth / innerHeight : 16 / 9,
      0.01,
      20,
    );
    this.viewScene.add(this.viewCamera);
    if (T && T.envMap) {
      this.viewScene.environment = T.envMap;
      this.viewScene.environmentIntensity = 0.85;
    }
    const key = new THREE.DirectionalLight(0xffdcb0, 2.3);
    key.position.set(-0.6, 1.4, 0.6);
    const rim = new THREE.DirectionalLight(0x8fb2ff, 1.6);
    rim.position.set(1.2, 0.5, -1.4);
    const fill = new THREE.DirectionalLight(0xffe8d0, 0.5);
    fill.position.set(0.8, -0.4, 0.8);
    const hemi = new THREE.HemisphereLight(0xaab4c8, 0x2e261e, 0.9);
    this.viewScene.add(key, rim, fill, hemi);
    this.flashLight = new THREE.PointLight(0xffa850, 0, 2.5, 2);
    this.viewScene.add(this.flashLight);

    this.gunHolder = new THREE.Group();
    this.viewScene.add(this.gunHolder);
    const armMats = {
      sleeve: getMat(T, "sleeve_olive"),
      glove: getMat(T, "glove_leather"),
      skin: localMats().skin,
    };
    this.armRoot = new THREE.Group();
    this.viewScene.add(this.armRoot);
    this.handR = new Hand(this.armRoot, armMats.glove);
    this.handL = new Hand(this.armRoot, armMats.glove);
    this.armR = new Arm(this.armRoot, armMats, 1);
    this.armL = new Arm(this.armRoot, armMats, -1);
    this.setCharacter(0);

    // accessories
    this.knife = buildKnife(this.mats);
    this.knife.visible = false;
    this.viewScene.add(this.knife);
    this.grenadeVM = buildGrenade(this.mats);
    this.grenadeVM.visible = false;
    this.viewScene.add(this.grenadeVM);
    this.pinVM = null;
    this.bottle = null;

    // flash + smoke
    const tx = fxTextures();
    const fmat = (map) =>
      new THREE.MeshBasicMaterial({
        map,
        color: 0xffffff,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
        toneMapped: false,
      });
    this.flash = new THREE.Group();
    this.flash.visible = false;
    this.viewScene.add(this.flash);
    this.flashSpin = new THREE.Group();
    this.flash.add(this.flashSpin);
    this.flashMats = [fmat(tx.star), fmat(tx.petal)];
    const starG = new THREE.PlaneGeometry(0.075, 0.075);
    starG.rotateY(Math.PI / 2);
    starG.translate(0.006, 0, 0);
    this.flashStar = new THREE.Mesh(starG, this.flashMats[0]);
    this.flashSpin.add(this.flashStar);
    this.flashPetals = [];
    for (let i = 0; i < 3; i++) {
      const pg = new THREE.PlaneGeometry(0.15, 0.05);
      pg.translate(0.07, 0, 0);
      const p = new THREE.Mesh(pg, this.flashMats[1]);
      p.rotation.x = (i * Math.PI) / 3;
      this.flashSpin.add(p);
      this.flashPetals.push(p);
    }
    this.smoke = [];
    for (let i = 0; i < 12; i++) {
      const s = new THREE.Sprite(
        new THREE.SpriteMaterial({
          map: tx.smoke,
          transparent: true,
          depthWrite: false,
          opacity: 0,
          color: 0xb8b2aa,
        }),
      );
      s.visible = false;
      this.viewScene.add(s);
      this.smoke.push({ s, life: 0, max: 1, vel: new V3() });
    }
    this.smokeIdx = 0;

    // state
    this.slots = [];
    this.cur = -1;
    this.maxSlots = 2;
    this.act = null;
    this.queue = null;
    this.cooldown = 0;
    this.ads = 0;
    this.sprintW = 0;
    this.crouchW = 0;
    this.holsterV = 0;
    this.holstered = false;
    this.bobAmp = 0;
    this.bloom = 0;
    this.spreadRad = 0.03;
    // motion springs (6 axes: px,py,pz,rx,ry,rz in view space)
    this.swayS = new Spr(6);
    this.moveS = new Spr(6);
    this.stepS = new Spr(6);
    this.airS = new Spr(6);
    this.kickS = new Spr(6);
    this.heatS = new Spr(6, 1.6, 1);
    this.buzzS = new Spr(6, 16, 0.3);
    this.stowS = new Spr(6);
    this.settleS = new Spr(6, 3, 0.45);
    this.sprS = new Spr(1);
    this.crS = new Spr(1, 3, 0.9);
    this.holS = new Spr(1, 2.4, 0.85);
    this.mo = new Float32Array(6);
    this.lookRate = [0, 0];
    this.prevV = [0, 0];
    this.accF = [0, 0];
    this.lastStep = -1;
    this.sinceSprint = 10;
    this.pendingFire = 0;
    this.wantsSprintCancel = false;
    this.heat = 0;
    this.fovPunch = 0;
    this.burstIdx = 0;
    this.lastShotT = -10;
    this.ps = {};
    this._stepPh = 0;
    this._spr01 = 0;
    this._airT = 0;
    this._prevGrounded = true;
    this._prevCrouch = false;
    this.events = [];
    this.character = 0;
    this.fireT = 10;
    this.shotCount = 0;
    this.flashT = 0;
    this.perks = { quickhands: false, rapidfire: false };
    this.baseFov = 75;
    this.grenades = 2;
    this.projectiles = [];
    this.time = 0;
    this.anchL = newAnchor();
    this.anchR = newAnchor();
    this._a1 = newAnchor();
    this._a2 = newAnchor();
    this.dyn = {};
    this.viewShapes = {};
    for (const [k, v] of Object.entries(VIEW_ANCHORS))
      this.viewShapes[k] = makeShape(v.shape);
    this.shapeFist = makeShape(FIST);
    this.shapeFistL = makeShape({ ...FIST, mirror: true });
    this.shapeGren = makeShape({
      rx: 26,
      rz: 26,
      phiS: 120,
      phiE: -60,
      ys: [20, 2, -14, -28],
      fdy: 0,
      thumb: { base: [-10, 26, -30], dir: [0.8, 0.1, 0.4] },
    });
    this.shapeBottle = makeShape({
      rx: 30,
      rz: 30,
      phiS: 110,
      phiE: -50,
      ys: [26, 8, -10, -27],
      fdy: 0,
      mirror: true,
      thumb: { base: [-18, 24, -32], dir: [1, 0.2, 0.2] },
    });
    this.shapePinch = makeShape({
      rx: 6,
      rz: 6,
      phiS: 130,
      phiE: -10,
      ys: [10, -4, -18, -30],
      mirror: true,
      thumb: { base: [4, 12, -6], dir: [0.3, 1, 0.5] },
    });
    this.gunOff = new Float32Array(6);
    this._k6 = new Array(6).fill(0);
    this.visible = true;
  }

  // ---------------------------------------------------------------- inventory
  _stats(slot) {
    return weaponStats(slot.id, slot.upgraded);
  }
  get current() {
    return this.cur >= 0 ? this.slots[this.cur].id : null;
  }
  has(id) {
    return this.slots.some((s) => s.id === id);
  }

  _makeSlotModel(slot) {
    if (slot.model) {
      this.gunHolder.remove(slot.model);
    }
    const model = buildWeaponModel(slot.id, this.T, slot.upgraded);
    model.traverse((o) => {
      if (o.isMesh) {
        o.castShadow = false;
        o.receiveShadow = false;
        o.frustumCulled = false;
      }
    });
    slot.model = model;
    const mk = {};
    model.traverse((o) => {
      if (o.name && (o.userData.marker || o.userData.part)) mk[o.name] = o;
    });
    slot.mk = mk;
    model.position.set(0, 0, 0);
    model.quaternion.identity();
    model.updateMatrixWorld(true);
    const wp = (n) => (mk[n] ? mk[n].getWorldPosition(new V3()) : new V3());
    slot.sightRear = wp("sightRear");
    slot.sightFront = wp("sightFront");
    slot.shapes = {};
    for (const [name, o] of Object.entries(mk)) {
      const sd = o.userData.shape;
      if (!sd) continue;
      let trig = null;
      if (sd.trigger && mk[sd.trigger]) {
        const tw = mk[sd.trigger].getWorldPosition(new V3());
        trig = tw.applyMatrix4(
          new THREE.Matrix4().copy(o.matrixWorld).invert(),
        );
      }
      slot.shapes[name] = makeShape(sd, trig);
    }
    const cfg = VIEW[slot.id];
    slot.cfg = cfg;
    slot.qHip = new THREE.Quaternion()
      .setFromEuler(new THREE.Euler(...cfg.rot))
      .multiply(Q_Y90);
    slot.pHip = new V3(...cfg.hip);
    const pitch = Math.atan2(
      slot.sightFront.y - slot.sightRear.y,
      slot.sightFront.x - slot.sightRear.x,
    );
    slot.qAds = Q_Y90.clone().multiply(
      new THREE.Quaternion().setFromAxisAngle(new V3(0, 0, 1), -pitch),
    );
    slot.pAds = new V3(0, 0, -cfg.ads).sub(
      slot.sightRear.clone().applyQuaternion(slot.qAds),
    );
  }

  give(id, { upgraded = false } = {}) {
    if (!WEAPONS[id]) return;
    let idx = this.slots.findIndex((s) => s.id === id);
    if (idx >= 0) {
      const s = this.slots[idx];
      if (upgraded && !s.upgraded) {
        s.upgraded = true;
        this._makeSlotModel(s);
      }
      const st = this._stats(s);
      s.mag = st.magSize;
      s.reserve = st.reserve;
    } else {
      const s = { id, upgraded };
      const st = this._stats(s);
      s.mag = st.magSize;
      s.reserve = st.reserve;
      s.empty = false;
      this._makeSlotModel(s);
      if (this.slots.length < this.maxSlots) {
        this.slots.push(s);
        idx = this.slots.length - 1;
      } else {
        idx = Math.max(0, this.cur);
        const old = this.slots[idx];
        if (old.model && old.model.parent) old.model.parent.remove(old.model);
        this.slots[idx] = s;
        this.cur = -1;
      }
    }
    this._switchTo(idx, this.cur < 0);
  }

  _switchTo(idx, instant = false) {
    if (instant || this.cur < 0) {
      this._equip(idx);
      this._startRaise();
    } else if (idx !== this.cur) {
      this.act = { type: "lower", t: 0, dur: 0.26, next: idx };
      this._play("weapon_swap", 0.8);
      this._event({ type: "swap", id: this.slots[idx].id });
    } else {
      this._startRaise();
    }
  }
  _equip(idx) {
    for (const s of this.slots)
      if (s.model && s.model.parent) s.model.parent.remove(s.model);
    this.kickS.snap();
    this.buzzS.snap();
    this.heat = 0;
    this.burstIdx = 0;
    this.cur = idx;
    const s = this.slots[idx];
    this.gunHolder.add(s.model);
    const st = this._stats(s);
    const col = s.upgraded
      ? s.id === "aether"
        ? 0x9ff4ff
        : 0xd9a0ff
      : s.id === "aether"
        ? 0x9dff7a
        : 0xffffff;
    for (const m of this.flashMats) m.color.setHex(col);
    this.flashLight.color.setHex(
      s.id === "aether"
        ? s.upgraded
          ? 0x60e0ff
          : 0x70ff50
        : s.upgraded
          ? 0xc080ff
          : 0xffa850,
    );
    this.flash.scale.setScalar(s.cfg.flash);
    this.cooldown = 0;
    this.stats = st;
  }
  _startRaise() {
    this.act = {
      type: "raise",
      t: 0,
      dur: this.perks.quickhands ? 0.32 : 0.45,
    };
    this._play("weapon_raise", 0.8);
    // hand-off inertia: start from the stowed pose and spring up with a little overshoot + roll
    const H = HANDLING[this.slots[this.cur].id] || HANDLING.mp40;
    if (this.stowS.x[1] > -0.1) this.stowS.snap(STOW);
    this.stowS.kick(5, -1.2 * H.mass);
    this.stowS.kick(4, -0.5);
  }

  upgrade(id) {
    const s = this.slots.find((q) => q.id === id);
    if (!s) return;
    s.upgraded = true;
    const st = this._stats(s);
    s.mag = st.magSize;
    s.reserve = st.reserve;
    s.empty = false;
    this._makeSlotModel(s);
    if (this.slots[this.cur] === s) {
      this._equip(this.cur);
      this._startRaise();
    }
  }
  refillAll() {
    for (const s of this.slots) s.reserve = this._stats(s).reserve;
  }
  refill(id) {
    const s = this.slots.find((q) => q.id === id);
    if (!s) return false;
    s.reserve = this._stats(s).reserve;
    return true;
  }
  setPerks(p = {}) {
    Object.assign(this.perks, p);
  }
  setFov(deg) {
    this.baseFov = deg;
  }
  setGrenades(n) {
    this.grenades = n;
  }
  holster(b) {
    this.holstered = !!b;
    if (b && this.act && this.act.type === "script" && this.act.reload)
      this.act = null;
  }

  playPerkDrink(color = 0xff4030) {
    return new Promise((resolve) => {
      if (this.bottle) this.viewScene.remove(this.bottle);
      this.bottle = buildBottle(this.mats, color);
      this.bottle.visible = false;
      this.viewScene.add(this.bottle);
      this.act = { type: "drink", t: 0, dur: 2.6, resolve };
      this._event({ type: "drink", color });
    });
  }

  getState() {
    const s = this.slots[this.cur];
    const inventory = this.slots.map((q) => ({
      id: q.id,
      upgraded: !!q.upgraded,
    }));
    if (!s)
      return {
        id: null,
        name: "",
        upgraded: false,
        mag: 0,
        reserve: 0,
        magSize: 0,
        reloading: false,
        ads: 0,
        spread: 0,
        fovMul: 1,
        moveMul: 1,
        sprintBlocked: false,
        wantsSprintCancel: false,
        grenades: this.grenades,
        busy: false,
        inventory,
      };
    const st = this.stats;
    const adsE = easeInOut(this.ads);
    const reloading = !!(this.act && this.act.reload);
    const at = this.act ? this.act.type : null;
    return {
      id: s.id,
      name: st.name,
      upgraded: s.upgraded,
      mag: s.mag,
      reserve: s.reserve,
      magSize: st.magSize,
      reloading,
      ads: adsE,
      spread: clamp(this.spreadRad / 0.12, 0, 1),
      fovMul: (1 - adsE * (1 - st.adsFov)) * (1 + this.fovPunch),
      moveMul: (st.moveMul || 1) * (1 - 0.3 * adsE),
      // firing never blocks sprint any more; aiming and the hands-busy actions do
      sprintBlocked:
        adsE > 0.3 || at === "knife" || at === "grenade" || at === "drink",
      wantsSprintCancel: !!this.wantsSprintCancel,
      grenades: this.grenades,
      busy: !!this.act && at !== "cycle",
      inventory,
    };
  }

  // ---------------------------------------------------------------- co-op / lifecycle API
  _event(e) {
    if (this.events.length < 256) this.events.push(e);
  }
  /** Events since last call, for the network layer: fire/reload/knife/grenade/swap/drink/aether. */
  drainEvents() {
    const e = this.events;
    this.events = [];
    return e;
  }

  /** Full reset for an in-process restart: empty inventory, grenades 2, no actions/projectiles/recoil. */
  reset() {
    for (const q of this.slots)
      if (q.model && q.model.parent) q.model.parent.remove(q.model);
    this.slots = [];
    this.cur = -1;
    this.act = null;
    this.holstered = false;
    this.grenades = 2;
    this.cooldown = 0;
    this.pendingFire = 0;
    this.wantsSprintCancel = false;
    this._interruptReload = false;
    this._fastEnd = false;
    for (const p of this.projectiles)
      if (p.mesh && p.mesh.parent) p.mesh.parent.remove(p.mesh);
    this.projectiles = [];
    for (const sp of [
      this.swayS,
      this.moveS,
      this.stepS,
      this.airS,
      this.kickS,
      this.heatS,
      this.buzzS,
      this.stowS,
      this.settleS,
      this.sprS,
      this.crS,
      this.holS,
    ])
      sp.snap();
    this.ads = 0;
    this.sprintW = 0;
    this.holsterV = 0;
    this.bobAmp = 0;
    this.bloom = 0;
    this.heat = 0;
    this.fovPunch = 0;
    this.burstIdx = 0;
    this.lastShotT = -10;
    this.fireT = 10;
    this.sinceSprint = 10;
    this.lookRate = [0, 0];
    this.prevV = [0, 0];
    this.accF = [0, 0];
    this._lastCamPos = null;
    this._estV = null;
    this.knife.visible = false;
    this.grenadeVM.visible = false;
    if (this.bottle) this.bottle.visible = false;
    this.flash.visible = false;
    this.flashLight.intensity = 0;
    for (const p of this.smoke) {
      p.s.visible = false;
      p.life = 0;
    }
    this.events = [];
    this.armRoot.visible = false;
  }

  /** First-person sleeves/gloves for character slot 0..3 (see CONTRACT-COOP character table). */
  setCharacter(slot = 0) {
    const c = CHARACTERS[((slot % 4) + 4) % 4];
    this.character = slot;
    const mat = (spec) =>
      spec
        ? spec[1] != null
          ? getMatO(this.T, spec[0], { color: spec[1] })
          : getMat(this.T, spec[0])
        : null;
    const sleeve = mat(c.sleeve),
      glove = mat(c.glove);
    const skin = localMats().skin.clone();
    skin.color.setHex(c.skin);
    for (const arm of [this.armR, this.armL])
      arm.setStyle({ sleeve, skin, glove, rolled: c.rolled, scale: c.scale });
    for (const h of [this.handR, this.handL]) {
      h.setMaterial(glove || skin);
      h.scale = c.scale;
    }
  }

  _play(name, volume = 1, extra = {}) {
    try {
      return this.audio.play(name, { volume, ...extra });
    } catch (e) {
      return null;
    }
  }

  // ---------------------------------------------------------------- scripts
  _script(name, { speed = 1, onDone = null, reload = false } = {}) {
    const s = this.slots[this.cur];
    const sc = SCRIPTS[s.id] && SCRIPTS[s.id][name];
    if (!sc) return false;
    this.act = {
      type: "script",
      name,
      sc,
      t: 0,
      dur: sc.dur,
      speed,
      onDone,
      reload,
      committed: false,
    };
    return true;
  }

  _startReload() {
    const s = this.slots[this.cur];
    const st = this.stats;
    if (!s || s.mag >= st.magSize || s.reserve <= 0) return false;
    const speed = this.perks.quickhands ? 2 : 1;
    this._event({ type: "reload", id: s.id, empty: s.mag === 0 });
    if (s.id === "trench") {
      s.pumpNeeded = s.mag === 0;
      this._script("reload_start", {
        speed,
        reload: true,
        onDone: () => this._shellLoop(),
      });
      return true;
    }
    const empty = s.mag === 0 && SCRIPTS[s.id].reload_empty;
    this._script(empty ? "reload_empty" : "reload", {
      speed,
      reload: true,
      onDone: () => this._settle(),
    });
    this.act.onCommit = () => {
      const need = st.magSize - s.mag;
      const take = Math.min(need, s.reserve);
      s.mag += take;
      s.reserve -= take;
      if (empty || s.id === "m1911" || s.id === "mp40" || s.id === "thompson")
        s.empty = false;
      if (
        s.id === "kar98k" ||
        s.id === "stg44" ||
        s.id === "mg42" ||
        s.id === "aether"
      )
        s.empty = false;
    };
    return true;
  }
  _shellLoop() {
    const s = this.slots[this.cur];
    const st = this.stats;
    const speed = this.perks.quickhands ? 2 : 1;
    if (s.mag >= st.magSize || s.reserve <= 0 || this._interruptReload) {
      this._interruptReload = false;
      this._script(s.pumpNeeded ? "reload_end_pump" : "reload_end", {
        speed: speed * (this._fastEnd ? 1.6 : 1),
        reload: true,
        onDone: () => this._settle(),
      });
      if (s.pumpNeeded) this.act.onEject = true;
      s.pumpNeeded = false;
      this._fastEnd = false;
      return;
    }
    this._script("reload_shell", {
      speed,
      reload: true,
      onDone: () => this._shellLoop(),
    });
    this.act.onCommit = () => {
      if (s.reserve > 0) {
        s.mag++;
        s.reserve--;
      }
    };
  }

  // ---------------------------------------------------------------- main update
  update(dt, input = {}, ps = {}) {
    dt = Math.min(dt, 0.05);
    this.time += dt;
    this._psFill(dt, ps, input);
    const P = this.ps;
    if (this.cur < 0) {
      this.armRoot.visible = false;
      this._updateProjectiles(dt);
      return;
    }
    this.armRoot.visible = true;
    const s = this.slots[this.cur];
    const st = this.stats;
    const H = HANDLING[s.id] || HANDLING.mp40;
    this.cooldown -= dt;
    this.fireT += dt;

    // ---- sprint gate: no firing while sprinting; a press requests sprint cancel and fires after sprint-out
    const sprinting = P.sprint01 > 0.5;
    if (sprinting && this.sinceSprint > 0.4) this._play("gear_rattle", 0.45);
    if (sprinting) this.sinceSprint = 0;
    else this.sinceSprint += dt;
    const fireReady = !sprinting && this.sinceSprint >= H.sprintOut;
    if (input.firePressed && !fireReady && !this.holstered)
      this.pendingFire = 0.5;
    this.pendingFire = Math.max(0, this.pendingFire - dt);
    this.wantsSprintCancel =
      sprinting &&
      !!(input.fire || input.firePressed || input.ads || this.pendingFire > 0);

    // ---- inputs -> actions
    const act = this.act;
    const blocking = act && act.type !== "cycle";
    const canAct =
      !this.holstered &&
      !(
        act &&
        ["raise", "lower", "knife", "grenade", "drink"].includes(act.type)
      );
    if (input.swap && canAct && this.slots.length > 1) {
      this._switchTo((this.cur + 1) % this.slots.length);
    } else if (input.knife && canAct) {
      this._startKnife();
    } else if (input.grenade && canAct && this.grenades > 0) {
      this._startGrenade();
    } else if (input.reload && canAct && !blocking) {
      this._startReload();
    }
    // trench: firing interrupts shell loading
    if (
      this.act &&
      this.act.type === "script" &&
      s.id === "trench" &&
      (this.act.name === "reload_shell" || this.act.name === "reload_start") &&
      input.firePressed &&
      s.mag > 0
    ) {
      this._interruptReload = true;
      this._fastEnd = true;
    }

    // ---- firing
    const pend = this.pendingFire > 0;
    const trig = st.auto ? input.fire || pend : input.firePressed || pend;
    if (
      trig &&
      fireReady &&
      !this.holstered &&
      !this.act &&
      this.cooldown <= 0
    ) {
      this.pendingFire = 0;
      if (s.mag > 0) {
        // accumulate so high cyclic rates aren't quantised to the frame rate
        let n = 0;
        while (this.cooldown <= 0 && s.mag > 0 && n < 4 && !this.act) {
          this._fire();
          n++;
          if (!st.auto) break;
        }
      } else {
        this._play("dryfire", 0.7);
        this.cooldown = 0.25;
        if (s.reserve > 0) this._startReload();
      }
    }

    // ---- advance action
    this._advanceAction(dt);

    // ---- ADS (only once out of sprint)
    const adsCap = this.act
      ? this.act.type === "script"
        ? (this.act.sc.adsCap ?? 0)
        : 0
      : 1;
    const wantAds =
      input.ads &&
      !this.holstered &&
      !sprinting &&
      this.sinceSprint >= H.sprintOut * 0.6
        ? 1
        : 0;
    const adsTarget = Math.min(wantAds, adsCap);
    const adsSpeed =
      (s.id === "mg42" ? 3.2 : s.id === "kar98k" ? 4 : 5) *
      (1.15 / H.mass + 0.15);
    const prevAds = this.ads;
    this.ads =
      adsTarget > this.ads
        ? Math.min(adsTarget, this.ads + dt * adsSpeed)
        : Math.max(adsTarget, this.ads - dt * adsSpeed * 1.3);
    if (prevAds === 0 && this.ads > 0) {
      this._play("ads_in", 0.5);
      this.settleS.kick(3, -0.25);
      this.settleS.kick(2, -0.08);
    }
    if (prevAds > 0.5 && this.ads <= 0.5 && adsTarget === 0)
      this._play("ads_out", 0.4);

    this._motion(dt, input);

    // ---- spread
    const adsE = easeInOut(this.ads);
    const base = lerp(st.spread, st.adsSpread, adsE);
    this.bloom = Math.max(0, this.bloom - dt * (st.auto ? 0.09 : 0.14));
    const mv = clamp(P.hSpeed / 4.3, 0, 1.5);
    this.spreadRad =
      (base +
        0.03 * mv * (1 - 0.6 * adsE) +
        this.bloom +
        this.sprintW * 0.04 +
        (P.airborne ? 0.05 : 0)) *
      (P.crouching ? 0.8 : 1);
    this.heat = Math.max(0, this.heat - dt * (this.fireT > 0.12 ? 1.4 : 0.2));
    this.fovPunch *= Math.exp(-dt * 16);

    this._pose(dt);
    this._updateFx(dt);
    this._updateProjectiles(dt);
    const camo =
      s.upgraded && this.T && this.T.mat ? getMat(this.T, "packed_camo") : null;
    if (camo && camo.userData && typeof camo.userData.update === "function")
      camo.userData.update(this.time);
    const cam = this._cam();
    if (
      cam &&
      cam.aspect &&
      Math.abs(cam.aspect - this.viewCamera.aspect) > 1e-3
    ) {
      this.viewCamera.aspect = cam.aspect;
      this.viewCamera.updateProjectionMatrix();
    }
  }

  /** Normalise pstate; derives the phase-2 fields (velocity, stepPhase, sprint01, jump/land) if absent. */
  _psFill(dt, ps, input) {
    const P = this.ps;
    const cam = this._cam();
    let vR = ps.vRight,
      vF = ps.vFwd;
    if (vR === undefined || vF === undefined) {
      // estimate local velocity from camera motion (older player.js)
      let er = 0,
        ef = 0;
      if (cam && dt > 0) {
        cam.updateMatrixWorld();
        const p = new V3().setFromMatrixPosition(cam.matrixWorld);
        if (this._lastCamPos) {
          const d = p.clone().sub(this._lastCamPos).divideScalar(dt);
          const r = new V3(1, 0, 0).transformDirection(cam.matrixWorld);
          r.y = 0;
          r.normalize();
          const f = new V3(0, 0, -1).transformDirection(cam.matrixWorld);
          f.y = 0;
          f.normalize();
          er = d.x * r.x + d.z * r.z;
          ef = d.x * f.x + d.z * f.z;
          if (Math.hypot(er, ef) > 14) er = ef = 0; // teleport / respawn guard
        }
        this._lastCamPos = p;
      }
      if (ps.moving && Math.hypot(er, ef) < 0.2) {
        ef = (ps.speed01 ?? 0.65) * 6.6;
        er = 0;
      } // static test rigs
      const e = this._estV || (this._estV = [0, 0]);
      const k = Math.min(1, dt * 14);
      e[0] += (er - e[0]) * k;
      e[1] += (ef - e[1]) * k;
      vR = e[0];
      vF = e[1];
    }
    P.vRight = vR || 0;
    P.vFwd = vF || 0;
    P.hSpeed = Math.hypot(P.vRight, P.vFwd);
    P.moving = ps.moving ?? P.hSpeed > 0.4;
    P.speed01 = ps.speed01 ?? Math.min(1, P.hSpeed / 6.6);
    P.grounded = ps.grounded !== false;
    P.crouching = !!ps.crouching;
    P.airborne = ps.airborne ?? !P.grounded;
    P.landed = !!ps.landed;
    P.jumped = ps.jumped ?? (this._prevGrounded && !P.grounded && !P.landed);
    if (P.airborne) this._airT += dt;
    P.landImpact =
      ps.landImpact ?? (P.landed ? clamp(2.5 + this._airT * 9, 0, 11) : 0);
    if (!P.airborne) this._airT = 0;
    this._prevGrounded = P.grounded;
    if (ps.sprint01 !== undefined) P.sprint01 = ps.sprint01;
    else {
      const t = ps.sprinting && P.moving ? 1 : 0;
      this._spr01 += (t - this._spr01) * Math.min(1, dt * 10);
      P.sprint01 = this._spr01;
    }
    if (ps.stepPhase !== undefined) P.stepPhase = ps.stepPhase;
    else {
      const stride = 2 * (P.sprint01 > 0.5 ? 2.3 : P.crouching ? 1.2 : 1.8);
      if (P.grounded)
        this._stepPh = (this._stepPh + (P.hSpeed * dt) / stride) % 1;
      P.stepPhase = this._stepPh;
    }
    P.stamina01 = ps.stamina01 ?? 1;
    P.lookDX = input.lookDX ?? ps.lookDX ?? 0;
    P.lookDY = input.lookDY ?? ps.lookDY ?? 0;
  }

  /** Procedural viewmodel motion: all spring-damper driven, writes this.mo (view-space offsets). */
  _motion(dt, input) {
    const P = this.ps;
    const s = this.slots[this.cur];
    const H = HANDLING[s.id] || HANDLING.mp40;
    const m = H.mass,
      fq = H.f,
      sm = Math.sqrt(m);
    const adsE = easeInOut(this.ads);
    const nads = 1 - 0.85 * adsE;
    const o = this.mo.fill(0);
    const add = (spr, k = 1) => {
      for (let i = 0; i < 6; i++) o[i] += spr.x[i] * k;
    };
    const act = this.act;
    const special = act && ["knife", "grenade", "drink"].includes(act.type);
    const reloading = act && act.reload;

    // -- sprint weight: slightly under-damped so the gun swings into/out of the pose (~0.25 s)
    const sprT =
      special || this.holstered
        ? 0
        : P.sprint01 * (reloading ? 0.3 : 1) * (1 - adsE);
    this.sprS.set(2.3 * fq, 0.78).step(dt, [sprT]);
    const sw = clamp(this.sprS.x[0], -0.08, 1.12);
    this.sprintW = clamp(sw, 0, 1);
    const pose = SPRINT_POSE[H.cls];
    for (let i = 0; i < 6; i++) o[i] += pose[i] * sw;

    // -- crouch weight + dip on transitions
    if (P.crouching !== this._prevCrouch) {
      this.stepS.kick(1, -0.16 * sm);
      this.stepS.kick(3, -0.35);
      this._prevCrouch = P.crouching;
    }
    this.crS.set(2.6 * fq, 0.85).step(dt, [P.crouching ? 1 : 0]);
    const cw = this.crS.x[0] * nads;
    o[0] += -0.012 * cw;
    o[1] += -0.01 * cw;
    o[2] += 0.006 * cw;
    o[5] += 0.075 * cw;

    // -- stride-locked bob. stepPhase 0..1 over a full stride, footfalls at 0 and 0.5
    const spdT = P.grounded ? clamp(P.hSpeed / 4.3, 0, 1.6) : 0;
    this.bobAmp += (spdT - this.bobAmp) * Math.min(1, dt * 7);
    const A =
      this.bobAmp * nads * (P.crouching ? 0.7 : 1) * (special ? 0.4 : 1);
    const ph = P.stepPhase * TAU;
    const wB = 1 - this.sprintW,
      sB = this.sprintW;
    const bm = Math.pow(m, 0.35);
    // walk: lateral sway at stride frequency, roll toward the planted foot, low figure-8 vertical
    o[0] += Math.sin(ph) * 0.0105 * A * bm * wB;
    o[1] += Math.cos(2 * ph) * 0.0022 * A * wB;
    o[4] += Math.sin(ph) * 0.01 * A * wB;
    o[5] += Math.sin(ph) * 0.028 * A * bm * wB;
    // sprint: big stride-locked figure-8 + arm pump
    o[0] += Math.sin(ph) * 0.02 * A * bm * sB;
    o[1] += Math.cos(2 * ph) * 0.011 * A * sB;
    o[2] += Math.cos(2 * ph + 0.5) * 0.009 * A * sB;
    o[3] += Math.sin(2 * ph + 0.7) * 0.05 * A * sB;
    o[4] += Math.sin(ph) * 0.055 * A * sB;
    o[5] += Math.sin(ph + 0.3) * 0.06 * A * sB;
    // footfall impulses: vertical dip + muzzle nod + roll toward the planted foot (spring gives the overshoot)
    const stepIdx = Math.floor((P.stepPhase % 1) * 2);
    if (
      stepIdx !== this.lastStep &&
      P.grounded &&
      this.bobAmp > 0.12 &&
      this.lastStep >= 0
    ) {
      const side = stepIdx === 0 ? 1 : -1;
      const k =
        Math.min(1.4, this.bobAmp) *
        (1 + 1.1 * sB) *
        nads *
        (P.crouching ? 0.6 : 1);
      this.stepS.kick(1, -0.27 * k * sm);
      this.stepS.kick(3, -0.9 * k);
      this.stepS.kick(5, side * 0.7 * k);
      this.stepS.kick(0, side * 0.04 * k);
    }
    this.lastStep = stepIdx;
    this.stepS.set((4.6 * fq) / sm, 0.4).step(dt);
    add(this.stepS);

    // -- look sway: rotation + position lag behind the mouse, clamped, springs back with overshoot
    const k1 = Math.min(1, dt * 30);
    this.lookRate[0] += (P.lookDX / Math.max(dt, 1e-3) - this.lookRate[0]) * k1;
    this.lookRate[1] += (P.lookDY / Math.max(dt, 1e-3) - this.lookRate[1]) * k1;
    const lx = clamp(this.lookRate[0], -4000, 4000),
      ly = clamp(this.lookRate[1], -4000, 4000);
    const sws = (1 - 0.8 * adsE) * m;
    const swT = [
      clamp(-lx * 0.0000055, -0.016, 0.016) * sws,
      clamp(ly * 0.0000045, -0.012, 0.012) * sws,
      0,
      clamp(ly * 0.000032, -0.075, 0.075) * sws,
      clamp(lx * 0.00004, -0.1, 0.1) * sws,
      clamp(lx * 0.000045, -0.1, 0.1) * sws,
    ];
    this.swayS.set((2.9 * fq) / sm, 0.52).step(dt, swT);
    add(this.swayS);

    // -- movement inertia: strafe tilt + offset (opposite vRight), lean from forward acceleration
    const kA = Math.min(1, dt * 10);
    const aF = clamp((P.vFwd - this.prevV[1]) / Math.max(dt, 1e-3), -30, 30);
    const aR = clamp((P.vRight - this.prevV[0]) / Math.max(dt, 1e-3), -30, 30);
    this.accF[0] += (aR - this.accF[0]) * kA;
    this.accF[1] += (aF - this.accF[1]) * kA;
    this.prevV[0] = P.vRight;
    this.prevV[1] = P.vFwd;
    const vr = clamp(P.vRight, -7, 7),
      vf = clamp(P.vFwd, -7, 7);
    const mvT = [
      (-vr * 0.0032 - this.accF[0] * 0.0006) * m,
      -Math.abs(vf) * 0.0012 * m,
      (this.accF[1] * 0.0011 - vf * 0.0008) * m,
      -this.accF[1] * 0.0035 * m,
      vr * 0.006 * m,
      (-vr * 0.014 - this.accF[0] * 0.0018) * m,
    ];
    for (let i = 0; i < 6; i++) mvT[i] *= 1 - 0.75 * adsE;
    this.moveS.set((2.1 * fq) / sm, 0.58).step(dt, mvT);
    add(this.moveS);

    // -- air: lift & lag on takeoff, float while airborne, heavy dip + recovery on landing
    if (P.jumped) {
      this.airS.kick(1, -0.14 * m);
      this.airS.kick(3, 0.55);
      this.airS.kick(2, 0.05);
    }
    if (P.landed) {
      const im = clamp(P.landImpact, 0, 12) * nads;
      this.airS.kick(1, -im * 0.034 * m);
      this.airS.kick(3, -im * 0.17);
      this.airS.kick(2, im * 0.008);
      this.airS.kick(5, (Math.random() - 0.5) * im * 0.06);
    }
    const airT = P.airborne
      ? [0.002, 0.009 * nads, 0.004, -0.035 * nads, 0, 0.012]
      : null;
    this.airS.set((3.1 * fq) / sm, 0.42).step(dt, airT);
    add(this.airS);

    // -- idle breathing (heavier when out of breath)
    const tired = 1 + (1 - P.stamina01) * 1.4;
    const bt = this.time * (1.6 + (tired - 1) * 0.9);
    const br = Math.sin(bt),
      br2 = Math.sin(this.time * 0.9 + 1.3);
    const ib = (1 - 0.72 * adsE) * tired;
    o[1] += br * 0.0012 * ib;
    o[0] += br2 * 0.0008 * ib;
    o[3] += br * 0.004 * ib;
    o[4] += br2 * 0.003 * ib;

    // -- holster (perk drink / downed / menu)
    this.holS.set(2.4, 0.85).step(dt, [this.holstered ? 1 : 0]);
    this.holsterV = this.holS.x[0];
    o[1] += -0.3 * this.holsterV;
    o[3] += -0.8 * this.holsterV;

    // -- swap hand-off: stow spring (lowered pose -> 0 with overshoot), post-reload settle
    const lowering = act && act.type === "lower";
    this.stowS
      .set(lowering ? 4.2 : (3.0 * fq) / sm, lowering ? 0.95 : 0.55)
      .step(dt, lowering ? STOW : null);
    add(this.stowS);
    this.settleS.step(dt);
    add(this.settleS);

    // -- recoil: fast-attack kick spring, slow heat creep, MG buzz
    const R = RECOIL[s.id];
    this.kickS.set(R.f * (1 - 0.15 * adsE), R.z).step(dt);
    this.heatS
      .set(1.7, 1)
      .step(dt, [
        0,
        this.heat * 0.004,
        this.heat * 0.022 * (1 - 0.5 * adsE),
        this.heat * 0.035 * (1 - 0.6 * adsE),
        0,
        0,
      ]);
    this.buzzS.step(dt);
    add(this.kickS);
    add(this.heatS);
    add(this.buzzS);
  }

  _advanceAction(dt) {
    const a = this.act;
    if (!a) return;
    const s = this.slots[this.cur];
    const prev = a.t;
    a.t += dt * (a.speed || 1);
    if (a.type === "script") {
      const sc = a.sc;
      for (const [t, name] of sc.events || [])
        if (prev < t && a.t >= t) this._play(name, 0.9);
      if (
        sc.eject !== undefined &&
        sc.eject >= 0 &&
        prev < sc.eject &&
        a.t >= sc.eject
      )
        this._ejectShell();
      if (a.onEject && prev < 0.56 && a.t >= 0.56) this._ejectShell(true);
      if (sc.commit !== undefined && !a.committed && a.t >= sc.commit) {
        a.committed = true;
        a.onCommit && a.onCommit();
      }
      if (a.t >= a.dur) {
        this.act = null;
        if (sc.commit !== undefined && !a.committed) a.onCommit && a.onCommit();
        a.onDone && a.onDone();
      }
      return;
    }
    if (a.type === "knife") {
      if (prev < 0.07 && a.t >= 0.07) this._play("knife_swing", 0.9);
      if (prev < 0.15 && a.t >= 0.15) this._knifeHit();
    }
    if (a.type === "grenade") {
      if (prev < 0.36 && a.t >= 0.36) {
        this._play("grenade_pin", 0.9);
        a.pinT = this.time;
      }
      if (prev < 0.66 && a.t >= 0.66) this._play("grenade_throw", 0.9);
      if (prev < 0.72 && a.t >= 0.72) this._throwGrenade(a);
    }
    if (a.type === "drink") {
      if (prev < 0.9 && a.t >= 0.9) this._play("perk_drink", 0.9);
      if (prev < 2.05 && a.t >= 2.05) this._play("perk_burp", 0.7);
    }
    if (a.t >= a.dur) {
      this.act = null;
      if (a.type === "lower") {
        this._equip(a.next);
        this._startRaise();
      }
      if (a.type === "drink") {
        if (this.bottle) this.bottle.visible = false;
        a.resolve && a.resolve();
      }
      if (a.type === "knife") this.knife.visible = false;
      if (a.type === "grenade") this.grenadeVM.visible = false;
    }
  }

  // ---------------------------------------------------------------- pose / rig
  _anchor(name, out) {
    const s = this.slots[this.cur];
    const o = s.mk[name];
    if (o && s.shapes[name]) {
      out.frame.copy(o.matrixWorld);
      out.shape.set(s.shapes[name]);
      return out;
    }
    const va = VIEW_ANCHORS[name];
    if (va) {
      frameFrom(va.p, va.r, out.frame);
      out.shape.set(this.viewShapes[name]);
      return out;
    }
    const d = this.dyn[name];
    if (d) {
      out.frame.copy(d.frame);
      out.shape.set(d.shape);
      return out;
    }
    return this._anchor(
      name.endsWith("L") || name.startsWith("hL") ? "pouchL" : "pouchR",
      out,
    );
  }
  _chain(out, def, moves, t) {
    this._anchor(def, out);
    if (!moves) return out;
    for (const [t0, d, name] of moves) {
      if (t < t0) break;
      const u = easeInOut(clamp((t - t0) / d, 0, 1));
      this._anchor(name, this._a2);
      blendAnchor(this._a1, out, this._a2, u);
      out.frame.copy(this._a1.frame);
      out.shape.set(this._a1.shape);
    }
    return out;
  }

  _pose(dt) {
    const s = this.slots[this.cur];
    const st = this.stats;
    const cfg = s.cfg;
    const model = s.model;
    const adsE = easeInOut(this.ads);
    const a = this.act;
    const off = this.gunOff.fill(0);
    const addOff = (v, k = 1) => {
      for (let i = 0; i < 6; i++) off[i] += v[i] * k;
    };

    // parts: rest, then persistent state, then per-shot motion, then scripts
    for (const p of model.userData.parts) {
      p.position.copy(p.userData.restPos);
      p.rotation.copy(p.userData.restRot);
      p.visible = p.userData.restVis;
    }
    const mk = s.mk;
    if (s.empty) {
      if (s.id === "m1911" && mk.slide) mk.slide.position.x += -22;
      if ((s.id === "mp40" || s.id === "thompson") && mk.charge)
        mk.charge.position.x += s.id === "mp40" ? 130 : 120;
    }
    const cycleDur = Math.min(0.1, 60 / st.rpm);
    if (this.fireT < cycleDur && !s.empty) {
      const u = this.fireT / cycleDur;
      const pulse = u < 0.35 ? u / 0.35 : 1 - (u - 0.35) / 0.65;
      for (const [pn, ax, tr] of FIRE_PARTS[s.id] || []) {
        const p = mk[pn];
        if (!p) continue;
        if (ax < 3)
          p.position.setComponent(ax, p.position.getComponent(ax) + tr * pulse);
        else {
          const e = ["x", "y", "z"][ax - 3];
          p.rotation[e] += tr * pulse;
        }
      }
    }
    if (mk.trigger) mk.trigger.rotation.z += this.fireT < 0.06 ? -0.25 : 0;

    let movesL = null,
      movesR = null,
      tt = 0;
    if (a && a.type === "script") {
      const sc = a.sc;
      tt = a.t;
      if (sc.gun) addOff(sampleKeys(sc.gun, tt, this._k6));
      for (const [pn, keys] of Object.entries(sc.parts || {})) {
        const p = mk[pn];
        if (!p) continue;
        const v = sampleKeys(keys, tt, this._k6);
        p.position.set(
          p.userData.restPos.x + v[0],
          p.userData.restPos.y + v[1],
          p.userData.restPos.z + v[2],
        );
        p.rotation.set(
          p.userData.restRot.x + v[3],
          p.userData.restRot.y + v[4],
          p.userData.restRot.z + v[5],
        );
      }
      for (const [pn, ranges] of Object.entries(sc.vis || {})) {
        const p = mk[pn];
        if (!p) continue;
        p.visible = ranges.some(([t0, t1]) => tt >= t0 && tt < t1);
      }
      movesL = sc.L;
      movesR = sc.R;
    }
    // aether fluid glow tracks charge
    if (model.userData.aether) {
      const A = model.userData.aether;
      let f = s.mag / Math.max(1, st.magSize);
      if (a && a.type === "script" && a.name === "reload")
        f = tt < 0.4 ? f : tt < 1.58 ? 0 : clamp((tt - 1.58) / 0.3, 0, 1);
      A.fluid.emissiveIntensity =
        0.25 + 2.2 * f + 0.25 * Math.sin(this.time * 6);
      A.glow.emissiveIntensity =
        0.5 + 2.5 * f + (this.fireT < 0.12 ? 4 * (1 - this.fireT / 0.12) : 0);
    }

    // procedural actions
    const bump = (t, a0, a1, b0, b1) =>
      t < a0
        ? 0
        : t < a1
          ? easeInOut((t - a0) / (a1 - a0))
          : t < b0
            ? 1
            : t < b1
              ? 1 - easeInOut((t - b0) / (b1 - b0))
              : 0;
    if (a && a.type === "knife") {
      const k = bump(a.t, 0, 0.1, 0.36, 0.6);
      addOff([0.06, -0.09, 0.03, -0.35, -0.3, -0.5], k);
      this._knifeFrame(a.t);
      movesL = [
        [0, 0.07, "knifeL"],
        [0.42, 0.16, s.mk.hL ? "hL" : "pouchL"],
      ];
      this.knife.visible = a.t < 0.55;
    }
    if (a && a.type === "grenade") {
      const k = bump(a.t, 0, 0.2, 0.8, 1.05);
      addOff([0.03, -0.3, 0.06, -0.7, 0.1, -0.2], k);
      this._grenadeFrames(a.t);
      movesR = [
        [0.04, 0.18, "grenR"],
        [0.84, 0.18, "hR"],
      ];
      movesL = [
        [0.26, 0.1, "pinL"],
        [0.4, 0.2, "pouchL"],
        [0.84, 0.2, s.mk.hL ? "hL" : "pouchL"],
      ];
    }
    if (a && a.type === "drink") {
      const k = bump(a.t, 0, 0.3, 2.15, 2.6);
      addOff([0.02, -0.32, 0.06, -0.8, 0.1, -0.2], k);
      this._bottleFrame(a.t);
      movesL = [
        [0.12, 0.3, "bottleL"],
        [1.95, 0.3, "pouchL"],
        [2.2, 0.3, s.mk.hL ? "hL" : "pouchL"],
      ];
    }

    // ---- compose gun root transform
    const pos = tmpV.lerpVectors(s.pHip, s.pAds, adsE);
    const q = tmpQ.slerpQuaternions(s.qHip, s.qAds, adsE);
    for (let i = 0; i < 6; i++) off[i] += this.mo[i];

    const qo = new THREE.Quaternion().setFromEuler(
      tmpE.set(off[3], off[4], off[5]),
    );
    model.quaternion.copy(qo).multiply(q);
    model.position.set(pos.x + off[0], pos.y + off[1], pos.z + off[2]);
    model.updateMatrixWorld(true);

    // viewCamera slight zoom in ADS + recoil FOV punch
    const vf = 50 * (1 - 0.1 * adsE) * (1 + this.fovPunch * 0.6);
    if (Math.abs(this.viewCamera.fov - vf) > 1e-3) {
      this.viewCamera.fov = vf;
      this.viewCamera.updateProjectionMatrix();
    }

    // ---- hands + arms
    const defL = s.mk.hL ? "hL" : "pouchL";
    this._chain(this.anchR, "hR", movesR, a ? a.t : 0);
    this._chain(this.anchL, defL, movesL, a ? a.t : 0);
    this.handR.update(this.anchR.frame, this.anchR.shape);
    this.handL.update(this.anchL.frame, this.anchL.shape);
    this.armR.update(this.handR.wrist);
    this.armL.update(this.handL.wrist);

    // accessories follow hand frames (and never outlive their action)
    const at = a ? a.type : null;
    if (at !== "knife") this.knife.visible = false;
    if (at !== "grenade") this.grenadeVM.visible = false;
    if (at !== "drink" && this.bottle) this.bottle.visible = false;
    if (this.knife.visible)
      this._attach(this.knife, this.anchL.frame, [0, 0, 0]);
    if (this.grenadeVM.visible)
      this._attach(this.grenadeVM, this.anchR.frame, [-4, 4, 0]);
    if (this.bottle && this.bottle.visible)
      this._attach(this.bottle, this.anchL.frame, [0, -60, 0]);
    if (this.grenadeVM.userData.pin) {
      const pin = this.grenadeVM.userData.pin;
      if (a && a.type === "grenade" && a.t > 0.38) {
        // pin rides the left hand once pulled
        pin.visible = a.t < 0.6;
        if (!pin.userData.home) pin.userData.home = pin.position.clone();
        const inv = new THREE.Matrix4()
          .copy(this.grenadeVM.children[0].matrixWorld)
          .invert();
        const lp = new V3()
          .setFromMatrixPosition(this.anchL.frame)
          .applyMatrix4(inv);
        pin.position.set(lp.x + 14, lp.y - 42, lp.z);
      } else if (pin.userData.home) {
        pin.position.copy(pin.userData.home);
        pin.visible = true;
      }
    }
  }
  _attach(obj, frame, offMm) {
    frame.decompose(_da.p, _da.q, _da.s);
    obj.quaternion.copy(_da.q);
    obj.position
      .copy(_da.p)
      .add(new V3(...offMm).multiplyScalar(0.001).applyQuaternion(_da.q));
    obj.updateMatrixWorld(true);
  }

  // dynamic view anchors for procedural actions
  _setDyn(name, keys, t, shape) {
    const v = sampleKeys(keys, t, [0, 0, 0, 0, 0, 0]);
    if (!this.dyn[name]) this.dyn[name] = newAnchor();
    frameFrom([v[0], v[1], v[2]], [v[3], v[4], v[5]], this.dyn[name].frame);
    this.dyn[name].shape.set(shape);
  }
  /** dynamic anchor from position + Y axis (grip axis) + X axis (palm->fingers) keyframes */
  _setDynB(name, keys, t, shape) {
    const v = sampleKeys(keys, t, new Array(9).fill(0));
    if (!this.dyn[name]) this.dyn[name] = newAnchor();
    const Y = new V3(v[3], v[4], v[5]).normalize();
    const X = new V3(v[6], v[7], v[8]);
    X.addScaledVector(Y, -X.dot(Y)).normalize();
    const Z = new V3().crossVectors(X, Y);
    const m = this.dyn[name].frame.makeBasis(
      X.multiplyScalar(0.001),
      Y.multiplyScalar(0.001),
      Z.multiplyScalar(0.001),
    );
    m.setPosition(v[0], v[1], v[2]);
    this.dyn[name].shape.set(shape);
  }
  _knifeFrame(t) {
    // blade = +Y, edge/fingers = +X ; slash from upper-left to lower-right
    this._setDynB(
      "knifeL",
      [
        K(0, -0.3, -0.42, -0.25, 0.2, 0.6, -0.8, 1, -0.3, 0),
        K(0.08, -0.19, 0.0, -0.32, 0.35, 0.55, -0.75, 0.8, -0.6, 0),
        K(0.13, -0.08, -0.04, -0.37, 0.55, 0.2, -0.8, 0.55, -0.8, 0.1),
        K(0.2, 0.09, -0.15, -0.36, 0.75, -0.25, -0.62, 0.25, -0.95, 0.1),
        K(0.32, 0.15, -0.3, -0.3, 0.55, -0.55, -0.6, 0, -1, 0.1),
        K(0.6, -0.1, -0.52, -0.2, 0.2, 0.3, -0.9, 1, 0, 0),
      ],
      t,
      this.shapeFistL,
    );
  }
  _grenadeFrames(t) {
    this._setDyn(
      "grenR",
      [
        K(0, 0.2, -0.45, -0.2, 0.2, 0, 0.5),
        K(0.22, 0.09, -0.1, -0.3, 0.4, 0.4, 0.4),
        K(0.45, 0.09, -0.1, -0.3, 0.4, 0.4, 0.4),
        K(0.62, 0.2, 0.02, -0.12, 0.9, 0.2, 0.5),
        K(0.74, 0.05, -0.03, -0.5, -0.3, 0.3, 0.2),
        K(0.88, 0.1, -0.35, -0.35, -0.8, 0.2, 0.2),
        K(1.05, 0.2, -0.5, -0.3, -0.8, 0.2, 0.2),
      ],
      t,
      this.shapeGren,
    );
    this.grenadeVM.visible = t > 0.02 && t < 0.72;
    // left-hand pinch at the ring: relative to the grenade hand frame
    const gr = this.dyn.grenR.frame;
    if (!this.dyn.pinL) this.dyn.pinL = newAnchor();
    const loc = new THREE.Matrix4().compose(
      new V3(-40, 40, -30),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0.6, 1.4)),
      new V3(1, 1, 1),
    );
    this.dyn.pinL.frame.multiplyMatrices(gr, loc);
    this.dyn.pinL.shape.set(this.shapePinch);
  }
  _bottleFrame(t) {
    this._setDyn(
      "bottleL",
      [
        K(0, -0.1, -0.45, -0.28, 0.2, 0, 0.3),
        K(0.45, -0.06, -0.16, -0.28, 0.1, 0, 0.1),
        K(0.8, -0.04, -0.11, -0.23, 1.2, 0.1, 0.2),
        K(1.7, -0.025, -0.075, -0.19, 1.75, 0.1, 0.25),
        K(2.0, -0.1, -0.2, -0.2, 0.3, 0, 0.8),
        K(2.3, -0.3, -0.5, -0.2, 0.3, 0, 0.8),
      ],
      t,
      this.shapeBottle,
    );
    if (this.bottle) this.bottle.visible = t > 0.1 && t < 2.2;
  }

  // ---------------------------------------------------------------- world helpers
  _cam() {
    return this.hooks.getCamera ? this.hooks.getCamera() : null;
  }
  _world() {
    if (this.hooks.scene) return this.hooks.scene;
    const c = this._cam();
    let o = c;
    while (o && o.parent) o = o.parent;
    if (o && o.isScene) return o;
    return this.fx && this.fx.scene && this.fx.scene.isScene
      ? this.fx.scene
      : null;
  }
  /** Map a view-space point to the world so it lands on the same screen pixel at the same depth. */
  _viewToWorld(pv, out = new V3()) {
    const cam = this._cam();
    if (!cam) return out.copy(pv);
    cam.updateMatrixWorld();
    const ndc = pv.clone().project(this.viewCamera);
    const depth = -pv.z;
    const camPos = new V3().setFromMatrixPosition(cam.matrixWorld);
    const fwd = new V3(0, 0, -1).transformDirection(cam.matrixWorld);
    const dir = new V3(ndc.x, ndc.y, 0.5)
      .unproject(cam)
      .sub(camPos)
      .normalize();
    return out
      .copy(camPos)
      .addScaledVector(dir, depth / Math.max(0.05, dir.dot(fwd)));
  }
  _markerView(name) {
    const s = this.slots[this.cur];
    const o = s && s.mk[name];
    return o ? o.getWorldPosition(new V3()) : new V3(0.1, -0.1, -0.5);
  }

  // ---------------------------------------------------------------- firing
  _fire() {
    const s = this.slots[this.cur];
    const st = this.stats;
    s.mag--;
    const rpm = st.rpm * (this.perks.rapidfire ? 1.33 : 1);
    // carry sub-frame remainder only while the trigger is held continuously (no double-shot on first pull)
    const carry =
      this.fireT < (60 / rpm) * 1.5 ? Math.max(this.cooldown, -0.05) : 0;
    this.cooldown = carry + 60 / rpm;
    this.fireT = 0;
    this.shotCount++;
    this._play(st.sound, 1, { pitch: rand(0.96, 1.04) });
    if (s.upgraded) this._play("shot_upgraded", 0.7);
    // flash
    this.flashT = 0;
    this.flash.visible = true;
    this.flashSpin.rotation.x = rand(0, TAU);
    this.flashStar.scale.setScalar(rand(0.75, 1.25));
    for (const p of this.flashPetals) {
      p.scale.set(rand(0.7, 1.3), rand(0.7, 1.2), 1);
      p.visible = Math.random() > 0.15;
    }
    this.flashLight.intensity = s.id === "aether" ? 2.2 : 3.2;
    // recoil: authored per weapon
    const R = RECOIL[s.id];
    const adsE = easeInOut(this.ads);
    const gap = this.time - this.lastShotT;
    if (gap > (60 / rpm) * 2.2 + 0.12) this.burstIdx = 0;
    else this.burstIdx++;
    this.lastShotT = this.time;
    const first = this.burstIdx === 0 ? R.first : 1;
    // (1) viewmodel kick: impulses into an under-damped spring (fast attack, damped settle) - ADS is
    //     reduced and more vertical so the sights stay readable
    const w = TAU * R.f * 1.5;
    const vA = 1 - 0.4 * adsE,
      uA = 1 - 0.62 * adsE,
      sA = 1 - 0.75 * adsE;
    this.kickS.kick(2, R.back * w * vA * Math.sqrt(first));
    this.kickS.kick(1, R.y * w * uA);
    this.kickS.kick(3, R.up * w * uA * first);
    this.kickS.kick(4, rand(-1, 1) * R.side * w * sA);
    this.kickS.kick(5, rand(-1, 1) * R.roll * w * sA);
    this.kickS.kick(0, rand(-0.5, 0.5) * R.back * 0.25 * w * sA);
    if (R.buzz) {
      const bw = TAU * 16;
      this.buzzS.kick(0, rand(-1, 1) * R.buzz * bw * sA);
      this.buzzS.kick(1, rand(-1, 1) * R.buzz * bw * uA);
      this.buzzS.kick(5, rand(-1, 1) * R.buzz * 9 * bw * sA);
      this.buzzS.kick(4, rand(-1, 1) * R.buzz * 3 * bw * sA);
    }
    this.heat = Math.min(1, this.heat + R.heat);
    // (2) camera: vertical climb + seeded horizontal random-walk pattern (learnable), first-shot boost
    const pat = PATTERNS[s.id][this.burstIdx % 256];
    const camP =
      R.cam * first * (1 - 0.2 * adsE) * (this.ps.crouching ? 0.85 : 1);
    const camY = (pat + rand(-0.15, 0.15)) * R.camH * (1 - 0.55 * adsE);
    if (this.hooks.addRecoil)
      try {
        this.hooks.addRecoil(camP, camY);
      } catch (e) {}
    // (3) FOV punch + micro-shake for the heavy hitters
    this.fovPunch = Math.min(0.09, this.fovPunch + R.fov * (1 - 0.4 * adsE));
    if (R.shake && this.hooks.shake)
      try {
        this.hooks.shake(R.shake * (1 - 0.4 * adsE));
      } catch (e) {}
    this.bloom = Math.min(0.07, this.bloom + (st.auto ? 0.006 : 0.012));
    // smoke
    if (s.id !== "aether" && (!st.auto || this.shotCount % 3 === 0))
      this._spawnSmoke();
    // world muzzle flash light for others
    const muzzleV = this._markerView("muzzle");
    const muzzleW = this._viewToWorld(muzzleV);
    const cam = this._cam();
    const camPos = cam
      ? new V3().setFromMatrixPosition(cam.matrixWorld)
      : new V3();
    const fwd = cam
      ? new V3(0, 0, -1).transformDirection(cam.matrixWorld)
      : new V3(0, 0, -1);
    if (this.fx.muzzleWorld)
      try {
        this.fx.muzzleWorld(muzzleW, fwd);
      } catch (e) {}
    // brass
    if (st.shell && !st.bolt && !st.pump) this._ejectShell();
    // bolt/pump follow-up
    if (st.bolt || st.pump) {
      this._script("cycle", { speed: this.perks.rapidfire ? 1.25 : 1 });
      this.act.type = "script";
      this.act.cycle = true;
    }
    if (s.mag === 0) s.empty = true;
    // projectiles / rays
    if (st.projectile) {
      this._spawnAether(muzzleW, camPos, fwd, st, s);
      return;
    }
    const pellets = st.pellets || 1;
    const right = cam
      ? new V3(1, 0, 0).transformDirection(cam.matrixWorld)
      : new V3(1, 0, 0);
    const up = cam
      ? new V3(0, 1, 0).transformDirection(cam.matrixWorld)
      : new V3(0, 1, 0);
    const center = this._spreadDir(
      fwd,
      right,
      up,
      this.spreadRad * (pellets > 1 ? 0.3 : 1),
    );
    this._event({
      type: "fire",
      id: s.id,
      upgraded: s.upgraded,
      origin: muzzleW.clone(),
      dir: center.clone(),
    });
    for (let i = 0; i < pellets; i++) {
      const dir =
        pellets > 1
          ? this._spreadDir(center, right, up, st.pelletSpread)
          : center;
      this._ray(camPos, dir, st, s, muzzleW, i === 0);
    }
  }
  _spreadDir(fwd, right, up, cone) {
    const r = cone * Math.sqrt(Math.random()),
      th = rand(0, TAU);
    return fwd
      .clone()
      .addScaledVector(right, Math.tan(r) * Math.cos(th))
      .addScaledVector(up, Math.tan(r) * Math.sin(th))
      .normalize();
  }
  _ray(origin, dir, st, s, muzzleW, first) {
    let hit = null;
    try {
      hit = this.hooks.raycast
        ? this.hooks.raycast(origin, dir, st.range)
        : null;
    } catch (e) {
      hit = null;
    }
    const end = hit ? hit.point : origin.clone().addScaledVector(dir, st.range);
    const tr = st.class === "lmg" ? 2 : st.auto ? 3 : 0;
    if (first && tr && this.shotCount % tr === 0 && this.fx.tracer)
      try {
        this.fx.tracer(
          muzzleW.clone(),
          end.clone(),
          s.upgraded ? 0xd28cff : 0xffc27a,
        );
      } catch (e) {}
    if (!hit) return;
    if (hit.zombie) {
      const [n0, n1, mn] = st.falloff;
      const d = hit.distance ?? origin.distanceTo(hit.point);
      const fm = d <= n0 ? 1 : d >= n1 ? mn : lerp(1, mn, (d - n0) / (n1 - n0));
      let dmg = st.damage * fm * (hit.part === "head" ? st.headMul : 1);
      try {
        this.hooks.damageZombie &&
          this.hooks.damageZombie(hit.zombie, dmg, hit.part, hit.point, dir, {
            weaponId: s.id,
            upgraded: s.upgraded,
          });
      } catch (e) {
        console.warn(e);
      }
    } else {
      if (this.fx.impact)
        try {
          this.fx.impact(hit.point, hit.normal, hit.surface);
        } catch (e) {}
      const surf =
        hit.surface === "wood"
          ? "bullet_wood"
          : hit.surface === "metal"
            ? "bullet_metal"
            : "bullet_concrete";
      if (first || Math.random() < 0.3)
        this._play(surf, 0.5, { position: hit.point.clone() });
    }
    if (st.splash && s.id === "m1911") {
      try {
        this.hooks.explode &&
          this.hooks.explode(
            hit.point.clone(),
            st.splash.radius,
            st.splash.damage,
            { source: "hellfire", weaponId: s.id, upgraded: true },
          );
      } catch (e) {}
      if (this.fx.explosion)
        try {
          this.fx.explosion(hit.point.clone(), 0.3);
        } catch (e) {}
    }
  }
  _ejectShell(forcePump) {
    const s = this.slots[this.cur];
    const st = this.stats;
    if (!st.shell || !this.fx.shell) return;
    const cam = this._cam();
    if (!cam) return;
    const pv = this._markerView("eject");
    const pw = this._viewToWorld(pv);
    const right = new V3(1, 0, 0).transformDirection(cam.matrixWorld);
    const up = new V3(0, 1, 0).transformDirection(cam.matrixWorld);
    const fwd = new V3(0, 0, -1).transformDirection(cam.matrixWorld);
    const vel =
      s.id === "mg42"
        ? up.clone().multiplyScalar(-1.2).addScaledVector(right, rand(0.2, 0.6))
        : right
            .clone()
            .multiplyScalar(rand(1.6, 2.6))
            .addScaledVector(up, rand(1.2, 2.2))
            .addScaledVector(fwd, rand(-0.5, 0.1));
    try {
      this.fx.shell(pw, vel, st.shell);
    } catch (e) {}
  }
  _spawnSmoke() {
    const pv = this._markerView("muzzle");
    for (let i = 0; i < 2; i++) {
      const p = this.smoke[this.smokeIdx++ % this.smoke.length];
      p.s.position
        .copy(pv)
        .add(new V3(rand(-0.01, 0.01), rand(0, 0.01), rand(-0.01, 0.01)));
      p.vel.set(rand(-0.02, 0.03), rand(0.05, 0.1), rand(-0.02, 0.01));
      p.life = 0;
      p.max = rand(0.7, 1.3);
      p.s.visible = true;
      p.s.material.rotation = rand(0, TAU);
    }
  }
  _updateFx(dt) {
    this.flashT += dt;
    const s = this.slots[this.cur];
    if (this.flash.visible) {
      if (this.flashT > 0.035) this.flash.visible = false;
      else {
        const mv = s.mk.muzzle;
        mv.getWorldPosition(this.flash.position);
        s.model.getWorldQuaternion(this.flash.quaternion);
      }
    }
    this.flashLight.intensity *= Math.exp(-dt * 38);
    if (this.flashLight.intensity < 0.01) this.flashLight.intensity = 0;
    else this.flashLight.position.copy(this._markerView("muzzle"));
    for (const p of this.smoke) {
      if (!p.s.visible) continue;
      p.life += dt;
      const u = p.life / p.max;
      if (u >= 1) {
        p.s.visible = false;
        continue;
      }
      p.s.position.addScaledVector(p.vel, dt);
      p.s.scale.setScalar(0.03 + u * 0.09);
      p.s.material.opacity = Math.sin(u * Math.PI) * 0.35;
    }
  }

  // ---------------------------------------------------------------- knife
  /** small weight-settle after a reload finishes */
  _settle() {
    const H = HANDLING[this.slots[this.cur].id] || HANDLING.mp40;
    this.settleS.kick(1, -0.05 * H.mass);
    this.settleS.kick(3, -0.28 * H.mass);
    this.settleS.kick(5, 0.22 * H.mass);
  }
  _startKnife() {
    this._event({ type: "knife" });
    this.act = { type: "knife", t: 0, dur: 0.62 };
    this.knife.visible = true;
  }
  _knifeHit() {
    const cam = this._cam();
    if (!cam || !this.hooks.raycast) {
      this._play("knife_miss", 0.6);
      return;
    }
    const o = new V3().setFromMatrixPosition(cam.matrixWorld);
    const fwd = new V3(0, 0, -1).transformDirection(cam.matrixWorld);
    const right = new V3(1, 0, 0).transformDirection(cam.matrixWorld);
    let best = null;
    for (const a of [0, -0.18, 0.18, -0.34, 0.34]) {
      const d = fwd.clone().addScaledVector(right, Math.tan(a)).normalize();
      let h = null;
      try {
        h = this.hooks.raycast(o, d, KNIFE.range);
      } catch (e) {
        h = null;
      }
      if (
        h &&
        (!best ||
          (h.zombie && !best.zombie) ||
          (!!h.zombie === !!best.zombie && h.distance < best.distance))
      ) {
        best = h;
        best.dir = d;
      }
    }
    if (best && best.zombie) {
      this._play("knife_hit", 1);
      try {
        this.hooks.damageZombie &&
          this.hooks.damageZombie(
            best.zombie,
            KNIFE.damage,
            best.part,
            best.point,
            best.dir,
            { weaponId: "knife", melee: true },
          );
      } catch (e) {}
      if (best.distance > 1.1 && this.hooks.lunge)
        try {
          this.hooks.lunge(best.dir, best.distance - 0.9);
        } catch (e) {}
    } else if (best) {
      this._play("knife_hit", 0.5);
      if (this.fx.impact)
        try {
          this.fx.impact(best.point, best.normal, best.surface);
        } catch (e) {}
    } else this._play("knife_miss", 0.8);
  }

  // ---------------------------------------------------------------- grenades
  _startGrenade() {
    this.act = { type: "grenade", t: 0, dur: 1.05 };
    this.grenades = Math.max(0, this.grenades - 1);
  }
  _throwGrenade(a) {
    const cam = this._cam();
    const world = this._world();
    if (!cam) return;
    const pv = new V3().setFromMatrixPosition(this.grenadeVM.matrixWorld);
    const pos = this._viewToWorld(pv);
    const fwd = new V3(0, 0, -1).transformDirection(cam.matrixWorld);
    const up = new V3(0, 1, 0).transformDirection(cam.matrixWorld);
    const vel = fwd.clone().multiplyScalar(13).addScaledVector(up, 3.5);
    const mesh = buildGrenade(this.mats);
    mesh.traverse((o) => {
      if (o.isMesh) o.castShadow = true;
    });
    mesh.position.copy(pos);
    if (world) world.add(mesh);
    const cooked = a.pinT ? this.time - a.pinT : 0;
    this.projectiles.push({
      kind: "grenade",
      mesh,
      world,
      pos: pos.clone(),
      vel,
      fuse: GRENADE.fuse - cooked,
      spin: new V3(rand(-8, 8), rand(-4, 4), rand(-8, 8)),
      r: 0.04,
      rest: false,
    });
    this._event({
      type: "grenade",
      pos: pos.clone(),
      vel: vel.clone(),
      fuse: GRENADE.fuse - cooked,
    });
  }
  _spawnAether(muzzleW, camPos, fwd, st, s) {
    const world = this._world();
    // aim from the camera through the crosshair, start at the muzzle visually
    const cam = this._cam();
    const right = cam
      ? new V3(1, 0, 0).transformDirection(cam.matrixWorld)
      : new V3(1, 0, 0);
    const up = cam
      ? new V3(0, 1, 0).transformDirection(cam.matrixWorld)
      : new V3(0, 1, 0);
    const dir = this._spreadDir(fwd, right, up, this.spreadRad);
    const mesh = world
      ? this._aetherMesh(world, muzzleW, dir, s.upgraded)
      : null;
    this.projectiles.push({
      kind: "aether",
      mesh,
      world,
      pos: camPos.clone(),
      vis: muzzleW.clone(),
      dir,
      dist: 0,
      st,
      slot: { id: s.id, upgraded: s.upgraded },
    });
    this._event({
      type: "aether",
      pos: muzzleW.clone(),
      vel: dir.clone().multiplyScalar(st.projSpeed),
      upgraded: s.upgraded,
    });
    if (!world) this._updateProjectiles(0.2); // resolve instantly without visuals
  }
  _aetherMesh(world, pos, dir, upgraded) {
    const tx = fxTextures();
    const col = upgraded ? 0x80e8ff : 0x7dff5a;
    const mesh = new THREE.Group();
    const core = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: tx.glow,
        color: col,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        transparent: true,
        toneMapped: false,
      }),
    );
    core.scale.setScalar(0.35);
    mesh.add(core);
    const trailG = new THREE.CylinderGeometry(0.02, 0.05, 1.2, 8, 1, true);
    trailG.rotateX(Math.PI / 2);
    trailG.translate(0, 0, 0.6);
    const trail = new THREE.Mesh(
      trailG,
      new THREE.MeshBasicMaterial({
        color: col,
        transparent: true,
        opacity: 0.55,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        toneMapped: false,
      }),
    );
    mesh.add(trail);
    mesh.position.copy(pos);
    mesh.lookAt(pos.clone().sub(dir));
    world.add(mesh);
    return mesh;
  }

  /**
   * A teammate's projectile: visuals + bounce/impact sounds only. Never calls hooks.explode / damage.
   * opts.explodeFx (default true): render the explosion / aether burst locally when it detonates.
   */
  visualProjectile(kind, pos, vel, fuse = GRENADE.fuse, opts = {}) {
    const world = this._world();
    const p0 = new V3().copy(pos),
      v0 = new V3().copy(vel);
    const explodeFx = opts.explodeFx !== false;
    if (kind === "aether") {
      const speed = v0.length() || 55;
      const dir = v0.clone().normalize();
      const st = {
        ...weaponStats("aether", !!opts.upgraded),
        projSpeed: speed,
      };
      const mesh = world
        ? this._aetherMesh(world, p0, dir, !!opts.upgraded)
        : null;
      this.projectiles.push({
        kind: "aether",
        visual: true,
        explodeFx,
        mesh,
        world,
        pos: p0.clone(),
        vis: p0.clone(),
        dir,
        dist: 0,
        st,
        slot: { id: "aether", upgraded: !!opts.upgraded },
      });
    } else if (kind === "grenade") {
      const mesh = buildGrenade(this.mats);
      mesh.position.copy(p0);
      if (world) world.add(mesh);
      this.projectiles.push({
        kind: "grenade",
        visual: true,
        explodeFx,
        mesh,
        world,
        pos: p0.clone(),
        vel: v0,
        fuse,
        spin: new V3(rand(-8, 8), rand(-4, 4), rand(-8, 8)),
        r: 0.04,
        rest: false,
      });
    }
  }

  /** A teammate's shot: muzzle light, tracer(s), impact fx and a distance-aware positional shot sound. */
  remoteShotFx(weaponId, upgraded = false, origin, dir, hitPoint = null) {
    const st = weaponStats(weaponId, upgraded);
    if (!st || !origin) return;
    const o = new V3().copy(origin);
    const d = dir ? new V3().copy(dir).normalize() : new V3(0, 0, -1);
    const cam = this._cam();
    const dist = cam
      ? o.distanceTo(new V3().setFromMatrixPosition(cam.matrixWorld))
      : 0;
    this._play(st.sound, 1, {
      position: o.clone(),
      distance: dist,
      pitch: rand(0.96, 1.04),
    });
    if (upgraded)
      this._play("shot_upgraded", 0.6, { position: o.clone(), distance: dist });
    if (this.fx.muzzleWorld)
      try {
        this.fx.muzzleWorld(o.clone(), d.clone());
      } catch (e) {}
    if (st.projectile) return; // the aether bolt arrives separately via visualProjectile
    this._remoteShots = (this._remoteShots || 0) + 1;
    const up = Math.abs(d.y) > 0.95 ? new V3(1, 0, 0) : new V3(0, 1, 0);
    const right = new V3().crossVectors(d, up).normalize();
    const up2 = new V3().crossVectors(right, d).normalize();
    const n = st.pellets ? 3 : 1;
    for (let i = 0; i < n; i++) {
      const dd =
        i === 0 ? d : this._spreadDir(d, right, up2, st.pelletSpread || 0.05);
      let end = i === 0 && hitPoint ? new V3().copy(hitPoint) : null;
      if (!end) {
        let hit = null;
        try {
          hit = this.hooks.raycast
            ? this.hooks.raycast(
                o.clone().addScaledVector(dd, 0.2),
                dd,
                st.range,
              )
            : null;
        } catch (e) {
          hit = null;
        }
        end = hit ? hit.point.clone() : o.clone().addScaledVector(dd, st.range);
        if (hit && !hit.zombie && this.fx.impact)
          try {
            this.fx.impact(hit.point, hit.normal, hit.surface);
          } catch (e) {}
      }
      const tracer = !st.auto || st.pellets || this._remoteShots % 2 === 0;
      if (tracer && this.fx.tracer)
        try {
          this.fx.tracer(o.clone(), end, upgraded ? 0xd28cff : 0xffc27a);
        } catch (e) {}
    }
  }

  _updateProjectiles(dt) {
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i];
      let done = false;
      if (p.kind === "aether") {
        const step = p.st.projSpeed * dt;
        let hit = null;
        try {
          hit = this.hooks.raycast
            ? this.hooks.raycast(p.pos, p.dir, step)
            : null;
        } catch (e) {
          hit = null;
        }
        if (hit || p.dist + step > p.st.range) {
          const pt = hit
            ? hit.point.clone()
            : p.pos.clone().addScaledVector(p.dir, step);
          if (p.visual) {
            if (p.explodeFx) {
              if (this.fx.aetherImpact)
                try {
                  this.fx.aetherImpact(pt);
                } catch (e) {}
              this._play("aether_impact", 1, { position: pt.clone() });
            }
            done = true;
          } else if (hit && hit.zombie)
            try {
              this.hooks.damageZombie &&
                this.hooks.damageZombie(
                  hit.zombie,
                  p.st.damage,
                  hit.part,
                  pt,
                  p.dir,
                  { weaponId: "aether", upgraded: p.slot.upgraded },
                );
            } catch (e) {}
          if (!p.visual) {
            try {
              this.hooks.explode &&
                this.hooks.explode(pt, p.st.splash.radius, p.st.splash.damage, {
                  source: "aether",
                  weaponId: "aether",
                  upgraded: p.slot.upgraded,
                });
            } catch (e) {}
            this._play("aether_impact", 1, { position: pt.clone() });
          }
          done = true;
        } else {
          p.pos.addScaledVector(p.dir, step);
          p.dist += step;
          // visual converges from the muzzle onto the true line over the first metres
          p.vis.addScaledVector(p.dir, step).lerp(p.pos, Math.min(1, dt * 8));
          if (p.mesh) p.mesh.position.copy(p.vis);
        }
      } else if (p.kind === "grenade") {
        p.fuse -= dt;
        if (!p.rest) {
          p.vel.y -= 9.8 * dt;
          const step = p.vel.length() * dt;
          if (step > 1e-5) {
            const dir = p.vel.clone().normalize();
            let hit = null;
            try {
              hit = this.hooks.raycast
                ? this.hooks.raycast(p.pos, dir, step + p.r)
                : null;
            } catch (e) {
              hit = null;
            }
            if (hit && hit.normal && !hit.zombie) {
              const n = hit.normal.clone().normalize();
              p.pos.copy(hit.point).addScaledVector(n, p.r * 1.2);
              const vn = p.vel.dot(n);
              p.vel.addScaledVector(n, -1.4 * vn).multiplyScalar(0.55);
              if (Math.abs(vn) > 1.2)
                this._play("grenade_bounce", clamp(Math.abs(vn) / 8, 0.2, 1), {
                  position: p.pos.clone(),
                });
            } else if (hit && hit.zombie) {
              p.vel.multiplyScalar(-0.2);
            } else p.pos.addScaledVector(p.vel, dt);
          }
          if (p.pos.y < p.r) {
            p.pos.y = p.r;
            if (Math.abs(p.vel.y) > 1.2)
              this._play(
                "grenade_bounce",
                clamp(Math.abs(p.vel.y) / 8, 0.2, 1),
                { position: p.pos.clone() },
              );
            p.vel.y = -p.vel.y * 0.35;
            p.vel.x *= 0.65;
            p.vel.z *= 0.65;
            p.spin.multiplyScalar(0.6);
            if (p.vel.lengthSq() < 0.05) p.rest = true;
          }
          if (this.hooks.resolve)
            try {
              this.hooks.resolve(p.pos, p.r);
            } catch (e) {}
          if (p.mesh) {
            p.mesh.position.copy(p.pos);
            p.mesh.rotation.x += p.spin.x * dt;
            p.mesh.rotation.y += p.spin.y * dt;
            p.mesh.rotation.z += p.spin.z * dt;
          }
        }
        if (p.fuse <= 0) {
          if (!p.visual)
            try {
              this.hooks.explode &&
                this.hooks.explode(
                  p.pos.clone(),
                  GRENADE.radius,
                  GRENADE.damage,
                  { source: "grenade", weaponId: "grenade" },
                );
            } catch (e) {}
          else if (p.explodeFx && this.fx.explosion)
            try {
              this.fx.explosion(p.pos.clone(), 1);
            } catch (e) {}
          if (!p.visual || p.explodeFx)
            this._play("explosion", 1, { position: p.pos.clone() });
          done = true;
        }
      }
      if (done) {
        if (p.mesh && p.mesh.parent) p.mesh.parent.remove(p.mesh);
        this.projectiles.splice(i, 1);
      }
    }
  }

  // ---------------------------------------------------------------- test harness helper
  /** Freeze a pose for screenshots: pose = idle|ads|sprint|walk|crouch|reload|fire|adsfire|knife|grenade|drink|raise|cycle */
  _debugPose({ pose = "idle", t = 0, empty = false, mag } = {}) {
    const ads = pose === "ads" || pose === "adsfire";
    const inp = {
      fire: false,
      firePressed: false,
      ads,
      reload: false,
      knife: false,
      grenade: false,
      swap: false,
      lookDX: 0,
      lookDY: 0,
    };
    const moving = pose === "walk" || pose === "sprint";
    const sprint = pose === "sprint";
    const v = sprint ? 6.6 : moving ? 4.3 : 0;
    const stride = sprint ? 4.6 : 3.6;
    const ps = {
      moving,
      sprinting: sprint,
      crouching: pose === "crouch",
      grounded: true,
      speed01: v / 6.6,
      landed: false,
      time: 0,
      vRight: 0,
      vFwd: v,
      stepPhase: 0,
      airborne: false,
      jumped: false,
      landImpact: 0,
      sprint01: sprint ? 1 : 0,
      stamina01: 1,
    };
    this.act = null;
    this.time = 0;
    if (moving) {
      // run up to stride phase t (t = fraction of a full stride) so bob + footfall springs are warm
      const n = 90,
        dt = 1 / 60;
      const ph0 = (((t - (n * dt * v) / stride) % 1) + 1) % 1;
      for (let i = 0; i < n; i++) {
        ps.stepPhase = (ph0 + ((i + 1) * dt * v) / stride) % 1;
        this.update(dt, inp, ps);
      }
      return;
    }
    const step = (k) => {
      for (let i = 0; i < k; i++) this.update(1 / 60, inp, ps);
    };
    step(60);
    const s = this.slots[this.cur];
    if (empty) {
      s.mag = 0;
      s.empty = true;
    }
    if (mag !== undefined) s.mag = mag;
    if (pose === "reload") {
      if (s.mag >= this.stats.magSize)
        s.mag = Math.max(0, this.stats.magSize - 3);
      this._startReload();
    }
    if (pose === "fire" || pose === "adsfire") {
      this.cooldown = 0;
      this._fire();
    }
    if (pose === "cycle") {
      this._script("cycle");
    }
    if (pose === "knife") this._startKnife();
    if (pose === "grenade") this._startGrenade();
    if (pose === "drink") this.playPerkDrink(0x30c0ff);
    if (pose === "raise") this._startRaise();
    step(Math.round(t * 60));
    this.update(0.0001, inp, ps);
  }
}
