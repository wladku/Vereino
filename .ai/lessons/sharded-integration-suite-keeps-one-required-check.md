---
title: "Shard the integration suite behind one aggregate job that keeps the required check name"
modules: ["platform"]
areas: ["testing"]
topics: ["ci", "integration-tests", "playwright", "sharding", "required-checks"]
---

# Shard the integration suite behind one aggregate job that keeps the required check name

**Context**: By 2026-11-06 the single `integration` CI job ran 43–46 min against a 45 min limit, and green runs were cancelled with `The operation was canceled.` and no test failure (#193, #196). Raising the limit to 60 min (#177) only bought time. Setup (dependency install + Playwright browser) took about 1 min, so caching it would not help. The time went into the production build plus Playwright with `workers: 1`.

**Problem**: A matrix job reports one check per shard (`integration (shard 1/3)` …), but the `main` ruleset requires a check named `integration`. Renaming the job or matrixing it silently leaves the required check pending forever, so no PR can merge.

**Rule**: Run the suite as `yarn test:integration:vereino --shard <i>/<n>` in an `integration-shard` matrix (each shard has its own Testcontainers database and build) and keep a small job named `integration` with `needs: integration-shard`, `if: always()`, which fails unless `needs.integration-shard.result == 'success'`. When a shard nears its timeout, add a shard number to the matrix instead of raising `timeout-minutes`. Spec files must stay independent of each other, because a shard runs any subset of them.

**Applies to**: `.github/workflows/ci.yml`, `packages/app/scripts/vereino-ephemeral.mjs`, the `main` ruleset's required checks, every new `.ai/qa` integration spec.
