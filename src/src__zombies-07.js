// src__zombies 07 — math
// Lines 2407-2465 of readable/src__zombies.pretty.js (statement-aligned).
const AX = new V3(1, 0, 0),
  AY = new V3(0, 1, 0),
  AZ = new V3(0, 0, 1);
const IDENT = new THREE.Matrix4();
const HIPS_REST = BONE_POS[0];
const keyOf = (p) => (p.id != null ? p.id : p);
const r2 = (v) => Math.round(v * 100) / 100,
  r3 = (v) => Math.round(v * 1000) / 1000;
function toV3(v, fb) {
  if (!v) return fb;
  if (v.isVector3) return v.clone();
  if (Array.isArray(v)) return new V3(+v[0] || 0, +v[1] || 0, +v[2] || 0);
  if (typeof v === "object") return new V3(+v.x || 0, +v.y || 0, +v.z || 0);
  return fb;
}

function setB(P, b, x, y = 0, z = 0) {
  P[b * 3] = x;
  P[b * 3 + 1] = y;
  P[b * 3 + 2] = z;
}
function arm(P, s, ux, uy, uz, fx, fy, fz, hx, hy, hz) {
  const u = s > 0 ? 6 : 9;
  setB(P, u, ux, uy * s, uz * s);
  setB(P, u + 1, fx, fy * s, fz * s);
  setB(P, u + 2, hx, hy * s, hz * s);
}
// two-bone leg IK in root space (unscaled), foot target = ankle point
function legIK(P, s, fx, fy, fz, pitch) {
  _e.set(P[0], P[1], P[2], "XYZ");
  _q.setFromEuler(_e);
  _v.set(HIPX * s, -0.04, 0).applyQuaternion(_q);
  const hx = _v.x + P[H0],
    hy = _v.y + HIPS_REST.y + P[H0 + 1],
    hz = _v.z + P[H0 + 2];
  _v2.set(fx - hx, fy - hy, fz - hz).applyQuaternion(_q.invert());
  const dx = _v2.x,
    dy = _v2.y,
    dz = _v2.z;
  const planar = Math.hypot(dy, dz);
  const L = clamp(Math.hypot(dx, planar), 0.15, THIGH + SHIN - 0.002);
  const alpha = Math.atan2(dz, -dy);
  const knee =
    Math.PI -
    Math.acos(
      clamp((THIGH * THIGH + SHIN * SHIN - L * L) / (2 * THIGH * SHIN), -1, 1),
    );
  const beta = Math.acos(
    clamp((THIGH * THIGH + L * L - SHIN * SHIN) / (2 * THIGH * L), -1, 1),
  );
  const tx = -(alpha + beta),
    tz = Math.atan2(dx, Math.max(planar, 1e-3));
  const t = s > 0 ? 12 : 15;
  setB(P, t, tx, 0, tz);
  setB(P, t + 1, knee, 0, 0);
  setB(P, t + 2, pitch - (P[0] + tx + knee), 0, 0);
}

// ======================================================================= manager
