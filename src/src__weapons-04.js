// src__weapons 04 — main
// Lines 991-1333 of readable/src__weapons.pretty.js (statement-aligned).
function buildKar98k(g, m) {
  const BY = 42; // bore height
  // ---- stock (walnut): butt, wrist/grip, fore-end as overlapping extrusions
  ext(
    g,
    [
      [-302, 4, 6],
      [-150, 12],
      [-70, 16],
      [-40, 19],
      [-30, -44, 10],
      [-60, -60],
      [-302, -130, 8],
    ],
    44,
    m.wood,
    { bevel: 7, uv: 1 / 200 },
  );
  ext(
    g,
    [
      [-80, 14],
      [-40, 20, 10],
      [10, 28, 4],
      [40, 30],
      [40, -18],
      [18, -22, 6],
      [2, -26],
      [-12, -44, 8],
      [-30, -54, 10],
      [-70, -62],
      [-90, -58],
    ],
    34,
    m.wood,
    { bevel: 6, uv: 1 / 200 },
  );
  ext(
    g,
    [
      [20, 30],
      [228, 30],
      [260, 34],
      [300, 34],
      [650, 34, 4],
      [652, 16, 4],
      [645, -2, 6],
      [300, -12],
      [160, -18, 8],
      [140, -26],
      [60, -26],
      [40, -22],
      [20, -24],
    ],
    38,
    m.wood,
    { bevel: 6, uv: 1 / 200 },
  );
  // upper handguard
  ext(
    g,
    [
      [300, 42],
      [548, 42],
      [548, 57, 7],
      [310, 57, 7],
    ],
    32,
    m.wood,
    { bevel: 7, uv: 1 / 200 },
  );
  // butt plate + stock disc
  ext(
    g,
    [
      [-306, 6, 2],
      [-298, 6],
      [-298, -132],
      [-306, -132, 2],
    ],
    46,
    m.dark,
    { bevel: 2 },
  );
  cylZ(g, -205, -52, 21, 22.8, 12, m.dark, 20);
  cylZ(g, -205, -52, 22.5, 23.2, 4, m.bore, 10);
  // ---- receiver
  lat(
    g,
    [
      [-8, 0],
      [-8, 13],
      [8, 15.5],
      [72, 15.5],
      [74, 12],
    ],
    m.main,
    { y: BY, segs: 28 },
  ); // rear bridge
  box(g, 64, BY + 18, 0, 10, 6, 18, m.main, 1); // clip guide
  box(g, 64, BY + 20, 0, 6, 3, 10, m.bore, 0.3);
  for (const s of [-1, 1])
    ext(
      g,
      [
        [70, 26],
        [162, 26],
        [162, s < 0 ? 58 : 50, 3],
        [70, s < 0 ? 58 : 50, 3],
      ],
      3.5,
      m.main,
      { z: s * 12.5, bevel: 1 },
    );
  box(g, 116, 28, 0, 92, 4, 26, m.main, 1);
  lat(
    g,
    [
      [160, 12],
      [160, 17.5],
      [228, 17.5],
      [230, 15],
    ],
    m.main,
    { y: BY, segs: 28 },
  ); // receiver ring
  // ---- barrel (stepped contour)
  lat(
    g,
    [
      [228, 14.8],
      [292, 14.8],
      [296, 13.4],
      [420, 12.6],
      [424, 11.6],
      [600, 10.4],
      [604, 9.8],
      [800, 8.8],
      [812, 8.8],
      [818, 8.2],
      [818, 4],
    ],
    m.main,
    { y: BY, segs: 28 },
  );
  cyl(g, 817.8, 818.3, 4, 4, m.bore, BY, 0, 14);
  // rear sight: base, ramp leaf, slider, notch
  box(g, 272, BY + 16, 0, 44, 8, 22, m.main, 2);
  ext(
    g,
    [
      [250, BY + 18],
      [300, BY + 18],
      [300, BY + 21],
      [258, BY + 22.5],
      [250, BY + 22.5],
    ],
    14,
    m.main,
    { bevel: 0.8 },
  );
  box(g, 268, BY + 22, 0, 9, 5, 16, m.dark, 0.8);
  for (const s of [-1, 1])
    box(g, 253, BY + 23.5, s * 4, 4, 3.5, 5, m.dark, 0.3);
  // front sight + hood
  box(g, 800, BY + 11, 0, 20, 5, 16, m.main, 1.5);
  box(g, 803, BY + 17, 0, 3.5, 8, 2.4, m.dark, 0.3);
  const hood = new THREE.CylinderGeometry(
    11,
    11,
    22,
    20,
    1,
    true,
    -Math.PI * 0.6,
    Math.PI * 1.2,
  );
  hood.rotateZ(-Math.PI / 2);
  hood.translate(802, BY + 13, 0);
  M(g, hood, m.main);
  // bands, nose cap, bayonet lug, cleaning rod
  for (const [x, w] of [
    [548, 10],
    [600, 8],
  ]) {
    box(g, x, 24, 0, w, 4, 44, m.main, 1);
    box(g, x, -8.5, 0, w, 4, 40, m.main, 1);
    for (const s of [-1, 1])
      box(g, x, 24 + (s < 0 ? -16 : 16) * 0, s * 20.5, w, 64, 3, m.main, 1);
    box(g, x, 58, 0, w, 3, 30, m.main, 1);
  }
  box(g, 648, 20, 0, 18, 42, 40, m.main, 5); // nose cap
  box(g, 670, 12, 0, 40, 9, 12, m.main, 1.5); // bayonet lug
  cyl(g, 640, 690, 3.2, 3.2, m.main, 26, 0, 10);
  sph(g, 690, 26, 0, 4.4, m.main);
  // sling swivel on lower band (left) and sling slot washer (butt)
  tor(g, 548, 18, -24, 7, 1.4, m.dark, "z");
  box(g, -160, -58, 0, 34, 12, 45, m.bore, 4);
  // ---- trigger guard & floorplate
  ext(
    g,
    [
      [4, -18],
      [150, -18],
      [150, -28, 3],
      [70, -28],
      [62, -30, 4],
      [58, -46, 8],
      [10, -46, 10],
      [0, -30, 4],
    ],
    14,
    m.main,
    {
      bevel: 1,
      holes: [
        [
          [14, -38, 6],
          [52, -38, 6],
          [56, -24],
          [8, -24],
        ],
      ],
    },
  );
  const trig = part(g, "trigger", 30, -20, 0);
  ext(
    trig,
    [
      [-3, 2],
      [3, 2],
      [5, -10, 3],
      [1, -18, 3],
      [-2, -18],
    ],
    5,
    m.dark,
    { bevel: 0.8 },
  );
  marker(trig, "trigTip", 3, -13, 0);
  // ---- bolt (rotates about bore axis, slides along X)
  const bolt = part(g, "bolt", -44, BY, 0);
  lat(
    bolt,
    [
      [0, 0],
      [0, 9],
      [6, 12],
      [30, 12.5],
      [34, 10],
      [36, 9.2],
    ],
    m.main,
    { segs: 22 },
  ); // shroud
  box(bolt, 18, 14, 0, 12, 7, 5, m.main, 1); // safety flag
  lat(
    bolt,
    [
      [35, 9.3],
      [214, 9.3],
      [214, 4],
    ],
    m.main,
    { segs: 22 },
  ); // body
  box(bolt, 120, 0, -9, 90, 4, 2, m.dark, 0.5); // extractor
  const handle = new THREE.Group();
  handle.position.set(56, 0, 0);
  bolt.add(handle);
  tube(
    handle,
    [
      [0, 0, 8],
      [0, -5, 20],
      [-4, -15, 29],
      [-9, -25, 33],
    ],
    4.4,
    m.main,
    16,
    10,
  );
  sph(handle, -11, -29, 34, 8, m.main, 1, 1.15, 1);
  marker(bolt, "hR_bolt", 45, -29, 34, [1, 0, 0.2], [0.28, 0.74, -0.66], {
    rx: 8,
    rz: 8,
    phiS: 70,
    phiE: -110,
    ys: [6, -9, -23, -35],
    thumb: { base: [-4, 14, -12], dir: [0.9, 0.3, 0.2] },
    wrist: [-44, -48, 15],
  });
  // ---- stripper clip w/ 5 rounds (reload only)
  const clip = part(g, "clip", 66, BY + 22, 0);
  clip.userData.restVis = false;
  box(clip, 2, 30, 0, 3, 62, 13, m.dark, 0.5);
  const rounds = part(clip, "clipRounds");
  for (let i = 0; i < 5; i++)
    cartridge(rounds, 3, 6 + i * 11.8, i % 2 ? 0.6 : -0.6, m, "rifle");
  marker(clip, "hR_clip", 30, 40, 14, [0, 0, -1], [1, 0.3, 0], {
    rx: 12,
    rz: 10,
    phiS: 70,
    phiE: -110,
    ys: [12, -3, -17, -29],
    thumb: { base: [-8, 14, -14], dir: [0.8, 0.4, 0.2] },
    wrist: [-50, -50, 10],
  });
  marker(rounds, "hR_push", 34, 84, 10, [0, -1, 0.15], [1, 0, 0], {
    ...FIST_R,
    wrist: [20, -60, 55],
  });
  // ---- markers
  marker(g, "muzzle", 822, BY, 0);
  marker(g, "eject", 110, BY + 12, 14);
  marker(g, "sightRear", 253, BY + 24.7, 0);
  marker(g, "sightFront", 803, BY + 20.9, 0);
  const [gx, gy] = gripAxes(52);
  marker(g, "hR", -20, -22, 0, gx, gy, {
    rx: 20,
    rz: 16,
    phiS: 58,
    phiE: -112,
    ys: [26, 8, -9, -25],
    trigger: "trigTip",
    thumb: { base: [-18, 34, -13], dir: [0.45, 1, 0.1] },
    wrist: [-42, -52, 12],
  });
  marker(g, "hL", 390, 20, 0, FOREGRIP_AXES[0], FOREGRIP_AXES[1], {
    rx: 30,
    rz: 19,
    phiS: 160,
    phiE: 32,
    ys: [30, 10, -10, -28],
    mirror: true,
    fdy: 0,
    thumb: { base: [-18, 34, -22], dir: [0.15, 1, 0.1] },
    wrist: [-60, -32, 8],
  });
  return { origin: [-20, -22, 0] };
}

