#!/usr/bin/env node
/**
 * verify.mjs — accuracy checker for the generated artifact (quality gate; must report 0 failures).
 *
 * It **does not trust** inventory.json and does not reuse scan.mjs's regexes: every assertion goes
 * straight back to the source on disk. That is what keeps "the inventory is accurate" from being two programs nodding at each other.
 *
 *   MISSING_FILE    a path in the file inventory does not exist on disk
 *   LINE_DRIFT      the line count in the file inventory disagrees with the real file
 *   SYMBOL_ABSENT   the symbol is not at the file:line it claims (for an SFC it must also be inside <script>)
 *   KIND_MISMATCH   the claimed kind disagrees with the real declaration keyword on that line / the line numbers contradict each other
 *   SNIPPET_DRIFT   a source snippet disagrees with the real content of that line range
 *   GROUP_MISMATCH  a symbol-inventory group header disagrees with that file's real line count
 *   UNCOVERED_FILE  a source file in the repository is claimed by no rectangle
 *   BROKEN_REF      child / links (including port indices) / RET / FLOWS / FEATURES point at a diagram, block or port that does not exist
 *
 * Usage: node verify.mjs <html> <repoRoot> [srcRoot ...]
 */
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join, extname, relative, sep } from 'node:path';
import vm from 'node:vm';
import { SRC_EXT, JS_EXT, SFC_EXT, SKIP_DIR, ROOT_HINTS, isTest, scriptRanges, inScript } from './lang.mjs';

const [, , HTML, REPO, ...ROOTS_IN] = process.argv;
if (!HTML || !REPO) { console.error('Usage: node verify.mjs <html> <repoRoot> [srcRoot ...]'); process.exit(2); }

/* ---------------------------------------------- recover the data section from the HTML */
const html = readFileSync(HTML, 'utf8');
const start = html.indexOf('<script>') + '<script>'.length;
const engineAt = html.indexOf('/* ---------------------------------------------------------------- rendering engine */');
if (start < 8 || engineAt < 0) { console.error('× cannot find the data-section boundaries'); process.exit(2); }
const ctx = { console };
vm.createContext(ctx);
vm.runInContext(html.slice(start, engineAt) + '\n;globalThis.__X={D,FILES,CLS,RET,CODE,FLOWS,FEATURES};', ctx);
const { D, FILES, CLS, RET, CODE, FLOWS, FEATURES } = ctx.__X;

/* ---------------------------------------------- the real files (rescanned independently)
   The definition of the file set is shared with scan.mjs through lang.mjs — it must be identical, or
   UNCOVERED_FILE is vacuous for any extension "scan knows and verify does not" and "full coverage"
   becomes a lie. The symbol-extraction regexes are still written separately; independence lives there. */
const roots = ROOTS_IN.length ? ROOTS_IN : (ROOT_HINTS.filter(h => existsSync(join(REPO, h))) .length
  ? ROOT_HINTS.filter(h => existsSync(join(REPO, h))) : ['.']);
const realFiles = [];
for (const r of roots) walk(join(REPO, r));
function walk(dir) {
  let es; try { es = readdirSync(dir, { withFileTypes: true }); } catch { return; }
  for (const e of es) {
    const p = join(dir, e.name);
    if (e.isDirectory()) { if (!SKIP_DIR.has(e.name) && !e.name.startsWith('.')) walk(p); }
    else if (e.isFile() && SRC_EXT.has(extname(e.name)) && !isTest(e.name)) {
      realFiles.push(relative(REPO, p).split(sep).join('/'));
    }
  }
}

const cache = new Map();
const linesOf = p => {
  if (!cache.has(p)) cache.set(p, existsSync(join(REPO, p)) ? readFileSync(join(REPO, p), 'utf8').split('\n') : null);
  return cache.get(p);
};

/* ---------------------------------------------- assertions */
const fail = [];
const err = (code, msg) => fail.push({ code, msg });
const stat = { files:0, symbols:0, groups:0, snippets:0, ports:0, blocks:0 };

const claimed = new Set();
for (const [key, rows] of Object.entries(FILES)) {
  for (const [pth, declared] of rows) {
    stat.files++; claimed.add(pth);
    const src = linesOf(pth);
    if (!src) { err('MISSING_FILE', `${key} → ${pth}`); continue; }
    if (typeof declared === 'number' && declared !== src.length) {
      err('LINE_DRIFT', `${key} → ${pth}: inventory says ${declared}, the real file has ${src.length}`);
    }
  }
}

