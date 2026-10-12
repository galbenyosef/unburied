// src__zombies 04 — math
// Lines 679-1798 of readable/src__zombies.pretty.js (statement-aligned).
function buildVariant(vi) {
  const cfg = VARIANTS[vi];
  const rnd = rng(9173 + vi * 7919),
    seed = 11 + vi * 31;
  const A = new Acc();
  const coat = !!cfg.greatcoat;
  const skinC = skinColor(seed);

  // ---------------------------------------------------------------- tunic / greatcoat
  const strips = [];
  for (let i = 0; i < 5; i++)
    strips.push({
      a: rnd() * TAU,
      w: 0.08 + rnd() * 0.16,
      d: 0.03 + rnd() * 0.06,
    });
  const hemDy = (th) => {
    let d =
      -(cfg.tunicHem || 0.035) *
      fbm(Math.cos(th) * 3 + 7, Math.sin(th) * 3, 0.5, seed, 3) *
      1.6;
    d -= 0.012 * vnoise(th * 9, 0, 0, seed + 3);
    for (const s of strips)
      d -= s.d * Math.max(0, 1 - Math.abs(angDiff(th, s.a)) / s.w);
    return d;
  };
  const off = coat ? 0.012 : 0;
  const holes0 = (cfg.wounds && cfg.wounds.length) || cfg.ribs;
  const holeYs = (cfg.wounds || []).map((w) => [
    w.y - w.hy * 1.6,
    w.y + w.hy * 1.6,
  ]);
  if (cfg.ribs) holeYs.push([1.27 - 0.12 * 1.5, 1.27 + 0.12 * 1.5]);
  const rings = [];
  if (coat) {
    rings.push(
      { y: 0.4, rx: 0.245, rz: 0.215, z: -0.01, p: 2.2, dy: hemDy },
      { y: 0.5, rx: 0.232, rz: 0.2, z: -0.01, p: 2.3 },
      { y: 0.62, rx: 0.218, rz: 0.184, z: -0.008, p: 2.4 },
      { y: 0.72, rx: 0.206, rz: 0.17, z: -0.006, p: 2.5 },
    );
  }
  // torso rings, subdivided finely through the chest/abdomen so torn holes get ragged edges
  const tys = [];
  TORSO.forEach((r, i) => {
    if (coat && i === 0) return;
    if (tys.length) {
      const y0 = tys[tys.length - 1],
        y1 = r[0];
      const near = holeYs.some(([a, b]) => y1 > a && y0 < b);
      const n = near ? Math.ceil((y1 - y0) / 0.022) : 1;
      for (let k = 1; k < n; k++) tys.push(lerp(y0, y1, k / n));
    }
    tys.push(r[0]);
  });
  tys.forEach((y, i) => {
    const r = torsoAt(y);
    const R = {
      y,
      rx: r[1] + off,
      rz: r[2] + off,
      z: r[3],
      p: y > 1.5 ? 2.0 : TP,
      back: 0.93,
    };
    if (i === 0 && !coat) R.dy = hemDy;
    if (y > 1.51) {
      R.rx += coat ? 0.02 : 0;
      R.rz += coat ? 0.018 : 0;
    }
    rings.push(R);
  });
  const holes = [];
  for (const w of cfg.wounds || []) holes.push({ ...w, j: 0.85 });
  if (cfg.ribs) holes.push({ y: 1.27, th: 0.33, hy: 0.12, hth: 0.55, j: 0.75 });
  const inHole = (x, y, z, scale = 1) => {
    const th = paramOf(x, y, z);
    for (const h of holes) {
      const u = (y - h.y) / (h.hy * scale),
        v = angDiff(th, h.th) / (h.hth * scale);
      const jag = 1 + h.j * (fbm(th * 11, y * 55, 0, seed + 9, 3) - 0.5) * 2;
      if (u * u + v * v < jag) return true;
    }
    return false;
  };
  const clothC = (p, n) => {
    let c = [1, 1, 1];
    const g = fbm(p.x * 9, p.y * 9, p.z * 9, seed + 1, 3);
    c = mulc(c, [0.82 + 0.3 * g, 0.82 + 0.3 * g, 0.82 + 0.3 * g]);
    c = mulc(c, [
      lerp(0.55, 1, sstep(0.5, 1.0, p.y)),
      lerp(0.55, 1, sstep(0.5, 1.0, p.y)),
      lerp(0.5, 1, sstep(0.5, 1.0, p.y)),
    ]);
    const bl = fbm(p.x * 6 + 11, p.y * 6, p.z * 6, seed + 2, 3);
    if (bl > 0.66)
      c = mix3(c, mulc(c, BLOODSTAIN), sstep(0.66, 0.78, bl) * 0.7);
    if (p.y > 1.525) c = mulc(c, [0.62, 0.7, 0.62]); // dark green collar
    if (holes.length)
      for (const h of holes) {
        // blood around wounds
        const th = paramOf(p.x, p.y, p.z);
        const u = (p.y - h.y) / (h.hy * 2.2),
          v = angDiff(th, h.th) / (h.hth * 2.2);
        const k = 1 - clamp(u * u + v * v, 0, 1);
        if (k > 0) c = mix3(c, mulc(c, [0.42, 0.16, 0.13]), k * 0.9);
      }
    return c;
  };
  A.add("cloth", loft(rings, holes0 ? 64 : 44, {}), {
    w: (p) => torsoW(p, coat ? 0.75 : 0.5),
    color: clothC,
    noise: 0.004,
    freq: 22,
    seed,
    cut: holes.length ? (x, y, z) => inHole(x, y, z) : null,
  });
  // coat: skirt split at front + double-breasted buttons + wide lapels suggested by colour
  // gore / cavity patches behind holes
  const patch = (h, depth, scaleOut, bucket, color, cut) => {
    const rows = 20,
      cols = 26,
      pos = [],
      idx = [],
      uv = [];
    for (let i = 0; i <= rows; i++)
      for (let j = 0; j <= cols; j++) {
        const v = -1 + (2 * i) / rows,
          u = -1 + (2 * j) / cols;
        const y = h.y + v * h.hy * scaleOut,
          th = h.th + u * h.hth * scaleOut;
        const r2 = u * u + v * v;
        const P = torsoSurf(
          y,
          th,
          -(0.004 + off * 0) - depth * Math.max(0, 1 - r2),
        );
        pos.push(P.x, P.y, P.z);
        uv.push(j / cols, i / rows);
      }
    for (let i = 0; i < rows; i++)
      for (let j = 0; j < cols; j++) {
        const a = i * (cols + 1) + j,
          b = a + 1,
          c = a + cols + 1,
          d = c + 1;
        idx.push(a, b, d, a, d, c);
      }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    A.add(bucket, g, {
      w: (p) => torsoW(p, 0),
      color,
      noise: 0.004,
      freq: 60,
      seed: seed + 4,
      cut,
    });
  };
  for (const w of cfg.wounds || []) {
    patch({ ...w }, 0.03, 1.6, "flesh", (p) => {
      const th = paramOf(p.x, p.y, p.z);
      const r = Math.hypot((p.y - w.y) / w.hy, angDiff(th, w.th) / w.hth);
      return mix3(
        mix3(GORE, GORE_DK, fbm(p.x * 60, p.y * 60, p.z * 60, seed, 2)),
        [0.02, 0.005, 0.005],
        1 - sstep(0.0, 0.8, r),
      );
    });
  }
  if (cfg.ribs) {
    const H = { y: 1.27, th: 0.33, hy: 0.12, hth: 0.55 };
    // rotten skin rim between torn cloth and cavity
    patch(
      H,
      0.006,
      1.3,
      "skin",
      (p) => mulc(skinC(p), [0.8, 0.72, 0.7]),
      (x, y, z) => inHole(x, y, z, 0.72),
    );
    // deep cavity
    patch(H, 0.045, 1.0, "flesh", (p) =>
      mix3(
        [0.02, 0.005, 0.005],
        GORE,
        fbm(p.x * 50, p.y * 50, p.z * 50, seed + 3, 2) * 0.7,
      ),
    );
    // ribs sloping down toward the sternum
    for (let k = 0; k < 5; k++) {
      const y0 = 1.165 + k * 0.047,
        pts = [];
      for (let i = 0; i <= 14; i++) {
        const th = -0.3 + (i / 14) * 1.35;
        const y = y0 + 0.035 * Math.min(1, Math.abs(th - 0.05) / 0.9) - 0.01;
        pts.push(torsoSurf(y, th, -0.012));
      }
      const tg = new THREE.TubeGeometry(
        new THREE.CatmullRomCurve3(pts),
        18,
        0.0062,
        5,
        false,
      );
      A.add("flesh", tg, {
        w: (p) => torsoW(p, 0),
        color: (p) => {
          const g = fbm(p.x * 90, p.y * 90, p.z * 90, seed, 2);
          return mulc(BONEC, [0.36 + 0.25 * g, 0.28 + 0.2 * g, 0.2 + 0.15 * g]);
        },
      });
    }
    const st = [];
    for (let i = 0; i <= 6; i++)
      st.push(torsoSurf(1.15 + i * 0.04, 0.05, -0.01));
    A.add(
      "flesh",
      new THREE.TubeGeometry(
        new THREE.CatmullRomCurve3(st),
        8,
        0.0075,
        5,
        false,
      ),
      { w: (p) => torsoW(p, 0), color: mulc(BONEC, [0.32, 0.25, 0.2]) },
    );
  }
  // buttons (plain, no insignia)
  const btn = (y, th) =>
    A.add("gear", sphere(0.0075, 0.0075, 0.004, 6, 4), {
      m: surfMatrix(y, th, off + 0.003, false),
      w: (p) => torsoW(p, 0),
      color: [0.55, 0.55, 0.5],
    });
  if (coat) {
    for (let i = 0; i < 6; i++) {
      const y = 1.02 + Math.floor(i / 2) * 0.12;
      btn(y, i % 2 ? 0.28 : -0.28);
    }
  } else
    for (let i = 0; i < 5; i++) {
      const y = 1.13 + i * 0.085;
      if (!inHole(0, y, torsoSurf(y, 0).z)) btn(y, 0.0);
    }
  if (cfg.pockets && !coat)
    for (const s of [1, -1]) {
      const th = 0.52 * s;
      if (inHole(torsoSurf(1.3, th).x, 1.3, torsoSurf(1.3, th).z, 1.6))
        continue;
      A.add("cloth", new THREE.BoxGeometry(0.11, 0.038, 0.012), {
        m: surfMatrix(1.355, th, 0.006),
        w: (p) => torsoW(p, 0),
        color: (p, n) => mulc(clothC(p, n), [0.85, 0.85, 0.85]),
        flat: true,
      });
      A.add("cloth", new THREE.BoxGeometry(0.1, 0.11, 0.006), {
        m: surfMatrix(1.29, th, 0.002),
        w: (p) => torsoW(p, 0),
        color: (p, n) => mulc(clothC(p, n), [0.95, 0.95, 0.95]),
        flat: true,
      });
      btn(1.35, th);
    }
  // shoulder boards (plain)
  for (const s of [1, -1]) {
    A.add("cloth", new THREE.BoxGeometry(0.12, 0.01, 0.048), {
      m: mul(mT(0.125 * s, 1.487, 0.0), mR(0, 0, -0.32 * s)),
      w: 2,
      color: [0.62, 0.7, 0.62],
      flat: true,
    });
  }

  // ---------------------------------------------------------------- belt & webbing
  const beltY0 = 1.005,
    beltY1 = 1.055;
  const bt = (y, extra) => {
    const r = torsoAt(y);
    return {
      y,
      rx: r[1] + off + extra,
      rz: r[2] + off + extra,
      z: r[3],
      p: TP,
      back: 0.93,
    };
  };
  A.add(
    "gear",
    loft(
      [
        bt(beltY0, 0.002),
        bt(beltY0, 0.009),
        bt(beltY1, 0.009),
        bt(beltY1, 0.002),
      ],
      40,
      {},
    ),
    { w: (p) => torsoW(p, 0), color: [0.34, 0.32, 0.31] },
  );
  A.add("gear", new THREE.BoxGeometry(0.055, 0.044, 0.01), {
    m: surfMatrix(1.03, 0, off + 0.012),
    w: (p) => torsoW(p, 0),
    color: [1.1, 1.08, 1.0],
    flat: true,
  });
  const G = cfg.gear || {};
  if (G.pouches)
    for (const s of [1, -1])
      for (let k = 0; k < 3; k++) {
        const th = (0.3 + k * 0.27) * s,
          M = surfMatrix(1.0, th, off + 0.026);
        const tilt = (rnd() - 0.5) * 0.12;
        A.add("gear", new THREE.BoxGeometry(0.046, 0.074, 0.034), {
          m: mul(M, mR(0, 0, tilt)),
          w: (p) => torsoW(p, 0),
          color: [0.36, 0.3, 0.27],
          flat: true,
        });
        A.add("gear", new THREE.BoxGeometry(0.05, 0.028, 0.038), {
          m: mul(M, mR(0, 0, tilt), mT(0, 0.026, 0.002)),
          w: (p) => torsoW(p, 0),
          color: [0.3, 0.26, 0.23],
          flat: true,
        });
      }
  if (G.ystraps && !coat) {
    const addStrap = (path) => {
      const pts = [],
        nrm = [];
      for (let i = 0; i < path.length - 1; i++)
        for (let k = 0; k < 4; k++) {
          const t = k / 4,
            y = lerp(path[i][0], path[i + 1][0], t),
            th = lerp(path[i][1], path[i + 1][1], t);
          pts.push(torsoSurf(y, th, off + 0.004));
          nrm.push(torsoNormal(y, th));
        }
      const L = path[path.length - 1];
      pts.push(torsoSurf(L[0], L[1], off + 0.004));
      nrm.push(torsoNormal(L[0], L[1]));
      A.add("gear", ribbon(pts, nrm, 0.032, 0.006), {
        w: (p) => torsoW(p, 0),
        color: [0.4, 0.34, 0.3],
        flat: false,
      });
    };
    for (const s of [1, -1])
      addStrap([
        [1.05, 0.42 * s],
        [1.3, 0.5 * s],
        [1.43, 0.72 * s],
        [1.485, 1.25 * s],
        [1.49, 1.75 * s],
        [1.43, 2.35 * s],
        [1.3, 2.85 * s],
        [1.26, Math.PI * s],
      ]);
    addStrap([
      [1.27, Math.PI - 0.001],
      [1.04, Math.PI - 0.001],
    ]);
    A.add("gear", new THREE.TorusGeometry(0.014, 0.004, 4, 10), {
      m: surfMatrix(1.265, Math.PI - 0.001, 0.006),
      w: 2,
      color: [0.9, 0.9, 0.85],
    });
  }
  if (G.breadbag) {
    const M = surfMatrix(0.92, -2.25, off + 0.04);
    A.add("cloth", new THREE.BoxGeometry(0.2, 0.16, 0.06, 3, 3, 2), {
      m: mul(M, mR(0.08, 0, 0.05)),
      w: 0,
      color: [1.2, 1.08, 0.82],
      noise: 0.004,
      freq: 40,
      seed,
    });
    A.add("cloth", new THREE.BoxGeometry(0.205, 0.07, 0.066), {
      m: mul(M, mR(0.08, 0, 0.05), mT(0, 0.05, 0.003)),
      w: 0,
      color: [1.05, 0.95, 0.72],
      flat: true,
    });
  }
  if (G.canteen) {
    const M = surfMatrix(0.95, 2.35, off + 0.035);
    A.add("gear", new THREE.CylinderGeometry(0.045, 0.047, 0.17, 12), {
      m: mul(M, mR(0, 0, -0.1), new THREE.Matrix4().makeScale(1, 1, 0.62)),
      w: 0,
      color: [0.62, 0.5, 0.36],
    });
    A.add("gear", new THREE.CylinderGeometry(0.02, 0.02, 0.03, 8), {
      m: mul(M, mR(0, 0, -0.1), mT(0, 0.1, 0)),
      w: 0,
      color: [0.3, 0.3, 0.3],
    });
  }
  if (G.gasmask) {
    const M = surfMatrix(0.98, -2.75, off + 0.055);
    const cg = new THREE.CylinderGeometry(0.052, 0.052, 0.27, 14, 9);
    A.add("gear", cg, {
      m: mul(M, mR(0, 0, 0.18)),
      w: 0,
      color: (p) => {
        const k = Math.sin(p.y * 190) > 0.55 ? 0.62 : 1;
        return [0.62 * k, 0.68 * k, 0.56 * k];
      },
    });
  }

  // ---------------------------------------------------------------- trousers, boots, crotch
  A.add("cloth", sphere(0.16, 0.1, 0.125, 16, 10), {
    m: mT(0, 0.905, -0.012),
    w: 0,
    color: [0.78, 0.8, 0.76],
  });
  for (const s of [1, -1]) {
    const hx = HIPX * s;
    const R = (d, rx, rz, z = 0) => ({ y: -d, rx, rz, z, p: 2.0 });
    const tr = [
      R(0.535, 0.054, 0.058, -0.002),
      R(0.48, 0.056, 0.06, 0.0),
      R(0.43, 0.059, 0.063, 0.004),
      R(0.36, 0.068, 0.07, 0.006),
      R(0.28, 0.079, 0.081, 0.008),
      R(0.18, 0.087, 0.089, 0.01),
      R(0.08, 0.087, 0.092, 0.008),
      R(0.0, 0.086, 0.092, 0.0),
      R(-0.09, 0.08, 0.09, -0.004),
    ];
    const tc = (p) => {
      const g = fbm(p.x * 10, p.y * 10, p.z * 10, seed + 7, 3);
      let c = [0.74 + 0.3 * g, 0.76 + 0.3 * g, 0.72 + 0.28 * g];
      c = mulc(c, [
        lerp(0.55, 1, sstep(0.35, 0.8, p.y)),
        lerp(0.52, 1, sstep(0.35, 0.8, p.y)),
        lerp(0.48, 1, sstep(0.35, 0.8, p.y)),
      ]);
      const kn = Math.exp(-((p.y - 0.5) ** 2) / 0.004) * (p.z > 0 ? 1 : 0.3);
      c = mulc(c, [1 - 0.35 * kn, 1 - 0.38 * kn, 1 - 0.4 * kn]);
      return c;
    };
    A.add("cloth", loft(tr, 20, { capTop: true }), {
      m: mT(hx, 0.93, 0),
      w: (p) => legW(p, s),
      color: tc,
      noise: 0.004,
      freq: 25,
      seed: seed + s,
    });
    // jackboot shaft
    const B = (y, rx, rz, z = 0) => ({ y, rx, rz, z, p: 2.0 });
    const boot = [
      B(0.07, 0.05, 0.056, 0.004),
      B(0.11, 0.049, 0.054),
      B(0.17, 0.053, 0.057),
      B(0.25, 0.058, 0.062),
      B(0.34, 0.062, 0.066),
      B(0.43, 0.064, 0.068),
      B(0.475, 0.066, 0.07),
      B(0.482, 0.058, 0.062),
    ];
    const bc = (p) => {
      const g = fbm(p.x * 20, p.y * 20, p.z * 20, seed + 8, 3);
      const k = 0.3 + 0.16 * g;
      const mud = sstep(0.22, 0.04, p.y);
      return mix3([k * 0.55, k * 0.6, k * 0.7], [0.5, 0.42, 0.3], mud * 0.6);
    };
    A.add("gear", loft(boot, 18, {}), {
      m: mT(hx, 0, 0),
      w: (p) => footW(p, s),
      color: bc,
      noise: 0.0025,
      freq: 30,
      seed,
    });
    // foot (sculpted ellipsoid, flat sole)
    const fg = new THREE.SphereGeometry(1, 16, 10);
    A.add("gear", fg, {
      w: (p) => footW(p, s),
      color: (p) => (p.y < 0.022 ? [0.16, 0.14, 0.12] : bc(p)),
      post: (v) => {
        let x = v.x * 0.046,
          y = v.y * 0.05,
          z = v.z * 0.13;
        const t = sstep(-0.03, 0.13, z);
        x *= 1 - 0.3 * t;
        if (y > 0) y *= 1 - 0.5 * t;
        v.set(hx * 1.02 + x, Math.max(0.0, y + 0.045), 0.052 + z);
      },
    });
  }

  // ---------------------------------------------------------------- arms & hands
  const buildHand = (s) => {
    const M0 = mul(
      mT(
        BONE_POS[s > 0 ? 8 : 11].x,
        BONE_POS[s > 0 ? 8 : 11].y,
        BONE_POS[s > 0 ? 8 : 11].z,
      ),
      mR(0, 0, ARM_TILT * s),
    );
    const hb = s > 0 ? 8 : 11;
    const hcol = (p) => mulc(skinC(p), [0.85, 0.85, 0.85]);
    A.add("skin", sphere(0.017, 0.048, 0.04, 12, 10), {
      m: mul(M0.clone(), mT(0, -0.047, 0.004)),
      w: hb,
      color: hcol,
      noise: 0.002,
      freq: 60,
      seed,
    });
    const zs = [0.026, 0.0095, -0.0075, -0.024],
      lens = [
        [0.04, 0.026, 0.02],
        [0.045, 0.028, 0.021],
        [0.042, 0.026, 0.02],
        [0.033, 0.021, 0.017],
      ];
    for (let k = 0; k < 4; k++) {
      let M = mul(M0.clone(), mT(0, -0.084, zs[k]), mR(0, 0, 0, "XYZ"));
      const claw = 0.8 + rnd() * 0.5;
      const radii = [0.0082, 0.0072, 0.0062];
      for (let j = 0; j < 3; j++) {
        M = M.multiply(
          mR((rnd() - 0.5) * 0.12, 0, -[0.38, 0.55, 0.45][j] * claw * s),
        );
        const L = lens[k][j];
        const cg = new THREE.CapsuleGeometry(radii[j], L, 1, 5);
        cg.translate(0, -L / 2, 0);
        A.add("skin", cg, {
          m: M.clone(),
          w: hb,
          color: (p) =>
            mulc(hcol(p), [0.7 - j * 0.1, 0.66 - j * 0.1, 0.62 - j * 0.1]),
        });
        M = M.multiply(mT(0, -L, 0));
      }
      const nail = new THREE.ConeGeometry(0.0048, 0.014, 5);
      nail.rotateX(Math.PI);
      nail.translate(0, -0.004, 0.0);
      A.add("flesh", nail, {
        m: mul(M.clone(), mR(0, 0, -0.3 * s)),
        w: hb,
        color: [0.42, 0.36, 0.22],
      });
    }
    // thumb
    let M = mul(
      M0.clone(),
      mT(-0.004 * s, -0.028, 0.034),
      mR(-0.75, 0, -0.35 * s),
    );
    for (let j = 0; j < 2; j++) {
      const L = [0.036, 0.028][j];
      const cg = new THREE.CapsuleGeometry([0.0095, 0.008][j], L, 1, 5);
      cg.translate(0, -L / 2, 0);
      A.add("skin", cg, { m: M.clone(), w: hb, color: hcol });
      M = M.multiply(mT(0, -L, 0)).multiply(mR(0, 0, -0.45 * s));
    }
  };
  for (const s of [1, -1]) {
    const side = s > 0 ? "L" : "R";
    const sl = cfg.sleeves[side];
    const sh = SH(s),
      MA = mul(mT(sh.x, sh.y, sh.z), mR(0, 0, ARM_TILT * s));
    const aw = (p) => armW(p, s);
    const R = (d, r, rz = r, z = 0, dy) => ({
      y: -d,
      rx: r,
      rz,
      z,
      p: 2.0,
      dy,
    });
    if (cfg.missing === side) {
      // torn stump: short ragged sleeve, gore cap, bone jutting out
      const jag = (th) => 0.03 * (vnoise(th * 5, 0, 0, seed + 21) - 0.5) * 2;
      A.add(
        "cloth",
        loft(
          [
            R(0.12, 0.052, 0.052, 0, jag),
            R(0.06, 0.058),
            R(0.0, 0.06),
            R(-0.04, 0.048),
            R(-0.06, 0.03),
          ],
          18,
          { capTop: true },
        ),
        {
          m: MA.clone(),
          w: s > 0 ? 6 : 9,
          color: clothC,
          noise: 0.004,
          freq: 30,
          seed,
        },
      );
      A.add("flesh", sphere(0.05, 0.02, 0.05, 12, 6), {
        m: mul(MA.clone(), mT(0, -0.115, 0)),
        w: s > 0 ? 6 : 9,
        color: (p) =>
          mix3(GORE, GORE_DK, fbm(p.x * 90, p.y * 90, p.z * 90, seed, 2)),
        noise: 0.004,
        freq: 90,
        seed,
      });
      const bone = new THREE.CylinderGeometry(0.011, 0.013, 0.09, 7);
      bone.translate(0, -0.15, 0.004);
      A.add("flesh", bone, {
        m: MA.clone(),
        w: s > 0 ? 6 : 9,
        color: BONEC,
        noise: 0.002,
        freq: 120,
        seed,
      });
      continue;
    }
    const full = sl === "full";
    const rj = (th) =>
      0.035 *
        (fbm(Math.cos(th) * 2, Math.sin(th) * 2, s, seed + 13, 3) - 0.5) *
        2 -
      0.02 * Math.max(0, Math.cos(th * 2 + s));
    const sleeve = full
      ? [
          R(0.548, 0.039, 0.039),
          R(0.5, 0.039),
          R(0.42, 0.041),
          R(0.34, 0.042),
          R(0.295, 0.042),
          R(0.25, 0.044),
          R(0.17, 0.047),
          R(0.09, 0.05),
          R(0.03, 0.052),
          R(0.0, 0.048),
          R(-0.025, 0.038),
          R(-0.04, 0.02),
        ]
      : [
          R(0.37, 0.044, 0.044, 0, rj),
          R(0.34, 0.043),
          R(0.295, 0.043),
          R(0.25, 0.045),
          R(0.17, 0.048),
          R(0.09, 0.051),
          R(0.03, 0.052),
          R(0.0, 0.048),
          R(-0.025, 0.038),
          R(-0.04, 0.02),
        ];
    A.add("cloth", loft(sleeve, 18, { capTop: true }), {
      m: MA.clone(),
      w: aw,
      color: clothC,
      noise: 0.004,
      freq: 26,
      seed: seed + s,
    });
    // forearm / wrist skin (skinny, sinewy)
    const fa = full
      ? [R(0.585, 0.022, 0.02), R(0.56, 0.025, 0.022), R(0.5, 0.03, 0.026)]
      : [
          R(0.585, 0.022, 0.02),
          R(0.555, 0.025, 0.022),
          R(0.5, 0.028, 0.025),
          R(0.42, 0.033, 0.029),
          R(0.35, 0.037, 0.033),
          R(0.3, 0.04, 0.036),
        ];
    A.add("skin", loft(fa, 12, { capBottom: true }), {
      m: MA.clone(),
      w: aw,
      color: skinC,
      noise: full ? 0.001 : 0.0035,
      freq: 45,
      seed: seed + 2 * s,
    });
    buildHand(s);
  }

  // ---------------------------------------------------------------- neck
  const NR = (y, rx, rz, z) => ({ y, rx, rz, z, p: 2.0 });
  A.add(
    "skin",
    loft(
      [
        NR(1.44, 0.05, 0.047, 0.0),
        NR(1.5, 0.044, 0.041, 0.004),
        NR(1.555, 0.041, 0.039, 0.012),
        NR(1.61, 0.044, 0.042, 0.014),
        NR(1.67, 0.042, 0.042, 0.006),
      ],
      18,
      {},
    ),
    {
      w: neckW,
      color: (p) => mulc(skinC(p), [0.8, 0.8, 0.8]),
      noise: 0.004,
      freq: 60,
      seed,
    },
  );
  // decapitation stump (hidden inside the neck until the head is gone)
  const cap = new THREE.CircleGeometry(0.036, 14);
  cap.rotateX(-Math.PI / 2);
  A.add("flesh", cap, {
    m: mT(0, 1.585, 0.01),
    w: 3,
    color: (p) => mix3(GORE, GORE_DK, fbm(p.x * 90, p.z * 90, 0, seed, 2)),
    noise: 0.004,
    freq: 80,
    seed,
  });
  const vert = new THREE.CylinderGeometry(0.009, 0.012, 0.035, 6);
  vert.translate(0, 1.595, -0.01);
  A.add("flesh", vert, { w: 3, color: mulc(BONEC, [0.55, 0.45, 0.4]) });

  // ---------------------------------------------------------------- head
  const HB = BONE_POS[4],
    C = HB.clone().add(HEAD_C_OFF);
  const G2 = (x, y, cx, cy, sx, sy) =>
    Math.exp(-((x - cx) ** 2 / (2 * sx * sx) + (y - cy) ** 2 / (2 * sy * sy)));
  const sculpt = (nx, ny, nz) => {
    {
      const kb =
        1 /
        Math.pow(
          Math.abs(nx) ** 2.6 + Math.abs(ny) ** 2.6 + Math.abs(nz) ** 2.6,
          1 / 2.6,
        );
      const f = lerp(1, kb, 0.75 * sstep(-0.3, 0.25, ny));
      nx *= f;
      ny *= f;
      nz *= f;
    }
    let x = nx * 0.077,
      y = ny * 0.104,
      z = nz * 0.1;
    if (ny < 0) {
      const t = -ny;
      x *= 1 - 0.2 * t * t - 0.1 * Math.max(0, t - 0.6);
      z *= nz < 0 ? 1 - 0.45 * t : 1 - 0.04 * t;
    } else {
      if (nz < 0) z *= 1.05;
      if (ny > 0.55) y *= 1 - 0.06 * (ny - 0.55);
    }
    if (nz > 0) x *= 1 - 0.07 * nz * nz;
    const fw = sstep(0.0, 0.05, z);
    let dz = 0,
      dx = 0,
      dy = 0;
    const sock =
      G2(x, y, 0.031, 0.004, 0.0155, 0.0125) +
      G2(x, y, -0.031, 0.004, 0.0155, 0.0125);
    dz -= 0.034 * sock;
    const brow =
      G2(x, y, 0.03, 0.026, 0.024, 0.007) +
      G2(x, y, -0.03, 0.026, 0.024, 0.007);
    dz += 0.016 * brow;
    dy -= 0.004 * brow;
    dz += 0.012 * G2(x, y, 0, 0.004, 0.0065, 0.013); // nasal bridge remnant
    dz -= 0.02 * G2(x, y, 0, -0.027, 0.0085, 0.009); // rotted-away nose: cavity
    const cb =
      G2(x, y, 0.05, -0.016, 0.012, 0.009) +
      G2(x, y, -0.05, -0.016, 0.012, 0.009);
    dz += 0.009 * cb;
    dx += Math.sign(x) * 0.006 * cb;
    const ch =
      G2(x, y, 0.041, -0.048, 0.014, 0.016) +
      G2(x, y, -0.041, -0.048, 0.014, 0.016);
    dz -= 0.017 * ch;
    dx -= Math.sign(x) * 0.009 * ch;
    const tmp =
      G2(x, y, 0.066, 0.03, 0.012, 0.016) +
      G2(x, y, -0.066, 0.03, 0.012, 0.016);
    dx -= Math.sign(x) * 0.006 * tmp;
    dz += 0.013 * G2(x, y, 0, -0.098, 0.018, 0.012); // chin
    dz -= 0.006 * G2(x, y, 0, -0.056, 0.022, 0.012); // mouth recess
    return [x + dx * fw + dx * (1 - fw) * 0.5, y + dy * fw, z + dz * fw];
  };
  const hg = new THREE.SphereGeometry(1, 48, 36);
  hg.rotateZ(Math.PI / 2); // poles at the ears (hidden), not the crown
  {
    const P = hg.attributes.position;
    for (let i = 0; i < P.count; i++) {
      const [x, y, z] = sculpt(P.getX(i), P.getY(i), P.getZ(i));
      P.setXYZ(i, C.x + x, C.y + y, C.z + z);
    }
  }
  // surface z lookup (for placing eyes / teeth)
  const surfZ = (lx, ly) => {
    const P = hg.attributes.position;
    let best = -1,
      bz = 0;
    for (let i = 0; i < P.count; i++) {
      const x = P.getX(i) - C.x,
        y = P.getY(i) - C.y,
        z = P.getZ(i) - C.z;
      if (z < 0) continue;
      const d = (x - lx) ** 2 + (y - ly) ** 2;
      if (best < 0 || d < best) {
        best = d;
        bz = z;
      }
    }
    return bz;
  };
  const eyeZ = surfZ(0.031, 0.004),
    mouthZ = surfZ(0, -0.056);
  const cheek = cfg.tornCheek
    ? { x: 0.036 * cfg.tornCheek, y: -0.048, r: 0.019 }
    : null;
  const mouthCut = (x, y, z) => {
    const lx = x - C.x,
      ly = y - C.y,
      lz = z - C.z;
    if (lz < 0.02) return false;
    const jag = 1 + 0.35 * (vnoise(lx * 300, ly * 300, 0, seed + 5) - 0.5);
    if ((lx / 0.029) ** 2 + ((ly + 0.056) / 0.0125) ** 2 < jag) return true;
    if (
      cheek &&
      (lx - cheek.x) ** 2 + (ly - cheek.y) ** 2 < (cheek.r * jag) ** 2
    )
      return true;
    return false;
  };
  const headW = (p) => {
    const ly = p.y - C.y,
      lz = p.z - C.z;
    const w = sstep(-0.05, -0.066, ly) * sstep(-0.045, 0.01, lz);
    return w > 0.001 ? [4, 5, w] : 4;
  };
  const bald = cfg.hair === "bald";
  const headCol = (p) => {
    const lx = p.x - C.x,
      ly = p.y - C.y,
      lz = p.z - C.z;
    let c = skinC(p);
    const sock =
      G2(lx, ly, 0.031, 0.004, 0.019, 0.015) +
      G2(lx, ly, -0.031, 0.004, 0.019, 0.015);
    const front = sstep(0.02, 0.06, lz);
    c = mulc(c, [
      1 - 0.82 * sock * front,
      1 - 0.85 * sock * front,
      1 - 0.82 * sock * front,
    ]);
    const nose = G2(lx, ly, 0, -0.027, 0.01, 0.01) * front;
    c = mix3(c, [0.06, 0.025, 0.025], nose * 0.95);
    const md = (lx / 0.04) ** 2 + ((ly + 0.056) / 0.022) ** 2;
    c = mix3(c, [0.16, 0.08, 0.07], (1 - sstep(0.6, 1.6, md)) * front * 0.85);
    if (cheek) {
      const cd = Math.hypot(lx - cheek.x, ly - cheek.y) / (cheek.r * 1.9);
      c = mix3(c, [0.3, 0.08, 0.07], (1 - sstep(0.5, 1, cd)) * front);
    }
    const cheekHollow =
      G2(lx, ly, 0.042, -0.05, 0.016, 0.018) +
      G2(lx, ly, -0.042, -0.05, 0.016, 0.018);
    c = mulc(c, [
      1 - 0.3 * cheekHollow * front,
      1 - 0.3 * cheekHollow * front,
      1 - 0.25 * cheekHollow * front,
    ]);
    if (bald && ly > 0.03) {
      const l = fbm(p.x * 40, p.y * 40, p.z * 40, seed + 17, 2);
      if (l > 0.62) c = mix3(c, [0.35, 0.12, 0.1], sstep(0.62, 0.75, l));
    }
    return c;
  };
  A.add("skin", hg, {
    w: headW,
    color: headCol,
    noise: 0.0022,
    freq: 45,
    seed,
    cut: mouthCut,
    uvScale: 1.8,
  });
  // mouth interior
  A.add("flesh", sphere(0.033, 0.022, 0.03, 12, 8), {
    m: mT(C.x, C.y - 0.058, C.z + mouthZ - 0.035),
    w: (p) => [4, 5, sstep(C.y - 0.05, C.y - 0.066, p.y)],
    color: [0.03, 0.008, 0.008],
  });
  if (cheek)
    A.add("flesh", sphere(0.022, 0.02, 0.03, 10, 8), {
      m: mT(C.x + cheek.x * 0.55, C.y + cheek.y, C.z + mouthZ - 0.05),
      w: [4, 5, 0.3],
      color: [0.05, 0.01, 0.01],
    });
  // teeth: upper on the skull, lower on the jaw; some missing, crooked, yellowed
  for (const up of [true, false]) {
    const n = 9;
    for (let i = 0; i < n; i++) {
      if (rnd() < 0.14) continue;
      const a = -1.05 + (2.1 * i) / (n - 1);
      const tx = 0.0255 * Math.sin(a),
        tz = mouthZ - 0.006 - 0.02 * (1 - Math.cos(a)) - (up ? 0 : 0.003);
      const h = (0.0075 + rnd() * 0.004) * (Math.abs(a) > 0.7 ? 0.8 : 1);
      const tg = new THREE.BoxGeometry(
        0.0058 * (Math.abs(a) > 0.7 ? 1.25 : 1),
        h,
        0.0055,
      );
      const ty = up ? -0.045 - h / 2 : -0.069 + h / 2;
      const M = mul(
        mT(C.x + tx, C.y + ty, C.z + tz),
        mR((rnd() - 0.5) * 0.14, a, (rnd() - 0.5) * 0.12),
      );
      const col = mulc(TOOTH, [
        0.55 + rnd() * 0.35,
        0.55 + rnd() * 0.3,
        0.5 + rnd() * 0.3,
      ]);
      A.add("flesh", tg, { m: M, w: up ? 4 : 5, color: col, flat: true });
    }
    // gum line
    for (let i = 0; i < 7; i++) {
      const a = -1.0 + (2 * i) / 6;
      const tx = 0.024 * Math.sin(a),
        tz = mouthZ - 0.011 - 0.02 * (1 - Math.cos(a));
      const M = mul(
        mT(C.x + tx, C.y + (up ? -0.043 : -0.071), C.z + tz),
        mR(0, a, 0),
      );
      A.add("flesh", new THREE.BoxGeometry(0.012, 0.007, 0.008), {
        m: M,
        w: up ? 4 : 5,
        color: [0.07, 0.025, 0.02],
        flat: true,
      });
    }
  }
  // eyes (glowing, own bucket) + dark socket cups behind them
  for (const s of [1, -1]) {
    const ex = 0.031 * s,
      ey = 0.003;
    A.add("eyes", sphere(0.0072, 0.0056, 0.006, 10, 8), {
      m: mT(C.x + ex, C.y + ey, C.z + eyeZ - 0.001),
      w: 4,
      color: WHITE,
    });
    A.add("flesh", sphere(0.0135, 0.011, 0.009, 10, 6), {
      m: mT(C.x + ex, C.y + ey, C.z + eyeZ - 0.0065),
      w: 4,
      color: [0.04, 0.015, 0.015],
    });
    // ears (rotted nubs)
    A.add("skin", sphere(0.008, 0.022, 0.014, 8, 6), {
      m: mul(
        mT(C.x + 0.073 * s, C.y - 0.008, C.z - 0.012),
        mR(0, 0.35 * s, 0.1 * s),
      ),
      w: 4,
      color: (p) => mulc(skinC(p), [0.8, 0.75, 0.75]),
      noise: 0.002,
      freq: 90,
      seed,
    });
  }
  // hair
  if (cfg.hair && cfg.hair !== "bald") {
    const hr = new THREE.SphereGeometry(1, 34, 22);
    hr.rotateZ(Math.PI / 2);
    const P = hr.attributes.position;
    for (let i = 0; i < P.count; i++) {
      const [x, y, z] = sculpt(P.getX(i), P.getY(i), P.getZ(i));
      const l = Math.hypot(x, y, z) || 1,
        k = 1 + 0.0028 / l;
      P.setXYZ(i, C.x + x * k, C.y + y * k + 0.001, C.z + z * k);
    }
    const patchy = cfg.hair === "patchy";
    A.add("cloth", hr, {
      w: 4,
      color: (p) => {
        const g = fbm(p.x * 80, p.y * 80, p.z * 80, seed + 2, 2);
        return [0.12 + 0.08 * g, 0.1 + 0.06 * g, 0.08 + 0.05 * g];
      },
      cut: (x, y, z) => {
        const lx = x - C.x,
          ly = y - C.y,
          lz = z - C.z;
        if (
          ly <
          0.01 +
            (lz > 0
              ? 0.045 * sstep(0.0, 0.09, lz)
              : -0.03 * sstep(0, -0.08, lz))
        )
          return true; // hairline
        if (lz > 0.06 && ly < 0.07) return true;
        if (Math.abs(lx) > 0.06 && ly < 0.035) return true;
        const n = fbm(lx * 70 + 3, ly * 70, lz * 70, seed + 3, 3);
        return patchy ? n < 0.5 : n < 0.3;
      },
    });
  }

  // ---------------------------------------------------------------- crawler stumps (hidden inside trousers)
  for (const s of [1, -1])
    A.add("flesh", sphere(0.075, 0.03, 0.075, 10, 6), {
      m: mT(HIPX * s, 0.905, 0),
      w: 0,
      color: GORE,
    });

  const geos = A.finish();

  // ---------------------------------------------------------------- helmet (separate rigid mesh, can fly off)
  const HA = new Acc();
  const D = (th) => {
    const f = Math.pow(Math.max(0, Math.cos(th)), 1.6),
      b = Math.pow(Math.max(0, -Math.cos(th)), 1.5);
    return 0.058 - 0.037 * f + 0.012 * b;
  };
  const F = (th) => {
    const f = Math.pow(Math.max(0, Math.cos(th)), 1.6),
      b = Math.pow(Math.max(0, -Math.cos(th)), 1.5);
    return 0.023 - 0.014 * f + 0.005 * b;
  };
  const Rx = 0.099,
    Rz = 0.118,
    Hh = 0.079,
    eqY = 0.128;
  const hr = [];
  hr.push({
    y: eqY,
    rx: Rx - 0.008,
    rz: Rz - 0.008,
    dy: (th) => -D(th) + 0.004,
    dr: (th) => F(th) - 0.004,
  });
  hr.push({ y: eqY, rx: Rx, rz: Rz, dy: (th) => -D(th), dr: (th) => F(th) });
  hr.push({
    y: eqY,
    rx: Rx,
    rz: Rz,
    dy: (th) => -0.72 * D(th),
    dr: (th) => 0.62 * F(th),
  });
  hr.push({
    y: eqY,
    rx: Rx,
    rz: Rz,
    dy: (th) => -0.42 * D(th),
    dr: (th) => 0.2 * F(th),
  });
  hr.push({
    y: eqY,
    rx: Rx + 0.001,
    rz: Rz + 0.001,
    dy: (th) => -0.16 * D(th),
  });
  for (let k = 1; k <= 9; k++) {
    const ph = (k / 9) * (Math.PI / 2);
    hr.push({
      y: eqY + Hh * Math.sin(ph),
      rx: Math.max(0.004, Rx * Math.cos(ph)),
      rz: Math.max(0.004, Rz * Math.cos(ph)),
    });
  }
  hr.forEach((r) => {
    r.z = 0.006;
    r.p = 2.15;
  });
  HA.add("h", loft(hr, 40, { capTop: true }), {
    color: (p) => {
      const g = fbm(p.x * 30, p.y * 30, p.z * 30, seed + 30, 3);
      const k = 0.8 + 0.35 * g;
      return [k, k, k * 0.97];
    },
    noise: 0.0012,
    freq: 40,
    seed,
  });
  for (const s of [1, -1])
    HA.add("h", new THREE.CylinderGeometry(0.0065, 0.0065, 0.008, 8), {
      m: mul(mT(s * (Rx - 0.006), eqY + 0.026, 0.006), mR(0, 0, Math.PI / 2)),
      color: [0.7, 0.7, 0.7],
    });
  // broken chin strap dangling
  const csPts = [],
    csN = [];
  for (let i = 0; i <= 8; i++) {
    const t = i / 8;
    csPts.push(
      new V3(
        -0.08 - 0.004 * t,
        eqY - 0.045 - t * 0.085,
        0.005 + 0.02 * Math.sin(t * 3),
      ),
    );
    csN.push(new V3(-1, 0, 0));
  }
  HA.add("h", ribbon(csPts, csN, 0.014, 0.003), { color: [0.3, 0.25, 0.2] });
  const hgeo = HA.finish().h;
  hgeo.deleteAttribute("skinIndex");
  hgeo.deleteAttribute("skinWeight");
  hgeo.translate(-HEAD_C_OFF.x * 0, 0, 0);
  // helmet built relative to the head bone origin: shift by head centre offset
  hgeo.translate(0, 0, HEAD_C_OFF.z - 0.006);
  hgeo.computeBoundingSphere();

  let tris = 0;
  for (const k in geos) tris += geos[k].index.count / 3;
  return { cfg, geos, helmet: hgeo, tris, helmetTris: hgeo.index.count / 3 };
}

// ======================================================================= materials
