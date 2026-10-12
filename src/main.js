// UNBURIED — integrator: boot, renderer, input, menus/lobby, local player + weapon, frame loop.
// Game rules and the co-op session live in game.js.
import * as THREE from 'three';
import { Player } from './player.js';
import { createGame, SLOT_COLORS } from './game.js';

const Q = new URLSearchParams(location.search);
const TRANSPORT = Q.get('net') === 'local' ? 'local' : 'peerjs';
const $fatal = document.getElementById('fatal');
function fatal(msg, err) {
  console.error(msg, err);
  $fatal.style.display = 'grid';
  $fatal.innerHTML = `<div><b>UNBURIED failed to start</b>${msg}<br><small>${(err && err.message) || ''}</small></div>`;
}

// ---------------------------------------------------------------- settings
const DEFAULT_SETTINGS = { sensitivity: 1.0, fov: 80, master: 0.9, music: 0.6, sfx: 0.9, quality: 'high' };
const settings = { ...DEFAULT_SETTINGS };
try { Object.assign(settings, JSON.parse(localStorage.getItem('unburied.settings') || '{}')); } catch {}
const saveSettings = () => { try { localStorage.setItem('unburied.settings', JSON.stringify(settings)); } catch {} };
let playerName = 'Soldier';
try { playerName = localStorage.getItem('unburied.name') || `Soldier ${100 + ((Math.random() * 900) | 0)}`; } catch {}
const saveName = (n) => { playerName = String(n || '').replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, 16) || playerName; try { localStorage.setItem('unburied.name', playerName); } catch {} };

// ---------------------------------------------------------------- renderer
const canvas = document.getElementById('game');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', stencil: false });
renderer.setPixelRatio(Math.min(devicePixelRatio, settings.quality === 'high' ? 1.75 : 1));
renderer.setSize(innerWidth, innerHeight, false);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.6;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;

const scene = new THREE.Scene();      // fog + sky are owned by level.js
const camera = new THREE.PerspectiveCamera(settings.fov, innerWidth / innerHeight, 0.05, 400);
scene.add(camera);

async function load(path) {
  try { return await import(path); } catch (e) { console.error('module failed:', path, e); return null; }
}

const G = window.__game = { state: 'loading' };
let T, audio, level, fx, post, hud, weapons, zombies, player, avatars, game, NetMod;
let WEAPONS = {}, buildWeaponModel;
const keys = {};
let lookDX = 0, lookDY = 0;
const edges = { firePressed: false, reload: false, knife: false, grenade: false, swap: false, interact: false };
let mouseDown = false, adsDown = false, paused = false, menuT = 0, flash = 0, hbT = 0, leaving = false;
const clock = new THREE.Timer();
// exposure is tuned per lighting state: the powered bunker is ~3× brighter, so the camera "stops down"
const EXPOSURE_DARK = 1.6, EXPOSURE_POWERED = 0.95;
let exposureTarget = EXPOSURE_DARK;
function lockPointer() {
  try { const p = canvas.requestPointerLock?.({ unadjustedMovement: true }); p?.catch?.(() => { try { canvas.requestPointerLock?.()?.catch?.(() => {}); } catch {} }); } catch {}
}

// ---------------------------------------------------------------- audio
let audioReady = false;
async function unlockAudio() {
  if (audioReady || !audio) return;
  audioReady = true;
  try {
    await audio.init();
    audio.setVolume({ master: settings.master, music: settings.music, sfx: settings.sfx });
    if (G.state === 'menu' || G.state === 'lobby') audio.playMusic('menu', { loop: true });
    audio.play('ambient_wind', { loop: true, volume: 0.35 });
    audio.play('ambient_drone', { loop: true, volume: 0.25 });
  } catch (e) { console.error('audio init failed', e); }
}
addEventListener('pointerdown', unlockAudio);
addEventListener('keydown', unlockAudio);
const sfx = (n, o) => { if (audioReady) try { return audio.play(n, o); } catch {} return null; };
const sting = (n, o) => { if (audioReady) try { audio.sting(n, o); } catch {} };
function audioProxy() {
  return new Proxy({}, {
    get(_, k) {
      if (!audio) return () => ({ stop() {}, setPosition() {} });
      const v = audio[k];
      if (typeof v !== 'function') return v;
      return (...a) => {
        if (!audioReady && k !== 'init') return { stop() {}, setPosition() {} };
        try { return v.apply(audio, a) ?? { stop() {} }; } catch { return { stop() {} }; }
      };
    },
  });
}

