// src__weapons 02 — parent
// Lines 354-700 of readable/src__weapons.pretty.js (statement-aligned).
function aetherMats(upgraded) {
  const c = upgraded ? 0x6fe8ff : 0x72ff4c;
  return {
    fluid: new THREE.MeshStandardMaterial({
      color: 0x113a0c,
      emissive: c,
      emissiveIntensity: 2.2,
      roughness: 0.2,
      transparent: true,
      opacity: 0.92,
    }),
    glow: new THREE.MeshStandardMaterial({
      color: 0x0a1a06,
      emissive: c,
      emissiveIntensity: 3.0,
      roughness: 0.4,
    }),
  };
}

function matSet(T, upgraded) {
  const camo = upgraded ? getMat(T, "packed_camo") : null;
  const L = localMats();
  return {
    main: camo || getMat(T, "gun_metal"),
    park: camo || getMat(T, "gun_metal_parkerized"),
    dark: getMat(T, "gun_metal"),
    darkPark: getMat(T, "gun_metal_parkerized"),
    wood: getMat(T, "wood_stock"),
    bake: getMat(T, "bakelite"),
    brass: getMat(T, "brass"),
    brassMain: camo || getMat(T, "brass"),
    leather: getMat(T, "leather"),
    rubber: getMat(T, "rubber_black"),
    green: getMat(T, "metal_painted_green"),
    ...L,
  };
}

// ======================================================================================
// Geometry helpers (all in millimetres, gun space: X fwd, Y up, Z right)
// ======================================================================================

function scaleUV(g, s) {
  const uv = g.attributes.uv;
  if (!uv || s === 1) return g;
  for (let i = 0; i < uv.count; i++)
    uv.setXY(i, uv.getX(i) * s, uv.getY(i) * s);
  uv.needsUpdate = true;
  return g;
}

/** Closed outline with optional per-corner fillet: pts = [[x,y,r?],...]. */
function roundedPath(pts, P = THREE.Shape) {
  const s = new P();
  const n = pts.length;
  for (let i = 0; i < n; i++) {
    const p = pts[i],
      r = p[2] || 0;
    if (!r) {
      i === 0 ? s.moveTo(p[0], p[1]) : s.lineTo(p[0], p[1]);
      continue;
    }
    const a = pts[(i - 1 + n) % n],
      b = pts[(i + 1) % n];
    const da = Math.hypot(a[0] - p[0], a[1] - p[1]) || 1,
      db = Math.hypot(b[0] - p[0], b[1] - p[1]) || 1;
    const ra = Math.min(r, da * 0.5),
      rb = Math.min(r, db * 0.5);
    const x1 = p[0] + ((a[0] - p[0]) / da) * ra,
      y1 = p[1] + ((a[1] - p[1]) / da) * ra;
    const x2 = p[0] + ((b[0] - p[0]) / db) * rb,
      y2 = p[1] + ((b[1] - p[1]) / db) * rb;
    i === 0 ? s.moveTo(x1, y1) : s.lineTo(x1, y1);
    s.quadraticCurveTo(p[0], p[1], x2, y2);
  }
  s.closePath();
  return s;
}

function M(parent, geo, mat) {
  const m = new THREE.Mesh(geo, mat);
  parent.add(m);
  return m;
}

/** Extruded side profile, centred on z. */
function ext(parent, pts, thick, mat, o = {}) {
  const shape = roundedPath(pts);
  if (o.holes) shape.holes = o.holes.map((h) => roundedPath(h, THREE.Path));
  const bt = Math.min(o.bevel ?? 1, thick * 0.45);
  const depth = Math.max(0.05, thick - 2 * bt);
  let g = new THREE.ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: bt > 0,
    bevelThickness: bt,
    bevelSize: bt,
    bevelOffset: -bt,
    bevelSegments: bt > 0 ? (o.bsegs ?? 3) : 0,
    curveSegments: o.curve ?? 8,
  });
  g.translate(0, 0, -depth / 2 + (o.z || 0));
  scaleUV(g, o.uv ?? 1 / 90);
  g = toCreasedNormals(g, o.crease ?? 0.62);
  g.clearGroups();
  return M(parent, g, mat);
}

/** Lathe around the X axis: prof = [[x, r], ...] traced rear->front along the outside. */
function lat(parent, prof, mat, o = {}) {
  const pts = prof.map(([x, r]) => new THREE.Vector2(Math.max(r, 0.0001), x));
  const g = new THREE.LatheGeometry(pts, o.segs ?? 28);
  g.rotateZ(-Math.PI / 2); // Y -> +X ; lathe radius in XZ -> YZ
  g.translate(0, o.y || 0, o.z || 0);
  scaleUV(g, 1);
  const m = M(parent, g, mat);
  return m;
}

