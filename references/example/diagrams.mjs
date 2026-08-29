/**
 * 参考示例：architecture-viz 用自己的工具链分析自己。
 * 它同时是这套流程的端到端自检 —— scan → build → verify → smoke 全绿才说明技能可用。
 *
 * 注意这里的写法：凡是「N 文件 / M 行 / K 符号」一律用 {{files}} / {{lines}} / {{exports}}
 * 占位符，由 build.mjs 按 blockmap 的实际归属填。手写这类聚合数字是最容易在改完分块后
 * 忘记同步的一处，而且它骗得过全部质量门 —— 占位符让它不可能漂。
 */
import { p } from './dsl.mjs';

export const DIAGRAMS = [];
const dia = o => DIAGRAMS.push(o);

/* ============================ L1 · 系统上下文 ============================ */
dia({
  id:'L1', lv:1,
  title:'系统上下文 · architecture-viz（技能自举示例）',
  sub:'{{files}} 个源文件 / {{lines}} 行 / {{exports}} 个导出符号 · 手写的只有语义层，清单一律机读 —— 这条分工是「清单不会漂」的全部理由',
  colw:266,
  blocks:[
    { id:'CLAUDE', n:'Claude（技能执行者）', t:'Person · 读源码、写语义层', k:'person', col:0, row:0,
      d:'技能里唯一需要判断力的部分：读代码，想清楚每个模块的输入输出到底装着什么，然后写成 7 个数据模块。清单不归它管 —— 归它管就会出错。',
      out:[
        p('语义层','diagrams · blockmap · ret · code · flows · features · notes','7 个模块','<archDir>/*.mjs','端口五元组里「说明」那一栏最值钱：写约束的理由与失效模式，而不是复述函数名'),
      ],
      in:[
        p('目录汇总','{dir, files, lines, exports}[]','每目录一行','stderr','按符号数降序打印，据此决定怎么分块 —— 每块 ≤80 个符号'),
        p('核对报告','8 类断言的通过/失败','每次运行','stdout','非 0 失败就是没做完，不是「基本可用」'),
      ]},

    { id:'SCAN', n:'scan.mjs', t:'脚本 · 只读代码清点器', k:'comp', col:1, row:0,
      child:'L2-TOOL',
      d:'遍历源码根，逐文件抽出导出符号与行号。支持 TS/JS · 单文件组件（Vue/Svelte）· Python · Go · Rust · JVM 六族。它是清单的唯一来源。',
      in:[ p('仓库','<repoRoot> + 源码根','单次全扫','磁盘','不给源码根时按 src/lib/app/packages… 自动探测') ],
      out:[ p('清单','{path, lines, exports:[{name,kind,line}]}[]','逐文件','<archDir>/inventory.json','结尾会报「符号数 > 80 的文件」与「未识别扩展名」—— 后者正是「整层被静默漏掉」的唯一征兆') ]},

    { id:'BUILD', n:'build.mjs', t:'脚本 · 装配器', k:'comp', col:2, row:0,
      child:'L2-TOOL',
      d:'把语义层与清单装配成单文件 HTML。它同时是第一道质量门：文件重复归属、覆盖不全、连线或字段表指向不存在的端口、占位符填不上，都在这里失败。',
      in:[
        p('语义层','7 个数据模块（diagrams 可拆成 diagrams/ 目录分片）','单次','<archDir>/*.mjs',''),
        p('清单','inventory.json','单次','<archDir>/inventory.json',''),
      ],
      out:[ p('可视化','单文件 HTML','一次','<outHtml>','自包含、零外部依赖；数据段在前，Canvas 引擎在后') ]},

    { id:'GATE', n:'verify.mjs + smoke.mjs', t:'脚本 · 质量门', k:'risk', col:3, row:0,
      child:'L2-GATE',
      d:'verify 不信任 inventory.json，独立回源逐条断言；smoke 用桩化 DOM 把引擎真跑一遍。两道门都必须 0 失败。',
      in:[ p('生成物','HTML','每次','—','从 <script> 到引擎标记之间的数据段被 vm 取回') ],
      out:[
        p('核对结论','8 类断言计数','每次','stdout','MISSING_FILE · LINE_DRIFT · SYMBOL_ABSENT · KIND_MISMATCH · SNIPPET_DRIFT · GROUP_MISMATCH · UNCOVERED_FILE · BROKEN_REF'),
        p('冒烟结论','布局/绘制/流程/下钻','每次','stdout','逐图布局要求坐标有限且高度为正 —— NaN 布局在浏览器里表现为「空白画布」，很难查'),
      ]},

    { id:'ENGINE', n:'engine.js', t:'资源 · Canvas 渲染引擎（assets/，不参与清点）', k:'lib', col:2, row:1,
      d:'与数据完全解耦：四层导航栈、端口推导、抽屉视窗与滚动、流程播放、命中测试、缩放平移。build 把它原样拼到数据段之后。它在 assets/ 下，被扫描器的目录排除表跳过，所以不出现在任何清单里。',
      in:[ p('数据段','D · FILES · CLS · RET · CODE · FLOWS · FEATURES','一次','—','引擎只读这七个全局量，不做任何网络或存储访问') ],
      out:[ p('画面','Canvas 2D 绘制','逐帧','—','连线的目标输入端口若不存在会用源端口五元组自动合成 —— L4 状态机因此只需写 out') ]},

    { id:'HTML', n:'交付物', t:'Store · 单文件 HTML', k:'store', col:4, row:0,
      d:'技能的唯一输出。可双击打开、可离线看、可直接发给别人 —— 不产生任何其他文件。',
      in:[ p('装配结果','HTML 文本','一次','<outHtml>','') ],
      out:[ p('交互','下钻 · 悬停 · 播放 · 缩放','—','—','点矩形下钻 · 右键/Esc 返回 · 悬停端口看字段 · 悬停清单行看源码 · 抽屉内滚轮翻页（Shift 整页 · Alt 直达两端）· F 适应窗口 · E 全展开 · L 切页签') ]},
  ],
  links:[
    { s:['CLAUDE',0], t:['BUILD',0],  l:'语义层' },
    { s:['SCAN',0],   t:['BUILD',1],  l:'清单' },
    { s:['SCAN',0],   t:['CLAUDE',0], l:'目录汇总供分块' },
    { s:['ENGINE',0], t:['BUILD',0],  l:'原样拼接' },
    { s:['BUILD',0],  t:['HTML',0],   l:'HTML' },
    { s:['HTML',0],   t:['GATE',0],   l:'受检' },
    { s:['GATE',0],   t:['CLAUDE',1], l:'核对报告' },
  ],
});

