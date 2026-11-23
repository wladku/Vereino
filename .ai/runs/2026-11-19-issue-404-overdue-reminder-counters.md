# Run: overdue reminder counters per charge (#404)

- **Goal and trigger:** Cezar run of `om-auto-fix-issue` for [#404](https://github.com/wladku/Vereino/issues/404) (label `cezar`). Owner decision (a), 2026-11-19: raise `reminder_count` only for charges whose `reminderDue` is true; the message still lists every overdue charge.
- **Spec:** `.ai/specs/implemented/2026-11-14-vereino-parity-payments.md` (DD-C09, *Domain Vocabulary* → Overdue reminder). The spec already states the rule per charge, so no spec text changes; one changelog file records the alignment.
- **Branch:** `fix/issue-404-overdue-reminder-counters`.

## Steps

1. Claimed #404 (assignee, `in-progress`, `🤖` claim comment naming this worktree and branch).
2. `lib/payments-rules.ts`: `reminderBatches` returns `{ listed, reminded }` per payer (`ReminderBatch`); `reminded` = the listed charges with `reminderDue` true; a payer without any is skipped as before.
3. `services/overdue-reminders.ts`: the conditional UPDATE of the marker runs over `reminded` only; `counts.charges` counts the reminded charges (its doc already said "their marker moved on").
4. Unit test: the issue's scenario (A, B, C overdue on days 1, 4, 9) simulated for December — every charge gets its own day +1/+8/+15/+22 and exactly four reminders.
5. TEST-C14: two more charges of Adam due 3 days apart; the second run lists both and counts one; a week after the first charge's reminder only it is counted again (`[2, 1]`).
6. README of `payments` and the spec changelog file `2026-11-19-issue-404-reminder-counters.md`.

## Decisions

- Return both lists from the pure rule instead of filtering in the service, so the 100 % covered `lib/` holds the rule and the service only writes.
- The idempotency key still hashes the listed charges with their counts: a retried run on the same day reads the same counts and reuses the dispatch.

## Files changed

- `packages/app/src/modules/payments/lib/payments-rules.ts`
- `packages/app/src/modules/payments/lib/__tests__/payments-scheduled-rules.test.ts`
- `packages/app/src/modules/payments/services/overdue-reminders.ts`
- `packages/app/src/modules/payments/README.md`
- `packages/app/.ai/qa/tests/payments/TEST-C14-scheduled-jobs.spec.ts`
- `.ai/specs/changelog/2026-11-14-vereino-parity-payments/2026-11-19-issue-404-reminder-counters.md`

## Commands and results

- `yarn workspace @vereino/app jest src/modules/payments/lib/__tests__/payments-scheduled-rules.test.ts`: 15 passed.
- `yarn test:integration:vereino --filter TEST-C14`: 1 passed (1.3m).
- `yarn verify`: all 18 steps passed.
- A Python one-off that filled this log failed (`ValueError: illegal newline value`) after truncating the file; the log was rewritten with the Write tool.

## Open problems / next steps

- None.
