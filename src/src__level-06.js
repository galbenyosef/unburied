// src__level 06 — three
// Lines 5766-6432 of readable/src__level.pretty.js (statement-aligned).
function buildLighting(ctx, features) {
  const {
    root,
    dynGroup,
    updaters,
    powerables,
    tween,
    mat,
    box,
    cyl,
    emit,
    xform,
    solid,
    reserve,
    canvasTex,
    HOLES,
    windows,
    rng,
  } = ctx;
  const scene = root.parent;
  const lights = { bulbs: [], fires: [] };
  const MOON_DIR = new THREE.Vector3(-0.42, 0.62, -0.66).normalize(); // towards the moon
  const FOG = new THREE.Color(0x10151e);
  if (scene) {
    if (!scene.fog) scene.fog = new THREE.FogExp2(FOG.getHex(), 0.03);
    if (!scene.background) scene.background = FOG.clone();
  }

  // ---- sky dome with stars + moon glow ----
  const skyMat = new THREE.ShaderMaterial({
    uniforms: {
      uMoon: { value: MOON_DIR.clone() },
      uHorizon: { value: new THREE.Color(0x1a2230) },
      uZenith: { value: new THREE.Color(0x03050a) },
      uFog: { value: FOG.clone() },
    },
    vertexShader: `varying vec3 vD; void main(){ vD = normalize(position); vec4 p = projectionMatrix*modelViewMatrix*vec4(position,1.0); gl_Position = p.xyww; }`,
    fragmentShader: `uniform vec3 uMoon; uniform vec3 uHorizon; uniform vec3 uZenith; uniform vec3 uFog; varying vec3 vD;
      float h31(vec3 p){ p = fract(p*0.1031); p += dot(p, p.yzx+33.33); return fract((p.x+p.y)*p.z); }
      void main(){ vec3 d = normalize(vD); float h = d.y;
        vec3 col = mix(uHorizon, uZenith, smoothstep(0.0, 0.55, h));
        col = mix(uFog, col, smoothstep(-0.02, 0.12, h));
        float m = max(dot(d, uMoon), 0.0);
        col += vec3(0.55,0.65,0.85) * (pow(m, 900.0)*0.0 + pow(m, 60.0)*0.22 + pow(m, 8.0)*0.05);
        vec3 c = floor(d*420.0); float s = h31(c);
        float star = step(0.9975, s) * smoothstep(0.06, 0.35, h) * (0.4 + 0.6*h31(c+7.0));
        col += vec3(0.8,0.85,1.0) * star * 0.9;
        // faint cloud bands
        float cl = sin(d.x*9.0 + d.z*4.0) * sin(d.z*7.0 - d.x*3.0 + 1.3);
        col = mix(col, uHorizon*1.3, smoothstep(0.3, 0.9, cl) * smoothstep(0.05, 0.3, h) * 0.35);
        gl_FragColor = vec4(col, 1.0); }`,
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(180, 32, 16), skyMat);
  sky.renderOrder = -10;
  sky.frustumCulled = false;
  root.add(sky);
  updaters.push((dt, time, pp) => {
    if (pp) sky.position.set(pp.x, 0, pp.z);
  });
  // moon disc
  const moonTex = canvasTex(256, 256, (g) => {
    const gr = g.createRadialGradient(128, 128, 0, 128, 128, 128);
    gr.addColorStop(0, "rgba(255,255,255,1)");
    gr.addColorStop(0.28, "rgba(236,240,255,1)");
    gr.addColorStop(0.31, "rgba(180,200,255,0.35)");
    gr.addColorStop(0.55, "rgba(120,150,220,0.08)");
    gr.addColorStop(1, "rgba(0,0,0,0)");
    g.fillStyle = gr;
    g.fillRect(0, 0, 256, 256);
    g.globalCompositeOperation = "multiply";
    for (let i = 0; i < 14; i++) {
      const a = Math.random() * 6.28,
        r = Math.random() * 30;
      g.fillStyle = `rgba(170,175,190,${0.4 + Math.random() * 0.4})`;
      g.beginPath();
      g.arc(
        128 + Math.cos(a) * r,
        128 + Math.sin(a) * r,
        4 + Math.random() * 12,
        0,
        6.28,
      );
      g.fill();
    }
  });
  const moon = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: moonTex,
      fog: false,
      depthWrite: false,
      transparent: true,
      color: 0xdfe8ff,
    }),
  );
  moon.scale.setScalar(30);
  moon.renderOrder = -9;
  root.add(moon);
  updaters.push((dt, time, pp) => {
    const c = pp || { x: 0, z: 0 };
    moon.position.set(
      c.x + MOON_DIR.x * 160,
      MOON_DIR.y * 160,
      c.z + MOON_DIR.z * 160,
    );
  });

  // ---- moonlight ----
  const centre = new THREE.Vector3(1, 0, -6.5);
  const moonLight = new THREE.DirectionalLight(0xa4b8ff, 2.6);
  moonLight.position.copy(centre).addScaledVector(MOON_DIR, 70);
  moonLight.target.position.copy(centre);
  moonLight.castShadow = true;
  moonLight.shadow.autoUpdate = false;
  moonLight.shadow.needsUpdate = true;
  moonLight.shadow.mapSize.set(4096, 4096);
  const sc = moonLight.shadow.camera;
  sc.left = -36;
  sc.right = 36;
  sc.top = 30;
  sc.bottom = -30;
  sc.near = 20;
  sc.far = 130;
  moonLight.shadow.bias = -0.0004;
  moonLight.shadow.normalBias = 0.04;
  root.add(moonLight, moonLight.target);
  const HEMI_PRE = 2.1,
    HEMI_POST = 2.9; // tuned for main.js: exposure 1.6 + environmentIntensity 0.55
  const hemi = new THREE.HemisphereLight(0x7486aa, 0x3a2e22, HEMI_PRE);
  const hemiState = { delay: 0, on: false, p: 0 };
  powerables.push({
    x: -16,
    z: -14,
    set: (on, delay, instant) => {
      hemiState.on = on;
      hemiState.delay = instant ? 0 : delay + 0.8;
      if (instant) hemiState.p = on ? 1 : 0;
    },
  });
  root.add(hemi);
  lights.moon = moonLight;
  lights.hemi = hemi;

  // ---- hanging bulbs ----
  const rub = mat("rubber_black"),
    pg = mat("metal_painted_green"),
    rusty = mat("metal_rusty");
  const BULBS = [
    {
      z: 0,
      x: 0,
      zz: 0.3,
      pre: 14,
      post: 34,
      shadow: true,
      shade: true,
      cord: 0.85,
    },
    { z: 0, x: -4.6, zz: -4.2, pre: 9, post: 40, cord: 0.6 },
    { z: 0, x: 4.4, zz: 4.3, pre: 11, post: 42, cord: 0.7, shade: true },
    { z: 1, x: -19.5, zz: -2.2, pre: 13, post: 56, cord: 0.8, shade: true },
    { z: 1, x: -12.5, zz: 3.2, pre: 11, post: 44, cord: 0.95 },
    { z: 2, x: 12.2, zz: -1.5, pre: 16, post: 46, cord: 0.8, shade: true },
    { z: 2, x: 21.5, zz: 4.0, pre: 14, post: 46, cord: 0.7 },
    { z: 2, x: 21.8, zz: -4.4, pre: 11, post: 40, cord: 0.5, shade: true },
    {
      z: 3,
      x: -16,
      zz: -10.2,
      pre: 12,
      post: 50,
      shadow: true,
      shade: true,
      cord: 0.7,
    },
    { z: 3, x: -11.8, zz: -17.6, pre: 10, post: 40, cord: 0.9 },
  ];
  const warm = new THREE.Color(0xffc27a);
  for (const [i, b] of BULBS.entries()) {
    const g = new THREE.Group();
    g.position.set(b.x, WALL_H, b.zz);
    dynGroup.add(g);
    const cordL = b.cord;
    const fix = [],
      shade = [];
    {
      const c = prep(new THREE.CylinderGeometry(0.006, 0.006, cordL, 5));
      c.translate(0, -cordL / 2, 0);
      fix.push(c);
    }
    {
      const c = prep(new THREE.CylinderGeometry(0.025, 0.03, 0.08, 10));
      c.translate(0, -cordL - 0.02, 0);
      fix.push(c);
    }
    {
      const c = prep(new THREE.CylinderGeometry(0.06, 0.06, 0.02, 10));
      c.translate(0, -0.01, 0);
      fix.push(c);
    }
    if (b.shade) {
      const s = prep(new THREE.CylinderGeometry(0.05, 0.26, 0.16, 18, 1, true));
      s.translate(0, -cordL - 0.06, 0);
      shade.push(s);
    }
    const fm = new THREE.Mesh(mergeGeometries(fix), rub);
    fm.castShadow = false;
    g.add(fm);
    if (shade.length) {
      const sm = new THREE.Mesh(
        mergeGeometries(shade),
        new THREE.MeshStandardMaterial({
          color: 0x2c3528,
          roughness: 0.6,
          metalness: 0.5,
          side: THREE.DoubleSide,
        }),
      );
      sm.castShadow = true;
      g.add(sm);
    }
    const bulbMat = new THREE.MeshStandardMaterial({
      color: 0x302a20,
      emissive: warm,
      emissiveIntensity: 0,
      roughness: 0.3,
    });
    const bulb = new THREE.Mesh(
      new THREE.SphereGeometry(0.045, 12, 8),
      bulbMat,
    );
    bulb.scale.y = 1.35;
    bulb.position.y = -cordL - 0.1;
    g.add(bulb);
    const light = new THREE.PointLight(warm, 0, 19, 2);
    light.position.y = -cordL - 0.12;
    if (b.shadow) {
      light.castShadow = true;
      light.shadow.autoUpdate = false;
      light.shadow.needsUpdate = true;
      light.shadow.mapSize.set(1024, 1024);
      light.shadow.bias = -0.004;
      light.shadow.normalBias = 0.03;
      light.shadow.camera.near = 0.15;
      light.shadow.camera.far = 15;
      light.shadow.radius = 3;
    }
    g.add(light);
    const e = {
      light,
      bulbMat,
      group: g,
      pre: b.pre,
      post: b.post,
      p: 0,
      powerAt: -1,
      seed: i * 7.31,
      zone: b.z,
      swayA: 0.02 + rng() * 0.03,
      swayP: rng() * 6,
    };
    lights.bulbs.push(e);
    powerables.push({
      x: b.x,
      z: b.zz,
      set: (on, delay, instant) => {
        if (instant) {
          e.powerAt = on ? -2 : -1;
          e.p = on ? 1 : 0;
        } else e.powerAt = on ? delay : -1;
      },
    });
  }
  // emissive-only caged wall lamps that come on with power (per-zone material)
  const zoneLampMats = [0, 1, 2, 3].map(
    () =>
      new THREE.MeshStandardMaterial({
        color: 0x2a2620,
        emissive: warm,
        emissiveIntensity: 0,
        roughness: 0.4,
      }),
  );
  const zoneLampState = [0, 1, 2, 3].map(() => ({ at: -1, p: 0 }));
  const WALL_LAMPS = [
    [0, -7.75, 2.35, -2.5, 1],
    [0, 7.75, 2.35, 3.2, -1],
    [1, -23.75, 2.35, -4.5, 1],
    [1, -8.25, 2.35, 4.2, -1],
    [2, 8.25, 2.35, -4.8, 1],
    [2, 25.75, 2.35, -6.2, -1],
    [3, -23.75, 2.35, -18.5, 1],
    [3, -8.25, 2.35, -12.5, -1],
  ];
  const cageGeos = [];
  for (const [z, x, y, zz, s] of WALL_LAMPS) {
    const lamp = new THREE.Mesh(
      new THREE.SphereGeometry(0.07, 10, 8),
      zoneLampMats[z],
    );
    lamp.position.set(x + s * 0.12, y, zz);
    lamp.scale.set(0.8, 1.2, 0.8);
    dynGroup.add(lamp);
    const back = prep(new THREE.CylinderGeometry(0.09, 0.09, 0.04, 12));
    xform(back, x + s * 0.02, y, zz, 0, 0, Math.PI / 2);
    cageGeos.push(back);
    for (let k = 0; k < 4; k++) {
      const bar = prep(new THREE.TorusGeometry(0.09, 0.006, 4, 10, Math.PI));
      xform(
        bar,
        x + s * 0.03,
        y,
        zz,
        (k * Math.PI) / 4,
        s > 0 ? Math.PI / 2 : -Math.PI / 2,
        0,
      );
      cageGeos.push(bar);
    }
    powerables.push({
      x,
      z: zz,
      set: (on, delay, instant) => {
        const st = zoneLampState[z];
        if (instant) {
          st.at = on ? -2 : -1;
          st.p = on ? 1 : 0;
        } else st.at = on ? Math.max(st.at === -1 ? 0 : st.at, delay) : -1;
      },
    });
  }
  emit(mergeGeometries(cageGeos), rusty, "walls", false);

  // ---- burning barrels ----
  const FIRES = [
    [-6.85, -5.85, 0],
    [25.05, -6.95, 2],
    [-22.85, -19.85, 3],
    [-1.6, 12.4, -1],
    [31.5, 4.5, -1],
    [-29, -15.5, -1],
  ];
  const fireSpots = [];
  const flameGeos = [];
  for (const [x, z, zone] of FIRES) {
    const region = zone < 0 ? "ext" : "z" + zone;
    cyl("metal_rusty", region, x, 0.45, z, 0.29, 0.29, 0.9, 16, { open: true });
    cyl("metal_rusty", region, x, 0.02, z, 0.29, 0.29, 0.04, 16);
    for (const y of [0.18, 0.62, 0.88])
      cyl("metal_rusty", region, x, y, z, 0.3, 0.3, 0.035, 16);
    // charred wood + embers inside
    for (let k = 0; k < 4; k++)
      box(
        "wood_planks",
        region,
        x + (rng() - 0.5) * 0.2,
        0.86 + rng() * 0.08,
        z + (rng() - 0.5) * 0.2,
        0.5,
        0.06,
        0.07,
        { ry: rng() * 3, rz: (rng() - 0.5) * 0.6 },
      );
    solid(x - 0.3, 0, z - 0.3, x + 0.3, 0.9, z + 0.3, "metal");
    reserve(x, z, 0.6);
    const top = new THREE.Vector3(x, 0.95, z);
    fireSpots.push(top);
    const seed = rng() * 10;
    for (let k = 0; k < 3; k++) {
      const pl = new THREE.PlaneGeometry(0.62, 1.15, 1, 4);
      pl.translate(0, 0.575, 0);
      pl.rotateY((k * Math.PI) / 3 + seed);
      pl.translate(x, 0.86, z);
      const n = pl.attributes.position.count;
      pl.setAttribute(
        "aSeed",
        new THREE.BufferAttribute(new Float32Array(n).fill(seed + k * 3.7), 1),
      );
      flameGeos.push(pl);
    }
    // interior fires + the one exterior fire seen through the south windows get a real light; the rest are emissive only
    if (zone >= 0 || lights.fires.every((f) => !f.ext)) {
      const light = new THREE.PointLight(0xff8a3a, 0, zone < 0 ? 14 : 15, 2);
      light.position.set(x, 1.55, z);
      root.add(light);
      lights.fires.push({
        light,
        base: zone < 0 ? 20 : 26,
        seed,
        ext: zone < 0,
      });
    }
  }
  const flameMat = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 } },
    vertexShader: `attribute float aSeed; varying vec2 vUv; varying float vS; void main(){ vUv=uv; vS=aSeed; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
    fragmentShader: `uniform float uTime; varying vec2 vUv; varying float vS;
      float h(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7)))*43758.5453); }
      float n2(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f); return mix(mix(h(i),h(i+vec2(1,0)),f.x), mix(h(i+vec2(0,1)),h(i+vec2(1,1)),f.x), f.y); }
      float fbm(vec2 p){ float a=0.5, s=0.0; for(int i=0;i<4;i++){ s+=a*n2(p); p*=2.03; a*=0.5; } return s; }
      void main(){ vec2 uv=vUv; float t=uTime*1.0+vS;
        float n = fbm(vec2(uv.x*3.2 + vS, uv.y*2.6 - t*2.6));
        float x = (uv.x-0.5)*2.0 + (n-0.5)*0.9*uv.y;
        float w = mix(0.95, 0.05, pow(uv.y, 0.8));
        float body = smoothstep(w, w*0.35, abs(x));
        float top = smoothstep(1.0, 0.25, uv.y + (n-0.5)*0.55);
        float a = body*top*smoothstep(0.0, 0.08, uv.y);
        vec3 col = mix(vec3(0.9,0.18,0.02), vec3(1.0,0.62,0.18), smoothstep(0.1,0.7,a));
        col = mix(col, vec3(1.0,0.92,0.7), smoothstep(0.75,1.0,a)*(1.0-uv.y));
        a *= 0.95;
        gl_FragColor = vec4(col*a*2.2, a); }`,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  });
  const flames = new THREE.Mesh(mergeGeometries(flameGeos), flameMat);
  flames.frustumCulled = false;
  flames.renderOrder = 4;
  root.add(flames);

  // ---- light shafts (moon through ceiling holes + north / west windows) ----
  const Ld = MOON_DIR.clone().negate(); // travel direction
  const shaftGeos = [];
  function shaft(corners, len, strength) {
    // corners: 4 Vector3 of the opening rim (in order). Extrude along Ld by len; side quads only.
    for (let i = 0; i < 4; i++) {
      const a = corners[i],
        b = corners[(i + 1) % 4];
      const a2 = a.clone().addScaledVector(Ld, len),
        b2 = b.clone().addScaledVector(Ld, len);
      const g = new THREE.BufferGeometry();
      g.setAttribute(
        "position",
        new THREE.Float32BufferAttribute(
          [
            a.x,
            a.y,
            a.z,
            b.x,
            b.y,
            b.z,
            b2.x,
            b2.y,
            b2.z,
            a.x,
            a.y,
            a.z,
            b2.x,
            b2.y,
            b2.z,
            a2.x,
            a2.y,
            a2.z,
          ],
          3,
        ),
      );
      g.setAttribute(
        "uv",
        new THREE.Float32BufferAttribute(
          [0, 0, 1, 0, 1, 1, 0, 0, 1, 1, 0, 1],
          2,
        ),
      );
      g.setAttribute(
        "aStr",
        new THREE.Float32BufferAttribute(new Array(6).fill(strength), 1),
      );
      shaftGeos.push(g);
    }
  }
  for (const h of HOLES) {
    const y = WALL_H + 0.35;
    shaft(
      [
        new THREE.Vector3(h.x0, y, h.z0),
        new THREE.Vector3(h.x1, y, h.z0),
        new THREE.Vector3(h.x1, y, h.z1),
        new THREE.Vector3(h.x0, y, h.z1),
      ],
      7.5,
      1.0,
    );
  }
  for (const w of windows) {
    const n = w.normal;
    const lit = n.x * Ld.x + n.z * Ld.z;
    if (lit < 0.3) continue;
    const t = new THREE.Vector3(n.z, 0, -n.x);
    const c = w.center.clone().addScaledVector(n, -0.2);
    const cs = [
      [-WIN_W / 2, WIN_Y0],
      [WIN_W / 2, WIN_Y0],
      [WIN_W / 2, WIN_Y1],
      [-WIN_W / 2, WIN_Y1],
    ].map(([u, y]) => c.clone().addScaledVector(t, u).setY(y));
    shaft(cs, 4.2, 0.9);
  }
  const shaftMat = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 } },
    vertexShader: `attribute float aStr; varying vec2 vUv; varying float vS; varying vec3 vW; void main(){ vUv=uv; vS=aStr; vec4 w = modelMatrix*vec4(position,1.0); vW=w.xyz; gl_Position=projectionMatrix*viewMatrix*w; }`,
    fragmentShader: `uniform float uTime; varying vec2 vUv; varying float vS; varying vec3 vW;
      void main(){ float edge = smoothstep(0.0, 0.25, vUv.x) * smoothstep(1.0, 0.75, vUv.x);
        float len = smoothstep(0.0, 0.12, vUv.y) * pow(1.0 - vUv.y, 1.3);
        float motes = 0.8 + 0.2*sin(vW.x*3.1 + vW.y*2.3 + uTime*0.4)*sin(vW.z*2.7 - uTime*0.3);
        float floorFade = smoothstep(0.0, 0.5, vW.y);
        float a = edge * len * motes * floorFade * 0.16 * vS;
        gl_FragColor = vec4(vec3(0.62,0.72,1.0)*a, a); }`,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    fog: false,
  });
  const shafts = new THREE.Mesh(mergeGeometries(shaftGeos), shaftMat);
  shafts.frustumCulled = false;
  shafts.renderOrder = 6;
  root.add(shafts);

  // ---- ground mist (outside only) ----
  const mistTex = canvasTex(
    256,
    256,
    (g) => {
      const id = g.createImageData(256, 256);
      const f = (x, y) => {
        let s = 0,
          a = 1,
          fr = 1 / 64;
        for (let o = 0; o < 4; o++) {
          s +=
            a *
            (0.5 +
              0.5 *
                Math.sin(x * fr * 6.3 + Math.sin(y * fr * 4.1) * 2) *
                Math.sin(y * fr * 5.7 + Math.cos(x * fr * 3.3) * 2));
          a *= 0.5;
          fr *= 2;
        }
        return s / 1.9;
      };
      for (let y = 0; y < 256; y++)
        for (let x = 0; x < 256; x++) {
          const v = f(x, y);
          const i = (y * 256 + x) * 4;
          id.data[i] = id.data[i + 1] = id.data[i + 2] = 255;
          id.data[i + 3] = Math.max(0, Math.min(255, (v - 0.25) * 400));
        }
      g.putImageData(id, 0, 0);
    },
    false,
  );
  mistTex.wrapS = mistTex.wrapT = THREE.RepeatWrapping;
  const mistMat = new THREE.ShaderMaterial({
    uniforms: {
      uTex: { value: mistTex },
      uTime: { value: 0 },
      uCol: { value: new THREE.Color(0x3e4a64) },
    },
    vertexShader: `varying vec3 vW; void main(){ vec4 w = modelMatrix*vec4(position,1.0); vW=w.xyz; gl_Position=projectionMatrix*viewMatrix*w; }`,
    fragmentShader: `uniform sampler2D uTex; uniform float uTime; uniform vec3 uCol; varying vec3 vW;
      void main(){ float a = texture2D(uTex, vW.xz*0.035 + vec2(uTime*0.006, uTime*0.004)).a * texture2D(uTex, vW.xz*0.013 - vec2(uTime*0.003, 0.0)).a;
        // keep the mist outside the bunker footprint (soft edge)
        vec2 p = vW.xz; float inside = 0.0;
        inside = max(inside, (step(-24.4, p.x)*step(p.x, -7.6)*step(-21.4, p.y)*step(p.y, 7.4)));
        inside = max(inside, (step(-8.4, p.x)*step(p.x, 8.4)*step(-7.4, p.y)*step(p.y, 7.4)));
        inside = max(inside, (step(7.6, p.x)*step(p.x, 26.4)*step(-8.4, p.y)*step(p.y, 8.4)));
        float d = length(p - vec2(1.0,-6.5));
        float graze = abs(normalize(cameraPosition - vW).y);
        a *= (1.0 - inside) * smoothstep(90.0, 40.0, d) * smoothstep(0.03, 0.3, graze) * 0.45;
        gl_FragColor = vec4(uCol * a, a); }`,
    transparent: true,
    depthWrite: false,
    fog: false,
  });
  for (const [y, s] of [[0.22, 1]]) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(200, 200), mistMat);
    m.rotation.x = -Math.PI / 2;
    m.position.set(1, y, -6.5);
    m.scale.setScalar(s);
    m.renderOrder = 7;
    root.add(m);
  }

  // ---- per-frame lighting animation ----
  const hash = (n) => {
    const s = Math.sin(n * 127.1) * 43758.5453;
    return s - Math.floor(s);
  };
  let clock = 0,
    frameN = 0;
  const shadowBulbs = lights.bulbs.filter((e) => e.light.castShadow);
  updaters.push((dt, time) => {
    clock += dt;
    frameN++;
    // bulb shadow cubes refresh at half rate, alternating lights (6 faces each is the big shadow cost)
    shadowBulbs.forEach((e, i) => {
      if ((frameN + i) % 2 === 0 && e.light.intensity > 0.05)
        e.light.shadow.needsUpdate = true;
    });
    if (frameN % 2 === 1) moonLight.shadow.needsUpdate = true; // moon shadow at half rate
    flameMat.uniforms.uTime.value = time;
    shaftMat.uniforms.uTime.value = time;
    mistMat.uniforms.uTime.value = time;
    for (const f of lights.fires) {
      const n =
        0.72 +
        0.14 * Math.sin(time * 11 + f.seed) +
        0.1 * Math.sin(time * 23.7 + f.seed * 2) +
        0.06 * Math.sin(time * 5.3);
      f.light.intensity = f.base * n;
    }
    for (const e of lights.bulbs) {
      // power transition
      if (e.powerAt === -2) e.p = 1;
      else if (e.powerAt >= 0) {
        e.powerAt -= dt;
        if (e.powerAt < 0) {
          e.powerAt = -3;
          e.flick = 0.85;
        }
      } else if (e.powerAt === -3) {
        e.flick -= dt;
        e.p = e.flick > 0 ? (Math.random() < 0.5 ? 1 : 0.05) : 1;
        if (e.flick <= 0) e.powerAt = -2;
      } else e.p += (0 - e.p) * Math.min(1, dt * 8);
      // pre-power: sick flicker with dropouts; powered: steady with faint mains ripple
      const q = Math.floor(time * 9 + e.seed);
      const drop = hash(q + e.seed) < 0.07 ? 0.15 : 1;
      const preF = (0.8 + 0.2 * Math.sin(time * 13 + e.seed)) * drop;
      const postF = 0.97 + 0.03 * Math.sin(time * 50 + e.seed);
      const I = lerp(e.pre * preF, e.post * postF, e.p);
      e.light.intensity = I;
      e.bulbMat.emissiveIntensity = Math.min(4.5, I * 0.12);
      e.group.rotation.z = Math.sin(time * 0.9 + e.swayP) * e.swayA;
      e.group.rotation.x = Math.sin(time * 0.7 + e.swayP * 1.3) * e.swayA * 0.7;
    }
    // ambient fill rises with the power cascade
    if (hemiState.delay > 0) hemiState.delay -= dt;
    const hT = hemiState.on && hemiState.delay <= 0 ? 1 : 0;
    hemiState.p += (hT - hemiState.p) * Math.min(1, dt * 1.2);
    hemi.intensity = lerp(HEMI_PRE, HEMI_POST, hemiState.p);
    for (let z = 0; z < 4; z++) {
      const st = zoneLampState[z];
      if (st.at >= 0) {
        st.at -= dt;
        if (st.at < 0) {
          st.at = -3;
          st.fl = 0.9;
        }
      } else if (st.at === -3) {
        st.fl -= dt;
        st.p = st.fl > 0 ? (Math.random() < 0.5 ? 1 : 0) : 1;
        if (st.fl <= 0) st.at = -2;
      } else if (st.at === -2) st.p = 1;
      else st.p = 0;
      zoneLampMats[z].emissiveIntensity = st.p * 4.5;
    }
  });
  void features;
  void tween;
  lights.zoneLamps = zoneLampMats;
  return { lights, fireSpots };
}
