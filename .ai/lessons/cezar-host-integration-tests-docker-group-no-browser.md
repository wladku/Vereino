---
title: "On the cezar host run integration tests, browser tests included, under `sg docker`"
modules: ["platform", "payments"]
areas: ["testing"]
topics: ["integration-tests", "cezar", "testcontainers", "playwright"]
---

# On the cezar host run integration tests, browser tests included, under `sg docker`

**Context**: #302 (2026-11-18). `yarn test:integration:vereino --filter TEST-C15` in a cezar run failed first with `Could not find a working container runtime strategy`. The user is in the `docker` group, but the headless cezar process started without it, so `/var/run/docker.sock` refused it. Under `sg docker -c "…"` the containers started. Then every test that takes the `page` fixture failed before its first line: `chrome-headless-shell: error while loading shared libraries: libatk-1.0.so.0`, because the host had no browser system libraries. On 2026-11-19 the owner installed them (`npx playwright install-deps chromium` in `packages/app`). The same day, on the merge of PR #401, `TEST-C15-online-payment-tab-ui`, `E07-S01` and `TEST-C14` passed locally in Chromium under `sg docker`.

**Problem**: The rule of 2026-11-18 left every browser test to CI. That made CI the first browser run of new UI tests and cost a CI round per locator or axe fix (#401 needed one). The `docker` group is still missing from the cezar process.

**Rule**: In a cezar run, start the integration runner as `sg docker -c "yarn test:integration:vereino --filter <ID>"`. This changes no system setting. It runs the browser tests too, so run a story's UI spec locally before pushing and report its result. Keeping API checks in a spec file without `page` and browser checks in a `…-ui.spec.ts` file is still good practice, because `--filter` then runs the API part alone. If Chromium fails to launch again with a missing shared library, do not install packages or edit groups in the run: report it, leave the browser steps to CI, and ask the owner to rerun `npx playwright install-deps chromium`.

**Applies to**: `packages/app/.ai/qa/tests/**`, `yarn test:integration:vereino`, cezar runs on the workstation host.
