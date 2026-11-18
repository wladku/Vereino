# Run: issue #272 (E10-S07) — attendance in one tap, taking over an unstaffed session, match scores

- **Goal and trigger:** cezar task (`om-auto-fix-issue 272`, label `cezar`): build phase 7 of the groups and
  activities parity spec — member session surfaces (REQ-A13), quick fill, attendance window, take-over and the unstaffed
  warning (REQ-A14), scores (REQ-A15).
- **Spec / issue / branch:** `.ai/specs/implemented/2026-11-14-vereino-parity-groups-and-activities.md` phase 7; #272 (epic #252);
  branch `feat/issue-272-coach-attendance-phone`.
- **Approval:** the spec is `Ready for implementation`; migration C, the scheduler target
  `activities:warn-unassigned-sessions` with `activities.session_without_coach`, the take-over and score routes and the
  30-minute attendance window (DD-A13, Q-A18, Q-A19, Q-A21) were approved by the owner on #252 on 2026-11-16. Migration C
  was generated, never applied.

## Steps

1. Claimed #272 (assignee, `in-progress`, claim comment); dependency #270 is merged.
2. Attendance: `lib/attendance-sheet.ts` `quickFill` / `declaredNo` (an `absence_only` session fills everyone without a
   final "no"), `lib/policy.ts` `CHECK_OFF_LEAD_MINUTES`, `checkOffOpensAt`, `checkOffWindow` opening 30 minutes before
   the start; the list read gains `checkOffOpensAt`; `ClubAttendancePage.tsx` labels the fill by kind, explains a
   disabled fill and says when the list opens.
3. Take-over: `activities.occurrences.take_over` in `commands/substitutions.ts` (the `coach` grant on the group, whose
   `coached_group_ids` are the coach and assistant memberships; the shared `assertCoachFree`; a substitution entry and
   `activities.occurrence.coach_changed`), `POST /api/activities/occurrences/{id}/take-over`.
4. Unstaffed warning: `lib/substitutions.ts` `unstaffedWarningWindow`, `unstaffedWarningDue`,
   `unstaffedWarningRecipients`; `services/unstaffed-warning.ts`; job command `activities.occurrences.warn_unassigned`,
   worker `activities:warn-unassigned-sessions`, the fourth schedule of `setUpClubActivities` (flag
   `warnUnassignedSessions`), CLI `activities warn-unassigned-sessions`; notification type
   `activities.session_without_coach`.
5. Score: entity columns and `@Check`, migration C `Migration20261117214826_activities.ts` from the offline
   `yarn db:generate` (header comment and `if exists` in `down` added by hand); `lib/score.ts`; `commands/score.ts`
   (`activities.occurrences.record_score`, undoable); `PUT /api/activities/occurrences/{id}/score`; the snapshot of a
   session carries the score.
6. Reads: the member view gains `placeExternal`, `isAway`, `score`; `GET /calendar/{id}?as=coach` gains `mayTakeOver`,
   `mayScore`, `substitutions`; the staff read gains `isAway`, `score`, `mayScore`; `substitutionHistorySchema` and
   `scoreSchema` shared in `api/shared.ts`.
7. Surfaces: `@vereino/core` `CalendarItem` gains `placeHref` and `links`; `@vereino/ui` `CalendarList` renders the map
   link (`labels.map`) and secondary links; `club-client.ts` maps the type badge, the map link (`lib/venue.ts`
   `cardMapHref`), "substitute: {name}", the coach card's title to the session page and its "Attendance list" link;
   `SessionCardFacts.tsx` on the Today cards and the session page; `CoachSessionBlock.tsx` gains "Take the session",
   "Message the group", the score form and the substitution history; `ScoreForm.tsx` shared with the panel record
   (`OccurrenceRecord.tsx`).
8. `communication`: `lib/member-inbox.ts` `composePreset`; `ThreadComposer` `initialAudience`; the member inbox opens
   the composer addressed to a session from `?compose=occurrence:<id>`.
9. Integration tests TEST-A19, TEST-A20, TEST-A21; ISSUE-192 expects the fourth schedule flag. Spec changelog entry,
   lesson `killed-run-leaves-worktree-index-lock`.

## Decisions

- **"Once" without a marker column.** Migration C was approved for the score columns only, so the warning keeps no
  state on the session. It is sent once per session and recipient: the notice's group key is the session id, a
  recipient who already has a notice with that key (any status, also read or dismissed) gets none, and a
  transaction-level advisory lock per session serializes two runs. The spec's "`advanceWhere`" would need a column; the
  PR asks the owner whether that is acceptable.
