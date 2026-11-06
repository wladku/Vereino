# Issue #196 — CI integration job at its timeout (triage, stopped at Ask First)

- **Date:** 2026-11-06
- **Agent / tool:** Claude Code (Opus 5.5), om-auto-fix-issue under cezar
- **Trigger:** cezar task for issue #196
- **Spec / issue / branch:** https://github.com/wladku/Vereino/issues/196, related #193; branch `ci/issue-196-integration-timeout`
- **Status:** stopped

## Goal

Stop the `integration` CI job from being cancelled at its time limit while the suite is still green.

## Steps

1. Concurrency check: #196 unassigned, no `in-progress`, no claim comment, no open PR referencing it. Not claimed by this run (stopped before `om-fix`).
2. Read `.github/workflows/ci.yml`: `timeout-minutes` is already 60 on `main` (raised in c737f8e, PR #177, comment points at #193).
3. Measured recent `main` runs: d1491b8 integration job 46m28s (success); e646c15 33m44s; 092c471 was cancelled at 45m46s by the `concurrency` group (the next push at 18:45:04), not by the timeout.
4. Step timings of d1491b8: dependency install 35 s, Playwright browser 21 s, `yarn test:integration:vereino` 45m21s (Testcontainers + `yarn initialize` + production build + Playwright with `workers: 1`).
5. Stopped: the only levers that change the trend are sharding the suite over a matrix (each shard with its own database and build, or a shared build artifact) or more Playwright workers. Both change the CI architecture, and the issue itself marks that as ask-first. No owner approval is recorded on #196 or #193.

## Decisions

- No code change — caching dependencies or the Playwright browser would save under a minute (setup steps take ~1 min in total), so it does not address the issue; raising the timeout again is only a stop-gap and the issue rejects it as a fix.
- #196 overlaps #193 (same root cause, same options). The durable fix belongs to one of them; the comment on #196 proposes a concrete plan and asks the owner to approve it.

## Files changed

- `.ai/runs/2026-11-06-issue-196-integration-timeout.md` (this log)

## Commands and results

- `gh run view` on `main` CI runs: durations listed in Steps 3–4.
- No validation gate run: no source change.

## Open problems

- The suite is at ~46 min against a 60 min limit and grows with every new spec file.

## Next steps

- Owner approves (on #196 or #193) the sharding plan: a `--shard i/n` passthrough in `packages/app/scripts/vereino-ephemeral.mjs` (with unit tests), an `integration-shard` matrix job (3 shards), and an aggregate job still named `integration` so the required check in the `main` ruleset keeps its name. Then re-run this skill.
