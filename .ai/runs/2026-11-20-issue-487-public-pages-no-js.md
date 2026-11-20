# Run: om-auto-fix-issue 487 — public club pages without JavaScript, titled with the club's name

- **Goal and trigger:** cezar task `om-auto-fix-issue 487` (issue labelled `cezar`, 2026-11-20), unattended; the owner
  asked mid-run to continue autonomously to the end.
- **Spec / issue / branch:** issue #487 (E20-S08, epic #479, UX audit of 2026-11-20); covering spec
  `.ai/specs/2026-10-20-vereino-club-management.md` (P-01, P-02, P-06; P-03 from the facilities spec, P-T1 from the club
  events spec) updated by a changelog file; branch `feat/issue-487-public-club-pages-no-js`.
- **Approval:** no migration, no new module, no dependency, no public contract change (the catch-all change and the
  `foundation` export are additive, internal surfaces per `BACKWARD_COMPATIBILITY.md`).

## Steps

1. Claimed #487 (assignee, `in-progress`, `🤖` claim comment naming this worktree and branch).
2. Read the public pages: each `page.tsx` rendered a client view whose `useQuery` fetched `GET /api/club_core/public/…`
   (or `/api/facilities/public/…/places`), so the server HTML held only a skeleton; the title came from `page.meta.ts`.
3. `foundation/services/public-route-load.ts` (`loadPublicRoute`): runs a module's own public API handler in process,
   consuming the handler's rate limit (same config and key prefix, client IP from the request headers); null on a
   spent limit or a failure, so the page falls back to the browser fetch.
4. Pure mappers `club_core/lib/public-load.ts` (`publicLoadOf`, `previewText`) and `facilities/lib/public-load.ts`
   (`publicFacilitiesLoadOf`), shared by the browser fetch and the server render; unit tests at 100 %.
5. Server loaders and metadata (`components/public/public-server.ts` in both modules); the five `page.tsx` became async
   server components passing `initial` to the views, with a static `generateMetadata` on the default export.
6. `src/app/(frontend)/[...slug]/page.tsx`: forwards `searchParams` to the page and merges a page's static
   `generateMetadata` (public routes only) over the route title.
7. i18n: `club_core.public.documentTitle`, `club_core.public.meta.*`, `facilities.public.documentTitle`,
   `facilities.public.places.metaDescription` (en, pl).
8. Integration test `club_core/E20-S08-public-pages-without-js.spec.ts`.

## Decisions

- **The API handler, not the service, is the server's data source** — the issue asks to keep the public API the single
  data source; calling `GET` in process keeps its status codes, its 404 bodies and its rate limit.
- **The view shows the server's state directly, never through the query cache.** First version seeded `useQuery` with
  `initialData`; the test then showed a club that stopped publishing still rendering its page. `@open-mercato/ui`'s
  `QueryProvider` keeps one module-level `QueryClient`, so on the server all requests share one query cache, and a query
  that already holds data ignores `initialData`. Now the view renders `initial ?? query.data` and turns its query off
  while it has `initial` (lesson `frontend-page-server-data-and-metadata`). The shared server-side `QueryClient` is a
  platform issue worth reporting upstream (epic #479 decision 7).
- **Metadata as a static property** of the page's default export: the route manifest's `load()` returns only the
  default export, so a module-level `generateMetadata` would never be called.
- **Titles:** "{club} — {page}" (P-02 the section's name, P-T1 the event's name) with the same `og:title`, `og:site_name`
  = club, and a description of public text only (the club's/section's/event's public description, else a translated
  sentence with the club's name). A page that is not `ok` keeps the route title, so an unknown or unpublished club shows
  the same notice and title as before.

## Files changed

- `packages/app/src/app/(frontend)/[...slug]/page.tsx`
- `packages/app/src/modules/foundation/{index.ts,services/public-route-load.ts}`
- `packages/app/src/modules/club_core/`: `lib/public-load.ts` (+ test), `components/public/{public-client.ts,
  public-server.ts,PublicClubView.tsx,PublicSectionView.tsx,PublicEventsView.tsx,PublicClubEventView.tsx}`,
  `frontend/p/[clubSlug]/{page.tsx,sections/[sectionSlug]/page.tsx,events/page.tsx,events/[eventSlug]/page.tsx}`,
  `i18n/{en,pl}.json`
- `packages/app/src/modules/facilities/`: `lib/public-load.ts` (+ test), `components/public/{public-client.ts,
  public-server.ts,PublicPlacesView.tsx}`, `frontend/p/[clubSlug]/places/page.tsx`, `i18n/{en,pl}.json`
- `packages/app/.ai/qa/tests/club_core/E20-S08-public-pages-without-js.spec.ts`
- `.ai/specs/changelog/2026-10-20-vereino-club-management/2026-11-20-issue-487-public-pages-server-rendered.md`,
  `.ai/lessons/frontend-page-server-data-and-metadata.md`, this log.

## Commands and results

- `yarn typecheck`, `yarn typecheck:qa` — pass. `yarn lint` — 0 errors. Unit tests of both `public-load.ts` — 11 passed,
  100 % lines, branches and functions.
- `yarn test:integration:vereino --filter E20-S08`:
  - run 1: `Test timeout of 600000ms exceeded` — the negative case read `getAttribute` of a missing `og:title`, which
    waits for the element; changed to `toHaveCount(0)`.
  - run 2: `getByTestId('public-disabled')` not found after `publication.enabled = false` — the stale page described
    under Decisions (reproduced against a live app: API 404, page HTML still the club page); fixed in the views.
  - run 3: `1 passed (39.0s)`.
- Regression runs of the existing public page tests and the full `yarn verify`: see the PR.

## Open problems / next steps

- Report the module-level `QueryClient` of `@open-mercato/ui` `QueryProvider` (shared across server requests) upstream.
- P-04 (facility calendar) and the session page `/p/[clubSlug]/s/[occurrenceId]` still render on the client; they were
  outside the issue's list.
