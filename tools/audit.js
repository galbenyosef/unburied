// audit.js — integrity gate (PLAN §5), tailored to unburied's shape.
//
// UNBURIED — Blackwald Bunker (https://unburied.inkwave.workers.dev/) is
// capture-class: a hand-written ES module graph served at the origin root by a
// Cloudflare Workers static host. No authored source exists outside the mirror,
// so the derived pipeline is:
//
//   capture src/*.js + vendor/**                -> readable/<tag>.pretty.js  (pinned prettier 3.9.6, single pass)
//   readable app modules (src/**)               -> src/<tag>-NN.js           (statement-aligned slices)
//   readable vendor files (vendor/**)           -> split-spec wholeFile      (vendor rule: never sliced)
//   capture index.html                          -> inline <script>/<style> scan (twins + index-inline-map.json)
//
// Layout divergence: the origin serves the app under /src/ and the vendored
// libraries under /vendor/, so the byte-exact capture lives at src/*.js and
// vendor/** at the repo root (DISK_PREFIX=""). Derived slices therefore share
// src/ with the captured modules — they are distinguished by the
// <tag>-NN.js name and are never listed in .upstream/manifest.json. This gate
// asserts that split exactly:
//   src/ on disk == captured src/ modules (byte-exact, manifest-listed)
//                   ∪ ranged spec slices (src/<tag>-NN.js, never in the manifest)
//
// split-spec.json records that pipeline and this gate keeps it honest:
//
//   1. split-spec.json parses, carries a note + renderOptions, and a defaultFile exists.
//   2. Every section resolves: ranged slices have a src/*.js file on disk, a readable
//      *.pretty.js|css sourceFile and in-bounds startLine/endLine; wholeFile sections
//      (vendor libraries, inline entry blocks) must NOT have a src file; `skipped`
//      sections must NOT have a src file and are re-verified textually. A wholeFile
//      section in the READING-COPY shape — its `file` is the readable pretty, its
//      `sourceFile` the capture the pretty was rendered from — resolves the other
//      way round: it must name a captured file that exists and is manifest-recorded,
//      a reading copy that exists and is that capture's pretty under the mirror's
//      own naming rule, the two must be DIFFERENT files (never a self-compare),
//      the recorded range must cover the capture whole, and both must carry the
//      same public export surface.
//   3. The ranges of each sourceFile tile it exactly: first starts at line 1, each next
//      starts at previous end + 1, last ends at EOF — no gaps, no overlaps.
//   4. Byte-exact round-trip: every src slice minus its exact 2-line header
//      (`// <tag> NN — <marker>` + `// Lines A-B of <pretty> (statement-aligned).`)
//      equals its recorded sourceFile range byte for byte.
//   5. Every slice parses standalone with the exact gate command
//      `node --input-type=module --check -` (stdin), as does every readable *.pretty.js.
//   6. src/ bookkeeping: derived-on-disk == ranged slices (no unlisted or missing
//      reversals); wholeFile/skipped names are not on disk; captured modules are on
//      disk, are not claimed as derived, and are NOT byte-copies of any readable twin.
//   7. Every readable pretty is referenced by the spec, its capture source exists, is
//      recorded in .upstream/manifest.json, and is NOT byte-identical to the pretty
//      (prettier did run). Every captured .js/.css file has a readable twin. When the
//      pinned prettier 3.9.6 is importable, each pretty is re-rendered under the
//      recorded options and byte-compared (best-effort: missing prettier is a note).
//   8. The hard rule — import resolution: relative specifiers (static from-imports,
//      side-effect imports, re-exports, dynamic import() incl. non-interpolated template
//      literals) resolve to files the CAPTURE carries. Bare specifiers must be covered
//      by the captured entry document's import map and resolve to a captured file
//      (`three` -> /vendor/three/build/three.module.js, `three/addons/` -> the jsm
//      tree); every named import must be exported by its target (a target with a
//      `export *` re-export cannot be checked statically and is accepted). `node:`
//      and `vite/*` bare specifiers and root-served `/…` paths are whitelisted.
//   9. Inline-block scan: every inline <script>/<style> content block in a captured HTML
//      document has its readable twin and a readable/index-inline-map.json entry whose
//      byte range + sha256 match the capture bytes; the importmap twin parses as JSON.
//  10. Derived layers never enter the capture sums: no readable/, legacy/, split-spec.json
//      and no derived src slice may appear in .upstream/manifest.json (captured src/
//      modules are the served files and are expected there — the layout divergence).
//
// usage: node tools/audit.js
"use strict";
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { spawnSync } = require("node:child_process");
const { pathToFileURL } = require("node:url");

const here = __dirname;
const proj = path.resolve(here, "..");
const srcDir = path.join(proj, "src");
const readableDir = path.join(proj, "readable");
const PINNED = "3.9.6";
const ROOT = ""; // root-served capture: served path == disk rel

const problems = [];
const problem = (msg) => problems.push(msg);