/** TS/JS requires the declaration line to begin with export; an SFC requires it inside the script block; other languages only require the symbol to be on that line. */
const JSFAM = JS_EXT;
const SFCFAM = new Set(SFC_EXT);
const sfcRangeCache = new Map();
const scriptRangesOf = p => {
  if (!sfcRangeCache.has(p)) sfcRangeCache.set(p, scriptRanges(linesOf(p) || []));
  return sfcRangeCache.get(p);
};
const KIND_PAT = {
  'abstract class': /^export\s+abstract\s+class\s+/,
  'interface':      /^export\s+interface\s+/,
  'type':           /^export\s+type\s+/,
  'enum':           /^export\s+(const\s+)?enum\s+/,
  'class':          /^export\s+(default\s+)?class\s+/,
  'Service':        /^export\s+(default\s+)?class\s+/,
  // `export default function Foo()` is a function declaration too — components/hooks usually look like this
  'function':       /^export\s+(default\s+)?(async\s+)?(function|const|let|var)\s+/,
  'hook':           /^export\s+(default\s+)?(async\s+)?(function|const|let|var)\s+/,
  'component':      /^export\s+(default\s+)?(async\s+)?(function|const|let|var)\s+/,
  'slice':          /^export\s+(default\s+)?(async\s+)?(function|const|let|var)\s+/,
  'const':          /^export\s+(const|let|var)\s+/,
  're-export':      /^export\s*[{*]/,
  'default':        /^export\s+default\b/,
};

for (const [key, rows] of Object.entries(CLS)) {
  for (const [name, meta, , flag, codeKey] of rows) {
    if (flag === 'g') {
      stat.groups++;
      const src = linesOf(name);
      if (!src) { err('MISSING_FILE', `${key} group header → ${name}`); continue; }
      const m = String(meta).match(/^(\d+) lines$/);
      if (!m || Number(m[1]) !== src.length) {
        err('GROUP_MISMATCH', `${key} group header ${name}: inventory ${meta}, real ${src.length} lines`);
      }
      continue;
    }
    stat.symbols++;
    if (!codeKey) { err('SYMBOL_ABSENT', `${key} → ${name}: missing the file:line key`); continue; }
    const at = codeKey.lastIndexOf(':');
    const pth = codeKey.slice(0, at), lineNo = Number(codeKey.slice(at + 1));
    const src = linesOf(pth);
    if (!src) { err('MISSING_FILE', `${key} → ${pth}`); continue; }
    const line = src[lineNo - 1];
    if (line === undefined) { err('SYMBOL_ABSENT', `${pth}:${lineNo} out of range (${src.length} lines)`); continue; }
    if (!name.startsWith('* →') && name !== 'default' && !line.includes(name)) {
      err('SYMBOL_ABSENT', `${pth}:${lineNo} has no ${name} | actual: ${line.trim().slice(0, 90)}`); continue;
    }
    const declaredLine = Number(String(meta).split('· L')[1]);
    if (declaredLine !== lineNo) {
      err('KIND_MISMATCH', `${pth} ${name}: counted line L${declaredLine} disagrees with key line ${lineNo}`);
    }
    const ext = extname(pth);
    // A classic script (a browser extension content script, say) has no export anywhere; its top-level
    // declarations are bare. Demanding `^export` there would fail every symbol scan extracted, so branch
    // on whether the file contains any export at all: it does → strict ES-module check; it never does → only check the symbol is on that line.
    if (JSFAM.has(ext) && (linesOf(pth) || []).some(l => /^export\s/.test(l))) {
      if (!/^export\b/.test(line)) {
        err('SYMBOL_ABSENT', `${pth}:${lineNo} is not an export declaration line | actual: ${line.trim().slice(0, 90)}`); continue;
      }
      const pat = KIND_PAT[String(meta).split(' · ')[0]];
      if (pat && !pat.test(line)) {
        err('KIND_MISMATCH', `${pth}:${lineNo} claims ${String(meta).split(' · ')[0]} | actual: ${line.trim().slice(0, 90)}`);
      }
    } else if (SFCFAM.has(ext) && !inScript(scriptRangesOf(pth), lineNo)) {
      // Single-file component: the name appearing in the template or the style does not count; it must be a declaration inside <script>
      err('SYMBOL_ABSENT', `${pth}:${lineNo} is not inside a <script> block | actual: ${line.trim().slice(0, 90)}`);
    }
  }
}

for (const [k, cd] of Object.entries(CODE)) {
  stat.snippets++;
  const src = linesOf(cd.f);
  if (!src) { err('MISSING_FILE', `CODE ${k} → ${cd.f}`); continue; }
  cd.s.forEach((got, i) => {
    const want = (src[cd.l - 1 + i] ?? '').replace(/\t/g, '  ').replace(/\s+$/, '');
    if (got !== want) err('SNIPPET_DRIFT', `${cd.f}:${cd.l + i}\n      snippet: ${got}\n      real:    ${want}`);
  });
}

for (const f of realFiles) if (!claimed.has(f)) err('UNCOVERED_FILE', f);

const blockKeys = new Set();
for (const d of Object.values(D)) for (const b of d.blocks) blockKeys.add(d.id + '/' + b.id);
for (const d of Object.values(D)) {
  stat.blocks += d.blocks.length;
  const ids = new Set(d.blocks.map(b => b.id));
  if (d.parent && !D[d.parent]) err('BROKEN_REF', `${d.id} parent does not exist: ${d.parent}`);
  for (const b of d.blocks) {
    stat.ports += (b.in || []).length + (b.out || []).length;
    if (b.child && !D[b.child]) err('BROKEN_REF', `${d.id}/${b.id} child does not exist: ${b.child}`);
  }
  for (const L of d.links || []) {
    if (!ids.has(L.s[0])) err('BROKEN_REF', `${d.id} link source block does not exist: ${L.s[0]}`);
    if (!ids.has(L.t[0])) err('BROKEN_REF', `${d.id} link target block does not exist: ${L.t[0]}`);
    const sb = d.blocks.find(b => b.id === L.s[0]);
    if (sb && !(sb.out || [])[L.s[1]]) err('BROKEN_REF', `${d.id}/${L.s[0]} has no output port #${L.s[1]} (it has ${(sb.out || []).length})`);
    // The target input port is not checked: the engine synthesizes one from the source port's five fields (which is why an L4 state machine only writes out)
  }
}
for (const k of Object.keys(RET)) {
  const m = k.match(/^(.+)\/(in|out):(\d+)$/);
  if (!m) { err('BROKEN_REF', `malformed RET key: ${k}`); continue; }
  if (!blockKeys.has(m[1])) { err('BROKEN_REF', `RET points at a block that does not exist: ${k}`); continue; }
  const dId = m[1].slice(0, m[1].lastIndexOf('/')), bId = m[1].slice(m[1].lastIndexOf('/') + 1);
  const b = D[dId]?.blocks.find(x => x.id === bId);
  const arr = m[2] === 'in' ? (b?.in || []) : (b?.out || []);
  if (!arr[Number(m[3])]) err('BROKEN_REF', `RET points at a port that does not exist: ${k}`);
}
for (const fl of FLOWS) for (const st of fl.steps) if (!blockKeys.has(st.key)) {
  err('BROKEN_REF', `flow "${fl.name}" has a step pointing at a block that does not exist: ${st.key}`);
}
for (const ft of FEATURES) if (!blockKeys.has(ft.key)) err('BROKEN_REF', `feature "${ft.n}" points at a block that does not exist: ${ft.key}`);

/* ---------------------------------------------- report */
const byCode = {};
for (const f of fail) (byCode[f.code] ||= []).push(f.msg);
console.log('════════ architecture map verification report ════════');
console.log(`  ${Object.keys(D).length} diagrams · ${stat.blocks} rectangles · ${stat.ports} ports · ${Object.keys(RET).length} field tables`);
console.log(`  file inventory ${stat.files} rows (${claimed.size} deduplicated / ${realFiles.length} present in repo)`);
console.log(`  symbol inventory ${stat.symbols} rows · ${stat.groups} group headers · ${stat.snippets} source snippets`);
console.log(`  ${FLOWS.length} flows · ${FEATURES.length} features`);
console.log('────────────────────────────────────');
for (const c of ['MISSING_FILE','LINE_DRIFT','SYMBOL_ABSENT','KIND_MISMATCH','SNIPPET_DRIFT','GROUP_MISMATCH','UNCOVERED_FILE','BROKEN_REF']) {
  const list = byCode[c] || [];
  console.log(`  ${list.length === 0 ? '✓' : '×'} ${c.padEnd(15)} ${list.length}`);
  list.slice(0, 12).forEach(m => console.log('      ' + m));
  if (list.length > 12) console.log(`      … ${list.length - 12} more`);
}
console.log('────────────────────────────────────');
console.log(fail.length === 0 ? '  ✓ all assertions passed (0 failures)' : `  × ${fail.length} failures`);
process.exit(fail.length ? 1 : 0);
