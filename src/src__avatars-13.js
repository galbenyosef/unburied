// src__avatars 13 — acc
// Lines 3462-3801 of readable/src__avatars.pretty.js (statement-aligned).
function buildCharacter(C) {
  const acc = new Acc();
  const TS = makeTorso(C);
  const topB = C.top === "leather" ? "leather" : "cloth";
  buildTorso(acc, C, TS);
  buildCollar(acc, C, TS);
  buildNeck(acc, C);
  const textured = typeof document !== "undefined";
  const head = buildHead(acc, C, textured);
  buildHeadgear(acc, C, head.sc);
  buildArms(
    acc,
    C,
    topB,
    srgb(C.topCol),
    C.top === "leather" ? mul3(srgb(C.topCol), 0.75) : null,
  );
  buildHands(acc, C);
  buildLegs(acc, C, srgb(C.trouserCol));
  legwear(acc, C);
  buildBoots(acc, C);
  buildGear(acc, C, TS);
  const k = C.height / BASE_H;
  const geos = acc.finish(k);
  const rest = restPositions(C).map((p) => p.multiplyScalar(k));
  const headB = rest[B.head];
  return {
    geos,
    rest,
    k,
    tris: acc.tris,
    face: head.face,
    // head-bone-relative points (bind rotation is identity so these stay valid in bone space)
    eyeL: head.eyes[0].clone().multiplyScalar(k).sub(headB),
    eyeR: head.eyes[1].clone().multiplyScalar(k).sub(headB),
    headC: HC.clone().multiplyScalar(k).sub(headB),
    mouth: new V3(0, -0.064, 0.09).add(HC).multiplyScalar(k).sub(headB),
    // chest-bone-relative shoulder pocket (right) and sternum
    pocket: new V3(-0.118 * C.shoulder, 1.412, 0.1)
      .multiplyScalar(k)
      .sub(rest[B.chest]),
    sternum: new V3(0, 1.36, 0.13).multiplyScalar(k).sub(rest[B.chest]),
    pouchL: new V3(0.12, 1.0, 0.13).multiplyScalar(k).sub(rest[B.hips]),
    pouchR: new V3(-0.12, 1.0, 0.13).multiplyScalar(k).sub(rest[B.hips]),
  };
}

