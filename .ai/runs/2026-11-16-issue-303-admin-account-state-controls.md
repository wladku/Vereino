# Run: issue #303 — E13-S01 account state, invitation again, login e-mail, block

- **Goal and trigger:** cezar task (`om-auto-fix-issue 303`, label `cezar`): build phase L1 of `.ai/specs/2026-11-14-vereino-people-life-cycle-and-data-entry.md` (REQ-L01, REQ-L02; TEST-L01, TEST-L02, TEST-L19 account state, TEST-L20 these routes).
- **Spec / issue / branch:** spec `Ready for implementation` (owner approval 2026-11-16 on #255, Ask First items 7 — the new events — and 12 — the V-L01 fallback — approved); issue #303; branch `feat/issue-303-admin-account-state-controls`.

## Steps

1. Claimed #303 (assignee, `in-progress`, 🤖 comment). Feature route: spec found and Ready, no open PR for the issue.
2. V-L02 read in the installed platform (`@open-mercato/core` 0.9.0): `auth.users.update` with `isConfirmed = false` deletes the user's sessions; `api/login.ts` refuses an unconfirmed user (`account_deactivated`); `lib/sessionIntegrity.ts` refuses an unconfirmed user's session. Block = `isConfirmed = false`, no fallback needed. Google sign-in (D-027) is not built.
3. `@vereino/core`: `accountState` (pure, 100 % covered).
4. `foundation/services/accounts.ts`: `accountView`, `resendInvitation` (V-L01 fallback: `authService.requestPasswordReset` + the platform `ResetPasswordEmail` with Vereino copy naming 60 minutes, sent through the `foundation.emailSender` seam), `updateAccount` (`auth.users.update`), `closeAccount` (`auth.users.delete`).
5. `people`: commands `people.persons.resend_invitation`, `.update_account`, `.close_account`; guards `services/account-guards.ts` (`last_club_admin`, `account_has_purpose`); limits `lib/account-limits.ts` (pure, unit-tested) + `services/account-limits.ts`; routes `POST …/account/invitation`, `PUT`/`DELETE …/account`; `account` on `GET /api/people/persons/{id}`; events `people.person.account_updated`, `.account_closed`; error codes; `AccountPanel.tsx`; i18n en/pl.
6. Integration spec `.ai/qa/tests/people/TEST-L01-account-state-and-actions.spec.ts` (TEST-L01, TEST-L02, TEST-L20); three existing specs now expect "Invited" for a freshly created account instead of "Account active".

## Decisions

- **Re-send transport:** direct send through `foundation.emailSender` (not the dispatch outbox) so the route can answer `warning: invite_email_failed` synchronously, as `create_account` does.
- **Cross-tenant e-mail:** `requestPasswordReset(email)` looks the user up across tenants; when it resolves to another user than the person's, no e-mail is sent and the result is the warning (fail closed).
- **429 in integration:** `OM_INTEGRATION_TEST` disables the platform limiter, so a request carrying the platform's opt-in (`OM_TEST_MODE=1`, `OM_TEST_AUTH_RATE_LIMIT_MODE=opt-in`, header `x-om-test-rate-limit: on`) uses a process-local enabled memory limiter; production uses `rateLimiterService` and fails open.
- **Versions:** `PUT …/account` checks and advances the person's `updatedAt`; the re-send and the close take no version (not record edits).
- **`account_not_found` (404)** added for an action on a person without an account in the club.
- **Last administrator:** counted among persons with an active `club_admin` assignment whose account is `active`.

## Files changed

See the PR diff: `packages/core/src/account-policy.ts` (+ test), `packages/app/src/modules/foundation/{services/accounts.ts,index.ts,i18n/*,README.md}`, `packages/app/src/modules/people/{commands/accounts.ts,services/account-guards.ts,services/account-limits.ts,lib/account-limits.ts,lib/__tests__/account-limits.test.ts,lib/error-codes.ts,events.ts,data/validators.ts,api/shared.ts,api/persons/[id]/route.ts,api/persons/[id]/account/route.ts,api/persons/[id]/account/invitation/route.ts,components/AccountPanel.tsx,components/PersonRecord.tsx,components/client-helpers.ts,i18n/*,README.md}`, integration specs, spec changelog entry.

## Commands and results

- `yarn workspace @vereino/core test`: pass, 100 % coverage.
- `yarn generate`: pass. `yarn typecheck`: pass.
- `jest src/modules/people/lib/__tests__/account-limits.test.ts`: 3 passed.
- `yarn test:integration:vereino --filter TEST-L01` (first run): TEST-L20 passed; TEST-L01 failed `expect(received).toBe(expected) Expected: 2 Received: 1` (no re-sent e-mail in the capture) and TEST-L02 `Expected: > 0 Received: 0`. Cause: the e-mail was passed as `React.createElement(ResetPasswordEmail, …)`, an unexpanded element, so the capture saw no link; fixed by calling `ResetPasswordEmail({ resetUrl, copy })` as the platform does. Second run: 3 passed (4.6m).
- `yarn verify`: failed at lint (3 errors in the new code: boolean compare, `String()` on a string, a single-use type parameter), then at format:check, then at test (the `people-rules` error-code table test lists every code; added the four new ones). Final full `yarn verify`: all 17 steps pass.
- Existing specs edited for the invited state: `--filter E06-S02` 1 passed; `--filter TEST-006` 2 passed; `--filter J-001` 1 passed.

## Open problems / next steps

- Platform deep imports (`auth/emails/ResetPasswordEmail`, `auth/lib/tenantHint`, the `AuthService` type) are the reset e-mail approved as the V-L01 fallback; `.ai/guides/framework-contracts.md` does not list them, so a platform upgrade must re-check them.
- Earlier unused invitation links stay valid until they expire (V-L01 fallback, as the spec records).
- Spec stays `Ready for implementation`; phases L2–L10 remain (#304…#312). AC-L01 ticked; AC-L02 stays open until phase L4 adds "cannot be made to leave".
- Next: review of the PR and UI QA (`needs-qa`).
