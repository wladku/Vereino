# Run: merge main into PR #840 (pin Facebook Graph API v26.0, #832)

- **Goal and trigger:** Cezar run of `om-auto-fix-pr 840`: the PR conflicted with `main` again (`merge-train-conflict`) after later merges.
- **Issue:** #832. **PR:** #840. **Branch:** `feat/issue-832-pin-facebook-graph-api` (worked on a detached HEAD at its origin tip, pushed with `git push origin HEAD:feat/issue-832-pin-facebook-graph-api`; no force-push, no history rewrite).

## Steps

1. PR is same-repository (`isCrossRepository: false`), open, no reviews or comments to address.
2. `git merge origin/main`: one add/add conflict in `.ai/lessons/verify-lint-heap-out-of-memory.md` — `main` (run for #870, #877) added a lesson with the same slug and the same rule. Kept `main`'s record and added #832 to its Context as a second occurrence. Every other file merged cleanly; no `v21.0` reference remains in code.

## Decisions

- One lesson, not two: both records state the same rule (resume `yarn verify --from lint` with `NODE_OPTIONS=--max-old-space-size=8192`), so the PR's copy was dropped in favour of `main`'s.

## Commands and results

- `yarn install --immutable`: done.
- `NODE_OPTIONS=--max-old-space-size=8192 yarn verify` (larger heap per the lesson above, set up front): all 24 steps passed.
- `yarn guard`: no blocking findings.
- No integration test is added or edited by this PR (the provider fake overrides every Facebook URL), so none ran locally.

## Open problems / next steps

- Owner: at the phase 2 exit gate, sign in with a real Facebook test user on v26.0 (unchanged from the first run).
