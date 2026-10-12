// UNBURIED — weapons: stat table, procedural gun models, first-person viewmodel system.
// Owner: weapons agent. Only relies on the contract API (T.mat / T.envMap, audio.play, fx.*, hooks.*).
//
// Model convention (world models from buildWeaponModel): +X forward (muzzle), +Y up, +Z = gun's right
// side, origin at the pistol grip / wrist, real-world scale in metres. Internally every gun is authored
// in millimetres inside a child group scaled 0.001 ("mm" group); moving parts are named sub-groups.

import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import {
  mergeGeometries,
  toCreasedNormals,
} from "three/addons/utils/BufferGeometryUtils.js";

const V3 = THREE.Vector3;
const D2R = Math.PI / 180;
const TAU = Math.PI * 2;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (t) => t * t * (3 - 2 * t);
const easeOut = (t) => 1 - Math.pow(1 - t, 3);
const easeInOut = (t) =>
  t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
const rand = (a = 0, b = 1) => a + Math.random() * (b - a);

// ======================================================================================
// Stat table
// ======================================================================================

export const WEAPONS = {
  m1911: {
    name: "M1911",
    upgradedName: "Hellfire .45",
    class: "pistol",
    cost: 0,
    magSize: 8,
    reserve: 80,
    damage: 40,
    headMul: 3,
    rpm: 420,
    auto: false,
    spread: 0.028,
    adsSpread: 0.004,
    range: 60,
    falloff: [12, 35, 0.6],
    reloadTime: 1.5,
    reloadEmpty: 1.9,
    sound: "shot_pistol",
    shell: "pistol",
    moveMul: 1.0,
    adsFov: 0.85,
    recoil: { back: 0.035, up: 0.09, roll: 0.05, cam: 0.018, camYaw: 0.006 },
    up: {
      magSize: 12,
      reserve: 120,
      damage: 110,
      headMul: 3,
      splash: { radius: 1.6, damage: 120 },
    },
  },
  kar98k: {
    name: "Kar98k",
    upgradedName: "Iron Verdict",
    class: "rifle",
    cost: 200,
    ammoCost: 100,
    magSize: 5,
    reserve: 50,
    damage: 100,
    headMul: 4,
    rpm: 60,
    auto: false,
    bolt: true,
    spread: 0.045,
    adsSpread: 0.0012,
    range: 150,
    falloff: [60, 150, 0.85],
    reloadTime: 3.1,
    sound: "shot_rifle",
    shell: "rifle",
    moveMul: 0.95,
    adsFov: 0.62,
    recoil: { back: 0.07, up: 0.13, roll: 0.06, cam: 0.035, camYaw: 0.01 },
    up: { magSize: 8, reserve: 60, damage: 320, headMul: 5 },
  },
  trench: {
    name: "M1897 Trench Gun",
    upgradedName: "Gravedigger",
    class: "shotgun",
    cost: 1500,
    ammoCost: 750,
    magSize: 6,
    reserve: 60,
    damage: 34,
    headMul: 1.5,
    rpm: 75,
    auto: false,
    pump: true,
    pellets: 8,
    spread: 0.075,
    adsSpread: 0.05,
    pelletSpread: 0.06,
    range: 30,
    falloff: [5, 18, 0.25],
    reloadTime: 0.55,
    sound: "shot_shotgun",
    shell: "shotgun",
    moveMul: 0.95,
    adsFov: 0.82,
    recoil: { back: 0.09, up: 0.2, roll: 0.08, cam: 0.05, camYaw: 0.014 },
    up: { magSize: 10, reserve: 80, damage: 95, headMul: 1.5 },
  },
  mp40: {
    name: "MP40",
    upgradedName: "Reaper's Toll",
    class: "smg",
    cost: 1000,
    ammoCost: 500,
    magSize: 32,
    reserve: 192,
    damage: 35,
    headMul: 2.5,
    rpm: 540,
    auto: true,
    spread: 0.04,
    adsSpread: 0.012,
    range: 55,
    falloff: [12, 35, 0.55],
    reloadTime: 2.2,
    reloadEmpty: 2.8,
    sound: "shot_smg",
    shell: "pistol",
    moveMul: 1.0,
    adsFov: 0.8,
    recoil: { back: 0.018, up: 0.028, roll: 0.03, cam: 0.0075, camYaw: 0.004 },
    up: { magSize: 64, reserve: 384, damage: 95, headMul: 2.5 },
  },
  thompson: {
    name: "Thompson M1A1",
    upgradedName: "Chicago Requiem",
    class: "smg",
    cost: 1200,
    ammoCost: 600,
    magSize: 20,
    reserve: 160,
    damage: 42,
    headMul: 2.5,
    rpm: 720,
    auto: true,
    spread: 0.045,
    adsSpread: 0.014,
    range: 55,
    falloff: [12, 35, 0.55],
    reloadTime: 2.3,
    reloadEmpty: 2.9,
    sound: "shot_smg2",
    shell: "pistol",
    moveMul: 1.0,
    adsFov: 0.8,
    recoil: { back: 0.02, up: 0.03, roll: 0.035, cam: 0.0085, camYaw: 0.005 },
    up: { magSize: 40, reserve: 320, damage: 110, headMul: 2.5 },
  },
  stg44: {
    name: "StG 44",
    upgradedName: "Storm Herald",
    class: "rifle_auto",
    cost: 1200,
    ammoCost: 600,
    magSize: 30,
    reserve: 180,
    damage: 48,
    headMul: 3,
    rpm: 560,
    auto: true,
    spread: 0.04,
    adsSpread: 0.006,
    range: 90,
    falloff: [25, 70, 0.7],
    reloadTime: 2.4,
    reloadEmpty: 3.0,
    sound: "shot_assault",
    shell: "rifle",
    moveMul: 0.95,
    adsFov: 0.74,
    recoil: { back: 0.024, up: 0.038, roll: 0.035, cam: 0.011, camYaw: 0.006 },
    up: { magSize: 60, reserve: 360, damage: 125, headMul: 3 },
  },
  mg42: {
    name: "MG 42",
    upgradedName: "Bonesaw",
    class: "lmg",
    cost: 0,
    magSize: 125,
    reserve: 500,
    damage: 55,
    headMul: 2.5,
    rpm: 1200,
    auto: true,
    spread: 0.055,
    adsSpread: 0.012,
    range: 110,
    falloff: [30, 90, 0.7],
    reloadTime: 5.0,
    sound: "shot_lmg",
    shell: "rifle",
    moveMul: 0.82,
    adsFov: 0.75,
    recoil: { back: 0.022, up: 0.03, roll: 0.03, cam: 0.009, camYaw: 0.007 },
    up: { magSize: 200, reserve: 800, damage: 140, headMul: 2.5 },
  },
  aether: {
    name: "Aether Pistol",
    upgradedName: "Aether Tempest",
    class: "wonder",
    cost: 0,
    magSize: 20,
    reserve: 160,
    damage: 1000,
    headMul: 1,
    rpm: 280,
    auto: false,
    projectile: true,
    splash: { radius: 2.6, damage: 350 },
    projSpeed: 55,
    spread: 0.02,
    adsSpread: 0.004,
    range: 120,
    falloff: [100, 120, 1],
    reloadTime: 2.2,
    sound: "shot_aether",
    shell: null,
    moveMul: 1.0,
    adsFov: 0.85,
    recoil: { back: 0.03, up: 0.07, roll: 0.04, cam: 0.014, camYaw: 0.005 },
    up: {
      magSize: 40,
      reserve: 200,
      damage: 2000,
      headMul: 1,
      splash: { radius: 3.2, damage: 700 },
    },
  },
};
export const KNIFE = { damage: 150, range: 2.2 };
export const GRENADE = { damage: 320, radius: 5.5, fuse: 3.2 };

/** Stats resolved for an upgraded/non-upgraded instance. */
export function weaponStats(id, upgraded = false) {
  const d = WEAPONS[id];
  if (!d) return null;
  return upgraded
    ? { ...d, ...d.up, name: d.upgradedName, upgraded: true }
    : { ...d, upgraded: false };
}

// ======================================================================================
// Materials
// ======================================================================================

const FALLBACK_COL = {
  gun_metal: 0x2a2d31,
  gun_metal_parkerized: 0x3a3b36,
  wood_stock: 0x5a3219,
  bakelite: 0x4a2618,
  brass: 0xb58a3a,
  leather: 0x4a3120,
  rubber_black: 0x151515,
  glove_leather: 0x4b3423,
  sleeve_olive: 0x4c4f32,
  packed_camo: 0x6a3a9a,
  metal_painted_green: 0x3f4a2e,
};
const _fallback = {};
function fallbackMat(name) {
  if (!_fallback[name]) {
    const metal = /metal|brass|camo/.test(name);
    _fallback[name] = new THREE.MeshStandardMaterial({
      color: FALLBACK_COL[name] ?? 0x777777,
      metalness: metal ? 0.85 : 0,
      roughness: metal ? 0.45 : 0.7,
    });
  }
  return _fallback[name];
}
function getMat(T, name) {
  let m = null;
  try {
    m = T && T.mat ? T.mat(name) : null;
  } catch (e) {
    m = null;
  }
  return m || fallbackMat(name);
}

function getMatO(T, name, over) {
  let m = null;
  try {
    m = T && T.mat ? T.mat(name, over) : null;
  } catch (e) {
    m = null;
  }
  if (!m) {
    m = fallbackMat(name).clone();
    if (over && over.color != null) m.color.setHex(over.color);
  }
  return m;
}
let _local = null;
function localMats() {
  if (_local) return _local;
  _local = {
    bore: new THREE.MeshStandardMaterial({
      color: 0x030303,
      roughness: 0.9,
      metalness: 0.2,
    }),
    copper: new THREE.MeshStandardMaterial({
      color: 0xb46a42,
      roughness: 0.32,
      metalness: 1,
    }),
    shell: new THREE.MeshStandardMaterial({
      color: 0x8a1d16,
      roughness: 0.55,
      metalness: 0,
    }),
    skin: new THREE.MeshStandardMaterial({
      color: 0x8a6048,
      roughness: 0.55,
      metalness: 0,
    }),
    glass: new THREE.MeshPhysicalMaterial({
      color: 0xd8f0e0,
      roughness: 0.05,
      metalness: 0,
      transparent: true,
      opacity: 0.28,
      clearcoat: 1,
      clearcoatRoughness: 0.05,
      depthWrite: false,
      side: THREE.DoubleSide,
    }),
    label: new THREE.MeshStandardMaterial({ color: 0xd9c9a0, roughness: 0.8 }),
    ring: new THREE.MeshStandardMaterial({
      color: 0x9aa0a4,
      roughness: 0.35,
      metalness: 1,
    }),
  };
  return _local;
}

/** Aether fluid & glow are per-model so reload glow ramps don't leak into world copies. */
function aetherMats(upgraded) {
  const c = upgraded ? 0x6fe8ff : 0x72ff4c;
  return {
    fluid: new THREE.MeshStandardMaterial({
      color: 0x113a0c,
      emissive: c,
      emissiveIntensity: 2.2,
      roughness: 0.2,
      transparent: true,
      opacity: 0.92,
    }),
    glow: new THREE.MeshStandardMaterial({
      color: 0x0a1a06,
      emissive: c,
      emissiveIntensity: 3.0,
      roughness: 0.4,
    }),
  };
}

function matSet(T, upgraded) {
  const camo = upgraded ? getMat(T, "packed_camo") : null;
  const L = localMats();
  return {
    main: camo || getMat(T, "gun_metal"),
    park: camo || getMat(T, "gun_metal_parkerized"),
    dark: getMat(T, "gun_metal"),
    darkPark: getMat(T, "gun_metal_parkerized"),
    wood: getMat(T, "wood_stock"),
    bake: getMat(T, "bakelite"),
    brass: getMat(T, "brass"),
    brassMain: camo || getMat(T, "brass"),
    leather: getMat(T, "leather"),
    rubber: getMat(T, "rubber_black"),
    green: getMat(T, "metal_painted_green"),
    ...L,
  };
}

// ======================================================================================
// Geometry helpers (all in millimetres, gun space: X fwd, Y up, Z right)
// ======================================================================================

function scaleUV(g, s) {
  const uv = g.attributes.uv;
  if (!uv || s === 1) return g;
  for (let i = 0; i < uv.count; i++)
    uv.setXY(i, uv.getX(i) * s, uv.getY(i) * s);
  uv.needsUpdate = true;
  return g;
}

/** Closed outline with optional per-corner fillet: pts = [[x,y,r?],...]. */
function roundedPath(pts, P = THREE.Shape) {
  const s = new P();
  const n = pts.length;
  for (let i = 0; i < n; i++) {
    const p = pts[i],
      r = p[2] || 0;
    if (!r) {
      i === 0 ? s.moveTo(p[0], p[1]) : s.lineTo(p[0], p[1]);
      continue;
    }
    const a = pts[(i - 1 + n) % n],
      b = pts[(i + 1) % n];
    const da = Math.hypot(a[0] - p[0], a[1] - p[1]) || 1,
      db = Math.hypot(b[0] - p[0], b[1] - p[1]) || 1;
    const ra = Math.min(r, da * 0.5),
      rb = Math.min(r, db * 0.5);
    const x1 = p[0] + ((a[0] - p[0]) / da) * ra,
      y1 = p[1] + ((a[1] - p[1]) / da) * ra;
    const x2 = p[0] + ((b[0] - p[0]) / db) * rb,
      y2 = p[1] + ((b[1] - p[1]) / db) * rb;
    i === 0 ? s.moveTo(x1, y1) : s.lineTo(x1, y1);
    s.quadraticCurveTo(p[0], p[1], x2, y2);
  }
  s.closePath();
  return s;
}

function M(parent, geo, mat) {
  const m = new THREE.Mesh(geo, mat);
  parent.add(m);
  return m;
}

/** Extruded side profile, centred on z. */
function ext(parent, pts, thick, mat, o = {}) {
  const shape = roundedPath(pts);
  if (o.holes) shape.holes = o.holes.map((h) => roundedPath(h, THREE.Path));
  const bt = Math.min(o.bevel ?? 1, thick * 0.45);
  const depth = Math.max(0.05, thick - 2 * bt);
  let g = new THREE.ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: bt > 0,
    bevelThickness: bt,
    bevelSize: bt,
    bevelOffset: -bt,
    bevelSegments: bt > 0 ? (o.bsegs ?? 3) : 0,
    curveSegments: o.curve ?? 8,
  });
  g.translate(0, 0, -depth / 2 + (o.z || 0));
  scaleUV(g, o.uv ?? 1 / 90);
  g = toCreasedNormals(g, o.crease ?? 0.62);
  g.clearGroups();
  return M(parent, g, mat);
}

/** Lathe around the X axis: prof = [[x, r], ...] traced rear->front along the outside. */
function lat(parent, prof, mat, o = {}) {
  const pts = prof.map(([x, r]) => new THREE.Vector2(Math.max(r, 0.0001), x));
  const g = new THREE.LatheGeometry(pts, o.segs ?? 28);
  g.rotateZ(-Math.PI / 2); // Y -> +X ; lathe radius in XZ -> YZ
  g.translate(0, o.y || 0, o.z || 0);
  scaleUV(g, 1);
  const m = M(parent, g, mat);
  return m;
}

function cyl(
  parent,
  x0,
  x1,
  r0,
  r1,
  mat,
  y = 0,
  z = 0,
  segs = 20,
  open = false,
) {
  const g = new THREE.CylinderGeometry(r1, r0, x1 - x0, segs, 1, open);
  g.rotateZ(-Math.PI / 2);
  g.translate((x0 + x1) / 2, y, z);
  return M(parent, g, mat);
}
function cylZ(parent, x, y, z0, z1, r, mat, segs = 14) {
  const g = new THREE.CylinderGeometry(r, r, Math.abs(z1 - z0), segs);
  g.rotateX(Math.PI / 2);
  g.translate(x, y, (z0 + z1) / 2);
  return M(parent, g, mat);
}
function cylY(parent, x, y0, y1, z, r0, r1, mat, segs = 16) {
  const g = new THREE.CylinderGeometry(r1, r0, y1 - y0, segs);
  g.translate(x, (y0 + y1) / 2, z);
  return M(parent, g, mat);
}
function box(parent, x, y, z, w, h, d, mat, r = 0.6) {
  const rr = Math.min(r, w / 2 - 0.01, h / 2 - 0.01, d / 2 - 0.01);
  const g =
    rr > 0.05
      ? new RoundedBoxGeometry(w, h, d, 2, rr)
      : new THREE.BoxGeometry(w, h, d);
  g.translate(x, y, z);
  return M(parent, g, mat);
}
function sph(
  parent,
  x,
  y,
  z,
  r,
  mat,
  sx = 1,
  sy = 1,
  sz = 1,
  ws = 16,
  hs = 12,
) {
  const g = new THREE.SphereGeometry(r, ws, hs);
  g.scale(sx, sy, sz);
  g.translate(x, y, z);
  return M(parent, g, mat);
}
/** Torus; axis = 'x'|'y'|'z' is the ring's normal. */
function tor(
  parent,
  x,
  y,
  z,
  R,
  r,
  mat,
  axis = "x",
  arc = TAU,
  rs = 10,
  ts = 28,
) {
  const g = new THREE.TorusGeometry(R, r, rs, ts, arc);
  if (axis === "x") g.rotateY(Math.PI / 2);
  else if (axis === "y") g.rotateX(Math.PI / 2);
  g.translate(x, y, z);
  return M(parent, g, mat);
}
function tube(parent, pts, r, mat, segs = 32, rad = 10) {
  const curve = new THREE.CatmullRomCurve3(
    pts.map((p) => new V3(p[0], p[1], p[2])),
  );
  const g = new THREE.TubeGeometry(curve, segs, r, rad, false);
  return M(parent, g, mat);
}

