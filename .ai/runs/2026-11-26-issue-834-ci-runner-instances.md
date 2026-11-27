# Issue #834 / PR #835: one runner setup, several instances on one machine

- **Date:** 2026-11-26
- **Agent / tool:** Claude Code (Opus 5.5), `om-auto-fix-pr` in a Cezar run (task 0a9f4c3e)
- **Trigger:** the owner's comment on PR #835 (2026-11-26, "one machine, more than one repository"): make `scripts/ci-runner-setup.sh` reusable for more than one runner instance on the same machine.
- **Spec / issue / branch:** #834 (no spec, `direct` route), PR #835, branch `feat/issue-834-self-hosted-ci-runners` (worked on a detached HEAD, pushed with `git push origin HEAD:feat/issue-834-self-hosted-ci-runners`)
- **Status:** completed

## Goal

An `INSTANCE` parameter (default `vereino-ci`) from which the runner label, paths, token file, unit names, slice drop-in and AppArmor profile names derive, with the Vereino defaults byte-for-byte unchanged; separate subordinate ID ranges; `NODE_MAJOR` and `PLAYWRIGHT_VERSION` overrides; an isolation check; a runbook section. No other repository is named anywhere.

## Steps

1. Detached at `origin/feat/issue-834-self-hosted-ci-runners`, merged `origin/main` (no conflicts).
2. `scripts/ci-runner-setup.sh`: `INSTANCE`, `REPO_ROOT`, `SUBID_START`, `NODE_MAJOR`, `PLAYWRIGHT_VERSION`; `check_settings` (names, `REPO` required for any other instance); `next_subid_start` (first free 65536 block at or above 1000000 in `/etc/subuid` and `/etc/subgid`); `subid_overlaps` + `audit_subids`; `audit_homes` now also covers system users' homes under `/home` (the other instances); `node_major` / `playwright_version` (Playwright step skipped when neither the override nor the manifest exists); a `config` command (no root) printing what the settings resolve to; the script can be sourced without running a command.
3. AppArmor: the `rootlesskit` profile is written only when no other profile attaches to `/usr/bin/rootlesskit` (the factory server's Ubuntu ships one; two would conflict). Lesson `apparmor-one-profile-per-binary-rootlesskit`.
4. `scripts/check-ci-runners.mjs`: `checkSetupScript` fails `yarn ci-runners:check` when the setup script loses one of the isolation lines (home `0750`, run dir `0700`, token dir `0700`, `ProtectHome=tmpfs`, `BindPaths=$home`, the audits, per-instance subordinate IDs).
5. `scripts/ci-runner-wait.mjs`: `--label` (default `vereino-ci`) so another instance can be alerted on.
6. `docs/ops/ci-runners.md`: section "Another repository on the same machine" (variables, `config`, caps add up, isolation, alerts) and the isolation bullets.
7. Tests: new `packages/app/scripts/__tests__/ci-runner-setup.test.mjs` (sources the script in bash with stubs: defaults, derivation, validation, subordinate IDs, toolchain, rendered files, AppArmor skip, audits); `check-ci-runners` and `ci-runner-wait` tests extended.

## Decisions

- **Byte-for-byte defaults** were proven, not assumed: the units, helpers and AppArmor profiles rendered by the PR's previous script and by the new one with default settings (stubbed `systemctl`, `apparmor_parser`, uid 1234) are identical (`diff -r` of 8 files: no difference).
- **Subordinate ID floor 1000000**: keeps the Vereino range `1000000-1065535` on a host whose only entries are the usual `100000:65536` ones; a second instance gets `1065536-1131071`.
- **`REPO` required for another instance**: an instance that forgot `REPO` would otherwise register runners with its own label on this repository.
- **"Check it in check-ci-runners"**: `check-ci-runners` runs in CI and cannot see the server, so it checks the setup script's isolation lines statically; the server itself is checked by `install`/`status` (homes and subordinate ID ranges).

## Files changed

`scripts/ci-runner-setup.sh`, `scripts/check-ci-runners.mjs`, `scripts/ci-runner-wait.mjs`, `docs/ops/ci-runners.md`, `packages/app/scripts/__tests__/{ci-runner-setup,check-ci-runners,ci-runner-wait}.test.mjs`, `.ai/lessons/apparmor-one-profile-per-binary-rootlesskit.md`, this log.

## Commands and results

- `yarn test:scripts`: 687 tests pass; `check-ci-runners.mjs` and `ci-runner-wait.mjs` at 100 % lines, branches and functions.
- `node scripts/check-ci-runners.mjs`: `6 workflow(s); self-hosted runners only for trusted events in ci.yml; runner instances isolated`.
- `scripts/ci-runner-setup.sh config` (default and `INSTANCE=other-ci`): names as in the runbook table.
- `yarn guard`: no blocking findings (2 warnings for files of the original PR: `ci.yml`, `verify.mjs`).
- `yarn verify`: first run failed at `lint` with `FATAL ERROR: Ineffective mark-compacts near heap limit Allocation failed - JavaScript heap out of memory` (ESLint default heap on this host); `NODE_OPTIONS=--max-old-space-size=8192 yarn verify --from lint`: all 20 steps passed.
- Not run: `install`/`start` (root, owner only). No integration test changed or added.

## Open problems / next steps

- The owner runs `install` for a second instance; shellcheck is not installed on the factory server, so only `bash -n` and the sourced unit tests cover the script.