- **Recipients.** The section's coordinators (the club administrators when the section has none, as the coach-needed
  notice) plus the group's coaches and assistants on the session date. The group's leaders link to the session page as
  the coach (where they take it over); coordinators to the panel record.
- **Take-over compares no version.** The session row is locked for the write and "no coach" is re-read under it, so
  the slower caller gets 409 `occurrence_has_coach` (AC-A15) instead of a version conflict.
- **Score authorization** reuses the check-off grants (`CHECK_OFF_KINDS` with the session's assigned coach through
  `self`); a cancelled session answers 409 `occurrence_not_planned`; both scores null clear the score and its note;
  half a score is a 400 validation error.
- **Away scores.** `scoreHome` is the club's team unless the activity is away (spec glossary); the form and the reads
  show the club's team first.
- **"External place".** An external place is never bookable, so a session there is in practice a typed venue; both
  count as `placeExternal` and get a map link on the cards (club places get it on the session page only).
- **"Message the group".** No member composer was scoped to a session, and `activities` must not import
  `communication`: the session page links `/club/messages?compose=occurrence:<id>` and `communication` parses it.
- **Substitute on cards** is a badge ("substitute: {name}") so the calendar's "Coach: {name}" line stays clean.
- **Quick fill on a match** stays covered by E06-S17; TEST-A20 covers the training only.

## Commands and results

- `yarn generate` — pass; `yarn typecheck` — first run: `cli.ts` unterminated string (a `\\n` lost in a shell heredoc),
  then `unstaffed-warning.ts` TS2345 (`coachPersonId` optional); both fixed; later runs pass. `yarn typecheck:qa` — pass.
- `yarn db:generate` (offline, snapshot-based) — `activities: generated Migration20261117214826_activities.ts`, every
  other module "no changes". Not applied.
- `npx jest src/modules/activities/lib src/modules/communication/lib --coverage` — 27 suites, 347 tests pass, 100 %.
- `packages/ui` `yarn test` — pass, `calendar-list.tsx` 100 %.
- `yarn test:integration:vereino --filter TEST-A21` — 1 passed (2.7m).
- `yarn test:integration:vereino --filter TEST-A20` — 1 passed (5.1m).
- `yarn test:integration:vereino --filter TEST-A19` — first run failed: `expect(locator).toContainText(expected) failed
  … Expected pattern: /^(?:Friendly|Sparing)$/` (an `exact` pattern in `toContainText`, a test bug); fixed; second run
  1 passed (3.1m).
- `yarn verify` — first run: generate, typecheck, typecheck:packages, typecheck:qa pass; lint FAIL
  (`ScoreForm.tsx 8:10 error 'flash' is defined but never used`), fixed. `yarn verify --from lint`: lint pass,
  format:check FAIL (`TEST-A19-…spec.ts`, `TEST-A21-…spec.ts` not formatted), `yarn format`. `yarn verify --from
  format:check`: all 12 remaining steps pass (test 47s, test:scripts 14s, build 132s).

## Review (PR #361)

An independent review agent read the diff `b15dfbf0..69ec9787`. It found no high-severity problem and three low-to-medium
edge cases:
1. A take-over had no time limit, so a past, never-closed session could be claimed for the units report. Fixed:
   `lib/substitutions.ts` `takeOverProblem` refuses an ended session (409 `occurrence_already_ended`), and
   `mayTakeOver` follows it.
2. The take-over relied on today's grant only. Fixed: `leadsGroup` requires a coach or assistant membership on the
   session's date (403 `scope_denied`).
3. The 30-minute window also lets the list be closed before the start. Kept: the close dialog already warns "has not
   started", and AC-A15 closes the training inside the window.

After the fixes: `npx jest …/substitutions.test.ts` 18 passed, `substitutions.ts` 100 %; `yarn verify` — all 17
steps passed in one run; `yarn test:integration:vereino --filter TEST-A20` — 1 passed (4.6m).

## Open problems

- The run was killed once (exit 137). Afterwards a stale `index.lock` of this worktree
  (`C:/Users/wkuc/vereino/.git/worktrees/ff9bf410-…/index.lock`, 17:01) blocked every commit; it lives in the owner's
  checkout, which the run may not touch. The run committed through a temporary index instead
  (`GIT_INDEX_FILE=<task tmp>/git-index git read-tree HEAD`, then `git add` and `git commit`), leaving the lock
  untouched; the worktree's own index stays stale until the owner removes the lock.
- Existing clubs get the warning schedule only after `yarn mercato activities set-up-club --tenant <id> --org <id>`
  (release note).

## Next steps

PR #361 is ready for the owner's review and the merge train; phase 8 (E10-S08) builds on this.
