---
title: "On the Cezar host, run Testcontainers through sg docker and prove browser steps in CI"
modules: ["platform"]
areas: ["testing"]
topics: ["integration-tests", "cezar", "docker", "playwright"]
---

# On the Cezar host, run Testcontainers through sg docker and prove browser steps in CI

**Context**: On #293 (2026-11-18) `yarn test:integration:vereino --filter TEST-C06` in a Cezar worktree first failed with "Could not find a working container runtime strategy": the Cezar session's process credentials do not include the `docker` group, although the account is listed in it (`getent group docker`). Under `sg docker -c "…"` Testcontainers started, but every browser test then failed at launch: `chrome-headless-shell: error while loading shared libraries: libatk-1.0.so.0` — the host has none of Chromium's system libraries.

**Problem**: Installing the libraries (`playwright install --with-deps`) or changing group membership is a system change an unattended run must not make, and a red local browser run says nothing about the change under test.

**Rule**: In a Cezar worktree run integration tests as `sg docker -c "yarn test:integration:vereino --filter <ID>"` (it uses the existing membership and changes nothing). When the host cannot launch Chromium, prove the API half locally with a temporary copy of the test that drops the `page` fixture (delete it before committing), and leave the browser steps to CI, which installs the browser with its dependencies (`ci.yml`, `playwright install --with-deps`). Say in the run log and the PR which steps ran locally and which only in CI.

**Applies to**: `yarn test:integration:vereino` in Cezar worktrees; any test using the Playwright `page` fixture.
