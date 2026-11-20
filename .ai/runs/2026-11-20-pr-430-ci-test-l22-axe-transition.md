# Run: PR #430 — CI shard 4/6 red on TEST-L22 (axe during a button fade)

- **Goal and trigger:** cezar run (`om-auto-fix-pr`) — drive PR #430 (issue #378, club events panel) back to merge-ready: required check `integration (shard 4/6)` failed and the merge train labelled it `merge-train-failed`.
- **Branch:** `feat/issue-378-admin-club-events-panel`, worked on a detached HEAD at `origin/feat/issue-378-admin-club-events-panel` (fceb90d6, which already contains `origin/main` dae65649), pushed with `git push origin HEAD:feat/issue-378-admin-club-events-panel`.

## Steps

1. Read the failed CI run 44642262124. Only TEST-L22 failed (`groups/TEST-L22-move-children-ui.spec.ts`, from #429, already on `main`), on both attempts: `expect(violations).toEqual({})` got `color-contrast` (serious) with 2 nodes in all four panel-dialog scans, then on the retry 1 node in `panel dialog (pl, dark)` only. 49 other tests in the shard passed.
2. Downloaded the shard's Playwright report. The axe report of the retry names the node: `button[data-testid="groups-move-many-fits"]`, `#555555` on `#212121` (2.15:1) — a half-faded colour; the sidebar headings were baselined as usual.
3. Ran `yarn test:integration:vereino --filter TEST-L22` locally on the unchanged PR head: **1 passed** (49.5 s), every scan clean apart from the baselined sidebar headings. So it is a timing flake that shows up only under CI load, not a regression in this PR (the PR does not touch `groups`).
4. Root cause: the test clicks the age chip; `MoveChildrenDialog` changes the selection, the preview query refetches, and the chip (`disabled={pending || !previewReady}`) and the Move button (`moveDisabled` includes `!previewReady`) go disabled and back. Their opacity fade (Tailwind `transition-*`; `reducedMotion: 'reduce'` does not stop it) is still running when the scan starts. `scanBlockingViolations` waited only for `networkidle` and fonts. Two buttons = the 2 nodes of the first attempt.
5. Fix (`packages/app/.ai/qa/tests/_fixtures/axe.ts`): moved the "wait until no `CSSTransition` runs" loop out of `switchColorScheme` into `waitForTransitions(page)` and call it in `scanBlockingViolations` before axe runs. No assertion, threshold or baseline was relaxed.
6. Lesson `axe-after-color-scheme-and-react-query-error-refetch` gained case (6) and the rule that `scanBlockingViolations` waits for transitions.

## Decisions

- Fixed the shared scan helper instead of adding a wait to TEST-L22 alone: every axe scan after a refetch has the same race, and the helper already had the right loop for the scheme switch.
- Merged nothing from `main`: the PR head already contained the current `origin/main`.

## Commands and results

- `yarn test:integration:vereino --filter TEST-L22` (before the fix, PR head fceb90d6): 1 passed.
- After the fix: see Verification.

## Verification

All on the fixed head, locally (Docker Testcontainers, production build):

- `yarn test:integration:vereino --filter TEST-L22`: 1 passed (50.0 s).
- `yarn test:integration:vereino --filter TEST-T11` (this PR's own test): 1 passed (57.6 s).
- `yarn test:integration:vereino --filter TEST-A12` (uses the refactored `switchColorScheme`): 1 passed (44.4 s).
- `yarn verify`: all 18 steps passed.

## Files changed

- `packages/app/.ai/qa/tests/_fixtures/axe.ts`
- `.ai/lessons/axe-after-color-scheme-and-react-query-error-refetch.md`
- `.ai/runs/2026-11-20-pr-430-ci-test-l22-axe-transition.md`

## Open problems / next steps

- None known beyond CI on the pushed head; the merge train re-takes the PR once the new commit clears `merge-train-failed`.
