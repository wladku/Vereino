# Issue #196 — shard the CI integration suite

- **Date:** 2026-11-06
- **Agent / tool:** Claude Code (Opus 5.5), om-auto-fix-issue under cezar
- **Trigger:** cezar task for issue #196
- **Spec / issue / branch:** https://github.com/wladku/Vereino/issues/196, related #193; branch `ci/issue-196-integration-timeout`
- **Status:** completed (PR opened; CI on the PR is the proof of the workflow change)

## Goal

Stop the `integration` CI job from being cancelled at its time limit while the suite is still green, with headroom for new specs.

## Steps

1. Concurrency check: #196 unassigned, no `in-progress`, no claim comment, no open PR referencing it.
2. Read `.github/workflows/ci.yml`: `timeout-minutes` was already 60 on `main` (raised in c737f8e, PR #177, comment points at #193).
3. Measured recent `main` runs: d1491b8 integration job 46m28s (success); e646c15 33m44s; 092c471 was cancelled at 45m46s by the `concurrency` group (the next push at 18:45:04), not by the timeout.
4. Step timings of d1491b8: dependency install 35 s, Playwright browser 21 s, `yarn test:integration:vereino` 45m21s (Testcontainers + `yarn initialize` + production build + Playwright with `workers: 1`).
5. First pass stopped at Ask First (sharding changes the CI architecture; the issue marks it ask-first) and posted the plan on #196. The owner then told the session to continue autonomously without asking; that was recorded on #196 as the approval and the issue was claimed.
6. Added `--shard <i>/<n>` to `packages/app/scripts/vereino-ephemeral.mjs` (validated by the new `isShard`, passed to Playwright as `--shard=i/n`) with unit tests.
7. `ci.yml`: the suite runs in an `integration-shard` matrix (3 shards, 45 min each, `fail-fast: false`, one report artifact per shard); a job still named `integration` needs the shards and fails unless all succeeded, so the `main` ruleset's required check keeps its name (verified via the rulesets API: `gate`, `integration`, `browser-smoke`).
8. `BACKWARD_COMPATIBILITY.md`: CI now relies on `--shard`. Lesson `sharded-integration-suite-keeps-one-required-check` added.

## Decisions

- Shards, not more Playwright workers — every shard gets its own database, so tests that share fixture data or the seeded admin cannot interfere; `workers: 1` stays.
- Each shard builds the app itself instead of sharing one build artifact — simpler, no artifact handoff of a large `.next` directory; wall-clock is about build + a third of the tests. Sharing the build can follow if the build dominates.
- 3 shards with a 45 min limit per shard — about 25 min expected per shard; add a shard number when one nears the limit.
- No caching of dependencies or browsers — setup takes about 1 min in total.

## Files changed

- `.github/workflows/ci.yml`
- `packages/app/scripts/vereino-ephemeral.mjs`, `packages/app/scripts/__tests__/vereino-ephemeral.test.mjs`
- `BACKWARD_COMPATIBILITY.md`
- `.ai/lessons/sharded-integration-suite-keeps-one-required-check.md`, `.ai/lessons.md`
- `.ai/runs/2026-11-06-issue-196-integration-timeout.md` (this log)

## Commands and results

- `yarn test:scripts`: 122 tests pass, coverage 100 % lines/branches/functions (`vereino-ephemeral.mjs` 100 %).
- `node scripts/check-lessons.mjs`: catalog valid.
- `yarn verify`: all 14 steps passed (lint 244 s, build 317 s, unit tests 590, scripts 122 at 100 % coverage); `yarn format:check` and `yarn lessons:check` re-run on the final tree: clean.
- The sharded workflow itself can only be proven on GitHub Actions: the PR's own CI run.

## Open problems

- Shards are split by spec file, so their durations can be uneven; Playwright balances by file count, not by duration.

## Next steps

- Check the PR's CI: three shard jobs and a green `integration` job; then the owner merges. Close #193 together with #196 if the result is accepted.
