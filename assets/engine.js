/* ---------------------------------------------------------------- rendering engine */
const KIND = {
  person:{ f:'#123c3a', s:'#2fbfa8', t:'#d9fff7', tag:'Person'   },
  ext:   { f:'#252932', s:'#7a828f', t:'#c6ccd6', tag:'External', dash:[6,4] },
  app:   { f:'#14294a', s:'#4b8bf5', t:'#dde9ff', tag:'System'   },
  extc:  { f:'#241a45', s:'#8b7cf6', t:'#e6e0ff', tag:'System'   },
  lib:   { f:'#122f45', s:'#38bdf8', t:'#dcf2ff', tag:'Container'},
  comp:  { f:'#13301f', s:'#4ade80', t:'#d9ffe6', tag:'Component'},
  code:  { f:'#2a2340', s:'#a78bfa', t:'#ece5ff', tag:'Code'     },
  store: { f:'#33290f', s:'#eab308', t:'#ffeec0', tag:'Store'    },
  risk:  { f:'#361a1c', s:'#f87171', t:'#ffdcdc', tag:'Risk',    dash:[5,4] },
  note:  { f:'#1b1e25', s:'#3c424d', t:'#9aa3ad', tag:'Note'    }
};

/* --------------------------------------------------------------- kind icons
   Icons: Lucide (https://lucide.dev) — ISC licence, free and open source.
   Only the outline path data is embedded, one 24x24 glyph per kind, stroked through Path2D. An icon
   font or an <img> would mean either a network request (the CSP and the single-file rule both forbid
   it) or a fat base64 blob; a path string costs ~120 bytes, inherits the canvas transform, and takes
   its colour from the rectangle's own palette for free.
   Sub-paths are concatenated into one `d` — each still starts with M, so they render as one glyph.
   A `h.01` segment is Lucide's idiom for a dot: zero length, drawn round by lineCap. */
const ICON_D = {
  person: 'M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2M16 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0',                    // user
  app:    'M4 2h16a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2z'                          // server
        + 'M4 14h16a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-4a2 2 0 0 1 2-2zM6 6h.01M6 18h.01',
  extc:   'M5 4h14a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1zM9 9h6v6H9z'              // cpu
        + 'M15 2v2M9 2v2M15 20v2M9 20v2M20 9h2M20 15h2M2 9h2M2 15h2',
  ext:    'M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9z',                                            // cloud
  lib:    'm16 6 4 14M12 6v14M8 8v12M4 4v16',                                                               // library
  // layers. Note every sub-path after the first starts with an UPPERCASE M: concatenated into one
  // `d`, a lowercase m would be read as relative to the previous sub-path's end, not as Lucide's
  // own absolute origin — which silently deforms the glyph instead of failing.
  comp:   'M12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9'
        + 'a1 1 0 0 0 0-1.83z'
        + 'M22 17.65l-9.17 4.16a2 2 0 0 1-1.66 0L2 17.65'
        + 'M22 12.65l-9.17 4.16a2 2 0 0 1-1.66 0L2 12.65',
  code:   'm16 18 6-6-6-6M8 6l-6 6 6 6',                                                                    // code
  store:  'M21 5a9 3 0 1 1-18 0 9 3 0 0 1 18 0M3 5v14a9 3 0 0 0 18 0V5M3 12a9 3 0 0 0 18 0',                // database
  risk:   'm21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3zM12 9v4M12 17h.01',     // triangle-alert
  note:   'M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0M12 16v-4M12 8h.01',                                     // info
};

/* Path2D is built once per kind and reused for every rectangle of that kind, every frame.
   Guarded because a headless/stubbed canvas may not provide Path2D — the map then simply loses its
   icons rather than failing to render. */
const ICON_CACHE = new Map();
function iconOf(kind){
  if (!ICON_CACHE.has(kind)){
    const d = ICON_D[kind];
    let p = null;
    if (d && typeof Path2D !== 'undefined'){ try { p = new Path2D(d); } catch { p = null; } }
    ICON_CACHE.set(kind, p);
  }
  return ICON_CACHE.get(kind);
}

/** Draw a kind glyph with its top-left at (x, y), scaled to `size` px, in the rectangle's own colour. */
function drawIcon(kind, x, y, size, colour, alpha){
  const p = iconOf(kind);
  if (!p) return false;
  const k = size / 24;
  g.save();
  g.translate(x, y); g.scale(k, k);
  g.strokeStyle = colour;
  g.globalAlpha = alpha;
  g.lineWidth = 2;                       // Lucide's own stroke width, in its 24-unit space
  g.lineJoin = 'round'; g.lineCap = 'round';
  g.stroke(p);
  g.restore();
  return true;
}

const LV_NAME = ['', 'L1 · System Context', 'L2 · Container', 'L3 · Component', 'L4 · Code'];

const cv = document.getElementById('cv');
const g  = cv.getContext('2d');
const FONT = 'system-ui,-apple-system,"Segoe UI",Roboto,"Helvetica Neue",Arial,"Microsoft YaHei","PingFang SC",sans-serif';
let VW = 0, VH = 0, DPR = 1;

const LAY   = {};                 // layout cache: id -> {blocks, links, bbox}
let stack   = ['L1'];             // navigation stack
let views   = {};                 // id -> {s, tx, ty}
let hover   = null;               // {kind:'port'|'block'|'btn'|'crumb'|'drawer'|'feat', ...}
let mouse   = { x:0, y:0, in:false };
let drag    = null;
let pending = false;

const HIT = { btns:[], crumbs:[], feats:[], tabs:[], ctrl:[] };

/* ------------------------------------------------------------------ edit mode
   Two capabilities, both behind the top-right ✎ Edit button so ordinary reading is untouched:
     · click any drawn label  → an anchored form holding that element's real text fields
     · Ctrl+drag a rectangle  → free positioning; links re-route because layout() is simply recomputed
   The canvas holds no text nodes, so an "editable label" is a rectangle registered during draw()
   plus a DOM form anchored over it. Both kinds of edit persist to localStorage. */
let editMode = false;
const POS   = {};                 // "<diagram id>/<rect id>" -> {x,y} in normalized layout space
const ETEXT = [];                 // per-frame editable label boxes (screen coords), topmost last
let blockDrag = null;             // {b, key, ox, oy, sx, sy, moved}
let editing = null;               // the open editor's descriptor

/* Register a clickable label. Called from the draw functions, and only while editing.
   `pkey` is the stable identity used to persist an edit across reloads. */
function ereg(x, y, w, h, target, fields, focusKey, title, path, pkey){
  if (!editMode || !target || w <= 0) return;
  // Zoomed far out the labels collapse on top of each other and are unreadable anyway — do not
  // offer a hit box you cannot aim at. Ctrl+drag still works at any zoom.
  if (h < 7) return;
  // Vertical padding stays at 1px: two stacked labels are only ~15px apart at fit zoom, and a
  // generous hit box would make the lower one steal the upper one's clicks.
  ETEXT.push({ x:x-3, y:y-1, w:w+6, h:h+2, target, fields, focusKey, title, path, pkey });
}
/* Same, for a label drawn in world coordinates (inside the panned/zoomed scene). */
function eregW(v, wx, wy, ww, wh, target, fields, focusKey, title, path, pkey){
  if (!editMode) return;
  ereg(wx*v.s + v.tx, wy*v.s + v.ty, ww*v.s, wh*v.s, target, fields, focusKey, title, path, pkey);
}
const F_BLOCK = [ { k:'n', label:'Name' },
                  { k:'t', label:'Subtitle · path / size' },
                  { k:'d', label:'Description (the hover text)', ml:1 } ];
const F_PORT  = [ { k:'n', label:'Port name' },
                  { k:'t', label:'Data type — a real identifier' },
                  { k:'l', label:'Size / capacity' },
                  { k:'s', label:'Storage / landing place' },
                  { k:'d', label:'Why — the constraint and its failure mode', ml:1 } ];
const F_DIA   = [ { k:'title', label:'Diagram title' },
                  { k:'sub',   label:'Subtitle', ml:1 } ];
const F_LINK  = [ { k:'l', label:'Link label' } ];

let panelTab = 'flow';            // left panel tab: 'flow' scenarios | 'feat' L1 capability list
let focus    = null;              // rectangle highlighted after a jump from the capability list {dia, block, t0}
let featScroll = 0;               // capability list scroll offset (the list outgrows the viewport, so it must scroll)

const HEAD = 54, PITCH = 24, PADB = 12, GX = 116, GY = 44, MINH = 92;
const FCHIP = 22, FROW = 17;      // file drawer: handle height / row height
const OPEN = new Set();           // expanded drawers (key: "<diagram id>/<rect id>#<drawer index>")

/* Change ①: drawer viewport. A single file can export ~90 symbols; a full inventory would stretch
   the rectangle to thousands of pixels — a drawer shows at most DROWS_MAX rows and scrolls the rest. */
const DROWS_MAX = 26;
const DSCROLL = {};               // drawer key -> index of the first visible row
const drawerView = dw => Math.min(dw.rows.length, DROWS_MAX);
const drawerBodyH = dw => (dw.open ? drawerView(dw)*FROW + 8 : 0);
const drawerOff = dw => Math.max(0, Math.min(dw.rows.length - drawerView(dw), DSCROLL[dw.key] | 0));
/* Change ②: inventory group headers. When a row's 4th slot is 'g' it is drawn as a dim filename and
   cannot be hovered — so all three levels (directory > file > class) stay visible in one drawer. */
const isGroupRow = f => f && f[3] === 'g';
/* Source-snippet key for an inventory row: among thousands of symbols many share a name (default /
   index / handle …), so the key is "file:line", carried in the 5th slot, falling back to the symbol name. */
const codeOf = f => (f && (CODE[f[4]] || CODE[f[0]])) || null;

const cur   = () => stack[stack.length - 1];
const curD  = () => D[cur()];
const view  = () => (views[cur()] || (views[cur()] = null));

function requestDraw(){ if(!pending){ pending = true; requestAnimationFrame(()=>{ pending=false; draw(); }); } }

/* ------------------------------------------- diagram parent/child links and cross-level projection */
const PARENT = {};                 // child diagram id -> {dia, block}
Object.keys(D).forEach(id => D[id].blocks.forEach(b => {
  if (b.child && D[b.child] && D[b.child].lv === D[id].lv + 1 && !PARENT[b.child])
    PARENT[b.child] = { dia:id, block:b.id };
}));
/* Fallback: a diagram that declares `parent` but that no rectangle points at with `child` still
   belongs in the tree. Without this its breadcrumb collapses to a single entry and BOTH ways out go
   dead — Back and Top test stack.length > 1 — so a flow step that dives into it strands the reader
   there. block:null means "no rectangle to highlight at that level": project() returns null for that
   level, which is already the "invisible here" contract, and keeps walking for the levels above. */
Object.keys(D).forEach(id => {
  const d = D[id];
  if (!PARENT[id] && d.parent && D[d.parent] && D[d.parent].lv === d.lv - 1)
    PARENT[id] = { dia:d.parent, block:null };
});
function pathOf(id){ const p=[id]; let c=id; while (PARENT[c]){ c=PARENT[c].dia; p.unshift(c); } return p; }
/* Project a step at any depth onto a given level: walk up to that diagram, return its ancestor rectangle */
function project(key, diaId){
  let [d, b] = key.split('/');
  for (let i = 0; d !== diaId; i++){
    const pa = PARENT[d];
    if (!pa || i > 8) return null;          // the step lives on a deeper branch, invisible at this level
    b = pa.block; d = pa.dia;
  }
  return b;
}

/* ------------------------------------------------------------ flow playback */
const MOVE_MIN = 520, MOVE_MAX = 1500, HOLD = 430, LOOP_GAP = 950, PANEL_W = 320;
const PANEL_TAB_W = 30;            // the handle left behind when the sidebar is collapsed
const now = () => Date.now();
let autoDive = true;               // "follow the flow into the next level"
let play = null;                   // {fi, si, dia, fromId, toId, pts, cum, len, t0, dur, phase, trail, paused}
let playRate = 1;                  // playback speed: 0.5 / 1 / 1.5
let lastFlow = 0;                  // the flow played last, reused by the controller's ▶
let panelOpen = true;              // sidebar expanded / collapsed

const panelW = () => (panelOpen ? PANEL_W : PANEL_TAB_W);

/* Time elapsed within this step. Frozen at play.paused while paused, then scaled by the rate. */
const playT = () => ((play.paused || now()) - play.t0) * playRate;

function startFlow(i){
  if (play && play.fi === i){ stopFlow(); return; }
  lastFlow = i;
  play = { fi:i, si:-1, dia:cur(), fromId:null, toId:null, lastKey:null,
           phase:'gap', t0:now(), dur:LOOP_GAP, trail:[], paused:0 };
  requestDraw();
}
function stopFlow(){ play = null; requestDraw(); }

function togglePause(){
  if (!play){ startFlow(lastFlow); return; }
  if (play.paused){ play.t0 += now() - play.paused; play.paused = 0; }
  else play.paused = now();
  requestDraw();
}

function setRate(r){
  if (play && !play.paused){                       // keep the current step's progress from jumping
    const done = playT();
    playRate = r;
    play.t0 = now() - done / playRate;
  } else playRate = r;
  requestDraw();
}

