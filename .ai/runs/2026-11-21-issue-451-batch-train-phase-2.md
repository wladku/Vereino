# Batch merge train, phase 2: build, merge, tree check, pause, rehearsal (#451)

- **Date:** 2026-11-21
- **Agent / tool:** Claude Code (Opus 5.5), `om-auto-fix-issue` with the repo-local override, Cezar run a6049026
- **Trigger:** `cezar` label on issue #451 (owner, 2026-11-21)
- **Spec / issue / branch:** `.ai/specs/2026-11-18-batch-merge-train.md` phase 2 (REQ-BT04, BT-TEST-03, rehearsal); #451 (E16-S03, epic #443, depends on #450, merged in #518); `feat/issue-451-merge-train-batch-branch`
- **Status:** completed

## Goal

Make the train build the batch branch server-side with the Merges API, run CI on it (`push` on `merge-train/**`), merge a green batch PR by PR with a guard and a tree check after each merge, and pause itself on a mismatch. Rehearse it in a scratch repository before the owner switches it on. `MERGE_TRAIN_BATCH_SIZE` stays 1 on `wladku/Vereino`, so the live train is unchanged.

## Steps

1. Claimed #451 (assignee, `in-progress`, `🤖` claim comment). The owner's comment of 2026-11-21 answered the open question: a new private repository `wladku/vereino-merge-train-rehearsal`, created by the run.
2. New pure module `scripts/merge-train-guard.mjs` (BT-TEST-03, 100 % in `packages/app/scripts/__tests__/merge-train-guard.test.mjs`): `buildStep`, `batchCommitMessage`, `guardBatch`, `intermediateAfter`, `treeMatches`, `mergeOutcome`, `requiredChecks`, `ageMinutes`, `batchLabels`, `pauseIssue` and the names `merge-train/batch`, `merge-train-build`, `merge-train/verified`, `merge-train-batched`, `merge-train-paused`.
3. `scripts/merge-train.mjs`: with size 2 or more `batchTrain` runs instead of the one-PR loop: pause issue open → plan and log only; batch head present → guard (base, heads, queue) → judge (`judgeBatch`) → wait / drop and rebuild / merge / culprit / bisect; then plan (`planBatch`) and build; label sync (`batchLabels`); one `update-branch` for a red-and-behind PR. `scripts/merge-train-plan.mjs` exports `trainQueue`.
4. `.github/workflows/ci.yml`: `push` on `merge-train/**`. `.github/workflows/merge-train.yml`: the `batch_size` input applies only to a dry run (a real manual run cannot switch the batch train on); passes `MERGE_TRAIN_REQUIRED_CHECKS`.
5. Rehearsal (below), two fixes found by it, dry runs on the live queue, `yarn verify`.

## Decisions

