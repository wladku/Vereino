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
  - [ ] Require status checks to pass, **Require branches to be up to date** — add: `gate`, `integration`, `browser-smoke`, `pr-title`, `DCO`. Do **not** add `perf` yet (advisory until the first member page, S7.6) or `dependency-review` (S14.3: findings are triaged before merge).
  - [ ] Block force pushes.

## 3. DCO app

- [ ] Install <https://github.com/apps/dco> for `wladku/Vereino` only. It reports the `DCO` check on every pull request (ADR-022).
- [ ] Every commit then needs `Signed-off-by:`; use `git commit -s`. Set a real name and e-mail first: `git config user.name` / `git config user.email`.

## 4. Dependency graph and code scanning

*Settings → Code security* (<https://github.com/wladku/Vereino/settings/security_analysis>)

- [ ] **Dependency graph — Enable.** Required by the `dependency-review` job; without it the job fails with "Dependency review is not supported on this repository. Please ensure that Dependency graph is enabled". Re-run the job afterwards.
- [ ] Code scanning → CodeQL analysis → Set up → **Default**. Languages: JavaScript/TypeScript; query suite: Default. High and critical alerts are fixed or triaged with a written reason before merge (S14.3).

## 5. Actions

*Settings → Actions → General*

- [ ] Allow all actions (third-party actions are pinned by commit SHA in the workflow, S14.2).
- [ ] Workflow permissions: **Read repository contents and packages permissions**.
- [ ] Fork pull request workflows: require approval for first-time contributors.

## 6. Verify (ENG-TEST-02)

Open three draft pull requests against `main` and confirm that each one cannot be merged, then close them:

1. a commit that makes `yarn verify` fail (for example a hard-coded string in a Vereino module once one exists, or an unformatted Vereino file);
2. a title that is not a Conventional Commit (`update stuff`);
3. a commit without `Signed-off-by:`.

Record the result (screenshots or links) in the E1 run log.

## Phase E2 settings (later)

Private vulnerability reporting, secret scanning with push protection, Dependabot alerts, the Renovate app and the release workflow are configured in phase E2 and will be added to this page then.