/* Jump to step `target` (wrapping). Stepping also pauses — that is what "one step at a time" means. */
function seekStep(target){
  if (!play) return;
  const fl = FLOWS[play.fi], n = fl.steps.length;
  let t = ((target % n) + n) % n;

  // The target step must land on a rectangle at this level; if it cannot, keep looking the same way
  let dia = null, B = null;
  for (let guard = 0; guard < n; guard++){
    const key = fl.steps[t].key;
    const d = autoDive ? key.split('/')[0] : cur();
    const b = D[d] ? project(key, d) : null;
    if (b && layout(d).byId[b]){ dia = d; B = b; break; }
    t = (t + 1) % n;
  }
  if (!B) return;

  if (dia !== cur()){                              // follow the flow to another level
    beginTransition(D[dia].lv >= D[cur()].lv ? 1 : -1, 300);
    stack = pathOf(dia); fitView(dia);
  }

  // Starting point: the nearest earlier step that projects onto this diagram
  const L = layout(dia);
  let from = null;
  for (let i = t - 1; i >= 0; i--){
    const b = project(fl.steps[i].key, dia);
    if (b && L.byId[b]){ from = b === B ? null : b; break; }
  }

  play.si = t; play.dia = dia; play.lastKey = fl.steps[t].key;
  play.fromId = from; play.toId = B;
  play.pts = null; play.trail = [];
  play.phase = 'hold'; play.t0 = now(); play.dur = HOLD;
  play.paused = now();                             // stop on this step
  requestDraw();
}

function stepBy(dir){
  if (!play){ startFlow(lastFlow); seekStep(dir > 0 ? 0 : -1); return; }
  seekStep(play.si + dir);
}

function advance(){
  const fl = FLOWS[play.fi];
  for (let guard = 0; guard < 60; guard++){
    play.si++;
    if (play.si >= fl.steps.length){                    // one lap finished → loop
      play.si = -1; play.fromId = null; play.toId = null; play.lastKey = null;
      play.phase = 'gap'; play.t0 = now(); play.dur = LOOP_GAP; play.trail = [];
      return;
    }
    const step = fl.steps[play.si];
    const sdia = step.key.split('/')[0];
    let dia = autoDive ? sdia : cur();

    if (autoDive && dia !== cur()){                                        // follow the flow to another level
      beginTransition(D[dia].lv >= D[cur()].lv ? 1 : -1, 300);
      stack = pathOf(dia); fitView(dia);
    }

    const B = project(step.key, dia);
    if (!B) continue;                                   // this step is deeper; no rectangle for it here
    const L = layout(dia);
    if (!L.byId[B]) continue;

    // Where the previous step landed in this diagram: itself if same diagram, else its ancestor; if neither (just drilled in), fade in
    let from = play.lastKey ? project(play.lastKey, dia) : null;
    if (from && !L.byId[from]) from = null;

    play.dia = dia; play.lastKey = step.key;
    play.fromId = from; play.toId = B;

    if (!from || from === B){                           // staying put: only refresh the step caption
      play.pts = null; play.phase = 'hold'; play.t0 = now(); play.dur = HOLD;
    } else {
      const r = buildRoute(dia, from, B);
      play.pts = r.pts; play.cum = r.cum; play.len = r.len;
      play.phase = 'move'; play.t0 = now();
      play.dur = Math.min(MOVE_MAX, Math.max(MOVE_MIN, r.len * 1.35));
    }
    return;
  }
  stopFlow();
}

function updatePlay(){
  if (!play || play.paused) return;
  if (playT() < play.dur) return;
  if (play.phase === 'move'){ play.phase = 'hold'; play.t0 = now(); play.dur = HOLD; }
  else advance();
}

/* Routing between two rectangles: follow an existing link when there is one, else fall back to orthogonal;
   both ends extend to the rectangle centre, so the dot reads as "through the module → along the link → into the next" */
function buildRoute(diaId, aId, bId){
  const L = layout(diaId), A = L.byId[aId], B = L.byId[bId];
  const ac = { x:A.x+A.w/2, y:A.y+A.h/2 }, bc = { x:B.x+B.w/2, y:B.y+B.h/2 };
  let mid = null;
  const fwd = L.links.find(k => k.s === A && k.t === B);
  if (fwd) mid = fwd.pts.map(p => ({ x:p[0], y:p[1] }));
  else {
    const rev = L.links.find(k => k.s === B && k.t === A);
    if (rev) mid = rev.pts.map(p => ({ x:p[0], y:p[1] })).reverse();
  }
  let pts;
  if (mid) pts = [ac, ...mid, bc];
  else {
    const ax = A.x + A.w, bx = B.x;
    if (bx - ax > 40){
      const mx = (ax + bx) / 2;
      pts = [ac, {x:ax,y:ac.y}, {x:mx,y:ac.y}, {x:mx,y:bc.y}, {x:bx,y:bc.y}, bc];
    } else {
      const yb = Math.max(A.y+A.h, B.y+B.h) + 34;
      pts = [ac, {x:ax+18,y:ac.y}, {x:ax+18,y:yb}, {x:B.x-18,y:yb}, {x:B.x-18,y:bc.y}, bc];
    }
  }
  const cum = [0]; let len = 0;
  for (let i = 1; i < pts.length; i++){
    len += Math.hypot(pts[i].x-pts[i-1].x, pts[i].y-pts[i-1].y);
    cum.push(len);
  }
  return { pts, cum, len };
}
function pointAt(pts, cum, d){
  for (let i = 1; i < pts.length; i++){
    if (d <= cum[i] || i === pts.length-1){
      const seg = (cum[i]-cum[i-1]) || 1;
      const u = Math.max(0, Math.min(1, (d-cum[i-1])/seg));
      return { x: pts[i-1].x + (pts[i].x-pts[i-1].x)*u, y: pts[i-1].y + (pts[i].y-pts[i-1].y)*u };
    }
  }
  const l = pts[pts.length-1]; return { x:l.x, y:l.y };
}
/* Step caption overlay (DOM layer — the one thing not drawn on canvas, so that it can use CSS transitions) */
const cap     = document.getElementById('cap');
const capMeta = document.getElementById('capMeta');
const capText = document.getElementById('capText');
const capMod  = document.getElementById('capMod');
let capKey = null, capTimer = null;

function setCaption(){
  if (!play || play.si < 0){                       // nothing playing / between laps → sink and fade out
    if (capKey !== null){ capKey = null; cap.className = ''; }
    return;
  }
  const k = play.fi + ':' + play.si;
  if (k === capKey) return;
  capKey = k;

  const fl = FLOWS[play.fi], st = fl.steps[play.si];
  const [sdia, sbid] = st.key.split('/');
  const blk = D[sdia].blocks.find(b => b.id === sbid);

  cap.className = 'out';                           // fade out first, then swap the text and float it up
  cap.style.left = ((play || cur() === 'L1') ? panelW() + 44 : 40) + 'px';
  if (capTimer) clearTimeout(capTimer);
  capTimer = setTimeout(() => {
    if (capKey !== k) return;
    capMeta.textContent = 'step ' + (play.si+1) + ' / ' + fl.steps.length + '   ·   L'
                        + D[sdia].lv + '   ·   ' + D[sdia].title;
    capText.textContent = st.t;
    capMod.textContent  = blk ? '▸ ' + blk.n + (blk.t ? '   ·   ' + blk.t : '') : '';
    cap.className = 'show';
  }, 150);
}

function dotPos(){
  const L = layout(play.dia), to = L.byId[play.toId];
  if (!to) return null;
  if (play.phase !== 'move' || !play.pts) return { x: to.x+to.w/2, y: to.y+to.h/2 };
  const p = Math.min(1, playT()/play.dur);
  const e = p < .5 ? 2*p*p : 1 - Math.pow(-2*p+2, 2)/2;     // easeInOutQuad
  return pointAt(play.pts, play.cum, e * play.len);
}

/* ------------------------------------------------------------------ layout */
function layout(id){
  if (LAY[id]) return LAY[id];
  const d = D[id];
  const colw = d.colw || 262;
  const raw = {};
  const wrapped = d.blocks.map((b, i) => {
    const key = d.id + '/' + b.id;
    /* Drawers: one handle/row renderer fed two kinds of content — the file inventory and the internal
       classes/objects. A row is [main text, right-hand metric, note], shared by both kinds. */
    const drawers = [];
    const fl = b.f || FILES[key] || FILES[d.id + '/*'] || null;
    if (fl && fl.length) drawers.push({ label:'Files', kind:'file', rows:fl, open:OPEN.has(key + '#0') });
    const cl = b.c || CLS[key] || null;
    if (cl && cl.length) drawers.push({ label:'Classes / objects', kind:'cls', rows:cl, open:OPEN.has(key + '#' + drawers.length) });
    drawers.forEach((dw, di) => { dw.di = di; dw.key = key + '#' + di; dw.open = OPEN.has(dw.key); });
    const bb = {
      ref:b, id:b.id, n:b.n, t:b.t, k:b.k || 'comp', d:b.d, child:b.child,
      key, drawers,
      w: colw, h: 0,
      in: (b.in||[]).slice(), out:(b.out||[]).slice(),
      col: b.col|0, row: (b.row===undefined? i : b.row)
    };
    raw[b.id] = bb;
    return bb;
  });

  /* Completing signal semantics: a signal line carries exactly one payload, so when the target block does
     not declare that input port, derive it from the upstream output port (same type / size / storage). */
  const synth = {};
  const edges = [];
  (d.links||[]).forEach((L, li) => {
    const sb = raw[L.s[0]], tb = raw[L.t[0]];
    if (!sb || !tb) return;
    const sp = sb.out[L.s[1]];
    if (!sp) return;
    let ti = L.t[1];
    if (!tb.in[ti]){
      const key = L.t[0] + ':' + ti;
      if (synth[key] === undefined){
        // `src` points back at the port this one was derived from, so editing it edits the real port
        tb.in.push({ n:sp.n, t:sp.t, l:sp.l, s:sp.s, d:sp.d, derived:true, src:sp,
                     ret: RET[d.id + '/' + L.s[0] + '/out:' + L.s[1]] || null });
        synth[key] = tb.in.length - 1;
      }
      ti = synth[key];
    }
    edges.push({ sb, tb, sp, ti, l:L.l, ref:L, li });
  });

  const cols = {};
  wrapped.forEach(bb => {
    const n = Math.max(bb.in.length, bb.out.length);
    bb.portsH = Math.max(MINH, HEAD + n*PITCH + PADB);          // port area height (drawer handles sit below it)
    bb.h = bb.portsH + bb.drawers.reduce(
      (s, dw) => s + FCHIP + drawerBodyH(dw), 0);
    // With ports on one side only, the label may use the block's full width
    bb.lw = (bb.in.length && bb.out.length) ? colw/2 - 18 : colw - 34;
    (cols[bb.col] || (cols[bb.col]=[])).push(bb);
  });

  const blocks = [];
  const colKeys = Object.keys(cols).map(Number).sort((a,b)=>a-b);
  colKeys.forEach(c => {
    const arr = cols[c].sort((a,b)=>a.row-b.row);
    const total = arr.reduce((s,b)=>s+b.h,0) + GY*(arr.length-1);
    let y = -total/2;
    arr.forEach(b => { b.x = c*(colw+GX); b.y = y; y += b.h + GY; blocks.push(b); });
  });

  // normalize the grid to (0,0)
  let minX=1e9,minY=1e9;
  blocks.forEach(b=>{ minX=Math.min(minX,b.x); minY=Math.min(minY,b.y); });
  blocks.forEach(b=>{ b.x-=minX; b.y-=minY; });

  /* Edit mode: a rectangle moved with Ctrl+drag overrides its grid slot. The override is stored in this
     normalized space, so it stays put when an unrelated drawer opens and reflows the rest of the grid. */
  blocks.forEach(b => { const o = POS[d.id + '/' + b.id]; if (o){ b.x = o.x; b.y = o.y; } });

  // The bbox carries an origin, because a dragged rectangle may end up left of / above the grid
  let x0=1e9,y0=1e9,x1=-1e9,y1=-1e9;
  blocks.forEach(b=>{ x0=Math.min(x0,b.x); y0=Math.min(y0,b.y);
                      x1=Math.max(x1,b.x+b.w); y1=Math.max(y1,b.y+b.h); });
  const bbox = { x:x0, y:y0, w:x1-x0, h:y1-y0 };

  // port coordinates
  const byId = {};
  blocks.forEach(b => {
    byId[b.id] = b;
    b.in.forEach((pt,i)=>{ pt.x=b.x; pt.y=b.y+HEAD+PITCH*i+PITCH/2; pt.dir='in'; pt.owner=b;
                           pt.pkey = pt.pkey || d.id + '/' + b.id + '/in:' + i;
                           pt.ret = pt.ret || RET[d.id + '/' + b.id + '/in:' + i] || null; });
    b.out.forEach((pt,i)=>{ pt.x=b.x+b.w; pt.y=b.y+HEAD+PITCH*i+PITCH/2; pt.dir='out'; pt.owner=b;
                            pt.pkey = pt.pkey || d.id + '/' + b.id + '/out:' + i;
                            pt.ret = RET[d.id + '/' + b.id + '/out:' + i] || null; });
  });

  // link routing
  const links = [];
  let lane = 0;
  edges.forEach(E => {
    const sb = E.sb, tb = E.tb, sp = E.sp, tp = tb.in[E.ti];
    if (!tp) return;
    const x1 = sp.x, y1 = sp.y, x2 = tp.x, y2 = tp.y;
    let pts;
    if (x2 - x1 > 46) {
      const mx = x1 + (x2-x1)/2;
      pts = [[x1,y1],[mx,y1],[mx,y2],[x2,y2]];
    } else {
      lane++;
      const off = 26 + (lane%5)*13;
      const yb = Math.max(sb.y+sb.h, tb.y+tb.h) + off;
      pts = [[x1,y1],[x1+22,y1],[x1+22,yb],[x2-22,yb],[x2-22,y2],[x2,y2]];
    }
    links.push({ pts, l:E.l, ref:E.ref, li:E.li, s:sb, t:tb, sp, tp });
  });

  return (LAY[id] = { blocks, links, bbox, byId });
}

