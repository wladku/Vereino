# Run: issue #298 — E12-S08 a payer pays everything on the phone, a partly paid charge too, and a second guardian sees who pays

- **Goal and trigger:** cezar task (`om-auto-fix-issue 298`, label `cezar`): build phase 8 of `.ai/specs/2026-11-14-vereino-parity-payments.md` (REQ-C10; DD-C06, DD-C07; TEST-C11, TEST-C16 checkout shares; AC-C10).
- **Spec / issue / branch:** spec `In progress`, Ready for implementation since the owner's approval of 2026-11-16 on #254 (Q-C20: migration D and Contract 2 approved; Q-C03 and Q-C04 confirmed); issue #298; branch `feat/issue-298-payer-phone-payments`.

## Steps

1. Claimed #298 (assignee, `in-progress`, 🤖 comment). Feature route: spec found and approved, no open PR for the issue.
2. Slice (a), commit `feat(payments): pay what remains of a partially paid charge online`: `Checkout.chargeAmounts` (`int[]`, `ArrayType` to numbers as `facilities`' `weekdays`); migration D `Migration20261117031109_payments` from `yarn db:generate` (offline, from the snapshot): `alter table "payments_checkouts" add "charge_amounts" int[] null;`. `lib/checkout-rules.ts`: `ONLINE_PAYABLE_STATUSES`, `isOnlinePayable`, `checkoutRefusal` refuses only `paid`/`cancelled`/`forfeited` (409 `charge_not_open`), `checkoutShares`, `checkoutTotals` over shares, `fulfilmentPlan` spreads by `share ?? amountDue`. `services/checkout.ts` `checkedCharges` reads the ledger and returns the shares; `bookCapture` passes each charge's stored share; `payments.checkout.create` stores them (and snapshots them in the audit log). Route docs and the `charge_not_open` message updated.
3. Slice (b), commit `feat(payments): name the discount rule and who pays a ward in the payer reads`: `lib/payer-summary.ts` `otherPayersOf`, `OtherPayer`, state `other_pays` in `ownPaymentsSummary`; `services/payer-overview.ts` `otherPayers` (primary payers today through `people.personDirectory.primaryPayers`, first names through `findPersons`); `services/my-charges.ts` `discountName` (the rule's name, deleted rules included) and `payable` for `partially_paid` with something remaining; `GET /api/payments/my-charges` adds `otherPayers`, the summary adds `other_pays`.
4. Slice (c): `ClubPaymentsPage.tsx` — selection ticked on entry (`initialSelection`, `?pay=` via `useSearchParams` under `Suspense`), fee line in both modes, named discount, campaign card (`GET /api/payments/my-orders` with the forbidden redirect off; nothing on 403), other-payer rows, empty state only when nothing is due and nobody else pays, sticky `aria-live` summary above the bottom bar at 375 px (precedent `ClubAttendancePage`); Today tile `other_pays`; i18n en/pl (the obsolete `partlyPaid` hint replaced by `notPayable`).
5. Tests: unit `checkout-rules.test.ts` (partially paid accepted; the three refused statuses; shares; a stored share equal to the remainder books no overpayment; a share above the remainder books the difference as an overpayment; null shares keep the old spread) and `payer-summary.test.ts` (`otherPayersOf`, `other_pays`). Integration: new `payments/TEST-C11-payer-page-m08.spec.ts`; `E07-S03` updated (all four ticked on entry, untick one; the fee line now always shows).

## Decisions

- **Summary shape:** the spec names `other_pays` with `payerFirstName`; the response also carries `otherPayers[]` (additive) so the Today tile can say "Jaś: paid by Kasia" for each ward, as the AC requires.
- **Who counts as another payer:** a ward of the caller (guardian grant) whose primary payer *today* is another person. Wards without a primary payer are not listed. No charge or amount of such a ward is read for the caller.
- **`payable`** also requires something remaining, so a `partially_paid` charge with nothing left (not reachable today) is never offered.
- **`?pay=`** naming a charge that is not payable ticks nothing; once the payer touches a checkbox the stored selection replaces the initial one.
- **AC-C10** stays unticked until the UI QA runs the page in both locales (the integration test asserts texts through `uiText`, which accepts either language, in the club's default locale).

## Commands and results

- `yarn db:generate`: payments generated `Migration20261117031109_payments.ts`; every other module "no changes".
- `npx jest …/checkout-rules.test.ts --coverage`: 36 passed, 100 % lines/branches/functions; `…/payer-summary.test.ts`: 12 passed, 100 %.
- `yarn generate`: pass. `yarn typecheck`: pass.
- `yarn test:integration:vereino --filter TEST-C11`: run 1 failed on the test — `expect(locator).toContainText(expected) failed … unexpected value "Strój akademii 2026/27do 1.12Zamówienie — zamów dla dziecka"` (the card was right; the test passed an anchored `exact` pattern to `toContainText`); run 2: 1 passed (1.8m).

- `yarn test:integration:vereino --filter E07-S03`: 1 passed (1.9m).
- `yarn verify`: all 17 steps passed.
- Lesson `qa-ui-texts-from-catalogs`: the anchored `exact` pattern in `toContainText` cost a run a second time (#279, #298), so the rule moved into `AGENTS.md` → Validation.

## Open problems / next steps

- UI QA of M-08 in both locales, light and dark, at 375 px (exit gate), then tick AC-C10.