// ---------------------------------------------------------------- materials
const lin8 = (() => {
  const t = new Float32Array(256);
  for (let i = 0; i < 256; i++) {
    const c = i / 255;
    t[i] = c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  }
  return t;
})();
function avgLinear(tex) {
  const img = tex && tex.image;
  if (!img || !img.data || !img.data.length) return null;
  const d = img.data;
  let r = 0,
    g = 0,
    b = 0,
    n = 0;
  for (let i = 0; i < d.length; i += 4 * 29) {
    r += lin8[d[i]];
    g += lin8[d[i + 1]];
    b += lin8[d[i + 2]];
    n++;
  }
  return n ? [r / n, g / n, b / n] : null;
}
/** cheap subsurface look: wrapped diffuse with a warm red tint where light wraps past the terminator */
const SKIN_CHUNK = (() => {
  const src = THREE.ShaderChunk.lights_physical_pars_fragment;
  const a = "vec3 irradiance = dotNL * directLight.color;";
  const b =
    "reflectedLight.directDiffuse += irradiance * BRDF_Lambert( material.diffuseContribution );";
  if (!src || src.indexOf(a) < 0 || src.indexOf(b) < 0) return null;
  return src
    .replace(
      a,
      a +
        `
	float skMask = smoothstep( 0.06, 0.2, dot( material.diffuseContribution, vec3( 0.3, 0.59, 0.11 ) ) ) * step( material.diffuseContribution.b * 1.15, material.diffuseContribution.r );
	float skWrapNL = saturate( ( dot( geometryNormal, directLight.direction ) + 0.36 * skMask ) / ( 1.0 + 0.36 * skMask ) );
	vec3 skIrr = directLight.color * skWrapNL * mix( vec3( 1.0 ), vec3( 1.0, 0.45, 0.32 ), saturate( ( skWrapNL - dotNL ) * 1.7 ) * skMask );`,
    )
    .replace(
      b,
      "reflectedLight.directDiffuse += skIrr * BRDF_Lambert( material.diffuseContribution );",
    );
})();
function skinShader(m) {
  if (!SKIN_CHUNK) return m;
  m.onBeforeCompile = (sh) => {
    sh.fragmentShader = sh.fragmentShader.replace(
      "#include <lights_physical_pars_fragment>",
      SKIN_CHUNK,
    );
  };
  m.customProgramCacheKey = () => "avatar_skin_wrap";
  return m;
}
function makeMaterials(T) {
  const env = T && T.envMap ? T.envMap : null;
  const texOf = (name) => {
    try {
      return T && T.tex ? T.tex(name) : null;
    } catch (e) {
      return null;
    }
  };
  const fromTex = (name, o) => {
    const m = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: o.rough ?? 1,
      metalness: 0,
      envMap: env,
      envMapIntensity: o.env ?? 0.35,
    });
    const tx = texOf(name);
    const avg = tx && tx.map ? avgLinear(tx.map) : null;
    if (avg) {
      m.map = tx.map;
      m.color.setRGB(
        1 / Math.max(0.02, avg[0]),
        1 / Math.max(0.02, avg[1]),
        1 / Math.max(0.02, avg[2]),
      );
    } else m.roughness = o.fallRough ?? 0.85;
    if (tx && tx.normalMap) {
      m.normalMap = tx.normalMap;
      m.normalScale = new THREE.Vector2(o.ns ?? 1, o.ns ?? 1);
    }
    if (tx && tx.roughnessMap && avg) m.roughnessMap = tx.roughnessMap;
    m.name = "avatar_" + name;
    return m;
  };
  const cloth = fromTex("sleeve_olive", { env: 0.25, ns: 0.8 });
  const leather = fromTex("leather", { env: 0.5, ns: 0.8, fallRough: 0.6 });
  const metal = fromTex("helmet_steel", { env: 0.6, ns: 1, fallRough: 0.6 });
  try {
    const hm = T && T.mat ? T.mat("helmet_steel") : null;
    if (hm && hm.metalnessMap) {
      metal.metalnessMap = hm.metalnessMap;
      metal.metalness = 1;
    }
  } catch (e) {
    /* stub */
  }
  const skin = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.64,
    metalness: 0,
    envMap: env,
    envMapIntensity: 0.22,
    name: "avatar_skin",
  });
  skin.emissive = new THREE.Color(0.022, 0.006, 0.003);
  skin.emissiveIntensity = 1;
  const ltx = texOf("leather");
  if (ltx && ltx.normalMap) {
    skin.normalMap = ltx.normalMap;
    skin.normalScale = new THREE.Vector2(0.22, 0.22);
  }
  skinShader(skin);
  return { cloth, leather, metal, skin };
}

// ====================================================================================== weapons (3rd person)
const PISTOLS = new Set(["m1911", "aether"]);
const RELOAD_CLASS = {
  m1911: "pistol",
  aether: "capsule",
  kar98k: "bolt",
  trench: "shell",
  mp40: "mag",
  thompson: "mag",
  stg44: "mag",
  mg42: "belt",
};
const RELOAD_DUR = {
  m1911: [1.5, 1.9],
  aether: [2.2, 2.2],
  kar98k: [3.1, 3.1],
  trench: [0.5, 0.5],
  mp40: [2.2, 2.8],
  thompson: [2.3, 2.9],
  stg44: [2.4, 3.0],
  mg42: [5.0, 5.0],
};
const KEEP_PARTS = new Set([
  "mag",
  "bolt",
  "pump",
  "cover",
  "belt",
  "clip",
  "capsule",
]);
const FALLBACK_LEFT = {
  kar98k: [0.41, 0.04, 0],
  trench: [0.4, 0, 0],
  mp40: [0.12, 0.018, 0],
  thompson: [0.3, 0.04, 0],
  stg44: [0.32, 0.0, 0],
  mg42: [0.33, 0.0, 0],
  m1911: [0.006, -0.009, -0.002],
  aether: [0.006, -0.008, -0.002],
};

