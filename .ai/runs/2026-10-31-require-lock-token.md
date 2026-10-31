# Require the optimistic-lock token in every Vereino command (S5.2)

- **Date:** 2026-10-31
- **Agent / tool:** Claude Code (Opus 5.5), side session started from the review of PR #62; four read-only inventory subagents (one per module), the coordinator implemented, verified and committed
- **Trigger:** the review of PR #62 (coach attendance check-off, issue #33, epic #22) found that the platform's command lock check is a no-op when the client sends no token, which contradicts S5.2; #62 fixed only its own route (`attendance_version_required`)
- **Spec / issue / branch:** engineering standards S5.2, S6.8, S13.4 (`.ai/specs/2026-10-21-engineering-standards-and-patterns.md`); foundation spec P-02 (`.ai/specs/2026-10-27-vereino-foundation-primitives.md`); branch `fix/require-optimistic-lock-token` from `main` (`1806847`) in the worktree `C:\Users\wkuc\vereino-lock-token`
- **Status:** completed — PR open for human review, not merged

## Goal

Every Vereino update, delete or action on an existing record answers 400 without a lock token and 409 with a stale one, enforced once in `authorizeScoped` instead of route by route.

## Steps

1. Read S5.2, `authorizeScoped` and the platform's `optimistic-lock-command.ts`: `enforceCommandOptimisticLockWithGuards` → `assertOptimisticLock` returns silently when the expected token is missing or not a timestamp.
2. Inventory (four subagents, one per module): every `authorizeScoped` call classified by `loadTarget` / `lock` / mode; every route, non-HTTP caller, UI client and integration test that reaches an affected command. 37 affected commands (activities 7, club_core 12, groups 8, people 10). All routes pass `ctx.request`; every UI client already sends the token (`buildOptimisticLockHeader` or `CrudForm` deriving it from `initialValues.updatedAt`); no job, worker, CLI, subscriber or other module calls an affected command.
3. Foundation: new error code `lock_token_required` (400, en/pl); `authorizeScoped` reads the token (the spec's `expectedUpdatedAt` field, else the platform header), refuses a missing or unparseable one, then runs the platform compare.
4. Fixed the four real breaks the inventory found (below), the test fixtures, and the route docs.
5. Tests, gate, integration suites (results below).

## Decisions

- **Where the check runs:** after the scope check and the 404, before the platform compare — an out-of-scope caller still gets 403, so the 400 reveals nothing.
- **Malformed token = missing.** The platform skips an unparseable token as silently as a missing one (`String(undefined)` → `"undefined"`), so both answer 400.
- **Redo is exempt.** No Vereino handler defines `redo`, so the platform redo route replays `execute` with the redo request (no lock header). The audit undo/redo routes set `ctx.replayTransactionGuard`, an ordinary request never does; `authorizeScoped` treats that context as a replay (scope checked, token not required), which keeps today's redo behaviour. TEST-F01 now redoes an update.
- **A singleton's first save is exempt.** `club_core.settings.update` and the club logo create the settings row with its defaults (`ensureClubSettingsRow`) inside the first save, while the read answered `updatedAt: null`. New spec option `acceptsMissingToken(entity)`, evaluated on the row-locked target; club_core passes `untouchedSinceCreated` (`createdAt === updatedAt`). A token that is sent is still compared; a second first-save racing the first sees an edited row and needs the token. Not `lock: 'none'`, which would let any later tokenless save overwrite.
- **Import commit.** `people.imports.commit` runs `people.persons.update` nested with `request: undefined` (its header is the import's). `personUpdateSchema` gains the optional `expectedUpdatedAt` (S5.2 and ADR-006 already name it as the second channel) and the spec reads it; the commit passes each matched person's `updatedAt` from the plan it read in the same transaction (`ExistingPerson.updatedAt`, `planStoredImport` returns the directory), so a person edited meanwhile fails the commit with 409 instead of being overwritten.
- **`OM_OPTIMISTIC_LOCK=off` is not consulted** for the 400: S5.2 requires the token from every client, and no environment sets the variable (`.env.example`, `docs/ops/environments.md`).
- **Check-off (#62):** not on `main` yet, so this branch does not touch it. Its local check runs before the transaction and keeps answering 400 `attendance_version_required` as documented; with this change the foundation check behind it becomes redundant. Recommendation for whichever PR lands second: keep the route's documented code, or drop the local check and document `lock_token_required` instead (pre-deployment, so allowed in one PR with its consumers, `BACKWARD_COMPATIBILITY.md` §3).
- **Kept as they are:** every `lock: 'none'` command (`activities.attendance.declare`, the creates that load a parent, `people.persons.create_account`, the jobs).

## Files changed

- `packages/app/src/modules/foundation/services/authorize-scoped.ts`, `lib/error-codes.ts`, `i18n/{en,pl}.json`, `README.md` — the rule, the code, `acceptsMissingToken`, the redo exemption
- `packages/app/src/modules/club_core/commands/{shared,settings,logos}.ts` — `untouchedSinceCreated` on the settings and club-logo specs
- `packages/app/src/modules/people/{data/validators.ts,commands/persons.ts,commands/imports.ts,lib/import-rules.ts,services/import-directory.ts,lib/__tests__/import-rules.test.ts}` — `expectedUpdatedAt` on the person update; the import commit sends the planned version
- 27 route files in `activities`, `club_core`, `groups`, `people` — OpenAPI text names 400 `lock_token_required` (the guardian decision also the header and the 409)
- `packages/app/.ai/qa/tests/_fixtures/{members,attendance}.ts` — `updateClubSettings` reads and sends the current token; `guardianDecide` takes one
- `packages/app/.ai/qa/tests/{foundation/TEST-F01,club_core/TEST-001,activities/TEST-009,activities/TEST-011,groups/E03-S01-memberships-and-section-scope}` — missing/malformed token → 400 per module, redo, tokens for the guardian decision
- `.ai/specs/2026-10-21-engineering-standards-and-patterns.md` (S5.2 + Changelog), `.ai/specs/2026-10-27-vereino-foundation-primitives.md` (error codes + Changelog), `.ai/lessons/required-lock-token-redo-and-first-save.md` (new), `.ai/lessons/nested-commands-in-one-transaction.md`, `.ai/lessons.md`

## Commands and results

- `yarn verify` (first run): 10 steps green, then `test` failed — `foundation/lib/__tests__/error-codes.test.ts` lists every code and lacked `lock_token_required` (`Expected - 0, Received + 5`). Added the row; `yarn verify --from test`: test, test:scripts, build green.
- `yarn test:integration:vereino --no-build` (whole suite, every touched module plus journeys): **74 passed, 1 failed** in 24.3 min. The failure was the new redo step in TEST-F01: `{"error":"Forbidden","requiredFeatures":["audit_logs.redo_self"]}` (403). No Vereino role grants `audit_logs.redo_self` today (the test club's platform role has `view_self` and `undo_self`), so the test now grants it to that role before the redo, as E02-S02 does for `view_tenant`. The exemption stays: without it, a role that gets redo later would hit 400.
- `yarn test:integration:vereino --no-build --filter TEST-F01`: 1 passed (missing token 400, malformed token 400, redo 200).
- `yarn verify` (final full run, after the TEST-F01 fix): all 13 steps passed.
- Not rerun after the TEST-F01 fix: the other 74 integration tests (unchanged since their green run).

## Open problems

- PR #62's `attendance_version_required` versus `lock_token_required` (see Decisions).
- `activities.attendance.declare` (`lock: 'none'`) runs its own platform compare on an existing declaration with `expected: null`, so a re-declaration without a token still overwrites silently; S5.2 lists self-service declarations nowhere as exempt. Left as is per the task (deliberate `lock: 'none'`); worth a decision.
- `groups.memberships.update` (PUT) has no UI and no test.
- No Vereino role can redo (`audit_logs.redo_self` is not granted); whether staff should is a product decision.

## Next steps

- Human review of the PR; then reconcile the check-off code in whichever of #62 and this PR merges second.
