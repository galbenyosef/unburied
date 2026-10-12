// src__hud 02 — opts
// Lines 313-469 of readable/src__hud.pretty.js (statement-aligned).
function roundArt(n, opts = {}) {
  n = Math.max(0, Math.floor(n || 0));
  const r = rng(opts.seed ?? (n <= 5 ? 4242 : n * 977 + 13));
  const from = opts.from || 0;
  const strokes = []; // {d, w}
  const drips = []; // {x, y, len}
  let W;
  if (n >= 1 && n <= 5) {
    W = 104;
    const cnt = Math.min(n, 4);
    for (let i = 0; i < cnt; i++) {
      const x = 12 + i * 24 + (r() - 0.5) * 3;
      const x2 = x + (r() - 0.5) * 6,
        xm = x + (r() - 0.5) * 7;
      const y0 = 4 + r() * 6,
        y1 = 92 + r() * 6;
      strokes.push({
        d: `M${x.toFixed(1)} ${y0.toFixed(1)} Q${xm.toFixed(1)} 50 ${x2.toFixed(1)} ${y1.toFixed(1)}`,
        w: 12 + r() * 2.5,
        si: i,
      });
      const dp = r() < 0.55,
        dl = 10 + r() * 26;
      if (dp) drips.push({ x: x2, y: y1 - 4, len: dl, si: i });
    }
    if (n === 5) {
      strokes.push({ d: "M-6 80 C 26 64, 62 44, 108 18", w: 12.5, si: 4 });
      drips.push({ x: 8, y: 76, len: 18 + r() * 16, si: 4 });
    }
  } else {
    const str = String(n);
    W = str.length * 64 - 4;
    [...str].forEach((ch, i) => {
      const def = DIGITS[ch];
      const ox = i * 64;
      def.p.forEach((d) => {
        // offset the digit path by translating numbers: easiest via transform attribute per path
        strokes.push({ d, w: 13.5 + r() * 1.5, ox });
      });
      def.d.forEach((dx) => {
        if (r() < 0.8)
          drips.push({
            x: ox + dx + (r() - 0.5) * 4,
            y: 88 + r() * 4,
            len: 10 + r() * 30,
          });
      });
    });
  }

  const svg = s("svg", {
    viewBox: `-14 -12 ${W + 28} 164`,
    class: "ub-paint",
    "aria-label": `Round ${n}`,
  });
  svg.style.setProperty("--vbw", (W + 28) / 164);
  const g = s("g", {
    filter: "url(#ub-brush)",
    transform: n > 5 ? "skewX(-7) translate(8 0)" : "",
  });
  svg.appendChild(g);
  const animate = !!opts.animate;
  let t = opts.delay || 0;
  const st = opts.strokeTime || (n > 5 ? 0.3 : 0.34);
  const skip = opts.skipStrokes || 0;
  const pathEls = [];
  strokes.forEach((k, i) => {
    if (k.si != null && k.si < from) return;
    const tf = k.ox ? `translate(${k.ox} 0)` : "";
    const main = s("path", {
      d: k.d,
      pathLength: 1,
      class: "ub-stroke",
      "stroke-width": k.w.toFixed(1),
      transform: tf,
    });
    const hi = s("path", {
      d: k.d,
      pathLength: 1,
      class: "ub-stroke ub-stroke-hi",
      "stroke-width": (k.w * 0.28).toFixed(1),
      transform: `${tf} translate(-2.2 -1.5)`,
    });
    const inst = !animate || i < skip;
    for (const p of [main, hi]) {
      if (inst) p.classList.add("ub-inst");
      else {
        p.style.animationDelay = `${t.toFixed(2)}s`;
        p.style.animationDuration = `${st}s`;
      }
      g.appendChild(p);
    }
    pathEls.push(main);
    if (!inst) t += st + 0.08;
  });
  drips.forEach((d) => {
    if (d.si != null && d.si < from) return;
    const dr = s("path", {
      d: `M${d.x.toFixed(1)} ${d.y.toFixed(1)} l0 ${d.len.toFixed(1)}`,
      pathLength: 1,
      class: "ub-drip",
      "stroke-width": (3 + r() * 2.2).toFixed(1),
    });
    const bulb = s("circle", {
      cx: d.x.toFixed(1),
      cy: d.y.toFixed(1),
      r: (2.6 + r() * 1.4).toFixed(1),
      class: "ub-bulb",
    });
    bulb.style.setProperty("--len", `${d.len.toFixed(1)}px`);
    const dl = animate ? t + 0.1 + r() * 0.6 : 0;
    const dur = 1.2 + r() * 1.6;
    for (const e of [dr, bulb]) {
      if (!animate) e.classList.add("ub-inst");
      else {
        e.style.animationDelay = `${dl.toFixed(2)}s`;
        e.style.animationDuration = `${dur.toFixed(2)}s`;
      }
      g.appendChild(e);
    }
  });
  return { svg, endTime: t, n };
}

