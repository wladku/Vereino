# Run: PR #397 — browser-smoke failure (2026-11-19)

- **Goal / trigger:** Cezar task (`om-auto-fix-pr 397`): the required check `browser-smoke` failed on PR #397 (head 823a1f71, CI run 44425792116). Bring the PR up to date with `main` and get the check green without merging.
- **Spec / issue / branch:** `.ai/specs/2026-11-14-vereino-parity-payments.md` (epic #254), PR #397 (closes #293), branch `feat/issue-293-kit-campaign-record-admin`.

## Steps

1. Read the failed job's log and artifact. `login-smoke.mjs` filled the e-mail and password and pressed Enter. Then `agent-browser wait --url **/backend**` timed out after 25 000 ms. The screenshot shows the sign-in form, still filled. The app log ends at `[ephemeral] ready`, with no error.
2. Classified the failure as a **flake**, unrelated to the PR:
   - 823a1f71 changes only a run log (`.ai/runs/…`). The previous head, edf3137b, passed browser-smoke in run 44410874773.
   - The same timeout, at the same step, failed run 44345422697 on an unrelated branch (`feat/issue-286-renter-cancel-link`, 2026-11-18).
3. Merged `origin/main` (120f53f7) into the PR head on a detached HEAD. The merge was clean (cfd8e9a6).
4. `yarn verify` on the merged tree: **all 18 steps passed**, including test, test:scripts and build.
5. Pushed with `git push origin HEAD:feat/issue-293-kit-campaign-record-admin`. The new CI run re-runs browser-smoke on the merged tree.
6. CI run 44434165866 on 0aac401e was **all green**: browser-smoke (4m38s), gate, perf and the six integration shards.
7. `main` then gained #391 (phase 6, #296), and the PR became `CONFLICTING`. The only conflict was the spec's `Status` line. I resolved it by keeping both "phase 3 in #293" and "phase 6 in #296" (97085ace). The i18n catalogs merged automatically.
8. `yarn verify` on the re-merged tree: **all 18 steps passed**. Pushed again.

## Decisions

- No change to `login-smoke.mjs` in this PR. The flake is not caused by #397, and fixing the smoke script is outside the PR's scope. It is filed as a follow-up issue instead.
- The test was not weakened and no check was disabled.

## Files changed

- This run log only, plus the merge commit from `main`.

## Open problems / next steps

- #407 tracks the intermittent sign-in timeout in `login-smoke.mjs` (two failures in ~8 h on unrelated PRs).
- PR #397 keeps `needs-qa`. The merge stays with the merge train and `om-approve-merge-pr`.