function part(parent, name, x = 0, y = 0, z = 0) {
  const g = new THREE.Group();
  g.name = name;
  g.position.set(x, y, z);
  g.userData.part = true;
  parent.add(g);
  return g;
}
function marker(parent, name, x, y, z, xAxis, yAxis, shape) {
  const o = new THREE.Object3D();
  o.name = name;
  o.position.set(x, y, z);
  o.userData.marker = true;
  if (xAxis && yAxis) {
    const X = new V3(...xAxis).normalize();
    const Y = new V3(...yAxis);
    Y.sub(X.clone().multiplyScalar(Y.dot(X))).normalize();
    const Z = new V3().crossVectors(X, Y);
    o.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(X, Y, Z));
  }
  if (shape) o.userData.shape = shape;
  parent.add(o);
  return o;
}
/** Right-hand pistol-grip frame: grip axis raked `deg` forward at the top. */
function gripAxes(deg) {
  const a = deg * D2R;
  return [
    [Math.cos(a), -Math.sin(a), 0],
    [Math.sin(a), Math.cos(a), 0],
  ];
}
/** Left hand under a horizontal handguard (palm below, fingers up the right side). */
const FOREGRIP_AXES = [
  [0, 1, 0],
  [1, 0, 0],
];
const FIST_R = {
  rx: 9,
  rz: 9,
  phiS: 70,
  phiE: -110,
  ys: [12, -3, -17, -30],
  thumb: { base: [-4, 16, -12], dir: [0.8, -0.3, 0.3] },
};

// 7.92x57 / .45 / 9mm cartridge (along +X from x0), returns group
function cartridge(parent, x0, y, z, mats, kind = "rifle") {
  const g = new THREE.Group();
  g.position.set(x0, y, z);
  parent.add(g);
  if (kind === "rifle") {
    lat(
      g,
      [
        [0, 0],
        [0, 5.9],
        [1.2, 5.9],
        [1.4, 5.1],
        [2.2, 5.1],
        [2.6, 5.9],
        [44, 5.5],
        [48, 4.6],
        [57, 4.4],
        [57, 0.1],
      ],
      mats.brass,
      { segs: 14 },
    );
    lat(
      g,
      [
        [56.5, 0],
        [56.5, 4.1],
        [66, 4.0],
        [74, 2.8],
        [80, 0.4],
        [80.3, 0],
      ],
      mats.copper,
      { segs: 14 },
    );
  } else if (kind === "pistol") {
    lat(
      g,
      [
        [0, 0],
        [0, 6],
        [1.2, 6],
        [1.4, 5.3],
        [2.4, 5.3],
        [2.8, 6],
        [22, 5.9],
        [22, 0.1],
      ],
      mats.brass,
      { segs: 14 },
    );
    lat(
      g,
      [
        [21.5, 0],
        [21.5, 5.7],
        [26, 5.5],
        [30, 4],
        [32.5, 1.5],
        [33, 0],
      ],
      mats.copper,
      { segs: 14 },
    );
  } else if (kind === "shotgun") {
    lat(
      g,
      [
        [0, 0],
        [0, 11.2],
        [1.4, 11.2],
        [1.6, 10.3],
        [14, 10.3],
        [14, 0.1],
      ],
      mats.brass,
      { segs: 16 },
    );
    lat(
      g,
      [
        [13.5, 0],
        [13.5, 10.1],
        [64, 10.1],
        [65.5, 8.5],
        [65.6, 0],
      ],
      mats.shell,
      { segs: 16 },
    );
  }
  return g;
}

/**
 * Merge static meshes per part per material to cut draw calls. Parts (userData.part) and markers
 * stay as live children; everything else under a part collapses into one mesh per material.
 */
function optimize(node) {
  const buckets = new Map();
  const keep = [];
  const tmp = new THREE.Matrix4();
  const walk = (o, mat4) => {
    for (const c of [...o.children]) {
      if (c.userData.part) {
        keep.push(c);
        optimize(c);
        continue;
      }
      if (c.userData.marker || c.userData.keep) {
        keep.push(c);
        continue;
      }
      c.updateMatrix();
      const m = new THREE.Matrix4().multiplyMatrices(mat4, c.matrix);
      if (c.isMesh) {
        let g = c.geometry.index
          ? c.geometry.toNonIndexed()
          : c.geometry.clone();
        for (const k of Object.keys(g.attributes))
          if (!["position", "normal", "uv"].includes(k)) g.deleteAttribute(k);
        if (!g.attributes.uv)
          g.setAttribute(
            "uv",
            new THREE.BufferAttribute(
              new Float32Array(g.attributes.position.count * 2),
              2,
            ),
          );
        g.clearGroups();
        g.applyMatrix4(m);
        if (m.determinant() < 0) {
          // flip winding for mirrored pieces
          const p = g.attributes.position,
            n = g.attributes.normal,
            u = g.attributes.uv;
          for (let i = 0; i < p.count; i += 3)
            for (const a of [p, n, u]) {
              const s = a.itemSize;
              for (let k = 0; k < s; k++) {
                const t = a.array[(i + 1) * s + k];
                a.array[(i + 1) * s + k] = a.array[(i + 2) * s + k];
                a.array[(i + 2) * s + k] = t;
              }
            }
        }
        if (!buckets.has(c.material)) buckets.set(c.material, []);
        buckets.get(c.material).push(g);
      }
      if (c.children.length) walk(c, m);
    }
  };
  tmp.identity();
  walk(node, tmp);
  for (const c of [...node.children]) node.remove(c);
  for (const [mat, geos] of buckets) {
    const merged = mergeGeometries(geos, false);
    if (!merged) continue;
    const mesh = new THREE.Mesh(merged, mat);
    mesh.name = node.name + "_" + (mat.name || "mat");
    node.add(mesh);
  }
  for (const k of keep) node.add(k);
}

// ======================================================================================
// Model builders. Each returns { origin:[x,y,z] (mm, the grip), view:{...} }
// ======================================================================================

function buildM1911(g, m) {
  // ---- frame
  ext(
    g,
    [
      [-34, 47, 3],
      [-12, 47],
      [174, 47],
      [178, 44, 2],
      [178, 33, 2],
      [93, 33],
      [93, 14, 7],
      [86, 5, 5],
      [50, 5],
      [40, 11, 5],
      [34, 22, 3],
      [12, -47, 4],
      [-6, -52, 3],
      [-37, -52, 4],
      [-40, -44, 2],
      [-19, 22],
      [-17, 36, 6],
      [-35, 41, 4],
    ],
    19,
    m.main,
    {
      bevel: 1.2,
      holes: [
        [
          [46, 13, 4],
          [84, 13, 4],
          [87, 31, 2],
          [44, 31, 2],
        ],
      ],
    },
  );
  // grip safety tongue + mainspring housing lines
  box(g, -39, -10, 0, 3, 60, 16, m.dark, 1).rotation.z = -17 * D2R;
  // grip panels (checkered walnut) + screws
  for (const s of [-1, 1]) {
    ext(
      g,
      [
        [-15, 32, 7],
        [28, 32, 7],
        [8, -44, 7],
        [-32, -44, 7],
      ],
      3.4,
      m.wood,
      { z: s * 10.6, bevel: 1.2, uv: 1 / 60 },
    );
    cylZ(g, 13, 22, s * 12, s * 12.9, 3.1, m.dark);
    cylZ(g, -13, -30, s * 12, s * 12.9, 3.1, m.dark);
  }
  // thumb safety, slide stop, mag catch, plunger tube (left side)
  ext(
    g,
    [
      [-14, 46],
      [2, 46],
      [12, 48.5, 2],
      [13, 53, 2],
      [-14, 53],
    ],
    2.6,
    m.dark,
    { z: -10.9, bevel: 0.6 },
  );
  ext(
    g,
    [
      [24, 39, 3],
      [40, 40],
      [55, 44, 3],
      [55, 49, 2],
      [24, 48, 3],
    ],
    3,
    m.dark,
    { z: -11.2, bevel: 0.6 },
  );
  cylZ(g, 30, 44, -12, -13.6, 3.2, m.dark);
  cylZ(g, 38, 22, -9.4, -11.6, 4.6, m.dark);
  cyl(g, -3, 20, 2.6, 2.6, m.dark, 49.5, -10.2, 10);
  // lanyard loop
  tor(g, -33, -54, 0, 4, 1.1, m.dark, "z");
  // barrel (visible at muzzle & through port)
  cyl(g, 30, 186, 7, 7, m.main, 62, 0, 20);
  cyl(g, 186, 186.6, 5.6, 5.6, m.bore, 62, 0, 16);
  box(g, 52, 62, 10.6, 38, 8, 2, m.main, 0.6); // chamber hood seen in port

  // ---- slide (moving)
  const slide = part(g, "slide");
  ext(
    slide,
    [
      [-28, 44],
      [183, 44],
      [183, 71, 2.5],
      [180, 74, 1.5],
      [-22, 74, 1.5],
      [-28, 68, 4],
    ],
    23,
    m.main,
    { bevel: 1.6 },
  );
  for (let i = 0; i < 9; i++)
    box(slide, -24 + i * 2.7, 58, 0, 1.1, 21, 23.5, m.dark, 0.2);
  box(slide, 52, 62, 11.2, 44, 12, 1.4, m.bore, 0.3); // ejection port
  lat(
    slide,
    [
      [180, 7.3],
      [181, 9.9],
      [186, 9.9],
      [186.5, 7.3],
    ],
    m.main,
    { y: 62, segs: 24 },
  );
  lat(
    slide,
    [
      [181, 0],
      [181, 6.4],
      [185.5, 6.4],
      [186.5, 5],
      [186.6, 0],
    ],
    m.main,
    { y: 50, segs: 18 },
  );
  box(slide, 170, 76, 0, 5, 5.2, 3.2, m.dark, 0.5); // front sight blade
  box(slide, -17, 74.7, 0, 8, 2, 16, m.dark, 0.4); // rear sight base
  for (const s of [-1, 1])
    box(slide, -17, 76.2, s * 5.4, 7, 4.4, 5, m.dark, 0.4); // rear ears (notch between)

  // ---- hammer, trigger, mag
  const ham = part(g, "hammer", -22, 52, 0);
  ext(
    ham,
    [
      [-3, -4],
      [4, -4, 2],
      [3, 10],
      [-1, 17, 2],
      [-9, 21, 3],
      [-12, 17, 2],
      [-6, 10],
    ],
    7,
    m.dark,
    { bevel: 0.8 },
  );
  ham.rotation.z = 0.45;
  const trig = part(g, "trigger", 52, 26, 0);
  ext(
    trig,
    [
      [-5, 5],
      [3, 5],
      [5, -9, 2],
      [0, -12, 2],
      [-4, -8],
    ],
    7,
    m.dark,
    { bevel: 0.8 },
  );
  marker(trig, "trigTip", 5, -4, 0);

  const mag = part(g, "mag", -15.5, -52, 0);
  mag.rotation.z = -17 * D2R;
  box(mag, 0, 51, 0, 30, 100, 13, m.dark, 1);
  box(mag, 0, -1.5, 0, 35, 5, 17, m.dark, 1.5);
  cartridge(mag, -14, 99, 0, m, "pistol");
  marker(mag, "hL_mag", 2, 10, -3, [0, 0, 1], [0, 1, 0], {
    rx: 18,
    rz: 10,
    phiS: 100,
    phiE: -80,
    ys: [18, 4, -10, -23],
    mirror: true,
  });

  // ---- markers
  marker(g, "muzzle", 188, 62, 0);
  marker(g, "eject", 55, 66, 12);
  marker(g, "sightRear", -17, 78.4, 0);
  marker(g, "sightFront", 170, 78.6, 0);
  const [gx, gy] = gripAxes(17);
  marker(g, "hR", 0, 0, 0, gx, gy, {
    rx: 25,
    rz: 13.5,
    phiS: 58,
    phiE: -112,
    ys: [24, 5, -13, -30],
    trigger: "trigTip",
    thumb: { base: [-12, 27, -19], dir: [1, 0.2, 0.08] },
  });
  // support hand: palm on the left panel, fingers wrap the front over the shooting hand
  marker(g, "hL", 6, -9, -2, [0, 0, 1], gy, {
    rx: 25,
    rz: 42,
    phiS: 92,
    phiE: -55,
    ys: [14, -2, -18, -32],
    mirror: true,
    fdy: 0,
    thumb: { base: [-27, 20, 26], dir: [0.1, 0.25, 1] },
    wrist: [-60, -24, 20],
  });
  return { origin: [0, 0, 0] };
}

function buildKar98k(g, m) {
  const BY = 42; // bore height
  // ---- stock (walnut): butt, wrist/grip, fore-end as overlapping extrusions
  ext(
    g,
    [
      [-302, 4, 6],
      [-150, 12],
      [-70, 16],
      [-40, 19],
      [-30, -44, 10],
      [-60, -60],
      [-302, -130, 8],
    ],
    44,
    m.wood,
    { bevel: 7, uv: 1 / 200 },
  );
  ext(
    g,
    [
      [-80, 14],
      [-40, 20, 10],
      [10, 28, 4],
      [40, 30],
      [40, -18],
      [18, -22, 6],
      [2, -26],
      [-12, -44, 8],
      [-30, -54, 10],
      [-70, -62],
      [-90, -58],
    ],
    34,
    m.wood,
    { bevel: 6, uv: 1 / 200 },
  );
  ext(
    g,
    [
      [20, 30],
      [228, 30],
      [260, 34],
      [300, 34],
      [650, 34, 4],
      [652, 16, 4],
      [645, -2, 6],
      [300, -12],
      [160, -18, 8],
      [140, -26],
      [60, -26],
      [40, -22],
      [20, -24],
    ],
    38,
    m.wood,
    { bevel: 6, uv: 1 / 200 },
  );
  // upper handguard
  ext(
    g,
    [
      [300, 42],
      [548, 42],
      [548, 57, 7],
      [310, 57, 7],
    ],
    32,
    m.wood,
    { bevel: 7, uv: 1 / 200 },
  );
  // butt plate + stock disc
  ext(
    g,
    [
      [-306, 6, 2],
      [-298, 6],
      [-298, -132],
      [-306, -132, 2],
    ],
    46,
    m.dark,
    { bevel: 2 },
  );
  cylZ(g, -205, -52, 21, 22.8, 12, m.dark, 20);
  cylZ(g, -205, -52, 22.5, 23.2, 4, m.bore, 10);
  // ---- receiver
  lat(
    g,
    [
      [-8, 0],
      [-8, 13],
      [8, 15.5],
      [72, 15.5],
      [74, 12],
    ],
    m.main,
    { y: BY, segs: 28 },
  ); // rear bridge
  box(g, 64, BY + 18, 0, 10, 6, 18, m.main, 1); // clip guide
  box(g, 64, BY + 20, 0, 6, 3, 10, m.bore, 0.3);
  for (const s of [-1, 1])
    ext(
      g,
      [
        [70, 26],
        [162, 26],
        [162, s < 0 ? 58 : 50, 3],
        [70, s < 0 ? 58 : 50, 3],
      ],
      3.5,
      m.main,
      { z: s * 12.5, bevel: 1 },
    );
  box(g, 116, 28, 0, 92, 4, 26, m.main, 1);
  lat(
    g,
    [
      [160, 12],
      [160, 17.5],
      [228, 17.5],
      [230, 15],
    ],
    m.main,
    { y: BY, segs: 28 },
  ); // receiver ring
  // ---- barrel (stepped contour)
  lat(
    g,
    [
      [228, 14.8],
      [292, 14.8],
      [296, 13.4],
      [420, 12.6],
      [424, 11.6],
      [600, 10.4],
      [604, 9.8],
      [800, 8.8],
      [812, 8.8],
      [818, 8.2],
      [818, 4],
    ],
    m.main,
    { y: BY, segs: 28 },
  );
  cyl(g, 817.8, 818.3, 4, 4, m.bore, BY, 0, 14);
  // rear sight: base, ramp leaf, slider, notch
  box(g, 272, BY + 16, 0, 44, 8, 22, m.main, 2);
  ext(
    g,
    [
      [250, BY + 18],
      [300, BY + 18],
      [300, BY + 21],
      [258, BY + 22.5],
      [250, BY + 22.5],
    ],
    14,
    m.main,
    { bevel: 0.8 },
  );
  box(g, 268, BY + 22, 0, 9, 5, 16, m.dark, 0.8);
  for (const s of [-1, 1])
    box(g, 253, BY + 23.5, s * 4, 4, 3.5, 5, m.dark, 0.3);
  // front sight + hood
  box(g, 800, BY + 11, 0, 20, 5, 16, m.main, 1.5);
  box(g, 803, BY + 17, 0, 3.5, 8, 2.4, m.dark, 0.3);
  const hood = new THREE.CylinderGeometry(
    11,
    11,
    22,
    20,
    1,
    true,
    -Math.PI * 0.6,
    Math.PI * 1.2,
  );
  hood.rotateZ(-Math.PI / 2);
  hood.translate(802, BY + 13, 0);
  M(g, hood, m.main);
  // bands, nose cap, bayonet lug, cleaning rod
  for (const [x, w] of [
    [548, 10],
    [600, 8],
  ]) {
    box(g, x, 24, 0, w, 4, 44, m.main, 1);
    box(g, x, -8.5, 0, w, 4, 40, m.main, 1);
    for (const s of [-1, 1])
      box(g, x, 24 + (s < 0 ? -16 : 16) * 0, s * 20.5, w, 64, 3, m.main, 1);
    box(g, x, 58, 0, w, 3, 30, m.main, 1);
  }
  box(g, 648, 20, 0, 18, 42, 40, m.main, 5); // nose cap
  box(g, 670, 12, 0, 40, 9, 12, m.main, 1.5); // bayonet lug
  cyl(g, 640, 690, 3.2, 3.2, m.main, 26, 0, 10);
  sph(g, 690, 26, 0, 4.4, m.main);
  // sling swivel on lower band (left) and sling slot washer (butt)
  tor(g, 548, 18, -24, 7, 1.4, m.dark, "z");
  box(g, -160, -58, 0, 34, 12, 45, m.bore, 4);
  // ---- trigger guard & floorplate
  ext(
    g,
    [
      [4, -18],
      [150, -18],
      [150, -28, 3],
      [70, -28],
      [62, -30, 4],
      [58, -46, 8],
      [10, -46, 10],
      [0, -30, 4],
    ],
    14,
    m.main,
    {
      bevel: 1,
      holes: [
        [
          [14, -38, 6],
          [52, -38, 6],
          [56, -24],
          [8, -24],
        ],
      ],
    },
  );
  const trig = part(g, "trigger", 30, -20, 0);
  ext(
    trig,
    [
      [-3, 2],
      [3, 2],
      [5, -10, 3],
      [1, -18, 3],
      [-2, -18],
    ],
    5,
    m.dark,
    { bevel: 0.8 },
  );
  marker(trig, "trigTip", 3, -13, 0);
  // ---- bolt (rotates about bore axis, slides along X)
  const bolt = part(g, "bolt", -44, BY, 0);
  lat(
    bolt,
    [
      [0, 0],
      [0, 9],
      [6, 12],
      [30, 12.5],
      [34, 10],
      [36, 9.2],
    ],
    m.main,
    { segs: 22 },
  ); // shroud
  box(bolt, 18, 14, 0, 12, 7, 5, m.main, 1); // safety flag
  lat(
    bolt,
    [
      [35, 9.3],
      [214, 9.3],
      [214, 4],
    ],
    m.main,
    { segs: 22 },
  ); // body
  box(bolt, 120, 0, -9, 90, 4, 2, m.dark, 0.5); // extractor
  const handle = new THREE.Group();
  handle.position.set(56, 0, 0);
  bolt.add(handle);
  tube(
    handle,
    [
      [0, 0, 8],
      [0, -5, 20],
      [-4, -15, 29],
      [-9, -25, 33],
    ],
    4.4,
    m.main,
    16,
    10,
  );
  sph(handle, -11, -29, 34, 8, m.main, 1, 1.15, 1);
  marker(bolt, "hR_bolt", 45, -29, 34, [1, 0, 0.2], [0.28, 0.74, -0.66], {
    rx: 8,
    rz: 8,
    phiS: 70,
    phiE: -110,
    ys: [6, -9, -23, -35],
    thumb: { base: [-4, 14, -12], dir: [0.9, 0.3, 0.2] },
    wrist: [-44, -48, 15],
  });
  // ---- stripper clip w/ 5 rounds (reload only)
  const clip = part(g, "clip", 66, BY + 22, 0);
  clip.userData.restVis = false;
  box(clip, 2, 30, 0, 3, 62, 13, m.dark, 0.5);
  const rounds = part(clip, "clipRounds");
  for (let i = 0; i < 5; i++)
    cartridge(rounds, 3, 6 + i * 11.8, i % 2 ? 0.6 : -0.6, m, "rifle");
  marker(clip, "hR_clip", 30, 40, 14, [0, 0, -1], [1, 0.3, 0], {
    rx: 12,
    rz: 10,
    phiS: 70,
    phiE: -110,
    ys: [12, -3, -17, -29],
    thumb: { base: [-8, 14, -14], dir: [0.8, 0.4, 0.2] },
    wrist: [-50, -50, 10],
  });
  marker(rounds, "hR_push", 34, 84, 10, [0, -1, 0.15], [1, 0, 0], {
    ...FIST_R,
    wrist: [20, -60, 55],
  });
  // ---- markers
  marker(g, "muzzle", 822, BY, 0);
  marker(g, "eject", 110, BY + 12, 14);
  marker(g, "sightRear", 253, BY + 24.7, 0);
  marker(g, "sightFront", 803, BY + 20.9, 0);
  const [gx, gy] = gripAxes(52);
  marker(g, "hR", -20, -22, 0, gx, gy, {
    rx: 20,
    rz: 16,
    phiS: 58,
    phiE: -112,
    ys: [26, 8, -9, -25],
    trigger: "trigTip",
    thumb: { base: [-18, 34, -13], dir: [0.45, 1, 0.1] },
    wrist: [-42, -52, 12],
  });
  marker(g, "hL", 390, 20, 0, FOREGRIP_AXES[0], FOREGRIP_AXES[1], {
    rx: 30,
    rz: 19,
    phiS: 160,
    phiE: 32,
    ys: [30, 10, -10, -28],
    mirror: true,
    fdy: 0,
    thumb: { base: [-18, 34, -22], dir: [0.15, 1, 0.1] },
    wrist: [-60, -32, 8],
  });
  return { origin: [-20, -22, 0] };
}

