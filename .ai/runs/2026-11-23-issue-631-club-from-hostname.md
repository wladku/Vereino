# Issue #631 — resolve the club from the request hostname (E22-S05, many clubs phase 3)

- **Date:** 2026-11-23
- **Agent / tool:** Claude Code (Opus 5.5) via Cezar, `om-auto-fix-issue` (repo-local override), feature route
- **Trigger:** `cezar` label on issue #631 (re-added by the owner after recording the phase-3 approvals)
- **Spec / issue / branch:** `.ai/specs/2026-11-22-vereino-many-clubs-one-instance.md` phase 3; #631 (epic #626);
  `feat/issue-631-resolve-club-request-hostname`
- **Status:** done — PR opened, review by the owner pending

## Goal

Build phase 3 within the owner's approvals of 2026-11-23 on #631: option (c) for the platform contract (club
resolution, `/`, public pages, Vereino e-mail links and the club name as sender; the platform reset and notification
base URL stay on `APP_URL`), `VEREINO_CLUB_DOMAIN`, `VEREINO_HOME_CLUB_SLUG` deprecated not removed, the `/p/<slug>`
redirect, `docs/ops/deploy.md`, and one central social sign-in callback host.

## Steps

1. Claim check: no assignee, no `in-progress`, two earlier Cezar runs had stopped before claiming; the owner's approval
   comments cover every phase-3 Ask First item. Claimed (assignee, `in-progress`, `🤖` comment).
2. Read the spec, the home route, the sign-in page, the frontend catch-all, the backend layout, the public site
   service, the e-mail render and dispatch worker, the composer and share-text services, the platform login page
   (`?tenant=`), the platform `sendEmail` (`from`, test capture) and the integration runner.
3. `@vereino/core` `club-url.ts`: `clubDomain`, `clubOrigin`, `senderAddress`, `senderWithDisplayName` (node:test,
   100 %).
4. `club_core/lib/club-host.ts` (`requestHost`, `publicPageRedirect`, `instancePageRedirect`, `sessionHostRedirect`,
   `clubHostHome`, `signInTenantRedirect`; Jest, 100 %); `clubAddress` now uses `clubOrigin`.
5. `clubCorePublicSite.clubForHost` (same D-024 slug lookup, answers for unpublished clubs too) and
   `club_core/services/request-club.ts` (reads only the `Host` header; not in DI).
6. Pages: `/` (landing / club routing / 404 / session of another club), `/login` (club's `?tenant=`, club header from the
   host), frontend catch-all (`/p/<slug>` redirect, `/reset` back to `APP_URL`, session check on auth routes), backend
   layout (session check). `ClubLanding` with `club_core.landing.*` keys in en/pl.
7. E-mail: `ClubFacts.publicSlug` (people resolver), `renderEmail` links from the club's address and returns `from`
   (`foundation.email.senderName`, en/pl), the dispatch worker passes it; composer thread link and activities share
   text use the club's address.
8. Docs: `.env.example`, `docs/ops/deploy.md` (*Club addresses*, variables), `BACKWARD_COMPATIBILITY.md`, spec risk row
   and changelog file, social sign-in spec DD-S07 and its changelog file, deprecation note in `home-route.ts`.
9. Integration tests: TEST-M02/TEST-M03 (`club_core/TEST-M03-club-address.spec.ts`, a second `next start` process on the
   same build and database with `VEREINO_CLUB_DOMAIN=localhost:<port>`), TEST-M04
   (`club_core/TEST-M04-club-email-links.spec.ts`, dispatch in the messaging probe with the variable set; the probe's
   `routeGet` gained an opt-in `withBody`).

## Decisions

- **The URL helper lives in `@vereino/core`, not in `foundation/lib`:** four modules use it (foundation, club_core,
  communication, activities) and it is framework-free; a `club_core/lib` import of `@/modules/foundation` would pull the
  whole foundation into pure unit tests.
- **Scheme of a club address** comes from `VEREINO_CLUB_DOMAIN` when written there, else from `APP_URL` (so a test domain
  with a port works over http); production is https either way.
- **Only the `Host` header** selects the club; the proxy is unchanged (it does not cover `api/` routes, so a header set
  there could be forged).
- **`/` on a club address redirects to `/p/<slug>`** like the one-club home route; `/p/<slug>` does not redirect on its
  own club's host, so there is no loop.
