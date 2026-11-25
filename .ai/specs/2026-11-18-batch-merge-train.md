# Batch merge train: one green run lands several PRs

**Date**: 2026-11-18
**Status**: In progress — approved by the owner on 2026-11-18; phases 1–2 built (#450 PR #518, #451 PR #544, rehearsal `.ai/runs/2026-11-21-issue-451-batch-train-phase-2.md`) and phase 3's code and docs landed (#698 PR #699); left: phase 3's owner switch-on (token scopes, ruleset, `MERGE_TRAIN_BATCH_SIZE` 2 then 4; `docs/ops/batch-train-switch-on.md`), which BT-AC-01…BT-AC-03 prove live (close-out IV #719)

> Related: `.ai/specs/2026-11-18-merge-throughput.md` (faster CI, failure ledger, QA rule; this spec was split out of it on review); engineering standards S14.1 and ADR-015; `SDLC.md` → "Validation gate"; `.github/workflows/merge-train.yml`, `scripts/merge-train.mjs`, `scripts/merge-train-plan.mjs` (100 % unit-tested in `packages/app/scripts/__tests__/merge-train-plan.test.mjs`); ruleset 26707580 "main: merge only when up to date and green"; `docs/ops/github-settings.md`. Identifiers: decisions `BT-D01…`, requirements `REQ-BT01…`, tests `BT-TEST-01…`, acceptance `BT-AC-01…`.

## TLDR

The merge train lands one PR per CI run because the `main` ruleset accepts only a PR that is up to date with `main`, and a squash merge makes every other PR stale again. This spec lets the train test up to four green PRs together on a batch branch built server-side, merge all of them on one green batch run, and prove after merging that `main` is the tree that was tested. A red batch is bisected; the culprit is marked on its head so it cannot re-enter until its author pushes. The ruleset drops "up to date" and instead requires a `merge-train/verified` status that only the train sets.

## Problem Statement

On 2026-11-18 the train merged #388, #374 and #386 one per 41 min CI cycle while nine PRs waited; after every merge each remaining PR was `BEHIND` and needed a full new run. GitHub's merge queue, which solves this, is available only in organization-owned repositories ("Pull request merge queues are available in any public repository owned by an organization", GitHub Docs, checked 2026-11-18); `wladku/Vereino` is user-owned, and the owner chose not to move it (BT-D01).

## Overview and Success Measures

- **North star:** median time from "PR green on its own head" to "merged" ≤ 2 h on a queue of ≥ 3 green PRs.
- **Leading indicators:** PRs merged per green batch run ≥ 2 on such a queue (baseline 1); zero merges whose tree differs from a tested tree.
- **Measured by:** the train's job summary (batch, decision, merged PRs) over 7 days.

## Goals

- **BT-01** — One green run merges several PRs without lowering the guarantee that `main` was tested in the state it ends up in.
- **BT-02** — A PR that broke a batch stays out until its head changes; good PRs of that batch still merge.
- **BT-03** — No PR reaches `main` except through the train.

## Non-goals

- Moving the repository to an organization (BT-D01).
- Automatic revert of `main` (a red `main` follows the existing quarantine and fix rules).
- Batching PRs from forks or PRs that change CI or the train (they go alone, BT-D05).

## Proposed Solution

1. **Plan** (pure, `planMergeTrain`): the queue is today's (drafts, skip labels and the MT-D02 QA rule excluded, priority then age), minus forks, minus PRs whose current head carries the train's failure status. A batch is the first `MERGE_TRAIN_BATCH_SIZE` (default 4) PRs that are green on their own head and do not conflict; a PR that touches `.github/` or `scripts/merge-train*` forms a batch alone.
2. **Build** the batch server-side, without checking out PR code: point `merge-train/batch` at `main`, then apply each PR head in order with the Merges API (`POST /repos/{owner}/{repo}/merges`, `head` = the PR head SHA). Each step leaves an intermediate commit whose tree is "`main` + the first k PRs". The final commit message carries the trailers `Merge-Train-Batch: #391@<sha>,#392@<sha>,…`, `Merge-Train-Base: <main sha>` and, during a bisection, `Merge-Train-Suspects: #…`. A PR that does not merge cleanly leaves the batch with `merge-train-conflict`.
3. **Run** CI on the batch head (`ci.yml` gains `push` on `merge-train/**`). The train judges only check runs whose `head_sha` is the current batch head; runs of an older head (cancelled by `ci.yml`'s concurrency group) are ignored. A batch pending for more than 90 min is rebuilt.
4. **Merge** when `gate`, `integration` and `browser-smoke` are green on the batch head, `main` still equals `Merge-Train-Base`, and every PR head still equals its trailer SHA. For each PR in order: set the commit status `merge-train/verified` (success, target URL = batch run) on the PR head, then squash-merge with `sha` = the trailer SHA; a 405/409 is retried three times with backoff. After each merge the train compares `main`'s tree with the batch's intermediate commit k.
5. **Red batch** — bisect: the next batch is the first half of the suspects, carried in `Merge-Train-Suspects`. A green half merges at once; the remaining suspects are tested next. A red single PR gets the commit status `merge-train/verdict` = failure on that head SHA plus the `merge-train-failed` label; the plan skips it until its head changes. A PR that is red on its own head and behind `main` still gets one `update-branch`, as today (a failure may come from an old `main`).
6. **Stop conditions** — a tree mismatch, or a merge that fails after retries, opens one issue labelled `merge-train-paused`, `priority-high`; while such an issue is open the train only plans and logs. `main` then holds a prefix of a green batch; its push CI run decides whether the quarantine/fix rules apply.

### Design Decisions and Alternatives

| Decision | Why | Alternatives | Why not |
|---|---|---|---|
| **BT-D01** Batch train in the own scripts (owner, 2026-11-18). | No repository transfer; keeps the tested train, labels and token. | GitHub merge queue; one-at-a-time train | Merge queue needs an organization-owned repository (new tokens, Railway, Cezar and document references); one-at-a-time caps throughput. |
| **BT-D02** Build the batch with the Merges API. | Same server merge engine as the squash merge, no PR code checked out next to the token, intermediate commits give the prefix trees for the tree check. | Local `git merge` in the train job | Runs PR content in a token-bearing job; a different merge engine could produce a different tree. |
| **BT-D03** Ruleset: keep the three required checks, drop `strict`, add required status `merge-train/verified`. | A batch cannot merge under `strict`; the batch run tests the exact merged tree; the new status makes a merge outside the train fail technically, not only by rule. | Keep `strict` with a bypass actor | On a user-owned repository the bypass covers the owner and every agent using the owner's login. |
| **BT-D04** Train state lives in trailers on the batch head and in commit statuses on PR heads. | No new storage and no repository-variable write scope; a status is tied to a head SHA, so a new push clears it naturally. | Repository variables; a state issue | Variables need another token scope; an issue body is free text an agent may read. |
| **BT-D05** Forks and PRs touching `.github/` or `scripts/merge-train*` never share a batch. | Such a PR changes the workflow that produces the batch's proof; alone, the risk equals today's. | Batch everything | One PR could fake the checks for three others. |

## Domain Vocabulary and Business Rules

- **Batch** — the ordered PR list in `Merge-Train-Batch`, tested as one head on `merge-train/batch`.
- **Suspects** — the PRs of a red batch not yet proven good or bad.
- **Verified** — `merge-train/verified` success on a PR head, set by the train immediately before it merges that head.
- Invariant: every commit the train adds to `main` has a tree equal to an intermediate commit of a batch whose head was green.

## Users, Permissions, and Scope

- `MERGE_TRAIN_TOKEN` (owner's fine-grained token) gains **Commit statuses: write** and **Issues: write** (pause issue); Contents, Pull requests and Workflows write stay. Owner approval required (Phase 3).
- Residual risk: anyone holding a token with commit-status write (the owner's `gh` login used by Cezar) could set `merge-train/verified` by hand. Cezar's system prompt already forbids merging; the status name is added to its forbidden actions.

## Reuse and Ownership Map

`scripts/merge-train-plan.mjs` gains batch planning, bisection and the head-verdict skip (pure); `scripts/merge-train.mjs` gains build, judge, merge and tree check, with its decision helpers extracted into a pure module covered at 100 %. `.github/workflows/ci.yml`: `push` on `merge-train/**`. `merge-train.yml`: unchanged triggers, `main`'s scripts only.

## Architecture and Data Flow

```
train run (CI completed, push to main, label change, every 15 min)
  pause issue open ─► plan and log only
  batch head exists:
    heads or main moved ─► drop batch, rebuild
    CI on batch head pending (< 90 min) ─► wait
    green ─► for each PR: status verified ─► squash-merge sha=trailer ─► tree == intermediate k? (no ─► pause issue)
    red, 1 PR ─► verdict failure on its head + merge-train-failed ─► rebuild without it
    red, n > 1 ─► rebuild with first half of suspects (Merge-Train-Suspects)
  no batch ─► plan ─► build via Merges API ─► push trailers ─► CI (push trigger)
```

## User Journeys

N/A — no end-user surface.

## UI and Interaction Contracts

N/A — no UI. Job summary: batch PRs and SHAs, suspects, decision, merged PRs, skipped PRs with reasons. Label `merge-train-batched` on PRs in the batch under test.

## Data Models

N/A — no entities (BT-D04).

## API, Command, and Error Contracts

New train-owned surfaces for `BACKWARD_COMPATIBILITY.md` "Relied on by CI": branch `merge-train/**`; trailers `Merge-Train-Batch`, `Merge-Train-Base`, `Merge-Train-Suspects`; commit statuses `merge-train/verified`, `merge-train/verdict`; labels `merge-train-batched`, `merge-train-paused`; variable `MERGE_TRAIN_BATCH_SIZE`.

## Events, Jobs, Notifications, and Cross-Module Flows

Every squash merge starts a push CI run on `main` that the next merge cancels (`ci.yml` concurrency); a batch of four therefore adds up to four short runs on `main`. Only the last one completes; it is the `main` signal the throughput spec's ledger reads.

## Security, Privacy, and Compliance

The train never checks out PR code (BT-D02); forks are excluded; CI- or train-changing PRs go alone (BT-D05); merges outside the train fail on the missing `merge-train/verified` status (BT-D03). Dropping `strict` is a weakened protection compensated by the batch run, the per-merge tree check and the verified status; it is an Ask First change approved per phase.

## Integration Coverage

- **BT-TEST-01** plan: order, size cap, forks, BT-D05 isolation, verdict skip until head change, behind-and-red update, bisection halves from suspects.
- **BT-TEST-02** judge: only checks on the current batch head count; cancelled runs of older heads ignored; 90 min age limit.
- **BT-TEST-03** merge guard: heads moved, base moved, tree comparison per prefix, retry decision for 405/409, pause on failure.
- **BT-TEST-04** trailers: format and parse round trip, malformed trailer treated as no batch.
- **Evidence:** dry run on the live queue; a rehearsal in a scratch repository with the same workflows; the first live batch of two PRs merged with the owner watching.

## Implementation Phases

### Phase 1 — plan and judge, dark (BT-01, BT-02)

Pure planning, judging and trailers (BT-TEST-01, -02, -04) with `MERGE_TRAIN_BATCH_SIZE=1`, which keeps today's behaviour. Exit: `yarn verify` green; dry run prints the batch it would build.

### Phase 2 — build, merge, tree check, rehearsal

Merges API build, `push` trigger on `merge-train/**`, merge guard and pause issue (BT-TEST-03); rehearsal in a scratch repository: a green batch of three, a red batch bisected to one culprit, a moved head dropping a batch. Exit: rehearsal log in `.ai/runs/`.

### Phase 3 — switch on (owner actions, approval required)

The train never judges `merge-train/verified` as a check (it is its own status, absent on every head it judges) and, while the ruleset requires it, sets it before every merge in one-PR mode too (#698); this code lands first. Then, in this order (`docs/ops/batch-train-switch-on.md`): token scopes (Commit statuses, Issues write); ruleset: add `merge-train/verified` (any source), then drop `strict`; then `MERGE_TRAIN_BATCH_SIZE=2` for the first live batch, supervised, then `4`. Adding the status before dropping `strict` leaves no window for a manual merge of a stale PR. `SDLC.md` "Validation gate", `docs/ops/github-settings.md`, `BACKWARD_COMPATIBILITY.md` and the agents' forbidden actions (`AGENTS.md`) are updated in the PR that precedes the owner's settings changes (#698). Exit: BT-AC-01 … BT-AC-03.

## Requirement Traceability

| Req | Requirement | Phase | Test / evidence | Acceptance |
|---|---|---|---|---|
| REQ-BT01 | Batch planning with isolation and forks excluded | 1 | BT-TEST-01 | BT-AC-01 |
| REQ-BT02 | Judge only the current batch head | 1 | BT-TEST-02 | BT-AC-01 |
| REQ-BT03 | Bisection and head-tied verdict | 1 | BT-TEST-01 | BT-AC-02 |
| REQ-BT04 | Server-side build, guarded merges, tree check, pause | 2 | BT-TEST-03, rehearsal | BT-AC-01 |
| REQ-BT05 | Ruleset with `merge-train/verified` | 3 | live check: a manual merge attempt fails | BT-AC-03 |

## Rollout, Migration, and Rollback

Phases 1-2 ship dark (size 1). Rollback at any time: size 1; close the batch branch; restore `strict` and remove `merge-train/verified` from the ruleset (in that order, so PRs are never unmergeable). An open pause issue stops the train without a deploy.

## Risks and Tradeoffs

- **Untested prefix on `main`** when merge k of n fails after retries: the prefix tree equals a tested intermediate tree only for k = n. The train pauses; `main`'s push CI decides. Rare: requires a PR to become unmergeable within seconds.
- **A red batch delays good PRs**: with four suspects, at most two further runs identify one culprit; PRs proven good merge as soon as their half is green.
- **Train bug merges wrongly**: the per-merge tree check and the pause issue bound the damage to one batch; the rehearsal precedes the switch-on.

## Acceptance Criteria

- **BT-AC-01** — A batch of ≥ 2 PRs merges on one green batch run, and after each merge `main`'s tree equals the batch's intermediate tree.
- **BT-AC-02** — In a red batch the culprit is labelled and its head marked; the other PRs merge; the culprit re-enters only after a new push.
- **BT-AC-03** — A merge attempted outside the train fails on the missing `merge-train/verified` status.

## Final Compliance Report

| Check | Result |
|---|---|
| Every requirement maps to a phase, a test or evidence, and an acceptance criterion | Pass — REQ-BT01 … REQ-BT05 (*Requirement Traceability*) |
| No blocking open question | Pass — owner decisions of 2026-11-18 recorded under *Design Decisions* |
| Tenant scope, UI, data model, i18n | N/A — repository tooling, no tenant data and no UI |
| Ask First items | Listed per phase; ruleset and token changes need the owner's approval when their phase starts |
| Staff-engineer review | Done 2026-11-18 (fresh-context subagent); 2 critical and 5 high findings addressed |

## Open Questions

None blocking for drafting. Phase 3 needs the owner's approval of the token scopes and the ruleset change at the time of the switch-on.

## Changelog

Entries live in `.ai/specs/changelog/2026-11-18-batch-merge-train/` (one file per change).
