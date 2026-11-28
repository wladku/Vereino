# Run: issue #906 — installed web app polish (maskable icon, theme colour, navigation preload)

- **Trigger:** cezar task `80992ca4` (`om-auto-fix-issue 906`), unattended.
- **Issue:** #906 (E31-S02, follow-up of #873 / PR #882; epic #867). Owner-authored, no open questions, no Ask First item (no migration, no dependency; the manifest's new `icons` entries and the icon route's new `maskable-*` values are additive).
- **Branch:** `feat/issue-906-installed-app-polish`; worktree `/home/wkuc/vereino-cezar/.ai/cezar/worktrees/80992ca4-6786-4a97-9fc5-2800aea504eb`.
- **Spec:** none per story (as #873, an `om-backlog` story); the issue is the design authority, with D-045 and D-029.

## Steps

1. Claimed the issue (assignee, `in-progress`, `🤖` claim comment naming this run).
2. Read PR #882's surfaces: `lib/web-app.ts`, `services/web-app.ts`, `src/app/manifest.ts`, `src/app/app-icon/[size]/route.tsx`, `src/app/layout.tsx`, `public/sw.js`, the E31-S01 integration test and lesson `app-route-handlers-use-the-api-bootstrap`.
3. **Maskable icon.** Pure helpers in `lib/web-app.ts`: `webAppIconRequest` (`192`, `512`, `180`, `maskable-192`, `maskable-512`), `webAppLogoSide` (maskable: the largest square inside the 80 % safe-zone circle, `floor(0.8·size/√2)`), `webAppInitialFontSize` (0.40 instead of 0.55), `webAppIconPath(size, version, purpose)`. The manifest lists the two `any` icons, then the two maskable ones. The icon route draws the purpose and keys its in-memory cache by it. Vereino's mark already fits the safe zone (its V reaches 33 % of the side from the centre, the safe zone 40 %), so both purposes draw it unchanged.
4. **Theme colour.** `webAppThemeColor` (club colour, else `#171717`) is shared by the manifest and a new `requestThemeColor()` in `services/request-club.ts` (pages and layouts only: the page bootstrap, per the lesson), which reads `clubCorePublicSite.clubFrame` for the slug `webAppClubSlug` picks (club address, or the one-club instance's `VEREINO_HOME_CLUB_SLUG`). The root layout's `generateViewport` returns it as `themeColor`; a non-club address does no lookup.
5. **Navigation preload.** `public/sw.js` enables `registration.navigationPreload` on `activate` where supported and answers a navigation with `event.preloadResponse ?? fetch(request)`, falling back to the offline page on failure. Nothing new is cached.
6. Unit tests for every new function (`web-app.test.ts`, 100 %). Extended `E31-S01-installable-web-app.spec.ts`: maskable icon entries, a 404 for `maskable-180`, pixel checks that the maskable 512 px icon keeps white padding where the `any` icon shows the logo, `theme-color` on the club address, the instance address and after unpublishing, and `navigationPreload.getState().enabled`.
7. Docs: `BACKWARD_COMPATIBILITY.md` §10 (maskable icon paths stable; preload responses never stored), club_core README.

## Decisions

- Maskable icons use a path value (`/app-icon/maskable-512`) on the existing `[size]` route, not a query parameter or a new route: one handler, cache keys stay per path, and the `?v=` version parameter keeps its meaning.
- No dark-mode `theme-color` variant: the manifest has a single `theme_color`, and the issue asks for the brand colour.
- The theme colour reads the club frame on every page render of a club address (one indexed slug lookup plus the club name), the same read the public pages already do; no cache was added.

## Commands and results

- `npx jest src/modules/club_core/lib/__tests__/web-app.test.ts --coverage` (in `packages/app`): 20 passed, `web-app.ts` 100 % statements, branches, functions, lines.
- `NODE_OPTIONS=--max-old-space-size=8192 yarn verify`: first run failed at `format:check` (`packages/app/src/modules/club_core/lib/__tests__/web-app.test.ts is not formatted`); after `prettier --write`, `yarn verify --from format:check` passed all remaining 18 steps (the first 6 had passed).
- `yarn test:integration:vereino --filter E31-S01`: 4 passed (59.9 s).
- `yarn guard`: no blocking findings.

## Open problems / next steps

- Drawing WebP logos still needs `sharp` (Ask First; out of scope per the issue).
