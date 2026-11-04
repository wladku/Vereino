# Issue #100: member calendar with a section legend, the coach, an empty week with Next and a month list

- **Date:** 2026-11-03
- **Agent / tool:** Claude Code (Opus 5.5), `om-auto-fix-issue` with the repo-local override applied; the implementation was started by a subagent of the other coordinator session and finished by a resumed subagent of this one; the coordinator's review and gate
- **Trigger:** `/om-auto-fix-issue 100` (E06-S18, epic #82)
- **Branch:** `feat/issue-100-calendar-legend`, from `main` at 793fbcb
- **Status:** completed, PR open for review.

## Goal

A guardian with children in two sections tells them apart in `/club/calendar`, moves on from an empty week, and can see a month at once (README M-03; club spec REQ-006; D29 phone-first).

## Steps

1. Q1 (month list?) was blocking. The product owner answered on 2026-11-03: a Week/Month switch, the month lists only the days with sessions, no grid. Recorded on the issue.
2. Claimed #100 and created a worktree from `main`.
3. A subagent of the other coordinator session wrote most of the implementation and stopped before any gate; that session handed #100 to this one. A resumed subagent here built on it, added the E06-S18 integration test, ran `yarn verify` and reran TEST-014, E03-S04 and J-002.
4. **Coordinator review:** section colours come from the platform's `ChartLegendDot` token palette and every marker carries the section name (not colour alone); the coach comes from the existing `coachName` (staff, R15 unaffected); no API change, migration, module or dependency.
5. **Coordinator gate:** `yarn verify` and the whole integration suite.

## Decisions

- No URL sync: a reload returns to this week (TEST-014 and J-002 expect it); a `?from=&to=` link is read once.
- The UI trims a range only after the server's 400 `calendar_range_invalid`; a month always fits the 62-day limit.
- Section colours are stable per section id and repeat after 9 sections; the names keep them apart.

## Commands and results

- Subagent: `yarn verify` 13/13; E06-S18, TEST-014, E03-S04 and J-002 each passed (the first E06-S18 run failed on a keyboard step in the test, fixed — see the lesson).
- Coordinator: `yarn verify` 13/13. **Whole suite: 101 passed, 1 failed (1.4 h).** The failure is J-001 (`journeys`, pages this PR does not touch): `page.goto` answered `net::ERR_ABORTED`, on the public club page in the first attempt and on `/backend/people/persons/create` in the retry, so a navigation race and not an assertion. J-001 rerun alone: 1 passed (3.0 min).

## Lessons

- New: `radix-radio-group-arrow-moves-focus-only`.

## Open problems

- README M-03's day skeletons while loading are not built; the page keeps `LoadingMessage`.
- J-001 once failed with `net::ERR_ABORTED` on `page.goto` during the whole suite, at a different step in each attempt (flaky; follow-up if it recurs).
