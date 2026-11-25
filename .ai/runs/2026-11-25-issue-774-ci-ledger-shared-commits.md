# Run: CI failure ledger — shared commits make one source, a storm makes one issue (#774)

- **Goal and trigger:** Cezar run of `om-auto-fix-issue` for #774 (label `cezar`, 2026-11-25). The ledger filed 19 quarantine issues (#752–#770) from two runs on #746 and #750, which had merged #746's branch, because it called runs independent when their PR numbers differed.
- **Issue / branch:** #774, `fix/issue-774-ci-ledger-shared-commits`. Spec: `.ai/specs/2026-11-18-merge-throughput.md` (REQ-MT04).

## Steps

1. Claimed #774 (assignee, `in-progress`, `🤖` comment naming this worktree and branch).
2. `scripts/ci-failure-ledger-plan.mjs` (pure, 100 % covered):
   - `runSubject` keeps the run's `head_sha` as `head`; `planLedger` stores it on each new ledger entry (additive field in the `ci-failure-ledger-data` block; older entries still parse).
   - `offMainCommits` and `unrelated(left, right, branchCommits)`: two runs are independent only when they are different runs, share no PR and their heads share no commit off `main`. A PR run whose commits are unknown (pre-#774 entry, failed comparison) is related to every PR run; a `main` run has no commit off `main`.
   - `headsToCompare` names the heads the I/O script must compare.
   - `splitStorms`: more than `STORM_THRESHOLD` (3) quarantines with the same evidence (runs, any order) become one storm; `renderStorm` writes one issue labelled `bug`, `priority-high`, `risk-low` (no `cezar`) that names every test and run and carries every test's quarantine marker, so later runs do not file them one by one.
   - `quarantinedTestId` replaced by `quarantinedTestIds` (all markers of a body).
3. `scripts/ci-failure-ledger.mjs`: compares each needed head with the default branch through `GET /repos/{repo}/compare/{main}...{sha}` (up to 5 pages of 100 commits; a failure logs a warning and leaves the head unknown), passes `branchCommits` to `planLedger`, opens storm issues without `cezar`. The workflow already grants `contents: read`.
4. Tests in `packages/app/scripts/__tests__/ci-failure-ledger-plan.test.mjs` for both rules, including the #746/#750 shape.
5. Spec REQ-MT04 text and the "Disjoint runs" definition updated; changelog file `2026-11-25-issue-774-ledger-shared-commits.md`; lesson `ci-runs-are-independent-only-without-shared-branch-commits`.

## Decisions

- Commits are looked up at plan time from the stored head SHA rather than stored in the ledger: the ledger issue body is capped at 65 536 characters and one run with 19 failures would repeat its commit list 19 times.
- Unknown commits count as related (strict reading of the issue: independent *only when* no shared commit). Cost: for 48 h after deploy, old entries without a head prove nothing.
- A storm keeps `priority-high` so the dedupe query (`openIssues('priority-high')`) finds its markers, and `bug` so a quarantine `fixme` may still reference it.

## Commands and results

- `node --test --experimental-test-coverage … ci-failure-ledger-plan.test.mjs`: 31 passed, `ci-failure-ledger-plan.mjs` 100 % lines, branches and functions.
- Real-data check: heads of runs 45616729085 (#746) and 45616841827 (#750) compared with `main` through the API share commit `b06347682a`, so the new rule treats them as one source.
- `yarn verify`: first run failed at `format:check` (`packages/app/scripts/__tests__/ci-failure-ledger-plan.test.mjs is not formatted`); after `yarn format`, `yarn verify --from format:check`: `all 16 step(s) passed` (the earlier steps generate … secrets:check had passed).
- `yarn guard`: no blocking findings (one warning: workflow file changed, a comment only).

## Open problems / next steps

- None. Integration tests are not affected (repository tooling only).
