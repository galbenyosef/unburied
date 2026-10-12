// src__avatars 11 — box
// Lines 2890-3147 of readable/src__avatars.pretty.js (statement-aligned).
function beltBand(acc, TS, y0, y1, off, bucket, col, seed) {
  const g = loft(
    [
      ...TS.rings(y0, y0, 0, () => off - 0.006),
      ...TS.rings(y0, y1, 2, () => off),
      ...TS.rings(y1, y1, 0, () => off - 0.006),
    ],
    32,
  );
  acc.add(bucket, g, {
    w: (p) => wTorso(p, 0.6),
    color: (p) =>
      mul3(col, 0.85 + 0.3 * fbm(p.x * 30, p.y * 30, p.z * 30, seed, 2)),
  });
}
function torsoStrap(acc, TS, path, w, off, bucket, col, t = 0.004) {
  const pts = [],
    nrm = [];
  for (let i = 0; i < path.length - 1; i++) {
    const [y0, a0] = path[i],
      [y1, a1] = path[i + 1];
    const n = 6;
    for (let k = i ? 1 : 0; k <= n; k++) {
      const y = lerp(y0, y1, k / n),
        a = lerp(a0, a1, k / n);
      pts.push(TS.surf(y, a, off));
      nrm.push(TS.normal(y, a));
    }
  }
  acc.add(bucket, strap(pts, nrm, w, t), {
    w: (p) => wTorso(p, 0.5),
    color: col,
  });
}
function buildGear(acc, C, TS) {
  const web = srgb(C.webCol),
    metal = [0.42, 0.4, 0.34],
    brass = [0.62, 0.5, 0.26];
  const box = (bucket, w, h, d, y, th, off, col, o = {}) => {
    const M = TS.frame(y, th, off).multiply(o.rot ? mR(...o.rot) : new M4());
    acc.add(bucket, sbox(w, h, d, o.p || 6, o.ws || 8, o.hs || 6), {
      m: M,
      w: (p) => wTorso(p, o.skirt ?? 0.6),
      color:
        typeof col === "function"
          ? col
          : (p) =>
              mul3(col, 0.86 + 0.25 * fbm(p.x * 40, p.y * 40, p.z * 40, 3, 2)),
    });
  };
  if (C.gear === "m1936") {
    beltBand(acc, TS, 0.975, 1.035, 0.016, "cloth", web, 41);
    for (const s of [1, -1]) {
      for (let i = 0; i < 4; i++) {
        // cartridge pockets
        const th = s * (0.42 + i * 0.3);
        box("cloth", 0.058, 0.074, 0.03, 1.0, th, 0.03, web, { ws: 6, hs: 4 });
        box("cloth", 0.062, 0.022, 0.034, 1.034, th, 0.032, mul3(web, 0.8), {
          ws: 6,
          hs: 4,
        });
        acc.add("metal", cyl(0.0045, 0.0045, 0.004, 6), {
          m: TS.frame(1.03, th, 0.05).multiply(mR(PI / 2, 0, 0)),
          w: (p) => wTorso(p),
          color: metal,
        });
      }
      // suspenders: front belt -> over the shoulder -> back belt
      torsoStrap(
        acc,
        TS,
        [
          [1.04, 0.5 * s],
          [1.2, 0.48 * s],
          [1.38, 0.55 * s],
          [1.47, 0.75 * s],
          [1.505, 1.2 * s],
          [1.47, 2.3 * s],
          [1.3, 2.55 * s],
          [1.04, 2.6 * s],
        ],
        0.032,
        0.006,
        "cloth",
        mul3(web, 0.92),
      );
      box("metal", 0.024, 0.03, 0.008, 1.14, 0.49 * s, 0.012, metal);
    }
    box("metal", 0.07, 0.05, 0.012, 1.005, 0.0, 0.026, brass, { p: 8 }); // buckle
    // canteen on the right hip + cover
    box("cloth", 0.13, 0.17, 0.07, 0.92, -1.9, 0.055, mul3(web, 0.85), {
      p: 4,
      skirt: 0.9,
    });
    box("cloth", 0.13, 0.05, 0.075, 0.99, -1.9, 0.058, mul3(web, 0.75), {
      p: 5,
      skirt: 0.9,
    });
    box("metal", 0.03, 0.03, 0.03, 1.02, -1.9, 0.07, [0.3, 0.3, 0.28], {
      p: 3,
    });
    // first-aid pouch at the back left
    box("cloth", 0.09, 0.085, 0.045, 0.99, 2.2, 0.04, web);
  } else if (C.gear === "p37") {
    beltBand(acc, TS, 0.98, 1.035, 0.02, "cloth", web, 42);
    box("metal", 0.06, 0.045, 0.01, 1.008, 0.0, 0.03, brass, { p: 8 });
    for (const s of [1, -1]) {
      // basic pouches on the chest
      box("cloth", 0.115, 0.19, 0.065, 1.16, 0.5 * s, 0.05, web, {
        p: 5,
        rot: [0.1, 0, 0],
      });
      box("cloth", 0.12, 0.06, 0.072, 1.26, 0.5 * s, 0.055, mul3(web, 0.85), {
        p: 5,
        rot: [0.1, 0, 0],
      });
      acc.add("metal", cyl(0.006, 0.006, 0.004, 6), {
        m: TS.frame(1.235, 0.5 * s, 0.095).multiply(mR(PI / 2, 0, 0)),
        w: (p) => wTorso(p),
        color: brass,
      });
      // braces: pouch top -> over the shoulder -> cross at the back
      torsoStrap(
        acc,
        TS,
        [
          [1.28, 0.5 * s],
          [1.4, 0.58 * s],
          [1.475, 0.78 * s],
          [1.505, 1.25 * s],
          [1.46, 2.4 * s],
          [1.3, 2.85 * s],
          [1.1, 3.1 * s],
          [1.03, 3.3 * s],
        ],
        0.028,
        0.008,
        "cloth",
        mul3(web, 0.93),
      );
    }
    // small pack on the back + water bottle on the right hip
    box("cloth", 0.26, 0.22, 0.09, 1.3, PI, 0.07, mul3(web, 0.95), { p: 4 });
    box("cloth", 0.25, 0.06, 0.1, 1.4, PI, 0.08, mul3(web, 0.82), { p: 5 });
    box("cloth", 0.1, 0.16, 0.08, 0.92, -2.0, 0.06, mul3(web, 0.9), {
      p: 3,
      skirt: 0.9,
    });
  } else if (C.gear === "soviet") {
    const belt = srgb(C.webCol);
    beltBand(acc, TS, 0.985, 1.03, 0.018, "leather", belt, 43);
    box("metal", 0.052, 0.05, 0.01, 1.008, 0.0, 0.028, [0.5, 0.46, 0.34], {
      p: 8,
    }); // plain frame buckle
    for (const s of [1, -1])
      box("leather", 0.1, 0.085, 0.05, 0.99, 0.55 * s, 0.04, mul3(belt, 0.95), {
        p: 5,
      });
    // shoulder belt (portupeya-like strap) omitted: bedroll loop over the left shoulder
    const ctrl = [
      [1.43, 0.72],
      null,
      [1.43, 2.42],
      [1.26, 3.14],
      [1.08, 3.9],
      [0.985, 4.5],
      [0.97, 4.75],
      [0.99, 5.1],
      [1.1, 5.65],
      [1.25, 6.28],
      [1.36, 6.7],
    ].map((c) =>
      c ? TS.surf(c[0], c[1], 0.046) : new V3(0.118, 1.548, -0.012),
    );
    const curve = new THREE.CatmullRomCurve3(ctrl, true, "centripetal");
    const pts = curve.getPoints(56);
    const bed = srgb([0.45, 0.4, 0.33]);
    acc.add(
      "cloth",
      tube(pts, (i) => 0.042 + 0.004 * Math.sin(i * 1.7), 12),
      {
        w: (p) => wTorso(p, 0.3),
        color: (p) => {
          const k = fbm(p.x * 30, p.y * 30, p.z * 30, 12, 3);
          const roll =
            0.85 + 0.2 * Math.sin(Math.atan2(p.y - 1.2, p.x) * 40 + k * 6);
          return mul3(bed, (0.8 + 0.3 * k) * roll);
        },
      },
    );
    for (const th of [0.75, -0.6, 2.4]) {
      // ties around the roll
      const y = 1.22 + 0.265 * Math.sin(th) - 0.02 * Math.cos(2 * th);
      const c = TS.surf(y, th, 0.045),
        nn = TS.normal(y, th);
      acc.add("leather", new THREE.TorusGeometry(0.046, 0.005, 6, 14), {
        m: mBasis(
          nn,
          new V3().crossVectors(AY, nn).normalize(),
          AY,
          c,
        ).multiply(mR(0, PI / 2, 0.4)),
        w: (p) => wTorso(p, 0.3),
        color: mul3(belt, 0.8),
      });
    }
  } else if (C.gear === "resistance") {
    const belt = [0.2, 0.13, 0.08];
    beltBand(acc, TS, 1.035, 1.065, 0.004, "leather", belt, 44);
    // satchel strap: right shoulder -> across the chest -> left hip, bag on the left hip
    const strapCol = srgb([0.36, 0.24, 0.14]);
    torsoStrap(
      acc,
      TS,
      [
        [1.02, 1.35],
        [1.12, 0.9],
        [1.26, 0.35],
        [1.38, -0.2],
        [1.47, -0.55],
        [1.51, -1.1],
        [1.47, -2.0],
        [1.3, -2.6],
        [1.14, -3.38],
        [1.03, -4.38],
      ],
      0.03,
      0.02,
      "leather",
      strapCol,
      0.004,
    );
    const sat = srgb(C.webCol);
    box("cloth", 0.24, 0.2, 0.07, 0.92, 1.55, 0.07, sat, { p: 5, skirt: 0.9 });
    box(
      "leather",
      0.245,
      0.11,
      0.075,
      0.975,
      1.55,
      0.075,
      mul3(strapCol, 0.9),
      { p: 6, skirt: 0.9 },
    );
    box("metal", 0.02, 0.028, 0.01, 0.93, 1.55, 0.115, [0.5, 0.45, 0.3], {
      skirt: 0.9,
    });
  }
}

// ---------------------------------------------------------------- headgear + long hair
function lathe(profile, seg) {
  return new THREE.LatheGeometry(
    profile.map(([r, y]) => new THREE.Vector2(r, y)),
    seg,
  );
}
