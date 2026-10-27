# Vereino — municipal facility administration (phase 5)

**Date**: 2026-10-27
**Status**: Draft — phase 5; V-7 and V-9 pending; the pilot club (Q18) and its facility rules (Q04) are open

> Use `om-spec-writing` for every new application, multi-module feature, or other non-trivial business slice. Keep every section below; write `N/A — {reason}` when a section does not apply. Change the status to `Ready for implementation` only after every blocking open question is resolved and the traceability table covers every requirement.

Sources: split from `2026-10-20-vereino-club-management.md` on 2026-10-27 by D-028 (`.ai/specs/research/decisions/D-028-split-specification-and-optional-rental-charge.md`); its Changelog holds the history of every row moved here. The product brief: D08, D17, D19, D24, D25, R05, R06; the Orlik 2024 regulations (`research/2026-10-20-business-case.md`).

## TLDR

Phase 5 of Vereino and its main differentiator: a club that administers a municipal facility runs it in Vereino — hourly zones, closures, rental rates, bookings entered by staff and requested online with administrator approval, internal bookings by staff of any section, a public schedule without personal data, the attendant's log, incidents and bans, planned maintenance in the facility calendar, and the owner's report. Since D-028 it does not require the payments module: with `payments` enabled a rental gets a charge in the same transaction; without it a rental is a register entry with its amount (DD-19).

## Problem Statement

See `2026-10-20-vereino-club-management.md` (*Problem Statement*): Orlik bookings are taken by phone, collisions between matches, tournaments and pitch maintenance are frequent, and the management agreement is expected to require a public schedule. The pilot club must administer a municipal facility (D-025); A04 (most academies administer one) is accepted untested.

## Overview and Success Measures

Outcome: the municipality's report for a month is generated without manual corrections; the public schedule shows free "bookable" slots and takes requests; planned maintenance blocks the calendar like a closure. Measures: monthly owner report without manual corrections; share of external bookings requested online.

Shared with the club management specification (`2026-10-20-vereino-club-management.md`) and not repeated here: the product context, the users and permissions table with the full feature list, record scope (`people.scopeService`), the reuse and ownership map, the architecture and module boundaries, the club settings (DD-37), the UI architecture per role, the security and tenant-isolation rules, DD-35, the API conventions, the test conventions and the rollout. Ids are global: REQ, DD, J, TEST, AC, Q and V numbers are the same in all three specifications (D-028).

## Goals

