# Run: issue #271 (E10-S06) — families are told whenever a session moves

- **Goal and trigger:** cezar task (`om-auto-fix-issue 271`, label `cezar`): build phase 6 of the groups and activities
  parity spec — a moved, restored or re-planned session is announced in the session thread, in the app and by e-mail
  (D-031 §7).
- **Spec / issue / branch:** `.ai/specs/2026-11-14-vereino-parity-groups-and-activities.md` phase 6 (REQ-A09) and
  phase 5 deliverable 4; #271 (epic #252); branch `feat/issue-271-session-moved-notice`.
- **Approval:** the spec is `Ready for implementation`; the contract changes of phase 6 (the `change` and actor fields,
  `scheduleChange`, `communication.threads.record_reschedule`, `communication.session_moved`,
  `activities.occurrence_moved`, the two subscribers) and the default texts (Q-A02) were approved by the owner on
  2026-11-16 (#252). No migration.

## Steps

1. Claimed #271 (assignee, `in-progress`, claim comment); dependencies #268 and #270 are merged.
2. `activities`: `lib/session-change.ts` (what is announced; the series change) with unit tests at 100 %; the move, its
   undo and the restore emit `change`, `groupId`, actor fields and `updatedAt`; the series edit and its undo emit
   `scheduleChange` (`replanSeries` collects the moved sessions); `services/session-notice.ts` sends
   `activities.occurrence_moved` (generalising the cancellation audience to `sessionAudience` on the session's new
   date); subscribers `activities:notify-occurrence-moved` and `activities:notify-schedule-changed`; the move answers
   `notified` and both move forms show it.
3. `communication`: `lib/reschedule.ts` (the texts) with unit tests; message kind `reschedule`; command
   `communication.threads.record_reschedule` beside `record_cancellation` (same thread lock, idempotency key
   `communication:reschedule:{id}:{updatedAt}`, e-mail only, the actor left out, coordinators added for a coach's
   change); template `communication.session_moved` (en, pl); subscribers `communication:session-moved` and
   `communication:schedule-changed`; the share text of a session whose thread last announced a move.
4. Integration tests TEST-A13, TEST-A14, TEST-A15 and the notice part of TEST-A07; the messaging probe gained a
   `subscriber` step (TEST-A15); ISSUE-136 now expects the gathering-change e-mail before the cancellation one.

## Decisions

- **Two more subscriber files.** The spec says "the same two subscribers" handle `activities.activity.updated` with
  `scheduleChange`; a subscriber declares one event, so the series half of each is its own file
  (`activities:notify-schedule-changed`, `communication:schedule-changed`).
- **The undo of a cancellation stays silent.** The spec names the move, its undo and the restore; TEST-M07 undoes a
  cancellation and expects no extra thread message, so that undo emits `activities.occurrence.updated` without
  `change`.
- **Thread message written whole.** The `reschedule` message stores the full sentence in the club's language (as the
  share text is); the thread shows it as a system message. The e-mail is rendered in each recipient's language.
- **Point labels.** The in-app notice and the thread name the date as "Tue 18.11 17:00, place" in the club's language;
  the series notice names the first changed date as `DD.MM.YYYY` and the rule as times, gathering offset and place.
- **`scheduleDirectory` fields are optional.** `placeId` and `venueName` were added as optional fields, so other
  implementers of the interface (a payments test stub) stay valid.
- **TEST-A13 undo.** The coordinator role has no `audit_logs.undo_self`, so the administrator makes and undoes a
  second move.

## Commands and results

- `yarn typecheck`, `yarn typecheck:qa` — pass.
- `yarn test` — pass (coverage thresholds met; `session-change.ts` and `reschedule.ts` at 100 %).
- `yarn lint` (first run) — 3 errors in new code (an unneeded `String()`, an unneeded assertion, a platform type in a
  pure test); fixed.
- `yarn test:integration:vereino --filter TEST-A13` (first run) — failed at the undo step:
  `{"error":"Forbidden","requiredFeatures":["audit_logs.undo_self"]}` (the coordinator undid); everything before it
  passed. Rewritten as above.
- `yarn test:integration:vereino --filter TEST-A13` (second run) — failed at the coach's move:
  `{"error":"Forbidden","requiredFeatures":["activities.coach"]}` (a plain account, no coach role); the coach is now
  signed in with `signedInStaff(..., role: 'coach')`.
- `yarn test:integration:vereino --filter TEST-A13` (third run) — 1 passed (2.0m).
- `--filter TEST-A14` — 1 passed (1.8m); `--filter TEST-A15` — 1 passed (2.2m); `--filter TEST-A07` — 1 passed
  (1.6m); `--filter ISSUE-136` — 1 passed (2.1m).

## Open problems

- None known.

## Next steps

- Open the PR; the owner reads the rendered pl and en e-mails in it (spec phase 6).
