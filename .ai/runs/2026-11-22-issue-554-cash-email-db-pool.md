# Run: Accept cash with the e-mail on no longer exhausts the DB pool (#554)

- **Trigger**: Cezar `om-auto-fix-issue` run on #554 (label `cezar`), follow-up to #549 / PR #553.
- **Issue**: https://github.com/wladku/Vereino/issues/554
- **Branch**: `fix/issue-554-cash-email-db-pool`
- **Spec**: none (bug fix; REQ-031 of the payments spec is unchanged).

## Goal

50 concurrent `POST /api/payments/cash` with `notify: true` all answer 201 with 50 consecutive KP numbers; inside the
write transaction the confirmation queries only with the transaction's `em`.

## Root cause

`enqueueConfirmation` ran inside the transaction after `lockReceiptNumbering` and read on other pooled connections:
`contactResolver.contacts` → `clubSettings` (club_core settings service, `getEm().fork()`) and
`chargeDescriptions` → `freshEm(container)`. The waiters on the receipt advisory lock each hold a connection; with a
pool's worth of them, the lock holder waits for a second connection until the acquire timeout (6 s) → 500.
`payments.cash.collect` had the same pattern, plus `authorizeGroupChild` reading the session scope (scope provider),
`clubClock` and `feeAccessFor` (settings) inside its transaction.

## Steps and decisions

1. Claimed #554 (assignee, `in-progress`, `🤖` claim comment naming the worktree and branch).
2. `payments/commands/cash.ts`: new `readConfirmations(ctx, scope, subject)` reads the payers' contacts, the charge
   texts and the collector's name before the transaction; `enqueueConfirmation` takes them as `reads` and then only
   calls `dispatch.enqueue(em, …)`. The reads are used only when they cover the call (same tenant/organization, the
   same grants object `authorizeScoped` used — the prefetched session scope —, the collector, the payer and every
   charge); otherwise it reads them inside as before, so a payer the prefetch could not foresee still gets the e-mail.
   - Decision: prefetch rather than pass the transaction `em` into `clubSettings`/the contact resolver, because the
     settings service belongs to `club_core` and the resolver is a foundation contract; changing either is a contract
     change, prefetching is local to `payments`.
   - Reads happen before authorization; nothing read leaves the command unless the transaction then authorizes it.
3. `payments.cash.record`: parses the raw input with `cashRecordSchema.safeParse` before the transaction and, with
   `notify`, calls `readConfirmations` with the prefetched session scope.
4. `payments.cash.collect` (`group-charges.ts`): `groupChildFacts` prefetches the session scope, the club's today and
   the fee access; `authorizeGroupChild` takes them (used only when `authorized.scope` is the prefetched scope). With
   `notify`, the payers of the selected charges (`chargePayers`, new in `services/ledger.ts`) and their confirmations
   are read before the transaction. `payments.group_charges.remind` is unchanged (no serializing lock).
5. Regression test `ISSUE-554` (copy of ISSUE-549 with an e-mail address and `notify: true`; asserts 50 × 201,
   `notified`, 50 consecutive KP numbers, 50 e-mails).
6. Lesson `no-second-pooled-connection-inside-a-write-transaction` updated (queued side effects; the "still open" note
   closed).

## Files changed

- `packages/app/src/modules/payments/commands/cash.ts`
- `packages/app/src/modules/payments/commands/group-charges.ts`
- `packages/app/src/modules/payments/services/ledger.ts`
- `packages/app/.ai/qa/tests/payments/ISSUE-554-concurrent-cash-acceptances-with-email.spec.ts`
- `.ai/lessons/no-second-pooled-connection-inside-a-write-transaction.md`
- `.ai/runs/2026-11-22-issue-554-cash-email-db-pool.md`

## Commands and results

- `yarn generate` — ok; `yarn typecheck` — ok.
- `yarn test:integration:vereino --filter ISSUE-554` with the fix — 1 passed (13.0 s for the test).
- The same test against the pre-fix `cash.ts`/`group-charges.ts` (restored afterwards) — failed on both attempts
  (1.1 m each); the server log shows 61 × `timeout exceeded when trying to connect`. The test is a real oracle.
- `--filter ISSUE-549`, `--filter TEST-043`, `--filter TEST-045` — 1 passed each.
- `yarn verify` — all 18 steps passed (one pre-existing lint warning in `packages/ui/src/member/error-summary-model.ts`).

## Open problems

- `payments.cash.collect` has no concurrency test of its own; TEST-045 proves it still works. Inside its transaction
  `groupParticipants`, `childGroupCharges` and `findGroups` already take the transaction `em`; the reads #554 named
  (scope, clock, fee access, confirmations) now happen before it.
- `payments.group_charges.remind` still reads the contacts inside its transaction; it takes no serializing lock, so
  it was left as is.

## Next steps

- PR review and merge by the owner (merge train).
