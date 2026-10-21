# Engineering standards phase E1 — gate and CI

- **Date:** 2026-10-21
- **Agent / tool:** Claude Code (Opus 5.5) via the `om-implement-spec` workflow; one read-only research subagent
- **Trigger:** product owner — "Zacznij implementację fazy E1 (Gate and CI) ze specyfikacji standardów przez om-implement-spec", plan approved with "Zatwierdzam plan E1 łącznie z dwiema poprawkami specyfikacji; pracuj na nowej gałęzi build/e1-gate-and-ci, commit po każdym kawałku, bez push."
- **Spec / issue / branch:** `.ai/specs/2026-10-21-engineering-standards-and-patterns.md`, phase E1; branch `build/e1-gate-and-ci` (from `docs/engineering-standards`)
- **Status:** stopped — local part of E1 done and committed; phase E1 stays `in_progress` until the push, the first CI run and the repository settings (see Open problems)

## Goal

One gate, `yarn verify`, used identically by developers, agents and GitHub Actions; CI workflow and repository-settings checklist; `AGENTS.md`, the agentic configuration and the club spec aligned with the API conventions (amendment A).

## Steps

1. Readiness audit of the spec (status `Ready for implementation`, no blocking question for E1, traceability complete). The spec names its phase section *Implementation Phases* (template name) instead of the resolver's *Implementation Plan*/*Phasing*; treated as equivalent.
2. Plan presented and approved with two spec changes: ENG-TEST-03/04 run on `node:test`; the Vereino module list lives in `packages/app/vereino-modules.json`.
3. Research subagent (read-only) on the platform integration runner: Testcontainers database (default image `pgvector/pgvector:pg16`), `yarn initialize` seed with `superadmin@acme.com` / `admin@acme.com`, production build, helpers in `@open-mercato/core/helpers/integration/*`, `--filter` instead of `--grep`.
4. Baseline before changes (all exit 0): `yarn generate` 23 s, `yarn typecheck` 22 s, `yarn typecheck:packages` 6 s, `yarn lint` 42 s, `yarn ds:check` 3 s, `yarn test` 5 s.
5. Slice (a): gate script, Prettier, ESLint rules for Vereino paths, contracts check, strict i18n, shared-package configs, QA tsconfig and `typecheck:qa`, fixtures, ENG-TEST-05/16; tooling tests on `node:test`.
6. Product owner request during the run (pasted text): PR CI with build, lint, a unit-test framework and Testcontainers integration tests driven by agent-browser; a 100 % unit-coverage rule in `AGENTS.md`; tests covering 100 % of existing code. Decisions asked (multiple choice): rule scope "Logika + pakiety + skrypty", existing code "Tylko kod Vereino", agent-browser "Dodatkowy job w CI". Implemented: 100 % thresholds, `coverage-scope` guards, CI job `browser-smoke`, agent-browser v0.38.2 pinned by SHA-256.
7. A production Open Mercato server from another session (pid 267004, port 3000, `packages/app`) blocked local runs and shared the build directory; stopped with the product owner's approval ("Zatrzymaj go"). The product owner also approved downloading agent-browser locally ("Tak, pobierz"); checksum verified.
8. The platform runner never became ready: its probe requires `GET /api/customers/people` (module not enabled). Product owner chose a Vereino runner ("Własny cienki runner"): `packages/app/scripts/vereino-ephemeral.mjs`, `testcontainers` as an explicit dev dependency, CI and docs switched to `yarn test:integration:vereino`.
9. Product owner ran `npx skills add open-mercato/skills --skill '*'` through this session, then asked to track skills in git; `.agents/skills/` and `skills-lock.json` committed (`2026-10-21`, two commits), links to `.ai/skills/<id>` and `.agents/skills-quarantine/` ignored; after `yarn install-skills` the pinned versions were kept ("Przypięte").
10. ENG-TEST-16 was flaky (`color-contrast` on the first attempt only) — fixed with reduced motion and a settled page; agent-browser scenario hung because the daemon kept the stdout pipe open — fixed by writing command output to a file.

## Decisions

