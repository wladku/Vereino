# Run: issue #701 — TEST-M03 `beforeAll` hook timeout

- **Trigger:** Cezar run (`om-auto-fix-issue`), issue #701 labelled `cezar` (2026-11-24).
- **Issue:** #701 (filed by the CI failure ledger as a quarantine request for TEST-M03).
- **Branch:** `test/issue-701-quarantine-test-m03-flaky`.

## Goal

Stop TEST-M03 (`packages/app/.ai/qa/tests/club_core/TEST-M03-club-address.spec.ts`) from failing CI runs of unrelated PRs and `main`.

## Steps

1. Read the issue and the owner's comment: both CI failures were `"beforeAll" hook timeout of 20000ms exceeded` at line 48. The owner proposed a real fix instead of a quarantine.
2. Checked `main` and open PRs: no existing fix for TEST-M03.
3. Claimed the issue (assignee, `in-progress`, `🤖` claim comment).
4. Added `test.setTimeout(300_000)` as the first line of `beforeAll` (second `next start` waits up to 180 s, then two clubs are created and published) and `test.setTimeout(120_000)` to `afterAll` (`app.stop()` waits up to 10 s, plus two club cleanups).
5. Recorded lesson `playwright-describe-timeout-skips-hooks`.

## Decisions

- Real fix instead of `test.fixme` quarantine, following the owner's comment on #701. No `fixme` is added, so the PR uses `Closes #701`.
- Budgets: 300 s for `beforeAll` is above the 180 s readiness wait plus two club setups; 120 s for `afterAll` covers the 10 s stop plus cleanups.

## Files changed

- `packages/app/.ai/qa/tests/club_core/TEST-M03-club-address.spec.ts`
- `.ai/lessons/playwright-describe-timeout-skips-hooks.md`
- `.ai/runs/2026-11-24-issue-701-test-m03-hook-timeout.md`

## Commands and results

- `yarn test:integration:vereino --filter TEST-M03` → `3 passed (59.5s)` (club_core TEST-M03, TEST-M02, and foundation/messaging TEST-M03-secrets which shares the id prefix).
- `yarn lessons:check` → valid.
- `yarn verify` → `all 22 step(s) passed`; `yarn guard` → no blocking findings.

## Open problems

- The local run cannot reproduce the CI runner's slowness; the fix is a timeout budget, so the proof is CI staying green over the next runs.

## Next steps

- None after merge; #701 closes with the PR.
