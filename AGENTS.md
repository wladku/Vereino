# vereino — Agent Rules (monorepo; Open Mercato app in `packages/app`)

Route first; never probe unmatched context.

## Stack and Monorepo (MUST)

- **Stack:** Open Mercato on the latest Next.js (App Router) + React + TypeScript (strict); PostgreSQL through MikroORM (entities, migrations, connection pool); Awilix for dependency injection (services registered in a module's `di.ts` and resolved from the container); Tailwind CSS for member and public (frontend) pages; shadcn/ui through `@open-mercato/ui` primitives for admin (backend) pages. Never add a parallel framework: no other ORM, query builder, DI container, CSS framework or component library.
- **Workspaces:** Yarn 4 workspaces under `packages/`, each with its own `node_modules` (`nmHoistingLimits: workspaces`).

| Package | Name | Holds | May import |
|---|---|---|---|
| `packages/app` | `@vereino/app` | the Open Mercato application: Next.js app, Vereino modules in `src/modules/<id>/` (entities, migrations, commands, API routes, pages, events, i18n, DI), configuration, dev/runtime scripts, `.ai/qa` integration tests | `@vereino/core`, `@vereino/db`, `@vereino/ui`, `@open-mercato/*` |
| `packages/core` | `@vereino/core` | reusable domain logic: pure functions, types, validation schemas (e.g. discount rules, money, date ranges) | nothing app-, React-, Next.js- or database-specific |
| `packages/db` | `@vereino/db` | MikroORM/PostgreSQL tooling: shared persistence helpers, migration and seed utilities, test-database helpers | `@vereino/core`, MikroORM |
| `packages/ui` | `@vereino/ui` | reusable React components: admin components on shadcn/ui (`@open-mercato/ui`), member/public components styled with Tailwind | `@vereino/core`, React, `@open-mercato/ui` |

- Dependency direction is `app → ui | db → core`; no cycles, and no package imports `@vereino/app`.
- Module entities, migrations, routes and pages stay in `packages/app/src/modules/<id>/` — Open Mercato discovers them only there. Move code into `core`, `db` or `ui` only when at least two modules reuse it or it is framework-free; module-specific code stays in its module.
- Each package exposes its public API from `src/index.ts`; never deep-import another package's internals. New packages are wired into `transpilePackages` in `packages/app/next.config.ts`; UI packages also need an `@source` line in `packages/app/src/app/globals.css`.
- Add a dependency to the workspace that uses it (`yarn workspace @vereino/<name> add …`), never to the root `package.json` (root holds only workspaces, `resolutions` and delegating scripts).
- Paths in this file and in `.ai/guides` that start with `src/`, `scripts/`, `public/`, `.mercato/` or name app config files (`next.config.ts`, `tsconfig.json`, `jest.config.cjs`, `.env`) are relative to `packages/app/`. Run app commands from the root (`yarn dev`, `yarn generate`, `yarn typecheck`, `yarn mercato …` delegate to `@vereino/app`) or with `yarn workspace @vereino/app <script>`.

## Always

- Route all axes; missing context: `yarn mercato agentic:init --update-harness`.
- Lessons: scan `.ai/lessons.md` tags; open/update one matching record + row.
- Follow **Project memory (`.ai/`)** below for every spec, autonomous run and lesson — it is mandatory, not optional documentation.
- App code: `packages/app/src/modules/<id>/`; framework context only for named gaps.
- Derive trusted `tenantId` + `organizationId` and fail closed. Only an installed contract may use system scope (`organizationId: null`).
- Use commands/`makeCrudRoute`/`CrudForm`/`DataTable`, DI/events/UMES; effects stay post-commit.
- Put entities in `packages/app/src/modules/<id>/data/entities.ts`; API routes need per-method `metadata` + `openApi`.
- Editable records expose `updated_at`/`updatedAt`; custom update/delete clients send the version and surface 409s.
- Run `yarn db:generate`, review scoped SQL/snapshot, and ask before applying it.
- Run `yarn generate` after discovery files/`src/modules.ts`/routes/pages/events/widgets/agents/tools/workflows change.
- Contract-surface changes (route/schema/ID/export/seam/signature/event payload/CLI/config/script) MUST read root `BACKWARD_COMPATIBILITY.md` (Vereino-owned surfaces, protection tier, breaking-change checklist) and `.ai/guides/upstream/BACKWARD_COMPATIBILITY.md` (Open Mercato surfaces; it wins for `@open-mercato/*`); tenant/org scope alone is not a contract.
- Localize strings; use shared UI/tokens and cover loading/empty/error/conflict/keyboard/a11y.
- Repository language is English: docs, specs, research, code, comments and commit messages. UI text lives only in i18n catalogs; every Vereino module ships `i18n/en.json` and `i18n/pl.json`, and a new language is added by adding catalog files.
- Git: work on a branch `<type>/<kebab-slug>` (`feat`, `fix`, `docs`, `chore`, `refactor`, `test`, `ci`, `build`, `perf`), never commit to `main`; `main` changes only through a pull request that is squash-merged after the required checks pass. After each completed task (spec section, module phase, fix, docs) stage only the files you changed and commit with a signed-off Conventional Commits message (`git commit -s`; `type(scope): subject`, scopes per the engineering standards S1.3); one task = one pull request, never commit half-done code or a failing typecheck. Push to `origin` only when the user asks. Never commit `.env*`, `node_modules/`, `.mercato/`.
- Engineering standards: `.ai/specs/2026-10-21-engineering-standards-and-patterns.md` (S1–S19) is the engineering reference. Register every new Vereino module id in `packages/app/vereino-modules.json`; declare business error codes in the module's `lib/error-codes.ts` and throw them from `api/errors.ts` (S6.7); list responses use `{ items, total, page, pageSize, totalPages }` (S6.4).
- Unit-test coverage (MUST, no exceptions): every new or changed function in Vereino pure logic (`packages/app/src/modules/<id>/lib/**`), in the shared packages (`packages/core|db|ui/src/**`) and in Vereino tooling scripts (`scripts/verify.mjs`, `eslint.vereino.mjs`, `packages/app/scripts/vereino-*.mjs`, `packages/app/scripts/check-vereino-contracts.mjs`) ships with unit tests that keep line, branch and function coverage at 100 %. `yarn test` and `yarn test:scripts` enforce the threshold and fail below it; never lower a threshold, exclude a file or add a coverage-ignore comment to pass (the only allowed ignore is the CLI entry-point guard). Routes, commands, subscribers and pages are covered by integration tests (`yarn test:integration:vereino`), not by mocked unit tests (S13.1).
- Browser checks: to exercise a running app as an agent, start it with `yarn test:integration:vereino:start` (Testcontainers PostgreSQL) and drive it with agent-browser — `node packages/app/.ai/qa/agent-browser/login-smoke.mjs` is the reference scenario and the CI job `browser-smoke` runs it on every pull request.

## Ask First

- Ask before scope/architecture/public contracts/dependencies/ejection/canonical primitives; migrations/resets/DB targets; live credentials/providers; or weakening security/concurrency/retries/idempotency/audit/undo.
- Ask before `git push`, force-push, rebase of shared branches, or any commit that touches migrations.

## Never

- Never leak tenants, trust payload scope, or treat missing scope as unrestricted.
- Never edit `node_modules`/`.mercato/generated/**`/generated facts/shipped migrations.
- Never use cross-module ORM relations; use IDs/snapshots/events/enrichers/extensions/optional DI.
- Never use raw admin `fetch`/`<form>`, ad hoc crypto/cache/queues, role-name guards, or direct mutations when helpers exist.
- Never hard-code user strings/status colors; expose secrets/transcripts; or guess answerable contracts.

## Project memory (`.ai/`)

| Path | Holds | Name |
|---|---|---|
| `.ai/specs/` | active specs for spec-driven development (`Draft`, `Ready for implementation`, `In progress`); `research/` = read-only discovery inputs | `YYYY-MM-DD-slug.md` |
| `.ai/specs/implemented/` | specs whose every phase landed and acceptance criteria are met (`Status: Implemented`) | same file name, moved with `git mv` |
| `.ai/specs/archive/` | superseded or abandoned specs (`Status: Archived`, reason + successor link in the Changelog) | same file name, moved with `git mv` |
| `.ai/runs/` | one log per autonomous AI run | `YYYY-MM-DD-slug.md` (`-2`, `-3` … for a second run with the same slug that day) |
| `.ai/lessons.md` + `.ai/lessons/` | durable findings, conclusions and improvements for future agents (catalog + one record per lesson) | record `kebab-case-slug.md` from `.ai/lessons/_template.md` |

Rules (MUST):

- **Specs:** create new specs only as `.ai/specs/YYYY-MM-DD-slug.md` (date = creation day, slug = kebab-case English). Never delete a spec. When a spec is fully implemented, set `Status: Implemented`, add a Changelog row and move it to `implemented/`; when it is superseded or dropped, set `Status: Archived`, link the successor and move it to `archive/`. Fix every link to a moved spec in the same commit. Before writing a new spec, search `specs/`, `implemented/` and `archive/` for a covering one and update it instead of duplicating.
- **Runs:** an autonomous run is any multi-step AI work done without the user steering each step (auto-implement, scheduled or background agents, workflows, side sessions, overnight tasks). Create `.ai/runs/YYYY-MM-DD-slug.md` when the run starts and complete it before the run ends, with: goal and trigger, spec/issue/branch, steps taken, decisions and their reasons, files changed, commands and test results (failures verbatim), open problems, next steps. Commit the log together with the run's work; a run that changed nothing still commits its log.
- **Lessons:** after fixing a bug, after a user correction, after a failed approach, or when a fact is worth keeping long-term, update the matching record or add one: copy `.ai/lessons/_template.md` to `.ai/lessons/<slug>.md`, fill Context / Problem / Rule / Applies to, add exactly one catalog row to `.ai/lessons.md`, run `node scripts/check-lessons.mjs`. Hard boundaries go to this file instead; lessons hold evidence and the durable rule. The same mistake corrected twice is no longer a lesson: promote it to a rule here.
- **Before finishing any task:** spec status and folder are correct, the run log (if autonomous) is complete, new lessons are recorded, and these files are in the same commit.

## Plan, Verify, Learn

- **Plan first:** a task touching several files or areas starts with a plan (plan mode or a written plan the user approves) — the spec's phases when a spec covers it. Invest in the plan so implementation runs in one pass; when work drifts or a fix grows, stop and re-plan instead of patching. Large plans get a critical review (a subagent acting as a staff engineer) before code.
- **Verify before "done":** prove each change with the narrowest real check — the relevant commands from **Validation**, and for UI the browser (both locales, 375 px, console without errors). Report the evidence (command and result); never claim an unverified change works. Failing tests or CI: read the logs and fix the cause yourself.
- **Raise the bar:** before committing, review your own diff as a reviewer would; if a fix works but is a hack, redo it cleanly with what you now know.
- **Subagents and parallel work:** delegate broad search, translation, review and independent pieces to subagents (or parallel sessions in separate git worktrees) to keep the main context clean. Give each one disjoint files; subagents never stage, commit or push — the coordinator integrates, verifies and commits.
- **Automate repetition:** work done more than twice becomes a committed project skill (`.ai/skills/<id>/SKILL.md`) or a script in `scripts/`.

## Validation

Gate: `yarn verify` — the only gate command, identical locally and in CI; every step blocks; `yarn verify --list` shows the steps, `yarn verify --from <step>` resumes after a fix. Integration: `yarn test:integration:vereino` (Testcontainers PostgreSQL 17, production build, Playwright; focused: `--filter <TEST-ID>`). Do not use the platform runner `yarn test:integration:ephemeral`: it waits for the `customers` module, which this app does not enable. Formatting: `yarn format`. Never migrate to validate.

## Three-Axis Context Assembler

Routes are additive: ownership says WHO; other axes say WHAT. Select every match.

`debugging` is additive. A scalar-ID/snapshot fix to persisted records or commands linked to an installed record MUST use `module-data` + `umes` and load `om-data-model-design` + `om-system-extension`.

`debugging` = reported bug/security/drift, not designed failure UI. Custom fields/entities = `umes` + `module-data` + `om-data-model-design`; editable round trips add `backend-ui`, requested coverage adds `testing`. Never infer work from specs/PRs.

Unified-override audits = `umes` only; add `architecture`/`framework-context` only for unresolved ownership or installed keys. Durable process/activity/user task = `module-data` + `ai-workflow`. Multi-stage waits/cancel/restart are durable; reminders and renewal/batch schedules are `module-data`.

`backend-ui`: replacing/wrapping, prop-transforming, menu-editing, or adding visible feedback adds `backend-ui`; merely hiding/toggling/rewiring installed UI does not.
Staff UI preview/report/bulk = `backend-ui`.
Existing installed form/table fields, filters, row/bulk actions without app persistence = `umes` + `backend-ui` only: read `crud-surfaces` + `quality-states`; do not load contracts, module-scaffold, or page/navigation.

`backend-ui`: UI skill `references/quality-states.md`; public/portal/responsive/a11y adds `frontend-and-design-system.md`.

### Axis 1 — Area/Ownership

| Route | Match | Context |
|---|---|---|
| `architecture` | Capability/ownership/field-vs-history choice, boundary, upgrade, override, or registry failure; routine discovery stays in its area | `.ai/guides/architecture.md` + named facts |
| `module-data` | App-owned domain/data/API | `packages/app/src/modules/<id>/` + `.ai/guides/contracts.md`; add architecture only when ownership is unresolved |
| `umes` | Extend/replace installed behavior | `.ai/guides/extensions.md` + named facts |
| `backend-ui` | Authored/restyled rendered surface or browser UI state/session bootstrap | `.ai/guides/backend-ui.md` + host facts; host-provided integration credentials/health UI alone does not match |
| `integration` | Provider, spreadsheet/CSV/file I/O, sync/webhook/storage | `.ai/guides/integrations.md`; imports = `integration`; AI consuming files = `ai-workflow`, NEVER `integration` unless transport/storage changes |
| `ai-workflow` | Agent/tool/MCP/orchestrator/durable workflow | `.ai/guides/ai-workflows.md` + facts; schedules/queues/workers/retries/progress alone are `module-data` |
| `debugging` | Bug/security/drift/runtime inconsistency | `.ai/guides/testing-debugging.md` + affected areas |

API/command/record/status/event/UI changes/guards = `umes`; app persistence = `module-data`; installed guard without app persistence = `umes` only, so do not load contracts; read-only behavior/auth/dependents/customization = `framework-context` (alone: no extensions guide; report `installed-version`). Facts do not. Providers are published, never `packages/*`.

### Axis 2 — Work Units

Match every work-unit row; OPEN its skill before selection.

| Route | Work unit | Skill/context |
|---|---|---|
| `architecture` | Explain/choose module, UMES, package, eject | architecture; `om-help` for an unresolved or comparative choice across these mechanisms |
| `module-data` | Business slice or multi-seam domain/API/command fix | MUST load `om-module-scaffold` + its exact `.ai/skills/om-module-scaffold/references/business-one-shot-blueprints.md` key, which resolves units inside the slice, not ownership — an ownership/capability outline adds `architecture` |
| `spec-pr` | Spec/plan | Axis 3; phases+integration coverage (`integration-coverage`); no domain routes |
| `architecture` | Upgrade audit or disable built-in | troubleshooter + framework context, or trim skill + exact `src/modules.ts`/`package.json` |
| `architecture` + `integration` + `framework-context` | Provider superseded by installed capability | integration builder + exact framework context |
| `module-data` | Entity/link/validator/migration/encryption/lock/transaction | `om-data-model-design` + contracts |
| `module-data` | CRUD/API/command/OpenAPI/ACL/setup/mutation | `om-module-scaffold` + contracts |
| `backend-ui` | Form/table/page/renderer/middleware/nav/i18n/UI states | `om-backend-ui-design` + backend UI |
| `module-data` | Search/analytics/event/notification/message/worker/progress/cache/CLI | scaffold + contracts |
| `umes` | Fields/extension entities/links/enrichers/injection/interceptors/guards/subscribers/DOM/widgets/toggles/overrides | `om-system-extension` + extensions; choices load `mechanism-selector` + `extension-branches` |
| `integration` | Provider/credentials/health/webhook/files/client/reconciliation/package | `om-integration-builder` + integrations |
| `ai-workflow` | Agent/tool/MCP/OpenCode/Code Mode/orchestrator/AI file or content drafting/attachment/override | `om-create-ai-agent` + AI/workflows; MCP/OpenCode loads `surface-selector` + `ai_assistant` facts |
| `ai-workflow` | Workflow/activity/user task/idempotency/output/progress | `om-build-workflow` + AI/workflows |
| `testing` | REQUEST says test/coverage/prove, or verify by exercising API/browser/screen sizes/keyboard/screen-reader—not a fix's implicit regression duty or review/audit/config check | MUST read `.ai/guides/testing-debugging.md` + external `om-integration-tests` for integration/E2E/app tests |
| `debugging` | Reproduce/root-cause/minimal fix/regression oracle | `om-troubleshooter` + testing/debugging |
| `framework-context` | Exact installed contract still unknown | `.ai/guides/framework-contracts.md`, then bounded `om-framework-context`, last |
| `debugging` + `testing` | Add/fix recurring harness case/test | `om-evolve-harness` |

`framework-context`: resolve one named fact first. Use bounded source only if the guide leaves current behavior, authorization, dependents, or safest customization seam unresolved; never for “installed contracts” alone.

### Axis 3 — SDLC and Delivery

Spec gate before code: new capability/architecture/schema/API contract/cross-module/multi-phase -> spec first (`spec-first`); covering `.ai/specs` match -> reuse and update it (`reuse-spec`); bug fix/minor fix/docs/dependency/isolated refactor -> proceed (`direct`); only the request's explicit words waive a feature spec; workflow-changing ambiguity -> ask once (`ask`). Then `om-module-scaffold` starts at `src/modules/example/README.md`.

Read `.agents/skills/<id>/SKILL.md` AND any `.ai/skills/<id>/SKILL.md` override. Missing skill: `yarn install-skills`. Commit+ready PR MUST add `spec-pr`, read `.ai/skills/om-auto-create-pr/SKILL.md`, and keep task routes (`delivery-route-preserves-task-routes`).

| Route ID | Delivery need | Skill |
|---|---|---|
| `spec-pr` | Write/revise spec | MUST invoke `om-spec-writing` (OMH-005) + `.ai/guides/spec-delivery.md` |
| `spec-pr` | Local phases / whole-spec / PR / issue / review | `om-implement-spec` (OMH-006) / `om-auto-implement-spec` / `om-auto-create-pr` / `om-auto-fix-issue` / `om-auto-review-pr` |
| — | No PR/spec workflow | Do not load delivery skills |

<!-- discovery:routing-start -->
Product discovery, brief or backlog: read `.ai/specs/product-brief.md`, `.ai/specs/research/`, `.ai/specs/backlog.md`, and the Definition of Ready and protected product decisions in `SDLC.md`; brief decisions are a protected contract, synthetic personas are hypotheses.
<!-- discovery:routing-end -->

### Token-Efficient Assembly Policy

- Load matched guides once, then only needed references/facts.
- Hard budgets: guide > skill > references; open a reference only for its named subject.
- `spec-pr` reads template via spec-delivery.
- Inspect app call sites before bounded `framework-context`.
- Additive page/form/table/conflict UI skips it.
- Never bulk-read guide, skill, fact, or source trees.

## Module-Specific Facts

Mechanisms: events/subscribers→events; long operation/progress→progress; provider settings/health/OAuth→integrations; sync/import→data_sync. Hosts: session/auth→auth; customer/contact/deal/pipeline→customers; product/price/stock/inventory→catalog; currency/money→currencies; cart/checkout/shopper→checkout; portal→portal+customer_accounts; quote/order/invoice/sales assistant→sales; notification→notifications; webhook/callback→webhooks; schedule/reminder→scheduler; workflow/activity/user task→workflows; assistant→ai_assistant; maintained query index/reindex→query_index; search convergence→search. staff/employee≠optional staff; audit/record-who≠audit_logs unless extended. App primitives skip api_docs/search/query_index unless changed. Big fact-sheets: read in sections.

<!-- om:module-guides:start -->
Enabled module facts: `api_docs`,`attachments`,`audit_logs`,`auth`,`configs`,`dashboards`,`directory`,`entities`,`events`,`notifications`,`query_index`,`search`.

Load `.ai/guides/modules/<id>/index.md` only for a targeted installed module/host; never preload all module facts.
<!-- om:module-guides:end -->

## Working Sequence

1. Route, then implement the smallest complete slice through real call sites.
2. Discovery change: run `yarn generate`; then the smallest gate/integration paths.

Precedence: root→BC→installed `AGENTS.md`→facts; stop on skew/conflict; never guess.
