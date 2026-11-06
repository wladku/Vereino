# Run — issue #109 (E07-S02): charges by perspective, payment recording, reversal and cancellation

- **Trigger:** cezar task "109" (`om-auto-fix-issue`, unattended). First pass stopped before claiming; resumed on the owner's instruction (2026-11-06): "continue autonomously, make reasonable assumptions, do not ask".
- **Issue:** #109, epic #106, depends on #108 (merged as #183).
- **Spec:** `.ai/specs/2026-10-27-vereino-club-payments.md`, phase 4 step 3 (REQ-011, REQ-012, TEST-020); UX concept B-21, B-22.
- **Branch:** `feat/issue-109-charges-payments-cancel`.

## Steps

1. First pass: read the issue, the spec, the #108 run log and its comments. The issue listed two blocking questions (the reverse command, Q1 perspectives), and the story needs a new migration (`payments_payments`). None had a recorded answer, so the run stopped before claiming and posted the three needs with proposed defaults on #109 (comment 6689511428). That stop record was committed (424d194).
2. Resume: the owner told the run to continue autonomously. I recorded the three defaults on #109 (comment 6689524453) and claimed the issue (assignee, `in-progress`, claim comment 6689526034).
3. Pure rules in `lib/charge-ledger.ts` (payment methods, payees, amount due, paid and remaining, the derived status, overdue, refusals for payment / cancellation / reversal, `formatZloty`, perspectives, CSV), with unit tests at 100 % coverage.
4. `Payment` entity and `Migration20261106161944_payments` (generated offline with an unreachable `DATABASE_URL`, then given a header comment and a hand-written `down()`). The snapshot diff is additions only. `reference` is encrypted at rest.
5. Commands in `commands/ledger.ts`: `payments.payments.record`, `payments.charges.cancel`, `payments.payments.reverse`. Each row-locks the charge and checks its lock token. They are not undoable.
6. Routes: `GET /api/payments/charges/{id}`, `POST /api/payments/charges/{id}/payments`, `POST /api/payments/charges/{id}/cancel`, `POST /api/payments/payments/{id}/reverse`. The list gains `overdue`, `sourceType`, `payee`, `paymentMethod`, `search`, several statuses, and per-item `paid`, `remaining`, `overdue`, `payee`, `cancelReason`.
7. `people.personDirectory.searchPersonIds` (additive). People's own `searchPersonIds` now delegates to it, so search tokens are read in one place.
8. Foundation `errors()` fills message placeholders from the details' string and number values (additive; no existing error message had a placeholder).
9. UI: B-21 (`ChargesTable`: perspective tabs, surname search, CSV export, the new columns, the row and description link to the record) and B-22 (`ChargeRecord`, `RecordPaymentDialog`, `ReasonDialog` for cancel and reverse). en and pl catalogs.
10. Integration tests: `TEST-020-manual-payments-and-overdue.spec.ts` (API) and `E07-S02-charges-and-charge-record-pages.spec.ts` (browser, axe, 375 px, dark mode).
11. Spec: API table (the detail read the issue asked for, reverse, list filters), data model (`paid_on`, `recorded_by_user_id`, the reversal unique index), UI row (perspectives, B-22), events (`payments.payment.reversed`), step 3 marked implemented, compliance row and verdict, Q-051 and Q-052. Changelog entry in `.ai/specs/changelog/2026-10-27-vereino-club-payments/`.
12. Lessons `coded-error-message-placeholders-from-details` and `sr-only-in-scrolling-table-needs-relative-wrapper`.

## Decisions

- **Reverse command (Q-052):** a negative entry naming the original, dated today in the club's calendar, with the reason as its title and in the audit context. Once per payment (unique index); `cash` and `transfer` only. Reason: the spec's ledger model (S10.4, engineering standards c-domain-concerns) says corrections are reversing entries, never edits or deletes.
- **Perspectives (Q-051):** the mockup's set with Membership fees as the default. Rentals appear only with `facilities`, which is not in this deployment, so a constant hides it. Municipality is the `payee` column and filter.
- **Not undoable:** record, cancel and reverse. Money is corrected by a reversing entry. Undoing a cancellation could also collide with a charge generated again for the same fee, person and period (partial unique index).
- **Cancel with net-zero payments:** a charge whose payments were all reversed is `open` with nothing paid, so it can be cancelled. "Has payments" means money still on it.
- **`paid_on` date instead of `paid_at` timestamptz:** the form and the AC talk about a day ("a future date → 422"), and a calendar date in the club's zone avoids midnight shifts. The spec row is updated.
- **Columns created now:** only the ones step 3 uses. The bank, cash-handover, gateway and refund columns arrive with their steps' migrations.
- **CSV export runs client-side:** it pages the same list API, so it gets the same scope, filters and names. `;` separator, UTF-8 BOM, and cells that start like a formula get a `'` prefix.
- **Search:** debtor or payer name through the people directory's hashed name tokens. A term without a word of three letters matches nothing rather than everything.
- **Received by:** `recorded_by_person_id` is the caller's `self` grant (null for an account without a person); `recorded_by_user_id` is always stored.

