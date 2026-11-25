# Cezar stall prevention: the owner sees every stall, stacked PRs keep moving

**Date**: 2026-11-24
**Status**: In progress — Open Questions answered by the owner on 2026-11-24

Extends: .ai/specs/2026-11-18-merge-throughput.md

> Related: `.ai/specs/2026-11-24-qa-request-email.md` and `.ai/specs/2026-11-24-phase-level-story-start.md` (split out of this spec on review, 2026-11-24); `.ai/specs/2026-11-18-merge-throughput.md`; `SDLC.md` → "The automation contract"; `scripts/merge-train.mjs`, `scripts/merge-train-plan.mjs`. Operations outside the repository: `~/vereino-alerts/vereino_alerts.py` and the Cezar picker on the build server, the scheduled decision session on the owner's laptop. Identifiers: decisions `ST-D01…`, requirements `REQ-ST01…`, tests `ST-TEST-01…`, acceptance `ST-AC-01…`, questions `ST-Q1…`.

## 📝 TLDR

Cezar builds and the merge train lands well (17–32 merges a day), but the factory stops for hours whenever the next step needs the owner, and nobody notices: on the night of 23–24 November it was idle from about 23:30 to 08:00 UTC while its alerts went to a server outbox. This spec makes stalls visible and batched — a decision session at 9:00 and 18:00 (live since 2026-11-24), urgent alerts as phone pushes, a warning before the ready backlog runs out — and lets the merge train retarget a stacked PR to `main` itself once its base PR has merged.

## 📝 Problem Statement

Evidence from 2026-11-20…24 (server outbox, `gh`, Cezar run history):

