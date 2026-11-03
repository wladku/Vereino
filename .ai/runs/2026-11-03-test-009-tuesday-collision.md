# 2026-11-03: TEST-009 failed on Tuesday afternoons (startNow place conflict)

- **Date:** 2026-11-03
- **Agent / tool:** Claude Code (Opus 5.5), coordinator session
- **Trigger:** the whole-suite run of #103 (PR #144) failed TEST-009 twice; the product owner answered "Yes, fix it".
- **Branch:** `fix/test-009-tuesday-collision`
- **Status:** completed, PR open for review.

## Cause

`startNow` (`packages/app/.ai/qa/tests/_fixtures/attendance.ts`) moved a session to "started 30 minutes ago, ends in an hour". The attendance fixture's series runs on Tuesdays 17:00–18:30 on the pitch, so on a Tuesday between about 15:30 and 19:00 club time the moved session overlapped today's session of the same series and the move answered 409 (place conflict). TEST-009, E03-S04 and J-002 use `startNow`.

## Fix

`startNow` tries the windows in `START_NOW_WINDOWS`: first the old one, then, only after a 409 with conflicts, windows that started and ended 3, 6 or 9 hours earlier. The check-off opens at the start and has no end (`activities/lib/policy.ts`), so every window keeps the tests' meaning. Any other refusal, or no window left, fails with every attempt listed.

## Commands and results

- **Proof on the bad hour:** a temporary first attempt forced the move into today's Tuesday 17:15–17:45 slot. TEST-009: both training sessions got 409 with conflicts and were retried, the pool session got 200; 4 passed (2.1 min). The temporary code was then removed.
- Normal runs: TEST-009 4 passed (2.1 min), E03-S04 1 passed (52.6 s), J-002 1 passed (1.1 min).
- `yarn verify`: generate … lint passed, `format:check` failed on the fixture; after `yarn format`, `yarn verify --from format:check` passed the remaining 8 steps.

## Lessons

- New: `integration-tests-must-not-depend-on-the-clock`.
