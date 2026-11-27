# Run: integration shards tolerate a 403 from the runner's Microsoft apt source (#889)

- **Trigger:** cezar task fba741f9 (`om-auto-fix-issue 889`), issue labelled `cezar` by the owner.
- **Issue / branch:** #889 / `fix/issue-889-integration-shards-apt-403`.
- **Spec:** none (`direct`: a CI fix).

## Steps

1. Claimed the issue (assignee, `in-progress`, 🤖 comment naming the worktree and branch).
2. Read `.github/workflows/ci.yml`: three steps run `apt-get update` through `--with-deps`: `integration-shard`
   "Install Playwright browser" (hosted runners only, `WITH_DEPS`), `browser-smoke` "Install agent-browser"
   (`sudo -n "$BIN" install --with-deps` when `doctor` fails) and `enterprise-overlay` "Install Playwright browser".
3. Each of them now deletes, before installing, every file in `/etc/apt/sources.list.d` that names
   `packages.microsoft.com` (`grep -rlF … || true` so no match passes under `bash -eo pipefail`, `xargs -r sudo rm -f`).
   The two Playwright steps also retry the install once after 20 s, like the `Install dependencies` steps. On a
   self-hosted runner (`WITH_DEPS` empty) nothing is deleted: it has no sudo and installs no system packages.
4. Lesson `ci-playwright-install-deps-fails-on-new-runner-image` extended with this second cause.

## Decisions

- Remove the source rather than only retry: a 403 from a mirror the job does not use is not transient by nature, and
  Playwright's dependencies come from the Ubuntu archive only. The retry covers transient Ubuntu-mirror failures.
- Matched by content (`packages.microsoft.com`), not by a file name, because the image may ship the source as
  `microsoft-prod.list` or as a deb822 `.sources` file.
- No test, check or gate step changed (acceptance of #889).

## Commands and results

- `python3 -c "import yaml; yaml.safe_load(open('.github/workflows/ci.yml'))"` → parses.
- Removal pipeline under `bash -eo pipefail`: on a directory holding `microsoft-prod.list` and `ubuntu.sources` it
  selects only `microsoft-prod.list`; on a missing directory and on this host (no Microsoft source) it selects nothing
  and exits 0.
- `yarn verify` → **all 24 steps passed** (incl. `ci-runners:check`, `build`).
- `yarn guard --base origin/main` → no blocking findings; one warning (`ci.yml` is an agent rule file; review it).
- No integration test is added or changed; the change is observable only on GitHub-hosted runners, so CI on the PR is
  the real check.

## Open problems / next steps

- None. If `ubuntu-latest` rolls to an image whose apt lacks Playwright's font packages, the first cause of the same
  lesson still applies (pin `ubuntu-24.04` in a separate CI PR).