- Development tools installed per workspace (AGENTS.md: root holds no dependencies): app — prettier 3.9.10, prettier-plugin-tailwindcss 0.8.1, typescript-eslint 8.71.2, eslint-plugin-jsx-a11y 6.10.2, eslint-plugin-boundaries 7.2.0, @axe-core/playwright 4.14.0; core/db/ui — eslint, typescript-eslint (+ jsx-a11y in ui).
- Shared lint rules in root `eslint.vereino.mjs` without imports; each workspace passes its own plugin instances.
- Module boundaries: one `boundaries/dependencies` policy per listed module (no templates), `dependency.kind: value` disallowed across modules, so `import type` stays allowed; the `@/modules/*` alias is forbidden inside Vereino modules so relative imports can be resolved.
- Integration tests get their own `packages/app/.ai/qa/tests/tsconfig.json` (the app tsconfig skips `.ai`; TS 6 defaults `types` to `[]`) and a new gate step `typecheck:qa`; the platform `playwright.config.ts` stays out.
- The platform runner rejects `--grep`; focused runs use `--filter`. Spec S2.2/S13.2 and the club spec amended.
- CI pins the runner's PostgreSQL image to `pgvector/pgvector:pg17-trixie` (runner default is pg16).
- Root `resolutions` gains `handlebars: 4.7.10` (P4 security exception): `eslint-plugin-boundaries` 7.2.0 (latest) and `@boundaries/elements` 3.1.1 pin `handlebars` 4.7.9, which has two critical advisories (GHSA-8r5x-fm3f-whwj, GHSA-p8wg-vrv2-v86f; patched in 4.7.10, published 2026-10-05) found by the `dependency-review` job. Remove the entry when the plugin ships a fixed pin; phase E2 moves this reason into `CONTRIBUTING.md` → *Pinned and overridden dependencies*.
- CI retries `yarn install --immutable` once: the npm registry answered a hardened-mode metadata request with 409 in one job of a run where the same install passed elsewhere.
- `.github/CODEOWNERS` lists only `@wladku` until the second maintainer's handle is known; "Require review from Code Owners" stays off until then (`docs/ops/github-settings.md`).

## Files changed

Commits on `build/e1-gate-and-ci`: agent skills (two commits), slice (a) tooling and tests, slice (b) CI and repository-settings checklist, slice (c) `AGENTS.md`, agentic configuration, both specs and this log. See `git log docs/engineering-standards..build/e1-gate-and-ci --stat`.

## Commands and results

- `yarn verify` → all 13 steps passed in 121 s (generate 13 s, typecheck 18 s, typecheck:packages 3 s, typecheck:qa 3 s, lint 25 s, format:check 2 s, ds:check 2 s, i18n --strict 3 s, contracts:check 2 s, lessons:check 1 s, test 3 s, test:scripts 5 s, build 42 s). An earlier run failed at `format:check` on unformatted new test files, as intended.
- `yarn test:scripts` → 66 tests, 100 % lines/branches/functions; a run with only one test file and the guard exits 1 (ENG-TEST-24).
- `yarn test:integration:vereino --filter ENG-TEST` → ENG-TEST-05 passed; ENG-TEST-16 passed on retry before the fix; after the fix `yarn playwright test … ENG-TEST-16 --repeat-each=8 --retries=0` → 8 passed.
- `node .ai/qa/agent-browser/login-smoke.mjs` against the ephemeral app → "signed in and reached http://127.0.0.1:5001/backend", screenshot written.
- `yarn tsc … --noUncheckedIndexedAccess` on the app → 584 errors, all in platform sources under `node_modules`; the flag stays off for the app (S3.2).
- Platform runner `yarn test:integration:ephemeral --filter ENG-TEST` → "Application did not become ready within 90 seconds … Authenticated GET /api/customers/people returned 404" (first attempts: "Another Open Mercato production server is already running … pid 267004 on port 3000").

## Open problems

- E1 stays `in_progress`: the exit gate needs a push, the E1 pull request, a green first CI run (incl. `browser-smoke` and `perf` baseline, ENG-TEST-17, ENG-TEST-23) and the repository settings from `docs/ops/github-settings.md`, then ENG-TEST-02. Pushing waits for the product owner's request.
- The second maintainer's GitHub handle is unknown; `CODEOWNERS` lists `@wladku` only and "Require review from Code Owners" stays off.
- Git uses an auto-generated identity (`wkuc@yosi.local`); set a real name and e-mail before DCO is enforced.
- Platform log noise during test cleanup: `QueryIndexScopeError` when deleting a tenant's organization and role through the API (platform indexer, does not fail tests) — candidate for an upstream report.
- `.agents/skills-quarantine/` holds the newer skill versions replaced by `yarn install-skills` (ignored).

## Next steps

1. Product owner: approve the push of `docs/engineering-standards` and `build/e1-gate-and-ci` and the pull requests.
2. After the first CI run: apply `docs/ops/github-settings.md`, run ENG-TEST-02, record the Lighthouse baseline, close E1.

## Lessons recorded

- [`platform-integration-runner-needs-customers`](../lessons/platform-integration-runner-needs-customers.md)
