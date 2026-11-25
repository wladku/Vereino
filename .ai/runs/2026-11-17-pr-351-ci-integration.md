# Run: PR #351 — drive the red required check `integration` to green (issue #280)

- **Goal and trigger:** cezar task (`om-auto-fix-pr 351`): the required check `integration` failed on PR #351
  (shard 3/3); merge `main` in, find the cause, push to `feat/issue-280-admin-booking-request-card` without rewriting
  history, never merge.
- **Spec / issue / branch:** `.ai/specs/implemented/2026-11-14-vereino-parity-facilities.md` phase 6; #280; PR #351; worked on a
  detached HEAD at `origin/feat/issue-280-admin-booking-request-card`.

## Steps

1. Read the failing CI run 44063444937. Shard 3/3 had one failure out of 76 tests:
   `people/E02-S03-member-accounts.spec.ts:410` ("an account linked to no person lands on the admin panel with a
   notice…"). On the first attempt, `signInThroughForm` timed out waiting to leave `/login` (30 s). On the retry,
   the backend notice `not linked to a person` did not appear within 20 s.
2. Classified it: the PR changes only the `facilities` module and its QA tests; it does not touch `people`, auth,
   the backend shell or that test. The same test also failed on an unrelated PR branch
   (`feat/issue-295-admin-manual-charges`, run 43999253326), and the latest `main` runs are green → **flake**, not a
   regression from this PR.
3. Merged `origin/main` (ebbf477d) into the PR head with no conflicts; `yarn install`, `yarn generate` and
   `yarn typecheck` pass on the merged tree.
4. Ran `yarn test:integration:vereino --filter E02-S03` locally on the merged tree (result below).

## Decisions

- No code change for the flaky test in this PR: its root cause (a slow first sign-in on a cold production server)
  is outside the PR's scope. A fix belongs in its own PR; see Open problems.

## Commands and results

- `yarn typecheck` — pass.
- `yarn test:integration:vereino --filter E02-S03` — tests 1–6 `ok`, including `:410` (21.6 s), the test that failed in CI. The run was stopped by the session's 10-minute background limit while the 7th test (`:465`, green in CI) was running.

## Open problems

- E02-S03 (`:410`) is flaky in CI (seen on two branches on 2026-11-17).

## Next steps

- Push the merge, let CI re-run `integration`, and hand off to `om-approve-merge-pr` once checks and QA pass.
