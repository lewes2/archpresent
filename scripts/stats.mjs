#!/usr/bin/env node
/**
 * stats.mjs —— 按路径模式统计文件数 / 行数 / 符号数。
 *
 * 存在的理由：写 L1、L2 的标题时常要说「server/ · 85 文件 / 18416 行」，
 * 手算必错。矩形的 t 与图的 title/sub 里应优先用 {{files}} / {{lines}} / {{exports}}
 * 占位符（build.mjs 自动填），这个脚本用于那些占位符覆盖不到的地方：
 * 跨图的总量、L1 副标题、以及分块前的方案比选。
 *
 * 用法：
 *   node stats.mjs <workDir>                        列出全部目录汇总 + 全仓合计
 *   node stats.mjs <workDir> 'server/**' 'client/**'   逐个模式统计
 *   node stats.mjs <workDir> --top 20               按符号数列出最大的 N 个文件
 *
 * 模式语法与 blockmap.mjs 完全一致：dir/** · dir/* · dir/use*.ts · 精确路径 · !排除
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const [, , WORK, ...ARGS] = process.argv;
if (!WORK) {
  console.error('用法：node stats.mjs <workDir> [模式 ...] [--top N]');
  process.exit(2);
}
const INV = JSON.parse(readFileSync(join(WORK, 'inventory.json'), 'utf8'));

/** 与 build.mjs 的 match 保持一致 —— 改一处必须改两处 */
function match(path, pat) {
  if (pat.endsWith('/**')) return path.startsWith(pat.slice(0, -2));
  if (pat.endsWith('/*')) {
    const d = pat.slice(0, -1);
    return path.startsWith(d) && !path.slice(d.length).includes('/');
  }
  if (pat.includes('*')) {
    const i = pat.lastIndexOf('/');
    const dir = pat.slice(0, i + 1), base = pat.slice(i + 1);
    if (!path.startsWith(dir) || path.slice(dir.length).includes('/')) return false;
    const rx = new RegExp('^' + base.split('*').map(s => s.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('.*') + '$');
    return rx.test(path.slice(dir.length));
  }
  return path === pat;
}

const sum = files => ({
  files: files.length,
  lines: files.reduce((s, f) => s + f.lines, 0),
  exports: files.reduce((s, f) => s + f.exports.length, 0),
});
const fmt = c => `${c.files} 文件 / ${c.lines} 行 / ${c.exports} 符号`;

const topIdx = ARGS.indexOf('--top');
const patterns = ARGS.filter((a, i) => a !== '--top' && (topIdx < 0 || i !== topIdx + 1));

if (topIdx >= 0) {
  const n = Number(ARGS[topIdx + 1]) || 20;
  console.log(`符号数最大的 ${n} 个文件（> 80 的只能各自独占一个矩形）：`);
  for (const f of [...INV.files].sort((a, b) => b.exports.length - a.exports.length).slice(0, n)) {
    const flag = f.exports.length > 80 ? ' ⚠' : '';
    console.log(`  ${String(f.exports.length).padStart(5)} 符号 ${String(f.lines).padStart(6)}L  ${f.path}${flag}`);
  }
  if (!patterns.length) process.exit(0);
  console.log('');
}

if (!patterns.length) {
  console.log('目录汇总（符号数 文件数 行数 目录）：');
  for (const d of [...INV.dirs].sort((a, b) => b.exports - a.exports)) {
    console.log(`  ${String(d.exports).padStart(5)} ${String(d.files).padStart(4)}f ${String(d.lines).padStart(7)}L  ${d.dir}`);
  }
  console.log(`\n全仓合计：${fmt(sum(INV.files))} / ${INV.dirs.length} 目录`);
  process.exit(0);
}

const inc = patterns.filter(p => !p.startsWith('!'));
const exc = patterns.filter(p => p.startsWith('!')).map(p => p.slice(1));
for (const pat of inc) {
  const hit = INV.files.filter(f => match(f.path, pat) && !exc.some(e => match(f.path, e)));
  console.log(`${pat.padEnd(44)} ${fmt(sum(hit))}`);
  if (!hit.length) console.log('    ⚠ 该模式没有命中任何文件 —— 写进 blockmap 会直接导致漏覆盖');
}
if (inc.length > 1) {
  const seen = new Set(), all = [];
  for (const pat of inc) {
    for (const f of INV.files) {
      if (match(f.path, pat) && !exc.some(e => match(f.path, e)) && !seen.has(f.path)) { seen.add(f.path); all.push(f); }
    }
  }
  console.log(`${'合计（去重）'.padEnd(40)} ${fmt(sum(all))}`);
}
