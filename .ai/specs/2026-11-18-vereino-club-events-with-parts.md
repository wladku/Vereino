# Vereino — Club events with parts: one tournament, many categories, days and groups

**Date**: 2026-11-18
**Status**: In progress — written 2026-11-18 from the owner's decisions D-032; Ask First items of *Rollout* approved by the owner on 2026-11-19 (Q-T20); left: AC-T01 (the families' notice on cancelling the event untested), AC-T04 (the coach's attendance and score on a part untested), AC-T11 (the panel list views and the part Edit untested) (close-out #452)

> Use `om-spec-writing` for every new application, multi-module feature, or other non-trivial business slice. Keep every section below; write `N/A — {reason}` when a section does not apply. Change the status to `Ready for implementation` only after every blocking open question is resolved and the traceability table covers every requirement.

Sources: the owner's decision `.ai/specs/research/decisions/D-032-club-events-with-parts.md` (2026-11-18), after trying to enter the club's real tournament "Przykład Cup 2026" in the sandbox at `3252cf4`. Binding as before: D-029 (phone-first: every role except the administrator works from the phone), D-030, and D-031 (the mockup is the model for names; the glossary is the **"Glossary (D-031 §2)"** of `.ai/specs/2026-11-14-vereino-parity-navigation-and-naming.md`). The code facts below were checked at `adaf8a43` (paths under `packages/app/src/modules/` unless stated otherwise).

This spec is an addendum. It completes `.ai/specs/2026-10-20-vereino-club-management.md` (REQ-025, REQ-027, DD-23, the glossary rows *Activity* and *One-off event*, D-002 "classes and events are one Activity"), `.ai/specs/2026-11-14-vereino-parity-navigation-and-naming.md` (REQ-N13, the public Events page P-06) and `.ai/specs/2026-11-14-vereino-parity-groups-and-activities.md` (REQ-A08, DD-A03, DD-A05, the collision rule of a typed venue, the moved-session notices of REQ-A09). It does not edit their bodies or change their status. What it supersedes there is listed under *Compatibility* in *Architecture and Data Flow* and recorded in one changelog entry per base spec. Ids carry the letter **T** (`REQ-T01`, `DD-T01`, `J-T01`, `TEST-T01`, `AC-T01`, `Q-T01`), so they never collide with the base specs' ids (D-028).

The mockup has no club event (it models the club's chess tournament as one one-off activity, `docs/ux-concept/mockups/app.ts:316`), so the names of the new things are chosen here under the glossary's rule "one word names one thing" (Q-T09): English **club event** and **part**; Polish **impreza klubowa** and **część** — not "wydarzenie", which the glossary gives to the activity type `other`. In this text an *activity* is a series or a one-off event and a *session* is one meeting, as in the glossary.

## TLDR

The club can enter one **club event** — "PRZYKŁAD CUP 2026" — with its shared facts (name, place, poster, description, funders, the organising club) and up to 40 **parts**, each with its own day, start and end, title, category, the club's group that plays in it and the visiting teams.

- **A part is a one-off activity of its group with one session** (D-002 stays true). Calendars, declarations with their deadline, attendance, the coach's session page, scores and the moved and cancelled notices keep working without change, and a guardian sees only the part of their own child's group. A part without a club group (the open seniors' tournament: the club has no seniors' group) is an **open part**: it has no session and lives only on the event.
- **Created by the club administrator (whole club) or a section coordinator (own section)**, in the panel and on the phone (D-029). A coach keeps creating single one-off events for their own group, unchanged.
- **One place per event**, picked from the club's places where external ones are marked. A missing place is added from the form as an external place and stays on the list; the coordinator gets one narrow feature for that, `club_core.places.add_external`.
- **Visiting teams per part** come from the existing external teams of `groups`, picked or added in place; the organiser adds them (no online registration).
- **Collision checks** cover the club's own places; a part at an external place checks only the coach and touches no facility occupancy.
- **A public tournament page** `/p/[clubSlug]/events/[eventSlug]` under the Events menu (P-06) shows the poster, the description, the place with a map link, the days with their parts (category, time, our group and section, visiting teams) and the funders' logos. P-06 lists the club event once and links to it.

Not in this version (D-032 §2): online registration of visiting teams, results and standings, entry fees.

Reused: the one-off activity and its session (`activities.events.create` model), the session commands and their notices (#353, #356), external teams (`groups`), places with `is_external` (`club_core`), attachments as for place files, the public site's slug lookup and frame (`clubCorePublicSite`), the P-06 contribution `activities.publicEvents`, `DataTable`, `CrudForm` and the member shell. Two migrations and the contract changes in *Rollout* need the owner's approval.

## Problem Statement

The owner tried to enter "Przykład Cup 2026" — Saturday and Sunday on two weekends, nine tournaments by age category, one municipal hall in Zielony Las — and could not (D-032). The code at `adaf8a43` confirms why:

- **Only one group per event.** `activities.events.create` makes one one-off activity of one group with one session (`activities/commands/events.ts:122-164`). Nine parts are nine unrelated activities; nothing says they are one tournament, and nothing names the host.
- **No place for the shared facts.** An activity has a name, a description and invited teams (`activities/data/entities.ts:72-102`), but no poster, no funders, no public page of its own and no common description.
- **P-06 cannot show a tournament.** The public Events page lists each one-off activity of a public group in a public section as its own card, with only the first session of each activity (`activities/lib/public-events.ts:66-112`). Nine parts would be nine cards; a part of a group that is not public would be missing; the open seniors' tournament has no group and could not be shown at all.
- **The coordinator cannot add the hall.** The event's place must be a club place (`club_core.places.create` needs `club_core.manage`, which only the administrator holds: `packages/core/src/roles.ts:33-76`). A typed venue (REQ-A08) is a coach's away-match shortcut that is never added to the places list (DD-A03), but the hall in Zielony Las is used again every season (D-032 §4).
- **External places are checked like club places.** `findConflicts` checks the place tree, the capacity and the facility occupancy of any place, external or not (`activities/services/schedule.ts:191-261`); only a typed venue skips the place. Two parts in parallel in the municipal hall would collide with each other, although the hall is not the club's to schedule.
- **The coach's form hides that a place is external.** `GET /api/activities/events/options` returns places as `{ id, label }` only (`activities/lib/member-event.ts:47-52`), dropping `isExternal`, which `/api/club_core/options/places` carries (`club_core/api/options/places/route.ts:27-38`).

Who has the problem: the coordinator of the football academy (who organises the tournament, on the phone), the club administrator (poster, funders, publication), guardians (who need their child's part in the calendar, not nine events), visiting clubs, parents and the funders (who look for one page with the whole schedule; the poster names the municipality and the ministry, D-032 *Why*).

## Overview and Success Measures

- **Primary outcome:** the club enters a four-day, nine-part tournament as one club event in under 20 minutes on a phone, and publishes one page that a visitor opens from the poster's link or QR code and finds every part with its time, category and teams.
- **Leading indicators:**
  - club events created per season and parts per event (from the `activities_club_events` table);
  - the share of club events created on `/club` pages (access logs) — D-029;
  - public tournament page views per club event (rate-limit counters of the public route);
  - the share of guardians of a part's group who declared before the part's deadline (the existing declaration data).
- **Baseline:** at `adaf8a43` no club event exists; the owner's attempt produced nine unrelated events, no public page and no seniors' part.
- **Market / product reference:**
  - **Adopted:** TeamSnap and SportEasy "events" with sub-sessions per team; Spond groups a tournament with sub-events per team so that each family sees only its own child's slot; tournament sites (e.g. the poster-and-schedule pages clubs print for municipal grants) show one page with the poster, a day-by-day schedule and the funders' logos.
  - **Rejected for now:** online team registration with entry fees, brackets, results and standings (Tournify, LeagueApps) — D-032 §2 excludes them; they would need payments and a results model.

## Goals

- **REQ-T01** — The club administrator (whole club) and a section coordinator (own section) create, edit and cancel a **club event** with its shared facts: name, place, description, the organising club and, optionally, its section, a public switch with a readable slug, and default gathering time and declaration deadline for its parts (D-032 §1, §3).
- **REQ-T02** — A club event holds up to 40 **parts**. Each part has a day with a start and an end, a title, a category, an activity type, the club's group that plays in it (or none: an open part), a coach, a gathering time and a declaration deadline. A part with a group is a one-off activity of that group with one session; the organiser adds, edits, copies, moves, cancels and removes parts (D-032 §1).
- **REQ-T03** — A guardian, a participant and a coach see a part only through its group: in the calendar, on Today and on the session page, which name the club event and link its public page when it is published. Declarations with the deadline, attendance, the coach's session page, the substitute rules and the moved and cancelled notices work for a part as for any session (D-032 §1).
- **REQ-T04** — Each part lists its visiting teams, picked from the club's external teams or added in place with the team's club or institution; the organiser adds them, there is no online registration (D-032 §2).
- **REQ-T05** — A club event has one place, picked from a list of the club's own and external places where external ones are marked. Changing the event's place moves every planned future part session there, and each move is announced as REQ-A09 announces it (D-032 §4).
- **REQ-T06** — When the place is missing, the administrator or the coordinator adds it from the event form as an external place with its name, address and, optionally, its owner institution; it stays on the list for next time. The coordinator does so through one narrow feature, never `club_core.manage` (D-032 §4).
- **REQ-T07** — Writing a part at a club place checks the place tree, the capacity, the facility occupancy, the opening hours and the coach; a part at an external place checks only the coach and leaves the facility occupancy untouched.
- **REQ-T08** — A club event carries one poster and up to 12 funder logos with the funder's name; they are stored as attachments and are public only while the event is public.
- **REQ-T09** — A guest opens the public tournament page `/p/[clubSlug]/events/[eventSlug]`: the poster, the name, the dates, the description, the place with its address and a map link, the days with their parts (title, category, time, our group with its section, visiting teams, cancellations), the organising club and the funders. The page exists only while the club publishes its page and the `events` block and the event is public (D-032 §2).
- **REQ-T10** — The public Events page P-06 lists a published club event once — its name, its date range, its place and the number of parts — linking to its tournament page; its parts are not listed as separate events. It moves to "Past" once its last part has ended and stays there while its first part started at most 60 days ago, the rule of a single event (D-032 §2; completes REQ-N13).
- **REQ-T11** — In the panel the administrator and the coordinator list club events, create and edit one, work its parts in a table grouped by day, and manage the poster and the funders.
- **REQ-T12** — On the phone the coordinator and the administrator do everything of REQ-T11: create and edit the event, add a place, add, edit, copy, move, cancel and remove a part, add visiting teams, upload the poster and the funder logos, and cancel the whole event (D-029, D-032 §3).

## Non-goals

- **Online registration of visiting teams, results and standings, entry fees** (D-032 §2). A part of type `match` or `sparring` keeps the existing score of REQ-A15; nothing aggregates it.
- **A per-part place.** One place per event in this version (Q-T02). Parts in parallel at one club place need that place's capacity.
- **A typed venue for a club event.** The place comes from the list (D-032 §4); a coach's typed venue (REQ-A08) is unchanged for single events.
- **More than one club group in a part** (Q-T04). A club that fields two teams in one category enters two parts.
- **A notice when a club event or a part is created or published.** Families see the part in the calendar; the existing evening declaration reminder covers `confirm` parts. Moves and cancellations are announced as today.
- **Coach-created club events.** A coach keeps `/club/events/new` for a single event of their own group (D-032 §3).
- **Re-encoding images.** Posters and logos are served as uploaded with `nosniff`, as logos, materials and place photos are (club spec phase 1 step 7, accepted by the owner on 2026-10-30); re-encoding needs `sharp`, a new dependency.
- **Funder links and a PDF poster** (Q-T08).
- **Push notifications and native apps** (unchanged by D-029).

## Proposed Solution

**The club event is a grouping record; each part with a group is an ordinary one-off activity (DD-T01).** A new record `activities_club_events` holds the shared facts. A new record `activities_club_event_parts` holds what a part shows: title, category, type and visiting teams. A part with a group owns exactly one one-off activity (no recurrence) of that group with one session, created in the same transaction. The activity carries a new scalar `club_event_id`. The session stays the source of truth for the part's day, time, place, coach and status, so every reader that lists sessions — calendars, Today, declarations and their deadline (REQ-A07), attendance, the coach's session page, scores, the unstaffed warning, the coach units report, the moved and cancelled notices (#356) — sees a part without change. D-002 ("classes and events are one Activity") holds: the scheduling unit is still the activity and its session.

**An open part** (no club group — the seniors' tournament of the example, since the club has no seniors' group) stores its own start, end and status on the part row and has no session. It is in nobody's calendar and in no place's schedule, so it is allowed only when the event's place is external (DD-T04): at a club place it would hold the place without the facility module knowing.

**One place per event (DD-T05).** The event's `place_id` is copied to every part's activity and session. The session edit of a part refuses another place; a change of the event's place moves every planned future part session in one transaction and each move emits the existing `activities.occurrence.updated` with its `change`, so each part's audience gets the moved notice of REQ-A09.

**Who changes a part (DD-T06).** A part's session is moved or cancelled only by someone who manages its club event: the club administrator, or a coordinator of the event's section. The coach's edit right of DD-A05 and the coach's cancel right do not reach a part session; the coach keeps the attendance list, declarations on behalf of others, the score and reporting an absence. The generic activity edit and delete refuse a part's activity (409): its title, type and teams change through the part.

**Collisions (DD-T07).** A part at a club place goes through `findConflicts` unchanged: place tree, capacity, the facility occupancy provider, the coach, and the opening hours of REQ-R19 (#363). A part at an external place checks only the coach — the same rule as a typed venue (DD-A03) — so parts in parallel in a municipal hall never collide with each other and no facility occupancy is read or written. Other sessions at external places keep today's check (Q-T11).

**Adding an external place from the form (DD-T08).** `club_core` gains the feature `club_core.places.add_external`, granted to the coordinator role (the administrator holds it through `club_core.*`), and the command `club_core.places.add_external` behind `POST /api/club_core/places/external`. It creates a root, active, external place with a name and an address and an optional kind and owner institution; every other field takes its default (not managed or rented by the club, no public calendar, no online requests, no opening hours, capacity 1). Editing and deleting the place stay the administrator's. The precedent is `club_core.sections.public_content`, a narrow feature the coordinator already holds (`club_core/acl.ts`).

**Visiting teams (DD-T09).** They are `groups` external teams (`groups_external_teams`: name, the club it plays for, an optional institution; `groups/data/entities.ts:153-178`). The part form's picker reads `GET /api/groups/external-teams` and adds a team in place through `POST /api/groups/external-teams`; the coordinator already holds `groups.view` and `groups.manage` (`packages/core/src/roles.ts:59-60`), so no permission is new. The part row stores the ids; for a part with a group the part command writes the same ids to the activity's existing `invited_external_team_ids`, so the session reads already show them (`invitedTeamNames`, `activities/services/calendar.ts:290`).

**Poster and funders (DD-T10).** A new link table `activities_club_event_files` follows the place files of `club_core` (`club_core/data/entities.ts` `PlaceFile`, `club_core/commands/place-files.ts`): the bytes live in `attachments` (partition `privateAttachments`, owner `activities:club_event`, assignment `activities:club_event_file`), the row keeps a snapshot of the name, type and size, and the format is checked by its bytes with `checkFileBytes` of `@vereino/core`. One poster (PNG, JPEG or WebP, up to 5 MB; a new upload replaces it), up to 12 funder logos (the same formats, up to 2 MB, each with the funder's name).

**The public tournament page (DD-T11).** It is served by `club_core` next to P-06, exactly as P-06 is: `GET /api/club_core/public/{clubSlug}/events/{eventSlug}` and the page `club_core/frontend/p/[clubSlug]/events/[eventSlug]/page.tsx`. The club comes from the one approved slug lookup (DD-35); the event comes from two new optional methods of the existing P-06 contribution `activities.publicEvents` (`club_core/services/public-blocks.ts:52-81`), called inside the found tenant and organization. The poster and logos are streamed by `club_core`'s `fileResponse` (`club_core/api/public-shared.ts:68-96`) with the exact owner and assignment the provider returns; no new system-scope lookup exists.

**P-06 (DD-T12).** `publicEventLists` leaves out activities with a `club_event_id` and adds one entry per published club event that has at least one part. The entry is visible without a public group, because publishing the event is the club's own decision; inside the page a part names its group and section only when both are public (Q-T07).

### Design Decisions and Alternatives

| Decision | Rationale | Alternative considered | Why rejected / deferred |
|---|---|---|---|
| **DD-T01** The club event is a new grouping record in `activities`; a part with a group is a one-off activity of that group with one session, linked by a scalar `club_event_id`; the session is the source of truth for time, place, coach and status | D-032 §1 "a guardian sees only the part of their child's group" comes for free: every session reader already filters by group. Declarations, deadline, attendance, notices (#356) and the coach's session page stay one code path. `activities` already owns the one-off event and its invariants, so the event and its parts stay transactionally consistent in one module | (a) One activity with several sessions of several groups; (b) a new `club_events` module; (c) parts as a JSON list on the event | (a) breaks `group_id`/`section_id` on the activity and every scope rule; (b) needs cross-module writes into `activities` in one transaction; (c) gives the parts no session, so no calendar and no declarations |
| **DD-T02** The part row holds what a part shows (title, category, type, visiting teams); the part command copies the title, type and team ids into the part's activity in the same transaction, and the generic activity edit refuses a part's activity | One writer keeps the copy true; existing reads (`activityName`, `invitedTeamNames`) show the part without change | Read the part row in every session reader | Touches the calendar, Today, the session page, share texts and notices for a label |
| **DD-T03** The category is a text snapshot (up to 60 characters), proposed from the group's age-category dictionary entry (`groups_groups.age_category_entry_id`) and editable | The poster's categories ("Orlik młodszy", "Seniorzy (16+)", "Kids") are not all dictionary entries; an open part has no group | A dictionary reference | Fails for an open part and for "Seniorzy (16+)" |
| **DD-T04** An open part (no club group) is allowed, with its own start, end and status on the part row; only when the event's place is external (422 `club_event_open_part_needs_external_place`) | The example's seniors' tournament has no club group (the mockup's academy has eight groups, Kids to Trampkarz, and no seniors: `app.ts:287-294`). At a club place an open part would hold the place without a session, so later bookings would not see it | Require a group for every part; let open parts sit at a club place | The first forces a fake group onto rosters and public pages; the second leaves a hole in the facility occupancy (Q-T01) |
| **DD-T05** One place per event, copied to each part's session; a part session's place cannot be changed alone (422 `club_event_part_place_fixed`); changing the event's place moves the planned future part sessions, each announced | D-032 §1 lists the venue among the shared facts; one rule for the public page and for notices | A per-part override | Not asked for; parallel parts at a club complex wait for it (Q-T02) |
| **DD-T06** A part session is moved and cancelled only by who manages the club event (administrator; coordinator of the event's section); the coach keeps attendance, score, declarations and absence reporting | The organiser owns the schedule a visiting club relies on; DD-A05 was written for a coach's own single events | Leave DD-A05 as is for parts | A coach could move one part of a published four-day schedule without the organiser (Q-T05) |
| **DD-T07** A part at an external place checks only the coach; other sessions at external places keep today's check | D-032 brief: collision checks for club places only; a municipal hall is the owner's to schedule. Changing the rule for every session at an external place is a wider behaviour change than D-032 asks | Apply "external = coach only" to every session | Changes coach single events and legacy series at external places without an owner decision (Q-T11) |
| **DD-T08** A narrow feature `club_core.places.add_external` for the coordinator, with a command that fixes every field except name, address, kind and owner | D-032 §4 lets the coordinator add a place; `club_core.manage` would also let them edit the club settings, sections and every place | Give the coordinator `club_core.manage`; let the event form create the place through `activities` | The first is far wider than needed; the second is a cross-module write into `club_core`'s table |
| **DD-T09** Visiting teams are `groups` external teams, ids on the part row, copied to the activity's `invited_external_team_ids` | The dictionary exists, a coordinator may add to it, and the activity column already feeds `invitedTeamNames` on session reads | A free-text list on the part | Duplicates the dictionary; "the external team's club" would be lost |
| **DD-T10** Poster and funder logos are attachments linked by `activities_club_event_files`, PNG/JPEG/WebP checked by bytes; poster ≤ 5 MB (one, a new upload replaces it), logos ≤ 2 MB (≤ 12, name required) | The place-files pattern (REQ-U03) and the logo limits (glossary *Logo*); no SVG (script risk) | PDF posters; SVG logos | A PDF cannot be shown inline on a phone; SVG is refused everywhere in Vereino (Q-T08) |
| **DD-T11** The public tournament page and its file route live in `club_core` next to P-06 and read the event from new optional methods of `activities.publicEvents` | One slug lookup (DD-35), one public frame, one file streamer; `club_core` already serves P-06 from that contribution | An `activities` page under `/p/[clubSlug]/events/[eventSlug]` like the session page `/p/[clubSlug]/s/[id]` | Two modules would serve pages under `/p/[clubSlug]/events/`, and `activities` would need its own file streamer |
| **DD-T12** P-06 shows a published club event as one card that needs no public group; inside the page a part names its group and section only when the group is public in a public section, else the club's name | Publishing the event is the club's decision; DD-29 still governs groups | Require a public group for the card; ignore the group's `is_public` on the page | The first hides the open part and closed groups' parts; the second publishes a group the club kept private (Q-T07) |
| **DD-T13** The public URL is `/p/[clubSlug]/events/[eventSlug]`; the slug is proposed from the name at creation, editable, unique among the club's live club events | DD-23: readable on a poster and in a QR code; under the Events menu (P-06) | A UUID in the URL | Unreadable on a notice board (DD-23) |
| **DD-T14** Cancelling the club event cancels each planned future part session through the existing session cancellation (thread message, in-app notice, e-mail per session) and each open part; the event shows "Cancelled" publicly | One cancellation path; each family is told about its own child's part | One summary notice per event | A new audience rule and template; a family with children in two parts gets one notice per part, which names each part |

## Domain Vocabulary and Business Rules

| Term / invariant | Precise meaning or rule | Source of truth | Failure behavior |
|---|---|---|---|
| Club event | A record of the club with a name (2–160 characters), a slug (3–80, `^[a-z0-9]+(-[a-z0-9]+)*$`, unique among the club's live club events), a description (≤ 4000, plain text), one place (a live active leaf of the club's places, own or external), an optional section (null = whole club), `is_public` (default off), default `gathering_minutes_before` and `confirm_by_minutes_before` for new parts, and a status `planned` or `cancelled` with a reason | `activities_club_events` | 422 on lengths and slug format; 409 `club_event_slug_taken`; 404 or 422 `place_not_bookable` for the place |
| Organising club | Always the club whose record it is: the public page shows the club's name and logo from the public frame. Nothing is stored | `club_core` public frame | — |
| Event section | Set: the event belongs to that section; its coordinators manage it and every part's group must belong to it. Null: a whole-club event; only the administrator manages it and parts may take groups of any section. The section can change only while the event has no live part | `activities_club_events.section_id` | 403 `scope_denied` (a coordinator outside the section or on a whole-club event); 422 `club_event_part_outside_section`; 422 `club_event_section_fixed` |
| Part | A row of a club event: title (2–160), category (≤ 60, proposed from the group's age category), type (`tournament` by default, or `match`, `sparring`, `other`; `match` and `sparring` only for a team, as `eventTypesForGroupKind`), visiting teams (≤ 32 external team ids). Either a **part with a group** (owns one activity) or an **open part** (own start, end and status). At most 40 live parts per event | `activities_club_event_parts` | 422 `club_event_parts_limit`; 422 `activity_type_requires_team` |
| Part with a group | Owns one one-off activity: `group_id` and `section_id` of the group, `club_event_id` of the event, `name` = the part's title, `type` = the part's type, `default_place_id` = the event's place, `invited_external_team_ids` = the visiting teams, `is_away` false, `recurrence_rule` null; and one session at the given instants with the event's place, the part's coach, gathering time and deadline. The group is fixed once created; the coach is set at creation and later changed with the existing Change coach (REQ-A10), so the substitution history stays whole | `activities_activities`, `activities_occurrences` | 422 `club_event_part_group_fixed` on a change; 422 `activity_group_inactive` |
| Open part | A part without a club group: `starts_at`, `ends_at` (end after start), `status` (`planned` or `cancelled`). No activity, no session, no calendar, no declarations. Allowed only while the event's place is external | `activities_club_event_parts` | 422 `club_event_open_part_needs_external_place` (also when the event's place is changed to a club place while open parts exist) |
| Part's day, time, place, coach, status | For a part with a group: those of its session, always. For an open part: its own columns; its place is the event's | session / part row | — |
| Event dates | From the first part's start date to the last part's end date in the club's zone; none while the event has no live part | derived | — |
| Event without parts | Allowed as a draft. It is not listed on P-06 and its public page answers 404 until it has a live part | — | — |
| Event place | One place for every part. A part session's place cannot be changed alone. Changing the event's place moves every `planned` part session whose start is in the future to the new place, after the collision check of each; a cancelled, done or past session keeps its place | `activities.club_events.update` | 409 with every collision, nothing saved; 422 `club_event_part_place_fixed` on a session edit |
| External place | A place with `is_external = true` (`club_core_places`). The pickers mark it "external" (`club_core.places.external`); facilities never book it (`facilities/lib/place-scope.ts:58-60` `isBookablePlace`) | `club_core` | — |
| Adding an external place | Name (2–160), address (5–500, required: the public page builds the map link from it), kind (default `other`), optional owner institution (a live institution of the club). Created as a root, active, external leaf; no other field can be set. The caller cannot edit or delete it afterwards unless they hold `club_core.manage`; the command's undo removes it while no activity, session or club event points at it | `club_core.places.add_external` | 409 `external_place_exists` with `details.placeId` when a live place with the same name and address (case-insensitive, trimmed) exists; 400 on lengths and unknown fields (validation); 422 `place_reference_invalid` at `ownerInstitutionId` for an owner that is not a live institution of the club (as on B-06); the undo answers 409 `place_in_use` once something points at the place |
| Collision check of a part | Club place: place tree, capacity, the facility occupancy provider, opening hours (REQ-R19) and the coach, as `findConflicts` does today. External place: the coach only. Parts of the same event are checked against each other by the same rule | `activities/services/schedule.ts` | 409 `occurrence_place_conflict` / `occurrence_coach_conflict` with the list; 409 `event_place_closed` |
| Who manages a club event | The administrator for every event; a coordinator for the events of their sections. Managing covers the event, its parts, its files, the move and cancellation of its part sessions and the copy of a part | `activities` commands | 403 `scope_denied` |
| Part session changes by others | `activities.occurrences.update` and `activities.occurrences.cancel` on a part session need a manager of the club event: a coach, and a coordinator of another section, get 403 `club_event_part_managed_by_event`. Assigning a coach, taking over, attendance, declarations, absence and score keep their own rules | `activities/commands/occurrences.ts` | 403 `club_event_part_managed_by_event` |
| Part's activity elsewhere | `activities.activities.update` and `activities.activities.delete` refuse an activity with a `club_event_id` | `activities/commands/activities.ts` | 409 `activity_is_club_event_part` with `details.clubEventId` |
| Removing a part | Allowed while the part's session is `planned` and has no declaration or attendance row (an open part: always). Soft-deletes the part, its activity and its session; undoable | `activities.club_event_parts.delete` | 409 `club_event_part_in_use` (the page offers Cancel) |
| Copying a part | A new part prefilled with the title, category, type, start and end times, gathering, deadline and visiting teams of another part; the day and the group are chosen again. Client-side prefill (`?copyOf=`), saved by the ordinary create | part forms | — |
| Cancelling a part | A part with a group: the existing session cancellation with a reason (its notices unchanged). An open part: `status = cancelled` with a reason (3–500); no notice (it has no audience) | `activities.occurrences.cancel`; `activities.club_event_parts.cancel` | 409 version |
| Cancelling the club event | Reason 3–500. Every planned future part session is cancelled with that reason through the session cancellation, every planned open part is cancelled, the event's status becomes `cancelled`. Parts can no longer be added or edited | `activities.club_events.cancel` | 409 `club_event_cancelled` on later part writes |
| Public club event | `is_public` and the club publishes its page and the `events` block (`isBlockPublished`, `club_core/lib/publication.ts`) and the event has a live part | `club_core` + `activities` | the public routes answer 404 |
| Our group on the public page | A part with a group shows the group's name and the section's name with a link to the section page when the group is public (`is_public`) and its section is public; otherwise the club's short name, or its name. An open part shows no club team | `groups`, `club_core` | — |
| Visiting team on the public page | The external team's name and the club it plays for (`club_name`); never the contact, the notes or the institution's details | `groups_external_teams` | — |
| Poster | One live file of kind `poster` per event: PNG, JPEG or WebP by bytes, ≤ 5 MB. A new poster upload soft-deletes the previous one in the same transaction (undoable) | `activities_club_event_files` | 422 `club_event_file_too_large`, `club_event_file_format_unsupported`, `upload_file_missing` |
| Funder logo | Up to 12 live files of kind `funder_logo`: PNG, JPEG or WebP by bytes, ≤ 2 MB, each with the funder's name (2–120, the image's alternative text). Shown in upload order | `activities_club_event_files` | 422 `club_event_funders_limit`; the file codes above |
| Map link | `placeMapHref` of the event's place: its pin, else an OpenStreetMap search of the name and address (`activities/lib/venue.ts:13-24`); on the tournament page always, on the P-06 card only for an external place (as today) | `activities/lib/venue.ts` | no address and no pin → no link |
| Past club event | Its last part ended before the club's today; P-06 lists it under "Past" while its first part started at most 60 days ago (`PAST_EVENT_DAYS`) | `activities/lib/public-events.ts` | — |

## Users, Permissions, and Scope

One new feature id, `club_core.places.add_external`, granted to `vereino_coordinator` in the role catalogue (`packages/core/src/roles.ts`); the administrator holds it through `club_core.*`. Every page and command checks features and grants, never role names.

| Actor | Allowed outcomes | Scope rule | Required feature IDs |
|---|---|---|---|
| Club administrator | Everything: whole-club and section events, parts, files, external places, cancellation; panel and phone | Club (`club_admin` grant) | module wildcards (`activities.*`, `club_core.*`, `groups.*`) |
| Section coordinator | Create, edit and cancel the club events of their sections; their parts and files; add an external place; add a visiting team; read every club event of the club (read-only outside their sections); phone and panel | Events with `section_id` in the coordinator grant's sections; reads club-wide (`clubWideKinds: ['coordinator']`, as `/api/club_core/options/places`) | `activities.view`, `activities.manage`, `groups.view`, `groups.manage`, `club_core.view`, **`club_core.places.add_external`** (new) |
| Coach or instructor | Unchanged single events (`/club/events/new`); on a part session of a coached group: attendance, declarations on behalf, score, absence report, take-over; never move or cancel a part session | `coached_group_ids` | `activities.coach`, `activities.events.create` (unchanged) |
| Guardian, participant with an account | See the part of their own or their ward's group in the calendar, on Today and on the session page; declare before the deadline; follow the link to the public page | `self` and `guardian` grants | `people.self`, `activities.attendance.declare` (unchanged) |
| Guest (no session) | The public tournament page and its files; the P-06 card | the club found by its public slug; only a public event | none |

`tenantId` and `organizationId` come from the authenticated context through `commandContextForRequest` and `makeCrudRoute`. A club event's command target is the event's section for a coordinator grant, and the organization (which only the `club_admin` grant matches) for a whole-club event, through `authorizeScoped` as the other `activities` commands do. The public routes use the one approved read-only system-scope lookup of `club_settings.public_slug` (DD-35, `club_core/services/public-site.ts`), and then read the event by its slug inside the found tenant and organization; no other system-scope read is added.

## Reuse and Ownership Map

| Capability | Reuse / extend / app-own | Existing module or new module | Integration seam | Why |
|---|---|---|---|---|
| Club event, parts, files | app-own (new tables) | `activities` | own entities, commands, routes | `activities` owns one-off events and sessions (DD-T01) |
| Part with a group as activity + session | reuse | `activities` (`commands/events.ts` creation logic, `lockSchedule`, `assertReferences`, `findConflicts`, `confirmByAt`, opening hours) | shared functions inside the module | The same invariants as a single event |
| Move and cancel a part session | reuse, guarded | `activities` (`activities.occurrences.update`, `.cancel`, `MoveOccurrenceDialog`, `/club/occurrences/[id]/edit`) | existing commands with a new club-event guard | One move path, one notice path (#356) |
| Calendars, declarations, deadline, attendance, coach page, score, unstaffed warning, coach units | reuse unchanged | `activities` | session reads | The part is an ordinary session |
| Moved and cancelled notices | reuse unchanged | `activities`, `communication` (`notify-occurrence-moved`, `session-moved`, `session-cancelled`) | `activities.occurrence.updated` / `.cancelled` | REQ-A09 and the cancellation path |
| Places and the external flag | reuse | `club_core` (`/api/club_core/options/places`, `clubCoreDirectory.placeOptions`) | option route, DI directory | Places stay `club_core`'s |
| Add an external place | extend | `club_core` (new command `club_core.places.add_external`, route, feature) | route called by the event forms | `club_core` owns places (DD-T08) |
| Owner institution picker | reuse | `club_core` (`GET /api/club_core/institutions/options`, readable by a coordinator) | option route | names only |
| Visiting teams | reuse | `groups` (`/api/groups/external-teams`, `ExternalTeamForm.tsx` fields) | ids on the part; copied into `invited_external_team_ids` | The dictionary exists (DD-T09) |
| Coach picker | reuse | `activities` (`GET /api/activities/options/coaches`, `useAssignCoach`) | option route | Free coaches first |
| Poster and logos | reuse pattern | platform `attachments`; `club_core` place files as the model; `@vereino/core` `checkFileBytes` | `attachmentService` (`readUploadForm`, `persistLink`, `readScoped`) | One file pattern (DD-T10) |
| Public tournament page | extend | `club_core` (`clubCorePublicSite`, `public-shared.ts` `publicRoute`, `fileResponse`, `PublicFrame.tsx`) | optional DI `activities.publicEvents` gains `clubEvent()` and `clubEventFile()` | One slug lookup and frame (DD-T11) |
| P-06 card | extend | `activities` (`lib/public-events.ts`, `services/public-events.ts`), `club_core` (`PublicEventsView.tsx`) | the same contribution | DD-T12 |
| "Club events" in More | extend | `@vereino/ui` (`packages/ui/src/member/member-nav.ts` `MEMBER_MORE_DESTINATIONS`) | nav data | D-029 |
| Panel menu entry | extend | `activities` backend pages under the activities sidebar group (today "Harmonogram" / Schedule; "Zajęcia" / Classes once the navigation spec renames it) | page metadata | navigation spec |

The installed records that stay the source of truth: places and institutions in `club_core`, groups and external teams in `groups`, persons in `people`, files in the platform's `attachments`, threads and e-mails in `communication`, notifications in the platform's `notifications`.

## Architecture and Data Flow

```text
Panel B-T1/B-T2/B-T3 and phone /club/club-events/*
  -> GET  /api/activities/club-events/options            (sections, groups with age category, places with isExternal)
  -> POST /api/club_core/places/external                 -> club_core.places.add_external (feature club_core.places.add_external)
  -> POST|PUT /api/activities/club-events                -> activities.club_events.create | update
                                                              update with a new place -> moves planned future part sessions
                                                                -> activities.occurrence.updated { change: place } per session
                                                                   -> notify-occurrence-moved, communication:session-moved (REQ-A09)
  -> POST /api/activities/club-events/{id}/cancel         -> activities.club_events.cancel
                                                              -> per part session: activities.occurrence.cancelled (existing notices)
  -> POST /api/activities/club-events/{id}/parts          -> activities.club_event_parts.create
                                                              part with a group: Activity(club_event_id) + Occurrence, lockSchedule,
                                                              findConflicts (club place: full; external: coach only)
                                                              -> activities.activity.created, activities.occurrence.generated
  -> PUT|DELETE …/parts/{partId}, POST …/parts/{partId}/cancel (open part)
  -> POST|DELETE …/{id}/files                             -> activities.club_event_files.add | delete (attachments)
  -> GET  /api/groups/external-teams, POST (add in place) (groups, unchanged)
  -> PATCH /api/activities/occurrences/{id}, POST …/cancel (part session; guarded: managers of the club event)

Member calendar, Today, session page (guardian, participant, coach)
  -> GET /api/activities/calendar[/{id}]  items gain clubEvent { id, name, publicPath | null }

Guest
  /p/{club}/events                -> GET /api/club_core/public/{club}/events          -> activities.publicEvents.events()   (club event = one card)
  /p/{club}/events/{eventSlug}    -> GET /api/club_core/public/{club}/events/{slug}   -> activities.publicEvents.clubEvent()
  poster, logos                   -> GET …/events/{slug}/files/{fileId}               -> activities.publicEvents.clubEventFile() -> fileResponse
```

- **Module boundaries:** no new module. `activities` owns club events, parts and files. `club_core` owns places and the public pages, and reads the event only through the optional contribution `activities.publicEvents` (`hasRegistration`); without it the tournament page answers 404 and P-06 lists nothing, as today. `activities` reads places, institutions' names, groups, sections and external teams through its existing directory (`activities/services/directory.ts`), never by import of another module's entities. `groups` and `club_core` do not import `activities`.
- **Extension points:** the optional DI contribution `activities.publicEvents` (two new optional methods), the `club_core` ACL feature, member pages under `activities/frontend/club/`, backend pages under `activities/backend/`, the public page under `club_core/frontend/p/`, the More list in `@vereino/ui`.
- **Alternatives considered:** a separate module for club events (rejected: the part's activity and session must be written in the event's transaction, DD-T01); creating the external place inside the `activities` command (rejected: a cross-module write, DD-T08); a public page in `activities` (rejected: DD-T11).
- **Compatibility:**
  - **Additive:** the new tables and the nullable column `activities_activities.club_event_id`; new routes, commands, error codes and the feature; the optional response fields `clubEvent` (calendar and session reads), `clubEventId` (activities list and record), `isExternal` (places of `GET /api/activities/events/options`); new optional methods of the DI contribution `PublicEventsProvider`; new P-06 entry fields `kind`, `clubEventSlug`, `partsCount`.
  - **Contract change — needs the owner's approval:** on P-06 (`GET /api/club_core/public/{clubSlug}/events`) an entry of `kind: "club_event"` of a whole-club event has `section: null` and `sectionLogo` of the club; the response schema's `section` becomes nullable (a narrowing of BC §2), and the parts of a club event stop appearing as separate entries.
  - **Behaviour change — needs the owner's approval:** `activities.activities.update` and `.delete` answer 409 `activity_is_club_event_part` for a part's activity; `activities.occurrences.update` and `.cancel` answer 403 `club_event_part_managed_by_event` to a coach and to a coordinator who does not manage the part's club event, and 422 `club_event_part_place_fixed` for a place change of a part session; a part session at an external place checks only the coach.
  - **BC tiers** (`BACKWARD_COMPATIBILITY.md`, tier table). Every surface below is a Vereino surface of the tier "Protected at first deployment", except the merged migrations, which are "Protected now" (§5) and only ever added to:

    | Surface | BC section | Change | Kind |
    |---|---|---|---|
    | `/api/activities/club-events*`, `/api/club_core/places/external`, `/api/club_core/public/{clubSlug}/events/{eventSlug}*` | §2 | new routes | additive |
    | `/api/activities/calendar*`, `/api/activities/occurrences/{id}`, `/api/activities/activities*`, `/api/activities/events/options` | §2 | new optional fields | additive |
    | `/api/club_core/public/{clubSlug}/events` | §2 | new entry kind; `section` nullable for it; parts folded into it | additive; one narrowing |
    | Error codes in `activities/lib/error-codes.ts`, `club_core/lib/error-codes.ts` | §3 | new codes; existing commands answer them for parts | additive |
    | ACL feature `club_core.places.add_external`; role catalogue (coordinator) | §4 | new id; one role widened | additive |
    | Command ids (`activities.club_events.*`, `activities.club_event_parts.*`, `activities.club_event_files.*`, `club_core.places.add_external`) | §4 | new ids | additive |
    | DI contribution `activities.publicEvents` (`PublicEventsProvider`, `PublicEventEntry`) | §4 | two optional methods; optional entry fields; `sectionSlug` nullable for a club event | additive; one narrowing inside Vereino |
    | Schema: `activities_club_events`, `activities_club_event_parts`, `activities_club_event_files`, `activities_activities.club_event_id` (migrations T1, T2) | §5 | new tables; one nullable column | additive |
    | i18n keys | §6 | new keys in `activities` and `club_core` | additive |

    **Shared environment:** `BACKWARD_COMPATIBILITY.md` still lists "confirm that no Railway `staging`/`production` service exists" as an open gap. While none exists, the narrowing of P-06 lands in one PR with its only consumer (`PublicEventsView.tsx`). The PR of phase 6 confirms before merging that no shared environment is deployed; if one is, it stops and asks the owner.
  - **Superseded in the club spec** (`.ai/specs/2026-10-20-vereino-club-management.md`; bodies unchanged, see the changelog entry):
    - glossary *One-off event*: a one-off activity with a `club_event_id` is a part of a club event and is changed through it (DD-T02, DD-T06);
    - glossary *Activity* and D-002: a club event groups one-off activities; it is not an activity (DD-T01);
    - REQ-025, DD-23 and the UI row `/p/[clubSlug]/events`: a published club event is one card on P-06 and has its own page `/p/[clubSlug]/events/[eventSlug]` (REQ-T09, REQ-T10);
    - *Users, Permissions, and Scope*, coordinator row: gains `club_core.places.add_external` (REQ-T06).
  - **Superseded in the navigation spec** (`.ai/specs/2026-11-14-vereino-parity-navigation-and-naming.md`): REQ-N13 and its UI row P-06 — a club event is listed once, needs no public group, and links to its tournament page; "Past (last 60 days)" counts from its first part's start, as for a single event.
  - **Superseded in the groups and activities parity spec** (`.ai/specs/2026-11-14-vereino-parity-groups-and-activities.md`): DD-A05 and the rule "Who edits a session" — a coach does not edit or cancel a part session (DD-T06); the rule "Collision check with a typed venue" — also applies to a part session at an external place (DD-T07); REQ-A09 — a change of a club event's place is announced once per moved part session.

### Dependencies on the other specs

| Spec | Direction | What | Where in this spec |
|---|---|---|---|
| A `2026-11-14-vereino-parity-groups-and-activities.md` | T needs A | The deadline (phase 4, #269), the session edit page (phase 5, #270), the moved notices (phase 6, #271), the coordinator's phone session block (phase 8, #273) — all merged at `adaf8a43` | phases 1, 5 |
| N `2026-11-14-vereino-parity-navigation-and-naming.md` | T needs N | P-06 (#263, merged), the More list (#258, merged), the activities sidebar group ("Harmonogram" today, "Zajęcia" after N phase 1) | phases 3, 5, 6 |
| R `2026-11-14-vereino-parity-facilities.md` | T needs R | Opening hours of a club place for one-off events (REQ-R19, #363, merged); external places are not bookable (`isBookablePlace`) | phase 1 |
| L `2026-11-14-vereino-people-life-cycle-and-data-entry.md` | none | The institution picker of REQ-L14 is reused as is | phase 2 |

## User Journeys

The example of every journey and test is the club's real tournament, as the poster "Halowy turniej piłki nożnej PRZYKŁAD CUP 2026" announces it. The club is LKS Przykład Dolina; the section is "Akademia piłkarska" with the mockup's eight groups (`app.ts:287-294`); Rafał Malinowski coordinates the section and coaches "Orlik młodszy"; Joanna Wiśniewska is the club administrator; Kasia Nowak is the guardian of Jaś (Orlik młodszy). End times the poster gives as "~" are entered as given; the Kids match is entered 14:00–15:00 and the seniors' tournament 8:30–14:00 (the poster names no end).

### Journey J-T01 — The coordinator sets up Przykład Cup on the phone

1. Rafał opens More → **Club events** on `/club` and taps **New club event**. He types "PRZYKŁAD CUP 2026"; the slug field proposes `przyklad-cup-2026`. The section is preselected as "Akademia piłkarska" (his only section).
2. He opens the place picker and types "Zielony Las". "Boisko Wisły Brzezie" shows with the "external" mark; the hall is missing. He taps **Add place**: name "Hala sportowa w Zielonym Lesie", address "ul. Szkolna 50, Zielony Las", kind "Hall", owner "Gmina Zielony Las". The sheet closes with the new place chosen and marked external; it will be on the list next time.
3. He adds the description, sets the default gathering to 30 minutes and the default deadline to 48 hours, leaves "Public" off and saves. The event page opens with "No parts yet" and **Add part**.
4. He adds "Turniej Orlika Młodszego": Saturday 21.11, 9:00–14:00, group "Orlik młodszy" (the category "Orlik młodszy" is proposed from the group, the coach "Rafał Malinowski" from the roster), type Tournament, visiting teams "Wisła Brzezie" and "Orzeł Brzozów" from the list, and **Add team** "UKS Sąsiedni" with its club. Saved: the part card shows the time, the group and three teams.
5. He taps **Copy** on that card, changes the title to "Turniej Żaka Młodszego", the time to 14:30–16:30, the group to "Żak młodszy", and saves. He repeats for Sunday 22.11 (Trampkarz 9:00–11:00, Żak starszy 11:30–13:30, Kids 14:00–15:00 as type Event, Skrzat 15:00–16:30) and Sunday 29.11 (Młodzik starszy 9:00–12:30, Orlik starszy 13:00–15:00).
6. For Saturday 28.11 he adds "Turniej Drużyn – Seniorzy (16+)" at 8:30–14:00 with **No club group** and the category "Seniorzy (16+)". It is accepted because the hall is external.
7. Failures: a group of another section answers 422 `club_event_part_outside_section` on the group field; an open part at a club place answers 422 `club_event_open_part_needs_external_place`; Rafał coaching two parts at overlapping times answers 409 with the colliding sessions and saves nothing; a lost connection keeps the form and offers **Try again**.

### Journey J-T02 — The administrator adds the poster and the funders and publishes

1. Joanna opens Harmonogram → **Club events** ("Imprezy klubowe") in the panel and the record "PRZYKŁAD CUP 2026" (`?tab=details`). She sees the nine parts on the Parts tab grouped by day.
2. On the Files tab she uploads the poster (a 3.1 MB JPEG) and four funder logos: "Aktywni lokalnie", "Ministerstwo Sportu i Turystyki", "Fundacja Orły Sportu", "Gmina Zielony Las", each with its name.
3. On Details she switches "Public" on and saves. The header shows **Public page** linking to `/p/przyklad/events/przyklad-cup-2026`; the club publishes the `events` block already.
4. Failures: an SVG logo renamed `.png` answers 422 `club_event_file_format_unsupported`; a 7 MB poster answers 422 `club_event_file_too_large`; a 13th logo answers 422 `club_event_funders_limit`; a stale record answers 409 with the shared conflict message.

### Journey J-T03 — A guardian sees only her child's part

1. On Monday Kasia opens `/club`. Today and the calendar show one new card on Saturday 21.11: "Turniej Orlika Młodszego", 9:00–14:00, gathering 8:30, "Hala sportowa w Zielonym Lesie · map", the line "PRZYKŁAD CUP 2026" with a link to the public page, and "Confirm by Thu 19.11, 09:00". No other part of the tournament is in her calendar.
2. She opens the session page: the visiting teams (Wisła Brzezie, Orzeł Brzozów, UKS Sąsiedni), the coach, the map link. She confirms Jaś.
3. On Friday Rafał moves the part to 9:30 from the event page; Kasia gets the moved notice in the thread, in the app and by e-mail (REQ-A09).
4. Failures: after the deadline the controls close with "Deadline passed" (REQ-A07); a guardian whose child is in no part sees nothing of the tournament in the app.

### Journey J-T04 — A visitor opens the tournament page from the poster

1. A parent of a UKS Sąsiedni player scans the QR code on the poster and lands on `/p/przyklad/events/przyklad-cup-2026`.
2. The page shows the poster, "PRZYKŁAD CUP 2026", "21–29.11.2026", "Hala sportowa w Zielonym Lesie, ul. Szkolna 50, Zielony Las · map", the description, and four days: Saturday 21.11 with two parts, Sunday 22.11 with four, Saturday 28.11 with the seniors, Sunday 29.11 with two. Each part shows its time, category, "Orlik młodszy · Akademia piłkarska" (linking to the section page) and the visiting teams. Below: "Organised by LKS Przykład Dolina" and the funders' logos.
3. From P-06 (`/p/przyklad/events`) the same visitor sees one card "PRZYKŁAD CUP 2026 · 21.11–29.11 · Hala sportowa w Zielonym Lesie · 9 parts" and follows it.
4. Failures: while "Public" is off or the club turns the Events menu off, the page answers "This event is not published" with a link to the club page; an unknown slug answers the same; after 29.11 the card moves to "Past" and stays 60 days after 21.11.

### Journey J-T05 — A part is cancelled, and the whole event is moved

1. On Thursday the municipality takes the hall on Saturday morning. Rafał opens the Orlik młodszy part card on the phone and taps **Move**: the existing session edit opens with the place locked to the event's place; he sets 15:00–19:00 and saves. Only the families of Orlik młodszy are told.
2. The Żak młodszy part loses its slot; Rafał taps **Cancel** with the reason "Hala zajęta". The existing cancellation notice reaches the families of Żak młodszy only.
3. A week later the hall is closed for repairs; Joanna changes the event's place to the club's "Salka w budynku klubowym". The form lists the parts that would collide at the club's own place and saves nothing; she resolves them by moving two parts, then saves. Each moved part's families get one moved notice; the open seniors' part blocks the change (422 `club_event_open_part_needs_external_place`) until she removes or cancels it.
4. If the tournament is called off, Joanna taps **Cancel club event** with a reason; each family with a child in a future part gets the cancellation of that part, the public page shows "Cancelled" and P-06 strikes the card through.

### Journey J-T06 — The coach runs his part, and keeps his own single events

1. On Saturday Rafał, as the coach of Orlik młodszy, opens the part's session page: Attendance list, Message the group, score; there is no **Edit** and no **Cancel** for him as a coach, because the part belongs to the club event (as the coordinator of the section he moves it from the event page).
2. Piotr, the coach of Trampkarz who coordinates nothing, opens his part's session: he reports an absence; the coordinator assigns a substitute as today. He tries `PATCH /api/activities/occurrences/{id}` from a stale tab and gets 403 `club_event_part_managed_by_event`.
3. Piotr still creates a sparring for Trampkarz from `/club/events/new` the next week, unchanged.

## UI and Interaction Contracts

The closest installed references: `activities/components/ActivitiesTable.tsx` and `ActivityRecord.tsx` (list and record), `groups/components/GroupRecord.tsx` (tabs under `?tab=`), `activities/components/EventForm.tsx` (one-off event `CrudForm`), `club_core/components/PlaceFilesPanel.tsx` (uploads with a list), `activities/components/MoveOccurrenceDialog.tsx` and `CancelOccurrenceDialog.tsx`, `activities/components/club/ClubEventPage.tsx` (member form with a sticky submit bar), `activities/components/club/ClubSessionEditPage.tsx`, `club_core/components/public/PublicEventsView.tsx` and `PublicFrame.tsx`. `.ai/guides/backend-ui.md` applies to panel pages; implementation invokes `om-backend-ui-design`. Member pages use `MemberShell` and the member components of `@vereino/ui`. Every reference field is a picker backed by a scoped option source, never a typed id.

| Surface / route | Purpose and primary actions | Data source / mutations | Closest installed reference | Canonical shell / components | Required states | Requirement IDs |
|---|---|---|---|---|---|---|
| `/backend/activities/club-events` (B-T1, new) | List: Name, Dates, Place (external badge), Section or "Whole club", Parts, Public badge, Status; views Upcoming / Past / Cancelled under `?view=`; section filter; "New club event" | `GET /api/activities/club-events` | `ActivitiesTable.tsx` | `DataTable`, `StatusBadge`, `EmptyState` | loading, empty with "New club event", filtered-empty, error | REQ-T11 |
| `/backend/activities/club-events/create` (B-T2, new) | Name, slug (proposed), section (the caller's sections; "Whole club" for the administrator), place picker with external marked and **Add place** dialog, description, Public, default gathering and deadline | `GET /api/activities/club-events/options`, `POST /api/club_core/places/external`, `POST /api/activities/club-events` | `EventForm.tsx` | `CrudForm`, `Dialog` with `CrudForm` fields, `LookupSelect` | field problems, 409 slug, 409 `external_place_exists` (offers to pick it), 403 | REQ-T01, REQ-T05, REQ-T06 |
| `/backend/activities/club-events/[id]` (B-T3, new) | Tabs Details / Parts / Files under `?tab=`, default `parts`; header: Public page link (when public), **Cancel club event**. Details: the B-T2 form (edit). Parts: `DataTable` grouped by day — Time, Title, Category, Our group (Section), Visiting teams, Coach, Status; toolbar **Add part**; row actions Edit, Copy, Move, Cancel, Remove. Files: poster with preview and **Replace**, funder logos with name and **Remove** | `GET /api/activities/club-events/{id}`, `PUT /api/activities/club-events`, `POST …/{id}/cancel`, `POST/PUT/DELETE …/parts…`, `POST …/parts/{partId}/cancel`, `PATCH /api/activities/occurrences/{id}`, `POST …/occurrences/{id}/cancel`, `POST/DELETE …/{id}/files` | `GroupRecord.tsx`, `PlaceFilesPanel.tsx`, `OccurrencesTable.tsx` | platform tabs, `CrudForm`, `DataTable`, `RowActions`, `Dialog`, `MoveOccurrenceDialog` (place locked), `CancelOccurrenceDialog`, `useConfirmDialog` | loading, not found, 403, empty parts with **Add part**, 409 collisions in the dialog, 409 `club_event_part_in_use` (offers Cancel), 409 version, upload progress and 422 file codes | REQ-T01, REQ-T02, REQ-T04, REQ-T05, REQ-T08, REQ-T11 |
| Part dialog (B-T3) | Title, day, start, end (day and times read-only for a part with a group after creation, with a **Move** link), group or "No club group", category (proposed), type (by group kind), coach (proposed from the roster; after creation read-only with a **Change coach** link to the existing sheet or dialog), gathering, deadline (for a `confirm` kind), visiting teams with **Add team** | `GET /api/activities/club-events/options`, `GET /api/activities/options/coaches`, `GET/POST /api/groups/external-teams` | `ActivityForm.tsx` invited teams, `ExternalTeamForm.tsx` | `Dialog` with `CrudForm` fields, multi-select chips | as above; `?copyOf=` prefill | REQ-T02, REQ-T04, REQ-T07 |
| `/backend/activities/activities` (B-13), `/backend/activities/occurrences/[id]` | A part's activity row shows "Part of {event}" linking to B-T3 and no Edit; the session record shows the same link | additive `clubEventId` / `clubEvent` | `ActivitiesTable.tsx`, `OccurrenceRecord.tsx` | existing | unchanged | REQ-T02 |
| `/club/club-events` (new) | Phone list: upcoming and past club events of the caller's scope as cards; **New club event** | `GET /api/activities/club-events` | `ClubCalendarPage.tsx` list | member list, cards | loading, empty ("No club events yet" + New club event), error with retry | REQ-T12 |
| `/club/club-events/new`, `/club/club-events/[id]/edit` (new) | Phone form of B-T2; **Add place** as a bottom sheet; submit in a sticky bar | as B-T2 | `ClubEventPage.tsx` | member form, bottom sheet, `Select`, `Input`, `Switch`, `Textarea` | as B-T2 | REQ-T01, REQ-T05, REQ-T06, REQ-T12 |
| `/club/club-events/[id]` (new) | Phone event page: facts, Public page link, days with part cards (time, title, category, group, teams count, status); card menu Edit, Copy, Move (→ `/club/occurrences/[id]/edit?as=coordinator`), Cancel, Remove; **Add part**; files block (poster, logos) with camera or file upload; **Cancel club event** last | `GET /api/activities/club-events/{id}` and the B-T3 mutations | `ClubSessionPage.tsx`, `CoachSessionBlock.tsx` | member page, bottom sheets, `useConfirmDialog` | loading, not found, 403, empty parts, 409s with refresh, upload errors | REQ-T02, REQ-T04, REQ-T08, REQ-T12 |
| `/club/club-events/[id]/parts/new`, `/parts/[partId]/edit` (new) | Phone part form (as the part dialog); `?copyOf=` | as the part dialog | `ClubEventPage.tsx` | member form | as the part dialog | REQ-T02, REQ-T04, REQ-T12 |
| `/club/occurrences/[id]/edit` | For a part session: place shown read-only ("the club event's place"); time, gathering and deadline editable for the event's managers | `PATCH /api/activities/occurrences/{id}` | `ClubSessionEditPage.tsx` | existing | 422 `club_event_part_place_fixed`, 403 `club_event_part_managed_by_event` | REQ-T05, REQ-T12 |
| `/club`, `/club/calendar`, `/club/occurrences/[id]` (M-02, M-03, M-04) | Card and session page of a part: the line "{event name}" with a link to the public page when published; visiting teams on the session page; no Edit and no Cancel for a coach on a part | additive `clubEvent` on the calendar reads; `mayEdit`, `mayCancel` false for a coach on a part | `SessionCardFacts.tsx`, `ClubSessionPage.tsx` | existing | unchanged | REQ-T03 |
| `/p/[clubSlug]/events` (P-06) | A club event card: poster thumbnail or section/club logo, name, date range, place with a map link for an external place, "{n} parts", the section or nothing for a whole-club event; link to the tournament page | `GET /api/club_core/public/{clubSlug}/events` | `PublicEventsView.tsx` `PublicEventCard` | cards, `StatusBadge` | unchanged states; cancelled card struck through | REQ-T10 |
| `/p/[clubSlug]/events/[eventSlug]` (P-T1, new) | Tournament page: poster, name, dates, status, place with address and map link, description, days with parts, "Organised by {club}", funders | `GET /api/club_core/public/{clubSlug}/events/{eventSlug}`, `…/files/{fileId}` | `PublicEventsView.tsx`, `PublicSectionView.tsx` | `PublicFrame`, cards, `StatusBadge` | loading skeleton, error with retry, 404 "not published" with the club page link, cancelled banner, cancelled parts struck through | REQ-T09 |

### UI architecture

| Role | Navigation groups in order | Dashboard / injected widgets | Login-to-primary-task flow |
|---|---|---|---|
| Section coordinator (phone) | Bottom bar as the navigation spec defines; More → **Club events** (new entry, features `activities.manage`) | none | `/club` → More → Club events → New club event: 3 taps and the form |
| Club administrator (panel) | Harmonogram → … Activities, **Club events** (new), Sessions … | none | Harmonogram → Club events → record → Parts → Add part: 4 clicks |
| Guardian, participant (phone) | as today | the part card on Today and in the calendar | `/club` → card → session page: 1 tap |
| Coach (phone) | as today | the part card in the coach's calendar | unchanged |
| Guest | public menu Club · Sections · Facilities · Events | — | Events → card → tournament page: 1 tap; or the poster's QR code |

| Surface / widget | Empty state guidance and action | Responsive behavior | Keyboard / focus behavior |
|---|---|---|---|
| B-T1 list | "No club events yet. A club event holds a tournament's parts by day." + New club event | Columns Section and Parts hide under 640 px | Views are a tablist; `?view=` without a reload |
| B-T3 Parts tab | "No parts yet. Add the first part: a day, a time and the group that plays." + Add part | Row actions collapse into the menu under 1024 px; day headings stay | The dialog traps focus; Escape cancels; Ctrl/Cmd+Enter saves; focus returns to the row |
| Place picker with Add place | "No place matches. Add it as an external place." + Add place | Bottom sheet at 375 px | The search field is focused; the new place is selected and announced (`aria-live="polite"`) |
| Phone event page | "No parts yet" + Add part | One column; the sticky bar above the bottom navigation | Card menus are buttons with labels naming the part |
| Tournament page | — (404 state instead) | One column at 375 px; the poster scales to the width; logos wrap | Day headings are `h2`, parts are a list; the map link names the place |

### `/backend/activities/club-events/[id]?tab=parts` — Parts

```text
┌──────────────────────────────────────────────────────────────────────────────┐
│ PRZYKŁAD CUP 2026                        [Public page ↗] [Cancel club event]  │
│ 21–29.11.2026 · Hala sportowa w Zielonym Lesie [external] · Akademia piłkarska     │
│ [Details] [Parts] [Files]                                                    │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                               [Add part]     │
│ Saturday 21.11                                                               │
│ 09:00–14:00  Turniej Orlika Młodszego  Orlik młodszy  Orlik młodszy (Akad.)  │
│              3 teams   Rafał Malinowski   planned                         ⋯ │
│ 14:30–16:30  Turniej Żaka Młodszego    Żak młodszy    Żak młodszy (Akad.)    │
│              2 teams   —  [needs a coach]  planned                         ⋯ │
│ Saturday 28.11                                                               │
│ 08:30–14:00  Turniej Drużyn – Seniorzy  Seniorzy (16+)  [no club group]      │
│              6 teams                        planned                        ⋯ │
└──────────────────────────────────────────────────────────────────────────────┘
Row menu — part with a group: Edit · Copy · Move · Cancel · Remove (unused only); open part: Edit · Copy · Cancel · Remove.
```

- **Behavior:** rows sort by start, then title; a cancelled part stays, struck through, with its reason. "Move" opens `MoveOccurrenceDialog` with the place locked. "Remove" names the part and says that the families of its group will not be told (nothing was declared yet); when refused (409 `club_event_part_in_use`) the dialog offers Cancel. "Cancel club event" asks for a reason and states how many families will be told.
- **Responsive and accessibility:** the status badge carries text; dates and times in the user's locale; each row action's label names the part.
- **Localization:** `activities.clubEvents.*` in en and pl.
- **Design-system and theming:** `StatusBadge` variants only (never `brand`); checked in light and dark mode.

### `/club/club-events/[id]` — Event page (375 px)

```text
┌─────────────────────────────────────┐
│ ‹ Club events                       │
│ PRZYKŁAD CUP 2026        [planned]   │
│ 21–29.11 · Hala sportowa w Zielonym Lesie │
│ [external] · map · Public page ↗    │
│ [ Edit club event               ]   │
├─────────────────────────────────────┤
│ Saturday 21.11                      │
│ 09:00–14:00 Turniej Orlika Młodsz.  │
│ Orlik młodszy · 3 teams      ⋯      │
│ 14:30–16:30 Turniej Żaka Młodszego  │
│ Żak młodszy · 2 teams        ⋯      │
│ Sunday 22.11 …                      │
├─────────────────────────────────────┤
│ Poster · Funders (4)   [ Upload ]   │
├─────────────────────────────────────┤
│ [ Add part                      ]   │  ← sticky above the bottom bar
│ [ Cancel club event             ]   │
└─────────────────────────────────────┘
```

- **Behavior:** the card menu opens a bottom sheet with Edit, Copy, Move, Cancel, Remove (as the panel); Move opens `/club/occurrences/{id}/edit?as=coordinator`. Upload offers the camera and a file; the poster previews after the upload. Each action ends with a toast; a move or a cancellation names how many people were told (`notified`, as today).
- **Responsive and accessibility:** full-width 44 px buttons, the destructive one last; headings per day.
- **Localization:** `activities.clubEvents.club.*`.

### `/p/[clubSlug]/events/[eventSlug]` — Tournament page (375 px)

```text
┌─────────────────────────────────────┐
│ [club logo] LKS Przykład  Events     │
├─────────────────────────────────────┤
│ [ poster image, full width ]        │
│ PRZYKŁAD CUP 2026                    │
│ 21–29.11.2026                       │
│ Hala sportowa w Zielonym Lesie,           │
│ ul. Szkolna 50, Zielony Las · map        │
│ Halowy turniej piłki nożnej …       │
├─────────────────────────────────────┤
│ Saturday 21.11                      │
│ 09:00–14:00 Turniej Orlika Młodsz.  │
│ [Tournament] Orlik młodszy          │
│ Our team: Orlik młodszy ·           │
│ Akademia piłkarska                  │
│ Guests: Wisła Brzezie, Orzeł         │
│ Brzozów, UKS Sąsiedni           │
│ …                                   │
├─────────────────────────────────────┤
│ Organised by LKS Przykład Dolina │
│ Funded by [logo][logo][logo][logo]  │
└─────────────────────────────────────┘
```

- **Behavior:** times in the club's zone, dates formatted in the reader's locale; a cancelled event shows a banner with no reason (the reason is internal); a cancelled part is struck through with "cancelled". Logos carry the funder's name as alternative text.
- **Localization:** `club_core.public.clubEvent.*`.
- **Design-system and theming:** the public frame's tokens; light and dark mode.

## Data Models

### `activities_club_events` (new)

| Field | Type / nullability | Scope / index | Sensitive / encrypted | Lifecycle and validation |
|---|---|---|---|---|
| `id`, `tenant_id`, `organization_id`, `created_at`, `updated_at`, `deleted_at` | `ScopedEntityBase` | `activities_club_events_tenant_org_idx` | no | `updated_at` is the optimistic-lock version |
| `section_id` | `uuid`, nullable | `activities_club_events_org_section_idx` | no | null = whole club; a live active section of the club |
| `name` | `text` | — | no | 2–160, trimmed |
| `public_slug` | `text`, required | unique `activities_club_events_org_slug_unique` on (`organization_id`, `public_slug`) where `deleted_at is null` | no | 3–80, `^[a-z0-9]+(-[a-z0-9]+)*$`; proposed from the name |
| `description` | `text`, nullable | — | no (public text) | ≤ 4000 |
| `place_id` | `uuid`, required | `activities_club_events_org_place_idx` | no | a live active leaf of `club_core_places` (scalar id) |
| `gathering_minutes_before` | `integer`, nullable | — | no | as an activity's (DD-43); copied to new parts |
| `confirm_by_minutes_before` | `integer`, nullable | — | no | 1–20 160 (REQ-A07); copied to new parts |
| `is_public` | `boolean`, default false | — | no | — |
| `status` | `text`, default `planned` | — | no | `planned` → `cancelled` |
| `cancel_reason` | `text`, nullable | — | no | 3–500; check `activities_club_events_cancel_reason`: `(status = 'cancelled') = (cancel_reason IS NOT NULL)` |

### `activities_club_event_parts` (new)

| Field | Type / nullability | Scope / index | Sensitive / encrypted | Lifecycle and validation |
|---|---|---|---|---|
| `id`, scope and audit columns | `ScopedEntityBase` | `activities_club_event_parts_tenant_org_idx` | no | version `updated_at` |
| `club_event_id` | `uuid` | `activities_club_event_parts_org_event_idx` (`organization_id`, `club_event_id`) | no | same organization |
| `title` | `text` | — | no | 2–160; copied to the activity's `name` |
| `category_label` | `text`, nullable | — | no | ≤ 60 |
| `type` | `text` | — | no | `tournament`, `match`, `sparring`, `other`; copied to the activity's `type` |
| `activity_id` | `uuid`, nullable | unique `activities_club_event_parts_activity_unique` where `deleted_at is null` | no | set for a part with a group; null for an open part |
| `visiting_team_ids` | `uuid[]`, default `'{}'` | — | no | ≤ 32 live external teams; copied to the activity's `invited_external_team_ids` |
| `starts_at`, `ends_at` | `timestamptz`, nullable | — | no | open part only; `ends_at > starts_at` |
| `status` | `text`, nullable | — | no | open part only: `planned` / `cancelled` |
| `cancel_reason` | `text`, nullable | — | no | open part only, 3–500 |
| check `activities_club_event_parts_kind` | — | — | — | `(activity_id IS NOT NULL AND starts_at IS NULL AND ends_at IS NULL AND status IS NULL AND cancel_reason IS NULL) OR (activity_id IS NULL AND starts_at IS NOT NULL AND ends_at IS NOT NULL AND status IS NOT NULL)` |
| check `activities_club_event_parts_open_times` | — | — | — | `starts_at IS NULL OR ends_at > starts_at` |

### `activities_activities` (changed)

| Field | Type / nullability | Scope / index | Sensitive / encrypted | Lifecycle and validation |
|---|---|---|---|---|
| `club_event_id` | `uuid`, nullable | `activities_activities_org_club_event_idx` (`organization_id`, `club_event_id`) | no | set only by `activities.club_event_parts.create`; only on a one-off activity (`recurrence_rule IS NULL`; check `activities_activities_club_event_one_off`) |

### `activities_club_event_files` (new, phase 4)

| Field | Type / nullability | Scope / index | Sensitive / encrypted | Lifecycle and validation |
|---|---|---|---|---|
| `id`, scope and audit columns | `ScopedEntityBase` | `activities_club_event_files_tenant_org_idx` | no | soft delete |
| `club_event_id` | `uuid` | `activities_club_event_files_org_event_kind_idx` | no | — |
| `attachment_id` | `uuid` | unique `activities_club_event_files_attachment_unique` | no | written by `persistLink` in the upload transaction |
| `kind` | `varchar(16)` | partial unique `activities_club_event_files_poster_unique` (`organization_id`, `club_event_id`) where `kind = 'poster' and deleted_at is null` | no | `poster` / `funder_logo` |
| `funder_name` | `text`, nullable | — | no (an institution's name) | 2–120; check: `(kind = 'funder_logo') = (funder_name IS NOT NULL)` |
| `file_name`, `mime_type`, `file_size` | `text`, `text`, `int` | — | no | snapshot at upload |
| `position` | `int`, default 0 | — | no | upload order of the logos |

No change to `club_core`, `groups` or `communication` tables: an added external place uses the existing columns of `club_core_places`. The undo snapshots of the activity (`activitySnapshot`) gain `club_event_id`. Migrations are generated with `yarn db:generate` and their SQL is shown in the pull request before anyone applies it; the named check constraints and partial indexes are part of the migration and listed in the PR (as in `payments/migrations/Migration20261106204626_payments.ts`). Retention: club events stay with the club's history; a soft-deleted event keeps its rows.

## API, Command, and Error Contracts

| Method / command | Path / ID | Auth and feature gate | Input | Success response / event | Errors and concurrency | Requirement IDs |
|---|---|---|---|---|---|---|
| `GET` (`makeCrudRoute`) | `/api/activities/club-events` | auth + `activities.view`; club-wide for a coordinator, club for the administrator | `view` (`upcoming` \| `past` \| `cancelled`), `sectionId`, `search`, paging | `{ items, total, page, pageSize, totalPages }`; item: `id, name, publicSlug, sectionId, sectionName, placeId, placeName, placeExternal, dateFrom, dateTo, partsCount, isPublic, status, mayManage, updatedAt` | — | REQ-T11, REQ-T12 |
| `POST` / `activities.club_events.create` | `/api/activities/club-events` | auth + `activities.manage`; section in the coordinator's grant, or `club_admin` for `sectionId: null` | `{ name, publicSlug, sectionId \| null, placeId, description?, isPublic?, gatheringMinutesBefore?, confirmByMinutesBefore? }` | 201 `{ id }`; audit; undoable (removes the event and its parts while every part session is planned without declarations) | 403 `scope_denied`; 404 place; 422 `place_not_bookable`, lengths; 409 `club_event_slug_taken` | REQ-T01, REQ-T05 |
| `PUT` / `activities.club_events.update` | `/api/activities/club-events` | as create, on the stored event | `{ id, … }` + version | 200; when `placeId` changed: each moved part session emits `activities.occurrence.updated` with `change.kinds = ['place']`; `notified` total | 409 version; 409 collisions (every moved session checked, nothing saved); 422 `club_event_open_part_needs_external_place`, `club_event_section_fixed`; 409 `club_event_cancelled` | REQ-T01, REQ-T05, REQ-T07 |
| `GET` | `/api/activities/club-events/{id}` | auth + `activities.view`, scope as the list | — | the event with `parts[]` (part fields + for a part with a group `occurrenceId, groupId, groupName, sectionName, startAt, endAt, coachPersonId, coachName, status, cancelReason, gatheringAt, confirmBy, declaredCount`; for an open part its own times and status), `visitingTeams[]` per part (name, clubName), `files[]` (phase 4), `mayManage` | 404 | REQ-T02, REQ-T11 |
| `POST` / `activities.club_events.cancel` | `/api/activities/club-events/{id}/cancel` | as update | `{ reason }` (3–500) + version | 200 `{ cancelledSessions, notified }`; per session `activities.occurrence.cancelled` (existing notices); audit; undoable (restores the event and the sessions it cancelled, as the session cancel's undo does) | 409 version; 409 `club_event_cancelled` | REQ-T01 |
| `POST` / `activities.club_event_parts.create` | `/api/activities/club-events/{id}/parts` | as update | `{ title, categoryLabel?, type, groupId \| null, startsAt, endsAt, coachPersonId?, gatheringMinutesBefore?, confirmByMinutesBefore?, visitingTeamIds? }` | 201 `{ id, activityId \| null, occurrenceId \| null }`; for a part with a group `activities.activity.created` and `activities.occurrence.generated` (as a single event) | 422 `club_event_part_outside_section`, `club_event_open_part_needs_external_place`, `activity_type_requires_team`, `event_type_not_allowed`, `activity_times_inverted`, deadline codes, `club_event_parts_limit`; 409 collisions, `event_place_closed`, `club_event_cancelled` | REQ-T02, REQ-T04, REQ-T07 |
| `PUT` / `activities.club_event_parts.update` | `/api/activities/club-events/{id}/parts/{partId}` | as update | `{ title?, categoryLabel?, type?, visitingTeamIds?, gatheringMinutesBefore?, confirmByMinutesBefore? }`; an open part also `startsAt?, endsAt?`; `groupId` and `coachPersonId` refused (the coach changes through the existing Change coach, `activities.occurrences.assign_coach`, which keeps the substitution history) | 200; the activity's `name`, `type`, `invited_external_team_ids` and the session's gathering and deadline updated in the same transaction; a gathering change emits `activities.occurrence.updated` with `change.kinds = ['gathering']` (REQ-A09) | 409 version; 422 `club_event_part_group_fixed`; 422 deadline codes | REQ-T02, REQ-T04 |
| `DELETE` / `activities.club_event_parts.delete` | `/api/activities/club-events/{id}/parts/{partId}` | as update | version | 200; `activities.activity.deleted`; undoable | 409 `club_event_part_in_use`; 409 version | REQ-T02 |
| `POST` / `activities.club_event_parts.cancel` | `/api/activities/club-events/{id}/parts/{partId}/cancel` | as update | `{ reason }` + version | 200 (open part only) | 422 `club_event_part_has_session` (use the session cancel) | REQ-T02 |
| `POST` / `activities.club_event_files.add` | `/api/activities/club-events/{id}/files` (multipart: `file`, `kind`, `funderName?`) | as update | read through `attachmentService.readUploadForm`, checked by bytes | 201 `{ id, kind, fileName, mimeType, fileSize, url }`; a poster replaces the live one | 422 `upload_file_missing`, `club_event_file_too_large`, `club_event_file_format_unsupported`, `club_event_funders_limit`; 503 no attachment service | REQ-T08 |
| `DELETE` / `activities.club_event_files.delete` | `/api/activities/club-events/{id}/files/{fileId}` | as update | version | 200; undoable | 404; 409 version | REQ-T08 |
| `GET` | `/api/activities/club-events/options` | auth + `activities.manage` | — | `{ sections: [{ id, name }], groups: [{ id, name, kind, sectionId, sectionName, ageCategoryLabel }], places: [{ id, label, isExternal }], declarationKinds }` within the caller's scope; `no-store` | 401, 403 | REQ-T01, REQ-T02, REQ-T05 |
| `POST` / `club_core.places.add_external` | `/api/club_core/places/external` | auth + `club_core.places.add_external`; coordinator club-wide (`clubWideKinds`), administrator | `{ name, address, kind?, ownerInstitutionId? }` | 201 `{ id, name, label, isExternal: true }`; `club_core.place.created` (existing structure event); audit; undoable while unused | 409 `external_place_exists` with `details.placeId`; 422 `place_reference_invalid` owner; 400 lengths; undo 409 `place_in_use` | REQ-T06 |
| Command (changed) | `activities.activities.update`, `activities.activities.delete` | unchanged | unchanged | unchanged | 409 `activity_is_club_event_part` with `details.clubEventId` | REQ-T02 |
| Command (changed) | `activities.occurrences.update` (`PATCH /api/activities/occurrences/{id}`), `activities.occurrences.cancel` | unchanged gates; for a part session the caller must manage the club event | unchanged | unchanged (notices as today) | 403 `club_event_part_managed_by_event`; 422 `club_event_part_place_fixed` (place or venue in the input); for a part at an external place only the coach is checked | REQ-T05, REQ-T07 |
| `GET` (changed reads) | `/api/activities/calendar`, `/calendar/{id}`, `/api/activities/occurrences/{id}` | unchanged | unchanged | items gain `clubEvent: { id, name, publicPath \| null } \| null`; `mayEdit` and `mayCancel` false for a coach on a part session | — | REQ-T03 |
| `GET` (changed reads) | `/api/activities/activities`, `/api/activities/activities/{id}` | unchanged | unchanged | items gain `clubEventId` | — | REQ-T02 |
| `GET` (changed read) | `/api/activities/events/options` | unchanged | unchanged | `places[]` gain `isExternal` | — | REQ-T05 |
| `GET` (changed, public) | `/api/club_core/public/{clubSlug}/events` | none; rate limit | unchanged | entries gain `kind` (`event` \| `club_event`), `clubEventSlug`, `partsCount`; a whole-club event's entry has `section: null` and the club's logo | unchanged | REQ-T10 |
| `GET` (new, public) | `/api/club_core/public/{clubSlug}/events/{eventSlug}` | none; rate limit `club_core_public_club_event` | — | `{ club (frame), event: { name, slug, status, dateFrom, dateTo, description, place: { name, address, mapUrl }, poster: { url } \| null, funders: [{ name, logoUrl }], days: [{ date, parts: [{ title, category, type, startTime, endTime, cancelled, ourTeam: { groupName, section: { name, slug } \| null } \| { clubName } \| null, visitingTeams: [{ name, clubName }] }] }] } }`; `Cache-Control` as P-06 | 404 `public_page_not_found`, `public_events_disabled`, `public_club_event_not_found` (unknown, not public, no part); 429 | REQ-T09 |
| `GET` (new, public) | `/api/club_core/public/{clubSlug}/events/{eventSlug}/files/{fileId}` | none; rate limit | — | the bytes through `fileResponse` (`nosniff`) | 404; 429 | REQ-T08, REQ-T09 |
| DI (changed, optional methods) | `activities.publicEvents` (`PublicEventsProvider` in `club_core/services/public-blocks.ts`): `clubEvent?(ctx, eventSlug) → PublicClubEvent \| null`, `clubEventFile?(ctx, eventSlug, fileId) → { attachmentId, owner, assignment, mimeType } \| null` | called by `club_core` only, inside the slug-derived scope, after the publication check | as typed | — | throws → the public 404 and a logged error | REQ-T08, REQ-T09 |

The custom routes keep per-method `metadata` and `openApi`. New error codes go to `activities/lib/error-codes.ts` and `club_core/lib/error-codes.ts` with en and pl messages (S6.7). Every mutation sends the version and surfaces 409 through the shared conflict helpers. The part and event commands lock the event row (`FOR UPDATE`) and, when they write a session, take `lockSchedule` as `activities.events.create` does, so a cancellation and a new part, or two new parts at one place, never interleave.

## Events, Jobs, Notifications, and Cross-Module Flows

| Trigger | Producer | Consumer | Side effect | Retry / idempotency / audit behavior |
|---|---|---|---|---|
| `activities.activity.created`, `activities.occurrence.generated` (part with a group created) | `activities` | existing consumers | as for a single event | unchanged |
| `activities.occurrence.updated` with `change` (part moved, event place changed, part gathering changed) | `activities` | `activities:notify-occurrence-moved`, `communication:session-moved` (existing) | moved notice to the part's audience, once per moved session | dispatch key `{id}:{updatedAt}` (DD-A09) |
| `activities.occurrence.cancelled` (part session cancelled, event cancelled) | `activities` | `activities:notify-occurrence-cancelled`, `communication:session-cancelled` (existing) | cancellation notice to the part's audience | unchanged |
| `activities.activity.deleted` (part removed) | `activities` | existing | as for a deleted activity | unchanged |
| `club_core.place.created` (external place added) | `club_core` | existing consumers | none new | unchanged |
| Schedules `activities:send-declaration-reminders`, `activities:warn-unassigned-sessions` | `activities` | — | apply to part sessions as to any session | unchanged |

No new event id, subscriber, job, notification type or e-mail template. An open part has no audience and sends nothing. The coach units report counts a part session as any session of its coach; a part session at a place the club rents (`rented_by_club`) counts in the rented-hours report as any session there (`facilities/services/rented-hours.ts`).

## Security, Privacy, and Compliance

- **Authorization:** feature gates plus record scope. A coordinator writes only events of their sections; a whole-club event needs the `club_admin` grant. The part-session guard is in the commands, so the panel, the phone pages and any API client get the same 403. `club_core.places.add_external` lets a coordinator create an external place with four fields and nothing else.
- **Tenant isolation:** every read and command takes `tenantId` and `organizationId` from the trusted context. The public routes narrow every query to the club found by its slug; the event is read by (`organization_id`, `public_slug`), never by a system-scope query. The DI methods receive that scope from `club_core`, never from the request.
- **Sensitive data:**
  - The public page carries no person data: no participant, no coach's name, no roster, no counts of declarations. Group and section names appear only for public groups in public sections (DD-29, DD-T12). Visiting teams show only their name and their club's name.
  - The external team's contact (encrypted, `groups/encryption.ts`) never leaves the staff surfaces.
  - The place's address is a public address; the add-place form's help text says "the venue's address, not a private one".
  - The cancellation reason of the event and of parts stays internal; the public page shows only "Cancelled".
  - The map link sends the place's name and address to OpenStreetMap only when the user taps it.
- **Abuse and failure modes:**
  - **Uploads:** the format is read from the bytes (`checkFileBytes`), never the name or declared type; SVG and HTML are refused; files are served with `nosniff` and the type they were checked as; sizes are bounded; the public file route checks the exact owner, assignment and partition (`fileResponse`).
  - **Enumeration:** an unknown, unpublished or empty event and a file of another event answer the same public 404; ids outside the caller's scope answer 404 or an empty list.
  - **Mail flood:** moving the event's place sends one notice per moved part session to that part's audience only; there is no notice per event. Each change is audited with its actor.
  - **Destructive actions:** removing a part is refused once anyone declared; cancelling the event asks for a reason and names how many families will be told; both are undoable.
  - **Place spam:** the add-place command refuses a duplicate name and address, and the administrator can deactivate or delete a place in B-06.

## Integration Coverage

| Test ID | Level | Setup / fixture | Actions | Assertions | Requirement IDs |
|---|---|---|---|---|---|
| TEST-T01 | integration | The academy section with the eight groups, a second section with a group, the coordinator Rafał, the administrator, the external hall, a club place | Create "PRZYKŁAD CUP 2026" as Rafał for his section; as Rafał with `sectionId: null`; as Rafał for the other section; a duplicate slug; update the description; cancel with a reason; update after cancelling | 201; 403 `scope_denied` twice; 409 `club_event_slug_taken`; 200; 200 with `cancelledSessions`; 409 `club_event_cancelled` | REQ-T01 |
| TEST-T02 | integration | The event at the external hall | Add the nine parts of the poster (eight with groups, the seniors open); add a part with a group of the other section; a `match` for a class group; a 41st part; read the event | eight activities with `club_event_id`, `recurrence_rule` null, `name` = title, `invited_external_team_ids` = the teams, one session each at the hall; the open part has its own times and no session; 422 `club_event_part_outside_section`; 422 `activity_type_requires_team`; 422 `club_event_parts_limit`; the read groups four days in order | REQ-T02, REQ-T04 |
| TEST-T03 | integration | The same event; Kasia (guardian of Jaś, Orlik młodszy), Ola (participant of another group), Rafał as coach | Read Kasia's and Ola's calendars; declare for Jaś before and after the deadline; read Rafał's coach calendar | Kasia sees only the Orlik młodszy part, with `clubEvent.name` and `publicPath` null while not public; Ola sees none; 200 then 409 `declaration_deadline_passed`; the coach sees his part with `mayEdit: false`, `mayCancel: false` | REQ-T03 |
| TEST-T04 | integration + security | The event; Piotr (coach of Trampkarz only); a coordinator of another section; Rafał; the administrator | Piotr PATCHes and cancels his part session; the other coordinator does; Rafał moves the Orlik part by an hour; Rafał PATCHes the part session with another `placeId`; Piotr records attendance and reports an absence on his part; `PUT /api/activities/activities` on a part's activity; `DELETE` likewise | 403 `club_event_part_managed_by_event` (×3); 200 with `notified` and one moved notice per recipient of Orlik młodszy; 422 `club_event_part_place_fixed`; attendance and absence accepted; 409 `activity_is_club_event_part` twice | REQ-T02, REQ-T03, REQ-T05 |
| TEST-T05 | integration | An event at a club place with capacity 1 and opening hours; the same at the external hall; one coach in two parts | Add two overlapping parts at the club place; at the external hall; add parts with the same coach overlapping at the hall; a part outside the club place's hours; read the facility calendar and occupancy of the club place and of the hall | 409 `occurrence_place_conflict` at the club place; both saved at the hall; 409 `occurrence_coach_conflict`; 409 `event_place_closed`; the club place's day shows its parts; no facility occupancy row or blocking interval is written for the hall | REQ-T07 |
| TEST-T06 | integration | The event with two future parts, one done part, one open part at the external hall; then the open part cancelled | Change the event's place to a club place with the open part live; cancel the open part; change the place to a club place where one part collides; free the slot; change again | 422 `club_event_open_part_needs_external_place`; 409 with the collision and nothing moved; 200: the two future sessions moved, the done one kept; one moved notice per moved session per recipient, none for the done one | REQ-T05 |
| TEST-T07 | integration + security | Rafał (coordinator), a coach, Gmina Zielony Las as an institution | Add "Hala sportowa w Zielonym Lesie", "ul. Szkolna 50, Zielony Las", owner Gmina Zielony Las as Rafał; add it again; as the coach; `PUT /api/club_core/places` on it as Rafał; read `/api/club_core/options/places` and `/api/activities/events/options` | 201 with `isExternal: true`, no parent, no public calendar; 409 `external_place_exists` with the id; 403 for the coach; 403 for the PUT; both option reads list it with `isExternal: true` | REQ-T06 |
| TEST-T08 | integration | The event; the attachment service; files: a 3 MB JPEG, a 7 MB PNG, an SVG renamed `.png`, a PDF, 13 small PNG logos | Upload the poster; a second poster; the large one; the SVG; the PDF as a poster; twelve logos with names, a thirteenth; a logo without a name; delete a logo and undo | one live poster (the second replaced the first); 422 `club_event_file_too_large`, `club_event_file_format_unsupported` (×2), `club_event_funders_limit`, 422 on the missing name; the deleted logo returns on undo | REQ-T08 |
| TEST-T09 | integration + security | Two clubs; club A publishes its page and the `events` block; the public event with files, an unpublished event, an event without parts; a part of a non-public group; club B with an event of the same slug | Read `/api/club_core/public/a/events/przyklad-cup-2026`; the unpublished slug; the empty one; club B's slug under club A; a file of the event; a file of the unpublished event; turn the `events` block off and read again | the page with poster, place, map link, four days, our team for public groups and the club's name for the non-public group's part, visiting teams without contacts, funders; 404 `public_club_event_not_found` (×3); 200 bytes with `nosniff`; 404; 404 `public_events_disabled`; no person data in any response | REQ-T09 |
| TEST-T10 | integration | Club A as in TEST-T09; a single public sparring; a whole-club event; a cancelled event; an event whose last part ended 30 days ago and first part 70 days ago | Read P-06 for all and with `?section=akademia` | one entry per club event (`kind: club_event`, `partsCount`), the parts not listed separately, the sparring listed as today; the whole-club event with `section: null` under "All" and under a section chip only when one of its public groups is in that section; the cancelled entry flagged; the old event not in "Past" | REQ-T10 |
| TEST-T11 | UI | The administrator in the panel, desktop and 1024 px, light and dark, en and pl | B-T1 → New club event → Add place dialog → save → Parts → Add part with Add team → Copy → Move (place locked) → Cancel → Remove (refused for a declared part) → Files upload → Public on | each state of the UI contract; the Move dialog shows the place read-only; 409 `club_event_part_in_use` offers Cancel; axe clean | REQ-T01, REQ-T02, REQ-T04, REQ-T05, REQ-T06, REQ-T08, REQ-T11 |
| TEST-T12 | UI | Rafał on a phone at 375 px, light and dark, en and pl | J-T01 steps 1–6 on `/club/club-events/*`; Move from a part card; upload the poster from a file; Cancel club event | the More entry is shown; the add-place sheet selects the new place; the copy prefills; the move opens `/club/occurrences/{id}/edit?as=coordinator` with the place locked; toasts name the people told; no `/backend` page is needed | REQ-T12 |
| TEST-T13 | UI | Kasia and Rafał (as coach) on a phone at 375 px; the event public | Today, calendar, session page | the part card shows the event line with the link; the session page lists the visiting teams; the coach's session page has no Edit and no Cancel | REQ-T03 |
| TEST-T14 | UI | A guest at 375 px and desktop, light and dark, en and pl | P-06 → the club event card → the tournament page; the unpublished state | poster, dates, place with the map link, days and parts, funders with alternative texts; the 404 state with the club page link; axe clean | REQ-T09, REQ-T10 |
| TEST-T15 | unit | `activities/lib/club-events.ts` (new: slug proposal and format, part kind rules, event dates, open-part rule, which part sessions an event place change moves, copy prefill), `lib/public-events.ts` (club event entries, folding parts, section chips, past window), `lib/public-club-event.ts` (new: the public view: days, our team, visiting teams), `lib/member-event.ts` (`isExternal`); `club_core/lib/places.ts` (duplicate key of an external place); `packages/ui/src/member/member-nav.ts` (the More entry) | every branch | 100 % line, branch and function coverage (`AGENTS.md`) | REQ-T02, REQ-T05, REQ-T06, REQ-T09, REQ-T10, REQ-T12 |
| TEST-T16 | security | Two tenants, each with a club event and parts; users of club A without `activities.manage` and a coordinator of another section | Call every staff route of phases 1 and 2 (`/api/activities/club-events*`, `/api/club_core/places/external`) across tenants and without the feature or section scope | 404 for the other tenant's ids, 403 without the feature or outside the section scope; nothing is written | REQ-T01, REQ-T02, REQ-T06 |

The integration tests live in `packages/app/.ai/qa/tests/activities/` and `club_core/`, and run with `yarn test:integration:vereino --filter TEST-Txx`. Fixtures build the example through the API (the poster's days are moved into the future relative to the test's clock, keeping their weekdays and times); tests that need a passed deadline write the offset so that the instant is already past. UI texts come from the catalogs through `uiText('<key>')`.

## Implementation Phases

Validation for each phase: `yarn verify`, the phase's integration tests, and for a migration the SQL review from `yarn db:generate` (no `yarn db:migrate` without the owner's approval). Each phase is one pull request and leaves a working app. Build order: 1 and 2 in parallel; then 3 and 7 in parallel; then 4, 5 and 6. New texts use the glossary's names and the names of Q-T09.

Implementation state (close-out #452, 2026-11-20): every phase landed — phase 1 Done (#426, story #376), phase 2 Done (#425, #377), phase 3 Done (#430, #378), phase 4 Done (#436, #379), phase 5 Done (#438 and the follow-up #441, #380), phase 6 Done (#439, #381), phase 7 Done (#428, #382). Left: tests for the parts of AC-T01, AC-T04 and AC-T11 named on the status line.

### Phase 1 — Club events and parts: data, commands and guards (API)

- **Depends on:** none (parity spec A phases 4–6 and 8 are merged)
- **Outcome:** a club event with parts exists through the API; parts with a group are sessions in the right calendars; part sessions are protected; collisions follow DD-T07.
- **Why this order / value delivered:** everything else reads this model; the guards must exist before any UI lets someone create parts.
- **Deliverables:**
  1. Migration T1: `activities_club_events`, `activities_club_event_parts`, `activities_activities.club_event_id` with its index and the check `activities_activities_club_event_one_off`; entities in `activities/data/entities.ts`; validators.
  2. `activities/lib/club-events.ts` (pure rules) with unit tests.
  3. Commands `activities.club_events.create|update|cancel`, `activities.club_event_parts.create|update|delete|cancel` with undo and audit; the part creation reuses the single-event logic of `commands/events.ts` (references, opening hours, `lockSchedule`, `findConflicts`) moved into a shared function; `findConflicts` callers pass the coach-only check for a part at an external place.
  4. Routes `/api/activities/club-events` (`makeCrudRoute` list, create, update), `/{id}`, `/{id}/cancel`, `/{id}/parts…`, `/options`, with `metadata` and `openApi`; error codes in en and pl.
  5. Guards: `activities.activities.update|delete` (409 `activity_is_club_event_part`); `activities.occurrences.update|cancel` (403 `club_event_part_managed_by_event`, 422 `club_event_part_place_fixed`, coach-only check at an external place); `sessionActionFlags` and the member reads set `mayEdit`/`mayCancel` false for a coach on a part.
  6. Reads: `clubEvent` on `/api/activities/calendar*` and `/api/activities/occurrences/{id}`; `clubEventId` on the activities list and record; `isExternal` on `/api/activities/events/options`.
- **Independent slices / estimated commits:** (a) migration, entities, rules: 1; (b) event and part commands and routes: 2; (c) guards and reads: 1.
- **Requirements closed:** REQ-T01, REQ-T02, REQ-T05 (API), REQ-T07; REQ-T04 (ids through the API)
- **Tests:** TEST-T01, TEST-T02, TEST-T03 (calendar reads and `mayEdit`/`mayCancel`), TEST-T04, TEST-T05, TEST-T06, TEST-T15 (activities rules part), TEST-T16 (club-event routes)
- **Exit gate:** the nine parts of the example created through the API; Kasia's calendar read shows one part; every guard answers its code.

### Phase 2 — An external place from the form

- **Depends on:** none
- **Outcome:** a coordinator adds a missing external place and it stays on the list.
- **Why this order / value delivered:** independent of phase 1; phases 3 and 5 use it.
- **Deliverables:**
  1. `club_core/acl.ts`: `club_core.places.add_external`; `packages/core/src/roles.ts`: the coordinator gains it (unit test of the catalogue).
  2. `club_core.places.add_external` (duplicate check on name and address, root external leaf, undo while unused), `POST /api/club_core/places/external`, error code `external_place_exists`.
  3. A shared `AddExternalPlaceDialog` (panel) and sheet (member) in `club_core/components/` reused by phases 3 and 5; the owner picker from `/api/club_core/institutions/options`.
- **Independent slices / estimated commits:** (a) feature, command, route: 1; (b) dialog and sheet: 1.
- **Requirements closed:** REQ-T06
- **Tests:** TEST-T07, TEST-T15 (club_core part), TEST-T16 (external place route)
- **Exit gate:** TEST-T07 green; after `yarn mercato auth sync-role-acls` an existing coordinator holds the feature.

### Phase 3 — Panel: list, form and record with parts (B-T1, B-T2, B-T3)

- **Depends on:** phases 1 and 2
- **Outcome:** J-T02 steps 1 and 3 and the panel half of J-T05 work.
- **Why this order / value delivered:** the administrator can enter a tournament end to end.
- **Deliverables:**
  1. `activities/backend/club-events/*` pages; the "Club events" ("Imprezy klubowe") menu entry in the activities sidebar group, next to Activities.
  2. `ClubEventsTable.tsx`, `ClubEventForm.tsx` (place picker with the external mark and the add-place dialog), `ClubEventRecord.tsx` (tabs), `ClubEventPartsTable.tsx`, `ClubEventPartDialog.tsx` (visiting teams with "Add team" from the `ExternalTeamForm` fields, coach picker, `?copyOf=`), `MoveOccurrenceDialog` with a locked place.
  3. B-13 and the session record show "Part of {event}".
  4. i18n `activities.clubEvents.*` (en, pl).
- **Independent slices / estimated commits:** (a) list and form: 1; (b) record and parts: 2.
- **Requirements closed:** REQ-T11 (without the Files tab), REQ-T04 (UI)
- **Tests:** TEST-T11 (without the files steps)
- **Exit gate:** TEST-T11 in both locales, light and dark, at desktop and 1024 px.

### Phase 4 — Poster and funder logos

- **Depends on:** phase 1 (and phase 3 for the Files tab)
- **Outcome:** J-T02 step 2.
- **Why this order / value delivered:** the public page (phase 6) needs the images; the second migration stays small and separate.
- **Deliverables:**
  1. Migration T2: `activities_club_event_files`; entity; owner and assignment constants in `activities/lib/club-event-files.ts`.
  2. `activities.club_event_files.add|delete` (undo), the multipart route on the pattern of `club_core/api/uploads.ts` and `facilities/commands/incident-photos.ts`; error codes.
  3. The Files tab of B-T3 on the pattern of `PlaceFilesPanel.tsx`; `files[]` on the event read with staff image URLs (`/api/attachments/image/{id}`).
- **Independent slices / estimated commits:** (a) data and commands: 1; (b) tab: 1.
- **Requirements closed:** REQ-T08
- **Tests:** TEST-T08, TEST-T11 (files steps)
- **Exit gate:** TEST-T08 green; the SVG is refused by its bytes.

### Phase 5 — The coordinator and the administrator on the phone

- **Depends on:** phases 1–4
- **Outcome:** J-T01 complete and the phone half of J-T05.
- **Why this order / value delivered:** D-029: the coordinator organises from the phone.
- **Deliverables:**
  1. `activities/frontend/club/club-events/` pages: list, new and edit, event page, part new and edit; the add-place sheet of phase 2; uploads by camera or file.
  2. `ClubSessionEditPage.tsx` shows the locked place for a part session.
  3. `packages/ui/src/member/member-nav.ts`: More entry "Club events" (features `activities.manage`, `available: true`) with unit tests.
  4. i18n `activities.clubEvents.club.*`.
- **Independent slices / estimated commits:** (a) list and event page: 1; (b) forms: 1; (c) nav and files block: 1.
- **Requirements closed:** REQ-T12
- **Tests:** TEST-T12, TEST-T15 (`member-nav.ts` part)
- **Exit gate:** J-T01 on a 375 px phone in both locales, light and dark, without any `/backend` page.

### Phase 6 — The public tournament page and the P-06 card

- **Depends on:** phases 1 and 4
- **Outcome:** J-T04 complete.
- **Why this order / value delivered:** the page visitors, visiting clubs and funders look for (D-032 *Why*).
- **Deliverables:**
  1. `club_core/services/public-blocks.ts`: optional `clubEvent()` and `clubEventFile()`; `PublicEventEntry` gains `kind`, `clubEventSlug`, `partsCount`, nullable `sectionSlug` for a club event.
  2. `activities/services/public-events.ts` and `lib/public-events.ts`: fold parts into one club event entry; `lib/public-club-event.ts` (the public view) with unit tests.
  3. `club_core`: `clubCorePublicSite.publicClubEvent()` and `.clubEventFile()`, routes `/api/club_core/public/{clubSlug}/events/{eventSlug}` and `/files/{fileId}`, the page `frontend/p/[clubSlug]/events/[eventSlug]/page.tsx` with `PublicClubEventView.tsx` in the `PublicFrame`; the P-06 card for a club event in `PublicEventsView.tsx`.
  4. The confirmation that no shared environment is deployed (P-06 narrowing).
- **Independent slices / estimated commits:** (a) contribution and lists: 1; (b) routes and page: 1.
- **Requirements closed:** REQ-T09, REQ-T10
- **Tests:** TEST-T09, TEST-T10, TEST-T14, TEST-T15 (public part)
- **Exit gate:** TEST-T14 in both locales, light and dark, at 375 px and desktop; no person data in the responses of TEST-T09.

### Phase 7 — What guardians, participants and coaches see

- **Depends on:** phase 1
- **Outcome:** J-T03 and J-T06 complete.
- **Why this order / value delivered:** small; it makes the part recognisable in the family's calendar.
- **Deliverables:**
  1. `SessionCardFacts.tsx` and `ClubSessionPage.tsx`: the event line with the public link; visiting teams on the session page; the coach's block hides Edit and Cancel on a part (from `mayEdit`, `mayCancel`).
  2. i18n keys.
- **Independent slices / estimated commits:** 1.
- **Requirements closed:** REQ-T03
- **Tests:** TEST-T03 (member pages), TEST-T13
- **Exit gate:** TEST-T13 at 375 px in both locales, light and dark.

## Requirement Traceability

| Requirement | Journey / surface | Data/API/event contracts | Phase | Tests | Acceptance criterion |
|---|---|---|---|---|---|
| REQ-T01 | J-T01, J-T02, B-T2, `/club/club-events/new` | `activities_club_events`, `activities.club_events.*` | 1, 3, 5 | TEST-T01, TEST-T11, TEST-T12, TEST-T16 | AC-T01 |
| REQ-T02 | J-T01, J-T05, B-T3 Parts, phone event page | `activities_club_event_parts`, `club_event_id`, `activities.club_event_parts.*`, guards | 1, 3, 5 | TEST-T02, TEST-T04, TEST-T11, TEST-T15 | AC-T02, AC-T03 |
| REQ-T03 | J-T03, J-T06, M-02, M-03, M-04 | `clubEvent` on reads, `mayEdit`/`mayCancel` | 1, 7 | TEST-T03, TEST-T04, TEST-T13 | AC-T04 |
| REQ-T04 | J-T01 step 4, part dialog and form | `visiting_team_ids`, `invited_external_team_ids`, `/api/groups/external-teams` | 1, 3, 5 | TEST-T02, TEST-T11 | AC-T02 |
| REQ-T05 | J-T01 step 2, J-T05 step 3 | `place_id`, `club_event_part_place_fixed`, moved notices | 1, 3, 5 | TEST-T04, TEST-T06, TEST-T15 | AC-T05 |
| REQ-T06 | J-T01 step 2, add-place dialog and sheet | `club_core.places.add_external`, feature | 2 | TEST-T07, TEST-T15, TEST-T16 | AC-T06 |
| REQ-T07 | J-T01 step 7 | `findConflicts` (coach-only at an external place) | 1 | TEST-T05 | AC-T07 |
| REQ-T08 | J-T02 step 2, Files tab, phone files block | `activities_club_event_files`, `activities.club_event_files.*`, public file route | 4, 6 | TEST-T08, TEST-T09 | AC-T08 |
| REQ-T09 | J-T04, P-T1 | public route, `activities.publicEvents.clubEvent()` | 6 | TEST-T09, TEST-T14, TEST-T15 | AC-T09 |
| REQ-T10 | J-T04 step 3, P-06 | P-06 entries `kind: club_event` | 6 | TEST-T10, TEST-T14 | AC-T10 |
| REQ-T11 | J-T02, B-T1, B-T2, B-T3 | panel routes | 3, 4 | TEST-T11 | AC-T11 |
| REQ-T12 | J-T01, J-T05, `/club/club-events/*` | member routes, More entry | 5 | TEST-T12, TEST-T15 | AC-T12 |

**Extension surfaces** (`.ai/guides/spec-delivery.md`):

| Surface | Requirement | Reference capability and file | Phase | Test | Classification |
|---|---|---|---|---|---|
| Entities and migration T1, T2 | REQ-T01, REQ-T02, REQ-T08 | `module.entities-migrations`, `src/modules/example/data/entities.ts`; adapted as `activities/data/entities.ts` | 1, 4 | TEST-T01, TEST-T08 | emitted-example |
| CRUD `/api/activities/club-events` | REQ-T01, REQ-T11 | `api.crud-query-engine-custom-fields`, `src/modules/example/api/todos/route.ts`; adapted as `groups/api/external-teams/route.ts` | 1 | TEST-T01 | emitted-example |
| Command routes `…/club-events/{id}/cancel`, `/parts…`, `/files…`, `/api/club_core/places/external` | REQ-T01, REQ-T02, REQ-T06, REQ-T08 | `api.custom-route`, `src/modules/example/api/organizations/route.ts`; adapted as `activities/api/occurrences/[id]/cancel/route.ts` | 1, 2, 4 | TEST-T01, TEST-T02, TEST-T07, TEST-T08 | emitted-example |
| ACL feature `club_core.places.add_external` and the role catalogue | REQ-T06 | `module.acl`, `src/modules/example/acl.ts`; `setup.ts` `defaultRoleFeatures` through `catalogueRoleFeatures()` | 2 | TEST-T07 | emitted-example |
| Optional DI contribution `activities.publicEvents` (two methods) | REQ-T09 | `module.di-registration`, `src/modules/example/di.ts`; adapted as `activities/services/public-events.ts` | 6 | TEST-T09 | emitted-example |
| Frontend pages `/club/club-events/*`, `/p/[clubSlug]/events/[eventSlug]`; backend pages `/backend/activities/club-events/*` | REQ-T09, REQ-T11, REQ-T12 | `ui.frontend-page`, `src/modules/example/frontend/example.tsx`; `ui.backend-page`; adapted as `activities/frontend/club/events/new/page.tsx`, `club_core/frontend/p/[clubSlug]/events/page.tsx` | 3, 5, 6 | TEST-T11, TEST-T12, TEST-T14 | emitted-example |

## Rollout, Migration, and Rollback

Rollback follows S14.6: it redeploys the previous release and never runs `down()`. Every item below is Ask First (`AGENTS.md`) and **needs the owner's approval**; none is approved yet. Each migration's generated SQL is shown in its pull request before anyone applies it.

| Item | Kind | Approval | Compatibility with the previous release |
|---|---|---|---|
| Migration T1 — `activities_club_events`, `activities_club_event_parts` (with their checks and partial unique indexes), `activities_activities.club_event_id` with its index and the check `activities_activities_club_event_one_off` (phase 1) | migration, two new tables and one nullable column | needs the owner's approval (Q-T20) | ignored by the previous release; after a rollback the parts' activities and sessions keep working as single events, and the open parts and the event pages disappear |
| Migration T2 — `activities_club_event_files` (phase 4) | migration, one new table | needs the owner's approval (Q-T20) | ignored by the previous release; the attachments stay |
| New feature `club_core.places.add_external` granted to `vereino_coordinator`; command `club_core.places.add_external`; route `POST /api/club_core/places/external` (phase 2) | contract change (ACL, role catalogue, new route) | needs the owner's approval (Q-T20) | after the deploy, `yarn mercato auth sync-role-acls` once for existing clubs (the release note says so) |
| New routes `/api/activities/club-events*` and `/api/club_core/public/{clubSlug}/events/{eventSlug}*`; command ids `activities.club_events.*`, `activities.club_event_parts.*`, `activities.club_event_files.*`; new error codes (phases 1, 4, 6) | contract change, additive (BC §2–§4) | needs the owner's approval as one group (Q-T20) | additive |
| Response fields `clubEvent` (calendar and session reads), `clubEventId` (activities), `isExternal` (event options) (phase 1) | contract change, additive (BC §2) | needs the owner's approval as one group (Q-T20) | additive |
| `PublicEventsProvider` gains `clubEvent?()` and `clubEventFile?()`; `PublicEventEntry` gains `kind`, `clubEventSlug`, `partsCount` and a nullable `sectionSlug` for a club event; P-06 folds a club event's parts into one entry whose `section` may be null (phase 6) | contract change (DI interface, public response; one narrowing) | needs the owner's approval (Q-T20) | the only consumer (`PublicEventsView.tsx`) is updated in the same PR; the shared-environment check of *Compatibility* applies |
| Behaviour changes: 409 `activity_is_club_event_part` on the generic activity edit and delete; 403 `club_event_part_managed_by_event` and 422 `club_event_part_place_fixed` on the session edit and cancel of a part; coach-only collision check for a part at an external place (phase 1) | behaviour change on existing commands, for new data only | needs the owner's approval (Q-T20; Q-T05, Q-T11) | the previous release treats parts as single events |

No new module and no new dependency. No feature flag: phase 1 adds no UI, and each later phase is complete on its own. Seeds: none; the integration fixtures build the example. Observability: the new commands log through `createLogger('activities' | 'club_core')` with the event id; the public routes keep the per-IP rate limit of P-06.

## Risks and Tradeoffs

| Risk / tradeoff | Impact | Mitigation / detection | Residual risk |
|---|---|---|---|
| The copied title, type and teams on a part's activity drift from the part row | A calendar shows an old title | One writer (the part commands) in one transaction; the generic activity edit refuses a part's activity (409); TEST-T02 and TEST-T04 assert both | Low |
| A reader of one-off activities shows parts as unrelated events (P-06, B-13, share text) | Nine cards again | P-06 folds them (phase 6); B-13 and the session record show "Part of {event}" (phase 3); the share text of one part session stays a session's text by design | Low |
| Changing the event's place sends many notices | A family with children in two parts gets two | One notice per moved session to its own audience only (DD-A09); the form says how many will be told | Accepted |
| A guardian with two children in two parts of one day sees two cards | Two declarations to give | That is the model: each part has its own time and deadline | Accepted |
| The open part is invisible to the facility module | A club place double-booked | Open parts only at an external place (DD-T04); changing the event's place to a club place is refused while open parts exist | Low |
| Parallel parts at a club complex need two pitches | The organiser cannot enter them at one leaf with capacity 1 | Capacity of the place applies; per-part place deferred (Q-T02) | Medium; stated to the owner |
| The coordinator adds duplicate or wrong external places | A cluttered place list | Duplicate name and address refused; the administrator edits or deactivates in B-06; undo while unused | Low |
| Posters served as uploaded | A crafted image reaches visitors | Bytes checked, no SVG, `nosniff`, the type it was checked as; the same accepted rule as logos and place photos | Low; re-encoding needs `sharp` (Ask First) |
| The event-cancel undo restores sessions silently (as the session cancel's undo does today) | Families told "cancelled" are not told "back on" | The undo window is short; the administrator can restore a session with the announced restore (REQ-A05) instead; the PR shows the text of the confirmation | Medium; inherited from the session cancel's undo |
| Rollback after club events exist | Event pages disappear; parts become single events | Data stays; redeploying the release brings them back | Low |
| Names collide with the glossary ("wydarzenie") | Mixed terms | Q-T09 picks "impreza klubowa"; `glossary:check` runs in `yarn verify` | Low |

## Acceptance Criteria

Every criterion that names a phone page is checked at 375 px, in English and Polish, in light and dark mode (D-029).

- [x] **AC-T01** — Rafał, coordinator of "Akademia piłkarska", creates "PRZYKŁAD CUP 2026" for his section on the phone and in the panel; he cannot create a whole-club event or one for another section (403). The administrator creates a whole-club event. Cancelling the event with a reason cancels every planned future part session, each family of a part's group is told once per part, and no part can be added afterwards. — evidence: #614; `TEST-T01-club-events-scope-and-cancel`
- [x] **AC-T02** — The nine parts of the poster are entered: eight as parts of the eight academy groups, with their days, times, categories, coach and visiting teams (picked or added in place with their club), and "Turniej Drużyn – Seniorzy (16+)" as an open part. A part with a group of another section is refused (422). — evidence: #426, #430, #438; `TEST-T02-club-event-parts`, `TEST-T11-club-events-panel`, `TEST-T12-club-events-phone`
- [x] **AC-T03** — A part is copied (the day and group chosen again), moved (only its own families told), cancelled and, before anyone declared, removed; removing a declared part is refused (409) and the page offers Cancel. A coach and a coordinator of another section cannot move or cancel a part session (403); a part's activity cannot be edited or deleted outside the club event (409). — evidence: #426, #430, #438; `TEST-T04-part-session-guards`, `TEST-T06-event-place-change`, `TEST-T11-club-events-panel`, `TEST-T12-club-events-phone`
- [ ] **AC-T04** — Kasia sees in her calendar and on Today only Jaś's part, named with "PRZYKŁAD CUP 2026" and, once published, a link to its public page; she confirms before the deadline and is refused after it. Rafał as the coach runs the attendance list and records a score on his part, without Edit or Cancel. — gap: #606
- [x] **AC-T05** — The event has one place; a part session's place cannot be changed alone (422). Changing the event's place moves every planned future part session after the collision check and announces each move once to its own audience; a collision saves nothing. — evidence: #426; `TEST-T04-part-session-guards`, `TEST-T06-event-place-change`
- [x] **AC-T06** — Rafał adds "Hala sportowa w Zielonym Lesie, ul. Szkolna 50, Zielony Las", owned by Gmina Zielony Las, from the form; it is external, appears in every place picker with the "external" mark and stays on the list; he cannot edit it afterwards; adding it twice answers 409 with the existing place. — evidence: #425; `TEST-T07-external-place`
- [x] **AC-T07** — Two overlapping parts at a club place with capacity 1 collide (409); the same at the external hall are saved; a coach in two overlapping parts collides anywhere; no facility occupancy is written for the hall. — evidence: #426; `TEST-T05-part-collisions`
- [x] **AC-T08** — The administrator uploads one poster and four funder logos with their names; an SVG under any name, a file over the limit and a thirteenth logo are refused; files of an unpublished event are not reachable publicly. — evidence: #436, #439; `TEST-T08-club-event-files`, `TEST-T09-public-club-event-page`
- [x] **AC-T09** — A guest opens `/p/przyklad/events/przyklad-cup-2026` and sees the poster, the dates, the place with its address and a map link, the description, the four days with every part's time, category, our group with its section (or the club's name for a non-public group), the visiting teams, "Organised by LKS Przykład Dolina" and the funders' logos; no person's name appears. The page answers 404 while the event is not public, has no part, or the club does not publish the Events menu. — evidence: #439; `TEST-T09-public-club-event-page`, `TEST-T14-public-tournament-page-ui`
- [x] **AC-T10** — P-06 lists "PRZYKŁAD CUP 2026" once with "9 parts", linking to its page, and no part separately; it moves to "Past" after its last part and leaves it 60 days after its first part. — evidence: #439; `TEST-T10-public-events-club-event-entries`, `TEST-T14-public-tournament-page-ui`
- [ ] **AC-T11** — In the panel the administrator lists club events by view, creates one with a new external place, works the parts in a table grouped by day (add, edit, copy, move, cancel, remove) and manages the poster and logos. — gap: #607
- [x] **AC-T12** — On the phone Rafał does J-T01 completely — the event, the place, all nine parts with copies and visiting teams, the poster — and never needs a `/backend` page; More shows "Club events" to him and not to a guardian. — evidence: #438, #441; `TEST-T12-club-events-phone`
- [x] Every listed backend surface matches its recorded Open Mercato reference and uses the canonical shell/components, shared API helpers, semantic tokens, and complete loading, empty, error, conflict, keyboard, accessibility, responsive, light-mode, and dark-mode states. — evidence: #430, #436, #438, #439, #428; `TEST-T11-club-events-panel`, `TEST-T08-club-event-files`, `TEST-T12-club-events-phone`, `TEST-T13-part-member-pages-phone`, `TEST-T14-public-tournament-page-ui`
- [x] Every affected API and UI path has self-contained integration coverage and the configured validation gate passes. — evidence: #426, #425, #430, #436, #438, #439, #428; `TEST-T01-club-events-scope-and-cancel`, `TEST-T02-club-event-parts`, `TEST-T04-part-session-guards`, `TEST-T07-external-place`, `TEST-T09-public-club-event-page`, `TEST-T11-club-events-panel`, `TEST-T12-club-events-phone`

## Final Compliance Report

| Check | Status | Evidence / resolution |
|---|---|---|
| Applicable `AGENTS.md` files and routed guides/skills reviewed | pass | `AGENTS.md` (module boundaries, Ask First, coverage rule, phone checks, D-024/D-026 sessionless rule), `.agents/skills/om-spec-writing/SKILL.md`, the template, the precedents `2026-11-14-vereino-parity-groups-and-activities.md` and `implemented/2026-11-03-vereino-ux-parity-phases-1-3.md`, `BACKWARD_COMPATIBILITY.md` (tier per surface in *Compatibility*) |
| Data models, APIs, events, UI, and tests are internally consistent | pass | Requirement Traceability rows REQ-T01…REQ-T12 |
| Every workflow completes end to end without a catch-all integration phase | pass | J-T01…J-T06, each closed by named phases |
| Platform-native reuse and extension points were chosen before custom code | pass | Reuse and Ownership Map; DD-T01, DD-T08, DD-T09, DD-T11 |
| UI contracts identify references, canonical components, and theme/state coverage | pass | UI and Interaction Contracts |
| Every phase has dependencies, bounded slices, tests, value, and an observable exit gate | pass | Implementation Phases 1–7 |
| User approval for implementation | pass | The owner approved the Ask First items in *Rollout* (Q-T20) and confirmed Q-T11 on 2026-11-19 |

Verdict: `Ready for implementation` — the owner approved migrations T1 and T2, the new feature and role-catalogue change, the P-06 narrowing and the behaviour changes on existing commands (Q-T20) and confirmed Q-T11 on 2026-11-19.

## Resolved assumptions (autonomous defaults)

Chosen without the owner, as the option closest to the existing code or the most reversible one. Each waits for the owner's confirmation in the review; a row marked ⚠ changes a contract or a permission.

| ID | Question | Chosen answer | Rationale | Confirmation |
|---|---|---|---|---|
| Q-T01 | Is a part without a club group allowed? | Yes, as an open part with its own times, only while the event's place is external (DD-T04) | The example's seniors' tournament has no club group; at a club place an open part would hide from the facility occupancy | confirmed by the owner on 2026-11-18 |
| Q-T02 | One place per event, or a per-part override? | One place per event (DD-T05) | D-032 §1 lists the venue among the shared facts; the smallest model | confirmed by the owner on 2026-11-19 |
| Q-T03 | May a club event use a typed venue (REQ-A08)? | No; the place list with "Add place" (D-032 §4) | The place must stay on the list for next time | confirmed by the owner on 2026-11-19 |
| Q-T04 | More than one club group in one part? | No; one group or none | D-032 §1 names "the club's group" | confirmed by the owner on 2026-11-19 |
| Q-T05 | Who moves and cancels a part session? | The administrator and the coordinators of the event's section; not a coach, not a coordinator of another section (DD-T06) | The organiser owns a published schedule; DD-A05 was for a coach's own events | confirmed by the owner on 2026-11-18 |
| Q-T06 | Can a part's group change? | No; remove the part (while unused) and add it again | A changed group would move declarations between families | confirmed by the owner on 2026-11-19 |
| Q-T07 | Does the public page name a part's group when the group is not public? | No; it shows the club's name (DD-T12) | DD-29 keeps a group private unless the club publishes it | confirmed by the owner on 2026-11-19 |
| Q-T08 | Poster and logo formats and limits; PDF poster; funder links? | Poster PNG/JPEG/WebP ≤ 5 MB, one; logos the same formats ≤ 2 MB, ≤ 12, with a name; no PDF, no links (DD-T10) | The place-photo and logo rules; a phone shows images inline | confirmed by the owner on 2026-11-19 |
| Q-T09 | Names of the new things? | EN "Club event", "Part"; PL "Impreza klubowa", "Część" (menu "Imprezy klubowe"); never "wydarzenie", which is the type `other` | The glossary's "one word names one thing"; the mockup has no such screen | confirmed by the owner on 2026-11-18 |
| Q-T10 | What does the in-form "Add place" create, and what may the coordinator do with it later? | A root, active, external leaf with name, address, kind and owner; nothing more; no edit or delete without `club_core.manage` (DD-T08) | D-032 §4 asks only to add it | confirmed by the owner on 2026-11-18 (the feature id itself is still Ask First item, Q-T20) |
| Q-T11 | Does "external place = coach-only check" apply to every session or only to parts? | Only to part sessions (DD-T07) | The narrowest behaviour change that delivers D-032 | confirmed by the owner on 2026-11-19 |
| Q-T12 | How is a cancelled club event announced? | Through each part session's existing cancellation (DD-T14) | One path; each family hears about its own part | confirmed by the owner on 2026-11-19 |
| Q-T13 | May an event exist without parts? | Yes, as a draft; not public until it has a part | Lets the organiser enter the shared facts first | confirmed by the owner on 2026-11-19 |
| Q-T14 | Public URL? | `/p/[clubSlug]/events/[eventSlug]`, the slug proposed from the name, editable, unique per club (DD-T13) | DD-23; under the Events menu | confirmed by the owner on 2026-11-19 |
| Q-T15 | Does changing the event's place move the parts and announce each move? | Yes, the planned future part sessions, each announced by REQ-A09 | The families must know where to go | confirmed by the owner on 2026-11-19 |
| Q-T16 | Is a part "away"? | No: `is_away` false; the club hosts | The coach units report counts away trips separately (#96) | confirmed by the owner on 2026-11-19 |
| Q-T17 | Who leads a part by default? | The form proposes the group's coach (its only active `coach` membership, else empty); the unstaffed warning (REQ-A14) covers a part left without one | The existing rules for a session without a coach | confirmed by the owner on 2026-11-19 |
| Q-T18 | Who reads club events in the panel and on the phone? | Coordinators read all of the club's club events, change only their sections' | Parts of a whole-club event involve their groups | confirmed by the owner on 2026-11-19 |
| Q-T19 | A notice when a club event or part is created or published? | No | No notice exists for a new single event either; the calendar and the evening reminder cover it | confirmed by the owner on 2026-11-19 |

## Open Questions

| ID | Question | Owner | Blocking? | Resolution / decision date |
|---|---|---|---|---|
| Q-T20 | Are the Ask First items of *Rollout* approved: migrations T1 and T2, the feature `club_core.places.add_external` for the coordinator, the new routes, fields and command ids as one group, the P-06 narrowing (`section` nullable for a whole-club club event, parts folded), and the behaviour changes on the activity and session commands? | Władek Kuć | yes (phase 1 needs T1 and the behaviour changes; phase 2 the feature; phase 4 T2; phase 6 the P-06 change) | approved by the owner on 2026-11-19 |
| Q-T21 | Should the autonomous defaults Q-T01, Q-T05, Q-T10 and Q-T11 stand (only Q-T11 is still marked ⚠)? | Władek Kuć | yes for phase 1 (Q-T01, Q-T05, Q-T11) and phase 2 (Q-T10) | Q-T01, Q-T05 and Q-T10 confirmed by the owner on 2026-11-18; Q-T11 confirmed on 2026-11-19 (only part sessions) |
| Q-T22 | Are "Impreza klubowa" / "Część" the right Polish names (Q-T09)? | Władek Kuć | no | confirmed by the owner on 2026-11-18: "Impreza klubowa" / "Część", menu "Imprezy klubowe" |
| Q-T23 | Should a later version add a per-part place for parallel parts at a club complex (Q-T02)? | Władek Kuć | no | default kept by the owner on 2026-11-19: not in this version |
| Q-T24 | Should the public page show the funders' links or a PDF poster (Q-T08)? | Władek Kuć | no | default kept by the owner on 2026-11-19: no |
| V-T01 | Does the platform route table serve `club_core/frontend/p/[clubSlug]/events/[eventSlug]/page.tsx` next to the existing `events/page.tsx` without a clash? | implementer, phase 6 | no | to be checked with `yarn generate` in phase 6; the fallback is the same page in `activities/frontend/p/[clubSlug]/events/[eventSlug]` with `clubFrame`, like the public session page |

## Changelog

Each change is its own file in `.ai/specs/changelog/2026-11-18-vereino-club-events-with-parts/` (`YYYY-MM-DD-<slug>.md`, one `| date | change |` row), so parallel PRs never conflict here; `cat .ai/specs/changelog/2026-11-18-vereino-club-events-with-parts/*.md` lists them in date order. Never add rows to this section. The entries this spec adds to the specs it completes are `.ai/specs/changelog/2026-10-20-vereino-club-management/2026-11-18-club-events-with-parts.md`, `.ai/specs/changelog/2026-11-14-vereino-parity-navigation-and-naming/2026-11-18-club-events-with-parts.md` and `.ai/specs/changelog/2026-11-14-vereino-parity-groups-and-activities/2026-11-18-club-events-with-parts.md`.
