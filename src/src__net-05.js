// src__net 05 — time
// Lines 2165-2274 of readable/src__net.pretty.js (statement-aligned).
export class SnapshotBuffer {
  /** @param {{ maxAge?: number, maxExtrapolate?: number, maxCount?: number }} [opts] seconds */
  constructor({ maxAge = 1.0, maxExtrapolate = 0.1, maxCount = 240 } = {}) {
    this.maxAge = maxAge;
    this.maxExtrapolate = maxExtrapolate;
    this.maxCount = maxCount;
    /** @type {{time:number, state:any}[]} ascending by time */
    this.items = [];
  }
  get length() {
    return this.items.length;
  }
  /** Newest serverTime pushed (or -Infinity). */
  get newestTime() {
    return this.items.length
      ? this.items[this.items.length - 1].time
      : -Infinity;
  }
  /** Newest state (or null). */
  get latest() {
    return this.items.length ? this.items[this.items.length - 1].state : null;
  }
  clear() {
    this.items.length = 0;
  }

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
    if (i > 0 && b[i - 1].time === serverTime) {
      b[i - 1].state = state;
      return true;
    }
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
    if (n === 1 || !(renderTime > b[0].time))
      return { a: b[0].state, b: b[0].state, t: 0, extrapolated: 0 };
    const last = b[n - 1];
    if (renderTime >= last.time) {
      const prev = b[n - 2];
      const span = last.time - prev.time;
      const ex = Math.min(
        renderTime - last.time,
        Math.max(0, this.maxExtrapolate),
      );
      return {
        a: prev.state,
        b: last.state,
        t: span > 1e-6 ? 1 + ex / span : 1,
        extrapolated: ex,
      };
    }
    let lo = 0,
      hi = n - 1; // invariant: b[lo].time < renderTime <= b[hi].time
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (b[mid].time < renderTime) lo = mid;
      else hi = mid;
    }
    const A = b[lo],
      B = b[hi];
    const span = B.time - A.time;
    return {
      a: A.state,
      b: B.state,
      t: span > 1e-9 ? (renderTime - A.time) / span : 1,
      extrapolated: 0,
    };
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
