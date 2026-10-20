# Vereino — Domain Model Draft (INPUT for om-spec-writing, not a spec)

> Status: discovery output. This file is NOT in SPEC-000 format. The real spec is authored from it via `om-spec-writing` as `.ai/specs/2026-10-20-vereino-club-management.md`. Module references in "Reuse" below come from the Open Mercato monorepo and must be re-checked against this app's `.ai/guides/module-facts.json`.

**Status:** Draft v0.3 (discovery complete, pre-implementation) · **Owner:** Władek Kuć · **Tech:** Kacper Kuć
**Language note:** domain content was originally drafted in Polish (the product's first market); entity and code names are English.

## Overview

Vereino is an open-source club management system built on Open Mercato, targeted at small multi-section sports clubs (associations) whose main section is a football academy (indicatively up to ~200 players; not a system limit), alongside e.g. a swimming section and extra classes — typically suburban clubs playing on municipality-owned facilities (D-011). One Open Mercato tenant = one club. Pilot: KS Gwiazda Ściejowice, which also administers the "Orlik 2024" facility on behalf of Gmina Liszki.

Research inputs (business case, stakeholders, benchmark, decisions D-001…D-012, interview scripts) live in [`README.md`](README.md) (this folder). The visual system map is [`assets/vereino-system-map.html`](assets/vereino-system-map.html) (in this research folder).

## Problem Statement

Small clubs run schedules, attendance, coach substitutions, fees and facility bookings across Messenger groups, Excel and phone calls. Existing SaaS (ProTrainUp, PLN 125–245/month) covers the calendar/attendance/fees core but not municipality-facility administration, non-football sections (zumba, pilates, swimming groups) or data ownership; it is also heavier than a small academy needs. See `research/2026-09-30-benchmark-protrainup.md`.

## Proposed Solution

Seven Open Mercato modules — `club_core`, `people`, `groups`, `activities`, `communication`, `payments`, `facilities` — with role-filtered calendars, a public (unauthenticated) facility schedule, online fee payment and a coach-settlement report derived from occurrence data. Scope decided by MoSCoW (`research/2026-10-20-moscow.md`). Reuse of existing Open Mercato modules is expected where they fit: `messages` (SPEC-002) and `notifications` (SPEC-003) for the `communication` module, `attachments` for documents, dashboard widgets (SPEC-011) for the coordinator/treasurer views — to be verified against each module's spec before implementation.

---

## 1. Goal

A sports club management system (pilot: LKS Gwiazda), built on Open Mercato. One platform for: participants (players / people attending classes), legal guardians, coaches, section coordinators, the club administrator and the technical administrator. Eventually many clubs and disciplines.

## 2. Decisions made

1. **MVP scope** = calendar core + payments. Projects, shop, contracts, rentals — reserved modules, outside the MVP.
2. **Activity** is a single entity with a `type` field (training / match / sparring / camp / other). Recurrence = an attribute (RRULE), not a separate class. There are no separate "classes" and "events".
3. **Group** is a single entity with a `kind` field (team / class_group). A football team and a zumba group are the same entity; a team has additional fields (age category, league, season).
4. **Minor's account**: the guardian has an account and sees the profiles of all their children; a child aged 13+ can get their own login with a limited view (calendar, attendance, announcements). Consents and payments always stay with the guardian. Children < 13 have no account.
   **The attendance declaration by a child aged 13+ is configurable** (a club setting that can be overridden per group or activity type): `immediate` — the status changes right away, the guardian receives a notification; `guardian_confirm` — status "awaiting guardian confirmation" until accepted (after X h it takes the default value set in the configuration); `guardian_only` — the child sees it but does not declare. Recommended default: `immediate` for training sessions, `guardian_confirm` for matches and away trips.
5. **Person** is a single record regardless of the number of roles; one person can combine roles, e.g. coordinator + coach, guardian + coach. Permissions add up; the UI shows a context switcher ("as coach / as coordinator"), and records store the role in which the action was performed (e.g. `attendance.marked_as_role`).
6. Naming: "participant" instead of "player", "legal guardian" instead of "parent", "place" instead of "pitch". Entities and code in English, UI in Polish.
7. **Orlik in the MVP in full scope**: hour zones, public schedule, bookings, rates, attendant log, incidents and entry bans, municipality report. The club is the *administrator* of the facility, the municipality its *owner* — the system must distinguish between them (rental payments go to the municipality's account).
8. Product name: **Vereino** (from German *Verein* — association/club). Rejected: CoolClub (working name), Clubio and Klubio (taken: domains, GitHub, an app on Google Play). GitHub `vereino` was free on the day of the choice; domain purchase on hold.

## 3. Roles and permissions

| Role | Scope | What they see / do |
|---|---|---|
| Participant (participant) | own data | calendar of their sessions, "attending / not attending", announcements of their groups, profile with photo, payment preview |
| Legal guardian (guardian) | their children | calendar of all children, declares attendance on their behalf, pays charges, writes to the coach, signs up for duty |
| Coach (coach) | their groups | sessions and attendance lists of their groups, cancelling a session, reporting an absence and naming a substitute coach, announcements to a group/session; (later) preview of their own contract |
| Section coordinator (coordinator) | one section | defines groups, activities, places in the section; list of sessions without a coach; announcements to coaches and the whole section; "cases" record |
| Facility attendant (facility_operator) | one place (facility) | opens/closes the facility, keeps the log (condition before/after, groups present), confirms and cancels bookings, reports incidents, requests entry bans; sees the facility schedule and renters' contact details |
| Club administrator (club_admin) | whole club | people, role assignments, sections, fee schedules, discounts, charges, payments; (later) projects, institutions, contracts, rentals |
| Technical administrator (tech_admin) | instance | tenant, modules, configuration, appearance; no access to personal data beyond what is necessary |

Coordinator permissions are granted **per section** (`role_assignment.section_id`), attendant permissions **per place** (`role_assignment.place_id`). Participant and guardian are not manually granted roles — they follow from group membership and the legal guardianship record.

The calendar is not an entity — it is a view of `occurrence` filtered by role:
- participant: sessions of the groups they are a member of;
- guardian: the union of the sessions of all their wards;
- coach: sessions where they are the coach (default or substitute) + sessions of their groups;
- coordinator: all sessions in the section, a separate "without a coach" list;
- attendant: the facility calendar (club sessions + bookings + open-to-public hours);
- **guest without sign-in**: the public facility schedule (see 4.7).

## 4. Modules and entities (MVP)

Convention: 1 Open Mercato tenant = 1 club. Table names in snake_case, `id` UUID, `created_at/updated_at`, soft delete where there is personal data.

### 4.1 `club_core`
- **club** — name, short_name, logo, address, settings (JSON: currency, time zone, age threshold for an own account = 13).
- **section** — club_id, name, description, is_active. Examples: football academy, swimming pool, extra classes.
- **place** — club_id, parent_place_id (hierarchy: complex → football pitch, multi-purpose pitch, locker room facilities), name, kind (complex / pitch / multi_pitch / hall / locker_room / pool / other), surface (synthetic_turf / polyurethane / …; it determines the required footwear), address, geo_lat, geo_lng, description, photos[], owner_institution_id (e.g. Gmina Liszki), managed_by_club (bool — the club is the administrator), is_external, opening_hours (JSON: Mon–Fri 8:00–22:00, Sat–Sun and holidays 9:00–20:30), closure_rules (e.g. "closed when there is snow"), regulations_document_id, contacts (administrator, attendant, owner, emergency numbers), is_active.
  Bookings and sessions point to a specific child place (pitch), not to the whole complex.

### 4.2 `people`
- **person** — club_id, first_name, last_name, birth_date, pesel (encrypted, optional), phone, email, photo, notes. Age calculated from birth_date determines adulthood and eligibility for an own account.
- **user** (Open Mercato) — person_id (0..1). Accounts only for people aged ≥ 13 or adults.
- **guardianship** — guardian_person_id, ward_person_id, relation (parent / grandparent / other), is_primary_payer, consents (JSON: regulations, image, trips), valid_from, valid_to. An n:m relation (two parents, siblings).
- **role_assignment** — person_id, role (coordinator / club_admin / coach / facility_operator / tech_admin), section_id (required for coordinator), place_id (required for facility_operator), valid_from, valid_to.

### 4.3 `groups`
- **group** — section_id, name, kind (team / class_group), age_category, league, season, description, is_active.
- **group_membership** — group_id, person_id, role (participant / coach / coordinator / assistant), valid_from, valid_to. A participant's development history = successive memberships (*żaki* → *orliki* → *juniorzy*).
- **external_team** — club_id, name, club_name, institution_id (optional — the same club can be an opponent and an Orlik renter), contact, notes. A dictionary of opponents to pick from a list.

### 4.4 `activities`
- **activity** — section_id, group_id, name, type (training / match / sparring / camp / other), default_place_id, default_coach_id, opponent_external_team_id, recurrence_rule (RRULE, null for one-off events), starts_on, ends_on, default_start_time, default_end_time, description, is_active.
- **occurrence** — activity_id, date, start_at, end_at, place_id, coach_id (null = unstaffed), status (planned / confirmed / done / cancelled), cancel_reason, notes, substitution_log (JSON: who, when, for whom). Generated from the RRULE; editable individually.
- **attendance** — occurrence_id, person_id, declared (yes / no / unknown), declared_by_person_id, declared_at, declaration_status (final / pending_guardian / rejected_by_guardian), guardian_decided_at, actual (present / absent / late / null), marked_by_person_id, marked_as_role. Unique (occurrence_id, person_id).
- **attendance_policy** (setting) — scope (club / group / activity_type), minor_declaration_mode (immediate / guardian_confirm / guardian_only), confirm_timeout_hours, default_after_timeout (declared / rejected).
- **occurrence_supervisor** — occurrence_id, person_id, note. A parent volunteer for a specific session ("on duty").

Rules:
- changing the coach on a session = a substitution; the system writes an entry to `substitution_log` (who, for whom, when, who approved). **Settlement**: the coach receives base pay + a rate per training unit; the unit counts for whoever actually ran the session (`occurrence.coach_id` in status `done`). At the end of the month the system counts units per coach from `done` sessions, so a substitution automatically transfers the unit from the default coach to the substitute — without manual corrections. The monthly report shows separately: planned units, units handed over to a substitute, units taken over as a substitute, balance.
- a session with status planned and `coach_id = null` goes onto the coordinator's "needs a coach" list;
- cancelling a session sends an announcement to the group (scope = occurrence).

### 4.5 `communication`
- **message** — club_id, author_person_id, scope (club / section / group / activity / occurrence / direct), scope_id, recipient_person_id (for direct), body, attachments[], parent_message_id (thread), is_case, created_at.
- A thread with `is_case = true` = a "case" (complaint, conflict); visible to the section coordinator and the administrator, cannot be deleted, with full history. Required for evidentiary purposes.
- Notifications in the MVP: e-mail. Push, WhatsApp/Messenger — later.

### 4.6 `payments`
- **fee** — club_id, name, amount, currency, period (monthly / one_off / per_occurrence), group_id or activity_id, valid_from, valid_to.
- **discount_rule** — club_id, name, kind (sibling / project / custom), percent or amount, conditions (JSON, e.g. "second and subsequent child of the same guardian"), valid_from, valid_to.
- **charge** — person_id (participant) *or* payer_institution_id (institutional renter), payer_person_id (guardian or the participant themselves), fee_id *or* rental_id, period_label, amount, discount_rule_id, discount_amount, due_date, **payee** (club / owner_institution — Orlik rental fees go to the municipality's account), status (open / paid / partially_paid / cancelled / forfeited — forfeited when not cancelled in time).
- **payment** — charge_id, amount, method (cash / transfer / online), paid_at, reference, recorded_by_person_id.
In the MVP payments are recorded manually by the administrator; online gateway later.


### 4.7 `facilities` — sports facility administered by the club (Orlik)
Source of the rules: Orlik 2024 Ściejowice regulations (§2–§6) and the note on the management agreement.

- **institution** (moved into the MVP from `projects`) — club_id, name, type (municipality / school / club / company / sponsor / other), address, contact, bank_account (to specify the payment recipient), notes. Gmina Liszki = owner; other clubs, schools, companies = renters.
- **contract** (moved into the MVP, generalized) — party_type (person / institution), party_id, kind (coach / facility_management / rental / grant / other), valid_from, valid_to, terms (JSON), file. For `coach`: terms = { base_monthly, unit_rate (per training unit), unit_minutes (e.g. 90), match_rate, travel_rate }. A coach's monthly settlement report = base + Σ units from `done` sessions × unit_rate (+ matches, away trips) — in the MVP only calculation and export, no bookkeeping of payouts. The management agreement with the municipality = `facility_management`; the rates and the division of responsibilities follow from it.
- **place_zone_rule** — place_id, weekday(s), time_from, time_to, zone (public_free / club_training / reservable_paid / closed), priority (school / municipal_event / club / rental / public), valid_from, valid_to. Defines the fixed weekly division of hours; from the rules + sessions + bookings the system generates the **monthly schedule** (§2(3)).
- **place_closure** — place_id, date_from, date_to, reason (snow / maintenance / event / other). A closure blocks bookings and flags club sessions to be moved.
- **rental_rate** — place_id, renter_category (municipal_club / municipal_club_winter_lighting / external_commercial), price_per_60, price_per_90, season_from, season_to, includes_lighting, valid_from, valid_to. Rates from the note: clubs from the municipality PLN 80–150/90 min, in winter with lighting PLN 150–220, external PLN 220–350 — the exact amounts to be set in the agreement.
- **rental** — place_id, renter_type (institution / person), renter_id, contact_person, requested_by (phone / email / form), starts_at, ends_at, units (a multiple of **90 min** — the training unit, §3(2)), rate_id, amount, charge_id, status (requested / confirmed / paid / cancelled_free / cancelled_late / no_show / done), cancellation_deadline (= starts_at − 24 h, §3(4)), payment_deadline (= starts_at − N days, N from the agreement, §3(3)), regulations_accepted_at, notes.
  Rules: a booking is possible only in a `reservable_paid` zone; it clashes with `occurrence` and other `rental`s; cancellation after `cancellation_deadline` → status `cancelled_late`, charge `forfeited`; municipal/school events take precedence — the administrator can move a booking with a notification.
- **facility_log** — place_id, date, operator_person_id, opened_at, closed_at, condition_before, condition_after, groups_present (JSON: booking/session, number of people, presence of an adult supervisor), remarks. The attendant log (note, item 4).
- **facility_incident** — place_id, occurred_at, reported_by_person_id, kind (rule_violation / damage / injury / other), description, involved (people or group or booking), action_taken (warning / removed / reservation_cancelled / police_called), attachments[], linked_message_id ("case" thread). Evidentiary basis in disputes (§6).
- **entry_ban** — place_id, subject_type (person / institution), subject_id, from, to (null = permanent), reason, incident_id, issued_by. Blocks new bookings by that party.
- **maintenance_task** — place_id, kind (daily_cleaning / turf_brushing / granulate / net_repair / lighting / annual_inspection / five_year_inspection / other), responsible (club / owner), due_date, done_at, cost, notes. From the note: division of responsibilities club ↔ municipality, annual and 5-year inspections.
- **Public schedule** (without sign-in): a monthly facility calendar with the zones marked (open to public / club training / free to book / booked — without the renter's name / closed), opening hours, rates, a link to the regulations, a phone number for bookings. A static link that can be posted as a QR code on the facility's notice board.
- **Owner report**: for a month/quarter — hours in each zone, number and value of bookings, payments to the municipality's account, incidents, maintenance work done. The basis for settling the management agreement.

MVP screens for the module: public schedule; facility calendar for the attendant/administrator (add a booking after a phone call, change status, log entry); rates and zone rules (administrator); incident and ban register; municipality report.

## 5. Reserved modules (outside the MVP)

- **projects**: `project` (institution_id, budget, coordinator_person_id, status, settlement). Uses `institution` and `contract` (kind = grant) from the MVP. A project links activities, charges and contracts; it requires a final settlement.
- **contracts (extension)**: bookkeeping of coach payouts and export to HR/accounting; `regulation` as documents to be accepted by guardians. (The base + units calculation is already in the MVP.)
- **shop**: `product`, `order` (participants' kits with sizes, fan merchandise).
- **facilities (extension)**: online booking form for renters, online payment, accounts for regular renters.
- **development**: participant history, device data (watch).

## 6. MVP screens (minimum)

- Participant / guardian: "Today" screen (4 tiles: calendar, messages, attendance, payments), calendar, session details with "attending / not attending", message thread, profile (+ child switcher for the guardian).
- Coach: my groups → sessions → attendance list (checking off), absence / substitute report, new announcement.
- Coordinator: section → groups, activities (wizard with RRULE), places, "sessions without a coach", cases.
- Administrator: people and roles, fee schedules, discounts, charges (list + recording payments), sections, institutions and contracts.
- Attendant: facility calendar, new booking (after a phone call), daily log (opening/closing, condition, groups), incident report.
- Guest: public facility schedule (month, zones, rates, regulations, phone).

## 7. Reference flow: one training session

1. The coordinator creates the activity "Żaki training" (group Żaki, Tuesdays 17:00–18:30, Orlik, coach Wojtek, RRULE weekly until 30.06).
2. The system generates sessions (1 per Tuesday).
3. The role calendars fill up.
4. The coach asks for confirmation; the guardian/participant declares attendance.
5. The coach reports an absence → session without a coach → the coordinator names a substitute → entry in substitution_log.
6. After the training session the coach checks off actual attendance; session → done.

## 7a. Reference flow: Orlik rental

1. A coach from a club in a neighboring municipality opens the public schedule, sees a free "bookable" slot on Wednesday 19:30–21:00 and calls the number from the schedule.
2. The attendant (or the administrator) creates a `rental`: football pitch, 1 unit (90 min), renter = institution "KS Sąsiedzi" (category: club from the municipality → winter rate, because it is December), status `requested`; the system calculates the amount, the payment deadline (N days before) and the free cancellation deadline (24 h before); the renter receives an e-mail with a summary, the municipality's account number and a link to the regulations.
3. The slot in the public schedule changes to "booked" (without the renter's name); the club's coordinators see the clash if they wanted to put a training session there.
4. The administrator records the payment to the municipality's account → `charge.status = paid`, `rental.status = confirmed`.
5. On the day of the rental the attendant opens the facility, records in `facility_log` the pitch condition before and the presence of the group's adult supervisor; after the end, the condition after and the closing. Any breach of the regulations → `facility_incident`, optionally `entry_ban`.
6. At the end of the month, the municipality report: hours in zones, bookings, payments, incidents, maintenance.

Variant: the renter cancels 10 h before → `cancelled_late`, charge `forfeited`, the slot goes back to "bookable". Variant: the municipality announces an event in a booked slot → the administrator moves the booking (priority §2(4)), the renter receives a notification and a proposal of another date.

## 8. Technical assumptions

- Open Mercato: modules as in section 4 (`club_core`, `people`, `groups`, `activities`, `communication`, `payments`, `facilities`), each with its own entities, API and views; entities extensible via custom fields where clubs will differ.
- The public facility schedule = the only view without authentication; it does not reveal personal data (a booking shows only "booked").
- Multi-tenant: 1 tenant = 1 club (to be confirmed — question 7).
- Responsive web (PWA) in the MVP; native app later (question 8).
- GDPR: PESEL encrypted and visible only to club_admin; soft delete of people; consent register in guardianship.consents.

## 9. Open questions

1. Sections: list and coordinators (academy — Wojtek?, pool — Aneta?, extra classes — ?). Are seniors a separate section?
2. The boundary between coordinator (what is happening) ↔ club administrator (money and people) — agreement on the proposal? (Confirmed: one person can have both roles.)
3. Membership fees: monthly per group, per specific activity, or both? Is an adult their own payer? Manual recording in the MVP?
4. Camp = an activity of type camp; a project only with external co-funding — agreed?
5. PESEL and consents: are they needed in the MVP, who can see them, which consents does the guardian confirm?
6. Announcements: only in-app + e-mail in the MVP? Is a "case" opened by the coordinator, or is it a flag on any thread?
7. Multi-tenant right away, or one instance for Gwiazda?
8. MVP as a PWA, native app later?
9. Product name — resolved: Vereino (decision 8). Open: which domain (.org / .com / .app) and when to buy it.

Questions from the regulations and the management agreement (Orlik):
10. Opening hours and zones: the regulations contain placeholders (8:00–22:00, 9:00–20:30). What are the actual hours and the weekly split between open to public / club training / rental?
11. Payment deadline: "N days before" — how many? And should a booking without payment by the deadline expire automatically?
12. Who enters bookings: the attendant, the club administrator, or both? Does the attendant see the rates and amounts?
13. Rates: which amounts from the ranges (PLN 80–150 / 150–220 / 220–350) go into the rate list? When does the "winter season / lighting" start — from a date or from the time it gets dark?
14. Rental payments: does the system only record "paid to the municipality's account" based on a confirmation, or does the club have access to the municipality's statement? Does part of the revenue go back to the club (renovation fund)?
15. Priority of schools and municipal events: who enters them into the schedule (the municipality has no account) — the administrator on behalf of the municipality? With how much notice?
16. Attendant: an employee of the club or of the municipality? Should keeping the log be mandatory (the facility cannot be "closed" in the system without an entry)?
17. Entry bans: is a register in the system enough, or is a procedure needed (who issues them, for how long, appeals)?
18. Liability insurance, annual and 5-year inspections: should the system keep track of deadlines (reminders), or does that stay outside it?
19. Regulations: should the renter accept the regulations in the system (a checkbox in online booking — later), or is a note "accepted by phone" enough?

Resolved 29.09.2026:
- One person can combine roles (e.g. coordinator + coach) — the model supports this via `role_assignment` and `group_membership`.
- Declaration of absence by a child aged 13+: configurable (`attendance_policy`), not a fixed rule.
- Substitution and coach settlement: base + training units; at the end of the month units from substitutions go to the substitute and are deducted from the coach being replaced. This follows directly from counting units by `occurrence.coach_id` for `done` sessions.

## 10. Glossary PL → EN

klub → club · sekcja → section · miejsce → place · osoba → person · konto → user · opieka prawna → guardianship · przypisanie roli → role_assignment · grupa → group · członkostwo → group_membership · drużyna zewnętrzna → external_team · aktywność → activity · termin → occurrence · obecność → attendance · dyżur → occurrence_supervisor · komunikat → message · sprawa → case (message.is_case) · opłata/cennik → fee · należność → charge · płatność → payment · zniżka → discount_rule · projekt → project · instytucja → institution · umowa → contract · zamówienie → order · rezerwacja/wynajem → rental · cennik wynajmu → rental_rate · strefa godzinowa → place_zone_rule · zamknięcie obiektu → place_closure · animator → facility_operator · dziennik obiektu → facility_log · incydent → facility_incident · zakaz wstępu → entry_ban · konserwacja/przegląd → maintenance_task


## Alternatives Considered

- Buying ProTrainUp for the pilot club instead of building — rejected as long as the goal is an open-source product for small academies (research/decisions/D-011, benchmark).
- Separate entities for "classes" vs "events", "team" vs "group" — rejected in favor of single entities with a type field (D-002, D-003).
- Two-way integration with Messenger/WhatsApp groups — not feasible (no group API); replaced by push + e-mail + share-to-group text + magic links (D-009, proposal).

## Implementation Approach

1. `club_core` + `people` (person, user link, guardianship, role_assignment) — foundation and auth.
2. `groups` + `activities` (RRULE → occurrences, attendance, attendance_policy, substitution_log) — the calendar.
3. `communication` on top of Open Mercato messages/notifications — scopes, threads, `is_case`, share text, magic links.
4. `payments` — fee, discount_rule, charge (with payee), payment, online gateway adapter.
5. `facilities` — place hierarchy, zone rules, closures, rental_rate, rental, public schedule, facility_log, incidents, bans, maintenance, owner report.
6. Coach settlement report; parent/participant "4 tiles" screen; PWA packaging.

## Success Metrics

- ≥80% attendance declarations made in-app during pilot season 2027/28.
- Fee collection on-time rate before vs after pilot (baseline to be measured — currently no data).
- Monthly facility report accepted by the municipality without manual rework.
- 5 additional academies on Vereino by end of 2027.

## Open Questions

See section 9 above and `research/2026-10-20-stakeholders.md` (three decisions with owner "unknown").

## Changelog

### 2026-10-20
- Converted to Open Mercato SPEC format; linked research package, MoSCoW and decision records; target segment narrowed to small football academies (D-011); online payments proposed for 1.0 (D-010).

### 2026-09-29
- v0.3: multiple roles per person; configurable guardian confirmation for 13+ declarations; coach settlement = base + training units, substitutions transfer units.

### 2026-09-26
- v0.2: `facilities` module (Orlik regulations); v0.1: initial domain model from founders' meeting.
