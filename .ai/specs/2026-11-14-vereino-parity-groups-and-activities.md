# Vereino — Mockup parity II: groups, activities and sessions, in the panel and on the phone

**Date**: 2026-11-14
**Status**: Ready for implementation — approved by the product owner on 2026-11-16 ([owner decisions on #252](https://github.com/wladku/Vereino/issues/252#issuecomment-6910004411), answering the [pre-implementation audit](https://github.com/wladku/Vereino/issues/252#issuecomment-6899294590)): the ten Ask First items approved (migrations A, B and C included), Q-A01…Q-A06, Q-A09…Q-A11, Q-A18, Q-A19, Q-A21 answered, three new answers recorded (Q-A25…Q-A27), the audit gaps (c1)–(c9) fixed in this text. Phase 8 waits for spec N phase 5; phase 9's More entry waits for spec N's `Groups` destination (see *Dependencies on the other parity specs*)

> Use `om-spec-writing` for every new application, multi-module feature, or other non-trivial business slice. Keep every section below; write `N/A — {reason}` when a section does not apply. Change the status to `Ready for implementation` only after every blocking open question is resolved and the traceability table covers every requirement.

Sources: the parity audit of 2026-11-14 (`main` at `a312199`) against the clickable mockup, and the owner's decisions in `.ai/specs/research/decisions/D-031-mockup-is-the-model-and-eight-parity-decisions.md` (§3, §5, §6 and §7 shape this spec; §1 and §2 are applied by the navigation spec). Binding as before: D-029 (phone-first) and D-030. Design authority: `docs/ux-concept/README.md` (B-11…B-17, M-02…M-05, M-07, flow F-03) and the mockup `docs/ux-concept/mockups/app.ts` (`screenGroups`, `screenGroup`, `screenActivities`, `screenActivityCreate`, `screenOccurrences`, `screenUnits`, `screenPolicies`, `screenToday`, `screenCalendar`, `occCard`, `screenOccurrence`, `screenAttendance`, `screenThread`) with `i18n/pl.json`.

This spec is an addendum. It completes `.ai/specs/2026-10-20-vereino-club-management.md` (REQ-004…REQ-009, REQ-020, REQ-027, REQ-039, DD-43, J-002, J-003) and `.ai/specs/2026-10-27-vereino-foundation-messaging-primitives.md` (REQ-M07). It does not edit their bodies or change their status. What it supersedes there is listed under *Compatibility* in *Architecture and Data Flow* and recorded in one changelog entry per base spec. Ids carry the letter **A** (`REQ-A01`, `DD-A01`, `J-A01`, `TEST-A01`, `AC-A01`, `Q-A01`), so they never collide with the base specs' ids (D-028).

Names follow the mockup (D-031 §2). The full Polish and English rename table is the **"Glossary (D-031 §2)"** of `.ai/specs/2026-11-14-vereino-parity-navigation-and-naming.md`; this spec cites it and does not repeat it. In this text an *activity* is the recurring series or a one-off event, a *session* is one meeting, and the *coach* is the person running it (Polish "Prowadzący" in the glossary).

## TLDR

Groups, activities and sessions get what the mockup shows and what the owner decided on 2026-11-14:

- **Panel.** The groups list and the group record match B-11 and B-12. The roster becomes a table in which a mistake can be corrected (edit, end on a chosen day, remove). The activity wizard blocks "Create" until a preview without collisions. The sessions list can be scoped to one activity, has inline actions and a "Needs a new time" view.
- **Declaration deadline (D-031 §5).** A match or event carries "confirm by". After it a guardian sees "deadline passed" and the coach sees who has not answered.
- **Coach-created sparring or away match (D-031 §6).** A coach creates it on the phone for their own group, with a venue typed in as a name and an address and with a gathering time.
- **A moved session is always announced (D-031 §7).** A change of the time, the place or the gathering time of a future session posts to the session's thread, notifies in the app and sends an e-mail, on the same path as a cancellation.
- **The coordinator works from the phone (D-031 §3).** The section's sessions, assigning a substitute, cancelling, moving, the group roster, marking a thread as a case and deleting a message are member pages under `/club`.
- **Coach pages.** The quick fill of the attendance list works on trainings, a coach of the group can take over a session that has no coach, and match scores are entered on the phone.

Reused: the existing commands and routes of `groups`, `activities` and `communication`, the calendar API that already accepts `as=coordinator`, the cancellation notice path, `DataTable`, `CrudForm` and the member shell. The owner approved the three migrations and every contract change on 2026-11-16 ([#252](https://github.com/wladku/Vereino/issues/252#issuecomment-6910004411)); each migration's SQL is shown in its pull request before it is applied.

## Problem Statement

The owner compared the running application with the mockup and found it short "in every area, especially facilities, groups and activities" (D-031). The audit confirmed these gaps in the code at `a312199` (paths under `packages/app/src/modules/`):

- **A roster mistake cannot be corrected.**
  - `groups/components/RosterPanel.tsx:95-118` can only end a membership "today". The update command `groups.memberships.update` has no UI, and there is no delete command (`groups/commands/memberships.ts:318-320` registers create, update and end only).
  - Ending a membership that starts in the future answers 422 `validity_inverted` (`groups/commands/memberships.ts:298-301`), yet the button is shown for it (`RosterPanel.tsx:177`).
  - The roster reads `pageSize=100` once (`RosterPanel.tsx:67`), so rows beyond 100, history included, are dropped and the active count is wrong.
  - The person picker searches last names only (`RosterPanel.tsx:73-82`), although the people list accepts `search` since REQ-U01, and it offers people who are already members.
- **The groups list and record miss mockup columns and state.**
  - No "Public" column or filter, although the API returns `is_public`; a class group shows "—" for its level, although `level_label` is returned (`groups/components/GroupsTable.tsx:56-131`).
  - The record's tabs are not in the URL (`GroupRecord.tsx:54`).
  - A team with matches can be turned into a class group (`groups/commands/groups.ts:286-335` has no guard).
- **The activity wizard lets a coordinator save into a collision.** "Create" is always enabled and collisions appear only as a 409 after saving (`activities/components/ActivityForm.tsx:295-306`). The place select is silently empty when the club has no bookable place or the load fails (`ActivityForm.tsx:170`, `tolerant(placeOptions)`). The end of a series is entered in two places.
- **The sessions of one activity cannot be worked on.** The mockup's "Sessions" row button and `?activity=` scope are missing; the record's sessions tab offers "Open" only. The list reads `?perspective=` (`activities/lib/occurrence-list.ts:15-22`) while the mockup and DD-U03 use `?view=`, so `?view=unassigned` silently shows "All". Sessions flagged `needs_reschedule` have a filter checkbox but no view of their own.
- **No declaration deadline.** `activities/data/entities.ts` has no such column; the mockup shows it on the session card and the session page (`app.ts:896`, `:958`).
- **A coach cannot create a sparring or an away match.** `activities/commands/events.ts:76-77` refuses every type but `tournament` and `other` (422 `event_type_not_allowed`), and `eventCreateSchema` requires a club place (`activities/data/validators.ts:103-116`). The panel's event form sends no coach, gathering time or opponent, although the API accepts a coach and a gathering time (`activities/components/EventForm.tsx:161-172`).
- **A moved session tells nobody.** The move command emits `activities.occurrence.updated` with `{ id, activityId }` (`activities/commands/occurrences.ts:192-196`) and nothing subscribes to it; only `activities.occurrence.cancelled` has subscribers (`activities/subscribers/notify-occurrence-cancelled.ts`, `communication/subscribers/session-cancelled.ts`). This breaks the product's first outcome: a guardian knows in time where and when (D21).
- **The coordinator has no phone path.** `GET /api/activities/calendar` accepts `as=coordinator` (`activities/api/calendar/route.ts:3`), but the member pages know `self`, `guardian` and `coach` only (`activities/components/club/club-client.ts:22`). Assigning a substitute, moving a session, the roster, marking a case and deleting a message exist only under `/backend`. This contradicts D-029.
- **The quick fill is dead on trainings.** `declaredPresentFill` (`activities/lib/attendance-sheet.ts:22-29`) fills only final "yes" declarations. A training is `absence_only`, so it never has one, and the button is disabled on every training (`ClubAttendancePage.tsx:440`).
- **Specified, never built.** Match scores (club spec REQ-020, `score_*`), restoring a cancelled session (club spec glossary *Session*) and the fixtures import (REQ-039).

Who has it: guardians and participants (deadline, moved sessions), coaches (sparring, attendance, scores), section coordinators (everything on the phone), the club administrator (panel lists).

## Overview and Success Measures

- **Primary outcome:** a guardian learns of every change of the time, the place or the gathering time of a future session in the app and by e-mail within five minutes of the change. A coordinator assigns a substitute, moves or cancels a session and corrects a roster from a phone without opening `/backend`.
- **Leading indicators:**
  - `communication.session_moved` e-mails per moved session (target: one per recipient per move, none missing);
  - the share of coordinator assignments, moves and cancellations made through `/club` pages (access logs);
  - the share of `confirm` sessions with a deadline, and of declarations given before it;
  - the share of training attendance lists closed with the quick fill.
- **Baseline:** at `a312199` a move sends nothing; the coordinator's share on `/club` is zero (no page exists); no session has a deadline; the quick fill is usable on no training.
- **Market / product reference:**
  - **Adopted:** SportEasy and Spond notify on every change of an event and show a reply-by time on the invitation. TeamSnap lets a coach type the location of an away game without adding it to a venue list. All three keep the roster editable with dated history.
  - **Rejected:** closing the deadline with an automatic "no". The mockup keeps "no answer" visible to the coach, and the coordinator's model in the brief (D-022) wants the coach to chase the family.

## Goals

- **REQ-A01** — The groups list (B-11) shows the "Public" badge and filter, a "Category / level" column (the age category, or the level for a class group), the kind as a badge and the page subtitle. Each row links to the group's activities (completes club spec REQ-004).
- **REQ-A02** — The group record (B-12) has tabs in the mockup's order, addressable by `?tab=`; the "Level" field on Details; a guard that refuses turning a team with matches into a class group (409); a public preview link; a link to the group's activities with "New activity" prefilled for the group; and a link to the age-category dictionary (completes REQ-004, REQ-019).
- **REQ-A03** — The roster is a table with coaches first. A coordinator adds a person through a dialog (search by first or last name, age shown, current members left out, optional end date; the dialog opens with a person, and optionally a role, already chosen when the roster is opened with `?personId=` and `?role=`, which spec L's staff-setup checklist uses), edits a membership's role and dates, ends it on a chosen last day, and removes a membership that has not started or was never used. Every row is reachable whatever the roster's size (completes REQ-004).
- **REQ-A04** — The activities list (B-13) and the wizard (B-14) match the mockup. The list has a "Sessions" row button, the rule with its end date, the type as a badge and an empty state with a next action. In the wizard "Create" is enabled only after a preview without collisions, the place select never fails silently, the series end is entered once, a tournament takes invited teams, and saving opens the sessions of the new activity (completes REQ-005, REQ-027).
- **REQ-A05** — The sessions list (B-15) can be scoped to one activity, reads `?view=`, has the view "Needs a new time", shows its row actions inline with "Assign substitute" as the primary one, moves a session from the row, names the session in the cancel dialog and the number of people told in the toast. The session record shows the place with its address and a map link. An administrator restores a cancelled session with a reason (completes REQ-005, REQ-006, REQ-008).
- **REQ-A06** — The coach units report (B-16) exports CSV with headers in the user's language and the separator of that locale, and explains the unsettled warning. The policies list (B-17) shows scope and target in two columns and the limit as "24 h" (completes REQ-007, REQ-008).
- **REQ-A07** — A session of a `confirm` declaration kind may carry a declaration deadline ("confirm by"). Before it a guardian sees "Confirm by {date, time}". After it the declaration is closed with "deadline passed", an unanswered child reads "no answer", and the coach sees who has not answered (D-031 §5; completes REQ-007).
- **REQ-A08** — A coach creates a sparring or a match for a team they coach from `/club/events/new`, with either a club place or a venue typed in as a name and an address, an opponent, a gathering time and a deadline. The coach edits or cancels the one-off events of their own groups. The panel's event form sends the same fields (D-031 §6; completes REQ-020, REQ-027).
- **REQ-A09** — Every change of the time, the place or venue, or the gathering time of a future session is announced once: a system message in the session's thread, an in-app notification and an e-mail to the session's audience. A change of a whole series is announced once per change, not once per session. Restoring a cancelled session is announced the same way (D-031 §7; completes REQ-009, J-003, foundation III REQ-M07).
- **REQ-A10** — A section coordinator works on the section's sessions from the phone: lists them by view (all, needing a coach, needs a new time, unsettled, cancelled), assigns a substitute or changes the coach, cancels, and moves a session (D-031 §3, D-029; completes REQ-006, REQ-008).
- **REQ-A11** — A section coordinator reads and edits the rosters of the section's groups from the phone; a coach reads the roster of the groups they coach (D-031 §3, D-029; completes REQ-004).
- **REQ-A12** — A section coordinator marks a thread as a case and deletes a message from the thread page on the phone (D-031 §3, D-029; completes REQ-010).
- **REQ-A13** — The member session surfaces (M-02, M-03, M-04) show what the mockup shows: the section's colour dot, a map link for a place outside the club or a typed venue, "substitute: {name}", the type and status badges, and for the coach "Message the group" and the substitution history on the session page. The coach's calendar card opens the session page and carries an "Attendance list" button (completes REQ-006).
- **REQ-A14** — The attendance list (M-05) can be filled in one tap on every session: on an `absence_only` session the quick fill marks everyone without a reported absence. The list opens 30 minutes before the start. A coach or assistant of the group takes over a session that has no coach, and the section's coordinators and the group's coaches are warned two hours before a session that still has none (completes REQ-007, REQ-008, flow F-03).
- **REQ-A15** — The coach or the coordinator records the score of a match or sparring once it has started, on the phone and in the panel (completes REQ-020).

## Non-goals

- **Fixtures import (club spec REQ-039, Should).** Not built by this spec and not dropped. It is not in the mockup, D-031 does not list it, and V-14 found no export or API. REQ-A04 and REQ-A08 let a coordinator or a coach enter a match in under a minute. It stays a Should of the club spec, not scheduled; the owner revisits it at the pilot review (Q-A05, 2026-11-16).
- **The panel sidebar, the tabbed shells, the "More" list, the context switch and the default context of a coach-only person.** They belong to the navigation spec. This spec defines the pages those entries open.
- **Configuration on the phone.** The activity wizard, declaration policies, the units report and the section's public page stay in the panel (D-031 §3).
- **Setting `needs_reschedule` and telling staff about it.** The facilities parity spec owns both. This spec owns what the coordinator does with a flagged session and the guardian-facing notice when it moves.
- **What happens to declarations and the month's fee when a child changes group.** The people life-cycle spec owns it.
- **Reopening a closed (`done`) session.** Only a cancelled session is restored here.
- **Handing a session from one coach to a named colleague without the coordinator.** See Q-A04. A coach can report an absence, and a colleague of the group can take the session over (REQ-A14).
- **Push notifications and native apps** (N02, N12; unchanged by D-029).
- **A notification to the coach at the moment the deadline passes.** The coach sees the unanswered list; the reminder to families goes before the deadline (REQ-A07).

## Proposed Solution

**Groups (REQ-A01…REQ-A03).** The lists and forms change in place. The roster becomes a `DataTable` with server paging and the views Active / Upcoming / History, so no row is dropped. Three membership actions cover every mistake:

- **Edit** — the existing `groups.memberships.update`;
- **End** with a chosen last day — the existing `groups.memberships.end`, which now answers the coded 422 `membership_not_started` instead of `validity_inverted`;
- **Remove** — a new `groups.memberships.delete` behind `DELETE /api/groups/memberships`. The event `groups.membership.deleted` is already declared (`groups/events.ts:10`).

Remove is allowed for a membership that has not started, and for a started one that was never used. "Used" is answered by `activities` through a new optional DI contract, **`activities.groupUsage`**, declared in `groups` and registered by `activities` — the same direction as `groups.sectionUsage`. The kind-change guard reads a second method of the same contract.

**Activities and sessions in the panel (REQ-A04…REQ-A06).** No new API except the restore command. The wizard keeps `CrudForm` and gains a client rule: the submit button is disabled until the last preview of the current values returned no collision. The sessions list reads `?view=` (and keeps `?perspective=` as an alias), gains `?activity=` and the view `reschedule`, and shows its actions inline.

**Declaration deadline (REQ-A07).** It mirrors the gathering time of DD-43. The activity holds a default `confirm_by_minutes_before`, each session stores its own copy, and reads expose the instant `confirmBy = start_at − minutes`. A moved session keeps its offset, so the deadline moves with it. The declare command refuses a member's declaration after the deadline; staff may still record one.

**Typed venue (REQ-A08).** A session has either a club place or a typed venue. `place_id` becomes nullable, and two columns, `venue_name` and `venue_address`, are added on the activity and on the session, with a check constraint that exactly one of the two is set. Only a one-off activity (an event, no recurrence) may carry a venue: the activity validators refuse a venue on a series (422 `venue_requires_one_off`), so the `generate-occurrences` worker, which copies `default_place_id` only, never meets one. A typed venue takes no place in the club's schedule, so only the coach collision is checked, and the facility surfaces never show such a session (spec R's B-23 day axis, M-11 and the place occupancy read `ACTIVITIES_PLACE_SESSIONS`, which selects by place). The event command accepts `sparring` and `match` for a team, and a `venue` in place of `placeId`. A typed venue turns "away" on by default; the form shows the box ticked and lets the user untick it, because `is_away` feeds the coach units report and settlement (`activities/data/entities.ts:33`; owner decision Q-A25, 2026-11-16).

**Moved-session notices (REQ-A09).** The move command adds what changed to the payload of `activities.occurrence.updated` (additive). Two persistent subscribers act on it, mirroring the cancellation pair:

- `activities:notify-occurrence-moved` writes the in-app notification;
- `communication:session-moved` runs the new command `communication.threads.record_reschedule`, which posts a system message in the session thread and e-mails the session audience.

Both ignore an `updated` event without a `change` (a coach assignment, the `needs_reschedule` flag). A series change emits `activities.activity.updated` with a `scheduleChange` and is announced once, in the activity's thread.

**The coordinator on the phone (REQ-A10…REQ-A12).** The role already holds every feature the work needs (`activities.manage`, `groups.manage`, `people.view`, `communication.cases.manage`; `packages/core/src/roles.ts:51-73`), and every API exists. The work is member pages: the calendar and session pages learn the perspective `coordinator`, two new pages show groups and a roster, a new page moves a session, and the thread page gains two actions.

**Coach pages (REQ-A13…REQ-A15).** The quick fill gets a second rule for `absence_only` sessions. Taking over a session is a new command on the existing substitution history. The warning before an unstaffed session is a new scheduled job on the pattern of `activities:expire-guardian-confirmations`. A score is three columns on the session and one command.

### Design Decisions and Alternatives

| Decision | Rationale | Alternative considered | Why rejected / deferred |
|---|---|---|---|
| **DD-A01** The deadline is stored as minutes before the start on the session, with a default on the activity; reads expose the instant | The model of DD-43: a moved match moves its deadline, and a series can carry "confirm two days before" | An absolute `confirm_by` instant on the session, as the mockup's data has it | Goes stale when the session moves; a series cannot express it |
| **DD-A02** After the deadline a member's declaration is refused in both directions; staff may still record one; an unanswered child stays `unknown` | The mockup closes the controls and says "write to the coach" (`app.ts:773`, `:886`); the coach keeps one true list | Allow a late "no"; turn silence into "no" | The first splits the rule in two; the second hides who never answered, which is what the coach must see (D-031 §5) |
| **DD-A03** A typed venue is two text columns on the activity and the session; `place_id` becomes nullable with a check "exactly one" | D-031 §6: the venue "is not added to the club's places"; a coach cannot create places (`club_core.manage`) | A hidden external place created in `club_core` on the fly | Fills the places list and its pickers with one-off venues; needs a cross-module write by a coach |
| **DD-A04** A coach may create `sparring` and `match` events for a team, at a club place or a typed venue; a typed venue defaults `is_away` to on, and the form can untick it (Q-A25) | D-031 §6 names "a sparring or an away match"; one rule for both types and both venue kinds is simpler to explain and to test | A typed venue only, or `match` only when away | Two more refusals that prevent no risk: a home sparring on a free pitch already passes the collision check |
| **DD-A05** A coach may edit and cancel the one-off events of the groups they coach, never the sessions of a series | Without it a typing mistake in a coach-made sparring needs the coordinator; the brief's evidence incident is a changed gathering time | Moves stay the coordinator's only | Blocks D-031 §6 in daily use; every edit is announced (REQ-A09) and audited |
| **DD-A06** The moved notice is driven by an additive `change` object on `activities.occurrence.updated`, consumed by two new persistent subscribers | The owner's wording: the event has no consumer. Additive payload fields are allowed by `BACKWARD_COMPATIBILITY.md`; one event keeps one audit trail | A new event `activities.occurrence.moved` | A second id for the same fact; later consumers would have to listen to both |
| **DD-A07** The notice is posted in the **session thread** (one per session, created on demand), the thread a cancellation already uses | D-031 §7: "the same channels, and the same thread, as a cancellation"; confirmed by the owner on 2026-11-16 (Q-A11). The thread carries `group_id`, so M-06 lists it for the group's audience ("a message the group reads") | One standing thread per group that collects all moves | No such thread exists; the audience of a standing thread changes with the roster and loses who was told |
| **DD-A08** A series change is announced once, in the activity's thread, with the first changed date and the new rule | A coordinator who moves the Tuesday trainings by 30 minutes must not send sixteen e-mails | One notice per moved session | A mail flood; recipients stop reading |
| **DD-A09** No debounce: every committed change sends its notice; the idempotency key is the session id plus the version the change wrote | The key of the cancellation (`communication/subscribers/session-cancelled.ts`); predictable; a correction must also reach people | Collect changes for some minutes | A delayed notice of a changed gathering time is the failure this spec removes |
| **DD-A10** Remove a membership only when it has not started or `activities` reports no attendance row for it; otherwise End | Keeps the history decided in #30, yet lets a wrong pick disappear | Always allow delete; never allow delete | The first loses attendance history; the second is today's dead end |
| **DD-A11** The sessions list reads `?view=`; `?perspective=` stays accepted | The mockup and DD-U03 use `view`; links written with `perspective` (widgets, notices) keep working | Keep `perspective` only; drop it | The first keeps the conflict; the second breaks sent links |
| **DD-A12** The coordinator's phone pages reuse M-03, M-04 and M-05 with `as=coordinator`; only the roster and the move form are new pages | The mockup's member screens already admit the coordinator (`screenAttendance` checks `coordSections`); fewer pages to learn | A separate `/club/coordinator/*` area | Duplicates the session page and its states |
| **DD-A13** The attendance list opens 30 minutes before the start and keeps the explicit Save with one version check | The mockup lets a coach mark early, and children arrive before the whistle. The explicit save keeps the conflict rule of J-002 step 6 and one request on a weak signal | Marks on any planned session, each tap saved (mockup) | A tap a day early is a mistake; one request per tap multiplies conflicts at a pitch with poor coverage |
| **DD-A14** "Unsettled" stays "planned and ended at least 24 hours ago" everywhere | README F-03; it is what the code does on the list, the widget and the Today alert (`activities/lib/substitutions.ts:76-88`) | "Ended", without the 24 hours (the mockup's simplification) | Flags every session the moment it ends, before the coach could close it |

## Domain Vocabulary and Business Rules

| Term / invariant | Precise meaning or rule | Source of truth | Failure behavior |
|---|---|---|---|
| Declaration deadline | `confirm_by_minutes_before` on a session: 1–20 160 (14 days), null = none. The instant is `start_at − minutes`. It has effect only when the session's declaration kind is `confirm`, and forms offer it only then. A series copies the activity's default when it plans a session, like the gathering time | `activities_occurrences`, `activities_activities` | 422 `occurrence_confirm_by_after_start` (at or after the start), `occurrence_confirm_by_too_early` (over 14 days), `occurrence_confirm_by_in_past` (a submitted instant earlier than now) |
| Deadline passed | `now ≥ confirmBy` and the session has not started. A declaration by `self` or `guardian`, from the app or a personal link, is refused. A pending guardian decision on a declaration made before the deadline is still accepted until the start. `activities.coach` and `activities.manage` may still record a declaration | declare command | 409 `declaration_deadline_passed` with `details.confirmBy` |
| No answer | A participant of a `confirm` session with `declared = unknown`, or with no row. It never changes by itself | `activities_attendances` | — |
| Moving a session with a deadline | The offset is kept. When the kept offset would put the deadline in the past, the move must send `confirmBy` explicitly (a new instant or null) | move command | 422 `occurrence_confirm_by_in_past` |
| Typed venue | `venue_name` (2–120 characters) and `venue_address` (5–300), plain text. A session has a club place **or** a typed venue, never both and never neither. Only a one-off activity may carry one; a series always has a club place. A typed venue defaults `is_away` to `true` on the activity; the form may untick it (Q-A25) | `activities_activities`, `activities_occurrences` | 422 `venue_or_place_required`; 422 `venue_requires_one_off` (a venue on an activity with a recurrence); 422 on length |
| Collision check with a typed venue | Only the coach is checked; the venue occupies no club place | `activities/services/schedule.ts` | 409 with the coach's colliding sessions |
| Session without a club place | A typed-venue session (`place_id IS NULL`) is in no place's schedule: `ACTIVITIES_PLACE_SESSIONS` never returns it, so the facility day axis (spec R, B-23, M-11), the place occupancy and the rented-hours report never show it. It shows on the member and staff session surfaces, the public session page and in the share text | `activities/services/place-sessions.ts` | — |
| Map link | For a place with coordinates: the existing `mapHref`. For a place without them and for a typed venue: an OpenStreetMap search link built from the name and the address. Shown on the session page always, and on cards when the place is external or typed | `activities/components/club/club-client.ts` | no address → no link |
| Coach-created event | A one-off activity (no recurrence) of type `tournament` or `other` (any group), `sparring` or `match` (teams only), created with `activities.events.create` for a group in the caller's `coached_group_ids` | `activities` | 403 outside the caller's groups; 422 `activity_type_requires_team`; 422 `event_type_not_allowed` for `training` and `camp` |
| Who edits a session | A coordinator of the section or the administrator: any planned session. A coach: a planned session of a one-off activity of a group they coach (DD-A05) | move command (`PLAN_KINDS`, plus `coach` for one-off events) | 403 |
| Announced change | A committed change of `start_at`, `end_at`, the place or venue, or the gathering time of a `planned` session whose old or new start is later than the moment of the change; also a restore. A change of the coach or of the deadline alone is not a move (the coach has its own notices; the deadline is shown on the card) | `activities.occurrence.updated` with `change` | — |
| Audience of a moved notice | As for a cancellation, on the session's **new** date: participants with an account, guardians with an account of every participant not known to be an adult, the session's coach and the group's coaches and assistants; never the person who made the change. When a coach made it, also the section's coordinators | `activities/services/cancellation-notice.ts` (`cancellationAudience`), `vereino.audience.occurrence` | a recipient without an account or an address is skipped and shown in the delivery status |
| Series change notice | One notice when an edit of the activity changes the time, the place or the gathering time of at least one future movable session. It names the first changed date, the number of changed sessions and the new rule. Detached sessions are not touched and not counted | `activities.activity.updated` with `scheduleChange` | — |
| Needs a new time | A `planned` session with `needs_reschedule = true`. Moving it clears the flag (already so, `commands/occurrences.ts:187`); cancelling it ends it | `activities_occurrences` | — |
| Unsettled | A `planned` session that ended 24 hours ago or more (DD-A14) | `activities/lib/substitutions.ts` | — |
| Restore | `cancelled → planned` by the administrator, with a reason of 3–500 characters, only while the session's end is in the future. The session must still fit the schedule | `activities.occurrences.restore` | 409 `occurrence_not_cancelled`; 409 `occurrence_already_ended`; 409 with the collisions |
| Taking over | A person with an active `coach` or `assistant` membership in the session's group assigns themself to a `planned` session with no coach. It writes a substitution entry, as an assignment does | `activities.occurrences.take_over` | 409 `occurrence_has_coach`; 409 on a coach collision; 403 outside the group |
| Unstaffed warning | Once per session, when a `planned` session without a coach starts within two hours | job `activities:warn-unassigned-sessions` | a retried run sends nothing twice (dispatch key = the session id) |
| Quick fill | `confirm` session: everyone with a final "yes" and no mark. `absence_only` session: everyone without a final "no" and no mark (label `m.screenAttendance.markExpected`) | `activities/lib/attendance-sheet.ts` | nothing to fill → the button is disabled and says why |
| Attendance window | Marks are accepted from 30 minutes before the start (DD-A13) | check-off command | 409 `attendance_not_started` before that |
| Score | `score_home`, `score_away`: integers 0–99, both or neither; `result_note` up to 500 characters. Only on `match` and `sparring`, only once the session has started, also after it is closed. "Home" is the club's team unless the activity is away | `activities_occurrences` | 422 `score_not_applicable`; 409 `score_before_start` |
| Membership actions | **Edit**: role and dates; the overlap rule is unchanged. **End**: `valid_to` = a chosen day ≥ `valid_from` (default: today). **Remove**: a soft delete, allowed when `valid_from` is after the club's today, or when `activities.groupUsage` reports no attendance row of the person in the group's sessions within the period | `groups_memberships` | 422 `membership_not_started` (End before the start); 409 `membership_in_use` (Remove refused); 409 overlap and version as today |
| Roster order | Coaches, then assistants, then participants; within a role by `valid_from`, newest first. Names are encrypted and cannot be sorted on the server (the same limit as the people list) | `groups` list route | — |
| Kind change guard | A group of kind `team` cannot become `class_group` while it has a live activity of type `match` or `sparring` | `groups.groups.update` through `activities.groupUsage` | 409 `group_has_matches` with `details.total` |

## Users, Permissions, and Scope

No new feature id and no change to the role catalogue. Every page checks features, never role names.

| Actor | Allowed outcomes | Scope rule | Required feature IDs |
|---|---|---|---|
| Section coordinator | Phone: the section's sessions by view, assign a substitute, cancel, move, roster read and write, mark a case, delete a message, attendance list, score. Panel: everything in REQ-A01…REQ-A06 except restore | Own sections (`section_ids` of the `coordinator` grant) | `people.self`, `activities.view`, `activities.manage`, `groups.view`, `groups.manage`, `people.view`, `communication.cases.manage` |
| Coach or instructor | Create a sparring, match, tournament or other event; edit and cancel the one-off events of own groups; take over an unstaffed session; attendance; score; read the roster of own groups; message the group | Groups in `coached_group_ids`; own sessions | `people.self`, `activities.coach`, `activities.events.create`, `groups.view`, `communication.post` |
| Guardian, participant with an account | See the deadline, the venue with a map link and the moved notice; declare before the deadline | `self` and `guardian` grants | `people.self`, `activities.attendance.declare`, `communication.view` |
| Club administrator | Everything above, club-wide; restore a cancelled session | Club (`club_admin` grant) | module wildcards |

`tenantId` and `organizationId` come from the authenticated context through `commandContextForRequest` and `makeCrudRoute`. The subscribers and the job run under the emitter's trusted scope with the `system_job` source, as `communication:session-cancelled` does. No system-scope read is added.

## Reuse and Ownership Map

| Capability | Reuse / extend / app-own | Existing module or new module | Integration seam | Why |
|---|---|---|---|---|
| Roster table, membership edit and end | extend | `groups` (`RosterPanel.tsx`, `commands/memberships.ts`, `api/memberships/route.ts`) | `makeCrudRoute` (adds `DELETE`), existing commands | The update and end commands exist; only delete is new |
| "Was this membership used", "does this group have matches" | app-own, new contract | `activities` provides, `groups` consumes | DI `activities.groupUsage` (`hasRegistration`), declared in `groups/services/group-usage.ts` | `groups` must not import `activities`; the pattern of `groups.sectionUsage` |
| Person picker in the roster dialog | reuse | `people` | `GET /api/people/persons?search=` (REQ-U01) | It already searches first and last names |
| Wizard, event form, sessions list | extend | `activities` (`ActivityForm.tsx`, `PreviewPanel.tsx`, `EventForm.tsx`, `OccurrencesTable.tsx`, `lib/occurrence-list.ts`) | `CrudForm`, `DataTable`, `RowActions` | Existing pages |
| Deadline, typed venue, score | extend | `activities` (`data/entities.ts`; `lib/gathering.ts` is the model) | own columns | The session owns them |
| Moved notice in the app | extend | `activities` (`services/cancellation-notice.ts`, `notifications.ts`) | persistent subscriber on `activities.occurrence.updated` | The audience code of the cancellation |
| Moved notice in the thread and by e-mail | extend | `communication` (`commands/threads.ts` `record_cancellation`, `emails/templates.ts`) | persistent subscriber + command `communication.threads.record_reschedule`; reads the session through `scheduleDirectory` | `communication` owns threads and e-mail and already reads sessions this way |
| Coordinator's sessions on the phone | reuse | `activities` (`api/calendar/route.ts` `as=coordinator`, `api/occurrences/route.ts`) | existing routes | Built, unused by member pages |
| Assign, cancel, move from the phone | reuse | `activities` (`AssignCoachDialog.tsx` logic, `POST …/coach`, `POST …/cancel`, `PATCH /api/activities/occurrences/{id}`) | existing routes | Only member UI is new |
| Roster on the phone | extend | `groups` (new `frontend/club/groups` pages) | existing `groups` routes | `groups` owns rosters |
| Case and delete on the phone | reuse | `communication` (`ClubThreadPage.tsx`, `POST …/threads/{id}/case`, `DELETE …/messages/{messageId}`) | existing routes | Only two buttons are new |
| Unstaffed warning job | extend | `activities` (`workers/`; the schedule in `services/club-setup.ts` `setUpClubActivities`, which `setup.ts` `seedDefaults` calls for a new club and the CLI `mercato activities set-up-club` re-runs for an existing one) | foundation II `advanceWhere`, as `expire-guardian-confirmations` | The same job pattern and the same registration path as the three existing schedules |
| Member shell, tiles, cards | reuse | `@vereino/ui` (`member/`), `activities/components/club/*` | member components | Phone pages stay on the shared shell |

The installed records that stay the source of truth: persons and guardianships in `people`, places in `club_core`, threads and deliveries in `communication`, notifications in the platform's `notifications` module.

## Architecture and Data Flow

```text
B-12 roster  -> GET /api/groups/memberships?groupId&status&page          (DataTable, server paging)
             -> PUT (edit) | POST …/{id}/end { validTo } | DELETE (remove)
                  -> groups.memberships.delete -> activities.groupUsage.membershipUsed(em, …) (optional DI) -> 409 or soft delete
                  -> groups.membership.deleted -> groups:sync-member-roles (existing, `groups.membership.*`)

Move a session (panel row, /club/occurrences/{id}/edit)
             -> PATCH /api/activities/occurrences/{id} -> activities.occurrences.update
                  -> activities.occurrence.updated { id, activityId, groupId, change, actor…, updatedAt }
                       -> activities:notify-occurrence-moved   -> notification activities.occurrence_moved
                       -> communication:session-moved          -> communication.threads.record_reschedule
                                                                    -> system message in the session thread
                                                                    -> e-mail communication.session_moved (foundation `dispatch`)
Series edit  -> activities.activities.update -> activities.activity.updated { id, scheduleChange }
                       -> the same two subscribers, once per change (activity thread)

Coach event  -> /club/events/new -> POST /api/activities/events { type, placeId | venue, opponent…, gathering, confirmBy }
Declaration  -> POST /api/activities/attendance/declare -> 409 declaration_deadline_passed after confirmBy (self, guardian)

Coordinator on the phone
  /club/calendar?as=coordinator&view=…   -> GET /api/activities/calendar?as=coordinator | GET /api/activities/occurrences?{view query}
  /club/occurrences/{id}?as=coordinator  -> POST …/coach | POST …/cancel | /club/occurrences/{id}/edit
  /club/groups, /club/groups/{id}        -> /api/groups/groups, /api/groups/memberships (as B-12)
  /club/messages/{threadId}              -> POST …/threads/{id}/case | DELETE …/messages/{messageId}

Job activities:warn-unassigned-sessions (every 15 min) -> notification activities.session_without_coach
```

- **Module boundaries:** no new module. `groups` declares the contract `activities.groupUsage` and degrades without it (Remove is then allowed only for a membership that has not started; the kind change is not guarded). `communication` reads sessions only through the existing `scheduleDirectory`. `activities` never imports `communication`: the thread and the e-mail hang on the event.
- **Extension points:** persistent subscribers, DI registrations (`di.ts`), the scheduler target registered by `activities/services/club-setup.ts` (`setUpClubActivities`), notification types (`activities/notifications.ts`), e-mail templates (`communication/emails/templates.ts`), frontend pages under `frontend/club/`.
- **Alternatives considered:** a `notifications`-only moved notice without the thread and the e-mail (rejected: D-031 §7 names all three channels); a generic "session changed" diff e-mail for every field (rejected: a coach change and a deadline change have their own surfaces).
- **Compatibility:**
  - **Additive:** optional query parameters (`view`, `activity`, `status`, `sortField=roster`, `isPublic`); new response fields (`confirmBy`, `deadlinePassed`, `venue`, `score`, `unansweredCount`, `mayAssign`, `mayEdit`, `mayTakeOver`); new optional payload fields on `activities.occurrence.updated` and `activities.activity.updated`; new commands, routes, error codes, notification types, one scheduler target and one e-mail template; nullable columns.
  - **Contract change — approved 2026-11-16** ([#252](https://github.com/wladku/Vereino/issues/252#issuecomment-6910004411)): `placeId` and `defaultPlaceId` become nullable in every read of an activity or a session (calendar, sessions list, session record, public session page) and in the DI services `activities.scheduleDirectory`, `activities.placeSessions`, `activities.publicSchedule` and `activities.shareText`, once a typed venue exists. Readers inside Vereino are updated in the same phase (phase 5, deliverable 3 lists them); the PR description and this section record the narrowing (default path, step 4, of `BACKWARD_COMPATIBILITY.md`).
  - **Behaviour change — approved 2026-11-16:** `POST /api/groups/memberships/{id}/end` answers 422 `membership_not_started` where it answered 422 `validity_inverted`; a declaration after the deadline answers 409; the attendance list opens 30 minutes before the start; the declaration reminder for a session with a deadline goes on the evening before the deadline's day.
  - **BC tiers** (`BACKWARD_COMPATIBILITY.md`, tier table). Every surface below is a Vereino surface of the tier "Protected at first deployment", except the merged migrations, which are "Protected now" (§5) and only ever added to:

    | Surface | BC section | Change | Kind |
    |---|---|---|---|
    | `/api/groups/*`, `/api/activities/*`, `/api/communication/share-text` routes, query parameters and response fields | §2 | new routes, parameters and fields; `placeId`/`defaultPlaceId` nullable | additive; one narrowing |
    | Error codes in `groups/lib/error-codes.ts`, `activities/lib/error-codes.ts` | §3 | new codes; `…/end` answers `membership_not_started` instead of `validity_inverted` | additive; one changed code on one route |
    | Event ids and payloads (`activities.occurrence.updated`, `activities.activity.updated`, `groups.membership.deleted`) | §4 | additive payload fields; no id changes | additive |
    | DI tokens and interfaces (`activities.groupUsage` new; `scheduleDirectory`, `placeSessions`, `publicSchedule`, `shareText` with a nullable place) | §4 | one new token; four interfaces narrowed | additive; narrowing |
    | Command ids, notification types (`activities.occurrence_moved`, `activities.session_without_coach`), scheduler target `activities:warn-unassigned-sessions`, e-mail template `communication.session_moved` | §4 | new ids | additive |
    | Schema of `activities_activities`, `activities_occurrences` (migrations A, B, C) | §5 | nullable columns; two `NOT NULL` dropped; check constraints | additive; B relaxes two columns |

    **Shared environment:** `BACKWARD_COMPATIBILITY.md` still lists "confirm that no Railway `staging`/`production` service exists" as an open gap. While none exists, each narrowing above may land in one PR that updates every consumer, which is what the owner approved. The PRs of phases 2 and 5 confirm before merging that no shared environment is deployed; if one is, the PR stops, follows the default path (a release-note line for the changed code and the nullable place, and migration B only after the rollback rule is in the release note) and asks the owner before merging.
  - **Superseded in the club spec** (`.ai/specs/2026-10-20-vereino-club-management.md`; bodies unchanged, see the changelog entry):
    - *UI and Interaction Contracts*, row `/backend/activities/occurrences`: "perspectives All / Canceled / 'Calendar'" and "'needing a coach' and 'unsettled' tabs" → the views of REQ-A05 under `?view=`, with "Needs a new time" and the `?activity=` scope;
    - row `/club/events/new`: "type (tournament / other)" and "place (a bookable leaf)" → the types and the venue of REQ-A08;
    - row `/club/occurrences/[id]`: "'Attending / Not attending' for each ward" → the declaration kinds of REQ-007 with the deadline of REQ-A07, and the coordinator's block of REQ-A10;
    - *Goals*, REQ-027: "(`tournament` or `other`)" → also `sparring` and `match` for a team (DD-A04);
    - *API* row `POST /api/activities/events`: `type: tournament|other`, `placeId` required → REQ-A08;
    - *Events*: `activities.occurrence.updated` gains its consumers (REQ-A09); J-003 gains the moved-session path (J-A03);
    - *Data Models*, `Occurrence`: `score_*` and the notes become `score_home`, `score_away`, `result_note` (REQ-A15); `place_id` nullable with `venue_*`;
    - row `/backend/groups/groups/[id]/fixtures` and REQ-039: not scheduled (Non-goals, Q-A05).
  - **Superseded in foundation III** (`.ai/specs/2026-10-27-vereino-foundation-messaging-primitives.md`): REQ-M07 "Cancelling a session creates or extends the session thread and e-mails the session audience" is extended to a moved and a restored session (REQ-A09).

### Dependencies on the other parity specs

The five parity specs of 2026-11-14 are N (navigation and naming, `Ready for implementation`), A (this spec), R (facilities), C (payments) and L (people life-cycle); A, R, C and L are made Ready in parallel. This spec states the hooks; it does not edit the other specs.

| Spec | Direction | What | Where in this spec |
|---|---|---|---|
| N `2026-11-14-vereino-parity-navigation-and-naming.md` | A needs N | Phase 8 reads N's staff context and `memberStaffScopes(profile)` (N phase 5, DD-N08); it cannot close before N phase 5 lands | Phase 8, *Coordinator view in N's staff context* |
| N | A needs N | Phase 9's page is reached from N's More entry "Groups" (N, More table). N ships that row with `available: false` (N V-N04, #258); phase 9 sets it to `true` in `member-nav.ts` once `/club/groups` exists | Phase 9 |
| L `2026-11-14-vereino-people-life-cycle-and-data-entry.md` | L needs A | L's leaving flow and group move end memberships with REQ-A03's "end on a chosen last day" and remove a not-started one under REQ-A03's remove rule (`DELETE /api/groups/memberships`); L's staff-setup checklist opens the roster dialog with a person already chosen (`?personId=`, `?role=`; L J-L07 step 2, "Add to a group as coach") | REQ-A03, phase 2 |
| L | L needs A | L's consent flags are drawn on M-05, the attendance list this spec owns; L ships the read contract | Phase 7 |
| R `2026-11-14-vereino-parity-facilities.md` | A needs R | R sets `needs_reschedule` (closures, maintenance) and tells staff; this spec acts on the flagged session (REQ-A05 view, REQ-A10) | J-A03, phase 3 |
| R | R needs A | R's B-23 day axis, M-11 and the occupancy must cope with sessions that have no club place: after phase 5 a typed-venue session has `place_id IS NULL` and `ACTIVITIES_PLACE_SESSIONS` never returns it, so R shows nothing for it and needs no venue rendering | *Session without a club place*, phase 5 |
| C `2026-11-14-vereino-parity-payments.md` | none | No dependency in either direction. `payments` subscribes to no `groups.membership.*` event; it reads the active participant memberships on a date (`payments/services/group-charges.ts:112-120`, `groupParticipants` → `rosterOn`), so a removed membership stops future charges and issued charges stay (V-A01) | Phase 2, *Risks* |

## User Journeys

### Journey J-A01 — A coordinator corrects a roster (panel and phone)

1. Ewa opens the group "Basen — początkujący", tab Roster (`?tab=roster`). She chooses **Add to roster**, types "Jan", sees "Jan Kowalski (age 9)" and "Jan Nowak (age 41)", picks the wrong one as a participant and saves.
2. She notices at once. The row's menu offers **Remove**, because the membership was never used. She confirms; the row disappears and the active count drops.
3. She adds the right Jan with a start on the 1st of next month. Before that day the row reads "Upcoming" and offers **Edit** and **Remove**, not End.
4. At the pool she opens `/club/groups` on the phone, taps the group and ends Ola's membership with the last day "30.11".
5. Failures: Remove on a membership with attendance answers 409 `membership_in_use`, and the dialog offers End instead. A stale row answers 409 with the shared conflict message and a refreshed list. A second active membership in the same role answers the existing overlap 409 on the dialog.

### Journey J-A02 — A coach sets up an away sparring with a deadline

1. On Monday Wojtek taps "New event" on `/club`, chooses the group "Orliki młodsze", the type Sparring, the opponent "Wisła Liszki", the venue **Other address**: "Stadion Wisły Liszki", "ul. Sportowa 1, Liszki", Saturday 09:00–10:30, gathering 08:30, confirm by Thursday 12:00.
2. The session page opens. Guardians get the usual declaration surfaces: the card on `/club` reads "Confirm by Thu 13.11, 12:00" with a map link.
3. Kasia confirms for Jaś on Wednesday. On Thursday at 12:01 Marta's card reads "Deadline passed Thu 13.11, 12:00 — if the child can come after all, write to the coach" and Staś reads "no answer".
4. Wojtek opens the attendance list from the session page: "8 coming · 1 not coming · 3 no answer", with the three names first. He taps "Message the group" to chase them.
5. On Friday the host moves the kick-off to 10:00. Wojtek opens **Edit** on the session page, changes the time and saves. Every guardian gets the notice of J-A03; the gathering and the deadline keep their offsets, and because the deadline is already in the past the form asked him to set a new one or none.
6. Failures: a class group cannot take a sparring (422 `activity_type_requires_team`); Wojtek's own colliding session answers 409 with the list and saves nothing; a declaration through a personal link after the deadline shows the same "deadline passed" text.

### Journey J-A03 — A session moves and everyone is told

1. The municipality closes the pitch on Tuesday. The facilities module flags the Tuesday training of "Żaki" as needing a new time (facilities parity spec).
2. Ewa, the coordinator, sees "Needs a new time (1)" on her Today page, opens the view and taps the session. She chooses **Move**: Wednesday 17:00–18:30, "Sala gimnastyczna". The form shows no collision; she saves. The flag is cleared.
3. The session thread gets the system message "Moved by the coordinator Ewa Nowak: Tue 18.11 17:00, Boisko piłkarskie → Wed 19.11 17:00, Sala gimnastyczna". Guardians, participants with an account and the coach get an in-app notification and an e-mail with the old and the new time and place, and the gathering time when there is one. The toast tells Ewa how many people were told.
4. Ewa taps "Copy text for group chat" in the thread and pastes it into the parents' chat.
5. Failures: an e-mail that cannot be delivered is shown as "not delivered" next to the recipient in the thread (foundation III). A replayed event sends nothing twice. A move back by undo is a move and is announced again.

### Journey J-A04 — A substitute from the phone, and a session still without a coach

1. On Monday evening Marek reports an absence for Tuesday. Ewa gets the existing "needs a coach" notification and opens "Needing a coach (1)" on her phone.
2. On the session page she taps **Assign substitute**, searches "Bar", sees that Bartek is free at that time, picks him and saves. Bartek gets the existing notification; the substitution history on the page shows both entries.
3. Another week nobody is assigned. Two hours before the start the coordinators of the section and the coaches of the group get "Żaki training today 17:00 has no coach".
4. Tomek, the assistant of the group, opens the session and taps **Take the session**. He becomes the coach, the history records it, and he runs the attendance list.
5. Failures: assigning a coach who has another session then answers the existing 409 with the collision; a second person taking over gets 409 `occurrence_has_coach` and a refreshed page.

### Journey J-A05 — A coordinator plans a series without collisions (panel)

1. From the group record Ewa follows "Activities" and chooses "New activity"; the group is preselected. The place list holds the club's own bookable places.
2. She fills Tuesdays 17:00–18:30 from 17.11 to 30.06 and chooses **Preview**. The block reads "Preview: 31 sessions" with a red list of two collisions. "Create" stays disabled with the hint `b.screenActivityCreate.previewFirst`.
3. She changes the time, previews again and sees "No collisions". "Create" is enabled; after saving, the sessions list opens scoped to the new activity.
4. Failures: a club with no bookable place shows an explanation and a link in place of the empty select; a collision that appears between preview and save still answers 409 with the list.

## UI and Interaction Contracts

The closest installed references: `people/components/PersonRecord.tsx` (tabs in the URL), `people/components/PersonsTable.tsx` (app-owned view tabs above `DataTable`, DD-U03), `activities/components/OccurrencesTable.tsx` and `AssignCoachDialog.tsx`, `activities/components/club/ClubEventPage.tsx` (member form with a sticky submit bar), `activities/components/club/CoachSessionBlock.tsx`, `communication/components/ThreadRecord.tsx` (case and delete in the panel). `.ai/guides/backend-ui.md` applies to panel pages; implementation invokes `om-backend-ui-design`. Member pages use `MemberShell` and the member components of `@vereino/ui`. Polish texts come from the mockup's `i18n/pl.json`; the keys named below are those keys, renamed into the module's namespace.

| Surface / route | Purpose and primary actions | Data source / mutations | Closest installed reference | Canonical shell / components | Required states | Requirement IDs |
|---|---|---|---|---|---|---|
| `/backend/groups/groups` (B-11) | Columns "Category / level" (`b.screenGroups.colCategoryLevel`) and "Public" (`colPublic`); kind badge; subtitle (`b.screenGroups.sub`); filter Public; row action "Activities" | `GET /api/groups/groups?isPublic=` | `GroupsTable.tsx` | `DataTable`, `StatusBadge`, `RowActions`, `EmptyState` | loading, empty with "Add group", filtered-empty with "Clear filters", error | REQ-A01 |
| `/backend/groups/groups/[id]` (B-12) | Tabs Details / Roster / Public (`b.screenGroup.tab*`) under `?tab=`, default `roster`; Level on Details (`b.screenGroup.level`); header links "Activities" and "Public preview"; link "Edit age categories" beside the category select | `GET/PUT /api/groups/groups` | `PersonRecord.tsx` | platform tabs, `CrudForm` | loading, not found, 403, 409 version, 409 `group_has_matches` on the kind field | REQ-A02 |
| Roster tab of B-12 | Table Person / Role / Age / From / To / Status; views Active / Upcoming / History; toolbar "Add to roster" (`b.screenGroup.addToRoster`); row actions Edit, End, Remove; `?tab=roster&personId=…[&role=…]` opens the add dialog with that person (and role) chosen, if the person is not a current member in that role (spec L) | `GET /api/groups/memberships`, `POST`, `PUT`, `POST …/{id}/end`, `DELETE` | `PersonsTable.tsx`, `RosterPanel.tsx` | `DataTable`, `Dialog` with `CrudForm` fields, `LookupSelect`, `useConfirmDialog`, `EmptyState` (`rosterEmptyTitle`, `rosterEmptyText`) | loading, empty, error, 409 overlap on the dialog, 409 `membership_in_use`, 422 `membership_not_started`, 409 version | REQ-A03 |
| `/backend/activities/activities` (B-13) | Row button "Sessions" (`b.screenActivities.sessions`) → B-15 `?activity=`; rule with its end date; type badge ("Classes" for a class group); subtitle; group filter from `?groupId=` | `GET /api/activities/activities` | `ActivitiesTable.tsx` | `DataTable`, `StatusBadge`, `EmptyState` | loading, empty with the explanation and "New activity", error | REQ-A04 |
| `/backend/activities/activities/create` (B-14) | Group "Name (Section)" with `?groupId=` prefill; place = the club's own bookable leaves; one "Last day"; invited teams for a tournament; deadline and gathering; **Preview** then **Create** | `POST /api/activities/activities/preview`, `POST /api/activities/activities` | `ActivityForm.tsx`, `PreviewPanel.tsx` | `CrudForm`, `Alert`, chips | preview loading, "No collisions" (`noConflictTitle`), collisions list, "no sessions in the rule", empty place list with a link, 409 on save | REQ-A04, REQ-A07 |
| `/backend/activities/events/create` | One-off event with coach, opponent, away, venue (club place or other address), gathering, deadline | `POST /api/activities/events` | `EventForm.tsx` | `CrudForm` | as above | REQ-A08 |
| `/backend/activities/occurrences` (B-15) | Views Upcoming (`tabUpcoming`) / Needing a coach / Needs a new time / Unsettled / Cancelled / Calendar under `?view=`; `?activity=` header "Sessions of {activity}" with "All sessions"; inline buttons Assign substitute (primary when unassigned) or Change coach, Move, Cancel or Attendance list | `GET /api/activities/occurrences`, `POST …/coach`, `PATCH …/{id}`, `POST …/cancel` | `OccurrencesTable.tsx` | `DataTable`, `Button` in the row, `AssignCoachDialog`, `CancelOccurrenceDialog`, new `MoveOccurrenceDialog`, `EmptyState` per view (`emptyUnassigned*`, `emptyUnsettled*`) | loading, per-view empty, error, 409 collisions in the dialog, 409 version | REQ-A05 |
| `/backend/activities/occurrences/[id]` | Place with address and map link, or the typed venue; deadline; score block for a match or sparring; **Restore** for a cancelled session (administrator) | `GET …/{id}`, `POST …/restore`, `PUT …/score` | `OccurrenceRecord.tsx` | record layout, `useConfirmDialog` with a reason field | loading, 403, 409 | REQ-A05, REQ-A07, REQ-A15 |
| `/backend/activities/reports/coach-units` (B-16), `/backend/activities/policies` (B-17) | CSV in the user's locale; unsettled explanation; policy columns Scope and Applies to; "24 h" | existing | `CoachUnitsReport.tsx`, `PoliciesTable.tsx` | `DataTable` | unchanged | REQ-A06 |
| `/club` (M-02) | Cards with dot, map link, substitute, deadline line; in N's staff context, when `memberStaffScopes` includes `coordinator`, a tile with the counts "Needing a coach", "Needs a new time", "Unsettled" | `GET /api/activities/calendar`, `GET /api/activities/occurrences?…&pageSize=1` for counts | `widgets/injection/club-today/widget.client.tsx` | member tiles and cards | loading, empty ("No sessions today" + link to the calendar), error with retry | REQ-A07, REQ-A10, REQ-A13 |
| `/club/calendar` (M-03) | `as=coordinator` (staff context, coordinator scope; phase 8): "My sessions / Section" switch for a person with both scopes, section filter and view chips; coach card title → session page, plus "Attendance list" button | as above | `ClubCalendarPage.tsx` | `calendar-list` of `@vereino/ui` | loading, empty per view, error | REQ-A10, REQ-A13 |
| `/club/occurrences/[id]` (M-04) | Deadline row; venue and map; badges; block "Running the session" (`m.screenOccurrence.leading`) for the coach and the coordinator: Attendance list, Assign substitute or Change coach, Edit, Cancel, Take the session, Message the group (`messageGroup`), score, substitution history (`substitutionHistory`) | `GET /api/activities/calendar/{id}`, `POST …/coach`, `POST …/cancel`, `POST …/take-over`, `PUT …/score` | `ClubSessionPage.tsx`, `CoachSessionBlock.tsx` | member page, bottom sheet for the coach picker, `useConfirmDialog` | loading, not found, 403, declarations closed, deadline passed, 409 with refresh | REQ-A07, REQ-A08, REQ-A10, REQ-A13, REQ-A14, REQ-A15 |
| `/club/occurrences/[id]/edit` (new) | Move a session: date, start, end, place or other address, gathering, deadline; submit in a sticky bar | `PATCH /api/activities/occurrences/{id}`, `GET /api/activities/events/options` (places) | `ClubEventPage.tsx` | member form, `ConflictList` | loading, 403, field problems, 409 collisions, 409 version, success toast with the number told | REQ-A08, REQ-A09, REQ-A10 |
| `/club/occurrences/[id]/attendance` (M-05) | Quick fill by kind; "no answer" first after the deadline; opens 30 minutes before the start | existing | `ClubAttendancePage.tsx` | list with toggles | loading, empty, "opens at {time}", conflict | REQ-A07, REQ-A14 |
| `/club/events/new` | Types sparring and match for a team; opponent; venue switch; deadline | `GET /api/activities/events/options`, `POST /api/activities/events` | `ClubEventPage.tsx` | member form | as today plus the venue fields | REQ-A08 |
| `/club/groups` (new), `/club/groups/[id]` (new) | Groups of the caller's sections, or coached groups; roster as cards with Add, Edit, End, Remove for `groups.manage` | `/api/groups/groups`, `/api/groups/memberships` | `ClubMessagesPage.tsx` (member list), B-12 roster | member list, bottom sheet forms, `useConfirmDialog` | loading, empty ("This group has no members yet" + Add), error, 403, 409s as B-12 | REQ-A11 |
| `/club/messages/[threadId]` (M-07) | "Mark as case" in the thread menu and "Delete" on a message for `communication.cases.manage` in scope | `POST /api/communication/threads/{id}/case`, `DELETE …/messages/{messageId}` | `ClubThreadPage.tsx`, `ThreadRecord.tsx` | member thread, `useConfirmDialog` | case banner, 409 `case_immutable`, 403 | REQ-A12 |

### UI architecture

| Role | Navigation groups in order | Dashboard / injected widgets | Login-to-primary-task flow |
|---|---|---|---|
| Section coordinator (phone) | Bottom bar and "More" as the navigation spec defines; this spec's pages hang on Today, Calendar, Messages and the "Groups" entry | Today tile "Section sessions" with three counts (`vereino:club:today` spot, the `activities` widget) | `/club` → count "Needing a coach" → session → Assign substitute: 3 taps |
| Coach (phone) | as today | coach tile gains "New event" types and "Take the session" on an unstaffed card | `/club` → New event → save: 2 taps and the form |
| Coordinator, administrator (panel) | Activities → Groups, Activities, Sessions, Units, Policies (the navigation spec) | unchanged | Groups → group → Roster → Add to roster: 3 clicks |

| Surface / widget | Empty state guidance and action | Responsive behavior | Keyboard / focus behavior |
|---|---|---|---|
| Roster table | `rosterEmptyTitle` / `rosterEmptyText` + "Add to roster"; History view: "No past memberships" | Under 640 px the columns Age and To hide; row actions collapse into the menu | The dialog traps focus, Escape cancels, Ctrl/Cmd+Enter saves; focus returns to the row |
| Sessions list views | Per view: `emptyUnassignedTitle`, `emptyUnsettledTitle`, "No session needs a new time", generic with "New activity" | Inline buttons collapse into the row menu under 1024 px | View tabs are a tablist; `?view=` changes without a reload |
| Wizard preview | "Choose Preview to check collisions" before the first preview | Chips wrap; the collisions list scrolls | After Preview the focus moves to the result heading, which is announced (`aria-live="polite"`) |
| Coordinator chips on M-03 | Per view, with a link back to "All" | Chips scroll horizontally at 375 px | Chips are a tablist |
| Coach picker sheet | "No coach found" + a hint to add the coach to the group (panel) | Full-height sheet at 375 px | Search field focused on open |
| Move form | — | One column; the sticky bar stays above the bottom navigation | Errors are linked to their fields; the first one is focused |

### `/backend/groups/groups/[id]?tab=roster` — Roster

```text
┌──────────────────────────────────────────────────────────────────────┐
│ Żaki U9                         [Activities] [Public preview] active │
│ Team · Akademia                                                      │
│ [Details] [Roster] [Public page]                                     │
├──────────────────────────────────────────────────────────────────────┤
│ [Active 14] [Upcoming 1] [History 6]              [Add to roster]    │
│ Person ↗          Role         Age  From        To          Status   │
│ Nowak Marek       [coach]       41  01.09.2026  —           active  ⋯│
│ Kowalski Jan      participant    9  01.09.2026  —           active  ⋯│
│ Wiśniewska Ola    participant    9  01.12.2026  —           upcoming ⋯│
├──────────────────────────────────────────────────────────────────────┤
│ ‹ 1 ›                                                  50 per page   │
└──────────────────────────────────────────────────────────────────────┘
Row menu — active: Edit · End membership; upcoming: Edit · Remove; unused active: also Remove.
Add / Edit dialog: Person* (search "First Last (age N)") · Role* · From* · To
```

- **Behavior:** the view is in the URL (`?tab=roster&status=active`). The count on each view is the `total` of its query. "End membership" asks for the last day (default today, not before From). Remove asks for confirmation and names the person; when charges may exist the text says they stay and are cancelled in Finance.
- **Responsive and accessibility:** the role badge carries text; dates are in the user's locale; every row action has a label naming the person.
- **Localization:** `groups.memberships.*` in en and pl.
- **Design-system and theming:** `StatusBadge` variants only; checked in light and dark mode.

### `/club/occurrences/[id]?as=coordinator` — Session, coordinator's block (375 px)

```text
┌─────────────────────────────────────┐
│ ‹ Calendar                          │
│ [Training]                [planned] │
│ Żaki — trening                      │
│ Tue 18.11, 17:00–18:30              │
│ Place: Boisko piłkarskie · map      │
│ Coach: [needs a coach]              │
│ ⚠ Needs a new time                  │
├─────────────────────────────────────┤
│ Running the session                 │
│ [ Assign substitute            ]    │
│ [ Edit time or place           ]    │
│ [ Attendance list              ]    │
│ [ Message the group            ]    │
│ [ Cancel session               ]    │
├─────────────────────────────────────┤
│ Substitution history                │
│ 17.11 20:14 — Marek N. reported an  │
│ absence (illness)                   │
└─────────────────────────────────────┘
```

- **Behavior:** the block is shown to whoever may act (the staff read `GET /api/activities/occurrences/{id}` returns `mayCancel` and the substitution history today and gains `mayAssign`, `mayEdit` and `mayTakeOver`). "Assign substitute" opens a sheet fed by `GET /api/activities/options/coaches`. "Edit time or place" opens `/club/occurrences/{id}/edit`. Each action ends with a toast; a cancel or an edit names how many people were told.
- **Responsive and accessibility:** buttons are full width with a 44 px touch target; the destructive one is last.
- **Localization:** `activities.club.session.*`; Polish texts from `m.screenOccurrence.*`.

### Session card with a deadline (M-02, M-03)

```text
17:00  ● Sparing: Wisła Liszki — Gwiazda
18:30  ⏱ Gathering 08:30
       Orliki młodsze · Akademia · Stadion Wisły Liszki · map
       Confirm by Thu 13.11, 12:00            ← before the deadline
       Jaś   [Coming] [Not coming]
       ──────────────────────────────────────
       [Deadline passed Thu 13.11, 12:00] If the child can come after all, write to the coach.
       Staś  [no answer]                      ← after the deadline
```

- **Behavior:** the deadline line shows only on a planned `confirm` session that has not started and concerns the viewer. After the deadline the buttons are replaced by the given answer or by "no answer" (`m.occCard.noAnswer`). Texts: `m.occCard.confirmBy`, `m.occCard.deadlinePassed`, `m.occCard.deadlinePassedHint`, `m.screenOccurrence.confirmBy`, `m.screenOccurrence.deadlineOver`, `ui.declare.deadlinePassed`.

## Data Models

### `activities_activities` (changed)

| Field | Type / nullability | Scope / index | Sensitive / encrypted | Lifecycle and validation |
|---|---|---|---|---|
| `confirm_by_minutes_before` | `integer`, nullable | — | no | 1–20 160; the default copied to planned sessions (DD-A01) |
| `default_place_id` | `uuid`, **becomes nullable** | existing indexes | no | null only with a typed venue |
| `venue_name` | `text`, nullable | — | no (a public venue) | 2–120 characters, trimmed; only on a one-off activity (validator, 422 `venue_requires_one_off`) |
| `venue_address` | `text`, nullable | — | no | 5–300 characters |
| check `activities_activities_place_or_venue` | — | — | — | `(default_place_id IS NOT NULL) <> (venue_name IS NOT NULL)` |
| check `activities_activities_venue_address_with_name` | — | — | — | `venue_address IS NULL OR venue_name IS NOT NULL` |

### `activities_occurrences` (changed)

| Field | Type / nullability | Scope / index | Sensitive / encrypted | Lifecycle and validation |
|---|---|---|---|---|
| `confirm_by_minutes_before` | `integer`, nullable | — | no | 1–20 160; kept when the session moves |
| `place_id` | `uuid`, **becomes nullable** | `activities_occurrences_org_place_start_idx` unchanged | no | null only with a typed venue |
| `venue_name`, `venue_address` | `text`, nullable | — | no | as on the activity; copied from the one-off activity when its session is created |
| check `activities_occurrences_place_or_venue` | — | — | — | `(place_id IS NOT NULL) <> (venue_name IS NOT NULL)` |
| check `activities_occurrences_venue_address_with_name` | — | — | — | `venue_address IS NULL OR venue_name IS NOT NULL` |
| `score_home`, `score_away` | `smallint`, nullable | — | no | 0–99, both or neither |
| check `activities_occurrences_score_pair` | — | — | — | `(score_home IS NULL) = (score_away IS NULL)` and both `BETWEEN 0 AND 99` |
| `result_note` | `text`, nullable | — | no | at most 500 characters |

No change to the `groups` and `communication` tables: Remove uses the existing `deleted_at` of `groups_memberships`, and the moved message is an ordinary system message of the session thread. The undo snapshots of the session and the activity (`OccurrenceSnapshot`, the activity snapshot) gain the new fields, so an undo restores them. Migrations are generated with `yarn db:generate`; the owner approved all three on 2026-11-16, and each one's SQL is shown in its pull request before it is applied (*Rollout*). The named check constraints are part of the migration (as in `payments/migrations/Migration20261106204626_payments.ts`) and are listed in the PR.

## API, Command, and Error Contracts

| Method / command | Path / ID | Auth and feature gate | Input | Success response / event | Errors and concurrency | Requirement IDs |
|---|---|---|---|---|---|---|
| `GET` (`makeCrudRoute`, extended) | `/api/groups/groups` | auth + `groups.view`; scope unchanged | + `isPublic` | unchanged list | — | REQ-A01 |
| Command (changed) | `groups.groups.update` | unchanged | unchanged (`levelLabel` already accepted) | unchanged | 409 `group_has_matches` on `team → class_group` | REQ-A02 |
| `GET` (extended) | `/api/groups/memberships` | auth + `groups.view` | + `status`: `active` \| `upcoming` \| `ended` (on the club's today); + `sortField=roster` | `{ items, total, page, pageSize, totalPages }` | — | REQ-A03, REQ-A11 |
| `POST` (changed) | `/api/groups/memberships/{id}/end` / `groups.memberships.end` | auth + `groups.manage` + section scope | `{ validTo? }` + version | unchanged | 422 `membership_not_started` (replaces `validity_inverted` here); 409 version | REQ-A03 |
| `DELETE` (new, `makeCrudRoute`) | `/api/groups/memberships` / `groups.memberships.delete` | auth + `groups.manage` + section scope | `{ id }` + version | 200; `groups.membership.deleted`; undoable (restore re-checks the overlap) | 409 `membership_in_use`; 409 version; 404 | REQ-A03, REQ-A11 |
| DI (new) | `activities.groupUsage` — `membershipUsed(em, { tenantId, organizationId, groupId, personId, from, to }) → Promise<boolean>`; `matchActivityCount(em, { tenantId, organizationId, groupId }) → Promise<number>`; interface and token in `groups/services/group-usage.ts` | called by `groups` only | as typed | — | throws → 503 `group_usage_failed`; not registered → Remove only before the start, no kind guard | REQ-A02, REQ-A03 |
| `POST` (changed) | `/api/activities/activities`, `PUT` likewise | unchanged | + `confirmByMinutesBefore`; `invitedExternalTeamIds` sent by the wizard for a tournament | `PUT`: `activities.activity.updated` gains `scheduleChange` when future sessions moved | 422 on the range | REQ-A04, REQ-A07, REQ-A09 |
| `POST` (changed) | `/api/activities/events` / `activities.events.create` | auth + `activities.events.create` + group in `coached_group_ids` or section in `section_ids` | `type`: + `sparring`, `match`; `placeId?` **or** `venue: { name, address }`; + `opponentExternalTeamId?`, `confirmByMinutesBefore?`; `coachPersonId`, `gatheringMinutesBefore` as today | 201 as today; the session carries the venue | 422 `venue_or_place_required`, `activity_type_requires_team`, `event_type_not_allowed` (`training`, `camp`), deadline codes; 409 collisions. The series routes (`/api/activities/activities`) refuse a venue with 422 `venue_requires_one_off` | REQ-A08 |
| `PATCH` (changed) | `/api/activities/occurrences/{id}` / `activities.occurrences.update` | auth + `activities.manage` in scope, **or** `activities.coach` for a session of a one-off activity of a coached group | + `venue?` (null with `placeId`), `confirmBy?` (instant or null) | 200; `activities.occurrence.updated` with `change` when time, place or venue, or gathering changed | 422 deadline and gathering codes; 409 collisions; 409 version; 403 | REQ-A05, REQ-A07, REQ-A08, REQ-A09, REQ-A10 |
| `POST` (new) | `/api/activities/occurrences/{id}/restore` / `activities.occurrences.restore` | auth + `activities.manage` + `club_admin` grant | `{ reason }` (3–500) + version | 200; `activities.occurrence.updated` with `change.kinds = ['restored']`; audit with the reason | 409 `occurrence_not_cancelled`, `occurrence_already_ended`, collisions, version | REQ-A05, REQ-A09 |
| `POST` (new) | `/api/activities/occurrences/{id}/take-over` / `activities.occurrences.take_over` | auth + `activities.coach` + active `coach`/`assistant` membership in the group | version | 200; substitution entry; `activities.occurrence.coach_changed` (existing notices) | 409 `occurrence_has_coach`, coach collision, version; 403 | REQ-A14 |
| `PUT` (new) | `/api/activities/occurrences/{id}/score` / `activities.occurrences.record_score` | auth + `activities.coach` (the session's coach or a coach of the group) or `activities.manage` in scope | `{ scoreHome, scoreAway, note? }` (both null clears) + version | 200 `{ score }`; audit | 422 `score_not_applicable`; 409 `score_before_start`; 409 version | REQ-A15 |
| `POST` (changed) | `/api/activities/attendance/declare`; the personal-link route `…/declaration-links/{token}` | unchanged | unchanged | unchanged | 409 `declaration_deadline_passed` for `self` and `guardian` | REQ-A07 |
| `PUT` (changed) | `/api/activities/occurrences/{id}/attendance` | unchanged | unchanged | unchanged | `attendance_not_started` only earlier than 30 minutes before the start | REQ-A14 |
| `GET` (changed reads) | `/api/activities/calendar`, `/calendar/{id}`, `/occurrences`, `/occurrences/{id}`, `/occurrences/{id}/attendance`, the public session route | unchanged | `/occurrences`: the view queries of `lib/occurrence-list.ts` plus `needsReschedule` (exists) | items gain `confirmBy`, `deadlinePassed`, `venue`, `score`; `placeId` nullable; the staff session read gains `mayAssign`, `mayEdit`, `mayTakeOver` next to the existing `mayCancel` and `substitutions`; the attendance read gains `unansweredCount` | — | REQ-A07, REQ-A08, REQ-A10, REQ-A13, REQ-A15 |
| Command (new, job-only) | `communication.threads.record_reschedule` | `system_job` source only, as `record_cancellation` | `{ occurrenceId \| activityId, eventKey, change, actorUserId, actorPersonId, actingRole }` | system message; e-mail `communication.session_moved` through the foundation `dispatch` | idempotent by `eventKey`; a session that is cancelled meanwhile → no-op | REQ-A09 |
| `GET` (changed) | `/api/communication/share-text` | unchanged | unchanged | for a session thread whose last system message is a move: the text names the new time, place and gathering | — | REQ-A09 |

The custom routes keep per-method `metadata` and `openApi`. New error codes go to `groups/lib/error-codes.ts` and `activities/lib/error-codes.ts` with en and pl messages (S6.7). Every mutation sends the version header and surfaces 409 through the shared conflict helpers, as the existing dialogs do.

## Events, Jobs, Notifications, and Cross-Module Flows

| Trigger | Producer | Consumer | Side effect | Retry / idempotency / audit behavior |
|---|---|---|---|---|
| `activities.occurrence.updated` with `change: { kinds: ('time' \| 'place' \| 'gathering' \| 'restored')[], before: { startAt, endAt, placeId, venueName, gatheringMinutesBefore } }`, `groupId`, `actorUserId`, `actorPersonId`, `actingRole`, `updatedAt` | `activities` (move, its undo, restore) | `activities:notify-occurrence-moved` (new, persistent) | notification `activities.occurrence_moved` to the audience; group key = session id + `updatedAt` | a replay refreshes the same notification; no `change` → ignored |
| same | `activities` | `communication:session-moved` (new, persistent) | `communication.threads.record_reschedule`: system message in the session thread, e-mail to the audience, coordinators added when a coach acted | dispatch key `{id}:{updatedAt}`; a replay or a concurrent delivery adds nothing |
| `activities.activity.updated` with `scheduleChange: { from, movedCount, before, after }` | `activities` (series edit) | the same two subscribers | one notification and one e-mail per recipient; system message in the activity's thread | dispatch key `{activityId}:{updatedAt}` |
| `activities.occurrence.coach_changed` | `activities` (`take_over`) | existing `activities:notify-substitution-assigned` | unchanged notices | unchanged |
| `groups.membership.deleted` | `groups` | existing `groups:sync-member-roles` (`groups.membership.*`) | the coach context is re-derived | unchanged |
| Schedule, every 15 minutes | `activities:warn-unassigned-sessions` (new worker; scheduler target registered by `setUpClubActivities` in `services/club-setup.ts` — for a new club through `setup.ts` `seedDefaults`, for an existing club through `mercato activities set-up-club --tenant … --org …`, which is idempotent) | — | notification `activities.session_without_coach` to the section's coordinators and the group's coaches and assistants | dispatch key = session id; `advanceWhere` so two runs never both send |
| Schedule, daily 18:00 (existing) | `activities:send-declaration-reminders` | — | for a session with a deadline the reminder goes on the evening before the **deadline's** day, not the session's; none after the deadline | unchanged key (person and session) |

`activities.occurrence.updated` keeps its id and its existing fields; the event emitted by the `needs_reschedule` flag (`services/place-sessions.ts:237`) carries no `change` and stays silent for guardians. The e-mail template `communication.session_moved` is non-opt-out like the cancellation (foundation III DD-M08) and is rendered in the recipient's language with the old and the new time, place and gathering time.

## Security, Privacy, and Compliance

- **Authorization:** feature gates plus record scope, as today. The coach's edit right is checked on the session's group (`coached_group_ids`) and on the activity being one-off. Restore needs the `club_admin` grant. The phone pages hide what the read does not allow (`may*` flags) and the server refuses the rest.
- **Tenant isolation:** every new read and command takes `tenantId` and `organizationId` from the trusted context. The contract `activities.groupUsage` takes them as arguments. The subscribers use the emitter's scope over the payload's.
- **Sensitive data:**
  - A typed venue is a public address and is not encrypted. The form's help text says "the venue's address, not a private one".
  - The moved notice names the person who made the change and their role, as the cancellation does; it carries no participant names.
  - The roster on the phone shows what B-12 shows: name, role, age, dates. No e-mail, phone or PESEL. A coach reads only own groups.
  - The map link sends the venue's name and address to OpenStreetMap only when the user taps it; no person data is in it.
- **Abuse and failure modes:**
  - **Mail flood:** a series change sends one notice (DD-A08). A user who moves one session ten times sends ten notices; each is audited with the actor.
  - **Replay and concurrency:** dispatch keys make both subscribers idempotent; the session thread is locked as `record_cancellation` locks it.
  - **Deadline bypass:** the rule is in the declare command, so the app, the personal link and any API client get the same 409.
  - **Destructive action:** Remove is a soft delete, undoable, refused when attendance exists.
  - **Enumeration:** ids outside the caller's scope answer 404 or an empty list, as today.

## Integration Coverage

| Test ID | Level | Setup / fixture | Actions | Assertions | Requirement IDs |
|---|---|---|---|---|---|
| TEST-A01 | integration + UI | A team with an age category, a public class group with a level, an inactive group | List with the Public filter; open `?tab=details`; reload; set the level; follow "Activities" | columns and badges per row; the tab survives a reload; the activities list is filtered and "New activity" preselects the group | REQ-A01, REQ-A02 |
| TEST-A02 | integration | A team with a `match` activity; a team without one | Change each to `class_group`; repeat with the `activities.groupUsage` token hidden | 409 `group_has_matches` with the total; the second succeeds; without the contract both succeed | REQ-A02 |
| TEST-A03 | integration | A group with 130 memberships (active, upcoming, ended); a person with attendance in the group | Page through each view; end an upcoming membership; end with a chosen day; edit role and dates into an overlap; remove an upcoming, an unused and a used membership; undo a remove | totals equal the fixture, every row reachable; 422 `membership_not_started`; `valid_to` saved; 409 overlap; removes succeed except 409 `membership_in_use`; the undo restores the row | REQ-A03 |
| TEST-A04 | UI | B-12 roster as a coordinator, 375 px and desktop, light and dark, en and pl | Add through the dialog searching by first name; a current member is not offered; open `?tab=roster&personId=…&role=coach`; edit; end; remove | "First Last (age N)" options; the deep link opens the dialog with the person and the role chosen; coaches listed first; row menu per status; flash messages; axe clean | REQ-A03 |
| TEST-A05 | UI | A club with one bookable place and one external place; then a club with none | Open the wizard with `?groupId=`; preview with a collision, then without; create | the group is preselected and reads "Name (Section)"; the external place is not offered; Create disabled until "No collisions"; after create the sessions list is scoped to the activity; with no place the hint and the link show | REQ-A04 |
| TEST-A06 | integration + UI | Sessions: unassigned, flagged `needs_reschedule`, unsettled, cancelled, of two activities | Open `?view=` for each view, `?perspective=unassigned`, `?activity=`; move from the row into a collision and into a free slot; cancel | each view lists its rows; the alias works; the scope header names the activity; 409 list in the dialog; the flag is cleared by the move; the cancel dialog names the session and the toast the number told | REQ-A05 |
| TEST-A07 | integration + security | A cancelled future session; a cancelled past session; a coordinator | Restore as the administrator, with a place taken meanwhile, then free; restore the past one; restore as the coordinator | 409 collisions; 200 and `planned`; 409 `occurrence_already_ended`; 403; one moved notice with "takes place after all" | REQ-A05, REQ-A09 |
| TEST-A08 | integration | Units report with a Polish and an English user; policies of three scopes | Export CSV in each locale; read the policies list | Polish headers and `;` for pl, English headers and `,` for en, the encoding unchanged; Scope and Applies to in two columns; "24 h" | REQ-A06 |
| TEST-A09 | integration | A match (`confirm`) with a deadline in one hour; a training (`absence_only`) with a deadline value; a guardian, a 14-year-old with `guardian_confirm`, a coach; a personal link | Declare before the deadline; advance the clock; declare as guardian, through the link, as coach; decide a pending declaration; report an absence on the training; move the match by a day; move it so that the deadline falls in the past | 200 before; 409 `declaration_deadline_passed` for guardian and link; the coach's declaration and the pending decision are accepted; the absence is accepted; `confirmBy` moved by a day; 422 `occurrence_confirm_by_in_past` until `confirmBy` is sent | REQ-A07 |
| TEST-A10 | UI | The same match, guardian with two wards, 375 px, light and dark, en and pl | Open `/club`, the calendar and the session page before and after the deadline; open the coach's list | "Confirm by …" then "Deadline passed …" with the hint; "no answer" badge; the session page row; the list shows the unanswered first with the count | REQ-A07 |
| TEST-A11 | integration + security | A coach of team A and class group C; team B of another coach; an external team | Create a sparring for A with a typed venue, an opponent, gathering and deadline; a match for A at a club place; a sparring for C; an event for B; an event with both a place and a venue; with neither; a typed-venue sparring with `isAway: false`; a series (`POST /api/activities/activities`) with a venue, as the coordinator; edit and cancel the own event; edit a series session | 201 with `venue`, `placeId` null, `isAway` true; 201; 422 `activity_type_requires_team`; 403; 422 `venue_or_place_required` twice; 201 with `isAway` false; 422 `venue_requires_one_off`; edit and cancel succeed; 403 on the series session; the facility calendar of every place omits the typed-venue sessions | REQ-A08 |
| TEST-A12 | UI | The coach on a phone at 375 px, light and dark, en and pl | `/club/events/new`: choose Sparring, switch to "Other address", save; open the session; tap the map link target; open Edit | fields per type and group kind; the session page shows the venue and the map link; the edit form holds the values; field errors are announced | REQ-A08, REQ-A13 |
| TEST-A13 | integration | A planned future session with two guardians (one without an account), a participant with an account, a coach; the test mailbox | Move the time; replay the event; deliver it twice at once; change only the coach; change only the deadline; move as a coach of a one-off event; undo the move; move a past session | one thread message, one notification and one e-mail per recipient per move, never to the actor; replays add nothing; no notice for the coach or deadline change; coordinators added for the coach's move; the undo is announced; nothing for the past session | REQ-A09 |
| TEST-A14 | integration | A weekly series with 10 future sessions, one detached | Change the start time of the series; change only its description | one notice naming the first changed date and 9 sessions, in the activity's thread; none for the description | REQ-A09 |
| TEST-A15 | security | A second tenant with a session and a thread | Run both subscribers with the other tenant's ids in the payload under the first tenant's scope | nothing is written or sent; no cross-tenant read | REQ-A09 |
| TEST-A16 | UI | A coordinator of one section (not a coach) on a phone at 375 px, light and dark, en and pl; sessions in every view | `/club` counts → `?as=coordinator&view=unassigned` → session → Assign substitute; Move from "Needs a new time"; Cancel; open the list of another section by URL | three counts; chips filter; the sheet lists free coaches first; toasts name the number told; 403 or empty for the other section; no `/backend` link is needed at any step | REQ-A10 |
| TEST-A17 | UI + security | The same coordinator; a coach of one group; a guardian | `/club/groups` and a roster as each; add, edit, end and remove as the coordinator | the coordinator sees the section's groups and all actions; the coach sees own groups read-only; the guardian gets 403; no contact data in any response | REQ-A11 |
| TEST-A18 | UI | A group thread with a guardian's message; the coordinator on a phone | Mark as case; try to delete a message; in a fresh thread delete a message | case banner and badge; 409 `case_immutable` shown as text; the deleted message becomes a tombstone | REQ-A12 |
| TEST-A19 | UI | Guardian and coach on a phone; a session at an external place, one with a substitute | Today, calendar and session page | dot, map link, "substitute: {name}", type and status badges; the coach's card opens the session page and has "Attendance list"; "Message the group" opens the composer scoped to the session; the history lists the entries | REQ-A13 |
| TEST-A20 | integration + UI | A training with 10 participants, 2 reported absences; a match with 6 "yes"; an unassigned session of the assistant's group starting in 90 minutes | Open the list 31 and 29 minutes before the start; quick fill on both sessions; run `mercato activities set-up-club` twice for a club set up before the job; run the warning job twice; take over as the assistant, then as a second coach | 409 then open; 8 marked present on the training, 6 on the match; the schedule is registered once; one warning per recipient; the assistant becomes the coach with a history entry; 409 `occurrence_has_coach` for the second | REQ-A14 |
| TEST-A21 | integration | A match that started, a match tomorrow, a training | Record 3:1 with a note as the coach; clear it; record on the others | saved and shown on the session page and the panel record; 409 `score_before_start`; 422 `score_not_applicable` | REQ-A15 |
| TEST-A22 | unit | `activities/lib/attendance-sheet.ts`, `lib/occurrence-list.ts`, a new `lib/confirm-by.ts`, `lib/session-change.ts`, `lib/venue.ts`; `groups/lib/groups-rules.ts` (roster order, membership actions) | quick fill per kind; view parsing with the alias; deadline offsets, limits and "passed"; which changes are announced and the change summary; map link building; allowed actions per membership status | 100 % line, branch and function coverage (`AGENTS.md`) | REQ-A03, REQ-A05, REQ-A07, REQ-A09, REQ-A13, REQ-A14 |

The integration tests live in `packages/app/.ai/qa/tests/groups/`, `activities/` and `communication/`, and run with `yarn test:integration:vereino --filter TEST-Axx`. TEST-A02 hides the DI token the way the messaging probe does (`packages/app/.ai/qa/tests/_fixtures/messaging-probe/probe.mjs`). Tests that need a passed deadline write the offset in the fixture so that the instant is already in the past; no test waits for the clock.

## Implementation Phases

Validation for each phase: `yarn verify`, the phase's integration tests, and for a migration the SQL review from `yarn db:generate` (no `yarn db:migrate` without the owner's approval). Each phase is one pull request and leaves a working app. Phases 1–3 need no migration and can run in parallel. Build order (owner decision Q-A27, 2026-11-16): 1–3, then 4 and 6 (6 needs phase 3 only and is built before phase 5, so moved-session notices, the brief's first outcome, do not wait for migration B), then 5, 7, 8 and 9. The texts of every phase use the names of the "Glossary (D-031 §2)"; where the navigation spec's rename has not landed yet, the phase uses the glossary's names for its new keys only.

### Phase 1 — Groups list and group record (B-11, B-12 without the roster)

- **Depends on:** none
- **Outcome:** REQ-A01 and REQ-A02 as described; J-A05 step 1.
- **Why this order / value delivered:** small and visible; it adds the contract the roster phase reuses.
- **Deliverables:**
  1. `groups`: `isPublic` in `groupListQuerySchema`; `GroupsTable.tsx` columns, kind badge, subtitle, filter and row action; i18n keys.
  2. `groups`: `GroupRecord.tsx` tabs in the URL in the order Details / Roster / Public, default `roster`; "Level" on the Details form; header links; the dictionary link beside the age-category select.
  3. `groups/services/group-usage.ts` (interface and token); the guard in `groups.groups.update` and its undo; `activities/di.ts` registers `activities.groupUsage` (`matchActivityCount`); error code `group_has_matches`.
  4. `activities`: `ActivitiesTable.tsx` reads `?groupId=`.
- **Independent slices / estimated commits:** (a) list: 1; (b) record: 1; (c) contract and guard: 1.
- **Requirements closed:** REQ-A01, REQ-A02
- **Tests:** TEST-A01, TEST-A02
- **Validation:** as above
- **Exit gate:** TEST-A01 in the browser in both locales, light and dark; the kind guard refuses with the total.

### Phase 2 — Roster: table, edit, end, remove (B-12)

- **Depends on:** phase 1 (the contract file)
- **Outcome:** J-A01 steps 1–3 and 5.
- **Why this order / value delivered:** removes the dead end the audit found in the first minutes of setting up a club.
- **Deliverables:**
  1. `groups`: `status` and `sortField=roster` on the memberships list; pure rules in `groups/lib/groups-rules.ts` (allowed actions per status) with unit tests.
  2. `groups`: `groups.memberships.delete` with undo, `DELETE` on the CRUD route, error codes `membership_in_use` and `membership_not_started`; the end command's new code; `activities` implements `membershipUsed`.
  3. `groups`: `RosterPanel.tsx` rebuilt on `DataTable` with the view tabs, the add and edit dialog, the end dialog with a date, Remove; `?personId=` and `?role=` open the add dialog with the person and role chosen (spec L, J-L07).
  4. The remove confirmation says that issued charges stay and are cancelled in Finance (V-A01: `payments` reads the roster on a date and has no membership subscriber, so nothing else is needed).
- **Independent slices / estimated commits:** (a) API and commands: 1–2; (b) UI: 1.
- **Requirements closed:** REQ-A03
- **Tests:** TEST-A03, TEST-A04, TEST-A22 (groups part)
- **Validation:** as above
- **Exit gate:** a roster of 130 rows is fully reachable; J-A01 steps 1–3 pass in the browser at 375 px and desktop.

### Phase 3 — Activities list, wizard, sessions list, reports (B-13…B-17)

- **Depends on:** none
- **Outcome:** J-A05 complete; REQ-A05 without the deadline and venue fields.
- **Why this order / value delivered:** the coordinator's planning path stops producing collisions and dead ends.
- **Deliverables:**
  1. `activities`: `ActivitiesTable.tsx` (Sessions button, rule text with the end date in `client-helpers.ts`, type badge by group kind, `EmptyState`).
  2. `activities`: `ActivityForm.tsx` and `PreviewPanel.tsx` (group label and prefill, own bookable places only, the empty-place hint with a link to Places, one "Last day", invited teams for a tournament, preview-gated Create, redirect to B-15).
  3. `activities`: `lib/occurrence-list.ts` (`view`, alias, `reschedule`), `OccurrencesTable.tsx` (scope header, inline actions, `MoveOccurrenceDialog`, per-view `EmptyState`), `CancelOccurrenceDialog.tsx` (names the session; toast with `notified`), `OccurrenceRecord.tsx` (address and map link).
  4. `activities`: `activities.occurrences.restore`, its route and the record's button.
  5. `activities`: CSV by locale in `lib/coach-units.ts`; `CoachUnitsReport.tsx` and `PoliciesTable.tsx` texts and columns.
- **Independent slices / estimated commits:** (a) list and wizard: 2; (b) sessions list and restore: 2; (c) reports: 1.
- **Requirements closed:** REQ-A04 (the deadline field arrives in phase 4), REQ-A05, REQ-A06
- **Tests:** TEST-A05, TEST-A06, TEST-A07 (the notice assertion in phase 6), TEST-A08, TEST-A22 (list part)
- **Validation:** as above
- **Exit gate:** J-A05 in the browser; `?view=` and `?perspective=` both open the same view.

### Phase 4 — Declaration deadline (D-031 §5)

- **Depends on:** phase 3 (the forms it extends). Migration A and the behaviour changes (409 after the deadline, reminder on the evening before the deadline's day) approved 2026-11-16 ([#252](https://github.com/wladku/Vereino/issues/252#issuecomment-6910004411)); the SQL is shown in the PR before it is applied
- **Outcome:** J-A02 steps 2–4.
- **Why this order / value delivered:** the first of the three owner decisions that change the data model; the smallest migration.
- **Deliverables:**
  1. Migration A: `confirm_by_minutes_before` on `activities_activities` and `activities_occurrences` (nullable; the previous release ignores them).
  2. `activities/lib/confirm-by.ts` (offset, limits, "passed") with unit tests; validators; activity, event and move commands; snapshots; series planning copies the default.
  3. The declare command and the personal-link command: 409 `declaration_deadline_passed`; reads gain `confirmBy`, `deadlinePassed`, `unansweredCount`; the reminder job `activities:send-declaration-reminders` targets the evening before the deadline's day for a session with a deadline.
  4. UI: the field on the wizard, the event forms and the move dialog (shown for `confirm` kinds); cards, session page and attendance list texts.
- **Independent slices / estimated commits:** (a) data and commands: 2; (b) member UI: 1; (c) panel UI: 1.
- **Requirements closed:** REQ-A07, REQ-A04 (complete)
- **Tests:** TEST-A09, TEST-A10, TEST-A22 (deadline part)
- **Validation:** as above
- **Exit gate:** J-A02 steps 2–4 on a phone in both locales, light and dark.

### Phase 5 — Typed venue and coach-created sparring or match (D-031 §6)

- **Depends on:** phases 4 and 6 (phase 6's notice texts gain the venue here). Migration B with its rollback rule, the `placeId`/`defaultPlaceId` narrowing and the wider events input and coach authorization approved 2026-11-16 ([#252](https://github.com/wladku/Vereino/issues/252#issuecomment-6910004411)); the SQL is shown in the PR before it is applied, and the PR confirms that no shared environment is deployed (*Compatibility → BC tiers*)
- **Outcome:** J-A02 steps 1 and 6.
- **Why this order / value delivered:** closes the guardian interview's main pain: an away fixture with a gathering time, created where the coach is.
- **Deliverables:**
  1. Migration B: `venue_name`, `venue_address`, nullable `place_id` / `default_place_id`, the four named check constraints of *Data Models*.
  2. `activities`: validators (a venue only on a one-off activity, 422 `venue_requires_one_off`; `is_away` defaults to on with a venue), `activities.events.create` (types, venue, opponent), the coach's right in `activities.occurrences.update` and cancel for one-off events, `services/schedule.ts` without a place, snapshots.
  3. Every reader of `placeId` handles null. The readers that assume a non-null place (V-A02, answered from the code at `47aa5c8`), each a BC §4 interface or a direct reader:
     - `ACTIVITIES_SCHEDULE_DIRECTORY` (`activities.scheduleDirectory`, `services/schedule-directory.ts`), read by `communication/services/directory.ts`, `communication/services/targets.ts`, `communication/commands/threads.ts` (the cancellation and moved notices and their e-mails) and `payments/services/directory.ts`;
     - `ACTIVITIES_PLACE_SESSIONS` (`services/place-sessions.ts`), read by `facilities/services/occupancy.ts`, `facilities/services/directory.ts` and `facilities/services/rented-hours.ts`; it selects by place, so a typed-venue session never appears there, and only the type changes;
     - `ACTIVITIES_PUBLIC_SCHEDULE` (`services/public-schedule.ts`, the public session page) and `ACTIVITIES_SHARE_TEXT` (`services/share-text.ts`);
     - the `generate-occurrences` worker (it plans series only, which never carry a venue; the type narrowing is handled, the behaviour unchanged);
     - the activities reads: calendar, sessions list, the activity and session records.

     `lib/venue.ts` (label and map link) with unit tests. The PR lists every changed reader.
  4. `change.before` of `activities.occurrence.updated` gains `venueName`, and the moved-session texts of phase 6 render the venue when it is present.
  5. UI: `ClubEventPage.tsx` (types, opponent, venue switch, the "away" box ticked by default with a venue), `EventForm.tsx`, new `/club/occurrences/[id]/edit`.
- **Independent slices / estimated commits:** (a) schema and commands: 2; (b) readers: 1–2; (c) UI: 2.
- **Requirements closed:** REQ-A08
- **Tests:** TEST-A11, TEST-A12
- **Validation:** as above, plus `yarn contracts:check`
- **Exit gate:** J-A02 steps 1 and 6 on a phone; no page throws on a session without a club place (calendar, facility calendar, public page).

### Phase 6 — A moved session is announced (D-031 §7)

- **Depends on:** phase 3 only (the restore command and the move dialog); built before phase 5 (owner decision Q-A27, 2026-11-16). The event and messaging contracts (the `change` and actor fields, `scheduleChange`, `communication.threads.record_reschedule`, the template `communication.session_moved`, the notification type, the two subscribers) and the default texts (Q-A02) approved 2026-11-16 ([#252](https://github.com/wladku/Vereino/issues/252#issuecomment-6910004411)); the owner reads the rendered pl and en e-mails in this phase's PR
- **Outcome:** J-A03 steps 3–5.
- **Why this order / value delivered:** the brief's first outcome; from here every edit made in phases 3 and 4 reaches families, and phase 5's edits reach them as soon as it lands. Until phase 5 a session always has a club place; the texts render a typed venue when one is present (phase 5, deliverable 4).
- **Deliverables:**
  1. `activities`: `lib/session-change.ts` (what counts, the summary) with unit tests; the `change` and actor fields on `activities.occurrence.updated` from update, its undo and restore; `scheduleChange` on `activities.activity.updated`.
  2. `activities`: subscriber `activities:notify-occurrence-moved`, notification type `activities.occurrence_moved` with its renderer, `services/cancellation-notice.ts` generalised to a session notice; `notified` in the move response.
  3. `communication`: subscriber `communication:session-moved`, command `communication.threads.record_reschedule`, template `communication.session_moved` (en, pl), the share text for a moved session.
- **Independent slices / estimated commits:** (a) events and in-app: 2; (b) thread and e-mail: 2.
- **Requirements closed:** REQ-A09
- **Tests:** TEST-A13, TEST-A14, TEST-A15, TEST-A07 (notice part), TEST-A22 (change part)
- **Validation:** as above; the e-mails are read in the test mailbox in both languages
- **Exit gate:** J-A03 steps 3–5; a replayed event sends nothing.

### Phase 7 — Member session surfaces, attendance, taking over, scores

- **Depends on:** phase 5 (venue on cards). Migration C, the take-over and score routes, the scheduler target `activities:warn-unassigned-sessions` with `activities.session_without_coach`, and the 30-minute attendance window approved 2026-11-16 ([#252](https://github.com/wladku/Vereino/issues/252#issuecomment-6910004411)); the SQL is shown in the PR before it is applied
- **Outcome:** J-A04 steps 3–5; REQ-A13, REQ-A14, REQ-A15.
- **Why this order / value delivered:** the coach's daily pages; small pieces that share the same components.
- **Deliverables:**
  1. Cards and session page: dot, map link, substitute, badges; coach card link and button (`club-client.ts:551`); "Message the group"; the substitution history the staff read already returns, shown on the member session page.
  2. `lib/attendance-sheet.ts` quick fill by kind (unit tests); the 30-minute window in the check-off command; `ClubAttendancePage.tsx` labels and the "opens at" state.
  3. `activities.occurrences.take_over`, its route and button; the worker `activities:warn-unassigned-sessions`, its schedule in `services/club-setup.ts` (`setUpClubActivities` gains a fourth schedule and its flag in the result) and the notification type. A new club gets the schedule through `setup.ts` `seedDefaults`; `seedDefaults` does not run again for an existing club, so the release note tells the operator to run `yarn mercato activities set-up-club --tenant <id> --org <id>` once per existing club (idempotent, as for #192's reminders).
  4. Migration C (`score_home`, `score_away`, `result_note`), `activities.occurrences.record_score`, the score block on M-04 and the panel record.
- **Independent slices / estimated commits:** (a) surfaces: 1; (b) attendance: 1; (c) take over and job: 2; (d) score: 1–2.
- **Requirements closed:** REQ-A13, REQ-A14, REQ-A15
- **Tests:** TEST-A19, TEST-A20, TEST-A21, TEST-A22 (sheet part)
- **Validation:** as above
- **Exit gate:** the quick fill closes a training in two taps on a phone; the warning arrives once.

### Phase 8 — The coordinator's sessions on the phone (D-031 §3)

- **Depends on:** phases 3, 6 and 7; **spec N phase 5** (the staff context and `memberStaffScopes`, N DD-N08). Without it the pages work by URL only and the phase cannot close
- **Outcome:** J-A03 steps 1–2 and J-A04 steps 1–2.
- **Why this order / value delivered:** the largest D-029 gap; it comes after the notices so that a move from the phone is announced.
- **Coordinator view in N's staff context.** N has one staff context, not a coordinator context (DD-N08, A-N09); in it Today and the calendar ask for `as=coach`. This phase adds the section view on top of it:
  - A page reads `as=coordinator` only when the person is in the staff context and `memberStaffScopes(profile)` includes `coordinator`; the server still checks the `coordinator` grant's `section_ids`.
  - **Today:** the staff context keeps the coach's "My sessions" tile (`as=coach`) when the scopes include `coach`, and adds the "Section sessions" tile with the three counts (`as=coordinator`) when they include `coordinator`. A person with both sees both tiles; no switch is needed.
  - **Calendar (M-03):** with both scopes a two-chip switch "My sessions" (`as=coach`, the default) / "Section" (`as=coordinator`, with the view chips) sits above the list and is kept in the URL (`?as=`). With `coordinator` only, the calendar opens on "Section" without the switch; with `coach` only, nothing changes from N.
  - A session opened from a section list or a count carries `?as=coordinator`; one opened from "My sessions" carries `?as=coach`. The block "Running the session" follows the read's `may*` flags in both.
  - The member context (N) never shows the section view.
- **Deliverables:**
  1. `club-client.ts`: the perspective `coordinator`, chosen from `memberStaffScopes` as above; `ClubCalendarPage.tsx` the "My sessions / Section" switch, section filter and view chips; the Today tile with counts.
  2. `ClubSessionPage.tsx` and `CoachSessionBlock.tsx`: the block for whoever may act; the coach picker sheet (logic of `AssignCoachDialog.tsx` moved to a shared hook); the reads' `may*` flags.
  3. The edit page of phase 5 opened for the coordinator on any planned session.
- **Independent slices / estimated commits:** (a) calendar and Today: 1–2; (b) session block and sheet: 2.
- **Requirements closed:** REQ-A10
- **Tests:** TEST-A16
- **Validation:** as above
- **Exit gate:** J-A03 and J-A04 pass on a phone at 375 px, both locales, light and dark, without one `/backend` page.

### Phase 9 — The coordinator's roster and cases on the phone (D-031 §3)

- **Depends on:** phase 2; **spec N's More entry "Groups"** (N, More table; shipped by #258 with `available: false`, N V-N04). The page is reachable by URL before the entry is shown
- **Outcome:** J-A01 step 4; REQ-A11, REQ-A12.
- **Why this order / value delivered:** completes D-031 §3.
- **Deliverables:**
  1. `groups/frontend/club/groups/page.tsx` and `[id]/page.tsx` with their components and `page.meta.ts` (`requireFeatures: ['people.self', 'groups.view']`); the Groups row of `MEMBER_MORE_DESTINATIONS` in `@vereino/ui` `member-nav.ts` becomes `available: true` in the same PR.
  2. `communication/components/club/ClubThreadPage.tsx`: "Mark as case" and "Delete" behind `communication.cases.manage` (deleting a message on the phone approved 2026-11-16, Q-A26; the same feature and the same 409 `case_immutable` as the panel).
- **Independent slices / estimated commits:** (a) roster pages: 2; (b) thread actions: 1.
- **Requirements closed:** REQ-A11, REQ-A12
- **Tests:** TEST-A17, TEST-A18
- **Validation:** as above
- **Exit gate:** J-A01 step 4 on a phone; a coach sees own rosters read-only.

## Requirement Traceability

| Requirement | Journey / surface | Data/API/event contracts | Phase | Tests | Acceptance criterion |
|---|---|---|---|---|---|
| REQ-A01 | B-11 `/backend/groups/groups` | `GET /api/groups/groups?isPublic` | 1 | TEST-A01 | AC-A01 |
| REQ-A02 | J-A05, B-12 | `groups.groups.update` guard, DI `activities.groupUsage` | 1 | TEST-A01, TEST-A02 | AC-A01, AC-A02 |
| REQ-A03 | J-A01, B-12 roster | memberships list `status`, `groups.memberships.delete`, end code | 2 | TEST-A03, TEST-A04, TEST-A22 | AC-A03 |
| REQ-A04 | J-A05, B-13, B-14 | preview and create routes (unchanged), `confirmByMinutesBefore` | 3, 4 | TEST-A05 | AC-A04 |
| REQ-A05 | J-A03, B-15, session record | `?view=`, `?activity=`, `activities.occurrences.restore` | 3 | TEST-A06, TEST-A07, TEST-A22 | AC-A05 |
| REQ-A06 | B-16, B-17 | CSV of `reports/coach-units` | 3 | TEST-A08 | AC-A06 |
| REQ-A07 | J-A02, M-02, M-03, M-04, M-05, B-14 | `confirm_by_minutes_before`, declare 409, reads, reminder job | 4 | TEST-A09, TEST-A10, TEST-A22 | AC-A07, AC-A08 |
| REQ-A08 | J-A02, `/club/events/new`, `/club/occurrences/[id]/edit`, events form | `venue_*`, nullable `place_id`, `POST /api/activities/events`, `PATCH …/occurrences/{id}` | 5 | TEST-A11, TEST-A12 | AC-A09 |
| REQ-A09 | J-A03, session thread, e-mail | `activities.occurrence.updated` `change`, two subscribers, `record_reschedule`, `communication.session_moved` | 6 | TEST-A13, TEST-A14, TEST-A15, TEST-A07 | AC-A10, AC-A11 |
| REQ-A10 | J-A03, J-A04, M-02, M-03, M-04 as coordinator | calendar `as=coordinator`, occurrences list, coach, cancel, update | 8 | TEST-A16 | AC-A12 |
| REQ-A11 | J-A01, `/club/groups`, `/club/groups/[id]` | groups and memberships routes | 9 | TEST-A17 | AC-A13 |
| REQ-A12 | M-07 | `…/threads/{id}/case`, `DELETE …/messages/{messageId}` | 9 | TEST-A18 | AC-A13 |
| REQ-A13 | M-02, M-03, M-04 | session reads (`venue`, `substitutions`) | 7 | TEST-A12, TEST-A19, TEST-A22 | AC-A14 |
| REQ-A14 | J-A04, M-05 | quick fill, attendance window, `take_over`, job `warn-unassigned-sessions` | 7 | TEST-A20, TEST-A22 | AC-A15 |
| REQ-A15 | M-04, session record | `score_*`, `record_score` | 7 | TEST-A21 | AC-A16 |

**Extension surfaces** (`.ai/guides/spec-delivery.md`). Each added surface is its own row; the reference ids are those the club spec's *Extension Surface Tracking* uses:

| Surface | Requirement | Reference capability and file | Phase | Test | Classification |
|---|---|---|---|---|---|
| DI service `activities.groupUsage` | REQ-A02, REQ-A03 | `module.di-registration`, `src/modules/example/di.ts`; adapted in Vereino as `groups.sectionUsage` | 1, 2 | TEST-A02, TEST-A03 | emitted-example |
| CRUD `DELETE /api/groups/memberships` | REQ-A03 | `api.crud-query-engine-custom-fields`, `src/modules/example/api/todos/route.ts`; adapted as `groups/api/memberships/route.ts` | 2 | TEST-A03 | emitted-example |
| Command routes `…/occurrences/{id}/restore`, `/take-over`, `/score` | REQ-A05, REQ-A14, REQ-A15 | `api.custom-route`, `src/modules/example/api/organizations/route.ts`; adapted as `activities/api/occurrences/[id]/cancel/route.ts` | 3, 7 | TEST-A07, TEST-A20, TEST-A21 | emitted-example |
| Persistent subscriber `activities:notify-occurrence-moved` | REQ-A09 | persistent idempotent subscriber per `.ai/guides/contracts.md`; adapted as `activities/subscribers/notify-occurrence-cancelled.ts` | 6 | TEST-A13 | catalog-only |
| Persistent subscriber `communication:session-moved` | REQ-A09 | as above; adapted as `communication/subscribers/session-cancelled.ts` | 6 | TEST-A13, TEST-A15 | catalog-only |
| Notification types `activities.occurrence_moved`, `activities.session_without_coach` | REQ-A09, REQ-A14 | `notifications.type`, `src/modules/example/notifications.ts` | 6, 7 | TEST-A13, TEST-A20 | emitted-example |
| Worker and scheduler target `activities:warn-unassigned-sessions` | REQ-A14 | `module.setup-scheduler-target`, `src/modules/example/setup.ts`; adapted as `activities/workers/expire-guardian-confirmations.ts`, registered in `activities/services/club-setup.ts` | 7 | TEST-A20 | emitted-example |
| Frontend pages `/club/occurrences/[id]/edit`, `/club/groups`, `/club/groups/[id]` | REQ-A08, REQ-A10, REQ-A11 | `ui.frontend-page`, `src/modules/example/frontend/example.tsx`; adapted as `activities/frontend/club/events/new/page.tsx` | 5, 9 | TEST-A12, TEST-A17 | emitted-example |

## Rollout, Migration, and Rollback

Rollback follows S14.6: it redeploys the previous release and never runs `down()`. Every item below is Ask First (`AGENTS.md`). **All of them were approved by the product owner on 2026-11-16** ([#252 owner decisions](https://github.com/wladku/Vereino/issues/252#issuecomment-6910004411), items (a)1–(a)10 of the [pre-implementation audit](https://github.com/wladku/Vereino/issues/252#issuecomment-6899294590)). Each migration's generated SQL is shown in its pull request before it is applied; no one runs `yarn db:migrate` against a shared or real database without the owner.

| Item | Kind | Approval | Compatibility with the previous release |
|---|---|---|---|
| Migration A — `confirm_by_minutes_before` on `activities_activities` and `activities_occurrences` (phase 4) | migration, two nullable columns | approved 2026-11-16 ([#252](https://github.com/wladku/Vereino/issues/252#issuecomment-6910004411), (a)1; Q-A06) | ignored by the previous release |
| Migration B — `venue_name`, `venue_address` on both tables, `place_id` and `default_place_id` nullable, the check constraints `*_place_or_venue` and `*_venue_address_with_name` (phase 5) | migration | approved 2026-11-16 ([#252](https://github.com/wladku/Vereino/issues/252#issuecomment-6910004411), (a)2; Q-A01), with the rollback rule | additive until the first typed venue is saved; after that the previous release cannot render that session. Rollback rule: before redeploying the previous release, typed-venue sessions are listed (`place_id IS NULL`) and cancelled or given a place; the pull request ships the query |
| Migration C — `score_home`, `score_away`, `result_note` and the check constraint `activities_occurrences_score_pair` (phase 7) | migration, nullable columns | approved 2026-11-16 ([#252](https://github.com/wladku/Vereino/issues/252#issuecomment-6910004411), (a)3; Q-A21) | ignored by the previous release |
| `placeId`/`defaultPlaceId` nullable in the reads of activities and sessions and in the DI services `activities.scheduleDirectory`, `placeSessions`, `publicSchedule`, `shareText` (phase 5) | contract change (response and DI guarantee narrowed, BC §2 and §4) | approved 2026-11-16 ([#252](https://github.com/wladku/Vereino/issues/252#issuecomment-6910004411), (a)4) | Vereino readers updated in the phase (phase 5, deliverable 3) |
| `POST /api/activities/events`: `sparring`, `match`, `venue`, `opponentExternalTeamId`, `confirmByMinutesBefore`; a coach may PATCH and cancel the one-off events of coached groups (phase 5) | contract change (additive input, wider authorization) | approved 2026-11-16 ([#252](https://github.com/wladku/Vereino/issues/252#issuecomment-6910004411), (a)5; Q-A09, Q-A10; DD-A04, DD-A05) | additive |
| DI token `activities.groupUsage`; `DELETE /api/groups/memberships` with `groups.memberships.delete`; `status` and `sortField=roster` on the memberships list; 422 `membership_not_started` on `…/end` instead of `validity_inverted` (phases 1–2) | contract change | approved 2026-11-16 ([#252](https://github.com/wladku/Vereino/issues/252#issuecomment-6910004411), (a)6) | additive, one changed error code |
| `change`, `groupId`, actor fields and `updatedAt` on `activities.occurrence.updated`; `scheduleChange` on `activities.activity.updated`; command `communication.threads.record_reschedule`; e-mail template `communication.session_moved`; notification type `activities.occurrence_moved`; two persistent subscribers (phase 6) | contract change (additive event payload, new ids) | approved 2026-11-16 ([#252](https://github.com/wladku/Vereino/issues/252#issuecomment-6910004411), (a)7); texts: the default (Q-A02), the owner reads the rendered pl and en e-mails in the phase 6 PR | additive |
| New routes `POST …/occurrences/{id}/restore` (phase 3), `POST …/take-over` and `PUT …/score` (phase 7); query parameters `view` (`perspective` kept as an alias), `activity`, `isPublic`; response fields `confirmBy`, `deadlinePassed`, `venue`, `score`, `unansweredCount`, `mayAssign`, `mayEdit`, `mayTakeOver` (phases 1, 3, 4, 5, 7, 8) | contract change, additive (BC §2) | approved 2026-11-16 as one group ([#252](https://github.com/wladku/Vereino/issues/252#issuecomment-6910004411), (a)8) | additive |
| Scheduler target `activities:warn-unassigned-sessions` and notification type `activities.session_without_coach` (phase 7) | new scheduled job | approved 2026-11-16 ([#252](https://github.com/wladku/Vereino/issues/252#issuecomment-6910004411), (a)9; Q-A19) | not registered in the previous release |
| Behaviour changes: attendance opens 30 minutes before the start (DD-A13, phase 7); a declaration is refused after the deadline (phase 4); the declaration reminder for a session with a deadline goes on the evening before the deadline's day instead of the session's (phase 4) | behaviour change | approved 2026-11-16 ([#252](https://github.com/wladku/Vereino/issues/252#issuecomment-6910004411), (a)10; Q-A18; the deadline rule also D-031 §5) | the previous release reverts to its rules |

No new module and no new dependency (the owner approved none, and none is needed). No feature flag: each phase is complete on its own. Seeds: none. The scheduler target reaches a new club through `setup.ts` `seedDefaults` → `setUpClubActivities`; an existing club gets it when the operator runs `yarn mercato activities set-up-club --tenant <id> --org <id>` once after the phase 7 deploy (idempotent; the release note says so, as for #192's reminders). Observability: the two new subscribers and the job log through `createLogger('activities' | 'communication')` with the session id; delivery failures surface through the existing `foundation.dispatch.delivery_failed`.

## Risks and Tradeoffs

| Risk / tradeoff | Impact | Mitigation / detection | Residual risk |
|---|---|---|---|
| A reader of `placeId` is missed when it becomes nullable | A page or a job fails on a typed-venue session | Phase 5 deliverable 3 names every reader found at `47aa5c8` (V-A02); the pull request repeats the grep of `placeId` across modules for readers added since; `strict` TypeScript flags the nullable type; TEST-A11 and TEST-A12 open the calendar, the facility calendar and the public page | Low |
| Rolling back after typed venues exist | The previous release cannot show those sessions | The rollback query and rule in *Rollout* | Medium; accepted, stated to the owner with migration B |
| Too many notices: several edits of one session in a row | Recipients ignore them | One notice per committed change is the owner's rule (DD-A09); the move form shows "n people will be told"; a series change sends one | Medium |
| A notice is sent for a session the recipient no longer belongs to | Confusion | The audience is computed on the session's new date at delivery time | Low |
| The event is delivered before the transaction is visible | The subscriber reads the old state | Emission is after commit (`emitAfterCommit`); the subscriber compares `updatedAt` and retries (persistent) | Low |
| Removing a membership that already produced a charge | A charge without a membership | `payments` subscribes to no `groups.membership.*` event and reads the active participant memberships on a date (`payments/services/group-charges.ts:112-120`), so a removed membership stops future charges and issued charges stay (V-A01). The confirm text says so and that they are cancelled in Finance | Low |
| The 30-minute window lets a coach close a session before it starts | Wrong units | Closing early already asks for confirmation (`closesEarly`); the units report counts `done` sessions by date as today | Low |
| A coach edits a one-off event at the last minute | Families learn late | The notice is immediate; the coordinators are told about every coach change | Accepted |
| Two coaches take over the same session | A wrong history | The command locks the session row; the second gets 409 `occurrence_has_coach` | Low |
| Spec N phase 5 (staff context, `memberStaffScopes`) lands late | Phase 8 cannot close | The pages work by URL (`?as=coordinator`) for testing; the phase's *Depends on* names the dependency | Schedule risk only |
| An existing club never gets the unstaffed-warning schedule | No warning before an unstaffed session | `seedDefaults` runs only at club setup; the release note of phase 7 names `mercato activities set-up-club`, and its result reports each schedule's flag | Low |
| Texts drift from the glossary while the rename is in flight | Mixed names on one page | New keys use the glossary's names; the strict i18n check runs in `yarn verify` | Low |

## Acceptance Criteria

Every criterion that names a phone page is checked at 375 px, in English and Polish, in light and dark mode (D-029).

- [ ] **AC-A01** — On the groups list an administrator filters "Public: yes" and sees the public groups with a "Public" badge; a class group shows its level in "Category / level". `?tab=details` opens that tab after a reload, and "Activities" on the record opens the activities of that group with "New activity" preselecting it.
- [ ] **AC-A02** — Changing a team that has a match or a sparring into a class group answers 409 `group_has_matches` and changes nothing.
- [ ] **AC-A03** — In a roster of 130 memberships every row is reachable through the views Active, Upcoming and History, and the active count equals the data. A coordinator adds a person found by first name, edits the role and the dates, ends a membership on a chosen day, and removes a membership that has not started. Removing a membership with attendance answers 409 `membership_in_use`; ending a membership before its start answers 422 `membership_not_started` and the page offers Remove instead.
- [ ] **AC-A04** — In the wizard "Create" is disabled until a preview of the current values shows "No collisions". External places are not offered; with no bookable place the form explains why and links to Places. After saving, the sessions list opens scoped to the new activity.
- [ ] **AC-A05** — `/backend/activities/occurrences?view=unassigned` and `?perspective=unassigned` show the same sessions; `?view=reschedule` lists the sessions that need a new time; `?activity={id}` lists one activity's sessions. "Assign substitute", "Move" and "Cancel" work from the row. The administrator restores a cancelled future session with a reason; a coordinator cannot.
- [ ] **AC-A06** — The units CSV opened by a Polish user has Polish headers and `;`; the policies list shows "Scope", "Applies to" and "24 h".
- [ ] **AC-A07** — A guardian of a child called up for a match with a deadline sees "Confirm by {date, time}" on `/club`, `/club/calendar` and the session page. After the deadline the buttons are gone, the card reads "Deadline passed" with the hint to write to the coach, an unanswered child reads "no answer", and a declaration through the app or a personal link answers 409 `declaration_deadline_passed`.
- [ ] **AC-A08** — After the deadline the coach's attendance list on the phone shows how many have not answered and lists them first; the coach can still record a declaration. A training's "Report absence" is not affected by a deadline.
- [ ] **AC-A09** — A coach creates, on the phone, a sparring for a team they coach with a typed venue, an opponent, a gathering time and a deadline; the session page shows the venue with a map link. The same coach cannot create one for another coach's team (403) or for a class group (422), and can edit and cancel the event they created but not a session of a series (403).
- [ ] **AC-A10** — When a coordinator or a coach changes the time, the place or venue, or the gathering time of a future session, each guardian with an account, each participant with an account and the coach get one in-app notification and one e-mail with the old and the new values, and the session's thread gets one system message naming who changed it. The person who made the change gets none. A replay of the event sends nothing. A change of the coach or the deadline alone sends none of these.
- [ ] **AC-A11** — Changing the time of a weekly series with nine future movable sessions sends one notice per recipient, not nine. Restoring a cancelled session sends one notice.
- [ ] **AC-A12** — A section coordinator who coaches no group opens `/club` on a phone, sees how many sessions need a coach, need a new time and are unsettled, opens each list, assigns a substitute, moves a session and cancels one, and never needs a `/backend` page. Sessions of another section are not shown and cannot be changed (403).
- [ ] **AC-A13** — The same coordinator opens `/club/groups`, a group's roster, adds a participant and ends a membership; a coach sees the rosters of their own groups without the actions. On a thread page the coordinator marks the thread as a case and deletes a message of a thread that is not a case; deleting in a case answers `case_immutable` as readable text.
- [ ] **AC-A14** — Session cards on `/club` and `/club/calendar` show the section's colour dot, a map link for an external place or a typed venue and "substitute: {name}"; the coach's card title opens the session page, which offers "Attendance list", "Message the group" and the substitution history.
- [ ] **AC-A15** — On a training with ten participants and two reported absences, the quick fill (`m.screenAttendance.markExpected`) marks eight present in one tap and "Close session" records the two as absent. The list opens 30 minutes before the start. Two hours before a session without a coach the section's coordinators and the group's coaches get one warning, and an assistant of the group takes the session over from the phone.
- [ ] **AC-A16** — After a match has started, its coach records 3:1 on the phone; the score shows on the session page and on the panel's session record. A score on a training or before the start is refused.
- [ ] Every listed backend surface matches its recorded Open Mercato reference and uses the canonical shell/components, shared API helpers, semantic tokens, and complete loading, empty, error, conflict, keyboard, accessibility, responsive, light-mode, and dark-mode states.
- [ ] Every affected API and UI path has self-contained integration coverage and the configured validation gate passes.

## Final Compliance Report

| Check | Status | Evidence / resolution |
|---|---|---|
| Applicable `AGENTS.md` files and routed guides/skills reviewed | pass | `AGENTS.md` (module boundaries, Ask First, coverage rule, phone checks), `.ai/guides/spec-delivery.md`, `.agents/skills/om-spec-writing/SKILL.md`, the template, the precedent `implemented/2026-11-03-vereino-ux-parity-phases-1-3.md`; `BACKWARD_COMPATIBILITY.md` read for the tier of every changed surface (*Compatibility → BC tiers*) and read again by phases 2, 5 and 6 |
| Data models, APIs, events, UI, and tests are internally consistent | pass | Requirement Traceability rows REQ-A01…REQ-A15 |
| Every workflow completes end to end without a catch-all integration phase | pass | J-A01…J-A05, each closed by named phases |
| Platform-native reuse and extension points were chosen before custom code | pass | Reuse and Ownership Map; DD-A06, DD-A07, DD-A12 |
| UI contracts identify references, canonical components, and theme/state coverage | pass | UI and Interaction Contracts |
| Every phase has dependencies, bounded slices, tests, value, and an observable exit gate | pass | Implementation Phases 1–9 |
| User approval for implementation | pass | [owner decisions on #252](https://github.com/wladku/Vereino/issues/252#issuecomment-6910004411) of 2026-11-16: the ten Ask First items of *Rollout* approved, the open questions answered, the autonomous defaults confirmed |
| Pre-implementation audit gaps closed | pass | [audit on #252](https://github.com/wladku/Vereino/issues/252#issuecomment-6899294590): (c1) DD-A07, Q-A11; (c2) *Reuse and Ownership Map*, *Events*, phase 7 deliverable 3, *Rollout*; (c3) V-A01, *Dependencies on the other parity specs*, *Risks*; (c4) V-A02, phase 5 deliverable 3; (c5) phase 8 *Coordinator view in N's staff context*; (c6) *Proposed Solution → Typed venue*, *Domain Vocabulary* ("Typed venue", "Session without a club place"), *Data Models* (named constraints); (c7) *Compatibility → BC tiers*, *Rollout* rows (a)8 and (a)10; (c8) REQ-A03, the B-12 roster row, phase 2, *Dependencies on the other parity specs*; (c9) this status, the changelog entry, the rows below |

Verdict: `Ready for implementation` — the owner approved the ten Ask First items, answered Q-A01…Q-A06, Q-A09…Q-A11, Q-A18, Q-A19, Q-A21 and Q-A25…Q-A27, and confirmed the other defaults on 2026-11-16 ([#252](https://github.com/wladku/Vereino/issues/252#issuecomment-6910004411)). Phase 8 waits for spec N phase 5; phase 9's More entry waits for spec N's Groups row (#258, already shipped hidden).

## Resolved assumptions (autonomous defaults)

These were chosen without the owner, as the option closest to the mockup or the most reversible one. The owner confirmed every row on 2026-11-16 ([#252](https://github.com/wladku/Vereino/issues/252#issuecomment-6910004411)); a row without a note in *Confirmation* was confirmed as written.

| ID | Question | Chosen answer | Rationale | Confirmation |
|---|---|---|---|---|
| Q-A06 | How is the deadline stored? | As minutes before the start, with a default on the activity (DD-A01); two columns in one migration | Follows DD-43; D-031 §5 approves "the new column" in principle, and this is one column per table | confirmed 2026-11-16 [#252](https://github.com/wladku/Vereino/issues/252#issuecomment-6910004411), with migration A |
| Q-A07 | May a guardian still say "no" after the deadline? | No; both answers close, the hint says to write to the coach, the coach may record it (DD-A02) | The mockup closes the controls | — |
| Q-A08 | Where is a typed venue stored? | Two text columns on the activity and the session; `place_id` nullable (DD-A03) | D-031 §6: not a club place | confirmed 2026-11-16 [#252](https://github.com/wladku/Vereino/issues/252#issuecomment-6910004411), with migration B and the contract change (Q-A01); venues only on one-off activities, `is_away` defaults on (Q-A25) |
| Q-A09 | Which event types may a coach create? | Tournament, other, and for a team sparring and match, at a club place or a typed venue (DD-A04) | D-031 §6 names sparring and away match; a home sparring adds no risk | confirmed 2026-11-16 [#252](https://github.com/wladku/Vereino/issues/252#issuecomment-6910004411); the collision check covers a club place |
| Q-A10 | May a coach edit a session? | Only a one-off event of a group they coach (DD-A05) | Needed to correct a coach-made event; every edit is announced | confirmed 2026-11-16 [#252](https://github.com/wladku/Vereino/issues/252#issuecomment-6910004411); every edit is announced and audited |
| Q-A11 | Which thread carries the moved notice? | The session thread, as for a cancellation (DD-A07) | D-031 §7: "the same channels, and the same thread, as a cancellation"; the session thread is listed for the group's audience, so it is "a message the group reads" | decided by D-031 §7; confirmed 2026-11-16 [#252](https://github.com/wladku/Vereino/issues/252#issuecomment-6910004411) (the earlier text misquoted §7 as "the group's thread") |
| Q-A12 | Is a series change announced per session? | Once per change (DD-A08) | Avoids a mail flood | — |
| Q-A13 | Are quick successive edits merged into one notice? | No (DD-A09) | "Every change" (D-031 §7) | — |
| Q-A14 | Is a change of the coach or of the deadline a "move"? | No | D-031 §7 lists time, place and gathering time; the coach change has its own notices | — |
| Q-A15 | When may a membership be removed instead of ended? | Before its start, or when it has no attendance (DD-A10) | Keeps the history rule of #30 | — |
| Q-A16 | `?view=` or `?perspective=` on the sessions list? | `?view=`, with `?perspective=` kept as an alias (DD-A11) | Mockup and DD-U03 | — |
| Q-A17 | First tab of the sessions list: "All" (README, #94) or "Upcoming" (mockup)? | The label "Upcoming" (`b.screenOccurrences.tabUpcoming`); the window stays 7 days back to 14 ahead | Names follow the mockup (D-031 §2) | — |
| Q-A18 | When does the attendance list open, and is each tap saved? | 30 minutes before the start; explicit Save stays (DD-A13) | Between the mockup and the built conflict rule | confirmed 2026-11-16 [#252](https://github.com/wladku/Vereino/issues/252#issuecomment-6910004411) |
| Q-A19 | What happens to a session that reaches its start without a coach? | A warning two hours before; a coach or assistant of the group may take it over | Not in the mockup; the smallest rule that leaves no session unrun | confirmed 2026-11-16 [#252](https://github.com/wladku/Vereino/issues/252#issuecomment-6910004411), with the scheduler target and the notification type |
| Q-A20 | Who restores a cancelled session? | The administrator only, with a reason, while it has not ended | Club spec glossary *Session* | — |
| Q-A21 | Who enters a score, and when? | The session's coach, a coach of the group or the coordinator, once the session started | REQ-020; the coach is at the pitch (D-029) | confirmed 2026-11-16 [#252](https://github.com/wladku/Vereino/issues/252#issuecomment-6910004411), with migration C |
| Q-A22 | "Unsettled": right after the end (mockup) or after 24 hours (README F-03)? | 24 hours (DD-A14) | README F-03 and the built behaviour | — |
| Q-A23 | Tab order of the group record and its default? | Details / Roster / Public as in the mockup; the default stays Roster | The mockup's order; the roster is the daily tab | — |
| Q-A24 | The cancel reason's length (dialog 3–500, API 1–500)? | Unchanged | Decided in the club spec's changelog of 2026-11-04 | decided earlier |

## Open Questions

All answered. The owner's answers of 2026-11-16 ([#252](https://github.com/wladku/Vereino/issues/252#issuecomment-6910004411)) follow the [pre-implementation audit](https://github.com/wladku/Vereino/issues/252#issuecomment-6899294590)'s recommendations; V-A01 and V-A02 were answered from the code at `47aa5c8`.

| ID | Question | Owner | Blocking? | Resolution / decision date |
|---|---|---|---|---|
| Q-A01 | Does migration B (typed venue, nullable `place_id`) get the owner's approval, with the rollback rule in *Rollout*? | Władek Kuć | was yes, for phase 5 only | Resolved 2026-11-16 ([#252](https://github.com/wladku/Vereino/issues/252#issuecomment-6910004411)): approved with the rollback rule; a typed venue only on a one-off activity (422 `venue_requires_one_off`) |
| Q-A02 | Are the texts of the moved-session e-mail and notification approved (en and pl)? | Władek Kuć | was yes, for phase 6 only | Resolved 2026-11-16 ([#252](https://github.com/wladku/Vereino/issues/252#issuecomment-6910004411)): the default — the cancellation's wording with the old → new time, place and gathering time; the owner reads the rendered pl and en e-mails in the phase 6 PR |
| Q-A03 | Should the coordinator's roster on the phone also allow adding a person who is not in the register yet? | Władek Kuć | no | Resolved 2026-11-16 ([#252](https://github.com/wladku/Vereino/issues/252#issuecomment-6910004411)): no — the person is created by the administrator (people life-cycle spec) |
| Q-A04 | May a coach hand a session directly to a named colleague, without the coordinator (interviews: coaches arrange it themselves)? | Władek Kuć | no | Resolved 2026-11-16 ([#252](https://github.com/wladku/Vereino/issues/252#issuecomment-6910004411)): no — absence report plus take-over by a coach of the group (REQ-A14) |
| Q-A05 | Fixtures import (REQ-039): schedule after the pilot, or archive? | Władek Kuć | no | Resolved 2026-11-16 ([#252](https://github.com/wladku/Vereino/issues/252#issuecomment-6910004411)): stays a Should of the club spec, not scheduled; revisited at the pilot review |
| Q-A25 | Does a typed venue force `is_away = true`? `is_away` feeds the coach units report and settlement (`activities/data/entities.ts:33`) | Władek Kuć | no | Resolved 2026-11-16 ([#252](https://github.com/wladku/Vereino/issues/252#issuecomment-6910004411)): it defaults to on, and the form can untick it (DD-A04, *Domain Vocabulary* "Typed venue") |
| Q-A26 | May a coordinator delete a message on the phone (REQ-A12)? D-031 §3 names only marking a case | Władek Kuć | no | Resolved 2026-11-16 ([#252](https://github.com/wladku/Vereino/issues/252#issuecomment-6910004411)): yes — the same feature `communication.cases.manage` and the same 409 `case_immutable` as the panel |
| Q-A27 | May phase 6 (moved-session notices, the brief's first outcome) be built before phase 5 (migration B)? | Władek Kuć | no | Resolved 2026-11-16 ([#252](https://github.com/wladku/Vereino/issues/252#issuecomment-6910004411)): yes — phase 6 depends on phase 3 only, renders a venue when present, and is built before phase 5 |
| V-A01 | Does `payments` react to `groups.membership.deleted` as to an ended membership? | implementer, phase 2; payments parity spec | no | Answered 2026-11-16 from the code: `payments` subscribes to no `groups.membership.*` event; `payments/services/group-charges.ts:112-120` (`groupParticipants` → `rosterOn`) reads the active participant memberships on a date, so a removed membership stops future charges and issued charges stay. No payments change; the remove confirmation says issued charges stay (phase 2) |
| V-A02 | Which Vereino readers assume a non-null `placeId` (facilities calendar, `scheduleDirectory`, public schedule, share text)? | implementer, phase 5 step 3 | no | Answered 2026-11-16 from the code: `ACTIVITIES_SCHEDULE_DIRECTORY` (read by `communication/services/{directory,targets}.ts`, `communication/commands/threads.ts`, `payments/services/directory.ts`), `ACTIVITIES_PLACE_SESSIONS` (read by `facilities/services/{occupancy,directory,rented-hours}.ts`), `ACTIVITIES_PUBLIC_SCHEDULE`, `ACTIVITIES_SHARE_TEXT` and the `generate-occurrences` worker; listed in phase 5 deliverable 3. Changing the DI interfaces is BC §4 |

## Changelog

Each change is its own file in `.ai/specs/changelog/2026-11-14-vereino-parity-groups-and-activities/` (`YYYY-MM-DD-<slug>.md`, one `| date | change |` row), so parallel PRs never conflict here; `cat .ai/specs/changelog/2026-11-14-vereino-parity-groups-and-activities/*.md` lists them in date order. Never add rows to this section. The entries this spec adds to the specs it completes are `.ai/specs/changelog/2026-10-20-vereino-club-management/2026-11-14-parity-a.md` and `.ai/specs/changelog/2026-10-27-vereino-foundation-messaging-primitives/2026-11-14-parity-a.md`.
