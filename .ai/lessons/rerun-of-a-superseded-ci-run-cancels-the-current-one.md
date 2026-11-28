---
title: "Rerunning a job of a superseded CI run cancels the CI run of the PR's current head"
modules: ["platform"]
areas: ["testing", "debugging"]
topics: ["ci", "concurrency", "rerun", "merge-train"]
---

# Rerunning a job of a superseded CI run cancels the CI run of the PR's current head

**Context**: On PR #903 (2026-11-27) an agent reran one cancelled integration shard of CI run 46067560988 with
`gh run rerun <run> --job <id>`. Meanwhile the owner had merged `main` into the branch, and CI run 46072946938 was
already testing the new head. `.github/workflows/ci.yml` sets `concurrency: { group: ci-${{ github.ref }},
cancel-in-progress: true }`, and both runs share the ref `refs/pull/903/merge`, so the rerun of the old run cancelled
every job of the new one. The rerun then tested a head nobody would merge, and the current head was left with no CI
result until that run was rerun as well.

**Problem**: `gh run rerun` does not warn that the run is stale. The concurrency group is keyed on the ref, not the
commit, so a rerun of any older run on the same PR wins over the newer run.

**Rule**: Before rerunning a CI run or one of its jobs, compare the run's `headSha` with the PR's current
`headRefOid` (`gh pr view <n> --json headRefOid`). Rerun only a run on the current head. If the head has moved, rerun
or wait for the run on the new head instead.

**Applies to**: `.github/workflows/ci.yml` (`concurrency`), every agent or person rerunning CI jobs on a pull
request, the CI stabilization step of `om-auto-fix-pr`.
