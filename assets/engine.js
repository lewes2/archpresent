/* ---------------------------------------------------------------- 渲染引擎 */
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

const LV_NAME = ['', 'L1 · 系统上下文 Context', 'L2 · 容器 Container', 'L3 · 组件 Component', 'L4 · 代码 Code'];

const cv = document.getElementById('cv');
const g  = cv.getContext('2d');
const FONT = '"Microsoft YaHei","PingFang SC",system-ui,-apple-system,"Segoe UI",sans-serif';
let VW = 0, VH = 0, DPR = 1;

const LAY   = {};                 // 布局缓存 id -> {blocks, links, bbox}
let stack   = ['L1'];             // 导航栈
let views   = {};                 // id -> {s, tx, ty}
let hover   = null;               // {kind:'port'|'block'|'btn'|'crumb'|'drawer'|'feat', ...}
let mouse   = { x:0, y:0, in:false };
let drag    = null;
let pending = false;

const HIT = { btns:[], crumbs:[], feats:[], tabs:[], ctrl:[] };

let panelTab = 'flow';            // 左面板页签：'flow' 典型场景 | 'feat' L1 功能列表
let focus    = null;              // 从功能列表跳过来时高亮的矩形 {dia, block, t0}
let featScroll = 0;               // 功能列表滚动偏移（列表比视口高，必须能滚）

const HEAD = 54, PITCH = 24, PADB = 12, GX = 116, GY = 44, MINH = 92;
const FCHIP = 22, FROW = 17;      // 文件下拉：把手高度 / 每行高度
const OPEN = new Set();           // 已展开的抽屉（键为 "<图 id>/<矩形 id>#<抽屉序号>"）

/* wmux 改造 ①：抽屉视窗。src/shared/types.ts 单文件 89 个导出，全量清单不能把矩形
   撑到几千像素高 —— 抽屉最多显示 DROWS_MAX 行，其余靠滚轮在抽屉内滚。 */
const DROWS_MAX = 26;
const DSCROLL = {};               // 抽屉键 -> 起始行下标
const drawerView = dw => Math.min(dw.rows.length, DROWS_MAX);
const drawerBodyH = dw => (dw.open ? drawerView(dw)*FROW + 8 : 0);
const drawerOff = dw => Math.max(0, Math.min(dw.rows.length - drawerView(dw), DSCROLL[dw.key] | 0));
/* wmux 改造 ②：清单行分组头。行的第 4 位是 'g' 时画成暗色文件名，不可悬停 ——
   这样「目录 > 文件 > 类」三级在同一个抽屉里同时可见。 */
const isGroupRow = f => f && f[3] === 'g';
/* 清单行的源码片段键：3837 个符号里同名者众（default / index / handle …），
   所以键用「文件:行号」，由第 5 位携带；缺省回退到符号名。 */
const codeOf = f => (f && (CODE[f[4]] || CODE[f[0]])) || null;

const cur   = () => stack[stack.length - 1];
const curD  = () => D[cur()];
const view  = () => (views[cur()] || (views[cur()] = null));

function requestDraw(){ if(!pending){ pending = true; requestAnimationFrame(()=>{ pending=false; draw(); }); } }

/* ------------------------------------------------- 图的父子关系与跨层投影 */
const PARENT = {};                 // 子图 id -> {dia, block}
Object.keys(D).forEach(id => D[id].blocks.forEach(b => {
  if (b.child && D[b.child] && D[b.child].lv === D[id].lv + 1 && !PARENT[b.child])
    PARENT[b.child] = { dia:id, block:b.id };
}));
function pathOf(id){ const p=[id]; let c=id; while (PARENT[c]){ c=PARENT[c].dia; p.unshift(c); } return p; }
/* 把任意深度的一步投影到指定层：往上走到该图，返回它在该图里的祖先矩形 */
function project(key, diaId){
  let [d, b] = key.split('/');
  for (let i = 0; d !== diaId; i++){
    const pa = PARENT[d];
    if (!pa || i > 8) return null;          // 该步在更深的分支上，本层看不见
    b = pa.block; d = pa.dia;
  }
  return b;
}

/* ------------------------------------------------------------ 流程播放 */
const MOVE_MIN = 520, MOVE_MAX = 1500, HOLD = 430, LOOP_GAP = 950, PANEL_W = 320;
const PANEL_TAB_W = 30;            // 侧边栏收起后剩下的那条把手
const now = () => Date.now();
let autoDive = true;               // 「自动进入下一层」
let play = null;                   // {fi, si, dia, fromId, toId, pts, cum, len, t0, dur, phase, trail, paused}
let playRate = 1;                  // 播放速度：0.5 / 1 / 1.5
let lastFlow = 0;                  // 上一次播放的流程，供控制器的 ▶ 复用
let panelOpen = true;              // 侧边栏展开 / 收起

const panelW = () => (panelOpen ? PANEL_W : PANEL_TAB_W);

/* 本步已过去的时间。暂停时冻结在 play.paused 那一刻；再乘上速度倍率。 */
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
  if (play && !play.paused){                       // 让当前这一步的进度不跳变
    const done = playT();
    playRate = r;
    play.t0 = now() - done / playRate;
  } else playRate = r;
  requestDraw();
}

