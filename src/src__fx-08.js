// src__fx 08 — pos
// Lines 1962-3844 of readable/src__fx.pretty.js (statement-aligned).
export class FX {
  constructor(scene, camera) {
    this.scene = scene;
    this.camera = camera;
    this.time = 0;
    this.raycast = null; // optional: (origin, dir, range) -> {point, normal} | null   (wall blood)
    this.onSound = null; // optional: (name, pos) -> void   ('shell_drop')
    this.ambient = new THREE.Color(0.012, 0.013, 0.016); // extra ambient for particles (added to scene's)
    this.root = new THREE.Group();
    this.root.name = "fx";
    scene.add(this.root);

    // shared particle lighting uniforms
    this._uCamWorld = { value: camera.matrixWorld };
    this._uAmb = { value: new THREE.Vector3() };
    this._uLP = {
      value: Array.from({ length: 8 }, () => new THREE.Vector4(0, -999, 0, 1)),
    };
    this._uLC = { value: Array.from({ length: 8 }, () => new THREE.Vector3()) };

    // textures
    const tex = (c, srgb) => {
      const t = new THREE.CanvasTexture(c);
      t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
      t.generateMipmaps = true;
      t.minFilter = THREE.LinearMipmapLinearFilter;
      t.anisotropy = 4;
      return t;
    };
    this.texAlpha = tex(buildAlphaAtlas(), false);
    this.texAdd = tex(buildAddAtlas(), false);
    const dc = buildDecalAtlas();
    this.texDecal = tex(dc.col, true);
    this.texDecalN = tex(dc.nrm, false);
    this.texDecalP = tex(dc.prp, false);
    this.texGlow = tex(glowCanvas(), false);

    // particle pools
    this.alpha = new ParticlePool(3000, this.texAlpha, false, this);
    this.add = new ParticlePool(3000, this.texAdd, true, this);
    this.root.add(this.alpha.mesh, this.add.mesh);

    this._initDecals();
    this._initRigid();
    this._initFireballs();
    this._initLights();

    this.emitters = Array.from({ length: 48 }, () => ({
      on: false,
      type: 0,
      x: 0,
      y: 0,
      z: 0,
      dx: 0,
      dy: 0,
      dz: 0,
      t: 0,
      dur: 0,
      acc: 0,
      rate: 0,
      s: 1,
    }));
    this.powerups = [];
    this._puGeos = null;
    this._puMats = null;
    this._lastBloodLand = -1;
    this._camPos = new THREE.Vector3();
    this._camFwd = new THREE.Vector3(0, 0, -1);
    this._lightScan = 0;
    this._sceneLights = [];
    this._sceneAmb = new THREE.Vector3();
    this._ensurePowerups(); // build icon geometry now so the first drop doesn't hitch
  }

  /** Compile every pooled material up front (call once after the level is built) to avoid first-use hitches. */
  prewarm(renderer) {
    const hidden = [];
    this.root.traverse((o) => {
      if (!o.visible) {
        hidden.push(o);
        o.visible = true;
      }
    });
    const tmp = [];
    for (const k of Object.keys(this._puGeos)) {
      const g = this._puGeos[k];
      const m = new THREE.Mesh(g.gold, this._puMats.gold);
      tmp.push(m);
      if (g.dark) tmp.push(new THREE.Mesh(g.dark, this._puMats.dark));
      break;
    }
    const spr = new THREE.Sprite(this._puMats.halo),
      gr = new THREE.Mesh(this._puGround, this._puMats.ground);
    tmp.push(spr, gr);
    for (const m of tmp) this.root.add(m);
    try {
      renderer.compile(this.scene, this.camera);
    } catch (e) {
      /* ignore */
    }
    for (const m of tmp) this.root.remove(m);
    for (const o of hidden) o.visible = false;
  }

  /** deterministic RNG (tests) */
  seed(n) {
    _seed = n | 0;
  }

  /* ------------------------------------------------------------ decals */
  _initDecals() {
    const cap = (this.decalCap = 176);
    this.decalRanges = { bullet: [0, 96], blood: [96, 160], big: [160, 176] };
    this.decalCursor = { bullet: 0, blood: 0, big: 0 };
    const geo = new THREE.PlaneGeometry(1, 1);
    this.aDecal = new THREE.InstancedBufferAttribute(
      new Float32Array(cap * 4),
      4,
    );
    for (let i = 0; i < cap; i++) this.aDecal.array[i * 4 + 1] = -1e6;
    geo.setAttribute("aDecal", this.aDecal);
    const mat = new THREE.MeshStandardMaterial({
      map: this.texDecal,
      normalMap: this.texDecalN,
      roughnessMap: this.texDecalP,
      metalnessMap: this.texDecalP,
      roughness: 1,
      metalness: 1,
      transparent: true,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -4,
      normalScale: new THREE.Vector2(1.3, 1.3),
    });
    const uTime = (this._uDecalTime = { value: 0 });
    mat.onBeforeCompile = (sh) => {
      sh.uniforms.uDecalTime = uTime;
      sh.vertexShader =
        "attribute vec4 aDecal;\nuniform float uDecalTime;\nvarying float vDecalA;\n" +
        sh.vertexShader.replace(
          "#include <uv_vertex>",
          `#include <uv_vertex>
      {
        float f = aDecal.x; vec2 cell = vec2(mod(f, 4.0), floor(f / 4.0 + 0.001));
        vec2 auv = vec2((cell.x + uv.x) * 0.25, 1.0 - (cell.y + 1.0 - uv.y) * 0.25);
        #ifdef USE_MAP
          vMapUv = auv;
        #endif
        #ifdef USE_NORMALMAP
          vNormalMapUv = auv;
        #endif
        #ifdef USE_ROUGHNESSMAP
          vRoughnessMapUv = auv;
        #endif
        #ifdef USE_METALNESSMAP
          vMetalnessMapUv = auv;
        #endif
        float age = uDecalTime - aDecal.y;
        vDecalA = clamp(age / 0.06, 0.0, 1.0) * (1.0 - smoothstep(aDecal.z - 4.0, aDecal.z, age));
      }`,
        );
      sh.fragmentShader =
        "varying float vDecalA;\n" +
        sh.fragmentShader.replace(
          "#include <map_fragment>",
          "#include <map_fragment>\n diffuseColor.a *= vDecalA; if (diffuseColor.a < 0.004) discard;",
        );
    };
    this.decalMesh = new THREE.InstancedMesh(geo, mat, cap);
    this.decalMesh.instanceColor = new THREE.InstancedBufferAttribute(
      new Float32Array(cap * 3).fill(1),
      3,
    );
    _m4.makeScale(0, 0, 0);
    for (let i = 0; i < cap; i++) this.decalMesh.setMatrixAt(i, _m4);
    this.decalMesh.frustumCulled = false;
    this.decalMesh.receiveShadow = true;
    this.decalMesh.renderOrder = 5;
    this.decalMesh.name = "fx.decals";
    this.root.add(this.decalMesh);
  }

