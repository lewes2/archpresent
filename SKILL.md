---
name: archpresent
description: "Turn a codebase into interactive architecture diagram as a single HTML file: four levels of drill-down, hover a port to see what the interface actually carries, hover an inventory row to see the real source snippet, and play back representative end-to-end scenarios. File/class/function inventories are extracted from source by machine and re-checked against the source line by line, so they cannot drift. Use when the user asks to analyze a codebase in depth, explain or summarize a project's architecture, draw an architecture diagram, map modules and call relationships, or visualize system structure. Example triggers: \"analyze all the code in this project\", \"explain this project's architecture\", \"summarize this software architecture\", \"visualize this repository's architecture\", \"draw the C4 diagram\". The only deliverable is one HTML file."
---

# archpresent

Turn a codebase into **one self-contained interactive C4 architecture map (a single HTML file)** — semantics written by hand, inventories extracted by machine, and a checker that independently re-reads the source to prove the inventories are accurate.

## Output contract (hard rules)

1. **Deliver exactly one HTML file.** No README, no analysis report, no Markdown summary, no edits to any existing file in the repository, no git commits.
2. Intermediate artifacts (`inventory.json` and the semantic modules) always live in the **session temp directory**, never in the repository.
3. Default location: `<project-name>-architecture.html` in the repository root. If the user names another location, use it.
4. The final reply contains **only the path, one line of stats, and the verification verdict.** Do not paste HTML, do not restate the architectural conclusions — they live in that file.

## Workflow

Directory conventions: `WORK=<session temp dir>/archpresent`, `SK=~/.claude/skills/archpresent`.

### Step 1 · Take inventory, and confirm on the spot that no whole layer is missing

```bash
node "$SK/scripts/scan.mjs" <repoRoot> "$WORK" [srcRoot ...]
```

Writes `$WORK/inventory.json` and prints three things to stderr: the **directory summary** (descending by symbol count), the **files with more than 80 symbols**, and the **unrecognized extensions**.

Read all three:

- The **directory summary** is the only basis for your block design.
- The **oversized files** tell you which files can only occupy a rectangle of their own (they cannot be split by theme).
- The **unrecognized extensions** are the only symptom of "a whole layer got silently dropped". When you see one, stop and decide: is that source code?

  > Already supported: TS/JS · Vue/Svelte single-file components · Python · Go · Rust · JVM.
  > If the repository is mainly written in another language (.rb / .php / .ex / .swift…), add it to
  > `SRC_EXT` in `scripts/lang.mjs` and `LANGS` in `scan.mjs` before continuing. Dropping a whole
  > layer makes the map wrong at its root, and the quality gates **will not** catch it for you —
  > they only check what you did include.

Check the scale while you are here; you will need it for titles:

```bash
node "$SK/scripts/stats.mjs" "$WORK"                      # directory summary + repository totals
node "$SK/scripts/stats.mjs" "$WORK" --top 20             # the 20 largest files
node "$SK/scripts/stats.mjs" "$WORK" 'server/**' 'client/**'
```

### Step 2 · Read the code and form a judgment

There is no shortcut here, and this is the only part of the skill that needs judgment. A few moves pay off far more than the rest — do them before you start reading prose-style source:

| What you want | The move that gets it |
|---|---|
| Process model and wiring order | Read the entry file (`index/main/app`) and see what it constructs and in what order |
| A port's "data type" column | Read `types/constants/protocol/api/events` files — if you cannot write the type, you have not read enough |
| A port's "size/capacity" column | Grep the constant block: `grep -nE "^const [A-Z_]+ ="` / `_MS =` / `MAX_` / `TIMEOUT` |
| A port's "storage/landing" column | Read the table DDL, the `~/.` path joins, the places that write files |
| The external interface surface | Grep route registration: `grep -nE "app\.(get\|post\|put\|patch\|delete)\("` |
| A port's "why" column | Read the **file headers and inline comments** of the core files — in a good project, the design reasoning is written there |