/* 单步定位到第 target 步（环形）。单步即暂停 —— 这是「一步一步看」该有的语义。 */
function seekStep(target){
  if (!play) return;
  const fl = FLOWS[play.fi], n = fl.steps.length;
  let t = ((target % n) + n) % n;

  // 目标步必须能落到本层的某个矩形上；落不到就朝同方向继续找
  let dia = null, B = null;
  for (let guard = 0; guard < n; guard++){
    const key = fl.steps[t].key;
    const d = autoDive ? key.split('/')[0] : cur();
    const b = D[d] ? project(key, d) : null;
    if (b && layout(d).byId[b]){ dia = d; B = b; break; }
    t = (t + 1) % n;
  }
  if (!B) return;

  if (dia !== cur()){                              // 跟随流程换层
    beginTransition(D[dia].lv >= D[cur()].lv ? 1 : -1, 300);
    stack = pathOf(dia); fitView(dia);
  }

  // 出发点：目标之前最近的、能投影到本图的那一步
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
  play.paused = now();                             // 停在这一步上
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
    if (play.si >= fl.steps.length){                    // 一轮走完 → 循环
      play.si = -1; play.fromId = null; play.toId = null; play.lastKey = null;
      play.phase = 'gap'; play.t0 = now(); play.dur = LOOP_GAP; play.trail = [];
      return;
    }
    const step = fl.steps[play.si];
    const sdia = step.key.split('/')[0];
    let dia = autoDive ? sdia : cur();

    if (autoDive && dia !== cur()){                                        // 跟随流程换层
      beginTransition(D[dia].lv >= D[cur()].lv ? 1 : -1, 300);
      stack = pathOf(dia); fitView(dia);
    }

    const B = project(step.key, dia);
    if (!B) continue;                                   // 这一步在更深层，本层无对应矩形
    const L = layout(dia);
    if (!L.byId[B]) continue;

    // 上一步在本图里的落点：同图取自身，上溯取祖先矩形，取不到（刚下钻）则淡入
    let from = play.lastKey ? project(play.lastKey, dia) : null;
    if (from && !L.byId[from]) from = null;

    play.dia = dia; play.lastKey = step.key;
    play.fromId = from; play.toId = B;

    if (!from || from === B){                           // 原地停留：只更新步骤文案
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

/* 两个矩形之间的走线：优先沿已有连线，否则正交兜底；两端各延伸到矩形中心，
   于是小圆点是「穿过模块 → 沿连线 → 进入下一个模块」 */
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
/* 步骤悬浮注释（DOM 层，唯一不画在 canvas 上的东西 —— 为的是拿到 CSS 过渡） */
const cap     = document.getElementById('cap');
const capMeta = document.getElementById('capMeta');
const capText = document.getElementById('capText');
const capMod  = document.getElementById('capMod');
let capKey = null, capTimer = null;

function setCaption(){
  if (!play || play.si < 0){                       // 无播放/循环间隙 → 下沉淡出
    if (capKey !== null){ capKey = null; cap.className = ''; }
    return;
  }
  const k = play.fi + ':' + play.si;
  if (k === capKey) return;
  capKey = k;

  const fl = FLOWS[play.fi], st = fl.steps[play.si];
  const [sdia, sbid] = st.key.split('/');
  const blk = D[sdia].blocks.find(b => b.id === sbid);

  cap.className = 'out';                           // 先淡出，再换字上浮
  cap.style.left = ((play || cur() === 'L1') ? panelW() + 44 : 40) + 'px';
  if (capTimer) clearTimeout(capTimer);
  capTimer = setTimeout(() => {
    if (capKey !== k) return;
    capMeta.textContent = '第 ' + (play.si+1) + ' / ' + fl.steps.length + ' 步   ·   L'
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

/* ------------------------------------------------------------------ 布局 */
function layout(id){
  if (LAY[id]) return LAY[id];
  const d = D[id];
  const colw = d.colw || 262;
  const raw = {};
  const wrapped = d.blocks.map((b, i) => {
    const key = d.id + '/' + b.id;
    /* 抽屉：同一套把手/行渲染，喂两种内容 —— 文件清单与内部类/对象。
       行的三元组是 [主文本, 右侧计量, 补充说明]，两种抽屉共用。 */
    const drawers = [];
    const fl = b.f || FILES[key] || FILES[d.id + '/*'] || null;
    if (fl && fl.length) drawers.push({ label:'文件清单', kind:'file', rows:fl, open:OPEN.has(key + '#0') });
    const cl = b.c || CLS[key] || null;
    if (cl && cl.length) drawers.push({ label:'内部类 / 对象', kind:'cls', rows:cl, open:OPEN.has(key + '#' + drawers.length) });
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

  /* 信号语义补齐：一条信号线只有一个载荷，目标块未显式声明该输入端口时，
     按上游输出端口的属性推导出对应的输入端口（数据类型/长度/储存表相同）。 */
  const synth = {};
  const edges = [];
  (d.links||[]).forEach(L => {
    const sb = raw[L.s[0]], tb = raw[L.t[0]];
    if (!sb || !tb) return;
    const sp = sb.out[L.s[1]];
    if (!sp) return;
    let ti = L.t[1];
    if (!tb.in[ti]){
      const key = L.t[0] + ':' + ti;
      if (synth[key] === undefined){
        tb.in.push({ n:sp.n, t:sp.t, l:sp.l, s:sp.s, d:sp.d, derived:true,
                     ret: RET[d.id + '/' + L.s[0] + '/out:' + L.s[1]] || null });
        synth[key] = tb.in.length - 1;
      }
      ti = synth[key];
    }
    edges.push({ sb, tb, sp, ti, l:L.l });
  });

  const cols = {};
  wrapped.forEach(bb => {
    const n = Math.max(bb.in.length, bb.out.length);
    bb.portsH = Math.max(MINH, HEAD + n*PITCH + PADB);          // 端口区高度（下拉把手落在其下沿）
    bb.h = bb.portsH + bb.drawers.reduce(
      (s, dw) => s + FCHIP + drawerBodyH(dw), 0);
    // 只有一侧有端口时，标签可以用整块宽度
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

  // 归一化到 (0,0)
  let minX=1e9,minY=1e9,maxX=-1e9,maxY=-1e9;
  blocks.forEach(b=>{ minX=Math.min(minX,b.x); minY=Math.min(minY,b.y); maxX=Math.max(maxX,b.x+b.w); maxY=Math.max(maxY,b.y+b.h); });
  blocks.forEach(b=>{ b.x-=minX; b.y-=minY; });
  const bbox = { w:maxX-minX, h:maxY-minY };

  // 端口坐标
  const byId = {};
  blocks.forEach(b => {
    byId[b.id] = b;
    b.in.forEach((pt,i)=>{ pt.x=b.x; pt.y=b.y+HEAD+PITCH*i+PITCH/2; pt.dir='in'; pt.owner=b;
                           pt.ret = pt.ret || RET[d.id + '/' + b.id + '/in:' + i] || null; });
    b.out.forEach((pt,i)=>{ pt.x=b.x+b.w; pt.y=b.y+HEAD+PITCH*i+PITCH/2; pt.dir='out'; pt.owner=b;
                            pt.ret = RET[d.id + '/' + b.id + '/out:' + i] || null; });
  });

  // 连线路由
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
    links.push({ pts, l:E.l, s:sb, t:tb, sp, tp });
  });

  return (LAY[id] = { blocks, links, bbox, byId });
}

/* ------------------------------------------------------------------ 工具 */
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
  const padL = (play || id === 'L1') ? panelW() + 44 : 44;   // 给流程面板让位
  const s = Math.min((VW-padL-padR)/Math.max(1,L.bbox.w), (VH-padT-padB)/Math.max(1,L.bbox.h), 1.25);
  const sc = Math.max(0.22, s);
  views[id] = { s:sc,
                tx: padL + (VW-padL-padR - L.bbox.w*sc)/2,
                ty: padT + (VH-padT-padB - L.bbox.h*sc)/2 };
}

/* ------------------------------------------------------------------ 绘制 */
function draw(){
  if (play) updatePlay();
  setCaption();
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
  if (trans) drawTransition();                   // 转场快照盖在最上层
  if ((play && !play.paused) || trans) requestDraw();   // 暂停时不空转 rAF
}

/* 发光小圆点 + 拖尾 + 活动模块高亮（世界坐标） */
function drawFlow(L, v){
  const to = L.byId[play.toId], from = play.fromId ? L.byId[play.fromId] : null;

  // 本步走线：先铺一条暗底，再叠已走过的高亮段
  if (play.phase === 'move' && play.pts){
    g.lineWidth = 2.2; g.lineJoin = 'round'; g.lineCap = 'round';
    g.strokeStyle = 'rgba(125,211,252,.16)';
    g.beginPath(); g.moveTo(play.pts[0].x, play.pts[0].y);
    for (let i=1;i<play.pts.length;i++) g.lineTo(play.pts[i].x, play.pts[i].y);
    g.stroke();
  }

  // 活动模块：呼吸光晕
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

  // 拖尾
  play.trail.push({ x:p.x, y:p.y });
  if (play.trail.length > 16) play.trail.shift();
  for (let i = 0; i < play.trail.length-1; i++){
    const t = play.trail[i], a = (i+1)/play.trail.length;
    g.fillStyle = 'rgba(125,211,252,' + (a*0.30).toFixed(3) + ')';
    g.beginPath(); g.arc(t.x, t.y, 2 + 4*a, 0, Math.PI*2); g.fill();
  }

  // 圆点本体：外晕 + 实心 + 高光
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

  // 箭头
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
  }
}

function drawBlock(b, v){
  const K = KIND[b.k] || KIND.comp;
  const isHover = hover && hover.b === b;

  // 从 L1 功能列表跳过来的目标块：呼吸一圈青色，6 秒后自然消退
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

  // 顶部标签条
  g.font = '9.5px ' + FONT; g.textBaseline = 'middle'; g.textAlign = 'left';
  g.fillStyle = K.s; g.globalAlpha = .85;
  g.fillText(K.tag, b.x+12, b.y+13);
  g.globalAlpha = 1;
  if (b.child){
    g.textAlign = 'right'; g.fillStyle = '#8ea0b8';
    g.fillText('下钻 ▸', b.x+b.w-12, b.y+13);
  }

  // 名称 / 技术
  g.textAlign = 'left';
  g.font = 'bold 14px ' + FONT; g.fillStyle = K.t;
  g.fillText(fit(b.n, b.w-24), b.x+12, b.y+31);
  g.font = '10.5px ' + FONT; g.fillStyle = '#8b95a5';
  g.fillText(fit(b.t||'', b.w-24), b.x+12, b.y+46);

  // 分隔
  g.strokeStyle = 'rgba(255,255,255,.08)'; g.lineWidth = 1;
  g.beginPath(); g.moveTo(b.x+8, b.y+HEAD-6); g.lineTo(b.x+b.w-8, b.y+HEAD-6); g.stroke();

  // 端口
  b.in.forEach(pt => drawPort(pt, b, b.lw, true));
  b.out.forEach(pt => drawPort(pt, b, b.lw, false));

  drawDrawers(b, K);
}

/* 抽屉的把手 y 坐标：portsH 之下，按前面抽屉的实际高度依次下移 */
function drawerTop(b, di){
  let y = b.y + b.portsH;
  for (let i = 0; i < di; i++){
    y += FCHIP + drawerBodyH(b.drawers[i]);
  }
  return y;
}

/* 下拉抽屉：把手 + 展开后的行。文件清单与内部类/对象共用同一套渲染。 */
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
    g.fillText(dw.open ? '收起' : '展开', b.x+b.w-16, y+FCHIP/2+1);

    if (!dw.open) return;

    const sbw = scrollable ? 5 : 0;            // 滚动条占的右侧宽度
    let fy = y + FCHIP + 4;
    for (let i = off; i < off + vis; i++){
      const f = dw.rows[i];
      if (!f) break;

      // 分组头：一个文件名，暗色小字 + 一条细分隔线，不参与悬停
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
                 : (typeof f[1] === 'number' ? f[1] + ' 行' : String(f[1]));
      g.font = '10px ' + FONT;
      const mw = meta ? g.measureText(meta).width + 10 : 0;
      const maxw = b.w - 32 - mw - sbw;

      // 文件行：目录暗、文件名亮；类行：整体一段，有定义片段的挂个 ‹› 记号
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

function drawPort(pt, b, half, isIn){
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

  // ƒ：该端口有结构化字段表（接口对象的字段名/类型/含义），悬停可展开
  if (pt.ret){
    g.font = 'italic bold 10px ' + FONT;
    g.fillStyle = on ? '#ffd479' : '#b8862f';
    if (isIn){ g.textAlign='left';  g.fillText('ƒ', pt.x+8+lw+4, pt.y); }
    else     { g.textAlign='right'; g.fillText('ƒ', pt.x-8-lw-4, pt.y); }
  }
}

/* ---------------------------------------------------------------- 顶栏 */
function drawHeader(d){
  HIT.btns = []; HIT.crumbs = [];
  const grd = g.createLinearGradient(0,0,0,104);
  grd.addColorStop(0,'rgba(14,17,22,.98)'); grd.addColorStop(1,'rgba(14,17,22,.72)');
  g.fillStyle = grd; g.fillRect(0,0,VW,104);
  g.strokeStyle = 'rgba(255,255,255,.07)'; g.lineWidth = 1;
  g.beginPath(); g.moveTo(0,104.5); g.lineTo(VW,104.5); g.stroke();

  g.textBaseline = 'middle'; g.textAlign = 'left';
  g.font = 'bold 17px ' + FONT; g.fillStyle = '#e8eef7';
  g.fillText('豆喵 · ' + d.title, 24, 26);
  g.font = '11.5px ' + FONT; g.fillStyle = '#7f8b9c';
  g.fillText(fit(d.sub || '', VW-560), 24, 47);

  // 面包屑
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

  // 按钮
  const btns = [
    { id:'back', label:'◀ 返回上层', on: stack.length>1 },
    { id:'fit',  label:'⤢ 适应窗口', on:true },
    { id:'top',  label:'⌂ 回到 L1',  on: stack.length>1 }
  ];
  let bx = VW - 24;
  for (let i = btns.length-1; i >= 0; i--){
    const b = btns[i];
    g.font = '11.5px ' + FONT;
    const w = g.measureText(b.label).width + 22;
    bx -= w;
    const on = hover && hover.kind==='btn' && hover.id===b.id;
    g.fillStyle = !b.on ? '#161a21' : (on ? '#2a3446' : '#1d232c');
    rr(bx, 16, w, 26, 6); g.fill();
    g.strokeStyle = !b.on ? '#242a33' : (on ? '#5b8ff9' : '#333c48');
    rr(bx, 16, w, 26, 6); g.stroke();
    g.fillStyle = !b.on ? '#454e5b' : (on ? '#dce9ff' : '#a7b3c4');
    g.textAlign='center'; g.fillText(b.label, bx+w/2, 29);
    if (b.on) HIT.btns.push({ x:bx, y:16, w, h:26, id:b.id });
    bx -= 8;
  }
}

/* ------------------------------------------------------------ 流程面板 */
function drawFlowPanel(){
  HIT.flows = []; HIT.chk = null; HIT.stop = null; HIT.panel = null;
  HIT.feats = []; HIT.tabs = []; HIT.featBox = null; HIT.panelToggle = null;
  if (!play && cur() !== 'L1') return;            // 常驻 L1；播放期间跟着走

  const x = 20, y = 116;

  /* ---- 收起态：只留一条竖把手 ---- */
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
    g.fillText(play ? '播放中 · 展开' : '流程 / 功能', 0, 0);
    g.restore();
    g.textAlign = 'left';
    HIT.panelToggle = { x, y, w:PANEL_TAB_W, h:th };
    return;
  }

  const w = PANEL_W;
  const tab = play ? 'flow' : panelTab;           // 播放期间强制显示流程

  // 面板高度：两个 tab 的内容高度不同
  const ROW = 38;
  const stepBox = play ? 62 : 0;
  // 功能列表比视口高，面板高度封顶到可视区，内部滚动
  const featAvail = Math.max(160, VH - 116 - 86);
  const h = tab === 'flow'
    ? 34 + 28 + FLOWS.length*ROW + stepBox + 12
    : 34 + 10 + Math.min(featPanelH(), featAvail) + 12;

  g.fillStyle = 'rgba(14,18,24,.95)'; rr(x, y, w, h, 10); g.fill();
  g.strokeStyle = '#252c37'; g.lineWidth = 1; rr(x, y, w, h, 10); g.stroke();
  HIT.panel = { x, y, w, h };

  // ---- 顶部两个 tab + 折叠按钮 ----
  g.textBaseline = 'middle'; g.textAlign = 'center';
  const CBW = 26;                                          // 折叠按钮
  const TABS = [['flow', '典型场景 · 数据流'], ['feat', 'L1 功能列表 ' + FEATURES.length]];
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

  // 勾选框
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
  g.fillText('自动进入下一层（跟随流程下钻 / 返回）', x+35, cy);
  HIT.chk = { x:x+10, y:cy-11, w:w-20, h:22 };

  // 流程列表
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
    g.font = '10px ' + FONT; g.fillStyle = '#4d5765'; g.textAlign = 'right';
    g.fillText(f.steps.length + ' 步', x+w-16, ry+13);
    g.textAlign = 'left';
    HIT.flows.push({ x:x+8, y:ry, w:w-16, h:ROW-4, i });
    ry += ROW;
  });

  if (!play) return;

  // 当前步骤 + 进度
  const fl = FLOWS[play.fi], st = play.si >= 0 ? fl.steps[play.si] : null;
  const by = ry + 4;
  g.fillStyle = 'rgba(125,211,252,.07)'; rr(x+8, by, w-16, 54, 6); g.fill();

  const prog = play.si >= 0 ? (play.si+1) / fl.steps.length : 0;
  g.fillStyle = 'rgba(255,255,255,.09)'; rr(x+14, by+8, w-28, 3, 1.5); g.fill();
  g.fillStyle = '#7dd3fc'; rr(x+14, by+8, (w-28)*prog, 3, 1.5); g.fill();

  g.font = '10px ' + FONT; g.fillStyle = '#7dd3fc';
  g.fillText(play.si >= 0 ? ('第 ' + (play.si+1) + ' / ' + fl.steps.length + ' 步') : '循环中…', x+14, by+24);
  g.textAlign = 'right';
  const onStop = hover && hover.kind === 'stop';
  g.fillStyle = onStop ? '#ffd0d0' : '#8b96a6';
  g.fillText('■ 停止', x+w-14, by+24);
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

/* ------------------------------------------------- L1 功能列表（左面板 tab 2） */
const FEAT_ROW = 27, FEAT_CAT = 22;

/* 功能按分类折叠成 [分类名, [功能下标…]] 的有序数组 */
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
      // 只有落在可视带内的行才参与命中，否则裁掉的部分也会被点到
      if (ry + FEAT_ROW > y && ry < y + viewH)
        HIT.feats.push({ x:x+8, y:ry, w:w-16, h:FEAT_ROW-3, i });
      ry += FEAT_ROW;
    });
  });

  g.restore();

  // 滚动条：只有内容确实超出时才画
  if (maxScroll > 0){
    const trackH = viewH - 8;
    const thumbH = Math.max(28, trackH * viewH / total);
    const thumbY = y + 4 + (trackH - thumbH) * (featScroll / maxScroll);
    g.fillStyle = 'rgba(255,255,255,.06)'; rr(x+w-7, y+4, 3, trackH, 1.5); g.fill();
    g.fillStyle = 'rgba(125,211,252,.45)'; rr(x+w-7, thumbY, 3, thumbH, 1.5); g.fill();
  }
}

