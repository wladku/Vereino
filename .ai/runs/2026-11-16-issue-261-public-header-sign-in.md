# Run: #261 — E09-S07 the club's menu on every public page and the club on the sign-in page

- **Goal and trigger:** unattended cezar run (task dd62a065) of `om-auto-fix-issue` on #261, queued by the `cezar` label. Feature route: spec N phase 7 (REQ-N09, REQ-N10; TEST-N09; AC-N09, AC-N10; DD-N10; V-N05b).
- **Spec:** `.ai/specs/2026-11-14-vereino-parity-navigation-and-naming.md` (Ready for implementation; Ask First items 3 — `club.nav`, `?club=` on `/login`, the `vereino_club` cookie — and 6 — `PublicHeader` in `@vereino/ui` — approved by the owner on 2026-11-15 on #251). **Issue:** #261, epic #251. **Branch:** `feat/issue-261-public-header-club-sign-in`.

## Steps

1. Concurrency check (no assignee, no `in-progress`, no PR referencing #261) and claim: assignee, `in-progress`, `🤖` claim comment. Branch renamed from `cez/261`.
2. Read the spec's phase 7, the owner decisions on #251, the three public frames, `club_core/services/public-site.ts`, the `facilities` and `activities` public services, the request confirmation route and page, the platform `auth/frontend/login.tsx` and the app catalog merge order (the app catalog is merged last, so it overrides the platform's keys). The #195 PR (`club.links`) was the template for every touch point.
3. `@vereino/ui`: `public/public-nav.ts` (`publicNavLinks`, `publicClubHref`, `publicSignInHref`, `PUBLIC_HEADER_LABEL_KEYS`) and `public/public-header.tsx` (`PublicHeader`); unit tests `public-nav.test.mjs`, `public-header.test.mjs`.
4. `club_core`: `clubNav(publication)` in `lib/public-page.ts` (unit test); `nav` in the club, section and frame shapes of `services/public-site.ts`; `publicClubNavSchema` in both public routes' OpenAPI; the new `clubFrameForScope(scope)` for a page whose token named the club. `facilities` and `activities` get `nav` through `clubFrame`; their OpenAPI club schemas gain it.
5. The three frames (`PublicFrame`, `PublicFacilitiesFrame`, the session page's `Frame`) render `PublicHeader` with `next/link`, `usePathname` and their own `*.nav.*` catalog keys (pl, en). The request confirmation answer carries `club` (from `clubFrameForScope`) and the page shows the header once the link is confirmed.
6. Sign-in: `club_core/lib/sign-in-club.ts` (slug from `?club=` or the cookie, cookie assignments; unit test), `club_core/components/SignInClubHeader.tsx` (reads `GET /api/club_core/public/{slug}` through `usePublicClub`, writes or forgets the cookie), `src/app/login/page.tsx` (server part reads `searchParams.club` and `cookies()`, localized title). App catalog overrides in all five locales; `public/open-mercato.svg` is the Vereino mark.
7. TEST-N09 as `.ai/qa/tests/club_core/TEST-N09-public-header-sign-in.spec.ts`; spec changelog entry `2026-11-16-issue-261-public-header-sign-in.md`.

## Decisions

- **`club.nav.events` is always false** until the `events` publication block arrives with P-06 (E09-S09); the header already renders the link when the flag is true, so phase 9 only flips it.
- **"Facilities" follows the `places_calendar` block** alone, as the spec says; a club with the block on and no public place gets the facilities page's own "does not share facility calendars" notice.
- **Request confirmation:** the verify answer adds `club` read by `clubFrameForScope` inside the scope the token record named — no slug lookup and no trust in the URL's slug. Before the link is confirmed, and for a spent or expired link, the club is unknown and the header shows the page title only (spec UI table: "club unknown (title only)").
- **The club on `/login` is read client-side** through the existing public route, as the issue says; the server part only picks the slug (`?club=` wins over the cookie, even when malformed — then nothing is shown). A failed read keeps the cookie; only a settled 404 forgets a remembered slug.
- **Card subtitle:** the tagline sits in the club header above the card, so the card's subtitle override is "Sign in to your account" / "Zaloguj się na swoje konto" rather than repeating it; the neutral page carries Vereino's name through the card (`auth.login.brandName`).
- **Club logo on `/login` is decorative** (`alt=""`, the club's name stands next to it), like every other public club logo.
- **Two slices, one commit each** as the issue proposes, when each slice passes the typecheck on its own.

## Commands and results

- `yarn workspace @vereino/ui test` → 147 passed, 100 % lines/branches/functions (incl. `public-nav.ts`, `public-header.tsx`).
- `yarn verify` (first run) → failed at `typecheck`: `sign-in-club.test.ts(9,1): error TS2593: Cannot find name 'describe'` — added `import { describe, expect, it } from '@jest/globals'` as the other `club_core` lib tests do.
- `yarn verify --from typecheck` → failed at `lint`: `TEST-N09…spec.ts 91:22 error … no-unnecessary-type-conversion` and `sign-in-club.ts 25:22 error Invalid type "number" of template literal expression`; fixed both and dropped the redundant `usePathname() ?? ''` (lint warnings) in the three frames.
- `yarn verify --from lint` → failed at `ds:check`: `src/app/login/page.tsx:25:43 [arbitrary-tailwind]` (`[&>div]:min-h-0 [&>div]:flex-1`); replaced by the scoped class `.vereino-login-body > div` in `globals.css` (precedent: `.schedule-calendar`).
- `yarn verify --from ds:check` → `[verify] all 11 step(s) passed` (ds:check … build); generate … format:check passed in the runs before.
- `yarn test:integration:vereino --filter TEST-N09` → `1 passed (1.8m)` (first run).
- Regression of the touched pages: `--filter E02-S05` → `3 passed (4.1m)`; `--filter TEST-040` → `2 passed (2.3m)`; `--filter E06-S07b` → `1 passed (1.6m)`; `--filter TEST-039` → `1 passed (1.8m)`.
- Commits: header slice `feat(club_core): the club's menu on every public page (E09-S07a, #261)`; sign-in slice with this log.

## Review round (PR #327)

An independent review agent (read-only, given the diff and the requirements, not my conclusions) approved with no blockers or majors. Applied:

- **Minor 1 — TEST-N09 skipped the "after a sign-in" step:** the test now signs in through the form, checks that `vereino_club` survived, signs out and opens `/login` again. The first run failed on the next admin API call (`Expected: 200, Received: 401`): a new password ends the user's API tokens (lesson `sign-in-browser-ends-the-api-token`); a fresh token is taken after the sign-in.
- **Minor 2 — a stale cookie survived `?club=` naming the same slug:** the header now forgets the cookie whenever its slug (`rememberedClub(document.cookie)`, unit-tested) no longer resolves, whatever the source; TEST-N09 covers it.
- **Minor 4 — `aria-current="page"` on "Sections" for a section page:** it is `location` now (`PublicNavCurrent`); `PublicLinkProps` allows `page | location`.
- **Minor 5 — three copies of the header labels:** `src/__tests__/ui/public-nav-catalogs.test.ts` checks the three prefixes hold the same value per key in pl and en.
- **Nits:** the loading placeholder is a `role="status"` with an sr-only `vereino.login.clubLoading` label; the `.vereino-login-body` rule names the platform markup it depends on.
- **Kept — minor 3 (the full club page read for name and logo):** the spec names `GET /api/club_core/public/{clubSlug}` for this read; the rate limit and the 60 s shared cache are the public pages' own. A slim frame endpoint would be a new public contract (Ask First). The XHR's two 404 codes (`public_page_disabled` / `public_page_not_found`) are the existing public API; the rendered sign-in page is the same for both.

Results after the fixes: `yarn workspace @vereino/ui test` 147 passed, 100 %; `yarn verify` → `[verify] all 17 step(s) passed`; `yarn test:integration:vereino --filter TEST-N09` → `1 passed (1.6m)` (after the token fix); eslint, `typecheck:qa` and `format:check` clean on the final test change.

## Open problems and next steps

- The "Events" header link and P-06 come with E09-S09; skeletons on public pages with E09-S10.
