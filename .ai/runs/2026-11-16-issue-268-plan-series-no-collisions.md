# Issue #268 — E10-S03: plan a series without collisions, work one activity's sessions

- **Date:** 2026-11-16
- **Agent / tool:** Claude Code (Opus 5.5) under cezar, `om-auto-fix-issue` (feature route) with the repo-local override; one background subagent for the reports slice
- **Trigger:** label `cezar` on #268 (issue.labeled)
- **Spec / issue / branch:** `.ai/specs/2026-11-14-vereino-parity-groups-and-activities.md` phase 3 (Ready for implementation since 2026-11-16); #268; epic #252; branch `feat/issue-268-plan-series-no-collisions`
- **Status:** completed (PR opened; see Next steps)

## Goal

Phase 3 of the groups and activities parity spec: REQ-A04 (without the deadline field), REQ-A05, REQ-A06; TEST-A05…A08, TEST-A22 (list part); AC-A04…AC-A06; J-A05.

## Steps

1. Triage: feature label, spec `Ready for implementation`, no open PR or claim → feature route. Claimed #268 (assignee, `in-progress`, 🤖 comment).
2. Sessions list views (`lib/occurrence-list.ts`): `?view=` with the `?perspective=` alias (DD-A11), the `reschedule` view, `?activity=` scope, inline row actions; unit tests.
3. Restore: `activities.occurrences.restore` (club administrator, reason 3–500, only before the end, collision check, undo), `POST /api/activities/occurrences/{id}/restore`, error codes `occurrence_not_cancelled` and `occurrence_already_ended`; `mayRestore`, `placeAddress`, `placeGeoLat`, `placeGeoLng` on the staff session read.
4. B-15 UI: view tabs, scope header "Sessions of {activity}" with "All sessions", inline buttons (Assign substitute primary / Change coach, Move, Cancel or Attendance list) collapsing into the row menu under 1024 px, `MoveOccurrenceDialog` (the record's move form extracted and shared), per-view `EmptyState`, cancel dialog naming the session with the `notified` toast; record: place line with address and map link (`lib/venue.ts`), Restore dialog.
5. B-13: Sessions row button, rule with its last day, type badge ("Classes" for a class group via the additive `groupKind` list field), subtitle, `EmptyState` with "New activity", `?groupId=` filter.
6. B-14: group "Name (Section)" with `?groupId=` prefill, own bookable places only with a no-place / load-failure hint and a link to Places, one "Last day" (the rule's end is the activity's `endsOn`), invited teams for a tournament, preview-gated Create (own action bar; focus to the announced result), redirect to B-15 `?activity=`.
7. Subagent: B-16 CSV headers in the request locale and the locale's separator, unsettled explanation; B-17 Scope / Applies to columns and "24 h"; TEST-A08; E06-S14 adapted. Reviewed its diff and merged its i18n keys into the catalogs.
8. Integration tests TEST-A05, TEST-A06, TEST-A07 written; E03-S02, E06-S11, J-002, E06-S12, E06-S13 adapted to the gated Create, the new redirect, the "Name (Section)" group label and `?view=` URLs.
9. `yarn verify` (three resumptions after lint and ds:check fixes), integration tests one id per run.

## Decisions

- Create is gated with an own action bar (`embedded` + `hideFooterActions` + `formId`): the platform `CrudForm` submit button has no disabled prop; `onSubmit` refuses too, so Ctrl/Cmd+Enter cannot bypass the gate.
- A preview with zero sessions counts as not clear (the server would answer 422 `activity_no_sessions`); a preview whose occupancy provider failed but found no conflict enables Create (the server still checks on save).
- The view id of "Upcoming" stays `all` (label from Q-A17), so `perspectiveHref` keeps a bare path for it.
- Invited teams are sent only for a tournament, so editing another one-off event never wipes its invited teams.
- The move form offers every bookable leaf (an away session may sit at an external place); the wizard offers own places only.
- Restore emits `activities.occurrence.updated` without a `change`; the announced notice is phase 6 (E10-S06), as the issue says.

## Files changed

`packages/app/src/modules/activities/`: `commands/occurrences.ts`, `data/validators.ts`, `lib/error-codes.ts`, `lib/occurrence-list.ts`, `lib/venue.ts` (new), `lib/coach-units.ts`, `services/read.ts`, `services/coach-units.ts`, `api/shared.ts`, `api/occurrences/[id]/route.ts`, `api/occurrences/[id]/restore/route.ts` (new), `api/reports/coach-units/route.ts`, `components/{ActivitiesTable,ActivityForm,PreviewPanel,activity-form-values,client-helpers,OccurrencesTable,OccurrenceRecord,CancelOccurrenceDialog,MoveOccurrenceDialog (new),RestoreOccurrenceDialog (new),CoachUnitsReport,PoliciesTable}.tsx|ts`, `i18n/en.json`, `i18n/pl.json`, unit tests in `lib/__tests__/`; integration tests in `packages/app/.ai/qa/tests/`; spec changelog entry; this log.

## Commands and results

- `yarn verify`: first run failed at `lint` (4 errors in my code: two `String()` on strings in `ActivityForm.tsx`, a click handler on a `span` in `OccurrencesTable.tsx`) → fixed; `--from lint` failed at `ds:check` (`coach-units.ts:248:51 [arbitrary-tailwind]`, a labelled tuple type read as a Tailwind value) → plain tuple; `--from ds:check`: all 11 remaining steps passed (test 100 % coverage, build).
- `yarn test:integration:vereino --filter TEST-A05`: first run failed at `toContainText(uiText('activities.fields.place.none', { exact: true }))` (the alert also holds the link text: `Received string: "The club has no bookable place of its own yet. Add a place before planning a series.Open Places"`) → non-exact match; rerun `1 passed (2.0m)`.
- Integration, one id per run (): TEST-A05 1 passed; TEST-A06 1 passed; TEST-A07 first run failed at its last line ( → :  had ended the admin's API token, lesson ), checked on the page instead, rerun 1 passed; TEST-A08 1 passed; E03-S02 4 passed; E06-S11 1 passed; E06-S13 1 passed; E06-S14 1 passed; J-002 first run failed ( on the coach option, "element was detached from the DOM"), the pick now retries as E06-S11's  does, rerun 1 passed.
- :  passed twice;  failed twice with  as the first test of the run on a cold server, no server error logged — the same known flake recorded in  (from #216); its path (event create, move, calendar read) is not changed here.

## Open problems

-  keeps its 20 s default timeout and fails on a cold local server (pre-existing, not touched).

- The Polish CSV keeps amounts with a decimal point (`1730.00`); the spec asks only for headers and the separator.
- The CSV headers of `GET /api/activities/reports/coach-units?format=csv` changed from fixed lowercase names to the locale's report headers (required by REQ-A06; documented in the route's OpenAPI).

## Next steps

Review and merge the PR; phase 4 (deadline) and phase 6 (moved-session notices, including the restore notice) build on it.
