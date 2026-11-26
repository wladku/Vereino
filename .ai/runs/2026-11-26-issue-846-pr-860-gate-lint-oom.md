# Run: PR #860 — gate failure at `lint` (heap OOM)

- **Trigger:** Cezar `om-auto-fix-pr` task: required check `gate` on PR #860 concluded FAILURE (run 45888758169, job 140145914686).
- **PR / issue / branch:** #860 (issue #846, task routed under #848), `test/issue-846-outline-session-axe-dark`, worked on a detached HEAD and pushed with `git push origin HEAD:test/issue-846-outline-session-axe-dark`.

## Steps

1. Read the failing `gate` log: `yarn verify` passed `generate`, `typecheck`, `typecheck:packages`, `typecheck:qa`, then `lint` (ESLint in `packages/app`, `eslint .`) died after 210 s with `FATAL ERROR: Ineffective mark-compacts near heap limit Allocation failed - JavaScript heap out of memory` at ~4,000 MB. ESLint reported only two pre-existing warnings, no errors.
2. Compared with other runs the same afternoon: the same OOM at `lint` failed run 45886976662 (#843, docs only) and run 45883790737 (#814); other PRs passed. Intermittent, and independent of the PR's diff.
3. Checked the PR's diff: one integration spec under `packages/app/.ai/qa/tests/training/`, a spec changelog file, a spec line and a run log. `npx eslint .ai/qa/tests/training/TEST-O05-outline-on-the-phone.spec.ts` reports "No files matching the pattern" — the app lint does not cover the edited file at all.
4. Found issue #874 (owner, 2026-11-26, `priority-high`, `cezar`): "ESLint in packages/app runs out of memory in the CI gate", with the fix (raise the `lint` heap like `build`/`typecheck`). No open PR for it yet.
5. Merged `origin/main` (ee5ddb2a) into the PR head: no conflicts.
6. Local checks on the merge result.

## Decisions

- **Do not fix the heap on this PR.** The cause is repository-wide and tracked by #874, which Cezar builds on its own PR; changing `packages/app/package.json` here would duplicate that work and conflict with it, and widen a test-only PR. The new push reruns CI; if `lint` hits the OOM again, the gate stays red until #874 lands, and that is the remaining gate.

## Commands and results

- `yarn install --immutable`: ok. `yarn generate`: ok.
- `yarn typecheck:qa`: ok.
- `yarn test:integration:vereino --filter TEST-O05`: `1 passed (1.2m)`.

## Open problems / next steps

- Lint OOM in the CI gate: #874.
