// src__avatars 08 — sstep
// Lines 2051-2378 of readable/src__avatars.pretty.js (statement-aligned).
function buildArms(acc, C, bucket, col, cuffCol) {
  const g0 = C.female ? 0.92 : 1.08;
  for (const s of [1, -1]) {
    const sh = new V3(0.182 * C.shoulder * s, 1.438, -0.012),
      d = ADIR(s);
    const leather = bucket === "leather";
    const L = [
      [-0.05, 0.022 * g0, 0.026 * g0],
      [-0.042, 0.041 * g0, 0.045 * g0],
      [-0.026, 0.053 * g0, 0.056 * g0],
      [-0.004, 0.058 * g0, 0.059 * g0],
      [0.03, 0.058 * g0, 0.058 * g0],
      [0.08, 0.052 * g0, 0.054 * g0],
      [0.15, 0.048 * g0, 0.05 * g0],
      [0.22, 0.045 * g0, 0.046 * g0],
      [0.28, 0.042 * g0, 0.044 * g0],
      [0.32, 0.043 * g0, 0.047 * g0],
      [0.38, 0.042 * g0, 0.044 * g0],
      [0.45, 0.037 * g0, 0.037 * g0],
      [0.505, 0.033 * g0, 0.032 * g0],
      [0.512, 0.0365 * g0, 0.036 * g0],
      [0.548, 0.0368 * g0, 0.0362 * g0],
      [0.553, 0.029 * g0, 0.028 * g0],
    ];
    if (leather)
      for (const r of L) {
        r[1] += 0.004;
        r[2] += 0.004;
      }
    const g = axisLoft(sh, d, AZ, densify(L, 0.022), 16, { capStart: true });
    const shade = [];
    const side = new V3().crossVectors(d, AZ).normalize();
    acc.add(bucket, g, {
      w: (p) => wArm(p, s, C),
      post: (p, i) => {
        const t = armT(p, s, C);
        const rad = _v5.copy(p).sub(sh).addScaledVector(d, -t);
        const r = rad.length();
        if (r < 1e-5) {
          shade[i] = 0;
          return;
        }
        rad.multiplyScalar(1 / r);
        const th = Math.atan2(rad.dot(side), rad.z);
        const f = leather
          ? foldArm(t, th, C.seed) * 0.7
          : foldArm(t, th, C.seed);
        p.addScaledVector(rad, f);
        shade[i] = f;
      },
      color: (p, nn, i) => {
        const t = armT(p, s, C),
          m = fbm(p.x * 20, p.y * 20, p.z * 20, C.seed + 2, 3);
        let c = mul3(
          col,
          (0.86 + 0.28 * m) * (1 + clamp(shade[i] || 0, -0.005, 0.005) * 55),
        );
        if (t > 0.505) c = cuffCol ? cuffCol : mul3(c, 0.92);
        c = mul3(c, 1 - 0.18 * gauss(t - 0.285, 0.02)); // elbow crease shading
        c = mul3(c, 1 - 0.22 * sstep(-0.02, -0.065, t)); // armpit / top occlusion
        return c;
      },
    });
  }
}
function buildHands(acc, C) {
  const skin = srgb(C.skin),
    hs = C.hand;
  for (const S of ["L", "R"]) {
    const s = SIDE[S],
      H = S === "L" ? HR.L : HR.R;
    const sh = new V3(0.182 * C.shoulder * s, 1.438, -0.012),
      wr = sh.clone().addScaledVector(ADIR(s), 0.555);
    const M = mBasis(H.T, H.F, H.P, wr).multiply(mS(hs, hs, hs)); // hand space: x = t, y = f, z = p
    const flip = S === "L";
    const col = (p) => {
      const m = fbm(p.x * 90, p.y * 90, p.z * 90, C.seed + 9, 2);
      return mul3(skin, 0.9 + 0.16 * m);
    };
    // palm
    const palm = axisLoft(
      new V3(0, -0.05, 0.0),
      AY,
      AZ,
      [
        [0, 0.024, 0.019, 0, 0.0, 2, 0.019],
        [0.03, 0.0265, 0.0175, 0, 0.001, 2.1, 0.0165],
        [0.055, 0.0325, 0.0175, -0.001, 0.003, 2.5, 0.0135],
        [0.085, 0.039, 0.0165, -0.002, 0.004, 2.9, 0.0122],
        [0.115, 0.0415, 0.0135, -0.002, 0.004, 3.0, 0.012],
        [0.137, 0.039, 0.0095, -0.002, 0.003, 2.7, 0.0105],
        [0.145, 0.031, 0.005, -0.002, 0.002, 2.3, 0.006],
      ],
      16,
      { capEnd: true },
    );
    acc.add("skin", palm, {
      pre: (q) => {
        // dorsal side (z < 0): arch across the metacarpals + a bump over each MCP head
        if (q.z < 0) {
          const back = Math.min(1, -q.z / 0.008);
          let bump = 0;
          for (const fn of ["ix", "md", "rg", "pk"]) {
            const fd = FING[fn];
            bump +=
              gauss(q.x - fd.base[1], 0.0075) *
              gauss(q.y - (fd.base[0] - 0.004), 0.009);
          }
          q.z -=
            back *
            (0.0035 * bump + 0.0022 * gauss(q.x, 0.03) * sstep(0.0, 0.05, q.y));
        }
        // heel of the hand fuller on the palm side
        if (q.z > 0) q.z += 0.002 * gauss(q.y - 0.02, 0.02);
      },
      m: M,
      flip,
      w: (p) => {
        const f = _v5.copy(p).sub(wr).dot(H.F);
        return wb(B["tw" + S], B["hand" + S], sstep(-0.03, -0.004, f));
      },
      color: col,
    });
    // thenar
    acc.add("skin", ellip(0.017, 0.027, 0.0125, 12, 9), {
      m: M.clone().multiply(mm(mT(0.019, 0.032, 0.009), mR(0, 0, -0.55))),
      flip,
      w: [
        [B["hand" + S], 0.7],
        [B["th0" + S], 0.3],
      ],
      color: col,
    });
    // fingers
    for (const fn of FINGER_NAMES) {
      const fd = FING[fn];
      const base = new V3(fd.base[1], fd.base[0], fd.base[2]);
      const dir = new V3(fd.dir[1], fd.dir[0], fd.dir[2]).normalize();
      const [l0, l1, l2] = fd.len,
        [r0, r1, r2] = fd.rad,
        tot = l0 + l1 + l2;
      const th = fn === "th";
      const Lr = th
        ? [
            [-0.016, r0 * 1.2, r0 * 1.1],
            [0, r0 * 1.12, r0 * 1.02],
            [l0 * 0.5, r0 * 1.02, r0 * 0.95],
            [l0, r1 * 1.05, r1 * 0.98],
            [l0 + l1 * 0.5, r1 * 0.97, r1 * 0.9],
            [l0 + l1, r2 * 1.03, r2 * 0.95],
            [l0 + l1 + l2 * 0.55, r2 * 0.97, r2 * 0.88],
            [tot - 0.004, r2 * 0.78, r2 * 0.7],
            [tot - 0.001, r2 * 0.42, r2 * 0.38],
          ]
        : [
            [-0.012, r0 * 1.08, r0 * 0.95],
            [0, r0 * 1.06, r0 * 0.9],
            [l0 * 0.5, r0 * 0.97, r0 * 0.8],
            [l0, r1 * 1.06, r1 * 0.9],
            [l0 + l1 * 0.5, r1 * 0.95, r1 * 0.8],
            [l0 + l1, r2 * 1.02, r2 * 0.86],
            [l0 + l1 + l2 * 0.5, r2 * 0.96, r2 * 0.78],
            [tot - 0.0045, r2 * 0.82, r2 * 0.66],
            [tot - 0.0012, r2 * 0.52, r2 * 0.42],
            [tot, r2 * 0.12, r2 * 0.1],
          ];
      const fg = axisLoft(base, dir, new V3(0, 0, 1), Lr, 8, {
        capEnd: true,
        uRep: 1,
      });
      const bw = wr
        .clone()
        .add(hf(s, fd.base[0] * hs, fd.base[1] * hs, fd.base[2] * hs));
      const dw = hf(s, fd.dir[0], fd.dir[1], fd.dir[2]).normalize();
      const b0 = B[fn + 0 + S],
        b1 = B[fn + 1 + S],
        b2 = B[fn + 2 + S],
        bh = B["hand" + S];
      const j1 = l0 * hs,
        j2 = (l0 + l1) * hs;
      acc.add("skin", fg, {
        m: M,
        flip,
        w: (p) => {
          const u = _v5.copy(p).sub(bw).dot(dw);
          if (u < 0.004 * hs)
            return wb(
              bh,
              b0,
              sstep(-0.006 * hs, 0.004 * hs, u) * (th ? 0.75 : 1),
            );
          if (u < j1 - 0.004) return b0;
          if (u < j1 + 0.004)
            return wb(b0, b1, sstep(j1 - 0.004, j1 + 0.004, u));
          if (u < j2 - 0.004) return b1;
          if (u < j2 + 0.004)
            return wb(b1, b2, sstep(j2 - 0.004, j2 + 0.004, u));
          return b2;
        },
        color: (p, nn) => {
          const u = _v5.copy(p).sub(bw).dot(dw);
          let c = col(p);
          const dorsal = -nn.dot(H.P);
          if (u > (tot - 0.013) * hs && dorsal > 0.35)
            c = mix3(c, [0.8, 0.62, 0.58], 0.55); // nail
          c = mix3(
            c,
            [c[0] * 1.05, c[1] * 0.82, c[2] * 0.8],
            (gauss(u - j1, 0.004) + gauss(u, 0.005)) *
              0.35 *
              sstep(0, 0.5, dorsal),
          );
          return c;
        },
      });
    }
  }
}

