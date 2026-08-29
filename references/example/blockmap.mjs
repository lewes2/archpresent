export const BLOCKMAP = {
  /* L2 · 工具链 —— 一个脚本一个块 */
  'L2-TOOL/SCAN':   ['scripts/scan.mjs'],
  'L2-TOOL/LANG':   ['scripts/lang.mjs'],
  'L2-TOOL/BUILD':  ['scripts/build.mjs'],
  'L2-TOOL/VERIFY': ['scripts/verify.mjs'],
  'L2-TOOL/SMOKE':  ['scripts/smoke.mjs'],
  'L2-TOOL/STATS':  ['scripts/stats.mjs'],
  /* SEMANTIC 有 child，文件清单由 build 从 L3-TEMPLATE 聚合，这里不用写 */

  /* L2 · 质量门 —— 两个脚本按职责再切；同图内一个文件只能属于一个矩形 */
  'L2-GATE/BACKREF':  ['scripts/verify.mjs'],
  'L2-GATE/TRAVERSE': ['scripts/smoke.mjs'],

  /* L3 · 语义层模板 —— 一个模块一个块 */
  'L3-TEMPLATE/DSL':  ['references/template/dsl.mjs'],
  'L3-TEMPLATE/DIA':  ['references/template/diagrams.mjs'],
  'L3-TEMPLATE/MAP':  ['references/template/blockmap.mjs'],
  'L3-TEMPLATE/RET':  ['references/template/ret.mjs'],
  'L3-TEMPLATE/CODE': ['references/template/code.mjs'],
  'L3-TEMPLATE/FLOW': ['references/template/flows.mjs'],
  'L3-TEMPLATE/FEAT': ['references/template/features.mjs'],
  'L3-TEMPLATE/NOTE': ['references/template/notes.mjs'],
  /* ALLFILES 有 child（L4-FILES），文件清单同样由 build 聚合 */
};
