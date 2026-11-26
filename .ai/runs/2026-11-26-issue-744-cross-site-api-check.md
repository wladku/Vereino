# Run: issue #744 — cross-site request check for cookie-authenticated API mutations (ENG-Q-11)

- **Trigger:** Cezar run of `om-auto-fix-issue 744` (label `cezar`), 2026-11-26.
- **Issue:** #744 (E25-S10, epic #734). Owner decision on ENG-Q-11 recorded on the issue 2026-11-26: the default
  `Origin` / `Sec-Fetch-Site` check in `src/proxy.ts`, "Build it".
- **Spec:** engineering standards (`.ai/specs/2026-10-21-engineering-standards-and-patterns.md`, S8.9, ENG-Q-11) —
  covering spec reused (`reuse-spec`); no new spec.
- **Branch:** `feat/issue-744-cross-site-api-check` (Cezar worktree).

## Steps

1. Read the issue, the owner decision, S8.8/S8.9/ENG-Q-11 and the ASVS rows owned by #744. Claimed the issue
   (assignee, `in-progress`, `🤖` claim comment naming the worktree and branch).
2. Read the platform auth extraction (`@open-mercato/shared/lib/auth/server`): bearer wins over the `auth_token`
   cookie; API keys come from `x-api-key` or `Authorization: ApiKey`. Session cookies: `auth_token`, `session_token`,
   `customer_auth_token`, `customer_session_token`. Only webhook route of enabled modules:
   `/api/payment_gateways/webhook/[provider]`. The social sign-in callback is `GET` only, so no legitimate
   cross-site `POST` reaches `/api`.
3. Added `packages/core/src/cross-site-request.ts` (`crossSiteApiVerdict`, `isInstanceOrigin`, `hasSessionCookie`,
   `CROSS_SITE_REQUEST_ERROR_CODE`) with 100 % unit coverage, exported from `@vereino/core`.
4. `packages/app/src/proxy.ts`: the matcher now also covers `/api/:path*`; on `/api` the proxy runs the verdict and
   answers a refusal with `403 { error, code: 'cross_site_request_refused' }` and `no-store`, otherwise passes the
   request through unchanged (no `x-next-url` header on API requests, as before).
5. Integration test `ISSUE-744-cross-site-api-check` (platform): foreign `Origin`, `Sec-Fetch-Site: cross-site` and
   `Origin: null` with the cookie → 403 and nothing changed; own origin → 200; bearer with a foreign origin → 200;
   Stripe webhook with cookie and foreign origin reaches the signature check (401); on a second app process with
   `VEREINO_CLUB_DOMAIN`, a club subdomain and the bare club domain → 200, a two-label look-alike → 403.
6. Docs: ENG-Q-11 answered and S8.9 rewritten in the standards; spec changelog file; ASVS V3.5.1 and V3.5.2 → met,
   V3.5.4 owner → #743, V3.5 section row updated.

## Decisions

- **Only requests carrying a session cookie are checked.** Sessionless public routes and API clients without a
  cookie cannot be forged against a user's session; checking them would add refusals without protection.
- **A request without `Origin` passes** unless `Sec-Fetch-Site: cross-site`: browsers send `Origin` on every non-GET
  fetch and form post, so a missing one is not a browser's cross-site request; `SameSite=Lax` stays below.
- **Allowed origins:** the request's own host (also covers a club's custom domain, D-036 point 4), the first
  `x-forwarded-host`, the host of `APP_URL`, the bare club domain and exactly one DNS label under it. A deeper
  subdomain is refused.
- **Webhook exemption by path:** `/api/webhooks/…` and `/api/<module>/webhook(s)/…` (S8.8: webhook routes verify
  signatures).
- **ASVS V3.5 section stays `partial`** although the issue's acceptance criterion says "met": the checklist's own rule
  makes a section met only when every requirement is; V3.5.3 (no app-wide test that `GET` changes nothing) and V3.5.4
  (club hosts not live) are still "to verify", now owned by #743. V3.5.1 and V3.5.2, the requirements this issue
  covers, are met.
- **Not done here:** V3.3.1 and V3.3.3 (`__Host-` cookie prefix) are also owned by #744 in the ASVS files but are outside
  its acceptance criteria and would need platform cookie names changed (S3.1); flagged in the PR for the owner.

## Commands and results

- `node --test … src/__tests__/cross-site-request.test.mjs` (packages/core): 15 tests pass, 100 % lines, branches,
  functions on `cross-site-request.ts`.
- `yarn test:integration:vereino --filter ISSUE-744`: 3 passed (47.9 s). The runner's trailing
  `Next.js production server exited unexpectedly with exit code 143` is the server's SIGTERM at shutdown; exit 0.
- `yarn verify`: all 23 steps passed; `yarn guard`: no blocking findings.

## Files changed

- `packages/core/src/cross-site-request.ts`, `packages/core/src/__tests__/cross-site-request.test.mjs`,
  `packages/core/src/index.ts`
- `packages/app/src/proxy.ts`
- `packages/app/.ai/qa/tests/platform/ISSUE-744-cross-site-api-check.spec.ts`
- `.ai/specs/2026-10-21-engineering-standards-and-patterns.md`,
  `.ai/specs/changelog/2026-10-21-engineering-standards-and-patterns/2026-11-26-issue-744-cross-site-api-check.md`
- `docs/compliance/asvs-checklist.md`, `docs/compliance/asvs-requirements.md`
- this run log

## Open problems / next steps

- Owner: re-home the `__Host-` cookie-prefix rows (V3.3.1, V3.3.3) that still name #744.
