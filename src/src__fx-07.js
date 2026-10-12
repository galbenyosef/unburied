// src__fx 07 — gold
// Lines 1617-1961 of readable/src__fx.pretty.js (statement-aligned).
function buildPowerupGeos() {
  const G = {}; // type -> {gold: geo, dark: geo}
  const ext = (shape, depth, bev = 0.012) =>
    new THREE.ExtrudeGeometry(shape, {
      depth,
      bevelEnabled: true,
      bevelThickness: bev,
      bevelSize: bev * 0.8,
      bevelSegments: 3,
      curveSegments: 10,
    });
  // --- max ammo: ammo crate with rope handles + rounds on top
  {
    const gold = [],
      dark = [];
    gold.push(place(new THREE.BoxGeometry(0.36, 0.2, 0.22), 0, 0, 0));
    for (const sx of [-1, 1])
      for (const sz of [-1, 1])
        dark.push(
          place(
            new THREE.BoxGeometry(0.03, 0.212, 0.03),
            sx * 0.168,
            0,
            sz * 0.098,
          ),
        );
    dark.push(place(new THREE.BoxGeometry(0.37, 0.03, 0.23), 0, 0.085, 0));
    dark.push(place(new THREE.BoxGeometry(0.2, 0.06, 0.005), 0, -0.01, 0.112)); // stencil band
    for (const sx of [-1, 1])
      dark.push(
        place(
          new THREE.TorusGeometry(0.04, 0.009, 8, 16, Math.PI),
          sx * 0.18,
          0.02,
          0,
          Math.PI / 2,
          0,
          (-sx * Math.PI) / 2,
        ),
      );
    for (let i = 0; i < 5; i++) {
      const x = -0.1 + i * 0.05,
        tilt = (i - 2) * 0.06;
      gold.push(
        place(
          new THREE.CylinderGeometry(0.013, 0.013, 0.075, 12),
          x,
          0.14,
          -0.01,
          0,
          0,
          tilt,
        ),
      );
      gold.push(
        place(
          new THREE.ConeGeometry(0.013, 0.035, 12),
          x - Math.sin(tilt) * 0.055,
          0.195,
          -0.01,
          0,
          0,
          tilt,
        ),
      );
    }
    G.maxammo = { gold, dark };
  }
  // --- insta-kill: grinning skull
  {
    const gold = [],
      dark = [];
    gold.push(
      place(
        new THREE.SphereGeometry(0.13, 32, 24),
        0,
        0.035,
        -0.01,
        0,
        0,
        0,
        1,
        0.98,
        1.12,
      ),
    ); // cranium
    gold.push(
      place(
        new THREE.CylinderGeometry(0.078, 0.062, 0.08, 20),
        0,
        -0.075,
        0.04,
        0,
        0,
        0,
        1,
        1,
        0.95,
      ),
    ); // maxilla
    for (const sx of [-1, 1]) {
      dark.push(
        place(
          new THREE.SphereGeometry(0.041, 18, 14),
          sx * 0.049,
          -0.012,
          0.118,
          0,
          0,
          sx * 0.25,
          1.05,
          0.9,
          0.55,
        ),
      ); // sockets
      gold.push(
        place(
          new THREE.SphereGeometry(0.026, 12, 10),
          sx * 0.07,
          -0.052,
          0.07,
          0,
          0,
          0,
          0.8,
          0.7,
          1,
        ),
      ); // zygomatic
    }
    dark.push(
      place(
        new THREE.ConeGeometry(0.017, 0.036, 3),
        0,
        -0.05,
        0.128,
        0,
        0,
        0,
        1,
        1,
        0.45,
      ),
    ); // nasal cavity
    const toothRow = (y, z0, curve, h) => {
      for (let i = 0; i < 10; i++) {
        const t = (i - 4.5) / 4.5,
          x = t * 0.058;
        gold.push(
          place(
            new THREE.BoxGeometry(0.0105, h, 0.012),
            x,
            y + t * t * curve,
            z0 - t * t * 0.03,
            0,
            t * 0.55,
            0,
          ),
        );
      }
    };
    toothRow(-0.113, 0.103, 0.018, 0.022); // upper teeth, grin curving up
    toothRow(-0.137, 0.098, 0.014, 0.018); // lower teeth
    dark.push(place(new THREE.BoxGeometry(0.085, 0.04, 0.02), 0, -0.125, 0.08)); // mouth gap behind teeth
    gold.push(
      place(
        new THREE.TorusGeometry(0.062, 0.015, 8, 20, Math.PI),
        0,
        -0.15,
        0.035,
        Math.PI / 2,
        0,
        0,
        1,
        1,
        1.1,
      ),
    ); // mandible
    G.instakill = { gold, dark };
  }
  // --- double points: bold extruded "x2"
  {
    const gold = [],
      dark = [];
    const xw = 0.05;
    const xa = strokeShape(
        [
          [-0.07, -0.07],
          [0.07, 0.07],
        ],
        xw,
      ),
      xb = strokeShape(
        [
          [-0.07, 0.07],
          [0.07, -0.07],
        ],
        xw,
      );
    const two = [];
    for (let i = 0; i <= 12; i++) {
      const a = Math.PI * 0.95 - (i / 12) * Math.PI * 1.2;
      two.push([0.075 * Math.cos(a), 0.06 + 0.075 * Math.sin(a)]);
    }
    two.push([-0.08, -0.105]);
    two.push([0.09, -0.105]);
    const s2 = strokeShape(two, 0.052);
    for (const [s, dx] of [
      [xa, -0.14],
      [xb, -0.14],
      [s2, 0.09],
    ]) {
      const g = ext(s, 0.05);
      g.translate(dx, 0, -0.025);
      gold.push(nonIdx(g));
    }
    G.doublepoints = { gold, dark };
  }
  // --- nuke: old aerial bomb
  {
    const gold = [],
      dark = [];
    const prof = [];
    for (let i = 0; i <= 20; i++) {
      const t = i / 20;
      const y = -0.2 + t * 0.4;
      const r =
        0.085 *
        Math.pow(Math.sin(Math.PI * Math.min(1, 0.12 + t * 0.95)), 0.6) *
        (t < 0.5 ? 1 : 1 - (t - 0.5) * 0.9);
      prof.push(new THREE.Vector2(Math.max(0.004, r), y));
    }
    const body = new THREE.LatheGeometry(prof, 28);
    gold.push(place(body, 0, 0, 0));
    for (let k = 0; k < 4; k++)
      gold.push(
        place(
          new THREE.BoxGeometry(0.004, 0.11, 0.075),
          Math.sin((k * Math.PI) / 2) * 0.037,
          0.25,
          Math.cos((k * Math.PI) / 2) * 0.037,
          0,
          (k * Math.PI) / 2 + Math.PI / 2,
          0,
        ),
      );
    for (let k = 0; k < 4; k++)
      gold.push(
        place(
          new THREE.BoxGeometry(0.106, 0.045, 0.004),
          Math.sin((k * Math.PI) / 2) * 0.053,
          0.28,
          Math.cos((k * Math.PI) / 2) * 0.053,
          0,
          (k * Math.PI) / 2,
          0,
        ),
      ); // box-fin shroud
    dark.push(
      place(new THREE.CylinderGeometry(0.087, 0.087, 0.03, 28), 0, -0.03, 0),
    );
    dark.push(
      place(new THREE.CylinderGeometry(0.015, 0.02, 0.03, 12), 0, -0.21, 0),
    );
    const merge = (arr) =>
      arr.map((g) => {
        g.rotateZ(Math.PI / 2 + 0.35);
        return g;
      });
    merge(gold);
    merge(dark);
    G.nuke = { gold, dark };
  }
  // --- carpenter: claw hammer
  {
    const gold = [],
      dark = [];
    gold.push(
      place(new THREE.CylinderGeometry(0.013, 0.017, 0.34, 12), 0, -0.06, 0),
    ); // handle
    dark.push(
      place(new THREE.CylinderGeometry(0.02, 0.019, 0.13, 12), 0, -0.17, 0),
    ); // grip
    gold.push(
      place(new THREE.BoxGeometry(0.075, 0.042, 0.036), 0.012, 0.13, 0),
    ); // head body (eye)
    gold.push(
      place(
        new THREE.CylinderGeometry(0.02, 0.024, 0.045, 16),
        0.07,
        0.13,
        0,
        0,
        0,
        Math.PI / 2,
      ),
    ); // neck
    gold.push(
      place(
        new THREE.CylinderGeometry(0.027, 0.027, 0.018, 18),
        0.098,
        0.13,
        0,
        0,
        0,
        Math.PI / 2,
      ),
    ); // striking face
    for (const sz of [-1, 1]) {
      const curve = new THREE.QuadraticBezierCurve3(
        new THREE.Vector3(-0.025, 0.135, sz * 0.008),
        new THREE.Vector3(-0.08, 0.14, sz * 0.01),
        new THREE.Vector3(-0.1, 0.09, sz * 0.013),
      );
      gold.push(nonIdx(new THREE.TubeGeometry(curve, 10, 0.012, 8, false)));
      gold.push(
        place(
          new THREE.ConeGeometry(0.012, 0.022, 8),
          -0.103,
          0.082,
          sz * 0.013,
          0,
          0,
          Math.PI + 0.35,
        ),
      );
    }
    for (const g of gold.concat(dark)) g.rotateZ(-0.5);
    G.carpenter = { gold, dark };
  }
  const out = {};
  for (const k in G)
    out[k] = {
      gold: mergeGeometries(G[k].gold, false),
      dark: G[k].dark.length ? mergeGeometries(G[k].dark, false) : null,
    };
  return out;
}

/* ================================================================ FX ==== */
const BLOOD_R = 0.1,
  BLOOD_G = 0.011,
  BLOOD_B = 0.009;
const LIGHT_POOL = 4;

