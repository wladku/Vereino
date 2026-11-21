# Run: E18-S04 — outage and failed-backup alerts, monitoring and incident runbooks (#465)

- **Trigger**: Cezar run (`cezar` label on #465), skill `om-auto-fix-issue` with the vereino override.
- **Issue / spec**: #465 (epic #460); `.ai/specs/2026-10-21-engineering-standards-and-patterns.md` S15.1–S15.5, S15.9,
  S9.8, phase E4 slice (c), ENG-10, ENG-TEST-08.
- **Branch / worktree**: `feat/issue-465-outage-backup-alerts`, Cezar worktree `6bfa3a0b`.
- **Route**: `module-data` (foundation worker), `integration` (uptime vendor, heartbeat), `spec-pr` (delivery);
  Axis 3 `reuse-spec` — the covering spec and the issue define the work; no new spec.

## Steps

1. Claimed #465 (assignee, `in-progress`, 🤖 claim comment naming this run). #464 (backup job, E18-S03) is in progress
   in another run, so this story defines the log format and alert filter the backup job uses and leaves the job to it.
2. Read the health route, the start scripts, the worker, the platform logger (pino JSON with numeric levels on the
   server), the telemetry facade (`reportError` logs `Application error reported` only when a telemetry backend is
   active; `TELEMETRY_BACKEND=console` logs without exporting), and the platform queue's failure messages.
3. Checked Railway's docs (2026-11-20) through a web-fetch subagent: log search supports text, `@attr:value` and
   `@httpStatus` ranges; **no alert on a log match**; Monitors are Pro-only; project webhooks send deployment status and
   volume usage alerts; no log drain setting; Hobby keeps logs 7 days.
4. Measured `/api/healthz` on a production build (`yarn test:integration:vereino:start --port 5095`, then a second
   `next start` on 5390 with `CACHE_STRATEGY=redis` against a private `redis:7-alpine` container):
   - both up: 200 in 4 ms;
   - PostgreSQL stopped (refused): 503 in 7 ms;
   - PostgreSQL hung (`docker pause`): 503 in 1.504 s (`database healthcheck timed out`);
   - Redis stopped: 503 in 1.503–1.505 s (`redis healthcheck timed out`).
   All under the 2 s of the acceptance criterion; the route needed no change.
5. Added `packages/app/scripts/vereino-ops-signal.mjs` (backup outcome line with the alert token
   `vereino.ops.backup.failed`, URL redaction, heartbeat ping with `/fail`, CLI) and its tests, including the negative
   case (started/succeeded lines do not match the filter) and a check that `docs/ops/monitoring.md` names every filter
   and variable. The file matches the existing `scripts/vereino-*.mjs` coverage glob, so `test:scripts` needed no edit.
6. Added the worker heartbeat: `foundation/lib/worker-heartbeat.ts` (throttled, never throws) pinged from
   `foundation:dispatch-sweep` after each successful sweep, with unit tests.
7. Wrote `docs/ops/monitoring.md` (Railway facts, alert table per S15.5, checks, heartbeats, log filters, weekly digest,
   vendor candidates, owner checklist, ENG-TEST-08 owner procedure) and `docs/ops/incident.md` (severity, first steps,
   playbooks, rollback, restore outline, breach path with the 72-hour rule and the register, SLOs, postmortem).
8. `.env.example` lists the two optional variables; `BACKWARD_COMPATIBILITY.md` §8 names them and the alert token;
   spec S15.4 points at the heartbeat and `monitoring.md`; changelog file added; two lessons added.

## Decisions

- **Heartbeats instead of Railway log alerts** for the minute-level alerts: Railway has no log-match alerts and
  Monitors need Pro (ENG-Q-03 chose Hobby). The uptime monitor already chosen by ENG-Q-05 carries HTTP and heartbeat
  checks; the log lines stay as tested, documented signatures. Raised for the owner on the issue and the PR.
- **Variable names** `VEREINO_OPS_*`: BC §8 requires the `VEREINO_` prefix for Vereino variables. Both are optional and
  additive (no breaking change).
- **Worker signal through `foundation:dispatch-sweep`**: it runs every 2 minutes per club through scheduler, queue,
  worker and PostgreSQL, so one successful run proves the whole path; throttled to one ping a minute per process.
- **Helper in `packages/app/scripts/`** (not root `scripts/`): it is covered by the existing coverage glob, so the
  parallel #464 PR, which will also add tooling scripts, does not conflict on the `test:scripts` line.
- **`TELEMETRY_BACKEND=console`** recommended so `reportError` fingerprints reach the logs without a tracing backend.

## Files changed

- `docs/ops/monitoring.md`, `docs/ops/incident.md` (new)
- `packages/app/scripts/vereino-ops-signal.mjs`, `packages/app/scripts/__tests__/vereino-ops-signal.test.mjs` (new)
- `packages/app/src/modules/foundation/lib/worker-heartbeat.ts`, `.../lib/__tests__/worker-heartbeat.test.ts` (new)
- `packages/app/src/modules/foundation/workers/dispatch-sweep.ts`
- `packages/app/.env.example`, `BACKWARD_COMPATIBILITY.md`
- `.ai/specs/2026-10-21-engineering-standards-and-patterns.md` (S15.4), changelog file
- `.ai/lessons/railway-hobby-has-no-log-alerts.md`, `.ai/lessons/docker-stop-start-moves-testcontainers-port.md`

## Commands and results

- `yarn test:scripts` — 232 tests pass; `vereino-ops-signal.mjs` 100 % lines, branches, functions.
- `yarn workspace @vereino/app jest src/modules/foundation/lib/__tests__/worker-heartbeat.test.ts` — 6 pass.
- `yarn spec-changelogs:check`, `yarn lessons:check` — valid.
- `yarn verify` — first run failed at `lint` (two `@typescript-eslint/require-await` errors in `worker-heartbeat.test.ts`: async mocks without `await`); fixed with `Promise.resolve`/`Promise.reject`; `yarn verify --from lint` then a full `yarn verify`: all 18 steps pass.
- Integration tests: none added or edited; the worker change is a no-op without the variable, and the route was
  measured by hand (step 4).

## Problems met

- `docker stop`/`start` of the Testcontainers PostgreSQL moved its host port (32998 → 32999); the first instance then
  pointed at a dead port. Switched to `docker pause` for the hung case (lesson
  `docker-stop-start-moves-testcontainers-port`).
- A `pgrep -f` on a pattern that appeared in the shell's own command line killed that shell (exit 144); processes were
  then stopped by pid only.

## Open items / next steps

- Owner: accept the heartbeat reading of ENG-Q-05 or choose Pro / a log vendor for the digest-only alerts; choose the
  vendor; follow the checklist in `docs/ops/monitoring.md`; run ENG-TEST-08 on staging (owner part of the acceptance
  criteria).
- #464: write the backup outcome with `node packages/app/scripts/vereino-ops-signal.mjs backup.<started|succeeded|failed>`
  and set `VEREINO_OPS_BACKUP_HEARTBEAT_URL`.
- Later: `rollback.md`, `restore.md`, `environments.md`, `postmortem-template.md` of S15.9 belong to the other E18
  stories.
