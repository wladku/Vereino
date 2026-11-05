# Run — personal declaration links and reminders (#105, E06-S23)

- **Date:** 2026-11-05
- **Trigger:** cezar task `om-auto-fix-issue 105` (unattended)
- **Issue:** #105 — E06-S23 — A guardian without an account declares attendance from a personal link and gets reminders
- **Spec:** `.ai/specs/2026-10-20-vereino-club-management.md` (phase 3 step 5; REQ-017, AC-017, TEST-017) with `.ai/specs/2026-10-27-vereino-foundation-primitives.md` (phase C step 2; P-02, P-03, P-19, TEST-F07's declaration oracles); UX concept M-13, M-14, F-06. Approval: D30 (owner comment on #105, 2026-11-04 — "the token-link migrations are approved"); #157 (P-10) merged first.
- **Branch:** `feat/issue-105-declaration-links`

## Goal

A guardian without an account (or not signed in) asks for a personal link from the public session page, gets it by e-mail, and declares attendance for their children in that session without signing in; the evening job reminds families of tomorrow's undeclared sessions.

## Steps

1. Route: feature with a covering spec → feature route; FR triage: no `/club/link`, `/club/d/[token]` or `declaration-links` code on `main`; #157 merged (3925fe4); no open PR referencing #105. Claimed #105 (assignee, `in-progress`, 🤖 comment); branch renamed from `cez/105`.
2. Foundation: P-03 `scopeContract.resolveForPerson` + `ScopeProvider.grantsForPerson` (people's `scopeService` implements it with `loadPersonScope`); P-02 `authorizeScoped` scope source `{ token: { personId, tenantId, organizationId } }`.
3. `activities`: entity `DeclarationToken` (`tokenLinkColumns({ use: 'until_expiry' })`), migration `Migration20261105110214_activities` from `yarn db:generate` (offline against the module snapshot) plus a `down`.
4. Pure rules `lib/declaration-links.ts` (address match, expiry, whom a link declares for, request owners, reminder owners, paths, keys, the e-mail date line) with unit tests (100 %).
5. `commands/attendance.ts`: the declaration rules after the scope check moved into `writeDeclaration`, shared by `activities.attendance.declare` and the new `activities.attendance.declare_by_link` (`commands/declaration-links.ts`), plus the job command `activities.declaration_links.send_reminders`.
6. `services/declaration-links.ts` (request, page read, issue + dispatch in one transaction, reminders), e-mail template `activities.declaration_link`, DI (`activities.declarationLinks`, template, notification types), routes `POST /api/activities/declaration-links`, `GET`/`POST /api/activities/declaration-links/{token}`, worker `activities:send-declaration-reminders`, its schedule (setup + time-zone re-registration), CLI `send-declaration-reminders`, error code `declaration_link_not_found`.
7. `@vereino/ui`: `TokenPageShell`, `DeclarationControls` and its model, unit tests (100 %).
8. Pages `/club/link` (M-13) and `/club/d/[token]` (M-14); "Send me a link" on the public session page; en + pl catalogs.
9. Integration test `activities/TEST-017-declaration-links.spec.ts` with `_fixtures/declaration-links.ts`.
10. Spec notes and changelogs (club spec phase 3 step 5 + API row; foundation phase C step 2), module READMEs.

## Decisions

- **The request carries the club slug.** The spec's body was `{ email, occurrencePublicRef }`; finding the session by id alone would be a second system-scope lookup outside DD-35. The public page's URL already has the slug, so the club is found by the approved slug lookup and the session inside it. Spec API row updated.
- **No address lookup hash.** `people_persons.email` is encrypted without a hash. The request compares addresses in memory over the session's family only (participants on the session date and their active guardians, via the contact resolver), so no migration on `people` and no club-wide decryption.
- **No enumeration.** Every well-formed request answers the same 202 body after at least one second; a failure inside is reported to telemetry and answered the same way. At most 3 links per person and session per hour (the request cannot flood a mailbox); 10 requests per 15 minutes per IP.
- **Grants recomputed, never stored.** The link's subject is the person it was sent to; the page lists and the command accepts only participants within that person's current `self` / `guardian` grants (an ended guardianship loses access). A link acts as `self` or `guardian` only, never as staff, even when the person is a coach.
- **Raw token out of `action_logs`.** `declare_by_link` takes the token in its input, so its audit entry is `replayable: false` (no command payload, no undo token) and the command is not undoable.
- **Reminders for `confirm` sessions only.** An `absence_only` session (a training) counts silence as "expected" (D-022), so a reminder there would be noise; the reminder goes to guardians of each undeclared participant, or the participant without a guardian, one dispatch key per person and session (the token issued in the same transaction is rolled back when the key was already used).
- **One link per request.** Earlier links stay valid until they expire (only the hash is stored, so an earlier link cannot be re-sent).
- **404 copy.** P-19 says "not found: same copy as expired"; the issue's acceptance names 404 "Invalid link", so the two states have their own copy and both offer a new link.

## Files changed

See the PR diff: `packages/app/src/modules/foundation/{index.ts,services/authorize-scoped.ts,services/scope-contract.ts}`, `packages/app/src/modules/people/services/scope-service.ts`, `packages/app/src/modules/activities/**` (entity, migration, snapshot, lib, commands, services, emails, routes, pages, components, worker, CLI, setup, subscriber, i18n, README), `packages/ui/src/{index.ts,member/*,__tests__/*}`, `packages/app/.ai/qa/tests/{_fixtures/declaration-links.ts,activities/TEST-017-declaration-links.spec.ts}`, the two specs.

## Commands and results

- `yarn db:generate` → `activities: generated Migration20261105110214_activities.ts`, other modules no changes.
- `npx jest src/modules/activities/lib/__tests__/declaration-links.test.ts --coverage` → 100 % lines, branches, functions of `declaration-links.ts`.
- `yarn workspace @vereino/ui test` → 108 tests pass, 100 % coverage (new `declaration-controls*.ts(x)`, `token-page-shell.tsx`).
- `yarn workspace @vereino/app typecheck`, `yarn workspace @vereino/ui typecheck`, `lint` (app files, ui) → clean after fixes (lint first flagged `FormEvent`, void-returning arrows, an unnecessary assertion and a non-exhaustive switch).
- `yarn test:integration:vereino --filter TEST-017` — four failing runs before green, each a test defect, not a product one:
  1. `POST /api/people/guardianships {"error":"This guardianship has ended; its consents can no longer be changed.","code":"guardianship_ended"}` — an ended guardianship cannot be created with consents; the test now creates it and ends it through `POST /api/people/guardianships/{id}/end`.
  2. `expect(audit.every((entry) => entry.command_id === 'activities.attendance.declare_by_link')).toBe(true)` → false — `action_logs.command_id` is encrypted at rest (the three rows were there, without actor and undo token).
  3. `expect(entries.map((entry) => entry.commandId)).toEqual(...)` → `[]` — the audit API shows only the caller's own entries, and a link entry has no actor.
  4. Final: the stored rows are asserted by their plain columns (`actor_user_id` null, no `undo_token`, no `command_payload`) → `1 passed (1.5m)`, including the reminder CLI (`processed: 2`, rerun `processed: 0`) and the browser walk.
- `yarn verify` → first run failed at `lint` (`'nextWeekday' is defined but never used` in TEST-017); fixed, `yarn verify --from lint` → all 9 steps passed; the final full `yarn verify` → all 13 steps passed (generate, typecheck ×3, lint, format:check, ds:check, i18n:check-hardcoded, contracts:check, lessons:check, test, test:scripts, build).

## Lessons

- `action-log-columns-encrypted-at-rest` updated with this run's case (a `LIKE` search for a secret over ciphertext is vacuous; actorless entries are invisible through the audit API) and, as the second occurrence, promoted to an `AGENTS.md` Never rule.

## Open problems

- Existing clubs get the `activities:send-declaration-reminders` schedule only when `setup.ts` runs again or their time zone changes (the re-registration subscriber); a deployment with live clubs needs one run of the module setup.
- The request's minimum response time evens out the answer time, not the database load; a determined observer of server metrics is out of scope.

## Next steps

- Review and QA on the PR (UI: `/club/link`, `/club/d/[token]`, the public session page's new section).
- J-003 step 3 can now be automated with the link request (club spec phase 3 exit gate).