Read the existing architecture docs (`ARCHITECTURE.md` / `AGENTS.md` / `docs/`), but **correct them against the code** — docs lagging behind code is the normal case, and copying them freezes stale conclusions into your deliverable.

### Step 3 · Write the semantic layer

Copy everything in `$SK/references/template/` into `$WORK/`, then fill it in as the template comments direct. **Read the comments in the template first** — they are the complete field contract.

| File | Required | Contents |
|---|---|---|
| `dsl.mjs` | as-is | The five-part port constructor |
| `diagrams.mjs` | ✅ | Diagrams, rectangles, ports, links — the most time-consuming part |
| `blockmap.mjs` | ✅ | Rectangle → files (the definition of your module boundaries) |
| `ret.mjs` | recommended | Field tables for structured ports |
| `code.mjs` | recommended | Symbols whose real source snippet should expand on hover |
| `flows.mjs` | recommended | Representative end-to-end scenarios (crossing levels) |
| `features.mjs` | recommended | The L1 capability list |
| `notes.mjs` | optional | Per-item annotations |

Three operational requirements for this step:

1. **Use the Write tool, one file at a time — not heredocs.** When prose mixes quotes, backslashes and
   `{}`, a shell heredoc truncates itself far too easily. Once the diagram definitions exceed roughly a
   thousand lines, split them into a `diagrams/` directory (`01-l1.mjs`, `02-l2-server.mjs`, …, each
   with its own `export const DIAGRAMS = []`); `build.mjs` merges them in filename order.
2. **Always write statistics as placeholders**: `{{files}}` `{{lines}}` `{{exports}}`. `build.mjs`
   fills them from what the blockmap actually assigns. Hand-computed aggregates are always wrong
   eventually, and they **get past every quality gate** — the assertions check the inventories, never
   the numbers you typed into a title. Placeholders make drift impossible.
3. **Check each blockmap entry with `stats.mjs` as you write it.** A pattern that matches zero files is
   a coverage hole.

Worked example: `$SK/references/example/` (the skill analyzing itself with its own toolchain); the finished artifact is `$SK/references/example-output.html`.

### Step 4 · Assemble

```bash
node "$SK/scripts/build.mjs" "$WORK" <outHtml>
```

A failure exits non-zero and produces nothing half-finished. Build time already catches: a file assigned
to two rectangles in the same diagram, any repository file left uncovered, a dangling `child` / link
source port / `RET` port index, `CODE_PICKS` pointing at a symbol that does not exist (it lists the
candidate names for you), and placeholders it cannot fill.

### Step 5 · Pass the quality gates (not skippable)

```bash
node "$SK/scripts/verify.mjs" <outHtml> <repoRoot> [srcRoot ...]   # all 8 assertion classes must be 0
node "$SK/scripts/smoke.mjs"  <outHtml>                            # everything must pass
```

If anything fails, go back to step 3 or 4 and fix it. **Never report it as "basically working".**

Self-check against this list before you deliver:

- [ ] scan's "unrecognized extensions" section is empty, or you have confirmed those are not source
- [ ] `UNCOVERED_FILE` is 0, and the two numbers in the verify report ("N deduplicated / N present in repo") are **equal**
- [ ] No hand-written aggregate numbers in any title or subtitle (all of them are placeholders or came from stats.mjs)
- [ ] None of the five port columns is filler; if you cannot write the real type, go read more code
- [ ] At least one L4 critical-path state machine (the single most informative part of the whole map)
- [ ] Nothing new in the repository working tree except that one HTML file

## The partition rule: directory > file > class

These three levels map onto three carriers. This is the core convention of the skill:

| C4 carrier | Corresponds to | Who writes it |
|---|---|---|
| L2/L3 rectangle | a **directory** (or a thematic subgroup inside one) | you (`diagrams.mjs` + `blockmap.mjs`) |
| The "file inventory" drawer | **files** (real paths + real line counts) | machine-generated |
| The "internal classes / objects" drawer | **classes/objects/functions** (grouped by file, with kind and line number) | machine-generated |
| L4 file-level module map | one rectangle = one file | expanded automatically by `autoFiles` |

