# Run log — PR #831: merge main, fix image-smoke (#736)

- **Goal and trigger:** cezar task `om-auto-fix-pr 831`. The PR conflicted with `main` (`CONFLICTING`/`DIRTY`) and the
  CI check `image-smoke` failed. Merge `main` in (no force-push, no history rewrite), make `image-smoke` green, never
  merge.
- **Spec / issue / branch:** `.ai/specs/implemented/2026-11-26-vereino-staff-second-factor.md`, #736, PR #831, head
  `feat/issue-736-staff-second-factor` (worked on a detached HEAD at its origin tip; pushed with
  `git push origin HEAD:feat/issue-736-staff-second-factor`).

## Steps

1. Checked the PR: same-repository head (no fork), owner-authored, no open claim by another run.
2. Read the failing `image-smoke` job log: `PASS health`, `PASS sign-in page`, `PASS security headers`,
   `FAIL no-store — GET /api/auth/profile answered 401`. Cause: the smoke account is the super-admin, who now holds
   `foundation.second_factor.required`; `POST /api/auth/login` answers a provisional `mfa_pending` token, so the
   profile call is refused. `image-smoke.sh`'s later `GET /api/auth/users` call had the same problem.
3. Merged `origin/main` (`fb196f46`). Two conflicts, both with social sign-in's club hand-off (DD-S07, #783):
   - `foundation/api/identity/[provider]/callback/route.ts`: `main` moved `signIn`/`link`/`finish` into
     `api/identity/round-trip.ts`. Took `main`'s route and moved the PR's Google-only refusal (DD-2F06) into
     `round-trip.ts` `signIn`, where it now also guards the hand-off on a club's address; the refusal lands on the
     club's address (`finish(…, marker.club)`).
   - `foundation/services/identity.ts` `issueSession`: kept the PR's shared `issueUserSession`/`setSessionCookies` and
     `main`'s redirect to the club origin.
4. Fixed the smoke: `scripts/smoke.mjs` gains `signIn` (finishes a challenge with the newest code from an
   `OM_TEST_MODE` e-mail capture), `latestSignInCode` and `captureReader` (`VEREINO_SMOKE_EMAIL_CAPTURE`); without the
   capture a challenged sign-in fails with that hint. `scripts/image-smoke.sh` runs the app container alone with
   `OM_TEST_MODE=1` and the capture in a mounted directory of the run (auth limits stay on: no
   `OM_TEST_AUTH_RATE_LIMIT_MODE`), and its RBAC call signs in through the same helper.
5. Added lesson `sign-in-gate-changes-reach-the-image-smoke`.

## Decisions

- `OM_TEST_MODE=1` on the image-smoke app container instead of exempting the smoke account or weakening the gate: it
  only adds the e-mail capture and the platform's integration replay interceptor; the boot guard forbids it on Railway
  only, and the post-deploy `smoke.mjs` use is unchanged (an account without the second factor, or a clear failure).
- No new dependency, migration or contract change; no Ask First item touched.

## Commands and results

- `yarn typecheck` — pass (after `yarn install` + `yarn generate` in this worktree).
- `yarn test:scripts` — 672 pass, 0 fail; `scripts/smoke.mjs` 100 % lines/branches/functions.
- `bash scripts/image-smoke.sh` (local Docker) — `PASS no-store — Cache-Control: private, no-store`, `smoke: passed`,
  `PASS: pre-deploy, initialize, app (Redis cache) and worker run from the runner image`.
- `yarn test:integration:vereino --filter TEST-S05` — 1 passed; `--filter TEST-2F03` — 1 passed;
  `--filter TEST-S01` — 1 passed.
- `yarn verify`: first run failed at `lint` with `FATAL ERROR: … JavaScript heap out of memory` (eslint of
  `@vereino/app`, default heap); with `NODE_OPTIONS=--max-old-space-size=8192` lint passed, then `format:check` named
  `smoke.test.mjs` and `round-trip.ts`; after `yarn format`, `yarn verify --from format:check` — all 17 steps passed
  (generate/typecheck passed in the first run).
- `yarn guard` — no blocking findings.

## Open problems / next steps

- The local `lint` step needs a larger Node heap on this server (CI's `gate` passes); not changed here.
- CI on the pushed head decides the rest; the merge train and the owner's QA (`needs-qa`, `risk-high`) own the merge.
