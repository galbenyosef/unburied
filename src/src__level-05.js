// src__level 05 — math
// Lines 4319-5765 of readable/src__level.pretty.js (statement-aligned).
function buildDressing(ctx) {
  const {
    root,
    mat,
    box,
    boxB,
    cyl,
    anyGeo,
    emit,
    xform,
    solid,
    solidC,
    reserve,
    isFree,
    rng,
    R,
    pick,
    sandbagGeo,
    updaters,
    canvasTex,
    HOLES,
    ZDEF,
    windows,
    doors,
  } = ctx;

  // ---------- shared canvas materials ----------
  const atlas = canvasTex(1024, 1024, (g) => {
    // cell 0: topographic field map (0..512, 0..512)
    const paper = (x0, y0, w, h, base) => {
      g.fillStyle = base;
      g.fillRect(x0, y0, w, h);
      for (let i = 0; i < 900; i++) {
        g.fillStyle = `rgba(90,70,40,${Math.random() * 0.08})`;
        g.fillRect(
          x0 + Math.random() * w,
          y0 + Math.random() * h,
          2 + Math.random() * 14,
          1 + Math.random() * 5,
        );
      }
    };
    paper(0, 0, 512, 512, "#c9bb93");
    g.save();
    g.beginPath();
    g.rect(10, 10, 492, 492);
    g.clip();
    g.strokeStyle = "rgba(120,85,50,0.55)";
    g.lineWidth = 1.4;
    for (let k = 0; k < 5; k++) {
      const cx = 80 + Math.random() * 350,
        cy = 80 + Math.random() * 350;
      for (let r = 18; r < 160; r += 14) {
        g.beginPath();
        for (let a = 0; a <= 6.3; a += 0.15) {
          const rr =
            r * (1 + 0.18 * Math.sin(a * 3 + k) + 0.08 * Math.sin(a * 7 + r));
          g.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr * 0.8);
        }
        g.stroke();
      }
    }
    g.strokeStyle = "rgba(40,70,120,0.7)";
    g.lineWidth = 4;
    g.beginPath();
    g.moveTo(0, 300);
    g.bezierCurveTo(150, 250, 250, 420, 512, 360);
    g.stroke();
    g.strokeStyle = "rgba(30,30,30,0.35)";
    g.lineWidth = 1;
    for (let i = 0; i < 512; i += 64) {
      g.beginPath();
      g.moveTo(i, 0);
      g.lineTo(i, 512);
      g.moveTo(0, i);
      g.lineTo(512, i);
      g.stroke();
    }
    g.fillStyle = "rgba(40,70,40,0.25)";
    for (let i = 0; i < 40; i++) {
      g.beginPath();
      g.arc(
        Math.random() * 512,
        Math.random() * 200,
        6 + Math.random() * 10,
        0,
        6.3,
      );
      g.fill();
    }
    g.strokeStyle = "rgba(170,20,20,0.85)";
    g.lineWidth = 6;
    g.lineCap = "round";
    for (const [a, b, c, d] of [
      [90, 420, 240, 280],
      [420, 440, 300, 300],
      [260, 120, 270, 250],
    ]) {
      g.beginPath();
      g.moveTo(a, b);
      g.quadraticCurveTo((a + c) / 2 + 30, (b + d) / 2, c, d);
      g.stroke();
      g.beginPath();
      g.moveTo(c, d);
      g.lineTo(c - 18, d + 10);
      g.moveTo(c, d);
      g.lineTo(c + 6, d + 20);
      g.stroke();
    }
    g.strokeStyle = "rgba(20,20,20,0.9)";
    g.lineWidth = 3;
    g.strokeRect(236, 262, 60, 44);
    g.fillStyle = "rgba(20,20,20,0.85)";
    g.font = 'bold 22px "Courier New", monospace';
    g.fillText("BLACKWALD", 30, 40);
    g.font = '16px "Courier New", monospace';
    g.fillText("SEKTOR 7  1:25000", 30, 62);
    g.fillText("B", 258, 292);
    g.restore();
    // cell 1: typed notices / documents (512..1024, 0..512)
    paper(512, 0, 512, 512, "#d8d0bb");
    g.fillStyle = "rgba(25,25,25,0.8)";
    g.font = 'bold 26px "Courier New", monospace';
    g.fillText("BEFEHL NR. 14", 560, 60);
    g.font = '15px "Courier New", monospace';
    for (let i = 0; i < 22; i++) {
      let s = "";
      const n = 18 + Math.floor(Math.random() * 30);
      for (let k = 0; k < n; k++)
        s +=
          Math.random() < 0.16
            ? " "
            : String.fromCharCode(97 + Math.floor(Math.random() * 26));
      g.fillText(s, 560, 100 + i * 18);
    }
    g.strokeStyle = "rgba(150,20,20,0.7)";
    g.lineWidth = 4;
    g.beginPath();
    g.arc(900, 440, 44, 0, 6.3);
    g.stroke();
    g.font = 'bold 16px "Courier New"';
    g.fillStyle = "rgba(150,20,20,0.7)";
    g.fillText("GEHEIM", 866, 446);
    // cell 2: radio face (0..512, 512..1024)
    g.fillStyle = "#1d231c";
    g.fillRect(0, 512, 512, 512);
    g.fillStyle = "#2b3329";
    g.fillRect(16, 528, 480, 480);
    for (const [cx, cy, r] of [
      [130, 660, 80],
      [360, 660, 60],
      [120, 880, 40],
      [260, 880, 40],
      [400, 880, 40],
    ]) {
      g.fillStyle = "#0c0e0b";
      g.beginPath();
      g.arc(cx, cy, r + 8, 0, 6.3);
      g.fill();
      const gr = g.createRadialGradient(cx, cy, 0, cx, cy, r);
      gr.addColorStop(0, "#f6c66a");
      gr.addColorStop(1, "#8a5a1a");
      g.fillStyle = gr;
      g.beginPath();
      g.arc(cx, cy, r, 0, 6.3);
      g.fill();
      g.strokeStyle = "#2a1a08";
      g.lineWidth = 2;
      for (let a = 0; a < 6.28; a += 0.3) {
        g.beginPath();
        g.moveTo(cx + Math.cos(a) * r * 0.75, cy + Math.sin(a) * r * 0.75);
        g.lineTo(cx + Math.cos(a) * r * 0.95, cy + Math.sin(a) * r * 0.95);
        g.stroke();
      }
      g.strokeStyle = "#200";
      g.lineWidth = 3;
      g.beginPath();
      g.moveTo(cx, cy);
      g.lineTo(cx + Math.cos(-1) * r * 0.9, cy + Math.sin(-1) * r * 0.9);
      g.stroke();
    }
    g.fillStyle = "#e8d8a0";
    g.fillRect(40, 770, 430, 30);
    g.fillStyle = "#300";
    for (let i = 0; i < 40; i++)
      g.fillRect(50 + i * 10.5, 775, 2, i % 5 ? 10 : 20);
    // cell 3: blank crate stencil / labels (512..1024, 512..1024)
    g.fillStyle = "#6a5a3c";
    g.fillRect(512, 512, 512, 512);
    g.fillStyle = "rgba(15,12,8,0.85)";
    g.font = 'bold 70px "Courier New", monospace';
    g.fillText("MUNITION", 560, 640);
    g.font = 'bold 44px "Courier New", monospace';
    g.fillText("7,92 mm  x1500", 560, 720);
    g.fillText("VORSICHT", 560, 800);
  });
  const paperMat = new THREE.MeshStandardMaterial({
    map: atlas,
    roughness: 0.9,
    side: THREE.DoubleSide,
  });
  const radioMat = new THREE.MeshStandardMaterial({
    map: atlas,
    emissiveMap: atlas,
    emissive: 0xffb050,
    emissiveIntensity: 0.35,
    roughness: 0.6,
  });
  const CELL = {
    map: [0, 0.5, 0.5, 1],
    doc: [0.5, 0.5, 1, 1],
    radio: [0, 0, 0.5, 0.5],
    label: [0.5, 0, 1, 0.5],
  };
  // oriented plane: centre, right vector t, normal n, w,h, uv cell
  function card(m, region, c, t, n, w, h, cell, cast = false) {
    const up = new THREE.Vector3().crossVectors(n, t).normalize();
    const p = (u, v) =>
      c
        .clone()
        .addScaledVector(t, (u * w) / 2)
        .addScaledVector(up, (v * h) / 2);
    const P = [p(-1, -1), p(1, -1), p(1, 1), p(-1, 1)];
    const g = new THREE.BufferGeometry();
    const pos = [],
      nor = [],
      uv = [];
    const [u0, v0, u1, v1] = cell;
    const U = [
      [u0, v0],
      [u1, v0],
      [u1, v1],
      [u0, v1],
    ];
    for (const i of [0, 1, 2, 0, 2, 3]) {
      pos.push(P[i].x, P[i].y, P[i].z);
      nor.push(n.x, n.y, n.z);
      uv.push(...U[i]);
    }
    g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute("normal", new THREE.Float32BufferAttribute(nor, 3));
    g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
    emit(g, m, region, cast);
  }
  const V = (x, y, z) => new THREE.Vector3(x, y, z);
  const X = V(1, 0, 0),
    Z = V(0, 0, 1),
    NX = V(-1, 0, 0),
    NZ = V(0, 0, -1),
    UP = V(0, 1, 0);
  // wall poster: on the face of wall at (x,z) facing n
  const poster = (region, x, y, z, n, w, h, cell, rot = 0) => {
    const t = V(n.z, 0, -n.x);
    if (rot) t.applyAxisAngle(n, rot);
    card(
      paperMat,
      region,
      V(x, y, z).addScaledVector(n, 0.015),
      t,
      n,
      w,
      h,
      cell,
    );
    // pins
    const up = new THREE.Vector3().crossVectors(n, t);
    for (const [a, b] of [
      [-1, 1],
      [1, 1],
    ]) {
      const p = V(x, y, z)
        .addScaledVector(t, a * (w / 2 - 0.04))
        .addScaledVector(up, b * (h / 2 - 0.04))
        .addScaledVector(n, 0.02);
      anyGeo(
        new THREE.SphereGeometry(0.012, 5, 4),
        "rubber_black",
        region,
        p.x,
        p.y,
        p.z,
        { cast: false },
      );
    }
  };

  // ---------- prop builders ----------
  function table(region, x, z, w, d, h = 0.82, ry = 0, col = true) {
    const sw = Math.abs(Math.sin(ry)) > 0.5;
    boxB("wood_planks", region, x, h - 0.05, z, w, 0.05, d, { ry });
    const lx = w / 2 - 0.07,
      lz = d / 2 - 0.07;
    for (const [a, b] of [
      [-lx, -lz],
      [lx, -lz],
      [lx, lz],
      [-lx, lz],
    ]) {
      const c = Math.cos(ry),
        s = Math.sin(ry);
      boxB(
        "wood_planks",
        region,
        x + a * c + b * s,
        0,
        z - a * s + b * c,
        0.07,
        h - 0.05,
        0.07,
        { ry },
      );
    }
    boxB(
      "wood_planks",
      region,
      x,
      0.15,
      z,
      sw ? 0.04 : w - 0.2,
      0.05,
      sw ? d - 0.2 : 0.04,
      { ry: 0 },
    );
    if (col) solidC(x, z, sw ? d : w, sw ? w : d, h, "wood");
  }
  function chair(region, x, z, ry, tipped = false) {
    const g = [];
    const add = (geo) => g.push(prep(geo));
    const b = (sx, sy, sz, px, py, pz) => {
      const q = new THREE.BoxGeometry(sx, sy, sz);
      q.translate(px, py, pz);
      add(q);
    };
    b(0.42, 0.04, 0.4, 0, 0.45, 0);
    for (const [a, c] of [
      [-0.18, -0.17],
      [0.18, -0.17],
      [0.18, 0.17],
      [-0.18, 0.17],
    ])
      b(0.035, 0.45, 0.035, a, 0.225, c);
    b(0.035, 0.45, 0.035, -0.18, 0.68, -0.18);
    b(0.035, 0.45, 0.035, 0.18, 0.68, -0.18);
    b(0.4, 0.12, 0.025, 0, 0.8, -0.18);
    const geo = mergeGeometries(g);
    projUV(geo, 1, rng(), rng());
    anyGeo(geo, "wood_planks", region, x, tipped ? 0.2 : 0, z, {
      ry,
      rx: tipped ? -Math.PI / 2 + 0.1 : 0,
    });
  }
  function crate(region, x, z, s = 0.9, y0 = 0, ry = 0, col = true, h) {
    h = h || s;
    boxB("crate_wood", region, x, y0, z, s, h, s, { ry });
    // slat edges
    for (const e of [-1, 1])
      boxB(
        "crate_wood",
        region,
        x + Math.cos(ry) * e * (s / 2 - 0.03),
        y0 + 0.01,
        z - Math.sin(ry) * e * (s / 2 - 0.03),
        0.07,
        h - 0.02,
        s + 0.02,
        { ry },
      );
    if (col && y0 === 0)
      solidC(
        x,
        z,
        s * (Math.abs(Math.cos(ry)) + Math.abs(Math.sin(ry))) * 0.95,
        s * (Math.abs(Math.cos(ry)) + Math.abs(Math.sin(ry))) * 0.95,
        h,
        "wood",
      );
  }
  function drum(region, x, z, m = "metal_rusty", tipped = false, col = true) {
    if (tipped) {
      const ry = rng() * 3;
      cyl(m, region, x, 0.29, z, 0.29, 0.29, 0.88, 14, { rx: Math.PI / 2, ry });
      if (col) solidC(x, z, 0.8, 0.8, 0.58, "metal");
      return;
    }
    cyl(m, region, x, 0.44, z, 0.29, 0.29, 0.88, 14);
    for (const y of [0.3, 0.6])
      cyl(m, region, x, y, z, 0.297, 0.297, 0.03, 14, { cast: false });
    cyl("metal_rusty", region, x, 0.885, z, 0.3, 0.3, 0.02, 14, {
      cast: false,
    });
    if (col) solidC(x, z, 0.6, 0.6, 0.9, "metal");
  }
  function sandbagLine(region, x0, z0, x1, z1, layers = 3, col = true) {
    const len = Math.hypot(x1 - x0, z1 - z0),
      ry = Math.atan2(-(z1 - z0), x1 - x0);
    const n = Math.max(1, Math.round(len / 0.56));
    for (let l = 0; l < layers; l++)
      for (let i = 0; i < n - (l % 2); i++) {
        const t = (i + 0.5 + (l % 2) * 0.5) / n;
        const g = sandbagGeo();
        xform(
          g,
          lerp(x0, x1, t) + (rng() - 0.5) * 0.04,
          0.085 + l * 0.165,
          lerp(z0, z1, t) + (rng() - 0.5) * 0.04,
          (rng() - 0.5) * 0.08,
          ry + (rng() - 0.5) * 0.18,
          (rng() - 0.5) * 0.08,
        );
        emit(g, "sandbag", region, true);
        // second row behind
        if (layers >= 3 && l < layers - 1) {
          const g2 = sandbagGeo();
          const ox = Math.sin(ry) * 0.3,
            oz = Math.cos(ry) * 0.3;
          xform(
            g2,
            lerp(x0, x1, t) + ox,
            0.085 + l * 0.165,
            lerp(z0, z1, t) + oz,
            0,
            ry + (rng() - 0.5) * 0.2,
            0,
          );
          emit(g2, "sandbag", region, true);
        }
      }
    if (col) {
      const pad = 0.2;
      solid(
        Math.min(x0, x1) - pad,
        0,
        Math.min(z0, z1) - pad,
        Math.max(x0, x1) + pad,
        layers * 0.165 + 0.05,
        Math.max(z0, z1) + pad,
        "sandbag",
      );
    }
  }
  function cabinet(region, x, z, n, w = 0.5, d = 0.6, h = 1.35) {
    // filing cabinet facing n
    const t = V(n.z, 0, -n.x);
    const sx = Math.abs(t.x) * w + Math.abs(n.x) * d,
      sz = Math.abs(t.z) * w + Math.abs(n.z) * d;
    boxB("metal_painted_green", region, x, 0, z, sx, h, sz);
    for (let i = 0; i < 4; i++) {
      const y = 0.18 + (i * (h - 0.1)) / 4;
      const p = V(x, y + 0.14, z).addScaledVector(n, d / 2 + 0.01);
      box(
        "metal_painted_green",
        region,
        p.x,
        p.y,
        p.z,
        Math.abs(t.x) * (w - 0.05) + Math.abs(n.x) * 0.02,
        0.27,
        Math.abs(t.z) * (w - 0.05) + Math.abs(n.z) * 0.02,
      );
      const hp = p.clone().addScaledVector(n, 0.02);
      hp.y += 0.06;
      box(
        "brass",
        region,
        hp.x,
        hp.y,
        hp.z,
        Math.abs(t.x) * 0.12 + 0.015,
        0.02,
        Math.abs(t.z) * 0.12 + 0.015,
        { uv: "raw", cast: false },
      );
    }
    solidC(x, z, sx, sz, h, "metal");
  }
  function radioSet(region, x, y0, z, n, w = 0.5, h = 0.34, d = 0.3) {
    const t = V(n.z, 0, -n.x);
    const sx = Math.abs(t.x) * w + Math.abs(n.x) * d,
      sz = Math.abs(t.z) * w + Math.abs(n.z) * d;
    boxB("metal_painted_green", region, x, y0, z, sx, h, sz);
    card(
      radioMat,
      region,
      V(x, y0 + h / 2, z).addScaledVector(n, d / 2 + 0.003),
      t,
      n,
      w - 0.04,
      h - 0.04,
      CELL.radio,
    );
    for (let i = 0; i < 3; i++) {
      const p = V(x, y0 + 0.07, z)
        .addScaledVector(t, (i - 1) * w * 0.3)
        .addScaledVector(n, d / 2 + 0.02);
      cyl("rubber_black", region, p.x, p.y, p.z, 0.022, 0.022, 0.03, 10, {
        rx: Math.PI / 2,
        ry: Math.atan2(n.x, n.z),
        uv: "raw",
        cast: false,
      });
    }
  }
  function shelf(region, x, z, n, w = 1.8, d = 0.45, h = 2.0, fill = true) {
    const t = V(n.z, 0, -n.x);
    const S = (a, b) => [
      Math.abs(t.x) * a + Math.abs(n.x) * b,
      Math.abs(t.z) * a + Math.abs(n.z) * b,
    ];
    for (const e of [-1, 1])
      for (const f of [-1, 1]) {
        const p = V(x, 0, z)
          .addScaledVector(t, e * (w / 2 - 0.03))
          .addScaledVector(n, f * (d / 2 - 0.03));
        boxB("metal_rusty", region, p.x, 0, p.z, 0.04, h, 0.04);
      }
    for (const y of [0.12, 0.7, 1.3, 1.9]) {
      const [a, b] = S(w, d);
      boxB("wood_planks", region, x, y, z, a, 0.03, b);
      if (fill && y < 1.9) {
        let u = -w / 2 + 0.1;
        while (u < w / 2 - 0.25) {
          const bw = 0.18 + rng() * 0.3,
            bh = 0.15 + rng() * 0.3;
          if (rng() < 0.8) {
            const p = V(x, 0, z)
              .addScaledVector(t, u + bw / 2)
              .addScaledVector(n, (rng() - 0.5) * 0.08);
            const [c, e] = S(bw, d * 0.7);
            boxB(
              pick([
                "crate_wood",
                "metal_painted_green",
                "cloth_canvas",
                "crate_wood",
              ]),
              region,
              p.x,
              y + 0.03,
              p.z,
              c,
              bh,
              e,
              { uvs: 1 },
            );
          }
          u += bw + 0.04;
        }
      }
    }
    const [a, b] = S(w, d);
    solidC(x, z, a, b, h, "metal");
  }
  function rubble(region, x, z, r, n, hmax = 0.6, col = true) {
    for (let i = 0; i < n; i++) {
      const a = rng() * 6.28,
        d = Math.sqrt(rng()) * r;
      const s = 0.08 + rng() * 0.28 * (1 - (d / r) * 0.6);
      const g = new THREE.DodecahedronGeometry(s, 0);
      anyGeo(
        g,
        rng() < 0.8 ? "concrete_wall" : "brick_old",
        region,
        x + Math.cos(a) * d,
        s * 0.4 + rng() * hmax * (1 - d / r),
        z + Math.sin(a) * d,
        {
          uv: "local",
          rx: rng() * 3,
          ry: rng() * 3,
          rz: rng() * 3,
          s: V(1 + rng() * 0.8, 0.5 + rng() * 0.5, 1 + rng() * 0.6),
        },
      );
    }
    if (col) solidC(x, z, r * 1.1, r * 1.1, hmax * 0.8 + 0.1, "concrete");
  }
  function papersOnFloor(region, x, z, r, n) {
    for (let i = 0; i < n; i++) {
      const a = rng() * 6.28,
        d = rng() * r;
      const t = V(1, 0, 0).applyAxisAngle(UP, rng() * 6.28);
      card(
        paperMat,
        region,
        V(x + Math.cos(a) * d, 0.004 + i * 0.0006, z + Math.sin(a) * d),
        t,
        UP,
        0.21,
        0.29,
        rng() < 0.5 ? CELL.doc : CELL.map,
      );
    }
  }
  function pipeRun(region, a, b, r = 0.06, brackets = true) {
    const d = b.clone().sub(a),
      len = d.length();
    const mid = a.clone().add(b).multiplyScalar(0.5);
    const g = cylGeoLocal(r, len);
    const q = new THREE.Quaternion().setFromUnitVectors(
      UP,
      d.clone().normalize(),
    );
    g.applyMatrix4(new THREE.Matrix4().compose(mid, q, V(1, 1, 1)));
    emit(g, "metal_rusty", region, true);
    if (brackets)
      for (let s = 0.5; s < len; s += 2.0) {
        const p = a.clone().addScaledVector(d, s / len);
        const f = cylGeoLocal(r * 1.35, 0.06);
        f.applyMatrix4(new THREE.Matrix4().compose(p, q, V(1, 1, 1)));
        emit(f, "metal_rusty", region, false);
      }
  }
  function cylGeoLocal(r, len) {
    const g = prep(new THREE.CylinderGeometry(r, r, len, 10, 1, true));
    const uv = g.attributes.uv;
    for (let i = 0; i < uv.count; i++)
      uv.setXY(i, uv.getX(i) * r * 3.14, (uv.getY(i) * len) / 2);
    return g;
  }

  // ---------- ceiling beams + posts (per zone) ----------
  const BEAMS = {
    0: [-6.2, -2.3, 2.1, 6.2],
    1: [-22, -19, -13, -10],
    2: [10.5, 13.5, 16.5, 19.5, 22.5],
    3: [-22, -19, -13, -10],
  };
  for (const z of ZDEF) {
    const region = "z" + z.id;
    const hole = HOLES.find((h) => h.zone === z.id);
    for (const bx of BEAMS[z.id]) {
      const z0 = z.z0 + HW,
        z1 = z.z1 - HW;
      const segs = [];
      if (hole && bx > hole.x0 - 0.2 && bx < hole.x1 + 0.2) {
        segs.push([z0, hole.z0 - 0.35]);
        segs.push([hole.z1 + 0.35, z1]);
      } else segs.push([z0, z1]);
      for (const [a, b] of segs)
        box(
          "wood_planks",
          region,
          bx,
          WALL_H - 0.16,
          (a + b) / 2,
          0.24,
          0.32,
          b - a,
          { uvs: 0.5 },
        );
      if (segs.length === 2) {
        // broken beam end sagging into the hole
        box(
          "wood_planks",
          region,
          bx,
          WALL_H - 0.7,
          hole.z0 + 0.05,
          0.22,
          0.28,
          1.1,
          { rx: 0.9, uvs: 0.5 },
        );
      }
      // posts against both walls when free
      for (const [pz, sgn] of [
        [z0 + 0.14, 1],
        [z1 - 0.14, -1],
      ]) {
        if (!isFree(bx, pz, 0.2)) continue;
        boxB("wood_planks", region, bx, 0, pz, 0.24, WALL_H - 0.32, 0.26, {
          uvs: 0.5,
        });
        // knee brace
        box(
          "wood_planks",
          region,
          bx,
          WALL_H - 0.55,
          pz + sgn * 0.3,
          0.14,
          0.14,
          0.7,
          { rx: sgn * -0.75, uvs: 0.5 },
        );
        solid(bx - 0.12, 0, pz - 0.13, bx + 0.12, WALL_H, pz + 0.13, "wood");
      }
    }
    // steel girder along the long axis
    box(
      "metal_rusty",
      region,
      (z.x0 + z.x1) / 2,
      WALL_H - 0.38,
      (z.z0 + z.z1) / 2 + (z.id === 0 ? 1.8 : 0),
      z.x1 - z.x0 - WT,
      0.14,
      0.14,
    );
  }

  // ---------- hole debris ----------
  for (const h of HOLES) {
    const region = "z" + h.zone,
      cx = (h.x0 + h.x1) / 2,
      cz = (h.z0 + h.z1) / 2;
    rubble(region, cx + 0.5, cz + 0.6, 1.2, 38, 0.55);
    // hanging rebar
    for (let i = 0; i < 9; i++) {
      const edge =
        rng() < 0.5
          ? [
              h.x0 + rng() * (h.x1 - h.x0),
              h.z0 + (rng() < 0.5 ? 0 : h.z1 - h.z0),
            ]
          : [
              h.x0 + (rng() < 0.5 ? 0 : h.x1 - h.x0),
              h.z0 + rng() * (h.z1 - h.z0),
            ];
      const L = 0.3 + rng() * 0.8;
      cyl(
        "metal_rusty",
        region,
        edge[0],
        WALL_H - L / 2 + 0.1,
        edge[1],
        0.008,
        0.008,
        L,
        5,
        { rx: (rng() - 0.5) * 0.9, rz: (rng() - 0.5) * 0.9, cast: false },
      );
    }
    // chunks still on the rim above
    for (let i = 0; i < 6; i++)
      anyGeo(
        new THREE.DodecahedronGeometry(0.15 + rng() * 0.2, 0),
        "concrete_wall",
        "roof",
        lerp(h.x0, h.x1, rng()),
        WALL_H + 0.4,
        lerp(h.z0, h.z1, rng() < 0.5 ? 0 : 1),
        { uv: "local", rx: rng() * 3, ry: rng() * 3 },
      );
  }

  // =========================================== ZONE 0 — COMMAND POST
  {
    const r = "z0";
    // central map table
    table(r, 0, -0.5, 3.2, 1.7, 0.86);
    card(
      paperMat,
      r,
      V(-0.2, 0.866, -0.5),
      X.clone().applyAxisAngle(UP, 0.06),
      UP,
      1.5,
      1.05,
      CELL.map,
    );
    card(
      paperMat,
      r,
      V(1.05, 0.868, -0.1),
      X.clone().applyAxisAngle(UP, -0.4),
      UP,
      0.3,
      0.4,
      CELL.doc,
    );
    card(
      paperMat,
      r,
      V(0.95, 0.87, -0.95),
      X.clone().applyAxisAngle(UP, 0.3),
      UP,
      0.3,
      0.4,
      CELL.doc,
    );
    radioSet(r, -1.25, 0.86, -1.05, Z, 0.46, 0.3, 0.32);
    cyl("metal_painted_green", r, 1.3, 0.92, -1.0, 0.045, 0.04, 0.11, 10); // mug
    cyl("brass", r, 0.6, 0.875, 0.1, 0.05, 0.05, 0.03, 12, { uv: "raw" }); // compass
    for (const [x, z, ry, tip] of [
      [-1.0, -1.75, 0, false],
      [0.9, -1.8, 0.3, false],
      [-1.9, 0.2, Math.PI / 2 + 0.2, false],
      [1.3, 0.75, Math.PI + 0.4, false],
      [2.4, 1.5, 1.2, true],
    ])
      chair(r, x, z, ry, tip);
    // concrete columns
    for (const x of [-4.2, 4.2]) {
      boxB("concrete_wall", r, x, 0, -0.5, 0.5, WALL_H, 0.5, { uv: "world" });
      solidC(x, -0.5, 0.5, 0.5, WALL_H, "concrete");
    }
    // filing cabinets + wall map on east wall
    for (const z of [-4.1, -4.65, -5.2])
      cabinet(r, 7.47, z, NX, 0.52, 0.62, 1.32);
    poster(r, 7.8, 1.95, -4.65, NX, 1.1, 0.8, CELL.map, 0.03);
    poster(r, 0.4, 1.8, -6.8, Z, 1.4, 1.0, CELL.map, -0.02);
    poster(r, 1.55, 1.55, -6.8, Z, 0.4, 0.55, CELL.doc, 0.08);
    poster(r, -7.8, 1.7, -2.6, X, 0.42, 0.58, CELL.doc, -0.05);
    // desk + typewriter + chair SE
    table(r, 7.3, 4.6, 1.4, 0.7, 0.78, Math.PI / 2);
    boxB("metal_painted_green", r, 7.3, 0.78, 4.4, 0.34, 0.14, 0.32);
    card(
      paperMat,
      r,
      V(7.28, 0.95, 4.4),
      X,
      V(0.25, 0.97, 0).normalize(),
      0.2,
      0.2,
      CELL.doc,
    );
    chair(r, 6.55, 4.6, -Math.PI / 2 + 0.2);
    // crates + sandbags in corners
    crate(r, -6.9, -3.9, 0.95);
    crate(r, -6.95, -3.9, 0.6, 0.95, 0.4, false);
    crate(r, -7.0, 6.15, 0.9, 0, 0.2);
    crate(r, -6.1, 6.35, 0.6, 0, -0.3);
    drum(r, -5.9, -6.25);
    sandbagLine(r, 5.5, 6.55, 7.4, 6.55, 3);
    papersOnFloor(r, 1.5, 2.0, 1.5, 7);
    papersOnFloor(r, -3.5, -3.5, 1.2, 4);
  }

  // =========================================== ZONE 1 — RADIO ROOM
  {
    const r = "z1";
    // central radio island: two desks back to back + a tall rack
    table(r, -16, -0.3, 4.2, 0.85, 0.8);
    table(r, -16, 0.6, 4.2, 0.85, 0.8, 0, false);
    solidC(-16, 0.15, 4.2, 1.75, 0.8, "wood");
    boxB("metal_painted_green", r, -16, 0.8, 0.15, 1.0, 1.0, 0.5);
    solidC(-16, 0.15, 1.0, 0.5, 1.8, "metal");
    card(radioMat, r, V(-16, 1.3, 0.405), X, Z, 0.9, 0.9, CELL.radio);
    card(radioMat, r, V(-16, 1.3, -0.105), NX, NZ, 0.9, 0.9, CELL.radio);
    for (const x of [-17.6, -14.4]) {
      radioSet(r, x, 0.8, -0.45, NZ, 0.55, 0.36, 0.34);
      radioSet(r, x, 0.8, 0.75, Z, 0.55, 0.36, 0.34);
    }
    radioSet(r, -17.6, 1.16, 0.75, Z, 0.4, 0.22, 0.28);
    // headsets + mics
    for (const [x, z] of [
      [-17.0, -0.55],
      [-14.9, 0.9],
    ]) {
      anyGeo(
        new THREE.TorusGeometry(0.09, 0.012, 5, 14, Math.PI),
        "rubber_black",
        r,
        x,
        0.84,
        z,
        { rx: -Math.PI / 2 + 0.2 },
      );
    }
    for (const [x, z, ry] of [
      [-17.5, -1.4, 0.2],
      [-14.5, -1.3, -0.3],
      [-17.2, 1.6, Math.PI + 0.1],
      [-14.2, 1.55, Math.PI - 0.2],
    ])
      chair(r, x, z, ry);
    // switchboard on west wall
    boxB("metal_painted_green", r, -23.5, 0, -3.5, 0.5, 1.95, 1.4);
    solidC(-23.5, -3.5, 0.5, 1.4, 1.95, "metal");
    card(radioMat, r, V(-23.245, 1.25, -3.5), Z, X, 1.25, 0.95, CELL.radio);
    // shelves with radio parts near the east door
    shelf(r, -8.5, 4.5, NX, 1.8, 0.45, 1.95);
    shelf(r, -8.5, -4.3, NX, 1.6, 0.45, 1.95);
    // SW corner crates + cabinets
    crate(r, -23.1, 6.0, 0.95);
    crate(r, -22.2, 6.2, 0.7, 0, 0.3);
    crate(r, -23.1, 6.0, 0.6, 0.95, 0.5, false);
    for (const x of [-20.4, -19.8]) cabinet(r, x, 6.45, NZ, 0.55, 0.62, 1.3);
    poster(r, -21.0, 1.75, 6.8, NZ, 1.3, 0.9, CELL.map, 0.02);
    poster(r, -23.8, 1.8, 4.6, X, 0.8, 0.6, CELL.map, -0.04);
    poster(r, -13.8, 1.7, -6.8, Z, 0.4, 0.55, CELL.doc, 0.1);
    poster(r, -18.2, 1.65, -6.8, Z, 0.42, 0.58, CELL.doc, -0.06);
    // ceiling pipes with drips
    pipeRun(r, V(-23.8, 3.2, -5.9), V(-8.2, 3.2, -5.9), 0.07);
    pipeRun(r, V(-23.8, 3.35, -5.6), V(-8.2, 3.35, -5.6), 0.045);
    papersOnFloor(r, -15.5, 3.0, 1.8, 8);
  }

  // =========================================== ZONE 2 — ARMORY HALL
  {
    const r = "z2";
    // central island: crate stacks with a rack spine
    const cs = [
      [15.5, -0.6, 1.0, 1],
      [15.5, 0.6, 1.0, 2],
      [16.6, -0.55, 0.9, 1],
      [16.6, 0.55, 1.0, 1],
      [17.7, 0, 1.2, 2],
      [18.9, -0.6, 1.0, 1],
      [18.9, 0.55, 0.9, 2],
      [20.0, -0.5, 1.0, 2],
      [20.0, 0.6, 0.95, 1],
      [20.9, 0, 0.8, 1],
    ];
    for (const [x, z, s, st] of cs) {
      crate(r, x, z, s, 0, (rng() - 0.5) * 0.2, false);
      if (st > 1)
        crate(
          r,
          x + (rng() - 0.5) * 0.1,
          z,
          s * 0.8,
          s,
          (rng() - 0.5) * 0.4,
          false,
        );
    }
    solid(14.95, 0, -1.15, 21.35, 1.8, 1.15, "wood");
    // ammo labels on a few
    card(paperMat, r, V(15.5, 0.5, -1.105), X, NZ, 0.5, 0.25, CELL.label);
    card(paperMat, r, V(18.9, 0.5, -1.105), X, NZ, 0.5, 0.25, CELL.label);
    // weapon racks along the west wall
    for (const z of [-4.6, 4.6]) {
      const w = 1.9;
      boxB("wood_planks", r, 8.45, 0, z, 0.1, 1.6, w, { uvs: 0.5 });
      boxB("wood_planks", r, 8.62, 0.2, z, 0.3, 0.06, w);
      boxB("wood_planks", r, 8.62, 1.3, z, 0.24, 0.05, w);
      for (let i = 0; i < 6; i++) {
        const zz = z - w / 2 + 0.2 + i * 0.3;
        box("gun_metal", r, 8.6, 1.0, zz, 0.035, 0.9, 0.035, {
          uv: "raw",
          rz: 0.12,
          cast: false,
        });
        box("wood_stock", r, 8.64, 0.5, zz, 0.06, 0.55, 0.05, {
          uv: "raw",
          rz: 0.12,
        });
      }
      solidC(8.6, z, 0.4, w, 1.6, "wood");
    }
    // workbench south wall
    table(r, 19.8, 7.35, 1.8, 0.8, 0.9);
    boxB("metal_rusty", r, 19.2, 0.9, 7.4, 0.2, 0.18, 0.14); // vise
    box("gun_metal", r, 20.2, 0.93, 7.3, 0.7, 0.05, 0.08, {
      uv: "raw",
      ry: 0.3,
    });
    box("wood_stock", r, 20.5, 0.93, 7.45, 0.35, 0.07, 0.06, {
      uv: "raw",
      ry: -0.2,
    });
    poster(r, 19.8, 1.75, 7.8, NZ, 0.9, 0.62, CELL.doc, 0.03);
    // shelving north wall
    shelf(r, 15.8, -7.5, Z, 2.0, 0.45, 2.0);
    // drums + ammo crates
    drum(r, 9.2, 7.2);
    drum(r, 9.85, 7.35, "metal_painted_green");
    drum(r, 9.3, 6.55, "metal_rusty", true);
    crate(r, 9.3, -7.2, 0.8);
    crate(r, 10.1, -7.3, 0.6, 0, 0.4);
    sandbagLine(r, 24.6, 6.0, 24.6, 7.6, 3);
    poster(r, 13.6, 1.8, -7.8, Z, 0.5, 0.65, CELL.doc, 0.04);
    papersOnFloor(r, 22, -2, 1.5, 5);
    pipeRun(r, V(8.2, 3.25, 6.6), V(25.8, 3.25, 6.6), 0.07);
  }

  // =========================================== ZONE 3 — GENERATOR VAULT
  {
    const r = "z3";
    const gx = -16,
      gz = -14.6;
    // skid + engine block + flywheel + radiator + exhaust
    boxB("metal_rusty", r, gx, 0, gz, 4.4, 0.25, 2.3);
    boxB("metal_painted_green", r, gx - 0.5, 0.25, gz, 2.6, 1.35, 1.7);
    boxB("metal_painted_green", r, gx - 0.5, 1.6, gz, 2.2, 0.35, 1.2);
    for (let i = 0; i < 6; i++)
      cyl("metal_rusty", r, gx - 1.4 + i * 0.36, 2.02, gz, 0.1, 0.12, 0.2, 10); // cylinder heads
    boxB("metal_painted_green", r, gx + 1.45, 0.25, gz, 0.6, 1.2, 1.9); // generator housing
    cyl("metal_rusty", r, gx + 1.2, 1.05, gz, 0.72, 0.72, 0.18, 24, {
      rz: Math.PI / 2,
    }); // flywheel
    cyl("metal_rusty", r, gx + 1.2, 1.05, gz, 0.16, 0.16, 0.3, 12, {
      rz: Math.PI / 2,
    });
    boxB("metal_rusty", r, gx - 2.0, 0.25, gz, 0.25, 1.5, 1.6); // radiator
    for (let i = 0; i < 9; i++)
      boxB(
        "metal_rusty",
        r,
        gx - 2.16,
        0.35,
        gz - 0.7 + i * 0.175,
        0.04,
        1.3,
        0.02,
        { cast: false },
      );
    cyl(
      "metal_rusty",
      r,
      gx - 0.2,
      2.2 + (WALL_H - 2.2) / 2,
      gz + 0.3,
      0.1,
      0.1,
      WALL_H - 2.2,
      12,
    );
    cyl("metal_rusty", r, gx - 0.2, 2.05, gz + 0.3, 0.14, 0.14, 0.25, 12);
    cyl("metal_painted_green", r, gx + 0.3, 2.15, gz - 0.2, 0.3, 0.3, 1.4, 16, {
      rz: Math.PI / 2,
    }); // fuel tank
    radioSet(r, gx + 0.25, 0.7, gz + 0.9, Z, 0.7, 0.4, 0.12);
    radioSet(r, gx - 1.2, 0.7, gz - 0.9, NZ, 0.6, 0.35, 0.12);
    solid(gx - 2.3, 0, gz - 1.2, gx + 2.25, 2.3, gz + 1.2, "metal");
    // cable from generator to switch along the floor + up the wall
    pipeRun(r, V(gx + 1.6, 0.05, gz - 0.9), V(-11.8, 0.05, -20.6), 0.04, false);
    // transformer cabinets west wall
    for (const z of [-18.6, -17.7]) {
      boxB("metal_painted_green", r, -23.45, 0, z, 0.6, 2.0, 0.85);
      card(radioMat, r, V(-23.14, 1.35, z), Z, X, 0.6, 0.5, CELL.radio);
    }
    solid(-23.8, 0, -19.1, -23.1, 2.0, -17.2, "metal");
    // fuel drums
    drum(r, -9.2, -20.0, "metal_painted_green");
    drum(r, -9.85, -20.25);
    drum(r, -9.3, -19.35, "metal_rusty");
    drum(r, -9.5, -18.3, "metal_painted_green", true);
    // lockers on the east wall
    for (const z of [-12.55, -13.1, -13.65]) {
      boxB("metal_painted_green", r, -8.5, 0, z, 0.55, 1.9, 0.52);
      boxB("metal_rusty", r, -8.77, 1.2, z + 0.12, 0.02, 0.4, 0.02, {
        cast: false,
      });
    }
    solid(-8.8, 0, -13.95, -7.8, 1.9, -12.25, "metal");
    // cable trays + pipes
    pipeRun(r, V(-23.8, 3.25, -8.1), V(-8.2, 3.25, -8.1), 0.08);
    pipeRun(r, V(-23.8, 3.1, -19.9), V(-8.2, 3.1, -19.9), 0.06);
    pipeRun(r, V(-12.2, 3.1, -19.9), V(-12.2, 3.1, -8.1), 0.05);
    poster(r, -13.6, 1.7, -20.8, Z, 0.8, 0.6, CELL.doc, -0.03);
    poster(r, -23.8, 1.8, -10.5, X, 0.9, 0.62, CELL.map, 0.03);
    crate(r, -23.1, -7.9, 0.9);
    papersOnFloor(r, -13, -12, 1.2, 4);
  }

  // =========================================== ZONE STENCILS
  const stencil = canvasTex(1024, 512, (g) => {
    g.clearRect(0, 0, 1024, 512);
    g.fillStyle = "rgba(230,225,210,0.9)";
    g.font = 'bold 84px "Courier New", monospace';
    g.textAlign = "left";
    [
      "B-1  KOMMANDO",
      "B-2  FUNKRAUM",
      "B-3  ARSENAL",
      "B-4  MASCHINEN",
    ].forEach((s, i) => g.fillText(s, 20, 100 + i * 128));
    g.globalCompositeOperation = "destination-out";
    for (let i = 0; i < 9000; i++) {
      g.fillStyle = `rgba(0,0,0,${Math.random()})`;
      g.fillRect(
        Math.random() * 1024,
        Math.random() * 512,
        2 + Math.random() * 3,
        2 + Math.random() * 3,
      );
    }
    for (let x = 60; x < 1024; x += 58) g.fillRect(x, 0, 5, 512); // stencil bridges
  });
  const stencilMat = new THREE.MeshStandardMaterial({
    map: stencil,
    transparent: true,
    depthWrite: false,
    roughness: 1,
    polygonOffset: true,
    polygonOffsetFactor: -2,
  });
  for (const [i, x, z, n] of [
    [0, -5.3, 6.8, NZ],
    [1, -21.5, -6.8, Z],
    [2, 16.5, 7.8, NZ],
    [3, -19.5, -20.8, Z],
  ]) {
    const t = V(n.z, 0, -n.x);
    card(
      stencilMat,
      "walls",
      V(x, 2.55, z).addScaledVector(n, 0.013),
      t,
      n,
      2.0,
      0.25,
      [0, 1 - (i + 1) / 4 + 0.02, 1, 1 - i / 4 - 0.02],
    );
  }

  // =========================================== DRIPS (instanced)
  const DRIPS = [
    V(-20.5, 3.13, -5.9),
    V(-12.3, 3.13, -5.9),
    V(-17.9, 3.03, -19.9),
    V(-10.4, 3.18, -8.1),
    V(14.1, 3.18, 6.6),
  ];
  const dripMesh = new THREE.InstancedMesh(
    new THREE.SphereGeometry(0.012, 6, 4),
    new THREE.MeshStandardMaterial({
      color: 0x8090a0,
      roughness: 0.05,
      metalness: 0.2,
      transparent: true,
      opacity: 0.7,
    }),
    DRIPS.length,
  );
  dripMesh.frustumCulled = false;
  root.add(dripMesh);
  const dState = DRIPS.map((p) => ({ p, y: p.y, v: 0, wait: rng() * 2 }));
  const puddleMat = new THREE.MeshStandardMaterial({
    color: 0x0a0c0e,
    roughness: 0.02,
    metalness: 0.4,
    transparent: true,
    opacity: 0.75,
    polygonOffset: true,
    polygonOffsetFactor: -1,
  });
  for (const p of DRIPS) {
    const g = new THREE.CircleGeometry(1, 20);
    const pa = g.attributes.position;
    for (let i = 1; i < pa.count; i++) {
      const k = 0.35 + 0.35 * rng();
      pa.setXY(i, pa.getX(i) * k * (1.4 + rng() * 0.3), pa.getY(i) * k);
    }
    anyGeo(g, puddleMat, "walls", p.x, 0.003, p.z, {
      rx: -Math.PI / 2,
      ry: rng() * 3,
      cast: false,
    });
  }
  const _dm = new THREE.Matrix4();
  updaters.push((dt) => {
    dState.forEach((d, i) => {
      if (d.wait > 0) {
        d.wait -= dt;
        d.y = d.p.y;
        d.v = 0;
      } else {
        d.v += 9.8 * dt;
        d.y -= d.v * dt;
        if (d.y < 0.01) {
          d.wait = 0.6 + rng() * 2.2;
          d.y = d.p.y;
        }
      }
      _dm.makeScale(1, d.wait > 0 ? 1 : 2.2, 1).setPosition(d.p.x, d.y, d.p.z);
      dripMesh.setMatrixAt(i, _dm);
    });
    dripMesh.instanceMatrix.needsUpdate = true;
  });

  // =========================================== EXTERIOR
  {
    const r = "ext";
    // sandbag walls hugging the bunker (away from window lanes)
    sandbagLine(r, -22.8, 8.0, -19.6, 8.0, 3, true);
    sandbagLine(r, -12.2, 8.0, -9.0, 8.0, 3, true);
    sandbagLine(r, 10.0, 8.6, 14.5, 8.6, 3, true);
    sandbagLine(r, 26.6, 2.0, 26.6, 6.5, 3, true);
    sandbagLine(r, -24.6, -9.0, -24.6, -11.8, 3, true);
    sandbagLine(r, 10.5, -8.6, 16.5, -8.6, 2, true);
    // machine-gun nest south of the command post
    sandbagLine(r, -1.2, 14.5, 1.8, 15.2, 4, true);
    sandbagLine(r, 1.8, 15.2, 3.2, 13.8, 4, true);
    // crates / drums outside
    crate(r, 7.4, 10.8, 1.0, 0, 0.3);
    crate(r, 8.4, 11.2, 0.8, 0, -0.2);
    crate(r, 7.6, 10.9, 0.65, 1.0, 0.8, false);
    drum(r, -9.8, 11.5, "metal_rusty", true);
    drum(r, -10.6, 12.2);
    drum(r, 23.5, -12.5, "metal_painted_green");
    crate(r, -27.5, -3.5, 1.0, 0, 0.5);
    crate(r, 29.5, -9.5, 0.9, 0, 0.2);
    rubble(r, -5.5, -10.5, 1.4, 20, 0.35, false);
    rubble(r, 20, 11, 1.6, 22, 0.35, false);
    rubble(r, -27, -20, 1.4, 20, 0.35, false);
    // disturbed earth / grave mounds around each spawn point
    for (const w of windows) {
      const t = V(w.normal.z, 0, -w.normal.x);
      for (const s of [-1, 1]) {
        const p = w.outsidePos
          .clone()
          .addScaledVector(t, s * (1.3 + rng() * 0.5))
          .addScaledVector(w.normal, -(rng() * 1.2));
        anyGeo(
          new THREE.SphereGeometry(1, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2),
          "dirt_ground",
          r,
          p.x,
          -0.05,
          p.z,
          {
            s: V(0.55 + rng() * 0.2, 0.22, 1.0 + rng() * 0.3),
            ry: Math.atan2(w.normal.x, w.normal.z) + (rng() - 0.5) * 0.4,
            uv: "local",
          },
        );
        if (rng() < 0.6)
          box(
            "wood_planks",
            r,
            p.x + (rng() - 0.5) * 0.4,
            0.45,
            p.z + (rng() - 0.5) * 0.4,
            0.06,
            0.9,
            0.05,
            { rx: (rng() - 0.5) * 0.3, rz: (rng() - 0.5) * 0.3 },
          );
      }
    }
    // roof edge: sandbags + corrugated sheets on top of the bunker for the silhouette
    for (let i = 0; i < 14; i++) {
      const x = -22 + rng() * 46,
        z = -7.6 + rng() * 14;
      box("corrugated_metal", "roof", x, WALL_H + 0.38, z, 1.8, 0.03, 1.0, {
        ry: rng() * 3,
        rz: (rng() - 0.5) * 0.1,
      });
    }
    // barbed-wire perimeter (posts + 3 strands + coils)
    const fence = [
      V(-31, 0, -27),
      V(-4, 0, -27),
      V(-2, 0, -14),
      V(33, 0, -14),
      V(33, 0, 15),
      V(-31, 0, 15),
      V(-31, 0, -27),
    ];
    const wireGeos = [];
    for (let k = 0; k < fence.length - 1; k++) {
      const a = fence[k],
        b = fence[k + 1],
        len = a.distanceTo(b),
        n = Math.ceil(len / 3);
      let prev = null;
      for (let i = 0; i <= n; i++) {
        const p = a.clone().lerp(b, i / n);
        if (rng() < 0.08 && i > 0 && i < n) {
          prev = null;
          continue;
        } // broken sections
        const lean = (rng() - 0.5) * 0.25;
        box("wood_planks", r, p.x, 0.65, p.z, 0.09, 1.3, 0.09, {
          rx: lean,
          rz: (rng() - 0.5) * 0.25,
        });
        if (prev)
          for (const y of [0.35, 0.75, 1.15]) {
            const d = p.clone().sub(prev),
              L = d.length();
            const g = prep(
              new THREE.CylinderGeometry(0.006, 0.006, L, 3, 1, true),
            );
            const q = new THREE.Quaternion().setFromUnitVectors(
              UP,
              d.normalize(),
            );
            g.applyMatrix4(
              new THREE.Matrix4().compose(
                prev
                  .clone()
                  .add(p)
                  .multiplyScalar(0.5)
                  .setY(y - 0.04 * Math.sin(i)),
                q,
                V(1, 1, 1),
              ),
            );
            wireGeos.push(g);
          }
        prev = p;
      }
      // concertina coil along the base
      const pts = [];
      const dir = b.clone().sub(a).normalize(),
        side = V(dir.z, 0, -dir.x);
      for (let s = 0; s < len; s += 0.05) {
        const ang = s * 9;
        pts.push(
          a
            .clone()
            .addScaledVector(dir, s + Math.cos(ang) * 0.08)
            .addScaledVector(side, Math.cos(ang) * 0.35 + 0.6)
            .setY(0.38 + Math.sin(ang) * 0.35),
        );
      }
      if (pts.length > 4)
        wireGeos.push(
          prep(
            new THREE.TubeGeometry(
              new THREE.CatmullRomCurve3(pts),
              Math.min(1600, pts.length * 2),
              0.007,
              3,
              false,
            ),
          ),
        );
    }
    emit(mergeGeometries(wireGeos), "metal_rusty", r, false);
    // rocks, stumps and fallen logs in the clearing
    for (let i = 0; i < 40; i++) {
      const a = rng() * 6.28,
        d = 12 + rng() * 22;
      const x = 1 + Math.cos(a) * d * 1.3,
        z = -6.5 + Math.sin(a) * d;
      if (!isFree(x, z, 1)) continue;
      if (rng() < 0.5)
        anyGeo(
          new THREE.DodecahedronGeometry(0.3 + rng() * 0.5, 0),
          "concrete_wall",
          r,
          x,
          0,
          z,
          {
            uv: "local",
            s: V(1 + rng() * 0.6, 0.35 + rng() * 0.3, 0.8 + rng() * 0.4),
            ry: rng() * 3,
            rx: (rng() - 0.5) * 0.4,
          },
        );
      else if (rng() < 0.6)
        cyl("wood_planks", r, x, 0.2, z, 0.28, 0.34, 0.4, 9);
      else
        cyl("wood_planks", r, x, 0.2, z, 0.2, 0.22, 3 + rng() * 3, 8, {
          rz: Math.PI / 2,
          ry: rng() * 3,
        });
    }
  }

  // =========================================== FOREST (instanced pines)
  {
    const trunkGeo = new THREE.CylinderGeometry(0.12, 0.26, 1, 6);
    trunkGeo.translate(0, 0.5, 0);
    const layers = [];
    for (let i = 0; i < 6; i++) {
      const y = 0.18 + i * 0.13,
        rad = 0.36 - i * 0.055,
        h = 0.3 - i * 0.02;
      const c = new THREE.ConeGeometry(rad, h, 8, 1, true);
      c.translate(0, y + h / 2, 0);
      const p = c.attributes.position;
      for (let k = 0; k < p.count; k++) {
        if (p.getY(k) < y + 0.01) {
          p.setX(k, p.getX(k) * (1 + (Math.random() - 0.5) * 0.35));
          p.setZ(k, p.getZ(k) * (1 + (Math.random() - 0.5) * 0.35));
          p.setY(k, p.getY(k) - Math.random() * 0.04);
        }
      }
      c.computeVertexNormals();
      layers.push(prep(c));
    }
    const top = new THREE.ConeGeometry(0.06, 0.16, 6);
    top.translate(0, 0.98, 0);
    layers.push(prep(top));
    const foliageGeo = mergeGeometries(layers);
    const foliageMat = new THREE.MeshStandardMaterial({
      color: 0x14231a,
      roughness: 0.95,
      side: THREE.DoubleSide,
      flatShading: true,
    });
    const trunkMat = new THREE.MeshStandardMaterial({
      color: 0x241a13,
      roughness: 1,
    });
    const spots = [];
    const building = (x, z) => x > -38 && x < 40 && z > -35 && z < 22;
    let guard = 0;
    while (spots.length < 520 && guard++ < 20000) {
      const x = -100 + rng() * 200,
        z = -100 + rng() * 190;
      if (building(x, z)) {
        // sparse trees inside the ring but outside the fence line
        const edge = x < -33 || x > 35 || z < -29 || z > 17;
        if (!edge || rng() < 0.6) continue;
      }
      if (Math.hypot(x - 1, z + 6.5) > 105) continue;
      spots.push([x, z]);
    }
    // chunk the forest into sectors so each instanced mesh has a tight bounding sphere
    const sectors = new Map();
    for (const sp of spots) {
      const k =
        Math.floor(Math.atan2(sp[1] + 6.5, sp[0] - 1) / (Math.PI / 4)) +
        "|" +
        (Math.hypot(sp[0] - 1, sp[1] + 6.5) > 58 ? 1 : 0);
      if (!sectors.has(k)) sectors.set(k, []);
      sectors.get(k).push(sp);
    }
    const m4 = new THREE.Matrix4(),
      q = new THREE.Quaternion(),
      s = V(1, 1, 1);
    for (const [key, list] of sectors) {
      const far = key.endsWith("|1"); // outer ring: fogged silhouettes, no shadow casting
      const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, list.length);
      const fol = new THREE.InstancedMesh(foliageGeo, foliageMat, list.length);
      list.forEach(([x, z], i) => {
        const h = 11 + rng() * 9,
          w = h * (0.55 + rng() * 0.25);
        q.setFromEuler(
          new THREE.Euler(
            (rng() - 0.5) * 0.06,
            rng() * 6.28,
            (rng() - 0.5) * 0.06,
          ),
        );
        m4.compose(V(x, 0, z), q, s.set(w, h, w));
        fol.setMatrixAt(i, m4);
        m4.compose(
          V(x, 0, z),
          q,
          s.set(1 + rng() * 0.3, h * 0.35, 1 + rng() * 0.3),
        );
        trunks.setMatrixAt(i, m4);
      });
      for (const m of [trunks, fol]) {
        m.castShadow = !far;
        m.receiveShadow = !far;
        m.computeBoundingSphere();
        m.computeBoundingBox && m.computeBoundingBox();
        root.add(m);
      }
    }
  }
}

// =============================================================================================
// LIGHTING + ATMOSPHERE: sky, moon, fog, bulbs (flicker + power cascade), fire barrels, shafts, mist
// =============================================================================================
