// check-links.mjs — does every export table in unburied's derived layer name
// only bindings the layer actually declares?
//
// THE CLASS THIS GATE GUARDS
//   In an ES module, `export { x }` names a binding OF THAT MODULE. When x is
//   not declared there the module does not link: it is a hard SyntaxError
//   ("Export 'x' is not defined"), and the file cannot be imported at all.
//
//   unburied's own gates cannot see this class:
//     - check-exports.mjs compares a CAPTURE's export table with the LAYER's
//       PUBLIC names. It never asks whether the layer's own export statement
//       names a binding the layer declares.
//     - verify.mjs re-hashes the capture against .upstream/manifest.json.
//     - audit.js proves every slice parses standalone with the exact gate
//       command `node --input-type=module --check -`, and proves every
//       readable pretty does too — so a WHOLE-FILE module is already covered
//       against a broken export table. What it does not cover is a module
//       that the layer cut into SLICES: a slice's export table names a
//       binding a SIBLING slice declares, and the slice alone does not
//       parse.
//
// WHAT IT CHECKS
//   For every module the layer was cut from that carries an export table:
//     1. the module is reassembled from the LAYER's OWN bytes — every slice
//        contributes its payload, and every range the layer does not carry
//        contributes the mirror's own recorded bytes — and the reassembly is
//        linked with `node --input-type=module --check -`;
//     2. a file of that module that carries an export table and whose own
//        strict-ESM check reports "Export 'x' is not defined" exports a name
//        it does not declare. If the module links, the binding is declared by
//        a SIBLING SLICE: the layer is cut from one scope, the pieces
//        together are the module, and the file is a FRAGMENT, not a defect.
//        If the module does not link either, the binding exists NOWHERE and
//        that is a real break, which the gate names.
//
// THIS MIRROR'S SHAPE — WHAT THE GATE HAD TO BE ADAPTED FOR
//   · THE LAYER ROOT IS THE MIRROR ROOT, AND src/ IS NOT ALL LAYER. This
//     mirror's derived layer has two parts: src/ holds the app slices, and
//     readable/ holds the whole-file vendor copies the spec records as
//     `wholeFile` sections whose `file` names the reading copy
//     (readable/vendor__three__...). The spec's own `derivedRoot` is ".".
//
//     The lookup is therefore NOT "src/ and nothing else": a section's file
//     is resolved under the derived root first, and a section whose file is
//     not there is resolved under src/ — the app slices are named
//     <tag>-NN.js and live in src/, while the vendor copies are named
//     readable/<tag>.pretty.js and live in readable/.
//
//   · src/ ALSO HOLDS THE CAPTURES. The origin serves the app under /src/,
//     so the byte-exact captured modules (src/main.js, src/audio.js, …) sit
//     in the SAME directory as the derived slices (src/src__main-01.js, …).
//     A lookup that matched loosely could read a capture as if it were a
//     layer file, so the gate resolves a section's file by EXACT name only,
//     and it never falls back to a path the spec did not name.
//
//   · NO RENAME LAYER. The spec records no renameBindings and the mirror
//     has no rename map, so the layer's identifiers are the capture's own
//     and the recorded bytes need no rewriting into another spelling.
//
// WHY THE ENGINE IS THE JUDGE
//   The question that matters is the one the engine answers: does this text
//   link? So the gate asks the engine — once for the file, once for the
//   module the file belongs to, once per candidate sibling — instead of
//   asking a parser which names it thinks a file declares.
//
// NOTHING IS INVENTED
//   The reassembly is the layer's own bytes plus the mirror's own recorded
//   ranges. Nothing is re-derived and nothing is guessed.
//
// WHAT IT DOES NOT COVER
//   - The IMPORT side of the layer graph (a named import the target does not
//     export) is a different class with a different owner.
//   - A module that does not link even after the reassembly cannot be judged
//     for this class; the gate says so instead of guessing.
//
// usage: node tools/check-links.mjs [--quiet]
// Exits 1 if a layer file exports a binding the layer does not declare.

