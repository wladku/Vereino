# Run: issue #737 — staff session lifetime and re-authentication before an e-mail change (ENG-Q-12)

- **Goal and trigger:** cezar task (`om-auto-fix-issue 737`, run 3f022d99). Build the owner's ENG-Q-12 decision of
  2026-11-26 ([#737 comment](https://github.com/wladku/Vereino/issues/737#issuecomment-7183797300)): "remember me"
  hidden for staff and `REMEMBER_ME_DAYS` low in production; a 30-minute staff idle timeout (S8.5); the current
  password before an e-mail change; ENG-Q-12 recorded as answered.
- **Spec:** `.ai/specs/2026-10-21-engineering-standards-and-patterns.md` (S8.5, ENG-Q-12); epic #734 (E25-S03).
- **Issue:** #737 · **Branch:** `feat/issue-737-staff-session-lifetime`
- **Route:** feature with an owner decision and acceptance criteria in the issue; no new module, dependency or
  migration; new routes are additive (no breaking contract).

## Findings that shaped the design

- The platform checks the session row named by the JWT's `sid` on every request and refuses it once `expires_at`
  passed (`auth/lib/sessionIntegrity.ts`); `refreshFromSessionToken` never extends it. So narrowing and moving that
  row's `expires_at` from app code enforces an idle timeout on the server without patching `auth` (S3.1).
- The API dispatcher runs no `before` interceptors for custom routes; `auth/login` runs `after` interceptors with the
  JWT in the body, and a throwing `after` interceptor fails the sign-in (500, no cookies) — fail closed.
- `PUT /api/auth/profile` refuses `currentPassword` without a new password (its schema), so the platform route cannot
  carry an e-mail confirmation; it does answer a command interceptor's rejection with its status and body.
- Who is staff: the login screen cannot know the account before sign-in (hiding the checkbox per e-mail would
  enumerate accounts), so "remember me" is neutralised on the server for staff instead of hidden.
- The platform's `getAuthToken` test helper caches tokens for 45 minutes; a 30-minute idle timeout would expire cached
  staff tokens mid-run, so the timeout is configurable (`VEREINO_STAFF_IDLE_MINUTES`) and the runner sets 60.

## Decisions

1. **Staff = any role besides `vereino_member` and `vereino_payer`** (catalogue flag `memberSession`), platform roles
   and unknown roles included — fails closed. A session policy, not an authorization check.
2. **Idle timeout on the server:** sign-in (password via the `foundation.staff-session` login interceptor, Google via
   `issueSession`) sets a staff session's `expires_at` to now + idle; `POST /api/foundation/session/activity` moves it
   to now + idle, never past sign-in + 8 h. The interceptor drops the "remember me" refresh token for staff, so no
   30-day `session_token` cookie is set. Members keep the platform lifetime.
3. **Activity = user input**, not background polling: `src/components/StaffSessionActivity.tsx` (backend layout, and the
   member layout on `/club/**` for coaches) notes pointer/key/wheel/touch input, shares it across tabs through
   `localStorage`, reports at most once a minute and signs out when idle.
4. **E-mail confirmation:** `PUT /api/foundation/profile/email` checks the current password, then runs
   `auth.users.update` with the auth context marked by a module-private symbol; the command interceptor
   `foundation.email-change-confirmation` refuses every other own e-mail change (403
   `email_change_confirmation_required`), whatever the route. An administrator changing another user's e-mail is
   untouched. The route has a 10 per 15 min rate limit (password guessing from a stolen session).
5. **UI:** both backend profile pages (`/backend/auth/profile`, `/backend/profile/change-password`) are replaced by a
   programmatic page-route override (`src/backend-page-overrides.ts`, run by the backend catch-all) with the same form; a new e-mail
   needs the current password. A `page:` component override was tried first and did not render (see lesson
   `backend-page-replacement-uses-route-override`).
6. `REMEMBER_ME_DAYS=7` and `VEREINO_STAFF_IDLE_MINUTES=30` in production (`docs/ops/deploy.md`, `.env.example`).

## Files changed

- `packages/core/src/staff-session.ts` (+ test), `roles.ts` (`memberSession`), `index.ts`
- `packages/app/src/modules/foundation/`: `api/interceptors.ts`, `commands/interceptors.ts`,
  `api/session/activity/route.ts`, `api/profile/email/route.ts`, `services/staff-session.ts`,
  `services/own-email.ts`, `services/identity.ts`, `lib/email-change.ts` (+ test), `lib/profile-change.ts` (+ test),
  `lib/error-codes.ts`, `components/ProfileSettingsPage.tsx`, `i18n/{en,pl}.json`; `packages/app/src/backend-page-overrides.ts`, `src/app/(backend)/backend/[...slug]/page.tsx`
- `packages/app/src/components/StaffSessionActivity.tsx`, `src/app/(backend)/backend/layout.tsx`,
  `src/app/(frontend)/layout.tsx`
- `packages/app/.ai/qa/tests/foundation/TEST-737-staff-session-and-email-confirmation.spec.ts`,
  `_fixtures/isolation/inventory/foundation.json`
- `packages/app/scripts/vereino-ephemeral.mjs`, `packages/app/.env.example`
- Docs: engineering standards (S8.5, ENG-Q-12) + changelog file, `docs/ops/deploy.md`,
  `docs/compliance/{asvs-checklist,asvs-requirements,dpia}.md`

## Commands and results

- `yarn workspace @vereino/core test` — pass, 100 % coverage (staff-session.ts included).
- `npx jest` on the two new foundation lib tests — 7 passed.
- `yarn generate`, `yarn typecheck` — pass.
- `yarn test:integration:vereino --filter TEST-737` — first run failed at the own-change check through
  `PUT /api/auth/users` (403 without a code — most likely the feature guard of the users route answered before the command ran); the step now uses the person record's account route on the
  administrator's own account.
- Second run: the API part passed on the first attempt; the browser step did not find the replaced profile page (the
  `page:` component override did not apply on the server render), and the retry got 403 on the confirmed e-mail route:
  the confirmation mark was a plain `Symbol()`, and the route and the command interceptor load separate copies of
  `lib/email-change.ts` in the production server bundles. Fixes: page-route override in `src/modules.ts`;
  `Symbol.for(...)`.
- Third run: the app never became ready — the CLI bootstrap compiles `src/modules.ts` with esbuild and could not
  bundle the page import. Fix: `applyPageRouteOverrides` in `src/backend-page-overrides.ts`.
- Fourth run: **1 passed**. `--filter E06-S22` (opens the replaced change-password page): **1 passed**.
- `yarn verify`: first failed at `secrets:check` (literal passwords in test inputs — now generated or
  whitespace values), then `format:check`, then `test` (`foundation/lib/__tests__/error-codes.test.ts` lists every
  code); final full run **all 23 steps passed**. `yarn guard`: no blocking findings.
- Final TEST-737 run on the committed code: passed (rerun after the test-input edits).

## Labels and risk

The issue carries `risk-medium`; the PR is `risk-high` (sessions and auth, SDLC risk table) with `needs-qa` and the
Polish QA instruction block.

## Open problems / follow-ups

- Upstream report for Open Mercato (not filed by this run): no session lifetime hook — an idle timeout and a
  per-role lifetime need app code writing the platform's `sessions` row.
- Users still cannot list or end their own sessions (ASVS V7.5.2), and concurrent sessions are not documented
  (V7.1.2): moved to #742 in the checklists.
- A Google-only account without a password cannot confirm an e-mail change; it sets a password through the reset
  link first.
- Staff sessions opened before the deploy keep their old expiry until their first activity report.