- **Sign-in on a club address** redirects to `/login?tenant=<club tenant>`: the platform page already scopes the login
  to that tenant, so club B's form refuses club A's account without a platform override.
- **Session of another club** (only possible with a copied cookie or a tenant-less login after "Clear"): redirected to
  the user's own club address in the home route, the frontend catch-all (auth routes) and the backend layout.
- **Option (c):** `/reset` on a club address goes to `APP_URL`; account invitations and the resend keep
  `getSecurityEmailBaseUrl` (they link to the reset page). No platform override.
- **Unknown host:** `/` answers 404 (the platform's default not-found page). A global `not-found.tsx` with the landing
  content would change every 404 of the app, so it was left out.
- **Sender:** `"<club> via Vereino" <address of NOTIFICATIONS_EMAIL_FROM>`, localized per recipient; passing `from`
  skips a tenant channel's own configured from-address (`fromIsInstanceDefault`), which no Vereino environment uses.
- **Social sign-in** is not built (spec Draft); the approval is recorded as DD-S07 in its spec.

## Results

- `yarn workspace @vereino/core test`: pass, 100 % lines/branches/functions (`club-url.ts` included).
- `npx jest club-host.test.ts club-onboarding.test.ts --coverage`: 30 tests pass, both files 100 %.
- `yarn test:integration:vereino --filter TEST-M03-club-address`: `2 passed` (TEST-M03 6.1 s, TEST-M02 1.9 s); rerun after
  the cleanup refactor: `2 passed (49.4s)`.
- `yarn test:integration:vereino --filter TEST-M04-club-email`: `1 passed (48.9s)`.
- `yarn verify`: first run failed at `typecheck:packages`, verbatim
  `src/club-url.ts(24,26): error TS2532: Object is possibly 'undefined'.` (regex capture groups under
  `noUncheckedIndexedAccess`; fixed by reading `match[0]`). The resumed run failed at `secrets:check`
  (`packages/core/src/__tests__/club-url.test.mjs:68 [email] no-rep***`; test addresses moved to `vereino.test`). Then
  one full run: every step `pass`, exit 0.
- `yarn guard`: no blocking findings.
- Lint errors fixed on the way: `no-confusing-void-expression` (2) in `_fixtures/club-domain.ts`,
  `no-unnecessary-type-conversion` in the TEST-M03 spec.

## Files changed

- `packages/core/src/club-url.ts`, its test, `index.ts`
- `packages/app/src/modules/club_core/lib/club-host.ts` (+ test), `lib/club-onboarding.ts` (+ test), `lib/sign-in-club.ts`,
  `lib/home-route.ts`, `services/public-site.ts`, `services/request-club.ts`, `components/ClubLanding.tsx`, `i18n/{en,pl}.json`
- `packages/app/src/app/page.tsx`, `app/login/page.tsx`, `app/(frontend)/[...slug]/page.tsx`, `app/(backend)/backend/layout.tsx`
- `packages/app/src/modules/foundation/services/{email-render,dispatch-worker,audience}.ts`, `foundation/i18n/{en,pl}.json`
- `packages/app/src/modules/people/services/{audience,club-clock}.ts`, `communication/services/composer.ts`,
  `activities/services/share-text.ts`
- `packages/app/.ai/qa/tests/_fixtures/club-domain.ts`, `_fixtures/messaging-probe/probe.mjs`,
  `club_core/TEST-M03-club-address.spec.ts`, `club_core/TEST-M04-club-email-links.spec.ts`
- `packages/app/.env.example`, `docs/ops/deploy.md`, `BACKWARD_COMPATIBILITY.md`
- `.ai/specs/2026-11-22-vereino-many-clubs-one-instance.md` (risk row), `.ai/specs/2026-10-27-vereino-social-sign-in.md`
  (DD-S07), two changelog files, lesson `env-dependent-integration-tests-use-a-second-app-process`, this log

## Open problems and next steps

- Platform-sent mail (notifications, invitations) and the password reset stay on `APP_URL` until the owner decides
  option (a) or (b).
- An unknown host shows the platform's default 404 page, not the landing content.
- Exit gate (two clubs at two subdomains on staging) needs the wildcard DNS record and certificate (owner action, D12).
- Social sign-in's central callback is designed (DD-S07), not built.
