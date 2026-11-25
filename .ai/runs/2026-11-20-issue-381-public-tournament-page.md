# Run: issue #381 — public tournament page and one P-06 card per club event (E14-S06)

- **Trigger:** Cezar queued `om-auto-fix-issue 381` after the `cezar` label (2026-11-20T03:49Z), task 141c42c2.
- **Issue:** #381 (epic #375), feature route; dependencies #376, #379, #263 closed; the P-06 narrowing, the DI methods and the public routes approved by the owner on 2026-11-19 (Q-T20, PR #418).
- **Spec:** `.ai/specs/implemented/2026-11-18-vereino-club-events-with-parts.md`, phase 6 (REQ-T09, REQ-T10, REQ-T08 public files; TEST-T09, TEST-T10, TEST-T14, TEST-T15 public part).
- **Branch:** `feat/issue-381-tournament-page-public-events` (Cezar worktree).

## Goal

A guest opens `/p/[clubSlug]/events/[eventSlug]` (the poster's QR code) and sees the published club event; P-06 lists a club event once, never its parts.

## Steps

1. Claimed the issue (assignee, `in-progress`, `🤖` claim comment naming the run, worktree and branch).
2. Read phase 6, the glossary, the API table, P-06 (`club_core/services/public-site.ts`, `public-blocks.ts`, `activities/services/public-events.ts`) and the club event data (#376, #379).
3. Contract: `PublicEventsProvider` gains optional `clubEvent()`/`clubEventFile()`; `PublicEventEntry` gains `kind`, `clubEventSlug`, `partsCount`, `posterFileId` and a nullable `sectionSlug`; `PublicEventsContext.filtered`.
4. Pure rules: `lib/public-events.ts` (`publicClubEventItems`, `withClubEvents`) and the new `lib/public-club-event.ts` (the page view), unit tests at 100 %.
5. Service: P-06 leaves out activities with `club_event_id`, reads public club events (also without a public section); `clubEvent`, `clubEventFile` inside the found scope.
6. `club_core`: `publicClubEvent`, `clubEventFile`, the two routes (rate limits `club_core_public_club_event`, `club_core_public_club_event_file`), error `public_club_event_not_found`, the page and `PublicClubEventView`, the club event card on P-06, en/pl texts, READMEs, spec changelog entry.
7. Integration tests TEST-T09, TEST-T10, TEST-T14; regression TEST-N14.

## Decisions

- **V-T01:** `yarn generate` registers `club_core/frontend/p/[clubSlug]/events/[eventSlug]/page.tsx` next to `events/page.tsx`; no fallback needed.
- **An event of a section that is not public** shows on P-06 like a whole-club event (`section: null`, club logo) rather than publishing the section's name, and is left out under a section filter.
- **Filtered P-06:** `club_core` passes `filtered` so a whole-club event appears under a section chip only with a public group of that section (TEST-T10); unfiltered it always appears.
- **404 codes:** unknown club `public_page_not_found`; page or `events` block off `public_events_disabled` (as P-06); event unknown, not public or without a live part `public_club_event_not_found`; every file miss `public_page_not_found`.
- **A file is served only while the page would be** (same "public and a live part" rule).
- **P-06 entries gain `posterUrl`** (additive) so the card can show the poster thumbnail.
- **Our team** of a part whose group is public but whose section the page does not know falls back to the club's name.

## Files changed

`packages/app/src/modules/club_core/{services/public-blocks.ts, services/public-site.ts, lib/error-codes.ts (+ test), api/public/[clubSlug]/events/route.ts, api/public/[clubSlug]/events/[eventSlug]/route.ts, …/files/[fileId]/route.ts, components/public/{PublicClubEventView,PublicEventsView}.tsx, components/public/public-client.ts, frontend/p/[clubSlug]/events/[eventSlug]/page{,.meta}.ts(x), i18n/{en,pl}.json, README.md}`; `packages/app/src/modules/activities/{lib/public-events.ts, lib/public-club-event.ts, lib/__tests__/public-events.test.ts, lib/__tests__/public-club-event.test.ts, services/public-events.ts, README.md}`; `packages/app/.ai/qa/tests/club_core/TEST-T09…, TEST-T10…, TEST-T14…`; spec changelog `2026-11-20-issue-381-phase-6.md`.

## Commands and results

- `jest public-events.test.ts public-club-event.test.ts --coverage` — 20 passed, 100 % lines/branches/functions of both files.
- `yarn test:integration:vereino --filter TEST-T09` — 1 passed (40.0s).
- `… --filter TEST-T10 --no-build` — 1 passed; `TEST-T14 --no-build` — 1 passed; `TEST-N14 --no-build` — 1 passed (regression of P-06).
- `yarn verify` — first run failed at `ds:check` (`max-h-[80svh]` arbitrary value → `max-h-160`), then at `test` (`club_core` error-code table test lacked the new code); after both fixes a full run passed all 18 steps.
- `yarn test:integration:vereino --filter TEST-T14` (fresh build after the class change) — 1 passed (1.0m).

## Open problems / next steps

- The ACs AC-T09/AC-T10 stay unticked in the spec (no phase PR edits them); phase 7 (#382) remains, so the spec stays `In progress`.
