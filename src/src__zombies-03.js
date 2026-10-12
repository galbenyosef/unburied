// src__zombies 03 — seed
// Lines 662-678 of readable/src__zombies.pretty.js (statement-aligned).
const GORE = [0.2, 0.03, 0.028],
  GORE_DK = [0.06, 0.012, 0.012],
  BONEC = [0.8, 0.74, 0.58],
  TOOTH = [0.5, 0.42, 0.26];
const BLOODSTAIN = [0.5, 0.26, 0.22];

function skinColor(seed) {
  return (p) => {
    const m = fbm(p.x * 14, p.y * 14, p.z * 14, seed, 3);
    const b = fbm(p.x * 5 + 3, p.y * 5, p.z * 5, seed + 5, 2);
    let c = [0.72 + 0.45 * m, 0.72 + 0.45 * m, 0.72 + 0.42 * m];
    if (b > 0.58) c = mix3(c, mulc(c, [0.85, 0.62, 0.8]), sstep(0.58, 0.72, b)); // bruising
    if (m < 0.33) c = mix3(c, mulc(c, [0.6, 0.35, 0.3]), sstep(0.33, 0.22, m)); // lesions
    return c;
  };
}

