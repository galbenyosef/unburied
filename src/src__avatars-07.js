// src__avatars 07 — skin
// Lines 1707-2050 of readable/src__avatars.pretty.js (statement-aligned).
function paintFace(C, sc) {
  if (typeof document === "undefined") return null;
  const W = FACE_W,
    H = FACE_H,
    F = C.face,
    fem = C.female,
    R = mulberry(C.seed * 31 + 5);
  const cv = document.createElement("canvas");
  cv.width = W;
  cv.height = H;
  const x = cv.getContext("2d");
  const lut = frontLUT(sc);
  const px = (hx, hy) => [(lut(hx, hy) / TAU + 0.5) * W, (1 - faceV(hy)) * H];
  const rgb = (c, a = 1) =>
    `rgba(${Math.round(c[0] * 255)},${Math.round(c[1] * 255)},${Math.round(c[2] * 255)},${a})`;
  const skin = C.skin,
    hair = C.hair,
    brow = C.brow;
  // ---- per-texel base: skin mottling, hair, stubble
  const img = x.createImageData(W, H),
    D = img.data;
  const headRows = Math.round((1 - FACE_V0) * H);
  for (let r = 0; r < H; r++) {
    const v = 1 - (r + 0.5) / H;
    const y =
      FACE_YMIN + ((v - FACE_V0) / (1 - FACE_V0)) * (FACE_YMAX - FACE_YMIN);
    for (let c = 0; c < W; c++) {
      const o = (r * W + c) * 4;
      if (r >= headRows) {
        D[o] = D[o + 1] = D[o + 2] = 255;
        D[o + 3] = 255;
        continue;
      }
      const th = (c / W - 0.5) * TAU,
        ath = Math.abs(th);
      const m = vnoise(th * 9, y * 70, 1.3, C.seed) - 0.5,
        fine = hash3(c, r, 7, C.seed) - 0.5;
      let k = 1 + m * 0.09 + fine * 0.035;
      let col = [skin[0] * k, skin[1] * k, skin[2] * k];
      // warmer / darker toward the sides and under the jaw
      col = mix3(
        col,
        [col[0] * 0.92, col[1] * 0.82, col[2] * 0.8],
        sstep(0.9, 1.7, ath) * 0.3 + sstep(-0.09, -0.125, y) * 0.5,
      );
      col = mix3(
        col,
        [col[0] * 1.04, col[1] * 0.98, col[2] * 0.86],
        sstep(0.03, 0.07, y) * 0.35,
      ); // warmer / yellower forehead
      if (!fem) {
        const gr =
          sstep(0.5, 0.8, vnoise(th * 14, y * 90, 7.7, C.seed + 9)) *
          (0.6 + 0.4 * hash3(c, r, 5, 1));
        col = mix3(col, [col[0] * 0.8, col[1] * 0.74, col[2] * 0.68], gr * 0.2);
      }
      if (!fem && F.stubble > 0) {
        const beard =
          sstep(-0.03, -0.05, y) *
          sstep(1.5, 1.2, ath) *
          (1 - gauss(th, 0.24) * bell(y, -0.082, -0.077, -0.05, -0.045));
        const bm =
          clamp(beard, 0, 1) *
          F.stubble *
          (1 - 0.6 * gauss(th, 0.3) * sstep(-0.075, -0.06, y));
        const dot = hash3(c * 3, r * 3, 11, C.seed) < 0.55 ? 1 : 0.35;
        col = mix3(
          col,
          [
            skin[0] * 0.5 + hair[0] * 0.18,
            skin[1] * 0.47 + hair[1] * 0.18,
            skin[2] * 0.52 + hair[2] * 0.22,
          ],
          clamp(bm * dot * 1.9, 0, 0.62),
        );
      }
      const hl = hairLine(th, fem) + (fem ? 0.004 : 0);
      const hw = sstep(hl - 0.004, hl + 0.006, y) * sstep(-0.085, -0.07, y);
      if (hw > 0) {
        const strand = fem
          ? vnoise(th * 60, y * 7, 3.1, C.seed + 2)
          : vnoise(th * 110, y * 160, 3.1, C.seed + 2);
        const strand2 = fem
          ? vnoise(th * 150, y * 14, 5.3, C.seed + 3)
          : vnoise(th * 260, y * 300, 5.3, C.seed + 3);
        const hk =
          0.62 +
          0.55 * strand +
          0.25 * (strand2 - 0.5) -
          0.18 * sstep(hl + 0.012, hl, y);
        const hc = [hair[0] * hk, hair[1] * hk, hair[2] * hk];
        const edge =
          hash3(c, r, 3, 9) < sstep(hl - 0.004, hl + 0.008, y) ? 1 : 0.35;
        col = mix3(col, hc, clamp(hw * 1.15, 0, 1) * edge);
      }
      D[o] = clamp(col[0] * 255, 0, 255);
      D[o + 1] = clamp(col[1] * 255, 0, 255);
      D[o + 2] = clamp(col[2] * 255, 0, 255);
      D[o + 3] = 255;
    }
  }
  x.putImageData(img, 0, 0);
  const blob = (hx, hy, rx, ry, color, a0, rot = 0) => {
    const [X, Y] = px(hx, hy);
    x.save();
    x.translate(X, Y);
    x.rotate(rot);
    x.scale(rx, ry);
    const g = x.createRadialGradient(0, 0, 0, 0, 0, 1);
    g.addColorStop(0, rgb(color, a0));
    g.addColorStop(1, rgb(color, 0));
    x.fillStyle = g;
    x.beginPath();
    x.arc(0, 0, 1, 0, TAU);
    x.fill();
    x.restore();
  };
  const stroke = (pts, w, color, a) => {
    x.strokeStyle = rgb(color, a);
    x.lineWidth = w;
    x.lineCap = "round";
    x.lineJoin = "round";
    x.beginPath();
    pts.forEach(([hx, hy], i) => {
      const [X, Y] = px(hx, hy);
      if (i) x.lineTo(X, Y);
      else x.moveTo(X, Y);
    });
    x.stroke();
  };
  const fill = (pts, color, a) => {
    x.fillStyle = rgb(color, a);
    x.beginPath();
    pts.forEach(([hx, hy], i) => {
      const [X, Y] = px(hx, hy);
      if (i) x.lineTo(X, Y);
      else x.moveTo(X, Y);
    });
    x.closePath();
    x.fill();
  };
  const red = [skin[0] * 1.02, skin[1] * 0.62, skin[2] * 0.58],
    dark = [skin[0] * 0.45, skin[1] * 0.32, skin[2] * 0.3];
  const ew = 0.0328 * F.width;
  for (const s of [1, -1]) {
    blob(0.047 * s, -0.016, 34, 26, red, fem ? 0.3 : 0.2); // cheek colour
    blob(ew * s, 0.022, 28, 12, dark, 0.42); // upper socket shadow
    blob(ew * s, -0.004, 24, 9, dark, 0.3 + 0.15 * F.age); // under-eye
    blob(0.0165 * s, 0.012, 6, 10, dark, 0.14); // inner corner / nose side
    blob(ew * s, 0.0128, 13, 6, [0.16, 0.1, 0.08], 0.6); // behind the eyeball
    blob(0.0088 * s, -0.0418, 3.2, 1.8, [0.22, 0.11, 0.09], 0.4); // nostril
    stroke(
      [
        [0.0175 * s, -0.032],
        [0.023 * s, -0.046],
        [0.027 * s, -0.06],
      ],
      3,
      dark,
      0.14 + 0.18 * F.age,
    ); // nasolabial
    blob(0.038 * s, -0.085, 30, 10, dark, 0.2); // jaw shadow
    if (fem) {
      blob(0.05 * s, -0.03, 26, 12, dark, 0.14); // cheekbone contour
      stroke(
        [
          [(ew - 0.012) * s, 0.0128],
          [ew * s, 0.018],
          [(ew + 0.013) * s, 0.0145],
        ],
        2.4,
        [0.08, 0.05, 0.04],
        0.5,
      ); // lash line
    }
    // eyebrow: short hairs along an arch, dense at the inner end
    const nB = fem ? 26 : 34;
    for (let i = 0; i < nB; i++) {
      const t = i / (nB - 1),
        bx = lerp(0.011, 0.053, t);
      const by =
        0.0335 +
        0.0055 * Math.sin(PI * clamp(t * 1.15, 0, 1)) -
        0.004 * t +
        (R() - 0.5) * 0.0016;
      const len = (fem ? 0.005 : 0.0062) * (1.2 - 0.5 * t),
        ang = lerp(0.9, 0.15, t);
      const th = (fem ? 1.05 : 1.25) * Math.max(0.8, F.brow) * (1.3 - 0.6 * t);
      for (let k = 0; k < 2; k++) {
        const oy = (R() - 0.5) * 0.003;
        stroke(
          [
            [bx * s, by + oy],
            [
              (bx + Math.cos(ang) * len) * s,
              by + oy + Math.sin(ang) * len * 0.6,
            ],
          ],
          1.9 * th,
          brow,
          0.45,
        );
      }
    }
    // upper lid crease + lash line hint
    stroke(
      [
        [(ew - 0.012) * s, 0.0205],
        [ew * s, 0.0235],
        [(ew + 0.013) * s, 0.0205],
      ],
      2,
      dark,
      0.35,
    );
  }
  // nose tip + bridge highlight
  blob(0, -0.028, 12, 9, red, 0.18);
  // lips
  const lipC = F.lipCol || [skin[0] * 0.86, skin[1] * 0.58, skin[2] * 0.55];
  const mw = 0.0235;
  fill(
    [
      [-mw, -0.0633],
      [-0.013, -0.0566],
      [-0.0045, -0.0548],
      [0, -0.0562],
      [0.0045, -0.0548],
      [0.013, -0.0566],
      [mw, -0.0633],
      [0.01, -0.0628],
      [0, -0.063],
      [-0.01, -0.0628],
    ],
    lipC,
    fem ? 0.95 : 0.42,
  );
  fill(
    [
      [-mw, -0.0633],
      [-0.01, -0.0638],
      [0, -0.0636],
      [0.01, -0.0638],
      [mw, -0.0633],
      [0.014, -0.0705],
      [0, -0.0745],
      [-0.014, -0.0705],
    ],
    lipC,
    fem ? 0.9 : 0.4,
  );
  blob(0, -0.0695, 14, 4, [1, 0.85, 0.8], fem ? 0.22 : 0.1); // lower lip sheen
  stroke(
    [
      [-mw, -0.0634],
      [-0.012, -0.0628],
      [0, -0.0633],
      [0.012, -0.0628],
      [mw, -0.0634],
    ],
    2.2,
    [0.25, 0.1, 0.09],
    0.75,
  );
  blob(
    0,
    -0.047,
    16,
    8,
    [skin[0] * 1.12, skin[1] * 1.08, skin[2] * 1.05],
    0.32,
  ); // light under the nose (counters its shadow)
  if (F.mustache) {
    // full-width chevron that extends past the mouth corners and turns up at the tips
    for (let i = 0; i < 420; i++) {
      const t = R() * 2 - 1,
        at = Math.abs(t),
        bx = t * 0.034;
      const tipLift = 0.009 * sstep(0.7, 1.0, at);
      const by =
        -0.0535 +
        (R() - 0.5) * 0.008 * (1 - 0.55 * at) -
        0.003 * sstep(0.2, 0.7, at) +
        tipLift;
      const dx = Math.sign(t) * (0.004 + 0.002 * at),
        dy = -0.003 + 0.006 * sstep(0.75, 1.0, at);
      stroke(
        [
          [bx, by + 0.002],
          [bx + dx, by + dy],
        ],
        1.7,
        [hair[0] * 0.9, hair[1] * 0.85, hair[2] * 0.8],
        0.62,
      );
    }
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

// ---------------------------------------------------------------- neck
function buildNeck(acc, C) {
  const skin = srgb(C.skin);
  const g = axisLoft(
    new V3(0, 1.462, -0.02),
    AY,
    AZ,
    [
      [0, 0.064, 0.062, 0, 0.0],
      [0.04, 0.061, 0.061, 0, 0.004],
      [0.09, 0.0585 * C.face.width, 0.059, 0, 0.004],
      [0.135, 0.058 * C.face.width, 0.057, 0, 0.004],
      [0.18, 0.05, 0.048, 0, 0.01],
    ],
    16,
  );
  if (!C.female) {
    // larynx
    const P = g.attributes.position;
    for (let i = 0; i < P.count; i++) {
      const x = P.getX(i),
        y = P.getY(i),
        z = P.getZ(i);
      if (z > 0.02)
        P.setZ(i, z + 0.006 * gauss(x, 0.008) * gauss(y - 1.545, 0.012));
    }
  }
  acc.add("skin", g, {
    w: wNeck,
    color: (q) =>
      mul3(
        skin,
        0.9 *
          lerp(0.62, 1, sstep(1.49, 1.55, q.y)) *
          (1 - 0.32 * sstep(1.585, 1.635, q.y) * sstep(-0.01, 0.03, q.z)) *
          (1 - 0.28 * sstep(1.54, 1.6, q.y) * sstep(0.0, -0.03, q.z)),
      ),
  });
}

// ---------------------------------------------------------------- arms + hands
