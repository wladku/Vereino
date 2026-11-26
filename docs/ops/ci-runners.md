# Self-hosted CI runners on the factory server

The heavy CI jobs can run on the factory server (cezar-ws) instead of GitHub's 2-core hosted runners (#834). GitHub Free runs at most 20 jobs at once and one CI run is 13 jobs, so jobs waited a median 11.6 min for a runner and a CI run took a median 82 min (measured 2026-11-26). The factory server has 32 cores and runs at a load of about 1.4.

The switch is off until the owner turns it on, and it can be turned off at any time without a workflow change.

## What runs where

| Event | `gate`, `integration (shard N/6)`, `browser-smoke`, `image-smoke`, `perf` | Every other job |
|---|---|---|
| `push` to `main` or `merge-train/**`, with `CI_SELF_HOSTED=true` | self-hosted, label `vereino-ci` | `ubuntu-latest` |
| `pull_request` whose head branch is in `wladku/Vereino`, with `CI_SELF_HOSTED=true` | self-hosted, label `vereino-ci` | `ubuntu-latest` |
| `pull_request` from a fork | `ubuntu-latest` | `ubuntu-latest` |
| any other event (`pull_request_target`, `workflow_run`, `schedule`, …) and every other workflow | `ubuntu-latest` | `ubuntu-latest` |
| `CI_SELF_HOSTED` unset or anything but `true` | `ubuntu-latest` | `ubuntu-latest` |

Each of the five jobs in `.github/workflows/ci.yml` uses the same `runs-on` expression, an allow-list of trusted events:

```yaml
runs-on: ${{ vars.CI_SELF_HOSTED == 'true' && (github.event_name == 'push' || (github.event_name == 'pull_request' && github.event.pull_request.head.repo.full_name == github.repository)) && fromJSON('["self-hosted","vereino-ci"]') || 'ubuntu-latest' }}
```

`yarn ci-runners:check` (a step of `yarn verify`, `scripts/check-ci-runners.mjs`) fails when any workflow uses another runner value, when another workflow than `ci.yml` uses the expression, when one of the five jobs does not, when any other line names `self-hosted` or `vereino-ci`, or when `scripts/ci-runner-setup.sh` loses one of the lines that keep runner instances apart (see "Another repository on the same machine"). Required check names do not change, so the `main` ruleset and the merge train keep working.

Why fork PRs never reach the server: the repository is public (owner, 2026-11-26, #823), and a fork PR runs code nobody with write access has read. Only people with write access push to this repository, so a push or a same-repository PR runs code a maintainer or a maintainer's agent wrote.

What the jobs do differently on a self-hosted runner, so they work when several jobs share one host:

- `browser-smoke` and `perf` start the ephemeral app on a free port (`findFreePort` of `packages/app/scripts/vereino-ephemeral.mjs`) instead of 5001; the integration shards already did.
- No job uses `sudo`: Playwright installs Chromium without `--with-deps` (the setup installs the system libraries), and `perf` points Lighthouse at Playwright's Chromium (`CHROME_PATH`), because the server has no Google Chrome.
- Testcontainers, `image-smoke` and `docker build` use the runner user's rootless Docker (`DOCKER_HOST` in the runner's `.env`), never the system Docker socket.

## How the runners are isolated

`scripts/ci-runner-setup.sh` builds everything below; it is idempotent.

- **Dedicated user.** `vereino-ci` is a system user with no login shell, no sudo and no supplementary group (the script refuses to continue if it has one, the `docker` group above all). Its home is `0750`, and the runners' work directories (checkouts, Yarn cache, build output) live in it, so no other user, another runner instance's included, can read them.
- **Hidden homes.** Each runner slot runs with `ProtectHome=tmpfs` and its own home bound back in, `PrivateTmp=yes` and `ProtectSystem=full`: a job sees no other home (the owner's, `~/.cezar`, the Claude login, `~/vereino-alerts`, the sandboxes of the owner, Ola and Kacper). Rootless Docker runs outside those namespaces, so a job could mount into a container anything the `vereino-ci` user may read: every other home must be closed to "others" (`chmod o-rwx`). `install` and `status` audit this and print a warning for each open home: every home of a uid of 1000 or more, and every home under `/home` of a system user, which covers the other runner instances.
- **Rootless Docker.** The runner user's own Docker daemon (`dockerd-rootless-setuptool.sh`, package `docker-ce-rootless-extras`), with its own range of 65536 subordinate user and group IDs (the first free block at or above 1000000 in `/etc/subuid` and `/etc/subgid`; `install` and `status` warn when it overlaps another user's). Containers run in that user's user namespace and cannot reach the system Docker daemon, the sandbox containers (`vereino-sandbox-db`, `vereino-ola-db`, `vereino-kacper-db`) or their volumes. On Ubuntu, which denies unprivileged user namespaces to unconfined programs, the script adds two AppArmor profiles that allow them for `rootlesskit` and for the Chromium builds under the runner's home, and for nothing else. The `rootlesskit` profile is left out when another profile already attaches to `/usr/bin/rootlesskit` (recent Ubuntu releases ship one, and two profiles for one binary conflict).
- **Ephemeral runners.** Each slot asks GitHub for a just-in-time (JIT) runner configuration when it starts, runs exactly one job and exits; systemd starts it again with a new registration. Nothing of a job's runner registration survives the job. The token that asks for JIT configurations is readable by root only (`ExecStartPre=+` runs as root); the runner user gets only the single-use configuration of its own slot.
- **Repository only.** `wladku` is a personal account, and runner groups exist only for organizations: a runner registered on the repository is usable by this repository only, which is what a runner group limited to `wladku/Vereino` would give. If the repository moves to an organization, create a runner group limited to `wladku/Vereino`, put its id into `runner_group_id` of `jit-config` and rerun `install`.
- **Ports.** Jobs use 5001–5999 for the ephemeral app and random ports for containers; the sandboxes use 4200–4202, 5442, 6441 and 6442.

