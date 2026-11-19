---
title: "Integration tests that move sessions to now must survive any weekday and hour, including the fixture's own series"
modules: ["activities"]
areas: ["testing"]
topics: ["integration-tests", "time", "fixtures", "conflicts", "flaky"]
---

# Integration tests that move sessions to now must survive any weekday and hour, including the fixture's own series

**Context**: TEST-009 failed in the whole-suite run of #103 on Tuesday 2026-11-03 at about 17:07 club time, after the member-calendar tests had failed only on Sundays (#67).

**Problem**: The attendance fixture's series runs on Tuesdays 17:00–18:30 on the pitch, and `startNow` moved another session of that series to "30 minutes ago … in an hour". On a Tuesday afternoon that window overlaps today's session of the same series, and the move answered 409 (place conflict). A test that reads the clock passes for days and fails only at certain hours, so a coordinator sees a red suite on an unrelated PR.

A second shape (#248, E06-S12 on Saturday 2026-11-14 at 23:10): "30 minutes ago … in an hour" crossed midnight, so the coordinator calendar drew the session in its all-day row, the week had no timed session, and the axe scan of the grid failed. Near midnight on a Saturday the same window can also land in another week.

A third shape (TEST-L03, merge train of #387 on Wednesday 2026-11-18 at 17:22 club time): the test declared on "a session between today and the last day" of a Wednesday 17:00 series, and `>= today` picked today's session, which had already started, so the declaration answered 409 `declaration_closed`. A test that picks a session for a declaration, a move or any change that closes at the start must pick from tomorrow (`> today`), never today.

**Rule**: A fixture that places sessions relative to "now" must handle a conflict with the test's own data: retry with another window that keeps the test's meaning (`startNow` tries earlier, already-started windows; the check-off opens at the start and has no end). A test that reads the session back by day or week (calendar grids, "today" lists) passes `startNow(…, { sameDay: true })`, which cuts every window to today's club-zone date. Prove such a fix by forcing the collision or the bad hour once (a temporary first attempt in the colliding slot, or a fixed `now` passed to `startNowWindows`), not by waiting for the bad hour. Report a time-of-day failure with its window and rerun outside it before calling it unrelated.

**Applies to**: `packages/app/.ai/qa/tests/_fixtures/attendance.ts` (`startNow`, `START_NOW_WINDOWS`) and any fixture that schedules relative to the current time.
