// src__weapons 09 — box
// Lines 2406-2732 of readable/src__weapons.pretty.js (statement-aligned).
function shroudAlpha() {
  if (_shroudTex) return _shroudTex;
  _shroudTex = canvasTex(512, 128, (x, w, h) => {
    x.fillStyle = "#fff";
    x.fillRect(0, 0, w, h);
    x.fillStyle = "#000";
    for (let i = 0; i < 9; i++) {
      x.beginPath();
      x.ellipse(34 + i * 54, 64, 20, 26, 0, 0, TAU);
      x.fill();
    }
  });
  return _shroudTex;
}

function buildMG42(g, m) {
  const BY = 62;
  // receiver (stamped box)
  ext(
    g,
    [
      [-72, 30],
      [242, 30],
      [242, 88],
      [-50, 88, 6],
      [-72, 70, 6],
    ],
    46,
    m.park,
    { bevel: 2 },
  );
  for (let i = 0; i < 4; i++)
    for (const s of [-1, 1])
      box(g, -40 + i * 60, 60, s * 23.4, 20, 30, 1.2, m.darkPark, 1);
  box(g, 150, 28, 0, 70, 3, 30, m.bore, 1); // ejection chute (bottom)
  box(g, 180, 70, -23.6, 60, 14, 1.4, m.bore, 1); // belt entry (left)
  box(g, 180, 70, 23.6, 60, 14, 1.4, m.bore, 1); // link exit (right)
  box(g, 160, 88.5, 0, 150, 2, 40, m.darkPark, 0.5); // feed tray
  // rear sight on jacket rear
  box(g, 252, 96, 0, 22, 8, 20, m.park, 1.5);
  ext(
    g,
    [
      [242, 98],
      [270, 98],
      [270, 104],
      [246, 108],
    ],
    12,
    m.park,
    { bevel: 0.8 },
  );
  for (const s of [-1, 1]) box(g, 247, 110, s * 4, 4, 5, 4, m.dark, 0.3);
  // top cover (hinged at the FRONT, lifts at rear)
  const cov = part(g, "cover", 240, 92, 0);
  ext(
    cov,
    [
      [-158, -4],
      [2, -4],
      [2, 6, 4],
      [-10, 12, 3],
      [-150, 12, 3],
      [-160, 6, 3],
    ],
    44,
    m.park,
    { bevel: 2 },
  );
  box(cov, -150, 8, 0, 10, 10, 30, m.darkPark, 2); // latch
  marker(cov, "hR_cover", -140, 24, 8, [0, -1, 0], [1, 0, 0], {
    ...FIST_R,
    wrist: [20, -60, 40],
  });
  marker(cov, "hL_cover", -148, 28, -6, [0, -1, 0], [1, 0, 0], {
    rx: 12,
    rz: 12,
    phiS: 130,
    phiE: -20,
    ys: [14, -2, -16, -30],
    mirror: true,
    thumb: { base: [4, 10, -2], dir: [0.4, 1, 0.3] },
    wrist: [20, -60, 50],
  });
  // barrel jacket: rounded square with perforated sides + barrel-change hatch (right)
  const alpha = shroudAlpha();
  const pmat = m.park.clone ? m.park.clone() : m.park;
  pmat.alphaMap = alpha;
  pmat.alphaTest = 0.5;
  pmat.side = THREE.DoubleSide;
  pmat.transparent = false;
  const jack = new THREE.Group();
  jack.userData.keep = true;
  g.add(jack);
  const L = 400,
    X0 = 242,
    CX = X0 + L / 2;
  const sidePlane = (y, z, rotY, h) => {
    const pg = new THREE.PlaneGeometry(L, h);
    const mm = new THREE.Mesh(pg, pmat);
    mm.position.set(CX, y, z);
    mm.rotation.y = rotY;
    jack.add(mm);
    return mm;
  };
  sidePlane(BY + 4, -23, Math.PI, 40);
  const top = sidePlane(BY + 30, 0, 0, 34);
  top.rotation.set(-Math.PI / 2, 0, 0);
  const hatch = new THREE.Group();
  g.add(hatch);
  box(hatch, 408, BY - 4, 22.4, 300, 40, 2, m.park, 1.5);
  sidePlane(BY + 22, 23, 0, 12);
  box(hatch, 264, BY - 4, 24, 12, 16, 3, m.darkPark, 1);
  box(g, CX, BY - 25, 0, L, 2, 44, m.park, 0.5);
  for (const [y, z] of [
    [BY + 27, -20],
    [BY + 27, 20],
    [BY - 21, -20],
    [BY - 21, 20],
  ])
    cyl(g, X0, X0 + L, 5, 5, m.park, y, z, 10);
  lat(
    g,
    [
      [250, 10],
      [640, 10],
    ],
    m.dark,
    { y: BY, segs: 18 },
  ); // barrel inside
  box(g, 646, BY + 2, 0, 14, 60, 48, m.park, 5); // jacket front
  // muzzle booster
  lat(
    g,
    [
      [650, 14],
      [700, 14],
      [704, 15.5],
      [740, 15.5],
      [744, 18.5],
      [762, 21],
      [762, 13],
    ],
    m.park,
    { y: BY, segs: 26 },
  );
  cyl(g, 761.5, 762.2, 12.5, 12.5, m.bore, BY, 0, 20);
  // front sight (folding post) on jacket front
  box(g, 630, BY + 34, 0, 12, 8, 14, m.park, 1.5);
  ext(
    g,
    [
      [626, BY + 36],
      [636, BY + 36],
      [634, BY + 58, 1],
      [629, BY + 58, 1],
    ],
    3,
    m.dark,
    { bevel: 0.5 },
  );
  // bipod (folded back under jacket)
  box(g, 600, BY - 28, 0, 20, 10, 36, m.park, 2);
  for (const s of [-1, 1]) {
    cyl(g, 420, 600, 5.4, 5.4, m.park, BY - 34, s * 13, 10);
    box(g, 416, BY - 36, s * 13, 18, 6, 12, m.park, 2);
  }
  // trigger housing + grip (bakelite)
  ext(
    g,
    [
      [-40, 32],
      [80, 32],
      [80, 20, 4],
      [60, 14],
      [-40, 20],
    ],
    26,
    m.park,
    { bevel: 2 },
  );
  ext(
    g,
    [
      [12, 16],
      [72, 16],
      [70, 8, 4],
      [62, -8, 8],
      [22, -8, 8],
      [14, 4],
    ],
    11,
    m.park,
    {
      bevel: 1,
      holes: [
        [
          [22, 0, 5],
          [58, 0, 5],
          [64, 12],
          [18, 12],
        ],
      ],
    },
  );
  const trig = part(g, "trigger", 36, 18, 0);
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
  ext(
    g,
    [
      [-32, 20],
      [16, 20],
      [0, -64, 8],
      [-50, -68, 10],
    ],
    30,
    m.bake,
    { bevel: 6, uv: 1 / 90 },
  );
  // buttstock (bakelite) with buffer
  ext(
    g,
    [
      [-70, 84],
      [-100, 84],
      [-440, 76, 8],
      [-446, 62],
      [-446, -44, 8],
      [-300, -30, 30],
      [-150, 18, 20],
      [-70, 30],
    ],
    42,
    m.bake,
    { bevel: 8, uv: 1 / 160 },
  );
  ext(
    g,
    [
      [-452, 78, 3],
      [-444, 78],
      [-444, -46],
      [-452, -46, 3],
    ],
    44,
    m.park,
    { bevel: 2 },
  );
  box(g, -300, 80, 0, 90, 6, 30, m.park, 2); // shoulder rest spring plate
  // charging handle (right side)
  box(g, 90, 50, 23.8, 170, 5, 1.6, m.bore, 1.5);
  const ch = part(g, "charge", 160, 50, 0);
  cylZ(ch, 0, 0, 22, 34, 4, m.main);
  cyl(ch, -14, 14, 5, 5, m.main, 0, 38, 12);
  marker(ch, "hR_charge", 0, 8, 44, [0, -0.5, -0.86], [1, 0, 0], {
    ...FIST_R,
    wrist: [-38, -50, 34],
  });
  // belt + 50-rd drum (moving)
  const belt = part(g, "belt", 180, 0, -24);
  box(belt, 0, 10, -44, 96, 118, 74, m.darkPark, 12);
  box(belt, 0, 70, -44, 70, 5, 50, m.park, 2); // lid ridge
  box(belt, 0, 78, -44, 40, 6, 10, m.park, 2); // handle
  cylZ(belt, 0, 20, -82, -80, 22, m.park, 18);
  for (let i = 0; i < 5; i++) {
    const t = i / 4;
    const y = 58 + t * 18,
      z = -14 + t * 14;
    cartridge(belt, -40, y, z, m, "rifle");
    box(belt, 0, y, z, 12, 13, 13, m.darkPark, 1.5);
  }
  for (let i = 0; i < 4; i++) {
    cartridge(belt, -40, 76, 8 + i * 12, m, "rifle");
    box(belt, 0, 76, 8 + i * 12, 12, 13, 11, m.darkPark, 1.5);
  }
  marker(belt, "hL_belt", 0, -12, -84, [0, 0, 1], [1, 0, 0], {
    rx: 30,
    rz: 24,
    phiS: 110,
    phiE: -60,
    ys: [30, 10, -10, -28],
    mirror: true,
    thumb: { base: [-20, 30, -26], dir: [0.3, 1, 0.1] },
    wrist: [-40, -50, 40],
  });
  // markers
  marker(g, "muzzle", 766, BY, 0);
  marker(g, "eject", 150, 26, 0);
  marker(g, "sightRear", 247, 112.5, 0);
  marker(g, "sightFront", 632, BY + 58, 0);
  const [gx, gy] = gripAxes(16);
  marker(g, "hR", -16, -8, 0, gx, gy, {
    rx: 25,
    rz: 15,
    phiS: 58,
    phiE: -112,
    ys: [30, 11, -7, -24],
    trigger: "trigTip",
    thumb: { base: [-14, 38, -20], dir: [1, 0.3, 0.1] },
  });
  marker(g, "hL", 330, BY + 2, 0, FOREGRIP_AXES[0], FOREGRIP_AXES[1], {
    rx: 30,
    rz: 23,
    phiS: 160,
    phiE: 32,
    ys: [32, 12, -8, -26],
    mirror: true,
    fdy: 0,
    thumb: { base: [-20, 30, -28], dir: [0.2, 1, 0.1] },
    wrist: [-64, -36, 10],
  });
  return { origin: [-16, -8, 0] };
}

