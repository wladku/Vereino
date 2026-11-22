# Run: #548 — kit order form inputs get a 44 px hit area

- **Trigger**: cezar task e4f83454 (`om-auto-fix-issue 548`, label `cezar`).
- **Issue / branch**: #548 / `fix/issue-548-kit-order-form-hit-area`.

## Steps

1. Claimed #548 (assignee, `in-progress`, 🤖 claim comment naming this run).
2. Verified the defect on `main` (`8d844bdf`): the guardian kit order form (`OrderFormSection.tsx`) gave its platform `Input`s `className="min-h-11 …"`, which sizes only the wrapper `div`; the inner `<input>` stays one text line (20 px) high.
3. Fixed all five text inputs of `/club/orders/[campaignId]`, not only the two the issue names: print name, print number, e-mail, phone (`OrderFormSection.tsx`) and the link-request e-mail of the sessionless view (`ClubOrderPage.tsx`) — `className="h-12 …"` + `inputClassName="self-stretch"`, the E20-S12 rule (lesson `member-touch-targets-measure-the-hit-area`).
4. Regression check in `payments/E07-S09-guardian-kit-orders.spec.ts`: at 375 px, each of the five inputs is at least `MIN_TARGET_PX` (44) high and wide.
5. Updated the lesson: `min-h-11` + `self-stretch` is still 42 px (wrapper borders), and pages E20-S12 does not visit need their own measurement.

## Decisions

- **TEST-083 is not un-fixmed here.** The issue's second acceptance criterion names `activities/TEST-083-keyboard-attendance-and-target-size.spec.ts`, but that file is not on `main`: it lives on the unpushed branch `test/issue-532-amendment-b-test-cases` of another cezar run (d8016c17), which holds the claim on #532. Editing it here would touch another run's work. Instead this PR adds its own measurement to E07-S09, and a comment on #532 asks that run to turn the TEST-083 case back into `test` once this PR is on `main`.
- `min-h-11` was replaced by `h-12` (not kept with `self-stretch`): with 1 px wrapper borders `min-h-11` leaves the inner input 42 px, below 44.
- The three other inputs on the same form had the same defect; fixing only e-mail and phone would leave TEST-083's whole-form check failing.

## Files changed

- `packages/app/src/modules/payments/components/club/orders/OrderFormSection.tsx`
- `packages/app/src/modules/payments/components/club/orders/ClubOrderPage.tsx`
- `packages/app/.ai/qa/tests/payments/E07-S09-guardian-kit-orders.spec.ts`
- `.ai/lessons/member-touch-targets-measure-the-hit-area.md`
- this run log

## Commands and results

- `yarn test:integration:vereino --filter E07-S09`: 1 passed (42.6s).
- `yarn verify`: all 18 steps passed.

## Open problems / next steps

- #532's run un-fixmes the TEST-083 order-form case after this merges.
