# Run: issue #289 — the public places, calendar and request confirmation as the mockup shows them

- **Trigger:** cezar task 94cfb413 (`issue.labeled` `cezar` on #289), `om-auto-fix-issue 289`, feature route.
- **Issue / branch:** #289 (E11-S15) / `feat/issue-289-guest-public-places-view`.
- **Spec:** `.ai/specs/2026-11-14-vereino-parity-facilities.md` phase 15 (REQ-R16, TEST-R16, AC-R12); status `Ready for implementation`. The verify `summary` and the new public-read fields are covered by Ask First item 5 ("additive response fields on … verify …", phase 15 named), approved by the owner on 2026-11-16 (#253). Q-R16 and Q-R17 confirmed there too.

## Steps

1. Concurrency check: no assignee, no `in-progress`, no open PR for #289. Claimed it (assignee, `in-progress`, 🤖 comment).
2. Read the spec rows of P-03…P-05, the mockup (`docs/ux-concept/mockups/app.ts` `screenPublicPlaces`, `screenPublicPlace`, `screenVerify` and their `p.*` texts) and the current code. Address, surface and the per-place mode were already in the places read; what was missing was the club-level mode (the intro), the owner, the summary, the 409 slug and the club's frame on the non-ok states.
3. Backend:
   - `club_core` `PublicSiteResult` gains an optional `frame` on `not_found` / `disabled`, filled when the slug lookup found a club that publishes its page but not the places calendar (`findPlacesClub`) or not the place (`publicPlace`). This keeps the one approved slug lookup (AGENTS.md D-024/D-026) instead of a second `clubFrame(slug)` call.
   - `clubCorePublicSite.publicPlaceSlug(scope, placeId)`: the place's slug inside a trusted scope, only while its calendar is public.
   - `GET …/public/{clubSlug}/places` gains `onlineRequests`; `…/schedule` gains `owner` (`placePayee` name; null = the club); their 404/400 bodies carry `club` while known.
   - `POST …/public/requests/verify` gains `summary` (decrypted with `findOneWithDecryption` inside the token's scope; never the phone); 409 `slot_unavailable` carries `placeSlug` (the verify command's two slot checks merged so both answer with it). 410 unchanged (no data).
4. UI: P-03 hero intro by mode, "address · surface", badge with status tones, disabled state with the club phone; P-04 info notice naming the owner (or the club's account), the phone list starting today in the current month, today marked, "Show earlier days", today marked on the grid too; P-05 summary card with the requester line and the estimate payable to the owner, "Back to the calendar" on 409, the club frame from the places read in every state. en/pl texts from the mockup.
5. Tests: new `TEST-R16-public-pages.spec.ts`; TEST-028's disabled assertions moved to `uiText` and the phone.

## Decisions

- The frame on error states comes from the existing slug lookup's result, not a second lookup, to stay within the sessionless-lookup exception.
- The verify page reads the club for its frame from the places read of the URL's club slug: the 409 and 410 answers carry no club data (410 carries nothing by the spec).
- A 409 on verify rolls the redemption back (unchanged), so the same link keeps answering 409 with the slug.
- The places-read fields `address` and `surface` already existed; the spec's "places read gains surface, address and mode" is met by adding the club-level `onlineRequests`.
- `facilities.public.disabled.title` / `.message` reworded to the mockup ("The club does not share facility calendars" / "Ask the club about free slots."), with `.call` when a phone is published.

## Files changed

- `packages/app/src/modules/club_core/services/public-site.ts`
- `packages/app/src/modules/facilities/api/public-shared.ts`, `api/public/[clubSlug]/places/route.ts`, `…/[placeSlug]/schedule/route.ts`, `api/public/requests/verify/route.ts`
- `packages/app/src/modules/facilities/commands/requests.ts`, `services/public-schedule.ts`, `services/request-queue.ts`
- `packages/app/src/modules/facilities/components/public/{public-client.ts,PublicFacilitiesFrame.tsx,PublicPlacesView.tsx,PublicScheduleView.tsx,RequestVerifyView.tsx}`
- `packages/app/src/modules/facilities/i18n/{en,pl}.json`
- `packages/app/.ai/qa/tests/facilities/TEST-R16-public-pages.spec.ts` (new), `TEST-028-public-schedule.spec.ts`
- `.ai/specs/changelog/2026-11-14-vereino-parity-facilities/2026-11-18-issue-289-phase-15.md`, this log

## Commands and results

- `yarn typecheck`: passed.
- `yarn verify`: `[verify] all 17 step(s) passed`.
- `yarn test:integration:vereino --filter TEST-R16`: `1 passed (2.7m)`.
- `yarn test:integration:vereino --filter TEST-028`: `1 passed (2.2m)`.

## Open problems / next steps

- The public header itself is E09-S07 (navigation spec phase 7); this story does not wait for it.
