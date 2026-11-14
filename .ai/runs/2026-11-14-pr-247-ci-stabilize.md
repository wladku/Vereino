# Run: drive PR #247 CI green (om-auto-fix-pr)

- **Goal and trigger:** cezar task asked to make PR #247 (issue #231, `fix/issue-231-club-zone-today`) merge-ready; the required checks `integration (shard 1/3)` and `integration` failed in run 43646164399.
- **Branch:** detached HEAD at `origin/fix/issue-231-club-zone-today`, pushed with `git push origin HEAD:fix/issue-231-club-zone-today`.

## Steps

1. Base merge: `git log HEAD..origin/main` was empty, so the branch already holds the latest `main`; nothing to merge.
2. Failing check: shard 1/3 had 1 failure and 64 passes. `E06-S12-sessions-list-perspectives.spec.ts:142` reported the axe violation `scrollable-region-focusable` (serious, 1 node) on the Calendar perspective, and the retry failed the same way.
3. Classification: **flake, time of day; not caused by this PR.** The failure screenshot shows the week Sun 8 – Sat 14 Nov with "Trening rozpoczęty" in the all-day row. `startNow` places the session from now −30 min to now +60 min. At 23:10 Warsaw on a Saturday that range crosses midnight, so react-big-calendar draws the session as an all-day event. The visible week then has no timed event, and the scrollable `.rbc-time-content` of the installed `ScheduleView` holds nothing a keyboard can reach. The PR's diff does not touch `CoordinatorCalendar.tsx` or the schedule view.
4. Follow-up #248 filed for the underlying problem: an empty week's time grid can't be reached by keyboard, and the test depends on the wall-clock hour. Fixing it in #247 would be scope creep.
5. Re-ran CI outside the failing window (after 00:30 Warsaw) by pushing this log.

## Decisions

- No test or baseline change: the violation is real product behaviour on an empty week, so baselining it here would only hide it. #248 holds the decision.
- No product change in #247: the change is unrelated to issue #231.

## Files changed

- `.ai/runs/2026-11-14-pr-247-ci-stabilize.md` (this log).

## Open problems / next steps

- #248: make the coordinator calendar's time grid keyboard-reachable and make E06-S12 independent of the clock.
- PR #247 keeps `needs-qa`: it changes user-facing date defaults, and the QA gate owns that label.
