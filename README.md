# ArchPresent
<div align="center">
<p align="center">
  <strong>English</strong> · <a href="./README_ZH.md">简体中文</a>
</p>
  <a href="" target="_blank">
    <img alt="ArchPresent" src="https://github.com/user-attachments/assets/d5bdeb08-30e5-4e06-a3f5-65824f533215" width="full"/>
  </a>

  <p>
    <a href="">
      <img src="https://img.shields.io/discord/1477255801545429032?color=5865F2&logo=discord&logoColor=white" alt="Discord"/>
    </a>
    <a href="">
      <img src="https://img.shields.io/npm/v/gitnexus.svg" alt="npm version"/>
    </a>
    <a href="">
      <img src="https://img.shields.io/badge/License-PolyForm%20Noncommercial-blue.svg" alt="License: PolyForm Noncommercial"/>
    </a>
    <a href="">
      <img src="https://api.securityscorecards.dev/projects/github.com/abhigyanpatwari/ArchPresent/badge" alt="OpenSSF Scorecard"/>
    </a>
  </p>
</div>

# Professional Interactive Architecture Map

### What can ArchPresent do?
ArchPresent is an agent skill that generate diagrams from actual codebase. We run /ArchPresent and get an interactive architecture map(.html) which you can open by double-clicking. No server, no build step, no MCP calls, no dependencies.  no one-shot. you can regenerated on changes and see news components with highlight mark.

![Video](https://github.com/user-attachments/assets/08cd3bdb-8967-4fdb-b7d4-c6fc8f985502)

[Example page ↗](https://lewes2.github.io/archpresent/)

![Video](https://github.com/user-attachments/assets/fa3d9bc2-645c-4bb7-ab74-5fa59d2c96a6)

[Example page ↗](https://lewes2.github.io/archpresent/)

![Video](https://github.com/user-attachments/assets/bccc772a-59a7-4a78-9109-13d88fc5ec80)

[Example page ↗](https://lewes2.github.io/archpresent/)

![Video](https://github.com/user-attachments/assets/ea2a0893-e669-47f6-8bae-2f92b45d98ba)

[Example page ↗](https://lewes2.github.io/archpresent/)

## Quick Start

```bash
# 1. open your claude skills folder (eg：C:/Users/[your rname]/.claude/skills)
git clone https://github.com/lewes2/archpresent.git

```
## Drill through four levels

  L1 system context → L2 containers → L3 components → L4 code. Click a rectangle to descend, right-click or Esc to come back. L4 comes in two flavours: critical-path state machines that trace one real end-to-end path step by step, and file-level module maps where one rectangle is one file, expanded automatically.

  Example: a 159-file / 54,359-line monorepo maps to 16 diagrams and 193 rectangles.

## Inventories that cannot drift

  Every rectangle carries two drawers: its file inventory (real paths, real line counts) and its classes / objects / functions (grouped by file, with kind and line number). Hover a symbol to see its real source snippet, cut fresh from disk.

  None of this is typed by hand. It is extracted from source across six language families — TS/JS, Vue/Svelte single-file components, Python, Go, Rust, JVM — and then an independent checker re-reads the repository from scratch and confronts every claim against it: 8 assertion classes, all of which must be zero. Missing file, line drift, absent symbol, wrong kind, stale snippet, group mismatch, uncovered file, dangling reference. Aggregate numbers in titles are placeholders filled from actual ownership, so they cannot go stale when you re-partition.

## Watch the system run  

  Representative scenarios play back as an animated dot travelling the real routes — and each flow is projected onto whichever level you are viewing. At L1 you watch a few large blocks pass work to each other; drill to L4 and the same scenario resolves into individual lines of code.

  A capability index lists user-visible features grouped the way a user thinks about them; click one to jump straight to the module that implements it.

## Surface the risks, don't hide them

  A file too large to split by theme gets a rectangle of its own, marked as a risk, with a note on why it grew that way. Global mutable state, concurrency traps, in-memory-only guards, platform-specific weakenings — these get their own colour rather than being smoothed into the diagram.

## Edit it after the fact

  Press ✎ Edit (top right) to correct the map without regenerating it: click any label to rewrite it, Ctrl+drag any rectangle to reposition it — links re-route automatically. Changes persist in your browser.

## What it deliberately does not do  

  It does not auto-generate the semantics. Module boundaries, the reasoning in each description, and every port's five columns are written by a human (or a model) that has actually read the code. ArchPresent's job is to make that judgement presentable, navigable, and impossible to contradict the source.