/* ------------------------------------------------- 播放控制器（左下角常驻） */
const RATES = [0.5, 1, 1.5];

/* 磨砂玻璃底板：canvas 没有 backdrop-filter，用「叠层半透 + 顶部高光 + 柔边」模拟 */
function frostedPanel(x, y, w, h, r){
  g.save();
  g.shadowColor = 'rgba(0,0,0,.55)'; g.shadowBlur = 22; g.shadowOffsetY = 6;
  g.fillStyle = 'rgba(22,27,34,.72)';
  rr(x, y, w, h, r); g.fill();
  g.restore();

  g.fillStyle = 'rgba(255,255,255,.055)';          // 玻璃本体
  rr(x, y, w, h, r); g.fill();

  const grd = g.createLinearGradient(0, y, 0, y + h);   // 上亮下暗，像有厚度
  grd.addColorStop(0, 'rgba(255,255,255,.10)');
  grd.addColorStop(0.5, 'rgba(255,255,255,.02)');
  grd.addColorStop(1, 'rgba(255,255,255,.045)');
  g.fillStyle = grd; rr(x, y, w, h, r); g.fill();

  g.strokeStyle = 'rgba(255,255,255,.14)'; g.lineWidth = 1;
  rr(x + .5, y + .5, w - 1, h - 1, r); g.stroke();

  g.strokeStyle = 'rgba(255,255,255,.22)'; g.lineWidth = 1;   // 顶部内高光
  g.beginPath(); g.moveTo(x + r, y + .5); g.lineTo(x + w - r, y + .5); g.stroke();
}

