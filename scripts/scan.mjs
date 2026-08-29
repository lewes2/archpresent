#!/usr/bin/env node
/**
 * scan.mjs — read-only code inventory extractor.
 *
 * Walks the repository's source roots and, for every non-test source file, produces
 *   { path, lines, exports: [{ name, kind, line }] }
 * Writes <workDir>/inventory.json and prints a directory summary to stderr (used to design blocks).
 *
 * Usage:
 *   node scan.mjs <repoRoot> <workDir> [srcRoot ...]
 * With no srcRoot given, source directories under the repository root are auto-detected.
 */
import { readFileSync, readdirSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, relative, sep, extname } from 'node:path';
import { SFC_EXT, SKIP_DIR, ROOT_HINTS, isTest, scriptRanges } from './lang.mjs';

const [, , REPO, WORK, ...ROOTS_IN] = process.argv;
if (!REPO || !WORK) {
  console.error('Usage: node scan.mjs <repoRoot> <workDir> [srcRoot ...]');
  process.exit(2);
}

/* ---------------------------------------------------------- language support */
/** Per language: extension → top-level declaration match. `kind` uses one shared vocabulary. */
const LANGS = [
  {
    name: 'ts', ext: ['.ts', '.tsx', '.mts', '.cts', '.js', '.jsx', '.mjs', '.cjs'],
    rules: [
      [/^export\s+abstract\s+class\s+([A-Za-z_$][\w$]*)/, 'abstract class'],
      [/^export\s+(?:default\s+)?class\s+([A-Za-z_$][\w$]*)/, 'class'],
      [/^export\s+interface\s+([A-Za-z_$][\w$]*)/, 'interface'],
      [/^export\s+type\s+([A-Za-z_$][\w$]*)/, 'type'],
      [/^export\s+(?:const\s+)?enum\s+([A-Za-z_$][\w$]*)/, 'enum'],
      [/^export\s+(?:default\s+)?(?:async\s+)?function\s*\*?\s*([A-Za-z_$][\w$]*)/, 'function'],
      [/^export\s+(?:const|let|var)\s+([A-Za-z_$][\w$]*)/, 'const'],
    ],
    reexport: true,
  },
  {
    name: 'py', ext: ['.py'],
    rules: [
      [/^class\s+([A-Za-z_][\w]*)/, 'class'],
      [/^(?:async\s+)?def\s+([A-Za-z_][\w]*)/, 'function'],
      [/^([A-Z][A-Z0-9_]*)\s*[:=]/, 'const'],
    ],
  },
  {
    name: 'go', ext: ['.go'],
    rules: [
      [/^type\s+([A-Z][\w]*)\s+struct/, 'class'],
      [/^type\s+([A-Z][\w]*)\s+interface/, 'interface'],
      [/^type\s+([A-Z][\w]*)/, 'type'],
      [/^func\s+\([^)]*\)\s+([A-Z][\w]*)/, 'function'],
      [/^func\s+([A-Z][\w]*)/, 'function'],
      [/^(?:const|var)\s+([A-Z][\w]*)/, 'const'],
    ],
  },
  {
    name: 'rs', ext: ['.rs'],
    rules: [
      [/^pub\s+struct\s+([A-Za-z_][\w]*)/, 'class'],
      [/^pub\s+enum\s+([A-Za-z_][\w]*)/, 'enum'],
      [/^pub\s+trait\s+([A-Za-z_][\w]*)/, 'interface'],
      [/^pub\s+type\s+([A-Za-z_][\w]*)/, 'type'],
      [/^pub\s+(?:async\s+)?fn\s+([A-Za-z_][\w]*)/, 'function'],
      [/^pub\s+(?:const|static)\s+([A-Za-z_][\w]*)/, 'const'],
    ],
  },
  {
    // C/C++: only declarations at **column 0** count. Class members are indented, so they are excluded
    // naturally — .h then contributes the "type surface" (class/struct/enum/using) and .cpp the
    // "implementation surface" (Class::method definitions, free functions). Neither drowns the other, which is what keeps per-block symbol counts manageable.
    name: 'cpp', ext: ['.c', '.cc', '.cpp', '.cxx', '.h', '.hh', '.hpp', '.hxx'],
    rules: [
      [/^(?:template\s*<[^>]*>\s*)?class\s+(?:[A-Z][A-Z0-9_]*_EXPORT\s+)?([A-Za-z_]\w*)\s*(?:final\s*)?(?::|\{|;|$)/, 'class'],
      [/^(?:template\s*<[^>]*>\s*)?struct\s+([A-Za-z_]\w*)\s*(?:final\s*)?(?::|\{|;|$)/, 'class'],
      [/^enum\s+(?:class\s+|struct\s+)?([A-Za-z_]\w*)/, 'enum'],
      [/^namespace\s+([A-Za-z_][\w:]*)\s*\{/, 'namespace'],
      [/^using\s+([A-Za-z_]\w*)\s*=/, 'type'],
      [/^typedef\s+[\w\s:<>,*&]+?\b([A-Za-z_]\w*)\s*;/, 'type'],
      [/^(?:constexpr|const|static|inline|extern)[\w\s:<>,*&\[\]]*?\b([A-Za-z_]\w*)\s*(?:=|\[)/, 'const'],
      // The (?!\s) is required: \s sits inside the character class, and without this prefix the leading
      // indentation is eaten too, so an indented `return R::err(...)` in a body reads as R::err's definition.
      [/^(?!\s)[\w:<>,*&\s]*?\b([A-Za-z_]\w*::[A-Za-z_~]\w*)\s*\(/, 'method'],
      [/^[A-Za-z_][\w:<>,*&\s]+?\b([A-Za-z_]\w*)\s*\([^;]*$/, 'function'],
    ],
  },
  {
    name: 'jvm', ext: ['.java', '.kt', '.cs'],
    rules: [
      [/^\s*public\s+(?:final\s+|abstract\s+|sealed\s+)?class\s+([A-Za-z_][\w]*)/, 'class'],
      [/^\s*public\s+interface\s+([A-Za-z_][\w]*)/, 'interface'],
      [/^\s*public\s+enum\s+([A-Za-z_][\w]*)/, 'enum'],
      [/^\s*public\s+(?:static\s+)?[\w<>\[\],\s]+\s+([A-Za-z_][\w]*)\s*\(/, 'function'],
    ],
  },
  {
    // Single-file components: Vue / Svelte. Only declarations at column 0 inside <script> count —
    // a component's "internal objects" are exactly those top-level state / computed / handlers, never the template.
    name: 'sfc', ext: SFC_EXT, sfc: true,
    rules: [
      [/^(?:export\s+)?interface\s+([A-Za-z_$][\w$]*)/, 'interface'],
      [/^(?:export\s+)?type\s+([A-Za-z_$][\w$]*)\s*[=<]/, 'type'],
      [/^(?:export\s+)?(?:async\s+)?function\s*\*?\s*([A-Za-z_$][\w$]*)/, 'function'],
      [/^(?:export\s+)?(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*[:=]/, 'const'],
    ],
  },
];
/**
 * Classic-script rule set.
 *
 * A browser extension's content script / page script cannot be an ES module; the convention is to wrap
 * the whole file in an IIFE, so "top-level" declarations are actually indented two spaces and there is
 * not a single export. Matching only `^export` extracts zero symbols from that entire layer — exactly
 * the "whole layer silently dropped" failure. So when a file contains no `^export` at all, use this rule
 * set; the allowed indentation depends on the IIFE wrapper (IIFE → 0 or 2 spaces, otherwise column 0 only) so locals inside a function body are not mistaken for top-level.
 */
const CLASSIC_RULES = [
  [/class\s+([A-Za-z_$][\w$]*)/, 'class'],
  [/(?:async\s+)?function\s*\*?\s*([A-Za-z_$][\w$]*)/, 'function'],
  [/(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=/, 'const'],
];
const IIFE_HEAD = /^\(\s*(?:async\s*)?(?:function\b|\(\s*\)\s*=>)/m;
const hasExport = t => /^export\s/m.test(t);

const EXT2LANG = new Map();
for (const l of LANGS) for (const e of l.ext) EXT2LANG.set(e, l);

/** Compiler-macro calls without assignment inside an SFC: defineProps({...}) / defineEmits([...]) etc. */
const SFC_BARE_MACRO = /^(defineProps|defineEmits|defineOptions|defineExpose|defineSlots|defineModel|withDefaults)\s*[(<]/;
/** Destructuring inside an SFC: const { a, b } = defineProps(...) — record the right-hand name */
const SFC_DESTRUCTURED = /^(?:const|let)\s+\{[^}]*\}\s*=\s*([A-Za-z_$][\w$]*)\s*[(<]/;

/* ---------------------------------------------------------- traversal */
/** Non-code assets: perfectly normal inside a source root, nothing to flag */
const ASSET_EXT = new Set(['.css', '.scss', '.sass', '.less', '.json', '.jsonc', '.md', '.mdx', '.txt',
  '.yml', '.yaml', '.toml', '.xml', '.html', '.htm', '.svg', '.png', '.jpg', '.jpeg', '.gif', '.webp',
  '.ico', '.avif', '.woff', '.woff2', '.ttf', '.otf', '.eot', '.map', '.lock', '.snap', '.sql', '.env',
  '.sh', '.bat', '.ps1', '.cmake', '.in', '.rc', '.qrc', '.ui', '.ts_', '.cmd', '.gitignore', '.editorconfig', '.LICENSE', '']);
/** Extensions present in a source root that this scanner does not know → reported at the end, so a whole layer cannot be dropped silently */
const unknownExt = new Map();

function walk(dir, out) {
  let es;
  try { es = readdirSync(dir, { withFileTypes: true }); } catch { return; }
  for (const e of es) {
    const p = join(dir, e.name);
    if (e.isDirectory()) {
      if (SKIP_DIR.has(e.name) || e.name.startsWith('.')) continue;
      walk(p, out);
    } else if (e.isFile()) {
      const ext = extname(e.name);
      if (EXT2LANG.has(ext)) {
        if (!isTest(e.name)) out.push(p);
      } else if (!ASSET_EXT.has(ext) && !e.name.startsWith('.')) {
        unknownExt.set(ext, (unknownExt.get(ext) || 0) + 1);
      }
    }
  }
}

function detectRoots() {
  const found = [];
  for (const h of ROOT_HINTS) if (existsSync(join(REPO, h))) found.push(h);
  if (found.length) return found;
  return ['.'];                                   // fallback: the whole repository root
}

/* ---------------------------------------------------------- symbol extraction */
/** A class whose name ends in one of these is a service object, not just a class — build.mjs sorts
 *  this kind first in the symbol inventory and verify.mjs has a matching assertion for it. */
const SERVICE_SUFFIX = /(?:Service|Manager|Registry|Store|Server|Router|Controller|Broker|Supervisor|Coordinator)$/;

function refine(name, kind, line, isView) {
  // Checked before the gate below, and this is now the only copy of the rule. Behind that early
  // return it was unreachable: extractClassic reaches refine with kind 'class', so every class in a
  // classic (non-module) script silently missed the promotion, and extract() carried a second copy
  // of the same regex to work around it.
  if (kind === 'class' && SERVICE_SUFFIX.test(name)) return 'Service';
  if (kind !== 'function' && kind !== 'const') return kind;
  const arrow = /=\s*(?:async\s*)?(?:<[^>]*>\s*)?\([^)]*\)\s*(?::[^=]*)?=>/.test(line)
    || /=\s*(?:async\s*)?function\b/.test(line)
    || /=\s*(?:React\.)?(?:memo|forwardRef)\s*\(/.test(line);
  if (/^create[A-Z][\w$]*Slice$/.test(name)) return 'slice';
  if (/^use[A-Z]/.test(name)) return 'hook';
  if (isView && /^[A-Z]/.test(name) && (kind === 'function' || arrow)) return 'component';
  if (kind === 'const' && arrow) return 'function';
  return kind;
}

/** Refining the kind of an SFC top-level declaration: a component's "internal objects" are worth splitting by reactive role */
function refineSfc(name, line) {
  if (/=\s*defineProps\b/.test(line) || /^defineProps\b/.test(line) || /=\s*withDefaults\b/.test(line)) return 'props';
  if (/=\s*defineEmits\b/.test(line) || /^defineEmits\b/.test(line)) return 'emits';
  if (/^define(?:Options|Expose|Slots|Model)\b/.test(line)) return 'macro';
  if (/=\s*computed\s*[(<]/.test(line)) return 'computed';
  if (/=\s*(?:shallowRef|ref|reactive|shallowReactive|toRefs|writable|readable)\s*[(<]/.test(line)) return 'state';
  if (/=\s*inject\s*[(<]/.test(line)) return 'inject';
  if (/^use[A-Z]/.test(name)) return 'hook';
  if (/=\s*(?:async\s*)?(?:<[^>]*>\s*)?\([^)]*\)\s*(?::[^=]*)?=>/.test(line)
      || /=\s*(?:async\s*)?function\b/.test(line)) return 'function';
  return 'const';
}

/** SFC-only: scan the <script> block; template and style produce no symbols */
function extractSfc(lines, lang) {
  const out = [];
  const seen = new Set();
  for (const [from, to] of scriptRanges(lines)) {
    for (let ln = from; ln <= to; ln++) {
      const raw = lines[ln - 1];
      if (raw === undefined) break;
      let name = null, kind = null;
      const bare = raw.match(SFC_BARE_MACRO);
      const destructured = bare ? null : raw.match(SFC_DESTRUCTURED);
      if (bare) { name = bare[1]; kind = refineSfc(name, raw); }
      else if (destructured) { name = destructured[1]; kind = refineSfc(name, raw); }
      else {
        for (const [rx, kind0] of lang.rules) {
          const m = raw.match(rx);
          if (!m) continue;
          name = m[1];
          kind = kind0 === 'const' ? refineSfc(name, raw) : kind0;
          break;
        }
      }
      if (!name) continue;
      const k = name + ' ' + ln;
      if (seen.has(k)) continue;
      seen.add(k);
      out.push({ name, kind, line: ln });
    }
  }
  return out;
}

function extractClassic(lines, indents) {
  const out = [];
  const seen = new Set();
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i], ln = i + 1;
    const ind = raw.length - raw.trimStart().length;
    if (!indents.has(ind)) continue;
    const body = raw.slice(ind);
    for (const [rx, kind0] of CLASSIC_RULES) {
      const m = body.match(new RegExp('^' + rx.source));
      if (!m) continue;
      const kind = refine(m[1], kind0, raw, false);
      const k = m[1] + ' ' + ln;
      if (!seen.has(k)) { seen.add(k); out.push({ name: m[1], kind, line: ln }); }
      break;
    }
  }
  return out;
}

function extract(text, lang, isView) {
  const lines = text.split('\n');
  if (lang.sfc) return extractSfc(lines, lang);
  if (lang.reexport && !hasExport(text)) {
    return extractClassic(lines, IIFE_HEAD.test(text) ? new Set([0, 2]) : new Set([0]));
  }
  const out = [];
  const seen = new Set();
  const push = (name, kind, line) => {
    const k = name + ' ' + line;
    if (seen.has(k)) return;
    seen.add(k);
    out.push({ name, kind, line });
  };
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i], ln = i + 1;
    if (lang.reexport) {
      const re = raw.match(/^export\s*\{([^}]*)\}/);
      if (re) {
        for (const part of re[1].split(',')) {
          const m = part.trim().match(/^(?:type\s+)?([A-Za-z_$][\w$]*)(?:\s+as\s+([A-Za-z_$][\w$]*))?$/);
          if (m) push(m[2] || m[1], 're-export', ln);
        }
        continue;
      }
      if (/^export\s+\*/.test(raw)) {
        const from = raw.match(/from\s+['"]([^'"]+)['"]/);
        push('* → ' + (from ? from[1] : '?'), 're-export', ln);
        continue;
      }
    }
    for (const [rx, kind0] of lang.rules) {
      const m = raw.match(rx);
      if (!m) continue;
      const kind = refine(m[1], kind0, raw, isView);
      push(m[1], kind, ln);
      if (kind0 === 'const' && lang.reexport) {          // export const A = 1, B = 2
        const tail = raw.slice(raw.indexOf(m[1]) + m[1].length);
        for (const mm of tail.matchAll(/,\s*([A-Za-z_$][\w$]*)\s*[=:]/g)) push(mm[1], 'const', ln);
      }
      break;
    }
    if (lang.reexport && !out.some(o => o.line === ln) && /^export\s+default\b/.test(raw)) push('default', 'default', ln);
  }
  return out;
}

/* ---------------------------------------------------------- main */
const roots = ROOTS_IN.length ? ROOTS_IN : detectRoots();
const files = [];
for (const r of roots) walk(join(REPO, r), files);
files.sort();

const records = [];
for (const abs of files) {
  const text = readFileSync(abs, 'utf8');
  const rel = relative(REPO, abs).split(sep).join('/');
  const ext = extname(abs);
  records.push({
    path: rel,
    lines: text.split('\n').length,
    exports: extract(text, EXT2LANG.get(ext), ext === '.tsx' || ext === '.jsx'),
  });
}

const byDir = {};
for (const r of records) {
  const dir = r.path.slice(0, r.path.lastIndexOf('/')) || '.';
  const d = (byDir[dir] ||= { dir, files: 0, lines: 0, exports: 0 });
  d.files++; d.lines += r.lines; d.exports += r.exports.length;
}
const totals = {
  files: records.length,
  lines: records.reduce((s, r) => s + r.lines, 0),
  exports: records.reduce((s, r) => s + r.exports.length, 0),
  filesWithExports: records.filter(r => r.exports.length).length,
  dirs: Object.keys(byDir).length,
};

mkdirSync(WORK, { recursive: true });
writeFileSync(join(WORK, 'inventory.json'),
  JSON.stringify({ root: REPO, roots, totals, dirs: Object.values(byDir).sort((a, b) => a.dir.localeCompare(b.dir)), files: records }, null, 1),
  'utf8');

console.error(`inventory.json → ${join(WORK, 'inventory.json')}`);
console.error(`  source roots: ${roots.join(' ')}`);
console.error(`  ${totals.files} files / ${totals.lines} lines / ${totals.exports} exported symbols / ${totals.dirs} directories\n`);
console.error('Directory summary (symbols files lines directory) — design your blocks from this; keep each block at 80 symbols or fewer:');
for (const d of Object.values(byDir).sort((a, b) => b.exports - a.exports)) {
  console.error(`  ${String(d.exports).padStart(5)} ${String(d.files).padStart(4)}f ${String(d.lines).padStart(7)}L  ${d.dir}`);
}

/* Files over the symbol limit — each can only own a rectangle, and is itself a refactoring signal */
const oversized = records.filter(r => r.exports.length > 80)
  .sort((a, b) => b.exports.length - a.exports.length);
if (oversized.length) {
  console.error(`\n⚠ ${oversized.length} file(s) have more than 80 symbols: they cannot be split by theme, so each must own a rectangle (and say in its 'd' why it is that large):`);
  for (const r of oversized) console.error(`  ${String(r.exports.length).padStart(5)} sym ${String(r.lines).padStart(6)}L  ${r.path}`);
}

/* An extension in a source root this scanner does not know — the only symptom of a whole layer being dropped */
if (unknownExt.size) {
  const list = Array.from(unknownExt.entries()).sort((a, b) => b[1] - a[1]);
  console.error(`\n⚠ ${list.length} unrecognized extension(s) under the source roots; those files are neither in the inventory nor checked by verify:`);
  for (const [ext, n] of list) console.error(`  ${String(n).padStart(5)}  ${ext || '(no extension)'}`);
  console.error('  If any of them is real source, add it to SRC_EXT in scripts/lang.mjs and LANGS in scan.mjs before continuing —');
  console.error('  dropping a whole layer (an entire UI component layer, say) makes this architecture map wrong at its root.');
}