  /**
   * decal(pos, normal, kind, size?)
   * kind: 'bullet' | 'bullet_<surface>' | 'blood' | 'blood_drop' | 'blood_wall' | 'scorch' | 'scorch_aether' | 'dirt'
   */
  decal(pos, normal, kind = "bullet", size) {
    let frame,
      range,
      life = 30,
      sz,
      tint = 1,
      rot = rnd() * TAU,
      off = 0.004;
    const n = normal || UP;
    switch (kind) {
      case "bullet":
      case "bullet_concrete":
        frame = DF.bullet_concrete;
        range = "bullet";
        sz = rr(0.09, 0.13);
        break;
      case "bullet_wood":
        frame = DF.bullet_wood;
        range = "bullet";
        sz = rr(0.1, 0.14);
        break;
      case "bullet_metal":
        frame = DF.bullet_metal;
        range = "bullet";
        sz = rr(0.07, 0.1);
        break;
      case "bullet_dirt":
        frame = DF.bullet_dirt;
        range = "bullet";
        sz = rr(0.12, 0.18);
        break;
      case "bullet_sandbag":
        frame = DF.bullet_sandbag;
        range = "bullet";
        sz = rr(0.11, 0.15);
        break;
      case "blood":
        frame = DF.blood0 + ((rnd() * 4) | 0);
        range = "blood";
        sz = rr(0.45, 0.95);
        tint = rr(0.75, 1.15);
        break;
      case "blood_drop":
        frame = rnd() < 0.5 ? DF.blood_drop : DF.blood0 + ((rnd() * 4) | 0);
        range = "blood";
        sz = rr(0.12, 0.26);
        tint = rr(0.8, 1.1);
        break;
      case "blood_wall":
        frame = DF.blood_wall;
        range = "blood";
        sz = rr(0.5, 0.8);
        tint = rr(0.8, 1.1);
        break;
      case "scorch":
        frame = rnd() < 0.5 ? DF.scorch0 : DF.scorch1;
        range = "big";
        sz = rr(2.6, 3.4);
        life = 45;
        off = 0.006;
        break;
      case "scorch_aether":
        frame = DF.scorch_aether;
        range = "big";
        sz = rr(0.9, 1.2);
        life = 30;
        off = 0.006;
        break;
      case "dirt":
        frame = DF.dirt;
        range = "big";
        sz = rr(1.2, 1.5);
        life = 25;
        off = 0.005;
        break;
      default:
        frame = DF.bullet_concrete;
        range = "bullet";
        sz = 0.1;
    }
    if (size) sz = size;
    const [a, b] = this.decalRanges[range];
    const i = a + (this.decalCursor[range]++ % (b - a));
    _q.setFromUnitVectors(ZAX, n);
    if (kind === "blood_wall" && Math.abs(n.y) < 0.9) {
      // align the drips with gravity: local +Y (texture top) -> world up projected on the wall
      _va.set(0, 1, 0).applyQuaternion(_q);
      _vb.set(0, 1, 0).addScaledVector(n, -n.y).normalize();
      _vc.crossVectors(_va, _vb);
      rot = Math.atan2(_vc.dot(n), _va.dot(_vb));
    }
    _q2.setFromAxisAngle(ZAX, rot);
    _q.multiply(_q2);
    _va.copy(pos).addScaledVector(n, off + (i % 7) * 0.0004);
    _m4.compose(_va, _q, _vs.set(sz, sz, 1));
    this.decalMesh.setMatrixAt(i, _m4);
    this.decalMesh.instanceMatrix.needsUpdate = true;
    const A = this.aDecal.array;
    A[i * 4] = frame;
    A[i * 4 + 1] = this.time;
    A[i * 4 + 2] = life;
    A[i * 4 + 3] = 0;
    this.aDecal.needsUpdate = true;
    const ic = this.decalMesh.instanceColor.array;
    ic[i * 3] = tint;
    ic[i * 3 + 1] = tint;
    ic[i * 3 + 2] = tint;
    this.decalMesh.instanceColor.needsUpdate = true;
  }

  _bloodLand(x, z, s) {
    if (this.time - this._lastBloodLand < 0.03 || rnd() > 0.45) return;
    this._lastBloodLand = this.time;
    this.decal(
      _vs.set(x, 0, z),
      UP,
      "blood_drop",
      rr(0.08, 0.2) * clamp(s / 0.03, 0.7, 1.6),
    );
  }

