// src__net 01 — neterror
// Lines 1-371 of readable/src__net.pretty.js (statement-aligned).
/**
 * UNBURIED — co-op networking layer (transport, lobby/roster, clock sync, stats, interpolation).
 *
 * Host-authoritative star topology: every client holds exactly one link (to the host); the host holds
 * one link per client. Two transports sit behind the same internal `Link` interface:
 *
 *  - `peerjs` (production) — WebRTC data channels, signalled through the public PeerJS broker
 *    (0.peerjs.com). The PeerJS 1.5.5 UMD bundle is vendored and loaded lazily on first use.
 *    Per peer: PeerJS's reliable+ordered channel, plus a second, *negotiated* raw RTCDataChannel on the
 *    same RTCPeerConnection with `{ordered:false, maxRetransmits:0}` for true unreliable traffic
 *    (PeerJS's own `reliable:false` only disables ordering — it still retransmits). Until that channel is
 *    proven open in both directions, unreliable sends fall back to the reliable channel.
 *  - `local` — BroadcastChannel('unburied-net-' + code) for same-browser multi-tab testing
 *    (`?net=local`). Per-peer "channels" are simulated by addressing; tab close → pagehide 'bye';
 *    crashes/freezes → heartbeat timeout.
 *
 * Wire format: JSON text, envelope `[type, data]` (reliable) or `[type, data, seq]` (unreliable; seq
 * feeds the loss estimate). Types starting with `$` are reserved for this module.
 *
 * Testing aids: `?netsim=latencyMs,jitterMs,lossPct` delays every send by latency ± jitter (reliable
 * order preserved) and drops lossPct % of *unreliable* sends. `?netdebug=1` logs protocol events.
 *
 * @module net
 */

/** Protocol version. Host rejects a `hello` with a different version (NetError 'version'). */
export const NET_VERSION = 1;

/** Suggested interpolation delay (s): render remote entities at `net.serverTime() - INTERP_DELAY`. */
export const INTERP_DELAY = 0.1;

const PEER_PREFIX = "unburied-v1-";
const LOCAL_PREFIX = "unburied-net-";
const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const CODE_RE = /^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{5}$/;
const MAX_SLOTS = 4;
const MAX_MSG = 64 * 1024; // bytes (UTF-16 length of the JSON text — close enough)
const RATE_PER_SEC = 200; // sustained msgs/s a client may send the host
const RATE_BURST = 600; // token bucket: absorbs a ~3 s backlog after a network stall
const HEARTBEAT_MS = 12000; // generous: a client compiling shaders on a slow machine must not be dropped
const CONNECT_TIMEOUT_MS = 20000; // broker handshake + ICE; the public broker can be slow to answer
const HOST_LISTEN_MS = 28000; // several fresh-socket retries before we tell the player 'no signal'
const HELLO_TIMEOUT_MS = 10000;
const PING_MS = 1000;
const FAST_PINGS = 5,
  FAST_PING_MS = 200; // quick clock convergence right after connecting
const TICK_MS = 250;
const STALL_MS = 2000; // our own event loop stalled this long → grace, don't blame peers
const ROSTER_PINGS_MS = 2000;
const U_CHANNEL_ID = 64; // negotiated SCTP stream id for the unreliable channel
const NAME_MAX = 16;
const PENDING_MAX = 512,
  PENDING_AGE_MS = 10000;
const CODE_ATTEMPTS = 6;

const now = () => performance.now();
const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
const r2 = (x) => Math.round(x * 100) / 100;

let DEBUG = false;
try {
  DEBUG =
    new URLSearchParams(globalThis.location?.search || "").get("netdebug") ===
    "1";
} catch {}
const dlog = (...a) => {
  if (DEBUG)
    try {
      console.log("[net]", ...a);
    } catch {}
};
const warn = (...a) => {
  try {
    console.warn("[net]", ...a);
  } catch {}
};

// ---------------------------------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------------------------------

const ERR_TEXT = {
  "not-found":
    "No game found with that code. Check the code, and make sure the host is still running the game.",
  full: "That game is full.",
  version:
    "That game is running a different version of UNBURIED. Refresh the page and try again.",
  broker:
    "Could not reach the matchmaking server. Check your internet connection and try again.",
  timeout:
    "Connecting took too long. The host may be behind a strict firewall, or the connection is poor.",
  rejected: "The host is not accepting new players right now.",
  network:
    "Could not open a connection to the other player (a firewall or strict NAT may be blocking it).",
  cancelled: "Cancelled.",
};

