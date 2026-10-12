// src__main 04 — player
// Lines 882-1147 of readable/src__main.pretty.js (statement-aligned).
addEventListener(
  "wheel",
  (e) => {
    if (G.state === "playing" && !paused && Math.abs(e.deltaY) > 4)
      edges.swap = true;
  },
  { passive: true },
);
addEventListener("mousemove", (e) => {
  if (document.pointerLockElement !== canvas) return;
  // guard against the huge spurious deltas some browsers emit on lock
  if (Math.abs(e.movementX) > 400 || Math.abs(e.movementY) > 400) return;
  lookDX += e.movementX;
  lookDY += e.movementY;
});
document.addEventListener("pointerlockchange", () => {
  if (!document.pointerLockElement && G.state === "playing" && !chatting()) {
    mouseDown = adsDown = false;
    pause();
  }
});

function onResize() {
  const w = innerWidth,
    h = innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  if (weapons?.viewCamera) {
    weapons.viewCamera.aspect = w / h;
    weapons.viewCamera.updateProjectionMatrix();
  }
  post?.setSize?.(w, h);
}

// ---------------------------------------------------------------- frame
function frame() {
  requestAnimationFrame(frame);
  clock.update();
  const dt = Math.min(clock.getDelta(), 1 / 20);
  try {
    step(dt, clock.getElapsed());
  } catch (e) {
    console.error("frame error", e);
  }
  render(dt);
}
function render(dt) {
  if (post) post.render(dt);
  else {
    renderer.autoClear = true;
    renderer.render(scene, camera);
    if (weapons) {
      renderer.autoClear = false;
      renderer.clearDepth();
      renderer.render(weapons.viewScene, weapons.viewCamera);
    }
  }
}

// A backgrounded tab gets no rAF. In an online match the simulation must keep running (the host
// drives everyone's zombies; a client must keep reporting), so a worker clock ticks it headlessly.
let bgLast = 0;
try {
  const src = "let i=setInterval(()=>postMessage(0),33);";
  const bg = new Worker(
    URL.createObjectURL(new Blob([src], { type: "text/javascript" })),
  );
  bg.onmessage = () => {
    if (!document.hidden || !coop() || !inMatch()) {
      bgLast = 0;
      return;
    }
    const t = performance.now() / 1000;
    const dt = bgLast ? Math.min(0.1, t - bgLast) : 1 / 30;
    bgLast = t;
    try {
      step(dt, t);
    } catch (e) {
      console.error("bg step", e);
    }
  };
} catch (e) {
  console.warn("no background worker", e);
}

