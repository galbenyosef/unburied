// src__fx 02 — math
// Lines 321-497 of readable/src__fx.pretty.js (statement-aligned).
function buildAddAtlas() {
  const { c, ctx, img } = canvasOf();
  // 0 glow
  paintCell(img, 0, (u, v, o) => {
    const r = Math.hypot(u, v);
    const g =
      (0.55 * Math.exp(-r * r * 5) + 0.45 * Math.exp(-r * r * 40)) *
      sstep(1, 0.7, r);
    o[0] = o[1] = o[2] = g;
    o[3] = 1;
  });
  // 1 spark (round hot dot; stretched on GPU)
  // 1 streak: capsule with hot core, brighter toward the head (quad top = direction of travel)
  paintCell(img, 1, (u, v, o) => {
    const across =
      Math.exp(-((u * 3.2) ** 2)) * 0.55 + Math.exp(-((u * 9) ** 2)) * 0.7;
    const along = sstep(1, 0.55, Math.abs(v)) * (0.55 + 0.45 * (1 - v) * 0.5);
    o[0] = o[1] = o[2] = across * along * sstep(1, 0.8, Math.abs(u));
    o[3] = 1;
  });
  // 2-5 fire puffs
  for (let i = 0; i < 4; i++) {
    const s = 200 + i * 13;
    paintCell(img, 2 + i, (u, v, o) => {
      const wx = u + (fbm(u * 2 + 1, v * 2, s, 3) - 0.5) * 0.7,
        wy = v + (fbm(u * 2, v * 2 + 4, s + 1, 3) - 0.5) * 0.7;
      const r = Math.hypot(wx, wy * 0.95);
      const n = fbm(wx * 3.5 + 5, wy * 3.5 - 2, s + 2, 5);
      const rid = 1 - Math.abs(fbm(wx * 6, wy * 6, s + 3, 4) * 2 - 1);
      let d = sstep(0.95, 0.15, r + (n - 0.5) * 0.9);
      d *= 0.55 + 0.45 * rid * rid + 0.3 * n;
      d *= sstep(1, 0.85, Math.hypot(u, v));
      o[0] = o[1] = o[2] = clamp(d * d * 1.3, 0, 1);
      o[3] = 1;
    });
  }
  // 6 thin ring
  paintCell(img, 6, (u, v, o) => {
    const r = Math.hypot(u, v),
      a = Math.atan2(v, u);
    const g =
      Math.exp(-(((r - 0.8) / 0.055) ** 2)) * (0.6 + 0.4 * angN(a, 3, 61)) +
      Math.exp(-(((r - 0.72) / 0.14) ** 2)) * 0.25;
    o[0] = o[1] = o[2] = g * sstep(1, 0.93, r);
    o[3] = 1;
  });
  // 7 sparkle star
  paintCell(img, 7, (u, v, o) => {
    const r = Math.hypot(u, v);
    const cross =
      Math.exp(-Math.abs(u) * 40) * Math.exp(-Math.abs(v) * 2.6) +
      Math.exp(-Math.abs(v) * 40) * Math.exp(-Math.abs(u) * 2.6);
    const du = (u + v) * 0.7071,
      dv = (u - v) * 0.7071;
    const diag =
      (Math.exp(-Math.abs(du) * 50) * Math.exp(-Math.abs(dv) * 6) +
        Math.exp(-Math.abs(dv) * 50) * Math.exp(-Math.abs(du) * 6)) *
      0.4;
    o[0] =
      o[1] =
      o[2] =
        (cross * 0.8 +
          diag +
          Math.exp(-r * r * 30) * 0.9 +
          Math.exp(-r * r * 5) * 0.15) *
        sstep(1, 0.8, r);
    o[3] = 1;
  });
  // 8 flare burst: radial rays
  paintCell(img, 8, (u, v, o) => {
    const r = Math.hypot(u, v),
      a = Math.atan2(v, u);
    const rays = Math.pow(angN(a, 9, 81, 3), 3) * 2.4;
    o[0] =
      o[1] =
      o[2] =
        (Math.exp(-r * r * 12) + rays * Math.exp(-r * 2.8) * 0.6) *
        sstep(1, 0.6, r);
    o[3] = 1;
  });
  // 9 plasma filaments
  paintCell(img, 9, (u, v, o) => {
    const r = Math.hypot(u, v);
    const n1 = 1 - Math.abs(fbm(u * 3 + 1, v * 3, 91, 5) * 2 - 1),
      n2 = 1 - Math.abs(fbm(u * 5 - 3, v * 5, 92, 4) * 2 - 1);
    const f = Math.pow(n1, 8) + Math.pow(n2, 10) * 0.7;
    o[0] =
      o[1] =
      o[2] =
        (f * 1.2 + Math.exp(-r * r * 6) * 0.35) * sstep(1, 0.55, r);
    o[3] = 1;
  });
  // 10 ember (irregular hot fleck)
  paintCell(img, 10, (u, v, o) => {
    const a = Math.atan2(v, u),
      r = Math.hypot(u, v);
    const R = 0.35 + 0.2 * angN(a, 2, 101);
    o[0] =
      o[1] =
      o[2] =
        (sstep(R, R * 0.3, r) * 0.9 + Math.exp(-r * r * 6) * 0.25) *
        sstep(1, 0.8, r);
    o[3] = 1;
  });
  // 11 flame tongue (tall)
  paintCell(img, 11, (u, v, o) => {
    const w = 0.5 * (1 - ((v + 1) / 2) ** 0.7) + 0.08;
    const n = fbm(u * 4, v * 3 + 7, 111, 5);
    const d =
      sstep(w, w * 0.2, Math.abs(u + (n - 0.5) * 0.4)) *
      sstep(-1, -0.6, v) *
      sstep(1, 0.5, v);
    o[0] = o[1] = o[2] = d * (0.6 + 0.6 * n);
    o[3] = 1;
  });
  // 12 soft wide ring (ground shock)
  paintCell(img, 12, (u, v, o) => {
    const r = Math.hypot(u, v),
      a = Math.atan2(v, u);
    o[0] =
      o[1] =
      o[2] =
        Math.exp(-(((r - 0.74) / 0.16) ** 2)) *
        (0.5 + 0.5 * angN(a, 4, 121)) *
        sstep(1, 0.9, r);
    o[3] = 1;
  });
  // 13 electric arc streak (for stretched mode)
  paintCell(img, 13, (u, v, o) => {
    const x = u + (fbm(v * 3, 1, 131, 4) - 0.5) * 0.6;
    o[0] =
      o[1] =
      o[2] =
        Math.exp(-((x / 0.07) ** 2)) *
        sstep(1, 0.6, Math.abs(v)) *
        sstep(1, 0.8, Math.abs(u));
    o[3] = 1;
  });
  // 14 heat soft disc (dim core glow)
  paintCell(img, 14, (u, v, o) => {
    const r = Math.hypot(u, v);
    o[0] = o[1] = o[2] = Math.exp(-r * r * 2.5) * sstep(1, 0.6, r);
    o[3] = 1;
  });
  // 15 smoky fire (dirty flame)
  paintCell(img, 15, (u, v, o) => {
    const r = Math.hypot(u, v);
    const n = fbm(u * 5, v * 5, 151, 5);
    o[0] =
      o[1] =
      o[2] =
        sstep(0.9, 0.1, r + (n - 0.5)) * n * n * 1.6 * sstep(1, 0.85, r);
    o[3] = 1;
  });
  ctx.putImageData(img, 0, 0);
  return c;
}

/* ------------------------------------------------------------------ decals */
const DF = {
  bullet_concrete: 0,
  bullet_wood: 1,
  bullet_metal: 2,
  bullet_dirt: 3,
  blood0: 4,
  blood1: 5,
  blood2: 6,
  blood3: 7,
  blood_wall: 8,
  blood_drop: 9,
  bullet_sandbag: 10,
  scorch0: 11,
  scorch1: 12,
  dirt: 13,
  scorch_aether: 14,
  bullet_flesh: 15,
};
