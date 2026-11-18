# Merge throughput: PRs reach main without stalling

**Date**: 2026-11-18
**Status**: Ready for implementation — approved by the owner on 2026-11-18

> Related: engineering standards `.ai/specs/2026-10-21-engineering-standards-and-patterns.md` (S13, S14, ADR-015; this spec amends S14.1); the batch train in `.ai/specs/2026-11-18-batch-merge-train.md` (split out of this spec on review); `SDLC.md` → "Validation gate" and "The automation contract"; `.github/workflows/ci.yml`, `.github/workflows/merge-train.yml`, `scripts/merge-train.mjs`, `scripts/merge-train-plan.mjs` (unit tests in `packages/app/scripts/__tests__/merge-train-plan.test.mjs`); `packages/app/.ai/qa/tests/playwright.config.ts`. Identifiers: goals `MT-01…`, decisions `MT-D01…`, requirements `REQ-MT01…`, tests `MT-TEST-01…`, acceptance `MT-AC-01…`, questions `MT-Q1…`.

## TLDR

Cezar opens pull requests faster than the merge train lands them, so open PRs pile up and the pipeline looks stuck. A CI run took 41 min on average, one in four failed — mostly for reasons outside the PR — and a PR the train marked as failed waited up to an hour for a fix to start. This spec halves the CI run, removes the failure classes that are not the PR's fault and quarantines a broken test automatically, starts fixes from the train's labels, and writes the QA and Cezar-parallelism rules down. Merging several PRs per CI run is the separate batch-train spec.

## Problem Statement

Evidence from 2026-11-18:

- **CI is long.** 27 CI runs on PR branches: average 41 min, 7 failed (26 %). Each of the three integration shards took 30-35 min against a 45 min timeout, about 20 min of it tests.
- **Failures outside the PR.** TEST-L03 failed on #391 and #392 because it declared on that Wednesday's 17:00 session after the session had started (fixed on `main` by #390; the PRs were older). #387 conflicted with `main`. Of the failures examined, only TEST-C01 on #391 was a defect of the PR. `SDLC.md` requires quarantining a test that fails on `main`, but nothing detects it.
- **Fixes wait.** A PR labelled `merge-train-failed` or `merge-train-conflict` waits for the hourly picker, which queues at most two fix runs per pass.
- **Unclear rules.** `needs-qa` does not stop the train, so manual QA happens after the merge or not at all; `SDLC.md` says Cezar runs two builds at a time while its configuration allows six.
- The train itself merges one PR per CI run; that cap is addressed in `.ai/specs/2026-11-18-batch-merge-train.md`.

## Overview and Success Measures

- **North star:** share of failed CI runs on PR branches ≤ 10 % (baseline 26 %) with CI p50 ≤ 22 min (baseline 41).
- **Leading indicators:** time from a train label to a started fix run ≤ 10 min (baseline up to 60); quarantine issue opened within one CI cycle of the second failure.
- **Measured by:** `gh run list` over the CI workflow for 7 days after each phase.

## Goals

- **MT-01** — A CI run on a PR finishes in about half the time.
- **MT-03** — A test bound to the date or hour of the run, or broken on `main`, stops failing unrelated PRs within one day.
- **MT-04** — A PR the train marks as failed or conflicting gets a fix run within minutes.
- **MT-05** — `SDLC.md` states when QA blocks a merge and how many builds Cezar runs.

## Non-goals

- Merging several PRs per run (batch-train spec).
- A self-hosted runner (MT-D03).
- A shared production build for the shards: shards already build in parallel, so a separate build job would put install, build and upload on the critical path, and the build fixes the app URL and port (`vereino-ephemeral.mjs` picks a free port per run); rejected on review 2026-11-18.
- Faking the application's clock (MT-D05).

## Proposed Solution

