# Run: issue #215 — backend sessions pages hide "Cancel" when `coach_may_cancel` forbids it

- **Trigger:** cezar task `215` (unattended), skill `om-auto-fix-issue` with the repo-local override.
- **Issue:** #215 (follow-up of #199 / PR #214, review finding 2). Labels `feature`, `priority-low`, `risk-low`.
- **Spec:** `.ai/specs/2026-10-20-vereino-club-management.md` (DD-37); changelog entry `.ai/specs/changelog/2026-10-20-vereino-club-management/2026-11-07-issue-215-backend-may-cancel.md`.
- **Branch:** `feat/issue-215-hide-cancel-backend-sessions`.

## Goal

With `coach_may_cancel` off, `OccurrencesTable` and `OccurrenceRecord` still offered "Cancel" to a caller who reaches a session only through a coach grant (a coordinator of section A who coaches a group of section B); the click answered 403 `coach_cancel_disabled`. Expose `mayCancel` on the backend list and detail reads and hide "Cancel" when it is false.

## Decisions

- **Feature route without a new spec.** The issue is a small, fully specified follow-up of #199; the club management spec (DD-37) already covers the rule, so the change reuses it and records a changelog file instead of writing a spec (AGENTS.md spec gate: covering spec → reuse).
- **No contract break.** `mayCancel` is an added response field on `GET /api/activities/occurrences` (optional in the list schema) and `GET /api/activities/occurrences/{id}`; no migration, no dependency.
- **One settings read per page.** `cancelRolesOf` (commands/occurrences.ts) computes the role for many rows and reads `coach_may_cancel` at most once, only when a row is reached through a coach grant; `cancelRoleOf` delegates to it, so the command, the member reads and the backend reads share one rule.
- **Fail closed on the client.** `sessionRowActions` and `OccurrenceRecord` offer Cancel only when `mayCancel === true`; the server sends it on every row.

## Files changed

- `packages/app/src/modules/activities/commands/occurrences.ts` — `cancelRolesOf`, `cancelRoleOf` delegates.
- `packages/app/src/modules/activities/api/shared.ts` — `attachOccurrenceNames` adds `mayCancel`; list schema.
- `packages/app/src/modules/activities/api/occurrences/[id]/route.ts` — `mayCancel` on the detail; OpenAPI text.
- `packages/app/src/modules/activities/lib/occurrence-list.ts` + test — `sessionRowActions` gates Cancel on `mayCancel`.
- `packages/app/src/modules/activities/components/{OccurrencesTable,OccurrenceRecord,client-helpers}.tsx|ts` — gate and type.
- `packages/app/.ai/qa/tests/activities/ISSUE-215-backend-sessions-may-cancel.spec.ts` — integration test.
- `packages/app/src/modules/activities/README.md`, spec changelog file, this log.

## Commands and results

- `yarn generate` — ok (fresh worktree had no generated files).
- `yarn typecheck` — ok.
- `yarn spec-changelogs:check` — ok.
- `yarn test` — 58 suites, 651 tests passed; `occurrence-list.ts` at 100 % line/branch/function coverage.
- `yarn test:integration:vereino --filter ISSUE-215` — `1 passed (1.6m)` (the `QueryIndexScopeError` log lines during club cleanup are pre-existing platform noise, not failures).
- `yarn verify` — first run failed at `format:check`: `ISSUE-215-backend-sessions-may-cancel.spec.ts is not formatted (run yarn format)`; after `yarn format`, a full rerun passed all 14 steps (generate … build).

## Open problems

None known.

## Next steps

Review of the PR; merge through the merge train.
