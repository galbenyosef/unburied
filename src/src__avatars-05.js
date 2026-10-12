// src__avatars 05 — math
// Lines 1234-1436 of readable/src__avatars.pretty.js (statement-aligned).
function headSculpt(C) {
  const F = C.face;
  const rx = 0.0785 * F.width,
    ry = 0.114,
    rz = 0.098;
  const pH = 2.25;
  const e = 2 / pH;
  const noseP = (y) => {
    // nose profile protrusion (m) by height
    const n = F.nose;
    if (y > 0.02) return 0.0015 * sstep(0.036, 0.02, y);
    if (y > -0.027)
      return lerp(0.0015, 0.0275 * n, sstep(0.02, -0.027, y) ** 0.8);
    if (y > -0.049)
      return lerp(0.0275 * n, 0.0035, Math.pow(sstep(-0.027, -0.049, y), 0.7));
    return 0.0035 * sstep(-0.058, -0.049, y);
  };
  const noseW = (y) => lerp(0.005, 0.0086, sstep(0.02, -0.03, y)) * F.noseW;
  return (d, out = new V3()) => {
    const h = Math.hypot(d.x, d.z),
      ph = Math.atan2(d.x, d.z);
    const s = Math.sin(ph),
      c = Math.cos(ph);
    let x = h * rx * Math.sign(s) * Math.pow(Math.abs(s), e);
    let z = h * rz * Math.sign(c) * Math.pow(Math.abs(c), e);
    let y = d.y * ry;
    // cranium fuller at the back-top, flatter crown
    z -= 0.01 * sstep(0.0, -0.08, z) * sstep(-0.04, 0.06, y);
    y -= 0.006 * sstep(0.08, 0.117, y);
    // lower face: longer toward the chin, tapered jaw
    const front = sstep(-0.05, 0.06, z);
    const low = sstep(0.0, -0.105, y);
    if (z > 0) z *= 1 + 0.16 * low * sstep(-0.02, 0.05, z);
    x *= lerp(1, 0.66 * F.jaw, low * front * sstep(-0.04, -0.112, y) * 1.25);
    x *= lerp(1, 0.86, low * (1 - front));
    if (z < 0) z *= lerp(1, 0.62, sstep(-0.03, -0.1, y));
    // facial profile: pull the front of the ellipsoid onto a human face curve (brow, flat mid-face, chin)
    {
      const plane = keyf(y, [
        [-0.122, 0.05],
        [-0.112, 0.068],
        [-0.1, 0.0815],
        [-0.085, 0.0895],
        [-0.06, 0.0932],
        [-0.03, 0.0948],
        [0.0, 0.0955],
        [0.034, 0.097],
        [0.055, 0.09],
        [0.08, 0.078],
      ]);
      const curve = plane - x * x * lerp(6.2, 8.5, sstep(0.0, -0.1, y));
      const m = sstep(0.2, 0.55, d.z) * sstep(0.03, 0.06, curve);
      if (curve > z) z = lerp(z, curve, m);
    }
    // jaw angle + line: full at the gonion, cut in behind/below it so the mandible reads in profile
    x +=
      Math.sign(x) *
      0.0045 *
      F.jaw *
      gauss(y + 0.066, 0.014) *
      gauss(z + 0.0, 0.03);
    const behindJaw = sstep(0.01, -0.03, z) * sstep(-0.06, -0.095, y);
    x *= 1 - 0.14 * behindJaw;
    if (y < -0.085 && z < 0.06)
      y = lerp(y, -0.085 - (y + 0.085) * 0.45, sstep(0.06, 0.0, z) * 0.8);
    // face features (front surface only)
    const fz = sstep(0.035, 0.075, z),
      ax = Math.abs(x);
    let dz = 0;
    dz -=
      0.0115 * gauss(ax - 0.033 * F.width, 0.0135) * gauss(y - 0.013, 0.0095); // eye sockets
    dz += 0.0062 * F.brow * gauss(y - 0.034, 0.0075) * gauss(ax - 0.028, 0.02); // brow ridge
    dz += 0.0045 * gauss(x, 0.013) * gauss(y - 0.031, 0.009); // glabella
    dz += noseP(y) * gauss(x, noseW(y)); // nose
    dz +=
      0.0062 * gauss(ax - 0.0138 * F.noseW, 0.005) * gauss(y + 0.036, 0.0062); // alae
    dz += 0.005 * F.cheek * gauss(ax - 0.046, 0.012) * gauss(y + 0.002, 0.011); // cheekbones
    dz -= 0.0028 * F.age * gauss(ax - 0.04, 0.011) * gauss(y + 0.04, 0.011); // cheek hollow

    dz += 0.0024 * F.lips * gauss(x, 0.0165) * gauss(y + 0.0565, 0.0042); // upper lip
    dz += 0.0028 * F.lips * gauss(x, 0.0155) * gauss(y + 0.0705, 0.0048); // lower lip
    dz -= 0.0032 * gauss(x, 0.02) * gauss(y + 0.0632, 0.0016); // mouth line
    dz -= 0.0022 * gauss(ax - 0.022, 0.0035) * gauss(y + 0.0635, 0.004); // corners
    dz -= 0.0022 * gauss(x, 0.012) * gauss(y + 0.083, 0.005); // under lip
    dz += 0.0062 * F.chin * gauss(x, 0.017) * gauss(y + 0.096, 0.0105); // chin

    z += dz * fz;
    x +=
      Math.sign(x) *
      0.0042 *
      F.cheek *
      gauss(ax - 0.05, 0.012) *
      gauss(y + 0.004, 0.014) *
      fz;
    x -= Math.sign(x) * 0.0042 * gauss(y - 0.03, 0.018) * gauss(z - 0.05, 0.02); // temples
    return out.set(x, y, z);
  };
}
/** surface point of the sculpt nearest to the head-local (x, y) on the front */
function sculptFront(sc, x, y) {
  let best = null,
    bd = 1e9;
  const d = new V3(),
    p = new V3();
  for (let i = 0; i <= 40; i++)
    for (let j = 0; j <= 40; j++) {
      const u = -1.3 + (2.6 * i) / 40,
        v = -1.2 + (2.4 * j) / 40;
      d.set(Math.sin(u) * Math.cos(v), Math.sin(v), Math.cos(u) * Math.cos(v));
      sc(d, p);
      const dd = (p.x - x) ** 2 + (p.y - y) ** 2;
      if (p.z > 0 && dd < bd) {
        bd = dd;
        best = { dir: d.clone(), p: p.clone() };
      }
    }
  // refine
  for (let it = 0; it < 30; it++) {
    for (const [du, dv] of [
      [0.004, 0],
      [-0.004, 0],
      [0, 0.004],
      [0, -0.004],
    ]) {
      const u = Math.atan2(best.dir.x, best.dir.z) + du,
        v = Math.asin(clamp(best.dir.y, -1, 1)) + dv;
      d.set(Math.sin(u) * Math.cos(v), Math.sin(v), Math.cos(u) * Math.cos(v));
      sc(d, p);
      const dd = (p.x - x) ** 2 + (p.y - y) ** 2;
      if (dd < bd) {
        bd = dd;
        best = { dir: d.clone(), p: p.clone() };
      }
    }
  }
  return best;
}

