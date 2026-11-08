# Run — issue #111 (E07-S04, payments on Today, payer code, overdue widgets)

- **Goal and trigger:** `om-auto-fix-issue 111`, started unattended by cezar on 2026-11-08. The owner then resumed it the same day with "continue autonomously, make reasonable assumptions, do not ask".
- **Spec / issue / branch:** `.ai/specs/2026-10-27-vereino-club-payments.md` (phase 4 step 5, REQ-012, REQ-030, TEST-021); #111; `feat/issue-111-payments-today-payer-code`.
- **Outcome:** implemented. `yarn verify` passes 14/14. E07-S04 passes, and so do the regressions TEST-021, E07-S03 and TEST-003.

## Steps

1. **First pass (stop).**
   - Read the issue. It is a `feature` and depends on #110 (merged as #212), #88 and #101. The spec is `Ready for implementation`, and its step 5 note lists what #110 already shipped: M-08, M-09, the Payments tab and the Today tile.
   - FR triage: there is no `payments_payer_refs` table, no payer code and no payments dashboard widget, and no open PR references #111.
   - The club's own bank account is stored nowhere: only institutions have `bank_account`.
   - Both gaps need migrations, and nothing recorded an approval (Ask First). The run stopped before claiming and posted proposed defaults on #111 (comment 6720579426). The stop record was committed as caac39d.
2. **Resume.** On the owner's instruction, posted the defaults as taken (comment 6720585362) and claimed the issue: assignee, `in-progress` and the claim comment.
3. **Data.**
   - Added `ClubSettings.bankAccount` and the `PayerRef` entity.
   - Generated `Migration20261108105717_club_core` and `Migration20261108105717_payments` offline (`DATABASE_URL=postgres://u:p@127.0.0.1:1/none yarn db:generate`).
   - The committed `club_core` snapshot is partly prettier-formatted, and the generator rewrote all of it. Restored it from git and inserted only the new column, so its diff is 17 lines. A second `db:generate` reports "no changes" for both modules.
4. **Club setting.**
   - `bankAccount` is an NRB stored as its 26 digits, or 422 `bank_account_invalid` with a field error.
   - It flows through the update schema, `club_core.settings.update` (with undo), `GET/PUT /api/club_core/settings` and a field on B-02 in the payments group.
   - `normalizeBankAccount` and `formatBankAccount` now serve two modules, so they moved from `club_core/lib/institutions.ts` to `@vereino/core` (`bank-account.ts`). Their tests moved too, to `node:test`.
5. **Pure rules.** `payments/lib/payer-summary.ts` covers:
   - payer code generation and its format;
   - the Today summary: `due`, `paid` or `guardian_pays`;
   - the overdue summary, where families are distinct payers.

   `charge-ledger.ts` gained `chargesPerspectiveHref` and `chargePerspectiveOf`. Both files are at 100 % coverage.
6. **Services and routes** (`services/payer-overview.ts`):
   - `ensurePayerCode` assigns the code lazily. A unique violation reads back a concurrent assignment or draws a new code, with 8 attempts.
   - `myPaymentsSummary`, `transferInstructions` and `paymentsDashboard`.
   - `my-charges` gains `history`, `transfer` and `discountAmount`.
   - New routes: `GET /api/payments/my-charges/summary` and `GET /api/payments/dashboard` (`payments.view` and the `club_admin` grant).
7. **UI.**
   - Today tile: the body of `people`'s tile is the spot `vereino:club:today:payments`, filled by the `payments.injection.club-today-payments` widget, so `people` never imports `payments`.
   - M-08: each charge shows its period and discount, the history lists six paid charges, and a transfer instructions card follows.
   - B-01: the widgets `payments.dashboard.overdue` and `payments.dashboard.withoutPayer`.
   - B-21 reads `?perspective=`.
   - en and pl catalogs; "All paid." became "Everything is paid.", the issue's wording.
8. **Integration test** `E07-S04-payer-code-and-widgets`: API and browser at 375 px.
9. Spec (Data Models, API table, step 5 note), changelog file, module README and description.

## Decisions

- **The payer code is assigned on first use, not at the first charge.** The first use is the payer's read of M-08, or later the statement and the charge e-mails. This needs no backfill of existing payers and no change to the generator, cash or checkout commands. Writing a row during a GET is idempotent and is protected by both unique indexes.
- **Only a payer gets a code.** `transfer` is null for someone who pays no live charge, so non-payers get no code rows.
- **The club account is not encrypted.** The issue proposal said "encrypted like the institution's", but every payer of the club is shown it, so encryption protects nothing. The spec note records the reason.
- **"The guardian pays"** is shown when the caller pays no live charge while someone else pays a charge of their own. A charge without a payer counts for nobody.
- **"Charges without a payer"** counts open (`open`, `partially_paid`) charges with `payer_missing`. These are the ones still to fix.
- **The Today tile stays one link.** "Pay" is its visual call to action, not a nested button.

## Files changed