## Files changed

- `packages/app/src/modules/payments/`: `lib/charge-ledger.ts` (+ test), `data/entities.ts`, `data/validators.ts`, `data/queries.ts`, `encryption.ts`, `events.ts`, `lib/error-codes.ts`, `commands/ledger.ts`, `commands/shared.ts`, `services/ledger.ts`, `services/directory.ts`, `api/shared.ts`, `api/charges/route.ts`, `api/charges/[id]/route.ts`, `api/charges/[id]/payments/route.ts`, `api/charges/[id]/cancel/route.ts`, `api/payments/[id]/reverse/route.ts`, `components/ChargesTable.tsx`, `components/ChargeRecord.tsx`, `components/RecordPaymentDialog.tsx`, `components/ReasonDialog.tsx`, `components/client-helpers.ts`, `backend/payments/charges/[id]/page.tsx` + `page.meta.ts`, `backend/payments/charges/page.meta.ts`, `i18n/en.json`, `i18n/pl.json`, `index.ts`, `acl.ts`, `README.md`, `migrations/Migration20261106161944_payments.ts`, `migrations/.snapshot-open-mercato.json`.
- `packages/app/src/modules/people/services/person-directory.ts`, `person-list.ts`.
- `packages/app/src/modules/foundation/services/errors.ts`.
- `packages/app/.ai/qa/tests/_fixtures/payments.ts`, `payments/TEST-020-manual-payments-and-overdue.spec.ts`, `payments/E07-S02-charges-and-charge-record-pages.spec.ts`.
- `.ai/specs/2026-10-27-vereino-club-payments.md`, `.ai/specs/changelog/2026-10-27-vereino-club-payments/2026-11-06-issue-109-charge-ledger.md`, `.ai/lessons/coded-error-message-placeholders-from-details.md`, `.ai/lessons/sr-only-in-scrolling-table-needs-relative-wrapper.md`, `.ai/lessons.md`, this log.

## Commands and results

- `DATABASE_URL=postgres://u:p@127.0.0.1:1/none yarn db:generate`: `payments: generated Migration20261106161944_payments.ts`; every other module reported no changes. No `db:migrate` against any database.
- `yarn jest src/modules/payments/lib/__tests__/charge-ledger.test.ts`: 12 passed.
- `yarn typecheck`: exit 0.
- `yarn verify`, first run: failed at `lint` with 2 errors. One was `RecordPaymentDialog.tsx:52:5 Calling setState synchronously within an effect can trigger cascading renders`; fixed by removing the reset effect and mounting the dialog only while it is open. The other was `charge-ledger.ts:127:11 Switch is not exhaustive. Cases not matched: "all"`; fixed with an explicit `case 'all'`.
- `yarn verify --from lint`: failed at `test`. `payments vocabularies › declares the error codes with their statuses` still listed only the #108 codes; the expected table was updated. `yarn verify --from test`: 566 Jest tests passed, test:scripts passed, build passed.
- `yarn test:integration:vereino --filter TEST-020`: 1 passed (31.6 s) on the first run.
- `yarn test:integration:vereino --filter E07-S02`:
  - Run 1 failed at the axe scan of B-21: `aria-valid-attr-value` critical. The perspective tabs had no `TabsContent`, so the active tab's `aria-controls` pointed nowhere; the table now sits in the active tab's panel.
  - Runs 2 and 3 failed with `page wider than 320 px by 218 px` on B-22. A diagnostic run showed the `sr-only` "Actions" header escaping the static scroll wrapper; the wrapper is now `relative`. This is lesson `sr-only-in-scrolling-table-needs-relative-wrapper`.
  - Run 4: 1 passed (1.5 m).
- Regressions: `--filter E07-S01` 1 passed (2.0 m), `--filter TEST-018` 1 passed (1.5 m), `--filter TEST-048` 1 passed (1.5 m).
- Final `yarn verify` after all fixes: `all 14 step(s) passed`.

## Open problems / next steps

- The owner confirms or overrides the three defaults (reverse command, perspectives, migration) on the PR.
- E07-S07 ("Accept cash" with receipt numbers) and E07-S06 (bank import) build on this ledger.
