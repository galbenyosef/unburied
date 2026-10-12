// src__avatars 17 — addcolorstop
// Lines 6723-6842 of readable/src__avatars.pretty.js (statement-aligned).
function sightY(gi, x) {
  const a = gi.sightR,
    c = gi.sightF;
  const t = (x - a.x) / (c.x - a.x || 1);
  return a.y + (c.y - a.y) * t;
}

// ====================================================================================== manager
function flashTexture() {
  if (typeof document === "undefined") return null;
  const W = 256,
    H = 128,
    c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  const x = c.getContext("2d");
  x.globalCompositeOperation = "lighter";
  // left half: front-on star
  const cx = 64,
    cy = 64;
  let g = x.createRadialGradient(cx, cy, 0, cx, cy, 60);
  g.addColorStop(0, "rgba(255,250,235,1)");
  g.addColorStop(0.18, "rgba(255,214,140,0.95)");
  g.addColorStop(0.5, "rgba(255,140,40,0.35)");
  g.addColorStop(1, "rgba(255,90,10,0)");
  x.fillStyle = g;
  x.beginPath();
  x.arc(cx, cy, 60, 0, TAU);
  x.fill();
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * TAU + 0.3,
      l = 50 + (i % 2) * 10;
    x.save();
    x.translate(cx, cy);
    x.rotate(a);
    const gg = x.createLinearGradient(0, 0, l, 0);
    gg.addColorStop(0, "rgba(255,230,170,0.9)");
    gg.addColorStop(1, "rgba(255,120,30,0)");
    x.fillStyle = gg;
    x.beginPath();
    x.moveTo(0, -6);
    x.lineTo(l, 0);
    x.lineTo(0, 6);
    x.fill();
    x.restore();
  }
  // right half: side-on flame cone (base at the left edge of the half)
  const ox = 128;
  g = x.createLinearGradient(ox, 0, W, 0);
  g.addColorStop(0, "rgba(255,250,230,1)");
  g.addColorStop(0.3, "rgba(255,200,110,0.9)");
  g.addColorStop(0.75, "rgba(255,110,30,0.35)");
  g.addColorStop(1, "rgba(255,80,10,0)");
  x.fillStyle = g;
  x.beginPath();
  x.moveTo(ox, 64 - 16);
  x.quadraticCurveTo(ox + 60, 64 - 40, W - 6, 64);
  x.quadraticCurveTo(ox + 60, 64 + 40, ox, 64 + 16);
  x.fill();
  for (const [dy, l] of [
    [-22, 70],
    [22, 66],
    [0, 120],
  ]) {
    const gg = x.createLinearGradient(ox, 0, ox + l, 0);
    gg.addColorStop(0, "rgba(255,235,180,0.8)");
    gg.addColorStop(1, "rgba(255,120,30,0)");
    x.fillStyle = gg;
    x.beginPath();
    x.moveTo(ox, 64 - 5);
    x.lineTo(ox + l, 64 + dy);
    x.lineTo(ox, 64 + 5);
    x.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
function flashGeometry() {
  // quad 1: facing +X (front star, uv left half); quads 2,3: crossed along +X (flame, uv right half)
  const pos = [],
    uv = [],
    idx = [];
  const quad = (a, b, c, d, uvs) => {
    const o = pos.length / 3;
    pos.push(...a, ...b, ...c, ...d);
    uv.push(...uvs);
    idx.push(o, o + 1, o + 2, o, o + 2, o + 3);
  };
  const r = 0.07;
  quad(
    [0.005, -r, -r],
    [0.005, -r, r],
    [0.005, r, r],
    [0.005, r, -r],
    [0, 0, 0.5, 0, 0.5, 1, 0, 1],
  );
  const L = 0.2,
    w = 0.055;
  quad(
    [0, -w, 0],
    [L, -w, 0],
    [L, w, 0],
    [0, w, 0],
    [0.5, 0, 1, 0, 1, 1, 0.5, 1],
  );
  quad(
    [0, 0, -w],
    [L, 0, -w],
    [L, 0, w],
    [0, 0, w],
    [0.5, 0, 1, 0, 1, 1, 0.5, 1],
  );
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  return g;
}

