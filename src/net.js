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

const PEER_PREFIX = 'unburied-v1-';
const LOCAL_PREFIX = 'unburied-net-';
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const CODE_RE = /^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{5}$/;
const MAX_SLOTS = 4;
const MAX_MSG = 64 * 1024;            // bytes (UTF-16 length of the JSON text — close enough)
const RATE_PER_SEC = 200;             // sustained msgs/s a client may send the host
const RATE_BURST = 600;               // token bucket: absorbs a ~3 s backlog after a network stall
const HEARTBEAT_MS = 12000;     // generous: a client compiling shaders on a slow machine must not be dropped
const CONNECT_TIMEOUT_MS = 20000;   // broker handshake + ICE; the public broker can be slow to answer
const HOST_LISTEN_MS = 28000;       // several fresh-socket retries before we tell the player 'no signal'
const HELLO_TIMEOUT_MS = 10000;
const PING_MS = 1000;
const FAST_PINGS = 5, FAST_PING_MS = 200;   // quick clock convergence right after connecting
const TICK_MS = 250;
const STALL_MS = 2000;                // our own event loop stalled this long → grace, don't blame peers
const ROSTER_PINGS_MS = 2000;
const U_CHANNEL_ID = 64;              // negotiated SCTP stream id for the unreliable channel
const NAME_MAX = 16;
const PENDING_MAX = 512, PENDING_AGE_MS = 10000;
const CODE_ATTEMPTS = 6;

const now = () => performance.now();
const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
const r2 = (x) => Math.round(x * 100) / 100;

let DEBUG = false;
try { DEBUG = new URLSearchParams(globalThis.location?.search || '').get('netdebug') === '1'; } catch {}
const dlog = (...a) => { if (DEBUG) try { console.log('[net]', ...a); } catch {} };
const warn = (...a) => { try { console.warn('[net]', ...a); } catch {} };

// ---------------------------------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------------------------------

const ERR_TEXT = {
  'not-found': 'No game found with that code. Check the code, and make sure the host is still running the game.',
  full: 'That game is full.',
  version: 'That game is running a different version of UNBURIED. Refresh the page and try again.',
  broker: 'Could not reach the matchmaking server. Check your internet connection and try again.',
  timeout: 'Connecting took too long. The host may be behind a strict firewall, or the connection is poor.',
  rejected: 'The host is not accepting new players right now.',
  network: 'Could not open a connection to the other player (a firewall or strict NAT may be blocking it).',
  cancelled: 'Cancelled.',
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
    this.name = 'NetError';
    /** @type {'not-found'|'full'|'version'|'broker'|'timeout'|'rejected'|'network'|'cancelled'} */
    this.code = code;
  }
}

/** Race a promise against an AbortSignal (rejects NetError('cancelled')). */
function abortable(promise, signal) {
  if (!signal) return promise;
  if (signal.aborted) return Promise.reject(new NetError('cancelled'));
  return new Promise((resolve, reject) => {
    const onAbort = () => reject(new NetError('cancelled'));
    signal.addEventListener('abort', onAbort, { once: true });
    promise.then(
      (v) => { signal.removeEventListener('abort', onAbort); resolve(v); },
      (e) => { signal.removeEventListener('abort', onAbort); reject(e); },
    );
  });
}

function toNetError(e) {
  if (e instanceof NetError) return e.code === 'taken' ? new NetError('broker') : e;
  return new NetError('network', (e && e.message) ? `${ERR_TEXT.network} (${e.message})` : undefined);
}

// ---------------------------------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------------------------------

function randomCode() {
  const b = new Uint8Array(5);
  crypto.getRandomValues(b);
  let s = '';
  for (let i = 0; i < 5; i++) s += CODE_ALPHABET[b[i] % CODE_ALPHABET.length];
  return s;
}

function randomToken(n = 10) {
  const b = new Uint8Array(n);
  crypto.getRandomValues(b);
  return Array.from(b, (x) => (x % 36).toString(36)).join('');
}

/** Strip control / bidi / zero-width chars, collapse whitespace, clamp to 16 code points. */
export function sanitizeName(name) {
  let s = String(name ?? '');
  try { s = s.normalize('NFC'); } catch {}
  s = s.replace(/[\u0000-\u001f\u007f-\u009f\u00ad\u061c\u115f\u1160\u180e\u200b-\u200f\u2028-\u202e\u2060-\u206f\u3164\ufe00-\ufe0f\ufeff\ufff0-\uffff]/g, '')
    .replace(/\s+/g, ' ').trim();
  s = Array.from(s).slice(0, NAME_MAX).join('').trim();
  return s || 'Player';
}

function normalizeNetsim(v) {
  if (v === false) return null;
  if (v == null) {
    try { v = new URLSearchParams(globalThis.location?.search || '').get('netsim'); } catch { v = null; }
    if (!v) return null;
  }
  let lat = 0, jit = 0, loss = 0;
  if (typeof v === 'string') [lat = 0, jit = 0, loss = 0] = v.split(',').map((x) => Number(x) || 0);
  else if (typeof v === 'object') ({ latency: lat = 0, jitter: jit = 0, loss = 0 } = v);
  lat = Math.max(0, +lat || 0); jit = Math.max(0, +jit || 0); loss = clamp01((+loss || 0) / 100);
  if (!lat && !jit && !loss) return null;
  return { latency: lat, jitter: jit, loss };
}

function defaultTransport() {
  try { return new URLSearchParams(globalThis.location?.search || '').get('net') === 'local' ? 'local' : 'peerjs'; }
  catch { return 'peerjs'; }
}

function makeTransport(kind) {
  kind = kind || defaultTransport();
  if (kind === 'local') {
    if (typeof BroadcastChannel !== 'function') throw new NetError('network', 'BroadcastChannel is not supported in this browser.');
    return new LocalTransport();
  }
  if (kind === 'peerjs') return new PeerJSTransport();
  throw new NetError('network', `Unknown transport "${kind}"`);
}

