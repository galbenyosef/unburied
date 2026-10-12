// src__main 05 — game
// Lines 1148-1244 of readable/src__main.pretty.js (statement-aligned).
G.debug = {
  points: (n) => game.debugPoints(n),
  power: () => game.debugPower(),
  give: (id, up) => {
    weapons?.give(id);
    if (up) weapons?.upgrade(id);
  },
  round: (n) => game.debugRound(n),
  tp: (x, z, yaw) => {
    player.pos.set(x, 0, z);
    if (yaw != null) player.yaw = yaw;
  },
  look: (pitch) => {
    player.pitch = pitch;
  },
  aim: (yaw, pitch) => {
    player.yaw = yaw;
    player.pitch = pitch;
  },
  powerup: (type) => game.debugPowerup(type),
  spawn: (n = 1) => {
    for (let i = 0; i < n; i++)
      zombies?.spawn(level.windows[i % level.windows.length], {
        health: 300,
        speed: "walk",
      });
  },
  host: () => hostFlow(),
  join: (code) => joinFlow(code),
  start: () => game.startMatch(),
  keys,
  edges,
  hold: (code, on = true) => {
    keys[code] = on;
  },
  fire: (on = true) => {
    mouseDown = on;
    if (on) edges.firePressed = true;
  },
  ads: (on = true) => {
    adsDown = on;
  },
  hurt: (n) => hurtLocal(n),
  // audit bot: aims at the nearest visible zombie and fires in bursts; reloads when dry
  async bot(ms = 20000, { head = false, range = 30 } = {}) {
    const t0 = performance.now();
    let shots = 0;
    while (performance.now() - t0 < ms && game.phase === "playing") {
      await new Promise((r) => setTimeout(r, 70));
      const p = camera.position;
      let best = null,
        bd = range;
      for (const z of zombies.list) {
        const d = z.pos.distanceTo(p);
        if (d < bd && level.lineOfSight(p, z.pos.clone().setY(1.3))) {
          bd = d;
          best = z;
        }
      }
      const ws = weapons.getState();
      if (ws.mag === 0) {
        edges.reload = true;
        mouseDown = false;
        continue;
      }
      if (!best) {
        mouseDown = false;
        continue;
      }
      const dx = best.pos.x - p.x,
        dz = best.pos.z - p.z,
        dy = best.pos.y + (head ? 1.6 : 1.2) - p.y;
      player.yaw = Math.atan2(-dx, -dz);
      player.pitch = Math.atan2(dy, Math.hypot(dx, dz));
      mouseDown = true;
      edges.firePressed = true;
      shots++;
      await new Promise((r) => setTimeout(r, 40));
      mouseDown = false;
    }
    mouseDown = false;
    const me = game.me;
    return {
      shots,
      kills: me.kills,
      heads: me.headshots,
      points: me.points,
      round: game.S.round,
      alive: zombies.alive,
      hp: player.health,
      phase: game.phase,
    };
  },
};
Object.defineProperty(G, "slotColors", { value: SLOT_COLORS });

boot().catch((e) => fatal("boot error", e));