// ---------------------------------------------------------------- boot
async function boot() {
  const [mTex, mAudio, mLevel, mFx, mPost, mHud, mWeap, mZomb, mNet, mAv] = await Promise.all([
    load('./textures.js'), load('./audio.js'), load('./level.js'), load('./fx.js'), load('./post.js'),
    load('./hud.js'), load('./weapons.js'), load('./zombies.js'), load('./net.js'), load('./avatars.js')]);

  try { audio = mAudio ? new mAudio.AudioEngine() : null; } catch (e) { console.error(e); audio = null; }
  if (mHud) { try { hud = new mHud.HUD(document.getElementById('hud')); } catch (e) { console.error(e); } }
  hud?.showLoading?.(0.02, 'Digging trenches…');
  if (hud) { hud.onUiSound = (n) => sfx(n, { volume: 0.5 }); hud.onChatSend = (t) => game?.chat(t); }

  const tick = () => new Promise((r) => setTimeout(r, 0));
  if (!mTex) return fatal('textures.js missing');
  T = await mTex.createTextures(renderer, (p) => hud?.showLoading?.(0.05 + p * 0.55, 'Mixing concrete…'));
  if (T.envMap) scene.environment = T.envMap;
  scene.environmentIntensity = 0.55;
  hud?.showLoading?.(0.62, 'Boarding up windows…'); await tick();

  if (!mLevel) return fatal('level.js missing');
  level = mLevel.buildLevel(scene, T);
  hud?.showLoading?.(0.75, 'Waking the dead…'); await tick();

  const raycaster = new THREE.Raycaster();
  try {
    fx = new mFx.FX(scene, camera);
    fx.raycast = (o, d, r) => {
      raycaster.set(o, d); raycaster.far = r;
      const h = raycaster.intersectObjects(level.raycastTargets, false)[0];
      return h ? { point: h.point, normal: h.face ? h.face.normal.clone().transformDirection(h.object.matrixWorld) : d.clone().negate() } : null;
    };
    fx.onSound = (n, p) => sfx(n, { position: p, volume: 0.4 });
  } catch (e) { console.error('fx failed', e); fx = null; }
  fx = fx || new Proxy({}, { get: () => () => ({ object: new THREE.Object3D(), dispose() {}, stop() {} }) });

  WEAPONS = mWeap?.WEAPONS || {}; buildWeaponModel = mWeap?.buildWeaponModel;
  NetMod = mNet;
  player = new Player(camera, level, audioProxy());

  const hooks = {
    raycast(origin, dir, range) {
      raycaster.set(origin, dir); raycaster.far = range; raycaster.near = 0;
      let best = null;
      const zh = zombies ? raycaster.intersectObjects(zombies.hitboxes, false) : [];
      if (zh.length) best = zh[0];
      const lh = raycaster.intersectObjects(level.raycastTargets, true);
      if (lh.length && (!best || lh[0].distance < best.distance)) best = lh[0];
      if (!best) return null;
      const ud = best.object.userData || {};
      const normal = best.face ? best.face.normal.clone().transformDirection(best.object.matrixWorld) : dir.clone().negate();
      let surf = ud.surface, o = best.object;
      while (!surf && o.parent) { o = o.parent; surf = o.userData?.surface; }
      return { point: best.point, normal, distance: best.distance, zombie: ud.zombie, part: ud.part,
        surface: ud.zombie ? 'flesh' : (surf || 'concrete'), object: best.object };
    },
    damageZombie: (z, dmg, part, point, dir, info = {}) => game ? game.localHitZombie(z, dmg, part, point, dir, info) : { killed: false },
    explode(pos, radius, damage, info = {}) {
      if (info.source === 'aether') fx.aetherImpact?.(pos);
      else if (info.source !== 'hellfire') fx.explosion?.(pos, radius / 4);
      game?.localExplode(pos, radius, damage, info);
      const d = player.pos.distanceTo(pos);
      if (d < radius + 3) player.shake(Math.max(0.15, 1 - d / (radius + 3)));
      if (info.source === 'grenade' && d < radius * 0.8 && !game?.me?.perks?.has('ironhide')) hurtLocal(30 * (1 - d / radius), true);
    },
    addRecoil: (p, y) => player.addRecoil(p, y),
    shake: (a) => player.shake(a),
    getCamera: () => camera,
    scene,
    lunge: (dir, dist) => { player.vel.x += dir.x * dist * 6; player.vel.z += dir.z * dist * 6; },
    resolve: (pos, r) => level.resolveCircle(pos, r, 0.4),
  };
  if (mWeap) {
    weapons = new mWeap.WeaponSystem({ T, audio: audioProxy(), fx, hooks });
    weapons.setFov?.(settings.fov);
  }
  if (mZomb) zombies = new mZomb.ZombieManager({ scene, level, T, audio: audioProxy(), fx });
  if (mAv && buildWeaponModel) {
    try { avatars = new mAv.AvatarManager({ scene, T, buildWeaponModel, fx, audio: audioProxy() }); } catch (e) { console.error('avatars failed', e); }
  }
  if (mPost && weapons) {
    try { post = mPost.createPost(renderer, scene, camera, weapons.viewScene, weapons.viewCamera); post.setQuality?.(settings.quality); }
    catch (e) { console.error('post failed', e); post = null; }
  }
  player.spawn(level.playerStart.pos, level.playerStart.yaw);

  game = createGame({
    level, zombies, weapons, fx, hud, player, camera, avatars, NetMod, T, WEAPONS, buildWeaponModel, post,
    startRound: +(Q.get('round') || 1),
    getName: () => playerName,
    sfx, sting,
    flash: (v) => { flash = v; post?.setFlash?.(v); },
    hurtLocal,
    onRoster: (lobby) => { if (G.state === 'lobby') hud?.updateLobby?.(lobby); },
    onMatchStart,
    onDying,
    onGameOver,
    onNetClosed,
    onPower: (on) => { exposureTarget = on ? EXPOSURE_POWERED : EXPOSURE_DARK; },
  });
  G.game = game;

  for (const wb of level.wallBuys || []) {
    try {
      const m = buildWeaponModel?.(wb.weaponId, T, false);
      if (m && wb.mount) { wb.mount.add(m); m.traverse((o) => { if (o.isMesh) o.castShadow = false; }); }
    } catch (e) { console.warn('wallbuy model', wb.weaponId, e); }
  }
  try { fx.prewarm?.(renderer); } catch (e) { console.warn(e); }
  // build all four characters + their gun meshes now, so a teammate joining never hitches the frame
  if (avatars?.prewarm) { hud?.showLoading?.(0.9, 'Mustering the squad…'); await tick(); try { avatars.prewarm(); } catch (e) { console.warn('avatar prewarm', e); } }
  // compile every shader up front (parallel where the driver allows) so the first zombie, teammate or
  // muzzle flash never stalls a frame — a long stall in co-op can get a client timed out
  try {
    await renderer.compileAsync?.(scene, camera);
    if (weapons) await renderer.compileAsync?.(weapons.viewScene, weapons.viewCamera);
  } catch (e) { console.warn('precompile', e); }
  for (const p of level.fireSpots || []) fx.embers?.(p);

  hud?.showLoading?.(1, 'Ready.');
  await new Promise((r) => setTimeout(r, 250));
  hud?.hideLoading?.();
  addEventListener('resize', onResize); onResize();
  requestAnimationFrame(frame);

  if (Q.has('autoplay')) startSolo();
  else {
    enterMenu();
    const code = (Q.get('join') || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 5);
    if (code) joinFlow(code);
    else if (Q.has('host')) hostFlow();
  }
  window.__ready = true;
}

