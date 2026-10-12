// UNBURIED — level.js : map "Blackwald Bunker"
// Owner: level agent. Public entry: buildLevel(scene, T) -> Level (see docs/CONTRACT.md).
//
// Coordinate plan (metres, Y up, floor y=0; wall centre-lines):
//   zone 0 Command Post   x[-8, 8]   z[-7, 7]    (start)
//   zone 1 Radio Room     x[-24,-8]  z[-7, 7]    door 0<->1 at x=-8,z=0     (750, debris)
//   zone 2 Armory Hall    x[8, 26]   z[-8, 8]    door 0<->2 at x=8, z=0     (1000, steel door)
//   zone 3 Generator Vault x[-24,-8] z[-21,-7]   door 1<->3 at x=-16,z=-7   (1250, barred gate)
// Yaw convention everywhere: an object with rotation.y = yaw looks down (-sin yaw, 0, -cos yaw)
// (three.js camera convention: yaw 0 looks toward -Z).

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const WALL_H = 3.6, WT = 0.4, HW = WT / 2;
const WIN_W = 1.3, WIN_Y0 = 0.85, WIN_Y1 = 2.25;
const DOOR_W = 2.4, DOOR_H = 2.7;
const NAV_R = 0.4;          // nav clearance radius
const NAV_RES = 0.2;        // occupancy grid resolution
const NAV_BLOCK = 5;        // nodes every 5 cells (1 m)

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const easeOut = (k) => 1 - Math.pow(1 - k, 3);
const easeIn = (k) => k * k * k;
const easeInOut = (k) => (k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2);
const yawFromDir = (dx, dz) => Math.atan2(-dx, -dz);

// ---------------------------------------------------------------------------------------------
// geometry helpers
function prep(g) {
  if (g.index) g = g.toNonIndexed();
  for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'uv') g.deleteAttribute(k);
  if (!g.attributes.normal) g.computeVertexNormals();
  if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
  g.morphAttributes = {};
  g.clearGroups();
  return g;
}
// box-projected UVs, `scale` = uv units per metre (0.5 => 1 tile per 2 m)
function projUV(g, scale = 0.5, ox = 0, oy = 0) {
  const p = g.attributes.position, n = g.attributes.normal, uv = g.attributes.uv;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const ax = Math.abs(n.getX(i)), ay = Math.abs(n.getY(i)), az = Math.abs(n.getZ(i));
    let u, v;
    if (ay >= ax && ay >= az) { u = x; v = z; } else if (ax >= az) { u = z; v = y; } else { u = x; v = y; }
    uv.setXY(i, u * scale + ox, v * scale + oy);
  }
  uv.needsUpdate = true;
  return g;
}

function canvasTex(w, h, draw, srgb = true) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d');
  draw(g, w, h);
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

// segment vs AABB slab test
function segHitsBox(ax, ay, az, bx, by, bz, b) {
  let tmin = 0, tmax = 1;
  const o = [ax, ay, az], d = [bx - ax, by - ay, bz - az];
  const mn = [b.min.x, b.min.y, b.min.z], mx = [b.max.x, b.max.y, b.max.z];
  for (let i = 0; i < 3; i++) {
    if (Math.abs(d[i]) < 1e-9) {
      if (o[i] < mn[i] || o[i] > mx[i]) return false;
    } else {
      let t1 = (mn[i] - o[i]) / d[i], t2 = (mx[i] - o[i]) / d[i];
      if (t1 > t2) { const s = t1; t1 = t2; t2 = s; }
      if (t1 > tmin) tmin = t1;
      if (t2 < tmax) tmax = t2;
      if (tmin > tmax) return false;
    }
  }
  return true;
}