/* ------------------------------------------------------------------ utilities */
function rr(x,y,w,h,r){
  g.beginPath();
  g.moveTo(x+r,y); g.lineTo(x+w-r,y); g.quadraticCurveTo(x+w,y,x+w,y+r);
  g.lineTo(x+w,y+h-r); g.quadraticCurveTo(x+w,y+h,x+w-r,y+h);
  g.lineTo(x+r,y+h); g.quadraticCurveTo(x,y+h,x,y+h-r);
  g.lineTo(x,y+r); g.quadraticCurveTo(x,y,x+r,y); g.closePath();
}
function fit(txt, max){
  if (g.measureText(txt).width <= max) return txt;
  let s = txt;
  while (s.length > 1 && g.measureText(s + '…').width > max) s = s.slice(0, -1);
  return s + '…';
}
function wrap(txt, max){
  const out = []; let line = '';
  for (const ch of String(txt)){
    if (ch === '\n'){ out.push(line); line=''; continue; }
    if (g.measureText(line+ch).width > max){ out.push(line); line = ch; }
    else line += ch;
  }
  if (line) out.push(line);
  return out;
}
function s2w(x,y){ const v = views[cur()]; return { x:(x-v.tx)/v.s, y:(y-v.ty)/v.s }; }

function fitView(id){
  const L = layout(id);
  const padT = 118, padB = 74, padR = 44;
  const padL = (play || id === 'L1') ? panelW() + 44 : 44;   // leave room for the flow panel
  const s = Math.min((VW-padL-padR)/Math.max(1,L.bbox.w), (VH-padT-padB)/Math.max(1,L.bbox.h), 1.25);
  const sc = Math.max(0.22, s);
  views[id] = { s:sc,
                tx: padL + (VW-padL-padR - L.bbox.w*sc)/2 - L.bbox.x*sc,
                ty: padT + (VH-padT-padB - L.bbox.h*sc)/2 - L.bbox.y*sc };
}

/* ------------------------------------------------------------------ drawing */
function draw(){
  if (play) updatePlay();
  setCaption();
  ETEXT.length = 0;                              // editable label boxes are rebuilt every frame
  const id = cur(), d = D[id], L = layout(id);
  if (!views[id]) fitView(id);
  const v = views[id];

  g.setTransform(DPR,0,0,DPR,0,0);
  g.fillStyle = '#0e1116'; g.fillRect(0,0,VW,VH);
  drawGrid(v);

  g.save(); g.translate(v.tx, v.ty); g.scale(v.s, v.s);
  L.links.forEach(k => drawLink(k, v));
  L.blocks.forEach(b => drawBlock(b, v));
  if (play && play.dia === id) drawFlow(L, v);
  g.restore();

  drawHeader(d);
  drawFlowPanel();
  drawPlayControls();
  drawLegend(d, L);
  if (hover && TIP_KINDS.has(hover.kind)) drawTip();
  if (trans) drawTransition();                   // the transition snapshot goes on top
  if ((play && !play.paused) || trans) requestDraw();   // do not spin rAF while paused
}

/* Glowing dot + trail + active-module highlight (world coordinates) */
function drawFlow(L, v){
  const to = L.byId[play.toId], from = play.fromId ? L.byId[play.fromId] : null;

  // This step's route: lay a dim base first, then overlay the segments already travelled
  if (play.phase === 'move' && play.pts){
    g.lineWidth = 2.2; g.lineJoin = 'round'; g.lineCap = 'round';
    g.strokeStyle = 'rgba(125,211,252,.16)';
    g.beginPath(); g.moveTo(play.pts[0].x, play.pts[0].y);
    for (let i=1;i<play.pts.length;i++) g.lineTo(play.pts[i].x, play.pts[i].y);
    g.stroke();
  }

  // Active module: breathing halo
  [ [from, .35], [to, 1] ].forEach(([b, a]) => {
    if (!b) return;
    const pulse = b === to && play.phase === 'hold'
      ? .55 + .45*Math.sin(Math.min(1, playT()/HOLD) * Math.PI) : .55;
    g.save();
    g.shadowColor = '#7dd3fc'; g.shadowBlur = 26*pulse;
    g.strokeStyle = 'rgba(125,211,252,' + (a*pulse).toFixed(3) + ')';
    g.lineWidth = 2.6;
    rr(b.x-2, b.y-2, b.w+4, b.h+4, 10); g.stroke();
    g.restore();
  });

  const p = dotPos();
  if (!p) return;

  // Trail
  play.trail.push({ x:p.x, y:p.y });
  if (play.trail.length > 16) play.trail.shift();
  for (let i = 0; i < play.trail.length-1; i++){
    const t = play.trail[i], a = (i+1)/play.trail.length;
    g.fillStyle = 'rgba(125,211,252,' + (a*0.30).toFixed(3) + ')';
    g.beginPath(); g.arc(t.x, t.y, 2 + 4*a, 0, Math.PI*2); g.fill();
  }

  // The dot itself: outer glow + solid core + specular
  const rad = 7.5;
  const grd = g.createRadialGradient(p.x, p.y, 0, p.x, p.y, rad*3.4);
  grd.addColorStop(0,   'rgba(186,236,255,.95)');
  grd.addColorStop(0.28,'rgba(125,211,252,.55)');
  grd.addColorStop(1,   'rgba(125,211,252,0)');
  g.fillStyle = grd;
  g.beginPath(); g.arc(p.x, p.y, rad*3.4, 0, Math.PI*2); g.fill();

  g.save();
  g.shadowColor = '#7dd3fc'; g.shadowBlur = 18;
  g.fillStyle = '#eaf8ff';
  g.beginPath(); g.arc(p.x, p.y, rad, 0, Math.PI*2); g.fill();
  g.restore();
  g.fillStyle = '#ffffff';
  g.beginPath(); g.arc(p.x-rad*0.28, p.y-rad*0.3, rad*0.36, 0, Math.PI*2); g.fill();
}

function drawGrid(v){
  const step = 26*v.s;
  if (step < 9) return;
  g.fillStyle = '#161a21';
  const ox = ((v.tx % step) + step) % step, oy = ((v.ty % step) + step) % step;
  for (let x = ox; x < VW; x += step)
    for (let y = oy; y < VH; y += step) g.fillRect(x, y, 1.2, 1.2);
}

function drawLink(k, v){
  const hot = hover && ((hover.kind==='block' && (hover.b===k.s || hover.b===k.t)) ||
                        (hover.kind==='port'  && (hover.p===k.sp || hover.p===k.tp)));
  g.lineWidth = hot ? 2.4 : 1.4;
  g.strokeStyle = hot ? '#7dd3fc' : '#39424f';
  g.lineJoin = 'round';
  g.beginPath();
  g.moveTo(k.pts[0][0], k.pts[0][1]);
  for (let i=1;i<k.pts.length;i++) g.lineTo(k.pts[i][0], k.pts[i][1]);
  g.stroke();

  // Arrow
  const a = k.pts[k.pts.length-2], b = k.pts[k.pts.length-1];
  const ang = Math.atan2(b[1]-a[1], b[0]-a[0]);
  g.fillStyle = hot ? '#7dd3fc' : '#4b5666';
  g.beginPath();
  g.moveTo(b[0], b[1]);
  g.lineTo(b[0]-9*Math.cos(ang-0.38), b[1]-9*Math.sin(ang-0.38));
  g.lineTo(b[0]-9*Math.cos(ang+0.38), b[1]-9*Math.sin(ang+0.38));
  g.closePath(); g.fill();

  if (k.l && v.s > 0.5){
    const m = k.pts[Math.floor(k.pts.length/2)-1], m2 = k.pts[Math.floor(k.pts.length/2)];
    const cx = (m[0]+m2[0])/2, cy = (m[1]+m2[1])/2;
    g.font = '10.5px ' + FONT;
    const w = g.measureText(k.l).width + 10;
    g.fillStyle = '#0e1116'; rr(cx-w/2, cy-8, w, 16, 4); g.fill();
    g.fillStyle = hot ? '#a5e4ff' : '#67748a';
    g.textAlign='center'; g.textBaseline='middle';
    g.fillText(k.l, cx, cy);
    eregW(v, cx-w/2, cy-8, w, 16, k.ref, F_LINK, 'l',
          'Link label', k.s.id + ' → ' + k.t.id, 'K:' + cur() + '/' + k.li);
  }
}

function drawBlock(b, v){
  const K = KIND[b.k] || KIND.comp;
  const isHover = hover && hover.b === b;

  // Block jumped to from the L1 capability list: breathe a cyan ring, fading out after 6 seconds
  if (focus && focus.dia === cur() && focus.block === b.id){
    const age = now() - focus.t0;
    if (age > 6000) focus = null;
    else {
      const pulse = 0.35 + 0.35*Math.abs(Math.sin(age/380));
      g.save();
      g.strokeStyle = 'rgba(125,211,252,' + pulse.toFixed(3) + ')';
      g.lineWidth = 3;
      rr(b.x-6, b.y-6, b.w+12, b.h+12, 12); g.stroke();
      g.restore();
      requestDraw();
    }
  }

  g.save();
  if (isHover){ g.shadowColor = K.s; g.shadowBlur = 18; }
  g.fillStyle = K.f; rr(b.x, b.y, b.w, b.h, 8); g.fill();
  g.shadowBlur = 0;
  g.lineWidth = isHover ? 2.2 : 1.4;
  g.strokeStyle = K.s;
  if (K.dash) g.setLineDash(K.dash);
  rr(b.x, b.y, b.w, b.h, 8); g.stroke();
  g.setLineDash([]);
  g.restore();

  // Top label bar: kind glyph, then the kind tag
  const ICO = 11;
  const hasIcon = drawIcon(b.k in ICON_D ? b.k : 'comp', b.x+11, b.y+13-ICO/2, ICO, K.s, .85);
  g.font = '9.5px ' + FONT; g.textBaseline = 'middle'; g.textAlign = 'left';
  g.fillStyle = K.s; g.globalAlpha = .85;
  g.fillText(K.tag, b.x + (hasIcon ? 11+ICO+4 : 12), b.y+13);
  g.globalAlpha = 1;
  if (b.child){
    g.textAlign = 'right'; g.fillStyle = '#8ea0b8';
    g.fillText('open ▸', b.x+b.w-12, b.y+13);
  }

  // Name / technology
  g.textAlign = 'left';
  g.font = 'bold 14px ' + FONT; g.fillStyle = K.t;
  const nTxt = fit(b.n, b.w-24);
  g.fillText(nTxt, b.x+12, b.y+31);
  eregW(v, b.x+12, b.y+31-9, Math.max(40, g.measureText(nTxt).width), 18,
        b.ref, F_BLOCK, 'n', 'Rectangle', cur() + ' / ' + b.id, 'B:' + cur() + '/' + b.id);
  g.font = '10.5px ' + FONT; g.fillStyle = '#8b95a5';
  const tTxt = fit(b.t||'', b.w-24);
  g.fillText(tTxt, b.x+12, b.y+46);
  eregW(v, b.x+12, b.y+46-7, Math.max(40, g.measureText(tTxt).width), 14,
        b.ref, F_BLOCK, 't', 'Rectangle', cur() + ' / ' + b.id, 'B:' + cur() + '/' + b.id);

  // Divider
  g.strokeStyle = 'rgba(255,255,255,.08)'; g.lineWidth = 1;
  g.beginPath(); g.moveTo(b.x+8, b.y+HEAD-6); g.lineTo(b.x+b.w-8, b.y+HEAD-6); g.stroke();

  // Ports
  b.in.forEach(pt => drawPort(pt, b, b.lw, true, v));
  b.out.forEach(pt => drawPort(pt, b, b.lw, false, v));

  drawDrawers(b, K);

  // Edit mode: a dashed ring makes it obvious the rectangle can be picked up with Ctrl
  if (editMode){
    const grabbing = blockDrag && blockDrag.b === b;
    g.save();
    g.setLineDash([5, 4]);
    g.lineWidth = grabbing ? 2 : 1.1;
    g.strokeStyle = grabbing ? 'rgba(125,211,252,.95)' : 'rgba(125,211,252,.42)';
    rr(b.x-4, b.y-4, b.w+8, b.h+8, 11); g.stroke();
    g.restore();
  }
}

/* Drawer handle y coordinate: below portsH, shifted down by the real height of each preceding drawer */
function drawerTop(b, di){
  let y = b.y + b.portsH;
  for (let i = 0; i < di; i++){
    y += FCHIP + drawerBodyH(b.drawers[i]);
  }
  return y;
}

