---
title: "On the cezar host run integration tests under `sg docker`, and keep API checks in a file without `page`"
modules: ["platform", "payments"]
areas: ["testing"]
topics: ["integration-tests", "cezar", "testcontainers", "playwright"]
---

# On the cezar host run integration tests under `sg docker`, and keep API checks in a file without `page`

**Context**: #302 (2026-11-18). `yarn test:integration:vereino --filter TEST-C15` in a cezar run failed first with `Could not find a working container runtime strategy`. The user is in the `docker` group, but the headless cezar process started without it, so `/var/run/docker.sock` refused it. Under `sg docker -c "…"` the containers started. Then every test that takes the `page` fixture failed before its first line: `chrome-headless-shell: error while loading shared libraries: libatk-1.0.so.0`. The host has no browser system libraries.

**Problem**: A test that mixes API checks with one browser check cannot prove anything on that host, because Playwright launches the browser for any test that asks for `page`. Installing system libraries or changing group membership is a system change an unattended run must not make.

**Rule**: In a cezar run, start the integration runner as `sg docker -c "yarn test:integration:vereino --filter <ID>"`; this changes no system setting. Put a story's API checks in their own spec file that does not take `page`, and its browser checks in a second file (`…-ui.spec.ts`). `--filter` matches the file path, so the API file can run on its own. Report that the UI file was not run locally and leave it to CI. Never install packages or edit groups to make the browser start.

**Applies to**: `packages/app/.ai/qa/tests/**`, `yarn test:integration:vereino`, unattended cezar runs on the workstation host.
