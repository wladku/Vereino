# Run: integration shards 1, 2, 3, 5 and 6 red on PR #746

- **Goal and trigger:** owner task (cezar, 2026-11-25). PR #746 (docs/privacy: fictional example club everywhere) failed integration shards 1, 2, 3, 5 and 6 (run 45616729085). Read the CI logs, fix the cause or report an infra flake, merge `main` in, never force-push, never merge.
- **PR / branch:** #746, `docs/privacy-move-research-anonymise-club` (worked on a detached HEAD, pushed with `git push origin HEAD:docs/privacy-move-research-anonymise-club`).

## Diagnosis

Not a flake: 20 tests failed on both attempts, every one at the same assertion:

```
Error: create account {"error":"Validation failed","details":[{"origin":"string","code":"invalid_format","format":"email", … "message":"Invalid email address"}]}
```

The PR renamed the coach `Wojtek` to `Rafał` in the test data. The fixture `createStaff` (`packages/app/.ai/qa/tests/_fixtures/club.ts`) built the account e-mail as `${firstName.toLowerCase()}-<suffix>@example.org`, so it produced `rafał-…@example.org`, which the account API's ASCII-only e-mail validator rejects. Failed ids: E08-S03, TEST-026, TEST-033, TEST-036, TEST-R02, TEST-R04, TEST-R05, TEST-R11, TEST-R12, TEST-R18, TEST-R19, TEST-T01, TEST-T02, TEST-T04, TEST-T11, TEST-A11, TEST-046 (2 tests), TEST-C12, TEST-L06.

## Steps

1. Merged `origin/main` (3e039072) into the PR head (a367b7bb): no conflicts.
2. Wrote an ASCII local-part helper for `createStaff` and ran all 19 failed ids locally against it: all passed.
3. On push the PR branch had moved: commit 750ebe86 (owner session) fixed the same cause the same way (`testEmailFor` in `_fixtures/club.ts`, also used by `E02-S03`, `TEST-047` and `TEST-L01`, lesson `test-emails-from-names-are-ascii`). Dropped this run's unpushed duplicate commit and lesson, and merged the PR branch into the main merge instead, so the push is a fast-forward carrying the `main` merge and this log.
4. Re-ran TEST-L06, E08-S03, TEST-046, E02-S03, TEST-047 and TEST-L01 plus `yarn verify` on the final tree (results below).

## Commands and results

- Step 2, one id per run, `yarn test:integration:vereino --filter <id>`: all 19 ids passed (TEST-026, TEST-033, TEST-046 and TEST-T01 report 2 passed, the others 1 passed).
- Step 2: `yarn verify`: `all 22 step(s) passed`; `yarn guard`: no blocking findings.
- Step 4 on the final tree: TEST-L06 1 passed, E08-S03 1 passed, TEST-046 2 passed, E02-S03 7 passed, TEST-047 2 passed, TEST-L01 3 passed; `yarn verify`: `all 22 step(s) passed`.

## Decisions

- Fix the fixture, not the names: Polish names with diacritics are legitimate test data, and the rename is the PR's purpose.
- Kept the owner's fix over this run's equivalent one: same root cause and approach, and it also covers the three per-spec e-mail builders.
- No Ask First item touched (test fixture only).

## Open problems / next steps

- None; CI reruns on the push.
