/**
 * Worked example: archpresent analysing itself with its own toolchain.
 * It doubles as the end-to-end self-check for this workflow — scan → build → verify → smoke all
 * green is what proves the skill actually works.
 *
 * Note the convention used here: every "N files / M lines / K symbols" is written as a
 * {{files}} / {{lines}} / {{exports}} placeholder and filled by build.mjs from what the blockmap
 * actually assigns. Hand-writing those aggregates is the easiest thing to forget after a
 * re-partition, and it gets past every quality gate — placeholders make the drift impossible.
 */
import { p } from './dsl.mjs';

export const DIAGRAMS = [];
const dia = o => DIAGRAMS.push(o);

/* ============================ L1 · system context ============================ */
dia({
  id:'L1', lv:1,
  title:'System context · archpresent (self-hosting example)',
  sub:'{{files}} source files / {{lines}} lines / {{exports}} exported symbols · only the semantic layer is hand-written; every inventory is machine-read — that split is the whole reason the inventories cannot drift',
  colw:266,
  blocks:[
    { id:'CLAUDE', n:'Claude (running the skill)', t:'Person · reads source, writes the semantic layer', k:'person', col:0, row:0,
      d:'The only part of the skill that needs judgment: read the code, work out what the input and output of each module actually carry, then write that as seven data modules. Inventories are not its job — making them its job is what would introduce errors.',
      out:[
        p('semantic layer','diagrams · blockmap · ret · code · flows · features · notes','7 modules','<archDir>/*.mjs','The "why" column of the five-part port is the valuable one: the reason for the constraint and the failure mode, never a restatement of the function name'),
      ],
      in:[
        p('directory summary','{dir, files, lines, exports}[]','one row per directory','stderr','Printed descending by symbol count; this is what the partitioning is designed from — at most 80 symbols per block'),
        p('verification report','pass/fail across 8 assertion classes','every run','stdout','A non-zero exit means the work is not done — not "basically working"'),
      ]},

    { id:'SCAN', n:'scan.mjs', t:'script · read-only inventory extractor', k:'comp', col:1, row:0,
      child:'L2-TOOL',
      d:'Walks the source roots and extracts every exported symbol with its line number, file by file. Supports six families: TS/JS · single-file components (Vue/Svelte) · Python · Go · Rust · JVM. It is the only source of the inventories.',
      in:[ p('repository','<repoRoot> + source roots','one full scan','disk','With no source root given, it probes for src/lib/app/packages…') ],
      out:[ p('inventory','{path, lines, exports:[{name,kind,line}]}[]','per file','<archDir>/inventory.json','It ends by reporting "files with more than 80 symbols" and "unrecognized extensions" — the latter is the only symptom of a whole layer being silently dropped') ]},

    { id:'BUILD', n:'build.mjs', t:'script · assembler', k:'comp', col:2, row:0,
      child:'L2-TOOL',
      d:'Assembles the semantic layer and the inventory into one HTML file. It is also the first quality gate: duplicate file assignment, incomplete coverage, a link or field table pointing at a port that does not exist, and unfillable placeholders all fail here.',
      in:[
        p('semantic layer','7 data modules (diagrams may be split into a diagrams/ directory)','once','<archDir>/*.mjs',''),
        p('inventory','inventory.json','once','<archDir>/inventory.json',''),
      ],
      out:[ p('the map','single-file HTML','once','<outHtml>','Self-contained, zero external dependencies; the data section comes first, the Canvas engine after it') ]},

    { id:'GATE', n:'verify.mjs + smoke.mjs', t:'script · quality gates', k:'risk', col:3, row:0,
      child:'L2-GATE',
      d:'verify does not trust inventory.json; it goes back to the source independently and asserts item by item. smoke runs the engine for real against a stubbed DOM. Both gates must report zero failures.',
      in:[ p('the artifact','HTML','every run','—','The data section between the <script> tag and the engine marker is recovered with vm') ],
      out:[
        p('verification verdict','counts across 8 assertion classes','every run','stdout','MISSING_FILE · LINE_DRIFT · SYMBOL_ABSENT · KIND_MISMATCH · SNIPPET_DRIFT · GROUP_MISMATCH · UNCOVERED_FILE · BROKEN_REF'),
        p('smoke verdict','layout / draw / flows / drill-down','every run','stdout','Every diagram must lay out with finite coordinates and positive height — a NaN layout shows up in a browser as a blank canvas, which is very hard to debug'),
      ]},

    { id:'ENGINE', n:'engine.js', t:'asset · Canvas rendering engine (assets/, not part of the inventory)', k:'lib', col:2, row:1,
      d:'Fully decoupled from the data: the four-level navigation stack, port derivation, drawer viewports and scrolling, flow playback, hit testing, zoom and pan. build concatenates it verbatim after the data section. It lives under assets/, which the scanner\'s directory exclusion list skips, so it appears in no inventory.',
      in:[ p('data section','D · FILES · CLS · RET · CODE · FLOWS · FEATURES','once','—','The engine reads only these seven globals and performs no network or storage access') ],
      out:[ p('picture','Canvas 2D drawing','per frame','—','When a link\'s target input port does not exist, it is synthesized from the source port\'s five fields — which is why an L4 state machine only has to write out') ]},

    { id:'HTML', n:'deliverable', t:'Store · single-file HTML', k:'store', col:4, row:0,
      d:'The skill\'s only output. Double-click to open, read offline, send to someone — and nothing else is produced.',
      in:[ p('assembled result','HTML text','once','<outHtml>','') ],
      out:[ p('interaction','drill · hover · play · zoom','—','—','Click a rectangle to drill in · right-click/Esc to go back · hover a port for its fields · hover an inventory row for the source · wheel inside a drawer to page (Shift = whole page · Alt = jump to either end) · F fit · E expand all · L switch tab') ]},
  ],
  links:[
    { s:['CLAUDE',0], t:['BUILD',0],  l:'semantic layer' },
    { s:['SCAN',0],   t:['BUILD',1],  l:'inventory' },
    { s:['SCAN',0],   t:['CLAUDE',0], l:'directory summary drives partitioning' },
    { s:['ENGINE',0], t:['BUILD',0],  l:'concatenated verbatim' },
    { s:['BUILD',0],  t:['HTML',0],   l:'HTML' },
    { s:['HTML',0],   t:['GATE',0],   l:'under inspection' },
    { s:['GATE',0],   t:['CLAUDE',1], l:'verification report' },
  ],
});

