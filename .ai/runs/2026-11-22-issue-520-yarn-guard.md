# Run: issue #520 — `yarn guard` blocks weakened tests, new dependencies and secrets in every PR

- **Trigger:** Cezar task (issue labelled `cezar`), skill `om-auto-fix-issue 520`.
- **Issue / branch:** #520 (epic #442, depends on #511, merged as c16ce7a8) / `feat/issue-520-yarn-guard-blocks-weakened-tests`.
- **Approval:** the issue records the owner decision of 2026-11-20 (build the guard as described, no new dependency, rule-file changes warn only). The `guard-approved` label already existed.

## Steps

1. Claimed #520 (assignee, `in-progress`, `🤖` claim comment naming this run's worktree and branch).
2. Read `scripts/check-secrets.mjs` (#511), `scripts/verify.mjs`, the `test:scripts` coverage convention, `packages/app/jest.config.cjs`, the CI `gate` job, the CI failure ledger's quarantine text and SDLC.md "Validation gate".
3. Wrote `scripts/guard.mjs` (plain Node, no dependency) and `packages/app/scripts/__tests__/guard.test.mjs` (pure-rule tests plus end-to-end runs against throwaway git repositories with a stubbed `gh`).
4. Wired `yarn guard` (root `package.json`), a `Guard` step in the CI `gate` job after `yarn verify`, a Never rule in `AGENTS.md`, a paragraph in SDLC.md "Validation gate", and the exact quarantine comment format in the ledger's quarantine issue text.
5. Ran `yarn guard` on the branch, checked each acceptance case by hand, ran `yarn verify`.

## Decisions

- **Base of the diff.** Locally: `git merge-base origin/main HEAD`, diffed against the working tree. In CI the checkout is the PR merge commit, so `--base HEAD^1` (its first parent is the base tip) with `fetch-depth: 2` gives the same diff without fetching the whole history. On a push to `main`, `--base HEAD` gives an empty diff.
- **Labels read live, not from the event payload.** The merge train labels a failed PR `merge-train-failed` until a green rerun; reading the labels through `gh pr view` when the job runs means the owner adds `guard-approved` and reruns `gate`, without a `labeled` trigger that would rerun every integration shard on each label change. The job gets `issues: read` and `pull-requests: read` for that and for the quarantine issue lookup.
- **Test markers only in test files** (`__tests__/`, `*.test|spec|e2e.*`, `.ai/qa/tests/`), so docs and the guard's own source can name them. A test moved to another test path is not "renamed away".
- **Coverage rule** covers the Jest config and `package.json` scripts (the `--test-coverage-*` flags of `test:scripts`): a lowered or removed threshold, a new `--test-coverage-exclude`, a new negated `collectCoverageFrom` glob, a new entry in `coveragePathIgnorePatterns` / `testPathIgnorePatterns` / `modulePathIgnorePatterns`.
- **Dependencies:** a new key in `dependencies`, `devDependencies`, `optionalDependencies` or `resolutions`; a version change is not flagged (Renovate). In `yarn.lock` a package name absent from the base lockfile is flagged, so a bump that pulls in a new transitive package needs `guard-approved` too, as the issue asks.
- **Quarantine lookup failure** (no `gh`, no auth) counts as not quarantined: the guard fails closed.
- The guard's own test file builds every marker from parts so the PR passes its own guard.

## Results

- `node --test … guard.test.mjs`: 26 tests pass; `yarn test:scripts`: 445 pass, `guard.mjs` 100 % lines/branches/functions.
- `yarn guard` on this branch: no blocking findings; warnings for `.github/workflows/ci.yml`, `AGENTS.md`, `scripts/guard.mjs`.
- Acceptance checks: see the PR body.
- `yarn verify`: see the PR body.

## Open problems / next steps

- The first PR after merge shows the guard in the `gate` job summary; the owner checks one blocked/approved round trip in CI.
