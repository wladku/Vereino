# Run: PR #750 — integration shards 1, 2, 3, 5, 6 red

- **Trigger:** cezar task (om-auto-fix-pr on #750): integration shards 1, 2, 3, 5 and 6 failed; check whether the failure is shared with #746, the base of this stacked PR; merge `main` in; never force-push, never merge.
- **PR / branch:** #750, `docs/mockup-current-app` (stacked on #746, `docs/privacy-move-research-anonymise-club`). Worked on a detached HEAD at `origin/docs/mockup-current-app`.
- **Issue:** none (see the PR).

## Steps

1. Read the failing jobs of run 45616841827 (#750) and run 45616729085 (#746). The same five shards fail on both PRs.
2. Every failing test in the five shards stops at the same place: `create account` → 400 `Invalid email address` at `packages/app/.ai/qa/tests/_fixtures/club.ts:268`. `createStaff` builds the address as `${firstName.toLowerCase()}-<suffix>@example.org`.
3. #746 renamed the staff in those specs to fictional Polish names with diacritics (for example `Wojtek` → `Rafał` in TEST-A11, TEST-046, TEST-L06). `rafał-…@example.org` fails the API's email pattern. Every failing spec (TEST-A11, T01, T02, T04, T11, E08-S03, TEST-026, 033, 036, 046, C12, L06) is one that #746 edited; shard 4 has none of them and passes.
4. #750 itself changes only `docs/ux-concept/mockups/**`. The failure belongs to #746 and is inherited here through the base branch; no change on #750 can fix it without editing #746's files.
5. Merged `origin/main` (3e039072, #733) into the PR head: no conflicts.

## Decisions

- No test or fixture change on #750: the fix belongs on #746, which introduced the names. Editing the same specs here would duplicate #746's diff and conflict with its fix.
- Proposed fix for #746 (not applied: outside this task's scope): fold diacritics out of the address in `createStaff` (`firstName.normalize('NFD').replace(/\p{Diacritic}/gu, '').replace(/ł/g, 'l').replace(/Ł/g, 'L')`), or use ASCII first names in the renamed specs.

## Files changed

- this run log only (plus the merge of `main`).

## Commands and results

- `gh run view --job <id> --log-failed` on the five #750 shards: every failure (with its retry) is `Error: create account {"error":"Validation failed", … "path":["email"],"message":"Invalid email address"}`.
- `git merge --no-ff --signoff origin/main`: clean.

## Open problems / next steps

- #746 needs the fix above. Then merge #746's branch (or `main` once #746 merged) into #750 and rerun CI; #750 should go green without its own change.
