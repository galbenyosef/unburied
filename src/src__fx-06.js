// src__fx 06 — max
// Lines 1273-1616 of readable/src__fx.pretty.js (statement-aligned).
class RigidPool {
  constructor(
    geo,
    mat,
    max,
    { radius, halfLen, colored = false, life = 10, rest = 0.35, name },
  ) {
    this.max = max;
    this.n = 0;
    this.radius = radius;
    this.halfLen = halfLen;
    this.life = life;
    this.rest = rest;
    this.p = new Float32Array(max * 3);
    this.v = new Float32Array(max * 3);
    this.q = new Float32Array(max * 4);
    this.w = new Float32Array(max * 3);
    this.age = new Float32Array(max);
    this.sc = new Float32Array(max);
    this.lf = new Float32Array(max);
    this.flag = new Uint8Array(max);
    this.kind = new Uint8Array(max);
    this.col = colored ? new Float32Array(max * 3) : null;
    this.mesh = new THREE.InstancedMesh(geo, mat, max);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    if (colored) {
      this.mesh.instanceColor = new THREE.InstancedBufferAttribute(
        new Float32Array(max * 3),
        3,
      );
      this.mesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
    }
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    this.mesh.castShadow = false;
    this.mesh.receiveShadow = true;
    this.mesh.name = name;
    this.onBounce = null;
    this.onFly = null;
  }
  spawn(pos, vel, scale, kind = 0, r = 1, g = 1, b = 1) {
    let i = this.n;
    if (i >= this.max) i = (rnd() * this.max) | 0;
    else this.n++;
    const i3 = i * 3,
      i4 = i * 4;
    this.p[i3] = pos.x;
    this.p[i3 + 1] = pos.y;
    this.p[i3 + 2] = pos.z;
    this.v[i3] = vel.x;
    this.v[i3 + 1] = vel.y;
    this.v[i3 + 2] = vel.z;
    _q.setFromEuler(_eul.set(rnd() * TAU, rnd() * TAU, rnd() * TAU));
    this.q[i4] = _q.x;
    this.q[i4 + 1] = _q.y;
    this.q[i4 + 2] = _q.z;
    this.q[i4 + 3] = _q.w;
    this.w[i3] = rr(-25, 25);
    this.w[i3 + 1] = rr(-25, 25);
    this.w[i3 + 2] = rr(-25, 25);
    this.age[i] = 0;
    this.sc[i] = scale;
    this.lf[i] = this.life * rr(0.85, 1.15);
    this.flag[i] = 0;
    this.kind[i] = kind;
    if (this.col) {
      this.col[i3] = r;
      this.col[i3 + 1] = g;
      this.col[i3 + 2] = b;
    }
    return i;
  }
  _copy(dst, src) {
    for (let k = 0; k < 3; k++) {
      this.p[dst * 3 + k] = this.p[src * 3 + k];
      this.v[dst * 3 + k] = this.v[src * 3 + k];
      this.w[dst * 3 + k] = this.w[src * 3 + k];
      if (this.col) this.col[dst * 3 + k] = this.col[src * 3 + k];
    }
    for (let k = 0; k < 4; k++) this.q[dst * 4 + k] = this.q[src * 4 + k];
    this.age[dst] = this.age[src];
    this.sc[dst] = this.sc[src];
    this.lf[dst] = this.lf[src];
    this.flag[dst] = this.flag[src];
    this.kind[dst] = this.kind[src];
  }
  update(dt) {
    let n = this.n;
    const P = this.p,
      V = this.v,
      Q = this.q,
      W = this.w;
    for (let i = 0; i < n;) {
      this.age[i] += dt;
      if (this.age[i] >= this.lf[i]) {
        n--;
        if (i !== n) this._copy(i, n);
        continue;
      }
      const i3 = i * 3,
        i4 = i * 4;
      const settled = this.flag[i] & 2;
      if (!settled) V[i3 + 1] -= 9.8 * dt;
      const dk = Math.exp(-0.25 * dt);
      V[i3] *= dk;
      V[i3 + 2] *= dk;
      P[i3] += V[i3] * dt;
      P[i3 + 1] += V[i3 + 1] * dt;
      P[i3 + 2] += V[i3 + 2] * dt;
      // integrate orientation
      _q.set(Q[i4], Q[i4 + 1], Q[i4 + 2], Q[i4 + 3]);
      const wx = W[i3],
        wy = W[i3 + 1],
        wz = W[i3 + 2];
      const wl = Math.hypot(wx, wy, wz);
      if (wl > 1e-4) {
        _q2.setFromAxisAngle(_va.set(wx / wl, wy / wl, wz / wl), wl * dt);
        _q.premultiply(_q2);
      }
      // collision with floor using oriented extent
      _vb.set(0, 1, 0).applyQuaternion(_q);
      const s = this.sc[i];
      const ext = (Math.abs(_vb.y) * this.halfLen + this.radius) * s;
      if (P[i3 + 1] < ext) {
        P[i3 + 1] = ext;
        if (V[i3 + 1] < -0.6) {
          if (!(this.flag[i] & 1) && this.onBounce)
            this.onBounce(P[i3], P[i3 + 1], P[i3 + 2], -V[i3 + 1]);
          this.flag[i] |= 1;
          V[i3 + 1] = -V[i3 + 1] * this.rest * rr(0.7, 1.1);
          V[i3] = V[i3] * 0.55 + rr(-0.3, 0.3);
          V[i3 + 2] = V[i3 + 2] * 0.55 + rr(-0.3, 0.3);
          W[i3] = W[i3] * 0.5 + rr(-8, 8);
          W[i3 + 1] *= 0.5;
          W[i3 + 2] = W[i3 + 2] * 0.5 + rr(-8, 8);
        } else {
          V[i3 + 1] = 0;
          this.flag[i] |= 2;
          const f = Math.exp(-5 * dt);
          V[i3] *= f;
          V[i3 + 2] *= f;
          const fw = Math.exp(-4 * dt);
          W[i3] *= fw;
          W[i3 + 1] *= fw;
          W[i3 + 2] *= fw;
          // topple onto side: rotate long axis toward the horizontal plane
          if (this.halfLen > this.radius) {
            _vc.set(_vb.x, 0, _vb.z);
            if (_vc.lengthSq() < 1e-6) _vc.set(1, 0, 0);
            _vc.normalize();
            _q2.setFromUnitVectors(_vb, _vc);
            _q.premultiply(_q2.slerp(_qI, 1 - Math.min(1, dt * 10)));
          }
        }
      } else if (settled && P[i3 + 1] > ext + 0.01) this.flag[i] &= ~2;
      _q.normalize();
      Q[i4] = _q.x;
      Q[i4 + 1] = _q.y;
      Q[i4 + 2] = _q.z;
      Q[i4 + 3] = _q.w;
      if (this.onFly && !(this.flag[i] & 2))
        this.onFly(i, P[i3], P[i3 + 1], P[i3 + 2], V[i3], V[i3 + 1], V[i3 + 2]);
      i++;
    }
    this.n = n;
    const im = this.mesh.instanceMatrix.array;
    for (let i = 0; i < n; i++) {
      const i3 = i * 3,
        i4 = i * 4;
      const left = this.lf[i] - this.age[i];
      const s = this.sc[i] * (left < 1 ? left : 1);
      _q.set(this.q[i4], this.q[i4 + 1], this.q[i4 + 2], this.q[i4 + 3]);
      _m4.compose(
        _va.set(
          this.p[i3],
          this.p[i3 + 1] - (left < 1 ? (1 - left) * this.radius * s : 0),
          this.p[i3 + 2],
        ),
        _q,
        _vs.set(s, s, s),
      );
      _m4.toArray(im, i * 16);
      if (this.col) {
        const ic = this.mesh.instanceColor.array;
        ic[i3] = this.col[i3];
        ic[i3 + 1] = this.col[i3 + 1];
        ic[i3 + 2] = this.col[i3 + 2];
      }
    }
    this.mesh.count = n;
    this.mesh.visible = n > 0;
    this.mesh.instanceMatrix.clearUpdateRanges();
    this.mesh.instanceMatrix.addUpdateRange(0, Math.max(1, n) * 16);
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.col) {
      this.mesh.instanceColor.clearUpdateRanges();
      this.mesh.instanceColor.addUpdateRange(0, Math.max(1, n) * 3);
      this.mesh.instanceColor.needsUpdate = true;
    }
  }
}
const _eul = new THREE.Euler(),
  _qI = new THREE.Quaternion();

