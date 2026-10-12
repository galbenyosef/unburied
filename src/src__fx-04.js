// src__fx 04 — size
// Lines 855-1009 of readable/src__fx.pretty.js (statement-aligned).
function glowCanvas(size = 128) {
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const ctx = c.getContext("2d");
  const g = ctx.createRadialGradient(
    size / 2,
    size / 2,
    0,
    size / 2,
    size / 2,
    size / 2,
  );
  g.addColorStop(0, "rgba(255,255,255,1)");
  g.addColorStop(0.15, "rgba(255,255,255,0.55)");
  g.addColorStop(0.4, "rgba(255,255,255,0.16)");
  g.addColorStop(0.7, "rgba(255,255,255,0.04)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  return c;
}

/* ========================================================= particles ==== */
// per-particle sim layout (floats)
const PX = 0,
  PY = 1,
  PZ = 2,
  VX = 3,
  VY = 4,
  VZ = 5,
  AGE = 6,
  LIFE = 7,
  S0 = 8,
  S1 = 9,
  ROT = 10,
  SPIN = 11,
  R0 = 12,
  G0 = 13,
  B0 = 14,
  A0 = 15,
  R1 = 16,
  G1 = 17,
  B1 = 18,
  GRAV = 19,
  DRAG = 20,
  FRAME = 21,
  STR = 22,
  EM = 23,
  BOUNCE = 24,
  EVT = 25,
  FIN = 26,
  FOUT = 27,
  RAMP = 28,
  SPOW = 29,
  TURB = 30,
  SOFT = 31,
  ST = 32;
const NOFLOOR = -2,
  DIE = -1,
  STICK = 0;
const M_BILL = 0,
  M_STRETCH = 16,
  M_FLAT = 32;

// colour ramps (t, r, g, b) — HDR
const RAMPS = [
  null,
  [
    0, 2.6, 2.0, 1.3, 0.1, 2.2, 1.0, 0.3, 0.28, 1.2, 0.38, 0.07, 0.5, 0.4, 0.09,
    0.015, 0.75, 0.07, 0.025, 0.012, 1, 0.02, 0.012, 0.01,
  ], // 1 fire
  [0, 14, 9, 4.5, 0.25, 7, 2.6, 0.6, 0.65, 1.8, 0.35, 0.06, 1, 0.3, 0.05, 0.0], // 2 spark
  [0, 7, 14, 7, 0.2, 1.4, 9, 2.0, 0.6, 0.25, 2.6, 0.6, 1, 0.0, 0.35, 0.12], // 3 aether
  [0, 12, 11, 6, 0.3, 5, 4.2, 1.2, 1, 0.5, 1.6, 0.25], // 4 gold->green
];
const _rc = new Float32Array(3);
function sampleRamp(ri, t) {
  const R = RAMPS[ri];
  for (let i = 4; i < R.length; i += 4) {
    if (t <= R[i] || i === R.length - 4) {
      const t0 = R[i - 4],
        k = clamp((t - t0) / (R[i] - t0 || 1), 0, 1);
      _rc[0] = R[i - 3] + (R[i + 1] - R[i - 3]) * k;
      _rc[1] = R[i - 2] + (R[i + 2] - R[i - 2]) * k;
      _rc[2] = R[i - 1] + (R[i + 3] - R[i - 1]) * k;
      return _rc;
    }
  }
  return _rc;
}

const PART_VS = /* glsl */ `
attribute vec4 iPos; attribute vec4 iCol; attribute vec4 iMisc; attribute vec3 iVel;
uniform mat4 uCamWorld;
uniform vec3 uAmb; uniform vec4 uLP[8]; uniform vec3 uLC[8];
varying vec2 vUv; varying vec4 vCol; varying float vEm; varying vec3 vLight; varying vec3 vFade; varying float vFrame;
void main(){
  float fr = mod(iMisc.y, 16.0); float mode = floor(iMisc.y / 16.0 + 0.001);
  vFrame = fr; vUv = uv; vCol = iCol; vEm = iMisc.w;
  vec2 c = position.xy; float size = iPos.w;
  vec4 mv;
  float soft = 0.0;
  if (mode < 0.5) {
    mv = viewMatrix * vec4(iPos.xyz, 1.0);
    float s = sin(iMisc.x), co = cos(iMisc.x);
    mv.xy += vec2(c.x * co - c.y * s, c.x * s + c.y * co) * size;
    soft = iMisc.z;
  } else if (mode < 1.5) {
    mv = viewMatrix * vec4(iPos.xyz, 1.0);
    vec3 vv = (viewMatrix * vec4(iVel, 0.0)).xyz;
    vec2 ax = vv.xy; float l = length(ax);
    ax = l > 1e-4 ? ax / l : vec2(0.0, 1.0);
    vec2 pp = vec2(ax.y, -ax.x);
    float len = size + iMisc.z * l;
    mv.xy += pp * c.x * size + ax * ((c.y + 0.5) * len - len + size * 0.5);
  } else {
    float s = sin(iMisc.x), co = cos(iMisc.x);
    vec2 r = vec2(c.x * co - c.y * s, c.x * s + c.y * co) * size;
    mv = viewMatrix * vec4(iPos.xyz + vec3(r.x, 0.0, -r.y), 1.0);
  }
  vec3 wp = (uCamWorld * mv).xyz;
  vFade = vec3(-mv.z, wp.y, soft);   // near-camera + floor soft fades resolved per fragment
#ifndef ADDITIVE
  vec3 L = uAmb;
  for (int k = 0; k < 8; k++) {
    vec3 d = uLP[k].xyz - iPos.xyz; float dist2 = max(dot(d, d), 0.04);
    float cut = uLP[k].w;
    float f = cut > 0.0 ? pow(clamp(1.0 - pow(dist2 / (cut * cut), 2.0), 0.0, 1.0), 2.0) : 1.0;
    L += uLC[k] * f / dist2;
  }
  vLight = L;
#endif
  gl_Position = projectionMatrix * mv;
}`;
const PART_FS = /* glsl */ `
uniform sampler2D uMap; uniform vec3 uEmCol;
varying vec2 vUv; varying vec4 vCol; varying float vEm; varying vec3 vLight; varying vec3 vFade; varying float vFrame;
void main(){
  float fade = smoothstep(0.08, 0.6, vFade.x);
  if (vFade.z > 0.0) fade *= smoothstep(0.0, vFade.z, vFade.y);
  vec2 cell = vec2(mod(vFrame, 4.0), floor(vFrame / 4.0 + 0.001));
  vec2 uv = vec2((cell.x + vUv.x) * 0.25, 1.0 - (cell.y + 1.0 - vUv.y) * 0.25);
  vec4 t = texture2D(uMap, uv);
#ifdef ADDITIVE
  float i = t.r * vCol.a * fade;
  gl_FragColor = vec4(vCol.rgb * i + vec3(i * i * i) * vEm, 1.0);
#else
  float a = t.a * vCol.a * fade;
  if (a < 0.003) discard;
  vec3 c = vCol.rgb * vLight * mix(0.14, 1.15, t.r);
  c += uEmCol * vEm * (1.15 - t.r) * vCol.rgb * 4.0;
  gl_FragColor = vec4(c, a);
#endif
}`;

