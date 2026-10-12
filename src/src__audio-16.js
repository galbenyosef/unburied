// src__audio 16 — math
// Lines 4312-4592 of readable/src__audio.pretty.js (statement-aligned).
const MIX = {
  shot_upgraded: [-15, 3],
  dryfire: [-19, 3],
  mag_out: [-18, 3],
  mag_in: [-17, 3],
  bolt_back: [-17, 3],
  bolt_forward: [-16, 3],
  slide_release: [-16, 2],
  pump: [-16, 3],
  shell_insert: [-18, 3],
  weapon_raise: [-22, 2],
  weapon_swap: [-22, 2],
  knife_swing: [-18, 3],
  knife_hit: [-13, 3],
  knife_miss: [-20, 2],
  grenade_pin: [-20, 2],
  grenade_throw: [-20, 2],
  grenade_bounce: [-16, 3],
  explosion: [-6, 3],
  aether_impact: [-10, 3],
  hitmarker: [-21, 2],
  hitmarker_kill: [-19, 2],
  headshot: [-14, 3],
  flesh_impact: [-16, 5],
  bullet_concrete: [-17, 4],
  bullet_wood: [-17, 4],
  bullet_metal: [-17, 4],
  shell_drop: [-25, 5],
  zombie_groan: [-20, 8],
  zombie_growl: [-18, 6],
  zombie_scream: [-15, 3],
  zombie_attack: [-15, 5],
  zombie_death: [-17, 5],
  zombie_spawn: [-17, 3],
  zombie_footstep: [-22, 5],
  plank_tear: [-15, 3],
  plank_place: [-16, 3],
  plank_rebuild_points: [-22, 1],
  buy: [-17, 2],
  deny: [-19, 1],
  door_open: [-13, 2],
  box_open: [-16, 2],
  box_spin: [-18, 1],
  box_close: [-16, 2],
  box_bye: [-16, 2],
  powerup_spawn: [-16, 2],
  powerup_loop: [-24, 1],
  powerup_grab: [-15, 2],
  maxammo: [-12, 1],
  instakill: [-12, 1],
  doublepoints: [-12, 1],
  nuke: [-12, 1],
  carpenter: [-12, 1],
  powerup_end: [-18, 1],
  player_hurt: [-14, 4],
  heartbeat: [-16, 2],
  player_down: [-12, 1],
  footstep_concrete: [-23, 6],
  footstep_wood: [-23, 6],
  jump: [-24, 2],
  land: [-19, 3],
  perk_drink: [-17, 1],
  perk_burp: [-15, 2],
  power_switch: [-12, 1],
  ui_hover: [-30, 2],
  ui_click: [-25, 2],
  ambient_wind: [-23, 1],
  ambient_drone: [-23, 1],
  ads_in: [-22, 3],
  ads_out: [-24, 3],
  gear_rattle: [-25, 5],
  jump_foley: [-24, 3],
  slide_step: [-19, 4],
  breath_exhausted: [-20, 3],
  revive_start: [-18, 2],
  revive_loop: [-24, 1],
  revive_done: [-15, 2],
  player_join: [-20, 1],
  player_leave: [-20, 1],
  chat: [-24, 2],
  teammate_down: [-16, 1],
  bleedout: [-14, 1],
};
for (const [name, [loud, n]] of Object.entries(MIX))
  if (DEFS[name]) Object.assign(DEFS[name], { loud, n, vol: 1 });
DEFS.explosion.soft = 2.2;
for (const n of [
  "knife_hit",
  "headshot",
  "bullet_concrete",
  "bullet_wood",
  "bullet_metal",
  "flesh_impact",
  "power_switch",
  "door_open",
])
  DEFS[n].soft = 1.5;
