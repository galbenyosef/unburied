// src__post 01 — composer
// Lines 1-211 of readable/src__post.pretty.js (statement-aligned).
// UNBURIED — post.js  (vfx agent)
// EffectComposer chain:
//   RenderPass(world) -> RenderPass(viewmodel, no colour clear, depth clear) -> UnrealBloom (HDR, high
//   threshold) -> OutputPass (ACES tone map + sRGB, read from renderer settings) -> Grade (display-space
//   filmic WWII horror grade, vignette, grain, CA, lens distortion, damage/flash/downed/instakill)
//   -> SMAA (high only).
// Grading runs *after* OutputPass on purpose: tone-mapped display-referred values are what a colourist
// grades, and SMAA wants gamma-space input. Nothing after OutputPass converts colour space again.

import * as THREE from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { ShaderPass } from "three/addons/postprocessing/ShaderPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { SMAAPass } from "three/addons/postprocessing/SMAAPass.js";

const GradeShader = {
  name: "UnburiedGrade",
  uniforms: {
    tDiffuse: { value: null },
    uRes: { value: new THREE.Vector2(1, 1) },
    uTime: { value: 0 },
    uDamage: { value: 0 },
    uFlash: { value: 0 },
    uDowned: { value: 0 },
    uInsta: { value: 0 },
    uMenu: { value: 0 },
    uGrain: { value: 0.055 },
    uVignette: { value: 1 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse; uniform vec2 uRes; uniform float uTime, uDamage, uFlash, uDowned, uInsta, uMenu, uGrain, uVignette;
    varying vec2 vUv;
    float hash(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
    float luma(vec3 c){ return dot(c, vec3(0.2126, 0.7152, 0.0722)); }
    vec3 sampleCA(vec2 uv, vec2 dir, float amt){
      vec3 c;
      c.r = texture2D(tDiffuse, uv + dir * amt).r;
      c.g = texture2D(tDiffuse, uv).g;
      c.b = texture2D(tDiffuse, uv - dir * amt).b;
      return c;
    }
    void main(){
      float aspect = uRes.x / uRes.y;
      vec2 cc = vUv - 0.5;
      float r2 = dot(cc * vec2(aspect, 1.0), cc * vec2(aspect, 1.0));
      // barrel distortion (subtle, grows when hurt / downed); zoom-in keeps edges filled
      float k = 0.035 + uDamage * 0.09 + uDowned * 0.07;
      vec2 uv = 0.5 + cc * (1.0 + k * r2) / (1.0 + k * 0.32);
      // chromatic aberration, radial
      float ca = (0.0012 + uDamage * 0.0065 + uDowned * 0.004) * (0.3 + r2 * 2.0);
      vec2 dir = normalize(cc + 1e-5);
      vec3 c = sampleCA(uv, dir, ca);
      // downed: cheap 8-tap smear blur that grows toward the edges
      if (uDowned > 0.001) {
        float br = uDowned * (0.0025 + r2 * 0.012);
        vec3 acc = c;
        for (int i = 0; i < 8; i++) {
          float a = float(i) * 0.785398 + uTime * 0.7;
          acc += texture2D(tDiffuse, uv + vec2(cos(a), sin(a)) * br * vec2(1.0 / aspect, 1.0) * 1.6).rgb;
        }
        c = mix(c, acc / 9.0, clamp(uDowned * 1.2, 0.0, 1.0));
      }

      // ---- filmic WWII grade (display space)
      float L = luma(c);
      // lift shadows toward cold blue-green
      c += vec3(0.010, 0.026, 0.032) * (1.0 - smoothstep(0.0, 0.42, L));
      // split tone: cool shadows / warm lamp highlights
      vec3 shadowTint = vec3(0.90, 1.00, 1.05), highTint = vec3(1.07, 1.00, 0.86);
      c *= mix(shadowTint, highTint, smoothstep(0.18, 0.75, L));
      // mild desaturation (stronger in the shadows)
      L = luma(c);
      c = mix(vec3(L), c, mix(0.72, 0.9, smoothstep(0.1, 0.7, L)));
      // contrast S-curve around mid grey, soft shoulder
      vec3 s = clamp(c, 0.0, 1.0);
      c = mix(c, s * s * (3.0 - 2.0 * s), 0.38);

      // mood: instakill = subtle red cast; menu = darker/desat
      c = mix(c, c * vec3(1.18, 0.86, 0.84), uInsta * 0.55);
      L = luma(c);
      c = mix(c, vec3(L) * vec3(1.0, 0.97, 0.93), uMenu * 0.35) * (1.0 - uMenu * 0.18);
      // downed: bleed out — desaturate, push into red, darken
      c = mix(c, vec3(L) * vec3(1.25, 0.42, 0.38), uDowned * 0.75);

      // vignette
      float vr = length(cc * vec2(aspect * 0.78, 1.0));
      float vig = smoothstep(0.95, 0.28, vr);
      c *= mix(0.42 - uDowned * 0.2, 1.0, mix(1.0, vig, uVignette));

      // red damage vignette with vein-like noise, pulsing
      float edge = smoothstep(0.32, 0.85, vr + (hash(floor(vUv * vec2(40.0, 24.0))) - 0.5) * 0.04);
      float veins = 0.75 + 0.25 * sin(atan(cc.y, cc.x) * 11.0 + sin(atan(cc.y, cc.x) * 5.0) * 2.0);
      float dmg = clamp(uDamage * (0.85 + 0.15 * sin(uTime * 7.0)), 0.0, 1.0);
      c = mix(c, vec3(0.32, 0.0, 0.0) * (0.6 + 0.4 * veins), clamp(edge * veins * dmg * 1.25, 0.0, 0.92));
      c = mix(c, c * vec3(1.0, 0.8, 0.8), dmg * 0.35);
      float insEdge = smoothstep(0.55, 1.0, vr) * uInsta;
      c = mix(c, vec3(0.25, 0.0, 0.0), insEdge * 0.35);

      // animated film grain, strongest in shadows & mids
      float g = hash(vUv * uRes + fract(uTime * 13.37) * 311.0) + hash(vUv * uRes * 0.5 + fract(uTime * 7.1) * 97.0) - 1.0;
      L = luma(c);
      c += g * uGrain * (1.0 - 0.7 * smoothstep(0.2, 0.9, L)) * (1.0 + uDowned * 0.35);

      // white-out
      c = mix(c, vec3(1.0, 0.985, 0.95), clamp(uFlash, 0.0, 1.0));
      // dither to kill banding in the dark
      c += (hash(vUv * uRes + 17.0) - 0.5) / 255.0;
      gl_FragColor = vec4(clamp(c, 0.0, 1.0), 1.0);
    }`,
};

export function createPost(renderer, scene, camera, viewScene, viewCamera) {
  const composer = new EffectComposer(renderer);
  composer.setPixelRatio(renderer.getPixelRatio());

  const worldPass = new RenderPass(scene, camera);
  const viewPass =
    viewScene && viewCamera ? new RenderPass(viewScene, viewCamera) : null;
  if (viewPass) {
    viewPass.clear = false;
    viewPass.clearDepth = true;
  }

  const size = renderer.getSize(new THREE.Vector2());
  const bloom = new UnrealBloomPass(
    new THREE.Vector2(size.x, size.y),
    0.5,
    0.4,
    0.95,
  );
  let bloomScale = 1;
  const bloomSetSize = bloom.setSize.bind(bloom);
  bloom.setSize = (w, h) =>
    bloomSetSize(
      Math.max(2, Math.round(w * bloomScale)),
      Math.max(2, Math.round(h * bloomScale)),
    );

  const output = new OutputPass();
  const grade = new ShaderPass(GradeShader);
  const smaa = new SMAAPass();

  composer.addPass(worldPass);
  if (viewPass) composer.addPass(viewPass);
  composer.addPass(bloom);
  composer.addPass(output);
  composer.addPass(grade);
  composer.addPass(smaa);

  const U = grade.uniforms;
  const mood = { instakill: 0, downed: 0, menu: 0 };
  const target = { instakill: 0, downed: 0, menu: 0 };
  let W = size.x,
    H = size.y;

  function setSize(w, h) {
    W = w;
    H = h;
    composer.setPixelRatio(renderer.getPixelRatio());
    composer.setSize(w, h);
    const pr = renderer.getPixelRatio();
    U.uRes.value.set(w * pr, h * pr);
  }
  setSize(W, H);

  return {
    composer,
    passes: { worldPass, viewPass, bloom, output, grade, smaa },
    render(dt = 1 / 60) {
      dt = Math.min(Math.max(dt, 0), 0.1);
      U.uTime.value += dt;
      const k = 1 - Math.exp(-dt * 4);
      for (const key in mood) mood[key] += (target[key] - mood[key]) * k;
      U.uInsta.value = mood.instakill;
      U.uDowned.value = mood.downed;
      U.uMenu.value = mood.menu;
      composer.render(dt);
    },
    setSize,
    setDamage(v) {
      U.uDamage.value = Math.min(Math.max(v || 0, 0), 1);
    },
    setFlash(v) {
      U.uFlash.value = Math.min(Math.max(v || 0, 0), 1);
    },
    setMood(m = {}) {
      if ("instakill" in m) target.instakill = m.instakill ? 1 : 0;
      if ("downed" in m) target.downed = m.downed ? 1 : 0;
      if ("menu" in m) target.menu = m.menu ? 1 : 0;
    },
    // snap eased mood values (tests / scene cuts)
    snapMood() {
      for (const key in mood) mood[key] = target[key];
    },
    setQuality(q) {
      const high = q !== "medium" && q !== "low";
      bloomScale = high ? 1 : 0.5;
      smaa.enabled = high;
      bloom.strength = high ? 0.55 : 0.5;
      setSize(W, H);
    },
    setTime(t) {
      U.uTime.value = t;
    },
  };
}