/* Drop-down drawer: handle plus rows once expanded. Files and classes/objects share this renderer. */
function drawDrawers(b, K){
  b.drawers.forEach((dw, di) => {
    const y = drawerTop(b, di);
    const onChip = hover && hover.kind === 'drawer' && hover.b === b && hover.di === di;

    g.strokeStyle = 'rgba(255,255,255,.07)'; g.lineWidth = 1;
    g.beginPath(); g.moveTo(b.x+8, y+0.5); g.lineTo(b.x+b.w-8, y+0.5); g.stroke();

    g.fillStyle = onChip ? 'rgba(255,255,255,.10)' : 'rgba(255,255,255,.035)';
    rr(b.x+8, y+3, b.w-16, FCHIP-6, 4); g.fill();

    g.font = '10.5px ' + FONT; g.textBaseline = 'middle';
    g.fillStyle = onChip ? '#dbe6f5' : (dw.kind === 'cls' ? '#9c92c4' : '#8d99ab');
    g.textAlign = 'left';
    const vis = drawerView(dw), off = drawerOff(dw), scrollable = dw.rows.length > vis;
    const counter = dw.open && scrollable
      ? dw.label + ' ' + (off+1) + '–' + (off+vis) + ' / ' + dw.rows.length
      : dw.label + ' ' + dw.rows.length;
    g.fillText((dw.open ? '▴ ' : '▾ ') + counter, b.x+16, y+FCHIP/2+1);
    g.textAlign = 'right';
    g.fillStyle = onChip ? '#9fb2c9' : '#5f6b7c';
    g.fillText(dw.open ? 'hide' : 'show', b.x+b.w-16, y+FCHIP/2+1);

    if (!dw.open) return;

    const sbw = scrollable ? 5 : 0;            // width taken by the scrollbar on the right
    let fy = y + FCHIP + 4;
    for (let i = off; i < off + vis; i++){
      const f = dw.rows[i];
      if (!f) break;

      // Group header: a filename in dim small type plus a hairline rule; not hoverable
      if (isGroupRow(f)){
        g.strokeStyle = 'rgba(255,255,255,.05)'; g.lineWidth = 1;
        g.beginPath(); g.moveTo(b.x+14, fy+FROW-1.5); g.lineTo(b.x+b.w-14-sbw, fy+FROW-1.5); g.stroke();
        g.font = '9.5px ' + FONT; g.textAlign = 'left'; g.textBaseline = 'middle';
        g.fillStyle = '#55606f';
        g.fillText(fit(f[0], b.w - 30 - sbw), b.x+14, fy+FROW/2-1);
        if (f[1]){
          g.textAlign = 'right'; g.fillStyle = '#454e5c';
          g.fillText(String(f[1]), b.x+b.w-14-sbw, fy+FROW/2-1);
        }
        fy += FROW;
        continue;
      }

      const on = hover && hover.kind === 'drawerRow' && hover.b === b && hover.di === di && hover.i === i;
      if (on){ g.fillStyle = 'rgba(255,255,255,.09)'; rr(b.x+8, fy, b.w-16-sbw, FROW, 3); g.fill(); }

      const meta = f[1] === '' || f[1] === undefined ? ''
                 : (typeof f[1] === 'number' ? f[1] + ' lines' : String(f[1]));
      g.font = '10px ' + FONT;
      const mw = meta ? g.measureText(meta).width + 10 : 0;
      const maxw = b.w - 32 - mw - sbw;

      // File rows: dim directory, bright filename. Class rows: one run, with a ‹› mark when a snippet exists
      const txt = (dw.kind === 'cls' && codeOf(f)) ? '‹› ' + f[0] : f[0];
      const cut = dw.kind === 'file' ? txt.lastIndexOf('/') + 1 : 0;
      const dir = txt.slice(0, cut), base = txt.slice(cut);
      g.textAlign = 'left'; g.textBaseline = 'middle';
      const bw = g.measureText(base).width;
      g.fillStyle = on ? '#cfd9e6' : '#697585';
      const dirTxt = fit(dir, Math.max(0, maxw - bw));
      if (dirTxt) g.fillText(dirTxt, b.x+14, fy+FROW/2);
      const dx = b.x + 14 + (dirTxt ? g.measureText(dirTxt).width : 0);
      g.fillStyle = on ? '#ffffff' : (dw.kind === 'cls' ? '#c6bce8' : '#b9c5d4');
      g.fillText(fit(base, b.x + 14 + maxw - dx), dx, fy+FROW/2);

      if (meta){
        g.textAlign = 'right';
        g.fillStyle = on ? '#8fd0ff' : (dw.kind === 'cls' ? '#6d6392' : '#566275');
        g.fillText(meta, b.x+b.w-14-sbw, fy+FROW/2);
      }
      fy += FROW;
    }

    if (scrollable){
      const trackY = y + FCHIP + 4, trackH = vis*FROW, tx = b.x + b.w - 11;
      g.fillStyle = 'rgba(255,255,255,.05)'; rr(tx, trackY, 3, trackH, 1.5); g.fill();
      const thumbH = Math.max(14, trackH * vis / dw.rows.length);
      const thumbY = trackY + (trackH - thumbH) * (off / (dw.rows.length - vis));
      g.fillStyle = dw.kind === 'cls' ? 'rgba(167,139,250,.55)' : 'rgba(120,140,165,.55)';
      rr(tx, thumbY, 3, thumbH, 1.5); g.fill();
    }
  });
}

function drawPort(pt, b, half, isIn, v){
  const on = hover && hover.p === pt;
  const col = isIn ? '#5eead4' : '#fbbf24';
  g.fillStyle = on ? '#ffffff' : col;
  g.beginPath();
  if (isIn){ g.moveTo(pt.x-7, pt.y-5); g.lineTo(pt.x+1, pt.y); g.lineTo(pt.x-7, pt.y+5); }
  else     { g.moveTo(pt.x-1, pt.y-5); g.lineTo(pt.x+7, pt.y); g.lineTo(pt.x-1, pt.y+5); }
  g.closePath(); g.fill();

  if (on){
    g.fillStyle = 'rgba(255,255,255,.09)';
    if (isIn) rr(pt.x+3, pt.y-10, half+8, 20, 4); else rr(pt.x-half-11, pt.y-10, half+8, 20, 4);
    g.fill();
  }
  g.font = (on?'bold ':'') + '11px ' + FONT;
  g.fillStyle = on ? '#ffffff' : '#a9b4c4';
  g.textBaseline = 'middle';
  const label = fit(pt.n, pt.ret ? half - 11 : half);
  const lw = g.measureText(label).width;
  if (isIn){ g.textAlign='left';  g.fillText(label, pt.x+8, pt.y); }
  else     { g.textAlign='right'; g.fillText(label, pt.x-8, pt.y); }
  // A derived input port is rebuilt by layout() every frame — edit the port it was derived from
  const ept = pt.src || pt;
  eregW(v, isIn ? pt.x+8 : pt.x-8-lw, pt.y-9, Math.max(36, lw), 18,
        ept, F_PORT, 'n',
        (isIn ? 'Input port' : 'Output port') + (pt.src ? ' (derived — edits the source port)' : ''),
        cur() + ' / ' + b.id, 'P:' + ept.pkey);

  // ƒ: this port has a structured field table (the interface object's field names/types/meaning); hover expands it
  if (pt.ret){
    g.font = 'italic bold 10px ' + FONT;
    g.fillStyle = on ? '#ffd479' : '#b8862f';
    if (isIn){ g.textAlign='left';  g.fillText('ƒ', pt.x+8+lw+4, pt.y); }
    else     { g.textAlign='right'; g.fillText('ƒ', pt.x-8-lw-4, pt.y); }
  }
}

/* ---------------------------------------------------------------- top bar */
function drawHeader(d){
  HIT.btns = []; HIT.crumbs = [];
  const grd = g.createLinearGradient(0,0,0,104);
  grd.addColorStop(0,'rgba(14,17,22,.98)'); grd.addColorStop(1,'rgba(14,17,22,.72)');
  g.fillStyle = grd; g.fillRect(0,0,VW,104);
  g.strokeStyle = 'rgba(255,255,255,.07)'; g.lineWidth = 1;
  g.beginPath(); g.moveTo(0,104.5); g.lineTo(VW,104.5); g.stroke();

  g.textBaseline = 'middle'; g.textAlign = 'left';
  g.font = 'bold 17px ' + FONT; g.fillStyle = '#e8eef7';
  const hTitle = 'archpresent · ' + d.title;
  g.fillText(hTitle, 24, 26);
  // The prefix is fixed chrome; only the diagram's own title is editable, so skip past it
  const pfxW = g.measureText('archpresent · ').width;
  ereg(24 + pfxW, 26-10, g.measureText(hTitle).width - pfxW, 20, d, F_DIA, 'title', 'Diagram', d.id, 'D:' + d.id);
  g.font = '11.5px ' + FONT; g.fillStyle = '#7f8b9c';
  const hSub = fit(d.sub || '', VW-560);
  g.fillText(hSub, 24, 47);
  ereg(24, 47-8, Math.max(60, g.measureText(hSub).width), 16, d, F_DIA, 'sub', 'Diagram', d.id, 'D:' + d.id);

  // Breadcrumb
  let x = 24;
  stack.forEach((sid, i) => {
    const dd = D[sid], label = 'L'+dd.lv+' ' + dd.title;
    g.font = (i===stack.length-1 ? 'bold ' : '') + '11.5px ' + FONT;
    const w = g.measureText(label).width + 20;
    const on = hover && hover.kind==='crumb' && hover.i===i;
    g.fillStyle = i===stack.length-1 ? '#1d3a5c' : (on ? '#252c37' : '#191d25');
    rr(x, 68, w, 24, 6); g.fill();
    g.strokeStyle = i===stack.length-1 ? '#4b8bf5' : '#2b323d';
    rr(x, 68, w, 24, 6); g.stroke();
    g.fillStyle = i===stack.length-1 ? '#cfe3ff' : (on ? '#c8d2e0' : '#8590a1');
    g.textAlign='left'; g.fillText(label, x+10, 80);
    HIT.crumbs.push({ x, y:68, w, h:24, i });
    x += w + 6;
    if (i < stack.length-1){ g.fillStyle='#4a5464'; g.fillText('›', x, 80); x += 12; }
  });

  // Buttons — the last entry is the right-most, so Edit sits in the top-right corner
  const btns = [
    { id:'back', label:'◀ Back', on: stack.length>1 },
    { id:'fit',  label:'⤢ Fit', on:true },
    { id:'top',  label:'⌂ Top (L1)',  on: stack.length>1 },
    { id:'reset',label:'↺ Reset layout', on: editMode && Object.keys(POS).length>0 },
    { id:'edit', label: editMode ? '✓ Done' : '✎ Edit', on:true, active: editMode }
  ];
  let bx = VW - 24;
  for (let i = btns.length-1; i >= 0; i--){
    const b = btns[i];
    if (b.id === 'reset' && !b.on) continue;          // only offered once something has been moved
    g.font = '11.5px ' + FONT;
    const w = g.measureText(b.label).width + 22;
    bx -= w;
    const on = hover && hover.kind==='btn' && hover.id===b.id;
    g.fillStyle = !b.on ? '#161a21' : b.active ? '#1d3a5c' : (on ? '#2a3446' : '#1d232c');
    rr(bx, 16, w, 26, 6); g.fill();
    g.strokeStyle = !b.on ? '#242a33' : b.active ? '#4b8bf5' : (on ? '#5b8ff9' : '#333c48');
    rr(bx, 16, w, 26, 6); g.stroke();
    g.fillStyle = !b.on ? '#454e5b' : b.active ? '#cfe3ff' : (on ? '#dce9ff' : '#a7b3c4');
    g.textAlign='center'; g.fillText(b.label, bx+w/2, 29);
    if (b.on) HIT.btns.push({ x:bx, y:16, w, h:26, id:b.id });
    bx -= 8;
  }

  if (editMode){
    const msg = 'EDIT MODE · click any label to rewrite it · Ctrl+drag a rectangle to move it (links re-route)';
    g.font = '11px ' + FONT; g.textAlign = 'right'; g.textBaseline = 'middle';
    g.fillStyle = '#7dd3fc';
    g.fillText(msg, VW-24, 55);
  }
}

