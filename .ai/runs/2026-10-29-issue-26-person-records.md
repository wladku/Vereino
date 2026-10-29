# Issue #26 — person records: families, consents and roles (club spec phase 1 step 3)

- **Date:** 2026-10-29
- **Agent / tool:** Claude Code (Opus 5.5), `om-auto-fix-issue` (installed from `open-mercato/skills`, repo-local override applied; feature route) with one implementation subagent and the coordinator's own review and gate
- **Trigger:** product owner — "/om-auto-fix-issue 21", then "Yes, run #26"; Ask First: migrations approved ("Tak, generuj"); deferrals as in the spec ("Odłóż jak w specu")
- **Spec / issue / branch:** `.ai/specs/2026-10-20-vereino-club-management.md` phase 1 step 3 (TEST-002, TEST-004); issue #26 (epic #21); branch `feat/issue-26-person-records` from `main`
- **Status:** completed — PR open for review

## Goal

One record per person with legal guardianship, a primary payer and consents, and scoped role assignments — on top of what #48 already built (persons, PESEL, role assignments with scope and validity, minimal guardianships).

## Steps

1. FR triage: #26 meets the Definition of Ready in `SDLC.md`; #48 already covered the PESEL criterion, the coordinator-without-section 422, validity and assignments without an account. The gaps were guardianship relation, primary payer and consents, duplicate assignments, phone and notes, the person pages and TEST-002.
2. Asked the owner about migrations and deferrals; claimed #26 (assignee, `in-progress`, 🤖 comment); removed the merged #38 and #25 worktrees; worktree from `main`.
3. Subagent implementation. Interrupted twice — a machine restart and Docker Desktop failing after it — and resumed from its transcript; the final `yarn verify` (13/13) and the full integration suite (28/28) ran green on the final tree.
4. Coordinator review: the coordinator's club-wide basic read and the changed TEST-F02 assertion checked against the spec (*Users, Permissions, and Scope*: "Read access to the club's people records (basic data) … no PESEL or consents"); the migration; the additive `clubWideKinds` option in core. `yarn verify` rerun by the coordinator; the integration suite could not be rerun locally because Docker Desktop was down again — CI runs it on the PR.

## Decisions

- Coordinators read every person and guardianship as `access: 'basic'` (names, birth date, locale, account flag); the acting role picks the view, so a coordinator who is also a guardian sees their own ward in full. TEST-F02's phase A1 assertion (403 for another person) changed to 200 `basic` with the sensitive fields absent.
- Consents are returned with `people.manage` or to a guardian of the ward, never to a coordinator or the ward; they are added in `afterList`, never projected (lesson).
- `POST /api/people/guardianships/{id}/consents` lets an active guardian or the club administrator change consents (P-08 transitions, `by_person_id`, `at`); 409 `guardianship_ended` on an ended guardianship.
- Primary payer: "active" = overlapping validity; checked under the ward's row lock plus a partial unique index on open-ended rows; an undo that would overlap is refused with the same 409.
- Duplicate role assignments: checked under the person's row lock; no database index (the spec defines a non-unique one).
- `relation` defaults to `parent`; the audit snapshot keeps the phone but not the notes.

## Installed behaviour that differed from the spec

- A coordinator grant matched only `sectionId`; core and foundation gained the additive `ScopeMatchOptions.clubWideKinds` (foundation spec P-03 updated).
- `makeCrudRoute`'s `transformItem` gets no request context, so per-caller visibility lives in `afterList`.
- The platform undo endpoint undoes only the actor's latest action on a resource; hand-written action routes return no undo token header.
- Setting a password ends the user's earlier tokens; CrudForm labels are not bound to their inputs (lesson).

## Files changed

- `packages/core/src/{scope,validity}.ts` and tests — `clubWideKinds`, `periodsOverlap`
- `packages/app/src/modules/foundation/services/authorize-scoped.ts` — the option on `assertInScope`
- `packages/app/src/modules/people/**` — entities, migration, validators, encryption, search, rules, commands, routes, pages, components, i18n, README
- `packages/app/.ai/qa/tests/{_fixtures/people.ts,people/**,foundation/TEST-F02-record-scope.spec.ts}` — tests
- `.ai/specs/2026-10-20-vereino-club-management.md`, `.ai/specs/2026-10-27-vereino-foundation-primitives.md` — step 3 note, P-03 option
- `.ai/lessons.md`, two lessons; `.ai/runs/2026-10-29-issue-26-person-records.md` — this log

## Commands and results

- `yarn verify` — 13/13 passed (subagent's final run and the coordinator's rerun).
- `yarn test:integration:vereino` (whole suite, subagent) — 28/28 passed in 10.0 min, including E02-S02 (five tests), TEST-002 and TEST-004. Runs broken by Docker Desktop restarts are not counted. Not rerun by the coordinator (Docker down); CI's `integration` job runs it on the PR.
- `yarn db:generate` against a throwaway Postgres (a second run reported no changes); up, down and up applied as raw SQL to that throwaway database only. No `yarn db:migrate`.

## Open problems

- The coach acting role in the first criterion waits for memberships (#30).
- The audit `command_payload` keeps the full command input, PESEL and notes included (encrypted at rest by the platform); predates #26 — a follow-up if the "PESEL not in audit" rule should cover it.
- The subagent moved Docker Desktop's stale `%LOCALAPPDATA%\Docker\run` and `%LOCALAPPDATA%\docker-secrets-engine` aside (renamed `*.stale-20261029`, nothing deleted) to get Docker running — outside the repository.
- Deferred by the owner: photo, the three `<consent>_at` columns, `external_id`, anonymization.

## Next steps

- Owner review of the PR; then #27.

## Lessons recorded

- `.ai/lessons/hidden-columns-and-club-wide-reads-in-scoped-lists.md`
- `.ai/lessons/integration-fixture-pitfalls-tokens-crudform-undo.md`
