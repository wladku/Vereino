# Run — issue #111 (E07-S04, payments on Today, payer code, overdue widgets)

- **Goal and trigger:** `om-auto-fix-issue 111`, started unattended by cezar on 2026-11-08.
- **Spec / issue / branch:** `.ai/specs/2026-10-27-vereino-club-payments.md` (phase 4 step 5, REQ-012, REQ-030, TEST-021); #111; `feat/issue-111-payments-today-payer-code`.
- **Outcome:** stopped before implementation. No claim was taken and no code was written. The stop is recorded in issue comment 6720579426.

## Steps

1. Read the issue. It is a `feature` and depends on #110, #88 and #101. #110 has landed as #212. The spec is `Ready for implementation`. Phase 4 step 5 lists what #110 already shipped: M-08, M-09, the Payments tab and the Today tile. Still to do: the widgets and the payer code.
2. Ran the FR triage. No `payments_payer_refs` entity, no payer code and no dashboard widget exist under `packages/app/src/modules/payments` (`widgets/payments/client.tsx` is the injection client only). No open PR references #111.
3. Checked the data. The spec's `PayerRef` / `payments_payer_refs` table does not exist. The club's own bank account is stored nowhere: `bank_account` exists only on `club_core_institutions`, not on `club_core_club_settings` or `payments_settings`.
4. Both gaps need migrations. Neither the issue, the spec nor an owner comment approves them, so they are Ask First under AGENTS.md. As in #114, the run stopped before claiming and posted proposed defaults on #111.

## Decisions

- **Stop rather than work around the gaps.** A code derived from a hash of the person id would avoid the table. But it is not guaranteed unique, contradicts the spec's `PayerRef`, and #113 would have to scan every payer to match a code. Hard-coding the club account in configuration would bypass B-02. Both are worse than waiting for approval.
- **Proposed defaults:**
  - the `payments_payer_refs` table as specified, with `GW-` and 4 characters assigned lazily;
  - a nullable, encrypted `bank_account` column on `club_core_club_settings`;
  - the widget definitions and the additive `my-charges` fields, which need no approval.

## Files changed

- `.ai/runs/2026-11-08-issue-111-payments-today-payer-code.md` (this log).

## Commands and results

- `gh issue view 111`, `gh issue view 106`, and the comments on #110 and #114: read only.
- `gh issue comment 111`: posted the stop comment.

## Open problems / next steps

- The owner approves items 1 and 2 of comment 6720579426, or picks the alternatives. Then re-run `om-auto-fix-issue 111`.