// ---------------------------------------------------------------------------------------------
export function buildLevel(scene, T) {
  const root = new THREE.Group();
  root.name = 'BlackwaldBunker';
  scene.add(root);
  const rng = mulberry32(1945);
  const R = (a, b) => a + (b - a) * rng();
  const pick = (arr) => arr[Math.floor(rng() * arr.length)];

  const fallbackMat = new THREE.MeshStandardMaterial({ color: 0x808080, roughness: 0.9 });
  const rawMat = (n) => { try { return (T && T.mat && T.mat(n)) || fallbackMat; } catch (e) { return fallbackMat; } };
  // Anti-tiling for big architectural surfaces: every map is sampled twice (second copy rescaled +
  // offset) and blended by low-frequency world-UV noise, then pulled a little toward the texture's
  // mean colour. Kills the 2 m repeat of high-contrast features (plaster blotches, floor stains).
  const ANTI_TILE = { plaster_damaged: 0.42, concrete_floor: 0.22, concrete_wall: 0.15, dirt_ground: 0.2 };
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
    const key = base.uuid + (anti ? '|a' : '') + (side ? '|s' : '');
    if (matVariants.has(key)) return matVariants.get(key);
    const m = base.clone();
    const soften = anti ? ANTI_TILE[name].toFixed(3) : '0.0';
    m.onBeforeCompile = (sh) => {
      const S = THREE.ShaderChunk;
      let f = sh.fragmentShader.replace('#include <common>', '#include <common>\n' + (anti ? ANTI_GLSL : '') + (side ? SIDE_GLSL : ''));
      if (anti) {
        f = f.replace('#include <map_fragment>', S.map_fragment.replace('texture2D( map, vMapUv )', 'mix(atSample( map, vMapUv ), texture2D( map, vMapUv, 9.0 ), ' + soften + ')'))
          .replace('#include <normal_fragment_maps>', S.normal_fragment_maps.replace(/texture2D\( normalMap, vNormalMapUv \)/g, 'atSample( normalMap, vNormalMapUv )'))
          .replace('#include <roughnessmap_fragment>', S.roughnessmap_fragment.replace('texture2D( roughnessMap, vRoughnessMapUv )', 'atSample( roughnessMap, vRoughnessMapUv )'));
      }
      if (side) {
        f = f.replace('#include <lights_fragment_begin>', S.lights_fragment_begin.replace(
          'getPointLightInfo( pointLight, geometryPosition, directLight );',
          'getPointLightInfo( pointLight, geometryPosition, directLight ); directLight.color *= lvSameSide( pointLight.position, geometryPosition );'));
      }
      sh.fragmentShader = f;
    };
    m.customProgramCacheKey = () => 'level-v2-' + (anti ? 'a-' + name : '') + (side ? '-s' : '');
    matVariants.set(key, m);
    return m;
  }
  const antiTiled = (name) => variant(rawMat(name), name, true, false);
  const mat = (n) => (ANTI_TILE[n] !== undefined ? antiTiled(n) : rawMat(n));

  // ---- groups -------------------------------------------------------------------------------
  const staticGroup = new THREE.Group(); staticGroup.name = 'static'; root.add(staticGroup);
  const roofGroup = new THREE.Group(); roofGroup.name = 'ceiling'; root.add(roofGroup);
  const dynGroup = new THREE.Group(); dynGroup.name = 'dynamic'; root.add(dynGroup);
  const rayGroup = new THREE.Group(); rayGroup.name = 'raycastProxies'; rayGroup.visible = false; root.add(rayGroup);

  // ---- merge buckets ------------------------------------------------------------------------
  const buckets = new Map();
  function emit(geo, m, region = 'misc', cast = true) {
    const material = typeof m === 'string' ? variant(rawMat(m), m, ANTI_TILE[m] !== undefined, true) : variant(m, '', false, true);
    if (region === 'ext' || region === 'walls') {
      // spatial split so frustum culling (camera + point-light shadow cubes) can reject far chunks
      geo.computeBoundingBox();
      const c = geo.boundingBox.getCenter(new THREE.Vector3());
      const cs = region === 'ext' ? 36 : 20;
      region = region + ':' + Math.floor(c.x / cs) + ',' + Math.floor(c.z / cs);
    }
    const key = region + '|' + material.uuid + '|' + (cast ? 1 : 0);
    let b = buckets.get(key);
    if (!b) { b = { material, region, cast, geos: [] }; buckets.set(key, b); }
    b.geos.push(prep(geo));
  }
  const _m4 = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _one = new THREE.Vector3(1, 1, 1), _p = new THREE.Vector3();
  function xform(g, x, y, z, rx = 0, ry = 0, rz = 0, s) {
    _e.set(rx, ry, rz, 'YXZ'); _q.setFromEuler(_e);
    _m4.compose(_p.set(x, y, z), _q, s || _one);
    g.applyMatrix4(_m4);
    return g;
  }
  // box centred at (x,y,z). o: {rx,ry,rz, uv:'local'|'world'|'raw', cast, region, uvs}
  function box(m, region, x, y, z, sx, sy, sz, o = {}) {
    let g = prep(new THREE.BoxGeometry(sx, sy, sz));
    if (o.uv !== 'world' && o.uv !== 'raw') projUV(g, o.uvs ?? 0.5, rng() * 4, rng() * 4);
    xform(g, x, y, z, o.rx || 0, o.ry || 0, o.rz || 0);
    if (o.uv === 'world') projUV(g, 0.5);
    emit(g, m, region, o.cast !== false);
    return g;
  }
  // box with bottom at y0
  const boxB = (m, region, x, y0, z, sx, sy, sz, o) => box(m, region, x, y0 + sy / 2, z, sx, sy, sz, o);
  function cylGeo(rt, rb, h, seg = 12, open = false, uvMetres = true) {
    const g = prep(new THREE.CylinderGeometry(rt, rb, h, seg, 1, open));
    if (uvMetres) {
      const uv = g.attributes.uv, side = seg * 6;
      const cu = Math.PI * (rt + rb) / 2, cv = h / 2, cr = Math.max(rt, rb);
      for (let i = 0; i < uv.count; i++) {
        if (i < side) uv.setXY(i, uv.getX(i) * cu, uv.getY(i) * cv);
        else uv.setXY(i, uv.getX(i) * cr, uv.getY(i) * cr);
      }
    }
    return g;
  }
  function cyl(m, region, x, y, z, rt, rb, h, seg = 12, o = {}) {
    const g = cylGeo(rt, rb, h, seg, !!o.open, o.uv !== 'raw');
    xform(g, x, y, z, o.rx || 0, o.ry || 0, o.rz || 0);
    emit(g, m, region, o.cast !== false);
    return g;
  }
  function anyGeo(g, m, region, x, y, z, o = {}) {
    g = prep(g);
    if (o.uv === 'local') projUV(g, o.uvs ?? 0.5, rng() * 4, rng() * 4);
    xform(g, x, y, z, o.rx || 0, o.ry || 0, o.rz || 0, o.s);
    if (o.uv === 'world') projUV(g, 0.5);
    emit(g, m, region, o.cast !== false);
    return g;
  }
  // quad from 4 corners, normal n (winding auto-fixed), world-space UVs (metres/2)
  function quad(m, region, a, b, c, d, n, cast = true) {
    const e1 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], e2 = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    const cr = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
    if (cr[0] * n[0] + cr[1] * n[1] + cr[2] * n[2] < 0) { const t = b; b = d; d = t; }
    const pts = [a, b, c, a, c, d];
    const pos = new Float32Array(18), nor = new Float32Array(18);
    for (let i = 0; i < 6; i++) { pos.set(pts[i], i * 3); nor.set(n, i * 3); }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(12), 2));
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
    b.getCenter(m.position); b.getSize(m.scale);
    m.userData.surface = surface;
    m.name = 'ray:' + surface;
    rayGroup.add(m);
    m.updateMatrixWorld(true);
    raycastTargets.push(m);
    return m;
  }
  // solid(minx,miny,minz,maxx,maxy,maxz, surface, {col, ray, noLOS, tag})
  function solid(x0, y0, z0, x1, y1, z1, surface = 'concrete', o = {}) {
    const b = new THREE.Box3(new THREE.Vector3(Math.min(x0, x1), Math.min(y0, y1), Math.min(z0, z1)),
      new THREE.Vector3(Math.max(x0, x1), Math.max(y0, y1), Math.max(z0, z1)));
    if (o.noLOS) b.noLOS = true;
    if (o.tag) b.tag = o.tag;
    if (o.col !== false) colliders.push(b);
    if (o.ray !== false) b.proxy = rayProxy(b, surface);
    return b;
  }
  // centred footprint helper
  const solidC = (x, z, sx, sz, h, surface, o) => solid(x - sx / 2, 0, z - sz / 2, x + sx / 2, h, z + sz / 2, surface, o);

  // reserved circles: keep clutter away from gameplay spots
  const reserved = [];
  const reserve = (x, z, r) => reserved.push({ x, z, r });
  const isFree = (x, z, r = 0) => reserved.every((c) => Math.hypot(c.x - x, c.z - z) > c.r + r);

  // ---- zones --------------------------------------------------------------------------------
  const ZDEF = [
    { id: 0, name: 'Command Post', x0: -8, x1: 8, z0: -7, z1: 7, floor: 'concrete_floor', lo: 'concrete_wall', hi: 'plaster_damaged', rail: 'wood_planks' },
    { id: 1, name: 'Radio Room', x0: -24, x1: -8, z0: -7, z1: 7, floor: 'wood_floor', lo: 'wood_planks', hi: 'plaster_damaged', rail: 'wood_planks' },
    { id: 2, name: 'Armory Hall', x0: 8, x1: 26, z0: -8, z1: 8, floor: 'concrete_floor', lo: 'concrete_wall', hi: 'brick_old', rail: 'concrete_wall' },
    { id: 3, name: 'Generator Vault', x0: -24, x1: -8, z0: -21, z1: -7, floor: 'tile_floor', lo: 'metal_painted_green', hi: 'concrete_wall', rail: 'metal_rusty' },
  ];
  const zones = ZDEF.map((z) => ({ id: z.id, name: z.name, bounds: new THREE.Box3(new THREE.Vector3(z.x0, 0, z.z0), new THREE.Vector3(z.x1, WALL_H, z.z1)) }));
  function zoneAt(p) {
    for (const z of ZDEF) if (p.x >= z.x0 && p.x <= z.x1 && p.z >= z.z0 && p.z <= z.z1) return z.id;
    return -1;
  }

  // ---- tween system -------------------------------------------------------------------------
  const tweens = [];
  function tween(dur, fn, o = {}) {
    const tw = { t: -(o.delay || 0), dur: Math.max(1e-4, dur), fn, ease: o.ease || ((k) => k), done: o.done, alive: true };
    tweens.push(tw);
    return tw;
  }
  const tweenP = (dur, fn, o = {}) => new Promise((res) => tween(dur, fn, { ...o, done: () => { o.done && o.done(); res(); } }));
  const wait = (s) => new Promise((res) => tween(s, () => {}, { done: res }));

  // =============================================================================================
  // WALLS
  // =============================================================================================
  // opening specs; windows and doors filled below
  const WIN_SPECS = [
    { zone: 0, wall: 'H2b', at: 3.5 },
    { zone: 0, wall: 'H3b', at: -4.5 },
    { zone: 0, wall: 'H3b', at: 4.5 },
    { zone: 1, wall: 'H3a', at: -17 },
    { zone: 1, wall: 'V1b', at: 1.5 },
    { zone: 2, wall: 'H4', at: 19 },
    { zone: 2, wall: 'H5', at: 17 },
    { zone: 2, wall: 'V4', at: -3 },
    { zone: 3, wall: 'H1', at: -16 },
    { zone: 3, wall: 'V1a', at: -14 },
    { zone: 3, wall: 'V2a', at: -16 },
  ];
  const DOOR_SPECS = [
    { id: 0, wall: 'V2b', at: 0, zoneA: 0, zoneB: 1, cost: 750, label: 'Clear Debris', kind: 'debris' },
    { id: 1, wall: 'V3', at: 0, zoneA: 0, zoneB: 2, cost: 1000, label: 'Open Door', kind: 'steel' },
    { id: 2, wall: 'H2a', at: -16, zoneA: 1, zoneB: 3, cost: 1250, label: 'Open Gate', kind: 'gate' },
  ];
  // axis 'x': wall runs along x at z=c ; neg side = -z. axis 'z': runs along z at x=c ; neg side = -x
  const WALLS = [
    { id: 'H1', axis: 'x', c: -21, a0: -24.2, a1: -7.8, neg: 'ext', pos: 3 },
    { id: 'H2a', axis: 'x', c: -7, a0: -24.2, a1: -7.8, neg: 3, pos: 1 },
    { id: 'H2b', axis: 'x', c: -7, a0: -7.8, a1: 7.8, neg: 'ext', pos: 0 },
    { id: 'H3a', axis: 'x', c: 7, a0: -24.2, a1: -7.8, neg: 1, pos: 'ext' },
    { id: 'H3b', axis: 'x', c: 7, a0: -7.8, a1: 7.8, neg: 0, pos: 'ext' },
    { id: 'H4', axis: 'x', c: -8, a0: 7.8, a1: 26.2, neg: 'ext', pos: 2 },
    { id: 'H5', axis: 'x', c: 8, a0: 7.8, a1: 26.2, neg: 2, pos: 'ext' },
    { id: 'V1a', axis: 'z', c: -24, a0: -20.8, a1: -7.2, neg: 'ext', pos: 3 },
    { id: 'V1b', axis: 'z', c: -24, a0: -6.8, a1: 6.8, neg: 'ext', pos: 1 },
    { id: 'V2a', axis: 'z', c: -8, a0: -20.8, a1: -7.2, neg: 3, pos: 'ext' },
    { id: 'V2b', axis: 'z', c: -8, a0: -6.8, a1: 6.8, neg: 1, pos: 0 },
    { id: 'V3', axis: 'z', c: 8, a0: -7.8, a1: 7.8, neg: 0, pos: 2 },
    { id: 'V4', axis: 'z', c: 26, a0: -7.8, a1: 7.8, neg: 2, pos: 'ext' },
  ];
  const wallById = Object.fromEntries(WALLS.map((w) => [w.id, w]));
  for (const w of WALLS) w.openings = [];
  WIN_SPECS.forEach((s, i) => { wallById[s.wall].openings.push({ kind: 'window', at: s.at, w: WIN_W, y0: WIN_Y0, y1: WIN_Y1, idx: i }); });
  DOOR_SPECS.forEach((s) => { wallById[s.wall].openings.push({ kind: 'door', at: s.at, w: DOOR_W, y0: 0, y1: DOOR_H, idx: s.id }); });

  // wall-local -> world
  const WP = (w, along, y, off) => (w.axis === 'x' ? [along, y, w.c + off] : [w.c + off, y, along]);
  const WN = (w, s) => (w.axis === 'x' ? [0, 0, s] : [s, 0, 0]);
  const AX = (w, s) => (w.axis === 'x' ? [s, 0, 0] : [0, 0, s]);
  // world point on the wall centre-line at `along`
  const wallPoint = (w, along) => (w.axis === 'x' ? new THREE.Vector3(along, 0, w.c) : new THREE.Vector3(w.c, 0, along));
  // inward normal (towards zone) for a wall + zone
  const inwardN = (w, zone) => { const s = w.pos === zone ? 1 : -1; return w.axis === 'x' ? new THREE.Vector3(0, 0, s) : new THREE.Vector3(s, 0, 0); };

  function faceStyle(side) {
    if (side === 'ext') return { lo: 'concrete_wall', hi: 'brick_old', split: 0.55, region: 'ext', rail: null };
    const z = ZDEF[side];
    return { lo: z.lo, hi: z.hi, split: z.lo === z.hi ? 0 : 1.15, region: 'z' + side, rail: z.rail };
  }
  function wallFace(w, sideSign, side, s, e, y0, y1) {
    const st = faceStyle(side);
    const off = sideSign * HW, n = WN(w, sideSign);
    const put = (m, ya, yb) => { if (yb - ya < 1e-3) return; quad(m, st.region, WP(w, s, ya, off), WP(w, e, ya, off), WP(w, e, yb, off), WP(w, s, yb, off), n); };
    if (st.split > 0) {
      put(st.lo, y0, Math.min(y1, st.split));
      put(st.hi, Math.max(y0, st.split), y1);
      // dado rail / plinth cap
      if (st.rail && y0 < st.split && y1 > st.split) {
        const mid = (s + e) / 2, len = e - s;
        const p = WP(w, mid, st.split, sideSign * (HW + 0.025));
        box(st.rail, st.region, p[0], p[1], p[2], w.axis === 'x' ? len : 0.05, 0.07, w.axis === 'x' ? 0.05 : len, { uv: 'world' });
      }
    } else put(st.hi, y0, y1);
    // skirting
    if (side !== 'ext' && y0 < 0.01) {
      const mid = (s + e) / 2, len = e - s;
      const p = WP(w, mid, 0.08, sideSign * (HW + 0.015));
      box('concrete_wall', st.region, p[0], p[1], p[2], w.axis === 'x' ? len : 0.03, 0.16, w.axis === 'x' ? 0.03 : len, { uv: 'world', cast: false });
    }
  }
  function buildWall(w) {
    const ops = [...w.openings].sort((a, b) => a.at - b.at);
    let cur = w.a0;
    const pieces = [];
    for (const o of ops) {
      const s = o.at - o.w / 2, e = o.at + o.w / 2;
      pieces.push({ s: cur, e: s, y0: 0, y1: WALL_H, jamb: 'e' });
      if (o.y0 > 0) pieces.push({ s, e, y0: 0, y1: o.y0, sill: true });
      pieces.push({ s, e, y0: o.y1, y1: WALL_H, head: true, kind: o.kind });
      o.s = s; o.e = e;
      cur = e;
    }
    pieces.push({ s: cur, e: w.a1, y0: 0, y1: WALL_H });
    // jambs: a full piece whose end touches an opening start, or start touches opening end
    for (const p of pieces) {
      if (p.e - p.s < 1e-3) continue;
      wallFace(w, -1, w.neg, p.s, p.e, p.y0, p.y1);
      wallFace(w, +1, w.pos, p.s, p.e, p.y0, p.y1);
      // top of wall (hidden by roof, visible in overview)
      if (p.y1 >= WALL_H) quad('concrete_wall', 'roof', WP(w, p.s, WALL_H, -HW), WP(w, p.e, WALL_H, -HW), WP(w, p.e, WALL_H, HW), WP(w, p.s, WALL_H, HW), [0, 1, 0], false);
      if (p.sill) quad('concrete_wall', 'walls', WP(w, p.s, p.y1, -HW), WP(w, p.e, p.y1, -HW), WP(w, p.e, p.y1, HW), WP(w, p.s, p.y1, HW), [0, 1, 0]);
      if (p.head) quad('concrete_wall', 'walls', WP(w, p.s, p.y0, -HW), WP(w, p.e, p.y0, -HW), WP(w, p.e, p.y0, HW), WP(w, p.s, p.y0, HW), [0, -1, 0]);
      // collider + ray proxy
      const a = WP(w, p.s, p.y0, -HW), b = WP(w, p.e, p.y1, HW);
      solid(a[0], a[1], a[2], b[0], b[1], b[2], 'concrete');
    }
    // reveals (jambs) for each opening + end caps
    for (const o of ops) {
      const jamb = (at, sign) => quad('concrete_wall', 'walls', WP(w, at, o.y0, -HW), WP(w, at, o.y0, HW), WP(w, at, o.y1, HW), WP(w, at, o.y1, -HW), AX(w, sign));
      jamb(o.s, +1); jamb(o.e, -1);
    }
    const cap = (at, sign) => quad('concrete_wall', 'walls', WP(w, at, 0, -HW), WP(w, at, 0, HW), WP(w, at, WALL_H, HW), WP(w, at, WALL_H, -HW), AX(w, sign));
    cap(w.a0, -1); cap(w.a1, +1);
  }
  WALLS.forEach(buildWall);

  // lintels (concrete beam over doors, both faces) + door thresholds
  for (const ds of DOOR_SPECS) {
    const w = wallById[ds.wall];
    const p = WP(w, ds.at, DOOR_H + 0.14, 0);
    box('concrete_wall', 'walls', p[0], p[1], p[2], w.axis === 'x' ? DOOR_W + 0.7 : WT + 0.12, 0.28, w.axis === 'x' ? WT + 0.12 : DOOR_W + 0.7, { uv: 'world' });
    const t = WP(w, ds.at, 0.01, 0);
    box('concrete_floor', 'walls', t[0], t[1], t[2], w.axis === 'x' ? DOOR_W : WT + 0.1, 0.02, w.axis === 'x' ? WT + 0.1 : DOOR_W, { uv: 'world', cast: false });
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
    quad(z.floor, 'z' + z.id, [z.x0, 0, z.z0], [z.x1, 0, z.z0], [z.x1, 0, z.z1], [z.x0, 0, z.z1], [0, 1, 0], false);
    solid(z.x0, -0.3, z.z0, z.x1, 0, z.z1, z.floor === 'wood_floor' ? 'wood' : 'concrete', { col: false });
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
      quad('concrete_wall', 'roof', [a, WALL_H, b], [c, WALL_H, b], [c, WALL_H, d], [a, WALL_H, d], [0, -1, 0]);
      quad('concrete_floor', 'roof', [a, WALL_H + 0.35, b], [c, WALL_H + 0.35, b], [c, WALL_H + 0.35, d], [a, WALL_H + 0.35, d], [0, 1, 0]);
      solid(a, WALL_H, b, c, WALL_H + 0.35, d, 'concrete', { col: false });
    }
    if (hole) {
      // hole rim faces
      const y0 = WALL_H, y1 = WALL_H + 0.35;
      quad('concrete_wall', 'roof', [hole.x0, y0, hole.z0], [hole.x1, y0, hole.z0], [hole.x1, y1, hole.z0], [hole.x0, y1, hole.z0], [0, 0, 1]);
      quad('concrete_wall', 'roof', [hole.x0, y0, hole.z1], [hole.x1, y0, hole.z1], [hole.x1, y1, hole.z1], [hole.x0, y1, hole.z1], [0, 0, -1]);
      quad('concrete_wall', 'roof', [hole.x0, y0, hole.z0], [hole.x0, y0, hole.z1], [hole.x0, y1, hole.z1], [hole.x0, y1, hole.z0], [1, 0, 0]);
      quad('concrete_wall', 'roof', [hole.x1, y0, hole.z0], [hole.x1, y0, hole.z1], [hole.x1, y1, hole.z1], [hole.x1, y1, hole.z0], [-1, 0, 0]);
    }
  }
  // roof parapet edge (outer rim of the building, reads as a slab lip from outside)
  // exterior ground
  {
    const g = prep(new THREE.PlaneGeometry(260, 260, 1, 1));
    xform(g, 0, -0.012, -6, -Math.PI / 2, 0, 0);
    projUV(g, 0.5);
    emit(g, 'dirt_ground', 'ground', false);
    solid(-130, -1, -136, 130, -0.012, 124, 'dirt', { col: false });
  }

  const updaters = [];
  const powerables = []; // {x,z, set(on, delay, instant)}
  // =============================================================================================
  // WINDOWS
  // =============================================================================================
  const windows = [];
  const plankProxies = [];
  const plankMat = mat('wood_board');
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
      const v = new THREE.Vector3(lx, ly, lz).applyAxisAngle(new THREE.Vector3(0, 1, 0), g.rotation.y).add(c);
      const isX = Math.abs(n.z) > 0.5; // local x maps to world x when wall runs along x
      box('wood_planks', 'z' + spec.zone, v.x, v.y, v.z, isX ? sx : sz, sy, isX ? sz : sx, { uvs: 0.5 });
    };
    const fz = HW + 0.04;
    frame(-WIN_W / 2 - 0.07, (WIN_Y0 + WIN_Y1) / 2, fz, 0.14, WIN_Y1 - WIN_Y0 + 0.28, 0.08);
    frame(WIN_W / 2 + 0.07, (WIN_Y0 + WIN_Y1) / 2, fz, 0.14, WIN_Y1 - WIN_Y0 + 0.28, 0.08);
    frame(0, WIN_Y1 + 0.07, fz, WIN_W + 0.28, 0.14, 0.08);
    frame(0, WIN_Y0 - 0.05, fz + 0.02, WIN_W + 0.36, 0.1, 0.14);
    // planks
    const prng = mulberry32(100 + idx * 17);
    const rests = [
      { y: 1.02, rz: 0.10 }, { y: 1.30, rz: -0.12 }, { y: 1.56, rz: 0.06 },
      { y: 1.82, rz: -0.08 }, { y: 2.08, rz: 0.12 }, { y: 1.55, rz: -0.52 },
    ].map((r, i) => ({ x: (prng() - 0.5) * 0.12, y: r.y + (prng() - 0.5) * 0.05, z: HW + 0.075 + i * 0.012, rz: r.rz + (prng() - 0.5) * 0.08, ry: (prng() - 0.5) * 0.04 }));
    const slots = rests.map((rest, i) => {
      const m = new THREE.Object3D(); // proxy; rendered through one shared InstancedMesh
      plankProxies.push(m);
      m.position.set(rest.x, rest.y, rest.z);
      m.rotation.set(0, rest.ry, rest.rz, 'YXZ');
      g.add(m);
      return { i, rest, mesh: m, on: true, tw: null };
    });
    const outsidePos = c.clone().addScaledVector(n, -3.7);
    const attackPos = c.clone().addScaledVector(n, -(HW + 0.6));
    const insidePos = c.clone().addScaledVector(n, HW + 0.8);
    const interactPos = c.clone().addScaledVector(n, HW + 1.0);
    // collider plug (player can't leave; zombies vault scripted). noLOS so it doesn't block sight/shots.
    const along0 = spec.at - WIN_W / 2, along1 = spec.at + WIN_W / 2;
    const a = WP(w, along0, 0, -HW), b = WP(w, along1, WALL_H, HW);
    const plug = solid(a[0], a[1], a[2], b[0], b[1], b[2], 'wood', { ray: false, noLOS: true, tag: 'window' });
    reserve(c.x, c.z, 1.6);
    reserve(insidePos.x, insidePos.z, 1.2);
    reserve(outsidePos.x, outsidePos.z, 1.8);
    reserve(attackPos.x, attackPos.z, 1.2);

    const setPose = (m, p, r) => { m.position.copy(p); m.rotation.set(r.x, r.y, r.z, 'YXZ'); };
    const restPos = (s) => new THREE.Vector3(s.rest.x, s.rest.y, s.rest.z);
    const restRot = (s) => new THREE.Vector3(0, s.rest.ry, s.rest.rz);
    function tearAnim(s) {
      if (s.tw) s.tw.alive = false;
      const m = s.mesh; m.visible = true; m.scale.set(1, 1, 1);
      const p0 = m.position.clone(), r0 = new THREE.Vector3(m.rotation.x, m.rotation.y, m.rotation.z);
      const p1 = new THREE.Vector3((prng() - 0.5) * 1.6, 0.03, -(HW + 1.1 + prng() * 1.3));
      const spin = (prng() < 0.5 ? -1 : 1) * Math.PI * 2;
      const r1 = new THREE.Vector3(Math.PI / 2, (prng() - 0.5) * 2.4 + spin, (prng() - 0.5) * 0.3);
      const dur = 0.75;
      s.tw = tween(dur, (k) => {
        // first pull straight out of the frame then arc to the ground
        const e = easeOut(k);
        const p = new THREE.Vector3().lerpVectors(p0, p1, e);
        p.y = lerp(p0.y, p1.y, k * k) + Math.sin(Math.PI * k) * 0.55 * (1 - k);
        if (k < 0.25) p.x = lerp(p0.x, p0.x * 0.3, k / 0.25);
        m.position.copy(p);
        m.rotation.set(lerp(r0.x, r1.x, e), lerp(r0.y, r1.y, e), lerp(r0.z, r1.z, e), 'YXZ');
      }, {
        done: () => {
          s.tw = tween(1.0, (k) => { m.position.y = p1.y - k * 0.06; m.scale.setScalar(1 - k * 0.85); }, {
            delay: 3.5, done: () => { m.visible = false; m.scale.setScalar(1); s.tw = null; },
          });
        },
      });
    }
    function addAnim(s) {
      if (s.tw) s.tw.alive = false;
      const m = s.mesh;
      if (!m.visible) {
        m.visible = true; m.scale.setScalar(1);
        setPose(m, new THREE.Vector3((prng() - 0.5) * 1.4, 0.04, -(HW + 1.0 + prng())), new THREE.Vector3(Math.PI / 2, prng() * 3, 0));
      }
      m.scale.setScalar(1);
      const p0 = m.position.clone(), r0 = new THREE.Vector3(m.rotation.x, m.rotation.y, m.rotation.z);
      const p1 = restPos(s), r1 = restRot(s);
      s.tw = tween(0.42, (k) => {
        const e = easeIn(k) * 0.7 + k * 0.3;
        const p = new THREE.Vector3().lerpVectors(p0, p1, e);
        p.y += Math.sin(Math.PI * k) * 0.5;
        m.position.copy(p);
        m.rotation.set(lerp(r0.x, r1.x, e), lerp(r0.y, r1.y, e), lerp(r0.z, r1.z, e), 'YXZ');
      }, {
        done: () => {
          // slam: tiny overshoot into the frame
          s.tw = tween(0.12, (k) => { m.position.z = p1.z - Math.sin(Math.PI * k) * 0.03; }, { done: () => { setPose(m, p1, r1); s.tw = null; } });
        },
      });
    }
    const snapOn = (s) => { if (s.tw) s.tw.alive = false; s.tw = null; s.mesh.visible = true; s.mesh.scale.setScalar(1); setPose(s.mesh, restPos(s), restRot(s)); };
    const snapOff = (s) => { if (s.tw) s.tw.alive = false; s.tw = null; s.mesh.visible = false; s.mesh.scale.setScalar(1); };
    // delayed start helper (keeps multi-plank jumps readable instead of all planks flying at once)
    const later = (s, delay, fn) => { if (s.tw) s.tw.alive = false; s.tw = delay > 0 ? tween(0.001, () => {}, { delay, done: () => { s.tw = null; fn(s); } }) : null; if (!(delay > 0)) fn(s); };
    // Slot invariant: the planks that are ON are always slots 0..planks-1 (tear takes the highest,
    // add fills the lowest), so host and clients show identical boards for the same count.
    const win = {
      id: idx, zone: spec.zone, outsidePos, attackPos, insidePos, interactPos, yaw,
      maxPlanks: 6,
      get planks() { let n = 0; for (const s of slots) if (s.on) n++; return n; },
      tearPlank(animate = true, delay = 0) {
        for (let i = slots.length - 1; i >= 0; i--) if (slots[i].on) {
          const s = slots[i]; s.on = false;
          if (animate) later(s, delay, tearAnim); else snapOff(s);
          return true;
        }
        return false;
      },
      addPlank(animate = true, delay = 0) {
        for (const s of slots) if (!s.on) {
          s.on = true;
          if (animate) later(s, delay, addAnim); else snapOn(s);
          return true;
        }
        return false;
      },
      // net mirror: reach n planks. Same n -> no-op (safe to call every snapshot); jumps are staggered.
      setPlanks(n, animate = true) {
        n = Math.max(0, Math.min(6, n | 0));
        let cur = this.planks, k = 0;
        while (cur > n) { this.tearPlank(animate, animate ? 0.14 * k++ : 0); cur--; }
        while (cur < n) { this.addPlank(animate, animate ? 0.09 * k++ : 0); cur++; }
        return this.planks;
      },
      // instant by default (game reset). repairAll(true) = staggered fly-back animation (carpenter).
      repairAll(animated = false) {
        let k = 0;
        for (const s of slots) {
          if (s.on) { if (!animated && s.tw) snapOn(s); continue; }
          s.on = true;
          if (animated) later(s, 0.09 * k++, addAnim); else snapOn(s);
        }
      },
      group: g, collider: plug, center: c.clone(), normal: n.clone(),
    };
    windows.push(win);
    return win;
  }
  WIN_SPECS.forEach(buildWindow);
  {
    const inst = new THREE.InstancedMesh(plankGeo, plankMat, plankProxies.length);
    inst.castShadow = true; inst.receiveShadow = true; inst.frustumCulled = false; inst.name = 'planks';
    dynGroup.add(inst);
    const zero = new THREE.Matrix4().makeScale(0, 0, 0), m4 = new THREE.Matrix4();
    const sync = () => {
      for (let i = 0; i < plankProxies.length; i++) {
        const p = plankProxies[i];
        if (!p.visible) { inst.setMatrixAt(i, zero); continue; }
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
    const nA = inwardN(w, spec.zoneA), nB = inwardN(w, spec.zoneB);
    const depth = spec.kind === 'debris' ? 1.0 : HW + 0.05;
    const a = WP(w, spec.at - DOOR_W / 2, 0, -depth), b = WP(w, spec.at + DOOR_W / 2, DOOR_H, depth);
    const col = solid(a[0], a[1], a[2], b[0], b[1], b[2], spec.kind === 'debris' ? 'concrete' : 'metal', { tag: 'door' });
    col.door = spec.id;
    const door = {
      id: spec.id, zoneA: spec.zoneA, zoneB: spec.zoneB, cost: spec.cost, label: spec.label, kind: spec.kind,
      interactPos: c.clone().addScaledVector(nA, spec.kind === 'debris' ? 1.9 : 1.2),
      interactPositions: [c.clone().addScaledVector(nA, spec.kind === 'debris' ? 1.9 : 1.2), c.clone().addScaledVector(nB, spec.kind === 'debris' ? 1.9 : 1.2)],
      isOpen: false, collider: col, center: c.clone(),
      _anim: null, _snapOpen: null,
      // idempotent: returns false (and does nothing) if already open. open(false) = no animation (late join)
      open(animate = true) {
        if (this.isOpen) return false;
        this.isOpen = true;
        const i = colliders.indexOf(col); if (i >= 0) colliders.splice(i, 1);
        if (col.proxy) { const j = raycastTargets.indexOf(col.proxy); if (j >= 0) raycastTargets.splice(j, 1); }
        this._kill();
        if (animate && this._anim) this._anim(); else if (this._snapOpen) this._snapOpen();
        return true;
      },
      // back to the closed state (new game / host reconciliation). Idempotent.
      close() {
        if (!this.isOpen) return false;
        this.isOpen = false;
        this._gen = (this._gen || 0) + 1; // invalidates pending open-animation callbacks
        if (!colliders.includes(col)) colliders.push(col);
        if (col.proxy && !raycastTargets.includes(col.proxy)) raycastTargets.push(col.proxy);
        this._kill();
        if (this._reset) this._reset();
        return true;
      },
      _tws: [],
      _tw(dur, fn, o) { const t = tween(dur, fn, o); this._tws.push(t); if (this._tws.length > 24) this._tws = this._tws.filter((x) => x.alive); return t; },
      _kill() { for (const t of this._tws) t.alive = false; this._tws.length = 0; },
      setOpen(open, animate = true) { return open ? this.open(animate) : this.close(); },
      _reset: null,
    };
    const fn = buildDoorFns[spec.kind];
    if (fn) fn(door, w, c, nA, nB);
    doors.push(door);
    return door;
  }

  // ---- debris pile (door 0) ----
  buildDoorFns.debris = (door, w, c) => {
    const g = new THREE.Group(); g.position.copy(c); dynGroup.add(g);
    const prng = mulberry32(77);
    const geos = { concrete: [], wood: [], metal: [], bag: [] };
    const isZ = w.axis === 'z';
    const P = (u, y, v) => (isZ ? [v, y, u] : [u, y, v]); // u along wall, v across
    for (let i = 0; i < 46; i++) {
      const u = (prng() - 0.5) * 2.6, v = (prng() - 0.5) * 1.8;
      const hmax = 2.5 * Math.max(0, 1 - Math.pow(Math.abs(u) / 1.5, 2)) * Math.max(0, 1 - Math.pow(Math.abs(v) / 1.05, 2));
      const r = 0.16 + prng() * 0.26;
      const y = prng() * hmax * 0.9 + r * 0.5;
      const geo = prep(new THREE.DodecahedronGeometry(r, 0));
      projUV(geo, 0.5, prng() * 4, prng() * 4);
      const p = P(u, y, v);
      xform(geo, p[0], p[1], p[2], prng() * 3, prng() * 3, prng() * 3, new THREE.Vector3(1 + prng() * 0.6, 0.6 + prng() * 0.5, 1 + prng() * 0.4));
      geos.concrete.push(geo);
    }
    // concrete slabs leaning
    for (let i = 0; i < 4; i++) {
      const geo = prep(new THREE.BoxGeometry(1.2 + prng() * 0.6, 0.18, 0.8 + prng() * 0.4));
      projUV(geo, 0.5, prng(), prng());
      const p = P((prng() - 0.5) * 1.6, 0.5 + prng() * 1.2, (prng() - 0.5) * 0.9);
      xform(geo, p[0], p[1], p[2], (prng() - 0.5) * 1.4, prng() * 3, (prng() - 0.5) * 1.2);
      geos.concrete.push(geo);
    }
    // broken beams
    for (let i = 0; i < 5; i++) {
      const geo = prep(new THREE.BoxGeometry(2.4 + prng(), 0.22, 0.24));
      projUV(geo, 0.5, prng(), prng());
      const p = P((prng() - 0.5) * 1.2, 0.4 + prng() * 1.6, (prng() - 0.5) * 1.0);
      xform(geo, p[0], p[1], p[2], (prng() - 0.5) * 0.5, (isZ ? Math.PI / 2 : 0) + (prng() - 0.5) * 0.9, (prng() - 0.5) * 1.1);
      geos.wood.push(geo);
    }
    // bent girder + rebar
    {
      const geo = prep(new THREE.BoxGeometry(2.8, 0.2, 0.12));
      const p = P(0.2, 1.7, 0.1);
      xform(geo, p[0], p[1], p[2], 0.2, isZ ? Math.PI / 2 : 0, 0.55);
      geos.metal.push(geo);
      for (let i = 0; i < 6; i++) {
        const r = prep(new THREE.CylinderGeometry(0.012, 0.012, 1.2 + prng(), 5));
        const q = P((prng() - 0.5) * 2, 1 + prng() * 1.3, (prng() - 0.5) * 0.8);
        xform(r, q[0], q[1], q[2], prng() * 3, prng() * 3, prng() * 3);
        geos.metal.push(r);
      }
    }
    // sandbags spilling at the base
    for (let i = 0; i < 8; i++) {
      const geo = sandbagGeo();
      const p = P((prng() - 0.5) * 2.6, 0.1 + prng() * 0.2, (prng() < 0.5 ? -1 : 1) * (0.7 + prng() * 0.3));
      xform(geo, p[0], p[1], p[2], (prng() - 0.5) * 0.4, prng() * 3, (prng() - 0.5) * 0.4);
      geos.bag.push(geo);
    }
    const meshes = [];
    const addM = (arr, m) => { if (!arr.length) return; const mesh = new THREE.Mesh(mergeGeometries(arr), mat(m)); mesh.castShadow = mesh.receiveShadow = true; g.add(mesh); meshes.push(mesh); };
    addM(geos.concrete, 'concrete_wall'); addM(geos.wood, 'wood_planks'); addM(geos.metal, 'metal_rusty'); addM(geos.bag, 'sandbag');
    door._anim = () => {
      puff(c.clone().setY(0.6), 26, 1.6);
      door._tw(1.5, (k) => {
        const e = easeIn(k);
        g.position.set(c.x + Math.sin(k * 60) * 0.03 * (1 - k), -e * 2.2, c.z + Math.cos(k * 53) * 0.03 * (1 - k));
        g.scale.set(1 - e * 0.25, 1 - e * 0.6, 1 - e * 0.25);
      }, { done: () => { g.visible = false; } });
      door._tw(0.001, () => {}, { delay: 0.5, done: () => puff(c.clone().setY(0.3), 18, 2.2) });
    };
    door._snapOpen = () => { g.visible = false; };
    door._reset = () => { g.visible = true; g.position.copy(c); g.scale.setScalar(1); };
  };

  // ---- sliding barred steel door (door 1) ----
  buildDoorFns.steel = (door, w, c, nA) => {
    const isZ = w.axis === 'z';
    const leaf = new THREE.Group(); leaf.position.copy(c); dynGroup.add(leaf);
    const geosP = [], geosR = [];
    const L = (u, y, v) => (isZ ? [v, y, u] : [u, y, v]);
    const addB = (arr, u, y, v, su, sy, sv) => { const geo = prep(new THREE.BoxGeometry(isZ ? sv : su, sy, isZ ? su : sv)); projUV(geo, 0.5, rng(), rng()); const p = L(u, y, v); xform(geo, p[0], p[1], p[2]); arr.push(geo); };
    addB(geosP, 0, DOOR_H / 2 + 0.05, 0, DOOR_W + 0.1, DOOR_H + 0.1, 0.1);
    // frame ribs, rivet strips, viewing slot
    for (const u of [-1.15, 1.15]) addB(geosR, u, DOOR_H / 2, 0, 0.12, DOOR_H, 0.16);
    for (const y of [0.15, 1.35, 2.6]) addB(geosR, 0, y, 0, DOOR_W, 0.12, 0.16);
    addB(geosR, 0, 1.35, 0, 0.1, DOOR_H - 0.3, 0.14);
    for (let i = 0; i < 2; i++) for (let s of [-1, 1]) {
      // diagonal braces
      const geo = prep(new THREE.BoxGeometry(isZ ? 0.14 : 1.45, 0.1, isZ ? 1.45 : 0.14));
      const y = i ? 2.0 : 0.75; const p = L(s * 0.58, y, 0);
      xform(geo, p[0], p[1], p[2], isZ ? s * 0.62 : 0, 0, isZ ? 0 : s * 0.62);
      geosR.push(geo);
    }
    // rivets
    for (let u = -1.1; u <= 1.1; u += 0.22) for (const y of [0.15, 1.35, 2.6]) for (const sgn of [-1, 1]) {
      const geo = prep(new THREE.SphereGeometry(0.018, 5, 3)); const p = L(u, y, sgn * 0.085); xform(geo, p[0], p[1], p[2]); geosR.push(geo);
    }
    const panel = new THREE.Mesh(mergeGeometries(geosP), mat('metal_painted_green'));
    const ribs = new THREE.Mesh(mergeGeometries(geosR), mat('metal_rusty'));
    for (const m of [panel, ribs]) { m.castShadow = m.receiveShadow = true; leaf.add(m); }
    // locking bars on zone A side, pivot at one end
    const bars = [];
    for (const y of [0.95, 1.85]) {
      const piv = new THREE.Group();
      const endU = -1.55;
      const pv = new THREE.Vector3(...L(endU, y, 0)).add(c).addScaledVector(nA, HW + 0.08);
      piv.position.copy(pv); dynGroup.add(piv);
      const bar = new THREE.Mesh(new THREE.BoxGeometry(isZ ? 0.09 : 3.1, 0.12, isZ ? 3.1 : 0.09), mat('metal_rusty'));
      bar.position.set(...L(1.55, 0, 0)); bar.castShadow = true;
      piv.add(bar);
      bars.push(piv);
      // brackets (static)
      for (const bu of [-1.45, 1.45]) {
        const bp = new THREE.Vector3(...L(bu, y, 0)).add(c).addScaledVector(nA, HW + 0.08);
        box('metal_rusty', 'walls', bp.x, bp.y - 0.02, bp.z, isZ ? 0.16 : 0.12, 0.2, isZ ? 0.12 : 0.16);
      }
    }
    const slideDir = new THREE.Vector3(...AX(w, 1));
    const barPose = (piv, e) => { if (isZ) piv.rotation.x = e * Math.PI / 2 * (nA.x > 0 ? 1 : -1) * -1; else piv.rotation.z = e * Math.PI / 2; };
    door._anim = () => {
      bars.forEach((piv, i) => door._tw(0.45, (k) => barPose(piv, easeInOut(k)), { delay: i * 0.12 }));
      door._tw(1.4, (k) => { leaf.position.copy(c).addScaledVector(slideDir, easeInOut(k) * 2.6); }, { delay: 0.55, done: () => { leaf.visible = false; } });
    };
    door._snapOpen = () => { bars.forEach((piv) => barPose(piv, 1)); leaf.position.copy(c).addScaledVector(slideDir, 2.6); leaf.visible = false; };
    door._reset = () => { leaf.visible = true; leaf.position.copy(c); bars.forEach((b) => b.rotation.set(0, 0, 0)); };
  };

  // ---- swinging barred gate (door 2) ----
  buildDoorFns.gate = (door, w, c, nA, nB) => {
    // hinge planes sit just inside zone B (swings into zone B)
    const isZ = w.axis === 'z';
    const leaves = [];
    for (const side of [-1, 1]) {
      const piv = new THREE.Group();
      const hingeAlong = (w.axis === 'x' ? c.x : c.z) + side * DOOR_W / 2;
      const hp = wallPoint(w, hingeAlong).addScaledVector(nB, HW + 0.05);
      piv.position.copy(hp);
      piv.rotation.y = Math.atan2(nB.x, nB.z); // local +Z = into zone B, local +X along wall
      dynGroup.add(piv);
      // leaf extends from its hinge toward the door centre; local +X may be flipped by the pivot yaw
      const localXAlong = w.axis === 'x' ? Math.cos(piv.rotation.y) : -Math.sin(piv.rotation.y);
      const dirX = -side * Math.sign(localXAlong || 1);
      const geos = [];
      const addB = (x, y, z, sx, sy, sz) => { const geo = prep(new THREE.BoxGeometry(sx, sy, sz)); projUV(geo, 1, rng(), rng()); xform(geo, x, y, z); geos.push(geo); };
      const len = DOOR_W / 2 - 0.02;
      addB(dirX * len / 2, 0.08, 0, len, 0.07, 0.05);
      addB(dirX * len / 2, DOOR_H - 0.1, 0, len, 0.07, 0.05);
      addB(dirX * len / 2, 1.3, 0, len, 0.06, 0.04);
      addB(dirX * 0.03, DOOR_H / 2, 0, 0.07, DOOR_H - 0.1, 0.06);
      addB(dirX * (len - 0.03), DOOR_H / 2, 0, 0.07, DOOR_H - 0.1, 0.06);
      for (let x = 0.14; x < len - 0.05; x += 0.13) {
        const geo = prep(new THREE.CylinderGeometry(0.016, 0.016, DOOR_H - 0.1, 6));
        xform(geo, dirX * x, DOOR_H / 2, 0); geos.push(geo);
        const tip = prep(new THREE.ConeGeometry(0.03, 0.09, 6)); xform(tip, dirX * x, DOOR_H - 0.02, 0); geos.push(tip);
      }
      // diagonal
      const diag = prep(new THREE.BoxGeometry(Math.hypot(len, 1.1), 0.05, 0.035));
      xform(diag, dirX * len / 2, 0.7, 0, 0, 0, Math.atan2(1.1, len) * -dirX); geos.push(diag);
      const m = new THREE.Mesh(mergeGeometries(geos), mat('metal_rusty'));
      m.castShadow = true; m.receiveShadow = true;
      piv.add(m);
      leaves.push({ piv, side, dirX, base: piv.rotation.y });
    }
    // chain + padlock at the meeting stiles
    const lock = new THREE.Group(); lock.position.copy(c).addScaledVector(nB, HW + 0.1); lock.position.y = 1.3; dynGroup.add(lock);
    {
      const geos = [];
      for (let i = 0; i < 7; i++) { const t = prep(new THREE.TorusGeometry(0.03, 0.008, 4, 8)); xform(t, (i - 3) * 0.045, Math.sin(i) * 0.02, 0, 0, i % 2 ? Math.PI / 2 : 0, 0); geos.push(t); }
      const body = prep(new THREE.BoxGeometry(0.07, 0.08, 0.035)); xform(body, 0.02, -0.08, 0.02); geos.push(body);
      const lm = new THREE.Mesh(mergeGeometries(geos), mat('metal_rusty'));
      lm.rotation.y = Math.atan2(nB.x, nB.z);
      lock.add(lm);
    }
    const openCols = [];
    const leafTarget = (L) => L.base - Math.sign(L.dirX) * Math.PI * 0.96; // swings flat against the zone-B face
    const addOpenCols = () => {
      if (openCols.length) return;
      for (const L of leaves) {
        const bb = new THREE.Box3();
        const r0 = L.piv.rotation.y; L.piv.rotation.y = leafTarget(L); L.piv.updateMatrixWorld(true);
        bb.setFromObject(L.piv); L.piv.rotation.y = r0; L.piv.updateMatrixWorld(true);
        openCols.push(solid(bb.min.x, 0, bb.min.z, bb.max.x, 2.7, bb.max.z, 'metal', { ray: false }));
      }
    };
    door._anim = () => {
      door._tw(0.001, () => {}, { delay: 1.75, done: addOpenCols });
      door._tw(0.4, (k) => { lock.position.y = 1.3 - easeIn(k) * 1.27; lock.rotation.z = k * 1.4; }, { done: () => door._tw(0.6, (k) => lock.scale.setScalar(1 - k), { delay: 2, done: () => (lock.visible = false) }) });
      for (const L of leaves) {
        const target = leafTarget(L);
        door._tw(1.3, (k) => { const e = easeOut(k); L.piv.rotation.y = lerp(L.base, target, e); }, { delay: 0.35 });
      }
    };
    door._snapOpen = () => { for (const L of leaves) L.piv.rotation.y = leafTarget(L); lock.visible = false; addOpenCols(); };
    door._reset = () => { for (const b of openCols.splice(0)) { const i = colliders.indexOf(b); if (i >= 0) colliders.splice(i, 1); } lock.visible = true; lock.position.y = 1.3; lock.scale.setScalar(1); lock.rotation.z = 0; leaves.forEach((L) => (L.piv.rotation.y = L.base)); };
  };

  // =============================================================================================
  // SMALL PARTICLE POOLS (dust puffs, sparks) — level-local so doors / switch / anvil can animate
  // =============================================================================================
  const PMAX = 400;
  const pPos = new Float32Array(PMAX * 3), pCol = new Float32Array(PMAX * 3), pSize = new Float32Array(PMAX), pAlpha = new Float32Array(PMAX);
  const pVel = new Float32Array(PMAX * 3), pLife = new Float32Array(PMAX), pMax = new Float32Array(PMAX), pKind = new Uint8Array(PMAX);
  const pGeo = new THREE.BufferGeometry();
  pGeo.setAttribute('position', new THREE.BufferAttribute(pPos, 3));
  pGeo.setAttribute('aColor', new THREE.BufferAttribute(pCol, 3));
  pGeo.setAttribute('aSize', new THREE.BufferAttribute(pSize, 1));
  pGeo.setAttribute('aAlpha', new THREE.BufferAttribute(pAlpha, 1));
  const pMat = new THREE.ShaderMaterial({
    uniforms: { uScale: { value: 500 } },
    vertexShader: `attribute vec3 aColor; attribute float aSize; attribute float aAlpha; varying vec3 vC; varying float vA; uniform float uScale;
      void main(){ vec4 mv = modelViewMatrix*vec4(position,1.0); gl_Position = projectionMatrix*mv; gl_PointSize = aSize*uScale/max(0.1,-mv.z); vC=aColor; vA=aAlpha; }`,
    fragmentShader: `varying vec3 vC; varying float vA; void main(){ float d=length(gl_PointCoord-0.5); float a=smoothstep(0.5,0.05,d)*vA; if(a<0.004) discard; gl_FragColor=vec4(vC*a, a); }`,
    transparent: true, depthWrite: false, blending: THREE.CustomBlending,
    blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor,
  });
  const points = new THREE.Points(pGeo, pMat); points.frustumCulled = false; points.renderOrder = 5; root.add(points);
  let pNext = 0;
  function emitP(x, y, z, vx, vy, vz, life, size, r, g, b, kind) {
    const i = pNext; pNext = (pNext + 1) % PMAX;
    pPos[i * 3] = x; pPos[i * 3 + 1] = y; pPos[i * 3 + 2] = z;
    pVel[i * 3] = vx; pVel[i * 3 + 1] = vy; pVel[i * 3 + 2] = vz;
    pLife[i] = life; pMax[i] = life; pSize[i] = size; pKind[i] = kind;
    pCol[i * 3] = r; pCol[i * 3 + 1] = g; pCol[i * 3 + 2] = b;
  }
  function puff(p, n = 16, spread = 1) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, s = Math.random() * spread;
      const c = 0.28 + Math.random() * 0.1;
      emitP(p.x + Math.cos(a) * s * 0.5, p.y + Math.random() * 0.8, p.z + Math.sin(a) * s * 0.5, Math.cos(a) * s * 0.8, 0.3 + Math.random() * 0.6, Math.sin(a) * s * 0.8, 1.6 + Math.random() * 1.4, 0.9 + Math.random() * 0.9, c, c * 0.95, c * 0.9, 0);
    }
  }
  function sparks(p, n = 24, power = 1) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, up = Math.random();
      const s = (1 + Math.random() * 3) * power;
      emitP(p.x, p.y, p.z, Math.cos(a) * s * 0.6, up * s, Math.sin(a) * s * 0.6, 0.35 + Math.random() * 0.5, 0.035 + Math.random() * 0.03, 3.0, 1.6, 0.5, 1);
    }
  }
  function updateParticles(dt) {
    for (let i = 0; i < PMAX; i++) {
      if (pLife[i] <= 0) { pAlpha[i] = 0; continue; }
      pLife[i] -= dt;
      const k = 1 - pLife[i] / pMax[i];
      if (pKind[i] === 1) { // spark: gravity + bounce
        pVel[i * 3 + 1] -= 9.8 * dt;
        if (pPos[i * 3 + 1] < 0.01 && pVel[i * 3 + 1] < 0) { pVel[i * 3 + 1] *= -0.35; pVel[i * 3] *= 0.6; pVel[i * 3 + 2] *= 0.6; }
        pAlpha[i] = (1 - k);
      } else { // dust: drag, grow
        const d = Math.exp(-2.2 * dt);
        pVel[i * 3] *= d; pVel[i * 3 + 2] *= d; pVel[i * 3 + 1] *= d;
        pSize[i] += dt * 0.5;
        pAlpha[i] = Math.sin(Math.PI * Math.min(1, k * 1.2)) * 0.45;
      }
      pPos[i * 3] += pVel[i * 3] * dt; pPos[i * 3 + 1] += pVel[i * 3 + 1] * dt; pPos[i * 3 + 2] += pVel[i * 3 + 2] * dt;
    }
    pGeo.attributes.position.needsUpdate = true; pGeo.attributes.aAlpha.needsUpdate = true; pGeo.attributes.aSize.needsUpdate = true; pGeo.attributes.aColor.needsUpdate = true;
  }

  // sandbag geometry (flattened pillow)
  function sandbagGeo() {
    const g = new THREE.SphereGeometry(1, 10, 6);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      let x = p.getX(i) * 0.3, y = p.getY(i) * 0.12, z = p.getZ(i) * 0.17;
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
    THREE, root, staticGroup, dynGroup, roofGroup, mat, box, boxB, cyl, cylGeo, anyGeo, quad, emit, xform, prep, projUV,
    solid, solidC, reserve, isFree, rng, R, pick, tween, tweenP, wait, puff, sparks, sandbagGeo, updaters, powerables, rayGroup,
    lightsOut, ZDEF, WALLS, wallById, wallPoint, inwardN, windows, doors, HOLES, canvasTex, colliders, raycastTargets, zoneAt, T,
  };
  const features = buildFeatures(ctx);   // wall buys, perks, box, switch, anvil
  buildDressing(ctx);                     // props, exterior, trees
  const lighting = buildLighting(ctx, features);

  // ---- finalize merged static meshes --------------------------------------------------------
  let drawStatic = 0;
  for (const b of buckets.values()) {
    if (!b.geos.length) continue;
    const geo = mergeGeometries(b.geos, false);
    if (!geo) { console.warn('[level] merge failed', b.region, b.material.name); continue; }
    geo.computeBoundingSphere(); geo.computeBoundingBox();
    const m = new THREE.Mesh(geo, b.material);
    m.name = b.region + ':' + (b.material.name || 'mat');
    m.castShadow = b.cast; m.receiveShadow = true;
    m.matrixAutoUpdate = false; m.updateMatrix();
    (b.region === 'roof' ? roofGroup : staticGroup).add(m);
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
        if (pos.x < b.min.x - r || pos.x > b.max.x + r || pos.z < b.min.z - r || pos.z > b.max.z + r) continue;
        const cx = clamp(pos.x, b.min.x, b.max.x), cz = clamp(pos.z, b.min.z, b.max.z);
        const dx = pos.x - cx, dz = pos.z - cz;
        const d2 = dx * dx + dz * dz;
        if (d2 >= r * r) continue;
        if (d2 > 1e-10) {
          const d = Math.sqrt(d2), push = r - d + 1e-4;
          pos.x += (dx / d) * push; pos.z += (dz / d) * push;
        } else {
          // centre inside box: push out along the least-penetration side
          const l = pos.x - b.min.x, rr = b.max.x - pos.x, f = pos.z - b.min.z, bk = b.max.z - pos.z;
          const m = Math.min(l, rr, f, bk);
          if (m === l) pos.x = b.min.x - r - 1e-4; else if (m === rr) pos.x = b.max.x + r + 1e-4;
          else if (m === f) pos.z = b.min.z - r - 1e-4; else pos.z = b.max.z + r + 1e-4;
        }
        moved = true;
      }
      if (!moved) break;
    }
  }
  function resolveCircle(pos, radius = 0.35, height = 1.8) {
    const prev = lastPos.get(pos);
    if (prev) {
      const dx = pos.x - prev.x, dz = pos.z - prev.z, d = Math.hypot(dx, dz);
      const step = Math.max(0.05, radius * 0.45);
      if (d > step && d < 6) {
        // swept: advance from the last resolved position in small steps (no tunnelling at low fps)
        const n = Math.ceil(d / step), tx = pos.x, tz = pos.z;
        pos.x = prev.x; pos.z = prev.z;
        for (let i = 1; i <= n; i++) {
          pos.x += dx / n; pos.z += dz / n;
          resolveAt(pos, radius, height);
        }
        void tx; void tz;
      } else resolveAt(pos, radius, height);
      prev.x = pos.x; prev.z = pos.z;
    } else {
      resolveAt(pos, radius, height);
      if (typeof pos === 'object') lastPos.set(pos, { x: pos.x, z: pos.z });
    }
    return pos;
  }
  function lineOfSight(a, b) {
    const ax = a.x, ay = a.y, az = a.z, bx = b.x, by = b.y, bz = b.z;
    const mnx = Math.min(ax, bx), mxx = Math.max(ax, bx), mnz = Math.min(az, bz), mxz = Math.max(az, bz);
    for (let i = 0; i < colliders.length; i++) {
      const c = colliders[i];
      if (c.noLOS) continue;
      if (c.max.x < mnx || c.min.x > mxx || c.max.z < mnz || c.min.z > mxz) continue;
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
      for (const d of doors) if (d.isOpen) {
        if (open.has(d.zoneA) && !open.has(d.zoneB)) { open.add(d.zoneB); grew = true; }
        if (open.has(d.zoneB) && !open.has(d.zoneA)) { open.add(d.zoneA); grew = true; }
      }
    }
    return open.has(id);
  }

  // =============================================================================================
  // NAV: occupancy grid (0.2 m) + 1 m waypoint graph + A*
  // =============================================================================================
  const nav = buildNav({ colliders, extraStatic: features.navStatic || [], doors, ZDEF });

  // =============================================================================================
  // POWER + UPDATE
  // =============================================================================================
  let powerOn = false;
  function setPower(on, instant = false) {
    on = !!on;
    if (on === powerOn && !instant) return;
    powerOn = on;
    const sw = features.powerSwitch;
    const ox = sw ? sw.interactPos.x : -11.5, oz = sw ? sw.interactPos.z : -20;
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
    const box = features.mysteryBox, anvil = features.anvil;
    return {
      v: 1,
      doors: doors.map((d) => d.isOpen),
      power: powerOn,
      planks: windows.map((w) => w.planks),
      box: { loc: box.target, state: box.isMoving ? 'moving' : box.isOpen ? 'open' : 'closed' },
      anvil: { busy: anvil.busy, n: anvil.forgeCount },
    };
  }
  // Idempotent: only differences are applied, so calling it every snapshot with the same state does
  // nothing. animate=false snaps (late join); animate=true plays the same animations the host played.
  function applyNetState(s, animate = false) {
    if (!s) return;
    if (Array.isArray(s.doors)) s.doors.forEach((o, i) => { const d = doors[i]; if (d && !!o !== d.isOpen) d.setOpen(!!o, animate); });
    if (typeof s.power === 'boolean' && s.power !== powerOn) {
      const sw = features.powerSwitch;
      if (s.power && animate && sw && !sw.isOn) sw.throwSwitch(); // lever anim, then the cascade
      else setPower(s.power, !animate);
    }
    if (Array.isArray(s.planks)) s.planks.forEach((n, i) => { const w = windows[i]; if (w && w.planks !== n) w.setPlanks(n, animate); });
    const box = features.mysteryBox, b = s.box;
    if (b && typeof b.loc === 'number') {
      if (!animate) {
        if (box.isMoving || b.loc !== box.current) box._snapTo(b.loc);
        if (b.state === 'open') box.open(false); else box.close(false);
      } else if (b.state === 'moving' || box.isMoving) {
        if (!box.isMoving) { if (b.loc !== box.current) box.relocate(b.loc); }
        else box.relocate(b.loc); // retarget if the landing spot changed; otherwise same promise
      } else {
        if (b.loc !== box.current) box.relocate(b.loc);
        else if (b.state === 'open') box.open(true);
        else if (b.state === 'closed') box.close(true);
      }
    }
    const a = s.anvil, anvil = features.anvil;
    if (a && typeof a.n === 'number' && a.n !== anvil.forgeCount) {
      if (animate && a.busy && a.n > anvil.forgeCount && !anvil.busy) { anvil.forge(1.4); }
      anvil._setCount(a.n);
    }
  }

  const level = {
    root,
    name: 'Blackwald Bunker',
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
    windows, doors,
    wallBuys: features.wallBuys,
    perks: features.perks,
    mysteryBox: features.mysteryBox,
    powerSwitch: features.powerSwitch,
    anvil: features.anvil,
    fireSpots: lighting.fireSpots,
    menuCamera: { pos: new THREE.Vector3(-2.7, 1.55, 2.7), target: new THREE.Vector3(1.4, 1.6, -7.0) },
    setPower,
    get powered() { return powerOn; },
    get _activeTweens() { return tweens.length; },
    lights: lighting.lights,
    ceiling: roofGroup,
    stats: { staticMeshes: drawStatic },
    update(dt, time, playerPos) {
      dt = Math.min(dt, 0.1);
      for (let i = tweens.length - 1; i >= 0; i--) {
        const tw = tweens[i];
        if (!tw.alive) { tweens.splice(i, 1); continue; }
        tw.t += dt;
        if (tw.t < 0) continue;
        const k = Math.min(1, tw.t / tw.dur);
        tw.fn(tw.ease(k), k);
        if (k >= 1) { tw.alive = false; tweens.splice(i, 1); if (tw.done) tw.done(); }
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
function buildNav({ colliders, extraStatic, doors, ZDEF }) {
  const X0 = -24.6, Z0 = -21.6, X1 = 26.6, Z1 = 8.6;
  const NX = Math.ceil((X1 - X0) / NAV_RES), NZ = Math.ceil((Z1 - Z0) / NAV_RES);
  const code = new Uint8Array(NX * NZ).fill(1);
  const cx = (i) => X0 + (i + 0.5) * NAV_RES, cz = (j) => Z0 + (j + 0.5) * NAV_RES;
  // free inside zone rects
  for (const z of ZDEF) {
    const i0 = Math.max(0, Math.floor((z.x0 - X0) / NAV_RES)), i1 = Math.min(NX - 1, Math.floor((z.x1 - X0) / NAV_RES));
    const j0 = Math.max(0, Math.floor((z.z0 - Z0) / NAV_RES)), j1 = Math.min(NZ - 1, Math.floor((z.z1 - Z0) / NAV_RES));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) { const x = cx(i), zz = cz(j); if (x >= z.x0 && x <= z.x1 && zz >= z.z0 && zz <= z.z1) code[i + j * NX] = 0; }
  }
  function mark(b, val) {
    if (b.max.y <= 0.3 || b.min.y >= 1.7) return;
    const i0 = Math.max(0, Math.floor((b.min.x - NAV_R - X0) / NAV_RES)), i1 = Math.min(NX - 1, Math.floor((b.max.x + NAV_R - X0) / NAV_RES));
    const j0 = Math.max(0, Math.floor((b.min.z - NAV_R - Z0) / NAV_RES)), j1 = Math.min(NZ - 1, Math.floor((b.max.z + NAV_R - Z0) / NAV_RES));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const x = cx(i), z = cz(j);
      // rounded expansion: distance from cell centre to box footprint
      const dx = Math.max(b.min.x - x, 0, x - b.max.x), dz = Math.max(b.min.z - z, 0, z - b.max.z);
      if (dx * dx + dz * dz > NAV_R * NAV_R) continue;
      const k = i + j * NX;
      if (val === 1) code[k] = 1; else if (code[k] === 0) code[k] = val;
    }
  }
  for (const b of colliders) if (b.door === undefined) mark(b, 1);
  for (const b of extraStatic) mark(b, 1);
  for (const b of colliders) if (b.door !== undefined) mark(b, 2 + b.door);

  const codeAt = (x, z) => {
    const i = Math.floor((x - X0) / NAV_RES), j = Math.floor((z - Z0) / NAV_RES);
    if (i < 0 || j < 0 || i >= NX || j >= NZ) return 1;
    return code[i + j * NX];
  };
  const walk = (c) => c === 0 || (c >= 2 && doors[c - 2] && doors[c - 2].isOpen);
  // returns -2 if statically blocked, else door index crossed (or -1)
  function scan(ax, az, bx, bz) {
    const dx = bx - ax, dz = bz - az, L = Math.hypot(dx, dz), n = Math.max(1, Math.ceil(L / 0.08));
    let door = -1;
    for (let s = 0; s <= n; s++) {
      const c = codeAt(ax + dx * s / n, az + dz * s / n);
      if (c === 1) return -2;
      if (c >= 2) door = c - 2;
    }
    return door;
  }
  function clear(ax, az, bx, bz) {
    const tolA = walk(codeAt(ax, az)) ? 0 : 0.55, tolB = walk(codeAt(bx, bz)) ? 0 : 0.55;
    const dx = bx - ax, dz = bz - az, L = Math.hypot(dx, dz), n = Math.max(1, Math.ceil(L / 0.08));
    for (let s = 0; s <= n; s++) {
      const d = L * s / n;
      if (d < tolA || L - d < tolB) continue;
      if (!walk(codeAt(ax + dx * s / n, az + dz * s / n))) return false;
    }
    return true;
  }

  // nodes
  const NBX = Math.ceil(NX / NAV_BLOCK), NBZ = Math.ceil(NZ / NAV_BLOCK);
  const blockNode = new Int32Array(NBX * NBZ).fill(-1);
  const nx = [], nz = [], nzone = [];
  for (let bj = 0; bj < NBZ; bj++) for (let bi = 0; bi < NBX; bi++) {
    const ci = bi * NAV_BLOCK + 2, cj = bj * NAV_BLOCK + 2;
    let best = -1, bd = 1e9;
    for (let j = bj * NAV_BLOCK; j < Math.min(NZ, (bj + 1) * NAV_BLOCK); j++) for (let i = bi * NAV_BLOCK; i < Math.min(NX, (bi + 1) * NAV_BLOCK); i++) {
      if (code[i + j * NX] === 1) continue;
      const d = (i - ci) ** 2 + (j - cj) ** 2;
      if (d < bd) { bd = d; best = i + j * NX; }
    }
    if (best < 0) continue;
    const i = best % NX, j = (best / NX) | 0;
    blockNode[bi + bj * NBX] = nx.length;
    nx.push(cx(i)); nz.push(cz(j));
    let zid = -1; for (const z of ZDEF) if (cx(i) >= z.x0 && cx(i) <= z.x1 && cz(j) >= z.z0 && cz(j) <= z.z1) { zid = z.id; break; }
    nzone.push(zid);
  }
  const N = nx.length;
  const adj = Array.from({ length: N }, () => []);
  const edges = [];
  for (let bj = 0; bj < NBZ; bj++) for (let bi = 0; bi < NBX; bi++) {
    const a = blockNode[bi + bj * NBX]; if (a < 0) continue;
    for (const [di, dj] of [[1, 0], [0, 1], [1, 1], [-1, 1], [2, 0], [0, 2]]) {
      const bi2 = bi + di, bj2 = bj + dj;
      if (bi2 < 0 || bj2 < 0 || bi2 >= NBX || bj2 >= NBZ) continue;
      const b = blockNode[bi2 + bj2 * NBX]; if (b < 0) continue;
      // long (2-block) edges only when the intermediate block has no node (bridges thin door gaps)
      if ((Math.abs(di) === 2 || Math.abs(dj) === 2) && blockNode[bi + di / 2 + (bj + dj / 2) * NBX] >= 0) continue;
      const d = scan(nx[a], nz[a], nx[b], nz[b]);
      if (d === -2) continue;
      const cost = Math.hypot(nx[a] - nx[b], nz[a] - nz[b]);
      adj[a].push({ to: b, cost, door: d });
      adj[b].push({ to: a, cost, door: d });
      edges.push([a, b, d]);
    }
  }

  // A*
  const g = new Float32Array(N), f = new Float32Array(N), came = new Int32Array(N), stamp = new Uint32Array(N), closed = new Uint32Array(N);
  let gen = 1;
  const heap = [];
  function hpush(n) { heap.push(n); let i = heap.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (f[heap[p]] <= f[n]) break; heap[i] = heap[p]; i = p; } heap[i] = n; }
  function hpop() {
    const top = heap[0], last = heap.pop();
    if (heap.length) {
      let i = 0; const n = heap.length;
      while (true) { let l = 2 * i + 1, r = l + 1, m = i; if (l < n && f[heap[l]] < f[last]) m = l; if (r < n && f[heap[r]] < f[m === i ? last : heap[m]]) m = r; if (m === i) break; heap[i] = heap[m]; i = m; }
      heap[i] = last;
    }
    return top;
  }
  function nearestNode(x, z) {
    const bi = Math.floor((x - X0) / NAV_RES / NAV_BLOCK), bj = Math.floor((z - Z0) / NAV_RES / NAV_BLOCK);
    const cands = [];
    for (let r = 0; r <= 3; r++) {
      for (let dj = -r; dj <= r; dj++) for (let di = -r; di <= r; di++) {
        if (Math.max(Math.abs(di), Math.abs(dj)) !== r) continue;
        const i = bi + di, j = bj + dj; if (i < 0 || j < 0 || i >= NBX || j >= NBZ) continue;
        const n = blockNode[i + j * NBX]; if (n >= 0 && walk(codeAt(nx[n], nz[n]))) cands.push(n);
      }
      if (cands.length >= 6 && r >= 1) break;
    }
    if (!cands.length) return -1;
    cands.sort((a, b) => (nx[a] - x) ** 2 + (nz[a] - z) ** 2 - ((nx[b] - x) ** 2 + (nz[b] - z) ** 2));
    for (const n of cands) if (clear(x, z, nx[n], nz[n])) return n;
    return -1;
  }
  function astar(s, t) {
    gen++; heap.length = 0;
    g[s] = 0; f[s] = Math.hypot(nx[s] - nx[t], nz[s] - nz[t]); came[s] = -1; stamp[s] = gen; hpush(s);
    while (heap.length) {
      const c = hpop();
      if (c === t) break;
      if (closed[c] === gen) continue;
      closed[c] = gen;
      for (const e of adj[c]) {
        if (e.door >= 0 && !doors[e.door].isOpen) continue;
        const ng = g[c] + e.cost;
        if (stamp[e.to] === gen && ng >= g[e.to]) continue;
        stamp[e.to] = gen; g[e.to] = ng; came[e.to] = c;
        f[e.to] = ng + Math.hypot(nx[e.to] - nx[t], nz[e.to] - nz[t]);
        hpush(e.to);
      }
    }
    if (stamp[t] !== gen) return null;
    const out = [];
    for (let c = t; c !== -1; c = came[c]) out.push(c);
    return out.reverse();
  }
  function findPath(from, to) {
    if (!from || !to) return [];
    const goal = new THREE.Vector3(to.x, 0, to.z);
    if (clear(from.x, from.z, to.x, to.z)) return [goal];
    const s = nearestNode(from.x, from.z), t = nearestNode(to.x, to.z);
    if (s < 0 || t < 0) return [];
    const nodes = astar(s, t);
    if (!nodes) return [];
    const pts = [{ x: from.x, z: from.z }, ...nodes.map((n) => ({ x: nx[n], z: nz[n] })), { x: to.x, z: to.z }];
    // greedy string pulling
    const out = [];
    let i = 0;
    while (i < pts.length - 1) {
      let j = i + 1;
      // look ahead (bounded) for the furthest visible point
      for (let k = Math.min(pts.length - 1, i + 14); k > i + 1; k--) if (clear(pts[i].x, pts[i].z, pts[k].x, pts[k].z)) { j = k; break; }
      out.push(new THREE.Vector3(pts[j].x, 0, pts[j].z));
      i = j;
    }
    return out;
  }
  return {
    findPath, clear, codeAt,
    debug: { nodes: nx.map((x, i) => ({ x, z: nz[i], zone: nzone[i] })), edges, grid: { code, NX, NZ, X0, Z0, res: NAV_RES } },
  };
}

