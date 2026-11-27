---
title: "A shard that dies in `playwright install --with-deps` with apt 'Unable to locate package fonts-…' is a runner-image fault, not the PR"
modules: ["platform"]
areas: ["testing"]
topics: ["ci", "playwright", "integration-tests", "flaky-infra"]
---

# A shard that dies in `playwright install --with-deps` with apt 'Unable to locate package fonts-…' is a runner-image fault, not the PR

**Context**: On PR #610 (2026-11-23, run 45106619691) `integration (shard 6/6)` failed after 1 min in the step "Install Playwright browser". The job had landed on an `ubuntu-latest` runner with the Ubuntu 26.04 (`resolute`) image, where apt has none of the font packages Playwright's dependency list names (`fonts-unifont`, `xfonts-cyrillic`, `fonts-freefont-ttf`, …), so `npx playwright install --with-deps chromium` exited with code 100. The other five shards of the same run, and every CI run before and after it, ran on the older image and passed. No test ran on shard 6.

**Problem**: The red required check looks like a failing PR, and the obvious reaction is to change the PR's code or tests. Nothing in the PR can fix it.

**Rule**: Read the failed step before touching code. When a shard fails in "Install Playwright browser" with apt `Unable to locate package`, classify it as infra: push the branch's next real commit (or rerun the failed job) and check that the new run's shards install the browser. If two consecutive runs hit it, the `ubuntu-latest` rollout has reached the repository: propose to the owner pinning `runs-on: ubuntu-24.04` for the jobs that run `playwright install --with-deps` (or a Playwright version that supports the new image) in a separate CI PR; never change `ci.yml` from a feature PR.

**Second cause (#889, 2026-11-27)**: the same step also died with `403 Forbidden` from `https://packages.microsoft.com/ubuntu/26.04/prod` and `E: The repository … is no longer signed` (PR #883, two consecutive runs, a different shard each time). That is the runner image's own Microsoft apt source, which Playwright does not need. Every `--with-deps` step in `ci.yml` (`integration-shard` on hosted runners, `browser-smoke`, `enterprise-overlay`) now deletes any `/etc/apt/sources.list.d` file naming `packages.microsoft.com` before installing, and the Playwright steps retry the install once. A new `--with-deps` or `apt-get` step in a workflow does the same.

**Applies to**: `.github/workflows/ci.yml` jobs `integration-shard` and `browser-smoke`; CI triage in `om-auto-fix-pr` runs.
