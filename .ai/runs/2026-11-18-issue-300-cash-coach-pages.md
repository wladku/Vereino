# Run: issue #300 — E12-S10 the cash and coach pages name the receiver, list today's receipts, state the club's coach mode and show when a kit was handed over

- **Goal and trigger:** cezar task (`om-auto-fix-issue 300`, label `cezar`): build phase 10 of `.ai/specs/2026-11-14-vereino-parity-payments.md` (REQ-C12; TEST-C13; AC-C12; J-C02 steps 1–2).
- **Spec / issue / branch:** spec `In progress`, Ready for implementation since the owner's approval of 2026-11-16 on #254 (the issue's "spec is Draft" open question is resolved by that approval); issue #300; branch `feat/issue-300-cash-coach-pages-receiver`.

## Steps

1. Claimed #300 (assignee, `in-progress`, 🤖 comment). Feature route: spec found and approved, no open PR for the issue.
2. Slice (a), M-15: `lib/cash.ts` `ReceiptSummary.chargeIds` (each charge once, in payment order); `services/cash.ts` `receiptCharges` (payer and decrypted description per charge) replaces `chargePayers`; `GET /api/payments/cash` adds `descriptions[]` per receipt (additive). `CashAcceptForm` takes `receiverName` and shows `payments.cash.takenBy` under the form before saving; `ClubCashPage` passes the member profile's name; `CashTodayList` shows the descriptions over "receipt · payer".
3. Slice (b), M-18: `lib/group-charges.ts` `ownGroupIds`, `ownFirst`, `COACH_PAYMENTS_HREF`, `readCoachPaymentsUrl`, `coachPaymentsHref`, `tileGroupOf`. `services/group-charges.ts`: each group carries `own` (the caller leads it as a coach), own groups first; a `groupId` outside the caller's groups throws 403 `scope_denied`. `CoachPaymentsPage`: URL state (`?group=&due=1`, `router.replace`), Suspense boundary for `useSearchParams`, 403 state with "Show my groups", scrolling chips with `(section)` for groups that are not the caller's own, the mode line on the group card, the handover badge with the time in the club's zone. `coach-client` reads with the forbidden redirect off and does not retry a 403. The Today tile links to `coachPaymentsHref({ groupId: tileGroupOf(groups), due: true })`.
4. i18n en/pl: `payments.cash.takenBy`, `payments.coach.mode.{collect,view,none}`, `payments.coach.sectionSuffix`, `payments.coach.errors.forbidden`, `payments.coach.showMyGroups`, `payments.coach.handOver.handedOverAt` (replaces the unused `handedOver`).
5. Commits: `feat(payments): M-15 names the receiver …` (the M-15 catalog key landed with the second commit) and `feat(payments): M-18 keeps the group and filter in the URL …`; this log, the spec status line and the changelog file in `docs(payments)`.
6. Tests: unit `group-charges.test.ts` (own groups, own first, URL read/write, tile group) and `cash.test.ts` (`chargeIds`); integration new `payments/TEST-C13-cash-and-coach-pages.spec.ts`; `TEST-045` now expects 403 for another coach's `groupId`.

## Decisions

- **Own group** = a group the caller leads as a coach (the mockup's `coachedGroups`). A coordinator's other section groups and, for the club administrator, every group show "(section)", as in the mockup.
- **403 for a foreign `groupId`** (spec UI row "403", issue negative AC): before, the read answered 200 and selected nothing. The spec's API row lists 403 for the route and the owner approved the spec, so this is not an unapproved contract change; TEST-045 is updated.
- **Tile group:** the coach's own group with people to pay, else the first own group, else the first group shown.
- **Receiver line on M-15 only:** the admin dialog (B-21) does not pass `receiverName`; the spec places the line on M-15.
- **AC-C12** stays unticked until the UI QA runs both pages in both locales (the integration test asserts texts through `uiText`, which accepts either language).

## Commands and results

- `yarn generate`: pass. `yarn typecheck`: pass.
- `npx jest src/modules/payments`: 296 passed; `payments/lib` 100 % lines/branches/functions.
- `yarn test:integration:vereino --filter TEST-C13`: 1 passed (3.2m), first run.
- `yarn test:integration:vereino --filter TEST-045`: 1 passed (3.1m).
- `yarn verify`: all 17 steps passed. Lint then showed one warning in the new test (`no-unnecessary-condition`, an optional chain on the receipt); fixed by typing `descriptions` in the `cashToday` fixture; `yarn typecheck:qa`, `yarn lint` (0 errors), `yarn format:check` pass after it.
- The M-18 page wraps `useSearchParams` in Suspense (the production build of the integration run passed with it).

## Open problems

- None known.

## Next steps

- UI QA of M-15 and M-18 at 375 px in both locales, light and dark (AC-C12).
