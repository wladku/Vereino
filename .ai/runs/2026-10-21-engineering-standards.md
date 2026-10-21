# Engineering standards specification

- **Date:** 2026-10-21
- **Agent / tool:** Claude Code (coordinator) with three research subagents (platform conventions, ecosystem practices, domain concerns); second session (Claude Code, Opus 5.5) wrote and verified the spec with two review subagents
- **Trigger:** product owner — "research and create a specification of the best possible tech stack, engineering standards, coding standards and design patterns for the project described in `.ai/specs/2026-10-20-vereino-club-management.md`"
- **Spec / issue / branch:** new spec `.ai/specs/2026-10-21-engineering-standards-and-patterns.md` (`Draft`); branch `docs/engineering-standards`
- **Status:** completed — spec written and verified; status `Draft` until the product owner answers ENG-Q-01/ENG-Q-02 and approves it

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
4. (Second session, product owner: "Kontynuuj zadanie … sekcja Hand-over … Bez push i bez PR") Read the hand-over, `AGENTS.md`, `CLAUDE.md`, `.ai/guides/spec-delivery.md`, `SPEC-000-template.md`, skill `om-spec-writing` (+ rules) and all three research files; re-checked installed versions, scripts, `tsconfig.json`, `eslint.config.mjs`, Railway files, `init-or-migrate.sh`, CRUD error helpers, licences and repository visibility (`wladku/Vereino` is public).
5. Wrote the spec in full (all template sections). The `om-spec-writing` Open Questions gate was not used as a hard stop because the product owner asked for the whole spec in one run; the questions are recorded as ENG-Q-01 … ENG-Q-10 with defaults, and the status stays `Draft`.
6. Verification, in parallel: (a) a local script over the spec — table cell counts, id definitions and uniqueness, undefined references, file paths named in the spec, template section order; (b) background subagent: fresh-context architectural review in the `om-spec-writing` format; (c) background subagent: fact check against research, run log, club spec and repository. Subagents only read; the coordinator applied every change.
7. Applied the findings (Changelog row "Review fixes" in the spec). Main ones: split the hand-over's E1 into E1 *Gate and CI* and E2 *Repository hygiene and release* (E1 closed 8 of 14 goals and release-please can only be proven after a merge), so the hand-over's E2–E4 became E3–E5; moved the club spec convention amendment into E1 so club routes are never built against `{ items, totalCount }`; P6 security exception; break-glass rule; local-patch table; error factory outside `lib/`; token pages never cached; restore cut-over and reconciliation; ADR-023 for the commercial enterprise package.
8. Recorded lesson `enterprise-package-is-commercial`; committed `3e7ca67`.
9. Product owner answered the three questions that blocked E1 (asked as multiple choice, 2026-10-21): ENG-Q-01 "Wszystkie" (approve all listed tools, apps and actions); ENG-Q-02 "Ty, konto osobiste" (the product owner configures settings from a step list that E1 delivers as `docs/ops/github-settings.md`; repository stays on the personal account); ENG-Q-08 "Jedna specyfikacja" (keep one spec with five phases). Recorded in the spec's *Open Questions*, *Final Compliance Report*, E1 and Changelog; spec checks and `node scripts/check-lessons.mjs` re-run green.

## Hand-over: what the next session does

Done in the second session — see steps 4–8 and the decisions below.

1. Write `.ai/specs/2026-10-21-engineering-standards-and-patterns.md` from `SPEC-000-template.md` (keep every section; `N/A — reason` where nothing applies). Use spec-local id prefixes to avoid clashes with the club spec: `ENG-01…` (goals), `ADR-001…` (decisions), `ENG-TEST-01…`, `ENG-AC-01…`, `ENG-Q-01…`, journeys `EJ-01…`.
2. Planned content of *Proposed Solution*: stack baseline with pin policy; ADR table (ADR-001 Open Mercato with exit criteria; Yarn workspaces without Turborepo; Jest not Vitest; legacy decorators as the platform uses; REST via `makeCrudRoute` + commands, no Server Actions for domain mutations; `updated_at` optimistic locking; platform error helpers + app-wide machine-code registry; RLS as defence in depth decided by spike; money in grosz with half-up and largest-remainder; hosted Stripe Checkout with BLIK/P24; Resend eu-west-1; Railway EU West with PITR + off-site dump; DCO; Renovate; GitHub Actions; no feature-flag framework in 1.0; WCAG 2.2 AA; performance budgets; release-please + SemVer); then standards S1 repository workflow, S2 single canonical gate (`yarn verify`, i18n check blocking), S3 TypeScript/coding, S4 module patterns, S5 data/persistence, S6 API conventions, S7 UI/a11y/performance, S8 security, S9 privacy/compliance, S10 money/payments, S11 time/calendar, S12 e-mail, S13 testing, S14 CI/CD, S15 observability/operations, S16 dependencies/licences, S17 documentation/OSS, S18 local development, S19 AI-agent workflow (reference `AGENTS.md`).
3. Phases: E1 tooling foundations (gate script, lint/format/tsconfig for Vereino code, `.ai/qa/tests`, CI, branch protection, Renovate, SECURITY/CONTRIBUTING/PR template, CHANGELOG); E2 platform spike and ADR-001 checkpoint; E3 operations baseline before pilot data; E4 compliance pack (DPIA, processor and breach registers, retention schedule) and feeding the domain requirements from research C into the club spec.
4. Verify (table cell counts, id uniqueness, links, `node scripts/check-lessons.mjs`), finish this log, commit on `docs/engineering-standards` (Conventional Commits). Push or open a PR only when the product owner asks.

