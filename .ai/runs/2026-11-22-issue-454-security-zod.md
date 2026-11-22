# Run: #454 — Zod 4.6.7 under P6 (fix/security-zod)

- **Trigger:** Cezar run (task 655faf86), label `cezar` on #454, 2026-11-22. Same run as `.ai/runs/2026-11-22-issue-454-security-next.md` (PR #570); this is its second PR.
- **Issue:** #454 (epic #565). **Branch:** `fix/security-zod` (from `main`). **Spec:** `.ai/specs/2026-10-21-engineering-standards-and-patterns.md` (S16.3, P6).
- **Approval:** owner comment on #454, 2026-11-22: `zod` **4.6.7**, root `resolutions` plus the app range; overriding `@open-mercato/core`'s exact pin is accepted.

## Goal

Clear GHSA-mrhx-c7xc-m3w5 (Zod < 4.6.6 can run out of memory while validating oversized constrained collections) by moving the single Zod copy from 4.4.3 to 4.6.7.

## Steps

1. Root `package.json` `resolutions.zod` 4.4.3 → 4.6.7; `packages/app/package.json` `zod` `^4.4.3` → `^4.6.7`.
2. `yarn install`: the lockfile change is `zod@npm:4.4.3` → `zod@npm:4.6.7` only, still one copy (the resolution also covers `@open-mercato/core`'s exact `4.4.3`, `@open-mercato/search` and `@modelcontextprotocol/sdk`).
3. Docs that state the version: `CONTRIBUTING.md` (P4 resolutions row and the caret row), the engineering-standards stack table, and a spec changelog file.

## Decisions

- Both edits go in the same commit, so the resolution and the app range never disagree.
- `.ai/specs/research/` still says 4.4.3: research files are read-only discovery inputs and record what was true at the time.

## Commands and results

- `yarn npm audit --all --recursive --severity high` after the bump: only `next` is left, fixed by PR #570. Once both PRs merge, the audit exits 0.
- `yarn guard`: `No blocking findings.`
- `yarn verify`: all 20 steps passed, including `typecheck`, `test` (100 % coverage) and `build`.
- Integration, chosen for Zod-validated API routes and CrudForm validation: `yarn test:integration:vereino --filter E02-S01` (club setup) `4 passed (1.2m)`; `--filter TEST-001` (club structure) `4 passed (51.3s)`. CI runs the full suite in shards.

## Open problems / next steps

- After #570 and this PR merge, run the `Security` workflow by hand to confirm the `audit` job is green (acceptance criterion of #454).
- Upstream issues in `open-mercato` stay with the owner.