  /* ------------------------------------------------------------ rigid */
  _initRigid() {
    const brass = (this.brassMat = new THREE.MeshStandardMaterial({
      color: 0xc9a14a,
      metalness: 1,
      roughness: 0.3,
      emissive: 0x1a1206,
    }));
    const hull = new THREE.MeshStandardMaterial({
      color: 0x8e1b14,
      metalness: 0,
      roughness: 0.55,
    });
    const lathe = (pts) =>
      new THREE.LatheGeometry(
        pts.map(([r, y]) => new THREE.Vector2(r, y)),
        12,
      );
    // .45 ACP (straight wall, rim groove), 7.92 mm (bottleneck), 12 ga (brass head + red hull)
    const pistol = lathe([
      [0.0001, 0],
      [0.0059, 0],
      [0.006, 0.0012],
      [0.0051, 0.0016],
      [0.0051, 0.0026],
      [0.006, 0.003],
      [0.006, 0.0228],
      [0.0055, 0.0228],
      [0.0052, 0.019],
      [0.0001, 0.019],
    ]);
    const rifle = lathe([
      [0.0001, 0],
      [0.0059, 0],
      [0.006, 0.0012],
      [0.005, 0.0016],
      [0.005, 0.0028],
      [0.006, 0.0032],
      [0.0058, 0.044],
      [0.0046, 0.0485],
      [0.0045, 0.057],
      [0.0038, 0.057],
      [0.0036, 0.05],
      [0.0001, 0.05],
    ]);
    const shotBase = lathe([
      [0.0001, 0],
      [0.0112, 0],
      [0.0113, 0.0015],
      [0.0103, 0.0019],
      [0.0104, 0.014],
      [0.0098, 0.0145],
      [0.0001, 0.0145],
    ]);
    const shotHull = lathe([
      [0.0098, 0.013],
      [0.0102, 0.013],
      [0.0102, 0.065],
      [0.0085, 0.069],
      [0.0001, 0.069],
    ]);
    for (const g of [pistol, rifle, shotBase, shotHull])
      g.translate(
        0,
        g === pistol ? -0.0114 : g === rifle ? -0.0285 : -0.035,
        0,
      );
    const shotgun = mergeGeometries([shotBase, shotHull], true); // group 0 brass head, group 1 red hull
    this.shells = {
      pistol: new RigidPool(pistol, brass, 64, {
        radius: 0.006,
        halfLen: 0.0114,
        life: 10,
        rest: 0.35,
        name: "fx.shell.pistol",
      }),
      rifle: new RigidPool(rifle, brass, 48, {
        radius: 0.006,
        halfLen: 0.0285,
        life: 10,
        rest: 0.3,
        name: "fx.shell.rifle",
      }),
      shotgun: new RigidPool(shotgun, [brass, hull], 24, {
        radius: 0.011,
        halfLen: 0.035,
        life: 10,
        rest: 0.25,
        name: "fx.shell.shotgun",
      }),
    };
    for (const k in this.shells)
      this.shells[k].onBounce = (x, y, z, sp) => {
        if (this.onSound && sp > 1) {
          _vs.set(x, y, z);
          this.onSound("shell_drop", _vs);
        }
      };
    for (const k in this.shells) this.root.add(this.shells[k].mesh);
    // gore / rubble chunks
    const cg = new THREE.IcosahedronGeometry(0.5, 0); // polyhedra are already non-indexed (flat facets)
    const pa = cg.getAttribute("position");
    for (let i = 0; i < pa.count; i++) {
      const x = pa.getX(i),
        y = pa.getY(i),
        z = pa.getZ(i);
      const k =
        0.75 +
        0.5 *
          h2(
            Math.round(x * 10),
            Math.round(y * 10) * 3 + Math.round(z * 10),
            7,
          );
      pa.setXYZ(i, x * k, y * k * 0.7, z * k);
    }
    cg.computeVertexNormals();
    this.chunkMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.55,
      metalness: 0,
    });
    this.chunks = new RigidPool(cg, this.chunkMat, 64, {
      radius: 0.3,
      halfLen: 0.3,
      colored: true,
      life: 7,
      rest: 0.25,
      name: "fx.chunks",
    });
    this.chunks.onFly = (i, x, y, z, vx, vy, vz) => {
      if (this.chunks.kind[i] === 1 && rnd() < 0.5) {
        const o = this.alpha.emit(
          x,
          y,
          z,
          vx * 0.2,
          vy * 0.2,
          vz * 0.2,
          rr(0.6, 1.2),
          rr(0.012, 0.022),
          0.01,
          6 + M_STRETCH,
        );
        this.alpha.col(o, BLOOD_R, BLOOD_G, BLOOD_B, 1);
        this.alpha.phys(o, 9.8, 0.3, STICK);
        this.alpha.d[o + STR] = 0.02;
        this.alpha.d[o + EVT] = 1;
      }
    };
    this.root.add(this.chunks.mesh);
  }

  shell(pos, vel, kind = "pistol") {
    const pool = this.shells[kind] || this.shells.pistol;
    const i = pool.spawn(pos, vel, 1);
    // spin mostly end-over-end
    pool.w[i * 3] = rr(-30, 30);
    pool.w[i * 3 + 1] = rr(-6, 6);
    pool.w[i * 3 + 2] = rr(-30, 30);
  }

  /* ---------------------------------------------------------- fireball */
  _initFireballs() {
    this.fireballs = [];
    const geo = new THREE.IcosahedronGeometry(1, 20);
    for (let i = 0; i < 3; i++) {
      const m = new THREE.Mesh(geo, makeFireballMaterial());
      m.visible = false;
      m.frustumCulled = false;
      m.renderOrder = 11;
      this.root.add(m);
      this.fireballs.push({
        mesh: m,
        t: 0,
        dur: 0,
        scale: 1,
        on: false,
        x: 0,
        y: 0,
        z: 0,
      });
    }
  }

  /* ------------------------------------------------------------ lights */
  _initLights() {
    this.lights = [];
    for (let i = 0; i < LIGHT_POOL; i++) {
      const L = new THREE.PointLight(0xffffff, 0, 16, 2);
      L.castShadow = false;
      L.name = "fx.light";
      this.root.add(L);
      this.lights.push({
        L,
        t: 0,
        dur: 0,
        peak: 0,
        flick: 0,
        on: false,
        shape: 0,
      });
    }
  }
  _pulse(pos, r, g, b, peak, dur, flick = 0, shape = 0, range = 16) {
    let best = this.lights[0],
      bestLeft = 1e9;
    for (const s of this.lights) {
      if (!s.on) {
        best = s;
        bestLeft = -1;
        break;
      }
      const left = (s.dur - s.t) * s.peak;
      if (left < bestLeft) {
        bestLeft = left;
        best = s;
      }
    }
    best.on = true;
    best.t = 0;
    best.dur = dur;
    best.peak = peak;
    best.flick = flick;
    best.shape = shape;
    best.L.position.copy(pos);
    best.L.color.setRGB(r, g, b);
    best.L.distance = range;
  }

  /* ------------------------------------------------------------ emitters */
  _emitter(type, pos, dur, rate, dir, s = 1) {
    let e = null;
    for (const x of this.emitters)
      if (!x.on) {
        e = x;
        break;
      }
    if (!e) return null;
    e.on = true;
    e.type = type;
    e.x = pos.x;
    e.y = pos.y;
    e.z = pos.z;
    e.t = 0;
    e.dur = dur;
    e.rate = rate;
    e.acc = 0;
    e.s = s;
    if (dir) {
      e.dx = dir.x;
      e.dy = dir.y;
      e.dz = dir.z;
    } else {
      e.dx = 0;
      e.dy = 1;
      e.dz = 0;
    }
    return e;
  }

  /* ============================================================ EFFECTS */

  blood(pos, dir, amount = 1) {
    const A = this.alpha,
      am = clamp(amount, 0.2, 3);
    _va.copy(dir || UP);
    if (_va.lengthSq() < 1e-6) _va.set(0, 0, 1);
    _va.normalize();
    const dx = _va.x,
      dy = _va.y,
      dz = _va.z;
    // droplet spray cone
    const nd = Math.round(26 * am);
    for (let i = 0; i < nd; i++) {
      const sp = rr(0.8, 3.8) * (0.75 + 0.25 * am);
      const cx = dx + rr(-0.45, 0.45),
        cy = dy + rr(-0.2, 0.6),
        cz = dz + rr(-0.45, 0.45);
      const s = rr(0.008, 0.028);
      const o = A.emit(
        pos.x,
        pos.y,
        pos.z,
        cx * sp,
        cy * sp,
        cz * sp,
        rr(0.7, 1.6),
        s,
        s * 0.85,
        6 + M_STRETCH,
      );
      A.col(o, BLOOD_R * rr(0.7, 1.2), BLOOD_G, BLOOD_B, 1);
      A.phys(o, 9.8, rr(0.2, 1.2), STICK);
      A.fade(o, 0.0, 0.85);
      A.d[o + STR] = 0.012;
      A.d[o + EVT] = 1;
    }
    // heavier clumps
    for (let i = 0; i < Math.round(4 * am); i++) {
      const sp = rr(1, 3);
      const o = A.emit(
        pos.x,
        pos.y,
        pos.z,
        (dx + rr(-0.3, 0.3)) * sp,
        (dy + rr(0, 0.6)) * sp,
        (dz + rr(-0.3, 0.3)) * sp,
        rr(0.5, 1.0),
        rr(0.05, 0.09),
        0.08,
        10,
      );
      A.col(o, BLOOD_R * 0.9, BLOOD_G, BLOOD_B, 1);
      A.phys(o, 9.8, 0.5, STICK);
      A.fade(o, 0, 0.7);
      A.d[o + SPIN] = rr(-4, 4);
      A.d[o + EVT] = 1;
    }
    // mist
    for (let i = 0; i < Math.round(5 * am); i++) {
      const sp = rr(0.4, 1.6);
      const o = A.emit(
        pos.x + rr(-0.05, 0.05),
        pos.y + rr(-0.05, 0.05),
        pos.z + rr(-0.05, 0.05),
        (dx + rr(-0.5, 0.5)) * sp,
        (dy + rr(-0.2, 0.5)) * sp,
        (dz + rr(-0.5, 0.5)) * sp,
        rr(0.5, 1.0),
        rr(0.12, 0.22),
        rr(0.5, 0.85) * (0.7 + 0.3 * am),
        5,
      );
      A.col(o, 0.1, 0.02, 0.016, rr(0.3, 0.5));
      A.phys(o, 0.3, 3.2);
      A.fade(o, 0.06, 0.15);
      A.d[o + SPIN] = rr(-1, 1);
      A.d[o + SPOW] = 2.5;
      A.d[o + SOFT] = 0.15;
    }
    // drips off the wound
    this._emitter(3, pos, 0.5 * am, 10, null, am);
    // splat on floor below / ahead
    if (rnd() < 0.55 * am && pos.y < 2.2) {
      _vb.set(pos.x + dx * rr(0.2, 0.8), 0, pos.z + dz * rr(0.2, 0.8));
      this.decal(_vb, UP, "blood", rr(0.4, 0.8) * (0.7 + 0.3 * am));
    }
    if (this.raycast && rnd() < 0.6 * am) {
      const hit = this.raycast(pos, _va, 2.6);
      if (hit && hit.normal && Math.abs(hit.normal.y) < 0.7)
        this.decal(hit.point, hit.normal, "blood_wall");
    }
  }

  impact(pos, normal, surface = "concrete") {
    const A = this.alpha,
      D = this.add;
    const n = normal || UP;
    const nx = n.x,
      ny = n.y,
      nz = n.z;
    const x = pos.x + nx * 0.01,
      y = pos.y + ny * 0.01,
      z = pos.z + nz * 0.01;
    const burst = (r, g, b, a, sz) => {
      // instant fast-expanding puff so the hit reads on frame 1
      for (let k = 0; k < 2; k++) {
        const o = A.emit(
          x + nx * 0.03,
          y + ny * 0.03,
          z + nz * 0.03,
          nx * rr(1.5, 3),
          ny * rr(1.5, 3),
          nz * rr(1.5, 3),
          rr(0.35, 0.55),
          sz * 0.4,
          sz * rr(1.1, 1.5),
          4 + k * 8,
        );
        A.col(o, r * 0.6, g * 0.6, b * 0.6, a * 0.6);
        A.phys(o, 0, 7);
        A.d[o + SPOW] = 4;
        A.fade(o, 0, 0.15);
        A.d[o + SPIN] = rr(-2, 2);
      }
    };
    const hemi = (sp, spread) => {
      _vc
        .set(
          nx + rr(-spread, spread),
          ny + rr(-spread, spread),
          nz + rr(-spread, spread),
        )
        .normalize()
        .multiplyScalar(sp);
      return _vc;
    };
    switch (surface) {
      case "flesh":
        this.blood(pos, n, 0.6);
        return;
      case "metal": {
        for (let i = 0; i < 16; i++) {
          const v = hemi(rr(3, 10), 0.9);
          const o = D.emit(
            x,
            y,
            z,
            v.x,
            v.y,
            v.z,
            rr(0.18, 0.6),
            rr(0.007, 0.012),
            0.005,
            1 + M_STRETCH,
          );
          D.col(o, 1, 1, 1, 1);
          D.d[o + RAMP] = 2;
          D.phys(o, 9.8, 1.2, 0.35);
          D.d[o + STR] = 0.03;
          D.fade(o, 0, 0.5);
          D.d[o + EM] = 0.5;
        }
        let o = D.emit(x, y, z, 0, 0, 0, 0.05, 0.18, 0.26, 7);
        D.col(o, 5, 3.8, 2.4, 1);
        D.fade(o, 0, 0.2);
        o = D.emit(x, y, z, 0, 0, 0, 0.07, 0.16, 0.22, 0);
        D.col(o, 2, 1.2, 0.5, 1);
        D.fade(o, 0, 0.1);
        o = A.emit(
          x,
          y,
          z,
          nx * 0.4,
          ny * 0.4 + 0.1,
          nz * 0.4,
          rr(0.7, 1.1),
          0.06,
          0.28,
          4,
        );
        A.col(o, 0.3, 0.3, 0.3, 0.35);
        A.phys(o, -0.1, 2);
        A.d[o + SPOW] = 2;
        _va.set(x, y, z);
        if (rnd() < 0.5) this._pulse(_va, 1, 0.7, 0.4, 3, 0.06, 0, 0, 5);
        this.decal(pos, n, "bullet_metal");
        return;
      }
      case "wood": {
        for (let i = 0; i < 9; i++) {
          const v = hemi(rr(2, 5.5), 0.8);
          const o = A.emit(
            x,
            y,
            z,
            v.x,
            v.y,
            v.z,
            rr(0.8, 1.6),
            rr(0.02, 0.05),
            0.04,
            8,
          );
          A.col(o, 0.55, 0.38, 0.22, 1);
          A.phys(o, 9.8, 0.6, 0.3);
          A.d[o + SPIN] = rr(-18, 18);
          A.fade(o, 0, 0.8);
        }
        for (let i = 0; i < 3; i++) {
          const v = hemi(rr(0.3, 1.2), 0.4);
          const o = A.emit(
            x,
            y,
            z,
            v.x,
            v.y,
            v.z,
            rr(0.8, 1.4),
            rr(0.05, 0.1),
            rr(0.3, 0.5),
            4,
          );
          A.col(o, 0.36, 0.27, 0.18, 0.5);
          A.phys(o, 0.2, 2.5);
          A.d[o + SPOW] = 2.5;
          A.fade(o, 0.08, 0.25);
        }
        burst(0.33, 0.25, 0.17, 0.55, 0.22);
        this.decal(pos, n, "bullet_wood");
        return;
      }
      case "dirt":
      case "sandbag": {
        const sand = surface === "sandbag";
        const cr = sand ? 0.5 : 0.28,
          cg = sand ? 0.42 : 0.21,
          cb = sand ? 0.3 : 0.14;
        for (let i = 0; i < (sand ? 16 : 10); i++) {
          const v = hemi(rr(1.2, 4.5), 0.6);
          v.y += rr(0.5, 2);
          const o = A.emit(
            x,
            y,
            z,
            v.x,
            v.y,
            v.z,
            rr(0.6, 1.3),
            sand ? rr(0.02, 0.05) : rr(0.02, 0.045),
            0.03,
            sand ? 13 : 9,
          );
          A.col(o, cr, cg, cb, 1);
          A.phys(o, 9.8, 0.4, DIE);
          A.d[o + SPIN] = rr(-8, 8);
          A.fade(o, 0, 0.85);
        }
        for (let i = 0; i < 4; i++) {
          const v = hemi(rr(0.3, 1.4), 0.5);
          const o = A.emit(
            x,
            y,
            z,
            v.x,
            v.y + 0.2,
            v.z,
            rr(1.2, 2.2),
            rr(0.06, 0.12),
            rr(0.4, 0.75),
            4,
          );
          A.col(o, cr * 0.9, cg * 0.9, cb * 0.9, 0.55);
          A.phys(o, 0.25, 2.2);
          A.d[o + SPOW] = 3;
          A.fade(o, 0.06, 0.3);
          A.d[o + SOFT] = 0.2;
        }
        burst(cr, cg, cb, 0.6, 0.26);
        this.decal(pos, n, sand ? "bullet_sandbag" : "bullet_dirt");
        return;
      }
      default: {
        // concrete / brick / plaster
        for (let i = 0; i < 10; i++) {
          const v = hemi(rr(2, 6), 0.75);
          const o = A.emit(
            x,
            y,
            z,
            v.x,
            v.y,
            v.z,
            rr(0.6, 1.4),
            rr(0.012, 0.03),
            0.02,
            rnd() < 0.5 ? 7 : 15,
          );
          const g = rr(0.28, 0.45);
          A.col(o, g, g * 0.97, g * 0.93, 1);
          A.phys(o, 9.8, 0.5, 0.3);
          A.d[o + SPIN] = rr(-15, 15);
          A.fade(o, 0, 0.8);
        }
        for (let i = 0; i < 5; i++) {
          const v = hemi(rr(0.25, 1.5), 0.5);
          const o = A.emit(
            x,
            y,
            z,
            v.x,
            v.y + 0.1,
            v.z,
            rr(1.2, 2.2),
            rr(0.05, 0.1),
            rr(0.35, 0.7),
            rnd() < 0.5 ? 4 : 12,
          );
          A.col(o, 0.45, 0.43, 0.4, rr(0.4, 0.6));
          A.phys(o, 0.15, 2.4);
          A.d[o + SPOW] = 3;
          A.fade(o, 0.05, 0.3);
          A.d[o + SPIN] = rr(-0.8, 0.8);
          A.d[o + SOFT] = 0.2;
        }
        if (rnd() < 0.5)
          for (let i = 0; i < 3; i++) {
            const v = hemi(rr(2, 5), 0.8);
            const o = D.emit(
              x,
              y,
              z,
              v.x,
              v.y,
              v.z,
              rr(0.08, 0.2),
              0.007,
              0.005,
              1 + M_STRETCH,
            );
            D.col(o, 1, 1, 1, 1);
            D.d[o + RAMP] = 2;
            D.phys(o, 9.8, 1, DIE);
            D.d[o + STR] = 0.028;
          }
        burst(0.42, 0.41, 0.39, 0.6, 0.24);
        this.decal(pos, n, "bullet_concrete");
      }
    }
  }

  tracer(from, to, color) {
    const D = this.add;
    _va.subVectors(to, from);
    const dist = _va.length();
    if (dist < 0.5) return;
    _va.divideScalar(dist);
    const sp = 260;
    const o = D.emit(
      from.x + _va.x * 1.2,
      from.y + _va.y * 1.2,
      from.z + _va.z * 1.2,
      _va.x * sp,
      _va.y * sp,
      _va.z * sp,
      Math.max(0.02, (dist - 1.2) / sp),
      0.02,
      0.02,
      1 + M_STRETCH,
    );
    if (color && color.isColor)
      D.col(o, color.r * 6, color.g * 6, color.b * 6, 0.9);
    else D.col(o, 6, 3.6, 1.6, 0.9);
    D.d[o + STR] = 0.008;
    D.fade(o, 0, 1.0);
  }

  muzzleWorld(pos, dir) {
    this._pulse(pos, 1, 0.66, 0.35, 12, 0.06, 0, 0, 8);
    const D = this.add;
    const o = D.emit(pos.x, pos.y, pos.z, 0, 0, 0, 0.05, 0.25, 0.35, 0);
    D.col(o, 6, 3.5, 1.4, 1);
    D.fade(o, 0, 0.3);
    if (dir) {
      const A = this.alpha;
      const s = A.emit(
        pos.x,
        pos.y,
        pos.z,
        dir.x * 1.2,
        dir.y * 1.2 + 0.2,
        dir.z * 1.2,
        0.7,
        0.06,
        0.3,
        4,
      );
      A.col(s, 0.5, 0.5, 0.5, 0.25);
      A.phys(s, -0.2, 2.5);
      A.d[s + SPOW] = 2;
    }
  }

  explosion(pos, scale = 1) {
    const A = this.alpha,
      D = this.add,
      s = scale;
    const x = pos.x,
      y = Math.max(pos.y, 0.05),
      z = pos.z;
    // core flash + flare
    let o = D.emit(x, y + 0.3 * s, z, 0, 0, 0, 0.14, 1.6 * s, 3.2 * s, 0);
    D.col(o, 4, 3, 2, 1);
    D.fade(o, 0, 0.1);
    o = D.emit(x, y + 0.3 * s, z, 0, 0, 0, 0.1, 2.4 * s, 3.6 * s, 8);
    D.col(o, 1.6, 1.1, 0.6, 1);
    D.fade(o, 0, 0.2);
    // noise-shaded fireball
    const fb = this.fireballs.find((f) => !f.on) || this.fireballs[0];
    fb.on = true;
    fb.t = 0;
    fb.dur = 1.1;
    fb.scale = s;
    fb.x = x;
    fb.y = y + 0.35 * s;
    fb.z = z;
    fb.mesh.material.uniforms.uSeed.value = rnd() * 50;
    fb.mesh.visible = true;
    // fire puffs
    for (let i = 0; i < 26; i++) {
      _va.set(rr(-1, 1), rr(0.15, 1.2), rr(-1, 1)).normalize();
      const sp = rr(3, 9) * s;
      o = D.emit(
        x + _va.x * 0.3 * s,
        y + 0.3 * s + _va.y * 0.3 * s,
        z + _va.z * 0.3 * s,
        _va.x * sp,
        _va.y * sp * 0.8,
        _va.z * sp,
        rr(0.45, 1.0),
        rr(0.5, 0.9) * s,
        rr(1.3, 2.2) * s,
        2 + ((rnd() * 4) | 0),
      );
      D.col(o, rr(0.8, 1.1), 1, 1, rr(0.35, 0.6));
      D.d[o + RAMP] = 1;
      D.phys(o, -1.5, 4.5);
      D.d[o + SPIN] = rr(-2, 2);
      D.fade(o, 0.02, 0.35);
      D.d[o + SPOW] = 3;
      D.d[o + SOFT] = 0.4 * s;
      D.d[o + EM] = 0.25;
    }
    // smoke — dark, billowing, fire-lit underside early
    for (let i = 0; i < 26; i++) {
      _va.set(rr(-1, 1), rr(0.1, 1.3), rr(-1, 1)).normalize();
      const sp = rr(1.5, 5) * s;
      o = A.emit(
        x + _va.x * 0.5 * s,
        y + 0.4 * s + _va.y * 0.4 * s,
        z + _va.z * 0.5 * s,
        _va.x * sp,
        _va.y * sp * 0.7 + 0.5,
        _va.z * sp,
        rr(3.5, 6.5),
        rr(0.8, 1.3) * s,
        rr(2.6, 4.2) * s,
        (rnd() * 4) | 0,
      );
      const g = rr(0.05, 0.1);
      A.col(o, g, g * 0.95, g * 0.9, rr(0.7, 0.9));
      A.phys(o, -0.45, 1.6);
      A.d[o + SPIN] = rr(-0.5, 0.5);
      A.fade(o, 0.03, 0.4);
      A.d[o + SPOW] = 3;
      A.d[o + EM] = rr(0.6, 1.2);
      A.d[o + SOFT] = 0.5 * s;
      A.d[o + TURB] = 0.6;
    }
    this._emitter(1, _va.set(x, y + 0.6 * s, z), 1.4, 16, null, s); // rising smoke column
    // ground dust ring
    for (let i = 0; i < 18; i++) {
      const a = (i / 18) * TAU + rr(-0.15, 0.15),
        sp = rr(5, 8) * s;
      o = A.emit(
        x + Math.cos(a) * 0.4,
        0.25 * s,
        z + Math.sin(a) * 0.4,
        Math.cos(a) * sp,
        rr(0.2, 0.8),
        Math.sin(a) * sp,
        rr(1.8, 3.2),
        0.5 * s,
        rr(1.8, 2.6) * s,
        4,
      );
      A.col(o, 0.17, 0.155, 0.14, 0.55);
      A.phys(o, -0.1, 2.6);
      A.d[o + SPOW] = 3;
      A.fade(o, 0.03, 0.35);
      A.d[o + SOFT] = 0.35 * s;
    }
    // sparks
    for (let i = 0; i < 46; i++) {
      _va.set(rr(-1, 1), rr(0.1, 1.5), rr(-1, 1)).normalize();
      const sp = rr(6, 20) * s;
      o = D.emit(
        x,
        y + 0.3 * s,
        z,
        _va.x * sp,
        _va.y * sp,
        _va.z * sp,
        rr(0.5, 1.6),
        rr(0.01, 0.02),
        0.006,
        1 + M_STRETCH,
      );
      D.col(o, 1, 1, 1, 1);
      D.d[o + RAMP] = 2;
      D.phys(o, 9.8, 1.2, 0.35);
      D.d[o + STR] = 0.022;
      D.fade(o, 0, 0.6);
      D.d[o + EM] = 0.6;
    }
    // dark debris flecks + rubble chunks
    for (let i = 0; i < 22; i++) {
      _va.set(rr(-1, 1), rr(0.4, 1.6), rr(-1, 1)).normalize();
      const sp = rr(4, 11) * s;
      o = A.emit(
        x,
        y + 0.2,
        z,
        _va.x * sp,
        _va.y * sp,
        _va.z * sp,
        rr(0.8, 1.8),
        rr(0.03, 0.07),
        0.05,
        rnd() < 0.5 ? 7 : 14,
      );
      A.col(o, 0.12, 0.11, 0.1, 1);
      A.phys(o, 9.8, 0.4, 0.25);
      A.d[o + SPIN] = rr(-15, 15);
      A.fade(o, 0, 0.85);
    }
    for (let i = 0; i < 8; i++) {
      _va
        .set(rr(-1, 1), rr(0.6, 1.8), rr(-1, 1))
        .normalize()
        .multiplyScalar(rr(3, 8) * s);
      const g = rr(0.2, 0.35);
      this.chunks.spawn(
        _vb.set(x, y + 0.2, z),
        _va,
        rr(0.05, 0.11),
        0,
        g,
        g * 0.95,
        g * 0.9,
      );
    }
    // shockwave: ground ring + air ring
    o = D.emit(x, 0.03, z, 0, 0, 0, 0.45, 0.6 * s, 9 * s, 12 + M_FLAT);
    D.col(o, 1.1, 0.7, 0.4, 1);
    D.fade(o, 0, 0.1);
    D.d[o + SPOW] = 2.5;
    o = D.emit(x, y + 0.5 * s, z, 0, 0, 0, 0.3, 0.5 * s, 7 * s, 6);
    D.col(o, 0.45, 0.35, 0.28, 0.6);
    D.fade(o, 0, 0.2);
    D.d[o + SPOW] = 2;
    // lingering embers
    for (let i = 0; i < 24; i++) {
      o = D.emit(
        x + rr(-1, 1) * s,
        y + rr(0.2, 1.5) * s,
        z + rr(-1, 1) * s,
        rr(-1, 1),
        rr(0.5, 2.5),
        rr(-1, 1),
        rr(1.5, 3.5),
        rr(0.02, 0.04),
        0.01,
        10,
      );
      D.col(o, 1, 1, 1, 1);
      D.d[o + RAMP] = 2;
      D.phys(o, -0.4, 0.8);
      D.d[o + TURB] = 6;
      D.fade(o, 0.05, 0.6);
    }
    _vb.set(x, 0, z);
    this.decal(_vb, UP, "scorch", 3 * s * rr(0.9, 1.1));
    this._pulse(
      _va.set(x, y + 1, z),
      1,
      0.55,
      0.22,
      70 * s,
      0.75,
      0.3,
      1,
      16 * s,
    );
  }

  aetherImpact(pos) {
    const A = this.alpha,
      D = this.add;
    const x = pos.x,
      y = pos.y,
      z = pos.z;
    let o = D.emit(x, y, z, 0, 0, 0, 0.16, 0.6, 1.6, 0);
    D.col(o, 0.9, 2.6, 1.0, 1);
    D.fade(o, 0, 0.1);
    o = D.emit(x, y, z, 0, 0, 0, 0.12, 0.9, 1.8, 8);
    D.col(o, 0.5, 1.5, 0.6, 1);
    D.fade(o, 0, 0.15);
    for (let i = 0; i < 9; i++) {
      o = D.emit(
        x + rr(-0.1, 0.1),
        y + rr(-0.1, 0.1),
        z + rr(-0.1, 0.1),
        rr(-1.5, 1.5),
        rr(-0.5, 2),
        rr(-1.5, 1.5),
        rr(0.35, 0.7),
        rr(0.25, 0.4),
        rr(0.8, 1.4),
        9,
      );
      D.col(o, 0.3, 0.3, 0.3, 1);
      D.d[o + RAMP] = 3;
      D.phys(o, -0.5, 3);
      D.d[o + SPIN] = rr(-6, 6);
      D.fade(o, 0.05, 0.3);
      D.d[o + SPOW] = 2;
      D.d[o + EM] = 0.4;
    }
    for (let i = 0; i < 34; i++) {
      _va.set(rr(-1, 1), rr(-0.4, 1.2), rr(-1, 1)).normalize();
      const sp = rr(3, 12);
      o = D.emit(
        x,
        y,
        z,
        _va.x * sp,
        _va.y * sp,
        _va.z * sp,
        rr(0.25, 0.8),
        rr(0.008, 0.016),
        0.005,
        (rnd() < 0.3 ? 13 : 1) + M_STRETCH,
      );
      D.col(o, 1, 1, 1, 1);
      D.d[o + RAMP] = 3;
      D.phys(o, 4, 2.2, 0.3);
      D.d[o + STR] = 0.02;
      D.fade(o, 0, 0.5);
      D.d[o + EM] = 0.5;
    }
    o = D.emit(x, y, z, 0, 0, 0, 0.35, 0.3, 2.6, 6);
    D.col(o, 0.35, 1.2, 0.45, 1);
    D.fade(o, 0, 0.1);
    D.d[o + SPOW] = 2.5;
    if (y < 1.2) {
      o = D.emit(x, 0.03, z, 0, 0, 0, 0.5, 0.3, 4.5, 12 + M_FLAT);
      D.col(o, 0.3, 1.1, 0.4, 1);
      D.fade(o, 0, 0.2);
      D.d[o + SPOW] = 2.5;
    }
    for (let i = 0; i < 14; i++) {
      o = D.emit(
        x + rr(-0.5, 0.5),
        y + rr(-0.3, 0.5),
        z + rr(-0.5, 0.5),
        rr(-0.3, 0.3),
        rr(0.2, 0.9),
        rr(-0.3, 0.3),
        rr(0.8, 1.8),
        rr(0.03, 0.06),
        0.01,
        7,
      );
      D.col(o, 0.6, 2.2, 0.8, 1);
      D.phys(o, -0.2, 1);
      D.d[o + TURB] = 3;
      D.fade(o, 0.1, 0.5);
      D.d[o + SPIN] = rr(-2, 2);
    }
    o = A.emit(x, y, z, 0, 0.3, 0, 1.4, 0.3, 1.2, 4);
    A.col(o, 0.2, 0.28, 0.22, 0.35);
    A.phys(o, -0.2, 1.5);
    A.d[o + SPOW] = 3;
    A.d[o + SOFT] = 0.2;
    _vb.set(x, 0, z);
    if (y < 0.6) this.decal(_vb, UP, "scorch_aether");
    this._pulse(_va.set(x, y + 0.2, z), 0.35, 1, 0.4, 22, 0.5, 0.2, 1, 10);
  }

  dirtBurst(pos) {
    const A = this.alpha;
    const x = pos.x,
      z = pos.z;
    for (let i = 0; i < 18; i++) {
      const a = rnd() * TAU,
        r = rr(0, 0.35),
        sp = rr(0.5, 2);
      const o = A.emit(
        x + Math.cos(a) * r,
        0.05,
        z + Math.sin(a) * r,
        Math.cos(a) * sp,
        rr(2, 4.5),
        Math.sin(a) * sp,
        rr(0.9, 1.6),
        rr(0.035, 0.08),
        0.05,
        9,
      );
      const g = rr(0.6, 1.0);
      A.col(o, 0.11 * g, 0.08 * g, 0.055 * g, 1);
      A.phys(o, 9.8, 0.3, 0.2);
      A.d[o + SPIN] = rr(-8, 8);
      A.fade(o, 0, 0.9);
    }
    for (let i = 0; i < 10; i++) {
      const a = rnd() * TAU,
        r = rr(0, 0.4);
      const o = A.emit(
        x + Math.cos(a) * r,
        0.15,
        z + Math.sin(a) * r,
        Math.cos(a) * rr(0.3, 0.9),
        rr(0.3, 1.1),
        Math.sin(a) * rr(0.3, 0.9),
        rr(1.8, 3),
        rr(0.2, 0.35),
        rr(0.8, 1.3),
        rnd() < 0.5 ? 4 : 12,
      );
      A.col(o, 0.16, 0.13, 0.095, 0.4);
      A.phys(o, 0.05, 1.3);
      A.d[o + SPOW] = 2.5;
      A.fade(o, 0.08, 0.35);
      A.d[o + SOFT] = 0.25;
      A.d[o + TURB] = 0.5;
    }
    this._emitter(2, pos, 1.3, 14);
    _vb.set(x, 0, z);
    this.decal(_vb, UP, "dirt");
  }

  gib(pos, dir, kind = "head") {
    const d = dir || UP;
    for (let i = 0; i < 10; i++) {
      _va
        .set(d.x * 1.5 + rr(-1, 1), rr(1.5, 3.5), d.z * 1.5 + rr(-1, 1))
        .multiplyScalar(rr(0.8, 1.4));
      const bone = rnd() < 0.45;
      const k = rr(0.8, 1.1);
      this.chunks.spawn(
        pos,
        _va,
        rr(0.025, 0.06),
        bone ? 0 : 1,
        bone ? 0.62 * k : 0.28 * k,
        bone ? 0.55 * k : 0.035 * k,
        bone ? 0.42 * k : 0.03 * k,
      );
    }
    this.blood(pos, d, 1.6);
    this.blood(pos, UP, 1.0);
    this._emitter(4, pos, 0.9, 60); // fountain from the neck
    this.decal(
      _vb.set(pos.x + d.x * 0.4, 0, pos.z + d.z * 0.4),
      UP,
      "blood",
      rr(0.8, 1.1),
    );
  }

  powerupGrab(pos) {
    const D = this.add;
    const y = pos.y + 0.8;
    let o = D.emit(pos.x, y, pos.z, 0, 0, 0, 0.35, 0.5, 2.0, 8);
    D.col(o, 0.25, 0.25, 0.25, 1);
    D.d[o + RAMP] = 4;
    D.fade(o, 0, 0.2);
    o = D.emit(pos.x, y, pos.z, 0, 0, 0, 0.25, 0.8, 1.6, 0);
    D.col(o, 0.2, 0.2, 0.2, 1);
    D.d[o + RAMP] = 4;
    D.fade(o, 0, 0.1);
    o = D.emit(pos.x, y, pos.z, 0, 0, 0, 0.4, 0.2, 2.4, 6);
    D.col(o, 0.4, 0.65, 0.25, 1);
    D.fade(o, 0, 0.2);
    D.d[o + SPOW] = 2.5;
    for (let i = 0; i < 30; i++) {
      _va.set(rr(-1, 1), rr(-0.6, 1.2), rr(-1, 1)).normalize();
      const sp = rr(1.5, 4.5);
      o = D.emit(
        pos.x,
        y,
        pos.z,
        _va.x * sp,
        _va.y * sp,
        _va.z * sp,
        rr(0.5, 1.1),
        rr(0.06, 0.12),
        0.02,
        7,
      );
      D.col(o, 0.45, 0.45, 0.45, 1);
      D.d[o + RAMP] = 4;
      D.phys(o, 1.5, 2.5);
      D.fade(o, 0, 0.4);
      D.d[o + SPIN] = rr(-3, 3);
    }
    this._pulse(_va.set(pos.x, y, pos.z), 0.7, 1, 0.45, 18, 0.45, 0, 1, 8);
  }

  nukeFlash() {
    const c = this.camera;
    c.getWorldPosition(_va);
    _va.y += 3;
    this._pulse(_va, 1, 0.92, 0.8, 4000, 1.4, 0.1, 1, 60);
    c.getWorldDirection(_vb);
    const D = this.add;
    const o = D.emit(
      _va.x + _vb.x * 30,
      _va.y + 6,
      _va.z + _vb.z * 30,
      0,
      0,
      0,
      0.9,
      30,
      60,
      0,
    );
    D.col(o, 10, 9, 7, 1);
    D.fade(o, 0, 0.1);
  }

  embers(pos) {
    const e = this._emitter(0, pos, 1e9, 13);
    return {
      stop: () => {
        if (e) e.on = false;
      },
    };
  }

  /* ---------------------------------------------------------- power-ups */
  _ensurePowerups() {
    if (this._puGeos) return;
    this._puGeos = buildPowerupGeos();
    const rim = { value: new THREE.Color(0.45, 1.4, 0.35) },
      pulse = (this._puPulse = { value: 1 });
    const inject = (m) => {
      m.onBeforeCompile = (sh) => {
        sh.uniforms.uRim = rim;
        sh.uniforms.uPulse = pulse;
        sh.fragmentShader =
          "uniform vec3 uRim; uniform float uPulse;\n" +
          sh.fragmentShader.replace(
            "#include <emissivemap_fragment>",
            "#include <emissivemap_fragment>\n totalEmissiveRadiance += uRim * pow(1.0 - clamp(dot(normal, normalize(vViewPosition)), 0.0, 1.0), 2.2) * uPulse;",
          );
      };
      return m;
    };
    this._puMats = {
      gold: inject(
        new THREE.MeshStandardMaterial({
          color: 0xe0b850,
          metalness: 0.85,
          roughness: 0.28,
          emissive: 0xa07818,
          emissiveIntensity: 0.55,
        }),
      ),
      dark: inject(
        new THREE.MeshStandardMaterial({
          color: 0x3a2a0c,
          metalness: 0.6,
          roughness: 0.5,
          emissive: 0x1a2a05,
          emissiveIntensity: 0.6,
        }),
      ),
      halo: new THREE.SpriteMaterial({
        map: this.texGlow,
        color: new THREE.Color(0.4, 1.1, 0.25),
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        transparent: true,
      }),
      ground: new THREE.MeshBasicMaterial({
        map: this.texGlow,
        color: new THREE.Color(0.35, 1.0, 0.25),
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        transparent: true,
      }),
    };
    this._puGround = new THREE.PlaneGeometry(1.4, 1.4).rotateX(-Math.PI / 2);
  }

  spawnPowerup(type, pos) {
    this._ensurePowerups();
    const G = this._puGeos[type] || this._puGeos.maxammo;
    const group = new THREE.Group();
    group.name = "powerup." + type;
    group.position.set(pos.x, pos.y, pos.z);
    const model = new THREE.Group();
    const gm = new THREE.Mesh(G.gold, this._puMats.gold);
    gm.castShadow = false;
    model.add(gm);
    if (G.dark) model.add(new THREE.Mesh(G.dark, this._puMats.dark));
    const sc =
      type === "doublepoints" ? 1.5 : type === "instakill" ? 1.45 : 1.3;
    model.scale.setScalar(sc);
    model.position.y = 0.8;
    const halo = new THREE.Sprite(this._puMats.halo);
    halo.scale.set(1.25, 1.25, 1);
    halo.position.y = 0.8;
    halo.renderOrder = 13;
    const ground = new THREE.Mesh(this._puGround, this._puMats.ground);
    ground.position.y = 0.02;
    ground.renderOrder = 6;
    group.add(model, halo, ground);
    this.root.add(group);
    const h = {
      object: group,
      type,
      age: 0,
      pos: group.position,
      _model: model,
      _halo: halo,
      _acc: 0,
      _phase: rnd() * TAU,
      _fx: this,
      dispose: () => {
        const i = this.powerups.indexOf(h);
        if (i >= 0) this.powerups.splice(i, 1);
        this.root.remove(group);
      },
    };
    this.powerups.push(h);
    return h;
  }

  /* ============================================================ UPDATE */
  update(dt) {
    dt = Math.min(Math.max(dt || 0, 0), 0.05);
    this.time += dt;
    this._uDecalTime.value = this.time;
    const cam = this.camera;
    const e = cam.matrixWorld.elements;
    this._camPos.set(e[12], e[13], e[14]);
    this._camFwd.set(-e[8], -e[9], -e[10]).normalize();

    this._runEmitters(dt);

    // fireballs
    for (const f of this.fireballs) {
      if (!f.on) continue;
      f.t += dt;
      const t = f.t / f.dur;
      if (t >= 1) {
        f.on = false;
        f.mesh.visible = false;
        continue;
      }
      const u = f.mesh.material.uniforms;
      const grow = 1 - Math.pow(1 - Math.min(1, f.t / 0.32), 3);
      f.mesh.scale.setScalar(f.scale * (0.35 + 1.25 * grow + t * 0.4));
      f.mesh.position.set(f.x, f.y + t * 0.9 * f.scale, f.z);
      u.uTime.value = f.t * 1.5;
      u.uHeat.value = 0.98 * Math.pow(1 - t, 1.8);
      u.uErode.value = -0.2 + Math.pow(t, 1.25) * 1.25;
      u.uAmp.value = 0.4 + 0.15 * t;
      // fade out when the camera gets close to / inside the shell (avoids faceted lobes filling the view)
      const rad = f.mesh.scale.x * 1.3,
        cd = this._camPos.distanceTo(f.mesh.position);
      u.uOpacity.value =
        (1 - sstep(0.5, 1, t)) * sstep(rad * 1.05, rad * 1.9, cd);
    }

    // lights
    for (const s of this.lights) {
      if (!s.on) {
        s.L.intensity = 0;
        continue;
      }
      s.t += dt;
      if (s.t >= s.dur) {
        s.on = false;
        s.L.intensity = 0;
        continue;
      }
      const k = s.t / s.dur;
      let I = s.shape === 1 ? Math.pow(1 - k, 2.2) : 1 - k;
      if (s.flick > 0) I *= 1 - s.flick * rnd();
      s.L.intensity = s.peak * I;
    }

    // power-ups
    if (this.powerups.length) {
      this._puPulse.value = 0.8 + 0.25 * Math.sin(this.time * 5);
      for (const h of this.powerups) {
        h.age += dt;
        if (h.type === "doublepoints" || h.type === "instakill")
          h._model.rotation.y = Math.sin(h.age * 1.1 + h._phase) * 0.95;
        else h._model.rotation.y += dt * 1.3;
        h._model.position.y = 0.8 + Math.sin(h.age * 2.2 + h._phase) * 0.07;
        h._halo.position.y = h._model.position.y;
        let vis = true;
        if (h.age > 20) {
          const f = 2 + (h.age - 20) * 0.7;
          vis = Math.sin(h.age * f * TAU) > -0.2;
        }
        h.object.visible = vis;
        h._acc += dt;
        while (h._acc > 0.09) {
          h._acc -= 0.09;
          if (!vis) continue;
          const a = rnd() * TAU,
            r = rr(0.15, 0.45);
          const o = this.add.emit(
            h.pos.x + Math.cos(a) * r,
            h.pos.y + rr(0.45, 1.1),
            h.pos.z + Math.sin(a) * r,
            0,
            rr(0.2, 0.5),
            0,
            rr(0.6, 1.1),
            rr(0.05, 0.1),
            0.01,
            7,
          );
          this.add.col(o, 0.5, 0.9, 0.6, 1);
          this.add.d[o + RAMP] = 4;
          this.add.fade(o, 0.25, 0.4);
          this.add.d[o + SPIN] = rr(-2, 2);
        }
      }
    }

    // particle + rigid sims
    this.alpha.sim(dt);
    this.add.sim(dt);
    for (const k in this.shells) this.shells[k].update(dt);
    this.chunks.update(dt);

    this._updateLighting(dt);
    this.alpha.write(this._camPos, this._camFwd);
    this.add.write(this._camPos, this._camFwd);
  }

  _runEmitters(dt) {
    const A = this.alpha,
      D = this.add;
    for (const e of this.emitters) {
      if (!e.on) continue;
      e.t += dt;
      if (e.t > e.dur) {
        e.on = false;
        continue;
      }
      e.acc += dt * e.rate;
      const k = e.t / e.dur;
      while (e.acc >= 1) {
        e.acc -= 1;
        let o;
        switch (e.type) {
          case 0: // embers (burning barrel)
            o = D.emit(
              e.x + rr(-0.22, 0.22),
              e.y + rr(0, 0.15),
              e.z + rr(-0.22, 0.22),
              rr(-0.2, 0.2),
              rr(0.6, 1.6),
              rr(-0.2, 0.2),
              rr(1.4, 3),
              rr(0.015, 0.035),
              0.008,
              10,
            );
            D.col(o, rr(0.7, 1.2), 1, 1, 1);
            D.d[o + RAMP] = 2;
            D.phys(o, -0.25, 0.5);
            D.d[o + TURB] = 5;
            D.fade(o, 0.08, 0.5);
            D.d[o + SOFT] = 0;
            break;
          case 1: {
            // explosion smoke column
            const s = e.s;
            o = A.emit(
              e.x + rr(-0.4, 0.4) * s,
              e.y + k * 1.2 * s,
              e.z + rr(-0.4, 0.4) * s,
              rr(-0.3, 0.3),
              rr(1.2, 2.4) * s,
              rr(-0.3, 0.3),
              rr(3.5, 6),
              rr(0.8, 1.2) * s,
              rr(2.2, 3.6) * s,
              (rnd() * 4) | 0,
            );
            const g = rr(0.06, 0.11);
            A.col(o, g, g, g * 0.95, 0.7 * (1 - k * 0.5));
            A.phys(o, -0.3, 0.7);
            A.d[o + SPOW] = 2;
            A.fade(o, 0.1, 0.4);
            A.d[o + EM] = 0.5 * (1 - k);
            A.d[o + SPIN] = rr(-0.4, 0.4);
            A.d[o + TURB] = 0.5;
            A.d[o + SOFT] = 0.4;
            break;
          }
          case 2: {
            // dirt rising dust + pebbles
            const a = rnd() * TAU,
              r = rr(0, 0.35);
            if (rnd() < 0.5) {
              o = A.emit(
                e.x + Math.cos(a) * r,
                0.03,
                e.z + Math.sin(a) * r,
                Math.cos(a) * rr(0.2, 1),
                rr(1.2, 3),
                Math.sin(a) * rr(0.2, 1),
                rr(0.6, 1.1),
                rr(0.02, 0.05),
                0.03,
                9,
              );
              A.col(o, 0.1, 0.075, 0.05, 1);
              A.phys(o, 9.8, 0.3, DIE);
              A.d[o + SPIN] = rr(-8, 8);
            } else {
              o = A.emit(
                e.x + Math.cos(a) * r,
                0.1,
                e.z + Math.sin(a) * r,
                rr(-0.2, 0.2),
                rr(0.2, 0.7),
                rr(-0.2, 0.2),
                rr(1.5, 2.6),
                rr(0.2, 0.3),
                rr(0.7, 1.1),
                4,
              );
              A.col(o, 0.15, 0.125, 0.09, 0.3 * (1 - k));
              A.phys(o, 0, 1.2);
              A.d[o + SPOW] = 2;
              A.fade(o, 0.1, 0.35);
              A.d[o + SOFT] = 0.25;
            }
            break;
          }
          case 3: // drips from a wound
            o = A.emit(
              e.x + rr(-0.03, 0.03),
              e.y - 0.02,
              e.z + rr(-0.03, 0.03),
              rr(-0.1, 0.1),
              rr(-0.5, 0),
              rr(-0.1, 0.1),
              1.2,
              rr(0.01, 0.018),
              0.012,
              6 + M_STRETCH,
            );
            A.col(o, BLOOD_R, BLOOD_G, BLOOD_B, 1);
            A.phys(o, 9.8, 0.1, STICK);
            A.d[o + STR] = 0.014;
            A.d[o + EVT] = 1;
            A.fade(o, 0, 0.9);
            break;
          case 4: {
            // blood fountain (decapitation)
            const sp = rr(2, 4.5) * (1 - k * 0.6);
            o = A.emit(
              e.x,
              e.y,
              e.z,
              rr(-0.5, 0.5) + e.dx * 0.5,
              sp,
              rr(-0.5, 0.5) + e.dz * 0.5,
              rr(0.7, 1.4),
              rr(0.01, 0.025),
              0.018,
              6 + M_STRETCH,
            );
            A.col(o, BLOOD_R, BLOOD_G, BLOOD_B, 1);
            A.phys(o, 9.8, 0.4, STICK);
            A.d[o + STR] = 0.014;
            A.d[o + EVT] = 1;
            A.fade(o, 0, 0.9);
            if (rnd() < 0.12) {
              o = A.emit(
                e.x,
                e.y + 0.1,
                e.z,
                rr(-0.3, 0.3),
                rr(0.4, 1),
                rr(-0.3, 0.3),
                0.7,
                0.1,
                0.45,
                5,
              );
              A.col(o, 0.36, 0.025, 0.02, 0.45);
              A.phys(o, 0.4, 2.5);
              A.d[o + SPOW] = 2;
            }
            break;
          }
        }
      }
    }
  }

  _updateLighting(dt) {
    // (re)discover scene lights every 2 s — cheap cached traversal
    this._lightScan -= dt;
    if (this._lightScan <= 0) {
      this._lightScan = 2;
      const L = this._sceneLights;
      L.length = 0;
      const amb = this._sceneAmb.set(0, 0, 0);
      this.scene.traverseVisible((o) => {
        if (!o.isLight || o.name === "fx.light") return;
        if (o.isPointLight || o.isSpotLight) L.push(o);
        else if (o.isAmbientLight)
          ((amb.x += o.color.r * o.intensity),
            (amb.y += o.color.g * o.intensity),
            (amb.z += o.color.b * o.intensity));
        else if (o.isHemisphereLight)
          ((amb.x += (o.color.r + o.groundColor.r) * 0.5 * o.intensity),
            (amb.y += (o.color.g + o.groundColor.g) * 0.5 * o.intensity),
            (amb.z += (o.color.b + o.groundColor.b) * 0.5 * o.intensity));
        else if (o.isDirectionalLight)
          ((amb.x += o.color.r * o.intensity * 0.35),
            (amb.y += o.color.g * o.intensity * 0.35),
            (amb.z += o.color.b * o.intensity * 0.35));
      });
    }
    const INV_PI = 1 / Math.PI,
      SCAT = 0.6;
    const a = this._sceneAmb,
      amb = this._uAmb.value;
    amb.set(
      a.x * INV_PI + this.ambient.r,
      a.y * INV_PI + this.ambient.g,
      a.z * INV_PI + this.ambient.b,
    );
    const LP = this._uLP.value,
      LC = this._uLC.value;
    for (let i = 0; i < LIGHT_POOL; i++) {
      const s = this.lights[i].L;
      LP[i].set(s.position.x, s.position.y, s.position.z, s.distance);
      LC[i]
        .set(s.color.r, s.color.g, s.color.b)
        .multiplyScalar(s.intensity * INV_PI * SCAT);
    }
    // 4 nearest scene point lights to the camera
    const sl = this._sceneLights,
      cp = this._camPos;
    for (let k = 0; k < 4; k++) {
      let best = null,
        bd = 1e18;
      for (let j = 0; j < sl.length; j++) {
        const l = sl[j];
        if (l.intensity <= 0 || l._fxPick === this.time) continue;
        const m = l.matrixWorld.elements;
        const d2 =
          (m[12] - cp.x) ** 2 + (m[13] - cp.y) ** 2 + (m[14] - cp.z) ** 2;
        if (d2 < bd) {
          bd = d2;
          best = l;
        }
      }
      const idx = LIGHT_POOL + k;
      if (best) {
        best._fxPick = this.time;
        const m = best.matrixWorld.elements;
        LP[idx].set(m[12], m[13], m[14], best.distance || 0);
        LC[idx]
          .set(best.color.r, best.color.g, best.color.b)
          .multiplyScalar(best.intensity * INV_PI * SCAT);
      } else {
        LC[idx].set(0, 0, 0);
      }
    }
  }

  /** debug counters */
  stats() {
    return {
      alpha: this.alpha.n,
      additive: this.add.n,
      shells:
        this.shells.pistol.n + this.shells.rifle.n + this.shells.shotgun.n,
      chunks: this.chunks.n,
      powerups: this.powerups.length,
      lights: this.lights.filter((l) => l.on).length,
    };
  }
}
