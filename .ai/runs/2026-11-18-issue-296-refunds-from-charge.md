# Run: issue #296 — E12-S06 an administrator refunds an online payment from the charge and finds every overpayment under "To refund"

- **Goal and trigger:** cezar task 7af286dc (`om-auto-fix-issue 296`, label `cezar`): build phase 6 of `.ai/specs/2026-11-14-vereino-parity-payments.md` (REQ-C08; TEST-C09; AC-C08; DD-C10; J-C05 step 4).
- **Spec / issue / branch:** spec `In progress`, Ready for implementation since the owner's approval of 2026-11-16 on #254 (the issue's "spec is Draft" open question is resolved by that approval; Q-C08 confirmed, Q-C22 answered "no"); issue #296; branch `feat/issue-296-refund-online-payment-from-charge`.

## Steps

1. Claimed #296 (assignee, `in-progress`, 🤖 comment). Feature route: spec found and approved, no open PR for the issue.
2. Slice (a), reads: `lib/charge-ledger.ts` `refundsByPayment`, `refundableOf`; `GET /api/payments/charges/{id}` adds per payment `refundable` and `refunds[]` (`source` existed since #292); `data/queries.ts` `chargeIdsToRefund` (live charges with an online overpayment whose refunds have not covered it), `services/ledger.ts` `chargesToRefund`; `GET /api/payments/charges` adds `toRefund=1` and `meta.toRefundCount`.
3. Slice (b), screens: `components/RefundDialog.tsx` (model: `ReasonDialog`, `RecordPaymentDialog`), the row action "Refund" and the refund badges and lines on B-22 (`ChargeRecord.tsx`); the perspective `to_refund` (`CHARGE_PERSPECTIVES`, `perspectiveQuery`, `visiblePerspectives({ rentals, toRefund })`) and its conditional tab on B-21 (`ChargesTable.tsx`), which falls back to the default perspective once empty.
4. i18n en/pl: `payments.charges.perspectives.to_refund`, `payments.ledger.payments.{toRefund,refunded,partlyRefunded}`, `payments.ledger.refund.*`.
5. Tests: unit `charge-ledger.test.ts` (refunds, refundable, perspectives); integration new `payments/TEST-C09-refunds-and-to-refund.spec.ts`; the payments fixture's payment type adds `refundable` and `refunds`.
6. Docs: module README (refunds paragraph), spec status line, changelog file `changelog/2026-11-14-vereino-parity-payments/2026-11-18-issue-296-phase-6.md`.

## Decisions

- **"To refund"** = a live charge holding an online overpayment (`is_overpayment`, not a reversing entry) whose amount plus its refunds is above 0 — the spec's "every online overpayment flagged to refund until it is refunded". A refundable online payment that paid its charge is not listed (it is not money held for the payer).
- **`meta.toRefundCount`** counts the club's charges whatever the list's filters, so the tab's visibility does not depend on the active perspective. The list reads are club-administrator only (`PAYMENTS_READ_KINDS`), so the count leaks nothing.
- **Tab order:** "To refund" last, after "All" (spec UI table: "… Cash payments, All, To refund when not empty"). A `?perspective=to_refund` link keeps the tab until the list loads; an empty count replaces the URL with the default perspective.
- **Dialog:** one `operationId` per opening (a retry inside one opening returns the same refund); 422 is mapped to the amount field from the error code; on 502 the dialog stays open, shows the late-capture explanation and refreshes the record, because the command renews the charge's lock token before calling the gateway (a retry with the stale token would answer 409). The dialog reads the payment from the latest record, so the refundable part updates after a refresh.
- **Badges:** an online payment shows "To refund" (overpayment still held), "Partly refunded" or "Refunded" instead of "Reversed"; its refunds are listed under its title. Reversing entries stay as their own rows.
- **No migration, no contract change:** both reads are additive; the refund route and command are unchanged.

## Commands and results

- `yarn generate`: pass. `yarn typecheck`: pass.
- `npx jest src/modules/payments`: 299 passed; `payments/lib` 100 % lines/branches/functions.
- `yarn format`: 6 files reformatted.
- `yarn test:integration:vereino --filter TEST-C09`: 1 passed (2.4m), first run — the late capture after a failed attempt answers 502 through the dialog and the API, as the base spec's known gap 1 predicts.
- `yarn verify`: all 17 steps passed.
- Commits: `feat(payments): …` reads (slice a), `feat(payments): …` dialog and perspective with TEST-C09, this log, the spec status line, the changelog file and the module README (slice b).

## Open problems

- None known.

## Next steps

- UI QA of B-21 "To refund" and the B-22 refund dialog at 375 px in both locales (AC-C08).
- E12-S07: the "to refund" line of the dashboard widget reads `meta.toRefundCount`'s source.

## Follow-up run: CI stabilization of PR #391 (2026-11-18, cezar task a3d69ff9, `om-auto-fix-pr 391`)

- **Trigger:** required checks `integration` and `integration (shard 3/3)` failed after `main` (with #385, E11-S11) was merged in.
- **Cause (test bug, semantic conflict):** TEST-C01 from #385 pinned `GET /api/payments/charges` `meta` with `toEqual({ rentalsPerspective: true })`; this PR adds `meta.toRefundCount`, so the list answered `{ rentalsPerspective: true, toRefundCount: 0 }`. Both PRs were green alone; failed on retry too, so not a flake.
- **Fix:** merged the latest `main` (clean), then TEST-C01 expects `{ rentalsPerspective: true, toRefundCount: 0 }` — a new club holds no online overpayment, so the count is deterministic and the assertion stays exact. No product code changed.
- **Commands:** `yarn test:integration:vereino --filter TEST-C01` could not run here ("Could not find a working container runtime strategy": no Docker socket access for this user); CI is the integration oracle for this step. `yarn verify`: all 17 steps passed.
- **Lesson:** `.ai/lessons/exact-meta-assertions-break-on-additive-fields.md`.

## Follow-up run: base merge of PR #391 (2026-11-18, cezar task 4d7b7729, `om-auto-fix-pr 391`)

- **Trigger:** the merge train labeled the PR `merge-train-conflict` after #389 (E12-S04, #294) landed on `main`.
- **Conflict:** only the `**Status**` line of `.ai/specs/2026-11-14-vereino-parity-payments.md`; resolved by keeping both entries (phase 6 in #296 and phase 4 in #294). Fixtures, README and i18n catalogs auto-merged; both catalogs parse.
- **Semantic check:** #294's TEST-C05 / TEST-042 assert nothing on the charges list or refunds; the only caller of the changed `visiblePerspectives` signature already uses the new shape.
- **Commands:** `yarn verify`: all 17 steps passed. Integration is left to CI (no container runtime for this user).
- **History:** a concurrent session pushed the identical merge (099423a5, empty tree diff against this run's d8f6ceb8) first; this run kept that commit and pushed only this log entry. No force-push.