- **Build on `merge-train-build`, test on `merge-train/batch`.** Pointing `merge-train/batch` at `main` first (as the spec's step 2 reads) would push `main`'s commit to `merge-train/**` and start a useless CI run, and every Merges API step would start another. The intermediate merges go to `merge-train-build` (outside the CI trigger); the finished head is set on `merge-train/batch` in one ref update, which starts exactly one CI run. The build branch is deleted in a `finally`.
- **Every intermediate commit carries the trailers of the batch so far**, so the batch head is valid whichever PR merged last; the tree check walks the head's first parents to find the tree after PR k.
- **A PR that conflicts with the PRs before it (Merges API 409) is left out of that batch without a label.** `merge-train-conflict` means "conflicts with `main`" and the label sync would clear it at the next run; once the earlier PRs merge, the PR either conflicts with `main` (labelled by the ordinary rule) or joins the next batch. A 204 (nothing to merge) also leaves the PR out.
- **The merge guard also requires every batch PR to be still in the queue** (not closed, drafted or given a skip label such as `do-not-merge`), not only an unchanged head.
- **Batch-mode labels**: `merge-train-failed` while the head carries `merge-train/verdict` = failure or a required check failed on an up-to-date head (the one-PR rule would clear a culprit's label, because a culprit is green on its own head). `merge-train-batched` on the batch under test, removed from each PR right after it merges.
- **The batch train refuses to merge without required checks.** `MERGE_TRAIN_REQUIRED_CHECKS` replaces the ruleset's list; set, the rules API is not called (it answers 403 on a private repository without GitHub Pro).
- **The rehearsal ran the train from this branch's scripts on this machine** with the owner's `gh` login (`GH_TOKEN=$(gh auth token)`, never stored), against the rehearsal repository whose CI ran on GitHub Actions. Storing the owner's token as a secret in another repository was avoided; the train logic and the API calls are the same as in the workflow.

## Rehearsal (`wladku/vereino-merge-train-rehearsal`, private)

Setup: the four `scripts/merge-train*.mjs` of this branch; a `ci.yml` with the same triggers and concurrency as Vereino's (`pull_request`, `push` on `main` and `merge-train/**`, `ci-${{ github.ref }}` cancel-in-progress) and three stand-in jobs named `gate`, `integration`, `browser-smoke`, which fail when `src/` holds both `a.txt` and `c.txt`, or (from scenario 4) both `x.txt` and `z.txt`. Every PR was green on its own head. Train runs with `MERGE_TRAIN_BATCH_SIZE=4`, `MERGE_TRAIN_REQUIRED_CHECKS=gate,integration,browser-smoke`.

| Scenario | Result |
|---|---|
| 1. Green batch of three (#1, #2, #3) | one batch CI run (`8abfc7e`) green; all three merged in one train run; tree check passed after each merge (prefix trees `27dd2c0`, `94f098e`, `700dd1a` = `main`); `merge-train/verified` success on each head — **BT-AC-01** |
| 2. Red batch, bisected (#5 b, #6 c; `a.txt` already on `main` via #4) | batch `57c80b0` red → bisect → #5 alone green, merged → #6 alone red → `merge-train/verdict` failure on its head `37cf79d`, label `merge-train-failed`, skipped (REQ-BT03) — **BT-AC-02** |
| 2b. Culprit re-enters after a new push | #6 pushed `9051eb9` (renamed `c.txt`); the next plan took it in, cleared `merge-train-failed`; it merged in scenario 3's batch |
| 3. Moved head drops the batch (#6, #7, #8) | batch `cee56db` built; #8 got a new head (`e77609b`) while its CI ran; batch CI green, yet the train dropped the batch (`a PR head moved since the batch was built (#8)`) and merged nothing; it rebuilt `ada739a` with the new head, which merged all three with passing tree checks — negative case |
| 4. Red batch of three (#9 x, #10 y, #11 z) | batch `3d0e076` red → bisect: #9 + #10 green, both merged with tree checks → #11 alone red → marked culprit (`merge-train/verdict` failure, `merge-train-failed`); #9 and #10 merged |
| Pause | with an open `merge-train-paused` issue the train logged `paused by #12: plan and log only` and built nothing |
| BT-D05 (incidental) | #4 also carried a stray copy of `scripts/merge-train.mjs` (see Open problems) and was batched alone, as BT-D05 requires |

CI runs on `merge-train/batch`: `8abfc7e` success (#1-#3), `f6f34c2` success (#4), `57c80b0` failure (#5, #6), `01a3c58` success (#5), `f80dd4b` failure (#6), `cee56db` success but dropped (#6-#8), `ada739a` success (#6-#8), `3d0e076` failure (#9-#11), `2b48885` success (#9, #10), `cc1624b` failure (#11). No train run merged anything from a dropped or red batch. The repository stays in place; the owner can delete it.

## Dry runs on the live queue (read-only, `MERGE_TRAIN_DRY_RUN=1`)

- Size 1 (today): `plan: wait #534`, `batch plan (size 1, dark — nothing is built): #543@264f460` — the one-PR train is unchanged.
- Size 4: `batch plan (size 4, nothing is built in this run): #543@264f460, #535@5ebf989, #536@8fc3f01, #537@19ee1b2`; #512 and #514 conflict with main, #534 not green yet.

## Files changed

- `scripts/merge-train-guard.mjs` (new), `scripts/merge-train.mjs`, `scripts/merge-train-plan.mjs` (export `trainQueue`)
- `.github/workflows/ci.yml`, `.github/workflows/merge-train.yml`
- `packages/app/scripts/__tests__/merge-train-guard.test.mjs` (new)
- `.ai/specs/changelog/2026-11-18-batch-merge-train/2026-11-21-issue-451-phase-2.md`
- `.ai/lessons/rehearse-github-automation-in-a-scratch-repository.md` (new)
- this run log

## Commands and results

- `node --test --experimental-test-coverage … scripts/__tests__/merge-train*.test.mjs` (in `packages/app`): 84 tests pass; `merge-train-guard.mjs`, `merge-train-plan.mjs`, `merge-train-trailers.mjs` 100 % lines, branches, functions.
- First rehearsal run of scenario 2 failed: `Error: GET /repos/wladku/vereino-merge-train-rehearsal/rules/branches/main → 403 {"message":"Upgrade to GitHub Pro or make this repository public to enable this feature."…}` — the rehearsal repository's `main` still held the scripts from before the override fix, and `git pull` had replaced the local copy. Fixed by syncing the scripts into the rehearsal `main`.
- First pause check: the train did not see an issue labelled `merge-train-paused` seconds after it was created (the label filter of the issues list lags); 20 s later the issue was listed and the train paused.
- `yarn verify` (first run): `FAIL  format:check` — `packages/app/scripts/__tests__/merge-train-guard.test.mjs is not formatted (run yarn format)`; fixed with `yarn format`.
- `yarn verify --from format:check`: `FAIL  lessons:check` — `.ai/lessons/rehearse-github-automation-in-a-scratch-repository.md: areas contain a value outside the standalone router taxonomy` (`ci`); changed to `integration`.
- `yarn verify` (final full run): `[verify] all 18 step(s) passed`.
- No integration test added or edited (repository tooling only), so no `yarn test:integration:vereino` run applies.

## Open problems

- The pause and merge-failure paths after a partial batch (tree mismatch, merge failing after three retries) are covered by unit tests only; provoking them needs a push to `main` between two merges of one run.
- Phase 3 stays with the owner: `MERGE_TRAIN_TOKEN` gains Commit statuses write and Issues write; ruleset drops `strict` and requires `merge-train/verified`; `MERGE_TRAIN_BATCH_SIZE=4`; `SDLC.md`, `docs/ops/github-settings.md`, `BACKWARD_COMPATIBILITY.md` ("Relied on by CI": `merge-train/**`, the trailers, both statuses, both labels, `MERGE_TRAIN_BATCH_SIZE`, `MERGE_TRAIN_REQUIRED_CHECKS`) and Cezar's forbidden actions in the same PR.

## Next steps

Owner: review, then phase 3 (switch-on) with the first live batch of two supervised.

<details><summary>Full rehearsal train log</summary>

```text
=== train run 19:36:45Z scenario 1: build
required checks on main: gate, integration, browser-smoke; skip labels: do-not-merge, blocked, in-progress, changes-requested, qa-failed
#1 behind=0 conflict=false checks=success verdict=null []
#2 behind=0 conflict=false checks=success verdict=null []
#3 behind=0 conflict=false checks=success verdict=null []
build: #1@d929053 → 201 (merged)
build: #2@e99d8ca → 201 (merged)
build: #3@60d9e0a → 201 (merged)
built merge-train/batch at 8abfc7e on main 0439a08: #1@d929053, #2@e99d8ca, #3@60d9e0a
#1: add label merge-train-batched
#2: add label merge-train-batched
#3: add label merge-train-batched
exit 0
=== train run 19:37:29Z scenario 1: while CI runs
required checks on main: gate, integration, browser-smoke; skip labels: do-not-merge, blocked, in-progress, changes-requested, qa-failed
#1 behind=0 conflict=false checks=success verdict=null [merge-train-batched]
#2 behind=0 conflict=false checks=success verdict=null [merge-train-batched]
#3 behind=0 conflict=false checks=success verdict=null [merge-train-batched]
batch 8abfc7e on main 0439a08: #1@d929053, #2@e99d8ca, #3@60d9e0a
judge: wait
exit 0
=== train run 19:41:32Z scenario 1: batch green
required checks on main: gate, integration, browser-smoke; skip labels: do-not-merge, blocked, in-progress, changes-requested, qa-failed
#1 behind=0 conflict=false checks=success verdict=null [merge-train-batched]
#2 behind=0 conflict=false checks=success verdict=null [merge-train-batched]
#3 behind=0 conflict=false checks=success verdict=null [merge-train-batched]
batch 8abfc7e on main 0439a08: #1@d929053, #2@e99d8ca, #3@60d9e0a
judge: merge
#1: merge → 200 (merged) {"sha":"f81a6302561dc453f28d976841eae14c1cf07aab","merged":true,"message":"Pull Request successfully merged"}
merged #1; tree check passed: main 27dd2c0, batch prefix 1 27dd2c0
#2: merge → 200 (merged) {"sha":"74e3438e5d84b4552804078e960bd4ca854f8abb","merged":true,"message":"Pull Request successfully merged"}
merged #2; tree check passed: main 94f098e, batch prefix 2 94f098e
#3: merge → 200 (merged) {"sha":"d1ad53501639ccf06fa10a80bc12f8ec035dba2b","merged":true,"message":"Pull Request successfully merged"}
merged #3; tree check passed: main 700dd1a, batch prefix 3 700dd1a
no batch: no PR is green on its own head
exit 0
=== train run 19:43:26Z scenario 2: build
file:///home/wkuc/.cezar/tmp/agent/5b98d7992112d2db/a6049026-9757-46a8-a098-3bebf23dd439/rehearsal/scripts/merge-train.mjs:88
  if (result.status >= 300) throw new Error(`${method} ${path} → ${result.status} ${JSON.stringify(result.body)}`)
                                  ^

Error: GET /repos/wladku/vereino-merge-train-rehearsal/rules/branches/main → 403 {"message":"Upgrade to GitHub Pro or make this repository public to enable this feature.","documentation_url":"https://docs.github.com/rest/repos/rules#get-rules-for-a-branch","status":"403"}
    at ok (file:///home/wkuc/.cezar/tmp/agent/5b98d7992112d2db/a6049026-9757-46a8-a098-3bebf23dd439/rehearsal/scripts/merge-train.mjs:88:35)
    at process.processTicksAndRejections (node:internal/process/task_queues:104:5)
    at async rulesetChecks (file:///home/wkuc/.cezar/tmp/agent/5b98d7992112d2db/a6049026-9757-46a8-a098-3bebf23dd439/rehearsal/scripts/merge-train.mjs:93:17)
    at async main (file:///home/wkuc/.cezar/tmp/agent/5b98d7992112d2db/a6049026-9757-46a8-a098-3bebf23dd439/rehearsal/scripts/merge-train.mjs:416:20)
    at async file:///home/wkuc/.cezar/tmp/agent/5b98d7992112d2db/a6049026-9757-46a8-a098-3bebf23dd439/rehearsal/scripts/merge-train.mjs:448:1

Node.js v24.22.3
exit 1
=== train run 19:43:28Z scenario 2: judge
file:///home/wkuc/.cezar/tmp/agent/5b98d7992112d2db/a6049026-9757-46a8-a098-3bebf23dd439/rehearsal/scripts/merge-train.mjs:88
  if (result.status >= 300) throw new Error(`${method} ${path} → ${result.status} ${JSON.stringify(result.body)}`)
                                  ^

Error: GET /repos/wladku/vereino-merge-train-rehearsal/rules/branches/main → 403 {"message":"Upgrade to GitHub Pro or make this repository public to enable this feature.","documentation_url":"https://docs.github.com/rest/repos/rules#get-rules-for-a-branch","status":"403"}
    at ok (file:///home/wkuc/.cezar/tmp/agent/5b98d7992112d2db/a6049026-9757-46a8-a098-3bebf23dd439/rehearsal/scripts/merge-train.mjs:88:35)
    at process.processTicksAndRejections (node:internal/process/task_queues:104:5)
    at async rulesetChecks (file:///home/wkuc/.cezar/tmp/agent/5b98d7992112d2db/a6049026-9757-46a8-a098-3bebf23dd439/rehearsal/scripts/merge-train.mjs:93:17)
    at async main (file:///home/wkuc/.cezar/tmp/agent/5b98d7992112d2db/a6049026-9757-46a8-a098-3bebf23dd439/rehearsal/scripts/merge-train.mjs:416:20)
    at async file:///home/wkuc/.cezar/tmp/agent/5b98d7992112d2db/a6049026-9757-46a8-a098-3bebf23dd439/rehearsal/scripts/merge-train.mjs:448:1

Node.js v24.22.3
exit 1
=== train run 19:44:43Z scenario 2: build
required checks on main: gate, integration, browser-smoke; skip labels: do-not-merge, blocked, in-progress, changes-requested, qa-failed
#4 behind=1 conflict=false checks=success verdict=null []
#5 behind=1 conflict=false checks=success verdict=null []
#6 behind=1 conflict=false checks=success verdict=null []
build: #4@a7e26c1 → 201 (merged)
built merge-train/batch at f6f34c2 on main 7cb05c8: #4@a7e26c1
#4: add label merge-train-batched
exit 0
batch f6f34c2 CI: success
=== train run 19:45:32Z scenario 2: judge
required checks on main: gate, integration, browser-smoke; skip labels: do-not-merge, blocked, in-progress, changes-requested, qa-failed
#4 behind=1 conflict=false checks=success verdict=null [merge-train-batched]
#5 behind=1 conflict=false checks=success verdict=null []
#6 behind=1 conflict=false checks=success verdict=null []
batch f6f34c2 on main 7cb05c8: #4@a7e26c1
judge: merge
#4: merge → 200 (merged) {"sha":"ca4cc6cee0725ee2f13103efa66d5607535545a9","merged":true,"message":"Pull Request successfully merged"}
merged #4; tree check passed: main 7afa896, batch prefix 1 7afa896
build: #5@beca1d1 → 201 (merged)
build: #6@37cf79d → 201 (merged)
built merge-train/batch at 57c80b0 on main ca4cc6c: #5@beca1d1, #6@37cf79d
#5: add label merge-train-batched
#6: add label merge-train-batched
exit 0
batch 57c80b0 CI: failure
=== train run 19:46:41Z scenario 2: bisect
required checks on main: gate, integration, browser-smoke; skip labels: do-not-merge, blocked, in-progress, changes-requested, qa-failed
#5 behind=2 conflict=false checks=success verdict=null [merge-train-batched]
#6 behind=2 conflict=false checks=success verdict=null [merge-train-batched]
batch 57c80b0 on main ca4cc6c: #5@beca1d1, #6@37cf79d
judge: bisect
dropped batch 57c80b0: red: bisecting #5, #6; nothing merges from it
build: #5@beca1d1 → 201 (merged)
built merge-train/batch at 01a3c58 on main ca4cc6c: #5@beca1d1
#6: remove label merge-train-batched
exit 0
batch 01a3c58 CI: success
=== train run 19:47:33Z scenario 2: half judged
required checks on main: gate, integration, browser-smoke; skip labels: do-not-merge, blocked, in-progress, changes-requested, qa-failed
#5 behind=2 conflict=false checks=success verdict=null [merge-train-batched]
#6 behind=2 conflict=false checks=success verdict=null []
batch 01a3c58 on main ca4cc6c: #5@beca1d1; suspects #5, #6
judge: merge
#5: merge → 200 (merged) {"sha":"482bb61fa0a73c29049d871c4611dce3b0e9c43a","merged":true,"message":"Pull Request successfully merged"}
merged #5; tree check passed: main 46372a3, batch prefix 1 46372a3
build: #6@37cf79d → 201 (merged)
built merge-train/batch at f80dd4b on main 482bb61: #6@37cf79d
#6: add label merge-train-batched
exit 0
batch f80dd4b CI: failure
=== train run 19:48:26Z scenario 2: last suspect judged
required checks on main: gate, integration, browser-smoke; skip labels: do-not-merge, blocked, in-progress, changes-requested, qa-failed
#6 behind=3 conflict=false checks=success verdict=null [merge-train-batched]
batch f80dd4b on main 482bb61: #6@37cf79d; suspects #6
judge: culprit
dropped batch f80dd4b: #6 is red alone: marked on head 37cf79d; nothing merges from it
#6: not batched — its head carries merge-train/verdict = failure: waits for a new push (REQ-BT03)
no batch: no PR is green on its own head
#6: add label merge-train-failed
#6: remove label merge-train-batched
exit 0
=== train run 19:50:09Z scenario 3: build (and #6 re-enters after its new push)
required checks on main: gate, integration, browser-smoke; skip labels: do-not-merge, blocked, in-progress, changes-requested, qa-failed
#6 behind=3 conflict=false checks=success verdict=null [merge-train-failed]
#7 behind=0 conflict=false checks=success verdict=null []
#8 behind=0 conflict=false checks=success verdict=null []
build: #6@9051eb9 → 201 (merged)
build: #7@3fe76f1 → 201 (merged)
build: #8@b3eaf8c → 201 (merged)
built merge-train/batch at cee56db on main 482bb61: #6@9051eb9, #7@3fe76f1, #8@b3eaf8c
#6: remove label merge-train-failed
#6: add label merge-train-batched
#7: add label merge-train-batched
#8: add label merge-train-batched
exit 0
pushed a new head to #8 while the batch CI runs
batch cee56db CI: success
=== train run 19:51:00Z scenario 3: judge after the head moved
required checks on main: gate, integration, browser-smoke; skip labels: do-not-merge, blocked, in-progress, changes-requested, qa-failed
#6 behind=3 conflict=false checks=success verdict=null [merge-train-batched]
#7 behind=0 conflict=false checks=success verdict=null [merge-train-batched]
#8 behind=0 conflict=false checks=success verdict=null [merge-train-batched]
batch cee56db on main 482bb61: #6@9051eb9, #7@3fe76f1, #8@b3eaf8c
dropped batch cee56db: a PR head moved since the batch was built (#8); nothing merges from it
build: #6@9051eb9 → 201 (merged)
build: #7@3fe76f1 → 201 (merged)
build: #8@e77609b → 201 (merged)
built merge-train/batch at ada739a on main 482bb61: #6@9051eb9, #7@3fe76f1, #8@e77609b
exit 0
batch ada739a CI: success
=== train run 19:52:01Z scenario 3: rebuilt batch judged
required checks on main: gate, integration, browser-smoke; skip labels: do-not-merge, blocked, in-progress, changes-requested, qa-failed
#6 behind=3 conflict=false checks=success verdict=null [merge-train-batched]
#7 behind=0 conflict=false checks=success verdict=null [merge-train-batched]
#8 behind=0 conflict=false checks=success verdict=null [merge-train-batched]
batch ada739a on main 482bb61: #6@9051eb9, #7@3fe76f1, #8@e77609b
judge: merge
#6: merge → 200 (merged) {"sha":"bc389c2f0c154d666950b9afce8291fb34cdffe3","merged":true,"message":"Pull Request successfully merged"}
merged #6; tree check passed: main 50312c2, batch prefix 1 50312c2
#7: merge → 200 (merged) {"sha":"d2346706c4c4b0c0b3df87ba611ed418418646cc","merged":true,"message":"Pull Request successfully merged"}
merged #7; tree check passed: main 06859cd, batch prefix 2 06859cd
#8: merge → 200 (merged) {"sha":"b2ca45d2f696e0a07137289dbefeff126a0a1729","merged":true,"message":"Pull Request successfully merged"}
merged #8; tree check passed: main c56c147, batch prefix 3 c56c147
no batch: no PR is green on its own head
exit 0
=== train run 19:54:15Z scenario 4: build red batch of three
required checks on main: gate, integration, browser-smoke; skip labels: do-not-merge, blocked, in-progress, changes-requested, qa-failed
#9 behind=0 conflict=false checks=success verdict=null []
#10 behind=0 conflict=false checks=success verdict=null []
#11 behind=0 conflict=false checks=success verdict=null []
build: #9@81e84a6 → 201 (merged)
build: #10@73cf5d0 → 201 (merged)
build: #11@812532f → 201 (merged)
built merge-train/batch at 3d0e076 on main 93b532d: #9@81e84a6, #10@73cf5d0, #11@812532f
#9: add label merge-train-batched
#10: add label merge-train-batched
#11: add label merge-train-batched
exit 0
batch 3d0e076 CI: failure
=== train run 19:55:09Z scenario 4: bisect
required checks on main: gate, integration, browser-smoke; skip labels: do-not-merge, blocked, in-progress, changes-requested, qa-failed
#9 behind=0 conflict=false checks=success verdict=null [merge-train-batched]
#10 behind=0 conflict=false checks=success verdict=null [merge-train-batched]
#11 behind=0 conflict=false checks=success verdict=null [merge-train-batched]
batch 3d0e076 on main 93b532d: #9@81e84a6, #10@73cf5d0, #11@812532f
judge: bisect
dropped batch 3d0e076: red: bisecting #9, #10, #11; nothing merges from it
build: #9@81e84a6 → 201 (merged)
build: #10@73cf5d0 → 201 (merged)
built merge-train/batch at 2b48885 on main 93b532d: #9@81e84a6, #10@73cf5d0
#11: remove label merge-train-batched
exit 0
batch 2b48885 CI: success
=== train run 19:56:11Z scenario 4: half judged
required checks on main: gate, integration, browser-smoke; skip labels: do-not-merge, blocked, in-progress, changes-requested, qa-failed
#9 behind=0 conflict=false checks=success verdict=null [merge-train-batched]
#10 behind=0 conflict=false checks=success verdict=null [merge-train-batched]
#11 behind=0 conflict=false checks=success verdict=null []
batch 2b48885 on main 93b532d: #9@81e84a6, #10@73cf5d0; suspects #9, #10, #11
judge: merge
#9: merge → 200 (merged) {"sha":"4c2b1a61af3fa459aef7c5f0bb80025c2f88990f","merged":true,"message":"Pull Request successfully merged"}
merged #9; tree check passed: main 0a499f7, batch prefix 1 0a499f7
#10: merge → 200 (merged) {"sha":"a6f2070de886a87ae2e7b3e94c23b81cea976c09","merged":true,"message":"Pull Request successfully merged"}
merged #10; tree check passed: main 84725b0, batch prefix 2 84725b0
build: #11@812532f → 201 (merged)
built merge-train/batch at cc1624b on main a6f2070: #11@812532f
#11: add label merge-train-batched
exit 0
batch cc1624b CI: failure
=== train run 19:57:11Z scenario 4: last suspect judged
required checks on main: gate, integration, browser-smoke; skip labels: do-not-merge, blocked, in-progress, changes-requested, qa-failed
#11 behind=2 conflict=false checks=success verdict=null [merge-train-batched]
batch cc1624b on main a6f2070: #11@812532f; suspects #11
judge: culprit
dropped batch cc1624b: #11 is red alone: marked on head 812532f; nothing merges from it
#11: not batched — its head carries merge-train/verdict = failure: waits for a new push (REQ-BT03)
no batch: no PR in the queue can join one (see the reasons above)
#11: add label merge-train-failed
#11: remove label merge-train-batched
exit 0
opened pause issue #12
=== train run 19:57:35Z pause check
required checks on main: gate, integration, browser-smoke; skip labels: do-not-merge, blocked, in-progress, changes-requested, qa-failed
#11 behind=2 conflict=false checks=success verdict=failure [merge-train-failed]
#11: not batched — its head carries merge-train/verdict = failure: waits for a new push (REQ-BT03)
no batch: no PR in the queue can join one (see the reasons above)
exit 0
closed pause issue #12
reopened pause issue #12 (the first run came right after creation and the label filter had not indexed it yet)
=== train run 19:58:14Z pause check, again
required checks on main: gate, integration, browser-smoke; skip labels: do-not-merge, blocked, in-progress, changes-requested, qa-failed
#11 behind=2 conflict=false checks=success verdict=failure [merge-train-failed]
paused by #12: plan and log only
batch plan (size 4, nothing is built in this run): none
  #11: not batched — its head carries merge-train/verdict = failure: waits for a new push (REQ-BT03)
exit 0
closed pause issue #12
```

</details>
