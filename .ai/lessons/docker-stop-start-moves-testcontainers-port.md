---
title: "To simulate a database outage under Testcontainers, docker pause it; docker stop/start moves its host port"
modules: ["platform"]
areas: ["testing"]
topics: ["testcontainers", "docker", "outage-simulation"]
---

# To simulate a database outage under Testcontainers, docker pause it; docker stop/start moves its host port

**Context**: Measuring `/api/healthz` with PostgreSQL down (E18-S04, #465) on a `yarn test:integration:vereino:start`
run: `docker stop` then `docker start` of the Testcontainers PostgreSQL brought it back on a new random host port
(32998 → 32999), so the app kept answering 503 after the "recovery" and the run had to be rebuilt against the new port.

**Problem**: Testcontainers publishes to an ephemeral host port; a stopped container gets a new one on start, so the
app's `DATABASE_URL` points nowhere and a recovery check gives a false failure.

**Rule**: Simulate a hung dependency with `docker pause <id>` / `docker unpause <id>` (same port; the probe times out),
and a refused connection only at the very end of a session, or with a container you started yourself on a fixed host
port. Identify the container by the app's `DATABASE_URL` port first (`/proc/<pid>/environ`), never by name pattern, so
another worktree's container is never touched.

**Applies to**: `packages/app/scripts/vereino-ephemeral.mjs` runs used for outage checks (ENG-TEST-08 local part),
any manual resilience test.
