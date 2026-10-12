// src__game 01 — host
// Lines 1-59 of readable/src__game.pretty.js (statement-aligned).
// UNBURIED — game rules + co-op session layer.
//
// Model: the HOST is authoritative for everything (zombies, rounds, economy, doors, box, anvil, perks,
// power-ups, downs/revives). Every state change is decided on the host and published as an EVENT that is
// applied through the same `apply()` on every machine (host included). Clients own only their own
// movement, weapon and health; they send requests (`use`, `hit`, `boom`, `down`, ...) to the host.
// Solo = host with zero peers — the exact same code path.
import * as THREE from "three";

const FL = {
  SPRINT: 1,
  CROUCH: 2,
  ADS: 4,
  GROUND: 8,
  RELOAD: 16,
  DOWN: 32,
  REVIVING: 64,
  SPEC: 128,
};
export const SLOT_COLORS = ["#e9e4d8", "#4f8fe6", "#e6c14f", "#5cc26b"];
export const PERK_INFO = {
  ironhide: { name: "Iron Hide", color: "#c22a1c" },
  quickhands: { name: "Quick Hands", color: "#3fae4a" },
  rapidfire: { name: "Rapid Fire", color: "#e0a526" },
  secondwind: { name: "Second Wind", color: "#3d7fd6" },
};
const BOX_POOL = [
  "kar98k",
  "trench",
  "mp40",
  "thompson",
  "stg44",
  "mg42",
  "aether",
];
const PU_NAMES = {
  maxammo: "MAX AMMO",
  instakill: "INSTA-KILL",
  doublepoints: "DOUBLE POINTS",
  nuke: "KABOOM",
  carpenter: "CARPENTER",
};
const REVIVE_TIME = 3.2,
  BLEED_TIME = 30,
  SNAP_DT = 1 / 20,
  PS_DT = 1 / 30,
  SYNC_DT = 2;
const MAX_ALIVE = 24;

const r2 = (v) => Math.round(v * 100) / 100;
const r3 = (v) => Math.round(v * 1000) / 1000;
const A = (v) => [r2(v.x), r2(v.y), r2(v.z)];
const V = (a, out = new THREE.Vector3()) =>
  out.set(+a[0] || 0, +a[1] || 0, +a[2] || 0);
const clean = (s, n) =>
  String(s ?? "")
    .replace(/[\u0000-\u001f<>]/g, "")
    .slice(0, n);

