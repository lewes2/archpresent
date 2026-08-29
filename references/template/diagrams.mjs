/**
 * REQUIRED — Diagram definitions — the hand-written semantic layer.
 *
 * Every rectangle is one "directory" (L2/L3) or one "file" (an L4 file-level module map).
 * The file inventory and the class/object/function inventory are attached automatically by
 * build.mjs from inventory.json — **never write them by hand**. Write only what a person can
 * write: what this module is, and what the data flowing in and out of it actually contains.
 *
 * When this file gets long, split it into a `diagrams/` directory: 01-l1.mjs, 02-l2.mjs, 03-l3.mjs…
 * Each shard does its own `export const DIAGRAMS = []`, and build.mjs merges them in filename order.
 * Past roughly a thousand lines you should split — at two or three thousand, every edit means
 * scrolling forever to find the spot.
 *
 * Diagram fields:
 *   id      unique id, e.g. 'L1' / 'L2-MAIN' / 'L3-PTY' / 'L4-PTYFLOW'
 *   lv      1|2|3|4 — the four C4 levels
 *   parent  id of the parent diagram (omit for L1); this drives the breadcrumb
 *   title   diagram title (the L1 title also becomes the HTML <title>)
 *   sub     one subtitle line: "the one thing this diagram is really about", never a restatement
 *   colw    column width, default 262; drop to 210–250 when there are many blocks
 *   blocks  array of rectangles
 *   links   array of links { s:[blockId, outPortIndex], t:[blockId, inPortIndex], l:'label' }
 *           If the target block has no input port at that index, the engine synthesizes one from
 *           the source port's five fields — that is exactly how an L4 state machine gets away with
 *           writing only `out`. The only thing that MUST exist is the **source** port.
 *   autoFiles / autoCols   for L4 file-level maps only: give path patterns, get one block per file
 *
 * Rectangle fields:
 *   id n t k col row  —  id, name, subtitle (real path + real size), kind, column, row
 *   child  id of the diagram to drill into
 *   d      the hover description. Write "why it is like this", not "what it does"
 *   in/out arrays of ports, built with p(name, dataType, size/capacity, storage/landing, why)
 *
 * NEVER hand-compute statistics: use placeholders.
 *   Write {{files}} {{lines}} {{exports}} inside t / d / title / sub and build.mjs fills them from
 *   the files that rectangle (or the whole diagram) actually owns in the blockmap:
 *       t:'routes/ · {{files}} files / {{lines}} lines'
 *       t:'session-manager.ts · {{lines}} lines · {{exports}} exports'
 *   Typing "12 files / 4327 lines" is the single easiest thing to forget to update after you adjust
 *   the partitioning, and it gets past every quality gate (the assertions check the inventories, not
 *   the numbers in your titles). Placeholders make that drift impossible.
 *   For what placeholders cannot reach (cross-diagram totals, the L1 subtitle) use
 *   `node scripts/stats.mjs <workDir> <patterns>`.
 *   Note: for a block with a `child`, the placeholders count **all files aggregated from the child
 *   diagram** — so if the block's name refers to a single file (it is called "scan.mjs" but drills
 *   into the whole toolchain), do not use placeholders on it.
 *
 * Values of `k` and what they mean. Colour is bound to meaning; do not pick at random:
 *   person a person / role            ext    external system (third-party service, SDK, platform)
 *   extc   external process or device (a pty, a child process, hardware)
 *   app    your own process / core subsystem (the loudest one — save it for the real protagonist)
 *   comp   an ordinary component or module      lib  a stateless library, utility or pure-function layer
 *   code   a code-level step (each step of an L4 state machine)
 *   store  a data landing place (database, table, file, cache)
 *   risk   a risk: global mutable state, a concurrency trap, an oversized file, a platform-specific weakening
 *   note   a view entry point or an explanatory box (not part of the main path)
 *
 * The five-part port is the core output of this map. The rules:
 *   - name       natural language, written for a human
 *   - dataType   a **real identifier**, e.g. RpcRequest{id,method,params,token?} — never "an object"
 *   - size       the real constraint: "≤50 concurrent · 200 req/s", "ring 1024 · ≤256 per call";
 *                if there genuinely is none, write "per call"
 *   - storage    the real landing place: '~/.wmux/sessions.json', '\\\\.\\pipe\\wmux-<user>'; '—' if none
 *   - why        the most valuable column: the reason for the constraint and the failure mode
 *
 * Side by side (the same port, bad → good):
 *   ✗ p('request','a request object','some','the database','handles the user request')
 *   ✓ p('inbound request','{clientId, cwd?, worktree?}','many sessionIds per clientId',
 *       'session_skill_policies table','The skill policy is fixed at session creation and persisted;
 *        changing skills therefore requires destroying and recreating the session object')
 */