function buildTrench(g, m) {
  const BY = 40;
  // ---- receiver
  ext(
    g,
    [
      [0, 58, 4],
      [158, 58, 4],
      [188, 54, 6],
      [196, 26],
      [182, 3, 6],
      [22, 3],
      [4, 12],
      [0, 22],
    ],
    34,
    m.main,
    { bevel: 1.8 },
  );
  box(g, 92, 45, 16.6, 96, 20, 1.4, m.bore, 0.5); // ejection port (right)
  box(g, 108, 7, 0, 70, 3, 22, m.bore, 0.5); // loading port (bottom)
  for (const s of [-1, 1])
    for (const x of [30, 150]) cylZ(g, x, 20, s * 16.5, s * 17.6, 3, m.dark);
  // tangs + trigger guard
  ext(
    g,
    [
      [-60, 38],
      [4, 50],
      [4, 40],
      [-60, 30],
    ],
    18,
    m.main,
    { bevel: 1 },
  );
  ext(
    g,
    [
      [0, 4],
      [60, 4],
      [58, -6, 4],
      [48, -28, 10],
      [10, -28, 10],
      [0, -8, 4],
    ],
    12,
    m.main,
    {
      bevel: 1,
      holes: [
        [
          [12, -20, 6],
          [46, -20, 6],
          [50, 0],
          [8, 0],
        ],
      ],
    },
  );
  const trig = part(g, "trigger", 28, 2, 0);
  ext(
    trig,
    [
      [-3, 2],
      [3, 2],
      [5, -10, 3],
      [1, -18, 3],
      [-2, -18],
    ],
    5,
    m.dark,
    { bevel: 0.8 },
  );
  marker(trig, "trigTip", 3, -13, 0);
  // hammer (exposed)
  const ham = part(g, "hammer", 6, 32, 0);
  ext(
    ham,
    [
      [-4, -6],
      [5, -6],
      [4, 22],
      [-6, 32, 3],
      [-16, 34, 3],
      [-14, 28],
      [-6, 22],
    ],
    9,
    m.dark,
    { bevel: 1 },
  );
  // ---- stock (straight grip)
  ext(
    g,
    [
      [4, 50],
      [-40, 38, 12],
      [-330, 5, 6],
      [-330, -112, 6],
      [-120, -40, 20],
      [-40, -12, 10],
      [4, -6],
    ],
    40,
    m.wood,
    { bevel: 8, uv: 1 / 200 },
  );
  ext(
    g,
    [
      [-336, 7, 3],
      [-328, 7],
      [-328, -114],
      [-336, -114, 3],
    ],
    42,
    m.rubber,
    { bevel: 3 },
  );
  tor(g, -250, -80, 0, 7, 1.4, m.dark, "z");
  // ---- barrel + mag tube
  lat(
    g,
    [
      [190, 13],
      [206, 13],
      [210, 12],
      [700, 11],
      [704, 10.4],
      [704, 9],
    ],
    m.main,
    { y: BY, segs: 26 },
  );
  cyl(g, 703.5, 704.2, 9, 9, m.bore, BY, 0, 16);
  sph(g, 694, BY + 11.5, 0, 2.2, m.brass); // bead
  lat(
    g,
    [
      [190, 11.5],
      [640, 11.5],
      [646, 10.5],
      [652, 8],
    ],
    m.main,
    { y: 13, segs: 22 },
  );
  // heat shield (perforated, open underneath)
  const holes = heatShieldAlpha();
  const hsMat = m.main.clone ? m.main.clone() : m.main;
  hsMat.alphaMap = holes;
  hsMat.alphaTest = 0.5;
  hsMat.side = THREE.DoubleSide;
  hsMat.transparent = false;
  const hs = new THREE.CylinderGeometry(
    19.5,
    19.5,
    400,
    34,
    1,
    true,
    Math.PI * 0.25,
    Math.PI * 1.5,
  );
  hs.rotateZ(-Math.PI / 2);
  hs.translate(435, BY + 1, 0);
  M(g, hs, hsMat).userData.keep = true;
  g.children[g.children.length - 1].userData.keep = true;
  for (const x of [232, 632]) {
    const ring = new THREE.CylinderGeometry(
      21,
      21,
      12,
      34,
      1,
      true,
      Math.PI * 0.2,
      Math.PI * 1.6,
    );
    ring.rotateZ(-Math.PI / 2);
    ring.translate(x, BY + 1, 0);
    M(g, ring, m.main);
  }
  // bayonet adapter + lug + swivel
  lat(
    g,
    [
      [650, 12],
      [650, 15],
      [690, 15],
      [692, 12.5],
    ],
    m.main,
    { y: BY, segs: 24 },
  );
  box(g, 672, 22, 0, 40, 30, 22, m.main, 4);
  box(g, 680, 3, 0, 36, 8, 10, m.main, 1.5);
  tor(g, 660, 2, 0, 7, 1.4, m.dark, "z");
  // ---- pump (moving): corncob fore-end on the mag tube + action bar
  const pump = part(g, "pump");
  const prof = [
    [262, 12],
    [262, 17],
  ];
  for (let i = 0; i < 12; i++) {
    const x = 266 + i * 15;
    prof.push([x, 20], [x + 7, 22.5], [x + 12, 20]);
  }
  prof.push([448, 17], [450, 12]);
  lat(pump, prof, m.wood, { y: 13, segs: 30 });
  cyl(pump, 150, 266, 3.2, 3.2, m.main, 16, -12, 10);
  const bolt = part(g, "bolt");
  box(bolt, 70, 47, 0, 120, 18, 28, m.main, 2);
  box(bolt, 12, 47, 0, 8, 16, 26, m.main, 1.5);
  marker(pump, "hL", 360, 13, 0, FOREGRIP_AXES[0], FOREGRIP_AXES[1], {
    rx: 24,
    rz: 22,
    phiS: 158,
    phiE: 32,
    ys: [30, 10, -10, -28],
    mirror: true,
    fdy: 0,
    thumb: { base: [-10, 30, -28], dir: [0.2, 1, 0.1] },
    wrist: [-58, -34, 10],
  });
  // shell for reload loop
  const shell = part(g, "shell", 90, 6, 0);
  shell.userData.restVis = false;
  cartridge(shell, 0, 0, 0, m, "shotgun");
  marker(shell, "hL_shell", -8, -14, 0, [0, 1, 0], [1, 0, 0.1], {
    rx: 12,
    rz: 11,
    phiS: 130,
    phiE: -40,
    ys: [18, 2, -13, -26],
    mirror: true,
    thumb: { base: [4, 8, -16], dir: [0.3, 1, 0.3] },
  });
  // ---- markers
  marker(g, "muzzle", 708, BY, 0);
  marker(g, "eject", 92, 48, 18);
  marker(g, "sightRear", 30, 68, 0);
  marker(g, "sightFront", 694, BY + 21, 0);
  const [gx, gy] = gripAxes(62);
  marker(g, "hR", -40, 14, 0, gx, gy, {
    rx: 21,
    rz: 18,
    phiS: 58,
    phiE: -112,
    ys: [26, 7, -10, -26],
    trigger: "trigTip",
    thumb: { base: [-16, 36, -15], dir: [0.3, 1, 0.1] },
    wrist: [-40, -58, 14],
  });
  return { origin: [-40, 14, 0] };
}

function buildMP40(g, m) {
  const TY = 66;
  // receiver tube, end cap, barrel nut, barrel
  lat(
    g,
    [
      [-118, 0],
      [-118, 12],
      [-114, 18.5],
      [-104, 18.5],
      [-102, 17],
      [190, 17],
      [192, 19.5],
      [214, 19.5],
      [216, 14],
    ],
    m.main,
    { y: TY, segs: 32 },
  );
  lat(
    g,
    [
      [214, 10.2],
      [300, 10.2],
      [304, 9.6],
      [404, 9.6],
      [406, 11],
      [420, 11],
      [421, 6],
    ],
    m.main,
    { y: TY - 2, segs: 26 },
  );
  cyl(g, 420.5, 421.2, 5.5, 5.5, m.bore, TY - 2, 0, 16);
  // barrel rest bar (Laufhalter)
  ext(
    g,
    [
      [300, TY - 12],
      [372, TY - 12],
      [372, TY - 26, 3],
      [352, TY - 30, 4],
      [340, TY - 22],
      [300, TY - 22],
    ],
    12,
    m.bake,
    { bevel: 2 },
  );
  // front sight: base, post, hood
  box(g, 398, TY + 13, 0, 14, 18, 10, m.main, 1.5);
  box(g, 400, TY + 25, 0, 3, 9, 2.2, m.dark, 0.3);
  tor(g, 400, TY + 24, 0, 9, 1.6, m.main, "x", Math.PI * 1.25).rotation.x =
    -Math.PI * 0.125;
  // rear sight (flip leaves)
  box(g, -38, TY + 19.5, 0, 22, 7, 16, m.main, 1.5);
  for (const s of [-1, 1]) box(g, -40, TY + 27, s * 5, 3, 9, 5, m.dark, 0.4);
  // ejection port
  box(g, 92, TY + 2, 16.2, 40, 14, 2, m.bore, 2);
  // lower frame (bakelite) + grip
  ext(
    g,
    [
      [-100, TY - 8],
      [94, TY - 8],
      [94, 34, 4],
      [30, 30],
      [20, 30],
      [-10, 30],
      [-26, 30],
      [-100, 40, 8],
    ],
    30,
    m.bake,
    { bevel: 3, uv: 1 / 80 },
  );
  ext(
    g,
    [
      [-30, 36],
      [22, 36],
      [10, -54, 8],
      [-44, -58, 10],
    ],
    30,
    m.bake,
    { bevel: 5, uv: 1 / 80 },
  );
  // trigger guard (steel)
  ext(
    g,
    [
      [18, 30],
      [74, 30],
      [74, 24, 3],
      [66, 12, 6],
      [24, 12, 6],
      [18, 22],
    ],
    10,
    m.main,
    {
      bevel: 1,
      holes: [
        [
          [26, 16, 3],
          [64, 16, 3],
          [68, 26],
          [22, 26],
        ],
      ],
    },
  );
  const trig = part(g, "trigger", 38, 32, 0);
  ext(
    trig,
    [
      [-3, 2],
      [3, 2],
      [4, -9, 2],
      [0, -14, 2],
      [-2, -14],
    ],
    5,
    m.dark,
    { bevel: 0.8 },
  );
  marker(trig, "trigTip", 3, -10, 0);
  // magazine housing (ribbed)
  ext(
    g,
    [
      [92, TY - 10],
      [148, TY - 10],
      [148, -4, 3],
      [92, -4, 3],
    ],
    32,
    m.main,
    { bevel: 1.5 },
  );
  for (const x of [98, 142]) box(g, x, 20, 0, 4, 44, 34, m.main, 1);
  cylZ(g, 120, TY - 20, -16, -19, 5, m.dark);
  // charging handle (left) slot + knob
  box(g, 10, TY + 4, -16.2, 200, 5, 2, m.bore, 1.5);
  const ch = part(g, "charge", -60, TY + 4, 0);
  cyl(ch, -4, 4, 5, 5, m.main, 0, -20).rotation.x = Math.PI / 2;
  cylZ(ch, 0, 0, -16, -34, 4.2, m.main);
  sph(ch, 0, 0, -36, 6.5, m.main, 1, 1, 0.7);
  marker(ch, "hL_charge", 0, -14, -36, [0.1, 1, 0.3], [1, 0, 0], {
    rx: 8,
    rz: 8,
    phiS: 110,
    phiE: -60,
    ys: [10, -4, -18, -30],
    mirror: true,
    thumb: { base: [-8, 14, -12], dir: [0.8, 0.3, 0.2] },
  });
  // folding stock (extended): hinge, struts, butt plate
  box(g, -112, TY - 26, 0, 20, 14, 34, m.main, 3);
  for (const s of [-1, 1])
    tube(
      g,
      [
        [-112, TY - 30, s * 14],
        [-200, TY - 36, s * 14],
        [-318, TY - 40, s * 14],
      ],
      5,
      m.main,
      12,
      8,
    );
  ext(
    g,
    [
      [-330, TY + 4, 4],
      [-316, TY + 4, 4],
      [-314, TY - 112, 6],
      [-330, TY - 116, 6],
    ],
    44,
    m.main,
    { bevel: 3 },
  );
  box(g, -336, TY - 56, 0, 6, 110, 40, m.rubber, 2);
  tor(g, -200, TY - 36, -16, 7, 1.4, m.dark, "z");
  // ---- magazine (moving)
  const mag = part(g, "mag", 120, TY - 20, 0);
  box(mag, 0, -120, 0, 38, 250, 24, m.main, 2);
  for (const s of [-1, 1])
    box(mag, -6, -130, s * 12.4, 6, 200, 1.2, m.dark, 0.5);
  box(mag, 0, -248, 0, 42, 6, 27, m.main, 2);
  marker(mag, "hL_mag", 2, -150, 0, [1, 0, 0], [0, 1, 0], {
    rx: 19,
    rz: 12,
    phiS: 58,
    phiE: -112,
    ys: [30, 12, -6, -22],
    mirror: true,
    thumb: { base: [-10, 38, -22], dir: [1, 0.12, 0.05] },
  });
  // ---- markers
  marker(g, "muzzle", 424, TY - 2, 0);
  marker(g, "eject", 92, TY + 4, 18);
  marker(g, "sightRear", -40, TY + 31.4, 0);
  marker(g, "sightFront", 400, TY + 29.5, 0);
  const [gx, gy] = gripAxes(12);
  marker(g, "hR", -8, 0, 0, gx, gy, {
    rx: 25,
    rz: 15,
    phiS: 58,
    phiE: -112,
    ys: [28, 9, -9, -26],
    trigger: "trigTip",
    thumb: { base: [-14, 34, -21], dir: [1, 0.35, 0.1] },
  });
  marker(g, "hL", 121, 18, 0, [1, 0, 0], [0, 1, 0], {
    rx: 28,
    rz: 16,
    phiS: 58,
    phiE: -112,
    ys: [26, 8, -10, -26],
    mirror: true,
    thumb: { base: [-12, 34, -26], dir: [1, 0.12, 0.05] },
  });
  return { origin: [-8, 0, 0] };
}

