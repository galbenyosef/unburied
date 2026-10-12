// src__fx 05 — three
// Lines 1010-1272 of readable/src__fx.pretty.js (statement-aligned).
class ParticlePool {
  constructor(max, map, additive, fx) {
    this.max = max;
    this.n = 0;
    this.fx = fx;
    this.d = new Float32Array(max * ST);
    this.keys = new Uint32Array(max);
    const g = new THREE.InstancedBufferGeometry();
    const base = new THREE.PlaneGeometry(1, 1);
    g.index = base.index;
    g.setAttribute("position", base.getAttribute("position"));
    g.setAttribute("uv", base.getAttribute("uv"));
    const mk = (n) => {
      const a = new THREE.InstancedBufferAttribute(
        new Float32Array(max * n),
        n,
      );
      a.setUsage(THREE.DynamicDrawUsage);
      return a;
    };
    this.aPos = mk(4);
    this.aCol = mk(4);
    this.aMisc = mk(4);
    this.aVel = mk(3);
    g.setAttribute("iPos", this.aPos);
    g.setAttribute("iCol", this.aCol);
    g.setAttribute("iMisc", this.aMisc);
    g.setAttribute("iVel", this.aVel);
    g.instanceCount = 0;
    this.geo = g;
    this.mat = new THREE.ShaderMaterial({
      uniforms: {
        uMap: { value: map },
        uCamWorld: fx._uCamWorld,
        uAmb: fx._uAmb,
        uLP: fx._uLP,
        uLC: fx._uLC,
        uEmCol: { value: new THREE.Color(1.0, 0.42, 0.12) },
      },
      vertexShader: PART_VS,
      fragmentShader: PART_FS,
      defines: additive ? { ADDITIVE: 1 } : {},
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    this.mesh = new THREE.Mesh(g, this.mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = additive ? 12 : 10;
    this.mesh.name = additive ? "fx.additive" : "fx.alpha";
    this.sorted = !additive;
  }
  // returns float offset of the new particle (always succeeds: recycles when full)
  emit(x, y, z, vx, vy, vz, life, s0, s1, frame) {
    let i = this.n;
    if (i >= this.max) i = (rnd() * this.max) | 0;
    else this.n++;
    const d = this.d,
      o = i * ST;
    d[o + PX] = x;
    d[o + PY] = y;
    d[o + PZ] = z;
    d[o + VX] = vx;
    d[o + VY] = vy;
    d[o + VZ] = vz;
    d[o + AGE] = 0;
    d[o + LIFE] = life;
    d[o + S0] = s0;
    d[o + S1] = s1;
    d[o + ROT] = rnd() * TAU;
    d[o + SPIN] = 0;
    d[o + R0] = d[o + G0] = d[o + B0] = d[o + A0] = 1;
    d[o + R1] = d[o + G1] = d[o + B1] = 1;
    d[o + GRAV] = 0;
    d[o + DRAG] = 0;
    d[o + FRAME] = frame;
    d[o + STR] = 0;
    d[o + EM] = 0;
    d[o + BOUNCE] = NOFLOOR;
    d[o + EVT] = 0;
    d[o + FIN] = 0.05;
    d[o + FOUT] = 0.55;
    d[o + RAMP] = 0;
    d[o + SPOW] = 1;
    d[o + TURB] = 0;
    d[o + SOFT] = 0;
    return o;
  }
  col(o, r, g, b, a = 1, r1 = r, g1 = g, b1 = b) {
    const d = this.d;
    d[o + R0] = r;
    d[o + G0] = g;
    d[o + B0] = b;
    d[o + A0] = a;
    d[o + R1] = r1;
    d[o + G1] = g1;
    d[o + B1] = b1;
    return o;
  }
  phys(o, grav, drag, bounce = NOFLOOR) {
    const d = this.d;
    d[o + GRAV] = grav;
    d[o + DRAG] = drag;
    d[o + BOUNCE] = bounce;
    return o;
  }
  fade(o, fin, fout) {
    this.d[o + FIN] = fin;
    this.d[o + FOUT] = fout;
    return o;
  }

  sim(dt) {
    const d = this.d;
    let n = this.n;
    const fx = this.fx;
    for (let i = 0; i < n;) {
      const o = i * ST;
      const age = d[o + AGE] + dt;
      if (age >= d[o + LIFE]) {
        n--;
        if (i !== n) d.copyWithin(o, n * ST, n * ST + ST);
        continue;
      }
      d[o + AGE] = age;
      const dr = d[o + DRAG];
      if (dr > 0) {
        const k = Math.exp(-dr * dt);
        d[o + VX] *= k;
        d[o + VY] *= k;
        d[o + VZ] *= k;
      }
      const tb = d[o + TURB];
      if (tb > 0) {
        d[o + VX] += (rnd() - 0.5) * tb * dt;
        d[o + VY] += (rnd() - 0.5) * tb * dt;
        d[o + VZ] += (rnd() - 0.5) * tb * dt;
      }
      d[o + VY] -= d[o + GRAV] * dt;
      d[o + PX] += d[o + VX] * dt;
      d[o + PY] += d[o + VY] * dt;
      d[o + PZ] += d[o + VZ] * dt;
      d[o + ROT] += d[o + SPIN] * dt;
      const b = d[o + BOUNCE];
      if (b > -1.5 && d[o + PY] < 0.006) {
        if (b < -0.5) {
          d[o + AGE] = d[o + LIFE];
        } else if (b === STICK) {
          if (d[o + EVT] === 1) {
            fx._bloodLand(d[o + PX], d[o + PZ], d[o + S0]);
            d[o + AGE] = d[o + LIFE];
          }
          d[o + PY] = 0.006;
          d[o + VX] = d[o + VY] = d[o + VZ] = 0;
          d[o + SPIN] = 0;
          d[o + GRAV] = 0;
        } else {
          d[o + PY] = 0.006;
          if (d[o + VY] < -0.4) {
            d[o + VY] = -d[o + VY] * b;
            d[o + VX] *= 0.6;
            d[o + VZ] *= 0.6;
            d[o + SPIN] *= 0.5;
          } else {
            d[o + VY] = 0;
            const k = Math.exp(-6 * dt);
            d[o + VX] *= k;
            d[o + VZ] *= k;
            d[o + SPIN] *= k;
          }
        }
      }
      i++;
    }
    this.n = n;
  }

  write(camPos, camFwd) {
    const d = this.d,
      n = this.n;
    const P = this.aPos.array,
      C = this.aCol.array,
      M = this.aMisc.array,
      V = this.aVel.array;
    const keys = this.keys;
    if (this.sorted) {
      keys.fill(0xffffffff);
      for (let i = 0; i < n; i++) {
        const o = i * ST;
        const dep =
          (d[o + PX] - camPos.x) * camFwd.x +
          (d[o + PY] - camPos.y) * camFwd.y +
          (d[o + PZ] - camPos.z) * camFwd.z;
        const q = clamp(Math.round(dep * 4000) + 8, 0, 1048575);
        keys[i] = ((1048575 - q) * 4096 + i) >>> 0; // farthest first
      }
      keys.sort();
    }
    for (let j = 0; j < n; j++) {
      const i = this.sorted ? keys[j] & 4095 : j,
        o = i * ST;
      const t = d[o + AGE] / d[o + LIFE];
      const sp = d[o + SPOW];
      const size =
        d[o + S0] +
        (d[o + S1] - d[o + S0]) * (sp === 1 ? t : 1 - Math.pow(1 - t, sp));
      const fin = d[o + FIN],
        fout = d[o + FOUT];
      let a = d[o + A0] * (fin > 0 ? Math.min(1, t / fin) : 1);
      if (t > fout) a *= 1 - sstep(0, 1, (t - fout) / (1 - fout));
      let r, g, b;
      const ri = d[o + RAMP];
      if (ri > 0) {
        const c = sampleRamp(ri, t);
        r = c[0] * d[o + R0];
        g = c[1] * d[o + G0];
        b = c[2] * d[o + B0];
      } else {
        r = d[o + R0] + (d[o + R1] - d[o + R0]) * t;
        g = d[o + G0] + (d[o + G1] - d[o + G0]) * t;
        b = d[o + B0] + (d[o + B1] - d[o + B0]) * t;
      }
      const k4 = j * 4,
        k3 = j * 3;
      P[k4] = d[o + PX];
      P[k4 + 1] = d[o + PY];
      P[k4 + 2] = d[o + PZ];
      P[k4 + 3] = size;
      C[k4] = r;
      C[k4 + 1] = g;
      C[k4 + 2] = b;
      C[k4 + 3] = a;
      const mode = d[o + FRAME] >= 32 ? 2 : d[o + FRAME] >= 16 ? 1 : 0;
      M[k4] = d[o + ROT];
      M[k4 + 1] = d[o + FRAME];
      M[k4 + 2] = mode === 1 ? d[o + STR] : d[o + SOFT];
      M[k4 + 3] = d[o + EM] * (1 - t) * (1 - t);
      V[k3] = d[o + VX];
      V[k3 + 1] = d[o + VY];
      V[k3 + 2] = d[o + VZ];
    }
    for (const at of [this.aPos, this.aCol, this.aMisc, this.aVel]) {
      at.clearUpdateRanges();
      at.addUpdateRange(0, Math.max(1, n) * at.itemSize);
      at.needsUpdate = true;
    }
    this.geo.instanceCount = n;
    this.mesh.visible = n > 0;
  }
}

/* ==================================================== rigid debris ==== */
const _q = new THREE.Quaternion(),
  _q2 = new THREE.Quaternion(),
  _m4 = new THREE.Matrix4();
const _va = new THREE.Vector3(),
  _vb = new THREE.Vector3(),
  _vc = new THREE.Vector3(),
  _vs = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0),
  ZAX = new THREE.Vector3(0, 0, 1);

