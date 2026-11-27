# Issue #834: self-hosted CI runners for trusted events

- **Date:** 2026-11-26
- **Agent / tool:** Claude Code (Opus 5.5), `om-auto-fix-issue` in a Cezar run (task 7770a387)
- **Trigger:** the owner labelled #834 `cezar` (2026-11-26) and asked for the workflow change with `CI_SELF_HOSTED` off by default, the setup script and `docs/ops/ci-runners.md`; registering a runner, `sudo` and repository settings stay with the owner.
- **Spec / issue / branch:** #834 (no spec: CI infrastructure, `direct` route), branch `feat/issue-834-self-hosted-ci-runners`
- **Status:** completed

## Goal

Let the heavy CI jobs run on the factory server's self-hosted runners for trusted events only (push, same-repository PR), behind a repository variable that is off by default, with fork PRs and every other workflow on `ubuntu-latest`; ship the runner setup script and its runbook.

## Steps

1. Claimed #834 (assignee, `in-progress`, `🤖` claim comment naming this run), renamed the branch.
2. `.github/workflows/ci.yml`: one `runs-on` expression on `gate`, `integration-shard`, `browser-smoke`, `image-smoke`, `perf`; `changes`, the `integration` aggregator, `pr-title` and `dependency-review` stay hosted.
3. Made those jobs safe on a shared host: `browser-smoke` and `perf` start the ephemeral app on a free port (`findFreePort`) instead of 5001; Playwright's `--with-deps` only on hosted runners; Lighthouse gets Playwright's Chromium through `CHROME_PATH` on the factory runner.
4. `scripts/check-ci-runners.mjs` (`yarn ci-runners:check`, new step of `yarn verify`) with unit tests at 100 %.
5. `scripts/ci-runner-wait.mjs` (exit 1 when a `vereino-ci` job has waited 10 min or more) with unit tests at 100 %; ran it read-only against the repository: exit 0.
6. `scripts/ci-runner-setup.sh` (install/start/stop/status; only `bash -n` and the non-root refusal were run here, the owner runs it with sudo).
7. `docs/ops/ci-runners.md`, a "Where CI runs" paragraph in `SDLC.md` → "Validation gate", `CI_SELF_HOSTED` in `docs/ops/github-settings.md` (6b).
8. `yarn verify` (full).

## Decisions

- **Allow-list expression** (`event_name == 'push' || (event_name == 'pull_request' && same repository)`) instead of the issue's example `event_name != 'pull_request' || …`: the example would send `pull_request_target`, `workflow_run` or `issue_comment` events to the server if such a trigger were ever added to `ci.yml`.
- **The `integration` aggregator stays hosted** (implementation notes of #834): it only reads the shard results; keeping it off the runners saves a slot and a registration.
- **JIT runner configurations with a fine-grained token (Administration: write, this repository only)** instead of the registration token the issue mentions: a registration token expires after one hour, so an ephemeral runner could not re-register after its job. The token is readable by root only; the runner user receives only the single-use JIT configuration of its slot. The runbook explains it as an owner step.
- **One slice cap for runners and rootless Docker**: the slot units run in `user-<uid>.slice`, where the user's rootless Docker and its containers live, and one drop-in caps all of it (12 cores, 24 GB; Cezar's user service is capped at 96 GiB of 121 GB).
- **Runner groups**: `wladku` is a personal account; runner groups exist only for organizations, and a repository-level runner already serves only this repository. Documented.
- **AppArmor**: Ubuntu 26.04 here has `apparmor_restrict_unprivileged_userns=1`, so the script adds profiles allowing user namespaces for `rootlesskit` and for Chromium binaries under the runner's home.
- **Wait alert as a repository script**: the factory alerts job lives outside the repository (`~/vereino-alerts`), which this run does not touch; the runbook tells the owner how to wire `scripts/ci-runner-wait.mjs` into it.

## Files changed

- `.github/workflows/ci.yml`
- `scripts/check-ci-runners.mjs`, `packages/app/scripts/__tests__/check-ci-runners.test.mjs`
- `scripts/ci-runner-wait.mjs`, `packages/app/scripts/__tests__/ci-runner-wait.test.mjs`
- `scripts/ci-runner-setup.sh`
- `scripts/verify.mjs`, `package.json` (`ci-runners:check`)
- `docs/ops/ci-runners.md`, `docs/ops/github-settings.md`, `SDLC.md`
- this run log

## Commands and results

- `node --test --experimental-test-coverage … check-ci-runners.test.mjs`: 8 pass, 100 % lines/branches/functions.
- `node --test --experimental-test-coverage … ci-runner-wait.test.mjs`: 4 pass, 100 % lines/branches/functions.
- `yarn ci-runners:check`: `6 workflow(s); self-hosted runners only for trusted events in ci.yml`.
- `node scripts/ci-runner-wait.mjs`: `no vereino-ci job of wladku/Vereino has waited 10 min or more`, exit 0.
- `bash -n scripts/ci-runner-setup.sh`: ok; without root it prints `run as root` and exits 1.
- `yarn verify` (default heap): `lint` died in `@vereino/app` with `FATAL ERROR: Ineffective mark-compacts near heap limit Allocation failed - JavaScript heap out of memory` (exit 129) at Node's default 4 GB heap on this server; no file of this change is involved. `NODE_OPTIONS=--max-old-space-size=8192 yarn workspace @vereino/app lint`: 0 errors, 166 warnings (all pre-existing). The first run of `format:check` flagged `ci-runner-wait.test.mjs`; `yarn format` fixed it.
- `NODE_OPTIONS=--max-old-space-size=8192 yarn verify`: all 24 steps passed (final full run).
- The new start path of `browser-smoke`/`perf`: `findFreePort` gave 5683, `yarn test:integration:vereino:start --port 5683` started the app and `/login` answered on that port; stopped with SIGINT afterwards.

## Open problems

- The setup script has not run on the server: it needs root. The owner's first `install` is its real test; `status` shows what it built.
- No integration test is added or edited by this change. The fork rehearsal (step 6 of the runbook) and the one-week measurement are the owner's, after the switch.

## Next steps

Owner: steps 1–6 of `docs/ops/ci-runners.md`; one week after the switch, a run log with the new measurement.
