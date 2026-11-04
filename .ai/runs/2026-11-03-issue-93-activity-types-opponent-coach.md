# Issue #93: activity types per group kind, an opponent and a coach picker of coaches

- **Date:** 2026-11-03
- **Agent / tool:** Claude Code (Opus 5.5) under cezar, `om-auto-fix-issue` with the repo-local override applied (feature route; the covering spec is the club management spec, so no spec PR)
- **Trigger:** `/om-auto-fix-issue 93` (E06-S11, epic #82)
- **Branch:** `feat/issue-93-activity-types-opponent-coach`, from `main` at 9dba789
- **Status:** completed, PR open for review.

## Goal

The activity wizard (B-14) offers the types that fit the group's kind, a match or a sparring takes an opponent, the coach picker lists only persons with an active coach or assistant role plus "No coach", and the session pages (B-15, M-04) show the opponent and a tournament's invited teams (club spec REQ-005, REQ-020, REQ-027; README B-14, B-15, M-04, F-04).

## Steps

1. Claimed #93 (assignee, `in-progress`, claim comment); FR triage: the API already stored `opponent_external_team_id` and `invited_external_team_ids` and refused a forged pair with 422, the UI did not use them — a real, unbuilt feature; no migration needed.
2. Pure rules in `lib/activities-rules.ts` (`typesForGroupKind`, `takesOpponent`, `typeLabelKey`) and `lib/coach-options.ts` (search and sort), with unit tests at 100 %.
3. Coach option source: `GET /api/activities/options/coaches` (`activities.manage`) on two additive DI methods, `people.personDirectory.roleHolderIdsOn` and `groups.directory.leaderIdsOn`.
4. Reads: `activityTeams` in `services/read.ts`; `opponentName` and `invitedTeamNames` on `GET /api/activities/occurrences/{id}` and every calendar entry.
5. UI: a kind-aware type select (custom CrudForm field), an "Opponent" select shown for a match or a sparring through a derived `takesOpponent` value, the coach combobox on the new source with "No coach"; rows on B-15 and M-04. en + pl.
6. Integration test `E06-S11-activity-types-opponent-coach.spec.ts` (API and browser at 375 px); spec API table, option-source list and changelog; module README and DI docs.

## Decisions

- **Who is a coach option:** an active `coach` role assignment (`people`) or an active `coach`/`assistant` group membership (`groups`) on the club's today. `assistant` exists only as a membership, so the route lives in `activities`, which requires both modules; `people` cannot read `groups`. The spec had foreseen `/api/people/options/persons?role=…`; the changelog records why.
- **Club-wide list:** a coordinator may pick any coach of the club (the mockup does the same); only names leave the route, and the conflict check covers the coach's other sessions.
- **Search in memory:** names are encrypted at rest, so the route decrypts the candidates through `findPersons` and filters by word prefix with diacritics folded; at most 50 options.
- **"No coach"** is a sentinel option (`none`) first in the list, sent as `coachPersonId: null`.
- **Opponent only for match and sparring:** other types send `opponentExternalTeamId: null`, so changing a match to another type clears it. The wizard has no invited-teams field (events keep theirs); an unknown external team error lands on the opponent field.
- Untouched: the session re-staff picker on B-15 still searches all persons (the substitution story owns it).

## Commands and results

- `yarn typecheck`, `yarn typecheck:qa`: pass.
- Unit: `activities-rules.test.ts`, `coach-options.test.ts` — 19 passed, 100 % lines/branches/functions for both files. First run failed one expectation: Polish collation sorts "Łukaszewski" before "Nowak"; the test expectation was wrong, fixed.
- `yarn test:integration:vereino --filter E06-S11`: 1 passed (2.5 min).
- `yarn test:integration:vereino --filter J-002` (drives the wizard's coach combobox): 1 passed (3.4 min).
- `yarn verify`, first run: failed at `lint` with 6 errors in my changes — `String()` on a string in the test (4), a void-returning arrow in `onValueChange`, a number in a template literal key. Fixed; `yarn verify --from lint`: all 9 steps passed; then a final full `yarn verify`: all 13 steps passed.

## Lessons

- New: `scripted-edits-keep-lf-on-windows` (Python text-mode writes produced CRLF files mid-run; normalized before committing).

## Open problems

- The activity list and record still label a class group's training "Training" (the label needs the group's kind on the list rows).