import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const proj = path.resolve(here, "..");
const srcDir = path.join(proj, "src");
const quiet = process.argv.includes("--quiet");

const read = (p) => {
  try {
    return fs.readFileSync(p, "utf8");
  } catch {
    return null;
  }
};

/**
 * The engine's own verdict on a text: does it link as an ES module?
 * `--input-type=module --check -` is the strict-ESM path: the CJS path lets an
 * export table name a binding the module never declares through.
 */
function esmCheck(text) {
  const r = spawnSync(process.execPath, ["--input-type=module", "--check", "-"], {
    input: text,
    encoding: "utf8",
    maxBuffer: 256 * 1024 * 1024,
  });
  if (r.status === 0) return { ok: true, missing: null, error: null };
  const err = String(r.stderr || "") + String(r.stdout || "");
  const m = /Export '([^']+)' is not defined/.exec(err);
  const lines = err.trim().split("\n").filter((l) => l.trim());
  const said = lines.find((l) => /Error/.test(l)) || lines[lines.length - 1] || err.trim();
  return { ok: false, missing: m ? m[1] : null, error: said.trim() };
}

const ESCAPE_RE = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** The export tables of a text, as [start, end) spans. */
function exportTableSpans(text) {
  const spans = [];
  const re = /\bexport\s*\{/g;
  let m;
  while ((m = re.exec(text)) !== null) {
    const brace = text.indexOf("{", m.index);
    if (brace < 0) break;
    let depth = 1;
    let i = brace + 1;
    while (i < text.length && depth > 0) {
      if (text[i] === "{") depth++;
      else if (text[i] === "}") depth--;
      i++;
    }
    if (depth !== 0) break;
    spans.push([m.index, i]);
    re.lastIndex = i;
  }
  return spans;
}

/**
 * The names a file's export statement exports that the file itself does not
 * declare. The engine names one per check, so the check is repeated with the
 * offending specifier removed each time: what is left is the whole list.
 */
function undeclaredExports(text) {
  const out = [];
  let probe = text;
  for (let i = 0; i < 500; i++) {
    const v = esmCheck(probe);
    if (v.ok || !v.missing) break;
    if (out.includes(v.missing)) break;
    out.push(v.missing);
    const next = blankSpecifier(probe, v.missing);
    if (next === probe) break;
    probe = next;
  }
  return out;
}

/** Remove the export specifier whose SOURCE name is `name` (the probe only). */
function blankSpecifier(text, name) {
  return text.replace(/\bexport\s*\{([^}]*)\}/g, (whole, body) => {
    const kept = body.split(",").filter((part) => {
      const seg = part.trim();
      if (!seg) return false; // an empty element is a syntax error
      const m = /^([A-Za-z_$][\w$]*)\s+as\s+/.exec(seg);
      return (m ? m[1] : seg) !== name;
    });
    return whole.replace(body, kept.join(", "));
  });
}

/**
 * Erase every mention of `name` in a text, EXCEPT inside an export table:
 * the export table is the question being asked, so it must keep naming the
 * name. A module whose declaration of the name has been erased then fails to
 * link, and that is how the declaring slice is found.
 */
function eraseName(text, name, probe) {
  const spans = exportTableSpans(text);
  const re = new RegExp(`(?<![\\w$])${ESCAPE_RE(name)}(?![\\w$])`, "g");
  let out = "";
  let at = 0;
  for (const [s, e] of spans) {
    out += text.slice(at, s).replace(re, probe);
    out += text.slice(s, e);
    at = e;
  }
  out += text.slice(at).replace(re, probe);
  return out;
}