- **Idle nights.** 24.11: six "Cezar nic nie robi od 2 h" alerts and one "Merge train nie scala od 6 h". The picker reported "nothing queued" every hour: #684 waited on a Draft spec, #633 on #663 (held for QA), #584/#591/#581 on owner decisions, #560 deferred.
- **Alerts are not delivered.** `~/.config/vereino-alerts/config.json` has `transport: outbox`; 22 alerts since 20.11 sit unread in `~/vereino-alerts/outbox`.
- **Owner questions pile up unseen.** Spec close-out III (#568) filed nine owner questions on 22.11; the owner saw them on 24.11.
- **Stacked PRs stall silently.** Cezar builds follow-ups on unmerged PRs (#559 on #530, #643 on #563, #678 and #686 on #677). The train reads only PRs whose base is `main` (`readQueue`, `scripts/merge-train.mjs:143`). After #530 merged, #559 still targeted #530's branch and nothing moved it until it was retargeted by hand. The repository has `delete_branch_on_merge: false`, so GitHub's own retargeting never fires.

## 📝 Overview and Success Measures

- **North star:** hours per day in which Cezar has no run queued or running while open work exists, ≤ 2 (baseline 24.11: about 8).
- **Leading indicators:** a stall push reaches the owner within 10 min; no stacked PR targets a merged branch for longer than one train run.
- **Measured by:** Cezar's run history and the alerts log on the build server, train run logs, for 7 days after each phase.

## Non-goals

- QA request e-mails and the start of stories before a spec is Ready (the two split-out specs). The QA hold itself (MT-D02) stays: the owner confirms `risk-high` + `needs-qa` PRs with `qa`.
- Changing `maxParallel` (MT-D04 stays); any automation setting `qa`, `qa-failed`, `qa-approved` or `guard-approved`.
- Auto-accepting the owner's questions after a timeout.
- Retargeting a stacked PR whose base was closed without merging (it is held and escalated, ST-D04).

## 📝 Proposed Solution

1. **Decision session** (ST-D05, live) — scheduled Claude Code task `vereino-sesja-decyzji` (`0 9,18 * * *`) on the owner's laptop, with `status.py`, `blockers.py` and `remote.ps1` in `C:\Users\wkuc\vereino-sandbox-env\decisions\`. It reads Cezar's state, queues repair runs for small stalls, lists owner questions with recommendations and owner-only actions, asks, and records each answer on GitHub. It never merges and never sets owner-only labels.
2. **Phone alerts** (ST-D01) — `vereino_alerts.py` gains transport `ntfy`: a POST to `https://ntfy.sh/<topic>` with a random 32-character topic kept only in `~/.config/vereino-alerts/config.json` (mode 600).
   - **Pushed:** Cezar idle 2 h, train idle 6 h, an agent asks, low backlog.
   - **Content:** the alert kind, counts and PR/issue numbers only — no titles, no text from issues, PRs, picker reports or agents.
   - **Dedupe:** one push per stall episode (an episode ends when the condition clears), one reminder after 6 h; between 23:00 and 07:00 local time pushes use ntfy priority `low` (no sound).
   - **Failure:** any send error falls back to the outbox, as today.
   - Alert text is never read back as an instruction by any agent.
3. **Low-backlog warning** (ST-D03) — every 10 min the alerts script counts issues ready to build: open, labelled `cezar`, without `blocked`, `question` or `in-progress`, no linked open PR. Below 5 it pushes "N ready, M blocked: #a #b …" under the dedupe rule; the next decision session lists the blockers first.
4. **Stacked PRs** (ST-D04) — two layers:
   - **Owner setting:** *Automatically delete head branches* on; when a base PR merges, GitHub deletes its branch and retargets the PRs on top of it to `main`.
   - **Train fallback (deterministic):** each train run also reads open PRs whose base is not `main`. For each, it looks up the PR whose head is that base branch. **Merged** → the train sets the stacked PR's base to `main` (`PATCH /pulls/{n}`), comments once, and the PR enters the normal queue on the next run (an update merges `main` in; a conflict gets `merge-train-conflict` and a repair run as today). **Closed without merging** → the train adds `blocked` and comments once that the base was closed and the PR may carry its unmerged commits; the decision session asks the owner. **Still open** → nothing.

### Design Decisions and Alternatives

| Decision | Why | Alternatives | Why not |
|---|---|---|---|
| **ST-D01** Urgent alerts as ntfy pushes, numbers only, one per episode (owner, ST-Q1 phone, ST-Q1a ntfy; content and dedupe on review). | No account, free app, delivery in seconds; numbers of a public repository leak nothing; the topic is the only secret, and a spoofed push can at worst make the owner look at the dashboard. | E-mail through Resend; Telegram bot | Mail was turned off once and sinks in the inbox; Telegram needs a bot token and an account. |
| **ST-D03** Warn when fewer than 5 issues are ready (owner, ST-Q3). | Three builds run in parallel (MT-D04); five ready issues last about half a day, enough to reach the next session. | Idle alert only (today) | It fires after 2 h of idleness. |
| **ST-D04** Keep stacking; GitHub retargets on branch deletion; the train retargets only when the base **merged** (owner, ST-Q4; merged-only on review). | Follow-ups start before the base merges; the train's rule is testable code, not a prompt. | Forbid stacking; picker-prompt fallback | Forbidding stalls follow-ups; a prompt rule cannot be unit-tested. A closed base must not land its commits through a retarget. |
| **ST-D05** Decision session at 9:00 and 18:00 (owner, 2026-11-24). | Batches every owner step into two short sessions with prepared answers. | E-mail digest | A digest cannot record answers. |

## 📝 Delta

### Capability: merge-train-stacked-prs

#### ADDED — REQ-ST01 The train retargets a stacked PR whose base PR merged

- **Scenario: base merged** — WHEN an open PR's base is `feat/x` and the PR with head `feat/x` is merged THEN the train sets the PR's base to `main`, comments once, and the next run treats it as any PR on `main`.
- **Scenario: base closed** — WHEN the PR with head `feat/x` is closed without merging THEN the train adds `blocked`, comments once, and does not retarget.
- **Scenario: base open** — WHEN the PR with head `feat/x` is open THEN the train changes nothing.
- **Scenario: no PR for the base** — WHEN no PR has head `feat/x` THEN the train changes nothing and logs it.
- **Scenario: dry run** — WHEN `MERGE_TRAIN_DRY_RUN=1` THEN the plan is logged and nothing changes.

## 📝 Architecture

- `scripts/merge-train-plan.mjs` — pure `planRetargets(stacked, basePrs)` → `[{ pr, action: 'retarget' | 'block' | 'none', reason }]`; unit tests in `packages/app/scripts/__tests__/merge-train-plan.test.mjs`.
- `scripts/merge-train.mjs` — reads open PRs with a base other than `main` and, per base branch, `GET /pulls?state=closed&head=<owner>:<branch>`; applies the plan before the queue step; one comment per PR (hidden marker, as `QA_HOLD_MARKER`).
- `SDLC.md` — stacked PRs and the retarget rule in "The automation contract".
- Ops (run-log evidence): `vereino_alerts.py`, the scheduled task, the scripts in `decisions\`.
- Owner-only: the repository setting; installing ntfy and subscribing to the topic.

## 📝 Edge Cases & Failure Scenarios

- **ntfy.sh is down or rate-limits** → the alert stays in the outbox; the next session shows it.
- **The topic leaks** → someone can read counts and numbers or push fake alerts; rotate the topic in the config.
- **The laptop is off at 9:00 or 18:00** → the session runs at the next app start; pushes still cover urgent stalls.
- **A retarget conflicts with `main`** (common after a squash merge of the base) → the next train run marks `merge-train-conflict`, and the existing repair flow handles it.
- **Two levels of stacking** (C on B on A) → after A merges only B is retargeted; C follows once B merges.
- **GitHub deletes a branch a Cezar run still works on** → only after merge; a run that finds its branch gone stops and reports.

## 📝 Risks & Impact Review

- Branch deletion on merge removes merged branches; history stays in `main` and in the PR. Reversible in settings.
- The retarget runs with the train's token and changes only the base of PRs whose base PR is merged; it never merges by itself.
- Alerts go through a third party, with numbers and counts only.

## 📋 Phasing

- **Phase 1 — Decision session** (ops, done 2026-11-24).
- **Phase 2 — Phone alerts and low-backlog warning** (ops on the build server).
- **Phase 3 — Stacked PRs** (owner setting + train code).

## 📋 Implementation Plan

### Phase 1 — Decision session (done)
- Step 1.1 — Scheduled task `vereino-sesja-decyzji` and the scripts in `C:\Users\wkuc\vereino-sandbox-env\decisions\`. Evidence: the first two session transcripts. *(ST-AC-01)*

### Phase 2 — Phone alerts and low-backlog warning (ops)
- Step 2.1 — Back up `vereino_alerts.py`; add transport `ntfy` with the content rule, episode dedupe, 6 h reminder and night priority; `--dry-run` prints the request. Evidence: dry-run output for each alert kind, showing no text beyond kind, counts and numbers.
- Step 2.2 — The owner installs ntfy and subscribes to the topic; one test push confirmed by the owner. *(ST-AC-02)*
- Step 2.3 — Low-backlog check; evidence: a forced run with the threshold at 100 produces one push, a second forced run within 6 h produces none. *(ST-AC-03)*

### Phase 3 — Stacked PRs
- Step 3.1 — Owner action: *Settings → General → Pull Requests → Automatically delete head branches*.
- Step 3.2 — `planRetargets` with unit tests ST-TEST-01 covering the five Delta scenarios.
- Step 3.3 — `merge-train.mjs` reads stacked PRs and applies the plan; ST-TEST-02 drives it with recorded API fixtures (merged base → PATCH and one comment; closed base → `blocked` and one comment; dry run → no write). *(ST-AC-04)*
- Step 3.4 — `SDLC.md`: stacked PRs and the retarget rule.

## Acceptance

- **ST-AC-01** — Two consecutive decision sessions list every owner-bound item and record the owner's answers on GitHub.
- **ST-AC-02** — A test push arrives on the owner's phone within 10 min of the alert condition.
- **ST-AC-03** — Below 5 ready issues one warning is pushed; no second push within 6 h of the same episode.
- **ST-AC-04** — ST-TEST-01 and ST-TEST-02 pass; on GitHub, a PR stacked on a merged PR targets `main` after the next train run.

## Rollback

Phase 1: disable the scheduled task. Phase 2: set `transport` back to `outbox`. Phase 3: turn the setting off and revert the train PR.

## Resolved questions

ST-Q1 phone push; ST-Q1a ntfy; ST-Q3 warn below 5; ST-Q4 keep stacking and retarget — owner, 2026-11-24. On review (2026-11-24): numbers-only content, episode dedupe and night priority; the retarget moved from the picker prompt into the train and limited to merged bases. ST-Q2 (QA) and ST-Q5 (phase-level start) belong to the two split-out specs; on ST-Q2 the owner finally kept his `qa` confirmation and asked for a QA e-mail with a concrete test instruction (2026-11-24).

## Changelog

Each change is its own file in `.ai/specs/changelog/2026-11-24-cezar-stall-prevention/`.
