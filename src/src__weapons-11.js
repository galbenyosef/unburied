// src__weapons 11 — clone
// Lines 3082-3371 of readable/src__weapons.pretty.js (statement-aligned).
export function buildWeaponModel(id, T, upgraded = false) {
  const outer = new THREE.Group();
  outer.name = "weapon_" + id;
  const g = new THREE.Group();
  g.name = "mm";
  g.scale.setScalar(0.001);
  outer.add(g);
  const mats = matSet(T, upgraded);
  const build = BUILDERS[id] || BUILDERS.m1911;
  const info = build(g, mats, upgraded);
  if (STOCK_PT[id]) marker(g, "stock", ...STOCK_PT[id]);
  g.position.set(
    -info.origin[0] * 0.001,
    -info.origin[1] * 0.001,
    -info.origin[2] * 0.001,
  );
  optimize(g);
  // record rest transforms for animation
  const parts = [];
  g.traverse((o) => {
    if (o.userData.part) {
      o.userData.restPos = o.position.clone();
      o.userData.restRot = o.rotation.clone();
      if (o.userData.restVis === undefined) o.userData.restVis = true;
      o.visible = o.userData.restVis;
      parts.push(o);
    }
  });
  outer.userData = {
    id,
    upgraded,
    mm: g,
    parts,
    aether: g.userData.aether || null,
  };
  outer.userData.grips = computeGrips(outer);
  outer.traverse((o) => {
    if (o.isMesh) {
      o.castShadow = true;
      o.receiveShadow = true;
    }
  });
  return outer;
}

// ======================================================================================
// Hands: procedural gloved hands posed from "wrap" shapes (21 joint points, local mm frame)
//   local frame: X = palm -> through the gripped object, Y = grip axis (pinky -> index),
//   Z = knuckle side (right-hand convention; `mirror` negates Z for the left hand)
// ======================================================================================

const FR = 8.5;
const FL = [
  [42, 25, 21],
  [47, 28, 23],
  [44, 27, 22],
  [35, 21, 19],
];
const FRAD = [8.0, 8.3, 7.8, 7.0];

function makeShape(sd, trigLocal) {
  const rx = sd.rx + FR,
    rz = sd.rz + FR;
  const phiS = sd.phiS * D2R,
    phiE = sd.phiE * D2R;
  // sample the nominal wrap (phiS->phiE) plus a continuation, so fingers longer than the wrap keep
  // curling along the grip surface instead of sticking out tangentially
  const N = 240,
    samp = [],
    accs = [];
  const phiX = phiE + Math.sign(phiE - phiS) * Math.PI * 0.9;
  let acc = 0,
    prev = null;
  for (let i = 0; i <= N; i++) {
    const ph = phiS + ((phiX - phiS) * i) / N;
    const p = new V3(rx * Math.cos(ph), 0, rz * Math.sin(ph));
    if (prev) acc += p.distanceTo(prev);
    samp.push(p);
    accs.push(acc);
    prev = p;
  }
  const arc = acc;
  const at = (d) => {
    if (d >= arc) {
      const a = samp[N - 1],
        b = samp[N];
      return b.clone().addScaledVector(b.clone().sub(a).normalize(), d - arc);
    }
    let i = 1;
    while (accs[i] < d) i++;
    const u = (d - accs[i - 1]) / (accs[i] - accs[i - 1] || 1);
    return samp[i - 1].clone().lerp(samp[i], u);
  };
  const ys = sd.ys;
  const pts = [];
  const W = sd.wrist
    ? new V3(...sd.wrist)
    : new V3(-rx - 30, ys[1] - 22, rz * 0.45);
  pts.push(W);
  const fdy = sd.fdy ?? -0.06;
  for (let f = 0; f < 4; f++) {
    const L = FL[f],
      tot = L[0] + L[1] + L[2];
    if (f === 0 && trigLocal) {
      const K = at(0);
      K.y = ys[0];
      const T = trigLocal.clone();
      const d = T.clone().sub(K);
      const out = new V3(K.x, 0, K.z).normalize();
      const J1 = K.clone().addScaledVector(d, 0.44).addScaledVector(out, 7);
      J1.y += 4;
      const J2 = K.clone().addScaledVector(d, 0.8).addScaledVector(out, 4);
      J2.y += 3;
      pts.push(K, J1, J2, T);
      continue;
    }
    for (const d of [0, L[0], L[0] + L[1], tot]) {
      const p = at(d);
      p.y = ys[f] + fdy * d;
      pts.push(p);
    }
  }
  const th = sd.thumb || {
    base: [-rx * 0.5, ys[0] + 8, -rz],
    dir: [1, 0.2, 0],
  };
  const B = new V3(...th.base),
    D = new V3(...th.dir).normalize();
  const T0 = W.clone().lerp(B, 0.4);
  const T2 = B.clone().addScaledVector(D, 31);
  const inward = new V3(-T2.x, 0, -T2.z).normalize();
  const T3 = T2.clone().addScaledVector(D, 24).addScaledVector(inward, 3);
  pts.push(T0, B, T2, T3);
  if (sd.mirror) for (const p of pts) p.z = -p.z;
  const arr = new Float32Array(pts.length * 3);
  pts.forEach((p, i) => p.toArray(arr, i * 3));
  return arr;
}

const FIST = {
  rx: 9,
  rz: 9,
  phiS: 110,
  phiE: -70,
  ys: [14, -1, -15, -28],
  thumb: { base: [-6, 16, -13], dir: [0.8, 0.3, 0.4] },
};
const OPEN_L = {
  rx: 40,
  rz: 40,
  phiS: 100,
  phiE: 30,
  ys: [30, 10, -10, -28],
  mirror: true,
  fdy: 0,
  thumb: { base: [-30, 26, -30], dir: [0.4, 1, 0.1] },
};