- **REQ-013** (Must, D-008) — Facility: hourly zones, closures, rental rates in three categories, manually entered bookings (unit of 90 min, free cancellation up to 24 h before, payment to the municipality's account), detection of conflicts with club sessions and other bookings, facility calendar for the facility attendant.
- **REQ-014** (Must, D-008) — Public facility schedule without sign-in, without personal data, at a permanent address suitable for a QR code.
- **REQ-015** (Must, D-008) — Report for the facility owner for a month or quarter: hours in zones (including club time: sessions and internal bookings), number and value of bookings, payments to the municipality's account, incidents, maintenance work.
- **REQ-016** (Should; D-008 scope, priority per `moscow.md`) — Facility attendant log (opening, closing, condition before and after, groups present), incidents and entry bans that block bookings.
- **REQ-022** (Must; D-008 scope, raised from Could by D-017, Q-040…Q-042) — Facility maintenance and inspections, split between club and municipality.
  - **Maintenance work in the calendar.** Work with a time window on a place (line painting, mowing, aeration, irrigation, brushing) is planned in the facility calendar. It occupies the slot the way a closure does:
    - a new session, internal booking or rental, or an external request, in that window returns 409 `maintenance_scheduled`;
    - existing ones in that window get the reschedule flag, with the same notifications as a closure;
    - staff see the kind of work and who planned it;
    - the public calendar shows the slot as "unavailable" without details.
  - **Recurring tasks by date** (daily, annual, 5-year inspections) send reminders before the due date.
  - **Recurring tasks by use** ("every N hours of use", e.g. brushing the artificial turf) count the hours the place was occupied since the last completion and send a reminder when the threshold is reached.
  - Planned by people with the feature `facilities.maintenance.manage`. By default only the administrator holds it; it is granted per person, with place assignments, to anyone who plans maintenance — a section coordinator or the person who maintains the pitch — without a new role (D-024).
- **REQ-023** (Must, Q-021, Q-022) — Internal booking: a coach, instructor, coordinator or administrator of any section selects in the facilities calendar any club facility (pitch, small training room, swimming pool…), a date and hours, and books it immediately, without approval, if the slot is free (opening hours, no closure, no conflict) — in any zone. The booking is visible to staff with its purpose and the person who booked it. A booking for a group creates an event in the group's calendar (REQ-027).
- **REQ-024** (Must, Q-021, Q-023) — External request: an external person selects a free "bookable" slot in the club's public facilities calendar and submits a request (contact details, purpose, acceptance of the rules, email confirmation). The request is not valid without administrator approval; until a decision it blocks the slot against other external requests for at most 48 h and expires without a decision; an internal booking can override it (the requester receives an email). After approval a booking is created with a calculated amount and a charge payable to the facility owner's account (as in REQ-013).
- **REQ-029** (Must) — In the facility calendar, the administrator quickly sets weekly booking availability for external requests in bulk: selects one or more facilities, weekdays (shortcuts Mon–Fri, weekend, daily) and hours (e.g., Mon–Fri 16:00–22:00) or different hours for individual days, plus a validity period. By default the new hours replace the existing availability on the selected days; they can also be appended. Availability does not free up occupied time — club classes and bookings and rentals during those hours remain occupied, and only a free segment of at least 90 min can be requested. A day's availability can be removed with one click.
- **REQ-038** (Should; D-023, Q-015 of the brief) — Hours report for facilities the club rents from others (school halls in winter): for each place flagged `rented_by_club`, the hours of `done` sessions per month, with the groups and coaches, exported to CSV, so that the club can check the owner's bill against its own log.

## Non-goals

- Online payment for renters and accounts for regular renters (online requests are in 1.0 — REQ-024 — but payment still goes by bank transfer to the facility owner's account).

## Proposed Solution

One app module, `facilities`: zones, closures, rental rates, internal bookings, external rentals and online requests, the occupancy service `facilities.occupancyService`, the public facility calendar, log, incidents, bans, maintenance tasks and the owner report. It requires `activities` (sessions occupy places; "Book for group" creates a one-off event, DD-26) and uses `payments` only through the optional DI token `payments.chargeService` (DD-19).


### Design Decisions and Alternatives

| Decision | Rationale | Alternative considered | Why rejected / deferred |
|---|---|---|---|
| **DD-19** `facilities` requires only `activities`. When `payments` is enabled, the rental charge is created through the optional DI token `payments.chargeService` (`hasRegistration`) inside the same transaction as the rental (on staff entry and on approval), and `payments.payment.recorded` confirms the rental; when it is not, a rental carries its `amount`, the renter's email shows the amount, the owner's account number and the payment deadline, and staff confirm the rental with the `confirm` action. Enabling `payments` later creates no charges for earlier rentals (D-028) | A booking with a charge stays consistent when payments are on (no window between the rental and its charge), and the facility module — the product's differentiator — no longer waits for phase 4, whose treasurer work is held back (A02, D-021) | `requires: ['payments']` with the charge in the same transaction (the original DD-19); an event and an asynchronous subscriber | The hard dependency made phase 5 wait for phase 4; an asynchronous charge opens an inconsistency window between the booking and the charge |
| **DD-20** Conflicts of sessions with bookings and closures are enforced by `facilities` via a mutation guard (`umes.mutation-guard`) on session save; `activities` does not know `facilities` | Dependency direction consistent with the phases; `activities` works without `facilities` | `activities` queries `facilities` | Reversed dependency between phases 2 and 5 |
| **DD-21** Zones (`facilities_zone_rules`) app-owned; opening hours on `planner` only if V-7 confirms the rule fields | The `planner` facts do not describe rule fields, and zones have four values and a priority | Zones on `planner` rules | No confirmation in the facts |
| **DD-22** Municipal and school events are closures with a time range (`facilities_closures` with `reason`) entered by the administrator on behalf of the municipality | The municipality has no account; a closure already blocks bookings and flags sessions for rescheduling | Booking with amount 0 and priority | Would mix settlements with blocks |
| **DD-25** An internal booking is a separate entity `facilities_internal_bookings` (no renter, amount or charge, immediately `confirmed`); external rental remains in `facilities_rentals`; a single facility conflict service counts sessions, internal bookings, rentals, provisional request holds and closures together | Different lifecycle, pages and money; one slot occupancy rule | One table with a `kind` field | Half of the columns would be empty for each kind, and statuses would require per-kind conditions |
| **DD-26** "Book for group" in the facilities calendar does not create a booking but a one-off group event (`activities`, type `tournament`/`other`) whose session occupies the facility; an internal booking without a group serves general purposes (coach training, meeting) | One source of occupancy per use — no double counting; the tournament goes into participants' calendars and has attendance | Booking + separate activity, linked by ID | Two records of the same use that can drift apart |
| **DD-27** An external request is a rental in status `pending_verification` → `pending_approval` (after clicking the link in the email); only approval creates the charge; the provisional slot hold applies only to other external requests and lasts at most 48 h from email confirmation | Q-023; email confirmation filters out spam and typos in the address | `forms` module form (`/f/[slug]`, `requireAuth: false`, consent recording) | `forms` requires `customer_accounts` and saves the submission asynchronously, while slot availability must be checked in the same transaction as the save |
| **DD-36** Maintenance tasks (REQ-022, D-017) live in `facilities_maintenance_tasks`. A task with a time window takes part in `facilities.occupancyService` as an occupying entry, like a closure: it blocks new entries with 409 `maintenance_scheduled` and flags existing ones through the `facilities.maintenance.scheduled` event. Usage-based tasks compute their counter from the same occupancy data (done sessions, past internal bookings, done rentals) rather than storing a running total, so a corrected or cancelled entry changes the count. Planning is guarded by the feature `facilities.maintenance.manage`, never by a role name. A person granted only that feature is scoped to the places listed for them in `facilities_place_maintainers` and reads the facility calendar with the public calendar's redaction (Q-043). `people.scopeService` resolves that scope through the optional DI token `facilities.maintainerScopeProvider` (`hasRegistration`; absent → `maintenance_place_ids = []`, fail closed); `people` declares no `requires` on `facilities` | One occupancy service decides every conflict (DD-25), and a per-person feature grant reaches the person who maintains the pitch without a new role (Q-041) | A separate maintenance calendar with its own conflict check; a `facility_maintainer` business role | A second conflict check would drift from the occupancy rules; a role needs navigation, seeding and a scope branch for one task, while `auth:user_acl` already holds per-user features (V-13) |

## Domain Vocabulary and Business Rules

Terms not listed here (club, section, place, person, group, activity, session, role assignment, record scope) are defined in the club management specification.


| Term / invariant | Precise meaning or rule | Source of truth | Failure behavior |
|---|---|---|---|
| Zone | A weekly rule for a place: weekdays, `time_from`–`time_to`, `zone` `public_free` / `club_training` / `reservable_paid` / `closed`, `priority`, validity period; overlapping rules are resolved by the higher priority. The draft's named priorities map to: `public` → `source = regulations`, priority 1; `club` and `rental` from the facility rules → `source = regulations`, priority 2; booking availability (REQ-029) → `source = availability`, priority 3; `school` and `municipal_event` are closures (DD-22), which override every zone | `facilities_zone_rules` | Equal priority and overlap → 409 on rule save |
| Booking availability | `reservable_paid` zone rules with source `availability`, priority 3 (higher than the rules derived from the facility rules) and period `valid_from`–`valid_to`; created in bulk (facilities × days × hours). The effective zone at a given moment = the highest-priority rule in force on that day. The window must fit within the place's opening hours and last ≥ 90 min. "Replace" mode removes the existing availability (`reservable_paid`) on the selected days before saving; "append" mode returns 409 when windows of the same priority overlap | `facilities_zone_rules` | Invalid hour, outside opening hours, < 90 min → 422 per day; `pending_approval` requests outside the new availability remain for the administrator's decision (warning) |
| Closure | A period (date or date+hours) with a reason `snow` / `maintenance` / `municipal_event` / `school` / `other` (`maintenance` here is a closure ordered by the owner; work the club plans itself is a maintenance task, REQ-022); blocks new bookings; existing bookings and club sessions in that time get a reschedule flag | `facilities_closures` | — |
| Maintenance task | Work or an inspection on a place, of `kind` (e.g. `line_marking`, `mowing`, `aeration`, `irrigation`, `brushing`, `inspection`, `other`), with `responsible` (`club`/`owner`). It has one of three schedules: `one_off` (a single task with a time window, or a due date); `date_recurring` (an RRULE by date with a due date); `usage_hours` ("every N hours of use", where the counter is the sum of hours on the place, its ancestors and descendants since `usage_counted_from`: `done` sessions, internal bookings whose `ends_at` has passed, and `done` rentals). A task with a time window (`starts_at`–`ends_at`, any time of day, also outside opening hours) and status `planned` occupies the slot. Creating or moving the window flags conflicting sessions, bookings and rentals with `needs_reschedule`. Completing a task sets `done_at`; a recurring task then creates its next instance, or resets `usage_counted_from` to `done_at` | `facilities_maintenance_tasks` | New entries in the window → 409 `maintenance_scheduled`; without `facilities.maintenance.manage` → 403; `usage_hours` without a threshold ≥ 1 → 422 |
| Slot occupancy | A place's slot is occupied if at that time, on it, its ancestors or descendants there exists: a `planned` session, a `confirmed` internal booking, a `requested`/`confirmed` rental, a closure, a `planned` maintenance task with a time window, and — only for subsequent external requests — a `pending_approval` request with a valid hold. This is computed by a single service `facilities.occupancyService`; club sessions are additionally checked against `capacity_groups` | `facilities` | 409 with the list of conflicting entries (without personal data for public routes) |
| Internal booking | The club occupying a place without a group (coach training, meeting, tournament preparation): place, `starts_at`–`ends_at` (any length, within opening hours), purpose, section, the person booking and their role; immediately `confirmed`, without approval, amount or charge (Q-022); in any zone, including "open to public" and "bookable"; canceled by the person who booked it, the coordinator of their section or the administrator | `facilities_internal_bookings` | Conflict → 409; outside opening hours or during a closure → 409 `place_closed` |
| External request | A rental created from the public calendar by a person without an account: `requested_via = online_form`, status `pending_verification` (until the link in the email is clicked, valid for 1 h) → `pending_approval` (slot hold against other external requests until `hold_expires_at` = confirmation + 48 h) → administrator approval → `requested` (charge created) or `rejected` (with a reason, email) / `expired` (no decision) / `superseded` (slot taken by a club booking; email). Only in the `reservable_paid` zone, only for places with `accepts_online_requests` and when the club has enabled online requests | `facilities_rentals` | A request without approval is never a valid booking: it does not appear as "booked", does not create a charge, does not block club sessions |
| Booking (external rental) | Rental of a place by a renter: `units` × 90 min (§3 sec. 2), only in the `reservable_paid` zone, without conflicts (see "Slot occupancy") or an active entry ban on the renter; `cancellation_deadline = starts_at − 24 h` (§3 sec. 4); `payment_deadline = starts_at − N days` (N from the management agreement, §3 sec. 3); amount from the rental rates by renter category and season | `facilities_rentals` | Any violation → 409 with a code (`zone_not_reservable`, `rental_conflict`, `entry_ban_active`, `place_closed`) |
| Rental statuses | online request: `pending_verification` → `pending_approval` → (`requested` \| `rejected` \| `expired` \| `superseded`); a staff entry starts at `requested` (entry by staff = approval); then `requested` → `confirmed` (payment recorded or manual confirmation) → `done` (after `ends_at`); `cancelled_free` (canceled before the deadline; charge `cancelled`), `cancelled_late` (after the deadline; charge `forfeited`), `no_show` (facility attendant; charge remains) | `facilities` | Transitions outside this list → 409 |
| Public facility calendar | A place's month: zones, club classes and internal bookings ("taken by the club", without names), rentals ("booked"), requests with a hold ("requested — pending"), closures and maintenance work ("unavailable", without the kind or the person), opening hours, rates, rules, phone; next to free "bookable" slots a "Request a booking" button, when online requests are enabled | `facilities` (view) | Never contains names of renters, people or groups |

## Users, Permissions, and Scope

N/A — the actors, scope rules and the full feature list stay in `2026-10-20-vereino-club-management.md` (*Users, Permissions, and Scope*). The roles this specification relies on are the facility attendant (`place_ids`), the maintenance planner (`maintenance_place_ids`, DD-36), staff who book internally, the administrator who approves requests, and the guest on the public calendar.


## Reuse and Ownership Map

N/A — see `2026-10-20-vereino-club-management.md` (*Reuse and Ownership Map*). 


## Architecture and Data Flow

`facilities` requires `activities` (`2026-10-20-vereino-club-management.md`, *Architecture and Data Flow*). Session conflicts are enforced by its mutation guard on session save (DD-20); occupancy is one service (DD-25); the maintainer scope is provided to `people.scopeService` through the optional token `facilities.maintainerScopeProvider` (DD-36). With `payments` enabled, rental charges are created through `payments.chargeService` in the same transaction; without it, rentals carry only their amount (DD-19, D-028).


## User Journeys

### Journey J-005 — Orlik rental (phase 5; draft §7a)

1. A coach from a neighboring municipality opens `/p/dev-academy/places/orlik-boisko`, sees a free "bookable" slot on Wednesday 19:30–21:00 and calls the number from the schedule (online variant — J-007).
2. The facility attendant creates the booking: Boisko piłkarskie, 1 unit (90 min), renter "KS Sąsiedzi" (category: club from the municipality, winter season) → the system calculates the amount, the payment deadline and the free cancellation deadline, creates a charge with `payee` = the municipality (when `payments` is enabled; without it the rental carries the amount, DD-19) and sends the renter an email with a summary, the municipality's account number and the rules.
3. The slot in the public schedule changes to "booked"; a coordinator trying to put a training session there gets a conflict.
4. The administrator records the payment to the municipality's account → charge `paid`, booking `confirmed`; without `payments` the administrator confirms the booking with the `confirm` action (DD-19).
5. On the rental day the facility attendant opens the facility, records the pitch condition and the presence of an adult group supervisor, and after the end — the condition afterwards and the closing; a rules violation → incident, optionally an entry ban.
6. At the end of the month the administrator generates the municipality report and exports CSV.
7. Variants: cancellation 10 h before → `cancelled_late`, charge `forfeited`, the slot returns to "bookable"; the municipality announces an event → the administrator enters a closure with the reason "municipal event", the booking gets a reschedule flag, and rescheduling sends the renter an email notification.

### Journey J-006 — A coach books a facility for a tournament (phases 2 and 5)

1. Coach Marek opens `/club/places`, selects "Boisko piłkarskie" and Saturday; sees zones, club classes, bookings and free hours of all club facilities.
2. Selects 9:00–12:00 and clicks "Book" → chooses "For group: Orliki" and the type "Tournament", adds invited teams from the list of external teams.
3. The system checks occupancy (opening hours, closures, sessions, bookings, rentals) and, without coordinator approval, creates a one-off group event; its session occupies the pitch and appears in participants' and parents' calendars with the option to declare.
4. An earlier external request awaiting approval for that time gets the status `superseded`, and the requester — an email with information and a link to the calendar.
5. A zumba instructor books "Salka szkoleniowa" the same way for a training course without a group → internal booking with the purpose "instructor training".
6. Errors: slot occupied → 409 with the list of conflicting entries (with names — staff can see them); outside opening hours or during a closure → 409 `place_closed`; during planned maintenance work → 409 `maintenance_scheduled`; "For group" outside own groups → 403.

### Journey J-007 — Booking request from an external person (phase 5)

1. An organizer from another club goes to `/p/dev-academy/places`, sees the list of club facilities and selects Orlik; in the calendar clicks a free "bookable" slot on Wednesday 19:30–21:00 and "Request a booking".
2. Form: organization/person, contact first and last name, phone, email, category (club from the municipality / external), number of 90-min units, purpose, acceptance of the facility rules (required), data processing notice. The system shows an indicative amount from the rates.
3. After submitting: "Check your inbox — confirm your request using the link". Clicking the link → status "awaiting approval"; the slot in the public calendar appears as "requested — pending", and subsequent requests for that time are rejected with a message.
4. Administrators receive a notification; in `/backend/facilities/requests` (and the "Requests awaiting approval" widget) the administrator sees the request, conflicts, any match with the entry ban register, and approves → rental `requested` with a charge payable to the municipality's account; the requester receives an email with the amount, account number, payment deadline and free cancellation deadline. From then on as in J-005 from step 3.
5. Variants: rejection with a reason → email, slot free; no decision within 48 h → `expired`, email, slot free; email not confirmed within 1 h → request deleted; a request is never "booked" until the administrator approves it.


## UI and Interaction Contracts

Conventions (page shells, `DataTable`, `CrudForm`, option-source routes, states) and the navigation per role are in `2026-10-20-vereino-club-management.md`.


| Surface / route | Purpose and primary actions | Data source / mutations | Closest installed reference | Canonical shell / components | Required states | Requirement IDs |
|---|---|---|---|---|---|---|
| `/backend/facilities/calendar` | facility calendar: zones, sessions, bookings, closures; new booking from a slot; **"Set booking availability"** — bulk setup dialog (facilities, days with shortcuts, hours or a "different hours per day" grid, period, replace/add) and a weekly availability table with per-day removal | `GET /api/facilities/calendar`, `POST /api/facilities/rentals`, `POST /api/facilities/zone-rules/bulk` | `/backend/calendar` | schedule family (V-8), `CrudForm` dialog (days as chips with shortcuts, day grid in "different hours" mode) | loading, empty, error (422 on a day), conflict | REQ-013, REQ-029 |
| `/backend/facilities/rentals` (+ `create`, `[id]`) | bookings, statuses, rescheduling | `/api/facilities/rentals`, `POST …/{id}/cancel\|confirm\|move\|no-show` | `/backend/sales/orders/[id]` | `DataTable`, `CrudForm`, `StatusBadge` | as above | REQ-013 |
| `/backend/facilities/zones`, `/closures`, `/rates` | zones, closures, rates | CRUD | `/backend/planner/availability-rulesets` | `DataTable`, `CrudForm` | as above | REQ-013 |
| `/backend/facilities/logs`, `/incidents`, `/bans`, `/maintenance` | log, incidents, bans, maintenance (tasks; "Maintainers" tab: people assigned per place) | CRUD | `/backend/staff/leave-requests` | `DataTable`, `CrudForm`, attachments | as above | REQ-016, REQ-022 |
| `/backend/facilities/reports/owner` | municipality report + CSV | `GET /api/facilities/reports/owner?from=&to=` | `/backend/staff/time-tracking/reports/[id]` | KPI sections, `DataTable` | loading, empty, error | REQ-015 |
| `/club/facility` | today at the facility (attendant): bookings, log, incident | `/api/facilities/today`, `/api/facilities/logs`, `/api/facilities/incidents` | `/backend/staff/my-availability` | list + `CrudForm` dialogs | loading, empty, error, conflict | REQ-013, REQ-016 |
| `/p/[clubSlug]/places` | list of club facilities with a public calendar | `GET /api/facilities/public/{clubSlug}/places` | `/[orgSlug]/portal` (public page) | frontend page `requireAuth: false` | loading, empty, error, 404 | REQ-014, REQ-024 |
| `/p/[clubSlug]/places/[placeSlug]` | public month calendar; "Request a booking" on "bookable" slots (when enabled) | `GET …/places/{placeSlug}/schedule?month=`, `POST …/places/{placeSlug}/requests` | `/[orgSlug]/portal`; form — `/f/[slug]` (`forms`) | frontend page `requireAuth: false`, schedule family, design system form in a dialog | loading, error, 404, month without data, slot already requested (409), sent — check your email | REQ-014, REQ-024 |
| `/p/[clubSlug]/requests/verify/[token]` | request confirmation via a link from the email | `POST /api/facilities/public/requests/verify/{token}` | `/messages/view/[token]` | frontend page `requireAuth: false` | success ("awaiting administrator approval"), expired link, slot taken in the meantime | REQ-024 |
| `/backend/facilities/requests` | external request queue: conflicts, entry ban register match, time to expiry; approve / reject with a reason | `GET /api/facilities/rentals?status=pending_approval`, `POST …/{id}/approve\|reject` | `/backend/staff/leave-requests` (request approval) | `DataTable`, decision dialog, `StatusBadge` | loading, empty ("No requests"), error, conflict, permission denied | REQ-024 |
| `/club/places` (+ `[placeId]`) | facility calendar for staff; "Book" (general purpose) or "Book for group" (event, tournament); "Plan maintenance" for people with `facilities.maintenance.manage`. A maintenance planner without `facilities.view` sees only their assigned places, without personal data, and only the "Plan maintenance" action | `GET /api/facilities/calendar`, `POST /api/facilities/internal-bookings`, `POST /api/activities/events`, `/api/facilities/maintenance-tasks` | `/backend/calendar` | frontend page `requireAuth` + `facilities.view` or `facilities.maintenance.manage`, schedule family, `CrudForm` dialog | loading, empty, error, conflict (409 with a list of conflicts), permission denied | REQ-023, REQ-027 |
| `/backend/facilities/reports/rented-hours` | hours of `done` sessions on places the club rents, per month, group and coach; CSV | `GET /api/facilities/reports/rented-hours?from=&to=&placeId=` | `/backend/staff/time-tracking/reports/[id]` | `DataTable` with export | loading, empty ("No places flagged as rented"), error, permission denied | REQ-038 |

| Surface / widget | Empty state guidance and action | Responsive behavior | Keyboard / focus behavior |
|---|---|---|---|
| Facility calendar | "No zone rules — add zones to enable bookings" + button | day view on phone, week on desktop | arrows change the day/week; a slot opens the booking dialog |
| Public schedule | "The facility has no published schedule this month" + phone number | day list view on phone, month grid above | zone legend readable without color (pattern + label) |

### `/backend/facilities/calendar` — Facility calendar

```text
┌──────────────────────────────────────────────────────────┐
│ Facility calendar  Place: [Boisko piłkarskie ▾]  [< week >]    │
├──────────────────────────────────────────────────────────┤
│        Mon       Tue         Wed              Thu         │
│ 16:00  ░public   ▓Żaki training ░open to public ░         │
│ 17:30  ▓Orliki   ▓Żaki training ▒bookable       ▓Juniorzy │
│ 19:30  ▒bookable ■KS Sąsiedzi  ▒bookable       ✕closed    │
├──────────────────────────────────────────────────────────┤
│ Legend: ░ open to public ▓ club ▒ bookable ■ booked ✕ closed │
└──────────────────────────────────────────────────────────┘
```

- **Behavior:** clicking a "bookable" slot opens the new booking dialog with the calculated amount and deadlines; conflicts and bans are shown next to the field before saving; bookings flagged "to reschedule" are highlighted and filterable.
- **Responsive and accessibility:** day view on phone; text legend independent of color.
- **Localization:** `facilities.calendar.*`.
- **Design-system and theming:** zone colors from semantic tokens.

### `/p/[clubSlug]/places/[placeSlug]` — Public facility calendar with booking request

```text
┌──────────────────────────────────────────────┐
│ ← Club facilities · Orlik 2024 · Boisko piłkarskie │
│ November 2026  [<] [>]   Tel.: 600 000 000    │
├──────────────────────────────────────────────┤
│ Wed 13.11 16:00–17:30 open to public          │
│           17:30–19:30 taken by the club       │
│           19:30–21:00 bookable [Request a booking] │
│ Sat 16.11 09:00–12:00 taken by the club       │
│           12:00–13:30 requested — pending     │
│ Thu 14.11 all day closed (snow)               │
├──────────────────────────────────────────────┤
│ Opening hours · Rates · Regulations (PDF)     │
└──────────────────────────────────────────────┘
┌ Request a booking (dialog) ──────────────────┐
│ Wed 13.11 19:30–21:00 · 1 × 90 min · approx. 150 zł │
│ Organization / person [          ]           │
│ Contact: full name, phone, email              │
│ Category [municipal club ▾]  Purpose [     ] │
│ ☐ I accept the facility regulations (required) │
│ The request is valid only after approval      │
│ by the club administrator.    [Send]          │
└──────────────────────────────────────────────┘
```

- **Behavior:** no sign-in; no renter, group or person names; a permanent address for the QR code; the "Request a booking" button only on `reservable_paid` slots, when the club has enabled online requests and the place has `accepts_online_requests`; after sending, a message about the link in the email; the amount is marked as approximate; the calendar response is cached briefly and invalidated by writes to sessions, bookings, rentals, zones, closures and maintenance tasks.
- **Responsive and accessibility:** day list on phone, month grid on wider screens; zones described in text.
- **Localization:** `facilities.public.*`.
- **Design-system and theming:** as above; the page works in light and dark mode.


## Data Models


| Entity / table | Fields | Indexes and uniqueness | Sensitive | Lifecycle and validation |
|---|---|---|---|---|
| `ZoneRule` / `facilities_zone_rules` | `place_id` uuid; `weekdays` int[] (1–7); `time_from`, `time_to` time; `zone` enum; `priority` int; `source` enum (`regulations`/`availability`); `valid_from` date; `valid_to` date? | (`organization_id`, `place_id`) | no | overlap with equal priority → 409 |
| `Closure` / `facilities_closures` | `place_id` uuid; `starts_at`, `ends_at` timestamptz; `reason` enum; `note` text? | (`organization_id`, `place_id`, `starts_at`) | no | creation flags conflicting sessions (`needs_reschedule`) and bookings |
| `RentalRate` / `facilities_rental_rates` | `place_id` uuid; `renter_category` enum (`municipal_club`/`municipal_club_winter_lighting`/`external_commercial`); `price_per_90` int (every unit is 90 min, no 60-min rate); `season_from`, `season_to` text (MM-DD)?; `includes_lighting` bool; `valid_from`, `valid_to` | (`organization_id`, `place_id`, `renter_category`) | no | `municipal_club_winter_lighting` is a staff-only category: the public form offers `municipal_club`/`external_commercial`, and staff apply the winter-lighting rate (on entry or approval) when the date falls within `season_from`–`season_to` and `includes_lighting` |
| `Rental` / `facilities_rentals` | `place_id` uuid; `renter_type` enum (`institution`/`person`/`unregistered`); `renter_id` uuid? (null for an online request until the administrator assigns or creates the institution/person on approval); `renter_display_name` text (from the form); `renter_category` enum; `contact_name`, `contact_phone`, `contact_email` text; `purpose` text?; `requested_via` enum (`phone`/`email`/`in_person`/`online_form`); `starts_at`, `ends_at` timestamptz; `units` int; `rate_id` uuid; `amount` int; `charge_id` uuid? (created on approval / staff entry when `payments` is enabled, DD-19); `status` enum (`pending_verification`/`pending_approval`/`requested`/`confirmed`/`done`/`rejected`/`expired`/`superseded`/`cancelled_free`/`cancelled_late`/`no_show`); `verification_token_hash` text?; `verification_expires_at`; `email_verified_at`; `hold_expires_at` timestamptz?; `decided_by_person_id` uuid?; `decided_at`; `decision_reason` text?; `entry_ban_match` bool (hint for the administrator); `cancellation_deadline`, `payment_deadline` timestamptz?; `regulations_accepted_at`, `regulations_accepted_via` (`online_form`/`phone`/`email`/`in_person`); `needs_reschedule` bool; `notes` | (`organization_id`, `place_id`, `starts_at`); (`organization_id`, `status`, `hold_expires_at`); unique `verification_token_hash` | `renter_display_name`, `contact_*`, `purpose`, `decision_reason`, `notes` encr.; token only as SHA-256 | status transitions only via commands; `pending_verification` requests not confirmed within 1 h are deleted by a job (they contain no decisions or money) |
| `InternalBooking` / `facilities_internal_bookings` | `place_id` uuid; `starts_at`, `ends_at` timestamptz; `section_id` uuid; `purpose` text; `booked_by_person_id` uuid; `acting_role` text; `status` enum (`confirmed`/`cancelled`); `needs_reschedule` bool (set by a closure or a maintenance window, cleared when the booking is moved or cancelled); `cancelled_by_person_id` uuid?; `cancel_reason` text? | (`organization_id`, `place_id`, `starts_at`); (`organization_id`, `booked_by_person_id`) | no | created immediately as `confirmed`; cancellation via a command; visible to staff with the purpose and the booker |
| `FacilityLog` / `facilities_logs` | `place_id` uuid; `log_date` date; `operator_person_id` uuid; `opened_at`, `closed_at`; `condition_before`, `condition_after` text; `groups_present` jsonb (`{ rental_id\|occurrence_id, headcount, adult_supervisor_present }[]`); `remarks` | unique (`place_id`, `log_date`) | `remarks` encr. | editable until the end of the next day, then administrator only |
| `Incident` / `facilities_incidents` | `place_id` uuid; `occurred_at`; `reported_by_person_id` uuid; `kind` enum; `description` text; `involved` jsonb; `action_taken` enum[]; `thread_id` uuid?; attachments via `attachments` | (`organization_id`, `place_id`, `occurred_at`) | `description`, `involved` encr. | no deletion (evidence, §6) |
| `EntryBan` / `facilities_entry_bans` | `place_id` uuid; `subject_type` enum; `subject_id` uuid; `starts_on` date; `ends_on` date?; `reason` text; `incident_id` uuid?; `issued_by_person_id` uuid; `revoked_at`? | (`organization_id`, `subject_type`, `subject_id`) | `reason` encr. | revocation via `revoked_at`, no deletion |
| `MaintenanceTask` / `facilities_maintenance_tasks` | `place_id` uuid; `kind` enum; `responsible` enum (`club`/`owner`); `schedule_type` enum (`one_off`/`date_recurring`/`usage_hours`); `starts_at`, `ends_at` timestamptz? (time window); `due_date` date?; `recurrence_rule` text? (RRULE, `date_recurring`); `usage_hours_threshold` int? (`usage_hours`, ≥ 1); `usage_counted_from` timestamptz? (`usage_hours`); `series_id` uuid? (instances of one recurring task); `status` enum (`planned`/`done`/`cancelled`); `planned_by_person_id` uuid; `done_at`?; `done_by_person_id` uuid?; `cost` int?; `notes` text? | (`organization_id`, `place_id`, `starts_at`); (`organization_id`, `place_id`, `due_date`); (`organization_id`, `status`, `schedule_type`) | no | Must (D-017). A window requires `ends_at` > `starts_at`; a `planned` task with a window is part of slot occupancy; creating or moving it flags conflicts like a closure; completion is a command (`facilities.maintenance.complete`), which creates the next instance or resets the counter; no deletion of `done` tasks |
| `PlaceMaintainer` / `facilities_place_maintainers` | `place_id` uuid; `person_id` uuid; `assigned_by_person_id` uuid; `assigned_at` timestamptz | unique (`organization_id`, `place_id`, `person_id`); (`organization_id`, `person_id`) | no | managed with `facilities.manage`; removing a row ends that person's maintenance scope for the place at once; a person without rows and without a club-wide role has an empty maintenance scope (fail closed) |

Migrations: one migration per module per phase, generated with `yarn db:generate`, reviewed and saved together with the module snapshot; the user approves the migration before it is committed (AGENTS.md Ask First, `BACKWARD_COMPATIBILITY.md` §5), and `yarn db:migrate` runs only with approval. Changes after the first deployment — corrective migrations only.


## API, Command, and Error Contracts

The route conventions (S6.3–S6.7, versions, 409s, error codes) in `2026-10-20-vereino-club-management.md` apply to every row.


| Method / command | Path / ID | Auth and feature gate | Input | Success response / event | Errors and concurrency | Requirement IDs |
|---|---|---|---|---|---|---|
| CRUD | `/api/facilities/zone-rules`, `/closures`, `/rental-rates`, `/logs`, `/incidents`, `/entry-bans`, `/maintenance-tasks`, `/place-maintainers` | auth + `facilities.manage` / `facilities.log.write` / `facilities.incidents.manage` (maintenance tasks: `facilities.maintenance.manage`, limited to `maintenance_place_ids` unless the caller is the club administrator (`club_wide`, D-024); place maintainers: `facilities.manage`; adding or removing a maintainer also grants or revokes `facilities.maintenance.manage` on that person's user through the `auth` write path that V-13 confirms (`user_acls.features_json`; fallback: a seeded technical role); moving a task = updating its window through this CRUD, which re-emits `facilities.maintenance.scheduled`; cancelling = status `cancelled` through this CRUD) + place scope | schemas | `facilities.{entity}.*` | 409 (zone overlap, version) | REQ-013, REQ-016, REQ-022 |
| `POST` / `facilities.maintenance.complete` | `/api/facilities/maintenance-tasks/{id}/complete` | auth + `facilities.maintenance.manage` + place scope (`maintenance_place_ids`; the club administrator is club-wide) | version + `{ doneAt?, cost?, notes? }` | `done`; next instance (`date_recurring`) or `usage_counted_from = doneAt` (`usage_hours`); `facilities.maintenance.completed` | 409 (status, version) | REQ-022 |
| `GET` | `/api/facilities/reports/rented-hours` | auth + `facilities.reports.view` | `{ placeId?, from, to, format?: csv }` | hours of `done` sessions per rented place and month, with groups and coaches | 400 | REQ-038 |
| `POST` / `facilities.zone_rules.bulk_upsert` | `/api/facilities/zone-rules/bulk` | auth + `facilities.manage` | `{ placeIds[], mode: 'replace' \| 'append', validFrom, validTo?, windows: [{ weekday, from, to }] }` (the same hours for multiple days or separate hours for each day) | 200 `{ created, removed, warnings: { clubOccurrencesInWindows, pendingRequestsOutside } }`; `facilities.zone_rules.bulk_updated` | 422 per day (hour order, < 90 min, outside opening hours), 409 overlap in `append` mode; one transaction for all facilities — an error in one rolls back everything | REQ-029 |
| `POST` / `facilities.rentals.create` | `/api/facilities/rentals` (+ `/quote` without saving) | auth + `facilities.rentals.manage` + place scope | `{ placeId, renterType, renterId, renterCategory, startsAt, units, contact…, requestedVia }` | 201 `{ rental, charge? }` (`charge` only when `payments` is enabled, DD-19); `facilities.rental.requested` | 409 `zone_not_reservable`/`rental_conflict`/`place_closed`/`maintenance_scheduled`/`entry_ban_active`; 422 (units) | REQ-013, REQ-022 |
| `POST` | `/api/facilities/rentals/{id}/confirm\|cancel\|move\|no-show` | auth + `facilities.rentals.manage` | version (+ `{ startsAt, placeId }` for `move`) | `facilities.rental.confirmed\|cancelled\|moved\|no_show` | 409 transition/conflict | REQ-013 |
| `GET` | `/api/facilities/calendar`, `/api/facilities/today` | auth + `facilities.view`, or `facilities.maintenance.manage` alone; place scope applies to callers with `place_ids` (facility attendant) or, without `facilities.view`, to `maintenance_place_ids` — other staff read all club places | `{ placeId, from, to }` | zone blocks, sessions, bookings (with renter), closures, maintenance tasks; for a caller without `facilities.view` the response omits renter, person and group names and contact data (occupancy only as "taken by the club" / "booked"), the same redaction as the public calendar | 400 date range; 403 place outside scope | REQ-013, REQ-022 |
| `GET` | `/api/facilities/public/{clubSlug}/places` | no auth; rate limit in `metadata`; short cache | — | facilities with `is_public_schedule` (name, type, address, photo, whether it accepts requests) | 404 (unknown club or `places_calendar` block disabled), 429 | REQ-014, REQ-024 |
| `GET` | `/api/facilities/public/{clubSlug}/places/{placeSlug}/schedule` | as above | `{ month }` | blocks without personal data (zones, "taken by the club", "booked", "requested — pending", closures, "unavailable" for planned maintenance work) + hours, rates, regulations, phone, `canRequest` per slot | 404 (unknown/disabled slug), 429 | REQ-014, REQ-024 |
| `POST` / `facilities.rentals.submit_request` | `/api/facilities/public/{clubSlug}/places/{placeSlug}/requests` | no auth; strict rate limit (per IP and per email); honeypot field | `{ startsAt, units, renterDisplayName, renterCategory, contactName, contactPhone, contactEmail, purpose?, regulationsAccepted: true }` | 202 `{ status: 'pending_verification' }`; email with a link; `facilities.rental.request_submitted` | 409 `slot_unavailable` (taken or with a valid hold), 409 `maintenance_scheduled` (planned facility work, D-024), 422 (outside a `reservable_paid` zone, regulations not accepted, units), 403 (online requests disabled), 429 | REQ-024, REQ-022 |
| `POST` / `facilities.rentals.verify_request` | `/api/facilities/public/requests/verify/{token}` | no auth; scope from the token record | — | `pending_approval`, `hold_expires_at` = now + 48 h; `facilities.rental.request_verified` → administrators notified | 410 (expired/used), 409 `slot_unavailable` (taken in the meantime) | REQ-024 |
| `POST` / `facilities.rentals.approve` | `/api/facilities/rentals/{id}/approve` | auth + `facilities.rentals.approve` | version + `{ renterId?, createInstitution?: {…}, amountOverride?, note? }` | `requested` + charge when `payments` is enabled (`payments.chargeService`, `payee` = owner, DD-19); email with the amount, the owner's account and the deadline; `facilities.rental.approved` | 409 (not `pending_approval`, conflict, version) | REQ-024 |
| `POST` / `facilities.rentals.reject` | `/api/facilities/rentals/{id}/reject` | auth + `facilities.rentals.approve` | version + `{ reason }` | `rejected`; email; `facilities.rental.rejected` | 409 | REQ-024 |
| `GET` | `/api/facilities/reports/owner` | auth + `facilities.reports.view` | `{ placeId, from, to, format?: csv }` | hours in zones, bookings (count, value), payments to the municipality's account, incidents, maintenance | 400 | REQ-015 |

## Events, Jobs, Notifications, and Cross-Module Flows

The subscriber to `payments.payment.recorded` is registered only when `payments` is enabled; without it a rental moves to `confirmed` through the `confirm` action.


| Trigger | Producer | Consumer | Side effect | Retry / idempotency / audit behavior |
|---|---|---|---|---|
| `payments.payment.recorded` | `payments` | `facilities` (subscriber) | booking with a paid charge → `confirmed` | idempotent by status |
| scheduler `facilities:rental-lifecycle` (every 15 min) | `facilities` | `facilities` | `confirmed` after `ends_at` → `done`; bookings without payment after `payment_deadline` → "to clarify" list (or expiry when the agreement has `auto_expire_unpaid`) | status conditions in the UPDATE |
| `facilities.rental.request_submitted` | `facilities` | `communication` | email with a confirmation link to the requester | idempotency key = rental ID |
| `facilities.rental.request_verified` | `facilities` | `notifications` | `facilities.rental_request_pending` notification for people with `facilities.rentals.approve` | — |
| `facilities.rental.approved\|rejected\|expired\|superseded` | `facilities` | `communication` | email to the requester (approval with the amount, account and deadlines; rejection with a reason; expiry; superseded by a club booking) | persistent subscriber, key = ID + status |
| scheduler `facilities:expire-requests` (every 15 min) | `facilities` | `facilities` | `pending_approval` after `hold_expires_at` → `expired`; `pending_verification` after `verification_expires_at` → deletion | status conditions in the UPDATE |
| `facilities.internal_booking.created` | `facilities` | `communication` | email to the requesters of the requests superseded by the booking (the supersession itself happens inside the `facilities.internal_bookings.create` command's unit of work, not in a subscriber) | post-commit; persistent subscriber, key = rental ID + status |
| `facilities.closure.created` | `facilities` | `facilities` + `activities` command via DI | `needs_reschedule` on sessions, internal bookings and rentals; notification to the coordinator (sessions), to the booker (internal bookings) and email to the renter | idempotent |
| `facilities.maintenance.scheduled` (window created or moved) | `facilities` | `facilities` + `activities` command via DI | `needs_reschedule` on sessions, internal bookings and rentals in the window; notification to the coordinator, to the booker and email to the renter, as for a closure | idempotent |
| `facilities.zone_rules.bulk_updated` | `facilities` | `facilities` | invalidation of the public facility calendar cache | idempotent |
| `facilities.rental.moved\|cancelled` | `facilities` | `communication` | email to the renter | persistent subscriber |
| scheduler `facilities:maintenance-reminders` (daily, Must) | `facilities` | `notifications` | reminder 14 days and 1 day before `due_date`; for `usage_hours` tasks a reminder when the counted hours reach `usage_hours_threshold`, to people with `facilities.maintenance.manage` for that place | sent marker per task and threshold |

## Security, Privacy, and Compliance

The authorization, tenant-isolation and sensitive-data rules of `2026-10-20-vereino-club-management.md` apply. Requester data is encrypted and visible only to staff with `facilities` features; the public calendar never contains names of renters, people or groups.


## Integration Coverage

Test conventions (self-contained tenants, the Stripe test adapter, `yarn test:integration:vereino --filter`) are in `2026-10-20-vereino-club-management.md`.


| Test ID | Level | Setup / fixture | Actions | Assertions | Requirement IDs |
|---|---|---|---|---|---|
| TEST-022 | integration | zones, rates for 3 categories, winter season, entry ban | bookings inside and outside a zone, conflict with a session and with a booking, renter with a ban | amount and dates calculated; 409 with the correct code; charge `payee` = municipality | REQ-013 |
| TEST-023 | integration | booking | cancellation > 24 h and < 24 h; rescheduling; `no_show`; payment | `cancelled_free` + charge `cancelled`; `cancelled_late` + `forfeited`; confirmation after payment; email on rescheduling | REQ-013 |
| TEST-024 | security | public slug | reading the schedule without a session; unknown slug; disabled schedule; burst of requests | no names of renters, groups, or people; 404; 429 | REQ-014 |
| TEST-025 | integration | month with bookings, payments, an incident, maintenance | owner report + CSV | figures match the test data | REQ-015 |
| TEST-026 | integration | log, incident, ban | attendant entries; editing after the deadline; ban blocks a new booking | place scope; editing after the deadline only by the administrator; 409 `entry_ban_active` | REQ-016 |
| TEST-027 | integration | booking, closure | creating a session on a booked slot; closure on a day with a session | 409 from the guard; `needs_reschedule` on the session and the booking | REQ-013 |
| TEST-028 | UI | attendant, guest | facility calendar → new booking; public schedule on a phone | states, keyboard, legend not relying on color, light and dark mode | REQ-013, REQ-014 |
| TEST-031 | integration | `date_recurring` inspection; `usage_hours` brushing task with a threshold of 10 h; done sessions and rentals totalling 10 h on the place | reminder job; completing both tasks | notifications 14 days and 1 day before the due date; usage reminder at 10 h; completion creates the next inspection instance and resets the counter | REQ-022 |
| TEST-033 | integration | two sections, football coach, zumba instructor, facilities: pitch and small hall; zones with `public_free` and `reservable_paid` | internal bookings in different zones and facilities; conflict with a session, a rental, and another booking; outside opening hours; cancellation by the booker, the coordinator, and an unrelated coach | `confirmed` without approval in every zone; 409 with a list of conflicts; 409 `place_closed`; cancellation by an unrelated coach → 403; bookings in the owner report as club time | REQ-023 |
| TEST-035 | integration | club with online requests, place with `accepts_online_requests` | request → link → second request for the same slot → approval (creating an institution); separately: rejection, expiry after 48 h, supersession by an internal booking | `pending_verification` → `pending_approval`; second → 409; approval creates a charge payable to the municipality and an email; rejection with a reason; `expired` after 48 h; `superseded` + email; before approval the slot is never "booked"; requester contact fields are encrypted in the database | REQ-024 |
| TEST-036 | security | public request routes | request outside `reservable_paid`, without accepting the regulations, with requests disabled, burst of requests, filled honeypot field, expired and used token; renter with a ban; approval without the feature | 422/403/429/410 per the contract; ban only as a flag for the administrator; public calendar without requester data; approval without `facilities.rentals.approve` → 403 | REQ-024 |
| TEST-039 | UI | guest on a phone; coach on a phone; administrator | club page → section; facilities → calendar → request; coach: facilities → slot → "Book for group"; administrator: request queue | loading/empty/error/conflict states, keyboard, 375 px, light and dark mode; the message "valid only after administrator approval" visible before submitting | REQ-023, REQ-024, REQ-025 |
| TEST-041 | integration + UI | two pitches with regulation rules; club classes Mon 18:00–19:30; pending request on Saturday | bulk Mon–Fri 16:00–22:00 for both pitches (replace); separately Saturday 9:00–20:30 (per-day mode); attempts: 15:00–16:00, 7:00–10:00, "to" < "from"; appending an overlapping window; removing availability on Friday | rules created for both facilities; public calendar Mon: 16:00–18:00 "bookable", 18:00–19:30 "taken by the club", 19:30–22:00 "bookable"; 422 with a message at the day; 409 on append; warning about a request outside availability; Friday without availability | REQ-029 |
| TEST-049 | integration | pitch with a session, an internal booking and a rental on Saturday; a coordinator granted `facilities.maintenance.manage` and assigned to the pitch; a second coordinator without the grant; a coach without it | the assigned coordinator plans line marking 8:00–10:00 overlapping all three; then a coach books, a rental is entered and an external request is sent in that window; the second coordinator and the coach try to plan maintenance | existing entries get `needs_reschedule` with notifications; new entries → 409 `maintenance_scheduled` (the public request too, D-024); public calendar shows "unavailable" without kind or names; second coordinator and coach → 403 | REQ-022, REQ-023, REQ-024 |
| TEST-050 | integration | a person with only `facilities.maintenance.manage`, assigned to the pitch but not to the hall; a rental with renter contact data and a group session on the pitch | read the pitch calendar; read the hall calendar; plan and complete a task on the pitch; plan a task on the hall; remove the assignment and retry | pitch calendar without renter, person or group names or contacts, with maintenance details; hall → 403; task planned and completed; hall task → 403; after removal → 403 | REQ-022 |
| TEST-053 | integration | a place with `rented_by_club`, `done` and `cancelled` sessions of two groups in two months | rented-hours report per month + CSV | hours of `done` sessions only, per place, month, group and coach; cancelled sessions excluded | REQ-038 |

## Implementation Phases

Validation, the `lib/**` unit-coverage rule and the module registration rule are those of `2026-10-20-vereino-club-management.md` (*Implementation Phases*).

**Phase readiness**

| Phase | Status | Since | Gate evidence |
|---|---|---|---|
| 5 — Facilities and bookings (`facilities`) | Draft | — | V-7, V-9 pending; DD-19 decided by D-028 (`payments` optional), so phase 5 no longer waits for phase 4 |

### Phase 5 — Facilities and bookings (`facilities`)

- **Depends on:** the phase 2 exit gate of the club management specification (sessions occupy places, one-off events) and its phase 3 exit gate (request and rental emails through `communication`); `payments` is optional (DD-19, D-028) — with it, rental charges are created in the same transaction
- **Outcome:** zones, closures, rates; facility calendar for staff with internal booking without approval; external rentals (by phone and requested online with administrator approval); public facility list and calendars; log, incidents, bans, maintenance, and the municipality report.
- **Why this order / value delivered:** the only advantage over PTU (D-008); uses places, sessions, and charges from previous phases.
- **Deliverables:** module `facilities` (entities, commands, mutation guard on sessions, subscribers, jobs `facilities:rental-lifecycle` and `facilities:maintenance-reminders`, `encryption.ts`, `lib/*` with `__tests__/` (100 % unit coverage), `lib/error-codes.ts`, `api/errors.ts`, `i18n/en.json` + `pl.json`); management agreement in `club_core` (`payment_deadline_days`, `auto_expire_unpaid`); internal bookings (`facilities_internal_bookings`), service `facilities.occupancyService`, online requests with email confirmation, a 48 h hold and approval, job `facilities:expire-requests`, DI block `facilities.publicPlaces`; pages `/backend/facilities/*` (including `/requests`), `/club/facility`, `/club/places`, `/p/[clubSlug]/places`, `/p/[clubSlug]/places/[placeSlug]`, `/p/[clubSlug]/requests/verify/[token]`; "Today at the facility" and "Requests awaiting approval" widgets. Rented-hours report (REQ-038) next to the owner report.
- **Steps:**
  1. Verifications V-7 (`planner` rule fields), V-9 (mutation guard on an app entity), V-10 (rate limits per IP and per email on the public request routes) and V-13 (confirm the `auth` write path for per-user features in `user_acls.features_json`; the read side is resolved from the facts); decision on opening hours in `planner` or in `place.opening_hours`.
  2. Zones, closures, rates; bulk setting of booking availability in the facility calendar (TEST-022 in part, TEST-041).
  3. Bookings with charges, status transitions, session guard (TEST-022, TEST-023, TEST-027).
  4. Occupancy service, staff internal bookings, and the facility calendar `/club/places` with "Book for group" invoking a one-off event (TEST-033).
  5. Public facility list and facility calendar (TEST-024, TEST-028).
  6. Online requests: form, email confirmation, 48 h hold, approval queue, approval with a charge, rejection, expiry, supersession (TEST-035, TEST-036).
  7. Log, incidents, bans (TEST-026).
  8. Owner report with club time (sessions + internal bookings) (TEST-025).
  9. Maintenance tasks in the facility calendar: windows in slot occupancy, conflict flagging, reminders by date and by hours of use, completion, place maintainers and the redacted calendar for them (TEST-031, TEST-049, TEST-050).
  10. Rented-hours report for places flagged `rented_by_club`, with CSV (REQ-038, TEST-053).
- **Independent slices / estimated commits:** (a) rules 2 commits; (b) occupancy and internal bookings 2 commits; (c) rentals 3 commits; (d) public calendar 2 commits; (e) online requests 3 commits; (f) log and incidents 2 commits; (g) report 1 commit; (h) maintenance 2 commits (D-017: Must).
- **Requirements closed:** REQ-013, REQ-014, REQ-015, REQ-016, REQ-022, REQ-023, REQ-024, REQ-025 (the facilities block — final closure), REQ-029, REQ-038 (Should)
- **Tests:** TEST-022 … TEST-028, TEST-031, TEST-033, TEST-035, TEST-036, TEST-039, TEST-041, TEST-049, TEST-050, TEST-053, TEST-047 (re-run)
- **Validation:** as above
- **Exit gate:** J-005, J-006, and J-007 pass in full with their variants; J-008 shows all blocks with the settings enabled; the report matches the test data; public schedule without personal data (TEST-024); pages checked in both modes and at 375 px; en + pl catalogs for `facilities` complete and `yarn i18n:check-hardcoded --strict` green.


## Requirement Traceability

The *Extension Surface Tracking* table in `2026-10-20-vereino-club-management.md` covers this specification's surfaces too.


| Requirement | Journey / surface | Data/API/event contracts | Phase | Tests | Acceptance criterion |
|---|---|---|---|---|---|
| REQ-013 | J-005, `/backend/facilities/calendar`, `/rentals`, `/club/facility` | `facilities_zone_rules`, `facilities_closures`, `facilities_rental_rates`, `facilities_rentals`, session guard, optional DI `payments.chargeService` (DD-19) | 5 | TEST-022, TEST-023, TEST-027, TEST-028 | AC-013 |
| REQ-014 | J-005, J-007, `/p/[clubSlug]/places/[placeSlug]` | `GET /api/facilities/public/…/places`, `…/schedule` | 5 | TEST-024, TEST-028 | AC-014 |
| REQ-015 | J-005, `/backend/facilities/reports/owner` | `GET /api/facilities/reports/owner` | 5 | TEST-025 | AC-015 |
| REQ-016 | J-005, `/backend/facilities/logs`, `/incidents`, `/bans` | `facilities_logs`, `facilities_incidents`, `facilities_entry_bans` | 5 | TEST-026 | AC-016 |
| REQ-022 | `/backend/facilities/maintenance` (+ Maintainers tab), `/club/places` (maintenance windows) | `facilities_maintenance_tasks`, `facilities_place_maintainers`, `/api/facilities/maintenance-tasks`, `/api/facilities/place-maintainers`, `facilities.maintenance.complete`, `facilities.occupancyService`, `facilities.maintainerScopeProvider`, `facilities:maintenance-reminders` | 5 | TEST-031, TEST-049, TEST-050 | AC-022 |
| REQ-023 | J-006, `/club/places` | `facilities_internal_bookings`, `POST /api/facilities/internal-bookings`, `facilities.occupancyService` | 5 | TEST-033, TEST-039, TEST-049 | AC-023 |
| REQ-024 | J-007, `/p/[clubSlug]/places/[placeSlug]`, `/backend/facilities/requests` | `facilities_rentals` (request statuses), `…/requests`, `…/verify/{token}`, `…/approve\|reject`, `facilities:expire-requests` | 5 | TEST-035, TEST-036, TEST-039, TEST-049 | AC-024 |
| REQ-029 | `/backend/facilities/calendar`, `/backend/facilities/zones` | `facilities_zone_rules` (`source`, priority 3, period), `POST /api/facilities/zone-rules/bulk`, `facilities.zone_rules.bulk_updated` | 5 | TEST-041 | AC-029 |
| REQ-038 | `/backend/facilities/reports/rented-hours` | `club_core_places.rented_by_club`, `GET /api/facilities/reports/rented-hours` | 5 | TEST-053 | AC-038 |

## Rollout, Migration, and Rollback

As in `2026-10-20-vereino-club-management.md` (*Rollout, Migration, and Rollback*). Disabling `facilities` removes its guard, so `activities` works as in phase 2; since D-028 it can be rolled back independently of `payments`, and enabling `payments` later does not create charges for past rentals.


## Risks and Tradeoffs


| Risk / tradeoff | Impact | Mitigation / detection | Residual risk |
|---|---|---|---|
| Scraping of the public schedule | exposure of usage patterns | no names; rate limit; short cache | low |
| Internal bookings without approval in "open to public" and "bookable" zones (Q-022) | the municipality may consider that the club is taking away public hours; coaches of different sections "grab" facilities just in case | every booking visible to staff with its purpose and booker; the owner report shows club time per zone; coordinator and administrator can cancel; management agreement reviewed before the pilot (Q-008) | medium |
| Spam and fake online requests | administrator queue clogged, slots blocked | email confirmation before the hold, hold only against other external requests and for at most 48 h, rate limits per IP and email, honeypot field, supersession by a club booking | low |
| Administrator does not decide within 48 h | requests expire, renters give up | in-app notification and a widget with time until expiry; expiry email to the requester | medium |

## Acceptance Criteria

- [ ] **AC-013** — A booking is possible only in the "bookable" zone without a conflict or ban; it calculates the amount and dates; creates a charge payable to the municipality; cancellation after the deadline results in forfeiture.
- [ ] **AC-014** — The public schedule works without signing in and contains no names of renters, groups, or people; an unknown slug returns 404.
- [ ] **AC-015** — The monthly owner report matches the data (hours in zones, bookings, payments, incidents, maintenance) and exports to CSV.
- [ ] **AC-016** — The attendant keeps a log and reports incidents within the scope of their place; an active ban blocks the renter's booking.
- [ ] **AC-022** — Planned maintenance work occupies the facility calendar: new sessions, bookings, rentals and requests in its window return 409 `maintenance_scheduled`, existing ones get the reschedule flag, and the public calendar shows the slot as unavailable without details. Tasks by date send reminders before the due date, and tasks by hours of use send a reminder when the threshold is reached. A person holding only the maintenance feature sees and plans only on their assigned places, without personal data.
- [ ] **AC-023** — A coach, instructor, coordinator, or administrator of any section books a free slot at any club facility in any zone without approval; an occupied slot, a closure, or hours outside opening hours return 409.
- [ ] **AC-024** — A request from a facility's public calendar becomes a valid booking only after administrator approval; until the decision it holds the slot against other requests for at most 48 h, then expires; a club booking supersedes it, with an email to the requester; approval creates a charge payable to the facility owner.
- [ ] **AC-029** — In one step, the administrator sets availability Mon–Fri 16:00–22:00 for several facilities, or different hours per day; the public calendar shows "bookable" only in the free portions of those hours; hours outside opening hours, shorter than 90 min, or in the wrong order are rejected with a message at the day.
- [ ] **AC-038** — The rented-hours report lists `done` session hours per rented place, month, group and coach, and exports to CSV.

## Final Compliance Report

| Check | Status | Evidence / resolution |
|---|---|---|
| Requirements traced to journeys, contracts, tests and acceptance criteria | pass | *Requirement Traceability* |
| Contracts of installed modules confirmed | fail | V-7, V-9 pending; V-13 resolved on the read side |
| Owner decisions | pass | DD-19 decided by D-028 |
| User approval for implementation | fail | none — status Draft |

Verdict: `Blocked — V-7, V-9, the pilot club and its facility rules (brief Q18, Q04; R05 is a proposal), and the Critical/High findings of the architectural review of 2026-10-26 that concern facilities (occupancy race, request-link emails)`


## Open Questions

Questions and verifications that belong to the facility module; all resolutions keep their original dates.


| ID | Question | Owner | Blocking? | Resolution / decision date |
|---|---|---|---|---|
| Q-008 | Orlik: actual opening hours and zone layout, N days for payment, amounts within the ranges (PLN 80–150 / 150–220 / 220–350), start of the winter season | the pilot club's accountable person / its municipality (open since D-025) | no (phase 5 data) | configuration in `facilities` and in the management agreement; the Orlik 2024 rules are the reference values |
| Q-009 | Who enters bookings, and does the attendant see the amounts? | Władek Kuć | no | default: attendant and administrator; amounts visible to the attendant |
| Q-010 | Rental payments: only a "paid to the municipality's account" register? Does part of the revenue go back to the club? | Władek Kuć / municipality | no | default: register based on a confirmation; revenue split outside 1.0 |
| Q-011 | Should a booking without payment after the deadline expire automatically? | Władek Kuć | no | default no — a "to be clarified" list; `auto_expire_unpaid` toggle in the agreement |
| Q-012 | Is the attendant log mandatory (the day cannot be "closed" without an entry)? Attendant — a club or municipality employee? | Władek Kuć | no | default not mandatory, warning on the widget |
| Q-013 | Entry bans: is a register enough, or is a procedure needed (who issues them, appeals)? | Władek Kuć | no | default: register with the issuer and period (`facilities_entry_bans`); appeals are handled outside the system in 1.0 |
| Q-014 | Liability (OC) insurance and inspections: does the system track the deadlines? | Władek Kuć | no | REQ-022 (Must since D-017) with reminders |
| Q-015 | Renter's acceptance of the regulations: is an "accepted by phone" record enough? | Władek Kuć | no | default `regulations_accepted_at` + `regulations_accepted_via` |
| Q-022 | Who books internally without approval, and where? | Władek Kuć | yes | **Staff of every section (coach/instructor, coordinator, administrator), any club facility, every zone**, as long as the slot is free (DD-25, DD-26) — 2026-10-20 |
| Q-023 | What happens to the slot before an external request is approved? | Władek Kuć | yes | **Provisional hold against other external requests for up to 48 h, then expiry; a club booking can supersede it** (DD-27) — 2026-10-20 |
| Q-025 | Should the attendant (or coordinator) also approve external requests? | Władek Kuć | no | default only the administrator (`facilities.rentals.approve`); the feature can be granted to another role without code changes |
| Q-026 | Can one section's internal booking be "overridden" by another section's coordinator (conflict between two coaches)? | Władek Kuć | no | default no — the first booking takes precedence; the administrator resolves the dispute by cancelling one of them |
| Q-040 | Does planned maintenance work block the facility calendar or only warn? | Władek Kuć | yes | **Blocks, like a closure**: new entries in the window → 409 `maintenance_scheduled`, existing ones get `needs_reschedule` (D-017, DD-36) — 2026-10-23 |
| Q-041 | Who plans maintenance work? | Władek Kuć | yes | **A separate feature `facilities.maintenance.manage`**: by default the administrator only; it is granted per person, with place assignments, to anyone who plans maintenance, section coordinators included (DD-36, D-024) — 2026-10-23 |
| Q-042 | Does 1.0 count hours of use and remind about usage-based maintenance (brushing every 10–15 h)? | Władek Kuć | yes | **Yes, in 1.0**: `usage_hours` tasks with a threshold, counted from occupancy since the last completion (DD-36) — 2026-10-23 |
| Q-043 | What does a person holding only `facilities.maintenance.manage` see and do? | Władek Kuć | yes | **The calendar of their assigned places without renters' or other personal data; plans, moves, cancels and completes maintenance only on those places**; places are assigned per person in `facilities_place_maintainers`; the administrator is club-wide, everyone else is limited to assigned places; still no new role (Q-041, D-024) — 2026-10-23 |

| ID | What to check | Phase | Plan if the result is negative |
|---|---|---|---|
| V-7 | `planner_availability_rule` fields (subject, RRULE, kind) — are they suitable for a place's opening hours | 5 | opening hours in `place.opening_hours` (already designed) |
| V-9 | A mutation guard registered by one app module on entities of another app module | 5 | conflict check through an optional DI service called by `activities` when `facilities` is enabled |
| V-13 | Granting a single feature (`facilities.maintenance.manage`) to one user without a new business role. **Resolved from the facts on 2026-10-23:** `auth:user_acl` (`user_acls.features_json: string[]`, read by `services/rbacService.ts` and `lib/grantChecks.ts`) holds per-user features next to role features. Left to confirm in phase 5 step 1: the write path (the `auth` command or service the `/place-maintainers` route calls) | 5 | a seeded technical role carrying only that feature, assigned to the person; the business roles stay unchanged |

## Changelog

| Date | Change |
|---|---|
| 2026-10-27 | Created from `2026-10-20-vereino-club-management.md` by D-028: phase 5 with its requirements, decisions, vocabulary, journeys, UI and mock-ups, data model, API, events, tests, traceability, risks, acceptance criteria and questions moved; DD-19 rewritten — `facilities` no longer requires `payments`, the rental charge goes through the optional `payments.chargeService`; phase 5 depends on phases 2–3, not on phase 4; J-005, the rental entity, the create and approve routes and the REQ-013 traceability row follow. Earlier history: the club specification's Changelog |
