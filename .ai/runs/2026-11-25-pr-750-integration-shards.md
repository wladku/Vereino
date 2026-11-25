# Run: PR #750 — integration shards 1, 2, 3, 5, 6 red

- **Trigger:** cezar task (om-auto-fix-pr on #750): integration shards 1, 2, 3, 5 and 6 failed; check whether the failure is shared with #746, the base of this stacked PR; merge `main` in; never force-push, never merge.
- **PR / branch:** #750, `docs/mockup-current-app` (stacked on #746, `docs/privacy-move-research-anonymise-club`). Worked on a detached HEAD at `origin/docs/mockup-current-app`.
- **Issue:** none (see the PR).

## Steps

1. Read the failing jobs of run 45616841827 (#750) and run 45616729085 (#746). The same five shards fail on both PRs.
2. Every failing test in the five shards stops at the same place: `create account` → 400 `Invalid email address` at `packages/app/.ai/qa/tests/_fixtures/club.ts:268`. `createStaff` builds the address as `${firstName.toLowerCase()}-<suffix>@example.org`.
3. #746 renamed the staff in those specs to fictional Polish names with diacritics (for example `Wojtek` → `Rafał` in TEST-A11, TEST-046, TEST-L06). `rafał-…@example.org` fails the API's email pattern. Every failing spec (TEST-A11, T01, T02, T04, T11, E08-S03, TEST-026, 033, 036, 046, C12, L06) is one that #746 edited; shard 4 has none of them and passes.
4. #750 itself changes only `docs/ux-concept/mockups/**`. The failure belongs to #746 and is inherited here through the base branch; no change on #750 can fix it without editing #746's files.
5. Merged `origin/main` (3e039072, #733) into the PR head: no conflicts. Pushed 6b37ae58; commented the diagnosis on #750 and #746.
6. Owner told the run to continue autonomously, so the fix went onto #746's branch (commit 750ebe86, pushed fast-forward from a detached HEAD): `testEmailFor(firstName)` in `_fixtures/club.ts` folds diacritics and `ł`/`Ł` to ASCII; `createStaff` and the spec-local account helpers in E02-S03, TEST-047 and TEST-L01 use it. Lesson `test-emails-from-names-are-ascii`.
7. Merged #746's branch into #750.

## Decisions

- No test or fixture change on #750: the fix belongs on #746, which introduced the names. Editing the same specs here would duplicate #746's diff and conflict with its fix.
- Fixed the helper rather than renaming people back to ASCII: one place, and it also covers names added later. The spec-local copies of the same address pattern were switched too, so the next rename cannot break them.

## Files changed

- on #750: this run log, plus the merges of `main` and #746.
- on #746: `packages/app/.ai/qa/tests/_fixtures/club.ts`, `people/E02-S03-member-accounts.spec.ts`, `people/TEST-047-member-locale.spec.ts`, `people/TEST-L01-account-state-and-actions.spec.ts`, `.ai/lessons/test-emails-from-names-are-ascii.md`.

## Commands and results

- `gh run view --job <id> --log-failed` on the five #750 shards: every failure (with its retry) is `Error: create account {"error":"Validation failed", … "path":["email"],"message":"Invalid email address"}`.
- `git merge --no-ff --signoff origin/main`: clean.
- On #746 + fix: `yarn typecheck:qa` exit 0; `yarn format:check` 0 unformatted; `yarn qa-texts:check` 0 problems; `yarn lessons:check` valid; `yarn guard` no blocking findings; `check-secrets` clean.
- Local integration (`yarn test:integration:vereino --filter <ID>`): TEST-A11 1 passed, E02-S03 7 passed, TEST-047 2 passed, TEST-L01 3 passed, TEST-L06 1 passed.

## Open problems / next steps

- CI on #746 and #750 must confirm shards 1, 2, 3, 5 and 6 green; the other failing specs (T01, T02, T04, T11, E08-S03, TEST-026, 033, 036, 046, C12) share the same `createStaff` path and were not run locally one by one.
