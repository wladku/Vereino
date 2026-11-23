# Run: issue #666 — a new club's first automatic run records an empty month

- **Trigger**: Cezar run (task 70f29218), `om-auto-fix-issue 666`, issue labeled `cezar` on 2026-11-23.
- **Issue**: #666 — `payments.charges.generate_due` wrote a `ChargeGeneration` row with `createdCount: 0` for a club without fee schedules or rosters; `monthGenerated` then stopped every later daily run of the month, so a club created mid-month never got its month generated automatically.
- **Branch**: `fix/issue-666-first-run-empty-month`
- **Route**: `debugging` + `module-data` (payments command); delivery `direct` (bug fix, no new spec; the implemented parity payments spec's business rule row and a changelog file record the behavior).

## Steps

1. Claimed #666 (assignee, `in-progress`, `🤖` claim comment naming this worktree and branch).
2. Confirmed the defect on `main` `e856961d`: `writeGeneration` in `commands/generate.ts` persists every plan that has no fee over the limit, and `generationDue` returns `generated` for any generation row of the month.
3. Added the pure rule `automaticGenerationRecorded({ created, skipped })` in `lib/payments-rules.ts` (false only for zero created and zero skipped) with unit tests.
4. `writeGeneration` takes `automatic`; the daily command passes it, and a plan the rule does not record writes nothing. `generate_due` returns the outcome `{ due: false, reason: 'nothing_to_generate' }` (audited like the other skip reasons). The manual command and the undo (#403) are untouched, so an undone month still counts as generated.
5. Integration test `ISSUE-666` (`packages/app/.ai/qa/tests/payments/ISSUE-666-first-run-empty-month.spec.ts`): two daily runs for a club without fees answer `nothing_to_generate` and write no row; after a group, a member and a fee the next run generates one charge, the run after answers `generated`; a manual generation of a month without a valid fee still records its empty run.
6. Docs: payments `README.md`, `docs/ops/clubs.md` step 6, the parity payments spec's "Automatic generation" rule row, and changelog file `2026-11-23-issue-666-empty-automatic-run.md`.

## Decisions

- **Rule in `lib/`, applied in the shared writer behind a flag**: the plan is computed inside `writeGeneration` under the advisory lock; checking there avoids planning twice. The manual path never passes the flag.
- **A plan with skipped charges is still recorded**, as the issue asks: skipped charges mean the month already has charges (for example a one-off fee charged earlier), so the run is real.
- **New outcome reason is additive** to the `run-job` JSON output; no consumer switches on the reason set.

## Verification

- `yarn workspace @vereino/app jest src/modules/payments/lib/__tests__/payments-scheduled-rules.test.ts`: 17 passed.
- `yarn generate` then `yarn typecheck`: clean (a fresh worktree fails typecheck on the missing `.mercato/generated` files until `yarn generate` runs).
- `yarn test:integration:vereino --filter ISSUE-666`: 1 passed (11.2 s).
- `yarn verify`: all 21 steps passed (EXIT=0).
- `yarn guard`: no blocking findings.

## Open problems / next steps

- None known.
