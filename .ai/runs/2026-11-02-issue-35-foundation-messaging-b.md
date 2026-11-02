# Issue #35: foundation III phase B — announcements, threads, cancellation e-mail, share text and member inbox

- **Date:** 2026-11-02
- **Agent / tool:** Claude Code (Opus 5.5), `om-auto-fix-issue` with the repo-local override applied, one implementation subagent (which briefed one more for P-32), and the coordinator's own review and gate
- **Trigger:**
  - `/om-auto-fix-issue 23` continued epic #23 after phase A (#71, PR #73).
  - The product owner had approved the new `communication` module and its migration on 2026-11-01.
- **Spec / issue / branch:**
  - Spec: `.ai/specs/2026-10-27-vereino-foundation-messaging-primitives.md`, *Implementation Phases → Phase B* (REQ-M05…REQ-M08, REQ-M10, P-32, J-M01, J-M02, TEST-M05…TEST-M08, TEST-M10, AC-M05…AC-M08, AC-M10), with the club spec's phase 3 (REQ-009, *Thread*, DD-17, DD-35, R01, R15).
  - Issue: #35 (E04-S01), epic #23.
  - Branch: `feat/issue-35-announcements`, cut from phase A's branch at bd40916; its PR to `main` opens only after #73 merges (lesson from #69).
- **Status:** completed, PR open for review.

## Goal

Club staff send an announcement to the club, a section, a group, an activity or a session, and see who it reached. Members read it in the app and by e-mail in their language and reply only to the staff. A cancelled session gets one thread and an e-mail. Staff can paste a share text whose link opens a public session page.

## Steps

1. Claimed #35 (assignee, `in-progress`, 🤖 comment) and created a worktree stacked on phase A, since phase B needs phase A's contracts.
2. **Subagent:** built the `communication` module, its migration, P-32 in `@vereino/ui`, the cancellation subscriber, the share text and the public session page in `activities`, the member inbox, TEST-M05…M08 and TEST-M10, and extended TEST-012 and TEST-047.
3. **Coordinator review:**
   - module registration and the migration (four new tables, `down()` by hand, no DDL on existing tables);
   - scope checks: one target id per non-`persons` audience, foreign or unknown targets answer the same 403, `persons` stays limited by phase A's audience rules;
   - R15: a member sees messages for everyone and their own household's staff-only replies, never another family's; delivery status only for the author, the section's coordinator and the administrator;
   - the public session page: scoped by the slug's organization, name, date, time and status only, the same 404 for every miss;
   - event payloads carry ids only; subject and bodies encrypted; every command non-undoable;
   - nothing from phase C, A05 or REQ-017; no dependency; no other platform module.
4. **Coordinator gate:** `yarn verify` and the whole integration suite; fixed the axe baseline matcher after ENG-TEST-25 failed, and reran the affected tests.

## Decisions

- **Threads:** a thread stores `section_id` and `group_id` snapshots so scope checks match a coordinator's section and a coach's group. Composer kinds: club (admin), section (coordinator), group, activity and session (coach too); `persons` / `direct` through the API only.
- **Staff of a thread:** the author, participants reached as coaches, staff who replied, the section's coordinator and the administrator. A member's reply goes to the staff participants only; a section coordinator is e-mailed once they take part.
- **Household (R15):** the member, their wards and the active guardians of both.
- **Locks:** create, reply and mark-read append rows and declare `lock: 'none'`; revise and delete carry the thread version.
- **E-mails:** full message text, encrypted in the dispatch parameters. The cancellation e-mail goes to recipients with an address only; app-only holders keep `activities`' phase 2 in-app notice; the canceller is left out.
- **Session thread:** opened by the system (author null) with a system message giving the reason.
- **Share text:** links to the public session page when the club has a slug and a published page, otherwise to `/club/calendar`.
- **Thread list:** loads up to 1000 thread headers and computes unread state in TypeScript (club size).
- **#35's link-request criteria** (the "send me a link" form, no enumeration for an unknown e-mail) belong to REQ-017 per the spec's Q12; the public page offers sign-in instead.

