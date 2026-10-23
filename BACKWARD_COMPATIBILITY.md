# Backward Compatibility — Vereino

This file lists the **protected contract surfaces** of this repository: what counts as a breaking change, and what a breaking change must do before it merges. Review skills check diffs against it; implementation skills warn when a change violates it.

**Scope and precedence.** This file covers surfaces that Vereino owns or that Vereino tooling, CI and deployment depend on. Open Mercato's own surfaces are governed by `.ai/guides/upstream/BACKWARD_COMPATIBILITY.md` (shipped by `create-mercato-app@0.9.0`, see `.ai/guides/upstream/manifest.json`); where the two disagree, the upstream file wins for `@open-mercato/*` surfaces. Normative sources: engineering standards S1.3, S3.7, S5.4, S6.9, S6.10, ADR-013, ADR-021 (`.ai/specs/2026-10-21-engineering-standards-and-patterns.md`), and the club spec's *Architecture → Compatibility* (`.ai/specs/2026-10-20-vereino-club-management.md`).

## Project stage (2026-10-21)

**Pre-release, pre-implementation.** Evidence: every `package.json` is `0.1.0` and `private`; no git tags, no `CHANGELOG.md`, no release workflow yet (release-please is planned for phase E2, ADR-021); README says "specification / pre-implementation"; club spec is `Status: Draft`; `packages/app/vereino-modules.json` lists `"modules": []`, so **no Vereino module exists yet**. `railway.toml` and `railway.worker.toml` exist, but no environment is documented as live (`docs/ops/deploy.md` is planned for E4, S14.4). There is no known external API consumer.

| Tier | When it starts | Surfaces |
|---|---|---|
| **Protected now** | today | consumed Open Mercato contracts (§9); gate/CI/deploy entrypoints (§7); tooling config formats (§8); every migration once merged to `main` (§5) |
| **Protected at first deployment** | first deploy to a shared environment (Railway `staging`) | Vereino routes, request/response fields, error codes, event IDs and payloads, ACL feature IDs, notification types, scheduler target IDs, DB schema, `VEREINO_*` variable names, root scripts (S6.9; club spec *Compatibility*) |
| **Release-governed** | first release tag; `1.0.0` at pilot go-live | the deprecation window below becomes a version-numbered promise to self-hosting clubs |

**Gap:** confirm that no Railway `staging`/`production` service has been created yet; if one has, move the second tier to "protected now".

## Default path for a breaking change

1. **Prefer additive.** New field, new route, new ID, alias. Additive changes need none of the steps below.
2. **Bridge.** Keep the old name, path, field or ID working next to the new one for at least one minor release (S6.9); mark it `@deprecated` with the target removal version (S3.7) and, for routes, `deprecated: true` in `openApi`.
3. **Mark it.** Conventional Commit with `!` and a `BREAKING CHANGE:` footer (S1.3); release-please bumps the major version, or the minor while below `1.0.0` (S6.10).
4. **Document it.** `CHANGELOG.md` entry with operator upgrade notes (ADR-021). **Gap:** `CHANGELOG.md` does not exist yet; until release-please lands (E2) record the change in the PR description and the governing spec's Changelog.
5. **Spec.** A Changelog row in the governing spec (S1.6) and a *Rollout, Migration, and Rollback* note; tick the PR template box "Contract surface changed?" (`.github/PULL_REQUEST_TEMPLATE.md`).
6. **Ask first.** Public contracts, migrations and DB targets are Ask First (`AGENTS.md`).

Before the first deployment, a Vereino-owned surface with only in-repo consumers may change in one PR that updates every consumer, with step 5 still required.

## Surface inventory

