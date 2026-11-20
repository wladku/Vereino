# Run: PR #431 integration (shard 4/6) failure

- **Goal / trigger:** cezar task: the required check `integration (shard 4/6)` on PR #431 (issue #307, E13-S05 coach departure) concluded FAILURE; merge main in, make CI green, never merge.
- **Branch:** `feat/issue-307-coach-departure-handover` (worked on a detached HEAD at its origin tip, pushed with `git push origin HEAD:feat/issue-307-coach-departure-handover`).
- **Skill:** `om-auto-fix-pr` (CI stabilization).

## Steps

1. Read the failed job log (run 44646659366, job 135990858991): 49 passed, 1 failed, TEST-L22 `several children move to another group…`, `expect(violations).toEqual({})` with `color-contrast` (serious) in `panel dialog (en, light)` and `(pl, light)` on the first attempt and `(en, dark)` on the retry.
2. Downloaded the `playwright-report-shard-4` artifact and read the axe results: besides the baselined AppShell sidebar headings, the failing nodes were `groups-move-many-fits` (aria-pressed chip, #d1d1d1 on #f7f7f7, 1.42; #555 on #212121, 2.15) and `groups-move-many-save` (#e4e4e4 on #f7f7f7, 1.18) — half-faded colours.
3. Classified as a **test bug (flake)**, not a regression of this PR: the PR touches no groups or shared UI code, TEST-L22 came from main (#429) and passed on main at the same commit (dae65649), and the failing scheme moved between attempts. Cause: the age chip reloads the preview, which disables the chip and the move button (`disabled={pending || !previewReady}`); the platform `Button` (`transition-all`, `disabled:opacity-50`) is still fading back when axe runs.
4. Merged `origin/main` (429c547b) into the branch.
5. Fix: `_fixtures/axe.ts` gets `waitForTransitions` (extracted from `switchColorScheme`), and `scanBlockingViolations` calls it before `analyze()`; TEST-L22 waits for the chip and the move button to be enabled before each scan (panel dialog and phone sheet).
6. Lesson `axe-after-color-scheme-and-react-query-error-refetch` extended with case (6) and the rule.

## Decisions

- Fix in the shared scan fixture rather than only in TEST-L22: every axe scan is exposed to the same fade; the extra wait only waits (no assertion is relaxed, no rule baselined).
- No product code change: the buttons pass contrast once settled (main's CI and the local run are clean).

## Files changed

- `packages/app/.ai/qa/tests/_fixtures/axe.ts`
- `packages/app/.ai/qa/tests/groups/TEST-L22-move-children-ui.spec.ts`
- `.ai/lessons/axe-after-color-scheme-and-react-query-error-refetch.md`
- `.ai/runs/2026-11-20-pr-431-integration-shard-4.md`

## Commands and results

- `yarn generate` — ok; `yarn typecheck` — ok (0 errors).
- `yarn test:integration:vereino --filter TEST-L22` — 1 passed (46.6s).
- `yarn test:integration:vereino --filter TEST-L06` (this PR's test, after the main merge) — 1 passed (39.4s).
- `yarn test:integration:vereino --filter TEST-A12` (uses `switchColorScheme`, refactored) — 1 passed (44.0s).
- `yarn verify` — all 18 steps passed.

## Open problems / next steps

- None from this run; the PR keeps `needs-qa` for the QA gate.