const _v = new THREE.Vector3();
function step(dt, time) {
  level.update?.(dt, time, player.pos);

  if (G.state === "menu" || G.state === "lobby" || G.state === "loading") {
    menuT += dt;
    const c = level.menuCamera,
      s = level.playerStart.pos,
      a = menuT * 0.05;
    if (c?.pos)
      camera.position
        .copy(c.pos)
        .add(
          _v.set(Math.sin(menuT * 0.1) * 0.6, Math.sin(menuT * 0.23) * 0.1, 0),
        );
    else
      camera.position.set(
        s.x + Math.cos(a) * 3.5,
        1.9,
        s.z + Math.sin(a) * 3.5,
      );
    camera.lookAt(c?.target || _v.set(s.x, 1.4, s.z));
    zombies?.update(dt, {
      pos: camera.position.clone().setY(0),
      eye: camera.position,
      alive: false,
    });
  }

  if (inMatch() || G.state === "gameover") {
    const soloPaused = paused && !coop();
    if (!soloPaused) {
      const live =
        G.state === "playing" &&
        !paused &&
        !chatting() &&
        game.phase === "playing";
      const ws = weapons?.getState?.() || {};
      if (live)
        player.look(
          lookDX,
          lookDY,
          settings.sensitivity * (ws.ads > 0.5 ? 0.6 : 1),
        );
      else player.lookDX = player.lookDY = 0;
      lookDX = lookDY = 0;
      player.frozen = !live || !!game.me?.spectating;
      player.update(dt, live ? keys : {}, {
        moveMul: ws.moveMul ?? 1,
        sprintBlocked: ws.sprintBlocked || adsDown,
        sprintCancel:
          ws.wantsSprintCancel || (edges.firePressed && player.sprinting),
      });
      const spectating = game.spectate();
      const fovTarget =
        settings.fov * (ws.fovMul ?? 1) * (1 + 0.07 * player.sprint01);
      camera.fov += (fovTarget - camera.fov) * (1 - Math.exp(-dt * 12));
      camera.updateProjectionMatrix();

      if (!spectating) {
        weapons?.update(
          dt,
          {
            fire: mouseDown && live,
            firePressed: edges.firePressed && live,
            ads: adsDown && live,
            reload: edges.reload,
            knife: edges.knife,
            grenade: edges.grenade,
            swap: edges.swap,
            lookDX: player.lookDX,
            lookDY: player.lookDY,
          },
          player.state,
        );
      }
      game.forwardWeaponEvents(weapons?.drainEvents?.());
      const w2 = weapons?.getState?.() || ws;
      hud?.setAmmo?.({
        name: w2.name,
        mag: w2.mag,
        reserve: w2.reserve,
        magSize: w2.magSize,
        upgraded: w2.upgraded,
        grenades: w2.grenades,
      });
      hud?.crosshair?.(
        w2.spread ?? 0.3,
        (w2.ads ?? 0) < 0.5 && player.sprint01 < 0.5 && !spectating,
      );
      hud?.setHealth?.(player.health / player.maxHealth);

      game.localInteract(edges.interact && live, !!keys.KeyF && live, dt);
      game.update(dt);

      if (
        player.health / player.maxHealth < 0.35 &&
        !player.downed &&
        game.phase === "playing"
      ) {
        hbT -= dt;
        if (hbT <= 0) {
          hbT = 0.9;
          sfx("heartbeat", { volume: 0.7 });
        }
      }
      post?.setDamage?.(
        game.me?.spectating ? 0 : 1 - player.health / player.maxHealth,
      );
      if (keys.Tab && G.state === "playing")
        hud?.showScoreboard?.(game.scoreboard());
      if (coop()) {
        G.netT = (G.netT || 0) - dt;
        if (G.netT <= 0 && !game.isHost()) {
          G.netT = 1;
          const st = game.net.stats?.() || {};
          hud?.setNetStatus?.({
            ping: Math.round(st.rtt || 0),
            loss: Math.round(st.loss || 0),
            warn: (st.rtt || 0) > 220 || (st.loss || 0) > 6,
          });
        }
      }
    }
  }

  if (flash > 0) {
    flash = Math.max(0, flash - dt * 0.7);
    post?.setFlash?.(flash);
  }
  // slow eye-adaptation toward the target exposure
  renderer.toneMappingExposure +=
    (exposureTarget - renderer.toneMappingExposure) * (1 - Math.exp(-dt * 0.8));
  for (const k in edges) edges[k] = false;
  if (audioReady) {
    camera.updateMatrixWorld();
    audio.setListener(camera.position, camera.quaternion);
    audio.update(dt);
  }
  fx.update?.(dt);
  hud?.update?.(dt);
}

// ---------------------------------------------------------------- debug handles for audits
window.__three = {
  renderer,
  scene,
  camera,
  get level() {
    return level;
  },
  get weapons() {
    return weapons;
  },
  get zombies() {
    return zombies;
  },
  get post() {
    return post;
  },
  get avatars() {
    return avatars;
  },
  get player() {
    return player;
  },
};
window.__stats = () => ({
  calls: renderer.info.render.calls,
  tris: renderer.info.render.triangles,
  state: G.state,
  phase: game?.phase,
  mode: game?.mode,
  round: game?.S.round,
  alive: zombies?.alive,
  points: game?.me?.points,
  players: game?.players.size,
  geo: renderer.info.memory.geometries,
  tex: renderer.info.memory.textures,
});
