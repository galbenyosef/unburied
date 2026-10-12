// src__textures 03 — three
// Lines 3247-3543 of readable/src__textures.pretty.js (statement-aligned).
function buildEnv(renderer) {
  const scene = new THREE.Scene();
  const geos = [],
    mats = [];
  const add = (geo, color, pos, rot) => {
    const m = new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide });
    const mesh = new THREE.Mesh(geo, m);
    geos.push(geo);
    mats.push(m);
    if (pos) mesh.position.set(...pos);
    if (rot) mesh.rotation.set(...rot);
    scene.add(mesh);
    return mesh;
  };
  // room shell with vertical gradient (vertex colours)
  const box = new THREE.BoxGeometry(14, 4.5, 14, 8, 6, 8);
  const cols = [],
    p = box.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i),
      x = p.getX(i),
      z = p.getZ(i);
    const t = (y + 2.25) / 4.5;
    const hv =
      Math.sin(
        Math.round(x * 3) * 12.9898 +
          Math.round(z * 3) * 78.233 +
          Math.round(y * 3) * 37.719,
      ) * 43758.5453;
    const n = 0.8 + 0.4 * (hv - Math.floor(hv));
    cols.push(
      (0.018 + 0.035 * t) * n,
      (0.015 + 0.027 * t) * n,
      (0.012 + 0.02 * t) * n,
    );
  }
  box.setAttribute("color", new THREE.Float32BufferAttribute(cols, 3));
  const shellM = new THREE.MeshBasicMaterial({
    vertexColors: true,
    side: THREE.BackSide,
  });
  scene.add(new THREE.Mesh(box, shellM));
  geos.push(box);
  mats.push(shellM);
  // bulbs + their warm pools on ceiling/walls
  const bulbs = [
    [-3, 1.6, -2.5],
    [3.5, 1.7, 2.5],
    [0, 1.7, -5.5],
    [-4.5, 1.6, 4],
  ];
  const sg = new THREE.SphereGeometry(0.13, 12, 8);
  for (const b of bulbs) {
    add(sg, new THREE.Color(9, 5.2, 2.2), b);
    add(
      new THREE.CircleGeometry(1.4, 24),
      new THREE.Color(0.16, 0.1, 0.05),
      [b[0], 2.24, b[2]],
      [Math.PI / 2, 0, 0],
    );
  }
  // moon window on +X wall with mullions, plus its floor spill
  add(
    new THREE.PlaneGeometry(2.6, 1.5),
    new THREE.Color(0.55, 0.68, 1.0).multiplyScalar(1.6),
    [6.95, 0.9, 0.5],
    [0, -Math.PI / 2, 0],
  );
  add(
    new THREE.PlaneGeometry(0.12, 1.6),
    new THREE.Color(0.01, 0.01, 0.012),
    [6.9, 0.9, 0.5],
    [0, -Math.PI / 2, 0],
  );
  add(
    new THREE.PlaneGeometry(2.7, 0.1),
    new THREE.Color(0.01, 0.01, 0.012),
    [6.9, 0.9, 0.5],
    [0, -Math.PI / 2, 0],
  );
  add(
    new THREE.PlaneGeometry(3, 2.2),
    new THREE.Color(0.035, 0.045, 0.07),
    [5, -2.23, 0.5],
    [-Math.PI / 2, 0, 0],
  );
  // a warm fire glow low on the -X side (burning barrel)
  add(
    new THREE.SphereGeometry(0.35, 12, 8),
    new THREE.Color(2.2, 0.8, 0.2),
    [-6.2, -1.3, -1],
  );
  const pm = new THREE.PMREMGenerator(renderer);
  const rt = pm.fromScene(scene, 0.035);
  pm.dispose();
  for (const g of geos) g.dispose();
  for (const m of mats) m.dispose();
  return rt.texture;
}