/** vertex-clustering decimation (cell in metres). Keeps creases by splitting normals into bins. */
function clusterDecimate(geo, cell) {
  const P = geo.attributes.position,
    N = geo.attributes.normal,
    UV = geo.attributes.uv;
  const idx = geo.index ? geo.index.array : null;
  const nIdx = idx ? idx.length : P.count;
  const cells = new Map(),
    cpos = [],
    vkeys = new Map(),
    verts = [];
  const cid = new Int32Array(P.count),
    vid = new Int32Array(P.count);
  for (let i = 0; i < P.count; i++) {
    const x = P.getX(i),
      y = P.getY(i),
      z = P.getZ(i);
    const ck = `${Math.floor(x / cell)},${Math.floor(y / cell)},${Math.floor(z / cell)}`;
    let c = cells.get(ck);
    if (c === undefined) {
      c = cpos.length;
      cells.set(ck, c);
      cpos.push([0, 0, 0, 0]);
    }
    const C = cpos[c];
    C[0] += x;
    C[1] += y;
    C[2] += z;
    C[3]++;
    cid[i] = c;
    const nx = N ? N.getX(i) : 0,
      ny = N ? N.getY(i) : 1,
      nz = N ? N.getZ(i) : 0;
    const vk =
      c +
      "|" +
      Math.round(nx * 1.6) +
      "," +
      Math.round(ny * 1.6) +
      "," +
      Math.round(nz * 1.6);
    let v = vkeys.get(vk);
    if (v === undefined) {
      v = verts.length;
      vkeys.set(vk, v);
      verts.push({
        c,
        n: [0, 0, 0],
        uv: UV ? [UV.getX(i), UV.getY(i)] : [0, 0],
      });
    }
    const V = verts[v];
    V.n[0] += nx;
    V.n[1] += ny;
    V.n[2] += nz;
    vid[i] = v;
  }
  const out = [];
  for (let t = 0; t < nIdx; t += 3) {
    const i0 = idx ? idx[t] : t,
      i1 = idx ? idx[t + 1] : t + 1,
      i2 = idx ? idx[t + 2] : t + 2;
    if (cid[i0] === cid[i1] || cid[i1] === cid[i2] || cid[i0] === cid[i2])
      continue;
    out.push(vid[i0], vid[i1], vid[i2]);
  }
  const pos = new Float32Array(verts.length * 3),
    nor = new Float32Array(verts.length * 3),
    uv = new Float32Array(verts.length * 2);
  verts.forEach((V, i) => {
    const C = cpos[V.c];
    pos[i * 3] = C[0] / C[3];
    pos[i * 3 + 1] = C[1] / C[3];
    pos[i * 3 + 2] = C[2] / C[3];
    const l = Math.hypot(V.n[0], V.n[1], V.n[2]) || 1;
    nor[i * 3] = V.n[0] / l;
    nor[i * 3 + 1] = V.n[1] / l;
    nor[i * 3 + 2] = V.n[2] / l;
    uv[i * 2] = V.uv[0];
    uv[i * 2 + 1] = V.uv[1];
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  g.setAttribute("normal", new THREE.BufferAttribute(nor, 3));
  g.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
  g.setIndex(out);
  g.computeBoundingSphere();
  return g;
}
function mergeGeos(list) {
  let nv = 0,
    ni = 0;
  for (const g of list) {
    nv += g.attributes.position.count;
    ni += g.index ? g.index.count : g.attributes.position.count;
  }
  const pos = new Float32Array(nv * 3),
    nor = new Float32Array(nv * 3),
    uv = new Float32Array(nv * 2),
    ix = new Uint32Array(ni);
  let ov = 0,
    oi = 0;
  for (const g of list) {
    const P = g.attributes.position,
      N = g.attributes.normal,
      U = g.attributes.uv,
      n = P.count;
    pos.set(P.array.subarray(0, n * 3), ov * 3);
    if (N) nor.set(N.array.subarray(0, n * 3), ov * 3);
    if (U) uv.set(U.array.subarray(0, n * 2), ov * 2);
    if (g.index) {
      const I = g.index.array;
      for (let k = 0; k < I.length; k++) ix[oi + k] = I[k] + ov;
      oi += I.length;
    } else {
      for (let k = 0; k < n; k++) ix[oi + k] = ov + k;
      oi += n;
    }
    ov += n;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  g.setAttribute("normal", new THREE.BufferAttribute(nor, 3));
  g.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
  g.setIndex(new THREE.BufferAttribute(ix, 1));
  return g;
}
/** Build a cached third-person template of a weapon: merged by (part, material), decimated. */