/* 玻璃按钮 */
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

/* 三个传输图标手绘，避免依赖字体里的 ⏮⏯⏭ 字形 */
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
  const x = 20, y = VH - 62 - 14 - h;              // 叠在图例之上
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

  bx += 7;                                          // 分隔线
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

  if (play){                                        // 步进读数
    const fl = FLOWS[play.fi];
    g.textAlign = 'left';
    g.font = '10.5px ' + FONT; g.fillStyle = '#7f8d9f';
    g.fillText((play.si >= 0 ? play.si + 1 : 0) + ' / ' + fl.steps.length, bx + 4, cy + .5);
  }
  g.textAlign = 'left';
}

/* ---------------------------------------------------------------- 图例 */
function drawLegend(d, L){
  const lines = [
    '▸ 滚轮缩放  ▸ F 适应  ▸ E 全展开  ▸ L 切页签 ▸ 悬停端口 → 接口 ▸ 带 ƒ 的端口另字段及含义」 ▸ 每块两个下拉：文件清单 / 内部类·对象   ▸ 悬停带 ‹› 的类名 → 展开仓库里的真实定义代码',
    '▸ 左侧面板：代码流程（点一条播放） ·功能列表（点一条跳到实现模块） ▸ 左下播放器：← → 单步 · 空格 播放/暂停 · 调速  ▸ B 收起/展开侧栏  '
  ];
  g.font = '11px ' + FONT; g.textAlign='left'; g.textBaseline='middle';
  const w = Math.max(g.measureText(lines[0]).width, g.measureText(lines[1]).width) + 24
  g.fillStyle = 'rgba(16,20,26,.92)'; rr(20, VH-62, w, 46, 8); g.fill();
  g.strokeStyle = '#252b35'; g.lineWidth = 1; rr(20, VH-62, w, 46, 8); g.stroke();
  g.fillStyle = '#798598';
  g.fillText(lines[0], 32, VH-48);
  g.fillText(lines[1], 32, VH-30);

  const info = d.blocks.length + ' 个模块 · ' + L.links.length + ' 条信号 · ' +
               d.blocks.filter(b=>b.child).length + ' 个可下钻' +
               (D[cur()].lv===4 ? ' · 已到最底层' : '');
  g.textAlign = 'right'; g.fillStyle = '#5d6878';
  g.fillText(info, VW-24, VH-30);
}

