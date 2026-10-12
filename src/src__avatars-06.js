// src__avatars 06 — math
// Lines 1437-1706 of readable/src__avatars.pretty.js (statement-aligned).
function buildHead(acc, C, textured) {
  const F = C.face,
    sc = headSculpt(C);
  const skin = srgb(C.skin),
    hair = srgb(C.hair),
    brow = srgb(C.brow);
  const lip = srgb(
    F.lipCol || [C.skin[0] * 0.86, C.skin[1] * 0.6, C.skin[2] * 0.58],
  );
  const stub = mix3(
    skin,
    srgb([C.hair[0] * 0.8, C.hair[1] * 0.8, C.hair[2] * 0.9]),
    0.55,
  );
  const fem = C.female;
  const { g, dirs } = headGrid(56, 42);
  const P = g.attributes.position,
    UV = g.attributes.uv,
    n = P.count;
  const cols = new Array(n),
    p = new V3();
  for (let i = 0; i < n; i++) {
    const d = dirs[i];
    sc(d, p);
    const th = Math.atan2(d.x, d.z),
      ax = Math.abs(p.x);
    const hl = hairLine(th, fem) + (fem ? 0.004 : 0);
    const hw = sstep(hl - 0.004, hl + 0.006, p.y) * sstep(-0.085, -0.07, p.y);
    const thick = fem
      ? lerp(0.008, 0.016, sstep(0.0, 0.08, p.y))
      : lerp(0.0025, 0.0072, sstep(0.02, 0.09, p.y));
    const mus = F.mustache
      ? sstep(0.036, 0.028, ax) *
        bell(p.y, -0.058, -0.053, -0.047, -0.043) *
        sstep(0.05, 0.08, p.z)
      : 0;
    const push = hw * thick + mus * 0.0028;
    p.addScaledVector(d, push);
    P.setXYZ(i, p.x + HC.x, p.y + HC.y, p.z + HC.z);
    UV.setY(i, faceV(p.y));
    if (textured) {
      cols[i] = [1, 1, 1];
      continue;
    }
    // untextured fallback: vertex colours
    let c = mul3(skin, 0.95);
    c = mix3(
      c,
      lip,
      clamp(
        sstep(0.026, 0.017, ax) *
          (bell(p.y, -0.0625, -0.06, -0.053, -0.0505) +
            bell(p.y, -0.078, -0.075, -0.066, -0.0635)) *
          sstep(0.07, 0.09, p.z),
        0,
        1,
      ) * 0.7,
    );
    if (!fem && F.stubble > 0)
      c = mix3(
        c,
        stub,
        sstep(-0.018, -0.034, p.y) * sstep(1.45, 1.2, Math.abs(th)) * F.stubble,
      );
    const browY = 0.0345 + 0.003 * gauss(ax - 0.03, 0.012);
    c = mix3(
      c,
      brow,
      clamp(
        bell(ax, 0.009, 0.016, 0.046, 0.056) *
          gauss(p.y - browY, 0.0034) *
          sstep(0.05, 0.075, p.z) *
          1.4,
        0,
        1,
      ) * 0.9,
    );
    if (mus) c = mix3(c, hair, clamp(mus * 1.3, 0, 1));
    if (hw > 0) c = mix3(c, hair, clamp(hw * 1.2, 0, 1));
    cols[i] = c;
  }
  acc.add("skin", g, { w: B.head, color: (_, __, i) => cols[i], keepUV: true });
  const face = textured ? paintFace(C, sc) : null;

  // ---- eyes + lids
  const iris = srgb(C.iris),
    eyes = [];
  for (const s of [1, -1]) {
    const ex = 0.0318 * F.width * s,
      ey = 0.0128;
    const f = sculptFront(sc, ex, ey);
    const r = 0.0118;
    const ec = new V3(ex, ey, f.p.z - r + 0.0022).add(HC);
    eyes.push(ec.clone());
    const eg = new THREE.SphereGeometry(r, 14, 10);
    const EP = eg.attributes.position,
      ecol = [];
    for (let i = 0; i < EP.count; i++) {
      const v = new V3().fromBufferAttribute(EP, i).normalize();
      const a = Math.acos(clamp(v.z, -1, 1));
      let c;
      if (a < 0.16) c = [0.008, 0.006, 0.006];
      else if (a < 0.45) {
        const ring = sstep(0.36, 0.45, a),
          streak = vnoise(Math.atan2(v.y, v.x) * 9, a * 30, 1, 5);
        const inner = sstep(0.24, 0.16, a);
        c = mix3(mul3(iris, 0.7 + 0.55 * streak), mul3(iris, 0.25), ring);
        c = mix3(c, mul3(iris, 0.45), inner * 0.6);
      } else
        c = mix3(
          [0.6, 0.55, 0.5],
          [0.62, 0.4, 0.37],
          sstep(0.8, 1.35, a) * 0.7,
        );
      c = mul3(
        c,
        1 - 0.55 * sstep(0.12, 0.62, v.y) - 0.15 * sstep(-0.2, -0.6, v.y),
      ); // lid shadow
      ecol.push(c);
    }
    acc.add("skin", eg, {
      m: mT(ec.x, ec.y, ec.z),
      w: B.head,
      color: (_, __, i) => ecol[i],
    });
    // lids: shell around the eyeball with an almond opening
    const lg = new THREE.SphereGeometry(r + 0.0012, 20, 14).toNonIndexed();
    const LP = lg.attributes.position,
      keep = [];
    const lc = new V3();
    for (let t = 0; t < LP.count; t += 3) {
      lc.set(0, 0, 0);
      for (let k = 0; k < 3; k++)
        ((lc.x += LP.getX(t + k) / 3),
          (lc.y += LP.getY(t + k) / 3),
          (lc.z += LP.getZ(t + k) / 3));
      lc.normalize();
      const u = Math.atan2(lc.x * s, lc.z),
        v = Math.asin(lc.y) - 0.05 * u;
      const e = clamp(1 - (u / 0.92) ** 2, 0, 1);
      const open =
        Math.abs(u) < 0.92 &&
        v < 0.3 * Math.pow(e, 0.55) - 0.035 &&
        v > -0.24 * Math.pow(e, 0.75) + 0.01;
      if (lc.z > -0.3 && !open) keep.push(t);
    }
    const pos = [];
    for (const t of keep)
      for (let k = 0; k < 3; k++)
        pos.push(LP.getX(t + k), LP.getY(t + k), LP.getZ(t + k));
    const lid = new THREE.BufferGeometry();
    lid.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    acc.add("skin", lid, {
      m: mT(ec.x, ec.y, ec.z),
      w: B.head,
      seams: false,
      color: (q) => {
        const lq = _v4.copy(q).sub(ec).normalize();
        const u = Math.atan2(lq.x * s, lq.z),
          v = Math.asin(lq.y) - 0.05 * u;
        const e = clamp(1 - (u / 0.92) ** 2, 0, 1);
        const up = v > 0,
          edge = up
            ? sstep(0.12, 0.0, v - (0.3 * Math.pow(e, 0.55) - 0.035))
            : sstep(0.06, 0.0, -0.24 * Math.pow(e, 0.75) + 0.01 - v) * 0.4;
        const crease = up ? gauss(v - 0.62, 0.06) * 0.35 : 0;
        return mix3(
          mix3(mul3(skin, 0.86), mul3(skin, 0.5), crease),
          [0.03, 0.02, 0.018],
          clamp(edge * (C.female ? 1.25 : 0.95), 0, 1),
        );
      },
    });
  }
  // ---- ears
  for (const s of [1, -1]) {
    const eg = new THREE.SphereGeometry(1, 16, 12),
      EP = eg.attributes.position;
    const ry = 0.031 * F.ears,
      rzz = 0.0185 * F.ears;
    for (let i = 0; i < EP.count; i++) {
      let x = EP.getX(i),
        y = EP.getY(i),
        z = EP.getZ(i);
      const rn = Math.hypot(y, z);
      if (x > 0) x -= 0.62 * (1 - sstep(0.55, 0.92, rn)) * x; // concave bowl, thick helix rim
      const lobe = sstep(-0.3, -0.9, y);
      EP.setXYZ(
        i,
        x * 0.0068,
        y * ry * (1 + 0.1 * lobe),
        z * rzz * (1 - 0.25 * lobe),
      );
    }
    const ex = 0.0735 * F.width + 0.0015;
    acc.add("skin", eg, {
      m: mm(
        mT(HC.x + ex * s, HC.y + 0.002, HC.z - 0.009),
        mR(-0.14, s > 0 ? -0.35 : PI + 0.35, 0),
      ),
      w: B.head,
      color: (q) =>
        mix3(skin, [skin[0] * 1.04, skin[1] * 0.82, skin[2] * 0.8], 0.45),
    });
  }
  return { sc, eyes, face };
}