// ---------------------------------------------------------------- local player health
function hurtLocal(dmg, silent) {
  if (!game || game.phase !== 'playing' || player.downed || game.me?.spectating) return;
  if (G.god) return;                          // audit harness only
  const downed = player.damage(dmg);
  if (!silent) sfx('player_hurt', { volume: 0.9 });
  hud?.damage?.(Math.min(1, dmg / 60));
  if (downed) game.localDowned();
}

// ---------------------------------------------------------------- flow: menu / lobby / match
function enterMenu() {
  G.state = 'menu'; menuT = 0; paused = false;
  document.exitPointerLock?.();
  hud?.setVisible?.(false);
  hud?.hideGameOver?.(); hud?.hidePause?.(); hud?.hideLobby?.();
  post?.setMood?.({ menu: true, downed: false, instakill: false });
  if (audioReady) { audio.setDucked(false); audio.playMusic('menu', { loop: true }); }
  weapons?.holster?.(true);
  zombies?.clear?.();
  if (zombies) for (let i = 0; i < 5; i++) {
    const w = level.windows[i % level.windows.length];
    setTimeout(() => G.state === 'menu' && zombies.spawn(w, { health: 1e9, speed: 'walk' }), i * 1400);
  }
  showMainMenu();
}
function showMainMenu() {
  hud?.showMenu?.({
    onPlay: () => startSolo(),
    onHost: (name) => { if (name) saveName(name); hostFlow(); },
    onJoin: (code, name) => { if (name) saveName(name); joinFlow(code); },
    onSettings: () => openSettings(showMainMenu),
    name: playerName,
    onName: saveName,
  });
}

