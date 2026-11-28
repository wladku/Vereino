# Run: PR #887 — integration shard 4/6 cancelled in a merge-train batch

- **Trigger**: cezar task (om-auto-fix-pr), after the merge train set `merge-train/verdict=failure` on PR #887 at 2026-11-28T09:00Z ("broke a batch on its own").
- **Issue / PR / branch**: #498 / #887 / `chore/upgrade-open-mercato-0.10.1` (worked on a detached HEAD, pushed with `git push origin HEAD:chore/upgrade-open-mercato-0.10.1`).

## Goal

Find out from the shard 4/6 log of batch run 46124853275 which spec hung, whether the 0.10.1 upgrade causes it, fix it or record a flake, and push a new commit so the train retries the PR.

## Findings

- Nothing hung. Shard 4/6 ran 78 specs; 67 passed (the last one, J-002, at 08:59:23) and the job was cancelled at its 45 min `timeout-minutes` (08:59:41) while J-003 was running. No test failed or retried.
- The same 78 specs in shard 4/6 took:
  - `main` run 46121530721: 1,495 s of tests (job 29 min);
  - PR head run 46121549237 (0.10.1): 2,083 s (job 41 min);
  - batch run 46124853275 (0.10.1, slower runner): 2,253 s for the first 67 specs, about 2,650 s projected (job > 45 min).
- The slowdown is uniform, about +40 % on every browser spec (e.g. ISSUE-628 165 → 220 s, TEST-F03 27 → 44 s). API-only specs (ISSUE-738, TEST-PW01) kept their time. So the 0.10.1 upgrade causes it: it is structural, not a flake, and not one hanging spec.
- All six shards of the 0.10.1 runs took 35–45 min (on `main`, 23–42 min).
- Side finding: under 0.10.1 every query-index build logs `relation "entity_translations" does not exist` (1,231 errors in shard 4) because `query_index` now reads the `translations` module's table, which this app does not enable. The indexer catches the error inside a savepoint, so nothing breaks; enabling the module would be a new module plus migrations (Ask First), so it is left for a follow-up.

## Decision

Following the rule in `ci.yml` and lesson `sharded-integration-suite-keeps-one-required-check` ("add a shard number when a shard nears its timeout, instead of raising `timeout-minutes`"), the suite runs on eight shards. Projected slowest shard: about 37 min on the slow runner. One CI run grows from 13 to 15 jobs (GitHub Free limit 20). The required check `integration` (the aggregate) is unchanged, so the ruleset and the merge train need no change.

## Files changed

- `.github/workflows/ci.yml` — matrix `shard: [1..8]`, comment with the reason.
- `docs/ops/ci-runners.md`, `docs/ops/github-settings.md` — shard check names `integration (shard N/8)`.
- `.ai/lessons/sharded-integration-suite-keeps-one-required-check.md` — recurrence paragraph.
- this run log.

## Commands and results

- `git merge origin/main` — already up to date (`main` at 06ab4160).
- `yarn verify` — all 24 steps passed (typecheck, lint, test, test:scripts, build, ci-runners:check …).

## Next steps

- The merge train retries the PR on this new commit; QA (`needs-qa`) is still owed by a human.
- Follow-up: decide whether to enable the `translations` module (or otherwise stop the `entity_translations` indexer errors) after the upgrade lands.