// ---------------------------------------------------------------- glyphs
const PERK_GLYPH = {
  ironhide:
    '<path d="M0-11.5 L9.5-7.8 V-1.5 C9.5 5.5 5 9.8 0 12 C-5 9.8 -9.5 5.5 -9.5-1.5 V-7.8Z" class="f"/><path d="M-5-2.5 L0 2 L5-2.5 M-5 2.5 L0 7 L5 2.5" class="k" stroke-width="2.1"/>',
  quickhands:
    '<g class="s" stroke-width="2.7"><path d="M-6 1 V-8.5 M-2 -0.5 V-11 M2 -0.5 V-10 M5.8 1.5 V-6.5"/><path d="M-6 3 L-10 -1.5"/><path d="M-6.5 1 C-7.5 7.5 -3.5 11.5 0.5 11.5 C5 11.5 7 7.5 5.8 1"/></g><path d="M9.5-5 h3 M10-1 h4.2 M9.5 3 h3" class="s" stroke-width="1.6"/>',
  rapidfire: [-7, 0, 7]
    .map(
      (x) =>
        `<path d="M${x - 2.6} -1.5 Q${x} -13 ${x + 2.6} -1.5 Z" class="f"/><rect x="${x - 2.6}" y="-0.2" width="5.2" height="11" rx="0.6" class="f"/><rect x="${x - 3}" y="8.3" width="6" height="2.6" class="k0"/>`,
    )
    .join(""),
  secondwind:
    '<path d="M0-12 V-2.5 M0-2.5 L-3.4 1 M0-2.5 L3.4 1" class="s" stroke-width="2.2"/><path d="M-2.4-6 C-7.5-8 -11.5 0 -11 6.5 C-10.5 10.5 -6.5 11.8 -3 9.8 C-1.8 5 -1.8 0 -2.4-6Z" class="f"/><path d="M2.4-6 C7.5-8 11.5 0 11 6.5 C10.5 10.5 6.5 11.8 3 9.8 C1.8 5 1.8 0 2.4-6Z" class="f"/>',
};
const POWERUP_GLYPH = {
  maxammo:
    '<rect x="-11" y="-2" width="22" height="13" rx="1" class="f"/><path d="M-11 2 H11" class="k"/><rect x="-3" y="4" width="6" height="3.5" class="k0"/>' +
    [-6.5, -2.2, 2.2, 6.5]
      .map(
        (x) =>
          `<path d="M${x - 1.6} -2 V-8 Q${x} -12.5 ${x + 1.6} -8 V-2Z" class="f"/>`,
      )
      .join(""),
  instakill:
    '<path d="M0-12 C-8-12 -11-6 -11 0 C-11 4 -9 6 -7 7 V11 H7 V7 C9 6 11 4 11 0 C11-6 8-12 0-12Z" class="f"/><ellipse cx="-4.4" cy="-0.5" rx="3" ry="3.4" class="k0"/><ellipse cx="4.4" cy="-0.5" rx="3" ry="3.4" class="k0"/><path d="M0 3.5 L-1.4 6 H1.4Z" class="k0"/><path d="M-3.5 8 V11 M0 8 V11 M3.5 8 V11" class="k" stroke-width="1.1"/>',
  doublepoints: '<text x="0" y="7.5" text-anchor="middle" class="t">x2</text>',
  nuke: '<circle cx="-1.5" cy="3" r="9" class="f"/><rect x="-4" y="-9" width="6" height="5" rx="1" class="f" transform="rotate(20 -1 -6)"/><path d="M1.5-8.5 C4-13 8-11 9-8" class="s" stroke-width="1.6"/><path d="M9-8 l2.5-2 M9-8 l3 .8 M9-8 l.6 3" class="s" stroke-width="1.2"/><path d="M-6 0 A5 5 0 0 1 -2 -3.5" class="k" stroke-width="1.6"/>',
  carpenter:
    '<rect x="-1.6" y="-3" width="3.4" height="15" rx="1" class="f" transform="rotate(-28)"/><path d="M-10-6 L7-10.5 L9.5-7.5 L10-3 L-9.5 0.5 C-11-1 -11-4.5 -10-6Z" class="f" transform="rotate(-28)"/>',
};

// ---------------------------------------------------------------- style
