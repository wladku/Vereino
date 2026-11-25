# Run: #255 — spec L (people life cycle and data entry) to Ready for implementation

- **Goal and trigger:** unattended cezar run (task eeab479d) of `om-auto-create-pr`: record the owner decisions of 2026-11-16 on epic #255, fix the pre-implementation audit gaps (c1)–(c11), set `Status: Ready for implementation`. Docs only: no code, no migration file.
- **Spec:** `.ai/specs/implemented/2026-11-14-vereino-people-life-cycle-and-data-entry.md`. **Issue:** epic #255 ([audit](https://github.com/wladku/Vereino/issues/255#issuecomment-6899654561), [owner decisions](https://github.com/wladku/Vereino/issues/255#issuecomment-6910006611)). **Branch:** `docs/issue-255-spec-l-ready`.

## Steps

1. Read the spec, the two #255 comments, spec N (Ready; its Ask First table, dashboard widget table and phases 1–3 as the model) and the status of specs A, C, R (all `Draft`).
2. Checked the code facts the audit names, read-only:
   - `activities/api/declaration-links/route.ts:23`: `metadata.rateLimit` keyed per client IP;
   - the installed limiter: `RateLimiterService` registered as `rateLimiterService` by `@open-mercato/core/bootstrap`, `checkRateLimit(service, config, key, message)` in `@open-mercato/shared/lib/ratelimit/helpers`, already imported by `packages/app/src/app/api/[...slug]/route.ts`;
   - `auth.users.delete` (`auth/commands/users.ts`): removes sessions, role links, user ACL, reset rows, sidebar preferences, hard-deletes the user, enforces the protected-role floor; API keys hold their own roles and no Vereino role grants `api_keys.*`;
   - `authService.requestPasswordReset`: adds a 60-minute reset row and does not end earlier rows;
   - `people/commands/jobs.ts:69` (`people.persons.sync_roles`), `people/workers/sync-role-expiry.ts`, `registerModuleSchedule` in `people/services/club-setup.ts`;
   - `club_core/api/uploads.ts` (`readCheckedUpload`) versus `createScoped` in `club_core/commands/{logos,materials,place-files}.ts`;
   - `groups/api/memberships/route.ts` exports `GET`, `POST`, `PUT` only;
   - event ids in `groups`, `activities`, `club_core`, `facilities` `events.ts`; the widget `people.dashboard.sectionsWithoutCoordinator`;
   - spec N phase 1 still partly open (`overrides.nav.groupOrder` absent from `modules.ts`).
3. Edited the spec: status line; V-L01 fallback and *Closing an account* under *Proposed Solution*; the contributor table with undo and after-commit events; *Rate limits*; *Dashboard widgets*; naming fixes; *Cross-spec dependencies* and per-phase dependencies, story map, TEST-L20 per phase, the L8 step-5 guard; Ask First table with approval date and link per item; risks; compliance report and verdict; Q-L03…Q-L21 confirmed; Q-L01, Q-L02, V-L01 resolved.
4. Added `.ai/specs/changelog/2026-11-14-vereino-people-life-cycle-and-data-entry/2026-11-16-issue-255-ready.md`.

## Decisions

- **(c3) undo per contributor instead of "not undoable":** the owner confirmed Q-L20 (undoable until the last day) as written, so the contract gains `undo(em, subject, snapshot)`; an `activities` undo restores a coach only where the value is still the one the departure wrote.
- **(c4) `afterCommit(changes, ctx)`:** contributors write through `people`'s transaction, so they emit their own module's events and side effects after the commit; a failure there never rolls the departure back.
- **(c7) widget table here, not in N:** the task forbids editing other specs; this spec names the ids, feature, phase and N's row numbers 10–11 for N's next change.
- **Re-send links:** the approved fallback cannot end earlier links without importing the internal `PasswordReset` entity, so the spec no longer promises that (AC-L01, TEST-L01, vocabulary).
- **First life-cycle run:** so that no scheduled run precedes the owner's confirmation, existing clubs get the schedule from `mercato people life-cycle … --register-schedule` after the confirmed run; new clubs at setup.

## Files changed

- `.ai/specs/implemented/2026-11-14-vereino-people-life-cycle-and-data-entry.md`
- `.ai/specs/changelog/2026-11-14-vereino-people-life-cycle-and-data-entry/2026-11-16-issue-255-ready.md`
- `.ai/runs/2026-11-16-issue-255-spec-l-ready.md`

## Commands and results

See the PR description for `yarn spec-changelogs:check` and `yarn verify` results.

## Open problems / next steps

- Spec N's dashboard table needs rows 10 and 11 (follow-up on N).
- Specs A and C are being made Ready in parallel; their phases replace the fallbacks named in *Cross-spec dependencies*.
- S01, S02, S03, S07 and S09 can start; S05 waits for #118.
