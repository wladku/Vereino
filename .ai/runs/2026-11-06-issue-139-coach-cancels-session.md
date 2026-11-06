# Issue #139: a coach cancels a session from the phone, with the coordinator informed

- **Date:** 2026-11-06
- **Agent / tool:** Claude Code (Opus 5.5), `om-auto-fix-issue` with the repo-local override applied, run unattended under cezar (task 290e40fa); no subagents
- **Trigger:** `/om-auto-fix-issue 139`, then the owner's instruction to continue autonomously with reasonable assumptions
- **Spec / issue / branch:** #139; club spec `.ai/specs/2026-10-20-vereino-club-management.md` (glossary *Session cancellation*, *UI architecture*, API table; REQ-009, R01, DD-37); messaging spec `.ai/specs/2026-10-27-vereino-foundation-messaging-primitives.md` (REQ-M07, *Thread message*, data model, events); `feat/issue-139-coach-cancels-session` from `main` at e646c15; follow-up #199
- **Status:** implemented; PR for review

## Goal

On M-04 and M-05, the coach has "Cancel session" ("the session will not take place"). A coach's cancellation also tells the section's coordinators, in the app and by e-mail. The notice, the e-mail and the session thread name who cancelled and in which role (R01). A club setting `coach_may_cancel` (default yes) decides whether a coach may cancel at all.

## Steps

1. Read the issue and its comments. It is labelled `feature`, so the run took the feature route. No PR referenced #139, nobody had claimed it, and the prerequisite #97 is merged. Claimed it (assignee, `in-progress`, 🤖 comment) and renamed the branch.
2. Mapped the change surface:
   - the cancel command and route;
   - the `activities` notice service and subscriber;
   - the `communication` subscriber and `record_cancellation` command;
   - the thread rules and read service;
   - the e-mail template;
   - the member pages M-04 / M-05;
   - the club settings.
3. **First stop.** Every club setting is a column on `club_core_club_settings`, so `coach_may_cancel` needs a migration (Ask First, not approved). Posted the question (issuecomment-6690197377), released `in-progress`, and committed this log's first version.
4. The owner told the session to continue autonomously. Took the no-migration route, as the #87 run did:
   - the setting goes to follow-up #199;
   - everything else in #139 ships;
   - the issue gets a comment that says so.
5. `@vereino/core` (`audience.ts`): `CANCELLING_ROLES`, `cancellingRole` and `cancellationCoordinatorIds`. The coordinators a coach's cancellation also tells are the section's live coordinators, never the canceller. This rule is used by both `activities` and `communication`, so it lives in core, with a node test at 100 %.
6. `activities`:
   - `activities.occurrence.cancelled` adds `actorPersonId` and `actingRole`.
   - The notice audience adds the coordinators (`people.personDirectory.sectionCoordinatorIdsOn` on the session date), and so does the route's `notified` count.
   - The notice body names the canceller through one body key per role (`bodyByCoach`, `bodyByCoordinator`, `bodyByAdmin`), so the role is translated as well.
   - `CancelSessionDialog` is exported and reused on M-05. Both pages carry the hint "The session will not take place".
7. `communication`:
   - The subscriber passes the canceller on.
   - `record_cancellation` adds the coordinators' e-mail. The coordinators join the thread with reason `coach`.
   - The system message becomes a `cancellation` row with the canceller as author and their role.
   - The e-mail gets `cancelledByName` and `cancelledByRole`.
   - The thread view renders "Cancelled by {name} ({role}): {reason}".
   - `isOriginalMessage` and `isSystemMessage` replace the `kind === 'message'` and `author === null` checks in the read model, the deliveries lookup and the edit/delete guard. A cancellation stays a system message: it is never edited or deleted.
