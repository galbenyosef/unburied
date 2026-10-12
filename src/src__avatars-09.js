// src__avatars 09 — mul3
// Lines 2379-2545 of readable/src__avatars.pretty.js (statement-aligned).
function legwear(acc, C) {
  const col = srgb(C.legCol);
  for (const s of [1, -1]) {
    const hx = 0.092 * C.hip * s;
    let L = null,
      bucket = "cloth";
    if (C.legwear === "leggings")
      L = [
        [0.335, 0.064, 0.068, 0.0],
        [0.33, 0.066, 0.07, 0],
        [0.28, 0.062, 0.064, 0],
        [0.19, 0.056, 0.058, 0],
        [0.12, 0.054, 0.056, 0],
        [0.085, 0.056, 0.058, 0.012],
      ];
    else if (C.legwear === "anklets")
      L = [
        [0.195, 0.058, 0.061, 0],
        [0.19, 0.06, 0.063, 0],
        [0.12, 0.057, 0.06, 0],
        [0.085, 0.058, 0.061, 0.012],
      ];
    else if (C.legwear === "tallboots") {
      bucket = "leather";
      L = [
        [0.46, 0.066, 0.072, -0.004],
        [0.455, 0.068, 0.074, -0.004],
        [0.4, 0.066, 0.07, -0.006],
        [0.33, 0.062, 0.066, -0.006],
        [0.24, 0.055, 0.058, -0.003],
        [0.16, 0.05, 0.053, 0],
        [0.1, 0.052, 0.056, 0.004],
      ];
    }
    if (!L) continue;
    const g = axisLoft(
      new V3(hx, 0, -0.004),
      AY,
      AZ,
      L.map(([y, rx, rz, oz]) => [
        y,
        rx * C.girth,
        rz * C.girth,
        0,
        oz,
      ]).reverse(),
      18,
    );
    acc.add(bucket, g, {
      w: (p) => wLeg(p, s),
      color: (p) => {
        const m = fbm(p.x * 25, p.y * 25, p.z * 25, C.seed + 5, 3);
        let c = mul3(col, 0.82 + 0.3 * m);
        if (C.legwear === "leggings") {
          // lace line + hooks on the outer side
          const th = Math.atan2((p.x - hx) * s, p.z);
          if (Math.abs(th - 1.6) < 0.1) c = mul3(c, 0.55);
          if (
            Math.abs(th - 1.6) < 0.16 &&
            Math.abs(((p.y * 40) % 1) - 0.5) < 0.12
          )
            c = [0.12, 0.11, 0.1];
        }
        if (
          C.legwear === "anklets" &&
          (Math.abs(p.y - 0.165) < 0.01 || Math.abs(p.y - 0.115) < 0.01)
        )
          c = mul3(c, 0.7);
        if (C.legwear === "tallboots")
          c = mul3(
            c,
            1 +
              0.25 *
                sstep(
                  0.06,
                  0.02,
                  Math.abs(
                    ((p.y * 9 + fbm(p.x * 40, p.y * 10, p.z * 40, 8, 2)) % 1) -
                      0.5,
                  ),
                ) *
                sstep(0.3, 0.12, p.y),
          );
        return mix3(c, [0.12, 0.1, 0.07], sstep(0.2, 0.08, p.y) * 0.4);
      },
    });
  }
}
function buildBoots(acc, C) {
  const col = srgb(C.bootCol),
    sole = [0.03, 0.025, 0.02];
  const R = [
    [-0.082, 0.024, 0.006, 0.06],
    [-0.076, 0.035, 0.0, 0.084],
    [-0.052, 0.043, 0.0, 0.104],
    [-0.012, 0.046, 0.0, 0.112],
    [0.03, 0.048, 0.0, 0.1],
    [0.07, 0.05, 0.0, 0.08],
    [0.11, 0.052, 0.0, 0.064],
    [0.15, 0.05, 0.0, 0.052],
    [0.185, 0.044, 0.0, 0.046],
    [0.207, 0.034, 0.002, 0.039],
    [0.219, 0.018, 0.007, 0.03],
  ];
  const fs = C.female ? 0.93 : 1;
  for (const s of [1, -1]) {
    const hx = 0.092 * C.hip * s;
    const rings = R.map(([z, w, y0, y1]) => ({
      c: new V3(hx, (y0 + y1) / 2, z * fs - 0.004),
      ax: AX,
      az: AY,
      rx: w * fs,
      rz: (y1 - y0) / 2,
      p: 2.8,
    }));
    const g = loft(rings, 18, { capStart: true, capEnd: true });
    acc.add("leather", g, {
      w: (p) => wFoot(p, s),
      color: (p) => {
        let c = mul3(
          col,
          0.85 + 0.3 * fbm(p.x * 50, p.y * 50, p.z * 50, 21, 2),
        );
        if (p.y < 0.013) c = sole;
        else if (p.y < 0.02) c = mul3(col, 0.45);
        c = mix3(
          c,
          [0.16, 0.13, 0.1],
          fbm(p.x * 30, p.y * 30, p.z * 30, 5, 2) * sstep(0.06, 0.0, p.y) * 0.5,
        );
        return c;
      },
    });
    // shaft around the ankle
    const top = C.boot === "ankle" ? 0.15 : 0.125;
    if (C.boot !== "tall") {
      const sg = axisLoft(
        new V3(hx, 0.05, -0.014),
        AY,
        AZ,
        [
          [0, 0.046, 0.05],
          [top - 0.05, 0.048, 0.052],
          [top - 0.045, 0.05, 0.054],
          [top - 0.04, 0.046, 0.05],
        ],
        16,
      );
      acc.add("leather", sg, {
        w: (p) => wFoot(p, s),
        color: (p) => mul3(col, p.y > top - 0.012 + 0.05 ? 0.7 : 0.95),
      });
    }
  }
}

// ---------------------------------------------------------------- torso garments
function clothCol(base, seed, dirt = 0.25) {
  return (p) => {
    const m = fbm(p.x * 16, p.y * 16, p.z * 16, seed, 3),
      f = fbm(p.x * 55, p.y * 55, p.z * 55, seed + 1, 2);
    let c = mul3(base, 0.84 + 0.26 * m + 0.08 * (f - 0.5));
    const st = fbm(p.x * 7 + 3, p.y * 7, p.z * 7, seed + 2, 3);
    c = mix3(c, mul3(c, 0.7), sstep(0.58, 0.72, st) * dirt);
    return c;
  };
}