/* ------------------------------------------------------------ flow panel */
function drawFlowPanel(){
  HIT.flows = []; HIT.chk = null; HIT.stop = null; HIT.panel = null;
  HIT.feats = []; HIT.tabs = []; HIT.featBox = null; HIT.panelToggle = null;
  if (!play && cur() !== 'L1') return;            // always present at L1; follows along during playback

  const x = 20, y = 116;

  /* ---- collapsed: only a vertical handle remains ---- */
  if (!panelOpen){
    const th = 132, hot = hover && hover.kind === 'panelToggle';
    frostedPanel(x, y, PANEL_TAB_W, th, 10);
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = '12px ' + FONT; g.fillStyle = hot ? '#eaf4ff' : '#9fb0c4';
    g.fillText('▸', x + PANEL_TAB_W/2, y + 16);
    g.save();
    g.translate(x + PANEL_TAB_W/2, y + th/2 + 12);
    g.rotate(Math.PI/2);
    g.font = '11px ' + FONT; g.fillStyle = hot ? '#cfe0f5' : '#7f8d9f';
    g.fillText(play ? 'playing · expand' : 'Flows / Features', 0, 0);
    g.restore();
    g.textAlign = 'left';
    HIT.panelToggle = { x, y, w:PANEL_TAB_W, h:th };
    return;
  }

  const w = PANEL_W;
  const tab = play ? 'flow' : panelTab;           // force the flow tab during playback

  // Panel height: the two tabs have different content heights
  const ROW = 38;
  const stepBox = play ? 62 : 0;
  // The capability list outgrows the viewport, so cap the panel height and scroll inside it
  const featAvail = Math.max(160, VH - 116 - 86);
  const h = tab === 'flow'
    ? 34 + 28 + FLOWS.length*ROW + stepBox + 12
    : 34 + 10 + Math.min(featPanelH(), featAvail) + 12;

  g.fillStyle = 'rgba(14,18,24,.95)'; rr(x, y, w, h, 10); g.fill();
  g.strokeStyle = '#252c37'; g.lineWidth = 1; rr(x, y, w, h, 10); g.stroke();
  HIT.panel = { x, y, w, h };

  // ---- two tabs at the top + a collapse button ----
  g.textBaseline = 'middle'; g.textAlign = 'center';
  const CBW = 26;                                          // collapse button
  const TABS = [['flow', 'User Story'], ['feat', 'L1 Features ' + FEATURES.length]];
  const tw = (w - 28 - CBW - 6) / 2;
  TABS.forEach(([id, label], i) => {
    const tx = x + 14 + i*tw, ty = y + 8, on = tab === id;
    const hot = hover && hover.kind === 'tab' && hover.t === id;
    g.fillStyle = on ? 'rgba(75,139,245,.18)' : (hot ? 'rgba(255,255,255,.06)' : 'transparent');
    rr(tx+1, ty, tw-2, 24, 6); g.fill();
    if (on){ g.strokeStyle = 'rgba(125,211,252,.5)'; g.lineWidth = 1; rr(tx+1, ty, tw-2, 24, 6); g.stroke(); }
    g.font = (on ? 'bold ' : '') + '11.5px ' + FONT;
    g.fillStyle = on ? '#eaf4ff' : (hot ? '#cdd8e6' : '#7d8899');
    g.fillText(fit(label, tw-10), tx + tw/2, ty+12);
    if (!play) HIT.tabs.push({ x:tx, y:ty, w:tw, h:24, t:id });
  });
  {
    const cbx = x + w - 14 - CBW, cby = y + 8;
    const hot = hover && hover.kind === 'panelToggle';
    g.fillStyle = hot ? 'rgba(255,255,255,.10)' : 'transparent';
    rr(cbx, cby, CBW, 24, 6); g.fill();
    g.strokeStyle = hot ? 'rgba(255,255,255,.22)' : 'rgba(255,255,255,.09)';
    g.lineWidth = 1; rr(cbx+.5, cby+.5, CBW-1, 23, 6); g.stroke();
    g.font = '12px ' + FONT; g.fillStyle = hot ? '#eaf4ff' : '#8b97a8';
    g.fillText('◂', cbx + CBW/2, cby + 12);
    HIT.panelToggle = { x:cbx, y:cby, w:CBW, h:24 };
  }
  g.textAlign = 'left';

  if (tab === 'feat'){ drawFeatureList(x, y + 42, w, Math.min(featPanelH(), featAvail)); return; }

  // Checkbox
  const cy = y + 52;
  const onChk = hover && hover.kind === 'chk';
  g.fillStyle = onChk ? 'rgba(255,255,255,.07)' : 'transparent';
  rr(x+10, cy-11, w-20, 22, 5); g.fill();
  g.strokeStyle = autoDive ? '#4b8bf5' : '#48505d'; g.lineWidth = 1.4;
  rr(x+15, cy-6.5, 13, 13, 3); g.stroke();
  if (autoDive){
    g.strokeStyle = '#7dd3fc'; g.lineWidth = 2; g.lineCap = 'round';
    g.beginPath(); g.moveTo(x+18, cy); g.lineTo(x+21, cy+3.5); g.lineTo(x+25.5, cy-4); g.stroke();
    g.lineCap = 'butt';
  }
  g.font = '11px ' + FONT; g.fillStyle = autoDive ? '#cfe0f5' : '#8b96a6';
  g.fillText('Follow the flow across levels (deep dive mode)', x+35, cy);
  HIT.chk = { x:x+10, y:cy-11, w:w-20, h:22 };

  // Flow list
  let ry = y + 70;
  FLOWS.forEach((f, i) => {
    const active = play && play.fi === i;
    const on = hover && hover.kind === 'flow' && hover.i === i;
    if (active || on){
      g.fillStyle = active ? 'rgba(75,139,245,.16)' : 'rgba(255,255,255,.055)';
      rr(x+8, ry, w-16, ROW-4, 6); g.fill();
    }
    if (active){
      g.strokeStyle = 'rgba(125,211,252,.55)'; g.lineWidth = 1;
      rr(x+8, ry, w-16, ROW-4, 6); g.stroke();
    }
    g.font = '10px ' + FONT;
    g.fillStyle = active ? '#7dd3fc' : '#5a6472';
    g.fillText(active ? '▶' : String(i+1).padStart(2,'0'), x+16, ry+13);
    g.font = (active ? 'bold ' : '') + '11.5px ' + FONT;
    g.fillStyle = active ? '#eaf4ff' : (on ? '#d3dded' : '#a7b3c3');
    g.fillText(fit(f.name, w-64), x+34, ry+13);
    g.font = '9.5px ' + FONT; g.fillStyle = active ? '#7f93ad' : '#5c6674';
    g.fillText(fit(f.from + ' · ' + f.role, w-52), x+34, ry+26);
    g.font = '10px ' + FONT; g.fillStyle = '#ffeec0'; g.textAlign = 'right';
    g.fillText(f.steps.length + ' steps', x+w-16, ry+13);
    g.textAlign = 'left';
    HIT.flows.push({ x:x+8, y:ry, w:w-16, h:ROW-4, i });
    ry += ROW;
  });

  if (!play) return;

  // Current step + progress
  const fl = FLOWS[play.fi], st = play.si >= 0 ? fl.steps[play.si] : null;
  const by = ry + 4;
  g.fillStyle = 'rgba(125,211,252,.07)'; rr(x+8, by, w-16, 54, 6); g.fill();

  const prog = play.si >= 0 ? (play.si+1) / fl.steps.length : 0;
  g.fillStyle = 'rgba(255,255,255,.09)'; rr(x+14, by+8, w-28, 3, 1.5); g.fill();
  g.fillStyle = '#7dd3fc'; rr(x+14, by+8, (w-28)*prog, 3, 1.5); g.fill();

  g.font = '10px ' + FONT; g.fillStyle = '#7dd3fc';
  g.fillText(play.si >= 0 ? ('step ' + (play.si+1) + ' / ' + fl.steps.length) : 'looping…', x+14, by+24);
  g.textAlign = 'right';
  const onStop = hover && hover.kind === 'stop';
  g.fillStyle = onStop ? '#ffd0d0' : '#8b96a6';
  g.fillText('■ Stop', x+w-14, by+24);
  HIT.stop = { x:x+w-60, y:by+14, w:50, h:20 };
  g.textAlign = 'left';

  if (st){
    g.font = '10.5px ' + FONT; g.fillStyle = '#c2cddb';
    const ls = wrap(st.t, w-30).slice(0, 2);
    ls.forEach((l, i) => g.fillText(l, x+14, by+40 + i*13));
    g.font = '9px ' + FONT; g.fillStyle = '#5c6674';
    const sd = st.key.split('/')[0];
    g.textAlign = 'right';
    g.fillText('L' + D[sd].lv + ' · ' + st.key, x+w-14, by+40);
    g.textAlign = 'left';
  }
}

/* ------------------------------------------------- L1 capability list (left panel, tab 2) */
const FEAT_ROW = 27, FEAT_CAT = 22;

/* Features folded by category into an ordered array of [category, [feature indices…]] */
function featGroups(){
  const order = [], byCat = {};
  FEATURES.forEach((f, i) => {
    if (!byCat[f.cat]){ byCat[f.cat] = []; order.push(f.cat); }
    byCat[f.cat].push(i);
  });
  return order.map(c => [c, byCat[c]]);
}

function featPanelH(){
  const gs = featGroups();
  return gs.reduce((s, [, ids]) => s + FEAT_CAT + ids.length*FEAT_ROW, 0) + 8;
}

function drawFeatureList(x, y, w, viewH){
  const total = featPanelH();
  const maxScroll = Math.max(0, total - viewH);
  featScroll = Math.max(0, Math.min(featScroll, maxScroll));
  HIT.featBox = { x, y, w, h:viewH, maxScroll };

  g.save();
  g.beginPath(); g.rect(x, y, w, viewH); g.clip();

  let ry = y - featScroll;
  featGroups().forEach(([cat, ids]) => {
    g.font = 'bold 10px ' + FONT; g.fillStyle = '#5d6a7d'; g.textAlign = 'left';
    g.fillText(cat, x+14, ry + FEAT_CAT/2 + 2);
    g.strokeStyle = 'rgba(255,255,255,.06)'; g.lineWidth = 1;
    const lx = x + 22 + g.measureText(cat).width;
    g.beginPath(); g.moveTo(lx, ry+FEAT_CAT/2+2.5); g.lineTo(x+w-14, ry+FEAT_CAT/2+2.5); g.stroke();
    ry += FEAT_CAT;

    ids.forEach(i => {
      const f = FEATURES[i];
      const on  = hover && hover.kind === 'feat' && hover.i === i;
      const cd  = D[f.key.split('/')[0]];
      const hot = focus && focus.dia === cd?.id && focus.block === f.key.split('/')[1];
      if (on || hot){
        g.fillStyle = hot ? 'rgba(75,139,245,.16)' : 'rgba(255,255,255,.055)';
        rr(x+8, ry, w-16, FEAT_ROW-3, 5); g.fill();
      }
      g.font = '11px ' + FONT;
      g.fillStyle = on ? '#eaf4ff' : '#a9b5c4';
      g.fillText(fit(f.n, w-92), x+16, ry+9);
      g.font = '9px ' + FONT; g.fillStyle = on ? '#7f93ad' : '#586274';
      g.fillText(fit(f.d || '', w-92), x+16, ry+20);
      g.font = '9px ' + FONT; g.textAlign = 'right';
      g.fillStyle = on ? '#7dd3fc' : '#4d5765';
      g.fillText(cd ? 'L' + cd.lv : '—', x+w-16, ry+9);
      g.textAlign = 'left';
      // Only rows inside the visible band take hits; otherwise the clipped part stays clickable
      if (ry + FEAT_ROW > y && ry < y + viewH)
        HIT.feats.push({ x:x+8, y:ry, w:w-16, h:FEAT_ROW-3, i });
      ry += FEAT_ROW;
    });
  });

  g.restore();

  // Scrollbar: drawn only when the content really overflows
  if (maxScroll > 0){
    const trackH = viewH - 8;
    const thumbH = Math.max(28, trackH * viewH / total);
    const thumbY = y + 4 + (trackH - thumbH) * (featScroll / maxScroll);
    g.fillStyle = 'rgba(255,255,255,.06)'; rr(x+w-7, y+4, 3, trackH, 1.5); g.fill();
    g.fillStyle = 'rgba(125,211,252,.45)'; rr(x+w-7, thumbY, 3, thumbH, 1.5); g.fill();
  }
}

/* ------------------------------------------------- playback controller (bottom left, always on) */
const RATES = [0.5, 1, 1.5];

/* Frosted-glass plate: canvas has no backdrop-filter, so simulate it with translucent layers + a top highlight + soft edges */
function frostedPanel(x, y, w, h, r){
  g.save();
  g.shadowColor = 'rgba(0,0,0,.55)'; g.shadowBlur = 22; g.shadowOffsetY = 6;
  g.fillStyle = 'rgba(22,27,34,.72)';
  rr(x, y, w, h, r); g.fill();
  g.restore();

  g.fillStyle = 'rgba(255,255,255,.055)';          // the glass itself
  rr(x, y, w, h, r); g.fill();

  const grd = g.createLinearGradient(0, y, 0, y + h);   // bright top, dark bottom — it reads as thickness
  grd.addColorStop(0, 'rgba(255,255,255,.10)');
  grd.addColorStop(0.5, 'rgba(255,255,255,.02)');
  grd.addColorStop(1, 'rgba(255,255,255,.045)');
  g.fillStyle = grd; rr(x, y, w, h, r); g.fill();

  g.strokeStyle = 'rgba(255,255,255,.14)'; g.lineWidth = 1;
  rr(x + .5, y + .5, w - 1, h - 1, r); g.stroke();

  g.strokeStyle = 'rgba(255,255,255,.22)'; g.lineWidth = 1;   // inner highlight along the top
  g.beginPath(); g.moveTo(x + r, y + .5); g.lineTo(x + w - r, y + .5); g.stroke();
}

