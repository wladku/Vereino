# Vereino — Day / Week / Month range switch on calendar views

**Date**: 2026-11-25
**Status**: Ready for implementation — every blocking question answered by the product owner on 2026-11-25 ([owner answers on #784](https://github.com/wladku/Vereino/issues/784#issuecomment-7175962616)); the one contract change (REQ-W03, additive `from`/`to` on the public schedule read) is approved there (Q-W04)

> Use `om-spec-writing` for every new application, multi-module feature, or other non-trivial business slice. Keep every section below; write `N/A — {reason}` when a section does not apply. Change the status to `Ready for implementation` only after every blocking open question is resolved and the traceability table covers every requirement.

Sources: issue #784 (the owner, walking the demo sandbox on 2026-11-25, found that the calendars do not let the reader choose the range they look at), the owner's answers Q1–Q5 of the same day, and D-040 (`.ai/specs/research/decisions/D-040-calendar-range-switch-and-week-on-the-facility-calendar.md`), which revises D-031 §4 for the facility calendar. Design authority: the mockup `docs/ux-concept/mockups/app.ts` (`rangeSwitch`, `screenCalendar`, `screenPlace`, `screenOccurrences`, `screenPublicPlace`) and its catalogs `i18n/pl.json` and `en.json` (D-031).

This spec is an addendum to four specs and does not change their status or phases: the facilities spec (`implemented/2026-10-27-vereino-facilities.md`, P-04), the facilities parity spec (`implemented/2026-11-14-vereino-parity-facilities.md`, B-23 and M-11), the club spec (`2026-10-20-vereino-club-management.md`, M-03) and the foundation spec's coordinator calendar (B-15, E06-S12). Ids carry the letter **W** (`REQ-W01`, `DD-W01`, `J-W01`, `TEST-W01`, `AC-W01`, `Q-W01`, `A-W01`) so they never collide with other ids (D-028).

**Rows of other specs this spec supersedes** (their bodies are not edited; the changelog entries of 2026-11-25 record it):

| Spec, section and row | Superseded by |
|---|---|
| Facilities parity spec, REQ-R01…REQ-R03 and DD-R01: "one day axis at every screen width (D-031 §4)" | REQ-W05: Day keeps the axis; Week and Month are added (D-040) |
| Facilities parity spec, REQ-R16 and Q-R17: "P-04 on a phone lists the current month from today" | REQ-W04: a phone opens on Day; Month on a phone keeps the list from today with "Pokaż wcześniejsze dni" |
| Facilities spec, phase 5 step 5: "P-04 (month grid wide, day list on a phone)"; `…/schedule?month=` only | REQ-W03, REQ-W04: Day / Week / Month; the read also takes `from`/`to` |
| Club spec, UI row `/club/calendar` "week/month calendar" and #493 "the upcoming list is the default view" | REQ-W06: Day is added; a phone opens on Day; "Najbliższe" stays a tab |
| Foundation II P-23 / E06-S12: the coordinator calendar's view lives in component state, week by default | REQ-W07: the view and the date live in the address; a phone opens on Day |

## TLDR

Every calendar a person browses gets the same range switch — **Dzień / Tydzień / Miesiąc** — in the same place, with the same labels, earlier/later arrows and the range's dates, and with the view and the date in the address:

- **P-04** public facility calendar (`/p/[clubSlug]/places/[placeSlug]`)
- **M-03** member calendar (`/club/calendar`), with "Najbliższe" kept as its own tab
- **B-23** facility calendar (`/backend/facilities/calendar`) and **M-11** a place's page on the phone (`/club/places/[placeId]`), which share the day axis
- **B-15** coordinator calendar (`/backend/activities/occurrences`, "Calendar"), with "Agenda" kept as its own tab

A phone opens on **Day**, a wider screen on **Week**. A week or a month on a phone is a list of days, never a grid. The facility calendar's week on a desktop is seven hour axes side by side (D-040). One shared component in `@vereino/ui`. No migration; one additive contract change (`from`/`to` on the public schedule read).

## Problem Statement

Each calendar is fixed to one range or offers some of Day / Week / Month, and the set differs per view (verified on `main` at `20821e4a`, #784):

| View | Day | Week | Month | Where the view lives |
|---|---|---|---|---|
| P-04 | — | — | ✅ (grid from `md`, list from today on a phone) | `?month=` |
| M-03 | — | ✅ | ✅ (list of days) | tab state + `?from=&to=` link ranges |
| B-23 / M-11 | ✅ (axis + seven day chips) | — | — | `?place=&date=` |
| B-15 | ✅ | ✅ | ✅ (+ Agenda), `ScheduleView` toolbar | component state, lost on reload |

A guest cannot look at one day of a pitch; staff cannot see a place's week; a coordinator's view does not survive a reload or a shared link; and the controls look different on every page.

## Overview and Success Measures

- Every view in the table offers Day / Week / Month in one segmented control at the top of the calendar, with the same Polish and English labels.
- Reload, the back button, a shared link and a QR code reopen the same view and range.
- At 375 px every view reads without horizontal scrolling; every control is at least 44 px high.
- Nothing a reader may see changes: the switch changes the range only.

## Goals

- One shared `CalendarRangeSwitch` and one set of range rules (week starts on Monday, club time zone).
- The owner's defaults: phone → Day, wider screen → Week (Q-W02).
- The facility calendar gets a week and a month (D-040).
- P-04 can read a week that crosses two months in one request (Q-W04).

## Non-goals

- B-26 zone week preview (`WeekZonePreview.tsx`): a configuration preview, not a calendar to browse.
- The dashboard tiles "Dziś / Jutro" and the club and section pages' "upcoming" lists: summaries, not calendars.
- New data on any view, new filters, new permissions.
- A year view, a custom range picker, or remembering the last view per person (the address is the memory).

## Proposed Solution

1. `@vereino/ui` gains `calendar-range.ts` (pure range maths) and `calendar-range-switch.tsx` (the control). Modules pass the labels and a link builder, as `calendar-list.tsx` does.
2. Each view reads `range` and `date` from the address, derives `{ from, to }` with the shared rules, and reads its existing API with that window. Without `range`, the view follows the screen width (DD-W03).
3. P-04's public read gains optional `from`/`to` next to `month` (REQ-W03).
4. B-23 and M-11 render Week as seven day axes side by side from `lg` and as a list of days below; Month as a list of days (D-040).
5. B-15 drives `ScheduleView` from the address and the shared control and hides the toolbar's own view buttons.

### Design Decisions and Alternatives

| Id | Decision | Alternatives rejected |
|---|---|---|
| DD-W01 | One shared control in `@vereino/ui` with module-supplied labels (Q-W05) | One per module: four looks for one idea, the reason for #784 |
| DD-W02 | The address carries `range` (`day`, `week`, `month`, plus a view's own extra tab: `upcoming` on M-03, `agenda` on B-15) and `date` (any day inside the range, `YYYY-MM-DD`); arrows move by one day, week or month and keep `date` on the same weekday or day of month, clamped to the month's last day | `from`/`to` in the address: two values to keep consistent, and a link would not say which view it is; the name `view`: B-15 already uses `?view=` for its perspectives (Upcoming … Calendar, DD-A11) |
| DD-W03 | Without `range`, below `md` (768 px) the view is Day, from `md` up Week. A server-rendered page (P-04, #487) renders the Week read; on a phone the client shows Day from the same data (a day is inside its week), so no second request and no flash of an empty page | Reading `User-Agent`: unreliable; a cookie: the address is the memory |
| DD-W04 | A week starts on Monday in the club's time zone; a month is the calendar month; ranges are club-zone dates like every other calendar read | Locale-dependent first day: the clubs are in Poland and the axis and the grid both assume Monday |
| DD-W05 | Week and Month on a phone are lists of days that have entries; days without entries are omitted (P-04 keeps its "Pokaż wcześniejsze dni" for the current month, Q-R17) | A grid at 375 px: unreadable (#100 Q1) |
| DD-W06 | B-23 / M-11 Week from `lg` (1024 px): seven `DayAxis` columns sharing one hour scale, each headed by its day and opening a day on click of the header; the day chips stay for Day only | Seven stacked axes on a desktop: a scroll of 98 hours |
| DD-W07 | P-04 reads `from`/`to` (≤ 31 days, inside the existing readable window: the previous month to twelve months ahead); `month` stays and wins when both are sent | Two month reads glued in the browser: two requests for every week that crosses a month |
| DD-W08 | Existing links keep working: P-04 `?month=YYYY-MM` opens Month at that month; M-03 `?from=&to=` link ranges keep their behaviour (#493); B-23/M-11 `?date=` opens Day at that date when `range` is absent and the screen is a phone, Week containing it otherwise | Redirecting old links: QR codes on printed posters point at P-04 |

## Domain Vocabulary and Business Rules

- **Range switch** — the segmented control Dzień / Tydzień / Miesiąc (EN: Day / Week / Month), followed by a view's own extra tab when it has one ("Najbliższe" on M-03, "Agenda" on B-15).
- **Anchor date** (`date`) — the day the range is built around; Day shows it, Week shows its Monday–Sunday, Month shows its calendar month.
- **Range label** — Day: the long date ("środa, 26 listopada"); Week: "24–30 listopada" (or "28 lis – 4 gru" across months); Month: "listopad 2026".
- Arrows: "Wcześniej" / "Później" visible, with full names for screen readers ("Poprzedni dzień", "Następny tydzień", …). "Dziś" returns the anchor to today and is hidden when the range already contains today.
- A range never leaves a view's readable window: P-04 the previous month to twelve ahead; B-23 / M-11 up to 92 days back for the club administrator (DD-R17), otherwise from today; M-03 and B-15 unchanged. An arrow that would leave the window is disabled.

## Users, Permissions, and Scope

| Reader | Views | Permission (unchanged) |
|---|---|---|
| Guest | P-04 | none; the club publishes its page and the `places_calendar` block |
| Member, guardian, coach | M-03, M-11 | as today (`activities` calendar perspectives; `facilities.view` or a place grant) |
| Coordinator, administrator, facility operator | B-15, B-23 | as today |

The switch never widens a read: each view asks its existing API for a window it may already read.

## Reuse and Ownership Map

| Need | Reused | Owner |
|---|---|---|
| Segmented control | the `Tabs` primitive pattern of `groups/components/GroupsNav.tsx` and `admin/route-tabs-model.ts` | `@vereino/ui` |
| Day axis | `facilities/components/day-axis/DayAxis.tsx`, `DayChips.tsx`, `DayEntries.tsx` | facilities |
| Member list of days | `@vereino/ui` `member/calendar-list.tsx` | `@vereino/ui` |
| Coordinator grid | `ScheduleView` of `@open-mercato/ui/backend/schedule` | platform (installed) |
| Club-zone dates | `calendarDateInZone`, `addDays` of `@vereino/core` | core |
| Public month read | `facilities/lib/public-schedule.ts`, `services/public-schedule.ts` | facilities |

## Architecture and Data Flow

```
address ?range&date ──► parseCalendarRange(searchParams, isWide) ──► { range, anchor, from, to }
                                     │                                   │
                       CalendarRangeSwitch (labels, hrefFor)      existing read with from/to
                                                                  (P-04: public schedule; M-03/B-15: /api/activities/calendar;
                                                                   B-23/M-11: /api/facilities/calendar?placeId)
```

`calendar-range.ts` exports `parseCalendarRange`, `rangeOf(range, anchor)`, `shiftRange(range, anchor, ±1)`, `rangeLabelParts` and `clampToWindow`. All are pure and take club-zone `YYYY-MM-DD` strings. The window sizes fit every API: a month is ≤ 31 days (facilities calendar limit 31, activities calendar limit 62, public read limit 31 by DD-W07).

## User Journeys

### Journey J-W01 — A parent checks whether the pitch is free on Saturday (P-04, phone)

1. Scans the poster's QR code: `/p/przyklad/places/boisko` opens on today (Day).
2. Taps "Tydzień": the seven days of this week as a list; Saturday shows "09:00–13:00 Wolne — do rezerwacji".
3. Taps "Później": next week; the address now holds `?range=week&date=…`, which they share with the other parent.

### Journey J-W02 — The administrator plans next week's pitch (B-23, desktop)

1. Opens Facilities → Calendar: the week of the chosen place as seven axes side by side.
2. Spots a free Thursday evening, clicks the Thursday header: Day at Thursday with the chips, and books the slot (SlotDialog, unchanged).

### Journey J-W03 — A coach looks at one day on the phone (M-03)

1. Opens Calendar: today's sessions (Day). "Najbliższe" is one tap away.
2. Swipes through days with "Wcześniej" / "Później"; declarations and actions work as on every card.

### Journey J-W04 — The coordinator shares a week (B-15)

1. Opens Classes → Sessions → Calendar: Week; switches the section filter.
2. Copies the address: the colleague opens the same week, view and section.

## UI and Interaction Contracts

### UI architecture

Proposal visuals — screenshots of the updated mockup (the design authority, D-031), fictional example club:

| Screen | Image |
|---|---|
| P-04 Week on a desktop (seven day cells) | [mockup-01-p04-week-desktop.jpg](assets/vereino-calendar-range-switch/mockup-01-p04-week-desktop.jpg) |
| M-03 Day on the phone (Najbliższe · Dzień · Tydzień · Miesiąc) | [mockup-02-m03-day-phone.jpg](assets/vereino-calendar-range-switch/mockup-02-m03-day-phone.jpg) |
| B-23 Week in the panel (seven day axes) | [mockup-03-b23-week-desktop.jpg](assets/vereino-calendar-range-switch/mockup-03-b23-week-desktop.jpg) |
| B-15 Calendar, Week (Dzień · Tydzień · Miesiąc · Agenda) | [mockup-04-b15-calendar-week.jpg](assets/vereino-calendar-range-switch/mockup-04-b15-calendar-week.jpg) |

The mockup routes: `#/p/przyklad/places/orlik-boisko?range=week&date=2026-11-18`, `#/club/calendar`, `#/backend/facilities/calendar?place=pl-boisko&range=week`, `#/club/places/pl-boisko?range=week`, `#/backend/activities/occurrences?view=calendar`. The mockup's shared helpers are `calRange`, `rangeDays`, `shiftAnchor`, `rangeLabel` and `rangeSwitch` in `app.ts`.

`CalendarRangeSwitch` props: `range`, `anchor`, `labels` (`day`, `week`, `month`, `earlier`, `later`, `today`, `previous.{day,week,month}`, `next.{day,week,month}`, `groupLabel`), `hrefFor(range, anchor)`, optional `extraTabs: { id, label }[]`, optional `window: { min, max }`, `todayDate`. It renders, in one row that wraps at 375 px: the segmented views (`role="tablist"` is not used — links with `aria-current="page"`, as the route tabs do), then "Wcześniej", the range label, "Później" and "Dziś". Every target is ≥ 44 px high below `sm` (`min-h-11`). Navigation uses links (`replace` for arrows, `push` for a view change), so the back button returns to the previous view.

### P-04 `/p/[clubSlug]/places/[placeSlug]` (REQ-W04)

- Day: the day's stretches as the slot list (state label, time, "Zgłoś rezerwację" where `canRequest`), full width.
- Week: a phone — the list of the week's days; from `md` — one row of seven day cells of the existing month grid.
- Month: unchanged (grid from `md`, list from today with "Pokaż wcześniejsze dni" on a phone).
- The online-request notice, legend, opening hours, rates, rules, phone and photos are unchanged below the calendar.

### M-03 `/club/calendar` (REQ-W06)

Tabs: **Najbliższe · Dzień · Tydzień · Miesiąc**. Day: the day's cards (`calendar-list.tsx`) with the empty state "Brak zajęć tego dnia." and "Następny dzień". The guardian's ward filter and the staff "New event" action are unchanged.

### B-23 `/backend/facilities/calendar` and M-11 `/club/places/[placeId]` (REQ-W05)

- Day: unchanged (place chips on B-23, seven day chips and "Inny dzień", axis, "Wpisy dnia").
- Week from `lg`: seven `DayAxis` columns (one hour scale on the left, each column headed by "pon. 24.11", zone colours and blocks as on Day, entries open their details as on Day, a free hour opens `SlotDialog` exactly as on Day). Below `lg`: the list of days with "Wpisy dnia" per day; a day's heading links to Day.
- Month: a list of days with entries (time, label, state tag), each day linking to Day.
- "Do przeniesienia" counts and filters within the shown range.

### B-15 `/backend/activities/occurrences` "Calendar" (REQ-W07)

Tabs: **Dzień · Tydzień · Miesiąc · Agenda** from the shared control above `ScheduleView`; `ScheduleView` receives its `view` and `range` props from the address (`?view=calendar&range=…&date=…`) and its own view buttons are hidden (its date arrows are replaced by the shared ones). The section filter joins the address (`section`).

## Data Models

N/A — no entity, column or migration.

## API, Command, and Error Contracts

| Route | Change |
|---|---|
| `GET /api/facilities/public/{clubSlug}/places/{placeSlug}/schedule` | **Additive (Q-W04, approved):** optional `from`, `to` (`YYYY-MM-DD`, club-zone, inclusive). Rules: both or neither; `to` ≥ `from`; ≤ 31 days; inside the readable window. Violations answer 400 `public_schedule_range_invalid`. `month` stays; when `month` and `from`/`to` are both sent, `month` wins. Response shape unchanged (`days[]` covers exactly the asked dates). Cache and rate limit unchanged (DD-45). |
| `GET /api/facilities/calendar` | none — already takes `placeId`, `from`, `to` (≤ 31 days) |
| `GET /api/activities/calendar` | none — already takes `from`, `to` (≤ 62 days) |

`BACKWARD_COMPATIBILITY.md`: the public read gains optional parameters and one new error code; existing callers and `?month=` links are unaffected.

## Events, Jobs, Notifications, and Cross-Module Flows

N/A — reads only.

## Security, Privacy, and Compliance

- P-04 still returns states only — no renter, person, group or record id. A `from`/`to` read returns exactly what the month read returns for those days.
- The 31-day cap and the readable window stop a public scan of years in one request; the per-IP rate limit is unchanged.
- Dates in the address are not personal data.

## Integration Coverage

| Id | Kind | Covers |
|---|---|---|
| TEST-W01 | unit | `calendar-range.ts`: week across months and years, Monday start, month ends (28/29/30/31), DST weeks in Europe/Warsaw, clamp to window, label parts in pl and en |
| TEST-W02 | unit | `CalendarRangeSwitch`: links, `aria-current`, disabled arrows at the window's edge, "Dziś" hidden inside today's range, 44 px targets below `sm` |
| TEST-W03 | API | public schedule `from`/`to`: a week across two months, 31 days ok, 32 days 400, inverted 400, one of the pair 400, outside the window 400, `month` wins, no names in the body |
| TEST-W04 | UI (phone + desktop) | P-04 Day / Week / Month, default Day on 375 px and Week on 1280 px, old `?month=` link, request button on Day and Week |
| TEST-W05 | UI (phone + desktop) | M-03 Najbliższe / Day / Week / Month, default Day on a phone, `?from=&to=` link range still works |
| TEST-W06 | UI (desktop + phone) | B-23 Week seven axes, header opens Day, free hour opens SlotDialog, Month list; M-11 Week and Month lists on a phone |
| TEST-W07 | UI (desktop) | B-15 view and date in the address survive reload; Agenda tab; section filter in the address |

## Implementation Phases

Each phase is one story under one epic; phase 1 first, phases 2–5 in any order after it.

### Phase 1 — Shared range rules and control

1. `packages/ui/src/member/calendar-range.ts` with TEST-W01; `calendar-range-switch.tsx` with TEST-W02; export both from `packages/ui/src/index.ts`; a Storybook story.
2. D-040 recorded (this PR).

### Phase 2 — P-04 public facility calendar

1. `from`/`to` in the public schedule route and `services/public-schedule.ts` (TEST-W03); OpenAPI updated.
2. `PublicScheduleView.tsx`: the switch, Day and Week, defaults (DD-W03), old links (DD-W08); server-rendered Week (#487). TEST-W04.

### Phase 3 — M-03 member calendar

1. `ClubCalendarPage.tsx`: tabs Najbliższe / Dzień / Tydzień / Miesiąc on the shared control; Day; defaults; `?from=&to=` kept. TEST-W05.

### Phase 4 — B-23 and M-11 facility calendars

1. A `WeekAxes` component in `facilities/components/day-axis/` (seven `DayAxis` columns from `lg`, list below) and a month list.
2. `FacilityCalendar.tsx` and `club-places/ClubPlacePage.tsx` on the shared control; "Do przeniesienia" per range. TEST-W06.

### Phase 5 — B-15 coordinator calendar

1. `CoordinatorCalendar.tsx`: view, date and section in the address; shared control; `ScheduleView` toolbar view buttons hidden. TEST-W07.

## Requirement Traceability

| Requirement | Phase | Tests | Acceptance |
|---|---|---|---|
| REQ-W01 shared range rules (DD-W02, DD-W04) | 1 | TEST-W01 | AC-W01 |
| REQ-W02 shared control (DD-W01) | 1 | TEST-W02 | AC-W01 |
| REQ-W03 public read `from`/`to` (DD-W07) | 2 | TEST-W03 | AC-W02 |
| REQ-W04 P-04 Day / Week / Month, defaults, old links (DD-W03, DD-W05, DD-W08) | 2 | TEST-W04 | AC-W03 |
| REQ-W05 B-23 and M-11 Week and Month (DD-W06, D-040) | 4 | TEST-W06 | AC-W04 |
| REQ-W06 M-03 Day, defaults, "Najbliższe" kept | 3 | TEST-W05 | AC-W05 |
| REQ-W07 B-15 address state and shared control | 5 | TEST-W07 | AC-W06 |
| REQ-W08 mockup updated (D-031) | this PR | build of the mockup | AC-W07 |

## Rollout, Migration, and Rollback

No migration and no flag. Each phase ships on its own; rolling one back restores that view's old behaviour, and links with `range`/`date` then fall back to the view's previous default (unknown parameters are ignored).

## Risks and Tradeoffs

- **Hydration on P-04** (DD-W03): the server renders Week; a phone switches to Day after hydration. Acceptable: no extra request, and the Day is already in the HTML's week.
- **Seven axes on 1024 px** can be tight: the columns keep a 120 px minimum and the row scrolls horizontally inside its own focusable region (as B-15's grid does) rather than the page.
- **`ScheduleView` toolbar**: hiding its view buttons relies on its props; if it cannot be driven fully, the phase keeps its toolbar and only moves the state to the address (A-W03).

## Acceptance Criteria

- [ ] AC-W01 — the four views use one `CalendarRangeSwitch` with identical labels and order.
- [ ] AC-W02 — the public schedule read answers `from`/`to` per the contract; `?month=` unchanged.
- [ ] AC-W03 — P-04 opens on Day at 375 px and Week at 1280 px; an old `?month=` link opens that month.
- [ ] AC-W04 — B-23 shows a week as seven axes on a desktop and a list on a phone; Month is a list; M-11 the same on a phone.
- [ ] AC-W05 — M-03 offers Najbliższe / Dzień / Tydzień / Miesiąc and opens on Day on a phone.
- [ ] AC-W06 — B-15's view, date and section survive a reload and a shared link.
- [ ] AC-W07 — the mockup shows the switch on P-04, M-03, B-23/M-11 and B-15.

## Final Compliance Report

| Check | Result |
|---|---|
| Migration | none |
| Contract change | additive `from`/`to` + 400 `public_schedule_range_invalid` on the public schedule read (approved, Q-W04) |
| New module / dependency | none |
| Privacy | unchanged reads; public read stays states-only |
| Phone-first (D-029) | Day default and lists of days below `md`; 44 px targets |
| Mockup is the model (D-031) | mockup updated in this PR |

## Open Questions

| Id | Question | Answer | Status |
|---|---|---|---|
| Q-W01 | Which views get the switch? | P-04, M-03, B-23 and B-15 | confirmed 2026-11-25 ([#784](https://github.com/wladku/Vereino/issues/784#issuecomment-7175962616)) |
| Q-W02 | Default view per device | phone Day everywhere (M-03 keeps "Najbliższe" as a tab); desktop Week everywhere | confirmed 2026-11-25 (same) |
| Q-W03 | B-23 Week and Month, against D-031 §4 | Week = seven hour axes side by side on a desktop, a list of days on a phone; Month = a list of days; D-031 §4 revised (D-040) | confirmed 2026-11-25 (same) |
| Q-W04 | P-04 week across two months | optional `from`/`to` on the public read, additive; `?month=` stays | confirmed 2026-11-25 (same) |
| Q-W05 | One shared switch or one per module | one in `@vereino/ui`, view and date in the address | confirmed 2026-11-25 (same) |

## Resolved assumptions (autonomous defaults)

| Id | Assumption | Why | Status |
|---|---|---|---|
| A-W01 | M-11 (`/club/places/[placeId]`) gets the same Week and Month as B-23 | it shares the day axis and the mockup's `screenPlace` with B-23, and the owner asked for the switch "on all calendar views" | confirmed by the owner 2026-11-25 (PR #785) |
| A-W02 | B-15 keeps "Agenda" as a fourth tab, like M-03 keeps "Najbliższe" | `ScheduleView` already offers it and nobody asked to remove it | confirmed by the owner 2026-11-25 (PR #785) |
| A-W03 | If `ScheduleView` cannot hide its own view buttons, B-15 keeps them in sync with the shared control instead | the platform component is installed, not owned | confirmed by the owner 2026-11-25 (PR #785) |
| A-W04 | The phone/desktop boundary is `md` (768 px), the seven-axes week starts at `lg` (1024 px) | the existing breakpoints of P-04 and the panel | confirmed by the owner 2026-11-25 (PR #785) |
| A-W05 | The public `from`/`to` cap is 31 days | the facilities calendar's own cap (`MAX_CALENDAR_DAYS`) and a full month | confirmed by the owner 2026-11-25 (PR #785) |

## Changelog

Changes after creation go to `.ai/specs/changelog/2026-11-25-vereino-calendar-range-switch/` (one file per change).
