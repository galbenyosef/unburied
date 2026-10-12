// src__hud 05 — key
// Lines 1120-1190 of readable/src__hud.pretty.js (statement-aligned).
const CONTROLS = [
  ["Move", ["W", "A", "S", "D"]],
  ["Sprint", ["Shift"]],
  ["Jump", ["Space"]],
  ["Crouch", ["C", "/", "Ctrl"]],
  ["Fire", ["Mouse 1"]],
  ["Aim down sights", ["Mouse 2"]],
  ["Reload", ["R"]],
  ["Interact / Buy", ["F", " hold"]],
  ["Knife", ["V"]],
  ["Grenade", ["G"]],
  ["Swap weapon", ["1", "/", "2", "/", "Q", "/", "Wheel"]],
  ["Pause", ["Esc"]],
];

const SETTING_DEFS = [
  {
    key: "sensitivity",
    name: "Mouse sensitivity",
    min: 0.1,
    max: 3,
    step: 0.05,
    fmt: (v) => v.toFixed(2),
  },
  {
    key: "fov",
    name: "Field of view",
    min: 65,
    max: 100,
    step: 1,
    fmt: (v) => `${Math.round(v)}°`,
  },
  {
    key: "master",
    name: "Master volume",
    min: 0,
    max: 1,
    step: 0.05,
    fmt: (v) => `${Math.round(v * 100)}%`,
  },
  {
    key: "music",
    name: "Music volume",
    min: 0,
    max: 1,
    step: 0.05,
    fmt: (v) => `${Math.round(v * 100)}%`,
  },
  {
    key: "sfx",
    name: "Effects volume",
    min: 0,
    max: 1,
    step: 0.05,
    fmt: (v) => `${Math.round(v * 100)}%`,
  },
  { key: "quality", name: "Graphics quality", options: ["high", "medium"] },
];
const SETTING_DEFAULTS = {
  sensitivity: 1,
  fov: 80,
  master: 0.8,
  music: 0.6,
  sfx: 0.9,
  quality: "high",
};

const NADE_SVG =
  '<svg viewBox="0 0 20 28"><rect x="7" y="1" width="6" height="5" rx="1" fill="#b9ab8a"/><path d="M13 3 h3 v5" fill="none" stroke="#b9ab8a" stroke-width="1.6"/><circle cx="15.5" cy="1.8" r="1.6" fill="none" stroke="#b9ab8a" stroke-width="1.2"/><ellipse cx="10" cy="16.5" rx="8" ry="10" fill="#7f8a5a"/><path d="M2.5 13 h15 M2.5 18 h15 M2.5 23 h14 M6.5 7.5 v18 M10 6.5 v20 M13.5 7.5 v18" stroke="rgba(0,0,0,.35)" stroke-width="1.2"/><ellipse cx="7" cy="12" rx="2" ry="3.5" fill="rgba(255,255,230,.25)"/></svg>';

// ============================================================== HUD
