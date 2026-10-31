# Issue #34 — consenting guardians' contacts on the coach's attendance list (E03-S05)

- **Date:** 2026-10-31
- **Agent / tool:** Claude Code (Opus 5.5), `om-auto-fix-issue 34` → feature route → `om-auto-implement-spec` → `om-auto-create-pr` (plain engine)
- **Trigger:** the product owner chose "story by story" for epic #22 (E03) and, with PR #62 (#33) still open, to stack #34 on it ("Stack on #62")
- **Spec / issue / branch:** `.ai/specs/2026-10-20-vereino-club-management.md` phase 2 step 10, the guardian-contacts part (REQ-037, DD-39, Q-045; TEST-052; the API row `GET /api/activities/occurrences/{id}/guardian-contacts`; *Data Models* `ContactAccessLog`) on `.ai/specs/2026-10-27-vereino-foundation-scheduling-primitives.md` P-27 `auditedRead` and P-28 `AppendOnlyEntityBase` + the `append_only` guard (DD-G06, DD-G11, J-G03, TEST-G05); issue #34; branch `feat/issue-34-guardian-contacts` from `feat/issue-33-coach-attendance-checkoff` (`e36424a`) in the worktree `C:\Users\wkuc\vereino-issue-34`; the PR targets that branch until #62 merges
- **Status:** in progress

Source doc: .ai/specs/2026-10-20-vereino-club-management.md

## Goal

On a session's attendance list the coach of the group sees the phone and e-mail of the guardians who consented (`share_contact_with_coaches_at`) and have an account, for the session's participants only; withdrawal hides them at once; every read commits an append-only log row (actor, role, session, person ids, purpose — never the values) before the data is returned and is mirrored to the platform access log.

## Scope

- **In:** P-28 `AppendOnlyEntityBase` in `@vereino/db` and the `append_only` guard in `foundation`; P-27 `auditedRead` in `foundation`; `ContactAccessLog` / `activities_contact_access_log` with its migration; the additive `people.personDirectory` reads of the consenting guardians and their contact details; `GET /api/activities/occurrences/{id}/guardian-contacts`; the "Contacts" section of `/club/occurrences/[id]/attendance`; TEST-052 and the unit parts of TEST-G05.
- **Out (non-goals):** a group-level contact list; guardians without an account; substitutions (`substitute_occurrence_ids`, A05); an operator UI for the log.

## Implementation Plan

1. P-28: `AppendOnlyEntityBase` (`@vereino/db`) + the guard (pure rule in `foundation/lib`, subscriber registered per request `em` in `foundation/di.ts`), error `append_only`.
2. P-27: `auditedRead` (committed-first log row, mirror, then the read; the read is not called when the log write fails).
3. `activities`: `ContactAccessLog`, migration, the `people` directory reads, the route.
4. UI: the "Contacts" section on the coach's attendance list; en + pl.
5. Tests: unit (the guard, `auditedRead`'s order, the contact rules) and TEST-052; the gate.
6. Documentation: spec notes, README, this log.

## Risks

- Contact data of minors' guardians: the read must be narrowed to the session's participants, consenting guardians with an account and a coach of the group — and logged before the values leave the database.
- The guard only sees ORM unit-of-work updates and deletes; `nativeUpdate` / `nativeDelete` bypass it (no module code issues them against the log).

## Decisions

- **Stacked on #62.** The contacts live on the coach's attendance list, which #62 (#33) adds; the product owner chose to stack this PR on it rather than wait.
- **Only the session's coaches read.** The route requires `activities.coach` and the `coach` grant of the group or the session's assigned coach (`self` on `coach_person_id`, as the check-off); the coordinator and the club administrator get 403 although they hold `activities.coach` — the consent is given "to the coaches" (REQ-037, DD-39), and data minimisation follows it.
- **Read on request.** The page loads the contacts only when the coach presses "Show guardians' contacts" and never refetches on its own, so every read in the log is a coach's deliberate action.
- **Every read is logged, an empty one too.** The row lists the ids that consented at the time of the read; the values are read afterwards with the consent re-checked, so a withdrawal between the two drops the guardian from the answer while the row stays (ids ⊇ shown).
- **Today's guardianships.** The guardians are the active ones on the club's today, not on the session date: the coach calls today.
- **The guard per request `em`.** The platform forks a fresh event manager into every request container and runs the module registrars after registering `em`, so `foundation/di.ts` registers the subscriber there (a `WeakSet` keeps it once per event manager); the CLI container goes through the same path, which the self-check proves.
- **Operator commands instead of a probe route.** TEST-G05's update and delete refusals are proven by `activities check-append-only` (a rolled-back transaction) and the log is read by `activities contact-access-log` — both useful to an operator for a data-protection request; no test-only HTTP route.
- **The pure parts in `lib`.** The guard's rule and the read order are pure (`foundation/lib`), because the services layer cannot load under Jest; the services wire them to the ORM, the error table and the platform log.
- **The mirror is not asserted end to end.** The platform access log is read per actor (the coach has no `audit_logs.view_self`); the mirror call is covered by the unit test of the order and is best effort by design (V-F08).

## Progress

- [ ] 1. P-28 base and guard
- [ ] 2. P-27 auditedRead
- [ ] 3. Entity, migration, directory reads, route
- [ ] 4. Contacts section on the attendance list
- [ ] 5. Tests and the gate
- [ ] 6. Documentation
