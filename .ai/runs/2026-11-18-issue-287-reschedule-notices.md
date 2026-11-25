# Run — issue #287: staff are told when a closure or maintenance window flags their entry to be moved (E11-S13)

- **Goal and trigger:** cezar task 5a805662 (`om-auto-fix-issue 287`), unattended. After `flagUnderWindow`, tell the people who must move the flagged entries: the coordinators and coach of a session, the booker of a club booking, the club administrators for a rental, and the renter by e-mail (REQ-R18, TEST-R18, AC-R14, J-R05).
- **Spec / issue / branch:** `.ai/specs/implemented/2026-11-14-vereino-parity-facilities.md` (phase 13, DD-R14); #287 (epic #253); `feat/issue-287-reschedule-notices`.
- **Approval:** the spec is `Ready for implementation` (owner approval 2026-11-16 on #253, which lists the notification contract of phase 13 as an approved additive change). The issue's "blocking: spec is Draft" note is outdated. The dependencies #275 and #279 are closed. No migration, no new dependency.

## Steps

1. Read the issue, the spec's phase 13, DD-R14, the *Events* row, J-R05, TEST-R18 and AC-R14. Confirmed the spec status and the closed dependencies.
2. Claimed #287 (issuecomment-6982414959) and renamed the branch.
3. Read `services/reschedule.ts`, the closure and maintenance commands, the ban-request notice (`services/ban-requests.ts`, the closest precedent), `activities.placeSessions`, `people.personDirectory`, the foundation `dispatch` and the in-app delivery of the dispatch worker.
4. Pure rule `lib/reschedule-notice.ts` (`planRescheduleNotices`, `sectionDays`, `announcedBefore`, `rescheduleNoticeKey`, the links) with unit tests (7 cases, 100 %).
5. Templates `facilities.reschedule_needed`, `facilities.reschedule_needed_rentals`, `facilities.reschedule_renter`; notification types `facilities.reschedule_needed` (link `/club/places`) and `facilities.reschedule_needed_rentals` (link B-24 `view=to_move`); `en`/`pl` catalog keys.
6. `services/reschedule-notice.ts` (`notifyRescheduleNeeded`): reads the entries, the section coordinators on the session's day (`sectionCoordinatorIdsOn`, new wrapper `sectionCoordinatorIds` in `services/directory.ts`), the club administrators, resolves each person's channels with `resolveMembers`, and enqueues one dispatch per person and cause; the renter e-mail goes to the rental's address in its language.
7. `services/reschedule.ts` collects the flagged entries under the window that are new to the cause and calls the notice; a failed notice is logged and does not fail the committed save. The closure and maintenance commands pass the cause (`id`, `updatedAt`, and the window before a move).
8. M-11 (`ClubPlacePage.tsx`) reads `view=to_move`: a checkbox "Only entries to be moved" filters the day's list and stays in the address with the day.
9. Integration test `.ai/qa/tests/facilities/TEST-R18-reschedule-notices.spec.ts`.
10. Spec rows (Events, phase 13 deliverables, coverage tables, BC table), AC-R14 ticked, changelog file `2026-11-18-issue-287-phase-13.md`.

## Decisions

- **"Only newly flagged entries" means new to the cause.** The *Events* row says only newly flagged entries are listed, but TEST-R18 and the issue's acceptance criteria expect maintenance planned over the same, already flagged entries to send its own messages. A message therefore lists the flagged entries under the cause's window minus those under the same cause's window before this save. A new cause lists all of them; a moved window lists only what it adds; an unchanged save does not run the flags at all. Stateless: the previous window comes from the command's before-snapshot.
- **A second notification type for the administrators.** The foundation dispatch worker creates in-app notifications from the type's static `linkHref` (DD-M07), so one type cannot link coordinators to M-11 and administrators to B-24. `facilities.reschedule_needed_rentals` follows the `maintenance_due_planner` precedent (same keys, other link). It is additive; the spec's BC row now names it.
- **One message per person.** A person with several roles (a coordinator who is also an administrator) gets one message listing all their entries; with a rental among them it is the administrators' copy.
- **In-app link of the staff notice is `/club/places`.** The in-app link cannot carry the place or the day; the e-mail's button opens the place's day on M-11 with `view=to_move` (the AC-R14 fallback until the groups spec's "Needs a new time" view exists).
- **No renter in staff messages.** Rental lines say "Rental — place, time"; the renter e-mail has no link (the club proposes the new time).

## Files changed

- `packages/app/src/modules/facilities/lib/reschedule-notice.ts`, `lib/__tests__/reschedule-notice.test.ts` (new)
- `packages/app/src/modules/facilities/services/reschedule-notice.ts` (new), `services/reschedule.ts`, `services/directory.ts`
- `packages/app/src/modules/facilities/commands/closures.ts`, `commands/maintenance.ts`
- `packages/app/src/modules/facilities/emails/templates.ts`, `notifications.ts`, `di.ts`, `i18n/en.json`, `i18n/pl.json`
- `packages/app/src/modules/facilities/components/club-places/ClubPlacePage.tsx`
- `packages/app/.ai/qa/tests/facilities/TEST-R18-reschedule-notices.spec.ts` (new)
- `.ai/specs/implemented/2026-11-14-vereino-parity-facilities.md`, `.ai/specs/changelog/2026-11-14-vereino-parity-facilities/2026-11-18-issue-287-phase-13.md`
- `.ai/lessons/dispatch-in-app-link-is-per-type.md` (new lesson)
- this log

## Commands and results

- `npx jest src/modules/facilities/lib/__tests__/reschedule-notice.test.ts --coverage`: 7 passed, 100 % lines, branches, functions.
- `yarn typecheck`, `yarn typecheck:qa`: no errors. `yarn qa-texts:check`: 0 problems. `yarn spec-changelogs:check`: valid.
- `yarn test:integration:vereino --filter TEST-R18`: the first run failed: `Expected substring: "Turniej Żaków 10:00"`. The e-mail line names the group ("Trening Żaki — Boisko A, 28.11.2026, 10:00–11:00"), not the event name. Every notice and e-mail had been sent as expected. The test now checks the times. Re-run: `1 passed (2.5m)`.
- `yarn verify`: the first run failed at `lint` with one error, `Type parameter T is used only once in the function signature` (`services/reschedule.ts`). The helper is no longer generic, and the new test's warnings are fixed. `--from lint` then failed at `format:check` (`services/reschedule.ts is not formatted`). After `yarn format`, `--from format:check` passed. Every step passed: generate, typecheck, typecheck:packages, typecheck:qa, lint, format:check, ds:check, i18n:check-hardcoded, contracts:check, settings-prefixes:check, glossary:check, qa-texts:check, lessons:check, spec-changelogs:check, test, test:scripts, build.

## Open problems

- None known.

## Next steps

- Review and merge the PR. When the groups spec's "Needs a new time" view (REQ-A05, REQ-A10) lands, point the staff e-mail link at it.
