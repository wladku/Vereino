# Run: issue #547 — attendance list focus hidden under the sticky action bar

- **Trigger:** Cezar run (label `cezar` on #547), skill `om-auto-fix-issue`.
- **Issue:** #547 (WCAG 2.2 SC 2.4.11, found by TEST-083 of club spec amendment B, #532).
- **Branch:** `fix/issue-547-attendance-focus-hidden-sticky`.

## Goal

On `/club/occurrences/[id]/attendance` at 375 × 812 px, every control Tab reaches in the list stays clear of the
sticky action bar (`club-attendance-actions`, `sticky bottom-24`).

## Steps

1. Claimed #547 (assignee, `in-progress`, `🤖` claim comment naming this worktree).
2. Root cause confirmed in `ClubAttendancePage.tsx`: the document scrolls a focused row control only into the
   viewport, which the bar (6 rem above the bottom, ~121 px tall when it wraps) covers; nothing reserved that space.
3. Fix: the bar's height is measured with a `ResizeObserver` into `--attendance-actions-height` on the list
   section (set through a ref with `style.setProperty`: an inline `style` prop failed `ds:check` `inline-style`), and below `sm` every button in the section gets `scroll-margin-bottom: calc(height + 6.5rem)`, so a
   focus scroll leaves the bar's height, its 6 rem offset and 0.5 rem of room below the control.
4. Regression test `ISSUE-547` (`packages/app/.ai/qa/tests/activities/ISSUE-547-attendance-focus-clear-of-sticky-bar.spec.ts`):
   11 rows, all marked, Tab walk through the list at 375 × 812, asserts no focused list control reaches below the
   bar's top.

## Decisions

- **Measured, not fixed, clearance:** the bar wraps to two lines at 375 px and grows with the "nothing to fill" hint;
  a constant would be wrong for one of those states or over-scroll for the other.
- **`scroll-margin` on the controls, not `scroll-padding` on `<html>`:** the fix stays inside the page component;
  the member layout is shared by pages without a sticky bar.
- **Own test id instead of editing TEST-083:** TEST-083 is not on `main` yet (it is being written by the #532 run in
  another worktree, unpushed). This PR adds `ISSUE-547` with the same check; #532 can drop its `test.fixme` once
  this lands (comment left on #532).
- Sibling pages with the same `sticky bottom-24` bar (payments, session edit, event form/detail) are out of scope.

## Files changed

- `packages/app/src/modules/activities/components/club/ClubAttendancePage.tsx`
- `packages/app/.ai/qa/tests/activities/ISSUE-547-attendance-focus-clear-of-sticky-bar.spec.ts`
- `.ai/runs/2026-11-22-issue-547-attendance-focus-sticky-bar.md`
- `.ai/lessons/playwright-tab-walk-starting-point.md` (new), `.ai/lessons/sticky-bar-above-member-bottom-nav-uses-spacing-scale.md` (addendum)

## Commands and results

- `yarn test:integration:vereino --filter ISSUE-547`, run 1: failed, `Expected: >= 22, Received: 1` — the walk started
  after the last checked radio (`blur()` keeps Chromium's Tab starting point). Fixed by clicking the page title first
  (lesson `playwright-tab-walk-starting-point`).
- Same test with the component fix reverted: failed as intended, 12 hidden stops, e.g.
  `Tab 3: button radio "" 634–654, bar at 575`, `Tab 4: button  "Wyczyść — Kuba Kowalski" 726–770, bar at 575`.
- Same test with the final fix (fresh build): `1 passed (39.4s)`.
- `yarn verify`: first run failed at `lint` on the local Playwright report under `packages/app/.ai/qa/test-results`
  (deleted) and on template-literal types in the new spec; next run failed at `ds:check` (`inline-style`); final run
  `all 18 step(s) passed`.

## Open problems / next steps

- TEST-083 (#532) un-fixme once both land.