function buildThompson(g, m) {
  const BY = 66;
  // upper receiver
  ext(
    g,
    [
      [-82, 40],
      [200, 40],
      [202, 84, 6],
      [190, 92, 4],
      [-70, 92, 6],
      [-82, 80, 6],
    ],
    32,
    m.main,
    { bevel: 2 },
  );
  box(g, 60, 72, 16.2, 150, 6, 1.6, m.bore, 1.5); // cocking slot (right)
  box(g, 150, 62, 16.2, 42, 14, 1.6, m.bore, 2); // ejection port
  // rear sight w/ protective ears
  box(g, -40, 94, 0, 30, 4, 22, m.main, 1);
  for (const s of [-1, 1])
    ext(
      g,
      [
        [-52, 92],
        [-28, 92],
        [-30, 106, 3],
        [-48, 108, 3],
      ],
      3,
      m.main,
      { z: s * 9, bevel: 0.8 },
    );
  box(g, -38, 101, 0, 3, 12, 12, m.main, 0.6);
  cylZ(g, -38, 103, -6.5, 6.5, 2.2, m.bore, 12);
  // lower receiver / trigger frame
  ext(
    g,
    [
      [-66, 42],
      [130, 42],
      [130, 18, 4],
      [96, 18],
      [80, 22],
      [20, 22],
      [-60, 26, 6],
    ],
    28,
    m.main,
    { bevel: 2 },
  );
  for (const s of [-1]) {
    cylZ(g, 0, 32, s * 14, s * 16, 5, m.dark);
    box(g, 0, 26, s * 16, 5, 14, 2, m.dark, 0.6);
    cylZ(g, 50, 32, s * 14, s * 16, 5, m.dark);
  }
  ext(
    g,
    [
      [14, 22],
      [78, 22],
      [76, 14, 4],
      [66, -4, 8],
      [26, -4, 8],
      [16, 8],
    ],
    12,
    m.main,
    {
      bevel: 1,
      holes: [
        [
          [26, 4, 5],
          [62, 4, 5],
          [68, 18],
          [22, 18],
        ],
      ],
    },
  );
  const trig = part(g, "trigger", 38, 22, 0);
  ext(
    trig,
    [
      [-3, 2],
      [3, 2],
      [4, -9, 2],
      [0, -14, 2],
      [-2, -14],
    ],
    5,
    m.dark,
    { bevel: 0.8 },
  );
  marker(trig, "trigTip", 3, -10, 0);
  // pistol grip (walnut)
  ext(
    g,
    [
      [-34, 24],
      [18, 24],
      [0, -60, 8],
      [-52, -64, 10],
    ],
    32,
    m.wood,
    { bevel: 7, uv: 1 / 120 },
  );
  // barrel + front sight
  lat(
    g,
    [
      [200, 15],
      [214, 15],
      [216, 13],
      [468, 11.5],
      [470, 10.5],
      [470, 6],
    ],
    m.main,
    { y: BY, segs: 26 },
  );
  cyl(g, 469.5, 470.2, 6, 6, m.bore, BY, 0, 16);
  lat(
    g,
    [
      [440, 11.5],
      [440, 13.5],
      [456, 13.5],
      [456, 11.5],
    ],
    m.main,
    { y: BY, segs: 22 },
  );
  ext(
    g,
    [
      [442, BY + 12],
      [456, BY + 12],
      [454, BY + 36.5, 1],
      [448, BY + 36.5, 1],
    ],
    3,
    m.dark,
    { bevel: 0.6 },
  );
  // horizontal fore-end
  ext(
    g,
    [
      [214, 50],
      [386, 50],
      [392, 44, 4],
      [384, 30, 10],
      [226, 28, 10],
      [212, 40, 4],
    ],
    38,
    m.wood,
    { bevel: 8, uv: 1 / 150 },
  );
  tor(g, 380, 26, 0, 7, 1.4, m.dark, "z");
  // stock (walnut) + butt plate
  ext(
    g,
    [
      [-80, 78],
      [-124, 62, 12],
      [-352, 34, 6],
      [-352, -72, 6],
      [-160, -10, 30],
      [-80, 24],
    ],
    38,
    m.wood,
    { bevel: 8, uv: 1 / 200 },
  );
  ext(
    g,
    [
      [-358, 36, 3],
      [-350, 36],
      [-350, -74],
      [-358, -74, 3],
    ],
    40,
    m.dark,
    { bevel: 2 },
  );
  tor(g, -250, -40, 0, 7, 1.4, m.dark, "z");
  // cocking knob (right side)
  const ch = part(g, "charge", 0, 76, 0);
  cylZ(ch, 0, 0, 14, 26, 4, m.main);
  sph(ch, 0, 0, 29, 7, m.main, 1, 1, 0.8);
  marker(ch, "hR_charge", 0, 8, 30, [0, -0.5, -0.86], [1, 0, 0], {
    ...FIST_R,
    wrist: [-38, -50, 34],
  });
  // magazine (20 rd stick)
  const mag = part(g, "mag", 110, 30, 0);
  box(mag, 0, -58, 0, 30, 150, 24, m.main, 2);
  for (const s of [-1, 1]) box(mag, 0, -66, s * 12.3, 20, 120, 1, m.dark, 0.4);
  box(mag, 0, -134, 0, 32, 4, 26, m.main, 1.5);
  marker(mag, "hL_mag", 2, -90, 0, [1, 0, 0], [0, 1, 0], {
    rx: 15,
    rz: 12,
    phiS: 58,
    phiE: -112,
    ys: [30, 12, -6, -22],
    mirror: true,
    thumb: { base: [-10, 38, -22], dir: [1, 0.12, 0.05] },
  });
  // markers
  marker(g, "muzzle", 474, BY, 0);
  marker(g, "eject", 150, 66, 18);
  marker(g, "sightRear", -38, 103, 0);
  marker(g, "sightFront", 451, BY + 37, 0);
  const [gx, gy] = gripAxes(20);
  marker(g, "hR", -14, -6, 0, gx, gy, {
    rx: 25,
    rz: 16,
    phiS: 58,
    phiE: -112,
    ys: [30, 11, -7, -24],
    trigger: "trigTip",
    thumb: { base: [-14, 38, -21], dir: [1, 0.3, 0.1] },
  });
  marker(g, "hL", 300, 40, 0, FOREGRIP_AXES[0], FOREGRIP_AXES[1], {
    rx: 14,
    rz: 19,
    phiS: 160,
    phiE: 32,
    ys: [32, 12, -8, -26],
    mirror: true,
    fdy: 0,
    thumb: { base: [-10, 30, -24], dir: [0.2, 1, 0.1] },
    wrist: [-54, -34, 10],
  });
  return { origin: [-14, -6, 0] };
}

function buildStg44(g, m) {
  const BY = 64;
  // upper receiver (stamped), dust cover, rear sight block
  ext(
    g,
    [
      [-72, 46],
      [236, 46],
      [236, 84, 3],
      [226, 90, 3],
      [-40, 90, 6],
      [-72, 82, 6],
    ],
    30,
    m.park,
    { bevel: 2 },
  );
  box(g, 108, 66, 15.4, 58, 16, 1.4, m.bore, 1.5);
  const cover = new THREE.Group();
  cover.position.set(108, 57, 16.6);
  g.add(cover);
  box(cover, 0, -8, 0.6, 58, 16, 1.2, m.park, 1);
  ext(
    g,
    [
      [180, 90],
      [236, 90],
      [236, 100, 2],
      [196, 102, 2],
      [180, 96],
    ],
    22,
    m.park,
    { bevel: 1.5 },
  );
  ext(
    g,
    [
      [184, 100],
      [224, 100],
      [224, 103],
      [186, 106],
    ],
    12,
    m.dark,
    { bevel: 0.6 },
  );
  for (const s of [-1, 1]) box(g, 186, 107.5, s * 4, 4, 3, 4, m.dark, 0.3);
  // lower receiver / trigger housing + grip
  ext(
    g,
    [
      [-60, 48],
      [96, 48],
      [96, 26, 4],
      [80, 22],
      [0, 22],
      [-50, 30, 6],
    ],
    26,
    m.park,
    { bevel: 2 },
  );
  ext(
    g,
    [
      [14, 24],
      [74, 24],
      [72, 16, 4],
      [64, 0, 8],
      [24, 0, 8],
      [16, 10],
    ],
    11,
    m.park,
    {
      bevel: 1,
      holes: [
        [
          [24, 7, 5],
          [60, 7, 5],
          [66, 20],
          [20, 20],
        ],
      ],
    },
  );
  const trig = part(g, "trigger", 38, 24, 0);
  ext(
    trig,
    [
      [-3, 2],
      [3, 2],
      [4, -9, 2],
      [0, -14, 2],
      [-2, -14],
    ],
    5,
    m.dark,
    { bevel: 0.8 },
  );
  marker(trig, "trigTip", 3, -10, 0);
  ext(
    g,
    [
      [-30, 26],
      [16, 26],
      [2, -58, 8],
      [-46, -62, 10],
    ],
    30,
    m.bake,
    { bevel: 6, uv: 1 / 90 },
  );
  for (const s of [-1, 1]) cylZ(g, -18, -16, s * 14.6, s * 16, 3, m.dark);
  // mag well
  ext(
    g,
    [
      [92, 48],
      [146, 48],
      [148, 18, 3],
      [90, 18, 3],
    ],
    32,
    m.park,
    { bevel: 1.5 },
  );
  cylZ(g, 88, 40, -15, -18, 4.2, m.dark);
  // barrel, gas cylinder, handguard, front sight, muzzle nut
  lat(
    g,
    [
      [236, 14],
      [250, 14],
      [252, 11],
      [420, 10],
      [424, 9],
      [640, 8.6],
      [640, 5],
    ],
    m.park,
    { y: BY, segs: 24 },
  );
  cyl(g, 639.5, 640.2, 5, 5, m.bore, BY, 0, 14);
  lat(
    g,
    [
      [236, 13],
      [492, 13],
      [494, 10],
      [500, 8],
    ],
    m.park,
    { y: BY + 20, segs: 22 },
  );
  const hg = new THREE.CylinderGeometry(
    17,
    17,
    150,
    26,
    1,
    true,
    -Math.PI * 0.72,
    Math.PI * 1.44,
  );
  hg.rotateZ(-Math.PI / 2);
  hg.translate(318, BY + 18, 0);
  M(g, hg, m.park);
  for (let i = 0; i < 5; i++)
    for (const s of [-1, 1])
      cylZ(g, 262 + i * 26, BY + 18, s * 16.4, s * 17.2, 4.2, m.bore, 12);
  box(g, 494, BY + 10, 0, 16, 40, 22, m.park, 3);
  box(g, 612, BY + 20, 0, 18, 32, 12, m.park, 2);
  box(g, 614, BY + 39, 0, 3.4, 12, 2.4, m.dark, 0.3);
  tor(g, 614, BY + 38, 0, 10, 1.6, m.park, "x", Math.PI * 1.2).rotation.x =
    -Math.PI * 0.1;
  lat(
    g,
    [
      [628, 9.2],
      [628, 11],
      [640, 11],
      [641, 9],
    ],
    m.park,
    { y: BY, segs: 20 },
  );
  tor(g, 494, BY + 2, -14, 7, 1.4, m.dark, "z");
  // stock (wood) + cap
  ext(
    g,
    [
      [-70, 86],
      [-326, 80, 6],
      [-326, -58, 6],
      [-150, 12, 30],
      [-70, 32],
    ],
    38,
    m.wood,
    { bevel: 8, uv: 1 / 200 },
  );
  ext(
    g,
    [
      [-80, 88, 3],
      [-60, 88],
      [-60, 30],
      [-80, 30, 3],
    ],
    40,
    m.park,
    { bevel: 2 },
  );
  ext(
    g,
    [
      [-332, 82, 3],
      [-322, 82],
      [-322, -60],
      [-332, -60, 3],
    ],
    40,
    m.park,
    { bevel: 2 },
  );
  // charging handle (left, rides with carrier)
  box(g, 60, 82, -15.2, 150, 5, 1.6, m.bore, 1.5);
  const ch = part(g, "charge", 150, 82, 0);
  cylZ(ch, 0, 0, -14, -30, 3.6, m.main);
  sph(ch, 0, 0, -32, 5.8, m.main, 1.2, 1, 0.8);
  marker(ch, "hL_charge", 0, -14, -32, [0.1, 1, 0.3], [1, 0, 0], {
    rx: 8,
    rz: 8,
    phiS: 110,
    phiE: -60,
    ys: [10, -4, -18, -30],
    mirror: true,
    thumb: { base: [-8, 14, -12], dir: [0.8, 0.3, 0.2] },
  });
  // curved 30-rd magazine
  const mag = part(g, "mag", 119, 44, 0);
  const curvePts = (off, w) => {
    const pts = [];
    for (let i = 0; i <= 10; i++) {
      const s = (i / 10) * 238;
      pts.push([s * s * 0.0011 + off - w, -s]);
    }
    for (let i = 10; i >= 0; i--) {
      const s = (i / 10) * 238;
      pts.push([s * s * 0.0011 + off + w + s * 0.022, -s]);
    }
    return pts;
  };
  ext(mag, curvePts(0, 20), 24, m.park, { bevel: 1.6 });
  for (const s of [-1, 1])
    ext(
      mag,
      curvePts(-3, 6).map(([x, y]) => [x, y * 0.86 - 20]),
      1.4,
      m.dark,
      { z: s * 12.2, bevel: 0.4 },
    );
  ext(
    mag,
    [
      [40, -236],
      [96, -236],
      [96, -244, 3],
      [40, -244, 3],
    ].map(([x, y]) => [x - 22 + 0, y]),
    27,
    m.park,
    { bevel: 1.5 },
  );
  marker(mag, "hL_mag", 30, -150, 0, [1, 0.25, 0], [-0.25, 1, 0], {
    rx: 22,
    rz: 12,
    phiS: 58,
    phiE: -112,
    ys: [30, 12, -6, -22],
    mirror: true,
    thumb: { base: [-12, 38, -24], dir: [1, 0.12, 0.05] },
  });
  // markers
  marker(g, "muzzle", 644, BY, 0);
  marker(g, "eject", 108, 68, 17);
  marker(g, "sightRear", 186, 109, 0);
  marker(g, "sightFront", 614, BY + 45, 0);
  const [gx, gy] = gripAxes(16);
  marker(g, "hR", -14, -2, 0, gx, gy, {
    rx: 24,
    rz: 15,
    phiS: 58,
    phiE: -112,
    ys: [30, 11, -7, -24],
    trigger: "trigTip",
    thumb: { base: [-14, 38, -20], dir: [1, 0.3, 0.1] },
  });
  marker(g, "hL", 320, BY - 8, 0, FOREGRIP_AXES[0], FOREGRIP_AXES[1], {
    rx: 32,
    rz: 18,
    phiS: 165,
    phiE: 70,
    ys: [32, 12, -8, -26],
    mirror: true,
    fdy: 0,
    thumb: { base: [-12, 30, -22], dir: [0.2, 1, 0.1] },
    wrist: [-58, -34, 10],
  });
  return { origin: [-14, -2, 0] };
}

let _holeTex = null,
  _shroudTex = null;
function canvasTex(w, h, draw) {
  if (typeof document === "undefined") return null;
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const x = c.getContext("2d");
  draw(x, w, h);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}
function heatShieldAlpha() {
  if (_holeTex) return _holeTex;
  _holeTex = canvasTex(256, 512, (x, w, h) => {
    x.fillStyle = "#fff";
    x.fillRect(0, 0, w, h);
    x.fillStyle = "#000";
    // u = around (theta), v = along the barrel
    for (let r = 0; r < 4; r++)
      for (let i = 0; i < 7; i++) {
        x.beginPath();
        x.ellipse(28 + r * 66, 50 + i * 68, 13, 22, 0, 0, TAU);
        x.fill();
      }
  });
  return _holeTex;
}
function shroudAlpha() {
  if (_shroudTex) return _shroudTex;
  _shroudTex = canvasTex(512, 128, (x, w, h) => {
    x.fillStyle = "#fff";
    x.fillRect(0, 0, w, h);
    x.fillStyle = "#000";
    for (let i = 0; i < 9; i++) {
      x.beginPath();
      x.ellipse(34 + i * 54, 64, 20, 26, 0, 0, TAU);
      x.fill();
    }
  });
  return _shroudTex;
}

