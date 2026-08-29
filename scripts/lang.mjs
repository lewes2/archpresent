/**
 * lang.mjs — "what counts as a source file", shared by scan.mjs and verify.mjs.
 *
 * Why this layer is shared: verify earns its keep by going **back to the source independently**, so the
 * symbol-extraction regexes are written twice on purpose and never reused. But the *set of files* must be
 * identical on both sides — if scan knows about .vue and verify does not, verify's UNCOVERED_FILE
 * assertion is vacuous there and "full coverage" is a lie. That is the whole reason this file exists.
 *
 * The toolchain has exactly one other shared layer, for the same class of reason: patterns.mjs, so that
 * the counts stats reports can never disagree with the ownership build assigns.
 */

/** Single-file components: declarations live in the script block; template and style are not scanned */
export const SFC_EXT = ['.vue', '.svelte'];

/** Every extension treated as source. Editing this changes the reach of scan AND verify at once. */
export const SRC_EXT = new Set([
  '.ts', '.tsx', '.mts', '.cts', '.js', '.jsx', '.mjs', '.cjs',
  ...SFC_EXT,
  '.py', '.go', '.rs', '.java', '.kt', '.cs',
  '.c', '.cc', '.cpp', '.cxx', '.h', '.hh', '.hpp', '.hxx',
]);

/** The TS/JS family: verify additionally asserts that a declaration line begins with `export` */
export const JS_EXT = new Set(['.ts', '.tsx', '.mts', '.cts', '.js', '.jsx', '.mjs', '.cjs']);

export const SKIP_DIR = new Set([
  'node_modules', 'dist', 'build', 'out', 'target', '.git', '.svn', '.hg',
  '.vite', '.next', '.nuxt', '.cache', '.turbo', '.venv', 'venv', '__pycache__',
  'coverage', 'vendor', 'third_party', 'bin', 'obj', '.idea', '.vscode',
  '__tests__', '__mocks__', '__snapshots__', 'test', 'tests', 'spec', 'e2e',
  'fixtures', 'testdata', 'docs', 'examples', 'assets', 'public', 'static',
]);

/** Names to prefer when probing for a source root */
export const ROOT_HINTS = ['src', 'lib', 'app', 'apps', 'packages', 'core', 'internal',
                           'pkg', 'cmd', 'source', 'server', 'client', 'backend', 'frontend'];

export const isTest = n =>
  /\.(test|spec)\.[cm]?[jt]sx?$/.test(n) || /\.(test|spec)\.(vue|svelte)$/.test(n) ||
  /^test_.*\.py$/.test(n) || /_test\.(go|py)$/.test(n) || /Tests?\.(java|kt|cs)$/.test(n);

/**
 * Line range of an SFC's <script> block (1-based, inclusive).
 * verify uses it to assert a symbol's claimed line really is inside the script block — the same identifier appearing in the template does not count.
 */
export function scriptRanges(lines) {
  const ranges = [];
  let start = null;
  for (let i = 0; i < lines.length; i++) {
    if (start === null) {
      if (/^\s*<script\b/.test(lines[i])) start = i + 1;
    } else if (/^\s*<\/script>/.test(lines[i])) {
      ranges.push([start, i + 1]);
      start = null;
    }
  }
  if (start !== null) ranges.push([start, lines.length]);
  return ranges;
}

export const inScript = (ranges, line) => ranges.some(([a, b]) => line >= a && line <= b);
