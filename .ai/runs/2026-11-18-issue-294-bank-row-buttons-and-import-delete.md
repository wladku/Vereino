# Run — #294 E12-S04: B-29 row buttons, history table, deleting an import

- **Goal and trigger:** unattended cezar run of `om-auto-fix-issue 294` (issue labelled `cezar`), feature route.
- **Spec / issue / branch:** `.ai/specs/2026-11-14-vereino-parity-payments.md` phase 4 (REQ-C04, DD-C13, TEST-C05, TEST-C16); issue #294; branch `feat/issue-294-admin-decides-transfers`.
- **Approval:** the spec is `Ready for implementation`; Contract 5 (the new route, command, event and error code) and Q-C20 were approved by the owner on 2026-11-16 ([#254](https://github.com/wladku/Vereino/issues/254#issuecomment-6910005798)). No migration.

## Steps

1. Claimed #294 (assignee, `in-progress`, 🤖 claim comment). No open PR referenced the issue.
2. Slice (a), command and route: `deletableImports` in `lib/bank-matching.ts` (unit-tested), `importDeletability` in `services/bank.ts` (payments of any state, reversals included, so booked-then-undone blocks), `payments.bank_imports.delete` in `commands/bank.ts` (club admin, lock token through `authorizeScoped`, statement lock, `nativeDelete` of the transactions, `releaseScoped` with deferred byte cleanup, event `payments.bank_import.deleted`, audit with file name and counts, not undoable), `DELETE /api/payments/bank-imports/[id]` (204), error code `bank_import_has_bookings` (409); `GET /api/payments/bank-imports` adds `deletable` and `updatedAt`.
3. Slice (b), the page: inline `Button`s per status in the row (`RowActions` only under 640 px via `sm:` classes), focus moves to the next row after a decision (also after Assign / Skip dialogs), "Recorded automatically" badge text for `autoBooked`, `BankImportHistory` as a `DataTable` with the eight columns and a Delete row action through `useConfirmDialog` naming the counts.
4. Tests: TEST-C05 (new), TEST-042 reads the history table rows instead of `li`.
5. First TEST-C05 run failed at the 204: `{"error":"Attachment is still referenced by another record"}`. Cause: the import (#113) passed `assignments: [payments:bank_statement]` on top of the owner assignment the upload adds by itself, and `releaseScoped` refuses a file with two assignments — the same mistake as lesson `attachment-owner-assignment-and-release` (#28). Fix: new imports carry the owner assignment alone; the delete releases the owner assignment; for an import stored before this change (two assignments) the release answers 409, and the command still removes the rows so the file imports again, keeps the file and records `fileKept: true` in the audit context. TEST-C05 covers that case by adding the second assignment in SQL. Rule promoted to `AGENTS.md` → Never (second occurrence), lesson updated.

## Decisions

- Legacy files: deleting the rows but keeping the file (instead of refusing the delete) because the issue's whole point is that a wrong file must not stay stuck and block the re-import; the platform offers no sanctioned way to drop the extra assignment, and writing the `attachments` entity directly would bypass its guard. The orphaned file stays in the private partition; its id is in no response. Flagged for the owner on the PR.
- Mutation-guard wiring: the new route follows the existing payments bank routes (command bus through `commandContextForRequest`), as the other phase-4 routes do.

## Commands and results

- `yarn typecheck` — pass.
- `npx jest src/modules/payments/lib/__tests__/bank-matching.test.ts …/payments-rules.test.ts` — 45 passed.
- `yarn test:integration:vereino --filter TEST-C05` — first run failed at the 204 with `{"error":"Attachment is still referenced by another record"}` (step 5); after the fix: `1 passed (2.6m)`.
- `yarn test:integration:vereino --filter TEST-042` — `1 passed (2.7m)`.
- `yarn verify` — first run failed at `lint` with two errors in this change (`no-unnecessary-type-assertion` in `commands/bank.ts`, `no-confusing-void-expression` in `BankStatementPage.tsx`); fixed, `yarn typecheck` re-run green, `yarn verify --from lint` — all remaining steps passed (lint, format:check, ds:check, i18n, contracts, qa-texts, lessons, spec-changelogs, test, test:scripts, build); generate and the typechecks passed in the first run.

## Open problems / next steps

- Owner decision: whether legacy statement files (imports before this change) should also be removed by a one-off cleanup.
