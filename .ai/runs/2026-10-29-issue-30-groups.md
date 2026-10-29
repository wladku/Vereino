# Issue #30 — groups of both kinds with memberships over time (club spec phase 2 step 2)

- **Date:** 2026-10-29
- **Agent / tool:** Claude Code (Opus 5.5), `om-auto-fix-issue` (installed from `open-mercato/skills`, repo-local override applied; feature route) with one implementation subagent and the coordinator's own review and gate
- **Trigger:** product owner — "/om-auto-fix-issue 22"; #22 is the E03 epic, so the owner chose "#30 na #52, bez importu" (build #30 now, the import criterion deferred to #28) and approved migrations ("Tak, generuj"); #52 had merged by then, so the branch starts from `main`
- **Spec / issue / branch:** `.ai/specs/2026-10-20-vereino-club-management.md` phase 2 step 2 (TEST-030); issue #30 (epic #22); branch `feat/issue-30-groups`
- **Status:** completed — PR open for review

## Goal

A coordinator builds teams and class groups in their sections with memberships that keep their history; a coach's scope follows their memberships.

## Steps

1. Read #22 and its stories; #30 depends on #26 (then PR #52) and #28 (not started) and the spec ties phase 2 to the phase 1 exit gate — the owner chose to build #30 now without the import criterion.
2. Claimed #30 (assignee, `in-progress`, 🤖 comment naming the deferrals); removed the merged #26 worktree; worktree from `main`.
3. Subagent: the `groups` module (entities, commands, routes, pages, i18n, migration), the coach grant through an optional contract read by `people.scopeService`, the payer rule for adult participants, directory services in `people` and `club_core`, integration tests. Docker Desktop was down for part of the run: the migration was generated offline from a seed snapshot and re-checked against a throwaway database once Docker was back.
4. An integration run looked hung for two hours (14:15–16:03); the coordinator's attempt to stop its processes was refused by the permission classifier and the owner left the decision to the subagent. The subagent showed the host had suspended every process (Playwright reported 1.7 h against a 300 s timeout, all logs silent); the run resumed and finished by itself, then a clean run passed.
5. Coordinator review: the axe baseline extension (one platform node, the `AppShell` brand link), `groups.view` for the coordinator, the adult-participant payer rule (club spec *Account payer*), the dependency direction of the coach contract; `yarn verify` and the full integration suite rerun by the coordinator.

## Decisions

- `people.scopeService` stays the single scope provider (foundation DD-F03); `groups` registers the optional `groups.membershipContribution` (`coachedGroupIds`, `isActiveParticipant`), read with `hasRegistration` — no coach grant without `groups`.
- A membership does not grant `vereino_coach` (the role comes from a `coach` role assignment; #26 "both parts are needed"); an adult active participant becomes a payer (club spec *Account payer*).
- The coach acting role is shown on a read (`GET /api/groups/groups/{id}` → `actingRole: 'coach'`); a coach holds `groups.view` only.
- Coordinators write groups and memberships in their sections (moving a group needs both sections); seasons and external teams are club-wide dictionaries.
- Rules added where the spec was silent: 409 `group_has_memberships`, `season_in_use`, `season_name_taken`; 422 `season_dates_inverted`, `groups_reference_invalid`, `group_section_inactive`.

## Installed behaviour that differed from the spec

- `dependsOn` is not expanded at check time; the club spec's feature-list sentence is corrected and `groups.view` is granted explicitly (lesson).
- A list `entityId` must match the ORM class name (`groups:group_membership`) (lesson).
- `authorizeScoped` did not pass match options to `assertInScope`; additive `matchOptions`.
- CrudForm `select` drops options with the value `''`; the platform's clear sentinel is used.
- The `AppShell` brand link fails axe `label-content-name-mismatch`; added to the node-matched platform baseline.

## Files changed

- `packages/app/src/modules/groups/**` — new module
- `packages/app/src/modules/people/{services,di.ts,lib,commands/accounts.ts,README.md}` — coach grant, payer rule, person directory
- `packages/app/src/modules/club_core/{services/directory.ts,di.ts,README.md}` — directory service
- `packages/app/src/modules/foundation/services/authorize-scoped.ts` — `matchOptions`
- `packages/core/src/{roles,calendar-date}.ts` and tests
- `packages/app/src/modules.ts`, `packages/app/vereino-modules.json` — `groups` enabled
- `packages/app/.ai/qa/tests/{_fixtures/groups.ts,_fixtures/axe.ts,groups/**}` — tests
- `.ai/specs/2026-10-20-vereino-club-management.md`, `.ai/specs/2026-10-27-vereino-foundation-primitives.md` — step 2 note, feature-list correction, changelogs
- `.ai/lessons.md`, two lessons; `.ai/runs/2026-10-29-issue-30-groups.md` — this log

## Commands and results

- `yarn verify` — 13/13 passed (subagent's final run and the coordinator's rerun).
- `yarn test:integration:vereino` (whole suite) — 37/37 passed in the subagent's clean run and in the coordinator's rerun.
- `yarn db:generate` offline from a seed snapshot, then against a throwaway pgvector container (no changes); up, down, up as raw SQL there only. No `yarn db:migrate`.

## Open problems

- The phase 1 exit gate is still open (#27, #28, #29) — phase 2 started in parallel by the owner's decision.
- Deferred: `age_category_entry_id` (`dictionaries`), public group fields (#29), `groups.membershipImporter` (#28), sessions and attendance (#31, #33), section deactivation with groups, an institution referenced by an external team can still be deleted, the person record's Groups tab, `search.ts`.
- Existing tenants need their role ACLs synced for the coordinator's new `groups.view` (no deployment exists yet).

## Next steps

- Owner review of the PR; then #31 (needs #30) or the remaining phase 1 stories.

## Lessons recorded

- `.ai/lessons/query-engine-entity-ids-and-acl-depends-on.md`
- `.ai/lessons/axe-baseline-suspended-runs-and-offline-db-generate.md`
