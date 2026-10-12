// src__net 04 — reason
// Lines 961-2164 of readable/src__net.pretty.js (statement-aligned).
export class Net {
  /** @private */
  constructor(role, tp, opts = {}) {
    /** @type {'host'|'client'} */
    this.role = role;
    /** @type {'peerjs'|'local'} */
    this.transport = tp.kind;
    /** Room code, 5 chars from ABCDEFGHJKMNPQRSTUVWXYZ23456789. */
    this.code = "";
    /** Our roster id ('h' on the host). */
    this.selfId = role === "host" ? "h" : "";
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
    this._ev = {
      roster: new Set(),
      join: new Set(),
      leave: new Set(),
      close: new Set(),
      pings: new Set(),
    };
    this._pending = [];
    this._closed = false;
    this._joined = role === "host";
    this._locked = false;
    this._netsim = normalizeNetsim(opts.netsim);
    this._t0 = now();
    this._offset = 0;
    this._clk = [];
    this._synced = false;
    this._lastST = -Infinity;
    this._nextId = 1;
    this._tickT = now();
    this._pingsT = now();
    this._warned = new Set();
    this._join = null; // client handshake {resolve, reject, sentAt}
    this._delays = new Map(); // interpDelay smoothing state
    this._iv = setInterval(() => this._tick(), TICK_MS);
    this._onPageHide = () => this._pageHide();
    try {
      globalThis.addEventListener?.("pagehide", this._onPageHide);
    } catch {}
    if (this._netsim)
      warn(
        `netsim active: ${this._netsim.latency}ms ±${this._netsim.jitter}ms, ${Math.round(this._netsim.loss * 100)}% unreliable loss`,
      );
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
  static async host({
    name = "Player",
    transport,
    maxPlayers = MAX_SLOTS,
    netsim,
    signal,
    code: preferred,
  } = {}) {
    if (signal && signal.aborted) throw new NetError("cancelled");
    const tp = makeTransport(transport);
    const net = new Net("host", tp, { netsim });
    net.maxPlayers = Math.max(
      1,
      Math.min(MAX_SLOTS, Math.floor(maxPlayers) || MAX_SLOTS),
    );
    tp.onlink = (link) => net._onLink(link);
    try {
      let lastErr = null;
      const deadline = now() + HOST_LISTEN_MS;
      for (let i = 0; i < CODE_ATTEMPTS; i++) {
        const code =
          i === 0 && preferred && CODE_RE.test(preferred)
            ? preferred
            : randomCode();
        try {
          await abortable(tp.listen(code, deadline), signal);
          net.code = code;
          lastErr = null;
          break;
        } catch (e) {
          lastErr = e;
          if (!(e instanceof NetError && e.code === "taken")) throw e;
          dlog("room code taken, retrying", code);
        }
      }
      if (lastErr)
        throw new NetError(
          "broker",
          "Could not allocate a room code. Try again.",
        );
    } catch (e) {
      net._shutdown(null);
      throw toNetError(e);
    }
    net._t0 = now();
    const entry = {
      id: "h",
      name: sanitizeName(name),
      slot: 0,
      isHost: true,
      ping: 0,
    };
    net.roster.push(entry);
    dlog("hosting", net.code, "via", tp.kind);
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
  static async join(
    code,
    {
      name = "Player",
      transport,
      netsim,
      timeout = CONNECT_TIMEOUT_MS,
      signal,
      version = NET_VERSION,
    } = {},
  ) {
    if (signal && signal.aborted) throw new NetError("cancelled");
    const c = Net.parseCode(code);
    if (!c)
      throw new NetError(
        "not-found",
        "That code doesn't look right — it should be 5 letters/numbers.",
      );
    const tp = makeTransport(transport);
    const net = new Net("client", tp, { netsim });
    net.code = c;
    const deadline = now() + timeout;
    try {
      const link = await abortable(tp.connect(c, deadline), signal);
      if (net._closed) throw new NetError("network", "closed");
      await abortable(
        net._handshake(link, sanitizeName(name), deadline, version),
        signal,
      );
    } catch (e) {
      net._shutdown(null);
      throw toNetError(e);
    }
    dlog("joined", c, "as", net.selfId, "slot", net.slot);
    return net;
  }

  /**
   * Extract a room code from user input: raw code (case/spacing-insensitive) or an invite URL.
   * @param {string} input
   * @returns {string|null}
   */
  static parseCode(input) {
    if (typeof input !== "string") return null;
    let s = input.trim();
    const m = s.match(/[?&#]join=([^&#\s]+)/i);
    if (m) {
      try {
        s = decodeURIComponent(m[1]);
      } catch {
        s = m[1];
      }
    }
    s = s.toUpperCase().replace(/[^A-Z0-9]/g, "");
    return CODE_RE.test(s) ? s : null;
  }

  // ---- public API --------------------------------------------------------------------------------

  /** Invite link: `location.origin + '/?join=CODE'` (+ `&net=local` for the local transport). */
  get inviteUrl() {
    let origin = "";
    try {
      origin = globalThis.location?.origin || "";
    } catch {}
    if (origin === "null") origin = "";
    return `${origin}/?join=${this.code}${this.transport === "local" ? "&net=local" : ""}`;
  }
  /** @returns {boolean} */
  get isHost() {
    return this.role === "host";
  }
  /** Our slot 0..3 (-1 before joining). */
  get slot() {
    const e = this.roster.find((p) => p.id === this.selfId);
    return e ? e.slot : -1;
  }
  /** Our (possibly de-duplicated) display name. */
  get name() {
    const e = this.roster.find((p) => p.id === this.selfId);
    return e ? e.name : "";
  }
  /** True until close()/disconnect. */
  get open() {
    return !this._closed;
  }
  /** Host: whether new joins are refused. */
  get locked() {
    return this._locked;
  }
  /** Host (peerjs): whether new players can currently find the room (broker reachable). */
  get discoverable() {
    return !this._closed && !!this._tp.brokerOnline;
  }

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
    if (typeof type !== "string" || !type || type.charCodeAt(0) === 36) {
      this._warnOnce("type", `send(): invalid type ${JSON.stringify(type)}`);
      return false;
    }
    const reliable = opts.reliable !== false;
    let dj;
    try {
      dj = JSON.stringify(data === undefined ? null : data);
    } catch (e) {
      this._warnOnce(
        "ser:" + type,
        `send("${type}"): data not serialisable (${e.message})`,
      );
      return false;
    }
    if (dj === undefined) dj = "null";
    const head = "[" + JSON.stringify(type) + "," + dj;
    if (this.role === "client")
      return this._hostRemote
        ? this._sendHead(this._hostRemote, head, reliable)
        : false;
    const to = opts.to == null ? "*" : opts.to; // host → 'host' (itself) is a no-op
    if (to === "*") {
      let ok = false;
      for (const r of this._remotes)
        if (r.admitted && r.id !== opts.except)
          ok = this._sendHead(r, head, reliable) || ok;
      return ok;
    }
    if (Array.isArray(to)) {
      let ok = false;
      for (const id of to) {
        const r = this._byId.get(id);
        if (r) ok = this._sendHead(r, head, reliable) || ok;
      }
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
    if (typeof fn !== "function") return () => {};
    let hs = this._handlers.get(type);
    if (!hs) this._handlers.set(type, (hs = new Set()));
    const first = hs.size === 0;
    hs.add(fn);
    if (first && this._pending.some((p) => p.type === type))
      queueMicrotask(() => this._flushPending(type));
    return () => this.off(type, fn);
  }
  /** @param {string} type @param {Function} fn */
  off(type, fn) {
    const hs = this._handlers.get(type);
    if (hs) hs.delete(fn);
  }

  /** Roster changed (join/leave/name/slot). @param {(roster:RosterEntry[]) => void} fn @returns {() => void} */
  onRoster(fn) {
    return this._sub("roster", fn);
  }
  /**
   * A player joined. On clients this fires only for players who join after us (read `net.roster` for
   * the players already present). @param {(peer:RosterEntry) => void} fn @returns {() => void}
   */
  onPeerJoin(fn) {
    return this._sub("join", fn);
  }
  /** A player left. reason: 'left'|'timeout'|'kicked'. @param {(peer:RosterEntry, reason:string) => void} fn */
  onPeerLeave(fn) {
    return this._sub("leave", fn);
  }
  /**
   * Session ended. reason: 'host-left'|'host-timeout'|'kicked'|'closed'|'network'.
   * `detail` = kick reason text / host's close() reason, when available. Fires exactly once.
   * @param {(reason:string, detail?:string) => void} fn
   */
  onClose(fn) {
    return this._sub("close", fn);
  }
  /** Roster ping values refreshed (every ~2 s). @param {(roster:RosterEntry[]) => void} fn */
  onPings(fn) {
    return this._sub("pings", fn);
  }

  /** Host: refuse (true) or allow (false, default) new joins. Refused joiners get NetError 'rejected'. */
  lock(v = true) {
    if (this.role === "host") this._locked = !!v;
  }

  /**
   * Host: remove a client. They get onClose('kicked', reason); everyone gets onPeerLeave(peer, 'kicked').
   * @param {string} peerId @param {string} [reason] shown to the kicked player
   * @returns {boolean}
   */
  kick(peerId, reason = "Removed by the host") {
    if (this.role !== "host" || this._closed) return false;
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
    if (this.role === "host") return (now() - this._t0) / 1000;
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
    let rtt = 0,
      jit = 0;
    if (this.role === "client") {
      const r = this._hostRemote;
      if (r) {
        rtt = r.rtt;
        jit = r.jitter;
      }
    } else if (peerId != null) {
      const r = this._byId.get(peerId);
      if (r) {
        rtt = r.rtt;
        jit = r.jitter;
      }
    } else
      for (const r of this._remotes)
        if (r.admitted) {
          rtt = Math.max(rtt, r.rtt);
          jit = Math.max(jit, r.jitter);
        }
    const target = Math.min(
      0.5,
      Math.max(INTERP_DELAY, rtt / 2000 + interval + (2 * jit) / 1000 + 0.01),
    );
    const key = `${peerId ?? "*"}|${interval}`;
    const t = now();
    let d = this._delays.get(key);
    if (!d) {
      d = { v: target, t };
      this._delays.set(key, d);
      return target;
    }
    const maxStep = (0.05 * Math.max(0, t - d.t)) / 1000;
    d.t = t;
    d.v += Math.max(-maxStep, Math.min(maxStep, target - d.v));
    return d.v;
  }

  /**
   * The serverTime to sample SnapshotBuffers at: `serverTime() - delay`. With no argument the delay is
   * {@link Net#interpDelay} for a 20 Hz stream from the host (clients) / the worst peer (host).
   * @param {number} [delay] seconds
   */
  renderTime(delay) {
    return (
      this.serverTime() - (Number.isFinite(delay) ? delay : this.interpDelay())
    );
  }

  /**
   * Link statistics. Clients: the host link. Host: one client (`peerId`) or, with no argument, an
   * aggregate (worst rtt/jitter/loss, summed kbps).
   * @param {string} [peerId]
   * @returns {NetStats}
   */
  stats(peerId) {
    if (this.role === "client") {
      const s = this._statsOf(this._hostRemote);
      s.offset = r2(this._offset);
      return s;
    }
    if (peerId != null && peerId !== "h")
      return this._statsOf(this._byId.get(peerId));
    const agg = {
      rtt: 0,
      jitter: 0,
      loss: 0,
      lossOut: 0,
      kbpsUp: 0,
      kbpsDown: 0,
      unreliable: "native",
      peers: 0,
    };
    for (const r of this._remotes) {
      if (!r.admitted) continue;
      const s = this._statsOf(r);
      agg.peers++;
      agg.rtt = Math.max(agg.rtt, s.rtt);
      agg.jitter = Math.max(agg.jitter, s.jitter);
      agg.loss = Math.max(agg.loss, s.loss);
      agg.lossOut = Math.max(agg.lossOut, s.lossOut);
      agg.kbpsUp = r2(agg.kbpsUp + s.kbpsUp);
      agg.kbpsDown = r2(agg.kbpsDown + s.kbpsDown);
      if (s.unreliable !== "native") agg.unreliable = "fallback";
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
    this._shutdown("closed", reason == null ? undefined : String(reason), {
      teardownDelay: 250,
    });
  }

  // ---- internals: plumbing -----------------------------------------------------------------------

  _sub(k, fn) {
    if (typeof fn !== "function") return () => {};
    this._ev[k].add(fn);
    return () => this._ev[k].delete(fn);
  }

  _emit(k, ...args) {
    for (const fn of [...this._ev[k]]) {
      try {
        fn(...args);
      } catch (e) {
        console.error(`[net] ${k} listener threw`, e);
      }
    }
  }

  _warnOnce(key, msg) {
    if (!this._warned.has(key)) {
      this._warned.add(key);
      warn(msg);
    }
  }

  _onLink(link) {
    if (this._closed) {
      try {
        link.close();
      } catch {}
      return;
    }
    const r = new Remote(link);
    this._remotes.add(r);
    link.onmessage = (raw, rel) => this._onRaw(r, raw, rel);
    link.onclose = (why) => this._onLinkClose(r, why);
    dlog("link from", link.key);
  }

  _onLinkClose(r, why) {
    if (!r.active || this._closed) return;
    if (this.role === "client") {
      if (!this._joined) {
        this._joinFail(new NetError("network"));
        return;
      }
      this._shutdown(
        why === "failed"
          ? "network"
          : why === "timeout"
            ? "host-timeout"
            : "host-left",
      );
    } else {
      this._dropRemote(
        r,
        why === "failed" || why === "timeout" ? "timeout" : "left",
      );
    }
  }

  _sendHead(r, head, reliable) {
    if (!r.active) return false;
    const str = reliable ? head + "]" : head + "," + ++r.uSeqOut + "]";
    if (str.length > MAX_MSG) {
      warn(
        `dropping ${str.length}-byte message (limit ${MAX_MSG}): ${head.slice(0, 40)}…`,
      );
      return false;
    }
    return this._xmit(r, str, reliable);
  }

  _sendInternal(r, type, data, reliable = true) {
    let dj;
    try {
      dj = JSON.stringify(data === undefined ? null : data);
    } catch {
      return false;
    }
    return this._sendHead(r, "[" + JSON.stringify(type) + "," + dj, reliable);
  }

  /** Transmit a serialised message, through the network simulator if active. */
  _xmit(r, str, reliable, bypass = false) {
    r.bytesOut += str.length;
    r.msgsOut++;
    const ns = this._netsim;
    if (!ns || bypass) return r.link.send(str, reliable);
    if (!reliable && ns.loss > 0 && Math.random() < ns.loss) return true; // "sent", lost on the wire
    let at =
      now() + Math.max(0, ns.latency + (Math.random() * 2 - 1) * ns.jitter);
    if (reliable) {
      if (at < r.nsLastRel) at = r.nsLastRel; // reliable = ordered: never overtake an earlier message
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
    if (!r.active) {
      r.nsRel.length = 0;
      r.nsUnrel.length = 0;
      return;
    }
    const t = now() + 0.5;
    let i = 0;
    while (i < r.nsRel.length && r.nsRel[i].at <= t)
      r.link.send(r.nsRel[i++].str, true);
    if (i) r.nsRel.splice(0, i);
    let next = r.nsRel.length ? r.nsRel[0].at : Infinity;
    if (r.nsUnrel.length) {
      const keep = [];
      for (const m of r.nsUnrel) {
        if (m.at <= t) r.link.send(m.str, false);
        else {
          keep.push(m);
          if (m.at < next) next = m.at;
        }
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
      if (typeof raw !== "string") {
        this._warnOnce("bin", "ignoring non-text message");
        return;
      }
      r.bytesIn += raw.length;
      r.msgsIn++;
      r.lastRecv = t;
      if (this.role === "host" && !this._rateOk(r, t)) return;
      if (raw.length > MAX_MSG) {
        if (!r.warnedBig) {
          r.warnedBig = true;
          warn(
            `dropped ${raw.length}-byte message from ${r.id || r.link.key} (limit ${MAX_MSG})`,
          );
        }
        return;
      }
      let m;
      try {
        m = JSON.parse(raw);
      } catch {
        return;
      }
      if (!Array.isArray(m) || typeof m[0] !== "string" || !m[0]) return;
      const type = m[0],
        data = m[1];
      if (m.length > 2) {
        const seq = m[2];
        if (Number.isInteger(seq) && seq > 0 && seq < 2 ** 40) {
          r.uCount++;
          if (seq > r.uMax) r.uMax = seq;
        }
      }
      if (type.charCodeAt(0) === 36) this._internal(r, type, data, t);
      else if (this.role === "host" ? r.admitted : this._joined)
        this._dispatch(
          type,
          data,
          this.role === "host" ? r.id : "h",
          reliable && m.length === 2,
        );
      if (!this._closed && t - this._tickT > TICK_MS) this._tick();
    } catch (e) {
      warn("error handling message", e);
    }
  }

  _rateOk(r, t) {
    r.tokens = Math.min(
      RATE_BURST,
      r.tokens + ((t - r.tokenT) * RATE_PER_SEC) / 1000,
    );
    r.tokenT = t;
    if (r.tokens >= 1) {
      r.tokens -= 1;
      return true;
    }
    warn(
      `${r.id || "unadmitted peer"} exceeded ${RATE_PER_SEC} msgs/s — kicking`,
    );
    if (r.admitted) this._kickRemote(r, "Too many messages (flood protection)");
    else this._dropRemote(r, "kicked");
    return false;
  }

  _dispatch(type, data, from, holdIfUnhandled) {
    const hs = this._handlers.get(type);
    if (hs && hs.size) {
      for (const fn of [...hs]) {
        try {
          fn(data, from);
        } catch (e) {
          console.error(`[net] handler for "${type}" threw`, e);
        }
      }
      return;
    }
    if (holdIfUnhandled) {
      this._pending.push({ type, data, from, t: now() });
      if (this._pending.length > PENDING_MAX) this._pending.shift();
    }
  }

  _flushPending(type) {
    const t = now(),
      keep = [],
      run = [];
    for (const p of this._pending) {
      if (t - p.t > PENDING_AGE_MS) continue;
      (p.type === type ? run : keep).push(p);
    }
    this._pending = keep;
    for (const p of run)
      if (!this._closed) this._dispatch(p.type, p.data, p.from, false);
  }

  _internal(r, type, d, t) {
    const host = this.role === "host";
    switch (type) {
      case "$ping":
        this._sendInternal(
          r,
          "$pong",
          host ? { t: d && d.t, s: r2(t - this._t0) } : { t: d && d.t },
          false,
        );
        if (d && Number.isFinite(d.l)) r.lossOut = clamp01(d.l);
        break;
      case "$pong":
        this._onPong(r, d, t);
        break;
      case "$u":
        break;
      case "$hello":
        if (host) this._onHello(r, d);
        break;
      case "$welcome":
        if (!host) this._onWelcome(r, d, t);
        break;
      case "$reject":
        if (!host && !this._joined) {
          const code =
            d && ["full", "version", "rejected"].includes(d.code)
              ? d.code
              : "rejected";
          this._joinFail(
            new NetError(
              code,
              d && typeof d.message === "string"
                ? d.message.slice(0, 200)
                : undefined,
            ),
          );
        }
        break;
      case "$roster":
        if (!host && this._joined) this._onRosterMsg(d);
        break;
      case "$pings":
        if (!host && this._joined && d && typeof d === "object") {
          for (const e of this.roster)
            if (Number.isFinite(d[e.id]))
              e.ping = Math.max(0, Math.round(d[e.id]));
          this._emit("pings", this.roster);
        }
        break;
      case "$bye":
        if (host) this._dropRemote(r, "left");
        else if (this._joined)
          this._shutdown(
            "host-left",
            d && typeof d.reason === "string"
              ? d.reason.slice(0, 120)
              : undefined,
          );
        else
          this._joinFail(
            new NetError("not-found", "The host closed the game."),
          );
        break;
      case "$drop":
        if (!host && this._joined)
          this._shutdown(
            "host-timeout",
            d && typeof d.reason === "string"
              ? d.reason.slice(0, 60)
              : undefined,
          );
        break;
      case "$kick":
        if (!host) {
          const why =
            d && typeof d.reason === "string"
              ? d.reason.slice(0, 120)
              : undefined;
          if (this._joined) this._shutdown("kicked", why);
          else this._joinFail(new NetError("rejected", why));
        }
        break;
    }
  }

  _onPong(r, d, t) {
    if (!d || !Number.isFinite(d.t)) return;
    const rtt = t - d.t;
    if (!(rtt >= 0 && rtt < 30000)) return;
    if (r.rttN === 0) {
      r.rtt = rtt;
      r.jitter = 0;
    } else {
      r.jitter += (Math.abs(rtt - r.lastRtt) - r.jitter) / 8; // RFC 3550-style
      r.rtt += (rtt - r.rtt) * 0.25;
    }
    r.lastRtt = rtt;
    r.rttN++;
    if (r.entry) r.entry.ping = Math.round(r.rtt);
    if (this.role === "client" && Number.isFinite(d.s))
      this._clockSample(d.s - (d.t + t) / 2, rtt);
  }

  /** NTP-style offset estimate: trust the lowest-RTT samples (least queueing asymmetry), then slew. */
  _clockSample(off, rtt) {
    this._clk.push({ off, rtt });
    if (this._clk.length > 16) this._clk.shift();
    const sorted = this._clk.slice().sort((a, b) => a.rtt - b.rtt);
    const lim = sorted[0].rtt + Math.max(3, sorted[0].rtt * 0.2);
    let sum = 0,
      n = 0;
    for (let i = 0; i < sorted.length && n < 3; i++)
      if (sorted[i].rtt <= lim) {
        sum += sorted[i].off;
        n++;
      }
    const target = sum / n;
    if (!this._synced || Math.abs(target - this._offset) > 250) {
      this._offset = target;
      this._synced = true;
      this._lastST = -Infinity; // a big correction may step backwards once
    } else {
      this._offset += (target - this._offset) * 0.3;
    }
  }

  _tick() {
    if (this._closed) return;
    const t = now();
    const stalled = t - this._tickT > STALL_MS; // our own thread was blocked: don't blame peers for it
    this._tickT = t;
    for (const r of [...this._remotes]) {
      if (!r.active) continue;
      if (stalled)
        r.lastRecv = Math.max(r.lastRecv, t - HEARTBEAT_MS + STALL_MS);
      if (t - r.lastRecv > HEARTBEAT_MS) {
        if (this.role === "client") {
          if (this._joined) this._shutdown("host-timeout");
          else this._joinFail(new NetError("timeout"));
          return;
        }
        // Best effort: a frozen (not dead) client learns on resume that it was timed out.
        this._xmit(r, '["$drop",{"reason":"timeout"}]', true, true);
        this._dropRemote(r, "timeout", 400);
        continue;
      }
      if (
        this.role === "host" &&
        !r.admitted &&
        t - r.createdAt > HELLO_TIMEOUT_MS
      ) {
        this._dropRemote(r, "timeout");
        continue;
      }
      if (t >= r.nextPing) {
        r.pingsSent++;
        r.nextPing = t + (r.pingsSent < FAST_PINGS ? FAST_PING_MS : PING_MS);
        this._sendInternal(
          r,
          "$ping",
          { t: r2(t), l: Math.round(r.loss * 1000) / 1000 },
          false,
        );
      }
      if (r.link.probe) {
        try {
          r.link.probe(t);
        } catch {}
      }
      r.rateHist.push([t, r.bytesOut, r.bytesIn]);
      if (r.rateHist.length > 9) r.rateHist.shift();
      if (t - r.lossT >= 1000) {
        r.lossT = t;
        const exp = r.uMax - r.lossPrevMax,
          got = r.uCount - r.lossPrevCount;
        r.lossPrevMax = r.uMax;
        r.lossPrevCount = r.uCount;
        r.lossHist.push([exp, got]);
        if (r.lossHist.length > 5) r.lossHist.shift();
        let E = 0,
          G = 0;
        for (const [e, g] of r.lossHist) {
          E += e;
          G += g;
        }
        r.loss = E >= 3 ? clamp01(1 - G / E) : 0;
      }
    }
    if (this.role === "host" && t - this._pingsT >= ROSTER_PINGS_MS) {
      this._pingsT = t;
      if (this._remotes.size) {
        const p = {};
        for (const e of this.roster) p[e.id] = e.ping;
        for (const r of this._remotes)
          if (r.admitted) this._sendInternal(r, "$pings", p, true);
        this._emit("pings", this.roster);
      }
    }
  }

  _statsOf(r) {
    if (!r)
      return {
        rtt: 0,
        jitter: 0,
        loss: 0,
        lossOut: 0,
        kbpsUp: 0,
        kbpsDown: 0,
        unreliable: "fallback",
      };
    const h = r.rateHist;
    const a = h[0],
      b = [now(), r.bytesOut, r.bytesIn];
    const dt = Math.max(1, b[0] - a[0]); // ms
    return {
      rtt: r2(r.rtt),
      jitter: r2(r.jitter),
      loss: Math.round(r.loss * 1000) / 1000,
      lossOut: Math.round(r.lossOut * 1000) / 1000,
      kbpsUp: r2(((b[1] - a[1]) * 8) / dt), // bytes/ms × 8 = kbit/s
      kbpsDown: r2(((b[2] - a[2]) * 8) / dt),
      unreliable: r.link.mode,
    };
  }

  // ---- internals: host side ----------------------------------------------------------------------

  _onHello(r, d) {
    if (r.admitted || !r.active) return;
    if (!d || typeof d !== "object" || d.version !== NET_VERSION)
      return this._reject(r, "version");
    if (this._locked) return this._reject(r, "rejected");
    if (this.roster.length >= this.maxPlayers) return this._reject(r, "full");
    const used = new Set(this.roster.map((e) => e.slot));
    let slot = 0;
    while (used.has(slot)) slot++;
    if (slot >= MAX_SLOTS) return this._reject(r, "full");
    const name = this._uniqueName(sanitizeName(d.name));
    const id = "c" + this._nextId++;
    r.id = id;
    r.admitted = true;
    r.entry = { id, name, slot, isHost: false, ping: Math.round(r.rtt) };
    this._byId.set(id, r);
    this.roster.push(r.entry);
    this.roster.sort((a, b) => a.slot - b.slot);
    this._sendInternal(r, "$welcome", {
      selfId: id,
      slot,
      name,
      code: this.code,
      roster: this.roster,
      s: r2(now() - this._t0),
      v: NET_VERSION,
    });
    for (const o of this._remotes)
      if (o !== r && o.admitted)
        this._sendInternal(o, "$roster", { r: this.roster, j: [id] });
    dlog("admitted", id, name, "slot", slot);
    this._emit("join", r.entry);
    this._emit("roster", this.roster.slice());
  }

  _uniqueName(name) {
    const taken = new Set(this.roster.map((e) => e.name.toLowerCase()));
    if (!taken.has(name.toLowerCase())) return name;
    for (let k = 2; k < 100; k++) {
      const suf = ` (${k})`;
      const base = Array.from(name)
        .slice(0, NAME_MAX - suf.length)
        .join("")
        .trimEnd();
      const cand = base + suf;
      if (!taken.has(cand.toLowerCase())) return cand;
    }
    return name;
  }

  _reject(r, code) {
    dlog("rejecting", r.link.key, code);
    this._xmit(
      r,
      JSON.stringify(["$reject", { code, message: ERR_TEXT[code] }]),
      true,
      true,
    );
    this._dropRemote(r, "kicked", 400);
  }

  _kickRemote(r, reason) {
    if (!r.active) return;
    this._xmit(
      r,
      JSON.stringify(["$kick", { reason: String(reason ?? "").slice(0, 120) }]),
      true,
      true,
    );
    this._dropRemote(r, "kicked", 400);
  }

  /** Remove a remote (idempotent). lingerMs keeps the transport open briefly so a final message flushes. */
  _dropRemote(r, reason, lingerMs = 0) {
    if (!r.active) return;
    r.active = false;
    clearTimeout(r.nsTimer);
    this._remotes.delete(r);
    if (r.id && this._byId.get(r.id) === r) this._byId.delete(r.id);
    const closeLink = () => {
      try {
        r.link.close(reason === "timeout" ? "timeout" : undefined);
      } catch {}
    };
    if (lingerMs) setTimeout(closeLink, lingerMs);
    else closeLink();
    if (this.role !== "host" || !r.admitted || !r.entry) return;
    const i = this.roster.indexOf(r.entry);
    if (i >= 0) this.roster.splice(i, 1);
    for (const o of this._remotes)
      if (o.admitted)
        this._sendInternal(o, "$roster", {
          r: this.roster,
          l: [[r.id, reason]],
        });
    dlog("peer left", r.id, reason);
    this._emit("leave", r.entry, reason);
    this._emit("roster", this.roster.slice());
  }

  // ---- internals: client side --------------------------------------------------------------------

  _handshake(link, name, deadline, version) {
    const r = new Remote(link);
    r.id = "h";
    this._remotes.add(r);
    this._hostRemote = r;
    link.onmessage = (raw, rel) => this._onRaw(r, raw, rel);
    link.onclose = (why) => this._onLinkClose(r, why);
    return new Promise((resolve, reject) => {
      const to = setTimeout(
        () => this._joinFail(new NetError("timeout")),
        Math.max(0, deadline - now()),
      );
      this._join = {
        sentAt: now(),
        resolve: () => {
          clearTimeout(to);
          this._join = null;
          resolve();
        },
        reject: (e) => {
          clearTimeout(to);
          this._join = null;
          reject(e);
        },
      };
      this._sendInternal(r, "$hello", { name, version });
    });
  }

  _joinFail(err) {
    const j = this._join;
    if (j) j.reject(err);
  }

  _onWelcome(r, d, t) {
    const j = this._join;
    if (
      !j ||
      this._joined ||
      !d ||
      typeof d !== "object" ||
      typeof d.selfId !== "string"
    )
      return;
    const roster = sanitizeRoster(d.roster);
    if (!roster || !roster.some((e) => e.id === d.selfId)) {
      j.reject(new NetError("network", "Malformed welcome from host."));
      return;
    }
    this.selfId = d.selfId;
    this.roster.length = 0;
    this.roster.push(...roster);
    if (Number.isFinite(d.s))
      this._clockSample(d.s - (j.sentAt + t) / 2, t - j.sentAt);
    this._joined = true;
    j.resolve();
  }

  _onRosterMsg(d) {
    if (!d || typeof d !== "object") return;
    const list = sanitizeRoster(d.r);
    if (!list) return;
    const old = new Map(this.roster.map((e) => [e.id, e]));
    this.roster.length = 0;
    this.roster.push(...list);
    if (Array.isArray(d.l)) {
      for (const x of d.l) {
        if (!Array.isArray(x)) continue;
        const e = old.get(x[0]);
        const reason = ["left", "timeout", "kicked"].includes(x[1])
          ? x[1]
          : "left";
        if (e && e.id !== this.selfId) this._emit("leave", e, reason);
      }
    }
    if (Array.isArray(d.j)) {
      for (const id of d.j) {
        const e = list.find((p) => p.id === id);
        if (e && id !== this.selfId) this._emit("join", e);
      }
    }
    this._emit("roster", this.roster.slice());
  }

  // ---- internals: teardown -----------------------------------------------------------------------

  _sendBye(reason) {
    const bye = JSON.stringify([
      "$bye",
      reason == null ? {} : { reason: String(reason).slice(0, 120) },
    ]);
    for (const r of this._remotes)
      if (r.active) {
        try {
          this._xmit(r, bye, true, true);
        } catch {}
      }
  }

  _pageHide() {
    if (this._closed) return;
    this._sendBye("pagehide");
    this._shutdown("closed", "pagehide", { hide: true });
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
    try {
      globalThis.removeEventListener?.("pagehide", this._onPageHide);
    } catch {}
    for (const r of this._remotes) {
      r.active = false;
      clearTimeout(r.nsTimer);
    }
    const teardown = () => {
      try {
        this._tp.destroy();
      } catch {}
    };
    if (o.hide) {
      try {
        this._tp.hideTeardown();
      } catch {}
    } else if (o.teardownDelay) setTimeout(teardown, o.teardownDelay);
    else teardown();
    if (this._join)
      this._joinFail(new NetError("network", "Connection closed."));
    this._pending.length = 0;
    if (reason) {
      dlog("closed", reason, detail || "");
      this._emit("close", reason, detail);
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
