# Vereino engineering standards and patterns

**Date**: 2026-10-21
**Status**: Draft

> Related: product spec `.ai/specs/2026-10-20-vereino-club-management.md` (the "club spec"); research inputs `.ai/specs/research/engineering-standards/a-platform-conventions.md` ("research A"), `b-ecosystem-practices.md` ("research B"), `c-domain-concerns.md` ("research C"); run log `.ai/runs/2026-10-21-engineering-standards.md`.
>
> Identifiers in this spec use their own prefixes so they never clash with the club spec: goals `ENG-01…`, decisions `ADR-001…`, standards `S1…S19` with rules `S1.1…`, pin rules `P1…`, journeys `EJ-01…`, tests `ENG-TEST-01…`, acceptance criteria `ENG-AC-01…`, questions `ENG-Q-01…`. References such as `DD-35`, `V-5`, `Q-019` or `TEST-007` point into the club spec.

## TLDR

Vereino has a detailed product spec but no written engineering process: no CI, three different validation command lines, no formatting or strict linting for Vereino code, no convention for error codes, pagination or timestamps, and no backup, release, dependency or compliance policy for an application that will hold children's data and club money. This spec fixes the stack baseline and its pin policy, records twenty-three architecture decisions (ADR-001 … ADR-023) — among them keeping Open Mercato for 1.0 with measurable exit criteria — and sets nineteen standards (S1 … S19) that close the 24 gaps found in the platform and repository rules (research A §12). It reuses what the platform already ships (logger, rate limiter, webhook verification, telemetry, queue, scheduler, field encryption, error helpers, `makeCrudRoute`, `DataTable`/`CrudForm`, `ds:check`, the agent harness) and adds only repository tooling, configuration, documents and conventions. The smallest coherent outcome is phase E1: one gate command, `yarn verify`, run identically by developers, AI agents and GitHub Actions, and required for every merge to `main`.

## Problem Statement

Current workflow: two maintainers and AI agents commit straight to `main` following `AGENTS.md`; quality depends on each author remembering to run the right commands. Evidence collected on 2026-10-21 (research A §12, installed packages, repository files):

- **No CI and no merge protection.** The repository has no `.github/` directory. `github.com/wladku/Vereino` is public, so a red `main` is visible to every future contributor, and nothing stops it.
- **Validation drift.** Three different gate lines exist: `AGENTS.md` (no i18n check), the club spec's per-phase line (adds `yarn i18n:check-hardcoded`), and `.ai/agentic.config.json` (no `typecheck:packages`, no i18n check). The i18n check exits 0 on findings although the club spec requires it "green".
- **Permissive tooling.** ESLint is `eslint-config-next/core-web-vitals` with seven React rules switched off; there is no Prettier, no `.editorconfig`; Jest runs with `passWithNoTests: true` and ts-jest `diagnostics: false`; the upstream "no `any`" rule is not enforced anywhere.
- **Undecided API conventions.** The club spec writes list responses as `{ items, totalCount }`, while the installed CRUD list schema is `{ items, total, page, pageSize, totalPages }`; machine error codes (`occurrence_place_conflict`, `declaration_closed`, …) are invented per route with no registry; date/time and money serialisation are unstated.
- **Unproven test infrastructure.** The platform ships `packages/app/.ai/qa/tests/playwright.config.ts` (spec discovery, `retries: 1`, GitHub reporter), but no integration test exists yet, the runner has never run in CI, and there are no shared fixtures and no accessibility or performance check.
- **Unsafe deployment defaults.** `scripts/railway-start.sh` runs `docker/scripts/init-or-migrate.sh` at every container start; its "already initialised" marker lives in `/tmp`, so every start first attempts `yarn initialize` and only falls back to migrations when users exist — an empty or wrong `DATABASE_URL` in production would be silently initialised, and two replicas would race on migrations. No backup, restore, release or rollback procedure exists.
- **Security and privacy gaps.** The scaffold CSP allows `'unsafe-inline' 'unsafe-eval'` and sends no HSTS; there is no DPIA, processor register, retention schedule or breach register; legal facts that shape the design (Polish digital-consent age, accounting retention) exist only as unverified research notes.
- **Platform decision without criteria.** The product owner asked whether Open Mercato is worth keeping and decided to keep it with exit criteria (2026-10-21), but neither the criteria nor the portability rules that keep an exit affordable are written down.
- **Conflicting advice.** Ecosystem research (research B) recommends a `version` column, RFC 9457 errors, Server Actions, OpenFeature and `/api/v1` URLs — each of which conflicts with an installed platform mechanism. Without a decision record, contributors and agents follow whichever source they read last.

