# Issue #199: the club setting `coach_may_cancel`

- **Date:** 2026-11-06
- **Agent / tool:** Claude Code (Opus 5.5), `om-auto-fix-issue` with the repo-local override applied, run unattended under cezar (task 3b419dd3); no subagents. The cezar process restarted once mid-run; the session resumed from the handoff file and the worktree state.
- **Trigger:** `/om-auto-fix-issue 199`
- **Spec / issue / branch:** #199 (split from #139); club spec `.ai/specs/2026-10-20-vereino-club-management.md` (DD-37, the `club_core_club_settings` data model, the M-04/M-05 UI contract); `feat/issue-199-coach-may-cancel` from `main` at 142521b
- **Status:** implemented; PR for review

## Goal

Add the club setting `coach_may_cancel` (default yes). When it is off, a coach is not offered "Cancel session" on M-04/M-05, and a forged cancellation by a coach answers 403 with a message that names the setting. Coordinators and the administrator are not affected.

## Steps

1. Read the issue. It is labelled `feature`. The owner's comment (issuecomment-6693420334, 2026-11-06) approves the `club_core` migration and says to build after #203 (#139), which is merged on `main`. Nobody had claimed the issue and no PR referenced it. Claimed it (assignee, `in-progress`, 🤖 comment issuecomment-6695614003) and renamed the branch.
2. `club_core`:
   - `coachMayCancel` in `lib/settings.ts` (schema, default `true`);
   - the entity column, `storedSettingsOf`, the update command (write and undo restore), and the route's response schema;
   - a checkbox in the "Coaches and guardians" group of `/backend/club/settings`, in both locales.
3. Migration: `yarn db:generate` ran offline from the snapshots and generated `Migration20261106211413_club_core`. I rewrote it in house style: `lock_timeout`, a comment that records the approval, and a hand-written `down()` with `drop column if exists`. Regeneration reformatted the whole `club_core` snapshot, and Prettier then reformatted parts that were committed unformatted (#86). So I restored the snapshot from git and inserted only the new column block. A second `db:generate` reports `club_core: no changes`.
4. `activities`:
   - `permittedCancelRole` (pure, in `lib/activities-rules.ts`): the acting role, except that a coach whose club forbids coaches to cancel cancels only through a coordinator or administrator grant they also hold.
   - `cancelRoleOf` (`commands/occurrences.ts`) reads the setting (`services/directory.ts` → `coachMayCancel`) and the caller's planner grant (`findActingRole` with `PLAN_KINDS`). The cancel command uses it; the new error code `coach_cancel_disabled` (403) names the setting in its message.
   - The member reads use the same function: `GET /api/activities/calendar/{id}?as=coach` and the attendance list now carry `mayCancel`. M-04 (`CoachSessionBlock`) and M-05 (`ClubAttendancePage`) hide "Cancel session" and its hint when it is `false`.
5. Tests:
   - unit tests for `permittedCancelRole` and the setting's default, valid and invalid stored values;
   - a new integration test `ISSUE-199`.
6. Docs: the spec (DD-37, the data model, the M-04/M-05 paragraph) and its changelog file; the `club_core` and `activities` READMEs.

## Decisions

- **A coach who also coordinates the section still cancels, as the coordinator.** #139 records the least-privileged grant (`coach`), so a plain check "role is coach and the setting is off" would refuse Wojtek or Krystyna even though they plan the section. The issue says coordinators are not affected. Under the setting the cancellation is therefore recorded in the planner role. It then follows the coordinator's path: no coordinator notice, because they decided it.
- **`mayCancel` on the reads, computed by the same function as the command.** The page shows the button only when the cancellation would be accepted, and the server stays the authority. The field is optional on the calendar entry (only `as=coach` on `/calendar/{id}` fills it) and present on the attendance list. Both are additive response fields (`BACKWARD_COMPATIBILITY.md`).
- **"Report absence" is not part of this PR.** It is #95, PR #200, which is open and touches the same components. With the setting off, M-04 now shows the summary and "Attendance list" only. The "Report absence" button arrives with #200, and acceptance criterion 1 ("only Report absence is offered") is fully met once #200 merges. The two changes touch neighbouring lines in `CoachSessionBlock.tsx`, so the PR merged second needs a small merge.
- **The setting is read inside the cancel transaction through the `club_core` settings service.** Settings change rarely, and a club that switches the setting while a coach is cancelling gets either answer, which is acceptable.

## Files changed

- `packages/app/src/modules/club_core/`:
  - `lib/settings.ts`, `lib/__tests__/settings.test.ts`
  - `data/entities.ts`, `services/settings.ts`, `commands/settings.ts`, `api/settings/route.ts`
  - `components/ClubSettingsForm.tsx`
  - `i18n/en.json`, `i18n/pl.json`, `README.md`
  - `migrations/Migration20261106211413_club_core.ts` (new), `migrations/.snapshot-open-mercato.json`
- `packages/app/src/modules/activities/`:
  - `lib/activities-rules.ts`, `lib/__tests__/activities-rules.test.ts`, `lib/error-codes.ts`
  - `commands/occurrences.ts`, `api/occurrences/[id]/cancel/route.ts`, `api/shared.ts`
  - `services/directory.ts`, `services/calendar.ts`, `services/attendance-list.ts`
  - `components/club/club-client.ts`, `components/club/CoachSessionBlock.tsx`, `components/club/ClubAttendancePage.tsx`
  - `i18n/en.json`, `i18n/pl.json`, `README.md`
- `packages/app/.ai/qa/tests/activities/ISSUE-199-coach-may-cancel.spec.ts` (new); a comment in `ISSUE-139-coach-cancels-session.spec.ts`
- `.ai/specs/2026-10-20-vereino-club-management.md`, `.ai/specs/changelog/2026-10-20-vereino-club-management/2026-11-06-issue-199-coach-may-cancel.md`

## Commands and results

- `yarn generate`: completed (the fresh worktree had no `.mercato/generated`).
- `yarn db:generate`: generated `club_core` only. After the rewrite and the snapshot fix it reports `club_core: no changes`. The migration was not applied to any dev or real database.
- `npx jest` on the `club_core` settings test and the `activities` rules test: 2 suites, 36 tests passed.
- `yarn typecheck`: passed. `yarn typecheck:qa`: passed.
- `yarn spec-changelogs:check`: valid.
- `yarn test:integration:vereino --filter ISSUE-199`: see below.
- `yarn verify`: see below.

## Open problems / next steps

- #95 / PR #200 adds "Report absence" to M-04/M-05; whichever of #200 and this PR merges second resolves the neighbouring lines in `CoachSessionBlock.tsx` and `ClubAttendancePage.tsx`.
