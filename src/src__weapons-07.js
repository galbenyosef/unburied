// src__weapons 07 — main
// Lines 1821-2062 of readable/src__weapons.pretty.js (statement-aligned).
function buildThompson(g, m) {
  const BY = 66;
  // upper receiver
  ext(
    g,
    [
      [-82, 40],
      [200, 40],
      [202, 84, 6],
      [190, 92, 4],
      [-70, 92, 6],
      [-82, 80, 6],
    ],
    32,
    m.main,
    { bevel: 2 },
  );
  box(g, 60, 72, 16.2, 150, 6, 1.6, m.bore, 1.5); // cocking slot (right)
  box(g, 150, 62, 16.2, 42, 14, 1.6, m.bore, 2); // ejection port
  // rear sight w/ protective ears
  box(g, -40, 94, 0, 30, 4, 22, m.main, 1);
  for (const s of [-1, 1])
    ext(
      g,
      [
        [-52, 92],
        [-28, 92],
        [-30, 106, 3],
        [-48, 108, 3],
      ],
      3,
      m.main,
      { z: s * 9, bevel: 0.8 },
    );
  box(g, -38, 101, 0, 3, 12, 12, m.main, 0.6);
  cylZ(g, -38, 103, -6.5, 6.5, 2.2, m.bore, 12);
  // lower receiver / trigger frame
  ext(
    g,
    [
      [-66, 42],
      [130, 42],
      [130, 18, 4],
      [96, 18],
      [80, 22],
      [20, 22],
      [-60, 26, 6],
    ],
    28,
    m.main,
    { bevel: 2 },
  );
  for (const s of [-1]) {
    cylZ(g, 0, 32, s * 14, s * 16, 5, m.dark);
    box(g, 0, 26, s * 16, 5, 14, 2, m.dark, 0.6);
    cylZ(g, 50, 32, s * 14, s * 16, 5, m.dark);
  }
  ext(
    g,
    [
      [14, 22],
      [78, 22],
      [76, 14, 4],
      [66, -4, 8],
      [26, -4, 8],
      [16, 8],
    ],
    12,
    m.main,
    {
      bevel: 1,
      holes: [
        [
          [26, 4, 5],
          [62, 4, 5],
          [68, 18],
          [22, 18],
        ],
      ],
    },
  );
  const trig = part(g, "trigger", 38, 22, 0);
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
  // pistol grip (walnut)
  ext(
    g,
    [
      [-34, 24],
      [18, 24],
      [0, -60, 8],
      [-52, -64, 10],
    ],
    32,
    m.wood,
    { bevel: 7, uv: 1 / 120 },
  );
  // barrel + front sight
  lat(
    g,
    [
      [200, 15],
      [214, 15],
      [216, 13],
      [468, 11.5],
      [470, 10.5],
      [470, 6],
    ],
    m.main,
    { y: BY, segs: 26 },
  );
  cyl(g, 469.5, 470.2, 6, 6, m.bore, BY, 0, 16);
  lat(
    g,
    [
      [440, 11.5],
      [440, 13.5],
      [456, 13.5],
      [456, 11.5],
    ],
    m.main,
    { y: BY, segs: 22 },
  );
  ext(
    g,
    [
      [442, BY + 12],
      [456, BY + 12],
      [454, BY + 36.5, 1],
      [448, BY + 36.5, 1],
    ],
    3,
    m.dark,
    { bevel: 0.6 },
  );
  // horizontal fore-end
  ext(
    g,
    [
      [214, 50],
      [386, 50],
      [392, 44, 4],
      [384, 30, 10],
      [226, 28, 10],
      [212, 40, 4],
    ],
    38,
    m.wood,
    { bevel: 8, uv: 1 / 150 },
  );
  tor(g, 380, 26, 0, 7, 1.4, m.dark, "z");
  // stock (walnut) + butt plate
  ext(
    g,
    [
      [-80, 78],
      [-124, 62, 12],
      [-352, 34, 6],
      [-352, -72, 6],
      [-160, -10, 30],
      [-80, 24],
    ],
    38,
    m.wood,
    { bevel: 8, uv: 1 / 200 },
  );
  ext(
    g,
    [
      [-358, 36, 3],
      [-350, 36],
      [-350, -74],
      [-358, -74, 3],
    ],
    40,
    m.dark,
    { bevel: 2 },
  );
  tor(g, -250, -40, 0, 7, 1.4, m.dark, "z");
  // cocking knob (right side)
  const ch = part(g, "charge", 0, 76, 0);
  cylZ(ch, 0, 0, 14, 26, 4, m.main);
  sph(ch, 0, 0, 29, 7, m.main, 1, 1, 0.8);
  marker(ch, "hR_charge", 0, 8, 30, [0, -0.5, -0.86], [1, 0, 0], {
    ...FIST_R,
    wrist: [-38, -50, 34],
  });
  // magazine (20 rd stick)
  const mag = part(g, "mag", 110, 30, 0);
  box(mag, 0, -58, 0, 30, 150, 24, m.main, 2);
  for (const s of [-1, 1]) box(mag, 0, -66, s * 12.3, 20, 120, 1, m.dark, 0.4);
  box(mag, 0, -134, 0, 32, 4, 26, m.main, 1.5);
  marker(mag, "hL_mag", 2, -90, 0, [1, 0, 0], [0, 1, 0], {
    rx: 15,
    rz: 12,
    phiS: 58,
    phiE: -112,
    ys: [30, 12, -6, -22],
    mirror: true,
    thumb: { base: [-10, 38, -22], dir: [1, 0.12, 0.05] },
  });
  // markers
  marker(g, "muzzle", 474, BY, 0);
  marker(g, "eject", 150, 66, 18);
  marker(g, "sightRear", -38, 103, 0);
  marker(g, "sightFront", 451, BY + 37, 0);
  const [gx, gy] = gripAxes(20);
  marker(g, "hR", -14, -6, 0, gx, gy, {
    rx: 25,
    rz: 16,
    phiS: 58,
    phiE: -112,
    ys: [30, 11, -7, -24],
    trigger: "trigTip",
    thumb: { base: [-14, 38, -21], dir: [1, 0.3, 0.1] },
  });
  marker(g, "hL", 300, 40, 0, FOREGRIP_AXES[0], FOREGRIP_AXES[1], {
    rx: 14,
    rz: 19,
    phiS: 160,
    phiE: 32,
    ys: [32, 12, -8, -26],
    mirror: true,
    fdy: 0,
    thumb: { base: [-10, 30, -24], dir: [0.2, 1, 0.1] },
    wrist: [-54, -34, 10],
  });
  return { origin: [-14, -6, 0] };
}