1. **Six integration shards** (#399) behind the one required `integration` check.
2. **Date-safe fixtures** — a shared helper picks days at least two days ahead for declarations, bookings and sessions; existing tests that use "today" or "tomorrow" move to it.
3. **Failure ledger** — a separate, non-blocking job after each CI run on a same-repository PR or on `main` collects the run's unexpected Playwright failures (not `flaky` retry passes) by test id; when the same test id fails in two runs whose PR sets share no PR within 48 h, or fails on `main`, it opens one quarantine issue labelled `bug`, `priority-high`, `cezar`. Only test ids that match a spec file on `main` are written; no free text from the run is copied (the issue feeds an autonomous agent).
4. **Picker spreads modules** — never two queued or running issue builds of the same spec module.
5. **Fixes from events** — the train mirrors `merge-train-failed` / `merge-train-conflict` onto the PR's linked issue (the `issue-N` in the branch name), and a Cezar automation on that issue label queues a `vereino-pr` run at once. Cezar 0.16.1 polls issue labels but not pull-request labels, and its schedules run at most hourly (checked 2026-11-18), so the label has to reach an issue.
6. **Rules** — the train skips a `risk-high` PR with `needs-qa` until `qa` (MT-D02); Cezar runs at most three builds (MT-D04); both written into `SDLC.md`.

### Design Decisions and Alternatives

| Decision | Why | Alternatives | Why not |
|---|---|---|---|
| **MT-D02** The train skips a `risk-high` PR with `needs-qa` until `qa` (owner, 2026-11-18, MT-Q2). | Manual QA where the risk is; low and medium risk merge on green. | Advisory QA; every `needs-qa` waits | Advisory leaves risky changes unchecked; waiting on every PR ties throughput to the owner's time. |
| **MT-D03** GitHub-hosted runners only (owner, 2026-11-18, MT-Q3). | Measure the six shards first; the server is not a CI dependency. | Self-hosted as default or overflow | A public repository must keep fork PRs off a self-hosted runner; a server outage would stop CI. |
| **MT-D04** Cezar runs at most three builds (owner, 2026-11-18, MT-Q4). | About the rate the train lands; fewer PRs that only age. | Keep 6; back to 2 | 6 produces PRs the train cannot land; 2 leaves the train idle once it is faster. |
| **MT-D05** Date-safe fixtures instead of a frozen app clock. | The app reads the real clock in platform code; choosing dates two or more days ahead removes the class without touching the app. | Fake timers in the Next server | Invasive, platform-wide, and hides real time-zone bugs. |
| **MT-D07** The ledger reads the `results.json` artifact of the finished run only, counts unexpected failures, ignores fork runs, and writes test ids only. | One run's artifact is small; `flaky` passes are not failures; fork data and free text must not reach an issue an agent acts on. | GitHub reporter annotations; 48 h of artifacts per run | Annotations are truncated and carry free text; re-downloading 48 h per run is heavy. The 48 h history lives in the quarantine issue candidates (one open tracking issue per test id, updated with run links). |

## Domain Vocabulary and Business Rules

- **Unexpected failure** — a Playwright test whose final status is `unexpected` (failed after its retry); `flaky` (passed on retry) is not counted.
- **Disjoint runs** — two CI runs whose PR sets share no PR (a PR run's set is that PR; a `main` run's set is empty). A test failing in two disjoint runs is not caused by one PR.
- A shard that times out writes no `results.json`: the ledger records "no data" for that shard and never infers a pass.

## Users, Permissions, and Scope

N/A — repository tooling; no tenant data. The ledger job uses the workflow's `GITHUB_TOKEN` with `actions: read` and `issues: write` (no owner token), so the train's `MERGE_TRAIN_TOKEN` scopes do not change.

## Reuse and Ownership Map

- `.github/workflows/ci.yml` — shard matrix (Phase 1).
- `packages/app/.ai/qa/tests/_fixtures/` — date-safe helper (Phase 2).
- New `scripts/ci-failure-ledger.mjs` (pure, 100 % unit-tested in `packages/app/scripts/__tests__/`) and `.github/workflows/ci-failure-ledger.yml` (`workflow_run` on CI, non-blocking, reads `main`'s script like the train does).
- `scripts/merge-train-plan.mjs` — the MT-D02 skip rule.
- Operations outside the repository (Cezar configuration on the Linux server): the label automation, the picker rule and `maxParallel`; their evidence is a run log, because the repository cannot test them.

## Architecture and Data Flow

```
CI run completed (same-repo PR or main) ─► ci-failure-ledger.yml
   download this run's results.json artifacts ─► unexpected failures by test id (spec file on main)
   per test id: find/update the open tracking issue (run links) ─► second disjoint failure in 48 h or any failure on main
   ─► label the issue bug, priority-high, cezar ─► Cezar builds the test.fixme quarantine PR (SDLC.md)
train adds merge-train-failed / merge-train-conflict to the PR and its linked issue ─► Cezar automation (issue.labeled) ─► vereino-pr run; the train removes both labels when the state clears (picker PR step stays as fallback)
```

## User Journeys

N/A — no end-user surface.

## UI and Interaction Contracts

N/A — no UI.

## Data Models

N/A — no entities. State: one open GitHub issue per tracked test id, titled `test: quarantine <TEST-ID>` with a hidden marker `<!-- ci-failure-ledger:<TEST-ID> -->` and a list of run links.

## API, Command, and Error Contracts

- New workflow `ci-failure-ledger.yml` and script `scripts/ci-failure-ledger.mjs`: train-owned tooling, listed in `BACKWARD_COMPATIBILITY.md` "Relied on by CI" when it lands.
- Labels: unchanged taxonomy.

## Events, Jobs, Notifications, and Cross-Module Flows

See *Architecture and Data Flow*. The ledger never blocks a merge and never fails the CI run it reads.

## Security, Privacy, and Compliance

- `workflow_run` runs with repository secrets, so the ledger checks out `main`'s scripts only, never PR code, skips runs whose head repository is not this repository, and writes only test ids that exist as spec files on `main` plus run URLs.
- An issue the ledger labels `cezar` starts an autonomous build: its content is generated, never copied from the run.

## Integration Coverage

- **MT-TEST-03** `ci-failure-ledger`: parse `results.json` (unexpected vs flaky vs missing shard), disjoint-run rule, `main` rule, marker lookup, test-id allow-list, fork skip.
- **MT-TEST-04** date-safe helper: never today or tomorrow, respects the requested weekday, crosses month and year ends.
- **MT-TEST-05** `planMergeTrain` MT-D02 rule: `risk-high` + `needs-qa` without `qa` is skipped; with `qa`, or with another risk, it is queued; label sync mirrors `merge-train-failed`/`-conflict` onto the issue named by `issue-N` in the head branch, and not when the branch names none.
- **Evidence:** 10 CI runs after Phase 1 (p50); a replayed pair of failing artifacts in a `workflow_dispatch` dry run of the ledger; one observed label-started fix run.

## Implementation Phases

### Phase 1 — six shards (MT-01)

- #399. Exit: CI p50 over 10 PR runs ≤ 22 min, or the measured value recorded with the next lever (MT-D03 revisited).

### Phase 2 — no failures outside the PR (MT-03)

- Step 2.1 — date-safe helper (MT-TEST-04), tests that use today or tomorrow moved to it, a lesson.
- Step 2.2 — ledger script (MT-TEST-03) and workflow; dry run on replayed artifacts.
- Exit: `yarn verify` green; dry run opens and then updates one issue; no fork run reaches the issue.

### Phase 3 — rules (MT-05)

- Step 3.1 — MT-D02 in `planMergeTrain` (MT-TEST-05).
- Step 3.2 — `SDLC.md` "Validation gate" (QA rule) and "automation contract" (Cezar at three builds); `docs/ops/github-settings.md` lists only the checks the ruleset requires (`gate`, `integration`, `browser-smoke`).
- Step 3.3 — the train mirrors its two labels onto the linked issue of a PR whose branch names `issue-N` (and removes them with the PR's), so Cezar can react (MT-TEST-05 extended); a PR without a linked issue keeps the hourly picker as its path.
- Exit: `yarn verify` green.

### Operations (outside the repository, run log only)

- Cezar automation on `issue.labeled` (`merge-train-failed`, `merge-train-conflict`) queuing `vereino-pr` with the picker's task text; the run finds the open PR from the issue. Cezar 0.16.1 has no pull-request label event and no schedule shorter than one hour, so the repository part is Step 3.3.
- Picker prompt: the module-spread rule.
- `~/.cezar/config.json` `resources.maxParallel: 3`.
- Evidence: one observed label-started run within 10 min, recorded in `.ai/runs/`.

## Requirement Traceability

| Req | Requirement | Phase | Test / evidence | Acceptance |
|---|---|---|---|---|
| REQ-MT01 | Six integration shards behind one `integration` check | 1 | CI on #399, 10-run p50 | MT-AC-01 |
| REQ-MT03 | Date-safe fixtures | 2 | MT-TEST-04 | MT-AC-03 |
| REQ-MT04 | Failure ledger and quarantine issue | 2 | MT-TEST-03, dry run | MT-AC-03 |
| REQ-MT05 | Picker spreads modules | Ops | run log | MT-AC-04 |
| REQ-MT06 | Fix run on train labels (mirrored to the linked issue) | 3, Ops | MT-TEST-05, run log | MT-AC-04 |
| REQ-MT09 | `risk-high` + `needs-qa` waits for `qa` | 3 | MT-TEST-05 | MT-AC-05 |
| REQ-MT10 | Rules in `SDLC.md`, Cezar at three builds | 3, Ops | `yarn verify`, run log | MT-AC-05 |

## Rollout, Migration, and Rollback

Every phase is additive and reverts with its PR. The ledger can be disabled by disabling its workflow; the MT-D02 rule by removing it from the skip logic. Cezar changes revert in its configuration.

## Risks and Tradeoffs

- **Quarantine hides a real regression.** The disjoint-run rule keeps a PR's own breakage (seen in that PR's runs only) out; the issue carries `priority-high` and is the fix's tracking item.
- **More concurrent jobs.** Six shards make 12 jobs per PR run instead of 9, against the 20-job limit of a public repository; with several PRs running CI at once, jobs queue. Measured in Phase 1.
- **Every merge to `main` starts a push CI run** that the next merge cancels; unchanged, noted for the batch train.

## Acceptance Criteria

- **MT-AC-01** — CI p50 over 10 PR runs ≤ 22 min.
- **MT-AC-03** — A test failing in two disjoint runs within 48 h, or on `main`, gets a quarantine issue automatically; no test picks today's or tomorrow's date.
- **MT-AC-04** — A train label starts a fix run within 10 min.
- **MT-AC-05** — A `risk-high` PR with `needs-qa` stays in the queue until `qa`; `SDLC.md` and Cezar both say three builds.

## Final Compliance Report

| Check | Result |
|---|---|
| Every requirement maps to a phase, a test or evidence, and an acceptance criterion | Pass — REQ-MT01, REQ-MT03 … REQ-MT06, REQ-MT09, REQ-MT10 (*Requirement Traceability*) |
| No blocking open question | Pass — owner decisions of 2026-11-18 recorded under *Design Decisions* |
| Tenant scope, UI, data model, i18n | N/A — repository tooling, no tenant data and no UI |
| Ask First items | Listed per phase; ruleset and token changes need the owner's approval when their phase starts |
| Staff-engineer review | Done 2026-11-18 (fresh-context subagent); 2 critical and 5 high findings addressed |

## Open Questions

None blocking. MT-Q2 … MT-Q4 answered by the owner on 2026-11-18 (MT-D02 … MT-D04). MT-Q1 (train mechanism) moved to the batch-train spec. MT-Q5 (Cezar changes) answered by the review: kept as an operations section with run-log evidence.

## Changelog

Entries live in `.ai/specs/changelog/2026-11-18-merge-throughput/` (one file per change).
