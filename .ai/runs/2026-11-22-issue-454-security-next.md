# Run: #454 — Next.js 16.4.6 under P6 (fix/security-next)

- **Trigger:** Cezar run (task 655faf86), label `cezar` on #454, 2026-11-22.
- **Issue:** #454 (epic #565). **Branch:** `fix/security-next`. **Spec:** `.ai/specs/2026-10-21-engineering-standards-and-patterns.md` (S16.3, P6).
- **Approval:** owner comment on #454, 2026-11-22: `next` and `eslint-config-next` 16.4.6, `zod` 4.6.7, two PRs (`fix/security-next`, `fix/security-zod`).

## Goal

Clear the two critical and two high `next` 16.3.6 advisories (Image Optimization RCE and SSRF, `use cache` RCE, Server Actions DoS; fixed after 16.4.0) by moving `next` and `eslint-config-next` to the approved 16.4.6. `zod` ships on its own PR.

## Steps

1. Claimed #454 (assignee, `in-progress`, `🤖` claim comment naming this run). The transitive advisories were already fixed by #543.
2. `packages/app/package.json`: `next` and `eslint-config-next` 16.3.6 → 16.4.6; `yarn install` refreshed `yarn.lock`.
   - First attempt: the plain install resolved `eslint-config-next`'s `typescript-eslint@^8.56.0` to a second copy (8.73.0) beside the app's 8.71.2. `yarn lint` then failed: `ConfigError: Config "typescript-eslint/base": Key "plugins": Cannot redefine plugin "@typescript-eslint".`
   - `yarn dedupe typescript-eslint '@typescript-eslint/*'` (→ 8.73.0) fixed lint, but `yarn guard` blocked it: `[new-lock-package] @isaacs/nonrecursive-glob-match is new in the lockfile` (pulled in by minimatch 11 via `@typescript-eslint/typescript-estree` 8.73.0).
   - Final: started again from `main`'s `yarn.lock`, added the `^8.56.0` descriptor to the existing `typescript-eslint` 8.71.2 entry, then ran `yarn install`. One `typescript-eslint` copy (8.71.2, as on `main`), only `next`/`@next/*`/`eslint-config-next` versions change, no new lock package, guard clean.
3. Docs that state the pinned version: `CONTRIBUTING.md` (exact-version table), the engineering-standards stack table, and a spec changelog file.
4. Gate and tests — see below.

## Decisions

- Branch name `fix/security-next` follows P6 and the owner's comment instead of `fix/issue-454-…`.
- The `next` pin stays exact (P2); the "Moves when" column now also names P6.
- `typescript-eslint` stays on 8.71.2 instead of deduping up to 8.73.0: that avoids a new transitive package (guard, Ask First) and keeps lint results the same as on `main`.

## Commands and results

- `yarn npm audit --all --recursive --severity high` after the bump: only `zod` (GHSA-mrhx-c7xc-m3w5) left, handled on `fix/security-zod`.
- `yarn verify`: green (all 20 steps) on the final lockfile; earlier runs listed above.
- `yarn guard`: `No blocking findings.`
- Integration: `yarn test:integration:vereino --filter TEST-040` (club and section logos in `/backend`, `/club`, `/p`; the production build runs on Next 16.4.6): `2 passed (48.6s)`. CI runs the full suite in shards.

## Open problems / next steps

- `fix/security-zod` (zod 4.6.7) is the second PR of #454; after both merge, the `Security` workflow's `audit` job should be green.
- Upstream issues in `open-mercato` stay with the owner.
