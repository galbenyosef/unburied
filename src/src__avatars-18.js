// src__avatars 18 — three
// Lines 6843-7175 of readable/src__avatars.pretty.js (statement-aligned).
export class AvatarManager {
  /**
   * @param {{scene: THREE.Scene, T: object, buildWeaponModel: Function, fx?: object, audio?: object,
   *          footsteps?: boolean, lights?: number}} opts
   */
  constructor({
    scene,
    T,
    buildWeaponModel,
    fx = null,
    audio = null,
    footsteps = true,
    lights = 2,
  } = {}) {
    this.scene = scene;
    this.T = T;
    this.bwm = buildWeaponModel;
    this.fx = fx;
    this.audio = audio;
    this.footsteps = footsteps;
    this.mats = makeMaterials(T);
    this.avatars = new Map();
    this._chars = [];
    this._guns = new Map();
    this._flashMat = new THREE.MeshBasicMaterial({
      map: flashTexture(),
      color: 0xffffff,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
      toneMapped: false,
      fog: false,
    });
    this._flashMatAether = this._flashMat.clone();
    this._flashMatAether.color.setHex(0x7dffa0);
    this._flashGeo = flashGeometry();
    // pooled muzzle lights: created once, never added / removed at runtime (no shader recompiles)
    this.lights = [];
    for (let i = 0; i < lights; i++) {
      const L = new THREE.PointLight(0xffb45a, 0, 7, 2);
      L.castShadow = false;
      L.name = "avatar_muzzle_light_" + i;
      L.userData = { t: 0, owner: null, peak: 0 };
      scene.add(L);
      this.lights.push(L);
    }
    const m = (n, fb) => {
      try {
        const mm = T && T.mat ? T.mat(n) : null;
        if (mm) return mm;
      } catch (e) {
        /* stub */
      }
      return new THREE.MeshStandardMaterial({
        color: fb,
        roughness: 0.5,
        metalness: 0.5,
      });
    };
    this._propMats = {
      steel: m("gun_metal", 0x444850),
      grip: m("leather", 0x4a3020),
      olive: m("metal_painted_green", 0x445032),
      brass: m("brass", 0xb08a40),
    };
    this._time = 0;
  }
  _skinMat(slot) {
    this._skins = this._skins || [];
    if (!this._skins[slot]) {
      const D = this._charData(slot),
        m = skinShader(this.mats.skin.clone());
      if (D.face) {
        m.map = D.face;
        m.needsUpdate = true;
      }
      m.name = "avatar_skin_" + slot;
      this._skins[slot] = m;
    }
    return this._skins[slot];
  }
  _charData(slot) {
    if (!this._chars[slot])
      this._chars[slot] = buildCharacter(CHARACTERS[slot]);
    return this._chars[slot];
  }
  _gunFor(id, up) {
    if (!this.bwm) return null;
    const key = id + "|" + (up ? 1 : 0);
    let tpl = this._guns.get(key);
    if (!tpl) {
      try {
        tpl = buildGunTemplate(this.bwm, this.T, id, up);
      } catch (e) {
        console.warn("[avatars] gun build failed", id, e);
        tpl = null;
      }
      this._guns.set(key, tpl);
    }
    return tpl ? cloneGun(tpl) : null;
  }
  _makeFlash() {
    const f = new THREE.Mesh(this._flashGeo, this._flashMat);
    f.visible = false;
    f.renderOrder = 10;
    f.frustumCulled = false;
    f.name = "avatar_flash";
    return f;
  }
  _makeProps() {
    const M = this._propMats;
    const root = new THREE.Group();
    root.name = "avatar_props";
    const knife = new THREE.Group();
    const blade = new THREE.Mesh(sbox(0.004, 0.17, 0.024, 8, 8, 6), M.steel);
    blade.position.set(0, 0.11, 0.004);
    knife.add(blade);
    const tip = new THREE.Mesh(new THREE.ConeGeometry(0.012, 0.04, 4), M.steel);
    tip.position.set(0, 0.215, 0.004);
    tip.scale.set(0.3, 1, 1);
    knife.add(tip);
    const handle = new THREE.Mesh(cyl(0.013, 0.012, 0.11, 8), M.grip);
    handle.position.set(0, -0.01, 0);
    knife.add(handle);
    const bottle = new THREE.Group();
    const glassMat = new THREE.MeshStandardMaterial({
      color: 0xc03020,
      roughness: 0.15,
      metalness: 0,
      transparent: true,
      opacity: 0.85,
      emissive: 0x401008,
      emissiveIntensity: 0.6,
    });
    const body = new THREE.Mesh(
      new THREE.LatheGeometry(
        [
          [0, -0.07],
          [0.028, -0.07],
          [0.03, -0.06],
          [0.03, 0.02],
          [0.012, 0.05],
          [0.011, 0.075],
          [0, 0.075],
        ].map(([a, b]) => new THREE.Vector2(a, b)),
        12,
      ),
      glassMat,
    );
    bottle.add(body);
    const cap = new THREE.Mesh(cyl(0.013, 0.013, 0.012, 8), M.brass);
    cap.position.y = 0.08;
    bottle.add(cap);
    const gren = new THREE.Group();
    const gb = new THREE.Mesh(ellip(0.029, 0.04, 0.029, 10, 8), M.olive);
    gren.add(gb);
    const fz = new THREE.Mesh(cyl(0.01, 0.012, 0.03, 8), M.steel);
    fz.position.y = 0.05;
    gren.add(fz);
    const lever = new THREE.Mesh(sbox(0.008, 0.06, 0.012, 6, 6, 4), M.steel);
    lever.position.set(0.02, 0.03, 0);
    gren.add(lever);
    for (const o of [knife, bottle, gren]) {
      o.visible = false;
      o.traverse((q) => {
        if (q.isMesh) q.castShadow = true;
      });
      root.add(o);
    }
    return {
      root,
      knife,
      bottle,
      grenade: gren,
      setBottleColor(c) {
        try {
          const col = new THREE.Color(c ?? 0xc03020);
          glassMat.color.copy(col);
          glassMat.emissive.copy(col).multiplyScalar(0.35);
        } catch (e) {
          /* ignore */
        }
      },
    };
  }
  _pulseLight(av, id) {
    if (!this.lights.length) return;
    let L =
      this.lights.find((l) => l.userData.owner === av) ||
      this.lights.reduce((a, b) => (a.userData.t < b.userData.t ? a : b));
    L.userData.owner = av;
    L.userData.t = 0.07;
    L.userData.peak =
      id === "aether" ? 9 : id === "trench" || id === "mg42" ? 14 : 10;
    L.color.setHex(id === "aether" ? 0x7dff9a : 0xffb45a);
  }

