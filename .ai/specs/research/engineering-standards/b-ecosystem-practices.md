# B. Ecosystem practices for the Vereino stack (research notes, 2026-10-21)

Scope: club-management app on Open Mercato 0.9.0. Stack is FIXED (Node 24, Yarn 4 workspaces with
`nmHoistingLimits: workspaces`, Next.js 16.3 App Router, React 19.2, TypeScript 6 strict, MikroORM 7 +
PostgreSQL 17 (pgvector image), Awilix 13, Zod 4, Tailwind 4 + shadcn/ui via `@open-mercato/ui`, Jest 30
(ts-jest, CJS transform) + Playwright 1.58, ESLint 9 flat config, Docker node:24-alpine, Railway, Redis,
OpenTelemetry via `@open-mercato/telemetry`, Stripe via `@open-mercato/gateway-stripe`, Resend-style email).

Legend: **[official]** = vendor/standard docs or release notes; **[secondary]** = engineering blog / community;
**[opinion]** = my judgement, not sourced. Dates are publication / lastUpdated dates where the page states them,
otherwise the fetch date (2026-10-21). Nothing here was verified against the Open Mercato source; where the
platform already provides a mechanism, the note says "use the platform's X" rather than re-inventing it.

---

## 1. TypeScript 6 strict config + ESLint 9 flat config + formatting

### Recommended practice
- Base `tsconfig.base.json` at repo root; each workspace `extends` it. Keep the TS 6 defaults (do NOT set
  `strict: false`): `strict`, `noUncheckedSideEffectImports`, `module: esnext`, `target: es2025`, `types: []`
  are now the defaults — add `"types": ["node"]` (and `"jest"` in test configs) explicitly, because `types`
  no longer auto-loads everything.
- Add on top of `strict`: `noUncheckedIndexedAccess: true`, `exactOptionalPropertyTypes: true`,
  `noImplicitOverride: true`, `noFallthroughCasesInSwitch: true`, `useUnknownInCatchVariables` (in strict),
  `verbatimModuleSyntax: true`, `isolatedModules: true`, `skipLibCheck: true`, `moduleResolution: bundler`
  for the Next.js app and `nodenext` for Node-only packages (CLI, workers, telemetry).
- `erasableSyntaxOnly: true` for packages that may run under Node's type stripping (Node 24 strips types
  natively); it forbids `enum`, runtime `namespace`, parameter properties and `import =`. Pair it with
  `verbatimModuleSyntax` as Microsoft recommends. Do NOT enable it where MikroORM decorators/entities use
  parameter properties, or decide to write entities with `defineEntity` (decorator-free) instead.
- `isolatedDeclarations: true` only for leaf library packages that emit `.d.ts` (requires `declaration`);
  it forces explicit return types on exports — worth it for shared `@vereino/*` packages, not for the app.
- Project references (`composite: true`, `references: [...]`) between workspaces so `tsc -b` type-checks in
  dependency order; `yarn tsc -b --noEmit` is not allowed with composite, so use `tsc -b` and emit into `dist/`
  or run per-package `tsc --noEmit -p` in CI.
- Migrate away from everything TS 6 deprecates: `baseUrl` (use `paths` relative to tsconfig, or `#/` subpath
  imports under `bundler`/`nodenext`), `moduleResolution: node` (node10), `target: es5`, `outFile`, the
  `module` keyword for namespaces, `assert` import attributes (use `with`). Use
  `"ignoreDeprecations": "6.0"` only as a temporary bridge; TS 7 (Go port) removes them.
- ESLint 9 flat config (`eslint.config.ts`): `tseslint.configs.strictTypeChecked` +
  `stylisticTypeChecked` with `parserOptions.projectService: true` and `tsconfigRootDir`;
  `eslint-plugin-react-hooks` v7 `recommended` (compiler rules on by default);
  `eslint-plugin-jsx-a11y` `flatConfigs.recommended`; `eslint-plugin-import-x`
  (`flatConfigs.recommended` + `order` with alphabetize and newlines-between groups);
  `@next/eslint-plugin-next` (flat config is the default in Next 16); `eslint-config-prettier` last.
  Keep `@typescript-eslint/no-floating-promises` and `no-misused-promises` at `error` (they are in
  strictTypeChecked) — Playwright's docs also rely on `no-floating-promises` to catch missing `await`.
- Prettier 3 as a separate CLI step (`prettier --check`), NOT `eslint-plugin-prettier`; use
  `prettier-plugin-tailwindcss` for class ordering. `next lint` was removed in Next 16; run ESLint directly.
- `next build` no longer lints or (optionally) type-checks for you — add `tsc -b` and `eslint .` as separate
  CI jobs.

### Rationale / evidence
- TS 6.0 announced 2026-03-23: `strict` default true, `module` esnext, `target` es2025 (latest),
  `noUncheckedSideEffectImports` true, `types` `[]`, `rootDir` = tsconfig dir, `libReplacement` false;
  deprecations listed above; 6.0 is the last JS-based release, 7.0 is the Go port and drops deprecated
  options. [official] https://devblogs.microsoft.com/typescript/announcing-typescript-6-0/ (2026-03-23)
- `erasableSyntaxOnly` (TS 5.8): exists for Node `--experimental-strip-types`/Amaro; forbids enums,
  namespaces with runtime code, parameter properties, `import =`/`export =`; recommended together with
  `verbatimModuleSyntax`. `--module nodenext` allows `require(esm)` on Node 22+. [official]
  https://www.typescriptlang.org/docs/handbook/release-notes/typescript-5-8.html
- `isolatedDeclarations` (TS 5.5): requires `declaration`/`composite`, demands explicit types on exports,
  enables parallel `.d.ts` emit by external tools; does not change emit by itself. [official]
  https://www.typescriptlang.org/docs/handbook/release-notes/typescript-5-5.html
- typescript-eslint v8.72 typed linting: `projectService: true`; swap `strict`/`stylistic` for the
  `*TypeChecked` variants; typed linting is slower (TS builds the project first) — acceptable for most,
  heavier in CI. [official] https://typescript-eslint.io/getting-started/typed-linting/ (fetched 2026-10-21)
- `eslint-plugin-react-hooks` v7: presets reduced to `recommended` and `recommended-latest`; compiler
  rules enabled by default; use `reactHooks.configs.flat.recommended` under `defineConfig`. [official]
  https://github.com/facebook/react/blob/main/packages/eslint-plugin-react-hooks/README.md (2026)
- `eslint-plugin-jsx-a11y` ships `flatConfigs.recommended` / `flatConfigs.strict`. [official README via
  yarnpkg mirror] https://classic.yarnpkg.com/en/package/eslint-plugin-jsx-a11y
- `eslint-plugin-import-x` is the maintained fork with native `flatConfigs`, ESLint ^8.57||^9||^10 peer
  range; resolver API renamed in v5 (`resolver-next` default). [official README]
  https://www.npmjs.com/package/eslint-plugin-import-x
- Next 16: `next lint` removed ("use Biome or ESLint directly; `next build` no longer runs linting");
  `@next/eslint-plugin-next` defaults to flat config. [official] https://nextjs.org/blog/next-16 (2025-10-21)
- Next.js provides its own `server-only`/`client-only` type declarations for `noUncheckedSideEffectImports`
  setups. [official] https://nextjs.org/docs/app/getting-started/server-and-client-components (2026-10-05)

### Pitfalls
- `types: []` default silently drops `@types/node`/`@types/jest` globals — tests fail to type-check with
  confusing "cannot find name 'describe'" errors.
- `exactOptionalPropertyTypes` breaks code that assigns `undefined` to optional props (common in React prop
  spreading and Zod `.optional()` outputs — Zod 4 infers `?: T | undefined`, which is fine; hand-written
  types often are not).
- Typed linting on the whole monorepo at once is the main CI cost; lint per workspace, cache ESLint
  (`--cache`), and keep `projectService.allowDefaultProject` minimal.
- ts-jest with `verbatimModuleSyntax` + CJS transform: `import type` must be used for type-only imports or
  ts-jest emits `require()` of modules that have no runtime export. Also `isolatedModules: true` makes
  ts-jest skip full type-check per file (fast) — run `tsc` separately for type safety.
- Mixing `moduleResolution: bundler` (app) and `nodenext` (packages) is fine but packages consumed by both
  must publish proper `exports` maps.

---

## 2. Next.js 16 App Router practices

### Recommended practice
- Default to Server Components; add `'use client'` at the leaf that needs state/effects/browser APIs, not at
  the layout. Pass Server Components into Client Components via `children`/props (slots). Keep context
  providers as deep as possible. Mark server modules with `import 'server-only'`, DAL modules especially.
- Data Access Layer (DAL): one `server-only` module per bounded context that does authn/authz and returns
  minimal DTOs; only the DAL touches `process.env` and the ORM. Server Actions stay thin and delegate.