/**
 * Networking error. `code` is one of
 * `'not-found'|'full'|'version'|'broker'|'timeout'|'rejected'|'network'` (plus `'cancelled'`, only when
 * the caller aborted via `opts.signal`); `message` is player-facing text.
 */
export class NetError extends Error {
  /** @param {string} code @param {string} [message] */
  constructor(code, message) {
    super(message || ERR_TEXT[code] || code);
    this.name = "NetError";
    /** @type {'not-found'|'full'|'version'|'broker'|'timeout'|'rejected'|'network'|'cancelled'} */
    this.code = code;
  }
}

/** Race a promise against an AbortSignal (rejects NetError('cancelled')). */
function abortable(promise, signal) {
  if (!signal) return promise;
  if (signal.aborted) return Promise.reject(new NetError("cancelled"));
  return new Promise((resolve, reject) => {
    const onAbort = () => reject(new NetError("cancelled"));
    signal.addEventListener("abort", onAbort, { once: true });
    promise.then(
      (v) => {
        signal.removeEventListener("abort", onAbort);
        resolve(v);
      },
      (e) => {
        signal.removeEventListener("abort", onAbort);
        reject(e);
      },
    );
  });
}

function toNetError(e) {
  if (e instanceof NetError)
    return e.code === "taken" ? new NetError("broker") : e;
  return new NetError(
    "network",
    e && e.message ? `${ERR_TEXT.network} (${e.message})` : undefined,
  );
}

// ---------------------------------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------------------------------

function randomCode() {
  const b = new Uint8Array(5);
  crypto.getRandomValues(b);
  let s = "";
  for (let i = 0; i < 5; i++) s += CODE_ALPHABET[b[i] % CODE_ALPHABET.length];
  return s;
}

function randomToken(n = 10) {
  const b = new Uint8Array(n);
  crypto.getRandomValues(b);
  return Array.from(b, (x) => (x % 36).toString(36)).join("");
}

/** Strip control / bidi / zero-width chars, collapse whitespace, clamp to 16 code points. */
export function sanitizeName(name) {
  let s = String(name ?? "");
  try {
    s = s.normalize("NFC");
  } catch {}
  s = s
    .replace(
      /[\u0000-\u001f\u007f-\u009f\u00ad\u061c\u115f\u1160\u180e\u200b-\u200f\u2028-\u202e\u2060-\u206f\u3164\ufe00-\ufe0f\ufeff\ufff0-\uffff]/g,
      "",
    )
    .replace(/\s+/g, " ")
    .trim();
  s = Array.from(s).slice(0, NAME_MAX).join("").trim();
  return s || "Player";
}

function normalizeNetsim(v) {
  if (v === false) return null;
  if (v == null) {
    try {
      v = new URLSearchParams(globalThis.location?.search || "").get("netsim");
    } catch {
      v = null;
    }
    if (!v) return null;
  }
  let lat = 0,
    jit = 0,
    loss = 0;
  if (typeof v === "string")
    [lat = 0, jit = 0, loss = 0] = v.split(",").map((x) => Number(x) || 0);
  else if (typeof v === "object")
    ({ latency: lat = 0, jitter: jit = 0, loss = 0 } = v);
  lat = Math.max(0, +lat || 0);
  jit = Math.max(0, +jit || 0);
  loss = clamp01((+loss || 0) / 100);
  if (!lat && !jit && !loss) return null;
  return { latency: lat, jitter: jit, loss };
}

function defaultTransport() {
  try {
    return new URLSearchParams(globalThis.location?.search || "").get("net") ===
      "local"
      ? "local"
      : "peerjs";
  } catch {
    return "peerjs";
  }
}

function makeTransport(kind) {
  kind = kind || defaultTransport();
  if (kind === "local") {
    if (typeof BroadcastChannel !== "function")
      throw new NetError(
        "network",
        "BroadcastChannel is not supported in this browser.",
      );
    return new LocalTransport();
  }
  if (kind === "peerjs") return new PeerJSTransport();
  throw new NetError("network", `Unknown transport "${kind}"`);
}

