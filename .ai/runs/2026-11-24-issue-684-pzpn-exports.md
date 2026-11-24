# E24-S04 PZPN exports: team schedule and attendance as CSV

- **Date:** 2026-11-24
- **Agent / tool:** Claude Code (Opus 5.5), `om-auto-fix-issue` (feature route) under a Cezar run
- **Trigger:** the `cezar` label on issue #684
- **Spec / issue / branch:** `.ai/specs/2026-11-23-vereino-training-outlines-and-medical-expiry.md` phase 3; #684 (epic #671); `feat/issue-684-pzpn-csv-exports`
- **Status:** completed

## Goal

Build phase 3 of the training outlines spec: two report routes, the page `/club/reports/pzpn` (M-O9), the optional
`training.outlineTopics` resolver, isolation probes and TEST-O08 (AC-O09).

## Steps

1. Claimed #684 (assignee, `in-progress`, claim comment naming this run). The owner's comment asked to build once the
   spec PR that sets the status to Ready (#687) merges; work started while #687 ran its CI, and the PR opens only after
   #687 merged.
2. Read the spec (REQ-O10, DD-O06, DD-O09, API table, CSV columns, TEST-O08) and the coach units report it reuses.
3. Pure logic `activities/lib/pzpn-export.ts` (columns, PZPN values, period check, CSV with BOM) with unit tests at 100 %.
4. Service `activities/services/pzpn-export.ts`, routes `api/reports/pzpn-schedule` and `pzpn-attendance` with a shared
   handler `api/pzpn-export-shared.ts`, error codes, validator, i18n (en, pl).
5. Page `/club/reports/pzpn` (`components/club/ClubPzpnPage.tsx`) and a link on the club group page (`groups`).
6. Isolation probes in `inventory/activities.json`; integration test `TEST-O08-pzpn-exports.spec.ts`.
7. README section, spec changelog entry, `yarn verify`.

## Decisions

- **Access as the spec's TEST-O08 asks.** `activities.reports.view` checks the group against the `club_admin`,
  `coordinator` and `coach` grants, `view_own` only against `coach`; a group outside them answers the same 404
  (`report_group_not_found`) as an unknown group, so cross-club and cross-group ids look alike (#628). No feature → 403.
- **Period on the real start.** A moved session keeps its slot date (`occurrence_date`), so the period filter and the
  date and roster day use the club-zone date of `start_at`: the file shows the day a session actually ran.
- **Schedule status values** "Zaplanowane" / "Odwołane" (Polish, like the event types); a held session is "Zaplanowane",
  as the spec names only planned / cancelled. V-O1 rechecks the wording and order with a certified club.
- **"Usprawiedliwiony"** needs `actual = absent`, `declared = no`, `declaration_status = final` and `declared_at` before
  `start_at` (spec text).
- **Topic resolver** is a consumer-owned optional DI contract `trainingOutlineTopics.topicsFor(scope, occurrenceIds)`;
  without `training` the name column holds the activity name (the spec's fallback).
- **Reachability.** The page is linked from the club group page (team preselected) instead of a new "More" entry, which
  would touch the shared member navigation, six catalogs and older menu tests; M-O9 asks for the page only.
- **CSV only.** `format` accepts only `csv` (the spec's API table); no JSON variant was asked for.

## Files changed

- `packages/app/src/modules/activities/lib/pzpn-export.ts`, `lib/__tests__/pzpn-export.test.ts`, `lib/coach-units.ts`
  (export `csvField`), `lib/error-codes.ts`, `data/validators.ts`
- `packages/app/src/modules/activities/services/pzpn-export.ts`, `api/pzpn-export-shared.ts`,
  `api/reports/pzpn-schedule/route.ts`, `api/reports/pzpn-attendance/route.ts`
- `packages/app/src/modules/activities/components/club/ClubPzpnPage.tsx`, `frontend/club/reports/pzpn/page.tsx`,
  `page.meta.ts`, `i18n/en.json`, `i18n/pl.json`, `README.md`
- `packages/app/src/modules/groups/components/club/ClubGroupPage.tsx`, `groups/i18n/en.json`, `groups/i18n/pl.json`
- `packages/app/scripts/check-glossary.allow.json`, `.ai/lessons/moved-session-keeps-occurrence-date.md`
- `packages/app/.ai/qa/tests/activities/TEST-O08-pzpn-exports.spec.ts`,
  `packages/app/.ai/qa/tests/_fixtures/isolation/inventory/activities.json`
- `.ai/specs/changelog/2026-11-23-vereino-training-outlines-and-medical-expiry/2026-11-24-issue-684-phase-3.md`

## Commands and results

- `npx jest src/modules/activities/lib/__tests__/pzpn-export.test.ts --coverage` — 100 % lines, branches, functions.
- `yarn generate` — ok. `yarn typecheck` — ok. `yarn route-isolation:check` — 214 routes, 0 problems (a first draft
  with `"expect": [404]` failed: "a non-default expect must say why"; the default already accepts 404).

- `yarn test:integration:vereino --filter TEST-O08` — first run failed: `Expected: 200 Received: 201` on
  `POST /api/activities/attendance/declare` (it answers 201 for a new row); second run failed:
  `Unrecognized key: "venueName"` (the create body takes `venue: { name, address }`); third run: 1 passed (48.5s).
- `yarn test:integration:vereino --filter ISSUE-628` (the inventory changed) — 1 passed (2.9m).
- `yarn verify` — first run failed at `lint`: `no-unnecessary-type-assertion` twice in `services/pzpn-export.ts`;
  then at `glossary:check`: `"activities.reports.pzpn.schedule.columns.coach" uses the retired term /trener/` — the
  column copies PZPN's own form header, so the key is allow-listed with that reason. Final full run: all 22 steps passed.
- `yarn guard` — no blocking findings.
- Lesson added: `.ai/lessons/moved-session-keeps-occurrence-date.md`.

## Open problems

- V-O1 (exit gate): check the export columns with a certified club's administrator.

## Next steps

- E24-S03 registers `trainingOutlineTopics` so the name column carries the outline topic.
