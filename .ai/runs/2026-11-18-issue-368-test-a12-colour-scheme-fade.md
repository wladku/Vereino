# Run: issue #368 — TEST-A12 scans the new-event form mid colour-scheme fade

- **Trigger:** cezar `om-auto-fix-issue 368` (label `cezar` added).
- **Issue / PR / branch:** #368 / (opened by this run) / `test/issue-368-test-a12-colour-scheme-fade`
- **Date:** 2026-11-18

## Goal

Make TEST-A12 pass deterministically: the dark scan of `/club/events/new` must wait until the colour-scheme transition has settled, without a baseline entry or rule exclusion.

## Steps

1. Claimed the issue (assignee, `in-progress`, `🤖` claim comment).
2. Read TEST-A12, `_fixtures/axe.ts` and lesson `axe-after-color-scheme-and-react-query-error-refetch`. TEST-A12 is the only test that calls `emulateMedia({ colorScheme })` on a rendered page and scans without a reload.
3. Read the installed platform `ThemeProvider` (`@open-mercato/ui/dist/theme/ThemeProvider.js`): it toggles the `dark` class on `<html>` from a `prefers-color-scheme` `change` listener, so the class (and the CSS transitions it starts) lands after `emulateMedia` resolves; `reducedMotion: 'reduce'` does not stop them.
4. Added `switchColorScheme(page, colorScheme)` to `_fixtures/axe.ts`: emulates the scheme, waits for the `dark` class to match, waits two animation frames, then waits until no `CSSTransition` is running. TEST-A12 uses it for the form scans and the switch back to light.
5. Updated the lesson with the no-reload case and the rule.

## Decisions

- A helper rather than reordering the test (scheme set before filling the form): the form still has to be scanned in both schemes with its error state, which would mean filling it twice.
- Only `CSSTransition`s are awaited: infinite CSS animations (spinners) never finish and would hang the wait.
- `scanInColorSchemes` keeps its reload; it is not affected.

## Files changed

- `packages/app/.ai/qa/tests/_fixtures/axe.ts`
- `packages/app/.ai/qa/tests/activities/TEST-A12-coach-sparring-phone-ui.spec.ts`
- `.ai/lessons/axe-after-color-scheme-and-react-query-error-refetch.md`
- `.ai/runs/2026-11-18-issue-368-test-a12-colour-scheme-fade.md`

## Commands and results

- `yarn typecheck:qa` — exit 0.
- `yarn test:integration:vereino --filter TEST-A12` (with build) — 1 passed (2.9m).
- `yarn test:integration:vereino --filter TEST-A12 --no-build` — 1 passed (2.8m); a third repeat was cut off by a cockpit restart.
- `yarn verify` — all 17 steps passed.

## Open problems / next steps

- None known.
