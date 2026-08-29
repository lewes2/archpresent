export const BLOCKMAP = {
  /* L2 · toolchain — one block per script */
  'L2-TOOL/SCAN':   ['scripts/scan.mjs'],
  'L2-TOOL/LANG':   ['scripts/lang.mjs'],
  'L2-TOOL/BUILD':  ['scripts/build.mjs'],
  'L2-TOOL/VERIFY': ['scripts/verify.mjs'],
  'L2-TOOL/SMOKE':  ['scripts/smoke.mjs'],
  'L2-TOOL/STATS':  ['scripts/stats.mjs'],
  /* SEMANTIC has a child, so build aggregates its file inventory from L3-TEMPLATE — nothing to write */

  /* L2 · quality gates — the same two scripts split by responsibility; one file per rectangle within a diagram */
  'L2-GATE/BACKREF':  ['scripts/verify.mjs'],
  'L2-GATE/TRAVERSE': ['scripts/smoke.mjs'],

  /* L3 · semantic layer templates — one block per module */
  'L3-TEMPLATE/DSL':  ['references/template/dsl.mjs'],
  'L3-TEMPLATE/DIA':  ['references/template/diagrams.mjs'],
  'L3-TEMPLATE/MAP':  ['references/template/blockmap.mjs'],
  'L3-TEMPLATE/RET':  ['references/template/ret.mjs'],
  'L3-TEMPLATE/CODE': ['references/template/code.mjs'],
  'L3-TEMPLATE/FLOW': ['references/template/flows.mjs'],
  'L3-TEMPLATE/FEAT': ['references/template/features.mjs'],
  'L3-TEMPLATE/NOTE': ['references/template/notes.mjs'],
  /* ALLFILES has a child (L4-FILES), so build aggregates its file inventory too */
};
