# Sign-up form for a section: age check, places, waiting list and trial session

**Date**: 2026-11-25
**Status**: In progress — approved by the product owner on 2026-11-26 ([owner decision on #788](https://github.com/wladku/Vereino/issues/788#issuecomment-7183799608)); issue #788, epic E26 #787, decision D-041 in PR #786

> Use om-spec-writing for the process. This spec is design-only: nothing is built in its PR.

Sources: D-041 (`.ai/specs/research/decisions/D-041-section-sign-up-form.md`, PR #786: a public sign-up form per
section, decided by the section coordinator), D-029 (phone first for every role but the administrator), D-034 and the
many-clubs spec `2026-11-22-vereino-many-clubs-one-instance.md` (one tenant per club; the cross-club isolation guard
#628), D-024/D-026 (the only approved system-scope lookups of sessionless routes), D-035 (core under AGPL; this is core,
not Enterprise), the club management spec `2026-10-20-vereino-club-management.md` (REQ-024 facility booking requests,
REQ-025 public club page, Q-027), the people life-cycle spec
`implemented/2026-11-14-vereino-people-life-cycle-and-data-entry.md` (Q-L06, REQ-L16 and the "Fits" rule of #601), the
person data export spec `2026-11-21-vereino-person-data-export.md` (#527) and the compliance pack in `docs/compliance/`
(E19). Code facts checked at `824a2ca8` (`main`, 2026-11-25). D-041 and the Q-L06 marking in the people life-cycle
spec land with PR #786; until it merges, read D-041 on its branch `docs/d-041-section-sign-up`.

## TLDR

A parent applies for a child (or an adult for themself) to a section from the club's public section page, without an
account. The section coordinator decides on the phone. Built as a new module **`enrolment`** (Q-J01) in four phases:

1. **Places and settings** — a group gets an optional limit of places and an "accepts applications" switch; a section
   gets "accepts online applications"; the club gets an age reference day (default 1 September), an answer time
   (default 7 days) and an information text for applicants. The age-fit rule of #601 moves to `@vereino/core` so the
   public form and the roster share it.
2. **The form and the coordinator's inbox** — a three-step public form with an age hint that shows matching groups
   first (age in full years on the reference day; teams with a "U" category by birth year), a warning instead of a
   block for a group outside the range, "choose a group for us", e-mail confirmation with a one-time link valid for one
   hour (the facility request pattern), a honeypot and rate limits, and a status link where the applicant can withdraw.
   The coordinator gets a Today tile and a list with the tabs New, Trial session, Waiting list and Closed, the flags,
   a numbered waiting list per full group, and the decisions reject and waiting list. The administrator's dashboard
   shows applications past the answer time. Clubs cannot switch applications on before phase 3.
3. **Accepting and freed places** — accept into a group from a chosen day: create or reuse the child, guardian and
   family relation (with possible-duplicate detection), add the membership, send the account invitation; a notice when
   a place frees up, accepting beyond the limit after a warning (under a lock), season rollover; data export, erasure
   and season-end clearing.
4. **Trial session** — the coordinator proposes one of the group's next sessions; the child appears on that session's
   attendance list as a trial participant, with no membership and no fee; after the session the coordinator decides.

## Problem Statement

- Nobody can join a club through Vereino today. The coordinator enrols every child by hand (people life-cycle spec
  Q-L06, confirmed 2026-11-16), and people who are not members stay outside 1.0 (club management Q-027).
- Clubs collect sign-ups by phone, Messenger and paper forms. Age and group are sorted out in several rounds of
  messages: the parent does not know which group fits a child born in 2017, the coordinator does not know the child's
  age until asked.
- Clubs already run waiting lists and trial sessions, but on paper, so a freed place is often not offered to the next
  family in order.
- The benchmark of 2026-10-23 lists online enrolment as a common competitor feature; the four interested clubs (D-034)
  recruit every season (D-041 *Why*).

Evidence: the owner's request of 2026-11-25 and his four answers after a clickable mockup (D-041 *source*).

## Overview and Success Measures

| Measure | Target | How measured |
|---|---|---|
| Share of new participants of a pilot club who came through the form | ≥ 50 % in the first season after phase 3 | memberships created by `enrolment.applications.accept` ÷ all new participant memberships of the season (audit log by command id is encrypted, so count from `enrolment_applications.accepted_membership_id`) |
| Median time from confirmation to the first decision | ≤ the club's answer time (default 7 days) | `decided_at − confirmed_at` on `enrolment_applications` |
| Applications past the answer time on the first day of each month | falling month on month | the dashboard widget's count |
| Applications accepted into a group outside the age range | < 10 % | `age_fit = outside` among accepted |
| Unconfirmed applications (spam or typos) older than 24 hours left in the database | 0 | retention job counts |

Market reference: the enrolment forms of club tools in the benchmark (a public form per club or group, staff approval,
waiting list). Adopted: approval by staff, a waiting list, a trial session. Rejected: payment at sign-up (out of
scope), automatic acceptance into free places (the coordinator keeps control, D-041 §2).

## Goals

- **REQ-J01** — A group has an optional limit of places (participants) and its own "accepts applications" switch; a
  section has an "accepts online applications" switch (off by default) (D-041 §4, §1).
- **REQ-J02** — The club sets an age reference day (default 1 September), an answer time in days (default 7) and an
  information text for applicants (the information on data processing and anything the club wants to say) (D-041
  *Not decided here*).
- **REQ-J03** — The public section page `/p/<club>/sections/<section>` shows a "Zgłoś dziecko" / "Apply" button when
  the section accepts online applications and at least one of its public, active groups accepts applications.
- **REQ-J04** — The form has three steps (who applies and who for; the group with the age hint; contact, statement and
  consents) and asks only for the fields of D-041 §6, validated as in *Domain Vocabulary* (BR-J1).
- **REQ-J05** — Age is counted in full years on the club's reference date; groups whose public `age_from`–`age_to`
  contains the age are shown first; a team whose age category has a "U" range matches by birth year (REQ-L16, #601).
  Hard limits: no birth date in the future; a child is 3–17 and an adult 18 or older on the reference date (D-041 §3).
- **REQ-J06** — A group outside the age range can still be chosen from "all groups" after a warning, and "choose a
  group for us" is always possible; the coordinator sees "outside the age range" (D-041 §3).
- **REQ-J07** — The applicant confirms the e-mail address with a one-time link valid for one hour; an unconfirmed
  application never reaches the club (REQ-024 pattern, D-041 §1).
- **REQ-J08** — Spam protection without a CAPTCHA: a honeypot field, a rate limit per IP and per e-mail address, and the
  confirmation link (D-041 §6).
- **REQ-J09** — After confirmation the applicant receives a status link: it shows the state and lets the applicant
  withdraw (D-041 §2).
- **REQ-J10** — Confirmed applications reach the coordinators of the section, or the club administrators when the
  section has none; the coordinator has a Today tile and a list with the tabs New, Trial session, Waiting list and
  Closed, on the phone (D-029, D-041 §2).
- **REQ-J11** — Each application carries the flags outside the age range, group full, wants a trial session and
  possible duplicate (D-041 §2–§5).
- **REQ-J12** — The coordinator has four decisions — accept into a group from a chosen day, propose a trial session,
  put on the waiting list, reject with a reason the applicant sees — and each decision e-mails the applicant (D-041 §2).
- **REQ-J13** — Accepting creates or reuses the child and guardian persons and the family relation, adds the group
  membership from the chosen day and sends the account invitation; when the applicant may already be in the club the
  coordinator sees the possible duplicate and can reuse that person (D-041 §2).
- **REQ-J14** — Fees after acceptance follow the group's existing fee schedule from the start day; the accept screen
  says which fee applies and how a part month is charged (D-041 *Not decided here*, Q-J06).
- **REQ-J15** — A full group has a waiting list numbered per group in order of confirmation; when a place frees up the
  coordinator is told who is first; the coordinator may accept beyond the limit after a warning (D-041 §4).
- **REQ-J16** — A trial session: the coordinator proposes one of the group's next sessions; the child is on that
  session's attendance list as a trial participant, with no membership and no fee; the coach marks presence; after the
  session the coordinator accepts or rejects (D-041 §5).
- **REQ-J17** — The administrator's dashboard shows applications past the answer time, and the administrator decides
  for sections without a coordinator (issue #788).
- **REQ-J18** — Privacy: data minimisation (no address, PESEL, school or health data; the note warns against health
  data), the legal basis Art. 6(1)(b) (lawyer, Q-J09), retention (unconfirmed 24 hours, closed 30 days then anonymised,
  waiting lists cleared at season end), the person data export and erasure contributions, the club offboarding
  contributions and the compliance pack (D-041 §6).
- **REQ-J19** — Every new route has its cross-club probes (D-034, #628) and an integration test.

## Non-goals

- Building anything in this PR.
- Online payment, a deposit or an entry fee at sign-up (issue #788 *Out of scope*).
- Sign-ups of people who are not members to events, camps or tournaments: club management Q-027 stays for events.
- Automatic acceptance into a free place; applications by a signed-in member for another section (a member's guardian
  uses the same public form; a member flow can come later).
- Collecting an address, PESEL, school, health data or documents; a signature; uploading a medical certificate.
- A CAPTCHA or any third-party anti-spam service.
- Pro-rata charging of a part month (Q-J06 default: no new charging rule).

## Proposed Solution

### Design Decisions and Alternatives

| Decision | Rationale | Alternative considered | Why rejected / deferred |
|---|---|---|---|
| **DD-J01** A new module **`enrolment`** owns applications, the public form routes, the coordinator's screens, the trial participants, the retention job and the notifications. `groups` keeps the group fields (limit, switch) and gains one read contract; `club_core` keeps the section switch and the club settings (Q-J01) | applications have their own life cycle, ACL, encrypted fields, retention and public routes; `groups` stays a roster module; one module per invariant | the applications table in `groups` | it would add public sessionless routes, e-mails and a retention job to a module that has none, and mix non-members' data into the roster module |
| **DD-J02** An application is one row `enrolment_applications` holding the applicant's data encrypted, with no person id until it is accepted. Persons are created only on acceptance | a rejected or withdrawn family never becomes a club person (minimisation); erasing a non-member is deleting one row | creating the child and guardian persons at submission | every spam or rejected application would leave persons to clean up, and the club's person list would fill with non-members |
| **DD-J03** The age reference date of a day *d* is the latest occurrence of the club's reference day (`MM-DD`, default `09-01`) on or before *d* + 60 days. Age = full years on that date. A team whose age category has a "U" range uses the birth-year rule of REQ-L16 with the reference year of the season that contains the reference date (`referenceYear(season.startsOn, referenceDate)`; without such a season, the reference date's year), otherwise the age rule on the reference date. Occupancy (DD-J05) and the season end (DD-J14) are also taken from the reference date's season, never the group's ending season (Q-J02) | "1 September of the current season" without needing a current season row; from early July applications already count for the coming season, which is when clubs recruit; reuses #601 exactly for teams | the season row containing today | in June that is the ending season, so a child would be matched one year too young; clubs do not always create next season early |
| **DD-J04** The fit rule moves from `groups/lib/groups-rules.ts` (`fitsAgeRange`, `FitRule`, `fitRuleOf`, `fitsRule`, `fitsAgeCategory`, `referenceYear`) to `@vereino/core` (`packages/core/src/age-fit.ts`), re-exported by `groups/lib` so existing callers keep their imports; `enrolment` adds `ageReferenceDate` | two consumers now (groups' bulk move, enrolment's form and server check): AGENTS.md allows the move; the public form computes the hint in the browser with the same code the server re-checks | copying the rule into `enrolment` | two copies drift; a business module may not import another module's internals |
| **DD-J05** `groups` exposes a new optional DI contract `groups.applicationTargets(scope, { sectionId, date, groupIds?, lockGroupId?, em? })` → `[{ groupId, name, kind, seasonId, seasonEndsOn, ageFrom, ageTo, ageCategoryLabel, fitRule, placesLimit, occupied, acceptsApplications, isPublic, isActive }]`, where `date` is the application's reference date (or the start day on accept), `occupied` = participant memberships active on `date` (`rosterOn`), and `fitRule` uses the reference year of the season containing `date` | `enrolment` needs groups, their fit rule and their occupancy without an ORM read of `groups_groups` | reading `groups.publicCatalog` | the catalog has no occupancy or fit rule and is shaped for the public page blocks |
| **DD-J06** The confirmation token lives in a dedicated table `enrolment_confirmation_links` (`createTokenLinkService<'single'>`, `dedicatedTable: true`, TTL 1 hour), raw token only in the dispatch's encrypted per-recipient secret; the route takes the club slug in the path and the token in the body (`POST …/[clubSlug]/applications/confirm`), and the lookup passes the club's scope (`LookupOptions.scope`). "Send again" and a repeated submission (BR-J3) delete the old link and `issue` a new one | the facility request mechanism (`facilities/services/requests.ts`), but `issue()` always creates a row, so a token on the application row could not be re-sent; one-time by a conditional update | token columns on the application row (as facility requests) | no way to re-send a link without a second application row |
| **DD-J07** The status link is a dedicated table `enrolment_application_links` (`createTokenLinkService<'until_expiry'>`, `dedicatedTable: true`), issued on confirmation with the service's maximum TTL; when the application closes, `enrolment` sets the link's `expires_at` to the closing time + 30 days, and `purgeDead` deletes it 30 days after that (`DEAD_LINK_RETENTION_DAYS`). Reissued (old link deleted) when the applicant asks for it again by e-mail. The API routes carry `[clubSlug]`, resolve the club through `clubCorePublicSite` and pass that scope to `peek`/`inspect`/`redeem`, so no lookup runs outside a club. Should the owner prefer slug-free links in the e-mails, the lookup by `token_hash` alone would need an AGENTS.md exception like DD-R13 of the facilities spec (Ask First; not assumed) | the applicant has no account; a capability link is the only way to see the state and withdraw; a scoped lookup needs no new system-scope exception | a sign-in for applicants | an account for a non-member contradicts the minimisation of D-041 |
| **DD-J08** A fail-closed per-e-mail limit `emailSubjectLimit(prefix, email, { points, duration })` is added to `foundation/lib/sessionless-limits.ts` beside the existing `linkRequestEmailLimit`, `hashKeyPart` and `normalizeEmail` (which fail open); the facility request limit (`facilities/lib/requests.ts` `requestEmailLimit`) is switched to it | two consumers (REQ-F16); one fail-closed implementation next to the other sessionless limits | a third copy | duplicated security code |
| **DD-J09** A confirmed application to a group that is full on the confirmation day goes straight to `waiting`; an application with "choose for us" never does (it goes to `new`). Every entry into a group's waiting list sets `waiting_since`; the number is computed, never stored: the rank by `waiting_since` (ties by id) among the group's `waiting` applications (Q-J04) | D-041 §4 says it goes on the waiting list in order; ranking by entry time means a number already e-mailed never goes up, and nothing is renumbered when someone withdraws | a stored position; ranking by `confirmed_at` | a stored position races; `confirmed_at` lets a later wait-listed application jump ahead |
| **DD-J10** Accepting runs one command `enrolment.applications.accept` that calls the existing commands — `people.persons.create` (child, guardian) or reuse, `people.guardianships.create`, `groups.memberships.create` — as nested commands sharing `transactionalEm` in one database transaction, the pattern of the people import's `nestedContext` (`people/commands/imports.ts`). As in the import, the nested context sets `bulkImport: { skipEvents: true, skipReindex: true }`, and `accept` collects what was written and emits the owners' events (`people.person.created`, `people.guardianship.created`, `groups.membership.created`) and the reindex in its own `afterCommit`. Only after commit it runs `people.persons.create_account` for the guardian or the adult. `accept` is **not undoable**: a mistake is corrected with the roster's End/Remove and the person screens | reuses the validation and audit of the owning modules; no cross-module ORM write; the events that role sync, activities and search rely on still fire | a direct insert into `people_persons` and `groups_memberships` | bypasses the owners' invariants (overlap, primary payer, chains) |
| **DD-J10a** The limit is checked under a lock: `accept` first locks the target group row (`groups.applicationTargets(…, { lockGroupId, em })` takes the same row lock `groups.memberships.create` takes) and re-counts `occupied` inside the transaction before the nested membership insert; two concurrent accepts into the last place serialise and the second gets 409 `group_full` unless it carried `overLimit`. The limit binds applications only: a manual roster add is not blocked, and the roster shows "19 / 18" | no double booking of the last place | counting outside the transaction | two coordinators could both take the last place |
| **DD-J11** Possible duplicates are computed by a `people` service `people.duplicateCandidates(scope, { firstName, lastName, birthDate?, email?, phone? })` → `[{ personId, reason: 'name_birth_date' \| 'email' \| 'phone', isMinor }]`. Names, e-mail and phone are encrypted without a hash, so it filters by the plain `birth_date` in SQL (child) and decrypts in memory; for a guardian it reads the club's live adult persons with a non-null e-mail or phone and compares decrypted, normalised values (≤ ~2,000 per club). It runs once after confirmation (post-commit) and again when the coordinator opens the accept sheet; the result is stored on the application as scalar ids (Q-J05) | no new hash column or migration in `people`; the cost is paid once per application, not per list view | an `email_hash` column on `people_persons` | a migration and a backfill of every club's persons for one feature; can be added later if the decrypt cost shows |
| **DD-J12** Trial participants live in `enrolment` (`trial_occurrence_id`, `trial_outcome` on the application). `activities` adds one injection spot `vereino:club:occurrence:attendance:extra` on `/club/occurrences/[id]/attendance` and `enrolment` fills it with a "Trial participants" card where the coach marks present or absent. Session facts come from the existing `activities.occurrenceFacts` (DD-O07a: `occurrences(ids)`, `activities(ids)`, `upcomingSessions(scope, activityId, from)`), which gains one additive method `upcomingSessionsOfGroup(scope, groupId, from, limit)` for the trial-session picker (Ask First, phase 4). Coach reads of a trial participant go through `auditedRead` | no change to `activities_attendances`, its uniqueness or its reports; the attendance list, the coach units report (it counts sessions, not participants) and the PZPN attendance export stay as they are; no person or membership exists, so `payments` charges nothing | an attendance row with a null person id | changes a core table, every attendance query and its unique index for a guest who is not a person yet |
| **DD-J13** Notifications to staff are in-app notification types plus e-mail through `foundationDispatch`; e-mails to the applicant use `addresses` (bare e-mail) with idempotency keys `enrolment:<applicationId>:<event>` | the facility request pattern; one dispatch per decision even on retry | sending mail from the command | a rolled-back command must not send mail |
| **DD-J14** Recurring work is one club job `enrolment:daily` (`declareClubJobs`, `dailyAt: '06:30'`): delete unconfirmed applications older than 24 hours, anonymise applications closed more than 30 days ago, close waiting applications whose season ended, notify coordinators of freed places, and count overdue applications for the dashboard; plus `enrolment:expire-unconfirmed` every 60 minutes for the 24-hour rule | one job per module keeps the E22 sweep load low; the hourly job keeps the 24-hour promise within an hour | a job per rule | five schedules per club for one module |
| **DD-J15** A freed place is detected (a) by a subscriber of `groups.membership.updated` and `groups.membership.deleted` for a participant membership of a group with waiting applications, and (b) by the daily job, which re-counts `occupied` on today for **every** group with waiting applications — this also catches end dates that passed and places freed by a season rollover, which soft-deletes memberships without `groups.membership.*` events (`groups/commands/season-rollover.ts`). The notice is idempotent per `(groupId, day)` | an end date in the future frees the place only on that day; the event alone would notify too early or miss a rollover | polling only | a place freed by a deletion would wait a day |
| **DD-J15a** Season rollover: an `enrolment` subscriber of `groups.season.rolled_over` moves open applications of a closed group to the group that continues it when the payload names one, and otherwise moves them back to `new` with the flag "group closed" and a notice to the coordinators; waiting numbers follow `waiting_since`, so a moved application keeps its place | rollover closes and creates groups (`closedGroupIds`, `createdGroups`) | leaving applications on a closed group | they would never be decided or would be mass-expired |
| **DD-J16** Coordinator screens are member pages under `/club/applications` (Tailwind, `MemberShell`, 375 px), and the administrator also gets `/backend/enrolment/applications` (`DataTable`) for desk work and sections without a coordinator | D-029 phone first; the administrator works at a desk | backend only | coordinators work on the phone |

## Domain Vocabulary and Business Rules

| Term / invariant | Precise meaning or rule | Source of truth | Failure behavior |
|---|---|---|---|
| Application | one request to join one section, for one participant (a child, or the applying adult), with one chosen group or "choose for us" | `enrolment_applications` | — |
| Applicant | the person who fills in the form: a guardian applying for a child (`kind = child`), or an adult applying for themself (`kind = adult`) | `enrolment_applications.kind` | — |
| State | `unconfirmed` → `new` → `trial` → `waiting` → closed (`accepted`, `rejected`, `withdrawn`, `expired`). Allowed moves: `unconfirmed→new` (confirm), `unconfirmed→waiting` (confirm, a chosen group that is full; never with "choose for us", DD-J09); `new\|trial\|waiting → accepted\|rejected\|withdrawn`; `new\|waiting → trial`; `trial → trial` (a new session once the previous one is over or cancelled, Q-J07); `new\|trial → waiting` (also `waiting → waiting` with another group, which resets `waiting_since`); `trial → new` (session cancelled); `new\|trial\|waiting → expired` (the season of the reference date ended). A withdrawal or decision while in `trial` removes the child from the session's trial card | `enrolment/lib/states.ts` (pure, unit-tested) | other moves → 409 `application_state_conflict` |
| Reference date | DD-J03; club setting `applicationAgeReferenceDay` (`MM-DD`, default `09-01`) | `enrolment/lib/age.ts` + `@vereino/core` | an invalid stored value falls back to `09-01` and logs |
| Age fit | `fits`, `outside`, or `unknown` (group has no range, or "choose for us") per DD-J03/DD-J04, computed at submission and re-computed when the chosen group changes | `enrolment_applications.age_fit` | — |
| BR-J1 Fields | per kind: **`child`** — participant (the child) first and last name and birth date, plus the contact (the guardian) first and last name, e-mail and phone and the guardian statement; on accept the child and the guardian become persons with a guardianship, the guardian is the primary payer (BR-J6) and receives the invitation. **`adult`** — participant first and last name, birth date, e-mail and phone; the `guardian_*` name columns stay empty, there is no statement and no guardianship, and the adult becomes the person who receives the invitation. Rules: names 1–100 each, birth date required, e-mail (RFC 5322, ≤ 254), phone (E.164 after normalising Polish numbers, required); the guardian statement "I am a parent or legal guardian of the child" (`kind = child`, required true); `wantsTrial` (default true); `experience` (`none`, `under_year`, `year_or_more`; optional); `note` (≤ 500); `rulesAccepted` (required true; the club's `rules_url` is linked); `privacyAcknowledged` (required true; the club's information text); `groupId` or `chooseForUs = true`; honeypot `website` (must be empty) | `enrolment/data/validators.ts` | 422 with field errors; honeypot filled → 422 `application_refused` before any read |
| BR-J2 Age limits | birth date not in the future; `kind = child` → 3 ≤ age ≤ 17 on the reference date; `kind = adult` → age ≥ 18 on the reference date and today | validators + command | 422 `birth_date_future`, `age_out_of_bounds` |
| BR-J3 Duplicate application | one open application (state `unconfirmed` … `waiting`) per section and participant, where the participant is identified by the normalised e-mail hash of the applicant plus the participant's normalised name and birth date | partial unique index on `(organization_id, section_id, applicant_key)` where open; `applicant_key` = HMAC of the normalised e-mail, names and birth date | the form answers as on success (202) and creates no second row: an `unconfirmed` match gets a new confirmation link (DD-J06), a confirmed open match gets a new status link (DD-J07), so the form does not reveal who applied |
| Places | a group's `places_limit` (null = no limit) compared with `occupied` = participant memberships active on the day (DD-J05) | `groups_groups.places_limit` | — |
| BR-J4 Group full | `occupied ≥ places_limit` on the start day (for accept) or on the confirmation day (for DD-J09) | `groups.applicationTargets` | accept → 409 `group_full` unless `overLimit: true` was confirmed |
| Waiting number | 1 + the number of the group's `waiting` applications with an earlier `waiting_since` (ties by id) | computed | — |
| Accepts applications | the section's `accepts_applications` and the group's `accepts_applications`, both true, and the group public and active | `club_core_sections`, `groups_groups` | form route 404 `applications_closed` for the section; a group that does not accept is not offered |
| Answer time | an application is overdue when it is `new` (or `trial` with the session over) and `now − confirmed_at > applicationAnswerDays` days | club setting `applicationAnswerDays` (1–60, default 7) | shown on the dashboard and as a flag; nothing closes automatically |
| BR-J5 Who decides | the coordinators of the application's section on the decision day (`people_role_assignments` role `coordinator`, `section_id`), and the club administrators always | `enrolment` command with `section-role-holders` via `people` | another coordinator → 404 (not 403, D-034 style) |
| BR-J6 Accept | needs a target group of the section (the chosen one or another), a start day (today or later, within the group's season if it has one), the child and guardian decisions (create, or reuse a candidate person), and `overLimit` when the group is full. The guardian becomes the primary payer when the child has no open primary payer | `enrolment.applications.accept` | 409 `group_full`, 409 `membership_overlap` (from `groups`), 409 `guardianship_duplicate` (from `people`), 422 `start_day_invalid` |
| Trial | at most one proposed trial session per application at a time; the session must be of the target group, `planned`, and start in the future; outcome `present`, `absent` or null | `enrolment_applications.trial_*` | 422 `trial_session_invalid`; a cancelled session moves the application back to `new` with a notice |
| Reject reason | 1–500 characters, shown to the applicant in the e-mail and on the status page | `decision_reason` | 422 |
| Anonymised application | cleared: every encrypted column, `participant_birth_date` (replaced by its year), `applicant_key`, `email_key`, `duplicate_candidates`, `locale`, and the `accepted_*_person_id` links; kept for statistics: state, dates, section, group, kind, age fit, trial outcome, `accepted_membership_id`, `rules_accepted_at`, `privacy_acknowledged_at` and the text version; the confirmation and status links are deleted | `enrolment_applications.anonymized_at` | — |

## Users, Permissions, and Scope

| Actor | Allowed outcomes | Scope rule | Required feature IDs |
|---|---|---|---|
| Applicant (no account) | apply, confirm, see the state, withdraw, ask for a new status link | the club and section from the public slugs (D-024/D-026 lookup in `clubCorePublicSite`); the application from the token (DD-J07) | none (public, rate-limited) |
| Section coordinator | list, read, decide applications of own sections; propose trial sessions; see flags and duplicates | own sections on the day (BR-J5) | `enrolment.applications.view`, `enrolment.applications.decide` |
| Coach / assistant | see trial participants of own sessions and mark presence | sessions of groups they coach (`activities.occurrenceFacts` + their coach grant) | `enrolment.trials.mark` |
| Club administrator | everything a coordinator can, for every section; the settings; the dashboard widget | the club | `enrolment.manage` (implies view and decide), `club_core.manage` for settings |
| Instance operator | answer a data subject request of an applicant by e-mail through a CLI | one club, given on the command line | shell only |

Scope is derived on the server: member routes use the signed-in user's tenant and organization and the coordinator's
section grants; public routes get the tenant and organization only from `clubCorePublicSite` (slug) or from the
application link lookup (DD-J07), never from the payload. The new features are seeded in `packages/core/src/roles.ts`
(coordinator: view, decide; coach: trials.mark; club_admin: manage).

## Reuse and Ownership Map

| Capability | Reuse / extend / app-own | Existing module or new module | Integration seam | Why |
|---|---|---|---|---|
| Applications, public routes, coordinator screens, trial participants, e-mails, retention | app-owned | `enrolment` (new, Q-J01) | commands, `makeCrudRoute` for the back office, member pages | DD-J01 |
| Group limit and switch; occupancy and fit rule | extend | `groups` | columns on `groups_groups`; new optional DI `groups.applicationTargets` (DD-J05); group form fields | the group is the source of truth |
| Section switch, club settings, information text, the "Apply" button | extend | `club_core` | `club_core_sections.accepts_applications`; `ClubSettings` keys including the information text `applicationInformation` (its own column, not a consent text); injection spot `vereino:public:section:actions` on P-02 filled by `enrolment` | the public page and settings live there |
| Age-fit rule | move | `@vereino/core` | pure functions (DD-J04) | two consumers |
| E-mail rate limit | move | `foundation` | `emailSubjectLimit` (DD-J08) | two consumers |
| Tokens, dispatch, e-mail templates, club jobs | reuse | `foundation` | `createTokenLinkService`, `foundationDispatch`, `defineEmailTemplate`, `declareClubJobs`, `enforceSessionlessLimits`, `tokenLimit` | the REQ-024 pattern |
| Persons, guardianships, accounts, duplicates | reuse + one new read | `people` | commands `people.persons.create`, `people.guardianships.create`, `people.persons.create_account`; new optional DI `people.duplicateCandidates` (DD-J11) | owners keep their invariants |
| Membership | reuse | `groups` | command `groups.memberships.create` | overlap rules |
| Session facts and the attendance page | reuse + one spot | `activities` | `activities.occurrenceFacts`; new spot `vereino:club:occurrence:attendance:extra` (DD-J12) | no change to attendance data |
| Today tile, dashboard | reuse | `people` Today page, platform `dashboards` | spot `vereino:club:today:sections`; a dashboard widget in `enrolment/widgets/dashboard/overdue-applications` | existing seams |
| Fees | reuse | `payments` | none — generation already charges the roster (Q-J06) | no new contract |
| Export, erasure, offboarding | contribute | `people`, `club_core`/`foundation` | `people.dataExport.enrolment`, `people.departure.enrolment` (both allow-lists in `people/services/{data-export,departure}.ts` gain `enrolment`), `registerClubDataContributor(container, 'enrolment', tables)` | existing contracts |

## Architecture and Data Flow

```text
parent phone ─► /p/<club>/sections/<section> (club_core P-02) ─► "Apply" (spot filled by enrolment)
            ─► /p/<club>/sections/<section>/apply (enrolment, 3 steps; fit hint in the browser via @vereino/core)
            ─► POST /api/enrolment/public/<club>/sections/<section>/applications
                  └─ clubCorePublicSite.sectionPage (slug lookup) → groups.applicationTargets → validate → row `unconfirmed`
                  └─ foundationDispatch: confirmation e-mail (token secret) — post-commit
            ─► e-mail link /p/<club>/applications/confirm/<token> ─► POST …/public/<club>/applications/confirm {token}
                  └─ club from the slug, link looked up within that club's scope (DD-J06)
                  └─ redeem token → `new` | `waiting` (DD-J09) → status link issued → e-mails (applicant, coordinators)
                  └─ post-commit: people.duplicateCandidates → flags stored
coordinator phone ─► /club (Today tile) ─► /club/applications (tabs) ─► /club/applications/[id]
            ─► decide: reject | waiting | trial (activities.occurrenceFacts) | accept
                  accept ─► command bus: people.persons.create ×≤2 | reuse, people.guardianships.create,
                            groups.memberships.create (one transaction) ─► post-commit people.persons.create_account
coach phone ─► /club/occurrences/[id]/attendance ─► spot card "Trial participants" (enrolment) ─► mark present/absent
applicant ─► /p/<club>/applications/status/<token> ─► state, withdraw (application link lookup, DD-J07)
club job enrolment:daily / enrolment:expire-unconfirmed ─► retention, season end, freed places, overdue count
groups.membership.updated|deleted ─► enrolment subscriber ─► freed-place notice (DD-J15)
```

- **Module boundaries:** `enrolment` owns the application; it never writes another module's table and reads them only
  through DI contracts (`groups.applicationTargets`, `people.duplicateCandidates`, `activities.occurrenceFacts`,
  `clubCorePublicSite`, `clubCoreSettings`). Persons and memberships exist only after acceptance and belong to their
  modules.
- **Extension points:** two new injection spots — `vereino:public:section:actions` on P-02 (`club_core`) and
  `vereino:club:occurrence:attendance:extra` on the attendance page (`activities`); the existing
  `vereino:club:today:sections`; a dashboard widget; group and section form fields through the owning modules' forms.
  The public section page is a `/p/**` route: phase 2 checks that `resolveClientBootstrapProfile`
  (`components/ClientBootstrap.tsx`) loads the `injection` group there, or renders the button server-side through
  `club_core`'s public block provider pattern instead (lesson `club-routes-need-the-member-bootstrap-profile`).
- **Alternatives considered:** a Google-form-like generic form builder (rejected: no age logic, no decisions, no data
  model); putting everything in `groups` (DD-J01).
- **Compatibility:** additive columns, settings keys, routes, DI contracts, spots and events. `groups/lib` keeps
  re-exporting the moved fit functions; `facilities` keeps its behaviour with the moved e-mail limit.

## User Journeys

### Journey J-J01 — A parent applies

Anna opens the club's football section page on her phone and taps "Zgłoś dziecko". Step 1: "For my child", Ola, born
2017-03-14. Step 2 shows "Matching groups" first: U9 (born 2017–2018, by birth year) and Żaki 7–9 (age 9 on
2026-09-01); "All groups" below, and "Choose a group for us". She picks U9, keeps "I would like a trial session first"
on. Step 3: her name, e-mail, phone, the statement, the club rules and the information text. She sends; the page says
"Check your e-mail within an hour". She opens the link, the page says "Application sent — we will answer within 7
days", and an e-mail brings her the status link.

### Journey J-J02 — A parent picks a group outside the age range

Marek's son is 12 and his friend trains in U11. Marek opens "All groups", taps U11, sees "Your child is outside this
group's age range (born 2016–2017). The coordinator will decide." and continues. The coordinator sees "Outside the age
range".

### Journey J-J03 — The coordinator decides on the phone

Kacper (coordinator) sees "3 new applications" on Today. He opens New: Ola U9 with "wants a trial". He proposes
Thursday's 17:00 session; Anna gets an e-mail with the date and place. On Thursday the coach sees Ola under "Trial
participants" on the attendance list and marks her present. On Friday Kacper opens Ola's application (Trial tab, "session
over — decide"), taps Accept, start day 1 December, the guardian Anna is new, Ola is new, no duplicate; he confirms.
Ola is in U9 from 1 December, Anna gets the acceptance e-mail and the account invitation.

### Journey J-J04 — Waiting list and a freed place

U9 is full (18 of 18). Two applications confirmed this week go straight to the U9 waiting list as numbers 1 and 2;
the parents are told their number. In January a participant's membership ends; Kacper gets "A place is free in U9 —
first on the waiting list: Jan K." and accepts him. Number 2 becomes number 1 without anyone renumbering.

### Journey J-J05 — A possible duplicate

Ewa applies for her second child; she is already a guardian in the club. The application shows "Possible duplicate:
guardian Ewa N. (same e-mail)". On accept Kacper chooses "Use existing person" for the guardian, so no second Ewa is
created and the new child gets the family relation to the existing person.

### Journey J-J06 — Withdraw

Anna's daughter chose another sport. Anna opens the status link and taps "Withdraw application"; the coordinator's list
moves it to Closed (withdrawn) and Anna gets a confirmation.

### Journey J-J07 — The administrator catches up

Section "Chess" has no coordinator. Its applications reach the administrators. The dashboard widget "Applications past
the answer time: 2" links to the back-office list filtered to overdue.

## UI and Interaction Contracts

### UI architecture

Public and member pages are Tailwind with Open Mercato tokens at 375 px first (D-029); the back office uses
`DataTable`/`CrudForm`. Every page covers loading, empty, error, conflict (409 with the version), keyboard and a11y, in
`en` and `pl`, light and dark. Flags use status variants (`StatusBadge`/`Tag` warning, info, error — never the `brand`
variant) and always carry text. All texts come from `enrolment/i18n/{en,pl}.json`.

### P-J1 the "Apply" button on `/p/[clubSlug]/sections/[sectionSlug]` (`club_core` page, `enrolment` widget)

A primary button "Zgłoś dziecko" / "Apply" in the section's header and after the groups list, shown when REQ-J03
holds; under it one line "Applications are answered within {n} days". Hidden otherwise (no disabled button).

### P-J2 `/p/[clubSlug]/sections/[sectionSlug]/apply` (`enrolment`)

```
[Club logo] Football — application                    Step 1 of 3
( ) For my child   ( ) For myself (18+)
Child's first name [      ]  Last name [      ]
Birth date [dd.mm.yyyy]                         → age on 1 Sep 2026: 9
                                   [Next]
Step 2 — Group
Matching groups                     All groups ▾
(•) U9 · born 2017–2018            ( ) U11 · born 2015–2016  ⚠ outside the age range
( ) Żaki · 7–9 years · full — waiting list
( ) Choose a group for us
[x] I would like a trial session first
Experience [none ▾]   Note (max 500) [ ]  "Do not write health information."
Step 3 — Contact
Your first/last name, e-mail, phone, [x] I am a parent or legal guardian
[x] I accept the club rules (link)   [x] I have read the information on data processing (expand)
                                   [Send application]
```

Data: `GET /api/enrolment/public/[clubSlug]/sections/[sectionSlug]/form` (groups with fit rule, full flag, reference
date, information text, rules URL). Steps keep their state when going back. The fit hint is computed in the browser
(DD-J04) and re-checked by the server. A full group shows "full — waiting list" (Q-J04). The honeypot is a visually
hidden, `aria-hidden`, `tabindex=-1` input named `website`. After sending: "Check your e-mail — the link is valid for
one hour" with "Send again" (rate-limited). States: loading, `applications_closed` (404 page with the section link),
field errors on the step that holds them, 429 with the wait time, network error with retry.

### P-J3 `/p/[clubSlug]/applications/confirm/[token]` (`enrolment`)

Server-rendered page that posts the token from the page (the GET never spends it: a button "Confirm my application",
so mail scanners that open links do not confirm). Results: confirmed (with "We will answer within {n} days" and, when
waiting, "You are number {k} on the waiting list"), used (410, "already confirmed — see the e-mail with your status
link"), expired (410, "the link expired — apply again").

### P-J4 `/p/[clubSlug]/applications/status/[token]` (`enrolment`)

The state in words, the section, the group, the waiting number, the proposed trial session (date, time, place), the
reject reason, the decision date; "Withdraw application" with a confirmation dialog while open; "Send me a new link"
form on the expired-link page (e-mail field, uniform 202 answer).

### M-J1 Today tile (`vereino:club:today:sections`, `enrolment` widget)

For a coordinator or administrator with open applications: "Applications: 3 new · 1 after a trial · 2 overdue" →
`/club/applications`. Hidden when there is nothing open.

### M-J2 `/club/applications` (`enrolment`)

Tabs New (`new`, and `trial` whose session is over), Trial session (`trial` with a future session), Waiting list
(`waiting`, grouped by group with numbers), Closed (last 30 days). Section filter when the user coordinates several.
Rows: participant name, age on the reference date, chosen group or "choose for us", confirmed date, flags (`outside the
age range`, `group full`, `wants a trial`, `possible duplicate`, `overdue`). Empty state per tab.

### M-J3 `/club/applications/[id]` (`enrolment`)

The data of BR-J1 (the note behind a "show" toggle), the flags, the age with the reference date, the duplicate
candidates with links to their persons, the history (decisions with dates). A sticky action bar: **Accept**,
**Trial session**, **Waiting list**, **Reject**.
- Accept sheet: group (the chosen one preselected; the section's groups with "x / limit" and fit), start day (default
  the next session day of the group, at least today), child: "New person" or a candidate, guardian: "New person" or a
  candidate, the fee line of the target group (Q-J06), and "Send the account invitation" (on; off when the guardian
  already has an account). A full group shows a warning and "Accept beyond the limit" must be ticked.
- Trial sheet: the group's next 10 planned sessions (date, time, place) from `activities`.
- Reject sheet: reason (required, shown to the applicant).
Each action sends `updatedAt`; 409 "changed by someone else — reload".

### M-J4 trial card on `/club/occurrences/[id]/attendance` (spot `vereino:club:occurrence:attendance:extra`)

"Trial participants" with name, age and the guardian's phone (tap to call), and present/absent toggles; hidden when the
session has none.

### B-J1 `/backend/enrolment/applications` (`enrolment`)

`DataTable` with the same columns and filters as M-J2 plus `overdue` and section; row click opens the M-J3 content in
the back-office shell. Dashboard widget **Applications past the answer time** (count + link).

### B-J2 settings (`club_core`, `groups`)

- `/backend/club/settings`: "Age reference day" (day and month), "Answer time (days)", and in the consent texts the new
  "Information for applicants" text (≤ 6000, Markdown-light: paragraphs and lists; empty = the built-in default text
  of Q-J09 with the club's name, contact and `privacy_policy_url` filled in). It is not a consent text: the consent
  texts (`club_core/lib/consent-texts.ts`) are a closed list with a 1000-character limit and "given to an earlier
  wording" semantics, which an Art. 13 information notice does not have.
- Section form `/backend/club/sections/[id]/edit`, group "Public page": "Accepts online applications".
- Group form `/backend/groups/groups/[id]`, group "Public page": "Limit of places" (empty = no limit) and "Accepts
  applications"; the coordinator's roster shows "18 / 18".

## Data Models

### `enrolment_applications` (new, club tenant)

`id`, `tenant_id`, `organization_id`, `section_id`, `group_id?` (null = choose for us), `kind` (`child`, `adult`),
`state`, encrypted (`enrolment/encryption.ts`): `participant_first_name`, `participant_last_name`,
`guardian_first_name`, `guardian_last_name`, `guardian_email`, `guardian_phone`, `note`, `decision_reason`; plain:
`participant_birth_date` (date), `applicant_key` (BR-J3), `email_key` (both keyed hashes with the club's tenant key,
the mechanism of `people_persons.pesel_hash`, never a plain SHA-256 of an address; `email_key` serves the operator's
data subject lookup), `waiting_since?`, `wants_trial`, `experience?`, `age_fit`, `reference_date`,
`locale`, `rules_accepted_at`, `privacy_acknowledged_at`, `information_text_changed_at` (version of the text shown),
`confirmed_at?`, `trial_occurrence_id?`, `trial_outcome?`,
`decided_at?`, `decided_by_user_id?`, `closed_at?`, `duplicate_candidates jsonb?` (`[{ personId, role, reason }]`),
`accepted_child_person_id?`, `accepted_guardian_person_id?`, `accepted_membership_id?`, `anonymized_at?`,
`created_at`, `updated_at`. Indexes: `(organization_id, state, section_id, confirmed_at)`, `(organization_id,
group_id, state, waiting_since)`, partial unique BR-J3.

### `enrolment_confirmation_links` and `enrolment_application_links` (new, club tenant)

`id`, scope, `application_id`, `tokenLinkColumns`, `created_at` — DD-J06 (single use, 1 hour) and DD-J07 (until
expiry; `expires_at` moved to closing + 30 days when the application closes). Both purged by the daily job with
`purgeDead` 30 days after expiry; both deleted when the application is anonymised or deleted.

### `groups_groups` (changed)

`places_limit smallint null` (1–500), `accepts_applications boolean not null default true`.

### `club_core_sections` (changed)

`accepts_applications boolean not null default false`.

### `club_core_club_settings` (changed)

`application_age_reference_day text not null default '09-01'`, `application_answer_days smallint not null default 7`,
`application_information text null` (≤ 6000; null = built-in default text).

No other table changes; `activities` and `people` get no migration.

## API, Command, and Error Contracts

| Route / command | Method | Feature | Notes |
|---|---|---|---|
| `/api/enrolment/public/[clubSlug]/sections/[sectionSlug]/form` | GET | public | groups (public, active, accepting) with `fitRule`, `full`, labels; reference date; texts; 404 `applications_closed`; `no-store`; per-IP 60/min |
| `/api/enrolment/public/[clubSlug]/sections/[sectionSlug]/applications` → `enrolment.applications.submit` | POST | public | BR-J1/BR-J2; 202 `{ status: 'pending_confirmation' }` always on accepted input (also for BR-J3); per-IP 10/600 s; per e-mail 5/h fail-closed (DD-J08) |
| `/api/enrolment/public/[clubSlug]/applications/confirm` → `enrolment.applications.confirm` | POST | public | `{ token }`; lookup within the slug's club only; 200 `{ state, waitingNumber? }`; 410 `token_link_used` / `token_link_expired` (also for another club's token); per-IP 30/600 s, per-token `tokenLimit` write |
| `/api/enrolment/public/[clubSlug]/applications/resend-confirmation` | POST | public | `{ email }`; uniform 202; new confirmation link for the address's `unconfirmed` applications in that club (DD-J06); `emailSubjectLimit` 3/h |
| `/api/enrolment/public/[clubSlug]/applications/status` | POST | public | `{ token }` (body, not path); scoped lookup; 200 state view; 410 expired or unknown; `tokenLimit` read |
| `/api/enrolment/public/[clubSlug]/applications/withdraw` → `enrolment.applications.withdraw` | POST | public | `{ token }`; scoped lookup; 200; 409 `application_state_conflict` when closed |
| `/api/enrolment/public/[clubSlug]/applications/resend-link` | POST | public | `{ email }`; uniform 202; reissues the status links of the address's open applications in that club; per e-mail 3/h (`linkRequestEmailLimit`) |
| `/api/enrolment/applications` (`makeCrudRoute`, read only) | GET | `enrolment.applications.view` | `tab`, `sectionId`, `groupId`, `overdue`, `q` (names are encrypted without a hash, so `q` filters in memory over the already scoped open applications of the caller's sections, ≤ a few hundred; Closed is not searchable); `{ items, total, page, pageSize, totalPages }`; scope BR-J5 |
| `/api/enrolment/applications/[id]` | GET | view | decrypted detail, flags, candidates (refreshed, DD-J11), history; reads by a coordinator go through `auditedRead` (purpose `enrolment.decide`) |
| `/api/enrolment/applications/[id]/reject` → `enrolment.applications.reject` | POST | decide | `{ reason, updatedAt }` |
| `/api/enrolment/applications/[id]/waiting` → `enrolment.applications.wait` | POST | decide | `{ groupId, updatedAt }` |
| `/api/enrolment/applications/[id]/trial` → `enrolment.applications.propose_trial` | POST/DELETE | decide | `{ occurrenceId, updatedAt }`; 422 `trial_session_invalid` |
| `/api/enrolment/applications/[id]/trial-sessions` | GET | decide | next 10 planned sessions of the target group |
| `/api/enrolment/applications/[id]/accept` → `enrolment.applications.accept` | POST | decide | `{ groupId, startDay, child: { personId? }, guardian: { personId? }, overLimit?, sendInvitation, updatedAt }`; 409 `group_full`, `membership_overlap`, `guardianship_duplicate`; 422 `start_day_invalid` |
| `/api/enrolment/trials?occurrenceId=` | GET | `enrolment.trials.mark` | trial participants of a session the caller coaches |
| `/api/enrolment/trials/[applicationId]` → `enrolment.trials.mark` | PUT | `enrolment.trials.mark` | `{ outcome: present \| absent \| null }` |
| `/api/enrolment/overdue` | GET | `enrolment.manage` | count for the dashboard widget |
| `groups.applicationTargets` (DI) | — | — | DD-J05 |
| `people.duplicateCandidates` (DI) | — | — | DD-J11 |
| `yarn mercato enrolment applicant-data --tenant --org --email [--erase]` | CLI | shell | prints (or erases) an applicant's applications by `email_key`, for data subject requests of non-members; `--erase` also erases the address's dispatch deliveries by the delivery e-mail hash (a small `foundation` helper beside `eraseRecipientDeliveries`, which erases by person id only) |

`reject`, `wait` and `propose_trial` are undoable (they restore the previous state; e-mails already sent stay sent).
`submit`, `confirm`, `withdraw` and `accept` are not undoable (DD-J10) (`replayable: false` in the audit log so the encrypted input never lands in `action_logs`, as facility requests).
Error codes are declared in `enrolment/lib/error-codes.ts`. Every route declares per-method `metadata` and `openApi` and
has probes in `.ai/qa/tests/_fixtures/isolation/inventory/enrolment.json`: public routes with `"probe": "public"` and a
`$B:` reference (club A's slug with club B's section slug → 404; club B's token → 410 like any unknown token), member
routes with `foreign-id` probes (club B's application id → 404).

## Events, Jobs, Notifications, and Cross-Module Flows

- Events (payload ids and state only, never names): `enrolment.application.confirmed`, `.decided` (`decision`:
  `accepted`, `rejected`, `waiting`, `trial`), `.withdrawn`, `.expired`.
- Notification types (in-app, staff): `enrolment.application_new` (coordinators of the section, else administrators),
  `enrolment.place_freed` (same recipients; "A place is free in {group}" with a link to the waiting list, where the
  first name is shown — stored notification bodies carry group names and application ids only, never an applicant's
  name, so nothing outlives the 30-day anonymisation),
  `enrolment.trial_session_cancelled`.
- E-mail templates (`defineEmailTemplate`, en and pl, `optOut: 'never'` because they are transactional for a
  non-member): `enrolment.confirm_email` (link, 1 hour), `enrolment.received` (status link, answer time),
  `enrolment.waiting` (number), `enrolment.trial_proposed` (date, time, place, what to bring = the group's public
  conditions), `enrolment.accepted` (group, start day, what happens next; the invitation comes separately),
  `enrolment.rejected` (reason), `enrolment.withdrawn`, `enrolment.season_closed`, `enrolment.new_link`.
- `groups.membership.updated|deleted` → `enrolment` subscriber → freed-place notice (DD-J15).
- `activities.occurrence.cancelled` → `enrolment` subscriber → applications with that trial session go back to `new`,
  coordinator notified, applicant e-mailed.
- Club jobs (DD-J14): `enrolment:expire-unconfirmed` every 60 minutes; `enrolment:daily` at 06:30 club time. Season end:
  a `new`, `trial` or `waiting` application whose reference date's season (`seasonEndsOn` from
  `groups.applicationTargets`, the season containing the reference date) ended before today becomes `expired` and the
  applicant gets `enrolment.season_closed` with the link to apply again. Without a season row, applications do not
  expire by season.
- `groups.season.rolled_over` → `enrolment` subscriber (DD-J15a).
- Data export: `people.dataExport.enrolment` returns the applications whose `accepted_*_person_id` is the person (until
  they are anonymised). Erasure: `people.departure.enrolment` `erase` anonymises them.
- Club offboarding: `registerClubDataContributor(container, 'enrolment', ['enrolment_applications',
  'enrolment_application_links'])`.

## Security, Privacy, and Compliance

- **Legal basis.** Art. 6(1)(b) GDPR — steps taken at the request of the data subject (or the child's parent acting for
  the child) before entering into a membership contract (D-041 §6). ⚠ The lawyer confirms the basis and the
  information text with the D-035 items before the production release of phase 2 (Q-J09).
- **Minimisation.** Exactly the fields of BR-J1. No address, PESEL, school, health data or documents. The note shows
  "Do not write health information" and is cleared on acceptance (the coordinator copies what matters into the person
  notes by hand, which the people module encrypts).
- **Encryption.** Names, contact data, note and reject reason are encrypted with the club's tenant key; the birth date
  stays plain as on `people_persons`. `applicant_key` and `email_key` are keyed one-way hashes (still pseudonymous data, cleared on anonymisation).
- **Retention (`docs/compliance/retention.md`):** R22 unconfirmed applications deleted 24 hours after creation
  (`enrolment:expire-unconfirmed`); R23 closed applications (accepted, rejected, withdrawn, expired) anonymised 30 days
  after closing; R24 waiting applications closed at the end of their season and then anonymised by R23; status links
  purged 30 days after closing (R9 pattern).
- **Compliance pack, changed in phase 2:** `ropa.md` activity A17 "Applications to a section" (purpose, Art. 6(1)(b),
  data subjects: applicants and children who are not members, categories as BR-J1, recipients: the section's
  coordinators and the club administrators, and — for a trial session only — the coaches of that session (name, age,
  the guardian's phone; reads logged through `auditedRead`), retention R22–R24); `dpia.md` risk D-15 (non-members' children's data
  submitted by strangers; a mistyped e-mail sends a status link to someone else; spam) with measures (confirmation
  link, minimal data, rate limits, encryption, no data on the status page beyond the application, retention);
  `data-subject-requests.md` names the applicant CLI; `legal-verification.md` gains the lawyer item of Q-J09.
- **Sessionless routes.** Tokens are 256-bit, stored as hashes, compared in constant time; confirmation tokens are
  one-time; status links expire. GET pages never spend or change anything. The status page shows no other
  application and no person of the club. The form never reveals whether an e-mail or child is already known (uniform
  202). Every token lookup runs inside the club resolved from the slug (DD-J06, DD-J07), so no new system-scope
  lookup is added beyond the existing public-slug exception of `clubCorePublicSite`.
- **Abuse.** Honeypot, per-IP and per-e-mail limits (fail-closed for e-mail), the confirmation link, 24-hour deletion.
- **Children.** A child never receives mail; only the guardian's address is used. An adult applying for themself must
  be 18 on the reference date and today.

## Integration Coverage

| Test ID | Level | Setup / fixture | Actions | Assertions | Requirement IDs |
|---|---|---|---|---|---|
| TEST-J01 | integration | club, section, two groups | set a limit and the switches; set the club's reference day, answer time and information text | values saved and shown; roster shows "x / limit"; section page has no button until both switches are on; the moved fit rule gives the same "Fits" result on the bulk move | REQ-J01, REQ-J02, REQ-J03 |
| TEST-J02 | integration (375 px, en/pl, light/dark) | public section with a U9 team (category U8–U9), an age group 7–9 and a full group | fill the form for a child born on the boundary dates; choose an outside group; choose "for us"; try a future birth date and a 2-year-old | matching groups listed first; warning on the outside group; full group marked; 422 for the hard limits; 202 on send | REQ-J04, REQ-J05, REQ-J06 |
| TEST-J03 | integration | as TEST-J02 | open the confirmation link (GET), then confirm; confirm again; confirm an expired token; fill the honeypot; send 6 times from one e-mail | GET changes nothing; first confirm → `new` (→ `waiting` with number 1 for the full group); second 410 used; "send again" issues a new link and the old one stops working; a confirm through another club's slug → 410; expired 410; honeypot 422 `application_refused`; 6th send 429; no application visible to the coordinator before confirmation | REQ-J07, REQ-J08 |
| TEST-J04 | integration | confirmed application | open the status link; withdraw; ask for a new link | state shown; withdrawn → Closed, e-mail sent; the old link stops working after a new one is issued | REQ-J09 |
| TEST-J05 | integration (375 px) | two sections, a coordinator of one, a section without a coordinator | confirm applications to both | coordinator sees only own section (other id → 404); administrator sees both; Today tile counts; tabs; flags outside / full / trial / duplicate | REQ-J10, REQ-J11, REQ-J17 |
| TEST-J06 | integration | confirmed application | reject with a reason; put another on the waiting list | applicant e-mails with the reason / number; states and history | REQ-J12 |
| TEST-J07 | integration | application by a new family; another by an existing guardian (same e-mail); a child already in the club (same name and birth date) | accept the first; accept the second reusing the guardian; accept the third reusing the child | persons, guardianship (primary payer), membership from the start day; invitation dispatched post-commit; no duplicate persons; `membership_overlap` 409 when the child is already in the group | REQ-J13 |
| TEST-J08 | integration | group with a monthly fee | accept with a start day in mid-month; run charge generation | the accept sheet names the fee and the part-month rule; the charge follows the existing generation (Q-J06) | REQ-J14 |
| TEST-J09 | integration | full group, three confirmed applications | confirm; move a `new` application to the list later; withdraw number 1; end a participant's membership today and another's tomorrow; roll the season over closing the group; run the daily job; two concurrent accepts into the last place; accept beyond the limit with and without `overLimit` | numbers 1–3, the later one appended as 4, then 1–3 after the withdrawal (never higher than e-mailed); freed-place notice once per day without the applicant's name in the stored body; rollover moves applications to the continuing group or back to `new` with "group closed"; one concurrent accept wins, the other 409 `group_full`; 409 without the flag | REQ-J15 |
| TEST-J10 | integration (375 px) | application wanting a trial, group with planned sessions, coach | propose a session; coach marks present on the attendance page; cancel another proposed session; accept after the trial | trial card on the attendance list; the regular list, the coach units report and the PZPN attendance export unchanged; no charge for the trial; cancelled → back to `new` with e-mails | REQ-J16 |
| TEST-J11 | integration | applications in every state; clock moved | run `enrolment:expire-unconfirmed` and `enrolment:daily`; export and erase an accepted person's data; run the applicant CLI | unconfirmed deleted after 24 h; closed anonymised after 30 days; waiting expired at season end with an e-mail; export contains the application; erasure anonymises it; CLI finds by e-mail | REQ-J18 |
| TEST-J12 | integration | `ISSUE-628-cross-club-isolation` with `inventory/enrolment.json` and `seed-enrolment.ts` | run | every new route passes: club B application ids → 404; token routes under club A's slug with club B's seeded application record (`$B:` reference, as `facilities.json` `requests/verify`) → 410; club A slug with club B section → 404 | REQ-J19 |

## Implementation Phases

### Phase 1 — Places and settings (E26-S02)

- **Depends on:** Ask First approvals of the three migrations.
- **Outcome / value:** clubs record group limits and see "x / limit" on the roster, and prepare the settings.
- **Deliverables:** `groups_groups.places_limit`, `accepts_applications` (migration) with form fields and the roster
  count; `groups.applicationTargets`; `club_core_sections.accepts_applications` (migration) and the form field;
  `club_core_club_settings` three columns (migration), schema keys and settings fields (B-J2); the fit rule moved to
  `@vereino/core` with unit tests at 100 %; i18n.
- **Requirements closed:** REQ-J01, REQ-J02. **Tests:** TEST-J01 (without the button check, which closes in phase 2).
- **Exit gate:** `yarn verify` green; TEST-J01 passes locally; 375 px, en/pl, light/dark.

### Phase 2 — The form, confirmation, the inbox and the waiting list (E26-S03)

- **Depends on:** phase 1; new module `enrolment` (Ask First); Q-J09 for the production release (not for building).
- **Release rule:** phase 2 cannot accept anyone, so the section field "Accepts online applications" (B-J2) stays hidden
  until phase 3 is merged; phase 2 is tested with the switch set by the test fixture. Phases 2 and 3 reach clubs
  together; each is still its own build story and PR.
- **Outcome / value:** the whole intake works end to end up to the decision: parents apply and confirm, applications
  reach the right coordinator with flags, full groups get numbered waiting lists, coordinators reject or wait-list.
- **Deliverables:** module scaffold (`src/modules.ts`, `vereino-modules.json`, ACL, role seeds),
  `enrolment_applications`, `enrolment_confirmation_links` and `enrolment_application_links` (migration), the public
  routes and pages P-J1…P-J4, the `vereino:public:section:actions` spot (or a server-side block, see *Architecture*),
  `emailSubjectLimit` in `foundation` with facilities switched to it, DD-J09 (confirm → `waiting` for a full group,
  `waiting_since`, computed numbers), e-mail templates, notification types, M-J1, M-J2, M-J3 (reject and waiting only),
  B-J1 with the dashboard widget, `people.duplicateCandidates` (flag only), `enrolment:expire-unconfirmed` and the
  retention part of `enrolment:daily`, the offboarding contributor, the compliance pack (A17, D-15, R22–R24),
  isolation inventory.
- **Requirements closed:** REQ-J03…REQ-J11, REQ-J17, REQ-J18 (retention, compliance, offboarding), REQ-J19 (its routes).
  **Tests:** TEST-J02…TEST-J05, TEST-J06 (reject and waiting), TEST-J11 (retention part), TEST-J12.
- **Exit gate:** as phase 1; the isolation guard green with two clubs.

### Phase 3 — Accepting, freed places and season changes (E26-S04)

- **Depends on:** phase 2.
- **Outcome / value:** a family is in the club with persons, relation, membership and an invitation in one step; freed
  places go to the next family in order; clubs can turn applications on.
- **Deliverables:** the accept command (DD-J10, DD-J10a) and sheet with duplicate reuse, the fee line (Q-J06), the
  freed-place subscriber and job part (DD-J15), the rollover subscriber (DD-J15a), accept beyond the limit, the
  season-end rule, the visible section switch, `people.dataExport.enrolment` and `people.departure.enrolment` (with the
  `people` allow-lists), the applicant CLI with delivery erasure by address, isolation inventory for the new routes.
- **Requirements closed:** REQ-J12 (accept), REQ-J13, REQ-J14, REQ-J15, REQ-J18 (export, erasure, season end).
  **Tests:** TEST-J06 (complete), TEST-J07, TEST-J08, TEST-J09, TEST-J11 (complete).
- **Exit gate:** as phase 1.

### Phase 4 — Trial session (E26-S05)

- **Depends on:** phase 3 (a trial ends in accept or reject).
- **Outcome / value:** the trial session runs in the app instead of on paper.
- **Deliverables:** propose / withdraw trial, `activities.occurrenceFacts.upcomingSessionsOfGroup` and the
  trial-session picker, the `vereino:club:occurrence:attendance:extra` spot in `activities` and the M-J4 card,
  `enrolment.trials.mark` with `auditedRead` for coach reads, the `activities.occurrence.cancelled` subscriber, the
  e-mails, isolation inventory.
- **Requirements closed:** REQ-J12 (trial), REQ-J16. **Tests:** TEST-J10.
- **Exit gate:** as phase 1.

### Ask First items (need the owner's approval before the phase starts)

The owner approved on 2026-11-26 ([owner decision on #788](https://github.com/wladku/Vereino/issues/788#issuecomment-7183799608)) every item below except the slug-free system-scope exception, which
the design does not need. Anything beyond the spec still needs a separate approval.

| Item | Phase | Kind | Approval |
|---|---|---|---|
| `groups_groups.places_limit`, `accepts_applications` | 1 | migration | approved 2026-11-26 (migration as specified) |
| `club_core_sections.accepts_applications` | 1 | migration | approved 2026-11-26 (migration as specified) |
| `club_core_club_settings.application_age_reference_day`, `application_answer_days`, `application_information` | 1 | migration; contract (settings schema) | approved 2026-11-26 (migration as specified) |
| Fit rule moved to `@vereino/core` (re-exported from `groups/lib`) | 1 | shared package surface (additive) | approved 2026-11-26 |
| `groups.applicationTargets` and `people.duplicateCandidates` DI contracts | 1, 2 | new contract surfaces (additive) | approved 2026-11-26 |
| New module `enrolment` (registration, ACL, roles) — Q-J01 | 2 | new module | approved 2026-11-26 |
| `enrolment_applications`, `enrolment_confirmation_links`, `enrolment_application_links` | 2 | migration | approved 2026-11-26 (migration as specified) |
| Only if the owner wants slug-free links (DD-J07): an AGENTS.md exception for a token-hash lookup outside a club scope | 2 | scope; system-scope lookup | not approved (2026-11-26) — the design uses club-scoped lookups |
| `emailSubjectLimit` added to `foundation` (facilities switched) | 2 | shared helper change | approved 2026-11-26 |
| `vereino:public:section:actions` (club_core) and `vereino:club:occurrence:attendance:extra` (activities) spots | 2, 4 | new contract surfaces (additive) | approved 2026-11-26 |
| `enrolment` added to the allow-lists of `people.dataExport.*` and `people.departure.*`; delivery erasure by address hash in `foundation` | 3 | contract (additive) | approved 2026-11-26 |
| `activities.occurrenceFacts.upcomingSessionsOfGroup` | 4 | contract (additive) | approved 2026-11-26 |

## Requirement Traceability

| Requirement | Journey / surface | Data/API/event contracts | Phase | Tests | Acceptance criterion |
|---|---|---|---|---|---|
| REQ-J01 | B-J2 | `groups_groups` columns, `club_core_sections.accepts_applications`, `groups.applicationTargets` | 1 | TEST-J01 | AC-J01 |
| REQ-J02 | B-J2 | settings columns including `application_information` | 1 | TEST-J01 | AC-J01 |
| REQ-J03 | P-J1 | spot `vereino:public:section:actions`, `…/form` | 2 | TEST-J01, TEST-J02 | AC-J02 |
| REQ-J04 | J-J01, P-J2 | `…/applications` submit, BR-J1 | 2 | TEST-J02 | AC-J02 |
| REQ-J05 | J-J01, P-J2 | DD-J03, DD-J04, BR-J2 | 2 | TEST-J02 | AC-J03 |
| REQ-J06 | J-J02, P-J2, M-J2 | `age_fit` | 2 | TEST-J02 | AC-J03 |
| REQ-J07 | J-J01, P-J3 | `…/confirm`, DD-J06 | 2 | TEST-J03 | AC-J04 |
| REQ-J08 | P-J2 | honeypot, `emailSubjectLimit`, per-IP limits | 2 | TEST-J03 | AC-J04 |
| REQ-J09 | J-J06, P-J4 | `…/status`, `…/withdraw`, `…/resend-link`, DD-J07 | 2 | TEST-J04 | AC-J05 |
| REQ-J10 | J-J03, M-J1, M-J2 | `/api/enrolment/applications`, BR-J5 | 2 | TEST-J05 | AC-J06 |
| REQ-J11 | M-J2, M-J3 | flags, `people.duplicateCandidates` | 2 | TEST-J05 | AC-J06 |
| REQ-J12 | J-J03, M-J3 | reject, wait, propose_trial, accept; e-mail templates | 2, 3, 4 | TEST-J06, TEST-J07, TEST-J10 | AC-J07 |
| REQ-J13 | J-J03, J-J05, M-J3 | `enrolment.applications.accept`, DD-J10, DD-J11 | 3 | TEST-J07 | AC-J08 |
| REQ-J14 | M-J3 | fee line, Q-J06 | 3 | TEST-J08 | AC-J08 |
| REQ-J15 | J-J04, M-J2 | DD-J09 (phase 2), DD-J10a, DD-J15, DD-J15a, BR-J4 | 2, 3 | TEST-J03, TEST-J09 | AC-J09 |
| REQ-J16 | J-J03, M-J4 | trial columns, spot, `enrolment.trials.mark` | 4 | TEST-J10 | AC-J10 |
| REQ-J17 | J-J07, B-J1 | dashboard widget, `/api/enrolment/overdue` | 2 | TEST-J05 | AC-J06 |
| REQ-J18 | — | jobs, export/erasure/offboarding contributors, compliance pack, CLI | 2, 3 | TEST-J11 | AC-J11 |
| REQ-J19 | — | `inventory/enrolment.json` | 2–4 | TEST-J12 | AC-J12 |

## Rollout, Migration, and Rollback

- Columns are additive with defaults (`accepts_applications` false on sections, so nothing is public until a club turns
  it on); tables are new; no backfill; no lock on large tables.
- The release note tells administrators: set the limits, the reference day and answer time, write the information text
  (after the lawyer's text, Q-J09), then turn on "accepts online applications" per section.
- Rollback of phase 2–4: turn off the sections' switch (the button and the form disappear; the public routes answer 404
  `applications_closed`); disabling `enrolment` in `src/modules.ts` removes the screens; data stays until the retention
  job of a re-enabled module or an operator deletes it. Removing columns is a new migration after the data is cleared.
- Accepted families are ordinary persons and memberships; rolling back the module does not touch them.

## Risks and Tradeoffs

| Risk | Scenario | Mitigation |
|---|---|---|
| Spam or abuse | a bot sends thousands of applications | honeypot, per-IP and fail-closed per-e-mail limits, confirmation link, 24-hour deletion |
| Wrong recipient | a parent mistypes the e-mail; a stranger gets the status link | the link shows only that application; a new link replaces the old; withdrawal is the worst action |
| Duplicate persons | a guardian already in the club applies with another e-mail | candidates by phone and by name + birth date for the child; the coordinator decides; a later merge stays manual |
| Decrypt cost of duplicate detection | a large club (2,000 persons) and many applications | once per application post-commit plus on the accept sheet; an `email_hash` column later if measured (DD-J11) |
| Coordinators ignore applications | a section's coordinator is inactive | answer time, overdue flag, administrator dashboard widget |
| Age reference ambiguity | a club's season starts in August | the reference day is a club setting; DD-J03's 60-day look-ahead is a constant to revisit (Q-J02) |
| Legal basis wrong | the lawyer prefers consent or another basis | the text and basis are club texts; the data is minimal and auto-deleted (Q-J09) |
| Publicly showing "full" | competitors learn group occupancy | only a "full" word, no counts (Q-J04) |

## Acceptance Criteria

Every criterion that names a phone or public page is checked at 375 px, in English and Polish, in light and dark mode
(D-029).

- [x] **AC-J01** — An administrator sets a group's limit and switches, the section switch, the reference day, the answer
  time and the information text; the roster shows "x / limit" (TEST-J01). — PR #813, `groups/TEST-J01-places-and-settings.spec.ts`; the section switch is set through the API until its form field ships with phase 3 (#800) (close-out V #842)
- [ ] **AC-J02** — The "Apply" button shows only when the section and at least one group accept applications; the
  three-step form asks exactly the fields of BR-J1 (TEST-J01, TEST-J02). — gap: #799 (phase 2, TEST-J02)
- [ ] **AC-J03** — Matching groups are listed first by age on the reference date and, for "U" teams, by birth year; an
  outside group needs a warning, "choose for us" always works, and the hard limits refuse (TEST-J02). — gap: #799 (TEST-J02)
- [ ] **AC-J04** — Nothing reaches the club before the one-hour, one-time confirmation; the honeypot and the limits
  refuse abuse (TEST-J03). — gap: #799 (TEST-J03)
- [ ] **AC-J05** — The status link shows the state and withdraws; a new link replaces the old (TEST-J04). — gap: #799 (TEST-J04)
- [ ] **AC-J06** — Coordinators see their sections' applications on the phone with tabs, flags and a Today tile; the
  administrator sees every section and the overdue widget (TEST-J05). — gap: #799 (TEST-J05)
- [ ] **AC-J07** — The four decisions work and each e-mails the applicant (TEST-J06, TEST-J07, TEST-J10). — gap: #799 (reject, waiting list), #800 (accept), #801 (trial)
- [ ] **AC-J08** — Accepting creates or reuses persons, relation and membership from the chosen day, sends the
  invitation after commit, and names the fee rule (TEST-J07, TEST-J08). — gap: #800 (TEST-J07, TEST-J08)
- [ ] **AC-J09** — Waiting lists are numbered per group, freed places are announced once, and accepting beyond the
  limit needs the confirmation (TEST-J09). — gap: #799 (numbering), #800 (freed places, TEST-J09)
- [ ] **AC-J10** — A trial participant is on the session's attendance page without a membership or a fee, and the
  existing attendance data and reports are unchanged (TEST-J10). — gap: #801 (TEST-J10)
- [ ] **AC-J11** — Retention, export, erasure and season-end clearing work as specified and the compliance pack lists
  them (TEST-J11). — gap: #799 (retention), #800 (export, erasure, season end; TEST-J11)
- [ ] **AC-J12** — The cross-club isolation guard passes with every new route (TEST-J12). — gap: #799, #800, #801 (each phase adds its routes to `inventory/enrolment.json`; TEST-J12)
- [ ] Every affected API and UI path has self-contained integration coverage; `yarn verify` is green. — gap: #799, #800, #801

## Final Compliance Report

| Check | Status | Evidence / resolution |
|---|---|---|
| Tenant and organization scope derived on the server | pass | member routes from the session and BR-J5; public routes from the slug lookup or the link lookup |
| No system-scope query added without approval | pass | token lookups are scoped to the club from the slug (DD-J06, DD-J07); only the existing public-slug lookup of `clubCorePublicSite` runs unscoped |
| No cross-module ORM relation | pass | scalar ids, DI contracts, commands through the bus, events |
| Sensitive data | pass with open item | minimal fields, encryption, retention, compliance pack; the legal basis waits for the lawyer (Q-J09) |
| Canonical UI primitives | pass | `DataTable`/`CrudForm` back office, Tailwind member and public pages, status variants |
| Every requirement has a phase, test and AC | pass | *Requirement Traceability* |
| Migrations and the new module listed as Ask First | pass | *Ask First items* |
| Backward compatibility | pass | additive columns, settings keys, routes, spots, DI contracts; moved helpers re-exported |

Verdict: `Ready for implementation — the owner answered Q-J01…Q-J10 and approved the module, the migrations and the
additive contracts on 2026-11-26; the lawyer item of Q-J09 blocks the production release of phase 2 (not building); the
slug-free system-scope exception is not approved and not needed.`

## Open Questions

Each question had a recommended default that the design above already assumes. The owner accepted every default on
2026-11-26 ([owner decision on #788](https://github.com/wladku/Vereino/issues/788#issuecomment-7183799608)). The lawyer item (Q-J09) does not block building; it blocks the
production release of phase 2.

| ID | Question | Owner | Blocking? | Resolution / decision date |
|---|---|---|---|---|
| Q-J01 | Owning module: a new module `enrolment` (recommended, DD-J01) or the applications in `groups`? | Władek Kuć | phase 2 | decided 2026-11-26 — new module `enrolment` |
| Q-J02 | Age reference date: the latest occurrence of the club's reference day on or before today + 60 days (recommended, DD-J03), or the reference day of the season that contains today? Is 60 days the right look-ahead? | Władek Kuć | phase 2 | decided 2026-11-26 — DD-J03 with 60 days |
| Q-J03 | Who receives applications of a section without a coordinator: all club administrators (recommended), or a club setting naming one person? | Władek Kuć | phase 2 | decided 2026-11-26 — all club administrators |
| Q-J04 | A confirmed application to a full group: straight onto the waiting list with its number (recommended, D-041 §4), or into New for the coordinator to decide? Does the public form say "full — waiting list" (recommended) or hide occupancy? | Władek Kuć | phase 2 | decided 2026-11-26 — straight onto the waiting list; the form says "full" without counts |
| Q-J05 | Duplicate detection: decrypt and compare in memory without a new column (recommended, DD-J11), or add an `email_hash` to `people_persons` (migration and backfill)? Which rules count: same e-mail or phone for a guardian; same normalised name and birth date for a child (recommended)? | Władek Kuć | phase 3 | decided 2026-11-26 — in memory; the rules as listed |
| Q-J06 | Fees after acceptance: keep the existing generation (the group's fee applies to anyone on the roster on the charge's reference day; no pro-rata; the accept sheet names the fee and that rule; the administrator can add a custom discount) — recommended — or add a pro-rata rule for a part month? | Władek Kuć | phase 3 | decided 2026-11-26 — existing generation, no pro-rata |
| Q-J07 | Is the trial session free and limited to one per application (recommended), or may the coordinator propose a second one? | Władek Kuć | phase 4 | decided 2026-11-26 — free; one at a time, a new one only after the previous is over or cancelled |
| Q-J08 | Account invitation on accept: for the guardian (or the adult) by default, switchable off on the sheet (recommended), or never automatic? | Władek Kuć | phase 3 | decided 2026-11-26 — on by default, switchable |
| Q-J09 | Legal basis Art. 6(1)(b) and the information text for applicants: does the lawyer confirm, and who writes the default text shipped with the module? | Władek Kuć (lawyer) | production release of phase 2 | decided 2026-11-26 — Art. 6(1)(b); a default text drafted with the D-035 lawyer items; ⚠ lawyer confirmation needed before production |
| Q-J10 | Retention of accepted applications: anonymised 30 days after acceptance like other closed ones (recommended; the person and membership hold the data from then), or kept as proof of the guardian's statement and rules acceptance for the membership's life? | Władek Kuć | phase 2 | decided 2026-11-26 — anonymised after 30 days, keeping `rules_accepted_at` and `privacy_acknowledged_at` with the text version |

## Changelog

Each change is its own file in `.ai/specs/changelog/2026-11-25-vereino-section-sign-up-form/` (`YYYY-MM-DD-<slug>.md`,
one `| date | change |` row). Never add rows to this section.
