// src__avatars 12 — head
// Lines 3148-3461 of readable/src__avatars.pretty.js (statement-aligned).
function buildHeadgear(acc, C, sc) {
  const col = srgb(C.headCol);
  const place = (off, rot, sx = 1, sz = 1) =>
    mm(
      mT(HC.x + off[0], HC.y + off[1], HC.z + off[2]),
      mR(rot[0], rot[1], rot[2], "YXZ"),
      mS(sx, 1, sz),
    );
  const paint =
    (seed, k = 0.3) =>
    (p) =>
      mul3(col, 1 - k / 2 + k * fbm(p.x * 25, p.y * 25, p.z * 25, seed, 3));
  if (C.head === "m1") {
    const prof = [
      [0.0, 0.152],
      [0.04, 0.15],
      [0.075, 0.142],
      [0.1, 0.128],
      [0.118, 0.108],
      [0.13, 0.085],
      [0.136, 0.06],
      [0.139, 0.038],
      [0.141, 0.022],
      [0.143, 0.012],
      [0.147, 0.006],
      [0.149, 0.003],
      [0.149, -0.002],
      [0.144, 0.0],
      [0.137, 0.01],
      [0.134, 0.035],
      [0.13, 0.06],
      [0.124, 0.085],
      [0.111, 0.108],
      [0.093, 0.126],
      [0.068, 0.138],
      [0.035, 0.145],
      [0.0, 0.147],
    ];
    const dip = (p) => {
      const a = Math.atan2(p.x, p.z);
      if (p.y < 0.06)
        p.y -= 0.008 * sstep(0.6, 1.6, Math.abs(a)) * sstep(0.06, 0.02, p.y);
    };
    const M = place([0, 0.046, -0.01], [0.12, 0, 0], 0.84, 0.95);
    acc.add("metal", lathe(prof, 36), {
      pre: dip,
      m: M,
      w: B.head,
      color: paint(61),
    });
    // net lattice over the dome
    const ng = lathe(
      [
        [0.0, 0.156],
        [0.042, 0.154],
        [0.078, 0.146],
        [0.104, 0.132],
        [0.122, 0.112],
        [0.134, 0.088],
        [0.14, 0.062],
        [0.143, 0.04],
        [0.145, 0.026],
      ],
      44,
    ).toNonIndexed();
    const NP = ng.attributes.position,
      keep = [];
    for (let t = 0; t < NP.count; t += 3) {
      let x = 0,
        y = 0,
        z = 0;
      for (let k = 0; k < 3; k++) {
        x += NP.getX(t + k);
        y += NP.getY(t + k);
        z += NP.getZ(t + k);
      }
      const lon = Math.atan2(x, z),
        lat = Math.atan2(y / 3, Math.hypot(x, z) / 3);
      const a = lon * 5.2 + lat * 7,
        b2 = lon * 5.2 - lat * 7;
      const fa = a - Math.floor(a),
        fb = b2 - Math.floor(b2);
      if (fa < 0.2 || fb < 0.2) keep.push(t);
    }
    const npos = [];
    for (const t of keep)
      for (let k = 0; k < 3; k++)
        npos.push(NP.getX(t + k), NP.getY(t + k), NP.getZ(t + k));
    const net = new THREE.BufferGeometry();
    net.setAttribute("position", new THREE.Float32BufferAttribute(npos, 3));
    acc.add("cloth", net, {
      pre: dip,
      m: M,
      w: B.head,
      color: [0.1, 0.1, 0.06],
      seams: false,
      boxUV: true,
    });
    // chin straps hanging loose from the bails
    for (const s of [1, -1]) {
      const pts = [
        new V3(0.118 * s, 0.0, -0.004),
        new V3(0.108 * s, -0.035, 0.004),
        new V3(0.096 * s, -0.075, 0.018),
        new V3(0.086 * s, -0.11, 0.03),
      ];
      const nrm = pts.map(() => new V3(s, 0, 0.25).normalize());
      acc.add("cloth", strap(pts, nrm, 0.017, 0.0025), {
        m: M,
        w: B.head,
        color: srgb([0.4, 0.37, 0.25]),
      });
      if (s < 0)
        acc.add("metal", sbox(0.022, 0.028, 0.006, 6, 8, 6), {
          m: M.clone().multiply(mT(0.086 * s, -0.118, 0.032)),
          w: B.head,
          color: [0.35, 0.33, 0.27],
        });
    }
  }
  if (C.head === "brodie") {
    const prof = [
      [0, 0.172],
      [0.05, 0.169],
      [0.085, 0.16],
      [0.108, 0.145],
      [0.122, 0.126],
      [0.129, 0.108],
      [0.133, 0.1],
      [0.15, 0.094],
      [0.168, 0.088],
      [0.176, 0.085],
      [0.177, 0.08],
      [0.17, 0.082],
      [0.148, 0.088],
      [0.13, 0.095],
      [0.122, 0.106],
      [0.115, 0.124],
      [0.1, 0.14],
      [0.078, 0.152],
      [0.045, 0.16],
      [0, 0.163],
    ];
    acc.add("metal", lathe(prof, 44), {
      m: place([0, -0.004, 0.004], [-0.07, 0, 0], 0.91, 1),
      w: B.head,
      color: paint(62, 0.35),
    });
    // chinstrap along the face surface
    for (const s of [1, -1]) {
      const dirs = [
        [0.93, 0.5, -0.02],
        [0.96, 0.18, 0.1],
        [0.9, -0.22, 0.34],
        [0.66, -0.58, 0.5],
        [0.3, -0.8, 0.58],
        [0.0, -0.84, 0.62],
      ];
      const pts = [],
        nrm = [];
      for (const [x, y, z] of dirs) {
        const d = new V3(x * s, y, z).normalize(),
          p = sc(d, new V3());
        const nn = d.clone();
        pts.push(p.addScaledVector(nn, 0.004).add(HC));
        nrm.push(nn);
      }
      acc.add("leather", strap(pts, nrm, 0.014, 0.002), {
        w: B.head,
        color: [0.14, 0.1, 0.07],
      });
    }
  }
  if (C.head === "pilotka") {
    const rings = [];
    const N = 14;
    for (let i = 0; i <= N; i++) {
      const u = i / N,
        z = lerp(0.108, -0.108, u);
      const w = 0.071 * Math.pow(Math.sin(PI * lerp(0.08, 0.92, u)), 0.45);
      const h = 0.024 + 0.05 * Math.pow(Math.sin(PI * u), 0.7) + 0.008 * u;
      rings.push({
        c: new V3(0, 0, z),
        ax: AX,
        az: AY,
        rx: w,
        rz: h,
        rzb: 0.006,
        p: 1.45,
      });
    }
    const g = loft(rings, 20, { capStart: true, capEnd: true });
    acc.add("cloth", g, {
      m: place([-0.006, 0.058, -0.006], [0.0, 0.07, 0.2]),
      w: B.head,
      color: (p) => {
        const q = _v4.copy(p).sub(HC);
        let c = paint(63, 0.25)(p);
        return c;
      },
    });
    // curtain fold line (a slightly proud band along the lower edge)
    const band = [];
    for (let i = 0; i <= N; i++) {
      const u = i / N,
        z = lerp(0.106, -0.106, u);
      const w = 0.074 * Math.pow(Math.sin(PI * lerp(0.08, 0.92, u)), 0.45);
      band.push({
        c: new V3(0, 0.012, z),
        ax: AX,
        az: AY,
        rx: w,
        rz: 0.019,
        rzb: 0.012,
        p: 2.6,
      });
    }
    acc.add("cloth", loft(band, 20, { capStart: true, capEnd: true }), {
      m: place([-0.006, 0.058, -0.006], [0.0, 0.07, 0.2]),
      w: B.head,
      color: mul3(col, 0.9),
    });
  }
  if (C.head === "beret") {
    const prof = [
      [0.064, -0.004],
      [0.069, 0.008],
      [0.071, 0.018],
      [0.083, 0.026],
      [0.099, 0.034],
      [0.107, 0.043],
      [0.108, 0.05],
      [0.102, 0.058],
      [0.09, 0.066],
      [0.05, 0.071],
      [0.0, 0.072],
    ];
    const M = place([-0.012, 0.064, -0.012], [0.0, -0.16, 0.26], 0.98, 1.3);
    acc.add("cloth", lathe(prof, 36), {
      m: M,
      w: B.head,
      color: (p) =>
        mul3(col, 0.85 + 0.3 * fbm(p.x * 60, p.y * 60, p.z * 60, 64, 2)),
    });
    acc.add(
      "cloth",
      lathe(
        [
          [0.064, -0.004],
          [0.058, 0.03],
          [0.0, 0.05],
        ],
        24,
      ),
      { m: M, w: B.head, color: mul3(col, 0.5), flip: true },
    );
    acc.add("cloth", cyl(0.003, 0.004, 0.014, 6), {
      m: M.clone().multiply(mT(0, 0.078, 0)),
      w: B.head,
      color: mul3(col, 0.8),
    });
  }
  if (C.female) {
    // bob: falls to the jaw, curled under
    const hair = srgb(C.hair);
    const L = [
      [0.03, 0.084, 0.1],
      [0.0, 0.088, 0.1],
      [-0.03, 0.091, 0.099],
      [-0.058, 0.094, 0.097],
      [-0.074, 0.09, 0.092],
      [-0.08, 0.08, 0.084],
      [-0.075, 0.07, 0.076],
      [-0.05, 0.064, 0.072],
    ];
    const edge = (th) => {
      const e = Math.min(th - 1.12, TAU - 1.12 - th);
      return -0.017 * sstep(0.45, 0.0, e);
    };
    const rings = L.map(([y, rx, rz]) => ({
      c: new V3(HC.x, HC.y + y, HC.z - 0.012),
      ax: AX,
      az: AZ,
      rx: rx * C.face.width,
      rz,
      p: 2.2,
      dr: edge,
    }));
    const inner = L.map(([y, rx, rz]) => ({
      c: new V3(HC.x, HC.y + y, HC.z - 0.012),
      ax: AX,
      az: AZ,
      rx: rx * C.face.width - 0.009,
      rz: rz - 0.009,
      p: 2.2,
      dr: edge,
    }));
    acc.add("skin", loft(rings, 36, { th0: 1.12, thSpan: TAU - 2.24 }), {
      w: B.head,
      color: (p) => {
        const th = Math.atan2(p.x, p.z - HC.z);
        const k = vnoise(th * 60, ((p.y * 7) / 0.267) * 0.27, 3.1, 7);
        return srgb(mul3(C.hair, 0.72 + 0.5 * k));
      },
    });
    acc.add(
      "skin",
      loft(inner, 36, { th0: 1.12, thSpan: TAU - 2.24, flip: true }),
      { w: B.head, color: srgb(mul3(C.hair, 0.55)) },
    );
  }
}

// ---------------------------------------------------------------- assembly
