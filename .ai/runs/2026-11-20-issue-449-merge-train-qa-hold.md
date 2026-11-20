# Merge train holds risk-high PRs for QA and mirrors its labels onto the issue (E16-S01, #449)

- **Date:** 2026-11-20
- **Agent / tool:** Claude Code (claude-opus-5-5), om-auto-fix-issue, Cezar run cfcbb1ba
- **Trigger:** Cezar automation on the `cezar` label of #449
- **Spec / issue / branch:** `.ai/specs/2026-11-18-merge-throughput.md` phase 3 (MT-05; MT-D02, MT-D04; MT-TEST-05), #449, epic #443, branch `feat/issue-449-merge-train-qa-hold`
- **Status:** completed

## Goal

Build phase 3 of the merge-throughput spec: the train holds a `risk-high` + `needs-qa` PR until `qa`; `SDLC.md` states the QA rule and three Cezar builds; `docs/ops/github-settings.md` lists only the required checks; the train mirrors `merge-train-failed` / `merge-train-conflict` onto the issue named by `issue-N` in the head branch.

## Steps

1. Claimed #449 (assignee, `in-progress`, `🤖` comment naming this worktree).
2. Step 3.1 — `scripts/merge-train-plan.mjs`: `qaHold(labels)`, `planMergeTrain` returns `held: [{ pr, reason }]` and keeps held PRs out of the queue.
3. Step 3.3 — `linkedIssue(branch)` (`issue-N` bounded by `/` or start and `-` or end); every label change carries `issue` when the branch names one. `scripts/merge-train.mjs` reads `head.ref`, applies the change to the issue too (best effort, non-throwing), logs each held PR and posts one hold comment per PR (hidden marker `<!-- merge-train:qa-hold -->`, `needsQaHoldComment`), reusing a `comment()` helper with the label comments.
4. MT-TEST-05 in `packages/app/scripts/__tests__/merge-train-plan.test.mjs`; existing plan assertions gain `held: []`.
5. Step 3.2 — `SDLC.md` "QA" (MT-D02 rule), "Validation gate" (three builds, MT-D04; hold and mirroring; token scopes); `docs/ops/github-settings.md` required checks = `gate`, `integration`, `browser-smoke` (checked against the live ruleset with `gh api repos/wladku/Vereino/rules/branches/main`), new section for the train token; workflow header names Issues write.
6. Spec changelog file, this run log, `yarn verify`.

## Decisions

- The hold is independent of `MERGE_TRAIN_SKIP_LABELS` — the variable replaces the skip list, and an owner decision must not disappear with it. A PR that also has a skip label is reported by the skip label, not as held.
- `qa` releases the hold, as MT-D02 and the issue say. The old `SDLC.md` sentence "an active `qa` label means a tester is on the PR right now — never merge under an active tester" contradicted that and was replaced: the owner sets `qa` when the manual test passed, `qa-failed` when it failed.
- Mirroring onto the issue uses the non-throwing API call and logs a warning (404 silently): a missing issue or a token without Issues write must never stop merges.
- Held PRs are not synced for train labels (same as skip-labelled PRs): they are not in the queue.

## Files changed

- `scripts/merge-train-plan.mjs`, `scripts/merge-train.mjs`, `.github/workflows/merge-train.yml` (comment only)
- `packages/app/scripts/__tests__/merge-train-plan.test.mjs`
- `SDLC.md`, `docs/ops/github-settings.md`
- `.ai/specs/changelog/2026-11-18-merge-throughput/2026-11-20-issue-449-phase-3.md`, this log

## Commands and results

- `node --test --experimental-test-coverage --test-coverage-include=../../scripts/merge-train-plan.mjs scripts/__tests__/merge-train-plan.test.mjs` → 25 pass, `merge-train-plan.mjs` 100 % lines / branches / functions.
- `node --check scripts/merge-train.mjs` → ok.
- `yarn verify` → `[verify] all 18 step(s) passed` (lint: 0 errors, 124 pre-existing warnings).
- No integration test was added or edited (repository tooling only), so no `yarn test:integration:vereino` run applies.

## Open problems

- `MERGE_TRAIN_TOKEN` scopes cannot be read from the repository; the owner must confirm the token has Issues write (the issue assumed Pull requests write is enough — it is not for labels on an issue). Until then the train logs `::warning::` on the mirroring step and keeps merging.
- The rule takes effect only after merge: the train runs `main`'s copy of the scripts.

## Next steps

- Owner: grant Issues write to `MERGE_TRAIN_TOKEN` if missing; Cezar automation on `issue.labeled` (`merge-train-failed`, `merge-train-conflict`) per the spec's Operations section, with run-log evidence of one label-started fix run (MT-AC-04).
