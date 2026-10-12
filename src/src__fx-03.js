// src__fx 03 — math
// Lines 498-854 of readable/src__fx.pretty.js (statement-aligned).
function buildDecalAtlas() {
  const col = canvasOf(),
    nrm = canvasOf(),
    prp = canvasOf();
  const H = { h: new Float32Array(ASZ * ASZ), p: prp.img.data };
  const polar = (u, v) => [Math.hypot(u, v), Math.atan2(v, u)];
  // bullet holes are painted in a +-0.6 domain so the crater fills most of the quad
  const zoom = (k, fn) => (u, v, o) => {
    fn(u * k, v * k, o);
    o[3] *= sstep(1, 0.88, Math.hypot(u, v));
  };

  // ---- bullet hole: concrete / plaster
  paintCell(
    col.img,
    0,
    zoom(0.62, (u, v, o) => {
      const [r, a] = polar(u, v);
      const Rh = 0.1 * (0.8 + 0.5 * angN(a, 2, 11));
      const Rc = 0.36 * (0.6 + 0.8 * angN(a, 1.4, 12));
      const sp = fbm(u * 18, v * 18, 13, 3);
      let crack = 0;
      for (let k = 0; k < 6; k++) {
        const ca = h2(k, 1, 14) * TAU,
          len = 0.45 + 0.45 * h2(k, 2, 14);
        const wig = ca + (vn(r * 7, k, 15) - 0.5) * 0.35;
        let da = Math.abs(((a - wig + Math.PI * 3) % TAU) - Math.PI);
        const w = (0.018 * (1 - r / len)) / Math.max(r, 0.05);
        if (r < len)
          crack = Math.max(crack, sstep(w * 1.4, w * 0.3, da) * (1 - r / len));
      }
      if (r < Rh) {
        o[0] = o[1] = o[2] = 0.03;
        o[3] = 1;
        o[4] = -1;
      } else if (r < Rc) {
        const t = (r - Rh) / (Rc - Rh);
        const g = 0.36 + 0.18 * sp - 0.16 * (1 - t);
        o[0] = g * 1.02;
        o[1] = g;
        o[2] = g * 0.95;
        o[3] = 1;
        o[4] = -0.7 * (1 - t) ** 1.4 + (sp - 0.5) * 0.15;
      } else {
        const halo =
          sstep(Rc + 0.4, Rc, r) * (0.3 + 0.5 * fbm(u * 6, v * 6, 16, 4));
        o[0] = o[1] = o[2] = 0.14;
        o[3] = halo * 0.55;
        o[4] = 0;
      }
      if (crack > 0.05) {
        o[0] = o[0] * (1 - crack) + 0.05 * crack;
        o[1] = o[1] * (1 - crack) + 0.05 * crack;
        o[2] = o[2] * (1 - crack) + 0.05 * crack;
        o[3] = Math.max(o[3], crack);
        o[4] -= crack * 0.3;
      }
      o[3] *= sstep(1, 0.9, r);
      o[5] = 0.95;
    }),
    H,
  );
  // ---- wood: torn fibres along grain (x)
  paintCell(
    col.img,
    1,
    zoom(0.62, (u, v, o) => {
      const [r, a] = polar(u * 0.85, v * 1.3);
      const Rh = 0.1 * (0.8 + 0.5 * angN(a, 2, 21));
      const fib = fbm(u * 2.5, v * 34, 22, 4);
      const Rr =
        0.17 +
        0.32 * Math.pow(Math.abs(Math.cos(a)), 6) * (0.35 + fib) +
        0.08 * angN(a, 3, 23);
      const grain = fbm(u * 3, v * 40, 24, 3);
      if (r < Rh) {
        o[0] = 0.03;
        o[1] = 0.02;
        o[2] = 0.012;
        o[3] = 1;
        o[4] = -1;
      } else if (r < Rr) {
        const t = (r - Rh) / (Rr - Rh);
        const g = 0.3 + 0.2 * grain + 0.08 * t;
        o[0] = g;
        o[1] = g * 0.74;
        o[2] = g * 0.48;
        o[3] = 1 - t * t * 0.55;
        o[4] = 0.35 * (grain - 0.5) - 0.5 * (1 - t);
      } else {
        o[0] = 0.07;
        o[1] = 0.05;
        o[2] = 0.03;
        o[3] = sstep(Rr + 0.18, Rr, r) * 0.4 * (0.5 + grain);
        o[4] = 0;
      }
      o[5] = 0.85;
    }),
    H,
  );
  // ---- metal: dented hole, bright raised rim, flaked paint -> bare steel
  paintCell(
    col.img,
    2,
    zoom(0.62, (u, v, o) => {
      const [r, a] = polar(u, v);
      const Rh = 0.085 * (0.9 + 0.2 * angN(a, 2, 31));
      const Rr = 0.16 * (0.9 + 0.2 * angN(a, 2, 32));
      const Rf = 0.34 * (0.5 + angN(a, 1.7, 33));
      const n = fbm(u * 20, v * 20, 34, 3);
      if (r < Rh) {
        o[0] = o[1] = o[2] = 0.02;
        o[3] = 1;
        o[4] = -1;
        o[5] = 0.6;
        o[6] = 0.2;
      } else if (r < Rr) {
        const t = (r - Rh) / (Rr - Rh);
        o[0] = o[1] = o[2] = 0.42 + 0.12 * n;
        o[3] = 1;
        o[4] = 0.8 * Math.sin(t * Math.PI);
        o[5] = 0.3;
        o[6] = 1;
      } else if (r < Rf) {
        const t = (r - Rr) / (Rf - Rr);
        o[0] = o[1] = o[2] = 0.3 + 0.12 * n - 0.1 * t;
        o[3] = 1;
        o[4] = 0.1 * (1 - t);
        o[5] = 0.45 + 0.2 * n;
        o[6] = 1;
      } else {
        o[0] = 0.06;
        o[1] = 0.05;
        o[2] = 0.04;
        o[3] = sstep(Rf + 0.2, Rf, r) * 0.45;
        o[5] = 0.8;
      }
      o[3] *= sstep(1, 0.9, r);
    }),
    H,
  );
  // ---- dirt / generic crater
  paintCell(
    col.img,
    3,
    zoom(0.8, (u, v, o) => {
      const [r, a] = polar(u, v);
      const n = fbm(u * 8, v * 8, 41, 4);
      const R = 0.4 * (0.7 + 0.6 * angN(a, 2, 42));
      o[0] = 0.07 + 0.08 * n;
      o[1] = o[0] * 0.8;
      o[2] = o[0] * 0.6;
      o[3] = sstep(R + 0.3, R * 0.6, r) * (0.65 + 0.35 * n);
      o[4] = -0.8 * sstep(R, 0, r) + (n - 0.5) * 0.4;
      o[5] = 1;
    }),
    H,
  );
  // ---- blood splats
  const bloodCell = (idx, seed, mode) => {
    const dirA = h2(1, 1, seed) * TAU,
      dx = Math.cos(dirA),
      dy = Math.sin(dirA);
    const sats = [];
    const nS = mode === "drops" ? 34 : 22;
    for (let i = 0; i < nS; i++) {
      const along =
        mode === "drops" ? rrS(i, 1) * 1.6 - 0.8 : 0.25 + 0.6 * rrS(i, 1);
      const side =
        (rrS(i, 2) - 0.5) * (mode === "drops" ? 1.6 : 0.7) * (0.4 + along);
      const x = mode === "drops" ? along : dx * along - dy * side,
        y = mode === "drops" ? side : dy * along + dx * side;
      sats.push([
        x,
        y,
        (mode === "drops" ? 0.02 : 0.015) +
          0.05 * rrS(i, 3) ** 2 * (1.2 - Math.abs(along)),
        1 + rrS(i, 4) * 2.2 * (mode === "drops" ? 0 : 1),
      ]);
    }
    function rrS(i, k) {
      return h2(i, k, seed);
    }
    paintCell(
      col.img,
      idx,
      (u, v, o) => {
        const [r, a] = polar(u, v);
        let m = -1;
        if (mode === "wall") {
          // blob at top + gravity runs downward (canvas +v)
          const R = 0.28 * (0.75 + 0.5 * angN(a, 2.2, seed + 1));
          m = (R - Math.hypot(u, v + 0.35)) / R;
          for (let k = 0; k < 6; k++) {
            const x = -0.28 + 0.56 * h2(k, 5, seed),
              len = 0.25 + 0.6 * h2(k, 6, seed),
              w = 0.018 + 0.02 * h2(k, 7, seed);
            const yy = v + 0.35;
            if (yy > 0 && yy < len) {
              const ww = w * (1 - (0.5 * yy) / len);
              m = Math.max(m, (ww - Math.abs(u - x)) / ww);
            }
            const bd = Math.hypot(u - x, v + 0.35 - len) / (w * 1.5);
            m = Math.max(m, 1 - bd);
          }
        } else if (mode !== "drops") {
          const spike = Math.pow(angN(a, 6, seed + 2, 3), 4) * 0.8;
          const R = 0.3 * (0.7 + 0.6 * angN(a, 1.8, seed + 1)) + spike * 0.35;
          m = (R - r) / R;
        }
        for (const [x, y, rad, st] of sats) {
          // streaked satellite droplets pointing away from impact
          const ux = u - x,
            uy = v - y;
          const al = (ux * dx + uy * dy) / st,
            pe = -ux * dy + uy * dx;
          const d =
            mode === "drops"
              ? Math.hypot(ux, uy) / rad
              : Math.hypot(al, pe) / rad;
          if (d < 1.4) m = Math.max(m, 1 - d);
        }
        const n = fbm(u * 6, v * 6, seed + 3, 4);
        const inside = sstep(-0.02, 0.06, m);
        const ring = sstep(0.28, 0.02, m); // coffee-ring dark edge
        o[0] = 0.26 - 0.13 * ring + 0.07 * (n - 0.5);
        o[1] = 0.012;
        o[2] = 0.012 + 0.006 * n;
        o[3] = inside * 0.96;
        o[4] = inside * (0.25 + 0.2 * sstep(0, 0.5, m));
        o[5] = 0.12 + 0.35 * ring * n;
        o[3] *= sstep(1, 0.92, r);
      },
      H,
    );
  };
  bloodCell(4, 401, "splat");
  bloodCell(5, 402, "splat");
  bloodCell(6, 403, "splat");
  bloodCell(7, 404, "splat");
  bloodCell(8, 405, "wall");
  bloodCell(9, 406, "drops");
  // ---- sandbag: dark hole, frayed burlap, sand spill
  paintCell(
    col.img,
    10,
    zoom(0.62, (u, v, o) => {
      const [r, a] = polar(u, v);
      const weave = Math.sin(u * 90) * Math.sin(v * 90) * 0.5 + 0.5;
      const R = 0.14 * (0.8 + 0.5 * angN(a, 3, 101));
      const fray = sstep(R + 0.12, R, r) * (0.5 + 0.5 * weave);
      if (r < R) {
        o[0] = 0.05;
        o[1] = 0.04;
        o[2] = 0.03;
        o[3] = 1;
        o[4] = -1;
      } else {
        const sand = fbm(u * 25, v * 25, 102, 3);
        o[0] = 0.55 + 0.2 * sand;
        o[1] = o[0] * 0.85;
        o[2] = o[0] * 0.6;
        o[3] = Math.max(fray, sstep(0.55, R, r) * 0.5 * sstep(0.45, 0.7, sand));
        o[4] = fray * 0.2;
      }
      o[3] *= sstep(1, 0.9, r);
      o[5] = 1;
    }),
    H,
  );
  // ---- scorch (two variants) — soot with radial streaks, ashy centre
  const scorch = (idx, seed, green) =>
    paintCell(
      col.img,
      idx,
      (u, v, o) => {
        const [r, a] = polar(u, v);
        const n = fbm(u * 4, v * 4, seed, 5);
        const rays = Math.pow(angN(a, 10, seed + 1, 3), 2);
        const d = sstep(0.98, 0.1, r * (0.75 + 0.5 * n) - rays * 0.25);
        const ash =
          sstep(0.4, 0.0, r) *
          sstep(0.45, 0.7, fbm(u * 12, v * 12, seed + 2, 3));
        const g = 0.025 + ash * 0.12;
        o[0] = g;
        o[1] = green ? g * 1.6 + 0.02 * d : g * 0.95;
        o[2] = g * 0.9;
        o[3] = d * 0.93 * sstep(1, 0.9, r);
        o[4] = -0.3 * sstep(0.5, 0, r) + (n - 0.5) * 0.3;
        o[5] = 1;
      },
      H,
    );
  scorch(11, 501);
  scorch(12, 502);
  scorch(14, 503, true);
  // ---- disturbed earth (zombie rising)
  paintCell(
    col.img,
    13,
    (u, v, o) => {
      const [r, a] = polar(u, v);
      const n = fbm(u * 5, v * 5, 601, 5),
        cl = vn(u * 14, v * 14, 602);
      const R = 0.7 * (0.75 + 0.4 * angN(a, 2, 603));
      o[0] = 0.13 + 0.12 * n + 0.08 * cl;
      o[1] = o[0] * 0.78;
      o[2] = o[0] * 0.55;
      o[3] = sstep(R, R * 0.6, r + (cl - 0.5) * 0.2);
      o[4] = sstep(R, 0.2, r) * 0.6 * (0.3 + cl) - sstep(0.25, 0, r) * 0.8;
      o[5] = 1;
    },
    H,
  );
  // ---- flesh wound hole
  paintCell(
    col.img,
    15,
    (u, v, o) => {
      const r = Math.hypot(u, v);
      o[0] = 0.12;
      o[1] = 0.01;
      o[2] = 0.01;
      o[3] = sstep(0.5, 0.2, r);
      o[4] = -sstep(0.3, 0, r);
      o[5] = 0.2;
    },
    H,
  );

  col.ctx.putImageData(col.img, 0, 0);
  // normal map from height (per cell, clamped at cell edges)
  const nd = nrm.img.data,
    hh = H.h;
  const str = 5.0;
  for (let y = 0; y < ASZ; y++)
    for (let x = 0; x < ASZ; x++) {
      const cx0 = x - (x % CELL),
        cy0 = y - (y % CELL);
      const xl = Math.max(cx0, x - 1),
        xr = Math.min(cx0 + CELL - 1, x + 1);
      const yu = Math.max(cy0, y - 1),
        yd = Math.min(cy0 + CELL - 1, y + 1);
      const nx = -(hh[y * ASZ + xr] - hh[y * ASZ + xl]) * str;
      const ny = (hh[yd * ASZ + x] - hh[yu * ASZ + x]) * str;
      const l = Math.hypot(nx, ny, 1);
      const k = (y * ASZ + x) * 4;
      nd[k] = ((nx / l) * 0.5 + 0.5) * 255;
      nd[k + 1] = ((ny / l) * 0.5 + 0.5) * 255;
      nd[k + 2] = ((1 / l) * 0.5 + 0.5) * 255;
      nd[k + 3] = 255;
    }
  nrm.ctx.putImageData(nrm.img, 0, 0);
  prp.ctx.putImageData(prp.img, 0, 0);
  return { col: col.c, nrm: nrm.c, prp: prp.c };
}

