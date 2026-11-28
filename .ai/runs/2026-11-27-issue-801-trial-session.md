# Run: E26-S05 trial session for an applicant (#801, phase 4)

- **Goal / trigger:** Cezar run (label `cezar` on #801, 2026-11-27) — `om-auto-fix-issue 801`: build phase 4 of
  `.ai/specs/2026-11-25-vereino-section-sign-up-form.md` (trial session, REQ-J12 trial, REQ-J16, TEST-J10).
- **Issue / branch:** #801, `feat/issue-801-trial-session-applicant`, worktree
  `.ai/cezar/worktrees/35d59d64-3fe8-4889-a2c5-f249e597ab96`. Epic #787; depends on #800 (merged, PR #891).
- **Approvals used:** owner decision 2026-11-26 on #788 — Q-J07 (free trial, one at a time), the phase 1–4 migrations,
  the additive `activities.occurrenceFacts.upcomingSessionsOfGroup` and the spot
  `vereino:club:occurrence:attendance:extra`.

## Steps

1. Claimed #801 (assignee, `in-progress`, `🤖` claim comment naming this run).
2. Read the spec (DD-J12, Trial rule, M-J3, M-J4, API rows, events) and the phase 2–3 code of `enrolment`.
3. `activities`: `upcomingSessionsOfGroup(scope, groupId, from, limit)` on `activities.occurrenceFacts`; the spot below
   the attendance list in `ClubAttendancePage` (context: the session, acting role, time zone).
4. `groups`: additive `publicConditions` on `groups.applicationTargets` (a public group's conditions = "what to bring").
5. `enrolment`: `lib/trials.ts` (pure rules, 100 % tested); commands `propose_trial`, `withdraw_trial` (undoable),
   `trial_session_cancelled` (job), `enrolment.trials.mark`; routes `POST|DELETE …/trial`, `GET …/trial-sessions`,
   `GET /api/enrolment/trials`, `PUT /api/enrolment/trials/{applicationId}`; coach read via `auditedRead` into the new
   append-only `enrolment_trial_read_logs` (migration `Migration20261127210731_enrolment`, generated offline by
   `yarn db:generate`, `down()` by hand; table added to the club tables); subscriber on `activities.occurrence.cancelled`;
   e-mails `trial_proposed`, `trial_cancelled`; notification `enrolment.trial_session_cancelled`; Trial sheet, trial
   block and withdraw on the application page; M-J4 card widget; status page shows the session; list tabs/overdue use
   whether the session is over; accept sheet start day defaults to the group's next session day (deferred from phase 3).
6. Isolation probes for the four routes; TEST-J10; spec body, AC-J07/AC-J10, changelog file; module README.

## Decisions

- **Read log table.** `auditedRead` (P-27) needs a module-owned append-only log (P-28); the spec said "no other table
  changes" but listed `auditedRead` as a deliverable, so the table is the minimal way to honour both (phase-4 migration
  approved on #788). Recorded in the spec's Data Models.
- **`withdraw_trial` is its own command** (DELETE), undoable like `propose_trial`; allowed only before the session
  starts. A coordinator may pick another group (`groupId`) — needed for "choose a group for us".
- **Marks need `updatedAt`** (AGENTS rule for custom update clients) and open 30 minutes before the start, like the
  attendance list; a cancelled session closes them. Who: coach of the group, the assigned coach (`self`), club admin.
- **E-mail idempotency** keys include the transition time: a withdrawn proposal and a later cancellation of the same
  session each send an e-mail (first local run caught the deduplication).
- Spec status stays `In progress`: AC-J02…J06, J08, J09, J11, J12 still carry close-out gaps; the whole-spec close-out
  (evidence, `Implemented`, move to `implemented/`) is left to a close-out PR.

## Commands and results

- `yarn db:generate` → only `enrolment` changed (one table, two indexes).
- `yarn typecheck`, `typecheck:qa`, `format:check`, `ds:check`, `i18n:check-hardcoded --strict`, `contracts:check`,
  `qa-texts:check`, `di-commands:check`, `spec-changelogs:check`, `glossary:check`, `route-isolation:check` → green
  (glossary first failed: Polish "zajęcia" is retired; reworded to "trening próbny"/"termin").
- Unit: `jest src/modules/enrolment/lib groups/lib/__tests__/application-targets.test.ts` → 51 passed.
- `yarn test:integration:vereino --filter TEST-J10`: run 1 failed (`2 e-mail(s) "Trial session cancelled"` — shared
  idempotency key; retry failed only on a Polish text I changed mid-build); run 2 failed on `reportsAfter` equality (the
  test's own cancellation of the second session was inside the baseline window — baseline moved after it); run 3
  `1 passed (1.3m)`.
- `--filter ISSUE-628` (TEST-J12, the cross-club guard with the new probes) → `1 passed (2.6m)`; `--filter TEST-J07`
  (accept sheet and detail changed) → `1 passed (1.0m)`.
- `yarn verify` → `all 24 step(s) passed`; `yarn guard` → no blocking findings.

## Open problems / next steps

- Spec close-out of the whole sign-up spec (tick the remaining ACs with evidence, `Implemented`, move).
- No retention rule yet for `enrolment_trial_read_logs` (ids only); the activities contact log has one — worth a
  follow-up if the compliance pack wants it.
