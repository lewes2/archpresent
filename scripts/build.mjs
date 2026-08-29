#!/usr/bin/env node
/**
 * build.mjs — assemble the hand-written semantic layer + the machine-read inventory into one HTML file.
 *
 * Only the semantics are hand-written: diagrams / blocks / ports / field tables / flows / features.
 * The inventories (file paths, line counts, classes, objects, functions, line numbers, source snippets)
 * all come from inventory.json and the source on disk — so transcription error is impossible.
 *
 * Usage:
 *   node build.mjs <archDir> <outHtml>
 * archDir must contain inventory.json (produced by scan.mjs) plus the hand-written
 *   diagrams.mjs · blockmap.mjs · ret.mjs · code.mjs · flows.mjs · features.mjs · notes.mjs
 */
import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { match, selectFiles } from './patterns.mjs';

const SELF = dirname(fileURLToPath(import.meta.url));
const [, , ARCH_IN, OUT_IN] = process.argv;
if (!ARCH_IN || !OUT_IN) {
  console.error('Usage: node build.mjs <archDir> <outHtml>');
  process.exit(2);
}
const ARCH = resolve(ARCH_IN), OUT = resolve(OUT_IN);
const imp = f => import(pathToFileURL(join(ARCH, f)).href);

const INV = JSON.parse(readFileSync(join(ARCH, 'inventory.json'), 'utf8'));
const REPO = INV.root;
const BY_PATH = new Map(INV.files.map(f => [f.path, f]));

/* diagrams may be a single diagrams.mjs or a diagrams/ directory (merged in filename order).
   A large project's diagram definitions easily reach a few thousand lines; splitting them into 01-l1.mjs, 02-l2.mjs… is far easier to maintain. */
async function loadDiagrams() {
  const dir = join(ARCH, 'diagrams');
  if (existsSync(dir) && statSync(dir).isDirectory()) {
    const parts = readdirSync(dir).filter(f => f.endsWith('.mjs')).sort();
    if (!parts.length) { console.error('× no .mjs shards in the diagrams/ directory'); process.exit(2); }
    const all = [];
    for (const f of parts) {
      const mod = await import(pathToFileURL(join(dir, f)).href);
      if (!Array.isArray(mod.DIAGRAMS)) {
        console.error(`× diagrams/${f} does not export a DIAGRAMS array`); process.exit(2);
      }
      all.push(...mod.DIAGRAMS);
    }
    console.error(`  ${parts.length} diagrams/ shards → ${all.length} diagrams`);
    return all;
  }
  return (await imp('diagrams.mjs')).DIAGRAMS;
}

const DIAGRAMS = await loadDiagrams();
const { BLOCKMAP } = await imp('blockmap.mjs');
if (!Array.isArray(DIAGRAMS) || !DIAGRAMS.length) {
  console.error('× no diagram definitions were read'); process.exit(2);
}
const { FILE_NOTES = {}, SYM_NOTES = {} } = await imp('notes.mjs').catch(() => ({}));
const { CODE_PICKS = [] } = await imp('code.mjs').catch(() => ({}));
const { RET_TABLES = {} } = await imp('ret.mjs').catch(() => ({}));
const { FLOWS = [] } = await imp('flows.mjs').catch(() => ({}));
const { FEATURES = [] } = await imp('features.mjs').catch(() => ({}));

/* -------------------------------------- L4 file-level module map: expanded automatically, one block per file */
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
      id, n: base, t: f.lines + ' lines · ' + f.exports.length + ' exports', k: 'code',
      col: i % COLS, row: (i / COLS) | 0,
      d: 'One file under ' + f.path.slice(0, f.path.lastIndexOf('/')) + '. Expand the drawer for every exported symbol in it (kind + line number); hover any row for the real definition snippet.',
    };
  });
  d.links = d.links || [];
  delete d.autoFiles; delete d.autoCols;
}

