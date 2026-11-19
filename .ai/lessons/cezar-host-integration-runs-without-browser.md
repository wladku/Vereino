---
title: "On the Cezar host, run Testcontainers through sg docker; browser steps run locally since 2026-11-19"
modules: ["platform"]
areas: ["testing"]
topics: ["integration-tests", "cezar", "docker", "playwright"]
---

# On the Cezar host, run Testcontainers through sg docker; browser steps run locally since 2026-11-19

**Context**: On #293 (2026-11-18) `yarn test:integration:vereino --filter TEST-C06` in a Cezar worktree first failed with "Could not find a working container runtime strategy": the Cezar session's process credentials do not include the `docker` group, although the account is listed in it (`getent group docker`). Under `sg docker -c "…"` Testcontainers started, but every browser test then failed at launch: `chrome-headless-shell: error while loading shared libraries: libatk-1.0.so.0`, because the host had none of Chromium's system libraries. On 2026-11-19 the owner installed them (`npx playwright install-deps chromium`), and browser tests now pass locally (PR #401; lesson `cezar-host-integration-tests-docker-group-no-browser`).

**Problem**: Installing the libraries or changing group membership is a system change an unattended run must not make. Before the owner's install, the browser half could only be proved in CI.

**Rule**: In a Cezar worktree run integration tests as `sg docker -c "yarn test:integration:vereino --filter <ID>"` (it uses the existing membership and changes nothing). This runs the browser tests too: prove both halves locally and say so in the run log and the PR. Writing a spec as an API test with only the `request` fixture plus a browser test with its own setup (TEST-L16 on #311, TEST-L11 and TEST-L12 on #309) still lets `--filter <ID>` prove the API half alone. If Chromium cannot launch again, prove the API half locally, leave the browser steps to CI (`ci.yml`, `playwright install --with-deps`) and tell the owner. Never install the libraries from the run.

**Applies to**: `yarn test:integration:vereino` in Cezar worktrees; any test using the Playwright `page` fixture.
