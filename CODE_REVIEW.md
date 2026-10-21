# Code Review — vereino

Repo-local review rules for the vereino monorepo (Yarn 4 workspaces; Open Mercato app in `packages/app`).
`om-code-review` (and therefore `om-auto-review-pr`) applies this file **in addition to** its built-in checklist.
`.ai/review-checklist.md` still applies to every diff under `packages/app/src/modules/**`, `src/modules.ts` or a
discovered page/API/widget/search/AI surface; this file does not repeat it and only adds what it does not cover.
Rule sources: `AGENTS.md`, `.ai/specs/2026-10-21-engineering-standards-and-patterns.md` (S1–S19), `scripts/verify.mjs`,
`.github/workflows/ci.yml`. When this file and those disagree, `AGENTS.md` and the standards spec win.

## Review priorities (in order)

1. **Correctness** — the change does what its spec/issue says; no data loss, no silent catch, no lost post-commit effect.
2. **Security and tenancy** — trusted `tenantId`/`organizationId` derived server-side, fail closed; feature-id authz
   (never role names); no secrets or personal data in code, logs, events, URLs or transcripts.
3. **Contracts** — routes, request/response fields, event ids/payloads, ACL feature ids, error codes, DB schema,
   `VEREINO_*` env names and root scripts are stable from first deploy (S6.9); changes are additive.
4. **Gate and tests** — `yarn verify` green, 100 % unit coverage where required, integration oracles present.
5. **Maintainability** — layering, boundaries, naming, design system, i18n.

## Repo-specific checks

### Monorepo and workspaces
- Dependency direction is `app → ui | db → core`; no cycles; nothing imports `@vereino/app`.
- Cross-package imports use the public entry `@vereino/<pkg>` (`src/index.ts`) only — no deep imports.
- A new package is wired into `transpilePackages` in `packages/app/next.config.ts`; a UI package also gets an
  `@source` line in `packages/app/src/app/globals.css`. Packages emit no build output.
- New dependencies go to the workspace that uses them (`yarn workspace @vereino/<name> add …`); root `package.json`
  holds only `workspaces`, `resolutions` and delegating scripts. Flag any new root dependency.
- `yarn.lock` changes match the manifest changes (CI runs `yarn install --immutable`).

### packages/core, packages/db, packages/ui
- `@vereino/core` is framework-free: no `@open-mercato/*`, `@mikro-orm/*`, `react`, `next`, no I/O built-ins
  (`FRAMEWORK_FREE_IMPORT_RESTRICTIONS` in `eslint.vereino.mjs`). Time is a parameter (`now: Date`), not the clock.
- `@vereino/db` may use only `@vereino/core` + MikroORM (peer deps); test-database helpers run only inside the
  ephemeral integration runner.
- `@vereino/ui` uses `@open-mercato/ui` primitives (admin) or Tailwind semantic tokens (member/public); peers pinned
  to the installed `@open-mercato/*` / React versions.
- Code moves into a shared package only when two or more modules reuse it or it is framework-free (club spec D4);
  module-specific code stays in its module.
- Exported functions declare return types and carry JSDoc (S3.3, S3.7).

### App modules (`packages/app/src/modules/<id>/`)
- A new Vereino module id is added to `packages/app/vereino-modules.json` in the same PR — otherwise strict lint,
  format, `i18n --strict`, coverage thresholds and `contracts:check` silently skip it. Scaffold modules
  (`example`, `example_customers_sync`, `ratelimit_probe`, `agent_examples`) are platform-owned, never listed.
- Vereino module shape (S4.1): `lib/` (pure), `lib/error-codes.ts` (plain `errorCodes` array), `api/errors.ts`
  (`CrudHttpError` factory), `__tests__/` next to code, `README.md` (entities, commands, events, DI tokens, codes).
- Layering (S4.2): route → `data/validators.ts` → command → `lib/`; pages go through the module API only;
  `lib/` never imports `data/`, `commands/`, `api/`, `subscribers/`, `workers/`, `backend/`, `frontend/`.
- Another Vereino module is imported only with `import type` (`eslint-plugin-boundaries`); never via `@/modules/*`.
- DI (S4.8): a service holding the request `em`/context is registered `.scoped()` in `di.ts`; singletons are
  stateless; no `new` outside `di.ts`. The container has no Awilix `strict`, so **review is the only check** here.
- Platform-owned files (anything in `packages/app` outside Vereino paths) change only in an upgrade or as a listed
  local patch (S3.1 table). An unlisted patch needs a Changelog row in the standards spec first.
- Never hand-edit `.mercato/generated/**`, `node_modules/**` or shipped migrations. `@open-mercato/enterprise`
  modules stay disabled in `src/modules.ts` unless explicitly approved (licensing lesson).

### API and validation
- Validation is Zod (`zod` pinned via root `resolutions`); untrusted input enters as `unknown` and is parsed; types
  come from `z.input`/`z.output`, not duplicated interfaces. No `any`.