// =============================================================================================
// FEATURES: wall buys, perk machines, mystery box, power switch, aether anvil
// =============================================================================================
function buildFeatures(ctx) {
  const { mat, box, boxB, cyl, anyGeo, solid, reserve, wallById, wallPoint, inwardN, dynGroup, tween, tweenP, wait, sparks, puff, updaters, powerables, canvasTex, colliders, raycastTargets } = ctx;
  const out = { wallBuys: [], perks: [], navStatic: [] };
  const up = new THREE.Vector3(0, 1, 0);
  // frame against a wall: returns {c (on centre-line), n (inward), t (tangent, viewer's right), face (point on face)}
  function wallFrame(wallId, along, zone) {
    const w = wallById[wallId];
    const c = wallPoint(w, along), n = inwardN(w, zone);
    const t = new THREE.Vector3(n.z, 0, -n.x);
    return { c, n, t, face: c.clone().addScaledVector(n, HW), yaw: Math.atan2(n.x, n.z) };
  }
  // local (u along t, y, v along n) -> world
  const L2W = (f, u, y, v) => f.face.clone().addScaledVector(f.t, u).addScaledVector(f.n, v).setY(y);
  const meshOf = (geos, m, cast = true) => { const me = new THREE.Mesh(mergeGeometries(geos.map(prep)), m); me.castShadow = cast; me.receiveShadow = true; return me; };
  const G = {
    box: (sx, sy, sz, x, y, z, rx = 0, ry = 0, rz = 0, uvs = 1) => { const g = prep(new THREE.BoxGeometry(sx, sy, sz)); projUV(g, uvs); xformL(g, x, y, z, rx, ry, rz); return g; },
    cyl: (rt, rb, h, seg, x, y, z, rx = 0, ry = 0, rz = 0) => { const g = prep(new THREE.CylinderGeometry(rt, rb, h, seg)); xformL(g, x, y, z, rx, ry, rz); return g; },
    sph: (r, x, y, z, ws = 10, hs = 8) => { const g = prep(new THREE.SphereGeometry(r, ws, hs)); xformL(g, x, y, z); return g; },
    tor: (r, t, x, y, z, rx = 0, ry = 0, rz = 0, arc = Math.PI * 2) => { const g = prep(new THREE.TorusGeometry(r, t, 6, 16, arc)); xformL(g, x, y, z, rx, ry, rz); return g; },
  };
  const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler();
  function xformL(g, x, y, z, rx = 0, ry = 0, rz = 0) { _e.set(rx, ry, rz, 'YXZ'); _q.setFromEuler(_e); _m.compose(new THREE.Vector3(x, y, z), _q, new THREE.Vector3(1, 1, 1)); g.applyMatrix4(_m); return g; }
  // add an axis-aligned collider for a local-space footprint of a group (u0..u1 along t, v0..v1 along n)
  function footprintSolid(f, u0, u1, v0, v1, h, surface, o) {
    const a = L2W(f, u0, 0, v0), b = L2W(f, u1, h, v1);
    return solid(a.x, 0, a.z, b.x, h, b.z, surface, o);
  }

  // ---------------------------------------------------------------------------- wall buys
  const WB = [
    { weaponId: 'kar98k', cost: 200, ammoCost: 100, wall: 'H2b', at: -3.5, zone: 0, label: 'KAR98K', kind: 'rifle' },
    { weaponId: 'trench', cost: 1500, ammoCost: 750, wall: 'V2b', at: 4.6, zone: 0, label: 'TRENCH GUN', kind: 'shotgun' },
    { weaponId: 'mp40', cost: 1000, ammoCost: 500, wall: 'H3a', at: -12.5, zone: 1, label: 'MP40', kind: 'smg' },
    { weaponId: 'thompson', cost: 1200, ammoCost: 600, wall: 'H4', at: 12.5, zone: 2, label: 'THOMPSON', kind: 'tommy' },
    { weaponId: 'stg44', cost: 1200, ammoCost: 600, wall: 'H5', at: 12.5, zone: 2, label: 'STG-44', kind: 'assault' },
  ];
  function chalkTex(label, cost, ammo, kind) {
    return canvasTex(1024, 512, (g, W, H) => {
      g.clearRect(0, 0, W, H);
      let seed = label.length * 131 + cost;
      const r = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
      g.lineCap = 'round'; g.lineJoin = 'round';
      const chalkPath = (pts, w = 5, closed = true) => {
        for (let pass = 0; pass < 4; pass++) {
          g.strokeStyle = `rgba(236,234,222,${0.22 + r() * 0.2})`;
          g.lineWidth = w * (0.6 + r() * 0.8);
          g.beginPath();
          pts.forEach(([x, y], i) => { const jx = x + (r() - 0.5) * 3, jy = y + (r() - 0.5) * 3; i ? g.lineTo(jx, jy) : g.moveTo(jx, jy); });
          if (closed) g.closePath();
          g.stroke();
        }
      };
      const rect = (x0, y0, x1, y1, w) => chalkPath([[x0, y0], [x1, y0], [x1, y1], [x0, y1]], w);
      // silhouette in a 0..100 x 0..40 space mapped to canvas region x 170..860, y 70..330
      const X = (x) => 170 + x * 6.9, Y = (y) => 70 + y * 6.5;
      const poly = (pts, w) => chalkPath(pts.map(([x, y]) => [X(x), Y(y)]), w);
      const R_ = (x0, y0, x1, y1, w) => rect(X(x0), Y(y0), X(x1), Y(y1), w);
      if (kind === 'rifle') { poly([[0, 17], [3, 11], [30, 14], [36, 13], [100, 13], [100, 16], [40, 17], [36, 22], [30, 24], [26, 19], [3, 24]]); poly([[46, 13], [48, 9], [51, 9]], 3); }
      if (kind === 'shotgun') { poly([[0, 17], [3, 11], [28, 14], [48, 13], [95, 13], [95, 16], [48, 17], [34, 18], [30, 23], [26, 19], [3, 24]]); R_(56, 17, 74, 21); }
      if (kind === 'smg') { poly([[4, 12], [26, 14], [26, 16], [4, 19]], 3); R_(26, 11, 72, 18); R_(72, 12.5, 92, 16); R_(42, 18, 48, 38); poly([[30, 18], [34, 18], [34, 27], [29, 27]], 4); }
      if (kind === 'tommy') { poly([[0, 17], [3, 11], [28, 13], [28, 20], [3, 24]]); R_(28, 11, 64, 19); R_(64, 12.5, 94, 16); R_(44, 19, 50, 37); poly([[31, 19], [35, 19], [36, 28], [31, 28]], 4); poly([[68, 16], [72, 16], [72, 24], [68, 24]], 4); }
      if (kind === 'assault') { poly([[0, 16], [3, 11], [26, 13], [26, 20], [3, 23]]); R_(26, 11, 66, 19); R_(66, 13, 94, 16); poly([[46, 19], [53, 19], [56, 34], [49, 35]]); poly([[32, 19], [36, 19], [37, 28], [32, 28]], 4); }
      // lettering
      g.textAlign = 'center';
      g.font = 'bold 76px "Courier New", Courier, monospace';
      const txt = (s, x, y, a = 0.9) => { for (let p = 0; p < 3; p++) { g.fillStyle = `rgba(238,236,224,${a * (0.35 + r() * 0.2)})`; g.fillText(s, x + (r() - 0.5) * 3, y + (r() - 0.5) * 3); } };
      txt(label, W / 2, 420);
      g.font = 'bold 54px "Courier New", Courier, monospace';
      txt(String(cost), W / 2 - 170, 488, 0.8);
      txt('AMMO ' + ammo, W / 2 + 150, 488, 0.55);
      chalkPath([[W / 2 - 290, 440], [W / 2 + 290, 436]], 3, false);
      // chalk dust: erase speckles for texture
      g.globalCompositeOperation = 'destination-out';
      for (let i = 0; i < 7000; i++) { g.fillStyle = `rgba(0,0,0,${r() * 0.7})`; g.fillRect(r() * W, r() * H, 1 + r() * 2, 1 + r() * 2); }
      g.globalCompositeOperation = 'source-over';
    });
  }
  const chalkGeo = new THREE.PlaneGeometry(1.6, 0.8);
  for (const s of WB) {
    const f = wallFrame(s.wall, s.at, s.zone);
    const tex = chalkTex(s.label, s.cost, s.ammoCost, s.kind);
    const m = new THREE.MeshStandardMaterial({ map: tex, transparent: true, roughness: 1, depthWrite: false, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 0.12, polygonOffset: true, polygonOffsetFactor: -2 });
    const plane = new THREE.Mesh(chalkGeo, m);
    plane.position.copy(L2W(f, 0, 1.55, 0.012));
    plane.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(f.t, up, f.n));
    plane.receiveShadow = true;
    dynGroup.add(plane);
    // two iron pegs the gun hangs on
    for (const u of [-0.25, 0.25]) { const p = L2W(f, u - 0.1, 1.53, 0.04); box('metal_rusty', 'walls', p.x, p.y, p.z, 0.03, 0.03, 0.03, { cast: false }); }
    const mount = new THREE.Object3D();
    mount.name = 'wallbuy:' + s.weaponId;
    mount.position.copy(L2W(f, -0.14, 1.6, 0.075));
    mount.quaternion.copy(plane.quaternion);
    dynGroup.add(mount);
    reserve(f.face.x + f.n.x * 0.8, f.face.z + f.n.z * 0.8, 1.0);
    out.wallBuys.push({
      weaponId: s.weaponId, cost: s.cost, ammoCost: s.ammoCost, zone: s.zone, name: s.label,
      interactPos: f.face.clone().addScaledVector(f.n, 0.9), mount, chalk: plane,
    });
  }

  // ---------------------------------------------------------------------------- perk machines
  const PERKS = [
    { id: 'ironhide', name: 'Ironhide', cost: 2500, color: 0xd0302c, wall: 'H2a', at: -21, zone: 1, glyph: 'shield', tag: 'TONIC' },
    { id: 'quickhands', name: 'Quickhands', cost: 3000, color: 0x3fcf5a, wall: 'H2a', at: -11, zone: 1, glyph: 'hand', tag: 'SODA' },
    { id: 'rapidfire', name: 'Rapidfire', cost: 2000, color: 0xf0a020, wall: 'V4', at: 3.8, zone: 2, glyph: 'bolt', tag: 'COLA' },
    { id: 'secondwind', name: 'Second Wind', cost: 1500, color: 0x3a82ee, wall: 'H4', at: 23.5, zone: 2, glyph: 'wings', tag: 'ELIXIR' },
  ];
  const bottleGeo = (() => {
    const pts = [[0, 0], [0.034, 0], [0.037, 0.008], [0.037, 0.11], [0.03, 0.14], [0.013, 0.17], [0.013, 0.205], [0.016, 0.21], [0.016, 0.218], [0, 0.218]].map(([x, y]) => new THREE.Vector2(x, y));
    return new THREE.LatheGeometry(pts, 10);
  })();
  const pg = mat('metal_painted_green');
  const brass = mat('brass'), rubber = mat('rubber_black'), rusty = mat('metal_rusty');
  function drawGlyph(g, kind, cx, cy, s, col) {
    g.save(); g.translate(cx, cy); g.scale(s, s); g.fillStyle = col; g.strokeStyle = col; g.lineWidth = 0.08;
    g.beginPath();
    if (kind === 'shield') { g.moveTo(0, -1); g.lineTo(0.8, -0.7); g.lineTo(0.7, 0.2); g.quadraticCurveTo(0.4, 0.8, 0, 1); g.quadraticCurveTo(-0.4, 0.8, -0.7, 0.2); g.lineTo(-0.8, -0.7); g.closePath(); g.fill(); g.fillStyle = 'rgba(0,0,0,0.45)'; g.fillRect(-0.12, -0.6, 0.24, 1.2); g.fillRect(-0.5, -0.2, 1.0, 0.24); }
    if (kind === 'hand') { g.arc(0, 0.25, 0.5, 0, Math.PI * 2); g.fill(); for (let i = 0; i < 4; i++) g.fillRect(-0.45 + i * 0.25, -0.95 + Math.abs(i - 1.5) * 0.12, 0.18, 0.9); g.fillRect(0.4, -0.1, 0.5, 0.18); }
    if (kind === 'bolt') { g.moveTo(0.2, -1); g.lineTo(-0.55, 0.12); g.lineTo(-0.05, 0.12); g.lineTo(-0.25, 1); g.lineTo(0.6, -0.2); g.lineTo(0.08, -0.2); g.closePath(); g.fill(); }
    if (kind === 'wings') { g.arc(0, 0.1, 0.32, 0, Math.PI * 2); g.fill(); for (const sx of [-1, 1]) { g.beginPath(); g.moveTo(sx * 0.3, 0); g.quadraticCurveTo(sx * 1.0, -0.9, sx * 1.1, -0.2); g.quadraticCurveTo(sx * 0.8, -0.2, sx * 0.95, 0.15); g.quadraticCurveTo(sx * 0.6, 0.05, sx * 0.3, 0.3); g.closePath(); g.fill(); } }
    g.restore();
  }
  function perkSignTex(p) {
    const c = new THREE.Color(p.color);
    const css = (k, a = 1) => `rgba(${Math.round(c.r * 255 * k)},${Math.round(c.g * 255 * k)},${Math.round(c.b * 255 * k)},${a})`;
    return canvasTex(512, 512, (g, W) => {
      // top half: semicircular marquee (CircleGeometry uv: centre at (256,256), radius 256)
      g.fillStyle = '#0b0a09'; g.fillRect(0, 0, 512, 512);
      const grd = g.createRadialGradient(256, 256, 30, 256, 256, 256);
      grd.addColorStop(0, css(0.55)); grd.addColorStop(0.8, css(0.3)); grd.addColorStop(1, css(0.12));
      g.fillStyle = grd; g.beginPath(); g.arc(256, 256, 250, Math.PI, 0); g.fill();
      g.strokeStyle = '#e8d49a'; g.lineWidth = 8; g.beginPath(); g.arc(256, 256, 238, Math.PI, 0); g.stroke();
      g.lineWidth = 3; g.beginPath(); g.arc(256, 256, 222, Math.PI, 0); g.stroke();
      // sunburst rays
      g.strokeStyle = 'rgba(255,240,200,0.18)'; g.lineWidth = 6;
      for (let i = 1; i < 12; i++) { const a = Math.PI + (i / 12) * Math.PI; g.beginPath(); g.moveTo(256 + Math.cos(a) * 120, 256 + Math.sin(a) * 120); g.lineTo(256 + Math.cos(a) * 210, 256 + Math.sin(a) * 210); g.stroke(); }
      drawGlyph(g, p.glyph, 256, 118, 46, '#fff4d8');
      g.textAlign = 'center';
      g.font = `900 ${p.name.length > 9 ? 58 : 66}px Impact, "Arial Black", sans-serif`;
      g.lineWidth = 8; g.strokeStyle = 'rgba(0,0,0,0.7)'; g.strokeText(p.name.toUpperCase(), 256, 236);
      g.fillStyle = '#fff6e2'; g.fillText(p.name.toUpperCase(), 256, 236);
      // bottom half: lower plaque (mapped to v 0..0.5)
      g.fillStyle = css(0.25); g.fillRect(8, 264, 496, 240);
      g.strokeStyle = '#d9c38a'; g.lineWidth = 6; g.strokeRect(20, 276, 472, 216);
      drawGlyph(g, p.glyph, 110, 384, 60, css(1.2));
      g.fillStyle = '#f3e6c4'; g.textAlign = 'left';
      g.font = '900 64px Impact, "Arial Black", sans-serif'; g.fillText(p.tag, 190, 372);
      g.font = 'bold 44px "Courier New", monospace'; g.fillText(p.cost + ' PTS', 192, 440);
      g.globalCompositeOperation = 'multiply';
      for (let i = 0; i < 2500; i++) { g.fillStyle = `rgba(${120 + Math.random() * 100},${100 + Math.random() * 80},80,${Math.random() * 0.25})`; g.fillRect(Math.random() * 512, Math.random() * 512, 2 + Math.random() * 6, 1 + Math.random() * 3); }
      g.globalCompositeOperation = 'source-over';
    });
  }
  function buildPerk(p) {
    const f = wallFrame(p.wall, p.at, p.zone);
    const W = 1.05, D = 0.72, HB = 1.95;
    const g = new THREE.Group();
    g.position.copy(f.face).addScaledVector(f.n, D / 2 + 0.04);
    g.position.y = 0;
    g.rotation.y = f.yaw;
    dynGroup.add(g);
    const col = new THREE.Color(p.color);
    const bodyMat = new THREE.MeshStandardMaterial({ color: col.clone().multiplyScalar(0.55), roughness: 1, roughnessMap: pg.roughnessMap || null, normalMap: pg.normalMap || null, metalness: 0.25, envMap: pg.envMap || null, envMapIntensity: 0.6 });
    const body = [], trim = [], dark = [];
    // back body, stiles, lower panel, upper band
    body.push(G.box(W, HB - 0.12, D - 0.22, 0, 0.12 + (HB - 0.12) / 2, -0.11));
    body.push(G.box(0.14, HB - 0.12, 0.22, -W / 2 + 0.07, 0.12 + (HB - 0.12) / 2, D / 2 - 0.11));
    body.push(G.box(0.14, HB - 0.12, 0.22, W / 2 - 0.07, 0.12 + (HB - 0.12) / 2, D / 2 - 0.11));
    body.push(G.box(W - 0.28, 0.76, 0.22, 0, 0.12 + 0.38, D / 2 - 0.11));
    body.push(G.box(W - 0.28, 0.2, 0.22, 0, HB - 0.1, D / 2 - 0.11));
    // header half-cylinder
    { const hg = prep(new THREE.CylinderGeometry(W / 2, W / 2, D, 20, 1, false, Math.PI / 2, Math.PI)); xformL(hg, 0, HB, 0, Math.PI / 2, 0, 0); body.push(hg); }
    // plinth + feet
    dark.push(G.box(W + 0.05, 0.12, D + 0.04, 0, 0.06, 0));
    // brass trim: window frame, band, header rim, side stripes
    trim.push(G.box(0.8, 0.035, 0.04, 0, 0.885, D / 2 + 0.005), G.box(0.8, 0.035, 0.04, 0, 1.785, D / 2 + 0.005));
    trim.push(G.box(0.035, 0.93, 0.04, -0.39, 1.335, D / 2 + 0.005), G.box(0.035, 0.93, 0.04, 0.39, 1.335, D / 2 + 0.005));
    trim.push(G.tor(W / 2 + 0.005, 0.018, 0, HB, D / 2, 0, 0, 0, Math.PI));
    trim.push(G.box(W + 0.02, 0.04, 0.05, 0, HB + 0.005, D / 2 - 0.01));
    for (const sx of [-1, 1]) trim.push(G.box(0.02, 1.6, 0.04, sx * (W / 2 + 0.005), 1.0, 0.12));
    trim.push(G.box(0.1, 0.16, 0.03, 0.3, 1.2 - 0.62, D / 2 + 0.01)); // coin plate
    trim.push(G.cyl(0.03, 0.03, 0.04, 10, 0, HB + 0.56, 0), G.cyl(0.045, 0.02, 0.05, 10, 0, HB + 0.52, 0));
    // dispense tray recess + coin slot
    dark.push(G.box(0.52, 0.2, 0.06, -0.08, 0.34, D / 2 + 0.01), G.box(0.02, 0.07, 0.02, 0.3, 0.6, D / 2 + 0.03));
    // interior: back wall + shelves (in the 0.22 deep recess)
    dark.push(G.box(0.76, 0.9, 0.02, 0, 1.335, D / 2 - 0.215));
    for (const y of [0.93, 1.21, 1.49]) trim.push(G.box(0.74, 0.015, 0.16, 0, y, D / 2 - 0.12));
    // bottles
    const bottles = [];
    let vendBottle = null;
    for (const [si, y] of [0.94, 1.22, 1.5].entries()) for (let i = 0; i < 5; i++) {
      const bg = prep(bottleGeo.clone()); xformL(bg, -0.28 + i * 0.14, y, D / 2 - 0.12 + (i % 2) * 0.03, 0, 0, 0); bottles.push(bg);
      void si;
    }
    const bottleMat = new THREE.MeshStandardMaterial({ color: col.clone().multiplyScalar(0.35), emissive: col, emissiveIntensity: 0.02, roughness: 0.12, metalness: 0.1 });
    const glassMat = new THREE.MeshStandardMaterial({ color: 0x9fb4c0, transparent: true, opacity: 0.16, roughness: 0.04, metalness: 0.6, depthWrite: false, envMap: pg.envMap || null });
    const signTex = perkSignTex(p);
    const signMat = new THREE.MeshStandardMaterial({ map: signTex, emissiveMap: signTex, emissive: 0xffffff, emissiveIntensity: 0.03, roughness: 0.5, metalness: 0.1 });
    const lampMat = new THREE.MeshStandardMaterial({ color: col, emissive: col, emissiveIntensity: 0.05, roughness: 0.3 });
    const signGeos = [];
    { const sg = new THREE.CircleGeometry(W / 2 - 0.01, 28, 0, Math.PI); xformL(sg, 0, HB, D / 2 + 0.006); signGeos.push(sg); }
    { const pl = new THREE.PlaneGeometry(0.62, 0.3); const uv = pl.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setY(i, uv.getY(i) * 0.5); xformL(pl, -0.06, 0.66, D / 2 + 0.003); signGeos.push(pl); }
    const parts = [meshOf(body, bodyMat), meshOf(trim, brass), meshOf(dark, rubber, false), meshOf(bottles, bottleMat, false), meshOf(signGeos, signMat, false)];
    const glass = new THREE.Mesh(new THREE.PlaneGeometry(0.76, 0.9), glassMat); glass.position.set(0, 1.335, D / 2 + 0.004); glass.renderOrder = 2;
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.06, 12, 8), lampMat); lamp.position.set(0, HB + 0.6, 0);
    parts.push(glass, lamp);
    for (const m of parts) g.add(m);
    // vend bottle
    vendBottle = new THREE.Mesh(bottleGeo, bottleMat); vendBottle.visible = false; g.add(vendBottle);
    const light = new THREE.PointLight(p.color, 0, 5.5, 2);
    light.position.set(0, 1.45, D / 2 + 0.55);
    g.add(light);
    // collider + reserve
    const col3 = footprintSolid(f, -W / 2 - 0.03, W / 2 + 0.03, 0, D + 0.08, 2.6, 'metal');
    void col3;
    reserve(g.position.x, g.position.z, 1.1);
    const interactPos = f.face.clone().addScaledVector(f.n, D + 0.95);
    reserve(interactPos.x, interactPos.z, 0.8);
    let powered = false, level = 0, target = 0, flickT = 0;
    const perk = {
      id: p.id, name: p.name, cost: p.cost, color: p.color, zone: p.zone, interactPos,
      get powered() { return powered; },
      setPowered(on, instant = false) { on = !!on; if (on === powered && !instant) return false; powered = on; target = on ? 1 : 0; flickT = on && !instant ? 0.9 : 0; if (instant) level = target; return true; },
      vend() {
        vendBottle.visible = true;
        vendBottle.position.set(-0.08, 1.5, D / 2 - 0.1); vendBottle.rotation.set(0, 0, 0);
        return tweenP(0.55, (k) => {
          const e = k * k;
          vendBottle.position.set(-0.08, lerp(1.5, 0.3, e), D / 2 - 0.1 + k * 0.1);
          vendBottle.rotation.z = k * 1.57;
        }, { done: () => tween(0.4, (k) => { vendBottle.position.y = 0.3 + Math.sin(k * Math.PI) * 0.05 * (1 - k); }, { done: () => tween(0.2, () => {}, { delay: 1.2, done: () => (vendBottle.visible = false) }) }) });
      },
      group: g,
    };
    updaters.push((dt, time) => {
      if (flickT > 0) { flickT -= dt; level = (Math.random() < 0.55) ? 1 : 0.1; if (flickT <= 0) level = target; }
      else level += (target - level) * Math.min(1, dt * 6);
      const hum = 0.93 + 0.07 * Math.sin(time * 17 + p.at) * Math.sin(time * 3.1);
      const L = level * hum;
      bottleMat.emissiveIntensity = 0.03 + L * 2.2;
      signMat.emissiveIntensity = 0.03 + L * 1.35;
      lampMat.emissiveIntensity = 0.05 + L * (3 + 2 * (Math.sin(time * 4 + p.at) > 0 ? 1 : 0.3));
      light.intensity = L * 5.5;
    });
    powerables.push({ x: g.position.x, z: g.position.z, set: (on, delay, instant) => {
      if (instant) { perk.setPowered(on, true); return; }
      tween(0.001, () => {}, { delay, done: () => perk.setPowered(on) });
    } });
    out.perks.push(perk);
  }
  PERKS.forEach(buildPerk);

  // ---------------------------------------------------------------------------- mystery box
  const BOX_LOCS = [
    { wall: 'H3b', at: 0, zone: 0 },
    { wall: 'H5', at: 22.8, zone: 2 },
    { wall: 'V2a', at: -10.4, zone: 3 },
  ].map((s) => {
    const f = wallFrame(s.wall, s.at, s.zone);
    const pos = f.face.clone().addScaledVector(f.n, 0.42); pos.y = 0;
    const a = L2W(f, -0.9, 0, 0.02), b = L2W(f, 0.9, 1, 0.8);
    const col = new THREE.Box3(new THREE.Vector3(Math.min(a.x, b.x), 0, Math.min(a.z, b.z)), new THREE.Vector3(Math.max(a.x, b.x), 0.75, Math.max(a.z, b.z)));
    out.navStatic.push(col);
    reserve(pos.x, pos.z, 1.3);
    return { ...s, f, pos, yaw: f.yaw, col, interactPos: f.face.clone().addScaledVector(f.n, 1.55) };
  });
  const skullTex = canvasTex(256, 256, (g) => {
    g.clearRect(0, 0, 256, 256);
    g.translate(128, 124);
    g.shadowColor = 'rgba(140,230,255,1)'; g.shadowBlur = 18;
    g.fillStyle = '#e8fbff';
    g.beginPath(); g.arc(0, -18, 62, Math.PI * 0.92, Math.PI * 2.08); g.lineTo(44, 34); g.lineTo(-44, 34); g.closePath(); g.fill();
    g.fillRect(-34, 30, 68, 30);
    g.globalCompositeOperation = 'destination-out'; g.shadowBlur = 0;
    g.beginPath(); g.ellipse(-24, -8, 17, 20, 0.15, 0, Math.PI * 2); g.fill();
    g.beginPath(); g.ellipse(24, -8, 17, 20, -0.15, 0, Math.PI * 2); g.fill();
    g.beginPath(); g.moveTo(0, 12); g.lineTo(-8, 28); g.lineTo(8, 28); g.closePath(); g.fill();
    for (let i = -3; i <= 3; i++) g.fillRect(i * 9.5 - 1.5, 38, 3, 22);
    g.globalCompositeOperation = 'source-over';
    // stencil bridges (reads as a spray stencil)
    g.fillStyle = 'rgba(0,0,0,0)';
    // crossed bones
    g.shadowBlur = 14; g.strokeStyle = '#e8fbff'; g.lineWidth = 12; g.lineCap = 'round';
    g.beginPath(); g.moveTo(-90, 70); g.lineTo(90, 100); g.moveTo(90, 70); g.lineTo(-90, 100); g.stroke();
  });
  const glyphMat = new THREE.MeshBasicMaterial({ map: skullTex, color: new THREE.Color(0.55, 0.95, 1.2), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
  const boxG = new THREE.Group(); dynGroup.add(boxG);
  const boxBody = new THREE.Group(); boxG.add(boxBody);
  {
    const wood = [], metal = [], dark = [];
    const BL = 1.7, BH = 0.6, BD = 0.72;
    wood.push(G.box(BL, BH - 0.04, BD, 0, 0.02 + (BH - 0.04) / 2, 0, 0, 0, 0, 0.5));
    for (const y of [0.12, 0.3, 0.48]) for (const s of [-1, 1]) wood.push(G.box(BL - 0.1, 0.13, 0.03, 0, y, s * (BD / 2 + 0.012), 0, 0, (Math.random() - 0.5) * 0.02, 0.5));
    for (const x of [-BL / 2 + 0.04, BL / 2 - 0.04]) for (const s of [-1, 1]) metal.push(G.box(0.1, BH, 0.05, x, BH / 2, s * (BD / 2 + 0.018)));
    for (const x of [-BL / 2, BL / 2]) metal.push(G.box(0.05, BH, BD + 0.02, x, BH / 2, 0));
    for (const s of [-1, 1]) metal.push(G.tor(0.08, 0.012, s * (BL / 2 + 0.03), 0.4, 0, 0, Math.PI / 2, 0, Math.PI));
    dark.push(G.box(BL - 0.1, 0.02, BD - 0.1, 0, BH - 0.06, 0));
    const w = meshOf(wood, mat('crate_wood')), me = meshOf(metal, rusty), dk = meshOf(dark, rubber, false);
    boxBody.add(w, me, dk);
    const gf = new THREE.Mesh(new THREE.PlaneGeometry(0.44, 0.44), glyphMat); gf.position.set(0, 0.3, BD / 2 + 0.03); boxBody.add(gf);
  }
  const lid = new THREE.Group(); lid.position.set(0, 0.6, -0.36); boxBody.add(lid);
  {
    const lw = G.box(1.74, 0.09, 0.76, 0, 0.045, 0.38, 0, 0, 0, 0.5);
    const lm = [G.box(1.76, 0.1, 0.06, 0, 0.045, 0.02), G.box(1.76, 0.1, 0.06, 0, 0.045, 0.74), G.box(0.06, 0.1, 0.76, -0.84, 0.045, 0.38), G.box(0.06, 0.1, 0.76, 0.84, 0.045, 0.38)];
    lid.add(meshOf([lw], mat('crate_wood')), meshOf(lm, rusty));
    const gl = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.5), glyphMat); gl.rotation.x = -Math.PI / 2; gl.position.set(0, 0.093, 0.38); lid.add(gl);
  }
  const innerGlowMat = new THREE.MeshBasicMaterial({ color: 0xc8f4ff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false });
  const innerGlow = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 0.55), innerGlowMat); innerGlow.rotation.x = -Math.PI / 2; innerGlow.position.y = 0.52; boxBody.add(innerGlow);
  const openGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: canvasTex(128, 256, (c) => { const gr = c.createLinearGradient(0, 256, 0, 0); gr.addColorStop(0, 'rgba(190,240,255,0.9)'); gr.addColorStop(1, 'rgba(120,200,255,0)'); c.fillStyle = gr; c.fillRect(0, 0, 128, 256); const g2 = c.createLinearGradient(0, 0, 128, 0); g2.addColorStop(0, 'rgba(0,0,0,1)'); g2.addColorStop(0.3, 'rgba(0,0,0,0)'); g2.addColorStop(0.7, 'rgba(0,0,0,0)'); g2.addColorStop(1, 'rgba(0,0,0,1)'); c.globalCompositeOperation = 'destination-out'; c.fillStyle = g2; c.fillRect(0, 0, 128, 256); }), blending: THREE.AdditiveBlending, transparent: true, opacity: 0, depthWrite: false }));
  openGlow.center.set(0.5, 0); openGlow.scale.set(1.5, 1.1, 1); openGlow.position.set(0, 0.5, 0); boxBody.add(openGlow);
  const anchor = new THREE.Object3D(); anchor.name = 'mysteryBoxAnchor'; anchor.position.set(0, 0.98, 0); boxBody.add(anchor);
  const beamMat = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uAlpha: { value: 1 }, uColor: { value: new THREE.Color(0.55, 0.85, 1.0) } },
    vertexShader: `varying vec2 vUv; varying vec3 vN; varying vec3 vV; void main(){ vUv=uv; vec4 mv=modelViewMatrix*vec4(position,1.0); vN=normalize(normalMatrix*normal); vV=normalize(-mv.xyz); gl_Position=projectionMatrix*mv; }`,
    fragmentShader: `uniform float uTime; uniform float uAlpha; uniform vec3 uColor; varying vec2 vUv; varying vec3 vN; varying vec3 vV;
      void main(){ float f = abs(dot(vN, vV)); float core = pow(f, 1.6);
        float h = vUv.y; float fall = pow(1.0 - h, 3.0) * 0.85 + 0.15 * (1.0 - h);
        float streak = 0.7 + 0.3 * sin(vUv.x * 62.83 + sin(h * 30.0 - uTime * 2.0) * 1.5);
        float pulse = 0.85 + 0.15 * sin(h * 80.0 - uTime * 7.0);
        float a = (pow(core, 2.2) * 0.85 + 0.12) * fall * streak * pulse * uAlpha * 0.9;
        gl_FragColor = vec4(uColor * a, a); }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false,
  });
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.62, 30, 28, 1, true), beamMat);
  beam.position.y = 15; beam.renderOrder = 3; boxG.add(beam);
  const boxLight = new THREE.PointLight(0x8fd6ff, 3.2, 6.5, 2); boxLight.position.set(0, 1.3, 0.2); boxG.add(boxLight);
  let boxCur = 0, boxCol = null, boxOpen = false, boxProxy = null;
  function placeBox(i) {
    boxCur = i;
    const L = BOX_LOCS[i];
    boxG.position.copy(L.pos); boxG.rotation.y = L.yaw;
    if (boxCol) { const j = colliders.indexOf(boxCol); if (j >= 0) colliders.splice(j, 1); if (boxCol.proxy) { const k = raycastTargets.indexOf(boxCol.proxy); if (k >= 0) raycastTargets.splice(k, 1); } }
    boxCol = L.col.clone(); colliders.push(boxCol);
    boxCol.proxy = null;
    if (!boxProxy) { boxProxy = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial()); boxProxy.visible = true; boxProxy.userData.surface = 'wood'; boxProxy.name = 'ray:mysteryBox'; ctx.rayGroup.add(boxProxy); raycastTargets.push(boxProxy); }
    boxCol.getCenter(boxProxy.position); boxCol.getSize(boxProxy.scale); boxProxy.updateMatrixWorld(true);
    mysteryBox.interactPos.copy(L.interactPos);
    mysteryBox.current = i;
    mysteryBox.zone = L.zone;
  }
  let lidTw = null, moving = null, moveGen = 0;
  const boxTws = [];
  // box tweens resolve on completion OR when a snap cancels the move (so awaiting callers never hang)
  const btw = (dur, fn) => new Promise((res) => { const t = tween(dur, fn, { done: res }); t.res = res; boxTws.push(t); });
  function killMove() {
    moveGen++;
    for (const t of boxTws.splice(0)) { t.alive = false; t.res && t.res(); }
    if (moving) { const m = moving; moving = null; m.resolve(boxCur); }
  }
  function snapLid(open) {
    if (lidTw) lidTw.alive = false;
    boxOpen = open; lid.rotation.x = open ? -1.95 : 0;
    innerGlowMat.opacity = open ? 1 : 0; openGlow.material.opacity = open ? 0.8 : 0; boxLight.intensity = open ? 8.2 : 3.2;
  }
  function snapTo(i) {
    killMove();
    boxBody.visible = true; boxBody.position.set(0, 0, 0); boxBody.rotation.y = 0; boxBody.scale.setScalar(1);
    beam.visible = true; beamMat.uniforms.uAlpha.value = 1;
    if (i !== boxCur) placeBox(i);
    snapLid(false);
  }
  const mysteryBox = {
    cost: 950, interactPos: new THREE.Vector3(), anchor, locations: BOX_LOCS.length, current: 0, zone: 0,
    locationInfo: BOX_LOCS.map((l) => ({ zone: l.zone, pos: l.pos.clone(), interactPos: l.interactPos.clone() })),
    get isOpen() { return boxOpen; },
    get isMoving() { return !!moving; },
    get target() { return moving ? moving.target : boxCur; },
    // open/close are idempotent (no re-animation when already in that state); ignored while relocating
    open(animate = true) {
      if (moving) return Promise.resolve(false);
      if (boxOpen) return Promise.resolve(true);
      if (!animate) { snapLid(true); return Promise.resolve(true); }
      boxOpen = true; if (lidTw) lidTw.alive = false;
      const r0 = lid.rotation.x;
      lidTw = tween(0.5, (k) => { lid.rotation.x = lerp(r0, -1.95, easeOut(k)); innerGlowMat.opacity = k; openGlow.material.opacity = k * 0.8; boxLight.intensity = 3.2 + k * 5; });
      return tweenP(0.5, () => {}).then(() => true);
    },
    close(animate = true) {
      if (!boxOpen) return Promise.resolve(true);
      if (!animate) { snapLid(false); return Promise.resolve(true); }
      boxOpen = false; if (lidTw) lidTw.alive = false;
      const r0 = lid.rotation.x;
      lidTw = tween(0.35, (k) => { lid.rotation.x = lerp(r0, 0, easeIn(k)); innerGlowMat.opacity = 1 - k; openGlow.material.opacity = (1 - k) * 0.8; boxLight.intensity = 8.2 - k * 5; });
      return tweenP(0.35, () => {}).then(() => true);
    },
    // Rises on its beam, vanishes, and lands at another location. Resolves with the new index when landed.
    // Idempotent: while moving, returns the same promise (a different toIndex retargets the landing);
    // relocate(current) when idle is a no-op. relocate(i, false) snaps instantly (late join).
    relocate(toIndex, animate = true) {
      if (toIndex !== undefined && (toIndex < 0 || toIndex >= BOX_LOCS.length)) toIndex = undefined;
      if (!animate) { snapTo(toIndex ?? boxCur); return Promise.resolve(boxCur); }
      if (moving) { if (toIndex !== undefined && !moving.placed) moving.target = toIndex; return moving.promise; }
      if (toIndex === boxCur) return Promise.resolve(boxCur);
      let next = toIndex;
      if (next === undefined) { const opts = BOX_LOCS.map((_, i) => i).filter((i) => i !== boxCur); next = opts[Math.floor(Math.random() * opts.length)]; }
      const gen = ++moveGen;
      let resolve; const promise = new Promise((r) => (resolve = r));
      moving = { target: next, promise, resolve, placed: false };
      (async () => {
        const live = () => gen === moveGen;
        if (boxOpen) { await this.close(); if (!live()) return; }
        await btw(2.4, (k) => {
          const e = easeIn(k);
          boxBody.position.set(Math.sin(k * 40) * 0.03 * k, e * 6.5, Math.cos(k * 33) * 0.03 * k);
          boxBody.rotation.y = e * 2.5;
          const s = k > 0.75 ? 1 - (k - 0.75) / 0.25 : 1; boxBody.scale.setScalar(Math.max(0.001, s));
          boxLight.intensity = 3.2 + k * 4;
        });
        if (!live()) return;
        boxBody.visible = false;
        puff(boxG.position.clone().setY(0.3), 10, 1);
        await btw(0.6, (k) => { beamMat.uniforms.uAlpha.value = 1 - k; boxLight.intensity = 7.2 * (1 - k); });
        if (!live()) return;
        beam.visible = false;
        await btw(0.9, () => {});
        if (!live()) return;
        moving.placed = true;
        placeBox(moving.target);
        beam.visible = true;
        await btw(0.5, (k) => { beamMat.uniforms.uAlpha.value = k; boxLight.intensity = k * 3.2; });
        if (!live()) return;
        boxBody.visible = true;
        await btw(1.3, (k) => {
          const e = easeOut(k);
          boxBody.position.set(0, (1 - e) * 5, 0); boxBody.rotation.y = (1 - e) * -2; boxBody.scale.setScalar(Math.max(0.001, Math.min(1, k * 3)));
        });
        if (!live()) return;
        boxBody.position.set(0, 0, 0); boxBody.rotation.y = 0; boxBody.scale.setScalar(1);
        puff(boxG.position.clone().setY(0.1), 14, 1.4);
        boxTws.length = 0;
        const m = moving; moving = null; m.resolve(boxCur);
      })();
      return promise;
    },
    _snapTo: snapTo,
    group: boxG,
  };
  placeBox(0);
  updaters.push((dt, time) => {
    beamMat.uniforms.uTime.value = time;
    if (boxOpen) boxLight.intensity = 8 + Math.sin(time * 9) * 0.8;
    glyphMat.opacity = 0.75 + 0.25 * Math.sin(time * 2.1);
  });
  out.mysteryBox = mysteryBox;

  // ---------------------------------------------------------------------------- power switch
  {
    const f = wallFrame('H1', -11.5, 3);
    const g = new THREE.Group(); g.position.copy(f.face); g.position.y = 0; g.rotation.y = f.yaw; dynGroup.add(g);
    const panel = [], metal = [], dark = [], cu = [];
    panel.push(G.box(0.95, 1.35, 0.14, 0, 1.55, 0.07));
    panel.push(G.box(0.55, 0.5, 0.2, 0.62, 1.2, 0.1)); // side junction box
    metal.push(G.box(1.0, 0.05, 0.16, 0, 2.24, 0.08), G.box(1.0, 0.05, 0.16, 0, 0.86, 0.08));
    for (const x of [-0.42, 0.42]) for (const y of [0.95, 2.15]) metal.push(G.sph(0.018, x, y, 0.145, 6, 4));
    // conduits up to the ceiling and over to the generator
    metal.push(G.cyl(0.045, 0.045, 1.4, 10, -0.3, 2.95, 0.07), G.cyl(0.035, 0.035, 1.4, 10, 0.3, 2.95, 0.07));
    metal.push(G.cyl(0.035, 0.035, 2.0, 10, 0.62, 0.45, 0.1), G.box(0.12, 0.08, 0.12, -0.3, 2.28, 0.07));
    // knife switch: insulator block, jaws
    dark.push(G.box(0.36, 0.22, 0.08, 0.02, 1.32, 0.18), G.box(0.36, 0.16, 0.08, 0.02, 1.87, 0.18));
    cu.push(G.box(0.03, 0.12, 0.06, -0.08, 1.87, 0.25), G.box(0.03, 0.12, 0.06, 0.12, 1.87, 0.25));
    cu.push(G.box(0.03, 0.12, 0.06, -0.08, 1.3, 0.25), G.box(0.03, 0.12, 0.06, 0.12, 1.3, 0.25));
    g.add(meshOf(panel, pg), meshOf(metal, rusty), meshOf(dark, rubber), meshOf(cu, brass));
    // warning plate
    const plateTex = canvasTex(512, 256, (c) => {
      c.fillStyle = '#d8c79a'; c.fillRect(0, 0, 512, 256);
      c.fillStyle = '#1a1612'; c.fillRect(10, 10, 492, 236); c.fillStyle = '#d8c79a'; c.fillRect(18, 18, 476, 220);
      for (let i = -2; i < 12; i++) { c.fillStyle = i % 2 ? '#141210' : '#d9a520'; c.beginPath(); c.moveTo(i * 44, 256); c.lineTo(i * 44 + 44, 256); c.lineTo(i * 44 + 88, 196); c.lineTo(i * 44 + 44, 196); c.fill(); }
      c.fillStyle = '#141210'; c.font = '900 64px Impact, "Arial Black", sans-serif'; c.textAlign = 'center'; c.fillText('HAUPTSCHALTER', 256, 92);
      c.font = 'bold 36px "Courier New", monospace'; c.fillText('STROM  —  AN / AUS', 256, 150);
      c.globalCompositeOperation = 'multiply';
      for (let i = 0; i < 1800; i++) { c.fillStyle = `rgba(90,60,30,${Math.random() * 0.3})`; c.fillRect(Math.random() * 512, Math.random() * 256, 2 + Math.random() * 8, 1 + Math.random() * 3); }
    });
    const plate = new THREE.Mesh(new THREE.PlaneGeometry(0.62, 0.31), new THREE.MeshStandardMaterial({ map: plateTex, roughness: 0.7 }));
    plate.position.set(0, 2.36, 0.012); g.add(plate);
    // lever
    const lever = new THREE.Group(); lever.position.set(0.02, 1.35, 0.26); g.add(lever);
    const leverGeos = [G.box(0.03, 0.62, 0.03, -0.1, 0.31, 0), G.box(0.03, 0.62, 0.03, 0.14, 0.31, 0), G.box(0.3, 0.03, 0.03, 0.02, 0.62, 0)];
    lever.add(meshOf(leverGeos, brass));
    const handle = new THREE.Mesh(G.cyl(0.035, 0.035, 0.36, 12, 0.02, 0.66, 0, 0, 0, Math.PI / 2), rubber); handle.castShadow = true; lever.add(handle);
    // lever rests pointing down (off) and is thrown up to engage the upper jaws
    lever.rotation.x = Math.PI - 0.05;
    const lampOff = new THREE.MeshStandardMaterial({ color: 0x551010, emissive: 0xff2010, emissiveIntensity: 1.6 });
    const lampOn = new THREE.MeshStandardMaterial({ color: 0x104010, emissive: 0x30ff40, emissiveIntensity: 0.0 });
    const l1 = new THREE.Mesh(new THREE.SphereGeometry(0.035, 10, 8), lampOff); l1.position.set(-0.32, 2.05, 0.16); g.add(l1);
    const l2 = new THREE.Mesh(new THREE.SphereGeometry(0.035, 10, 8), lampOn); l2.position.set(-0.32, 1.92, 0.16); g.add(l2);
    const sparkAnchor = new THREE.Object3D(); sparkAnchor.position.set(0.02, 1.87, 0.3); g.add(sparkAnchor);
    const lamp = { intensity: 0, color: new THREE.Color() }; // emissive-only (keeps the point-light count down)
    footprintSolid(f, -0.55, 0.95, 0, 0.32, 2.4, 'metal');
    const interactPos = f.face.clone().addScaledVector(f.n, 1.0);
    reserve(g.position.x + f.n.x * 0.6, g.position.z + f.n.z * 0.6, 1.1);
    const sw = {
      interactPos, isOn: false, sparkAnchor, group: g,
      throwSwitch() {
        if (this.isOn) return false;
        this.isOn = true;
        tween(0.5, (k) => { lever.rotation.x = lerp(Math.PI - 0.05, 0.05, easeIn(k)); }, {
          done: () => {
            const p = new THREE.Vector3(); sparkAnchor.getWorldPosition(p); sparks(p, 60, 1.3);
            this._setOnVisual(true);
            if (out._level) out._level.setPower(true);
          },
        });
        return true;
      },
      _setOnVisual(on) {
        this.isOn = on;
        lever.rotation.x = on ? 0.05 : Math.PI - 0.05;
        lampOff.emissiveIntensity = on ? 0.05 : 1.6; lampOn.emissiveIntensity = on ? 2.2 : 0;
        lamp.color.set(on ? 0x40ff50 : 0xff3020);
      },
    };
    updaters.push((dt, time) => { if (!sw.isOn) { const b = Math.sin(time * 3) > 0 ? 1 : 0.15; lampOff.emissiveIntensity = 1.8 * b; lamp.intensity = 0.7 * b; } else lamp.intensity = 0.5; });
    out.powerSwitch = sw;
  }

  // ---------------------------------------------------------------------------- aether anvil
  {
    const pos = new THREE.Vector3(-20.6, 0, -9.7), n = new THREE.Vector3(1, 0, 0);
    const g = new THREE.Group(); g.position.copy(pos); g.rotation.y = Math.atan2(n.x, n.z); dynGroup.add(g);
    const conc = [], steel = [], br = [], dk = [], dark2 = [];
    conc.push(G.box(1.9, 0.28, 1.3, 0, 0.14, -0.05, 0, 0, 0, 0.5));
    steel.push(G.box(1.7, 0.05, 1.1, 0, 0.305, -0.05));
    // pedestal + anvil
    steel.push(G.box(0.5, 0.5, 0.42, 0, 0.58, 0), G.box(0.62, 0.08, 0.5, 0, 0.36, 0));
    const anvilTop = [G.box(0.82, 0.2, 0.32, 0, 0.94, 0), G.box(0.16, 0.14, 0.3, -0.48, 0.97, 0)];
    { const h = prep(new THREE.ConeGeometry(0.13, 0.46, 14)); xformL(h, 0.63, 0.95, 0, 0, 0, -Math.PI / 2); anvilTop.push(h); }
    // press frame
    for (const x of [-0.8, 0.8]) { steel.push(G.box(0.2, 2.5, 0.26, x, 1.55, -0.05)); for (const y of [0.6, 1.4, 2.2]) br.push(G.box(0.22, 0.04, 0.28, x, y, -0.05)); }
    steel.push(G.box(1.86, 0.36, 0.4, 0, 2.88, -0.05));
    for (const x of [-0.6, -0.2, 0.2, 0.6]) br.push(G.sph(0.025, x, 2.88, 0.16, 6, 4));
    dk.push(G.cyl(0.13, 0.13, 0.5, 16, 0, 2.47, -0.02));
    // core housing behind the anvil
    br.push(G.cyl(0.24, 0.26, 0.12, 18, 0, 1.28, -0.5), G.cyl(0.26, 0.24, 0.12, 18, 0, 2.42, -0.5));
    for (const y of [1.6, 1.85, 2.1]) br.push(G.tor(0.225, 0.014, 0, y, -0.5, Math.PI / 2, 0, 0));
    for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; steel.push(G.cyl(0.012, 0.012, 1.06, 5, Math.cos(a) * 0.23, 1.85, -0.5 + Math.sin(a) * 0.23)); }
    // cables
    for (const s of [-1, 1]) {
      const curve = new THREE.CatmullRomCurve3([new THREE.Vector3(0.18 * s, 2.45, -0.5), new THREE.Vector3(0.45 * s, 2.7, -0.55), new THREE.Vector3(0.7 * s, 2.3, -0.2)]);
      dark2.push(prep(new THREE.TubeGeometry(curve, 12, 0.03, 6)));
      const c2 = new THREE.CatmullRomCurve3([new THREE.Vector3(0.2 * s, 1.25, -0.5), new THREE.Vector3(0.5 * s, 0.5, -0.6), new THREE.Vector3(0.9 * s, 0.32, -0.4)]);
      dark2.push(prep(new THREE.TubeGeometry(c2, 12, 0.035, 6)));
    }
    g.add(meshOf(conc, mat('concrete_wall')), meshOf(steel, rusty), meshOf(br, brass), meshOf(dk, pg), meshOf(dark2, rubber), meshOf(anvilTop, mat('gun_metal')));
    // glass tube + glowing core
    const glass = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 1.02, 20, 1, true), new THREE.MeshStandardMaterial({ color: 0xaabbd0, transparent: true, opacity: 0.18, roughness: 0.05, metalness: 0.5, depthWrite: false, side: THREE.DoubleSide }));
    glass.position.set(0, 1.85, -0.5); glass.renderOrder = 2; g.add(glass);
    const coreMat = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uPower: { value: 0.15 } },
      vertexShader: `varying vec3 vN; varying vec3 vP; void main(){ vN=normalize(normalMatrix*normal); vP=position; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
      fragmentShader: `uniform float uTime; uniform float uPower; varying vec3 vN; varying vec3 vP;
        void main(){ float f = pow(1.0 - abs(vN.z), 1.5);
          float s = sin(vP.y*26.0 + uTime*3.0 + sin(vP.x*18.0 + uTime*2.3)*2.2)*0.5+0.5;
          float s2 = sin(atan(vP.z, vP.x)*3.0 - uTime*4.0 + vP.y*10.0)*0.5+0.5;
          vec3 col = mix(vec3(0.62,0.22,1.0), vec3(0.2,0.95,1.0), s*0.7 + s2*0.3);
          gl_FragColor = vec4(col * (0.25 + 2.4*uPower) * (0.55 + 0.9*f + 0.4*s2), 1.0); }`,
    });
    const core = new THREE.Mesh(new THREE.IcosahedronGeometry(0.12, 2), coreMat); core.position.set(0, 1.85, -0.5); g.add(core);
    const haloMat = new THREE.SpriteMaterial({ map: canvasTex(128, 128, (c) => { const gr = c.createRadialGradient(64, 64, 0, 64, 64, 64); gr.addColorStop(0, 'rgba(200,160,255,1)'); gr.addColorStop(0.35, 'rgba(120,90,255,0.45)'); gr.addColorStop(1, 'rgba(40,200,255,0)'); c.fillStyle = gr; c.fillRect(0, 0, 128, 128); }), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.25 });
    const halo = new THREE.Sprite(haloMat); halo.scale.setScalar(0.9); halo.position.copy(core.position); g.add(halo);
    // hammer
    const hammer = new THREE.Group(); hammer.position.set(0, 0, 0); g.add(hammer);
    const hGeos = [G.cyl(0.05, 0.05, 0.6, 12, 0, 2.05, -0.02), G.box(0.42, 0.26, 0.34, 0, 1.68, -0.02)];
    hammer.add(meshOf(hGeos, mat('gun_metal')));
    const coreLight = new THREE.PointLight(0x9a6bff, 0.6, 6, 2); coreLight.position.set(0, 1.9, -0.1); g.add(coreLight);
    const anchorA = new THREE.Object3D(); anchorA.name = 'anvilAnchor'; anchorA.position.set(0, 1.16, 0); g.add(anchorA);
    solid(pos.x - 0.68, 0, pos.z - 0.98, pos.x + 0.62, 3.1, pos.z + 0.98, 'metal');
    const interactPos = pos.clone().addScaledVector(n, 1.55);
    reserve(pos.x, pos.z, 1.5); reserve(interactPos.x, interactPos.z, 0.9);
    let power = 0, ptarget = 0, flare = 0, forging = false, forgeN = 0, forgeGen = 0, forgePromise = Promise.resolve();
    const anvil = {
      interactPos, cost: 5000, anchor: anchorA, group: g,
      get powered() { return ptarget > 0; },
      get busy() { return forging; },
      setPowered(on) { ptarget = on ? 1 : 0; },
      get forgeCount() { return forgeN; },
      // idempotent: while forging returns the running promise. forgeCount lets clients mirror the host.
      forge(seconds = 3) {
        if (forging) return forgePromise;
        forging = true; forgeN++;
        const gen = ++forgeGen;
        forgePromise = (async () => {
          const strikes = Math.max(1, Math.round(seconds / 0.7));
          for (let i = 0; i < strikes && gen === forgeGen; i++) {
            await tweenP(0.14, (k) => { if (gen === forgeGen) hammer.position.y = -0.36 * easeIn(k); });
            if (gen !== forgeGen) break;
            const p = new THREE.Vector3(); anchorA.getWorldPosition(p); sparks(p, 40, 1.1); flare = 1;
            await tweenP(0.5, (k) => { if (gen === forgeGen) hammer.position.y = -0.36 * (1 - easeInOut(k)); });
          }
          if (gen === forgeGen) { hammer.position.y = 0; forging = false; }
        })();
        return forgePromise;
      },
      _stop() { forgeGen++; forging = false; hammer.position.y = 0; },
      _setCount(n) { forgeN = n; },
    };
    updaters.push((dt, time) => {
      power += (ptarget - power) * Math.min(1, dt * 1.5);
      flare = Math.max(0, flare - dt * 2.5);
      const p = 0.12 + power * 0.88;
      coreMat.uniforms.uTime.value = time;
      coreMat.uniforms.uPower.value = p * (0.85 + 0.15 * Math.sin(time * 5)) + flare;
      core.rotation.y += dt * (0.3 + power * 1.5); core.rotation.x += dt * 0.4;
      core.position.y = 1.85 + Math.sin(time * 1.7) * 0.04 * power;
      halo.material.opacity = 0.12 + p * 0.5 + flare * 0.5;
      coreLight.intensity = 0.5 + p * 4.5 + flare * 6;
      coreLight.color.setHSL(0.72 - 0.2 * (0.5 + 0.5 * Math.sin(time * 1.3)), 0.9, 0.62);
    });
    powerables.push({ x: pos.x, z: pos.z, set: (on, delay, instant) => { if (instant) { anvil.setPowered(on); power = on ? 1 : 0; } else tween(0.001, () => {}, { delay, done: () => anvil.setPowered(on) }); } });
    out.anvil = anvil;
  }

  out.bind = (level) => { out._level = level; };
  out.reset = () => {
    snapTo(0);
    out.powerSwitch._setOnVisual(false);
  };
  return out;
}

