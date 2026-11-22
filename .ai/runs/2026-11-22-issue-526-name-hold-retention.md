# Run: issue #526 — name hold follows the accounting retention period

- **Trigger:** cezar task c9fbfee0 (`om-auto-fix-issue 526`, label `cezar`), unattended.
- **Issue:** [#526](https://github.com/wladku/Vereino/issues/526). Owner decision of 2026-11-22 (issue comment): option (a), the hold reads `accounting_retention_years` (default 6), `retention.md` R2 agrees with R1, close R-A, no migration.
- **Branch:** `feat/issue-526-name-hold-retention`.
- **Spec:** `.ai/specs/2026-11-14-vereino-people-life-cycle-and-data-entry.md` (DD-L07, Q-L01); club spec Q-053.

## Steps

1. Claimed the issue (assignee, `in-progress`, `🤖` claim comment naming this worktree and run).
2. Found the setting `accounting_retention_years` is **not stored** anywhere (`retention.md` R1: "`payments_settings` has no retention column"). Reading it would need a new column, so a migration, which the owner ruled out ("if one turns out to be needed, stop and ask").
3. Implemented without a migration: `payments/lib/departure.ts` replaces `RETENTION_YEARS = 5` with `ACCOUNTING_RETENTION_YEARS = 6` (the setting's default) and `retentionHoldUntil(latestPaidOn, retentionYears = ACCOUNTING_RETENTION_YEARS)`, so the stored setting (#470) only has to pass its value.
4. Updated texts that said "fifth year": `people.erasure.anonymise.hold` (en, pl), the anonymise route's openApi description, TEST-L07 (hold = year + 6).
5. Docs: `docs/compliance/retention.md` R2 (N+6, same as R1) and R-A closed; spec DD-L07 and Q-L01; club spec Q-053 drops the #526 half; one changelog file per spec.

## Decisions

- **Default constant instead of a stored setting.** The owner forbade a migration; the constant equals the setting's default, which R1 also uses today (no club can change it yet). The parameter keeps the later wiring a one-line change. Stated in the PR.
- **Holds already written keep their N+5 date.** `erasure_hold_until` is stored at anonymisation time (#308, merged 2026-11-20). Rewriting existing rows would be a data migration (Ask First); flagged in the PR for the owner.
- `RETENTION_YEARS` was used only inside its own file (module-internal lib, no contract surface), so it was renamed.

## Commands and results

- `npx jest src/modules/payments/lib/__tests__/departure.test.ts` — 3 passed.
- `yarn test:integration:vereino --filter TEST-L07` — 3 passed (1.0m).
- `yarn verify` — all 19 steps passed.
- `yarn guard` — no blocking findings.

## Open problems / next steps

- #470: store `accounting_retention_years` and pass it to `retentionHoldUntil`.
- Owner: decide whether holds written before this change (N+5) are moved to N+6.
