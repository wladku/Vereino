# Run — issue #114 (E07-S07, cash with KP receipts)

- **Goal and trigger:** `om-auto-fix-issue 114`, started unattended by cezar on 2026-11-07, then resumed on the owner's instruction "continue autonomously, make reasonable assumptions, do not ask".
- **Spec / issue / branch:** `.ai/specs/2026-10-27-vereino-club-payments.md` (phase 4 step 8, REQ-031, TEST-043); #114; `feat/issue-114-cash-receipts`.
- **Outcome:** implemented. `yarn verify` 14/14; TEST-043, TEST-020 and E07-S02 pass.

## Steps

1. **First pass.** Read the issue (a feature that depends on #109) and the spec (`Ready for implementation`, D30). `payments_payments` has no cash columns, so the story needs a migration. No approval was recorded, so the run stopped before claiming and posted three proposed defaults on #114 (comment 6710827337). The stop record was committed as f253471.
2. **Resume.** On the owner's instruction, posted the three defaults as taken (comment 6710833857) and claimed the issue (assignee, `in-progress`, claim comment).
3. **Data.**
   - Added `collected_by_person_id` and `receipt_number` to `Payment`, with two indexes.
   - Generated `Migration20261107174635_payments` offline (`DATABASE_URL=postgres://u:p@127.0.0.1:1/none yarn db:generate`).
   - An earlier `npx prettier` over the module had reformatted the raw-style snapshot. Restored it from git and regenerated, so the snapshot diff is the 57-line column block only. Deleted the duplicate migration.
4. **Pure rules.** `lib/cash.ts`, with 100 % coverage in `lib/__tests__/cash.test.ts`:
   - oldest-first order and allocation;
   - refusals;
   - `KP/YYYY/MM/NNN` numbering;
   - the payer summary and the receipt summary.
5. **Command `payments.cash.record`** (`commands/cash.ts`):
   - authorizes with the club administrator's grant, in create mode;
   - row-locks the selected charges in id order;
   - refuses with 422 `cash_charges_invalid`, 409 `charge_not_payable` / `charge_already_paid`, 422 `cash_exceeds_selected` / `payment_date_in_future`;
   - takes the club's advisory lock for numbering;
   - writes one payment per charge reached, all with the same receipt number;
   - enqueues the `payments.cash_received` e-mail through the foundation dispatch in the same transaction and publishes it after commit;
   - emits `payments.payment.recorded` per payment, with `receiptNumber`;
   - is not undoable.
6. **Routes:** `POST /api/payments/cash`, `GET /api/payments/cash` (received by me today), `GET /api/payments/cash/charges` and `GET /api/payments/cash/payers`. All need `payments.cash.record` and the `club_admin` scope check.
7. **UI:**
   - the shared `CashAcceptForm` (payer, charges, amount, date, e-mail switch) and `CashTodayList`;
   - the "Accept cash" button and dialog on `/backend/payments/charges` (B-21);
   - the `/club/cash` page (M-15) in a `PaymentsClubFrame`;
   - en and pl catalogs.
8. **Integration test TEST-043** (API and browser).
9. Updated the spec (Domain Vocabulary, Data Models, two API rows), added a changelog entry, and updated the module README and description.

## Decisions

- **One receipt number per acceptance, shared by its payments.** The issue asks for "one KP" when cash spreads over several charges. So `receipt_number` cannot be unique per payment row: it is indexed, and the per-club advisory lock prevents duplicates. This deviates from the spec's "unique within the club", and the spec rows are updated.
- **Numbering follows the month the cash was received** (`paidOn`): a KP's date is the receipt date.
- **"Received by me today"** is keyed on `recorded_by_user_id` and today's `paid_on` in the club's calendar. It works for a user not linked to a person and needs no extra column.
- **Coach path.** `payments.groups.collect`, DD-31/32 and `participantPersonId` are left to #117, as posted on the issue. A coach gets 403.
- **The member navigation is not changed.** `/club/cash` has no tab: adding one would change the `@vereino/ui` `memberNav` contract, and the coach's payments view (#117) is the natural entry.
- **The e-mail goes by e-mail only**, so the template declares no in-app notification type.

## Files changed

- `packages/app/src/modules/payments/`:
  - `acl.ts`, `di.ts`, `index.ts`, `README.md`;
  - `data/entities.ts`, `data/queries.ts`, `data/validators.ts`;
  - `lib/cash.ts` (+ test), `lib/error-codes.ts`, `lib/__tests__/payments-rules.test.ts`;
  - `commands/cash.ts`;
  - `services/cash.ts`, `services/ledger.ts`;
  - `emails/templates.ts`;
  - `api/cash/route.ts`, `api/cash/charges/route.ts`, `api/cash/payers/route.ts`;
  - `components/AcceptCashDialog.tsx`, `components/ChargesTable.tsx`, `components/cash/*`, `components/club/*`;
  - `frontend/club/cash/page.tsx` + `page.meta.ts`;
  - `i18n/en.json`, `i18n/pl.json`;
  - `migrations/Migration20261107174635_payments.ts`, `migrations/.snapshot-open-mercato.json`.
- `packages/app/.ai/qa/tests/payments/TEST-043-cash-with-receipts.spec.ts`, `packages/app/.ai/qa/tests/_fixtures/payments.ts`.
- `.ai/specs/2026-10-27-vereino-club-payments.md`, `.ai/specs/changelog/2026-10-27-vereino-club-payments/2026-11-07-issue-114-cash-receipts.md`.

## Commands and results

- `npx jest src/modules/payments/lib/__tests__/cash.test.ts --coverage`: 15 passed, 100/100/100/100.
- `yarn verify --from lint` failed on:
  - `react-hooks/set-state-in-effect` (two effects syncing the selection and the amount);
  - `no-unnecessary-type-assertion`.

  Fixed both: the selection and the amount are now derived state.
- `yarn verify --from ds:check` failed with `[arbitrary-tailwind] max-h-[90vh]` in `AcceptCashDialog`. Removed it; the platform dialog already scrolls.
- `yarn verify --from test` failed: `payments-rules.test.ts` lists every error code. Added the three new codes.
- `yarn test:integration:vereino --filter TEST-043`, first run: failed with 500 `invalid input syntax for type uuid: "KP/2026/11/001"`. The foundation dispatch `source.id` is a uuid column, and the command passed the receipt number. Fixed: the source is the receipt's first payment, and the receipt number stays in the idempotency key (lesson `dispatch-source-id-is-a-uuid`).
- `yarn test:integration:vereino --filter TEST-043`: 1 passed (1.3m).
- `yarn verify`: all 14 steps passed.
- Regressions: `--filter TEST-020` 1 passed (1.2m); `--filter E07-S02` 1 passed (1.3m).

## Open problems / next steps

- The owner confirms or overrides the defaults on the PR: the migration, the payer route, the #117 split and the shared receipt number.
- #117 adds the coach's `payments.groups.collect` branch to the same routes. #118 settles the cash that collectors hold.
