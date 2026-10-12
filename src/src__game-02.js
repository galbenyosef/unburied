// src__game 02 — pos
// Lines 60-2240 of readable/src__game.pretty.js (statement-aligned).
export function createGame(ctx) {
  const { level, zombies, weapons, fx, hud, player, camera } = ctx;
  const avatars = ctx.avatars || null;
  const NetMod = ctx.NetMod || null;

  // ------------------------------------------------------------------ state
  const S = {
    mode: "solo",
    net: null,
    selfId: "p0",
    phase: "menu", // menu | lobby | playing | dying | gameover
    round: 0,
    power: false,
    timed: { instakill: 0, doublepoints: 0 },
    box: null,
    anvil: null,
    powerups: new Map(),
    puSeq: 1,
    // host-only
    rs: { toSpawn: 0, spawnT: 0, betweenT: 0, health: 150, drops: 0 },
    snapT: 0,
    psT: 0,
    syncT: 0,
    startTime: 0,
    dyingT: 0,
    lastStats: null,
    selfReviveT: 0,
    reviving: null,
    reviveLocalT: 0,
    rebuildT: 0,
    hitBudget: 0,
    zombieHits: [],
  };
  const players = new Map();
  let me = null;

  const isHost = () => S.mode !== "client";
  const netOn = () => !!S.net;
  const now = () => performance.now() / 1000;
  const serverTime = () => (S.net ? S.net.serverTime() : now());

  function newPlayer(id, name, slot, isLocal) {
    return {
      id,
      name: clean(name, 16) || "Soldier",
      slot: slot | 0,
      isLocal,
      points: 500,
      kills: 0,
      headshots: 0,
      downs: 0,
      revives: 0,
      perks: new Set(),
      downed: false,
      spectating: false,
      bleedT: 0,
      selfRevive: false,
      reviveT: 0,
      reviver: null,
      rebuildPts: 0,
      connected: true,
      lastPs: 0,
      st: [0, 0, 0, 0, 0, 0, 0, FL.GROUND, "m1911", 0],
      buf: NetMod ? new NetMod.SnapshotBuffer() : null,
      pos: new THREE.Vector3(),
      eye: new THREE.Vector3(),
    };
  }
  function resetSolo() {
    players.clear();
    me = newPlayer("p0", ctx.getName?.() || "Soldier", 0, true);
    players.set(me.id, me);
    S.selfId = me.id;
  }
  resetSolo();

  // ------------------------------------------------------------------ plumbing
  const handlers = {}; // event handlers (all machines)
  const requests = {}; // request handlers (host only)

  function emit(type, data = {}) {
    // host → everyone (including itself)
    if (!isHost()) return;
    if (S.net) {
      try {
        S.net.send(type, data, { to: "*" });
      } catch (e) {
        console.warn("send", type, e);
      }
    }
    apply(type, data);
  }
  function emitTo(pid, type, data = {}) {
    if (!isHost()) return;
    if (pid === S.selfId) apply(type, data);
    else if (S.net) S.net.send(type, data, { to: pid });
  }
  const evlog = []; // last events applied (debug / audits)
  function apply(type, data) {
    if (type !== "snap" && type !== "pts" && type !== "sync") {
      evlog.push(type);
      if (evlog.length > 60) evlog.shift();
    }
    const h = handlers[type];
    if (!h) return;
    try {
      h(data);
    } catch (e) {
      console.error("apply", type, e);
    }
  }
  function request(type, data = {}) {
    if (isHost()) {
      handleRequest(S.selfId, type, data);
      return;
    }
    try {
      S.net?.send(type, data, { to: "host" });
    } catch (e) {
      console.warn("request", type, e);
    }
  }
  function handleRequest(from, type, data) {
    const h = requests[type];
    const p = players.get(from);
    if (!h || !p) return;
    try {
      h(p, data || {});
    } catch (e) {
      console.error("request", type, e);
    }
  }

  const EVENT_TYPES = [
    "start",
    "restart",
    "full",
    "round",
    "pts",
    "zs",
    "zh",
    "zk",
    "door",
    "power",
    "box",
    "anvil",
    "perk",
    "give",
    "refill",
    "upgrade",
    "deny",
    "pu+",
    "pu!",
    "pu-",
    "timed",
    "hurt",
    "down",
    "revive",
    "bleed",
    "respawn",
    "fx",
    "wev",
    "chat",
    "gameover",
    "sync",
    "snap",
    "feed",
    "nukepts",
  ];
  const REQUEST_TYPES = [
    "ps",
    "hit",
    "boom",
    "use",
    "down",
    "selfrevive",
    "revive",
    "wev",
    "chat",
  ];

  function attachNet(net) {
    S.net = net;
    S.mode = net.role;
    S.selfId = net.selfId;
    if (isHost())
      for (const t of REQUEST_TYPES)
        net.on(t, (d, from) => handleRequest(from, t, d));
    else for (const t of EVENT_TYPES) net.on(t, (d) => apply(t, d));
    net.onRoster((r) => syncRoster(r));
    net.onPeerJoin?.((peer) => {
      if (isHost() && (S.phase === "playing" || S.phase === "dying"))
        setTimeout(() => sendFull(peer.id), 150);
    });
    net.onPeerLeave?.((peer, reason) => onPeerLeft(peer, reason));
    net.onClose((reason) => ctx.onNetClosed?.(reason));
    syncRoster(net.roster);
    if (!me || me.id !== S.selfId) {
      me = newPlayer(S.selfId, ctx.getName?.() || "Soldier", 0, true);
      players.set(me.id, me);
    }
  }

  function syncRoster(roster = []) {
    const seen = new Set();
    for (const r of roster) {
      seen.add(r.id);
      let p = players.get(r.id);
      if (!p) {
        p = newPlayer(r.id, r.name, r.slot, r.id === S.selfId);
        players.set(r.id, p);
        if (!p.isLocal) {
          avatars?.add(r.id, { name: p.name, slot: p.slot });
          if (S.phase === "playing") {
            hud?.feed?.(`${p.name} joined the fight`, p.slot);
            sfx("player_join");
          }
        }
      }
      p.name = clean(r.name, 16) || p.name;
      p.slot = r.slot | 0;
      p.ping = r.ping;
      if (p.isLocal) {
        me = p;
        weapons?.setCharacter?.(p.slot);
        hud?.setLocalSlot?.(p.slot);
      }
    }
    for (const [id, p] of players)
      if (!seen.has(id) && !p.isLocal) removePlayer(id);
    // drop the solo placeholder once we have a real id
    for (const [id, p] of players)
      if (p.isLocal && id !== S.selfId) players.delete(id);
    ctx.onRoster?.(lobbyView());
    refreshTeamHud();
  }
  function removePlayer(id) {
    const p = players.get(id);
    if (!p) return;
    players.delete(id);
    avatars?.remove(id);
    if (S.phase === "playing" || S.phase === "dying") {
      hud?.feed?.(`${p.name} left the game`, p.slot);
      sfx("player_leave");
    }
    if (isHost()) {
      if (S.box && S.box.by === id && S.box.phase !== "moving")
        emit("box", { phase: "close" });
      if (S.anvil && S.anvil.by === id)
        emit("anvil", { phase: "take", by: null });
      for (const q of players.values())
        if (q.reviver === id) {
          q.reviver = null;
          q.reviveT = 0;
        }
      checkAllDown();
    }
    refreshTeamHud();
  }
  function onPeerLeft(peer) {
    removePlayer(peer.id);
  }

  function lobbyView() {
    const roster = S.net
      ? S.net.roster
      : [{ id: S.selfId, name: me.name, slot: 0, isHost: true, ping: 0 }];
    return {
      code: S.net?.code || "",
      inviteUrl: S.net?.inviteUrl || "",
      isHost: isHost(),
      players: roster.map((r) => ({
        id: r.id,
        name: r.name,
        slot: r.slot,
        ping: r.ping ?? 0,
        isLocal: r.id === S.selfId,
        isHost: !!r.isHost,
      })),
      status: isHost()
        ? roster.length > 1
          ? `${roster.length} soldiers ready`
          : "Share the code — friends can join any time, even mid-game"
        : "Waiting for the host to start",
    };
  }

  // ------------------------------------------------------------------ helpers
  function sfx(name, opts) {
    ctx.sfx?.(name, opts);
  }
  function sting(name, opts) {
    ctx.sting?.(name, opts);
  }
  const mult = () => (S.timed.doublepoints > 0 ? 2 : 1);
  const alivePlayers = () =>
    [...players.values()].filter((p) => !p.downed && !p.spectating);
  const startFor = (p) => {
    const starts = level.playerStarts?.length
      ? level.playerStarts
      : [level.playerStart];
    return starts[p.slot % starts.length] || level.playerStart;
  };
  function refreshTeamHud() {
    hud?.setTeamPoints?.(
      [...players.values()]
        .sort((a, b) => a.slot - b.slot)
        .map((p) => ({
          id: p.id,
          name: p.name,
          slot: p.slot,
          points: p.points,
          isLocal: p.isLocal,
          downed: p.downed || p.spectating,
        })),
    );
  }

  // pending point deltas are batched per frame into one 'pts' event
  const ptsQueue = new Map();
  function award(pid, n, raw = false) {
    const p = players.get(pid);
    if (!p) return;
    const v = raw ? n : n * mult();
    p.points += v;
    const q = ptsQueue.get(pid) || [];
    q.push(v);
    ptsQueue.set(pid, q);
  }
  function spend(p, n) {
    if (p.points < n) {
      emitTo(p.id, "deny", {});
      return false;
    }
    p.points -= n;
    const q = ptsQueue.get(p.id) || [];
    q.push(-n);
    ptsQueue.set(p.id, q);
    return true;
  }
  function flushPoints() {
    if (!ptsQueue.size) return;
    const list = [];
    for (const [id, ds] of ptsQueue) {
      const p = players.get(id);
      if (p) list.push([id, p.points, ds]);
    }
    ptsQueue.clear();
    emit("pts", { list });
  }

  // ------------------------------------------------------------------ rounds (host)
  function zombiesForRound(r, n) {
    const base =
      r <= 5
        ? [0, 6, 8, 13, 18, 24][r]
        : Math.round(24 + (r - 5) * 5 + Math.pow(r - 5, 1.6));
    return Math.round(base * (1 + 0.55 * (n - 1)));
  }
  const healthForRound = (r) =>
    r < 10 ? 150 + 100 * (r - 1) : Math.round(950 * Math.pow(1.1, r - 9));
  function speedFor(r) {
    const x = Math.random();
    if (r <= 2) return "walk";
    if (r <= 4) return x < 0.35 * (r - 2) ? "run" : "walk";
    if (r <= 7)
      return x < 0.12 * (r - 4) ? "sprint" : x < 0.85 ? "run" : "walk";
    return x < Math.min(0.85, 0.3 + (r - 7) * 0.08) ? "sprint" : "run";
  }
  function beginRound(n) {
    S.rs = {
      toSpawn: zombiesForRound(n, Math.max(1, players.size)),
      spawnT: n === 1 ? 2.5 : 1.5,
      betweenT: 0,
      health: healthForRound(n),
      drops: 0,
    };
    for (const p of players.values()) p.rebuildPts = 0;
    emit("round", { n, phase: "start" });
    // bled-out players come back at the start of each round
    for (const p of players.values())
      if (p.spectating) emit("respawn", { id: p.id });
  }
  function hostRounds(dt) {
    const rs = S.rs;
    if (rs.betweenT > 0) {
      rs.betweenT -= dt;
      if (rs.betweenT <= 0) beginRound(S.round + 1);
      return;
    }
    if (rs.toSpawn > 0) {
      rs.spawnT -= dt;
      if (rs.spawnT <= 0 && zombies.alive < MAX_ALIVE) {
        const wins = level.windows
          .map((w, i) => ({ w, i }))
          .filter(({ w }) => level.isZoneOpen(w.zone));
        const targets = alivePlayers();
        if (wins.length && targets.length) {
          const t = targets[(Math.random() * targets.length) | 0];
          wins.sort(
            (a, b) =>
              a.w.outsidePos.distanceToSquared(t.pos) -
              b.w.outsidePos.distanceToSquared(t.pos),
          );
          const pick =
            wins[
              Math.min(
                wins.length - 1,
                Math.floor(
                  Math.pow(Math.random(), 1.8) * Math.min(5, wins.length),
                ),
              )
            ];
          const z = zombies.spawn(pick.w, {
            health: rs.health,
            speed: speedFor(S.round),
          });
          if (z && S.net) {
            const ns = z.netSpawn?.();
            if (ns) S.net.send("zs", ns, { to: "*" });
          }
          rs.toSpawn--;
        }
        rs.spawnT =
          (Math.max(0.3, 2.4 - S.round * 0.16) * (0.6 + Math.random() * 0.8)) /
          Math.sqrt(Math.max(1, players.size));
      }
    } else if (zombies.alive === 0) {
      rs.betweenT = 9.5;
      emit("round", { n: S.round, phase: "end" });
    }
  }

  // ------------------------------------------------------------------ zombie events (host)
  zombies.onAttack = (dmg, pid) => {
    if (S.phase !== "playing") return;
    const target = pid ?? S.selfId;
    emitTo(target, "hurt", { to: target, dmg: dmg ?? 45 });
  };
  zombies.onKill = (z, { headshot, info = {} } = {}) => {
    if (!isHost()) return;
    const by = info.by ?? null;
    const kd = z.deathDir || info.dir,
      kp = z.deathPoint || info.point;
    if (S.net)
      S.net.send(
        "zk",
        {
          id: z.id,
          headshot: !!headshot,
          dv: z.deathVariant ?? info.deathVariant ?? null,
          dir: kd ? A(kd) : null,
          point: kp ? A(kp) : null,
          explosive: !!info.explosive,
          nuke: !!info.nuke,
          by,
        },
        { to: "*" },
      );
    apply("zk", { id: z.id, headshot, by, local: true });
    if (info.nuke) return;
    const p = players.get(by);
    if (p) {
      p.kills++;
      if (headshot) p.headshots++;
      award(p.id, info.melee ? 130 : headshot ? 100 : 60);
    }
    const pos = z.pos;
    if (
      pos &&
      S.rs.drops < 4 &&
      Math.random() < 0.028 &&
      level.zoneAt(pos) >= 0
    ) {
      S.rs.drops++;
      const types = [
        "maxammo",
        "instakill",
        "doublepoints",
        "nuke",
        "carpenter",
      ];
      emit("pu+", {
        uid: S.puSeq++,
        type: types[(Math.random() * types.length) | 0],
        pos: [r2(pos.x), 0.9, r2(pos.z)],
      });
    }
  };
  function hostDamage(by, zid, dmg, part, point, dir, info = {}) {
    const z = zombies.byId?.(zid);
    if (!z || z.dead || z.dying) return { killed: false, headshot: false };
    const r =
      zombies.damage(z, dmg, part, point, dir, { ...info, by, point, dir }) ||
      {};
    if (!r.killed) {
      award(by, 10);
      if (S.net && S.hitBudget > 0) {
        S.hitBudget--;
        S.net.send(
          "zh",
          { id: zid, part, point: A(point), dir: A(dir), by },
          { to: "*" },
        );
      }
    }
    return r;
  }

  // ------------------------------------------------------------------ event handlers (all machines)
  handlers.start = () => {
    enterMatch();
  };
  handlers.restart = () => {
    enterMatch();
  };
  handlers.full = (d) => {
    enterMatch({ late: true });
    S.round = d.round;
    hud?.setRound?.(d.round, false);
    applySync(d.sync);
    for (const ns of d.zombies || []) zombies.spawnRemote?.(ns);
    for (const pu of d.powerups || []) handlers["pu+"](pu);
    if (d.box) handlers.box({ ...d.box, silent: true });
    if (d.anvil) handlers.anvil({ ...d.anvil, silent: true });
  };
  handlers.round = ({ n, phase }) => {
    if (phase === "start") {
      S.round = n;
      hud?.setRound?.(n, n > 1);
      if (n > 1) {
        sting("round_start");
        weapons?.setGrenades?.(
          Math.min(4, (weapons.getState().grenades || 0) + 2),
        );
      }
    } else {
      sting("round_end");
      hud?.setRound?.(n, true);
    }
  };
  handlers.pts = ({ list }) => {
    for (const [id, total, ds] of list || []) {
      const p = players.get(id);
      if (!p) continue;
      p.points = total;
      if (p.isLocal) {
        hud?.setPoints?.(total);
        for (const d of ds || []) if (d) hud?.pointsPopup?.(d);
        if ((ds || []).some((d) => d < 0)) sfx("buy", { volume: 0.8 });
      }
    }
    refreshTeamHud();
  };
  handlers.deny = () => sfx("deny", { volume: 0.7 });
  handlers.zs = (d) => {
    if (!isHost()) zombies.spawnRemote?.(d);
  };
  handlers.zh = (d) => {
    if (!isHost() && d.by !== S.selfId)
      zombies.remoteHit?.(d.id, d.part, V(d.point), V(d.dir));
  };
  handlers.zk = (d) => {
    if (!isHost() && !d.local)
      zombies.remoteKill?.(d.id, {
        headshot: d.headshot,
        deathVariant: d.dv,
        dir: d.dir ? V(d.dir) : null,
        point: d.point ? V(d.point) : null,
        explosive: d.explosive,
        nuke: d.nuke,
      });
    if (d.by === S.selfId && !d.nuke)
      hud?.hitmarker?.(d.headshot ? "head" : "kill");
  };
  handlers.door = ({ i }) => {
    const door = level.doors[i];
    if (!door || door.isOpen) return;
    door.open();
    sfx("door_open", { position: door.interactPos });
  };
  handlers.power = () => {
    if (S.power) return;
    S.power = true;
    level.powerSwitch?.throwSwitch?.();
    sfx("power_switch", { position: level.powerSwitch?.interactPos });
    setTimeout(() => {
      level.setPower?.(true);
      for (const p of level.perks || []) p.setPowered?.(true);
      ctx.onPower?.(true);
      sting("power_on");
      hud?.message?.("The power is on", 4);
    }, 650);
  };
  handlers.perk = ({ to, id }) => {
    const machine = (level.perks || []).find((m) => m.id === id);
    machine?.vend?.();
    const p = players.get(to);
    if (!p) return;
    p.perks.add(id);
    if (p.isLocal) {
      sting("perk_jingle", { perk: id });
      const done = () => {
        applyLocalPerks();
        refreshPerksHud();
      };
      const pr = weapons?.playPerkDrink?.(
        PERK_INFO[id]?.color || machine?.color,
      );
      if (pr && pr.then) pr.then(done);
      else setTimeout(done, 2200);
    } else avatars?.event(to, "drink", { color: PERK_INFO[id]?.color });
  };
  handlers.give = ({ to, weaponId }) => {
    if (to === S.selfId) weapons?.give(weaponId);
  };
  handlers.refill = ({ to, weaponId }) => {
    if (to === S.selfId) weapons?.refill(weaponId);
  };
  handlers.upgrade = ({ to, weaponId }) => {
    if (to === S.selfId) weapons?.upgrade(weaponId);
  };

  // --- mystery box (visuals run on every machine; host drives the transitions)
  handlers.box = (d) => {
    const box = level.mysteryBox;
    if (d.phase === "open") {
      clearBoxModel();
      S.box = {
        phase: "spin",
        by: d.by,
        final: d.final,
        bye: d.bye,
        t: d.t || 0,
        model: null,
        cycleT: 0,
        cycleIdx: null,
      };
      box.open?.();
      if (!d.silent) {
        sfx("box_open", { position: box.interactPos });
        sfx("box_spin", { position: box.interactPos });
      }
    } else if (d.phase === "take" || d.phase === "close") {
      clearBoxModel();
      S.box = null;
      box.close?.();
      if (!d.silent) sfx("box_close", { position: box.interactPos });
    } else if (d.phase === "move") {
      clearBoxModel();
      box.close?.();
      S.box = { phase: "moving", by: d.by };
      hud?.message?.("The box has moved…", 3);
      const pr = box.relocate?.(d.to);
      const done = () => {
        if (isHost() && S.box?.phase === "moving")
          emit("box", { phase: "idle" });
      };
      if (pr && pr.then) pr.then(done);
      else setTimeout(done, 6000);
    } else if (d.phase === "idle") {
      S.box = null;
    }
  };
  function clearBoxModel() {
    if (S.box?.model) level.mysteryBox.anchor.remove(S.box.model);
    if (S.box) S.box.model = null;
  }
  function setBoxModel(id) {
    const b = S.box,
      box = level.mysteryBox;
    clearBoxModel();
    if (!id) return;
    if (id === "bye") {
      const g = new THREE.Group();
      const skull = new THREE.Mesh(
        new THREE.SphereGeometry(0.16, 20, 16),
        new THREE.MeshStandardMaterial({ color: 0xd9d2bf, roughness: 0.6 }),
      );
      skull.scale.set(1, 1.1, 1.05);
      g.add(skull);
      for (const s of [-1, 1]) {
        const eye = new THREE.Mesh(
          new THREE.SphereGeometry(0.045, 12, 8),
          new THREE.MeshBasicMaterial({ color: 0x220000 }),
        );
        eye.position.set(0.1, 0.02, s * 0.06);
        g.add(eye);
      }
      b.model = g;
    } else {
      try {
        b.model = ctx.buildWeaponModel(id, ctx.T, false);
      } catch {
        b.model = new THREE.Group();
      }
    }
    box.anchor.add(b.model);
  }
  function updateBox(dt) {
    const b = S.box;
    if (!b || b.phase === "moving") return;
    b.t += dt;
    if (b.phase === "spin") {
      b.cycleT -= dt;
      if (b.cycleT <= 0) {
        b.cycleT = 0.07 + Math.pow(b.t / 4.6, 2.2) * 0.45;
        const pool = BOX_POOL.filter((i) => i !== b.cycleIdx);
        b.cycleIdx = pool[(Math.random() * pool.length) | 0];
        setBoxModel(b.cycleIdx);
      }
      if (b.model) b.model.position.y = Math.min(1, b.t / 4.6) * 0.45;
      if (b.t >= 4.8) {
        b.t = 0;
        if (b.bye) {
          b.phase = "bye";
          setBoxModel("bye");
          sfx("box_bye", { position: level.mysteryBox.interactPos });
        } else {
          b.phase = "offer";
          setBoxModel(b.final);
          if (b.model) b.model.position.y = 0.45;
        }
      }
    } else if (b.phase === "offer") {
      if (b.model) b.model.position.y = 0.45 - (b.t / 9) * 0.45;
      if (isHost() && b.t > 9) emit("box", { phase: "close" });
    } else if (b.phase === "bye") {
      if (b.model) {
        b.model.position.y = 0.45 + b.t * 0.5;
        b.model.rotation.y += dt * 4;
      }
      if (isHost() && b.t > 2.5 && !b.moveSent) {
        b.moveSent = true;
        const box = level.mysteryBox,
          n = box.locations ?? 3;
        let to = (Math.random() * n) | 0;
        if (n > 1 && to === box.current) to = (to + 1) % n;
        const owner = players.get(b.by);
        if (owner) award(owner.id, level.mysteryBox.cost ?? 950, true);
        emit("box", { phase: "move", to, by: b.by });
      }
    }
  }

  // --- anvil (weapon upgrade)
  handlers.anvil = (d) => {
    const a = level.anvil;
    const drop = () => {
      if (S.anvil?.model) a.anchor.remove(S.anvil.model);
    };
    if (d.phase === "forge") {
      drop();
      S.anvil = {
        phase: "forge",
        by: d.by,
        weaponId: d.weaponId,
        t: d.t || 0,
        model: null,
      };
      try {
        S.anvil.model = ctx.buildWeaponModel(d.weaponId, ctx.T, false);
        a.anchor.add(S.anvil.model);
      } catch {}
      a.forge?.(4);
      if (!d.silent) sting("anvil");
      if (d.by === S.selfId) weapons?.holster?.(true);
    } else if (d.phase === "ready") {
      drop();
      if (!S.anvil) S.anvil = { by: d.by, weaponId: d.weaponId };
      S.anvil.phase = "ready";
      S.anvil.t = 0;
      try {
        S.anvil.model = ctx.buildWeaponModel(S.anvil.weaponId, ctx.T, true);
        a.anchor.add(S.anvil.model);
      } catch {}
    } else if (d.phase === "take") {
      drop();
      const was = S.anvil;
      S.anvil = null;
      if (was && was.by === S.selfId) {
        if (d.by === S.selfId) weapons?.upgrade(was.weaponId);
        if (!me.downed && !me.spectating) weapons?.holster?.(false);
      }
    }
  };
  function updateAnvil(dt) {
    const a = S.anvil;
    if (!a) return;
    a.t += dt;
    if (!isHost()) return;
    if (a.phase === "forge" && a.t > 4)
      emit("anvil", { phase: "ready", by: a.by, weaponId: a.weaponId });
    else if (a.phase === "ready" && a.t > 12)
      emit("anvil", { phase: "take", by: a.by });
  }

  // --- power-ups
  handlers["pu+"] = ({ uid, type, pos }) => {
    if (S.powerups.has(uid)) return;
    const p = V(pos);
    const h = fx.spawnPowerup(type, p);
    S.powerups.set(uid, { uid, type, pos: p, h, age: 0 });
    sfx("powerup_spawn", { position: p });
  };
  handlers["pu-"] = ({ uid }) => {
    const pu = S.powerups.get(uid);
    if (pu) {
      pu.h?.dispose?.();
      S.powerups.delete(uid);
    }
  };
  handlers["pu!"] = ({ uid, type, by }) => {
    const pu = S.powerups.get(uid);
    if (pu) {
      fx.powerupGrab?.(pu.pos);
      pu.h?.dispose?.();
      S.powerups.delete(uid);
    }
    sfx("powerup_grab");
    sting("powerup_fanfare");
    hud?.banner?.(PU_NAMES[type] || type);
    sfx(type === "maxammo" ? "maxammo" : type, { volume: 0.9 });
    if (type === "maxammo" && !me.spectating) {
      weapons?.refillAll();
      weapons?.setGrenades?.(4);
    }
    if (type === "nuke") {
      ctx.flash?.(1);
      fx.nukeFlash?.();
    }
  };
  handlers.timed = (d) => {
    S.timed.instakill = d.instakill;
    S.timed.doublepoints = d.doublepoints;
    ctx.post?.setMood?.({ instakill: d.instakill > 0 });
  };
  function hostPowerups(dt) {
    for (const pu of S.powerups.values()) {
      pu.age += dt;
      if (pu.age > 30) {
        emit("pu-", { uid: pu.uid });
        continue;
      }
      for (const p of alivePlayers()) {
        if (Math.hypot(pu.pos.x - p.pos.x, pu.pos.z - p.pos.z) < 1.15) {
          grab(pu, p);
          break;
        }
      }
    }
  }
  function grab(pu, p) {
    emit("pu!", { uid: pu.uid, type: pu.type, by: p.id });
    switch (pu.type) {
      case "instakill":
        S.timed.instakill = 30;
        zombies.setInstaKill(true);
        emit("timed", { ...S.timed });
        break;
      case "doublepoints":
        S.timed.doublepoints = 30;
        emit("timed", { ...S.timed });
        break;
      case "nuke":
        zombies.killAll({ nuke: true, by: p.id });
        setTimeout(() => {
          for (const q of players.values()) award(q.id, 400, true);
        }, 1600);
        break;
      case "carpenter":
        for (const w of level.windows) w.repairAll?.(true);
        setTimeout(() => {
          for (const q of players.values()) award(q.id, 200, true);
        }, 1200);
        break;
    }
  }
  function tickTimed(dt) {
    for (const k of ["instakill", "doublepoints"])
      if (S.timed[k] > 0) {
        S.timed[k] = Math.max(0, S.timed[k] - dt);
        if (S.timed[k] === 0) {
          sfx("powerup_end");
          if (k === "instakill") {
            if (isHost()) zombies.setInstaKill(false);
            ctx.post?.setMood?.({ instakill: false });
          }
        }
      }
    hud?.setPowerups?.(
      Object.entries(S.timed)
        .filter(([, v]) => v > 0)
        .map(([type, remaining]) => ({ type, remaining })),
    );
  }

  // --- health / downs / revives
  handlers.hurt = ({ to, dmg }) => {
    if (to === S.selfId) ctx.hurtLocal?.(dmg);
  };
  handlers.down = ({ id, sw }) => {
    const p = players.get(id);
    if (!p) return;
    p.downed = true;
    p.perks.clear();
    p.selfRevive = !!sw;
    if (p.isLocal) {
      applyLocalPerks();
      refreshPerksHud();
      if (sw) S.selfReviveT = 5;
    } else {
      hud?.feed?.(`${p.name} is down!`, p.slot);
      sfx("teammate_down");
    }
    refreshTeamHud();
  };
  handlers.revive = ({ id, by }) => {
    const p = players.get(id);
    if (!p) return;
    p.downed = false;
    p.selfRevive = false;
    p.reviver = null;
    p.reviveT = 0;
    const r = players.get(by);
    if (p.isLocal) {
      player.downed = false;
      player.health = player.maxHealth;
      S.selfReviveT = 0;
      hud?.setDowned?.(false, 0);
      ctx.post?.setMood?.({ downed: false });
      weapons?.holster?.(false);
      sfx("revive_done");
      if (r && !r.isLocal) hud?.feed?.(`${r.name} revived you`, r.slot);
    } else {
      avatars?.event(id, "revived");
      if (r && by !== id)
        hud?.feed?.(`${r.isLocal ? "You" : r.name} revived ${p.name}`, r.slot);
    }
    refreshTeamHud();
  };
  handlers.bleed = ({ id }) => {
    const p = players.get(id);
    if (!p) return;
    p.downed = false;
    p.spectating = true;
    if (p.isLocal) {
      player.downed = false;
      player.alive = false;
      player.frozen = true;
      weapons?.holster?.(true);
      hud?.setDowned?.(false, 0);
      ctx.post?.setMood?.({ downed: false });
      sfx("bleedout");
    } else hud?.feed?.(`${p.name} bled out`, p.slot);
    refreshTeamHud();
  };
  handlers.respawn = ({ id }) => {
    const p = players.get(id);
    if (!p) return;
    p.spectating = false;
    p.downed = false;
    if (p.isLocal) {
      const st = startFor(p);
      player.spawn(st.pos, st.yaw);
      weapons?.reset?.();
      weapons?.give("m1911");
      weapons?.holster?.(false);
      applyLocalPerks();
      refreshPerksHud();
      hud?.setSpectating?.(null);
    } else hud?.feed?.(`${p.name} is back in the fight`, p.slot);
    refreshTeamHud();
  };

  // --- teammates' weapon events, explosions, chat
  handlers.wev = ({ from, e }) => {
    if (from === S.selfId || !Array.isArray(e)) return;
    const muzzle = new THREE.Vector3();
    for (const ev of e.slice(0, 16)) {
      switch (ev.type) {
        case "fire": {
          avatars?.event(from, "fire", { upgraded: ev.upgraded });
          const o =
            avatars?.getMuzzle(from, muzzle) ||
            (ev.origin ? V(ev.origin, muzzle) : null);
          if (o)
            weapons?.remoteShotFx?.(
              ev.id,
              ev.upgraded,
              o,
              ev.dir ? V(ev.dir) : null,
              ev.hit ? V(ev.hit) : null,
            );
          break;
        }
        case "grenade":
          avatars?.event(from, "grenade");
          if (ev.pos)
            weapons?.visualProjectile?.(
              "grenade",
              V(ev.pos),
              V(ev.vel),
              ev.fuse,
              { explodeFx: false },
            );
          break;
        case "aether":
          if (ev.pos)
            weapons?.visualProjectile?.(
              "aether",
              V(ev.pos),
              V(ev.vel),
              undefined,
              { explodeFx: false, upgraded: ev.upgraded },
            );
          break;
        case "reload":
          avatars?.event(from, "reload", { weaponId: ev.id, empty: ev.empty });
          break;
        case "knife":
          avatars?.event(from, "knife");
          break;
        case "swap":
          avatars?.event(from, "swap", { weaponId: ev.id });
          break;
        case "drink":
          avatars?.event(from, "drink", { color: ev.color });
          break;
      }
    }
  };
  handlers.fx = ({ kind, pos, by }) => {
    if (by === S.selfId) return;
    const p = V(pos);
    if (kind === "aether") fx.aetherImpact?.(p);
    else if (kind === "boom") fx.explosion?.(p, 1.3);
    const d = player.pos.distanceTo(p);
    if (kind === "boom" && d < 9) player.shake(Math.max(0.1, 1 - d / 9));
  };
  handlers.chat = ({ from, text }) => {
    const p = players.get(from);
    if (!p) return;
    hud?.chat?.(p.name, p.slot, clean(text, 120));
    sfx("chat", { volume: 0.5 });
  };
  handlers.feed = ({ text, slot }) => hud?.feed?.(clean(text, 80), slot);
  handlers.gameover = (d) => {
    S.lastStats = d;
    S.phase = "dying";
    S.dyingT = d.instant ? 0.2 : 3.2;
    ctx.onDying?.();
  };

  // --- periodic state
  handlers.snap = (d) => {
    if (isHost()) return;
    if (d.z) zombies.netApply?.(d.z, d.t);
    for (const row of d.p || []) {
      const [id, ...st] = row;
      if (id === S.selfId) continue;
      const p = players.get(id);
      if (!p) continue;
      p.st = st;
      p.buf?.push(d.t, st);
      V(st, p.pos);
      p.pos.y = st[1];
    }
    if (d.pl) applyPlanks(d.pl);
    S.remoteRevive = d.rv || null;
  };
  handlers.sync = (d) => {
    if (!isHost()) applySync(d);
  };
  function applySync(d) {
    if (!d) return;
    if (d.lvl) level.applyNetState?.(d.lvl, false);
    if (d.lvl?.power && !S.power) {
      S.power = true;
      for (const p of level.perks || []) p.setPowered?.(true);
      ctx.onPower?.(true);
    }
    for (const [
      id,
      pts,
      kills,
      heads,
      downs,
      revives,
      perks,
      downed,
      spec,
    ] of d.pl || []) {
      const p = players.get(id);
      if (!p) continue;
      p.points = pts;
      p.kills = kills;
      p.headshots = heads;
      p.downs = downs;
      p.revives = revives;
      if (!p.isLocal) {
        p.perks = new Set(perks || []);
        p.downed = !!downed;
        p.spectating = !!spec;
      }
      if (p.isLocal) hud?.setPoints?.(pts);
    }
    if (d.timed) handlers.timed(d.timed);
    if (d.round && d.round !== S.round) {
      S.round = d.round;
      hud?.setRound?.(d.round, false);
    }
    refreshTeamHud();
  }
  function makeSync() {
    return {
      round: S.round,
      timed: { ...S.timed },
      lvl: level.netState?.(),
      pl: [...players.values()].map((p) => [
        p.id,
        p.points,
        p.kills,
        p.headshots,
        p.downs,
        p.revives,
        [...p.perks],
        p.downed ? 1 : 0,
        p.spectating ? 1 : 0,
      ]),
    };
  }
  function sendFull(pid) {
    if (!S.net) return;
    S.net.send(
      "full",
      {
        round: S.round,
        sync: makeSync(),
        zombies: zombies.list.map((z) => z.netSpawn?.()).filter(Boolean),
        powerups: [...S.powerups.values()].map((p) => ({
          uid: p.uid,
          type: p.type,
          pos: A(p.pos),
        })),
        box:
          S.box && S.box.phase !== "moving"
            ? {
                phase: "open",
                by: S.box.by,
                final: S.box.final,
                bye: S.box.bye,
                t: S.box.phase === "spin" ? S.box.t : 4.8,
              }
            : null,
        anvil: S.anvil
          ? {
              phase: S.anvil.phase,
              by: S.anvil.by,
              weaponId: S.anvil.weaponId,
              t: S.anvil.t,
            }
          : null,
      },
      { to: pid },
    );
  }
  const lastPlanks = [];
  function applyPlanks(pl) {
    level.windows.forEach((w, i) => {
      const n = pl[i];
      if (n == null) return;
      const prev = lastPlanks[i] ?? w.planks;
      if (n !== w.planks) {
        w.setPlanks?.(n, true);
        if (n > prev) sfx("plank_place", { position: w.interactPos }); // tears are voiced by the puppets
      }
      lastPlanks[i] = n;
    });
  }

  // ------------------------------------------------------------------ requests (host)
  requests.ps = (p, st) => {
    if (!Array.isArray(st) || st.length < 10) return;
    p.st = st;
    p.lastPs = now();
    p.buf?.push(serverTime(), st);
    V(st, p.pos);
    p.pos.y = st[1];
  };
  requests.hit = (p, d) => {
    if (p.spectating) return;
    const def = ctx.WEAPONS[d.info?.weaponId] || {};
    const cap = d.info?.melee
      ? 5000
      : Math.max(
          200,
          (def.damage || 100) *
            (def.headMul || 4) *
            3.5 *
            (d.info?.upgraded ? 3 : 1),
        );
    const dmg = Math.min(+d.dmg || 0, cap);
    const r = hostDamage(
      p.id,
      d.id,
      dmg,
      d.part,
      V(d.point || [0, 0, 0]),
      V(d.dir || [0, 0, -1]),
      { ...d.info, fromClient: true },
    );
    return r;
  };
  requests.boom = (p, d) => {
    const pos = V(d.pos || [0, 0, 0]);
    zombies.explode(
      pos,
      Math.min(8, +d.radius || 4),
      Math.min(5000, +d.damage || 300),
      { source: d.source, by: p.id, explosive: true },
    );
    emit("fx", {
      kind: d.source === "aether" ? "aether" : "boom",
      pos: A(pos),
      by: p.id,
    });
  };
  requests.wev = (p, d) => {
    emit("wev", { from: p.id, e: (d.e || []).slice(0, 16) });
  };
  requests.chat = (p, d) => {
    const text = clean(d.text, 120).trim();
    if (text) emit("chat", { from: p.id, text });
  };
  requests.down = (p) => {
    if (p.downed || p.spectating) return;
    p.downs++;
    const sw = p.perks.has("secondwind");
    p.downed = true;
    p.bleedT = BLEED_TIME;
    p.reviveT = 0;
    p.reviver = null;
    emit("down", { id: p.id, sw });
    checkAllDown();
  };
  requests.selfrevive = (p) => {
    if (p.downed && p.selfRevive) emit("revive", { id: p.id, by: p.id });
  };
  requests.revive = (p, d) => {
    const t = players.get(d.target);
    if (!t || !t.downed) return;
    if (d.on) {
      if (!t.reviver || t.reviver === p.id) {
        t.reviver = p.id;
      }
    } else if (t.reviver === p.id) {
      t.reviver = null;
      t.reviveT = 0;
    }
  };
  requests.use = (p, d) => {
    if (p.downed || p.spectating || S.phase !== "playing") return;
    const near = (pos, r = 3.2) =>
      pos && Math.hypot(pos.x - p.pos.x, pos.z - p.pos.z) < r;
    const i = d.key | 0;
    switch (d.kind) {
      case "window": {
        const w = level.windows[i];
        if (!w || !near(w.interactPos)) return;
        if (w.planks < w.maxPlanks && w.addPlank()) {
          if (p.isLocal) sfx("plank_place", { position: w.interactPos });
          if (p.rebuildPts < 500) {
            award(p.id, 10);
            p.rebuildPts += 10 * mult();
          }
        }
        return;
      }
      case "door": {
        const door = level.doors[i];
        if (!door || door.isOpen) return;
        if (spend(p, door.cost)) emit("door", { i });
        return;
      }
      case "wallbuy":
      case "wallammo": {
        const wb = level.wallBuys[i];
        if (!wb || !near(wb.interactPos)) return;
        if (d.kind === "wallammo") {
          if (spend(p, d.upgraded ? 4500 : wb.ammoCost))
            emit("refill", { to: p.id, weaponId: wb.weaponId });
        } else if (spend(p, wb.cost))
          emit("give", { to: p.id, weaponId: wb.weaponId });
        return;
      }
      case "perk": {
        const m = level.perks[i];
        if (!m || !S.power || p.perks.has(m.id) || p.perks.size >= 4) return;
        if (spend(p, m.cost)) emit("perk", { to: p.id, id: m.id });
        return;
      }
      case "power":
        if (!S.power) emit("power", { by: p.id });
        return;
      case "box": {
        const box = level.mysteryBox;
        if (!S.box) {
          if (!spend(p, box.cost ?? 950)) return;
          S.boxUses = (S.boxUses || 0) + 1;
          const owned = new Set(d.owned || []);
          const choices = BOX_POOL.filter((id) => !owned.has(id));
          const weights = choices.map((id) =>
            id === "aether" ? 0.5 : id === "mg42" ? 0.8 : 1,
          );
          let r = Math.random() * weights.reduce((a, b) => a + b, 0),
            final = choices[0] || "mp40";
          for (let k = 0; k < choices.length; k++) {
            r -= weights[k];
            if (r <= 0) {
              final = choices[k];
              break;
            }
          }
          emit("box", {
            phase: "open",
            by: p.id,
            final,
            bye: S.boxUses > 3 && Math.random() < 0.16,
          });
        } else if (S.box.phase === "offer" && S.box.by === p.id) {
          const id = S.box.final;
          emit("box", { phase: "take", by: p.id });
          emit("give", { to: p.id, weaponId: id });
        }
        return;
      }
      case "anvil": {
        if (!S.power) return;
        if (!S.anvil) {
          if (!d.weaponId || d.upgraded || !ctx.WEAPONS[d.weaponId]) return;
          if (spend(p, level.anvil.cost ?? 5000))
            emit("anvil", { phase: "forge", by: p.id, weaponId: d.weaponId });
        } else if (S.anvil.phase === "ready" && S.anvil.by === p.id)
          emit("anvil", { phase: "take", by: p.id });
        return;
      }
    }
  };

  function checkAllDown() {
    if (S.phase !== "playing") return;
    const standing = [...players.values()].filter(
      (p) => (!p.downed && !p.spectating) || (p.downed && p.selfRevive),
    );
    if (standing.length) return;
    const rows = [...players.values()]
      .sort((a, b) => b.points - a.points)
      .map((p) => ({
        id: p.id,
        name: p.name,
        slot: p.slot,
        points: p.points,
        kills: p.kills,
        headshots: p.headshots,
        downs: p.downs,
        revives: p.revives,
      }));
    emit("gameover", {
      round: S.round,
      rows,
      timeSec: Math.round(now() - S.startTime),
    });
  }

  function hostRevives(dt) {
    const multi = players.size > 1;
    for (const p of players.values()) {
      if (!p.downed) continue;
      const r = p.reviver ? players.get(p.reviver) : null;
      if (
        r &&
        (r.downed ||
          r.spectating ||
          Math.hypot(r.pos.x - p.pos.x, r.pos.z - p.pos.z) > 2.6)
      ) {
        p.reviver = null;
        p.reviveT = 0;
      }
      if (p.reviver) {
        const speed = players.get(p.reviver)?.perks.has("quickhands") ? 1.6 : 1;
        p.reviveT += dt * speed;
        if (p.reviveT >= REVIVE_TIME) {
          const rv = players.get(p.reviver);
          if (rv) rv.revives++;
          emit("revive", { id: p.id, by: p.reviver });
        }
      } else if (multi && !p.selfRevive) {
        p.bleedT -= dt;
        if (p.bleedT <= 0) {
          emit("bleed", { id: p.id });
          checkAllDown();
        }
      }
    }
  }

  // ------------------------------------------------------------------ local player perks / HUD
  function applyLocalPerks() {
    player.maxHealth = me.perks.has("ironhide") ? 250 : 100;
    player.health = Math.min(player.health, player.maxHealth);
    weapons?.setPerks?.({
      quickhands: me.perks.has("quickhands"),
      rapidfire: me.perks.has("rapidfire"),
    });
  }
  function refreshPerksHud() {
    hud?.setPerks?.([...me.perks].map((id) => ({ id, ...PERK_INFO[id] })));
  }

  // ------------------------------------------------------------------ match lifecycle
  function resetWorld() {
    zombies.clear?.();
    for (const pu of S.powerups.values()) pu.h?.dispose?.();
    S.powerups.clear();
    if (S.box?.model) level.mysteryBox.anchor.remove(S.box.model);
    if (S.anvil?.model) level.anvil.anchor.remove(S.anvil.model);
    S.box = null;
    S.anvil = null;
    S.timed.instakill = S.timed.doublepoints = 0;
    zombies.setInstaKill?.(false);
    S.power = false;
    S.boxUses = 0;
    ctx.onPower?.(false);
    level.reset?.();
    for (const w of level.windows || []) w.repairAll?.();
    lastPlanks.length = 0;
  }
  function enterMatch({ late = false } = {}) {
    resetWorld();
    for (const p of players.values()) {
      Object.assign(p, {
        points: 500,
        kills: 0,
        headshots: 0,
        downs: 0,
        revives: 0,
        downed: false,
        spectating: false,
        bleedT: 0,
        selfRevive: false,
        reviveT: 0,
        reviver: null,
        rebuildPts: 0,
      });
      p.perks = new Set();
    }
    zombies.setNetMode?.(isHost() ? (S.net ? "host" : null) : "client");
    S.phase = "playing";
    S.round = 0;
    S.startTime = now();
    S.selfReviveT = 0;
    S.reviving = null;
    const st = startFor(me);
    player.spawn(st.pos, st.yaw);
    weapons?.reset?.();
    weapons?.give("m1911");
    weapons?.setGrenades?.(2);
    weapons?.holster?.(false);
    weapons?.setCharacter?.(me.slot);
    applyLocalPerks();
    refreshPerksHud();
    hud?.setPoints?.(me.points);
    hud?.setLocalSlot?.(me.slot);
    hud?.setDowned?.(false, 0);
    hud?.setSpectating?.(null);
    ctx.post?.setMood?.({ menu: false, downed: false, instakill: false });
    refreshTeamHud();
    ctx.onMatchStart?.({ late });
  }

  // ------------------------------------------------------------------ public: local-player hooks
  function localHitZombie(z, dmg, part, point, dir, info = {}) {
    if (isHost()) {
      const r = hostDamage(S.selfId, z.id, dmg, part, point, dir, info);
      if (!r.killed) hud?.hitmarker?.("hit");
      return r;
    }
    zombies.remoteHit?.(z.id, part, point, dir);
    hud?.hitmarker?.("hit");
    request("hit", {
      id: z.id,
      dmg: Math.round(dmg),
      part,
      point: A(point),
      dir: A(dir),
      info: {
        weaponId: info.weaponId,
        upgraded: !!info.upgraded,
        melee: !!info.melee,
        explosive: !!info.explosive,
      },
    });
    return { killed: false, headshot: false };
  }
  function localExplode(pos, radius, damage, info = {}) {
    if (isHost()) {
      zombies.explode(pos, radius, damage, {
        ...info,
        by: S.selfId,
        explosive: true,
      });
      if (S.net)
        S.net.send(
          "fx",
          {
            kind: info.source === "aether" ? "aether" : "boom",
            pos: A(pos),
            by: S.selfId,
          },
          { to: "*" },
        );
    } else
      request("boom", { pos: A(pos), radius, damage, source: info.source });
  }
  function localDowned() {
    ctx.sfx?.("player_down");
    hud?.setDowned?.(true, 0);
    ctx.post?.setMood?.({ downed: true });
    request("down", {});
  }
  function forwardWeaponEvents(events) {
    if (!S.net || !events?.length) return;
    const e = events.map((ev) => {
      const o = {
        type: ev.type,
        id: ev.id,
        upgraded: !!ev.upgraded,
        empty: !!ev.empty,
        color: ev.color,
        fuse: ev.fuse,
      };
      if (ev.origin) o.origin = A(ev.origin);
      if (ev.dir) o.dir = [r3(ev.dir.x), r3(ev.dir.y), r3(ev.dir.z)];
      if (ev.hit) o.hit = A(ev.hit);
      if (ev.pos) o.pos = A(ev.pos);
      if (ev.vel) o.vel = A(ev.vel);
      return o;
    });
    if (isHost()) emit("wev", { from: S.selfId, e });
    else request("wev", { e });
  }

  // ------------------------------------------------------------------ interactions (local)
  function gather() {
    const L = level,
      list = [];
    const ws = weapons?.getState?.() || {};
    for (const p of players.values()) {
      if (p.isLocal || !p.downed) continue;
      list.push({
        kind: "revive",
        o: p,
        pos: p.pos,
        text: `Hold [F] to revive ${p.name}`,
        hold: true,
        prio: 1,
      });
    }
    L.windows.forEach((w, i) => {
      if (w.planks < w.maxPlanks)
        list.push({
          kind: "window",
          key: i,
          pos: w.interactPos,
          text: "Hold [F] to rebuild barrier",
          hold: true,
        });
    });
    L.doors.forEach((d, i) => {
      if (d.isOpen) return;
      for (const pos of d.interactPositions || [d.interactPos])
        list.push({
          kind: "door",
          key: i,
          pos,
          cost: d.cost,
          text: `Hold [F] to ${d.label ? d.label.toLowerCase() : "open door"} [Cost: ${d.cost}]`,
        });
    });
    L.wallBuys.forEach((wb, i) => {
      const def = ctx.WEAPONS[wb.weaponId] || { name: wb.weaponId };
      const owned = weapons?.has?.(wb.weaponId);
      const up =
        owned &&
        (ws.inventory
          ? ws.inventory.some((s) => s.id === wb.weaponId && s.upgraded)
          : ws.id === wb.weaponId && ws.upgraded);
      const ammoCost = up ? 4500 : wb.ammoCost;
      list.push(
        owned
          ? {
              kind: "wallammo",
              key: i,
              pos: wb.interactPos,
              cost: ammoCost,
              upgraded: up,
              text: `Hold [F] for ${def.name} ammo [Cost: ${ammoCost}]`,
            }
          : {
              kind: "wallbuy",
              key: i,
              pos: wb.interactPos,
              cost: wb.cost,
              text: `Hold [F] to buy ${def.name} [Cost: ${wb.cost}]`,
            },
      );
    });
    L.perks.forEach((m, i) => {
      if (me.perks.has(m.id)) return;
      list.push(
        S.power
          ? {
              kind: "perk",
              key: i,
              pos: m.interactPos,
              cost: m.cost,
              text: `Hold [F] to buy ${m.name} [Cost: ${m.cost}]`,
            }
          : {
              kind: "info",
              pos: m.interactPos,
              text: "You must turn on the power first!",
            },
      );
    });
    if (L.mysteryBox && S.box?.phase !== "moving") {
      const b = L.mysteryBox;
      if (!S.box)
        list.push({
          kind: "box",
          pos: b.interactPos,
          cost: b.cost ?? 950,
          text: `Hold [F] for Random Weapon [Cost: ${b.cost ?? 950}]`,
        });
      else if (S.box.phase === "offer" && S.box.by === S.selfId)
        list.push({
          kind: "box",
          pos: b.interactPos,
          cost: 0,
          text: `Hold [F] to take ${(ctx.WEAPONS[S.box.final] || {}).name || S.box.final}`,
        });
    }
    if (L.powerSwitch && !S.power)
      list.push({
        kind: "power",
        pos: L.powerSwitch.interactPos,
        cost: 0,
        text: "Hold [F] to turn on the power",
      });
    if (L.anvil) {
      const a = L.anvil;
      let item = null;
      if (!S.power)
        item = { kind: "info", text: "You must turn on the power first!" };
      else if (!S.anvil) {
        if (ws.upgraded) item = { kind: "info", text: "Weapon already forged" };
        else if (ws.id)
          item = {
            kind: "anvil",
            cost: a.cost ?? 5000,
            text: `Hold [F] to forge ${ws.name} [Cost: ${a.cost ?? 5000}]`,
          };
      } else if (S.anvil.phase === "ready" && S.anvil.by === S.selfId)
        item = { kind: "anvil", cost: 0, text: "Hold [F] to take your weapon" };
      if (item) list.push({ ...item, pos: a.interactPos });
    }
    return list;
  }
  function findTarget() {
    let best = null,
      bd = 1e9;
    const fwdx = -Math.sin(player.yaw),
      fwdz = -Math.cos(player.yaw);
    for (const it of gather()) {
      if (!it.pos) continue;
      const dx = it.pos.x - player.pos.x,
        dz = it.pos.z - player.pos.z,
        d = Math.hypot(dx, dz);
      const range = it.kind === "revive" ? 1.9 : 1.7;
      if (d > range) continue;
      const facing = d < 0.5 ? 1 : (dx * fwdx + dz * fwdz) / d;
      if (facing < -0.2 && it.kind !== "revive") continue;
      const score = d - facing * 0.6 - (it.prio || 0) * 5;
      if (score < bd) {
        bd = score;
        best = it;
      }
    }
    return best;
  }
  let current = null,
    rebuildT = 0;
  function localInteract(pressed, held, dt) {
    if (S.phase !== "playing" || player.downed || me.spectating) {
      stopReviving();
      hud?.prompt?.(null);
      return;
    }
    const it = findTarget();
    if (
      it?.kind !== current?.kind ||
      it?.key !== current?.key ||
      it?.o !== current?.o
    )
      rebuildT = 0;
    current = it;
    // revive has its own hold loop
    if (!it || it.kind !== "revive" || !held) stopReviving();
    hud?.prompt?.(it && !(S.reviving && it.kind === "revive") ? it.text : null);
    if (!it) return;
    if (it.kind === "revive") {
      if (held) {
        if (S.reviving !== it.o.id) {
          S.reviving = it.o.id;
          S.reviveLocalT = 0;
          request("revive", { target: it.o.id, on: true });
          weapons?.holster?.(true);
          sfx("revive_start");
        }
        const speed = me.perks.has("quickhands") ? 1.6 : 1;
        S.reviveLocalT += dt * speed;
        hud?.reviveProgress?.(
          Math.min(1, S.reviveLocalT / REVIVE_TIME),
          `Reviving ${it.o.name}`,
        );
      }
      return;
    }
    if (it.kind === "window") {
      if (!held) {
        rebuildT = 0;
        return;
      }
      rebuildT -= dt;
      if (rebuildT <= 0) {
        rebuildT = 0.95;
        request("use", { kind: "window", key: it.key });
      }
      return;
    }
    if (!pressed || it.kind === "info") return;
    if (it.cost && me.points < it.cost) {
      sfx("deny", { volume: 0.7 });
      return;
    }
    const ws = weapons?.getState?.() || {};
    const extra = {};
    if (it.kind === "box") extra.owned = (ws.inventory || []).map((s) => s.id);
    if (it.kind === "anvil") {
      extra.weaponId = ws.id;
      extra.upgraded = !!ws.upgraded;
      if (ws.busy && !S.anvil) return;
    }
    if (it.kind === "wallammo") extra.upgraded = !!it.upgraded;
    request("use", { kind: it.kind, key: it.key, ...extra });
  }
  function stopReviving() {
    if (!S.reviving) return;
    request("revive", { target: S.reviving, on: false });
    S.reviving = null;
    S.reviveLocalT = 0;
    hud?.reviveProgress?.(null);
    if (!player.downed && !me.spectating && S.anvil?.by !== S.selfId)
      weapons?.holster?.(false);
  }

  // ------------------------------------------------------------------ per-frame
  const _pos = new THREE.Vector3(),
    _v = new THREE.Vector3();
  function localFlags(ws) {
    let f = 0;
    if (player.sprinting) f |= FL.SPRINT;
    if (player.crouching) f |= FL.CROUCH;
    if ((ws.ads ?? 0) > 0.5) f |= FL.ADS;
    if (player.grounded) f |= FL.GROUND;
    if (ws.reloading) f |= FL.RELOAD;
    if (player.downed) f |= FL.DOWN;
    if (S.reviving) f |= FL.REVIVING;
    if (me.spectating) f |= FL.SPEC;
    return f;
  }
  function packLocal() {
    const ws = weapons?.getState?.() || {};
    return [
      r2(player.pos.x),
      r2(player.pos.y),
      r2(player.pos.z),
      r3(player.yaw),
      r3(player.pitch),
      r2(player.vel.x),
      r2(player.vel.z),
      localFlags(ws),
      ws.id || "",
      ws.upgraded ? 1 : 0,
    ];
  }

  function update(dt) {
    const inMatch = S.phase === "playing" || S.phase === "dying";
    if (!inMatch) return;

    // local player record
    me.st = packLocal();
    me.pos.copy(player.pos);
    me.eye.copy(player.eyePos);
    for (const p of players.values())
      if (!p.isLocal) {
        p.eye.set(
          p.pos.x,
          p.pos.y + (p.st[7] & FL.DOWN ? 0.5 : p.st[7] & FL.CROUCH ? 1.1 : 1.6),
          p.pos.z,
        );
      }

    // self-revive countdown (Second Wind)
    if (S.selfReviveT > 0 && player.downed) {
      S.selfReviveT -= dt;
      hud?.setDowned?.(true, 1 - S.selfReviveT / 5);
      if (S.selfReviveT <= 0) request("selfrevive", {});
    } else if (player.downed && !S.selfReviveT) {
      const bt =
        players.size > 1
          ? isHost()
            ? me.bleedT
            : (S.remoteBleed ?? BLEED_TIME)
          : 0;
      if (players.size > 1)
        hud?.setDowned?.(true, 1 - Math.max(0, bt) / BLEED_TIME);
    }

    tickTimed(dt);
    updateBox(dt);
    updateAnvil(dt);
    for (const pu of S.powerups.values()) {
      if (!isHost()) pu.age += dt;
      if (pu.h) pu.h.age = pu.age;
    }

    // zombies
    const targets = [...players.values()].map((p) => ({
      id: p.id,
      pos: p.pos,
      eye: p.eye,
      alive: S.phase === "playing" && !p.spectating && !p.downed,
      downed: p.downed,
    }));
    zombies.update(dt, targets); // client puppets run their own smoothed render clock

    if (isHost() && S.phase === "playing") {
      hostRounds(dt);
      hostPowerups(dt);
      hostRevives(dt);
      S.hitBudget = Math.min(40, S.hitBudget + dt * 40);
      // stale clients (no state for 8 s) are treated as gone by net.js; nothing to do here
    }
    if (isHost()) flushPoints();

    // networking cadence
    if (S.net) {
      if (isHost()) {
        S.snapT -= dt;
        if (S.snapT <= 0 && S.net.roster.length > 1) {
          S.snapT = SNAP_DT;
          const rv = [...players.values()]
            .filter((p) => p.downed)
            .map((p) => [p.id, r2(p.reviveT / REVIVE_TIME), r2(p.bleedT)]);
          S.net.send(
            "snap",
            {
              t: r3(serverTime()),
              z: zombies.netExport?.() || [],
              p: [...players.values()].map((p) => [p.id, ...p.st]),
              pl: level.windows.map((w) => w.planks),
              rv,
            },
            { to: "*", reliable: false },
          );
        }
        S.syncT -= dt;
        if (S.syncT <= 0) {
          S.syncT = SYNC_DT;
          S.net.send("sync", makeSync(), { to: "*" });
        }
      } else {
        S.psT -= dt;
        if (S.psT <= 0) {
          S.psT = PS_DT;
          S.net.send("ps", me.st, { to: "host", reliable: false });
        }
        const rv = S.remoteRevive || [];
        const mine = rv.find((r) => r[0] === S.selfId);
        S.remoteBleed = mine ? mine[2] : null;
        if (mine && mine[1] > 0 && player.downed)
          hud?.reviveProgress?.(mine[1], "Being revived…");
        else if (!S.reviving) hud?.reviveProgress?.(null);
      }
    } else if (isHost() && player.downed) {
      const mine = me.reviver ? me.reviveT / REVIVE_TIME : 0;
      if (mine > 0) hud?.reviveProgress?.(mine, "Being revived…");
    }
    if (isHost() && S.net && player.downed) {
      if (me.reviver)
        hud?.reviveProgress?.(
          me.reviveT / REVIVE_TIME,
          `Being revived by ${players.get(me.reviver)?.name || ""}`,
        );
      else if (!S.reviving) hud?.reviveProgress?.(null);
    }

    // teammates: avatars + markers
    updateTeammates(dt);

    if (S.phase === "dying") {
      S.dyingT -= dt;
      if (S.dyingT <= 0) {
        S.phase = "gameover";
        ctx.onGameOver?.(S.lastStats, me);
      }
    }
  }

  const _m = new THREE.Vector3(),
    _head = new THREE.Vector3();
  function updateTeammates(dt) {
    const base = serverTime();
    const markers = [];
    for (const p of players.values()) {
      if (p.isLocal) continue;
      let st = p.st,
        pos = _pos,
        yaw = st[3],
        pitch = st[4];
      // adaptive interpolation delay (one-way latency + send interval + jitter), from net.js
      const rt = !S.net
        ? base - 0.1
        : isHost()
          ? base - (S.net.interpDelay?.(PS_DT, p.id) ?? 0.1)
          : (S.net.renderTime?.() ?? base - 0.1);
      const smp = p.buf?.sample(rt);
      if (smp && smp.a && smp.b) {
        const a = smp.a,
          b = smp.b,
          t = smp.t;
        pos.set(
          a[0] + (b[0] - a[0]) * t,
          a[1] + (b[1] - a[1]) * t,
          a[2] + (b[2] - a[2]) * t,
        );
        yaw = NetMod.lerpAngle(a[3], b[3], t);
        pitch = a[4] + (b[4] - a[4]) * t;
        st = t < 0.5 ? a : b;
      } else pos.set(st[0], st[1], st[2]);
      const f = st[7] | 0;
      if (avatars) {
        avatars.setVisible(p.id, !(f & FL.SPEC));
        avatars.setState(p.id, {
          pos,
          yaw,
          pitch,
          vel: { x: st[5], z: st[6] },
          grounded: !!(f & FL.GROUND),
          crouching: !!(f & FL.CROUCH),
          sprinting: !!(f & FL.SPRINT),
          ads: !!(f & FL.ADS),
          reloading: !!(f & FL.RELOAD),
          downed: !!(f & FL.DOWN),
          reviving: !!(f & FL.REVIVING),
          weaponId: st[8] || "m1911",
          upgraded: !!st[9],
          alive: !(f & FL.SPEC),
        });
      }
      if (f & FL.SPEC) continue;
      // screen marker
      if (avatars?.getHead) avatars.getHead(p.id, _head);
      else _head.set(pos.x, pos.y + 1.7, pos.z);
      _m.copy(_head);
      _m.y += 0.35;
      const dist = _m.distanceTo(camera.position);
      _v.copy(_m).project(camera);
      const behind = _v.z > 1;
      let x = ((_v.x + 1) / 2) * innerWidth,
        y = ((1 - _v.y) / 2) * innerHeight;
      if (behind) {
        x = innerWidth - x;
        y = innerHeight - y;
      }
      const onScreen =
        !behind && x > 0 && x < innerWidth && y > 0 && y < innerHeight;
      const angle = Math.atan2(x - innerWidth / 2, -(y - innerHeight / 2)); // 0 = up, clockwise +
      const rv = isHost()
        ? p.downed
          ? p.reviveT / REVIVE_TIME
          : 0
        : (S.remoteRevive || []).find((r) => r[0] === p.id)?.[1] || 0;
      const bleedLeft = isHost()
        ? p.bleedT
        : ((S.remoteRevive || []).find((r) => r[0] === p.id)?.[2] ??
          BLEED_TIME);
      const bleed = 1 - Math.max(0, Math.min(1, bleedLeft / BLEED_TIME)); // fraction used up
      markers.push({
        id: p.id,
        name: p.name,
        slot: p.slot,
        x,
        y,
        onScreen,
        angle,
        dist,
        downed: p.downed || !!(f & FL.DOWN),
        bleed,
        beingRevived: rv > 0,
      });
    }
    avatars?.update(dt, camera);
    hud?.setMarkers?.(markers);
  }

  // spectator camera: over the shoulder of the first standing teammate
  function spectate() {
    if (!me.spectating) return false;
    const t = [...players.values()].find((p) => !p.isLocal && !p.spectating);
    if (!t) return false;
    if (avatars?.getHead) avatars.getHead(t.id, _head);
    else _head.set(t.pos.x, t.pos.y + 1.6, t.pos.z);
    const yaw = t.st[3];
    camera.position.set(
      _head.x + Math.sin(yaw) * 2.4,
      _head.y + 0.55,
      _head.z + Math.cos(yaw) * 2.4,
    );
    level.resolveCircle?.(camera.position, 0.2, 0.3);
    camera.lookAt(
      _head.x - Math.sin(yaw) * 3,
      _head.y - 0.2,
      _head.z - Math.cos(yaw) * 3,
    );
    hud?.setSpectating?.(t.name);
    return true;
  }

  // ------------------------------------------------------------------ public API
  return {
    S,
    players,
    evlog,
    get me() {
      return me;
    },
    isHost,
    get mode() {
      return S.mode;
    },
    get phase() {
      return S.phase;
    },
    set phase(v) {
      S.phase = v;
    },
    get net() {
      return S.net;
    },
    async hostSession(name, transport, signal) {
      const net = await NetMod.Net.host({ name, transport, signal });
      players.clear();
      me = null;
      attachNet(net);
      S.phase = "lobby";
      return lobbyView();
    },
    async joinSession(code, name, transport, signal) {
      const net = await NetMod.Net.join(code, { name, transport, signal });
      players.clear();
      me = null;
      attachNet(net);
      S.phase = "lobby";
      return lobbyView();
    },
    lobbyView,
    startSolo() {
      if (S.net) {
        S.net.close("solo");
        S.net = null;
      }
      S.mode = "solo";
      resetSolo();
      emit("start");
      beginRound(+(ctx.startRound || 1));
    },
    startMatch() {
      if (!isHost()) return;
      S.net?.lock?.(false);
      emit("start");
      beginRound(+(ctx.startRound || 1));
    },
    restart() {
      if (!isHost()) return;
      emit("restart");
      beginRound(1);
    },
    leave(reason = "left") {
      try {
        S.net?.close(reason);
      } catch {}
      S.net = null;
    },
    update,
    localInteract,
    localHitZombie,
    localExplode,
    localDowned,
    forwardWeaponEvents,
    spectate,
    chat(text) {
      const t = clean(text, 120).trim();
      if (t) request("chat", { text: t });
    },
    scoreboard() {
      return [...players.values()]
        .sort((a, b) => a.slot - b.slot)
        .map((p) => ({
          name: p.name,
          slot: p.slot,
          points: p.points,
          kills: p.kills,
          headshots: p.headshots,
          revives: p.revives,
          downs: p.downs,
          ping: p.isLocal
            ? 0
            : Math.round(
                S.net?.stats?.(isHost() ? p.id : undefined)?.rtt ?? p.ping ?? 0,
              ),
          isLocal: p.isLocal,
        }));
    },
    get power() {
      return S.power;
    },
    debugPower() {
      if (isHost()) emit("power", { by: S.selfId });
    },
    debugPoints(n) {
      if (isHost()) {
        me.points = n;
        ptsQueue.set(me.id, [0]);
      }
    },
    debugRound(n) {
      if (isHost()) {
        zombies.clear?.();
        S.round = n - 1;
        beginRound(n);
      }
    },
    debugPowerup(type) {
      if (!isHost()) return;
      const p = player.pos;
      emit("pu+", {
        uid: S.puSeq++,
        type,
        pos: [
          r2(p.x - Math.sin(player.yaw) * 2.5),
          0.9,
          r2(p.z - Math.cos(player.yaw) * 2.5),
        ],
      });
    },
  };
}
