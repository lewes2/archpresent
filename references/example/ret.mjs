export const RET_TABLES = {
  'L1/SCAN/out:0': [
    ['path',    'string', 'Repository-relative path with forward slashes — also the thing blockmap patterns match against'],
    ['lines',   'number', 'Real line count (split("\n").length); verify re-checks every one against the source'],
    ['exports', '{name,kind,line}[]', 'Top-level declarations. `line` is the anchor for going back to the source, and the reason symbols sharing a name do not collide'],
    ['kind',    'class|Service|interface|type|enum|function|hook|component|slice|const|re-export', 'One vocabulary shared across languages'],
  ],
  'L1/GATE/out:0': [
    ['MISSING_FILE',   'an inventory path does not exist on disk', 'Most often a typo in a hand-written blockmap path'],
    ['LINE_DRIFT',     'the line count disagrees with the real file', 'The source changed after generation'],
    ['SYMBOL_ABSENT',  'the symbol is not on the line it claims', 'A shift crept in between extraction and presentation'],
    ['KIND_MISMATCH',  'the kind or the line numbers contradict themselves', 'The L-line in the metric disagrees with the back-to-source key'],
    ['SNIPPET_DRIFT',  'a snippet disagrees with the source', 'Like LINE_DRIFT — it guards against drift after generation'],
    ['GROUP_MISMATCH', 'a file group header line count disagrees', 'Same as above'],
    ['UNCOVERED_FILE', 'a source file is in no rectangle', 'The partitioning missed something — the easiest failure to overlook'],
    ['BROKEN_REF',     'child/links/RET/FLOWS/FEATURES dangle', 'An out-of-range port index is the most common cause'],
  ],
};
