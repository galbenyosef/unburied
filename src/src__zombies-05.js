// src__zombies 05 — color
// Lines 1799-2058 of readable/src__zombies.pretty.js (statement-aligned).
function buildMaterials(T) {
  const get = (name, fb) => {
    let m = null;
    try {
      m = T && T.mat ? T.mat(name) : null;
    } catch (e) {
      m = null;
    }
    if (!m || !m.isMaterial)
      m = new THREE.MeshStandardMaterial({ color: fb, roughness: 0.85 });
    return m;
  };
  const mk = (name, fb, tint = [1, 1, 1], o = {}) => {
    const m = get(name, fb).clone();
    m.vertexColors = true;
    m.color = m.color
      .clone()
      .multiply(new THREE.Color(tint[0], tint[1], tint[2]));
    for (const k in o) m[k] = o[k];
    m.needsUpdate = true;
    return m;
  };
  const skinT = [
    [0.62, 0.74, 0.6],
    [0.58, 0.68, 0.6],
    [0.7, 0.72, 0.64],
  ];
  const clothT = [
    [0.62, 0.72, 0.64],
    [0.56, 0.64, 0.64],
    [0.66, 0.68, 0.58],
  ];
  const M = {
    skin: skinT.map((t) => mk("skin_rotten", 0x7d8a70, t)),
    cloth: clothT.map((t) =>
      mk("cloth_fieldgrey", 0x5d6152, t, { side: THREE.DoubleSide }),
    ),
    gear: [mk("leather", 0x3a2c22, [0.5, 0.58, 0.66])],
    flesh: [mk("bone", 0xd8cdb0, [1, 1, 1], { roughness: 0.58, metalness: 0 })],
    helmet: [
      [0.5, 0.54, 0.5],
      [0.44, 0.47, 0.45],
    ].map((t) => {
      const m = mk("helmet_steel", 0x5a5f58, t, { side: THREE.DoubleSide });
      return m;
    }),
    eyes: [
      new THREE.MeshBasicMaterial({
        color: new THREE.Color(1.0, 0.48, 0.07).multiplyScalar(2.0),
        fog: false,
      }),
    ],
    hit: new THREE.MeshBasicMaterial({ visible: false }),
  };
  const burn = (m) => {
    const b = m.clone();
    b.color = m.color.clone().multiplyScalar(0.16);
    b.roughness = 1;
    if (b.emissive) b.emissive = new THREE.Color(0x120400);
    return b;
  };
  M.burnt = {
    skin: burn(M.skin[0]),
    cloth: burn(M.cloth[0]),
    gear: burn(M.gear[0]),
    flesh: burn(M.flesh[0]),
    helmet: burn(M.helmet[0]),
  };
  return M;
}

// ======================================================================= animation data
const GAIT = {
  walk: {
    speed: 1.1,
    cycle: 0.95,
    stance: 0.56,
    lift: 0.075,
    drop: 0.06,
    bob: 0.022,
    lean: 0.2,
  },
  run: {
    speed: 2.6,
    cycle: 0.7,
    stance: 0.36,
    lift: 0.15,
    drop: 0.08,
    bob: 0.04,
    lean: 0.34,
  },
  sprint: {
    speed: 4.4,
    cycle: 0.56,
    stance: 0.3,
    lift: 0.2,
    drop: 0.1,
    bob: 0.05,
    lean: 0.52,
  },
};
const MIRROR = {
  ua: ["uaL", "uaR"],
  fa: ["faL", "faR"],
  hd: ["hL", "hR"],
  th: ["thL", "thR"],
  sh: ["shL", "shR"],
  ft: ["ftL", "ftR"],
};
function kp(o) {
  const a = new Float32Array(PL);
  for (const k in o) {
    const v = o[k];
    if (k === "h") {
      a[H0] = v[0];
      a[H0 + 1] = v[1];
      a[H0 + 2] = v[2];
    } else if (k === "by") a[BY] = v;
    else if (k === "bp") a[BP] = v;
    else if (MIRROR[k]) {
      const [l, r] = MIRROR[k];
      a.set([v[0], v[1] || 0, v[2] || 0], BI[l] * 3);
      a.set([v[0], -(v[1] || 0), -(v[2] || 0)], BI[r] * 3);
    } else a.set([v[0], v[1] || 0, v[2] || 0], BI[k] * 3);
  }
  return a;
}
function sampleKeys(keys, u, out) {
  let i = 0;
  while (i < keys.length - 2 && u > keys[i + 1][0]) i++;
  const [u0, A] = keys[i],
    [u1, B] = keys[i + 1],
    t = smooth((u - u0) / (u1 - u0 || 1));
  for (let k = 0; k < PL; k++) out[k] = A[k] + (B[k] - A[k]) * t;
}
const TEAR_T = 1.4,
  TEAR_HIT = 0.64;