- Mutations: Server Actions for first-party UI forms (progressive enhancement, `useActionState`,
  `updateTag`/`refresh` for read-your-writes); Route Handlers (`route.ts`) for anything with a non-browser
  caller — the Open Mercato REST API, webhooks (Stripe), integrations, mobile. Since the platform already
  exposes API routes, use them for the public contract and keep Server Actions as a UI convenience that
  calls the same application services (never a second business-logic path).
- Treat every Server Action as a public POST endpoint: validate input with Zod, re-check session and
  resource ownership inside the action, return only what the UI needs, rate-limit expensive ones.
- Caching in 16: dynamic by default. Enable `cacheComponents: true` + `partialPrefetching: true`, then cache
  explicitly with `'use cache'` + `cacheLife()` + `cacheTag()`; invalidate with `revalidateTag(tag, 'max')`
  (SWR) for content and `updateTag(tag)` inside actions for read-your-writes. Cache Components require the
  Node runtime — remove any `runtime` segment export.
- `proxy.ts` (renamed from `middleware.ts`, Node runtime): only cheap request work — auth cookie presence
  checks, redirects, locale, per-request nonce + CSP header, request-id header. No DB calls, no business
  logic; real authz lives in the DAL/actions.
- Security headers via `headers()` in `next.config.ts` for all routes: HSTS
  (`max-age=63072000; includeSubDomains; preload`), `X-Content-Type-Options: nosniff`,
  `Referrer-Policy: strict-origin-when-cross-origin` (docs example uses origin-when-cross-origin),
  `Permissions-Policy: camera=(), microphone=(), geolocation=(), browsing-topics=()`,
  `X-Frame-Options: SAMEORIGIN` (superseded by CSP `frame-ancestors`, keep both). CSP: nonce-based, generated
  in `proxy.ts`, which forces dynamic rendering of pages that need it — accept that for an authenticated app.
- Performance budgets (mobile, p75 field data): LCP <= 2.5 s, INP <= 200 ms, CLS <= 0.1. Add
  `@next/bundle-analyzer` in CI with a size budget per route (opinion: <= 200 kB gzipped client JS on the
  initial route of the member-facing pages); keep heavy libraries (charts, editors) in `'use client'`
  leaves loaded with `next/dynamic`.
- Images: `next/image` with `images.remotePatterns` (not `domains`), `localPatterns` for query-string
  local images, accept the new defaults (`minimumCacheTTL` 4h, `qualities: [75]`, max 3 redirects).
  Fonts: `next/font` (self-hosted, zero layout shift) — never link Google Fonts at runtime.
- Error handling: expected errors are return values (`useActionState` state), unexpected errors throw into
  `error.tsx` boundaries (Client Components with `{ error, retry }`), `global-error.tsx` for the root
  layout, `notFound()` + `not-found.tsx`; `loading.tsx` / `<Suspense>` for every segment that awaits data.
  Note the current docs expose `retry` (older guides say `reset`) — follow the installed version's types.
- Turbopack is the default; keep webpack out unless `@open-mercato` packages require a custom loader.
  Enable `reactCompiler: true` only after measuring build-time cost (it is stable but opt-in).

### Rationale / evidence
- Next 16 (2025-10-21): Cache Components (`cacheComponents: true`), `proxy.ts` replaces `middleware.ts`
  (Node runtime; `middleware.ts` deprecated, Edge only), Turbopack stable default, React Compiler support
  stable (opt-in, Babel-based, slower builds), `revalidateTag(tag, profile)` now requires a cacheLife profile
  ("'max' recommended"), new `updateTag()` and `refresh()` (Server Actions only), async `params`/
  `searchParams`/`cookies()`/`headers()`, image default changes, `images.domains` deprecated, parallel
  route slots need `default.js`, Node >= 20.9, `next lint` removed. [official] https://nextjs.org/blog/next-16
- `cacheComponents` docs (lastUpdated 2026-10-15): data fetching dynamic by default; prerendered static shell
  + streamed dynamic parts (PPR default); set `partialPrefetching` explicitly; Node runtime required;
  enables `use cache`, `cacheLife`, `cacheTag`; navigation keeps previous routes mounted via `<Activity>`
  (state preserved, effects cleaned up) — affects dialogs/dropdowns and tests. [official]
  https://nextjs.org/docs/app/api-reference/config/next-config-js/cacheComponents
- Server/Client components guide (2026-10-05): when to use each; `'use client'` pulls the whole import graph
  into the client bundle; children/props slot pattern; providers deep in tree; `server-only`/`client-only`;
  only `NEXT_PUBLIC_` env vars reach the client. [official]
  https://nextjs.org/docs/app/getting-started/server-and-client-components
- Data security guide (2026-10-06): DAL recommended for new projects; Server Actions reachable by direct
  POST regardless of UI usage; encrypted non-deterministic action IDs (<= 14 days cache) + dead-code
  elimination are mitigations, "still verify authentication and authorization inside each one"; closure
  variables are encrypted per build (`NEXT_SERVER_ACTIONS_ENCRYPTION_KEY` for multi-instance self-hosting);
  Origin vs Host/X-Forwarded-Host check, `serverActions.allowedOrigins` for proxies; never mutate during
  render; audit checklist (`proxy.ts` and `route.ts` "have a lot of power"). [official]
  https://nextjs.org/docs/app/guides/data-security
- CVE-2026-27978 (Next 16.0.1–16.1.7): `Origin: null` treated as missing in Server Action CSRF check;
  fixed in 16.1.8+. 16.3 is unaffected; the advisory recommends CSRF tokens + `SameSite=Strict` as
  defence in depth. [official NVD] https://nvd.nist.gov/vuln/detail/CVE-2026-27978
- CSP guide: nonce generated in `proxy.ts`, Next applies it to its own scripts/styles; requires dynamic
  rendering (`await connection()` to force). [official] https://nextjs.org/docs/app/guides/content-security-policy
- Security headers list + values. [official] https://nextjs.org/docs/app/api-reference/config/next-config-js/headers (2026-06-30)
- Error handling (2026-10-15): expected errors as return values with `useActionState`; `error.tsx` must be a
  Client Component, props `{ error, retry }`; `catchError()` from `next/error` for component-level
  boundaries; event-handler errors not caught (use state), `startTransition` errors do bubble. [official]
  https://nextjs.org/docs/app/getting-started/error-handling
- Core Web Vitals thresholds (LCP 2.5 s, INP 200 ms, CLS 0.1 at p75, mobile and desktop separately).
  [official] https://web.dev/articles/vitals (2024-10-31)
- Server Actions vs Route Handlers: Route Handlers for external clients/webhooks/public REST; Server Actions
  for internal mutations; OWASP: treat actions as client-callable POST entry points. [secondary]
  https://cheatsheetseries.owasp.org/cheatsheets/Nextjs_Security_Cheat_Sheet.html ,
  https://makerkit.dev/blog/tutorials/server-actions-vs-route-handlers

### Pitfalls
- Sync access to `params`/`cookies()`/`headers()` is removed in 16 — everything is `await`ed.
- `revalidateTag('x')` single-arg form is deprecated; forgetting the profile silently keeps old semantics
  only until removal.
- With Cache Components, a `use cache` function that reads cookies/headers throws; pass request data in as
  arguments (they become part of the cache key).
- `<Activity>`-based navigation keeps hidden routes mounted: `useEffect` cleanup runs on hide, and tests or
  modals that assume unmount may misbehave (see "Preserving UI state" guide).
- A nonce CSP makes every page dynamic; do not combine with `'use cache'` on whole pages that need the nonce.
- Enumerating Server Actions by ID is not a security boundary; IDs rotate at most every 14 days.
- `images.dangerouslyAllowLocalIP` is false by default — image optimisation of private-network sources
  breaks unless explicitly enabled (relevant to Railway private networking).

---

## 3. React 19.2 patterns

### Recommended practice
- Forms: `<form action={serverAction}>` + `useActionState(action, initialState)` for state/pending/errors;
  `useFormStatus()` only from a child rendered inside the `<form>`; `useOptimistic` for optimistic lists.
- Async transitions: `startTransition(async () => {...})` for non-form mutations; `isPending` covers the
  whole async function. Throwing inside `startTransition` reaches the error boundary; throwing in a plain
  event handler does not.
- `use(promise)`: create promises in Server Components and pass them to Client Components wrapped in
  `<Suspense>`; never create the promise during render of the consumer; never wrap `use` in try/catch.
- `useEffectEvent` for event-like logic inside effects (analytics, notifications); not a dependency, not a
  way to silence `exhaustive-deps`. Prefer the React Compiler + lint rules over manual `useMemo`/`useCallback`.
- `<Activity mode="hidden">` for pre-rendering likely-next tabs/pages and preserving state; Next 16 uses it
  for navigation already — write effects so they tolerate unmount/remount of effects without DOM removal.
