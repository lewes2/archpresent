#!/usr/bin/env node
/**
 * verify.mjs — 生成物的准确性核对器（质量门，必须 0 失败）。
 *
 * 它 **不信任** inventory.json，也不复用 scan.mjs 的正则：每一条断言都直接回到磁盘上
 * 的源文件去证实。这样「清单准确」才不是「两个同源程序互相点头」。
 *
 *   MISSING_FILE    文件清单里的路径在磁盘上不存在
 *   LINE_DRIFT      文件清单里的行数与真实行数不符
 *   SYMBOL_ABSENT   符号在它声称的 文件:行号 上并不存在（SFC 还要求落在 <script> 块内）
 *   KIND_MISMATCH   声称的种类与该行真实声明关键字不符 / 行号自相矛盾
 *   SNIPPET_DRIFT   源码片段与该文件对应行区间的真实内容不符
 *   GROUP_MISMATCH  符号清单的文件分组头与该文件真实行数不符
 *   UNCOVERED_FILE  仓库里的源文件未被任何矩形收录
 *   BROKEN_REF      child / links（含端口下标）/ RET / FLOWS / FEATURES 指向不存在的图、块或端口
 *
 * 用法：node verify.mjs <html> <repoRoot> [srcRoot ...]
 */
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join, extname, relative, sep } from 'node:path';
import vm from 'node:vm';
import { SRC_EXT, JS_EXT, SFC_EXT, SKIP_DIR, ROOT_HINTS, isTest, scriptRanges, inScript } from './lang.mjs';

const [, , HTML, REPO, ...ROOTS_IN] = process.argv;
if (!HTML || !REPO) { console.error('用法：node verify.mjs <html> <repoRoot> [srcRoot ...]'); process.exit(2); }

/* ---------------------------------------------- 从 HTML 里取回数据段 */
const html = readFileSync(HTML, 'utf8');
const start = html.indexOf('<script>') + '<script>'.length;
const engineAt = html.indexOf('/* ---------------------------------------------------------------- 渲染引擎 */');
if (start < 8 || engineAt < 0) { console.error('× 找不到数据段边界'); process.exit(2); }
const ctx = { console };
vm.createContext(ctx);
vm.runInContext(html.slice(start, engineAt) + '\n;globalThis.__X={D,FILES,CLS,RET,CODE,FLOWS,FEATURES};', ctx);
const { D, FILES, CLS, RET, CODE, FLOWS, FEATURES } = ctx.__X;

/* ---------------------------------------------- 真实文件（独立重扫）
   文件集合的定义与 scan.mjs 共用 lang.mjs —— 必须一致，否则 UNCOVERED_FILE
   对「scan 认识而 verify 不认识」的扩展名形同虚设，"全覆盖"就是一句假话。
   符号抽取的正则仍是两边各写各的，独立性保留在那一层。 */
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

/* ---------------------------------------------- 断言 */
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
      err('LINE_DRIFT', `${key} → ${pth}：清单 ${declared} 行，真实 ${src.length} 行`);
    }
  }
}

/** TS/JS 家族要求声明行以 export 开头；SFC 要求落在 script 块内；其余语言只要求符号出现在该行。 */
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
  // `export default function Foo()` 同样是函数声明 —— 组件/钩子多以这种形式出现
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
      if (!src) { err('MISSING_FILE', `${key} 分组头 → ${name}`); continue; }
      const m = String(meta).match(/^(\d+) 行$/);
      if (!m || Number(m[1]) !== src.length) {
        err('GROUP_MISMATCH', `${key} 分组头 ${name}：清单 ${meta}，真实 ${src.length} 行`);
      }
      continue;
    }
    stat.symbols++;
    if (!codeKey) { err('SYMBOL_ABSENT', `${key} → ${name}：缺少 文件:行号 键`); continue; }
    const at = codeKey.lastIndexOf(':');
    const pth = codeKey.slice(0, at), lineNo = Number(codeKey.slice(at + 1));
    const src = linesOf(pth);
    if (!src) { err('MISSING_FILE', `${key} → ${pth}`); continue; }
    const line = src[lineNo - 1];
    if (line === undefined) { err('SYMBOL_ABSENT', `${pth}:${lineNo} 越界（共 ${src.length} 行）`); continue; }
    if (!name.startsWith('* →') && name !== 'default' && !line.includes(name)) {
      err('SYMBOL_ABSENT', `${pth}:${lineNo} 上没有 ${name}｜实际：${line.trim().slice(0, 90)}`); continue;
    }
    const declaredLine = Number(String(meta).split('· L')[1]);
    if (declaredLine !== lineNo) {
      err('KIND_MISMATCH', `${pth} 的 ${name}：计量行号 L${declaredLine} 与键行号 ${lineNo} 不一致`);
    }
    const ext = extname(pth);
    // 经典脚本（浏览器扩展的 content script 等）整份没有 export，顶层声明就是裸声明。
    // 对这类文件强求 `^export` 会让 scan 抽到的整层符号全判失败，故按「文件内是否
    // 出现过 export」区分：出现过 → 仍按 ES 模块严格核；一次都没有 → 只核符号确在该行。
    if (JSFAM.has(ext) && (linesOf(pth) || []).some(l => /^export\s/.test(l))) {
      if (!/^export\b/.test(line)) {
        err('SYMBOL_ABSENT', `${pth}:${lineNo} 不是 export 声明行｜实际：${line.trim().slice(0, 90)}`); continue;
      }
      const pat = KIND_PAT[String(meta).split(' · ')[0]];
      if (pat && !pat.test(line)) {
        err('KIND_MISMATCH', `${pth}:${lineNo} 声称 ${String(meta).split(' · ')[0]}｜实际：${line.trim().slice(0, 90)}`);
      }
    } else if (SFCFAM.has(ext) && !inScript(scriptRangesOf(pth), lineNo)) {
      // 单文件组件：名字出现在模板或样式里不算数，必须是 script 块内的声明
      err('SYMBOL_ABSENT', `${pth}:${lineNo} 不在 <script> 块内｜实际：${line.trim().slice(0, 90)}`);
    }
  }
}

