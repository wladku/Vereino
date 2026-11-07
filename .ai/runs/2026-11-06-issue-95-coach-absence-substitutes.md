# Issue #95: E06-S13, coach absence, substitutes and unsettled sessions

- **Date:** 2026-11-06
- **Agent / tool:** Claude Code (Opus 5.5), `om-auto-fix-issue` with the repo-local override applied, run by cezar; no subagents
- **Trigger:** `/om-auto-fix-issue 95` (E06-S13, epic #82), the second run after the stop of 2026-11-05 (`.ai/runs/2026-11-05-issue-95-coach-absence-substitutes.md`, on the local branch `feat/issue-95-coach-absence-substitutes`, never pushed)
- **Spec / issue / branch:** `.ai/specs/2026-10-20-vereino-club-management.md` phase 2 step 6 (REQ-008, DD-12, TEST-010); #95; `feat/issue-95-coach-absence-substitutes-2` (the first run's local branch name was taken)
- **Status:** implemented, PR opened (see the issue)
- **Promoted rule:** `signInBrowser` ends the API token — corrected a second time here, so the rule moved into `AGENTS.md` → Validation (lesson `sign-in-browser-ends-the-api-token` updated).

## Goal

A coach reports an absence, the session joins the coordinator's "Needing a coach" list and the coordinator is notified; the coordinator assigns a substitute from coaches who are free at that time, a substitution entry is kept and the substitute is notified; "Unsettled" lists, badges, the two dashboard widgets and the coach's Today alert.

## Steps

1. Re-checked the blockers of the first run: the owner approved the `activities_substitution_entries` migration on 2026-11-05 (issue comment), #94 (PR #165) and #97 (PR #176) are on `main`. No open claim or PR; claimed the issue (assignee, `in-progress`, claim comment naming this run).
2. Read the spec rows (DD-12, Data Models `SubstitutionEntry`, API rows `…/absence`, `…/coach`, Events), README B-15/M-04/F-03 and the mockup (`app.ts` dialogs and copy), and the code it touches (`commands/occurrences.ts`, `check-off.ts`, `services/calendar.ts`, `schedule.ts`, the B-15 list and record, M-04, M-05, the Today widget, the E06-S06 widget of `people`).
3. Data: `SubstitutionEntry` on `AppendOnlyEntityBase` (the foundation guard refuses update/delete), `encryption.ts` for `reason`; `yarn db:generate` (offline from the module snapshot) produced exactly the table and its two indexes; `down()` written by hand.
4. Backend: `lib/substitutions.ts` (pure rules), `commands/substitutions.ts` (`report_absence` with `self` on the assigned coach's person; `assign_coach` with the planning kinds, the coach-candidate check, the busy check under the schedule lock), routes `…/absence` and `…/coach` (`GET` options, `POST` assign), events and in-app notices with two persistent subscribers, list filters `unassigned` / `unsettled`, `substituteFor*` on list, detail and calendar reads, `substitutions` on the detail, and substituted sessions pinned against a series edit.
5. UI: B-15 perspectives "Needing a coach" / "Unsettled", coach badges, "Unsettled" badge, row action and record button "Assign substitute" / "Change coach" (`AssignCoachDialog`), the record's history and "{substitute} for {coach}"; the record's Move form no longer edits the coach; M-04 and M-05 "Report absence" (`ReportAbsence`) for the assigned coach; M-03 badges through `toCalendarItem`; the coach's Today "Unsettled session" alert; the widgets `activities.dashboard.sessionsNeedingCoach` and `…unsettledSessions`; en + pl copy (Polish wording follows the module: "zajęcia", "trener").
6. Tests: unit tests for `substitutions.ts`, `dashboard-rules.ts` and the new `occurrence-list.ts` rules (100 %); integration test `E06-S13-coach-absence-substitutes.spec.ts`.
7. Docs: module README section, spec changelog file, this log.

## Decisions

- **Who reports an absence:** only the session's assigned coach (spec API row "the session's coach"); a coach of another group and a non-assigned coach of the same group get 403. Not after the start (409 `absence_after_start`): a started session is run or cancelled (#139).
- **Who is notified:** the coordinators of the session's section on the club's today, the club administrators when the section has none (a session must not wait unseen). The reason never goes into a notice.
- **Kinds:** `coach_restored` when the session goes back to the coach it had before its first entry; `substitute_assigned` otherwise. "Substitute for" is that own coach while someone else leads the session.
- **No undo:** both commands are not undoable — the history is append-only and a correction is a new assignment (spec glossary "Entries are not editable; correction = new entry").
- **Busy check:** only the coach (planned sessions of the candidate overlapping the session), not the place: the place does not change, and the AC asks for `occurrence_coach_conflict`. A non-coach person is refused (422 `activities_reference_invalid`).
- **Pinning:** a session with a substitution entry is pinned against a series edit (`actedOnSessionIds`), so a regeneration never undoes a substitution; the session is not marked detached, so it does not show "Moved".
- **Move form:** the coach field left the record's Move form so every coach change is in the history; `PATCH …/{id}` still accepts `coachPersonId` (no contract change).
- **Unsettled:** the spec predicate, planned and 24 hours after the end; the B-15 perspective has no default window, so an old unsettled session stays visible until closed.
- **Widgets and roles:** the coordinator role keeps no `dashboards.view` — the `@vereino/core` roles test pins that (#88) and D29 has every role but the administrator work from the phone. The widgets need `dashboards.view` + `activities.view`, so today they serve the administrator; the coordinator gets the notice and the B-15 perspectives. Not changed without an owner decision.

## Files changed

- `packages/app/src/modules/activities/`: `data/entities.ts`, `encryption.ts`, `migrations/Migration20261106161828_activities.ts` + snapshot, `lib/substitutions.ts`, `lib/dashboard-rules.ts`, `lib/occurrence-list.ts`, `lib/activities-rules.ts`, `lib/error-codes.ts`, `data/validators.ts`, `events.ts`, `notifications.ts`, `commands/substitutions.ts`, `api/occurrences/[id]/absence/route.ts`, `api/occurrences/[id]/coach/route.ts`, `api/occurrences/route.ts`, `api/occurrences/[id]/route.ts`, `api/shared.ts`, `services/substitutions.ts`, `services/substitution-notice.ts`, `services/calendar.ts`, `services/directory.ts`, `services/schedule.ts`, `services/series.ts`, `services/preview.ts`, `subscribers/notify-coach-needed.ts`, `subscribers/notify-substitution-assigned.ts`, `components/AssignCoachDialog.tsx`, `components/SessionsWidget.tsx`, `components/OccurrencesTable.tsx`, `components/OccurrenceRecord.tsx`, `components/client-helpers.ts`, `components/club/{ReportAbsence,CoachSessionBlock,ClubSessionPage,ClubAttendancePage}.tsx`, `components/club/club-client.ts`, `widgets/dashboard/{sessions-needing-coach,unsettled-sessions}/`, `widgets/injection/club-today/widget.client.tsx`, `i18n/en.json`, `i18n/pl.json`, `README.md`, unit tests.
- `packages/app/.ai/qa/tests/activities/E06-S13-coach-absence-substitutes.spec.ts`.
- `.ai/specs/changelog/2026-10-20-vereino-club-management/2026-11-06-issue-95-coach-absence-substitutes.md`, this log.

## Commands and results

- `yarn db:generate` → `activities: generated Migration20261106161828_activities.ts`, every other module "no changes".
- `yarn typecheck`, `yarn typecheck:qa` → exit 0.
- `npx jest src/modules/activities/lib --coverage` → 138 tests passed; `substitutions.ts`, `dashboard-rules.ts`, `occurrence-list.ts`, `activities-rules.ts` 100 % lines, branches, functions.
- `yarn lint` (first run) → 2 errors: `@mikro-orm/postgresql` imported in the coach route (REQ-F16 boundary) and an unnecessary type assertion; fixed by moving the options read into `services/substitutions.ts` (`substituteOptionsFor`). Second run → 0 errors.
- `yarn contracts:check` → 0 problems; `yarn ds:check` → passed; `yarn spec-changelogs:check` → valid.
- `yarn test:integration:vereino --filter E06-S13`, first run → failed at the accessibility scan of the absence dialog: `expect(page.getByTestId('club-absence-dialog')).toBeVisible()` — "element(s) not found" inside `scanInColorSchemes`, which reloads the page for each colour scheme and so closes the dialog. Everything before it had passed (403 for the instructor, 400 for a 201-character reason, the dialog text). The `ready` callback now reopens the dialog (lesson `axe-after-color-scheme-and-react-query-error-refetch` extended).
- Second run → failed at the list read after the assignment: `expect(listed.items.at(0)).toMatchObject(…)` — "received value must be a non-null object". Everything before passed: the absence from the phone with the toast and "Needs a coach", `activities.coach_needed` to the academy coordinator only, Irena busy in the options, the forged assignment 409 `occurrence_coach_conflict`, the B-15 dialog with Irena disabled and "Busy: Basen wieczorny", Bartek's notification and his `as=coach` read with `substituteForPersonId`.
- Third run (list check made to assert the status) → `Expected: 200, Received: 401`: `signInBrowser` sets a new password, which ends the coordinator's API token taken before. The test now takes a fresh token after each browser sign-in (the test's own defect, not the app's).
- Fourth run → `1 passed (3.2m)`.
- `yarn verify` → passed generate, typecheck, typecheck:packages, typecheck:qa; failed at `lint`: `no-unnecessary-type-assertion` on the test's list-row cast (written as a typed declaration). `yarn verify --from lint` → lint passed; failed at `format:check` (the spec and `substitutions.test.ts` not formatted; `yarn format`). `yarn verify --from format:check` → all 9 remaining steps passed (`test` 40 s with the 100 % thresholds, `build` 114 s). A final full `yarn verify` → all 14 steps passed.

## Open problems

- None. The coordinator role has no `dashboards.view` (D29), so the two widgets serve the administrator until the owner decides otherwise.

## Next steps

- Review on the PR; #96 builds the unit credit on these entries.
