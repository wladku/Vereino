# Run: issue #273 — a section coordinator assigns a substitute, moves and cancels sessions from the phone

- **Trigger:** cezar `om-auto-fix-issue 273` (the `cezar` label added to the issue on 2026-11-18).
- **Issue / spec / branch:** #273 (E10-S08) / `.ai/specs/implemented/2026-11-14-vereino-parity-groups-and-activities.md` phase 8 (REQ-A10, TEST-A16, AC-A12) / `feat/issue-273-section-coordinator-substitutes`
- **Date:** 2026-11-18

## Goal

Give the section coordinator a phone path for the section's sessions (D-031 §3, D-029): the counts on Today, the section calendar with view chips, and on the session page "Assign substitute" / "Change coach" in a bottom sheet, "Edit time or place" and "Cancel session" — without one `/backend` page.

## Steps

1. Concurrency check: no assignee, no `in-progress`, no claim comment, no PR referencing #273. Classified as a feature (label `feature`); FR triage: the spec is `Ready for implementation` (owner approval 2026-11-16), phase 8's dependencies (#268, #271, #272, #259 = spec N phase 5) are closed, nothing built yet. Claimed the issue (assignee, `in-progress`, 🤖 comment).
2. Read the phase 8 text, M-02/M-03/M-04 rows, J-A03/J-A04 and the existing code: `club-client.ts`, `ClubCalendarPage.tsx`, `ClubSessionPage.tsx`, `CoachSessionBlock.tsx`, `ClubSessionEditPage.tsx`, the Today widget, `AssignCoachDialog.tsx`, `services/calendar.ts`, the session routes and `lib/occurrence-list.ts`.
3. Pure logic first (`lib/coordinator-sessions.ts`, `pickerOptions` in `lib/substitutions.ts`, `sessionPerspectives` → `staff: 'coach' | 'coordinator' | null`) with unit tests.
4. Server: `CALENDAR_ITEM_PERSPECTIVES` gains `coordinator`; `readCalendarItem` reads `as=coordinator` through the calendar's coordinator scope (403 `scope_denied` outside it); `sessionActionFlags` (the commands' own checks) feeds `mayAssign`, `mayEdit`, `mayTakeOver` into both staff reads and `GET /api/activities/occurrences/{id}`; OpenAPI descriptions updated.
5. Client: the coordinator perspective in `club-client.ts` (section list reads, counts, sections via `GET /api/club_core/sections`), the calendar's "My sessions / Section" switch, section filter and view chips (`Tabs`, scrolling), the Today tile "Section sessions", the session page's coordinator read, the block's full-width actions with Cancel last and the `AssignCoachSheet` (bottom `Sheet`) sharing `useAssignCoach` + `CoachPickerFields` with the panel dialog; the edit page honours `?as=coordinator`.
6. i18n (en, pl), README section, spec changelog entry, TEST-A16.

## Decisions

- **Views other than "All" read the B-15 list (`GET /api/activities/occurrences`), not the calendar.** "Unsettled" and "Needs a new time" have no date window and "Needing a coach" looks 14 days ahead, while the calendar API serves at most 62 days of a week grid; the Today counts use the same reads with `pageSize=1`, so a count and its list always agree. A view lists at most 100 sessions with a notice pointing at the panel beyond.
- **No new route, no migration.** `as=coordinator` on `GET /calendar/{id}` and the `may*` fields are additive (approved as one group in the spec's BC table, (a)8). The server keeps refusing what the flags hide (TEST-A16 checks 403 on another section's cancel and assign).
- **The coach tile in the staff context stays only for a person who coaches** (phase 8: "keeps the coach's tile when the scopes include `coach`"); a coordinator who coaches no group sees the section tile only.
- **The coach picker's free coaches come first in the panel dialog too**, because the issue moves the dialog's logic into one shared hook; the search field is shown in the phone sheet only.
- **Section filter** shows only for more than one section; an unknown `?section=` is ignored.

## Files changed

- `packages/app/src/modules/activities/lib/coordinator-sessions.ts` (new), `lib/substitutions.ts`, `lib/member-session.ts` + tests (`coordinator-sessions.test.ts` new, `substitutions.test.ts`, `member-session.test.ts`)
- `packages/app/src/modules/activities/services/calendar.ts`, `data/validators.ts`, `api/shared.ts`, `api/calendar/[id]/route.ts`, `api/occurrences/[id]/route.ts`
- `packages/app/src/modules/activities/components/useAssignCoach.ts` (new), `CoachPickerFields.tsx` (new), `AssignCoachDialog.tsx`, `club/AssignCoachSheet.tsx` (new), `club/club-client.ts`, `club/ClubCalendarPage.tsx`, `club/ClubSessionPage.tsx`, `club/CoachSessionBlock.tsx`, `club/ClubSessionEditPage.tsx`, `widgets/injection/club-today/widget.client.tsx`
- `packages/app/src/modules/activities/i18n/en.json`, `i18n/pl.json`, `README.md`
- `packages/app/.ai/qa/tests/activities/TEST-A16-coordinator-sessions-phone.spec.ts` (new)
- `.ai/specs/changelog/2026-11-14-vereino-parity-groups-and-activities/2026-11-18-phase-8-implemented.md` (new)

## Commands and results

- `npx jest …coordinator-sessions|member-session|substitutions` — first run: 1 failure (my scripted rename also touched the `sessionPageView` expectations); fixed, 33 passed.
- `yarn generate` — ok. `yarn typecheck` — first run: `widget.client.tsx(313,53): error TS2345: Argument of type 'MemberPerspective' is not assignable to parameter of type 'TodayPerspective'`; fixed (`Exclude<MemberPerspective, 'coordinator'>`), then exit 0.
- `yarn format:check` — 8 files unformatted (and CRLF from the scripted edits); `yarn format` + LF normalisation. `yarn ds:check` — `[arbitrary-tailwind]` on `max-h-[90dvh]`/`max-h-[40dvh]` in `AssignCoachSheet.tsx`; replaced by `max-h-dvh` and the default list height.
- `yarn typecheck:qa`, `i18n:check-hardcoded --strict`, `contracts:check`, `qa-texts:check`, `spec-changelogs:check`, `lessons:check`, `glossary:check` — exit 0. `yarn lint` — exit 0 (one new `react-hooks/exhaustive-deps` warning in `useAssignCoach.ts`, fixed). `yarn test` — 97 suites, 1381 tests passed (coverage thresholds met).
- `yarn test:integration:vereino --filter TEST-A16` — first run failed: `expect(received).toMatchObject(expected) … "error": "Forbidden", "requiredFeatures": ["activities.view"]` — a test bug: the coach role has no `activities.view`, so the test now checks the coach's flags through `GET /calendar/{id}?as=coach`. Second run: `expect(locator).toContainText(expected) … Expected substring: "Irena Instruktor" Received string: ""` — the option's `data-testid` sits on the radio button, not its label; the test now finds the busy coach by the radio's name. Third run: every step passed, then `aria-valid-attr-value` (critical) on `/club/calendar section view` in en and pl, light and dark — the view chips' `aria-controls` pointed at a panel that was never rendered; the section page now wraps the content in `Tabs` with a `TabsContent` panel per view (`SectionTabs`, `ViewPanel`). Fourth run: `1 passed (3.2m)`.
- `yarn verify` (after the fixes): `[verify] all 17 step(s) passed`.

## Open problems

- None known. The club administrator on the phone gets the section view only when they also hold a coordinator grant (`memberStaffScopes` knows `coach` and `coordinator`); the spec ties the view to those scopes.

## Next steps

- Phase 9 (E10-S09): the roster and the thread actions on the phone.