/* ---------------------------------------------------------------- 提示框 */
/* 会弹提示框的悬停种类。drawTip 里每加一个分支，这里必须同步 —— 单一事实来源。 */
const TIP_KINDS = new Set(['port', 'block', 'drawerRow', 'feat']);

function drawTip(){
  let title, sub, rows = [], desc = '', color = '#7dd3fc';
  if (hover.kind === 'port'){
    const pt = hover.p;
    title = pt.n;
    sub = (pt.dir==='in' ? '◀ 输入端口' : '输出端口 ▶') + ' · ' + hover.b.n;
    color = pt.dir==='in' ? '#5eead4' : '#fbbf24';
    rows = [['数据类型', pt.t || '—'], ['长度 / 容量', pt.l || '—'], ['储存表 / 落点', pt.s || '—']];
    if (pt.derived) rows.push(['端口来源', '按上游信号推导']);
    desc = pt.d || '';
  } else if (hover.kind === 'drawerRow'){
    const b = hover.b, dw = b.drawers[hover.di], f = dw.rows[hover.i];
    const meta = f[1] === '' || f[1] === undefined ? '—' : (typeof f[1] === 'number' ? f[1] + ' 行' : String(f[1]));
    if (dw.kind === 'file'){
      const cut = f[0].lastIndexOf('/') + 1;
      title = f[0].slice(cut) || f[0];
      sub = '源文件 · 属于「' + b.n + '」';
      color = '#8fd0ff';
      rows = [['规模', meta], ['所在目录', f[0].slice(0, cut) || '（仓库根）'], ['所属层级', LV_NAME[D[cur()].lv]]];
      desc = f[2] || ('完整路径：' + f[0]);
    } else {
      const cd = codeOf(f);
      title = f[0];
      sub = '内部类 / 对象 · 属于「' + b.n + '」';
      color = '#a78bfa';
      rows = [['种类', meta], ['所属模块', b.n],
              ['定义位置', cd ? cd.f + ':' + cd.l : '（无单一声明点）']];
      desc = f[2] || '';
    }
  } else if (hover.kind === 'feat'){
    const ft = FEATURES[hover.i], cd = D[ft.key.split('/')[0]];
    title = ft.n;
    sub = 'L1 功能 · ' + ft.cat;
    color = '#7dd3fc';
    rows = [['实现模块', ft.key], ['所在图', cd ? cd.title : '—'],
            ['层级', cd ? LV_NAME[cd.lv] : '—']];
    desc = (ft.d || '') + '　（点击跳转到该模块所在的图）';
  } else {
    const b = hover.b;
    const fd = b.drawers.find(x => x.kind === 'file');
    const cd = b.drawers.find(x => x.kind === 'cls');
    title = b.n; sub = b.t || (KIND[b.k]||KIND.comp).tag;
    color = (KIND[b.k]||KIND.comp).s;
    rows = [['输入端口', b.in.length + ' 个'], ['输出端口', b.out.length + ' 个'],
            ['文件', fd ? fd.rows.length + ' 个（点 ▾ 展开）' : '—'],
            ['内部类 / 对象', cd ? cd.rows.length + ' 个（点 ▾ 展开）' : '—'],
            ['下钻', b.child && D[b.child] ? D[b.child].title : '（叶子模块）']];
    desc = b.d || '';
  }

  const ret = (hover.kind === 'port' && hover.p.ret) ? hover.p.ret : null;

  /* 悬停「内部类 / 对象」的一行时，附上它在仓库里的真实定义片段 */
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
  /* 代码块：等宽字体，按可用高度截断 */
  let cw = 0, clines = [], truncated = 0;
  if (code){
    g.font = CODE_FS + 'px ' + MONO;
    cw = g.measureText('M').width;                       // 等宽 → 按字符下标定位即可
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
    g.fillText('ƒ ' + (hover.p.dir === 'in' ? '入参' : '返回') + '字段（' + rlines.length + '）', x+12, yy);
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

    // 来源标注
    g.font = 'italic 9.5px ' + FONT; g.fillStyle = '#6f7f95';
    g.fillText(fit('◱ ' + code.f + ':' + code.l, w-24), x+12, yy);
    yy += 14;

    // 代码底板
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
      g.fillText('… 余 ' + truncated + ' 行，见源文件', x+18, yy+2);
      yy += 14;
    }
  }
}

