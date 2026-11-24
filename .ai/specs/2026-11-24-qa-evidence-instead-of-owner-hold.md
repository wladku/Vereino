# QA evidence instead of the owner's hold: PRs merge without the owner

**Date**: 2026-11-24
**Status**: Ready for implementation — direction decided by the owner on 2026-11-24 ("PRs should merge without me"); this spec needs its own review before the code PR

Supersedes: .ai/specs/2026-11-18-merge-throughput.md — sections: MT-D02, REQ-MT09

> Related: `.ai/specs/2026-11-24-cezar-stall-prevention.md` (split out of it on review); `SDLC.md` → "QA" and "The automation contract"; `AGENTS.md` (browser evidence for user-facing changes: both locales, 375 px, console without errors); `scripts/merge-train-plan.mjs` (`qaHold`, `trainQueue`), `scripts/merge-train.mjs` (`readQueue`); the skills `om-auto-qa-pr` (browser evidence) and the configured browser provider `agent-browser`. Identifiers: decisions `QH-D01…`, requirements `REQ-QH01…`, tests `QH-TEST-01…`, acceptance `QH-AC-01…`.

## 📝 TLDR

Since MT-D02 the merge train holds every `risk-high` PR labelled `needs-qa` until the owner tests it and sets `qa`. Those PRs waited a median 31 h (max 74 h), and they block the stories that depend on them. The owner decided that PRs should merge without him. Proposal: the train holds such a PR until an **independent QA run** has posted machine-readable evidence that still matches the PR's code — a browser check with screenshots for PRs that change screens, a technical check (CLI, jobs, logs) for the others. The owner's `qa` still releases a PR at once, `qa-failed` still blocks, and the decision session lists merged PRs for optional sampling after the fact.

## 📝 Problem Statement

- `review` → `qa` for `risk-high` + `needs-qa` PRs merged 19–24.11: 28.1 h, 28.2 h, 31.1 h, 73.9 h.
- On 24.11 six PRs were held. Two (#663 sweep jobs, #677 export/delete/restore commands) change no screen; their manual check was done in a preview by an agent reading CLI output, logs and the database. The other four needed the owner to click through a preview.
- Held PRs block follow-ups: #633 waited on #663; #678 and #686 are stacked on #677.
- The owner's time is the only resource that does not scale; after 24.11 he asked for PRs to merge without him.

## Non-goals

- Changing anything for `risk-low`/`risk-medium` PRs or for PRs without `needs-qa`.
- Automation setting `qa`, `qa-failed` or `qa-approved` — unchanged; the train reads evidence markers instead.
- Removing `qa-failed`, `do-not-merge` or `blocked` as hard blocks.
- Production releases: merging to `main` is not deploying; the release process (`docs/ops`) keeps its own gates.

## 📝 Proposed Solution

1. **Evidence kind** — `touchesUi(files)` decides which check a PR needs. A PR changes screens when any changed path, outside `__tests__/`, `.ai/` and `docs/`, matches `\.(tsx|jsx|css|scss|svg|mdx)$`, `/i18n/[^/]+\.json$`, `^packages/ui/`, or `/(frontend|backend|widgets|emails)/`. The label `ui` (author, reviewer or owner) forces the browser check. A file list that cannot be read, or has more than 3000 files, counts as a screen change.
2. **Independent QA run** — the picker queues a `vereino-pr` QA run (a fresh session, not the run that built the PR) for each held PR:
   - **browser** (screen changes): `om-auto-qa-pr` in evidence mode against an ephemeral app with seeded data — the PR's own test plan, both locales, 375 px and desktop, console without errors, screenshots attached to the PR;
   - **technical** (no screen change): migrations on a scratch database, the CLI commands and jobs the PR adds, logs, per the PR's test plan.
   The run posts one evidence comment ending with `<!-- qh-evidence kind=browser|technical sha=<head sha> result=pass|fail -->` and sets `qa-self-verified` as a human-readable signal. It never sets `qa`.
3. **Hold rule** — a `risk-high` + `needs-qa` PR without `qa` is held until the newest marker of the required kind, in a comment authored by the automation account, says `result=pass` and is **valid**: its `sha` is the head, or `GET /compare/<sha>...<head>` changes none of the files the PR itself changes (only `main` came in). Otherwise the reason is "waits for a browser check", "waits for a technical check" or "QA evidence is stale", and the picker queues a new run. `qa` from the owner releases the PR at once.
4. **After the merge** — the decision session lists PRs merged on evidence since the last session with links to the evidence comments; the owner may sample them. A problem found later becomes a bug issue (or a revert PR), as for any merged code.

### Design Decisions and Alternatives

| Decision | Why | Alternatives | Why not |
|---|---|---|---|
| **QH-D01** No `risk-high` PR waits for the owner; an independent QA run's evidence releases it (owner, 2026-11-24, overriding ST-Q2's "screens only"). | The owner's time is the bottleneck (median 31 h); browser evidence covers what the owner clicked; the owner keeps `qa`, `qa-failed` and sampling. | Owner `qa` for screens only; keep MT-D02 | Both keep the owner on the critical path. |
| **QH-D02** The train trusts a marker tied to a SHA, not a label (review, 2026-11-24). | All automation uses one GitHub identity, so a label proves nothing about which code was checked; the SHA plus the compare rule is machine-verifiable. | `qa-self-verified` label alone | Stale after any push; unverifiable. |
| **QH-D03** File-based `touchesUi` with a `ui` override; unknown lists fail closed to the browser check. | Deterministic and testable. | A label set by the builder | The builder can omit it. |

