# Run: #285 — E11-S11 a rental carries a charge payable to the place owner and is confirmed when the charge is paid

- **Goal and trigger:** unattended cezar run (task 4ad5c750) of `om-auto-fix-issue` on #285, queued by the `cezar` label. Feature route: facilities parity spec phase 11 (REQ-R06, REQ-R11; TEST-R08; AC-R04; DD-R09, DD-19).
- **Spec:** `.ai/specs/2026-11-14-vereino-parity-facilities.md` (Ready for implementation; Ask First item 6 — the charge seam, `statusOf`, `payerDisplayName`, 409 `rental_awaits_payment`, the `payments.payment.recorded` subscriber, `facilities.rentals.confirm_paid` — approved by the owner on 2026-11-16 on #253). Dependencies #279, #282, #284, #291 closed. **Issue:** #285, epic #253. **Branch:** `feat/issue-285-rental-charge-owner-payment`.

## Steps

1. Checked the issue's blocking question against the spec and the owner decisions on #253; claimed the issue (assignee, `in-progress`, `🤖` comment).
2. Read the DD-19 seam on both sides: since #291 the consumer type in `facilities/services/charges.ts` already had `statusOf` and `payerDisplayName`, and `api/rental-facts.ts` already read the charge state and the payee. What was left: payee and description of the charge, the confirm refusal, the subscriber and `confirm_paid`, the move keeping the deadline, the UI links and texts, the owner report.
3. Pure rules with unit tests: `lib/rental-record.ts` `awaitsPayment`, `AWAITING_CHARGE_STATES`, `rentalChargeDescription`; `lib/owner-report.ts` `ownerPayments`, `PAYMENTS_SOURCES`, `owner` and `partiallyPaidCount` in the report and its CSV; error code `rental_awaits_payment` (409).
4. Slice (a): `services/charges.ts` `rentalChargeInput` (payee from `placePayee`, payer, `facilities.charge.rentalDesc` rendered with `renderLocalized` in the club's default locale, due date) used by `facilities.rentals.create` and `facilities.rentals.approve`; the move keeps `payment_deadline` of a rental with a charge.
5. Slice (b): the confirm guard (409 `rental_awaits_payment` with `chargeId` while `statusOf` says `open`/`partially_paid`); `facilities.rentals.confirm_paid` (job context, `advanceWhere`); `subscribers/payment-recorded.ts` (no-op without the service). UI: B-24 and the rental page render "Confirm payment" of an unpaid rental as a link to B-22; `chargeState.none` reads "rental register" and is always shown on B-24; the confirm dialog of a rental without a charge says the payment is noted in the rental register only. The confirm route's OpenAPI names the new 409.
6. Slice (c): `services/owner-report.ts` reads the charge states live and the owner (`placePayee`); the route schema gains `owner`, `source` enum, `partiallyPaidCount`; `OwnerReport.tsx` shows the owner under the subtitle and the partly paid count in the payments card.
7. Tests: TEST-R08 (`facilities/TEST-R08-rental-charge.spec.ts`) with `_fixtures/facilities-charge-probe/probe.mjs` (hides `payments.chargeService`; replays `confirm_paid`) and the fixture `confirmRental` (pays the charge, waits for the subscriber). Every test that confirmed a rental directly (TEST-023, TEST-025, TEST-026, TEST-031, TEST-R06, TEST-R07, TEST-R15) now confirms through the payment; TEST-026 asserts the attendant's 409; TEST-025 expects `source: 'charges'`.
8. Spec changelog entry, AGENTS.md Never rule for scripted CRLF edits (second occurrence), lesson updated.

## Decisions

- **The confirm refusal follows the live charge state**, not just `charge_id`: a `paid` charge (missed event — the repair path), a cancelled or forfeited charge, or a charge the service does not know confirms at once; without the service every rental confirms as before.
- **The "rental register" wording replaces "no charge"** for `chargeState: none` and is now always shown on B-24 (the exit gate: "every screen says rental register" without the service).
- **The owner report's source counts all reported rentals**: only charges → `charges`, none → `rental_register` (also for an empty period), both → `mixed`. A partly paid charge is counted apart, not in the sum (Q-R01).
- **TEST-R08 sets the owner on the pitch itself**, not on a parent: the nearest-owner walk is `placePayee`'s and covered by club_core; creating a parent place would add setup without testing facilities code. A rental with no payer of any kind cannot be produced through the facilities API (an unregistered renter must have a name); its rollback is TEST-C01's.
- **Existing tests now pay the charge** through a shared fixture rather than relying on a direct confirm: since #291 every rental of the test app carries a charge, so the narrowing reaches them (the spec's "no live caller breaks" holds for production data only).
- **#221 L2** (a move vs. a future charge's due date) is taken along: the move keeps the deadline of a rental with a charge.

## Files changed

`packages/app/src/modules/facilities/`: `lib/rental-record.ts`, `lib/owner-report.ts`, `lib/error-codes.ts` and their tests; `services/charges.ts`, `services/owner-report.ts`; `commands/rentals.ts`, `commands/requests.ts`; `subscribers/payment-recorded.ts` (new); `api/rentals/[id]/confirm/route.ts`, `api/reports/owner/route.ts`; `components/RentalsTable.tsx`, `RentalRecord.tsx`, `RentalRowActions.tsx`, `rentals-client.ts`, `OwnerReport.tsx`; `i18n/en.json`, `i18n/pl.json`. QA: `_fixtures/facilities.ts`, `_fixtures/facilities-charge-probe/probe.mjs` (new), TEST-R08 (new), seven adapted specs. Docs: spec changelog entry, `AGENTS.md`, `.ai/lessons/scripted-edits-keep-lf-on-windows.md`, this log.

## Commands and results

- `npx jest src/modules/facilities/lib --coverage` → 217 passed; `owner-report.ts` and `rental-record.ts` 100 % statements/branches/functions/lines. First run: `SyntaxError: Unexpected token ')'` — a CRLF written into a test string by a Python helper; fixed with the editor.
- `yarn generate` → all generators completed; `yarn typecheck` → clean; `yarn lint` → 0 errors (74 warnings, none in the touched files).
- `yarn typecheck:qa` → first run `_fixtures/facilities.ts(537,45): error TS1161: Unterminated regular expression literal.` (a `\r?\n` mangled by a heredoc); fixed. `yarn format:check` → 20 unformatted after the scripted edits; `yarn format` fixed them.
- `ds:check`, `i18n:check-hardcoded --strict`, `contracts:check` (287 codes, 0 problems), `qa-texts:check`, `spec-changelogs:check`, `glossary:check`, `lessons:check` → pass.
- `yarn test:integration:vereino --filter TEST-R08` → first run stopped (started with the broken fixture); second run `1 passed (3.4m)`.
- `yarn test:integration:vereino --filter <ID>`, one id per run: TEST-023 `1 passed (2.8m)`, TEST-025 `1 passed (2.2m)`, TEST-026 `2 passed (1.8m)`, TEST-031 `1 passed (4.8m)`, TEST-R06 `1 passed (2.8m)`, TEST-R15 `1 passed (3.7m)`, TEST-R13 `1 passed (3.2m)`, E08-S02 `1 passed (2.0m)`.
- TEST-R07 first run: `Error: locator.click: Test timeout of 400000ms exceeded.` waiting for `getByRole('alertdialog').getByRole('button', { name: /^(?:Confirm|Potwierdź)$/ })` — the record page's "Confirm payment" of a charged rental is now a link to B-22 (intended); the test now follows the link, pays through `confirmRental` and reopens the page. Rerun `1 passed (5.4m)`.
- The task temp directory (`/tmp`) was wiped mid-run, losing one batch of logs; R06, R07, R15 were rerun with logs under the ignored `tmp/it285/`.
- `yarn test` → 100 suites, 1427 tests passed (coverage thresholds met).

- `yarn verify` → `[verify] all 17 step(s) passed`.

## Open problems

- None known. B-22 still labels a rental charge without an owner institution "the facility owner"; aligning it to "to the club's account" is a note for the payments spec (*Payee of a rental*).

## Next steps

- Review and merge the PR; AC-R04 closes with it. Phase 12 (#286, rental e-mails) is next in the facilities parity spec.