/* ========================================================= fireball ==== */
const NOISE3 = /* glsl */ `
vec3 mod289(vec3 x){return x-floor(x*(1.0/289.0))*289.0;} vec4 mod289(vec4 x){return x-floor(x*(1.0/289.0))*289.0;}
vec4 permute(vec4 x){return mod289(((x*34.0)+1.0)*x);} vec4 taylorInvSqrt(vec4 r){return 1.79284291400159-0.85373472095314*r;}
float snoise(vec3 v){const vec2 C=vec2(1.0/6.0,1.0/3.0);const vec4 D=vec4(0.0,0.5,1.0,2.0);
vec3 i=floor(v+dot(v,C.yyy));vec3 x0=v-i+dot(i,C.xxx);vec3 g=step(x0.yzx,x0.xyz);vec3 l=1.0-g;vec3 i1=min(g.xyz,l.zxy);vec3 i2=max(g.xyz,l.zxy);
vec3 x1=x0-i1+C.xxx;vec3 x2=x0-i2+C.yyy;vec3 x3=x0-D.yyy;i=mod289(i);
vec4 p=permute(permute(permute(i.z+vec4(0.0,i1.z,i2.z,1.0))+i.y+vec4(0.0,i1.y,i2.y,1.0))+i.x+vec4(0.0,i1.x,i2.x,1.0));
float n_=0.142857142857;vec3 ns=n_*D.wyz-D.xzx;vec4 j=p-49.0*floor(p*ns.z*ns.z);vec4 x_=floor(j*ns.z);vec4 y_=floor(j-7.0*x_);
vec4 x=x_*ns.x+ns.yyyy;vec4 y=y_*ns.x+ns.yyyy;vec4 h=1.0-abs(x)-abs(y);vec4 b0=vec4(x.xy,y.xy);vec4 b1=vec4(x.zw,y.zw);
vec4 s0=floor(b0)*2.0+1.0;vec4 s1=floor(b1)*2.0+1.0;vec4 sh=-step(h,vec4(0.0));vec4 a0=b0.xzyw+s0.xzyw*sh.xxyy;vec4 a1=b1.xzyw+s1.xzyw*sh.zzww;
vec3 p0=vec3(a0.xy,h.x);vec3 p1=vec3(a0.zw,h.y);vec3 p2=vec3(a1.xy,h.z);vec3 p3=vec3(a1.zw,h.w);
vec4 norm=taylorInvSqrt(vec4(dot(p0,p0),dot(p1,p1),dot(p2,p2),dot(p3,p3)));p0*=norm.x;p1*=norm.y;p2*=norm.z;p3*=norm.w;
vec4 m=max(0.6-vec4(dot(x0,x0),dot(x1,x1),dot(x2,x2),dot(x3,x3)),0.0);m=m*m;
return 42.0*dot(m*m,vec4(dot(p0,x0),dot(p1,x1),dot(p2,x2),dot(p3,x3)));}
`;
function makeFireballMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uSeed: { value: 0 },
      uHeat: { value: 1 },
      uErode: { value: 0 },
      uAmp: { value: 0.25 },
      uOpacity: { value: 1 },
    },
    vertexShader:
      NOISE3 +
      `
      uniform float uTime, uSeed, uAmp; varying vec3 vN; varying vec3 vN2; varying vec3 vP; varying vec3 vV; varying vec3 vLocal;
      vec3 disp(vec3 n){
        // billowy displacement: smooth low octave + abs-noise detail lobes
        float d = (snoise(n * 1.3 + vec3(uSeed, uSeed * 0.7, -uTime * 0.9)) * 0.5 + 0.5) * 0.7
                + abs(snoise(n * 3.1 + vec3(-uSeed, uTime * 0.7, 0.0))) * 0.3
                + abs(snoise(n * 6.5 + vec3(uSeed * 1.3, 0.0, uTime))) * 0.1;
        return n * (1.0 + (d - 0.45) * uAmp * 1.4);
      }
      void main(){
        vec3 n = normalize(position);
        vec3 t1 = normalize(cross(n, abs(n.y) < 0.95 ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0)));
        vec3 t2 = cross(n, t1);
        vec3 p = disp(n);
        vec3 pa = disp(normalize(n + t1 * 0.03)), pb = disp(normalize(n + t2 * 0.03));
        vec3 N = normalize(cross(pa - p, pb - p)); if (dot(N, n) < 0.0) N = -N;   // smooth displaced normal
        vLocal = p;
        vec4 wp = modelMatrix * vec4(p, 1.0);
        vP = wp.xyz; vN = normalize(mat3(modelMatrix) * n); vN2 = normalize(mat3(modelMatrix) * N); vV = normalize(cameraPosition - wp.xyz);
        gl_Position = projectionMatrix * viewMatrix * wp;
      }`,
    fragmentShader:
      NOISE3 +
      `
      uniform float uTime, uSeed, uHeat, uErode, uOpacity; varying vec3 vN; varying vec3 vN2; varying vec3 vP; varying vec3 vV; varying vec3 vLocal;
      vec3 ramp(float h){
        h = clamp(h, 0.0, 1.4);
        vec3 c = mix(vec3(0.02,0.012,0.01), vec3(0.55,0.06,0.01), smoothstep(0.0,0.25,h));
        c = mix(c, vec3(1.3,0.32,0.04), smoothstep(0.2,0.55,h));
        c = mix(c, vec3(2.4,1.15,0.25), smoothstep(0.5,0.85,h));
        c = mix(c, vec3(3.6,2.6,1.4), smoothstep(0.85,1.25,h));
        return c;
      }
      void main(){
        float f = clamp(dot(normalize(vN), vV), 0.0, 1.0);          // smooth sphere facing -> heat (gaseous look)
        float fs = clamp(dot(normalize(vN2), vV), 0.0, 1.0);        // displaced facing -> soft lobe silhouettes
        vec3 q = vLocal * 2.2 + vec3(uSeed, -uTime * 1.6, uSeed * 0.3);
        float n1 = snoise(q) * 0.5 + 0.5;
        float n2 = snoise(q * 2.3 + 4.0) * 0.5 + 0.5;
        float n3 = snoise(q * 5.1 - 2.0) * 0.5 + 0.5;
        float n = n1 * 0.55 + n2 * 0.3 + n3 * 0.15;
        float cells = 1.0 - abs(snoise(q * 1.7 + 9.0));            // bright ridges between billows
        float heat = uHeat * (0.3 + 0.8 * f) * (0.35 + 0.75 * n + 0.35 * cells * cells);
        float mask = n * 0.7 + f * 0.5 - 0.15;                     // erodes from the limb inward
        float a = smoothstep(uErode, uErode + 0.22, mask) * uOpacity;
        a *= smoothstep(0.0, 0.3, f + 0.05) * smoothstep(0.0, 0.35, fs);
        if (a < 0.004) discard;
        vec3 col = ramp(heat);
        // cooled regions read as sooty smoke, not holes
        col = mix(vec3(0.035, 0.03, 0.026) * (0.6 + 0.8 * n), col, smoothstep(0.12, 0.5, heat));
        gl_FragColor = vec4(col, a);
      }`,
    transparent: true,
    depthWrite: false,
  });
}