### 1. Workspace package exports — `@vereino/core`, `@vereino/db`, `@vereino/ui`
- **Where:** `packages/{core,db,ui}/package.json` → `"exports": { ".": "./src/index.ts" }`; each `src/index.ts` is currently `export {}`. Only consumer: `@vereino/app` (`workspace:*` in `packages/app/package.json`, `transpilePackages` in `packages/app/next.config.ts`, `@source` for ui in `packages/app/src/app/globals.css`). Not published.
- **Breaking:** removing or renaming an export; narrowing a signature or type; adding a subpath to `exports` (invites deep imports, which `AGENTS.md` forbids); a package importing `@vereino/app` or reversing `app → ui | db → core`.
- **Path:** internal; change all call sites in the same PR; `yarn typecheck` and `yarn typecheck:packages` must pass. Becomes a public contract only if a package is ever published (**Gap:** no plan in the repo).

### 2. HTTP API routes and OpenAPI
- **Where:** none Vereino-owned yet. Planned under `packages/app/src/modules/<id>/api/**/route.ts` (`makeCrudRoute`, per-method `metadata`, separate `openApi` export; catalogue in club spec *API, Command, and Error Contracts*, e.g. `/api/club_core/sections`, `/api/people/me`). OpenAPI is served by the `api_docs` module (`packages/app/src/app/api/docs`). The scaffold modules `example`, `example_customers_sync`, `ratelimit_probe`, `agent_examples` are **not** Vereino-owned (S3.1) and are not enabled in `src/modules.ts` (`agent_examples` only behind enterprise flags, off per ADR-023).
- **Platform URLs relied on now:** `/api/healthz` (`railway.toml` health check, S15.4); `/login` (readiness probe in `.github/workflows/ci.yml` jobs `browser-smoke` and `perf`).
- **Breaking:** removing or renaming a path or method; removing or renaming a response key; narrowing a request field (optional → required, wider → narrower enum); changing the list shape `{ items, total, page, pageSize, totalPages }` (S6.4), the error body `{ error, code }` (S6.7), camelCase keys, ISO 8601 UTC instants, integer grosz + `currency` (S6.3–S6.6), or 400 (missing lock token) / 409 (stale `updatedAt`) semantics (S5.2); accepting `tenantId`/`organizationId` from the payload.
- **Path:** default path; no URL versioning (S6.9). **Gap:** OpenAPI diff gate (`oasdiff`) once `api_docs` can emit a file (S6.9, after E3); until then review enforces it.

### 3. Machine error codes
- **Where:** `packages/app/src/modules/<id>/lib/error-codes.ts` (`errorCodes` array), checked by `yarn contracts:check` (`packages/app/scripts/check-vereino-contracts.mjs`): lower snake_case, unique app-wide, reserved platform codes rejected, `messageKey` present in `en` and `pl`.
- **Breaking:** renaming or removing a code, changing its HTTP status, reusing a retired code with a new meaning. **Path:** default path; add the new code first.

### 4. Module, framework and extension IDs
Stable IDs per `.ai/review-checklist.md` and `.ai/guides/contracts.md` → *Frozen Surfaces*. None Vereino-owned exist yet; the club spec fixes the planned names.

| ID kind | Declared in | Planned examples |
|---|---|---|
| Module ID | `src/modules.ts` `{ id, from: '@app' }` + `packages/app/vereino-modules.json` | `club_core`, `people`, `groups`, `activities`, `communication`, `payments`, `facilities` |
| ACL feature | `acl.ts`, granted in `setup.ts` `defaultRoleFeatures` | `people.view`, `payments.cash.record` |
| Role key | `setup.ts` seeds | `vereino_payer`, `vereino_treasurer`, `vereino_member` |
| Event ID + payload | `events.ts` via `createModuleEvents` | `activities.occurrence.cancelled` |
| Command ID | `commands/*.ts` | `people.persons.create_account` |
| DI token | `di.ts` | `people.scopeService` (club spec data flow; **Gap:** final registration keys) |
| Notification type | `notifications.ts` | `activities.coach_needed` |
| Scheduler target | module scheduler config | `people:sync-role-expiry`, `payments:generate-charges` |
| Search entity, `extensionTableId`, `CrudForm`/enricher entity ID, widget/injection spot | `search.ts`, pages, `widgets/injection-table.ts` | colon-form IDs, set per module |

