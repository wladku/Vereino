# A merge to main produces a release pull request with a changelog (E15-S03, #447)

- **Date:** 2026-11-21
- **Agent / tool:** Claude Code (claude-opus-5-5), om-auto-fix-issue, Cezar run 070e802b (step 1 of 3: build, draft PR)
- **Trigger:** Cezar automation on the `cezar` label of #447
- **Spec / issue / branch:** `.ai/specs/2026-10-21-engineering-standards-and-patterns.md` phase E2 slice (c) (ENG-12, ADR-021, ENG-TEST-21, ENG-AC-12 in part), #447, epic #442, branch `feat/issue-447-release-pr-changelog`
- **Status:** completed (draft PR; an independent reviewer marks it ready)

## Goal

release-please configuration for the monorepo root (first version `0.1.0`, changelog sections from Conventional Commits), `.github/workflows/release.yml` that opens or updates the release pull request on every push to `main` and tags on its merge, actions pinned by SHA, and a release pull request the merge train treats like any other.

## Steps

1. Claimed #447 (assignee, `in-progress`, `🤖` comment naming this worktree). Dependency #446 (E15-S02) is closed.
2. Read ENG-12, ADR-021, S14.1, `ci.yml`, `security.yml`, `merge-train.yml`, `scripts/merge-train-plan.mjs` and `docs/ops/github-settings.md`. Read release-please 17.6.0 (`npm pack`, outside the repository) for how it parses commits, matches its labels, sets the first version and handles drafts, and the action's v5.0.0 README and `src/index.ts` for permissions and outputs.
3. Wrote `release-please-config.json`, `.release-please-manifest.json`, `.github/workflows/release.yml`; section 7 of `docs/ops/github-settings.md` (setting and release procedure); `BACKWARD_COMPATIBILITY.md` no longer says the release workflow is missing; spec changelog file.
4. Pushed the branch and ran `npx release-please@17.6.0 release-pr --dry-run --target-branch feat/issue-447-release-pr-changelog` against `wladku/Vereino` (read-only).
5. `yarn verify`.

## Decisions

- **First version.** Manifest `".": "0.0.0"` plus `initial-version: 0.1.0`: release-please treats `0.0.0` as "never released" and proposes `0.1.0`, which matches every `package.json`. `include-component-in-tag: false` gives `v0.1.0` instead of `vereino-v0.1.0`. `bump-minor-pre-major: true` implements S6.10 (a breaking change bumps the minor version below 1.0.0).
- **One application version (ADR-021).** The four workspace `package.json` files are `extra-files`, so they move with the root. `yarn.lock` stores workspaces as `0.0.0-use.local`, so `yarn install --immutable` is unaffected.
- **Labels.** `documentation,priority-low,risk-low` are `extra-label`, not `label`: release-please finds the pull request to tag by requiring every `label` entry, so putting the SDLC labels there would make removing one break tagging. `autorelease: pending` stays the matching label.
- **CI and the merge train.** The issue said not to add a secret, so the workflow uses `GITHUB_TOKEN`, and GitHub starts no workflow for its pushes: the release pull request has no CI run. A non-draft pull request that is up to date with `main` and has no checks is `pending` for the train (`checksState`), and `planMergeTrain` then waits on it forever, which would stop every merge. So the release pull request is a draft (`draft-pull-request: true`, the train skips drafts), and a step after release-please turns an updated release pull request back into a draft. The owner starts CI by closing and reopening it, marks it ready when it is green, and the train merges it (`docs/ops/github-settings.md` section 7). The other option, giving release-please the existing `MERGE_TRAIN_TOKEN`, would run full CI on the release pull request after every merge to `main` and widen what that token is used for; that is the owner's call and is offered in the PR.
- **Title.** `chore: release ${version}` (no `(main)` scope, which is not an S1.3 scope); it passes `pr-title`.
- **Non-conventional titles (negative AC).** release-please 17.6.0 drops a commit it cannot parse (`commit.js`, `parseConventionalCommits`, debug log "commit could not be parsed") and has no option to list it. The dry run shows exactly that for 70+ old `Merge pull request …` commits, and the run still succeeds and opens the pull request. So "nothing fails" holds; "listed under Other" cannot be met with Conventional Commit sections. "Other" holds `refactor`, `test`, `build`, `ci` and `chore`. Reported in the PR as an open point for the owner.
- **Changelog format.** ADR-021 names Keep a Changelog with operator upgrade notes; release-please writes its own format, and breaking changes come from the `BREAKING CHANGE:` footer. Not changed in this slice.

## Files changed

- `release-please-config.json`, `.release-please-manifest.json` (new)
- `.github/workflows/release.yml` (new)
- `docs/ops/github-settings.md` (section 7 Release workflow; Verify becomes section 8)
- `BACKWARD_COMPATIBILITY.md` (evidence line, step 4 and checklist item about `CHANGELOG.md`)
- `.ai/specs/changelog/2026-10-21-engineering-standards-and-patterns/2026-11-21-issue-447-release-please.md`
- this run log

## Commands and results

- `npx release-please@17.6.0 release-pr --dry-run …` → exit 0; "Would open 1 pull requests", `title: chore: release 0.1.0`, `draft: true`, sections Features / Bug Fixes / Documentation / Other, 388 entries from 1321 commits, updates `package.json`, `packages/{app,core,db,ui}/package.json`, `CHANGELOG.md`, `.release-please-manifest.json`.
- `yarn spec-changelogs:check` → valid.
- `yarn verify` → exit 0, "all 18 step(s) passed" (build 63 s). `yarn lessons:check` → valid after the lesson was added.

## Open problems

- ENG-TEST-21 (tag `v0.1.0` and a `CHANGELOG.md` entry) needs the workflow on `main`, the Actions setting in section 7 and the owner merging the first release pull request.
- The owner turns on *Allow GitHub Actions to create and approve pull requests* before the first run, or the run fails.
- The first release pull request lists the whole history (no `bootstrap-sha`), as ENG-TEST-21 expects ("listing the E1 and E2 changes").

## Next steps

Independent review (step 2 of the Cezar chain), then the owner's settings and first release.