// =============================================================================================
// DRESSING: architecture detail, props per zone, exterior (sandbags, wire, trees)
// =============================================================================================
function buildDressing(ctx) {
  const { root, mat, box, boxB, cyl, anyGeo, emit, xform, solid, solidC, reserve, isFree, rng, R, pick, sandbagGeo, updaters, canvasTex, HOLES, ZDEF, windows, doors } = ctx;

  // ---------- shared canvas materials ----------
  const atlas = canvasTex(1024, 1024, (g) => {
    // cell 0: topographic field map (0..512, 0..512)
    const paper = (x0, y0, w, h, base) => { g.fillStyle = base; g.fillRect(x0, y0, w, h); for (let i = 0; i < 900; i++) { g.fillStyle = `rgba(90,70,40,${Math.random() * 0.08})`; g.fillRect(x0 + Math.random() * w, y0 + Math.random() * h, 2 + Math.random() * 14, 1 + Math.random() * 5); } };
    paper(0, 0, 512, 512, '#c9bb93');
    g.save(); g.beginPath(); g.rect(10, 10, 492, 492); g.clip();
    g.strokeStyle = 'rgba(120,85,50,0.55)'; g.lineWidth = 1.4;
    for (let k = 0; k < 5; k++) { const cx = 80 + Math.random() * 350, cy = 80 + Math.random() * 350; for (let r = 18; r < 160; r += 14) { g.beginPath(); for (let a = 0; a <= 6.3; a += 0.15) { const rr = r * (1 + 0.18 * Math.sin(a * 3 + k) + 0.08 * Math.sin(a * 7 + r)); g.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr * 0.8); } g.stroke(); } }
    g.strokeStyle = 'rgba(40,70,120,0.7)'; g.lineWidth = 4; g.beginPath(); g.moveTo(0, 300); g.bezierCurveTo(150, 250, 250, 420, 512, 360); g.stroke();
    g.strokeStyle = 'rgba(30,30,30,0.35)'; g.lineWidth = 1; for (let i = 0; i < 512; i += 64) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i, 512); g.moveTo(0, i); g.lineTo(512, i); g.stroke(); }
    g.fillStyle = 'rgba(40,70,40,0.25)'; for (let i = 0; i < 40; i++) { g.beginPath(); g.arc(Math.random() * 512, Math.random() * 200, 6 + Math.random() * 10, 0, 6.3); g.fill(); }
    g.strokeStyle = 'rgba(170,20,20,0.85)'; g.lineWidth = 6; g.lineCap = 'round';
    for (const [a, b, c, d] of [[90, 420, 240, 280], [420, 440, 300, 300], [260, 120, 270, 250]]) { g.beginPath(); g.moveTo(a, b); g.quadraticCurveTo((a + c) / 2 + 30, (b + d) / 2, c, d); g.stroke(); g.beginPath(); g.moveTo(c, d); g.lineTo(c - 18, d + 10); g.moveTo(c, d); g.lineTo(c + 6, d + 20); g.stroke(); }
    g.strokeStyle = 'rgba(20,20,20,0.9)'; g.lineWidth = 3; g.strokeRect(236, 262, 60, 44);
    g.fillStyle = 'rgba(20,20,20,0.85)'; g.font = 'bold 22px "Courier New", monospace'; g.fillText('BLACKWALD', 30, 40); g.font = '16px "Courier New", monospace'; g.fillText('SEKTOR 7  1:25000', 30, 62); g.fillText('B', 258, 292);
    g.restore();
    // cell 1: typed notices / documents (512..1024, 0..512)
    paper(512, 0, 512, 512, '#d8d0bb');
    g.fillStyle = 'rgba(25,25,25,0.8)'; g.font = 'bold 26px "Courier New", monospace'; g.fillText('BEFEHL NR. 14', 560, 60);
    g.font = '15px "Courier New", monospace';
    for (let i = 0; i < 22; i++) { let s = ''; const n = 18 + Math.floor(Math.random() * 30); for (let k = 0; k < n; k++) s += Math.random() < 0.16 ? ' ' : String.fromCharCode(97 + Math.floor(Math.random() * 26)); g.fillText(s, 560, 100 + i * 18); }
    g.strokeStyle = 'rgba(150,20,20,0.7)'; g.lineWidth = 4; g.beginPath(); g.arc(900, 440, 44, 0, 6.3); g.stroke(); g.font = 'bold 16px "Courier New"'; g.fillStyle = 'rgba(150,20,20,0.7)'; g.fillText('GEHEIM', 866, 446);
    // cell 2: radio face (0..512, 512..1024)
    g.fillStyle = '#1d231c'; g.fillRect(0, 512, 512, 512);
    g.fillStyle = '#2b3329'; g.fillRect(16, 528, 480, 480);
    for (const [cx, cy, r] of [[130, 660, 80], [360, 660, 60], [120, 880, 40], [260, 880, 40], [400, 880, 40]]) {
      g.fillStyle = '#0c0e0b'; g.beginPath(); g.arc(cx, cy, r + 8, 0, 6.3); g.fill();
      const gr = g.createRadialGradient(cx, cy, 0, cx, cy, r); gr.addColorStop(0, '#f6c66a'); gr.addColorStop(1, '#8a5a1a'); g.fillStyle = gr; g.beginPath(); g.arc(cx, cy, r, 0, 6.3); g.fill();
      g.strokeStyle = '#2a1a08'; g.lineWidth = 2; for (let a = 0; a < 6.28; a += 0.3) { g.beginPath(); g.moveTo(cx + Math.cos(a) * r * 0.75, cy + Math.sin(a) * r * 0.75); g.lineTo(cx + Math.cos(a) * r * 0.95, cy + Math.sin(a) * r * 0.95); g.stroke(); }
      g.strokeStyle = '#200'; g.lineWidth = 3; g.beginPath(); g.moveTo(cx, cy); g.lineTo(cx + Math.cos(-1) * r * 0.9, cy + Math.sin(-1) * r * 0.9); g.stroke();
    }
    g.fillStyle = '#e8d8a0'; g.fillRect(40, 770, 430, 30); g.fillStyle = '#300'; for (let i = 0; i < 40; i++) g.fillRect(50 + i * 10.5, 775, 2, i % 5 ? 10 : 20);
    // cell 3: blank crate stencil / labels (512..1024, 512..1024)
    g.fillStyle = '#6a5a3c'; g.fillRect(512, 512, 512, 512);
    g.fillStyle = 'rgba(15,12,8,0.85)'; g.font = 'bold 70px "Courier New", monospace'; g.fillText('MUNITION', 560, 640); g.font = 'bold 44px "Courier New", monospace'; g.fillText('7,92 mm  x1500', 560, 720); g.fillText('VORSICHT', 560, 800);
  });
  const paperMat = new THREE.MeshStandardMaterial({ map: atlas, roughness: 0.9, side: THREE.DoubleSide });
  const radioMat = new THREE.MeshStandardMaterial({ map: atlas, emissiveMap: atlas, emissive: 0xffb050, emissiveIntensity: 0.35, roughness: 0.6 });
  const CELL = { map: [0, 0.5, 0.5, 1], doc: [0.5, 0.5, 1, 1], radio: [0, 0, 0.5, 0.5], label: [0.5, 0, 1, 0.5] };
  // oriented plane: centre, right vector t, normal n, w,h, uv cell
  function card(m, region, c, t, n, w, h, cell, cast = false) {
    const up = new THREE.Vector3().crossVectors(n, t).normalize();
    const p = (u, v) => c.clone().addScaledVector(t, u * w / 2).addScaledVector(up, v * h / 2);
    const P = [p(-1, -1), p(1, -1), p(1, 1), p(-1, 1)];
    const g = new THREE.BufferGeometry();
    const pos = [], nor = [], uv = [];
    const [u0, v0, u1, v1] = cell;
    const U = [[u0, v0], [u1, v0], [u1, v1], [u0, v1]];
    for (const i of [0, 1, 2, 0, 2, 3]) { pos.push(P[i].x, P[i].y, P[i].z); nor.push(n.x, n.y, n.z); uv.push(...U[i]); }
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    emit(g, m, region, cast);
  }
  const V = (x, y, z) => new THREE.Vector3(x, y, z);
  const X = V(1, 0, 0), Z = V(0, 0, 1), NX = V(-1, 0, 0), NZ = V(0, 0, -1), UP = V(0, 1, 0);
  // wall poster: on the face of wall at (x,z) facing n
  const poster = (region, x, y, z, n, w, h, cell, rot = 0) => {
    const t = V(n.z, 0, -n.x);
    if (rot) t.applyAxisAngle(n, rot);
    card(paperMat, region, V(x, y, z).addScaledVector(n, 0.015), t, n, w, h, cell);
    // pins
    const up = new THREE.Vector3().crossVectors(n, t);
    for (const [a, b] of [[-1, 1], [1, 1]]) { const p = V(x, y, z).addScaledVector(t, a * (w / 2 - 0.04)).addScaledVector(up, b * (h / 2 - 0.04)).addScaledVector(n, 0.02); anyGeo(new THREE.SphereGeometry(0.012, 5, 4), 'rubber_black', region, p.x, p.y, p.z, { cast: false }); }
  };

  // ---------- prop builders ----------
  function table(region, x, z, w, d, h = 0.82, ry = 0, col = true) {
    const sw = Math.abs(Math.sin(ry)) > 0.5;
    boxB('wood_planks', region, x, h - 0.05, z, w, 0.05, d, { ry });
    const lx = w / 2 - 0.07, lz = d / 2 - 0.07;
    for (const [a, b] of [[-lx, -lz], [lx, -lz], [lx, lz], [-lx, lz]]) { const c = Math.cos(ry), s = Math.sin(ry); boxB('wood_planks', region, x + a * c + b * s, 0, z - a * s + b * c, 0.07, h - 0.05, 0.07, { ry }); }
    boxB('wood_planks', region, x, 0.15, z, sw ? 0.04 : w - 0.2, 0.05, sw ? d - 0.2 : 0.04, { ry: 0 });
    if (col) solidC(x, z, sw ? d : w, sw ? w : d, h, 'wood');
  }
  function chair(region, x, z, ry, tipped = false) {
    const g = [];
    const add = (geo) => g.push(prep(geo));
    const b = (sx, sy, sz, px, py, pz) => { const q = new THREE.BoxGeometry(sx, sy, sz); q.translate(px, py, pz); add(q); };
    b(0.42, 0.04, 0.4, 0, 0.45, 0);
    for (const [a, c] of [[-0.18, -0.17], [0.18, -0.17], [0.18, 0.17], [-0.18, 0.17]]) b(0.035, 0.45, 0.035, a, 0.225, c);
    b(0.035, 0.45, 0.035, -0.18, 0.68, -0.18); b(0.035, 0.45, 0.035, 0.18, 0.68, -0.18); b(0.4, 0.12, 0.025, 0, 0.8, -0.18);
    const geo = mergeGeometries(g);
    projUV(geo, 1, rng(), rng());
    anyGeo(geo, 'wood_planks', region, x, tipped ? 0.2 : 0, z, { ry, rx: tipped ? -Math.PI / 2 + 0.1 : 0 });
  }
  function crate(region, x, z, s = 0.9, y0 = 0, ry = 0, col = true, h) {
    h = h || s;
    boxB('crate_wood', region, x, y0, z, s, h, s, { ry });
    // slat edges
    for (const e of [-1, 1]) boxB('crate_wood', region, x + Math.cos(ry) * e * (s / 2 - 0.03) , y0 + 0.01, z - Math.sin(ry) * e * (s / 2 - 0.03), 0.07, h - 0.02, s + 0.02, { ry });
    if (col && y0 === 0) solidC(x, z, s * (Math.abs(Math.cos(ry)) + Math.abs(Math.sin(ry))) * 0.95, s * (Math.abs(Math.cos(ry)) + Math.abs(Math.sin(ry))) * 0.95, h, 'wood');
  }
  function drum(region, x, z, m = 'metal_rusty', tipped = false, col = true) {
    if (tipped) {
      const ry = rng() * 3;
      cyl(m, region, x, 0.29, z, 0.29, 0.29, 0.88, 14, { rx: Math.PI / 2, ry });
      if (col) solidC(x, z, 0.8, 0.8, 0.58, 'metal');
      return;
    }
    cyl(m, region, x, 0.44, z, 0.29, 0.29, 0.88, 14);
    for (const y of [0.3, 0.6]) cyl(m, region, x, y, z, 0.297, 0.297, 0.03, 14, { cast: false });
    cyl('metal_rusty', region, x, 0.885, z, 0.3, 0.3, 0.02, 14, { cast: false });
    if (col) solidC(x, z, 0.6, 0.6, 0.9, 'metal');
  }
  function sandbagLine(region, x0, z0, x1, z1, layers = 3, col = true) {
    const len = Math.hypot(x1 - x0, z1 - z0), ry = Math.atan2(-(z1 - z0), x1 - x0);
    const n = Math.max(1, Math.round(len / 0.56));
    for (let l = 0; l < layers; l++) for (let i = 0; i < n - (l % 2); i++) {
      const t = (i + 0.5 + (l % 2) * 0.5) / n;
      const g = sandbagGeo();
      xform(g, lerp(x0, x1, t) + (rng() - 0.5) * 0.04, 0.085 + l * 0.165, lerp(z0, z1, t) + (rng() - 0.5) * 0.04, (rng() - 0.5) * 0.08, ry + (rng() - 0.5) * 0.18, (rng() - 0.5) * 0.08);
      emit(g, 'sandbag', region, true);
      // second row behind
      if (layers >= 3 && l < layers - 1) {
        const g2 = sandbagGeo();
        const ox = Math.sin(ry) * 0.3, oz = Math.cos(ry) * 0.3;
        xform(g2, lerp(x0, x1, t) + ox, 0.085 + l * 0.165, lerp(z0, z1, t) + oz, 0, ry + (rng() - 0.5) * 0.2, 0);
        emit(g2, 'sandbag', region, true);
      }
    }
    if (col) {
      const pad = 0.2;
      solid(Math.min(x0, x1) - pad, 0, Math.min(z0, z1) - pad, Math.max(x0, x1) + pad, layers * 0.165 + 0.05, Math.max(z0, z1) + pad, 'sandbag');
    }
  }
  function cabinet(region, x, z, n, w = 0.5, d = 0.6, h = 1.35) {
    // filing cabinet facing n
    const t = V(n.z, 0, -n.x);
    const sx = Math.abs(t.x) * w + Math.abs(n.x) * d, sz = Math.abs(t.z) * w + Math.abs(n.z) * d;
    boxB('metal_painted_green', region, x, 0, z, sx, h, sz);
    for (let i = 0; i < 4; i++) {
      const y = 0.18 + i * (h - 0.1) / 4;
      const p = V(x, y + 0.14, z).addScaledVector(n, d / 2 + 0.01);
      box('metal_painted_green', region, p.x, p.y, p.z, Math.abs(t.x) * (w - 0.05) + Math.abs(n.x) * 0.02, 0.27, Math.abs(t.z) * (w - 0.05) + Math.abs(n.z) * 0.02);
      const hp = p.clone().addScaledVector(n, 0.02); hp.y += 0.06;
      box('brass', region, hp.x, hp.y, hp.z, Math.abs(t.x) * 0.12 + 0.015, 0.02, Math.abs(t.z) * 0.12 + 0.015, { uv: 'raw', cast: false });
    }
    solidC(x, z, sx, sz, h, 'metal');
  }
  function radioSet(region, x, y0, z, n, w = 0.5, h = 0.34, d = 0.3) {
    const t = V(n.z, 0, -n.x);
    const sx = Math.abs(t.x) * w + Math.abs(n.x) * d, sz = Math.abs(t.z) * w + Math.abs(n.z) * d;
    boxB('metal_painted_green', region, x, y0, z, sx, h, sz);
    card(radioMat, region, V(x, y0 + h / 2, z).addScaledVector(n, d / 2 + 0.003), t, n, w - 0.04, h - 0.04, CELL.radio);
    for (let i = 0; i < 3; i++) { const p = V(x, y0 + 0.07, z).addScaledVector(t, (i - 1) * w * 0.3).addScaledVector(n, d / 2 + 0.02); cyl('rubber_black', region, p.x, p.y, p.z, 0.022, 0.022, 0.03, 10, { rx: Math.PI / 2, ry: Math.atan2(n.x, n.z), uv: 'raw', cast: false }); }
  }
  function shelf(region, x, z, n, w = 1.8, d = 0.45, h = 2.0, fill = true) {
    const t = V(n.z, 0, -n.x);
    const S = (a, b) => [Math.abs(t.x) * a + Math.abs(n.x) * b, Math.abs(t.z) * a + Math.abs(n.z) * b];
    for (const e of [-1, 1]) for (const f of [-1, 1]) { const p = V(x, 0, z).addScaledVector(t, e * (w / 2 - 0.03)).addScaledVector(n, f * (d / 2 - 0.03)); boxB('metal_rusty', region, p.x, 0, p.z, 0.04, h, 0.04); }
    for (const y of [0.12, 0.7, 1.3, 1.9]) {
      const [a, b] = S(w, d); boxB('wood_planks', region, x, y, z, a, 0.03, b);
      if (fill && y < 1.9) {
        let u = -w / 2 + 0.1;
        while (u < w / 2 - 0.25) {
          const bw = 0.18 + rng() * 0.3, bh = 0.15 + rng() * 0.3;
          if (rng() < 0.8) { const p = V(x, 0, z).addScaledVector(t, u + bw / 2).addScaledVector(n, (rng() - 0.5) * 0.08); const [c, e] = S(bw, d * 0.7); boxB(pick(['crate_wood', 'metal_painted_green', 'cloth_canvas', 'crate_wood']), region, p.x, y + 0.03, p.z, c, bh, e, { uvs: 1 }); }
          u += bw + 0.04;
        }
      }
    }
    const [a, b] = S(w, d); solidC(x, z, a, b, h, 'metal');
  }
  function rubble(region, x, z, r, n, hmax = 0.6, col = true) {
    for (let i = 0; i < n; i++) {
      const a = rng() * 6.28, d = Math.sqrt(rng()) * r;
      const s = 0.08 + rng() * 0.28 * (1 - d / r * 0.6);
      const g = new THREE.DodecahedronGeometry(s, 0);
      anyGeo(g, rng() < 0.8 ? 'concrete_wall' : 'brick_old', region, x + Math.cos(a) * d, s * 0.4 + rng() * hmax * (1 - d / r), z + Math.sin(a) * d, { uv: 'local', rx: rng() * 3, ry: rng() * 3, rz: rng() * 3, s: V(1 + rng() * 0.8, 0.5 + rng() * 0.5, 1 + rng() * 0.6) });
    }
    if (col) solidC(x, z, r * 1.1, r * 1.1, hmax * 0.8 + 0.1, 'concrete');
  }
  function papersOnFloor(region, x, z, r, n) {
    for (let i = 0; i < n; i++) {
      const a = rng() * 6.28, d = rng() * r;
      const t = V(1, 0, 0).applyAxisAngle(UP, rng() * 6.28);
      card(paperMat, region, V(x + Math.cos(a) * d, 0.004 + i * 0.0006, z + Math.sin(a) * d), t, UP, 0.21, 0.29, rng() < 0.5 ? CELL.doc : CELL.map);
    }
  }
  function pipeRun(region, a, b, r = 0.06, brackets = true) {
    const d = b.clone().sub(a), len = d.length();
    const mid = a.clone().add(b).multiplyScalar(0.5);
    const g = cylGeoLocal(r, len);
    const q = new THREE.Quaternion().setFromUnitVectors(UP, d.clone().normalize());
    g.applyMatrix4(new THREE.Matrix4().compose(mid, q, V(1, 1, 1)));
    emit(g, 'metal_rusty', region, true);
    if (brackets) for (let s = 0.5; s < len; s += 2.0) { const p = a.clone().addScaledVector(d, s / len); const f = cylGeoLocal(r * 1.35, 0.06); f.applyMatrix4(new THREE.Matrix4().compose(p, q, V(1, 1, 1))); emit(f, 'metal_rusty', region, false); }
  }
  function cylGeoLocal(r, len) { const g = prep(new THREE.CylinderGeometry(r, r, len, 10, 1, true)); const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * r * 3.14, uv.getY(i) * len / 2); return g; }

  // ---------- ceiling beams + posts (per zone) ----------
  const BEAMS = { 0: [-6.2, -2.3, 2.1, 6.2], 1: [-22, -19, -13, -10], 2: [10.5, 13.5, 16.5, 19.5, 22.5], 3: [-22, -19, -13, -10] };
  for (const z of ZDEF) {
    const region = 'z' + z.id;
    const hole = HOLES.find((h) => h.zone === z.id);
    for (const bx of BEAMS[z.id]) {
      const z0 = z.z0 + HW, z1 = z.z1 - HW;
      const segs = [];
      if (hole && bx > hole.x0 - 0.2 && bx < hole.x1 + 0.2) { segs.push([z0, hole.z0 - 0.35]); segs.push([hole.z1 + 0.35, z1]); }
      else segs.push([z0, z1]);
      for (const [a, b] of segs) box('wood_planks', region, bx, WALL_H - 0.16, (a + b) / 2, 0.24, 0.32, b - a, { uvs: 0.5 });
      if (segs.length === 2) {
        // broken beam end sagging into the hole
        box('wood_planks', region, bx, WALL_H - 0.7, hole.z0 + 0.05, 0.22, 0.28, 1.1, { rx: 0.9, uvs: 0.5 });
      }
      // posts against both walls when free
      for (const [pz, sgn] of [[z0 + 0.14, 1], [z1 - 0.14, -1]]) {
        if (!isFree(bx, pz, 0.2)) continue;
        boxB('wood_planks', region, bx, 0, pz, 0.24, WALL_H - 0.32, 0.26, { uvs: 0.5 });
        // knee brace
        box('wood_planks', region, bx, WALL_H - 0.55, pz + sgn * 0.3, 0.14, 0.14, 0.7, { rx: sgn * -0.75, uvs: 0.5 });
        solid(bx - 0.12, 0, pz - 0.13, bx + 0.12, WALL_H, pz + 0.13, 'wood');
      }
    }
    // steel girder along the long axis
    box('metal_rusty', region, (z.x0 + z.x1) / 2, WALL_H - 0.38, (z.z0 + z.z1) / 2 + (z.id === 0 ? 1.8 : 0), z.x1 - z.x0 - WT, 0.14, 0.14);
  }

  // ---------- hole debris ----------
  for (const h of HOLES) {
    const region = 'z' + h.zone, cx = (h.x0 + h.x1) / 2, cz = (h.z0 + h.z1) / 2;
    rubble(region, cx + 0.5, cz + 0.6, 1.2, 38, 0.55);
    // hanging rebar
    for (let i = 0; i < 9; i++) {
      const edge = rng() < 0.5 ? [h.x0 + rng() * (h.x1 - h.x0), h.z0 + (rng() < 0.5 ? 0 : h.z1 - h.z0)] : [h.x0 + (rng() < 0.5 ? 0 : h.x1 - h.x0), h.z0 + rng() * (h.z1 - h.z0)];
      const L = 0.3 + rng() * 0.8;
      cyl('metal_rusty', region, edge[0], WALL_H - L / 2 + 0.1, edge[1], 0.008, 0.008, L, 5, { rx: (rng() - 0.5) * 0.9, rz: (rng() - 0.5) * 0.9, cast: false });
    }
    // chunks still on the rim above
    for (let i = 0; i < 6; i++) anyGeo(new THREE.DodecahedronGeometry(0.15 + rng() * 0.2, 0), 'concrete_wall', 'roof', lerp(h.x0, h.x1, rng()), WALL_H + 0.4, lerp(h.z0, h.z1, rng() < 0.5 ? 0 : 1), { uv: 'local', rx: rng() * 3, ry: rng() * 3 });
  }

  // =========================================== ZONE 0 — COMMAND POST
  {
    const r = 'z0';
    // central map table
    table(r, 0, -0.5, 3.2, 1.7, 0.86);
    card(paperMat, r, V(-0.2, 0.866, -0.5), X.clone().applyAxisAngle(UP, 0.06), UP, 1.5, 1.05, CELL.map);
    card(paperMat, r, V(1.05, 0.868, -0.1), X.clone().applyAxisAngle(UP, -0.4), UP, 0.3, 0.4, CELL.doc);
    card(paperMat, r, V(0.95, 0.87, -0.95), X.clone().applyAxisAngle(UP, 0.3), UP, 0.3, 0.4, CELL.doc);
    radioSet(r, -1.25, 0.86, -1.05, Z, 0.46, 0.3, 0.32);
    cyl('metal_painted_green', r, 1.3, 0.92, -1.0, 0.045, 0.04, 0.11, 10); // mug
    cyl('brass', r, 0.6, 0.875, 0.1, 0.05, 0.05, 0.03, 12, { uv: 'raw' }); // compass
    for (const [x, z, ry, tip] of [[-1.0, -1.75, 0, false], [0.9, -1.8, 0.3, false], [-1.9, 0.2, Math.PI / 2 + 0.2, false], [1.3, 0.75, Math.PI + 0.4, false], [2.4, 1.5, 1.2, true]]) chair(r, x, z, ry, tip);
    // concrete columns
    for (const x of [-4.2, 4.2]) { boxB('concrete_wall', r, x, 0, -0.5, 0.5, WALL_H, 0.5, { uv: 'world' }); solidC(x, -0.5, 0.5, 0.5, WALL_H, 'concrete'); }
    // filing cabinets + wall map on east wall
    for (const z of [-4.1, -4.65, -5.2]) cabinet(r, 7.47, z, NX, 0.52, 0.62, 1.32);
    poster(r, 7.8, 1.95, -4.65, NX, 1.1, 0.8, CELL.map, 0.03);
    poster(r, 0.4, 1.8, -6.8, Z, 1.4, 1.0, CELL.map, -0.02);
    poster(r, 1.55, 1.55, -6.8, Z, 0.4, 0.55, CELL.doc, 0.08);
    poster(r, -7.8, 1.7, -2.6, X, 0.42, 0.58, CELL.doc, -0.05);
    // desk + typewriter + chair SE
    table(r, 7.3, 4.6, 1.4, 0.7, 0.78, Math.PI / 2);
    boxB('metal_painted_green', r, 7.3, 0.78, 4.4, 0.34, 0.14, 0.32);
    card(paperMat, r, V(7.28, 0.95, 4.4), X, V(0.25, 0.97, 0).normalize(), 0.2, 0.2, CELL.doc);
    chair(r, 6.55, 4.6, -Math.PI / 2 + 0.2);
    // crates + sandbags in corners
    crate(r, -6.9, -3.9, 0.95); crate(r, -6.95, -3.9, 0.6, 0.95, 0.4, false);
    crate(r, -7.0, 6.15, 0.9, 0, 0.2); crate(r, -6.1, 6.35, 0.6, 0, -0.3);
    drum(r, -5.9, -6.25);
    sandbagLine(r, 5.5, 6.55, 7.4, 6.55, 3);
    papersOnFloor(r, 1.5, 2.0, 1.5, 7);
    papersOnFloor(r, -3.5, -3.5, 1.2, 4);
  }

  // =========================================== ZONE 1 — RADIO ROOM
  {
    const r = 'z1';
    // central radio island: two desks back to back + a tall rack
    table(r, -16, -0.3, 4.2, 0.85, 0.8); table(r, -16, 0.6, 4.2, 0.85, 0.8, 0, false);
    solidC(-16, 0.15, 4.2, 1.75, 0.8, 'wood');
    boxB('metal_painted_green', r, -16, 0.8, 0.15, 1.0, 1.0, 0.5); solidC(-16, 0.15, 1.0, 0.5, 1.8, 'metal');
    card(radioMat, r, V(-16, 1.3, 0.405), X, Z, 0.9, 0.9, CELL.radio); card(radioMat, r, V(-16, 1.3, -0.105), NX, NZ, 0.9, 0.9, CELL.radio);
    for (const x of [-17.6, -14.4]) { radioSet(r, x, 0.8, -0.45, NZ, 0.55, 0.36, 0.34); radioSet(r, x, 0.8, 0.75, Z, 0.55, 0.36, 0.34); }
    radioSet(r, -17.6, 1.16, 0.75, Z, 0.4, 0.22, 0.28);
    // headsets + mics
    for (const [x, z] of [[-17.0, -0.55], [-14.9, 0.9]]) { anyGeo(new THREE.TorusGeometry(0.09, 0.012, 5, 14, Math.PI), 'rubber_black', r, x, 0.84, z, { rx: -Math.PI / 2 + 0.2 }); }
    for (const [x, z, ry] of [[-17.5, -1.4, 0.2], [-14.5, -1.3, -0.3], [-17.2, 1.6, Math.PI + 0.1], [-14.2, 1.55, Math.PI - 0.2]]) chair(r, x, z, ry);
    // switchboard on west wall
    boxB('metal_painted_green', r, -23.5, 0, -3.5, 0.5, 1.95, 1.4); solidC(-23.5, -3.5, 0.5, 1.4, 1.95, 'metal');
    card(radioMat, r, V(-23.245, 1.25, -3.5), Z, X, 1.25, 0.95, CELL.radio);
    // shelves with radio parts near the east door
    shelf(r, -8.5, 4.5, NX, 1.8, 0.45, 1.95); shelf(r, -8.5, -4.3, NX, 1.6, 0.45, 1.95);
    // SW corner crates + cabinets
    crate(r, -23.1, 6.0, 0.95); crate(r, -22.2, 6.2, 0.7, 0, 0.3); crate(r, -23.1, 6.0, 0.6, 0.95, 0.5, false);
    for (const x of [-20.4, -19.8]) cabinet(r, x, 6.45, NZ, 0.55, 0.62, 1.3);
    poster(r, -21.0, 1.75, 6.8, NZ, 1.3, 0.9, CELL.map, 0.02);
    poster(r, -23.8, 1.8, 4.6, X, 0.8, 0.6, CELL.map, -0.04);
    poster(r, -13.8, 1.7, -6.8, Z, 0.4, 0.55, CELL.doc, 0.1);
    poster(r, -18.2, 1.65, -6.8, Z, 0.42, 0.58, CELL.doc, -0.06);
    // ceiling pipes with drips
    pipeRun(r, V(-23.8, 3.2, -5.9), V(-8.2, 3.2, -5.9), 0.07);
    pipeRun(r, V(-23.8, 3.35, -5.6), V(-8.2, 3.35, -5.6), 0.045);
    papersOnFloor(r, -15.5, 3.0, 1.8, 8);
  }

  // =========================================== ZONE 2 — ARMORY HALL
  {
    const r = 'z2';
    // central island: crate stacks with a rack spine
    const cs = [[15.5, -0.6, 1.0, 1], [15.5, 0.6, 1.0, 2], [16.6, -0.55, 0.9, 1], [16.6, 0.55, 1.0, 1], [17.7, 0, 1.2, 2],
      [18.9, -0.6, 1.0, 1], [18.9, 0.55, 0.9, 2], [20.0, -0.5, 1.0, 2], [20.0, 0.6, 0.95, 1], [20.9, 0, 0.8, 1]];
    for (const [x, z, s, st] of cs) { crate(r, x, z, s, 0, (rng() - 0.5) * 0.2, false); if (st > 1) crate(r, x + (rng() - 0.5) * 0.1, z, s * 0.8, s, (rng() - 0.5) * 0.4, false); }
    solid(14.95, 0, -1.15, 21.35, 1.8, 1.15, 'wood');
    // ammo labels on a few
    card(paperMat, r, V(15.5, 0.5, -1.105), X, NZ, 0.5, 0.25, CELL.label); card(paperMat, r, V(18.9, 0.5, -1.105), X, NZ, 0.5, 0.25, CELL.label);
    // weapon racks along the west wall
    for (const z of [-4.6, 4.6]) {
      const w = 1.9;
      boxB('wood_planks', r, 8.45, 0, z, 0.1, 1.6, w, { uvs: 0.5 });
      boxB('wood_planks', r, 8.62, 0.2, z, 0.3, 0.06, w);
      boxB('wood_planks', r, 8.62, 1.3, z, 0.24, 0.05, w);
      for (let i = 0; i < 6; i++) {
        const zz = z - w / 2 + 0.2 + i * 0.3;
        box('gun_metal', r, 8.6, 1.0, zz, 0.035, 0.9, 0.035, { uv: 'raw', rz: 0.12, cast: false });
        box('wood_stock', r, 8.64, 0.5, zz, 0.06, 0.55, 0.05, { uv: 'raw', rz: 0.12 });
      }
      solidC(8.6, z, 0.4, w, 1.6, 'wood');
    }
    // workbench south wall
    table(r, 19.8, 7.35, 1.8, 0.8, 0.9);
    boxB('metal_rusty', r, 19.2, 0.9, 7.4, 0.2, 0.18, 0.14); // vise
    box('gun_metal', r, 20.2, 0.93, 7.3, 0.7, 0.05, 0.08, { uv: 'raw', ry: 0.3 });
    box('wood_stock', r, 20.5, 0.93, 7.45, 0.35, 0.07, 0.06, { uv: 'raw', ry: -0.2 });
    poster(r, 19.8, 1.75, 7.8, NZ, 0.9, 0.62, CELL.doc, 0.03);
    // shelving north wall
    shelf(r, 15.8, -7.5, Z, 2.0, 0.45, 2.0);
    // drums + ammo crates
    drum(r, 9.2, 7.2); drum(r, 9.85, 7.35, 'metal_painted_green'); drum(r, 9.3, 6.55, 'metal_rusty', true);
    crate(r, 9.3, -7.2, 0.8); crate(r, 10.1, -7.3, 0.6, 0, 0.4);
    sandbagLine(r, 24.6, 6.0, 24.6, 7.6, 3);
    poster(r, 13.6, 1.8, -7.8, Z, 0.5, 0.65, CELL.doc, 0.04);
    papersOnFloor(r, 22, -2, 1.5, 5);
    pipeRun(r, V(8.2, 3.25, 6.6), V(25.8, 3.25, 6.6), 0.07);
  }

  // =========================================== ZONE 3 — GENERATOR VAULT
  {
    const r = 'z3';
    const gx = -16, gz = -14.6;
    // skid + engine block + flywheel + radiator + exhaust
    boxB('metal_rusty', r, gx, 0, gz, 4.4, 0.25, 2.3);
    boxB('metal_painted_green', r, gx - 0.5, 0.25, gz, 2.6, 1.35, 1.7);
    boxB('metal_painted_green', r, gx - 0.5, 1.6, gz, 2.2, 0.35, 1.2);
    for (let i = 0; i < 6; i++) cyl('metal_rusty', r, gx - 1.4 + i * 0.36, 2.02, gz, 0.1, 0.12, 0.2, 10); // cylinder heads
    boxB('metal_painted_green', r, gx + 1.45, 0.25, gz, 0.6, 1.2, 1.9); // generator housing
    cyl('metal_rusty', r, gx + 1.2, 1.05, gz, 0.72, 0.72, 0.18, 24, { rz: Math.PI / 2 }); // flywheel
    cyl('metal_rusty', r, gx + 1.2, 1.05, gz, 0.16, 0.16, 0.3, 12, { rz: Math.PI / 2 });
    boxB('metal_rusty', r, gx - 2.0, 0.25, gz, 0.25, 1.5, 1.6); // radiator
    for (let i = 0; i < 9; i++) boxB('metal_rusty', r, gx - 2.16, 0.35, gz - 0.7 + i * 0.175, 0.04, 1.3, 0.02, { cast: false });
    cyl('metal_rusty', r, gx - 0.2, 2.2 + (WALL_H - 2.2) / 2, gz + 0.3, 0.1, 0.1, WALL_H - 2.2, 12);
    cyl('metal_rusty', r, gx - 0.2, 2.05, gz + 0.3, 0.14, 0.14, 0.25, 12);
    cyl('metal_painted_green', r, gx + 0.3, 2.15, gz - 0.2, 0.3, 0.3, 1.4, 16, { rz: Math.PI / 2 }); // fuel tank
    radioSet(r, gx + 0.25, 0.7, gz + 0.9, Z, 0.7, 0.4, 0.12);
    radioSet(r, gx - 1.2, 0.7, gz - 0.9, NZ, 0.6, 0.35, 0.12);
    solid(gx - 2.3, 0, gz - 1.2, gx + 2.25, 2.3, gz + 1.2, 'metal');
    // cable from generator to switch along the floor + up the wall
    pipeRun(r, V(gx + 1.6, 0.05, gz - 0.9), V(-11.8, 0.05, -20.6), 0.04, false);
    // transformer cabinets west wall
    for (const z of [-18.6, -17.7]) { boxB('metal_painted_green', r, -23.45, 0, z, 0.6, 2.0, 0.85); card(radioMat, r, V(-23.14, 1.35, z), Z, X, 0.6, 0.5, CELL.radio); }
    solid(-23.8, 0, -19.1, -23.1, 2.0, -17.2, 'metal');
    // fuel drums
    drum(r, -9.2, -20.0, 'metal_painted_green'); drum(r, -9.85, -20.25); drum(r, -9.3, -19.35, 'metal_rusty');
    drum(r, -9.5, -18.3, 'metal_painted_green', true);
    // lockers on the east wall
    for (const z of [-12.55, -13.1, -13.65]) { boxB('metal_painted_green', r, -8.5, 0, z, 0.55, 1.9, 0.52); boxB('metal_rusty', r, -8.77, 1.2, z + 0.12, 0.02, 0.4, 0.02, { cast: false }); }
    solid(-8.8, 0, -13.95, -7.8, 1.9, -12.25, 'metal');
    // cable trays + pipes
    pipeRun(r, V(-23.8, 3.25, -8.1), V(-8.2, 3.25, -8.1), 0.08);
    pipeRun(r, V(-23.8, 3.1, -19.9), V(-8.2, 3.1, -19.9), 0.06);
    pipeRun(r, V(-12.2, 3.1, -19.9), V(-12.2, 3.1, -8.1), 0.05);
    poster(r, -13.6, 1.7, -20.8, Z, 0.8, 0.6, CELL.doc, -0.03);
    poster(r, -23.8, 1.8, -10.5, X, 0.9, 0.62, CELL.map, 0.03);
    crate(r, -23.1, -7.9, 0.9);
    papersOnFloor(r, -13, -12, 1.2, 4);
  }

  // =========================================== ZONE STENCILS
  const stencil = canvasTex(1024, 512, (g) => {
    g.clearRect(0, 0, 1024, 512);
    g.fillStyle = 'rgba(230,225,210,0.9)'; g.font = 'bold 84px "Courier New", monospace'; g.textAlign = 'left';
    ['B-1  KOMMANDO', 'B-2  FUNKRAUM', 'B-3  ARSENAL', 'B-4  MASCHINEN'].forEach((s, i) => g.fillText(s, 20, 100 + i * 128));
    g.globalCompositeOperation = 'destination-out';
    for (let i = 0; i < 9000; i++) { g.fillStyle = `rgba(0,0,0,${Math.random()})`; g.fillRect(Math.random() * 1024, Math.random() * 512, 2 + Math.random() * 3, 2 + Math.random() * 3); }
    for (let x = 60; x < 1024; x += 58) g.fillRect(x, 0, 5, 512); // stencil bridges
  });
  const stencilMat = new THREE.MeshStandardMaterial({ map: stencil, transparent: true, depthWrite: false, roughness: 1, polygonOffset: true, polygonOffsetFactor: -2 });
  for (const [i, x, z, n] of [[0, -5.3, 6.8, NZ], [1, -21.5, -6.8, Z], [2, 16.5, 7.8, NZ], [3, -19.5, -20.8, Z]]) {
    const t = V(n.z, 0, -n.x);
    card(stencilMat, 'walls', V(x, 2.55, z).addScaledVector(n, 0.013), t, n, 2.0, 0.25, [0, 1 - (i + 1) / 4 + 0.02, 1, 1 - i / 4 - 0.02]);
  }

  // =========================================== DRIPS (instanced)
  const DRIPS = [V(-20.5, 3.13, -5.9), V(-12.3, 3.13, -5.9), V(-17.9, 3.03, -19.9), V(-10.4, 3.18, -8.1), V(14.1, 3.18, 6.6)];
  const dripMesh = new THREE.InstancedMesh(new THREE.SphereGeometry(0.012, 6, 4), new THREE.MeshStandardMaterial({ color: 0x8090a0, roughness: 0.05, metalness: 0.2, transparent: true, opacity: 0.7 }), DRIPS.length);
  dripMesh.frustumCulled = false; root.add(dripMesh);
  const dState = DRIPS.map((p) => ({ p, y: p.y, v: 0, wait: rng() * 2 }));
  const puddleMat = new THREE.MeshStandardMaterial({ color: 0x0a0c0e, roughness: 0.02, metalness: 0.4, transparent: true, opacity: 0.75, polygonOffset: true, polygonOffsetFactor: -1 });
  for (const p of DRIPS) {
    const g = new THREE.CircleGeometry(1, 20); const pa = g.attributes.position;
    for (let i = 1; i < pa.count; i++) { const k = 0.35 + 0.35 * rng(); pa.setXY(i, pa.getX(i) * k * (1.4 + rng() * 0.3), pa.getY(i) * k); }
    anyGeo(g, puddleMat, 'walls', p.x, 0.003, p.z, { rx: -Math.PI / 2, ry: rng() * 3, cast: false });
  }
  const _dm = new THREE.Matrix4();
  updaters.push((dt) => {
    dState.forEach((d, i) => {
      if (d.wait > 0) { d.wait -= dt; d.y = d.p.y; d.v = 0; }
      else { d.v += 9.8 * dt; d.y -= d.v * dt; if (d.y < 0.01) { d.wait = 0.6 + rng() * 2.2; d.y = d.p.y; } }
      _dm.makeScale(1, d.wait > 0 ? 1 : 2.2, 1).setPosition(d.p.x, d.y, d.p.z);
      dripMesh.setMatrixAt(i, _dm);
    });
    dripMesh.instanceMatrix.needsUpdate = true;
  });

  // =========================================== EXTERIOR
  {
    const r = 'ext';
    // sandbag walls hugging the bunker (away from window lanes)
    sandbagLine(r, -22.8, 8.0, -19.6, 8.0, 3, true);
    sandbagLine(r, -12.2, 8.0, -9.0, 8.0, 3, true);
    sandbagLine(r, 10.0, 8.6, 14.5, 8.6, 3, true);
    sandbagLine(r, 26.6, 2.0, 26.6, 6.5, 3, true);
    sandbagLine(r, -24.6, -9.0, -24.6, -11.8, 3, true);
    sandbagLine(r, 10.5, -8.6, 16.5, -8.6, 2, true);
    // machine-gun nest south of the command post
    sandbagLine(r, -1.2, 14.5, 1.8, 15.2, 4, true); sandbagLine(r, 1.8, 15.2, 3.2, 13.8, 4, true);
    // crates / drums outside
    crate(r, 7.4, 10.8, 1.0, 0, 0.3); crate(r, 8.4, 11.2, 0.8, 0, -0.2); crate(r, 7.6, 10.9, 0.65, 1.0, 0.8, false);
    drum(r, -9.8, 11.5, 'metal_rusty', true); drum(r, -10.6, 12.2); drum(r, 23.5, -12.5, 'metal_painted_green');
    crate(r, -27.5, -3.5, 1.0, 0, 0.5); crate(r, 29.5, -9.5, 0.9, 0, 0.2);
    rubble(r, -5.5, -10.5, 1.4, 20, 0.35, false); rubble(r, 20, 11, 1.6, 22, 0.35, false); rubble(r, -27, -20, 1.4, 20, 0.35, false);
    // disturbed earth / grave mounds around each spawn point
    for (const w of windows) {
      const t = V(w.normal.z, 0, -w.normal.x);
      for (const s of [-1, 1]) {
        const p = w.outsidePos.clone().addScaledVector(t, s * (1.3 + rng() * 0.5)).addScaledVector(w.normal, -(rng() * 1.2));
        anyGeo(new THREE.SphereGeometry(1, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2), 'dirt_ground', r, p.x, -0.05, p.z, { s: V(0.55 + rng() * 0.2, 0.22, 1.0 + rng() * 0.3), ry: Math.atan2(w.normal.x, w.normal.z) + (rng() - 0.5) * 0.4, uv: 'local' });
        if (rng() < 0.6) box('wood_planks', r, p.x + (rng() - 0.5) * 0.4, 0.45, p.z + (rng() - 0.5) * 0.4, 0.06, 0.9, 0.05, { rx: (rng() - 0.5) * 0.3, rz: (rng() - 0.5) * 0.3 });
      }
    }
    // roof edge: sandbags + corrugated sheets on top of the bunker for the silhouette
    for (let i = 0; i < 14; i++) {
      const x = -22 + rng() * 46, z = -7.6 + rng() * 14;
      box('corrugated_metal', 'roof', x, WALL_H + 0.38, z, 1.8, 0.03, 1.0, { ry: rng() * 3, rz: (rng() - 0.5) * 0.1 });
    }
    // barbed-wire perimeter (posts + 3 strands + coils)
    const fence = [V(-31, 0, -27), V(-4, 0, -27), V(-2, 0, -14), V(33, 0, -14), V(33, 0, 15), V(-31, 0, 15), V(-31, 0, -27)];
    const wireGeos = [];
    for (let k = 0; k < fence.length - 1; k++) {
      const a = fence[k], b = fence[k + 1], len = a.distanceTo(b), n = Math.ceil(len / 3);
      let prev = null;
      for (let i = 0; i <= n; i++) {
        const p = a.clone().lerp(b, i / n);
        if (rng() < 0.08 && i > 0 && i < n) { prev = null; continue; } // broken sections
        const lean = (rng() - 0.5) * 0.25;
        box('wood_planks', r, p.x, 0.65, p.z, 0.09, 1.3, 0.09, { rx: lean, rz: (rng() - 0.5) * 0.25 });
        if (prev) for (const y of [0.35, 0.75, 1.15]) {
          const d = p.clone().sub(prev), L = d.length();
          const g = prep(new THREE.CylinderGeometry(0.006, 0.006, L, 3, 1, true));
          const q = new THREE.Quaternion().setFromUnitVectors(UP, d.normalize());
          g.applyMatrix4(new THREE.Matrix4().compose(prev.clone().add(p).multiplyScalar(0.5).setY(y - 0.04 * Math.sin(i)), q, V(1, 1, 1)));
          wireGeos.push(g);
        }
        prev = p;
      }
      // concertina coil along the base
      const pts = [];
      const dir = b.clone().sub(a).normalize(), side = V(dir.z, 0, -dir.x);
      for (let s = 0; s < len; s += 0.05) { const ang = s * 9; pts.push(a.clone().addScaledVector(dir, s + Math.cos(ang) * 0.08).addScaledVector(side, Math.cos(ang) * 0.35 + 0.6).setY(0.38 + Math.sin(ang) * 0.35)); }
      if (pts.length > 4) wireGeos.push(prep(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), Math.min(1600, pts.length * 2), 0.007, 3, false)));
    }
    emit(mergeGeometries(wireGeos), 'metal_rusty', r, false);
    // rocks, stumps and fallen logs in the clearing
    for (let i = 0; i < 40; i++) {
      const a = rng() * 6.28, d = 12 + rng() * 22;
      const x = 1 + Math.cos(a) * d * 1.3, z = -6.5 + Math.sin(a) * d;
      if (!isFree(x, z, 1)) continue;
      if (rng() < 0.5) anyGeo(new THREE.DodecahedronGeometry(0.3 + rng() * 0.5, 0), 'concrete_wall', r, x, 0, z, { uv: 'local', s: V(1 + rng() * 0.6, 0.35 + rng() * 0.3, 0.8 + rng() * 0.4), ry: rng() * 3, rx: (rng() - 0.5) * 0.4 });
      else if (rng() < 0.6) cyl('wood_planks', r, x, 0.2, z, 0.28, 0.34, 0.4, 9);
      else cyl('wood_planks', r, x, 0.2, z, 0.2, 0.22, 3 + rng() * 3, 8, { rz: Math.PI / 2, ry: rng() * 3 });
    }
  }

  // =========================================== FOREST (instanced pines)
  {
    const trunkGeo = new THREE.CylinderGeometry(0.12, 0.26, 1, 6); trunkGeo.translate(0, 0.5, 0);
    const layers = [];
    for (let i = 0; i < 6; i++) {
      const y = 0.18 + i * 0.13, rad = 0.36 - i * 0.055, h = 0.3 - i * 0.02;
      const c = new THREE.ConeGeometry(rad, h, 8, 1, true); c.translate(0, y + h / 2, 0);
      const p = c.attributes.position; for (let k = 0; k < p.count; k++) { if (p.getY(k) < y + 0.01) { p.setX(k, p.getX(k) * (1 + (Math.random() - 0.5) * 0.35)); p.setZ(k, p.getZ(k) * (1 + (Math.random() - 0.5) * 0.35)); p.setY(k, p.getY(k) - Math.random() * 0.04); } }
      c.computeVertexNormals();
      layers.push(prep(c));
    }
    const top = new THREE.ConeGeometry(0.06, 0.16, 6); top.translate(0, 0.98, 0); layers.push(prep(top));
    const foliageGeo = mergeGeometries(layers);
    const foliageMat = new THREE.MeshStandardMaterial({ color: 0x14231a, roughness: 0.95, side: THREE.DoubleSide, flatShading: true });
    const trunkMat = new THREE.MeshStandardMaterial({ color: 0x241a13, roughness: 1 });
    const spots = [];
    const building = (x, z) => x > -38 && x < 40 && z > -35 && z < 22;
    let guard = 0;
    while (spots.length < 520 && guard++ < 20000) {
      const x = -100 + rng() * 200, z = -100 + rng() * 190;
      if (building(x, z)) {
        // sparse trees inside the ring but outside the fence line
        const edge = x < -33 || x > 35 || z < -29 || z > 17;
        if (!edge || rng() < 0.6) continue;
      }
      if (Math.hypot(x - 1, z + 6.5) > 105) continue;
      spots.push([x, z]);
    }
    // chunk the forest into sectors so each instanced mesh has a tight bounding sphere
    const sectors = new Map();
    for (const sp of spots) { const k = Math.floor(Math.atan2(sp[1] + 6.5, sp[0] - 1) / (Math.PI / 4)) + '|' + (Math.hypot(sp[0] - 1, sp[1] + 6.5) > 58 ? 1 : 0); if (!sectors.has(k)) sectors.set(k, []); sectors.get(k).push(sp); }
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s = V(1, 1, 1);
    for (const [key, list] of sectors) {
      const far = key.endsWith('|1'); // outer ring: fogged silhouettes, no shadow casting
      const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, list.length);
      const fol = new THREE.InstancedMesh(foliageGeo, foliageMat, list.length);
      list.forEach(([x, z], i) => {
        const h = 11 + rng() * 9, w = h * (0.55 + rng() * 0.25);
        q.setFromEuler(new THREE.Euler((rng() - 0.5) * 0.06, rng() * 6.28, (rng() - 0.5) * 0.06));
        m4.compose(V(x, 0, z), q, s.set(w, h, w)); fol.setMatrixAt(i, m4);
        m4.compose(V(x, 0, z), q, s.set(1 + rng() * 0.3, h * 0.35, 1 + rng() * 0.3)); trunks.setMatrixAt(i, m4);
      });
      for (const m of [trunks, fol]) { m.castShadow = !far; m.receiveShadow = !far; m.computeBoundingSphere(); m.computeBoundingBox && m.computeBoundingBox(); root.add(m); }
    }
  }
}

