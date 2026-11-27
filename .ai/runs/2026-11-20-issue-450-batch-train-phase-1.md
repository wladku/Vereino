# Batch merge train, phase 1: plan, judge and trailers, dark (#450)

- **Date:** 2026-11-20
- **Agent / tool:** Claude Code (Opus 5.5), `om-auto-fix-issue` with the repo-local override, Cezar run 6d2dd915
- **Trigger:** `cezar` label on issue #450 (owner, 2026-11-20)
- **Spec / issue / branch:** `.ai/specs/implemented/2026-11-18-batch-merge-train.md` phase 1; #450 (E16-S02, epic #443); `feat/issue-450-merge-train-batch-planning`
- **Status:** completed

## Goal

Add the batch train's pure planning (REQ-BT01), judging of the current batch head only (REQ-BT02), bisection and the head-tied verdict (REQ-BT03) and the `Merge-Train-*` trailers, without changing what the train does. The dry run prints the batch it would build.

## Steps

1. Claimed #450 (assignee, `in-progress`, `🤖` claim comment). Dependency #449 is merged (995fda4c).
2. `scripts/merge-train-plan.mjs`: extracted today's queue into `trainQueue` (shared by `planMergeTrain` and `planBatch`, behaviour unchanged); added `planBatch`, `judgeBatch`, `verdictOf`, `batchesAlone`, `parseBatchSize` and their constants.
3. New `scripts/merge-train-trailers.mjs`: `formatTrailers` / `parseTrailers`; a malformed trailer set parses to `null` (no batch).
4. Tests: `merge-train-batch.test.mjs` (BT-TEST-01, BT-TEST-02, including a step-by-step bisection of a red batch of three for each possible culprit) and `merge-train-trailers.test.mjs` (BT-TEST-04); the trailers module joined the `test:scripts` coverage list. `merge-train-plan.test.mjs` is unchanged.
5. `scripts/merge-train.mjs`: in a dry run only, reads each PR's changed files and `merge-train/verdict` status and prints the batch plan. `merge-train.yml` passes `MERGE_TRAIN_BATCH_SIZE` (variable, or the new `batch_size` input of a manual dry run).
6. Spec status `In progress`, changelog file `2026-11-20-issue-450-phase-1.md`.

## Decisions

- An unset, empty or invalid `MERGE_TRAIN_BATCH_SIZE` means **1**, not 4 — the spec ships phases 1 and 2 dark at size 1 and sets 4 only at the switch-on (phase 3). A default of 4 would turn batching on by itself once phase 2 acts on the plan. `DEFAULT_BATCH_SIZE = 4` documents the switch-on value. Values above `MAX_BATCH_SIZE` (8) fall back to 1.
- A PR that changes `.github/` or `scripts/merge-train*` ends the batch: alone when first, otherwise it waits until it is first, so queue order is kept (BT-D05). A PR whose files are unknown is treated the same way (fail closed).
- Bisection takes `ceil(n / 2)` of the suspects still batchable. A green half merges and the rest stay suspects; a red half of several becomes the new suspects and the other former suspects return to the ordinary queue; a red batch of one is the culprit and every other suspect returns to the queue.
- Judging filters check runs to the current batch head SHA before `checksState`, so runs of an older head (red, cancelled or green) never decide; no verdict after 90 min → `rebuild`.
- Batch fields (files, statuses) are read only in a dry run, so the live train makes no extra API calls while the batch train is dark.
- The new train surfaces (trailers, `merge-train/verdict`, `MERGE_TRAIN_BATCH_SIZE`) are not yet live; they go to `BACKWARD_COMPATIBILITY.md` "Relied on by CI" in phase 2/3, as the issue says, and are listed in the PR.

## Files changed

- `scripts/merge-train-plan.mjs`, `scripts/merge-train-trailers.mjs` (new), `scripts/merge-train.mjs`
- `.github/workflows/merge-train.yml`
- `packages/app/scripts/__tests__/merge-train-batch.test.mjs` (new), `packages/app/scripts/__tests__/merge-train-trailers.test.mjs` (new), `packages/app/scripts/__tests__/coverage-scope.test.mjs`, `packages/app/package.json` (coverage include)
- `.ai/lessons/new-tooling-script-needs-coverage-scope-entry.md` (new)
- `.ai/specs/implemented/2026-11-18-batch-merge-train.md` (status), `.ai/specs/changelog/2026-11-18-batch-merge-train/2026-11-20-issue-450-phase-1.md`
- this run log

## Commands and results

- `node --test --experimental-test-coverage … scripts/__tests__/merge-train-*.test.mjs` → 65 tests pass; `merge-train-plan.mjs` and `merge-train-trailers.mjs` 100 % lines, branches, functions.
- Live dry run, `MERGE_TRAIN_DRY_RUN=1 MERGE_TRAIN_BATCH_SIZE=4 node scripts/merge-train.mjs` (read-only) → `plan: wait #503` (unchanged) and `batch plan (size 4, dark — nothing is built): #474@470bd82 (alone: it changes CI or the train, BT-D05)`; #474 changes `.github/workflows/backup-drill.yml`. The five non-green PRs are listed with their reason.
- Same dry run with the variable unset → `batch plan (size 1, …)`.
- `yarn verify` (first run) → `FAIL format:check` (the two new test files were not formatted); `yarn format`, resumed.
- `yarn verify --from format:check` → `FAIL test:scripts`: `✖ the coverage globs match the test:scripts script` — `coverage-scope.test.mjs` keeps its own copy of the include list. Added the trailers module there (lesson `new-tooling-script-needs-coverage-scope-entry`); `yarn verify --from test:scripts` → pass.
- `yarn verify` (full, final) → all 18 steps passed; `test:scripts` 287 tests pass, both merge-train modules 100 %.
- Integration tests: none added or changed (repository tooling only, no route, page or `.ai/qa/tests` spec), so none to run locally.

## Open problems

- None for phase 1.

## Next steps

- Phase 2 (E16-S03): Merges API build, `push` on `merge-train/**`, merge guard and tree check (BT-TEST-03), rehearsal in a scratch repository.