function sanitizeRoster(list) {
  if (!Array.isArray(list)) return null;
  const out = [];
  for (const e of list.slice(0, MAX_SLOTS)) {
    if (!e || typeof e !== "object" || typeof e.id !== "string") continue;
    out.push({
      id: e.id.slice(0, 32),
      name: sanitizeName(e.name),
      slot:
        Number.isInteger(e.slot) && e.slot >= 0 && e.slot < MAX_SLOTS
          ? e.slot
          : 0,
      isHost: !!e.isHost,
      ping: Number.isFinite(e.ping) ? Math.max(0, Math.round(e.ping)) : 0,
    });
  }
  return out.sort((a, b) => a.slot - b.slot);
}

// ---------------------------------------------------------------------------------------------------
// PeerJS loader + transport
// ---------------------------------------------------------------------------------------------------

let peerjsLoading = null;
function peerjsUrl() {
  try {
    return new URL("../vendor/peerjs/peerjs.min.js", import.meta.url).href;
  } catch {
    return "/vendor/peerjs/peerjs.min.js";
  }
}

/** Lazily inject the vendored PeerJS UMD bundle; resolves `window.peerjs.Peer`. */
function loadPeerJS() {
  const have = globalThis.peerjs && globalThis.peerjs.Peer;
  if (have) return Promise.resolve(have);
  if (!peerjsLoading) {
    peerjsLoading = new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = peerjsUrl();
      s.async = true;
      s.onload = () => {
        const P = globalThis.peerjs && globalThis.peerjs.Peer;
        if (P) resolve(P);
        else {
          peerjsLoading = null;
          reject(
            new NetError("network", "Networking library failed to initialise."),
          );
        }
      };
      s.onerror = () => {
        peerjsLoading = null;
        s.remove();
        reject(
          new NetError("network", "Could not load the networking library."),
        );
      };
      document.head.appendChild(s);
    });
  }
  return peerjsLoading;
}

function peerOptions() {
  const iceServers = [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
  ];
  const turn = globalThis.UNBURIED_TURN;
  if (Array.isArray(turn))
    for (const t of turn) if (t && t.urls) iceServers.push(t);
  const o = { debug: 0, config: { iceServers } };
  // Optional self-hosted broker: window.UNBURIED_BROKER = { host, port, path, secure, key }
  const b = globalThis.UNBURIED_BROKER;
  if (b && typeof b === "object")
    for (const k of ["host", "port", "path", "secure", "key", "pingInterval"])
      if (k in b) o[k] = b[k];
  return o;
}

function peerErrorToNet(e) {
  const t = e && e.type;
  switch (t) {
    case "peer-unavailable":
      return new NetError("not-found");
    case "unavailable-id":
      return new NetError("taken", "room id taken");
    case "browser-incompatible":
      return new NetError(
        "network",
        "This browser does not support WebRTC data channels.",
      );
    case "negotiation-failed":
    case "webrtc":
    case "connection-closed":
      return new NetError("network");
    default:
      return new NetError("broker", `${ERR_TEXT.broker}${t ? ` (${t})` : ""}`);
  }
}

/** Create a PeerJS Peer and wait for the broker's OPEN. Destroys the peer on failure. */
function openPeer(Peer, id, ms) {
  return new Promise((resolve, reject) => {
    let peer;
    try {
      peer = id ? new Peer(id, peerOptions()) : new Peer(peerOptions());
    } catch (e) {
      reject(new NetError("network", `${ERR_TEXT.network} (${e.message})`));
      return;
    }
    let done = false;
    const onOpen = () => fin(null);
    const onErr = (e) => {
      dlog("broker error", e && e.type, e && e.message);
      fin(peerErrorToNet(e));
    };
    const fin = (err) => {
      if (done) return;
      done = true;
      clearTimeout(to);
      try {
        peer.off("open", onOpen);
        peer.off("error", onErr);
      } catch {}
      if (err) {
        try {
          peer.destroy();
        } catch {}
        reject(err);
      } else resolve(peer);
    };
    const to = setTimeout(
      () =>
        fin(
          new NetError("broker", "Timed out reaching the matchmaking server."),
        ),
      ms,
    );
    peer.on("open", onOpen);
    peer.on("error", onErr);
  });
}

/** One WebRTC peer: PeerJS reliable DataConnection + negotiated unreliable RTCDataChannel. */
