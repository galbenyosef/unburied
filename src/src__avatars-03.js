// src__avatars 03 — math
// Lines 614-918 of readable/src__avatars.pretty.js (statement-aligned).
class Acc {
  constructor() {
    this.b = Object.create(null);
    this.tris = 0;
  }
  add(bucket, geo, o = {}) {
    if (!geo.index) {
      const a = [];
      for (let i = 0; i < geo.attributes.position.count; i++) a.push(i);
      geo.setIndex(a);
    }
    let P = geo.attributes.position;
    if (o.pre)
      for (let i = 0; i < P.count; i++) {
        _p.fromBufferAttribute(P, i);
        o.pre(_p, i);
        P.setXYZ(i, _p.x, _p.y, _p.z);
      }
    if (o.m) geo.applyMatrix4(o.m);
    P = geo.attributes.position;
    if (o.post)
      for (let i = 0; i < P.count; i++) {
        _p.fromBufferAttribute(P, i);
        o.post(_p, i);
        P.setXYZ(i, _p.x, _p.y, _p.z);
      }
    if (!o.keepNormals || !geo.attributes.normal) {
      geo.computeVertexNormals();
      if (o.seams !== false) fixSeams(geo);
    }
    if (o.flip) {
      const I = geo.index.array;
      for (let k = 0; k < I.length; k += 3) {
        const t = I[k + 1];
        I[k + 1] = I[k + 2];
        I[k + 2] = t;
      }
      const N = geo.attributes.normal;
      for (let i = 0; i < N.count; i++)
        N.setXYZ(i, -N.getX(i), -N.getY(i), -N.getZ(i));
    }
    const N = geo.attributes.normal,
      UV = geo.attributes.uv;
    const Bk =
      this.b[bucket] ||
      (this.b[bucket] = {
        p: [],
        n: [],
        uv: [],
        c: [],
        si: [],
        sw: [],
        ix: [],
      });
    const base = Bk.p.length / 3,
      us = o.uvScale || 1;
    for (let i = 0; i < P.count; i++) {
      _p.fromBufferAttribute(P, i);
      _n.fromBufferAttribute(N, i);
      Bk.p.push(_p.x, _p.y, _p.z);
      Bk.n.push(_n.x, _n.y, _n.z);
      if (bucket === "skin" && !o.keepUV) Bk.uv.push(UV_WHITE[0], UV_WHITE[1]);
      else if (UV && !o.boxUV) Bk.uv.push(UV.getX(i) * us, UV.getY(i) * us);
      else {
        // tri-planar-ish fallback in metres / TILE
        const ax = Math.abs(_n.x),
          ay = Math.abs(_n.y),
          az = Math.abs(_n.z);
        if (ax > ay && ax > az)
          Bk.uv.push((_p.z / TILE) * us, (_p.y / TILE) * us);
        else if (ay > az) Bk.uv.push((_p.x / TILE) * us, (_p.z / TILE) * us);
        else Bk.uv.push((_p.x / TILE) * us, (_p.y / TILE) * us);
      }
      const c =
        typeof o.color === "function"
          ? o.color(_p, _n, i)
          : o.color || [1, 1, 1];
      Bk.c.push(c[0], c[1], c[2]);
      packW(typeof o.w === "function" ? o.w(_p, i) : (o.w ?? 0), Bk.si, Bk.sw);
    }
    const I = geo.index.array;
    for (let k = 0; k < I.length; k++) Bk.ix.push(base + I[k]);
    this.tris += I.length / 3;
    geo.dispose();
  }
  finish(scale) {
    const out = {};
    for (const k in this.b) {
      const Bk = this.b[k],
        g = new THREE.BufferGeometry();
      const P = new Float32Array(Bk.p);
      if (scale !== 1) for (let i = 0; i < P.length; i++) P[i] *= scale;
      g.setAttribute("position", new THREE.BufferAttribute(P, 3));
      g.setAttribute("normal", new THREE.Float32BufferAttribute(Bk.n, 3));
      g.setAttribute("uv", new THREE.Float32BufferAttribute(Bk.uv, 2));
      g.setAttribute("color", new THREE.Float32BufferAttribute(Bk.c, 3));
      g.setAttribute("skinIndex", new THREE.Uint16BufferAttribute(Bk.si, 4));
      g.setAttribute("skinWeight", new THREE.Float32BufferAttribute(Bk.sw, 4));
      g.setIndex(
        Bk.p.length / 3 > 65535
          ? new THREE.Uint32BufferAttribute(Bk.ix, 1)
          : new THREE.Uint16BufferAttribute(Bk.ix, 1),
      );
      g.computeBoundingBox();
      g.boundingSphere = new THREE.Sphere(
        new V3(0, 0.9 * scale, 0),
        1.35 * scale,
      );
      out[k] = g;
    }
    return out;
  }
}

