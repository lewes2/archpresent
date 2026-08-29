/**
 * OPTIONAL — Per-item annotations. Leaving them out is fine — the default shows the full path /
 * definition site instead.
 *   FILE_NOTES: '<path>' → one line (shown when hovering that row of the file inventory)
 *   SYM_NOTES : '<path>#<symbolName>' → one line (shown when hovering that row of the symbol inventory)
 * Only write them for the items that are worth explaining; do not fill one in per file.
 */
export const FILE_NOTES = {
  // '<path>': '<why this file is so large / what it is really doing>',
};
export const SYM_NOTES = {
  // '<path>#<symbol>': '<why it is exported / what constrains it>',
};