function buildMG42(g, m) {
  const BY = 62;
  // receiver (stamped box)
  ext(
    g,
    [
      [-72, 30],
      [242, 30],
      [242, 88],
      [-50, 88, 6],
      [-72, 70, 6],
    ],
    46,
    m.park,
    { bevel: 2 },
  );
  for (let i = 0; i < 4; i++)
    for (const s of [-1, 1])
      box(g, -40 + i * 60, 60, s * 23.4, 20, 30, 1.2, m.darkPark, 1);
  box(g, 150, 28, 0, 70, 3, 30, m.bore, 1); // ejection chute (bottom)
  box(g, 180, 70, -23.6, 60, 14, 1.4, m.bore, 1); // belt entry (left)
  box(g, 180, 70, 23.6, 60, 14, 1.4, m.bore, 1); // link exit (right)
  box(g, 160, 88.5, 0, 150, 2, 40, m.darkPark, 0.5); // feed tray
  // rear sight on jacket rear
  box(g, 252, 96, 0, 22, 8, 20, m.park, 1.5);
  ext(
    g,
    [
      [242, 98],
      [270, 98],
      [270, 104],
      [246, 108],
    ],
    12,
    m.park,
    { bevel: 0.8 },
  );
  for (const s of [-1, 1]) box(g, 247, 110, s * 4, 4, 5, 4, m.dark, 0.3);
  // top cover (hinged at the FRONT, lifts at rear)
  const cov = part(g, "cover", 240, 92, 0);
  ext(
    cov,
    [
      [-158, -4],
      [2, -4],
      [2, 6, 4],
      [-10, 12, 3],
      [-150, 12, 3],
      [-160, 6, 3],
    ],
    44,
    m.park,
    { bevel: 2 },
  );
  box(cov, -150, 8, 0, 10, 10, 30, m.darkPark, 2); // latch
  marker(cov, "hR_cover", -140, 24, 8, [0, -1, 0], [1, 0, 0], {
    ...FIST_R,
    wrist: [20, -60, 40],
  });
  marker(cov, "hL_cover", -148, 28, -6, [0, -1, 0], [1, 0, 0], {
    rx: 12,
    rz: 12,
    phiS: 130,
    phiE: -20,
    ys: [14, -2, -16, -30],
    mirror: true,
    thumb: { base: [4, 10, -2], dir: [0.4, 1, 0.3] },
    wrist: [20, -60, 50],
  });
  // barrel jacket: rounded square with perforated sides + barrel-change hatch (right)
  const alpha = shroudAlpha();
  const pmat = m.park.clone ? m.park.clone() : m.park;
  pmat.alphaMap = alpha;
  pmat.alphaTest = 0.5;
  pmat.side = THREE.DoubleSide;
  pmat.transparent = false;
  const jack = new THREE.Group();
  jack.userData.keep = true;
  g.add(jack);
  const L = 400,
    X0 = 242,
    CX = X0 + L / 2;
  const sidePlane = (y, z, rotY, h) => {
    const pg = new THREE.PlaneGeometry(L, h);
    const mm = new THREE.Mesh(pg, pmat);
    mm.position.set(CX, y, z);
    mm.rotation.y = rotY;
    jack.add(mm);
    return mm;
  };
  sidePlane(BY + 4, -23, Math.PI, 40);
  const top = sidePlane(BY + 30, 0, 0, 34);
  top.rotation.set(-Math.PI / 2, 0, 0);
  const hatch = new THREE.Group();
  g.add(hatch);
  box(hatch, 408, BY - 4, 22.4, 300, 40, 2, m.park, 1.5);
  sidePlane(BY + 22, 23, 0, 12);
  box(hatch, 264, BY - 4, 24, 12, 16, 3, m.darkPark, 1);
  box(g, CX, BY - 25, 0, L, 2, 44, m.park, 0.5);
  for (const [y, z] of [
    [BY + 27, -20],
    [BY + 27, 20],
    [BY - 21, -20],
    [BY - 21, 20],
  ])
    cyl(g, X0, X0 + L, 5, 5, m.park, y, z, 10);
  lat(
    g,
    [
      [250, 10],
      [640, 10],
    ],
    m.dark,
    { y: BY, segs: 18 },
  ); // barrel inside
  box(g, 646, BY + 2, 0, 14, 60, 48, m.park, 5); // jacket front
  // muzzle booster
  lat(
    g,
    [
      [650, 14],
      [700, 14],
      [704, 15.5],
      [740, 15.5],
      [744, 18.5],
      [762, 21],
      [762, 13],
    ],
    m.park,
    { y: BY, segs: 26 },
  );
  cyl(g, 761.5, 762.2, 12.5, 12.5, m.bore, BY, 0, 20);
  // front sight (folding post) on jacket front
  box(g, 630, BY + 34, 0, 12, 8, 14, m.park, 1.5);
  ext(
    g,
    [
      [626, BY + 36],
      [636, BY + 36],
      [634, BY + 58, 1],
      [629, BY + 58, 1],
    ],
    3,
    m.dark,
    { bevel: 0.5 },
  );
  // bipod (folded back under jacket)
  box(g, 600, BY - 28, 0, 20, 10, 36, m.park, 2);
  for (const s of [-1, 1]) {
    cyl(g, 420, 600, 5.4, 5.4, m.park, BY - 34, s * 13, 10);
    box(g, 416, BY - 36, s * 13, 18, 6, 12, m.park, 2);
  }
  // trigger housing + grip (bakelite)
  ext(
    g,
    [
      [-40, 32],
      [80, 32],
      [80, 20, 4],
      [60, 14],
      [-40, 20],
    ],
    26,
    m.park,
    { bevel: 2 },
  );
  ext(
    g,
    [
      [12, 16],
      [72, 16],
      [70, 8, 4],
      [62, -8, 8],
      [22, -8, 8],
      [14, 4],
    ],
    11,
    m.park,
    {
      bevel: 1,
      holes: [
        [
          [22, 0, 5],
          [58, 0, 5],
          [64, 12],
          [18, 12],
        ],
      ],
    },
  );
  const trig = part(g, "trigger", 36, 18, 0);
  ext(
    trig,
    [
      [-3, 2],
      [3, 2],
      [4, -9, 2],
      [0, -14, 2],
      [-2, -14],
    ],
    5,
    m.dark,
    { bevel: 0.8 },
  );
  marker(trig, "trigTip", 3, -10, 0);
  ext(
    g,
    [
      [-32, 20],
      [16, 20],
      [0, -64, 8],
      [-50, -68, 10],
    ],
    30,
    m.bake,
    { bevel: 6, uv: 1 / 90 },
  );
  // buttstock (bakelite) with buffer
  ext(
    g,
    [
      [-70, 84],
      [-100, 84],
      [-440, 76, 8],
      [-446, 62],
      [-446, -44, 8],
      [-300, -30, 30],
      [-150, 18, 20],
      [-70, 30],
    ],
    42,
    m.bake,
    { bevel: 8, uv: 1 / 160 },
  );
  ext(
    g,
    [
      [-452, 78, 3],
      [-444, 78],
      [-444, -46],
      [-452, -46, 3],
    ],
    44,
    m.park,
    { bevel: 2 },
  );
  box(g, -300, 80, 0, 90, 6, 30, m.park, 2); // shoulder rest spring plate
  // charging handle (right side)
  box(g, 90, 50, 23.8, 170, 5, 1.6, m.bore, 1.5);
  const ch = part(g, "charge", 160, 50, 0);
  cylZ(ch, 0, 0, 22, 34, 4, m.main);
  cyl(ch, -14, 14, 5, 5, m.main, 0, 38, 12);
  marker(ch, "hR_charge", 0, 8, 44, [0, -0.5, -0.86], [1, 0, 0], {
    ...FIST_R,
    wrist: [-38, -50, 34],
  });
  // belt + 50-rd drum (moving)
  const belt = part(g, "belt", 180, 0, -24);
  box(belt, 0, 10, -44, 96, 118, 74, m.darkPark, 12);
  box(belt, 0, 70, -44, 70, 5, 50, m.park, 2); // lid ridge
  box(belt, 0, 78, -44, 40, 6, 10, m.park, 2); // handle
  cylZ(belt, 0, 20, -82, -80, 22, m.park, 18);
  for (let i = 0; i < 5; i++) {
    const t = i / 4;
    const y = 58 + t * 18,
      z = -14 + t * 14;
    cartridge(belt, -40, y, z, m, "rifle");
    box(belt, 0, y, z, 12, 13, 13, m.darkPark, 1.5);
  }
  for (let i = 0; i < 4; i++) {
    cartridge(belt, -40, 76, 8 + i * 12, m, "rifle");
    box(belt, 0, 76, 8 + i * 12, 12, 13, 11, m.darkPark, 1.5);
  }
  marker(belt, "hL_belt", 0, -12, -84, [0, 0, 1], [1, 0, 0], {
    rx: 30,
    rz: 24,
    phiS: 110,
    phiE: -60,
    ys: [30, 10, -10, -28],
    mirror: true,
    thumb: { base: [-20, 30, -26], dir: [0.3, 1, 0.1] },
    wrist: [-40, -50, 40],
  });
  // markers
  marker(g, "muzzle", 766, BY, 0);
  marker(g, "eject", 150, 26, 0);
  marker(g, "sightRear", 247, 112.5, 0);
  marker(g, "sightFront", 632, BY + 58, 0);
  const [gx, gy] = gripAxes(16);
  marker(g, "hR", -16, -8, 0, gx, gy, {
    rx: 25,
    rz: 15,
    phiS: 58,
    phiE: -112,
    ys: [30, 11, -7, -24],
    trigger: "trigTip",
    thumb: { base: [-14, 38, -20], dir: [1, 0.3, 0.1] },
  });
  marker(g, "hL", 330, BY + 2, 0, FOREGRIP_AXES[0], FOREGRIP_AXES[1], {
    rx: 30,
    rz: 23,
    phiS: 160,
    phiE: 32,
    ys: [32, 12, -8, -26],
    mirror: true,
    fdy: 0,
    thumb: { base: [-20, 30, -28], dir: [0.2, 1, 0.1] },
    wrist: [-64, -36, 10],
  });
  return { origin: [-16, -8, 0] };
}

function buildAether(g, m, up) {
  const A = aetherMats(up);
  g.userData.aether = A;
  const BY = 60;
  // grip (black bakelite w/ finger grooves) + brass pommel
  ext(
    g,
    [
      [-34, 40],
      [22, 40],
      [18, 18, 6],
      [10, 12, 4],
      [14, 2, 5],
      [6, -6, 4],
      [10, -18, 5],
      [2, -26, 4],
      [4, -38, 5],
      [-6, -60, 6],
      [-48, -62, 8],
      [-44, 0, 20],
    ],
    28,
    m.rubber,
    { bevel: 5 },
  );
  lat(
    g,
    [
      [-8, 0],
      [-8, 16],
      [0, 18],
      [6, 14],
      [8, 0],
    ],
    m.brass,
    { segs: 20 },
  ).position.set(-26, -64, 0);
  g.children[g.children.length - 1].rotation.z = Math.PI / 2 - 20 * D2R;
  // body housing (brass) — bulbous rear dome + main block
  lat(
    g,
    [
      [-58, 0],
      [-58, 6],
      [-52, 16],
      [-40, 23],
      [-20, 26],
      [0, 26],
      [10, 24],
      [14, 20],
    ],
    m.brassMain,
    { y: BY, segs: 32 },
  );
  ext(
    g,
    [
      [-30, 38],
      [120, 38],
      [132, 50, 6],
      [132, 72, 6],
      [-10, 78, 10],
      [-30, 70, 8],
    ],
    34,
    m.brassMain,
    { bevel: 4 },
  );
  // rear fins
  for (let i = 0; i < 3; i++) {
    const f = new THREE.Group();
    f.position.set(-46, BY, 0);
    f.rotation.x = (i * TAU) / 3 + Math.PI / 2;
    g.add(f);
    ext(
      f,
      [
        [-18, 0],
        [18, 0],
        [4, 16, 3],
        [-16, 34, 4],
        [-24, 32, 3],
      ],
      3,
      m.brass,
      { bevel: 0.8 },
    ).position.y = 18;
  }
  // barrel: tapered brass w/ coils
  lat(
    g,
    [
      [120, 18],
      [130, 17],
      [196, 11],
      [204, 11],
      [206, 8],
    ],
    m.brassMain,
    { y: BY, segs: 30 },
  );
  for (let i = 0; i < 4; i++) {
    const x = 142 + i * 15,
      r = 16.5 - i * 1.4;
    tor(g, x, BY, 0, r, 2.4, m.copper, "x");
    tor(g, x + 6, BY, 0, r - 1.3, 1.0, A.glow, "x");
  }
  // emitter: flared dish + 3 vanes + glowing core
  lat(
    g,
    [
      [200, 9],
      [208, 9],
      [214, 14],
      [222, 20],
      [224, 19],
      [216, 10],
      [216, 0],
    ],
    m.brass,
    { y: BY, segs: 30 },
  );
  sph(g, 214, BY, 0, 6.5, A.glow);
  for (let i = 0; i < 3; i++) {
    const f = new THREE.Group();
    f.position.set(0, BY, 0);
    f.rotation.x = (i * TAU) / 3;
    g.add(f);
    ext(
      f,
      [
        [196, 10],
        [226, 10],
        [232, 26, 3],
        [212, 24, 3],
      ],
      2.4,
      m.brass,
      { bevel: 0.6 },
    );
  }
  // dial gauge (right side), pipes
  cylZ(g, 50, 58, 16, 22, 13, m.brass, 24);
  cylZ(g, 50, 58, 22, 22.6, 11, A.glow, 20);
  box(g, 50, 62, 23, 1.2, 9, 0.6, m.bore, 0.2).rotation.z = 0.5;
  tube(
    g,
    [
      [100, 90, 12],
      [124, 88, 16],
      [138, 76, 18],
      [146, 64, 18],
    ],
    2.6,
    m.copper,
    20,
    8,
  );
  tube(
    g,
    [
      [100, 90, -12],
      [124, 88, -16],
      [138, 76, -18],
      [146, 64, -18],
    ],
    2.6,
    m.copper,
    20,
    8,
  );
  // trigger guard (brass ring) + trigger
  ext(
    g,
    [
      [12, 40],
      [70, 40],
      [68, 32, 4],
      [56, 14, 8],
      [18, 16, 8],
      [10, 30, 4],
    ],
    8,
    m.brass,
    {
      bevel: 1.2,
      holes: [
        [
          [22, 22, 6],
          [54, 22, 6],
          [62, 36],
          [18, 36],
        ],
      ],
    },
  );
  const trig = part(g, "trigger", 34, 40, 0);
  ext(
    trig,
    [
      [-3, 2],
      [3, 2],
      [4, -9, 2],
      [0, -14, 2],
      [-2, -14],
    ],
    5,
    m.brass,
    { bevel: 0.8 },
  );
  marker(trig, "trigTip", 3, -10, 0);
  // capsule cradle (brass clamps) + capsule (moving)
  for (const x of [-4, 92]) box(g, x, 82, 0, 10, 12, 30, m.brass, 3);
  const cap = part(g, "capsule", 44, 94, 0);
  cyl(cap, -46, 46, 12.5, 12.5, m.glass, 0, 0, 24);
  cyl(cap, -44, 44, 9.8, 9.8, A.fluid, 0, 0, 18);
  lat(
    cap,
    [
      [-58, 0],
      [-58, 9],
      [-54, 14],
      [-46, 14],
      [-44, 12.8],
    ],
    m.brass,
    { segs: 24 },
  );
  lat(
    cap,
    [
      [44, 12.8],
      [46, 14],
      [54, 14],
      [58, 9],
      [58, 0],
    ],
    m.brass,
    { segs: 24 },
  );
  for (let i = 0; i < 7; i++)
    sph(cap, -34 + i * 11, rand(-6, 6), rand(-5, 5), rand(1, 2.2), m.glass);
  marker(cap, "hL_cap", 0, 30, -8, [0, -1, 0], [1, 0, 0], {
    rx: 16,
    rz: 14,
    phiS: 130,
    phiE: -30,
    ys: [26, 8, -10, -26],
    mirror: true,
    thumb: { base: [4, 20, -16], dir: [0.4, 1, 0.3] },
    wrist: [20, -60, 50],
  });
  // sights: rear notch on stalk, front bead post
  box(g, -20, 104, 0, 6, 30, 5, m.brass, 1);
  for (const s of [-1, 1]) box(g, -20, 121.5, s * 4.5, 6, 5, 4, m.brass, 0.6);
  box(g, 182, 96, 0, 5, 50, 4, m.brass, 1);
  sph(g, 182, 121.5, 0, 2.6, A.glow);
  // markers
  marker(g, "muzzle", 226, BY, 0);
  marker(g, "eject", 60, 70, 18);
  marker(g, "sightRear", -20, 123.8, 0);
  marker(g, "sightFront", 182, 124, 0);
  const [gx, gy] = gripAxes(20);
  marker(g, "hR", -18, -8, 0, gx, gy, {
    rx: 25,
    rz: 15,
    phiS: 58,
    phiE: -112,
    ys: [30, 11, -7, -24],
    trigger: "trigTip",
    thumb: { base: [-14, 38, -20], dir: [1, 0.3, 0.1] },
  });
  marker(g, "hL", -12, -16, -2, [0, 0, 1], gy, {
    rx: 25,
    rz: 44,
    phiS: 92,
    phiE: -55,
    ys: [14, -2, -18, -32],
    mirror: true,
    fdy: 0,
    thumb: { base: [-27, 20, 26], dir: [0.1, 0.25, 1] },
    wrist: [-60, -24, 20],
  });
  return { origin: [-18, -8, 0] };
}

// shoulder contact point on the butt (mm, builder space); pistols have none
const STOCK_PT = {
  kar98k: [-303, -45, 0],
  trench: [-336, -40, 0],
  mp40: [-338, 8, 0],
  thompson: [-357, -15, 0],
  stg44: [-332, 18, 0],
  mg42: [-452, 18, 0],
};
/**
 * Hand/muzzle/stock points in model space (metres, +X forward, origin at the grip) for third-person
 * avatars. right/left = centre of the gripped section where the middle finger wraps. Quats rotate the
 * hand frame into model space; hand frame: +X = palm -> through the grip (towards the fingertips side),
 * +Y = grip axis pointing from pinky to index/thumb, +Z = back-of-hand side for the right hand (the
 * left hand uses the same X/Y, with +Z toward its palm-side knuckle row, i.e. a mirrored hand).
 * Also: trigger (index fingertip spot), gripAxisR/L + palmDirR/L as plain vectors.
 */
function computeGrips(outer) {
  outer.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(outer.matrixWorld).invert();
  const invQ = new THREE.Quaternion().setFromRotationMatrix(inv);
  const find = (n) => outer.getObjectByName(n);
  const pos = (o) =>
    o ? o.getWorldPosition(new V3()).applyMatrix4(inv) : null;
  const quat = (o) =>
    o
      ? invQ.clone().multiply(o.getWorldQuaternion(new THREE.Quaternion()))
      : null;
  const hR = find("hR"),
    hL = find("hL"),
    mz = find("muzzle"),
    st = find("stock"),
    tr = find("trigTip");
  const qR = quat(hR),
    qL = quat(hL);
  const ax = (q, v) => (q ? new V3(...v).applyQuaternion(q) : null);
  return {
    right: pos(hR),
    left: pos(hL),
    muzzle: pos(mz),
    stock: st ? pos(st) : null,
    trigger: pos(tr),
    rightQuat: qR,
    leftQuat: qL,
    gripAxisR: ax(qR, [0, 1, 0]),
    palmDirR: ax(qR, [1, 0, 0]),
    gripAxisL: ax(qL, [0, 1, 0]),
    palmDirL: ax(qL, [1, 0, 0]),
  };
}

const BUILDERS = {
  m1911: buildM1911,
  kar98k: buildKar98k,
  trench: buildTrench,
  mp40: buildMP40,
  thompson: buildThompson,
  stg44: buildStg44,
  mg42: buildMG42,
  aether: buildAether,
};