/**
 * Generic ring loft. ring = { c: V3 centre, ax: V3 (theta = 90° side), az: V3 (theta = 0 "front"),
 *   rx, rz, rzb? (radius toward -az), p? (superellipse exponent, 2 = ellipse), dr?(th) radial add }
 */
function loft(rings, seg, o = {}) {
  const pos = [],
    uv = [],
    idx = [];
  const n = rings.length,
    cols = seg + 1;
  const r0 = rings[Math.min(1, n - 1)];
  const uRep = o.uRep ?? Math.max(1, Math.round((PI * (r0.rx + r0.rz)) / TILE));
  const th0 = o.th0 || 0,
    thSpan = o.thSpan || TAU;
  for (let i = 0; i < n; i++) {
    const R = rings[i],
      e = 2 / (R.p || 2),
      back = R.rzb ?? R.rz;
    for (let j = 0; j <= seg; j++) {
      const th = th0 + (j / seg) * thSpan,
        s = Math.sin(th),
        c = Math.cos(th);
      const dr = R.dr ? R.dr(th) : 0;
      const sx = Math.sign(s) * Math.pow(Math.abs(s), e),
        sz = Math.sign(c) * Math.pow(Math.abs(c), e);
      const rx = R.rx + dr,
        rz = (c >= 0 ? R.rz : back) + dr;
      const ly = R.dy ? R.dy * (1 - c) * 0.5 : 0;
      pos.push(
        R.c.x + R.ax.x * sx * rx + R.az.x * sz * rz,
        R.c.y + R.ax.y * sx * rx + R.az.y * sz * rz + ly,
        R.c.z + R.ax.z * sx * rx + R.az.z * sz * rz,
      );
    }
  }
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
      if (o.flip) idx.push(a, d, b, a, c, d);
      else idx.push(a, b, d, a, d, c);
    }
  const cap = (ri, top) => {
    const R = rings[ri],
      ci = pos.length / 3;
    const pc = o.capPull
      ? R.c.clone().addScaledVector(o.capPull, top ? 1 : -1)
      : R.c;
    pos.push(pc.x, pc.y, pc.z);
    uv.push(0.5, 0.5);
    for (let j = 0; j < seg; j++) {
      const a = ri * cols + j;
      if (top !== !!o.flip) idx.push(ci, a, a + 1);
      else idx.push(ci, a + 1, a);
    }
  };
  if (o.capStart) cap(0, false);
  if (o.capEnd) cap(n - 1, true);
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  return g;
}
/** rings along a straight axis: list of [t, rx, rz, ox?, oz?, p?, rzb?] */
function axisLoft(start, dir, front, list, seg, o = {}) {
  const d = dir.clone().normalize();
  const az = front
    .clone()
    .sub(d.clone().multiplyScalar(front.dot(d)))
    .normalize();
  const ax = new V3().crossVectors(d, az).normalize();
  const rings = list.map((r) => ({
    c: start
      .clone()
      .addScaledVector(d, r[0])
      .addScaledVector(ax, r[3] || 0)
      .addScaledVector(az, r[4] || 0),
    ax,
    az,
    rx: r[1],
    rz: r[2],
    p: r[5] || 2,
    rzb: r[6] ?? r[2],
  }));
  return loft(rings, seg, o);
}
/** insert interpolated rings so consecutive rings are at most maxStep apart (for folds) */
function densify(list, maxStep) {
  const out = [list[0]];
  for (let i = 1; i < list.length; i++) {
    const a = list[i - 1],
      b = list[i],
      n = Math.max(1, Math.ceil(Math.abs(b[0] - a[0]) / maxStep));
    for (let k = 1; k <= n; k++) {
      const t = k / n;
      out.push(
        a.map((v, j) =>
          typeof v === "number" && typeof b[j] === "number"
            ? lerp(v, b[j], t)
            : t < 0.5
              ? v
              : b[j],
        ),
      );
    }
  }
  return out;
}
/** procedural cloth folds: returns radial displacement (m) for a limb/torso parameterisation */
function foldArm(t, th, seed) {
  const inner = 0.5 + 0.5 * Math.cos(th); // elbow crease sits on the front/inner side
  const n = vnoise(t * 40, th * 1.5, seed, 3) - 0.5;
  let d =
    0.0042 *
    gauss(t - 0.29, 0.045) *
    Math.sin(t * 190 + 2.2 * Math.sin(th * 2) + n * 3) *
    (0.35 + 0.65 * inner);
  d += 0.0026 * gauss(t - 0.475, 0.028) * Math.sin(t * 260 + th * 1.5); // cuff bunching
  d +=
    0.0018 *
    Math.sin(t * 70 + th * 3 + n * 4) *
    sstep(0.02, 0.12, t) *
    (1 - sstep(0.22, 0.26, t)); // loose sleeve
  return d;
}
function foldLeg(t, th, seed, blouse) {
  const back = 0.5 - 0.5 * Math.cos(th),
    n = vnoise(t * 30, th * 1.5, seed, 5) - 0.5;
  let d =
    0.0036 *
    gauss(t - 0.46, 0.05) *
    Math.sin(t * 150 + n * 3 + Math.sin(th) * 1.5) *
    (0.3 + 0.7 * back);
  d += 0.0022 * gauss(t - 0.06, 0.05) * Math.sin(t * 110 + th * 2 + n * 3); // hip / crotch pull
  if (blouse > 0)
    d +=
      blouse *
      gauss(t - blouse * 0 - 0.74, 0.05) *
      (0.6 + 0.4 * Math.sin(th * 7 + n * 4));
  d += 0.0014 * Math.sin(t * 45 + th * 2 + n * 5);
  return d;
}
/** tube along a polyline (parallel transport frames); rad = number | (i, u) => r */
function tube(pts, rad, seg = 8, o = {}) {
  const n = pts.length,
    rings = [];
  let prevN = null;
  for (let i = 0; i < n; i++) {
    const t = new V3()
      .subVectors(pts[Math.min(n - 1, i + 1)], pts[Math.max(0, i - 1)])
      .normalize();
    let nn;
    if (!prevN) {
      nn = Math.abs(t.y) < 0.9 ? new V3(0, 1, 0) : new V3(1, 0, 0);
      nn.sub(t.clone().multiplyScalar(nn.dot(t))).normalize();
      if (o.up)
        nn.copy(o.up)
          .sub(t.clone().multiplyScalar(o.up.dot(t)))
          .normalize();
    } else {
      nn = prevN
        .clone()
        .sub(t.clone().multiplyScalar(prevN.dot(t)))
        .normalize();
    }
    prevN = nn;
    const bx = new V3().crossVectors(nn, t).normalize();
    const r = typeof rad === "function" ? rad(i, i / (n - 1)) : rad;
    const rz = o.flat ? r * o.flat : r;
    rings.push({ c: pts[i], ax: bx, az: nn, rx: r, rz, p: o.p || 2 });
  }
  return loft(rings, seg, o);
}
/** flat strap with rectangular section along pts lying on a surface with normals nrm */
