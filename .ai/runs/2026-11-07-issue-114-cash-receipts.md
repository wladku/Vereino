# Run — issue #114 (E07-S07, cash with KP receipts)

- **Goal and trigger:** `om-auto-fix-issue 114`, started unattended by cezar on 2026-11-07.
- **Spec / issue / branch:** `.ai/specs/2026-10-27-vereino-club-payments.md` (phase 4 step 8, REQ-031, TEST-043); #114; `feat/issue-114-cash-receipts`.
- **Outcome:** stopped before implementation. No claim was taken and no code was written.

## Steps

1. Read the issue. It is a feature, depends on #109, and has the labels `feature`, `priority-medium` and `risk-high`.
2. Checked the dependencies. #109 is closed (PR #202). The spec is `Ready for implementation` (D30). Its approval names only the `payment_gateways`/`gateway_stripe` migrations.
3. Checked the module. `payments_payments` has no `collected_by_person_id` or `receipt_number` (entity and `Migration20261106161944_payments`). `acl.ts` has no `payments.cash.record`. So the story needs a new migration.
4. Looked for a recorded approval of that migration on #114, on the epic #106 and in the spec. There is none. The #109 precedent needed an explicit owner instruction for its migration.
5. Posted the stop comment with proposed defaults: https://github.com/wladku/Vereino/issues/114#issuecomment-6710827337

## Decisions

- **Migration (Ask First):** not taken as approved. The task rules allow it only when the issue, its spec or an owner comment records the approval.
- **Payer-select route:** proposed `GET /api/payments/cash/payers`. The spec has no route that lists payers with open charges to a holder of `payments.cash.record` alone.
- **Coach path (`payments.groups.collect`):** proposed to leave it to E07-S10 (#117). A coach without `payments.cash.record` gets 403 (TEST-043).

## Files changed

- this log.

## Commands and results

- `gh issue view 114|109|106`, `gh pr view 202`: read only.
- `gh issue comment 114 --body-file …`: posted.
- No tests were run, because no code changed.

## Open problems / next steps

- Waiting for the owner to answer the three points on #114. Then rerun `om-auto-fix-issue 114`.