- `packages/core/src/bank-account.ts` (moved from `club_core/lib/institutions.ts`), `packages/core/src/__tests__/bank-account.test.mjs`, `packages/core/src/index.ts`.
- `packages/app/src/modules/club_core/`:
  - `data/entities.ts`, `data/validators.ts`;
  - `commands/settings.ts`, `commands/institutions.ts`;
  - `services/settings.ts`, `api/settings/route.ts`;
  - `components/ClubSettingsForm.tsx`, `components/InstitutionForm.tsx`, `components/InstitutionsTable.tsx`;
  - `i18n/*.json`;
  - `migrations/Migration20261108105717_club_core.ts`, `migrations/.snapshot-open-mercato.json`.
- `packages/app/src/modules/payments/`:
  - `data/entities.ts`;
  - `lib/payer-summary.ts` (+ test), `lib/charge-ledger.ts` (+ test);
  - `services/payer-overview.ts`, `services/my-charges.ts`;
  - `api/my-charges/route.ts`, `api/my-charges/summary/route.ts`, `api/dashboard/route.ts`;
  - `components/PaymentsDashboardWidget.tsx`, `components/ChargesTable.tsx`, `components/club/ClubPaymentsPage.tsx`;
  - `widgets/dashboard/{overdue,without-payer}/*`, `widgets/injection/club-today-payments/*`, `widgets/injection-table.ts`;
  - `i18n/*.json`, `README.md`, `index.ts`;
  - `migrations/Migration20261108105717_payments.ts`, `migrations/.snapshot-open-mercato.json`.
- `packages/app/src/modules/people/components/club/ClubTodayPage.tsx`, `people/i18n/*.json`.
- `packages/app/.ai/qa/tests/payments/E07-S04-payer-code-and-widgets.spec.ts`, `packages/app/.ai/qa/tests/_fixtures/payments.ts`.
- `.ai/specs/2026-10-27-vereino-club-payments.md`, `.ai/specs/changelog/2026-10-27-vereino-club-payments/2026-11-08-issue-111-payer-code-and-widgets.md`.

## Commands and results

- `npx jest src/modules/payments/lib/__tests__/payer-summary.test.ts --coverage`: 8 passed. The first run reached 93.33 % branches because line 73 (the reduce comparison) was not covered. Added cases until it reached 100/100/100/100.
- `yarn workspace @vereino/core test`: all passed, 100 % coverage.
- `yarn typecheck`, first run: failed with `src/modules/club_core/commands/settings.ts(213,43): error TS2345: Argument of type '{}' is not assignable to parameter of type 'string'.` Fixed by narrowing `patch.bankAccount`. Second run: clean.
- `npx jest src/modules/{payments,club_core,people} --coverage=false`: 25 suites, 375 tests passed.
- `yarn test:integration:vereino --filter E07-S04`, first run: initialization failed with `JSON does not support trailing commas` in `people/i18n/{en,pl}.json:460`. The `sed` that removed the unused `people.club.tiles.payments.description` key had dropped the catalog's last line. Fixed.
- `yarn test:integration:vereino --filter E07-S04`, second run: failed at `listCharges` with `GET /api/payments/charges {"error":"Unauthorized"}`. `signInBrowser` ends that user's API tokens (lesson `sign-in-browser-ends-the-api-token`), and the test kept using the old ones. Fixed by taking fresh admin and Kasia tokens from the returned passwords.
- Third run: failed at `getByTestId('club-charge').filter({ hasText: '2026-11' })`, which expected 1 and received 2. This was a wrong test assumption. Kasia also sees her ward Tomek's charge, which has no payer, as designed. Fixed: Tomek now has no guardian, so his charge still has no payer but Kasia does not see it, and the row is located by Ola's charge id.
- Fourth run: `1 passed (1.8m)`.
- Regressions: `--filter TEST-021` 1 passed (1.7m), `--filter E07-S03` 1 passed (1.9m), `--filter TEST-003` 1 passed (52.4s).
- Separate checks before the gate:
  - `yarn ds:check` failed with `[arbitrary-tailwind]` on `sm:grid-cols-[auto_1fr]` in `ClubPaymentsPage.tsx`. Replaced with `sm:grid-cols-3` and `sm:col-span-2`.
  - eslint failed with `restrict-template-expressions` (twice), `no-unnecessary-type-assertion` and `restrict-plus-operands`. Fixed all four.
- `yarn verify`, first run: failed at `i18n:check-hardcoded` with `src/modules/payments/services/payer-overview.ts:69:96 [throw-error] "attempts"`; the lint fix had turned an internal error into a template. Made it a fixed string. `yarn verify --from i18n:check-hardcoded` then passed 7/7.
- `yarn verify`, final full run: all 14 steps passed.

## Open problems / next steps

- The owner confirms or overrides the defaults on the PR:
  - the two migrations;
  - lazy assignment of the payer code;
  - the account in club settings, unencrypted;
  - the B-01 widget definitions.
- #113 (statement import) matches transfers by the payer code. The charge e-mails can show the code through `ensurePayerCode`.
- The Today tile's summary query is not invalidated after an online payment; it refreshes on the next visit to `/club`.
