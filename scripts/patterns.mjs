/**
 * patterns.mjs — the blockmap path-pattern vocabulary: the single definition of "which files does
 * this pattern list own".
 *
 * Why this is a shared layer, exactly like lang.mjs is for "what counts as a source file":
 * build.mjs decides what a rectangle really owns; stats.mjs reports what a pattern would match, and
 * exists to be run *while writing blockmap*, before the build ever sees it. While those two carried
 * separate copies of the matcher, stats could report a hit count the build would never honour — and a
 * check that quietly disagrees with the thing it checks is worse than no check at all, because it is
 * believed. Anything that changes ownership semantics has to change here, once, for both.
 *
 * Syntax:
 *   a/b/**       that directory and every subdirectory
 *   a/b/*        only the files directly inside it
 *   a/b/c.ts     one exact file
 *   a/b/use*.ts  filename wildcard inside a directory
 *   !a/b/x.ts    exclude
 *   REST:a/b/*   whatever no other rectangle in the same diagram claimed (for the catch-all block)
 */

export function match(path, pat) {
  if (pat.endsWith('/**')) return path.startsWith(pat.slice(0, -2));
  if (pat.endsWith('/*')) {
    const d = pat.slice(0, -1);
    return path.startsWith(d) && !path.slice(d.length).includes('/');
  }
  if (pat.includes('*')) {                       // filename wildcard inside a directory: dir/useFoo*.ts
    const i = pat.lastIndexOf('/');
    const dir = pat.slice(0, i + 1), base = pat.slice(i + 1);
    if (!path.startsWith(dir) || path.slice(dir.length).includes('/')) return false;
    const rx = new RegExp('^' + base.split('*').map(s => s.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('.*') + '$');
    return rx.test(path.slice(dir.length));
  }
  return path === pat;
}

/** Split a raw pattern list into its three roles. */
export function splitPatterns(patterns) {
  const inc = [], exc = [], rest = [];
  for (const raw of patterns) {
    if (raw.startsWith('!')) exc.push(raw.slice(1));
    else if (raw.startsWith('REST:')) rest.push(raw.slice(5));
    else inc.push(raw);
  }
  return { inc, exc, rest };
}

/**
 * The files a pattern list owns.
 * `claimed` is the set already taken by other rectangles in the same diagram — that is what narrows a
 * REST: pattern to the leftovers. Pass nothing (stats.mjs does) to resolve REST at its widest, i.e.
 * "everything this pattern could match if no one else claimed any of it".
 */
export function selectFiles(files, patterns, claimed = new Set()) {
  const { inc, exc, rest } = splitPatterns(patterns);
  return files.filter(f =>
    (inc.some(p => match(f.path, p)) || (rest.some(p => match(f.path, p)) && !claimed.has(f.path)))
    && !exc.some(p => match(f.path, p)));
}