- Avoid: `forwardRef` (ref is a prop in 19), `useFormState` (renamed), string refs, `defaultProps` on
  function components, `ReactDOM.render`, `act` from `react-dom/test-utils` (import from `react`).
- Testing: `@testing-library/react` >= 16 with `@testing-library/dom` and `@types/react-dom` installed as
  peers; RTL sets `IS_REACT_ACT_ENVIRONMENT`. Test async actions with `await user.click(...)` (user-event
  v14) then `await screen.findBy...`/`waitFor`; for `useActionState` forms, assert the returned state via the
  rendered message, not the action's internals. Prefer `jest-environment-jsdom` (jsdom 26 in Jest 30) and
  note jsdom 26's stricter `window.location` behaviour.

### Rationale / evidence
- React 19.2 (2025-10-01): `<Activity>` (visible/hidden; hidden unmounts effects and defers updates),
  `useEffectEvent` (not a dependency, needs `eslint-plugin-react-hooks@latest`), `cacheSignal` (RSC),
  Performance Tracks in Chrome DevTools, PPR APIs (`prerender`/`resume`), batched Suspense reveals on SSR
  (stops batching near 2.5 s LCP), Web Streams in Node (Node streams still faster), `useId` prefix `_r_`,
  `eslint-plugin-react-hooks` v6 flat config default. [official] https://react.dev/blog/2025/10/01/react-19-2
- `use()` reference: callable in conditionals/loops, not in try/catch; promises must be cached/stable;
  rejected promise goes to the nearest Error Boundary; create promises in Server Components; context via
  `use(Context)` not supported in Server Components. [official] https://react.dev/reference/react/use
- `useFormStatus` only reports the parent `<form>`; `useActionState` returns `[state, formAction, isPending]`
  and works before hydration with RSC frameworks. [official] https://react.dev/reference/react-dom/hooks/useFormStatus ,
  https://react.dev/reference/react/useActionState
- RTL 16 made `@testing-library/dom` and `@types/react-dom` peer deps; RTL 16 is the minimum for React 19.
  [secondary — Renovate release notes mirror] https://gitlab.com/alergeek/eslint-config/-/merge_requests/502
- React docs: RTL already sets `IS_REACT_ACT_ENVIRONMENT`. [official] https://react.dev/reference/react/act
- A third-party upgrade guide claims a security issue in React 19.0.0–19.2.2 (fixed in 19.2.3). Not verified
  against react.dev; treat as "stay on the latest 19.2.x patch". [secondary] https://makerkit.dev/blog/tutorials/react-19-2

### Pitfalls
- Next 16 App Router runs a React *Canary* that includes 19.2 — library peer ranges that pin `react@19.2.x`
  exact may warn; use `^19.2.0`.
- `useFormStatus` in the same component as the `<form>` always returns `pending: false`.
- `useEffectEvent` can only be declared in the same component/hook as the effect that calls it.
- Uncached promises in `use()` cause an infinite Suspense fallback and a console warning.
- Jest 30's jsdom 26 breaks `window.location` mocks; use `jest.spyOn(window, 'location', 'get')` or the
  `@jest/environment-jsdom-abstract` custom environment.

---

## 4. MikroORM 7 + PostgreSQL 17

### Recommended practice
- Entities: prefer `defineEntity` (decorator-free, typed Kysely access, no `reflect-metadata`), or if the
  platform's modules use decorators, import from `@mikro-orm/decorators/legacy` consistently and register
  `ReflectMetadataProvider` explicitly. UUID v7 or `bigint` identity PKs; `created_at`/`updated_at` with
  `onCreate`/`onUpdate`; soft-delete via a filter only where business requires it.
- Unit of Work: one `EntityManager` fork per request (Open Mercato already scopes a container per request —
  resolve the request-scoped `em` from Awilix, never use the global `em`). Call `em.persist()` explicitly
  for new/changed entities and `em.flush()` once per use case; `em.transactional(cb)` (default propagation
  NESTED = savepoint) for multi-aggregate writes; `@Transactional()` on service methods (REQUIRED).
- Optimistic locking on aggregates that users edit concurrently (member profile, event, invoice):
  `@Property({ version: true }) version!: number` (integer preferred over Date) and catch
  `OptimisticLockError` -> HTTP 409 with a typed domain error. `updated_at` is not a lock; use `version`.
- Pessimistic `LockMode.PESSIMISTIC_WRITE` (SELECT ... FOR UPDATE) inside `em.transactional` for counters,
  seat allocation, invoice numbering; always inside a transaction.
- Migrations: generated diffs (`migration:create`) reviewed as raw SQL; snapshots committed; `safe: true` in
  production config (no implicit drops); `allOrNothing: false` + `isTransactional() { return false }` only for
  `CREATE INDEX CONCURRENTLY` migrations; `migrationsList` for the bundled Docker image; run migrations as a
  separate Railway pre-deploy step, not at app boot.
- Expand/contract for every breaking schema change: add nullable column -> backfill in batches -> add
  `NOT NULL` via `CHECK (... IS NOT NULL) NOT VALID` then `VALIDATE CONSTRAINT` (or PG 18 `NOT NULL NOT VALID`)
  -> switch code -> drop old column in a later release. Always `SET lock_timeout = '5s'` (and
  `statement_timeout`) in migration transactions. `CREATE INDEX CONCURRENTLY` outside transactions.
- Indexes: FK columns, tenant/organization id first in composite indexes (multi-tenant platform), partial
  indexes for soft-deleted/active rows, GIN `jsonb_path_ops` on JSONB columns queried with `@>`. Use v7
  index options (`INCLUDE`, NULLS ordering) via entity metadata.
- JSONB: for genuinely schemaless attributes (custom fields, settings), validated by Zod at the boundary;
  keep documents small (row-level lock on update), stable shape; never for data you join/aggregate on.
- Encryption at rest: platform/volume encryption as baseline (Railway) plus application-level envelope
  encryption for the few sensitive fields (IBAN, health notes): random data key per row/tenant wrapped by a
  KMS/master key held outside the DB; store ciphertext in `bytea`; add a HMAC "blind index" column for
  equality lookups. Avoid in-DB `pgcrypto` with passphrases in SQL (keys end up in logs).
- Pool: `pool: { min: 0 or 2, max: ~ (2 x cores)+1 per instance }`; total across instances < Postgres
  `max_connections` minus superuser/reserve; put PgBouncer (transaction mode) in front if instances scale
  horizontally; `idleTimeoutMillis` short; enable `slowQueryThreshold` logging.
- N+1: default `balanced` strategy in v7 (joins to-one, select-in for to-many); use `populate` explicitly
  with `populateHints`, `fields` partial loading for list endpoints, `em.stream()` for exports, enable the
  optional `dataloader` for GraphQL-like access patterns.
- Seeding: `@mikro-orm/seeder` with factories; separate "reference data" seeders (idempotent, run in prod)
  from "demo data" seeders (dev/test only).
- Testing with real Postgres: `@testcontainers/postgresql` in Jest `globalSetup` (write connection URI to
  `process.env`), run migrations once, then per-test isolation with either `container.snapshot()/
  restoreSnapshot()` or a transaction-per-test fork that rolls back. Use the same `pgvector/pgvector:pg17`
  image as production.

### Rationale / evidence
- MikroORM 7 "Unchained" (released 2026-03-11 per newreleases; blog 2026): Kysely replaces knex
  (`@mikro-orm/knex` -> `@mikro-orm/sql`), native ESM (consumable from CJS via `require(esm)` on Node 22.17+
  / TS 5.8+), zero runtime deps, decorators in `@mikro-orm/decorators` (`/legacy`, `/es`),
  `ReflectMetadataProvider` no longer default, `defineEntity` + typed `em.getKysely()`, balanced loading
  default, `populateHints`, materialized views, TPT inheritance, polymorphic relations, advanced index
  options, `em.stream()`, `slowQueryThreshold`, migrations without umzug + `migrationsList`,
  `persistAndFlush` removed, QueryBuilder not awaitable, `@Transactional` default REQUIRED,
  `forceUtcTimezone` default, FK rules decoupled from `cascade`, stricter `em.create/assign` typing,
  `validate`/`strict` always on, auto-flush needs explicit `em.persist()`. [official]
  https://mikro-orm.io/blog/mikro-orm-7-released ; https://mikro-orm.io/docs/upgrading-v6-to-v7
- Transactions/locking docs: writes queued until `flush()`; `em.transactional` default NESTED (savepoint),
  `@Transactional` REQUIRED; forked EM per transaction; `@Property({ version: true })` ->
  `OptimisticLockError`; `concurrencyCheck: true` for manual checks; six pessimistic modes; isolation levels.
  [official] https://mikro-orm.io/docs/transactions
