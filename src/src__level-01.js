// src__level 01 — math
// Lines 1-131 of readable/src__level.pretty.js (statement-aligned).
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

import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

const WALL_H = 3.6,
  WT = 0.4,
  HW = WT / 2;
const WIN_W = 1.3,
  WIN_Y0 = 0.85,
  WIN_Y1 = 2.25;
const DOOR_W = 2.4,
  DOOR_H = 2.7;
const NAV_R = 0.4; // nav clearance radius
const NAV_RES = 0.2; // occupancy grid resolution
const NAV_BLOCK = 5; // nodes every 5 cells (1 m)

function mulberry32(a) {
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const easeOut = (k) => 1 - Math.pow(1 - k, 3);
const easeIn = (k) => k * k * k;
const easeInOut = (k) =>
  k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
const yawFromDir = (dx, dz) => Math.atan2(-dx, -dz);

// ---------------------------------------------------------------------------------------------
// geometry helpers
function prep(g) {
  if (g.index) g = g.toNonIndexed();
  for (const k of Object.keys(g.attributes))
    if (k !== "position" && k !== "normal" && k !== "uv") g.deleteAttribute(k);
  if (!g.attributes.normal) g.computeVertexNormals();
  if (!g.attributes.uv)
    g.setAttribute(
      "uv",
      new THREE.BufferAttribute(
        new Float32Array(g.attributes.position.count * 2),
        2,
      ),
    );
  g.morphAttributes = {};
  g.clearGroups();
  return g;
}
// box-projected UVs, `scale` = uv units per metre (0.5 => 1 tile per 2 m)
function projUV(g, scale = 0.5, ox = 0, oy = 0) {
  const p = g.attributes.position,
    n = g.attributes.normal,
    uv = g.attributes.uv;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i),
      y = p.getY(i),
      z = p.getZ(i);
    const ax = Math.abs(n.getX(i)),
      ay = Math.abs(n.getY(i)),
      az = Math.abs(n.getZ(i));
    let u, v;
    if (ay >= ax && ay >= az) {
      u = x;
      v = z;
    } else if (ax >= az) {
      u = z;
      v = y;
    } else {
      u = x;
      v = y;
    }
    uv.setXY(i, u * scale + ox, v * scale + oy);
  }
  uv.needsUpdate = true;
  return g;
}

function canvasTex(w, h, draw, srgb = true) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const g = c.getContext("2d");
  draw(g, w, h);
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

// segment vs AABB slab test
function segHitsBox(ax, ay, az, bx, by, bz, b) {
  let tmin = 0,
    tmax = 1;
  const o = [ax, ay, az],
    d = [bx - ax, by - ay, bz - az];
  const mn = [b.min.x, b.min.y, b.min.z],
    mx = [b.max.x, b.max.y, b.max.z];
  for (let i = 0; i < 3; i++) {
    if (Math.abs(d[i]) < 1e-9) {
      if (o[i] < mn[i] || o[i] > mx[i]) return false;
    } else {
      let t1 = (mn[i] - o[i]) / d[i],
        t2 = (mx[i] - o[i]) / d[i];
      if (t1 > t2) {
        const s = t1;
        t1 = t2;
        t2 = s;
      }
      if (t1 > tmin) tmin = t1;
      if (t2 < tmax) tmax = t2;
      if (tmin > tmax) return false;
    }
  }
  return true;
}

// ---------------------------------------------------------------------------------------------