/* ==================== L2 · container · the toolchain ==================== */
dia({
  id:'L2-TOOL', lv:2, parent:'L1',
  title:'Container · toolchain (scripts/ · {{files}} files / {{lines}} lines)',
  sub:'They communicate only through files — any step can be re-run on its own; the one thing two scripts share is the definition of "what counts as a source file"',
  colw:236,
  blocks:[
    { id:'SCAN', n:'scan.mjs', t:'{{lines}} lines · inventory', k:'comp', col:0, row:0,
      d:'A table of top-level declaration matches for six language families, plus kind refinement (use* → hook, capitalised in .tsx → component, ref/computed in an SFC → state/computed). Test files are excluded by naming convention.',
      in:[ p('source roots','directories','full scan','disk','Skips node_modules/dist/test and 40-odd other non-source directories') ],
      out:[ p('inventory.json','{root, roots, totals, dirs, files}','once','<archDir>/','The dirs section aggregates by directory and is what the partitioning is designed from') ]},

    { id:'LANG', n:'lang.mjs', t:'{{lines}} lines · the shared file-set definition', k:'risk', col:1, row:0,
      d:'The only thing scan and verify share. Why only this layer: verify earns its keep by going back to the source independently, so the symbol-extraction regexes must be written separately; but "what counts as a source file" must be identical on both sides — the moment scan knows about .vue and verify does not, UNCOVERED_FILE is vacuous for those files and "full coverage" becomes a lie.',
      out:[ p('file set','SRC_EXT · SKIP_DIR · ROOT_HINTS · isTest · scriptRanges','compile time','—','Editing this changes the reach of both the scan and the check — it is impossible to change only one side') ]},

    { id:'BUILD', n:'build.mjs', t:'{{lines}} lines · assembly', k:'comp', col:2, row:0,
      d:'Ownership resolution (including REST catch-all semantics and a two-pass settlement), parent-block file aggregation, statistics placeholder fill-in, automatic expansion of L4 file-level maps, fresh source-snippet cutting, and reference integrity checks.',
      in:[ p('semantic layer + inventory','*.mjs or diagrams/ shards + inventory.json','once','—','Past a thousand lines, split the diagrams into diagrams/01-l1.mjs, 02-l2.mjs… merged in filename order') ],
      out:[
        p('HTML','single file','once','<outHtml>',''),
        p('build-time failure','duplicate assignment · uncovered · dangling ref · unreplaced placeholder','immediate','stderr','A failure exits non-zero — nothing half-finished is produced'),
      ]},

    { id:'VERIFY', n:'verify.mjs', t:'{{lines}} lines · verification', k:'risk', col:0, row:1,
      d:'Rescans the disk independently, reads the original files independently, and confronts them with the inventories in the HTML item by item.',
      in:[ p('HTML + repository','—','every run','—','') ],
      out:[ p('8 assertion classes','counts + samples','every run','stdout','') ]},

    { id:'SMOKE', n:'smoke.mjs', t:'{{lines}} lines · smoke test', k:'risk', col:1, row:1,
      d:'A minimal DOM + Canvas 2D stub runs the whole script for real, then walks every diagram laying out and drawing it, expands every drawer, scrolls to the end, plays every flow, and drills through four levels and back.',
      in:[ p('HTML','—','every run','—','') ],
      out:[ p('run verdict','diagrams/blocks/drawers/draw calls','every run','stdout','') ]},

    { id:'STATS', n:'stats.mjs', t:'{{lines}} lines · statistics helper', k:'lib', col:2, row:1,
      d:'Counts files/lines/symbols using blockmap\'s own path patterns — for what placeholders cannot reach (the L1 subtitle, cross-diagram totals, comparing candidate partitions), and for the instant check of "how many files did this pattern actually match".',
      in:[ p('patterns','same syntax as blockmap','per call','<archDir>/inventory.json','A pattern matching zero files is flagged explicitly — putting it in blockmap is a coverage hole') ],
      out:[ p('counts','files / lines / symbols','per call','stdout','--top N lists the files with the most symbols, flagging anything over 80 with ⚠') ]},

    { id:'SEMANTIC', n:'semantic layer templates', t:'references/template/ · {{files}} files / {{lines}} lines', k:'note', col:3, row:0,
      child:'L3-TEMPLATE',
      d:'The one part of build\'s input written by a human. Drill in to see what each of the seven modules is responsible for.'},
  ],
  links:[
    { s:['SCAN',0],   t:['BUILD',0],  l:'inventory.json' },
    { s:['LANG',0],   t:['SCAN',0],   l:'file set' },
    { s:['LANG',0],   t:['VERIFY',0], l:'the same file set' },
    { s:['BUILD',0],  t:['VERIFY',0], l:'HTML' },
    { s:['BUILD',0],  t:['SMOKE',0],  l:'HTML' },
    { s:['SCAN',0],   t:['STATS',0],  l:'inventory' },
  ],
});

