# Review of the foundation specs, and the blocker fixes

- **Date:** 2026-10-27
- **Agent / tool:** Claude Code (Opus 5.5), interactive, with three read-only fresh-context review subagents (contradictions, anti-patterns and platform fit, unnecessary complexity)
- **Trigger:** product owner — "Przejrzyj tę specyfikację i znajdź niespójne albo wzajemnie wykluczające się rozwiązania projektowe. Sprawdź, czy nie ma w niej antywzorców i niepotrzebnej złożoności." (both foundation specs), then "popraw blokery 1–7 i DD-20 (DD-20 w PR #43, reszta na osobnej gałęzi). Cięcia i RODO zostaw do mojej decyzji."
- **Spec / issue / branch:** `.ai/specs/2026-10-27-vereino-foundation-primitives.md` (foundation I), `.ai/specs/2026-10-27-vereino-foundation-scheduling-primitives.md` (foundation II); DD-20 on `docs/foundation-ii-spec-to-main` (PR #43); the blockers on `docs/foundation-review-blockers`, branched from PR #43's head because foundation II exists only there
- **Status:** completed — blockers applied; the simplification cuts and GDPR retention are left for the owner

## Goal

Find contradictions, mutually exclusive decisions, anti-patterns and needless complexity in both foundation specs before the owner approves them for #38, and fix what blocks `Ready for implementation`.

## Steps

1. Three subagents reviewed both specs against the club, facilities, payments and social sign-in specs, `AGENTS.md`, the engineering standards and the installed `@open-mercato/*` 0.9.0 source. Each reported independently.
2. The coordinator re-checked the main claims in the spec text and the installed source: `auth/commands/users.ts` `syncUserRoles` removes every role missing from the desired list; `assertOptimisticLock` compares in memory and is a no-op without a token; the command bus keeps only `{ before }` from `prepare`; `CommandHandler` offers `authorizeReplay` and `atomicReplay`; `hashAuthToken` is HMAC; `authService` redeems reset tokens with a conditional update.
3. One finding rejected: "foundation II holds back phase 2 work (units report, substitutions)" — the owner's A05 holds them back; only the club spec's wording differs.
4. DD-20 fixed on PR #43 (commit `57ba964`): the phase 5 mutation guard on session save could not protect a booking saved over a session; the guard is replaced by the `vereino.occupancyProvider` on session preview and save (intervals with a `reason`) plus `facilities`' own commands for bookings, closures and maintenance over sessions; V-9 no longer needed.
5. Blockers 1–7 applied on `docs/foundation-review-blockers` with one scripted edit pass (every replacement asserted to match exactly once), then an id audit.

## Decisions

- **Role sync (blocker 1):** desired roles = the user's roles outside `vereino_*` ∪ the active assignments' roles ∪ the derived `vereino_member` / `vereino_payer`; per-user advisory lock; the daily job recomputes every account (club-sized, set comparison makes it a no-op), which also covers assignments that start later and 18th birthdays.
- **Command kernel (blocker 2):** `prepareScoped` renamed `authorizeScoped` and moved into `execute` with the transactional `em`, a `PESSIMISTIC_WRITE` row lock and `enforceCommandOptimisticLockWithGuards`; `acting_role` in the log's `context`; undo/redo through `authorizeReplay` + `atomicReplay` (DD-F18). The rename is deliberate: the helper no longer runs in `prepare`, and the old name would mislead every consumer.
- **List scope (blocker 3):** `scopeWhere(scope, kinds, columnMap)` in `@vereino/core`, fail closed, for `makeCrudRoute` `list.buildFilters`; the checklist line names the three helpers.
- **Token links (blocker 4):** a hash column and a use policy (`single` / `until_expiry`) per table, one hash scheme (`hashAuthToken`), `peek` on GET, `redeem` by compare-and-set, grants recomputed at redemption through `resolveForPerson`, no `purpose` column; P-10 moves to a new phase C with the club spec's phase 3 declaration link (REQ-017).
- **P-12 (blocker 5):** one owner — specified in foundation II (DD-G07), built in foundation I phase A1 with `people:sync-role-expiry`.
- **Placement (blocker 6):** ORM- and DI-bound helpers in `foundation/services/`; the error factory bound in each module's `api/errors.ts`; 100 % unit coverage for `lib/**` and the packages; the boundaries lint allows `services/**` and `setup.ts`.
- **Job scope (blocker 7):** a `system_job` grant and the `system` acting role, from the sanitised registration scope; the marker source reads `ctx.auth.sub` only.
- Not applied, by the owner's instruction: the simplification cuts (P-10 deferral, the audited-read stack, the occupancy provider, held-back grant kinds, people-only helpers, early shared UI) and GDPR retention / consent history.

## Files changed

- PR #43: `.ai/specs/2026-10-27-vereino-facilities.md`, `.ai/specs/2026-10-27-vereino-foundation-scheduling-primitives.md`, `.ai/specs/2026-10-20-vereino-club-management.md` (DD-20)
- This branch: `.ai/specs/2026-10-27-vereino-foundation-primitives.md`, `.ai/specs/2026-10-27-vereino-foundation-scheduling-primitives.md`, `.ai/specs/2026-10-27-vereino-social-sign-in.md` (rename, `execute`), `.ai/specs/2026-10-20-vereino-club-management.md` (reuse row, role events rows, declaration token hash), `.ai/specs/2026-10-27-vereino-club-payments.md` (order-link hash), `.ai/lessons/retarget-stacked-pr-before-merge.md` + `.ai/lessons.md`, this log

## Commands and results

- Read-only greps and reads of `packages/app/node_modules/@open-mercato/{shared,core}/src/**` (command bus, `CommandHandler` types, optimistic lock helpers, `auth` users commands, `authService`, `tokenHash`).
- Scripted id audit: foundation I — every REQ-F in Goals traced and vice versa, every referenced TEST-F and AC-F defined except the documented moved ids (TEST-F12, F13, F15; AC-F15), no duplicate DD-F, 0 `TODO`; foundation II — clean.
- `git diff --check` clean. `yarn verify` not run: Markdown under `.ai/` only; CI runs the gate.

## Open problems

- Owner decisions: the simplification cuts and GDPR retention of append-only logs and consent history (consent withdrawal in the undo log).
- Non-blocking review findings left as they were: a notification sent inside the transaction (foundation II DD-G12 flow), `createAccount` atomicity and the invitation locale, organizations created after `seedDefaults` missing their schedules, validity and RRULE time zone (`DTSTART`/`TZID`), grant kinds used as a role guard for `reopen`, the undeclared `club_core.settings.updated` event, the two `advanceWhere` descriptions, the remaining stale club spec rows (`audit_logs` for DD-39, `section_ids`), the social spec's 503.
- Historic Changelog rows of the three specs now read `authorizeScoped` because the rename ran over the whole files; the new rows record the rename.

## Next steps

- The owner reviews this branch's PR, decides the cuts and GDPR items, then approves foundation I so `om-auto-fix-issue 38` can build phase A1.
- Merge PR #43 first; this branch is based on it.

## Lessons recorded

- `retarget-stacked-pr-before-merge` — PR #42 was merged into its stacked base `docs/foundation-spec` after that base had already been merged, so the work never reached `main`.
