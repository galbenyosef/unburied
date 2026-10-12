// src__net 02 — peer
// Lines 372-696 of readable/src__net.pretty.js (statement-aligned).
class PeerLink {
  constructor(conn) {
    this.conn = conn;
    this.key = conn.peer;
    this.dc = null;
    this.uReady = false; // true once a message arrived on the unreliable channel
    this.closed = false;
    this.failed = false;
    this.onmessage = null; // (str, reliable) => void
    this.onclose = null; // (why: 'closed'|'failed'|'timeout') => void
    this._notified = false;
    this._openedAt = 0;
    this._lastProbe = 0;
    conn.on("data", (d) => {
      if (!this.closed && this.onmessage) this.onmessage(d, true);
    });
    conn.on("close", () => this._closedEvt());
    conn.on("error", (e) => {
      dlog("conn error", e && e.type, e && e.message);
      if (e && (e.type === "negotiation-failed" || e.type === "webrtc"))
        this.failed = true;
    });
    conn.on("iceStateChanged", (s) => {
      if (s === "failed") this.failed = true;
    });
  }
  /** 'native' when the true unreliable channel is carrying traffic, else 'fallback' (reliable channel). */
  get mode() {
    return this.uReady && this.dc && this.dc.readyState === "open"
      ? "native"
      : "fallback";
  }

  _opened() {
    this._openedAt = now();
    try {
      const pc = this.conn.peerConnection;
      if (!pc || typeof pc.createDataChannel !== "function") return;
      const dc = pc.createDataChannel("unburied-u", {
        negotiated: true,
        id: U_CHANNEL_ID,
        ordered: false,
        maxRetransmits: 0,
      });
      dc.onmessage = (ev) => {
        this.uReady = true;
        if (!this.closed && this.onmessage) this.onmessage(ev.data, false);
      };
      dc.onclose = () => {
        this.uReady = false;
      };
      dc.onerror = () => {};
      this.dc = dc;
    } catch (e) {
      dlog(
        "unreliable channel unavailable, using reliable fallback",
        e && e.message,
      );
      this.dc = null;
    }
  }

  /** Probe the unreliable channel until the remote has proven it exists on their side too. */
  probe(t) {
    const dc = this.dc;
    if (this.uReady || !dc || dc.readyState !== "open" || this.closed) return;
    if (t - this._openedAt > 20000 || t - this._lastProbe < 250) return;
    this._lastProbe = t;
    try {
      dc.send('["$u",0]');
    } catch {}
  }

  send(str, reliable) {
    if (this.closed) return false;
    try {
      if (!reliable && this.uReady) {
        const dc = this.dc;
        if (dc && dc.readyState === "open") {
          if (dc.bufferedAmount > 256 * 1024) return false; // congested: drop, it's unreliable anyway
          dc.send(str);
          return true;
        }
      }
      if (!this.conn.open) return false;
      this.conn.send(str);
      return true;
    } catch (e) {
      dlog("send failed", e && e.message);
      return false;
    }
  }

  close() {
    if (this.closed) return;
    this.closed = true;
    try {
      if (this.dc) this.dc.close();
    } catch {}
    try {
      this.conn.close();
    } catch {}
    this._closedEvt();
  }

  _closedEvt() {
    this.closed = true;
    if (this._notified) return;
    this._notified = true;
    try {
      if (this.onclose) this.onclose(this.failed ? "failed" : "closed");
    } catch (e) {
      warn(e);
    }
  }
}

class PeerJSTransport {
  constructor() {
    this.kind = "peerjs";
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
    let peer = null,
      lastErr = null;
    while (!peer) {
      if (this.destroyed) throw new NetError("network", "closed");
      const budget = deadline - now();
      if (budget < 1000) break;
      try {
        peer = await openPeer(Peer, PEER_PREFIX + code, Math.min(7000, budget));
      } catch (e) {
        lastErr = e;
        if (!(e instanceof NetError) || e.code !== "broker") throw e;
        dlog("broker attempt failed:", e.message);
      }
    }
    if (!peer) throw lastErr || new NetError("broker");
    if (this.destroyed) {
      try {
        peer.destroy();
      } catch {}
      throw new NetError("network", "closed");
    }
    this.peer = peer;
    this.brokerOnline = true;
    peer.on("open", () => {
      this.brokerOnline = true;
      this._reconnectDelay = 2000;
    });
    // After the room is open, broker trouble must not kill the room: existing links are P2P.
    peer.on("error", (e) =>
      dlog("host peer error", e && e.type, e && e.message),
    );
    peer.on("disconnected", () => {
      this.brokerOnline = false;
      if (this.destroyed) return;
      dlog("broker connection lost; will retry (existing players unaffected)");
      this._scheduleReconnect();
    });
    peer.on("connection", (conn) => this._incoming(conn));
  }

