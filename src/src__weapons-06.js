// src__weapons 06 — main
// Lines 1592-1820 of readable/src__weapons.pretty.js (statement-aligned).
function buildMP40(g, m) {
  const TY = 66;
  // receiver tube, end cap, barrel nut, barrel
  lat(
    g,
    [
      [-118, 0],
      [-118, 12],
      [-114, 18.5],
      [-104, 18.5],
      [-102, 17],
      [190, 17],
      [192, 19.5],
      [214, 19.5],
      [216, 14],
    ],
    m.main,
    { y: TY, segs: 32 },
  );
  lat(
    g,
    [
      [214, 10.2],
      [300, 10.2],
      [304, 9.6],
      [404, 9.6],
      [406, 11],
      [420, 11],
      [421, 6],
    ],
    m.main,
    { y: TY - 2, segs: 26 },
  );
  cyl(g, 420.5, 421.2, 5.5, 5.5, m.bore, TY - 2, 0, 16);
  // barrel rest bar (Laufhalter)
  ext(
    g,
    [
      [300, TY - 12],
      [372, TY - 12],
      [372, TY - 26, 3],
      [352, TY - 30, 4],
      [340, TY - 22],
      [300, TY - 22],
    ],
    12,
    m.bake,
    { bevel: 2 },
  );
  // front sight: base, post, hood
  box(g, 398, TY + 13, 0, 14, 18, 10, m.main, 1.5);
  box(g, 400, TY + 25, 0, 3, 9, 2.2, m.dark, 0.3);
  tor(g, 400, TY + 24, 0, 9, 1.6, m.main, "x", Math.PI * 1.25).rotation.x =
    -Math.PI * 0.125;
  // rear sight (flip leaves)
  box(g, -38, TY + 19.5, 0, 22, 7, 16, m.main, 1.5);
  for (const s of [-1, 1]) box(g, -40, TY + 27, s * 5, 3, 9, 5, m.dark, 0.4);
  // ejection port
  box(g, 92, TY + 2, 16.2, 40, 14, 2, m.bore, 2);
  // lower frame (bakelite) + grip
  ext(
    g,
    [
      [-100, TY - 8],
      [94, TY - 8],
      [94, 34, 4],
      [30, 30],
      [20, 30],
      [-10, 30],
      [-26, 30],
      [-100, 40, 8],
    ],
    30,
    m.bake,
    { bevel: 3, uv: 1 / 80 },
  );
  ext(
    g,
    [
      [-30, 36],
      [22, 36],
      [10, -54, 8],
      [-44, -58, 10],
    ],
    30,
    m.bake,
    { bevel: 5, uv: 1 / 80 },
  );
  // trigger guard (steel)
  ext(
    g,
    [
      [18, 30],
      [74, 30],
      [74, 24, 3],
      [66, 12, 6],
      [24, 12, 6],
      [18, 22],
    ],
    10,
    m.main,
    {
      bevel: 1,
      holes: [
        [
          [26, 16, 3],
          [64, 16, 3],
          [68, 26],
          [22, 26],
        ],
      ],
    },
  );
  const trig = part(g, "trigger", 38, 32, 0);
  ext(
    trig,
    [
      [-3, 2],
      [3, 2],
      [4, -9, 2],
      [0, -14, 2],
      [-2, -14],
    ],
    5,
    m.dark,
    { bevel: 0.8 },
  );
  marker(trig, "trigTip", 3, -10, 0);
  // magazine housing (ribbed)
  ext(
    g,
    [
      [92, TY - 10],
      [148, TY - 10],
      [148, -4, 3],
      [92, -4, 3],
    ],
    32,
    m.main,
    { bevel: 1.5 },
  );
  for (const x of [98, 142]) box(g, x, 20, 0, 4, 44, 34, m.main, 1);
  cylZ(g, 120, TY - 20, -16, -19, 5, m.dark);
  // charging handle (left) slot + knob
  box(g, 10, TY + 4, -16.2, 200, 5, 2, m.bore, 1.5);
  const ch = part(g, "charge", -60, TY + 4, 0);
  cyl(ch, -4, 4, 5, 5, m.main, 0, -20).rotation.x = Math.PI / 2;
  cylZ(ch, 0, 0, -16, -34, 4.2, m.main);
  sph(ch, 0, 0, -36, 6.5, m.main, 1, 1, 0.7);
  marker(ch, "hL_charge", 0, -14, -36, [0.1, 1, 0.3], [1, 0, 0], {
    rx: 8,
    rz: 8,
    phiS: 110,
    phiE: -60,
    ys: [10, -4, -18, -30],
    mirror: true,
    thumb: { base: [-8, 14, -12], dir: [0.8, 0.3, 0.2] },
  });
  // folding stock (extended): hinge, struts, butt plate
  box(g, -112, TY - 26, 0, 20, 14, 34, m.main, 3);
  for (const s of [-1, 1])
    tube(
      g,
      [
        [-112, TY - 30, s * 14],
        [-200, TY - 36, s * 14],
        [-318, TY - 40, s * 14],
      ],
      5,
      m.main,
      12,
      8,
    );
  ext(
    g,
    [
      [-330, TY + 4, 4],
      [-316, TY + 4, 4],
      [-314, TY - 112, 6],
      [-330, TY - 116, 6],
    ],
    44,
    m.main,
    { bevel: 3 },
  );
  box(g, -336, TY - 56, 0, 6, 110, 40, m.rubber, 2);
  tor(g, -200, TY - 36, -16, 7, 1.4, m.dark, "z");
  // ---- magazine (moving)
  const mag = part(g, "mag", 120, TY - 20, 0);
  box(mag, 0, -120, 0, 38, 250, 24, m.main, 2);
  for (const s of [-1, 1])
    box(mag, -6, -130, s * 12.4, 6, 200, 1.2, m.dark, 0.5);
  box(mag, 0, -248, 0, 42, 6, 27, m.main, 2);
  marker(mag, "hL_mag", 2, -150, 0, [1, 0, 0], [0, 1, 0], {
    rx: 19,
    rz: 12,
    phiS: 58,
    phiE: -112,
    ys: [30, 12, -6, -22],
    mirror: true,
    thumb: { base: [-10, 38, -22], dir: [1, 0.12, 0.05] },
  });
  // ---- markers
  marker(g, "muzzle", 424, TY - 2, 0);
  marker(g, "eject", 92, TY + 4, 18);
  marker(g, "sightRear", -40, TY + 31.4, 0);
  marker(g, "sightFront", 400, TY + 29.5, 0);
  const [gx, gy] = gripAxes(12);
  marker(g, "hR", -8, 0, 0, gx, gy, {
    rx: 25,
    rz: 15,
    phiS: 58,
    phiE: -112,
    ys: [28, 9, -9, -26],
    trigger: "trigTip",
    thumb: { base: [-14, 34, -21], dir: [1, 0.35, 0.1] },
  });
  marker(g, "hL", 121, 18, 0, [1, 0, 0], [0, 1, 0], {
    rx: 28,
    rz: 16,
    phiS: 58,
    phiE: -112,
    ys: [26, 8, -10, -26],
    mirror: true,
    thumb: { base: [-12, 34, -26], dir: [1, 0.12, 0.05] },
  });
  return { origin: [-8, 0, 0] };
}

