#!/usr/bin/env node
/**
 * Smoke test: run the whole HTML's script for real against a minimal DOM + Canvas 2D stub, then
 * walk every diagram (layout + draw) while simulating drill-down, drawer expansion, drawer
 * scrolling and flow playback — proving the engine neither throws nor produces a NaN layout.
 */
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const HTML = process.argv[2];
if (!HTML) { console.error('Usage: node smoke.mjs <html>'); process.exit(2); }
const html = readFileSync(HTML, 'utf8');
const src = html.slice(html.indexOf('<script>') + 8, html.lastIndexOf('</script>'));

/* ---- Canvas 2D stub: record the calls, return plausible metrics ---- */
let drawCalls = 0;
const ctx2d = new Proxy({
  measureText: t => ({ width: String(t).length * 6.2 }),
  createLinearGradient: () => ({ addColorStop(){} }),
  setTransform(){}, save(){}, restore(){}, beginPath(){}, closePath(){},
  moveTo(){}, lineTo(){}, quadraticCurveTo(){}, bezierCurveTo(){}, arc(){}, arcTo(){}, rect(){},
  fill(){ drawCalls++; }, stroke(){ drawCalls++; }, fillText(){ drawCalls++; }, strokeText(){},
  clearRect(){}, fillRect(){ drawCalls++; }, strokeRect(){}, clip(){}, translate(){}, scale(){}, rotate(){},
  setLineDash(){}, drawImage(){},
}, {
  get: (t, k) => (k in t ? t[k] : undefined),
  set: () => true,
});

const listeners = {};
const mkEl = () => new Proxy({
  style:{}, classList:{ add(){}, remove(){}, contains:()=>false },
  getContext: () => ctx2d,
  addEventListener: (ev, fn) => { (listeners[ev] ||= []).push(fn); },
  removeEventListener(){}, getBoundingClientRect: () => ({ left:0, top:0, width:1600, height:900 }),
  appendChild(){}, setAttribute(){}, focus(){},
  width:1600, height:900, textContent:'', className:'', innerHTML:'',
}, { get:(t,k)=> (k in t ? t[k] : undefined), set:(t,k,v)=>{ t[k]=v; return true; } });

const canvas = mkEl();
const sandbox = {
  console,
  document: {
    getElementById: () => mkEl(),
    querySelector: () => mkEl(),
    createElement: () => mkEl(),
    addEventListener: (ev, fn) => { (listeners[ev] ||= []).push(fn); },
    body: mkEl(), documentElement: mkEl(),
  },
  window: {
    innerWidth:1600, innerHeight:900, devicePixelRatio:1,
    addEventListener: (ev, fn) => { (listeners[ev] ||= []).push(fn); },
    requestAnimationFrame: () => 0, cancelAnimationFrame(){},
    getComputedStyle: () => ({}),
  },
  requestAnimationFrame: () => 0,
  cancelAnimationFrame(){},
  setTimeout: (fn) => { try { fn(); } catch {} return 0; },
  clearTimeout(){}, setInterval: () => 0, clearInterval(){},
  performance: { now: () => 0 },
  devicePixelRatio: 1,
};
sandbox.globalThis = sandbox;
sandbox.document.getElementById = id => (id === 'cv' ? canvas : mkEl());

vm.createContext(sandbox);

let script;
try {
  script = new vm.Script(src, { filename: 'architecture.html' });
} catch (e) {
  console.error('× script syntax error: ' + e.message);
  process.exit(1);
}
console.log('✓ script parses (' + src.split('\n').length + ' lines)');

try {
  script.runInContext(sandbox);
} catch (e) {
  console.error('× script threw during init: ' + e.message + '\n' + (e.stack || '').split('\n').slice(0, 6).join('\n'));
  process.exit(1);
}
console.log('✓ init executed (first frame made ' + drawCalls + ' draw calls)');

/* ---- layout + draw, diagram by diagram ---- */
vm.runInContext(`
globalThis.__probe = () => {
  const out = { diagrams: 0, blocks: 0, bad: [], drawers: 0, scrollable: 0 };
  for (const id of Object.keys(D)) {
    const L = layout(id);
    out.diagrams++;
    for (const b of L.blocks) {
      out.blocks++;
      if (!Number.isFinite(b.x) || !Number.isFinite(b.y) || !Number.isFinite(b.h) || b.h <= 0) {
        out.bad.push(id + '/' + b.id + ' illegal layout h=' + b.h);
      }
      for (const dw of b.drawers) {
        out.drawers++;
        if (dw.rows.length > DROWS_MAX) out.scrollable++;
      }
    }
  }
  return out;
};
globalThis.__expandAll = () => {
  let n = 0;
  for (const id of Object.keys(D)) {
    for (const b of layout(id).blocks) for (const dw of b.drawers) { OPEN.add(dw.key); n++; }
  }
  for (const k of Object.keys(LAY)) delete LAY[k];
  return n;
};
globalThis.__drawEvery = () => {
  let ok = 0;
  for (const id of Object.keys(D)) { stack = [id]; fitView(id); draw(); ok++; }
  return ok;
};
globalThis.__scrollDrawers = () => {
  let n = 0;
  for (const id of Object.keys(D)) {
    for (const b of layout(id).blocks) for (const dw of b.drawers) {
      if (dw.rows.length > DROWS_MAX) { DSCROLL[dw.key] = dw.rows.length - DROWS_MAX; n++; }
    }
  }
  for (const k of Object.keys(LAY)) delete LAY[k];
  return n;
};
globalThis.__playAll = () => {
  let steps = 0;
  for (let i = 0; i < FLOWS.length; i++) { startFlow(i); steps += FLOWS[i].steps.length; stopFlow(); }
  return steps;
};
`, sandbox);

const run = (label, expr) => {
  try {
    const r = vm.runInContext(expr, sandbox);
    console.log('✓ ' + label + ': ' + (typeof r === 'object' ? JSON.stringify(r) : r));
    return r;
  } catch (e) {
    console.error('× ' + label + ' threw: ' + e.message + '\n  ' + (e.stack || '').split('\n')[1]);
    process.exitCode = 1;
    return null;
  }
};

const probe = run('layout every diagram', '__probe()');
if (probe && probe.bad.length) { probe.bad.slice(0, 10).forEach(m => console.error('    × ' + m)); process.exitCode = 1; }
run('expand every drawer', '__expandAll()');
run('scroll drawers to the end', '__scrollDrawers()');
drawCalls = 0;
run('draw every diagram (drawers expanded + scrolled)', '__drawEvery()');
console.log('  cumulative draw calls: ' + drawCalls);
run('play every flow', '__playAll()');
run('drill down L1→L2→L3→L4 and back', `(() => {
  stack = ['L1'];
  const path = Object.values(D).filter(d=>d.lv>1).slice(0,3).map(d=>d.id);
  for (const id of path) { stack.push(id); fitView(id); draw(); }
  while (stack.length > 1) { back(); draw(); }
  return stack.join('→') + ' (back at L1)';
})()`);

console.log(process.exitCode ? '\n× smoke test had failures' : '\n✓ smoke test fully passed');
