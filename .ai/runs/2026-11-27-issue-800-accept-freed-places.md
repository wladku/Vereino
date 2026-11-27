# Run: issue #800 — E26-S04 accepting an application, freed places and season changes (phase 3)

- **Trigger:** cezar task (label `cezar` on #800, 2026-11-27), skill `om-auto-fix-issue` (feature route, existing spec).
- **Spec:** `.ai/specs/2026-11-25-vereino-section-sign-up-form.md` → *Phase 3*; owner approvals on #788
  (2026-11-26): Q-J05, Q-J06, Q-J08, `enrolment` in the `people.dataExport.*` / `people.departure.*` allow-lists,
  delivery erasure by address hash in `foundation`.
- **Branch:** `feat/issue-800-accepting-applications-freed-places` (worktree of cezar run 6fca424f).
- **Claim:** assignee, `in-progress`, `🤖` claim comment naming the worktree and branch (2026-11-27).

## Steps

1. Read the spec, the phase-2 module (`enrolment`), and the owners' contracts: `groups.applicationTargets` (lock
   option), `groups.membershipImporter`, `people.personDirectory`, the `people` export and departure contracts,
   `foundation` dispatch (`eraseRecipientDeliveries`), `payments.publicPrices`, the rollover event payload.
2. Pure logic (`lib/accept.ts`, `lib/data-export.ts`, the `group_closed` flag, `waiting → new`) with unit tests.
3. `enrolment.applications.accept` + route + accept sheet; detail read extended (fees, candidate names, today,
   season end; duplicates refreshed on open).
4. Freed places (`services/places.ts`, two membership subscribers, the daily job), the rollover command and
   subscriber, the season-end step of the daily job, the `accepted` and `season_closed` e-mails, two notification
   types.
5. `people` allow-lists + the two contributors; `foundation.eraseAddressDeliveries`; the applicant CLI and the
   `erase_applicant` command; the section switch shown in `club_core`.
6. Isolation inventory (`accept`), integration tests TEST-J07, TEST-J08, TEST-J09, TEST-J11 (phase-3 test) and a
   section-switch step in TEST-J01; compliance pack (DSR, R23, R24), README, spec changelog file, lessons.

## Decisions

- **Accepting is a club administrator's write (deviation, question to the owner on #800).** DD-J10 runs the
  existing `people.persons.create`, `people.guardianships.create` and `people.persons.create_account`; all three allow
  only `club_admin`, so a coordinator's accept fails inside with `scope_denied`. Widening `people`'s grants or adding
  a delegated system context is a security change that no approval covers, so the command answers 403
  `accept_requires_admin` for a coordinator and the sheet is shown only with `enrolment.manage`.
- **Guardian birth date on the sheet.** `people.persons.create_account` needs a birth date; the form collects none for
  a guardian (BR-J1), so the sheet asks it for a new guardian when the invitation is on (422
  `invitation_birth_date_required` otherwise). The data is the guardian's, entered by the decider, as on the person form.
- **Owners' events.** `people` events are emitted after the commit from `services/owner-events.ts` with `people`'s
  published payloads (no import of `people` internals); memberships go through `groups.membershipImporter`, whose
  `emitSideEffects` is `groups`' own.
- **Only a found duplicate is reused** (`acceptPlan`): any other person id answers 422 `accept_person_invalid`, so a
  decider cannot attach an application to an arbitrary club person.
- **Freed-place notice once per day** via the notification group key `enrolment:place_freed:<group>:<day>` (the
  platform refreshes an active notification with the same key instead of adding one).
- **Group closed** is computed from the group (inactive), never stored; the rollover payload names no continuation of
  a closed group, so its open applications always go back to `new`.
- **Start day default** is the club's today; the group's next session day needs phase 4's
  `upcomingSessionsOfGroup`.
- No migration: phase 2's tables already have every column phase 3 writes.

## Files changed

- `packages/app/src/modules/enrolment/**` (commands `accept.ts`, `seasons.ts`, services `places.ts`,
  `owner-events.ts`, `people-contribution.ts`, `retention.ts`, `applicant-data.ts`, subscribers, `AcceptSheet.tsx`,
  lib, i18n, README); `foundation/services/dispatch.ts` + `index.ts`; `people/services/{data-export,departure}.ts`;
  `club_core/components/SectionPublicPanel.tsx`, `club_core/lib/publication.ts`.
- Tests: `packages/app/.ai/qa/tests/enrolment/TEST-J07…J09`, `TEST-J11-retention.spec.ts`, `groups/TEST-J01…`,
  `_fixtures/enrolment.ts`, `_fixtures/isolation/inventory/enrolment.json`.
- Docs: `docs/compliance/{data-subject-requests,retention}.md`, spec changelog
  `2026-11-27-issue-800-phase-3.md`, lessons (`nested-commands-in-one-transaction`,
  `axe-scan-reloads-multi-step-forms-and-lint-heap`, new `module-cli-prints-one-json-line`).

## Commands and results

- `yarn workspace @vereino/app jest src/modules/enrolment/lib` — 5 suites, all passed (before the new suites were
  added; see the gate for the final run).
- `yarn typecheck` — clean; `eslint` on the changed files — clean after fixes.
- `yarn route-isolation:check` — 267 routes, 647 probes, 0 problems.
- Integration (local, `yarn test:integration:vereino --filter <id>`): TEST-J06 passed; TEST-J07 passed; TEST-J08
  failed twice first (the axe scan reloads the page and closes the sheet; then the locale cookie did not switch, so the
  text check moved to `uiText`), then passed; TEST-J09 passed; TEST-J11 failed twice first (`TypeError: section is not
  a function` — a shadowed import; `SyntaxError: Expected property name or '}' in JSON at position 5` — the CLI
  pretty-printed), then 2 passed; TEST-J01 passed; ISSUE-628-cross-club-isolation passed; E02-S05 (3) and TEST-U07
  passed (the section panel now shows the switch).
- `yarn verify` — first run failed at `contracts:check` ("enrolment: error code membership_overlap is already declared by
  groups"; renamed to `participant_already_in_group`, TEST-J07 re-run: passed), second at `glossary:check` (retired
  Polish term "zajęcia" in the fee line; now "termin"); third run: all 24 steps passed.
- `yarn guard` — no blocking findings.
- Review fix: the names of candidate persons in the detail go to club administrators only (the only deciders who
  accept).

## Open problems / next steps

- Owner decision: how a coordinator accepts (J-J03 has the coordinator accept). Options on #800.
- Phase 4 (E26-S05): trial sessions; the accept sheet's default start day = the group's next session day.
