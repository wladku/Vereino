# Issue #65: the import's group column becomes memberships through `groups.membershipImporter`

- **Date:** 2026-11-01
- **Agent / tool:** Claude Code (Opus 5.5) with `om-auto-fix-issue` (installed from `open-mercato/skills`, repo-local override applied), one implementation subagent, then the coordinator's own review, fixes and gate
- **Trigger:**
  - "/om-auto-fix-issue 22" found #30's deferred import criterion unbuilt. Owner decision: "Build the hook".
  - The story was filed as #65 under epic #22 through `om-prepare-issue`.
- **Spec / issue / branch:**
  - Spec: `.ai/specs/2026-10-20-vereino-club-management.md` (REQ-036, AC-036, DD-38, D-026, phase 2 step 2, TEST-051 membership part)
  - Issue: #65 (epic #22; refs #30, #28)
  - Branch: `feat/issue-65-import-memberships`
- **Status:** completed. PR open for review.

## Goal

With `groups` enabled, the group column of a family import becomes participant memberships, exactly once. Rows committed earlier with `groups_not_enabled` get their memberships when the administrator re-runs the commit.

## Steps

1. **Read the state.** On `main` nothing registered `groups.membershipImporter`. #28 stored committed rows with a group as `membership_status = 'groups_not_enabled'`, and #30 deferred the hook.
2. **Filed #65.** Linked it in epic #22's checklist. Then claimed it (assignee, `in-progress`, 🤖 comment) and created the worktree from `main` at c9deef7.
3. **Subagent.**
   - Built the contract, the hook, the commit and re-run, the purge, the detail page and the tests.
   - It was interrupted once when the Claude Code process exited, and resumed in the same worktree.
   - Docker Desktop then went down, so the integration tests could not run until the owner restarted it.
4. **Coordinator review.**
   - No migration and no dependency. `people` imports nothing from `groups`.
   - Membership events are emitted after the commit.
   - Gates unchanged: `people.manage` + `people.pesel.view`.
5. **Fixes by the coordinator.**
   - The committed detail page failed axe `scrollable-region-focusable` at 375 px: with no decision buttons left, the rows table had nothing focusable. Each committed row now links its participant to the person record: `participantPersonId` on the row read, asserted in the page test.
   - A deprecated `z.string().uuid()` was replaced with `z.uuid()` (lint).
6. **Merged `main`.** Brought in #64. The people README DI row kept both additions. The gate was then rerun on the merged state.

## Decisions

- **Matching.** NFC, trimmed and case-insensitive, among the club's live (`deleted_at` null) and active groups only.
  - Exactly one match resolves.
  - No match (or a blank name) → `group_not_found`.
  - More than one (e.g. the same name in two sections) → `group_ambiguous`.
  - No group is ever created.
  - Inactive groups are excluded so that last season's deactivated group does not make a name ambiguous for ever.
- **Preview.** An unresolved group does not put the row into `review`. The person and guardianship commit; only the membership waits. Each row shows `membershipPreview`.
- **States.** The reason is the `membership_status` value itself, so there is no schema change.
  - Waiting: `groups_not_enabled`, `group_not_found`, `group_ambiguous`.
  - Done: `membership_created`, `membership_existed`, `participant_missing`.
  - The membership id goes into `row.result.membershipId`.
  - The summary gains `membershipsCreated` and `membershipsExisting`.
- **Commit.** Memberships are created through `groups.memberships.create` nested in the commit's transaction, with role participant, open-ended from the commit day in the club time zone.
  - A live overlapping participant membership counts as `membership_existed`.
  - The hook returns `emitSideEffects()`, which the commit runs after its transaction.
- **Re-run.** `POST …/commit` on a committed import with waiting rows processes only those rows.
  - It writes nothing else and gets its own audit label (`people.audit.imports.create_memberships`).
  - It does not emit a second `people.import.committed`.
  - Without waiting rows, or without the hook, the answer is 409 `import_already_committed` as before.
- **ACL.** No `groups` feature is required. The nested command still runs `authorizeScoped` against the actor (`club_admin`).
- **Purge.**
  - Processed rows are deleted on the 30-day rule.
  - Waiting rows are kept with ids and the group label.
  - Each run also deletes the processed rows of imports it has already purged.

## Installed behaviour that differed from the spec

- **Row status.** DD-38 says rows with a group "stay in `review`". #28 had already implemented them as committed rows carrying `membership_status`, and this kept that.
- **Suppressed side effects.** `dataEngine.flushOrmEntityChanges(suppress)` clears the side effects it suppresses (`@open-mercato/shared/dist/lib/data/engine.js`), hence the hook's `emitSideEffects()`.
- **TEST-051 expectations.** `groups` is enabled in the test environment, so the hook is registered there:
  - row 2 now reads `group_not_found` instead of `groups_not_enabled` ("Orliki U8" does not exist);
  - the second commit answers 200 (a re-run that creates nothing) instead of 409;
  - the phase 2 re-run that creates Ola's membership was added.

## Files changed

- `packages/app/src/modules/groups/{di.ts,services/membership-importer.ts,lib/groups-rules.ts,lib/__tests__/groups-rules.test.ts,README.md}`
- `packages/app/src/modules/people/services/membership-importer.ts`, `people/lib/import-rules.ts` (+ tests), `people/commands/imports.ts`, `people/commands/jobs.ts`, `people/data/entities.ts` (types and comments only), `people/services/import-read.ts`, `people/api/imports-shared.ts`, `people/api/imports/[id]/commit/route.ts`, `people/components/imports/{ImportRecord.tsx,import-client.ts}`, `people/i18n/{en,pl}.json`, `people/README.md`
- `packages/app/.ai/qa/tests/people/E03-S06-import-memberships.spec.ts` (new), `TEST-051-family-import.spec.ts`, `_fixtures/imports.ts`
- `.ai/specs/2026-10-20-vereino-club-management.md` (note under phase 2 step 2, changelog)
- `.ai/lessons.md` and one lesson
- this log

## Commands and results

- **`yarn verify`:**
  - subagent's run: 13/13 passed (Jest: 18 suites, 231 tests);
  - coordinator's run on the merged state: 13/13 passed.
- **`yarn test:integration:vereino --filter …`:**
  - E03-S06: 3/3 passed after the fix (the first run failed the axe check above);
  - TEST-051: 2/2 passed;
  - E02-S04: 2/2 passed.
- **`yarn test:integration:vereino`, whole suite on the merged state:** 81 passed, 1 flaky (E02-S03 two-tenant `/api/people/me`, passed on retry), 2 failed.
  - The 2 failures are E03-S04 `coach-attendance-ui` and TEST-014 `member-declaration-ui`. Both fail the same way on an untouched `main` checkout (10623e3) on Sunday 2026-11-01.
  - **Cause:** the member calendar shows the Monday–Sunday week (`calendarWeek`) and filters by `occurrence_date`. Both tests create the session for "tomorrow", which on a Sunday is next week. `startNow` moves only the times, not the date.
  - These failures are not caused by this change.
  - The run took 10.7 h of wall time because the host was suspended during it (lesson `axe-baseline-suspended-runs-and-offline-db-generate`).
- No migration, no `db:migrate`, no dependency.

## Open problems

- The two Sunday-dependent activities tests from #32 and #33 fail on Sundays on `main`. They need a fix that opens the calendar on the week of the session's date.

## Next steps

- Owner review of the PR.
- After it merges, the J-002 exit-gate test for epic #22.