/** World model: +X forward, origin at the grip, metres. Moving parts are named groups. */
export function buildWeaponModel(id, T, upgraded = false) {
  const outer = new THREE.Group();
  outer.name = "weapon_" + id;
  const g = new THREE.Group();
  g.name = "mm";
  g.scale.setScalar(0.001);
  outer.add(g);
  const mats = matSet(T, upgraded);
  const build = BUILDERS[id] || BUILDERS.m1911;
  const info = build(g, mats, upgraded);
  if (STOCK_PT[id]) marker(g, "stock", ...STOCK_PT[id]);
  g.position.set(
    -info.origin[0] * 0.001,
    -info.origin[1] * 0.001,
    -info.origin[2] * 0.001,
  );
  optimize(g);
  // record rest transforms for animation
  const parts = [];
  g.traverse((o) => {
    if (o.userData.part) {
      o.userData.restPos = o.position.clone();
      o.userData.restRot = o.rotation.clone();
      if (o.userData.restVis === undefined) o.userData.restVis = true;
      o.visible = o.userData.restVis;
      parts.push(o);
    }
  });
  outer.userData = {
    id,
    upgraded,
    mm: g,
    parts,
    aether: g.userData.aether || null,
  };
  outer.userData.grips = computeGrips(outer);
  outer.traverse((o) => {
    if (o.isMesh) {
      o.castShadow = true;
      o.receiveShadow = true;
    }
  });
  return outer;
}

// ======================================================================================
// Hands: procedural gloved hands posed from "wrap" shapes (21 joint points, local mm frame)
//   local frame: X = palm -> through the gripped object, Y = grip axis (pinky -> index),
//   Z = knuckle side (right-hand convention; `mirror` negates Z for the left hand)
// ======================================================================================

const FR = 8.5;
const FL = [
  [42, 25, 21],
  [47, 28, 23],
  [44, 27, 22],
  [35, 21, 19],
];
const FRAD = [8.0, 8.3, 7.8, 7.0];

function makeShape(sd, trigLocal) {
  const rx = sd.rx + FR,
    rz = sd.rz + FR;
  const phiS = sd.phiS * D2R,
    phiE = sd.phiE * D2R;
  // sample the nominal wrap (phiS->phiE) plus a continuation, so fingers longer than the wrap keep
  // curling along the grip surface instead of sticking out tangentially
  const N = 240,
    samp = [],
    accs = [];
  const phiX = phiE + Math.sign(phiE - phiS) * Math.PI * 0.9;
  let acc = 0,
    prev = null;
  for (let i = 0; i <= N; i++) {
    const ph = phiS + ((phiX - phiS) * i) / N;
    const p = new V3(rx * Math.cos(ph), 0, rz * Math.sin(ph));
    if (prev) acc += p.distanceTo(prev);
    samp.push(p);
    accs.push(acc);
    prev = p;
  }
  const arc = acc;
  const at = (d) => {
    if (d >= arc) {
      const a = samp[N - 1],
        b = samp[N];
      return b.clone().addScaledVector(b.clone().sub(a).normalize(), d - arc);
    }
    let i = 1;
    while (accs[i] < d) i++;
    const u = (d - accs[i - 1]) / (accs[i] - accs[i - 1] || 1);
    return samp[i - 1].clone().lerp(samp[i], u);
  };
  const ys = sd.ys;
  const pts = [];
  const W = sd.wrist
    ? new V3(...sd.wrist)
    : new V3(-rx - 30, ys[1] - 22, rz * 0.45);
  pts.push(W);
  const fdy = sd.fdy ?? -0.06;
  for (let f = 0; f < 4; f++) {
    const L = FL[f],
      tot = L[0] + L[1] + L[2];
    if (f === 0 && trigLocal) {
      const K = at(0);
      K.y = ys[0];
      const T = trigLocal.clone();
      const d = T.clone().sub(K);
      const out = new V3(K.x, 0, K.z).normalize();
      const J1 = K.clone().addScaledVector(d, 0.44).addScaledVector(out, 7);
      J1.y += 4;
      const J2 = K.clone().addScaledVector(d, 0.8).addScaledVector(out, 4);
      J2.y += 3;
      pts.push(K, J1, J2, T);
      continue;
    }
    for (const d of [0, L[0], L[0] + L[1], tot]) {
      const p = at(d);
      p.y = ys[f] + fdy * d;
      pts.push(p);
    }
  }
  const th = sd.thumb || {
    base: [-rx * 0.5, ys[0] + 8, -rz],
    dir: [1, 0.2, 0],
  };
  const B = new V3(...th.base),
    D = new V3(...th.dir).normalize();
  const T0 = W.clone().lerp(B, 0.4);
  const T2 = B.clone().addScaledVector(D, 31);
  const inward = new V3(-T2.x, 0, -T2.z).normalize();
  const T3 = T2.clone().addScaledVector(D, 24).addScaledVector(inward, 3);
  pts.push(T0, B, T2, T3);
  if (sd.mirror) for (const p of pts) p.z = -p.z;
  const arr = new Float32Array(pts.length * 3);
  pts.forEach((p, i) => p.toArray(arr, i * 3));
  return arr;
}

const FIST = {
  rx: 9,
  rz: 9,
  phiS: 110,
  phiE: -70,
  ys: [14, -1, -15, -28],
  thumb: { base: [-6, 16, -13], dir: [0.8, 0.3, 0.4] },
};
const OPEN_L = {
  rx: 40,
  rz: 40,
  phiS: 100,
  phiE: 30,
  ys: [30, 10, -10, -28],
  mirror: true,
  fdy: 0,
  thumb: { base: [-30, 26, -30], dir: [0.4, 1, 0.1] },
};

let _unit = null;
function unitGeos() {
  if (_unit) return _unit;
  const cyl = new THREE.CylinderGeometry(1, 1, 1, 12, 1, true);
  cyl.translate(0, 0.5, 0);
  const taper = new THREE.CylinderGeometry(0.86, 1, 1, 16, 1, true);
  taper.translate(0, 0.5, 0);
  const sph = new THREE.SphereGeometry(1, 14, 10);
  const palm = new RoundedBoxGeometry(1, 1, 1, 3, 0.42);
  const roll = new THREE.LatheGeometry(
    [
      [0.9, 0],
      [1.02, 0.12],
      [1.08, 0.35],
      [1.06, 0.62],
      [1.1, 0.8],
      [0.98, 1],
      [0.9, 1.02],
    ].map(([r, y]) => new THREE.Vector2(r, y)),
    18,
  );
  const cuff = new THREE.LatheGeometry(
    [
      [0.9, -0.02],
      [1.0, 0],
      [1.08, 0.8],
      [1.12, 1],
      [1.0, 1.04],
    ].map(([r, y]) => new THREE.Vector2(r, y)),
    16,
  );
  const cuffC = new THREE.CylinderGeometry(0.97, 1.06, 1, 16, 1, false);
  cuffC.translate(0, 0.5, 0);
  _unit = { cyl, taper, sph, palm, roll, cuff, cuffC };
  return _unit;
}
const _q = new THREE.Quaternion(),
  _v = new V3(),
  _v2 = new V3(),
  _m4 = new THREE.Matrix4(),
  _s = new V3();
const YUP = new V3(0, 1, 0);
function placeSeg(mesh, a, b, r0) {
  _v.subVectors(b, a);
  const len = _v.length() || 1e-5;
  _q.setFromUnitVectors(YUP, _v.multiplyScalar(1 / len));
  mesh.matrix.compose(a, _q, _s.set(r0, len, r0));
}
function placeSph(mesh, p, r) {
  mesh.matrix.compose(p, _q.identity(), _s.set(r, r, r));
}

class Hand {
  constructor(parent, glove) {
    const U = unitGeos();
    this.g = new THREE.Group();
    parent.add(this.g);
    const mk = (geo, mat) => {
      const m = new THREE.Mesh(geo, mat);
      m.matrixAutoUpdate = false;
      m.frustumCulled = false;
      this.g.add(m);
      return m;
    };
    this.segs = [];
    this.joints = [];
    for (let i = 0; i < 15; i++) this.segs.push(mk(U.cyl, glove));
    for (let i = 0; i < 19; i++) this.joints.push(mk(U.sph, glove));
    this.palm = mk(U.palm, glove);
    this.pad = mk(U.sph, glove);
    this.pts = Array.from({ length: 21 }, () => new V3());
    this.scale = 1;
  }
  setMaterial(mat) {
    this.g.traverse((o) => {
      if (o.isMesh) o.material = mat;
    });
  }
  update(frame, shape) {
    const P = this.pts;
    for (let i = 0; i < 21; i++)
      P[i].fromArray(shape, i * 3).applyMatrix4(frame);
    let si = 0,
      ji = 0;
    const tap = [1, 0.93, 0.86];
    const hs = this.scale;
    for (let f = 0; f < 4; f++) {
      const r = FRAD[f] * 0.001 * hs;
      const b = 1 + f * 4;
      for (let k = 0; k < 3; k++)
        placeSeg(this.segs[si++], P[b + k], P[b + k + 1], r * tap[k]);
      placeSph(this.joints[ji++], P[b], r * 1.12);
      placeSph(this.joints[ji++], P[b + 1], r * 0.97);
      placeSph(this.joints[ji++], P[b + 2], r * 0.9);
      placeSph(this.joints[ji++], P[b + 3], r * 0.86);
    }
    placeSeg(this.segs[si++], P[17], P[18], 0.0125 * hs);
    placeSeg(this.segs[si++], P[18], P[19], 0.0098 * hs);
    placeSeg(this.segs[si++], P[19], P[20], 0.0088 * hs);
    placeSph(this.joints[ji++], P[18], 0.0105 * hs);
    placeSph(this.joints[ji++], P[19], 0.0094 * hs);
    placeSph(this.joints[ji++], P[20], 0.0086 * hs);
    // palm box: from wrist to knuckle line
    const W = P[0];
    const K = _v2
      .copy(P[1])
      .add(P[5])
      .add(P[9])
      .add(P[13])
      .multiplyScalar(0.25);
    const Ld = new V3().subVectors(K, W);
    const len = Ld.length();
    Ld.normalize();
    const A = new V3().subVectors(P[1], P[13]);
    const wid = A.length();
    const N = new V3().crossVectors(Ld, A).normalize();
    A.crossVectors(N, Ld).normalize();
    const c = new V3().copy(W).addScaledVector(Ld, len * 0.5);
    _m4.makeBasis(
      A.multiplyScalar(wid + 0.02),
      Ld.clone().multiplyScalar(len + 0.018),
      N.clone().multiplyScalar(0.03),
    );
    _m4.setPosition(c);
    this.palm.matrix.copy(_m4);
    // thenar pad
    placeSph(this.pad, P[17].clone().lerp(P[18], 0.4), 0.014);
    this.wrist = W;
    this.dir = Ld;
  }
}

class Arm {
  constructor(parent, mats, side) {
    const U = unitGeos();
    this.side = side;
    const mk = (geo, mat) => {
      const m = new THREE.Mesh(geo, mat);
      m.matrixAutoUpdate = false;
      m.frustumCulled = false;
      parent.add(m);
      return m;
    };
    this.upper = mk(U.taper, mats.sleeve);
    this.elbow = mk(U.sph, mats.sleeve);
    this.fore = mk(U.taper, mats.sleeve);
    this.roll = mk(U.roll, mats.sleeve);
    this.skin = mk(U.taper, mats.skin);
    this.cuff = mk(U.cuffC, mats.glove);
    this.S = new V3(side * 0.21, -0.33, 0.1);
    this.pole = new V3(side * 0.7, -1, 0.15).normalize();
    this.E = new V3();
    this.style = { rolled: true, gloved: true, scale: 1 };
  }
  setStyle({ sleeve, skin, glove, rolled = true, scale = 1 }) {
    this.upper.material =
      this.elbow.material =
      this.fore.material =
      this.roll.material =
        sleeve;
    this.skin.material = skin;
    this.cuff.material = glove || skin;
    this.style = { rolled, gloved: !!glove, scale };
  }
  update(W) {
    const S = this.S;
    const La = 0.3,
      Lf = 0.27;
    const d = new V3().subVectors(W, S);
    const dist = Math.max(1e-4, d.length());
    let a = La,
      b = Lf;
    const maxR = (a + b) * 0.995;
    if (dist > maxR) {
      const k = dist / maxR;
      a *= k;
      b *= k;
    }
    d.normalize();
    const x = (a * a - b * b + dist * dist) / (2 * dist);
    const h = Math.sqrt(Math.max(0, a * a - x * x));
    const pv = this.pole
      .clone()
      .addScaledVector(d, -this.pole.dot(d))
      .normalize();
    const E = this.E.copy(S).addScaledVector(d, x).addScaledVector(pv, h);
    const k = this.style.scale;
    placeSeg(this.upper, S, E, 0.052 * k);
    placeSph(this.elbow, E, 0.047 * k);
    const P = (t) => new V3().lerpVectors(E, W, t);
    if (this.style.rolled) {
      placeSeg(this.fore, E, P(0.56), 0.047 * k);
      placeSeg(this.roll, P(0.5), P(0.62), 0.045 * k);
      placeSeg(this.skin, P(0.58), P(0.95), 0.036 * k);
    } else {
      // full-length sleeve with a buttoned cuff band at the wrist
      placeSeg(this.fore, E, P(0.9), 0.047 * k);
      placeSeg(this.roll, P(0.83), P(0.92), 0.039 * k);
      placeSeg(this.skin, P(0.88), P(0.99), 0.031 * k);
    }
    this.cuff.visible = this.style.gloved;
    placeSeg(this.cuff, P(0.84), P(1.02), 0.0335 * k);
    // reverse taper direction for the skin (thicker at elbow side): taper geo is thin at top already
  }
}

// ======================================================================================
// Keyframes: monotone cubic per channel. keys = [[t, v0, v1, ...], ...]
// ======================================================================================

function sampleKeys(keys, t, out) {
  const n = keys[0].length - 1;
  if (t <= keys[0][0] || keys.length === 1) {
    for (let i = 0; i < n; i++) out[i] = keys[0][i + 1];
    return out;
  }
  const last = keys[keys.length - 1];
  if (t >= last[0]) {
    for (let i = 0; i < n; i++) out[i] = last[i + 1];
    return out;
  }
  let k = 0;
  while (t >= keys[k + 1][0]) k++;
  const a = keys[k],
    b = keys[k + 1];
  const h = b[0] - a[0];
  const u = (t - a[0]) / h;
  const u2 = u * u,
    u3 = u2 * u;
  const h00 = 2 * u3 - 3 * u2 + 1,
    h10 = u3 - 2 * u2 + u,
    h01 = -2 * u3 + 3 * u2,
    h11 = u3 - u2;
  const pk = keys[k - 1],
    nk = keys[k + 2];
  for (let i = 0; i < n; i++) {
    const i1 = i + 1;
    const d = (b[i1] - a[i1]) / h;
    let m0 = 0,
      m1 = 0;
    if (pk) {
      const d0 = (a[i1] - pk[i1]) / (a[0] - pk[0]);
      m0 = d0 * d > 0 ? 2 / (1 / d0 + 1 / d) : 0;
    }
    if (nk) {
      const d1 = (nk[i1] - b[i1]) / (nk[0] - b[0]);
      m1 = d1 * d > 0 ? 2 / (1 / d + 1 / d1) : 0;
    }
    out[i] = h00 * a[i1] + h10 * h * m0 + h01 * b[i1] + h11 * h * m1;
  }
  return out;
}
const Z6 = [0, 0, 0, 0, 0, 0];
const K = (t, ...v) => [t, ...v];
const add6 = (a, b) => a.map((v, i) => v + (b[i] || 0));

// ======================================================================================
// Per-weapon view configuration + animation scripts
// gun keys: view-space offsets [px,py,pz (m), rx,ry,rz (rad)] ; part keys: parent-space [mm, rad]
// L/R: [[startTime, blendDur, anchorName], ...]
// ======================================================================================

const SPRINT_RIFLE = { p: [-0.06, -0.035, 0.03], r: [-0.3, 0.8, 0.45] };
const SPRINT_PISTOL = { p: [-0.03, -0.025, 0.04], r: [-0.42, 0.38, 0.28] };
const VIEW = {
  m1911: {
    hip: [0.128, -0.132, -0.38],
    rot: [0.02, 0.07, 0],
    ads: 0.44,
    sprint: SPRINT_PISTOL,
    flash: 1.0,
  },
  kar98k: {
    hip: [0.135, -0.155, -0.3],
    rot: [0.06, 0.035, 0],
    ads: 0.42,
    sprint: SPRINT_RIFLE,
    flash: 1.15,
  },
  trench: {
    hip: [0.135, -0.152, -0.3],
    rot: [0.06, 0.035, 0],
    ads: 0.4,
    sprint: SPRINT_RIFLE,
    flash: 1.45,
  },
  mp40: {
    hip: [0.13, -0.14, -0.3],
    rot: [0.06, 0.035, 0],
    ads: 0.23,
    sprint: SPRINT_RIFLE,
    flash: 0.9,
  },
  thompson: {
    hip: [0.13, -0.148, -0.3],
    rot: [0.06, 0.035, 0],
    ads: 0.22,
    sprint: SPRINT_RIFLE,
    flash: 0.95,
  },
  stg44: {
    hip: [0.135, -0.15, -0.3],
    rot: [0.06, 0.035, 0],
    ads: 0.34,
    sprint: SPRINT_RIFLE,
    flash: 1.05,
  },
  mg42: {
    hip: [0.145, -0.165, -0.3],
    rot: [0.06, 0.035, 0],
    ads: 0.42,
    sprint: SPRINT_RIFLE,
    flash: 1.25,
  },
  aether: {
    hip: [0.128, -0.132, -0.38],
    rot: [0.02, 0.07, 0],
    ads: 0.42,
    sprint: SPRINT_PISTOL,
    flash: 0.9,
  },
};