**Residual risk:** the evidence comment is written by the same GitHub identity as the builder; independence rests on the QA run being a separate session started by the picker with its own task text. The post-merge list in the decision session is the owner's sample of that.

## 📝 Delta

### Capability: merge-train-qa-hold

#### MODIFIED — REQ-MT09 `risk-high` + `needs-qa` waits for `qa`

Becomes: a `risk-high` + `needs-qa` PR waits for `qa` **or** a valid `result=pass` evidence marker of the kind its files require.

- **Scenario: screen change, browser evidence** — WHEN a `risk-high` + `needs-qa` PR changes `packages/app/src/modules/people/components/DataExportPanel.tsx` and has a valid `kind=browser result=pass` marker THEN the train queues it.
- **Scenario: screen change, only technical evidence** — WHEN the same PR has only a `kind=technical` marker THEN the train holds it ("waits for a browser check").
- **Scenario: no screen, technical evidence** — WHEN a PR changes only `packages/app/src/modules/foundation/workers/club-job-sweep.ts` and `docs/ops/deploy.md` and has a valid `kind=technical result=pass` marker THEN the train queues it.
- **Scenario: main merged in after the check** — WHEN the marker's sha differs from the head and the compare changes none of the PR's files THEN the marker is valid.
- **Scenario: code changed after the check** — WHEN the compare changes a file the PR changes THEN the train holds it ("QA evidence is stale").
- **Scenario: failed check** — WHEN the newest marker of the kind says `result=fail` THEN the train holds it.
- **Scenario: marker by someone else** — WHEN the marker is in a comment not authored by the automation account THEN it is ignored.
- **Scenario: `ui` label / unknown files** — WHEN the PR has `ui`, or its file list cannot be read or exceeds 3000 files THEN a browser marker is required.
- **Scenario: owner label wins** — WHEN a held PR has `qa` THEN the train queues it.

Frozen by: MT-TEST-05

#### ADDED — REQ-QH01 `touchesUi(files)`

- **Scenario** — WHEN the files are `…/workers/club-job-sweep.ts` and `docs/ops/deploy.md` THEN false; WHEN they include `…/components/DataExportPanel.tsx`, `…/i18n/pl.json` or `packages/ui/src/button.ts` THEN true; WHEN the only `.tsx` is under `__tests__/` THEN false.

