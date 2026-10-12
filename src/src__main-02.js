// src__main 02 — hud
// Lines 197-538 of readable/src__main.pretty.js (statement-aligned).
async function boot() {
  const [mTex, mAudio, mLevel, mFx, mPost, mHud, mWeap, mZomb, mNet, mAv] =
    await Promise.all([
      load("./textures.js"),
      load("./audio.js"),
      load("./level.js"),
      load("./fx.js"),
      load("./post.js"),
      load("./hud.js"),
      load("./weapons.js"),
      load("./zombies.js"),
      load("./net.js"),
      load("./avatars.js"),
    ]);

  try {
    audio = mAudio ? new mAudio.AudioEngine() : null;
  } catch (e) {
    console.error(e);
    audio = null;
  }
  if (mHud) {
    try {
      hud = new mHud.HUD(document.getElementById("hud"));
    } catch (e) {
      console.error(e);
    }
  }
  hud?.showLoading?.(0.02, "Digging trenches…");
  if (hud) {
    hud.onUiSound = (n) => sfx(n, { volume: 0.5 });
    hud.onChatSend = (t) => game?.chat(t);
  }

  const tick = () => new Promise((r) => setTimeout(r, 0));
  if (!mTex) return fatal("textures.js missing");
  T = await mTex.createTextures(renderer, (p) =>
    hud?.showLoading?.(0.05 + p * 0.55, "Mixing concrete…"),
  );
  if (T.envMap) scene.environment = T.envMap;
  scene.environmentIntensity = 0.55;
  hud?.showLoading?.(0.62, "Boarding up windows…");
  await tick();

  if (!mLevel) return fatal("level.js missing");
  level = mLevel.buildLevel(scene, T);
  hud?.showLoading?.(0.75, "Waking the dead…");
  await tick();

  const raycaster = new THREE.Raycaster();
  try {
    fx = new mFx.FX(scene, camera);
    fx.raycast = (o, d, r) => {
      raycaster.set(o, d);
      raycaster.far = r;
      const h = raycaster.intersectObjects(level.raycastTargets, false)[0];
      return h
        ? {
            point: h.point,
            normal: h.face
              ? h.face.normal.clone().transformDirection(h.object.matrixWorld)
              : d.clone().negate(),
          }
        : null;
    };
    fx.onSound = (n, p) => sfx(n, { position: p, volume: 0.4 });
  } catch (e) {
    console.error("fx failed", e);
    fx = null;
  }
  fx =
    fx ||
    new Proxy(
      {},
      {
        get: () => () => ({
          object: new THREE.Object3D(),
          dispose() {},
          stop() {},
        }),
      },
    );

  WEAPONS = mWeap?.WEAPONS || {};
  buildWeaponModel = mWeap?.buildWeaponModel;
  NetMod = mNet;
  player = new Player(camera, level, audioProxy());

  const hooks = {
    raycast(origin, dir, range) {
      raycaster.set(origin, dir);
      raycaster.far = range;
      raycaster.near = 0;
      let best = null;
      const zh = zombies
        ? raycaster.intersectObjects(zombies.hitboxes, false)
        : [];
      if (zh.length) best = zh[0];
      const lh = raycaster.intersectObjects(level.raycastTargets, true);
      if (lh.length && (!best || lh[0].distance < best.distance)) best = lh[0];
      if (!best) return null;
      const ud = best.object.userData || {};
      const normal = best.face
        ? best.face.normal.clone().transformDirection(best.object.matrixWorld)
        : dir.clone().negate();
      let surf = ud.surface,
        o = best.object;
      while (!surf && o.parent) {
        o = o.parent;
        surf = o.userData?.surface;
      }
      return {
        point: best.point,
        normal,
        distance: best.distance,
        zombie: ud.zombie,
        part: ud.part,
        surface: ud.zombie ? "flesh" : surf || "concrete",
        object: best.object,
      };
    },
    damageZombie: (z, dmg, part, point, dir, info = {}) =>
      game
        ? game.localHitZombie(z, dmg, part, point, dir, info)
        : { killed: false },
    explode(pos, radius, damage, info = {}) {
      if (info.source === "aether") fx.aetherImpact?.(pos);
      else if (info.source !== "hellfire") fx.explosion?.(pos, radius / 4);
      game?.localExplode(pos, radius, damage, info);
      const d = player.pos.distanceTo(pos);
      if (d < radius + 3) player.shake(Math.max(0.15, 1 - d / (radius + 3)));
      if (
        info.source === "grenade" &&
        d < radius * 0.8 &&
        !game?.me?.perks?.has("ironhide")
      )
        hurtLocal(30 * (1 - d / radius), true);
    },
    addRecoil: (p, y) => player.addRecoil(p, y),
    shake: (a) => player.shake(a),
    getCamera: () => camera,
    scene,
    lunge: (dir, dist) => {
      player.vel.x += dir.x * dist * 6;
      player.vel.z += dir.z * dist * 6;
    },
    resolve: (pos, r) => level.resolveCircle(pos, r, 0.4),
  };
  if (mWeap) {
    weapons = new mWeap.WeaponSystem({ T, audio: audioProxy(), fx, hooks });
    weapons.setFov?.(settings.fov);
  }
  if (mZomb)
    zombies = new mZomb.ZombieManager({
      scene,
      level,
      T,
      audio: audioProxy(),
      fx,
    });
  if (mAv && buildWeaponModel) {
    try {
      avatars = new mAv.AvatarManager({
        scene,
        T,
        buildWeaponModel,
        fx,
        audio: audioProxy(),
      });
    } catch (e) {
      console.error("avatars failed", e);
    }
  }
  if (mPost && weapons) {
    try {
      post = mPost.createPost(
        renderer,
        scene,
        camera,
        weapons.viewScene,
        weapons.viewCamera,
      );
      post.setQuality?.(settings.quality);
    } catch (e) {
      console.error("post failed", e);
      post = null;
    }
  }
  player.spawn(level.playerStart.pos, level.playerStart.yaw);

  game = createGame({
    level,
    zombies,
    weapons,
    fx,
    hud,
    player,
    camera,
    avatars,
    NetMod,
    T,
    WEAPONS,
    buildWeaponModel,
    post,
    startRound: +(Q.get("round") || 1),
    getName: () => playerName,
    sfx,
    sting,
    flash: (v) => {
      flash = v;
      post?.setFlash?.(v);
    },
    hurtLocal,
    onRoster: (lobby) => {
      if (G.state === "lobby") hud?.updateLobby?.(lobby);
    },
    onMatchStart,
    onDying,
    onGameOver,
    onNetClosed,
    onPower: (on) => {
      exposureTarget = on ? EXPOSURE_POWERED : EXPOSURE_DARK;
    },
  });
  G.game = game;

  for (const wb of level.wallBuys || []) {
    try {
      const m = buildWeaponModel?.(wb.weaponId, T, false);
      if (m && wb.mount) {
        wb.mount.add(m);
        m.traverse((o) => {
          if (o.isMesh) o.castShadow = false;
        });
      }
    } catch (e) {
      console.warn("wallbuy model", wb.weaponId, e);
    }
  }
  try {
    fx.prewarm?.(renderer);
  } catch (e) {
    console.warn(e);
  }
  // build all four characters + their gun meshes now, so a teammate joining never hitches the frame
  if (avatars?.prewarm) {
    hud?.showLoading?.(0.9, "Mustering the squad…");
    await tick();
    try {
      avatars.prewarm();
    } catch (e) {
      console.warn("avatar prewarm", e);
    }
  }
  // compile every shader up front (parallel where the driver allows) so the first zombie, teammate or
  // muzzle flash never stalls a frame — a long stall in co-op can get a client timed out
  try {
    await renderer.compileAsync?.(scene, camera);
    if (weapons)
      await renderer.compileAsync?.(weapons.viewScene, weapons.viewCamera);
  } catch (e) {
    console.warn("precompile", e);
  }
  for (const p of level.fireSpots || []) fx.embers?.(p);

  hud?.showLoading?.(1, "Ready.");
  await new Promise((r) => setTimeout(r, 250));
  hud?.hideLoading?.();
  addEventListener("resize", onResize);
  onResize();
  requestAnimationFrame(frame);

  if (Q.has("autoplay")) startSolo();
  else {
    enterMenu();
    const code = (Q.get("join") || "")
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, "")
      .slice(0, 5);
    if (code) joinFlow(code);
    else if (Q.has("host")) hostFlow();
  }
  window.__ready = true;
}

