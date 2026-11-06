# Issue #139: a coach cancels a session from the phone, with the coordinator informed

- **Date:** 2026-11-06
- **Agent / tool:** Claude Code (Opus 5.5), `om-auto-fix-issue` with the repo-local override applied, run unattended under cezar (task 290e40fa); no subagents
- **Trigger:** `/om-auto-fix-issue 139`
- **Spec / issue / branch:** #139; club spec `.ai/specs/2026-10-20-vereino-club-management.md` (REQ-009, DD-37), messaging spec `.ai/specs/2026-10-27-vereino-foundation-messaging-primitives.md` (REQ-M07); `feat/issue-139-coach-cancels-session` from `main` at e646c15
- **Status:** stopped. A migration is needed and was not approved (Ask First). No code changed.

## Goal

On M-04 and M-05, the coach can cancel a session. The section's coordinators get the notice and the e-mail. The acting role is recorded. A club setting `coach_may_cancel` (default yes) decides whether a coach may cancel at all.

## Steps

1. Read the issue and its comments. It is labelled `feature`, so the run took the feature route. No PR referenced #139, nobody had claimed it, and `coach_may_cancel` did not exist in the code. The prerequisite #97 is merged (ad467c8).
2. Claimed the issue: assignee, `in-progress` and the 🤖 comment. Renamed the branch to `feat/issue-139-coach-cancels-session`.
3. Mapped the change surface:
   - `activities/api/occurrences/[id]/cancel/route.ts`, `commands/occurrences.ts`: the command already returns `actingRole`, and `activitiesLog` writes it to the audit context.
   - `activities/services/cancellation-notice.ts`: the audience is participants, guardians of minors and coaches. It has no coordinators.
   - `communication/commands/threads.ts`: `record_cancellation` writes a system message whose body is only the reason. `ThreadMessage` already has `author_person_id` and a free-text `acting_role`.
   - `club_core/data/entities.ts` and `lib/settings.ts`: every club setting is its own column on `club_core_club_settings`.
4. Found the blocker: `coach_may_cancel` needs a new column, which means a `club_core` migration. Migrations are Ask First, and neither the issue nor an owner comment approves one. The issue's own `risk-medium` rationale says "no schema change".
5. Posted the blocker comment with Q1 and the recommended answer (issuecomment-6690197377). Removed `in-progress` and kept the assignee.

## Decisions

- **Stop rather than ship without the setting.** Dropping an acceptance criterion would contradict the issue (D22). Storing the flag in an unrelated JSON column or in another module's config would contradict DD-37. The owner decides between approving the migration and deferring the setting.
- **The spec addendum goes in the implementation PR**, as in #97 and #136. It is not written yet, because the answer to Q1 changes it.

## Files changed

- `.ai/runs/2026-11-06-issue-139-coach-cancels-session.md` (this log)

## Commands and results

- `gh issue view 139`, `gh pr list --search 139`: no open PR and no claim.
- Searched the code for `coach_may_cancel` / `coachMayCancel`: no matches.
- No build, test or gate run, because no code changed.

## Open problems / next steps

- Owner answer to Q1 on #139: approve the migration (recommended) or defer the setting.
- Then re-run `om-auto-fix-issue 139`. Plan:
  1. Spec addendum: REQ-009 recipients, DD-37 `coach_may_cancel`, the `/club/occurrences/[id]` UI contract, and the REQ-M07 template.
  2. Setting: the setting itself, plus the migration if approved.
  3. Cancellation: a 403 with a code naming the setting, `actingRole` and `actorPersonId` in the event payload, coordinators added to the notice and the e-mail, and the thread message recording the canceller and role.
  4. UI and i18n.
  5. Unit tests and an ISSUE-139 integration test.
- "Report absence" depends on #95 (open, claimed by another run).
