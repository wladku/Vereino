# Run — issue #592: a class group goes through substitution and attendance like a team

- **Trigger:** Cezar queued `om-auto-fix-issue` for #592 (label `cezar`, 2026-11-22).
- **Issue / spec:** #592 (epic #565); `.ai/specs/2026-10-20-vereino-club-management.md` AC-004.
- **Branch:** `test/issue-592-class-group-substitution-attendance`.
- **Route:** `testing` + `spec-pr` (direct: a missing test for behaviour that exists, no product code).

## Steps

1. Claimed #592 (assignee, `in-progress`, `🤖` claim comment naming the worktree and branch).
2. Read `TEST-030-groups-of-both-kinds`, `E06-S13-coach-absence-substitutes`, the `attendance` fixtures (`familyFor` already has the team Żaki and the class group "Basen — początkujący" with their coaches and section coordinators).
3. Added a second test to `TEST-030-groups-of-both-kinds.spec.ts`: for the team and the class group in turn, a one-off training tomorrow, the group's coach reports an absence, the section coordinator is notified, finds it under "Needing a coach", sees the club coach Bartek free and assigns him, Bartek is notified, the check-off is `not_started` before the start and `open` after `startNow`, Bartek marks a present and an absent participant and closes the session. Each kind's outcome (assign kind, check-off states, acting role, marks, status, substitution entries with ids replaced by roles) is asserted literally for the team and with `toEqual` for the class group.
4. Updated the TEST-030 header comment (it said substitution and attendance "arrive with activities").
5. Ticked AC-004 with its evidence and dropped #592 from the generic coverage criterion; changelog file `2026-11-22-issue-592-class-group-sessions.md`. The status line is left as written (AGENTS.md *Spec status line*).

## Decisions

- API-only test: the substitution and check-off UI is already exercised for a team by `E06-S13` and `J-002`; AC-004 is about the domain cycle being kind-independent.
- Sessions at 15:00 and 17:00 so Bartek can substitute in both; `startNow` steps past the coach overlap when both are moved to now.

## Commands and results

- `yarn test:integration:vereino --filter TEST-030` → `3 passed (52.9s)`, the new test 8.8 s, first run.
- `yarn verify` → `all 20 step(s) passed`.

## Files changed

- `packages/app/.ai/qa/tests/groups/TEST-030-groups-of-both-kinds.spec.ts`
- `.ai/specs/2026-10-20-vereino-club-management.md`
- `.ai/specs/changelog/2026-10-20-vereino-club-management/2026-11-22-issue-592-class-group-sessions.md`
- `.ai/runs/2026-11-22-issue-592-class-group-sessions.md`

## Open problems / next steps

- None. AC-004 is the last kind-parity gap; the spec still waits on #593, #566, #471.
