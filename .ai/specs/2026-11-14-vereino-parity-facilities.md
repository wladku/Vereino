# Vereino — facilities parity: the day calendar, rentals, the attendant on the phone and the open promises of phase 5

**Date**: 2026-11-14
**Status**: Ready for implementation — approved by the product owner on 2026-11-16 ([owner decisions on #253](https://github.com/wladku/Vereino/issues/253#issuecomment-6910005145), answering the [pre-implementation audit](https://github.com/wladku/Vereino/issues/253#issuecomment-6899389065)): the six Ask First items approved, Q-R01, Q-R21 and Q-R22 answered, Q-R02…Q-R20 confirmed, two new answers recorded (a move keeps the agreed amount, #221; the dashboard widget follows the navigation spec's role table), the audit gaps (c1)–(c10) fixed in this text. Cross-spec dependencies: *Rollout → Order*. Phase 11 (#285) waits for phase 1 of the payments parity spec; phase 14 (#288) lands after or rebases on REQ-A08 of the groups and activities parity spec

> Use `om-spec-writing` for every new application, multi-module feature, or other non-trivial business slice. Keep every section below; write `N/A — {reason}` when a section does not apply. Change the status to `Ready for implementation` only after every blocking open question is resolved and the traceability table covers every requirement.

Sources: the parity audit of 2026-11-14 (`main` at `a312199`) against the clickable mockup, and the owner's decisions of the same day in D-031 (`.ai/specs/research/decisions/D-031-mockup-is-the-model-and-eight-parity-decisions.md`: §1 six facility menu items with tabbed pages, §2 names, §4 the day axis), with D-029 (phone-first) and D-030. Design authority: `docs/ux-concept/README.md` (B-06, B-23…B-28, M-11, M-12, P-03…P-05, F-10) and the mockup `docs/ux-concept/mockups/app.ts` (`timeline`, `occupancy`, `dateChips`, `screenPlaces`, `screenPlace`, `availabilityCard`, `slotModal`, `screenFacilityToday`, `screenRentals`, `screenRequests`, `screenZones`, `screenLogs`, `screenOwnerReport`, `screenPublicPlaces`, `screenPublicPlace`, `screenVerify`). Every gap below was checked against the code of the worktree before it was written down.

This spec is an addendum to `.ai/specs/2026-10-27-vereino-facilities.md` (phase 5). It completes that spec's requirements REQ-013…REQ-016, REQ-022…REQ-024 and REQ-029 and does not change its status or its phase table. Ids carry the letter **R** (`REQ-R01`, `DD-R01`, `J-R01`, `TEST-R01`, `AC-R01`, `Q-R01`) so they never collide with the global ids (D-028). It is one of five parity specs of 2026-11-14; the others are named by their file: navigation and naming (letter N), groups and activities (A), payments (C), people life cycle and data entry (L).

**Rows of the facilities spec this spec supersedes** (the base spec's body is not edited; `.ai/specs/changelog/2026-10-27-vereino-facilities/2026-11-14-parity-r.md` records it):

| Base spec section and row | Superseded by |
|---|---|
| *UI and Interaction Contracts*, row `/backend/facilities/calendar` ("schedule family", the week wireframe "`[< week >]` Mon Tue Wed Thu") and the responsive row "Facility calendar — day view on phone, week on desktop" | REQ-R01…REQ-R03: one day axis at every screen width (D-031 §4) |
| *UI*, row "`/backend/facilities/rentals` (+ `create`, `[id]`)" | REQ-R04, REQ-R05: no `create` page (the dialog of #122 stays); `[id]` is specified here |
| *UI*, rows "`/backend/facilities/zones`, `/closures`, `/rates`" and "`/backend/facilities/logs`, `/incidents`, `/bans`, `/maintenance`" as separate pages | D-031 §1: tabs of two pages. The navigation spec owns the shells; REQ-R09 and REQ-R10 own the tab contents |
| *UI*, row `/backend/facilities/requests` ("`DataTable`, decision dialog") | REQ-R08: a card per request |
| *UI*, row `/club/facility`, and J-005 step 2 ("The facility attendant creates the booking", in the panel calendar by README F-10 "Rental by phone: B-23") | REQ-R13, REQ-R14: the attendant enters and manages rentals on the phone (D-029) |
| *Phase 5*, step 3: "`payment_deadline` = start − 3 days … (default until the management agreement exists, Q04)", "without a payee institution until `club_core` exposes the place owner", "the unpaid "to clarify" list waits for the agreement" | REQ-R06, REQ-R07 |
| *Phase 5*, step 4: "a group event is not checked against the opening hours (`activities` does not read them) — a follow-up" | REQ-R19 |
| *Phase 5*, step 7: "Open: the attendant's rental dialog cannot search registered renters …, and `/club` has no link to `/club/facility`" | REQ-R14 (the link and the landing page are the navigation spec's) |
| *Phase 5*, step 9: "neither sends the reschedule notifications yet — a follow-up for both" | REQ-R18 |
| *Events*, the rows `payments.payment.recorded`, `facilities.rental.moved\|cancelled` (e-mail to the renter), the "to clarify" part of `facilities:rental-lifecycle`, and the notification part of `facilities.closure.created` and `facilities.maintenance.scheduled`: specified there, absent from the code | restated as phases 10–13 here (REQ-R06, REQ-R07, REQ-R17, REQ-R18) |

Names in the user interface follow the mockup (D-031 §2). The rename table — "Miejsca", "Zgłoszenia", "Incydenty", "Cennik wynajmu" and the rest — is the navigation spec's **"Glossary (D-031 §2)"** (`2026-11-14-vereino-parity-navigation-and-naming.md`). This spec cites it and uses its English terms: *place*, *request* (an online booking request), *incident*, *rental price list*.

## TLDR

Phase 5 built the facility rules, rentals, requests, the log and the reports, but the screens stop short of the mockup, and several promises of the facilities spec were never built. This spec closes both:

- **The facility calendar (B-23, M-11)** becomes the mockup's day axis: one day, hour rows, zone bands, every entry kind (sessions, club bookings, rentals, requests, closures, maintenance), seven day chips, and a tap on a free hour that opens one slot dialog — rental, for a group, or general purpose. The data already exists: `GET /api/facilities/calendar` returns all of it and only `/club/places` reads it.
- **Rentals (B-24, B-25)** get a detail page, editing, request cards with every fact the administrator decides on, the payee ("to the municipality's account"), and the management agreement's payment days instead of the constant 3.
- **The facility attendant works end to end on the phone** (D-029): place and renter pickers that need no feature outside the role, a rental taken by phone entered on the phone, the renter's phone number on "Today at the facility", and a ban request that the administrator receives.
- **Promises of the facilities spec that have no code** are scheduled: the rental charge is consumed once the payments spec registers `payments.chargeService`; the renter gets e-mails and can cancel through a link; staff are told when a closure or maintenance flags their entry; a group event is checked against the opening hours.

Reused: the calendar service and the timeline component of `/club/places`, the rental and booking dialogs, the occupancy service, the foundation `dispatch` and token-link service, the encrypted `terms` of `club_core_contracts`, and the optional DI seam `payments.chargeService` (DD-19).

## Problem Statement

The owner compared the running application with the mockup and found it short "in every area, especially facilities, groups and activities" (D-031, *Why*). The audit confirmed each point in the code (`a312199`; paths under `packages/app/src/modules/`):

- **The panel calendar shows a fraction of the day.** `facilities/components/FacilityCalendar.tsx` renders the weekly availability table and `WeekZonePreview.tsx`, a per-day text list of zone segments with the active rentals. Its header says "Sessions and requests arrive with their stories"; no story brought them. It never calls `GET /api/facilities/calendar`, which already returns sessions, rentals, requests, bookings, closures and maintenance (`facilities/services/calendar.ts`). Rentals are shown only with `facilities.rentals.manage`. The week is local state with no address. The place selector lists complexes and external places (`facilities-client.ts`, `loadPlaceOptions`).
- **Three designs exist for one screen.** The facilities spec draws a week grid, the mockup a day axis, the code a text list. D-031 §4 chose the day axis.
- **The member calendar is a list of segments, booked in two steps.** `club-places/PlaceTimeline.tsx` stacks segment cards; a free segment only fills a range box, and "Book" then opens the dialog (`ClubPlacePage.tsx`). The mockup and the facilities spec both say "a slot opens the booking dialog". The list page shows every active place, parents and external ones included, and counts today's entries by the exact place (`ClubPlacesPage.tsx:37`).
- **A rental cannot be opened or corrected.** There is no rental page and no update command (`facilities/commands/rentals.ts`: create, confirm, cancel, no-show, move). The staff dialog never sends the purpose. The contact, the notes and the renter cannot be changed after saving. A pending row on B-24 has no link to the request queue.
- **A rental creates no charge.** `facilities/services/charges.ts` resolves the optional token `payments.chargeService`; `payments` does not register it (the token does not occur in `payments/`). J-005, AC-013 and AC-024 of the facilities spec promise a charge payable to the municipality. The staff entry also passes `payeeInstitutionId: null`, although `clubCoreDirectory.placePayee` exists since #125.
- **The payment deadline is a constant.** `facilities/lib/rentals.ts` has `DEFAULT_PAYMENT_DEADLINE_DAYS = 3`. A `facility_management` contract stores a period only (`club_core/components/ContractForm.tsx` shows rate fields for `coach` alone), and the unpaid "to clarify" list does not exist.
- **The attendant cannot do the job on any device.** The role `vereino_facility_operator` (`packages/core/src/roles.ts`) holds four `facilities.*` features. The place pickers read `/api/club_core/options/places` (`club_core.view` plus a coordinator or administrator grant), and `tolerantPlaceOptions` hides the 403, so the pickers are empty. The renter search reads `/api/club_core/institutions` and `/api/people/persons`. The rental dialog exists only in the panel, while D-029 makes the phone this role's working path (D-029 §2: a panel layout may exist alongside it, and the navigation spec gives the attendant the panel's Facility group and the widget "Today at the facility"; but the attendant's daily work runs on the phone, where no rental can be entered). "Today at the facility" shows neither the sub-place, nor the coach, nor the renter's phone (`facilities/services/today.ts`).
- **Logs, incidents and club bookings can be created only from two member pages**, for today or the future; the panel tables only edit (`LogsTable.tsx`, `IncidentsTable.tsx`).
- **Renters and staff are not told.** `facilities/emails/templates.ts` holds the request e-mails and the maintenance reminder only. A renter entered by staff gets no summary, and nothing is sent on a move, a cancellation or a reschedule flag (`facilities/services/reschedule.ts` sets flags and emits events). An attendant's ban request (`entry_ban_requested` in `facilities/lib/incidents.ts`) reaches nobody.
- **A group event is not checked against the opening hours** (facilities spec, phase 5 step 4), although J-006 step 3 says it is.

Who has it: the facility attendant, the club administrator, coaches and coordinators who book places, the person who maintains a place, and the external renter.

## Overview and Success Measures

- **Primary outcome:** the three facility journeys of the README run without leaving their device: F-10 (the attendant's day and a rental by phone) entirely on a phone; J-005 (rental to payment) with a charge and the renter's e-mails; J-006 (a coach books a tournament) in one tap from a free hour.
- **Leading indicators:** share of rentals entered from `/club/places` by an attendant; rentals with a charge among those entered while `payments` is enabled (target: all); requests decided from the card without opening another page; reschedule notices sent per closure.
- **Baseline:** an attendant can enter no rental for a registered renter; 0 rentals have a charge; 0 renter e-mails for staff-entered rentals; the panel calendar shows 2 of 6 entry kinds (verified against `a312199`).
- **Market / product reference:**
  - **Adopted:** the day axis with lanes for parallel entries, as in the staff calendars of court-booking products such as Playtomic Manager and Skedda (one resource, one day, tap an empty hour), which the mockup follows; the request card with the decision facts beside the buttons.
  - **Rejected:** a week or month grid for staff (D-031 §4); dragging to select a range (not in the mockup, poor on a phone); online payment by the renter (a non-goal of the facilities spec).

## Goals

- **REQ-R01** — Staff with `facilities.view` see one day of one place on an hour axis (08:00–22:00, widened to the day's opening hours and entries): zone bands, sessions, club bookings, rentals, requests, closures and maintenance, each with its name; a legend; the place's capacity; "closed on this day"; the list "Day entries"; and a "to be moved" filter. Seven day chips and the place are in the address (B-23; D-031 §4; completes REQ-013).
- **REQ-R02** — A tap on a free open hour opens one slot dialog with the kinds the user may use — external rental, for a group (an event), general purpose — prefilled with the hour and 90 minutes, and showing the zone. A refused save lists the colliding entries by name, and a saved club booking says how many requests it superseded. The same dialog serves B-23 and M-11 (completes REQ-013, REQ-023, REQ-027).
- **REQ-R03** — The calendar's availability card is collapsible, says whether the place accepts online requests, and lists every bookable window, those from the regulations included. The calendar, the zones page and the place form link to each other (B-23, B-26, B-06; completes REQ-029).
- **REQ-R04** — The rentals list has its tab in the address, the renter's contact, the source, visible actions, a "Decision" link on a pending row, and the perspectives "to be moved" and "unpaid after the deadline"; a row opens the rental (B-24).
- **REQ-R05** — A rental has a page with everything saved on it, and its contact, purpose, notes and renter record can be corrected; the staff entry records the purpose (B-24).
- **REQ-R06** — When `payments` provides the charge service, a rental's charge names the place owner as payee and the renter as payer, the rental is confirmed when its charge is paid, a cancellation cancels or forfeits the charge, and the owner report counts the payments from the charges. Without the service everything works from the rental register as today, and the screens say which of the two applies (B-24, B-25, B-28; completes REQ-013, REQ-015, REQ-024; the consumer side of REQ-C01 of the payments parity spec).
- **REQ-R07** — The payment deadline and the automatic expiry of unpaid rentals come from the management agreement with the place's owner, entered on the contract form; unpaid rentals past the deadline are listed (completes REQ-013).
- **REQ-R08** — Each request awaiting a decision is a card with the requester, the contact, the purpose, the indicative amount and its payee, the collisions by name, the ban check, "rules accepted online", "e-mail confirmed", the time left, and the Approve and Reject buttons (B-25; completes REQ-024).
- **REQ-R09** — The tabs Zones, Closures and Rental price list show the mockup's columns and actions, with "Set booking availability" on the zones tab (B-26).
- **REQ-R10** — The tabs Log, Incidents, Entry bans and Maintenance show the mockup's columns. An administrator adds a log entry, an incident and a club booking from the panel, also for a past day, and issues a requested ban from its incident (B-27, B-23; completes REQ-016).
- **REQ-R11** — The owner report names the owner institution and the source of its payment figure (B-28; completes REQ-015).
- **REQ-R12** — On the phone, staff see the club's own bookable places with kind, surface and today's entries, open a place on the day axis and book with one tap; a tap on an entry shows its details (M-11; completes REQ-023).
- **REQ-R13** — "Today at the facility" shows, for each session, the sub-place, the group and the coach, and for each rental the place and the renter's contact with a phone link. Headcount fields appear once the facility is opened, and a photo that failed to upload can be added again (M-12; completes REQ-016).
- **REQ-R14** — The facility attendant, with the role's present features and only a phone, picks a place, finds a renter, enters a rental taken by phone, sees and manages the rentals of their places, and asks for an entry ban that the administrator receives (D-029; completes REQ-013, REQ-016).
- **REQ-R15** — A person who maintains a place sees the tasks of their places on the phone, plans a window from the day axis and completes a task there; reminders link to that page (D-029; completes REQ-022).
- **REQ-R16** — The public places list, the public calendar and the request confirmation show what the mockup shows, inside the club's own header and footer: the intro, the booking mode, today first on a phone, the approval notice with the owner, the request summary and the way back to the calendar (P-03, P-04, P-05; completes REQ-014, REQ-024).
- **REQ-R17** — A renter with an e-mail address gets a summary when staff enter the rental and a message when it is moved, cancelled or must be moved, and can cancel the rental through a link: free before the deadline, with the stated forfeit after it (completes REQ-013).
- **REQ-R18** — When a closure or a maintenance window flags an entry "to be moved", the people who must act are told — the section's coordinators and the coach for a session, the booker for a club booking, the administrators for a rental — and each entry is findable in a list (completes REQ-013, REQ-022).
- **REQ-R19** — A one-off group event on a club place is refused outside the place's opening hours (completes REQ-023 and J-006 step 3).
- **REQ-R20** — The panel dashboard has the widget "Today at the facility" with today's entries, scoped by the navigation spec's widget table (widget 8, `facilities.view`): the administrator sees the club's places, the coordinator the club's places, the attendant the assigned places (B-01; owner decision 2026-11-16).

## Non-goals

- The panel sidebar, the six facility menu items, the tab shells and routing of B-26 and B-27, menu count badges, the member "More" list, the attendant's landing page, the public header (Club · Sections · Facilities · Events · Sign in) and the Polish and English names: the navigation spec. This spec supplies the tab contents and the count source (`GET /api/facilities/rentals/requests`, field `total`).
- Registering `payments.chargeService`, the charge's payer and payee columns, the rentals perspective of B-21 and the charge page: the payments spec. This spec states what `facilities` passes, shows and expects.
- Notices to guardians and participants about a moved or flagged session, the consumer of `activities.occurrence.updated`, and the coordinator's "needs reschedule" page: the groups and activities spec. This spec tells staff only.
- The "add institution" link beside the place owner picker and the other empty-picker hints: the people life cycle and data entry spec.
- Decisions already taken and left as they are: the public schedule as a calendar month (#124 Q1), the request form's categories (#125), the maintenance page's content (#128), the rented-hours report (#129), the closure form as a page (#121), "New rental" as a dialog on the list (#122), the attendant's no-show (#126 Q1).
- Editing a rental's amount, category or units after it is saved (a move keeps the agreed amount, as `facilities/commands/rentals.ts` does today, so a charge never diverges from its rental — DD-19 has no update method; owner decision 2026-11-16, closing #221; a wrong entry is cancelled and entered again), dragging on the axis, a week view, online payment by renters, accounts for regular renters, an appeal procedure for bans (Q-013).

## Proposed Solution

**One day axis.** `PlaceTimeline.tsx` grows into a shared component, `facilities/components/day-axis/DayAxis.tsx`, that draws the mockup's `timeline`: hour rows, zone bands behind them, entries positioned by their minutes and laid out in lanes when they overlap, and each open free hour as a button. The layout is pure logic in `facilities/lib/day-axis.ts` (axis bounds, lanes, which hours are open and free), with unit tests. B-23 (`FacilityCalendar.tsx`) and M-11 (`ClubPlacePage.tsx`) both render it from `GET /api/facilities/calendar?placeId&from&to`, with the place and the day in the address. `WeekZonePreview.tsx` leaves the calendar and stays on the zones tab, where it previews rules.

**One slot dialog.** `SlotDialog` joins the bodies of the two dialogs that exist — `club-places/BookDialog.tsx` (for a group, general purpose) and `RentalDialog.tsx` (rental, with `RentalQuotePanel.tsx`) — behind the mockup's "Kind" selector (`slotModal`). The kinds come from the user's features, not from the shell, so an attendant on the phone gets the rental kind (D-029).

**Option sources inside the module.** Two new read routes replace the `club_core` and `people` reads in every facilities picker: `GET /api/facilities/options/places` and `GET /api/facilities/renters`. They answer within the caller's facilities scope, so the attendant's role needs no new feature (DD-R06).

**The rental as a record.** A panel page and a member page show one rental. One new command, `facilities.rentals.update`, corrects the fields that carry neither money nor a slot.

**Money through the existing seam.** `facilities` already calls `payments.chargeService` when it is registered, and the payments parity spec registers it (REQ-C01). This spec passes the payee, the payer's name and the description, adds the subscriber that confirms a paid rental, defines "Confirm payment" for a rental with and without a charge, and reads the payment deadline from the management agreement, stored in the contract's existing encrypted `terms`.

**Messages through the foundation.** The renter's e-mails, the reschedule notices and the ban request go through the foundation `dispatch` with keys in the DD-46 form, like the request e-mails. The renter's cancellation link is a P-10 token link (`foundation/services/token-link.ts`) in a new link table, the only migration of this spec.

### Design Decisions and Alternatives

| Decision | Rationale | Alternative considered | Why rejected / deferred |
|---|---|---|---|
| **DD-R01** One `DayAxis` component for B-23, M-11 and the maintainer's redacted view, at every width | D-031 §4; the mockup draws the same axis on the phone and in the panel; one component cannot drift | Keep the segment list on phones and draw the axis on wide screens | Two renderings of one day; the list hides the length of an entry and parallel groups |
| **DD-R02** The axis runs 08:00–22:00 and widens by whole hours to cover the day's opening windows and entries | The mockup's range fits the Orlik; a pool that opens at 06:00 or a tournament that ends at 23:00 must not be cut off | A fixed 08:00–22:00 clip (today's `daySegments`) | Entries outside the range would be invisible although they occupy the place |
| **DD-R03** The seven day chips start today; a date field "Other day" beside them reaches any date; the place and the day are `?place=&date=` in the panel and `/club/places/[placeId]?date=` on the phone | The mockup's `dateChips`; a rental moved three weeks ahead and a past day's log need more than a week | Chips only | No way to look at a later or a past day |
| **DD-R04** The kinds of the slot dialog depend on features: rental with `facilities.rentals.manage`, for a group with `activities.events.create` and at least one own group, general purpose with `facilities.bookings.create`. The first available kind in that order is preselected | D-029: the attendant enters a rental on the phone; the mockup's `backend &&` condition predates D-029 | Rental only in the panel, as the mockup's code has it | The attendant's working path is the phone (D-029 §2); the panel layout the navigation spec gives the role exists alongside it, not instead of it, so the phone must not depend on it |
| **DD-R05** `SlotDialog` composes the existing rental and booking bodies; the "New rental" dialog of B-24 (#122) is the same component opened with the rental kind and no preset slot | Reuse; one validation and one conflict list | A third dialog | Three forms for the same writes |
| **DD-R06** Facilities-owned option sources (`/api/facilities/options/places`, `/api/facilities/renters`); the role `vereino_facility_operator` keeps its four features | Least privilege; the routes answer inside the `facility_operator` grant | Add `club_core.view` and `people.view` to the role | Opens every institution record and the people register to the attendant |
| **DD-R07** A caller without `people.view` finds as renters the club's institutions by name and the renters of earlier rentals on the places of their grant. A person who never rented is entered as an unregistered renter by name | The attendant recognises regular renters; no read of the people register | Person search for the attendant | Exposes the names of members and children to a role that does not need them |
| **DD-R08** A rental is corrected by one command limited to the contact, the purpose, the notes and assigning a registered renter to an unregistered one; the slot changes by `move`, money never | Forward-only statuses and a charge that must match (DD-19, DD-46) | A general edit form | An edited amount or slot would diverge from the charge and skip the occupancy check |
| **DD-R09** A rental with a charge is confirmed only by its payment: "Potwierdź wpłatę" opens the charge record of the payments module (B-22, `/backend/payments/charges/{chargeId}`), the administrator records the transfer there, and `payments.payment.recorded` → `facilities.rentals.confirm_paid` confirms the rental. A rental without a charge is confirmed by the same button at once, as today | The payments parity spec keeps every payment entry on its own screens (J-C03) and adds no write method to the DD-19 contract; one place records money, so the register and the charge cannot disagree | The mockup's one click on B-24 (`rental-confirm` writes the payment itself), through a new contract method `recordPaymentForSource` | A second way to enter a payment, outside the payments dialog, its validation and its audit; revisit if the extra click proves costly (Q-R01) |
| **DD-R10** The management agreement's rental terms are `paymentDeadlineDays` and `autoExpireUnpaid` in the encrypted `terms` JSON of a `facility_management` contract. The agreement of a place is the contract in force, on the day the rental is entered, with the place's payee institution (`placePayee`) | The column exists; active contracts of one kind for one party never overlap (`club_core/data/entities.ts`); no migration | Columns on the place or in the club settings | The terms belong to the agreement with one owner, and a club may administer places of two owners |
| **DD-R11** An unpaid rental that expires moves `requested → cancelled_free` with `decision_reason = 'unpaid_after_deadline'`; its charge, if any, is cancelled. Only a rental with no charge or an `open` one expires; a `partially_paid` one stays on the unpaid list, because `cancelForSource` leaves a partly paid charge as it is (`charge_paid`) and the rental must not become free while money is held | The transition exists (`rentalTransitions`); the slot is released and nothing is forfeited | A new status `expired_unpaid` | A new value in a public enum for a case that one reason field describes |
| **DD-R12** A ban request is the existing incident action `entry_ban_requested`, plus a notice to the administrators and an "Issue ban" action on that incident | No new table or status; the administrator still issues every ban (facilities spec, phase 5 step 7) | A `requested` state on `facilities_entry_bans` | A migration and a second lifecycle for a note the incident already carries |
| **DD-R13** The renter cancels through a P-10 link held in a new table, `facilities_rental_links`; the raw token is only in the e-mail and in the request body (DD-44) | The foundation service needs a link entity per module; the rental's own token columns belong to the request confirmation | Reuse `verification_token_hash` on the rental | Overwrites the evidence "e-mail confirmed at" that B-25 and the audit read |
| **DD-R14** `facilities` sends the reschedule notice to staff, because it knows the cause (the closure or the work). It reads whom to tell through `activities.placeSessions` (additive fields) and `people.personDirectory` | The flag is set by `facilities`; guardians are told by the groups and activities spec when the session is actually moved | `activities` notifies on `activities.occurrence.updated` | That event carries no cause and fires for every edit |
| **DD-R15** The opening-hours rule for a one-off event is checked by the `activities` event command through `clubCorePlaces.openingHours` | Opening hours are `club_core` data (DD-41), and `activities` already requires `club_core` | A blocking interval "closed hours" from `vereino.occupancyProvider` | The provider feeds every session save, so generated series outside the hours would start to fail |
| **DD-R16** B-25 is a list of cards, not a `DataTable` | The mockup's `screenRequests`; a decision needs eight facts and two buttons in view, and the queue is short (48-hour hold) | Keep the table with a details drawer | Hides the facts the decision rests on behind a click |
| **DD-R17** A club booking in the past may be recorded by the club administrator only, at most 92 days back; logs and incidents already accept a past moment | The owner report counts club time from bookings ("without manual corrections"); a quarter is the longest report period in use | Past bookings for every booker | Staff could rewrite the record of who used the place |
| **DD-R18** The calendar and "today" return the renter's contact name and phone only to a caller with `facilities.rentals.manage` on that place; other staff see the renter's name | A coach needs to know who has the pitch, not the phone number | The contact for everyone with `facilities.view` | Personal data without a purpose |

## Domain Vocabulary and Business Rules

Terms of the facilities spec (zone, opening hours, closure, slot occupancy, internal booking, external request, rental statuses) keep their meaning. This table adds or sharpens:

| Term / invariant | Precise meaning or rule | Source of truth | Failure behavior |
|---|---|---|---|
| Day axis | One club-zone day of one place. Hours from 08:00 to 22:00, widened by whole hours to the earliest opening or entry start and the latest closing or entry end (DD-R02). It shows the zones of the place and the entries on the place, its ancestors and its descendants | `GET /api/facilities/calendar` with `placeId` | Unknown place 404; a place outside the caller's scope 403 `scope_denied` |
| Entry kinds on the axis | `session` ("zajęcia"), `booking` ("rezerwacja klubu"), `rental` ("wynajem"), `request` ("zgłoszenie", only while its hold is valid), `closure`, `maintenance`. Labels as the mockup's `occupancy`: activity and group; purpose — booker; "Wynajem: {renter}"; "Zgłoszenie: {renter} (czeka na akceptację)"; "Zamknięte: {note}"; kind of work — planner. A session held at a typed-in venue (no club place; groups and activities spec, D-031 §6) is on no facility calendar | `facilities/services/calendar.ts` | A maintainer without `facilities.view` gets no labels (redaction unchanged) |
| Lane | Entries that overlap in time are drawn side by side; an entry takes the first lane whose last entry has ended (the mockup's `timeline`) | `facilities/lib/day-axis.ts` | — |
| Free open hour | A whole hour inside the day's opening windows (or any hour when the place has no opening hours) and not before now on today's date. It is a button even when entries overlap it, because capacity may allow a second group; the server decides | `facilities/lib/day-axis.ts`; the commands | A taken slot answers 409 with the list |
| Bookable place (lists and chips) | An active place that is a leaf, is not external (`is_external = false`) and lies in the caller's facilities scope | `GET /api/facilities/options/places` | An empty list shows the empty state, never a silent blank picker |
| Today's entries of a place | The entries today on the place family (the place, its ancestors, its descendants), counted once each | the calendar read without `placeId` | — |
| Slot dialog kinds | `rental`, `group`, `general`, offered by DD-R04. Start = the tapped hour; end = start + 90 min, clipped to the closing time; both editable to the minute for `group` and `general`; a rental's end is start + units × 90 min | `SlotDialog` | No kind available → the hour is not a button |
| Renter option | A registered institution, a registered person, or "not in the register" with a typed name (`unregistered`). What a caller may find is set by DD-R07 | `GET /api/facilities/renters` | An active ban on the renter → 409 `entry_ban_active` on save, shown at the field |
| Rental correction | `contactName`, `contactPhone`, `contactEmail`, `purpose`, `notes`; and `renterType` + `renterId` only when the rental is `unregistered` (the display name then becomes the record's name and the ban check runs). Allowed while the status is `requested` or `confirmed`; notes also later | `facilities.rentals.update` | 409 `rental_closed` in another status; 409 `entry_ban_active`; 409 on a stale version |
| Payee of a rental | The nearest owner institution up the place tree (`clubCoreDirectory.placePayee`), or the club itself when no place on the chain has an owner | `club_core` | No owner → the facilities screens say "to the club's account". The charge still follows the payments parity spec's *Rental charge* rule: `payee = owner_institution` with `payee_institution_id = null` (`facilities` passes `payeeInstitutionId: null`). B-22's label for that case is the payments spec's to choose; that spec currently writes "the facility owner", and aligning it to "to the club's account" is a note for spec C, not a change made here |
| Charge state of a rental | `none` (no `charge_id`: `payments` off, or the rental was entered before it was enabled), or the charge's status from `payments.chargeService.statusOf`: `open`, `partially_paid`, `paid`, `cancelled`, `forfeited` | `payments` | Service absent → `none` for every rental |
| Charge of a rental (what `facilities` passes) | `payeeInstitutionId` = the payee of the rental; the payer = the renter's institution or person id, or `payerDisplayName` = the typed-in name of an unregistered renter; `description` = the mockup's `charge.rentalDesc` ("Wynajem: {place}, {date} {start}–{end}") in the club's default locale; `dueDate` = the payment deadline's club-zone date | `facilities` commands → `createForSource` | A throw from the service rolls the rental back (DD-19) |
| Confirm payment | With a charge: the payment is recorded on the charge in `payments`, and the rental moves `requested → confirmed` when the charge is `paid` (DD-R09); a direct confirm of a rental whose charge is not `paid` is refused. Without a charge: the action sets `requested → confirmed` and stores nothing else (the rental register is the record, Q-010) | DD-R09 | 409 `rental_awaits_payment`; 409 `invalid_transition` |
| Management agreement terms | `paymentDeadlineDays`: whole number 0–60. `autoExpireUnpaid`: boolean. Both optional on a `facility_management` contract; absent → 3 days and no expiry (today's behaviour) | `club_core_contracts.terms` (DD-R10) | 422 `contract_terms_invalid` on the contract form |
| Payment deadline | `starts_at − paymentDeadlineDays` days, never before the moment of entry; fixed when the rental is entered, not recomputed when the agreement changes. A move recomputes it only for a rental without a charge; a rental with a charge keeps its `payment_deadline`, because the charge's `dueDate` was set from it and DD-19 has no update method, so the two dates never diverge and the unpaid list reads `payment_deadline` | `facilities/lib/rentals.ts` (`paymentDeadline`); the `move` command | — |
| Unpaid after the deadline | A `requested` rental whose `payment_deadline` has passed and whose charge state is `none`, `open` or `partially_paid` | the lifecycle command; the B-24 perspective | — |
| Automatic expiry | When the agreement in force at entry has `autoExpireUnpaid` and the payment deadline lies before the cancellation deadline, an unpaid rental whose charge state is `none` or `open` moves to `cancelled_free` with the reason `unpaid_after_deadline` (DD-R11) at the first lifecycle run after the deadline; the renter is told. A `partially_paid` rental never expires automatically and stays on the unpaid list for the administrator; so does every rental when the agreement has no expiry | `facilities:rental-lifecycle` | `advanceWhere` (DD-46): a repeated run changes nothing |
| Payment reversed | A `payments.payment.reversed` on the charge of a `confirmed` rental changes nothing in `facilities`: the rental stays `confirmed` (a forward-only status, DD-46), and because the charge state is read live through `statusOf`, the list and both rental pages show it `open` (or `partially_paid`) again. The administrator follows up in `payments`; there is no automatic action | `payments`; `facilities` reads only | — |
| Ban request | An incident whose actions include `entry_ban_requested`, with the renter named in "people involved". It is *open* until a ban linked to the incident (`incident_id`) exists or an administrator removes the action | `facilities_incidents`, `facilities_entry_bans` | — |
| To be moved | `needs_reschedule = true` on a session, a club booking or a rental, set by a closure or a maintenance window, cleared by a move or a cancellation | unchanged | — |
| Reschedule notice | One message per person and cause (the closure or the work), listing that person's flagged entries | DD-R14 | A person without an account gets the e-mail only; without an address, nothing (logged) |
| Past club booking | A club booking whose start is before now, entered by a caller with the club-wide grant, not older than 92 days; it supersedes nothing and sends nothing; the occupancy check still runs | `facilities.internal_bookings.create` | Other callers: 422 `booking_start_past` as today; older: 422 `booking_too_old` |
| Renter cancellation link | One link per rental, valid until the rental starts, usable until the rental leaves `requested`/`confirmed`. Before the cancellation deadline the result is `cancelled_free`, after it `cancelled_late` (the charge is forfeited), exactly as the staff action | `facilities_rental_links` (DD-R13) | Unknown, expired or spent link → 410 with no data |
| Opening-hours rule for an event | A one-off event with a `placeId` must lie inside the place's opening windows of its day (inherited as DD-41); no opening hours on the chain → no limit; an event with a typed-in venue (D-031 §6) has no place and is not checked | `activities` event command (DD-R15) | 409 `place_closed` with the day's windows |

## Users, Permissions, and Scope

No role gains or loses a feature. Record scope stays with `people.scopeService` and the grants of the facilities spec.

| Actor | Allowed outcomes | Scope rule | Required feature IDs |
|---|---|---|---|
| Club administrator (panel; D-030: also does the treasurer's work) | Everything in this spec; the only one who issues bans, records a past club booking, approves requests and edits the agreement terms | Club-wide (`club_admin` grant) | `facilities.*`, `club_core.manage` (contract form, place form) |
| Facility attendant (phone) | Day axis of own places; enter, correct, cancel, move and no-show a rental, and confirm one that has no charge (a rental with a charge is confirmed by the payment the administrator records, DD-R09); find renters by DD-R07; log; incidents with a ban request; see the bans of own places | The assigned places and their descendants (`facility_operator` grant) | `facilities.view`, `facilities.rentals.manage`, `facilities.log.write`, `facilities.incidents.manage` — unchanged |
| Coach, coordinator (phone) | Day axis of every club place; book for an own group or for a general purpose; cancel own bookings; see renters' names, not their contacts (DD-R18); receive reschedule notices | Club-wide read; group events within own groups; cancel by `bookingCancellable` | `facilities.view`, `facilities.bookings.create`, `activities.events.create` |
| Maintenance planner (phone) | Redacted day axis and task list of assigned places; plan, move, complete, cancel work | Assigned places (`maintenance_planner` grant) | `facilities.maintenance.manage` |
| External renter (no account) | Read the public calendar, submit and confirm a request, cancel an own rental through the link | The rental the link names | none; rate limits as the public request routes |
| Guest | Public places list and calendar | Public data only | none |

`tenantId` and `organizationId` come from the authenticated context (`trustedScopeOf`) on every signed-in route. The public cancellation routes resolve the club from the link record by its token hash and narrow every further query to that tenant and organization. This is a **new** sessionless lookup: the `AGENTS.md` exception (D-024, D-026) names the allowed links one by one (declaration, order and request links), and a rental cancellation link is not among them. The owner approved it on 2026-11-16 ([#253](https://github.com/wladku/Vereino/issues/253#issuecomment-6910005145), Ask First item 2): one read-only, index-backed system-scope lookup of `facilities_rental_links.token_hash` in one DI service (`services/rental-links.ts`), failing closed with 410. Phase 12 adds "rental cancellation links" to the list in that `AGENTS.md` line in the same pull request.

## Reuse and Ownership Map

| Capability | Reuse / extend / app-own | Existing module or new module | Integration seam | Why |
|---|---|---|---|---|
| Day data | reuse, extend | `facilities` | `GET /api/facilities/calendar` (`services/calendar.ts`): additive fields | It already returns every entry kind |
| Day axis | extend | `facilities` | `components/club-places/PlaceTimeline.tsx` → `components/day-axis/DayAxis.tsx`; `lib/day-axis.ts` | The component and its helpers (`places-client.ts`: `daySegments`, `entriesOfDay`) exist |
| Slot dialog | extend | `facilities` | `BookDialog.tsx`, `RentalDialog.tsx`, `RentalQuotePanel.tsx`, `POST /api/facilities/rentals/quote` | Both forms and the quote exist |
| Place facts for pickers and cards | extend | `club_core` provides, `facilities` reads | DI `clubCoreDirectory.placeOptions` gains `parentId`, `kind`, `surface`, `isExternal`, `acceptsOnlineRequests` (additive) | `facilities` never reads `club_core` entities |
| Institution names for renter search | extend | `club_core` provides | DI `clubCoreDirectory.searchInstitutions(scope, query, limit)` → `{ id, name, type }[]` (new, names only) | Same seam as `institutionNames` |
| Session facts (group, coach, section) | extend | `activities` provides | DI `activities.placeSessions`: `PlaceSessionEntry` gains `groupName`, `sectionId`, `coachPersonId` (additive) | Needed by M-12 rows and the reschedule notice |
| Agreement terms | extend | `club_core` | `club_core/lib/contracts.ts` (terms parser), `ContractForm.tsx`, DI `clubCoreContracts.facilityAgreement(scope, institutionId, on)` (new) | The encrypted `terms` column and the contracts read service exist (#96) |
| Rental charge | reuse | `payments` provides (payments parity spec, REQ-C01, DD-C01) | optional DI `payments.chargeService` (DD-19): `createForSource` (with the optional `payerDisplayName`), `cancelForSource`, `statusOf(chargeIds, ctx)`; the consumer's type in `facilities/services/charges.ts` gains `statusOf` and `payerDisplayName` | The seam is in place; `facilities` never imports `payments` |
| E-mails and notices | reuse | `foundation` | `dispatch` with bare-address recipients and DD-46 keys; `emails/templates.ts` pattern | As the request e-mails (#125) |
| Cancellation link | reuse | `foundation` | `createTokenLinkService` over a `facilities` link entity | P-10; as the request link |
| Coordinators and administrators to notify | reuse | `people` | `people.personDirectory.sectionCoordinatorIdsOn`, `roleHolderIdsOn`, `findUserIds` | Already used by `facilities/services/directory.ts` |
| Opening-hours check for events | reuse | `club_core` provides, `activities` reads | DI `clubCorePlaces.openingHours`; `openingWindowsOn` of `@vereino/core` | DD-R15 |
| Dashboard widget | app-own | `facilities` | `widgets/dashboard/today-at-facility/` beside `requests-awaiting-approval/` | The same widget family |
| Tables and forms | reuse | Open Mercato UI | `DataTable`, `CrudForm`, `RowActions`, `StatusBadge`, dialogs | The day axis and the request cards are the two recorded exceptions (DD-R01, DD-R16) |

The source of truth stays where it is: places and contracts in `club_core`, sessions in `activities`, charges and payments in `payments`, persons in `people`. `facilities` stores ids and its own display snapshots (`renter_display_name`).

## Architecture and Data Flow

```text
B-23 FacilityCalendar / M-11 ClubPlacePage
  -> GET /api/facilities/options/places            (chips, cards; facilities scope)
  -> GET /api/facilities/calendar?placeId&from&to  (7 days: days[], entries[] with names; contact only with rentals.manage)
  -> DayAxis (lib/day-axis.ts: bounds, lanes, free open hours) + "Day entries"
  tap a free hour -> SlotDialog
       rental  -> GET /api/facilities/renters -> POST /api/facilities/rentals/quote -> POST /api/facilities/rentals
                    -> clubCoreContracts.facilityAgreement (deadline) -> payments.chargeService.createForSource (optional; payee = placePayee)
                    -> after commit: dispatch "rental summary" e-mail with the cancellation link
       group   -> POST /api/activities/events -> clubCorePlaces.openingHours (409 place_closed) -> vereino.occupancyProvider
       general -> POST /api/facilities/internal-bookings (past start: club-wide grant only)

B-24 / rental page / M-12 rentals tab
  Confirm payment
       rental with a charge: link to B-22 /backend/payments/charges/{chargeId} -> "Record payment" (payments)
                             -> payments.payment.recorded -> facilities subscriber -> chargeService.statusOf = paid
                             -> facilities.rentals.confirm_paid (requested -> confirmed)
       rental without one:   POST /api/facilities/rentals/{id}/confirm -> requested -> confirmed (register only)
  Correct         -> PUT /api/facilities/rentals (facilities.rentals.update)

Closure / maintenance window saved -> services/reschedule.ts flags entries (as today)
       -> dispatch facilities.reschedule_needed: coordinators + coach (sessions), booker (bookings), administrators (rentals), renter e-mail

Renter e-mail link -> /p/{club}/rentals/cancel/{token} -> POST /api/facilities/public/rentals/cancel/preview -> POST …/cancel
       -> facilities.rentals.cancel (same rules as staff) -> chargeService.cancelForSource
```

- **Module boundaries:** `facilities` gains routes, one command, one link table, subscribers and pages. `club_core` gains two read methods, additive option fields and the facility terms on the contract form. `activities` gains additive fields on its place-sessions read and the opening-hours check in its event command. `payments` gains nothing here; the payments spec delivers the charge service. No module imports another's entities.
- **Extension points:** DI registrations (`di.ts`), the dashboard widget discovery, subscribers, the foundation `dispatch` and token-link service.
- **Alternatives considered:** a separate "rentals" member module for the attendant. Rejected: the rental pages need the same reads and commands as the panel ones.
- **Compatibility:** the API changes are additive — new optional query parameters, new response fields, new routes, new error codes — except two narrowings. Two behaviours widen: rentals appear on the panel calendar for every holder of `facilities.view` (the API already returned them), and a club booking may start in the past for the club administrator (422 `booking_too_old` beyond 92 days). Two narrow: a one-off event is refused outside opening hours (409 `place_closed`, DD-R15: breaking for a caller that relied on booking outside the hours; no stored data is affected), and a direct confirm of a rental whose charge is unpaid is refused (409 `rental_awaits_payment`; no live caller breaks, because no rental has a charge today). Both narrowings were approved by the owner on 2026-11-16 (*Rollout*). `PlaceTimeline.tsx` is internal and may be replaced.

## User Journeys

### Journey J-R01 — The attendant takes a rental by phone, on the phone (replaces README F-10 "Rental by phone" and J-005 step 2)

1. Tomek signs in and lands on `/club/facility` (the landing rule is the navigation spec's). The coach of "KS Sąsiedzi" calls about Wednesday evening.
2. He opens "Miejsca" → "Boisko piłkarskie" → the chip for Wednesday. The axis shows the bookable band 19:00–22:00 and a club training until 19:30. He taps 20:00.
3. The slot dialog opens with the kind "Wynajem zewnętrzny", 20:00, 1 unit. He types "Sąs" in the renter field and picks "KS Sąsiedzi", found among the institutions; the last contact used on this pitch fills the contact fields. The quote shows the amount, "wpłata do", "bezpłatne odwołanie do" and "na konto: Gmina Przykładowo".
4. He ticks "Najemca zaakceptował regulamin (telefonicznie)" and saves. The block appears on the axis; the toast repeats the amount and both dates (`ui.slotModal.rentalSaved`). The renter gets the summary e-mail with the owner's account number and the cancellation link.
5. Failures: 20:00–21:30 collides with a tournament → the dialog lists "20:00–22:00 Turniej (Orliki)" and nothing is saved; the renter has an active ban → the message at the renter field; a place outside his grant never appears in his lists and its address answers 403.

### Journey J-R02 — The administrator reads the day and decides on a request (B-23, B-25)

1. Aneta opens `/backend/facilities/calendar?place=…&date=…` from the dashboard widget "Dziś na obiekcie". She sees training sessions, a club booking, a rental and a pending request on one axis, and "2 grupy klubu naraz" under the place name.
2. The request block says "Zgłoszenie: FC Blokersi (czeka na akceptację)". In "Wpisy dnia" its row has the link "Decyzja", which opens `/backend/facilities/requests`.
3. The card shows the contact, the purpose, "Kwota orientacyjna 150 zł — na konto: Gmina Przykładowo", "brak kolizji", "brak w rejestrze zakazów", "regulamin zaakceptowany online", "e-mail potwierdzony" and "wygasa śr. 18:40". She presses "Akceptuj"; the dialog's first line names the owner (`action.approve.intro`).
4. After approval the card leaves the queue, the rental is `requested`, and — with `payments` — its charge is payable to the municipality.
5. Failures: the hold lapsed meanwhile → 409 `request_hold_expired`, the card is removed with a message; a collision appeared → the card's alert lists it by name and approval answers 409.

### Journey J-R03 — A coach books a tournament in one tap (completes J-006 steps 1–3)

1. Marek opens `/club/places`. The list holds the club's own leaf places; "Boisko piłkarskie" says "boisko · sztuczna trawa · dziś: 3 wpisy".
2. He opens it, picks Saturday and taps 09:00. The dialog opens at once with "Dla grupy (wydarzenie)" preselected, 09:00–10:30, "Strefa: ogólnodostępne. Rezerwacja personelu jest ważna od razu".
3. He sets the end to 12:00, the group, the type and the name, picks two invited teams, and saves. The toast says the event is booked and "Przebito 1 zgłoszenie zewnętrzne".
4. Failures: 07:00–09:00 on a place that opens at 08:00 → 409 `place_closed` with "08:00–22:00"; a name of two characters → the field message; a collision → the list with names.

### Journey J-R04 — A rental is paid, or is not (completes J-005 step 4)

1. With `payments`: the municipality's statement shows the transfer. On B-24 Aneta presses "Potwierdź wpłatę" on the row; it opens the rental's charge (B-22 of the payments parity spec, J-C03), where she records the transfer. The charge becomes `paid`. Back on B-24 the rental is `confirmed` and its row says "opłacona".
2. Without `payments`, or for a rental entered before it was enabled: the same button confirms the rental at once (`action.rentalConfirm.toast`); the dialog says the payment is noted in the rental register only.
3. Not paid: after the payment deadline the rental appears under "Nieopłacone po terminie". If the agreement with the municipality has automatic expiry, the next lifecycle run cancels it free of charge, releases the slot and e-mails the renter; if not, Aneta calls the renter and then records the payment or cancels the rental.
4. Failures: a direct confirm of a rental whose charge is still open answers 409 `rental_awaits_payment` with the link to the charge; a payment event that arrives twice confirms once; if the event was missed, the confirm action succeeds as soon as the charge is `paid`.

### Journey J-R05 — A closure flags entries and the right people learn of it

1. The municipality announces an event. Aneta adds the closure on the Closures tab; the save says "Oznaczono do przeniesienia: 2 terminy, 1 rezerwacja klubu, 1 wynajem".
2. The coordinator of Akademia and the coach of the two sessions each get one notification and one e-mail naming the closure and their sessions; the booker of the club booking gets one for the booking; the administrators get one for the rental; the renter gets an e-mail saying the club will propose a new time.
3. Aneta opens B-24 → "Do przeniesienia", opens the rental and moves it; the flag clears and the renter gets the "moved" e-mail. The coordinator moves the sessions on the page the groups and activities spec defines.
4. Failures: a recipient without an account gets the e-mail only; a failed dispatch is retried by its key and never sent twice.

### Journey J-R06 — The renter cancels through the link

1. The coach of KS Sąsiedzi opens the link from the summary e-mail: `/p/dev-academy/rentals/cancel/{token}`. The page shows the place, the slot, the amount, and whether cancelling is free ("bezpłatnie do wt. 20:00") or forfeits the amount.
2. He confirms. The rental becomes `cancelled_free`, the slot is bookable again on the public calendar, staff with the rental in their scope see it under "Wszystkie", and he gets the cancellation e-mail.
3. Failures: the link is opened after the start, or the rental was already cancelled → 410 with a neutral message and the club's phone; a burst of calls → 429.

### Journey J-R07 — The person who maintains the pitch works on the phone

1. Zbyszek gets the reminder "Szczotkowanie — 10 h użytkowania" and opens its link, `/club/places/maintenance`. The list shows the tasks of his places: due, planned, done.
2. He opens the pitch's day axis (no names, "zajęte przez klub"), taps Friday 07:00 and plans the window; two sessions under it are flagged and their coordinator is told (J-R05).
3. On Friday he marks the task done on the list; the next instance appears.
4. Failures: a place he does not maintain is absent from his list and answers 403; a done task answers 409 `maintenance_task_closed`.

### Journey J-R08 — The attendant asks for an entry ban

1. After a fight on the pitch Tomek reports an incident on `/club/facility`, picks today's rental "KS Sąsiedzi" as the party involved (its name goes into "people involved") and ticks the action "Wnioskowano o zakaz wstępu" (the existing `facilities.records.incidentAction.entry_ban_requested`).
2. The administrators get the notice "Wniosek o zakaz wstępu — Boisko piłkarskie". On the Incidents tab the row carries "wniosek o zakaz" and the action "Wydaj zakaz", which opens the ban form with the place, the incident and the reason filled in; Aneta picks the subject and the period.
3. The ban is saved with `incident_id`; the incident shows "zakaz wydany". A new rental for that renter answers 409 `entry_ban_active`.
4. Failures: the attendant calling the ban route directly gets 403 `scope_denied` as today.

## UI and Interaction Contracts

Closest installed references: `facilities/components/club-places/ClubPlacePage.tsx` and `PlaceTimeline.tsx` (the member day page and its timeline); `club-places/BookDialog.tsx` and `components/RentalDialog.tsx` (the two dialogs the slot dialog joins); `components/RentalsTable.tsx` (DataTable with app-owned tabs); `people/components/PersonRecord.tsx` (a record page with sections and tabs — the model for the rental page); `club-facility/ClubFacilityPage.tsx` (the attendant's member page); `components/public/PublicFacilitiesFrame.tsx` (the public frame). Backend pages follow `.ai/guides/backend-ui.md`. Polish texts come from the mockup's `docs/ux-concept/mockups/i18n/pl.json`; the keys are named in the rows and copied into the module catalogues (`facilities/i18n/en.json`, `pl.json`) under the namespaces given. A Polish text quoted without a key has no counterpart in the mockup: it is a proposal for the catalogue, follows the navigation spec's glossary and is reviewed with it (Q-R20).

| Surface / route | Purpose and primary actions | Data source / mutations | Closest installed reference | Canonical shell / components | Required states | Requirement IDs |
|---|---|---|---|---|---|---|
| `/backend/facilities/calendar?place=&date=` (B-23) | The day axis of one place; place chips; seven day chips and "Other day"; availability card; "Ustaw dostępność do rezerwacji" (`facilities.manage`); tap a free hour → slot dialog; "Wpisy dnia" with per-entry actions; filter "Do przeniesienia"; links "Strefy i cennik" and "Ustawienia miejsca" | `GET /api/facilities/options/places`, `GET /api/facilities/calendar`, `POST /api/facilities/zone-rules/bulk` | `ClubPlacePage.tsx`, `FacilityCalendar.tsx` (availability part) | `Page`, `PageBody`, `DayAxis` (custom, DD-R01), `Alert`, `Button`, `AvailabilityDialog` | loading (axis skeleton), no places ("Dodaj miejsce" link for `club_core.manage`), no zone rules ("Brak reguł stref — dodaj strefy" + link), closed day (`ui.timeline.closedDay`), error with retry, 403 place outside scope | REQ-R01, REQ-R03 |
| `SlotDialog` (B-23, M-11, B-24 "New rental") | One dialog, kinds by DD-R04; rental body with renter search, category, units, contact, purpose, notes, "rules accepted by phone", quote; group body with group, type, name (≥ 3 characters), invited teams for both types; general body with purpose (3–120) and section | `GET /api/facilities/renters`, `POST /api/facilities/rentals/quote`, `POST /api/facilities/rentals`, `POST /api/activities/events`, `POST /api/facilities/internal-bookings`, `GET /api/facilities/internal-bookings/options` | `BookDialog.tsx`, `RentalDialog.tsx` | `Dialog`, form fields of `@open-mercato/ui`, `RentalQuotePanel` | submitting, field errors, 409 list of collisions with names (`ui.slotModal.slotTaken`), 409 `zone_not_reservable` / `place_closed` / `entry_ban_active` at their fields, success toast with the superseded count | REQ-R02, REQ-R14 |
| `/backend/facilities/rentals?status=&view=` (B-24) | Tabs Aktywne / Czekają na akceptację / Wszystkie and perspectives Do przeniesienia / Nieopłacone po terminie, all in the address; columns Termin, Miejsce, Najemca (+ contact · phone), Źródło, Kwota (+ payee and charge state), Status; visible buttons "Potwierdź wpłatę" (a link to the charge record when the rental has a charge, DD-R09) and "Odwołaj"; "Decyzja" on a pending row; Move and No-show in the row menu; the row opens the rental | `GET /api/facilities/rentals`, `POST …/{id}/confirm\|cancel\|move\|no-show` | `RentalsTable.tsx` | `DataTable`, `RowActions`, `StatusBadge`, app-owned tablist (DD-U03 of the UX parity spec) | loading, empty (`b.screenRentals.emptyTitle` + "Nowy wynajem"), filtered-empty, error, 409 transition | REQ-R04, REQ-R06 |
| `/backend/facilities/rentals/[id]` | The rental: header (renter, place, slot, status, "do przeniesienia"); sections Renter and contact (editable), Money (amount, category, units, payment and cancellation deadlines, payee, charge state, "Open the charge"), History (source, rules accepted, e-mail confirmed, decision, audit entries); actions Confirm payment, Cancel, Move, No-show | `GET /api/facilities/rentals?id=`, `PUT /api/facilities/rentals`, the action routes | `people/components/PersonRecord.tsx` | `Page`, `PageBody`, `CrudForm` (the editable section), `StatusBadge`, `RentalActionDialogs` | loading, 404, 403 outside scope, 409 stale version (shared conflict dialog), 409 `rental_closed`, success flash | REQ-R05, REQ-R06 |
| `/backend/facilities/requests` (B-25) | A card per request with the facts of REQ-R08; Approve and Reject on the card; "Load more" | `GET /api/facilities/rentals/requests`, `POST …/{id}/approve\|reject` | `RequestsQueue.tsx`, `RequestDecisionDialogs.tsx` | `Page`, cards (custom, DD-R16), `Alert`, `StatusBadge`, decision dialogs | loading (card skeletons), empty (`b.screenRequests.emptyTitle`), error, 409 decided or expired meanwhile | REQ-R08 |
| Tabs of B-26: Strefy, Zamknięcia, Cennik wynajmu (shell: navigation spec) | Zones: Place, Days, Hours, Zone, Priority, Valid, Source; toolbar "Ustaw dostępność do rezerwacji" (primary) and "Dodaj regułę strefy"; the week preview under the table. Closures: Place, When, Reason, Description; "Dodaj zamknięcie". Rates: Place, Renter category, Price per 90 min, season, lighting, validity; "Dodaj stawkę". The place cell links to the calendar of that place | existing CRUD routes, `POST /api/facilities/zone-rules/bulk` | `ZonesTable.tsx`, `ClosuresTable.tsx`, `RatesTable.tsx` | `DataTable`, `CrudForm` pages (#121), `AvailabilityDialog`, `WeekZonePreview` | as today, plus the save message "Oznaczono do przeniesienia: …" on a closure | REQ-R09, REQ-R03 |
| Tabs of B-27: Dziennik, Incydenty, Zakazy wstępu, Konserwacja (shell: navigation spec) | Log: Day, Place, Attendant, Opened, Closed, Before, After; "Dodaj wpis" (place, day up to today, times, conditions, groups, remarks). Incidents: Date, Place, Kind, Description, Action, Reported by, photos; "Zgłoś incydent"; the note `b.screenLogs.incidentsNoDelete`; filter "Wniosek o zakaz"; row action "Wydaj zakaz". Bans: Subject, From, To or "bezterminowo", Reason, Issued by; "Wydaj zakaz". Maintenance: unchanged (#128) | `GET/POST/PUT /api/facilities/logs`, `/incidents`, `/entry-bans`, `…/revoke` | `LogsTable.tsx`, `IncidentsTable.tsx`, `BansTable.tsx`, `club-facility/FacilityDialogs.tsx` | `DataTable`, dialogs with `CrudForm` fields | loading, empty with the add action, error, 409 `log_exists`, 403 `log_edit_closed`, 422 field errors | REQ-R10, REQ-R14 |
| `/backend/facilities/reports/owner` (B-28) | Subtitle with the owner institution (`b.screenOwnerReport.subtitle`); under "Wpłaty na konto gminy" the source: charges, rental register, or both | `GET /api/facilities/reports/owner` | `OwnerReport.tsx` | unchanged | unchanged | REQ-R11 |
| Place form (B-06) and contract form (B-07) | Place form: links "Kalendarz obiektu" and "Strefy i cennik" for a saved place. Contract form: for `facility_management`, the group "Warunki wynajmu" with payment days and automatic expiry | `PUT /api/club_core/places`, `POST/PUT /api/club_core/contracts` | `PlaceForm.tsx`, `ContractForm.tsx` (`ratesGroup`) | `CrudForm` | 422 `contract_terms_invalid` at the field | REQ-R03, REQ-R07 |
| `/club/places` (M-11) | Cards of the bookable places: name, parent, "kind · surface · dziś: N wpisów / wolny"; intro `m.screenPlaces.intro` | `GET /api/facilities/calendar` (no `placeId`) | `ClubPlacesPage.tsx` | member frame, cards | loading, empty ("Klub nie ma jeszcze miejsc do rezerwacji"), error | REQ-R12 |
| `/club/places/[placeId]?date=` (M-11) | Name, long date, capacity (`m.screenPlace.capacity`); day chips and "Other day"; hint (`m.screenPlace.clickHintMember`); the day axis; tap a free hour → slot dialog; "Wpisy dnia"; tap an entry → details sheet (kind, time, place, label; for a rental the status and, by DD-R18, the contact with a `tel:` link and "Open the rental"); cancel an own booking with a confirmation; "Plan maintenance" for a planner | as B-23 | `ClubPlacePage.tsx` | member frame, `DayAxis`, `SlotDialog`, sheet dialog | loading skeleton, no zone rules ("Obiekt nie ma reguł stref — skontaktuj się z administratorem"), closed day, error, 403 | REQ-R12, REQ-R02, REQ-R14 |
| `/club/places/maintenance` (new) | The planner's tasks on their places: Due / Planned / Done; Complete; Plan (opens the task dialog); link to the place's day axis | `GET/POST/PUT /api/facilities/maintenance-tasks`, `POST …/{id}/complete` | `MaintenanceTable.tsx`, `MaintenanceTaskDialog.tsx`, `maintenance-client.ts` | member frame, list cards, dialog | loading, empty ("Brak zadań na Twoich miejscach"), error, 409 `maintenance_task_closed` | REQ-R15 |
| `/club/facility?tab=today\|rentals` (M-12) | Today: as now, with the rows of REQ-R13, "Nie stawił się" always shown, headcount after opening, "Incydenty zgłoszone dziś" with "Dodaj zdjęcie", the incident dialog's renter picker and "Wnioskuj o zakaz wstępu". Rentals: the rentals of the attendant's places from 7 days back to 30 days ahead, filter Aktywne / Do przeniesienia / Wszystkie, "Nowy wynajem" | `GET /api/facilities/today`, `/logs`, `/incidents`, `GET /api/facilities/rentals` | `ClubFacilityPage.tsx` | member frame, tablist, cards, `FacilityDialogs` | loading, empty (`m.screenFacilityToday.emptyTitle`; "Brak wynajmów"), **no facility assigned** (the navigation spec's J-N04 step 4 delegates it here: a holder of `facilities.log.write` whose `facility_operator` grant names no active place sees "Nie masz przypisanego obiektu — skontaktuj się z administratorem" and no tabs; the More entry stays), error, conflict | REQ-R13, REQ-R14 |
| `/club/facility/rentals/[id]` (new) | The rental on the phone: the same read as the panel page; edit contact, purpose and notes; Confirm payment, Cancel, Move, No-show | as the panel rental page | `ClubFacilityPage.tsx` | member frame, cards, `RentalActionDialogs` | loading, 404, 403, 409 | REQ-R14, REQ-R05 |
| `/p/[clubSlug]/places`, `/places/[placeSlug]`, `/requests/verify/[token]` (P-03…P-05) | P-03: hero intro (`p.screenPublicPlaces.intro` / `introOnline`), card with address · surface and the badge "zgłoszenia online" or "rezerwacja telefoniczna"; disabled state with the club's phone. P-04: the notice `p.screenPublicPlace.onlineNotice` with the owner on the page; on a phone the list starts today, marks it, and offers "Pokaż wcześniejsze dni". P-05: summary (place, slot, units; organisation · contact · e-mail), `p.screenVerify.estimate` with the owner, "Wróć do kalendarza" of that place when the slot was taken. All three inside the club's frame | existing public routes; `POST /api/facilities/public/requests/verify` (extended) | `PublicPlacesView.tsx`, `PublicScheduleView.tsx`, `RequestVerifyView.tsx` | `PublicFacilitiesFrame` with the club | loading, 404, disabled, 410, 409 slot taken | REQ-R16 |
| `/p/[clubSlug]/rentals/cancel/[token]` (new) | The renter's cancellation: summary, free or forfeiting, "Odwołaj rezerwację", result; served with `Referrer-Policy: no-referrer` | `POST /api/facilities/public/rentals/cancel/preview`, `…/cancel` | `RequestVerifyView.tsx` | `PublicFacilitiesFrame` | loading, confirm, done, 410, 429 | REQ-R17 |
| Dashboard widget "Dziś na obiekcie" (B-01; widget 8 of the navigation spec) | Today's entries on the bookable places in the reader's scope — administrator: the club's places; coordinator: the club's places; attendant: the assigned places and their descendants — by start, at most 8 and "i N więcej"; click → B-23 of the first entry's place. Feature `facilities.view` | `GET /api/facilities/options/places` and `GET /api/facilities/calendar` (today), both already scoped by the caller's grant | `widgets/dashboard/requests-awaiting-approval/` | dashboard widget shell | loading, empty (`b.screenDashboard.nothingScheduled`), error | REQ-R20 |

### UI architecture

| Role | Navigation groups in order | Dashboard / injected widgets | Login-to-primary-task flow |
|---|---|---|---|
| Club administrator | Facility → the mockup's six items (navigation spec): Calendar, Rentals, Requests, Zones and price list, Log and incidents, Owner report | "Zgłoszenia do akceptacji" (exists), "Dziś na obiekcie" (REQ-R20) | `/backend` → widget → calendar → tap an hour: 3 clicks to a saved rental form |
| Facility attendant | Member shell (navigation spec): Today at the facility, Places; alongside it the panel's Facility group (navigation spec, D-029 §2) | panel: "Dziś na obiekcie" for the assigned places (navigation spec's widget 8) | sign-in → `/club/facility` → "Otwórz obiekt": 1 tap; a rental: Places → place → hour: 3 taps |
| Coordinator | Member shell: Places under the rule of the navigation spec; panel: Facility group (navigation spec) | panel: "Dziś na obiekcie" for the club's places (widget 8) | `/club` → Places → place → hour: 3 taps |
| Coach | Member shell: Places under the rule of the navigation spec | none (no `dashboards.view`) | `/club` → Places → place → hour: 3 taps |
| Maintenance planner | Member shell: Places; "Konserwacja" link on `/club/places` when `maintenance.canPlan` | none | reminder link → `/club/places/maintenance` → "Wykonano": 2 taps |

| Surface / widget | Empty state guidance and action | Responsive behavior | Keyboard / focus behavior |
|---|---|---|---|
| Day axis | No zone rules: text and, for `facilities.manage`, the link to the zones tab. Closed day: `ui.timeline.closedDay`; hours are not buttons | 40 px per hour at every width; the hour column is 48 px; lanes share the rest and never drop below 96 px — a fourth parallel entry makes the layer scroll sideways inside the axis, the page never scrolls sideways; block text wraps and is repeated in "Wpisy dnia" | Each free hour is a `button` named `ui.timeline.bookFrom`; Tab walks hours then entries; Enter opens the dialog or the details; arrow left and right change the day; blocks are not the only carrier of information — "Wpisy dnia" lists them as text |
| Day and place chips | — | The row scrolls sideways under 480 px with the current chip in view | A group labelled "Dzień" / "Miejsce"; the current chip has `aria-current` |
| Slot dialog | — | Full-height sheet under 640 px; fields in one column | Focus on "Kind"; changing the kind keeps the times; Escape cancels; the collision list is announced (`role="alert"`) |
| Request cards | `b.screenRequests.emptyTitle` and `emptyText` | The three fact columns stack under 768 px; the buttons stay at the card's end, full width under 480 px | Each card is an `article` headed by the renter; badges carry text, never colour alone |
| Rentals tab on M-12 | "Brak wynajmów" + "Nowy wynajem" | One card per rental; actions in the rental page | Cards are links; the phone number is a `tel:` link with its own label |

### `/backend/facilities/calendar` — Facility calendar (B-23)

```text
┌──────────────────────────────────────────────────────────────────────────┐
│ Kalendarz obiektu                       [Ustaw dostępność do rezerwacji] │
│ Strefy, zajęcia, rezerwacje klubu, wynajmy, zgłoszenia i zamknięcia      │
│ [Boisko piłkarskie] [Boisko wielofunkcyjne] [Salka szkoleniowa]          │
│ ▸ Dostępność do rezerwacji z zewnątrz — … (obiekt przyjmuje zgłoszenia   │
│   online)                                    Strefy i cennik · Ustawienia│
│ Boisko piłkarskie                                                        │
│ sobota, 16.11.2026 · 2 grupy klubu naraz            ☐ Do przeniesienia   │
│ [sob 16.11] [nd 17.11] [pn 18.11] [wt] [śr] [czw] [pt]   Inny dzień [  ] │
│ Kliknij wolną godzinę, aby dodać wynajem lub rezerwację klubu.           │
│ Legenda: ogólnodostępne · treningi klubu · do rezerwacji · zajęcia ·     │
│          rezerwacja klubu · wynajem · zgłoszenie · zamknięte · konserwacja│
├──────────────────────────────────────────────────────────────────────────┤
│ 08:00 │ (free hour = button)                                             │
│ 09:00 │ ┌ 09:00–12:00 Turniej (Orliki) ─┐ ┌ 09:00–10:30 Trening (Żaki) ┐ │
│ 10:00 │ │                               │ └────────────────────────────┘ │
│ 12:00 │ ┌ 12:00–13:30 Zgłoszenie: FC Blokersi (czeka na akceptację) ───┐ │
│ 19:00 │ ┌ 19:30–21:00 Wynajem: KS Sąsiedzi ───────────────────────────┐  │
│ 21:00 │                                                                  │
├──────────────────────────────────────────────────────────────────────────┤
│ Wpisy dnia                                                               │
│ 09:00–12:00 · Turniej (Orliki)                                           │
│ 12:00–13:30 · Zgłoszenie: FC Blokersi (czeka na akceptację)   [Decyzja]  │
│ 19:30–21:00 · Wynajem: KS Sąsiedzi · zgłoszony         [Otwórz wynajem]  │
└──────────────────────────────────────────────────────────────────────────┘
```

- **Behavior:**
  - The page opens on the first bookable place and today when the address names none, and writes both into the address (`replace`), so a reload, a shared link and the back button restore the view.
  - It reads the seven days of the chips in one request and switches between them without a new read; "Other day" reads that day alone.
  - The availability card is a `details` element, open when the place has no bookable window. Its summary says `ui.availabilityCard.acceptsOnline` or `noOnline`. It lists every `reservable_paid` window in force today per weekday, marks those from the regulations, and keeps "Usuń" per day for `facilities.manage`.
  - Rentals and requests are drawn for every reader with `facilities.view`. "Wpisy dnia" gives each entry its action: own club booking → "Anuluj" (confirmation); rental → the rental page (`facilities.rentals.manage`); request → "Decyzja" (`facilities.rentals.approve`); closure → the closures tab; maintenance → the task dialog (`facilities.maintenance.manage`).
  - "Do przeniesienia" limits the axis and the list to flagged entries and shows, above the chips, how many flagged entries each of the seven days has.
  - On a past day the hours open the dialog only for the club administrator, with the general kind alone (DD-R17).
- **Responsive and accessibility:** see the table above; the legend is text beside each swatch; zone bands also carry their name as a title and in the dialog's zone line.
- **Localization:** `facilities.calendar.*`, `facilities.axis.*`; weekday and date formats from the locale.
- **Design-system and theming:** zone and entry colours from the semantic tokens already used by `KIND_TAGS` and the zone legend; no hard-coded colours; checked in light and dark mode and with reduced motion.

### `SlotDialog` — the slot dialog (B-23, M-11)

```text
┌ Rezerwuj: Boisko piłkarskie, śr 13.11 ───────────────────────┐
│ Strefa: do rezerwacji.                                        │
│ Rodzaj* [Wynajem zewnętrzny ▾]   (Dla grupy · Cel ogólny)     │
│ Od* [20:00]   Do [21:30]                                      │
│ Najemca* [Sąs…          ▾]  KS Sąsiedzi · instytucja          │
│          + Najemca spoza rejestru                             │
│ Kategoria [klub z gminy ▾]   Liczba jednostek 90 min* [1]     │
│ Kontakt* [Jan Nowak]  Telefon [600 000 000]  E-mail [      ]  │
│ Cel [sparing]         Uwagi [                              ]  │
│ ☑ Najemca zaakceptował regulamin (telefonicznie)              │
│ 150 zł · na konto: Gmina Przykładowo                          │
│ wpłata do nd 10.11 · bezpłatne odwołanie do wt 12.11 20:00    │
│                                        [Anuluj]  [Rezerwuj]   │
└───────────────────────────────────────────────────────────────┘
```

- **Behavior:** the kind selector lists only what DD-R04 allows. The group kind is the member event form reduced to a home event on the chosen place — group, type, name, invited teams — and posts to the same `POST /api/activities/events`; the fields the groups and activities spec adds for an away event (typed-in venue, gathering time) stay on that spec's form. On the phone the first line adds `ui.slotModal.staffImmediate` for the group and general kinds. The rental body asks for the quote on every change of place, start, units, category or renter and shows its issues at their fields before saving. The renter field searches from two characters; a picked renter fills the empty contact fields with the last contact used. A 409 with collisions lists each as "from–to label". After a group or general booking the toast adds `ui.slotModal.supersededN` when the answer carries superseded requests.
- **Responsive and accessibility:** a sheet on the phone; every field has a visible label; errors are tied to their field; the quote is a live region.
- **Localization:** `facilities.slot.*` (texts from `ui.slotModal.*`).
- **Design-system and theming:** shared dialog and field primitives; no new tokens.

### `/backend/facilities/requests` — Request card (B-25)

```text
┌──────────────────────────────────────────────────────────────────────┐
│ FC Blokersi — Boisko piłkarskie                     [wygasa śr 18:40]│
│ sobota, 16.11.2026, 12:00–13:30 · 1 × 90 min · klub spoza gminy      │
│ Kontakt             Cel                 Kwota orientacyjna            │
│ Adam Lis            turniej firmowy     220 zł                        │
│ adam@example.pl                         na konto: Gmina Przykładowo   │
│ 601 000 000                                                           │
│ [brak kolizji] [brak w rejestrze zakazów] [regulamin zaakceptowany    │
│  online] [e-mail potwierdzony]                                        │
│ [Akceptuj] [Odrzuć]                                                   │
└──────────────────────────────────────────────────────────────────────┘
```

- **Behavior:** soonest expiry first. A collision replaces the first badge with an alert "Kolizja" naming each entry. A ban match shows `b.screenRequests.banMatch`. Approve and Reject open the existing dialogs; the approval intro names the owner. A card whose request was decided or expired elsewhere is removed on the 409 with a message.
- **Localization:** `facilities.requests.*` (texts from `b.screenRequests.*`, `b.screenCharge.toOwnerAccount`).

### `/club/places/[placeId]` and `/club/facility?tab=rentals` — on a phone (M-11, M-12)

```text
┌───────────────────────────────┐   ┌───────────────────────────────┐
│ ‹ Miejsca                     │   │ Dziś na obiekcie              │
│ Boisko piłkarskie             │   │ [Dziś] [Wynajmy]              │
│ śr, 13.11.2026 · 2 grupy naraz│   │ [Aktywne][Do przeniesienia]…  │
│ [śr 13][czw 14][pt 15][sob]…› │   │                [Nowy wynajem] │
│ Inny dzień [        ]         │   │ śr 13.11 20:00–21:30          │
│ Kliknij wolną godzinę, aby…   │   │ KS Sąsiedzi · Boisko piłkarskie│
│ 17:00 │ ┌17:30–19:30 Trening┐ │   │ zgłoszony · 150 zł            │
│ 18:00 │ │(Orliki)          │ │   │ kontakt: Jan Nowak, 600 000 000│
│ 19:00 │ └──────────────────┘ │   │ ───────────────────────────── │
│ 20:00 │  (tap = book)        │   │ sob 16.11 10:30–12:00         │
│ Wpisy dnia                    │   │ FC Blokersi · do przeniesienia│
│ 17:30–19:30 · Trening (Orliki)│   └───────────────────────────────┘
└───────────────────────────────┘
```

- **Behavior:** the list page shows only bookable places and counts today's entries over the place family. On the day page one tap opens the dialog; the range box and the "Wybierz" step are removed. The preselected kind follows DD-R04 (a coach with groups starts on "Dla grupy"). The Rentals tab and the rental page are shown only with `facilities.rentals.manage`. On the phone a rental with a charge shows its charge state ("oczekuje na wpłatę", "opłacona") and no confirm button, because the administrator records the payment (DD-R09); a rental without a charge keeps "Potwierdź wpłatę". On the Today tab a session row reads "17:30–19:30 Trening · Boisko piłkarskie / grupa klubu · Marek Nowak", a rental row `m.screenFacilityToday.rental` and `m.screenFacilityToday.contact`. "Nie stawił się" is always present; before the start it answers `action.noShow.tooEarly` without calling the API.
- **Responsive and accessibility:** 375 px is the design width, 320 px reflows; the bottom bar of the member shell never covers the dialog's buttons.
- **Localization:** `facilities.places.*`, `facilities.facility.*`.

## Data Models

### `facilities_rental_links` (new; migration approved by the owner on 2026-11-16, [#253](https://github.com/wladku/Vereino/issues/253#issuecomment-6910005145), Ask First item 1 — its SQL is shown in the phase 12 pull request before it is applied)

The entity extends `ScopedEntityBase` and spreads `tokenLinkColumns({ use: 'single' })` from `@vereino/db`, as `activities` does for the declaration token (`activities/data/entities.ts`, with `until_expiry`); the service is `createTokenLinkService(RentalLink, { use: 'single', … })`. The column that says what a link is for is named `purpose`, because P-10 already uses the word "use" for the link policy (`single` / `until_expiry`).

| Field | Type / nullability | Scope / index | Sensitive / encrypted | Lifecycle and validation |
|---|---|---|---|---|
| `id` | UUID, required | primary key | no | immutable (`ScopedEntityBase`) |
| `tenant_id` / `organization_id` | UUID, required | part of the unique index below | no | trusted context only (`ScopedEntityBase`) |
| `rental_id` | UUID, required | FK by id to `facilities_rentals` (no ORM relation) | no | the rental must be live |
| `purpose` | `text`: `cancel` | unique `(organization_id, rental_id, purpose)` | no | one link per rental and purpose; re-issued (new hash) when the rental is moved |
| `token_hash` | `text`, required | unique (`tokenLinkColumns`) | the raw token is never stored | P-10 hash |
| `expires_at` | timestamptz, required | — (`tokenLinkColumns`) | no | the rental's `starts_at` |
| `used_at` | timestamptz, nullable | — (`tokenLinkColumns`, `single` policy) | no | set by the cancellation |
| `created_at` / `updated_at` | timestamptz, required | — (`ScopedEntityBase`) | no | `updated_at` moves on re-issue and use |
| `deleted_at` | timestamptz, nullable | — (`ScopedEntityBase`) | no | soft delete; a deleted row is never served |

Owned by `facilities`; changed only by `used_at` and re-issue; rows of deleted rentals are not served. The raw token exists only in the dispatch delivery's encrypted `secret_params` and in the e-mail (DD-44).

### `club_core_contracts.terms` for `kind = 'facility_management'` (shape only; no migration)

| Field | Type / nullability | Scope / index | Sensitive / encrypted | Lifecycle and validation |
|---|---|---|---|---|
| `paymentDeadlineDays` | whole number 0–60, optional | inside the encrypted JSON text | encrypted with the column | parsed by a new `parseFacilityTerms` in `club_core/lib/contracts.ts`; anything invalid is dropped on read and refused on write |
| `autoExpireUnpaid` | boolean, optional | as above | as above | default false |

The club management spec's *Data Models* names these terms `payment_deadline_days` and `auto_expire_unpaid`; the JSON keys follow the camelCase of the coach terms already stored (`baseMonthly`, …).

No other table changes and no new index. A ban request, a past club booking, the unpaid perspective and the reschedule notices use existing columns. The payment subscriber finds its rental by `charge_id` among the organization's `requested` rentals; `facilities_rentals.charge_id` has no index, and the lookup is accepted as an organization-scoped read of `requested` rentals, served by the existing `facilities_rentals_org_status_hold_idx` (`organization_id`, `status`, …) — the queue of `requested` rentals of one club is small.

## API, Command, and Error Contracts

Route conventions (S6.3–S6.7), per-method `metadata` and `openApi`, versions and 409s are those of the club management spec. New error codes are declared in the owning module's `lib/error-codes.ts`. Custom guarded routes unless `makeCrudRoute` is named.

| Method / command | Path / ID | Auth and feature gate | Input | Success response / event | Errors and concurrency | Requirement IDs |
|---|---|---|---|---|---|---|
| `GET` (new) | `/api/facilities/options/places` | auth; `facilities.view` or `facilities.maintenance.manage` (in the handler, as the calendar route); attendant → own places and descendants, maintainer without `facilities.view` → assigned places, other staff → all | — | `{ items: [{ id, name, parentId, parentName, kind, surface, isLeaf, isExternal, capacityGroups, acceptsOnlineRequests }], total }`, active places | 401, 403 | REQ-R01, REQ-R12, REQ-R14 |
| `GET` (extended) | `/api/facilities/calendar` | unchanged | unchanged (`from`–`to` ≤ 31 days) | `places[]` gain `parentId`, `kind`, `surface`, `isExternal`, `capacityGroups`, `acceptsOnlineRequests`; `entries[]` gain `placeName`, `status` (rental), `groupName` and `coachName` (session), `contact: { name, phone } \| null` (rental and request; only with `facilities.rentals.manage` on the place, DD-R18), `canOpen` (rental in the caller's rental scope) | unchanged; redaction for a maintainer unchanged (new fields null) | REQ-R01, REQ-R12, REQ-R20 |
| `GET` (extended) | `/api/facilities/today` | unchanged | unchanged | entries gain `placeName`, `groupName`, `coachName`, `contactName`, `contactPhone`; `incidents: [{ id, occurredAt, kind, photoCount }]` reported today on the place family | unchanged | REQ-R13 |
| `GET` (new) | `/api/facilities/renters` | auth + `facilities.rentals.manage`; place scope | `search` (2–80), `placeId?` | `{ items: [{ renterType, renterId, displayName, lastCategory, lastContact: { name, phone, email } \| null }] }`, at most 20: institutions by name through `clubCoreDirectory.searchInstitutions`; renters of rentals on the caller's places in the last 24 months (decrypted, matched in memory, at most 500 rows read); with `people.view` also persons through the existing people search | 400, 403 | REQ-R02, REQ-R14 |
| `POST` (changed) / `facilities.rentals.create` | `/api/facilities/rentals`, `/quote` | unchanged | unchanged; the dialog now sends `purpose` and `notes` | the quote and the rental gain `payee: { institutionId, name } \| null`; `payment_deadline` from the agreement (REQ-R07); the charge input carries `payeeInstitutionId`, `payerDisplayName` for an unregistered renter and the `charge.rentalDesc` description — the same in `facilities.rentals.approve` (`commands/requests.ts`); `facilities.rental.requested` now also triggers the summary e-mail | 409 `rental_conflict` carries `conflicts[]` labelled for staff, like the booking's | REQ-R02, REQ-R06, REQ-R07, REQ-R17 |
| `GET` (extended, `makeCrudRoute`) | `/api/facilities/rentals` | unchanged | + `id`, `view` (`to_move`, `unpaid`), `from`, `to` | items gain `payee`, `chargeState`, `chargeId`, `regulationsAcceptedAt`, `regulationsAcceptedVia`, `emailVerifiedAt`, `decisionReason` | 400 | REQ-R04, REQ-R05, REQ-R14 |
| `PUT` (new) / `facilities.rentals.update` | `/api/facilities/rentals` | auth + `facilities.rentals.manage` + place scope | version + `{ id, contactName?, contactPhone?, contactEmail?, purpose?, notes?, renterType?, renterId? }` | the rental; `facilities.rental.updated`; undoable (field snapshot) | 409 `rental_closed`, `entry_ban_active`, version; 422 `rental_renter_invalid` | REQ-R05 |
| `POST` (changed) / `facilities.rentals.confirm` | `/api/facilities/rentals/{id}/confirm` | unchanged | version | a rental without a charge: `confirmed` at once, as today; a rental with a charge: `confirmed` only when `statusOf` says `paid` (the repair path for a missed event); `facilities.rental.confirmed` | new 409 `rental_awaits_payment` with `chargeId` while the charge is `open` or `partially_paid`; 409 `invalid_transition` | REQ-R06 |
| Command (new) / `facilities.rentals.confirm_paid` | subscriber to `payments.payment.recorded` (always present — subscribers are discovered statically — and a no-op when `payments.chargeService` is not registered) | system, scoped by the event | the event's `chargeId`; the subscriber finds the organization's `requested` rental whose `charge_id` is that charge (no index on `charge_id`; *Data Models*) | `advanceWhere` `requested → confirmed` when `statusOf` says `paid` | a repeated event, a partial payment or a charge of another source advances nothing (DD-46) | REQ-R06 |
| Command (changed) / `facilities.rentals.advance_lifecycle` | job `facilities:rental-lifecycle` | system | — | also: automatic expiry (DD-R11) of rentals whose charge state is `none` or `open`, with `cancelForSource(outcome: 'cancelled')` and `facilities.rental.cancelled`; a `partially_paid` rental is skipped and stays unpaid | `advanceWhere`; idempotent | REQ-R07 |
| `POST` (changed) / `facilities.rentals.move` | `/api/facilities/rentals/{id}/move` | unchanged | unchanged | the amount is kept (as today); `payment_deadline` is recomputed only when the rental has no charge (*Payment deadline*); the cancellation link is re-issued | unchanged | REQ-R07, REQ-R17 |
| `GET` (extended) | `/api/facilities/rentals/requests` | unchanged | unchanged | items gain `collisions[].label`, `payee`, `units`, `regulationsAcceptedAt`, `emailVerifiedAt`; `total` is the menu count source | unchanged | REQ-R08 |
| `POST` (changed) / `facilities.internal_bookings.create` | `/api/facilities/internal-bookings` | unchanged | unchanged | a past start is accepted for the club-wide grant (DD-R17); no supersession and no e-mail for it | 422 `booking_start_past` (others), `booking_too_old` | REQ-R10 |
| `POST` (unchanged) | `/api/facilities/logs`, `/api/facilities/incidents` | unchanged | unchanged (a past day or moment is already accepted; a log after its edit window by the club-wide grant only) | an incident with `entry_ban_requested` now raises the notice | unchanged | REQ-R10, REQ-R14 |
| `POST` (extended) | `/api/facilities/public/requests/verify` | unchanged | unchanged | + `summary: { placeName, placeSlug, startsAt, endsAt, units, renterDisplayName, contactName, contactEmail, amount, payeeName }`, returned once, on the successful confirmation | 409 `slot_unavailable` carries `placeSlug`; 410 carries no data | REQ-R16 |
| `POST` (new) | `/api/facilities/public/rentals/cancel/preview` | no auth; rate limit per IP in `metadata`; scope from the link record | `{ token }` in the body | `{ placeName, startsAt, endsAt, amount, free: boolean, cancellationDeadline, payeeName }` — no contact data | 410, 429 | REQ-R17 |
| `POST` (new) / `facilities.rentals.cancel` (actor: renter) | `/api/facilities/public/rentals/cancel` | as above; runs without a session like `submit_request` (acting role `system`, `actor: guest` in the log, no payload kept) | `{ token, confirm: true }` | `cancelled_free` or `cancelled_late`; `cancelForSource`; `facilities.rental.cancelled`; the link's `used_at` | 410 (unknown, expired, spent, rental not cancellable), 429 | REQ-R17 |
| `POST` (changed) | `/api/activities/events` (`activities`) | unchanged | unchanged | unchanged | new 409 `place_closed` with `opening: [{ from, to }]` when the event has a `placeId` and lies outside the opening windows | REQ-R19 |
| DI (extended) | `clubCoreDirectory.placeOptions`; `clubCoreDirectory.searchInstitutions(scope, query, limit)` (new); `clubCoreContracts.facilityAgreement(scope, institutionId, on) → { paymentDeadlineDays, autoExpireUnpaid } \| null` (new) | called by `facilities` | as typed | additive | throw → the caller's 5xx; no agreement → defaults | REQ-R01, REQ-R07, REQ-R14 |
| DI (extended) | `activities.placeSessions`: `PlaceSessionEntry` gains `groupName`, `sectionId`, `coachPersonId` | called by `facilities` | — | additive | — | REQ-R13, REQ-R18 |
| DI (consumed; registered by the payments parity spec, REQ-C01) | `payments.chargeService`: `createForSource(em, { …, payeeInstitutionId, payerInstitutionId?, payerPersonId?, payerDisplayName?, amount, dueDate, description }, ctx)`, `cancelForSource`, `statusOf(chargeIds, ctx) → Map<chargeId, status>` | called by `facilities` only when registered (`hasRegistration`) | the type in `facilities/services/charges.ts` gains `payerDisplayName` and `statusOf`; no other change to DD-19 | — | a throw from create rolls the rental back; `statusOf` omits unknown ids | REQ-R06, REQ-R11 |
| `GET` (changed) | `/api/facilities/reports/owner` | unchanged | unchanged | + `owner: { institutionId, name } \| null`; payments carry `source: 'charges' \| 'rental_register' \| 'mixed'`: a rental with a charge counts its amount when the charge is `paid`; a rental without a charge counts from the register as today; + `partiallyPaidCount` (charges `partially_paid`, not in the sum) | unchanged | REQ-R11 |
| `POST/PUT` (changed) | `/api/club_core/contracts` (`club_core`) | unchanged (`club_core.manage`) | for `facility_management`: `terms: { paymentDeadlineDays?, autoExpireUnpaid? }` | unchanged | 422 `contract_terms_invalid` | REQ-R07 |

Stable-contract notes: the DI extensions of `club_core` and `activities` and every response field are additive (`BACKWARD_COMPATIBILITY.md`). The charge contract is the one the payments parity spec registers (DD-C01); this spec adds no method to it. `statusOf` returns a status and no amount, so the report sums whole rental amounts of paid charges and only counts the partly paid ones (Q-R01).

## Events, Jobs, Notifications, and Cross-Module Flows

| Trigger | Producer | Consumer | Side effect | Retry / idempotency / audit behavior |
|---|---|---|---|---|
| `facilities.rental.requested` (staff entry) and `facilities.rental.approved` | `facilities` | `facilities` subscriber → foundation `dispatch` | Summary e-mail to `contact_email` (place, slot, amount, payee and account, payment and cancellation deadlines, rules) with the cancellation link; the approval e-mail of #125 gains the link | persistent subscriber; key `facilities:rental:<rentalId>:summary`; no address → nothing sent, noted on the rental page |
| `facilities.rental.moved` / `facilities.rental.cancelled` | `facilities` | `facilities` subscriber → `dispatch` | E-mail to the renter: new slot (with a re-issued link) or the cancellation with its outcome (free, late, unpaid after the deadline) | keys `facilities:rental-moved:<eventId>`, `facilities:rental:<rentalId>:<status>` (base spec *Events*) |
| `payments.payment.recorded` | `payments` | `facilities` subscriber, always present, a no-op without `payments.chargeService` | `facilities.rentals.confirm_paid` | `advanceWhere`; repeat-safe |
| `payments.payment.reversed` | `payments` | none in `facilities` | the rental stays `confirmed`; its charge state, read live through `statusOf`, shows `open` (or `partially_paid`) again on the list and both rental pages (*Payment reversed*) | nothing to retry |
| `facilities.closure.created\|updated`, `facilities.maintenance.scheduled` after `flagUnderWindow` | `facilities` (`services/reschedule.ts`) | foundation `dispatch` | `facilities.reschedule_needed` (in-app and e-mail): sessions → the coordinators of the session's section on that day and the session's coach; club bookings → the booker; rentals → the club administrators, plus an e-mail to the renter | post-commit; one message per person and cause; key `facilities:reschedule:<causeId>:<updatedAt ms>:<personId>` (renter: `…:<rentalId>`); only newly flagged entries are listed |
| `facilities.incident.created\|updated` with `entry_ban_requested` newly set | `facilities` | `dispatch` | `facilities.entry_ban_requested` to the club administrators, link to the Incidents tab filtered to open requests | key `facilities:ban-request:<incidentId>` |
| scheduler `facilities:rental-lifecycle` (every 15 min, exists) | `facilities` | `facilities` | as today, plus automatic expiry of unpaid rentals (DD-R11) | `advanceWhere`; CLI `facilities rental-lifecycle [--now]` |
| scheduler `facilities:maintenance-reminders` (exists) | `facilities` | `notifications` | unchanged, but the notification links to `/club/places/maintenance` for a maintainer and to the Maintenance tab for an administrator | unchanged keys |

No new job and no new scheduler entry. The reschedule notice does not replace the notices of the groups and activities spec: that spec tells guardians when a session is moved or cancelled; this one tells staff that an entry must be moved and why. Without `payments` the payment subscriber still exists but returns at once, because `payments.chargeService` is not registered, and nothing else changes.

## Security, Privacy, and Compliance

- **Authorization:** feature gates and grants as listed; no role-name checks. The two option routes filter by the caller's facilities scope before matching, so a search never returns a place or a renter outside it. The member rental pages use the same routes as the panel and add no access.
- **Tenant isolation:** every signed-in read and write takes `tenantId` and `organizationId` from the context. The DI additions take the scope as an argument. The public cancellation resolves the scope from the link's token hash (one index-backed lookup) and fails closed with 410.
- **Sensitive data:**
  - Renter contact data stays encrypted at rest. It is returned by the calendar and "today" only under DD-R18, by the rental routes only within the rental scope, and never by a public route: the cancellation preview shows the slot and the amount, the confirmation summary shows the organisation, the contact name and the e-mail to the person who proved that address, once.
  - The renter search for an attendant reads no row of `people` (DD-R07); institution results carry the name and type only.
  - The cancellation token follows DD-44: hash at rest, raw value only in the delivery secret, the e-mail and the request body; the page is served with `Referrer-Policy: no-referrer`.
  - A reschedule or ban-request message names the place, the time and the kind of cause; it carries no renter contact and no incident description.
- **Abuse and failure modes:**
  - **Enumeration:** unknown or foreign ids answer 404 or an empty list; the public cancellation answers 410 for every failure.
  - **Replay:** a spent link answers 410; a repeated payment event advances nothing.
  - **Concurrency:** rental and booking writes keep the occupancy lock (DD-43); the correction command uses the optimistic version; "Confirm payment" and the payment subscriber both go through `advanceWhere`.
  - **Destructive action:** a renter's cancellation after the deadline forfeits the amount; the page states it before the confirm button, and the preview and the cancel are separate requests.
  - **Size:** the renter search reads at most 500 rental rows and returns 20; the calendar window stays at 31 days.

## Integration Coverage

Tests are self-contained and live in `packages/app/.ai/qa/tests/` (run by `yarn test:integration:vereino --filter <TEST-ID>`), unit tests beside the `lib` files. "Phone" means a 375 px viewport, both locales, light and dark, console without errors. TEST-R08 runs against the charge service of the payments parity spec (REQ-C01) and hides the token `payments.chargeService` for its "without" half, the way the messaging probe hides tokens (`packages/app/.ai/qa/tests/_fixtures/messaging-probe/probe.mjs`).

| Test ID | Level | Setup / fixture | Actions | Assertions | Requirement IDs |
|---|---|---|---|---|---|
| TEST-R01 | unit | `facilities/lib/day-axis.ts`, `lib/rentals.ts`, `lib/internal-bookings.ts`, `club_core/lib/contracts.ts` | axis bounds for a day with a 06:00 opening and a 23:00 entry; lanes for three overlapping entries; free open hours on today, a past day and a closed day; `paymentDeadline` with 0, 5 and no agreement; the expiry predicate; `parseFacilityTerms`; the 92-day rule | exact values; 100 % line, branch and function coverage | REQ-R01, REQ-R07, REQ-R10 |
| TEST-R02 | integration | a complex with two leaf pitches, an external hall; an administrator, a coach, an attendant of one pitch, a maintainer; a session with a coach, a booking, a rental with a contact, a held request, a closure, a maintenance window | `GET /api/facilities/options/places` and `GET /api/facilities/calendar` (with and without `placeId`) as each | place facts and scope per role; every entry kind with `placeName`, `groupName`, `coachName`, `status`; `contact` only for the administrator and the attendant on their pitch; null new fields for the maintainer | REQ-R01, REQ-R12, REQ-R14 |
| TEST-R03 | UI | the TEST-R02 club; desktop and phone | open B-23 without parameters; switch place and day; reload; back; "Other day"; a closed day; a 06:00 entry; "Do przeniesienia"; open and collapse the availability card; follow the links to the zones tab and the place form | the address holds place and day and restores them; all kinds drawn and listed in "Wpisy dnia"; parallel entries side by side; the axis widens; the card states the online mode and lists regulation windows; axe clean | REQ-R01, REQ-R03 |
| TEST-R04 | integration + UI | a bookable zone, rates, a group of the coach, a held request, a session | from B-23: tap a free hour as the administrator and save a rental, a group event and a general booking; tap a taken slot; a rental in a non-bookable zone | three writes with the right kinds; `purpose` and `notes` stored; 409 list with names; `zone_not_reservable` at the start field; the toast names the superseded request | REQ-R02 |
| TEST-R05 | integration + security | institutions; rentals of two renters on two pitches; persons in the register; an attendant of pitch A | `GET /api/facilities/renters` as the attendant and as the administrator | attendant: institutions by name and only the renters of pitch A, no person who never rented, last contact present; administrator: persons too; under 2 characters → 400 | REQ-R14 |
| TEST-R06 | integration | a `requested` unregistered rental; a banned institution; a `done` rental | `PUT /api/facilities/rentals`: contact, purpose, notes; assign an institution; assign the banned one; stale version; edit the done rental; undo | fields saved and audit entry; `renterType` and name updated; 409 `entry_ban_active`; 409 conflict; 409 `rental_closed` (notes still accepted); undo restores the fields | REQ-R05 |
| TEST-R07 | UI | rentals in every status, one flagged, one unpaid past its deadline, one pending | B-24: each tab and perspective, reload; "Decyzja"; open a row; edit on the rental page; the actions from the page | the address holds tab and view; the link opens B-25; the page shows every saved field; the edit and each action update the page | REQ-R04, REQ-R05 |
| TEST-R08 | integration | `payments` enabled; a place whose parent has an owner institution; a registered and an unregistered renter | enter both rentals and approve a request; confirm directly; record a partial and then the full payment on the charge; replay the payment event; reverse the payment of the confirmed rental; move a rental with a charge and one without; cancel before and after the deadline; a rental with no payer of any kind; then the same flow with the token hidden; the owner report in both cases and with one rental of each kind | the charge has the owner as payee, the renter or `payerDisplayName` as payer, the `charge.rentalDesc` description and the deadline as due date; the direct confirm answers 409 `rental_awaits_payment`; the rental is confirmed once, only after the full payment; after the reversal the rental is still `confirmed` and its `chargeState` is `open`; the moved rental with a charge keeps its amount and `payment_deadline` (equal to the charge's due date), the one without keeps its amount and gets a new deadline; the charge is cancelled or forfeited; a refused charge leaves no rental; without the service confirm is status-only and `chargeState` is `none`; report `source` is `charges`, `rental_register`, `mixed`, with `partiallyPaidCount` | REQ-R06, REQ-R11 |
| TEST-R09 | integration | an owner institution with a `facility_management` contract (5 days, expiry on); a second owner without a contract; `payments` enabled for the partly paid case | save invalid terms; enter rentals on both owners' places, plus a second rental on the first owner's place and record a partial payment on its charge; pass the deadline; `facilities rental-lifecycle --now` twice; list `view=unpaid` | 422 `contract_terms_invalid`; deadlines of 5 and 3 days; the first rental `cancelled_free` with the reason and one e-mail, once; the partly paid rental still `requested`, its charge untouched, on the unpaid list; the second owner's rental on the unpaid list | REQ-R07 |
| TEST-R10 | UI | three held requests: clean, colliding with a session, matching a ban | B-25 at desktop and 768 px: read the cards; approve the clean one; reject one; decide a card whose hold lapsed | every fact and badge of REQ-R08; the collision named; the approval intro names the owner; the lapsed card removed with a message; axe clean | REQ-R08 |
| TEST-R11 | integration + UI | an administrator, a coach, an attendant; a log window that has closed; an incident with a ban request | zones tab: "Ustaw dostępność do rezerwacji"; add a log entry for last week as the administrator and as the attendant; report an incident from the panel; "Wydaj zakaz" from the incident; a club booking yesterday as the administrator, as the coach, and 100 days back | columns as the mockup; the availability saved; log created / 403 `log_edit_closed`; incident created; the ban carries `incident_id` and the request closes; 201 / 422 `booking_start_past` / 422 `booking_too_old`; no supersession for the past booking | REQ-R09, REQ-R10 |
| TEST-R12 | UI (phone) | the TEST-R02 club; a coach with a team | `/club/places`; open a pitch; pick a day chip; tap a free hour; save a tournament; tap the new entry; cancel an own general booking | only the two leaf pitches, with kind, surface and the family's count; the dialog opens on the first tap with "Dla grupy" and 90 minutes; the entry on the axis and in "Wpisy dnia"; details sheet; confirmation before the cancel; no sideways page scroll | REQ-R12, REQ-R02 |
| TEST-R13 | UI (phone) | an attendant of the pitch; a session with a coach and a rental with a contact today; a regular renter | sign in; Today tab; open the facility; headcount; "Nie stawił się" before the start; Places → pitch → tap an hour → rental with the renter found by search; Rentals tab → the rental page → correct the contact, confirm, cancel; report an incident with a ban request; fail a photo and add it again; sign in as a second attendant whose grant names no active place | rows show sub-place, group, coach and the `tel:` link; headcount only after opening; the too-early message; the rental saved with the quote; actions work from the phone; the administrators' notification exists; the photo is attached on the second try; the second attendant sees the "no facility assigned" state and no tabs | REQ-R13, REQ-R14 |
| TEST-R14 | security | two tenants; an attendant of pitch A; a coach; a maintainer | as the attendant: options, renters, calendar, rental read, update and actions for pitch B; as the coach: read a rental's contact; as the maintainer: the calendar; the public cancellation preview; the other tenant's ids everywhere | 403 `scope_denied` or empty; no contact for the coach; redaction intact; the preview holds no contact data; no cross-tenant row | REQ-R14, REQ-R17 |
| TEST-R15 | UI (phone) | a maintainer of the pitch with a due task and a usage task at its threshold | open the reminder link; plan a window from the axis; complete a task | the list shows only the pitch's tasks; the window appears and flags the session under it; the next instance is created; the hall answers 403 | REQ-R15 |
| TEST-R16 | UI (phone and desktop) | a club page with public places, online requests on and off; a request link | P-03 in both modes and disabled; P-04 on a phone mid-month; submit and confirm a request; confirm when the slot was taken; reopen the used link | the intro and badge per mode; the disabled state with the phone; the notice with the owner; the list starts today with "Pokaż wcześniejsze dni"; the summary once; "Wróć do kalendarza" opens that place; 410 without data; the club's frame on all three | REQ-R16 |
| TEST-R17 | integration + UI | a rental with an e-mail address, `payments` enabled, the mail sink | enter; move; open the link before the deadline and cancel; a second rental cancelled through the link after the deadline; open a spent link and one after the start; search events, jobs and logs for the token | summary, moved and cancelled e-mails with the right content and a fresh link after the move; `cancelled_free` / `cancelled_late` with the charge outcome; 410 twice; the token appears only in the delivery secret | REQ-R17 |
| TEST-R18 | integration | two sessions of one section with a coach, a club booking, a rental with an e-mail, under one future window | add a closure; save it again unchanged; plan maintenance over the same entries; list `view=to_move` | one notification and e-mail per coordinator and coach naming both sessions, one for the booker, one for the administrators, one renter e-mail; nothing on the unchanged save; a second cause sends its own; the lists hold the entries | REQ-R18 |
| TEST-R19 | integration | a pitch open 08:00–22:00; a hall without hours; a generated weekly series at 07:00 | `POST /api/activities/events` at 07:00–09:00, at 09:00–11:00, on the hall at 06:00, and with a typed-in venue; regenerate the series | 409 `place_closed` with the windows; 201; 201; 201; the series still generates. The typed-in-venue case needs REQ-A08 of the groups and activities parity spec (the typed-in venue on the same command); until that is built it is skipped with a reference to REQ-A08 and runs in the pull request that lands second | REQ-R19 |
| TEST-R20 | UI | the TEST-R02 club with entries today on both pitches and the hall, and a second club without entries | the dashboard as the administrator, the coordinator and the attendant of one pitch; the second club's administrator | administrator and coordinator: today's entries on the club's places by start with the "more" line; attendant: only the entries of the assigned pitch; the empty text; the click opens B-23 for that place | REQ-R20 |

## Implementation Phases

Phases are dependency-ordered and each is one pull request. Validation for every phase: `yarn verify`, the phase's integration tests, and — where a migration is named — the SQL review from `yarn db:generate` (no `yarn db:migrate` without approval). Every phase ships its `en` and `pl` texts and is checked in the browser in both locales, in light and dark mode, at 375 px for member and public pages.

### Phase 1 — Place and calendar reads

- **Depends on:** none
- **Outcome:** every facilities picker and list reads places from the module's own source; the member list shows the bookable places with kind, surface and the family's count; the attendant's pickers are no longer empty.
- **Why this order / value delivered:** every later screen needs these fields; it removes the attendant's first dead end.
- **Deliverables:** `club_core/services/directory.ts` (`placeOptions` fields); `activities/services/place-sessions.ts` (three fields); `facilities/api/options/places/route.ts`; `services/calendar.ts`, `services/today.ts` and their routes (new fields, DD-R18); `components/facilities-client.ts` (`usePlaceOptions` on the new route; `tolerantPlaceOptions` removed, errors shown); `club-places/ClubPlacesPage.tsx`.
- **Independent slices / estimated commits:** (a) the DI additions: 1; (b) the routes: 1; (c) the list page and pickers: 1.
- **Requirements closed:** none alone (parts of REQ-R01, REQ-R12, REQ-R13, REQ-R14)
- **Tests:** TEST-R02; TEST-R12 (list part)
- **Exit gate:** as the attendant, the place selectors of the log and incident dialogs list the assigned places; `/club/places` shows only leaf, non-external places.

### Phase 2 — The day axis in the panel (B-23)

- **Depends on:** Phase 1
- **Outcome:** J-R02 steps 1–2: the administrator sees the whole day.
- **Why this order / value delivered:** the largest gap of the audit; the component is reused by phases 4 and 9.
- **Deliverables:** `facilities/lib/day-axis.ts` with tests; `components/day-axis/DayAxis.tsx`, `DayEntries.tsx`, `DayChips.tsx`; `FacilityCalendar.tsx` rewritten around them (place chips, address state, availability card as `details`, links, the filter); `WeekZonePreview.tsx` kept for the zones tab.
- **Independent slices / estimated commits:** (a) the pure layout: 1; (b) the components: 1–2; (c) the page: 1.
- **Requirements closed:** REQ-R01, REQ-R03
- **Tests:** TEST-R01 (axis part), TEST-R03
- **Exit gate:** J-R02 steps 1–2 in the browser at desktop and 375 px; axe clean; the address restores the view.

### Phase 3 — The slot dialog and the renter search

- **Depends on:** Phase 2
- **Outcome:** a tap on a free hour of B-23 saves a rental, a group event or a club booking.
- **Why this order / value delivered:** restores "New rental" from the calendar for every open hour and adds the club kinds to the panel.
- **Deliverables:** `components/slot/SlotDialog.tsx` composing `BookDialog` and `RentalDialog` bodies; `api/renters/route.ts` with `services/renters.ts` and `lib/renters.ts` (matching, tested); `club_core/services/directory.ts` (`searchInstitutions`); `commands/rentals.ts` (labelled conflicts); the B-24 "Nowy wynajem" button opening the same dialog.
- **Independent slices / estimated commits:** (a) the renter route: 1; (b) the dialog: 2.
- **Requirements closed:** REQ-R02
- **Tests:** TEST-R04, TEST-R05
- **Exit gate:** the three kinds saved from B-23; a collision listed by name.

### Phase 4 — The member day page (M-11)

- **Depends on:** Phase 3
- **Outcome:** J-R03 end to end on a phone.
- **Why this order / value delivered:** the booking path of every coach and coordinator; one tap instead of three steps.
- **Deliverables:** `club-places/ClubPlacePage.tsx` on `DayAxis`, `DayChips`, `SlotDialog`; the entry details sheet; the range box and `PlaceTimeline.tsx` removed.
- **Independent slices / estimated commits:** 2
- **Requirements closed:** REQ-R12
- **Tests:** TEST-R12
- **Exit gate:** J-R03 at 375 px in both locales and modes; no sideways page scroll with four parallel entries.

### Phase 5 — The rental as a record (B-24)

- **Depends on:** Phase 1
- **Outcome:** a rental can be opened and corrected; the list matches the mockup.
- **Why this order / value delivered:** needed by the attendant's pages (phase 8) and by every later rental message.
- **Deliverables:** `commands/rentals.ts` (`facilities.rentals.update`), `api/rentals/route.ts` (`PUT`, query additions, new item fields incl. `payee` from `placePayee`); `backend/facilities/rentals/[id]/page.tsx` with `components/RentalRecord.tsx`; `RentalsTable.tsx` (address state, columns, visible actions, "Decyzja", perspectives).
- **Independent slices / estimated commits:** (a) the command and route: 1; (b) the page: 1; (c) the list: 1.
- **Requirements closed:** REQ-R04, REQ-R05
- **Tests:** TEST-R06, TEST-R07
- **Exit gate:** a purpose entered in the dialog is visible on the rental page and can be changed.

### Phase 6 — Request cards (B-25)

- **Depends on:** Phase 1
- **Outcome:** J-R02 steps 3–5.
- **Why this order / value delivered:** the administrator decides within 48 hours on complete facts.
- **Deliverables:** `services/request-queue.ts` (labels, payee, the two timestamps); `components/RequestsQueue.tsx` as cards; the approval dialog's intro.
- **Independent slices / estimated commits:** 2
- **Requirements closed:** REQ-R08
- **Tests:** TEST-R10
- **Exit gate:** the three fixture cards read as the wireframe.

### Phase 7 — The contents of the B-26 and B-27 tabs, and entries from the panel

- **Depends on:** none for the contents (the existing routes stay the tabs' addresses); the final layout needs the navigation spec's phase 2 (the B-26 and B-27 tab shells)
- **Outcome:** the tabs show the mockup's columns and actions; the administrator adds a log entry, an incident and a past club booking, and issues a requested ban.
- **Why this order / value delivered:** removes the "members' pages only" dead end for records the owner report depends on.
- **Deliverables:** `ZonesTable.tsx` (toolbar with `AvailabilityDialog`), `ClosuresTable.tsx`, `RatesTable.tsx`, `LogsTable.tsx` and `IncidentsTable.tsx` (create dialogs reusing `club-facility/FacilityDialogs.tsx`, the request filter, "Wydaj zakaz"), `BansTable.tsx` (prefill); `commands/internal-bookings.ts` and `lib/internal-bookings.ts` (DD-R17); B-23's past-day rule.
- **Independent slices / estimated commits:** (a) B-26: 1; (b) B-27: 2; (c) the past booking: 1.
- **Requirements closed:** REQ-R09, REQ-R10
- **Tests:** TEST-R11, TEST-R01 (92-day rule)
- **Exit gate:** each tab compared with `screenZones` and `screenLogs`; a log entry for last week saved by the administrator.

### Phase 8 — The attendant on the phone (M-12)

- **Depends on:** Phases 3, 4 and 5; the navigation spec's phases 4–5 (the "More" entry and the attendant's landing on `/club/facility`, REQ-N08)
- **Outcome:** J-R01 and J-R08 end to end on a phone with the role's four features.
- **Why this order / value delivered:** D-029 for the role that has no working path today.
- **Deliverables:** `club-facility/ClubFacilityPage.tsx` (tabs, rows, today's incidents with photo retry, the renter picker and ban request in the incident dialog, the "no facility assigned" empty state); `frontend/club/facility/rentals/[id]/page.tsx` reusing `RentalRecord`; the `facilities.entry_ban_requested` notification type and its dispatch; the catalogue wording of the glossary.
- **Independent slices / estimated commits:** (a) Today rows: 1; (b) rentals tab and page: 1–2; (c) the ban request: 1.
- **Requirements closed:** REQ-R13, REQ-R14
- **Tests:** TEST-R13, TEST-R14
- **Exit gate:** J-R01 and J-R08 at 375 px in both locales and modes, signed in as a user who holds only `vereino_facility_operator`.

### Phase 9 — The maintainer's page

- **Depends on:** Phase 4
- **Outcome:** J-R07.
- **Why this order / value delivered:** D-029 for the last staff role with a panel-only list.
- **Deliverables:** `frontend/club/places/maintenance/page.tsx` with `components/club-places/MaintenanceList.tsx` over `maintenance-client.ts`; the notification link in `notifications.ts` by recipient; the link on `/club/places`.
- **Independent slices / estimated commits:** 1–2
- **Requirements closed:** REQ-R15
- **Tests:** TEST-R15
- **Exit gate:** J-R07 at 375 px.

### Phase 10 — The management agreement's terms

- **Depends on:** Phase 5 (the unpaid perspective)
- **Outcome:** the payment deadline follows the agreement; unpaid rentals are listed or expire.
- **Why this order / value delivered:** replaces a constant with the owner's rule before charges carry due dates.
- **Deliverables:** `club_core/lib/contracts.ts` (`parseFacilityTerms`, validation), `commands` and `ContractForm.tsx` (the terms group), `services/contracts.ts` (`facilityAgreement`); `facilities/services/rental-slot.ts` and `lib/rentals.ts` (deadline from the agreement); `commands/rentals.ts` (`advance_lifecycle` expiry).
- **Independent slices / estimated commits:** (a) `club_core`: 1; (b) `facilities`: 1–2.
- **Requirements closed:** REQ-R07
- **Tests:** TEST-R09, TEST-R01 (deadline part)
- **Exit gate:** a 5-day agreement changes the quote's "wpłata do"; the CLI run cancels an unpaid rental once.

### Phase 11 — The rental charge

- **Depends on:** phase 1 of the payments parity spec (E12-S01: it registers `payments.chargeService` with `statusOf`, REQ-C01, and ships that spec's charge-column migration — `payer_institution_id`, `payee_institution_id`, `payer_label` — which needs its own approval in that spec) and its B-22 "Record payment"; Phases 5 and 10 of this spec (the charge state on the rental, the due date from the agreement). The story (#285) is conditional on that phase
- **Outcome:** J-R04 with a charge; the owner report counts payments from charges.
- **Why this order / value delivered:** closes AC-013 and AC-024 of the facilities spec.
- **Deliverables:** `commands/rentals.ts` and `commands/requests.ts` (`payeeInstitutionId` from `placePayee`, `payerDisplayName`, the `charge.rentalDesc` description, the 409 `rental_awaits_payment`); `subscribers/payment-recorded.ts` (always present, a no-op without the service) and `facilities.rentals.confirm_paid`; the `move` command keeping `payment_deadline` for a rental with a charge; `services/charges.ts` (the consumer type gains `statusOf` and `payerDisplayName`); the charge state and the link to the charge on the list and both rental pages; `services/owner-report.ts` and `OwnerReport.tsx` (owner, source).
- **Independent slices / estimated commits:** (a) create and cancel: 1; (b) confirm and the subscriber: 1; (c) the report: 1.
- **Requirements closed:** REQ-R06, REQ-R11
- **Tests:** TEST-R08
- **Exit gate:** with the service, a confirmed rental has a paid charge whose payee is the owner; with the token hidden, every screen behaves as before and says "rental register".

### Phase 12 — The renter's e-mails and cancellation link

- **Depends on:** Phases 5 and 10; the `facilities_rental_links` migration and the sessionless cancel routes were approved on 2026-11-16 ([#253](https://github.com/wladku/Vereino/issues/253#issuecomment-6910005145), Ask First items 1 and 2); the migration's SQL from `yarn db:generate` is shown in the pull request before it is applied
- **Outcome:** J-R06; a renter entered by staff is informed.
- **Why this order / value delivered:** the facilities spec promised these e-mails in J-005; the link takes cancellations off the attendant's phone.
- **Deliverables:** the link entity (`ScopedEntityBase` + `tokenLinkColumns({ use: 'single' })`, column `purpose`) and its migration; the `AGENTS.md` exception line extended by "rental cancellation links" (the sessionless lookup of `facilities_rental_links.token_hash`, approved 2026-11-16); `services/rental-links.ts` over `createTokenLinkService`; templates `rentalSummary`, `rentalMoved`, `rentalCancelled` in `emails/templates.ts`; subscribers; `api/public/rentals/cancel/route.ts` and `…/preview/route.ts`; `frontend/p/[clubSlug]/rentals/cancel/[token]/page.tsx`; the `no-referrer` header rule in `next.config.ts`.
- **Independent slices / estimated commits:** (a) the e-mails: 1–2; (b) the link and page: 2.
- **Requirements closed:** REQ-R17
- **Tests:** TEST-R17, TEST-R14 (preview part)
- **Exit gate:** J-R06 in the browser; the token found nowhere but the delivery secret.

### Phase 13 — Reschedule notices to staff

- **Depends on:** Phase 1 (session fields). Not blocked by the groups and activities spec: the notice's link for a coordinator and a coach targets that spec's "Needs a new time" view (REQ-A05, REQ-A10) once it is built; until then — and as the permanent fallback when the view is not available — the link opens the place's day on M-11 (`/club/places/[placeId]?date=`), filtered "Do przeniesienia". AC-R14 records the fallback
- **Outcome:** J-R05.
- **Why this order / value delivered:** a flag nobody hears of is not acted on; the base spec's Events rows promised it.
- **Deliverables:** `services/reschedule.ts` (collect the newly flagged entries and their people), `services/reschedule-notice.ts`, the `facilities.reschedule_needed` type in `notifications.ts`, the template and the renter e-mail.
- **Independent slices / estimated commits:** 2
- **Requirements closed:** REQ-R18
- **Tests:** TEST-R18
- **Exit gate:** one closure over four entries produces exactly the messages of J-R05 step 2.

### Phase 14 — Opening hours for a group event

- **Depends on:** none for the check itself; the groups and activities spec changes the same command for the typed-in venue (REQ-A08, D-031 §6). This phase (#288) lands after REQ-A08 or rebases on it, and TEST-R19's typed-in-venue case needs REQ-A08 (skipped with a reference until it is built)
- **Outcome:** J-R03 step 4's first failure.
- **Why this order / value delivered:** makes J-006 step 3 of the facilities spec true.
- **Deliverables:** `activities/commands` (the one-off event), `activities/lib/error-codes.ts` (`place_closed`), a pure check in `activities/lib/` with tests; the dialog's field message.
- **Independent slices / estimated commits:** 1
- **Requirements closed:** REQ-R19
- **Tests:** TEST-R19
- **Exit gate:** the 07:00 event is refused with the day's hours; the weekly series still generates.

### Phase 15 — The public pages (P-03, P-04, P-05)

- **Depends on:** the navigation spec's phase 7 (the public header); the page contents can be built before it
- **Outcome:** the three pages match the mockup inside the club's frame.
- **Why this order / value delivered:** the renter's first contact with the club.
- **Deliverables:** `components/public/PublicPlacesView.tsx`, `PublicScheduleView.tsx`, `RequestVerifyView.tsx`, `PublicFacilitiesFrame.tsx` (the club passed in every state); `services/requests.ts` (the verify summary); the places read (surface, address, mode).
- **Independent slices / estimated commits:** 2
- **Requirements closed:** REQ-R16
- **Tests:** TEST-R16
- **Exit gate:** the request path of README F-08 at 375 px in both locales.

### Phase 16 — The dashboard widget

- **Depends on:** Phase 1; the navigation spec's phase 6 (the dashboard frame and `dashboards.view` for the coordinator and the attendant) and its widget table (widget 8)
- **Outcome:** the administrator's, coordinator's and attendant's dashboards start with the facility's entries in their scope (administrator and coordinator: the club's places; attendant: the assigned places).
- **Why this order / value delivered:** the last widget of README B-01 that `facilities` owns.
- **Deliverables:** `widgets/dashboard/today-at-facility/widget.ts` and `widget.client.tsx`; its default placement in `setup.ts`.
- **Independent slices / estimated commits:** 1
- **Requirements closed:** REQ-R20
- **Tests:** TEST-R20
- **Exit gate:** the widget beside "Zgłoszenia do akceptacji" in both modes; the attendant's widget lists only the assigned places.

## Requirement Traceability

| Requirement | Journey / surface | Data/API/event contracts | Phase | Tests | Acceptance criterion |
|---|---|---|---|---|---|
| REQ-R01 | J-R02, B-23 | `GET /api/facilities/options/places`, `GET /api/facilities/calendar` (fields), `lib/day-axis.ts` | 1, 2 | TEST-R01, TEST-R02, TEST-R03 | AC-R01 |
| REQ-R02 | J-R01, J-R03, `SlotDialog` | `GET /api/facilities/renters`, rentals, events and internal-bookings routes; labelled `conflicts[]` | 3 | TEST-R04, TEST-R12 | AC-R02 |
| REQ-R03 | J-R02, B-23 card, B-26, B-06 | `POST /api/facilities/zone-rules/bulk` (unchanged), `acceptsOnlineRequests` | 2 | TEST-R03 | AC-R01 |
| REQ-R04 | B-24 | `GET /api/facilities/rentals` (`view`, fields) | 5 | TEST-R07 | AC-R03 |
| REQ-R05 | B-24 rental page | `facilities.rentals.update`, `PUT /api/facilities/rentals` | 5 | TEST-R06, TEST-R07 | AC-R03 |
| REQ-R06 | J-R04, B-24, B-25, both rental pages | `payments.chargeService` (DD-19 as registered by REQ-C01), `facilities.rentals.confirm_paid`, 409 `rental_awaits_payment`, `payee`, `chargeState` | 11 | TEST-R08 | AC-R04 |
| REQ-R07 | J-R04, contract form, B-24 "unpaid" | `club_core_contracts.terms`, `clubCoreContracts.facilityAgreement`, `advance_lifecycle` | 10 | TEST-R01, TEST-R09 | AC-R05 |
| REQ-R08 | J-R02, B-25 | `GET /api/facilities/rentals/requests` (fields) | 6 | TEST-R10 | AC-R06 |
| REQ-R09 | B-26 tabs | existing CRUD routes | 7 | TEST-R11 | AC-R07 |
| REQ-R10 | J-R08, B-27 tabs, B-23 past day | logs, incidents, entry-bans routes; `facilities.internal_bookings.create` (past start) | 7 | TEST-R01, TEST-R11 | AC-R07 |
| REQ-R11 | B-28 | `GET /api/facilities/reports/owner` (`owner`, `source`) | 11 | TEST-R08 | AC-R04 |
| REQ-R12 | J-R03, M-11 | calendar read, `DayAxis`, `SlotDialog` | 1, 4 | TEST-R02, TEST-R12 | AC-R08 |
| REQ-R13 | J-R01, M-12 Today | `GET /api/facilities/today` (fields) | 1, 8 | TEST-R13 | AC-R09 |
| REQ-R14 | J-R01, J-R08, M-11, M-12 Rentals, `/club/facility/rentals/[id]` | options and renters routes, rental routes, `facilities.entry_ban_requested` | 1, 3, 8 | TEST-R05, TEST-R13, TEST-R14 | AC-R09, AC-R10 |
| REQ-R15 | J-R07, `/club/places/maintenance` | maintenance routes (unchanged), notification link | 9 | TEST-R15 | AC-R11 |
| REQ-R16 | P-03, P-04, P-05 | verify response `summary`, places read | 15 | TEST-R16 | AC-R12 |
| REQ-R17 | J-R06, `/p/[clubSlug]/rentals/cancel/[token]` | `facilities_rental_links`, public cancel routes, three templates | 12 | TEST-R14, TEST-R17 | AC-R13 |
| REQ-R18 | J-R05 | `facilities.reschedule_needed`, `activities.placeSessions` fields, `view=to_move` | 13 | TEST-R18 | AC-R14 |
| REQ-R19 | J-R03 | `POST /api/activities/events` → 409 `place_closed` | 14 | TEST-R19 | AC-R15 |
| REQ-R20 | B-01 widget | calendar read | 16 | TEST-R20 | AC-R16 |

**Extension surfaces** (`.ai/guides/spec-delivery.md`). Each added surface is its own row; the reference capability and file come from `src/modules/example/references/surface-inventory.json`, and the implementation starts from the Vereino adaptation named beside it.

| Surface | Requirement | Reference capability and file | Phase | Test | Classification |
|---|---|---|---|---|---|
| Option route `GET /api/facilities/options/places` | REQ-R01, REQ-R14 | `api.option-source-routes`, `src/modules/example/api/tags/route.ts`; adapted as `club_core/api/options/places/route.ts` | 1 | TEST-R02 | emitted-example |
| Option route `GET /api/facilities/renters` | REQ-R14 | `api.option-source-routes`, `src/modules/example/api/assignees/route.ts`; adapted as `facilities/api/internal-bookings/options/route.ts` | 3 | TEST-R05 | emitted-example |
| DI additions `clubCoreDirectory.searchInstitutions`, `clubCoreContracts.facilityAgreement` | REQ-R07, REQ-R14 | `module.di-registration`, `src/modules/example/di.ts`; adapted as `club_core/di.ts` | 3, 10 | TEST-R05, TEST-R09 | emitted-example |
| Command and route `facilities.rentals.update` (`PUT /api/facilities/rentals`) | REQ-R05 | `commands.undo-redo`, `src/modules/example/commands/todos.ts`; adapted as `facilities/commands/closures.ts` | 5 | TEST-R06 | emitted-example |
| Backend page `/backend/facilities/rentals/[id]` | REQ-R05 | `ui.page-shell`, `src/modules/example/backend/todos/page.tsx`; adapted as `people/components/PersonRecord.tsx` | 5 | TEST-R07 | emitted-example |
| Frontend pages `/club/facility/rentals/[id]`, `/club/places/maintenance`, `/p/[clubSlug]/rentals/cancel/[token]` | REQ-R14, REQ-R15, REQ-R17 | `ui.frontend-page`, `src/modules/example/frontend/example.tsx`; adapted as `facilities/frontend/club/facility/page.tsx` and `frontend/p/[clubSlug]/requests/verify/[token]/page.tsx` | 8, 9, 12 | TEST-R13, TEST-R15, TEST-R17 | emitted-example |
| Subscriber to `payments.payment.recorded`; subscribers for the rental e-mails | REQ-R06, REQ-R17 | `events.sync-subscribers`, `src/modules/example/subscribers/audit-delete.ts`; adapted as `facilities/subscribers/request-approved-email.ts` | 11, 12 | TEST-R08, TEST-R17 | emitted-example |
| Notification types `facilities.entry_ban_requested`, `facilities.reschedule_needed` | REQ-R14, REQ-R18 | `notifications.type`, `src/modules/example/notifications.ts`; adapted as `facilities/notifications.ts` | 8, 13 | TEST-R13, TEST-R18 | emitted-example |
| Public routes `…/public/rentals/cancel` and `/preview` | REQ-R17 | `api.custom-route`, `src/modules/example/api/organizations/route.ts`; adapted as `facilities/api/public/requests/verify/route.ts` | 12 | TEST-R17 | emitted-example |
| Entity and migration `facilities_rental_links` | REQ-R17 | `data.entities`, `src/modules/example/data/entities.ts`; adapted as the request link columns of `facilities/data/entities.ts` | 12 | TEST-R17 | emitted-example |
| Dashboard widget `today-at-facility` | REQ-R20 | `ui.dashboard-widget`, `src/modules/example/widgets/dashboard/todos/widget.ts`; adapted as `facilities/widgets/dashboard/requests-awaiting-approval/widget.ts` | 16 | TEST-R20 | emitted-example |

## Rollout, Migration, and Rollback

Rollback follows S14.6: redeploy the previous release; never run `down()`.

**Ask First items** (`AGENTS.md`): all six were approved by the owner on 2026-11-16 ([owner decisions on #253](https://github.com/wladku/Vereino/issues/253#issuecomment-6910005145), answering the [audit](https://github.com/wladku/Vereino/issues/253#issuecomment-6899389065), section (a)). The numbers are the audit's.

| # | Item | Kind | Phase (story) | Compatibility and fallback | Approval |
|---|---|---|---|---|---|
| 1 | Table `facilities_rental_links` (model in *Data Models*, with the audit's (c8) fixes) | migration (`facilities`) | 12 (#286) | Additive; the previous release ignores it. Its SQL is shown in the phase 12 pull request before it is applied | approved 2026-11-16 ([#253](https://github.com/wladku/Vereino/issues/253#issuecomment-6910005145)) |
| 2 | Sessionless public routes `POST /api/facilities/public/rentals/cancel` and `/preview`, the page `/p/[clubSlug]/rentals/cancel/[token]`, and their system-scope token-hash lookup; the matching exception line in `AGENTS.md` | new sessionless lookup (tenancy exception) and API contract (`facilities`) | 12 (#286) | Additive; fails closed with 410 (*Users, Permissions, and Scope*) | approved 2026-11-16 ([#253](https://github.com/wladku/Vereino/issues/253#issuecomment-6910005145)) |
| 3 | `clubCoreDirectory.placeOptions` (`parentId`, `kind`, `surface`, `isExternal`, `acceptsOnlineRequests`); `clubCoreDirectory.searchInstitutions(scope, query, limit)`; `clubCoreContracts.facilityAgreement(scope, institutionId, on)`; the `facility_management` terms shape `{ paymentDeadlineDays, autoExpireUnpaid }` inside the encrypted `terms`; 422 `contract_terms_invalid` on `POST/PUT /api/club_core/contracts` | DI and API contract changes (`club_core`); data shape inside an existing encrypted column | 1 (#275), 3 (#277), 10 (#284) | Additive; no caller breaks; no migration; contracts without terms keep the 3-day default | approved 2026-11-16 ([#253](https://github.com/wladku/Vereino/issues/253#issuecomment-6910005145)) |
| 4 | `activities.placeSessions`: `PlaceSessionEntry` gains `groupName`, `sectionId`, `coachPersonId`; **narrowing:** `POST /api/activities/events` refuses a one-off event outside opening hours (409 `place_closed`) | DI contract change and behaviour change (`activities`) | 1 (#275), 13 (#287), 14 (#288) | Fields additive. The refusal is new; no stored data affected; rollback restores the old acceptance | approved 2026-11-16 ([#253](https://github.com/wladku/Vereino/issues/253#issuecomment-6910005145)) |
| 5 | New routes `GET /api/facilities/options/places` and `GET /api/facilities/renters`; `PUT /api/facilities/rentals`, command `facilities.rentals.update`, event `facilities.rental.updated`, 422 `rental_renter_invalid`; **widening:** `POST /api/facilities/internal-bookings` accepts a past start from the club administrator, with the new 422 `booking_too_old`; notification types `facilities.entry_ban_requested` and `facilities.reschedule_needed`; additive response fields on the calendar, today, rentals, requests, verify and owner-report routes | API, command, event and notification contracts (`facilities`) | 1 (#275), 3 (#277), 5 (#279), 6 (#280), 7 (#281), 8 (#282), 11 (#285), 13 (#287), 15 (#289) | Additive; the widening applies to one grant only, others unchanged | approved 2026-11-16 ([#253](https://github.com/wladku/Vereino/issues/253#issuecomment-6910005145)) |
| 6 | Charge seam (DD-19): the consumer type in `facilities/services/charges.ts` gains `statusOf` and the optional input `payerDisplayName`; **narrowing:** `POST /api/facilities/rentals/{id}/confirm` refuses a rental whose charge is unpaid (409 `rental_awaits_payment`); the subscriber to `payments.payment.recorded`; command `facilities.rentals.confirm_paid` | DD-19 contract use and behaviour change (`facilities`), matching the payments parity spec's DD-C01 | 11 (#285) | Absent service → today's status-only confirm and the register figure; the refusal applies only to rentals that have a charge, and no rental has one today. Also needs the payments spec's own approval of its charge columns (`payer_institution_id`, `payee_institution_id`, `payer_label`) — that approval belongs to spec C | approved 2026-11-16 ([#253](https://github.com/wladku/Vereino/issues/253#issuecomment-6910005145)) |

No new module and no new dependency; none was approved, and none is needed. No feature is added to or removed from a role (DD-R06); `dashboards.view` for the coordinator and the attendant is the navigation spec's grant, not this spec's.

- **Order and cross-spec dependencies.** Each phase ships behind no flag, because it replaces a screen in place. The other parity specs of 2026-11-14 are named by letter: N = navigation and naming (`2026-11-14-vereino-parity-navigation-and-naming.md`, Ready), A = groups and activities (`2026-11-14-vereino-parity-groups-and-activities.md`), C = payments (`2026-11-14-vereino-parity-payments.md`), L = people life cycle and data entry (`2026-11-14-vereino-people-life-cycle-and-data-entry.md`). A, C and L are being made Ready in parallel; this spec states what it needs from them and does not change them.

  | This spec | Needs | Kind |
  |---|---|---|
  | UI phases (2–9, 15, 16) | N phases 1–3 come first (D-031 build order) | build order |
  | Phase 7 (#281) | N phase 2 (the B-26 and B-27 tab shells) | final layout; contents can land first |
  | Phase 8 (#282) | N phases 4–5 (More, the attendant's landing REQ-N08) | blocking |
  | Phase 15 (#289) | N phase 7 (the public header) | final layout |
  | Phase 16 (#290) | N phase 6 (the dashboard frame, `dashboards.view` for the coordinator and the attendant) and N's widget table | blocking |
  | N's Requests menu count | reads `total` of `GET /api/facilities/rentals/requests`, which this spec keeps | contract this spec must not break |
  | Phase 11 (#285) | C phase 1 (E12-S01: `payments.chargeService` with `statusOf`, and C's charge-column migration with C's own approval) | blocking; the story is conditional |
  | Phase 13 (#287) | A's REQ-A05 / REQ-A10 ("Needs a new time") as the notice's link target | not blocking: the M-11 fallback link (AC-R14) |
  | Phase 14 (#288) | A's REQ-A08 (the typed-in venue on the same command) | lands after REQ-A08 or rebases on it; TEST-R19's typed-in-venue case needs it |
  | Payee label on B-22 for a rental charge without an owner institution | C's *Rental charge* rule (`payee = owner_institution`, `payee_institution_id` null) | note for C: the facilities screens say "to the club's account" (*Payee of a rental*) |
  | L | the "add institution" link beside the place owner picker (Non-goals) | none blocking |
- **Data:** nothing is backfilled. Rentals entered before `payments` is enabled stay without a charge (D-028); rentals entered before an agreement has terms keep their stored deadline.
- **Observability:** the lifecycle command logs each automatic expiry; the dispatch log shows every renter e-mail and reschedule notice by key; a rental without an address is marked "no e-mail sent" on its page.
- **Feature flags:** none.

## Risks and Tradeoffs

| Risk / tradeoff | Impact | Mitigation / detection | Residual risk |
|---|---|---|---|
| The day axis is a custom component in the panel | It can drift from the design system and miss keyboard users | Pure layout with unit tests; hours are native buttons; "Wpisy dnia" repeats every entry as text; axe in TEST-R03 and TEST-R12 | Low |
| Many parallel entries on a 375 px axis | Unreadable blocks | Minimum lane width with sideways scroll inside the axis only; the text list below | Low; capacity above 3 is rare |
| Confirming a paid rental takes the administrator to another screen (B-22), unlike the mockup's one click | An extra click per rental; a rental stays `requested` if the event is lost | The row's button links straight to the charge; the confirm action is the repair path once the charge is `paid`; the unpaid perspective shows what is still open (Q-R01) | Low |
| `statusOf` gives a status, not an amount | A partly paid rental is missing from the report's payment sum | The report counts partly paid charges separately and names its source; the payments list holds the exact amounts | Low; rentals are paid in one transfer |
| Automatic expiry cancels a rental that was paid but not yet recorded | A renter loses a paid slot | Expiry is off by default (Q-R21, owner decision 2026-11-16) and needs the agreement's flag; a partly paid rental never expires (DD-R11); the unpaid list shows the rental from the deadline on; the cancellation e-mail tells the renter whom to call; the slot can be re-entered | Medium where the club turns it on and records late |
| The attendant's renter search decrypts rental rows in memory | Slow on a facility with thousands of rentals | Bounded to 24 months and 500 rows, newest first; institutions come from an indexed name search | Low |
| A cancellation link forwarded to someone else | A rental is cancelled by a third party | The link goes only to the rental's contact address; the page shows no contact data; staff see who cancelled ("renter, by link") and can re-enter the rental; a late cancellation states the forfeit before the button | Low |
| Reschedule notices duplicate the notices of the groups and activities spec | Staff get two messages for one closure | The two specs split by audience and moment: this one tells staff that a move is needed, that one tells families when the move happens; keys per person and cause | Low |
| The opening-hours refusal blocks an event the club really holds before opening | A coach cannot enter it | The administrator widens the opening hours of the place, or enters the event with a typed-in venue; recurring series are not affected (DD-R15) | Low |
| The contact of a renter visible on the attendant's phone | Personal data on a private device | Only with `facilities.rentals.manage` on that place (DD-R18); nothing cached offline; the audit log records rental reads through the rental page | Accepted |

## Acceptance Criteria

- [ ] **AC-R01** — An administrator opens the facility calendar and sees, for one place and day, the zones and every session, club booking, rental, request, closure and maintenance window on an hour axis and in "Wpisy dnia"; the seven day chips, the place chips and the address change together, and a reload restores the view. The availability card says whether the place accepts online requests and lists the regulation windows.
- [ ] **AC-R02** — A tap on a free open hour opens one dialog with exactly the kinds the user's features allow, prefilled with the hour and 90 minutes; each kind saves through its route; a taken slot lists the colliding entries by name and saves nothing.
- [x] **AC-R03** — The rentals list keeps its tab and perspective in the address, shows a "Decyzja" link on a pending row, and opens a rental page that shows every saved field; contact, purpose and notes can be corrected, and an unregistered renter can be linked to a record unless that record is banned.
- [ ] **AC-R04** — With the charge service registered, a rental's charge names the place owner as payee and the renter as payer; "Potwierdź wpłatę" leads to the charge, and recording its full payment confirms the rental exactly once, while a direct confirm of an unpaid one is refused; a cancellation cancels or forfeits the charge; a reversed payment leaves the rental `confirmed` with its charge shown `open` again; a move keeps the amount and, for a rental with a charge, the payment deadline; the owner report states `charges` as the source of its payments. With the service absent, the same screens work from the rental register and say so.
- [ ] **AC-R05** — With an agreement of N days on the owner's contract, a new rental's payment deadline is N days before its start; without one it is 3. An unpaid rental past its deadline is on the unpaid list, and with automatic expiry it is cancelled free of charge once, with one e-mail — unless its charge is partly paid, in which case it stays on the unpaid list.
- [ ] **AC-R06** — Each request card shows the requester, contact, purpose, indicative amount with its payee, the collisions by name or "brak kolizji", the ban check, "regulamin zaakceptowany online", "e-mail potwierdzony" and the expiry, with Approve and Reject on the card.
- [ ] **AC-R07** — The tabs of "Strefy i cennik" and "Dziennik i incydenty" show the mockup's columns and toolbar actions. An administrator adds a log entry and an incident for a past day and a club booking up to 92 days back from the panel, and issues a ban from an incident that requested it; other roles are refused as today.
- [ ] **AC-R08** — At 375 px, in Polish and English, in light and dark mode: `/club/places` lists only the club's own leaf places with kind, surface and today's count; on a place's day one tap on a free hour opens the booking dialog, and the saved entry appears on the axis and in "Wpisy dnia" without sideways page scroll.
- [x] **AC-R09** — At 375 px, in both locales and modes, a user holding only the facility attendant role: sees on "Today at the facility" each session's sub-place, group and coach and each rental's contact with a phone link; enters a rental for a renter found by search from a place's day; opens that rental from the Rentals tab and corrects, confirms and cancels it.
- [x] **AC-R10** — The attendant reads and writes nothing outside the assigned places, finds no person who never rented there, and a coach never receives a renter's phone number. An incident with a ban request notifies the administrators, at 375 px from the attendant's page.
- [ ] **AC-R11** — At 375 px, in both locales and modes, a person who maintains a place opens the reminder link, sees only the tasks of their places, plans a window from the day axis and completes a task.
- [ ] **AC-R12** — At 375 px, in both locales and modes, the public places list, calendar and request confirmation render inside the club's frame with the mockup's intro, booking mode, approval notice with the owner, today first, the request summary shown once, and the way back to the place's calendar.
- [ ] **AC-R13** — A renter with an e-mail address receives the summary, the "moved" and the "cancelled" messages, and at 375 px in both locales and modes cancels through the link: free before the deadline, with the stated forfeit after it; a spent or late link shows no data.
- [ ] **AC-R14** — A closure or maintenance window over a session, a club booking and a rental sends exactly one message to each coordinator and coach, the booker and the administrators, and one e-mail to the renter; saving it again sends nothing; the flagged entries are listed under "Do przeniesienia". The coordinator's and the coach's notice opens on the phone at 375 px: on the groups and activities spec's "Needs a new time" view (REQ-A05, REQ-A10) when it exists, otherwise on the place's day on M-11 filtered to "Do przeniesienia" (the fallback link).
- [ ] **AC-R15** — A one-off group event on a club place outside its opening hours is refused with the day's hours, from the phone dialog at 375 px in both locales; the same event inside the hours, on a place without hours, or with a typed-in venue is accepted.
- [ ] **AC-R16** — The dashboard shows "Dziś na obiekcie" with today's entries in the reader's scope (administrator and coordinator: the club's places; attendant: the assigned places) or its empty text, and its click opens the calendar of that place.
- [ ] Every listed backend surface matches its recorded Open Mercato reference and uses the canonical shell/components, shared API helpers, semantic tokens, and complete loading, empty, error, conflict, keyboard, accessibility, responsive, light-mode, and dark-mode states.
- [ ] Every affected API and UI path has self-contained integration coverage and the configured validation gate passes.

## Final Compliance Report

| Check | Status | Evidence / resolution |
|---|---|---|
| Applicable `AGENTS.md` files and routed guides/skills reviewed | pass | `AGENTS.md` (module boundaries, Ask First, phone and locale checks), `.agents/skills/om-spec-writing/SKILL.md`, `.ai/guides/spec-delivery.md`, `.ai/specs/SPEC-000-template.md`, D-029, D-030, D-031 |
| Data models, APIs, events, UI, and tests are internally consistent | pass | Requirement Traceability, REQ-R01…REQ-R20 |
| Every workflow completes end to end without a catch-all integration phase | pass | J-R01…J-R08, each closed in a named phase |
| Platform-native reuse and extension points were chosen before custom code | pass | Reuse and Ownership Map; DD-R05, DD-R06, DD-R10, DD-R12; the two custom components are recorded (DD-R01, DD-R16) |
| UI contracts identify references, canonical components, and theme/state coverage | pass | UI and Interaction Contracts |
| Every phase has dependencies, bounded slices, tests, value, and an observable exit gate | pass | Implementation Phases 1–16 |

| Owner decisions recorded and audit gaps fixed | pass | [owner decisions on #253](https://github.com/wladku/Vereino/issues/253#issuecomment-6910005145) (2026-11-16): *Rollout* (Ask First items 1–6), *Resolved assumptions*, *Open Questions*; the [audit](https://github.com/wladku/Vereino/issues/253#issuecomment-6899389065)'s (c1)–(c10) fixed: (c1) Problem Statement, DD-R04, *UI architecture*, REQ-R20, TEST-R20, phase 16, the M-12 "no facility assigned" state; (c2) Non-goals; (c3) DD-R11, *Automatic expiry*, TEST-R09; (c4) *Payment deadline*, the `move` row; (c5) *Payment reversed*, TEST-R08; (c6) the subscriber rows and *Data Models* (no new index); (c7) *Payee of a rental*; (c8) `facilities_rental_links`; (c9) *Users, Permissions, and Scope* and phase 12; (c10) phases 13 and 14, AC-R14, TEST-R19 |

Verdict: `Ready for implementation` (2026-11-16). Phase 11 (#285) is conditional on the payments parity spec's phase 1; phase 14 (#288) lands after or rebases on REQ-A08 of the groups and activities parity spec; the other phases follow *Rollout → Order*.

## Resolved assumptions (autonomous defaults)

Each was proposed as the option closest to the mockup or the smallest reversible one; the owner confirmed all of them as written on 2026-11-16 ([#253](https://github.com/wladku/Vereino/issues/253#issuecomment-6910005145), section (b)).

| ID | Question | Chosen answer | Rationale | Confirmation |
|---|---|---|---|---|
| Q-R02 | How does the attendant's place and renter picker work with the role's features? | Facilities-owned option routes; the role keeps its four features (DD-R06, DD-R07) | Least privilege; no people register for the attendant | confirmed 2026-11-16 ([#253](https://github.com/wladku/Vereino/issues/253#issuecomment-6910005145)) |
| Q-R03 | Where does the attendant enter a rental after D-029? | The slot dialog on the member day page, with the rental kind (DD-R04); the mockup's F-10 names the panel | D-029 overrides the device, not the dialog | confirmed 2026-11-16 ([#253](https://github.com/wladku/Vereino/issues/253#issuecomment-6910005145)) |
| Q-R04 | Does the attendant need a rentals list and a rental page on the phone? | Yes: a Rentals tab on "Today at the facility" and `/club/facility/rentals/[id]` | Confirm, cancel and move are the role's functions (club spec, Users table); rule 6 of the brief | confirmed 2026-11-16 ([#253](https://github.com/wladku/Vereino/issues/253#issuecomment-6910005145)) |
| Q-R05 | Is the axis fixed to 08:00–22:00? | It widens to the day's opening hours and entries (DD-R02) | An entry outside the range must be visible | confirmed 2026-11-16 ([#253](https://github.com/wladku/Vereino/issues/253#issuecomment-6910005145)) |
| Q-R06 | Only seven chips, or also another day? | Seven chips plus an "Other day" field (DD-R03) | Moves beyond a week and past-day records | confirmed 2026-11-16 ([#253](https://github.com/wladku/Vereino/issues/253#issuecomment-6910005145)) |
| Q-R07 | Which staff see a renter's phone number? | Only holders of `facilities.rentals.manage` on that place (DD-R18) | Data minimisation | confirmed 2026-11-16 ([#253](https://github.com/wladku/Vereino/issues/253#issuecomment-6910005145)) |
| Q-R08 | What may be edited on a saved rental? | Contact, purpose, notes, and the renter record of an unregistered renter (DD-R08) | Money and slot stay consistent with the charge and the occupancy check | confirmed 2026-11-16 ([#253](https://github.com/wladku/Vereino/issues/253#issuecomment-6910005145)) |
| Q-R09 | How is "Confirm payment" recorded once charges exist? | On the charge record of the payments module, reached by the button; the payment event confirms the rental (DD-R09). This is one click more than the mockup | The payments parity spec records every payment on its own screens and adds no write method to DD-19 | confirmed 2026-11-16 ([#253](https://github.com/wladku/Vereino/issues/253#issuecomment-6910005145)); the extra click is accepted (Q-R01: no) |
| Q-R10 | Where do the agreement's terms live? | In the contract's encrypted `terms` JSON; the agreement is found through the place's owner (DD-R10) | No migration; per owner | confirmed 2026-11-16 ([#253](https://github.com/wladku/Vereino/issues/253#issuecomment-6910005145)) |
| Q-R11 | Which status does an expired unpaid rental get? | `cancelled_free` with the reason `unpaid_after_deadline` (DD-R11) | No new enum value | confirmed 2026-11-16 ([#253](https://github.com/wladku/Vereino/issues/253#issuecomment-6910005145)) |
| Q-R12 | How is a ban requested? | The existing incident action, a notice and "Issue ban" on the incident (DD-R12); the subject is chosen by the administrator | No migration | confirmed 2026-11-16 ([#253](https://github.com/wladku/Vereino/issues/253#issuecomment-6910005145)) |
| Q-R13 | Past club bookings: who and how far back? | The club administrator, 92 days (DD-R17) | The owner report's quarter | confirmed 2026-11-16 ([#253](https://github.com/wladku/Vereino/issues/253#issuecomment-6910005145)) |
| Q-R14 | Who is told about a reschedule flag on a session? | The coordinators of the session's section and its coach; administrators for rentals; the booker for a club booking | They are the people who can move the entry | confirmed 2026-11-16 ([#253](https://github.com/wladku/Vereino/issues/253#issuecomment-6910005145)) |
| Q-R15 | Does the opening-hours rule cover recurring series? | No, one-off events only (DD-R15) | Does not break existing series | confirmed 2026-11-16 ([#253](https://github.com/wladku/Vereino/issues/253#issuecomment-6910005145)) |
| Q-R16 | Does the request confirmation show the requester's data (audit: "maybe deliberate minimisation")? | Yes, as the mockup — organisation, contact name and e-mail, without the phone — once, in the successful confirmation response | The token proves the address; a reopened link shows nothing | confirmed 2026-11-16 ([#253](https://github.com/wladku/Vereino/issues/253#issuecomment-6910005145)) |
| Q-R17 | P-04 on a phone: list empty days as "Obiekt zamknięty."? | No; days without segments stay omitted with the existing hint; the list starts today | A month of closed-day lines is noise; #124 Q1 chose the month | confirmed 2026-11-16 ([#253](https://github.com/wladku/Vereino/issues/253#issuecomment-6910005145)) |
| Q-R18 | Does a renter cancel through a link? | Yes, with a new link table (DD-R13); fallback without the migration: the e-mails name the phone | The role-journeys audit marks own cancellation as partial | confirmed 2026-11-16 ([#253](https://github.com/wladku/Vereino/issues/253#issuecomment-6910005145)); the migration is approved (Ask First item 1), so the fallback is not needed |
| Q-R19 | Does the maintainer get a member task page? | Yes, `/club/places/maintenance`; the panel page of #128 stays for the administrator | D-029 | confirmed 2026-11-16 ([#253](https://github.com/wladku/Vereino/issues/253#issuecomment-6910005145)) |
| Q-R20 | Polish texts for surfaces the mockup does not have (rental page, Rentals tab, cancellation page, perspectives, notices) | Proposed in the wireframes and rows without a key; they follow the navigation spec's glossary and are reviewed with the catalogue | No mockup key exists | confirmed 2026-11-16 ([#253](https://github.com/wladku/Vereino/issues/253#issuecomment-6910005145)) |

## Open Questions

| ID | Question | Owner | Blocking? | Resolution / decision date |
|---|---|---|---|---|
| Q-R01 | Should "Potwierdź wpłatę" on B-24 record the payment in one click, as the mockup does, and should the owner report show exact partial amounts? Both need the charge contract to grow (a write method; an amount in `statusOf`) | Władek Kuć, with the payments parity spec | no | Resolved 2026-11-16 ([#253](https://github.com/wladku/Vereino/issues/253#issuecomment-6910005145)): no. One payment entry point in `payments`; the button opens the charge (DD-R09) and the report counts partly paid charges separately |
| Q-R21 | Automatic expiry of unpaid rentals: is the default "off" right for the pilot club (base spec Q-011)? | Władek Kuć | no | Resolved 2026-11-16 ([#253](https://github.com/wladku/Vereino/issues/253#issuecomment-6910005145)): off by default; the administrator turns it on per agreement |
| Q-R22 | Should a coordinator, like a coach, see renters' names on the day axis, or only "booked"? | Władek Kuć | no | Resolved 2026-11-16 ([#253](https://github.com/wladku/Vereino/issues/253#issuecomment-6910005145)): names, without contact data (DD-R18) |
| Q-R23 | Does a move keep the agreed amount or re-quote it (#221)? | Władek Kuć | no | Resolved 2026-11-16 ([#253](https://github.com/wladku/Vereino/issues/253#issuecomment-6910005145)): a move keeps the agreed amount, as the code does, so a charge never diverges from its rental (Non-goals; *Payment deadline*) |
| Q-R24 | Which entries does the dashboard widget "Today at the facility" show to each role? | Władek Kuć | no | Resolved 2026-11-16 ([#253](https://github.com/wladku/Vereino/issues/253#issuecomment-6910005145)): the navigation spec's table — administrator and coordinator the club's places, attendant the assigned places (REQ-R20) |

## Changelog

Each change is its own file in `.ai/specs/changelog/2026-11-14-vereino-parity-facilities/` (`YYYY-MM-DD-<slug>.md`, one `| date | change |` row), so parallel PRs never conflict here; `cat .ai/specs/changelog/2026-11-14-vereino-parity-facilities/*.md` lists them in date order. Never add rows to this section.
