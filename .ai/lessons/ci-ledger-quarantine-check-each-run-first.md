---
title: "Before quarantining a CI-ledger test, explain each failed run by its own branch"
modules: ["platform"]
areas: ["testing", "debugging"]
topics: ["ci-failure-ledger", "quarantine", "flaky-tests"]
---

# Before quarantining a CI-ledger test, explain each failed run by its own branch

**Context**: #516 asked to quarantine `TEST-046` because it failed in two CI runs that share no PR (runs 44661770663 and 44745858856). The two runs failed different tests that share the `TEST-046` prefix of one spec file, and each failure was caused by the PR it ran on: the B-33 test hit a strict-mode locator on #422's own branch, which #422 fixed before it merged; the treasurer test failed on #513, which moves "Cash to settle" after "Kit orders" (`pageOrder` 26 → 40) without updating the sidebar order TEST-046 asserts.

#433 (2026-11-20) quarantined `TEST-L22` (#434, merged 03:03) for a `color-contrast` flake whose fix, a wait for running CSS transitions in `scanBlockingViolations`, was already on the open PR #430 and merged half an hour later (03:33); both failing runs predated it, so the test sat in quarantine with its cause already fixed until #433 was reopened as a real fix.

#754 (2026-11-25) asked to quarantine `TEST-T02` for runs on #746 and #750, two PRs that carry the same anonymisation commit renaming the coordinator `Wojtek` to `Rafał`. The fixture `createStaff` built the email from the first name (`rafał-…@example.org`), which the account API rejects as invalid. "Share no PR" did not mean "independent": the same change sat on two branches. The fix was in the fixture (fold the name to ASCII), and the test stayed live. #756 (`TEST-T11`) and the other issues of that pass (#752–#770) listed the same two runs and had the same cause; the ledger now files such a storm as one triage issue (lesson `ci-runs-are-independent-only-without-shared-branch-commits`).

**Problem**: `scripts/ci-failure-ledger-plan.mjs` keys a failure by the test id a title starts with (`testIdOf`), so several tests in one file count as one, and it cannot tell a PR's own pre-merge failure from a flake. A quarantine on such an issue hides a real regression (#513) and disables a test that is green on `main`.

**Rule**: For each run a ledger issue lists, read the failed test's full title and error (`gh run view <id> --log-failed`), then check whether the run's branch changed the test file or the behaviour it asserts (the PR diff) and whether `main` has since fixed it (`git log -S` on the test). Also compare each run's time with the later commits to the shared fixtures and the code under test (`git log --since=<run time> -- packages/app/.ai/qa/tests/_fixtures <component>`): a fix that landed (or sits on an open PR) after the failing runs means run the test again on `main` first instead of quarantining it. Diff the failing runs' branches against each other too: when they share a change to the test or to what it asserts, that change is the suspect. Quarantine only a failure no PR explains; otherwise comment the explanation on the issue and on the PR that must fix its own test.

**Applies to**: `ci-failure-ledger` quarantine issues, `scripts/ci-failure-ledger-plan.mjs`, `packages/app/.ai/qa/tests/**`.
