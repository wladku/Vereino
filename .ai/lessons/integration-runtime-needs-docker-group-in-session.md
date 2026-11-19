---
title: "A session without the docker group runs integration tests through sg docker"
modules: ["platform"]
areas: ["testing"]
topics: ["integration-tests", "testcontainers", "docker", "cezar"]
---

# A session without the docker group runs integration tests through sg docker

**Context**: In the Cezar run of #359 (2026-11-18, Linux) `yarn test:integration:vereino --filter TEST-A03` stopped before any test with `Could not find a working container runtime strategy`. `docker ps` answered `permission denied ... /var/run/docker.sock`: the user is listed in the `docker` group (`getent group docker`), but the agent's shell was started without that supplementary group (`id` shows no `docker`).

**Problem**: Testcontainers reports a missing runtime, which reads like "Docker is down"; waiting for `docker info` never helps, and changing the daemon or socket permissions is out of bounds for an agent.

**Rule**: When the runtime is missing, run `docker ps` and `id`. If the socket refuses permission and `getent group docker` lists the user, run the test in a shell with the group: `sg docker -c "yarn test:integration:vereino --filter <TEST-ID>"`. Never change the socket, the daemon configuration or group membership.

**Applies to**: `yarn test:integration:vereino`, `yarn test:integration:vereino:start`, any Testcontainers run from an agent shell on Linux.
