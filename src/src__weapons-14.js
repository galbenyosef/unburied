// src__weapons 14 — drift
// Lines 4048-4324 of readable/src__weapons.pretty.js (statement-aligned).
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
