# Run log — merge throughput, Phase 2 (no integration failures outside the PR)

- **Date:** 2026-11-18
- **Trigger:** the owner approved `.ai/specs/2026-11-18-merge-throughput.md` (PR #400) and asked to start Phase 2, in an interactive Claude Code session that delegated Step 2.1 to a subagent in a git worktree.
- **Spec / issue / branch:** merge-throughput spec, Phase 2 (REQ-MT03, REQ-MT04, MT-TEST-03, MT-TEST-04); no issue; branch `ci/failure-ledger`.

## Goal

A test bound to the date or hour of the CI run, or broken on `main`, stops failing unrelated PRs within one day (MT-03).

## Steps

1. **Step 2.2 — failure ledger (coordinator).** `scripts/ci-failure-ledger-plan.mjs` (pure, 100 % covered, added to the `test:scripts` coverage list and `coverage-scope.test.mjs`), `scripts/ci-failure-ledger.mjs` (GitHub I/O), `.github/workflows/ci-failure-ledger.yml` (`workflow_run` on CI, `GITHUB_TOKEN` with `actions: read`, `issues: write`), `BACKWARD_COMPATIBILITY.md` §7 entry.
2. **Step 2.1 — date-safe days (subagent, worktree).** `safeDay` fixture over `scripts/vereino-test-dates.mjs` (`safeDayAfter`, 100 % covered); audit of the ~124 test files that call `calendarDate()`; TEST-L03 and TEST-R13 changed; lesson `integration-tests-pick-days-two-days-ahead`. The coordinator reviewed the diff, confirmed the R13 24 h free-cancellation rule in `facilities/lib/rentals.ts`, committed it and cherry-picked it onto this branch.

## Decisions

- **One ledger issue, quarantine issues only when the rule fires** (deviation from the spec's first text, recorded in the spec through PR #400): an issue per failing test would open one for every real PR failure, such as TEST-C01 on #391.
- **Cancelled and timed-out runs are read**: run 44364263433 (#392) failed TEST-L03 on shard 3 but concluded `cancelled` because a branch update cancelled the rest of the run; a `failure`-only filter missed it.
- **Only bot-written issues are read back**, only test ids and spec files that exist on `main` are written, fork runs are skipped, and `cezar` is added after creation so the issue gets its own `labeled` event.
- `actions/download-artifact` pinned to v8.0.2 (`9000827c…`, published 2026-10-07), the release that matches the repository's `upload-artifact` v7.
- Step 2.1 helper lives in `packages/app/scripts/` because Jest ignores `.ai/qa/` and `test:scripts` already covers `scripts/vereino-*.mjs`.

## Commands and results

- `yarn test:scripts`: 211/211 pass; `ci-failure-ledger-plan.mjs` and `vereino-test-dates.mjs` 100 % lines, branches, functions; all files 100 %.
- `yarn typecheck:qa`: exit 0. `yarn lessons:check`, `yarn format:check` (1674 files, 0 unformatted), `yarn qa-texts:check` (0 problems), `yarn spec-changelogs:check`: pass. `yarn lint`: no errors.
- Ledger dry run on the real run of #392: `run 44364263433 (#392): 3 report(s), 199 spec file(s) on main` / `failed: TEST-L03` / `dry run: the ledger would hold 1 entry; nothing written`.
- Replay of the real runs 44362328027 (#391) then 44364263433 (#392) through `planLedger`: first run records TEST-C01 and TEST-L03 without a quarantine; second run quarantines TEST-L03 with both runs as evidence; TEST-C01 (#391's own defect) is not quarantined.
- `yarn test:integration:vereino --filter TEST-L03` and `--filter TEST-R13` (subagent): the app built and TEST-L04/TEST-L20 passed, but the browser tests failed at launch, verbatim: `browserType.launch: ... chrome-headless-shell: error while loading shared libraries: libatk-1.0.so.0: cannot open shared object file: No such file or directory`. Not a test result; CI runs both.

## Open problems

- This host lacks Chromium's system libraries (`npx playwright install-deps chromium` needs sudo), so browser integration tests cannot run locally; Docker access works for this user since the session started.
- The ledger workflow runs only from `main`'s copy (`workflow_run`), so its first live run happens after this PR merges; a `workflow_dispatch` dry run on a recent failed CI run is the first check after merge.

## Next steps

- After merge: `gh workflow run ci-failure-ledger.yml -f run_id=<a failed CI run> -f dry_run=true`, then watch the first real ledger update.
- Phase 3 of the spec (MT-D02 QA rule, linked-issue label mirror, `SDLC.md`), and the Cezar operations steps.

## Files changed

`.github/workflows/ci-failure-ledger.yml`, `scripts/ci-failure-ledger.mjs`, `scripts/ci-failure-ledger-plan.mjs`, `packages/app/scripts/__tests__/ci-failure-ledger-plan.test.mjs`, `packages/app/scripts/__tests__/coverage-scope.test.mjs`, `packages/app/package.json`, `BACKWARD_COMPATIBILITY.md`, `packages/app/scripts/vereino-test-dates.mjs`, `packages/app/scripts/__tests__/vereino-test-dates.test.mjs`, `packages/app/.ai/qa/tests/_fixtures/activities.ts`, `packages/app/.ai/qa/tests/people/TEST-L03-departure.spec.ts`, `packages/app/.ai/qa/tests/facilities/TEST-R13-attendant-on-the-phone.spec.ts`, `.ai/lessons/integration-tests-pick-days-two-days-ahead.md`, this log.
