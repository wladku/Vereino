# Run — E12-S03 kit campaign record (B-32) and builder notices (B-31), issue #293

- **Trigger:** Cezar queued `om-auto-fix-issue 293` (label `cezar`, 2026-11-18T20:01Z); unattended run.
- **Issue:** [#293](https://github.com/wladku/Vereino/issues/293) — E12-S03, epic #254, depends on #292 (closed).
- **Spec:** `.ai/specs/2026-11-14-vereino-parity-payments.md`, phase 3 (REQ-C05; REQ-C02 for the B-32 mount; TEST-C06, TEST-C04 for B-32; DD-C04). Ready for implementation since the owner's approval on #254 (2026-11-16).
- **Branch:** `feat/issue-293-kit-campaign-record-admin` (Cezar worktree).

## Steps

1. Claim: assignee, `in-progress`, `🤖` claim comment naming the worktree and branch. Classified as a feature; the spec covers it, so it is built directly from phase 3 (no new spec).
2. Slice (a) reads: `lib/order-campaigns.ts` (`notHandedOver`, summary `inSets` and print `participant`, `orderPaymentEntries`) with unit tests; `services/order-campaigns.ts` (row fields, guardians of missing children through `activeGuardians` + the foundation contact resolver, print child); additive response schemas of `GET /api/payments/orders`, `…/order-campaigns/{id}`, `…/summary`, `…/missing`.

## Decisions

- The supplier CSV is unchanged (Q-C11): `supplierSummaryCsv` ignores `participant` and `inSets`; its unit test still asserts the exact bytes.
- A payment row names the collector of the cash, else the person who recorded it; reversed and reversing entries and online overpayments are not listed (they are not money the order holds).
- "No order" reads guardian e-mails through `contactResolver().contacts` (decrypted in memory) and returns only `hasEmail`, never the address.
- `campaignMissing` reads guardians only when asked (`withGuardians`), so the reminder command and the "Close orders" count keep their previous queries.

## Files changed

(filled at the end of the run)

## Commands and results

(filled at the end of the run)

## Open problems

(filled at the end of the run)

## Next steps

(filled at the end of the run)