// ── helpers ─────────────────────────────────────────────────────────────
const readLines = (abs) => {
  const t = fs.readFileSync(abs, "utf8");
  const l = t.split("\n");
  if (l.length && l[l.length - 1] === "") l.pop();
  return l;
};
const linesCache = new Map();
const getLines = (abs) => {
  if (!linesCache.has(abs)) linesCache.set(abs, readLines(abs));
  return linesCache.get(abs);
};
const sha256 = (buf) => crypto.createHash("sha256").update(buf).digest("hex");

// capture-relative name -> readable twin name (dirs flattened with __)
const prettyNameOf = (capRel) => {
  const rel = capRel.startsWith(ROOT) ? capRel.slice(ROOT.length) : capRel;
  const flat = rel.replace(/\.(js|css)$/i, "").split("/").join("__");
  return "readable/" + flat + (/\.css$/i.test(rel) ? ".pretty.css" : ".pretty.js");
};
const captureByPretty = new Map(); // readable/<x>.pretty.js|css -> capture rel

// A whole-file section is one of two things. Either "the capture, indexed
// whole" (its `file` is a derived text under the derived root), or "the
// reading copy, compared against the capture" — the shape the frozen export
// gate reads:
//
//   { "file": "readable/foo.pretty.js", "wholeFile": true, "capture": "vendor/foo.js" }
//
// In the second shape the PRISTINE is the capture and the DERIVED text is the
// reading copy: two different files, so the gate's comparison between their
// export tables is real rather than a self-compare. `isWholeFile` recognises
// a whole-file section (the boolean, or a path when `wholeFile` names the
// capture) and `readingCopyCapture` names the capture such a section records:
// `wholeFile` when it is a path, or a `capture`/`source`/`origin`/`from`
// field.
const isWholeFile = (s) =>
  s.wholeFile === true || (typeof s.wholeFile === "string" && s.wholeFile.length > 0);
const readingCopyCapture = (s) => {
  if (typeof s.wholeFile === "string" && s.wholeFile) return s.wholeFile;
  for (const f of ["capture", "source", "origin", "from"]) {
    if (typeof s[f] === "string" && s[f]) return s[f];
  }
  return null;
};