## Capacity

- **6 slots** (`SLOTS=6`, Q2 of #834): one CI run has 10 heavy jobs, so 6 run at once and 4 wait for a free slot, which takes minutes, not the half hour the hosted queue took. Raise it once the Cezar builds stay unaffected.
- **One cap for all of it.** The slots run in the runner user's slice (`user-<uid>.slice`), next to its rootless Docker and every container the jobs start. A drop-in on that slice caps them together: `CPUQuota=1200%` (12 of 32 cores), `MemoryHigh=20G`, `MemoryMax=24G`, `TasksMax=16384`. The Cezar service is limited to 96 GiB of the server's 121 GB, so CI and Cezar at their limits still fit, and the 5 parallel Cezar builds and the sandboxes keep their cores.
- Change a cap: rerun `sudo CPU_QUOTA=1600% MEMORY_MAX=32G scripts/ci-runner-setup.sh install` (each setting is an environment variable named in the script's header).
- **Disk.** `vereino-ci-prune.timer` removes Docker images, containers and build cache older than two days, every day at 04:30. The Yarn cache stays in the runner user's home, so repeated installs read it from disk.

## Another repository on the same machine

`wladku` is a personal account, so GitHub registers runners per repository: a second repository needs its own runner instance. `scripts/ci-runner-setup.sh` builds one instance per `INSTANCE` (default `vereino-ci`, which is everything above), and every name comes from it:

| `INSTANCE=<name>` gives | |
|---|---|
| user and home | `<name>`, `/home/<name>` (`0750`; `CI_USER` overrides the user name) |
| runner label | `self-hosted`, `Linux`, `X64`, `<name>` |
| paths | `/opt/<name>`, `/usr/local/libexec/<name>`, `/run/<name>` |
| GitHub token | `/etc/<name>/github-token` (`TOKEN_FILE` overrides it) |
| systemd | `<name>-runner@<n>.service`, `<name>-prune.timer`, caps in `user-<uid>.slice.d/50-<name>.conf` |
| AppArmor | `<name>-rootlesskit`, `<name>-browsers` |
| subordinate IDs | the next free 65536 block (`SUBID_START` sets the first ID) |

Set for the other instance, from this checkout:

```bash
export INSTANCE=<name> REPO=<owner>/<repository>   # REPO is required for any INSTANCE but vereino-ci
export REPO_ROOT=<checkout of that repository>      # or NODE_MAJOR=<major> and PLAYWRIGHT_VERSION=<x.y.z>
export SLOTS=2 CPU_QUOTA=400% MEMORY_HIGH=6G MEMORY_MAX=8G
scripts/ci-runner-setup.sh config                   # prints every name and version; changes nothing
sudo -E scripts/ci-runner-setup.sh install          # then the token, start and status, as in the owner steps below
```

- **Toolchain.** Node comes from `$REPO_ROOT/.nvmrc` unless `NODE_MAJOR` is set; Playwright's browser libraries come from `@playwright/test` in `$REPO_ROOT/packages/app/package.json` unless `PLAYWRIGHT_VERSION` is set, and are skipped when neither exists.
- **Token.** A fine-grained token limited to that repository, in that instance's token file; never reuse this repository's token.
- **Workflows.** That repository's jobs ask for `runs-on: [self-hosted, <name>]`, behind its own guard against untrusted events (as in "What runs where").
- **Caps add up.** Every instance has its own slice, its own CPU and memory caps and its own prune timer. Keep the sum of every instance's `CPU_QUOTA` and `MEMORY_MAX` below what the machine has left after the Cezar service (96 GiB) and its parallel builds; with the Vereino caps (12 cores, 24 GiB) that leaves little room, so lower the caps of both instances before adding slots.
- **Isolation.** Each instance's user cannot read another instance's home or work directories (homes are `0750`, and each slot sees only its own home). `status` of any instance audits every home and its own subordinate ID range; `yarn ci-runners:check` fails when the setup script loses one of the lines that keep instances apart.
- **Alerts.** `node scripts/ci-runner-wait.mjs --repo <owner>/<repository> --label <name>` checks that instance's waiting jobs.
- Every command takes the same variables: `sudo -E scripts/ci-runner-setup.sh status|start|stop` acts on that instance only.

## Owner steps

The agents wrote the workflow change, the script and this runbook; they never run `sudo`, register a runner or change repository settings. These steps are the owner's.

### 1. Install (once, and after a change to the script, `.nvmrc` or the Playwright version)

On the factory server, from an up-to-date checkout of `main`:

```bash
sudo scripts/ci-runner-setup.sh install
sudo scripts/ci-runner-setup.sh status
```

`status` lists the slots (none running yet), the slice's caps, `rootless docker: [name=seccomp,… name=rootless …]` and the home-directory audit. Close every home it warns about (`sudo chmod o-rwx /home/<user>`).

### 2. The GitHub token

The slots register themselves, so the server needs a credential that may create runners. A registration token from the web UI expires after one hour and cannot re-register an ephemeral runner after each job; a fine-grained personal access token can:

1. GitHub → *Settings → Developer settings → Fine-grained tokens → Generate new token*: resource owner `wladku`, repository access **Only select repositories → `wladku/Vereino`**, repository permission **Administration: Read and write** (nothing else), an expiry you will renew.
2. On the server, without leaving it in the shell history:

   ```bash
   sudo install -m 0600 -o root -g root /dev/null /etc/vereino-ci/github-token
   sudo editor /etc/vereino-ci/github-token   # paste the token, save
   ```

The token stays readable by root only. Before it expires, replace the file; running slots pick it up at their next registration.

### 3. Start the runners

```bash
sudo scripts/ci-runner-setup.sh start
```

Within a minute, *Settings → Actions → Runners* lists 6 idle runners named `<host>-<slot>-<epoch>` with the labels `self-hosted`, `Linux`, `X64` and `vereino-ci`. If none appears: `journalctl -u 'vereino-ci-runner@1' -n 50`.

### 4. Switch CI over

*Settings → Secrets and variables → Actions → Variables → New repository variable*: `CI_SELF_HOSTED` = `true`. The next CI run sends its heavy jobs to the runners; open a job's log and check *Set up job* names a runner `<host>-<slot>-…`.

### 5. Alert on waiting jobs

GitHub never moves a job to another runner: while no `vereino-ci` runner is online, the job waits, for up to 24 hours. `scripts/ci-runner-wait.mjs` lists the queued jobs that ask for `vereino-ci` and have waited 10 minutes or more, and exits 1 when there is one (0 when none, 2 when GitHub could not be read):

```bash
node scripts/ci-runner-wait.mjs            # --minutes 10 and --repo wladku/Vereino by default
```

Add it to the factory alerts job (`~/vereino-alerts`, every 10 minutes) so an exit code 1 mails the owner its output. It reads GitHub with the caller's `gh` login and needs read access to Actions only.

### 6. Rehearsal (with #823)

From a fork account, open a pull request that changes any file but documentation. In its CI run every job's *Set up job* log names a GitHub-hosted runner (`GitHub Actions N`), and the runner list shows no busy `vereino-ci` runner during the run.

## Turning it off

1. Delete the repository variable `CI_SELF_HOSTED` (or set it to anything but `true`). Every job of every new run goes to `ubuntu-latest`, no slower than before #834. Runs already queued for `vereino-ci` still wait: cancel and rerun them.
2. Optionally stop the slots: `sudo scripts/ci-runner-setup.sh stop`. GitHub removes the offline ephemeral registrations by itself.

Never stop the slots while the variable is still `true`: every heavy job would wait for up to 24 hours.

## Evidence

One week after the switch, a run log under `.ai/runs/` repeats the measurement of #834 over 24 hours: CI run wall time (median, max), job wait for a runner (median, p90, max) and integration shard time (median, max), without host details. Target: a median CI run of 30 minutes or less and a median job wait under 1 minute. If the median wall time does not improve by at least 40 % (82 → 49 min or less), turn the switch off as above and revert #834.

## Open choices

- **Separate VM per runner** (Q3 of #834): stronger isolation than rootless Docker, more setup. Revisit when the repository gets outside contributors with write access.
- **More slots**: raise `SLOTS` and the caps together when the Cezar builds stay unaffected.