for (const [k, cd] of Object.entries(CODE)) {
  stat.snippets++;
  const src = linesOf(cd.f);
  if (!src) { err('MISSING_FILE', `CODE ${k} → ${cd.f}`); continue; }
  cd.s.forEach((got, i) => {
    const want = (src[cd.l - 1 + i] ?? '').replace(/\t/g, '  ').replace(/\s+$/, '');
    if (got !== want) err('SNIPPET_DRIFT', `${cd.f}:${cd.l + i}\n      片段：${got}\n      真实：${want}`);
  });
}

for (const f of realFiles) if (!claimed.has(f)) err('UNCOVERED_FILE', f);

const blockKeys = new Set();
for (const d of Object.values(D)) for (const b of d.blocks) blockKeys.add(d.id + '/' + b.id);
for (const d of Object.values(D)) {
  stat.blocks += d.blocks.length;
  const ids = new Set(d.blocks.map(b => b.id));
  if (d.parent && !D[d.parent]) err('BROKEN_REF', `${d.id} 的 parent 不存在：${d.parent}`);
  for (const b of d.blocks) {
    stat.ports += (b.in || []).length + (b.out || []).length;
    if (b.child && !D[b.child]) err('BROKEN_REF', `${d.id}/${b.id} 的 child 不存在：${b.child}`);
  }
  for (const L of d.links || []) {
    if (!ids.has(L.s[0])) err('BROKEN_REF', `${d.id} 连线源块不存在：${L.s[0]}`);
    if (!ids.has(L.t[0])) err('BROKEN_REF', `${d.id} 连线目标块不存在：${L.t[0]}`);
    const sb = d.blocks.find(b => b.id === L.s[0]);
    if (sb && !(sb.out || [])[L.s[1]]) err('BROKEN_REF', `${d.id}/${L.s[0]} 没有第 ${L.s[1]} 个输出端口（它有 ${(sb.out || []).length} 个）`);
    // 目标输入端口不检查：引擎会用源端口的五元组自动合成（L4 状态机据此只写 out）
  }
}
for (const k of Object.keys(RET)) {
  const m = k.match(/^(.+)\/(in|out):(\d+)$/);
  if (!m) { err('BROKEN_REF', `RET 键格式错：${k}`); continue; }
  if (!blockKeys.has(m[1])) { err('BROKEN_REF', `RET 指向不存在的块：${k}`); continue; }
  const dId = m[1].slice(0, m[1].lastIndexOf('/')), bId = m[1].slice(m[1].lastIndexOf('/') + 1);
  const b = D[dId]?.blocks.find(x => x.id === bId);
  const arr = m[2] === 'in' ? (b?.in || []) : (b?.out || []);
  if (!arr[Number(m[3])]) err('BROKEN_REF', `RET 指向不存在的端口：${k}`);
}
for (const fl of FLOWS) for (const st of fl.steps) if (!blockKeys.has(st.key)) {
  err('BROKEN_REF', `流程「${fl.name}」步骤指向不存在的块：${st.key}`);
}
for (const ft of FEATURES) if (!blockKeys.has(ft.key)) err('BROKEN_REF', `功能「${ft.n}」指向不存在的块：${ft.key}`);

/* ---------------------------------------------- 报告 */
const byCode = {};
for (const f of fail) (byCode[f.code] ||= []).push(f.msg);
console.log('════════ 架构可视化核对报告 ════════');
console.log(`  图 ${Object.keys(D).length} 张 · 矩形 ${stat.blocks} 个 · 端口 ${stat.ports} 个 · 字段表 ${Object.keys(RET).length} 份`);
console.log(`  文件清单 ${stat.files} 行（去重 ${claimed.size} 个 / 仓库实有 ${realFiles.length} 个）`);
console.log(`  符号清单 ${stat.symbols} 条 · 分组头 ${stat.groups} 个 · 源码片段 ${stat.snippets} 段`);
console.log(`  流程 ${FLOWS.length} 条 · 功能 ${FEATURES.length} 项`);
console.log('────────────────────────────────────');
for (const c of ['MISSING_FILE','LINE_DRIFT','SYMBOL_ABSENT','KIND_MISMATCH','SNIPPET_DRIFT','GROUP_MISMATCH','UNCOVERED_FILE','BROKEN_REF']) {
  const list = byCode[c] || [];
  console.log(`  ${list.length === 0 ? '✓' : '×'} ${c.padEnd(15)} ${list.length}`);
  list.slice(0, 12).forEach(m => console.log('      ' + m));
  if (list.length > 12) console.log(`      …… 另有 ${list.length - 12} 条`);
}
console.log('────────────────────────────────────');
console.log(fail.length === 0 ? '  ✓ 全部断言通过（0 失败）' : `  × 共 ${fail.length} 条失败`);
process.exit(fail.length ? 1 : 0);