// ------------------------------------------------------------------------------------------------
// worker pool + IndexedDB cache
// ------------------------------------------------------------------------------------------------
// Runs inside each Blob worker. Self-contained (serialised with toString()).
function workerMain(g) {
  let dbp = null;
  const openDB = () =>
    dbp ||
    (dbp = new Promise((res) => {
      try {
        const rq = indexedDB.open("unburied-textures", 1);
        rq.onupgradeneeded = () => rq.result.createObjectStore("tex");
        rq.onsuccess = () => res(rq.result);
        rq.onerror = () => res(null);
        rq.onblocked = () => res(null);
      } catch (e) {
        res(null);
      }
    }));
  const get = async (key) => {
    const db = await openDB();
    if (!db) return null;
    return new Promise((res) => {
      try {
        const rq = db
          .transaction("tex", "readonly")
          .objectStore("tex")
          .get(key);
        rq.onsuccess = () => res(rq.result || null);
        rq.onerror = () => res(null);
      } catch (e) {
        res(null);
      }
    });
  };
  const put = async (key, val) => {
    const db = await openDB();
    if (!db) return;
    try {
      db.transaction("tex", "readwrite").objectStore("tex").put(val, key);
    } catch (e) {
      /* quota etc. */
    }
  };
  self.onmessage = async (e) => {
    const { name, version, cache } = e.data;
    try {
      let out = null,
        hit = false;
      if (cache) {
        const c = await get(name);
        if (c && c.version === version) {
          out = c.out;
          hit = true;
        }
      }
      if (!out) {
        out = g.run(name);
        if (cache) await put(name, { version, out }); // clones synchronously, before we transfer
      }
      const tr = [out.col.buffer, out.orm.buffer, out.nrm.buffer];
      if (out.emi) tr.push(out.emi.buffer);
      self.postMessage({ name, out, hit }, tr);
    } catch (err) {
      self.postMessage({ name, error: String((err && err.stack) || err) });
    }
  };
}

function strHash(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(36);
}

// dispatch jobs to up to n workers; resolves with the names that could not be done in a worker
function runPool(jobs, n, version, cache, onResult) {
  return new Promise((resolve) => {
    let url;
    try {
      const src = `const GEN = ${GEN.toString()};\nconst g = GEN();\n(${workerMain.toString()})(g);\n`;
      url = URL.createObjectURL(new Blob([src], { type: "text/javascript" }));
    } catch (e) {
      resolve(jobs.slice());
      return;
    }
    const queue = jobs.slice(),
      failed = [];
    let live = 0,
      outstanding = jobs.length;
    const finish = () => {
      if (outstanding > 0 && live > 0) return;
      URL.revokeObjectURL(url);
      resolve(failed.concat(queue.splice(0)));
    };
    const feed = (w) => {
      const name = queue.shift();
      if (!name) {
        w.terminate();
        live--;
        w.cur = null;
        finish();
        return;
      }
      w.cur = name;
      w.postMessage({ name, version, cache });
    };
    for (let k = 0; k < n; k++) {
      let w;
      try {
        w = new Worker(url);
      } catch (e) {
        continue;
      }
      live++;
      w.onmessage = (e) => {
        const d = e.data;
        outstanding--;
        if (d.error) {
          console.warn(
            "[textures] worker failed on",
            d.name,
            d.error.slice(0, 300),
          );
          failed.push(d.name);
        } else {
          try {
            onResult(d.name, d.out, d.hit);
          } catch (err) {
            console.error("[textures]", d.name, err);
            failed.push(d.name);
          }
        }
        feed(w);
      };
      w.onerror = (ev) => {
        ev.preventDefault?.();
        if (w.cur) {
          failed.push(w.cur);
          outstanding--;
        }
        w.cur = null;
        try {
          w.terminate();
        } catch (e) {
          /* */
        }
        live--;
        finish();
      };
      feed(w);
    }
    if (!live) {
      URL.revokeObjectURL(url);
      resolve(jobs.slice());
    }
  });
}

// ------------------------------------------------------------------------------------------------
// public API
// ------------------------------------------------------------------------------------------------
const yieldFrame = () =>
  new Promise((r) => {
    if (
      typeof document !== "undefined" &&
      document.hidden &&
      typeof MessageChannel !== "undefined"
    ) {
      const c = new MessageChannel();
      c.port1.onmessage = () => r();
      c.port2.postMessage(0);
    } else setTimeout(r, 0);
  });

function mkTex(bytes, W, H, srgb, aniso) {
  const t = new THREE.DataTexture(
    new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength),
    W,
    H,
    THREE.RGBAFormat,
    THREE.UnsignedByteType,
  );
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.magFilter = THREE.LinearFilter;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.generateMipmaps = true;
  t.anisotropy = aniso;
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.needsUpdate = true;
  return t;
}

// opts: { workers?: number (0 = main thread only), cache?: bool (IndexedDB, default true) }
