// src__avatars 14 — owner
// Lines 3802-4114 of readable/src__avatars.pretty.js (statement-aligned).
function buildGunTemplate(bwm, T, id, upgraded, cell0 = 0.0028) {
  const src = bwm(id, T, upgraded);
  src.updateMatrixWorld(true);
  const inv = new M4().copy(src.matrixWorld).invert();
  const partFrame = new Map(); // part object -> {pos, quat, inv}
  const frameOf = (part) => {
    let f = partFrame.get(part);
    if (!f) {
      const m = new M4().multiplyMatrices(inv, part.matrixWorld);
      const pos = new V3(),
        quat = new Q4(),
        scl = new V3();
      m.decompose(pos, quat, scl);
      const pose = new M4().compose(pos, quat, new V3(1, 1, 1));
      f = {
        name: part.name,
        pos,
        quat,
        inv: pose.clone().invert(),
        restVis: part.userData.restVis !== false,
      };
      partFrame.set(part, f);
    }
    return f;
  };
  const ownerOf = (o) => {
    let q = o.parent;
    while (q && q !== src) {
      if (q.userData && q.userData.part && KEEP_PARTS.has(q.name)) return q;
      q = q.parent;
    }
    return null;
  };
  const buckets = new Map(),
    rawList = [];
  const markers = {};
  let rawTris = 0;
  src.traverse((o) => {
    if (o.userData && o.userData.marker) {
      const m = new M4().multiplyMatrices(inv, o.matrixWorld),
        pos = new V3(),
        quat = new Q4(),
        scl = new V3();
      m.decompose(pos, quat, scl);
      const owner = ownerOf(o);
      const mk = { pos, quat, part: owner ? owner.name : null, local: null };
      if (owner) mk.local = pos.clone().applyMatrix4(frameOf(owner).inv);
      markers[o.name] = mk;
      return;
    }
    if (!o.isMesh) return;
    const owner = ownerOf(o);
    for (let q = o; q && q !== src && q !== owner; q = q.parent)
      if (
        !q.visible &&
        !(q.userData && q.userData.restVis === false && q === owner)
      )
        return;
    const f = owner ? frameOf(owner) : null;
    const m = new M4().multiplyMatrices(inv, o.matrixWorld);
    if (f) m.premultiply(f.inv);
    const g = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone();
    for (const k of Object.keys(g.attributes))
      if (!["position", "normal", "uv"].includes(k)) g.deleteAttribute(k);
    if (!g.attributes.normal) g.computeVertexNormals();
    g.applyMatrix4(m);
    rawTris += g.attributes.position.count / 3;
    const mat = Array.isArray(o.material) ? o.material[0] : o.material;
    rawList.push({ owner: f, mat, g });
  });
  // fold minor dark / small-part materials into the gun's primary metal (fewer draw calls at 3rd-person range)
  const area = new Map();
  for (const r of rawList)
    area.set(r.mat, (area.get(r.mat) || 0) + r.g.attributes.position.count);
  const isCamo = (m) => !!(m && /camo/.test(m.name || ""));
  const special = (m) =>
    !m ||
    m.transparent ||
    (!isCamo(m) &&
      m.emissive &&
      m.emissive.getHex &&
      m.emissive.getHex() !== 0 &&
      (m.emissiveIntensity ?? 1) > 0.05) ||
    /wood|bakelite/.test(m.name || "");
  let primary = null,
    best = -1;
  for (const [m, a] of area)
    if (!special(m) && (isCamo(m) ? a * 4 : a) > best) {
      best = isCamo(m) ? a * 4 : a;
      primary = m;
    }
  for (const r of rawList) {
    const m = r.mat && !special(r.mat) && primary ? primary : r.mat;
    const key = (r.owner ? r.owner.name : "") + "|" + (m ? m.uuid : "none");
    let bk = buckets.get(key);
    if (!bk) buckets.set(key, (bk = { owner: r.owner, mat: m, geos: [] }));
    bk.geos.push(r.g);
  }
  const root = new THREE.Group();
  root.name = "tp_" + id;
  const parts = {};
  let tris = 0;
  const cell = rawTris > 15000 ? cell0 * 1.3 : cell0;
  for (const bk of buckets.values()) {
    const merged = mergeGeos(bk.geos);
    const dec = clusterDecimate(merged, cell);
    merged.dispose();
    for (const g of bk.geos) g.dispose();
    tris += dec.index.count / 3;
    const mesh = new THREE.Mesh(dec, bk.mat);
    mesh.castShadow = true;
    mesh.receiveShadow = false;
    if (bk.owner) {
      let pg = parts[bk.owner.name];
      if (!pg) {
        pg = parts[bk.owner.name] = new THREE.Group();
        pg.name = bk.owner.name;
        pg.position.copy(bk.owner.pos);
        pg.quaternion.copy(bk.owner.quat);
        pg.userData.restPos = bk.owner.pos.clone();
        pg.userData.restQuat = bk.owner.quat.clone();
        pg.userData.restVis = bk.owner.restVis;
        pg.visible = bk.owner.restVis;
        root.add(pg);
      }
      pg.add(mesh);
    } else root.add(mesh);
  }
  // dispose the source
  src.traverse((o) => {
    if (o.isMesh && o.geometry) o.geometry.dispose();
  });
  // ---- grips (weapons agent's userData.grips first, then markers, then bbox fallback)
  const bb = new THREE.Box3().setFromObject(root);
  const G = src.userData.grips || {};
  const mk = (n) => markers[n];
  const pistol = PISTOLS.has(id);
  const right = G.right
    ? G.right.clone()
    : mk("hR")
      ? mk("hR").pos.clone()
      : new V3();
  const rightQ = G.rightQuat
    ? G.rightQuat.clone()
    : mk("hR")
      ? mk("hR").quat.clone()
      : new Q4().setFromAxisAngle(AZ, -0.35);
  const left = G.left
    ? G.left.clone()
    : mk("hL")
      ? mk("hL").pos.clone()
      : new V3(...(FALLBACK_LEFT[id] || [0.3, 0, 0]));
  const leftQ = G.leftQuat
    ? G.leftQuat.clone()
    : mk("hL")
      ? mk("hL").quat.clone()
      : pistol
        ? new Q4().setFromEuler(new THREE.Euler(-PI / 2, -PI / 2, 0))
        : new Q4().setFromEuler(new THREE.Euler(PI / 2, 0, PI / 2));
  const muzzle = G.muzzle
    ? G.muzzle.clone()
    : mk("muzzle")
      ? mk("muzzle").pos.clone()
      : new V3(bb.max.x, (bb.max.y + bb.min.y) * 0.6, 0);
  let stock = pistol
    ? null
    : G.stock
      ? G.stock.clone()
      : mk("stock")
        ? mk("stock").pos.clone()
        : null;
  if (!pistol && !stock) {
    // derive: centre of the rearmost 2 cm of the model
    const s = new V3();
    let n = 0;
    root.traverse((o) => {
      if (!o.isMesh || o.parent !== root) return;
      const P = o.geometry.attributes.position;
      for (let i = 0; i < P.count; i++)
        if (P.getX(i) < bb.min.x + 0.02) {
          s.x += P.getX(i);
          s.y += P.getY(i);
          s.z += P.getZ(i);
          n++;
        }
    });
    stock = n ? s.multiplyScalar(1 / n) : new V3(bb.min.x, 0, 0);
  }
  const sightR = mk("sightRear")
    ? mk("sightRear").pos.clone()
    : new V3(0, bb.max.y, 0);
  const sightF = mk("sightFront")
    ? mk("sightFront").pos.clone()
    : new V3(muzzle.x, bb.max.y, 0);
  // left grip riding on a moving part (trench pump)?
  let leftPart = null,
    leftLocal = null;
  if (mk("hL") && mk("hL").part && left.distanceTo(mk("hL").pos) < 0.01) {
    leftPart = mk("hL").part;
    leftLocal = mk("hL").local.clone();
  }
  const partLocal = (name, p) =>
    parts[name]
      ? p
          .clone()
          .applyMatrix4(
            new M4()
              .compose(
                parts[name].userData.restPos,
                parts[name].userData.restQuat,
                new V3(1, 1, 1),
              )
              .invert(),
          )
      : null;
  const axisR = new V3(0, 1, 0).applyQuaternion(rightQ),
    axisL = new V3(0, 1, 0).applyQuaternion(leftQ);
  const leftHoriz = Math.abs(axisL.x) > 0.7;
  const rR = Math.min(
    pistol ? 0.019 : 0.022,
    measureRadius(root, right, axisR, 0.034, 0.01, 0.55, 0.016),
  );
  const rL = pistol
    ? rR
    : Math.min(
        leftHoriz ? 0.022 : 0.026,
        measureRadius(root, left, axisL, 0.04, 0.02, 0.6, 0.018),
      );
  const info = {
    gripAxisR: axisR,
    gripAxisL: axisL,
    leftHoriz,
    rR,
    rL,
    id,
    upgraded,
    pistol,
    cls: RELOAD_CLASS[id] || "mag",
    rawTris,
    tris,
    bbox: bb,
    right,
    rightQ,
    left,
    leftQ,
    leftPart,
    leftLocal,
    muzzle,
    stock,
    sightR,
    sightF,
    markers: Object.fromEntries(
      Object.entries(markers).map(([k, v]) => [
        k,
        { pos: v.pos, quat: v.quat, part: v.part, local: v.local },
      ]),
    ),
    magLocal: parts.mag ? partLocal("mag", parts.mag.userData.restPos) : null,
    drawCalls: 0,
  };
  root.traverse((o) => {
    if (o.isMesh) info.drawCalls++;
  });
  root.userData.info = info;
  return root;
}
/** typical radius of the solid around a grip axis (for finger wrapping) */
function measureRadius(root, C, A, maxR, slab, pct, fallback) {
  const ds = [],
    v = new V3(),
    d = new V3();
  root.updateMatrixWorld(true);
  root.traverse((o) => {
    if (!o.isMesh) return;
    const P = o.geometry.attributes.position;
    for (let i = 0; i < P.count; i++) {
      v.fromBufferAttribute(P, i).applyMatrix4(o.matrixWorld);
      d.subVectors(v, C);
      const al = d.dot(A);
      if (Math.abs(al) > slab) continue;
      const r = Math.sqrt(Math.max(0, d.lengthSq() - al * al));
      if (r < maxR) ds.push(r);
    }
  });
  if (ds.length < 12) return fallback;
  ds.sort((a, b) => a - b);
  return clamp(ds[Math.floor(ds.length * pct)], 0.011, maxR * 0.85);
}
function cloneGun(tpl) {
  const info = tpl.userData.info;
  const keep = new Map();
  tpl.traverse((o) => {
    keep.set(o, o.userData);
    o.userData = {};
  });
  const g = tpl.clone(true);
  for (const [o, u] of keep) o.userData = u;
  g.userData = { info, parts: {} };
  for (const c of g.children) {
    if (c.isGroup) {
      c.userData = {
        restPos: c.position.clone(),
        restQuat: c.quaternion.clone(),
        restVis: c.visible,
      };
      g.userData.parts[c.name] = c;
    }
  }
  return g;
}

// ====================================================================================== hand poses
// 16 numbers: thumb [opposition, c0, c1, c2], then index / middle / ring / pinky [c0, c1, c2]