/* ------------------------------------------------- 代码行着色（等宽 → 按字符下标定位） */
const MONO = 'Consolas,"Cascadia Mono","JetBrains Mono","DejaVu Sans Mono","Courier New",monospace';
const CODE_FS = 11, CODE_LH = 14;
const CODE_COL = { base:'#c3cede', kw:'#7dd3fc', str:'#ffc978', com:'#5c6b7e', num:'#c4b5fd', type:'#8fd0ff' };
const CODE_KW = /\b(?:export|import|from|declare|module|interface|class|abstract|extends|implements|type|const|let|var|function|async|await|return|readonly|public|private|protected|static|new|this|void|null|undefined|true|false|if|else|for|while|switch|case|break|continue|throw|try|catch|finally|typeof|keyof|infer|in|of|as|is|enum|default|yield|get|set|super|never|unknown|string|number|boolean|object|symbol)\b/g;

function drawCodeLine(line, x, y, cw){
  const n = line.length;
  if (!n) return;
  const col = new Array(n).fill(CODE_COL.base);

  const paint = (a, b, c) => { for (let i = Math.max(0,a); i < Math.min(n,b); i++) col[i] = c; };

  // 关键字 / 数字 / 类型名（大写开头）
  let m;
  CODE_KW.lastIndex = 0;
  while ((m = CODE_KW.exec(line))) paint(m.index, m.index + m[0].length, CODE_COL.kw);
  const num = /\b\d[\w.]*\b/g;
  while ((m = num.exec(line))) paint(m.index, m.index + m[0].length, CODE_COL.num);
  const typ = /\b[A-Z][A-Za-z0-9_$]*\b/g;
  while ((m = typ.exec(line))) paint(m.index, m.index + m[0].length, CODE_COL.type);

  // 字符串覆盖前面的着色
  const str = /'[^']*'|"[^"]*"|`[^`]*`/g;
  while ((m = str.exec(line))) paint(m.index, m.index + m[0].length, CODE_COL.str);

  // 注释最优先，整段压过去
  const ci = line.indexOf('//');
  const t = line.trimStart();
  if (t.startsWith('*') || t.startsWith('/*') || t.startsWith('//')) paint(0, n, CODE_COL.com);
  else if (ci >= 0) paint(ci, n, CODE_COL.com);

  // 同色连续段一次画完
  let s = 0;
  for (let i = 1; i <= n; i++){
    if (i === n || col[i] !== col[s]){
      g.fillStyle = col[s];
      g.fillText(line.slice(s, i), x + s*cw, y);
      s = i;
    }
  }
}