- Loading strategies: `balanced` default for SQL drivers since v7; `populateHints` with `strategy`,
  `joinType`, `limit` (forces select-in, marks collection readonly). [official] https://mikro-orm.io/docs/loading-strategies
- Migrations: snapshot-based diffing, `transactional`/`allOrNothing` defaults true, `isTransactional()`
  override + `allOrNothing: false` for `create index concurrently`, `safe`, `dropTables`,
  `migrationsList`, "prefer raw SQL in migrations; using EntityManager is possible but discouraged", set
  `name` on migration classes (minifiers). [official] https://mikro-orm.io/docs/migrations
- Postgres 17 JSON docs: prefer `jsonb`; GIN `jsonb_ops` (default, supports `?`) vs `jsonb_path_ops`
  (smaller, faster, only `@>`/`@?`/`@@`); any update locks the whole row; keep documents small and
  fixed-shape. [official] https://www.postgresql.org/docs/17/datatype-json.html
- Zero-downtime DDL: NOT NULL via NOT VALID + VALIDATE (ShareUpdateExclusive lock), PG11+ fast default
  columns, `CREATE INDEX CONCURRENTLY` not in a transaction and may leave invalid indexes, `lock_timeout`
  on all DDL, batched backfills. [secondary] https://www.alexcloudstar.com/blog/zero-downtime-postgres-migrations-2026 ,
  https://www.bytebase.com/blog/postgres-schema-migration-without-downtime/
- Pool sizing: (cores x 2)+1 heuristic; Little's law (TPS x avg tx seconds); PgBouncer transaction mode for
  many short-lived clients. [secondary] https://swyftstack.com/blog/postgresql-connection-pooling-explained-pgbouncer ,
  https://www.netdata.cloud/guides/pgbouncer/pgbouncer-sizing-pool-size/
- Encryption: keys outside the DB (KMS/app), per-tenant keys, hashed helper columns for search,
  deterministic encryption leaks frequency. [secondary] https://xata.io/blog/multi-tenant-byok-encryption-in-postgresql-with-pgcrypto ,
  https://blog.crunchydata.com/blog/postgres-pgcrypto