// view-space anchors for hands (frames in metres, shapes above)
const VIEW_ANCHORS = {
  pouchL: {
    p: [-0.2, -0.42, -0.2],
    r: [0.3, 0, 1.2],
    shape: { ...FIST, mirror: true },
  },
  pouchR: { p: [0.26, -0.42, -0.12], r: [0.3, 0, -1.2], shape: FIST },
};

function magScripts(o) {
  // generic detachable box-magazine reload (tactical + empty w/ charging handle)
  const G0 = o.pose;
  const tac = {
    dur: o.dur,
    commit: o.seat,
    events: [
      [o.out + 0.02, "mag_out"],
      [o.seat - 0.02, "mag_in"],
    ],
    gun: [
      K(0, ...Z6),
      K(0.28, ...G0),
      K(o.out + 0.04, ...add6(G0, [0, -0.006, 0, -0.02])),
      K(o.out + 0.2, ...G0),
      K(o.seat - 0.06, ...G0),
      K(o.seat + 0.02, ...add6(G0, [0, 0.008, 0, 0.035])),
      K(o.seat + 0.12, ...G0),
      K(o.dur, ...Z6),
    ],
    parts: { mag: o.magKeys(o.out, o.seat) },
    L: [
      [0.16, 0.2, "hL_mag"],
      [o.seat + 0.06, 0.26, "hL"],
    ],
  };
  if (!o.charge) return { reload: tac };
  const c = o.charge; // {pose, grab, pull, rel?, rest, back, fwd?}
  const E = o.durEmpty;
  const emp = {
    dur: E,
    commit: o.seat,
    events: [
      ...tac.events,
      [c.pull - 0.02, "bolt_back"],
      ...(c.rel ? [[c.rel - 0.02, "bolt_forward"]] : []),
    ],
    gun: [
      ...tac.gun.slice(0, -1),
      K(c.grab, ...c.pose),
      K(c.pull + 0.02, ...add6(c.pose, [0, -0.005, 0.01, -0.02])),
      K((c.rel || c.pull) + 0.12, ...c.pose),
      K(E, ...Z6),
    ],
    parts: {
      mag: tac.parts.mag,
      charge: c.rel
        ? [
            K(0, 0, 0, 0, 0, 0, 0),
            K(c.pull - 0.14, 0, 0, 0, 0, 0, 0),
            K(c.pull, c.back, 0, 0, 0, 0, 0),
            K(c.rel, 0, 0, 0, 0, 0, 0),
          ]
        : [
            K(0, c.fwd, 0, 0, 0, 0, 0),
            K(c.pull - 0.14, c.fwd, 0, 0, 0, 0, 0),
            K(c.pull, 0, 0, 0, 0, 0, 0),
          ],
    },
    L:
      c.hand === "R"
        ? tac.L
        : [
            [0.16, 0.2, "hL_mag"],
            [o.seat + 0.06, 0.2, "hL_charge"],
            [(c.rel || c.pull) + 0.1, 0.28, "hL"],
          ],
    R:
      c.hand === "R"
        ? [
            [c.grab - 0.12, 0.22, "hR_charge"],
            [(c.rel || c.pull) + 0.1, 0.28, "hR"],
          ]
        : undefined,
  };
  return { reload: tac, reload_empty: emp };
}

const DROP = (dx, dy, dz, r) => [dx, dy, dz, r, 0, r * 0.6];
function stickMagKeys(off) {
  return (out, seat) => [
    K(0, 0, 0, 0, 0, 0, 0),
    K(out - 0.08, 0, 0, 0, 0, 0, 0),
    K(out + 0.06, 0, -38, 0, 0, 0, 0),
    K(out + 0.26, -20, -150, -10, 0, 0, 0.25),
    K(out + 0.55, -80, -430, -90, 0.3, 0, 0.5),
    K(seat - 0.42, -80, -430, -90, 0.3, 0, 0.5),
    K(seat - 0.16, -6, -70 - off, -4, 0, 0, 0.06),
    K(seat - 0.05, 0, -12, 0, 0, 0, 0),
    K(seat, 0, 0, 0, 0, 0, 0),
  ];
}

const SCRIPTS = {
  m1911: (() => {
    const P0 = [-0.05, 0.02, 0.0, 0.34, 0.22, -0.5];
    const mag = [
      K(0, 0, 0, 0, 0, 0, 0),
      K(0.18, 0, 0, 0, 0, 0, 0),
      K(0.3, -9, -29, 0, 0, 0, 0),
      K(0.5, -45, -300, -30, 0, 0, 0.9),
      K(0.51, -60, -420, -120, 0, 0, 0),
      K(0.72, -60, -420, -120, 0, 0, 0),
      K(0.97, -12, -45, -6, 0, 0, 0.05),
      K(1.08, -3, -10, 0, 0, 0, 0),
      K(1.12, 0, 0, 0, 0, 0, 0),
    ];
    const gun = [
      K(0, ...Z6),
      K(0.2, ...P0),
      K(1.08, ...P0),
      K(1.15, ...add6(P0, [0, 0.008, 0, 0.04])),
      K(1.24, ...P0),
    ];
    const base = {
      events: [
        [0.2, "mag_out"],
        [1.1, "mag_in"],
      ],
      commit: 1.12,
      parts: { mag },
      L: [
        [0.14, 0.24, "pouchL"],
        [0.58, 0.14, "hL_mag"],
        [1.14, 0.24, "hL"],
      ],
    };
    return {
      reload: { ...base, dur: 1.5, gun: [...gun, K(1.5, ...Z6)] },
      reload_empty: {
        ...base,
        dur: 1.9,
        events: [...base.events, [1.37, "slide_release"]],
        gun: [
          ...gun,
          K(1.34, ...add6(P0, [0.005, 0, 0, -0.05, 0, 0.15])),
          K(1.42, ...add6(P0, [0.005, 0.006, 0, 0.02, 0, 0.12])),
          K(1.9, ...Z6),
        ],
        parts: {
          mag,
          slide: [
            K(0, -22, 0, 0, 0, 0, 0),
            K(1.36, -22, 0, 0, 0, 0, 0),
            K(1.4, 0, 0, 0, 0, 0, 0),
          ],
        },
      },
    };
  })(),
  kar98k: (() => {
    const P0 = [-0.08, 0.005, -0.1, 0.22, 0.3, 0.22];
    const cyc = [0, 0, 0, 0, 0, 0];
    return {
      cycle: {
        dur: 0.92,
        events: [
          [0.24, "bolt_back"],
          [0.5, "bolt_forward"],
        ],
        eject: 0.38,
        gun: [
          K(0, ...cyc),
          K(0.16, -0.01, -0.004, -0.03, 0.05, 0.06, 0.2),
          K(0.42, -0.012, -0.008, -0.035, 0.06, 0.07, 0.28),
          K(0.66, -0.006, -0.004, -0.02, 0.02, 0.03, 0.1),
          K(0.92, ...cyc),
        ],
        parts: {
          bolt: [
            K(0.14, 0, 0, 0, 0, 0, 0),
            K(0.24, 0, 0, 0, -1.45, 0, 0),
            K(0.38, -86, 0, 0, -1.45, 0, 0),
            K(0.52, 0, 0, 0, -1.45, 0, 0),
            K(0.62, 0, 0, 0, 0, 0, 0),
          ],
        },
        R: [
          [0.04, 0.1, "hR_bolt"],
          [0.64, 0.2, "hR"],
        ],
        adsCap: 0.6,
      },
      reload: {
        dur: 3.1,
        commit: 1.7,
        events: [
          [0.34, "bolt_back"],
          [1.18, "mag_in"],
          [1.34, "shell_insert"],
          [1.47, "shell_insert"],
          [1.6, "shell_insert"],
          [2.18, "bolt_forward"],
        ],
        gun: [
          K(0, ...Z6),
          K(0.3, ...P0),
          K(1.2, ...P0),
          K(1.3, ...add6(P0, [0, -0.006, 0, -0.02])),
          K(1.72, ...add6(P0, [0, -0.01, 0, -0.03])),
          K(1.9, ...P0),
          K(2.25, ...add6(P0, [0.004, 0, 0, 0.02, 0, -0.04])),
          K(2.55, ...P0),
          K(3.1, ...Z6),
        ],
        parts: {
          bolt: [
            K(0.3, 0, 0, 0, 0, 0, 0),
            K(0.42, 0, 0, 0, -1.45, 0, 0),
            K(0.58, -86, 0, 0, -1.45, 0, 0),
            K(2.04, -86, 0, 0, -1.45, 0, 0),
            K(2.22, 0, 0, 0, -1.45, 0, 0),
            K(2.36, 0, 0, 0, 0, 0, 0),
          ],
          clip: [
            K(0.66, 60, -260, 160, 0, 0, 0.6),
            K(1.02, 4, 30, 6, 0, 0, 0.12),
            K(1.16, 0, 0, 0, 0, 0, 0),
            K(2.08, 0, 0, 0, 0, 0, 0),
            K(2.4, 40, 110, 60, 0.6, 0, -1.4),
          ],
          clipRounds: [
            K(1.2, 0, 0, 0, 0, 0, 0),
            K(1.3, 0, -8, 0, 0, 0, 0),
            K(1.68, 0, -62, 0, 0, 0, 0),
          ],
        },
        vis: { clip: [[0.64, 2.4]], clipRounds: [[0.64, 1.7]] },
        R: [
          [0.12, 0.16, "hR_bolt"],
          [0.62, 0.16, "hR_clip"],
          [1.16, 0.1, "hR_push"],
          [1.74, 0.2, "hR_bolt"],
          [2.42, 0.28, "hR"],
        ],
      },
    };
  })(),
  trench: (() => {
    const P0 = [-0.05, 0.012, 0.0, 0.2, 0.16, -1.0];
    return {
      cycle: {
        dur: 0.6,
        events: [[0.12, "pump"]],
        eject: 0.25,
        gun: [
          K(0, ...Z6),
          K(0.2, 0, -0.006, 0.012, -0.02, 0.01, 0.04),
          K(0.42, 0, -0.002, 0.004, 0, 0, 0.01),
          K(0.6, ...Z6),
        ],
        parts: {
          pump: [
            K(0.08, 0, 0, 0, 0, 0, 0),
            K(0.24, -90, 0, 0, 0, 0, 0),
            K(0.42, 0, 0, 0, 0, 0, 0),
          ],
          bolt: [
            K(0.1, 0, 0, 0, 0, 0, 0),
            K(0.24, -84, 0, 0, 0, 0, 0),
            K(0.42, 0, 0, 0, 0, 0, 0),
          ],
        },
        adsCap: 0.75,
      },
      reload_start: {
        dur: 0.4,
        gun: [K(0, ...Z6), K(0.38, ...P0)],
        L: [[0.04, 0.26, "pouchL"]],
      },
      reload_shell: {
        dur: 0.5,
        commit: 0.3,
        events: [[0.29, "shell_insert"]],
        gun: [
          K(0, ...P0),
          K(0.26, ...P0),
          K(0.31, ...add6(P0, [0, 0.006, -0.006, 0.02])),
          K(0.42, ...P0),
        ],
        parts: {
          shell: [
            K(0, -50, -260, -80, 0, 0, 0),
            K(0.18, -40, -40, -6, 0, 0, 0),
            K(0.25, -16, -6, 0, 0, 0, 0),
            K(0.32, 40, 4, 0, 0, 0, 0),
          ],
        },
        vis: { shell: [[0, 0.33]] },
        L: [
          [0, 0.14, "hL_shell"],
          [0.34, 0.14, "pouchL"],
        ],
      },
      reload_end: {
        dur: 0.42,
        gun: [K(0, ...P0), K(0.42, ...Z6)],
        L: [[0.02, 0.3, "hL"]],
      },
      reload_end_pump: {
        dur: 0.85,
        events: [[0.47, "pump"]],
        eject: -1,
        gun: [
          K(0, ...P0),
          K(0.36, ...Z6),
          K(0.55, 0, -0.006, 0.012, -0.02, 0.01, 0.04),
          K(0.85, ...Z6),
        ],
        parts: {
          pump: [
            K(0.42, 0, 0, 0, 0, 0, 0),
            K(0.56, -90, 0, 0, 0, 0, 0),
            K(0.72, 0, 0, 0, 0, 0, 0),
          ],
          bolt: [
            K(0.44, 0, 0, 0, 0, 0, 0),
            K(0.56, -84, 0, 0, 0, 0, 0),
            K(0.72, 0, 0, 0, 0, 0, 0),
          ],
        },
        L: [[0.02, 0.3, "hL"]],
      },
    };
  })(),
  mp40: magScripts({
    dur: 2.2,
    durEmpty: 2.8,
    out: 0.38,
    seat: 1.46,
    pose: [-0.05, 0.012, 0.0, 0.3, 0.22, -0.45],
    magKeys: stickMagKeys(0),
    charge: {
      pose: [-0.07, 0.03, -0.05, 0.2, 0.3, -0.75],
      grab: 1.75,
      pull: 2.0,
      fwd: 130,
    },
  }),
  thompson: magScripts({
    dur: 2.3,
    durEmpty: 2.9,
    out: 0.4,
    seat: 1.5,
    pose: [-0.05, 0.012, 0.0, 0.3, 0.22, -0.45],
    magKeys: stickMagKeys(0),
    charge: {
      pose: [-0.04, 0.03, -0.04, 0.16, 0.08, 0.45],
      grab: 1.8,
      pull: 2.05,
      fwd: 120,
      hand: "R",
    },
  }),
  stg44: magScripts({
    dur: 2.4,
    durEmpty: 3.0,
    out: 0.4,
    seat: 1.58,
    pose: [-0.05, 0.012, 0.0, 0.3, 0.22, -0.45],
    magKeys: stickMagKeys(10),
    charge: {
      pose: [-0.07, 0.03, -0.05, 0.2, 0.3, -0.7],
      grab: 1.85,
      pull: 2.05,
      rel: 2.2,
      back: -110,
    },
  }),
  mg42: (() => {
    const GM = [-0.08, 0.0, -0.08, 0.28, 0.26, -0.5];
    const GC = [-0.03, 0.03, -0.04, 0.14, 0.05, 0.35];
    return {
      reload: {
        dur: 5.0,
        commit: 2.9,
        events: [
          [0.92, "slide_release"],
          [1.3, "mag_out"],
          [2.88, "mag_in"],
          [3.68, "bolt_forward"],
          [4.12, "bolt_back"],
          [4.28, "bolt_forward"],
        ],
        gun: [
          K(0, ...Z6),
          K(0.4, ...GM),
          K(0.95, ...add6(GM, [0, 0.005, 0, 0.02])),
          K(1.1, ...GM),
          K(2.85, ...GM),
          K(2.93, ...add6(GM, [0, 0.008, 0, 0.03])),
          K(3.05, ...GM),
          K(3.66, ...GM),
          K(3.72, ...add6(GM, [0, -0.01, 0, -0.03])),
          K(3.85, ...GC),
          K(4.14, ...add6(GC, [0, 0, 0.012, -0.02])),
          K(4.35, ...GC),
          K(5.0, ...Z6),
        ],
        parts: {
          cover: [
            K(0.6, 0, 0, 0, 0, 0, 0),
            K(0.95, 0, 0, 0, 0, 0, -1.05),
            K(3.42, 0, 0, 0, 0, 0, -1.05),
            K(3.68, 0, 0, 0, 0, 0, 0),
          ],
          belt: [
            K(1.2, 0, 0, 0, 0, 0, 0),
            K(1.5, -10, 40, -60, 0.2, 0, 0),
            K(1.95, -60, -380, -340, 0.5, 0.3, 0),
            K(2.15, -60, -380, -340, 0.5, 0.3, 0),
            K(2.6, -10, 20, -60, 0.2, 0, 0),
            K(2.9, 0, 0, 0, 0, 0, 0),
          ],
          charge: [
            K(3.98, 0, 0, 0, 0, 0, 0),
            K(4.14, -100, 0, 0, 0, 0, 0),
            K(4.3, 0, 0, 0, 0, 0, 0),
          ],
        },
        L: [
          [1.0, 0.24, "hL_belt"],
          [2.96, 0.3, "hL"],
        ],
        R: [
          [0.3, 0.3, "hR_cover"],
          [1.0, 0.28, "hR"],
          [2.98, 0.26, "hR_cover"],
          [3.74, 0.24, "hR_charge"],
          [4.36, 0.36, "hR"],
        ],
      },
    };
  })(),
  aether: (() => {
    const GA = [-0.07, -0.005, -0.06, 0.34, 0.24, -0.45];
    return {
      reload: {
        dur: 2.2,
        commit: 1.58,
        events: [
          [0.4, "mag_out"],
          [1.56, "mag_in"],
          [1.72, "slide_release"],
        ],
        gun: [
          K(0, ...Z6),
          K(0.3, ...GA),
          K(0.42, ...add6(GA, [0, 0.006, 0, 0.03])),
          K(0.55, ...GA),
          K(1.5, ...GA),
          K(1.6, ...add6(GA, [0, -0.008, 0, -0.03])),
          K(1.75, ...GA),
          K(2.2, ...Z6),
        ],
        parts: {
          capsule: [
            K(0.35, 0, 0, 0, 0, 0, 0),
            K(0.48, 0, 22, 0, 0, 0, 0),
            K(0.7, -30, 70, -30, 0, 0, 0.5),
            K(0.95, -120, -300, -200, 0, 0, 1),
            K(1.05, -120, -300, -200, 0, 0, 1),
            K(1.4, 0, 40, 0, 0, 0, 0),
            K(1.58, 0, 0, 0, 0, 0, 0),
          ],
        },
        L: [
          [0.18, 0.2, "hL_cap"],
          [1.7, 0.28, "hL"],
        ],
      },
    };
  })(),
};
// stg44 curved mag rocks slightly while seating
SCRIPTS.stg44.reload.parts.mag = SCRIPTS.stg44.reload.parts.mag.map((k) => [
  ...k.slice(0, 6),
  k[6] + (k[2] < -20 && k[2] > -120 ? 0.08 : 0),
]);

// per-shot procedural part motion: [part, axis index, travel, cycleFraction]
const FIRE_PARTS = {
  m1911: [
    ["slide", 0, -22],
    ["hammer", 5, -0.35],
  ],
  mp40: [["charge", 0, 120]],
  thompson: [["charge", 0, 110]],
  stg44: [["charge", 0, -95]],
  mg42: [["belt", 1, 1.5]],
  aether: [],
  kar98k: [],
  trench: [],
};