/* ==================== L2 · container · the quality gates ==================== */
dia({
  id:'L2-GATE', lv:2, parent:'L1',
  title:'Container · quality gates (verify + smoke · {{lines}} lines)',
  sub:'"The inventory is accurate" must not mean two programs from the same source nodding at each other — so the checker reuses not one regex from the extractor',
  colw:262,
  blocks:[
    { id:'REDERIVE', n:'independent rescan', t:'verify.mjs · walk()', k:'risk', col:0, row:0,
      d:'Does not read inventory.json; rescans the disk itself under the same exclusion rules from lang.mjs, to compute reverse coverage.',
      out:[ p('real file set','path[]','every run','—','A file not in the inventory = UNCOVERED_FILE') ]},
    { id:'BACKREF', n:'back to the source, item by item', t:'verify.mjs · linesOf()', k:'risk', col:1, row:0,
      d:'Every symbol is looked up at the file:line it claims: the name really is there, the line really is a declaration, the kind keyword agrees, and the counted line number agrees with the key. For a single-file component it must also fall inside the <script> block — the name appearing in the template does not count.',
      in:[ p('symbol inventory','[name, kind·Lline, note, , file:line]','per item','—','That file:line key in the 5th slot is the anchor for going back to the source, and the reason symbols sharing a name do not collide') ],
      out:[ p('assertion results','4 failure classes','per item','—','') ]},
    { id:'SNIPPET', n:'snippet comparison', t:'verify.mjs · CODE section', k:'risk', col:2, row:0,
      d:'Compares each source snippet line by line against that file\'s corresponding range. The snippets were cut fresh from disk at build time, so this assertion really guards against "the source changed after the HTML was generated".',
      out:[ p('SNIPPET_DRIFT','per line','—','—','') ]},
    { id:'STUB', n:'stubbed run', t:'smoke.mjs · Canvas 2D proxy', k:'comp', col:0, row:1,
      d:'measureText estimates width from character count; every other drawing method just counts calls. Enough for the engine to complete layout and drawing, with no real browser needed.',
      out:[ p('draw call count','number','every run','—','Zero means the engine drew nothing at all — which is itself a failure signal') ]},
    { id:'TRAVERSE', n:'walk every diagram', t:'smoke.mjs · __probe/__drawEvery', k:'comp', col:1, row:1,
      d:'Runs layout() per diagram checking that coordinates are finite and heights positive; then expands every drawer, scrolls the scrollable ones to the end, and redraws.',
      out:[ p('illegal layout','id + reason','—','—','A NaN layout shows up in a browser as a blank canvas and is very hard to debug, so it is caught here') ]},
    { id:'PLAY', n:'flows and drill-down', t:'smoke.mjs · __playAll', k:'comp', col:2, row:1,
      d:'Plays every flow, drills through every level and back, and confirms the navigation stack returns to L1.',
      out:[ p('step count','number','every run','—','') ]},
  ],
  links:[
    { s:['REDERIVE',0], t:['BACKREF',0], l:'real file set' },
    { s:['BACKREF',0],  t:['SNIPPET',0], l:'item by item' },
    { s:['STUB',0],     t:['TRAVERSE',0],l:'drawable' },
    { s:['TRAVERSE',0], t:['PLAY',0],    l:'layout ready' },
  ],
});

