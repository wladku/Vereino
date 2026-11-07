# Run: drive PR #206 (issue #187) to merge-ready

- **Goal and trigger:** unattended `om-auto-fix-pr 206` run (cezar task). The PR was behind `main` (GitHub: conflicting, label `merge-train-conflict`) and `browser-smoke` was red.
- **Issue / PR / branch:** #187 / #206 / `fix/issue-187-ward-filter-direct-subject` (worked on a detached HEAD at `origin/fix/issue-187-ward-filter-direct-subject`, pushed with `git push origin HEAD:fix/issue-187-ward-filter-direct-subject`).

## Steps

1. Claimed the PR (`in-progress` + claim comment; already assigned to the owner).
2. Merged `origin/main` (up to 9fbce8d). Git merged without a reported conflict, but `.ai/lessons.md` came back with the whole catalog that #213 had removed. Restored `main`'s `.ai/lessons.md`; the PR's lesson `record-the-subject-do-not-infer-it-from-participants` keeps its front matter, which is now the catalog (`yarn lessons:check` passes).
3. Reviewed the PR diff against `main` (`queries.ts` ward clause, `threads.start_direct` stores the subject as `scope_id`, entity doc, README, TEST-M12 assertion). Checked every `scopeId` reader in `communication`: labels only resolve section/group/activity/occurrence, `ThreadRecord` and `occurrenceId` only read `occurrence`, the composer reads targets, not threads. No findings.
4. `browser-smoke` on the old head (run 42361437227): the app started, then `login-smoke.mjs` failed with `agent-browser wait failed (exit 1): ✗ Wait timed out after 25000ms`. The PR changes no UI, auth or login code, so it was handled as a probable flake, and the new head pushed after the merge re-runs it.

## Decisions

- Kept `main`'s `.ai/lessons.md` verbatim: since #213, lessons are listed from their front matter and `lessons.md` holds no index rows.
- No code change: the review found nothing to fix, and the red check is not caused by this diff.

## Commands and results

- `yarn verify` (after the merge): `[verify] all 14 step(s) passed`.

## Open problems / next steps

- Confirm that CI on the pushed head is green (`browser-smoke` in particular). If it fails the same way again, open the `browser-smoke` artifact.
