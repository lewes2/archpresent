export const RET_TABLES = {
  'L1/SCAN/out:0': [
    ['path',    'string', '仓库相对路径，正斜杠 —— 它同时是 blockmap 模式匹配的对象'],
    ['lines',   'number', '真实行数（split("\n").length）；verify 会逐条回源核对'],
    ['exports', '{name,kind,line}[]', '顶层声明。line 是回源锚点，也是同名符号不撞车的原因'],
    ['kind',    'class|Service|interface|type|enum|function|hook|component|slice|const|re-export', '跨语言统一词汇'],
  ],
  'L1/GATE/out:0': [
    ['MISSING_FILE',   '清单路径在磁盘上不存在', '最常见于手写 blockmap 时打错路径'],
    ['LINE_DRIFT',     '行数与真实不符',         '生成后源码又改了'],
    ['SYMBOL_ABSENT',  '符号不在声称的行上',     '抽取与呈现之间出现了偏移'],
    ['KIND_MISMATCH',  '种类或行号自相矛盾',     '计量里的 L 行号与回源键不一致'],
    ['SNIPPET_DRIFT',  '片段与源码不符',         '同 LINE_DRIFT，防的是生成后漂移'],
    ['GROUP_MISMATCH', '文件分组头行数不符',     '同上'],
    ['UNCOVERED_FILE', '有源文件没进任何矩形',   '模块划分漏了 —— 这条最容易被忽略'],
    ['BROKEN_REF',     'child/links/RET/FLOWS/FEATURES 断链', '端口下标越界最常见'],
  ],
};