/** The slice's payload: its text without the header comment lines. */
function payloadLines(text) {
  const raw = text.split("\n");
  if (raw.length && raw[raw.length - 1] === "") raw.pop(); // the final newline
  let h = 0;
  while (h < raw.length && /^\s*\/\//.test(raw[h])) h++;
  return raw.slice(h);
}

// ── the mirror's own record of the layer ───────────────────────────────────
const specPath = path.join(proj, "split-spec.json");
if (!fs.existsSync(specPath)) {
  console.log("check-links: no split-spec.json — unburied has no derived layer to check");
  process.exit(0);
}
const spec = JSON.parse(fs.readFileSync(specPath, "utf8"));

/**
 * The layer file a section names, if it is on disk.
 *
 * THE LAYER ROOT IS THE MIRROR ROOT, NOT src/. This mirror's derived layer
 * has two parts: the app slices live in src/ under their <tag>-NN.js names,
 * and the whole-file vendor copies live in readable/ under their reading-copy
 * names. The spec's own derivedRoot is ".".
 *
 * The lookup is by EXACT name only. src/ ALSO holds the byte-exact captured
 * modules (src/main.js and friends), so a loose match could read a capture as
 * if it were a layer file.
 */
function layerFileOf(sec) {
  const rel = String(sec.file || "").split(path.sep).join("/");
  if (!rel) return null;
  for (const c of [path.join(proj, rel), path.join(srcDir, rel)]) {
    try {
      if (fs.existsSync(c) && fs.statSync(c).isFile()) return c;
    } catch {
      /* not a layer file */
    }
  }
  return null;
}

/**
 * The bytes of a range the layer does not carry, from the mirror's own
 * record: the section's own `text` when it has one, and otherwise the
 * reading copy's range.
 */
function recordedText(sec, sourceFile) {
  if (typeof sec.text === "string" && sec.text.length) return sec.text;
  const orig = read(path.join(proj, sourceFile));
  if (orig === null) return null;
  if (!Number.isInteger(sec.startLine) || !Number.isInteger(sec.endLine)) return null;
  return orig.split("\n").slice(sec.startLine - 1, sec.endLine).join("\n");
}

// ── the module ─────────────────────────────────────────────────────────────
/**
 * The parts of one module, in order: every slice contributes its payload, and
 * every range the layer does not carry contributes the mirror's own recorded
 * bytes.
 *
 * The slices are CONCATENATED, not mapped onto line numbers: a slice is cut
 * mid-statement, so its payload is a fragment, and a fragment only means
 * anything in the company of its neighbours.
 */
function moduleParts(sourceFile, sections) {
  const orig = read(path.join(proj, sourceFile));
  const pristine = orig === null ? null : orig.split("\n");
  const parts = [];
  let prevEnd = 0;
  let sliceNo = 0;
  for (const sec of sections) {
    if (!Number.isInteger(sec.startLine) || !Number.isInteger(sec.endLine)) continue;
    if (pristine && sec.startLine > prevEnd + 1) {
      parts.push({
        kind: "original",
        file: sourceFile,
        text: pristine.slice(prevEnd, sec.startLine - 1).join("\n"),
      });
    }
    const f = layerFileOf(sec);
    if (f) {
      parts.push({
        kind: "slice",
        file: path.relative(proj, f).split(path.sep).join("/"),
        text: payloadLines(read(f)).join("\n"),
        sliceNo: sliceNo++,
      });
    } else {
      const t = recordedText(sec, sourceFile);
      if (t !== null) parts.push({ kind: "original", file: sourceFile, text: t });
    }
    if (sec.endLine > prevEnd) prevEnd = sec.endLine;
  }
  return parts;
}

const moduleText = (parts) => parts.map((p) => p.text).join("\n");

/**
 * The slice that DECLARES `name`, when the module's declaration statement
 * begins in an EARLIER slice than its declarator does.
 *
 * A cut module can split one declaration statement across slices: the
 * `var`/`let`/`const` head sits in one slice and the declarators that
 * follow it in the next. The name is bound by the statement, so the slice
 * that holds the HEAD is the one that declares it.
 */
function declarationHeadSlice(parts, name, afterSlice) {
  const text = moduleText(parts);
  const re = new RegExp(`(?<![\\w$])${ESCAPE_RE(name)}(?![\\w$])`, "g");
  let m;
  while ((m = re.exec(text)) !== null) {
    const at = m.index;
    let offset = 0;
    let sliceOf = null;
    for (const part of parts) {
      const end = offset + part.text.length;
      if (at >= offset && at < end) {
        sliceOf = part;
        break;
      }
      offset = end + 1;
    }
    if (!sliceOf || sliceOf.kind !== "slice") continue;
    if (afterSlice !== null && sliceOf.sliceNo > afterSlice) continue;
    // only a DECLARATOR can be governed by a statement head: the name must
    // sit where a declarator sits (after a comma or an "=")
    const beforeName = text.slice(0, at).replace(/\s+$/, "");
    if (!/(,|=)$/.test(beforeName)) continue;
    let depth = 0;
    for (let i = at - 1; i >= 0; i--) {
      const c = text[i];
      if (c === "}" || c === ")" || c === "]") {
        depth++;
        continue;
      }
      if (c === "{" || c === "(" || c === "[") {
        if (depth === 0) break;
        depth--;
        continue;
      }
      if (depth !== 0) continue;
      const head = /(^|[^\w$])(var|let|const)\s*$/.exec(text.slice(Math.max(0, i - 6), i + 1));
      if (head) {
        const headAt = text.lastIndexOf(head[2], at);
        if (headAt >= 0) {
          let off = 0;
          for (const part of parts) {
            const end = off + part.text.length;
            if (headAt >= off && headAt < end) return part.kind === "slice" ? part.file : null;
            off = end + 1;
          }
        }
        return null;
      }
    }
  }
  return null;
}

/**
 * The slice of the module that DECLARES `name`, found by asking the engine:
 * the name is erased from a prefix of the slices at a time, and the slice
 * whose erasure breaks the module is the one that declared it.
 */
function declaringSlice(parts, name) {
  const slices = parts.filter((p) => p.kind === "slice");
  if (slices.length < 2) return null;
  const probe = "__probe_" + name.replace(/[^A-Za-z0-9_$]/g, "_");
  const withPrefix = (k) => {
    let n = -1;
    return parts
      .map((p) => {
        if (p.kind !== "slice") return p.text;
        n++;
        return n <= k ? eraseName(p.text, name, probe) : p.text;
      })
      .join("\n");
  };
  // erasing EVERY slice must break the module (the name is declared nowhere
  // else); if it does not, the name is not in this module at all.
  if (esmCheck(withPrefix(slices.length - 1)).ok) return null;
  let lo = 0;
  let hi = slices.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (esmCheck(withPrefix(mid)).ok) lo = mid + 1;
    else hi = mid;
  }
  const found = slices[lo];
  // the declarator may sit in a later slice than the statement head that
  // declares it; the head's slice is the one that declares the binding
  const head = declarationHeadSlice(parts, name, found.sliceNo);
  return head || found.file;
}

