# Run log — issue #738: rate limits on sign-in, password reset and every sessionless route

- **Goal and trigger**: Cezar run of `om-auto-fix-issue 738` (label `cezar`, 2026-11-25). E25-S04 of epic #734.
- **Issue / spec / branch**: #738; covering spec: engineering standards S8.6
  (`.ai/specs/2026-10-21-engineering-standards-and-patterns.md`, changelog file
  `2026-11-25-issue-738-sessionless-rate-limits.md`); branch `feat/issue-738-rate-limit-sign-in-reset`.
- **Route**: feature (enhancement). There was no separate feature spec, because S8.6 already sets the limits and the issue names the
  inventory's place (`docs/compliance/asvs-checklist.md`), so the run reused S8.6 instead of writing a spec.

## Findings (installed platform 0.9.0)

- `RATE_LIMIT_TRUST_PROXY_DEPTH` defaults to 0, so `getClientIp()` answers null and every client shares the fallback
  key `global`. `RATE_LIMIT_STRATEGY` defaults to `memory`, and the limiter reads only `REDIS_URL`.
- Platform sign-in: 20 / min per client plus 5 / min per client and address. Password reset: 10 / min per client plus
  3 / min per client and address. Reset confirm and validate: per client. Nothing per account across clients.
- With `redis`, an unreachable store is absorbed by the in-memory insurance limiter and nothing is logged. `degraded`
  is set only when that fallback fails too.
- `OM_INTEGRATION_TEST=true` (integration runner) switches the limiter off. The auth opt-in header
  (`x-om-test-rate-limit: on`) only skips the auth bypass and cannot enable it. No 429 was integration-tested.
- Every Vereino sessionless route except `GET /api/foundation/identity/providers` already had a per-client
  `metadata.rateLimit`. No route had the S8.6 per-token or per-address layers, except the facilities booking request
  (per address).

## Decisions

1. **Per-client limits stay in `metadata`** (counted by the API dispatcher). The dispatcher and the server path of
   public pages take the limiter from `foundation/services/sessionless-limits.ts`. That resolver hands an integration
   request carrying the opt-in header an enabled process-local limiter. The tests therefore go through the production
   code path, not a test-only branch.
2. **Per-subject layers in the handlers**:
   - Token routes: 60 / min read, 30 / min write per token hash.
   - Personal-link requests: 3 / hour per address hash *within a club* (the issue's "per client and per club"). These
     routes must keep their uniform 202 (S8.6, no enumeration), so over the limit the e-mail is skipped silently
     rather than answered with 429.
3. **Sign-in and password reset get a per-account layer** (10 / 15 min, 3 / hour) in front of the platform handlers.
   They are Next routes, like the existing `src/app/api/auth/login/route.ts`. The new `src/app/api/auth/reset/route.ts`
   is needed because a UMES interceptor cannot set `Retry-After`. A successful sign-in clears the account's counter.
4. **Boot check**:
   - Refuses an invalid strategy or depth anywhere.
   - Requires `REDIS_URL` with the `redis` strategy.
   - On Railway (`RAILWAY_ENVIRONMENT_NAME`), refuses `memory`, `RATE_LIMIT_ENABLED=false` and `OM_INTEGRATION_TEST`.
   - Only *warns* about an unset or zero proxy depth: the depth must be measured on the running environment, and a
     refusal would block the very deploy that measures it.
   - The Railway start scripts default `RATE_LIMIT_STRATEGY=redis`.
5. **Logging without personal data**:
   - A refusal logs only the key prefix.
   - An unresolved client address behind a proxy logs once per `X-Forwarded-For` entry count, which is the
     measurement.
   - A Redis outage logs once per outage (`rate-limit-store-watch`, its own connection, started from
     `instrumentation.ts`).

## Files changed

- Foundation:
  - `lib/sessionless-limits.ts` (+ unit tests, 100 %)
  - `services/sessionless-limits.ts`
  - `services/rate-limit-store-watch.ts`
  - `services/public-route-load.ts`
  - `index.ts`
  - `api/identity/providers/route.ts` (120 / min)
- Token layers:
  - `activities/api/declaration-links/[token]`
  - `payments/api/order-links/[token]`, `…/orders`, `…/orders/[id]/cancel`
  - `facilities/api/public/rentals/cancel`, `…/cancel/preview`, `…/requests/verify`
- Per-address layers: `activities/api/declaration-links`, `payments/api/public/order-campaigns/[id]/link-request`.
- Platform-owned files (local patches, rows in `CONTRIBUTING.md`):
  - `src/app/api/[...slug]/route.ts`
  - `src/app/api/auth/login/route.ts`
  - `src/instrumentation.ts`
  - `.env.example`
  - `scripts/railway-start.sh`, `scripts/railway-worker.sh`
- New Vereino file: `src/app/api/auth/reset/route.ts`.
- Boot check: `scripts/vereino-boot-env.mjs` (+ tests, 100 %).
- Docs:
  - `docs/ops/deploy.md` (variables, *Rate limits* runbook)
  - `docs/compliance/asvs-checklist.md` (V2.4 met, V6.1 row, route inventory, open item A-6)
- Project memory: the spec changelog file, lesson `rate-limits-need-proxy-depth-and-test-opt-in`, this log.

## Commands and results

- `node --test --experimental-test-coverage scripts/__tests__/vereino-boot-env.test.mjs` (packages/app): all pass;
  100 % lines, branches and functions.
- `npx jest src/modules/foundation/lib/__tests__/sessionless-limits.test.ts --coverage`: 11 passed, 100 %.
- `yarn typecheck` (after `yarn generate`): no errors.
- `npx eslint` on the changed files: 0 errors. The 3 warnings are in files this run did not change.
- `yarn test:integration:vereino --filter ISSUE-738`: 4 passed (sign-in 11th attempt 429; reset 4th 429; club_core,
  facilities, activities, payments and foundation families 429 with `Retry-After`; link request stays 202).
- `yarn verify` and the integration tests of the changed routes: see the steps below.

## Open problems / next steps

- **Staging acceptance (owner or a run with Railway access, after merge)** — ASVS open item A-6:
  1. Measure the proxy depth on staging (`docs/ops/deploy.md` → *Rate limits*).
  2. Set `RATE_LIMIT_TRUST_PROXY_DEPTH` on staging and production.
  3. Record in a run log that two clients have separate sign-in counters and that counters survive a redeploy.

  This run has no Railway access, and the code is not deployed before merge.
- The platform dispatcher's `requestRateLimited` lifecycle event carries `clientIp` (platform behaviour). Vereino's
  own log lines carry none.
