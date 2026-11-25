# Run: issue #633 — capacity test and per-club limits (E22-S07, many-clubs spec phase 5)

- **Trigger:** Cezar `vereino-issue` workflow, `om-auto-fix-issue 633` (unattended).
- **Issue / spec / branch:** #633; `.ai/specs/2026-11-22-vereino-many-clubs-one-instance.md` phase 5 (TEST-M08,
  TEST-M09, REQ-M07, REQ-M08); `feat/issue-633-capacity-test-and-limits`.
- **Approvals used:** owner comment 2026-11-23 (migrations of the phase, as defined in the spec; anything beyond is Ask
  First) and 2026-11-25 (run on cezar-ws in Docker, synthetic data, remove it afterwards, heavy load only when no
  other build runs; a pooler is Ask First, documenting the pool is not). No migration shipped.

## Steps

1. Claimed the issue (assignee, `in-progress`, 🤖 comment naming this worktree and branch).
2. **Limits** (`be4fa88c`): per-club request budget in the API dispatcher (`readClubRequestLimit`, 600/60 s,
   `VEREINO_CLUB_RATE_LIMIT_*`); route limits keyed by client and club slug (`routeLimitKey`); one import per club
   across the people import commit and the bank statement import (`holdClubImportSlot`, advisory try-lock, 409
   `import_running`, en/pl); each club's e-mail paced at 2/s after its queued mail (`paceClubEmails`,
   `enqueuePacedEmails`: rows get their send time, jobs a delay; the sweeper only spreads its jobs). Unit tests 100 %.
3. **TEST-M08** (`club_core/TEST-M08-club-limits.spec.ts`): two clubs, 200 e-mails of A and one of B in one drain, and
   A's import slot held from the test's own connection. The messaging probe now honours job delays (it drained every
   job at once, which a paced job cannot survive) and takes another club's scope per `enqueue` step.
4. **Capacity scripts** (`scripts/vereino-capacity-{lib,seed,load}.mjs`, 100 % unit coverage; the tests were written by
   a subagent and reviewed here): seed through `create-club` and the app's API; `peak` (open-model evening mix) and
   `burst` (all club jobs due at once).
5. **Capacity run** on cezar-ws in Docker: image build, Postgres 17 + Redis 7 + app/worker/CLI containers, 100 clubs
   seeded in 31 min, load at 20…50 req/s on one replica, 100 req/s on three behind nginx, the 06:00 burst, deploy
   timing. Report: `docs/ops/capacity.md`; cell runbook `docs/ops/cells.md`.
6. **Fix found by the run** (`d321cb55`): the #549 pool deadlock on `activities.attendance.declare` and
   `activities.attendance.mark` (scope prefetched before the write transaction).
7. Tore the stack down (containers, cache volume, network, images); deleted the state files holding the synthetic
   users' tokens.

## Decisions

- **Builder-stage image and SQLite cache for the test:** the runner stage cannot run `yarn mercato` (react resolution)
  and the Redis cache client fails in the Next bundle; both pre-exist on `main` and are reported as follow-ups, not
  fixed here (production image and platform cache are outside the phase).
- **No index added:** the only new cross-club read (`clubEmailBacklogUntil`) runs in 0.3 ms; a per-club index was
  generated, tried on the capacity DB, ignored by the planner, and removed with its migration.
- **No pooler:** documented the sizing rule instead (Ask First for new infrastructure).
- **Hot-path-only deadlock fix:** a generic prefetch in `authorizeScoped` changes every command; left as a follow-up.
- **`RATE_LIMIT_TRUST_PROXY_DEPTH`:** reported, not changed (production configuration is the owner's).

## Commands and results

- `yarn verify` — all 17 steps passed (after fixing `secrets:check`: random per-run seed password, allow-listed test
  fakes).
- `yarn test:integration:vereino --filter TEST-M08-club-limits` — 1 passed (2.5 min).
- Re-run of the dispatch tests touched by pacing (`--no-build`): TEST-M02-dispatch, TEST-M03-secrets,
  TEST-M04-templates, TEST-M01-audience, TEST-M04-club-email-links, TEST-M05-composer, TEST-M07-session-cancellation,
  TEST-A13, TEST-A15, J-003, ISSUE-628, E06-S01-people-list — all exit 0.
- Declaration/check-off tests after `d321cb55` (one build, then `--no-build`): TEST-009-coach-attendance-checkoff,
  TEST-009-declarations-and-policies, TEST-011-declaration-scope, TEST-F02-admin-guardian-declares-absence,
  E06-S16-today-declarations, TEST-014-member-declaration-ui, E03-S04-coach-attendance-ui — all exit 0.
- Final `yarn verify`: all 22 steps passed; `yarn guard`: no blocking findings.
- Capacity numbers: `docs/ops/capacity.md`.

## Problems and mistakes during the run

- Two `pkill`/`pgrep -f` calls on a pattern that also matched this run's own shell killed the shell (exit 144) and once
  the stepped load loop; reran the affected steps. Use the pid, never a pattern.
- Ran `docker volume prune -f` while tearing down: Docker 29 removes only unused anonymous volumes; the owner's and
  the family sandboxes' named volumes and containers were checked afterwards and are intact. Should not have run it.
- The first seed attempt aborted on a leftover half-created club; the seed now reports a failing club and goes on.

## Open problems / next steps

- Follow-ups for the five problems in `docs/ops/capacity.md` (production image CLI, Redis cache client, generic #549
  prefetch, per-request encryption-map/ACL reads, proxy depth).
- AC-M08 (targets met at 1,000 clubs) is not met by this run: 100 clubs measured, 1,000 extrapolated into cells.