// ---------------------------------------------------------------- head, face, eyes, ears, hair
function hairLine(th, fem = true) {
  return keyf(Math.abs(th), [
    [0, 0.066],
    [0.55, 0.058],
    [0.95, 0.04],
    [1.2, 0.014],
    [1.3, -0.016],
    [1.42, -0.012],
    [1.52, 0.03],
    [1.78, 0.024],
    [2.0, fem ? -0.012 : 0.0],
    [2.5, fem ? -0.05 : -0.026],
    [3.15, fem ? -0.064 : -0.04],
  ]);
}
const FACE_W = 1024,
  FACE_H = 576,
  FACE_V0 = 64 / 576,
  FACE_YMIN = -0.135,
  FACE_YMAX = 0.132;
const faceV = (y) =>
  FACE_V0 +
  ((clamp(y, FACE_YMIN, FACE_YMAX) - FACE_YMIN) / (FACE_YMAX - FACE_YMIN)) *
    (1 - FACE_V0);
const UV_WHITE = [0.5, 0.02];
/** warped UV sphere: more longitude samples on the face, more latitude samples between brow and chin */
function headGrid(nLon, nLat) {
  const pos = [],
    uv = [],
    idx = [],
    dirs = [];
  for (let i = 0; i <= nLat; i++) {
    const t = i / nLat; // 0 top .. 1 bottom
    const w = t + 0.1 * Math.sin(TAU * t) * 0.9; // denser around the middle band
    const lat = PI * (0.5 - clamp(w, 0, 1));
    for (let j = 0; j <= nLon; j++) {
      const q = (j / nLon) * 2 - 1; // -1..1, 0 = front
      const lon = PI * Math.sign(q) * Math.pow(Math.abs(q), 1.28);
      const d = new V3(
        Math.sin(lon) * Math.cos(lat),
        Math.sin(lat),
        Math.cos(lon) * Math.cos(lat),
      );
      dirs.push(d);
      pos.push(d.x, d.y, d.z);
      uv.push(lon / TAU + 0.5, 0);
    }
  }
  const C = nLon + 1;
  for (let i = 0; i < nLat; i++)
    for (let j = 0; j < nLon; j++) {
      const a = i * C + j,
        b = a + 1,
        c = a + C,
        d = c + 1;
      if (i > 0) idx.push(a, c, b);
      if (i < nLat - 1) idx.push(b, c, d);
    }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  return { g, dirs };
}
