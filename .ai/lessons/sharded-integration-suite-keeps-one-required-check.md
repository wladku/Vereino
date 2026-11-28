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

**Recurrence (2026-11-28, #498 / PR #887)**: the Open Mercato 0.10.1 upgrade made every browser test about 40 % slower (shard 4: 25 min of tests on `main`, 35 min on the PR, the same 78 specs; API-only specs kept their time). The six shards then took 35–45 min, and a merge-train batch (run 46124853275) cancelled shard 4/6 at 45 min with 67 of 78 tests passed and nothing hung. It looked like a hang because the log ends with server log lines and `The operation was canceled.`; comparing the `✓ N` timestamps per spec against `main` showed a uniform slowdown. The fix went to eight shards. Before calling a cancelled shard a hang, compare its per-spec times with the same shard on `main`.

**Applies to**: `.github/workflows/ci.yml`, `packages/app/scripts/vereino-ephemeral.mjs`, the `main` ruleset's required checks, every new `.ai/qa` integration spec.