/* ==================== L2 · 容器图 · 工具链 ==================== */
dia({
  id:'L2-TOOL', lv:2, parent:'L1',
  title:'容器 · 工具链（scripts/ · {{files}} 文件 / {{lines}} 行）',
  sub:'彼此只通过文件通信 —— 任何一步都能单独重跑；唯一被两个脚本共享的是「哪些文件算源文件」',
  colw:236,
  blocks:[
    { id:'SCAN', n:'scan.mjs', t:'{{lines}} 行 · 清点', k:'comp', col:0, row:0,
      d:'六族语言的顶层声明匹配表 + 种类精化（use* → hook，.tsx 里大写开头 → component，SFC 里 ref/computed → state/computed）。测试文件按命名约定排除。',
      in:[ p('源码根','目录','全扫','磁盘','跳过 node_modules/dist/test 等 40 余种非源码目录') ],
      out:[ p('inventory.json','{root, roots, totals, dirs, files}','一次','<archDir>/','dirs 段按目录汇总，是分块设计的依据') ]},

    { id:'LANG', n:'lang.mjs', t:'{{lines}} 行 · 共享的文件集合定义', k:'risk', col:1, row:0,
      d:'scan 与 verify 唯一共享的东西。为什么只共享这一层：verify 的价值在于独立回源，符号抽取的正则必须各写各的；但「哪些文件算源文件」必须两边一致 —— 一旦 scan 认识 .vue 而 verify 不认识，UNCOVERED_FILE 对这类文件就形同虚设，「全覆盖」会是一句假话。',
      out:[ p('文件集合','SRC_EXT · SKIP_DIR · ROOT_HINTS · isTest · scriptRanges','编译期','—','改这里 = 同时改扫描与核对的覆盖面，不可能只改一边') ]},

    { id:'BUILD', n:'build.mjs', t:'{{lines}} 行 · 装配', k:'comp', col:2, row:0,
      d:'归属结算（含 REST 收尾语义与两趟结算）、父块文件聚合、统计占位符回填、L4 文件级图自动摊开、源码片段现切、引用完整性检查。',
      in:[ p('语义层 + 清单','*.mjs 或 diagrams/ 分片 + inventory.json','一次','—','图定义超过千行时拆成 diagrams/01-l1.mjs、02-l2.mjs… 按文件名排序合并') ],
      out:[
        p('HTML','单文件','一次','<outHtml>',''),
        p('构建期失败','重复归属 · 未覆盖 · 断链 · 占位符未替换','即时','stderr','失败即非 0 退出 —— 不产出半成品'),
      ]},

    { id:'VERIFY', n:'verify.mjs', t:'{{lines}} 行 · 核对', k:'risk', col:0, row:1,
      d:'独立重扫磁盘、独立读原文件，与 HTML 里的清单逐条对质。',
      in:[ p('HTML + 仓库','—','每次','—','') ],
      out:[ p('8 类断言','计数 + 样本','每次','stdout','') ]},

    { id:'SMOKE', n:'smoke.mjs', t:'{{lines}} 行 · 冒烟', k:'risk', col:1, row:1,
      d:'最小 DOM + Canvas 2D 桩，把整份脚本真跑一遍，再遍历全部图布局绘制、展开全部抽屉、滚到底、播放全部流程、四层下钻返回。',
      in:[ p('HTML','—','每次','—','') ],
      out:[ p('运行结论','图数/块数/抽屉数/绘制调用数','每次','stdout','') ]},

    { id:'STATS', n:'stats.mjs', t:'{{lines}} 行 · 统计助手', k:'lib', col:2, row:1,
      d:'按 blockmap 同款路径模式统计文件/行/符号，用于占位符覆盖不到的地方（L1 副标题、跨图总量、分块方案比选），以及「这个模式到底命中了几个文件」的即时校验。',
      in:[ p('模式','与 blockmap 同款语法','逐次','<archDir>/inventory.json','命中 0 个会明确告警 —— 写进 blockmap 就是一次漏覆盖') ],
      out:[ p('统计','文件数 / 行数 / 符号数','逐次','stdout','--top N 列出符号数最大的文件，> 80 的打 ⚠') ]},

    { id:'SEMANTIC', n:'语义层模板', t:'references/template/ · {{files}} 文件 / {{lines}} 行', k:'note', col:3, row:0,
      child:'L3-TEMPLATE',
      d:'build 的输入里唯一由人手写的那部分。点进去看这七个模块各自负责什么。'},
  ],
  links:[
    { s:['SCAN',0],   t:['BUILD',0],  l:'inventory.json' },
    { s:['LANG',0],   t:['SCAN',0],   l:'文件集合' },
    { s:['LANG',0],   t:['VERIFY',0], l:'同一套文件集合' },
    { s:['BUILD',0],  t:['VERIFY',0], l:'HTML' },
    { s:['BUILD',0],  t:['SMOKE',0],  l:'HTML' },
    { s:['SCAN',0],   t:['STATS',0],  l:'清单' },
  ],
});

