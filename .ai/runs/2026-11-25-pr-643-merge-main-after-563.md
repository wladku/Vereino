# Run: PR #643 — merge `main` after its base #563 was squash-merged

- **Goal and trigger:** cezar task (om-auto-fix-pr on PR #643, issue #564). #563 (base branch `feat/issue-471-anonymise-former-participants`) was squash-merged into `main` on 2026-11-24 as `5e9791d0`; the PR was retargeted to `main` and GitHub reported it `CONFLICTING`. Merge `origin/main` in, keep `main`'s version of the #563 changes, test, push without force; never merge the PR.
- **Issue / PR / branch:** #564 / #643 / `feat/issue-564-retention-sweep-follow-ups`, worked on a detached HEAD at `origin/feat/issue-564-retention-sweep-follow-ups`, pushed with `git push origin HEAD:feat/issue-564-retention-sweep-follow-ups`.

## Steps

1. `git merge origin/main` conflicted in 12 files (`people/cli.ts`, `commands/erasure.ts`, `data/validators.ts`, `lib/retention-rules.ts` and its test, `services/club-setup.ts`, `services/retention-sweep.ts`, `workers/retention-sweep.ts`, `club_core/data/entities.ts`, `people/README.md`, `docs/ops/deploy.md`, `TEST-086`): the squash commit re-adds every #563 file the PR branch already had through merge commits, so git saw add/add and both-modified hunks.
2. Rebuilt the PR's own diff instead of resolving hunk by hunk: the PR last merged #563 at `2ce47dec` and `main` at `52433372`; `git merge-tree --write-tree 2ce47dec 52433372` (clean) gives the tree "#563 + that main" (`a4c146c7`), and `git diff a4c146c7 <PR head>` is the PR's own change (14 files, +306/−39).
3. In the merge, took `origin/main` for every path (this keeps `main`'s squash of #563 and all later `main` work), then `git apply --3way` of the PR's own diff: all 14 files applied cleanly.
4. Checked the result: `git diff origin/main` of the merge tree under `packages/app/src` is byte-identical to the PR's own diff — the merge adds exactly the PR's change on top of `main`.

## Decisions

- Replay the PR's own diff onto `main` rather than hand-resolve the conflicts: the conflicts were all between #563 as merged into this branch and #563 as squashed (plus newer `main`), so `main` wins there by definition, and the replay proves nothing of the PR was lost or doubled.

## Commands and results

- `yarn generate && yarn typecheck`: exit 0.
- `yarn workspace @vereino/app test` (jest with coverage): 156 suites, 1980 tests passed.
- `yarn lessons:check`, `yarn spec-changelogs:check`: valid.
- Integration (local, one id per run, on the merged tree):
  - `yarn test:integration:vereino --filter TEST-086`: 1 passed (53.7s)
  - `--filter TEST-L07` (`life-cycle --today` callers of the shared `cli.ts`): 3 passed (1.0m)

## Files changed

- Merge commit only, plus this log.

## Open problems / next steps

- None from the merge; the PR goes back to review and CI.