Affected: the two maintainers, AI agents, future outside contributors, and the pilot club (≈200 players, most of them children, plus their guardians' payment data).

## Overview and Success Measures

- **Primary outcome:** after phase E1, 100 % of commits on `main` arrive through a pull request whose required checks (`gate`, `integration`, `pr-title`, `DCO`) passed — enforced by a GitHub ruleset — except merges recorded under the S1.8 break-glass procedure; every one of the 24 gaps of research A §12 has a named rule in this spec now (24/24 in the *Gap closure map*) and is implemented by the phase that map names (19 gaps by E2, all 24 by E5).
- **Leading indicators:** `gate` job wall time p50 ≤ 15 min; Renovate pull requests merged or closed within 7 days; exactly one gate command referenced across `AGENTS.md`, `.ai/agentic.config.json`, CI and the club spec; platform-upgrade hours per month taken from upgrade run logs (ADR-001 exit input); first restore drill RTO ≤ 60 min.
- **Baseline:** 0 CI checks; 3 gate lines; 0/24 gaps closed; 0 compliance documents; backup state of the hosting environment unknown (measured in E4).
- **Market / product reference:** practices of the stack's own vendors and of small open-source SaaS projects (research B §1–§12, research C §9). Adopted: typed linting, Prettier as a separate check, release-please with Conventional Commits, Renovate with a release-age gate, DCO, Contributor Covenant, `SECURITY.md` with private reporting, OWASP ASVS L2 as target, WCAG 2.2 AA, Core Web Vitals budgets, axe-core scans, PITR plus off-site logical dumps, quarterly restore drills. Rejected because the platform already provides the mechanism: Turborepo/Nx, Vitest, Prisma/Drizzle, tRPC, NestJS, Server Actions for domain mutations, OpenFeature, RFC 9457, URL versioning, `version`-column locking (see *Design Decisions and Alternatives*).

## Goals

- **ENG-01** — The stack baseline and pin policy are written, and installs, Renovate and upgrades enforce them.
- **ENG-02** — Open Mercato stays for 1.0 under ADR-001: portability rules are followed, the exit criteria are measurable, and a recorded checkpoint decision follows the platform spike.
- **ENG-03** — One canonical gate command (`yarn verify`) is used by developers, agents, `.ai/agentic.config.json`, the club spec and CI; every step in it is blocking.
- **ENG-04** — CI on GitHub Actions blocks every merge to `main` that fails a required check.
- **ENG-05** — TypeScript, lint and formatting rules for Vereino-owned code are enforced by tooling, not by memory.
- **ENG-06** — Module, command, API and error conventions are fixed; module boundaries, the app-wide error-code registry and catalog parity are machine-checked, the rest is checked in review.
- **ENG-07** — Data, migration and tenant-isolation rules are fixed, and the PostgreSQL row-level-security question is decided with evidence.
- **ENG-08** — A security baseline (headers, cookies, sessionless routes, tokens, webhooks, secrets, uploads) is in place before pilot data.
- **ENG-09** — A compliance pack (records of processing, DPIA, processor and breach registers, retention schedule, data-subject procedure, privacy notices) is approved before the first real person is entered.
- **ENG-10** — An operations baseline (environments, deploy and rollback, backups and a passed restore drill, health checks, alerts, SLOs, runbooks) is in place before pilot data.
- **ENG-11** — The testing policy is fixed and its harness works: unit, integration, accessibility and performance checks run locally and in CI.
- **ENG-12** — Dependency, licence, vulnerability and release policies run automatically (Renovate, audit, licence check, release-please).
- **ENG-13** — The repository meets open-source hygiene for an MIT project: contribution guide, code of conduct, security policy, DCO, templates, code owners.
- **ENG-14** — The domain-specific entities, jobs and tests found in research C are handed into the club spec as amendments; this spec keeps only the cross-cutting patterns (S10 … S12).

## Non-goals

- No second framework, ORM, query builder, DI container, CSS framework or component library (`AGENTS.md` → Stack). No Turborepo, Nx, pnpm, Vitest, Prisma, Drizzle, tRPC or NestJS.
- No Server Actions for domain mutations, no feature-flag framework, no RFC 9457 response format and no URL versioning in 1.0 (ADR-005, ADR-007, ADR-019, S6.9).
- No product features: entities, routes and pages belong to the club spec. This spec only proposes amendments to it (phase E5).
- No reformatting or re-linting of platform-owned scaffold code; the stricter rules apply to Vereino-owned paths only (S3.1).
- No publishing of `@vereino/*` packages to npm and no Changesets.
- No PR preview environments, no multi-region deployment, no on-call rota beyond the stated best-effort SLO.
- No contributor licence agreement, no paid bug bounty.
- No mutation testing and no global coverage threshold (coverage is enforced only for pure domain code, S13.6).
- No service worker or web push in 1.0 (club spec Q-002); a web manifest only.

## Proposed Solution

The solution has three layers. First, a **stack baseline with a pin policy** and a **decision record** (ADR-001 … ADR-023) that settles every point where ecosystem advice and the platform disagree. Second, **nineteen standards** (S1 … S19); each rule is phrased so a reviewer or a tool can decide pass/fail — rules marked *(guidance)* are judged in review only — and each names the platform mechanism it reuses. Rules that restate a platform or `AGENTS.md` rule do so in one line with the source, so contributors find the whole picture in one place; the source stays authoritative. Third, **five dependency-ordered phases**: E1 builds the gate and CI and aligns the club spec with the API conventions, E2 automates dependency, licence and release hygiene, E3 runs the platform spike and the ADR-001 checkpoint, E4 establishes the operations and security baseline before pilot data, E5 produces the compliance pack and hands domain requirements to the club spec.

S10 … S12 are cross-cutting patterns (how money, time and e-mail are handled anywhere in the app); the concrete entities, jobs and tests that implement them belong to the club spec and are handed over in E5 (ENG-14).

This is the smallest platform-native solution because it adds no runtime framework and no app entity: everything runtime-related is a rule about how to use what is installed. The few new tools (Prettier, typescript-eslint, jsx-a11y, eslint-plugin-boundaries, axe-core, GitHub apps) are development-time only and need the product owner's approval (ENG-Q-01).

**Precedence.** Root `AGENTS.md` → `.ai/guides/upstream/BACKWARD_COMPATIBILITY.md` → installed package `AGENTS.md` files → this spec → research notes. This spec never silently overrides `AGENTS.md`: where a rule here changes agent behaviour (the gate command, the branch and pull-request workflow, DCO sign-off, the error-code registry), phase E1 updates `AGENTS.md` in the same pull request, and the S8.6 system-scope exception is added to `AGENTS.md` only in E3, with the product owner's approval. After implementation this spec remains the normative explanation ("what and why"); `CONTRIBUTING.md` is the human summary and `AGENTS.md` carries only the hard boundaries agents must not miss.

### Stack baseline and pin policy

Versions are those installed in `packages/app/node_modules` on 2026-10-21.

| Layer | Technology | Version | Pin rule |
|---|---|---|---|
| Runtime | Node.js; Docker `node:24-alpine` | ≥ 24 (root `preinstall` guard, `engines`) | P3; Docker base pinned by digest in E4 |
| Package manager | Yarn workspaces, `nodeLinker: node-modules`, `nmHoistingLimits: workspaces` | 4.17.1 (`packageManager` with hash) | exact via `packageManager`; Corepack |
| Platform | `@open-mercato/*` | 0.9.0 (every package identical) | P1 |
| Web framework | Next.js App Router | 16.3.6 (exact in app) | P2 |
| UI runtime | React, React DOM | 19.2.8 (exact in app) | P2 |
| Language | TypeScript (strict) | 6.0.3 | P3 |
| ORM | MikroORM, legacy decorators | 7.2.5 resolved from `^7.1.14` | P2 |
| Database | PostgreSQL | 17 (`pgvector/pgvector:pg17-trixie` locally) | production image chosen in E3/E4 (S15.7) |
| Cache and queue | Redis | 7 (`redis:7-alpine` locally) | P3 |
| DI | Awilix (platform container, `InjectionMode.CLASSIC`) | 13.0.5 | P2 |
| Validation | Zod | 4.4.3 (root `resolutions`) | P2 + P4 |
| Styling | Tailwind CSS + shadcn/ui through `@open-mercato/ui` | 4.3.3 | P3 |
| Dates and time zones | `date-fns`, `date-fns-tz` | 4.4.0 (exact), `^3.2.0` | P2 for `date-fns`, P3 for `date-fns-tz` |
| Unit tests | Jest + ts-jest (`scripts/jest-mikroorm-transformer.cjs`) | 30.5.2 / ts-jest 29.4.15 | P3 |
| Integration / E2E | Playwright through `yarn test:integration:ephemeral` | 1.64.1 resolved from `^1.58.2` | P3 |
| Lint | ESLint 9 flat config + `eslint-config-next` | 9.39.5 / 16.3.6 | P3 / P2 |
| Hosting | Railway, Dockerfile builder, health check `/api/healthz` | — | ADR-012 |
| Payments | Stripe through `@open-mercato/gateway-stripe` | 0.9.0 | P1 |
| E-mail | Resend through `@open-mercato/channel-resend` (subject to club spec V-4) | 0.9.0 | P1 |
| Logs and telemetry | pino-based `@open-mercato/shared/lib/logger`; `@open-mercato/telemetry` (OpenTelemetry) | 0.9.0 | P1 |

Pin rules:

- **P1** — `@open-mercato/*` packages are pinned exactly and are always the same version. They change only in an upgrade run that follows the matching `.ai/skills/om-auto-upgrade-<from>-to-<to>` skill, on its own branch `chore/upgrade-open-mercato-<version>`, with a run log that records the hours spent (input to ADR-001). Renovate never touches them.
- **P2** — Packages the scaffold pins exactly (`next`, `react`, `react-dom`, `eslint-config-next`, `pg`, `date-fns`) and platform-coupled packages (`@mikro-orm/*`, `awilix`, `zod`) move only together with a P1 upgrade. Renovate ignores them.
- **P3** — Every other dependency uses a caret range in the `package.json` of the workspace that uses it; `yarn.lock` is the exact pin; CI installs with `yarn install --immutable`.
- **P4** — `resolutions` exist only to force a single copy or a security fix. Each entry is listed with its reason and removal condition in `CONTRIBUTING.md` → *Pinned and overridden dependencies*.
- **P5** — `npmMinimalAgeGate: 5d` stays. `--no-time-gate` is allowed only for a security fix and is named in the pull request description.
- **P6** — Security exception to P1/P2: when an advisory requires it (S16.3), a P2 package may take a patch release, or a P1 platform patch may be applied, outside a full upgrade run, on a `fix/security-<package>` branch with a run log and the full gate and integration suite.

### Design Decisions and Alternatives

| Decision | Rationale | Alternative considered | Why rejected / deferred |
|---|---|---|---|
| **ADR-001** Keep Open Mercato 0.9.0 for 1.0, with exit criteria. Portability rules: domain logic as pure functions in `src/modules/<id>/lib/` (later `@vereino/core`) without `@open-mercato/*`, MikroORM, React or Next.js imports; Zod schemas framework-free; no CRM, commerce or AI modules enabled. Checkpoint after the E3 spike (club spec V-1 … V-12). Exit trigger: blockers in at least two key areas (member/guardian auth, tenancy and scope, payments gateway, member frontend pages, i18n) **or** platform upgrades costing more than one working day per month averaged over a quarter (hours from upgrade run logs). Exit target: a lean stack with the same technologies without the framework, decided before club phase 2. | The platform already provides modules, RBAC, tenant scope, field encryption, audit and undo, the CRUD factory, admin UI primitives, queue, scheduler, a Stripe gateway and a Resend channel; rebuilding them would consume the phase-1 budget. Product owner decision, 2026-10-21 ("Zostajemy, z kryteriami wyjścia"). | Lean stack now (Next.js + MikroORM + Awilix without the framework) | Rebuilds installed capabilities before the pilot proves the product; the portability rules keep the exit affordable. |
| **ADR-002** Yarn 4 workspaces with `yarn workspaces foreach -Apt`; GitHub Actions cache. | Five workspaces and one deployable app need no task graph; the platform templates use Yarn 4 with `nmHoistingLimits: workspaces`. | Turborepo, Nx, pnpm | Remote cache and task graph add configuration for no measured gain. Revisit when `gate` p50 exceeds 15 min. |
| **ADR-003** Jest 30 + ts-jest for unit and component tests; Playwright through the platform runner (`yarn test:integration:ephemeral`) for integration and UI tests; `@axe-core/playwright` for accessibility. | The platform's Jest configuration and MikroORM decorator transformer already work; the ephemeral runner provides a real database. | Vitest; Testcontainers | Vitest would require re-tuning the decorator and ESM pipeline. Testcontainers is deferred: the ephemeral runner covers database tests; reconsider only if `@vereino/db` helpers need database tests outside the app runner. |
| **ADR-004** Entities use legacy decorators from `@mikro-orm/decorators/legacy` with `experimentalDecorators` and `emitDecoratorMetadata`, as the app `tsconfig.json` and the platform do. `erasableSyntaxOnly` is allowed only in `@vereino/core`. | One metadata style across platform and app entities; generators and examples use decorators. | `defineEntity` (decorator-free) | Mixing two entity styles in one ORM metadata set is unverified against the platform; no benefit for 1.0. |
| **ADR-005** Mutations go through REST routes built with `makeCrudRoute` or custom guarded routes that dispatch registered commands. UI writes use `CrudForm`, `useGuardedMutation` or `apiCall`. | Commands carry audit, undo, events, indexing, cache invalidation, interceptors and mutation guards in one path (research A §3). | Server Actions; tRPC | A Server Action or tRPC procedure would be a second business path that bypasses interceptors and guards. |
| **ADR-006** Optimistic locking uses `updated_at`: lists and details return `updatedAt`; clients send the version in the platform header (`buildOptimisticLockHeader`) or as `expectedUpdatedAt`; Vereino commands require the token for every user edit (S5.2). | `CrudForm`, `assertOptimisticLock` and `surfaceRecordConflict` key on `updated_at`. | Integer `@Property({ version: true })` | A second locking mechanism would diverge from the platform UI and command helpers. |
| **ADR-007** Errors: platform helpers (`badRequest`, `forbidden`, `notFound`/`assertFound`, `conflict`) for uncoded errors; business errors that a client must react to carry a machine `code` from an app-wide registry (S6.7). Body: `{ error, code? }`. | Platform clients (`apiCall`, `CrudForm`, `surfaceRecordConflict`) parse `{ error }`; a stable code lets the UI translate without parsing text. | RFC 9457 `application/problem+json` | Breaks platform client helpers. Deferred until a separately versioned public API exists. |
| **ADR-008** Tenant isolation: primary controls are the platform's trusted scope, `makeCrudRoute` scope checks, `people.scopeService` (club spec) and scoped decryption reads, plus two-tenant tests on every route (S13.4). PostgreSQL row-level security as defence in depth is decided by the E3 spike, not assumed. | The platform connects with one database role and runs migrations, query indexing and system-scope operations; RLS the platform bypasses gives false confidence, RLS that breaks platform jobs blocks delivery. | RLS on every tenant table now; no defence in depth | RLS now: unverified against platform internals. No defence in depth: rejected — the two-tenant tests and the raw-SQL rule (S5.8) apply regardless of the spike result. |
| **ADR-009** Money: integer minor units (grosz) with a currency column; rates as `numeric`; half-up rounding once, when a derived amount is stored; largest-remainder allocation; corrections only by reversing entries; gap-free document numbers from a per-organization sequence row locked `FOR UPDATE`; formatting only at the view boundary with `Intl.NumberFormat`. | Matches the club spec (`amount int`, KP/RG numbering) and Polish accounting rules for vouchers (research C §2). | Decimal library or `numeric` arithmetic in app code; full double-entry ledger | Decimals invite drift between rule and stored amount. Double-entry is deferred: the charge/payment ledger with reversals covers a club. |
| **ADR-010** Online payments: hosted Stripe Checkout through `gateway_stripe` (`payment_gateways`) with dynamic payment methods, BLIK and Przelewy24 enabled; fulfilment is idempotent and runs on the webhook and on the return page; webhook events are de-duplicated by Stripe `event.id`. | Smallest PCI scope (card data never reaches Vereino), SCA handled by Stripe, Polish methods supported by Stripe (research C §3). Depends on club spec V-5. | Payment Element on Vereino pages; own P24/PayU adapter | Payment Element widens PCI scope and CSP; an own adapter was rejected by club spec Q-003. |
| **ADR-011** Transactional e-mail through Resend (`@open-mercato/channel-resend`) if club spec V-4 confirms it as the platform transport; sending region `eu-west-1`; dedicated sending subdomain; DKIM, SPF via a custom Return-Path, DMARC `p=none` moving to `p=quarantine`; no open or click tracking. | Platform-native channel already installed; EU sending region; deliverability requirements of Gmail and Yahoo (research C §5). | Environment SMTP; Amazon SES (`channel-ses`) | SMTP is the fallback if V-4 shows it is the platform transport. SES adds an AWS account to operate. |
| **ADR-012** Hosting on Railway, region EU West (Amsterdam) for app, worker, PostgreSQL and Redis; environments `staging` and `production`; backups in three layers: PITR, volume snapshots, nightly encrypted `pg_dump` to an EU storage at a different provider. | The repository already ships `railway.toml`, `railway.worker.toml` and start scripts; a two-person team cannot run its own infrastructure. | Self-managed VPS; Vercel | VPS: operations burden. Vercel: no long-running worker, database elsewhere. Residual: Railway and Resend process logs and metadata in the US — documented in the processor register (S9.7). |
| **ADR-013** Production migrations run once per deploy in Railway's pre-deploy step (`yarn db:migrate` then `yarn mercato auth sync-role-acls`); the production start command never runs `yarn initialize`. | The scaffold's boot-time `init-or-migrate.sh` keeps its marker in `/tmp`, so every start attempts initialisation; with an empty or wrong database URL production would be initialised silently, and replicas would race. | Keep the scaffold boot-time script | Acceptable for local and staging first boot only. |
| **ADR-014** Time: instants stored as `timestamptz` in UTC; recurrences stored as RRULE + local start + duration + IANA zone (club setting, default `Europe/Warsaw`) and expanded in that zone with `date-fns-tz`; API instants in ISO 8601 UTC. | Keeps "17:00 every Tuesday" at 17:00 local across daylight-saving changes (club spec risk row); `date-fns-tz` is already installed. | Luxon; Temporal | Luxon duplicates an installed library. Temporal deferred until it is available without flags in the Node LTS the platform supports. |
| **ADR-015** CI on GitHub Actions: workflow `ci.yml` with jobs `gate`, `integration`, `perf`, `pr-title`, `dependency-review`; CodeQL default setup; DCO GitHub app; third-party actions pinned by commit SHA; least-privilege `permissions`. | The repository is public on GitHub, so Actions minutes, CodeQL and rulesets are free; Railway builds cannot run integration tests with a database. | Railway build checks only | No pull-request gating, no database for integration tests. |
| **ADR-016** Renovate (GitHub app) for dependency updates: weekly, grouped, `minimumReleaseAge` 5 days, weekly lock-file maintenance, P1/P2 packages ignored, no automerge in 1.0. Dependabot alerts stay enabled. | Finer grouping and a release-age gate aligned with Yarn's `npmMinimalAgeGate`. | Dependabot version updates | Weaker grouping and no shared age gate. |
| **ADR-017** Formatting with Prettier 3 (`semi: false`, `singleQuote: true`, `trailingComma: 'all'`, `printWidth: 120`) plus `prettier-plugin-tailwindcss`, checked by `yarn format:check`, only on Vereino-owned paths; `.editorconfig` for all files. | Matches the scaffold's own style (example module: no semicolons, single quotes, trailing commas, lines up to ≈120). | Biome; `eslint-plugin-prettier` | Biome would replace the ESLint configuration the platform ships; running Prettier inside ESLint is slow and noisy. |
| **ADR-018** Lint: keep `eslint-config-next/core-web-vitals` for the whole app; add, for Vereino-owned paths only, `typescript-eslint` `strictTypeChecked` with `projectService`, `eslint-plugin-jsx-a11y` recommended, `eslint-plugin-boundaries` for module and package boundaries, and re-enable the React rules the scaffold switches off. | Strictness where Vereino owns the code, no churn in platform-owned scaffold files. | Strict rules on the whole app | Would force edits to platform-owned files that upgrades overwrite. |
| **ADR-019** No feature-flag framework in 1.0. Switches: module enablement in `src/modules.ts` per phase, club settings for product behaviour, environment kill switches for external side effects (`VEREINO_EMAIL_SENDING_ENABLED`, `VEREINO_ONLINE_PAYMENTS_ENABLED`). | One club per instance and two maintainers; the switches above cover rollout and incidents. | OpenFeature with an environment provider | Deferred until multi-club hosting needs per-tenant rollout. |
| **ADR-020** Accessibility target WCAG 2.2 level AA; performance budgets at the 75th percentile on mobile: LCP ≤ 2.5 s, INP ≤ 200 ms, CLS ≤ 0.1 (field targets); in CI the lab proxies are LCP ≤ 2.5 s, TBT ≤ 200 ms and CLS ≤ 0.1; first-load JavaScript ≤ 150 kB compressed on `/club` and personal-link pages. | Guardians use phones; WCAG 2.2 adds target size, focus-not-obscured and accessible-authentication criteria that hit this product (research C §7). | WCAG 2.1 AA | Misses the criteria most relevant to phone use. |
| **ADR-021** One application version, Semantic Versioning, release-please driven by Conventional Commit pull-request titles, `CHANGELOG.md` in Keep a Changelog format with operator upgrade notes; `0.y.z` until the pilot go-live, `1.0.0` at the pilot release. | Single deployable app, release notes needed by self-hosting clubs. | Changesets; manual tags | Changesets targets independently published packages; manual tags lose notes. |
| **ADR-022** Contributions are accepted under DCO 1.1 (`Signed-off-by:` on every commit, checked by the DCO GitHub app), not a CLA. | Inbound = outbound MIT licensing; minimal friction for outside contributors. | Contributor licence agreement | Only useful for relicensing or a proprietary edition; neither is planned. |
| **ADR-023** Open Mercato enterprise modules stay disabled in every environment (`OM_ENABLE_ENTERPRISE_MODULES=false`); Vereino code never imports `@open-mercato/enterprise`. Whether the package may stay installed in the production image is ENG-Q-10. | `@open-mercato/enterprise` 0.9.0 is commercial software ("SEE LICENSE IN LICENSE.md": no production or commercial use without a licence), although the scaffold lists it as a production dependency of `packages/app`; its modules (`record_locks`, `sso`, `security` with MFA, `agent_orchestrator`) are already off by default in `src/modules.ts`. | Buy a commercial licence; remove the package now | A licence is a business decision outside 1.0 scope (ENG-Q-09, ENG-Q-10). Removal edits a platform-owned `package.json` and may break platform imports; decided with ENG-Q-10 after an E3 check. |

### Gap closure map

Every gap listed in research A §12 is closed by at least one rule.

| Gap | Research A §12 topic | Closed by | Phase |
|---|---|---|---|
| 1 | Branch naming, branching model, protection | S1.1, S1.2, S1.8 | E1 |
| 2 | CI | S14, ADR-015 | E1 |
| 3 | Commit type and scope vocabulary | S1.3, S1.4 | E1 |
| 4 | Code formatting, unenforced upstream rules | S3, ADR-017, ADR-018 | E1 |
| 5 | Definition of done, PR template, review ownership | S1.5, S1.6, S17.2 | E1 |
| 6 | Versioning, release, deployment, rollback | ADR-021, S14.4 … S14.6 | E2, E4 |
| 7 | Dependency updates, audit, licences, platform pin | P1 … P6, S16, ADR-016 | E2 |
| 8 | Environment variables and secrets | S8.10, S15.10, S18.3 | E1, E4 |
| 9 | Logging format and levels | S15.1 | E1 |
| 10 | Error taxonomy | ADR-007, S6.7 | E1 |
| 11 | Observability | S15.2 … S15.6 | E4 |
| 12 | Performance budgets | ADR-020, S7.6, S5.8 | E1 |
| 13 | Security headers, cookies, rate limits, CSRF, uploads | S8.4 … S8.11 | E3, E4 |
| 14 | Data retention, backups, rollback of migrations, portability | S9.5, S9.6, S9.7, S15.7, S5.4 | E4, E5 |
| 15 | Accessibility standard | ADR-020, S7.4 | E1 |
| 16 | Testing policy details | S13 | E1 |
| 17 | Validation drift | S2 | E1 |
| 18 | Design-system reference docs | S7.1, S7.2 | E1 |
| 19 | API conventions | S6 | E1 |
| 20 | Public/sessionless route standard | S8.6, S8.7 | E1 |
| 21 | Frontend (`/club`, `/p`) component standard | S7.2 | E1 |
| 22 | Monorepo package internals | S4.10 | E1 |
| 23 | Documentation standards | S17 | E2 |
| 24 | Local development environment | S18 | E1 |

### S1 — Repository workflow

- **S1.1** `main` is protected by a GitHub ruleset: pull request required, required status checks (S14.3) up to date, squash merge only (linear history), no force-push, no deletion, empty bypass list (administrators included). The only exception is S1.8.
- **S1.2** Branch names are `<type>/<kebab-slug>` with `<type>` one of `feat`, `fix`, `docs`, `chore`, `refactor`, `test`, `ci`, `build`, `perf` (matches the existing `docs/engineering-standards` and `feat/spec-i18n-monorepo`). One task per branch. A branch is updated from `main` by merging `main` into it; a branch another person has pushed to is never force-pushed.
- **S1.3** Commit messages follow Conventional Commits in English: `type(scope): subject`, imperative, subject ≤ 72 characters. Types as in S1.2 plus `revert`. Scopes: a Vereino module id (`club_core`, `people`, `groups`, `activities`, `communication`, `payments`, `facilities`), a package (`core`, `db`, `ui`), or `spec`, `ai`, `ci`, `deps`, `ops`, `compliance`, `i18n`, `monorepo`. A breaking change to a contract surface (S6.9) uses `!` and a `BREAKING CHANGE:` footer. Every commit carries `Signed-off-by:` (`git commit -s`, ADR-022). The `AGENTS.md` rule "one task = one commit" becomes "one task = one pull request", which the squash merge turns into one commit on `main` (E1 updates `AGENTS.md`).
- **S1.4** The pull-request title follows S1.3, because the squash commit takes the title and release-please reads it. The description follows the template (S17.2).
- **S1.5** Review: `.github/CODEOWNERS` requires approval by a maintainer other than the author for `packages/app/src/modules/payments/**`, `packages/app/src/modules/people/**`, every `migrations/**` directory, every `acl.ts`, `encryption.ts` and `setup.ts`, `.github/**`, `Dockerfile`, `docker/**`, `railway*.toml`, `scripts/railway-*.sh`, `SECURITY.md`, `docs/compliance/**` and this spec. A maintainer may merge an own pull request outside these paths after the required checks pass. A pull request produced by an AI agent always needs an approving review from a human maintainer.
- **S1.6** Definition of done for a pull request: required checks green; the governing spec updated (phase evidence, acceptance checkbox, Changelog row); run log complete for autonomous work; lessons recorded (`AGENTS.md` → Project memory); `CONTRIBUTING.md` or a runbook updated when tooling or operations change; UI evidence attached (S7.8); no `TODO` without an issue link (`TODO(#123)`).
- **S1.7** Text files are UTF-8 with LF line endings (`.gitattributes` already normalises) and follow `.editorconfig` (2-space indent, final newline, trailing whitespace trimmed except in Markdown).
- **S1.8** Break-glass: when a required check cannot run because GitHub Actions or a third-party service is down, or the check itself is proven broken, the product owner may remove that check from the ruleset for at most one merge or one working day. The run log records the reason, the merged pull request and the restore time; an issue tracks the fix; the check is restored before the next release. Break-glass merges are excluded from, and reported next to, the primary outcome.

### S2 — Single canonical gate

- **S2.1** `yarn verify` (root script backed by `scripts/verify.mjs`) runs these steps in order and stops at the first failure: `yarn generate`, `yarn typecheck`, `yarn typecheck:packages`, `yarn lint`, `yarn format:check`, `yarn ds:check`, `yarn i18n:check-hardcoded --strict`, `yarn contracts:check`, `yarn lessons:check`, `yarn test`, `yarn build`. It prints each step's name and duration; its exit code is the failing step's exit code.
- **S2.2** The integration gate is `yarn test:integration:ephemeral` (all tests); locally a focused run uses `--grep "<TEST-ID>"`. CI runs the full suite on every pull request.
- **S2.3** `AGENTS.md` → *Validation*, `.ai/agentic.config.json` `validation.commands` (`["yarn verify"]`), the club spec's phase validation lines (amended in E1) and CI all name `yarn verify`. Adding a check means editing `scripts/verify.mjs` only.
- **S2.4** Every gate step is blocking. `--strict` makes the i18n check fail on findings in Vereino module paths that are not in the module's `i18n/.hardcoded-allowlist.json` (each entry with a reason); findings in `example` and scaffold paths are reported, not failing. The flag is a recorded local patch to `packages/app/scripts/i18n-check-hardcoded.mjs` (S3.1).
- **S2.5** `yarn contracts:check` (`packages/app/scripts/check-vereino-contracts.mjs`) fails when: an error code is declared twice or by two modules; an error code's message key is missing from the module's `i18n/en.json` or `i18n/pl.json`; the key sets of a Vereino module's `en.json` and `pl.json` differ.
- **S2.6** "Never migrate to validate" stays: `yarn db:generate` is a review probe used when entities change, not a gate step.
- **S2.7** Gate scripts are Node.js scripts so they run on Windows 11, WSL2, macOS and the Linux CI runner; gate output is never piped through `grep` or `tail`, so the shell status is the gate status.

### S3 — TypeScript and coding standards

- **S3.1** *Vereino-owned code* is `packages/core/**`, `packages/db/**`, `packages/ui/**`, `packages/app/src/modules/<id>/**` for the Vereino module ids listed in `CONTRIBUTING.md` (today the club spec's `club_core`, `people`, `groups`, `activities`, `communication`, `payments`, `facilities`; the scaffold modules `example`, `example_customers_sync`, `ratelimit_probe` and `agent_examples` are not Vereino-owned), `packages/app/.ai/qa/tests/**`, and root or app scripts created by Vereino. Everything else in `packages/app` is *platform-owned* scaffold: it changes only in a platform upgrade or as a *local patch*. The planned local patches are listed below; `CONTRIBUTING.md` → *Local patches to platform files* keeps the live list, which every upgrade run re-checks. A patch not in the list needs a Changelog row in this spec first.

| Platform-owned file | Local patch | Rule | Phase |
|---|---|---|---|
| `packages/app/scripts/i18n-check-hardcoded.mjs` | `--strict` mode | S2.4 | E1 |
| `packages/app/eslint.config.mjs` | Vereino-path rules, boundaries, re-enabled React rules | S3.10, ADR-018 | E1 |
| `packages/app/jest.config.cjs` | coverage thresholds for Vereino `lib/` and `@vereino/core` | S13.6 | E1 |
| `packages/app/package.json` | `format`, `format:check`, `contracts:check` scripts | S2.1 | E1 |
| `packages/app/next.config.ts` | HSTS, `Permissions-Policy`, CSP narrowing, `no-store` if the platform lacks it | S8.4 | E4 |
| `packages/app/src/app/` (app router) | web manifest | S7.7 | first member page (club spec) |
| `railway.toml`, `railway.worker.toml`, `scripts/railway-start.sh` | pre-deploy migrations, start without `init-or-migrate.sh` | ADR-013, S14.5 | E4 |
| `Dockerfile` | base images pinned by digest | S14.8 | E4 |
| boot entry chosen in E4 (only if no Vereino module hook can run at boot) | Zod validation of required variables | S8.10 | E4 |
- **S3.2** Compiler settings: the app keeps the scaffold `tsconfig.json` (`strict`, decorators, `moduleResolution: bundler`). Shared packages add `noUncheckedIndexedAccess`, `noImplicitOverride`, `noFallthroughCasesInSwitch`, `verbatimModuleSyntax` and `isolatedModules`; `@vereino/core` also sets `erasableSyntaxOnly`. E1 measures the cost of `noUncheckedIndexedAccess` in the app and enables it only if no platform-owned file needs an edit. `exactOptionalPropertyTypes` is not enabled: platform component props and hand-written types assign `undefined` to optional properties, so it would force edits outside Vereino code for little safety gain.
- **S3.3** Types: no `any` (lint error); untrusted data enters as `unknown` and is narrowed by a Zod parse; types come from Zod (`z.input` for forms, `z.output` for services) instead of duplicated interfaces; exported functions of `lib/` and of shared packages declare their return type; type-only imports use `import type`; the non-null assertion `!` is allowed only for decorator-initialised entity fields.
- **S3.4** Naming: files kebab-case (`bank-import.ts`) except platform convention files (`page.tsx`, `page.meta.ts`, `route.ts`, `entities.ts`, `di.ts`, …) and React component files in PascalCase (`ChargesTable.tsx`). Identifiers camelCase; types and classes PascalCase; module-level constants (DI tokens, entity ids) `UPPER_SNAKE_CASE`; booleans start with `is`, `has`, `can` or `should`. Database columns and enum values snake_case. Platform identifiers follow research A §1.2: module id plural snake_case, entity `<module>:<entity>`, command `<module>.<entity>.<action>`, event `<module>.<entity>.<past_tense>`, feature `<module>.<capability>`, subscriber and worker `<module>:<kebab-name>`. No one-letter names except loop indexes and generic type parameters.
- **S3.5** *(guidance for the second sentence)* Structure: pure domain logic lives in `lib/` and receives time as a parameter (`now: Date`) instead of reading the clock; side effects live in commands, subscribers and workers. Prefer early returns; no nested ternaries; exported functions with more than one boolean or more than three positional parameters take an options object.
- **S3.6** Errors are never swallowed: `catch (error: unknown)` either rethrows, maps to a platform HTTP error, or calls `reportError` with a `<module>.<reason>` report fingerprint (a log grouping key, not an S6.7 error code). User-facing messages are i18n keys; internal assertion messages start with `[internal]` (platform convention).
- **S3.7** *(guidance)* Comments explain why, not what. Exported package APIs carry JSDoc; contract surfaces being retired carry `@deprecated` with the target version.
- **S3.8** No floating promises (lint error). `Promise.all` only for a bounded number of independent operations; calls to rate-limited providers go through a queue (S12.4).
- **S3.9** Imports: package-level `@open-mercato/<pkg>/…` paths, `@vereino/<pkg>` public entry points only (no deep imports), relative imports inside a module. Import order is not enforced: it adds a plugin and noisy diffs without catching defects, and `typescript-eslint`'s stylistic presets are left out for the same reason.
- **S3.10** Lint rules for Vereino-owned code (ADR-018), in addition to the scaffold configuration: `@typescript-eslint/no-explicit-any`, `no-floating-promises`, `no-misused-promises`, `consistent-type-imports`, `switch-exhaustiveness-check` as errors; `no-unnecessary-condition` as warning; `jsx-a11y` recommended; `no-console` as error outside scripts and tests; the React rules disabled by the scaffold (`react-hooks/immutability`, `preserve-manual-memoization`, `purity`, `refs`, `set-state-in-effect`, `static-components`, `react/display-name`) re-enabled; boundary rules from S4.3 and S4.9.

### S4 — Module patterns

- **S4.1** A Vereino module uses the platform's canonical shape (research A §1.1) and creates only the files its capability needs. Vereino adds `lib/` (pure domain functions and value types), `lib/error-codes.ts` (the module's error-code table as plain data, S6.7), `api/errors.ts` (the factory that turns a code into a platform `CrudHttpError`; it lives outside `lib/` because it imports the platform), `__tests__/` next to the code, and a short `README.md` (purpose, owned entities, commands, events, DI tokens, error codes, link to the spec section).
- **S4.2** Layering inside a module: `api/**/route.ts` validates with `data/validators.ts` and dispatches a command; `commands/` load and change entities through the platform data engine and call `lib/`; `subscribers/` and `workers/` call commands; `backend/` and `frontend/` pages read and write only through the module's API with `apiCall`, `CrudForm` or `useGuardedMutation`. Routes never mutate entities directly; `lib/` never imports `data/`, `commands/`, an ORM or a platform package.
- **S4.3** Between modules there are no ORM relations. Runtime interaction goes through DI tokens (optional peers through a guarded `tryResolve` with a defined degraded result), events, scalar ids with display snapshots, enrichers and extensions. A static import from another Vereino module is allowed only as `import type` (`eslint-plugin-boundaries`). Code moves to `@vereino/core`, `@vereino/db` or `@vereino/ui` only when two or more modules reuse it (club spec decision D4); until then pure logic stays in the module's `lib/`.
- **S4.4** Every domain mutation is a registered command `<module>.<entity>.<action>` that parses its input with Zod inside `prepare`/`execute`, derives scope with an `ensureScope(ctx)` helper, asserts the optimistic lock in `prepare`, writes through `runCrudCommandWrite` or `withAtomicFlush`, emits events and cache invalidation after commit through the platform helpers, and builds a translated audit label in `buildLog`. Commands are undoable unless the spec states why not; money commands are not undoable — they are corrected by a reversing command (S10.4).
- **S4.5** Commands that can be retried (webhook processing, workers, public forms, cash recording, bank booking) carry an idempotency key — the provider event id or a client-generated `operationId` UUID — backed by a unique constraint; a repeat with the same key returns the first result, and a repeat with the same key but different input returns 422. Other unsafe operations need no key: updates and deletes are protected by the lock token (S5.2) and creates by natural unique constraints, so a generic `Idempotency-Key` layer on every route is not added. Racing decisions use a constraint, a row lock or an atomic claim, never check-then-create.
- **S4.6** Events are declared in `events.ts` with `createModuleEvents`. Payloads carry `id`, `tenantId`, `organizationId` and other ids only — never personal data or free text. Persistent subscribers are idempotent, keyed by event id or by entity id plus `updatedAt`.
- **S4.7** Workers and scheduled jobs have ids `<module>:<kebab-name>`, take scope from their registration (never from user data), are idempotent, use bounded concurrency, and log start and finish with counts (S15.1); a failure produces the platform's `scheduler.job.failed` signal.
- **S4.8** DI: services are registered in `di.ts`; a service that holds the request `em` or request context is `.scoped()`; singletons are stateless; services are resolved, never constructed with `new` outside `di.ts`; no container is passed into `lib/`. The platform container uses `InjectionMode.CLASSIC` without Awilix `strict: true`, so a singleton that captures a scoped dependency is not detected at runtime — the `.scoped()` rule is checked in review — and constructor parameter names must survive production minification — the integration suite runs against a production build (E3 verifies, ENG-TEST-07).
- **S4.9** Portability (ADR-001): `lib/` and `@vereino/core` import nothing from `@open-mercato/*`, `@mikro-orm/*`, `react`, `next` or Node built-ins with I/O (lint rule). E3 reports which club spec invariants are implemented in `lib/`.
- **S4.10** Shared packages: each exposes its API from `src/index.ts`, has `typecheck`, `lint` and `test` scripts called by the root scripts, keeps tests in `src/**/__tests__/*.test.ts`, and emits no build output (consumed through `transpilePackages`). `@vereino/db` test-database helpers run only inside the ephemeral integration runner.

### S5 — Data and persistence

- **S5.1** Entities follow research A §2.1: UUID primary key `gen_random_uuid()`; `tenant_id` and `organization_id` from trusted context; `created_at`, `updated_at`; `deleted_at` where soft delete is specified; tables `<module>_<plural>`; snake_case columns; instants only as `timestamptz`; money as integer minor units plus `currency` (`char(3)`).
- **S5.2** Every user-editable entity has `updated_at` and returns `updatedAt`. Update and delete inputs of Vereino commands require the lock token (the platform header or `expectedUpdatedAt`), because `assertOptimisticLock` does nothing when the token is absent. It also does nothing when `OM_OPTIMISTIC_LOCK=off`; no environment sets that variable to `off` (`.env.example` and `docs/ops/environments.md` say so). Exemptions are the platform's: append-only logs, junction tables, token and job rows, parent-guarded lines.
- **S5.3** Indexes start with the scope columns (`tenant_id`, `organization_id`, …); every unique constraint includes `organization_id` so a collision cannot reveal another tenant's data — except constraints on values that are globally unique by construction and looked up before scope is known (SHA-256 token hashes, provider event ids, Stripe session ids); scalar reference ids used in filters are indexed; partial indexes serve hot status filters. A list endpoint whose spec estimates more than 1 000 rows per organization ships `EXPLAIN` output in its phase evidence.
- **S5.4** Migrations: the platform workflow (research A §2.6) plus: as few migrations per module per phase as the steps below allow (one by default; expand and contract steps and each `CONCURRENTLY` index get their own); a migration merged to `main` is immutable; a non-transactional migration is written idempotently (`IF NOT EXISTS`, `IF EXISTS`) so a partly applied run is completed by re-running it; breaking changes use expand/contract across two releases (add nullable → backfill → enforce → switch code → drop in a later release); DDL on existing tables sets `lock_timeout = '5s'`; `CREATE INDEX CONCURRENTLY` goes in its own non-transactional migration for tables that can exceed 10 000 rows; `down()` is implemented for additive migrations; dropping a column or table needs a product-owner decision and a verified backup. The pull request shows the generated SQL; migration commits need approval (`AGENTS.md` → Ask First; S1.5).
- **S5.5** Invariants that one row can express are database `CHECK` constraints; idempotency keys are unique constraints; time-overlap exclusivity, where a spec makes it a hard rule, is an exclusion constraint on `tstzrange`. Foreign keys exist only within a module.
- **S5.6** Encryption uses the platform: `encryption.ts` maps, `findWithDecryption`/`findOneWithDecryption`, `TenantDataEncryptionService`. Equality lookup on low-entropy personal data (PESEL, e-mail) uses the platform's keyed `hashForLookup`/`lookupHashCandidates`; high-entropy tokens are stored as SHA-256. Encrypted columns are never sorted or `LIKE`-filtered; search uses platform search tokens. A new encryption map on a deployed module ships `buildEncryptionMapBackfillSql`.
- **S5.7** One command is one unit of work. No call to Stripe, Resend or any external service happens inside a database transaction; external effects run after commit through events or queues. Because a crash between commit and dispatch can lose an effect, every effect that must happen (a payment confirmation e-mail, a charge for a booking) is recorded as state in the same transaction (e.g. `confirmation_sent_at` null) and a scheduled sweep re-triggers what is still pending; E3 checks whether platform persistent events already give at-least-once delivery, and a transactional outbox is added only if neither is enough. Counters and sequences use `SELECT … FOR UPDATE`.
- **S5.8** Lists are server-paginated (`pageSize` ≤ 100) with explicit field projections; related data is loaded in batches (enrichers' `enrichMany`), never per row. Raw SQL is allowed only in a module's `data/queries.ts`, takes `organization_id` as an explicit parameter, and has a two-tenant integration test. A `QueryBuilder` query applies the same scope conditions as the CRUD factory.
- **S5.9** Seeds: reference data in `setup.ts` `seedDefaults` (idempotent, runs in production); demonstration data only in `seedExamples`. Demonstration and test data never contain a PESEL, a real e-mail domain (use `example.org` or `.test`) or a real phone number.
- **S5.10** Hard deletion is used only for data without a retention duty; people are anonymised by the club spec's anonymisation command; accounting rows are kept for the period in S9.5.

### S6 — API conventions

- **S6.1** Routes are `/api/<module_id>/<resource>`; resource segments are kebab-case plural nouns (`/api/payments/group-charges`); an action on a record is a `POST` to a kebab-case verb sub-path. Handlers live in `api/<resource>/route.ts`, never in HTTP-method directories.
- **S6.2** Every route exports per-method `metadata` (`requireAuth`, `requireFeatures`, rate limits for public routes) and `openApi` built with the platform OpenAPI helpers.
- **S6.3** JSON keys and query parameters in Vereino requests and responses are camelCase (`payerPersonId`); enum values are lower snake_case strings; ids are UUID strings. Public schemas never accept `tenantId` or `organizationId`.
- **S6.4** Every list — CRUD or custom — returns the installed paged shape `{ items, total, page, pageSize, totalPages }` (`createPagedListResponseSchema`) and accepts `page`, `pageSize` (≤ 100), `sortField`, `sortDir`, camelCase filters and the multi-id `ids` parameter. The club spec's `{ items, totalCount }` is amended in E1, before any club route exists.
- **S6.5** Time on the wire: instants as ISO 8601 UTC with milliseconds and `Z` (`2026-10-21T15:00:00.000Z`); calendar dates `YYYY-MM-DD`; wall-clock times `HH:mm`; zones as IANA names; ranges half-open `[from, to)` with a maximum length stated in the route's schema.
- **S6.6** Money on the wire: integer minor units plus `currency` (ISO 4217); decimals never appear in JSON. Amount fields end in `Amount` (`amount`, `discountAmount`, `paidAmount`, `balanceAmount`).
- **S6.7** Error responses have the body `{ error, code? }`: `error` is a message translated on the server; `code` is a lower snake_case machine code, unique across the app, declared in the owning module's `lib/error-codes.ts` as plain data `{ code, status, messageKey }` and listed in the route's `openApi`. Coded errors are thrown as `new CrudHttpError(status, { error, code })` by the module's `api/errors.ts` factory, which resolves the translated message; uncoded errors use the platform helpers. Existing club spec codes (`occurrence_place_conflict`, `declaration_closed`, …) already follow this format. Platform responses may add fields (`requestId`; `currentUpdatedAt` and `expectedUpdatedAt` on lock conflicts), and clients ignore unknown fields. Platform codes are reserved and never redeclared: `optimistic_lock_conflict`, `organization_scope_required`, `FOREIGN_KEY_VIOLATION`, `DATABASE_UNAVAILABLE`; `contracts:check` rejects a Vereino code that collides with them. Status semantics: 400 malformed input; 401 unauthenticated; 403 feature or scope denied; 404 not found or not public; 409 version, state or uniqueness conflict; 410 used or expired token; 413 payload too large; 422 business rule violated by well-formed input; 429 rate limited with `Retry-After`; 502 upstream provider failure; 503 database unavailable (platform, with `Retry-After`); 500 never carries internal detail. Clients map `code` to UI text through i18n and never parse `error`.
- **S6.8** Update and delete require the lock token (S5.2); retry-prone unsafe operations accept `operationId` (S4.5); webhooks de-duplicate by provider event id (S8.8).
- **S6.9** No URL versioning. Vereino contract surfaces — routes, request and response fields, event ids and payloads, ACL feature ids, notification types, scheduler target ids, database schema, error codes, `VEREINO_*` variable names, root scripts — are stable from their first deployment. Changes are additive; a removal or rename follows `BACKWARD_COMPATIBILITY.md` (deprecation bridge for at least one minor release, `deprecated: true` in `openApi`, `CHANGELOG.md` entry). An automated OpenAPI contract diff against `main` (e.g. `oasdiff`) is added to the `gate` once the first club routes exist, if E3 shows that `api_docs` can emit the document as a file; until then review enforces this rule.
- **S6.10** A breaking change is marked in the commit (S1.3); release-please then bumps the major version (the minor version while below 1.0.0).

### S7 — UI, accessibility and performance

- **S7.1** Admin pages follow the platform (research A §6.1–6.2): `page.meta.ts` with features and translated titles, `Page`/`PageBody`, `DataTable`, `CrudForm`, `apiCall`, shared state components, `StatusBadge`, platform primitives and `ds:check`. `om-backend-ui-design` is invoked and `.ai/guides/backend-ui.md` read before any UI slice. The design-system rules are the installed `@open-mercato/ui` tokens and `ds:check`; Vereino keeps no separate copy.
- **S7.2** Member and public pages (`/club`, `/p/…`) use Tailwind 4 with the platform's semantic CSS variables; `ds:check` applies to them (no palette classes, arbitrary values, `dark:` overrides or inline styles). Components used by two or more modules live in `@vereino/ui`. Pages are mobile-first with 375 px as the baseline width; calendars default to a list view on phones. Visually substantial work also reads `om-backend-ui-design` → `references/frontend-and-design-system.md`.
- **S7.3** Server Components by default; `'use client'` only at the leaf that needs it; server data helpers import `server-only`; nothing secret is exposed through `NEXT_PUBLIC_*`.
- **S7.4** WCAG 2.2 AA (ADR-020) with these product-critical criteria: pointer targets ≥ 24 × 24 CSS px (44 × 44 for primary actions on phones); visible focus never hidden by sticky bars; every drag interaction has a button alternative; known data is pre-filled, not re-typed; no puzzle or CAPTCHA in sign-in or personal-link flows; help and contact in the same place on every page; visible labels, errors linked with `aria-describedby` and announced; contrast ≥ 4.5:1 for text and 3:1 for controls; `prefers-reduced-motion` respected; `lang` set per locale. Verification: every new page's integration test runs axe (`wcag2a`, `wcag2aa`, `wcag21a`, `wcag21aa`, `wcag22aa`) with zero critical or serious violations; the primary task of each page has a keyboard-only test; once per club phase a maintainer walks the primary journey with a screen reader (NVDA or VoiceOver) and records it in the phase evidence.
- **S7.5** Every Vereino module ships `i18n/en.json` and `i18n/pl.json` with identical keys (S2.5); text is rendered with `useT()` or `resolveTranslations()`; numbers, money and dates use `Intl` with the resolved locale.
- **S7.6** The lab budgets of ADR-020 (LCP, TBT as the stand-in for INP, CLS, JavaScript size) are checked by Lighthouse CI with mobile throttling in the `perf` job; INP is a field metric, read from telemetry once E4 enables it: advisory until the first member page exists, blocking afterwards for `/club` and one personal-link page. Admin pages have no absolute budget; their first-load JavaScript may not grow more than 10 % over the baseline recorded in E1 without a note in the pull request. API list endpoints target p95 ≤ 500 ms at pilot volume, measured from telemetry once E4 enables it.
- **S7.7** The app ships a web manifest so it can be installed; no service worker in 1.0.
- **S7.8** A pull request that changes UI attaches evidence: both locales, 375 px width, light and dark mode, loading/empty/error/conflict states, browser console without errors (`AGENTS.md` → Verify).

### S8 — Security

- **S8.1** Target OWASP ASVS 5.0 level 2 for everything that handles personal or payment data. `docs/compliance/asvs-checklist.md` maps the applicable requirements to a control or a test (E5).
- **S8.2** Authentication is the platform `auth` module; Vereino adds no authentication of its own. The platform's multi-factor authentication is part of the commercial enterprise `security` module (ADR-023), so it is not available in 1.0 without a licence; E3 checks whether core `auth` offers any second factor or passkeys, and ENG-Q-09 decides.
- **S8.3** Authorization uses feature ids (`requireFeatures`), never role names; record scope comes from `people.scopeService`; the acting role is decided on the server; every route has a second-tenant and an insufficient-feature test (S13.4).
- **S8.4** Response headers: keep the scaffold's CSP, `Referrer-Policy`, `X-Content-Type-Options` and `X-Frame-Options`; add `Strict-Transport-Security: max-age=63072000; includeSubDomains` (preload after the production domain is fixed, club research D-012) and `Permissions-Policy: camera=(), microphone=(), geolocation=(), browsing-topics=()`. E4 removes `'unsafe-eval'` from the production CSP and narrows `connect-src` to the app origin and Stripe if the platform UI works without them; a nonce-based CSP is deferred because it forces dynamic rendering. Authenticated responses are not cacheable (`private, no-store`). Changes to `next.config.ts` are local patches (S3.1).
- **S8.5** Session cookies are `Secure`, `HttpOnly` and `SameSite=Lax` (E3 verifies the platform values); no token is stored in `localStorage`. A separate `SameSite=Strict` admin cookie is not possible because every role uses one `auth` account (club spec Q-001). E3 records the platform's idle and absolute session lifetimes; targets are an idle timeout of at most 30 minutes for staff roles and re-authentication before changing an e-mail address, a password or payment settings — gaps are listed as ENG-Q items, not patched in platform code.
- **S8.6** Sessionless public routes (codifies club spec DD-35): exactly one read-only, index-backed system-scope lookup by slug or token hash inside a Vereino DI service, after which every query carries the found tenant and organization; rate limits through the platform `lib/ratelimit` keyed by IP and by e-mail, slug or token, with these defaults unless the club spec sets others: booking or contact request 5 per hour per IP and 3 per day per e-mail, personal-link request 3 per hour per e-mail, token page 60 per minute per token, public schedule pages and JSON 120 per minute per IP; request endpoints always answer `202` with uniform timing (no account enumeration); forms carry a honeypot field and a signed time trap; `GET` never changes state — a link opens a page whose button `POST`s; token pages send `Referrer-Policy: no-referrer`, `noindex` and `Cache-Control: private, no-store`, and show personal data only about the token's own subject (e.g. the guardian's wards for that one session); public pages without a token show no personal data and may use shared caching (`public, s-maxage=60`) only when they have no authentication-dependent branch. The lookup itself uses an installed platform contract when club spec V-12 finds one; otherwise it is the documented DD-35 deviation, admitted only through the `AGENTS.md` exception added in E3.
- **S8.7** Personal-link tokens: 32 bytes from a CSPRNG encoded base64url; stored only as SHA-256 and compared in constant time; bound to one purpose and one subject; expire; single-use for state changes; invalidated when the guardian relation changes; never logged.
- **S8.8** Webhooks: signatures verified on the raw body (`await request.text()`) with the platform `lib/webhooks` helpers or the provider SDK; timestamp tolerance ≤ 5 minutes; an insert-first de-duplication row keyed by provider event id; respond 2xx quickly and process in a queue. Only webhook routes are exempt from cross-site request checks.
- **S8.9** No state-changing `GET`. E3 records how the platform protects cookie-authenticated JSON `POST` requests against cross-site requests; if it does not, custom routes require a custom header that a cross-site form cannot send.
- **S8.10** Secrets never enter the repository, logs, specs, run logs or transcripts. `.env.example` lists every variable with a placeholder; Vereino variables are prefixed `VEREINO_`; the app validates required variables with a Zod schema at boot and refuses to start when one is missing; production secrets are Railway sealed variables; Stripe keys are restricted keys per environment; secrets rotate when a maintainer leaves and at least yearly; GitHub secret scanning with push protection is enabled.
- **S8.11** Uploads: allowlisted MIME type, extension and magic bytes; size limits from the spec; no SVG; bank statement files only in the private attachments partition; uploaded file names are never used as paths. No malware scanning in 1.0: only signed-in staff upload files (logos, bank statements) and no uploaded file is served to other users except images re-encoded by the platform; a public upload feature would require scanning and a spec change.
- **S8.12** Pull requests touching S1.5 security paths get an automated security review (`om-code-review` or `security-review`) in addition to the human review; every spec's *Security* section names its abuse cases (template).

### S9 — Privacy and compliance

- **S9.1** The club is the controller of its members' data; whoever hosts an instance for a club acts as its processor and signs a data processing agreement with the club before pilot data is entered (depends on the hosting model, club research D-012; ENG-Q-04).
- **S9.2** Lawful bases: performance of the membership contract with the guardian (GDPR art. 6(1)(b)) for core processing, legal obligation (art. 6(1)(c)) for accounting records, legitimate interest (art. 6(1)(f)) for safety logs. Consent only for optional processing (publishing an instructor's name, images, marketing), stored as versioned rows: type, given by, given at, text version, source, withdrawn at.
- **S9.3** Minors: accounts for 13–17-year-olds are enabled by a guardian, never by self-service sign-up; the Polish digital-consent age is treated as 16 until the legal check in E5 says otherwise (research C B1); image consent is separate from participation consent.
- **S9.4** Minimisation: a field exists only if a club spec requirement needs it; PESEL stays optional; public pages show no participant or guardian names; personal data never appears in logs, events, analytics, idempotency keys, URLs or error messages.
- **S9.5** Retention schedule (`docs/compliance/retention.md`, E5), each row with category, period, legal basis and the job that enforces it. Defaults: accounting records 6 full years after the end of the financial year (the Accounting Act requires at least 5 years counted from the start of the year after the financial year; the sixth year covers the tax limitation period; setting `accounting_retention_years`); former participants' non-accounting data anonymised 12 months after the last membership ends (club setting; conflicts with club spec Q-019 — ENG-Q-07); used or expired link tokens deleted after 30 days; application logs 30 days; backups as in S15.7, with the note that erased data persists in backups until they expire.
- **S9.6** Erasure requests are served by anonymisation that keeps accounting rows linked through the payer reference code, and every anonymisation writes an audit row (who requested, legal basis for what is kept, tables touched).
- **S9.7** Compliance documents in `docs/compliance/` (E5): records of processing (`ropa.md`), DPIA (`dpia.md`, completed before the pilot — children's data and financial data meet the DPIA triggers), processor and recipient register (`processors.md`: Railway, Resend, Stripe as an independent controller for payment data, the off-site backup provider; region, transfer mechanism, DPA link, review date), breach register (`breach-register.md`, no personal data in it), data-subject request procedure (`data-subject-requests.md`: access, portability export, rectification, erasure), privacy notices in Polish and English including a short version for children, cookie information.
- **S9.8** Breach handling: the incident runbook (S15.9) contains the 72-hour deadline for notifying the supervisory authority (UODO), the criteria for informing data subjects, and the rule that every incident — notified or not — is entered in the breach register.
- **S9.9** No consent banner while only strictly necessary cookies are set; adding analytics or third-party embeds requires a spec change that revisits consent.
- **S9.10** Legal statements that research C marks unverified (Appendix B: B1, B2, B3, B10, B12) are verified against primary sources or a legal opinion before the pilot (ENG-Q-06).

### S10 — Money and payments

These rules apply to the club spec's `payments` and `facilities` modules; the entities stay in the club spec (E5 hands the required additions over).

- **S10.1** Amounts are integer grosz with a currency; discount rates are `numeric`; a derived amount (discount, share) is rounded half-up once, when it is stored, and the charge records the rounding rule used.
- **S10.2** Splitting one amount over several lines uses largest-remainder allocation and asserts that the parts sum to the whole.
- **S10.3** A charge's status is derived from its payments, never set directly; the sum of payments never exceeds the amount due unless the excess is recorded as a separate overpayment credit.
- **S10.4** Payments are immutable; a correction or refund is a reversing payment that references the original. Undoing a bank booking whose payment already has a receipt number or a cash handover creates reversals instead of deleting rows. No balancing "plug" entries.
- **S10.5** Document numbers (KP cash receipts, RG cash handovers) come from a per-organization, per-series, per-year sequence row locked `FOR UPDATE` in the issuing command; never `max() + 1`.
- **S10.6** A nightly job recomputes balances and reports drift (`payments:verify-invariants`) as an alert, without changing data.
- **S10.7** Bank import: a per-bank profile (format, encoding, delimiter, column map, MT940 variant); a transaction hash over stable normalised fields makes re-imports idempotent; matching passes record their reason; only exact payer-code matches with the exact open amount are booked automatically.
- **S10.8** Stripe (ADR-010): Checkout Sessions with an outbound idempotency key stored on the checkout row; `metadata` and `client_reference_id` carry ids, and scope is read from the checkout row, never from the webhook body; `checkout.session.completed` fulfils only when `payment_status` is `paid`, and `checkout.session.async_payment_succeeded`/`_failed` complete Przelewy24 flows; the return page calls the same idempotent fulfilment; refunds are reversing payments that store the refund id; local development, CI/staging and production use separate Stripe sandboxes or accounts with separate webhook secrets; Przelewy24 is enabled only after the public club page shows the legal details Stripe requires; no card data is stored.
- **S10.9** Display uses `Intl.NumberFormat(locale, { style: 'currency', currency })`; dividing by 100 happens only for display.

### S11 — Time and calendar

- **S11.1** Instants are `timestamptz` in UTC; the club's IANA time zone is a club setting (default `Europe/Warsaw`); age and "today" are computed in that zone.
- **S11.2** A recurrence is an RRULE without `DTSTART`, a local start date-time, a duration and the zone. Expansion enumerates wall-clock occurrences in floating UTC and converts each with `date-fns-tz` `fromZonedTime`. A wall time in the spring gap moves forward; an ambiguous autumn time takes the earlier offset. `UNTIL` is stored in UTC.
- **S11.3** Occurrence generation is an idempotent upsert keyed by (activity, occurrence date); occurrences that are detached or carry attendance or a substitution are never changed by regeneration.
- **S11.4** `rrule` is added with an exact version after the open `after()` time-zone regression (research C B6) is checked — a deliberate exception to P3, listed in `CONTRIBUTING.md` → *Pinned and overridden dependencies* with the regression as its removal condition.
- **S11.5** Tests use explicit instants and an injected clock, never the system clock, and cover the daylight-saving weeks (2026-03-29, 2026-10-25, 2027-03-28) and an activity that crosses midnight.
- **S11.6** Calendar feeds, if specified, export expanded occurrences as UTC `VEVENT`s with stable `UID`, `SEQUENCE` from the version, `STATUS:CANCELLED` for cancellations and no names of other participants.

### S12 — E-mail

- **S12.1** Sending uses a dedicated subdomain of the production domain with DKIM, SPF through a custom Return-Path and DMARC starting at `p=none` with reports, moving to `p=quarantine` after two clean weeks (ADR-011); region `eu-west-1`; open and click tracking disabled.
- **S12.2** Templates live in the repository as React Email components (`@react-email/components` is installed), one per notification type and locale, with a plain-text alternative; subjects never contain a token; the club name and reply-to come from club settings.
- **S12.3** Announcements carry `List-Unsubscribe` and `List-Unsubscribe-Post: List-Unsubscribe=One-Click` with a token-keyed `POST` endpoint that needs no login; transactional mail (receipts, links, confirmations) carries neither.
- **S12.4** Bulk sending goes through a queue limited below the provider limit (≤ 8 requests/s for Resend's default 10/s), uses batch sending where possible, and sends an idempotency key per (message, recipient).
- **S12.5** Bounce, complaint, failure and suppression webhooks update the recipient's delivery status and stop further announcements to that address; Vereino keeps its own suppression state so a provider change behaves the same.
- **S12.6** Local development and CI never send real e-mail (`VEREINO_EMAIL_SENDING_ENABLED=false` or a sink transport); staging sends only to an allowlist of addresses.

### S13 — Testing

- **S13.1** Levels: unit tests (Jest) for `lib/`, validators, mappers and components (`@jest-environment jsdom` docblock for components); integration tests (Playwright through the ephemeral runner) for every route and command through the real API and database; UI tests (Playwright) for each page's primary task including the axe scan. Command tests never mock the database.
- **S13.2** Locations and names: unit tests `src/modules/<id>/**/__tests__/<subject>.test.ts(x)` and `packages/<pkg>/src/**/__tests__/<subject>.test.ts`; integration tests `packages/app/.ai/qa/tests/<module>/<TEST-ID>-<slug>.spec.ts` (club spec convention). Every test title starts with its spec test id (`TEST-012 …`, `ENG-TEST-05 …`) so `--grep` selects it.
- **S13.3** Integration tests are self-contained: each creates its tenant, organization, users and records through the API, cleans up in `finally`, and relies on no seed or demo data; convergence is awaited with bounded polling, never `sleep`; time-dependent behaviour uses explicit instants.
- **S13.4** Oracles per route (`.ai/guides/testing-debugging.md`): success with persisted state and emitted event; second tenant and second organization denied; insufficient feature → 403; stale version → 409; missing version → 400 (S5.2); malformed input → 400 or 422; retry with the same idempotency key → no duplicate; at least one test per phase reads an encrypted column raw from the database (club spec).
- **S13.5** Domain test matrix: money rounding, allocation and concurrent numbering; daylight-saving expansion; webhook replay, tampering and stale timestamps; used, expired and foreign tokens; public-form abuse; accessibility. Research C Appendix C (TEST-C01 … TEST-C19) is handed into the club spec in E5 with club `TEST-0xx` ids.
- **S13.6** Coverage thresholds of 90 % lines and branches apply to `packages/app/src/modules/<vereino-id>/lib/**` and `packages/core/src/**`; there is no global threshold, and the platform's `passWithNoTests: true` stays because the thresholds already fail an untested `lib/`. Test files are type-checked by `yarn typecheck`, which compensates for ts-jest `diagnostics: false`.
- **S13.7** Integration runs keep the platform configuration's single retry (`retries: 1`, trace on first retry); a test that passed only on retry is listed in the job summary and fixed or quarantined with an issue within 5 working days. Failing tests are never deleted or weakened to make a gate pass.
- **S13.8** Test data is fake (S5.9). The club spec's Stripe test adapter is used in CI; Stripe sandboxes only on staging and in local development.
- **S13.9** The platform-owned `packages/app/.ai/qa/tests/playwright.config.ts` is used unchanged; E1 adds shared fixtures under `packages/app/.ai/qa/tests/_fixtures/` (tenant factory, authenticated contexts per role, axe fixture).

### S14 — CI/CD

- **S14.1** `.github/workflows/ci.yml` runs on `pull_request` and on `push` to `main` with jobs: `gate` (`yarn verify`); `integration` (`yarn test:integration:ephemeral`, Playwright report and traces uploaded on failure); `perf` (Lighthouse CI, S7.6); `pr-title` (semantic pull-request title check, pull requests only); `dependency-review` (pull requests only). CodeQL default setup scans JavaScript/TypeScript; the DCO app checks sign-offs. `.github/workflows/security.yml` runs weekly and on lock-file changes: `yarn npm audit --all --recursive --severity high` and `yarn licenses:check` (S16.4). `.github/workflows/release.yml` runs release-please on `main`.
- **S14.2** Workflow hygiene: top-level `permissions: contents: read`, elevated per job only; third-party actions pinned by full commit SHA (Renovate updates them); `concurrency` per ref with cancel-in-progress; Node 24 from `.nvmrc`; `corepack enable`; Yarn cache keyed on `yarn.lock`; `yarn install --immutable`; job timeouts (gate 30 min, integration 45 min); fork pull requests run with `pull_request` (no secrets), never `pull_request_target`.
- **S14.3** Required checks on `main`: `gate`, `integration`, `pr-title`, `DCO`; `perf` becomes required with the first member page. CodeQL and dependency-review findings of high or critical severity are fixed or triaged with a written reason before merge.
- **S14.4** Delivery: Railway `staging` deploys every commit on `main` automatically; `production` runs only commits that carry a release tag and is deployed by a maintainer (no automatic production deploy). E4 records the exact Railway mechanism in `docs/ops/deploy.md`.
- **S14.5** Each deploy runs migrations and the role-ACL sync in Railway's pre-deploy command (ADR-013); the start command only starts the server or the worker; after a production deploy `scripts/smoke.mjs` checks `/api/healthz`, the sign-in page and the security headers.
- **S14.6** Rollback redeploys the previous release. Because migrations are backward compatible for one release (S5.4), a rollback never runs `down()`; data recovery uses the restore runbook (S15.7).
- **S14.7** No pull-request preview environments in 1.0; `staging` is the shared pre-production environment.
- **S14.8** The existing multi-stage `Dockerfile` stays; its base images are pinned by digest (Renovate); the runtime stage already runs as the non-root `omuser` (`Dockerfile`), and an upgrade that removes it is rejected.

### S15 — Observability and operations

- **S15.1** Logging: `createLogger('<module>').child({ component })` from `@open-mercato/shared/lib/logger`; levels: `error` needs action, `warn` degraded but recovered, `info` business lifecycle (job start and finish with counts, import results), `debug` local only; production level `info` through `OM_LOG_LEVEL`. Fields: `module`, `command` or `job`, entity ids, `tenantId`, `organizationId`, request or trace id when available. Forbidden in logs: names, e-mail addresses, phone numbers, PESEL, tokens, bank transfer titles, message bodies, request bodies. Messages are constant strings; values go into fields. No `console.*` in runtime code.
- **S15.2** Every `catch` that records an error calls `reportError` with a `<module>.<reason>` fingerprint; E3 checks that the platform logs unhandled rejections before exit and, if it does not, adds a local patch.
- **S15.3** Telemetry: `@open-mercato/telemetry` exports traces only after a backend is chosen (ENG-Q-05); no personal data in span attributes or metric labels; the `newrelic` dependency shipped by the scaffold stays unconfigured.
- **S15.4** Health: Railway's health check uses `/api/healthz` (`railway.toml`). The platform route (`packages/app/src/app/api/healthz/route.ts`) probes PostgreSQL and — when `CACHE_STRATEGY=redis`, which `scripts/railway-start.sh` sets by default — Redis, each with a 1 500 ms timeout, and answers 503 when one fails; E4 confirms this on staging (ENG-TEST-08). The worker has no HTTP health check; its liveness is the missed-job alert (S15.5). An external uptime monitor checks `/api/healthz` every minute.
- **S15.5** Alerts reach both maintainers by e-mail and phone notification for symptoms only: app unavailable for 3 minutes; HTTP 5xx above 1 % for 5 minutes; webhook signature or processing failures; a failed or missed scheduled job (no successful run in 26 hours); queue backlog older than 15 minutes; PostgreSQL disk above 80 %; a failed backup. Everything else goes into a weekly digest.
- **S15.6** Service level objectives for the pilot: availability 99.5 % over 30 days; Stripe webhook endpoint 99.9 %; e-mail sending attempted within 5 minutes of its trigger; support best effort during Polish working hours with a response within one working day. When the 30-day error budget is spent, only fixes are deployed until a postmortem is written.
- **S15.7** Backups and restore (ADR-012): PITR enabled before pilot data; scheduled volume snapshots; a nightly encrypted `pg_dump -Fc` to EU storage at another provider, kept 30 days, with the encryption key held outside Railway; a scripted restore drill every quarter (first one in E4) whose RTO and RPO are recorded in `docs/ops/restore-drills.md`; targets RPO ≤ 5 minutes with PITR (≤ 24 hours from the off-site dump) and RTO ≤ 60 minutes. A production restore (`docs/ops/restore.md`) puts the app in maintenance (both kill switches of ADR-019 off), restores into a sibling service, switches the production database variable to it, and then reconciles everything that happened after the restore point and before the switch: Stripe payments and refunds are re-fetched from Stripe and replayed through the idempotent fulfilment, provider webhooks are re-delivered from the provider dashboards, and e-mails sent in that window are listed from the provider log so affected users can be told. The drill exercises the switch on staging. The production PostgreSQL image must provide every extension the enabled modules' migrations create and must be supported by Railway PITR; E3 lists the extensions, E4 chooses the image.
- **S15.8** Redis runs with a volume, `appendonly yes`, `appendfsync everysec` and `maxmemory-policy noeviction`; queue state is treated as recoverable because every job is idempotent and derivable from PostgreSQL.
- **S15.9** Runbooks in `docs/ops/`: `environments.md` (variables and where they live), `deploy.md`, `rollback.md`, `restore.md`, `incident.md` (including the breach path, S9.8), `postmortem-template.md` (blameless; timeline in UTC; action items with owners and dates), `upgrade-open-mercato.md` (P1).
- **S15.10** Environments: local (Docker Compose PostgreSQL 17 and Redis 7, e-mail disabled, personal Stripe sandbox); `staging` (Railway EU West, Stripe sandbox, e-mail allowlist, seeded demonstration club, never a copy of production data); `production` (Railway EU West, sealed secrets, PITR on, live Stripe account of the club).

### S16 — Dependencies and licences

- **S16.1** A new dependency needs: a need that installed platform packages do not cover; an active project (release within the last 12 months); a licence from the allowlist (MIT, ISC, BSD-2-Clause, BSD-3-Clause, Apache-2.0, 0BSD, CC0-1.0, BlueOak-1.0.0; MPL-2.0 for unmodified use); no install script unless allowlisted; a bundle-size note for client code; the workspace that uses it (`yarn workspace @vereino/<name> add …`); and product-owner approval (`AGENTS.md` → Ask First).
- **S16.2** `renovate.json` (ADR-016): schedule weekly on Monday before 06:00 Europe/Warsaw; groups for development dependencies (non-major), GitHub Actions and Docker digests; `minimumReleaseAge` 5 days; weekly lock-file maintenance in the same schedule; majors in separate pull requests; P1 and P2 packages disabled; no automerge.
- **S16.3** Vulnerabilities: Dependabot alerts enabled; a high or critical advisory in a runtime dependency is fixed within 7 days, a critical exploitable one within 48 hours, for P1/P2 packages through P6; a vulnerable transitive dependency owned by the platform gets an upstream issue and, if safe, a P4 `resolutions` entry.
- **S16.4** `yarn licenses:check` (`scripts/check-licenses.mjs`) lists the licences of production dependencies of every workspace and fails on any licence outside the allowlist, except packages listed with a reason in `CONTRIBUTING.md` (initially only `@open-mercato/enterprise`, ADR-023); it runs in the weekly security workflow, not in the gate.
- **S16.5** Platform upgrades (P1) are evaluated within 30 days of each Open Mercato minor release; the hours of each upgrade run are recorded in its run log and summarised per quarter for ADR-001.

### S17 — Documentation and open-source hygiene

- **S17.1** Root documents: `README.md` (what Vereino is, quick start, links), `CONTRIBUTING.md` (local setup, workflow S1, gate S2, commit and DCO rules, review and governance — two maintainers with equal merge rights, the product owner decides ties — pinned dependencies, local patches), `CODE_OF_CONDUCT.md` (Contributor Covenant 3.0 with two named contacts), `SECURITY.md` (S17.6), `CHANGELOG.md` (release-please), `LICENSE` (MIT, present). The `@open-mercato/*` packages Vereino uses are MIT (checked 2026-10-21); `@open-mercato/enterprise` is commercial and governed by ADR-023. No `NOTICE` file is needed while no non-MIT code is redistributed.
- **S17.2** `.github/`: `PULL_REQUEST_TEMPLATE.md` (spec and requirement ids, tests run, both catalogs updated, migrations and SQL reviewed, `BACKWARD_COMPATIBILITY.md` read for contract changes, UI evidence, run log link for agent work, DCO), `ISSUE_TEMPLATE/bug.yml`, `feature.yml`, `config.yml` (security reports go to private reporting), `CODEOWNERS`, `workflows/`; `renovate.json` at the root.
- **S17.3** Architecture decisions are rows of this spec's ADR table: a new decision appends a row and a Changelog entry; a superseded decision is marked, not deleted. Product decisions remain `DD-xx` rows in the club spec.
- **S17.4** Repository language is English (`AGENTS.md`). Exceptions: UI catalogs `pl.json`; Polish legal texts for users (privacy notices, regulations), written in Polish with an English translation; Polish legal terms keep their name with an English gloss on first use (e.g. "KP (cash receipt)").
- **S17.5** Each Vereino module has the `README.md` described in S4.1.
- **S17.6** `SECURITY.md`: GitHub private vulnerability reporting enabled; supported version = the latest release; acknowledgement within 3 working days; fix or mitigation target 90 days; coordinated disclosure; no bug bounty; a safe-harbour sentence.

### S18 — Local development

- **S18.1** Supported environments: Windows 11 (native and WSL2), macOS and Linux with Node 24 (`.nvmrc`), Corepack-managed Yarn 4.17.1 and Docker. New repository scripts are Node.js; existing platform shell scripts (`scripts/railway-*.sh`, `scripts/install-skills.sh`, `docker/scripts/*.sh`) stay as they are. On WSL, `yarn dev:fix-wsl-watchers` fixes file watchers.
- **S18.2** `CONTRIBUTING.md` documents setup from a clean clone: `yarn install`, `docker compose up -d` for PostgreSQL and Redis, the `.env` from `.env.example`, `yarn setup` or `yarn initialize` (with or without examples), `yarn dev`. A maintainer verifies it on a clean clone at the E1 exit; it takes at most 30 minutes.
- **S18.3** Development accounts per role are created by `seedExamples` with a password taken from `.env` (`VEREINO_DEV_PASSWORD`), never committed and never reused elsewhere.
- **S18.4** Stripe locally: `stripe listen --forward-to` the webhook route with a personal sandbox; e-mail sending disabled (S12.6).
- **S18.5** `.vscode/extensions.json` recommends the ESLint, Prettier and Tailwind CSS extensions; editor settings are not required.

### S19 — AI-agent workflow

- **S19.1** `AGENTS.md` is the agents' rulebook; `CLAUDE.md` only imports it. E1 changes its *Validation* section to `yarn verify`, rewrites its *Git* bullet for branches, pull requests, `git commit -s` and squash merge (S1.2 … S1.4), names the error-code registry (S6.7), and adds a pointer to this spec's standards.
- **S19.2** Agents route first, honour the spec gate, keep a run log for autonomous work, record lessons, and never stage, commit or push from a subagent; the coordinating session commits; push and pull requests only on the user's request (`AGENTS.md`).
- **S19.3** A pull request created by an agent states the agent and model in its description and links its run log; S1.5 requires a human approving review.
- **S19.4** Agents run the narrowest relevant check while working and `yarn verify` before committing a completed code task; documentation-only commits may rely on CI.
- **S19.5** Work repeated more than twice becomes a project skill in `.ai/skills/<id>/SKILL.md` or a script in `scripts/` (`AGENTS.md`).
- **S19.6** Agents never print secret values into transcripts, run logs or commits; they reference variable names only.

## Domain Vocabulary and Business Rules

| Term / invariant | Precise meaning or rule | Source of truth | Failure behavior |
|---|---|---|---|
| Vereino-owned code | Paths listed in S3.1; stricter lint, formatting and coverage apply | S3.1, `.prettierignore`, ESLint configuration | Lint or format step of `yarn verify` fails |
| Platform-owned code | Scaffold files of `packages/app` outside Vereino modules, plus `example`; changed only by upgrades or recorded local patches | S3.1, `CONTRIBUTING.md` → Local patches | Unrecorded change is rejected in review; an upgrade run re-applies recorded patches |
| Gate | `yarn verify`; passes only if every step exits 0 | `scripts/verify.mjs` | Non-zero exit; CI check `gate` red; merge blocked |
| Required check | A CI job that the `main` ruleset requires (S14.3) | GitHub ruleset | Merge button disabled; no bypass |
| Contract surface | Anything listed in S6.9 or in `BACKWARD_COMPATIBILITY.md` | S6.9 | Breaking change without deprecation bridge rejected in review |
| Error code | Lower snake_case identifier unique across the app, owned by one module, mapped to an HTTP status and an i18n message key | `lib/error-codes.ts` of the owning module | `yarn contracts:check` fails on duplicates or missing keys |
| Minor units | Integer amount in the currency's smallest unit (grosz for PLN) | S6.6, S10.1 | A decimal amount in JSON or a float in arithmetic is rejected in review; schema validation rejects non-integers |
| Lock token | The `updated_at` value the client last read, sent as the platform header or `expectedUpdatedAt` | S5.2 | Missing token → 400; stale token → 409 |
| Idempotency key | Provider event id or client `operationId` stored under a unique constraint | S4.5 | A repeat returns the first result; no second row |
| Expand/contract | Breaking schema change split over two releases so the previous release still runs on the new schema | S5.4 | Rollback never needs `down()` |
| Key area (ADR-001) | One of: member/guardian auth, tenancy and scope, payments gateway, member frontend pages, i18n | ADR-001 | A blocker in two key areas triggers the exit decision |
| Blocker | A required behaviour that the platform cannot provide without editing platform-owned code or a fallback the club spec rejects | E3 spike report | Recorded in the ADR-001 checkpoint row |
| Upgrade cost | Working hours recorded in the run logs of P1 upgrade runs, averaged per month over a quarter | `.ai/runs/*upgrade*` | More than 8 hours per month triggers the exit decision |
| Sessionless route | A route reachable without a session (public page, personal link, webhook) | S8.6, club spec DD-35 | Rate limited, 202 for request endpoints; public pages show no personal data, token pages only the token subject's data and are never cached |
| Personal-link token | 32-byte random secret identifying one purpose and one subject | S8.7 | Used or expired → 410; foreign subject → 403 |
| Release | A tag `vX.Y.Z` created by merging the release-please pull request | ADR-021 | Production deploys only tagged commits |
| RTO / RPO | Time to restore service / maximum data loss in time, measured in restore drills | S15.7 | A drill above target opens an action item in `docs/ops/restore-drills.md` |
| Error budget | 0.5 % of a 30-day window for the app (≈ 3.6 hours) | S15.6 | Only fixes deploy until a postmortem is written |
| Local patch | A recorded modification of a platform-owned file (e.g. `next.config.ts` headers, the i18n check's `--strict`) | `CONTRIBUTING.md` | An upgrade run re-checks every listed patch |

Invariants: `main` is always green on required checks; a migration on `main` never changes; production runs only release tags; no personal data in logs, events or URLs; every error code has both catalog messages; every Vereino module has identical `en` and `pl` key sets.

## Users, Permissions, and Scope

This spec governs the repository and its operations, not the app's runtime roles; the "feature ID" column therefore names the GitHub or hosting permission that controls the actor.

| Actor | Allowed outcomes | Scope rule | Required feature IDs |
|---|---|---|---|
| Product owner (maintainer) | Approves specs, new dependencies, migrations, production deploys, compliance documents; administers repository settings | Whole repository and hosting account | GitHub `admin` on `wladku/Vereino`; Railway project owner |
| Maintainer | Writes, reviews and merges pull requests; deploys to production; runs restore drills | Whole repository; production only through runbooks | GitHub `maintain` or `admin`; Railway member; listed in `CODEOWNERS` |
| Outside contributor | Opens pull requests from forks with DCO sign-off | Fork only; CI without secrets | GitHub public access |
| AI agent | Works on a local branch, writes run logs, commits in the coordinating session; pushes or opens a pull request only on request | Local checkout of the requesting maintainer | Uses the maintainer's credentials; never holds its own |
| Renovate, release-please, DCO, CodeQL | Open update or release pull requests, report checks | Repository contents through installed GitHub apps or the workflow token | GitHub app installation; workflow `permissions` per job |
| Operator (maintainer on duty) | Deploys, rolls back, restores, rotates secrets | Railway environments | Railway environment access; sealed variables editable only by the project owner |

Trusted `tenantId` and `organizationId` in the app are derived as the platform and the club spec define (`AGENTS.md` → Always; club spec *Users, Permissions, and Scope*); the only system-scope operation this spec allows is the sessionless lookup in S8.6.

## Reuse and Ownership Map

| Capability | Reuse / extend / app-own | Existing module or new module | Integration seam | Why |
|---|---|---|---|---|
| Structured logging | reuse | `@open-mercato/shared/lib/logger` | `createLogger` per module | pino-based platform logger; S15.1 only adds field and level rules |
| Error reporting | reuse | platform `reportError` | `<module>.<reason>` codes | Upstream rule; one mechanism |
| HTTP errors | reuse + app-own registry | `@open-mercato/shared/lib/crud/errors` + module `lib/error-codes.ts` | `CrudHttpError` body `{ error, code }` | Platform helpers lack a code parameter (ADR-007) |
| Rate limiting | reuse | `@open-mercato/shared/lib/ratelimit`, route `metadata` | per-method metadata or DI service | Installed; club spec V-10 verifies coverage of sessionless routes and per-e-mail keys |
| Webhook verification | reuse | `@open-mercato/shared/lib/webhooks`, provider SDKs | raw-body verification | Installed; S8.8 |
| Queue, scheduler, cache | reuse | `@open-mercato/queue`, `scheduler`, `cache` | workers, `setup.ts` targets, DI | `AGENTS.md` forbids ad hoc queues and caches |
| Telemetry | reuse | `@open-mercato/telemetry` | OTLP exporter configuration | Installed; backend choice ENG-Q-05 |
| Field encryption and lookup hashes | reuse | `TenantDataEncryptionService`, `encryption.ts` | encryption maps, `findWithDecryption` | `AGENTS.md` forbids ad hoc crypto |
| CRUD API and OpenAPI | reuse | `makeCrudRoute`, `@open-mercato/shared/lib/openapi` | route files | ADR-005 |
| Admin UI primitives and design-system check | reuse | `@open-mercato/ui`, `scripts/ds-check.mjs` | pages, components | S7.1 |
| Online payments | reuse | `payment_gateways` + `@open-mercato/gateway-stripe` | gateway adapter, webhook handler | ADR-010; club spec V-5 |
| E-mail transport | reuse (pending V-4) | `@open-mercato/channel-resend` or environment SMTP | communication channel | ADR-011 |
| Health check | reuse | existing `/api/healthz` | Railway health check | Verified in E4 |
| Agent harness, lessons check | reuse | `.ai/harness`, `scripts/check-lessons.mjs` | `yarn lessons:check` in the gate | Already maintained |
| Canonical gate, contracts check, licence check, smoke script | app-own (tooling) | `scripts/verify.mjs`, `packages/app/scripts/check-vereino-contracts.mjs`, `scripts/check-licenses.mjs`, `scripts/smoke.mjs` | root scripts | No platform equivalent |
| CI, repository settings, Renovate, release-please | app-own (configuration) | `.github/`, `renovate.json`, release-please config | GitHub | No platform equivalent for the app repository |
| Compliance and operations documents | app-own (documents) | `docs/compliance/`, `docs/ops/` | — | Project-specific obligations |

No app entity is introduced by this spec; the installed records named in the club spec stay the source of truth.

## Architecture and Data Flow

Delivery pipeline:

```text
maintainer / AI agent -> branch <type>/<slug> -> yarn verify (local)
  -> pull request (template, DCO, conventional title)
  -> CI: gate | integration | perf | pr-title | dependency-review | CodeQL | DCO
  -> review (CODEOWNERS paths: second maintainer; agent PRs: human)
  -> squash merge to main -> Railway staging deploy (pre-deploy: migrate + ACL sync) -> smoke
  -> release-please PR -> merge -> tag vX.Y.Z + CHANGELOG
  -> maintainer deploys tag to production (pre-deploy: migrate + ACL sync) -> smoke -> monitoring
```

Runtime layering inside a Vereino module (S4.2):

```text
page (backend/frontend) -> apiCall / CrudForm -> api/<resource>/route.ts (metadata, openApi, Zod)
  -> command <module>.<entity>.<action> (scope, lock, lib/ rules, unit of work)
       -> entities (data engine, encryption maps)
       -> after commit: events -> subscribers / workers -> external providers (Stripe, Resend)
lib/ (pure, framework-free) <- commands, workers, tests      @vereino/core <- lib/ when shared
```

- **Module boundaries:** the standards are grouped by concern (S1–S19); the runtime boundary rules are S4.2–S4.4 and S4.9, enforced by `eslint-plugin-boundaries`.
- **Extension points:** none added. Platform-owned files that the standards must touch (`next.config.ts` headers, the i18n check's `--strict` mode, the ESLint configuration, Railway start scripts) are changed as recorded local patches (S3.1).
- **Alternatives considered:** recording the standards only in `AGENTS.md` (rejected: it is a routing file with token budgets, not a place for rationale); a separate `docs/engineering/` handbook (rejected: a second normative source would drift from the spec).
- **Compatibility:** the standards change no app behaviour. `yarn verify` adds steps to the existing scripts without renaming them; existing scripts (`yarn typecheck`, `yarn lint`, `yarn test`, …) keep working. The club spec's API examples change in E5 (S6.4), before any route exists.

## User Journeys

### Journey EJ-01 — A contributor delivers a change

1. A maintainer, agent or outside contributor creates `feat/<slug>` from `main`, implements one task and runs `yarn verify`.
2. They open a pull request with a Conventional Commit title, the template filled in and signed-off commits; CI runs the required checks.
3. A green pull request outside `CODEOWNERS` paths is squash-merged by a maintainer; inside them, after the second maintainer approves. Staging deploys automatically.
4. A red check blocks the merge; the author reads the job log and fixes the cause; a missing sign-off is fixed by amending with `-s`; a failing title is edited in place.

### Journey EJ-02 — A schema change reaches production

1. The author changes entities, runs `yarn db:generate`, keeps only the module's statements and the updated snapshot, and pastes the SQL into the pull request.
2. The second maintainer approves (`migrations/**` is a `CODEOWNERS` path); staging's pre-deploy step applies the migration.
3. A release tag is deployed to production; the pre-deploy step migrates before the new code starts; the smoke script passes.
4. If the migration fails, the deploy stops and the previous release keeps serving; a transactional migration rolled back on its own, a non-transactional one is completed by re-running it (S5.4), and a corrective migration follows if the SQL was wrong. A breaking change was split by expand/contract, so redeploying the previous release needs no `down()`.

### Journey EJ-03 — Dependency and security updates

1. Renovate opens grouped weekly pull requests for packages older than 5 days; P1/P2 packages are excluded.
2. CI runs; a maintainer merges green ones within 7 days.
3. The weekly security workflow reports a high advisory; a maintainer fixes it within 7 days (48 hours if critical and exploitable), using `--no-time-gate` only for that fix.
4. A licence outside the allowlist fails `yarn licenses:check`; the dependency is replaced or the product owner records an exception in `CONTRIBUTING.md`.

### Journey EJ-04 — Open Mercato upgrade

1. A maintainer starts an upgrade run with the matching `om-auto-upgrade-*` skill on `chore/upgrade-open-mercato-<version>` and opens a run log.
2. The run updates every `@open-mercato/*` package and the P2 packages together, re-checks every local patch, and runs `yarn verify` and the integration suite.
3. The run log records hours spent; the quarterly sum feeds ADR-001.
4. If the upgrade breaks a Vereino module, the branch is not merged; the run log records the blocker and the product owner decides whether it counts towards the exit trigger.

### Journey EJ-05 — Release, production deploy and rollback

1. Merges to `main` accumulate in the release-please pull request; merging it creates `vX.Y.Z` and the `CHANGELOG.md` entry with upgrade notes.
2. A maintainer deploys the tag to production following `docs/ops/deploy.md`; the pre-deploy step migrates; the smoke script checks health, sign-in and headers.
3. Monitoring shows normal error rates; the release is done.
4. If the smoke script or alerts fail, the maintainer redeploys the previous release (`docs/ops/rollback.md`) and opens an incident record.

### Journey EJ-06 — Incident with possible personal-data breach

1. An alert or a report reaches both maintainers; the on-duty maintainer opens an incident record from `docs/ops/incident.md`.
2. The incident is contained (kill switch, rollback, secret rotation); the breach assessment decides within 72 hours of awareness whether UODO must be notified and whether data subjects must be informed.
3. Every incident is entered in `docs/compliance/breach-register.md` (no personal data in it); a blameless postmortem with owned action items follows.
4. If the 72-hour deadline cannot be met with complete facts, a staged notification is sent and completed later.

### Journey EJ-07 — Quarterly restore drill

1. A maintainer restores PITR to T−1 h into a sibling Railway service and runs the restore verification script (row counts per organization, the payments invariant check, a known receipt number).
2. They rehearse the switch on staging: maintenance on, staging database variable pointed at the restored service, reconciliation of Stripe and e-mail activity after the restore point (S15.7), maintenance off. They restore the latest off-site dump into a local PostgreSQL 17.
3. They record times, achieved RTO/RPO and issues in `docs/ops/restore-drills.md`.
4. A failed or over-target drill opens an action item that blocks the next production release until resolved.

### Journey EJ-08 — Autonomous AI run

1. The user asks an agent for multi-step work; the agent routes the task, creates a run log and follows the governing spec.
2. Subagents work on disjoint files and never stage or commit; the coordinating session verifies and commits one task per commit with sign-off.
3. The run log lists steps, decisions, commands with results and open problems; the agent pushes or opens a pull request only when asked.
4. If verification fails, the agent fixes the cause or stops and reports it verbatim in the run log; it never weakens a check to pass.

## UI and Interaction Contracts

N/A — this spec adds no page, widget or menu entry. The UI rules in S7 apply to every surface the club spec defines; the club spec's *UI and Interaction Contracts* remain the place where each surface is specified.

### UI architecture

N/A — no navigation, dashboard or widget changes.

## Data Models

N/A — this spec introduces no app entity. Data conventions are S5, S6.5, S6.6 and S10.

Research C Appendix A proposes tables that belong to club spec modules. Phase E5 hands them over as amendments; the club spec decides each:

| Proposed table | Owning club module | Purpose | Related standard |
|---|---|---|---|
| `people_consents` | `people` | Versioned consent rows (publish name, image, marketing, minor account enabled) | S9.2, S9.3 |
| `people_retention_log` | `people` | Audit of anonymisation and retention sweeps | S9.6 |
| `payments_gateway_events` | `payments` | Webhook de-duplication by provider event id | S8.8, S10.8 |
| `payments_sequences` | `payments` | Gap-free KP/RG numbering per organization, series and year | S10.5 |
| `payments_audit` | `payments` | Append-only money audit beyond the platform action log, if the platform log is insufficient | S10.4 |
| `payments_bank_profiles` | `payments` | Per-bank CSV/MT940 mapping reused across imports | S10.7 |
| `communication_email_status` | `communication` | Delivery and suppression state per address | S12.5 |
| Shared link-token shape | `people` or per module | One shape for all personal-link tokens to simplify purge and audit | S8.7 |
| Per-organization key versions | platform encryption (verify first) | Crypto-shredding on tenant offboarding, only if the platform encryption service lacks it | S5.6 |

## API, Command, and Error Contracts

This spec adds no app route. Its contracts are the existing health route it relies on and the repository commands that CI, agents and runbooks call (stable per S6.9).

| Method / command | Path / ID | Auth and feature gate | Input | Success response / event | Errors and concurrency | Requirement IDs |
|---|---|---|---|---|---|---|
| `GET` (platform, existing) | `/api/healthz` | none (Railway health check) | none | 2xx when the app can serve requests; E4 records whether database and Redis are checked | non-2xx → Railway marks the deploy unhealthy | ENG-10 |
| CLI | `yarn verify` | local or CI | optional `--from <step>` to resume a failed run locally | exit 0; step summary | exit code of the first failing step | ENG-03 |
| CLI | `yarn format` / `yarn format:check` | local or CI | none | files formatted / exit 0 | exit 1 listing unformatted files | ENG-05 |
| CLI | `yarn contracts:check` | local or CI | none | exit 0 | exit 1 naming the duplicate code, missing key or catalog difference | ENG-06 |
| CLI | `yarn i18n:check-hardcoded --strict` | local or CI | none | exit 0 | exit 1 on findings in Vereino module paths | ENG-03 |
| CLI | `yarn licenses:check` | weekly workflow | none | exit 0 | exit 1 naming package and licence | ENG-12 |
| CLI | `node scripts/smoke.mjs <base-url>` | operator | base URL | exit 0 | exit 1 naming the failing probe | ENG-10 |
| Error code registry | `src/modules/<id>/lib/error-codes.ts` (data) + `api/errors.ts` (factory) | — | `{ code, status, messageKey }[]` | codes thrown as `CrudHttpError(status, { error, code })` | duplicates and missing messages fail `contracts:check` | ENG-06 |

## Events, Jobs, Notifications, and Cross-Module Flows

No app events. Automation introduced by this spec:

| Trigger | Producer | Consumer | Side effect | Retry / idempotency / audit behavior |
|---|---|---|---|---|
| `pull_request`, `push` to `main` | GitHub | `ci.yml` jobs | Check results; artifacts on failure | Re-run from the GitHub UI; concurrency cancels superseded runs |
| `push` to `main` | GitHub | `release.yml` (release-please) | Release pull request updated; tag on merge | Idempotent: release-please recomputes from commit history |
| Weekly schedule; `yarn.lock` change | GitHub | `security.yml` | Audit and licence reports | Re-runnable; findings tracked as issues |
| Weekly schedule (Monday) | Renovate app | repository | Grouped update pull requests | Renovate rebases or recreates its own branches |
| Nightly schedule | backup job (mechanism chosen in E4) | off-site storage | Encrypted `pg_dump -Fc` | A failure alerts (S15.5); next night retries; 30-day retention |
| Every deploy | Railway pre-deploy | PostgreSQL | Migrations and role-ACL sync | A failure stops the deploy; previous release keeps serving |
| Quarterly | maintainer | sibling Railway service | Restore drill record | Recorded in `docs/ops/restore-drills.md` |
| Every minute | uptime monitor | `/api/healthz` | Availability alerts | Alert after 3 consecutive minutes down |

Domain jobs mentioned in S9.5, S10.6 and S11.3 (retention sweeps, invariant check, occurrence generation) are specified in the club spec.

## Security, Privacy, and Compliance

- **Authorization:** feature ids and record scope as in S8.3; repository authorization through rulesets and `CODEOWNERS` (S1.1, S1.5); production access limited to maintainers (see *Users, Permissions, and Scope*).
- **Tenant isolation:** trusted scope, platform scope checks, `people.scopeService`, two-tenant tests on every route (S13.4), raw-SQL rule (S5.8), unique constraints that include `organization_id` (S5.3); row-level security decided in E3 (ADR-008).
- **Sensitive data:** platform field encryption and lookup hashes (S5.6); no personal data in logs, events, URLs or idempotency keys (S9.4, S15.1); retention and anonymisation (S9.5, S9.6); compliance documents (S9.7).
- **Abuse and failure modes:** account enumeration (uniform 202), link prefetch consuming tokens (GET never mutates), replayed or forged webhooks (raw-body signature, tolerance, de-duplication), spam on public forms (rate limits, honeypot, time trap, e-mail verification), supply-chain compromise (age gate, pinned actions, audit, licence check, code review), secret leakage (sealed variables, push protection, no secrets in logs), silent production initialisation (ADR-013), unrestorable backups (quarterly drills).

## Integration Coverage

Most tests here verify tooling and operations; app-level oracles live in the club spec and follow S13.

| Test ID | Level | Setup / fixture | Actions | Assertions | Requirement IDs |
|---|---|---|---|---|---|
| ENG-TEST-01 | tooling | Throwaway branch with one seeded violation per gate step (hard-coded JSX text in a Vereino module, `any`, unformatted file, palette class, missing `pl` key, failing unit test) | Run `yarn verify` once per violation | Each run exits non-zero at the expected step; a clean tree exits 0 | ENG-03, ENG-05 |
| ENG-TEST-02 | repository | Draft pull request with a failing test, one with a non-conventional title, one with an unsigned commit | Try to merge each as an administrator | Merge is blocked for each; after fixing, merge succeeds | ENG-04, ENG-13 |
| ENG-TEST-03 | unit (Jest) | ESLint Node API over fixture files in two fake Vereino modules | Lint a runtime cross-module import, a type-only import, and an `@open-mercato` import inside `lib/` | First and third report boundary errors; the type-only import passes | ENG-05, ENG-06 |
| ENG-TEST-04 | unit (Jest) | Fixture registries with a duplicate code and a missing `pl` key | Run the contracts check function | Both reported with module and code; a valid fixture passes | ENG-06 |
| ENG-TEST-05 | integration | `packages/app/.ai/qa/tests/platform/ENG-TEST-05-runner-smoke.spec.ts` | Create a tenant, organization and user through the API; sign in | Sign-in succeeds; runs in CI and on a clean local clone | ENG-11 |
| ENG-TEST-06 | spike (integration) | Staging-like database; app role without `BYPASSRLS`; one Vereino table with a restrictive policy | Query another organization's rows as the app role; exercise sign-in, a CRUD route, a scheduled job and a migration | Decision recorded with evidence: either RLS is adopted with these flows passing, or rejected with the failing flow named | ENG-07 |
| ENG-TEST-07 | spike | Production build (`yarn build`) | Run the integration suite against it; execute club spec V-1 … V-12 | DI resolution works after minification; each V item has a recorded result and fallback decision | ENG-02 |
| ENG-TEST-08 | operations (staging) | Staging environment with uptime monitor and alerts | Stop PostgreSQL, then Redis | `/api/healthz` turns non-2xx (or the gap is recorded); both maintainers get an alert within 5 minutes | ENG-10 |
| ENG-TEST-09 | operations | Production-like data on staging | PITR restore to T−1 h into a sibling service; run the verification script | Verification passes; RTO ≤ 60 min recorded | ENG-10 |
| ENG-TEST-10 | operations | Latest nightly off-site dump | Decrypt and restore into local PostgreSQL 17 | Restore succeeds; row counts match the source within the dump window | ENG-10 |
| ENG-TEST-11 | security | Staging deploy | Run `scripts/smoke.mjs` | HSTS, Permissions-Policy and the decided CSP are present; authenticated responses are `no-store` | ENG-08 |
| ENG-TEST-12 | security | Staging service with one required `VEREINO_*` variable removed | Deploy | The app refuses to start and the deploy is marked unhealthy | ENG-08 |
| ENG-TEST-13 | operations | Staging service pointed at an empty database URL | Deploy | Pre-deploy migration fails or the start fails; no `yarn initialize` runs; the previous release keeps serving | ENG-10 |
| ENG-TEST-14 | review | `docs/compliance/*` | Product owner review against S9.7 | Every document present, approved and dated; retention rows map to jobs | ENG-09 |
| ENG-TEST-15 | review | Club spec amendment B pull request | Compare against the E5 hand-over list | Every item accepted, rejected with reason, or deferred with a question id | ENG-14 |
| ENG-TEST-16 | integration | axe fixture | Scan the platform sign-in page | Report produced; violations either zero critical/serious or recorded as a platform baseline | ENG-11 |
| ENG-TEST-17 | integration | `perf` job | Lighthouse CI mobile on the sign-in page | Report uploaded; baseline recorded in the E1 run log | ENG-11 |
| ENG-TEST-18 | tooling | Renovate app installed; licence fixture with a GPL package | First Renovate run; run `yarn licenses:check` on the fixture | Grouped pull requests appear without P1/P2 packages; the licence check fails on the fixture | ENG-01, ENG-12 |
| ENG-TEST-19 | manual | Clean clone on Windows 11 and on Linux or WSL2 | Follow `CONTRIBUTING.md` setup | App running in ≤ 30 minutes; deviations fixed in the document | ENG-11 |
| ENG-TEST-20 | review | Repository settings | Inspect the Security tab and root documents | Private vulnerability reporting, secret scanning with push protection and Dependabot alerts enabled; S17.1 documents present | ENG-13 |
| ENG-TEST-21 | tooling | Release workflow merged to `main` | Let release-please run; merge its pull request | A tag and a `CHANGELOG.md` entry listing the E1 and E2 changes exist | ENG-12 |
| ENG-TEST-22 | review | Club spec amendment A pull request; `AGENTS.md` diff | Search the club spec and `AGENTS.md` for gate lines, list shapes, error-code mentions and the Git workflow | Only `yarn verify`, the paged list shape and registry-format codes remain; `AGENTS.md` describes branches, pull requests and `git commit -s` | ENG-03, ENG-06 |

## Implementation Phases

### Phase E1 — Gate and CI

- **Depends on:** this spec approved and ENG-Q-01, ENG-Q-02, ENG-Q-08 answered.
- **Outcome:** every change to `main` passes one gate, locally and in CI, and the club spec already uses the API conventions before any of its routes exist.
- **Why this order / value delivered:** enforcement and conventions must exist before club phase 1 code lands; neither depends on hosting or legal questions.
- **Deliverables:** root `verify`, `format`, `format:check` scripts and `scripts/verify.mjs`; `packages/app/scripts/check-vereino-contracts.mjs` and `contracts:check`; the E1 local patches of the *Local patches* table; Prettier configuration and `.prettierignore`; `.editorconfig`; `.nvmrc`; `lint` and `test` scripts in shared packages; package `tsconfig` options (S3.2); integration fixtures (S13.9) and the ENG-TEST-05 smoke test; axe and Lighthouse CI baselines; `.github/workflows/ci.yml`; CodeQL default setup; `main` ruleset; `CODEOWNERS`; pull-request template; DCO app; `AGENTS.md` edits — *Validation* → `yarn verify`, *Git* bullet → branch and pull request per S1.2–S1.4 with `git commit -s`, squash merge, one task = one pull request, and a pointer to S6.7 and to this spec; `.ai/agentic.config.json` → `yarn verify`; club spec amendment A: phase validation lines → `yarn verify`, list responses → the paged shape (S6.4), error codes → the registry (S6.7).
- **Independent slices / estimated pull requests:** (a) local tooling and gate; (b) CI workflow and repository settings (settings done by the product owner); (c) `AGENTS.md`, agentic configuration and club spec amendment A.
- **Requirements closed:** ENG-03, ENG-04, ENG-05, ENG-06, ENG-11.
- **Tests:** ENG-TEST-01 … ENG-TEST-05, ENG-TEST-16, ENG-TEST-17, ENG-TEST-19, ENG-TEST-22.
- **Validation:** `yarn verify`; `yarn test:integration:ephemeral --grep "ENG-TEST-05"`; CI green on each E1 pull request; the blocked draft pull requests of ENG-TEST-02.
- **Exit gate:** the E1 pull requests merged through the new ruleset with all required checks, `integration` included; ENG-TEST-02 evidence (screenshots of blocked merges) in the run log; a clean-clone setup recorded; no platform-owned file changed except the listed local patches. If the integration runner cannot run on GitHub-hosted runners, E1 stays open.

### Phase E2 — Repository hygiene and release

- **Depends on:** Phase E1 exit gate.
- **Outcome:** dependency updates, vulnerability and licence checks, releases and contributor documents run without manual steps.
- **Why this order / value delivered:** Renovate and release-please need the E1 checks to judge their pull requests; release-please can only be proven after a merge to `main`.
- **Deliverables:** `scripts/check-licenses.mjs` and `licenses:check`; `.github/workflows/{security,release}.yml`; Renovate app and `renovate.json`; release-please configuration and `CHANGELOG.md`; issue templates; `CONTRIBUTING.md` (including the *Pinned and overridden dependencies* and *Local patches to platform files* tables), `CODE_OF_CONDUCT.md`, `SECURITY.md`, `.vscode/extensions.json`; GitHub private vulnerability reporting, secret scanning with push protection and Dependabot alerts enabled.
- **Independent slices / estimated pull requests:** (a) contributor and security documents and settings; (b) Renovate, security workflow and licence check; (c) release-please.
- **Requirements closed:** ENG-01, ENG-12, ENG-13.
- **Tests:** ENG-TEST-18, ENG-TEST-20, ENG-TEST-21.
- **Validation:** `yarn verify`; first Renovate run; first release pull request.
- **Exit gate:** a grouped Renovate pull request merged; the security workflow green; a release tag with a `CHANGELOG.md` entry exists; the S17.1 documents are linked from `README.md`.

### Phase E3 — Platform spike and ADR-001 checkpoint

- **Depends on:** Phase E1 exit gate (may run in parallel with E2: it touches different files).
- **Outcome:** every unknown platform contract that the standards and the club spec rely on has a recorded result, and the product owner confirms or revises ADR-001.
- **Why this order / value delivered:** the exit decision is cheapest before club phase 1 code exists; the spike also decides RLS, CSRF, cookies and MFA, which E4 configures.
- **Deliverables:** results of club spec V-1 … V-12 appended to the club spec's *Open Questions*; spike notes in the run log for: RLS (ADR-008, ENG-TEST-06), DI under a production build (S4.8), platform CSRF protection for JSON `POST` (S8.9), session cookie attributes (S8.5), MFA support (S8.2), `noUncheckedIndexedAccess` cost (S3.2), PostgreSQL extensions required by enabled modules (S15.7), whether platform persistent events are stored durably before dispatch (S5.7), session lifetime and idle timeout (S8.5), whether removing `@open-mercato/enterprise` breaks any installed import (ADR-023), whether `api_docs` can emit an OpenAPI file for a contract diff (S6.9), whether the platform logs unhandled rejections and sends `no-store` on authenticated responses (S15.2, S8.4); an ADR-001 checkpoint row added to this spec's Changelog; ADR-008 updated with the RLS decision; if V-12 finds no installed contract for the sessionless lookup, an `AGENTS.md` exception for the S8.6 lookup, reviewed against `BACKWARD_COMPATIBILITY.md` and approved by the product owner.
- **Independent slices / estimated commits:** V items grouped by club phase — 3 commits; engineering spikes — 2 commits; checkpoint — 1 commit.
- **Requirements closed:** ENG-02, ENG-07.
- **Tests:** ENG-TEST-06, ENG-TEST-07.
- **Validation:** `yarn verify`; `yarn test:integration:ephemeral` against a production build.
- **Exit gate:** every listed item has a result and a decision; the checkpoint row states "keep" or "exit" with the counted key-area blockers; on "exit" all later phases stop until the product owner approves a successor spec.

### Phase E4 — Operations and security baseline before pilot data

- **Depends on:** Phase E2 exit gate (release tags exist) and Phase E3 exit gate with ADR-001 kept; ENG-Q-03, ENG-Q-04, ENG-Q-05, ENG-Q-10 answered.
- **Outcome:** staging and production run on Railway EU West with safe deploys, backups that were restored once, monitoring and alerts, and the security headers in place.
- **Why this order / value delivered:** no real person's data may enter the system before it can be restored and before failures are noticed.
- **Deliverables:** Railway `staging` and `production` environments; sealed production variables; boot-time variable validation (S8.10); Redis volume and persistence settings; PITR enabled; nightly off-site dump job; first restore drill; pre-deploy migrations and a start command without initialisation (ADR-013); `scripts/smoke.mjs`; uptime monitor and alerts; security headers and CSP decision (local patch to `next.config.ts`); Docker base digests and non-root check; `docs/ops/*` runbooks.
- **Independent slices / estimated commits:** (a) environments, variables, deploy and smoke — 2 commits; (b) backups and restore drill — 1 commit; (c) monitoring and alerts — 1 commit; (d) headers and container hardening — 1 commit.
- **Requirements closed:** ENG-08, ENG-10.
- **Tests:** ENG-TEST-08 … ENG-TEST-13.
- **Validation:** `yarn verify`; `node scripts/smoke.mjs <staging-url>`; restore drill record.
- **Exit gate:** a release tag deployed to production through the pre-deploy step; ENG-TEST-08 … ENG-TEST-13 evidence in the run log; restore drill RTO ≤ 60 minutes recorded.

### Phase E5 — Compliance pack and domain hand-over

- **Depends on:** Phase E4 exit gate (the DPIA and processor register describe the deployed hosting); ENG-Q-06, ENG-Q-07 answered.
- **Outcome:** the product owner can approve entering pilot data, and the club spec contains every domain requirement found in research C.
- **Why this order / value delivered:** compliance documents describe real hosting and real processors; the club spec amendments must land before club phase 1 implementation starts.
- **Deliverables:** `docs/compliance/{ropa,dpia,processors,breach-register,retention,data-subject-requests,asvs-checklist}.md`; privacy notices in Polish and English including a short version for children; verification notes for research C B1, B2, B3, B10, B12; club spec amendment B (domain hand-over) that: adds the tables of *Data Models* above or rejects them with reasons, adds retention sweeps and the payments invariant job, adds research C TEST-C01 … TEST-C19 as club `TEST-0xx` cases, and resolves Q-019 per ENG-Q-07.
- **Independent slices / estimated commits:** (a) compliance documents — 2 commits; (b) club spec amendment — 1 commit.
- **Requirements closed:** ENG-09, ENG-14.
- **Tests:** ENG-TEST-14, ENG-TEST-15.
- **Validation:** `yarn verify`; product-owner review records.
- **Exit gate:** compliance documents approved and dated by the product owner; the club spec amendment merged with a Changelog row; the pilot data gate recorded in this spec's Changelog.

## Requirement Traceability

| Requirement | Journey / surface | Data/API/event contracts | Phase | Tests | Acceptance criterion |
|---|---|---|---|---|---|
| ENG-01 | EJ-03, EJ-04 | P1 … P6, `renovate.json`, `yarn install --immutable` | E2 | ENG-TEST-18 | ENG-AC-12 |
| ENG-02 | EJ-04 | ADR-001, spike report, upgrade run logs | E3 | ENG-TEST-07 | ENG-AC-07 |
| ENG-03 | EJ-01, EJ-08 | `yarn verify`, `scripts/verify.mjs`, `--strict` i18n check, club spec amendment A | E1 | ENG-TEST-01, ENG-TEST-22 | ENG-AC-01 |
| ENG-04 | EJ-01 | `ci.yml`, `main` ruleset | E1 | ENG-TEST-02 | ENG-AC-02 |
| ENG-05 | EJ-01 | Prettier, ESLint additions, `tsconfig` options | E1 | ENG-TEST-01, ENG-TEST-03 | ENG-AC-03 |
| ENG-06 | EJ-01 | S4, S6, `lib/error-codes.ts`, `api/errors.ts`, `yarn contracts:check`, club spec amendment A | E1 | ENG-TEST-03, ENG-TEST-04, ENG-TEST-22 | ENG-AC-04 |
| ENG-07 | EJ-02 | S5, ADR-008 | E3 | ENG-TEST-06 | ENG-AC-07 |
| ENG-08 | EJ-05, EJ-06 | S8, `next.config.ts` local patch, boot validation | E4 | ENG-TEST-11, ENG-TEST-12 | ENG-AC-10 |
| ENG-09 | EJ-06 | `docs/compliance/*` | E5 | ENG-TEST-14 | ENG-AC-11 |
| ENG-10 | EJ-02, EJ-05, EJ-07 | ADR-012, ADR-013, `docs/ops/*`, `scripts/smoke.mjs`, `/api/healthz` | E4 | ENG-TEST-08, ENG-TEST-09, ENG-TEST-10, ENG-TEST-13 | ENG-AC-08, ENG-AC-09 |
| ENG-11 | EJ-01 | S13, Playwright configuration, axe and Lighthouse CI | E1 | ENG-TEST-05, ENG-TEST-16, ENG-TEST-17, ENG-TEST-19 | ENG-AC-05, ENG-AC-14 |
| ENG-12 | EJ-03, EJ-05 | `security.yml`, `release.yml`, `yarn licenses:check` | E2 | ENG-TEST-18, ENG-TEST-21 | ENG-AC-12 |
| ENG-13 | EJ-01 | S17, DCO, `CODEOWNERS`, templates | E2 | ENG-TEST-02, ENG-TEST-20 | ENG-AC-13 |
| ENG-14 | — (club spec) | Club spec amendment | E5 | ENG-TEST-15 | ENG-AC-06 |

Every requirement maps to one phase, at least one test and one acceptance criterion. No phase is a catch-all.

## Rollout, Migration, and Rollback

- **Adoption:** the standards apply from the moment this spec is `Ready for implementation`; until then they are proposals. Existing scaffold code is exempt (S3.1); the Boy Scout rule applies only to lines a change touches in Vereino-owned paths.
- **Order:** E1 → E2 and E3 (in parallel, different files) → E4 → E5. Club phase 1 code may start after E1 and E3 — by then the club spec uses the API conventions (amendment A) and the platform spike has answered V-1 … V-12 — if the product owner accepts that E4/E5 finish before pilot data; no real person's data before the E5 exit gate.
- **Repository settings** (ruleset, apps, security features) are changed by the product owner or with their explicit approval, because they act on an external service.
- **Migration:** none for app data. Platform-owned files touched by local patches are listed in `CONTRIBUTING.md` so upgrades re-apply them.
- **Rollback:** each tooling change is a normal commit and can be reverted. A broken or unavailable required check is handled only by the S1.8 break-glass procedure. Railway configuration changes are reverted from the Railway dashboard; the previous release stays deployable at all times (S14.6).

## Risks and Tradeoffs

| Risk / tradeoff | Impact | Mitigation / detection | Residual risk |
|---|---|---|---|
| Typed linting and the full gate make CI slow | Developers skip local runs; long feedback loop | `gate` p50 tracked; ESLint cache; typed rules only on Vereino paths; ADR-002 revisit at 15 min | low |
| Stricter rules collide with platform patterns used inside Vereino modules (e.g. platform helpers typed `any`) | Lint noise, pressure to disable rules | Rules scoped to Vereino paths; per-line disables need a reason comment; repeated disables become a rule change in this spec | medium |
| Integration runner does not work on GitHub-hosted runners | `integration` cannot be required; regressions slip through | The E1 exit gate requires `integration` as a required check; E1 stays open until it runs on GitHub-hosted runners | medium until E1 exit |
| Platform upgrades overwrite local patches (headers, i18n `--strict`, ESLint) | Security headers or strict checks silently disappear | Local-patch list re-checked by every upgrade run; ENG-TEST-11 smoke after each production deploy | low |
| RLS interacts badly with platform internals | Either false confidence or broken platform jobs | ADR-008 spike before adoption; two-tenant tests regardless | low |
| `CLASSIC` DI resolution breaks after minification in production only | Production outage on first deploy | Integration suite against a production build (ENG-TEST-07); staging soak before production | low |
| Railway or Resend store logs and metadata in the US; no contractual EU residency | GDPR transfer exposure | No personal data in logs (S15.1); SCC/DPF documented in the processor register; region choices in ADR-011/012 | medium (accepted, documented) |
| PITR not available for the image that provides required PostgreSQL extensions | Weaker RPO | E3 lists extensions; E4 picks a PITR-capable image or accepts 24-hour RPO from off-site dumps with product-owner sign-off | medium until E4 |
| Unverified legal claims (age 16, retention, DPIA list) drive the design | Non-compliant consent or retention logic | ENG-Q-06 verification before pilot; settings rather than constants where the law may differ | medium until E5 |
| Two-person team cannot sustain alerts, drills and updates | Drills skipped, alerts ignored | Symptom-only alerts, weekly digest, quarterly drill blocks the next release if overdue, Renovate grouping | medium |
| Supply-chain compromise through a new or updated package | Malicious code in builds | 5-day age gate, pinned actions, dependency review, audit, licence check, review of lock-file diffs for new packages | low |
| This spec bundles several capabilities (tooling, release hygiene, platform spike, operations, compliance) | Hard to approve or finish as one unit | Phases deliver independently; ENG-Q-08 asks for the split decision before `Ready for implementation` | medium until ENG-Q-08 |
| Security fix for a platform-coupled package needed between upgrades | Vulnerable production while waiting for a full upgrade | P6 security exception with run log and full gate | low |
| Restore point earlier than the last payments or e-mails | Paid charges shown unpaid, duplicate or missing notifications | S15.7 reconciliation from Stripe and the e-mail provider; rehearsed in the drill (EJ-07) | low |
| Over-standardisation for a small team | Process slows feature work | Rules limited to what a tool or reviewer can check; standards revised through Changelog rows when they cost more than they save | low |

## Acceptance Criteria

- [ ] **ENG-AC-01** — `yarn verify` is the only gate command named in `AGENTS.md`, `.ai/agentic.config.json`, CI and the club spec; it exits non-zero at the expected step for each seeded violation and 0 on a clean tree (ENG-TEST-01).
- [ ] **ENG-AC-02** — No one, administrators included, can merge to `main` without green `gate`, `integration`, `pr-title` and DCO checks (ENG-TEST-02).
- [ ] **ENG-AC-03** — All Vereino-owned code passes the strict lint and Prettier checks, and the E1 diff changes no platform-owned file except the recorded local patches.
- [ ] **ENG-AC-04** — A runtime import across Vereino modules, a platform import inside `lib/`, a duplicate error code and a missing catalog key each fail the gate (ENG-TEST-03, ENG-TEST-04).
- [ ] **ENG-AC-05** — The integration runner works in CI and on a clean local clone, and a new contributor reaches a running app in at most 30 minutes (ENG-TEST-05, ENG-TEST-19).
- [ ] **ENG-AC-06** — The club spec contains or explicitly rejects every hand-over item of phase E5 (ENG-TEST-15).
- [ ] **ENG-AC-07** — Every E3 spike item has a recorded result and decision, ADR-008 states the RLS decision with evidence, and the ADR-001 checkpoint row exists (ENG-TEST-06, ENG-TEST-07).
- [ ] **ENG-AC-08** — Production deploys run migrations in the pre-deploy step and never run `yarn initialize`; an empty database URL fails the deploy (ENG-TEST-13).
- [ ] **ENG-AC-09** — A PITR restore and an off-site dump restore both succeed, with RTO ≤ 60 minutes recorded; a database or Redis outage on staging alerts both maintainers within 5 minutes (ENG-TEST-08 … ENG-TEST-10).
- [ ] **ENG-AC-10** — Staging and production send the decided security headers, and the app refuses to start without a required variable (ENG-TEST-11, ENG-TEST-12).
- [ ] **ENG-AC-11** — The compliance pack is approved and dated by the product owner before the first real person is entered (ENG-TEST-14).
- [ ] **ENG-AC-12** — Renovate opens grouped pull requests that exclude P1/P2 packages, the licence check fails on a disallowed licence, and release-please produces a tag with a changelog entry (ENG-TEST-18, ENG-TEST-21).
- [ ] **ENG-AC-13** — Private vulnerability reporting, secret scanning with push protection and Dependabot alerts are enabled, and the S17.1 documents are present (ENG-TEST-20).
- [ ] **ENG-AC-14** — Accessibility and performance reports are produced in CI with recorded baselines (ENG-TEST-16, ENG-TEST-17).
- [ ] Every listed backend surface matches its recorded Open Mercato reference and uses the canonical shell/components, shared API helpers, semantic tokens, and complete loading, empty, error, conflict, keyboard, accessibility, responsive, light-mode, and dark-mode states. — N/A: this spec lists no backend surface.
- [ ] Every affected API and UI path has self-contained integration coverage and the configured validation gate passes. — For this spec: the tooling, repository and operations paths are covered by ENG-TEST-01 … ENG-TEST-22.

## Final Compliance Report

| Check | Status | Evidence / resolution |
|---|---|---|
| Applicable `AGENTS.md` files and routed guides/skills reviewed | pass | `AGENTS.md`, `CLAUDE.md`, `.ai/guides/spec-delivery.md`, `.ai/specs/SPEC-000-template.md`, skill `om-spec-writing` (+ `references/rules.md`); installed package `AGENTS.md` files and guides through research A |
| Data models, APIs, events, UI, and tests are internally consistent | pass | *Requirement Traceability*: ENG-01 … ENG-14 each map to a phase, tests and an acceptance criterion; ids P1 … P6, ADR-001 … 023, S1 … S19, EJ-01 … 08, ENG-TEST-01 … 22, ENG-AC-01 … 14, ENG-Q-01 … 10 defined once; reviewed by a fresh-context subagent and fact-checked against research and repository (run log) |
| Every workflow completes end to end without a catch-all integration phase | pass | EJ-01 … EJ-08; phases E1 … E5 each with their own exit gate |
| Platform-native reuse and extension points were chosen before custom code | pass | *Reuse and Ownership Map*; app-owned items are tooling, configuration and documents only |
| UI contracts identify references, canonical components, and theme/state coverage | pass | N/A — no surface; S7 restates the platform rules for the club spec's surfaces |
| Every phase has dependencies, bounded slices, tests, value, and an observable exit gate | pass | *Implementation Phases* E1 … E5 |
| Blocking open questions resolved | fail | ENG-Q-01, ENG-Q-02, ENG-Q-08 block E1; ENG-Q-03, ENG-Q-04, ENG-Q-05, ENG-Q-10 block E4; ENG-Q-06, ENG-Q-07 block E5 |
| User approval for implementation | fail | none — status remains `Draft` |

Verdict: `Blocked — ENG-Q-01, ENG-Q-02 and ENG-Q-08 (needed for E1) and the product owner's approval of this specification`

## Open Questions

The `om-spec-writing` gate was not run as an interactive stop: the product owner asked for the full specification in one run (run log, 2026-10-21). The questions below are therefore open, each with the default this spec assumes.

| ID | Question | Owner | Blocking? | Resolution / decision date |
|---|---|---|---|---|
| ENG-Q-01 | Approve the new development tools and GitHub apps: `prettier`, `prettier-plugin-tailwindcss`, `typescript-eslint`, `eslint-plugin-jsx-a11y`, `eslint-plugin-boundaries`, `@axe-core/playwright`; GitHub apps Renovate and DCO; actions release-please, semantic pull-request title, Lighthouse CI, dependency review; CodeQL default setup | Product owner | yes (E1) | pending — default: approve all, development-time only |
| ENG-Q-02 | `wladku/Vereino` is a personal-account repository. Who configures the ruleset, apps and security settings, and should the repository move to a GitHub organization before outside contributors arrive? | Product owner | yes (E1) | pending — default: product owner configures; move to an organization later |
| ENG-Q-03 | Hosting for the pilot (club research D-012): who runs the Railway project, on which plan (PITR availability), and who pays? Who signs the processing agreement with the club? | Product owner / club board | yes (E4) | pending |
| ENG-Q-04 | Off-site backup storage: which EU provider (different from Railway) and who holds the dump encryption key? | Product owner | yes (E4) | pending — default: S3-compatible EU bucket at a second provider; key in both maintainers' password managers |
| ENG-Q-05 | Monitoring vendors: uptime monitor, alert channel and telemetry backend (none, an EU-hosted error tracker, or an OTLP service)? Each one is a processor if it can see personal data. | Product owner | yes (E4) | pending — default: external uptime monitor plus Railway log-based alerts; no trace backend in 1.0 |
| ENG-Q-06 | Who verifies the legal claims of research C Appendix B (consent age 16, DPIA list, accounting retention, cookie law article numbers, P24 restricted MCC) — a lawyer, the club's accountant, or the maintainers from primary texts? | Product owner | yes (E5, pilot) | pending |
| ENG-Q-07 | Retention of former participants' non-accounting data: anonymise after 12 months without membership (this spec) or "no automatic deletion, anonymisation on request" (club spec Q-019 default)? | Product owner | yes (E5) | pending — default: 12 months as a club setting |
| ENG-Q-08 | Scope cohesion (`om-spec-writing` rule; the fresh-context review recommends a split): keep one standards spec with five phases, or split into (a) standards and tooling (E1, E2), (b) platform spike (E3), (c) operations (E4), (d) compliance (E5)? | Product owner | yes (before `Ready for implementation`) | pending — default: keep one spec, because the standards are one reference document and the phases already deliver independently |
| ENG-Q-09 | Multi-factor authentication for administrator and treasurer: the platform's MFA is in the commercial enterprise `security` module (ADR-023). Buy a licence, accept no MFA in 1.0, or use a second factor from core `auth` if E3 finds one? | Product owner | no | default: no MFA in 1.0 unless core `auth` offers one; strong passwords and sign-in rate limits; revisit before multi-club hosting |
| ENG-Q-10 | `@open-mercato/enterprise` is a production dependency of the scaffold but commercially licensed. Remove it from `packages/app/package.json` (local patch, if E3 shows no installed import needs it) or keep it installed but disabled after confirming with Open Mercato sp. z o.o. that this is allowed? | Product owner | yes (E4, before production) | pending — default: remove if E3 shows it is unused; otherwise ask the vendor in writing |

Related open items outside this spec: decisions D1 … D5 from `.ai/runs/2026-10-20-spec-consistency-fixes.md` still await the product owner's confirmation in the club spec.

## Changelog

| Date | Change |
|---|---|
| 2026-10-21 | Initial draft from research A, B and C: stack baseline and pin policy P1 … P5; ADR-001 … ADR-022 (ADR-001 records the product owner's decision to keep Open Mercato with exit criteria); standards S1 … S19 with the gap closure map (24/24); journeys EJ-01 … EJ-08; tests ENG-TEST-01 … ENG-TEST-21; phases E1 … E4; ENG-AC-01 … ENG-AC-14; open questions ENG-Q-01 … ENG-Q-09 |
| 2026-10-21 | Review fixes (fresh-context architectural review and fact check, see run log): the hand-over's E1 split into E1 *Gate and CI* and E2 *Repository hygiene and release*, later phases renumbered E3 … E5; club spec amendment A (gate lines, paged lists, error codes) moved to E1; P6 security exception; S1.8 break-glass; local-patch table under S3.1; error factory moved to `api/errors.ts`; token pages never cached; S8.6 rate-limit defaults and the `AGENTS.md` exception path for the system-scope lookup; production restore cut-over and reconciliation (S15.7, EJ-07); ADR-023 enterprise modules disabled (commercial licence) with ENG-Q-10; MFA question rewritten; reserved platform error codes and 503; `OM_OPTIMISTIC_LOCK` never off; `/api/healthz` behaviour stated from source; TBT as the lab stand-in for INP; explicit Vereino module list; corrected ts-jest version, retention wording, shell-script and Dockerfile facts; reasons recorded where research B advice is not followed (exact optional types, import order, outbox, idempotency keys, session cookies, Awilix strict, OpenAPI diff); ENG-TEST-22; ENG-Q-05 and ENG-Q-08 made blocking |
