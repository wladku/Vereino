# Batch merge train, phase 3 preparation: readiness check, docs, owner instructions (#698)

- **Date:** 2026-11-24
- **Agent / tool:** Claude Code (Opus 5.5), `om-auto-fix-issue` with the repo-local override, Cezar run 35c00bde
- **Trigger:** `cezar` label on issue #698 (E16-S04, epic #443), filed at the owner's request
- **Spec / issue / branch:** `.ai/specs/implemented/2026-11-18-batch-merge-train.md` phase 3 (REQ-BT05, BT-AC-01 … BT-AC-03); #698; `docs/issue-698-prepare-batch-merge-train`
- **Status:** completed (the switch-on itself stays with the owner)

## Goal

Check on `main` that the batch train is ready to be switched on with `MERGE_TRAIN_BATCH_SIZE` 2/4, fix what is missing, update the docs phase 3 names, and write the owner's switch-on instructions in Polish in a safe order. Change no repository setting, secret, variable or ruleset; merge nothing.

## Steps

1. Claimed #698 (assignee, `in-progress`, `🤖` claim comment naming this run, worktree and branch).
2. Readiness check (read-only): `scripts/merge-train.mjs`, `merge-train-plan.mjs`, `merge-train-guard.mjs`, `merge-train-trailers.mjs`, `.github/workflows/merge-train.yml`, the phase 2 rehearsal log `.ai/runs/2026-11-21-issue-451-batch-train-phase-2.md`, the live ruleset 26707580 (`gh api repos/wladku/Vereino/rulesets/26707580`), variables and secrets lists.
3. Fixed the one gap found (below) with unit tests; proved it with dry runs on the live queue.
4. Docs: `SDLC.md` "Validation gate" (both modes, ruleset per mode, token scopes, "Never act for the train"), `AGENTS.md` Never (agents' forbidden actions, which Cezar reads), `docs/ops/github-settings.md` (ruleset per mode, token with Commit statuses, section 6a variables), `BACKWARD_COMPATIBILITY.md` §7 (train surfaces), `merge-train.yml` header comment, spec phase 3 order, changelog file, lesson update, new `docs/ops/batch-train-switch-on.md` (Polish, as the issue asks).
5. CI follow-up (second run, PR #699): `integration (shard 2/6)` of run 45374383583 failed only in `TEST-M03` (`club_core/TEST-M03-club-address.spec.ts`), `"beforeAll" hook timeout of 20000ms exceeded`, also on retry. Not caused by this PR (tooling and docs only): the same test failed the same way on `main` (run 45367384970, `c0997ad6`) and is tracked by #701. Cause, posted on #701: the file's `test.describe.configure({ timeout: 600_000 })` does not reach the `beforeAll` hook, which keeps the config's 20 s while `startClubDomainApp()` starts a second `next start` (it waits up to 180 s) and creates two clubs. No test change here (out of scope; #701 owns the fix).

## Readiness check

| Capability (issue "Done when" 1) | Evidence | Result |
|---|---|---|
| Builds the batch branch | rehearsal scenarios 1–4; `buildBatch` | ready |
| Posts `merge-train/verified` on every PR head it merges | rehearsal scenario 1; `mergeBatch` sets it before each squash merge | ready |
| Merges with the tree check | rehearsal: `tree check passed` per prefix in scenarios 1–4 | ready |
| Bisects a red batch | rehearsal scenarios 2 and 4 | ready |
| Pauses through the pause issue | rehearsal "Pause"; merge-failure and tree-mismatch paths unit-tested only (phase 2 open problem) | ready |
| Works with the **live ruleset** once it requires `merge-train/verified` | not rehearsed: the rehearsal set `MERGE_TRAIN_REQUIRED_CHECKS=gate,integration,browser-smoke` | **gap, fixed here** |
| Labels `merge-train-batched`, `merge-train-paused` | do not exist on `wladku/Vereino` yet; the API creates a label when it is first added (rehearsal repository started without them) | ready |

**The gap.** `rulesetChecks` returned every required check of the ruleset, and `checksState` / `judgeBatch` look for each name among the head's *check runs*. `merge-train/verified` is a *commit status* the train sets only right before a merge, so after the owner adds it to the ruleset every PR head and every batch head would stay `pending` forever: the batch train would batch nothing and the one-PR train would merge nothing. Reproduced with `main`'s scripts and the target list (dry run, read-only):

```text
required checks on main: gate, integration, browser-smoke, merge-train/verified; …
batch plan (size 4, nothing is built in this run): none
  #679: not batched — its own head is not green yet
  #563: not batched — its own head is not green yet
  … (every green PR of the queue)
```

**Fix.** `requiredChecks` (pure, `scripts/merge-train-guard.mjs`) drops `merge-train/verified` from the list the train judges; new `stampsVerified(ruleset)` tells whether the ruleset requires it, and the one-PR train then sets the status on the up-to-date green head it merges (`scripts/merge-train.mjs`). Without the second part the one-PR train could not merge while the ruleset requires the status, which would block the queue during the switch-on and during every rollback step after "size 1".

## Decisions

- **Switch-on order differs from the spec's line** (token; drop `strict`, add `merge-train/verified`; size): add `merge-train/verified` *before* dropping `strict`, so there is never a window in which a stale green PR can be merged by hand; size 2 first, then 4 (the spec's "first live batch of two"). Spec phase 3 updated with a changelog file. The rollback keeps the spec's order; with the fix every rollback step keeps the queue moving.
- **This PR precedes the settings changes** instead of landing "in the same PR as the size change": the size is a repository variable the owner sets, and the code fix must be on `main` before the ruleset requires the status.
- **`docs/ops/batch-train-switch-on.md` is in Polish** although the repository language is English: the issue asks for it explicitly (owner decision 2026-11-24). Every other changed file is English.
- **Cezar's forbidden actions** live in Cezar's local `systemPrompt` (`~/vereino-cezar/.ai/cezar/config.json`, untracked) — a setting this run must not change. The rule went into `AGENTS.md` and `SDLC.md`, which Cezar reads, and the owner instructions give the exact sentence to add to the prompt (step 7).
- **Token permissions**: GitHub Docs (checked 2026-11-24 through a fetch agent) do not describe editing a fine-grained token; the instructions say that *Edit* keeps the value, flag that as unverified on this token, and make step 2 the safe first test (a 403 fails the run before any merge).
- **`MERGE_TRAIN_REQUIRED_CHECKS` set → no ruleset call**, as before; the override is filtered the same way.

## Files changed

- `scripts/merge-train-guard.mjs`, `scripts/merge-train.mjs`, `packages/app/scripts/__tests__/merge-train-guard.test.mjs`
- `.github/workflows/merge-train.yml` (comment only)
- `SDLC.md`, `AGENTS.md`, `BACKWARD_COMPATIBILITY.md`, `docs/ops/github-settings.md`, `docs/ops/batch-train-switch-on.md` (new)
- `.ai/specs/implemented/2026-11-18-batch-merge-train.md`, `.ai/specs/changelog/2026-11-18-batch-merge-train/2026-11-24-issue-698-phase-3-prep.md`
- `.ai/lessons/rehearse-github-automation-in-a-scratch-repository.md`
- this run log

## Commands and results

- `node --test scripts/__tests__/merge-train-guard.test.mjs` (in `packages/app`): 21 tests, 21 pass.
- Dry runs on the live queue, this branch (`MERGE_TRAIN_DRY_RUN=1`, read-only): size 1 → `plan: wait #688`, unchanged; size 4 → `batch plan (size 4, …): #679@b56713b, #563@2ce47de, #610@ca454fe, #663@a788488`; size 4 with `MERGE_TRAIN_REQUIRED_CHECKS=gate,integration,browser-smoke,merge-train/verified` → `required checks on main: gate, integration, browser-smoke` and the same batch.
- Same target list with `main`'s scripts → `batch plan …: none`, every PR "not green yet" (the gap, above).
- `yarn verify`: `[verify] all 22 step(s) passed` (run twice; the second after a last edit to `rulesetChecks`, which keeps a blank `MERGE_TRAIN_REQUIRED_CHECKS` such as `' , '` reading the ruleset as before).
- `yarn guard`: no blocking findings; warnings only for `.github/workflows/merge-train.yml` and `AGENTS.md` (agent rule files changed).
- No integration test added or edited (repository tooling only), so no `yarn test:integration:vereino` run applies.
- CI run 45374383583, `integration (shard 2/6)`: 60 passed, 1 failed (`TEST-M03`, `beforeAll` hook timeout 20 s, retry too), 1 did not run (`TEST-M02`, same file). Unrelated to this PR, see step 5.

## Open problems

- The token permission change and the ruleset changes are untested until the owner does them (steps 1–3 of the instructions name what to look at).
- Leftover from phase 2: the merge-failure and tree-mismatch pause paths are unit-tested only.

## Next steps

Owner: review the PR and set `qa`; after the train merges it, follow `docs/ops/batch-train-switch-on.md` steps 1–7 and post the BT-AC-01 and BT-AC-03 evidence on #698. When BT-AC-01 … BT-AC-03 hold, a follow-up sets the spec to `Implemented` and moves it.
