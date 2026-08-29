#!/usr/bin/env node
/**
 * build.mjs — 把「手写的语义层」+「机读的清单」装配成单文件 HTML。
 *
 * 手写的只有语义：图 / 块 / 端口 / 字段表 / 流程 / 功能。
 * 清单（文件路径、行数、类、对象、函数、行号、源码片段）全部由 inventory.json
 * 与磁盘源码生成 —— 因此不存在手抄误差。
 *
 * 用法：
 *   node build.mjs <archDir> <outHtml>
 * archDir 需包含：inventory.json（scan.mjs 产出）与手写的
 *   diagrams.mjs · blockmap.mjs · ret.mjs · code.mjs · flows.mjs · features.mjs · notes.mjs
 */
import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';

const SELF = dirname(fileURLToPath(import.meta.url));
const [, , ARCH_IN, OUT_IN] = process.argv;
if (!ARCH_IN || !OUT_IN) {
  console.error('用法：node build.mjs <archDir> <outHtml>');
  process.exit(2);
}
const ARCH = resolve(ARCH_IN), OUT = resolve(OUT_IN);
const imp = f => import(pathToFileURL(join(ARCH, f)).href);

const INV = JSON.parse(readFileSync(join(ARCH, 'inventory.json'), 'utf8'));
const REPO = INV.root;
const BY_PATH = new Map(INV.files.map(f => [f.path, f]));

/* diagrams 可以是单文件 diagrams.mjs，也可以是目录 diagrams/（按文件名排序依次合并）。
   大项目的图谱定义动辄两三千行，拆成 01-l1.mjs、02-l2.mjs… 比塞进一个文件好维护得多。 */
async function loadDiagrams() {
  const dir = join(ARCH, 'diagrams');
  if (existsSync(dir) && statSync(dir).isDirectory()) {
    const parts = readdirSync(dir).filter(f => f.endsWith('.mjs')).sort();
    if (!parts.length) { console.error('× diagrams/ 目录里没有 .mjs 分片'); process.exit(2); }
    const all = [];
    for (const f of parts) {
      const mod = await import(pathToFileURL(join(dir, f)).href);
      if (!Array.isArray(mod.DIAGRAMS)) {
        console.error(`× diagrams/${f} 没有导出 DIAGRAMS 数组`); process.exit(2);
      }
      all.push(...mod.DIAGRAMS);
    }
    console.error(`  diagrams/ 分片 ${parts.length} 个 → ${all.length} 张图`);
    return all;
  }
  return (await imp('diagrams.mjs')).DIAGRAMS;
}

const DIAGRAMS = await loadDiagrams();
const { BLOCKMAP } = await imp('blockmap.mjs');
if (!Array.isArray(DIAGRAMS) || !DIAGRAMS.length) {
  console.error('× 没有读到任何图定义'); process.exit(2);
}
const { FILE_NOTES = {}, SYM_NOTES = {} } = await imp('notes.mjs').catch(() => ({}));
const { CODE_PICKS = [] } = await imp('code.mjs').catch(() => ({}));
const { RET_TABLES = {} } = await imp('ret.mjs').catch(() => ({}));
const { FLOWS = [] } = await imp('flows.mjs').catch(() => ({}));
const { FEATURES = [] } = await imp('features.mjs').catch(() => ({}));

