# One-command idempotent installer (issue #5)

- **Date:** 2026-10-21
- **Agent / tool:** Claude Code (Opus 5.5), a side session started from the pipeline-setup session; skills `om-prepare-issue`, `om-fix`, `om-open-pr`, `om-code-review`
- **Trigger:** product owner. Brief (Polish): an installer run with `npm run setup` that performs the README "Getting started" steps, plus a README update that keeps the manual steps; re-runs must succeed and skip completed steps. Q1–Q3 defaults confirmed on #5: "I accept the defaults for Q1–Q3 from issue #5: Yarn stays the package manager, npm run setup is an entry point, it ends with yarn dev plus a --no-dev flag, and it starts postgres and redis via docker compose." Review fixes requested with "Fix the major and minor findings from the PR #6 review in the worktree, run yarn verify, and push to PR #6."
- **Spec / issue / branch:** issue [#5](https://github.com/wladku/Vereino/issues/5), PR [#6](https://github.com/wladku/Vereino/pull/6), branch `feat/issue-5-setup-installer` (from `origin/main`); standards S6.9, S13.6, S18
- **Status:** completed. The PR is open for human review and the `needs-qa` clean-clone check.

## Goal

`npm run setup` (or `yarn setup`) brings a clean clone to a running dev runtime. Running it again exits 0 and skips the completed steps. Before this change, a second `yarn setup` exited 1 because `mercato init` aborts when the database already has users.

## Steps

1. `om-prepare-issue`: no duplicate issue or PR was found. The standards spec covers this only partly (S18.1, S18.2, S6.9). Filed #5 with the labels `feature`, `priority-medium` and `risk-high`. The product owner confirmed Q1–Q3, which were recorded in the issue body and in a comment.
2. `om-fix`: claimed #5. The shared checkout was on `chore/agent-pipeline-setup` and another session was working in it, so I created a separate worktree at `C:\Users\wkuc\vereino-issue-5` from `origin/main` (`git worktree add -b feat/issue-5-setup-installer`). The installer, README, tests and tooling-glob changes are in that worktree.
3. Manual end-to-end check on the fresh worktree, `npm run setup -- --no-dev`:
   - first run: every step done, exit 0;
   - second run: dependencies, env, database and initialize skipped, exit 0.
4. `om-open-pr`: one signed-off commit, PR #6 opened ready against `main`, labels `review`, `feature`, `needs-qa`, `priority-medium`, `risk-high`, issue lock released. All six CI checks passed.
5. `om-code-review` on PR #6: request changes. The major finding was this missing run log. The minor findings:
   - every connection error was classified as "unreachable";
   - the probe had no connect timeout and no SSL parity with the CLI;
   - failures always exited with 1;
   - the install check looked only at the root `node_modules`;
   - S13.6 did not list the new script.
6. Review fixes in the worktree:
   - only "no answering server" codes and timeouts count as unreachable; any other connection error fails the step with the PostgreSQL code;
   - the probe connects with a 5 s timeout and the platform `getSslConfig` rule;
   - a failing child command's exit code is propagated;
   - every workspace `node_modules` is checked before the install is skipped;
   - S13.6 and its Changelog row are updated, and `--update-env` / `--no-update-env` are listed in the README;
   - this log.

## Decisions

- **The root `setup` runs a new app-owned script, `scripts/setup.mjs`.** I did not change the platform-owned `packages/app/scripts/dev.mjs`. The old workspace script stays reachable as `yarn workspace @vereino/app setup` and through `setup:classic` / `setup:reinstall*`, so the BC §7 names and flags are preserved.
- **The install-step check is a content hash, not modification times.** The hash covers `package.json`, `yarn.lock` and every workspace `package.json`, and is stored in `node_modules/.vereino-setup-install`.
- **The `initialize` skip mirrors the `mercato init` guard:** a `users` table with rows means the database is already initialized. `--reinstall` forces initialization.
- **Docker starts only when the local `DATABASE_URL` does not answer**, using `docker compose --env-file packages/app/.env up -d --wait postgres redis`. The compose file has healthchecks, so `--wait` returns once both services are healthy. A remote URL is never started.
- **The SSL rule is copied, not imported, from `@open-mercato/shared/lib/db/ssl`.** The platform function reads `process.env.DATABASE_URL`, while the installer inspects the URL from `.env` or from an override.
- **`generate` and `db:migrate` run on every pass.** Both are idempotent, and detecting whether they are needed would mean re-implementing the generator and the migrator.

## Files changed

- `scripts/setup.mjs` (new)
- `packages/app/scripts/__tests__/setup.test.mjs` (new)
- `package.json`: root `setup`
- `packages/app/package.json`: `test:scripts` coverage include
- `packages/app/scripts/vereino-format.mjs` and its test
- `packages/app/scripts/__tests__/coverage-scope.test.mjs`
- `README.md`
- `AGENTS.md`
- `.ai/specs/2026-10-21-engineering-standards-and-patterns.md`: S13.6 and Changelog
- this log

## Commands and results

- `yarn verify` before the PR: 13/13 passed.
- `yarn verify` during the review: 13/13 passed.
- `yarn verify` after the review fixes: 13/13 passed.
- `yarn test:scripts`: `scripts/setup.mjs` at 100 % lines, branches and functions. There are 36 setup tests after the review fixes.
- Real runs against the local PostgreSQL (a WSL-relayed server on `127.0.0.1:5432`, not a Docker container):
  - re-run: every completed step skipped, exit 0;
  - with `DATABASE_URL` pointing at a wrong password: `FAIL database PostgreSQL rejected the connection (28P01: password authentication failed for user "postgres")`, exit 1, `docker compose` not started.
- Node prints `[DEP0190] DeprecationWarning: Passing args to a child process with shell option true …` on Windows. This is the same `shell: process.platform === 'win32'` pattern as `scripts/verify.mjs`, and `yarn.cmd` cannot be spawned without a shell.

## Open problems

- The first manual run initialized a new `open-mercato` database, the default name in `.env.example`, in the product owner's local PostgreSQL, including example data and accounts. The `vereino` database used by the main checkout was not touched. Drop `open-mercato` if it is not wanted.
- `needs-qa`: a maintainer should run `npm run setup` twice on a clean clone of their own platform. The unit tests replace Docker, PostgreSQL and process calls with fakes.
- PR #4 (pipeline configuration) was merged into `build/e1-gate-and-ci`, not into `main`. This branch therefore does not carry `.ai/agentic.config.json`, `SDLC.md` or `CODE_REVIEW.md`.

## Next steps

- Human review and approval of PR #6 (S1.5), then merge.
