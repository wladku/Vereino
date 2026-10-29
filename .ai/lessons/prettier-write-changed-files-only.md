---
title: "Run Prettier --write on the changed files only, never on a whole module folder"
modules: ["platform"]
areas: ["ai-workflow"]
topics: ["prettier", "formatting", "subagents", "diff-noise"]
---

# Run Prettier --write on the changed files only, never on a whole module folder

**Context**: Issue #31 (2026-10-29) touched four existing modules next to the new `activities` module.

**Problem**: `prettier --write` on a module folder also rewrote READMEs and migration snapshots that `yarn format:check` ignores, adding unrelated changes that then had to be reverted by hand.

**Rule**: Pass Prettier the exact files the change created or edited (for example from `git status --short`), then run `yarn format:check`.

**Applies to**: every Vereino change and every implementation subagent brief.
