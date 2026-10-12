// src__textures 01 — maps
// Lines 1-73 of readable/src__textures.pretty.js (statement-aligned).
// UNBURIED — procedural material library (textures agent).
//
// Everything here is generated at load time: tileable Perlin fBm / Worley fields in typed arrays,
// canvas-2D strokes for cracks / scratches / tears, height maps -> Sobel normal maps, and packed
// ORM data maps (R = ambient occlusion, G = roughness, B = metalness — three.js reads exactly those
// channels, so one texture feeds aoMap + roughnessMap + metalnessMap).
//
// Conventions (see docs/CONTRACT.md):
//   architecture: 1 tile = 2 m x 2 m (consumers use UV = metres / 2), 1024^2
//   props / characters: 1 tile ~= 0.3 m, 512^2
//   wood_board: 1 plank (1.2 m x 0.2 m) over UV 0..1, grain along U
//   grain / board direction for every wood runs along U (texture X). "Down" (drips, streaks) is -V.

import * as THREE from "three";

const ARCH = [
  "brick_old",
  "concrete_wall",
  "concrete_floor",
  "plaster_damaged",
  "wood_planks",
  "wood_floor",
  "tile_floor",
  "metal_painted_green",
  "metal_rusty",
  "corrugated_metal",
  "dirt_ground",
  "sandbag",
  "crate_wood",
  "wood_board",
];
const PROPS = [
  "gun_metal",
  "gun_metal_parkerized",
  "wood_stock",
  "bakelite",
  "brass",
  "leather",
  "rubber_black",
  "cloth_canvas",
  "cloth_fieldgrey",
  "skin_rotten",
  "bone",
  "helmet_steel",
  "glove_leather",
  "sleeve_olive",
  "packed_camo",
];
// rough relative generation cost (for pool scheduling only)
const COST = {
  brick_old: 8,
  wood_planks: 8,
  concrete_floor: 6,
  concrete_wall: 6,
  skin_rotten: 3,
  plaster_damaged: 3,
  tile_floor: 3,
  wood_floor: 3,
  gun_metal: 3,
  gun_metal_parkerized: 3,
  crate_wood: 2.5,
  dirt_ground: 2.5,
  sandbag: 2.5,
  corrugated_metal: 2.5,
  metal_painted_green: 2.5,
  metal_rusty: 2.5,
  helmet_steel: 2,
};

// ------------------------------------------------------------------------------------------------
// GEN(): the whole pure generator (no THREE, no DOM beyond OffscreenCanvas). It is self-contained so
// its source can be shipped to Blob workers via GEN.toString() and run in parallel.
// ------------------------------------------------------------------------------------------------
