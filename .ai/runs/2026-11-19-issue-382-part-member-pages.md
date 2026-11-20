# Run — #382 E14-S07: a guardian sees only their child's part, named with its club event

- **Goal:** implement phase 7 of `.ai/specs/2026-11-18-vereino-club-events-with-parts.md` (REQ-T03; TEST-T03 member pages, TEST-T13; AC-T04; J-T03, J-T06) and ship it as one PR.
- **Trigger:** Cezar run of `om-auto-fix-issue` on issue #382 (label `cezar`, 2026-11-19); feature route, spec `Ready for implementation` (owner approval Q-T20 on the issue, PR #418), dependency #376 closed.
- **Branch:** `feat/issue-382-guardian-sees-child-part`.

## Steps

1. Claimed #382 (assignee, `in-progress`, claim comment naming the worktree and branch).
2. Read phase 7 and the member surfaces: `SessionCardFacts.tsx` (Today cards and the session page), `ClubSessionPage.tsx`, `CoachSessionBlock.tsx`, `club-client.ts` `toCalendarItem` → `@vereino/ui` `CalendarList` (the calendar cards). Phase 1 already returns `occurrence.clubEvent` on the calendar reads and `mayEdit`/`mayCancel` false for a coach on a part; `CoachSessionBlock` already reads both flags, so no change was needed there.
3. `@vereino/core` `CalendarItem` gains the optional `partOf: { label, href? }`; `@vereino/ui` `CalendarList` renders it under the title, linked only with an `href` (unit test, coverage 100 %).
4. `club-client.ts`: `CalendarOccurrence.clubEvent` and `toCalendarItem` → `partOf`. `SessionCardFacts.tsx`: the event line (`session-facts-club-event`), linked to `publicPath` when set. `ClubSessionPage.tsx`: a part's teams are labelled "Visiting teams" (new key `activities.club.session.visitingTeams`, en + pl).
5. Integration tests: TEST-T03 (API: the guardian reads only her wards' part with `clubEvent`, `publicPath` null then the public path; a participant of another group reads none; 201 before and 409 `declaration_deadline_passed` after the deadline; the coach reads `mayEdit: false`, `mayCancel: false`) and TEST-T13 (phone 375 px, en/pl, light/dark: Today, calendar and session page; deadline closed; the coach's block without Edit and Cancel). Shared setup `partFamily` and `makePublic` in `_fixtures/club-events.ts`.

## Decisions

- The calendar card line is a generic optional `partOf` on the shared `CalendarItem` rather than a reuse of `links` (buttons at the card's foot) or `notes` (no link): the spec wants a line naming the event near the title, linked only once public.
- The public link is a plain `<a>` (same tab): the public page is outside the member shell.
- The session page keeps the existing teams row and only relabels it for a part ("Visiting teams"), because a part's activity already copies the visiting teams into `invitedTeamNames` (DD-T02).

## Files changed

- `packages/core/src/calendar.ts`; `packages/ui/src/member/calendar-list.tsx`, `packages/ui/src/__tests__/calendar-list.test.mjs`.
- `packages/app/src/modules/activities/components/club/{SessionCardFacts,ClubSessionPage}.tsx`, `club-client.ts`; `i18n/en.json`, `i18n/pl.json`.
- `packages/app/.ai/qa/tests/_fixtures/club-events.ts`; `activities/TEST-T03-part-in-member-calendars.spec.ts`, `activities/TEST-T13-part-member-pages-phone.spec.ts`.
- `.ai/specs/changelog/2026-11-18-vereino-club-events-with-parts/2026-11-19-issue-382-phase-7.md`.

## Commands and results

- `yarn workspace @vereino/ui test` — pass, coverage 100 %.
- `yarn generate`, `yarn typecheck` — pass.
- `yarn test:integration:vereino --filter TEST-T03` — 1 passed (8.1 s).
- `yarn test:integration:vereino --filter TEST-T13` — 1 passed (20.9 s; 375 px, en/pl, light/dark, axe without blocking violations).
- `yarn verify` — first run failed at `lint`: `TEST-T13…spec.ts 60:79, 73:71 error Invalid type "string | null" of template literal expression @typescript-eslint/restrict-template-expressions`; wrapped the ids in `String()`, then `yarn verify --from lint` — all 14 steps passed (generate, typecheck, typecheck:packages, typecheck:qa passed in the first run).

## Open problems / next steps

- None for this phase. Phases 2–6 of the spec (panel pages, coordinator phone pages, files, public page) ship on their own issues.
