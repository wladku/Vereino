# Run: PR #643 — bring the branch up to date with its base and `main`

- **Goal and trigger:** cezar task (om-auto-fix-pr on PR #643, issue #564): GitHub reported the PR as `CONFLICTING` after later merges. Merge `main` in, no force-push or history rewrite, never merge the PR.
- **Issue / PR / branch:** #564 / #643 / `feat/issue-564-retention-sweep-follow-ups` (stacked on #563, base `feat/issue-471-anonymise-former-participants`), worked on a detached HEAD at `origin/feat/issue-564-retention-sweep-follow-ups` and pushed with `git push origin HEAD:feat/issue-564-retention-sweep-follow-ups`.

## Steps

1. The PR base `feat/issue-471-anonymise-former-participants` had moved on: a `main` merge (`35fb35be`), `f0643ab3` (people CLI commands throw on bad options instead of setting `process.exitCode`) and its run log. `main` had 31 commits the PR lacked.
2. Merged `origin/feat/issue-471-anonymise-former-participants` first, then `origin/main`. Git resolved both without textual conflicts; `packages/app/src/modules/people/cli.ts` was changed on both sides (base: every refusal throws; this PR: `retention-sweep` also refuses `--today` without `--dry-run`) and the result keeps both.
3. Checked the PR's own review threads: no reviews or comments to address.

## Decisions

- Merge the PR's base branch as well as `main`: the PR is judged against its base, so `main` alone would leave the base's newer commits out of the merge result.
- `life-cycle` now throws on invalid options (from the base, `f0643ab3`); its option check still accepts `--today` without `--dry-run`, as the shard 6/6 fix of 2026-11-22 left it.

## Commands and results

- `yarn install --immutable && yarn generate && yarn typecheck`: exit 0.
- `npx jest src/modules/people/lib/__tests__/retention-rules.test.ts`: 9 tests passed.
- `yarn lessons:check`: valid. `yarn guard`: no blocking findings.
- Integration (local, one id per run, on the merged tree):
  - `yarn test:integration:vereino --filter TEST-086`: 1 passed (49.1s)
  - `--filter TEST-L07` (`life-cycle --today` callers of the shared `cli.ts`): 3 passed (57.3s)

## Files changed

- Merge commits only, plus this log.

## Open problems / next steps

- #563 (the base) must merge first; then this PR retargets to `main`.
