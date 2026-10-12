// First-person player: movement, collision, view angles, recoil, shake, health.
// Motion model: velocity springs toward a wish velocity (momentum on start/stop), sprint with a
// smoothed 0..1 weight + stamina hysteresis (no on/off flicker), stride-locked step phase that the
// camera bob, footstep audio and the weapon viewmodel all share.
import * as THREE from 'three';

const WALK = 4.4, SPRINT = 6.9, CROUCH = 2.3, BACKPEDAL = 0.78, STRAFE = 0.9, DOWNED = 0.9;
const ACCEL = 30, DECEL = 34, AIR_ACCEL = 7;
const GRAVITY = 16, JUMP_V = 5.1;
const EYE = 1.65, EYE_CROUCH = 1.08, EYE_DOWNED = 0.5, RADIUS = 0.34;
const STAMINA_MAX = 6.5;            // seconds of sprint from full
const STAMINA_RESUME = 0.45;        // after exhaustion, sprint unlocks again at 45 %
const STRIDE_WALK = 3.3, STRIDE_SPRINT = 4.3, STRIDE_CROUCH = 2.2;  // metres per full L+R cycle

const damp = (a, b, k, dt) => a + (b - a) * (1 - Math.exp(-k * dt));

export class Player {
  constructor(camera, level, audio) {
    this.camera = camera;
    this.level = level;
    this.audio = audio;
    this.pos = new THREE.Vector3();
    this.vel = new THREE.Vector3();
    this.yaw = 0; this.pitch = 0;
    this.recoilP = 0; this.recoilY = 0;
    this.eye = EYE; this.crouching = false; this.sprinting = false; this.sprint01 = 0;
    this.grounded = true; this.landed = false; this.jumped = false; this.landImpact = 0; this.airTime = 0;
    this.stamina = STAMINA_MAX; this.exhausted = false; this.sprintHold = 0;
    this.maxHealth = 100; this.health = 100;
    this.lastHurt = -99; this.time = 0;
    this.alive = true; this.downed = false;
    this.shakeAmt = 0;
    this.stepPhase = 0; this.lastFoot = 0;
    this.speed01 = 0; this.moving = false; this.vRight = 0; this.vFwd = 0;
    this.dip = 0; this.dipVel = 0; this.roll = 0; this.bobY = 0; this.bobX = 0;
    this.lookDX = 0; this.lookDY = 0;
    this.eyePos = new THREE.Vector3();
    this.frozen = false;
    this.prevShift = false;
    this._fwd = new THREE.Vector3(); this._right = new THREE.Vector3(); this._tmp = new THREE.Vector3();
  }

  spawn(pos, yaw) {
    this.pos.copy(pos); this.pos.y = 0; this.vel.set(0, 0, 0);
    this.yaw = yaw; this.pitch = 0; this.recoilP = this.recoilY = 0;
    this.maxHealth = 100; this.health = 100; this.alive = true; this.downed = false;
    this.stamina = STAMINA_MAX; this.exhausted = false; this.sprint01 = 0; this.sprinting = false;
    this.eye = EYE; this.frozen = false; this.dip = this.dipVel = 0; this.stepPhase = 0;
  }

  look(dx, dy, sens) {
    const k = 0.0022 * sens;
    this.yaw -= dx * k;
    this.pitch = THREE.MathUtils.clamp(this.pitch - dy * k, -1.5, 1.5);
    this.lookDX = dx; this.lookDY = dy;
  }

  addRecoil(p, y) {
    // most of the kick stays (player must pull down); a portion recovers on its own
    this.pitch = THREE.MathUtils.clamp(this.pitch + p * 0.6, -1.5, 1.5);
    this.yaw += y * 0.6;
    this.recoilP += p * 0.4; this.recoilY += y * 0.4;
  }

  shake(a) { this.shakeAmt = Math.min(1.2, this.shakeAmt + a); }

  damage(n) {
    if (!this.alive || this.downed) return false;
    this.health -= n; this.lastHurt = this.time;
    this.shake(0.35);
    this.dipVel -= 0.35;
    if (this.health <= 0) { this.health = 0; this.downed = true; return true; }
    return false;
  }

  cancelSprint() { this.sprintHold = 0.4; }

  get state() {
    return {
      moving: this.moving, sprinting: this.sprinting, crouching: this.crouching, grounded: this.grounded,
      speed01: this.speed01, landed: this.landed, time: this.time,
      vRight: this.vRight, vFwd: this.vFwd, stepPhase: this.stepPhase, airborne: !this.grounded,
      jumped: this.jumped, landImpact: this.landImpact, sprint01: this.sprint01,
      stamina01: this.stamina / STAMINA_MAX, lookDX: this.lookDX, lookDY: this.lookDY,
      downed: this.downed,
    };
  }