function cyl(
  parent,
  x0,
  x1,
  r0,
  r1,
  mat,
  y = 0,
  z = 0,
  segs = 20,
  open = false,
) {
  const g = new THREE.CylinderGeometry(r1, r0, x1 - x0, segs, 1, open);
  g.rotateZ(-Math.PI / 2);
  g.translate((x0 + x1) / 2, y, z);
  return M(parent, g, mat);
}
function cylZ(parent, x, y, z0, z1, r, mat, segs = 14) {
  const g = new THREE.CylinderGeometry(r, r, Math.abs(z1 - z0), segs);
  g.rotateX(Math.PI / 2);
  g.translate(x, y, (z0 + z1) / 2);
  return M(parent, g, mat);
}
function cylY(parent, x, y0, y1, z, r0, r1, mat, segs = 16) {
  const g = new THREE.CylinderGeometry(r1, r0, y1 - y0, segs);
  g.translate(x, (y0 + y1) / 2, z);
  return M(parent, g, mat);
}
function box(parent, x, y, z, w, h, d, mat, r = 0.6) {
  const rr = Math.min(r, w / 2 - 0.01, h / 2 - 0.01, d / 2 - 0.01);
  const g =
    rr > 0.05
      ? new RoundedBoxGeometry(w, h, d, 2, rr)
      : new THREE.BoxGeometry(w, h, d);
  g.translate(x, y, z);
  return M(parent, g, mat);
}
function sph(
  parent,
  x,
  y,
  z,
  r,
  mat,
  sx = 1,
  sy = 1,
  sz = 1,
  ws = 16,
  hs = 12,
) {
  const g = new THREE.SphereGeometry(r, ws, hs);
  g.scale(sx, sy, sz);
  g.translate(x, y, z);
  return M(parent, g, mat);
}
/** Torus; axis = 'x'|'y'|'z' is the ring's normal. */
function tor(
  parent,
  x,
  y,
  z,
  R,
  r,
  mat,
  axis = "x",
  arc = TAU,
  rs = 10,
  ts = 28,
) {
  const g = new THREE.TorusGeometry(R, r, rs, ts, arc);
  if (axis === "x") g.rotateY(Math.PI / 2);
  else if (axis === "y") g.rotateX(Math.PI / 2);
  g.translate(x, y, z);
  return M(parent, g, mat);
}
function tube(parent, pts, r, mat, segs = 32, rad = 10) {
  const curve = new THREE.CatmullRomCurve3(
    pts.map((p) => new V3(p[0], p[1], p[2])),
  );
  const g = new THREE.TubeGeometry(curve, segs, r, rad, false);
  return M(parent, g, mat);
}

function part(parent, name, x = 0, y = 0, z = 0) {
  const g = new THREE.Group();
  g.name = name;
  g.position.set(x, y, z);
  g.userData.part = true;
  parent.add(g);
  return g;
}
function marker(parent, name, x, y, z, xAxis, yAxis, shape) {
  const o = new THREE.Object3D();
  o.name = name;
  o.position.set(x, y, z);
  o.userData.marker = true;
  if (xAxis && yAxis) {
    const X = new V3(...xAxis).normalize();
    const Y = new V3(...yAxis);
    Y.sub(X.clone().multiplyScalar(Y.dot(X))).normalize();
    const Z = new V3().crossVectors(X, Y);
    o.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(X, Y, Z));
  }
  if (shape) o.userData.shape = shape;
  parent.add(o);
  return o;
}
/** Right-hand pistol-grip frame: grip axis raked `deg` forward at the top. */
function gripAxes(deg) {
  const a = deg * D2R;
  return [
    [Math.cos(a), -Math.sin(a), 0],
    [Math.sin(a), Math.cos(a), 0],
  ];
}
/** Left hand under a horizontal handguard (palm below, fingers up the right side). */
const FOREGRIP_AXES = [
  [0, 1, 0],
  [1, 0, 0],
];
const FIST_R = {
  rx: 9,
  rz: 9,
  phiS: 70,
  phiE: -110,
  ys: [12, -3, -17, -30],
  thumb: { base: [-4, 16, -12], dir: [0.8, -0.3, 0.3] },
};

// 7.92x57 / .45 / 9mm cartridge (along +X from x0), returns group
function cartridge(parent, x0, y, z, mats, kind = "rifle") {
  const g = new THREE.Group();
  g.position.set(x0, y, z);
  parent.add(g);
  if (kind === "rifle") {
    lat(
      g,
      [
        [0, 0],
        [0, 5.9],
        [1.2, 5.9],
        [1.4, 5.1],
        [2.2, 5.1],
        [2.6, 5.9],
        [44, 5.5],
        [48, 4.6],
        [57, 4.4],
        [57, 0.1],
      ],
      mats.brass,
      { segs: 14 },
    );
    lat(
      g,
      [
        [56.5, 0],
        [56.5, 4.1],
        [66, 4.0],
        [74, 2.8],
        [80, 0.4],
        [80.3, 0],
      ],
      mats.copper,
      { segs: 14 },
    );
  } else if (kind === "pistol") {
    lat(
      g,
      [
        [0, 0],
        [0, 6],
        [1.2, 6],
        [1.4, 5.3],
        [2.4, 5.3],
        [2.8, 6],
        [22, 5.9],
        [22, 0.1],
      ],
      mats.brass,
      { segs: 14 },
    );
    lat(
      g,
      [
        [21.5, 0],
        [21.5, 5.7],
        [26, 5.5],
        [30, 4],
        [32.5, 1.5],
        [33, 0],
      ],
      mats.copper,
      { segs: 14 },
    );
  } else if (kind === "shotgun") {
    lat(
      g,
      [
        [0, 0],
        [0, 11.2],
        [1.4, 11.2],
        [1.6, 10.3],
        [14, 10.3],
        [14, 0.1],
      ],
      mats.brass,
      { segs: 16 },
    );
    lat(
      g,
      [
        [13.5, 0],
        [13.5, 10.1],
        [64, 10.1],
        [65.5, 8.5],
        [65.6, 0],
      ],
      mats.shell,
      { segs: 16 },
    );
  }
  return g;
}

/**
 * Merge static meshes per part per material to cut draw calls. Parts (userData.part) and markers
 * stay as live children; everything else under a part collapses into one mesh per material.
 */
