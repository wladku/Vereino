# Run: issue #284 — E11-S10 payment days and automatic expiry from the management agreement

- **Goal and trigger:** cezar task (`om-auto-fix-issue 284`, label `cezar`): build phase 10 of `.ai/specs/2026-11-14-vereino-parity-facilities.md` (REQ-R07, DD-R10, DD-R11; TEST-R09, TEST-R01 deadline part; AC-R05).
- **Spec / issue / branch:** spec `Ready for implementation` (owner approval 2026-11-16 on #253: Ask First item 3 covers `clubCoreContracts.facilityAgreement`, the `facility_management` terms shape and 422 `contract_terms_invalid`; Q-R21 — expiry off by default); issue #284; depends on #279 (merged); branch `feat/issue-284-payment-days-auto-expiry`.

## Steps

1. Claimed #284 (assignee, `in-progress`, 🤖 comment). Feature route: spec found and Ready, no open PR for the issue.
2. `club_core`: `lib/contracts.ts` gains `FACILITY_TERM_FIELDS`, `MAX_PAYMENT_DEADLINE_DAYS`, `parseFacilityTerms`, `invalidFacilityTerm`, `parseContractTerms`, `facilityAgreementOf` (unit-tested, 100 %); the terms schema accepts the two keys; the contract commands store them for `facility_management` (422 `contract_terms_invalid` at the field) and snapshot them; `services/contracts.ts` `facilityAgreement(scope, institutionId, on, em?)` on the `clubCoreContracts` DI token; the list item and its OpenAPI schema carry the rental terms; `ContractForm.tsx` gains the group "Warunki wynajmu" (payment days, automatic expiry) shown only for that kind; en/pl texts; the `contract_terms_invalid` message now covers both kinds.
3. `facilities`: `lib/rentals.ts` gains `paymentDeadlineDays`, `expiryApplies`, `expiresUnpaid`, `UNPAID_EXPIRY_REASON`, `EXPIRING_CHARGE_STATES`, and `quoteRental` takes the days (unit-tested, 100 %); `services/directory.ts` `facilityAgreement`; `services/rental-slot.ts` `rentalAgreement` (place payee → agreement on a day) and the assessment's deadline from it — so the quote, the staff entry, the approval and the move all follow the agreement; `advance_lifecycle` expires the unpaid rentals (DD-R11), cancels their charge, emits `facilities.rental.cancelled`, logs the expiry, returns `expired`/`expiredIds`; the CLI prints them; the rental page names the reason.
4. Integration: `facilities/TEST-R09-agreement-terms-and-expiry.spec.ts`; fixture `LifecycleResult` gains `expired`, `expiredIds`.

## Decisions

- **Agreement of a rental at expiry time:** the agreement in force on the day the rental was entered (`created_at` in the club zone) with the place's payee as it is at the run — no column stores the payee or the agreement, so no migration (DD-R10 "no migration"). A place whose owner changes after the entry follows the new owner's agreement; noted as a follow-up for review.
- **Charge before status:** the expiry cancels the charge first, under its row lock (`cancelForSource`); a `charge_paid` warning (a payment recorded since the read) skips the rental, so a rental never becomes free while money is held. Then `advanceWhere` per rental (`requested → cancelled_free`, deadline still past).
- **Reason through the entity:** `decision_reason` is encrypted at rest, so it is set on the entity and flushed, not in the conditional `nativeUpdate`.
- **Move:** keeps recomputing the deadline (now from the agreement); keeping it for a rental with a charge is phase 11 (#285).
- **E-mail on expiry:** not sent; the cancellation template ships with E11-S12 (#286), as the issue proposes. AC-R05 stays open for that part.
- **Form:** an empty payment-days field and an unticked expiry store no terms, so the defaults apply (Q-R21: expiry off by default).

## Commands and results

- `yarn generate`: pass. `yarn typecheck`: pass.
- `jest club_core/lib/__tests__/contracts.test.ts facilities/lib/__tests__/rentals.test.ts --coverage`: 30 passed, 100 % lines/branches/functions on both files.
- `yarn test:integration:vereino --filter TEST-R09`: run 1 failed on the test — `{"error":"Validation failed","details":[{"code":"unrecognized_keys","keys":["contactName","contactPhone","requestedVia","regulationsAccepted"]...` (the quote takes only the slot fields); run 2 failed on the test — `expect(run.expiredIds).toEqual([expiringId])` received `[]`, because the test had moved the pitch to the second owner (no agreement) before the lifecycle run; the test now runs the lifecycle while the first owner owns the pitch. Run 3: 1 passed (2.2m).
- `yarn verify`: see the PR.

## Open problems / next steps

- #221 L4: existing clubs get the `facilities:rental-lifecycle` schedule only when setup re-runs; expiry runs only where the schedule exists.
- Next: review and UI QA (`needs-qa`).
