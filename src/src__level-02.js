// src__level 02 — three
// Lines 132-2280 of readable/src__level.pretty.js (statement-aligned).
export function buildLevel(scene, T) {
  const root = new THREE.Group();
  root.name = "BlackwaldBunker";
  scene.add(root);
  const rng = mulberry32(1945);
  const R = (a, b) => a + (b - a) * rng();
  const pick = (arr) => arr[Math.floor(rng() * arr.length)];

  const fallbackMat = new THREE.MeshStandardMaterial({
    color: 0x808080,
    roughness: 0.9,
  });
  const rawMat = (n) => {
    try {
      return (T && T.mat && T.mat(n)) || fallbackMat;
    } catch (e) {
      return fallbackMat;
    }
  };
  // Anti-tiling for big architectural surfaces: every map is sampled twice (second copy rescaled +
  // offset) and blended by low-frequency world-UV noise, then pulled a little toward the texture's
  // mean colour. Kills the 2 m repeat of high-contrast features (plaster blotches, floor stains).
  const ANTI_TILE = {
    plaster_damaged: 0.42,
    concrete_floor: 0.22,
    concrete_wall: 0.15,
    dirt_ground: 0.2,
  };
  const ANTI_GLSL = `
          float atHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
          float atNoise(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
            return mix(mix(atHash(i), atHash(i + vec2(1, 0)), f.x), mix(atHash(i + vec2(0, 1)), atHash(i + vec2(1, 1)), f.x), f.y); }
          // three decorrelated copies (different scale/offset), weights from two noise octaves ~1.5-4 m
          vec4 atSample(sampler2D t, vec2 uv) {
            float n1 = atNoise(uv * 0.72) * 0.7 + atNoise(uv * 1.9 + 3.1) * 0.3;
            float n2 = atNoise(uv * 0.53 + 11.7) * 0.7 + atNoise(uv * 1.6 + 5.9) * 0.3;
            vec4 a = texture2D(t, uv);
            vec4 b = texture2D(t, uv * 0.71 + vec2(0.37, 0.71));
            vec4 c = texture2D(t, uv * 1.31 + vec2(0.83, 0.19));
            return mix(mix(a, b, smoothstep(0.35, 0.65, n1)), c, smoothstep(0.42, 0.72, n2) * 0.8);
          }`;
  // Light-leak guard: the bunker has no shadowing for most point lights, so an interior bulb would
  // light the dirt outside (and the outside fire the floor inside). A point light only affects a
  // surface on the same side of the building shell (footprint = union of three rects).
  const SIDE_GLSL = `
          float lvInRect(vec2 p, vec4 r) { return step(r.x, p.x) * step(p.x, r.y) * step(r.z, p.y) * step(p.y, r.w); }
          float lvInside(vec3 w) { vec2 p = w.xz;
            return max(max(lvInRect(p, vec4(-24.1, -7.9, -21.1, 7.1)), lvInRect(p, vec4(-8.1, 8.1, -7.1, 7.1))), lvInRect(p, vec4(7.9, 26.1, -8.1, 8.1))); }
          vec3 lvWorld(vec3 viewPos) { return transpose(mat3(viewMatrix)) * (viewPos - viewMatrix[3].xyz); }
          float lvSameSide(vec3 lightView, vec3 fragView) { return 1.0 - abs(lvInside(lvWorld(lightView)) - lvInside(lvWorld(fragView))); }`;
  const matVariants = new Map();
  // variant of a material: anti-tiling (by name) and/or light-side guard (static world geometry)
  function variant(base, name, anti, side) {
    if ((!anti && !side) || !base.isMeshStandardMaterial) return base;
    if (anti && !base.map) anti = false;
    if (!anti && !side) return base;
    const key = base.uuid + (anti ? "|a" : "") + (side ? "|s" : "");
    if (matVariants.has(key)) return matVariants.get(key);
    const m = base.clone();
    const soften = anti ? ANTI_TILE[name].toFixed(3) : "0.0";
    m.onBeforeCompile = (sh) => {
      const S = THREE.ShaderChunk;
      let f = sh.fragmentShader.replace(
        "#include <common>",
        "#include <common>\n" +
          (anti ? ANTI_GLSL : "") +
          (side ? SIDE_GLSL : ""),
      );
      if (anti) {
        f = f
          .replace(
            "#include <map_fragment>",
            S.map_fragment.replace(
              "texture2D( map, vMapUv )",
              "mix(atSample( map, vMapUv ), texture2D( map, vMapUv, 9.0 ), " +
                soften +
                ")",
            ),
          )
          .replace(
            "#include <normal_fragment_maps>",
            S.normal_fragment_maps.replace(
              /texture2D\( normalMap, vNormalMapUv \)/g,
              "atSample( normalMap, vNormalMapUv )",
            ),
          )
          .replace(
            "#include <roughnessmap_fragment>",
            S.roughnessmap_fragment.replace(
              "texture2D( roughnessMap, vRoughnessMapUv )",
              "atSample( roughnessMap, vRoughnessMapUv )",
            ),
          );
      }
      if (side) {
        f = f.replace(
          "#include <lights_fragment_begin>",
          S.lights_fragment_begin.replace(
            "getPointLightInfo( pointLight, geometryPosition, directLight );",
            "getPointLightInfo( pointLight, geometryPosition, directLight ); directLight.color *= lvSameSide( pointLight.position, geometryPosition );",
          ),
        );
      }
      sh.fragmentShader = f;
    };
    m.customProgramCacheKey = () =>
      "level-v2-" + (anti ? "a-" + name : "") + (side ? "-s" : "");
    matVariants.set(key, m);
    return m;
  }
  const antiTiled = (name) => variant(rawMat(name), name, true, false);
  const mat = (n) => (ANTI_TILE[n] !== undefined ? antiTiled(n) : rawMat(n));

  // ---- groups -------------------------------------------------------------------------------
  const staticGroup = new THREE.Group();
  staticGroup.name = "static";
  root.add(staticGroup);
  const roofGroup = new THREE.Group();
  roofGroup.name = "ceiling";
  root.add(roofGroup);
  const dynGroup = new THREE.Group();
  dynGroup.name = "dynamic";
  root.add(dynGroup);
  const rayGroup = new THREE.Group();
  rayGroup.name = "raycastProxies";
  rayGroup.visible = false;
  root.add(rayGroup);

  // ---- merge buckets ------------------------------------------------------------------------
  const buckets = new Map();
  function emit(geo, m, region = "misc", cast = true) {
    const material =
      typeof m === "string"
        ? variant(rawMat(m), m, ANTI_TILE[m] !== undefined, true)
        : variant(m, "", false, true);
    if (region === "ext" || region === "walls") {
      // spatial split so frustum culling (camera + point-light shadow cubes) can reject far chunks
      geo.computeBoundingBox();
      const c = geo.boundingBox.getCenter(new THREE.Vector3());
      const cs = region === "ext" ? 36 : 20;
      region = region + ":" + Math.floor(c.x / cs) + "," + Math.floor(c.z / cs);
    }
    const key = region + "|" + material.uuid + "|" + (cast ? 1 : 0);
    let b = buckets.get(key);
    if (!b) {
      b = { material, region, cast, geos: [] };
      buckets.set(key, b);
    }
    b.geos.push(prep(geo));
  }
  const _m4 = new THREE.Matrix4(),
    _q = new THREE.Quaternion(),
    _e = new THREE.Euler(),
    _one = new THREE.Vector3(1, 1, 1),
    _p = new THREE.Vector3();
  function xform(g, x, y, z, rx = 0, ry = 0, rz = 0, s) {
    _e.set(rx, ry, rz, "YXZ");
    _q.setFromEuler(_e);
    _m4.compose(_p.set(x, y, z), _q, s || _one);
    g.applyMatrix4(_m4);
    return g;
  }
  // box centred at (x,y,z). o: {rx,ry,rz, uv:'local'|'world'|'raw', cast, region, uvs}
  function box(m, region, x, y, z, sx, sy, sz, o = {}) {
    let g = prep(new THREE.BoxGeometry(sx, sy, sz));
    if (o.uv !== "world" && o.uv !== "raw")
      projUV(g, o.uvs ?? 0.5, rng() * 4, rng() * 4);
    xform(g, x, y, z, o.rx || 0, o.ry || 0, o.rz || 0);
    if (o.uv === "world") projUV(g, 0.5);
    emit(g, m, region, o.cast !== false);
    return g;
  }
  // box with bottom at y0
  const boxB = (m, region, x, y0, z, sx, sy, sz, o) =>
    box(m, region, x, y0 + sy / 2, z, sx, sy, sz, o);
  function cylGeo(rt, rb, h, seg = 12, open = false, uvMetres = true) {
    const g = prep(new THREE.CylinderGeometry(rt, rb, h, seg, 1, open));
    if (uvMetres) {
      const uv = g.attributes.uv,
        side = seg * 6;
      const cu = (Math.PI * (rt + rb)) / 2,
        cv = h / 2,
        cr = Math.max(rt, rb);
      for (let i = 0; i < uv.count; i++) {
        if (i < side) uv.setXY(i, uv.getX(i) * cu, uv.getY(i) * cv);
        else uv.setXY(i, uv.getX(i) * cr, uv.getY(i) * cr);
      }
    }
    return g;
  }
  function cyl(m, region, x, y, z, rt, rb, h, seg = 12, o = {}) {
    const g = cylGeo(rt, rb, h, seg, !!o.open, o.uv !== "raw");
    xform(g, x, y, z, o.rx || 0, o.ry || 0, o.rz || 0);
    emit(g, m, region, o.cast !== false);
    return g;
  }
  function anyGeo(g, m, region, x, y, z, o = {}) {
    g = prep(g);
    if (o.uv === "local") projUV(g, o.uvs ?? 0.5, rng() * 4, rng() * 4);
    xform(g, x, y, z, o.rx || 0, o.ry || 0, o.rz || 0, o.s);
    if (o.uv === "world") projUV(g, 0.5);
    emit(g, m, region, o.cast !== false);
    return g;
  }
  // quad from 4 corners, normal n (winding auto-fixed), world-space UVs (metres/2)
  function quad(m, region, a, b, c, d, n, cast = true) {
    const e1 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]],
      e2 = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    const cr = [
      e1[1] * e2[2] - e1[2] * e2[1],
      e1[2] * e2[0] - e1[0] * e2[2],
      e1[0] * e2[1] - e1[1] * e2[0],
    ];
    if (cr[0] * n[0] + cr[1] * n[1] + cr[2] * n[2] < 0) {
      const t = b;
      b = d;
      d = t;
    }
    const pts = [a, b, c, a, c, d];
    const pos = new Float32Array(18),
      nor = new Float32Array(18);
    for (let i = 0; i < 6; i++) {
      pos.set(pts[i], i * 3);
      nor.set(n, i * 3);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    g.setAttribute("normal", new THREE.BufferAttribute(nor, 3));
    g.setAttribute("uv", new THREE.BufferAttribute(new Float32Array(12), 2));
    projUV(g, 0.5);
    emit(g, m, region, cast);
  }

  // ---- colliders + raycast proxies ----------------------------------------------------------
  const colliders = [];
  const raycastTargets = [];
  const proxyGeo = new THREE.BoxGeometry(1, 1, 1);
  const proxyMat = new THREE.MeshBasicMaterial({ color: 0xff00ff });
  function rayProxy(b, surface) {
    const m = new THREE.Mesh(proxyGeo, proxyMat);
    b.getCenter(m.position);
    b.getSize(m.scale);
    m.userData.surface = surface;
    m.name = "ray:" + surface;
    rayGroup.add(m);
    m.updateMatrixWorld(true);
    raycastTargets.push(m);
    return m;
  }
  // solid(minx,miny,minz,maxx,maxy,maxz, surface, {col, ray, noLOS, tag})
  function solid(x0, y0, z0, x1, y1, z1, surface = "concrete", o = {}) {
    const b = new THREE.Box3(
      new THREE.Vector3(Math.min(x0, x1), Math.min(y0, y1), Math.min(z0, z1)),
      new THREE.Vector3(Math.max(x0, x1), Math.max(y0, y1), Math.max(z0, z1)),
    );
    if (o.noLOS) b.noLOS = true;
    if (o.tag) b.tag = o.tag;
    if (o.col !== false) colliders.push(b);
    if (o.ray !== false) b.proxy = rayProxy(b, surface);
    return b;
  }
  // centred footprint helper
  const solidC = (x, z, sx, sz, h, surface, o) =>
    solid(x - sx / 2, 0, z - sz / 2, x + sx / 2, h, z + sz / 2, surface, o);

  // reserved circles: keep clutter away from gameplay spots
  const reserved = [];
  const reserve = (x, z, r) => reserved.push({ x, z, r });
  const isFree = (x, z, r = 0) =>
    reserved.every((c) => Math.hypot(c.x - x, c.z - z) > c.r + r);

  // ---- zones --------------------------------------------------------------------------------
  const ZDEF = [
    {
      id: 0,
      name: "Command Post",
      x0: -8,
      x1: 8,
      z0: -7,
      z1: 7,
      floor: "concrete_floor",
      lo: "concrete_wall",
      hi: "plaster_damaged",
      rail: "wood_planks",
    },
    {
      id: 1,
      name: "Radio Room",
      x0: -24,
      x1: -8,
      z0: -7,
      z1: 7,
      floor: "wood_floor",
      lo: "wood_planks",
      hi: "plaster_damaged",
      rail: "wood_planks",
    },
    {
      id: 2,
      name: "Armory Hall",
      x0: 8,
      x1: 26,
      z0: -8,
      z1: 8,
      floor: "concrete_floor",
      lo: "concrete_wall",
      hi: "brick_old",
      rail: "concrete_wall",
    },
    {
      id: 3,
      name: "Generator Vault",
      x0: -24,
      x1: -8,
      z0: -21,
      z1: -7,
      floor: "tile_floor",
      lo: "metal_painted_green",
      hi: "concrete_wall",
      rail: "metal_rusty",
    },
  ];
  const zones = ZDEF.map((z) => ({
    id: z.id,
    name: z.name,
    bounds: new THREE.Box3(
      new THREE.Vector3(z.x0, 0, z.z0),
      new THREE.Vector3(z.x1, WALL_H, z.z1),
    ),
  }));
  function zoneAt(p) {
    for (const z of ZDEF)
      if (p.x >= z.x0 && p.x <= z.x1 && p.z >= z.z0 && p.z <= z.z1) return z.id;
    return -1;
  }

  // ---- tween system -------------------------------------------------------------------------
  const tweens = [];
  function tween(dur, fn, o = {}) {
    const tw = {
      t: -(o.delay || 0),
      dur: Math.max(1e-4, dur),
      fn,
      ease: o.ease || ((k) => k),
      done: o.done,
      alive: true,
    };
    tweens.push(tw);
    return tw;
  }
  const tweenP = (dur, fn, o = {}) =>
    new Promise((res) =>
      tween(dur, fn, {
        ...o,
        done: () => {
          o.done && o.done();
          res();
        },
      }),
    );
  const wait = (s) => new Promise((res) => tween(s, () => {}, { done: res }));

  // =============================================================================================
  // WALLS
  // =============================================================================================
  // opening specs; windows and doors filled below
  const WIN_SPECS = [
    { zone: 0, wall: "H2b", at: 3.5 },
    { zone: 0, wall: "H3b", at: -4.5 },
    { zone: 0, wall: "H3b", at: 4.5 },
    { zone: 1, wall: "H3a", at: -17 },
    { zone: 1, wall: "V1b", at: 1.5 },
    { zone: 2, wall: "H4", at: 19 },
    { zone: 2, wall: "H5", at: 17 },
    { zone: 2, wall: "V4", at: -3 },
    { zone: 3, wall: "H1", at: -16 },
    { zone: 3, wall: "V1a", at: -14 },
    { zone: 3, wall: "V2a", at: -16 },
  ];
  const DOOR_SPECS = [
    {
      id: 0,
      wall: "V2b",
      at: 0,
      zoneA: 0,
      zoneB: 1,
      cost: 750,
      label: "Clear Debris",
      kind: "debris",
    },
    {
      id: 1,
      wall: "V3",
      at: 0,
      zoneA: 0,
      zoneB: 2,
      cost: 1000,
      label: "Open Door",
      kind: "steel",
    },
    {
      id: 2,
      wall: "H2a",
      at: -16,
      zoneA: 1,
      zoneB: 3,
      cost: 1250,
      label: "Open Gate",
      kind: "gate",
    },
  ];
  // axis 'x': wall runs along x at z=c ; neg side = -z. axis 'z': runs along z at x=c ; neg side = -x
  const WALLS = [
    { id: "H1", axis: "x", c: -21, a0: -24.2, a1: -7.8, neg: "ext", pos: 3 },
    { id: "H2a", axis: "x", c: -7, a0: -24.2, a1: -7.8, neg: 3, pos: 1 },
    { id: "H2b", axis: "x", c: -7, a0: -7.8, a1: 7.8, neg: "ext", pos: 0 },
    { id: "H3a", axis: "x", c: 7, a0: -24.2, a1: -7.8, neg: 1, pos: "ext" },
    { id: "H3b", axis: "x", c: 7, a0: -7.8, a1: 7.8, neg: 0, pos: "ext" },
    { id: "H4", axis: "x", c: -8, a0: 7.8, a1: 26.2, neg: "ext", pos: 2 },
    { id: "H5", axis: "x", c: 8, a0: 7.8, a1: 26.2, neg: 2, pos: "ext" },
    { id: "V1a", axis: "z", c: -24, a0: -20.8, a1: -7.2, neg: "ext", pos: 3 },
    { id: "V1b", axis: "z", c: -24, a0: -6.8, a1: 6.8, neg: "ext", pos: 1 },
    { id: "V2a", axis: "z", c: -8, a0: -20.8, a1: -7.2, neg: 3, pos: "ext" },
    { id: "V2b", axis: "z", c: -8, a0: -6.8, a1: 6.8, neg: 1, pos: 0 },
    { id: "V3", axis: "z", c: 8, a0: -7.8, a1: 7.8, neg: 0, pos: 2 },
    { id: "V4", axis: "z", c: 26, a0: -7.8, a1: 7.8, neg: 2, pos: "ext" },
  ];
  const wallById = Object.fromEntries(WALLS.map((w) => [w.id, w]));
  for (const w of WALLS) w.openings = [];
  WIN_SPECS.forEach((s, i) => {
    wallById[s.wall].openings.push({
      kind: "window",
      at: s.at,
      w: WIN_W,
      y0: WIN_Y0,
      y1: WIN_Y1,
      idx: i,
    });
  });
  DOOR_SPECS.forEach((s) => {
    wallById[s.wall].openings.push({
      kind: "door",
      at: s.at,
      w: DOOR_W,
      y0: 0,
      y1: DOOR_H,
      idx: s.id,
    });
  });

  // wall-local -> world
  const WP = (w, along, y, off) =>
    w.axis === "x" ? [along, y, w.c + off] : [w.c + off, y, along];
  const WN = (w, s) => (w.axis === "x" ? [0, 0, s] : [s, 0, 0]);
  const AX = (w, s) => (w.axis === "x" ? [s, 0, 0] : [0, 0, s]);
  // world point on the wall centre-line at `along`
  const wallPoint = (w, along) =>
    w.axis === "x"
      ? new THREE.Vector3(along, 0, w.c)
      : new THREE.Vector3(w.c, 0, along);
  // inward normal (towards zone) for a wall + zone
  const inwardN = (w, zone) => {
    const s = w.pos === zone ? 1 : -1;
    return w.axis === "x"
      ? new THREE.Vector3(0, 0, s)
      : new THREE.Vector3(s, 0, 0);
  };

  function faceStyle(side) {
    if (side === "ext")
      return {
        lo: "concrete_wall",
        hi: "brick_old",
        split: 0.55,
        region: "ext",
        rail: null,
      };
    const z = ZDEF[side];
    return {
      lo: z.lo,
      hi: z.hi,
      split: z.lo === z.hi ? 0 : 1.15,
      region: "z" + side,
      rail: z.rail,
    };
  }
  function wallFace(w, sideSign, side, s, e, y0, y1) {
    const st = faceStyle(side);
    const off = sideSign * HW,
      n = WN(w, sideSign);
    const put = (m, ya, yb) => {
      if (yb - ya < 1e-3) return;
      quad(
        m,
        st.region,
        WP(w, s, ya, off),
        WP(w, e, ya, off),
        WP(w, e, yb, off),
        WP(w, s, yb, off),
        n,
      );
    };
    if (st.split > 0) {
      put(st.lo, y0, Math.min(y1, st.split));
      put(st.hi, Math.max(y0, st.split), y1);
      // dado rail / plinth cap
      if (st.rail && y0 < st.split && y1 > st.split) {
        const mid = (s + e) / 2,
          len = e - s;
        const p = WP(w, mid, st.split, sideSign * (HW + 0.025));
        box(
          st.rail,
          st.region,
          p[0],
          p[1],
          p[2],
          w.axis === "x" ? len : 0.05,
          0.07,
          w.axis === "x" ? 0.05 : len,
          { uv: "world" },
        );
      }
    } else put(st.hi, y0, y1);
    // skirting
    if (side !== "ext" && y0 < 0.01) {
      const mid = (s + e) / 2,
        len = e - s;
      const p = WP(w, mid, 0.08, sideSign * (HW + 0.015));
      box(
        "concrete_wall",
        st.region,
        p[0],
        p[1],
        p[2],
        w.axis === "x" ? len : 0.03,
        0.16,
        w.axis === "x" ? 0.03 : len,
        { uv: "world", cast: false },
      );
    }
  }
  function buildWall(w) {
    const ops = [...w.openings].sort((a, b) => a.at - b.at);
    let cur = w.a0;
    const pieces = [];
    for (const o of ops) {
      const s = o.at - o.w / 2,
        e = o.at + o.w / 2;
      pieces.push({ s: cur, e: s, y0: 0, y1: WALL_H, jamb: "e" });
      if (o.y0 > 0) pieces.push({ s, e, y0: 0, y1: o.y0, sill: true });
      pieces.push({ s, e, y0: o.y1, y1: WALL_H, head: true, kind: o.kind });
      o.s = s;
      o.e = e;
      cur = e;
    }
    pieces.push({ s: cur, e: w.a1, y0: 0, y1: WALL_H });
    // jambs: a full piece whose end touches an opening start, or start touches opening end
    for (const p of pieces) {
      if (p.e - p.s < 1e-3) continue;
      wallFace(w, -1, w.neg, p.s, p.e, p.y0, p.y1);
      wallFace(w, +1, w.pos, p.s, p.e, p.y0, p.y1);
      // top of wall (hidden by roof, visible in overview)
      if (p.y1 >= WALL_H)
        quad(
          "concrete_wall",
          "roof",
          WP(w, p.s, WALL_H, -HW),
          WP(w, p.e, WALL_H, -HW),
          WP(w, p.e, WALL_H, HW),
          WP(w, p.s, WALL_H, HW),
          [0, 1, 0],
          false,
        );
      if (p.sill)
        quad(
          "concrete_wall",
          "walls",
          WP(w, p.s, p.y1, -HW),
          WP(w, p.e, p.y1, -HW),
          WP(w, p.e, p.y1, HW),
          WP(w, p.s, p.y1, HW),
          [0, 1, 0],
        );
      if (p.head)
        quad(
          "concrete_wall",
          "walls",
          WP(w, p.s, p.y0, -HW),
          WP(w, p.e, p.y0, -HW),
          WP(w, p.e, p.y0, HW),
          WP(w, p.s, p.y0, HW),
          [0, -1, 0],
        );
      // collider + ray proxy
      const a = WP(w, p.s, p.y0, -HW),
        b = WP(w, p.e, p.y1, HW);
      solid(a[0], a[1], a[2], b[0], b[1], b[2], "concrete");
    }
    // reveals (jambs) for each opening + end caps
    for (const o of ops) {
      const jamb = (at, sign) =>
        quad(
          "concrete_wall",
          "walls",
          WP(w, at, o.y0, -HW),
          WP(w, at, o.y0, HW),
          WP(w, at, o.y1, HW),
          WP(w, at, o.y1, -HW),
          AX(w, sign),
        );
      jamb(o.s, +1);
      jamb(o.e, -1);
    }
    const cap = (at, sign) =>
      quad(
        "concrete_wall",
        "walls",
        WP(w, at, 0, -HW),
        WP(w, at, 0, HW),
        WP(w, at, WALL_H, HW),
        WP(w, at, WALL_H, -HW),
        AX(w, sign),
      );
    cap(w.a0, -1);
    cap(w.a1, +1);
  }
  WALLS.forEach(buildWall);

  // lintels (concrete beam over doors, both faces) + door thresholds
  for (const ds of DOOR_SPECS) {
    const w = wallById[ds.wall];
    const p = WP(w, ds.at, DOOR_H + 0.14, 0);
    box(
      "concrete_wall",
      "walls",
      p[0],
      p[1],
      p[2],
      w.axis === "x" ? DOOR_W + 0.7 : WT + 0.12,
      0.28,
      w.axis === "x" ? WT + 0.12 : DOOR_W + 0.7,
      { uv: "world" },
    );
    const t = WP(w, ds.at, 0.01, 0);
    box(
      "concrete_floor",
      "walls",
      t[0],
      t[1],
      t[2],
      w.axis === "x" ? DOOR_W : WT + 0.1,
      0.02,
      w.axis === "x" ? WT + 0.1 : DOOR_W,
      { uv: "world", cast: false },
    );
    const c = wallPoint(w, ds.at);
    reserve(c.x, c.z, 2.0);
  }

  // ---- floors, roof, ground -----------------------------------------------------------------
  const HOLES = [
    { zone: 0, x0: 4.2, x1: 6.3, z0: -3.6, z1: -2.0 },
    { zone: 2, x0: 12.6, x1: 14.8, z0: -5.2, z1: -3.4 },
    { zone: 3, x0: -21.6, x1: -20.0, z0: -12.8, z1: -11.2 },
  ];
  for (const z of ZDEF) {
    quad(
      z.floor,
      "z" + z.id,
      [z.x0, 0, z.z0],
      [z.x1, 0, z.z0],
      [z.x1, 0, z.z1],
      [z.x0, 0, z.z1],
      [0, 1, 0],
      false,
    );
    solid(
      z.x0,
      -0.3,
      z.z0,
      z.x1,
      0,
      z.z1,
      z.floor === "wood_floor" ? "wood" : "concrete",
      { col: false },
    );
    // roof slab split around holes
    const hole = HOLES.find((h) => h.zone === z.id);
    const rects = [];
    if (!hole) rects.push([z.x0, z.z0, z.x1, z.z1]);
    else {
      rects.push([z.x0, z.z0, z.x1, hole.z0]);
      rects.push([z.x0, hole.z1, z.x1, z.z1]);
      rects.push([z.x0, hole.z0, hole.x0, hole.z1]);
      rects.push([hole.x1, hole.z0, z.x1, hole.z1]);
    }
    for (const [a, b, c, d] of rects) {
      if (c - a < 1e-3 || d - b < 1e-3) continue;
      // underside (ceiling) and top
      quad(
        "concrete_wall",
        "roof",
        [a, WALL_H, b],
        [c, WALL_H, b],
        [c, WALL_H, d],
        [a, WALL_H, d],
        [0, -1, 0],
      );
      quad(
        "concrete_floor",
        "roof",
        [a, WALL_H + 0.35, b],
        [c, WALL_H + 0.35, b],
        [c, WALL_H + 0.35, d],
        [a, WALL_H + 0.35, d],
        [0, 1, 0],
      );
      solid(a, WALL_H, b, c, WALL_H + 0.35, d, "concrete", { col: false });
    }
    if (hole) {
      // hole rim faces
      const y0 = WALL_H,
        y1 = WALL_H + 0.35;
      quad(
        "concrete_wall",
        "roof",
        [hole.x0, y0, hole.z0],
        [hole.x1, y0, hole.z0],
        [hole.x1, y1, hole.z0],
        [hole.x0, y1, hole.z0],
        [0, 0, 1],
      );
      quad(
        "concrete_wall",
        "roof",
        [hole.x0, y0, hole.z1],
        [hole.x1, y0, hole.z1],
        [hole.x1, y1, hole.z1],
        [hole.x0, y1, hole.z1],
        [0, 0, -1],
      );
      quad(
        "concrete_wall",
        "roof",
        [hole.x0, y0, hole.z0],
        [hole.x0, y0, hole.z1],
        [hole.x0, y1, hole.z1],
        [hole.x0, y1, hole.z0],
        [1, 0, 0],
      );
      quad(
        "concrete_wall",
        "roof",
        [hole.x1, y0, hole.z0],
        [hole.x1, y0, hole.z1],
        [hole.x1, y1, hole.z1],
        [hole.x1, y1, hole.z0],
        [-1, 0, 0],
      );
    }
  }
  // roof parapet edge (outer rim of the building, reads as a slab lip from outside)
  // exterior ground
  {
    const g = prep(new THREE.PlaneGeometry(260, 260, 1, 1));
    xform(g, 0, -0.012, -6, -Math.PI / 2, 0, 0);
    projUV(g, 0.5);
    emit(g, "dirt_ground", "ground", false);
    solid(-130, -1, -136, 130, -0.012, 124, "dirt", { col: false });
  }

  const updaters = [];
  const powerables = []; // {x,z, set(on, delay, instant)}
  // =============================================================================================
  // WINDOWS
  // =============================================================================================
  const windows = [];
  const plankProxies = [];
  const plankMat = mat("wood_board");
  const plankGeo = new THREE.BoxGeometry(1.62, 0.2, 0.04);
  function buildWindow(spec, idx) {
    const w = wallById[spec.wall];
    const n = inwardN(w, spec.zone);
    const c = wallPoint(w, spec.at);
    const yaw = yawFromDir(n.x, n.z);
    const g = new THREE.Group();
    g.position.copy(c);
    g.rotation.y = Math.atan2(n.x, n.z); // local +Z = inward
    dynGroup.add(g);
    // timber frame on the inside face + outside reveal frame (merged in static)
    const frame = (lx, ly, lz, sx, sy, sz) => {
      const v = new THREE.Vector3(lx, ly, lz)
        .applyAxisAngle(new THREE.Vector3(0, 1, 0), g.rotation.y)
        .add(c);
      const isX = Math.abs(n.z) > 0.5; // local x maps to world x when wall runs along x
      box(
        "wood_planks",
        "z" + spec.zone,
        v.x,
        v.y,
        v.z,
        isX ? sx : sz,
        sy,
        isX ? sz : sx,
        { uvs: 0.5 },
      );
    };
    const fz = HW + 0.04;
    frame(
      -WIN_W / 2 - 0.07,
      (WIN_Y0 + WIN_Y1) / 2,
      fz,
      0.14,
      WIN_Y1 - WIN_Y0 + 0.28,
      0.08,
    );
    frame(
      WIN_W / 2 + 0.07,
      (WIN_Y0 + WIN_Y1) / 2,
      fz,
      0.14,
      WIN_Y1 - WIN_Y0 + 0.28,
      0.08,
    );
    frame(0, WIN_Y1 + 0.07, fz, WIN_W + 0.28, 0.14, 0.08);
    frame(0, WIN_Y0 - 0.05, fz + 0.02, WIN_W + 0.36, 0.1, 0.14);
    // planks
    const prng = mulberry32(100 + idx * 17);
    const rests = [
      { y: 1.02, rz: 0.1 },
      { y: 1.3, rz: -0.12 },
      { y: 1.56, rz: 0.06 },
      { y: 1.82, rz: -0.08 },
      { y: 2.08, rz: 0.12 },
      { y: 1.55, rz: -0.52 },
    ].map((r, i) => ({
      x: (prng() - 0.5) * 0.12,
      y: r.y + (prng() - 0.5) * 0.05,
      z: HW + 0.075 + i * 0.012,
      rz: r.rz + (prng() - 0.5) * 0.08,
      ry: (prng() - 0.5) * 0.04,
    }));
    const slots = rests.map((rest, i) => {
      const m = new THREE.Object3D(); // proxy; rendered through one shared InstancedMesh
      plankProxies.push(m);
      m.position.set(rest.x, rest.y, rest.z);
      m.rotation.set(0, rest.ry, rest.rz, "YXZ");
      g.add(m);
      return { i, rest, mesh: m, on: true, tw: null };
    });
    const outsidePos = c.clone().addScaledVector(n, -3.7);
    const attackPos = c.clone().addScaledVector(n, -(HW + 0.6));
    const insidePos = c.clone().addScaledVector(n, HW + 0.8);
    const interactPos = c.clone().addScaledVector(n, HW + 1.0);
    // collider plug (player can't leave; zombies vault scripted). noLOS so it doesn't block sight/shots.
    const along0 = spec.at - WIN_W / 2,
      along1 = spec.at + WIN_W / 2;
    const a = WP(w, along0, 0, -HW),
      b = WP(w, along1, WALL_H, HW);
    const plug = solid(a[0], a[1], a[2], b[0], b[1], b[2], "wood", {
      ray: false,
      noLOS: true,
      tag: "window",
    });
    reserve(c.x, c.z, 1.6);
    reserve(insidePos.x, insidePos.z, 1.2);
    reserve(outsidePos.x, outsidePos.z, 1.8);
    reserve(attackPos.x, attackPos.z, 1.2);

    const setPose = (m, p, r) => {
      m.position.copy(p);
      m.rotation.set(r.x, r.y, r.z, "YXZ");
    };
    const restPos = (s) => new THREE.Vector3(s.rest.x, s.rest.y, s.rest.z);
    const restRot = (s) => new THREE.Vector3(0, s.rest.ry, s.rest.rz);
    function tearAnim(s) {
      if (s.tw) s.tw.alive = false;
      const m = s.mesh;
      m.visible = true;
      m.scale.set(1, 1, 1);
      const p0 = m.position.clone(),
        r0 = new THREE.Vector3(m.rotation.x, m.rotation.y, m.rotation.z);
      const p1 = new THREE.Vector3(
        (prng() - 0.5) * 1.6,
        0.03,
        -(HW + 1.1 + prng() * 1.3),
      );
      const spin = (prng() < 0.5 ? -1 : 1) * Math.PI * 2;
      const r1 = new THREE.Vector3(
        Math.PI / 2,
        (prng() - 0.5) * 2.4 + spin,
        (prng() - 0.5) * 0.3,
      );
      const dur = 0.75;
      s.tw = tween(
        dur,
        (k) => {
          // first pull straight out of the frame then arc to the ground
          const e = easeOut(k);
          const p = new THREE.Vector3().lerpVectors(p0, p1, e);
          p.y =
            lerp(p0.y, p1.y, k * k) + Math.sin(Math.PI * k) * 0.55 * (1 - k);
          if (k < 0.25) p.x = lerp(p0.x, p0.x * 0.3, k / 0.25);
          m.position.copy(p);
          m.rotation.set(
            lerp(r0.x, r1.x, e),
            lerp(r0.y, r1.y, e),
            lerp(r0.z, r1.z, e),
            "YXZ",
          );
        },
        {
          done: () => {
            s.tw = tween(
              1.0,
              (k) => {
                m.position.y = p1.y - k * 0.06;
                m.scale.setScalar(1 - k * 0.85);
              },
              {
                delay: 3.5,
                done: () => {
                  m.visible = false;
                  m.scale.setScalar(1);
                  s.tw = null;
                },
              },
            );
          },
        },
      );
    }
    function addAnim(s) {
      if (s.tw) s.tw.alive = false;
      const m = s.mesh;
      if (!m.visible) {
        m.visible = true;
        m.scale.setScalar(1);
        setPose(
          m,
          new THREE.Vector3((prng() - 0.5) * 1.4, 0.04, -(HW + 1.0 + prng())),
          new THREE.Vector3(Math.PI / 2, prng() * 3, 0),
        );
      }
      m.scale.setScalar(1);
      const p0 = m.position.clone(),
        r0 = new THREE.Vector3(m.rotation.x, m.rotation.y, m.rotation.z);
      const p1 = restPos(s),
        r1 = restRot(s);
      s.tw = tween(
        0.42,
        (k) => {
          const e = easeIn(k) * 0.7 + k * 0.3;
          const p = new THREE.Vector3().lerpVectors(p0, p1, e);
          p.y += Math.sin(Math.PI * k) * 0.5;
          m.position.copy(p);
          m.rotation.set(
            lerp(r0.x, r1.x, e),
            lerp(r0.y, r1.y, e),
            lerp(r0.z, r1.z, e),
            "YXZ",
          );
        },
        {
          done: () => {
            // slam: tiny overshoot into the frame
            s.tw = tween(
              0.12,
              (k) => {
                m.position.z = p1.z - Math.sin(Math.PI * k) * 0.03;
              },
              {
                done: () => {
                  setPose(m, p1, r1);
                  s.tw = null;
                },
              },
            );
          },
        },
      );
    }
    const snapOn = (s) => {
      if (s.tw) s.tw.alive = false;
      s.tw = null;
      s.mesh.visible = true;
      s.mesh.scale.setScalar(1);
      setPose(s.mesh, restPos(s), restRot(s));
    };
    const snapOff = (s) => {
      if (s.tw) s.tw.alive = false;
      s.tw = null;
      s.mesh.visible = false;
      s.mesh.scale.setScalar(1);
    };
    // delayed start helper (keeps multi-plank jumps readable instead of all planks flying at once)
    const later = (s, delay, fn) => {
      if (s.tw) s.tw.alive = false;
      s.tw =
        delay > 0
          ? tween(0.001, () => {}, {
              delay,
              done: () => {
                s.tw = null;
                fn(s);
              },
            })
          : null;
      if (!(delay > 0)) fn(s);
    };
    // Slot invariant: the planks that are ON are always slots 0..planks-1 (tear takes the highest,
    // add fills the lowest), so host and clients show identical boards for the same count.
    const win = {
      id: idx,
      zone: spec.zone,
      outsidePos,
      attackPos,
      insidePos,
      interactPos,
      yaw,
      maxPlanks: 6,
      get planks() {
        let n = 0;
        for (const s of slots) if (s.on) n++;
        return n;
      },
      tearPlank(animate = true, delay = 0) {
        for (let i = slots.length - 1; i >= 0; i--)
          if (slots[i].on) {
            const s = slots[i];
            s.on = false;
            if (animate) later(s, delay, tearAnim);
            else snapOff(s);
            return true;
          }
        return false;
      },
      addPlank(animate = true, delay = 0) {
        for (const s of slots)
          if (!s.on) {
            s.on = true;
            if (animate) later(s, delay, addAnim);
            else snapOn(s);
            return true;
          }
        return false;
      },
      // net mirror: reach n planks. Same n -> no-op (safe to call every snapshot); jumps are staggered.
      setPlanks(n, animate = true) {
        n = Math.max(0, Math.min(6, n | 0));
        let cur = this.planks,
          k = 0;
        while (cur > n) {
          this.tearPlank(animate, animate ? 0.14 * k++ : 0);
          cur--;
        }
        while (cur < n) {
          this.addPlank(animate, animate ? 0.09 * k++ : 0);
          cur++;
        }
        return this.planks;
      },
      // instant by default (game reset). repairAll(true) = staggered fly-back animation (carpenter).
      repairAll(animated = false) {
        let k = 0;
        for (const s of slots) {
          if (s.on) {
            if (!animated && s.tw) snapOn(s);
            continue;
          }
          s.on = true;
          if (animated) later(s, 0.09 * k++, addAnim);
          else snapOn(s);
        }
      },
      group: g,
      collider: plug,
      center: c.clone(),
      normal: n.clone(),
    };
    windows.push(win);
    return win;
  }
  WIN_SPECS.forEach(buildWindow);
  {
    const inst = new THREE.InstancedMesh(
      plankGeo,
      plankMat,
      plankProxies.length,
    );
    inst.castShadow = true;
    inst.receiveShadow = true;
    inst.frustumCulled = false;
    inst.name = "planks";
    dynGroup.add(inst);
    const zero = new THREE.Matrix4().makeScale(0, 0, 0),
      m4 = new THREE.Matrix4();
    const sync = () => {
      for (let i = 0; i < plankProxies.length; i++) {
        const p = plankProxies[i];
        if (!p.visible) {
          inst.setMatrixAt(i, zero);
          continue;
        }
        p.updateMatrix();
        m4.multiplyMatrices(p.parent.matrixWorld, p.matrix);
        inst.setMatrixAt(i, m4);
      }
      inst.instanceMatrix.needsUpdate = true;
    };
    windows.forEach((w) => w.group.updateMatrixWorld(true));
    sync();
    updaters.push(sync);
  }

  // =============================================================================================
  // DOORS
  // =============================================================================================
  const doors = [];
  const buildDoorFns = {}; // kind -> fn(doorObj, wall, centre, n)  (filled in later section)
  function buildDoor(spec) {
    const w = wallById[spec.wall];
    const c = wallPoint(w, spec.at);
    const nA = inwardN(w, spec.zoneA),
      nB = inwardN(w, spec.zoneB);
    const depth = spec.kind === "debris" ? 1.0 : HW + 0.05;
    const a = WP(w, spec.at - DOOR_W / 2, 0, -depth),
      b = WP(w, spec.at + DOOR_W / 2, DOOR_H, depth);
    const col = solid(
      a[0],
      a[1],
      a[2],
      b[0],
      b[1],
      b[2],
      spec.kind === "debris" ? "concrete" : "metal",
      { tag: "door" },
    );
    col.door = spec.id;
    const door = {
      id: spec.id,
      zoneA: spec.zoneA,
      zoneB: spec.zoneB,
      cost: spec.cost,
      label: spec.label,
      kind: spec.kind,
      interactPos: c
        .clone()
        .addScaledVector(nA, spec.kind === "debris" ? 1.9 : 1.2),
      interactPositions: [
        c.clone().addScaledVector(nA, spec.kind === "debris" ? 1.9 : 1.2),
        c.clone().addScaledVector(nB, spec.kind === "debris" ? 1.9 : 1.2),
      ],
      isOpen: false,
      collider: col,
      center: c.clone(),
      _anim: null,
      _snapOpen: null,
      // idempotent: returns false (and does nothing) if already open. open(false) = no animation (late join)
      open(animate = true) {
        if (this.isOpen) return false;
        this.isOpen = true;
        const i = colliders.indexOf(col);
        if (i >= 0) colliders.splice(i, 1);
        if (col.proxy) {
          const j = raycastTargets.indexOf(col.proxy);
          if (j >= 0) raycastTargets.splice(j, 1);
        }
        this._kill();
        if (animate && this._anim) this._anim();
        else if (this._snapOpen) this._snapOpen();
        return true;
      },
      // back to the closed state (new game / host reconciliation). Idempotent.
      close() {
        if (!this.isOpen) return false;
        this.isOpen = false;
        this._gen = (this._gen || 0) + 1; // invalidates pending open-animation callbacks
        if (!colliders.includes(col)) colliders.push(col);
        if (col.proxy && !raycastTargets.includes(col.proxy))
          raycastTargets.push(col.proxy);
        this._kill();
        if (this._reset) this._reset();
        return true;
      },
      _tws: [],
      _tw(dur, fn, o) {
        const t = tween(dur, fn, o);
        this._tws.push(t);
        if (this._tws.length > 24) this._tws = this._tws.filter((x) => x.alive);
        return t;
      },
      _kill() {
        for (const t of this._tws) t.alive = false;
        this._tws.length = 0;
      },
      setOpen(open, animate = true) {
        return open ? this.open(animate) : this.close();
      },
      _reset: null,
    };
    const fn = buildDoorFns[spec.kind];
    if (fn) fn(door, w, c, nA, nB);
    doors.push(door);
    return door;
  }

  // ---- debris pile (door 0) ----
  buildDoorFns.debris = (door, w, c) => {
    const g = new THREE.Group();
    g.position.copy(c);
    dynGroup.add(g);
    const prng = mulberry32(77);
    const geos = { concrete: [], wood: [], metal: [], bag: [] };
    const isZ = w.axis === "z";
    const P = (u, y, v) => (isZ ? [v, y, u] : [u, y, v]); // u along wall, v across
    for (let i = 0; i < 46; i++) {
      const u = (prng() - 0.5) * 2.6,
        v = (prng() - 0.5) * 1.8;
      const hmax =
        2.5 *
        Math.max(0, 1 - Math.pow(Math.abs(u) / 1.5, 2)) *
        Math.max(0, 1 - Math.pow(Math.abs(v) / 1.05, 2));
      const r = 0.16 + prng() * 0.26;
      const y = prng() * hmax * 0.9 + r * 0.5;
      const geo = prep(new THREE.DodecahedronGeometry(r, 0));
      projUV(geo, 0.5, prng() * 4, prng() * 4);
      const p = P(u, y, v);
      xform(
        geo,
        p[0],
        p[1],
        p[2],
        prng() * 3,
        prng() * 3,
        prng() * 3,
        new THREE.Vector3(
          1 + prng() * 0.6,
          0.6 + prng() * 0.5,
          1 + prng() * 0.4,
        ),
      );
      geos.concrete.push(geo);
    }
    // concrete slabs leaning
    for (let i = 0; i < 4; i++) {
      const geo = prep(
        new THREE.BoxGeometry(1.2 + prng() * 0.6, 0.18, 0.8 + prng() * 0.4),
      );
      projUV(geo, 0.5, prng(), prng());
      const p = P(
        (prng() - 0.5) * 1.6,
        0.5 + prng() * 1.2,
        (prng() - 0.5) * 0.9,
      );
      xform(
        geo,
        p[0],
        p[1],
        p[2],
        (prng() - 0.5) * 1.4,
        prng() * 3,
        (prng() - 0.5) * 1.2,
      );
      geos.concrete.push(geo);
    }
    // broken beams
    for (let i = 0; i < 5; i++) {
      const geo = prep(new THREE.BoxGeometry(2.4 + prng(), 0.22, 0.24));
      projUV(geo, 0.5, prng(), prng());
      const p = P(
        (prng() - 0.5) * 1.2,
        0.4 + prng() * 1.6,
        (prng() - 0.5) * 1.0,
      );
      xform(
        geo,
        p[0],
        p[1],
        p[2],
        (prng() - 0.5) * 0.5,
        (isZ ? Math.PI / 2 : 0) + (prng() - 0.5) * 0.9,
        (prng() - 0.5) * 1.1,
      );
      geos.wood.push(geo);
    }
    // bent girder + rebar
    {
      const geo = prep(new THREE.BoxGeometry(2.8, 0.2, 0.12));
      const p = P(0.2, 1.7, 0.1);
      xform(geo, p[0], p[1], p[2], 0.2, isZ ? Math.PI / 2 : 0, 0.55);
      geos.metal.push(geo);
      for (let i = 0; i < 6; i++) {
        const r = prep(
          new THREE.CylinderGeometry(0.012, 0.012, 1.2 + prng(), 5),
        );
        const q = P((prng() - 0.5) * 2, 1 + prng() * 1.3, (prng() - 0.5) * 0.8);
        xform(r, q[0], q[1], q[2], prng() * 3, prng() * 3, prng() * 3);
        geos.metal.push(r);
      }
    }
    // sandbags spilling at the base
    for (let i = 0; i < 8; i++) {
      const geo = sandbagGeo();
      const p = P(
        (prng() - 0.5) * 2.6,
        0.1 + prng() * 0.2,
        (prng() < 0.5 ? -1 : 1) * (0.7 + prng() * 0.3),
      );
      xform(
        geo,
        p[0],
        p[1],
        p[2],
        (prng() - 0.5) * 0.4,
        prng() * 3,
        (prng() - 0.5) * 0.4,
      );
      geos.bag.push(geo);
    }
    const meshes = [];
    const addM = (arr, m) => {
      if (!arr.length) return;
      const mesh = new THREE.Mesh(mergeGeometries(arr), mat(m));
      mesh.castShadow = mesh.receiveShadow = true;
      g.add(mesh);
      meshes.push(mesh);
    };
    addM(geos.concrete, "concrete_wall");
    addM(geos.wood, "wood_planks");
    addM(geos.metal, "metal_rusty");
    addM(geos.bag, "sandbag");
    door._anim = () => {
      puff(c.clone().setY(0.6), 26, 1.6);
      door._tw(
        1.5,
        (k) => {
          const e = easeIn(k);
          g.position.set(
            c.x + Math.sin(k * 60) * 0.03 * (1 - k),
            -e * 2.2,
            c.z + Math.cos(k * 53) * 0.03 * (1 - k),
          );
          g.scale.set(1 - e * 0.25, 1 - e * 0.6, 1 - e * 0.25);
        },
        {
          done: () => {
            g.visible = false;
          },
        },
      );
      door._tw(0.001, () => {}, {
        delay: 0.5,
        done: () => puff(c.clone().setY(0.3), 18, 2.2),
      });
    };
    door._snapOpen = () => {
      g.visible = false;
    };
    door._reset = () => {
      g.visible = true;
      g.position.copy(c);
      g.scale.setScalar(1);
    };
  };

  // ---- sliding barred steel door (door 1) ----
  buildDoorFns.steel = (door, w, c, nA) => {
    const isZ = w.axis === "z";
    const leaf = new THREE.Group();
    leaf.position.copy(c);
    dynGroup.add(leaf);
    const geosP = [],
      geosR = [];
    const L = (u, y, v) => (isZ ? [v, y, u] : [u, y, v]);
    const addB = (arr, u, y, v, su, sy, sv) => {
      const geo = prep(new THREE.BoxGeometry(isZ ? sv : su, sy, isZ ? su : sv));
      projUV(geo, 0.5, rng(), rng());
      const p = L(u, y, v);
      xform(geo, p[0], p[1], p[2]);
      arr.push(geo);
    };
    addB(geosP, 0, DOOR_H / 2 + 0.05, 0, DOOR_W + 0.1, DOOR_H + 0.1, 0.1);
    // frame ribs, rivet strips, viewing slot
    for (const u of [-1.15, 1.15])
      addB(geosR, u, DOOR_H / 2, 0, 0.12, DOOR_H, 0.16);
    for (const y of [0.15, 1.35, 2.6]) addB(geosR, 0, y, 0, DOOR_W, 0.12, 0.16);
    addB(geosR, 0, 1.35, 0, 0.1, DOOR_H - 0.3, 0.14);
    for (let i = 0; i < 2; i++)
      for (let s of [-1, 1]) {
        // diagonal braces
        const geo = prep(
          new THREE.BoxGeometry(isZ ? 0.14 : 1.45, 0.1, isZ ? 1.45 : 0.14),
        );
        const y = i ? 2.0 : 0.75;
        const p = L(s * 0.58, y, 0);
        xform(geo, p[0], p[1], p[2], isZ ? s * 0.62 : 0, 0, isZ ? 0 : s * 0.62);
        geosR.push(geo);
      }
    // rivets
    for (let u = -1.1; u <= 1.1; u += 0.22)
      for (const y of [0.15, 1.35, 2.6])
        for (const sgn of [-1, 1]) {
          const geo = prep(new THREE.SphereGeometry(0.018, 5, 3));
          const p = L(u, y, sgn * 0.085);
          xform(geo, p[0], p[1], p[2]);
          geosR.push(geo);
        }
    const panel = new THREE.Mesh(
      mergeGeometries(geosP),
      mat("metal_painted_green"),
    );
    const ribs = new THREE.Mesh(mergeGeometries(geosR), mat("metal_rusty"));
    for (const m of [panel, ribs]) {
      m.castShadow = m.receiveShadow = true;
      leaf.add(m);
    }
    // locking bars on zone A side, pivot at one end
    const bars = [];
    for (const y of [0.95, 1.85]) {
      const piv = new THREE.Group();
      const endU = -1.55;
      const pv = new THREE.Vector3(...L(endU, y, 0))
        .add(c)
        .addScaledVector(nA, HW + 0.08);
      piv.position.copy(pv);
      dynGroup.add(piv);
      const bar = new THREE.Mesh(
        new THREE.BoxGeometry(isZ ? 0.09 : 3.1, 0.12, isZ ? 3.1 : 0.09),
        mat("metal_rusty"),
      );
      bar.position.set(...L(1.55, 0, 0));
      bar.castShadow = true;
      piv.add(bar);
      bars.push(piv);
      // brackets (static)
      for (const bu of [-1.45, 1.45]) {
        const bp = new THREE.Vector3(...L(bu, y, 0))
          .add(c)
          .addScaledVector(nA, HW + 0.08);
        box(
          "metal_rusty",
          "walls",
          bp.x,
          bp.y - 0.02,
          bp.z,
          isZ ? 0.16 : 0.12,
          0.2,
          isZ ? 0.12 : 0.16,
        );
      }
    }
    const slideDir = new THREE.Vector3(...AX(w, 1));
    const barPose = (piv, e) => {
      if (isZ) piv.rotation.x = ((e * Math.PI) / 2) * (nA.x > 0 ? 1 : -1) * -1;
      else piv.rotation.z = (e * Math.PI) / 2;
    };
    door._anim = () => {
      bars.forEach((piv, i) =>
        door._tw(0.45, (k) => barPose(piv, easeInOut(k)), { delay: i * 0.12 }),
      );
      door._tw(
        1.4,
        (k) => {
          leaf.position.copy(c).addScaledVector(slideDir, easeInOut(k) * 2.6);
        },
        {
          delay: 0.55,
          done: () => {
            leaf.visible = false;
          },
        },
      );
    };
    door._snapOpen = () => {
      bars.forEach((piv) => barPose(piv, 1));
      leaf.position.copy(c).addScaledVector(slideDir, 2.6);
      leaf.visible = false;
    };
    door._reset = () => {
      leaf.visible = true;
      leaf.position.copy(c);
      bars.forEach((b) => b.rotation.set(0, 0, 0));
    };
  };

  // ---- swinging barred gate (door 2) ----
  buildDoorFns.gate = (door, w, c, nA, nB) => {
    // hinge planes sit just inside zone B (swings into zone B)
    const isZ = w.axis === "z";
    const leaves = [];
    for (const side of [-1, 1]) {
      const piv = new THREE.Group();
      const hingeAlong = (w.axis === "x" ? c.x : c.z) + (side * DOOR_W) / 2;
      const hp = wallPoint(w, hingeAlong).addScaledVector(nB, HW + 0.05);
      piv.position.copy(hp);
      piv.rotation.y = Math.atan2(nB.x, nB.z); // local +Z = into zone B, local +X along wall
      dynGroup.add(piv);
      // leaf extends from its hinge toward the door centre; local +X may be flipped by the pivot yaw
      const localXAlong =
        w.axis === "x" ? Math.cos(piv.rotation.y) : -Math.sin(piv.rotation.y);
      const dirX = -side * Math.sign(localXAlong || 1);
      const geos = [];
      const addB = (x, y, z, sx, sy, sz) => {
        const geo = prep(new THREE.BoxGeometry(sx, sy, sz));
        projUV(geo, 1, rng(), rng());
        xform(geo, x, y, z);
        geos.push(geo);
      };
      const len = DOOR_W / 2 - 0.02;
      addB((dirX * len) / 2, 0.08, 0, len, 0.07, 0.05);
      addB((dirX * len) / 2, DOOR_H - 0.1, 0, len, 0.07, 0.05);
      addB((dirX * len) / 2, 1.3, 0, len, 0.06, 0.04);
      addB(dirX * 0.03, DOOR_H / 2, 0, 0.07, DOOR_H - 0.1, 0.06);
      addB(dirX * (len - 0.03), DOOR_H / 2, 0, 0.07, DOOR_H - 0.1, 0.06);
      for (let x = 0.14; x < len - 0.05; x += 0.13) {
        const geo = prep(
          new THREE.CylinderGeometry(0.016, 0.016, DOOR_H - 0.1, 6),
        );
        xform(geo, dirX * x, DOOR_H / 2, 0);
        geos.push(geo);
        const tip = prep(new THREE.ConeGeometry(0.03, 0.09, 6));
        xform(tip, dirX * x, DOOR_H - 0.02, 0);
        geos.push(tip);
      }
      // diagonal
      const diag = prep(
        new THREE.BoxGeometry(Math.hypot(len, 1.1), 0.05, 0.035),
      );
      xform(diag, (dirX * len) / 2, 0.7, 0, 0, 0, Math.atan2(1.1, len) * -dirX);
      geos.push(diag);
      const m = new THREE.Mesh(mergeGeometries(geos), mat("metal_rusty"));
      m.castShadow = true;
      m.receiveShadow = true;
      piv.add(m);
      leaves.push({ piv, side, dirX, base: piv.rotation.y });
    }
    // chain + padlock at the meeting stiles
    const lock = new THREE.Group();
    lock.position.copy(c).addScaledVector(nB, HW + 0.1);
    lock.position.y = 1.3;
    dynGroup.add(lock);
    {
      const geos = [];
      for (let i = 0; i < 7; i++) {
        const t = prep(new THREE.TorusGeometry(0.03, 0.008, 4, 8));
        xform(
          t,
          (i - 3) * 0.045,
          Math.sin(i) * 0.02,
          0,
          0,
          i % 2 ? Math.PI / 2 : 0,
          0,
        );
        geos.push(t);
      }
      const body = prep(new THREE.BoxGeometry(0.07, 0.08, 0.035));
      xform(body, 0.02, -0.08, 0.02);
      geos.push(body);
      const lm = new THREE.Mesh(mergeGeometries(geos), mat("metal_rusty"));
      lm.rotation.y = Math.atan2(nB.x, nB.z);
      lock.add(lm);
    }
    const openCols = [];
    const leafTarget = (L) => L.base - Math.sign(L.dirX) * Math.PI * 0.96; // swings flat against the zone-B face
    const addOpenCols = () => {
      if (openCols.length) return;
      for (const L of leaves) {
        const bb = new THREE.Box3();
        const r0 = L.piv.rotation.y;
        L.piv.rotation.y = leafTarget(L);
        L.piv.updateMatrixWorld(true);
        bb.setFromObject(L.piv);
        L.piv.rotation.y = r0;
        L.piv.updateMatrixWorld(true);
        openCols.push(
          solid(bb.min.x, 0, bb.min.z, bb.max.x, 2.7, bb.max.z, "metal", {
            ray: false,
          }),
        );
      }
    };
    door._anim = () => {
      door._tw(0.001, () => {}, { delay: 1.75, done: addOpenCols });
      door._tw(
        0.4,
        (k) => {
          lock.position.y = 1.3 - easeIn(k) * 1.27;
          lock.rotation.z = k * 1.4;
        },
        {
          done: () =>
            door._tw(0.6, (k) => lock.scale.setScalar(1 - k), {
              delay: 2,
              done: () => (lock.visible = false),
            }),
        },
      );
      for (const L of leaves) {
        const target = leafTarget(L);
        door._tw(
          1.3,
          (k) => {
            const e = easeOut(k);
            L.piv.rotation.y = lerp(L.base, target, e);
          },
          { delay: 0.35 },
        );
      }
    };
    door._snapOpen = () => {
      for (const L of leaves) L.piv.rotation.y = leafTarget(L);
      lock.visible = false;
      addOpenCols();
    };
    door._reset = () => {
      for (const b of openCols.splice(0)) {
        const i = colliders.indexOf(b);
        if (i >= 0) colliders.splice(i, 1);
      }
      lock.visible = true;
      lock.position.y = 1.3;
      lock.scale.setScalar(1);
      lock.rotation.z = 0;
      leaves.forEach((L) => (L.piv.rotation.y = L.base));
    };
  };

  // =============================================================================================
  // SMALL PARTICLE POOLS (dust puffs, sparks) — level-local so doors / switch / anvil can animate
  // =============================================================================================
  const PMAX = 400;
  const pPos = new Float32Array(PMAX * 3),
    pCol = new Float32Array(PMAX * 3),
    pSize = new Float32Array(PMAX),
    pAlpha = new Float32Array(PMAX);
  const pVel = new Float32Array(PMAX * 3),
    pLife = new Float32Array(PMAX),
    pMax = new Float32Array(PMAX),
    pKind = new Uint8Array(PMAX);
  const pGeo = new THREE.BufferGeometry();
  pGeo.setAttribute("position", new THREE.BufferAttribute(pPos, 3));
  pGeo.setAttribute("aColor", new THREE.BufferAttribute(pCol, 3));
  pGeo.setAttribute("aSize", new THREE.BufferAttribute(pSize, 1));
  pGeo.setAttribute("aAlpha", new THREE.BufferAttribute(pAlpha, 1));
  const pMat = new THREE.ShaderMaterial({
    uniforms: { uScale: { value: 500 } },
    vertexShader: `attribute vec3 aColor; attribute float aSize; attribute float aAlpha; varying vec3 vC; varying float vA; uniform float uScale;
      void main(){ vec4 mv = modelViewMatrix*vec4(position,1.0); gl_Position = projectionMatrix*mv; gl_PointSize = aSize*uScale/max(0.1,-mv.z); vC=aColor; vA=aAlpha; }`,
    fragmentShader: `varying vec3 vC; varying float vA; void main(){ float d=length(gl_PointCoord-0.5); float a=smoothstep(0.5,0.05,d)*vA; if(a<0.004) discard; gl_FragColor=vec4(vC*a, a); }`,
    transparent: true,
    depthWrite: false,
    blending: THREE.CustomBlending,
    blendSrc: THREE.OneFactor,
    blendDst: THREE.OneMinusSrcAlphaFactor,
  });
  const points = new THREE.Points(pGeo, pMat);
  points.frustumCulled = false;
  points.renderOrder = 5;
  root.add(points);
  let pNext = 0;
  function emitP(x, y, z, vx, vy, vz, life, size, r, g, b, kind) {
    const i = pNext;
    pNext = (pNext + 1) % PMAX;
    pPos[i * 3] = x;
    pPos[i * 3 + 1] = y;
    pPos[i * 3 + 2] = z;
    pVel[i * 3] = vx;
    pVel[i * 3 + 1] = vy;
    pVel[i * 3 + 2] = vz;
    pLife[i] = life;
    pMax[i] = life;
    pSize[i] = size;
    pKind[i] = kind;
    pCol[i * 3] = r;
    pCol[i * 3 + 1] = g;
    pCol[i * 3 + 2] = b;
  }
  function puff(p, n = 16, spread = 1) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2,
        s = Math.random() * spread;
      const c = 0.28 + Math.random() * 0.1;
      emitP(
        p.x + Math.cos(a) * s * 0.5,
        p.y + Math.random() * 0.8,
        p.z + Math.sin(a) * s * 0.5,
        Math.cos(a) * s * 0.8,
        0.3 + Math.random() * 0.6,
        Math.sin(a) * s * 0.8,
        1.6 + Math.random() * 1.4,
        0.9 + Math.random() * 0.9,
        c,
        c * 0.95,
        c * 0.9,
        0,
      );
    }
  }
  function sparks(p, n = 24, power = 1) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2,
        up = Math.random();
      const s = (1 + Math.random() * 3) * power;
      emitP(
        p.x,
        p.y,
        p.z,
        Math.cos(a) * s * 0.6,
        up * s,
        Math.sin(a) * s * 0.6,
        0.35 + Math.random() * 0.5,
        0.035 + Math.random() * 0.03,
        3.0,
        1.6,
        0.5,
        1,
      );
    }
  }
  function updateParticles(dt) {
    for (let i = 0; i < PMAX; i++) {
      if (pLife[i] <= 0) {
        pAlpha[i] = 0;
        continue;
      }
      pLife[i] -= dt;
      const k = 1 - pLife[i] / pMax[i];
      if (pKind[i] === 1) {
        // spark: gravity + bounce
        pVel[i * 3 + 1] -= 9.8 * dt;
        if (pPos[i * 3 + 1] < 0.01 && pVel[i * 3 + 1] < 0) {
          pVel[i * 3 + 1] *= -0.35;
          pVel[i * 3] *= 0.6;
          pVel[i * 3 + 2] *= 0.6;
        }
        pAlpha[i] = 1 - k;
      } else {
        // dust: drag, grow
        const d = Math.exp(-2.2 * dt);
        pVel[i * 3] *= d;
        pVel[i * 3 + 2] *= d;
        pVel[i * 3 + 1] *= d;
        pSize[i] += dt * 0.5;
        pAlpha[i] = Math.sin(Math.PI * Math.min(1, k * 1.2)) * 0.45;
      }
      pPos[i * 3] += pVel[i * 3] * dt;
      pPos[i * 3 + 1] += pVel[i * 3 + 1] * dt;
      pPos[i * 3 + 2] += pVel[i * 3 + 2] * dt;
    }
    pGeo.attributes.position.needsUpdate = true;
    pGeo.attributes.aAlpha.needsUpdate = true;
    pGeo.attributes.aSize.needsUpdate = true;
    pGeo.attributes.aColor.needsUpdate = true;
  }

  // sandbag geometry (flattened pillow)
  function sandbagGeo() {
    const g = new THREE.SphereGeometry(1, 10, 6);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      let x = p.getX(i) * 0.3,
        y = p.getY(i) * 0.12,
        z = p.getZ(i) * 0.17;
      y = Math.sign(y) * Math.min(Math.abs(y), 0.085);
      x *= 1 + 0.08 * Math.abs(p.getZ(i));
      p.setXYZ(i, x, y, z);
    }
    g.computeVertexNormals();
    const q = prep(g);
    projUV(q, 1.2, Math.random(), Math.random());
    return q;
  }

  DOOR_SPECS.forEach(buildDoor);

  const lightsOut = { list: [] };

  // =============================================================================================
  // (props, machines, lighting & exterior are attached below by section builders)
  // =============================================================================================
  const ctx = {
    THREE,
    root,
    staticGroup,
    dynGroup,
    roofGroup,
    mat,
    box,
    boxB,
    cyl,
    cylGeo,
    anyGeo,
    quad,
    emit,
    xform,
    prep,
    projUV,
    solid,
    solidC,
    reserve,
    isFree,
    rng,
    R,
    pick,
    tween,
    tweenP,
    wait,
    puff,
    sparks,
    sandbagGeo,
    updaters,
    powerables,
    rayGroup,
    lightsOut,
    ZDEF,
    WALLS,
    wallById,
    wallPoint,
    inwardN,
    windows,
    doors,
    HOLES,
    canvasTex,
    colliders,
    raycastTargets,
    zoneAt,
    T,
  };
  const features = buildFeatures(ctx); // wall buys, perks, box, switch, anvil
  buildDressing(ctx); // props, exterior, trees
  const lighting = buildLighting(ctx, features);

  // ---- finalize merged static meshes --------------------------------------------------------
  let drawStatic = 0;
  for (const b of buckets.values()) {
    if (!b.geos.length) continue;
    const geo = mergeGeometries(b.geos, false);
    if (!geo) {
      console.warn("[level] merge failed", b.region, b.material.name);
      continue;
    }
    geo.computeBoundingSphere();
    geo.computeBoundingBox();
    const m = new THREE.Mesh(geo, b.material);
    m.name = b.region + ":" + (b.material.name || "mat");
    m.castShadow = b.cast;
    m.receiveShadow = true;
    m.matrixAutoUpdate = false;
    m.updateMatrix();
    (b.region === "roof" ? roofGroup : staticGroup).add(m);
    drawStatic++;
  }
  buckets.clear();

  // =============================================================================================
  // COLLISION API
  // =============================================================================================
  const lastPos = new WeakMap();
  const STEP_H = 0.35;
  function resolveAt(pos, r, height) {
    const py = pos.y || 0;
    for (let it = 0; it < 10; it++) {
      let moved = false;
      for (let i = 0; i < colliders.length; i++) {
        const b = colliders[i];
        if (b.max.y <= py + STEP_H || b.min.y >= py + height) continue;
        if (
          pos.x < b.min.x - r ||
          pos.x > b.max.x + r ||
          pos.z < b.min.z - r ||
          pos.z > b.max.z + r
        )
          continue;
        const cx = clamp(pos.x, b.min.x, b.max.x),
          cz = clamp(pos.z, b.min.z, b.max.z);
        const dx = pos.x - cx,
          dz = pos.z - cz;
        const d2 = dx * dx + dz * dz;
        if (d2 >= r * r) continue;
        if (d2 > 1e-10) {
          const d = Math.sqrt(d2),
            push = r - d + 1e-4;
          pos.x += (dx / d) * push;
          pos.z += (dz / d) * push;
        } else {
          // centre inside box: push out along the least-penetration side
          const l = pos.x - b.min.x,
            rr = b.max.x - pos.x,
            f = pos.z - b.min.z,
            bk = b.max.z - pos.z;
          const m = Math.min(l, rr, f, bk);
          if (m === l) pos.x = b.min.x - r - 1e-4;
          else if (m === rr) pos.x = b.max.x + r + 1e-4;
          else if (m === f) pos.z = b.min.z - r - 1e-4;
          else pos.z = b.max.z + r + 1e-4;
        }
        moved = true;
      }
      if (!moved) break;
    }
  }
  function resolveCircle(pos, radius = 0.35, height = 1.8) {
    const prev = lastPos.get(pos);
    if (prev) {
      const dx = pos.x - prev.x,
        dz = pos.z - prev.z,
        d = Math.hypot(dx, dz);
      const step = Math.max(0.05, radius * 0.45);
      if (d > step && d < 6) {
        // swept: advance from the last resolved position in small steps (no tunnelling at low fps)
        const n = Math.ceil(d / step),
          tx = pos.x,
          tz = pos.z;
        pos.x = prev.x;
        pos.z = prev.z;
        for (let i = 1; i <= n; i++) {
          pos.x += dx / n;
          pos.z += dz / n;
          resolveAt(pos, radius, height);
        }
        void tx;
        void tz;
      } else resolveAt(pos, radius, height);
      prev.x = pos.x;
      prev.z = pos.z;
    } else {
      resolveAt(pos, radius, height);
      if (typeof pos === "object") lastPos.set(pos, { x: pos.x, z: pos.z });
    }
    return pos;
  }
  function lineOfSight(a, b) {
    const ax = a.x,
      ay = a.y,
      az = a.z,
      bx = b.x,
      by = b.y,
      bz = b.z;
    const mnx = Math.min(ax, bx),
      mxx = Math.max(ax, bx),
      mnz = Math.min(az, bz),
      mxz = Math.max(az, bz);
    for (let i = 0; i < colliders.length; i++) {
      const c = colliders[i];
      if (c.noLOS) continue;
      if (c.max.x < mnx || c.min.x > mxx || c.max.z < mnz || c.min.z > mxz)
        continue;
      if (segHitsBox(ax, ay, az, bx, by, bz, c)) return false;
    }
    return true;
  }
  function isZoneOpen(id) {
    if (id === 0) return true;
    const open = new Set([0]);
    let grew = true;
    while (grew) {
      grew = false;
      for (const d of doors)
        if (d.isOpen) {
          if (open.has(d.zoneA) && !open.has(d.zoneB)) {
            open.add(d.zoneB);
            grew = true;
          }
          if (open.has(d.zoneB) && !open.has(d.zoneA)) {
            open.add(d.zoneA);
            grew = true;
          }
        }
    }
    return open.has(id);
  }

  // =============================================================================================
  // NAV: occupancy grid (0.2 m) + 1 m waypoint graph + A*
  // =============================================================================================
  const nav = buildNav({
    colliders,
    extraStatic: features.navStatic || [],
    doors,
    ZDEF,
  });

  // =============================================================================================
  // POWER + UPDATE
  // =============================================================================================
  let powerOn = false;
  function setPower(on, instant = false) {
    on = !!on;
    if (on === powerOn && !instant) return;
    powerOn = on;
    const sw = features.powerSwitch;
    const ox = sw ? sw.interactPos.x : -11.5,
      oz = sw ? sw.interactPos.z : -20;
    for (const p of powerables) {
      const d = Math.hypot(p.x - ox, p.z - oz);
      const delay = instant ? 0 : 0.25 + d * 0.055 + Math.random() * 0.25;
      p.set(on, delay, instant);
    }
    if (sw && on !== sw.isOn) sw._setOnVisual(on);
    return true;
  }

  // ---- co-op state mirror -----------------------------------------------------------------
  function netState() {
    const box = features.mysteryBox,
      anvil = features.anvil;
    return {
      v: 1,
      doors: doors.map((d) => d.isOpen),
      power: powerOn,
      planks: windows.map((w) => w.planks),
      box: {
        loc: box.target,
        state: box.isMoving ? "moving" : box.isOpen ? "open" : "closed",
      },
      anvil: { busy: anvil.busy, n: anvil.forgeCount },
    };
  }
  // Idempotent: only differences are applied, so calling it every snapshot with the same state does
  // nothing. animate=false snaps (late join); animate=true plays the same animations the host played.
  function applyNetState(s, animate = false) {
    if (!s) return;
    if (Array.isArray(s.doors))
      s.doors.forEach((o, i) => {
        const d = doors[i];
        if (d && !!o !== d.isOpen) d.setOpen(!!o, animate);
      });
    if (typeof s.power === "boolean" && s.power !== powerOn) {
      const sw = features.powerSwitch;
      if (s.power && animate && sw && !sw.isOn)
        sw.throwSwitch(); // lever anim, then the cascade
      else setPower(s.power, !animate);
    }
    if (Array.isArray(s.planks))
      s.planks.forEach((n, i) => {
        const w = windows[i];
        if (w && w.planks !== n) w.setPlanks(n, animate);
      });
    const box = features.mysteryBox,
      b = s.box;
    if (b && typeof b.loc === "number") {
      if (!animate) {
        if (box.isMoving || b.loc !== box.current) box._snapTo(b.loc);
        if (b.state === "open") box.open(false);
        else box.close(false);
      } else if (b.state === "moving" || box.isMoving) {
        if (!box.isMoving) {
          if (b.loc !== box.current) box.relocate(b.loc);
        } else box.relocate(b.loc); // retarget if the landing spot changed; otherwise same promise
      } else {
        if (b.loc !== box.current) box.relocate(b.loc);
        else if (b.state === "open") box.open(true);
        else if (b.state === "closed") box.close(true);
      }
    }
    const a = s.anvil,
      anvil = features.anvil;
    if (a && typeof a.n === "number" && a.n !== anvil.forgeCount) {
      if (animate && a.busy && a.n > anvil.forgeCount && !anvil.busy) {
        anvil.forge(1.4);
      }
      anvil._setCount(a.n);
    }
  }

  const level = {
    root,
    name: "Blackwald Bunker",
    playerStart: { pos: new THREE.Vector3(0, 0, 3.4), yaw: 0 },
    // co-op spawn points (slot order). All in the Command Post, >=2 m apart, clear of the box,
    // wall buys, window landing spots and the table; everyone faces the map table.
    playerStarts: [
      { pos: new THREE.Vector3(0, 0, 3.4), yaw: 0 },
      { pos: new THREE.Vector3(-2.6, 0, 2.6), yaw: -0.35 },
      { pos: new THREE.Vector3(2.6, 0, 2.6), yaw: 0.35 },
      { pos: new THREE.Vector3(-1.5, 0, -3.6), yaw: Math.PI - 0.4 },
    ],
    netState,
    applyNetState,
    colliders,
    resolveCircle,
    lineOfSight,
    raycastTargets,
    zones,
    isZoneOpen,
    zoneAt,
    nav: { findPath: nav.findPath, _debug: nav.debug },
    windows,
    doors,
    wallBuys: features.wallBuys,
    perks: features.perks,
    mysteryBox: features.mysteryBox,
    powerSwitch: features.powerSwitch,
    anvil: features.anvil,
    fireSpots: lighting.fireSpots,
    menuCamera: {
      pos: new THREE.Vector3(-2.7, 1.55, 2.7),
      target: new THREE.Vector3(1.4, 1.6, -7.0),
    },
    setPower,
    get powered() {
      return powerOn;
    },
    get _activeTweens() {
      return tweens.length;
    },
    lights: lighting.lights,
    ceiling: roofGroup,
    stats: { staticMeshes: drawStatic },
    update(dt, time, playerPos) {
      dt = Math.min(dt, 0.1);
      for (let i = tweens.length - 1; i >= 0; i--) {
        const tw = tweens[i];
        if (!tw.alive) {
          tweens.splice(i, 1);
          continue;
        }
        tw.t += dt;
        if (tw.t < 0) continue;
        const k = Math.min(1, tw.t / tw.dur);
        tw.fn(tw.ease(k), k);
        if (k >= 1) {
          tw.alive = false;
          tweens.splice(i, 1);
          if (tw.done) tw.done();
        }
      }
      for (const u of updaters) u(dt, time, playerPos);
      updateParticles(dt);
    },
    // reset for a new game: close doors, repair windows, power off, box home
    reset() {
      for (const d of doors) d.close();
      for (const w of windows) w.repairAll(false);
      setPower(false, true);
      features.anvil && features.anvil._stop();
      features.reset && features.reset();
    },
  };
  features.bind && features.bind(level);
  root.userData.level = level;
  return level;
}

// =============================================================================================
// NAV builder
// =============================================================================================