/* ==================== L3 · the seven modules of the semantic layer ==================== */
dia({
  id:'L3-TEMPLATE', lv:3, parent:'L2-TOOL',
  title:'Component · semantic layer templates (references/template/ · {{files}} files / {{lines}} lines)',
  sub:'Everything hand-written is these seven modules plus one DSL — all the rest is generated',
  colw:252,
  blocks:[
    { id:'DSL', n:'dsl.mjs', t:'{{lines}} lines · the five-part port', k:'lib', col:0, row:0,
      d:'p(name, dataType, size/capacity, storage/landing, why). Compressing "interface" into five questions you must answer is where this map\'s information density comes from.',
      out:[ p('port constructors','p() · blk()','—','—','Forces an answer to "what data, how much, landing where, and why"') ]},
    { id:'DIA', n:'diagrams.mjs', t:'{{lines}} lines · diagrams, blocks, ports', k:'comp', col:1, row:0,
      d:'The one required module, and the one that takes the time. One L1, one L2 per process, one L3 per directory, one L4 per critical path. Past a thousand lines, split it into diagrams/ shards.',
      out:[ p('DIAGRAMS','array of diagrams','—','—','A diagram declaring autoFiles is expanded automatically into one block per file; {{files}}/{{lines}}/{{exports}} in t/title/sub are filled by build') ]},
    { id:'MAP', n:'blockmap.mjs', t:'{{lines}} lines · directory → files', k:'comp', col:2, row:0,
      d:'The definition of your module boundaries. No duplicate assignment within a diagram, and full repository coverage — build enforces both. It also decides what the placeholders count.',
      out:[ p('BLOCKMAP','block key → path pattern[]','—','—','The REST: prefix is for the catch-all block, so "whatever is left" never has to be listed file by file') ]},
    { id:'RET', n:'ret.mjs', t:'{{lines}} lines · interface field tables', k:'comp', col:3, row:0,
      d:'When a port is a structured message, expand its fields here. Visible on hover.',
      out:[ p('RET_TABLES','port key → [field,type,meaning][]','—','—','Only attaches to ports that really exist; for an input port synthesized by a link, attach the table to the source block\'s out:N') ]},
    { id:'CODE', n:'code.mjs', t:'{{lines}} lines · source snippet picks', k:'comp', col:0, row:1,
      d:'You only say which symbol to show; build cuts the snippet fresh from disk. Picking symbols whose comments already are the design documentation works best.',
      out:[ p('CODE_PICKS','[path, symbol, lines][]','—','—','You cannot get the source wrong here — only the path or symbol name, and that fails at build time, listing the candidate symbols in that file') ]},
    { id:'FLOW', n:'flows.mjs', t:'{{lines}} lines · representative scenarios', k:'comp', col:1, row:1,
      d:'One real path across levels. Playback projects it onto the current level, so the same flow reads at a different granularity at L1 than at L4.',
      out:[ p('FLOWS','{name, from, role, steps}[]','—','—','`from` names the source of the facts so a reader can go and check them') ]},
    { id:'FEAT', n:'features.mjs', t:'{{lines}} lines · capability list', k:'comp', col:2, row:1,
      d:'Capabilities categorised the way a user thinks; click one to jump to the module that implements it.',
      out:[ p('FEATURES','{n, cat, key, d}[]','—','—','`d` says what is non-obvious, never a restatement of the capability name') ]},
    { id:'NOTE', n:'notes.mjs', t:'{{lines}} lines · per-item annotations', k:'note', col:3, row:1,
      d:'Optional. Write them only for the files and symbols worth explaining.',
      out:[ p('FILE_NOTES / SYM_NOTES','key → one line','—','—','') ]},
    { id:'ALLFILES', n:'file-by-file view', t:'scripts/ + template/ · {{files}} files', k:'note', col:0, row:2,
      child:'L4-FILES',
      d:'The same thing from another angle: one rectangle = one file, drawer = all of that file\'s exported symbols with their real line numbers.'},
  ],
  links:[
    { s:['DSL',0], t:['DIA',0],  l:'port constructor' },
    { s:['DIA',0], t:['MAP',0],  l:'block keys' },
    { s:['MAP',0], t:['CODE',0], l:'file scope' },
    { s:['DIA',0], t:['RET',0],  l:'port indices' },
    { s:['DIA',0], t:['FLOW',0], l:'block keys' },
    { s:['DIA',0], t:['FEAT',0], l:'block keys' },
    { s:['MAP',0], t:['NOTE',0], l:'paths' },
  ],
});

/* ==================== L4 · file-level module map ==================== */
dia({
  id:'L4-FILES', lv:4, parent:'L3-TEMPLATE',
  title:'Files · all {{files}} source files, file by file (one rectangle = one file, drawer = all of its exported symbols)',
  sub:'Descending by export count — this is the **file** level of "directory > file > class", fully expanded',
  colw:222, autoCols:4,
  autoFiles:['scripts/*', 'references/template/*'],
});
