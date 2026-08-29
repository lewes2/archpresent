/**
 * OPTIONAL but strongly recommended — Symbols whose real definition should expand on hover:
 * [filePath, exportedSymbolName, howManyLines].
 * build.mjs cuts the snippet fresh from disk at the symbol's real line number (absorbing any comment
 * block immediately above it), so you cannot get the source wrong here — only the path or the symbol
 * name, and that fails at build time, which also prints the symbol names available in that file so you
 * can just fix it.
 *
 * Pick the symbols whose comments or constants ARE the design documentation: threshold tables, timeout
 * constants, regex gates, locking logic, format strings. Picking an ordinary getter wastes a slot.
 */
export const CODE_PICKS = [
  ['<path>', '<symbolName>', 16],
];
