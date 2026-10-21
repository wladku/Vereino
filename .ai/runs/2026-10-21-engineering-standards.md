# Engineering standards specification

- **Date:** 2026-10-21
- **Agent / tool:** Claude Code (coordinator) with three research subagents (platform conventions, ecosystem practices, domain concerns)
- **Trigger:** product owner — "research and create a specification of the best possible tech stack, engineering standards, coding standards and design patterns for the project described in `.ai/specs/2026-10-20-vereino-club-management.md`"
- **Spec / issue / branch:** new spec `.ai/specs/2026-10-21-engineering-standards-and-patterns.md` (not written yet); branch `docs/engineering-standards`
- **Status:** in progress — research done, spec not yet written (hand-over point below)

## Goal

One English spec (SPEC-000 template, every section kept) that fixes the stack, the engineering process, coding standards and design patterns for Vereino 1.0, closes the 24 gaps found in the platform/repository rules, and records the decision on Open Mercato.

## Decisions

- **Keep Open Mercato for 1.0, with exit criteria** (product owner, 2026-10-21, answer "Zostajemy, z kryteriami wyjścia"). To be written as ADR-001: domain logic kept portable (pure functions in `src/modules/<id>/lib/`, later `@vereino/core`; Zod schemas framework-free); no CRM/commerce/AI modules; spike V-1…V-12 at phase-1 start; exit to a lean stack (same technologies without the framework) before phase 2 if blockers appear in at least two key areas (member/guardian auth, tenancy and scope, payments gateway, member frontend pages, i18n) or if platform upgrades cost more than one working day per month averaged over a quarter (hours recorded in upgrade run logs).
- Platform facts checked in the installed 0.9.0 packages: Awilix container uses `InjectionMode.CLASSIC` (no `strict`); logger is pino-based (`@open-mercato/shared/lib/logger`); platform ships `lib/ratelimit`, `lib/webhooks` (Svix-style verify), `lib/redis`, `lib/telemetry`, packages `queue`, `scheduler`, `cache`, `telemetry`, `webhooks`, `channel-resend`, `gateway-stripe`; CRUD list schema is `{ items, total, page, pageSize, totalPages }` (the club spec writes `{ items, totalCount }` — reconcile); `next.config.ts` already sends CSP, `Referrer-Policy`, `nosniff`, `X-Frame-Options` (no HSTS); `.gitattributes` normalises text to LF.
- API naming observed in the club spec: query parameters and JSON keys camelCase (`payerPersonId`), enum values and DB columns snake_case, money as `amount` integer grosz.

## Steps

1. Read the club spec, `AGENTS.md`, guides and the installed framework packages; launched three research subagents.
2. Research results (copied from the session scratchpad so another session can continue):
   - `.ai/specs/research/engineering-standards/a-platform-conventions.md` — conventions Vereino must follow + 24 gaps (§12).
   - `.ai/specs/research/engineering-standards/b-ecosystem-practices.md` — TS 6, ESLint 9, Next 16, React 19.2, MikroORM 7, Awilix, Zod 4, Tailwind 4, testing, CI, observability, security, modular monolith, alternatives.
   - `.ai/specs/research/engineering-standards/c-domain-concerns.md` — GDPR/Polish law for children, money, Stripe BLIK/P24, tenancy/RLS, e-mail, public pages, WCAG 2.2, operations, OSS hygiene, calendar/DST; appendices with proposed tables, a verification backlog and test cases.
3. Product owner asked whether Open Mercato is worth keeping; answered with a recommendation; decision recorded above.

## Hand-over: what the next session does

1. Write `.ai/specs/2026-10-21-engineering-standards-and-patterns.md` from `SPEC-000-template.md` (keep every section; `N/A — reason` where nothing applies). Use spec-local id prefixes to avoid clashes with the club spec: `ENG-01…` (goals), `ADR-001…` (decisions), `ENG-TEST-01…`, `ENG-AC-01…`, `ENG-Q-01…`, journeys `EJ-01…`.
2. Planned content of *Proposed Solution*: stack baseline with pin policy; ADR table (ADR-001 Open Mercato with exit criteria; Yarn workspaces without Turborepo; Jest not Vitest; legacy decorators as the platform uses; REST via `makeCrudRoute` + commands, no Server Actions for domain mutations; `updated_at` optimistic locking; platform error helpers + app-wide machine-code registry; RLS as defence in depth decided by spike; money in grosz with half-up and largest-remainder; hosted Stripe Checkout with BLIK/P24; Resend eu-west-1; Railway EU West with PITR + off-site dump; DCO; Renovate; GitHub Actions; no feature-flag framework in 1.0; WCAG 2.2 AA; performance budgets; release-please + SemVer); then standards S1 repository workflow, S2 single canonical gate (`yarn verify`, i18n check blocking), S3 TypeScript/coding, S4 module patterns, S5 data/persistence, S6 API conventions, S7 UI/a11y/performance, S8 security, S9 privacy/compliance, S10 money/payments, S11 time/calendar, S12 e-mail, S13 testing, S14 CI/CD, S15 observability/operations, S16 dependencies/licences, S17 documentation/OSS, S18 local development, S19 AI-agent workflow (reference `AGENTS.md`).
3. Phases: E1 tooling foundations (gate script, lint/format/tsconfig for Vereino code, `.ai/qa/tests`, CI, branch protection, Renovate, SECURITY/CONTRIBUTING/PR template, CHANGELOG); E2 platform spike and ADR-001 checkpoint; E3 operations baseline before pilot data; E4 compliance pack (DPIA, processor and breach registers, retention schedule) and feeding the domain requirements from research C into the club spec.
4. Verify (table cell counts, id uniqueness, links, `node scripts/check-lessons.mjs`), finish this log, commit on `docs/engineering-standards` (Conventional Commits). Push or open a PR only when the product owner asks.

## Files changed

`.ai/specs/research/engineering-standards/{a-platform-conventions.md, b-ecosystem-practices.md, c-domain-concerns.md}` (new, research input); this log.

## Commands and results

- Platform checks: `grep injectionMode` in `@open-mercato/shared/dist/lib/di/container.js` → `InjectionMode.CLASSIC`; package listing of `@open-mercato/*` 0.9.0; `next.config.ts` headers read.

## Open problems

- Research C claims marked unverified (its Appendix B, e.g. Polish digital-consent age 16, UODO DPIA list, bank file encodings) must be confirmed before the pilot.
- Decisions D1–D5 from `2026-10-20-spec-consistency-fixes.md` still await the product owner.

## Lessons recorded

None yet.
