# Run: #263 — E09-S09 the public Events page P-06, the Today messages tile and the primary-payer badge

- **Goal and trigger:** unattended cezar run (task 18c3979c) of `om-auto-fix-issue` on #263, queued by the `cezar` label. Feature route: spec N phase 9 (REQ-N13, REQ-N14; TEST-N14, TEST-N15).
- **Spec:** `.ai/specs/2026-11-14-vereino-parity-navigation-and-naming.md` (Ready for implementation; Ask First item 4 — the P-06 route, `public_events_disabled`, the `activities.publicEvents` contribution, the `events` block and the removal of `events[]` — approved by the owner on 2026-11-15 on #251; PR #250 merged). **Issue:** #263, epic #251. **Branch:** `feat/issue-263-public-events-page`.

## Steps

1. Checked the issue's three blocking questions against the tracker: spec `Ready for implementation`, PR #250 merged, owner approval recorded on #251. Claimed the issue (assignee, `in-progress`, `🤖` comment).
2. Read the #91 public block mechanism (`club_core/services/public-blocks.ts`, `public-site.ts`), `activities.publicSchedule`, the mock-up `screenPublicEvents` / `screenSectionPage` / M-02 tile and its catalog texts.
3. Slice (a), commit 1:
   - `club_core/lib/publication.ts`: block `events` (default off); the B-03 form lists it from `PUBLICATION_BLOCKS`, so the toggle needed only its two catalog keys.
   - `club_core/services/public-blocks.ts`: `PUBLIC_EVENTS_PROVIDER_TOKEN` and `PublicEventsProvider`; `public-site.ts`: `publicEvents(clubSlug, sectionSlug | null)`, `club.nav` on the club and section pages, a shared `publicSections` read.
   - Route `api/public/[clubSlug]/events/route.ts` (metadata with the public rate limit, OpenAPI), error code `public_events_disabled`.
   - `activities`: pure `lib/public-events.ts` (lists, 60-day cut, map URL) with a 100 % test; `services/public-events.ts` registered as `activities.publicEvents`; the `clubBlock` (the club page's `events[]`) and `publicEventsBlock` removed from `activities.publicSchedule`.
   - `club_core` directory: `isExternal` on `PlaceDirectoryEntry` (additive).
   - `groups.publicCatalog`: `ageCategory` (dictionary label, teams only).
   - UI: `PublicEventsView.tsx` and `frontend/p/[clubSlug]/events`, the event card moved out of `PublicClasses.tsx`; "Events" link in `PublicFrame` from `club.nav.events`; `PublicNotice` takes an action; the section 404 offers "Club page"; the category badge on team cards; `PublicClubView` lists no events.
   - Tests: TEST-N14 (new); TEST-037, E02-S05, J-001, the publication and error-code unit tests updated.
4. Slice (b), commit 2: the Messages tile reads `GET /api/communication/threads?as=member&unread=1&pageSize=1` (count = `total`, newest subject linked) or "No new messages."; the ward card shows "Primary payer" (`ward.guardianship.isPrimaryPayer`, already in `/api/people/me`). TEST-N15 (new).
5. Module READMEs, the spec changelog entry and this log.

## Decisions

- **`publication.blocks.events`, not a top-level `publication.events`:** every other block lives in `blocks`, the resolver, the patch schema and the B-03 form already handle it, and the entity default stays as it is (a stored value without the key reads as off) — so no migration, as the spec requires.
- **`club.nav` now, the header later:** E09-S07 (#261) is still open, so the flag ships with the API and the current `PublicFrame` shows a plain "Events" link; #261 replaces the header and extends `club.nav`. Without it P-06 would be unreachable once the club page loses its list.
- **The response adds `sections` (filter chips) and `section` (the applied filter)** to the spec's `{ club, upcoming, past }`, plus `endDate` for multi-day camps and `sectionLogo` per event — additive.
- **Unknown or disabled publication → `public_events_disabled`** (the spec's "while the publication or the block is off"), unknown slug → `public_page_not_found`.
- **Map link only for `is_external` places:** OpenStreetMap pin when the place has coordinates, else an address search, else none.
- **Lists capped at 50 each**, sessions read with `end_at` ≥ the 60-day cut minus a day of slack; the exact club-zone cut is in the pure function.
- **M-10 reuses `people.guardianships.primaryPayer`** ("Primary payer" / "Główny płatnik") instead of a new key; M-02 adds `communication.tile.all` and `communication.tile.noNew` and drops the unused `communication.tile.description`.
- **The tile keeps the query key** `communication-unread-count`, which the thread page invalidates after marking a thread read.

## Commands and results

- `yarn typecheck` → clean (after fixing a missing import in `PublicFrame.tsx`: `TS2304 Cannot find name 'PublicClubNav'` / `'eventsHref'`).
- `jest` on the changed libs → first run failed `error-codes.test.ts` (the new code missing from the expected table); fixed. Then 308 passed; `public-events.ts`, `public-schedule.ts`, `publication.ts`, `public-catalog.ts` at 100 % statements/branches/functions/lines.
- `yarn verify` → `[verify] all 17 step(s) passed`.
- `yarn test:integration:vereino --filter TEST-N14` → run 1 failed: `ageCategoryOptions` returned `{"status":200,"items":[]}` (a new club has no dictionary until `seedAgeCategories`); run 2 failed: `{"code":"event_type_not_allowed"}` 422 for a sparring through `/api/activities/events` (that route takes tournaments and other events only; matches and sparrings are activities with an opponent). Run 3: `1 passed (2.6m)`.
- `yarn test:integration:vereino --filter TEST-N15` → two attempts stopped before any test with `Could not find a working container runtime strategy` (Docker not answering; left alone, a background job waited until `docker info` answered). Then run 1 failed only on axe: `label-content-name-mismatch` (serious, 1 node) on `/club` in every locale and scheme — the "All" link had `aria-label` "Open the messages"; the visible text now stays in the name with an `sr-only` suffix. Run 2: `1 passed (2.3m)`.

- Regression: `--filter TEST-037` → `2 passed (2.7m)`; `--filter TEST-M10` → `1 passed (2.1m)`; `--filter E06-S16` → run 1 failed (`getByTestId('club-tile-messages-error')` not found: the test aborted the old `/api/communication/threads/unread-count` URL, which the tile no longer reads); the route now aborts `**/api/communication/threads?*`; run 2 `1 passed (2.2m)`.
- Final `yarn verify` after the last changes → `[verify] all 17 step(s) passed`.

## Open problems

- Before merging (spec, *Compatibility*): confirm that no Railway `staging`/`production` service exists (`BACKWARD_COMPATIBILITY.md` gap); if one does, `events[]` must stay as a deprecated empty list for one minor release.
- Release note: clubs that showed events on the club page lose that list on deploy until an administrator turns the `events` block on (off by default, owner decision 2026-11-15).

## Next steps

- E09-S07 (#261) moves the "Events" link into `PublicHeader` driven by `club.nav.events`.