Suggested layering:

- **L1**, one diagram: system context. People, processes/services, external dependencies, the data plane.
- **L2**, one per process / top-level container.
- **L3**, one per directory; the rectangles are thematic subgroups inside that directory.
- **L4**, two kinds: cross-module **critical-path state machines** (by far the most informative — always write at least one), and **file-level module maps** for oversized directories (`autoFiles`).

Constraint: **at most 80 symbols per rectangle.** Over that, split again by theme.

The exception is a **single file** that alone exceeds 80 (scan lists these explicitly at the end of its output): it cannot be split, so give it **a rectangle of its own**, mark it `k:'risk'`, and use `d` to say why it is that large and which few concerns the bulk of it serves. A file like that is itself a refactoring signal; the map is only worth reading if it shows that explicitly.

## How to write ports

Ports are the most valuable output of this map. Each of the five columns of `p(name, dataType, size, storage, why)` has a hard requirement:

- **dataType** must be a **real identifier**: `RpcRequest{id,method,params,token?}`, not "a request object".
- **size** states the real constraint: `≤50 concurrent · 200 req/s`, `ring buffer 1024 · ≤256 per call`. If there genuinely is none, write "per call".
- **storage** states the real landing place: `~/.wmux/sessions.json`, `\\.\pipe\wmux-<user>`. If there is none, write `—`.
- **why** states **the reason for the constraint, the trap someone already hit, the failure mode** — never a restatement of the function name. This column decides whether the map is worth reading.

By the same rule, a rectangle's `d` says *why it is like this*, and `sub` says *the one thing this diagram is really about*. **Nothing anywhere should read like "handles the related logic".**

## Resources

```
scripts/lang.mjs     "what counts as a source file", shared by scan and verify
scripts/patterns.mjs the blockmap path-pattern vocabulary, shared by build and stats — so the counts
                     stats reports can never disagree with the ownership build actually assigns
scripts/scan.mjs     read-only inventory extractor (six families: TS/JS · SFC · Python · Go · Rust · JVM)
scripts/stats.mjs    file/line/symbol stats using blockmap's own pattern syntax; verifies pattern hits
scripts/build.mjs    assembler + first quality gate + statistics placeholder fill-in
scripts/verify.mjs   independent back-to-source checker (8 assertion classes)
scripts/smoke.mjs    stubbed-DOM smoke test (no real browser required)
assets/engine.js     Canvas rendering engine, fully decoupled from data, concatenated verbatim
                     (includes the ✎ Edit mode: click any label to rewrite it, Ctrl+drag a rectangle
                      to reposition it; both persist to the viewer's localStorage, never to this file)
references/template/ semantic module templates; the comments are the field contract
references/example/  the semantic layer of the worked example (the skill analyzing itself)
references/example-output.html  the finished reference artifact
```

## Common traps

- **A whole layer silently dropped.** Extensions the scanner does not recognize never enter the inventory, and verify will not object either — it only checks what you included. The "unrecognized extensions" note at the end of scan is the only symptom; read it.
- **Hand-computed aggregates.** Numbers like "12 files / 4327 lines" typed into a title drift the moment you adjust the partitioning, and no assertion checks them. Use placeholders.
- **Copying a stale architecture doc.** Docs lagging behind code is the normal case; correct them against the directory summary and the source.
- **Filler ports.** "Input: data; output: result" is the same as writing nothing. If you cannot write the real type, you have not read enough code.
- **Forgetting full coverage.** `UNCOVERED_FILE` is the easiest one to overlook — it means your partitioning missed something.
- **Hand-writing inventories.** Never type a filename, line count, class name, or line number by hand — that is precisely why this toolchain exists.
- **Writing extra files along the way.** The skill delivers only the HTML; an extra Markdown report violates the output contract.
