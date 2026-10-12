// src__avatars 10 — top
// Lines 2546-2889 of readable/src__avatars.pretty.js (statement-aligned).
function buildTorso(acc, C, TS) {
  const top = srgb(C.topCol),
    trs = srgb(C.trouserCol);
  const topB = C.top === "leather" ? "leather" : "cloth";
  // trousers (pelvis)
  const lowTop = C.top === "shirt" ? 1.07 : 1.06;
  const lr = TS.rings(0.8, lowTop, 9, (y) => (y > 0.99 ? -0.002 : 0));
  acc.add(
    "cloth",
    loft(lr, 28, { capStart: true, capPull: new V3(0, -0.01, 0) }),
    {
      w: (p) => wTorso(p, 1),
      color: (p) => {
        let c = clothCol(trs, C.seed + 20)(p);
        c = mul3(
          c,
          1 - 0.3 * sstep(0.9, 0.8, p.y) * (0.6 + 0.4 * gauss(p.x, 0.06)),
        ); // crotch occlusion
        return c;
      },
    },
  );
  // upper garment
  const hem = {
    shirt: 0.985,
    battledress: 0.955,
    gymnastyorka: 0.8,
    leather: 0.915,
  }[C.top];
  const flare = {
    shirt: 0.0,
    battledress: 0.004,
    gymnastyorka: 0.012,
    leather: 0.01,
  }[C.top];
  const topOff = (y) =>
    0.003 + flare * sstep(1.08, hem, y) + (C.top === "leather" ? 0.004 : 0);
  const ur = TS.rings(hem, 1.535, 24, topOff);
  const ccol = clothCol(top, C.seed + 30, C.top === "leather" ? 0.1 : 0.25);
  const tshade = [];
  const beltY =
    C.top === "gymnastyorka" ? 1.005 : C.top === "leather" ? 0.94 : 1.0;
  acc.add(topB, loft(ur, 32), {
    w: (p) => wTorso(p, 0.8),
    post: (p, i) => {
      const th = Math.atan2(p.x, p.z),
        n = vnoise(th * 3, p.y * 20, C.seed, 9) - 0.5;
      let f =
        0.0038 * gauss(p.y - (beltY + 0.06), 0.035) * Math.sin(th * 13 + n * 4); // bloused over the belt
      if (C.top === "gymnastyorka")
        f += 0.005 * sstep(0.97, 0.84, p.y) * Math.sin(th * 9 + n * 3); // skirt pleats
      f +=
        0.0022 *
        gauss(Math.abs(th) - 1.5, 0.3) *
        gauss(p.y - 1.33, 0.06) *
        Math.sin(p.y * 90 + th * 4); // armpit
      f += 0.0012 * Math.sin(th * 7 + p.y * 30 + n * 5);
      if (C.top === "leather") f *= 0.6;
      const r = Math.hypot(p.x, p.z) || 1;
      p.x += (p.x / r) * f;
      p.z += (p.z / r) * f;
      tshade[i] = f;
    },
    color: (p, nn, i) => {
      let c = mul3(ccol(p), 1 + clamp(tshade[i] || 0, -0.005, 0.005) * 50);
      const th = Math.atan2(p.x, p.z);
      // folds: vertical creases below the belt / waistband bunching
      c = mul3(
        c,
        1 -
          0.1 *
            sstep(0.6, 0.9, Math.sin(th * 9 + p.y * 12)) *
            sstep(1.05, 0.95, p.y),
      );
      c = mul3(
        c,
        1 - 0.18 * gauss(Math.abs(th) - 1.45, 0.25) * gauss(p.y - 1.36, 0.05),
      ); // armpit shade
      c = mul3(c, 1 - 0.25 * sstep(hem + 0.02, hem, p.y));
      return c;
    },
  });
  // ---- garment details
  const addBox = (bucket, w, h, d, y, th, off, col, o = {}) => {
    const M = TS.frame(y, th, off).multiply(o.rot ? mR(...o.rot) : new M4());
    acc.add(bucket, sbox(w, h, d, o.p || 6, o.ws || 8, o.hs || 6), {
      m: M,
      w: (p) => wTorso(p, o.skirt ?? 0.8),
      color: col,
    });
  };
  const button = (y, th, off, col) => {
    const M = TS.frame(y, th, off).multiply(mR(PI / 2, 0, 0));
    acc.add("metal", cyl(0.0065, 0.0065, 0.004, 8), {
      m: M,
      w: (p) => wTorso(p),
      color: col,
    });
  };
  const btn = [0.32, 0.28, 0.2];
  if (C.top === "shirt") {
    for (const s of [1, -1]) {
      // breast pockets + flaps
      addBox(
        "cloth",
        0.105,
        0.125,
        0.014,
        1.295,
        0.44 * s,
        0.001,
        mul3(top, 0.96),
      );
      addBox(
        "cloth",
        0.112,
        0.042,
        0.016,
        1.35,
        0.44 * s,
        0.004,
        mul3(top, 0.86),
      );
      button(1.345, 0.44 * s, 0.013, btn);
    }
    addBox("cloth", 0.03, 0.44, 0.008, 1.24, 0.0, 0.002, mul3(top, 0.94), {
      p: 8,
    }); // placket
    for (let i = 0; i < 5; i++) button(1.06 + i * 0.09, 0.0, 0.007, btn);
  } else if (C.top === "battledress") {
    for (const s of [1, -1]) {
      addBox(
        "cloth",
        0.115,
        0.14,
        0.018,
        1.29,
        0.46 * s,
        0.001,
        mul3(top, 0.97),
      );
      addBox(
        "cloth",
        0.024,
        0.13,
        0.02,
        1.29,
        0.46 * s,
        0.004,
        mul3(top, 0.88),
      ); // box pleat
      addBox(
        "cloth",
        0.122,
        0.046,
        0.02,
        1.355,
        0.46 * s,
        0.004,
        mul3(top, 0.86),
      );
      button(1.35, 0.46 * s, 0.016, btn);
    }
    // waistband
    const wbR = TS.rings(0.955, 1.02, 3, (y) => 0.009);
    acc.add("cloth", loft(wbR, 32), {
      w: (p) => wTorso(p, 0.8),
      color: (p) => mul3(top, Math.abs(p.y - 0.988) < 0.03 ? 0.9 : 0.75),
    });
    addBox("cloth", 0.036, 0.05, 0.02, 0.99, -0.12, 0.012, mul3(top, 0.85));
    button(0.99, -0.12, 0.024, btn);
  } else if (C.top === "gymnastyorka") {
    addBox("cloth", 0.038, 0.19, 0.01, 1.4, 0.0, 0.002, mul3(top, 0.93), {
      p: 8,
    }); // placket
    for (let i = 0; i < 3; i++)
      button(1.34 + i * 0.058, 0.0, 0.008, [0.3, 0.3, 0.22]);
    // skirt hem band
    const hr = TS.rings(0.8, 0.83, 2, (y) => 0.017);
    acc.add("cloth", loft(hr, 32), {
      w: (p) => wTorso(p, 0.9),
      color: mul3(top, 0.8),
    });
  } else if (C.top === "leather") {
    // zipper line + side pockets + waistband
    addBox("leather", 0.012, 0.5, 0.008, 1.2, 0.0, 0.004, [0.2, 0.17, 0.13], {
      p: 10,
    });
    for (const s of [1, -1])
      addBox(
        "leather",
        0.13,
        0.03,
        0.012,
        1.03,
        0.62 * s,
        0.013,
        mul3(top, 0.7),
        { rot: [0, 0, 0.5 * s] },
      );
    const wbR = TS.rings(0.915, 0.965, 3, (y) => 0.019);
    acc.add("leather", loft(wbR, 32), {
      w: (p) => wTorso(p, 0.8),
      color: mul3(top, 0.8),
    });
    const sh = srgb(C.shirtCol);
    addBox("cloth", 0.09, 0.08, 0.02, 1.47, 0.0, 0.0, sh); // shirt at the opening
  }
}