- Routes live at `/api/<module_id>/<kebab-plural>` in `api/<resource>/route.ts`; actions are `POST` to a kebab verb
  sub-path; no state-changing `GET` (S6.1, S8.9).
- JSON keys/query params camelCase; enum values lower snake_case; ids UUID strings (S6.3).
- Lists (CRUD or custom) return `{ items, total, page, pageSize, totalPages }` (`createPagedListResponseSchema`),
  `pageSize` ≤ 100 (S6.4).
- Errors: `{ error, code? }`; codes declared in `lib/error-codes.ts`, thrown via `api/errors.ts`, listed in `openApi`;
  reserved platform codes never redeclared (`contracts:check` enforces). Status semantics per S6.7 (409 lock/state,
  422 business rule, 500 without internals).
- Money on the wire: integer minor units + `currency`, fields end in `Amount`; instants ISO 8601 UTC with ms and `Z`;
  dates `YYYY-MM-DD` (S6.5, S6.6).
- Public/sessionless routes follow S8.6 (rate limits, uniform `202`, honeypot, `no-store`); webhooks verify signature
  on the raw body and de-duplicate by provider event id (S8.8).
- OpenAPI contract diff is not automated yet — **Gap:** reviewers diff `openApi` exports manually until the
  `oasdiff` step lands in `scripts/verify.mjs` (S6.9).

### DB and migrations
- Generated by `yarn db:generate`; PR shows the SQL; reviewed for scope (only intended tables/snapshot changes).
  Migration commits require explicit approval (AGENTS.md Ask First; CODEOWNERS `**/migrations/`).
- A migration merged to `main` is immutable. Breaking changes use expand/contract across two releases; DDL on
  existing tables sets `lock_timeout = '5s'`; `CREATE INDEX CONCURRENTLY` in its own idempotent non-transactional
  migration; additive migrations implement `down()`; dropping a column/table needs a product-owner decision (S5.4).
- Tables `<module>_<plural>`, UUID PK `gen_random_uuid()`, `timestamptz`, unique constraints and indexes lead with
  scope columns and include `organization_id` (S5.1, S5.3). FKs only within a module.
- Raw SQL only in `data/queries.ts` with explicit `organization_id` and a two-tenant integration test (S5.8).
- No external call (Stripe, Resend, …) inside a transaction; must-happen effects are recorded as state (S5.7).

### UI, design system, i18n
- `ds:check` (`packages/app/scripts/ds-check.mjs`) rules hold for admin and member/public pages: no palette classes,
  arbitrary Tailwind values, `dark:` overrides or inline styles.
- Every Vereino module ships `i18n/en.json` and `i18n/pl.json` with identical keys; `i18n:check-hardcoded --strict`
  exceptions only via `i18n/.hardcoded-allowlist.json` entries with a reason.
- Server Components by default; `'use client'` at the leaf; nothing secret in `NEXT_PUBLIC_*` (S7.3).
- `jsx-a11y` recommended + re-enabled React rules (`VEREINO_REACT_RULES`) apply to Vereino `.tsx`; WCAG 2.2 AA (S7.4).
- UI PRs attach evidence: both locales, 375 px, light and dark, loading/empty/error/conflict, clean console (S7.8).

### Tests
- 100 % line/branch/function coverage (MUST) for `src/modules/<vereino-id>/lib/**` (Jest thresholds in
  `packages/app/jest.config.cjs`), `packages/{core,db,ui}/src/**` (`node --test` thresholds) and tooling
  (`scripts/verify.mjs`, `eslint.vereino.mjs`, `packages/app/scripts/vereino-*.mjs`,
  `check-vereino-contracts.mjs` via `yarn test:scripts`). Any lowered threshold, excluded file or coverage-ignore
  comment (other than the CLI entry-point guard) is a blocker; `coverage-scope.test.mjs` guards must stay.
- Routes, commands, subscribers, workers, pages: integration tests in
  `packages/app/.ai/qa/tests/<module>/<TEST-ID>-<slug>.spec.ts`, not mocked unit tests; titles start with the test id.
- Integration tests are self-contained (create own tenant/org via `_fixtures/tenant.ts`, clean up in `finally`), no
  seed data, bounded polling instead of `sleep`, explicit instants. Per-route oracles per S13.4 (second tenant/org
  denied, 403, stale version 409, missing version 400, malformed 400/422, idempotent retry). New pages run axe
  (`_fixtures/axe.ts`).
- Failing tests are never deleted or weakened to pass; a test that passed only on retry is flagged (S13.7).

### CI, scripts, tooling
- A new gate check is added as a step in `scripts/verify.mjs` `STEPS` and nowhere else (S2.3); CI `gate` only runs
  `yarn verify`. Gate scripts are Node.js (Windows/WSL/macOS/Linux); no output piped through `grep`/`tail`.