/* ==================== L2 · 容器图 · 质量门 ==================== */
dia({
  id:'L2-GATE', lv:2, parent:'L1',
  title:'容器 · 质量门（verify + smoke · {{lines}} 行）',
  sub:'「清单准确」不能是两个同源程序互相点头 —— 所以核对器不复用抽取器的任何一条正则',
  colw:262,
  blocks:[
    { id:'REDERIVE', n:'独立重扫', t:'verify.mjs · walk()', k:'risk', col:0, row:0,
      d:'不读 inventory.json，自己按 lang.mjs 的同一套排除规则重扫一遍磁盘，用来算反向覆盖率。',
      out:[ p('真实文件集','path[]','每次','—','清单里没有的文件 = UNCOVERED_FILE') ]},
    { id:'BACKREF', n:'逐条回源', t:'verify.mjs · linesOf()', k:'risk', col:1, row:0,
      d:'每个符号都去它声称的 文件:行号 上读那一行，确认名字真的在、确实是声明行、种类关键字对得上、计量行号与键行号自洽。单文件组件还要求那一行落在 <script> 块内 —— 名字出现在模板里不算数。',
      in:[ p('符号清单','[name, kind·L行号, 说明, , 文件:行号]','逐条','—','第 5 位那个 文件:行号 键是回源的锚点，也是同名符号不撞车的原因') ],
      out:[ p('断言结果','4 类失败','逐条','—','') ]},
    { id:'SNIPPET', n:'片段比对', t:'verify.mjs · CODE 段', k:'risk', col:2, row:0,
      d:'源码片段与该文件对应行区间逐行比对。片段本来就是构建时从磁盘现切的，所以这一条实际是在防「HTML 生成后源码又改了」。',
      out:[ p('SNIPPET_DRIFT','逐行','—','—','') ]},
    { id:'STUB', n:'桩化运行', t:'smoke.mjs · Canvas 2D 代理', k:'comp', col:0, row:1,
      d:'measureText 按字符数估宽，其余绘制方法计数。够引擎跑完布局与绘制，不需要真浏览器。',
      out:[ p('绘制调用数','number','每次','—','为 0 说明引擎根本没画 —— 这本身就是失败信号') ]},
    { id:'TRAVERSE', n:'全图遍历', t:'smoke.mjs · __probe/__drawEvery', k:'comp', col:1, row:1,
      d:'逐图 layout() 检查坐标有限、高度为正；再展开全部抽屉、把可滚动的滚到底，重绘一遍。',
      out:[ p('非法布局','id + 原因','—','—','NaN 布局在浏览器里表现为空白画布，很难查，所以在这里拦') ]},
    { id:'PLAY', n:'流程与下钻', t:'smoke.mjs · __playAll', k:'comp', col:2, row:1,
      d:'逐条播放流程、逐层下钻再返回，确认导航栈能回到 L1。',
      out:[ p('步数','number','每次','—','') ]},
  ],
  links:[
    { s:['REDERIVE',0], t:['BACKREF',0], l:'真实文件集' },
    { s:['BACKREF',0],  t:['SNIPPET',0], l:'逐条' },
    { s:['STUB',0],     t:['TRAVERSE',0],l:'可绘制' },
    { s:['TRAVERSE',0], t:['PLAY',0],    l:'布局就绪' },
  ],
});