const CEIL = 0.8;
// background render order (first pass renders 1–2 variants of each, second pass the rest)
const PRIORITY = [
  "ui_hover",
  "ui_click",
  "shot_pistol",
  "dryfire",
  "mag_out",
  "mag_in",
  "slide_release",
  "weapon_raise",
  "ads_in",
  "ads_out",
  "hitmarker",
  "hitmarker_kill",
  "zombie_groan",
  "footstep_concrete",
  "flesh_impact",
  "headshot",
  "bullet_concrete",
  "zombie_attack",
  "zombie_death",
  "zombie_spawn",
  "zombie_footstep",
  "plank_tear",
  "ambient_wind",
  "ambient_drone",
  "knife_swing",
  "knife_hit",
  "knife_miss",
  "player_hurt",
  "buy",
  "deny",
  "shell_drop",
  "plank_place",
  "plank_rebuild_points",
  "zombie_growl",
  "zombie_scream",
  "weapon_swap",
  "land",
  "jump",
  "shot_rifle",
  "bolt_back",
  "bolt_forward",
  "shot_shotgun",
  "pump",
  "shell_insert",
  "shot_smg",
  "shot_smg2",
  "shot_assault",
  "shot_lmg",
  "shot_aether",
  "aether_impact",
  "shot_upgraded",
  "grenade_pin",
  "grenade_throw",
  "grenade_bounce",
  "explosion",
  "bullet_wood",
  "bullet_metal",
  "footstep_wood",
  "door_open",
  "box_open",
  "box_spin",
  "box_close",
  "box_bye",
  "powerup_spawn",
  "powerup_loop",
  "powerup_grab",
  "maxammo",
  "instakill",
  "doublepoints",
  "nuke",
  "carpenter",
  "powerup_end",
  "heartbeat",
  "player_down",
  "perk_drink",
  "perk_burp",
  "power_switch",
  "gear_rattle",
  "jump_foley",
  "slide_step",
  "breath_exhausted",
  "player_join",
  "player_leave",
  "chat",
  "teammate_down",
  "revive_start",
  "revive_loop",
  "revive_done",
  "bleedout",
];
// gun layers: tail + mech right behind their core, distant variants after the first-pass essentials
for (let i = PRIORITY.length - 1; i >= 0; i--) {
  const n = PRIORITY[i];
  if (DEFS[n] && DEFS[n].gun)
    PRIORITY.splice(
      i + 1,
      0,
      ...[n + ":tail", n + ":mech"].filter((x) => DEFS[x]),
    );
}
PRIORITY.splice(
  PRIORITY.indexOf("shot_rifle"),
  0,
  ...Object.keys(GUNS).map((n) => n + ":far"),
);
for (const n of Object.keys(DEFS)) if (!PRIORITY.includes(n)) PRIORITY.push(n);

// ───────────────────────────────────────────────────────────── offline rendering
const LOOPXF = 1.0;
const RSTATS = [];
function maxWindowRms(chans, sr) {
  const w = Math.max(1, Math.floor(sr * 0.05)),
    hop = Math.max(1, w >> 2),
    n = chans[0].length,
    nc = chans.length;
  if (n <= w) {
    let sum = 0;
    for (let i = 0; i < n; i++) {
      let x = 0;
      for (let k = 0; k < nc; k++) x += chans[k][i];
      x /= nc;
      sum += x * x;
    }
    return Math.sqrt(sum / Math.max(1, n));
  }
  const sq = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    let x = chans[0][i];
    for (let k = 1; k < nc; k++) x += chans[k][i];
    x /= nc;
    sq[i] = x * x;
  }
  let sum = 0;
  for (let i = 0; i < w; i++) sum += sq[i];
  let best = sum;
  for (let s = 0; s + w < n; s++) {
    sum += sq[s + w] - sq[s];
    if ((s & (hop - 1)) === 0 && sum > best) best = sum;
  }
  return Math.sqrt(Math.max(0, best) / w);
}
// deferred construction for offline contexts: group callbacks per render quantum, run them at suspend() points
function installDefer(
  oc,
  sr,
  run = (fn) => {
    try {
      fn();
    } catch (e) {
      console.error("[audio] deferred build failed", e);
    }
  },
) {
  const Q = 128,
    pend = new Map(),
    ctl = { started: false };
  oc.__defer = (time, fn) => {
    const cur = ctl.started ? Math.round(oc.currentTime * sr) : 0;
    const q = Math.floor((Math.max(0, time) * sr) / Q) * Q;
    if (q <= cur || q >= oc.length) return run(fn);
    let list = pend.get(q);
    if (!list) {
      list = [];
      pend.set(q, list);
      oc.suspend(q / sr)
        .then(
          () => {
            pend.delete(q);
            for (const f of list) run(f);
          },
          (e) => {
            console.warn("[audio] suspend rejected", q, e && e.message);
            for (const f of list) run(f);
          },
        )
        .finally(() => oc.resume().catch(() => {}));
    }
    list.push(fn);
  };
  return ctl;
}