- `.github/workflows/ci.yml`: jobs `gate`, `integration`, `browser-smoke`, `perf` (advisory, `continue-on-error`),
  `pr-title`, `dependency-review`. Top-level `permissions: contents: read`; third-party actions pinned by full SHA with
  the tag in a comment; `pull_request`, never `pull_request_target`; job timeouts kept; downloaded binaries
  checksum-verified (agent-browser `AGENT_BROWSER_SHA256`).
- Lint config changes go through `eslint.vereino.mjs` (shared, imports nothing) and the per-workspace
  `eslint.config.mjs`; never relax a Vereino rule to make code pass. Prettier (`.prettierrc.json`: no semi,
  single quotes, trailing commas, width 120) runs only on Vereino-owned files via `scripts/vereino-format.mjs`.
- PR title is Conventional Commits `type(scope): subject` with scopes from S1.3; commits signed off (DCO).
- No `console.*` in Vereino module runtime code; logging via `createLogger` without personal data (S15.1).

### Dependencies
- New dependency needs owner approval (Ask First) and S16.1 evidence: unmet need, active project, allowlisted
  licence, no install script, bundle note for client code. No parallel ORM, DI, CSS or component library.
- `@open-mercato/*` versions move together in a platform upgrade; new `resolutions` entries need a reason.
- `dependency-review` fails on high severity. **Gap:** `yarn licenses:check`, `.github/workflows/security.yml` and
  `renovate.json` are planned (S14.1, S16.2, S16.4) but not in the repo yet.

### `.ai/` project memory
- Specs: new ones only as `.ai/specs/YYYY-MM-DD-slug.md`; never deleted; on completion `Status: Implemented` and
  `git mv` to `implemented/`, superseded → `archive/` with successor link; all links fixed in the same commit.
  Implementing PRs update the spec's Implementation Status, acceptance checkboxes and Changelog.
- Autonomous runs commit a complete `.ai/runs/YYYY-MM-DD-slug.md` (goal, steps, decisions, files, commands and
  verbatim failures, open problems) with the work. Agent PRs name agent + model and link the run log (S19.3).
- Lessons: `.ai/lessons/<slug>.md` from `_template.md` plus exactly one row in `.ai/lessons.md`; `lessons:check`
  is part of the gate. A mistake corrected twice belongs in `AGENTS.md`, not a lesson.
- Repository language is English (except `pl.json` and Polish legal texts). No `TODO` without an issue link.

## Validation gate

- **`yarn verify`** is the single gate, identical locally and in CI (`gate` job). `yarn verify --list` prints the
  13 steps: generate, typecheck, typecheck:packages, typecheck:qa, lint, format:check, ds:check,
  i18n:check-hardcoded --strict, contracts:check, lessons:check, test, test:scripts, build.
  `yarn verify --from <step>` resumes after a fix.
- Integration: **`yarn test:integration:vereino`** (Testcontainers PostgreSQL 17, production build, Playwright;
  focused `--filter <TEST-ID>`). Never `yarn test:integration:ephemeral` — it waits for the `customers` module,
  which this app does not enable.
- **Never migrate to validate.** `yarn db:generate` is a review probe, not a gate step.
- A review that cannot run the gate states so and which steps it relied on CI for.

## Severity and verdict

| Severity | Meaning here | Verdict |
|---|---|---|
| **blocker** | Tenant leak or trusted payload scope; missing server authz; secret/personal data exposure; edit to a shipped migration or generated file; breaking contract change without BC handling; red `yarn verify` / required CI job; lowered coverage or deleted/weakened test; unapproved migration or dependency | request changes |
| **major** | Missing integration oracle or lock/409 path; layering or boundary violation; missing `vereino-modules.json` entry; error code outside `lib/error-codes.ts`; non-paged list; missing `pl.json`/`en.json` key; spec/run log/lesson not updated | request changes |
| **minor** | Naming (S3.4), missing JSDoc/README section, weak but present test, missing UI evidence for a small change | approve with comments |
| **nit** | Wording, comment style, optional refactor | approve; may become a follow-up issue |

- State every finding with its severity, file and line, and the verdict (approve / request changes) in the review body.
- Labels are enabled (`.ai/agentic.config.json`): request changes → `changes-requested`, approval → `merge-queue`, through the label guards in `.ai/trackers/github.md` (see `SDLC.md`). A blocker touching a surface in `BACKWARD_COMPATIBILITY.md`, tenancy, encryption or a migration also warrants `risk-high`.
- `qaGate` is `false`: `needs-qa` is advisory, but UI changes without browser evidence (both locales, 375 px, clean console) are at least **minor**, and **major** when the change is user-facing flow logic.
- Any blocker or major ⇒ request changes. Agent-authored PRs still need a human maintainer approval (S1.5).
- **Gap:** CODEOWNERS lists one maintainer; who approves the owner's own PRs on protected paths is undecided.