/* ==================== L3 · 语义层的七个模块 ==================== */
dia({
  id:'L3-TEMPLATE', lv:3, parent:'L2-TOOL',
  title:'组件 · 语义层模板（references/template/ · {{files}} 文件 / {{lines}} 行）',
  sub:'手写的全部内容就是这七个模块加一个 DSL —— 其余一切都是生成的',
  colw:252,
  blocks:[
    { id:'DSL', n:'dsl.mjs', t:'{{lines}} 行 · 端口五元组', k:'lib', col:0, row:0,
      d:'p(名称, 数据类型, 长度/容量, 储存表/落点, 说明)。把「接口」压成五个必须回答的问题，是这套图谱信息密度的来源。',
      out:[ p('端口构造器','p() · blk()','—','—','强制回答「装的什么数据、多大、落到哪、为什么」') ]},
    { id:'DIA', n:'diagrams.mjs', t:'{{lines}} 行 · 图与块与端口', k:'comp', col:1, row:0,
      d:'唯一必填且最花时间的模块。L1 一张、L2 每个进程一张、L3 每个目录一张、L4 关键链路各一张。超过千行就拆成 diagrams/ 目录分片。',
      out:[ p('DIAGRAMS','图数组','—','—','autoFiles 声明的图会被自动摊开成一文件一块；t/title/sub 里的 {{files}}/{{lines}}/{{exports}} 由 build 回填') ]},
    { id:'MAP', n:'blockmap.mjs', t:'{{lines}} 行 · 目录 → 文件', k:'comp', col:2, row:0,
      d:'模块划分的边界定义。同图内不许重复归属，全仓必须全覆盖 —— 两条都由 build 强制。它同时决定了占位符统计的口径。',
      out:[ p('BLOCKMAP','块键 → 路径模式[]','—','—','REST: 前缀留给收尾块，避免为了「剩下那些」逐个列文件') ]},
    { id:'RET', n:'ret.mjs', t:'{{lines}} 行 · 接口字段表', k:'comp', col:3, row:0,
      d:'端口若是结构化报文，在这里展开它的字段。悬停端口即见。',
      out:[ p('RET_TABLES','端口键 → [字段,类型,含义][]','—','—','只能挂到真实存在的端口上；被连线自动合成的输入端口要把表挂到源块的 out:N') ]},
    { id:'CODE', n:'code.mjs', t:'{{lines}} 行 · 源码片段选择', k:'comp', col:0, row:1,
      d:'只写「要看哪个符号」，片段由 build 从磁盘现切。挑注释本身就是设计说明的那些，效果最好。',
      out:[ p('CODE_PICKS','[路径, 符号, 行数][]','—','—','写不错源码 —— 写错的只可能是路径或符号名，构建时会报错并列出该文件的候选符号') ]},
    { id:'FLOW', n:'flows.mjs', t:'{{lines}} 行 · 典型场景', k:'comp', col:1, row:1,
      d:'跨层的一条真实链路。播放时按当前层级投影，所以同一条流程在 L1 和 L4 看到的粒度不同。',
      out:[ p('FLOWS','{name, from, role, steps}[]','—','—','from 写事实来源，让读者能自己去核') ]},
    { id:'FEAT', n:'features.mjs', t:'{{lines}} 行 · 功能列表', k:'comp', col:2, row:1,
      d:'按用户心智分类的能力清单，点一条跳到实现它的模块。',
      out:[ p('FEATURES','{n, cat, key, d}[]','—','—','d 写「非显然之处」，不要复述功能名') ]},
    { id:'NOTE', n:'notes.mjs', t:'{{lines}} 行 · 逐条注释', k:'note', col:3, row:1,
      d:'可选。只给值得解释的文件与符号写。',
      out:[ p('FILE_NOTES / SYM_NOTES','键 → 一句话','—','—','') ]},
    { id:'ALLFILES', n:'逐文件视图', t:'scripts/ + template/ · {{files}} 文件', k:'note', col:0, row:2,
      child:'L4-FILES',
      d:'换个角度：一个矩形 = 一个文件，抽屉 = 该文件的全部导出符号与真实行号。'},
  ],
  links:[
    { s:['DSL',0], t:['DIA',0],  l:'端口构造' },
    { s:['DIA',0], t:['MAP',0],  l:'块键' },
    { s:['MAP',0], t:['CODE',0], l:'文件范围' },
    { s:['DIA',0], t:['RET',0],  l:'端口下标' },
    { s:['DIA',0], t:['FLOW',0], l:'块键' },
    { s:['DIA',0], t:['FEAT',0], l:'块键' },
    { s:['MAP',0], t:['NOTE',0], l:'路径' },
  ],
});

/* ==================== L4 · 文件级模块图 ==================== */
dia({
  id:'L4-FILES', lv:4, parent:'L3-TEMPLATE',
  title:'文件 · 全部 {{files}} 个源文件逐文件（一个矩形 = 一个文件，抽屉 = 该文件的全部导出符号）',
  sub:'按导出数量降序 —— 这是「目录 > 文件 > 类」里 **文件** 那一级的完整展开',
  colw:222, autoCols:4,
  autoFiles:['scripts/*', 'references/template/*'],
});