function startSolo() {
  zombies?.clear?.();
  game.startSolo();
  if (Q.has('power')) game.debugPower();
  if (Q.get('points')) game.debugPoints(+Q.get('points'));
  if (Q.get('pos')) { const [x, z] = Q.get('pos').split(',').map(Number); player.pos.set(x, 0, z); }
  if (Q.get('yaw')) player.yaw = +Q.get('yaw');
}

const NET_ERRORS = {
  'not-found': ['ROOM NOT FOUND', 'No squad is holding that position. Check the code and try again.'],
  full: ['SQUAD FULL', 'That squad already has four soldiers.'],
  version: ['VERSION MISMATCH', 'Your game is a different version from the host’s. Refresh the page and try again.'],
  broker: ['NO SIGNAL', 'Could not reach the matchmaking relay. Check your connection and try again.'],
  timeout: ['CONNECTION TIMED OUT', 'The host did not answer. They may be behind a strict firewall — try again, or have another player host.'],
  rejected: ['JOIN REFUSED', 'The host is not accepting new soldiers right now.'],
  network: ['NETWORK ERROR', 'The connection failed. Try again.'],
};
function showNetError(e, onOk = () => { game.leave(); enterMenu(); }) {
  const [title, text] = NET_ERRORS[e?.code] || ['CONNECTION FAILED', e?.message || 'Something went wrong.'];
  hud?.hideConnecting?.();
  hud?.showError?.(title, text, { onOk });
}

async function hostFlow() {
  if (!NetMod) return showNetError({ code: 'network', message: 'Networking module failed to load.' });
  let cancelled = false;
  const ac = new AbortController();
  hud?.showConnecting?.('Opening a line to HQ…', { onCancel: () => { cancelled = true; ac.abort(); game.leave(); enterMenu(); } });
  try {
    const lobby = await game.hostSession(playerName, TRANSPORT, ac.signal);
    if (cancelled) { game.leave(); return; }
    hud?.hideConnecting?.();
    showLobby(lobby);
  } catch (e) { if (!cancelled) showNetError(e); }
}
async function joinFlow(code) {
  if (!NetMod) return showNetError({ code: 'network', message: 'Networking module failed to load.' });
  let cancelled = false;
  const ac = new AbortController();
  hud?.showConnecting?.(`Raising squad ${code}…`, { onCancel: () => { cancelled = true; ac.abort(); game.leave(); enterMenu(); } });
  try {
    const lobby = await game.joinSession(code, playerName, TRANSPORT, ac.signal);
    if (cancelled) { game.leave(); return; }
    hud?.hideConnecting?.();
    if (game.phase === 'lobby') showLobby(lobby);      // host might already be mid-game → 'full' starts us
  } catch (e) {
    if (!cancelled) showNetError(e, () => { game.leave(); enterMenu(); hud?.showCoop?.(); hud?.setJoinCode?.(code); });
  }
}
function showLobby(lobby) {
  G.state = 'lobby';
  hud?.hideMenu?.();
  hud?.showLobby?.(lobby, {
    onStart: () => game.startMatch(),
    onLeave: () => leaveToMenu(),
    onCopyInvite: async () => {
      const url = game.net?.inviteUrl || lobby.inviteUrl;
      try { await navigator.clipboard.writeText(url); return true; }
      catch { try { const ta = Object.assign(document.createElement('textarea'), { value: url }); document.body.appendChild(ta); ta.select(); document.execCommand('copy'); ta.remove(); return true; } catch { return false; } }
    },
  });
}
function leaveToMenu() {
  leaving = true;
  game.leave();
  location.href = location.pathname;          // clean slate (world, net, audio)
}