/* ========================================================= power-ups ==== */
function nonIdx(g) {
  const r = g.index ? g.toNonIndexed() : g;
  if (!r.getAttribute("uv"))
    r.setAttribute(
      "uv",
      new THREE.BufferAttribute(
        new Float32Array(r.getAttribute("position").count * 2),
        2,
      ),
    );
  return r;
}
function place(g, x, y, z, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) {
  _m4.compose(
    _va.set(x, y, z),
    _q.setFromEuler(_eul.set(rx, ry, rz)),
    _vs.set(sx, sy, sz),
  );
  g.applyMatrix4(_m4);
  return nonIdx(g);
}
function strokeShape(pts, w) {
  // polyline -> closed outline polygon of width w (miter joins)
  const L = [],
    R = [];
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i],
      a = pts[Math.max(0, i - 1)],
      b = pts[Math.min(pts.length - 1, i + 1)];
    let tx = b[0] - a[0],
      ty = b[1] - a[1];
    const tl = Math.hypot(tx, ty) || 1;
    tx /= tl;
    ty /= tl;
    let nx = -ty,
      ny = tx,
      sc = 1;
    if (i > 0 && i < pts.length - 1) {
      let t0x = p[0] - a[0],
        t0y = p[1] - a[1];
      const l0 = Math.hypot(t0x, t0y) || 1;
      t0x /= l0;
      t0y /= l0;
      sc = 1 / Math.max(0.35, -t0y * nx + t0x * ny);
    }
    L.push(
      new THREE.Vector2(p[0] + nx * w * 0.5 * sc, p[1] + ny * w * 0.5 * sc),
    );
    R.push(
      new THREE.Vector2(p[0] - nx * w * 0.5 * sc, p[1] - ny * w * 0.5 * sc),
    );
  }
  return new THREE.Shape(L.concat(R.reverse()));
}