function sanitizeRoster(list) {
  if (!Array.isArray(list)) return null;
  const out = [];
  for (const e of list.slice(0, MAX_SLOTS)) {
    if (!e || typeof e !== 'object' || typeof e.id !== 'string') continue;
    out.push({
      id: e.id.slice(0, 32),
      name: sanitizeName(e.name),
      slot: Number.isInteger(e.slot) && e.slot >= 0 && e.slot < MAX_SLOTS ? e.slot : 0,
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
  try { return new URL('../vendor/peerjs/peerjs.min.js', import.meta.url).href; }
  catch { return '/vendor/peerjs/peerjs.min.js'; }
}

/** Lazily inject the vendored PeerJS UMD bundle; resolves `window.peerjs.Peer`. */
function loadPeerJS() {
  const have = globalThis.peerjs && globalThis.peerjs.Peer;
  if (have) return Promise.resolve(have);
  if (!peerjsLoading) {
    peerjsLoading = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = peerjsUrl();
      s.async = true;
      s.onload = () => {
        const P = globalThis.peerjs && globalThis.peerjs.Peer;
        if (P) resolve(P);
        else { peerjsLoading = null; reject(new NetError('network', 'Networking library failed to initialise.')); }
      };
      s.onerror = () => { peerjsLoading = null; s.remove(); reject(new NetError('network', 'Could not load the networking library.')); };
      document.head.appendChild(s);
    });
  }
  return peerjsLoading;
}

function peerOptions() {
  const iceServers = [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
  ];
  const turn = globalThis.UNBURIED_TURN;
  if (Array.isArray(turn)) for (const t of turn) if (t && t.urls) iceServers.push(t);
  const o = { debug: 0, config: { iceServers } };
  // Optional self-hosted broker: window.UNBURIED_BROKER = { host, port, path, secure, key }
  const b = globalThis.UNBURIED_BROKER;
  if (b && typeof b === 'object') for (const k of ['host', 'port', 'path', 'secure', 'key', 'pingInterval']) if (k in b) o[k] = b[k];
  return o;
}

function peerErrorToNet(e) {
  const t = e && e.type;
  switch (t) {
    case 'peer-unavailable': return new NetError('not-found');
    case 'unavailable-id': return new NetError('taken', 'room id taken');
    case 'browser-incompatible': return new NetError('network', 'This browser does not support WebRTC data channels.');
    case 'negotiation-failed': case 'webrtc': case 'connection-closed': return new NetError('network');
    default: return new NetError('broker', `${ERR_TEXT.broker}${t ? ` (${t})` : ''}`);
  }
}

/** Create a PeerJS Peer and wait for the broker's OPEN. Destroys the peer on failure. */
function openPeer(Peer, id, ms) {
  return new Promise((resolve, reject) => {
    let peer;
    try { peer = id ? new Peer(id, peerOptions()) : new Peer(peerOptions()); }
    catch (e) { reject(new NetError('network', `${ERR_TEXT.network} (${e.message})`)); return; }
    let done = false;
    const onOpen = () => fin(null);
    const onErr = (e) => { dlog('broker error', e && e.type, e && e.message); fin(peerErrorToNet(e)); };
    const fin = (err) => {
      if (done) return;
      done = true;
      clearTimeout(to);
      try { peer.off('open', onOpen); peer.off('error', onErr); } catch {}
      if (err) { try { peer.destroy(); } catch {} reject(err); }
      else resolve(peer);
    };
    const to = setTimeout(() => fin(new NetError('broker', 'Timed out reaching the matchmaking server.')), ms);
    peer.on('open', onOpen);
    peer.on('error', onErr);
  });
}

/** One WebRTC peer: PeerJS reliable DataConnection + negotiated unreliable RTCDataChannel. */
class PeerLink {
  constructor(conn) {
    this.conn = conn;
    this.key = conn.peer;
    this.dc = null;
    this.uReady = false;           // true once a message arrived on the unreliable channel
    this.closed = false;
    this.failed = false;
    this.onmessage = null;         // (str, reliable) => void
    this.onclose = null;           // (why: 'closed'|'failed'|'timeout') => void
    this._notified = false;
    this._openedAt = 0;
    this._lastProbe = 0;
    conn.on('data', (d) => { if (!this.closed && this.onmessage) this.onmessage(d, true); });
    conn.on('close', () => this._closedEvt());
    conn.on('error', (e) => { dlog('conn error', e && e.type, e && e.message); if (e && (e.type === 'negotiation-failed' || e.type === 'webrtc')) this.failed = true; });
    conn.on('iceStateChanged', (s) => { if (s === 'failed') this.failed = true; });
  }
  /** 'native' when the true unreliable channel is carrying traffic, else 'fallback' (reliable channel). */
  get mode() { return this.uReady && this.dc && this.dc.readyState === 'open' ? 'native' : 'fallback'; }

  _opened() {
    this._openedAt = now();
    try {
      const pc = this.conn.peerConnection;
      if (!pc || typeof pc.createDataChannel !== 'function') return;
      const dc = pc.createDataChannel('unburied-u', { negotiated: true, id: U_CHANNEL_ID, ordered: false, maxRetransmits: 0 });
      dc.onmessage = (ev) => {
        this.uReady = true;
        if (!this.closed && this.onmessage) this.onmessage(ev.data, false);
      };
      dc.onclose = () => { this.uReady = false; };
      dc.onerror = () => {};
      this.dc = dc;
    } catch (e) {
      dlog('unreliable channel unavailable, using reliable fallback', e && e.message);
      this.dc = null;
    }
  }

  /** Probe the unreliable channel until the remote has proven it exists on their side too. */
  probe(t) {
    const dc = this.dc;
    if (this.uReady || !dc || dc.readyState !== 'open' || this.closed) return;
    if (t - this._openedAt > 20000 || t - this._lastProbe < 250) return;
    this._lastProbe = t;
    try { dc.send('["$u",0]'); } catch {}
  }

  send(str, reliable) {
    if (this.closed) return false;
    try {
      if (!reliable && this.uReady) {
        const dc = this.dc;
        if (dc && dc.readyState === 'open') {
          if (dc.bufferedAmount > 256 * 1024) return false;   // congested: drop, it's unreliable anyway
          dc.send(str);
          return true;
        }
      }
      if (!this.conn.open) return false;
      this.conn.send(str);
      return true;
    } catch (e) {
      dlog('send failed', e && e.message);
      return false;
    }
  }

  close() {
    if (this.closed) return;
    this.closed = true;
    try { if (this.dc) this.dc.close(); } catch {}
    try { this.conn.close(); } catch {}
    this._closedEvt();
  }

  _closedEvt() {
    this.closed = true;
    if (this._notified) return;
    this._notified = true;
    try { if (this.onclose) this.onclose(this.failed ? 'failed' : 'closed'); } catch (e) { warn(e); }
  }
}

class PeerJSTransport {
  constructor() {
    this.kind = 'peerjs';
    this.peer = null;
    this.onlink = null;
    this.links = new Set();
    this.destroyed = false;
    this._reconnectTimer = 0;
    this._reconnectDelay = 2000;
    this.brokerOnline = false;
  }

  /**
   * Host: register `unburied-v1-<code>` with the broker. Rejects NetError('taken') on an id collision.
   * A stalled broker handshake is retried with a fresh socket (≤ 5 s per attempt) inside the deadline.
   */
  async listen(code, deadline = now() + CONNECT_TIMEOUT_MS) {
    const Peer = await loadPeerJS();
    let peer = null, lastErr = null;
    while (!peer) {
      if (this.destroyed) throw new NetError('network', 'closed');
      const budget = deadline - now();
      if (budget < 1000) break;
      try { peer = await openPeer(Peer, PEER_PREFIX + code, Math.min(7000, budget)); }
      catch (e) { lastErr = e; if (!(e instanceof NetError) || e.code !== 'broker') throw e; dlog('broker attempt failed:', e.message); }
    }
    if (!peer) throw lastErr || new NetError('broker');
    if (this.destroyed) { try { peer.destroy(); } catch {} throw new NetError('network', 'closed'); }
    this.peer = peer;
    this.brokerOnline = true;
    peer.on('open', () => { this.brokerOnline = true; this._reconnectDelay = 2000; });
    // After the room is open, broker trouble must not kill the room: existing links are P2P.
    peer.on('error', (e) => dlog('host peer error', e && e.type, e && e.message));
    peer.on('disconnected', () => {
      this.brokerOnline = false;
      if (this.destroyed) return;
      dlog('broker connection lost; will retry (existing players unaffected)');
      this._scheduleReconnect();
    });
    peer.on('connection', (conn) => this._incoming(conn));
  }

  _scheduleReconnect() {
    if (this.destroyed || this._reconnectTimer) return;
    this._reconnectTimer = setTimeout(() => {
      this._reconnectTimer = 0;
      const p = this.peer;
      if (!p || this.destroyed || p.destroyed) return;
      if (p.disconnected) {
        try { p.reconnect(); } catch {}
        this._reconnectDelay = Math.min(30000, this._reconnectDelay * 2);
        this._scheduleReconnect();
      }
    }, this._reconnectDelay);
  }

  _incoming(conn) {
    if (this.destroyed) { try { conn.close(); } catch {} return; }
    const link = new PeerLink(conn);
    this.links.add(link);
    // a joiner whose ICE never completes must not linger forever
    const openTimer = setTimeout(() => { if (!conn.open) link.close(); }, CONNECT_TIMEOUT_MS + 8000);
    conn.on('close', () => { clearTimeout(openTimer); this.links.delete(link); });
    conn.on('open', () => {
      clearTimeout(openTimer);
      if (this.destroyed) { link.close(); return; }
      link._opened();
      try { if (this.onlink) this.onlink(link); } catch (e) { warn(e); }
    });
  }

  /** Client: connect to the host's room. Resolves an open PeerLink. */
  async connect(code, deadline) {
    const Peer = await loadPeerJS();
    const left = () => Math.max(0, deadline - now());
    // 1) broker (random id), retrying a stalled handshake while leaving ≥ 3 s for WebRTC
    let peer = null, lastErr = null;
    while (!peer) {
      if (this.destroyed) throw new NetError('network', 'closed');
      const budget = left() - 3000;
      if (budget < 1000) break;
      try { peer = await openPeer(Peer, null, Math.min(5000, budget)); }
      catch (e) { lastErr = e; if (!(e instanceof NetError) || e.code !== 'broker') throw e; dlog('broker attempt failed:', e.message); }
    }
    if (!peer) throw lastErr || new NetError('broker');
    if (this.destroyed) { try { peer.destroy(); } catch {} throw new NetError('network', 'closed'); }
    this.peer = peer;
    this.brokerOnline = true;
    let settle = null;               // current stage's reject
    peer.on('error', (e) => {
      dlog('client peer error', e && e.type, e && e.message);
      if (settle) settle(peerErrorToNet(e));
    });
    // 2) WebRTC to the host
    return new Promise((resolve, reject) => {
      let done = false;
      const fin = (err, link) => {
        if (done) return;
        done = true;
        settle = null;
        clearTimeout(to);
        if (err) reject(err); else resolve(link);
      };
      const to = setTimeout(() => fin(new NetError('timeout')), left());
      settle = (err) => fin(err);
      let conn;
      try {
        conn = peer.connect(PEER_PREFIX + code, { reliable: true, serialization: 'raw', metadata: { v: NET_VERSION } });
      } catch (e) { fin(new NetError('network', `${ERR_TEXT.network} (${e.message})`)); return; }
      if (!conn) { fin(new NetError('broker')); return; }
      const link = new PeerLink(conn);
      this.links.add(link);
      conn.on('open', () => {
        link._opened();
        fin(null, link);
      });
      conn.on('close', () => { this.links.delete(link); fin(new NetError('network')); });
      conn.on('error', (e) => { if (e && (e.type === 'negotiation-failed' || e.type === 'webrtc')) fin(new NetError('network')); });
    });
  }

  /** Called on pagehide: leave sockets for the browser to tear down (so the 'bye' isn't aborted). */
  hideTeardown() {}

  destroy() {
    if (this.destroyed) return;
    this.destroyed = true;
    clearTimeout(this._reconnectTimer);
    for (const l of [...this.links]) { try { l.close(); } catch {} }
    this.links.clear();
    try { if (this.peer) this.peer.destroy(); } catch {}
    this.peer = null;
  }
}

// ---------------------------------------------------------------------------------------------------
// Local (BroadcastChannel) transport — same-browser multi-tab testing
// ---------------------------------------------------------------------------------------------------

class LocalLink {
  constructor(tp, remote) {
    this.tp = tp;
    this.key = remote;
    this.closed = false;
    this.onmessage = null;
    this.onclose = null;
    this._notified = false;
  }
  get mode() { return 'native'; }
  send(str, reliable) {
    if (this.closed || !this.tp.bc) return false;
    try { this.tp.bc.postMessage({ k: reliable ? 'r' : 'u', s: this.tp.me, d: this.key, p: str }); return true; }
    catch { return false; }
  }
  /** @param {'timeout'} [why] carried on the 'fin' frame so the far side can tell a timeout from a leave */
  close(why) {
    if (this.closed) return;
    this.closed = true;
    try { if (this.tp.bc) this.tp.bc.postMessage({ k: 'fin', s: this.tp.me, d: this.key, w: why === 'timeout' ? 'timeout' : undefined }); } catch {}
    this._gone('closed');
  }
  _recv(p, rel) { if (!this.closed && this.onmessage) this.onmessage(p, rel); }
  _gone(why) {
    this.closed = true;
    this.tp.links.delete(this.key);
    this.tp.dead.add(this.key);
    if (this._notified) return;
    this._notified = true;
    try { if (this.onclose) this.onclose(why === 'timeout' ? 'timeout' : 'closed'); } catch (e) { warn(e); }
  }
}

class LocalTransport {
  constructor() {
    this.kind = 'local';
    this.me = 'L' + randomToken(10);
    this.bc = null;
    this.links = new Map();
    this.dead = new Set();
    this.onlink = null;
    this.isHost = false;
    this.destroyed = false;
    this.brokerOnline = true;
    this._probe = null;
    this._accept = null;
  }
  _open(code) {
    if (this.bc) { try { this.bc.close(); } catch {} }
    this.bc = new BroadcastChannel(LOCAL_PREFIX + code);
    this.bc.onmessage = (e) => { try { this._onmsg(e.data); } catch (err) { warn(err); } };
  }
  async listen(code) {
    this._open(code);
    const taken = await new Promise((res) => {
      this._probe = res;
      this.bc.postMessage({ k: 'probe', s: this.me });
      setTimeout(() => res(false), 300);
    });
    this._probe = null;
    if (taken) { try { this.bc.close(); } catch {} this.bc = null; throw new NetError('taken', 'room id taken'); }
    if (this.destroyed) throw new NetError('network', 'closed');
    this.isHost = true;
  }
  connect(code, deadline) {
    this._open(code);
    return new Promise((resolve, reject) => {
      let done = false;
      const fin = (err, link) => {
        if (done) return;
        done = true;
        clearInterval(iv); clearTimeout(to);
        this._accept = null;
        if (err) reject(err); else resolve(link);
      };
      const knock = () => { try { this.bc && this.bc.postMessage({ k: 'conn', s: this.me }); } catch {} };
      const iv = setInterval(knock, 250);
      // No broker round-trip here: a live host answers within a frame, so 2 s of silence = no such room.
      const to = setTimeout(() => fin(new NetError('not-found')), Math.max(0, Math.min(2000, deadline - now())));
      this._accept = (hostId) => {
        const l = new LocalLink(this, hostId);
        this.links.set(hostId, l);
        fin(null, l);
      };
      knock();
    });
  }
  _onmsg(m) {
    if (!m || typeof m !== 'object' || this.destroyed) return;
    switch (m.k) {
      case 'probe': if (this.isHost) this.bc.postMessage({ k: 'here', s: this.me, d: m.s }); break;
      case 'here': if (m.d === this.me && this._probe) this._probe(true); break;
      case 'conn':
        if (!this.isHost || typeof m.s !== 'string' || this.dead.has(m.s)) break;
        if (!this.links.has(m.s)) {
          const l = new LocalLink(this, m.s);
          this.links.set(m.s, l);
          this.bc.postMessage({ k: 'acc', s: this.me, d: m.s });
          try { if (this.onlink) this.onlink(l); } catch (e) { warn(e); }
        } else this.bc.postMessage({ k: 'acc', s: this.me, d: m.s });
        break;
      case 'acc': if (m.d === this.me && this._accept) this._accept(m.s); break;
      case 'r': case 'u':
        if (m.d === this.me) { const l = this.links.get(m.s); if (l) l._recv(m.p, m.k === 'r'); }
        break;
      case 'fin':
        if (m.d === this.me) { const l = this.links.get(m.s); if (l) l._gone(m.w); }
        break;
    }
  }
  hideTeardown() { this.destroy(); }
  destroy() {
    if (this.destroyed) return;
    for (const l of [...this.links.values()]) { try { l.close(); } catch {} }
    this.destroyed = true;
    this.links.clear();
    try { if (this.bc) this.bc.close(); } catch {}
    this.bc = null;
  }
}

// ---------------------------------------------------------------------------------------------------
// Per-remote bookkeeping
// ---------------------------------------------------------------------------------------------------

class Remote {
  constructor(link) {
    const t = now();
    this.link = link;
    this.id = null;                 // roster id ('h' for the host, 'c1', 'c2', … for clients)
    this.entry = null;              // roster entry (host side)
    this.admitted = false;
    this.active = true;
    this.createdAt = t;
    this.lastRecv = t;
    this.nextPing = t;
    this.pingsSent = 0;
    this.rtt = 0; this.jitter = 0; this.lastRtt = 0; this.rttN = 0;
    this.uSeqOut = 0; this.uMax = 0; this.uCount = 0;
    this.lossT = t; this.lossPrevMax = 0; this.lossPrevCount = 0; this.lossHist = [];
    this.loss = 0; this.lossOut = 0;
    this.bytesOut = 0; this.bytesIn = 0; this.msgsOut = 0; this.msgsIn = 0;
    this.rateHist = [[t, 0, 0]];
    this.tokens = RATE_BURST; this.tokenT = t;
    this.nsRel = []; this.nsUnrel = []; this.nsLastRel = 0; this.nsTimer = 0; this.nsDue = Infinity;
    this.warnedBig = false;
  }
}

// ---------------------------------------------------------------------------------------------------
// Net
// ---------------------------------------------------------------------------------------------------

/**
 * @typedef {{ id: string, name: string, slot: number, isHost: boolean, ping: number }} RosterEntry
 * `ping` is the host-measured round-trip time in ms (0 for the host itself), refreshed every 2 s.
 */

/**
 * @typedef {{ rtt: number, jitter: number, loss: number, lossOut: number, kbpsUp: number, kbpsDown: number,
 *   unreliable: 'native'|'fallback', offset?: number, peers?: number }} NetStats
 * rtt/jitter in ms (smoothed); loss = inbound unreliable loss 0..1 (from sequence numbers, ~5 s window);
 * lossOut = the peer's report of *our* outbound loss; kbps = kilobits/s over the last ~2 s.
 */

/**
 * A co-op session (room). Create with {@link Net.host} or {@link Net.join} — never `new Net()`.
 *
 * Host-authoritative star: clients talk only to the host; the host sends to one client or to all.
 * The host's roster id is always `'h'`; clients get `'c1'`, `'c2'`, … (never reused within a room).
 */
export class Net {
  /** @private */
  constructor(role, tp, opts = {}) {
    /** @type {'host'|'client'} */
    this.role = role;
    /** @type {'peerjs'|'local'} */
    this.transport = tp.kind;
    /** Room code, 5 chars from ABCDEFGHJKMNPQRSTUVWXYZ23456789. */
    this.code = '';
    /** Our roster id ('h' on the host). */
    this.selfId = role === 'host' ? 'h' : '';
    /**
     * Live roster (sorted by slot). The array is updated in place; entries' `ping` fields refresh every
     * 2 s without an onRoster event (use {@link Net#onPings} for that).
     * @type {RosterEntry[]}
     */
    this.roster = [];
    /** Max players incl. host (host only). */
    this.maxPlayers = MAX_SLOTS;

    this._tp = tp;
    this._remotes = new Set();
    this._byId = new Map();
    this._hostRemote = null;
    this._handlers = new Map();
    this._ev = { roster: new Set(), join: new Set(), leave: new Set(), close: new Set(), pings: new Set() };
    this._pending = [];
    this._closed = false;
    this._joined = role === 'host';
    this._locked = false;
    this._netsim = normalizeNetsim(opts.netsim);
    this._t0 = now();
    this._offset = 0; this._clk = []; this._synced = false; this._lastST = -Infinity;
    this._nextId = 1;
    this._tickT = now();
    this._pingsT = now();
    this._warned = new Set();
    this._join = null;              // client handshake {resolve, reject, sentAt}
    this._delays = new Map();       // interpDelay smoothing state
    this._iv = setInterval(() => this._tick(), TICK_MS);
    this._onPageHide = () => this._pageHide();
    try { globalThis.addEventListener?.('pagehide', this._onPageHide); } catch {}
    if (this._netsim) warn(`netsim active: ${this._netsim.latency}ms ±${this._netsim.jitter}ms, ${Math.round(this._netsim.loss * 100)}% unreliable loss`);
  }

  // ---- construction ------------------------------------------------------------------------------

  /**
   * Create a room and become its host (slot 0).
   * @param {{ name?: string, transport?: 'peerjs'|'local', maxPlayers?: number,
   *           netsim?: false|string|{latency:number,jitter:number,loss:number}, signal?: AbortSignal }} [opts]
   *   `transport` defaults to 'local' when the page URL has `?net=local`, else 'peerjs'.
   *   `netsim` overrides the `?netsim=` URL param (loss in percent); `false` disables it.
   *   `signal` aborts room creation (rejects NetError 'cancelled') — wire it to a Cancel button.
   * @returns {Promise<Net>}
   * @throws {NetError} 'broker' (matchmaking server unreachable) | 'network' (WebRTC unsupported)
   */
  static async host({ name = 'Player', transport, maxPlayers = MAX_SLOTS, netsim, signal, code: preferred } = {}) {
    if (signal && signal.aborted) throw new NetError('cancelled');
    const tp = makeTransport(transport);
    const net = new Net('host', tp, { netsim });
    net.maxPlayers = Math.max(1, Math.min(MAX_SLOTS, Math.floor(maxPlayers) || MAX_SLOTS));
    tp.onlink = (link) => net._onLink(link);
    try {
      let lastErr = null;
      const deadline = now() + HOST_LISTEN_MS;
      for (let i = 0; i < CODE_ATTEMPTS; i++) {
        const code = i === 0 && preferred && CODE_RE.test(preferred) ? preferred : randomCode();
        try {
          await abortable(tp.listen(code, deadline), signal);
          net.code = code;
          lastErr = null;
          break;
        } catch (e) {
          lastErr = e;
          if (!(e instanceof NetError && e.code === 'taken')) throw e;
          dlog('room code taken, retrying', code);
        }
      }
      if (lastErr) throw new NetError('broker', 'Could not allocate a room code. Try again.');
    } catch (e) {
      net._shutdown(null);
      throw toNetError(e);
    }
    net._t0 = now();
    const entry = { id: 'h', name: sanitizeName(name), slot: 0, isHost: true, ping: 0 };
    net.roster.push(entry);
    dlog('hosting', net.code, 'via', tp.kind);
    return net;
  }

  /**
   * Join a room by code (or by a pasted invite URL).
   * @param {string} code
   * @param {{ name?: string, transport?: 'peerjs'|'local', netsim?: false|string|object, timeout?: number,
   *           signal?: AbortSignal }} [opts]  `signal` aborts the attempt (NetError 'cancelled').
   * @returns {Promise<Net>} resolved after the host's `welcome` (roster, slot and clock seed received)
   * @throws {NetError} 'not-found' | 'full' | 'version' | 'rejected' | 'broker' | 'timeout' | 'network'
   */
  static async join(code, { name = 'Player', transport, netsim, timeout = CONNECT_TIMEOUT_MS, signal, version = NET_VERSION } = {}) {
    if (signal && signal.aborted) throw new NetError('cancelled');
    const c = Net.parseCode(code);
    if (!c) throw new NetError('not-found', 'That code doesn\'t look right — it should be 5 letters/numbers.');
    const tp = makeTransport(transport);
    const net = new Net('client', tp, { netsim });
    net.code = c;
    const deadline = now() + timeout;
    try {
      const link = await abortable(tp.connect(c, deadline), signal);
      if (net._closed) throw new NetError('network', 'closed');
      await abortable(net._handshake(link, sanitizeName(name), deadline, version), signal);
    } catch (e) {
      net._shutdown(null);
      throw toNetError(e);
    }
    dlog('joined', c, 'as', net.selfId, 'slot', net.slot);
    return net;
  }

  /**
   * Extract a room code from user input: raw code (case/spacing-insensitive) or an invite URL.
   * @param {string} input
   * @returns {string|null}
   */
  static parseCode(input) {
    if (typeof input !== 'string') return null;
    let s = input.trim();
    const m = s.match(/[?&#]join=([^&#\s]+)/i);
    if (m) { try { s = decodeURIComponent(m[1]); } catch { s = m[1]; } }
    s = s.toUpperCase().replace(/[^A-Z0-9]/g, '');
    return CODE_RE.test(s) ? s : null;
  }

  // ---- public API --------------------------------------------------------------------------------

  /** Invite link: `location.origin + '/?join=CODE'` (+ `&net=local` for the local transport). */
  get inviteUrl() {
    let origin = '';
    try { origin = globalThis.location?.origin || ''; } catch {}
    if (origin === 'null') origin = '';
    return `${origin}/?join=${this.code}${this.transport === 'local' ? '&net=local' : ''}`;
  }
  /** @returns {boolean} */
  get isHost() { return this.role === 'host'; }
  /** Our slot 0..3 (-1 before joining). */
  get slot() { const e = this.roster.find((p) => p.id === this.selfId); return e ? e.slot : -1; }
  /** Our (possibly de-duplicated) display name. */
  get name() { const e = this.roster.find((p) => p.id === this.selfId); return e ? e.name : ''; }
  /** True until close()/disconnect. */
  get open() { return !this._closed; }
  /** Host: whether new joins are refused. */
  get locked() { return this._locked; }
  /** Host (peerjs): whether new players can currently find the room (broker reachable). */
  get discoverable() { return !this._closed && !!this._tp.brokerOnline; }

  /**
   * Send a game message. JSON-serialisable `data`, ≤ 64 KB serialised. Never throws.
   * Clients can only send to the host (`to` is ignored). The host sends to one client (`to: peerId`),
   * several (`to: [ids]`) or all (`to: '*'`, the host's default), optionally `except: peerId`.
   * Unreliable messages are unordered, never retransmitted, and may be dropped — use for snapshots.
   * @param {string} type must not start with '$'
   * @param {*} [data]
   * @param {{ to?: string|string[], reliable?: boolean, except?: string }} [opts]
   * @returns {boolean} false if nothing was queued (closed, unknown peer, oversize, unserialisable)
   */
  send(type, data, opts = {}) {
    if (this._closed || !this._joined) return false;
    if (typeof type !== 'string' || !type || type.charCodeAt(0) === 36) { this._warnOnce('type', `send(): invalid type ${JSON.stringify(type)}`); return false; }
    const reliable = opts.reliable !== false;
    let dj;
    try { dj = JSON.stringify(data === undefined ? null : data); } catch (e) { this._warnOnce('ser:' + type, `send("${type}"): data not serialisable (${e.message})`); return false; }
    if (dj === undefined) dj = 'null';
    const head = '[' + JSON.stringify(type) + ',' + dj;
    if (this.role === 'client') return this._hostRemote ? this._sendHead(this._hostRemote, head, reliable) : false;
    const to = opts.to == null ? '*' : opts.to;          // host → 'host' (itself) is a no-op
    if (to === '*') {
      let ok = false;
      for (const r of this._remotes) if (r.admitted && r.id !== opts.except) ok = this._sendHead(r, head, reliable) || ok;
      return ok;
    }
    if (Array.isArray(to)) {
      let ok = false;
      for (const id of to) { const r = this._byId.get(id); if (r) ok = this._sendHead(r, head, reliable) || ok; }
      return ok;
    }
    const r = this._byId.get(to);
    return r ? this._sendHead(r, head, reliable) : false;
  }

  /**
   * Subscribe to a message type. Handler errors are caught and logged.
   * Reliable messages that arrive before any handler for their type exists are held (≤ 10 s, ≤ 512
   * msgs) and delivered when the first handler registers — so late-join state isn't lost while the
   * integrator is still wiring things up after `await Net.join()`.
   * @param {string} type
   * @param {(data:any, fromId:string) => void} fn  fromId: sender's roster id ('h' on clients)
   * @returns {() => void} unsubscribe
   */
  on(type, fn) {
    if (typeof fn !== 'function') return () => {};
    let hs = this._handlers.get(type);
    if (!hs) this._handlers.set(type, (hs = new Set()));
    const first = hs.size === 0;
    hs.add(fn);
    if (first && this._pending.some((p) => p.type === type)) queueMicrotask(() => this._flushPending(type));
    return () => this.off(type, fn);
  }
  /** @param {string} type @param {Function} fn */
  off(type, fn) { const hs = this._handlers.get(type); if (hs) hs.delete(fn); }

  /** Roster changed (join/leave/name/slot). @param {(roster:RosterEntry[]) => void} fn @returns {() => void} */
  onRoster(fn) { return this._sub('roster', fn); }
  /**
   * A player joined. On clients this fires only for players who join after us (read `net.roster` for
   * the players already present). @param {(peer:RosterEntry) => void} fn @returns {() => void}
   */
  onPeerJoin(fn) { return this._sub('join', fn); }
  /** A player left. reason: 'left'|'timeout'|'kicked'. @param {(peer:RosterEntry, reason:string) => void} fn */
  onPeerLeave(fn) { return this._sub('leave', fn); }
  /**
   * Session ended. reason: 'host-left'|'host-timeout'|'kicked'|'closed'|'network'.
   * `detail` = kick reason text / host's close() reason, when available. Fires exactly once.
   * @param {(reason:string, detail?:string) => void} fn
   */
  onClose(fn) { return this._sub('close', fn); }
  /** Roster ping values refreshed (every ~2 s). @param {(roster:RosterEntry[]) => void} fn */
  onPings(fn) { return this._sub('pings', fn); }

  /** Host: refuse (true) or allow (false, default) new joins. Refused joiners get NetError 'rejected'. */
  lock(v = true) { if (this.role === 'host') this._locked = !!v; }

  /**
   * Host: remove a client. They get onClose('kicked', reason); everyone gets onPeerLeave(peer, 'kicked').
   * @param {string} peerId @param {string} [reason] shown to the kicked player
   * @returns {boolean}
   */
  kick(peerId, reason = 'Removed by the host') {
    if (this.role !== 'host' || this._closed) return false;
    const r = this._byId.get(peerId);
    if (!r) return false;
    this._kickRemote(r, reason);
    return true;
  }

  /**
   * Shared game clock in seconds. Host: seconds since the room was created. Clients: estimated from
   * ping exchanges (offset from the lowest-RTT samples, smoothed; monotonic except on large corrections).
   * @returns {number}
   */
  serverTime() {
    if (this.role === 'host') return (now() - this._t0) / 1000;
    const st = (now() + this._offset) / 1000;
    if (st < this._lastST) return this._lastST;
    this._lastST = st;
    return st;
  }

  /**
   * Recommended interpolation delay (s) for a remote stream sent every `interval` s: a snapshot stamped
   * with serverTime arrives ~one-way latency later, so render ≥ one-way + one interval (+ 2×jitter margin)
   * behind to stay interpolating instead of extrapolating. Clamped to [INTERP_DELAY, 0.5] and slew-limited
   * (the render clock runs ≤ 5 % fast/slow while it adapts, never jumps).
   * Clients: the host link. Host: `peerId`'s link, or the worst admitted peer when omitted.
   * @param {number} [interval=0.05] sender's snapshot interval in seconds (host zombies: 20 Hz → 0.05)
   * @param {string} [peerId]
   * @returns {number}
   */
  interpDelay(interval = 0.05, peerId) {
    let rtt = 0, jit = 0;
    if (this.role === 'client') { const r = this._hostRemote; if (r) { rtt = r.rtt; jit = r.jitter; } }
    else if (peerId != null) { const r = this._byId.get(peerId); if (r) { rtt = r.rtt; jit = r.jitter; } }
    else for (const r of this._remotes) if (r.admitted) { rtt = Math.max(rtt, r.rtt); jit = Math.max(jit, r.jitter); }
    const target = Math.min(0.5, Math.max(INTERP_DELAY, rtt / 2000 + interval + 2 * jit / 1000 + 0.01));
    const key = `${peerId ?? '*'}|${interval}`;
    const t = now();
    let d = this._delays.get(key);
    if (!d) { d = { v: target, t }; this._delays.set(key, d); return target; }
    const maxStep = 0.05 * Math.max(0, t - d.t) / 1000;
    d.t = t;
    d.v += Math.max(-maxStep, Math.min(maxStep, target - d.v));
    return d.v;
  }

  /**
   * The serverTime to sample SnapshotBuffers at: `serverTime() - delay`. With no argument the delay is
   * {@link Net#interpDelay} for a 20 Hz stream from the host (clients) / the worst peer (host).
   * @param {number} [delay] seconds
   */
  renderTime(delay) { return this.serverTime() - (Number.isFinite(delay) ? delay : this.interpDelay()); }

  /**
   * Link statistics. Clients: the host link. Host: one client (`peerId`) or, with no argument, an
   * aggregate (worst rtt/jitter/loss, summed kbps).
   * @param {string} [peerId]
   * @returns {NetStats}
   */
  stats(peerId) {
    if (this.role === 'client') {
      const s = this._statsOf(this._hostRemote);
      s.offset = r2(this._offset);
      return s;
    }
    if (peerId != null && peerId !== 'h') return this._statsOf(this._byId.get(peerId));
    const agg = { rtt: 0, jitter: 0, loss: 0, lossOut: 0, kbpsUp: 0, kbpsDown: 0, unreliable: 'native', peers: 0 };
    for (const r of this._remotes) {
      if (!r.admitted) continue;
      const s = this._statsOf(r);
      agg.peers++;
      agg.rtt = Math.max(agg.rtt, s.rtt); agg.jitter = Math.max(agg.jitter, s.jitter);
      agg.loss = Math.max(agg.loss, s.loss); agg.lossOut = Math.max(agg.lossOut, s.lossOut);
      agg.kbpsUp = r2(agg.kbpsUp + s.kbpsUp); agg.kbpsDown = r2(agg.kbpsDown + s.kbpsDown);
      if (s.unreliable !== 'native') agg.unreliable = 'fallback';
    }
    return agg;
  }

  /**
   * Leave / shut the room. Sends a polite 'bye' first (so the other side reacts instantly), then fires
   * onClose('closed', reason) locally. Idempotent. Also runs automatically on `pagehide`.
   * @param {string} [reason] forwarded to peers (host → clients' onClose detail)
   */
  close(reason) {
    if (this._closed) return;
    this._sendBye(reason);
    this._shutdown('closed', reason == null ? undefined : String(reason), { teardownDelay: 250 });
  }

  // ---- internals: plumbing -----------------------------------------------------------------------

  _sub(k, fn) {
    if (typeof fn !== 'function') return () => {};
    this._ev[k].add(fn);
    return () => this._ev[k].delete(fn);
  }

  _emit(k, ...args) {
    for (const fn of [...this._ev[k]]) {
      try { fn(...args); } catch (e) { console.error(`[net] ${k} listener threw`, e); }
    }
  }

  _warnOnce(key, msg) { if (!this._warned.has(key)) { this._warned.add(key); warn(msg); } }

  _onLink(link) {
    if (this._closed) { try { link.close(); } catch {} return; }
    const r = new Remote(link);
    this._remotes.add(r);
    link.onmessage = (raw, rel) => this._onRaw(r, raw, rel);
    link.onclose = (why) => this._onLinkClose(r, why);
    dlog('link from', link.key);
  }

  _onLinkClose(r, why) {
    if (!r.active || this._closed) return;
    if (this.role === 'client') {
      if (!this._joined) { this._joinFail(new NetError('network')); return; }
      this._shutdown(why === 'failed' ? 'network' : why === 'timeout' ? 'host-timeout' : 'host-left');
    } else {
      this._dropRemote(r, why === 'failed' || why === 'timeout' ? 'timeout' : 'left');
    }
  }

  _sendHead(r, head, reliable) {
    if (!r.active) return false;
    const str = reliable ? head + ']' : head + ',' + (++r.uSeqOut) + ']';
    if (str.length > MAX_MSG) { warn(`dropping ${str.length}-byte message (limit ${MAX_MSG}): ${head.slice(0, 40)}…`); return false; }
    return this._xmit(r, str, reliable);
  }

  _sendInternal(r, type, data, reliable = true) {
    let dj;
    try { dj = JSON.stringify(data === undefined ? null : data); } catch { return false; }
    return this._sendHead(r, '[' + JSON.stringify(type) + ',' + dj, reliable);
  }

  /** Transmit a serialised message, through the network simulator if active. */
  _xmit(r, str, reliable, bypass = false) {
    r.bytesOut += str.length;
    r.msgsOut++;
    const ns = this._netsim;
    if (!ns || bypass) return r.link.send(str, reliable);
    if (!reliable && ns.loss > 0 && Math.random() < ns.loss) return true;       // "sent", lost on the wire
    let at = now() + Math.max(0, ns.latency + (Math.random() * 2 - 1) * ns.jitter);
    if (reliable) {
      if (at < r.nsLastRel) at = r.nsLastRel;   // reliable = ordered: never overtake an earlier message
      r.nsLastRel = at;
      r.nsRel.push({ at, str });
    } else r.nsUnrel.push({ at, str });
    this._nsArm(r, at);
    return true;
  }

  _nsArm(r, at) {
    if (at >= r.nsDue) return;
    clearTimeout(r.nsTimer);
    r.nsDue = at;
    r.nsTimer = setTimeout(() => this._nsPump(r), Math.max(0, at - now()));
  }

  _nsPump(r) {
    r.nsDue = Infinity;
    r.nsTimer = 0;
    if (!r.active) { r.nsRel.length = 0; r.nsUnrel.length = 0; return; }
    const t = now() + 0.5;
    let i = 0;
    while (i < r.nsRel.length && r.nsRel[i].at <= t) r.link.send(r.nsRel[i++].str, true);
    if (i) r.nsRel.splice(0, i);
    let next = r.nsRel.length ? r.nsRel[0].at : Infinity;
    if (r.nsUnrel.length) {
      const keep = [];
      for (const m of r.nsUnrel) {
        if (m.at <= t) r.link.send(m.str, false);
        else { keep.push(m); if (m.at < next) next = m.at; }
      }
      r.nsUnrel = keep;
    }
    if (next < Infinity) this._nsArm(r, next);
  }

  /** Every inbound message goes through here. Nothing in here may throw into the transport. */
  _onRaw(r, raw, reliable) {
    if (this._closed || !r.active) return;
    try {
      const t = now();
      if (typeof raw !== 'string') { this._warnOnce('bin', 'ignoring non-text message'); return; }
      r.bytesIn += raw.length;
      r.msgsIn++;
      r.lastRecv = t;
      if (this.role === 'host' && !this._rateOk(r, t)) return;
      if (raw.length > MAX_MSG) {
        if (!r.warnedBig) { r.warnedBig = true; warn(`dropped ${raw.length}-byte message from ${r.id || r.link.key} (limit ${MAX_MSG})`); }
        return;
      }
      let m;
      try { m = JSON.parse(raw); } catch { return; }
      if (!Array.isArray(m) || typeof m[0] !== 'string' || !m[0]) return;
      const type = m[0], data = m[1];
      if (m.length > 2) {
        const seq = m[2];
        if (Number.isInteger(seq) && seq > 0 && seq < 2 ** 40) { r.uCount++; if (seq > r.uMax) r.uMax = seq; }
      }
      if (type.charCodeAt(0) === 36) this._internal(r, type, data, t);
      else if (this.role === 'host' ? r.admitted : this._joined) this._dispatch(type, data, this.role === 'host' ? r.id : 'h', reliable && m.length === 2);
      if (!this._closed && t - this._tickT > TICK_MS) this._tick();
    } catch (e) {
      warn('error handling message', e);
    }
  }

  _rateOk(r, t) {
    r.tokens = Math.min(RATE_BURST, r.tokens + (t - r.tokenT) * RATE_PER_SEC / 1000);
    r.tokenT = t;
    if (r.tokens >= 1) { r.tokens -= 1; return true; }
    warn(`${r.id || 'unadmitted peer'} exceeded ${RATE_PER_SEC} msgs/s — kicking`);
    if (r.admitted) this._kickRemote(r, 'Too many messages (flood protection)');
    else this._dropRemote(r, 'kicked');
    return false;
  }

  _dispatch(type, data, from, holdIfUnhandled) {
    const hs = this._handlers.get(type);
    if (hs && hs.size) {
      for (const fn of [...hs]) {
        try { fn(data, from); } catch (e) { console.error(`[net] handler for "${type}" threw`, e); }
      }
      return;
    }
    if (holdIfUnhandled) {
      this._pending.push({ type, data, from, t: now() });
      if (this._pending.length > PENDING_MAX) this._pending.shift();
    }
  }

  _flushPending(type) {
    const t = now(), keep = [], run = [];
    for (const p of this._pending) {
      if (t - p.t > PENDING_AGE_MS) continue;
      (p.type === type ? run : keep).push(p);
    }
    this._pending = keep;
    for (const p of run) if (!this._closed) this._dispatch(p.type, p.data, p.from, false);
  }

  _internal(r, type, d, t) {
    const host = this.role === 'host';
    switch (type) {
      case '$ping':
        this._sendInternal(r, '$pong', host ? { t: d && d.t, s: r2(t - this._t0) } : { t: d && d.t }, false);
        if (d && Number.isFinite(d.l)) r.lossOut = clamp01(d.l);
        break;
      case '$pong': this._onPong(r, d, t); break;
      case '$u': break;
      case '$hello': if (host) this._onHello(r, d); break;
      case '$welcome': if (!host) this._onWelcome(r, d, t); break;
      case '$reject':
        if (!host && !this._joined) {
          const code = d && ['full', 'version', 'rejected'].includes(d.code) ? d.code : 'rejected';
          this._joinFail(new NetError(code, d && typeof d.message === 'string' ? d.message.slice(0, 200) : undefined));
        }
        break;
      case '$roster': if (!host && this._joined) this._onRosterMsg(d); break;
      case '$pings':
        if (!host && this._joined && d && typeof d === 'object') {
          for (const e of this.roster) if (Number.isFinite(d[e.id])) e.ping = Math.max(0, Math.round(d[e.id]));
          this._emit('pings', this.roster);
        }
        break;
      case '$bye':
        if (host) this._dropRemote(r, 'left');
        else if (this._joined) this._shutdown('host-left', d && typeof d.reason === 'string' ? d.reason.slice(0, 120) : undefined);
        else this._joinFail(new NetError('not-found', 'The host closed the game.'));
        break;
      case '$drop':
        if (!host && this._joined) this._shutdown('host-timeout', d && typeof d.reason === 'string' ? d.reason.slice(0, 60) : undefined);
        break;
      case '$kick':
        if (!host) {
          const why = d && typeof d.reason === 'string' ? d.reason.slice(0, 120) : undefined;
          if (this._joined) this._shutdown('kicked', why);
          else this._joinFail(new NetError('rejected', why));
        }
        break;
    }
  }

  _onPong(r, d, t) {
    if (!d || !Number.isFinite(d.t)) return;
    const rtt = t - d.t;
    if (!(rtt >= 0 && rtt < 30000)) return;
    if (r.rttN === 0) { r.rtt = rtt; r.jitter = 0; }
    else {
      r.jitter += (Math.abs(rtt - r.lastRtt) - r.jitter) / 8;   // RFC 3550-style
      r.rtt += (rtt - r.rtt) * 0.25;
    }
    r.lastRtt = rtt;
    r.rttN++;
    if (r.entry) r.entry.ping = Math.round(r.rtt);
    if (this.role === 'client' && Number.isFinite(d.s)) this._clockSample(d.s - (d.t + t) / 2, rtt);
  }

  /** NTP-style offset estimate: trust the lowest-RTT samples (least queueing asymmetry), then slew. */
  _clockSample(off, rtt) {
    this._clk.push({ off, rtt });
    if (this._clk.length > 16) this._clk.shift();
    const sorted = this._clk.slice().sort((a, b) => a.rtt - b.rtt);
    const lim = sorted[0].rtt + Math.max(3, sorted[0].rtt * 0.2);
    let sum = 0, n = 0;
    for (let i = 0; i < sorted.length && n < 3; i++) if (sorted[i].rtt <= lim) { sum += sorted[i].off; n++; }
    const target = sum / n;
    if (!this._synced || Math.abs(target - this._offset) > 250) {
      this._offset = target;
      this._synced = true;
      this._lastST = -Infinity;       // a big correction may step backwards once
    } else {
      this._offset += (target - this._offset) * 0.3;
    }
  }

  _tick() {
    if (this._closed) return;
    const t = now();
    const stalled = t - this._tickT > STALL_MS;   // our own thread was blocked: don't blame peers for it
    this._tickT = t;
    for (const r of [...this._remotes]) {
      if (!r.active) continue;
      if (stalled) r.lastRecv = Math.max(r.lastRecv, t - HEARTBEAT_MS + STALL_MS);
      if (t - r.lastRecv > HEARTBEAT_MS) {
        if (this.role === 'client') {
          if (this._joined) this._shutdown('host-timeout');
          else this._joinFail(new NetError('timeout'));
          return;
        }
        // Best effort: a frozen (not dead) client learns on resume that it was timed out.
        this._xmit(r, '["$drop",{"reason":"timeout"}]', true, true);
        this._dropRemote(r, 'timeout', 400);
        continue;
      }
      if (this.role === 'host' && !r.admitted && t - r.createdAt > HELLO_TIMEOUT_MS) { this._dropRemote(r, 'timeout'); continue; }
      if (t >= r.nextPing) {
        r.pingsSent++;
        r.nextPing = t + (r.pingsSent < FAST_PINGS ? FAST_PING_MS : PING_MS);
        this._sendInternal(r, '$ping', { t: r2(t), l: Math.round(r.loss * 1000) / 1000 }, false);
      }
      if (r.link.probe) { try { r.link.probe(t); } catch {} }
      r.rateHist.push([t, r.bytesOut, r.bytesIn]);
      if (r.rateHist.length > 9) r.rateHist.shift();
      if (t - r.lossT >= 1000) {
        r.lossT = t;
        const exp = r.uMax - r.lossPrevMax, got = r.uCount - r.lossPrevCount;
        r.lossPrevMax = r.uMax; r.lossPrevCount = r.uCount;
        r.lossHist.push([exp, got]);
        if (r.lossHist.length > 5) r.lossHist.shift();
        let E = 0, G = 0;
        for (const [e, g] of r.lossHist) { E += e; G += g; }
        r.loss = E >= 3 ? clamp01(1 - G / E) : 0;
      }
    }
    if (this.role === 'host' && t - this._pingsT >= ROSTER_PINGS_MS) {
      this._pingsT = t;
      if (this._remotes.size) {
        const p = {};
        for (const e of this.roster) p[e.id] = e.ping;
        for (const r of this._remotes) if (r.admitted) this._sendInternal(r, '$pings', p, true);
        this._emit('pings', this.roster);
      }
    }
  }

  _statsOf(r) {
    if (!r) return { rtt: 0, jitter: 0, loss: 0, lossOut: 0, kbpsUp: 0, kbpsDown: 0, unreliable: 'fallback' };
    const h = r.rateHist;
    const a = h[0], b = [now(), r.bytesOut, r.bytesIn];
    const dt = Math.max(1, b[0] - a[0]);                   // ms
    return {
      rtt: r2(r.rtt),
      jitter: r2(r.jitter),
      loss: Math.round(r.loss * 1000) / 1000,
      lossOut: Math.round(r.lossOut * 1000) / 1000,
      kbpsUp: r2((b[1] - a[1]) * 8 / dt),                  // bytes/ms × 8 = kbit/s
      kbpsDown: r2((b[2] - a[2]) * 8 / dt),
      unreliable: r.link.mode,
    };
  }

  // ---- internals: host side ----------------------------------------------------------------------

  _onHello(r, d) {
    if (r.admitted || !r.active) return;
    if (!d || typeof d !== 'object' || d.version !== NET_VERSION) return this._reject(r, 'version');
    if (this._locked) return this._reject(r, 'rejected');
    if (this.roster.length >= this.maxPlayers) return this._reject(r, 'full');
    const used = new Set(this.roster.map((e) => e.slot));
    let slot = 0;
    while (used.has(slot)) slot++;
    if (slot >= MAX_SLOTS) return this._reject(r, 'full');
    const name = this._uniqueName(sanitizeName(d.name));
    const id = 'c' + this._nextId++;
    r.id = id;
    r.admitted = true;
    r.entry = { id, name, slot, isHost: false, ping: Math.round(r.rtt) };
    this._byId.set(id, r);
    this.roster.push(r.entry);
    this.roster.sort((a, b) => a.slot - b.slot);
    this._sendInternal(r, '$welcome', { selfId: id, slot, name, code: this.code, roster: this.roster, s: r2(now() - this._t0), v: NET_VERSION });
    for (const o of this._remotes) if (o !== r && o.admitted) this._sendInternal(o, '$roster', { r: this.roster, j: [id] });
    dlog('admitted', id, name, 'slot', slot);
    this._emit('join', r.entry);
    this._emit('roster', this.roster.slice());
  }

  _uniqueName(name) {
    const taken = new Set(this.roster.map((e) => e.name.toLowerCase()));
    if (!taken.has(name.toLowerCase())) return name;
    for (let k = 2; k < 100; k++) {
      const suf = ` (${k})`;
      const base = Array.from(name).slice(0, NAME_MAX - suf.length).join('').trimEnd();
      const cand = base + suf;
      if (!taken.has(cand.toLowerCase())) return cand;
    }
    return name;
  }

  _reject(r, code) {
    dlog('rejecting', r.link.key, code);
    this._xmit(r, JSON.stringify(['$reject', { code, message: ERR_TEXT[code] }]), true, true);
    this._dropRemote(r, 'kicked', 400);
  }

  _kickRemote(r, reason) {
    if (!r.active) return;
    this._xmit(r, JSON.stringify(['$kick', { reason: String(reason ?? '').slice(0, 120) }]), true, true);
    this._dropRemote(r, 'kicked', 400);
  }

  /** Remove a remote (idempotent). lingerMs keeps the transport open briefly so a final message flushes. */
  _dropRemote(r, reason, lingerMs = 0) {
    if (!r.active) return;
    r.active = false;
    clearTimeout(r.nsTimer);
    this._remotes.delete(r);
    if (r.id && this._byId.get(r.id) === r) this._byId.delete(r.id);
    const closeLink = () => { try { r.link.close(reason === 'timeout' ? 'timeout' : undefined); } catch {} };
    if (lingerMs) setTimeout(closeLink, lingerMs); else closeLink();
    if (this.role !== 'host' || !r.admitted || !r.entry) return;
    const i = this.roster.indexOf(r.entry);
    if (i >= 0) this.roster.splice(i, 1);
    for (const o of this._remotes) if (o.admitted) this._sendInternal(o, '$roster', { r: this.roster, l: [[r.id, reason]] });
    dlog('peer left', r.id, reason);
    this._emit('leave', r.entry, reason);
    this._emit('roster', this.roster.slice());
  }

  // ---- internals: client side --------------------------------------------------------------------

  _handshake(link, name, deadline, version) {
    const r = new Remote(link);
    r.id = 'h';
    this._remotes.add(r);
    this._hostRemote = r;
    link.onmessage = (raw, rel) => this._onRaw(r, raw, rel);
    link.onclose = (why) => this._onLinkClose(r, why);
    return new Promise((resolve, reject) => {
      const to = setTimeout(() => this._joinFail(new NetError('timeout')), Math.max(0, deadline - now()));
      this._join = {
        sentAt: now(),
        resolve: () => { clearTimeout(to); this._join = null; resolve(); },
        reject: (e) => { clearTimeout(to); this._join = null; reject(e); },
      };
      this._sendInternal(r, '$hello', { name, version });
    });
  }

  _joinFail(err) {
    const j = this._join;
    if (j) j.reject(err);
  }

  _onWelcome(r, d, t) {
    const j = this._join;
    if (!j || this._joined || !d || typeof d !== 'object' || typeof d.selfId !== 'string') return;
    const roster = sanitizeRoster(d.roster);
    if (!roster || !roster.some((e) => e.id === d.selfId)) { j.reject(new NetError('network', 'Malformed welcome from host.')); return; }
    this.selfId = d.selfId;
    this.roster.length = 0;
    this.roster.push(...roster);
    if (Number.isFinite(d.s)) this._clockSample(d.s - (j.sentAt + t) / 2, t - j.sentAt);
    this._joined = true;
    j.resolve();
  }

  _onRosterMsg(d) {
    if (!d || typeof d !== 'object') return;
    const list = sanitizeRoster(d.r);
    if (!list) return;
    const old = new Map(this.roster.map((e) => [e.id, e]));
    this.roster.length = 0;
    this.roster.push(...list);
    if (Array.isArray(d.l)) {
      for (const x of d.l) {
        if (!Array.isArray(x)) continue;
        const e = old.get(x[0]);
        const reason = ['left', 'timeout', 'kicked'].includes(x[1]) ? x[1] : 'left';
        if (e && e.id !== this.selfId) this._emit('leave', e, reason);
      }
    }
    if (Array.isArray(d.j)) {
      for (const id of d.j) {
        const e = list.find((p) => p.id === id);
        if (e && id !== this.selfId) this._emit('join', e);
      }
    }
    this._emit('roster', this.roster.slice());
  }

  // ---- internals: teardown -----------------------------------------------------------------------

  _sendBye(reason) {
    const bye = JSON.stringify(['$bye', reason == null ? {} : { reason: String(reason).slice(0, 120) }]);
    for (const r of this._remotes) if (r.active) { try { this._xmit(r, bye, true, true); } catch {} }
  }

  _pageHide() {
    if (this._closed) return;
    this._sendBye('pagehide');
    this._shutdown('closed', 'pagehide', { hide: true });
  }

  /**
   * @param {string|null} reason onClose reason; null = silent (failed construction / join)
   * @param {string} [detail]
   * @param {{teardownDelay?:number, hide?:boolean}} [o]
   */
  _shutdown(reason, detail, o = {}) {
    if (this._closed) return;
    this._closed = true;
    clearInterval(this._iv);
    try { globalThis.removeEventListener?.('pagehide', this._onPageHide); } catch {}
    for (const r of this._remotes) { r.active = false; clearTimeout(r.nsTimer); }
    const teardown = () => { try { this._tp.destroy(); } catch {} };
    if (o.hide) { try { this._tp.hideTeardown(); } catch {} }
    else if (o.teardownDelay) setTimeout(teardown, o.teardownDelay);
    else teardown();
    if (this._join) this._joinFail(new NetError('network', 'Connection closed.'));
    this._pending.length = 0;
    if (reason) {
      dlog('closed', reason, detail || '');
      this._emit('close', reason, detail);
    }
  }
}

// ---------------------------------------------------------------------------------------------------
// Interpolation helpers
// ---------------------------------------------------------------------------------------------------

/**
 * Time-ordered buffer of remote states for smooth rendering behind the network.
 * Push states stamped with the sender's serverTime; sample at `net.serverTime() - INTERP_DELAY`.
 *
 * `sample(t)` returns `{ a, b, t }` where a/b are the bracketing states and t ∈ [0,1] is the blend.
 * Past the newest state it extrapolates along the last segment for at most `maxExtrapolate` s
 * (default 0.1): then `t > 1` (plain `a + (b - a) * t` lerps extrapolate correctly) and
 * `extrapolated` holds the seconds extrapolated. Before the oldest state (or with a single state) it
 * returns that state as both a and b with t = 0.
 */
export class SnapshotBuffer {
  /** @param {{ maxAge?: number, maxExtrapolate?: number, maxCount?: number }} [opts] seconds */
  constructor({ maxAge = 1.0, maxExtrapolate = 0.1, maxCount = 240 } = {}) {
    this.maxAge = maxAge;
    this.maxExtrapolate = maxExtrapolate;
    this.maxCount = maxCount;
    /** @type {{time:number, state:any}[]} ascending by time */
    this.items = [];
  }
  get length() { return this.items.length; }
  /** Newest serverTime pushed (or -Infinity). */
  get newestTime() { return this.items.length ? this.items[this.items.length - 1].time : -Infinity; }
  /** Newest state (or null). */
  get latest() { return this.items.length ? this.items[this.items.length - 1].state : null; }
  clear() { this.items.length = 0; }

  /**
   * Insert a state. Out-of-order packets are slotted into place; an exact duplicate time replaces the
   * old state; anything older than the retained history is ignored.
   * @param {number} serverTime seconds
   * @param {*} state
   * @returns {boolean} whether it was stored
   */
  push(serverTime, state) {
    if (!Number.isFinite(serverTime)) return false;
    const b = this.items;
    const n = b.length;
    if (n && serverTime < b[n - 1].time - this.maxAge) return false;
    let i = n;
    while (i > 0 && b[i - 1].time > serverTime) i--;
    if (i > 0 && b[i - 1].time === serverTime) { b[i - 1].state = state; return true; }
    b.splice(i, 0, { time: serverTime, state });
    // prune: keep everything within maxAge of the newest, plus one older entry to interpolate from
    const cutoff = b[b.length - 1].time - this.maxAge;
    let k = 0;
    while (k + 1 < b.length && b[k + 1].time <= cutoff) k++;
    if (k) b.splice(0, k);
    if (b.length > this.maxCount) b.splice(0, b.length - this.maxCount);
    return true;
  }

  /**
   * @param {number} renderTime serverTime to render at (usually serverTime() - INTERP_DELAY)
   * @returns {{a:any, b:any, t:number, extrapolated:number}|null}
   */
  sample(renderTime) {
    const b = this.items;
    const n = b.length;
    if (!n) return null;
    if (n === 1 || !(renderTime > b[0].time)) return { a: b[0].state, b: b[0].state, t: 0, extrapolated: 0 };
    const last = b[n - 1];
    if (renderTime >= last.time) {
      const prev = b[n - 2];
      const span = last.time - prev.time;
      const ex = Math.min(renderTime - last.time, Math.max(0, this.maxExtrapolate));
      return { a: prev.state, b: last.state, t: span > 1e-6 ? 1 + ex / span : 1, extrapolated: ex };
    }
    let lo = 0, hi = n - 1;                  // invariant: b[lo].time < renderTime <= b[hi].time
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (b[mid].time < renderTime) lo = mid; else hi = mid;
    }
    const A = b[lo], B = b[hi];
    const span = B.time - A.time;
    return { a: A.state, b: B.state, t: span > 1e-9 ? (renderTime - A.time) / span : 1, extrapolated: 0 };
  }
}

const TAU = Math.PI * 2;
/**
 * Interpolate between two angles (radians) along the shortest arc. Works for t outside 0..1
 * (extrapolation). Result is not re-wrapped.
 * @param {number} a @param {number} b @param {number} t
 */
export function lerpAngle(a, b, t) {
  let d = (b - a) % TAU;
  if (d > Math.PI) d -= TAU;
  else if (d < -Math.PI) d += TAU;
  return a + d * t;
}
