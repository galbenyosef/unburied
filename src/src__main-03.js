// src__main 03 — hud
// Lines 539-881 of readable/src__main.pretty.js (statement-aligned).
function startSolo() {
  zombies?.clear?.();
  game.startSolo();
  if (Q.has("power")) game.debugPower();
  if (Q.get("points")) game.debugPoints(+Q.get("points"));
  if (Q.get("pos")) {
    const [x, z] = Q.get("pos").split(",").map(Number);
    player.pos.set(x, 0, z);
  }
  if (Q.get("yaw")) player.yaw = +Q.get("yaw");
}

const NET_ERRORS = {
  "not-found": [
    "ROOM NOT FOUND",
    "No squad is holding that position. Check the code and try again.",
  ],
  full: ["SQUAD FULL", "That squad already has four soldiers."],
  version: [
    "VERSION MISMATCH",
    "Your game is a different version from the host’s. Refresh the page and try again.",
  ],
  broker: [
    "NO SIGNAL",
    "Could not reach the matchmaking relay. Check your connection and try again.",
  ],
  timeout: [
    "CONNECTION TIMED OUT",
    "The host did not answer. They may be behind a strict firewall — try again, or have another player host.",
  ],
  rejected: [
    "JOIN REFUSED",
    "The host is not accepting new soldiers right now.",
  ],
  network: ["NETWORK ERROR", "The connection failed. Try again."],
};
function showNetError(
  e,
  onOk = () => {
    game.leave();
    enterMenu();
  },
) {
  const [title, text] = NET_ERRORS[e?.code] || [
    "CONNECTION FAILED",
    e?.message || "Something went wrong.",
  ];
  hud?.hideConnecting?.();
  hud?.showError?.(title, text, { onOk });
}

async function hostFlow() {
  if (!NetMod)
    return showNetError({
      code: "network",
      message: "Networking module failed to load.",
    });
  let cancelled = false;
  const ac = new AbortController();
  hud?.showConnecting?.("Opening a line to HQ…", {
    onCancel: () => {
      cancelled = true;
      ac.abort();
      game.leave();
      enterMenu();
    },
  });
  try {
    const lobby = await game.hostSession(playerName, TRANSPORT, ac.signal);
    if (cancelled) {
      game.leave();
      return;
    }
    hud?.hideConnecting?.();
    showLobby(lobby);
  } catch (e) {
    if (!cancelled) showNetError(e);
  }
}
async function joinFlow(code) {
  if (!NetMod)
    return showNetError({
      code: "network",
      message: "Networking module failed to load.",
    });
  let cancelled = false;
  const ac = new AbortController();
  hud?.showConnecting?.(`Raising squad ${code}…`, {
    onCancel: () => {
      cancelled = true;
      ac.abort();
      game.leave();
      enterMenu();
    },
  });
  try {
    const lobby = await game.joinSession(
      code,
      playerName,
      TRANSPORT,
      ac.signal,
    );
    if (cancelled) {
      game.leave();
      return;
    }
    hud?.hideConnecting?.();
    if (game.phase === "lobby") showLobby(lobby); // host might already be mid-game → 'full' starts us
  } catch (e) {
    if (!cancelled)
      showNetError(e, () => {
        game.leave();
        enterMenu();
        hud?.showCoop?.();
        hud?.setJoinCode?.(code);
      });
  }
}
function showLobby(lobby) {
  G.state = "lobby";
  hud?.hideMenu?.();
  hud?.showLobby?.(lobby, {
    onStart: () => game.startMatch(),
    onLeave: () => leaveToMenu(),
    onCopyInvite: async () => {
      const url = game.net?.inviteUrl || lobby.inviteUrl;
      try {
        await navigator.clipboard.writeText(url);
        return true;
      } catch {
        try {
          const ta = Object.assign(document.createElement("textarea"), {
            value: url,
          });
          document.body.appendChild(ta);
          ta.select();
          document.execCommand("copy");
          ta.remove();
          return true;
        } catch {
          return false;
        }
      }
    },
  });
}
function leaveToMenu() {
  leaving = true;
  game.leave();
  location.href = location.pathname; // clean slate (world, net, audio)
}