- Testcontainers Postgres module: `@testcontainers/postgresql`, `getConnectionUri()`, `snapshot()` /
  `restoreSnapshot()` (close connections first; don't use the `postgres` DB), `withSSLCert`. [official]
  https://node.testcontainers.org/modules/postgresql/ ; Docker guide https://docs.docker.com/guides/testcontainers-nodejs-getting-started/

### Pitfalls
- v7 auto-flush no longer picks up scalar changes unless the entity was `persist()`ed — silent "lost
  update" bugs when migrating v6 habits.
- `forceUtcTimezone` default + `timestamptz` columns: make sure DB and app agree on UTC; display in the
  club's timezone only in the UI.
- `allOrNothing: true` with a `CONCURRENTLY` migration fails at runtime; a failed non-transactional run leaves
  earlier migrations applied — write such migrations idempotently (`IF NOT EXISTS`).
- `pgvector` image: the extension must be `CREATE EXTENSION vector` in a migration; Testcontainers must use
  the same image or embedding columns fail.
- Snapshot/restore in Testcontainers fails if a pooled connection stays open — end the MikroORM connection
  (`orm.close()` / `em.getConnection().close()`) before restoring.
- MikroORM identity map across async boundaries: using the global `em` in Next.js server code leaks entities
  between requests; always `em.fork()` or the request-scoped instance (enable `allowGlobalContext: false`).

---

## 5. Awilix 13 DI patterns

### Recommended practice
- Composition root per process (app server, worker, CLI): `createContainer({ injectionMode: 'CLASSIC',
  strict: true })` — CLASSIC for speed and explicit constructor parameters; if the platform's modules
  rely on PROXY (destructuring the cradle), keep PROXY globally and set `.classic()` only on hot paths.
  Open Mercato builds a container per request; register your module's services in its registration hooks
  rather than creating a second container.
- Lifetimes: `SINGLETON` for stateless infrastructure (config, logger, metrics, Stripe client, Redis),
  `SCOPED` for anything per request (EntityManager fork, current user/tenant context, unit of work,
  idempotency store handle), `TRANSIENT` for command handlers that carry call-specific state. Never let a
  singleton depend on a scoped/transient registration — `strict: true` turns this into an
  `AwilixResolutionError` at resolve time.
- Request flow: `const scope = container.createScope(); scope.register({ currentUser: asValue(user), em:
  asValue(orm.em.fork()) })`; dispose the scope at the end of the request (`scope.dispose()`) to run
  disposers (close EM, flush logs).
- Avoid the service-locator anti-pattern: do not pass `container`/`cradle` into domain code or resolve
  inside methods; depend on interfaces in constructors. The only places that call `resolve()` are the
  composition root, request scope setup, route handler adapters and job runners.
- Testing: build a fresh container per test with `container.register({ stripe: asValue(fakeStripe) })`
  overrides (later registrations win), or `container.build(Service)` with explicit stubs; avoid
  `loadModules` globs in test code (and in bundled Next.js code — glob loading does not work with bundlers).

### Rationale / evidence
- Awilix README (v13.0.5): PROXY default vs CLASSIC (faster, breaks under minification unless names are
  preserved), lifetimes TRANSIENT (default)/SCOPED/SINGLETON, `createScope()` per request, singleton holding
  scoped deps gives stale data, `strict: true` (v10+) enforces lifetime rules and root-only singletons,
  `dispose()` runs disposers for cached values (child scopes not disposed by parent), `loadModules` needs
  globs and does not work with bundlers, `inject()` for local values. [official]
  https://cdn.jsdelivr.net/npm/awilix@13.0.5/README.md
- Open Mercato uses a per-request Awilix container and MikroORM per-module entities. [secondary]
  https://openapps.pro/packages/open-mercato

### Pitfalls
- CLASSIC mode + Next.js/Turbopack minification renames constructor parameters -> resolution fails in
  production only. Either keep PROXY or use `asClass(X).inject(() => ({...}))` / explicit
  `[RESOLVER]` names, and test the production build.
- Resolving a scoped service from the root container caches it in the root for the process lifetime — a
  classic leak of the first request's user context.
- Circular dependencies are hidden by PROXY's lazy resolution; `strict` + CLASSIC surfaces them early.
- `dispose()` on the root container does not dispose child scopes; forgetting per-request `dispose()` leaks
  EM identity maps.

---

## 6. Zod 4

### Recommended practice
- One `schemas/` module per bounded context exporting: `XInput` (API/form input), `XRecord` (persisted
  shape), `XDto` (response); derive with `.pick/.omit/.extend/.partial` from a single base; infer types with
  `z.infer`/`z.input`/`z.output` — never duplicate hand-written interfaces.
- Share the same schema between the Route Handler/Server Action (`schema.safeParse`) and the form
  (`react-hook-form` + `@hookform/resolvers/zod`, zod 4 supported) so client and server agree; keep
  schemas in a package without Node-only imports so they can be imported from `'use client'` files.
- Errors: `z.flattenError(err)` for flat forms (`fieldErrors`), `z.treeifyError(err)` for nested, map to a
  single API error shape (RFC 9457 `problem+json` with `errors[]` of `{path, message, code}`);
  `z.prettifyError` only for logs/CLI. Customize messages with the unified `error` param; localize via
  `z.config(pl())` from `zod/locales`.
- Use top-level formats (`z.email()`, `z.uuid()`, `z.iso.datetime()`, `z.url()`), `z.strictObject` for API
  bodies (reject unknown keys), `z.looseObject` only for webhooks you don't own, `z.stringbool()` for env
  parsing, `z.coerce.*` only at the HTTP/query boundary.
- Metadata: `.meta({ id, description, examples })` + `z.toJSONSchema()` to generate the OpenAPI schema from
  the same source of truth (see §8 contract tests).
- Performance: Zod 4 is the default; import from `zod` (v4) — use `zod/mini` only in size-critical client
  bundles; keep `.extend()` chains shallow but no longer fear them (tsc cost dropped ~100x).

### Rationale / evidence
- Zod 4 release notes: 14.7x faster string parsing, 7.4x arrays, 6.5x objects vs Zod 3; `.extend()` type
  instantiations 25 000 -> 175; bundle 12.47 kB -> 5.36 kB gzip (mini 1.88 kB); `zod/mini` functional API;
  `.meta()` + `z.globalRegistry`; first-party `z.toJSONSchema()`; getter-based recursive types; top-level
  string formats (method forms deprecated); refinements live inside schemas (chain `.min()` after
  `.refine()`); single `error` param replaces `message`/`invalid_type_error`/`errorMap`; `z.prettifyError`;
  locales via `z.config`. [official] https://zod.dev/v4 (stable 2025; latest 4.4.x May 2026 per releasebot)
- Error formatting: `z.treeifyError` (nested `properties`/`items`/`errors`), `z.prettifyError`,
  `z.flattenError` (`formErrors`/`fieldErrors`); `z.formatError` deprecated. [official]
  https://zod.dev/error-formatting
- Migration specifics (`.flatten()`/`.format()` on ZodError moved to standalone functions; issue formats
  under `z.core`). [secondary] https://dev.to/ahmed_mahmoud360/what-changed-in-zod-4-and-how-i-migrated-production-schemas-di0

### Pitfalls
- `z.object()` in v4 strips unknown keys silently (same as v3) — use `z.strictObject` for API bodies, or
  attackers can smuggle extra fields into `em.assign`.
- Libraries that still import `zod/v3` types (older `@hookform/resolvers`, OpenAPI generators) produce
  type errors against v4 schemas; pin versions that declare zod 4 support.
- `z.coerce.date()` accepts numbers and empty strings in surprising ways — validate ISO strings with
  `z.iso.datetime()` and convert explicitly.
- `.transform()` output types differ between `z.input` and `z.output` — forms should be typed with
  `z.input`, services with `z.output`.

---

## 7. Tailwind 4 + shadcn/ui (via @open-mercato/ui)

### Recommended practice
- Tokens: all colours as CSS variables in `:root`/`.dark` (oklch), exposed to Tailwind through
  `@theme inline { --color-primary: var(--primary); ... }`; extend with semantic tokens the platform lacks
  (`--success`, `--warning`, `--info` with `-foreground` pairs) in the single Tailwind CSS entry file —
  never a second CSS file, never hard-coded hex in components.
- Dark mode: class strategy (`@custom-variant dark (&:is(.dark *))`) with `next-themes`, `suppressHydrationWarning`
  on `<html>`; every token must have a `.dark` value; test both themes in Playwright screenshots.
- Composition: wrap `@open-mercato/ui` primitives in app-level components (e.g. `MemberCard`, `MoneyInput`)
  rather than re-styling shadcn primitives inline; use `cva` variants + `cn()` for variants; no
  copy-editing of generated shadcn files beyond tokens.
- Forms: `react-hook-form` + `zodResolver` + shadcn `Form`/`FormField`/`FormMessage` (labels, descriptions
  and `aria-describedby` wired automatically); server-side errors from Server Actions mapped into
  `setError(path, ...)`. Every input has a visible `<Label>`; errors announced via `aria-live`.
- Accessibility (WCAG 2.2 AA): target size >= 24x24 CSS px (prefer 44 px on mobile), visible focus
  (`focus-visible:ring-*` from the `ring` token), no drag-only interactions (provide buttons for reordering),
  focus not obscured by sticky headers/toasts, consistent help/auth flows, keyboard operability of Radix
  components preserved (do not override `onKeyDown`). Colour contrast >= 4.5:1 text / 3:1 UI — verify custom
  oklch tokens with a contrast checker.
- Responsive: mobile-first utilities (`sm:`/`md:` additive), container queries (`@container`) for
  cards/tables, `min-h-dvh` not `100vh`, `overflow-x-auto` tables with sticky first column on phones.
- Avoid arbitrary values (`w-[137px]`): add a spacing/size token in `@theme` if a value repeats twice;
  enforce with `eslint-plugin-tailwindcss` (or Biome's class sorting) + `prettier-plugin-tailwindcss`.

### Rationale / evidence
- shadcn theming: CSS-variable convention (`background`/`foreground` pairs, `-background` suffix omitted),
  oklch defaults, `:root` + `.dark`, `@theme inline` mapping, adding tokens (`--warning` example),
  `--radius` scale, `cssVariables` is an init-time choice, Tailwind v4 directives (`@import "tailwindcss"`,
  `@custom-variant dark`). [official] https://ui.shadcn.com/docs/theming (fetched 2026-10-21)
- Tailwind v4 config lives in CSS (`@theme`), needs explicit colour functions; `@custom-variant dark
  (&:is(.dark *))`. [secondary] https://www.shadcnblocks.com/docs/blocks/theming , https://21st.dev/blog/shadcn-theming-css-variables
- WCAG 2.2 (Recommendation 2023-10-05): nine new SC; AA additions include 2.4.11 Focus Not Obscured
  (Minimum), 2.5.7 Dragging Movements, 2.5.8 Target Size (Minimum, 24x24), 3.2.6 Consistent Help, 3.3.7
  Redundant Entry, 3.3.8 Accessible Authentication (Minimum); 2.4.13 Focus Appearance is AAA. [official]
  https://www.w3.org/WAI/standards-guidelines/wcag/new-in-22/
- axe cannot detect all WCAG issues; run `wcag2a, wcag2aa, wcag21a, wcag21aa` (and `wcag22aa`) tags. [official]
  https://playwright.dev/docs/accessibility-testing

### Pitfalls
- Copying a v3 `hsl` token set (space-separated values) into v4 breaks: v4 needs `hsl()`/`oklch()` function
  syntax.
- Tailwind v4 `@theme` colours defined without `inline` produce variables that reference variables and break
  opacity modifiers (`bg-primary/50`); shadcn's `@theme inline` is deliberate.
- Radix-based components inside `<Activity hidden>` keep portals mounted; dialogs can reopen on back
  navigation (see Next "Preserving UI state").
- `cssVariables: false` cannot be switched later without reinstalling components.

---

## 8. Testing strategy

### Recommended practice
- Pyramid: (1) unit tests (Jest) for domain logic, value objects, Zod schemas, mappers — fast, no I/O;
  (2) integration tests (Jest + Testcontainers Postgres + real MikroORM, Redis via Testcontainers) for
  repositories, application services, Server Actions and Route Handlers invoked as functions; (3) contract
  tests (Jest + supertest/`fetch` against the built app + `jest-openapi` `toSatisfyApiSpec`) for the REST
  API; (4) Playwright e2e for the ~10 critical member/admin journeys, including an axe scan and screenshot
  comparisons on key pages; (5) smoke test after deploy on Railway (health + login).
- Jest 30 config: `ts-jest` CJS transform with `isolatedModules: true` (type-check separately),
  `testEnvironment: node` default and `jsdom` only for component tests via docblock
  `@jest-environment jsdom`; `transformIgnorePatterns` allowlist for ESM-only deps
  (`node_modules/(?!(zod|@open-mercato|...)/)`) — or `moduleNameMapper` to CJS builds; `.mts/.cts`
  supported; `testEnvironmentOptions.globalsCleanup: 'on'` after confirming no shared globals; use
  `using spy = jest.spyOn(...)` auto-restore; `expect.arrayOf`; `jest.retryTimes(n, {waitBeforeRetry})` only
  for integration tests; `--shard` across CI runners; avoid barrel imports in tests (big win per Jest blog).
  Prefer `jest.unstable_unmockModule` only if native ESM is enabled — we stay on CJS transform.
- Playwright 1.58: fixtures for auth state (setup project writes `storageState`), per-test isolation,
  role/label/testid locators, web-first `await expect(...)`, `trace: 'on-first-retry'`, `retries: 2` on CI
  only, `--shard=i/n` + `merge-reports` (HTML report Speedboard/Timeline), projects for chromium +
  mobile-chrome + webkit, mock third parties with `page.route` (Stripe test mode via webhooks replay, email
  via Resend test keys), `expect.soft` for non-blocking checks, `@axe-core/playwright` fixture
  (`makeAxeBuilder`) with `withTags(['wcag2a','wcag2aa','wcag21a','wcag21aa','wcag22aa'])`, screenshot
  tests with `toHaveScreenshot` on Linux containers only (OS/browser pinned).
- Contract tests: generate `openapi.json` from Zod schemas (`z.toJSONSchema` + a thin route registry) in
  CI, diff with `oasdiff` to fail on breaking changes, assert responses with `jest-openapi`.
- Vitest: faster watch mode and native ESM; we keep Jest because Open Mercato's packages, mocks and config
  are Jest-based, the CJS/ts-jest pipeline is already tuned, and Jest 30 closed most of the gap (unrs
  resolver, ~37% faster, 77% less memory in Jest's own benchmark). Re-evaluate only if ESM-only deps make
  `transformIgnorePatterns` unmanageable.

### Rationale / evidence
- Jest 30 (2025-06-04): Node 14/16/19/21 dropped, TS >= 5.4, jsdom 26, removed `expect` aliases,
  non-enumerable props excluded from `toEqual`, `.mts/.cts` default, `--testPathPatterns`, unrs-resolver,
  big memory/time wins (1350 s/7.8 GB -> 850 s/1.8 GB on one large TS app), globals cleanup, `using` spies,
  `expect.arrayOf`, `test.each` `%$`, `jest.retryTimes` options, `jest.onGenerateMock`, async setup files,
  `import.meta` under native ESM, `jest.unstable_unmockModule`. [official] https://jestjs.io/blog/2025/06/04/jest-30
- Jest ESM still "experimental" (`--experimental-vm-modules`); 30.4 adds `jest.config.mts` and
  `require(esm)` on Node 24.9+. [official] https://jestjs.io/docs/ecmascript-modules ; https://newreleases.io/project/yarn/jest/release/30.4.0
- Playwright best practices: isolation, user-facing locators, web-first assertions, mock third parties,
  trace on first retry, shard/parallel, `no-floating-promises` + `tsc --noEmit` on CI, `expect.soft`.
  [official] https://playwright.dev/docs/best-practices ; 1.58 notes (system theme in trace viewer, Timeline
  in merged reports, `_react`/`_vue` selectors removed). [official] https://playwright.dev/docs/release-notes
- Accessibility testing with `@axe-core/playwright`: `withTags`, `include/exclude`, `disableRules`,
  fingerprint snapshots, `testInfo.attach`. [official] https://playwright.dev/docs/accessibility-testing
- Testcontainers Postgres: see §4. jest-openapi `toSatisfyApiSpec` (OpenAPI 2/3, supertest). [official npm]
  https://www.npmjs.com/package/jest-openapi ; contract/fuzz overview [secondary]
  https://speakeasy.com/post/contract-testing-with-openapi
- Vitest vs Jest comparisons (2025-26): Vitest recommended for new Vite/ESM projects; Jest retained for
  CJS codebases, large tuned suites, React Native. Multipliers (5.6x cold start) are unverified vendor-ish
  numbers. [secondary] https://testomat.io/blog/vitest-vs-jest-a-practical-comparison/ ,
  https://www.pkgpulse.com/guides/vitest-3-vs-jest-30-2026

### Pitfalls
- Jest 30 snapshot changes (goo.gl links) and alias removal — run `eslint-plugin-jest/no-alias-methods`
  autofix during upgrade.
- jsdom 26 is stricter (`window.location` mocking) — patch via custom environment, not by downgrading.
- Playwright screenshots differ across OS/fonts — generate baselines only inside the CI Docker image.
- `trace: 'on'` for every test is slow and fills artifact storage; use `on-first-retry`.
- Testcontainers needs a Docker socket on the CI runner (GitHub-hosted runners have it; Railway build
  containers do not — run integration tests in GitHub Actions, not in the Railway build).

---

## 9. CI/CD on GitHub Actions (Yarn 4 monorepo, Railway)

### Recommended practice
- Toolchain pinning: `packageManager: "yarn@4.x"` in root `package.json`; `corepack enable` in CI (Node 24
  ships Corepack; still run `corepack enable` explicitly); `actions/setup-node@v4+` with `cache: yarn` and
  `cache-dependency-path: yarn.lock`; `yarn install --immutable` (immutable is the CI default; add
  `--immutable-cache` + `checksumBehavior: throw`).
- `.yarnrc.yml` hardening: `enableScripts: false` with `dependenciesMeta` allowlist for the few packages
  that need builds (sharp, esbuild...), `npmMinimalAgeGate` kept at the default `1w` (or at least `3d`)
  with `npmPreapprovedPackages` for first-party `@open-mercato/*`, `enableHardenedMode` auto on public PRs,
  `nmHoistingLimits: workspaces` as already configured.
- Workflow shape: `lint` / `typecheck` / `unit` / `integration` (Testcontainers) / `build` / `e2e`
  (Playwright, sharded 4 ways, `merge-reports`) as separate jobs with `concurrency: { group: ref,
  cancel-in-progress: true }`; `permissions: { contents: read }` at top, elevated per job only; matrix only
  where it matters (Node 24 only — fixed stack); required checks = lint, typecheck, unit, integration,
  build, e2e-merged; branch protection with linear history and signed commits (opinion).
- Docker: `docker/build-push-action` with `cache-from/to: type=gha, mode=max` (Buildx >= 0.21, BuildKit
  >= 0.20 for Cache API v2) or `type=registry` on GHCR for bigger caches; multi-stage Dockerfile
  (`deps` -> `build` -> `runner` on `node:24-alpine`, Next `output: 'standalone'`, copy
  `.next/standalone`, `.next/static`, `public`, run as non-root `node` user, `HEALTHCHECK`); build once,
  tag by git SHA, and let Railway deploy that image (or Railway's own builder from the Dockerfile).
- Supply chain: `actions/attest-build-provenance` for the image (SLSA Build L2; L3 with reusable
  workflows), pin third-party actions by SHA, `actions/dependency-review-action` on PRs, `yarn npm audit`
  + `osv-scanner` scheduled, Dependabot/Renovate with a cooldown (Renovate `minimumReleaseAge: '7 days'`,
  grouped by ecosystem, `lockFileMaintenance` weekly); npm `--provenance` if any `@vereino/*` package is
  published.
- Release/versioning: single deployable app => no need for Changesets; use conventional commits +
  `release-please` (or GitHub Releases from tags) for a CHANGELOG and semver tag; adopt Changesets only
  if `@vereino/*` packages get published independently (>= 3 inter-dependent published packages).
- Secrets: GitHub Environments (`preview`, `staging`, `production`) with required reviewers for prod;
  OIDC to cloud providers where possible; Railway tokens as environment secrets; never echo env in logs;
  `.env` files only for local dev with `.env.example` committed.
- Preview deploys: Railway PR Environments (inherit from staging, not production; "Focused PR Environments"
  watch paths per service for the monorepo; bot PRs excluded by default); run migrations in the PR env
  against a fresh Postgres; e2e smoke against the PR URL.

### Rationale / evidence
- Yarn `.yarnrc.yml` reference: `npmMinimalAgeGate` default `"1w"`; `npmPreapprovedPackages`;
  `enableScripts` (default false in docs page; verify in repo), `enableHardenedMode` auto on public GitHub
  PRs, `enableImmutableInstalls` true on CI, `checksumBehavior: throw`, `nmHoistingLimits` values.
  [official] https://yarnpkg.com/configuration/yarnrc (fetched 2026-10-21); gate introduced in Yarn 4.10
  per [secondary] https://lilting.ch/en/articles/pnpm-11-minimum-release-age-default-shai-hulud-defense
- setup-node: `cache-dependency-path` for monorepos; Yarn Berry ignores `.npmrc`/`.yarnrc` created by the
  action; caches the global cache, not `node_modules`. [official]
  https://github.com/actions/setup-node (ADR 0001)
- Docker GHA cache: `type=gha` + `mode=max`; Cache API v1 shut down 2025-04-15 (Buildx 0.21+/BuildKit
  0.20+ required); read-only in `pull_request_target`; registry/inline alternatives; cache mounts need
  `buildkit-cache-dance`. [official] https://docs.docker.com/build/ci/github-actions/cache/
- Next standalone Docker pattern (3-stage, copy standalone/static/public, `node server.js`), `libc6-compat`
  on Alpine for some native modules. [secondary] https://oneuptime.com/blog/post/2026-02-08-how-to-containerize-a-nextjs-14-application-with-docker-app-router/markdown
- Railway PR environments: provisioned on PR open, torn down on merge/close, base env configurable, focused
  (watch paths) for monorepos, bot PRs opt-in, domains inherited, needs Auto Deploy on. [official]
  https://docs.railway.com/guides/preview-deployments-with-pr-environments
- Provenance: npm `--provenance` on GitHub Actions; GitHub Artifact Attestations = SLSA Build L2 (L3 with
  reusable workflows); SLSA v1.2 approved 2025-11. [official] https://github.blog/security/supply-chain-security/introducing-npm-package-provenance/ ;
  [secondary] https://rywalker.com/research/slsa
- Renovate vs Dependabot: Renovate has finer grouping, `minimumReleaseAge`, `lockFileMaintenance`,
  multi-platform; Dependabot simpler, GitHub-only, cooldown 1–90 days. [secondary]
  https://vulert.com/blog/renovate-vs-dependabot/ , https://blog.codercops.com/blog/renovate-vs-dependabot-dependency-updates-2026/
- Changesets fits multi-package publishing (yarn workspaces supported); overhead for small repos; chosen over
  release-please when per-PR release notes matter. [secondary] https://peerlist.io/saxenashikhil/articles/complete-monorepo-guide--pnpm--workspaces--changesets-2025

### Pitfalls
- `npmMinimalAgeGate` blocks brand-new patch releases for a week — security hotfixes need
  `npmPreapprovedPackages` or a temporary lower gate; the gate only affects new resolutions, not the lockfile.
- `enableScripts: false` breaks packages that compile on install (sharp, bcrypt) unless allowlisted.
- `nmHoistingLimits: workspaces` increases `node_modules` size and can duplicate React — ensure a single
  React copy via root `resolutions` or `peerDependencies`.
- GHA cache is 10 GB per repo (eviction LRU) — `mode=max` for several images exhausts it; prefer registry
  cache for the production image.
- Railway PR envs inheriting from production share production variables (and may point at prod services if
  not isolated) — base them on staging and override `DATABASE_URL`.

---

## 10. Observability

### Recommended practice
- Use `@open-mercato/telemetry` as the single OTel bootstrap (it wraps the Node SDK); register it from
  `instrumentation.ts` at the project root (`register()`), Node-runtime only, with OTLP/HTTP exporter to
  the collector/vendor; set `OTEL_SERVICE_NAME`, `OTEL_RESOURCE_ATTRIBUTES=deployment.environment=...`,
  `service.version=<git sha>`.
- Traces: auto-instrument `pg`, `ioredis`, `http`/`undici`, plus manual spans around use cases
  (`span name = module.command`, attributes: `tenant.id`, `user.id` hashed, `idempotency.key`); propagate
  `traceparent` to Stripe/Resend calls and from webhooks (W3C). Sample 100% errors, 10–20% success in prod.
- Metrics (stable in OTel JS): HTTP server duration histograms, DB pool usage, queue depth/lag, business
  counters (registrations, payments) — expose to the vendor via OTLP; alert on them.
- Logs: pino JSON to stdout (Railway collects stdout), one logger instance (singleton in Awilix), child
  logger per request with `requestId`, `traceId`/`spanId` injected from the active span (`@opentelemetry/
  instrumentation-pino` or `pino-opentelemetry-transport` to ship via OTLP; OTel Logs is still "development"
  status in JS, so keep stdout as the source of truth).
- Log hygiene: `redact: { paths: ['req.headers.authorization','req.headers.cookie','*.password',
  '*.token','*.iban','*.email','*.phone','user.address.*'], censor: '[Redacted]' }` at logger init; log
  IDs not entities; never log request bodies by default; no PII in span attributes or metric labels; a
  collector-side attributes/redaction processor as the safety net.
- Errors: unhandled exception + rejection handlers that log and flush OTel before exit; error tracking
  (Sentry or vendor) with `error.tsx`/`global-error.tsx` reporting and `instrumentation.ts` `onRequestError`
  hook; group by fingerprint; link to trace.
- Health: `/api/health/live` (process up, no deps) and `/api/health/ready` (DB `SELECT 1`, Redis `PING`,
  migrations applied) with a 1–2 s timeout; Railway healthcheck path = ready; never cache.
- Alerting basics (opinion): page on error-rate > 2% for 5 min, p95 latency > 1.5 s, readiness failing,
  queue lag > 5 min, Stripe webhook failures, disk/connection pool saturation; ticket on everything else.

### Rationale / evidence
- Next.js OTel guide: `instrumentation.ts` at project root (not in `app/`), `register()` with
  `@vercel/otel` or manual `NodeSDK` loaded only when `process.env.NEXT_RUNTIME === 'nodejs'`; custom spans
  with `@opentelemetry/api`. [official] https://nextjs.org/docs/app/guides/open-telemetry
- OTel JS status: traces Stable, metrics Stable, logs Development; supports active/maintenance Node LTS.
  [official] https://opentelemetry.io/docs/languages/js/
- pino `redact`: path syntax (`a.b.*`, `a[*].b`, bracket for hyphens), censor string, `remove: true`,
  built on fast-redact (~2% overhead without wildcards; wildcards ~50% slower in one benchmark), init-time
  only, never from user input. [official] https://github.com/pinojs/pino/blob/main/docs/redaction.md
- Layered PII strategy (redact at source, collector attributes/redaction processors as net). [secondary]
  https://oneuptime.com/blog/post/2026-02-06-scrub-pii-opentelemetry-logs-traces-metrics/markdown

### Pitfalls
- pino `redact` only matches object keys, not free-text messages — do not interpolate emails into `msg`.
- Edge runtime cannot load the Node SDK — keep `proxy.ts` and instrumentation on Node.
- High-cardinality attributes (`user.email`, raw URLs with IDs) explode metric series and leak PII; use
  route templates (`/members/:id`).
- Exporting before shutdown: Railway sends SIGTERM; flush the SDK (`sdk.shutdown()`) in a signal handler.
- `@vercel/otel` targets Vercel's platform; on Railway prefer the platform's telemetry package with an
  OTLP exporter to avoid Vercel-specific propagators.

---

## 11. Security baseline for a small SaaS

### Recommended practice
- Target OWASP ASVS 5.0 Level 2 (personal data of members, payments) with L1 as the first gate; keep a
  requirements checklist in the repo and map each to a test or control.
- Sessions: server-side sessions (Redis) or signed, rotating tokens; cookie `__Host-session`, `Secure`,
  `HttpOnly`, `SameSite=Lax` (Strict for admin), `Path=/`, no `Domain`; >= 128-bit CSPRNG IDs; idle timeout
  30 min (admin 15), absolute 8–12 h; rotate ID on login/privilege change; invalidate server-side on logout;
  `Clear-Site-Data` on logout; re-auth for email/password change and payout settings; MFA (TOTP/passkeys)
  for admins.
- Auth hardening: Argon2id password hashing, breached-password check, generic login errors, login rate
  limits per IP + per account with exponential backoff, email-verification and password-reset tokens
  single-use + short-lived.
- CSRF: rely on Next's Server Action Origin/Host check + `SameSite` cookies for actions; for Route Handlers
  called from the browser, require a custom header (`X-Requested-With`) or double-submit token and reject
  non-JSON content types; never accept state-changing GETs. Keep `serverActions.allowedOrigins` exact when
  behind Railway's proxy.
- Rate limiting: Redis-backed sliding window (`@upstash/ratelimit` works with any Redis via `ioredis`
  adapter, or a small Lua script) in `proxy.ts` for `/api/*` and login/registration/password-reset; return
  429 + `Retry-After`; fail-open with alert if Redis is down; trust `x-forwarded-for` only from Railway's
  proxy.
- Authorization: central policy function (`can(user, action, resource)`) in the DAL; every query filtered
  by `organization_id`; IDOR tests in integration suite.
- Dependencies: `yarn npm audit --severity high` + OSV in CI, Renovate cooldown, `enableScripts: false`,
  pinned actions, SBOM from the image build.
- Secrets: Railway variables per environment, rotated on staff change; `NEXT_SERVER_ACTIONS_ENCRYPTION_KEY`
  set for multi-replica; Stripe webhook secret verified on every event; no secrets in `NEXT_PUBLIC_*`.
- Backups: Railway volume backups (daily/weekly/monthly) + PITR (pgBackRest WAL archive) + weekly
  `pg_dump` to off-platform storage (encrypted, 30–90 day retention); quarterly restore drill into a
  scratch environment with a checklist (restore, run migrations check, smoke test, record RTO/RPO).
- Headers/CSP per §2; `Cache-Control: no-store` on authenticated HTML/JSON.

### Rationale / evidence
- ASVS 5.0.0 released May 2025; ~350 requirements in 17 chapters; levels cumulative; L2 recommended for
  business apps handling sensitive data; L1 ~20%, L2 cumulative ~70% of requirements. [secondary]
  https://beaglesecurity.com/blog/article/how-to-use-owasp-asvs.html , https://apiiro.com/?p=13219 ;
  project page lists 5.0.0 stable [official] https://owasp.org/www-project-application-security-verification-standard/
- OWASP Session Management cheat sheet: >= 64 bits entropy (128 recommended when self-generated),
  `__Host-` prefix, `Secure; HttpOnly; SameSite=Strict|Lax`, idle 15–30 min (2–5 for high value), absolute
  4–8 h, regenerate on privilege change, server-side invalidation, `Clear-Site-Data`, no tokens in
  localStorage. [official] https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html
- Next Server Action CSRF model (POST only, Origin vs Host, `allowedOrigins`) and CVE-2026-27978 — see §2.
- Railway Postgres backups: volume backups (incremental, copy-on-write; daily kept 6 d, weekly 1 mo,
  monthly), PITR via pgBackRest to a `Postgres-PITR` bucket restoring into a sibling service, `pg_dump`
  logical dumps recommended as third layer; Pro plan features; must be enabled beforehand. [official]
  https://docs.railway.com/guides/postgres-backups-restores , https://docs.railway.com/volumes/point-in-time-recovery
- Rate limiting patterns (sliding window, 429 + headers, caching of blocked requests, timeout/fail-open).
  [secondary/vendor] https://upstash.com/docs/oss/sdks/ts/ratelimit , https://noqta.tn/en/tutorials/upstash-redis-nextjs-rate-limiting-caching-2026

### Pitfalls
- `SameSite=Strict` breaks landing on the app from an email/Stripe redirect while logged in — use Lax for
  the member session, Strict only for the admin cookie.
- In-memory rate limiters per process are useless with >1 replica.
- Backups that were never restored are not backups; Railway PITR must be enabled before the incident.
- Encrypting columns breaks `LIKE` search — plan blind indexes before launch, not after.
- `allowedOrigins` wildcards (`*.railway.app`) would trust every Railway app; list exact hosts.

---

## 12. Code organisation for a modular monolith (TypeScript)

### Recommended practice
- One Open Mercato module per bounded context (`members`, `memberships`, `events`, `billing`,
  `communications`); inside: `domain/` (entities, value objects, domain services, domain events, errors),
  `application/` (commands, queries, handlers, ports), `infrastructure/` (MikroORM mappings, Stripe/Resend
  adapters), `api/` (route handlers + Zod schemas), `ui/`. Public surface = `index.ts` only; enforce with
  `eslint-plugin-boundaries` (element types by folder, allow `ui -> application -> domain`, forbid
  `domain -> infrastructure`, forbid cross-module imports except `@module/public`) and `dependency-cruiser`
  for cycles.
- DDD-lite: value objects as branded/immutable classes with validation in constructors (`Money` with integer
  minor units + ISO currency, `Email`, `MemberId`); aggregates small (Member, Membership, Invoice); domain
  services for rules spanning aggregates; invariants enforced in the aggregate, not in the handler.
- CQRS-ish: `Command` objects validated by Zod, one handler each, returning typed results; queries read via
  the QueryBuilder/Kysely directly into DTOs (no entity hydration for lists).
- Side effects via domain events: handler appends events to an `outbox` table in the same transaction as the
  aggregate; a worker (Redis queue) polls/relays the outbox at-least-once; consumers are idempotent
  (dedupe on `event_id`). Never call Stripe/Resend inside the DB transaction.
- Idempotency: `Idempotency-Key` header on all unsafe API endpoints and Server Actions that create
  payments/registrations; store `(key, tenant, request hash, status, response)` in Postgres with a unique
  constraint and 24 h+ TTL; replay returns the stored response; mismatched payload -> 422. Forward a derived
  key to Stripe `idempotencyKey` (<= 255 chars, never PII). Webhook handlers dedupe on Stripe `event.id`.
- Error taxonomy: discriminated-union domain errors (`{ kind: 'MemberNotFound' | 'MembershipExpired' |
  'PaymentDeclined' | ..., ... }`) returned as `Result<T, E>` (neverthrow or a 20-line in-house type) from
  application services; one boundary mapper to RFC 9457 `application/problem+json` (`type` URI per kind,
  `status`, `title`, `detail`, `instance`, `errors[]` for validation) and to Server Action state;
  unexpected errors -> 500 with `traceId` only.
- Feature flags: OpenFeature `@openfeature/server-sdk` with an env/JSON provider now (vendor provider
  later); flags evaluated server-side in the DAL, passed to the client as booleans; kill switches for
  payments/email; remove flags within 2 releases.
- API versioning: URL major version (`/api/v1/...`) for the public REST API; additive changes only within a
  version (new optional fields, new endpoints); deprecation headers (`Deprecation`, `Sunset`) and >= 6
  months overlap for breaking changes; webhooks versioned by event schema version field; never remove or
  rename fields in v1.

### Rationale / evidence
- Stripe idempotency: `Idempotency-Key` header, up to 255 chars, POST only, params compared and mismatches
  error, keys pruned after >= 24 h, V4 UUIDs recommended, no sensitive data in keys. [official]
  https://docs.stripe.com/api/idempotent_requests
- Outbox + idempotent consumers (at-least-once delivery; write outbox rows in the same transaction; Stripe
  keys in handlers; upserts keyed on deterministic ids). [secondary]
  https://warlock.js.org/v/latest/cascade/recipes/outbox-pattern/ ,
  https://oneuptime.com/blog/post/2026-01-27-nodejs-idempotency-keys/markdown
- RFC 9457 Problem Details (obsoletes 7807, 2023-07): `type`, `title`, `status`, `detail`, `instance`,
  extension members; `about:blank` for pure-status errors. [official] https://www.rfc-editor.org/rfc/rfc9457 ;
  TS implementations [secondary] https://github.com/topics/problem-details
- Module boundaries with `eslint-plugin-boundaries` ("modular monolith is about hard separation, not
  folders") and dependency-cruiser entry-point rules. [secondary]
  https://dev.to/przemyslawjanbeigert/modular-monolith-with-the-eslint-boundries-5389
- OpenFeature: CNCF incubating, vendor-neutral evaluation API, Node server SDK `@openfeature/server-sdk`.
  [secondary] https://sdtimes.com/feature-flags/openfeature-feature-flagging-api-becomes-a-cncf-incubating-project/ ,
  https://docs.flagsmith.com/clients/openfeature
- API versioning consensus (URL major versions for public APIs, additive changes, migration guides, long
  overlap). [secondary] https://kodekloud.com/blog/api-versioning-best-practices/ ,
  https://codedamn.com/news/backend/rest-api-versioning-best-practices
- Next.js DAL + `server-only` as the enforcement point for authz and env access. [official] §2 data-security guide.

### Pitfalls
- Domain events dispatched in-process before commit lose consistency on rollback — always via outbox or
  after-commit hooks (MikroORM `afterFlush` is still pre-commit for nested transactions; outbox is safer).
- Outbox relay that is not single-consumer or lacks `FOR UPDATE SKIP LOCKED` double-sends under scale.
- `Money` as floats or as `number` cents without currency leads to cross-currency bugs; use `bigint`/integer
  minor units + currency and reject mixed-currency arithmetic.
- Over-engineering: for a small club app, two bounded contexts with explicit boundaries beat six with
  anaemic models (opinion).
- Throwing domain errors through MikroORM transactions: ensure `em.transactional` rolls back on a returned
  `Err` too (throw a sentinel inside, or use explicit `begin/rollback`).

---

## 13. Alternatives considered (not adopted)

| Alternative | Why not (given the fixed platform) | Sources |
|---|---|---|
| Prisma / Drizzle instead of MikroORM 7 | Open Mercato's modules, migrations and DI assume MikroORM (entities per module, per-request EM). Prisma lacks Unit of Work/identity map and needs its engine binary; Drizzle is SQL-first without UoW — both would mean a second data layer next to the platform's. MikroORM 7 already gives typed Kysely for raw/complex queries, so Drizzle's main benefit is covered. | [secondary] https://www.bytebase.com/blog/top-typescript-orm/ , https://encore.dev/articles/typescript-orms |
| tRPC instead of REST route handlers | Platform exposes REST; external consumers (mobile, partner clubs, Stripe/Resend webhooks) cannot use a TS router type; `trpc-to-openapi` is community-maintained with weak uptake; Server Actions already give typed internal calls. | [secondary] https://blog.val.town/blog/api-conundrum , https://www.wisp.blog/blog/when-to-choose-rest-over-trpc-a-comparative-analysis |
| Vitest instead of Jest 30 | Platform packages/tests/mocks are Jest; CJS ts-jest pipeline works with MikroORM decorators; Jest 30 recovered most performance; migration (jest.mock factories, manual mocks) costs days for little gain now. Revisit if ESM-only deps dominate. | [official] https://jestjs.io/blog/2025/06/04/jest-30 ; [secondary] https://testomat.io/blog/vitest-vs-jest-a-practical-comparison/ |
| pnpm / Turborepo / Nx | Yarn 4 with `nmHoistingLimits: workspaces` is what the platform templates use; pnpm 11.5 only recently mirrored `hoistingLimits`; Turborepo/Nx add a task graph and remote cache that a single-app monorepo with ~5 workspaces does not need — use `yarn workspaces foreach -pt` and GHA caching. Reconsider Turborepo if CI exceeds ~15 min. | [official] https://pnpm.io/blog/releases/11.5 ; https://turbo.build/repo/docs/support |
| Chakra / MUI instead of Tailwind 4 + shadcn | `@open-mercato/ui` is shadcn-based; a second design system doubles tokens, theming and a11y work and fights Tailwind's CSS-variable theming; MUI's Emotion runtime conflicts with RSC-first rendering. | [official] https://ui.shadcn.com/docs/theming |
| NestJS as backend | Open Mercato already provides modules, DI (Awilix), API routes and background jobs inside Next.js; NestJS would mean two servers, two DI containers and duplicated auth. Keep NestJS-style patterns (modules, pipes = Zod, guards = policy function) without the framework. | [opinion] |

---

## Open questions to verify against Open Mercato 0.9.0 source (not researched here)
1. Does `@open-mercato/telemetry` expose OTLP exporter config and pino integration, or only traces?
2. Which Awilix injection mode and `strict` setting the platform container uses (affects §5 choices).
3. Whether platform entities use legacy decorators (`@mikro-orm/decorators/legacy`) — this decides
   `erasableSyntaxOnly` and the decorator flavour for app entities.
4. Whether the platform's API layer already emits OpenAPI (then contract tests consume it instead of
   generating from Zod).
5. Whether the platform ships its own rate limiter / idempotency middleware in 0.9.0.
