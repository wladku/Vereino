# Run: issue #531 — nightly payments invariant check (REQ-043)

- **Goal and trigger:** cezar task (`om-auto-fix-issue 531`), started when the owner added the `cezar` label to #531.
- **Branch:** `feat/issue-531-nightly-payments-invariant-check`.
- **Spec/issue:** #531; club spec `.ai/specs/2026-10-20-vereino-club-management.md` REQ-043, AC-043, TEST-088 (amendment B); engineering standards S10.6, S15.5.

## Steps

1. Claimed #531 (assignee, `in-progress`, 🤖 comment naming this run). Feature route: the club spec already covers it, so no new spec was written.
2. Pure rules in `payments/lib/invariants.ts` (unit tests at 100 %):
   - `chargeDrift`: a live charge must carry the status `settledStatus` gives for its net paid amount. A charge with nothing due may be `open` or `paid`, because a free rental is born `paid`. Paid may not be negative or above the amount due. A cancelled or forfeited charge must have nothing paid on it.
   - `numberingDrifts`: per series (`KP`, `RG`), it reports malformed numbers, a number issued to two acceptances (or handovers), a number outside the month of its day, and gaps per month.
   - The report, the alert fields (ids and counts only, capped at 50) and the heartbeat URL.
3. Reads in `payments/data/queries.ts`:
   - `chargeLedgerTotals`: one statement, net paid per live charge; overpayments excluded, reversals included.
   - `receiptNumberIssues`: distinct number, day and acceptance instant.
   - `handoverNumbers`.
4. `services/invariants.ts` reads and reports. Drift writes an `error` log line `vereino.ops.payments.invariants.drift` and pings `<VEREINO_OPS_PAYMENTS_INVARIANTS_HEARTBEAT_URL>/fail`. A clean run logs at `info` and pings `<url>`.
5. Job command `payments.invariants.verify` (read-only, no audit entry) and worker `payments:verify-invariants`. The schedule runs at 03:00 in the club's time zone, registered by `setUpClubPayments`, so `seedDefaults`, `set-up-club` and the time-zone re-registration all cover it. `payments run-job --job verify-invariants` runs it by hand.
6. Tests:
   - New TEST-088. The ledger is written by the real commands: manual charges, a transfer and its reversal, and two cash acceptances giving KP 001 and 002. Handover rows are seeded by SQL. The test runs the job on the clean club, after a raw-SQL payment change, and after a handover number gap. It also runs the job on another club and fingerprints the rows before and after each run.
   - TEST-C14 now expects six schedules, with `verify-invariants` zoned at `0 3 * * *`.
7. Docs:
   - payments README, `setup.ts`, `cli.ts` and subscriber comments;
   - `docs/ops/monitoring.md` (alert, heartbeat and log-filter rows) and `docs/ops/deploy.md`;
   - `.env.example`;
   - `BACKWARD_COMPATIBILITY.md` (new variable and alert token);
   - club spec REQ-043 and the amendment B row, plus the changelog file.

## Decisions

- **"Operations alert" means the repository's S15.5 mechanism:** a log token for search and digest, plus a heartbeat check with a `/fail` ping. On Railway Hobby only heartbeats page anyone (`docs/ops/monitoring.md`). The variable is optional and additive (BC §8, no bridge needed).
- **Nightly cron in the club zone, not an interval:** the spec says nightly. The existing `payments:reregister-schedules` re-registers every payments schedule on a time-zone change, so the cron moves with the zone.
- **The command writes no audit entry:** it changes no data.
- **No status drift for a charge with nothing due that is `paid`:** this avoids a false alert on every free rental.
- **Soft-deleted payment rows still hold their `KP` number,** matching how `lastReceiptNumber` issues numbers.
- **No Ask First item:** no migration, module, dependency or breaking contract. The CLI job list and the `set-up-club` output change additively.
- **Risk label `risk-medium` rather than the issue's `risk-low`:** the job reads money tables, but it writes nothing.

## Results

- `npx jest src/modules/payments/lib/__tests__/invariants.test.ts --coverage`: 17 passed, `invariants.ts` 100 % statements, branches, functions and lines.
- `yarn test:integration:vereino --filter TEST-088`: 1 passed (43.7 s); re-run after the lint and format fixes: 1 passed (43.6 s).
- `yarn test:integration:vereino --filter TEST-C14`: 1 passed (1.4 m).
- `yarn verify`: the first run failed at `lint` with three `restrict-template-expressions` / `no-unnecessary-template-expression` errors in the new test files, and then at `format:check` on the same files. After fixing them, one full run passed all 18 steps.

## Open problems / next steps

- Existing clubs get the schedule from the next `payments set-up-club` run (deployment checklist) or the next club settings change.
- The owner adds a heartbeat check for `VEREINO_OPS_PAYMENTS_INVARIANTS_HEARTBEAT_URL` at the uptime monitor (owner checklist in `docs/ops/monitoring.md`).