- **Breaking:** renaming or removing any ID; removing a required event-payload field; changing a DI service interface incompatibly; removing an ACL feature still granted to a role.
- **Path:** default path; for events emit old and new IDs during the bridge; an ACL change also updates `setup.ts` and runs `yarn mercato auth sync-role-acls` in pre-deploy (ADR-013).

### 5. Database schema and migrations
- **Where:** MikroORM 7 + PostgreSQL 17 (pgvector image). Entities in `src/modules/<id>/data/entities.ts`; migrations `src/modules/<id>/migrations/Migration*.ts` with `.snapshot-open-mercato.json`. Today only the non-Vereino scaffold modules `example` and `example_customers_sync` ship migrations, and they are not enabled.
- **Breaking:** editing a migration merged to `main` (immutable, S5.4); renaming or dropping a table or column; narrowing a type; adding a NOT NULL column without default to a populated table; changing the standard columns (`id`, `tenant_id`, `organization_id`, `created_at`, `updated_at`, `deleted_at`).
- **Path:** corrective migration only; expand/contract across two releases (add nullable → backfill → enforce → switch code → drop later); drop needs a product-owner decision and a verified backup; `lock_timeout = '5s'`; `CREATE INDEX CONCURRENTLY` in its own idempotent migration; `down()` for additive steps; value rewrites on indexed entities declare `declareQueryIndexReindex`; new encryption maps on deployed modules ship backfill SQL (S5.6). Migrations are CODEOWNERS paths and Ask First before commit. Rollback never runs `down()` (S14.6).

### 6. i18n keys and locales
- **Where:** each Vereino module's `i18n/en.json` + `i18n/pl.json` (both required; key parity checked by `yarn contracts:check`; hard-coded strings by `yarn i18n:check-hardcoded --strict`). App catalogs `packages/app/src/i18n/{de,en,es,ko,pl}.json` are platform-owned.
- **Breaking:** removing `en` or `pl`; removing or renaming a key still referenced by code, `page.meta.ts` (`pageTitleKey`, `pageGroupKey`) or an error code's `messageKey`. Keys are internal: change them in the same PR as their references. Adding a locale is additive.

### 7. Scripts and CLI entrypoints
- **Relied on by CI** (`.github/workflows/ci.yml`): `yarn verify`, `yarn test:integration:vereino`, `yarn test:integration:vereino:start` (default port `5001`), `packages/app/.ai/qa/agent-browser/login-smoke.mjs`. **By agents and skills:** `yarn verify` (`AGENTS.md` → Validation, `.ai/agentic.config.json` `validation.commands`), its step names for `--from <step>` and `--list` (`scripts/verify.mjs` `STEPS`), `--filter <TEST-ID>` of `packages/app/scripts/vereino-ephemeral.mjs`. **By Railway:** `scripts/railway-start.sh`, `scripts/railway-worker.sh`. **By README/docs:** `setup`, `dev`, `generate`, `db:generate`, `db:migrate`, `mercato`, `format`, `initialize`.
- **Breaking:** removing or renaming a script, flag or step; changing exit-code semantics; changing the default port or a script path that CI or Railway calls.
- **Path:** keep the old name as an alias for one minor release (root scripts are in S6.9); update `ci.yml`, `AGENTS.md`, `.ai/agentic.config.json` and README in the same PR. Check names in `ci.yml` (`gate`, `integration`, `browser-smoke`, `pr-title`) are required in the GitHub ruleset: renaming one requires updating `docs/ops/github-settings.md`.

