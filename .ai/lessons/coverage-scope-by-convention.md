---
title: "Tooling scripts fall under the 100 % rule by their name, not by a list"
modules: ["platform"]
areas: ["architecture", "testing"]
topics: ["coverage", "merge-conflicts", "tooling"]
---

# Tooling scripts fall under the 100 % rule by their name, not by a list

**Context**: On 2026-11-20 #474 (`scripts/backup-*.mjs`) and #478 (`scripts/smoke.mjs`) both conflicted with `main` after #457 merged (`scripts/check-licenses.mjs`). Each PR had added its script to the same three lists: the `--test-coverage-include` flags of `test:scripts`, the AGENTS.md coverage rule and the `COVERED_GLOBS` and file-count floor of `coverage-scope.test.mjs`.

**Problem**: A hand-kept list of covered files is a shared line that every tooling PR edits. Two such PRs open at once always conflict, and the merge train then holds both until someone merges the lists by hand.

**Rule**: `test:scripts` includes globs: the root `scripts/*.mjs`, `packages/app/scripts/vereino-*.mjs` and `check-*.mjs`, and `eslint.vereino.mjs`. `coverage-scope.test.mjs` derives the covered files from those flags, so a new tooling script is covered without editing anything: name it to match a glob and give it its tests. `--test-coverage-exclude` lists only root scripts outside the rule (platform scaffold, and the I/O wrappers `merge-train.mjs` and `ci-failure-ledger.mjs`, whose logic lives in a covered `*-plan.mjs`). Adding to it needs that reason; a stale entry fails the guard. When a branch that still adds an include merges `main`, keep `main`'s flags and drop the branch's include.

**Applies to**: `packages/app/package.json` (`test:scripts`), `packages/app/scripts/__tests__/coverage-scope.test.mjs`, AGENTS.md and CODE_REVIEW.md coverage rules.
