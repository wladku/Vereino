# Run: issue #583 — an administrator who is a guardian declares her ward's absence as guardian

- **Trigger:** Cezar queue (`cezar` label on #583), skill `om-auto-fix-issue` with the repo-local override.
- **Issue:** #583 (epic #565), spec `.ai/specs/2026-10-27-vereino-foundation-primitives.md` AC-F02.
- **Branch:** `test/issue-583-admin-guardian-declares-absence`.
- **Goal:** prove with an integration test that a club administrator who is the guardian of a ward, declaring the ward's absence from a session, is recorded as `actingRole: 'guardian'` in the response and the audit entry.

## Steps

1. Claimed #583 (assignee, `in-progress`, `🤖` claim comment naming this run's worktree and branch).
2. Read the existing evidence: `TEST-F02-record-scope` (rule proven only through `PUT /api/people/persons`), `TEST-011-declaration-scope` (`guardian` only for ordinary guardians), the declare command `activities/commands/attendance.ts` (`authorizeScoped` with `DECLARE_KINDS`; `activitiesLog` writes `actingRole` into the log context; `declarationSource` maps `guardian` to `app`, staff kinds to `staff`).
3. Wrote `packages/app/.ai/qa/tests/foundation/TEST-F02-admin-guardian-declares-absence.spec.ts`: the administrator (`club.adminPersonId`) becomes the guardian of a 9-year-old in a team group; on a session of the weekly training she declares the ward's absence → 201 `actingRole: 'guardian'`, `source: 'app'`, `declaredByPersonId` her person, `final`; the audit entry of `activities.attendance.declare` carries `context.actingRole: 'guardian'`. Control: a child she is not the guardian of → `club_admin`, `source: 'staff'`, in the response and the log.
4. Ticked AC-F02 in the spec with the new evidence; changelog file `2026-11-22-issue-583-admin-guardian-declaration.md`. The status line's "left" list is not edited (AGENTS.md *Spec status line*).

## Decisions

- Test only: the behaviour was already correct (no wrong role exposed), so no production change.
- Test id `TEST-F02-admin-guardian` (distinct prefix so `--filter` does not also pick `TEST-F02-record-scope`); file in `foundation/` next to the rest of AC-F02.
- The club is built with the API fixtures (section, place, group, weekly series by the administrator) instead of `familyFor`, which creates many unrelated accounts.

## Commands and results

- `yarn test:integration:vereino --filter TEST-F02-admin-guardian` → `1 passed (37.1s)`. The log shows `QueryIndexScopeError` lines during club cleanup (platform indexer, `directory:organization`/`auth:role`); they are unrelated and do not fail the run.
- `yarn verify` → all 20 steps passed. `yarn guard` → no blocking findings.

## Open problems / next steps

- None for #583. The spec status line still names AC-F02 among the open items; the PR that closes the spec rewrites it.
