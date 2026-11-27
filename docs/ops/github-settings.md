# GitHub repository settings

Settings of `github.com/wladku/Vereino` that enforce the engineering standards (`.ai/specs/2026-10-21-engineering-standards-and-patterns.md`, S1, S14, ADR-015, ADR-022). The product owner applies them in the GitHub web UI (ENG-Q-02); they are not stored in the repository, so this page is their record. Re-check them after any change to `.github/workflows/ci.yml` job names.

## Before you start

The required checks appear in the ruleset picker only after they have run once. Push the E1 branch and open its pull request first, wait for the CI run, then do step 2.

## 1. Pull request merge options

*Settings → General → Pull Requests*

- [ ] Allow squash merging — on; default commit message: **Pull request title** (release-please reads it, S1.4).
- [ ] Allow merge commits — off.
- [ ] Allow rebase merging — off.
- [ ] Always suggest updating pull request branches — on.
- [ ] Automatically delete head branches — on.

## 2. Ruleset for `main`

*Settings → Rules → Rulesets → New branch ruleset*

- Name `main`, enforcement **Active**, target branch: default branch.
- Bypass list: **empty** (administrators included, S1.1). The only exception is the break-glass procedure in S1.8, which temporarily removes a check and is recorded in a run log.
- Rules:
  - [ ] Restrict deletions.
  - [ ] Require linear history.
  - [ ] Require a pull request before merging — required approvals **0** for now; allowed merge method **Squash**.
    - [ ] Require review from Code Owners — turn on only after the second maintainer's handle is in `.github/CODEOWNERS` (a sole owner cannot approve their own pull request).
  - [ ] Require status checks to pass — add `gate`, `integration`, `browser-smoke` with source **GitHub Actions** (checked against the live ruleset 2026-11-24, ruleset 26707580; ENG-AC-02 as amended by the owner on 2026-11-24, #576). The merge train reads this list to decide when a PR or a batch is green, so a check outside it never holds the train. On a docs-only PR `integration` and `browser-smoke` still run and report success while the shards and the browser work are skipped (#777, SDLC.md "Validation gate"), so the list needs no change for them; never add the shard checks `integration (shard N/6)`, which a docs-only PR skips. Do **not** add `perf` (advisory, S7.6), `dependency-review` (S14.3: findings are triaged before merge), `pr-title` (runs on every PR, advisory) or `DCO` (not required: the CLA of D-035, #648, covers outside contributions).
    - **One-PR train** (`MERGE_TRAIN_BATCH_SIZE` unset or `1`): **Require branches to be up to date before merging** — on.
    - **Batch train** (`MERGE_TRAIN_BATCH_SIZE` `2`–`8`, `.ai/specs/2026-11-18-batch-merge-train.md`): **Require branches to be up to date before merging** — off, and a fourth required check **`merge-train/verified`** with source **any source** (the train sets it as a commit status with `MERGE_TRAIN_TOKEN`, not as a GitHub Actions check). The train ignores `merge-train/verified` when it judges a head and sets it itself right before each merge, in both modes. Switch-on, checks and rollback in their safe order: `docs/ops/batch-train-switch-on.md`.
  - [ ] Block force pushes.

Live state, read 2026-11-24 (#576): the ruleset `main: merge only when up to date and green` (id 26707580) holds only the status-check rule above (`gate`, `integration`, `browser-smoke`, strict, empty bypass list). Restrict deletions, linear history, the pull request requirement and the force-push block are not in it; squash-only merging comes from section 1. Applying them is the owner's call.

## 3. DCO app (optional)

DCO is not a required check (ENG-AC-02, owner decision on #576), and the app is not installed (checked 2026-11-24: no `DCO` check runs on pull requests). Commits are still signed off by project rule (`git commit -s`, `CONTRIBUTING.md`).

- [ ] Optional: install <https://github.com/apps/dco> for `wladku/Vereino` only to report an advisory `DCO` check (ADR-022). Do not add it to the ruleset.
- [ ] Set a real name and e-mail for the sign-off: `git config user.name` / `git config user.email`.

## 4. Dependency graph and code scanning

*Settings → Code security* (<https://github.com/wladku/Vereino/settings/security_analysis>)

- [ ] **Dependency graph — Enable.** Required by the `dependency-review` job; without it the job fails with "Dependency review is not supported on this repository. Please ensure that Dependency graph is enabled". Re-run the job afterwards.
- [ ] Code scanning → CodeQL analysis → Set up → **Default**. Languages: JavaScript/TypeScript; query suite: Default. High and critical alerts are fixed or triaged with a written reason before merge (S14.3).

## 5. Actions

*Settings → Actions → General*

- [ ] Allow all actions (third-party actions are pinned by commit SHA in the workflow, S14.2).
- [ ] Workflow permissions: **Read repository contents and packages permissions**.
- [ ] Fork pull request workflows: require approval for first-time contributors.

## 6. Merge train token

*Settings → Secrets and variables → Actions → `MERGE_TRAIN_TOKEN`* (`.github/workflows/merge-train.yml`, SDLC.md "Validation gate")

- [ ] A fine-grained token of the owner for `wladku/Vereino` only, with **Contents**, **Pull requests**, **Issues**, **Commit statuses** and **Workflows** read and write. Pull requests write covers labels and comments on PRs; adding a label to an issue (the train mirrors `merge-train-failed` / `merge-train-conflict` onto the issue named by `issue-N` in the PR's branch) and opening the `merge-train-paused` issue need **Issues** write. **Commit statuses** write sets `merge-train/verified` (before every merge once the ruleset requires it) and `merge-train/verdict` (a PR that broke a batch alone); without it such a run fails before it merges anything.
- [ ] Changing a permission of an existing fine-grained token (*Settings → Developer settings → Personal access tokens → Fine-grained tokens → the token → Edit*) keeps the token value, so the secret needs no new value; only **Regenerate token** issues a new value, which then goes into the secret.

## 6a. Merge train variables

*Settings → Secrets and variables → Actions → Variables* (<https://github.com/wladku/Vereino/settings/variables/actions>)

- `MERGE_TRAIN_BATCH_SIZE` — unset (or `1`): the one-PR train; `2`–`8`: the batch train (an invalid value means `1`). Set together with the ruleset of section 2 in the order of `docs/ops/batch-train-switch-on.md`.
- `MERGE_TRAIN_SKIP_LABELS` — optional, comma-separated; replaces the default skip labels.
- `MERGE_TRAIN_REQUIRED_CHECKS` — leave unset on this repository (the train then reads the ruleset). Only a repository without rulesets, such as the rehearsal repository, sets it.

## 6b. Self-hosted CI runners

- `CI_SELF_HOSTED` — unset by default: every CI job runs on `ubuntu-latest`. `true` sends the heavy jobs of trusted events to the factory server's `vereino-ci` runners; set it only while the runners are online, and delete it to fall back. Setup, token, switch-on and rollback: `docs/ops/ci-runners.md` (#834).

## 7. Release workflow

*Settings → Actions → General → Workflow permissions* (`.github/workflows/release.yml`, ADR-021, ENG-12)

- [ ] **Allow GitHub Actions to create and approve pull requests — on.** release-please opens the release pull request with the workflow's own `GITHUB_TOKEN`; without this setting its run fails with "GitHub Actions is not permitted to create or approve pull requests". The default token permission stays read-only (section 5): the workflow asks for `contents`, `issues` and `pull-requests` write in its own job.
- No secret. The release pull request is written with `GITHUB_TOKEN`, and GitHub starts no workflow for a push made with that token, so the release pull request has **no CI run** of its own. The workflow keeps it a draft (the merge train skips drafts) and turns it back into a draft whenever release-please updates it.

**Cutting a release** (the owner decides when; there is no fixed cadence):

1. Open the pull request titled `chore: release X.Y.Z` (labels `autorelease: pending`, `documentation`, `priority-low`, `risk-low`) and read the version and the `CHANGELOG.md` section it proposes.
2. **Close and reopen** it. A reopen by a person starts CI on its head.
3. When `gate`, `integration` and `browser-smoke` are green, mark it **Ready for review**. The merge train merges it like any other pull request.
4. The `Release` run on the merge commit creates the tag `vX.Y.Z` and the GitHub release, and relabels the pull request `autorelease: tagged`.

If a pull request merges between steps 2 and 3, release-please rewrites the release pull request and the workflow makes it a draft again: start over at step 2. Never remove the `autorelease: pending` label: release-please finds the release pull request to tag by it. `DCO` reports a failure on the release commits (the bot does not sign off); it is not a required check.

## 8. Verify (ENG-TEST-02)

1. Read the live ruleset as the administrator: `gh api repos/wladku/Vereino/rulesets` for its id, then `gh api repos/wladku/Vereino/rulesets/<id>`. Expect `enforcement: active`, target `~DEFAULT_BRANCH`, required checks exactly `gate`, `integration`, `browser-smoke`, `strict_required_status_checks_policy: true`, `bypass_actors: []` and `current_user_can_bypass: never`.
2. Open a throwaway pull request (not a draft, which reports `DRAFT` instead of its merge state, and without labels, so the merge train skips it) whose commit fails a required check, for example a type error in `packages/core/src`. Once `gate` is red, `gh pr view <n> --json mergeStateStatus` reports `BLOCKED`. Never try to merge it; close it unmerged and delete its branch.

Record the result in a run log. Last recorded 2026-11-24 in `.ai/runs/2026-11-24-issue-576-branch-ruleset-criterion.md` (#576).

## 9. Security settings (phase E2)

*Settings → Code security* (<https://github.com/wladku/Vereino/settings/security_analysis>) — enabled by the owner, checked 2026-11-20 (ENG-AC-13, S8.10, S17.6):

- [x] Secret scanning — on, with **Push protection** on.
- [x] Private vulnerability reporting — on (`SECURITY.md` and the issue template config point reporters to it).
- [x] Dependabot alerts — on. Dependabot security-update pull requests stay off: Renovate owns dependency updates.

Secret scanning only knows provider token formats (Stripe, GitHub, AWS …). Its generic patterns (passwords, private keys, connection strings) are not available for a user-owned repository, so the `yarn verify` step `secrets:check` (`scripts/check-secrets.mjs`) covers them, plus e-mail addresses outside reserved example/test domains. Known false positives go into `scripts/secrets-allowlist.json` with a reason.

## Phase E2 settings (later)

The Renovate app is configured in phase E2 and will be added to this page then. The release workflow is section 7.
