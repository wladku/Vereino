# Run: E14-S05 — club events on the phone (#380)

- **Date:** 2026-11-20
- **Trigger:** Cezar run of `om-auto-fix-issue 380` (label `cezar` added to the issue), unattended.
- **Issue:** #380 (epic #375); **spec:** `.ai/specs/implemented/2026-11-18-vereino-club-events-with-parts.md`, phase 5 (REQ-T12, TEST-T12, TEST-T15 `member-nav.ts` part).
- **Branch:** `feat/issue-380-section-coordinator-club-event` (Cezar worktree).

## Goal

A section coordinator sets up and runs a club event with all its parts on the phone: list, event form with the Add place sheet, event page with part cards and a bottom-sheet menu, part form with visiting teams and `?copyOf=`, files block, Cancel club event, the More entry "Club events", and the session edit showing a part session's place read-only.

## Steps

1. Claimed #380 (assignee, `in-progress`, `🤖` claim comment naming this worktree and branch). Feature route: the spec exists and is `Ready for implementation` (owner approval 2026-11-19, PR #418); every dependency (#376–#379, #258, #273) is closed.
2. Read spec phase 5, the UI contract rows `/club/club-events/*` and the panel components of #378/#379.
3. Implemented (no new route, no migration):
   - `activities/lib/member-club-event.ts` (pure: event and part drafts, checks, request bodies in the club's zone, error fields, club-zone day and time range) with unit tests at 100 %.
   - Pages `frontend/club/club-events/**` and components `ClubEventsListPage`, `ClubEventFormPage`, `ClubEventDetailPage`, `ClubEventPartFormPage`, `ClubEventFilesBlock`, `ClubEventFormParts`.
   - `useClubEventFiles` (upload/remove logic now shared by the panel Files tab and the phone block).
   - `club_core` add-place widget: `surface: 'sheet'` draws the existing `AddExternalPlaceSheet` (#377) on the same spot.
   - `ClubSessionEditPage`: a part session (`clubEvent` on the read) shows the place read-only.
   - `@vereino/ui` `member-nav.ts`: More entry `clubEvents` (`activities.manage`), label key in the six member catalogs (en, pl); unit tests updated.
4. `yarn verify` (17 steps) green after fixing two `no-non-null-assertion` lint errors in the new forms.
5. TEST-T12 written (`packages/app/.ai/qa/tests/activities/TEST-T12-club-events-phone.spec.ts`) and run locally.

## Decisions

- **Phone forms are hand-built (not `CrudForm`)**, as the other member forms (`ClubEventPage`, `ClubSessionEditPage`): 44 px controls, a sticky submit bar, problems wired through `aria-describedby`.
- **Gathering and deadline as minutes/hours** on the phone, as the panel and the event defaults (the spec's J-T01 says "30 minutes", "48 hours").
- **Map link** is an OpenStreetMap search by the place's name: the event read carries no address and the issue forbids a new API.
- **Cancel of a part with a group** uses the existing member `CancelSessionDialog` (the session's lock token is read first), so the toast names how many people were told; an open part uses the reason dialog of the panel.
- **Lost connection:** a thrown `apiCall` (no answer) keeps the form and shows **Try again**, which resends the same draft.
- **List:** Upcoming, Past and — only when any — Cancelled sections, instead of tabs (no `TabsContent` axe trap, lesson `tabs-without-tabscontent-fail-axe`).

## Files changed

See the PR diff; the main ones are listed in Steps.

## Commands and results

- `yarn workspace @vereino/ui test` — 212 tests pass, 100 % coverage.
- `npx jest src/modules/activities/lib/__tests__/member-club-event.test.ts` — 20 tests pass, `member-club-event.ts` 100 % lines/branches/functions.
- `yarn verify` — all 17 steps pass.
- `yarn test:integration:vereino --filter TEST-T12` — 1 passed (1.0m).
- Regressions for the touched panel Files tab and session edit: `--filter TEST-T11` — 1 passed (1.0m); `--filter TEST-A16` — 1 passed (54.6s).

## Open problems / next steps

- None known beyond the review.
