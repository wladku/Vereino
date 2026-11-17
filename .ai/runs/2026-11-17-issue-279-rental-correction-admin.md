# Run: issue #279 — E11-S05 the rental as a record (B-24 and the rental page)

- **Goal and trigger:** cezar task (`om-auto-fix-issue 279`, label `cezar`): build phase 5 of `.ai/specs/2026-11-14-vereino-parity-facilities.md` (REQ-R04, REQ-R05; TEST-R06, TEST-R07; AC-R03).
- **Spec / issue / branch:** spec `Ready for implementation` (owner approval 2026-11-16 on #253: the `facilities` routes, commands, codes and additive fields are Ask First item 6, approved; Q-R08 confirmed); issue #279; depends on #275 (closed); branch `feat/issue-279-rental-correction-admin`.

## Steps

1. Claimed #279 (assignee, `in-progress`, 🤖 comment). Feature route: spec found and Ready, no open PR for the issue.
2. Pure rules `facilities/lib/rental-record.ts` (correction closed rule, perspectives as list filters, charge state, B-24 address state) with `lib/__tests__/rental-record.test.ts` (100 % coverage).
3. Command `facilities.rentals.update` in `commands/rentals.ts`: contact, purpose, notes; renter record for an unregistered renter (name from the record, ban check through the now exported `renterBanned`); 409 `rental_closed` (new code) unless only the notes change; undoable with a correction snapshot (replay authorized on the rental's place, so the attendant can undo too); emits `facilities.rental.updated` (already declared).
4. Route `api/rentals/route.ts`: `PUT` (update action + OpenAPI), query `id`, `view`, `from`, `to`; items gain `emailVerifiedAt`, `decisionReason`, and through `afterList` (`api/rental-facts.ts`) `payee` (name only, from `placePayee`) and `chargeState` (`payments.chargeService.statusOf`, added to the consumer type in `services/charges.ts`).
5. UI: `RentalDialog` sends `purpose`; `RentalsTable.tsx` rewritten around `?status=&view=&place=&page=` (tabs, perspective toggles, columns with payee and charge state, visible "Potwierdź wpłatę"/"Odwołaj", "Decyzja" link, row → rental page); `RentalRowActions.tsx` (shared action hook); `RentalRecord.tsx` + `backend/facilities/rentals/[id]`; en/pl catalog keys; the "Przyjęto" column is now "Źródło" (mockup).
6. Integration: `TEST-R06-rental-correction.spec.ts`, `TEST-R07-rentals-list-and-record.spec.ts`; `E08-S02-rental-pages.spec.ts` cancels through the new row button; fixtures `readRental`, `putRental`.

## Decisions

- **Unpaid perspective in SQL only:** `requested` and `payment_deadline < now`. The charge-state part of the definition cannot be filtered in SQL (cross-module); a `requested` rental whose charge is already `paid` is transient until phase 11's `confirm_paid`.
- **Correction snapshot holds contact data:** the undo must restore it; action-log snapshots are encrypted at rest. The status commands keep their contact-free snapshot.
- **Renter fields:** both `renterType` and `renterId` or 422; renter fields on a rental whose renter is already a record are 422 `rental_renter_invalid`; an unchanged value is no change (so re-sending the stored contact of a closed rental is not refused).
- **Audit entries on the page** come from `CrudForm`'s version history (`resourceKind: facilities.rental`), not a custom list.
- **"Potwierdź wpłatę"** still confirms directly; the link to the charge is E11-S11 (out of scope).

## Commands and results

- `jest src/modules/facilities/lib/__tests__/rental-record.test.ts --coverage`: 11 passed, 100 % lines/branches/functions.
- `yarn generate`, `yarn typecheck`: pass.
- `yarn test:integration:vereino --filter TEST-R06` first run failed: `Expected "chargeState": "none" Received "open"` — `payments` registers the charge service since #291, so the rental has a charge; the expectation was wrong, the feature right. Second run: 1 passed.
- `--filter TEST-R07` failed three times on test issues: `[internal] no request row for the token` (the `requestIdByToken` lookup after verification; the test now finds the pending rental through the list), and two `uiText(..., { exact: true })` used with `toContainText` on a whole section. Fourth run: 1 passed.
- `--filter E08-S02`: 1 passed.
- `yarn verify`: failed at `test` (`facilities/lib/__tests__/error-codes.test.ts` lists every code; added `rental_closed`); `yarn verify --from test`: pass; final full `yarn verify`: see the PR.

## Open problems / next steps

- Assigning a renter record does not change the payer of an existing charge (DD-19 has no update method); the charge keeps `payerDisplayName`.
- `requestIdByToken` in `_fixtures/facility-requests.ts` found no row after a successful verification in this run; not investigated (TEST-035 owns it).
- Spec stays `Ready for implementation`; AC-R03 ticked; phases 3, 4, 6–16 open. Next: review and UI QA (`needs-qa`).