  // ---------------------------------------------------------------- public API
  add(id, { name = "", slot = 0 } = {}) {
    const ex = this.avatars.get(id);
    if (ex) {
      if ((((slot | 0) % 4) + 4) % 4 === ex.slot) {
        ex.name = name;
        return ex;
      }
      this.remove(id);
    }
    const av = new Avatar(this, id, { name, slot });
    this.avatars.set(id, av);
    return av;
  }
  remove(id) {
    const av = this.avatars.get(id);
    if (!av) return;
    for (const L of this.lights)
      if (L.userData.owner === av) {
        L.userData.owner = null;
        L.intensity = 0;
        L.userData.t = 0;
      }
    av.dispose();
    this.avatars.delete(id);
  }
  has(id) {
    return this.avatars.has(id);
  }
  setVisible(id, v) {
    const av = this.avatars.get(id);
    if (av) av.userVisible = !!v;
  }
  setState(id, s) {
    const av = this.avatars.get(id);
    if (av && s) av.setState(s);
  }
  event(id, type, data) {
    const av = this.avatars.get(id);
    if (av) av.event(type, data || {});
  }
  getMuzzle(id, out = new V3()) {
    const av = this.avatars.get(id);
    return av ? out.copy(av.muzzleW) : out.set(0, 0, 0);
  }
  getHead(id, out = new V3()) {
    const av = this.avatars.get(id);
    return av ? out.copy(av.headW) : out.set(0, 0, 0);
  }
  /** optional: build character meshes / gun LODs ahead of time to avoid a hitch when someone joins */
  prewarm(slots = [0, 1, 2, 3], weapons = []) {
    for (const s of slots) this._charData((((s | 0) % 4) + 4) % 4);
    for (const w of weapons) {
      const g = this._gunFor(w, false);
      if (g) g.traverse(() => {});
    }
  }
  update(dt, camera) {
    this._time += dt;
    let camo = false;
    for (const av of this.avatars.values()) {
      av.update(dt, camera);
      if (av.gunUp) camo = true;
    }
    if (camo && this.T && this.T.mat) {
      try {
        const m = this.T.mat("packed_camo");
        if (m && m.userData && m.userData.update) m.userData.update(this._time);
      } catch (e) {
        /* ignore */
      }
    }
    for (const L of this.lights) {
      const u = L.userData;
      if (u.t > 0 && u.owner && u.owner.root.visible) {
        u.t -= dt;
        L.position.copy(u.owner.muzzleW);
        L.intensity = u.peak * clamp(u.t / 0.07, 0, 1) ** 1.5;
      } else {
        L.intensity = 0;
        u.t = 0;
      }
    }
  }
  stats() {
    let calls = 0,
      tris = 0;
    const per = [];
    for (const av of this.avatars.values()) {
      let c = 0,
        t = 0;
      av.root.traverse((o) => {
        if (o.isMesh && o.visible && o.parent && o.parent.visible !== false) {
          let vis = true;
          for (let q = o; q; q = q.parent)
            if (!q.visible) {
              vis = false;
              break;
            }
          if (!vis) return;
          c++;
          t +=
            (o.geometry.index
              ? o.geometry.index.count
              : o.geometry.attributes.position.count) / 3;
        }
      });
      per.push({
        id: av.id,
        slot: av.slot,
        calls: c,
        tris: Math.round(t),
        gun: av.gunId,
      });
      calls += c;
      tris += t;
    }
    return { avatars: this.avatars.size, calls, tris: Math.round(tris), per };
  }
  dispose() {
    for (const id of [...this.avatars.keys()]) this.remove(id);
    for (const L of this.lights) L.removeFromParent();
  }
}

// test / debug hooks
export const _debug = {
  B,
  BONES,
  HP,
  GRIP_OFF,
  buildCharacter,
  buildGunTemplate,
  headSculpt,
};