  update(dt, keys, opts = {}) {
    this.time += dt;
    const moveMul = opts.moveMul ?? 1;
    this.landed = false; this.jumped = false; this.landImpact = 0;

    // regen: classic — nothing for 2.4 s after a hit, then a fast refill
    if (!this.downed && this.health < this.maxHealth && this.time - this.lastHurt > 2.4)
      this.health = Math.min(this.maxHealth, this.health + dt * this.maxHealth * 0.6);

    const canAct = !this.frozen;
    let fx = 0, fz = 0;
    if (canAct) {
      if (keys.KeyW) fz += 1; if (keys.KeyS) fz -= 1;
      if (keys.KeyD) fx += 1; if (keys.KeyA) fx -= 1;
    }
    this.crouching = !this.downed && canAct && !!(keys.KeyC || keys.ControlLeft);

    // ---- sprint: hold Shift while moving forward. Exhaustion locks it out until stamina recovers
    // past STAMINA_RESUME (hysteresis — no flicker). Firing/ADS cancel it for a short hold-off.
    const shift = !!keys.ShiftLeft || !!keys.ShiftRight;
    if (shift && !this.prevShift) this.sprintHold = Math.min(this.sprintHold, 0.05);
    this.prevShift = shift;
    this.sprintHold = Math.max(0, this.sprintHold - dt);
    if (opts.sprintCancel) this.sprintHold = 0.35;
    if (this.exhausted && this.stamina >= STAMINA_MAX * STAMINA_RESUME) this.exhausted = false;
    const wantSprint = canAct && shift && fz > 0 && !this.crouching && !this.downed && !opts.sprintBlocked
      && !this.exhausted && this.sprintHold <= 0 && this.grounded;
    const wasSprinting = this.sprinting;
    // keep sprinting through a jump arc (grounded requirement only for *starting*)
    this.sprinting = wantSprint || (wasSprinting && !this.grounded && shift && fz > 0 && !this.exhausted);
    if (this.sprinting && this.moving) {
      this.stamina = Math.max(0, this.stamina - dt);
      if (this.stamina <= 0) {
        this.exhausted = true; this.sprinting = false;
        this.audio?.play('breath_exhausted', { volume: 0.55 });
      }
    } else {
      const regen = this.moving ? 0.9 : 1.6;
      this.stamina = Math.min(STAMINA_MAX, this.stamina + dt * regen * (this.exhausted ? 0.9 : 1));
    }
    // smoothed weight: quick to enter, a touch slower to leave so the weapon eases out
    this.sprint01 = damp(this.sprint01, this.sprinting ? 1 : 0, this.sprinting ? 9 : 7, dt);

    // ---- wish velocity
    let speed = this.downed ? DOWNED : this.crouching ? CROUCH : WALK + (SPRINT - WALK) * this.sprint01;
    speed *= moveMul * (opts.perkSpeed ?? 1);
    let wx = fx * STRAFE, wz = fz * (fz < 0 ? BACKPEDAL : 1);
    const wl = Math.hypot(wx, wz);
    if (wl > 1) { wx /= wl; wz /= wl; }
    this._fwd.set(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    this._right.set(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
    const tx = (this._fwd.x * wz + this._right.x * wx) * speed;
    const tz = (this._fwd.z * wz + this._right.z * wx) * speed;

    // accelerate toward the wish velocity (separate accel/decel gives momentum on start + stop)
    const acc = !this.grounded ? AIR_ACCEL : (tx * tx + tz * tz > this.vel.x * this.vel.x + this.vel.z * this.vel.z ? ACCEL : DECEL);
    const dvx = tx - this.vel.x, dvz = tz - this.vel.z, dl = Math.hypot(dvx, dvz);
    if (dl > 1e-6) { const s = Math.min(1, acc * dt / dl); this.vel.x += dvx * s; this.vel.z += dvz * s; }

    // ---- jump / gravity
    if (canAct && !this.downed && keys.Space && this.grounded && !this.crouching) {
      this.vel.y = JUMP_V; this.grounded = false; this.jumped = true;
      this.audio?.play('jump_foley', { volume: 0.5 });
    }
    if (!this.grounded) { this.vel.y -= GRAVITY * dt; this.airTime += dt; }

    // ---- integrate in sub-steps so walls never tunnel
    const hs0 = Math.hypot(this.vel.x, this.vel.z);
    const steps = Math.max(1, Math.ceil(hs0 * dt / 0.12));
    for (let i = 0; i < steps; i++) {
      this.pos.x += this.vel.x * dt / steps;
      this.pos.z += this.vel.z * dt / steps;
      this._tmp.copy(this.pos);
      this.level?.resolveCircle?.(this.pos, RADIUS, 1.8);
      const px = this.pos.x - this._tmp.x, pz = this.pos.z - this._tmp.z, pl = Math.hypot(px, pz);
      if (pl > 1e-5) {        // slide along walls: remove the into-wall velocity component
        const nx = px / pl, nz = pz / pl, vn = this.vel.x * nx + this.vel.z * nz;
        if (vn < 0) { this.vel.x -= vn * nx; this.vel.z -= vn * nz; }
      }
    }
    this.pos.y += this.vel.y * dt;
    if (this.pos.y <= 0) {
      if (!this.grounded) {
        const impact = -this.vel.y;
        this.landed = true; this.landImpact = impact;
        this.dipVel -= Math.min(0.9, impact * 0.075);
        if (impact > 2.5) this.audio?.play('land', { volume: Math.min(1, impact / 7) });
      }
      this.pos.y = 0; this.vel.y = 0; this.grounded = true; this.airTime = 0;
    }

    const hs = Math.hypot(this.vel.x, this.vel.z);
    this.speed01 = Math.min(1, hs / SPRINT);
    this.moving = hs > 0.35;
    this.vFwd = this.vel.x * this._fwd.x + this.vel.z * this._fwd.z;
    this.vRight = this.vel.x * this._right.x + this.vel.z * this._right.z;

    // ---- stride phase (shared with viewmodel + audio). Footfalls at phase 0 and 0.5.
    if (this.grounded && hs > 0.2) {
      const stride = this.crouching ? STRIDE_CROUCH : STRIDE_WALK + (STRIDE_SPRINT - STRIDE_WALK) * this.sprint01;
      const prev = this.stepPhase;
      this.stepPhase = (this.stepPhase + hs * dt / stride) % 1;
      const crossed = (prev < 0.5 && this.stepPhase >= 0.5) || this.stepPhase < prev;
      if (crossed) {
        const vol = this.crouching ? 0.16 : 0.3 + 0.28 * this.sprint01;
        this.audio?.play('footstep_concrete', { volume: vol, pitch: 0.92 + Math.random() * 0.16 });
        if (this.sprint01 > 0.5 && Math.random() < 0.5) this.audio?.play('gear_rattle', { volume: 0.18 });
      }
    } else if (this.grounded) {
      // settle to the nearest foot-planted phase so the next step starts cleanly
      const target = this.stepPhase < 0.25 ? 0 : this.stepPhase < 0.75 ? 0.5 : 1;
      this.stepPhase = damp(this.stepPhase, target, 6, dt) % 1;
    }

    // ---- eye height (crouch / downed) + landing spring
    const targetEye = this.downed ? EYE_DOWNED : this.crouching ? EYE_CROUCH : EYE;
    this.eye = damp(this.eye, targetEye, 11, dt);
    this.dipVel += (-this.dip * 110 - this.dipVel * 15) * dt;
    this.dip += this.dipVel * dt;

    // recoil recovery
    const rec = 1 - Math.exp(-7 * dt);
    this.recoilP -= this.recoilP * rec; this.recoilY -= this.recoilY * rec;

    // ---- camera: stride-locked bob (dips on each footfall), gentle sway, strafe lean
    const amp = this.grounded ? Math.min(1, hs / WALK) : 0;
    const ph = this.stepPhase * Math.PI * 2;
    const vBob = -Math.abs(Math.sin(ph)) * 0.026 * amp * (1 + 0.5 * this.sprint01) + 0.013 * amp;
    const hBob = Math.sin(ph) * 0.012 * amp * (1 + 0.6 * this.sprint01);
    this.bobY = damp(this.bobY, vBob, 18, dt);
    this.bobX = damp(this.bobX, hBob, 18, dt);
    const lean = THREE.MathUtils.clamp(-this.vRight / WALK, -1, 1) * 0.012 + Math.sin(ph) * 0.004 * amp * this.sprint01;
    this.roll = damp(this.roll, lean, 8, dt);

    this.shakeAmt = Math.max(0, this.shakeAmt - dt * 2.2);
    const t = this.time, s = this.shakeAmt * this.shakeAmt;
    const shP = (Math.sin(t * 53) + Math.sin(t * 31.7)) * 0.012 * s;
    const shY = (Math.sin(t * 47.3) + Math.sin(t * 29.1)) * 0.012 * s;
    const shR = Math.sin(t * 39.3) * 0.02 * s;
    this.eyePos.set(
      this.pos.x + this._right.x * this.bobX,
      this.pos.y + this.eye + this.dip + this.bobY,
      this.pos.z + this._right.z * this.bobX);
    this.camera.position.copy(this.eyePos);
    const downedRoll = this.downed ? 0.3 : 0;
    this.camera.rotation.set(this.pitch + this.recoilP + shP, this.yaw + this.recoilY + shY, this.roll + shR + downedRoll, 'YXZ');
  }
}