// ---------------------------------------------------------------- collars, scarf
function buildCollar(acc, C, TS) {
  const top = srgb(C.topCol);
  const neckRing = (y, r, zc = -0.012, back = 0) => ({
    c: new V3(0, y, zc),
    ax: AX,
    az: AZ,
    rx: r,
    rz: r * 1.02,
    p: 2,
    dy: back,
  });
  if (C.top === "shirt" || C.top === "battledress") {
    const g = loft(
      [
        neckRing(1.49, 0.077, -0.012, 0.012),
        neckRing(1.525, 0.072, -0.012, 0.02),
        neckRing(1.552, 0.07, -0.012, 0.024),
        neckRing(1.555, 0.075, -0.012, 0.024),
        neckRing(1.528, 0.081, -0.012, 0.02),
        neckRing(1.5, 0.089, -0.012, 0.012),
      ],
      24,
    );
    acc.add("cloth", g, {
      w: wNeckCollar,
      color: (p) =>
        mul3(top, p.y > 1.552 + 0.02 * sstep(0.0, -0.06, p.z) ? 0.8 : 0.95),
    });
    if (C.top === "shirt")
      for (const s of [1, -1]) {
        // collar points
        const ex = new THREE.ExtrudeGeometry(
          new THREE.Shape([
            new THREE.Vector2(0, 0),
            new THREE.Vector2(0.04 * s, -0.024),
            new THREE.Vector2(0.02 * s, -0.056),
          ]),
          { depth: 0.004, bevelEnabled: false },
        );
        acc.add("cloth", ex, {
          m: mm(mT(0.01 * s, 1.52, 0.064), mR(-0.42, 0, 0)),
          w: (p) => wTorso(p),
          color: mul3(top, 0.92),
          flip: s < 0,
        });
      }
  } else if (C.top === "gymnastyorka") {
    const g = loft(
      [
        neckRing(1.495, 0.077, -0.012, 0.01),
        neckRing(1.52, 0.072, -0.012, 0.014),
        neckRing(1.562, 0.07, -0.012, 0.016),
        neckRing(1.565, 0.066, -0.012, 0.016),
      ],
      24,
    );
    acc.add("cloth", g, {
      w: wNeckCollar,
      color: (p) => mul3(top, p.y > 1.562 ? 0.78 : 0.97),
    });
    for (const y of [1.528, 1.552])
      acc.add("metal", cyl(0.005, 0.005, 0.004, 8), {
        m: mm(mT(0, y, 0.058), mR(PI / 2, 0, 0)),
        w: wNeckCollar,
        color: [0.3, 0.3, 0.22],
      });
  } else if (C.top === "leather") {
    // wide collar folded over the shoulders
    const lc = srgb(C.topCol);
    const g = loft(
      [
        neckRing(1.48, 0.095, -0.015, 0.01),
        neckRing(1.52, 0.083, -0.015, 0.016),
        neckRing(1.55, 0.079, -0.018, 0.02),
        neckRing(1.555, 0.087, -0.02, 0.02),
        neckRing(1.51, 0.115, -0.02, 0.012),
        neckRing(1.47, 0.14, -0.02, 0.0),
      ],
      28,
      { th0: 0.55, thSpan: TAU - 1.1 },
    );
    acc.add("leather", g, {
      w: wNeckCollar,
      color: (p) => mul3(lc, p.y > 1.548 ? 0.7 : 0.9),
    });
  }
  if (C.scarfCol) {
    const sc = srgb(C.scarfCol);
    const pts = [];
    for (let i = 0; i <= 28; i++) {
      const a = (i / 28) * TAU;
      pts.push(
        new V3(
          Math.sin(a) * 0.08,
          1.515 + 0.012 * Math.cos(a) + 0.012 * (1 - Math.cos(a)) * 0.5,
          Math.cos(a) * 0.084 - 0.012,
        ),
      );
    }
    const col = (p) => {
      const k = fbm(p.x * 40, p.y * 40, p.z * 40, 31, 2);
      const stripe = Math.abs(((p.y + p.x) * 45) % 1) < 0.18 ? 0.78 : 1;
      return mul3(sc, (0.85 + 0.3 * k) * stripe);
    };
    acc.add("cloth", tube(pts, 0.021, 10, { flat: 0.8 }), {
      w: wNeckCollar,
      color: col,
    });
    acc.add("cloth", sbox(0.05, 0.042, 0.04, 4, 10, 8), {
      m: mT(0.012, 1.49, 0.075),
      w: (p) => wTorso(p),
      color: col,
    });
    const tail = [
      new V3(0.014, 1.48, 0.085),
      new V3(0.03, 1.43, 0.1),
      new V3(0.04, 1.36, 0.115),
      new V3(0.045, 1.3, 0.12),
    ];
    acc.add(
      "cloth",
      tube(tail, (i, u) => 0.02 + 0.006 * u, 8, { flat: 0.3 }),
      { w: (p) => wTorso(p), color: col },
    );
  }
}
function wNeckCollar(p) {
  return p.y > 1.53
    ? wb(B.chest, B.neck, sstep(1.53, 1.57, p.y) * 0.7)
    : B.chest;
}

// ---------------------------------------------------------------- belts, straps, gear
