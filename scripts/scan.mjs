#!/usr/bin/env node
/**
 * scan.mjs — 只读代码清点器。
 *
 * 遍历仓库源码根，为每个非测试源文件产出
 *   { path, lines, exports: [{ name, kind, line }] }
 * 写入 <workDir>/inventory.json，并在 stderr 打印目录汇总（用于设计模块分块）。
 *
 * 用法：
 *   node scan.mjs <repoRoot> <workDir> [srcRoot ...]
 * 不给 srcRoot 时自动探测仓库根下的源码目录。
 */
import { readFileSync, readdirSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, relative, sep, extname } from 'node:path';
import { SFC_EXT, SKIP_DIR, ROOT_HINTS, isTest, scriptRanges } from './lang.mjs';

const [, , REPO, WORK, ...ROOTS_IN] = process.argv;
if (!REPO || !WORK) {
  console.error('用法：node scan.mjs <repoRoot> <workDir> [srcRoot ...]');
  process.exit(2);
}

/* ---------------------------------------------------------- 语言支持 */
/** 每种语言：扩展名 → 顶层声明匹配。kind 用统一词汇，便于跨语言呈现。 */
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
    // C/C++：只认**列 0 顶格**的声明。类内成员是缩进的，故天然被排除——
    // 这样 .h 贡献「类型面」（class/struct/enum/using），.cpp 贡献「实现面」
    // （Class::method 定义与自由函数定义），两侧不互相淹没，每块符号数才压得住。
    name: 'cpp', ext: ['.c', '.cc', '.cpp', '.cxx', '.h', '.hh', '.hpp', '.hxx'],
    rules: [
      [/^(?:template\s*<[^>]*>\s*)?class\s+(?:[A-Z][A-Z0-9_]*_EXPORT\s+)?([A-Za-z_]\w*)\s*(?:final\s*)?(?::|\{|;|$)/, 'class'],
      [/^(?:template\s*<[^>]*>\s*)?struct\s+([A-Za-z_]\w*)\s*(?:final\s*)?(?::|\{|;|$)/, 'class'],
      [/^enum\s+(?:class\s+|struct\s+)?([A-Za-z_]\w*)/, 'enum'],
      [/^namespace\s+([A-Za-z_][\w:]*)\s*\{/, 'namespace'],
      [/^using\s+([A-Za-z_]\w*)\s*=/, 'type'],
      [/^typedef\s+[\w\s:<>,*&]+?\b([A-Za-z_]\w*)\s*;/, 'type'],
      [/^(?:constexpr|const|static|inline|extern)[\w\s:<>,*&\[\]]*?\b([A-Za-z_]\w*)\s*(?:=|\[)/, 'const'],
      // (?!\s) 是必需的：\s 在字符类里，没有它前缀会把行首缩进一并吃掉，
      // 于是函数体内缩进的 `return R::err(...)` 会被当成 R::err 的定义。
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
    // 单文件组件：Vue / Svelte。声明只认 <script> 块里顶格（列 0）的那些——
    // 组件的「内部对象」就是这些顶层 state / computed / 事件处理器，模板不算。
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
 * 经典脚本（classic script）规则集。
 *
 * 浏览器扩展的 content script / 页面脚本不能用 ES 模块，惯例是整份包在 IIFE 里，
 * 于是「顶层声明」实际缩进 2 格、且一个 export 都没有。若只认 `^export`，
 * 这一整层会连一个符号都抽不到——正是「整层被静默漏掉」。
 * 故：文件内没有任何 `^export` 时改用这套规则，允许的缩进由是否 IIFE 包裹决定
 * （IIFE → 0 或 2 格；否则只认列 0），避免把函数体内的局部声明误当成顶层。
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

/** SFC 里无赋值的编译宏调用：defineProps({...}) / defineEmits([...]) 等 */
const SFC_BARE_MACRO = /^(defineProps|defineEmits|defineOptions|defineExpose|defineSlots|defineModel|withDefaults)\s*[(<]/;
/** SFC 里的解构：const { a, b } = defineProps(...) —— 记右手边那个名字 */
const SFC_DESTRUCTURED = /^(?:const|let)\s+\{[^}]*\}\s*=\s*([A-Za-z_$][\w$]*)\s*[(<]/;

/* ---------------------------------------------------------- 遍历 */
/** 非代码资产：出现在源码根里很正常，不必提示 */
const ASSET_EXT = new Set(['.css', '.scss', '.sass', '.less', '.json', '.jsonc', '.md', '.mdx', '.txt',
  '.yml', '.yaml', '.toml', '.xml', '.html', '.htm', '.svg', '.png', '.jpg', '.jpeg', '.gif', '.webp',
  '.ico', '.avif', '.woff', '.woff2', '.ttf', '.otf', '.eot', '.map', '.lock', '.snap', '.sql', '.env',
  '.sh', '.bat', '.ps1', '.cmake', '.in', '.rc', '.qrc', '.ui', '.ts_', '.cmd', '.gitignore', '.editorconfig', '.LICENSE', '']);
/** 源码根里出现但本扫描器不认识的扩展名 → 结尾提示，防止「整层被静默漏掉」 */
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
  return ['.'];                                   // 兜底：整个仓库根
}

/* ---------------------------------------------------------- 符号抽取 */
function refine(name, kind, line, isView) {
  if (kind !== 'function' && kind !== 'const') return kind;
  const arrow = /=\s*(?:async\s*)?(?:<[^>]*>\s*)?\([^)]*\)\s*(?::[^=]*)?=>/.test(line)
    || /=\s*(?:async\s*)?function\b/.test(line)
    || /=\s*(?:React\.)?(?:memo|forwardRef)\s*\(/.test(line);
  if (/^create[A-Z][\w$]*Slice$/.test(name)) return 'slice';
  if (/^use[A-Z]/.test(name)) return 'hook';
  if (isView && /^[A-Z]/.test(name) && (kind === 'function' || arrow)) return 'component';
  if (kind === 'const' && arrow) return 'function';
  if (kind === 'class' && /(Service|Manager|Registry|Store|Server|Router|Controller|Broker|Supervisor|Coordinator)$/.test(name)) {
    return 'Service';
  }
  return kind;
}

/** SFC 顶层声明的种类细化：组件的「内部对象」值得按响应式角色分开看 */
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

/** SFC 专用：只扫 <script> 块，模板与样式不产生符号 */
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
      let kind = kind0;
      if (kind0 === 'class' && /(Service|Manager|Registry|Store|Server|Router|Controller|Broker|Supervisor|Coordinator)$/.test(m[1])) kind = 'Service';
      else kind = refine(m[1], kind0, raw, isView);
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

/* ---------------------------------------------------------- 主流程 */
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
console.error(`  源码根：${roots.join(' ')}`);
console.error(`  ${totals.files} 文件 / ${totals.lines} 行 / ${totals.exports} 导出符号 / ${totals.dirs} 目录\n`);
console.error('目录汇总（符号数 文件数 行数 目录）—— 据此设计分块，每块符号数控制在 ≤80：');
for (const d of Object.values(byDir).sort((a, b) => b.exports - a.exports)) {
  console.error(`  ${String(d.exports).padStart(5)} ${String(d.files).padStart(4)}f ${String(d.lines).padStart(7)}L  ${d.dir}`);
}

/* 单文件符号数超标 —— 它们只能各自独占一个矩形，且本身就是重构信号 */
const oversized = records.filter(r => r.exports.length > 80)
  .sort((a, b) => b.exports.length - a.exports.length);
if (oversized.length) {
  console.error(`\n⚠ ${oversized.length} 个文件符号数 > 80：无法再按主题切分，只能各自独占一个矩形（并在 d 里点明它为什么这么大）：`);
  for (const r of oversized) console.error(`  ${String(r.exports.length).padStart(5)} 符号 ${String(r.lines).padStart(6)}L  ${r.path}`);
}

/* 源码根里有本扫描器不认识的扩展名 —— 这正是「整层被静默漏掉」的唯一征兆 */
if (unknownExt.size) {
  const list = Array.from(unknownExt.entries()).sort((a, b) => b[1] - a[1]);
  console.error(`\n⚠ 源码根下有 ${list.length} 种未识别扩展名，这些文件既不在清单里、verify 也不会追究：`);
  for (const [ext, n] of list) console.error(`  ${String(n).padStart(5)} 个  ${ext || '(无扩展名)'}`);
  console.error('  若其中包含真正的源码，先在 scripts/lang.mjs 与 scan.mjs 的 LANGS 里补上再继续——');
  console.error('  漏掉一整层（比如整个 UI 组件层）会让这份架构图从根上是错的。');
}
