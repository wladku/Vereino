# Run log — issue #557: ENG-TEST-11 asserts a sessionless public JSON route keeps `public, s-maxage=60`

- **Goal:** ENG-TEST-11 calls a sessionless public club JSON route without a session and asserts `cache-control`
  contains `public` and `s-maxage=60` and not `no-store` (S8.6), now that `next.config.ts` adds `private, no-store` to
  authenticated `/api` responses (S8.4).
- **Trigger:** Cezar run (task 140cb14e), label `cezar` on #557, `om-auto-fix-issue`. Follow-up of nit 1 in the
  independent review of PR #530 (issue #463).
- **Branch:** `test/issue-557-public-json-route-s-maxage`, stacked on `fix/issue-463-security-headers-nonroot-container`
  (PR #530).

## Steps

1. Claimed #557 (assignee, `in-progress`, `🤖` claim comment naming the worktree, branch and start time).
2. Found that `platform/ENG-TEST-11-security-headers.spec.ts` and the `no-store` config exist only on PR #530's branch
   (still open). Reset the task branch onto `origin/fix/issue-463-security-headers-nonroot-container` and opened the PR
   against that branch, so this change cannot reach `main` before #530.
3. Added the case `ENG-TEST-11 a sessionless public club JSON route keeps public s-maxage=60 …`: a new club publishes
   its page (`publish` fixture), an anonymous `publicGet` of `/api/club_core/public/{slug}` must answer 200 with
   `public` and `s-maxage=60` and without `no-store`; the same route with the admin's `auth_token` cookie gets
   `no-store`.
4. Spec changelog file `2026-11-22-issue-557-eng-test-11-public-json.md`.

## Decisions

- **Stacked PR, base = PR #530's branch.** The test asserts behavior that only #530 adds. Merging into `main` first is
  impossible (the spec file does not exist there); waiting would leave the issue idle. When #530 is squash-merged and its
  branch deleted, GitHub retargets this PR to `main`.
- **Route `GET /api/club_core/public/{slug}`** (club page): the one TEST-037 already proves at `public, s-maxage=60`, set
  through `club_core/api/public-shared.ts`.
- **Signed-in contrast added** so the case shows the config header still applies to the same route with a session.

## Commands and results

See the PR body (integration test and `yarn verify` results).

## Open problems / next steps

- Merge after #530; the PR retargets to `main` then.
