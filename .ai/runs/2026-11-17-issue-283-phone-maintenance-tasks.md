# Run: issue #283 — E11-S09 a person who maintains a place sees, plans and completes their tasks on the phone

- **Goal and trigger:** cezar task (`om-auto-fix-issue 283`, label `cezar`): build phase 9 of `.ai/specs/implemented/2026-11-14-vereino-parity-facilities.md` (REQ-R15; TEST-R15; AC-R11; J-R07).
- **Spec / issue / branch:** spec `Ready for implementation` (owner approval 2026-11-16 on #253; Q-R19 confirmed); issue #283; dependency #278 merged; branch `feat/issue-283-phone-maintenance-tasks`.

## Steps

1. Claimed #283 (assignee, `in-progress`, 🤖 comment). Feature route: spec found and Ready, no open PR for the issue.
2. Read the existing code: the maintenance routes (#128) already filter by the `maintenance_planner` grant, the calendar answers a maintainer redacted with `maintenance.canPlan` / `planPlaceIds`, and E11-S04 already put "Plan maintenance" on the day axis (`ClubPlacePage.tsx`). The in-app link of a dispatch comes from its notification type's `linkHref` (`foundation/services/dispatch-worker.ts`), one per type.
3. `lib/maintenance.ts`: `maintenanceListGroup` (Due / Planned / Done) and `plannerReminderKey`, with unit tests (100 % coverage of the file).
4. Reminder link by recipient: new notification type and e-mail template `facilities.maintenance_due_planner` (same title/body keys, link `/club/places/maintenance`); `services/maintenance.ts` sends the administrators' copy as before (same template, key unchanged) and the maintainers who are not administrators the planner copy (key `<key>:planner`).
5. UI: `MaintenanceCompleteDialog.tsx` extracted from `MaintenanceTable.tsx` (time-zone converters as props) and shared; `components/club-places/MaintenanceList.tsx` and `frontend/club/places/maintenance/{page.tsx,page.meta.ts}`; `useMaintainerTasks` and `CLUB_MAINTENANCE_HREF` in `maintenance-client.ts`; the "Konserwacja" link on `/club/places` when `maintenance.canPlan`; en/pl catalog keys `facilities.places.maintenance.*`.
6. Test TEST-R15 (`packages/app/.ai/qa/tests/facilities/TEST-R15-maintainer-on-the-phone.spec.ts`); fixture `NotificationItem` gained `linkHref`.
7. Spec: AC-R11 ticked; changelog entry `.ai/specs/changelog/2026-11-14-vereino-parity-facilities/2026-11-17-issue-283-phase-9.md`; status unchanged (other phases remain).

## Decisions

- **Two notification types instead of a per-recipient link:** the foundation dispatch takes the in-app link from the type; a second type with the same i18n keys keeps foundation untouched. The administrators' dispatch keeps its idempotency key, so nothing already sent is resent to them; a maintainer gets at most one extra copy of a reminder already sent before this change (the usage reminder of a task still open).
- **A person who is both administrator and maintainer** gets the administrators' copy only (the panel covers the phone page).
- **"Due"** = a planned task a reminder would go out for: due date within 14 days or passed (the reminder's own rule `dateReminderStage`), its window started, or its counted hours at the threshold.
- **The page requires `facilities.maintenance.manage`** (as `/club/facility` requires its feature); the list still shows a 403 state if the route refuses.
- **409 on completing a done task stays `invalid_transition`:** the issue says the maintenance routes and contracts are unchanged, and the complete route documents `invalid_transition` (only a change of a final task answers `maintenance_task_closed`). The completion dialog shows the `maintenance_task_closed` message for both codes. The AC's literal code is left to the owner (raised on the PR).
- **The phone list reads up to 200 planned and the latest 20 done tasks** — enough for the places one person maintains; no pagination on the phone.

## Files changed

`packages/app/src/modules/facilities/`: `lib/maintenance.ts`, `lib/__tests__/maintenance.test.ts`, `notifications.ts`, `emails/templates.ts`, `di.ts`, `services/maintenance.ts`, `components/{MaintenanceCompleteDialog,MaintenanceTable}.tsx`, `components/maintenance-client.ts`, `components/club-places/{MaintenanceList,ClubPlacesPage}.tsx`, `frontend/club/places/maintenance/{page.tsx,page.meta.ts}`, `i18n/{en,pl}.json`; `packages/app/.ai/qa/tests/facilities/TEST-R15-maintainer-on-the-phone.spec.ts`, `packages/app/.ai/qa/tests/_fixtures/activities.ts`; the spec, its changelog entry, this log.

## Commands and results

- `yarn generate`: pass. `yarn typecheck`: pass.
- `yarn workspace @vereino/app jest src/modules/facilities/lib/__tests__/maintenance.test.ts`: 11 passed; coverage of `lib/maintenance.ts` 100/100/100/100.
- `yarn test:integration:vereino --filter TEST-R15` run 1: failed at the second completion — `Expected: "maintenance_task_closed" Received: "invalid_transition"` (both attempts); every step before it passed (reminder links, list, window from the axis, completion with the next instance). Fixed as described under Decisions.
- Run 2 (after the fix): `1 passed (4.0m)`.
- `yarn verify` run 1: failed at `format:check` (TEST-R15 spec and `maintenance.test.ts` unformatted); `yarn format`, then `yarn verify --from format:check`: 12 steps passed; final full `yarn verify`: all 17 steps passed. Lint: 0 errors; the one warning in `lib/maintenance.ts` (line 61, `parseMaintenanceRecurrence`) predates this change.

## Open problems / next steps

- The owner decides whether the complete route should answer `maintenance_task_closed` for a final task (an error-code change, Ask First).
- Spec stays `Ready for implementation`; later phases remain.