/* Glass button */
function glassButton(x, y, w, h, hot, active, enabled){
  g.fillStyle = !enabled ? 'rgba(255,255,255,.035)'
              : active   ? 'rgba(125,211,252,.22)'
              : hot      ? 'rgba(255,255,255,.16)' : 'rgba(255,255,255,.085)';
  rr(x, y, w, h, 8); g.fill();
  g.strokeStyle = !enabled ? 'rgba(255,255,255,.06)'
                : active   ? 'rgba(125,211,252,.55)'
                : hot      ? 'rgba(255,255,255,.30)' : 'rgba(255,255,255,.13)';
  g.lineWidth = 1; rr(x + .5, y + .5, w - 1, h - 1, 8); g.stroke();
}

/* The three transport icons are hand-drawn so nothing depends on ⏮⏯⏭ existing in the font */
function iconPrev(cx, cy, c){ g.fillStyle = c;
  g.beginPath(); g.moveTo(cx+5,cy-6); g.lineTo(cx+5,cy+6); g.lineTo(cx-3,cy); g.closePath(); g.fill();
  g.fillRect(cx-6, cy-6, 2.2, 12); }
function iconNext(cx, cy, c){ g.fillStyle = c;
  g.beginPath(); g.moveTo(cx-5,cy-6); g.lineTo(cx-5,cy+6); g.lineTo(cx+3,cy); g.closePath(); g.fill();
  g.fillRect(cx+3.8, cy-6, 2.2, 12); }
function iconPlay(cx, cy, c){ g.fillStyle = c;
  g.beginPath(); g.moveTo(cx-4.5,cy-7); g.lineTo(cx-4.5,cy+7); g.lineTo(cx+6.5,cy); g.closePath(); g.fill(); }
function iconPause(cx, cy, c){ g.fillStyle = c;
  g.fillRect(cx-5, cy-7, 3.4, 14); g.fillRect(cx+1.6, cy-7, 3.4, 14); }

function drawPlayControls(){
  HIT.ctrl = [];
  const BW = 34, BH = 30, GAP = 7, PAD = 12;
  const RW = 40, RH = 24;
  const w = PAD*2 + BW*3 + GAP*2 + 14 + RW*3 + GAP*2 + (play ? 56 : 0);
  const h = 30 + PAD*2;
  const x = 20, y = VH - 62 - 14 - h;              // stacked above the legend
  const on = play && !play.paused;

  frostedPanel(x, y, w, h, 14);

  const cy = y + h/2;
  let bx = x + PAD;
  const btn = (id, drawIcon, enabled, active) => {
    const hot = hover && hover.kind === 'ctrl' && hover.id === id;
    glassButton(bx, cy - BH/2, BW, BH, hot, active, enabled);
    drawIcon(bx + BW/2, cy, !enabled ? '#59636f' : hot ? '#ffffff' : '#d6e3f2');
    if (enabled) HIT.ctrl.push({ x:bx, y:cy - BH/2, w:BW, h:BH, id });
    bx += BW + GAP;
  };

  btn('prev', iconPrev, true, false);
  btn('play', on ? iconPause : iconPlay, true, false);
  btn('next', iconNext, true, false);

  bx += 7;                                          // divider
  g.strokeStyle = 'rgba(255,255,255,.12)'; g.lineWidth = 1;
  g.beginPath(); g.moveTo(bx + .5, cy - 11); g.lineTo(bx + .5, cy + 11); g.stroke();
  bx += 7;

  g.textAlign = 'center'; g.textBaseline = 'middle';
  for (const r of RATES){
    const hot = hover && hover.kind === 'ctrl' && hover.id === 'rate' + r;
    const act = playRate === r;
    glassButton(bx, cy - RH/2, RW, RH, hot, act, true);
    g.font = (act ? 'bold ' : '') + '11px ' + FONT;
    g.fillStyle = act ? '#bfe9ff' : hot ? '#e6eef8' : '#98a5b6';
    g.fillText(r.toFixed(1) + '×', bx + RW/2, cy + .5);
    HIT.ctrl.push({ x:bx, y:cy - RH/2, w:RW, h:RH, id:'rate' + r });
    bx += RW + GAP;
  }

  if (play){                                        // step readout
    const fl = FLOWS[play.fi];
    g.textAlign = 'left';
    g.font = '10.5px ' + FONT; g.fillStyle = '#7f8d9f';
    g.fillText((play.si >= 0 ? play.si + 1 : 0) + ' / ' + fl.steps.length, bx + 4, cy + .5);
  }
  g.textAlign = 'left';
}

/* ---------------------------------------------------------------- legend */
function drawLegend(d, L){
  const lines = [
    '▸ wheel zoom  ▸ F fit  ▸ E expand all  ▸ L switch tab  ▸ hover a port → its interface  ▸ ports marked ƒ carry a field table  ▸ two drawers per block: files / classes·objects  ▸ hover a class marked ‹› → its real definition from the repository',
    '▸ left panel: flows (click one to play) · features (click one to jump to the module)  ▸ player bottom left: ← → step · space play/pause · speed  ▸ B collapse/expand the sidebar  ▸ ✎ Edit (top right): rewrite any label · Ctrl+drag a rectangle'
  ];
  g.font = '11px ' + FONT; g.textAlign='left'; g.textBaseline='middle';
  const w = Math.max(g.measureText(lines[0]).width, g.measureText(lines[1]).width) + 24
  g.fillStyle = 'rgba(16,20,26,.92)'; rr(20, VH-62, w, 46, 8); g.fill();
  g.strokeStyle = '#252b35'; g.lineWidth = 1; rr(20, VH-62, w, 46, 8); g.stroke();
  g.fillStyle = '#798598';
  g.fillText(lines[0], 32, VH-48);
  g.fillText(lines[1], 32, VH-30);

  const info = d.blocks.length + ' modules · ' + L.links.length + ' signals · ' +
               d.blocks.filter(b=>b.child).length + ' drillable' +
               (D[cur()].lv===4 ? ' · deepest level' : '');
  g.textAlign = 'right'; g.fillStyle = '#5d6878';
  g.fillText(info, VW-24, VH-30);
}

/* ---------------------------------------------------------------- tooltip */
/* Hover kinds that pop a tooltip. Every new branch in drawTip must be added here — single source of truth. */
const TIP_KINDS = new Set(['port', 'block', 'drawerRow', 'feat']);

function drawTip(){
  let title, sub, rows = [], desc = '', color = '#7dd3fc';
  if (hover.kind === 'port'){
    const pt = hover.p;
    title = pt.n;
    sub = (pt.dir==='in' ? '◀ input port' : 'output port ▶') + ' · ' + hover.b.n;
    color = pt.dir==='in' ? '#5eead4' : '#fbbf24';
    rows = [['data type', pt.t || '—'], ['size / capacity', pt.l || '—'], ['storage / landing', pt.s || '—']];
    if (pt.derived) rows.push(['port origin', 'derived from the upstream signal']);
    desc = pt.d || '';
  } else if (hover.kind === 'drawerRow'){
    const b = hover.b, dw = b.drawers[hover.di], f = dw.rows[hover.i];
    const meta = f[1] === '' || f[1] === undefined ? '—' : (typeof f[1] === 'number' ? f[1] + ' lines' : String(f[1]));
    if (dw.kind === 'file'){
      const cut = f[0].lastIndexOf('/') + 1;
      title = f[0].slice(cut) || f[0];
      sub = 'source file · in "' + b.n + '"';
      color = '#8fd0ff';
      rows = [['size', meta], ['directory', f[0].slice(0, cut) || '(repository root)'], ['level', LV_NAME[D[cur()].lv]]];
      desc = f[2] || ('full path: ' + f[0]);
    } else {
      const cd = codeOf(f);
      title = f[0];
      sub = 'class / object · in "' + b.n + '"';
      color = '#a78bfa';
      rows = [['kind', meta], ['module', b.n],
              ['defined at', cd ? cd.f + ':' + cd.l : '(no single declaration site)']];
      desc = f[2] || '';
    }
  } else if (hover.kind === 'feat'){
    const ft = FEATURES[hover.i], cd = D[ft.key.split('/')[0]];
    title = ft.n;
    sub = 'L1 feature · ' + ft.cat;
    color = '#7dd3fc';
    rows = [['implemented by', ft.key], ['diagram', cd ? cd.title : '—'],
            ['level', cd ? LV_NAME[cd.lv] : '—']];
    desc = (ft.d || '') + '  (click to jump to the diagram that owns this module)';
  } else {
    const b = hover.b;
    const fd = b.drawers.find(x => x.kind === 'file');
    const cd = b.drawers.find(x => x.kind === 'cls');
    title = b.n; sub = b.t || (KIND[b.k]||KIND.comp).tag;
    color = (KIND[b.k]||KIND.comp).s;
    rows = [['input ports', b.in.length + ''], ['output ports', b.out.length + ''],
            ['files', fd ? fd.rows.length + ' (click ▾)' : '—'],
            ['classes / objects', cd ? cd.rows.length + ' (click ▾)' : '—'],
            ['drills into', b.child && D[b.child] ? D[b.child].title : '(leaf module)']];
    desc = b.d || '';
  }

  const ret = (hover.kind === 'port' && hover.p.ret) ? hover.p.ret : null;

  /* When hovering a "classes / objects" row, attach its real definition snippet from the repository */
  let code = null;
  if (hover.kind === 'drawerRow'){
    const dw = hover.b.drawers[hover.di];
    if (dw.kind === 'cls') code = codeOf(dw.rows[hover.i]);
  }
  const MAXW = code ? 680 : (ret ? 500 : 420);
  g.font = '11.5px ' + FONT;
  const dlines = desc ? wrap(desc, MAXW-24) : [];
  const rlines = ret ? ret.map(e => ({
    n: e[0], t: e[1] || '',
    body: wrap(e[2] || '', MAXW-38)
  })) : [];

  let w = Math.max(g.measureText(sub).width + 24, 260);
  g.font = 'bold 13px ' + FONT; w = Math.max(w, g.measureText(title).width + 24);
  g.font = '11.5px ' + FONT;
  rows.forEach(r => { w = Math.max(w, g.measureText(r[0]).width + g.measureText(r[1]).width + 46); });
  dlines.forEach(l => { w = Math.max(w, g.measureText(l).width + 24); });
  rlines.forEach(e => {
    g.font = 'bold 11.5px ' + FONT; const nw = g.measureText(e.n).width;
    g.font = '10.5px ' + FONT;      const tw = g.measureText(e.t).width;
    w = Math.max(w, nw + tw + 38);
    g.font = '11px ' + FONT;
    e.body.forEach(l => { w = Math.max(w, g.measureText(l).width + 38); });
  });
  /* Code block: monospace, truncated to the available height */
  let cw = 0, clines = [], truncated = 0;
  if (code){
    g.font = CODE_FS + 'px ' + MONO;
    cw = g.measureText('M').width;                       // monospace → a character index is enough to position
    const budget = Math.max(6, Math.floor((VH - 300 - rows.length*19 - dlines.length*16) / CODE_LH));
    clines = code.s.slice(0, budget);
    truncated = code.s.length - clines.length;
    const maxCols = Math.floor((MAXW - 30) / cw);
    clines = clines.map(l => l.length > maxCols ? l.slice(0, maxCols - 1) + '…' : l);
    const cols = clines.reduce((m, l) => Math.max(m, l.length), 0);
    w = Math.max(w, Math.min(MAXW, cols*cw + 30));
    g.font = '9.5px ' + FONT;
    w = Math.max(w, Math.min(MAXW, g.measureText(code.f + ':' + code.l).width + 30));
  }
  w = Math.min(w, MAXW);

  const retH = rlines.length
    ? 24 + rlines.reduce((s,e) => s + 17 + e.body.length*15, 0) + 4
    : 0;
  const codeH = clines.length ? 26 + clines.length*CODE_LH + (truncated ? 14 : 0) + 8 : 0;
  const h = 52 + rows.length*19 + (dlines.length ? 10 + dlines.length*16 : 0) + retH + codeH + 10;

  let x = mouse.x + 18, y = mouse.y + 18;
  if (x + w > VW-12) x = mouse.x - w - 18;
  if (y + h > VH-12) y = Math.max(112, VH - h - 12);

  g.fillStyle = 'rgba(13,16,21,.97)'; rr(x, y, w, h, 9); g.fill();
  g.strokeStyle = color; g.lineWidth = 1.3; rr(x, y, w, h, 9); g.stroke();
  g.fillStyle = color; g.fillRect(x, y+1, 3, h-2);

  g.textAlign='left'; g.textBaseline='middle';
  g.font = 'bold 13px ' + FONT; g.fillStyle = '#eef3fa';
  g.fillText(fit(title, w-24), x+12, y+18);
  g.font = '10.5px ' + FONT; g.fillStyle = color;
  g.fillText(fit(sub, w-24), x+12, y+35);

  let yy = y + 54;
  rows.forEach(r => {
    g.font = '11px ' + FONT; g.fillStyle = '#6f7b8c';
    g.fillText(r[0], x+12, yy);
    g.font = '11.5px ' + FONT; g.fillStyle = '#d6dfeb';
    g.textAlign = 'right'; g.fillText(fit(r[1], w-110), x+w-12, yy);
    g.textAlign = 'left';
    yy += 19;
  });
  if (dlines.length){
    g.strokeStyle = 'rgba(255,255,255,.08)';
    g.beginPath(); g.moveTo(x+12, yy-4); g.lineTo(x+w-12, yy-4); g.stroke();
    yy += 8;
    g.font = '11.5px ' + FONT; g.fillStyle = '#9aa6b6';
    dlines.forEach(l => { g.fillText(l, x+12, yy); yy += 16; });
  }

  if (rlines.length){
    g.strokeStyle = 'rgba(255,255,255,.08)';
    g.beginPath(); g.moveTo(x+12, yy-2); g.lineTo(x+w-12, yy-2); g.stroke();
    yy += 12;
    g.font = 'italic bold 10.5px ' + FONT; g.fillStyle = '#ffd479';
    g.fillText('ƒ ' + (hover.p.dir === 'in' ? 'input' : 'return') + ' fields (' + rlines.length + ')', x+12, yy);
    yy += 16;
    rlines.forEach(e => {
      g.fillStyle = '#ffd479';
      g.beginPath(); g.arc(x+16, yy, 2, 0, Math.PI*2); g.fill();
      g.font = 'bold 11.5px ' + FONT; g.fillStyle = '#e8eef7';
      g.fillText(e.n, x+24, yy);
      const nw = g.measureText(e.n).width;
      if (e.t){
        g.font = '10.5px ' + FONT; g.fillStyle = '#7f8b9c';
        g.fillText(e.t, x+24+nw+8, yy);
      }
      yy += 17;
      g.font = '11px ' + FONT; g.fillStyle = '#96a2b2';
      e.body.forEach(l => { g.fillText(l, x+24, yy); yy += 15; });
    });
  }

  if (clines.length){
    g.strokeStyle = 'rgba(255,255,255,.08)';
    g.beginPath(); g.moveTo(x+12, yy-2); g.lineTo(x+w-12, yy-2); g.stroke();
    yy += 12;

    // Source annotation
    g.font = 'italic 9.5px ' + FONT; g.fillStyle = '#6f7f95';
    g.fillText(fit('◱ ' + code.f + ':' + code.l, w-24), x+12, yy);
    yy += 14;

    // Code plate
    const boxY = yy - 4, boxH = clines.length*CODE_LH + (truncated ? 14 : 0) + 8;
    g.fillStyle = 'rgba(255,255,255,.035)';
    rr(x+10, boxY, w-20, boxH, 5); g.fill();
    g.fillStyle = 'rgba(125,211,252,.30)';
    g.fillRect(x+10, boxY, 2, boxH);

    yy += 6;
    g.font = CODE_FS + 'px ' + MONO; g.textBaseline = 'middle';
    for (const line of clines){ drawCodeLine(line, x+18, yy, cw); yy += CODE_LH; }
    if (truncated){
      g.font = 'italic 9.5px ' + FONT; g.fillStyle = '#5d6a7d';
      g.fillText('… ' + truncated + ' more lines, see the source file', x+18, yy+2);
      yy += 14;
    }
  }
}