let _unit = null;
function unitGeos() {
  if (_unit) return _unit;
  const cyl = new THREE.CylinderGeometry(1, 1, 1, 12, 1, true);
  cyl.translate(0, 0.5, 0);
  const taper = new THREE.CylinderGeometry(0.86, 1, 1, 16, 1, true);
  taper.translate(0, 0.5, 0);
  const sph = new THREE.SphereGeometry(1, 14, 10);
  const palm = new RoundedBoxGeometry(1, 1, 1, 3, 0.42);
  const roll = new THREE.LatheGeometry(
    [
      [0.9, 0],
      [1.02, 0.12],
      [1.08, 0.35],
      [1.06, 0.62],
      [1.1, 0.8],
      [0.98, 1],
      [0.9, 1.02],
    ].map(([r, y]) => new THREE.Vector2(r, y)),
    18,
  );
  const cuff = new THREE.LatheGeometry(
    [
      [0.9, -0.02],
      [1.0, 0],
      [1.08, 0.8],
      [1.12, 1],
      [1.0, 1.04],
    ].map(([r, y]) => new THREE.Vector2(r, y)),
    16,
  );
  const cuffC = new THREE.CylinderGeometry(0.97, 1.06, 1, 16, 1, false);
  cuffC.translate(0, 0.5, 0);
  _unit = { cyl, taper, sph, palm, roll, cuff, cuffC };
  return _unit;
}
const _q = new THREE.Quaternion(),
  _v = new V3(),
  _v2 = new V3(),
  _m4 = new THREE.Matrix4(),
  _s = new V3();
const YUP = new V3(0, 1, 0);
function placeSeg(mesh, a, b, r0) {
  _v.subVectors(b, a);
  const len = _v.length() || 1e-5;
  _q.setFromUnitVectors(YUP, _v.multiplyScalar(1 / len));
  mesh.matrix.compose(a, _q, _s.set(r0, len, r0));
}
function placeSph(mesh, p, r) {
  mesh.matrix.compose(p, _q.identity(), _s.set(r, r, r));
}

class Hand {
  constructor(parent, glove) {
    const U = unitGeos();
    this.g = new THREE.Group();
    parent.add(this.g);
    const mk = (geo, mat) => {
      const m = new THREE.Mesh(geo, mat);
      m.matrixAutoUpdate = false;
      m.frustumCulled = false;
      this.g.add(m);
      return m;
    };
    this.segs = [];
    this.joints = [];
    for (let i = 0; i < 15; i++) this.segs.push(mk(U.cyl, glove));
    for (let i = 0; i < 19; i++) this.joints.push(mk(U.sph, glove));
    this.palm = mk(U.palm, glove);
    this.pad = mk(U.sph, glove);
    this.pts = Array.from({ length: 21 }, () => new V3());
    this.scale = 1;
  }
  setMaterial(mat) {
    this.g.traverse((o) => {
      if (o.isMesh) o.material = mat;
    });
  }
  update(frame, shape) {
    const P = this.pts;
    for (let i = 0; i < 21; i++)
      P[i].fromArray(shape, i * 3).applyMatrix4(frame);
    let si = 0,
      ji = 0;
    const tap = [1, 0.93, 0.86];
    const hs = this.scale;
    for (let f = 0; f < 4; f++) {
      const r = FRAD[f] * 0.001 * hs;
      const b = 1 + f * 4;
      for (let k = 0; k < 3; k++)
        placeSeg(this.segs[si++], P[b + k], P[b + k + 1], r * tap[k]);
      placeSph(this.joints[ji++], P[b], r * 1.12);
      placeSph(this.joints[ji++], P[b + 1], r * 0.97);
      placeSph(this.joints[ji++], P[b + 2], r * 0.9);
      placeSph(this.joints[ji++], P[b + 3], r * 0.86);
    }
    placeSeg(this.segs[si++], P[17], P[18], 0.0125 * hs);
    placeSeg(this.segs[si++], P[18], P[19], 0.0098 * hs);
    placeSeg(this.segs[si++], P[19], P[20], 0.0088 * hs);
    placeSph(this.joints[ji++], P[18], 0.0105 * hs);
    placeSph(this.joints[ji++], P[19], 0.0094 * hs);
    placeSph(this.joints[ji++], P[20], 0.0086 * hs);
    // palm box: from wrist to knuckle line
    const W = P[0];
    const K = _v2
      .copy(P[1])
      .add(P[5])
      .add(P[9])
      .add(P[13])
      .multiplyScalar(0.25);
    const Ld = new V3().subVectors(K, W);
    const len = Ld.length();
    Ld.normalize();
    const A = new V3().subVectors(P[1], P[13]);
    const wid = A.length();
    const N = new V3().crossVectors(Ld, A).normalize();
    A.crossVectors(N, Ld).normalize();
    const c = new V3().copy(W).addScaledVector(Ld, len * 0.5);
    _m4.makeBasis(
      A.multiplyScalar(wid + 0.02),
      Ld.clone().multiplyScalar(len + 0.018),
      N.clone().multiplyScalar(0.03),
    );
    _m4.setPosition(c);
    this.palm.matrix.copy(_m4);
    // thenar pad
    placeSph(this.pad, P[17].clone().lerp(P[18], 0.4), 0.014);
    this.wrist = W;
    this.dir = Ld;
  }
}

