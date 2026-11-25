---
title: "Two CI runs are independent only when their heads share no commit off main, not when their PR numbers differ"
modules: ["platform"]
areas: ["testing", "debugging"]
topics: ["ci-failure-ledger", "quarantine", "flaky-tests"]
---

# Two CI runs are independent only when their heads share no commit off main, not when their PR numbers differ

**Context**: On 2026-11-25 the CI failure ledger filed 19 quarantine issues (#752–#770) from two failed runs: one on #746 and one on #750, which had merged #746's branch. The runs' PR numbers differed, so the ledger counted them as "runs that share no PR", although both heads carried #746's commit `b06347682a` with the bad fixture e-mail (#772, #773). The issues started about 20 Cezar runs and one needless quarantine PR (#771). Fixed in #774.

**Problem**: A PR number or branch name says nothing about the code a run tested. A PR stacked on, or merged with, another unmerged PR runs the same change under a new number, so one bad commit looks like a test failing everywhere. And one cause usually breaks many tests at once, so a per-test rule multiplies one mistake into many autonomous builds.

**Rule**: Decide whether two runs share a cause by their commits off `main` (`git log origin/main..<head>`; the GitHub compare API `main...<sha>`), and treat a run whose commits cannot be compared as related. When one ledger pass would file more than `STORM_THRESHOLD` (3) quarantine issues listing the same runs, file one triage issue without `cezar` instead (`splitStorms`, `renderStorm` in `scripts/ci-failure-ledger-plan.mjs`). A human triaging such a storm looks for the shared commit first (lesson `ci-ledger-quarantine-check-each-run-first`).

**Applies to**: `scripts/ci-failure-ledger-plan.mjs`, `scripts/ci-failure-ledger.mjs`, `.github/workflows/ci-failure-ledger.yml`, any tool that infers "unrelated" CI runs.
