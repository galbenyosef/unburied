// src__zombies 02 — math
// Lines 313-661 of readable/src__zombies.pretty.js (statement-aligned).
function loft(rings, seg, o = {}) {
  const pos = [],
    uv = [],
    idx = [];
  const n = rings.length,
    cols = seg + 1;
  const r0 = rings[Math.min(1, n - 1)];
  const uRep = Math.max(1, Math.round((Math.PI * (r0.rx + r0.rz)) / TILE));
  for (let i = 0; i < n; i++) {
    const R = rings[i],
      e = 2 / (R.p || 2),
      cx = R.x || 0,
      cz = R.z || 0,
      back = R.back || 1;
    for (let j = 0; j <= seg; j++) {
      const th = (j / seg) * TAU,
        s = Math.sin(th),
        c = Math.cos(th);
      const dr = R.dr ? R.dr(th) : 0;
      const sx = Math.sign(s) * Math.pow(Math.abs(s), e),
        sz = Math.sign(c) * Math.pow(Math.abs(c), e);
      pos.push(
        cx + sx * (R.rx + dr),
        R.y + (R.dy ? R.dy(th) : 0),
        cz + sz * (R.rz + dr) * (c < 0 ? back : 1),
      );
    }
  }
  // v = true arc length down each column (no stretching where rings differ per angle)
  const vcol = new Float32Array(cols);
  for (let i = 0; i < n; i++)
    for (let j = 0; j <= seg; j++) {
      const k = (i * cols + j) * 3;
      if (i > 0) {
        const q = k - cols * 3;
        vcol[j] += Math.hypot(
          pos[k] - pos[q],
          pos[k + 1] - pos[q + 1],
          pos[k + 2] - pos[q + 2],
        );
      }
      uv.push((j / seg) * uRep, vcol[j] / TILE);
    }
  for (let i = 0; i < n - 1; i++)
    for (let j = 0; j < seg; j++) {
      const a = i * cols + j,
        b = a + 1,
        c = a + cols,
        d = c + 1;
      idx.push(a, b, d, a, d, c);
    }
  const cap = (ri, top) => {
    const R = rings[ri],
      ci = pos.length / 3;
    pos.push(R.x || 0, R.y, R.z || 0);
    uv.push(0.5, top ? vcol[0] / TILE : 0);
    for (let j = 0; j < seg; j++) {
      const a = ri * cols + j;
      top ? idx.push(ci, a, a + 1) : idx.push(ci, a + 1, a);
    }
  };
  if (o.capBottom) cap(0, false);
  if (o.capTop) cap(n - 1, true);
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  return g;
}
// thin strap with rectangular section along points lying on a surface with normals
function ribbon(pts, nrms, w, t) {
  const pos = [],
    idx = [],
    uv = [],
    n = pts.length,
    T = new V3(),
    Bn = new V3();
  const corners = [];
  for (let i = 0; i < n; i++) {
    T.subVectors(
      pts[Math.min(n - 1, i + 1)],
      pts[Math.max(0, i - 1)],
    ).normalize();
    Bn.crossVectors(T, nrms[i]).normalize();
    const P = pts[i],
      N = nrms[i];
    corners.push([
      P.clone()
        .addScaledVector(Bn, w / 2)
        .addScaledVector(N, t),
      P.clone()
        .addScaledVector(Bn, -w / 2)
        .addScaledVector(N, t),
      P.clone().addScaledVector(Bn, -w / 2),
      P.clone().addScaledVector(Bn, w / 2),
    ]);
  }
  let len = 0;
  for (let k = 0; k < 4; k++) {
    const base = pos.length / 3;
    len = 0;
    for (let i = 0; i < n; i++) {
      if (i) len += pts[i].distanceTo(pts[i - 1]);
      const A = corners[i][k],
        B = corners[i][(k + 1) % 4];
      pos.push(A.x, A.y, A.z, B.x, B.y, B.z);
      uv.push(0, len / TILE, w / TILE, len / TILE);
    }
    for (let i = 0; i < n - 1; i++) {
      const A = base + i * 2,
        B = A + 1,
        C = A + 2,
        D = A + 3;
      idx.push(A, C, D, A, D, B);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  return g;
}
function sphere(rx, ry, rz, ws = 12, hs = 9) {
  const g = new THREE.SphereGeometry(1, ws, hs);
  g.scale(rx, ry, rz);
  return g;
}
const M4 = () => new THREE.Matrix4();
const mT = (x, y, z) => new THREE.Matrix4().makeTranslation(x, y, z);
const mR = (x, y, z, order = "XYZ") =>
  new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(x, y, z, order));
const mul = (...ms) => ms.reduce((a, b) => a.multiply(b), new THREE.Matrix4());

// ======================================================================= torso surface
const TORSO = [
  // y, rx, rz, zc
  [0.79, 0.19, 0.152, -0.004],
  [0.84, 0.185, 0.146, -0.004],
  [0.92, 0.178, 0.136, -0.008],
  [1.0, 0.169, 0.124, -0.004],
  [1.06, 0.164, 0.119, 0.0],
  [1.14, 0.169, 0.123, 0.004],
  [1.22, 0.181, 0.131, 0.01],
  [1.3, 0.191, 0.136, 0.016],
  [1.37, 0.197, 0.131, 0.014],
  [1.42, 0.199, 0.121, 0.006],
  [1.46, 0.186, 0.104, 0.0],
  [1.49, 0.152, 0.091, 0.0],
  [1.512, 0.098, 0.079, 0.004],
  [1.528, 0.076, 0.071, 0.008],
  [1.562, 0.07, 0.066, 0.01],
];
const TP = 2.6;
function torsoAt(y) {
  const T = TORSO;
  if (y <= T[0][0]) return T[0];
  for (let i = 1; i < T.length; i++)
    if (y <= T[i][0]) {
      const a = T[i - 1],
        b = T[i],
        t = (y - a[0]) / (b[0] - a[0]);
      return [y, lerp(a[1], b[1], t), lerp(a[2], b[2], t), lerp(a[3], b[3], t)];
    }
  return T[T.length - 1];
}
function sePt(th, rx, rz, p, back = 0.93) {
  const s = Math.sin(th),
    c = Math.cos(th),
    e = 2 / p;
  return [
    Math.sign(s) * Math.pow(Math.abs(s), e) * rx,
    Math.sign(c) * Math.pow(Math.abs(c), e) * rz * (c < 0 ? back : 1),
  ];
}
function torsoSurf(y, th, off = 0) {
  const r = torsoAt(y),
    p = y > 1.5 ? 2.0 : TP;
  const [x, z] = sePt(th, r[1] + off, r[2] + off, p);
  return new V3(x, y, z + r[3]);
}
function torsoNormal(y, th) {
  const e = 0.004,
    a = torsoSurf(y, th - e),
    b = torsoSurf(y, th + e),
    c = torsoSurf(y - e, th),
    d = torsoSurf(y + e, th);
  return new V3().crossVectors(b.sub(a), d.sub(c)).normalize();
}
function surfMatrix(y, th, off, flatUp = true) {
  const n = torsoNormal(y, th);
  if (flatUp) {
    n.y = 0;
    n.normalize();
  }
  const up = new V3(0, 1, 0),
    x = new V3().crossVectors(up, n).normalize(),
    yy = new V3().crossVectors(n, x);
  return new THREE.Matrix4()
    .makeBasis(x, yy, n)
    .setPosition(torsoSurf(y, th, off));
}
function paramOf(x, y, z) {
  const r = torsoAt(y);
  return Math.atan2(x, z - r[3]);
}

// ======================================================================= weights
function torsoW(p, skirt = 0.5) {
  const y = p.y;
  let wh = 0,
    ws = 0,
    wc = 0,
    wn = 0;
  if (y < 1.0) wh = 1;
  else if (y < 1.12) {
    const t = sstep(1.0, 1.12, y);
    wh = 1 - t;
    ws = t;
  } else if (y < 1.24) {
    const t = sstep(1.12, 1.24, y);
    ws = 1 - t;
    wc = t;
  } else if (y < 1.53) wc = 1;
  else {
    const t = sstep(1.53, 1.6, y) * 0.6;
    wc = 1 - t;
    wn = t;
  }
  const L = [
    [0, wh],
    [1, ws],
    [2, wc],
    [3, wn],
  ];
  if (y < 0.92 && skirt > 0) {
    const t = sstep(0.92, 0.5, y) * skirt;
    const a = t * sstep(-0.05, 0.09, p.x),
      b = t * sstep(0.05, -0.09, p.x);
    L[0][1] = Math.max(0, 1 - a - b);
    L.push([12, a], [15, b]);
  }
  return L;
}
function armW(p, s) {
  const sh = SH(s),
    d = ADIR(s),
    ua = s > 0 ? 6 : 9;
  const t = (p.x - sh.x) * d.x + (p.y - sh.y) * d.y + (p.z - sh.z) * d.z;
  if (t < 0.245) return ua;
  if (t > 0.345) return ua + 1;
  return [ua, ua + 1, sstep(0.245, 0.345, t)];
}
function legW(p, s) {
  const th = s > 0 ? 12 : 15,
    d = 0.93 - p.y;
  if (d < 0.36) return th;
  if (d > 0.5) return th + 1;
  return [th, th + 1, sstep(0.36, 0.5, d)];
}
function footW(p, s) {
  const sh = s > 0 ? 13 : 16;
  if (p.y > 0.125) return sh;
  if (p.y < 0.075 || p.z > 0.06) return sh + 1;
  return [sh + 1, sh, sstep(0.075, 0.125, p.y)];
}
function neckW(p) {
  const y = p.y;
  if (y < 1.485) return 2;
  if (y < 1.53) return [2, 3, sstep(1.485, 1.53, y)];
  if (y < 1.592) return 3;
  if (y < 1.635) return [3, 4, sstep(1.592, 1.635, y)];
  return 4;
}

// ======================================================================= variants
const VARIANTS = [
  {
    name: "Grenadier",
    helmetP: 1.0,
    hair: "short",
    sleeves: { L: "full", R: "full" },
    ribs: false,
    wounds: [{ y: 1.08, th: -0.55, hy: 0.035, hth: 0.22 }],
    gear: { ystraps: true, pouches: true, breadbag: true, canteen: true },
    pockets: true,
    jaw: 0.05,
    weight: 1.2,
  },
  {
    name: "Rotter",
    helmetP: 0.15,
    hair: "patchy",
    sleeves: { L: "ripped", R: "ripped" },
    ribs: true,
    wounds: [],
    gear: { pouches: false, canteen: true },
    pockets: false,
    tunicHem: 0.06,
    jaw: 0.12,
    weight: 1.0,
  },
  {
    name: "Amputee",
    helmetP: 0.9,
    hair: "short",
    missing: "L",
    sleeves: { L: "none", R: "ripped" },
    ribs: false,
    wounds: [{ y: 1.1, th: 0.25, hy: 0.06, hth: 0.42 }],
    gear: { ystraps: true, pouches: true },
    pockets: true,
    jaw: 0.3,
    weight: 0.9,
  },
  {
    name: "Gasser",
    helmetP: 0.0,
    hair: "bald",
    tornCheek: 1,
    sleeves: { L: "ripped", R: "full" },
    ribs: false,
    wounds: [{ y: 1.2, th: -0.95, hy: 0.05, hth: 0.3 }],
    gear: { pouches: true, gasmask: true, breadbag: true },
    pockets: true,
    jaw: 0.18,
    weight: 1.0,
  },
  {
    name: "Greatcoat",
    helmetP: 0.85,
    hair: "short",
    greatcoat: true,
    sleeves: { L: "full", R: "full" },
    ribs: false,
    wounds: [],
    gear: { pouches: true, ystraps: false },
    pockets: false,
    jaw: 0.08,
    weight: 0.8,
  },
];

// ---------- colour helpers
const mulc = (a, b) => [a[0] * b[0], a[1] * b[1], a[2] * b[2]];
const mix3 = (a, b, t) => [
  lerp(a[0], b[0], t),
  lerp(a[1], b[1], t),
  lerp(a[2], b[2], t),
];