function onMatchStart({ late } = {}) {
  G.state = 'playing'; paused = false;
  hud?.hideMenu?.(); hud?.hideLobby?.(); hud?.hideConnecting?.(); hud?.hideGameOver?.(); hud?.hidePause?.();
  hud?.setVisible?.(true);
  if (audioReady) { audio.stopMusic(2); audio.setDucked(false); if (!late) sting('round_start'); }
  lockPointer();
  if (!document.pointerLockElement && !Q.has('autoplay')) hud?.message?.('Click to take control', 4);
  if (late) hud?.message?.('You have joined the fight', 4);
}
function onDying() {
  post?.setMood?.({ downed: true });
  if (audioReady) audio.setDucked(true);
}
function onGameOver(d, me) {
  G.state = 'gameover';
  document.exitPointerLock?.();
  hud?.setVisible?.(false);
  if (audioReady) { audio.setDucked(false); audio.playMusic('gameover'); }
  const isHost = game.isHost();
  hud?.showGameOver?.({ round: d?.round ?? 0, kills: me.kills, headshots: me.headshots, points: me.points,
    timeSec: d?.timeSec ?? 0, downs: me.downs, revives: me.revives, team: d?.rows || [] },
  {
    onRestart: isHost ? () => { hud?.hideGameOver?.(); game.restart(); } : () => hud?.message?.('Waiting for the host to restart…', 3),
    onMenu: () => leaveToMenu(),
  });
}
function onNetClosed(reason) {
  if (leaving) return;
  const map = {
    'host-left': ['HOST DISCONNECTED', 'The host has left. The squad has been disbanded.'],
    'host-timeout': ['CONNECTION LOST', 'Lost contact with the host.'],
    kicked: ['REMOVED FROM SQUAD', 'The host removed you from the game.'],
    network: ['CONNECTION LOST', 'The network connection dropped.'],
  };
  const [title, text] = map[reason] || ['DISCONNECTED', 'The session ended.'];
  document.exitPointerLock?.();
  hud?.showError?.(title, text, { onOk: () => { leaving = true; location.href = location.pathname; } });
}

function openSettings(onClose) {
  hud?.showSettings?.({ ...settings }, (k, v) => {
    settings[k] = v; saveSettings();
    if (k === 'fov') weapons?.setFov?.(v);
    if (['master', 'music', 'sfx'].includes(k)) audio?.setVolume?.({ master: settings.master, music: settings.music, sfx: settings.sfx });
    if (k === 'quality') { post?.setQuality?.(v); renderer.setPixelRatio(Math.min(devicePixelRatio, v === 'high' ? 1.75 : 1)); onResize(); }
  }, onClose);
}

const inMatch = () => G.state === 'playing' || G.state === 'paused' || game?.phase === 'dying';
const coop = () => !!game?.net;
function pause() {
  if (G.state !== 'playing' || paused) return;
  paused = true;
  mouseDown = adsDown = false;
  for (const k in keys) keys[k] = false;
  if (!coop() && audioReady) audio.setDucked(true);
  hud?.showPause?.({
    onResume: resume,
    onSettings: () => openSettings(() => { hud?.hidePause?.(); paused = false; pause(); }),
    onQuit: () => leaveToMenu(),
    coop: coop(),
  });
}
function resume() {
  hud?.hidePause?.();
  paused = false;
  if (audioReady) audio.setDucked(false);
  lockPointer();
}

