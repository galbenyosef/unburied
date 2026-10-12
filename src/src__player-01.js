// src__player 01 — sprint
// Lines 1-29 of readable/src__player.pretty.js (statement-aligned).
// First-person player: movement, collision, view angles, recoil, shake, health.
// Motion model: velocity springs toward a wish velocity (momentum on start/stop), sprint with a
// smoothed 0..1 weight + stamina hysteresis (no on/off flicker), stride-locked step phase that the
// camera bob, footstep audio and the weapon viewmodel all share.
import * as THREE from "three";

const WALK = 4.4,
  SPRINT = 6.9,
  CROUCH = 2.3,
  BACKPEDAL = 0.78,
  STRAFE = 0.9,
  DOWNED = 0.9;
const ACCEL = 30,
  DECEL = 34,
  AIR_ACCEL = 7;
const GRAVITY = 16,
  JUMP_V = 5.1;
const EYE = 1.65,
  EYE_CROUCH = 1.08,
  EYE_DOWNED = 0.5,
  RADIUS = 0.34;
const STAMINA_MAX = 6.5; // seconds of sprint from full
const STAMINA_RESUME = 0.45; // after exhaustion, sprint unlocks again at 45 %
const STRIDE_WALK = 3.3,
  STRIDE_SPRINT = 4.3,
  STRIDE_CROUCH = 2.2; // metres per full L+R cycle

const damp = (a, b, k, dt) => a + (b - a) * (1 - Math.exp(-k * dt));