// ======================================================================================
// Feel: per-weapon handling (mass/frequency), sprint poses, authored recoil + camera patterns
// ======================================================================================

// mass scales lag/bob amplitude, f scales spring frequencies (heavier = slower, lazier), sprintOut = s
const HANDLING = {
  m1911: { mass: 0.6, f: 1.22, cls: "pistol", sprintOut: 0.14 },
  aether: { mass: 0.68, f: 1.15, cls: "pistol", sprintOut: 0.15 },
  mp40: { mass: 0.85, f: 1.05, cls: "rifle", sprintOut: 0.17 },
  thompson: { mass: 1.0, f: 1.0, cls: "rifle", sprintOut: 0.18 },
  stg44: { mass: 1.02, f: 0.98, cls: "rifle", sprintOut: 0.18 },
  trench: { mass: 1.12, f: 0.92, cls: "rifle", sprintOut: 0.2 },
  kar98k: { mass: 1.15, f: 0.9, cls: "rifle", sprintOut: 0.2 },
  mg42: { mass: 1.55, f: 0.78, cls: "lmg", sprintOut: 0.26 },
};
// sprint poses (view-space offsets: px,py,pz m ; rx,ry,rz rad)
const SPRINT_POSE = {
  rifle: [-0.045, -0.012, 0.03, -0.26, 0.6, 0.4], // canted across the chest, muzzle down-left
  lmg: [-0.04, -0.04, 0.03, -0.24, 0.5, 0.36], // carried low
  pistol: [0.012, 0.028, 0.07, 0.52, 0.18, 0.3], // raised by the shoulder, muzzle up
};
// recoil: viewmodel impulse (back m, up rad, y m, side rad, roll rad) on a spring (f Hz, z damping),
// camera kick (cam rad climb, camH rad horizontal pattern scale, first-shot boost, drift of the pattern),
// sustained-fire heat per shot, FOV punch, screen shake, buzz = high-frequency jitter (m)
const RECOIL = {
  m1911: {
    back: 0.028,
    up: 0.2,
    y: 0.006,
    side: 0.03,
    roll: 0.07,
    f: 8.5,
    z: 0.48,
    cam: 0.021,
    camH: 0.0045,
    first: 1.15,
    drift: 0.1,
    heat: 0.12,
    fov: 0.012,
    shake: 0.02,
  },
  kar98k: {
    back: 0.085,
    up: 0.22,
    y: 0.012,
    side: 0.04,
    roll: 0.1,
    f: 5.2,
    z: 0.5,
    cam: 0.052,
    camH: 0.009,
    first: 1,
    drift: 0,
    heat: 0,
    fov: 0.04,
    shake: 0.3,
  },
  trench: {
    back: 0.11,
    up: 0.26,
    y: 0.015,
    side: 0.05,
    roll: 0.12,
    f: 4.8,
    z: 0.52,
    cam: 0.062,
    camH: 0.013,
    first: 1,
    drift: 0,
    heat: 0,
    fov: 0.05,
    shake: 0.38,
  },
  mp40: {
    back: 0.014,
    up: 0.02,
    y: 0.002,
    side: 0.01,
    roll: 0.022,
    f: 10,
    z: 0.72,
    cam: 0.0062,
    camH: 0.0032,
    first: 1.7,
    drift: 0.18,
    heat: 0.045,
    fov: 0.003,
    shake: 0,
  },
  thompson: {
    back: 0.021,
    up: 0.032,
    y: 0.0035,
    side: 0.016,
    roll: 0.035,
    f: 8.5,
    z: 0.62,
    cam: 0.0085,
    camH: 0.0052,
    first: 1.6,
    drift: -0.26,
    heat: 0.06,
    fov: 0.005,
    shake: 0.012,
  },
  stg44: {
    back: 0.024,
    up: 0.04,
    y: 0.003,
    side: 0.012,
    roll: 0.032,
    f: 9.5,
    z: 0.55,
    cam: 0.0115,
    camH: 0.0046,
    first: 1.8,
    drift: 0.32,
    heat: 0.06,
    fov: 0.007,
    shake: 0.015,
  },
  mg42: {
    back: 0.018,
    up: 0.022,
    y: 0.003,
    side: 0.02,
    roll: 0.045,
    f: 12,
    z: 0.45,
    cam: 0.0078,
    camH: 0.0058,
    first: 1.4,
    drift: 0.2,
    heat: 0.04,
    fov: 0.004,
    shake: 0.1,
    buzz: 0.005,
  },
  aether: {
    back: 0.034,
    up: 0.12,
    y: 0.005,
    side: 0.02,
    roll: 0.06,
    f: 7,
    z: 0.55,
    cam: 0.015,
    camH: 0.004,
    first: 1.1,
    drift: 0,
    heat: 0.1,
    fov: 0.02,
    shake: 0.03,
  },
};
function mulberry32(a) {
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
/** Deterministic horizontal kick pattern per weapon (mean-reverting random walk + drift): learnable sprays. */
const PATTERNS = {};
for (const id of Object.keys(RECOIL)) {
  let seed = 7;
  for (const c of id) seed = (seed * 31 + c.charCodeAt(0)) | 0;
  const rng = mulberry32(seed);
  const out = [];
  let h = 0;
  for (let i = 0; i < 256; i++) {
    h = h * 0.55 + (rng() * 2 - 1) * 1.1 + RECOIL[id].drift;
    out.push(clamp(h, -1.8, 1.8));
  }
  PATTERNS[id] = out;
}

/** Spring-damper bank, parameterised by natural frequency (Hz) and damping ratio. */
class Spr {
  constructor(n, f = 3, z = 0.7) {
    this.x = new Float32Array(n);
    this.v = new Float32Array(n);
    this.set(f, z);
  }
  set(f, z) {
    const w = TAU * f;
    this.k = w * w;
    this.c = 2 * z * w;
    this.w = w;
    return this;
  }
  step(dt, target) {
    const n = this.x.length;
    const steps = Math.max(1, Math.ceil(dt * 240));
    const h = dt / steps;
    for (let s = 0; s < steps; s++)
      for (let i = 0; i < n; i++) {
        const tg = target ? target[i] || 0 : 0;
        this.v[i] += (-this.k * (this.x[i] - tg) - this.c * this.v[i]) * h;
        this.x[i] += this.v[i] * h;
      }
    return this;
  }
  kick(i, v) {
    this.v[i] += v;
  }
  snap(vals) {
    for (let i = 0; i < this.x.length; i++) {
      this.x[i] = vals ? vals[i] || 0 : 0;
      this.v[i] = 0;
    }
  }
}

// first-person character looks (setCharacter): sleeve material+tint, rolled sleeves, gloves, arm scale
const CHARACTERS = [
  {
    name: "Pvt. Cole Harlan",
    sleeve: ["sleeve_olive", null],
    rolled: true,
    glove: ["glove_leather", null],
    skin: 0x8a6048,
    scale: 1,
  },
  {
    name: "Sgt. Alfie Marsh",
    sleeve: ["sleeve_olive", 0xc9a877],
    rolled: false,
    glove: ["glove_leather", 0x7a6452],
    skin: 0x9a6c52,
    scale: 1,
  },
  {
    name: "Cpl. Yuri Volkov",
    sleeve: ["sleeve_olive", 0xd8cfa0],
    rolled: true,
    glove: null,
    skin: 0x7d5846,
    scale: 1.03,
  },
  {
    name: "Élodie Fournier",
    sleeve: ["leather", 0x6a5448],
    rolled: false,
    glove: null,
    skin: 0x8a634f,
    scale: 0.9,
  },
];

// ======================================================================================
// Effects assets (canvas textures) + accessory models (knife, grenade, bottle)
// ======================================================================================

let _fxTex = null;
function fxTextures() {
  if (_fxTex) return _fxTex;
  const star = canvasTex(128, 128, (x, w, h) => {
    const cx = w / 2,
      cy = h / 2;
    x.globalCompositeOperation = "lighter";
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * TAU + (i % 2) * 0.2,
        L = (i % 2 ? 0.33 : 0.48) * w;
      const g = x.createLinearGradient(
        cx,
        cy,
        cx + Math.cos(a) * L,
        cy + Math.sin(a) * L,
      );
      g.addColorStop(0, "rgba(255,235,190,0.9)");
      g.addColorStop(1, "rgba(255,120,20,0)");
      x.fillStyle = g;
      x.beginPath();
      x.moveTo(cx + Math.cos(a + 1.57) * 7, cy + Math.sin(a + 1.57) * 7);
      x.lineTo(cx + Math.cos(a) * L, cy + Math.sin(a) * L);
      x.lineTo(cx + Math.cos(a - 1.57) * 7, cy + Math.sin(a - 1.57) * 7);
      x.fill();
    }
    const r = x.createRadialGradient(cx, cy, 0, cx, cy, w * 0.3);
    r.addColorStop(0, "rgba(255,255,240,1)");
    r.addColorStop(0.3, "rgba(255,210,120,0.8)");
    r.addColorStop(1, "rgba(255,90,10,0)");
    x.fillStyle = r;
    x.fillRect(0, 0, w, h);
  });
  const petal = canvasTex(256, 64, (x, w, h) => {
    x.globalCompositeOperation = "lighter";
    for (let i = 0; i < 5; i++) {
      const g = x.createRadialGradient(
        20,
        h / 2,
        2,
        20,
        h / 2,
        w * (0.5 + i * 0.1),
      );
      g.addColorStop(0, "rgba(255,240,200,0.55)");
      g.addColorStop(0.35, "rgba(255,160,50,0.35)");
      g.addColorStop(1, "rgba(255,60,0,0)");
      x.fillStyle = g;
      x.beginPath();
      x.ellipse(
        w * (0.3 + i * 0.05),
        h / 2 + (i - 2) * 2,
        w * (0.34 - i * 0.03),
        h * (0.34 - i * 0.04),
        0,
        0,
        TAU,
      );
      x.fill();
    }
  });
  const smoke = canvasTex(64, 64, (x, w, h) => {
    for (let i = 0; i < 14; i++) {
      const px = w / 2 + rand(-10, 10),
        py = h / 2 + rand(-10, 10),
        r = rand(10, 22);
      const g = x.createRadialGradient(px, py, 0, px, py, r);
      g.addColorStop(0, "rgba(210,205,200,0.22)");
      g.addColorStop(1, "rgba(210,205,200,0)");
      x.fillStyle = g;
      x.fillRect(0, 0, w, h);
    }
  });
  const glow = canvasTex(64, 64, (x, w, h) => {
    const g = x.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
    g.addColorStop(0, "rgba(255,255,255,1)");
    g.addColorStop(0.25, "rgba(255,255,255,0.6)");
    g.addColorStop(1, "rgba(255,255,255,0)");
    x.fillStyle = g;
    x.fillRect(0, 0, w, h);
  });
  for (const t of [star, petal, smoke, glow])
    if (t) {
      t.colorSpace = THREE.SRGBColorSpace;
      t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
    }
  _fxTex = { star, petal, smoke, glow };
  return _fxTex;
}

function buildKnife(m) {
  const g = new THREE.Group();
  const mm = new THREE.Group();
  mm.scale.setScalar(0.001);
  g.add(mm);
  // M3-style fighting knife: blade along +Y, edge toward +X
  const blade = ext(
    mm,
    [
      [-6, 58],
      [11, 58],
      [12, 70],
      [11, 170],
      [7, 205],
      [0, 228, 1],
      [-4, 214],
      [-5, 180],
      [-4, 120],
      [-5, 70],
    ],
    4.2,
    m.ring,
    { bevel: 1.4, uv: 1 / 60 },
  );
  blade.material = m.ring;
  box(mm, 2, 55, 0, 44, 6, 10, m.dark, 1.5); // crossguard
  const prof = [
    [-62, 0],
    [-62, 12],
  ];
  for (let i = 0; i < 16; i++) {
    const y = -58 + i * 7;
    prof.push([y, 13.5], [y + 3.5, 14.5], [y + 6.5, 13.5]);
  }
  prof.push([54, 12], [55, 0]);
  const hl = lat(mm, prof, m.leather, { segs: 18 });
  hl.rotation.z = Math.PI / 2;
  const pm = lat(
    mm,
    [
      [-76, 0],
      [-76, 10],
      [-70, 14],
      [-62, 13],
      [-60, 0],
    ],
    m.dark,
    { segs: 18 },
  );
  pm.rotation.z = Math.PI / 2;
  optimize(mm);
  return g;
}

function buildGrenade(m) {
  const g = new THREE.Group();
  const mm = new THREE.Group();
  mm.scale.setScalar(0.001);
  g.add(mm);
  const body = new THREE.Group();
  body.position.y = -6;
  mm.add(body);
  sph(body, 0, 0, 0, 25.5, m.green, 1, 1.22, 1, 20, 14);
  const geos = [];
  for (let i = 0; i < 5; i++)
    for (let j = 0; j < 8; j++) {
      const s = new THREE.SphereGeometry(
        28,
        4,
        3,
        (j * TAU) / 8 + 0.05,
        TAU / 8 - 0.1,
        0.42 + i * 0.47 + 0.04,
        0.47 - 0.08,
      );
      s.scale(1, 1.22, 1);
      geos.push(s.toNonIndexed());
    }
  const blocks = mergeGeometries(
    geos.map((q) => {
      q.clearGroups();
      return q;
    }),
  );
  blocks.computeVertexNormals();
  M(body, blocks, m.green);
  // fuze, spoon, ring + pin
  lat(
    mm,
    [
      [26, 0],
      [26, 8],
      [30, 9],
      [44, 9],
      [46, 7],
      [52, 7],
      [53, 0],
    ],
    m.dark,
    { segs: 16 },
  ).rotation.z = Math.PI / 2;
  tube(
    mm,
    [
      [4, 50, 0],
      [12, 52, 0],
      [17, 44, 0],
      [22, 20, 0],
      [25, 0, 0],
      [22, -20, 0],
    ],
    3,
    m.dark,
    20,
    6,
  ).scale.z = 2.4;
  const pin = part(mm, "pin");
  tor(pin, -14, 42, 0, 12, 1.6, m.ring, "z");
  cylZ(pin, -2, 42, -2, 2, 1.6, m.ring).rotation.z = Math.PI / 2;
  optimize(mm);
  g.userData.pin = mm.getObjectByName("pin");
  return g;
}

function buildBottle(m, color) {
  const g = new THREE.Group();
  const mm = new THREE.Group();
  mm.scale.setScalar(0.001);
  g.add(mm);
  const liquid = new THREE.MeshStandardMaterial({
    color,
    emissive: color,
    emissiveIntensity: 0.9,
    roughness: 0.2,
    transparent: true,
    opacity: 0.9,
  });
  const capMat = new THREE.MeshStandardMaterial({
    color,
    roughness: 0.35,
    metalness: 0.8,
  });
  const prof = [
    [0, 0],
    [0, 27],
    [4, 30],
    [100, 30],
    [128, 20],
    [150, 12.5],
    [168, 12.5],
    [170, 14.5],
    [176, 14],
    [178, 11],
  ];
  lat(mm, prof, m.glass, { segs: 26 }).rotation.z = Math.PI / 2;
  lat(
    mm,
    [
      [3, 0],
      [3, 26.5],
      [100, 26.5],
      [118, 21],
      [118, 0],
    ],
    liquid,
    { segs: 22 },
  ).rotation.z = Math.PI / 2;
  cylY(mm, 0, 36, 86, 0, 30.6, 30.6, m.label, 26);
  cylY(mm, 0, 176, 184, 0, 15, 15, capMat, 18);
  optimize(mm);
  g.userData.liquid = liquid;
  return g;
}

// ======================================================================================
// WeaponSystem
// ======================================================================================

const tmpV = new V3(),
  tmpV2 = new V3(),
  tmpQ = new THREE.Quaternion(),
  tmpE = new THREE.Euler();
const Q_Y90 = new THREE.Quaternion().setFromAxisAngle(
  new V3(0, 1, 0),
  Math.PI / 2,
);

class Spring {
  constructor(k, c, n = 3) {
    this.k = k;
    this.c = c;
    this.x = new Float32Array(n);
    this.v = new Float32Array(n);
  }
  step(dt, target) {
    const n = this.x.length;
    const steps = Math.max(1, Math.ceil(dt / (1 / 240)));
    const h = dt / steps;
    for (let s = 0; s < steps; s++)
      for (let i = 0; i < n; i++) {
        const tg = target ? target[i] : 0;
        this.v[i] += (-this.k * (this.x[i] - tg) - this.c * this.v[i]) * h;
        this.x[i] += this.v[i] * h;
      }
  }
  kick(i, v) {
    this.v[i] += v;
  }
}

function frameFrom(p, r, out = new THREE.Matrix4()) {
  tmpQ.setFromEuler(tmpE.set(r[0], r[1], r[2]));
  return out.compose(
    tmpV.set(p[0], p[1], p[2]),
    tmpQ,
    tmpV2.set(0.001, 0.001, 0.001),
  );
}
const _da = { p: new V3(), q: new THREE.Quaternion(), s: new V3() };
const _db = { p: new V3(), q: new THREE.Quaternion(), s: new V3() };
function blendAnchor(out, a, b, u) {
  if (u <= 0) {
    out.frame.copy(a.frame);
    out.shape.set(a.shape);
    return out;
  }
  if (u >= 1) {
    out.frame.copy(b.frame);
    out.shape.set(b.shape);
    return out;
  }
  a.frame.decompose(_da.p, _da.q, _da.s);
  b.frame.decompose(_db.p, _db.q, _db.s);
  _da.p.lerp(_db.p, u);
  _da.q.slerp(_db.q, u);
  _da.s.lerp(_db.s, u);
  out.frame.compose(_da.p, _da.q, _da.s);
  for (let i = 0; i < out.shape.length; i++)
    out.shape[i] = a.shape[i] + (b.shape[i] - a.shape[i]) * u;
  return out;
}
const STOW = [0.035, -0.26, 0.06, -1.0, 0.18, 0.5];
const newAnchor = () => ({
  frame: new THREE.Matrix4(),
  shape: new Float32Array(63),
});

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
