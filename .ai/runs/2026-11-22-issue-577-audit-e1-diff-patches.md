# Issue #577 — audit of the E1 diff against the local patches to platform files

- **Date:** 2026-11-22
- **Agent / tool:** Claude Code (Opus 5.5), `om-auto-fix-issue` through a Cezar run (issue labelled `cezar`)
- **Trigger:** issue #577 (ENG-AC-03 gap, found by the spec close-out III, #568)
- **Spec / issue / branch:** `.ai/specs/2026-10-21-engineering-standards-and-patterns.md` ENG-AC-03; #577; `docs/issue-577-audit-e1-diff-patches`
- **Status:** done — documentation only

## Goal

A one-off audit of the E1 commits (`.ai/runs/2026-10-21-e1-gate-and-ci.md`) that lists every changed platform-owned file and matches it to the local-patch list in `CONTRIBUTING.md` → *Local patches to platform files*; any unlisted change is added to the list with its reason or reported.

## Scope of the audit

- **E1 diff:** pull request #3 (`build/e1-gate-and-ci`), merge commit `39afaa34`; the diff is `git diff 39afaa34^1 39afaa34` (first parent `d7ea1444`, `main` after PR #2). Commits: `5718702a`, `443a39ed` (agent skills), `0ec4da9d` (gate, strict tooling, coverage), `6d1ab1ba` (CI, settings checklist), `c4bd05cc` (AGENTS.md and specs), `faed3881` (settings checklist), `4e02a8f0` (CI install retry), `6fae5849` (handlebars resolution). 537 files changed; 482 of them under `.agents/` (the committed agent skills).
- **Platform-owned** (S3.1, `CONTRIBUTING.md`): everything in `packages/app` outside the Vereino modules listed in `packages/app/vereino-modules.json`, the integration tests (`packages/app/.ai/qa/tests/**`) and the scripts Vereino created. Scaffold files outside `packages/app` are checked too, because the live list already records root scaffold files (Docker, Railway).
- **Origin check:** `git log --diff-filter=A` per root file, and `git show 3afda0f6` (the initial Open Mercato scaffold) for what the scaffold generated.

## Result

### Platform-owned files the E1 diff modified — all four on the list

| File (E1 change) | Local-patch row in `CONTRIBUTING.md` | Match |
|---|---|---|
| `packages/app/eslint.config.mjs` — imports `typescript-eslint`, `eslint-plugin-jsx-a11y`, `eslint-plugin-boundaries`; adds `vereinoTypeScriptConfigs`, jsx-a11y recommended, `vereinoModuleBoundaryConfigs` and `vereinoReactConfigs` for the listed Vereino modules and `.ai/qa/tests` only | "Vereino-path rules, package boundaries, re-enabled React rules" (S3.10, ADR-018) | yes |
| `packages/app/jest.config.cjs` — 100 % line/branch/function/statement thresholds for `src/modules/<id>/lib` of the listed modules | "100 % coverage thresholds for the `lib/` folders of the listed Vereino modules" (S13.6); the `react` mapping in the same row came later | yes |
| `packages/app/package.json` — scripts `format`, `format:check`, `contracts:check`, `typecheck:qa`, `test:scripts`, `test:integration:vereino`, `test:integration:vereino:start`; dev dependencies `@axe-core/playwright`, `@types/eslint-plugin-jsx-a11y`, `eslint-plugin-boundaries`, `eslint-plugin-jsx-a11y`, `prettier`, `prettier-plugin-tailwindcss`, `testcontainers`, `typescript-eslint` | "Vereino scripts (…) and development tools" (S2.1) | yes |
| `packages/app/scripts/i18n-check-hardcoded.mjs` — `--strict` fails on findings in listed Vereino modules; `runCli` becomes async | "`--strict` mode for Vereino module paths" (S2.4) | yes |

No other existing file in `packages/app` changed in E1.

### Files the E1 diff added inside `packages/app` — Vereino code, not patches

- Vereino scripts: `packages/app/scripts/vereino-ephemeral.mjs`, `vereino-format.mjs`, `vereino-paths.mjs`, `check-vereino-contracts.mjs`, and their tests in `packages/app/scripts/__tests__/` (`coverage-scope`, `eslint-vereino`, `vereino-contracts`, `vereino-ephemeral`, `vereino-format`, `vereino-lint`, `vereino-paths`, `verify`).
- Integration tests and fixtures: `packages/app/.ai/qa/tests/_fixtures/{axe,tenant}.ts`, `platform/ENG-TEST-05-runner-smoke.spec.ts`, `platform/ENG-TEST-16-login-accessibility.spec.ts`, `tsconfig.json`; the agent-browser scenario `packages/app/.ai/qa/agent-browser/login-smoke.mjs`.
- `packages/app/vereino-modules.json` — the Vereino module list (S3.1).