// ---------------------------------------------------------------- input
const chatting = () => !!hud?.chatActive;
addEventListener('keydown', (e) => {
  if (chatting()) return;                       // HUD's chat input owns the keyboard
  if (e.code === 'Tab') { e.preventDefault(); if (G.state === 'playing') hud?.showScoreboard?.(game.scoreboard()); keys.Tab = true; return; }
  if (e.code === 'Escape' || e.code === 'KeyP') { if (G.state === 'playing' && !document.pointerLockElement) pause(); return; }
  if ((e.code === 'KeyT' || e.code === 'Enter') && G.state === 'playing' && coop() && !paused) {
    e.preventDefault(); for (const k in keys) keys[k] = false; mouseDown = adsDown = false;
    hud?.openChat?.(); return;
  }
  if (keys[e.code]) return;
  keys[e.code] = true;
  if (G.state !== 'playing' || paused) return;
  if (e.code === 'KeyR') edges.reload = true;
  if (e.code === 'KeyV') edges.knife = true;
  if (e.code === 'KeyG') edges.grenade = true;
  if (e.code === 'KeyQ' || e.code === 'Digit1' || e.code === 'Digit2') edges.swap = true;
  if (e.code === 'KeyF') edges.interact = true;
  if (e.code === 'Space') e.preventDefault();
});
addEventListener('keyup', (e) => {
  keys[e.code] = false;
  if (e.code === 'Tab') hud?.showScoreboard?.(null);
});
addEventListener('blur', () => { for (const k in keys) keys[k] = false; mouseDown = adsDown = false; hud?.showScoreboard?.(null); });
canvas.addEventListener('mousedown', (e) => {
  if (G.state !== 'playing' || paused) return;
  if (!document.pointerLockElement) { lockPointer(); return; }
  if (e.button === 0) { mouseDown = true; edges.firePressed = true; }
  if (e.button === 2) adsDown = true;
});
addEventListener('mouseup', (e) => { if (e.button === 0) mouseDown = false; if (e.button === 2) adsDown = false; });
addEventListener('contextmenu', (e) => e.preventDefault());
addEventListener('wheel', (e) => { if (G.state === 'playing' && !paused && Math.abs(e.deltaY) > 4) edges.swap = true; }, { passive: true });
addEventListener('mousemove', (e) => {
  if (document.pointerLockElement !== canvas) return;
  // guard against the huge spurious deltas some browsers emit on lock
  if (Math.abs(e.movementX) > 400 || Math.abs(e.movementY) > 400) return;
  lookDX += e.movementX; lookDY += e.movementY;
});
document.addEventListener('pointerlockchange', () => {
  if (!document.pointerLockElement && G.state === 'playing' && !chatting()) { mouseDown = adsDown = false; pause(); }
});

function onResize() {
  const w = innerWidth, h = innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h; camera.updateProjectionMatrix();
  if (weapons?.viewCamera) { weapons.viewCamera.aspect = w / h; weapons.viewCamera.updateProjectionMatrix(); }
  post?.setSize?.(w, h);
}

// ---------------------------------------------------------------- frame
function frame() {
  requestAnimationFrame(frame);
  clock.update();
  const dt = Math.min(clock.getDelta(), 1 / 20);
  try { step(dt, clock.getElapsed()); } catch (e) { console.error('frame error', e); }
  render(dt);
}
function render(dt) {
  if (post) post.render(dt);
  else {
    renderer.autoClear = true; renderer.render(scene, camera);
    if (weapons) { renderer.autoClear = false; renderer.clearDepth(); renderer.render(weapons.viewScene, weapons.viewCamera); }
  }
}

