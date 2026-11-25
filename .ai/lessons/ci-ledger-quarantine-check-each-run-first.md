---
title: "Before quarantining a CI-ledger test, explain each failed run by its own branch"
modules: ["platform"]
areas: ["testing", "debugging"]
topics: ["ci-failure-ledger", "quarantine", "flaky-tests"]
---

# Before quarantining a CI-ledger test, explain each failed run by its own branch

**Context**: #516 asked to quarantine `TEST-046` because it failed in two CI runs that share no PR (runs 44661770663 and 44745858856). The two runs failed different tests that share the `TEST-046` prefix of one spec file, and each failure was caused by the PR it ran on: the B-33 test hit a strict-mode locator on #422's own branch, which #422 fixed before it merged; the treasurer test failed on #513, which moves "Cash to settle" after "Kit orders" (`pageOrder` 26 → 40) without updating the sidebar order TEST-046 asserts.

#433 (2026-11-20) quarantined `TEST-L22` (#434, merged 03:03) for a `color-contrast` flake whose fix, a wait for running CSS transitions in `scanBlockingViolations`, was already on the open PR #430 and merged half an hour later (03:33); both failing runs predated it, so the test sat in quarantine with its cause already fixed until #433 was reopened as a real fix.

On 2026-11-25 the ledger filed 19 quarantine issues at once (#752–#770, among them #756 for `TEST-T11`), all naming the same two runs: 45616729085 on #746 and 45616841827 on #750. The runs "share no PR" only by branch name: #750 had merged #746's branch, and #746 renamed staff in the test data to Polish names (`Wojtek` → `Rafał`), so `createStaff` built `rafał-…@example.org` and the account API answered 400 `invalid_format`. #746 fixed its own fixture (`testEmailFor`, 750ebe86) the same day, and `main` stayed green.

**Problem**: `scripts/ci-failure-ledger-plan.mjs` keys a failure by the test id a title starts with (`testIdOf`), so several tests in one file count as one, and it cannot tell a PR's own pre-merge failure from a flake. It also counts two PRs as unrelated when one has merged the other's branch, so a single broken PR shows up as a failure "no PR explains". A quarantine on such an issue hides a real regression (#513) and disables a test that is green on `main`.

**Rule**: For each run a ledger issue lists, read the failed test's full title and error (`gh run view <id> --log-failed`), then check whether the run's branch changed the test file or the behaviour it asserts (the PR diff) and whether `main` has since fixed it (`git log -S` on the test). Also compare each run's time with the later commits to the shared fixtures and the code under test (`git log --since=<run time> -- packages/app/.ai/qa/tests/_fixtures <component>`): a fix that landed (or sits on an open PR) after the failing runs means run the test again on `main` first instead of quarantining it. When several ledger issues list the same runs, compare the runs' branches (`git log origin/main..<branch>`): a branch that contains another PR's commits makes the two runs one cause. Quarantine only a failure no PR explains; otherwise comment the explanation on the issue and on the PR that must fix its own test.

**Applies to**: `ci-failure-ledger` quarantine issues, `scripts/ci-failure-ledger-plan.mjs`, `packages/app/.ai/qa/tests/**`.
