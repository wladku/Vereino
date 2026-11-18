# Run: drive PR #363 (issue #288) to merge-ready

- **Trigger:** cezar task 240cea24, `om-auto-fix-pr 363`: the required check `integration (shard 2/3)` concluded FAILURE on head `d84e03cb`.
- **Issue / PR / branch:** #288 / #363 / `feat/issue-288-group-event-outside-opening-hours` (worked on a detached HEAD, pushed with `git push origin HEAD:<branch>`).
- **Spec:** `.ai/specs/2026-11-14-vereino-parity-facilities.md` (REQ-R19, DD-R15).

## Steps

1. Claimed the PR (assignee, `in-progress`, 🤖 comment).
2. Read the shard 2 log: `1 failed` (TEST-R15), `1 flaky` (TEST-R04), `80 passed`.
3. Merged `origin/main` (8bd43185) into the PR head: no conflicts.
4. Root cause of TEST-R15: the test (merged from main with #362) created a one-off group event 07:00–08:30 on a pitch open 08:00–22:00. REQ-R19 in this PR refuses it, as specified:
   `{"field":"startsAt","opening":[{"from":"08:00","to":"22:00"}],"hours":"08:00–22:00","code":"event_place_closed"}` — `Expected: 201, Received: 409`.
   Fix: the test's session moves to 08:00–09:30 and the maintenance window to 08:00–10:00, so the window still covers and flags it. The product rule is unchanged.
5. Scanned the other tests the merge brought in for events created outside opening hours. TEST-A19 uses a typed venue (not checked) and TEST-A20 a recurring activity (not checked, DD-R15), so neither is affected.
6. TEST-R04 flake (`facilities-slot-kind` showed "General purpose (club booking)" instead of "For a group"): `SlotDialog` sets the preselected kind once at mount (`useState(kinds[0])`), so the coach's groups arriving later leave the earlier kind in place. This race is already on main and this PR does not touch it, so it goes to a follow-up issue instead of growing this PR.
7. Review of the PR's code diff (stage 1 of the loop): no blocker or major found.

8. CI on `3ffac54d` went fully green (all three integration shards passed), but `main` gained #365 (#306) meanwhile and the PR turned `CONFLICTING`. Merged `main` again (`f811aaaf`); the only conflict was `BACKWARD_COMPATIBILITY.md`, where both sides added an independent bullet to the API-route list, so both were kept. The new #306 tests create no group events.

## Decisions

- Fixed the test, not the rule: REQ-R19 deliberately refuses one-off events outside opening hours, and TEST-R15 only needed a session that a maintenance window covers.
- TEST-R04 was not fixed here, to keep scope (follow-up issue).

## Files changed

- `packages/app/.ai/qa/tests/facilities/TEST-R15-maintainer-on-the-phone.spec.ts`
- this run log

## Commands and results

- `yarn test:integration:vereino --filter TEST-R15`: `1 passed (3.6m)` (the test itself 1.7m).
- `yarn verify`: `[verify] all 17 step(s) passed`.
- Pushed to `feat/issue-288-group-event-outside-opening-hours` (fast-forward, no force-push); CI on `3ffac54d`: all 10 checks passed.
- After the second `main` merge: `yarn verify` again `[verify] all 17 step(s) passed`; pushed and CI re-runs on the new head.

## Open problems / next steps

- Follow-up issue #366 filed for the TEST-R04 / `SlotDialog` preselected-kind race.