import { p } from './dsl.mjs';

export const DIAGRAMS = [];
const dia = o => DIAGRAMS.push(o);

/* ============================ L1 · system context ============================ */
dia({
  id:'L1', lv:1,
  title:'System context · <project> (<version>)',
  sub:'<one line naming this system\'s organising principle> · {{files}} source files / {{lines}} lines / {{exports}} exported symbols',
  colw:268,
  blocks:[
    { id:'USER', n:'Operator', t:'Person · <how they arrive>', k:'person', col:0, row:0,
      d:'<which routes people take into this system, and which decisions only a person can make>',
      out:[ p('<input>','<real type>','<capacity>','<landing>','<why>') ],
      in:[  p('<feedback>','<real type>','<frequency>','—','<why>') ]},

    { id:'CORE', n:'<core process/service>', t:'<directory> · {{files}} files / {{lines}} lines', k:'app', col:1, row:0,
      child:'L2-CORE',
      d:'<what makes it the core — which resource or privilege it owns exclusively>',
      in:[  p('<inbound>','<real type>','<rate limit / capacity>','<transport endpoint>','<reason for the constraint>') ],
      out:[ p('<outbound>','<real type>','<frequency>','<landing>','<failure mode>') ]},

    { id:'STORE', n:'<data plane>', t:'Store · <format>', k:'store', col:2, row:0,
      d:'<where the facts shared across processes live>',
      in:[  p('write','<structure>','<atomicity>','<path>','<power-loss semantics>') ],
      out:[ p('read back','<structure>','on demand','<path>','<recovery semantics>') ]},

    { id:'EXT', n:'<external dependency>', t:'External · <protocol>', k:'ext', col:3, row:0,
      d:'<where the boundary is and what it degrades to on failure>',
      in:[  p('outbound request','<protocol>','per call','—','<where the credentials come from>') ],
      out:[ p('response','<structure>','per call','—','<timeout / error handling>') ]},
  ],
  links:[
    { s:['USER',0], t:['CORE',0],  l:'<payload>' },
    { s:['CORE',0], t:['STORE',0], l:'<payload>' },
    { s:['CORE',0], t:['EXT',0],   l:'<payload>' },
  ],
});

/* ==================== L2 · container (one per `app` block in L1) ==================== */
dia({
  id:'L2-CORE', lv:2, parent:'L1',
  title:'Container · <core process> (<directory> · {{files}} files / {{lines}} lines)',
  sub:'<the layering principle inside this process>',
  colw:256,
  blocks:[
    { id:'SUB1', n:'<subsystem>', t:'<subdirectory>/ · {{files}} files / {{lines}} lines', k:'comp', col:0, row:0,
      child:'L3-SUB1',
      d:'<the boundary of its responsibility>',
      in:[  p('<inbound>','<type>','<capacity>','<landing>','<why>') ],
      out:[ p('<outbound>','<type>','<frequency>','<landing>','<why>') ]},
  ],
  links:[],
});

/* ==================== L3 · component (one diagram = one directory) ==================== */
dia({
  id:'L3-SUB1', lv:3, parent:'L2-CORE',
  title:'Component · <subsystem> (<directory> · {{files}} files / {{lines}} lines)',
  sub:'<the shared reason this group exists>',
  colw:258,
  blocks:[
    { id:'A', n:'<module>', t:'<filename> · {{lines}} lines · {{exports}} exports', k:'comp', col:0, row:0,
      d:'<the design trade-off>',
      in:[  p('<inbound>','<type>','<capacity>','<landing>','<why>') ],
      out:[ p('<outbound>','<type>','<frequency>','<landing>','<why>') ]},
  ],
  links:[],
});

/* ==================== L4 · code-level state machine (one real end-to-end path) ==================== */
dia({
  id:'L4-FLOW1', lv:4, parent:'L3-SUB1',
  title:'Code · <one end-to-end path>',
  sub:'<why the order of the steps on this path cannot be changed>',
  colw:254,
  blocks:[
    { id:'S1', n:'<step>', t:'<file> · <function or line>', k:'code', col:0, row:0,
      d:'<what this step is defending against>',
      out:[ p('<produces>','<type>','<frequency>','<landing>','<why>') ]},
  ],
  links:[],
});

/* ==================== L4 · file-level module map (one oversized directory, file by file) ==================== */
dia({
  id:'L4-FILES-SUB1', lv:4, parent:'L3-SUB1',
  title:'Files · <directory>, file by file (one rectangle = one file, drawer = all of its exported symbols)',
  sub:'Descending by export count — this is the **file** level of "directory > file > class", fully expanded',
  colw:214, autoCols:6,
  autoFiles:['<directory>/*'],     // supports dir/* · dir/** · exact paths
});