/* ------------------------------------------------------------ ownership resolution */
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
    if (dId === undefined) { console.error(`× BLOCKMAP key has no matching rectangle: ${key}`); process.exitCode = 1; continue; }
    if (!ownerByDia.has(dId)) ownerByDia.set(dId, new Map());
    const own = ownerByDia.get(dId);
    const files = selectFiles(INV.files, patterns, new Set(own.keys()));
    blockFiles.set(key, files);
    for (const f of files) {
      if (own.has(f.path)) {
        console.error(`× file assigned twice inside diagram ${dId}: ${f.path}\n    ${own.get(f.path)}\n    ${key}`);
        process.exitCode = 1;
      }
      own.set(f.path, key); covered.add(f.path);
    }
  }
}
const uncovered = INV.files.filter(f => !covered.has(f.path));
if (uncovered.length) {
  console.error(`× ${uncovered.length} file(s) belong to no block; first 25:`);
  uncovered.slice(0, 25).forEach(f => console.error('    ' + f.path));
  process.exitCode = 1;
}

/* A block with a child aggregates its child diagram's files (file inventory only; symbols stay on the leaf) */
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

/* -------------------------------------------- statistics placeholders (no hand-computed aggregates)
   A rectangle's t and a diagram's title / sub may contain {{files}} / {{lines}} / {{exports}};
   they are filled in here from the files that rectangle (or the whole diagram) actually owns. Hand-writing
   "12 files / 4327 lines" is the easiest thing to forget after a re-partition; placeholders cannot drift. */
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
    if (typeof s === 'string' && /\{\{/.test(s)) UNFILLED.push(`${d.id}: ${s.slice(0, 60)}`);
  }
}
if (UNFILLED.length) {
  console.error(`× ${UNFILLED.length} placeholder(s) could not be replaced (only {{files}} / {{lines}} / {{exports}} are supported):`);
  UNFILLED.slice(0, 10).forEach(s => console.error('    ' + s));
  process.exitCode = 1;
}

/* ------------------------------------------------------------ inventory tables */
const KIND_ORDER = { 'Service':0, 'class':1, 'abstract class':2, 'interface':3, 'type':4,
                     'enum':5, 'slice':6, 'component':7, 'hook':8,
                     // Single-file component: contract first (props/emits), then state, then behaviour
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
    rows.push([f.path, f.lines + ' lines', '', 'g']);
    for (const e of f.exports.slice().sort((a, b) =>
      (KIND_ORDER[a.kind] ?? 99) - (KIND_ORDER[b.kind] ?? 99) || a.line - b.line)) {
      rows.push([e.name, e.kind + ' · L' + e.line, SYM_NOTES[f.path + '#' + e.name] || '',
                 undefined, f.path + ':' + e.line]);
    }
  }
  if (rows.length) CLS_OUT.push([key, rows]);
}