// parse check — the exact standalone gate: node --input-type=module --check - < file
function parseCheck(abs, rel) {
  const r = spawnSync(process.execPath, ["--input-type=module", "--check", "-"], {
    input: fs.readFileSync(abs),
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  if (r.status !== 0)
    problem(`standalone ESM parse failed: ${rel} — ${(r.stderr || "").trim().split("\n").slice(-2).join(" | ")}`);
  return r.status === 0;
}

// inline <script>/<style> scan (byte-exact, same shape as tools/derive.mjs)
function scanBlocks(buf) {
  const blocks = [];
  for (const [open, close, kind] of [
    ["<script", "</script", "script"],
    ["<style", "</style", "style"],
  ]) {
    let p = 0;
    let n = 0;
    while (true) {
      const i = buf.indexOf(open, p);
      if (i < 0) break;
      const after = buf[i + open.length];
      const boundary =
        after === 0x3e || after === 0x2f || after === 0x20 || after === 0x09 || after === 0x0a || after === 0x0d;
      if (!boundary) {
        p = i + open.length;
        continue;
      }
      const tagEnd = buf.indexOf(">", i);
      if (tagEnd < 0) break;
      const j = buf.indexOf(close, tagEnd + 1);
      if (j < 0) {
        problem(`unterminated <${kind}> opened at byte ${i}`);
        break;
      }
      const tag = buf.subarray(i, tagEnd + 1).toString("utf8");
      const external = /\bsrc\s*=\s*["']/i.test(tag);
      if (!external) {
        n++;
        const content = buf.subarray(tagEnd + 1, j);
        blocks.push({
          kind: /\btype\s*=\s*["']importmap["']/i.test(tag) ? "importmap" : kind,
          block: n,
          contentStart: tagEnd + 1,
          contentEnd: j,
          bytes: content.length,
          sha256: sha256(content),
        });
      }
      p = j + close.length;
    }
  }
  return blocks.sort((a, b) => a.contentStart - b.contentStart);
}

// ── specifier extraction + export tables (the hard rule) ────────────────
function extractSpecifiers(code) {
  const out = [];
  const push = (spec, kind, clause) => out.push({ spec, kind, clause: clause || "" });
  let m;
  const fromRe = /\bimport\s+([^;('"]*?)\s*from\s*(["'])([^"']+)\2/g;
  while ((m = fromRe.exec(code))) push(m[3], "from", m[1]);
  const sideRe = /\bimport\s*(["'])([^"']+)\1/g;
  while ((m = sideRe.exec(code))) push(m[2], "side-effect", "");
  const reExpRe = /\bexport\s+[^;()]*?\bfrom\s*(["'])([^"']+)\1/g;
  while ((m = reExpRe.exec(code))) push(m[2], "re-export", "");
  const dynRe = /\bimport\s*\(\s*(["'])([^"']+)\1\s*\)/g;
  while ((m = dynRe.exec(code))) push(m[2], "dynamic", "");
  const dynTplRe = /\bimport\s*\(\s*`([^`]*)`\s*\)/g;
  while ((m = dynTplRe.exec(code))) if (!m[1].includes("${")) push(m[1], "dynamic", "");
  const urlRe = /\bnew\s+URL\s*\(\s*(["'`])([^"'`]+)\1\s*,/g;
  while ((m = urlRe.exec(code))) push(m[2], "worker-url", "");
  if (/\brequire\s*\(/.test(code)) push("<require()>", "require", "");
  return out;
}
function namedImports(clause) {
  const names = [];
  const brace = /\{([^}]*)\}/s.exec(clause);
  if (brace) {
    for (let part of brace[1].split(",")) {
      part = part.trim();
      if (!part) continue;
      const as = /\s+as\s+([\w$]+)\s*$/.exec(part);
      names.push(as ? part.slice(0, as.index).trim() : part); // imported name precedes `as`
    }
  } else {
    const head = clause.split(",")[0].trim();
    if (head && !head.startsWith("*")) names.push(head); // default import
  }
  return names.filter(Boolean);
}
function exportsOf(code) {
  const names = new Set();
  for (const m of code.matchAll(/\bexport\s*\{([^}]*)\}/g)) {
    for (let part of m[1].split(",")) {
      part = part.trim();
      if (!part) continue;
      const as = /\s+as\s+([\w$]+)\s*$/.exec(part);
      names.add(as ? as[1] : part); // in an EXPORT clause the public name follows `as`
    }
  }
  for (const m of code.matchAll(/\bexport\s+(?:async\s+)?(?:function|class)\s+([\w$]+)/g)) names.add(m[1]);
  for (const m of code.matchAll(/\bexport\s+(?:const|let|var)\s+([\w$]+)/g)) names.add(m[1]);
  if (/\bexport\s+default\b/.test(code)) names.add("default");
  if (/\bexport\s+\*\s+from\b/.test(code)) names.add("*");
  return names;
}

// ── capture manifest ────────────────────────────────────────────────────
let manifest = null;
try {
  manifest = JSON.parse(fs.readFileSync(path.join(proj, ".upstream", "manifest.json"), "utf8"));
} catch (e) {
  problem(`.upstream/manifest.json does not parse: ${e.message}`);
}
const normRel = (r) => r.split(path.sep).join("/");
const captured = manifest?.files ? Object.keys(manifest.files).map(normRel).sort() : [];
for (const rel of captured) {
  if (/\.(js|css)$/i.test(rel)) captureByPretty.set(prettyNameOf(rel), rel);
}
// captured modules the origin serves under /src/ (they live in the same dir as
// the derived slices — the layout divergence)
const captureSrcNames = new Set(captured.filter((r) => /^src\//.test(r)).map((r) => path.basename(r)));

// the capture's own index.html import map — what bare specifiers must resolve through
const importMap = new Map();
for (const rel of captured) {
  if (!/\.html$/i.test(rel)) continue;
  const text = fs.readFileSync(path.join(proj, rel), "utf8");
  for (const m of text.matchAll(/<script[^>]*type\s*=\s*["']importmap["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      const j = JSON.parse(m[1]);
      for (const [k, v] of Object.entries(j.imports || {})) importMap.set(k, v);
    } catch (e) {
      problem(`${rel}: inline importmap does not parse as JSON: ${e.message}`);
    }
  }
}
function resolveBare(spec) {
  if (importMap.has(spec)) return importMap.get(spec);
  let best = null;
  for (const [k, v] of importMap) {
    if (k.endsWith("/") && spec.startsWith(k) && (!best || k.length > best[0].length)) best = [k, v];
  }
  return best ? best[1] + spec.slice(best[0].length) : null;
}

// ── split-spec.json ─────────────────────────────────────────────────────
const specPath = path.join(proj, "split-spec.json");
if (!fs.existsSync(specPath)) problem("split-spec.json missing at repo root");
let spec = null;
try {
  spec = specPath && JSON.parse(fs.readFileSync(specPath, "utf8"));
} catch (e) {
  problem(`split-spec.json does not parse: ${e.message}`);
}
const sections = Array.isArray(spec?.sections) ? spec.sections : [];
if (spec && !Array.isArray(spec?.sections)) problem("split-spec.json has no sections array");
if (!String(spec?.note ?? "").trim()) problem("split-spec.json has no note (derivation record)");
if (!spec?.renderOptions || typeof spec.renderOptions !== "object")
  problem("split-spec.json records no renderOptions (prettier options for re-derivation)");
if (!Array.isArray(spec?.notRendered))
  problem("split-spec.json records no notRendered array (non-code payload blocks)");
if (spec?.defaultFile) {
  const df = path.join(srcDir, path.basename(String(spec.defaultFile)));
  if (!fs.existsSync(df)) problem(`split-spec defaultFile "${spec.defaultFile}" does not exist`);
}

const seen = new Set();
const rangedFiles = new Set();
const indexOnlyFiles = new Set();
for (const s of sections) {
  if (!s.file) {
    problem("split-spec section without a file");
    continue;
  }
  if (seen.has(s.file)) problem(`split-spec lists ${s.file} twice`);
  seen.add(s.file);
  const isWhole = s.wholeFile === true;
  const isSkipped = s.skipped === true;
  if (isWhole && isSkipped) problem(`section ${s.file}: both wholeFile and skipped`);
  if (typeof s.startLine !== "number" || typeof s.endLine !== "number")
    problem(`section ${s.file}: no startLine/endLine range recorded`);
  if (typeof s.sourceFile !== "string") problem(`section ${s.file}: no sourceFile provenance recorded`);
  if (isWhole || isSkipped) indexOnlyFiles.add(s.file);
  else rangedFiles.add(s.file);
}
if (!rangedFiles.size) problem("no ranged src slices in split-spec.json (no reversed layer)");

const onDiskAll = fs.existsSync(srcDir)
  ? fs.readdirSync(srcDir).filter((f) => f.endsWith(".js")).sort()
  : [];
const onDiskDerived = onDiskAll.filter((f) => !captureSrcNames.has(f));
if (!onDiskDerived.length) problem("src/ has no derived slices (no reversed layer)");
for (const f of onDiskDerived) if (!rangedFiles.has(f)) problem(`src/${f} exists but is not a ranged slice in split-spec.json`);
for (const f of rangedFiles) if (!onDiskAll.includes(f)) problem(`split-spec lists ${f} but it is not on disk`);
for (const f of indexOnlyFiles)
  if (onDiskAll.includes(f)) problem(`index-only section ${f} must not have a src file on disk (wholeFile/skipped)`);
// the layout divergence, asserted both ways
for (const f of captureSrcNames) {
  if (!onDiskAll.includes(f)) problem(`captured module src/${f} is missing on disk`);
  if (rangedFiles.has(f) || indexOnlyFiles.has(f)) problem(`captured module src/${f} is wrongly claimed as a derived slice`);
}

// ── ranges: existence, bounds, tiling ───────────────────────────────────
const bySource = new Map();
const readingCopySections = [];
for (const s of sections) {
  if (!s.file || typeof s.sourceFile !== "string") continue;
  const src = path.join(proj, s.sourceFile);
  if (!fs.existsSync(src)) {
    problem(`section ${s.file}: sourceFile missing: ${s.sourceFile}`);
    continue;
  }
  if (!/\.pretty\.(js|css|json)$/i.test(s.sourceFile)) {
    // A whole-file section may name the CAPTURE its reading copy was
    // rendered from, and carry the reading copy as its derived text (its
    // `file`). The rule below — every section names the readable pretty it
    // was cut from — was written for a spec whose whole-file sections meant
    // "the capture, indexed whole"; it still holds for every ranged slice,
    // and this carve-out admits the reading-copy shape ONLY when it is
    // sound (see § reading-copy shape below). Every other shape is rejected
    // exactly as before.
    const cap = readingCopyCapture(s) || s.sourceFile;
    const copyRel = String(s.file);
    const capAbs = path.join(proj, cap);
    if (
      !isWholeFile(s) ||
      !/\.pretty\.(js|css|json)$/i.test(copyRel) ||
      path.resolve(capAbs) !== path.resolve(src)
    ) {
      problem(`section ${s.file}: sourceFile is not a readable pretty: ${s.sourceFile}`);
      continue;
    }
    readingCopySections.push({ s, capture: cap, copyRel, copyAbs: path.join(proj, copyRel), capAbs });
    continue;
  }
  // a whole-file section whose derived text IS its sourceFile would make the
  // frozen export gate compare the file with itself — a self-compare, which
  // can only ever pass and proves nothing about the layer
  if (isWholeFile(s) && path.resolve(path.join(proj, String(s.file))) === path.resolve(src)) {
    problem(`section ${s.file}: the derived text IS its sourceFile (${s.sourceFile}) — a self-compare proves nothing`);
    continue;
  }
  const srcLines = getLines(src);
  const A = s.startLine,
    B = s.endLine;
  if (!Number.isInteger(A) || !Number.isInteger(B) || A < 1 || B < A || B > srcLines.length) {
    problem(`section ${s.file}: bad range ${A}-${B} vs ${s.sourceFile} (${srcLines.length} lines)`);
    continue;
  }
  if (!bySource.has(s.sourceFile)) bySource.set(s.sourceFile, []);
  bySource.get(s.sourceFile).push({ s, A, B });
}
let tiledOK = 0;
for (const [sourceFile, list] of bySource) {
  let ok = true;
  list.sort((x, y) => x.A - y.A);
  const srcLines = getLines(path.join(proj, sourceFile));
  if (list[0].A !== 1) {
    problem(`${sourceFile}: first section starts at line ${list[0].A}, not 1`);
    ok = false;
  }
  for (let k = 1; k < list.length; k++) {
    if (list[k].A !== list[k - 1].B + 1) {
      problem(
        `${sourceFile}: ranges not contiguous at ${list[k].s.file} (starts ${list[k].A}, previous ends ${list[k - 1].B})`,
      );
      ok = false;
    }
  }
  if (list[list.length - 1].B !== srcLines.length) {
    problem(`${sourceFile}: last section ends at ${list[list.length - 1].B}, not ${srcLines.length}`);
    ok = false;
  }
  if (ok) tiledOK++;
}

// ── the reading-copy shape: a whole-file section and the capture it is compared to ──
// The frozen export gate reaches such a section as
//   { "file": "readable/foo.pretty.js", "wholeFile": true, "capture": "vendor/foo.js" }
// The PRISTINE is the capture; the DERIVED text is the reading copy. Two
// different files, so the gate's comparison of their export tables is real
// and not a self-compare. The carve-out above admits the shape only when it
// is SOUND, so nothing is let through that the old rule would have caught:
//
//   - the reading copy exists on disk, and it IS the pretty of THAT capture
//     under the mirror's own served-path naming rule;
//   - the capture exists on disk and is a captured file: .upstream/
//     manifest.json records it, byte for byte;
//   - the two are DIFFERENT files — different paths, and not byte-identical
//     (a copy of the capture would make the comparison a self-compare, which
//     can only ever pass and proves nothing about the layer);
//   - the recorded range covers the capture whole;
//   - both carry the SAME public export surface, so the two export tables the
//     gate compares are comparable.
let readingCopyOK = 0;
const readingCopyRefs = [];
for (const { s, capture, copyRel, copyAbs, capAbs } of readingCopySections) {
  const label = `section ${s.file}`;
  if (!fs.existsSync(copyAbs) || !fs.statSync(copyAbs).isFile()) {
    problem(`${label}: the reading copy is missing on disk: ${copyRel}`);
    continue;
  }
  if (!fs.existsSync(capAbs) || !fs.statSync(capAbs).isFile()) {
    problem(`${label}: the capture is missing on disk: ${capture}`);
    continue;
  }
  if (!manifest?.files?.[capture]) {
    problem(`${label}: the capture ${capture} is not a captured file (.upstream/manifest.json)`);
    continue;
  }
  const capBuf = fs.readFileSync(capAbs);
  if (sha256(capBuf) !== manifest.files[capture].sha256) {
    problem(`${label}: the capture ${capture} does not match .upstream/manifest.json`);
    continue;
  }
  // the mirror's own naming rule ties the reading copy to THAT capture
  const want = prettyNameOf(capture);
  if (want !== copyRel) {
    problem(`${label}: the naming rule maps ${capture} to ${want}, not to ${copyRel}`);
    continue;
  }
  // the two must be DIFFERENT files
  const copyBuf = fs.readFileSync(copyAbs);
  if (path.resolve(capAbs) === path.resolve(copyAbs) || capBuf.equals(copyBuf)) {
    problem(`${label}: the reading copy IS its capture (${capture}) — a self-compare proves nothing`);
    continue;
  }
  // the whole-file range must cover the capture whole
  const capLines = getLines(capAbs).length;
  if (s.startLine !== 1 || s.endLine !== capLines) {
    problem(
      `${label}: the recorded range ${s.startLine}-${s.endLine} does not cover the capture ${capture} whole (${capLines} lines)`,
    );
    continue;
  }
  // the two export tables must be comparable
  const capNames = exportsOf(capBuf.toString("utf8"));
  const copyNames = exportsOf(copyBuf.toString("utf8"));
  const lost = [...capNames].filter((n) => !copyNames.has(n));
  if (lost.length) {
    problem(`${label}: a public export name of ${capture} is missing from the reading copy: ${lost.join(", ")}`);
    continue;
  }
  const gained = [...copyNames].filter((n) => !capNames.has(n));
  if (gained.length) {
    problem(`${label}: the reading copy exports a name ${capture} does not: ${gained.join(", ")}`);
    continue;
  }
  readingCopyOK++;
  readingCopyRefs.push(copyRel);
}

// ── byte-exact round-trip + header provenance ───────────────────────────
let roundOK = 0,
  ranged = 0;
for (const [, list] of bySource) {
  for (const { s, A, B } of list) {
    if (s.wholeFile === true || s.skipped === true) continue;
    ranged++;
    const srcAbs = path.join(srcDir, path.basename(String(s.file)));
    if (!fs.existsSync(srcAbs)) continue; // already reported
    const text = fs.readFileSync(srcAbs, "utf8");
    const nl1 = text.indexOf("\n");
    const nl2 = nl1 >= 0 ? text.indexOf("\n", nl1 + 1) : -1;
    if (nl2 < 0) {
      problem(`src/${s.file}: missing 2-line header`);
      continue;
    }
    const header1 = text.slice(0, nl1);
    const header2 = text.slice(nl1 + 1, nl2);
    const nn = path.basename(String(s.file)).match(/-(\d+)\.js$/)?.[1];
    if (!nn) problem(`src/${s.file}: file name carries no -NN slice number`);
    else if (!new RegExp(`^// .+ ${nn} — .+$`).test(header1))
      problem(`src/${s.file}: header line 1 does not match "// <tag> ${nn} — <marker>": ${header1}`);
    const want2 = `// Lines ${A}-${B} of ${s.sourceFile} (statement-aligned).`;
    if (header2 !== want2) problem(`src/${s.file}: header line 2 is not the recorded range: ${header2}`);
    const body = text.slice(nl2 + 1);
    const srcLines = getLines(path.join(proj, s.sourceFile));
    const expected = srcLines.slice(A - 1, B).join("\n") + "\n";
    if (body !== expected)
      problem(`src/${s.file}: body is not a byte-exact round-trip of ${s.sourceFile} lines ${A}-${B}`);
    else roundOK++;
  }
}

// ── skipped sections: textual re-verification ───────────────────────────
let skippedOK = 0,
  skippedTotal = 0;
for (const s of sections) {
  if (s.skipped !== true || typeof s.sourceFile !== "string") continue;
  skippedTotal++;
  const src = path.join(proj, s.sourceFile);
  if (!fs.existsSync(src)) {
    problem(`skipped section ${s.file}: sourceFile missing: ${s.sourceFile}`);
    continue;
  }
  const lines = getLines(src);
  if (!Number.isInteger(s.startLine) || !Number.isInteger(s.endLine) || s.startLine < 1 || s.endLine > lines.length)
    continue;
  const first = lines[s.startLine - 1],
    last = lines[s.endLine - 1];
  if (typeof s.firstLine !== "string" || typeof s.lastLine !== "string")
    problem(`skipped section ${s.file}: no firstLine/lastLine recorded`);
  else if (first !== s.firstLine || last !== s.lastLine)
    problem(`skipped section ${s.file}: range text does not match the recorded first/last lines`);
  else skippedOK++;
}

// ── every src + pretty parses standalone ────────────────────────────────
let checkOK = 0;
for (const f of onDiskDerived) if (parseCheck(path.join(srcDir, f), `src/${f}`)) checkOK++;

const prettyFiles = [];
const walkPretty = (dir) => {
  if (!fs.existsSync(dir)) return;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walkPretty(p);
    else if (/\.pretty\.(js|css)$/i.test(e.name)) prettyFiles.push(p);
  }
};
walkPretty(readableDir);
if (!prettyFiles.length) problem("readable/ has no *.pretty.js|css (derived layer missing)");
let prettyOK = 0,
  prettyParsed = 0;
for (const abs of prettyFiles) {
  const rel = path.relative(proj, abs).split(path.sep).join("/");
  if (!/\.pretty\.js$/i.test(rel)) continue; // CSS/inline twins are indexed, not ESM-parsed
  prettyParsed++;
  if (parseCheck(abs, rel)) prettyOK++;
}

// ── inline-block twins + map (deliverable rule) ─────────────────────────
const inlineMapPath = path.join(readableDir, "index-inline-map.json");
let inlineMap = null;
if (fs.existsSync(inlineMapPath)) {
  try {
    inlineMap = JSON.parse(fs.readFileSync(inlineMapPath, "utf8"));
  } catch (e) {
    problem(`readable/index-inline-map.json does not parse: ${e.message}`);
  }
}
const inlineTwinRels = new Set();
let inlineBlocks = 0;
for (const capRel of Object.keys(manifest?.files ?? {}).map(normRel)) {
  if (!/\.html$/i.test(capRel)) continue;
  const buf = fs.readFileSync(path.join(proj, capRel));
  const blocks = scanBlocks(buf);
  inlineBlocks += blocks.length;
  const entryTag = capRel.replace(/\.html$/i, "").split("/").join("__");
  for (const b of blocks) {
    const twinExt = b.kind === "style" ? "css" : b.kind === "importmap" ? "json" : "js";
    const twin = `readable/${entryTag}-inline-${b.block}.pretty.${twinExt}`;
    inlineTwinRels.add(twin);
    if (!fs.existsSync(path.join(proj, twin))) problem(`${capRel}: inline ${b.kind} #${b.block} has no twin ${twin}`);
    else {
      const twinText = fs.readFileSync(path.join(proj, twin), "utf8");
      const content = buf.subarray(b.contentStart, b.contentEnd);
      if (twinText === content.toString("utf8"))
        problem(`${twin}: byte-identical to its capture block (prettier did not run?)`);
      if (twinExt === "json") {
        try {
          JSON.parse(twinText);
        } catch (e) {
          problem(`${twin}: does not parse as JSON: ${e.message}`);
        }
      }
    }
    const rec = inlineMap?.blocks?.find((x) => x.file === twin && x.source === capRel);
    if (!rec) {
      problem(`${capRel}: inline ${b.kind} #${b.block} is missing from readable/index-inline-map.json`);
      continue;
    }
    if (rec.byteStart !== b.contentStart || rec.byteEnd !== b.contentEnd || rec.sha256 !== b.sha256)
      problem(`${twin}: recorded inline byte range/sha256 does not match the capture bytes`);
  }
}
if (inlineMap && inlineBlocks === 0) problem("readable/index-inline-map.json exists but the capture has no inline blocks");

// ── every whole-file section's DERIVED TEXT must exist on disk ──────────
// A whole-file section carries a derived text: its reading copy (its `file`)
// or, for an inline entry block, the inline twin (its `sourceFile`). A
// section whose derived text is nowhere on disk is a section the frozen
// export gate finds no counterpart for — its export tables are reported
// "NOT covered", i.e. unchecked rather than proven intact. The reading-copy
// shape above carries the reading copy; an inline block carries the twin.
for (const s of sections) {
  if (!isWholeFile(s)) continue;
  const fileRel = String(s.file);
  if (fs.existsSync(path.join(proj, fileRel))) continue;
  const srcRel = typeof s.sourceFile === "string" ? s.sourceFile.split(path.sep).join("/") : null;
  if (srcRel && inlineTwinRels.has(srcRel)) continue; // an inline block: its twin is the derived text
  problem(`section ${s.file}: the derived text of a whole-file section does not exist on disk: ${fileRel}`);
}

// ── every pretty referenced + provably derived + layer completeness ─────
const referenced = new Set();
for (const [sourceFile] of bySource) referenced.add(sourceFile.split(path.sep).join("/"));
// a reading-copy section references its reading copy as its derived text
for (const rel of readingCopyRefs) referenced.add(rel.split(path.sep).join("/"));
let derivedOK = 0;
for (const abs of prettyFiles) {
  const rel = path.relative(proj, abs).split(path.sep).join("/");
  if (!referenced.has(rel))
    problem(`readable/${path.basename(rel)} exists but is not referenced by split-spec.json`);
  if (inlineTwinRels.has(rel)) {
    derivedOK++; // inline twins are byte-compared against their capture block above
    continue;
  }
  const capRel = captureByPretty.get(rel);
  const capAbs = capRel ? path.join(proj, capRel) : null;
  if (!capAbs || !fs.existsSync(capAbs)) {
    problem(`${rel}: capture source missing (no captured .js/.css maps to this pretty)`);
    continue;
  }
  if (manifest && !manifest.files?.[capRel])
    problem(`${rel}: capture source ${capRel} is not recorded in .upstream/manifest.json`);
  if (fs.readFileSync(capAbs).equals(fs.readFileSync(abs)))
    problem(`${rel}: byte-identical to its capture source (prettier did not run?)`);
  else derivedOK++;
}
if (manifest) {
  for (const capRel of captured) {
    if (!/\.(js|css)$/i.test(capRel)) continue;
    if (!prettyFiles.some((abs) => captureByPretty.get(path.relative(proj, abs).split(path.sep).join("/")) === capRel))
      problem(`captured ${capRel} has no readable twin referenced by the spec`);
  }
}

// ── vendor rule: wholeFile sections carry the recorded shape ────────────
const VENDOR_GUARDS = [
  ["vendor/three/build/three.core.js", /const REVISION = "185"/, /class BufferGeometry/],
  ["vendor/three/build/three.module.js", /class WebGLRenderer/, /three\.core\.js/],
  ["vendor/peerjs/peerjs.min.js", /__peerData/, /peerjs/i],
];
for (const [capture, reA, reB] of VENDOR_GUARDS) {
  // the guard is keyed by the CAPTURE the vendor chunk came from, so it holds
  // for the section whatever it names as its derived text
  const sec = sections.find((s) => s.capture === capture);
  if (!sec) continue; // absence is fine; presence must hold its guard
  if (!isWholeFile(sec)) {
    problem(`vendor section ${sec.file} is not wholeFile`);
    continue;
  }
  // the guard reads the DERIVED text — the reading copy — because that is
  // what "readable changed shape" means: the capture is byte-exact by
  // construction (manifest-recorded), the reading copy is what prettier
  // produced.
  const copyAbs = path.join(proj, String(sec.file));
  if (!fs.existsSync(copyAbs)) continue; // already reported
  const text = fs.readFileSync(copyAbs, "utf8");
  if (!reA.test(text) || !reB.test(text))
    problem(`vendor section ${sec.file}: content guard failed — readable changed shape`);
}

// ── the hard rule: src/ import resolution against the capture ───────────
let checkedImports = 0,
  resolvedImports = 0,
  whitelisted = 0;
for (const s of sections) {
  if (s.wholeFile === true || s.skipped === true) continue;
  if (!s.file || typeof s.sourceFile !== "string") continue;
  const srcAbs = path.join(srcDir, path.basename(String(s.file)));
  if (!fs.existsSync(srcAbs)) continue;
  const capRel = captureByPretty.get(s.sourceFile);
  const baseDir = capRel ? path.posix.dirname(capRel) : null;
  const code = fs.readFileSync(srcAbs, "utf8");
  for (const { spec, kind, clause } of extractSpecifiers(code)) {
    checkedImports++;
    if (spec.startsWith("./") || spec.startsWith("../")) {
      if (!baseDir) {
        problem(`src/${s.file}: ${kind} import "${spec}" but no capture provenance is known`);
        continue;
      }
      const target = path.posix.normalize(path.posix.join(baseDir, spec));
      if (!fs.existsSync(path.join(proj, target))) {
        problem(`src/${s.file}: unresolvable ${kind} import "${spec}" (capture carries no ${target})`);
        continue;
      }
      resolvedImports++;
      const targetCode = fs.readFileSync(path.join(proj, target), "utf8");
      const targetExports = exportsOf(targetCode);
      for (const n of namedImports(clause)) {
        if (n === "*" || targetExports.has(n) || targetExports.has("*")) continue;
        problem(`src/${s.file}: imports { ${n} } from "${spec}" but ${target} does not export it`);
      }
      continue;
    }
    if (spec.startsWith("node:") || spec.startsWith("vite/") || spec.startsWith("/")) {
      whitelisted++;
      continue;
    }
    // bare specifier: must be covered by the captured entry document's import map
    const served = resolveBare(spec);
    if (!served) {
      problem(`src/${s.file}: unresolvable ${kind} import "${spec}" — bare specifier not in the entry import map`);
      continue;
    }
    const target = served.replace(/^\//, "");
    if (!captured.includes(target)) {
      problem(`src/${s.file}: import "${spec}" resolves to ${served} (not in the capture manifest)`);
      continue;
    }
    resolvedImports++;
    const targetCode = fs.readFileSync(path.join(proj, target), "utf8");
    const targetExports = exportsOf(targetCode);
    for (const n of namedImports(clause)) {
      if (n === "*" || targetExports.has(n) || targetExports.has("*")) continue;
      problem(`src/${s.file}: imports { ${n} } from "${spec}" (${served}) but it does not export it`);
    }
  }
}

// ── derived layers must never enter the capture sums ────────────────────
if (manifest) {
  for (const rel of captured) {
    if (/^readable\//.test(rel) || /^legacy\//.test(rel) || rel === "split-spec.json" || /\.pretty\.(js|css|json)$/i.test(rel))
      problem(`derived layer leaked into the capture manifest: ${rel}`);
    if (rangedFiles.has(path.basename(rel)) || indexOnlyFiles.has(path.basename(rel)))
      problem(`derived section file leaked into the capture manifest: ${rel}`);
  }
}

// ── best-effort: re-render every pretty with the pinned prettier 3.9.6 ─
const prettierCandidates = [
  process.env.PRETTIER_MJS,
  path.join(proj, "node_modules", "prettier", "index.mjs"),
  path.join(proj, "tools", "vendor", "prettier", "index.mjs"),
].filter(Boolean);
function loadPinnedPrettier() {
  for (const c of prettierCandidates) {
    if (!fs.existsSync(c)) continue;
    try {
      const pkg = JSON.parse(fs.readFileSync(path.join(path.dirname(c), "package.json"), "utf8"));
      if (pkg.version !== PINNED) continue;
      return c;
    } catch {
      /* keep looking */
    }
  }
  return null;
}

(async () => {
  let renderNote = `prettier ${PINNED} not importable — renderOptions recorded, re-render check skipped`;
  const prettierPath = loadPinnedPrettier();
  if (prettierPath) {
    const prettier = (await import(pathToFileURL(prettierPath).href)).default;
    let renderOK = 0;
    let renderTotal = 0;
    // file pretties re-render from their capture file
    for (const abs of prettyFiles) {
      const rel = path.relative(proj, abs).split(path.sep).join("/");
      if (inlineTwinRels.has(rel)) continue;
      const capRel = captureByPretty.get(rel);
      const capAbs = capRel ? path.join(proj, capRel) : null;
      if (!capAbs || !fs.existsSync(capAbs)) continue; // already reported
      renderTotal++;
      const parser = /\.pretty\.css$/i.test(rel) ? "css" : "babel";
      const got = await prettier.format(fs.readFileSync(capAbs, "utf8"), { parser });
      const want = fs.readFileSync(abs, "utf8");
      if (got === want) renderOK++;
      else problem(`${rel}: does not re-render byte-exact under pinned prettier ${PINNED} ({parser:${parser}})`);
    }
    // inline twins re-render from their capture byte range
    if (inlineMap?.capture) {
      const buf = fs.readFileSync(path.join(proj, inlineMap.capture));
      for (const rec of inlineMap.blocks || []) {
        renderTotal++;
        const parser = rec.kind === "importmap" ? "json" : rec.kind === "style" ? "css" : "js";
        const src = buf.subarray(rec.byteStart, rec.byteEnd).toString("utf8");
        const got = await prettier.format(src, { parser });
        const want = fs.readFileSync(path.join(proj, rec.file), "utf8");
        if (got === want) renderOK++;
        else problem(`${rec.file}: does not re-render byte-exact under pinned prettier ${PINNED} ({parser:${parser}})`);
      }
    }
    renderNote = `${renderOK}/${renderTotal} pretties re-render byte-exact under pinned prettier ${PINNED}`;
  }

  if (problems.length) {
    console.error(`AUDIT FAIL — ${problems.length} problem(s)`);
    for (const p of problems) console.error("  " + p);
    process.exit(1);
  }
  console.log(
    `AUDIT PASS — ${sections.length} spec sections (${roundOK}/${ranged} src↔pretty round-trips byte-exact, ` +
      `${tiledOK}/${bySource.size} pretty sources tiled contiguously, ` +
      `${skippedOK}/${skippedTotal} skipped export-table sections re-verified textually, ` +
      `${checkOK}/${onDiskDerived.length} derived slices + ${prettyOK}/${prettyParsed} readable/*.pretty.js parse standalone (node --input-type=module --check -), ` +
      `${captureSrcNames.size} captured src/ modules on disk (byte-exact, manifest-listed), ` +
      `${derivedOK}/${prettyFiles.length} pretties provably distinct from their capture source, ` +
      `${indexOnlyFiles.size} index-only wholeFile/skipped sections carry no src file, ` +
      `${readingCopyOK}/${readingCopySections.length} reading-copy sections compared against their capture, ` +
      `${inlineBlocks} inline content block(s) with twins + index-inline-map.json, ` +
      `${resolvedImports}/${checkedImports} imports resolve inside the capture (${whitelisted} whitelisted machinery, ` +
      `${importMap.size} import-map entries), ` +
      `${renderNote}, capture manifest free of derived layers)`,
  );
})();
