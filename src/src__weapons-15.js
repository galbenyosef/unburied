// src__weapons 15 — three
// Lines 4325-4659 of readable/src__weapons.pretty.js (statement-aligned).
function fxTextures() {
  if (_fxTex) return _fxTex;
  const star = canvasTex(128, 128, (x, w, h) => {
    const cx = w / 2,
      cy = h / 2;
    x.globalCompositeOperation = "lighter";
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * TAU + (i % 2) * 0.2,
        L = (i % 2 ? 0.33 : 0.48) * w;
      const g = x.createLinearGradient(
        cx,
        cy,
        cx + Math.cos(a) * L,
        cy + Math.sin(a) * L,
      );
      g.addColorStop(0, "rgba(255,235,190,0.9)");
      g.addColorStop(1, "rgba(255,120,20,0)");
      x.fillStyle = g;
      x.beginPath();
      x.moveTo(cx + Math.cos(a + 1.57) * 7, cy + Math.sin(a + 1.57) * 7);
      x.lineTo(cx + Math.cos(a) * L, cy + Math.sin(a) * L);
      x.lineTo(cx + Math.cos(a - 1.57) * 7, cy + Math.sin(a - 1.57) * 7);
      x.fill();
    }
    const r = x.createRadialGradient(cx, cy, 0, cx, cy, w * 0.3);
    r.addColorStop(0, "rgba(255,255,240,1)");
    r.addColorStop(0.3, "rgba(255,210,120,0.8)");
    r.addColorStop(1, "rgba(255,90,10,0)");
    x.fillStyle = r;
    x.fillRect(0, 0, w, h);
  });
  const petal = canvasTex(256, 64, (x, w, h) => {
    x.globalCompositeOperation = "lighter";
    for (let i = 0; i < 5; i++) {
      const g = x.createRadialGradient(
        20,
        h / 2,
        2,
        20,
        h / 2,
        w * (0.5 + i * 0.1),
      );
      g.addColorStop(0, "rgba(255,240,200,0.55)");
      g.addColorStop(0.35, "rgba(255,160,50,0.35)");
      g.addColorStop(1, "rgba(255,60,0,0)");
      x.fillStyle = g;
      x.beginPath();
      x.ellipse(
        w * (0.3 + i * 0.05),
        h / 2 + (i - 2) * 2,
        w * (0.34 - i * 0.03),
        h * (0.34 - i * 0.04),
        0,
        0,
        TAU,
      );
      x.fill();
    }
  });
  const smoke = canvasTex(64, 64, (x, w, h) => {
    for (let i = 0; i < 14; i++) {
      const px = w / 2 + rand(-10, 10),
        py = h / 2 + rand(-10, 10),
        r = rand(10, 22);
      const g = x.createRadialGradient(px, py, 0, px, py, r);
      g.addColorStop(0, "rgba(210,205,200,0.22)");
      g.addColorStop(1, "rgba(210,205,200,0)");
      x.fillStyle = g;
      x.fillRect(0, 0, w, h);
    }
  });
  const glow = canvasTex(64, 64, (x, w, h) => {
    const g = x.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
    g.addColorStop(0, "rgba(255,255,255,1)");
    g.addColorStop(0.25, "rgba(255,255,255,0.6)");
    g.addColorStop(1, "rgba(255,255,255,0)");
    x.fillStyle = g;
    x.fillRect(0, 0, w, h);
  });
  for (const t of [star, petal, smoke, glow])
    if (t) {
      t.colorSpace = THREE.SRGBColorSpace;
      t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
    }
  _fxTex = { star, petal, smoke, glow };
  return _fxTex;
}

function buildKnife(m) {
  const g = new THREE.Group();
  const mm = new THREE.Group();
  mm.scale.setScalar(0.001);
  g.add(mm);
  // M3-style fighting knife: blade along +Y, edge toward +X
  const blade = ext(
    mm,
    [
      [-6, 58],
      [11, 58],
      [12, 70],
      [11, 170],
      [7, 205],
      [0, 228, 1],
      [-4, 214],
      [-5, 180],
      [-4, 120],
      [-5, 70],
    ],
    4.2,
    m.ring,
    { bevel: 1.4, uv: 1 / 60 },
  );
  blade.material = m.ring;
  box(mm, 2, 55, 0, 44, 6, 10, m.dark, 1.5); // crossguard
  const prof = [
    [-62, 0],
    [-62, 12],
  ];
  for (let i = 0; i < 16; i++) {
    const y = -58 + i * 7;
    prof.push([y, 13.5], [y + 3.5, 14.5], [y + 6.5, 13.5]);
  }
  prof.push([54, 12], [55, 0]);
  const hl = lat(mm, prof, m.leather, { segs: 18 });
  hl.rotation.z = Math.PI / 2;
  const pm = lat(
    mm,
    [
      [-76, 0],
      [-76, 10],
      [-70, 14],
      [-62, 13],
      [-60, 0],
    ],
    m.dark,
    { segs: 18 },
  );
  pm.rotation.z = Math.PI / 2;
  optimize(mm);
  return g;
}

