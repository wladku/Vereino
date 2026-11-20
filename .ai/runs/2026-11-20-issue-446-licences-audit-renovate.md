# Run: issue #446 (E15-S02), automated checks for dependencies, licences and vulnerabilities

- **Goal and trigger**: a Cezar run (`om-auto-fix-issue`, feature route) started by the `cezar` label on #446, 2026-11-20 09:00Z.
- **Spec**: `.ai/specs/2026-10-21-engineering-standards-and-patterns.md`, phase E2 slice (b): ENG-01, ENG-12, S14.1, S16.1–S16.4, ADR-016, ENG-TEST-18.
- **Branch**: `feat/issue-446-dependencies-licences-vulnerabilities-checked`; worktree `.ai/cezar/worktrees/ea781b82-…`.

## Steps

1. Claimed #446 (assignee, `in-progress`, and a `🤖` claim comment naming this run).
2. Added `scripts/check-licenses.mjs` and `yarn licenses:check`. No new dependency: the script walks the installed
   `node_modules` trees from each workspace's `dependencies` and `optionalDependencies`, using Node's own lookup. The
   lockfile has no licence data and does not separate dev from production. It evaluates SPDX expressions (`AND`, `OR`,
   `WITH`, parentheses, the legacy `licenses` array) against the S16.1 allowlist.
3. The first run on the repository listed 1509 production packages and 11 outside the allowlist. Each one is recorded
   in `LICENSE_EXCEPTIONS` with the licence it declares and a reason (see Decisions).
4. Added unit tests in `packages/app/scripts/__tests__/check-licenses.test.mjs`, including the GPL fixture
   (ENG-TEST-18, negative case), and registered the script in `test:scripts` coverage and `coverage-scope.test.mjs`.
   Added it to the `AGENTS.md` 100 % list.
5. Added `.github/workflows/security.yml`: weekly (Monday 04:00 UTC), `workflow_dispatch`, and on `yarn.lock` changes on
   `main`. Two jobs, `licenses` (install, then `yarn licenses:check`) and `audit`
   (`yarn npm audit --all --recursive --severity high`, which reads the lockfile with no install, checked in a copy
   holding only the manifests and lockfile). Read-only `contents: read`, actions pinned by SHA like `ci.yml`.
6. Added `renovate.json` per S16.2 and ADR-016, and validated it with `renovate-config-validator --strict`
   (Renovate run through `npx`, not added to the repository).
7. Filed #454 for the advisories the audit reports on `main` today.

## Decisions

- **Exceptions live in the script, keyed to the licence.** S16.4 puts them in `CONTRIBUTING.md`, which slice (a) (#445)
  has not created yet. Each exception stores the licence the package declared when it was recorded, so a licence change
  fails the check again. Names ending in `*` cover the platform variants of one native binary (`@img/sharp-libvips-*`).
- **The 11 exceptions need the owner's review.** S16.1 makes an exception an owner decision, so the PR lists them.
  Two need a real decision: `@open-mercato/enterprise` (commercial, ADR-023, ENG-Q-10) and `@newrelic/security-agent`
  (proprietary New Relic licence, pulled in by the scaffold's `newrelic` dependency). The rest are permissive
  (MIT-0, Unlicense, Zlib, Python-2.0, CC-BY-4.0 data), declared wrongly in the manifest (`duck` "BSD" is BSD-2-Clause
  text; `@sesamecare-oss/redlock` "UNLICENSED" ships an MIT `LICENSE.md`), or LGPL used unmodified and dynamically
  linked (`sharp`'s libvips).
- **The audit stays strict.** It reports 23 high or critical advisories, among them two critical Next.js 16.3.6 RCEs.
  Hiding them with `npmAuditIgnoreAdvisories` would weaken security, which is Ask First, and the fixes are P2 or P6
  upgrades. The workflow ships as the spec states, and #454 tracks the fixes. The acceptance criterion "the job is
  green on `main`" holds only after #454.
- **The licence check is not a `yarn verify` step**, as S16.4 states. The unit tests use fixtures and never read the
  repository's own tree, so a new dependency cannot fail the gate.
- **Lock-file maintenance and P2:** Renovate's weekly lock-file maintenance (S16.2) can move P2 packages inside their
  ranges (`awilix ^13.0.5`, `@mikro-orm/migrations ^7.1.14`). Exact pins and the `zod` resolution are unaffected. A
  reviewer checks those PRs.

## Files changed

- `scripts/check-licenses.mjs` (new), `package.json` (`licenses:check`)
- `packages/app/scripts/__tests__/check-licenses.test.mjs` (new), `packages/app/scripts/__tests__/coverage-scope.test.mjs`, `packages/app/package.json` (`test:scripts` coverage include)
- `.github/workflows/security.yml` (new), `renovate.json` (new)
- `AGENTS.md` (100 % list), `.ai/specs/changelog/2026-10-21-engineering-standards-and-patterns/2026-11-20-issue-446-phase-e2-b.md`

## Commands and results

- `yarn licenses:check` printed `licenses:check: 1509 production packages, every licence allowed.` and exited 0.
- The GPL fixture (unit test `main exits 1 on the GPL fixture …`) exits 1 with
  `gpl-lib@2.0.0 has licence "GPL-3.0-only", which is not allowed (packages/app/node_modules/gpl-lib)`.
- `yarn test:scripts`: 236 passed, 0 failed; `check-licenses.mjs` 100 % lines, branches and functions.
- `npx --package renovate -- renovate-config-validator --strict`: `Config validated successfully against 1 file(s)`.
  The first attempt failed with `Config migration necessary` for `"dependencyDashboard": true`. That key was dropped,
  because `config:recommended` already turns the dashboard on.
- `yarn npm audit --all --recursive --severity high` exited 1 with 23 advisories (body-parser, happy-dom, next, node-forge, re2js, zod), now in #454.
- `yarn verify`: green. The first run passed every step up to `lint`, then failed at `format:check` on the new test file. After `yarn format`, `yarn verify --from format:check` passed every remaining step, `build` included.

## Open problems and next steps

- #454: fix or accept the advisories so that `security.yml` turns green on `main`.
- The owner installs the Renovate GitHub app (out of scope), then confirms the first grouped PRs leave out P1 and P2 (ENG-TEST-18).
- When `CONTRIBUTING.md` lands (#445), the licence exceptions table can be mirrored there, and the script stays the checked source.
