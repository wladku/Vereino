---
title: "Subagents never stage changes; commit only explicit paths"
modules: ["platform"]
areas: ["ai-workflow"]
topics: ["subagents", "git-staging", "commits"]
---

# Subagents never stage changes; commit only explicit paths

**Context**: On 2026-10-20 a translation subagent renamed research files with `git mv`, which staged the renames. The coordinator then committed an unrelated task with `git add <paths> && git commit`, and the already-staged renames went into that commit with an unrelated message. The commit had to be undone with `git reset --soft HEAD~1` and `git restore --staged`.

**Problem**: `git mv`, `git rm` and `git add` in any agent change the shared index. A later commit by another agent or the coordinator picks up everything staged, not only the paths it added.

**Rule**: Subagents edit the working tree only: rename with a plain move (or `git mv` followed by `git restore --staged`), and never stage, commit or push. Before every commit the coordinator runs `git diff --cached --stat` and commits only the paths of the current task.

**Applies to**: every multi-agent task in this repository (subagents, workflows, side sessions sharing one checkout).
