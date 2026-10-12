// src__textures 04 — out
// Lines 3544-3756 of readable/src__textures.pretty.js (statement-aligned).
export async function createTextures(renderer, onProgress, opts = {}) {
  const T0 = performance.now();
  const aniso =
    renderer && renderer.capabilities && renderer.capabilities.getMaxAnisotropy
      ? renderer.capabilities.getMaxAnisotropy()
      : 1;
  const names = [...ARCH, ...PROPS];
  const total = names.length + 1;
  let done = 0;
  const prog = () => {
    try {
      onProgress && onProgress(Math.min(1, done / total));
    } catch (e) {
      /* ignore */
    }
  };
  prog();

  const store = new Map(),
    timings = {};
  let cacheHits = 0;
  const prof = {};
  const accept = (name, out, hit) => {
    const tx = {
      map: mkTex(out.col, out.W, out.H, true, aniso),
      normalMap: mkTex(out.nrm, out.W, out.H, false, aniso),
      roughnessMap: mkTex(out.orm, out.W, out.H, false, aniso),
    };
    if (out.meta.metal) tx.metalnessMap = tx.roughnessMap;
    if (out.meta.ao) tx.aoMap = tx.roughnessMap;
    if (out.emi) tx.emissiveMap = mkTex(out.emi, out.W, out.H, true, aniso);
    for (const k of ["map", "normalMap", "roughnessMap", "emissiveMap"]) {
      if (tx[k] && renderer && renderer.initTexture) {
        try {
          renderer.initTexture(tx[k]);
        } catch (e) {
          /* uploads lazily */
        }
      }
    }
    store.set(name, { tx, meta: out.meta });
    prof[name] = out.meta.prof;
    if (hit) cacheHits++;
    timings[name] = Math.round(performance.now() - T0);
    done++;
    prog();
  };

  // environment first (GPU work on the main thread while workers crunch)
  let envMap = null;
  const hc =
    (typeof navigator !== "undefined" && navigator.hardwareConcurrency) || 4;
  const nWorkers = opts.workers ?? Math.max(0, Math.min(6, hc - 1));
  const canWork =
    nWorkers > 0 &&
    typeof Worker !== "undefined" &&
    typeof Blob !== "undefined" &&
    typeof OffscreenCanvas !== "undefined";
  const version = strHash(GEN.toString());
  // biggest jobs first so the pool drains evenly
  const jobs = names.slice().sort((a, b) => (COST[b] || 1) - (COST[a] || 1));
  const poolP = canWork
    ? runPool(
        jobs,
        nWorkers,
        version,
        opts.cache !== false && typeof indexedDB !== "undefined",
        accept,
      )
    : Promise.resolve(jobs);
  try {
    if (renderer) envMap = buildEnv(renderer);
  } catch (e) {
    console.warn("[textures] envMap failed", e);
  }
  done++;
  prog();

  const leftovers = await poolP;
  if (leftovers.length) {
    let g = null;
    try {
      g = GEN();
    } catch (e) {
      console.error("[textures] generator init failed", e);
    }
    for (const name of leftovers) {
      await yieldFrame();
      const t0 = performance.now();
      try {
        accept(name, g.run(name), false);
      } catch (e) {
        console.error("[textures] generation failed for", name, e);
      }
      timings[name + " (main)"] = Math.round(performance.now() - t0);
    }
  }

  const baseCache = new Map(),
    ovCache = new Map(),
    warned = new Set();
  let fallback = null;
  const getFallback = () =>
    fallback ||
    (fallback = new THREE.MeshStandardMaterial({
      color: 0x808080,
      roughness: 0.85,
      metalness: 0,
      name: "fallback",
    }));

  function camoUpdate(m, t) {
    if (m.map) m.map.offset.set(t * 0.031, t * 0.019);
    if (m.emissiveMap) m.emissiveMap.offset.set(-t * 0.024, t * 0.041);
    m.emissiveIntensity =
      (m.userData.baseEmissive || 1.6) *
      (0.82 + 0.12 * Math.sin(t * 2.6) + 0.06 * Math.sin(t * 7.1));
  }

  function build(name) {
    const e = store.get(name);
    if (!e) return null;
    const { tx, meta } = e;
    const m = new THREE.MeshStandardMaterial({
      map: tx.map,
      normalMap: tx.normalMap,
      roughnessMap: tx.roughnessMap,
      roughness: 1,
      metalness: meta.metal ? 1 : 0,
      envMap,
      envMapIntensity: meta.env ?? 0.5,
    });
    if (meta.metal) m.metalnessMap = tx.metalnessMap;
    if (meta.ao) {
      m.aoMap = tx.aoMap;
      m.aoMapIntensity = 1;
    }
    m.name = name;
    if (name === "packed_camo" && tx.emissiveMap) {
      // emissive layer scrolls against the base map -> slowly churning swirl
      m.emissiveMap = tx.emissiveMap;
      m.emissive = new THREE.Color(1, 1, 1);
      m.userData.baseEmissive = 1.6;
      m.emissiveIntensity = 1.6;
      m.userData.update = (t) => camoUpdate(m, t);
    }
    return m;
  }

  const T = {
    envMap,
    names: names.filter((n) => store.has(n)),
    timings,
    prof,
    workers: canWork ? nWorkers : 0,
    cacheHit: cacheHits,
    genMs: 0,
    mat(name, overrides) {
      let base = baseCache.get(name);
      if (!base) {
        base = build(name);
        if (!base) {
          if (!warned.has(name)) {
            warned.add(name);
            console.warn(
              `[textures] unknown material "${name}" — using neutral grey`,
            );
          }
          base = getFallback();
        } else baseCache.set(name, base);
      }
      if (!overrides) return base;
      let key;
      try {
        key = name + "|" + JSON.stringify(overrides);
      } catch (e) {
        key = null;
      }
      if (key && ovCache.has(key)) return ovCache.get(key);
      const m = base.clone();
      try {
        m.setValues(overrides);
      } catch (e) {
        console.warn("[textures] bad overrides for", name, e);
      }
      if (base.userData.update) {
        m.userData.baseEmissive =
          overrides.emissiveIntensity ?? base.userData.baseEmissive;
        m.userData.update = (t) => camoUpdate(m, t);
      }
      if (key) ovCache.set(key, m);
      return m;
    },
    tex(name) {
      const e = store.get(name);
      if (!e) {
        if (!warned.has("tex:" + name)) {
          warned.add("tex:" + name);
          console.warn(`[textures] unknown texture set "${name}"`);
        }
        return { map: null, normalMap: null, roughnessMap: null };
      }
      return { ...e.tx };
    },
  };
  T.genMs = Math.round(performance.now() - T0);
  try {
    onProgress && onProgress(1);
  } catch (e) {
    /* ignore */
  }
  return T;
}
