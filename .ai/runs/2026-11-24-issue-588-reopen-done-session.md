# Run: reopen a done session — administrator command (#588)

- **Goal and trigger:** Cezar run of `om-auto-fix-issue 588` (issue labelled `cezar`). The issue asked whether the administrator's `reopen` of a done session (foundation II spec AC-G02) is still wanted; the owner decided on 2026-11-24 (issue comment): keep it, modelled on `activities.occurrences.restore` (#268) — administrator only, reason 3–500 characters, audit entry, events, `done → planned`, integration test; attendance and scores stay.
- **Issue / spec / branch:** #588; `.ai/specs/2026-10-27-vereino-foundation-scheduling-primitives.md` (AC-G02); `feat/issue-588-reopen-done-session` (renamed from the Cezar task branch).

## Steps

1. Claimed the issue (assignee, `in-progress`, `🤖` claim comment naming this run's worktree and branch).
2. Classified as a feature on an existing spec with the owner decision recorded on the issue: no new spec, no migration, no new dependency, no new module — nothing Ask First left open.
3. Implemented `activities.occurrences.reopen` next to the restore in `commands/occurrences.ts`, the route `POST /api/activities/occurrences/{id}/reopen`, the `mayReopen` flag on the session detail read, the error code `occurrence_not_done`, and the "Reopen session" action on `/backend/activities/occurrences/[id]` (the restore dialog takes an `action` prop instead of a copy).
4. Added the cross-club probe to the isolation inventory and the integration test `ISSUE-588-reopen-done-session`.
5. Documented the rule in the module README, ticked AC-G02 in the spec with a changelog file.

## Decisions

- **Separate command from `restore`.** The spec names `activities.occurrences.reopen`; restore of a cancelled session stays as #268 built it (its "not ended" rule does not fit a done session, which has usually ended). The reopen covers `done` only and answers 409 `occurrence_not_done` for another status.
- **Schedule check kept.** A done session does not count in the conflict search (only `planned` does), so reopening it occupies its place and coach again: the command runs the same `assertSessionFits` as the restore (409 with the list).
- **Silent event.** `activities.occurrence.updated` is emitted without a `change`: the session took place either way, so the members get no "takes place after all" notice (the restore's announcement would be wrong here).
- **Undo.** Undoable like the restore; the undo puts back only the status (`done`) and only while the session is still `planned` (409 `occurrence_not_planned` otherwise), so a check-off or move made after the reopen is not rolled back.
- **UI included.** The issue's done-when names only the command; a command an administrator cannot reach from the record is half a feature, and the restore dialog already had the shape, so the record offers "Reopen session" on a done session for the administrator.

## Files changed

- `packages/app/src/modules/activities/commands/occurrences.ts`, `commands/check-off.ts` (comment)
- `packages/app/src/modules/activities/api/occurrences/[id]/reopen/route.ts` (new), `api/occurrences/[id]/route.ts`
- `packages/app/src/modules/activities/components/RestoreOccurrenceDialog.tsx`, `OccurrenceRecord.tsx`, `client-helpers.ts`
- `packages/app/src/modules/activities/data/validators.ts`, `lib/error-codes.ts`, `lib/activities-rules.ts` (comment), `i18n/en.json`, `i18n/pl.json`, `README.md`
- `packages/app/.ai/qa/tests/activities/ISSUE-588-reopen-done-session.spec.ts` (new), `_fixtures/activities.ts`, `_fixtures/isolation/inventory/activities.json`
- `.ai/specs/2026-10-27-vereino-foundation-scheduling-primitives.md`, `.ai/specs/changelog/2026-10-27-vereino-foundation-scheduling-primitives/2026-11-24-issue-588-reopen-done-session.md`

## Commands and results

- `yarn generate`: ok. `yarn typecheck`: exit 0. `yarn typecheck:qa`: first run failed (`Property 'mayReopen' does not exist on type 'OccurrenceItem'`), fixed in the fixture type, then exit 0.
- `yarn test:integration:vereino --filter ISSUE-588-reopen-done-session`: 1 passed.
- `yarn test:integration:vereino --filter TEST-A07-restore-cancelled-session` (the shared dialog): 1 passed.
- `yarn test:integration:vereino --filter ISSUE-628-cross-club-isolation` (the new probe): 1 passed.
- `yarn verify`: all 22 steps passed (exit 0).
- `yarn guard`: no blocking findings.

## Open problems / next steps

- The spec's status line still lists AC-G02 among the open criteria; per AGENTS.md *Spec status line* it is left as written (the AC line and the changelog file carry the change).