## 📝 Architecture

- `scripts/merge-train-plan.mjs` — `touchesUi(files)`, `parseEvidence(comments)`, `evidenceValid(marker, head, compareFiles, prFiles)`, `qaHold(pr)` returning a reason or `null`; reasons as constants.
- `scripts/merge-train.mjs` — for candidate PRs only (`risk-high` + `needs-qa` without `qa`): `GET /pulls/{n}/files` (paginated, cap 3000), the PR's comments, and `GET /compare/<sha>...<head>` when the sha differs; the automation account is the repository owner's login (configurable via `MERGE_TRAIN_EVIDENCE_AUTHOR`).
- `SDLC.md` — "QA": the new rule (supersedes MT-D02); "The automation contract": who runs QA, the marker format, that the train ignores `qa-self-verified`, that automation still never sets `qa`.
- Labels: create `ui`.
- Ops: the picker rule and the QA-run task text; the decision session's post-merge list.

## 📝 Edge Cases & Failure Scenarios

- **GitHub API errors on files, comments or compare** → hold (fail closed) with the error in the run log.
- **The QA run cannot start the app or the browser** → it posts `result=fail` with the reason; the PR stays held and the decision session lists it for the owner.
- **A QA run keeps failing on the same PR** → after two `fail` markers on the same head the picker stops queuing QA runs and queues a `vereino-pr` repair run with the findings.
- **Flaky browser evidence** → the QA run retries once before posting `fail`.
- **A screen change hidden in a `.ts` file** → the technical check runs instead of the browser check; the reviewer or the owner adds `ui`.

## 📝 Risks & Impact Review

- **Risk-high changes (auth, money, migrations, tenant scoping) merge without a human.** Mitigation: CI, review, the independent QA run with evidence tied to the code, hard blocks unchanged, post-merge sampling, and no deploy without the release process. This is the owner's explicit decision (QH-D01).
- Reversible: revert the Phase 1 PR and `qaHold` returns to MT-D02.

## 📋 Implementation Plan

### Phase 1 — Hold rule in the train
- Step 1.1 — Characterization: confirm MT-TEST-05 covers today's hold and passes.
- Step 1.2 — Create the `ui` label; `touchesUi` with QH-TEST-01 (REQ-QH01 cases).
- Step 1.3 — `parseEvidence`, `evidenceValid` and the new `qaHold`; MT-TEST-05 extended with the nine Delta scenarios.
- Step 1.4 — `merge-train.mjs` fetches files, comments and compare for candidates only; QH-TEST-02 with recorded API fixtures (fail closed on error, author check, cap).
- Step 1.5 — `SDLC.md` QA section and automation contract; the one-line `Superseded by` note on MT-D02 in the merge-throughput spec.

### Phase 2 — QA runs and the post-merge list (ops)
- Step 2.1 — Picker rule and QA-run task text (both kinds, marker format, retry, two-fail escalation). Evidence: one screen PR and one no-screen PR merged on evidence without the owner's `qa`. *(QH-AC-02)*
- Step 2.2 — Decision session: replace the "PRs waiting for your `qa`" list with "merged on evidence since the last session" and "held: QA run failed". *(QH-AC-03)*

## Acceptance

- **QH-AC-01** — QH-TEST-01, QH-TEST-02 and the extended MT-TEST-05 pass in CI.
- **QH-AC-02** — On GitHub, a `risk-high` + `needs-qa` screen PR merges after a valid browser marker, and a no-screen PR after a valid technical marker, both without `qa`.
- **QH-AC-03** — The next decision session lists both merged PRs with their evidence links.

## Rollback

Revert the Phase 1 PR: `qaHold` returns to MT-D02. Remove the picker rule; restore the session's QA list.
