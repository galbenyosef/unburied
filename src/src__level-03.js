// src__level 03 — math
// Lines 2281-2578 of readable/src__level.pretty.js (statement-aligned).
function buildNav({ colliders, extraStatic, doors, ZDEF }) {
  const X0 = -24.6,
    Z0 = -21.6,
    X1 = 26.6,
    Z1 = 8.6;
  const NX = Math.ceil((X1 - X0) / NAV_RES),
    NZ = Math.ceil((Z1 - Z0) / NAV_RES);
  const code = new Uint8Array(NX * NZ).fill(1);
  const cx = (i) => X0 + (i + 0.5) * NAV_RES,
    cz = (j) => Z0 + (j + 0.5) * NAV_RES;
  // free inside zone rects
  for (const z of ZDEF) {
    const i0 = Math.max(0, Math.floor((z.x0 - X0) / NAV_RES)),
      i1 = Math.min(NX - 1, Math.floor((z.x1 - X0) / NAV_RES));
    const j0 = Math.max(0, Math.floor((z.z0 - Z0) / NAV_RES)),
      j1 = Math.min(NZ - 1, Math.floor((z.z1 - Z0) / NAV_RES));
    for (let j = j0; j <= j1; j++)
      for (let i = i0; i <= i1; i++) {
        const x = cx(i),
          zz = cz(j);
        if (x >= z.x0 && x <= z.x1 && zz >= z.z0 && zz <= z.z1)
          code[i + j * NX] = 0;
      }
  }
  function mark(b, val) {
    if (b.max.y <= 0.3 || b.min.y >= 1.7) return;
    const i0 = Math.max(0, Math.floor((b.min.x - NAV_R - X0) / NAV_RES)),
      i1 = Math.min(NX - 1, Math.floor((b.max.x + NAV_R - X0) / NAV_RES));
    const j0 = Math.max(0, Math.floor((b.min.z - NAV_R - Z0) / NAV_RES)),
      j1 = Math.min(NZ - 1, Math.floor((b.max.z + NAV_R - Z0) / NAV_RES));
    for (let j = j0; j <= j1; j++)
      for (let i = i0; i <= i1; i++) {
        const x = cx(i),
          z = cz(j);
        // rounded expansion: distance from cell centre to box footprint
        const dx = Math.max(b.min.x - x, 0, x - b.max.x),
          dz = Math.max(b.min.z - z, 0, z - b.max.z);
        if (dx * dx + dz * dz > NAV_R * NAV_R) continue;
        const k = i + j * NX;
        if (val === 1) code[k] = 1;
        else if (code[k] === 0) code[k] = val;
      }
  }
  for (const b of colliders) if (b.door === undefined) mark(b, 1);
  for (const b of extraStatic) mark(b, 1);
  for (const b of colliders) if (b.door !== undefined) mark(b, 2 + b.door);

  const codeAt = (x, z) => {
    const i = Math.floor((x - X0) / NAV_RES),
      j = Math.floor((z - Z0) / NAV_RES);
    if (i < 0 || j < 0 || i >= NX || j >= NZ) return 1;
    return code[i + j * NX];
  };
  const walk = (c) =>
    c === 0 || (c >= 2 && doors[c - 2] && doors[c - 2].isOpen);
  // returns -2 if statically blocked, else door index crossed (or -1)
  function scan(ax, az, bx, bz) {
    const dx = bx - ax,
      dz = bz - az,
      L = Math.hypot(dx, dz),
      n = Math.max(1, Math.ceil(L / 0.08));
    let door = -1;
    for (let s = 0; s <= n; s++) {
      const c = codeAt(ax + (dx * s) / n, az + (dz * s) / n);
      if (c === 1) return -2;
      if (c >= 2) door = c - 2;
    }
    return door;
  }
  function clear(ax, az, bx, bz) {
    const tolA = walk(codeAt(ax, az)) ? 0 : 0.55,
      tolB = walk(codeAt(bx, bz)) ? 0 : 0.55;
    const dx = bx - ax,
      dz = bz - az,
      L = Math.hypot(dx, dz),
      n = Math.max(1, Math.ceil(L / 0.08));
    for (let s = 0; s <= n; s++) {
      const d = (L * s) / n;
      if (d < tolA || L - d < tolB) continue;
      if (!walk(codeAt(ax + (dx * s) / n, az + (dz * s) / n))) return false;
    }
    return true;
  }

  // nodes
  const NBX = Math.ceil(NX / NAV_BLOCK),
    NBZ = Math.ceil(NZ / NAV_BLOCK);
  const blockNode = new Int32Array(NBX * NBZ).fill(-1);
  const nx = [],
    nz = [],
    nzone = [];
  for (let bj = 0; bj < NBZ; bj++)
    for (let bi = 0; bi < NBX; bi++) {
      const ci = bi * NAV_BLOCK + 2,
        cj = bj * NAV_BLOCK + 2;
      let best = -1,
        bd = 1e9;
      for (let j = bj * NAV_BLOCK; j < Math.min(NZ, (bj + 1) * NAV_BLOCK); j++)
        for (
          let i = bi * NAV_BLOCK;
          i < Math.min(NX, (bi + 1) * NAV_BLOCK);
          i++
        ) {
          if (code[i + j * NX] === 1) continue;
          const d = (i - ci) ** 2 + (j - cj) ** 2;
          if (d < bd) {
            bd = d;
            best = i + j * NX;
          }
        }
      if (best < 0) continue;
      const i = best % NX,
        j = (best / NX) | 0;
      blockNode[bi + bj * NBX] = nx.length;
      nx.push(cx(i));
      nz.push(cz(j));
      let zid = -1;
      for (const z of ZDEF)
        if (cx(i) >= z.x0 && cx(i) <= z.x1 && cz(j) >= z.z0 && cz(j) <= z.z1) {
          zid = z.id;
          break;
        }
      nzone.push(zid);
    }
  const N = nx.length;
  const adj = Array.from({ length: N }, () => []);
  const edges = [];
  for (let bj = 0; bj < NBZ; bj++)
    for (let bi = 0; bi < NBX; bi++) {
      const a = blockNode[bi + bj * NBX];
      if (a < 0) continue;
      for (const [di, dj] of [
        [1, 0],
        [0, 1],
        [1, 1],
        [-1, 1],
        [2, 0],
        [0, 2],
      ]) {
        const bi2 = bi + di,
          bj2 = bj + dj;
        if (bi2 < 0 || bj2 < 0 || bi2 >= NBX || bj2 >= NBZ) continue;
        const b = blockNode[bi2 + bj2 * NBX];
        if (b < 0) continue;
        // long (2-block) edges only when the intermediate block has no node (bridges thin door gaps)
        if (
          (Math.abs(di) === 2 || Math.abs(dj) === 2) &&
          blockNode[bi + di / 2 + (bj + dj / 2) * NBX] >= 0
        )
          continue;
        const d = scan(nx[a], nz[a], nx[b], nz[b]);
        if (d === -2) continue;
        const cost = Math.hypot(nx[a] - nx[b], nz[a] - nz[b]);
        adj[a].push({ to: b, cost, door: d });
        adj[b].push({ to: a, cost, door: d });
        edges.push([a, b, d]);
      }
    }

  // A*
  const g = new Float32Array(N),
    f = new Float32Array(N),
    came = new Int32Array(N),
    stamp = new Uint32Array(N),
    closed = new Uint32Array(N);
  let gen = 1;
  const heap = [];
  function hpush(n) {
    heap.push(n);
    let i = heap.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (f[heap[p]] <= f[n]) break;
      heap[i] = heap[p];
      i = p;
    }
    heap[i] = n;
  }
  function hpop() {
    const top = heap[0],
      last = heap.pop();
    if (heap.length) {
      let i = 0;
      const n = heap.length;
      while (true) {
        let l = 2 * i + 1,
          r = l + 1,
          m = i;
        if (l < n && f[heap[l]] < f[last]) m = l;
        if (r < n && f[heap[r]] < f[m === i ? last : heap[m]]) m = r;
        if (m === i) break;
        heap[i] = heap[m];
        i = m;
      }
      heap[i] = last;
    }
    return top;
  }
  function nearestNode(x, z) {
    const bi = Math.floor((x - X0) / NAV_RES / NAV_BLOCK),
      bj = Math.floor((z - Z0) / NAV_RES / NAV_BLOCK);
    const cands = [];
    for (let r = 0; r <= 3; r++) {
      for (let dj = -r; dj <= r; dj++)
        for (let di = -r; di <= r; di++) {
          if (Math.max(Math.abs(di), Math.abs(dj)) !== r) continue;
          const i = bi + di,
            j = bj + dj;
          if (i < 0 || j < 0 || i >= NBX || j >= NBZ) continue;
          const n = blockNode[i + j * NBX];
          if (n >= 0 && walk(codeAt(nx[n], nz[n]))) cands.push(n);
        }
      if (cands.length >= 6 && r >= 1) break;
    }
    if (!cands.length) return -1;
    cands.sort(
      (a, b) =>
        (nx[a] - x) ** 2 +
        (nz[a] - z) ** 2 -
        ((nx[b] - x) ** 2 + (nz[b] - z) ** 2),
    );
    for (const n of cands) if (clear(x, z, nx[n], nz[n])) return n;
    return -1;
  }
  function astar(s, t) {
    gen++;
    heap.length = 0;
    g[s] = 0;
    f[s] = Math.hypot(nx[s] - nx[t], nz[s] - nz[t]);
    came[s] = -1;
    stamp[s] = gen;
    hpush(s);
    while (heap.length) {
      const c = hpop();
      if (c === t) break;
      if (closed[c] === gen) continue;
      closed[c] = gen;
      for (const e of adj[c]) {
        if (e.door >= 0 && !doors[e.door].isOpen) continue;
        const ng = g[c] + e.cost;
        if (stamp[e.to] === gen && ng >= g[e.to]) continue;
        stamp[e.to] = gen;
        g[e.to] = ng;
        came[e.to] = c;
        f[e.to] = ng + Math.hypot(nx[e.to] - nx[t], nz[e.to] - nz[t]);
        hpush(e.to);
      }
    }
    if (stamp[t] !== gen) return null;
    const out = [];
    for (let c = t; c !== -1; c = came[c]) out.push(c);
    return out.reverse();
  }
  function findPath(from, to) {
    if (!from || !to) return [];
    const goal = new THREE.Vector3(to.x, 0, to.z);
    if (clear(from.x, from.z, to.x, to.z)) return [goal];
    const s = nearestNode(from.x, from.z),
      t = nearestNode(to.x, to.z);
    if (s < 0 || t < 0) return [];
    const nodes = astar(s, t);
    if (!nodes) return [];
    const pts = [
      { x: from.x, z: from.z },
      ...nodes.map((n) => ({ x: nx[n], z: nz[n] })),
      { x: to.x, z: to.z },
    ];
    // greedy string pulling
    const out = [];
    let i = 0;
    while (i < pts.length - 1) {
      let j = i + 1;
      // look ahead (bounded) for the furthest visible point
      for (let k = Math.min(pts.length - 1, i + 14); k > i + 1; k--)
        if (clear(pts[i].x, pts[i].z, pts[k].x, pts[k].z)) {
          j = k;
          break;
        }
      out.push(new THREE.Vector3(pts[j].x, 0, pts[j].z));
      i = j;
    }
    return out;
  }
  return {
    findPath,
    clear,
    codeAt,
    debug: {
      nodes: nx.map((x, i) => ({ x, z: nz[i], zone: nzone[i] })),
      edges,
      grid: { code, NX, NZ, X0, Z0, res: NAV_RES },
    },
  };
}

// =============================================================================================
// FEATURES: wall buys, perk machines, mystery box, power switch, aether anvil
// =============================================================================================