/* ------------------------------------------------ source snippets (cut fresh from disk) */
const CODE_OUT = [];
for (const [path, symbol, span = 24] of CODE_PICKS) {
  const rec = BY_PATH.get(path);
  if (!rec) { console.error(`× CODE_PICKS points at a file that does not exist: ${path}`); process.exitCode = 1; continue; }
  const hit = rec.exports.find(e => e.name === symbol);
  if (!hit) {
    const near = rec.exports
      .filter(e => e.name.toLowerCase().includes(symbol.toLowerCase()) || symbol.toLowerCase().includes(e.name.toLowerCase()))
      .map(e => e.name).slice(0, 6);
    const all = rec.exports.map(e => e.name).slice(0, 12);
    console.error(`× CODE_PICKS points at a symbol that does not exist: ${path}#${symbol}`);
    console.error(`    available in that file: ${(near.length ? near : all).join(' · ')}${rec.exports.length > 12 && !near.length ? ' …' : ''}`);
    process.exitCode = 1; continue;
  }
  const src = readFileSync(join(REPO, path), 'utf8').split('\n');
  let lead = hit.line - 1;
  while (lead > 0) {                                  // absorb the comment block immediately above
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

/* ------------------------------------------------------------ reference integrity */
const diaIds = new Set(DIAGRAMS.map(d => d.id));
const blockKeys = new Set();
for (const d of DIAGRAMS) for (const b of d.blocks) blockKeys.add(d.id + '/' + b.id);
for (const d of DIAGRAMS) {
  const ids = new Set(d.blocks.map(b => b.id));
  if (d.parent && !diaIds.has(d.parent)) { console.error(`× ${d.id} parent does not exist: ${d.parent}`); process.exitCode = 1; }
  for (const b of d.blocks) if (b.child && !diaIds.has(b.child)) {
    console.error(`× ${d.id}/${b.id} child does not exist: ${b.child}`); process.exitCode = 1;
  }
  for (const L of d.links || []) {
    if (!ids.has(L.s[0])) { console.error(`× ${d.id} link source block does not exist: ${L.s[0]}`); process.exitCode = 1; }
    if (!ids.has(L.t[0])) { console.error(`× ${d.id} link target block does not exist: ${L.t[0]}`); process.exitCode = 1; }
    const sb = d.blocks.find(b => b.id === L.s[0]);
    if (sb && !(sb.out || [])[L.s[1]]) {
      console.error(`× ${d.id}/${L.s[0]} has no output port #${L.s[1]} (it has ${(sb.out || []).length})`); process.exitCode = 1;
    }
    // The target input port is not checked: if the target has no port at that index, the engine synthesizes
    // one from the source port's five fields (which is exactly how an L4 state machine gets away with writing only out). So the one thing that must hold here is that the source port exists.
  }
}
for (const k of Object.keys(RET_TABLES)) {
  const m = k.match(/^(.+)\/(in|out):(\d+)$/);
  if (!m) { console.error(`× malformed RET key (expected diagramId/blockId/out:0): ${k}`); process.exitCode = 1; continue; }
  if (!blockKeys.has(m[1])) { console.error(`× RET key has no matching block: ${k}`); process.exitCode = 1; continue; }
  const dId = m[1].slice(0, m[1].lastIndexOf('/')), bId = m[1].slice(m[1].lastIndexOf('/') + 1);
  const b = DIAGRAMS.find(x => x.id === dId)?.blocks.find(x => x.id === bId);
  const arr = m[2] === 'in' ? (b?.in || []) : (b?.out || []);
  if (!arr[Number(m[3])]) {
    console.error(`× RET points at a port that does not exist: ${k} (that block's ${m[2]} has only ${arr.length})`);
    if (m[2] === 'in') console.error('    If it is an input port synthesized by a link, attach the field table to the SOURCE block\'s out:N — the engine carries it over.');
    process.exitCode = 1;
  }
}
for (const fl of FLOWS) for (const st of fl.steps) if (!blockKeys.has(st[0])) {
  console.error(`× flow "${fl.name}" has a step pointing at a block that does not exist: ${st[0]}`); process.exitCode = 1;
}
for (const ft of FEATURES) if (!blockKeys.has(ft.key)) {
  console.error(`× feature "${ft.n}" points at a block that does not exist: ${ft.key}`); process.exitCode = 1;
}

/* ------------------------------------------------------------ HTML output */
const J = v => JSON.stringify(v);
const title = (DIAGRAMS.find(d => d.lv === 1) || {}).title || 'Architecture map';
const chunks = [`"use strict";
/* =========================================================================
   ${title}
   Generated by the archpresent skill. Do not edit by hand.
   The inventories (files / line counts / classes / objects / functions / line numbers / snippets) are read
   directly from source by scan.mjs, and asserted back against the source item by item by verify.mjs.
   Repository snapshot: ${INV.totals.files} non-test source files · ${INV.totals.lines} lines · ${INV.totals.exports} exported symbols · ${INV.totals.dirs} directories

   Interaction: click a rectangle to drill in · right-click/Esc/Backspace to go back · hover a port for its interface fields
        hover an inventory row for the real definition snippet · wheel inside a drawer to page (Shift = whole page · Alt = jump to either end)
        wheel to zoom · drag to pan · F fit · E expand all · L switch the left panel tab
   ========================================================================= */

/* ---------------------------------------------------------------- data model */
const D = {};
const dia = o => (D[o.id] = o);
const p = (n, t, l, s, d) => ({ n, t, l, s, d });`];

for (const d of DIAGRAMS) chunks.push('dia(' + J(d) + ');');
chunks.push('\n/* ---------------------------------------------------- module → file inventory (generated) */\nconst FILES = {};\nconst F = (key, list) => (FILES[key] = list);');
for (const [k, r] of FILES_OUT) chunks.push(`F(${J(k)},${J(r)});`);
chunks.push('\n/* ------------------------------------------ module → class / object / function inventory (generated) */\nconst CLS = {};\nconst C = (key, list) => (CLS[key] = list);');
for (const [k, r] of CLS_OUT) chunks.push(`C(${J(k)},${J(r)});`);
chunks.push('\n/* --------------------------------------------------------- interface field tables (hand-written) */\nconst RET = {};\nconst R = (key, list) => (RET[key] = list);');
for (const [k, r] of Object.entries(RET_TABLES)) chunks.push(`R(${J(k)},${J(r)});`);
chunks.push('\n/* ------------------------------------------ symbol → real definition snippet (from source) */\nconst CODE = {};\nconst K = (k, f, l, s) => (CODE[k] = { f, l, s });');
for (const [k, f, l, s] of CODE_OUT) chunks.push(`K(${J(k)},${J(f)},${l},${J(s)});`);
chunks.push('\n/* ------------------------------------------------------- representative scenario flows (hand-written) */\nconst FLOWS = [];\nconst flow = (name, from, role, steps) =>\n  FLOWS.push({ name, from, role, steps: steps.map(s => ({ key:s[0], t:s[1] })) });');
for (const fl of FLOWS) chunks.push(`flow(${J(fl.name)},${J(fl.from)},${J(fl.role)},${J(fl.steps)});`);
chunks.push('\n/* --------------------------------------------------------- L1 feature list (hand-written) */\nconst FEATURES = [];\nconst feat = (n, cat, key, d) => FEATURES.push({ n, cat, key, d });');
for (const ft of FEATURES) chunks.push(`feat(${J(ft.n)},${J(ft.cat)},${J(ft.key)},${J(ft.d)});`);
chunks.push(readFileSync(join(SELF, '..', 'assets', 'engine.js'), 'utf8'));

writeFileSync(OUT, `<!doctype html>
<html lang="en">
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
    font-family:system-ui,-apple-system,"Segoe UI",Roboto,"Helvetica Neue",Arial,"Microsoft YaHei","PingFang SC",sans-serif;}
  #capMeta{ font-size:11px; letter-spacing:.06em; color:#6f7d90; margin-bottom:7px;
    text-shadow:0 1px 10px #0e1116, 0 0 18px #0e1116;}
  #capText{ font-size:15.5px; line-height:1.62; color:#e9f1fa; font-weight:600;
    text-shadow:0 2px 16px rgba(8,11,15,.95), 0 0 34px rgba(8,11,15,.85), 0 0 6px rgba(8,11,15,1);}
  #capMod{ font-size:11.5px; color:#7dd3fc; margin-top:7px; letter-spacing:.03em;
    text-shadow:0 1px 12px #0e1116, 0 0 20px #0e1116;}

  /* ---- edit mode: the form the engine anchors over a clicked label ---- */
  #ed{ position:fixed; z-index:40; display:none; width:410px; max-width:calc(100vw - 32px);
    background:#141922; border:1px solid #3a4658; border-radius:10px;
    box-shadow:0 18px 60px rgba(0,0,0,.62), 0 0 0 1px rgba(125,211,252,.10);
    font-family:system-ui,-apple-system,"Segoe UI",Roboto,"Helvetica Neue",Arial,"Microsoft YaHei","PingFang SC",sans-serif;
    color:#dbe4f0; padding:12px 13px 11px;}
  #ed.show{ display:block; }
  #edHead{ font-size:10.5px; letter-spacing:.07em; text-transform:uppercase; color:#7dd3fc;
    margin-bottom:9px; display:flex; justify-content:space-between; align-items:center; gap:10px;}
  #edHead span.path{ color:#5f6d80; text-transform:none; letter-spacing:0; font-size:10.5px;
    overflow:hidden; text-overflow:ellipsis; white-space:nowrap;}
  #ed label{ display:block; font-size:10px; color:#77839a; margin:0 0 3px; letter-spacing:.04em;}
  #ed .fld{ margin-bottom:8px; }
  #ed input, #ed textarea{ width:100%; box-sizing:border-box; background:#0e1218; color:#e6edf7;
    border:1px solid #2c3644; border-radius:6px; padding:6px 8px; font-size:12px; line-height:1.5;
    font-family:inherit; resize:vertical; outline:none;}
  #ed input:focus, #ed textarea:focus{ border-color:#5b8ff9; box-shadow:0 0 0 2px rgba(91,143,249,.18);}
  #ed textarea{ min-height:64px; }
  #edBtns{ display:flex; gap:8px; justify-content:flex-end; margin-top:4px; }
  #ed button{ font-family:inherit; font-size:11.5px; padding:5px 13px; border-radius:6px; cursor:pointer;
    background:#1d232c; color:#a7b3c4; border:1px solid #333c48;}
  #ed button:hover{ background:#2a3446; color:#dce9ff; border-color:#5b8ff9;}
  #ed button.pri{ background:#1d3a5c; color:#cfe3ff; border-color:#4b8bf5;}
  #ed button.pri:hover{ background:#244973; }
  #ed .hint{ font-size:10px; color:#5f6d80; margin-top:7px; }
</style>
</head>
<body>
<canvas id="cv"></canvas>
<div id="cap"><div class="box">
  <div id="capMeta"></div><div id="capText"></div><div id="capMod"></div>
</div></div>
<div id="ed">
  <div id="edHead"><b id="edTitle"></b><span class="path" id="edPath"></span></div>
  <div id="edBody"></div>
  <div id="edBtns"><button id="edCancel">Cancel (Esc)</button><button class="pri" id="edOk">Apply (Ctrl+Enter)</button></div>
  <div class="hint">Edits are kept in this browser (localStorage). Ctrl+drag a rectangle to move it.</div>
</div>
<script>
${chunks.join('\n')}
</script>
</body>
</html>
`, 'utf8');

const blocks = DIAGRAMS.reduce((s, d) => s + d.blocks.length, 0);
const ports = DIAGRAMS.reduce((s, d) => s + d.blocks.reduce((t, b) => t + (b.in || []).length + (b.out || []).length, 0), 0);
console.log(`✓ ${OUT}
  ${DIAGRAMS.length} diagrams (L1 ${DIAGRAMS.filter(d => d.lv === 1).length} · L2 ${DIAGRAMS.filter(d => d.lv === 2).length} · L3 ${DIAGRAMS.filter(d => d.lv === 3).length} · L4 ${DIAGRAMS.filter(d => d.lv === 4).length})
  ${blocks} rectangles · ${ports} ports · ${Object.keys(RET_TABLES).length} field tables
  file inventory ${FILES_OUT.reduce((s, [, r]) => s + r.length, 0)} rows · symbol inventory ${CLS_OUT.reduce((s, [, r]) => s + r.filter(x => x[3] !== 'g').length, 0)} rows
  ${CODE_OUT.length} source snippets · ${FLOWS.length} flows · ${FEATURES.length} features`);
