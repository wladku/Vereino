# Run: issue #756, quarantine TEST-T11 (not quarantined: the failure belongs to PR #746)

- **Goal and trigger:** Cezar run of `om-auto-fix-issue` on #756 (CI failure ledger, labels `bug`, `priority-high`, `cezar`), which asks to mark `TEST-T11` `test.fixme` with `// quarantine: #756` unless a fix already exists.
- **Issue / branch:** #756, `docs/issue-756-ledger-false-positive` (renamed from `test/issue-756-quarantine-flaky-test-t11`).

## Steps

1. Claimed #756 (assignee, `in-progress`, `🤖` comment naming this worktree).
2. Read both failed runs the issue lists (`gh run view <id> --log-failed`). TEST-T11 fails at line 74 (`signedInStaff` → `createStaff`, `_fixtures/club.ts:268`): `POST /api/people/persons/:id/account` answers 400 `invalid_format` for the e-mail.
3. On `main` the staff member is `Wojtek`, and `wojtek-<suffix>@example.org` matches the API's e-mail pattern (checked in node). The runs' branches: 45616729085 is PR #746 (a367b7bb), 45616841827 is PR #750, whose branch merged #746's branch (f8397971). #746 renames the test data to fictional Polish names (`Wojtek` → `Rafał`), so the fixture built `rafał-…@example.org`, which the pattern rejects.
4. #746 already carries the fix, 750ebe86 `test(qa): build test e-mail addresses from names in ASCII` (`testEmailFor`), with CI queued. `main` (d4caa260) has no T11 failure.
5. All 19 ledger issues filed then (#752–#770) list the same two runs, so they share this cause.
6. PR #773 conflicted with `main` (`mergeStateStatus` DIRTY): #772 (fix for #754) and #776 (ledger fix #774) had already rewritten the same lesson with the same case and added the lesson `ci-runs-are-independent-only-without-shared-branch-commits`. Merged `main` into the PR branch (no rebase, no force-push), kept `main`'s wording of the lesson and added one sentence tying #756 and its siblings to it.

## Decisions

- No quarantine: the issue's own instruction ("if a fix for this failure already exists, comment the link here instead") applies, and the lesson `ci-ledger-quarantine-check-each-run-first` forbids quarantining a failure a PR explains. A `fixme` would disable a test that is green on `main`.
- The lesson gets this case (a PR that merged another PR's branch makes the ledger's "share no PR" wrong) instead of a new record.
- No integration test run: no test or app code changed.

## Files changed

- `.ai/lessons/ci-ledger-quarantine-check-each-run-first.md`
- `.ai/runs/2026-11-25-issue-756-quarantine-test-t11.md`

## Open problems / next steps

- The owner can close #756 and its 18 siblings once #746's CI is green; PR #771 (quarantine TEST-A11 for #752) quarantines a test for the same cause and is not needed.
- `scripts/ci-failure-ledger-plan.mjs` now compares runs by their commits off `main` and files one triage issue per storm (#774, merged in #776); nothing left here.
