/**
 * REQUIRED — Rectangle → set of files. This is the single source of truth for the
 * **directory → file** level of "directory > file > class"; build.mjs expands the class/function
 * inventory from inventory.json by following this table.
 *
 * Pattern syntax:
 *   'a/b/**'        that directory and every subdirectory
 *   'a/b/*'         only the files directly inside that directory
 *   'a/b/c.ts'      one exact file
 *   'a/b/use*.ts'   filename wildcard inside a directory
 *   '!a/b/x.ts'     exclude
 *   'REST:a/b/*'    whatever no other block in the same diagram claimed (for a catch-all block; put it last)
 *
 * Hard rules (enforced by build.mjs):
 *   - inside one diagram, a file may belong to exactly one rectangle
 *   - across diagrams, repetition is fine (an L4 file-level map is the same L3 blocks from another angle)
 *   - every source file in the repository must belong to at least one rectangle, or the build fails
 *
 * A block with a `child` needs no entry: build.mjs aggregates the child diagram's files (inventory only).
 *
 * This table also defines what {{files}} / {{lines}} / {{exports}} count in diagrams.mjs — change an
 * assignment and the numbers in the titles follow automatically. You neither need nor should sync them.
 *
 * Check as you write, rather than waiting for the build to fail:
 *   node scripts/stats.mjs <workDir> 'server/src/routes/*' 'server/src/ws/*'
 * It prints the files / lines / symbols each pattern matched; a pattern matching zero files is
 * flagged explicitly — that is a coverage hole.
 */
export const BLOCKMAP = {
  'L3-SUB1/A':    ['<directory>/<file>.ts'],
  // 'L3-SUB1/REST': ['REST:<directory>/*'],
};
