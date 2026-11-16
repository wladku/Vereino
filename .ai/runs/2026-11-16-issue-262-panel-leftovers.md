# Run: #262 — E09-S08 the mockup's remaining functions on publication, sections, contracts and people

- **Goal and trigger:** unattended cezar run (task 47815ce6) of `om-auto-fix-issue` on #262, queued by the `cezar` label. Feature route: spec N phase 8 (REQ-N12; TEST-N12, TEST-N13; AC-N12; DD-N13; V-N05).
- **Spec:** `.ai/specs/2026-11-14-vereino-parity-navigation-and-naming.md` (Ready for implementation; the owner approved on 2026-11-15 on #251 the `institutionId` filter, the error codes `publication_requests_need_calendar` and `role_requires_adult`, and the DD-N13 narrowing). **Issue:** #262, epic #251. **Branch:** `feat/issue-262-mockup-remaining-admin-functions`.

## Steps

1. Concurrency check (no assignee, no `in-progress`, no open PR) and claim: assignee, `in-progress`, `🤖` claim comment. Confirmed the spec status and the recorded owner approvals (the issue's "blocking" open questions predate #317).
2. Slice (a), B-03: `publicationRequestsProblem` and `turnsCalendarOffWithRequests` in `club_core/lib/publication.ts`; the settings command answers 422 `publication_requests_need_calendar` on `online_requests` only when either flag changes; `PublicationForm` checks the rule before saving, asks before turning the calendar off with requests on (and sends both off), and maps the API's field error onto `block_online_requests`.
3. Slice (b), B-04/B-05: `roleAgeProblem` (`people/lib/people-rules.ts`) and the new `role_requires_adult` (422 on `personId`) in `people.role_assignments.create` and in `.update` when the role changes; `CoordinatorPicker` and `fetchCoordinatorCandidates` (`ageFrom=18`) in `SectionCoordinators`, which takes `readOnly`; "Add section" has an optional coordinator (section first, then the assignment; a failure lands on the Coordinators tab with a warning flash); the Coordinators tab is shown read-only to holders of `club_core.sections.public_content` without `club_core.manage`; saving Details flashes and refetches instead of redirecting.
4. Slice (c), B-07/B-09/B-10: `institutionId` on `GET /api/club_core/contracts` (`party_type = institution`, 400 for a malformed uuid); `contractRateColumns` (`lib/contracts.ts`) feeds the columns From, Until, Base, Per unit, Match (the one-line rates summary and its keys are gone); institutions link to their contracts (column + row action) and the filtered list links back; `facility_operator` in `PERSON_FILTER_ROLES` and `person-list.ts`; an "Import" button on the people list (with `people.pesel.view`, as the imports page requires) and Imports leaves the menu (`navHidden`, spec *Menu structure* / A-N03); `personAge` (`people-rules.ts`) for the record header "{age} · has an account"; the PESEL field is always in the form, empty and disabled with `people.persons.fields.pesel.hintOther` without `people.pesel.view` (the request never carries it).
5. Tests: unit tests for every new pure function (publication, error codes, contracts, people rules, person-list filters); TEST-N12 (`club_core/TEST-N12-publication-requests-need-calendar.spec.ts`, the stored rule-breaking setting written with `withClient`) and TEST-N13 (`club_core/TEST-N13-club-and-people-leftovers.spec.ts`).
6. Spec changelog entry `2026-11-16-issue-262-panel-leftovers.md`.

## Decisions

- **Adult judged on the later of `validFrom` and today:** a role starting next month for someone turning 18 before it starts is accepted; a backdated role for a minor is refused today. A person without a birth date is not a known minor and passes (the picker's `ageFrom=18` does not list them).
- **Update checks age only when the role changes** (same "only on change" stance as DD-N13), so editing the dates of an existing assignment never breaks.
- **Per unit** is the unit rate (`units_per_contract`) or the session amount (`fixed_base_adjusted`); travel and trip amounts stay on the contract page. **Until** kept as a low-priority column so the end date is not lost.
- **Read-only Coordinators tab** for any holder of `club_core.sections.public_content` without `club_core.manage` (the coordinator role); the panel needs `people.view` for the enrichment, which coordinators hold.
- **Stored rule-breaking setting in TEST-N12** is written with `withClient` (as TEST-004 does): no API path accepts it any more. A first draft used a probe process; dropped for the existing helper.
- An Explore sub-agent swept every coordinator assignment in tests, fixtures, seeds and scripts: none assigns a minor, so the new 422 breaks no existing test.

## Commands and results

- `yarn workspace @vereino/app jest …publication.test.ts …error-codes.test.ts` → 21 passed; `…people-rules.test.ts` → 34 passed.
- `yarn typecheck` (first run, fresh worktree) → TS2307 on `.mercato/generated/*`; after `yarn generate` → passed.
- `yarn verify` → `[verify] all 17 step(s) passed` (lint: 0 errors, 50 pre-existing warnings, none in changed files).
- `yarn test:integration:vereino --filter TEST-N12` → `1 passed (2.0m)`.
- `yarn test:integration:vereino --filter TEST-N13` → `1 passed (2.7m)`.
- `yarn test:integration:vereino --filter TEST-U07` (regression, coordinator panel) → `1 passed (2.3m)`.

## Open problems / next steps

- Review loop and UI QA on the PR (#262's PR).
- Commits: three slices as the issue asks; the club_core catalogs (keys of all three club_core slices) ride with slice (a), the people catalogs with slice (b).
