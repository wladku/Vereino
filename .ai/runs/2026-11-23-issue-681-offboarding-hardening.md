# Run: issue #681 — club_core offboarding hardening (follow-ups from the #677 review)

- **Trigger**: Cezar queued `om-auto-fix-issue 681` (label `cezar`, 2026-11-23). Owner told the run to continue
  autonomously without questions.
- **Issue**: #681. **Branch**: `feat/issue-681-club-core-offboarding-hardening`. **Base**: the code lives on #677
  (#632, per-club export, deletion, restore), which was open in the merge queue when the run started. The fix was
  written on top of #677's head (`ac660e8c`). #677 stayed held by the merge train for the owner's manual QA (MT-D02),
  so the PR #686 was opened stacked on #677's branch, with `blocked`.
- **Spec**: `.ai/specs/2026-11-22-vereino-many-clubs-one-instance.md` phase 4 (changelog file
  `2026-11-23-issue-681-offboarding-hardening.md`).

## Steps

1. Read the issue; found that the named files exist only on #677. Posted a `🤖` comment and stopped. The owner then
   asked the run to continue autonomously, so it claimed the issue (in-progress, claim comment) and built on #677's head
   while a background poll waited for #677 to merge.
2. Read the installed platform: `schedulerService.unregister` looks the `scheduled_jobs` row up first and does nothing
   when it is gone; `bullmqSchedulerService` is registered only with `QUEUE_STRATEGY=async`. `user_consents`,
   `user_sidebar_preferences` and `sidebar_variants` declare `tenant_id` nullable; `user_sidebar_preferences.user_id`
   references `users` without a cascade. The encryption service matches a map field to a row key by the field, its
   snake_case or its camelCase spelling.
3. Implemented the four items (below), unit tests, TEST-M07 extension, ops doc, lesson, spec changelog file.

## Decisions

- **Item 1**: `scheduled_jobs` and `attachments` are deleted inside the transaction with `returning`; after the commit
  the BullMQ repeatables are removed through `bullmqSchedulerService.unregister` (not `schedulerService`, which would
  no-op), and the files are deleted from the returned rows. A failed BullMQ removal is counted in the new summary
  field `schedulesFailed` (additive to the CLI output and the audit context). It is not thrown, because the rows are
  already gone.
- **Item 2**: the platform allows the null rows, so the run added a new key `tenant_or_user`:
  `tenant_id = ? or (tenant_id is null and user_id in club users)`. The restore scope check accepts a tenant-less row
  only when its user is one of the archive's users. An archive that lists these tables with key `tenant` (written
  before this change) is still accepted.
- **Item 3**: pure helper `encryptedRowKeys` maps map fields to the row key the platform would use; the fail-closed
  check reads those keys.
- **Item 4**: `restoreBlocker` runs inside the restore transaction after `pg_advisory_xact_lock(hashtext('club_core.restore:<tenant>'))`;
  the dry run still checks outside a transaction. `<archive>.sha256` is written with `wx`, and the export refuses up
  front when either the archive or its checksum file exists, so a stale checksum file cannot fail the run after the
  archive is written.
- Not in scope (listed as open in #677): BullMQ one-off job scan, key destruction (Q-M07).

## Files changed

- `packages/app/src/modules/club_core/lib/club-offboarding.ts` (+ `lib/__tests__/club-offboarding.test.ts`)
- `packages/app/src/modules/club_core/services/club-offboarding.ts`, `services/offboarding-cli.ts`, `commands/offboarding.ts`
- `packages/app/.ai/qa/tests/club_core/TEST-M07-club-export-delete-restore.spec.ts`
- `docs/ops/clubs.md`, `.ai/lessons/bulk-delete-side-effects-follow-the-commit.md`,
  `.ai/specs/changelog/2026-11-22-vereino-many-clubs-one-instance/2026-11-23-issue-681-offboarding-hardening.md`

## Commands and results

- `npx jest src/modules/club_core/lib/__tests__/club-offboarding.test.ts --coverage` → 29 passed, `club-offboarding.ts`
  100 % statements/branches/functions/lines.
- `yarn typecheck` → clean (after `yarn install` + `yarn generate` in the fresh worktree).
- `yarn format` → 3 files reformatted. `yarn lessons:check` → valid.
- `yarn test:integration:vereino --filter TEST-M07` (on #677's head + fix) → `2 passed (1.3m)`. The new assertions: the
  tenant-less sidebar preference is exported, deleted (it would otherwise block the `users` delete) and restored; a
  stale `.sha256` refuses the export without writing the archive; `schedulesFailed: 0`.

## Open problems / next steps

- PR #686 is stacked on #677. After #677 is squash-merged, rebase it onto `main` (`git rebase --onto origin/main ac660e8c`),
  retarget it to `main`, rerun TEST-M07 and `yarn verify`, and remove `blocked`.
- `yarn verify`: all 18 steps pass. The first run failed at `lint` on an unnecessary type assertion in `exportRows`; after
  the fix, `--from lint` passed every remaining step. `yarn guard`: no blocking findings.