/* ------------------------------------------------- code line colouring (monospace → position by character index) */
const MONO = 'Consolas,"Cascadia Mono","JetBrains Mono","DejaVu Sans Mono","Courier New",monospace';
const CODE_FS = 11, CODE_LH = 14;
const CODE_COL = { base:'#c3cede', kw:'#7dd3fc', str:'#ffc978', com:'#5c6b7e', num:'#c4b5fd', type:'#8fd0ff' };
const CODE_KW = /\b(?:export|import|from|declare|module|interface|class|abstract|extends|implements|type|const|let|var|function|async|await|return|readonly|public|private|protected|static|new|this|void|null|undefined|true|false|if|else|for|while|switch|case|break|continue|throw|try|catch|finally|typeof|keyof|infer|in|of|as|is|enum|default|yield|get|set|super|never|unknown|string|number|boolean|object|symbol)\b/g;

function drawCodeLine(line, x, y, cw){
  const n = line.length;
  if (!n) return;
  const col = new Array(n).fill(CODE_COL.base);

  const paint = (a, b, c) => { for (let i = Math.max(0,a); i < Math.min(n,b); i++) col[i] = c; };

  // Keywords / numbers / type names (capitalised)
  let m;
  CODE_KW.lastIndex = 0;
  while ((m = CODE_KW.exec(line))) paint(m.index, m.index + m[0].length, CODE_COL.kw);
  const num = /\b\d[\w.]*\b/g;
  while ((m = num.exec(line))) paint(m.index, m.index + m[0].length, CODE_COL.num);
  const typ = /\b[A-Z][A-Za-z0-9_$]*\b/g;
  while ((m = typ.exec(line))) paint(m.index, m.index + m[0].length, CODE_COL.type);

  // Strings override the colouring above
  const str = /'[^']*'|"[^"]*"|`[^`]*`/g;
  while ((m = str.exec(line))) paint(m.index, m.index + m[0].length, CODE_COL.str);

  // Comments win outright and paint over the whole run
  const ci = line.indexOf('//');
  const t = line.trimStart();
  if (t.startsWith('*') || t.startsWith('/*') || t.startsWith('//')) paint(0, n, CODE_COL.com);
  else if (ci >= 0) paint(ci, n, CODE_COL.com);

  // Draw each run of a single colour in one call
  let s = 0;
  for (let i = 1; i <= n; i++){
    if (i === n || col[i] !== col[s]){
      g.fillStyle = col[s];
      g.fillText(line.slice(s, i), x + s*cw, y);
      s = i;
    }
  }
}

/* ---------------------------------------------------------------- hit testing */
/* Hover kinds that are clickable — they decide whether the cursor turns into a pointer */
const CLICKABLE = new Set(['flow', 'chk', 'stop', 'drawer', 'feat', 'tab',
                           'ctrl', 'panelToggle', 'btn', 'crumb']);

function hitTest(mx, my){
  for (const c of (HIT.ctrl || [])) if (inRect(mx,my,c)) return { kind:'ctrl', id:c.id };
  if (HIT.panelToggle && inRect(mx,my,HIT.panelToggle)) return { kind:'panelToggle' };
  for (const b of HIT.btns)   if (inRect(mx,my,b)) return { kind:'btn', id:b.id };
  for (const c of HIT.crumbs) if (inRect(mx,my,c)) return { kind:'crumb', i:c.i };
  if (HIT.stop && inRect(mx,my,HIT.stop)) return { kind:'stop' };
  if (HIT.chk  && inRect(mx,my,HIT.chk))  return { kind:'chk' };
  for (const t of HIT.tabs)   if (inRect(mx,my,t)) return { kind:'tab', t:t.t };
  for (const f of HIT.flows)  if (inRect(mx,my,f)) return { kind:'flow', i:f.i };
  for (const f of HIT.feats)  if (inRect(mx,my,f)) return { kind:'feat', i:f.i };
  if (HIT.panel && inRect(mx,my,HIT.panel)) return { kind:'panel' };
  if (my < 104) return null;

  const L = layout(cur()), w = s2w(mx,my);
  for (const b of L.blocks){
    if (w.x < b.x-10 || w.x > b.x+b.w+10 || w.y < b.y || w.y > b.y+b.h) continue;

    if (w.x >= b.x && w.x <= b.x+b.w){
      for (let di = 0; di < b.drawers.length; di++){
        const dw = b.drawers[di], fy = drawerTop(b, di);
        if (w.y >= fy && w.y <= fy + FCHIP) return { kind:'drawer', b, di };
        if (dw.open && w.y > fy + FCHIP){
          const vis = drawerView(dw);
          const k = Math.floor((w.y - fy - FCHIP - 4) / FROW);
          if (k >= 0 && k < vis){
            const i = drawerOff(dw) + k;
            // Return as soon as the drawer body is hit: even a group-header row (not hoverable) must
            // swallow it, otherwise the wheel falls through and zooms the canvas.
            if (i < dw.rows.length){
              return isGroupRow(dw.rows[i])
                ? { kind:'drawerBody', b, di }
                : { kind:'drawerRow', b, di, i };
            }
          }
        }
      }
    }

    const half = b.lw;
    for (const pt of b.in)
      if (w.x >= pt.x-10 && w.x <= pt.x+half+12 && Math.abs(w.y-pt.y) <= PITCH/2) return { kind:'port', p:pt, b };
    for (const pt of b.out)
      if (w.x <= pt.x+10 && w.x >= pt.x-half-12 && Math.abs(w.y-pt.y) <= PITCH/2) return { kind:'port', p:pt, b };
    if (w.x >= b.x && w.x <= b.x+b.w) return { kind:'block', b };
  }
  return null;
}
const inRect = (x,y,r) => x>=r.x && x<=r.x+r.w && y>=r.y && y<=r.y+r.h;

/* ------------------------------------------------------ level transition effect */
/* Outgoing level: scale up from the centre + fade out (offscreen snapshot). Incoming: fade in beneath it */
const snapCv = document.createElement('canvas');
const snapG  = snapCv.getContext('2d');
let trans = null;                   // {t0, dur, dir:1 drill in / -1 back}

function beginTransition(dir, dur){
  if (!VW || !VH) return;
  snapCv.width = cv.width; snapCv.height = cv.height;
  snapG.clearRect(0, 0, snapCv.width, snapCv.height);
  snapG.drawImage(cv, 0, 0);        // grab the current frame
  trans = { t0: now(), dur: dur || 420, dir };
}
function drawTransition(){
  const p = Math.min(1, (now() - trans.t0) / trans.dur);
  const e = 1 - Math.pow(1 - p, 3);                     // easeOutCubic
  const k = trans.dir > 0 ? 1 + 0.34*e : 1 - 0.28*e;    // drill in = grow / back = shrink
  const w = snapCv.width, h = snapCv.height;
  g.save();
  g.setTransform(1, 0, 0, 1, 0, 0);                     // draw the snapshot in device pixels
  g.globalAlpha = Math.max(0, 1 - e);
  g.translate(w/2, h/2); g.scale(k, k); g.translate(-w/2, -h/2);
  g.drawImage(snapCv, 0, 0);
  g.restore();
  if (p >= 1) trans = null;
}

/* ---------------------------------------------------------------- navigation */
function go(id){
  if (!D[id]) return;
  stopFlow();                       // manual navigation stops the flow demo
  beginTransition(1);
  stack.push(id);
  if (!views[id]) fitView(id);
  hover = null; requestDraw();
}
function back(){
  if (stack.length>1){ stopFlow(); beginTransition(-1); stack.pop(); hover=null; requestDraw(); }
}
function jump(i){
  if (i < stack.length-1){ stopFlow(); beginTransition(-1); stack = stack.slice(0, i+1); hover=null; requestDraw(); }
}

/* ---------------------------------------------------------------- events */
cv.addEventListener('mousemove', e => {
  mouse.x = e.clientX; mouse.y = e.clientY; mouse.in = true;
  if (blockDrag){
    const v = views[cur()];
    POS[blockDrag.key] = { x: blockDrag.ox + (e.clientX - blockDrag.sx)/v.s,
                           y: blockDrag.oy + (e.clientY - blockDrag.sy)/v.s };
    if (Math.abs(e.clientX-blockDrag.sx) + Math.abs(e.clientY-blockDrag.sy) > 3) blockDrag.moved = true;
    delete LAY[cur()];                 // recomputing the layout is what re-routes the links
    requestDraw(); return;
  }
  if (drag){
    const v = views[cur()];
    v.tx = drag.tx + (e.clientX - drag.x);
    v.ty = drag.ty + (e.clientY - drag.y);
    if (Math.abs(e.clientX-drag.x) + Math.abs(e.clientY-drag.y) > 4) drag.moved = true;
    requestDraw(); return;
  }
  const h = hitTest(e.clientX, e.clientY);
  const same = (h===null && hover===null) ||
               (h && hover && h.kind===hover.kind && h.b===hover.b && h.p===hover.p && h.i===hover.i && h.id===hover.id);
  hover = h;
  if (editMode && e.ctrlKey && h && h.b)              cv.style.cursor = 'move';
  else if (editMode && hitText(e.clientX, e.clientY)) cv.style.cursor = 'text';
  else cv.style.cursor = !h ? 'grab'
    : (h.kind === 'drawerRow' || h.kind === 'drawerBody' || h.kind === 'panel') ? 'default'
    : CLICKABLE.has(h.kind) ? 'pointer'
    : ((h.kind === 'block' || h.kind === 'port') && !h.b.child) ? 'default' : 'pointer';
  if (!same || h) requestDraw();
});
cv.addEventListener('mouseleave', () => { mouse.in = false; hover = null; requestDraw(); });