/* ---------------------------------------------------------------- 命中 */
/* 点得动的悬停种类 —— 决定光标是不是变成小手 */
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
            // 抽屉体命中即返回：即使这一行是分组头（不可悬停），也要吞掉，
            // 否则滚轮会穿透到画布缩放上去。
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

/* ------------------------------------------------------ 层级切换转场特效 */
/* 上一层：居中放大 + 淡出（用离屏快照）  下一层：在其下方淡入 */
const snapCv = document.createElement('canvas');
const snapG  = snapCv.getContext('2d');
let trans = null;                   // {t0, dur, dir:1 下钻 / -1 返回}

function beginTransition(dir, dur){
  if (!VW || !VH) return;
  snapCv.width = cv.width; snapCv.height = cv.height;
  snapG.clearRect(0, 0, snapCv.width, snapCv.height);
  snapG.drawImage(cv, 0, 0);        // 抓当前帧
  trans = { t0: now(), dur: dur || 420, dir };
}
function drawTransition(){
  const p = Math.min(1, (now() - trans.t0) / trans.dur);
  const e = 1 - Math.pow(1 - p, 3);                     // easeOutCubic
  const k = trans.dir > 0 ? 1 + 0.34*e : 1 - 0.28*e;    // 下钻放大 / 返回缩小
  const w = snapCv.width, h = snapCv.height;
  g.save();
  g.setTransform(1, 0, 0, 1, 0, 0);                     // 快照按设备像素画
  g.globalAlpha = Math.max(0, 1 - e);
  g.translate(w/2, h/2); g.scale(k, k); g.translate(-w/2, -h/2);
  g.drawImage(snapCv, 0, 0);
  g.restore();
  if (p >= 1) trans = null;
}

