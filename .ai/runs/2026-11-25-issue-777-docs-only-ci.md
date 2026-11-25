# Run log — #777 docs-only PRs skip the heavy CI jobs

- **Trigger:** Cezar run (om-auto-fix-issue), issue #777 labelled `cezar`.
- **Spec:** `.ai/specs/2026-10-21-engineering-standards-and-patterns.md` S14.1 (CI) · `SDLC.md` "Validation gate".
- **Branch:** `ci/issue-777-docs-only-skip`.

## Goal

One CI run is 13 jobs and the plan runs 20 at once. On `pull_request` events a PR that changes documentation only
skips the integration shards, the browser-smoke work, `image-smoke` and `perf`; `gate` runs in full and the required
checks `integration` and `browser-smoke` still report success. Pushes (`main`, `merge-train/**`) run everything.

## Steps

1. Claimed #777 (assignee, `in-progress`, 🤖 claim comment naming this worktree and branch).
2. `scripts/ci-changes.mjs`: pure `isDocsPath` / `codeChanged`, `changedPaths` (`git diff --name-only --no-renames
   base...head`), `main` writing `code=true|false` to `$GITHUB_OUTPUT`. Unit tests in
   `packages/app/scripts/__tests__/ci-changes.test.mjs` (100 % lines/branches/functions).
3. `.github/workflows/ci.yml`: new job `changes` (checkout depth 2, setup-node, the script on `HEAD^1 HEAD` of the PR
   merge commit; `code=true` on push). `integration-shard`, `image-smoke`, `perf` need it and run only on
   `code == 'true'`. `integration` passes when shards succeeded, or when `changes` succeeded with `code=false` and the
   shards were skipped. `browser-smoke` needs `changes`, runs on `!cancelled()`, fails when `changes` did not succeed,
   and skips every work step on `code != 'true'`.
4. Test for the merge train: `checksState` is `success` for a docs-only rollup (required checks green, shards,
   image-smoke and perf skipped) in `merge-train-plan.test.mjs`.
5. Docs: `SDLC.md` "Validation gate", `docs/ops/github-settings.md`, spec S14.1 + changelog file.

## Decisions

- **No third-party action** (a new action is Ask First): the classification is a repository script on built-in Node.
- **Diff of the PR merge commit against its first parent** (`HEAD^1...HEAD`), the same base `yarn guard` uses in
  `gate`; checkout depth 2 is enough and the diff matches what would land on the current base.
- **Fail closed:** an empty diff counts as code; `--no-renames` lists both sides of a rename (a `.ts` renamed to `.md`
  is code); a failed `changes` job fails `integration` and `browser-smoke` instead of leaving them skipped — a skipped
  required check would satisfy the ruleset and the train (`checksState` counts `skipped` as passed).
- **Code wins over `**/*.md`** for `.github/**`, `scripts/**`, `.ai/harness/**` and `packages/*/.ai/qa/tests/**`, as
  the issue lists them as code.
- **`browser-smoke` keeps its job and skips steps** rather than a separate aggregate job: no extra runner slot on code PRs.
- Cost on a code PR: one extra short job (`changes`, ~15 s) in front of the shards.

## Commands and results

- `node --test --experimental-test-coverage --test-coverage-include=../../scripts/ci-changes.mjs
  scripts/__tests__/ci-changes.test.mjs scripts/__tests__/merge-train-plan.test.mjs` → 45 pass, ci-changes.mjs 100/100/100.
- `actionlint` v1.7.7 (temporary binary, not added to the repo) on `.github/workflows/ci.yml` → no findings.
- Dry run of `scripts/ci-changes.mjs` on commits of `main`: 7456ec26 (#724 specs) and d4caa260 (#745 ops docs) →
  `code=false`; efe9da9d (#772 qa fixture) and this branch's commit → `code=true`. A simulated PR merge commit (a
  throwaway shared clone: `SDLC.md` + `.ai/runs/x.md` merged `--no-ff` into `main`) with `HEAD^1 HEAD` → `code=false`.
  Over the last 60 commits of `main`, 9 are docs-only.
- `yarn verify` first run: failed at `format:check` (`ci-changes.test.mjs is not formatted`); `yarn format`, resumed
  `--from format:check` → all steps passed; then one full run → all 22 steps passed.
- `yarn guard --base origin/main` → no blocking findings; warning: `.github/workflows/ci.yml` agent rule file changed.

## Open problems / next steps

- The owner sees a docs-only PR's checks on the next docs PR; the PR body links the dry run.