// ---------------------------------------------------------------- legs + boots
function buildLegs(acc, C, trouserCol) {
  const brc = C.top === "gymnastyorka";
  const wide = C.female ? 1.08 : 1;
  const T = [
    [1.0, 0.09, 0.098, 0, -0.004],
    [0.93, 0.093, 0.098, 0.003, 0.0],
    [0.85, 0.089, 0.093, 0.005, 0.004],
    [0.75, 0.08, 0.084, 0.005, 0.006],
    [0.65, 0.07, 0.074, 0.004, 0.006],
    [0.57, 0.062, 0.066, 0.002, 0.006],
    [0.51, 0.058, 0.061, 0.0, 0.008],
    [0.45, 0.059, 0.062, 0, 0.002],
    [0.37, 0.061, 0.066, 0, -0.006],
    [0.28, 0.056, 0.059, 0, -0.004],
    [0.19, 0.05, 0.052, 0, -0.001],
    [0.13, 0.048, 0.05, 0, 0.0],
    [0.095, 0.046, 0.048, 0, 0.0],
  ];
  for (const s of [1, -1]) {
    const hx = 0.092 * C.hip * s;
    const L = T.map(([y, rx, rz, out, oz]) => {
      const bag = C.female ? 1.02 : 1 + 0.1 * sstep(0.2, 0.5, y) + 0.04;
      let bx = rx * C.girth * bag,
        bz = rz * C.girth * bag,
        o = out;
      if (brc) {
        const b = gauss(y - 0.74, 0.08);
        bx += 0.022 * b;
        o += 0.016 * b;
        bz += 0.006 * b;
        if (y < 0.45) {
          bx *= 0.92;
          bz *= 0.92;
        }
      }
      if (C.female && y < 0.45) {
        bx *= wide;
        bz *= wide;
      }
      return [0.995 - y, bx, bz, -s * o, oz];
    });
    const g = axisLoft(
      new V3(hx, 0.995, -0.004),
      new V3(0, -1, 0),
      AZ,
      densify(L, 0.032),
      16,
    );
    const shade = [],
      blouse = brc
        ? 0.006
        : C.legwear === "leggings"
          ? 0.0035
          : C.legwear === "anklets"
            ? 0.004
            : 0.0;
    acc.add("cloth", g, {
      w: (p) => wLeg(p, s),
      post: (p, i) => {
        const t = 0.995 - p.y;
        const rx = p.x - hx,
          rz = p.z + 0.004,
          r = Math.hypot(rx, rz) || 1;
        const th = Math.atan2(rx * s, rz);
        let f = foldLeg(t, th, C.seed + s, 0);
        if (blouse)
          f +=
            blouse *
            gauss(
              p.y - (brc ? 0.47 : C.legwear === "leggings" ? 0.345 : 0.205),
              0.025,
            ) *
            (0.5 + 0.5 * Math.sin(th * 6 + t * 40));
        p.x += (rx / r) * f;
        p.z += (rz / r) * f;
        shade[i] = f;
      },
      color: (p, nn, i) => {
        const m = fbm(p.x * 18, p.y * 18, p.z * 18, C.seed + 4, 3);
        let c = mul3(
          trouserCol,
          (0.85 + 0.3 * m) * (1 + clamp(shade[i] || 0, -0.005, 0.005) * 55),
        );
        c = mul3(
          c,
          1 - 0.15 * gauss(p.y - 0.51, 0.025) * sstep(0, -0.03, p.z - 0.0),
        ); // back of knee
        c = mul3(c, 1 - 0.12 * sstep(0.2, 0.1, p.y)); // dirt / occlusion low
        const dirt =
          sstep(0.35, 0.12, p.y) * fbm(p.x * 30, p.y * 30, p.z * 30, 77, 2);
        return mix3(c, [0.13, 0.11, 0.08], dirt * 0.5);
      },
    });
    // side seam pocket / map pocket (UK)
    if (C.top === "battledress" && s > 0) {
      acc.add("cloth", sbox(0.13, 0.17, 0.028, 5, 10, 8), {
        m: mm(mT(hx + 0.072, 0.72, 0.03), mR(0, 0.72, 0)),
        w: (p) => wLeg(p, s),
        color: mul3(trouserCol, 0.97),
      });
      acc.add("cloth", sbox(0.135, 0.045, 0.032, 5, 10, 6), {
        m: mm(mT(hx + 0.074, 0.79, 0.032), mR(0, 0.72, 0)),
        w: (p) => wLeg(p, s),
        color: mul3(trouserCol, 0.9),
      });
    }
  }
}