/* ------------------------------------------------------------ 路径匹配 */
function match(path, pat) {
  if (pat.endsWith('/**')) return path.startsWith(pat.slice(0, -2));
  if (pat.endsWith('/*')) {
    const d = pat.slice(0, -1);
    return path.startsWith(d) && !path.slice(d.length).includes('/');
  }
  if (pat.includes('*')) {                       // 目录内文件名通配：dir/useFoo*.ts
    const i = pat.lastIndexOf('/');
    const dir = pat.slice(0, i + 1), base = pat.slice(i + 1);
    if (!path.startsWith(dir) || path.slice(dir.length).includes('/')) return false;
    const rx = new RegExp('^' + base.split('*').map(s => s.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('.*') + '$');
    return rx.test(path.slice(dir.length));
  }
  return path === pat;
}
/** 'REST:<pat>' = 同一张图里没被别的块认领的那些，留给收尾块 */
function selectFiles(patterns, claimed) {
  const inc = [], exc = [], rest = [];
  for (const raw of patterns) {
    if (raw.startsWith('!')) exc.push(raw.slice(1));
    else if (raw.startsWith('REST:')) rest.push(raw.slice(5));
    else inc.push(raw);
  }
  return INV.files.filter(f =>
    (inc.some(p => match(f.path, p)) || (rest.some(p => match(f.path, p)) && !claimed.has(f.path)))
    && !exc.some(p => match(f.path, p)));
}

/* -------------------------------------- L4 文件级模块图：自动摊开成一文件一块 */
for (const d of DIAGRAMS) {
  if (!d.autoFiles) continue;
  const picked = INV.files
    .filter(f => d.autoFiles.some(p => match(f.path, p)))
    .sort((a, b) => b.exports.length - a.exports.length || a.path.localeCompare(b.path));
  const COLS = d.autoCols || 6;
  d.blocks = picked.map((f, i) => {
    const base = f.path.slice(f.path.lastIndexOf('/') + 1);
    const id = base.replace(/[^A-Za-z0-9]/g, '_').toUpperCase().slice(0, 28);
    BLOCKMAP[d.id + '/' + id] = [f.path];
    return {
      id, n: base, t: f.lines + ' 行 · ' + f.exports.length + ' 导出', k: 'code',
      col: i % COLS, row: (i / COLS) | 0,
      d: '目录 ' + f.path.slice(0, f.path.lastIndexOf('/')) + ' 下的一个文件。展开抽屉即该文件的全部导出符号（种类 + 行号），悬停任一行看真实定义片段。',
    };
  });
  d.links = d.links || [];
  delete d.autoFiles; delete d.autoCols;
}

/* ------------------------------------------------------------ 归属结算 */
const levelOf = {}, diaOf = {};
for (const d of DIAGRAMS) for (const b of d.blocks) {
  levelOf[d.id + '/' + b.id] = d.lv; diaOf[d.id + '/' + b.id] = d.id;
}
const ownerByDia = new Map(), covered = new Set(), blockFiles = new Map();
const entries = Object.entries(BLOCKMAP);
const isRest = ([, p]) => p.some(x => x.startsWith('REST:'));
for (const pass of [entries.filter(e => !isRest(e)), entries.filter(isRest)]) {
  for (const [key, patterns] of pass) {
    const dId = diaOf[key];
    if (dId === undefined) { console.error(`× BLOCKMAP 的键没有对应矩形块：${key}`); process.exitCode = 1; continue; }
    if (!ownerByDia.has(dId)) ownerByDia.set(dId, new Map());
    const own = ownerByDia.get(dId);
    const files = selectFiles(patterns, new Set(own.keys()));
    blockFiles.set(key, files);
    for (const f of files) {
      if (own.has(f.path)) {
        console.error(`× 图 ${dId} 内文件重复归属：${f.path}\n    ${own.get(f.path)}\n    ${key}`);
        process.exitCode = 1;
      }
      own.set(f.path, key); covered.add(f.path);
    }
  }
}
const uncovered = INV.files.filter(f => !covered.has(f.path));
if (uncovered.length) {
  console.error(`× ${uncovered.length} 个文件未归入任何块，前 25 个：`);
  uncovered.slice(0, 25).forEach(f => console.error('    ' + f.path));
  process.exitCode = 1;
}

/* 有 child 的块把子图的文件聚合上来（只聚合文件清单，符号清单留在叶子块） */
const childOf = {};
for (const d of DIAGRAMS) for (const b of d.blocks) if (b.child) childOf[d.id + '/' + b.id] = b.child;
const filesOfDia = id => {
  const out = [], d = DIAGRAMS.find(x => x.id === id);
  if (!d) return out;
  for (const b of d.blocks) {
    const key = d.id + '/' + b.id;
    if (blockFiles.has(key)) out.push(...blockFiles.get(key));
    else if (b.child) out.push(...filesOfDia(b.child));
  }
  return out;
};
for (const [key, child] of Object.entries(childOf)) {
  if (blockFiles.has(key)) continue;
  const seen = new Set();
  const uniq = filesOfDia(child).filter(f => !seen.has(f.path) && seen.add(f.path));
  if (uniq.length) blockFiles.set(key, uniq.sort((a, b) => a.path.localeCompare(b.path)));
}
const AGGREGATED = new Set(Object.keys(childOf).filter(k => !Object.hasOwn(BLOCKMAP, k)));

/* -------------------------------------------- 统计占位符（杜绝手算聚合数字）
   矩形的 t、图的 title / sub 里可以写 {{files}} / {{lines}} / {{exports}}，
   由这里按该矩形（或整张图）实际归属的文件自动填。手写「12 文件 / 4327 行」
   是最容易在改完分块后忘记同步的一处，占位符让它不可能漂。 */
const countOf = files => ({
  files: files.length,
  lines: files.reduce((s, f) => s + f.lines, 0),
  exports: files.reduce((s, f) => s + f.exports.length, 0),
});
const fillTemplate = (text, c) => typeof text !== 'string' ? text : text.replace(
  /\{\{(files|lines|exports)\}\}/g, (_, k) => String(c[k]));
const UNFILLED = [];
for (const d of DIAGRAMS) {
  const seen = new Set();
  const diaFiles = [];
  for (const b of d.blocks) {
    const key = d.id + '/' + b.id;
    const files = blockFiles.get(key) || [];
    for (const f of files) if (!seen.has(f.path)) { seen.add(f.path); diaFiles.push(f); }
    const c = countOf(files);
    b.t = fillTemplate(b.t, c);
    b.d = fillTemplate(b.d, c);
  }
  const dc = countOf(diaFiles);
  d.title = fillTemplate(d.title, dc);
  d.sub = fillTemplate(d.sub, dc);
  for (const s of [d.title, d.sub, ...d.blocks.map(b => b.t), ...d.blocks.map(b => b.d)]) {
    if (typeof s === 'string' && /\{\{/.test(s)) UNFILLED.push(`${d.id}：${s.slice(0, 60)}`);
  }
}
if (UNFILLED.length) {
  console.error(`× ${UNFILLED.length} 处占位符没能被替换（只支持 {{files}} / {{lines}} / {{exports}}）：`);
  UNFILLED.slice(0, 10).forEach(s => console.error('    ' + s));
  process.exitCode = 1;
}

/* ------------------------------------------------------------ 清单表 */
const KIND_ORDER = { 'Service':0, 'class':1, 'abstract class':2, 'interface':3, 'type':4,
                     'enum':5, 'slice':6, 'component':7, 'hook':8,
                     // 单文件组件：先看它对外的契约（props/emits），再看状态，最后看行为
                     'props':9, 'emits':10, 'macro':11, 'state':12, 'computed':13, 'inject':14,
                     'function':15, 'const':16, 're-export':17, 'default':18 };
const FILES_OUT = [], CLS_OUT = [];
for (const [key, files] of blockFiles) {
  if (!files.length) continue;
  FILES_OUT.push([key, files.map(f => [f.path, f.lines, FILE_NOTES[f.path] || ''])]);
  if (AGGREGATED.has(key)) continue;
  const rows = [];
  for (const f of files) {
    if (!f.exports.length) continue;
    rows.push([f.path, f.lines + ' 行', '', 'g']);
    for (const e of f.exports.slice().sort((a, b) =>
      (KIND_ORDER[a.kind] ?? 99) - (KIND_ORDER[b.kind] ?? 99) || a.line - b.line)) {
      rows.push([e.name, e.kind + ' · L' + e.line, SYM_NOTES[f.path + '#' + e.name] || '',
                 undefined, f.path + ':' + e.line]);
    }
  }
  if (rows.length) CLS_OUT.push([key, rows]);
}

/* ------------------------------------------------ 源码片段（从磁盘现切） */
const CODE_OUT = [];
for (const [path, symbol, span = 24] of CODE_PICKS) {
  const rec = BY_PATH.get(path);
  if (!rec) { console.error(`× CODE_PICKS 指向不存在的文件：${path}`); process.exitCode = 1; continue; }
  const hit = rec.exports.find(e => e.name === symbol);
  if (!hit) {
    const near = rec.exports
      .filter(e => e.name.toLowerCase().includes(symbol.toLowerCase()) || symbol.toLowerCase().includes(e.name.toLowerCase()))
      .map(e => e.name).slice(0, 6);
    const all = rec.exports.map(e => e.name).slice(0, 12);
    console.error(`× CODE_PICKS 指向不存在的符号：${path}#${symbol}`);
    console.error(`    该文件可选：${(near.length ? near : all).join(' · ')}${rec.exports.length > 12 && !near.length ? ' …' : ''}`);
    process.exitCode = 1; continue;
  }
  const src = readFileSync(join(REPO, path), 'utf8').split('\n');
  let lead = hit.line - 1;
  while (lead > 0) {                                  // 向上收编紧贴的注释块
    const prev = src[lead - 1].trim();
    if (prev.startsWith('*') || prev.startsWith('/**') || prev.startsWith('//')
        || prev.startsWith('/*') || prev.startsWith('#')) lead--;
    else break;
  }
  if (hit.line - 1 - lead > 12) lead = hit.line - 1 - 12;
  const lines = src.slice(lead, lead + span).map(l => l.replace(/\t/g, '  ').replace(/\s+$/, ''));
  while (lines.length && lines[lines.length - 1] === '') lines.pop();
  CODE_OUT.push([path + ':' + hit.line, path, lead + 1, lines]);
}

/* ------------------------------------------------------------ 引用完整性 */
const diaIds = new Set(DIAGRAMS.map(d => d.id));
const blockKeys = new Set();
for (const d of DIAGRAMS) for (const b of d.blocks) blockKeys.add(d.id + '/' + b.id);
for (const d of DIAGRAMS) {
  const ids = new Set(d.blocks.map(b => b.id));
  if (d.parent && !diaIds.has(d.parent)) { console.error(`× ${d.id} 的 parent 不存在：${d.parent}`); process.exitCode = 1; }
  for (const b of d.blocks) if (b.child && !diaIds.has(b.child)) {
    console.error(`× ${d.id}/${b.id} 的 child 不存在：${b.child}`); process.exitCode = 1;
  }
  for (const L of d.links || []) {
    if (!ids.has(L.s[0])) { console.error(`× ${d.id} 连线源块不存在：${L.s[0]}`); process.exitCode = 1; }
    if (!ids.has(L.t[0])) { console.error(`× ${d.id} 连线目标块不存在：${L.t[0]}`); process.exitCode = 1; }
    const sb = d.blocks.find(b => b.id === L.s[0]);
    if (sb && !(sb.out || [])[L.s[1]]) {
      console.error(`× ${d.id}/${L.s[0]} 没有第 ${L.s[1]} 个输出端口（它有 ${(sb.out || []).length} 个）`); process.exitCode = 1;
    }
    // 目标输入端口不检查：目标若没有对应下标，引擎会用源端口的五元组自动合成一个
    // （L4 状态机正是靠这条只写 out 不写 in）。所以这里唯一必须成立的是源端口存在。
  }
}
for (const k of Object.keys(RET_TABLES)) {
  const m = k.match(/^(.+)\/(in|out):(\d+)$/);
  if (!m) { console.error(`× RET 键格式错（应形如 图id/块id/out:0）：${k}`); process.exitCode = 1; continue; }
  if (!blockKeys.has(m[1])) { console.error(`× RET 键无对应块：${k}`); process.exitCode = 1; continue; }
  const dId = m[1].slice(0, m[1].lastIndexOf('/')), bId = m[1].slice(m[1].lastIndexOf('/') + 1);
  const b = DIAGRAMS.find(x => x.id === dId)?.blocks.find(x => x.id === bId);
  const arr = m[2] === 'in' ? (b?.in || []) : (b?.out || []);
  if (!arr[Number(m[3])]) {
    console.error(`× RET 指向不存在的端口：${k}（该块 ${m[2]} 只有 ${arr.length} 个）`);
    if (m[2] === 'in') console.error('    若它是被连线自动合成的输入端口，字段表要挂到「源块的 out:N」上，引擎会自己带过来。');
    process.exitCode = 1;
  }
}
for (const fl of FLOWS) for (const st of fl.steps) if (!blockKeys.has(st[0])) {
  console.error(`× 流程「${fl.name}」的步骤指向不存在的块：${st[0]}`); process.exitCode = 1;
}
for (const ft of FEATURES) if (!blockKeys.has(ft.key)) {
  console.error(`× 功能「${ft.n}」指向不存在的块：${ft.key}`); process.exitCode = 1;
}

/* ------------------------------------------------------------ 输出 HTML */
const J = v => JSON.stringify(v);
const title = (DIAGRAMS.find(d => d.lv === 1) || {}).title || '架构可视化';
const chunks = [`"use strict";
/* =========================================================================
   ${title}
   本文件由 architecture-viz 技能生成，不要手改。
   清单（文件 / 行数 / 类 / 对象 / 函数 / 行号 / 源码片段）全部由 scan.mjs 从源码直读，
   verify.mjs 逐条回源断言。
   仓库快照：${INV.totals.files} 个非测试源文件 · ${INV.totals.lines} 行 · ${INV.totals.exports} 个导出符号 · ${INV.totals.dirs} 个目录

   交互：点矩形下钻 · 右键/Esc/Backspace 返回 · 悬停端口看接口字段
        悬停清单行看真实定义片段 · 抽屉内滚轮翻页（Shift 整页 · Alt 直达两端）
        滚轮缩放 · 拖拽平移 · F 适应窗口 · E 全部下拉 · L 切换左面板页签
   ========================================================================= */

/* ---------------------------------------------------------------- 数据模型 */
const D = {};
const dia = o => (D[o.id] = o);
const p = (n, t, l, s, d) => ({ n, t, l, s, d });`];

for (const d of DIAGRAMS) chunks.push('dia(' + J(d) + ');');
chunks.push('\n/* ---------------------------------------------------- 模块 → 文件清单（生成） */\nconst FILES = {};\nconst F = (key, list) => (FILES[key] = list);');
for (const [k, r] of FILES_OUT) chunks.push(`F(${J(k)},${J(r)});`);
chunks.push('\n/* ------------------------------------------ 模块 → 类 / 对象 / 函数清单（生成） */\nconst CLS = {};\nconst C = (key, list) => (CLS[key] = list);');
for (const [k, r] of CLS_OUT) chunks.push(`C(${J(k)},${J(r)});`);
chunks.push('\n/* --------------------------------------------------------- 接口字段表（手写） */\nconst RET = {};\nconst R = (key, list) => (RET[key] = list);');
for (const [k, r] of Object.entries(RET_TABLES)) chunks.push(`R(${J(k)},${J(r)});`);
chunks.push('\n/* ------------------------------------------ 符号 → 真实定义片段（自源码抽取） */\nconst CODE = {};\nconst K = (k, f, l, s) => (CODE[k] = { f, l, s });');
for (const [k, f, l, s] of CODE_OUT) chunks.push(`K(${J(k)},${J(f)},${l},${J(s)});`);
chunks.push('\n/* ------------------------------------------------------- 典型场景流程（手写） */\nconst FLOWS = [];\nconst flow = (name, from, role, steps) =>\n  FLOWS.push({ name, from, role, steps: steps.map(s => ({ key:s[0], t:s[1] })) });');
for (const fl of FLOWS) chunks.push(`flow(${J(fl.name)},${J(fl.from)},${J(fl.role)},${J(fl.steps)});`);
chunks.push('\n/* --------------------------------------------------------- L1 功能列表（手写） */\nconst FEATURES = [];\nconst feat = (n, cat, key, d) => FEATURES.push({ n, cat, key, d });');
for (const ft of FEATURES) chunks.push(`feat(${J(ft.n)},${J(ft.cat)},${J(ft.key)},${J(ft.d)});`);
chunks.push(readFileSync(join(SELF, '..', 'assets', 'engine.js'), 'utf8'));

writeFileSync(OUT, `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title}</title>
<style>
  html,body{margin:0;padding:0;height:100%;overflow:hidden;background:#0e1116;}
  #cv{display:block;width:100vw;height:100vh;cursor:default;}
  #cap{position:fixed; bottom:88px; right:40px; left:40px;
    display:flex; justify-content:center; pointer-events:none;
    opacity:0; transform:translateY(16px);
    transition:opacity .34s cubic-bezier(.2,.7,.3,1), transform .34s cubic-bezier(.2,.7,.3,1);}
  #cap.show{ opacity:1; transform:translateY(0); }
  #cap.out { opacity:0; transform:translateY(10px);
             transition:opacity .15s ease-in, transform .15s ease-in; }
  #cap .box{ max-width:min(880px, 62vw); text-align:center;
    font-family:"Microsoft YaHei","PingFang SC",system-ui,-apple-system,"Segoe UI",sans-serif;}
  #capMeta{ font-size:11px; letter-spacing:.06em; color:#6f7d90; margin-bottom:7px;
    text-shadow:0 1px 10px #0e1116, 0 0 18px #0e1116;}
  #capText{ font-size:15.5px; line-height:1.62; color:#e9f1fa; font-weight:600;
    text-shadow:0 2px 16px rgba(8,11,15,.95), 0 0 34px rgba(8,11,15,.85), 0 0 6px rgba(8,11,15,1);}
  #capMod{ font-size:11.5px; color:#7dd3fc; margin-top:7px; letter-spacing:.03em;
    text-shadow:0 1px 12px #0e1116, 0 0 20px #0e1116;}
</style>
</head>
<body>
<canvas id="cv"></canvas>
<div id="cap"><div class="box">
  <div id="capMeta"></div><div id="capText"></div><div id="capMod"></div>
</div></div>
<script>
${chunks.join('\n')}
</script>
</body>
</html>
`, 'utf8');

const blocks = DIAGRAMS.reduce((s, d) => s + d.blocks.length, 0);
const ports = DIAGRAMS.reduce((s, d) => s + d.blocks.reduce((t, b) => t + (b.in || []).length + (b.out || []).length, 0), 0);
console.log(`✓ ${OUT}
  图 ${DIAGRAMS.length} 张（L1 ${DIAGRAMS.filter(d => d.lv === 1).length} · L2 ${DIAGRAMS.filter(d => d.lv === 2).length} · L3 ${DIAGRAMS.filter(d => d.lv === 3).length} · L4 ${DIAGRAMS.filter(d => d.lv === 4).length}）
  矩形 ${blocks} 个 · 端口 ${ports} 个 · 字段表 ${Object.keys(RET_TABLES).length} 份
  文件清单 ${FILES_OUT.reduce((s, [, r]) => s + r.length, 0)} 行 · 符号清单 ${CLS_OUT.reduce((s, [, r]) => s + r.filter(x => x[3] !== 'g').length, 0)} 条
  源码片段 ${CODE_OUT.length} 段 · 流程 ${FLOWS.length} 条 · 功能 ${FEATURES.length} 项`);
