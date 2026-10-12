// src__weapons 08 — park
// Lines 2063-2405 of readable/src__weapons.pretty.js (statement-aligned).
function buildStg44(g, m) {
  const BY = 64;
  // upper receiver (stamped), dust cover, rear sight block
  ext(
    g,
    [
      [-72, 46],
      [236, 46],
      [236, 84, 3],
      [226, 90, 3],
      [-40, 90, 6],
      [-72, 82, 6],
    ],
    30,
    m.park,
    { bevel: 2 },
  );
  box(g, 108, 66, 15.4, 58, 16, 1.4, m.bore, 1.5);
  const cover = new THREE.Group();
  cover.position.set(108, 57, 16.6);
  g.add(cover);
  box(cover, 0, -8, 0.6, 58, 16, 1.2, m.park, 1);
  ext(
    g,
    [
      [180, 90],
      [236, 90],
      [236, 100, 2],
      [196, 102, 2],
      [180, 96],
    ],
    22,
    m.park,
    { bevel: 1.5 },
  );
  ext(
    g,
    [
      [184, 100],
      [224, 100],
      [224, 103],
      [186, 106],
    ],
    12,
    m.dark,
    { bevel: 0.6 },
  );
  for (const s of [-1, 1]) box(g, 186, 107.5, s * 4, 4, 3, 4, m.dark, 0.3);
  // lower receiver / trigger housing + grip
  ext(
    g,
    [
      [-60, 48],
      [96, 48],
      [96, 26, 4],
      [80, 22],
      [0, 22],
      [-50, 30, 6],
    ],
    26,
    m.park,
    { bevel: 2 },
  );
  ext(
    g,
    [
      [14, 24],
      [74, 24],
      [72, 16, 4],
      [64, 0, 8],
      [24, 0, 8],
      [16, 10],
    ],
    11,
    m.park,
    {
      bevel: 1,
      holes: [
        [
          [24, 7, 5],
          [60, 7, 5],
          [66, 20],
          [20, 20],
        ],
      ],
    },
  );
  const trig = part(g, "trigger", 38, 24, 0);
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
      [-30, 26],
      [16, 26],
      [2, -58, 8],
      [-46, -62, 10],
    ],
    30,
    m.bake,
    { bevel: 6, uv: 1 / 90 },
  );
  for (const s of [-1, 1]) cylZ(g, -18, -16, s * 14.6, s * 16, 3, m.dark);
  // mag well
  ext(
    g,
    [
      [92, 48],
      [146, 48],
      [148, 18, 3],
      [90, 18, 3],
    ],
    32,
    m.park,
    { bevel: 1.5 },
  );
  cylZ(g, 88, 40, -15, -18, 4.2, m.dark);
  // barrel, gas cylinder, handguard, front sight, muzzle nut
  lat(
    g,
    [
      [236, 14],
      [250, 14],
      [252, 11],
      [420, 10],
      [424, 9],
      [640, 8.6],
      [640, 5],
    ],
    m.park,
    { y: BY, segs: 24 },
  );
  cyl(g, 639.5, 640.2, 5, 5, m.bore, BY, 0, 14);
  lat(
    g,
    [
      [236, 13],
      [492, 13],
      [494, 10],
      [500, 8],
    ],
    m.park,
    { y: BY + 20, segs: 22 },
  );
  const hg = new THREE.CylinderGeometry(
    17,
    17,
    150,
    26,
    1,
    true,
    -Math.PI * 0.72,
    Math.PI * 1.44,
  );
  hg.rotateZ(-Math.PI / 2);
  hg.translate(318, BY + 18, 0);
  M(g, hg, m.park);
  for (let i = 0; i < 5; i++)
    for (const s of [-1, 1])
      cylZ(g, 262 + i * 26, BY + 18, s * 16.4, s * 17.2, 4.2, m.bore, 12);
  box(g, 494, BY + 10, 0, 16, 40, 22, m.park, 3);
  box(g, 612, BY + 20, 0, 18, 32, 12, m.park, 2);
  box(g, 614, BY + 39, 0, 3.4, 12, 2.4, m.dark, 0.3);
  tor(g, 614, BY + 38, 0, 10, 1.6, m.park, "x", Math.PI * 1.2).rotation.x =
    -Math.PI * 0.1;
  lat(
    g,
    [
      [628, 9.2],
      [628, 11],
      [640, 11],
      [641, 9],
    ],
    m.park,
    { y: BY, segs: 20 },
  );
  tor(g, 494, BY + 2, -14, 7, 1.4, m.dark, "z");
  // stock (wood) + cap
  ext(
    g,
    [
      [-70, 86],
      [-326, 80, 6],
      [-326, -58, 6],
      [-150, 12, 30],
      [-70, 32],
    ],
    38,
    m.wood,
    { bevel: 8, uv: 1 / 200 },
  );
  ext(
    g,
    [
      [-80, 88, 3],
      [-60, 88],
      [-60, 30],
      [-80, 30, 3],
    ],
    40,
    m.park,
    { bevel: 2 },
  );
  ext(
    g,
    [
      [-332, 82, 3],
      [-322, 82],
      [-322, -60],
      [-332, -60, 3],
    ],
    40,
    m.park,
    { bevel: 2 },
  );
  // charging handle (left, rides with carrier)
  box(g, 60, 82, -15.2, 150, 5, 1.6, m.bore, 1.5);
  const ch = part(g, "charge", 150, 82, 0);
  cylZ(ch, 0, 0, -14, -30, 3.6, m.main);
  sph(ch, 0, 0, -32, 5.8, m.main, 1.2, 1, 0.8);
  marker(ch, "hL_charge", 0, -14, -32, [0.1, 1, 0.3], [1, 0, 0], {
    rx: 8,
    rz: 8,
    phiS: 110,
    phiE: -60,
    ys: [10, -4, -18, -30],
    mirror: true,
    thumb: { base: [-8, 14, -12], dir: [0.8, 0.3, 0.2] },
  });
  // curved 30-rd magazine
  const mag = part(g, "mag", 119, 44, 0);
  const curvePts = (off, w) => {
    const pts = [];
    for (let i = 0; i <= 10; i++) {
      const s = (i / 10) * 238;
      pts.push([s * s * 0.0011 + off - w, -s]);
    }
    for (let i = 10; i >= 0; i--) {
      const s = (i / 10) * 238;
      pts.push([s * s * 0.0011 + off + w + s * 0.022, -s]);
    }
    return pts;
  };
  ext(mag, curvePts(0, 20), 24, m.park, { bevel: 1.6 });
  for (const s of [-1, 1])
    ext(
      mag,
      curvePts(-3, 6).map(([x, y]) => [x, y * 0.86 - 20]),
      1.4,
      m.dark,
      { z: s * 12.2, bevel: 0.4 },
    );
  ext(
    mag,
    [
      [40, -236],
      [96, -236],
      [96, -244, 3],
      [40, -244, 3],
    ].map(([x, y]) => [x - 22 + 0, y]),
    27,
    m.park,
    { bevel: 1.5 },
  );
  marker(mag, "hL_mag", 30, -150, 0, [1, 0.25, 0], [-0.25, 1, 0], {
    rx: 22,
    rz: 12,
    phiS: 58,
    phiE: -112,
    ys: [30, 12, -6, -22],
    mirror: true,
    thumb: { base: [-12, 38, -24], dir: [1, 0.12, 0.05] },
  });
  // markers
  marker(g, "muzzle", 644, BY, 0);
  marker(g, "eject", 108, 68, 17);
  marker(g, "sightRear", 186, 109, 0);
  marker(g, "sightFront", 614, BY + 45, 0);
  const [gx, gy] = gripAxes(16);
  marker(g, "hR", -14, -2, 0, gx, gy, {
    rx: 24,
    rz: 15,
    phiS: 58,
    phiE: -112,
    ys: [30, 11, -7, -24],
    trigger: "trigTip",
    thumb: { base: [-14, 38, -20], dir: [1, 0.3, 0.1] },
  });
  marker(g, "hL", 320, BY - 8, 0, FOREGRIP_AXES[0], FOREGRIP_AXES[1], {
    rx: 32,
    rz: 18,
    phiS: 165,
    phiE: 70,
    ys: [32, 12, -8, -26],
    mirror: true,
    fdy: 0,
    thumb: { base: [-12, 30, -22], dir: [0.2, 1, 0.1] },
    wrist: [-58, -34, 10],
  });
  return { origin: [-14, -2, 0] };
}

let _holeTex = null,
  _shroudTex = null;
function canvasTex(w, h, draw) {
  if (typeof document === "undefined") return null;
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const x = c.getContext("2d");
  draw(x, w, h);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}
function heatShieldAlpha() {
  if (_holeTex) return _holeTex;
  _holeTex = canvasTex(256, 512, (x, w, h) => {
    x.fillStyle = "#fff";
    x.fillRect(0, 0, w, h);
    x.fillStyle = "#000";
    // u = around (theta), v = along the barrel
    for (let r = 0; r < 4; r++)
      for (let i = 0; i < 7; i++) {
        x.beginPath();
        x.ellipse(28 + r * 66, 50 + i * 68, 13, 22, 0, 0, TAU);
        x.fill();
      }
  });
  return _holeTex;
}
