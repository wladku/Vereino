# QA request e-mail: the owner gets a concrete test instruction for every PR held for his QA

**Date**: 2026-11-24
**Status**: Ready for implementation — decided by the owner on 2026-11-24

Extends: .ai/specs/2026-11-18-merge-throughput.md

> Related: `.ai/specs/2026-11-24-cezar-stall-prevention.md` (split out of it on review); MT-D02 in `.ai/specs/2026-11-18-merge-throughput.md` (unchanged: a `risk-high` + `needs-qa` PR waits for the owner's `qa`); `SDLC.md` → "QA" and "The automation contract"; `scripts/merge-train.mjs` (QA hold comment, `QA_HOLD_MARKER`); `~/vereino-alerts/vereino_alerts.py` on cezar-ws (Resend transport); the owner's PR preview `node C:\Users\wkuc\vereino-sandbox-env\sandbox.mjs preview <PR>`. Identifiers: decisions `QM-D01…`, requirements `REQ-QM01…`, tests `QM-TEST-01…`, acceptance `QM-AC-01…`.

## 📝 TLDR

The merge train holds every `risk-high` PR with `needs-qa` until the owner tests it and sets `qa` (MT-D02), and the owner keeps that confirmation. Today he learns about a held PR only by asking, and has to work out what to test: those PRs waited a median 31 h (max 74 h) from `review` to `qa`. Proposal: every PR that asks for manual QA carries a short Polish test instruction in a fixed section of its body, and when the train first holds it, the owner receives an e-mail with that instruction, the preview command and what to do afterwards.

## 📝 Problem Statement

- `review` → `qa` for `risk-high` + `needs-qa` PRs merged 19–24.11: 28.1 h, 28.2 h, 31.1 h, 73.9 h.
- PR bodies describe tests in English for developers ("TEST-086 passed"); the owner needed a person-to-person explanation for each PR on 23.11 (#530, #570, #573, #506, #609) — what to click, where the option is (#609's export panel was at the bottom of the *Dane* tab), and that the preview must be started first.
- Stall alerts are off (`transport: outbox`, `mail_transport_before_off` kept), so no message tells the owner that a PR waits for him.

## Non-goals

- Changing MT-D02: the owner's `qa` stays required; automation never sets `qa`, `qa-failed` or `qa-approved`.
- Turning all alerts back to e-mail: urgent stall alerts go to the phone (`2026-11-24-cezar-stall-prevention.md`, ST-D01); only QA requests are mailed.
- Mailing anything that is not in the public PR body (no data from the preview, no credentials).

## 📝 Proposed Solution

1. **Test instruction in the PR** — a run that adds `needs-qa` to a `risk-high` PR also writes a section between markers in the PR body:
   ```
   <!-- qa-instruction:start -->
   ## Jak przetestować (QA)
   **Co się zmienia:** 1–2 zdania prostym językiem.
   **Przygotowanie:** `node C:\Users\wkuc\vereino-sandbox-env\sandbox.mjs preview <PR>` (5–10 min), potem http://127.0.0.1:4300; konto: … (rola, nie hasło).
   **Kroki:** 3–7 numerowanych kroków: gdzie kliknąć i co ma się pokazać.
   **Czego nie sprawdzisz:** np. płatność Stripe, klucze Google — i dlaczego.
   **Po teście:** działa → etykieta `qa`; nie działa → `qa-failed` i komentarz, co poszło źle.
   <!-- qa-instruction:end -->
   ```
   Polish, no jargon, no passwords; a PR without screens says what the owner sees instead (for example "nothing to click — the check is a command; the decision session can run it for you").
2. **Missing instruction** — when the train holds a PR whose body has no `qa-instruction` block, it adds the reason "QA instruction missing" to its hold comment and the picker queues a `vereino-pr` run that writes the block (no code change).
3. **E-mail** — `vereino_alerts.py` gains the alert kind `qa-request`, sent through the Resend transport even while other kinds stay off. Once per PR and head SHA, when the train's hold comment appears (or the instruction is written later), it mails:
   - subject: `[Vereino] Do przetestowania: #<n> <title>`;
   - body: the `qa-instruction` block as plain text, the PR link, and the list of other PRs still waiting for `qa` (numbers and titles);
   - a reminder in the morning report while the PR is still held; a new mail only when the head changes after a `qa-failed` fix.
4. **Decision session** — keeps listing held PRs with the same instruction (read from the block) and may run a technical check for PRs without screens on request.

### Design Decisions and Alternatives

| Decision | Why | Alternatives | Why not |
|---|---|---|---|
| **QM-D01** The owner keeps `needs-qa` and his `qa` confirmation; MT-D02 stays (owner, 2026-11-24, replacing the earlier "merge without me"). | The owner wants a human check before risk-high changes reach `main`. | QA evidence from an independent run instead of `qa` | Rejected by the owner on 2026-11-24. |
| **QM-D02** The instruction is written into the PR body by the run that requests QA, between fixed markers. | One source for the e-mail, the decision session and anyone opening the PR; the builder knows what changed. | The mailer summarises the PR itself | A script cannot explain where to click; an agent at mail time adds latency and a second interpretation. |
| **QM-D03** QA requests by e-mail through the existing Resend transport; stall alerts by phone push (owner, 2026-11-24). | A test instruction is long and read at the desk; a stall needs attention now. | Everything by mail; everything by push | Mail was switched off once for noise; a push cannot hold a checklist. |

## 📝 Delta

### Capability: qa-request

#### ADDED — REQ-QM01 A held PR carries a QA instruction

- **Scenario** — WHEN the train holds a `risk-high` + `needs-qa` PR whose body has no `qa-instruction` block THEN its hold comment names "QA instruction missing", and the next picker pass queues a run that writes it.
- **Scenario** — WHEN the block exists THEN the hold comment links to it.

#### ADDED — REQ-QM02 The owner is mailed once per held PR and head

- **Scenario** — WHEN a PR is held with an instruction THEN one `qa-request` mail is sent with the block, the preview command and the PR link; a second check within the same head sends nothing.
- **Scenario** — WHEN the head changes after `qa-failed` and the PR is held again THEN a new mail is sent.
- **Scenario** — WHEN Resend refuses THEN the mail stays in the outbox and the decision session lists the PR.

## 📝 Architecture

- `scripts/merge-train-plan.mjs` — `hasQaInstruction(body)`; the hold reason gains "QA instruction missing"; unit tests in `packages/app/scripts/__tests__/merge-train-plan.test.mjs` (QM-TEST-01).
- `scripts/merge-train.mjs` — passes the PR body to the plan; the hold comment links the block or names it missing.
- `SDLC.md` — "QA": a `risk-high` PR asking for QA carries the `qa-instruction` block; "The automation contract": who writes it.
- Agent instructions for runs that add `needs-qa` (the `om-open-pr` repo-local override in `.ai/skills/`): write the block.
- Ops: `vereino_alerts.py` kind `qa-request` with its own sent-state file (PR → head SHA); picker rule for a missing block; the decision session reads the block.

## 📝 Edge Cases & Failure Scenarios

- **A PR body edited by a later run removes the block** → the next train run sees it missing and the picker restores it.
- **Many PRs held at once** → one mail per PR; each mail lists the others, so the owner can batch.
- **Text from the PR body in a mail** → the body is public and written by our own runs; the mailer sends it as plain text, strips HTML, and caps it at 4 000 characters.
- **The owner sets `qa` before reading the mail** → nothing else is sent for that head.

## 📋 Phasing

- **Phase 1 — The instruction** (repository: rules, train hold reason, tests).
- **Phase 2 — The e-mail** (ops on cezar-ws).

## 📋 Implementation Plan

### Phase 1 — The instruction
- Step 1.1 — `hasQaInstruction` and the hold reason; QM-TEST-01 (block present / missing / markers out of order).
- Step 1.2 — `merge-train.mjs` passes the body; QM-TEST-02 with recorded API fixtures: the hold comment names the missing block.
- Step 1.3 — `SDLC.md` and the `om-open-pr` override: runs that request QA write the block (template above).
- Step 1.4 — Backfill: one `vereino-pr` run per PR currently held writes its block. *(QM-AC-01)*

### Phase 2 — The e-mail (ops)
- Step 2.1 — Back up `vereino_alerts.py`; kind `qa-request` through Resend with the sent-state file; `--dry-run` prints the mail. Evidence: dry-run output for a held PR.
- Step 2.2 — Live mail for one held PR, confirmed by the owner. *(QM-AC-02)*

## Acceptance

- **QM-AC-01** — Every PR held for QA has a Polish `qa-instruction` block; QM-TEST-01 and QM-TEST-02 pass.
- **QM-AC-02** — When a PR is first held, the owner receives one mail with the block, the preview command and the link; no duplicate for the same head.

## Rollback

Phase 1: revert its PR (the hold comment returns to today's text). Phase 2: remove the `qa-request` kind or set its transport to `outbox`.
