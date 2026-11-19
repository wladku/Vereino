# Run: om-auto-fix-issue 118 — B-33 cash handover for the administrator

- **Goal and trigger:** cezar task `om-auto-fix-issue 118` (issue labelled `cezar`, 2026-11-19), unattended.
- **Spec / issue / branch:** `.ai/specs/2026-10-27-vereino-club-payments.md` phase 4 step 10 (REQ-033/REQ-034, TEST-046, B-33, J-010 steps 3–5); issue #118 (E07-S11); branch `feat/issue-118-treasurer-cash-handover`.
- **Approval:** the owner's decision of 2026-11-14 on #118 (B-33 for the club administrator only; the treasurer role moved to #245). The `payments` migration and defaults A–D (comment 7017945289) were taken as approved on the owner's autonomous instruction in the cezar session ("continue autonomously, make reasonable assumptions, do not ask"), recorded on #118 (comment 7017956213). No new module or dependency.

## Steps

1. **First pass.** Read the issue and the spec. `payments_cash_handovers` and `payments_payments.cash_handover_id` did not exist, and D-030 keeps any other migration Ask First, so the run stopped before claiming and posted the proposed migration and defaults A–D on #118. The stop record was committed as `dbb6ee89`.
2. **Resume.** On the owner's instruction, posted the approval as taken and claimed the issue (assignee, `in-progress`, `🤖` claim comment).
3. **Data.** Entity `CashHandover` and `Payment.cashHandoverId`; `yarn db:generate` (offline, from the module snapshot) produced `Migration20261119181917_payments`; added the missing `drop table` to `down()`.
4. **Rules.** `lib/cash-handovers.ts`: the `RG/YYYY/MM/NNN` numbering, `handoverRefusal`, `custodyByCollector`; unit tests at 100 %.
5. **Command and reads.** `payments.cash_handovers.accept` (payments row-locked in id order, the club's handover advisory lock, not undoable, audited); `services/cash-handovers.ts` (custody, history); routes `GET /api/payments/cash-custody`, `GET/POST /api/payments/cash-handovers` with `metadata` and `openApi`; the feature `payments.cash.settle`; three error codes.
6. **Settled at once.** `acceptCashOnCharges` stores no collector when the caller holds `payments.cash.settle`, so the administrator's own cash never waits for a handover; "Cash with you" (`cashHeldBy`) leaves out handed-over payments.
7. **UI.** B-33 at `/backend/payments/cash-custody` (Payments menu): the collectors' table with "Accept handover", the dialog with the payments all selected, "I confirm receipt of the cash" and the toast "Handover RG/… accepted", the history table and the empty state "All accepted cash is with the treasurer"; en and pl catalogs.
8. **TEST-046** (administrator half) and the spec's step 10 note with a changelog file.

## Decisions

- **Settled immediately = no collector.** Cash accepted by a holder of `payments.cash.settle` is stored with `collected_by_person_id` null (who received it stays in `recorded_by_person_id`). The alternative, a self-handover per acceptance, would fill the history with RG numbers nobody handed over.
- **One handover = one collector; select payments, not receipts.** B-33 shows the payments with their KP numbers, all selected; a reversed payment cannot be handed over (409), a payment reversed after the handover keeps it (defaults B, C).
- **The handover is numbered in the month it is accepted** (the club's calendar), like the KP receipts of the month the cash arrived.
- **Axe at 375 px.** An empty `DataTable` and a table whose rows hold nothing focusable both failed `scrollable-region-focusable`: empty lists render as a heading and a sentence (lesson `empty-datatable-axe-at-375`), and each history row links the collector's name to the person record. #245 must revisit that link when the treasurer, who has no people access, gets B-33.

## Files changed

- `packages/app/src/modules/payments/`: `acl.ts`, `data/entities.ts`, `data/queries.ts`, `data/validators.ts`, `lib/error-codes.ts`, `lib/cash-handovers.ts` (+ test), `lib/__tests__/payments-rules.test.ts`, `commands/cash.ts`, `commands/cash-handovers.ts`, `services/cash-handovers.ts`, `services/group-charges.ts`, `api/cash-custody/route.ts`, `api/cash-handovers/route.ts`, `backend/payments/cash-custody/page.{meta.ts,tsx}`, `components/cash-custody/*`, `i18n/en.json`, `i18n/pl.json`, `migrations/Migration20261119181917_payments.ts`, `migrations/.snapshot-open-mercato.json`.
- `packages/app/.ai/qa/tests/payments/TEST-046-cash-handover.spec.ts`.
- PR: see #118 (opened by this run).
- `.ai/specs/2026-10-27-vereino-club-payments.md` (step 10 note), `.ai/specs/changelog/2026-10-27-vereino-club-payments/2026-11-19-issue-118-cash-handover.md`, this log.

## Commands and results

- `yarn db:generate` — `payments: generated Migration20261119181917_payments.ts`, other modules no changes.
- `yarn generate`, `yarn typecheck` — pass.
- `yarn test` — first run: `payments-rules.test.ts` "declares the error codes with their statuses" failed (the three new codes were missing from the expected table); fixed, then 111 suites, 1568 tests passed.
- `yarn lint` — first run: 3 errors (`react-hooks/set-state-in-effect` in the dialog, two `no-confusing-void-expression`), plus errors from a leftover Playwright report in `packages/app/.ai/qa/test-results` (lesson `local-playwright-report-breaks-lint`); fixed the code, removed the report, then 0 errors.
- `yarn test:integration:vereino --filter TEST-046` — first run: every functional assertion passed; axe failed `scrollable-region-focusable` (serious, 2 nodes: the empty custody table and the history table) in both schemes at 375 px. Fixed as above; re-run: `1 passed (33.4s)`.
- `yarn verify` — `all 18 step(s) passed`.
- UI: TEST-046 drives B-33 in the browser (1280 px), checks 375 px without overflow and axe in light and dark.

## Open problems / next steps

- #245: the `vereino_treasurer` role with `payments.cash.settle`, its finance-only menu and dashboard, and TEST-046's treasurer assertions; the history row link to the person record needs another focusable target there.
