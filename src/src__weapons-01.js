// src__weapons 01 — damage
// Lines 1-353 of readable/src__weapons.pretty.js (statement-aligned).
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