// ── the layer ──────────────────────────────────────────────────────────────
// the modules, by the reading copy they were cut from
const modules = new Map();
for (const sec of spec.sections || []) {
  if (!sec.file || !sec.sourceFile) continue;
  if (!Number.isInteger(sec.startLine) || !Number.isInteger(sec.endLine)) continue;
  // a CSS source is not a module and is not judged for this class
  if (!/\.(js|mjs)$/i.test(sec.file)) continue;
  // a wholeFile section's derived text is a WHOLE module, not a cut one; it
  // is judged below, as a whole.
  if (sec.wholeFile) continue;
  if (!modules.has(sec.sourceFile)) modules.set(sec.sourceFile, []);
  modules.get(sec.sourceFile).push(sec);
}
for (const list of modules.values()) list.sort((a, b) => a.startLine - b.startLine);

const problems = [];
const fragments = [];
const unjudged = [];
let withTable = 0;
let wholeFiles = 0;
let modulesChecked = 0;
let modulesWithTable = 0;

for (const [sourceFile, sections] of [...modules.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
  // the slices of this module that the layer actually carries
  const carriers = [];
  for (const sec of sections) {
    const f = layerFileOf(sec);
    if (!f) continue;
    const text = read(f);
    if (text === null || !/\bexport\s*\{/.test(text)) continue;
    withTable++;
    carriers.push({ sec, file: f, rel: path.relative(proj, f).split(path.sep).join("/") });
  }
  const sliceCount = sections.filter((s) => layerFileOf(s)).length;
  if (sliceCount === 0) continue; // the layer carries no slice of this source
  modulesChecked++;

  const parts = moduleParts(sourceFile, sections);
  const text = moduleText(parts);
  if (!/\bexport\s*\{/.test(text)) continue; // the module carries no export table
  modulesWithTable++;

  let module = esmCheck(text);
  if (!module.ok && !module.missing) {
    // The module does not parse as it stands. That can be a module whose own
    // text is not a module, or one whose export table sits inside a
    // statement; the second case is still answerable.
    const spans = exportTableSpans(text);
    if (spans.length) {
      let at = 0;
      let body = "";
      const tables = [];
      for (const [s, e] of spans) {
        body += text.slice(at, s);
        tables.push(text.slice(s, e));
        at = e;
      }
      body += text.slice(at);
      const alt = esmCheck(body + "\n" + tables.join("\n") + "\n");
      if (alt.ok || alt.missing) module = alt;
    }
  }

  if (!module.ok && module.missing) {
    // The module as the LAYER's own bytes export a name nothing declares.
    const names = undeclaredExports(text);
    const listed = names.length ? names : [module.missing];
    problems.push(
      `${sourceFile}: the layer's own bytes export { ${listed.join(", ")} } but no binding named ${listed[0]} is declared in any slice of that module (export table in: ${carriers.map((c) => c.rel).join(", ") || "an index-only tail"})`,
    );
    continue;
  }
  if (!module.ok) {
    unjudged.push(`${sourceFile}: the module does not link as an ES module (${module.error}) — the binding cannot be located`);
    continue;
  }

  for (const c of carriers) {
    const missing = undeclaredExports(read(c.file));
    if (!missing.length) continue; // the file links on its own, or fails for another reason
    const where = [];
    for (const name of missing) {
      const s = declaringSlice(parts, name);
      where.push(`${name} (declared by ${s ? s : "a sibling slice"})`);
    }
    fragments.push(
      `${c.rel}: exports { ${missing.join(", ")} } — ${where.join("; ")}: a sibling slice of ${sourceFile} declares it, so the module is whole (fragment, not a defect)`,
    );
  }
}

// ── the WHOLE-FILE derived texts ───────────────────────────────────────────
//
// A whole-file section's derived text is a WHOLE module: it is the whole
// library, prettified. Its export table names bindings of ITS OWN scope, so
// a name it does not declare there is a real break in a whole module.
for (const sec of spec.sections || []) {
  if (!sec.wholeFile || !sec.file) continue;
  if (!/\.(js|mjs)$/i.test(sec.file)) continue;
  const f = layerFileOf(sec);
  if (!f) continue;
  const text = read(f);
  if (text === null || !/\bexport\s*\{/.test(text)) continue;
  wholeFiles++;
  const missing = undeclaredExports(text);
  if (!missing.length) continue; // it links on its own
  problems.push(
    `${path.relative(proj, f).split(path.sep).join("/")}: the whole-file derived text exports { ${missing.join(", ")} } but declares no binding named ${missing[0]} — a whole module exporting an undeclared name is a real break`,
  );
}

if (!quiet) {
  console.log(`check-links: ${modulesChecked} module(s) in the derived layer`);
  console.log(`  modules carrying an export table: ${modulesWithTable}`);
  console.log(`  layer files carrying an export table: ${withTable}`);
  console.log(`  whole-file derived texts carrying an export table: ${wholeFiles}`);
  console.log(`  fragment exports (a sibling slice of the same module declares the binding): ${fragments.length}`);
  for (const f of fragments) console.log(`    ${f}`);
  if (unjudged.length) {
    console.log(`  not judged (the module does not link, so the binding cannot be located): ${unjudged.length}`);
    for (const u of unjudged) console.log(`    ${u}`);
  }
  if (problems.length) {
    console.log(`  LINK PROBLEMS: ${problems.length}`);
    for (const p of problems) console.log(`    ${p}`);
  }
}
if (problems.length) process.exit(1);
if (!quiet) console.log("  every export table names a binding the layer declares: YES");
