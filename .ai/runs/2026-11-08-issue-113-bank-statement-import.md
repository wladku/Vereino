# Run — issue #113: bank statement import and matching (E07-S06)

- **Goal and trigger:** cezar task `om-auto-fix-issue 113`, unattended.
- **Issue:** #113 (feature, priority-medium, risk-high). **Spec:** `.ai/specs/2026-10-27-vereino-club-payments.md`, phase 4 step 7 (REQ-030, TEST-042, B-29).
- **Branch:** `feat/issue-113-bank-statement-import` (renamed from `feat/issue-113-task`).
- **Outcome:** stopped before implementation, waiting for approval. No claim was taken and no code was written.

## Steps

1. **Concurrency check.** The issue has no assignee, no `in-progress` label and no claim comment, and no open PR references it. #109 (E07-S02), which this story depends on, is closed.
2. **Classification and FR triage.** The `feature` label applies. Nothing in `packages/app/src/modules/payments` covers statement import: no `payments_bank_*` entities, no `payments.bank.import` feature, no `/backend/payments/bank` page. The covering spec is the payments spec, phase 4 step 7.
3. **Ask First gate.**
   - The story needs a new `payments` migration: `payments_bank_imports`, `payments_bank_transactions` and `payments_payments.bank_transaction_id`. No approval is recorded on #113. D30 covers only the gateway modules, and the approvals on #109, #110, #111, #114 and #115 were each recorded for that issue only.
   - Q1 on the issue (Restore for a skipped transfer) is unanswered and blocks that action.
4. **Stop.** Posted the proposed defaults and what this run needs on the issue (issuecomment-6725218210).

## Decisions

- Stopped rather than assuming the migration was approved: the run's instructions accept Ask First items only when the issue, its spec or an owner comment records the approval.
- Proposed default for Undo: reversing entries (S10.4), not deleting payments. The spec says undo "removes the linked payments", but the #109 ledger is append-only.
- Proposed hand-written CSV/MT940 parsers in `payments/lib`, so the story needs no new dependency.

## Files changed

- `.ai/runs/2026-11-08-issue-113-bank-statement-import.md` (this log).

## Commands and results

- `gh issue view 113`, `gh issue view 109` (closed), `gh pr list --search "113 in:body"` (no open PR for #113).
- No tests or gate were run, because no code changed.

## Open problems and next steps

- The owner approves (or changes) item 1 and answers Q1 on #113, then re-runs `om-auto-fix-issue 113` on this branch.
