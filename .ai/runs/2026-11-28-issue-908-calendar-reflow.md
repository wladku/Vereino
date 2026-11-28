# Run: issue #908 — E08-S01 calendar reflow fails at 320 px (om-auto-fix-issue)

- **Goal and trigger:** cezar task (issue #908 labelled `cezar`): E08-S01 failed on `main` from Saturday 2026-11-28 with `page wider than 320 px by 427 px` on `/backend/facilities/calendar`; it blocks PR CI and the merge train.
- **Spec / issue / branch:** issue #908, branch `fix/issue-908-calendar-reflow-saturday`; product context DD-W03 (calendar range switch, #784 / #796).

## Steps

1. Claimed #908 (assignee, `in-progress`, 🤖 comment naming this run and worktree).
2. `yarn test:integration:vereino --filter E08-S01` at 01:08 Warsaw time: passed, so the failure is not tied to Saturday.
3. Temporary debug spec (not committed) with `matchMedia` pinned to "wide": the Week grid at 320 px, settled, gives overflow 0, so the settled Week layout fits.
4. Debug spec with the browser clock pinned (`page.clock.setFixedTime`): at Saturday 00:30 club time, right after the resize the Week grid was still rendered and overflow was 427 px; 2 s later the Day view with overflow 0. At 12:30 the switch had already happened. Root cause: `expectNoPageOverflow` measured once, before the media-query `change` re-render; the time of day decides which comes first (CI 00:30 and the local ~01:00 run were both in that hour).
5. Fix: `expectNoPageOverflow` polls the overflow for up to 5 s and fails only if it lasts. Regression: a second E08-S01 test pins the browser clock to 00:30 club time on today's date and runs the reflow check on the calendar, then asserts the Day view.
6. Red/green: without the fixture change (at about 01:25 Warsaw time), `--filter E08-S01` failed on the first attempt of both tests with `Error: page wider than 320 px by 427 px` (each passed on retry); with it, both passed on the first attempt (`2 passed (1.3m)`).
7. Lesson `reflow-check-waits-for-media-query-rerender`.

## Decisions

- No product change: the settled page fits 320 px in both views, and the wide first render is DD-W03's choice (the server and first client render assume a wide screen). The only failure was measuring a one-render layout.
- The fix lives in the shared fixture, not in E08-S01 alone, because every page that picks a layout from a media query has the same race; polling cannot hide a lasting overflow.

## Files changed

- `packages/app/.ai/qa/tests/_fixtures/axe.ts`
- `packages/app/.ai/qa/tests/facilities/E08-S01-facilities-pages.spec.ts`
- `.ai/lessons/reflow-check-waits-for-media-query-rerender.md`
- this run log

## Commands and results

- Steps 2, 4 and 6 above.
- `yarn verify`: first run failed at `format:check` (`axe.ts` and `E08-S01-facilities-pages.spec.ts` not formatted); after `yarn format`, `yarn verify --from format:check` passed all 18 remaining steps (the 6 earlier steps had passed).
- `yarn guard`: no blocking findings.

## Open problems / next steps

- none