cv.addEventListener('mousedown', e => {
  if (editing) closeEditor();          // clicking away from the form dismisses it without applying
  if (e.button !== 0) return;
  // Ctrl+drag in edit mode picks up the rectangle instead of panning the canvas
  if (editMode && e.ctrlKey){
    const h = hitTest(e.clientX, e.clientY);
    if (h && h.b){
      e.preventDefault();
      blockDrag = { b:h.b, key: cur() + '/' + h.b.id, ox:h.b.x, oy:h.b.y,
                    sx:e.clientX, sy:e.clientY, moved:false };
      cv.style.cursor = 'move';
      return;
    }
  }
  const v = views[cur()];
  drag = { x:e.clientX, y:e.clientY, tx:v.tx, ty:v.ty, moved:false };
  cv.style.cursor = 'grabbing';
});
window.addEventListener('mouseup', e => {
  if (blockDrag){
    const moved = blockDrag.moved, key = blockDrag.key;
    blockDrag = null; cv.style.cursor = 'grab';
    if (moved) saveEdits(); else delete POS[key];   // a Ctrl+click that never moved leaves no override
    delete LAY[cur()]; requestDraw();
    return;
  }
  if (!drag) return;
  const moved = drag.moved; drag = null; cv.style.cursor = 'grab';
  if (moved) return;

  // In edit mode a label click wins over navigation, so drilling in never eats an edit
  if (editMode){
    const t = hitText(e.clientX, e.clientY);
    if (t){ openEditor(t); return; }
  }

  const h = hitTest(e.clientX, e.clientY);
  if (!h) return;
  if (h.kind === 'btn'){
    if (h.id==='back') back();
    else if (h.id==='fit'){ fitView(cur()); requestDraw(); }
    else if (h.id==='top'){ stack = ['L1']; hover=null; requestDraw(); }
    else if (h.id==='edit') toggleEdit();
    else if (h.id==='reset') resetLayout();
  } else if (h.kind === 'crumb'){ jump(h.i); }
  else if (h.kind === 'flow'){ startFlow(h.i); }
  else if (h.kind === 'chk'){ autoDive = !autoDive; requestDraw(); }
  else if (h.kind === 'stop'){ stopFlow(); }
  else if (h.kind === 'panel'){ /* panel background: swallow the click */ }
  else if (h.kind === 'ctrl'){
    if (h.id === 'prev') stepBy(-1);
    else if (h.id === 'next') stepBy(1);
    else if (h.id === 'play') togglePause();
    else if (h.id.startsWith('rate')) setRate(parseFloat(h.id.slice(4)));
  }
  else if (h.kind === 'panelToggle'){
    panelOpen = !panelOpen;
    fitView(cur());                     // the usable canvas width changed, re-frame
    hover = null; requestDraw();
  }
  else if (h.kind === 'feat'){ gotoFeature(h.i); }
  else if (h.kind === 'tab'){ panelTab = h.t; hover = null; requestDraw(); }
  else if (h.kind === 'drawer'){ toggleDrawer(h.b, h.di); }
  else if (h.kind === 'drawerRow' || h.kind === 'drawerBody'){ /* a single row is read-only, no navigation */ }
  else if (h.kind === 'block' && h.b.child) go(h.b.child);
  else if (h.kind === 'port'  && h.b.child) go(h.b.child);
});

function toggleDrawer(b, di){
  const k = b.drawers[di].key;
  if (OPEN.has(k)) OPEN.delete(k); else OPEN.add(k);
  delete LAY[cur()];          // the height changed, re-lay out this diagram
  hover = null; requestDraw();
}

/* Clicking a row in the L1 capability list: jump to the diagram that owns the implementing module */
function gotoFeature(i){
  const ft = FEATURES[i];
  if (!ft) return;
  const diaId = ft.key.split('/')[0];
  if (!D[diaId]) return;
  stack = pathOf(diaId);
  focus = { dia: diaId, block: ft.key.split('/')[1], t0: now() };
  hover = null;
  fitView(diaId);
  requestDraw();
}

/* ================================================================== edit mode
   Everything below is additive: with editMode off, nothing here runs and the map behaves exactly
   as generated. The markup and CSS for #ed live in build.mjs's HTML shell, the same split the
   caption (#cap / setCaption) already uses. */

const ED = document.getElementById('ed');
const ED_TITLE = document.getElementById('edTitle');
const ED_PATH  = document.getElementById('edPath');
const ED_BODY  = document.getElementById('edBody');
const LS_KEY = 'archpresent:edits:' + document.title;

/* Topmost registered label under the cursor (later registrations are drawn on top) */
function hitText(mx, my){
  for (let i = ETEXT.length - 1; i >= 0; i--){
    const t = ETEXT[i];
    if (mx >= t.x && mx <= t.x+t.w && my >= t.y && my <= t.y+t.h) return t;
  }
  return null;
}

function toggleEdit(){
  editMode = !editMode;
  if (!editMode) closeEditor();
  hover = null; ETEXT.length = 0;
  cv.style.cursor = 'grab';
  requestDraw();
}

function resetLayout(){
  for (const k of Object.keys(POS)) delete POS[k];
  for (const k of Object.keys(LAY)) delete LAY[k];
  saveEdits(); fitView(cur()); requestDraw();
}

function openEditor(t){
  closeEditor();
  editing = t;
  ED_TITLE.textContent = t.title;
  ED_PATH.textContent  = t.path || '';
  ED_BODY.innerHTML = '';
  const inputs = {};
  t.fields.forEach(f => {
    const wrap = document.createElement('div'); wrap.className = 'fld';
    const lab = document.createElement('label'); lab.textContent = f.label;
    const el = document.createElement(f.ml ? 'textarea' : 'input');
    if (!f.ml) el.type = 'text';
    el.value = t.target[f.k] == null ? '' : String(t.target[f.k]);
    wrap.appendChild(lab); wrap.appendChild(el); ED_BODY.appendChild(wrap);
    inputs[f.k] = el;
  });
  editing.inputs = inputs;

  // Anchor below the label, clamped into the viewport
  ED.classList.add('show');
  const w = ED.offsetWidth, h = ED.offsetHeight;
  ED.style.left = Math.max(12, Math.min(VW - w - 12, t.x)) + 'px';
  ED.style.top  = Math.max(12, Math.min(VH - h - 12, t.y + t.h + 10)) + 'px';

  const focusEl = inputs[t.focusKey] || inputs[t.fields[0].k];
  focusEl.focus(); focusEl.select();
}

function applyEditor(){
  if (!editing) return;
  const t = editing, changed = {};
  t.fields.forEach(f => {
    const v = t.inputs[f.k].value;
    if (String(t.target[f.k] == null ? '' : t.target[f.k]) !== v){ t.target[f.k] = v; changed[f.k] = v; }
  });
  closeEditor();
  if (Object.keys(changed).length){
    if (t.pkey){
      const store = TEXT_EDITS[t.pkey] || (TEXT_EDITS[t.pkey] = {});
      Object.assign(store, changed);
    }
    saveEdits();
    // Port names and link labels feed the layout's derived ports, so invalidate the cache
    for (const k of Object.keys(LAY)) delete LAY[k];
  }
  hover = null; requestDraw();
}

function closeEditor(){
  if (!editing) return;
  editing = null;
  ED.classList.remove('show');
  ED_BODY.innerHTML = '';
}

document.getElementById('edOk').addEventListener('click', applyEditor);
document.getElementById('edCancel').addEventListener('click', () => { closeEditor(); requestDraw(); });
ED.addEventListener('mousedown', e => e.stopPropagation());
ED.addEventListener('wheel', e => e.stopPropagation());
ED.addEventListener('keydown', e => {
  e.stopPropagation();                 // keeps the map's single-key shortcuts out of the form
  if (e.key === 'Escape'){ e.preventDefault(); closeEditor(); requestDraw(); }
  else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)){ e.preventDefault(); applyEditor(); }
  else if (e.key === 'Enter' && e.target.tagName === 'INPUT'){ e.preventDefault(); applyEditor(); }
});

/* ---------------------------------------------------------- persistence
   Text edits mutate the diagram data in place, so they are also recorded under a stable key and
   replayed on load. Rectangle positions are stored as plain overrides. */
const TEXT_EDITS = {};

function resolveTarget(pkey){
  const c = pkey.indexOf(':');
  const kind = pkey.slice(0, c), rest = pkey.slice(c+1);
  if (kind === 'D') return D[rest] || null;
  if (kind === 'B'){
    const [dia, bid] = rest.split('/');
    return D[dia] ? (D[dia].blocks.find(b => b.id === bid) || null) : null;
  }
  if (kind === 'K'){
    const i = rest.lastIndexOf('/');
    const dia = rest.slice(0, i), li = +rest.slice(i+1);
    return D[dia] && D[dia].links ? (D[dia].links[li] || null) : null;
  }
  if (kind === 'P'){
    const m = /^(.*)\/([^/]+)\/(in|out):(\d+)$/.exec(rest);
    if (!m) return null;
    const d = D[m[1]]; if (!d) return null;
    const b = d.blocks.find(x => x.id === m[2]); if (!b) return null;
    const arr = m[3] === 'in' ? b.in : b.out;
    return (arr && arr[+m[4]]) || null;
  }
  return null;
}

function saveEdits(){
  try {
    localStorage.setItem(LS_KEY, JSON.stringify({ v:1, pos:POS, text:TEXT_EDITS }));
  } catch { /* private mode / quota / no localStorage: the session works, it just will not survive a reload */ }
}

function loadEdits(){
  let raw = null;
  try { raw = localStorage.getItem(LS_KEY); } catch { return; }
  if (!raw) return;
  let saved; try { saved = JSON.parse(raw); } catch { return; }
  if (!saved || saved.v !== 1) return;
  Object.assign(POS, saved.pos || {});
  for (const [pkey, fields] of Object.entries(saved.text || {})){
    const target = resolveTarget(pkey);
    if (!target) continue;                      // the map was regenerated and this element is gone
    TEXT_EDITS[pkey] = fields;
    Object.assign(target, fields);
  }
}
loadEdits();

cv.addEventListener('contextmenu', e => { e.preventDefault(); if (!editMode) back(); });

cv.addEventListener('wheel', e => {
  e.preventDefault();
  // With the cursor over the capability list, scroll the list instead of zooming the canvas
  if (HIT.featBox && HIT.featBox.maxScroll > 0 && inRect(e.clientX, e.clientY, HIT.featBox)){
    featScroll = Math.max(0, Math.min(HIT.featBox.maxScroll, featScroll + e.deltaY));
    hover = hitTest(e.clientX, e.clientY);
    requestDraw();
    return;
  }
  // With the cursor over an expanded drawer body, scroll the drawer instead of zooming the canvas
  const hd = hitTest(e.clientX, e.clientY);
  if (hd && (hd.kind === 'drawerRow' || hd.kind === 'drawerBody')){
    const dw = hd.b.drawers[hd.di], span = dw.rows.length - drawerView(dw);
    if (span > 0){
      // A huge drawer (one file with hundreds of symbols) needs a hundred notches at 3 rows each — Shift jumps a page, Alt goes to either end
      const page = Math.max(1, drawerView(dw) - 1);
      const dir = e.deltaY > 0 ? 1 : -1;
      const next = e.altKey ? (dir > 0 ? span : 0)
                 : drawerOff(dw) + dir * (e.shiftKey ? page : 3);
      DSCROLL[dw.key] = Math.max(0, Math.min(span, next));
      hover = hitTest(e.clientX, e.clientY);
      requestDraw();
      return;
    }
  }
  const v = views[cur()];
  const k = Math.exp(-e.deltaY * 0.0014);
  const ns = Math.max(0.22, Math.min(2.6, v.s * k));
  v.tx = e.clientX - (e.clientX - v.tx) * (ns/v.s);
  v.ty = e.clientY - (e.clientY - v.ty) * (ns/v.s);
  v.s = ns; requestDraw();
}, { passive:false });

window.addEventListener('keydown', e => {
  if (e.key === 'Escape'){ e.preventDefault(); if (play) stopFlow(); else back(); }
  else if (e.key === 'Backspace'){ e.preventDefault(); back(); }
  else if (e.key === 'f' || e.key === 'F'){ fitView(cur()); requestDraw(); }
  else if (e.key === 'e' || e.key === 'E'){
    const L = layout(cur());
    const expand = L.blocks.some(b => b.drawers.some(dw => !dw.open));
    L.blocks.forEach(b => b.drawers.forEach(dw => {
      if (expand) OPEN.add(dw.key); else OPEN.delete(dw.key);
    }));
    delete LAY[cur()]; hover = null; requestDraw();
  }
  else if (e.key === 'l' || e.key === 'L'){
    panelTab = panelTab === 'flow' ? 'feat' : 'flow'; requestDraw();
  }
  else if (e.key === 'ArrowLeft'){  e.preventDefault(); stepBy(-1); }
  else if (e.key === 'ArrowRight'){ e.preventDefault(); stepBy(1); }
  else if (e.key === ' '){ e.preventDefault(); togglePause(); }
  else if (e.key === '[' || e.key === ']'){
    const i = RATES.indexOf(playRate);
    setRate(RATES[Math.max(0, Math.min(RATES.length-1, i + (e.key === ']' ? 1 : -1)))]);
  }
  else if (e.key === 'b' || e.key === 'B'){
    panelOpen = !panelOpen; fitView(cur()); hover = null; requestDraw();
  }
  else if (e.key === 'Home'){ stack = ['L1']; requestDraw(); }
  else if (e.key === '+' || e.key === '='){ const v=views[cur()]; v.s=Math.min(2.6,v.s*1.15); requestDraw(); }
  else if (e.key === '-'){ const v=views[cur()]; v.s=Math.max(0.22,v.s/1.15); requestDraw(); }
});

function resize(){
  DPR = Math.max(1, Math.min(3, window.devicePixelRatio || 1));
  VW = window.innerWidth; VH = window.innerHeight;
  cv.width = Math.round(VW*DPR); cv.height = Math.round(VH*DPR);
  cv.style.width = VW+'px'; cv.style.height = VH+'px';
  g.setTransform(DPR,0,0,DPR,0,0);
  views = {};                      // recompute the viewports for the new window size
  trans = null;                    // the snapshot size is stale, cancel the transition
  requestDraw();
}
window.addEventListener('resize', resize);
resize();
