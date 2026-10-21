---
title: "Use yarn test:integration:vereino; the platform runner waits for the customers module"
modules: ["platform"]
areas: ["testing", "debugging"]
topics: ["integration-tests", "ephemeral-runner", "testcontainers", "readiness-probe", "agent-browser"]
---

# Use yarn test:integration:vereino; the platform runner waits for the customers module

**Context**: On 2026-10-21, during engineering-standards phase E1, `yarn test:integration:ephemeral` (Open Mercato 0.9.0 CLI) built and started the app but always failed with "Application did not become ready within 90 seconds … Authenticated GET /api/customers/people returned 404". Earlier attempts on the same machine failed with "Another Open Mercato production server is already running for …packages/app (pid … on port 3000)", because a server from another session used the same app directory and build output.

**Problem**: The platform runner's readiness probe (`probeAuthenticatedApi` in `@open-mercato/cli/dist/lib/testing/integration.js`) is hard-coded to `/api/customers/people`; this app runs the empty preset without the CRM `customers` module (ADR-001), and there is no option to change the probe. The runner also resets `packages/app/.mercato/next`, which breaks any other server serving from that directory.

**Rule**: Run integration tests with `yarn test:integration:vereino` (`packages/app/scripts/vereino-ephemeral.mjs`: Testcontainers PostgreSQL 17, `yarn initialize`, production build, Playwright; `--filter <TEST-ID>` to focus) and keep an app up for agent-browser with `yarn test:integration:vereino:start`. Before a local run, make sure no other `mercato server start` runs for `packages/app` (port 3000) and ask before stopping one that is not yours. agent-browser commands must not write to a pipe the script waits on (its daemon keeps stdout open); write their output to a file.

**Applies to**: `packages/app/scripts/vereino-ephemeral.mjs`, `packages/app/.ai/qa/**`, `.github/workflows/ci.yml` jobs `integration`, `browser-smoke`, `perf`; any spec phase validation that runs integration tests.
