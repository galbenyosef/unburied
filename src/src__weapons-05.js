// src__weapons 05 — main
// Lines 1334-1591 of readable/src__weapons.pretty.js (statement-aligned).
function buildTrench(g, m) {
  const BY = 40;
  // ---- receiver
  ext(
    g,
    [
      [0, 58, 4],
      [158, 58, 4],
      [188, 54, 6],
      [196, 26],
      [182, 3, 6],
      [22, 3],
      [4, 12],
      [0, 22],
    ],
    34,
    m.main,
    { bevel: 1.8 },
  );
  box(g, 92, 45, 16.6, 96, 20, 1.4, m.bore, 0.5); // ejection port (right)
  box(g, 108, 7, 0, 70, 3, 22, m.bore, 0.5); // loading port (bottom)
  for (const s of [-1, 1])
    for (const x of [30, 150]) cylZ(g, x, 20, s * 16.5, s * 17.6, 3, m.dark);
  // tangs + trigger guard
  ext(
    g,
    [
      [-60, 38],
      [4, 50],
      [4, 40],
      [-60, 30],
    ],
    18,
    m.main,
    { bevel: 1 },
  );
  ext(
    g,
    [
      [0, 4],
      [60, 4],
      [58, -6, 4],
      [48, -28, 10],
      [10, -28, 10],
      [0, -8, 4],
    ],
    12,
    m.main,
    {
      bevel: 1,
      holes: [
        [
          [12, -20, 6],
          [46, -20, 6],
          [50, 0],
          [8, 0],
        ],
      ],
    },
  );
  const trig = part(g, "trigger", 28, 2, 0);
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
  // hammer (exposed)
  const ham = part(g, "hammer", 6, 32, 0);
  ext(
    ham,
    [
      [-4, -6],
      [5, -6],
      [4, 22],
      [-6, 32, 3],
      [-16, 34, 3],
      [-14, 28],
      [-6, 22],
    ],
    9,
    m.dark,
    { bevel: 1 },
  );
  // ---- stock (straight grip)
  ext(
    g,
    [
      [4, 50],
      [-40, 38, 12],
      [-330, 5, 6],
      [-330, -112, 6],
      [-120, -40, 20],
      [-40, -12, 10],
      [4, -6],
    ],
    40,
    m.wood,
    { bevel: 8, uv: 1 / 200 },
  );
  ext(
    g,
    [
      [-336, 7, 3],
      [-328, 7],
      [-328, -114],
      [-336, -114, 3],
    ],
    42,
    m.rubber,
    { bevel: 3 },
  );
  tor(g, -250, -80, 0, 7, 1.4, m.dark, "z");
  // ---- barrel + mag tube
  lat(
    g,
    [
      [190, 13],
      [206, 13],
      [210, 12],
      [700, 11],
      [704, 10.4],
      [704, 9],
    ],
    m.main,
    { y: BY, segs: 26 },
  );
  cyl(g, 703.5, 704.2, 9, 9, m.bore, BY, 0, 16);
  sph(g, 694, BY + 11.5, 0, 2.2, m.brass); // bead
  lat(
    g,
    [
      [190, 11.5],
      [640, 11.5],
      [646, 10.5],
      [652, 8],
    ],
    m.main,
    { y: 13, segs: 22 },
  );
  // heat shield (perforated, open underneath)
  const holes = heatShieldAlpha();
  const hsMat = m.main.clone ? m.main.clone() : m.main;
  hsMat.alphaMap = holes;
  hsMat.alphaTest = 0.5;
  hsMat.side = THREE.DoubleSide;
  hsMat.transparent = false;
  const hs = new THREE.CylinderGeometry(
    19.5,
    19.5,
    400,
    34,
    1,
    true,
    Math.PI * 0.25,
    Math.PI * 1.5,
  );
  hs.rotateZ(-Math.PI / 2);
  hs.translate(435, BY + 1, 0);
  M(g, hs, hsMat).userData.keep = true;
  g.children[g.children.length - 1].userData.keep = true;
  for (const x of [232, 632]) {
    const ring = new THREE.CylinderGeometry(
      21,
      21,
      12,
      34,
      1,
      true,
      Math.PI * 0.2,
      Math.PI * 1.6,
    );
    ring.rotateZ(-Math.PI / 2);
    ring.translate(x, BY + 1, 0);
    M(g, ring, m.main);
  }
  // bayonet adapter + lug + swivel
  lat(
    g,
    [
      [650, 12],
      [650, 15],
      [690, 15],
      [692, 12.5],
    ],
    m.main,
    { y: BY, segs: 24 },
  );
  box(g, 672, 22, 0, 40, 30, 22, m.main, 4);
  box(g, 680, 3, 0, 36, 8, 10, m.main, 1.5);
  tor(g, 660, 2, 0, 7, 1.4, m.dark, "z");
  // ---- pump (moving): corncob fore-end on the mag tube + action bar
  const pump = part(g, "pump");
  const prof = [
    [262, 12],
    [262, 17],
  ];
  for (let i = 0; i < 12; i++) {
    const x = 266 + i * 15;
    prof.push([x, 20], [x + 7, 22.5], [x + 12, 20]);
  }
  prof.push([448, 17], [450, 12]);
  lat(pump, prof, m.wood, { y: 13, segs: 30 });
  cyl(pump, 150, 266, 3.2, 3.2, m.main, 16, -12, 10);
  const bolt = part(g, "bolt");
  box(bolt, 70, 47, 0, 120, 18, 28, m.main, 2);
  box(bolt, 12, 47, 0, 8, 16, 26, m.main, 1.5);
  marker(pump, "hL", 360, 13, 0, FOREGRIP_AXES[0], FOREGRIP_AXES[1], {
    rx: 24,
    rz: 22,
    phiS: 158,
    phiE: 32,
    ys: [30, 10, -10, -28],
    mirror: true,
    fdy: 0,
    thumb: { base: [-10, 30, -28], dir: [0.2, 1, 0.1] },
    wrist: [-58, -34, 10],
  });
  // shell for reload loop
  const shell = part(g, "shell", 90, 6, 0);
  shell.userData.restVis = false;
  cartridge(shell, 0, 0, 0, m, "shotgun");
  marker(shell, "hL_shell", -8, -14, 0, [0, 1, 0], [1, 0, 0.1], {
    rx: 12,
    rz: 11,
    phiS: 130,
    phiE: -40,
    ys: [18, 2, -13, -26],
    mirror: true,
    thumb: { base: [4, 8, -16], dir: [0.3, 1, 0.3] },
  });
  // ---- markers
  marker(g, "muzzle", 708, BY, 0);
  marker(g, "eject", 92, 48, 18);
  marker(g, "sightRear", 30, 68, 0);
  marker(g, "sightFront", 694, BY + 21, 0);
  const [gx, gy] = gripAxes(62);
  marker(g, "hR", -40, 14, 0, gx, gy, {
    rx: 21,
    rz: 18,
    phiS: 58,
    phiE: -112,
    ys: [26, 7, -10, -26],
    trigger: "trigTip",
    thumb: { base: [-16, 36, -15], dir: [0.3, 1, 0.1] },
    wrist: [-40, -58, 14],
  });
  return { origin: [-40, 14, 0] };
}

