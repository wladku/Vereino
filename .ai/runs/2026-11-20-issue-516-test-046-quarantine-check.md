# Run: issue #516 — quarantine TEST-046?

- **Goal and trigger:** cezar task queued by the `cezar` label on #516, an issue the CI failure ledger opened: quarantine `TEST-046` (`packages/app/.ai/qa/tests/payments/TEST-046-cash-handover.spec.ts`) with `test.fixme` because it failed in two CI runs that share no PR — unless a fix already exists.
- **Issue / branch:** #516, `docs/issue-516-test-046-failures-explained` (renamed from the task branch `test/issue-516-quarantine-test-046`).

## Steps

1. Claimed #516 (assignee, `in-progress`, `🤖` claim comment). No open PR or `main` commit named TEST-046 as a fix.
2. Read both failed runs with `gh run view <id> --log-failed`:
   - **44661770663** (2026-11-20 02:34Z, branch `docs/lesson-cezar-host-browser-tests` = PR #422, head `3744dce`): `TEST-046 B-33: cash held by a coach, a numbered handover, 409 on a settled payment` — `strict mode violation: getByText(/RG\/\d{4}\/\d{2}\/001/) resolved to 2 elements` (the toast and the history row). PR #422 then changed the test to read the number from `handover-number` (commit 9f036b5c on `main`, comment "both are on screen together, so a page-wide getByText is ambiguous"). Fixed on `main`; the failure was on the PR that fixed it.
   - **44745858856** (2026-11-20 13:36Z, branch `fix/issue-494-menu-groups-mockup-terms` = PR #513, head `7c9c939`): a different test, `TEST-046 treasurer: a finance-only role, menu and dashboard; handovers as for the administrator` — `expect(hrefs).toEqual(...)` got `/backend/payments/orders` before `/backend/payments/cash-custody`. PR #513 changes `payments/backend/payments/cash-custody/page.meta.ts` `pageOrder` 26 → 40 (after Kit orders, 30) and asserts that order in its own `TEST-N01`, but did not update TEST-046's expected list. Caused by #513; its branch must update TEST-046.
3. Conclusion: no failure that no PR explains, so no quarantine. Two different tests were counted as one because `scripts/ci-failure-ledger-plan.mjs` keys failures by the title prefix (`testIdOf` → `TEST-046`).
4. Commented the analysis on #516 and the needed test update on PR #513; released the claim.

## Decisions

- No `test.fixme`: TEST-046 passes on `main` as far as the evidence shows, and quarantining the treasurer test would hide #513's sidebar-order regression from that PR.
- Recorded lesson `ci-ledger-quarantine-check-each-run-first`.

## Files changed

- `.ai/lessons/ci-ledger-quarantine-check-each-run-first.md` (new)
- `.ai/runs/2026-11-20-issue-516-test-046-quarantine-check.md` (this log)

## Commands and results

- `node scripts/check-lessons.mjs` — "Lessons catalog is valid".
- No integration test was run: no test or product code changed.

## Open problems / next steps

- PR #513 updates TEST-046's expected Finance sidebar order (fees, charges, bank, orders, cash-custody).
- Ledger improvement (suggested on #516): key failures by the full test title (or file + title), and skip a run whose PR changed the failing spec file.
- #516 can be closed by the owner once #513 is green.
