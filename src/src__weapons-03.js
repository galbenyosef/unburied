// src__weapons 03 — dark
// Lines 701-990 of readable/src__weapons.pretty.js (statement-aligned).
function optimize(node) {
  const buckets = new Map();
  const keep = [];
  const tmp = new THREE.Matrix4();
  const walk = (o, mat4) => {
    for (const c of [...o.children]) {
      if (c.userData.part) {
        keep.push(c);
        optimize(c);
        continue;
      }
      if (c.userData.marker || c.userData.keep) {
        keep.push(c);
        continue;
      }
      c.updateMatrix();
      const m = new THREE.Matrix4().multiplyMatrices(mat4, c.matrix);
      if (c.isMesh) {
        let g = c.geometry.index
          ? c.geometry.toNonIndexed()
          : c.geometry.clone();
        for (const k of Object.keys(g.attributes))
          if (!["position", "normal", "uv"].includes(k)) g.deleteAttribute(k);
        if (!g.attributes.uv)
          g.setAttribute(
            "uv",
            new THREE.BufferAttribute(
              new Float32Array(g.attributes.position.count * 2),
              2,
            ),
          );
        g.clearGroups();
        g.applyMatrix4(m);
        if (m.determinant() < 0) {
          // flip winding for mirrored pieces
          const p = g.attributes.position,
            n = g.attributes.normal,
            u = g.attributes.uv;
          for (let i = 0; i < p.count; i += 3)
            for (const a of [p, n, u]) {
              const s = a.itemSize;
              for (let k = 0; k < s; k++) {
                const t = a.array[(i + 1) * s + k];
                a.array[(i + 1) * s + k] = a.array[(i + 2) * s + k];
                a.array[(i + 2) * s + k] = t;
              }
            }
        }
        if (!buckets.has(c.material)) buckets.set(c.material, []);
        buckets.get(c.material).push(g);
      }
      if (c.children.length) walk(c, m);
    }
  };
  tmp.identity();
  walk(node, tmp);
  for (const c of [...node.children]) node.remove(c);
  for (const [mat, geos] of buckets) {
    const merged = mergeGeometries(geos, false);
    if (!merged) continue;
    const mesh = new THREE.Mesh(merged, mat);
    mesh.name = node.name + "_" + (mat.name || "mat");
    node.add(mesh);
  }
  for (const k of keep) node.add(k);
}

// ======================================================================================
// Model builders. Each returns { origin:[x,y,z] (mm, the grip), view:{...} }
// ======================================================================================

