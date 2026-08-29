/**
 * lang.mjs —— scan.mjs 与 verify.mjs 共享的「哪些文件算源文件」。
 *
 * 为什么只共享这一层：verify 的价值在于**独立回源**，所以符号抽取的正则两边各写各的，
 * 绝不复用。但「文件集合」必须两边完全一致——如果 scan 认识 .vue 而 verify 不认识，
 * verify 的 UNCOVERED_FILE 断言对这类文件就形同虚设，"全覆盖"会是一句假话。
 * 这正是这个文件存在的唯一理由。
 */

/** 单文件组件：script 块里才有声明，模板与样式不参与符号抽取 */
export const SFC_EXT = ['.vue', '.svelte'];

/** 全部被视为源文件的扩展名。改这里 = 同时改 scan 与 verify 的覆盖面。 */
export const SRC_EXT = new Set([
  '.ts', '.tsx', '.mts', '.cts', '.js', '.jsx', '.mjs', '.cjs',
  ...SFC_EXT,
  '.py', '.go', '.rs', '.java', '.kt', '.cs',
  '.c', '.cc', '.cpp', '.cxx', '.h', '.hh', '.hpp', '.hxx',
]);

/** TS/JS 家族：verify 会对它们额外断言「声明行必须以 export 开头」 */
export const JS_EXT = new Set(['.ts', '.tsx', '.mts', '.cts', '.js', '.jsx', '.mjs', '.cjs']);

export const SKIP_DIR = new Set([
  'node_modules', 'dist', 'build', 'out', 'target', '.git', '.svn', '.hg',
  '.vite', '.next', '.nuxt', '.cache', '.turbo', '.venv', 'venv', '__pycache__',
  'coverage', 'vendor', 'third_party', 'bin', 'obj', '.idea', '.vscode',
  '__tests__', '__mocks__', '__snapshots__', 'test', 'tests', 'spec', 'e2e',
  'fixtures', 'testdata', 'docs', 'examples', 'assets', 'public', 'static',
]);

/** 探测源码根时优先看这些名字 */
export const ROOT_HINTS = ['src', 'lib', 'app', 'apps', 'packages', 'core', 'internal',
                           'pkg', 'cmd', 'source', 'server', 'client', 'backend', 'frontend'];

export const isTest = n =>
  /\.(test|spec)\.[cm]?[jt]sx?$/.test(n) || /\.(test|spec)\.(vue|svelte)$/.test(n) ||
  /^test_.*\.py$/.test(n) || /_test\.(go|py)$/.test(n) || /Tests?\.(java|kt|cs)$/.test(n);

/**
 * SFC 的 <script> 行区间（1 起算，闭区间）。
 * verify 用它断言「符号声称的行确实落在 script 块内」——模板里出现同名字符串不算数。
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
