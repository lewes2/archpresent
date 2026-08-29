#!/usr/bin/env node
/**
 * stats.mjs — file / line / symbol counts by path pattern.
 *
 * Why it exists: L1 and L2 titles routinely need "server/ · 85 files / 18416 lines", and computing
 * that by hand is always eventually wrong. A rectangle's `t` and a diagram's title/sub should prefer
 * the {{files}} / {{lines}} / {{exports}} placeholders (build.mjs fills them); this script covers what
 * placeholders cannot reach: cross-diagram totals, the L1 subtitle, and comparing candidate partitions.
 *
 * Usage:
 *   node stats.mjs <workDir>                           full directory summary + repository totals
 *   node stats.mjs <workDir> 'server/**' 'client/**'   count each pattern
 *   node stats.mjs <workDir> --top 20                  the N largest files by symbol count
 *
 * Pattern syntax is exactly blockmap.mjs's, and is resolved by the same module the build uses
 * (patterns.mjs): dir/** · dir/* · dir/use*.ts · exact path · !exclude · REST:dir/*
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { selectFiles, splitPatterns } from './patterns.mjs';

const [, , WORK, ...ARGS] = process.argv;
if (!WORK) {
  console.error('Usage: node stats.mjs <workDir> [pattern ...] [--top N]');
  process.exit(2);
}
const INV = JSON.parse(readFileSync(join(WORK, 'inventory.json'), 'utf8'));

const sum = files => ({
  files: files.length,
  lines: files.reduce((s, f) => s + f.lines, 0),
  exports: files.reduce((s, f) => s + f.exports.length, 0),
});
const fmt = c => `${c.files} files / ${c.lines} lines / ${c.exports} symbols`;

const topIdx = ARGS.indexOf('--top');
const patterns = ARGS.filter((a, i) => a !== '--top' && (topIdx < 0 || i !== topIdx + 1));

if (topIdx >= 0) {
  const n = Number(ARGS[topIdx + 1]) || 20;
  console.log(`The ${n} files with the most symbols (over 80 can only own a rectangle by itself):`);
  for (const f of [...INV.files].sort((a, b) => b.exports.length - a.exports.length).slice(0, n)) {
    const flag = f.exports.length > 80 ? ' ⚠' : '';
    console.log(`  ${String(f.exports.length).padStart(5)} sym ${String(f.lines).padStart(6)}L  ${f.path}${flag}`);
  }
  if (!patterns.length) process.exit(0);
  console.log('');
}

if (!patterns.length) {
  console.log('Directory summary (symbols files lines directory):');
  for (const d of [...INV.dirs].sort((a, b) => b.exports - a.exports)) {
    console.log(`  ${String(d.exports).padStart(5)} ${String(d.files).padStart(4)}f ${String(d.lines).padStart(7)}L  ${d.dir}`);
  }
  console.log(`\nRepository total: ${fmt(sum(INV.files))} / ${INV.dirs.length} directories`);
  process.exit(0);
}

const { inc, exc, rest } = splitPatterns(patterns);
const excluders = exc.map(e => '!' + e);
for (const pat of [...inc, ...rest.map(r => 'REST:' + r)]) {
  const hit = selectFiles(INV.files, [pat, ...excluders]);
  console.log(`${pat.padEnd(44)} ${fmt(sum(hit))}`);
  if (!hit.length) console.log('    ⚠ this pattern matched no files — putting it in blockmap is a guaranteed coverage hole');
  // REST: is resolved here at its widest, because only the build knows what the other rectangles in
  // that diagram already claimed. The real block gets this set minus theirs — never more.
  else if (pat.startsWith('REST:')) console.log('    ℹ REST: shown at its widest; the build narrows it to whatever the other rectangles leave');
}
if (inc.length + rest.length > 1) {
  console.log(`${'TOTAL (deduplicated)'.padEnd(44)} ${fmt(sum(selectFiles(INV.files, patterns)))}`);
}
