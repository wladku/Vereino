# Run — contribution guide, code of conduct, security policy and issue templates (#445)

- **Trigger:** Cezar run 9da08d69 (`om-auto-fix-issue`), label `cezar` on #445 (E15-S01, epic #442).
- **Issue:** #445 — labels `documentation`, `priority-medium`, `risk-low`.
- **Branch:** `docs/issue-445-contribution-guide-security-policy`.
- **Spec:** `.ai/specs/2026-10-21-engineering-standards-and-patterns.md`, phase E2 slice (a), ENG-13, S17.1, S17.2, S17.6, P1–P6, S3.1.
- **Route:** docs only, delivery `direct` (the spec covers it; no code, dependency, migration or contract change).

## Goal

A contributor finds `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`, `SECURITY.md`, issue templates and the recommended editor extensions, all linked from `README.md`; the pinned-dependency and local-patch tables are filled from the repository as it is today.

## Steps and decisions

1. Claimed #445 (assignee, `in-progress`, `🤖` claim comment naming this worktree).
2. **Pins:** read root `resolutions`, every workspace manifest, `.yarnrc.yml`, `packageManager`, `.nvmrc` and the workflows. Reasons come from the spec's pin rules (P1/P2/P4/P5), commit `6fae5849` (handlebars advisories) and `yarn why` (who pulls `lodash`, `lodash-es`, `zod`, `handlebars`). `lodash`/`lodash-es` came with the Open Mercato scaffold (commit `3afda0f6`) and no repository record names an advisory, so the table says "inherited from the scaffold" instead of inventing one. The exact Storybook/Vite pins in `@vereino/ui` are explained as one consistent set (the only reading the repository supports).
3. **Local patches:** S3.1's planned table is out of date, so the live list comes from `git diff a2b47ad6 HEAD` (the monorepo move) over platform-owned paths in `packages/app` plus `git show a2b47ad6` for scaffold files the move edited (Docker, Railway scripts, `next.config.ts`, `globals.css`, `modules.ts`), each row with the issue or rule that caused it. New Vereino files inside platform folders are listed as "not patches".
4. **Code of Conduct:** the issue asked for Contributor Covenant 2.1, but S17.1 (the governing spec) says 3.0 with two named contacts. Used the official 3.0 text (downloaded from `EthicalSource/contributor_covenant`, branch `release`), filled the reporting placeholder with the two maintainers and a private-contact path that publishes no e-mail address, and removed the template's editor note above the enforcement ladder. Recorded in the spec changelog file.
5. **Security policy:** S17.6 values (private reporting, latest release supported, 3 working days, 90 days, coordinated disclosure, no bounty, safe harbour). Private vulnerability reporting is **not yet enabled** on the repository (`GET /repos/wladku/Vereino/private-vulnerability-reporting` → `{"enabled":false}`), which is an owner action in the epic; `SECURITY.md` gives a fallback ("Security contact request" issue without details).
6. **Issue templates:** `bug.yml` and `feature.yml` use the sections `om-prepare-issue` writes (🎯 Change, 📋 Scope, ✅ Done when, 📝 Spec, 🔍 Implementation notes, ⚠️ Open questions; bug adds steps and 📸 Evidence) and apply the `bug` / `feature` category labels; `config.yml` disables blank issues and sends security reports to the private advisory form and `SECURITY.md`.
7. **`.vscode/extensions.json`:** writing it was denied by the session's permission mode (Write and Bash on `.vscode/extensions.json`), so the file is **not** in this run; a retry after the owner's "continue" was denied the same way. `CONTRIBUTING.md` lists the extensions by hand instead of linking a missing file, and follow-up #456 carries the exact content.
8. `README.md` links the documents in the status line and a new *Contributing* section. Spec changelog file added; ENG-AC-13 stays unchecked (repository settings pending).

## Files changed

- `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`, `SECURITY.md` (new)
- `.github/ISSUE_TEMPLATE/bug.yml`, `feature.yml`, `config.yml` (new)
- `README.md`
- `.ai/specs/changelog/2026-10-21-engineering-standards-and-patterns/2026-11-20-issue-445-e2-documents.md` (new)
- this run log

## Commands and results

- `yarn verify` — `[verify] all 18 step(s) passed`, exit 0.

## Open problems and next steps

- #456: add `.vscode/extensions.json`.
- Owner: enable private vulnerability reporting, secret scanning with push protection and Dependabot alerts (epic #442), and decide whether to publish contact e-mails in `CODE_OF_CONDUCT.md`.
- Kacper's GitHub handle is unknown to the repository (CODEOWNERS has only `@wladku`); add it to `CONTRIBUTING.md` and `CODE_OF_CONDUCT.md` when known.