8. Tests:
   - unit tests in `activities-rules`, `thread-rules` and core;
   - a new integration test `ISSUE-139`;
   - updated E06-S15 (dialog text; `notified` 5 → 6, because the coordinator is now told), TEST-M07 (the probe sends the same canceller as the real event; the message's role is `club_admin`) and J-003 (role `coordinator`; the e-mail names the coordinator).
9. Docs: both spec addenda with their changelog files, and the `activities` and `communication` READMEs.

## Decisions

- **No migration; the setting is #199.** `AGENTS.md` and the run's own instruction allow a migration only with a recorded approval, and #139 records none. Storing the flag in another JSON column or in the platform's `module_configs` would break DD-37 (one settings table) and would be a hack. AC2 ("only Report absence when `coach_may_cancel = no`, a forged cancel answers 403") moves to #199.
- **The recorded role is the grant the caller acted in, least-privileged first.** Wojtek, who coaches the group and coordinates the section, cancels from the member pages as `coach`. That is his coach context (#101), and the backend panel is his coordinator context. So no new `as` input field was needed on the cancel route. Since the coordinators exclude the canceller, he gets no coordinator notice about himself.
- **Only a coach's cancellation adds the coordinators.** A coordinator or the administrator decided the cancellation themself (issue scope: "a cancellation by a coach notifies the section's coordinators").
- **The `cancellation` message kind, not a filled `author_person_id` on a `message`.** "System" is derived from a null author. Naming the canceller on a plain message would have made the cancellation editable and deletable by its author. `kind` is a text column without a check constraint, so the new value needs no schema change. Old rows (kind `message`, no author) render as before.
- **One notice body per role.** Notification variables are not translated, so a `{role}` variable would show `coach` to a Polish reader. An event without a canceller (older than #139) keeps the type's body.
- **Contracts are additive** (`BACKWARD_COMPATIBILITY.md`, pre-deployment):
  - optional event payload fields;
  - optional template params, so already-queued dispatches still validate;
  - a new message kind in a text column;
  - the same API fields, now filled for a cancellation notice (`authorName`, `actingRole`), and their OpenAPI descriptions updated.
- **"Report absence" is not in this PR.** It is #95 (open, claimed by another run).

## Files changed

- `packages/core/src/audience.ts`, `src/__tests__/cancellation-audience.test.mjs` (new)
- `packages/app/src/modules/activities/`:
  - `commands/occurrences.ts`, `api/occurrences/[id]/cancel/route.ts`
  - `services/cancellation-notice.ts`, `services/directory.ts`
  - `subscribers/notify-occurrence-cancelled.ts`
  - `lib/activities-rules.ts`, `lib/__tests__/activities-rules.test.ts`
  - `components/club/CoachSessionBlock.tsx`, `components/club/ClubAttendancePage.tsx`
  - `i18n/en.json`, `i18n/pl.json`, `README.md`
- `packages/app/src/modules/communication/`:
  - `commands/threads.ts`, `data/validators.ts`, `subscribers/session-cancelled.ts`
  - `lib/thread-rules.ts`, `lib/__tests__/thread-rules.test.ts`
  - `services/threads.ts`, `api/shared.ts`, `emails/templates.ts`
  - `components/ThreadMessages.tsx`
  - `i18n/en.json`, `i18n/pl.json`, `README.md`
- `packages/app/.ai/qa/tests/activities/ISSUE-139-coach-cancels-session.spec.ts` (new), `activities/E06-S15-coach-runs-session.spec.ts`, `communication/TEST-M07-session-cancellation.spec.ts`, `journeys/J-003-cancellation-announcement-case.spec.ts`
- `.ai/specs/2026-10-20-vereino-club-management.md`, `.ai/specs/2026-10-27-vereino-foundation-messaging-primitives.md`, plus one changelog file for each

- `.ai/lessons/audit-actions-list-needs-view-tenant.md` and `.ai/lessons/notification-variables-are-not-translated.md` (new), each with a catalog row; a recurrence note in `.ai/lessons/sign-in-browser-ends-the-api-token.md`

## Commands and results

- `yarn generate`: completed (the fresh worktree had no `.mercato/generated`).
- `yarn typecheck`: the first run failed with TS1005 in the cancel route's `openApi` description and in `communication/api/shared.ts`. An apostrophe in a single-quoted string had lost its escape in a scripted edit. After rewording: passed.
- `yarn typecheck:qa`: passed.
- `@vereino/core` `yarn test`: passed, 100 % lines, branches and functions.
- `npx jest src/modules/activities/lib src/modules/communication/lib --coverage`: 16 suites, 179 tests passed, 100 % on every file.
- `yarn format`: 3 files reformatted, all from this change.
- `yarn test:integration:vereino --filter ISSUE-139`:
  - The first run failed: `expect(cancelLog?.context?.actingRole).toBe('coach')`, received `undefined`. The administrator lists only their own actions without `audit_logs.view_tenant`. The test now grants it first, as E03-S01 does.
  - The second run failed: `GET /api/notifications {"error":"Unauthorized"}` (401). A browser sign-in revokes that user's earlier API token. The test now takes a fresh token with `signInAs` after each person's browser part.
  - The third run passed (1 passed, 2.3 min).
- `--filter E06-S15`: 1 passed (1.6 min). `--filter TEST-M07`: 1 passed (1.8 min). `--filter J-003`: 1 passed (2.7 min).
- `yarn verify`: all 14 steps passed on the first full run (build 89 s).

## Open problems / next steps

- #199: `coach_may_cancel` (a `club_core` migration; Ask First).
- #95: "Report absence" next to "Cancel session" on M-04 / M-05.