## Installed behaviour that differed from the spec

- **The notification type registry is filled only in the web runtime.** The dispatch worker could not find `communication.announcement`, so in-app deliveries failed `render_failed`. `communication/di.ts` registers the module's types (`registerNotificationTypes` is additive by type id).
- **`DataTable` and `CrudForm` import `next/navigation`,** which `packages/ui` cannot resolve. `DeliveryStatusList` uses the table primitive; `AudiencePicker` is a controlled field mounted as a `CrudForm` custom field; the logic sits in tested `.ts` models.
- **Subscribers get no event id.** The cancellation dispatch is keyed by the occurrence id and the `updatedAt` the cancellation wrote.
- **The spec's `vereino:club:tiles` spot does not exist;** the tile uses `vereino:club:today:sections`.

## Files changed

- `packages/app/src/modules/communication/**` (new module: entities, migration, encryption, events, notifications, rules, commands, services, API, backend and member pages, widget, e-mail templates, subscriber, i18n, README).
- `activities`: share text, schedule directory, public session service, API and page, error code, i18n, nav item, README.
- `club_core` (`clubFrame`, `listSections`), `groups` (`listGroups`), `people` (nav item, i18n), with READMEs.
- `packages/ui/src/admin/*` (P-32) with tests; `packages/ui/src/index.ts`, README.
- `packages/app/src/modules.ts`, `packages/app/vereino-modules.json`.
- QA: `_fixtures/communication.ts`, `communication/TEST-M05…M08`, `TEST-M10`; TEST-012 and TEST-047 extended; probe step `command`.
- `packages/app/.ai/qa/tests/_fixtures/axe.ts` (the sidebar heading baseline matched in the page).
- `.ai/lessons.md`, three new lessons and one extended; this run log.

## Commands and results

- **Throwaway Postgres** (127.0.0.1 only): `yarn db:generate`, then up → down → up as raw SQL: 4 → 0 → 4 tables; a second `db:generate` reported no changes. Never applied to a dev or real database.
- **`yarn verify`:** subagent's final run 13/13; coordinator's rerun 13/13 (242 s).
- **`yarn test:integration:vereino --filter <id>`**, subagent's runs, one id each: TEST-M05 1.8 m, TEST-M06 1.6 m (after the registry fix; on TEST-015's fixture, so it is TEST-015's re-run with e-mail), TEST-M07 1.6 m, TEST-M08 1.4 m, TEST-M10 1.2 m, TEST-012 1.5 m, TEST-047 1.3 m, TEST-014 1.2 m; all passed.
- **`yarn test:integration:vereino`**, whole suite, coordinator's run: 94 passed, 1 failed (50.8 min).
  - ENG-TEST-25 failed on both attempts: `color-contrast` on `/backend/club/sections/create`, two AppShell sidebar group headings ("Developers", "Security"). They are platform markup in the axe baseline, but the new `communication` sidebar group changed axe's shortest selector for them, so the baseline's `[data-sidebar-group` text match missed them.
  - Fix: the baseline matcher now checks in the page whether the node sits inside `[data-sidebar-group]` (`_fixtures/axe.ts`); the lesson `platform-crudform-labels-axe-baseline` is extended.
  - Reruns after the fix, one id each: ENG-TEST-25 1.3 m, TEST-M05 1.2 m, TEST-M10 1.1 m, all passed.
- No dependency added. No `db:migrate` against a dev or real database.

## Open problems

- Edit and delete buttons in the UI are not built; the API exists and is not integration-tested.
- Section coordinators are not e-mailed about a member's reply until they take part.
- Retention (Q13) stays open.
- TEST-M07 cannot cover "edit the session after cancelling, then replay": a cancelled session cannot be edited; undo plus re-cancel is covered.
- Browser console errors are not asserted by any test.

## Next steps

- Owner review of this PR.
- Then phase C (#36): cases.