// A backgrounded tab gets no rAF. In an online match the simulation must keep running (the host
// drives everyone's zombies; a client must keep reporting), so a worker clock ticks it headlessly.
let bgLast = 0;
try {
  const src = 'let i=setInterval(()=>postMessage(0),33);';
  const bg = new Worker(URL.createObjectURL(new Blob([src], { type: 'text/javascript' })));
  bg.onmessage = () => {
    if (!document.hidden || !coop() || !inMatch()) { bgLast = 0; return; }
    const t = performance.now() / 1000;
    const dt = bgLast ? Math.min(0.1, t - bgLast) : 1 / 30;
    bgLast = t;
    try { step(dt, t); } catch (e) { console.error('bg step', e); }
  };
} catch (e) { console.warn('no background worker', e); }

const _v = new THREE.Vector3();
function step(dt, time) {
  level.update?.(dt, time, player.pos);

  if (G.state === 'menu' || G.state === 'lobby' || G.state === 'loading') {
    menuT += dt;
    const c = level.menuCamera, s = level.playerStart.pos, a = menuT * 0.05;
    if (c?.pos) camera.position.copy(c.pos).add(_v.set(Math.sin(menuT * 0.1) * 0.6, Math.sin(menuT * 0.23) * 0.1, 0));
    else camera.position.set(s.x + Math.cos(a) * 3.5, 1.9, s.z + Math.sin(a) * 3.5);
    camera.lookAt(c?.target || _v.set(s.x, 1.4, s.z));
    zombies?.update(dt, { pos: camera.position.clone().setY(0), eye: camera.position, alive: false });
  }

  if (inMatch() || G.state === 'gameover') {
    const soloPaused = paused && !coop();
    if (!soloPaused) {
      const live = G.state === 'playing' && !paused && !chatting() && game.phase === 'playing';
      const ws = weapons?.getState?.() || {};
      if (live) player.look(lookDX, lookDY, settings.sensitivity * (ws.ads > 0.5 ? 0.6 : 1));
      else player.lookDX = player.lookDY = 0;
      lookDX = lookDY = 0;
      player.frozen = !live || !!game.me?.spectating;
      player.update(dt, live ? keys : {}, {
        moveMul: ws.moveMul ?? 1,
        sprintBlocked: ws.sprintBlocked || adsDown,
        sprintCancel: ws.wantsSprintCancel || (edges.firePressed && player.sprinting),
      });
      const spectating = game.spectate();
      const fovTarget = settings.fov * (ws.fovMul ?? 1) * (1 + 0.07 * player.sprint01);
      camera.fov += (fovTarget - camera.fov) * (1 - Math.exp(-dt * 12));
      camera.updateProjectionMatrix();

      if (!spectating) {
        weapons?.update(dt, {
          fire: mouseDown && live, firePressed: edges.firePressed && live, ads: adsDown && live,
          reload: edges.reload, knife: edges.knife, grenade: edges.grenade, swap: edges.swap,
          lookDX: player.lookDX, lookDY: player.lookDY,
        }, player.state);
      }
      game.forwardWeaponEvents(weapons?.drainEvents?.());
      const w2 = weapons?.getState?.() || ws;
      hud?.setAmmo?.({ name: w2.name, mag: w2.mag, reserve: w2.reserve, magSize: w2.magSize, upgraded: w2.upgraded, grenades: w2.grenades });
      hud?.crosshair?.(w2.spread ?? 0.3, (w2.ads ?? 0) < 0.5 && player.sprint01 < 0.5 && !spectating);
      hud?.setHealth?.(player.health / player.maxHealth);

      game.localInteract(edges.interact && live, !!keys.KeyF && live, dt);
      game.update(dt);

      if (player.health / player.maxHealth < 0.35 && !player.downed && game.phase === 'playing') {
        hbT -= dt; if (hbT <= 0) { hbT = 0.9; sfx('heartbeat', { volume: 0.7 }); }
      }
      post?.setDamage?.(game.me?.spectating ? 0 : 1 - player.health / player.maxHealth);
      if (keys.Tab && G.state === 'playing') hud?.showScoreboard?.(game.scoreboard());
      if (coop()) {
        G.netT = (G.netT || 0) - dt;
        if (G.netT <= 0 && !game.isHost()) {
          G.netT = 1;
          const st = game.net.stats?.() || {};
          hud?.setNetStatus?.({ ping: Math.round(st.rtt || 0), loss: Math.round(st.loss || 0), warn: (st.rtt || 0) > 220 || (st.loss || 0) > 6 });
        }
      }
    }
  }

  if (flash > 0) { flash = Math.max(0, flash - dt * 0.7); post?.setFlash?.(flash); }
  // slow eye-adaptation toward the target exposure
  renderer.toneMappingExposure += (exposureTarget - renderer.toneMappingExposure) * (1 - Math.exp(-dt * 0.8));
  for (const k in edges) edges[k] = false;
  if (audioReady) { camera.updateMatrixWorld(); audio.setListener(camera.position, camera.quaternion); audio.update(dt); }
  fx.update?.(dt);
  hud?.update?.(dt);
}