## Decisions (second session, spec writing)

- Phases renumbered after review (see step 7) — the split makes each phase close its own goals with its own exit gate; the hand-over's content is unchanged, only distributed over five phases.
- The research A claim "`.ai/qa/` does not exist" was about the root `.ai/`; `packages/app/.ai/qa/tests/playwright.config.ts` exists (platform-owned) and the spec uses it unchanged.
- `@open-mercato/enterprise` is commercial (ADR-023, ENG-Q-10); platform MFA lives in it, so MFA is an open licence question (ENG-Q-09), not a platform given.
- Not changed after review, deliberately: the review's suggestion to split the spec into four specs is put to the product owner as blocking ENG-Q-08 instead of being decided here; short restatements of platform rules in S4–S7 stay, each naming its source, so contributors find the whole picture in one document.

## Files changed

- `.ai/specs/research/engineering-standards/{a-platform-conventions.md, b-ecosystem-practices.md, c-domain-concerns.md}` (new, research input, first session)
- `.ai/specs/2026-10-21-engineering-standards-and-patterns.md` (new spec, `Draft`)
- `.ai/lessons/enterprise-package-is-commercial.md` (new) and `.ai/lessons.md` (catalog row)
- this log

## Commands and results

- Platform checks (first session): `grep injectionMode` in `@open-mercato/shared/dist/lib/di/container.js` → `InjectionMode.CLASSIC`; package listing of `@open-mercato/*` 0.9.0; `next.config.ts` headers read.
- Installed versions read from `packages/app/node_modules/*/package.json`: next 16.3.6, react 19.2.8, typescript 6.0.3, @mikro-orm/core 7.2.5, awilix 13.0.5, zod 4.4.3, tailwindcss 4.3.3, jest 30.5.2, ts-jest 29.4.15, @playwright/test 1.64.1, eslint 9.39.5.
- `gh repo view wladku/Vereino --json visibility` → `PUBLIC`.
- Spec check script (session scratchpad, not committed), final run: table rows — 0 errors; defined ids — 14 goals, 23 ADRs, 155 rules, 19 standards, 8 journeys, 22 tests, 14 acceptance criteria, 10 questions, no duplicates, no undefined references; all 19 template sections present in template order; every path the spec says exists exists.
- `node scripts/check-lessons.mjs` → `Lessons catalog is valid` (exit 0), run before and after adding the lesson.
- No app code changed, so `yarn verify`-style gates (typecheck, lint, tests, build) were not run.

## Open problems

- The spec stays `Draft` until the product owner approves it. E1 has no open blocking question; ENG-Q-03, ENG-Q-04, ENG-Q-05, ENG-Q-10 (E4) and ENG-Q-06, ENG-Q-07 (E5) are still open.
- Research C claims marked unverified (its Appendix B, e.g. Polish digital-consent age 16, UODO DPIA list, bank file encodings) must be confirmed before the pilot (ENG-Q-06).
- Decisions D1–D5 from `2026-10-20-spec-consistency-fixes.md` still await the product owner.

## Next steps

1. Product owner approves the spec (`Ready for implementation`); the E4/E5 questions can be answered later, before those phases.
2. Implement phase E1 with `om-implement-spec`, including club spec amendment A.

## Lessons recorded

- [`enterprise-package-is-commercial`](../lessons/enterprise-package-is-commercial.md) — `@open-mercato/enterprise` is commercial; keep its modules disabled.
