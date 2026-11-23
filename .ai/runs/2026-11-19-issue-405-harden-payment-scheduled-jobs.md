# Run: issue #405 — harden the payments scheduled jobs

- **Goal and trigger:** cezar task (`om-auto-fix-issue 405`, label `cezar`): four follow-ups from the review of #398 (E12-S11, #301) — re-register the schedules on a time zone change, quieter sweep audit, robust migration-name lookup, setup of existing clubs on the deployment checklist.
- **Spec / issue / branch:** `.ai/specs/implemented/2026-11-14-vereino-parity-payments.md` (phase 11 follow-up; spec changelog file `2026-11-19-issue-405-scheduled-jobs-hardening.md`); issue #405; branch `fix/issue-405-harden-payment-scheduled-jobs`; cezar worktree `03784dbd-…`.

## Steps

1. Claimed #405 (assignee, `in-progress`, 🤖 comment naming worktree, branch and start). Route: hardening of an existing, specified feature with no new contract → direct fix route, no new spec.
2. Read `payments/services/club-setup.ts`, `activities/subscribers/reregister-schedule.ts`, the two sweep commands, `data/queries.ts` `automaticGenerationSince`, the platform command bus (`buildLog` returning null → no `action_logs` row) and the facilities job commands.
3. Item 1: new persistent subscriber `payments/subscribers/reregister-schedules.ts` on `club_core.settings.updated` calling `setUpClubPayments`; it throws when a registration returned `false`, so the queue retries.
4. Item 2: `lib/payments-rules.ts` `sweepChangedNothing` (unit-tested); `payments.checkouts.reconcile` (counts `completed`, `failed`, `expired`, `errors`; `checked` excluded) and `payments.order_campaigns.close_due` (`closed`) return no log for an empty run.
5. Item 3: `automaticGenerationSince` takes the earliest row whose name sorts (`collate "C"`) at or after `Migration20261118201338`; lesson `migration-row-lookup-survives-regenerated-names`.
6. Item 4: new `docs/ops/deploy.md` (deployment checklist, per-club `set-up-club` for activities and payments); payments README links it.
7. TEST-C14 extended (audit counted in `action_logs` after a first failed attempt through the audit API, see below): only the campaign sweep run that closed something is audited; a club time zone change moves `generate-charges` and `overdue-reminders` to the new zone.

## Decisions

- **Facilities:** the issue asked to decide the audit volume for both modules together. The facilities job commands have no `buildLog`, so they write no audit entry at all; nothing to change there. Payments now audits only runs that changed or failed something.
- **Migration lookup by name order** rather than documenting the pitfall only: on an existing deployment it still reads migration B (unchanged behaviour); after a greenfield rebuild it reads the first regenerated migration, which already holds B's columns, so the generation starts the month after installation.
- **Deployment checklist:** `docs/ops/deploy.md` did not exist (planned for E4 per `BACKWARD_COMPATIBILITY.md`); created a minimal file holding only the post-deploy backfill steps.
- **Subscriber failure:** unlike the activities precedent (which ignores a `false`), the payments subscriber throws on a failed registration so the persistent event is retried.

## Files changed

- `packages/app/src/modules/payments/subscribers/reregister-schedules.ts` (new)
- `packages/app/src/modules/payments/commands/checkout.ts`, `commands/order-campaigns.ts`
- `packages/app/src/modules/payments/lib/payments-rules.ts`, `lib/__tests__/payments-scheduled-rules.test.ts`
- `packages/app/src/modules/payments/data/queries.ts`, `README.md`
- `packages/app/.ai/qa/tests/payments/TEST-C14-scheduled-jobs.spec.ts`
- `docs/ops/deploy.md` (new), `.ai/lessons/migration-row-lookup-survives-regenerated-names.md` (new), spec changelog file, this log

## Commands and results

- `yarn workspace @vereino/app jest src/modules/payments/lib/__tests__/payments-scheduled-rules.test.ts`: 14 passed.
- `yarn generate`: completed.
- `yarn verify` (first run, before the test fix): all 18 steps passed.
- `yarn test:integration:vereino --filter TEST-C14` (under `sg docker -c`), first run: failed twice (with retry) at the new audit assertion — `expect(closeEntries).toHaveLength(1)`, `Received length: 0`. The admin's `GET /api/audit_logs/audit-logs/actions?resourceId=<org>` does not return the system job's entries (the route narrows to the caller's own actions without `audit_logs.view_tenant`). Fixed the test, not the code: it now counts `action_logs` rows by the plain columns `resource_kind = 'payments.organization'` and `resource_id` before and after each sweep run.
- `yarn test:integration:vereino --filter TEST-C14`, second run: 1 passed (1.3m) — the empty run adds no row, the closing run adds one, and the time zone change moves both zoned schedules to `Europe/Lisbon`.
- `yarn verify` (final tree): all 18 steps passed.
- PR opened against `main` with `Closes #405`; claim released on the issue.

## Open problems / next steps

- None known. Clubs that already exist need `yarn mercato payments set-up-club` once after deployment (now on the checklist).
