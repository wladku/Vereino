# Run: issue #736 — staff second factor, phase 1

- **Goal and trigger:** cezar task fd18ddde (`om-auto-fix-issue 736`, label `cezar`). Build phase 1 of
  `.ai/specs/2026-11-26-vereino-staff-second-factor.md` (approved by the owner on #805; Q-2F01…Q-2F05 answered
  2026-11-26): club administrators, treasurers and the platform super-admin sign in with Google or a password plus an
  e-mailed code; Google-only social sign-in for them; reset by an administrator or the operator.
- **Issue:** #736 (epic #734) · **Branch:** `feat/issue-736-staff-second-factor` · **Spec:** status `Ready for
  implementation` (unchanged: phase 2 is still to come).
- **Ask First:** the spec, its new routes, features, error codes, events and the login wrapper patch were approved with
  the spec on #805 (status `Ready for implementation`, owner answers on #736 and #805). No migration and no new
  dependency.

## Steps

1. Claimed #736 (assignee, `in-progress`, 🤖 claim comment naming this worktree and branch); renamed the task branch.
2. Read the installed platform seams again (`login.ts`, `mfaPendingAccess.ts`, `server.ts`, `jwt.ts`,
   `session/refresh.ts`, `rbacService.userHasAllFeatures`, `AuthService`), the sign-in limit wrapper (#738), social
   sign-in services and the integration fixtures.
3. `@vereino/core`: `SECOND_FACTOR_REQUIRED_FEATURE` on the club administrator and the treasurer,
   `foundation.second_factor.reset` on the administrator, `gainsSecondFactorRequirement`; tests (no role holds
   `api_keys.*` or a `foundation.*` wildcard).
4. `foundation`: pure rules in `lib/second-factor.ts` (100 % unit coverage); `second-factor/{requirement,challenge,
   gate,complete,operator,routes}.ts`; the link-free session issuer `services/session-issuer.ts` (Google sign-in uses
   it); the gate in `src/app/api/auth/login/route.ts` (a challenge does not clear the per-account count);
   `verify`/`resend` registered with the MFA-pending gate from `di.ts`; the Google-only branch of the identity callback;
   session end in `syncAuthRoles`; the reset command, route, CLI (`second-factor reset|end-sessions`) and dialog;
   `/login/second-factor` and the `?second_factor=` sentences; error codes, events, en/pl catalogs.
5. Integration fixtures: `_fixtures/auth.ts` (`getAuthToken` with the platform signature, `signInWithPassword`,
   `signInBrowserContext`, `finishSignInOnPage`) completes the e-mailed code from the `OM_TEST_MODE` capture; 105
   specs switched their `getAuthToken` import, 17 inline browser logins, `signInBrowser`, `signInThroughForm`,
   TEST-M03, TEST-N09, TEST-L15 and E09-S05 use the helpers. The capacity seed completes the code the same way.
6. TEST-2F01…TEST-2F04; isolation inventory rows (`reset` foreign-id with club B's treasurer, `verify`/`resend`
   exempt) and `refs.treasurerUser` in the seed.
7. Docs: ASVS checklist and requirement rows (V6.3.3, V6.4.4, V6.5.x, V6.6.2–3 met; V6.8.4 text), the summary
   counts recomputed from the rows (they were already stale before this run), `docs/ops/deploy.md` → *Staff second
   factor*; spec changelog file `2026-11-26-issue-736-phase-1.md`; lesson
   `module-files-loaded-by-node-never-import-next-server`.

## Decisions and reasons

- **Hourly challenge cap through the platform rate limiter**, not the cache under a lock: the limiter counts
  atomically, a degraded limiter refuses (503, fail closed), and the integration suite — which signs the super-admin in
  hundreds of times an hour — counts it only with the test limiter header, as every other limit. Attempts and resends
  stay in the marker under the advisory lock (DD-2F08).
- **`verify` answers `token` too**, as the platform's login does: API clients and the fixtures need the full token.
- **Code e-mail in the request's locale**: the person is on the page in that language; the stored person locale is
  `people`'s.
- **`/login/second-factor` is an app route** beside `/login`; it reads the masked address from the provisional cookie
  server-side and sends a browser without one to `/login?second_factor=expired`.
- **The gate is not exported from the module index**: plain-Node loaders of the index cannot resolve `next/server`
  (first integration start failed, see lesson). The requirement check lives in `second-factor/requirement.ts`.
- **TEST-2F03 item 2 (Facebook refused) is not driven**: social sign-in phase 1 ships no Facebook sign-in, so the
  branch is unreachable today.

## Commands and results

- `yarn workspace @vereino/core test`: 153 tests, 100 % coverage.
- `jest lib/__tests__/second-factor.test.ts --coverage`: 15 tests, 100 % statements/branches/functions/lines.
- `node --test scripts/__tests__/vereino-capacity-seed.test.mjs` with coverage: 18 tests, `vereino-capacity-seed.mjs`
  100 %.
- `yarn typecheck`, `tsc -p .ai/qa/tests/tsconfig.json`: clean. `yarn route-isolation:check`: 245 routes, 0 problems.
- First `yarn test:integration:vereino --filter TEST-2F01`: the app never became ready —
  `Cannot find module '…/node_modules/next/server' imported from …/command-loaders.generated.mjs` (fixed, lesson).
- TEST-2F01 then failed on the test itself (`A coordinator role needs a section`; `/backend` redirects through the
  session refresh before `/login`), fixed in the test.
- TEST-2F02 first failed with `net::ERR_CONNECTION_REFUSED`: a Tab from the e-mail field reached the injected Google
  link; the test now presses Enter in the password field.
- Final: TEST-2F01, TEST-2F02, TEST-2F03, TEST-2F04 each passed locally (`1 passed`).

## Open problems and next steps

- Phase 2 (Google required when connected, profile line, unlink routing) is a separate PR; `Closes #736` belongs there.
- The rollout steps of `docs/ops/deploy.md` → *Staff second factor* run with the release that ships this PR.
