# Run: issue #448 — E3 platform spike and ADR-001 checkpoint (E15-S04)

- **Goal and trigger:** Cezar run (task 8e9aede3) of `om-auto-fix-issue` on #448, queued by the `cezar` label. Run phase E3 of the engineering standards spec: one result, evidence and decision per E3 item, the RLS experiment (ENG-TEST-06), the production-build check (ENG-TEST-07), the club spec V-1 … V-12 results, and the ADR-001 checkpoint row for the owner.
- **Issue / branch:** #448 (epic #442), `docs/issue-448-platform-spike-security-builds`.
- **Spec:** `.ai/specs/2026-10-21-engineering-standards-and-patterns.md`, phase E3 (ENG-02, ENG-07; ENG-TEST-06, ENG-TEST-07; ENG-AC-07). Club spec `.ai/specs/2026-10-20-vereino-club-management.md` (V-1 … V-12).
- **Installed versions read:** `@open-mercato/*` 0.9.0, Next.js 16.3.6, PostgreSQL image `pgvector/pgvector:pg17-trixie` (the runner's).
- **Scope kept:** no security behaviour changed (headers, MFA, cookies, CSRF are E4), no product code, no platform file edited. No spike test is kept in the suite: ENG-TEST-06 needs the app to connect as a second database role, which the shared runner cannot do inside one run, so the experiment is recorded below as commands and outputs; ENG-TEST-07 is the existing suite, which already runs against a production build.

## Steps

1. Claimed #448 (assignee, `in-progress`, `🤖` claim comment naming this worktree and branch).
2. Read the E3 deliverables list and the V-1 … V-15 tables of the club, payments and facilities specs.
3. Two read-only subagents read the installed platform sources (auth/security; events, queue, extensions, OpenAPI, enterprise imports); their key claims were spot-checked in the source (`events/src/bus.ts` L655–684, `core/src/modules/auth/api/login.ts` L246–254, `shared/src/lib/auth/jwt.ts` L230–247).
4. `noUncheckedIndexedAccess` measured with `tsc --noEmit --noUncheckedIndexedAccess` in `packages/app` (after `yarn generate`).
5. RLS experiment (ENG-TEST-06) on a throwaway Testcontainers-style PostgreSQL (`docker run pgvector/pgvector:pg17-trixie`, own container and random port), `yarn initialize` as the owner role, `yarn build` (production), `yarn start` as a restricted role; flows exercised: sign-in, a CRUD route list and create, a background CLI process, a migration. Then the container and the app were stopped.
6. Wrote the results into this log, ADR-008, the spec's *Open Questions* and *Implementation Status*, the club spec's V table summary and two changelog entry files.

## E3 results

Each item: **result**, **evidence**, **decision**. Paths are relative to the repository root; `OM` = `node_modules/@open-mercato` (the installed `src/` copies).

### 1. Row-level security (ADR-008, ENG-TEST-06)

- **Setup:** role `vereino_app` `LOGIN NOSUPERUSER NOBYPASSRLS`, `SELECT/INSERT/UPDATE/DELETE` on all tables, usage on sequences. A second organization `Other Club` in the seeded tenant; one section in each organization. On `club_core_sections` (and later `club_core_places`): `ENABLE ROW LEVEL SECURITY`, a permissive `USING (true)` policy and a restrictive policy `organization_id = nullif(current_setting('vereino.organization_id', true), '')::uuid` (USING and WITH CHECK). The seeded owner role `vereino` is a superuser and owns every table (`rolsuper = t`, `rolbypassrls = t`), so it bypasses RLS.
- **Database level, as `vereino_app`:**
  - no context set (what every platform connection looks like) → `SELECT name FROM club_core_sections` returns **0 rows**;
  - context = own organization (`set_config(..., true)` in a transaction), query by the other organization's id → **0 rows**; without the filter → only `ENG06 own section`;
  - insert into the other organization under the own context → `ERROR: new row violates row-level security policy "eng06_org"`;
  - as the owner role → both rows (bypass).
- **Platform flows with the app connected as `vereino_app` (production build, `NODE_ENV=production`):**
  - **Sign-in:** `POST /api/auth/login` (form body) → 200 with cookies. Works (auth tables have no policy).
  - **CRUD route list:** `GET /api/club_core/sections` as the club administrator (granted by `yarn mercato people bootstrap-admin`, itself run as `vereino_app`, which succeeded) → `200 {"items":[],"total":0}` although the organization's own section exists. **Fails: the app's own rows are invisible.**
  - **CRUD route create:** `POST /api/club_core/sections {"name":"ENG06 created via API"}` → `500 DATABASE_ERROR`; log: `RowLevelSecurityViolationException: new row violates row-level security policy "eng06_org" for table "club_core_sections"`. **Fails.**
  - **Background process** (same process model as the queue workers and scheduler: a CLI process with `createRequestContainer()` and the shared pool): `yarn mercato club_core check-bookable-place --tenant … --org … --place <own place>` with RLS on `club_core_places` → as `vereino_app` `{"bookable":false,"status":404}`, as the owner `{"bookable":true}`. **Fails.**
  - **Migration:** with the latest `club_core` migration made pending (column dropped and its row removed as the owner), `yarn mercato db migrate` as `vereino_app` → `💥 Failed: must be owner of table club_core_contracts`; as the owner → `club_core: 1 migration applied`. Migrations need the owner role.
- **Cause:** the platform opens one MikroORM pool with one role (`OM/shared/dist/lib/db/mikro.js` L112–165: `clientUrl`, pool options, `driverOptions` with timeouts only) and never sets a per-request or per-transaction database setting: no `set_config`, `SET LOCAL`, `current_setting` or `ROW LEVEL SECURITY` anywhere in `OM/*/src` or `OM/*/dist`. CRUD reads run outside a transaction on pooled connections, so a session setting cannot be scoped to a request without changing platform-owned code (`getOrm`, the request container, `makeCrudRoute`, the query engine).
- **Decision: RLS rejected for 1.0.** Failing flows: the CRUD route list and create, and every background process. An organization-scoped policy needs the organization set on each connection per request, which only platform-owned code can do (a blocker by this spec's definition, but for defence in depth, which is not a required behaviour, so it is not counted in the ADR-001 checkpoint). The primary controls of ADR-008 stay: trusted scope, `makeCrudRoute` scope checks, `people.scopeService`, two-tenant tests on every route (S13.4), the raw-SQL rule (S5.8). Kept from the experiment for E4: production runs with a **non-superuser runtime role** that does not own the tables (no `BYPASSRLS` needed for anything the app does) and a separate **owner role for migrations** (pre-deploy step), because migrations fail without ownership. ADR-008 is updated.

### 2. DI under a production build (S4.8, ENG-TEST-07)

- **Result:** constructor parameter names survive because the server bundle is not minified: `packages/app/next.config.ts` sets `experimental.serverMinification: false` and `turbopackMinify: false`. The integration runner already runs the whole suite against a production build: `packages/app/scripts/vereino-ephemeral.mjs` runs `yarn initialize` then `yarn build` (`next build` with `NODE_ENV=production`) and `yarn start` (`buildAppEnv` sets `NODE_ENV: 'production'`). CI runs it on six shards for every PR and on `main`.
- **Evidence:** CI run 44697095628 on `main` at `146858ee` (2026-11-20): `integration (shard 1/6)` … `(shard 6/6)` and `integration` all `success`. This run's own production build (`yarn build`, exit 0) started and served sign-in, CRUD routes and the backend page; the DI container resolved `club_core` and `people` services in the server and in the CLI.
- **Decision:** passes, no fallback needed. Keep `serverMinification: false`; a change to it is a review item (it would break `InjectionMode.CLASSIC` resolution).

### 3. CSRF protection for cookie-authenticated JSON `POST` (S8.9)

- **Result:** no platform CSRF defence beyond the cookie's `SameSite=Lax`. No Origin/Referer check, token, required header or content-type check in the API dispatcher (`packages/app/src/app/api/[...slug]/route.ts`; it reads `content-type` only to pick up `tenantId`, L278); `packages/app/src/proxy.ts` excludes `/api/` from its matcher (L17); `next.config.ts` has no `serverActions.allowedOrigins`. Bearer (`Authorization: Bearer`) and API keys (`x-api-key`) are separate paths (`OM/shared/src/lib/auth/server.ts` L336–345, L413–415). The login route also accepts `application/x-www-form-urlencoded` (`OM/core/src/modules/auth/api/login.ts` L52, L66). The only Origin guard in the platform is route-specific (`sales/api/quotes/accept/originGuard.ts`).
- **Experiment:** with a valid cookie, `POST /api/club_core/sections` with `Origin: https://evil.example`, `Sec-Fetch-Site: cross-site` and `content-type: text/plain` (a "simple" request a cross-site form or `fetch` can send without preflight) reached the insert (it failed only on the RLS policy of the experiment). A browser does not attach a `SameSite=Lax` cookie to a cross-site `POST`, so cross-site attacks are blocked by the cookie attribute alone; same-site attackers (another subdomain of the same registrable domain) are not.
- **Decision:** not a blocker. E4 adds an app-owned check for cookie-authenticated `/api` mutations — reject when `Origin` (or `Sec-Fetch-Site`) is present and not the app's origin — in `src/proxy.ts` or a route wrapper, without platform edits, and keeps the app on a host where no sibling subdomain serves untrusted content. Open as ENG-Q-11 (choice of mechanism).

### 4. Session cookie attributes (S8.5)

- **Result:** cookies `auth_token` (JWT) and `session_token` (opaque refresh token), both `HttpOnly; Path=/; SameSite=lax`, `Secure` only when `NODE_ENV === 'production'` (`login.ts` L248–253, `session/refresh.ts` L105, L170–176, `profile/route.ts` L194–199). Observed on this run's production app: `auth_token=…; Path=/; Max-Age=28800; Secure; HttpOnly; SameSite=lax` and the same for `session_token`. Tenant/organization selection cookies `om_selected_tenant`, `om_selected_org`.
- **Decision:** matches S8.5 (`Secure`, `HttpOnly`, `SameSite=Lax`) in production. E4 checks that every deployed environment runs with `NODE_ENV=production` (staging included). No change.

### 5. Session lifetime and idle timeout (S8.5)

- **Result:** JWT lifetime 8 h, not configurable (`OM/shared/src/lib/auth/jwt.ts` L230, L241, L247). Server session: 8 h without "remember me", `REMEMBER_ME_DAYS` (default 30) with it (`login.ts` L181–185). No sliding or idle timeout: `refreshFromSessionToken` only checks `expiresAt` and never extends it (`OM/core/src/modules/auth/services/authService.ts` L125–133). Re-authentication: a password change requires `currentPassword` (`profile/route.ts` L46–53, L155–156); an e-mail change does not (L29–30). The enterprise `security` module has a "sudo" re-authentication challenge (commercial).
- **Decision:** gaps against the S8.5 targets — no idle timeout ≤ 30 min for staff, absolute lifetime 8 h (30 days with "remember me"), no re-authentication before an e-mail change. Not patched in platform code. Open as ENG-Q-12 for E4: accept 8 h absolute without idle timeout, hide or disable "remember me" for staff roles, and decide whether an e-mail change needs an app-level confirmation.

### 6. MFA support (S8.2)

- **Result:** core `auth` has no second factor (no `totp`, `webauthn`, `passkey` or `otpauth` in `OM/core/src`; it only understands MFA-pending tokens, `jwt.ts` L401–405). TOTP, passkeys and e-mail OTP live in the commercial enterprise `security` module (`OM/enterprise/src/modules/security/lib/providers/{TotpProvider,PasskeyProvider,OtpEmailProvider}.ts`; `OM/enterprise/LICENSE.md` L3), disabled in `packages/app/src/modules.ts` L68–70, L84–85.
- **Decision:** no MFA in 1.0 without a licence — ENG-Q-09's default stands; the owner decides ENG-Q-09.

### 7. `noUncheckedIndexedAccess` cost (S3.2)

- **Result:** `tsc --noEmit --noUncheckedIndexedAccess` in `packages/app` → 826 errors: 577 in 152 platform files under `node_modules/@open-mercato/*` (the app type-checks the platform's TypeScript sources), 6 in `.mercato/generated`, 243 in 87 Vereino files (`src/modules/payments` 16 files, `activities` 16, `people` 12, `facilities` 12, `club_core` 8, others fewer).
- **Decision:** not enabled in the app: it would need edits to platform-owned and generated files (the S3.2 condition). The shared packages keep it on (`packages/{core,db,ui}/tsconfig.json`). Reconsider only if the platform ships it.

### 8. PostgreSQL extensions required by enabled modules (S15.7)

- **Result:** no migration of an enabled module runs `CREATE EXTENSION` (searched `extension|pg_trgm|unaccent|pgcrypto|vector|citext` in the `migrations/` folders of every enabled core module and of `packages/app/src/modules/*`; the only match, `query_index/migrations/Migration20251030150038.ts`, is the column name `vector_indexed_count`; `gen_random_uuid()` is built into PostgreSQL 13+). At runtime the `search` module's pgvector driver tries `CREATE EXTENSION IF NOT EXISTS` for `pgcrypto` and `vector` and only warns when it cannot (`OM/search/src/vector/drivers/pgvector/index.ts` L172–174). The runner pre-creates `vector` and `pgcrypto` (`vereino-ephemeral.mjs` `POSTGRES_INIT_SQL`). The disabled `catalog` module would need extensions for accent-insensitive search.
- **Decision:** required extensions: none; optional: `vector` (+ `pgcrypto`) only if vector search is used. E4 may choose any PITR-capable PostgreSQL 17 image; vector search stays off unless the image provides `vector`.

### 9. Persistent events stored durably before dispatch (S5.7)

- **Result:** no. `emit(…, { persistent: true })` first delivers to inline subscribers, then enqueues (`OM/events/src/bus.ts` L657–684); nothing is written to the database and the enqueue is outside the command's transaction (commands emit after commit, `OM/shared/src/lib/commands/flush.ts` L121–122). No outbox exists. Queue: `QUEUE_STRATEGY=local` (default, a JSON file under `.mercato/queue/`, "not suitable for production", 3 attempts, payload dropped after the last) or `async` (BullMQ on Redis, 3 attempts, failed set capped at 1000) — `OM/queue/src/strategies/{local,async}.ts`. A crash between commit and enqueue loses the event; `local.ts` L97–99 says workflows needing no-loss "must write their own durable record before enqueueing".
- **Decision:** the S5.7 rule stays as written: every effect that must happen is recorded as state in the command's transaction and a scheduled sweep re-triggers it (the pattern payments and facilities already use, e.g. `payments:reconcile-checkouts`). No transactional outbox for 1.0. E4 runs production with `QUEUE_STRATEGY=async` (Redis), not the file queue.

### 10. Removing `@open-mercato/enterprise` (ADR-023, ENG-Q-10)

- **Result:** no installed non-enterprise package imports it (only comments in `communication_channels/lib/oauth-state.ts` L10 and `ui/src/backend/utils/optimisticLock.ts` L74 saying they must not; the CLI writes enterprise type paths only into generated manifests of standalone apps, `cli/src/lib/generators/extensions/agent-files.ts` L1111–1112). In the app: `src/modules.ts` names enterprise modules only behind `OM_ENABLE_ENTERPRISE_MODULES*` flags (default off), and **`src/modules/agent_examples/ai-agents.ts` L2 imports `@open-mercato/enterprise/modules/agent_orchestrator/lib/sdk/defineAgent` statically**. That module is registered only when the agents flags are on, so the build would not load it, but `yarn typecheck` covers all of `src/` and would fail. `packages/app/package.json` L78 lists `"@open-mercato/enterprise": "0.9.0"`. `.mercato/generated/*` has no reference.
- **Decision:** removal is feasible after deleting or moving the scaffold example module `agent_examples` (the one import). ENG-Q-10's default ("remove if unused") applies with that step; the removal itself is E4 work, with the owner's answer to ENG-Q-10.

### 11. `api_docs` OpenAPI file for a contract diff (S6.9)

- **Result:** yes, without a running server. `yarn generate` (`mercato generate all`, also run by `mercato init`) writes `packages/app/.mercato/generated/openapi.generated.json` (`OM/cli/src/lib/generators/openapi.ts` L4–6, L670, L773). This run's file: OpenAPI 3.1.0, 333 paths, 25 of them `club_core`. If bundling a route fails the generator falls back to regex extraction without request/response schemas (L710–716).
- **Decision:** the S6.9 condition is met and club routes exist, so the `oasdiff` contract diff against `main` can be added to the `gate`. That is a tooling change outside this spike (new tool: Ask First per ENG-Q-01's list, which did not name `oasdiff`); suggested as a follow-up issue.

### 12. Unhandled rejections and `no-store` (S15.2, S8.4)

- **Unhandled rejections — result:** neither the platform nor the app registers `process.on('unhandledRejection'|'uncaughtException')` (searched `OM/*/src`, `OM/*/dist`, `packages/`, `scripts/`; `packages/app/src/instrumentation.ts` has none). The Next.js server does: `next/dist/server/lib/router-server.js` L642–656 logs `uncaughtException` and registers `registerUnhandledRejectionListener` (`node-environment-extensions/process-error-handlers.js` L80–100), which logs `unhandledRejection:` and keeps the process alive. Worker, scheduler and CLI processes are plain Node: Node's default prints the stack to stderr and exits non-zero.
- **Decision:** both paths log before exit or continue, to stderr/stdout that the host captures; no local patch needed. Gap: these lines bypass `reportError` fingerprints (S15.2); E4 routes them when it chooses the telemetry backend (ENG-Q-05).
- **`no-store` — result:** pages rendered dynamically get Next.js's default `Cache-Control: private, no-cache, no-store, max-age=0, must-revalidate` (observed on `/backend`). API responses get **no** `Cache-Control` (observed on `GET /api/club_core/sections`, `POST /api/auth/login`); the dispatcher, proxy and `next.config.ts` `headers()` set none, except the two token pages (`next.config.ts` L149–162) and some app routes (`facilities/api/calendar/route.ts` L126, `facilities/api/reports/owner/route.ts` L41, L45).
- **Decision:** gap against S8.4 for authenticated API responses. E4 adds `Cache-Control: no-store` for `/api/:path*` in the app-owned `next.config.ts` `headers()` (no platform edit). Not a blocker.

### Club spec V-1 … V-12 (ENG-TEST-07)

Every item already has a recorded result from the phase verifications; none was missing. Index appended to the club spec's *Open Questions*:

| V | Result | Where |
|---|---|---|
| V-1 | confirmed, no fallback | club spec V table (2026-10-27) |
| V-2 | confirmed, no fallback | club spec V table (2026-10-27) |
| V-3 | confirmed, no fallback for search | club spec V table (2026-10-27) |
| V-4 | negative, fallback DD-16 | club spec V table (2026-10-27) |
| V-5 | resolved, DD-42 | payments spec V-5 (2026-11-03, #107) |
| V-6 | confirmed, no fallback | club spec V table (2026-10-27) |
| V-7 | negative, fallback DD-41 | facilities spec V-7 (2026-11-03, #120) |
| V-8 | partially confirmed, DD-G08/DD-G09 | club spec V table (2026-10-27) |
| V-9 | not needed, DD-G05 fallback | facilities spec V-9 (2026-10-27) |
| V-10 | partially confirmed, installed per-email limiter | club spec V table (2026-10-27); facilities spec (#120) |
| V-11 | partially confirmed, fallback (`preferred_locale`) | club spec V table (2026-10-27) |
| V-12 | partially confirmed, fallback DD-35 | club spec V table (2026-10-27); `AGENTS.md` exception D-024/D-026 already approved |

V-12 needs no new `AGENTS.md` exception: the S8.6 lookup is already in `AGENTS.md` (*Always*, D-024, D-026, D-027, DD-R13).

### S4.9 portability (reported for ADR-001)

124 non-test files in `src/modules/{club_core,people,groups,activities,communication,payments,facilities,foundation}/lib/` hold the domain rules; none imports `@open-mercato/*`, `@mikro-orm/*`, `react` or `next` (`grep -rln` over `*/lib/*.ts`), and the `lint` step enforces it (`eslint.vereino.mjs` `no-restricted-imports`).

### ADR-001 checkpoint

- **Key areas:** member/guardian auth — V-1, V-2 confirmed (no blocker; MFA absent but a commercial option, ENG-Q-09); tenancy and scope — V-12 fallback within the approved `AGENTS.md` exception, RLS rejected as defence in depth (no blocker: not a required behaviour); payments gateway — V-5 resolved (no blocker); member frontend pages — V-1 confirmed (no blocker); i18n — V-11 fallback in Vereino code (no blocker).
- **Counted key-area blockers: 0** (exit trigger: ≥ 2). **Upgrade cost:** 0 hours — still on 0.9.0, no upgrade run logs in `.ai/runs/`.
- **Proposal: keep Open Mercato for 1.0.** Gaps for E4, all closable in app-owned code or configuration: Origin check for cookie-authenticated mutations (ENG-Q-11), session lifetime and "remember me" for staff (ENG-Q-12), `no-store` on `/api`, `QUEUE_STRATEGY=async`, a non-owner runtime role plus an owner migration role, removal of `agent_examples` before removing the enterprise package (ENG-Q-10).
- **Owner decision:** open. Nothing here marks ADR-001 decided.

## Files changed

- `.ai/runs/2026-11-20-issue-448-platform-spike-e3.md` (this log)
- `.ai/specs/2026-10-21-engineering-standards-and-patterns.md` — ADR-008 decision; *Open Questions* ENG-Q-11, ENG-Q-12; *Implementation Status* E3 row
- `.ai/specs/2026-10-20-vereino-club-management.md` — E3 index under the V table
- `.ai/specs/changelog/2026-10-21-engineering-standards-and-patterns/2026-11-20-issue-448-e3-spike-and-adr-001-checkpoint.md`
- `.ai/specs/changelog/2026-10-20-vereino-club-management/2026-11-20-issue-448-e3-v-items.md`

## Commands and results

- `tsc --noEmit --noUncheckedIndexedAccess` (packages/app, after `yarn generate`): 826 errors, counts above.
- `docker run … pgvector/pgvector:pg17-trixie` (container `eng-test-06-8e9a`, random port) → `yarn initialize` exit 0 → `yarn build` exit 0 → `yarn start` with `DATABASE_URL` of `vereino_app`; outputs quoted above; app process group and container stopped afterwards.
- `yarn spec-changelogs:check` → valid. `yarn verify` → all 18 steps passed (first run).
- No integration test added or changed, so none was run locally for this PR; ENG-TEST-07's evidence is CI run 44697095628 on `main`.

## Problems and lessons

- A `pkill -f "<pattern>"` meant for a background `tsc` also matched this run's own shell (its command line contained the pattern) and killed it. Use the PID of the process you started (the rule is in the Cezar task instructions; no new lesson needed).
- `POST /api/auth/login` with a JSON body answered `400 Invalid email or password` for the seeded admin while the same credentials as a form body signed in; the fixtures use the form body. Not investigated further (outside the spike).

## Next steps

- Owner: decide ADR-001 ("keep" or "exit"), ENG-Q-09, ENG-Q-10, ENG-Q-11, ENG-Q-12.
- Follow-up suggestions: `oasdiff` contract diff in the `gate` (S6.9); E4 items listed in the checkpoint.
