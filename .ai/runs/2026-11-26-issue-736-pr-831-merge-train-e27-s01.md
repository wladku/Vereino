# Run log — PR #831: fix the merge train's batch failure (E27-S01) (#736)

- **Goal and trigger:** cezar task `om-auto-fix-pr 831`. The PR carried `merge-train-failed`
  (`merge-train/verdict` = failure on `14ed9230`, "broke a batch on its own"). Fix what the train reported, merge
  `main` in (no force-push, no history rewrite), never merge.
- **Spec / issue / branch:** `.ai/specs/2026-11-26-vereino-staff-second-factor.md`, #736, PR #831, head
  `feat/issue-736-staff-second-factor` (worked on a detached HEAD at its origin tip; pushed with
  `git push origin HEAD:feat/issue-736-staff-second-factor`).

## Steps

1. Checked the PR: same-repository head (no fork), owner-authored, the PR's own CI on `14ed9230` all green.
2. Read the train's batch commit `ac5526cd` (`main` `cc3de13d` + `14ed9230`): only `integration (shard 1/6)` failed,
   1 failed / 70 passed. `E27-S01-declaration-share-report.spec.ts` stopped at `_fixtures/activities.ts:149`:
   `POST /api/activities/activities {"error":"Unauthorized"}`, expected 201, received 401.
3. Cause: E27-S01 arrived on `main` with #828 after this PR's last merge of `main`. It imports `getAuthToken` from
   `@open-mercato/core/helpers/integration/api`; after `signInBrowser` it takes a new administrator token with it. With
   the second factor that login answers a provisional token, which the activities route refuses.
4. Merged `origin/main` (`cc3de13d`) into the PR head: no conflicts.
5. E27-S01 now imports `getAuthToken` from `../_fixtures/auth`, like every other spec this PR moved. Grepped the specs
   `main` brought in for the platform import and raw `/api/auth/login` calls: E27-S01 was the only one.
6. Added lesson `qa-tests-take-get-auth-token-from-the-auth-fixture`.

## Decisions

- No lint or verify guard for the platform import: `.ai/qa/tests/**` is outside ESLint, and a new check script is
  tooling beyond this fix (it would need its own tests at 100 % coverage). Suggested as a follow-up instead.

## Files changed

- `packages/app/.ai/qa/tests/activities/E27-S01-declaration-share-report.spec.ts`
- `.ai/lessons/qa-tests-take-get-auth-token-from-the-auth-fixture.md`
- `.ai/runs/2026-11-26-issue-736-pr-831-merge-train-e27-s01.md`

## Commands and results

- `yarn test:integration:vereino --filter E27-S01`: `1 passed (58.5s)`.
- `NODE_OPTIONS=--max-old-space-size=8192 yarn verify`: `[verify] all 23 step(s) passed`.
- `yarn lessons:check`: catalog valid.
- `yarn guard`: no blocking findings.

## Open problems / next steps

- The train re-runs the PR once the new commit is pushed; the owner's QA (`needs-qa`, `risk-high`) still holds it.