### 8. Configuration formats and environment
- `.ai/agentic.config.json` (`"version": 1`; keys `baseBranch`, `tracker`, `browser`, `validation`, `labels`, `qaGate`, `engine`, `reviewChecklist`, `paths.*` read by `om-*` skills; tracker and browser descriptors in `.ai/trackers/`, `.ai/browsers/`). Change via `om-setup-agent-pipeline`, bump `version` on incompatible change.
- `packages/app/vereino-modules.json` (`modules` array read by lint, format, i18n, coverage and `contracts:check` through `packages/app/scripts/vereino-paths.mjs`).
- `packages/app/.env.example`: variable names are platform-owned (`DATABASE_URL`, `JWT_SECRET`, `AUTH_SECRET`, `TENANT_DATA_ENCRYPTION_*`, `OM_*`). Vereino variables use the `VEREINO_` prefix and are protected from first deployment (S6.9, S8.10). **Gap:** the only one so far, `VEREINO_IT_POSTGRES_IMAGE` (test runner), is not listed in `.env.example`.
- `railway.toml` / `railway.worker.toml` (`healthcheckPath`, `startCommand`), `Dockerfile` (non-root `omuser`, S14.8), `docker-compose*.yml` service names (`postgres`, `redis`), `.nvmrc` and `engines.node >=24`.
- **Breaking:** renaming or removing a key or variable, changing its meaning or default, changing a start command or health path. **Path:** default path plus an operator note in `CHANGELOG.md`; CODEOWNERS covers Railway, Docker and `.github/**`.

### 9. Consumed Open Mercato contracts (protected now)
- `@open-mercato/*` pinned exactly at `0.9.0` (P1); module discovery conventions, `makeCrudRoute`, `createModuleEvents`, command registry, `#generated/*` imports (`packages/app/package.json` `imports`), digested in `.ai/guides/framework-contracts.md`.
- **Breaking:** any change that relies on behaviour outside the upstream contract, edits `node_modules` or `.mercato/generated/**`, or patches a platform-owned file not on the S3.1 local-patch list. **Path:** upgrades only in an upgrade run on `chore/upgrade-open-mercato-<version>` with a run log (P1). **Gap:** `CONTRIBUTING.md` (live local-patch list) does not exist yet.

### 10. Other surfaces
- **Webhooks:** none enabled (`@open-mercato/webhooks` installed, not in `src/modules.ts`). Planned Stripe webhook via `payment_gateways` (club spec phase 4, S10.8): event handling must stay idempotent; endpoint URL is protected from first deployment.
- **Queues/workers:** none Vereino-owned. Planned persistent subscribers and scheduler targets (§4) keep payload shape and idempotency keys stable.
- **Public URLs:** none Vereino-owned yet. Planned `/p/[clubSlug]/…`, `/club/…` and e-mailed personal links (`/club/o/[token]`); links already sent by e-mail must keep resolving. **Gap:** token lifetime policy.

## How agents use this file
- **Review** (`om-code-review`, `om-auto-review-pr`, `om-pre-implement-spec`): map every changed path to a section above; a breaking change without the default path is a blocking finding.
- **Implementation** (`om-module-scaffold`, `om-data-model-design`, `om-auto-create-pr`, …): before editing a listed surface, state the tier and stop to ask the user when the change is breaking.
- Check the tier table first: before the first deployment, in-repo-only surfaces may change in one PR that updates every consumer.
- `AGENTS.md` currently points contract changes to the upstream file only. **Gap:** add a pointer to this file (Ask First).

## Breaking-change checklist
- [ ] Surface identified (section number) and tier stated.
- [ ] Additive alternative considered and rejected for a stated reason.
- [ ] Bridge in place for at least one minor release; `@deprecated` / `deprecated: true` with target version.
- [ ] Commit/PR title uses `!` and a `BREAKING CHANGE:` footer.
- [ ] `CHANGELOG.md` entry with operator upgrade notes (or PR description until E2).
- [ ] Governing spec updated: Changelog row and *Rollout, Migration, and Rollback* note.
- [ ] Migrations: new corrective migration, expand/contract, no edit to a merged migration, SQL in the PR.
- [ ] Consumers updated in the same PR: code, `ci.yml`, `AGENTS.md`, `.ai/agentic.config.json`, README, `docs/ops/`.
- [ ] `yarn verify` green; `yarn test:integration:vereino --filter <TEST-ID>` for affected routes.
- [ ] User approval recorded for public contracts, migrations or DB targets.