function buildGrenade(m) {
  const g = new THREE.Group();
  const mm = new THREE.Group();
  mm.scale.setScalar(0.001);
  g.add(mm);
  const body = new THREE.Group();
  body.position.y = -6;
  mm.add(body);
  sph(body, 0, 0, 0, 25.5, m.green, 1, 1.22, 1, 20, 14);
  const geos = [];
  for (let i = 0; i < 5; i++)
    for (let j = 0; j < 8; j++) {
      const s = new THREE.SphereGeometry(
        28,
        4,
        3,
        (j * TAU) / 8 + 0.05,
        TAU / 8 - 0.1,
        0.42 + i * 0.47 + 0.04,
        0.47 - 0.08,
      );
      s.scale(1, 1.22, 1);
      geos.push(s.toNonIndexed());
    }
  const blocks = mergeGeometries(
    geos.map((q) => {
      q.clearGroups();
      return q;
    }),
  );
  blocks.computeVertexNormals();
  M(body, blocks, m.green);
  // fuze, spoon, ring + pin
  lat(
    mm,
    [
      [26, 0],
      [26, 8],
      [30, 9],
      [44, 9],
      [46, 7],
      [52, 7],
      [53, 0],
    ],
    m.dark,
    { segs: 16 },
  ).rotation.z = Math.PI / 2;
  tube(
    mm,
    [
      [4, 50, 0],
      [12, 52, 0],
      [17, 44, 0],
      [22, 20, 0],
      [25, 0, 0],
      [22, -20, 0],
    ],
    3,
    m.dark,
    20,
    6,
  ).scale.z = 2.4;
  const pin = part(mm, "pin");
  tor(pin, -14, 42, 0, 12, 1.6, m.ring, "z");
  cylZ(pin, -2, 42, -2, 2, 1.6, m.ring).rotation.z = Math.PI / 2;
  optimize(mm);
  g.userData.pin = mm.getObjectByName("pin");
  return g;
}

function buildBottle(m, color) {
  const g = new THREE.Group();
  const mm = new THREE.Group();
  mm.scale.setScalar(0.001);
  g.add(mm);
  const liquid = new THREE.MeshStandardMaterial({
    color,
    emissive: color,
    emissiveIntensity: 0.9,
    roughness: 0.2,
    transparent: true,
    opacity: 0.9,
  });
  const capMat = new THREE.MeshStandardMaterial({
    color,
    roughness: 0.35,
    metalness: 0.8,
  });
  const prof = [
    [0, 0],
    [0, 27],
    [4, 30],
    [100, 30],
    [128, 20],
    [150, 12.5],
    [168, 12.5],
    [170, 14.5],
    [176, 14],
    [178, 11],
  ];
  lat(mm, prof, m.glass, { segs: 26 }).rotation.z = Math.PI / 2;
  lat(
    mm,
    [
      [3, 0],
      [3, 26.5],
      [100, 26.5],
      [118, 21],
      [118, 0],
    ],
    liquid,
    { segs: 22 },
  ).rotation.z = Math.PI / 2;
  cylY(mm, 0, 36, 86, 0, 30.6, 30.6, m.label, 26);
  cylY(mm, 0, 176, 184, 0, 15, 15, capMat, 18);
  optimize(mm);
  g.userData.liquid = liquid;
  return g;
}

// ======================================================================================
// WeaponSystem
// ======================================================================================

const tmpV = new V3(),
  tmpV2 = new V3(),
  tmpQ = new THREE.Quaternion(),
  tmpE = new THREE.Euler();
const Q_Y90 = new THREE.Quaternion().setFromAxisAngle(
  new V3(0, 1, 0),
  Math.PI / 2,
);

class Spring {
  constructor(k, c, n = 3) {
    this.k = k;
    this.c = c;
    this.x = new Float32Array(n);
    this.v = new Float32Array(n);
  }
  step(dt, target) {
    const n = this.x.length;
    const steps = Math.max(1, Math.ceil(dt / (1 / 240)));
    const h = dt / steps;
    for (let s = 0; s < steps; s++)
      for (let i = 0; i < n; i++) {
        const tg = target ? target[i] : 0;
        this.v[i] += (-this.k * (this.x[i] - tg) - this.c * this.v[i]) * h;
        this.x[i] += this.v[i] * h;
      }
  }
  kick(i, v) {
    this.v[i] += v;
  }
}

function frameFrom(p, r, out = new THREE.Matrix4()) {
  tmpQ.setFromEuler(tmpE.set(r[0], r[1], r[2]));
  return out.compose(
    tmpV.set(p[0], p[1], p[2]),
    tmpQ,
    tmpV2.set(0.001, 0.001, 0.001),
  );
}
const _da = { p: new V3(), q: new THREE.Quaternion(), s: new V3() };
const _db = { p: new V3(), q: new THREE.Quaternion(), s: new V3() };
function blendAnchor(out, a, b, u) {
  if (u <= 0) {
    out.frame.copy(a.frame);
    out.shape.set(a.shape);
    return out;
  }
  if (u >= 1) {
    out.frame.copy(b.frame);
    out.shape.set(b.shape);
    return out;
  }
  a.frame.decompose(_da.p, _da.q, _da.s);
  b.frame.decompose(_db.p, _db.q, _db.s);
  _da.p.lerp(_db.p, u);
  _da.q.slerp(_db.q, u);
  _da.s.lerp(_db.s, u);
  out.frame.compose(_da.p, _da.q, _da.s);
  for (let i = 0; i < out.shape.length; i++)
    out.shape[i] = a.shape[i] + (b.shape[i] - a.shape[i]) * u;
  return out;
}
const STOW = [0.035, -0.26, 0.06, -1.0, 0.18, 0.5];
const newAnchor = () => ({
  frame: new THREE.Matrix4(),
  shape: new Float32Array(63),
});