  _scheduleReconnect() {
    if (this.destroyed || this._reconnectTimer) return;
    this._reconnectTimer = setTimeout(() => {
      this._reconnectTimer = 0;
      const p = this.peer;
      if (!p || this.destroyed || p.destroyed) return;
      if (p.disconnected) {
        try {
          p.reconnect();
        } catch {}
        this._reconnectDelay = Math.min(30000, this._reconnectDelay * 2);
        this._scheduleReconnect();
      }
    }, this._reconnectDelay);
  }

  _incoming(conn) {
    if (this.destroyed) {
      try {
        conn.close();
      } catch {}
      return;
    }
    const link = new PeerLink(conn);
    this.links.add(link);
    // a joiner whose ICE never completes must not linger forever
    const openTimer = setTimeout(() => {
      if (!conn.open) link.close();
    }, CONNECT_TIMEOUT_MS + 8000);
    conn.on("close", () => {
      clearTimeout(openTimer);
      this.links.delete(link);
    });
    conn.on("open", () => {
      clearTimeout(openTimer);
      if (this.destroyed) {
        link.close();
        return;
      }
      link._opened();
      try {
        if (this.onlink) this.onlink(link);
      } catch (e) {
        warn(e);
      }
    });
  }

  /** Client: connect to the host's room. Resolves an open PeerLink. */
  async connect(code, deadline) {
    const Peer = await loadPeerJS();
    const left = () => Math.max(0, deadline - now());
    // 1) broker (random id), retrying a stalled handshake while leaving ≥ 3 s for WebRTC
    let peer = null,
      lastErr = null;
    while (!peer) {
      if (this.destroyed) throw new NetError("network", "closed");
      const budget = left() - 3000;
      if (budget < 1000) break;
      try {
        peer = await openPeer(Peer, null, Math.min(5000, budget));
      } catch (e) {
        lastErr = e;
        if (!(e instanceof NetError) || e.code !== "broker") throw e;
        dlog("broker attempt failed:", e.message);
      }
    }
    if (!peer) throw lastErr || new NetError("broker");
    if (this.destroyed) {
      try {
        peer.destroy();
      } catch {}
      throw new NetError("network", "closed");
    }
    this.peer = peer;
    this.brokerOnline = true;
    let settle = null; // current stage's reject
    peer.on("error", (e) => {
      dlog("client peer error", e && e.type, e && e.message);
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
        if (err) reject(err);
        else resolve(link);
      };
      const to = setTimeout(() => fin(new NetError("timeout")), left());
      settle = (err) => fin(err);
      let conn;
      try {
        conn = peer.connect(PEER_PREFIX + code, {
          reliable: true,
          serialization: "raw",
          metadata: { v: NET_VERSION },
        });
      } catch (e) {
        fin(new NetError("network", `${ERR_TEXT.network} (${e.message})`));
        return;
      }
      if (!conn) {
        fin(new NetError("broker"));
        return;
      }
      const link = new PeerLink(conn);
      this.links.add(link);
      conn.on("open", () => {
        link._opened();
        fin(null, link);
      });
      conn.on("close", () => {
        this.links.delete(link);
        fin(new NetError("network"));
      });
      conn.on("error", (e) => {
        if (e && (e.type === "negotiation-failed" || e.type === "webrtc"))
          fin(new NetError("network"));
      });
    });
  }

  /** Called on pagehide: leave sockets for the browser to tear down (so the 'bye' isn't aborted). */
  hideTeardown() {}

  destroy() {
    if (this.destroyed) return;
    this.destroyed = true;
    clearTimeout(this._reconnectTimer);
    for (const l of [...this.links]) {
      try {
        l.close();
      } catch {}
    }
    this.links.clear();
    try {
      if (this.peer) this.peer.destroy();
    } catch {}
    this.peer = null;
  }
}

// ---------------------------------------------------------------------------------------------------
// Local (BroadcastChannel) transport — same-browser multi-tab testing
// ---------------------------------------------------------------------------------------------------