/* ---------------------------------------------------------------- 导航 */
function go(id){
  if (!D[id]) return;
  stopFlow();                       // 手动导航即停止流程演示
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

/* ---------------------------------------------------------------- 事件 */
cv.addEventListener('mousemove', e => {
  mouse.x = e.clientX; mouse.y = e.clientY; mouse.in = true;
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
  cv.style.cursor = !h ? 'grab'
    : (h.kind === 'drawerRow' || h.kind === 'drawerBody' || h.kind === 'panel') ? 'default'
    : CLICKABLE.has(h.kind) ? 'pointer'
    : ((h.kind === 'block' || h.kind === 'port') && !h.b.child) ? 'default' : 'pointer';
  if (!same || h) requestDraw();
});
cv.addEventListener('mouseleave', () => { mouse.in = false; hover = null; requestDraw(); });

cv.addEventListener('mousedown', e => {
  if (e.button !== 0) return;
  const v = views[cur()];
  drag = { x:e.clientX, y:e.clientY, tx:v.tx, ty:v.ty, moved:false };
  cv.style.cursor = 'grabbing';
});
window.addEventListener('mouseup', e => {
  if (!drag) return;
  const moved = drag.moved; drag = null; cv.style.cursor = 'grab';
  if (moved) return;
  const h = hitTest(e.clientX, e.clientY);
  if (!h) return;
  if (h.kind === 'btn'){
    if (h.id==='back') back();
    else if (h.id==='fit'){ fitView(cur()); requestDraw(); }
    else if (h.id==='top'){ stack = ['L1']; hover=null; requestDraw(); }
  } else if (h.kind === 'crumb'){ jump(h.i); }
  else if (h.kind === 'flow'){ startFlow(h.i); }
  else if (h.kind === 'chk'){ autoDive = !autoDive; requestDraw(); }
  else if (h.kind === 'stop'){ stopFlow(); }
  else if (h.kind === 'panel'){ /* 面板空白，吞掉点击 */ }
  else if (h.kind === 'ctrl'){
    if (h.id === 'prev') stepBy(-1);
    else if (h.id === 'next') stepBy(1);
    else if (h.id === 'play') togglePause();
    else if (h.id.startsWith('rate')) setRate(parseFloat(h.id.slice(4)));
  }
  else if (h.kind === 'panelToggle'){
    panelOpen = !panelOpen;
    fitView(cur());                     // 画布可用宽度变了，重新取景
    hover = null; requestDraw();
  }
  else if (h.kind === 'feat'){ gotoFeature(h.i); }
  else if (h.kind === 'tab'){ panelTab = h.t; hover = null; requestDraw(); }
  else if (h.kind === 'drawer'){ toggleDrawer(h.b, h.di); }
  else if (h.kind === 'drawerRow' || h.kind === 'drawerBody'){ /* 单行只看不跳转 */ }
  else if (h.kind === 'block' && h.b.child) go(h.b.child);
  else if (h.kind === 'port'  && h.b.child) go(h.b.child);
});

function toggleDrawer(b, di){
  const k = b.drawers[di].key;
  if (OPEN.has(k)) OPEN.delete(k); else OPEN.add(k);
  delete LAY[cur()];          // 高度变了，重排本图
  hover = null; requestDraw();
}

/* 点 L1 功能列表的一行：跳到拥有该功能的模块所在的图 */
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

cv.addEventListener('contextmenu', e => { e.preventDefault(); back(); });

cv.addEventListener('wheel', e => {
  e.preventDefault();
  // 光标在功能列表上时滚列表，而不是缩放画布
  if (HIT.featBox && HIT.featBox.maxScroll > 0 && inRect(e.clientX, e.clientY, HIT.featBox)){
    featScroll = Math.max(0, Math.min(HIT.featBox.maxScroll, featScroll + e.deltaY));
    hover = hitTest(e.clientX, e.clientY);
    requestDraw();
    return;
  }
  // 光标在某个展开的抽屉体上时滚抽屉，而不是缩放画布
  const hd = hitTest(e.clientX, e.clientY);
  if (hd && (hd.kind === 'drawerRow' || hd.kind === 'drawerBody')){
    const dw = hd.b.drawers[hd.di], span = dw.rows.length - drawerView(dw);
    if (span > 0){
      // 巨型抽屉（几百条符号的单文件）按 3 行一格要滚上百格 —— Shift 整页跳，Alt 直达两端
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
  views = {};                      // 视口随窗口重算
  trans = null;                    // 快照尺寸已失效，直接取消转场
  requestDraw();
}
window.addEventListener('resize', resize);
resize();
