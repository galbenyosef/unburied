// src__main 01 — audio
// Lines 1-196 of readable/src__main.pretty.js (statement-aligned).
// UNBURIED — integrator: boot, renderer, input, menus/lobby, local player + weapon, frame loop.
// Game rules and the co-op session live in game.js.
import * as THREE from "three";
import { Player } from "./player.js";
import { createGame, SLOT_COLORS } from "./game.js";

const Q = new URLSearchParams(location.search);
const TRANSPORT = Q.get("net") === "local" ? "local" : "peerjs";
const $fatal = document.getElementById("fatal");
function fatal(msg, err) {
  console.error(msg, err);
  $fatal.style.display = "grid";
  $fatal.innerHTML = `<div><b>UNBURIED failed to start</b>${msg}<br><small>${(err && err.message) || ""}</small></div>`;
}

// ---------------------------------------------------------------- settings
const DEFAULT_SETTINGS = {
  sensitivity: 1.0,
  fov: 80,
  master: 0.9,
  music: 0.6,
  sfx: 0.9,
  quality: "high",
};
const settings = { ...DEFAULT_SETTINGS };
try {
  Object.assign(
    settings,
    JSON.parse(localStorage.getItem("unburied.settings") || "{}"),
  );
} catch {}
const saveSettings = () => {
  try {
    localStorage.setItem("unburied.settings", JSON.stringify(settings));
  } catch {}
};
let playerName = "Soldier";
try {
  playerName =
    localStorage.getItem("unburied.name") ||
    `Soldier ${100 + ((Math.random() * 900) | 0)}`;
} catch {}
const saveName = (n) => {
  playerName =
    String(n || "")
      .replace(/[\u0000-\u001f<>]/g, "")
      .trim()
      .slice(0, 16) || playerName;
  try {
    localStorage.setItem("unburied.name", playerName);
  } catch {}
};

// ---------------------------------------------------------------- renderer
const canvas = document.getElementById("game");
const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: false,
  powerPreference: "high-performance",
  stencil: false,
});
renderer.setPixelRatio(
  Math.min(devicePixelRatio, settings.quality === "high" ? 1.75 : 1),
);
renderer.setSize(innerWidth, innerHeight, false);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.6;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;

const scene = new THREE.Scene(); // fog + sky are owned by level.js
const camera = new THREE.PerspectiveCamera(
  settings.fov,
  innerWidth / innerHeight,
  0.05,
  400,
);
scene.add(camera);

async function load(path) {
  try {
    return await import(path);
  } catch (e) {
    console.error("module failed:", path, e);
    return null;
  }
}

const G = (window.__game = { state: "loading" });
let T,
  audio,
  level,
  fx,
  post,
  hud,
  weapons,
  zombies,
  player,
  avatars,
  game,
  NetMod;
let WEAPONS = {},
  buildWeaponModel;
const keys = {};
let lookDX = 0,
  lookDY = 0;
const edges = {
  firePressed: false,
  reload: false,
  knife: false,
  grenade: false,
  swap: false,
  interact: false,
};
let mouseDown = false,
  adsDown = false,
  paused = false,
  menuT = 0,
  flash = 0,
  hbT = 0,
  leaving = false;
const clock = new THREE.Timer();
// exposure is tuned per lighting state: the powered bunker is ~3× brighter, so the camera "stops down"
const EXPOSURE_DARK = 1.6,
  EXPOSURE_POWERED = 0.95;
let exposureTarget = EXPOSURE_DARK;
function lockPointer() {
  try {
    const p = canvas.requestPointerLock?.({ unadjustedMovement: true });
    p?.catch?.(() => {
      try {
        canvas.requestPointerLock?.()?.catch?.(() => {});
      } catch {}
    });
  } catch {}
}

// ---------------------------------------------------------------- audio
let audioReady = false;
async function unlockAudio() {
  if (audioReady || !audio) return;
  audioReady = true;
  try {
    await audio.init();
    audio.setVolume({
      master: settings.master,
      music: settings.music,
      sfx: settings.sfx,
    });
    if (G.state === "menu" || G.state === "lobby")
      audio.playMusic("menu", { loop: true });
    audio.play("ambient_wind", { loop: true, volume: 0.35 });
    audio.play("ambient_drone", { loop: true, volume: 0.25 });
  } catch (e) {
    console.error("audio init failed", e);
  }
}
addEventListener("pointerdown", unlockAudio);
addEventListener("keydown", unlockAudio);
const sfx = (n, o) => {
  if (audioReady)
    try {
      return audio.play(n, o);
    } catch {}
  return null;
};
const sting = (n, o) => {
  if (audioReady)
    try {
      audio.sting(n, o);
    } catch {}
};
function audioProxy() {
  return new Proxy(
    {},
    {
      get(_, k) {
        if (!audio) return () => ({ stop() {}, setPosition() {} });
        const v = audio[k];
        if (typeof v !== "function") return v;
        return (...a) => {
          if (!audioReady && k !== "init")
            return { stop() {}, setPosition() {} };
          try {
            return v.apply(audio, a) ?? { stop() {} };
          } catch {
            return { stop() {} };
          }
        };
      },
    },
  );
}

// ---------------------------------------------------------------- boot