// =============================================================================================
// LIGHTING + ATMOSPHERE: sky, moon, fog, bulbs (flicker + power cascade), fire barrels, shafts, mist
// =============================================================================================
function buildLighting(ctx, features) {
  const { root, dynGroup, updaters, powerables, tween, mat, box, cyl, emit, xform, solid, reserve, canvasTex, HOLES, windows, rng } = ctx;
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
    uniforms: { uMoon: { value: MOON_DIR.clone() }, uHorizon: { value: new THREE.Color(0x1a2230) }, uZenith: { value: new THREE.Color(0x03050a) }, uFog: { value: FOG.clone() } },
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
    side: THREE.BackSide, depthWrite: false, fog: false,
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(180, 32, 16), skyMat);
  sky.renderOrder = -10; sky.frustumCulled = false; root.add(sky);
  updaters.push((dt, time, pp) => { if (pp) sky.position.set(pp.x, 0, pp.z); });
  // moon disc
  const moonTex = canvasTex(256, 256, (g) => {
    const gr = g.createRadialGradient(128, 128, 0, 128, 128, 128);
    gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.28, 'rgba(236,240,255,1)'); gr.addColorStop(0.31, 'rgba(180,200,255,0.35)'); gr.addColorStop(0.55, 'rgba(120,150,220,0.08)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 256, 256);
    g.globalCompositeOperation = 'multiply';
    for (let i = 0; i < 14; i++) { const a = Math.random() * 6.28, r = Math.random() * 30; g.fillStyle = `rgba(170,175,190,${0.4 + Math.random() * 0.4})`; g.beginPath(); g.arc(128 + Math.cos(a) * r, 128 + Math.sin(a) * r, 4 + Math.random() * 12, 0, 6.28); g.fill(); }
  });
  const moon = new THREE.Sprite(new THREE.SpriteMaterial({ map: moonTex, fog: false, depthWrite: false, transparent: true, color: 0xdfe8ff }));
  moon.scale.setScalar(30); moon.renderOrder = -9;
  root.add(moon);
  updaters.push((dt, time, pp) => { const c = pp || { x: 0, z: 0 }; moon.position.set(c.x + MOON_DIR.x * 160, MOON_DIR.y * 160, c.z + MOON_DIR.z * 160); });

  // ---- moonlight ----
  const centre = new THREE.Vector3(1, 0, -6.5);
  const moonLight = new THREE.DirectionalLight(0xa4b8ff, 2.6);
  moonLight.position.copy(centre).addScaledVector(MOON_DIR, 70);
  moonLight.target.position.copy(centre);
  moonLight.castShadow = true; moonLight.shadow.autoUpdate = false; moonLight.shadow.needsUpdate = true;
  moonLight.shadow.mapSize.set(4096, 4096);
  const sc = moonLight.shadow.camera;
  sc.left = -36; sc.right = 36; sc.top = 30; sc.bottom = -30; sc.near = 20; sc.far = 130;
  moonLight.shadow.bias = -0.0004; moonLight.shadow.normalBias = 0.04;
  root.add(moonLight, moonLight.target);
  const HEMI_PRE = 2.1, HEMI_POST = 2.9; // tuned for main.js: exposure 1.6 + environmentIntensity 0.55
  const hemi = new THREE.HemisphereLight(0x7486aa, 0x3a2e22, HEMI_PRE);
  const hemiState = { delay: 0, on: false, p: 0 };
  powerables.push({ x: -16, z: -14, set: (on, delay, instant) => { hemiState.on = on; hemiState.delay = instant ? 0 : delay + 0.8; if (instant) hemiState.p = on ? 1 : 0; } });
  root.add(hemi);
  lights.moon = moonLight; lights.hemi = hemi;

  // ---- hanging bulbs ----
  const rub = mat('rubber_black'), pg = mat('metal_painted_green'), rusty = mat('metal_rusty');
  const BULBS = [
    { z: 0, x: 0, zz: 0.3, pre: 14, post: 34, shadow: true, shade: true, cord: 0.85 },
    { z: 0, x: -4.6, zz: -4.2, pre: 9, post: 40, cord: 0.6 },
    { z: 0, x: 4.4, zz: 4.3, pre: 11, post: 42, cord: 0.7, shade: true },
    { z: 1, x: -19.5, zz: -2.2, pre: 13, post: 56, cord: 0.8, shade: true },
    { z: 1, x: -12.5, zz: 3.2, pre: 11, post: 44, cord: 0.95 },
    { z: 2, x: 12.2, zz: -1.5, pre: 16, post: 46, cord: 0.8, shade: true },
    { z: 2, x: 21.5, zz: 4.0, pre: 14, post: 46, cord: 0.7 },
    { z: 2, x: 21.8, zz: -4.4, pre: 11, post: 40, cord: 0.5, shade: true },
    { z: 3, x: -16, zz: -10.2, pre: 12, post: 50, shadow: true, shade: true, cord: 0.7 },
    { z: 3, x: -11.8, zz: -17.6, pre: 10, post: 40, cord: 0.9 },
  ];
  const warm = new THREE.Color(0xffc27a);
  for (const [i, b] of BULBS.entries()) {
    const g = new THREE.Group(); g.position.set(b.x, WALL_H, b.zz); dynGroup.add(g);
    const cordL = b.cord;
    const fix = [], shade = [];
    { const c = prep(new THREE.CylinderGeometry(0.006, 0.006, cordL, 5)); c.translate(0, -cordL / 2, 0); fix.push(c); }
    { const c = prep(new THREE.CylinderGeometry(0.025, 0.03, 0.08, 10)); c.translate(0, -cordL - 0.02, 0); fix.push(c); }
    { const c = prep(new THREE.CylinderGeometry(0.06, 0.06, 0.02, 10)); c.translate(0, -0.01, 0); fix.push(c); }
    if (b.shade) { const s = prep(new THREE.CylinderGeometry(0.05, 0.26, 0.16, 18, 1, true)); s.translate(0, -cordL - 0.06, 0); shade.push(s); }
    const fm = new THREE.Mesh(mergeGeometries(fix), rub); fm.castShadow = false; g.add(fm);
    if (shade.length) { const sm = new THREE.Mesh(mergeGeometries(shade), new THREE.MeshStandardMaterial({ color: 0x2c3528, roughness: 0.6, metalness: 0.5, side: THREE.DoubleSide })); sm.castShadow = true; g.add(sm); }
    const bulbMat = new THREE.MeshStandardMaterial({ color: 0x302a20, emissive: warm, emissiveIntensity: 0, roughness: 0.3 });
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.045, 12, 8), bulbMat); bulb.scale.y = 1.35; bulb.position.y = -cordL - 0.1; g.add(bulb);
    const light = new THREE.PointLight(warm, 0, 19, 2);
    light.position.y = -cordL - 0.12;
    if (b.shadow) {
      light.castShadow = true; light.shadow.autoUpdate = false; light.shadow.needsUpdate = true; light.shadow.mapSize.set(1024, 1024); light.shadow.bias = -0.004; light.shadow.normalBias = 0.03;
      light.shadow.camera.near = 0.15; light.shadow.camera.far = 15; light.shadow.radius = 3;
    }
    g.add(light);
    const e = { light, bulbMat, group: g, pre: b.pre, post: b.post, p: 0, powerAt: -1, seed: i * 7.31, zone: b.z, swayA: 0.02 + rng() * 0.03, swayP: rng() * 6 };
    lights.bulbs.push(e);
    powerables.push({ x: b.x, z: b.zz, set: (on, delay, instant) => { if (instant) { e.powerAt = on ? -2 : -1; e.p = on ? 1 : 0; } else e.powerAt = on ? delay : -1; } });
  }
  // emissive-only caged wall lamps that come on with power (per-zone material)
  const zoneLampMats = [0, 1, 2, 3].map(() => new THREE.MeshStandardMaterial({ color: 0x2a2620, emissive: warm, emissiveIntensity: 0, roughness: 0.4 }));
  const zoneLampState = [0, 1, 2, 3].map(() => ({ at: -1, p: 0 }));
  const WALL_LAMPS = [
    [0, -7.75, 2.35, -2.5, 1], [0, 7.75, 2.35, 3.2, -1], [1, -23.75, 2.35, -4.5, 1], [1, -8.25, 2.35, 4.2, -1],
    [2, 8.25, 2.35, -4.8, 1], [2, 25.75, 2.35, -6.2, -1], [3, -23.75, 2.35, -18.5, 1], [3, -8.25, 2.35, -12.5, -1],
  ];
  const cageGeos = [];
  for (const [z, x, y, zz, s] of WALL_LAMPS) {
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.07, 10, 8), zoneLampMats[z]); lamp.position.set(x + s * 0.12, y, zz); lamp.scale.set(0.8, 1.2, 0.8); dynGroup.add(lamp);
    const back = prep(new THREE.CylinderGeometry(0.09, 0.09, 0.04, 12)); xform(back, x + s * 0.02, y, zz, 0, 0, Math.PI / 2); cageGeos.push(back);
    for (let k = 0; k < 4; k++) { const bar = prep(new THREE.TorusGeometry(0.09, 0.006, 4, 10, Math.PI)); xform(bar, x + s * 0.03, y, zz, k * Math.PI / 4, s > 0 ? Math.PI / 2 : -Math.PI / 2, 0); cageGeos.push(bar); }
    powerables.push({ x, z: zz, set: (on, delay, instant) => { const st = zoneLampState[z]; if (instant) { st.at = on ? -2 : -1; st.p = on ? 1 : 0; } else st.at = on ? Math.max(st.at === -1 ? 0 : st.at, delay) : -1; } });
  }
  emit(mergeGeometries(cageGeos), rusty, 'walls', false);

  // ---- burning barrels ----
  const FIRES = [[-6.85, -5.85, 0], [25.05, -6.95, 2], [-22.85, -19.85, 3], [-1.6, 12.4, -1], [31.5, 4.5, -1], [-29, -15.5, -1]];
  const fireSpots = [];
  const flameGeos = [];
  for (const [x, z, zone] of FIRES) {
    const region = zone < 0 ? 'ext' : 'z' + zone;
    cyl('metal_rusty', region, x, 0.45, z, 0.29, 0.29, 0.9, 16, { open: true });
    cyl('metal_rusty', region, x, 0.02, z, 0.29, 0.29, 0.04, 16);
    for (const y of [0.18, 0.62, 0.88]) cyl('metal_rusty', region, x, y, z, 0.3, 0.3, 0.035, 16);
    // charred wood + embers inside
    for (let k = 0; k < 4; k++) box('wood_planks', region, x + (rng() - 0.5) * 0.2, 0.86 + rng() * 0.08, z + (rng() - 0.5) * 0.2, 0.5, 0.06, 0.07, { ry: rng() * 3, rz: (rng() - 0.5) * 0.6 });
    solid(x - 0.3, 0, z - 0.3, x + 0.3, 0.9, z + 0.3, 'metal');
    reserve(x, z, 0.6);
    const top = new THREE.Vector3(x, 0.95, z);
    fireSpots.push(top);
    const seed = rng() * 10;
    for (let k = 0; k < 3; k++) {
      const pl = new THREE.PlaneGeometry(0.62, 1.15, 1, 4);
      pl.translate(0, 0.575, 0);
      pl.rotateY(k * Math.PI / 3 + seed);
      pl.translate(x, 0.86, z);
      const n = pl.attributes.position.count;
      pl.setAttribute('aSeed', new THREE.BufferAttribute(new Float32Array(n).fill(seed + k * 3.7), 1));
      flameGeos.push(pl);
    }
    // interior fires + the one exterior fire seen through the south windows get a real light; the rest are emissive only
    if (zone >= 0 || lights.fires.every((f) => !f.ext)) {
      const light = new THREE.PointLight(0xff8a3a, 0, zone < 0 ? 14 : 15, 2);
      light.position.set(x, 1.55, z);
      root.add(light);
      lights.fires.push({ light, base: zone < 0 ? 20 : 26, seed, ext: zone < 0 });
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
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
  });
  const flames = new THREE.Mesh(mergeGeometries(flameGeos), flameMat); flames.frustumCulled = false; flames.renderOrder = 4; root.add(flames);

  // ---- light shafts (moon through ceiling holes + north / west windows) ----
  const Ld = MOON_DIR.clone().negate(); // travel direction
  const shaftGeos = [];
  function shaft(corners, len, strength) {
    // corners: 4 Vector3 of the opening rim (in order). Extrude along Ld by len; side quads only.
    for (let i = 0; i < 4; i++) {
      const a = corners[i], b = corners[(i + 1) % 4];
      const a2 = a.clone().addScaledVector(Ld, len), b2 = b.clone().addScaledVector(Ld, len);
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute([a.x, a.y, a.z, b.x, b.y, b.z, b2.x, b2.y, b2.z, a.x, a.y, a.z, b2.x, b2.y, b2.z, a2.x, a2.y, a2.z], 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 1, 1, 0, 0, 1, 1, 0, 1], 2));
      g.setAttribute('aStr', new THREE.Float32BufferAttribute(new Array(6).fill(strength), 1));
      shaftGeos.push(g);
    }
  }
  for (const h of HOLES) {
    const y = WALL_H + 0.35;
    shaft([new THREE.Vector3(h.x0, y, h.z0), new THREE.Vector3(h.x1, y, h.z0), new THREE.Vector3(h.x1, y, h.z1), new THREE.Vector3(h.x0, y, h.z1)], 7.5, 1.0);
  }
  for (const w of windows) {
    const n = w.normal; const lit = n.x * Ld.x + n.z * Ld.z;
    if (lit < 0.3) continue;
    const t = new THREE.Vector3(n.z, 0, -n.x);
    const c = w.center.clone().addScaledVector(n, -0.2);
    const cs = [[-WIN_W / 2, WIN_Y0], [WIN_W / 2, WIN_Y0], [WIN_W / 2, WIN_Y1], [-WIN_W / 2, WIN_Y1]].map(([u, y]) => c.clone().addScaledVector(t, u).setY(y));
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
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false,
  });
  const shafts = new THREE.Mesh(mergeGeometries(shaftGeos), shaftMat); shafts.frustumCulled = false; shafts.renderOrder = 6; root.add(shafts);

  // ---- ground mist (outside only) ----
  const mistTex = canvasTex(256, 256, (g) => {
    const id = g.createImageData(256, 256);
    const f = (x, y) => { let s = 0, a = 1, fr = 1 / 64; for (let o = 0; o < 4; o++) { s += a * (0.5 + 0.5 * Math.sin(x * fr * 6.3 + Math.sin(y * fr * 4.1) * 2) * Math.sin(y * fr * 5.7 + Math.cos(x * fr * 3.3) * 2)); a *= 0.5; fr *= 2; } return s / 1.9; };
    for (let y = 0; y < 256; y++) for (let x = 0; x < 256; x++) { const v = f(x, y); const i = (y * 256 + x) * 4; id.data[i] = id.data[i + 1] = id.data[i + 2] = 255; id.data[i + 3] = Math.max(0, Math.min(255, (v - 0.25) * 400)); }
    g.putImageData(id, 0, 0);
  }, false);
  mistTex.wrapS = mistTex.wrapT = THREE.RepeatWrapping;
  const mistMat = new THREE.ShaderMaterial({
    uniforms: { uTex: { value: mistTex }, uTime: { value: 0 }, uCol: { value: new THREE.Color(0x3e4a64) } },
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
    transparent: true, depthWrite: false, fog: false,
  });
  for (const [y, s] of [[0.22, 1]]) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(200, 200), mistMat);
    m.rotation.x = -Math.PI / 2; m.position.set(1, y, -6.5); m.scale.setScalar(s); m.renderOrder = 7; root.add(m);
  }

  // ---- per-frame lighting animation ----
  const hash = (n) => { const s = Math.sin(n * 127.1) * 43758.5453; return s - Math.floor(s); };
  let clock = 0, frameN = 0;
  const shadowBulbs = lights.bulbs.filter((e) => e.light.castShadow);
  updaters.push((dt, time) => {
    clock += dt; frameN++;
    // bulb shadow cubes refresh at half rate, alternating lights (6 faces each is the big shadow cost)
    shadowBulbs.forEach((e, i) => { if ((frameN + i) % 2 === 0 && e.light.intensity > 0.05) e.light.shadow.needsUpdate = true; });
    if (frameN % 2 === 1) moonLight.shadow.needsUpdate = true; // moon shadow at half rate
    flameMat.uniforms.uTime.value = time; shaftMat.uniforms.uTime.value = time; mistMat.uniforms.uTime.value = time;
    for (const f of lights.fires) {
      const n = 0.72 + 0.14 * Math.sin(time * 11 + f.seed) + 0.1 * Math.sin(time * 23.7 + f.seed * 2) + 0.06 * Math.sin(time * 5.3);
      f.light.intensity = f.base * n;
    }
    for (const e of lights.bulbs) {
      // power transition
      if (e.powerAt === -2) e.p = 1;
      else if (e.powerAt >= 0) {
        e.powerAt -= dt;
        if (e.powerAt < 0) { e.powerAt = -3; e.flick = 0.85; }
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
      if (st.at >= 0) { st.at -= dt; if (st.at < 0) { st.at = -3; st.fl = 0.9; } }
      else if (st.at === -3) { st.fl -= dt; st.p = st.fl > 0 ? (Math.random() < 0.5 ? 1 : 0) : 1; if (st.fl <= 0) st.at = -2; }
      else if (st.at === -2) st.p = 1; else st.p = 0;
      zoneLampMats[z].emissiveIntensity = st.p * 4.5;
    }
  });
  void features; void tween;
  lights.zoneLamps = zoneLampMats;
  return { lights, fireSpots };
}

