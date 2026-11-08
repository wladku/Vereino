# Run — issue #124: the public facility list and calendar (E08-S04)

- **Goal and trigger:** cezar task cf4a2314 (`om-auto-fix-issue 124`), unattended. Build facilities spec phase 5 step 5 — the place fields "public schedule" and "accepts requests" (B-06), the sessionless list of a club's facilities (P-03) and a facility's month (P-04) with zones and states and without personal data (REQ-014, TEST-024, TEST-028).
- **Spec / issue / branch:** `.ai/specs/2026-10-27-vereino-facilities.md` (In progress, phase 5); #124 (epic #119); `feat/issue-124-public-facility-schedule`.
- **Approval:** the owner's comment on #124 (2026-11-08) approves the `club_core` migration adding `public_slug` (unique per organization), `is_public_schedule` and `accepts_online_requests` to `club_core_places`, confirms #122 merged, settles Q1 (a month via `?month=`, a grid on wide screens, a day list on a phone) and asks to build after #123 (merged as #226). Nothing else was Ask First: no dependency, no other migration, no `db:migrate`.

## Steps

1. Checked the prerequisites (approval comment, #122 and #123 merged on `main`), claimed #124 (assignee, `in-progress`, claim comment), renamed the task branch.
2. `club_core`: the three `Place` columns and the partial unique index `club_core_places_org_public_slug_unique` (live places with a slug); `Migration20261108175804_club_core.ts` generated offline (`DATABASE_URL` unreachable), header added; validators, snapshot/restore/undo, 422 `place_public_slug_required` (`placePublicationProblem`, unit-tested), 409 `public_slug_taken` from the index (create, update, undo); list fields and OpenAPI.
3. `club_core/services/public-site.ts`: `publicPlaces`, `publicPlace`, `placeFile` after the one slug lookup (DD-35), gated by the club page and its `places_calendar` block (`disabled`) and an active place with `is_public_schedule` and a slug (DD-29); reads only public columns (never the encrypted contacts or the internal description); `PublicClubFrame` gains `publishedBlocks`. New route `GET /api/club_core/public/{clubSlug}/places/{placeSlug}/files/{fileId}` (photos, regulations PDF) through `attachmentService.readScoped` with the exact owner and assignment. The place file owner and assignment constants moved to `lib/files.ts`.
4. `facilities/lib/public-schedule.ts` (pure, 100 % coverage): the readable months, a day as merged stretches with a state ranked closed > club > booked > requested > zone, the zones clipped to the opening windows, `canRequest`, minutes of an interval on a club-zone date, the public rates.
5. `facilities/services/public-schedule.ts` and the routes `GET /api/facilities/public/{clubSlug}/places` and `…/places/{placeSlug}/schedule?month=` (`metadata.GET.rateLimit`, `public, s-maxage=60`, no server cache — DD-45); 404 `public_place_not_found` / `public_places_disabled`, 400 `public_schedule_month_invalid`; the `facilities.publicPlaces` block links the club page to P-03.
6. UI (B-06 group and columns, the club page link, P-03, P-04, en + pl, `TEST-028-public-schedule.spec.ts`): delegated to one subagent with disjoint files. It added `facilities/components/public/*` (a `PublicFacilitiesFrame` of its own, because the ESLint module boundary forbids value imports of `club_core`'s `PublicFrame`), the two thin pages, a "Public calendar" group on the place form (checkboxes — CrudForm has no switch — the slug, a live address preview; 409 `public_slug_taken` mapped to the slug field), Yes/No badge columns, the "Facilities" card on the club page, and a day list under `md` / month grid from `md` with a text legend; a 400 month shows "Month not available" with a link to the current month. It reported `yarn generate`, `yarn typecheck`, `yarn typecheck:qa`, eslint, prettier, `yarn ds:check`, `yarn contracts:check` green, `yarn i18n:check-hardcoded --strict` with no finding in `facilities` or `club_core`, and `--filter TEST-028` 1 passed (1.7 min) on the first run. The coordinator reviewed the diff and reflowed one comment.
7. Integration: `TEST-024-public-schedule.spec.ts` with the shared fixture `_fixtures/public-places.ts`.

## Decisions

- **The phone on P-04** is the club's phone, shown with the club's `contact` block (the same rule as the page footer). The place's own contacts are encrypted personal data (`{ role, name, phone }`) and are never published.
- **Closures show "closed" without the reason** (the spec's "without the kind"); the place's zone `closed` shows the same state.
- **State ranks:** a closure wins a minute over a club entry, a club entry over a rental, a rental over a held request, an entry over a zone. Entries outside every zone still show (a club session at a time with no zone rule is "taken by the club").
- **Month range:** from the previous club month to twelve months ahead; anything else 400. Bounds the scraping surface the risk table names; staff see history in `/club/places`.
- **Rates:** only the public renter categories (`municipal_club`, `external_commercial`) in force on any day of the month; the winter-lighting rate is staff-only.
- **The file route lives in `club_core`**, which owns the place files and the publication rules; `facilities` only builds the month.
- **"Request a booking"** is E08-S05; the month already carries `canRequest` per slot and the page marks requestable slots without a form.

## Files changed

See the commits; areas: `packages/app/src/modules/club_core/{data,lib,commands,api,services,migrations,components,i18n}`, `packages/app/src/modules/facilities/{lib,services,api,frontend,components,i18n,di.ts}`, `packages/app/.ai/qa/tests/{_fixtures/public-places.ts,facilities/TEST-024-public-schedule.spec.ts,facilities/TEST-028-public-schedule.spec.ts}`, the facilities spec, two changelog entries and this log.

## Commands and results

- `npx jest src/modules/facilities/lib/__tests__/public-schedule.test.ts --coverage` — 19 tests pass, `public-schedule.ts` 100 % statements, branches, functions, lines.
- `npx jest src/modules/facilities/lib src/modules/club_core/lib` — 16 suites, 158 tests pass.
- `yarn generate`, `yarn typecheck`, `yarn typecheck:qa` — ok. `DATABASE_URL=<unreachable> yarn db:generate` — only `club_core` changed (the three columns and the index).
- `yarn contracts:check` — 8 modules, 183 error codes, 0 problems. `yarn spec-changelogs:check` — valid.
- `--filter TEST-028` (subagent) — 1 passed (1.7 min).
- `--filter TEST-024` run 1: stopped by the 40-minute background limit after the server started (log lost in a cezar restart; no leftover process found). Run 2: `[ephemeral] starting PostgreSQL … Could not find a working container runtime strategy` — the Docker Desktop engine is not running (`docker info`: `open //./pipe/dockerDesktopLinuxEngine: … not found`); the run rules forbid touching Docker Desktop, so TEST-024 has not run locally and is left to CI (`ci.yml` runs the whole `test:integration:vereino` suite in shards).
- After the review fixes: `npx jest src/modules/facilities/lib --coverage` — 72 tests pass, every `facilities/lib` file 100 %; `yarn typecheck`, `yarn typecheck:qa` ok.
- `yarn verify` (before the review fixes) — run 1: steps generate … lint passed (lint: 0 errors, existing boundaries warnings), `format:check` failed on two working-copy files with CRLF (`TEST-024-public-schedule.spec.ts`, `PublicClubView.tsx`; the committed blobs were already LF); after `prettier --write`, `yarn verify --from format:check` — all 9 remaining steps passed (`test`: 66 suites, 781 tests; `build` ok).

## Review

A fresh-eyes subagent read `git diff origin/main...HEAD` (read-only): no data leak or tenant-isolation problem found; changes requested. Fixed:
- **(H) CPU per anonymous request:** the month called `minutesOnDate` for every day × entry, building 2–4 `Intl.DateTimeFormat` objects each (~70 µs apiece; ~0.7 s per request at ~150 entries, with 120 requests/min per IP and no server cache). Now one cached formatter per time zone (`localMoment`) and each entry is converted once into per-date spans (`daySpans`), grouped by date.
- **(M) date-dependent tests:** the closure day (Thursday) could fall into the next month; the fixture now skips a Wednesday that ends its month.
- **(M) redaction proof:** `PRIVATE_NAMES` adds the held request's renter, contact and e-mail (from the probe), the coordinator's name and an internal booking's purpose; the fixture seeds an internal booking 12:00–13:00, and TEST-024's expected Wednesday includes it.
- **(M) personal data processed needlessly:** the public month no longer reuses the staff `calendarEntries` (which decrypts renter names and resolves bookers); `publicEntries` reads kind and times only.
- **(L)** `canRequest` now needs 90 minutes left from max(start, now), so a stretch already under way today can still be requested; an entry across the repeated autumn hour keeps its length (unit-tested); seasonal rates show only in months their season covers; the service comment about ids corrected.

Left as notes: (L5) making a place public needs `club_core.manage` only, while publishing the club page needs `club_core.publication.manage` — both are the club administrator's today; a split custom role could publish a place calendar without the publication feature (the club's `places_calendar` block still gates it). (L6) the spec glossary says "unavailable" for closures and maintenance; the issue and the UI say "closed" for closures — maintenance ("unavailable") arrives with step 9. No cross-club test (club A's slug with club B's place slug); the lookup narrows every place read to the slug's organization.

- `yarn verify` (final, after the review fixes) — all 14 steps passed.
- Lesson: `.ai/lessons/public-routes-convert-time-zones-once.md`.

- CI on PR #230 (run 42529611277): `gate` pass; integration shard 3/3 pass; shard 2/3: **TEST-024 ✓ (12.2 s) and TEST-028 ✓ (17.2 s)**, but TEST-023 ✘ twice — `yarn mercato facilities rental-lifecycle … exited 1: … Duplicate command registration for id facilities.rental_rates.create`. Cause: `services/public-schedule.ts` (reached from `facilities/di.ts` through the club page block) imported the shape mappers from `commands/rental-rates.ts` and `commands/zone-rules.ts`, which register their commands on import, so the CLI registered them twice. Reproduced locally without a database (`DATABASE_URL=<unreachable> yarn mercato facilities rental-lifecycle …` → `Duplicate command registration`); fixed by moving `zoneRuleShapeOf` and `rentalRateShapeOf` to `data/shapes.ts` (re-exported by the command files); the same command then reaches `connect ECONNREFUSED`. Lesson `.ai/lessons/di-loaded-modules-never-import-command-files.md`.

## Open problems

- No browser test drives the place form's public group or the list columns; TEST-024 covers 422/409 through the API. The empty public list and "no published schedule this month" are not exercised by a test.
- TEST-024 never ran locally (the Docker Desktop engine stayed down; not touched, per the run rules); it passed in CI after the review fixes, as did TEST-028.
- The 429 is not integration-tested: `OM_INTEGRATION_TEST` disables rate limits (V-10, TEST-024); both facilities routes and the club_core file route declare `metadata.GET.rateLimit` (120/min per client IP).
- Past days: rentals that are `done` and sessions that are not `planned` no longer occupy (the occupancy reads), so a past stretch can read "bookable". `canRequest` is false on past days.
- Planned maintenance ("unavailable") joins with phase 5 step 9.

## Next steps

- E08-S05 (#125): the request form on `canRequest` slots, `POST …/requests`, the e-mail confirmation.
