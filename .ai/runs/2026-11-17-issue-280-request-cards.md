# Run: issue #280 — an administrator decides a booking request from a card with every fact (E11-S06)

- **Goal and trigger:** cezar task (`om-auto-fix-issue 280`, issue labelled `cezar`). Build phase 6 of the facilities
  parity spec: B-25 as a card per request (DD-R16), the owner in the approval intro, the extended queue response.
- **Spec / issue / branch:** `.ai/specs/implemented/2026-11-14-vereino-parity-facilities.md` phase 6 (REQ-R08; TEST-R10; AC-R06;
  J-R02 steps 3–5); #280 (epic #253, depends on #275, merged); `feat/issue-280-admin-booking-request-card`.
- **Approval:** the spec is `Ready for implementation` (owner decisions on #253, 2026-11-16). Its *Compatibility* line
  approves additive API changes ("new response fields"), which covers the issue's Ask First item (the new fields of
  `GET /api/facilities/rentals/requests`). No migration, no dependency, no new module.

## Steps

1. Claimed #280 (assignee, `in-progress`, claim comment).
2. Slice (a), the response: `services/request-queue.ts` — each conflict gains `label` (what staff see, via
   `calendarEntries` + `staffEntryLabel`, read only when the request collides with something); each item gains `payee`
   (`placePayee`, once per place), `regulationsAcceptedAt` and `emailVerifiedAt` (the entity's `usedAt`). The route's
   OpenAPI schema, the client type `RequestQueueItem` and the QA fixture's `QueueItem` follow.
3. Slice (b), the cards: `components/RequestsQueue.tsx` rewritten without `DataTable` — one `article` per request headed
   "renter — place"; the expiry badge ("expires Wed 18:40") with the time left; slot · units × 90 min · category;
   Contact / Purpose / Estimated amount with `payeeLabel` in a grid that stacks under 768 px; the collision alert naming
   each entry, or the "no conflict" badge; the ban check badge (match or not); "rules accepted online" and "e-mail
   confirmed" when the timestamps exist; Approve / Reject (full width under 640 px — the design system has no 480 px step and `ds:check` refuses arbitrary variants, so `w-full sm:w-auto` covers "under 480 px"); "Load more" through
   `useRequestQueuePages` (`useInfiniteQuery`); card skeletons while loading. `RequestDecisionDialogs.tsx`: the approval
   dialog's description is the intro naming the place, the slot and the owner (`approve.intro`) or the club
   (`approve.introClub`); the dialog's collision list shows the labels too. Catalog keys `facilities.requests.card.*`,
   `subtitle`, `loadMore`, `approve.intro`, `approve.introClub` added (en, pl, texts from the mockup's
   `b.screenRequests.*`); five keys only the table used removed.
4. Tests: TEST-R10 (`TEST-R10-request-cards.spec.ts`); TEST-039 follows the cards (no row menu any more);
   `lapseRequestHold` added to `_fixtures/facility-requests.ts`.
5. Spec changelog entry `.ai/specs/changelog/2026-11-14-vereino-parity-facilities/2026-11-17-issue-280-phase-6.md`; the
   spec stays `Ready for implementation`.

## Decisions

- The spec's `collisions[].label` is the existing `conflicts[]` array gaining `label`: a second array with the same
  entries would duplicate the contract. `units` was already in the response.
- The approval intro does not promise a charge: the charge on approval is E11-S11 (#285), out of scope here. It says
  where the rental is paid and what the e-mail contains.
- The `facilities.requests` DataTable and its extension-table ID (`facilities.requests`, entity
  `facilities:rental_request`) go with the table, as DD-R16 decides; no module injects into them. Flagged in the PR.
- The time left stays visible under the expiry badge, because REQ-R08 names "the time left" as a fact.

## Commands and results

- `yarn verify` run 1 — generate, typecheck, typecheck:packages, typecheck:qa, lint (0 errors, old warnings
  elsewhere) and format:check passed; failed at `ds:check`:
  `src/modules/facilities/components/RequestsQueue.tsx:173:22 [arbitrary-tailwind] Use the design-system scale instead
  of arbitrary Tailwind values.` (and lines 184, 273: `max-[479px]:w-full`). Replaced with `w-full sm:w-auto`.
  `yarn verify --from ds:check` — every remaining step passed (ds:check … test 49 s, test:scripts 16 s, build 247 s).
- `yarn test:integration:vereino --filter TEST-R10` run 1 — failed in setup: `Error: [internal] no request row for the
  token` (`_fixtures/facility-requests.ts:164`). Cause: the worktree's `packages/app/.env` sets `AUTH_SECRET`, which the
  app prefers over the runner's random `JWT_SECRET`, while the Playwright process hashes with `JWT_SECRET` (lesson
  `local-env-auth-secret-breaks-token-hash-lookups`). Re-run with an exported `AUTH_TOKEN_SECRET`.
- TEST-R10 run 2 — failed at the axe step: serious `color-contrast` and `label-content-name-mismatch` at 1280 px only
  (768 px clean), in both locales and schemes. Both rules are in `PLATFORM_BASELINE` for the AppShell sidebar, back and
  brand links (visible only at desktop width); the scans now pass `platformBaseline: true` like the other backend tests,
  which still fails on the same rules in Vereino markup.
- TEST-R10 run 3 — 1 passed (3.0 min). `--filter TEST-039` — 1 passed (2.4 min).
- Checked that no other test asserts an exact key list of a queue item or of its `conflicts` (TEST-035, TEST-036 use
  `toMatchObject`), so the widened response breaks no existing assertion.
- Final full `yarn verify` on the finished tree — all 17 steps passed (generate 37 s … build 89 s).

## Open problems / next steps

- Phases 7–9 and 11–16 of the spec are separate issues; the menu count badge is E09-S06.
