# Issue #90: groups list filters, perspectives, coaches and participant counts; roster age and person link

- **Date:** 2026-11-03
- **Agent / tool:** Claude Code (Opus 5.5) under cezar (task 369486b3), `om-auto-fix-issue` with the repo-local override applied; no subagents
- **Trigger:** `/om-auto-fix-issue 90` (E06-S08, epic #82)
- **Branch:** `feat/issue-90-groups-filters-counts`, from `main` at 9dba789
- **Status:** completed, PR open for review.

## Goal

A coordinator filters the groups list (B-11) by section, kind, season and status, switches the perspective All / Teams / Class groups, keeps all of it in the URL, and sees each group's coaches and number of active participants; the roster (B-12) shows each person's age and links the name to the person record (B-10); the empty list offers "Add group"; the tabs read Groups / External teams / Seasons.

## Steps

1. Classified #90 as a feature (label `feature`). FR triage: open, unclaimed, no PR referencing it, the list API already accepted the filters but the UI had none and the list had no roster summary. Covering spec: the club management spec (UI table row of `/backend/groups/groups`, REQ-004) — reused and updated rather than a new spec, as for #103 (E06-S21). No migration, module, dependency or breaking contract, so no Ask First item.
2. Claimed #90 (assignee, `in-progress`, 🤖 comment) and branched from `main`.
3. Pure logic `groups/lib/group-list.ts`: URL state parse/serialize, perspectives, `hasGroupFilters`, `summarizeRosters`; unit tests at 100 %.
4. Server: `rosterSummaries` and `rosterPersons` in `services/groups-read.ts`; the list's `afterList` hook adds `coaches` and `participantCount` on the club day; the roster adds `person.age` on the club day. OpenAPI schemas extended (additive).
5. UI: `GroupsTable` with the perspective tablist (DD-U03 pattern of the UX parity spec), filter overlay, URL sync, new columns, empty and filtered-empty states, retry; `GroupsNav` order; `RosterPanel` age and person link (only with `people.view` — a coach lacks it); shared option loaders moved to `client-helpers`.
6. en + pl strings; module README; club spec UI row and Changelog.
7. Integration test `groups/E06-S08-groups-filters-and-counts.spec.ts` (API + UI).

## Decisions

- **Perspective = kind filter.** The tabs and the "Kind" filter write the same `kind` URL parameter, so they never disagree; the server already validates and scopes it.
- **Filters in the URL, page in component state.** A filter change pushes a history entry (back works); typing in the search replaces it. The page resets on every new filter state.
- **Participants** counts distinct persons with an active `participant` membership on the club day; an ended or upcoming membership does not count. **Coaches** lists active `coach` then `assistant` persons, each once.
- **Age, not birth date.** The roster exposes the age in completed years on the club day; the birth date stays inside `people`.
- **Person link only with `people.view`.** A coach (no `people.view`) sees the name as plain text instead of a link to a 403.
- **Section options** come from `/api/club_core/sections` (tolerant: a coach without `club_core.view` gets no options). A section outside the reader's scope yields an empty page — the record scope is applied before the business filters.
- **Roster stays a list** (not a table): the age is shown in each row's details line ("Age 9").

## Commands and results

- `npx jest src/modules/groups/lib --coverage`: 21 passed; `group-list.ts` and `groups-rules.ts` 100 % lines, branches and functions.
- First lint run: 2 errors in my code (an unused destructured `_kind`; `setState` in an effect for the page reset). Fixed by deleting the key from a copy and by keying the page to the filter state.
- `yarn test:integration:vereino --filter E06-S08`: 1 passed (2.7 min).
- `yarn verify`: all 13 steps passed.
- `yarn test:integration:vereino --filter E03-S01` (the existing groups tests over the changed screens): 6 passed (6.5 min).

## Open problems

- None known.
