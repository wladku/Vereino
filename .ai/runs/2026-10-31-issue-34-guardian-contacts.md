# Issue #34 — consenting guardians' contacts on the coach's attendance list (E03-S05)

- **Date:** 2026-10-31
- **Agent / tool:** Claude Code (Opus 5.5), `om-auto-fix-issue 34` → feature route → `om-auto-implement-spec` → `om-auto-create-pr` (plain engine)
- **Trigger:** the product owner chose "story by story" for epic #22 (E03) and, with PR #62 (#33) still open, to stack #34 on it ("Stack on #62")
- **Spec / issue / branch:** `.ai/specs/2026-10-20-vereino-club-management.md` phase 2 step 10, the guardian-contacts part (REQ-037, DD-39, Q-045; TEST-052; the API row `GET /api/activities/occurrences/{id}/guardian-contacts`; *Data Models* `ContactAccessLog`) on `.ai/specs/2026-10-27-vereino-foundation-scheduling-primitives.md` P-27 `auditedRead` and P-28 `AppendOnlyEntityBase` + the `append_only` guard (DD-G06, DD-G11, J-G03, TEST-G05); issue #34; branch `feat/issue-34-guardian-contacts` from `feat/issue-33-coach-attendance-checkoff` (`e36424a`) in the worktree `C:\Users\wkuc\vereino-issue-34`; the PR targets that branch until #62 merges
- **Status:** complete

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
- **Today's guardianships and today's group.** The guardians are the active ones on the club's today, and only children who are participants both on the session date and today count: a past session never reveals the guardians of children who left the group (review finding).
- **The assigned coach's window.** A coach assigned to the session from another group (the `self` match on `coach_person_id`) reads its contacts only until 24 hours after the session ends; the group's own coaches have no window — they reach the same guardians through any session.
- **The guard per request `em`.** The platform forks a fresh event manager into every request container and runs the module registrars after registering `em`, so `foundation/di.ts` registers the subscriber there (a `WeakSet` keeps it once per event manager); the CLI container goes through the same path, which the self-check proves.
- **Operator commands instead of a probe route.** TEST-G05's update and delete refusals are proven by `activities check-append-only` (a rolled-back transaction) and the log is read by `activities contact-access-log` — both useful to an operator for a data-protection request; no test-only HTTP route.
- **A registry-wide marker.** `isAppendOnlyEntity` reads `Symbol.for('vereino.appendOnly')` on the base prototype instead of `instanceof`, so a second copy of `@vereino/db` in a bundle still matches (review finding).
- **The pure parts in `lib`.** The guard's rule and the read order are pure (`foundation/lib`), because the services layer cannot load under Jest; the services wire them to the ORM, the error table and the platform log.
- **The mirror is not asserted end to end.** The platform access log is read per actor (the coach has no `audit_logs.view_self`); the mirror call is covered by the unit test of the order and is best effort by design (V-F08).

## Commands and results

- `yarn db:generate` against a throwaway `pgvector/pgvector:pg17-trixie` container (port 55443, explicit `DATABASE_URL`, removed afterwards; the generated `packages/app/.env` deleted): `activities: generated Migration20261031092710_activities.ts`, the other modules "no changes"; up, down, up as raw SQL there. A folder-wide formatter run had reverted the snapshot once; it was regenerated the same way (the duplicate migration discarded). No `yarn db:migrate`.
- `@vereino/db` tests 100 %; `foundation` and `people` lib Jest 100 % (136 tests in the two libs).
- `yarn test:integration:vereino --filter "TEST-052"` — the API test passed first; the page test failed once on a dark-mode contrast scan taken without a reload (fixed: each scheme on a fresh load) and once after the machine slept; then 2/2 passed.
- `yarn verify` 13/13 on `76e2a02`; full integration suite on that build — 81 passed (the guard on every request breaks no module).
- After the review fixes: `yarn verify` stopped at `format:check` (one file) and then at `lint` — on the generated Playwright HTML report a flaky run had left in `.ai/qa/test-results/html` (git-ignored; deleted); then the gate passed (13/13 on `79f8389`); `activities/` 21 passed, `people/` 25 passed on that build. `E02-S02` person pages was flaky once on the old build (passed on retry and in every other run).

## Review

`om-auto-review-pr` cannot submit an approving review of the automation's own PR (self-approval), so a fresh-context read-only reviewer ran: "request changes", nothing blocking, eight findings, all applied:

1. A past session revealed the guardians of children who had left the group, and an assigned coach kept access forever — now only children in the group today, and the assigned coach until 24 hours after the session.
2. The page cached the contacts (`staleTime: Infinity`, default `gcTime`), so a second view could be unlogged and show a withdrawn consent — now `gcTime: 0`: every view is a request and a log row.
3. The query retried failed reads, which could write up to three log rows per click — now `retry: false`.
4. TEST-052 did not cover the account rule or the assigned coach — the account rule is a pure filter in `people/lib/contact-sharing.ts` with a unit test (AC5), and TEST-052 reads as a coach assigned from another group.
5. A failed log write had no fingerprint — now logged as `foundation.audit.write_failed` and rethrown (uncoded 500).
6. The result replaced the focused button silently — now announced (`aria-live="polite"`).
7. `instanceof` would miss a second copy of `@vereino/db` — now a `Symbol.for` marker.
8. The run log's status and Progress — closed with this run.

## Progress

- [x] 1. P-28 base and guard
- [x] 2. P-27 auditedRead
- [x] 3. Entity, migration, directory reads, route
- [x] 4. Contacts section on the attendance list
- [x] 5. Tests and the gate
- [x] 6. Documentation