// ---------------------------------------------------------------- painted face texture
function frontLUT(sc) {
  const NU = 90,
    NV = 70,
    pts = [],
    d = new V3();
  for (let j = 0; j < NV; j++)
    for (let i = 0; i < NU; i++) {
      const lon = -1.45 + (2.9 * i) / (NU - 1),
        lat = -1.2 + (2.25 * j) / (NV - 1);
      d.set(
        Math.sin(lon) * Math.cos(lat),
        Math.sin(lat),
        Math.cos(lon) * Math.cos(lat),
      );
      const q = sc(d, new V3());
      pts.push({ lon, lat, x: q.x, y: q.y, z: q.z });
    }
  return (x, y) => {
    let best = pts[0],
      bd = 1e9;
    for (const q of pts) {
      const dd = (q.x - x) ** 2 + (q.y - y) ** 2;
      if (dd < bd && q.z > 0) {
        bd = dd;
        best = q;
      }
    }
    let lon = best.lon,
      lat = best.lat,
      step = 0.01;
    const ev = (lo, la) => {
      d.set(
        Math.sin(lo) * Math.cos(la),
        Math.sin(la),
        Math.cos(lo) * Math.cos(la),
      );
      const q = sc(d, _v6);
      return (q.x - x) ** 2 + (q.y - y) ** 2;
    };
    let cur = ev(lon, lat);
    for (let it = 0; it < 40; it++) {
      let moved = false;
      for (const [a, b] of [
        [step, 0],
        [-step, 0],
        [0, step],
        [0, -step],
      ]) {
        const e = ev(lon + a, lat + b);
        if (e < cur) {
          cur = e;
          lon += a;
          lat += b;
          moved = true;
        }
      }
      if (!moved) step *= 0.5;
    }
    return lon;
  };
}
