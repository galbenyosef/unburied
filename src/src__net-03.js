// src__net 03 — host
// Lines 697-960 of readable/src__net.pretty.js (statement-aligned).
class LocalLink {
  constructor(tp, remote) {
    this.tp = tp;
    this.key = remote;
    this.closed = false;
    this.onmessage = null;
    this.onclose = null;
    this._notified = false;
  }
  get mode() {
    return "native";
  }
  send(str, reliable) {
    if (this.closed || !this.tp.bc) return false;
    try {
      this.tp.bc.postMessage({
        k: reliable ? "r" : "u",
        s: this.tp.me,
        d: this.key,
        p: str,
      });
      return true;
    } catch {
      return false;
    }
  }
  /** @param {'timeout'} [why] carried on the 'fin' frame so the far side can tell a timeout from a leave */
  close(why) {
    if (this.closed) return;
    this.closed = true;
    try {
      if (this.tp.bc)
        this.tp.bc.postMessage({
          k: "fin",
          s: this.tp.me,
          d: this.key,
          w: why === "timeout" ? "timeout" : undefined,
        });
    } catch {}
    this._gone("closed");
  }
  _recv(p, rel) {
    if (!this.closed && this.onmessage) this.onmessage(p, rel);
  }
  _gone(why) {
    this.closed = true;
    this.tp.links.delete(this.key);
    this.tp.dead.add(this.key);
    if (this._notified) return;
    this._notified = true;
    try {
      if (this.onclose) this.onclose(why === "timeout" ? "timeout" : "closed");
    } catch (e) {
      warn(e);
    }
  }
}

class LocalTransport {
  constructor() {
    this.kind = "local";
    this.me = "L" + randomToken(10);
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
    if (this.bc) {
      try {
        this.bc.close();
      } catch {}
    }
    this.bc = new BroadcastChannel(LOCAL_PREFIX + code);
    this.bc.onmessage = (e) => {
      try {
        this._onmsg(e.data);
      } catch (err) {
        warn(err);
      }
    };
  }
  async listen(code) {
    this._open(code);
    const taken = await new Promise((res) => {
      this._probe = res;
      this.bc.postMessage({ k: "probe", s: this.me });
      setTimeout(() => res(false), 300);
    });
    this._probe = null;
    if (taken) {
      try {
        this.bc.close();
      } catch {}
      this.bc = null;
      throw new NetError("taken", "room id taken");
    }
    if (this.destroyed) throw new NetError("network", "closed");
    this.isHost = true;
  }
  connect(code, deadline) {
    this._open(code);
    return new Promise((resolve, reject) => {
      let done = false;
      const fin = (err, link) => {
        if (done) return;
        done = true;
        clearInterval(iv);
        clearTimeout(to);
        this._accept = null;
        if (err) reject(err);
        else resolve(link);
      };
      const knock = () => {
        try {
          this.bc && this.bc.postMessage({ k: "conn", s: this.me });
        } catch {}
      };
      const iv = setInterval(knock, 250);
      // No broker round-trip here: a live host answers within a frame, so 2 s of silence = no such room.
      const to = setTimeout(
        () => fin(new NetError("not-found")),
        Math.max(0, Math.min(2000, deadline - now())),
      );
      this._accept = (hostId) => {
        const l = new LocalLink(this, hostId);
        this.links.set(hostId, l);
        fin(null, l);
      };
      knock();
    });
  }
  _onmsg(m) {
    if (!m || typeof m !== "object" || this.destroyed) return;
    switch (m.k) {
      case "probe":
        if (this.isHost) this.bc.postMessage({ k: "here", s: this.me, d: m.s });
        break;
      case "here":
        if (m.d === this.me && this._probe) this._probe(true);
        break;
      case "conn":
        if (!this.isHost || typeof m.s !== "string" || this.dead.has(m.s))
          break;
        if (!this.links.has(m.s)) {
          const l = new LocalLink(this, m.s);
          this.links.set(m.s, l);
          this.bc.postMessage({ k: "acc", s: this.me, d: m.s });
          try {
            if (this.onlink) this.onlink(l);
          } catch (e) {
            warn(e);
          }
        } else this.bc.postMessage({ k: "acc", s: this.me, d: m.s });
        break;
      case "acc":
        if (m.d === this.me && this._accept) this._accept(m.s);
        break;
      case "r":
      case "u":
        if (m.d === this.me) {
          const l = this.links.get(m.s);
          if (l) l._recv(m.p, m.k === "r");
        }
        break;
      case "fin":
        if (m.d === this.me) {
          const l = this.links.get(m.s);
          if (l) l._gone(m.w);
        }
        break;
    }
  }
  hideTeardown() {
    this.destroy();
  }
  destroy() {
    if (this.destroyed) return;
    for (const l of [...this.links.values()]) {
      try {
        l.close();
      } catch {}
    }
    this.destroyed = true;
    this.links.clear();
    try {
      if (this.bc) this.bc.close();
    } catch {}
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
    this.id = null; // roster id ('h' for the host, 'c1', 'c2', … for clients)
    this.entry = null; // roster entry (host side)
    this.admitted = false;
    this.active = true;
    this.createdAt = t;
    this.lastRecv = t;
    this.nextPing = t;
    this.pingsSent = 0;
    this.rtt = 0;
    this.jitter = 0;
    this.lastRtt = 0;
    this.rttN = 0;
    this.uSeqOut = 0;
    this.uMax = 0;
    this.uCount = 0;
    this.lossT = t;
    this.lossPrevMax = 0;
    this.lossPrevCount = 0;
    this.lossHist = [];
    this.loss = 0;
    this.lossOut = 0;
    this.bytesOut = 0;
    this.bytesIn = 0;
    this.msgsOut = 0;
    this.msgsIn = 0;
    this.rateHist = [[t, 0, 0]];
    this.tokens = RATE_BURST;
    this.tokenT = t;
    this.nsRel = [];
    this.nsUnrel = [];
    this.nsLastRel = 0;
    this.nsTimer = 0;
    this.nsDue = Infinity;
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