### Files outside `packages/app`

- **Vereino-owned (created by Vereino):** `.editorconfig`, `.nvmrc`, `.prettierrc.json`, `.github/CODEOWNERS`, `.github/PULL_REQUEST_TEMPLATE.md`, `.github/workflows/ci.yml`, `docs/ops/github-settings.md`, `eslint.vereino.mjs`, `scripts/verify.mjs`, `skills-lock.json`, `.agents/skills/**`, `packages/{core,db,ui}/**` (configs, `coverage-scope` tests), `.ai/lessons/**`, `.ai/runs/**`, `.ai/specs/**`.
- **Scaffold origin, rewritten by Vereino before E1, not platform code:** root `package.json` (the monorepo root since `a2b47ad6`; the scaffold manifest moved to `packages/app/package.json`), `yarn.lock` (the workspace lockfile), `AGENTS.md` and `.ai/agentic.config.json` (the agent harness the scaffold generated; Vereino owns its rules and pipeline configuration). Reported here, not added as patches: an upgrade does not take these files from the scaffold. A sentence in `CONTRIBUTING.md` now says so.
- **Unlisted scaffold file — added to the list:** root `.gitignore`. It is the scaffold `.gitignore` (`3afda0f6`), which stayed at the root when the app moved to `packages/app`. E1 changed it: the scaffold's `.agents/skills/` and `skills-lock.json` ignores replaced by the committed skills (only the local override links `.agents/skills/om-*` and `.agents/skills-quarantine/` stay ignored), plus `packages/app/.ai/qa/ephemeral*` and `packages/app/.ai/qa/test-results/`. Before and after E1 it also gained the `packages/app/` paths of the monorepo move, the mockup files kept local and `packages/ui/storybook-static/`. New row in `CONTRIBUTING.md` with these reasons.

## Decisions

- The E1 diff is the merge of PR #3 against its first parent, not `git log` of the branch: the branch also carried the two agent-skill commits that PR #2 did not, and the first-parent diff is exactly what E1 put on `main`.
- Root scaffold files count for the audit although S3.1 scopes *platform-owned* to `packages/app`: the live list already treats root Docker and Railway files as patched scaffold files, and a platform upgrade diffs the root `.gitignore` against the scaffold's. So the `.gitignore` gets a row; files Vereino rewrote completely (root `package.json`, `yarn.lock`, `AGENTS.md`, `.ai/agentic.config.json`) get a sentence instead of rows.
- ENG-AC-03 is ticked: its first half (strict lint and Prettier pass for Vereino-owned code) is the blocking `yarn verify` steps `lint` and `format:check`, green in CI on every pull request; this audit closes the second half.

## Files changed

- `.ai/runs/2026-11-22-issue-577-audit-e1-diff-patches.md` (this log)
- `CONTRIBUTING.md` — row for the root `.gitignore`; sentence on the scaffold-origin root files Vereino owns
- `.ai/specs/2026-10-21-engineering-standards-and-patterns.md` — ENG-AC-03 ticked with evidence
- `.ai/specs/changelog/2026-10-21-engineering-standards-and-patterns/2026-11-22-issue-577-e1-diff-audit.md`

## Commands and results

- `git log --oneline 39afaa34^1..39afaa34^2` → the 8 E1 commits above.
- `git diff --name-status 39afaa34^1 39afaa34` (without `.agents/`) → 55 paths; 4 modified platform-owned files, all on the list.
- `git log --diff-filter=A -- .gitignore package.json AGENTS.md .ai/agentic.config.json yarn.lock` → all added by `3afda0f6` (initial scaffold).
- `git diff 3afda0f6 HEAD -- .gitignore` → the changes recorded in the new row.
- `yarn verify` → all 20 steps passed (lint 87 s, format:check 10 s, spec-changelogs:check, build 53 s).
- `yarn guard` → "No blocking findings."

## Open problems

None.

## Next steps

None for #577. Every later pull request that patches a platform-owned file keeps adding its row (S3.1).
