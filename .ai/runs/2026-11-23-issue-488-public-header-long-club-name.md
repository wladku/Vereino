# Issue #488 — the public header keeps every menu item visible with a long club name

- **Date:** 2026-11-23
- **Agent / tool:** Claude Code (Opus 5.5), `om-auto-fix-issue` (bug route) in a Cezar run
- **Trigger:** the `cezar` label on issue #488 (E20-S09, epic #479)
- **Spec / issue / branch:** issue #488; branch `fix/issue-488-public-header-long-club-name`; no spec (bug fix, `direct`)
- **Status:** completed

## Goal

On P-01 a long club name (30+ characters) covered the header menu at desktop widths: at 1440 px only the last letter
of the current item "Klub" stayed visible. Every menu item must stay visible and clickable at every width; a short
name keeps its layout.

## Steps

1. Claimed the issue (assignee, `in-progress`, `🤖` claim comment naming this worktree and branch).
2. Root cause in `packages/ui/src/public/public-header.tsx`: from 480 px the `nav` was `flex-1` (flex basis 0), so it
   never wrapped and only got the room the club link left; the link kept its full text width. The links' `ul` was
   `justify-end`, so the overflowing links spilled out to the left of the scroll container, where they cannot be
   scrolled to: the links were cut from the start ("…b").
3. Fix: from 768 px (`md`, previously 480 px; see step 7) the row never wraps; the club link sits in a wrapper that is
   `flex-1 basis-0` (it takes the room left over, at least `6rem`), and the name truncates with its full text in `title`; the nav keeps its own width
   (`flex: 0 1 auto`, `min-w-0`) and scrolls only once the name is down to its minimum; `justify-end` is gone. Below
   768 px the links stay on the scrolling second row, and the name now shares the first row with the language
   switcher instead of pushing it onto a row of its own.
4. Updated the unit test (`packages/ui/src/__tests__/public-header.test.mjs`) and added the integration test
   `ISSUE-488-public-header-long-club-name` (bounding boxes plus a hit test on every link; 1440/1024/768/640/480/375/320
   px, en/pl, light/dark; the short-name negative case; axe in light and dark; header screenshots).
5. The first green-looking run failed on the negative case: with the short name at 480 px "Events" was not reachable
   without scrolling — the five links plus the language switcher need about 620 px, so the old 480 px one-row
   breakpoint clipped the menu for every club. Moved the breakpoint to `sm` (640 px); between 480 and 639 px the
   links now sit on the existing scrolling second row.
6. Re-ran the older header tests (TEST-N09, E20-S07) and the full gate; recorded lesson
   `header-row-links-keep-their-width-name-truncates`.

7. CI on PR #680 failed in shard 2: `en light 640 px: the nav scrolls` — the runner's fonts are wider, and at
   640 px the row had almost no slack locally. Moved the breakpoint to `md` (768 px), where about 200 px are left for
   the name, and added a headroom check (the name keeps at least 100 px at every one-row width) so a tight fit fails
   locally too. Re-ran ISSUE-488, TEST-N09, E20-S07 and `yarn verify`.

## Decisions

- Truncate the name rather than move the menu to a second row at desktop widths — the issue allows either; one row
  keeps the short-name layout unchanged and the full name stays available (`title`, the link's accessible name).
- The stretching box is a wrapper `div`, not the link itself, so the link's click target stays the logo and the name.
- Breakpoint 480 px → 768 px: at 480–639 px the single row could not hold the links even for a short name (measured
  in the test, both locales), and 640 px failed on CI fonts; the second row is the layout phones already use.

## Files changed

- `packages/ui/src/public/public-header.tsx`
- `packages/ui/src/__tests__/public-header.test.mjs`
- `packages/app/.ai/qa/tests/club_core/ISSUE-488-public-header-long-club-name.spec.ts`
- `.ai/lessons/header-row-links-keep-their-width-name-truncates.md`
- `.ai/runs/2026-11-23-issue-488-public-header-long-club-name.md`

## Commands and results

- `yarn workspace @vereino/ui test` — 261 tests pass, coverage 100 % (lines, branches, functions).
- `yarn test:integration:vereino --filter ISSUE-488` — first run: `getByTestId('public-sections')` not found (the club
  has no public section; switched the ready marker to `public-footer`); second run: `short en 480 px: events is not
  clickable` (see step 5); after the breakpoint change: 1 passed; after the move to 768 px (CI
  failure, step 7): 1 passed.
- `yarn test:integration:vereino --filter TEST-N09 --no-build` — 1 passed; `--filter E20-S07 --no-build` — 1 passed.
- `yarn verify` — all 22 steps passed (again after step 7).
- CI run 45221011943: every job green except integration shard 2 (`en light 640 px: the nav scrolls`); fixed in step 7.

## Open problems

None.

## Next steps

Review and merge the PR (merge train).
