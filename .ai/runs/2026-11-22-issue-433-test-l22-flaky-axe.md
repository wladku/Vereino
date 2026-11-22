# Run: real fix for the TEST-L22 quarantine (#433)

- **Trigger**: Cezar run on issue #433 (label `cezar`), owner decision of 2026-11-22: find the cause, fix it, turn the `test.fixme` back into `test`, prove it with repeated runs, close the issue. Epic #565.
- **Branch**: `fix/issue-433-test-l22-flaky-axe`
- **Skill**: `om-auto-fix-issue` with the repo-local override.

## Steps

1. Claimed #433 (assignee, `in-progress`, `🤖` comment naming this worktree). The earlier claims from 2026-11-20 had been released.
2. Read both failing CI runs (44646659366 on #431's branch, 44642262124 on #430's branch, both 2026-11-20 00:00–00:32 UTC) and pulled the `axe-results` attachments from the `playwright-report-shard-4` artifact.
3. Root cause: the blocking `color-contrast` nodes were the dialog's age chip (`groups-move-many-fits`, `aria-pressed="true"`) and its Move button (`groups-move-many-save`), read at blended colours such as `#d1d1d1` on `#f7f7f7` (1.42:1) and `#555555` on `#212121` (2.15:1). Their Tailwind `transition-*` fade was still running when axe scanned, because `networkidle` does not wait for CSS transitions. The other nodes in those reports were the AppShell sidebar headings, a platform baseline at the time (fixed since #481). That is why each attempt failed in a different locale and theme.
4. The fix was already on `main`: `scanBlockingViolations` waits until no `CSSTransition` runs (`waitForTransitions`, added by #430 and merged 2026-11-20 03:33). The quarantine #434 merged at 03:03, half an hour earlier, so the test never ran in CI with the wait.
5. Removed the `test.fixme` and the quarantine comment and wrote the cause next to the test. Dropped `platformBaseline: true` from the dialog scan: the local runs matched no baseline entry, so the dialog is now scanned without exceptions.
6. Extended lesson `ci-ledger-quarantine-check-each-run-first` with this case: before quarantining, compare the run times with later fixture commits and with open PRs.

## Commands and results

- `yarn test:integration:vereino --filter TEST-L22`, with a temporary uncommitted config of `retries: 0, repeatEach: 5`: **5 passed** (2.3 min).
- The same with `repeatEach: 10` and `--no-build`, after dropping `platformBaseline`: **10 passed** (4.3 min), no retries.
- `yarn lessons:check`: valid.
- `yarn verify`: all 20 steps passed. `yarn guard`: no blocking findings.

## Decisions

- No app change: the dialog's colours at rest pass axe in en/pl × light/dark. Only the fade failed, and the shared fixture already waits for it.
- `repeatEach`/`retries` were changed only for the local proof and are not committed. With `retries: 0` a flaky pass cannot hide behind a retry.

## Open problems / next steps

- None for #433. CI on the PR is the first CI run of TEST-L22 with the transition wait.