function onMatchStart({ late } = {}) {
  G.state = "playing";
  paused = false;
  hud?.hideMenu?.();
  hud?.hideLobby?.();
  hud?.hideConnecting?.();
  hud?.hideGameOver?.();
  hud?.hidePause?.();
  hud?.setVisible?.(true);
  if (audioReady) {
    audio.stopMusic(2);
    audio.setDucked(false);
    if (!late) sting("round_start");
  }
  lockPointer();
  if (!document.pointerLockElement && !Q.has("autoplay"))
    hud?.message?.("Click to take control", 4);
  if (late) hud?.message?.("You have joined the fight", 4);
}
function onDying() {
  post?.setMood?.({ downed: true });
  if (audioReady) audio.setDucked(true);
}
function onGameOver(d, me) {
  G.state = "gameover";
  document.exitPointerLock?.();
  hud?.setVisible?.(false);
  if (audioReady) {
    audio.setDucked(false);
    audio.playMusic("gameover");
  }
  const isHost = game.isHost();
  hud?.showGameOver?.(
    {
      round: d?.round ?? 0,
      kills: me.kills,
      headshots: me.headshots,
      points: me.points,
      timeSec: d?.timeSec ?? 0,
      downs: me.downs,
      revives: me.revives,
      team: d?.rows || [],
    },
    {
      onRestart: isHost
        ? () => {
            hud?.hideGameOver?.();
            game.restart();
          }
        : () => hud?.message?.("Waiting for the host to restart…", 3),
      onMenu: () => leaveToMenu(),
    },
  );
}
function onNetClosed(reason) {
  if (leaving) return;
  const map = {
    "host-left": [
      "HOST DISCONNECTED",
      "The host has left. The squad has been disbanded.",
    ],
    "host-timeout": ["CONNECTION LOST", "Lost contact with the host."],
    kicked: ["REMOVED FROM SQUAD", "The host removed you from the game."],
    network: ["CONNECTION LOST", "The network connection dropped."],
  };
  const [title, text] = map[reason] || ["DISCONNECTED", "The session ended."];
  document.exitPointerLock?.();
  hud?.showError?.(title, text, {
    onOk: () => {
      leaving = true;
      location.href = location.pathname;
    },
  });
}

function openSettings(onClose) {
  hud?.showSettings?.(
    { ...settings },
    (k, v) => {
      settings[k] = v;
      saveSettings();
      if (k === "fov") weapons?.setFov?.(v);
      if (["master", "music", "sfx"].includes(k))
        audio?.setVolume?.({
          master: settings.master,
          music: settings.music,
          sfx: settings.sfx,
        });
      if (k === "quality") {
        post?.setQuality?.(v);
        renderer.setPixelRatio(
          Math.min(devicePixelRatio, v === "high" ? 1.75 : 1),
        );
        onResize();
      }
    },
    onClose,
  );
}

const inMatch = () =>
  G.state === "playing" || G.state === "paused" || game?.phase === "dying";
const coop = () => !!game?.net;
function pause() {
  if (G.state !== "playing" || paused) return;
  paused = true;
  mouseDown = adsDown = false;
  for (const k in keys) keys[k] = false;
  if (!coop() && audioReady) audio.setDucked(true);
  hud?.showPause?.({
    onResume: resume,
    onSettings: () =>
      openSettings(() => {
        hud?.hidePause?.();
        paused = false;
        pause();
      }),
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
addEventListener("keydown", (e) => {
  if (chatting()) return; // HUD's chat input owns the keyboard
  if (e.code === "Tab") {
    e.preventDefault();
    if (G.state === "playing") hud?.showScoreboard?.(game.scoreboard());
    keys.Tab = true;
    return;
  }
  if (e.code === "Escape" || e.code === "KeyP") {
    if (G.state === "playing" && !document.pointerLockElement) pause();
    return;
  }
  if (
    (e.code === "KeyT" || e.code === "Enter") &&
    G.state === "playing" &&
    coop() &&
    !paused
  ) {
    e.preventDefault();
    for (const k in keys) keys[k] = false;
    mouseDown = adsDown = false;
    hud?.openChat?.();
    return;
  }
  if (keys[e.code]) return;
  keys[e.code] = true;
  if (G.state !== "playing" || paused) return;
  if (e.code === "KeyR") edges.reload = true;
  if (e.code === "KeyV") edges.knife = true;
  if (e.code === "KeyG") edges.grenade = true;
  if (e.code === "KeyQ" || e.code === "Digit1" || e.code === "Digit2")
    edges.swap = true;
  if (e.code === "KeyF") edges.interact = true;
  if (e.code === "Space") e.preventDefault();
});
addEventListener("keyup", (e) => {
  keys[e.code] = false;
  if (e.code === "Tab") hud?.showScoreboard?.(null);
});
addEventListener("blur", () => {
  for (const k in keys) keys[k] = false;
  mouseDown = adsDown = false;
  hud?.showScoreboard?.(null);
});
canvas.addEventListener("mousedown", (e) => {
  if (G.state !== "playing" || paused) return;
  if (!document.pointerLockElement) {
    lockPointer();
    return;
  }
  if (e.button === 0) {
    mouseDown = true;
    edges.firePressed = true;
  }
  if (e.button === 2) adsDown = true;
});
addEventListener("mouseup", (e) => {
  if (e.button === 0) mouseDown = false;
  if (e.button === 2) adsDown = false;
});
addEventListener("contextmenu", (e) => e.preventDefault());
