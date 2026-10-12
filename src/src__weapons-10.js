// src__weapons 10 — brass
// Lines 2733-3081 of readable/src__weapons.pretty.js (statement-aligned).
function buildAether(g, m, up) {
  const A = aetherMats(up);
  g.userData.aether = A;
  const BY = 60;
  // grip (black bakelite w/ finger grooves) + brass pommel
  ext(
    g,
    [
      [-34, 40],
      [22, 40],
      [18, 18, 6],
      [10, 12, 4],
      [14, 2, 5],
      [6, -6, 4],
      [10, -18, 5],
      [2, -26, 4],
      [4, -38, 5],
      [-6, -60, 6],
      [-48, -62, 8],
      [-44, 0, 20],
    ],
    28,
    m.rubber,
    { bevel: 5 },
  );
  lat(
    g,
    [
      [-8, 0],
      [-8, 16],
      [0, 18],
      [6, 14],
      [8, 0],
    ],
    m.brass,
    { segs: 20 },
  ).position.set(-26, -64, 0);
  g.children[g.children.length - 1].rotation.z = Math.PI / 2 - 20 * D2R;
  // body housing (brass) — bulbous rear dome + main block
  lat(
    g,
    [
      [-58, 0],
      [-58, 6],
      [-52, 16],
      [-40, 23],
      [-20, 26],
      [0, 26],
      [10, 24],
      [14, 20],
    ],
    m.brassMain,
    { y: BY, segs: 32 },
  );
  ext(
    g,
    [
      [-30, 38],
      [120, 38],
      [132, 50, 6],
      [132, 72, 6],
      [-10, 78, 10],
      [-30, 70, 8],
    ],
    34,
    m.brassMain,
    { bevel: 4 },
  );
  // rear fins
  for (let i = 0; i < 3; i++) {
    const f = new THREE.Group();
    f.position.set(-46, BY, 0);
    f.rotation.x = (i * TAU) / 3 + Math.PI / 2;
    g.add(f);
    ext(
      f,
      [
        [-18, 0],
        [18, 0],
        [4, 16, 3],
        [-16, 34, 4],
        [-24, 32, 3],
      ],
      3,
      m.brass,
      { bevel: 0.8 },
    ).position.y = 18;
  }
  // barrel: tapered brass w/ coils
  lat(
    g,
    [
      [120, 18],
      [130, 17],
      [196, 11],
      [204, 11],
      [206, 8],
    ],
    m.brassMain,
    { y: BY, segs: 30 },
  );
  for (let i = 0; i < 4; i++) {
    const x = 142 + i * 15,
      r = 16.5 - i * 1.4;
    tor(g, x, BY, 0, r, 2.4, m.copper, "x");
    tor(g, x + 6, BY, 0, r - 1.3, 1.0, A.glow, "x");
  }
  // emitter: flared dish + 3 vanes + glowing core
  lat(
    g,
    [
      [200, 9],
      [208, 9],
      [214, 14],
      [222, 20],
      [224, 19],
      [216, 10],
      [216, 0],
    ],
    m.brass,
    { y: BY, segs: 30 },
  );
  sph(g, 214, BY, 0, 6.5, A.glow);
  for (let i = 0; i < 3; i++) {
    const f = new THREE.Group();
    f.position.set(0, BY, 0);
    f.rotation.x = (i * TAU) / 3;
    g.add(f);
    ext(
      f,
      [
        [196, 10],
        [226, 10],
        [232, 26, 3],
        [212, 24, 3],
      ],
      2.4,
      m.brass,
      { bevel: 0.6 },
    );
  }
  // dial gauge (right side), pipes
  cylZ(g, 50, 58, 16, 22, 13, m.brass, 24);
  cylZ(g, 50, 58, 22, 22.6, 11, A.glow, 20);
  box(g, 50, 62, 23, 1.2, 9, 0.6, m.bore, 0.2).rotation.z = 0.5;
  tube(
    g,
    [
      [100, 90, 12],
      [124, 88, 16],
      [138, 76, 18],
      [146, 64, 18],
    ],
    2.6,
    m.copper,
    20,
    8,
  );
  tube(
    g,
    [
      [100, 90, -12],
      [124, 88, -16],
      [138, 76, -18],
      [146, 64, -18],
    ],
    2.6,
    m.copper,
    20,
    8,
  );
  // trigger guard (brass ring) + trigger
  ext(
    g,
    [
      [12, 40],
      [70, 40],
      [68, 32, 4],
      [56, 14, 8],
      [18, 16, 8],
      [10, 30, 4],
    ],
    8,
    m.brass,
    {
      bevel: 1.2,
      holes: [
        [
          [22, 22, 6],
          [54, 22, 6],
          [62, 36],
          [18, 36],
        ],
      ],
    },
  );
  const trig = part(g, "trigger", 34, 40, 0);
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
    m.brass,
    { bevel: 0.8 },
  );
  marker(trig, "trigTip", 3, -10, 0);
  // capsule cradle (brass clamps) + capsule (moving)
  for (const x of [-4, 92]) box(g, x, 82, 0, 10, 12, 30, m.brass, 3);
  const cap = part(g, "capsule", 44, 94, 0);
  cyl(cap, -46, 46, 12.5, 12.5, m.glass, 0, 0, 24);
  cyl(cap, -44, 44, 9.8, 9.8, A.fluid, 0, 0, 18);
  lat(
    cap,
    [
      [-58, 0],
      [-58, 9],
      [-54, 14],
      [-46, 14],
      [-44, 12.8],
    ],
    m.brass,
    { segs: 24 },
  );
  lat(
    cap,
    [
      [44, 12.8],
      [46, 14],
      [54, 14],
      [58, 9],
      [58, 0],
    ],
    m.brass,
    { segs: 24 },
  );
  for (let i = 0; i < 7; i++)
    sph(cap, -34 + i * 11, rand(-6, 6), rand(-5, 5), rand(1, 2.2), m.glass);
  marker(cap, "hL_cap", 0, 30, -8, [0, -1, 0], [1, 0, 0], {
    rx: 16,
    rz: 14,
    phiS: 130,
    phiE: -30,
    ys: [26, 8, -10, -26],
    mirror: true,
    thumb: { base: [4, 20, -16], dir: [0.4, 1, 0.3] },
    wrist: [20, -60, 50],
  });
  // sights: rear notch on stalk, front bead post
  box(g, -20, 104, 0, 6, 30, 5, m.brass, 1);
  for (const s of [-1, 1]) box(g, -20, 121.5, s * 4.5, 6, 5, 4, m.brass, 0.6);
  box(g, 182, 96, 0, 5, 50, 4, m.brass, 1);
  sph(g, 182, 121.5, 0, 2.6, A.glow);
  // markers
  marker(g, "muzzle", 226, BY, 0);
  marker(g, "eject", 60, 70, 18);
  marker(g, "sightRear", -20, 123.8, 0);
  marker(g, "sightFront", 182, 124, 0);
  const [gx, gy] = gripAxes(20);
  marker(g, "hR", -18, -8, 0, gx, gy, {
    rx: 25,
    rz: 15,
    phiS: 58,
    phiE: -112,
    ys: [30, 11, -7, -24],
    trigger: "trigTip",
    thumb: { base: [-14, 38, -20], dir: [1, 0.3, 0.1] },
  });
  marker(g, "hL", -12, -16, -2, [0, 0, 1], gy, {
    rx: 25,
    rz: 44,
    phiS: 92,
    phiE: -55,
    ys: [14, -2, -18, -32],
    mirror: true,
    fdy: 0,
    thumb: { base: [-27, 20, 26], dir: [0.1, 0.25, 1] },
    wrist: [-60, -24, 20],
  });
  return { origin: [-18, -8, 0] };
}

