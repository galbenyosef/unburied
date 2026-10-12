// src__level 04 — three
// Lines 2579-4318 of readable/src__level.pretty.js (statement-aligned).
function buildFeatures(ctx) {
  const {
    mat,
    box,
    boxB,
    cyl,
    anyGeo,
    solid,
    reserve,
    wallById,
    wallPoint,
    inwardN,
    dynGroup,
    tween,
    tweenP,
    wait,
    sparks,
    puff,
    updaters,
    powerables,
    canvasTex,
    colliders,
    raycastTargets,
  } = ctx;
  const out = { wallBuys: [], perks: [], navStatic: [] };
  const up = new THREE.Vector3(0, 1, 0);
  // frame against a wall: returns {c (on centre-line), n (inward), t (tangent, viewer's right), face (point on face)}
  function wallFrame(wallId, along, zone) {
    const w = wallById[wallId];
    const c = wallPoint(w, along),
      n = inwardN(w, zone);
    const t = new THREE.Vector3(n.z, 0, -n.x);
    return {
      c,
      n,
      t,
      face: c.clone().addScaledVector(n, HW),
      yaw: Math.atan2(n.x, n.z),
    };
  }
  // local (u along t, y, v along n) -> world
  const L2W = (f, u, y, v) =>
    f.face.clone().addScaledVector(f.t, u).addScaledVector(f.n, v).setY(y);
  const meshOf = (geos, m, cast = true) => {
    const me = new THREE.Mesh(mergeGeometries(geos.map(prep)), m);
    me.castShadow = cast;
    me.receiveShadow = true;
    return me;
  };
  const G = {
    box: (sx, sy, sz, x, y, z, rx = 0, ry = 0, rz = 0, uvs = 1) => {
      const g = prep(new THREE.BoxGeometry(sx, sy, sz));
      projUV(g, uvs);
      xformL(g, x, y, z, rx, ry, rz);
      return g;
    },
    cyl: (rt, rb, h, seg, x, y, z, rx = 0, ry = 0, rz = 0) => {
      const g = prep(new THREE.CylinderGeometry(rt, rb, h, seg));
      xformL(g, x, y, z, rx, ry, rz);
      return g;
    },
    sph: (r, x, y, z, ws = 10, hs = 8) => {
      const g = prep(new THREE.SphereGeometry(r, ws, hs));
      xformL(g, x, y, z);
      return g;
    },
    tor: (r, t, x, y, z, rx = 0, ry = 0, rz = 0, arc = Math.PI * 2) => {
      const g = prep(new THREE.TorusGeometry(r, t, 6, 16, arc));
      xformL(g, x, y, z, rx, ry, rz);
      return g;
    },
  };
  const _m = new THREE.Matrix4(),
    _q = new THREE.Quaternion(),
    _e = new THREE.Euler();
  function xformL(g, x, y, z, rx = 0, ry = 0, rz = 0) {
    _e.set(rx, ry, rz, "YXZ");
    _q.setFromEuler(_e);
    _m.compose(new THREE.Vector3(x, y, z), _q, new THREE.Vector3(1, 1, 1));
    g.applyMatrix4(_m);
    return g;
  }
  // add an axis-aligned collider for a local-space footprint of a group (u0..u1 along t, v0..v1 along n)
  function footprintSolid(f, u0, u1, v0, v1, h, surface, o) {
    const a = L2W(f, u0, 0, v0),
      b = L2W(f, u1, h, v1);
    return solid(a.x, 0, a.z, b.x, h, b.z, surface, o);
  }

  // ---------------------------------------------------------------------------- wall buys
  const WB = [
    {
      weaponId: "kar98k",
      cost: 200,
      ammoCost: 100,
      wall: "H2b",
      at: -3.5,
      zone: 0,
      label: "KAR98K",
      kind: "rifle",
    },
    {
      weaponId: "trench",
      cost: 1500,
      ammoCost: 750,
      wall: "V2b",
      at: 4.6,
      zone: 0,
      label: "TRENCH GUN",
      kind: "shotgun",
    },
    {
      weaponId: "mp40",
      cost: 1000,
      ammoCost: 500,
      wall: "H3a",
      at: -12.5,
      zone: 1,
      label: "MP40",
      kind: "smg",
    },
    {
      weaponId: "thompson",
      cost: 1200,
      ammoCost: 600,
      wall: "H4",
      at: 12.5,
      zone: 2,
      label: "THOMPSON",
      kind: "tommy",
    },
    {
      weaponId: "stg44",
      cost: 1200,
      ammoCost: 600,
      wall: "H5",
      at: 12.5,
      zone: 2,
      label: "STG-44",
      kind: "assault",
    },
  ];
  function chalkTex(label, cost, ammo, kind) {
    return canvasTex(1024, 512, (g, W, H) => {
      g.clearRect(0, 0, W, H);
      let seed = label.length * 131 + cost;
      const r = () => {
        seed = (seed * 16807) % 2147483647;
        return seed / 2147483647;
      };
      g.lineCap = "round";
      g.lineJoin = "round";
      const chalkPath = (pts, w = 5, closed = true) => {
        for (let pass = 0; pass < 4; pass++) {
          g.strokeStyle = `rgba(236,234,222,${0.22 + r() * 0.2})`;
          g.lineWidth = w * (0.6 + r() * 0.8);
          g.beginPath();
          pts.forEach(([x, y], i) => {
            const jx = x + (r() - 0.5) * 3,
              jy = y + (r() - 0.5) * 3;
            i ? g.lineTo(jx, jy) : g.moveTo(jx, jy);
          });
          if (closed) g.closePath();
          g.stroke();
        }
      };
      const rect = (x0, y0, x1, y1, w) =>
        chalkPath(
          [
            [x0, y0],
            [x1, y0],
            [x1, y1],
            [x0, y1],
          ],
          w,
        );
      // silhouette in a 0..100 x 0..40 space mapped to canvas region x 170..860, y 70..330
      const X = (x) => 170 + x * 6.9,
        Y = (y) => 70 + y * 6.5;
      const poly = (pts, w) =>
        chalkPath(
          pts.map(([x, y]) => [X(x), Y(y)]),
          w,
        );
      const R_ = (x0, y0, x1, y1, w) => rect(X(x0), Y(y0), X(x1), Y(y1), w);
      if (kind === "rifle") {
        poly([
          [0, 17],
          [3, 11],
          [30, 14],
          [36, 13],
          [100, 13],
          [100, 16],
          [40, 17],
          [36, 22],
          [30, 24],
          [26, 19],
          [3, 24],
        ]);
        poly(
          [
            [46, 13],
            [48, 9],
            [51, 9],
          ],
          3,
        );
      }
      if (kind === "shotgun") {
        poly([
          [0, 17],
          [3, 11],
          [28, 14],
          [48, 13],
          [95, 13],
          [95, 16],
          [48, 17],
          [34, 18],
          [30, 23],
          [26, 19],
          [3, 24],
        ]);
        R_(56, 17, 74, 21);
      }
      if (kind === "smg") {
        poly(
          [
            [4, 12],
            [26, 14],
            [26, 16],
            [4, 19],
          ],
          3,
        );
        R_(26, 11, 72, 18);
        R_(72, 12.5, 92, 16);
        R_(42, 18, 48, 38);
        poly(
          [
            [30, 18],
            [34, 18],
            [34, 27],
            [29, 27],
          ],
          4,
        );
      }
      if (kind === "tommy") {
        poly([
          [0, 17],
          [3, 11],
          [28, 13],
          [28, 20],
          [3, 24],
        ]);
        R_(28, 11, 64, 19);
        R_(64, 12.5, 94, 16);
        R_(44, 19, 50, 37);
        poly(
          [
            [31, 19],
            [35, 19],
            [36, 28],
            [31, 28],
          ],
          4,
        );
        poly(
          [
            [68, 16],
            [72, 16],
            [72, 24],
            [68, 24],
          ],
          4,
        );
      }
      if (kind === "assault") {
        poly([
          [0, 16],
          [3, 11],
          [26, 13],
          [26, 20],
          [3, 23],
        ]);
        R_(26, 11, 66, 19);
        R_(66, 13, 94, 16);
        poly([
          [46, 19],
          [53, 19],
          [56, 34],
          [49, 35],
        ]);
        poly(
          [
            [32, 19],
            [36, 19],
            [37, 28],
            [32, 28],
          ],
          4,
        );
      }
      // lettering
      g.textAlign = "center";
      g.font = 'bold 76px "Courier New", Courier, monospace';
      const txt = (s, x, y, a = 0.9) => {
        for (let p = 0; p < 3; p++) {
          g.fillStyle = `rgba(238,236,224,${a * (0.35 + r() * 0.2)})`;
          g.fillText(s, x + (r() - 0.5) * 3, y + (r() - 0.5) * 3);
        }
      };
      txt(label, W / 2, 420);
      g.font = 'bold 54px "Courier New", Courier, monospace';
      txt(String(cost), W / 2 - 170, 488, 0.8);
      txt("AMMO " + ammo, W / 2 + 150, 488, 0.55);
      chalkPath(
        [
          [W / 2 - 290, 440],
          [W / 2 + 290, 436],
        ],
        3,
        false,
      );
      // chalk dust: erase speckles for texture
      g.globalCompositeOperation = "destination-out";
      for (let i = 0; i < 7000; i++) {
        g.fillStyle = `rgba(0,0,0,${r() * 0.7})`;
        g.fillRect(r() * W, r() * H, 1 + r() * 2, 1 + r() * 2);
      }
      g.globalCompositeOperation = "source-over";
    });
  }
  const chalkGeo = new THREE.PlaneGeometry(1.6, 0.8);
  for (const s of WB) {
    const f = wallFrame(s.wall, s.at, s.zone);
    const tex = chalkTex(s.label, s.cost, s.ammoCost, s.kind);
    const m = new THREE.MeshStandardMaterial({
      map: tex,
      transparent: true,
      roughness: 1,
      depthWrite: false,
      emissive: 0xffffff,
      emissiveMap: tex,
      emissiveIntensity: 0.12,
      polygonOffset: true,
      polygonOffsetFactor: -2,
    });
    const plane = new THREE.Mesh(chalkGeo, m);
    plane.position.copy(L2W(f, 0, 1.55, 0.012));
    plane.quaternion.setFromRotationMatrix(
      new THREE.Matrix4().makeBasis(f.t, up, f.n),
    );
    plane.receiveShadow = true;
    dynGroup.add(plane);
    // two iron pegs the gun hangs on
    for (const u of [-0.25, 0.25]) {
      const p = L2W(f, u - 0.1, 1.53, 0.04);
      box("metal_rusty", "walls", p.x, p.y, p.z, 0.03, 0.03, 0.03, {
        cast: false,
      });
    }
    const mount = new THREE.Object3D();
    mount.name = "wallbuy:" + s.weaponId;
    mount.position.copy(L2W(f, -0.14, 1.6, 0.075));
    mount.quaternion.copy(plane.quaternion);
    dynGroup.add(mount);
    reserve(f.face.x + f.n.x * 0.8, f.face.z + f.n.z * 0.8, 1.0);
    out.wallBuys.push({
      weaponId: s.weaponId,
      cost: s.cost,
      ammoCost: s.ammoCost,
      zone: s.zone,
      name: s.label,
      interactPos: f.face.clone().addScaledVector(f.n, 0.9),
      mount,
      chalk: plane,
    });
  }

  // ---------------------------------------------------------------------------- perk machines
  const PERKS = [
    {
      id: "ironhide",
      name: "Ironhide",
      cost: 2500,
      color: 0xd0302c,
      wall: "H2a",
      at: -21,
      zone: 1,
      glyph: "shield",
      tag: "TONIC",
    },
    {
      id: "quickhands",
      name: "Quickhands",
      cost: 3000,
      color: 0x3fcf5a,
      wall: "H2a",
      at: -11,
      zone: 1,
      glyph: "hand",
      tag: "SODA",
    },
    {
      id: "rapidfire",
      name: "Rapidfire",
      cost: 2000,
      color: 0xf0a020,
      wall: "V4",
      at: 3.8,
      zone: 2,
      glyph: "bolt",
      tag: "COLA",
    },
    {
      id: "secondwind",
      name: "Second Wind",
      cost: 1500,
      color: 0x3a82ee,
      wall: "H4",
      at: 23.5,
      zone: 2,
      glyph: "wings",
      tag: "ELIXIR",
    },
  ];
  const bottleGeo = (() => {
    const pts = [
      [0, 0],
      [0.034, 0],
      [0.037, 0.008],
      [0.037, 0.11],
      [0.03, 0.14],
      [0.013, 0.17],
      [0.013, 0.205],
      [0.016, 0.21],
      [0.016, 0.218],
      [0, 0.218],
    ].map(([x, y]) => new THREE.Vector2(x, y));
    return new THREE.LatheGeometry(pts, 10);
  })();
  const pg = mat("metal_painted_green");
  const brass = mat("brass"),
    rubber = mat("rubber_black"),
    rusty = mat("metal_rusty");
  function drawGlyph(g, kind, cx, cy, s, col) {
    g.save();
    g.translate(cx, cy);
    g.scale(s, s);
    g.fillStyle = col;
    g.strokeStyle = col;
    g.lineWidth = 0.08;
    g.beginPath();
    if (kind === "shield") {
      g.moveTo(0, -1);
      g.lineTo(0.8, -0.7);
      g.lineTo(0.7, 0.2);
      g.quadraticCurveTo(0.4, 0.8, 0, 1);
      g.quadraticCurveTo(-0.4, 0.8, -0.7, 0.2);
      g.lineTo(-0.8, -0.7);
      g.closePath();
      g.fill();
      g.fillStyle = "rgba(0,0,0,0.45)";
      g.fillRect(-0.12, -0.6, 0.24, 1.2);
      g.fillRect(-0.5, -0.2, 1.0, 0.24);
    }
    if (kind === "hand") {
      g.arc(0, 0.25, 0.5, 0, Math.PI * 2);
      g.fill();
      for (let i = 0; i < 4; i++)
        g.fillRect(
          -0.45 + i * 0.25,
          -0.95 + Math.abs(i - 1.5) * 0.12,
          0.18,
          0.9,
        );
      g.fillRect(0.4, -0.1, 0.5, 0.18);
    }
    if (kind === "bolt") {
      g.moveTo(0.2, -1);
      g.lineTo(-0.55, 0.12);
      g.lineTo(-0.05, 0.12);
      g.lineTo(-0.25, 1);
      g.lineTo(0.6, -0.2);
      g.lineTo(0.08, -0.2);
      g.closePath();
      g.fill();
    }
    if (kind === "wings") {
      g.arc(0, 0.1, 0.32, 0, Math.PI * 2);
      g.fill();
      for (const sx of [-1, 1]) {
        g.beginPath();
        g.moveTo(sx * 0.3, 0);
        g.quadraticCurveTo(sx * 1.0, -0.9, sx * 1.1, -0.2);
        g.quadraticCurveTo(sx * 0.8, -0.2, sx * 0.95, 0.15);
        g.quadraticCurveTo(sx * 0.6, 0.05, sx * 0.3, 0.3);
        g.closePath();
        g.fill();
      }
    }
    g.restore();
  }
  function perkSignTex(p) {
    const c = new THREE.Color(p.color);
    const css = (k, a = 1) =>
      `rgba(${Math.round(c.r * 255 * k)},${Math.round(c.g * 255 * k)},${Math.round(c.b * 255 * k)},${a})`;
    return canvasTex(512, 512, (g, W) => {
      // top half: semicircular marquee (CircleGeometry uv: centre at (256,256), radius 256)
      g.fillStyle = "#0b0a09";
      g.fillRect(0, 0, 512, 512);
      const grd = g.createRadialGradient(256, 256, 30, 256, 256, 256);
      grd.addColorStop(0, css(0.55));
      grd.addColorStop(0.8, css(0.3));
      grd.addColorStop(1, css(0.12));
      g.fillStyle = grd;
      g.beginPath();
      g.arc(256, 256, 250, Math.PI, 0);
      g.fill();
      g.strokeStyle = "#e8d49a";
      g.lineWidth = 8;
      g.beginPath();
      g.arc(256, 256, 238, Math.PI, 0);
      g.stroke();
      g.lineWidth = 3;
      g.beginPath();
      g.arc(256, 256, 222, Math.PI, 0);
      g.stroke();
      // sunburst rays
      g.strokeStyle = "rgba(255,240,200,0.18)";
      g.lineWidth = 6;
      for (let i = 1; i < 12; i++) {
        const a = Math.PI + (i / 12) * Math.PI;
        g.beginPath();
        g.moveTo(256 + Math.cos(a) * 120, 256 + Math.sin(a) * 120);
        g.lineTo(256 + Math.cos(a) * 210, 256 + Math.sin(a) * 210);
        g.stroke();
      }
      drawGlyph(g, p.glyph, 256, 118, 46, "#fff4d8");
      g.textAlign = "center";
      g.font = `900 ${p.name.length > 9 ? 58 : 66}px Impact, "Arial Black", sans-serif`;
      g.lineWidth = 8;
      g.strokeStyle = "rgba(0,0,0,0.7)";
      g.strokeText(p.name.toUpperCase(), 256, 236);
      g.fillStyle = "#fff6e2";
      g.fillText(p.name.toUpperCase(), 256, 236);
      // bottom half: lower plaque (mapped to v 0..0.5)
      g.fillStyle = css(0.25);
      g.fillRect(8, 264, 496, 240);
      g.strokeStyle = "#d9c38a";
      g.lineWidth = 6;
      g.strokeRect(20, 276, 472, 216);
      drawGlyph(g, p.glyph, 110, 384, 60, css(1.2));
      g.fillStyle = "#f3e6c4";
      g.textAlign = "left";
      g.font = '900 64px Impact, "Arial Black", sans-serif';
      g.fillText(p.tag, 190, 372);
      g.font = 'bold 44px "Courier New", monospace';
      g.fillText(p.cost + " PTS", 192, 440);
      g.globalCompositeOperation = "multiply";
      for (let i = 0; i < 2500; i++) {
        g.fillStyle = `rgba(${120 + Math.random() * 100},${100 + Math.random() * 80},80,${Math.random() * 0.25})`;
        g.fillRect(
          Math.random() * 512,
          Math.random() * 512,
          2 + Math.random() * 6,
          1 + Math.random() * 3,
        );
      }
      g.globalCompositeOperation = "source-over";
    });
  }
  function buildPerk(p) {
    const f = wallFrame(p.wall, p.at, p.zone);
    const W = 1.05,
      D = 0.72,
      HB = 1.95;
    const g = new THREE.Group();
    g.position.copy(f.face).addScaledVector(f.n, D / 2 + 0.04);
    g.position.y = 0;
    g.rotation.y = f.yaw;
    dynGroup.add(g);
    const col = new THREE.Color(p.color);
    const bodyMat = new THREE.MeshStandardMaterial({
      color: col.clone().multiplyScalar(0.55),
      roughness: 1,
      roughnessMap: pg.roughnessMap || null,
      normalMap: pg.normalMap || null,
      metalness: 0.25,
      envMap: pg.envMap || null,
      envMapIntensity: 0.6,
    });
    const body = [],
      trim = [],
      dark = [];
    // back body, stiles, lower panel, upper band
    body.push(G.box(W, HB - 0.12, D - 0.22, 0, 0.12 + (HB - 0.12) / 2, -0.11));
    body.push(
      G.box(
        0.14,
        HB - 0.12,
        0.22,
        -W / 2 + 0.07,
        0.12 + (HB - 0.12) / 2,
        D / 2 - 0.11,
      ),
    );
    body.push(
      G.box(
        0.14,
        HB - 0.12,
        0.22,
        W / 2 - 0.07,
        0.12 + (HB - 0.12) / 2,
        D / 2 - 0.11,
      ),
    );
    body.push(G.box(W - 0.28, 0.76, 0.22, 0, 0.12 + 0.38, D / 2 - 0.11));
    body.push(G.box(W - 0.28, 0.2, 0.22, 0, HB - 0.1, D / 2 - 0.11));
    // header half-cylinder
    {
      const hg = prep(
        new THREE.CylinderGeometry(
          W / 2,
          W / 2,
          D,
          20,
          1,
          false,
          Math.PI / 2,
          Math.PI,
        ),
      );
      xformL(hg, 0, HB, 0, Math.PI / 2, 0, 0);
      body.push(hg);
    }
    // plinth + feet
    dark.push(G.box(W + 0.05, 0.12, D + 0.04, 0, 0.06, 0));
    // brass trim: window frame, band, header rim, side stripes
    trim.push(
      G.box(0.8, 0.035, 0.04, 0, 0.885, D / 2 + 0.005),
      G.box(0.8, 0.035, 0.04, 0, 1.785, D / 2 + 0.005),
    );
    trim.push(
      G.box(0.035, 0.93, 0.04, -0.39, 1.335, D / 2 + 0.005),
      G.box(0.035, 0.93, 0.04, 0.39, 1.335, D / 2 + 0.005),
    );
    trim.push(G.tor(W / 2 + 0.005, 0.018, 0, HB, D / 2, 0, 0, 0, Math.PI));
    trim.push(G.box(W + 0.02, 0.04, 0.05, 0, HB + 0.005, D / 2 - 0.01));
    for (const sx of [-1, 1])
      trim.push(G.box(0.02, 1.6, 0.04, sx * (W / 2 + 0.005), 1.0, 0.12));
    trim.push(G.box(0.1, 0.16, 0.03, 0.3, 1.2 - 0.62, D / 2 + 0.01)); // coin plate
    trim.push(
      G.cyl(0.03, 0.03, 0.04, 10, 0, HB + 0.56, 0),
      G.cyl(0.045, 0.02, 0.05, 10, 0, HB + 0.52, 0),
    );
    // dispense tray recess + coin slot
    dark.push(
      G.box(0.52, 0.2, 0.06, -0.08, 0.34, D / 2 + 0.01),
      G.box(0.02, 0.07, 0.02, 0.3, 0.6, D / 2 + 0.03),
    );
    // interior: back wall + shelves (in the 0.22 deep recess)
    dark.push(G.box(0.76, 0.9, 0.02, 0, 1.335, D / 2 - 0.215));
    for (const y of [0.93, 1.21, 1.49])
      trim.push(G.box(0.74, 0.015, 0.16, 0, y, D / 2 - 0.12));
    // bottles
    const bottles = [];
    let vendBottle = null;
    for (const [si, y] of [0.94, 1.22, 1.5].entries())
      for (let i = 0; i < 5; i++) {
        const bg = prep(bottleGeo.clone());
        xformL(bg, -0.28 + i * 0.14, y, D / 2 - 0.12 + (i % 2) * 0.03, 0, 0, 0);
        bottles.push(bg);
        void si;
      }
    const bottleMat = new THREE.MeshStandardMaterial({
      color: col.clone().multiplyScalar(0.35),
      emissive: col,
      emissiveIntensity: 0.02,
      roughness: 0.12,
      metalness: 0.1,
    });
    const glassMat = new THREE.MeshStandardMaterial({
      color: 0x9fb4c0,
      transparent: true,
      opacity: 0.16,
      roughness: 0.04,
      metalness: 0.6,
      depthWrite: false,
      envMap: pg.envMap || null,
    });
    const signTex = perkSignTex(p);
    const signMat = new THREE.MeshStandardMaterial({
      map: signTex,
      emissiveMap: signTex,
      emissive: 0xffffff,
      emissiveIntensity: 0.03,
      roughness: 0.5,
      metalness: 0.1,
    });
    const lampMat = new THREE.MeshStandardMaterial({
      color: col,
      emissive: col,
      emissiveIntensity: 0.05,
      roughness: 0.3,
    });
    const signGeos = [];
    {
      const sg = new THREE.CircleGeometry(W / 2 - 0.01, 28, 0, Math.PI);
      xformL(sg, 0, HB, D / 2 + 0.006);
      signGeos.push(sg);
    }
    {
      const pl = new THREE.PlaneGeometry(0.62, 0.3);
      const uv = pl.attributes.uv;
      for (let i = 0; i < uv.count; i++) uv.setY(i, uv.getY(i) * 0.5);
      xformL(pl, -0.06, 0.66, D / 2 + 0.003);
      signGeos.push(pl);
    }
    const parts = [
      meshOf(body, bodyMat),
      meshOf(trim, brass),
      meshOf(dark, rubber, false),
      meshOf(bottles, bottleMat, false),
      meshOf(signGeos, signMat, false),
    ];
    const glass = new THREE.Mesh(new THREE.PlaneGeometry(0.76, 0.9), glassMat);
    glass.position.set(0, 1.335, D / 2 + 0.004);
    glass.renderOrder = 2;
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.06, 12, 8), lampMat);
    lamp.position.set(0, HB + 0.6, 0);
    parts.push(glass, lamp);
    for (const m of parts) g.add(m);
    // vend bottle
    vendBottle = new THREE.Mesh(bottleGeo, bottleMat);
    vendBottle.visible = false;
    g.add(vendBottle);
    const light = new THREE.PointLight(p.color, 0, 5.5, 2);
    light.position.set(0, 1.45, D / 2 + 0.55);
    g.add(light);
    // collider + reserve
    const col3 = footprintSolid(
      f,
      -W / 2 - 0.03,
      W / 2 + 0.03,
      0,
      D + 0.08,
      2.6,
      "metal",
    );
    void col3;
    reserve(g.position.x, g.position.z, 1.1);
    const interactPos = f.face.clone().addScaledVector(f.n, D + 0.95);
    reserve(interactPos.x, interactPos.z, 0.8);
    let powered = false,
      level = 0,
      target = 0,
      flickT = 0;
    const perk = {
      id: p.id,
      name: p.name,
      cost: p.cost,
      color: p.color,
      zone: p.zone,
      interactPos,
      get powered() {
        return powered;
      },
      setPowered(on, instant = false) {
        on = !!on;
        if (on === powered && !instant) return false;
        powered = on;
        target = on ? 1 : 0;
        flickT = on && !instant ? 0.9 : 0;
        if (instant) level = target;
        return true;
      },
      vend() {
        vendBottle.visible = true;
        vendBottle.position.set(-0.08, 1.5, D / 2 - 0.1);
        vendBottle.rotation.set(0, 0, 0);
        return tweenP(
          0.55,
          (k) => {
            const e = k * k;
            vendBottle.position.set(
              -0.08,
              lerp(1.5, 0.3, e),
              D / 2 - 0.1 + k * 0.1,
            );
            vendBottle.rotation.z = k * 1.57;
          },
          {
            done: () =>
              tween(
                0.4,
                (k) => {
                  vendBottle.position.y =
                    0.3 + Math.sin(k * Math.PI) * 0.05 * (1 - k);
                },
                {
                  done: () =>
                    tween(0.2, () => {}, {
                      delay: 1.2,
                      done: () => (vendBottle.visible = false),
                    }),
                },
              ),
          },
        );
      },
      group: g,
    };
    updaters.push((dt, time) => {
      if (flickT > 0) {
        flickT -= dt;
        level = Math.random() < 0.55 ? 1 : 0.1;
        if (flickT <= 0) level = target;
      } else level += (target - level) * Math.min(1, dt * 6);
      const hum =
        0.93 + 0.07 * Math.sin(time * 17 + p.at) * Math.sin(time * 3.1);
      const L = level * hum;
      bottleMat.emissiveIntensity = 0.03 + L * 2.2;
      signMat.emissiveIntensity = 0.03 + L * 1.35;
      lampMat.emissiveIntensity =
        0.05 + L * (3 + 2 * (Math.sin(time * 4 + p.at) > 0 ? 1 : 0.3));
      light.intensity = L * 5.5;
    });
    powerables.push({
      x: g.position.x,
      z: g.position.z,
      set: (on, delay, instant) => {
        if (instant) {
          perk.setPowered(on, true);
          return;
        }
        tween(0.001, () => {}, { delay, done: () => perk.setPowered(on) });
      },
    });
    out.perks.push(perk);
  }
  PERKS.forEach(buildPerk);

  // ---------------------------------------------------------------------------- mystery box
  const BOX_LOCS = [
    { wall: "H3b", at: 0, zone: 0 },
    { wall: "H5", at: 22.8, zone: 2 },
    { wall: "V2a", at: -10.4, zone: 3 },
  ].map((s) => {
    const f = wallFrame(s.wall, s.at, s.zone);
    const pos = f.face.clone().addScaledVector(f.n, 0.42);
    pos.y = 0;
    const a = L2W(f, -0.9, 0, 0.02),
      b = L2W(f, 0.9, 1, 0.8);
    const col = new THREE.Box3(
      new THREE.Vector3(Math.min(a.x, b.x), 0, Math.min(a.z, b.z)),
      new THREE.Vector3(Math.max(a.x, b.x), 0.75, Math.max(a.z, b.z)),
    );
    out.navStatic.push(col);
    reserve(pos.x, pos.z, 1.3);
    return {
      ...s,
      f,
      pos,
      yaw: f.yaw,
      col,
      interactPos: f.face.clone().addScaledVector(f.n, 1.55),
    };
  });
  const skullTex = canvasTex(256, 256, (g) => {
    g.clearRect(0, 0, 256, 256);
    g.translate(128, 124);
    g.shadowColor = "rgba(140,230,255,1)";
    g.shadowBlur = 18;
    g.fillStyle = "#e8fbff";
    g.beginPath();
    g.arc(0, -18, 62, Math.PI * 0.92, Math.PI * 2.08);
    g.lineTo(44, 34);
    g.lineTo(-44, 34);
    g.closePath();
    g.fill();
    g.fillRect(-34, 30, 68, 30);
    g.globalCompositeOperation = "destination-out";
    g.shadowBlur = 0;
    g.beginPath();
    g.ellipse(-24, -8, 17, 20, 0.15, 0, Math.PI * 2);
    g.fill();
    g.beginPath();
    g.ellipse(24, -8, 17, 20, -0.15, 0, Math.PI * 2);
    g.fill();
    g.beginPath();
    g.moveTo(0, 12);
    g.lineTo(-8, 28);
    g.lineTo(8, 28);
    g.closePath();
    g.fill();
    for (let i = -3; i <= 3; i++) g.fillRect(i * 9.5 - 1.5, 38, 3, 22);
    g.globalCompositeOperation = "source-over";
    // stencil bridges (reads as a spray stencil)
    g.fillStyle = "rgba(0,0,0,0)";
    // crossed bones
    g.shadowBlur = 14;
    g.strokeStyle = "#e8fbff";
    g.lineWidth = 12;
    g.lineCap = "round";
    g.beginPath();
    g.moveTo(-90, 70);
    g.lineTo(90, 100);
    g.moveTo(90, 70);
    g.lineTo(-90, 100);
    g.stroke();
  });
  const glyphMat = new THREE.MeshBasicMaterial({
    map: skullTex,
    color: new THREE.Color(0.55, 0.95, 1.2),
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -2,
  });
  const boxG = new THREE.Group();
  dynGroup.add(boxG);
  const boxBody = new THREE.Group();
  boxG.add(boxBody);
  {
    const wood = [],
      metal = [],
      dark = [];
    const BL = 1.7,
      BH = 0.6,
      BD = 0.72;
    wood.push(
      G.box(BL, BH - 0.04, BD, 0, 0.02 + (BH - 0.04) / 2, 0, 0, 0, 0, 0.5),
    );
    for (const y of [0.12, 0.3, 0.48])
      for (const s of [-1, 1])
        wood.push(
          G.box(
            BL - 0.1,
            0.13,
            0.03,
            0,
            y,
            s * (BD / 2 + 0.012),
            0,
            0,
            (Math.random() - 0.5) * 0.02,
            0.5,
          ),
        );
    for (const x of [-BL / 2 + 0.04, BL / 2 - 0.04])
      for (const s of [-1, 1])
        metal.push(G.box(0.1, BH, 0.05, x, BH / 2, s * (BD / 2 + 0.018)));
    for (const x of [-BL / 2, BL / 2])
      metal.push(G.box(0.05, BH, BD + 0.02, x, BH / 2, 0));
    for (const s of [-1, 1])
      metal.push(
        G.tor(
          0.08,
          0.012,
          s * (BL / 2 + 0.03),
          0.4,
          0,
          0,
          Math.PI / 2,
          0,
          Math.PI,
        ),
      );
    dark.push(G.box(BL - 0.1, 0.02, BD - 0.1, 0, BH - 0.06, 0));
    const w = meshOf(wood, mat("crate_wood")),
      me = meshOf(metal, rusty),
      dk = meshOf(dark, rubber, false);
    boxBody.add(w, me, dk);
    const gf = new THREE.Mesh(new THREE.PlaneGeometry(0.44, 0.44), glyphMat);
    gf.position.set(0, 0.3, BD / 2 + 0.03);
    boxBody.add(gf);
  }
  const lid = new THREE.Group();
  lid.position.set(0, 0.6, -0.36);
  boxBody.add(lid);
  {
    const lw = G.box(1.74, 0.09, 0.76, 0, 0.045, 0.38, 0, 0, 0, 0.5);
    const lm = [
      G.box(1.76, 0.1, 0.06, 0, 0.045, 0.02),
      G.box(1.76, 0.1, 0.06, 0, 0.045, 0.74),
      G.box(0.06, 0.1, 0.76, -0.84, 0.045, 0.38),
      G.box(0.06, 0.1, 0.76, 0.84, 0.045, 0.38),
    ];
    lid.add(meshOf([lw], mat("crate_wood")), meshOf(lm, rusty));
    const gl = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.5), glyphMat);
    gl.rotation.x = -Math.PI / 2;
    gl.position.set(0, 0.093, 0.38);
    lid.add(gl);
  }
  const innerGlowMat = new THREE.MeshBasicMaterial({
    color: 0xc8f4ff,
    transparent: true,
    opacity: 0,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const innerGlow = new THREE.Mesh(
    new THREE.PlaneGeometry(1.5, 0.55),
    innerGlowMat,
  );
  innerGlow.rotation.x = -Math.PI / 2;
  innerGlow.position.y = 0.52;
  boxBody.add(innerGlow);
  const openGlow = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: canvasTex(128, 256, (c) => {
        const gr = c.createLinearGradient(0, 256, 0, 0);
        gr.addColorStop(0, "rgba(190,240,255,0.9)");
        gr.addColorStop(1, "rgba(120,200,255,0)");
        c.fillStyle = gr;
        c.fillRect(0, 0, 128, 256);
        const g2 = c.createLinearGradient(0, 0, 128, 0);
        g2.addColorStop(0, "rgba(0,0,0,1)");
        g2.addColorStop(0.3, "rgba(0,0,0,0)");
        g2.addColorStop(0.7, "rgba(0,0,0,0)");
        g2.addColorStop(1, "rgba(0,0,0,1)");
        c.globalCompositeOperation = "destination-out";
        c.fillStyle = g2;
        c.fillRect(0, 0, 128, 256);
      }),
      blending: THREE.AdditiveBlending,
      transparent: true,
      opacity: 0,
      depthWrite: false,
    }),
  );
  openGlow.center.set(0.5, 0);
  openGlow.scale.set(1.5, 1.1, 1);
  openGlow.position.set(0, 0.5, 0);
  boxBody.add(openGlow);
  const anchor = new THREE.Object3D();
  anchor.name = "mysteryBoxAnchor";
  anchor.position.set(0, 0.98, 0);
  boxBody.add(anchor);
  const beamMat = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uAlpha: { value: 1 },
      uColor: { value: new THREE.Color(0.55, 0.85, 1.0) },
    },
    vertexShader: `varying vec2 vUv; varying vec3 vN; varying vec3 vV; void main(){ vUv=uv; vec4 mv=modelViewMatrix*vec4(position,1.0); vN=normalize(normalMatrix*normal); vV=normalize(-mv.xyz); gl_Position=projectionMatrix*mv; }`,
    fragmentShader: `uniform float uTime; uniform float uAlpha; uniform vec3 uColor; varying vec2 vUv; varying vec3 vN; varying vec3 vV;
      void main(){ float f = abs(dot(vN, vV)); float core = pow(f, 1.6);
        float h = vUv.y; float fall = pow(1.0 - h, 3.0) * 0.85 + 0.15 * (1.0 - h);
        float streak = 0.7 + 0.3 * sin(vUv.x * 62.83 + sin(h * 30.0 - uTime * 2.0) * 1.5);
        float pulse = 0.85 + 0.15 * sin(h * 80.0 - uTime * 7.0);
        float a = (pow(core, 2.2) * 0.85 + 0.12) * fall * streak * pulse * uAlpha * 0.9;
        gl_FragColor = vec4(uColor * a, a); }`,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    fog: false,
  });
  const beam = new THREE.Mesh(
    new THREE.CylinderGeometry(0.42, 0.62, 30, 28, 1, true),
    beamMat,
  );
  beam.position.y = 15;
  beam.renderOrder = 3;
  boxG.add(beam);
  const boxLight = new THREE.PointLight(0x8fd6ff, 3.2, 6.5, 2);
  boxLight.position.set(0, 1.3, 0.2);
  boxG.add(boxLight);
  let boxCur = 0,
    boxCol = null,
    boxOpen = false,
    boxProxy = null;
  function placeBox(i) {
    boxCur = i;
    const L = BOX_LOCS[i];
    boxG.position.copy(L.pos);
    boxG.rotation.y = L.yaw;
    if (boxCol) {
      const j = colliders.indexOf(boxCol);
      if (j >= 0) colliders.splice(j, 1);
      if (boxCol.proxy) {
        const k = raycastTargets.indexOf(boxCol.proxy);
        if (k >= 0) raycastTargets.splice(k, 1);
      }
    }
    boxCol = L.col.clone();
    colliders.push(boxCol);
    boxCol.proxy = null;
    if (!boxProxy) {
      boxProxy = new THREE.Mesh(
        new THREE.BoxGeometry(1, 1, 1),
        new THREE.MeshBasicMaterial(),
      );
      boxProxy.visible = true;
      boxProxy.userData.surface = "wood";
      boxProxy.name = "ray:mysteryBox";
      ctx.rayGroup.add(boxProxy);
      raycastTargets.push(boxProxy);
    }
    boxCol.getCenter(boxProxy.position);
    boxCol.getSize(boxProxy.scale);
    boxProxy.updateMatrixWorld(true);
    mysteryBox.interactPos.copy(L.interactPos);
    mysteryBox.current = i;
    mysteryBox.zone = L.zone;
  }
  let lidTw = null,
    moving = null,
    moveGen = 0;
  const boxTws = [];
  // box tweens resolve on completion OR when a snap cancels the move (so awaiting callers never hang)
  const btw = (dur, fn) =>
    new Promise((res) => {
      const t = tween(dur, fn, { done: res });
      t.res = res;
      boxTws.push(t);
    });
  function killMove() {
    moveGen++;
    for (const t of boxTws.splice(0)) {
      t.alive = false;
      t.res && t.res();
    }
    if (moving) {
      const m = moving;
      moving = null;
      m.resolve(boxCur);
    }
  }
  function snapLid(open) {
    if (lidTw) lidTw.alive = false;
    boxOpen = open;
    lid.rotation.x = open ? -1.95 : 0;
    innerGlowMat.opacity = open ? 1 : 0;
    openGlow.material.opacity = open ? 0.8 : 0;
    boxLight.intensity = open ? 8.2 : 3.2;
  }
  function snapTo(i) {
    killMove();
    boxBody.visible = true;
    boxBody.position.set(0, 0, 0);
    boxBody.rotation.y = 0;
    boxBody.scale.setScalar(1);
    beam.visible = true;
    beamMat.uniforms.uAlpha.value = 1;
    if (i !== boxCur) placeBox(i);
    snapLid(false);
  }
  const mysteryBox = {
    cost: 950,
    interactPos: new THREE.Vector3(),
    anchor,
    locations: BOX_LOCS.length,
    current: 0,
    zone: 0,
    locationInfo: BOX_LOCS.map((l) => ({
      zone: l.zone,
      pos: l.pos.clone(),
      interactPos: l.interactPos.clone(),
    })),
    get isOpen() {
      return boxOpen;
    },
    get isMoving() {
      return !!moving;
    },
    get target() {
      return moving ? moving.target : boxCur;
    },
    // open/close are idempotent (no re-animation when already in that state); ignored while relocating
    open(animate = true) {
      if (moving) return Promise.resolve(false);
      if (boxOpen) return Promise.resolve(true);
      if (!animate) {
        snapLid(true);
        return Promise.resolve(true);
      }
      boxOpen = true;
      if (lidTw) lidTw.alive = false;
      const r0 = lid.rotation.x;
      lidTw = tween(0.5, (k) => {
        lid.rotation.x = lerp(r0, -1.95, easeOut(k));
        innerGlowMat.opacity = k;
        openGlow.material.opacity = k * 0.8;
        boxLight.intensity = 3.2 + k * 5;
      });
      return tweenP(0.5, () => {}).then(() => true);
    },
    close(animate = true) {
      if (!boxOpen) return Promise.resolve(true);
      if (!animate) {
        snapLid(false);
        return Promise.resolve(true);
      }
      boxOpen = false;
      if (lidTw) lidTw.alive = false;
      const r0 = lid.rotation.x;
      lidTw = tween(0.35, (k) => {
        lid.rotation.x = lerp(r0, 0, easeIn(k));
        innerGlowMat.opacity = 1 - k;
        openGlow.material.opacity = (1 - k) * 0.8;
        boxLight.intensity = 8.2 - k * 5;
      });
      return tweenP(0.35, () => {}).then(() => true);
    },
    // Rises on its beam, vanishes, and lands at another location. Resolves with the new index when landed.
    // Idempotent: while moving, returns the same promise (a different toIndex retargets the landing);
    // relocate(current) when idle is a no-op. relocate(i, false) snaps instantly (late join).
    relocate(toIndex, animate = true) {
      if (toIndex !== undefined && (toIndex < 0 || toIndex >= BOX_LOCS.length))
        toIndex = undefined;
      if (!animate) {
        snapTo(toIndex ?? boxCur);
        return Promise.resolve(boxCur);
      }
      if (moving) {
        if (toIndex !== undefined && !moving.placed) moving.target = toIndex;
        return moving.promise;
      }
      if (toIndex === boxCur) return Promise.resolve(boxCur);
      let next = toIndex;
      if (next === undefined) {
        const opts = BOX_LOCS.map((_, i) => i).filter((i) => i !== boxCur);
        next = opts[Math.floor(Math.random() * opts.length)];
      }
      const gen = ++moveGen;
      let resolve;
      const promise = new Promise((r) => (resolve = r));
      moving = { target: next, promise, resolve, placed: false };
      (async () => {
        const live = () => gen === moveGen;
        if (boxOpen) {
          await this.close();
          if (!live()) return;
        }
        await btw(2.4, (k) => {
          const e = easeIn(k);
          boxBody.position.set(
            Math.sin(k * 40) * 0.03 * k,
            e * 6.5,
            Math.cos(k * 33) * 0.03 * k,
          );
          boxBody.rotation.y = e * 2.5;
          const s = k > 0.75 ? 1 - (k - 0.75) / 0.25 : 1;
          boxBody.scale.setScalar(Math.max(0.001, s));
          boxLight.intensity = 3.2 + k * 4;
        });
        if (!live()) return;
        boxBody.visible = false;
        puff(boxG.position.clone().setY(0.3), 10, 1);
        await btw(0.6, (k) => {
          beamMat.uniforms.uAlpha.value = 1 - k;
          boxLight.intensity = 7.2 * (1 - k);
        });
        if (!live()) return;
        beam.visible = false;
        await btw(0.9, () => {});
        if (!live()) return;
        moving.placed = true;
        placeBox(moving.target);
        beam.visible = true;
        await btw(0.5, (k) => {
          beamMat.uniforms.uAlpha.value = k;
          boxLight.intensity = k * 3.2;
        });
        if (!live()) return;
        boxBody.visible = true;
        await btw(1.3, (k) => {
          const e = easeOut(k);
          boxBody.position.set(0, (1 - e) * 5, 0);
          boxBody.rotation.y = (1 - e) * -2;
          boxBody.scale.setScalar(Math.max(0.001, Math.min(1, k * 3)));
        });
        if (!live()) return;
        boxBody.position.set(0, 0, 0);
        boxBody.rotation.y = 0;
        boxBody.scale.setScalar(1);
        puff(boxG.position.clone().setY(0.1), 14, 1.4);
        boxTws.length = 0;
        const m = moving;
        moving = null;
        m.resolve(boxCur);
      })();
      return promise;
    },
    _snapTo: snapTo,
    group: boxG,
  };
  placeBox(0);
  updaters.push((dt, time) => {
    beamMat.uniforms.uTime.value = time;
    if (boxOpen) boxLight.intensity = 8 + Math.sin(time * 9) * 0.8;
    glyphMat.opacity = 0.75 + 0.25 * Math.sin(time * 2.1);
  });
  out.mysteryBox = mysteryBox;

  // ---------------------------------------------------------------------------- power switch
  {
    const f = wallFrame("H1", -11.5, 3);
    const g = new THREE.Group();
    g.position.copy(f.face);
    g.position.y = 0;
    g.rotation.y = f.yaw;
    dynGroup.add(g);
    const panel = [],
      metal = [],
      dark = [],
      cu = [];
    panel.push(G.box(0.95, 1.35, 0.14, 0, 1.55, 0.07));
    panel.push(G.box(0.55, 0.5, 0.2, 0.62, 1.2, 0.1)); // side junction box
    metal.push(
      G.box(1.0, 0.05, 0.16, 0, 2.24, 0.08),
      G.box(1.0, 0.05, 0.16, 0, 0.86, 0.08),
    );
    for (const x of [-0.42, 0.42])
      for (const y of [0.95, 2.15]) metal.push(G.sph(0.018, x, y, 0.145, 6, 4));
    // conduits up to the ceiling and over to the generator
    metal.push(
      G.cyl(0.045, 0.045, 1.4, 10, -0.3, 2.95, 0.07),
      G.cyl(0.035, 0.035, 1.4, 10, 0.3, 2.95, 0.07),
    );
    metal.push(
      G.cyl(0.035, 0.035, 2.0, 10, 0.62, 0.45, 0.1),
      G.box(0.12, 0.08, 0.12, -0.3, 2.28, 0.07),
    );
    // knife switch: insulator block, jaws
    dark.push(
      G.box(0.36, 0.22, 0.08, 0.02, 1.32, 0.18),
      G.box(0.36, 0.16, 0.08, 0.02, 1.87, 0.18),
    );
    cu.push(
      G.box(0.03, 0.12, 0.06, -0.08, 1.87, 0.25),
      G.box(0.03, 0.12, 0.06, 0.12, 1.87, 0.25),
    );
    cu.push(
      G.box(0.03, 0.12, 0.06, -0.08, 1.3, 0.25),
      G.box(0.03, 0.12, 0.06, 0.12, 1.3, 0.25),
    );
    g.add(
      meshOf(panel, pg),
      meshOf(metal, rusty),
      meshOf(dark, rubber),
      meshOf(cu, brass),
    );
    // warning plate
    const plateTex = canvasTex(512, 256, (c) => {
      c.fillStyle = "#d8c79a";
      c.fillRect(0, 0, 512, 256);
      c.fillStyle = "#1a1612";
      c.fillRect(10, 10, 492, 236);
      c.fillStyle = "#d8c79a";
      c.fillRect(18, 18, 476, 220);
      for (let i = -2; i < 12; i++) {
        c.fillStyle = i % 2 ? "#141210" : "#d9a520";
        c.beginPath();
        c.moveTo(i * 44, 256);
        c.lineTo(i * 44 + 44, 256);
        c.lineTo(i * 44 + 88, 196);
        c.lineTo(i * 44 + 44, 196);
        c.fill();
      }
      c.fillStyle = "#141210";
      c.font = '900 64px Impact, "Arial Black", sans-serif';
      c.textAlign = "center";
      c.fillText("HAUPTSCHALTER", 256, 92);
      c.font = 'bold 36px "Courier New", monospace';
      c.fillText("STROM  —  AN / AUS", 256, 150);
      c.globalCompositeOperation = "multiply";
      for (let i = 0; i < 1800; i++) {
        c.fillStyle = `rgba(90,60,30,${Math.random() * 0.3})`;
        c.fillRect(
          Math.random() * 512,
          Math.random() * 256,
          2 + Math.random() * 8,
          1 + Math.random() * 3,
        );
      }
    });
    const plate = new THREE.Mesh(
      new THREE.PlaneGeometry(0.62, 0.31),
      new THREE.MeshStandardMaterial({ map: plateTex, roughness: 0.7 }),
    );
    plate.position.set(0, 2.36, 0.012);
    g.add(plate);
    // lever
    const lever = new THREE.Group();
    lever.position.set(0.02, 1.35, 0.26);
    g.add(lever);
    const leverGeos = [
      G.box(0.03, 0.62, 0.03, -0.1, 0.31, 0),
      G.box(0.03, 0.62, 0.03, 0.14, 0.31, 0),
      G.box(0.3, 0.03, 0.03, 0.02, 0.62, 0),
    ];
    lever.add(meshOf(leverGeos, brass));
    const handle = new THREE.Mesh(
      G.cyl(0.035, 0.035, 0.36, 12, 0.02, 0.66, 0, 0, 0, Math.PI / 2),
      rubber,
    );
    handle.castShadow = true;
    lever.add(handle);
    // lever rests pointing down (off) and is thrown up to engage the upper jaws
    lever.rotation.x = Math.PI - 0.05;
    const lampOff = new THREE.MeshStandardMaterial({
      color: 0x551010,
      emissive: 0xff2010,
      emissiveIntensity: 1.6,
    });
    const lampOn = new THREE.MeshStandardMaterial({
      color: 0x104010,
      emissive: 0x30ff40,
      emissiveIntensity: 0.0,
    });
    const l1 = new THREE.Mesh(new THREE.SphereGeometry(0.035, 10, 8), lampOff);
    l1.position.set(-0.32, 2.05, 0.16);
    g.add(l1);
    const l2 = new THREE.Mesh(new THREE.SphereGeometry(0.035, 10, 8), lampOn);
    l2.position.set(-0.32, 1.92, 0.16);
    g.add(l2);
    const sparkAnchor = new THREE.Object3D();
    sparkAnchor.position.set(0.02, 1.87, 0.3);
    g.add(sparkAnchor);
    const lamp = { intensity: 0, color: new THREE.Color() }; // emissive-only (keeps the point-light count down)
    footprintSolid(f, -0.55, 0.95, 0, 0.32, 2.4, "metal");
    const interactPos = f.face.clone().addScaledVector(f.n, 1.0);
    reserve(g.position.x + f.n.x * 0.6, g.position.z + f.n.z * 0.6, 1.1);
    const sw = {
      interactPos,
      isOn: false,
      sparkAnchor,
      group: g,
      throwSwitch() {
        if (this.isOn) return false;
        this.isOn = true;
        tween(
          0.5,
          (k) => {
            lever.rotation.x = lerp(Math.PI - 0.05, 0.05, easeIn(k));
          },
          {
            done: () => {
              const p = new THREE.Vector3();
              sparkAnchor.getWorldPosition(p);
              sparks(p, 60, 1.3);
              this._setOnVisual(true);
              if (out._level) out._level.setPower(true);
            },
          },
        );
        return true;
      },
      _setOnVisual(on) {
        this.isOn = on;
        lever.rotation.x = on ? 0.05 : Math.PI - 0.05;
        lampOff.emissiveIntensity = on ? 0.05 : 1.6;
        lampOn.emissiveIntensity = on ? 2.2 : 0;
        lamp.color.set(on ? 0x40ff50 : 0xff3020);
      },
    };
    updaters.push((dt, time) => {
      if (!sw.isOn) {
        const b = Math.sin(time * 3) > 0 ? 1 : 0.15;
        lampOff.emissiveIntensity = 1.8 * b;
        lamp.intensity = 0.7 * b;
      } else lamp.intensity = 0.5;
    });
    out.powerSwitch = sw;
  }

  // ---------------------------------------------------------------------------- aether anvil
  {
    const pos = new THREE.Vector3(-20.6, 0, -9.7),
      n = new THREE.Vector3(1, 0, 0);
    const g = new THREE.Group();
    g.position.copy(pos);
    g.rotation.y = Math.atan2(n.x, n.z);
    dynGroup.add(g);
    const conc = [],
      steel = [],
      br = [],
      dk = [],
      dark2 = [];
    conc.push(G.box(1.9, 0.28, 1.3, 0, 0.14, -0.05, 0, 0, 0, 0.5));
    steel.push(G.box(1.7, 0.05, 1.1, 0, 0.305, -0.05));
    // pedestal + anvil
    steel.push(
      G.box(0.5, 0.5, 0.42, 0, 0.58, 0),
      G.box(0.62, 0.08, 0.5, 0, 0.36, 0),
    );
    const anvilTop = [
      G.box(0.82, 0.2, 0.32, 0, 0.94, 0),
      G.box(0.16, 0.14, 0.3, -0.48, 0.97, 0),
    ];
    {
      const h = prep(new THREE.ConeGeometry(0.13, 0.46, 14));
      xformL(h, 0.63, 0.95, 0, 0, 0, -Math.PI / 2);
      anvilTop.push(h);
    }
    // press frame
    for (const x of [-0.8, 0.8]) {
      steel.push(G.box(0.2, 2.5, 0.26, x, 1.55, -0.05));
      for (const y of [0.6, 1.4, 2.2])
        br.push(G.box(0.22, 0.04, 0.28, x, y, -0.05));
    }
    steel.push(G.box(1.86, 0.36, 0.4, 0, 2.88, -0.05));
    for (const x of [-0.6, -0.2, 0.2, 0.6])
      br.push(G.sph(0.025, x, 2.88, 0.16, 6, 4));
    dk.push(G.cyl(0.13, 0.13, 0.5, 16, 0, 2.47, -0.02));
    // core housing behind the anvil
    br.push(
      G.cyl(0.24, 0.26, 0.12, 18, 0, 1.28, -0.5),
      G.cyl(0.26, 0.24, 0.12, 18, 0, 2.42, -0.5),
    );
    for (const y of [1.6, 1.85, 2.1])
      br.push(G.tor(0.225, 0.014, 0, y, -0.5, Math.PI / 2, 0, 0));
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      steel.push(
        G.cyl(
          0.012,
          0.012,
          1.06,
          5,
          Math.cos(a) * 0.23,
          1.85,
          -0.5 + Math.sin(a) * 0.23,
        ),
      );
    }
    // cables
    for (const s of [-1, 1]) {
      const curve = new THREE.CatmullRomCurve3([
        new THREE.Vector3(0.18 * s, 2.45, -0.5),
        new THREE.Vector3(0.45 * s, 2.7, -0.55),
        new THREE.Vector3(0.7 * s, 2.3, -0.2),
      ]);
      dark2.push(prep(new THREE.TubeGeometry(curve, 12, 0.03, 6)));
      const c2 = new THREE.CatmullRomCurve3([
        new THREE.Vector3(0.2 * s, 1.25, -0.5),
        new THREE.Vector3(0.5 * s, 0.5, -0.6),
        new THREE.Vector3(0.9 * s, 0.32, -0.4),
      ]);
      dark2.push(prep(new THREE.TubeGeometry(c2, 12, 0.035, 6)));
    }
    g.add(
      meshOf(conc, mat("concrete_wall")),
      meshOf(steel, rusty),
      meshOf(br, brass),
      meshOf(dk, pg),
      meshOf(dark2, rubber),
      meshOf(anvilTop, mat("gun_metal")),
    );
    // glass tube + glowing core
    const glass = new THREE.Mesh(
      new THREE.CylinderGeometry(0.2, 0.2, 1.02, 20, 1, true),
      new THREE.MeshStandardMaterial({
        color: 0xaabbd0,
        transparent: true,
        opacity: 0.18,
        roughness: 0.05,
        metalness: 0.5,
        depthWrite: false,
        side: THREE.DoubleSide,
      }),
    );
    glass.position.set(0, 1.85, -0.5);
    glass.renderOrder = 2;
    g.add(glass);
    const coreMat = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uPower: { value: 0.15 } },
      vertexShader: `varying vec3 vN; varying vec3 vP; void main(){ vN=normalize(normalMatrix*normal); vP=position; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
      fragmentShader: `uniform float uTime; uniform float uPower; varying vec3 vN; varying vec3 vP;
        void main(){ float f = pow(1.0 - abs(vN.z), 1.5);
          float s = sin(vP.y*26.0 + uTime*3.0 + sin(vP.x*18.0 + uTime*2.3)*2.2)*0.5+0.5;
          float s2 = sin(atan(vP.z, vP.x)*3.0 - uTime*4.0 + vP.y*10.0)*0.5+0.5;
          vec3 col = mix(vec3(0.62,0.22,1.0), vec3(0.2,0.95,1.0), s*0.7 + s2*0.3);
          gl_FragColor = vec4(col * (0.25 + 2.4*uPower) * (0.55 + 0.9*f + 0.4*s2), 1.0); }`,
    });
    const core = new THREE.Mesh(
      new THREE.IcosahedronGeometry(0.12, 2),
      coreMat,
    );
    core.position.set(0, 1.85, -0.5);
    g.add(core);
    const haloMat = new THREE.SpriteMaterial({
      map: canvasTex(128, 128, (c) => {
        const gr = c.createRadialGradient(64, 64, 0, 64, 64, 64);
        gr.addColorStop(0, "rgba(200,160,255,1)");
        gr.addColorStop(0.35, "rgba(120,90,255,0.45)");
        gr.addColorStop(1, "rgba(40,200,255,0)");
        c.fillStyle = gr;
        c.fillRect(0, 0, 128, 128);
      }),
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      transparent: true,
      opacity: 0.25,
    });
    const halo = new THREE.Sprite(haloMat);
    halo.scale.setScalar(0.9);
    halo.position.copy(core.position);
    g.add(halo);
    // hammer
    const hammer = new THREE.Group();
    hammer.position.set(0, 0, 0);
    g.add(hammer);
    const hGeos = [
      G.cyl(0.05, 0.05, 0.6, 12, 0, 2.05, -0.02),
      G.box(0.42, 0.26, 0.34, 0, 1.68, -0.02),
    ];
    hammer.add(meshOf(hGeos, mat("gun_metal")));
    const coreLight = new THREE.PointLight(0x9a6bff, 0.6, 6, 2);
    coreLight.position.set(0, 1.9, -0.1);
    g.add(coreLight);
    const anchorA = new THREE.Object3D();
    anchorA.name = "anvilAnchor";
    anchorA.position.set(0, 1.16, 0);
    g.add(anchorA);
    solid(
      pos.x - 0.68,
      0,
      pos.z - 0.98,
      pos.x + 0.62,
      3.1,
      pos.z + 0.98,
      "metal",
    );
    const interactPos = pos.clone().addScaledVector(n, 1.55);
    reserve(pos.x, pos.z, 1.5);
    reserve(interactPos.x, interactPos.z, 0.9);
    let power = 0,
      ptarget = 0,
      flare = 0,
      forging = false,
      forgeN = 0,
      forgeGen = 0,
      forgePromise = Promise.resolve();
    const anvil = {
      interactPos,
      cost: 5000,
      anchor: anchorA,
      group: g,
      get powered() {
        return ptarget > 0;
      },
      get busy() {
        return forging;
      },
      setPowered(on) {
        ptarget = on ? 1 : 0;
      },
      get forgeCount() {
        return forgeN;
      },
      // idempotent: while forging returns the running promise. forgeCount lets clients mirror the host.
      forge(seconds = 3) {
        if (forging) return forgePromise;
        forging = true;
        forgeN++;
        const gen = ++forgeGen;
        forgePromise = (async () => {
          const strikes = Math.max(1, Math.round(seconds / 0.7));
          for (let i = 0; i < strikes && gen === forgeGen; i++) {
            await tweenP(0.14, (k) => {
              if (gen === forgeGen) hammer.position.y = -0.36 * easeIn(k);
            });
            if (gen !== forgeGen) break;
            const p = new THREE.Vector3();
            anchorA.getWorldPosition(p);
            sparks(p, 40, 1.1);
            flare = 1;
            await tweenP(0.5, (k) => {
              if (gen === forgeGen)
                hammer.position.y = -0.36 * (1 - easeInOut(k));
            });
          }
          if (gen === forgeGen) {
            hammer.position.y = 0;
            forging = false;
          }
        })();
        return forgePromise;
      },
      _stop() {
        forgeGen++;
        forging = false;
        hammer.position.y = 0;
      },
      _setCount(n) {
        forgeN = n;
      },
    };
    updaters.push((dt, time) => {
      power += (ptarget - power) * Math.min(1, dt * 1.5);
      flare = Math.max(0, flare - dt * 2.5);
      const p = 0.12 + power * 0.88;
      coreMat.uniforms.uTime.value = time;
      coreMat.uniforms.uPower.value =
        p * (0.85 + 0.15 * Math.sin(time * 5)) + flare;
      core.rotation.y += dt * (0.3 + power * 1.5);
      core.rotation.x += dt * 0.4;
      core.position.y = 1.85 + Math.sin(time * 1.7) * 0.04 * power;
      halo.material.opacity = 0.12 + p * 0.5 + flare * 0.5;
      coreLight.intensity = 0.5 + p * 4.5 + flare * 6;
      coreLight.color.setHSL(
        0.72 - 0.2 * (0.5 + 0.5 * Math.sin(time * 1.3)),
        0.9,
        0.62,
      );
    });
    powerables.push({
      x: pos.x,
      z: pos.z,
      set: (on, delay, instant) => {
        if (instant) {
          anvil.setPowered(on);
          power = on ? 1 : 0;
        } else
          tween(0.001, () => {}, { delay, done: () => anvil.setPowered(on) });
      },
    });
    out.anvil = anvil;
  }

  out.bind = (level) => {
    out._level = level;
  };
  out.reset = () => {
    snapTo(0);
    out.powerSwitch._setOnVisual(false);
  };
  return out;
}

// =============================================================================================
// DRESSING: architecture detail, props per zone, exterior (sandbags, wire, trees)
// =============================================================================================