function buildM1911(g, m) {
  // ---- frame
  ext(
    g,
    [
      [-34, 47, 3],
      [-12, 47],
      [174, 47],
      [178, 44, 2],
      [178, 33, 2],
      [93, 33],
      [93, 14, 7],
      [86, 5, 5],
      [50, 5],
      [40, 11, 5],
      [34, 22, 3],
      [12, -47, 4],
      [-6, -52, 3],
      [-37, -52, 4],
      [-40, -44, 2],
      [-19, 22],
      [-17, 36, 6],
      [-35, 41, 4],
    ],
    19,
    m.main,
    {
      bevel: 1.2,
      holes: [
        [
          [46, 13, 4],
          [84, 13, 4],
          [87, 31, 2],
          [44, 31, 2],
        ],
      ],
    },
  );
  // grip safety tongue + mainspring housing lines
  box(g, -39, -10, 0, 3, 60, 16, m.dark, 1).rotation.z = -17 * D2R;
  // grip panels (checkered walnut) + screws
  for (const s of [-1, 1]) {
    ext(
      g,
      [
        [-15, 32, 7],
        [28, 32, 7],
        [8, -44, 7],
        [-32, -44, 7],
      ],
      3.4,
      m.wood,
      { z: s * 10.6, bevel: 1.2, uv: 1 / 60 },
    );
    cylZ(g, 13, 22, s * 12, s * 12.9, 3.1, m.dark);
    cylZ(g, -13, -30, s * 12, s * 12.9, 3.1, m.dark);
  }
  // thumb safety, slide stop, mag catch, plunger tube (left side)
  ext(
    g,
    [
      [-14, 46],
      [2, 46],
      [12, 48.5, 2],
      [13, 53, 2],
      [-14, 53],
    ],
    2.6,
    m.dark,
    { z: -10.9, bevel: 0.6 },
  );
  ext(
    g,
    [
      [24, 39, 3],
      [40, 40],
      [55, 44, 3],
      [55, 49, 2],
      [24, 48, 3],
    ],
    3,
    m.dark,
    { z: -11.2, bevel: 0.6 },
  );
  cylZ(g, 30, 44, -12, -13.6, 3.2, m.dark);
  cylZ(g, 38, 22, -9.4, -11.6, 4.6, m.dark);
  cyl(g, -3, 20, 2.6, 2.6, m.dark, 49.5, -10.2, 10);
  // lanyard loop
  tor(g, -33, -54, 0, 4, 1.1, m.dark, "z");
  // barrel (visible at muzzle & through port)
  cyl(g, 30, 186, 7, 7, m.main, 62, 0, 20);
  cyl(g, 186, 186.6, 5.6, 5.6, m.bore, 62, 0, 16);
  box(g, 52, 62, 10.6, 38, 8, 2, m.main, 0.6); // chamber hood seen in port

  // ---- slide (moving)
  const slide = part(g, "slide");
  ext(
    slide,
    [
      [-28, 44],
      [183, 44],
      [183, 71, 2.5],
      [180, 74, 1.5],
      [-22, 74, 1.5],
      [-28, 68, 4],
    ],
    23,
    m.main,
    { bevel: 1.6 },
  );
  for (let i = 0; i < 9; i++)
    box(slide, -24 + i * 2.7, 58, 0, 1.1, 21, 23.5, m.dark, 0.2);
  box(slide, 52, 62, 11.2, 44, 12, 1.4, m.bore, 0.3); // ejection port
  lat(
    slide,
    [
      [180, 7.3],
      [181, 9.9],
      [186, 9.9],
      [186.5, 7.3],
    ],
    m.main,
    { y: 62, segs: 24 },
  );
  lat(
    slide,
    [
      [181, 0],
      [181, 6.4],
      [185.5, 6.4],
      [186.5, 5],
      [186.6, 0],
    ],
    m.main,
    { y: 50, segs: 18 },
  );
  box(slide, 170, 76, 0, 5, 5.2, 3.2, m.dark, 0.5); // front sight blade
  box(slide, -17, 74.7, 0, 8, 2, 16, m.dark, 0.4); // rear sight base
  for (const s of [-1, 1])
    box(slide, -17, 76.2, s * 5.4, 7, 4.4, 5, m.dark, 0.4); // rear ears (notch between)

  // ---- hammer, trigger, mag
  const ham = part(g, "hammer", -22, 52, 0);
  ext(
    ham,
    [
      [-3, -4],
      [4, -4, 2],
      [3, 10],
      [-1, 17, 2],
      [-9, 21, 3],
      [-12, 17, 2],
      [-6, 10],
    ],
    7,
    m.dark,
    { bevel: 0.8 },
  );
  ham.rotation.z = 0.45;
  const trig = part(g, "trigger", 52, 26, 0);
  ext(
    trig,
    [
      [-5, 5],
      [3, 5],
      [5, -9, 2],
      [0, -12, 2],
      [-4, -8],
    ],
    7,
    m.dark,
    { bevel: 0.8 },
  );
  marker(trig, "trigTip", 5, -4, 0);

  const mag = part(g, "mag", -15.5, -52, 0);
  mag.rotation.z = -17 * D2R;
  box(mag, 0, 51, 0, 30, 100, 13, m.dark, 1);
  box(mag, 0, -1.5, 0, 35, 5, 17, m.dark, 1.5);
  cartridge(mag, -14, 99, 0, m, "pistol");
  marker(mag, "hL_mag", 2, 10, -3, [0, 0, 1], [0, 1, 0], {
    rx: 18,
    rz: 10,
    phiS: 100,
    phiE: -80,
    ys: [18, 4, -10, -23],
    mirror: true,
  });

  // ---- markers
  marker(g, "muzzle", 188, 62, 0);
  marker(g, "eject", 55, 66, 12);
  marker(g, "sightRear", -17, 78.4, 0);
  marker(g, "sightFront", 170, 78.6, 0);
  const [gx, gy] = gripAxes(17);
  marker(g, "hR", 0, 0, 0, gx, gy, {
    rx: 25,
    rz: 13.5,
    phiS: 58,
    phiE: -112,
    ys: [24, 5, -13, -30],
    trigger: "trigTip",
    thumb: { base: [-12, 27, -19], dir: [1, 0.2, 0.08] },
  });
  // support hand: palm on the left panel, fingers wrap the front over the shooting hand
  marker(g, "hL", 6, -9, -2, [0, 0, 1], gy, {
    rx: 25,
    rz: 42,
    phiS: 92,
    phiE: -55,
    ys: [14, -2, -18, -32],
    mirror: true,
    fdy: 0,
    thumb: { base: [-27, 20, 26], dir: [0.1, 0.25, 1] },
    wrist: [-60, -24, 20],
  });
  return { origin: [0, 0, 0] };
}