// ---------------------------------------------------------------- debug handles for audits
window.__three = { renderer, scene, camera, get level() { return level; }, get weapons() { return weapons; },
  get zombies() { return zombies; }, get post() { return post; }, get avatars() { return avatars; }, get player() { return player; } };
window.__stats = () => ({ calls: renderer.info.render.calls, tris: renderer.info.render.triangles, state: G.state, phase: game?.phase,
  mode: game?.mode, round: game?.S.round, alive: zombies?.alive, points: game?.me?.points, players: game?.players.size,
  geo: renderer.info.memory.geometries, tex: renderer.info.memory.textures });
G.debug = {
  points: (n) => game.debugPoints(n),
  power: () => game.debugPower(),
  give: (id, up) => { weapons?.give(id); if (up) weapons?.upgrade(id); },
  round: (n) => game.debugRound(n),
  tp: (x, z, yaw) => { player.pos.set(x, 0, z); if (yaw != null) player.yaw = yaw; },
  look: (pitch) => { player.pitch = pitch; },
  aim: (yaw, pitch) => { player.yaw = yaw; player.pitch = pitch; },
  powerup: (type) => game.debugPowerup(type),
  spawn: (n = 1) => { for (let i = 0; i < n; i++) zombies?.spawn(level.windows[i % level.windows.length], { health: 300, speed: 'walk' }); },
  host: () => hostFlow(), join: (code) => joinFlow(code), start: () => game.startMatch(),
  keys, edges,
  hold: (code, on = true) => { keys[code] = on; },
  fire: (on = true) => { mouseDown = on; if (on) edges.firePressed = true; },
  ads: (on = true) => { adsDown = on; },
  hurt: (n) => hurtLocal(n),
  // audit bot: aims at the nearest visible zombie and fires in bursts; reloads when dry
  async bot(ms = 20000, { head = false, range = 30 } = {}) {
    const t0 = performance.now(); let shots = 0;
    while (performance.now() - t0 < ms && game.phase === 'playing') {
      await new Promise((r) => setTimeout(r, 70));
      const p = camera.position; let best = null, bd = range;
      for (const z of zombies.list) { const d = z.pos.distanceTo(p); if (d < bd && level.lineOfSight(p, z.pos.clone().setY(1.3))) { bd = d; best = z; } }
      const ws = weapons.getState();
      if (ws.mag === 0) { edges.reload = true; mouseDown = false; continue; }
      if (!best) { mouseDown = false; continue; }
      const dx = best.pos.x - p.x, dz = best.pos.z - p.z, dy = best.pos.y + (head ? 1.6 : 1.2) - p.y;
      player.yaw = Math.atan2(-dx, -dz); player.pitch = Math.atan2(dy, Math.hypot(dx, dz));
      mouseDown = true; edges.firePressed = true; shots++;
      await new Promise((r) => setTimeout(r, 40)); mouseDown = false;
    }
    mouseDown = false;
    const me = game.me;
    return { shots, kills: me.kills, heads: me.headshots, points: me.points, round: game.S.round, alive: zombies.alive, hp: player.health, phase: game.phase };
  },
};
Object.defineProperty(G, 'slotColors', { value: SLOT_COLORS });

boot().catch((e) => fatal('boot error', e));