// shoulder contact point on the butt (mm, builder space); pistols have none
const STOCK_PT = {
  kar98k: [-303, -45, 0],
  trench: [-336, -40, 0],
  mp40: [-338, 8, 0],
  thompson: [-357, -15, 0],
  stg44: [-332, 18, 0],
  mg42: [-452, 18, 0],
};
/**
 * Hand/muzzle/stock points in model space (metres, +X forward, origin at the grip) for third-person
 * avatars. right/left = centre of the gripped section where the middle finger wraps. Quats rotate the
 * hand frame into model space; hand frame: +X = palm -> through the grip (towards the fingertips side),
 * +Y = grip axis pointing from pinky to index/thumb, +Z = back-of-hand side for the right hand (the
 * left hand uses the same X/Y, with +Z toward its palm-side knuckle row, i.e. a mirrored hand).
 * Also: trigger (index fingertip spot), gripAxisR/L + palmDirR/L as plain vectors.
 */
function computeGrips(outer) {
  outer.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(outer.matrixWorld).invert();
  const invQ = new THREE.Quaternion().setFromRotationMatrix(inv);
  const find = (n) => outer.getObjectByName(n);
  const pos = (o) =>
    o ? o.getWorldPosition(new V3()).applyMatrix4(inv) : null;
  const quat = (o) =>
    o
      ? invQ.clone().multiply(o.getWorldQuaternion(new THREE.Quaternion()))
      : null;
  const hR = find("hR"),
    hL = find("hL"),
    mz = find("muzzle"),
    st = find("stock"),
    tr = find("trigTip");
  const qR = quat(hR),
    qL = quat(hL);
  const ax = (q, v) => (q ? new V3(...v).applyQuaternion(q) : null);
  return {
    right: pos(hR),
    left: pos(hL),
    muzzle: pos(mz),
    stock: st ? pos(st) : null,
    trigger: pos(tr),
    rightQuat: qR,
    leftQuat: qL,
    gripAxisR: ax(qR, [0, 1, 0]),
    palmDirR: ax(qR, [1, 0, 0]),
    gripAxisL: ax(qL, [0, 1, 0]),
    palmDirL: ax(qL, [1, 0, 0]),
  };
}

const BUILDERS = {
  m1911: buildM1911,
  kar98k: buildKar98k,
  trench: buildTrench,
  mp40: buildMP40,
  thompson: buildThompson,
  stg44: buildStg44,
  mg42: buildMG42,
  aether: buildAether,
};

/** World model: +X forward, origin at the grip, metres. Moving parts are named groups. */