const TEAR_KEYS = (() => {
  const reach = kp({
    h: [0, -0.05, 0.03],
    spine: [0.2],
    chest: [0.24],
    neck: [0.1],
    head: [0.12, 0, 0.1],
    jaw: [0.35],
    uaL: [-2.05, 0, -0.2],
    faL: [-0.25],
    hL: [0.35, -1.2, 0],
    uaR: [-1.82, 0, 0.12],
    faR: [-0.4],
    hR: [0.35, 1.2, 0],
  });
  const deep = kp({
    h: [0, -0.07, 0.06],
    spine: [0.26],
    chest: [0.3],
    neck: [0.12],
    head: [0.2, 0, 0.05],
    jaw: [0.5],
    uaL: [-1.78, 0, -0.14],
    faL: [-0.45],
    hL: [-0.2, -1.2, 0],
    uaR: [-1.7, 0, 0.1],
    faR: [-0.5],
    hR: [-0.2, 1.2, 0],
  });
  const yank = kp({
    h: [0, -0.09, -0.1],
    spine: [-0.06, 0.12],
    chest: [-0.14, 0.32],
    neck: [0.05],
    head: [-0.15, 0.2, -0.1],
    jaw: [0.7],
    uaL: [-0.5, 0, -0.1],
    faL: [-1.55],
    hL: [-0.3, -1.0, 0],
    uaR: [-0.7, 0, 0.06],
    faR: [-1.35],
    hR: [-0.3, 1.0, 0],
  });
  const hold = kp({
    h: [0, -0.07, -0.05],
    spine: [0.05, 0.06],
    chest: [0.02, 0.18],
    neck: [0.1],
    head: [0.05, 0.1],
    jaw: [0.3],
    uaL: [-0.85, 0, -0.14],
    faL: [-1.2],
    hL: [0.2, -1.1, 0],
    uaR: [-0.95, 0, 0.1],
    faR: [-1.0],
    hR: [0.2, 1.1, 0],
  });
  return [
    [0, reach],
    [0.34, deep],
    [0.52, deep],
    [0.66, yank],
    [0.84, hold],
    [1.0, reach],
  ];
})();
const ATK_T = 1.05,
  ATK_HIT = 0.44,
  ATK_DMG = 45;
const ATK_KEYS = (() => {
  const ready = kp({
    h: [0, -0.05, 0],
    spine: [0.15],
    chest: [0.12],
    neck: [0.1],
    head: [0.1],
    jaw: [0.2],
    ua: [-1.25, 0, -0.1],
    fa: [-0.35],
    hd: [0.5, -1.2, 0],
  });
  const wind = kp({
    h: [0, -0.04, -0.04],
    spine: [-0.06, -0.1],
    chest: [-0.14, -0.12],
    neck: [-0.05],
    head: [-0.25],
    jaw: [0.75],
    ua: [-2.75, 0, 0.42],
    fa: [-0.7],
    hd: [0.2, -0.6, 0],
  });
  const swipe = kp({
    h: [0, -0.1, 0.09],
    spine: [0.24, 0.1],
    chest: [0.38, 0.12],
    neck: [0.15],
    head: [0.25],
    jaw: [0.55],
    ua: [-0.7, 0, -0.5],
    fa: [-0.2],
    hd: [0.3, -1.4, 0],
  });
  const follow = kp({
    h: [0, -0.1, 0.07],
    spine: [0.26],
    chest: [0.3],
    neck: [0.1],
    head: [0.18],
    jaw: [0.35],
    ua: [-0.3, 0, -0.3],
    fa: [-0.45],
    hd: [0.5, -1.2, 0],
  });
  return [
    [0, ready],
    [0.3, wind],
    [0.42, swipe],
    [0.6, follow],
    [1.0, ready],
  ];
})();
const VAULT_T = 1.55;