// ---------------------------------------------------------------- local player health
function hurtLocal(dmg, silent) {
  if (!game || game.phase !== "playing" || player.downed || game.me?.spectating)
    return;
  if (G.god) return; // audit harness only
  const downed = player.damage(dmg);
  if (!silent) sfx("player_hurt", { volume: 0.9 });
  hud?.damage?.(Math.min(1, dmg / 60));
  if (downed) game.localDowned();
}

// ---------------------------------------------------------------- flow: menu / lobby / match
function enterMenu() {
  G.state = "menu";
  menuT = 0;
  paused = false;
  document.exitPointerLock?.();
  hud?.setVisible?.(false);
  hud?.hideGameOver?.();
  hud?.hidePause?.();
  hud?.hideLobby?.();
  post?.setMood?.({ menu: true, downed: false, instakill: false });
  if (audioReady) {
    audio.setDucked(false);
    audio.playMusic("menu", { loop: true });
  }
  weapons?.holster?.(true);
  zombies?.clear?.();
  if (zombies)
    for (let i = 0; i < 5; i++) {
      const w = level.windows[i % level.windows.length];
      setTimeout(
        () =>
          G.state === "menu" &&
          zombies.spawn(w, { health: 1e9, speed: "walk" }),
        i * 1400,
      );
    }
  showMainMenu();
}
function showMainMenu() {
  hud?.showMenu?.({
    onPlay: () => startSolo(),
    onHost: (name) => {
      if (name) saveName(name);
      hostFlow();
    },
    onJoin: (code, name) => {
      if (name) saveName(name);
      joinFlow(code);
    },
    onSettings: () => openSettings(showMainMenu),
    name: playerName,
    onName: saveName,
  });
}

