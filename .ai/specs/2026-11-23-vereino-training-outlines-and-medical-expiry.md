# Training outlines, a shared outline library and the medical certificate expiry date

**Date**: 2026-11-23
**Status**: In progress — approved by the product owner on 2026-11-24 ([owner decision on #671](https://github.com/wladku/Vereino/issues/671#issuecomment-7123134361); issue #672, epic E24 #671, decision D-038 in PR #670)

> Use om-spec-writing for the process. This spec is design-only: nothing is built in its PR.

Sources: D-038 (training outlines, the shared library and the medical expiry date; PR #670), D-029 (phone first for every
role but the administrator), D-034 and the many-clubs spec `2026-11-22-vereino-many-clubs-one-instance.md` (one tenant
per club on one shared instance), D-024/D-026 (the only approved system-scope lookups), D-035 (core under AGPL; this is
core, not Enterprise), the person data export spec `2026-11-21-vereino-person-data-export.md` (#527) and the compliance
pack in `docs/compliance/` (E19). PZPN sources read for this spec (2026-11-23): *Regulamin Programu Certyfikacji PZPN dla
Szkółek Piłkarskich* (state on 2026-09-01) §3 points 8–9; *Certyfikacja Elite — Wskazówki do bieżącego spełniania
Kryteriów Programu w systemie na poziomie Srebrnym* (October 2025) chapters 11–13; *Program Szkolenia PZPN U6–U13*
chapter 11.2 and the sample outlines 12.6–16.1; *Badania lekarskie* (PZPN, March 2025). Code facts checked at
`8f41873c` (`main`, 2026-11-23).

## TLDR

Three things that coaches of two PZPN-certified academies asked for (D-038), built in four phases:

1. **Medical certificate expiry** — one encrypted "valid until" date per person in `people`, a three-colour status
   (expired or missing / under a month / valid, as in PZPN's system) on the roster, the attendance list and a match's
   squad, and reminders to the guardian or adult participant a month before and on the day. No scan, no result, no
   diagnosis.
2. **Training outlines** — a new module `training` holds outlines in the PZPN template's minimum content (goal, age
   category, warm-up / main / cool-down, exercises with time and organisation, equipment, optional images). A coach
   writes one on the phone and attaches it to a session or to a recurring activity (each session then gets its own
   copy), sees it while running the session, and prints it as a PDF in the PZPN layout.
3. **PZPN exports and a shared library** — CSV files of a team's schedule and attendance for a period, shaped like PZPN's
   "Harmonogram" and "Lista obecności"; and a library of outlines shared with clubs on Vereino or the public, with
   copies that keep the author's credit, 1–5 ratings after use, a ranking, search, consented author names, a public page
   and abuse reports. Library entries live in **one dedicated library tenant** of the instance, written only by a
   publish command that copies a snapshot out of the author's club.

## Problem Statement

- **Medical certificates.** A player in a competition run by a Polish sports association must hold a valid sports
  medical certificate (art. 37 Sports Act; regulation of the Minister of Health of 22 July 2016). The doctor sets the
  expiry date. Coaches find out about an expired certificate on match day. PZPN's academy system marks each player red
  (missing or expired), orange (under a month left) or green (*Certyfikacja Elite* ch. 13), but only the school
  administrator sees it there; the coach on the pitch does not.
- **Outlines.** A certified academy must train by the PZPN programme. Every training event in PZPN's system needs an
  outline ("konspekt") uploaded as a PDF; the monitoring visit checks that outlines were entered on time and match the
  session watched (*Regulamin* §3.9, Załącznik 4). Coaches write them in Word or on paper, then retype or scan.
- **Double entry.** PZPN's system has no public interface and no import (*Certyfikacja Elite* ch. 11–12: events are
  added one by one; attendance is ticked per player and locks 72 hours after the event ends). The club keeps the same
  schedule and attendance in Vereino.
- **Scale.** A coach who has 10 outlines needs about 100 per season. Other coaches on the same instance already wrote
  them (D-038 §4–5).

Evidence: two clubs holding a PZPN star (D-038); PZPN documents listed in *Sources*.

## Overview and Success Measures

| Measure | Target | How measured |
|---|---|---|
| Players of a certified club with a known medical expiry date | ≥ 90 % of active participants within two months of phase 1 | count of `people_persons.medical_valid_until` not null among active participants, per club |
| Active participants with a red status on the first day of each month | falling month on month after phase 1 | an operator script per club over the decrypted dates (the status is never stored, DD-O02) |
| Training sessions of a certified club with an outline attached | ≥ 80 % after phase 2 | `training_outlines` with an occurrence id ÷ training sessions in the period |
| Time to produce the PZPN PDF of a session's outline | under 1 minute on a phone | manual check at the phase 2 exit gate |
| Shared outlines copied or used by another club | ≥ 1 use per shared outline on average six months after phase 4 | `training_library_uses` grouped by entry |

## Goals

- **REQ-O01** — A person has one optional "medical certificate valid until" date. Who may enter it is Q-O01 (default:
  the club administrator, a coordinator of one of the person's sections, a guardian of the person, or the adult person
  themself). No scan, result or diagnosis is stored (D-038 §1).
- **REQ-O02** — Coaches (for their own groups) and coordinators (for their sections) see a medical status per player on
  the roster, the attendance list and the squad of a match: **expired or missing** (red), **under a month left**
  (orange), **valid** (green), with the date. Thresholds match PZPN's system (D-038 research).
- **REQ-O03** — The guardian, or the adult participant, receives an in-app notification and an e-mail one month before
  the date and on the date, through the existing notification and dispatch channels and a daily job (E22 sweep when it
  exists).
- **REQ-O04** — The date is health data (GDPR Art. 9): it has a documented legal basis, is encrypted at rest, appears in
  the records of processing, the DPIA and the retention schedule, is part of the person data export (#527) and is
  cleared by anonymisation.
- **REQ-O05** — Whether a red status blocks a match call-up or only warns is Q-O05 (default: warns only).
- **REQ-O06** — A coach writes a training outline on the phone with the PZPN template's minimum content: topic and
  goal, specific goals, age category, planned duration, number of players, three parts (warm-up, main, cool-down),
  exercises with time, organisation and coaching points, equipment, and optional images (upload only, no drawing
  editor).
- **REQ-O07** — A coach attaches an outline to a session, or to a recurring activity: every session of the activity
  then has its **own copy**, which the coach may change for that session only.
- **REQ-O08** — The coach sees the session's outline on the session page while running the session.
- **REQ-O09** — An outline prints to a PDF in the PZPN layout, from the phone, named so it can be uploaded to the
  event in PZPN's system.
- **REQ-O10** — A coordinator, or a coach for an own group, downloads for a team and a period a **schedule file** and an
  **attendance file** in the shape PZPN's system asks for. No integration with PZPN's system (D-038 §3).
- **REQ-O11** — A shared outline library with three visibility levels: the club, clubs on Vereino, the public. A club
  setting sets the widest level its coaches may use; a new club starts at "clubs on Vereino" (D-038 §4).
- **REQ-O12** — A coach copies a library outline into the club; the copy keeps the original author's credit. A coach
  rates an outline 1–5 once, after closing a session that used it. The library ranks by average rating and by the
  number of coaches who used it, and is searchable by age category, topic and part (D-038 §5).
- **REQ-O13** — Public outlines have a public page reachable without signing in.
- **REQ-O14** — The author's name appears in the library only with the author's consent; otherwise the entry shows the
  club's name only.
- **REQ-O15** — Anyone who can see a shared outline can report it; reported outlines are moderated (Q-O04).
- **REQ-O16** — Library entries are stored outside any one club's tenant without weakening club isolation: no club data
  other than the published snapshot leaves the club, and the E22 isolation guard (#628) proves it.

## Non-goals

- A drawing editor or animated exercise diagrams (images are uploads only).
- Monthly training plans (mesocycles) and their link to outlines (D-038: later).
- Any interface to PZPN's system: no upload, no scraping, no credentials. Exports are files the coach uploads or copies.
- Scouting, assessments, individual statistics; medical results, scans or diagnoses; the parent's statement
  ("oświadczenie rodzica") that PZPN also tracks.
- A cross-club view of people: the library never shows players, sessions or any club data except the published outline.
- Paid outlines or a marketplace.

## Proposed Solution

### Design Decisions and Alternatives

| Decision | Rationale | Alternative considered | Why rejected / deferred |
|---|---|---|---|
| **DD-O01** The medical date is a column `medical_valid_until` on `people_persons`, encrypted with the person's other personal fields. Consent is a new kind `medical` in the existing `CONSENT_KINDS` / `StoredConsents`: on `Person.consents` for an adult, on `Guardianship.consents` for a minor (as `regulations`, `image`, `trips` today) — no consent column | the date belongs to the person; the club's tenant key protects it; reuse of `encryptedField` and the consent model, so the consent needs no migration | a separate `people_medical_certificates` table with history | history is not asked for and doubles Art. 9 data; one date is the least data (D-038 §1) |
| **DD-O02** The status is computed, never stored: red when the date is missing or before today, orange when within 30 days (inclusive), green otherwise, in the club's time zone | thresholds are PZPN's ("mniej niż miesiąc"); a computed status cannot go stale | a stored status updated by a job | a stale colour on match day is worse than a computation |
| **DD-O03** Coaches and coordinators read the status through a `people` service (`people.medicalStatus`, optional DI) that returns `{ personId, status, validUntil }` for ids already in the caller's scope | `groups` and `activities` pages show it without an ORM relation; the service enforces scope | adding the column to roster queries in other modules | a cross-module ORM read is forbidden (AGENTS.md *Never*) |
| **DD-O04** Reminders run as a `people` job `medical-reminders` daily at 07:00 club time; idempotent by the key `medical:{personId}:{validUntil}:{kind}` on the dispatch; it moves to the E22 sweep (`foundationClubJobs.declare`) when E22-S03 (#629) lands | the dispatch already dedupes by key; a changed date restarts the reminders | adding the reminders to `life-cycle` | one job per purpose keeps failures and retries separate |
| **DD-O05** A new module **`training`** holds outlines, their images, the PDF view, the library, ratings and reports | outlines are a capability of their own with their own ACL and four tables; `activities` is already the largest module | extending `activities` | it would mix a content library with scheduling and grow its migration surface; the issue allows either |
| **DD-O06** The PZPN schedule and attendance exports live in **`activities`** as reports beside the coach-units CSV, with the outline topic filled through an optional DI resolver `training.outlineTopics` | the data is activities' own; the CSV helpers exist (`activities/lib/coach-units.ts`) | the export in `training` | it would read `activities_occurrences` and `activities_attendances` across modules |
| **DD-O07** An outline row has an optional scalar `activity_id` (series outline) or `occurrence_id` (session outline). A session copy is created **post-commit** by a subscriber of `activities.occurrence.generated` (which names sessions created, changed or removed): created → copy; changed (moved) → keep the copy; removed → soft-delete an unedited copy, keep an edited one detached; `activities.occurrence.cancelled` → keep the copy, excluded from uses. Attaching a series outline also copies it into the activity's future sessions in the same command. The session widget calls an explicit idempotent `POST …/ensure-copy` for a session that still has none — never a write inside a GET | each session gets its own copy (REQ-O07) without a cross-module transaction; every session life-cycle change has a rule | one outline shared by reference | a later edit would rewrite what past sessions used, which the monitoring visit checks |
| **DD-O07a** `training` reads session facts only through a new optional DI contract of `activities`, `activities.occurrenceFacts(scope, ids)` → `{ id, activityId, groupId, sectionId, type, status, startAt, endAt, coachPersonId, placeLabel }` for ids in the caller's scope, and names through the existing directory services of `groups` and `people`; `activities` renders a new injection spot `vereino:club:occurrence:sections` on `/club/occurrences/[id]` that `training` fills | the 72-hour lock, edit rights, `authorizeScoped` on attach and the print header need these facts; no cross-module ORM read | reading `activities_occurrences` from `training` | forbidden (AGENTS.md *Never*); the spot does not exist today (`activities/widgets/injection-table.ts` has only `vereino:club:today:sections` and `backend:nav:badges`), so it is a phase 2 deliverable |
| **DD-O08** The PDF is a print page (`/club/training/outlines/[id]/print`) with a print stylesheet in the PZPN layout; the phone's "Print → Save as PDF" makes the file | no new dependency; works on iOS and Android browsers; the same page renders at 375 px | a server-side PDF library (`pdf-lib`, `@react-pdf/renderer`) | a dependency is Ask First (Q-O07); a server PDF can be added later behind the same button |
| **DD-O09** Exports are UTF-8 CSV with a BOM and the Polish `;` separator for `pl` (the existing `csvSeparatorFor`), one row per session (schedule) and one row per session × player (attendance) | PZPN's system has no import; a spreadsheet the coach copies from is the honest shape | XLSX | a dependency for no extra value |
| **DD-O10** **Library entries live in one dedicated library tenant** of the instance (`directory:tenant` "Vereino library" with one organization), created by `yarn mercato training library-init` and named in configuration (`VEREINO_LIBRARY_TENANT_ID`, `VEREINO_LIBRARY_ORGANIZATION_ID`). A DI service `trainingLibrary` is the only code that reads or writes it, always with that fixed scope; it never takes a scope from a request | `ScopedEntityBase` keeps non-null scope (`packages/db/src/scoped-entity.ts`); the scope is trusted configuration, so there is **no system-scope query**; club tenants are untouched | (a) rows with `organization_id = null` (system scope); (b) reading another club's tenant when visibility allows it | (a) needs an unscoped table; (b) is a cross-tenant read of club data, which BR-M1 of the many-clubs spec forbids |
| **DD-O10a** The library tenant is **not a club**. `library-init` creates the tenant and organization through the platform's tenant path so it gets its own encryption key, but creates **no roles, no users, no `club_core_club_settings` row** and never calls `foundationClubJobs.initClub`; club loops (sweeps, `create-club` checks, export/delete, `auth` loops in Vereino code) iterate clubs by their settings row or job state, so they skip it, and a test proves the sweeps never enqueue it. Because a club request writes into another tenant, AGENTS.md gains one exception (Ask First): *"The `training` library (E24, DD-O10): `trainingLibrary` in `training/services/library.ts` reads and writes the configured library tenant and organization only, never a scope from a request; a club request may write there only through the publish, copy, rating, use and report commands, with the snapshot allow-list of DD-O11."* | keeps the many-clubs invariant "a tenant is a club" true for every club loop while stating the one cross-tenant write | a `kind` column on the platform tenant | the platform `directory` entity is installed code, not ours to change |
| **DD-O11** "Club" visibility means **not published**: the outline stays only in the club's tenant. Publishing to "clubs on Vereino" or "public" copies a snapshot (no session, group or person ids; images copied) into the library tenant; later edits in the club are re-published explicitly | nothing of the club leaves its tenant unless a coach publishes it; withdrawal deletes the snapshot | publishing a live reference | a live reference is a cross-tenant read |
| **DD-O12** Raters and users are recorded in the library as an HMAC `rater_key = HMAC(VEREINO_LIBRARY_RATER_SECRET, club organization id ‖ person id)` with `rater_key_version` (a new secret is a new version; old keys stay valid, so rotation never re-keys anyone), plus the club's organization id for counting clubs. A use is recorded for the session's coach and for every coach or assistant of the session's group at close, so each of them may rate | one rating per coach per entry and a count of distinct coaches without storing another tenant's person id; the HMAC is still pseudonymous personal data, so it is erased with the person and the club (*Security*) | storing person ids | a person id of club A inside the library is a cross-club identifier |
| **DD-O13** Ranking: a Bayesian average `(5 × m + Σ ratings) ÷ (5 + n)` (m = mean rating of all entries) sorted descending, ties by distinct users; sort "most used" is offered beside it | an entry with one 5 does not beat one with forty 4.6s | a plain average | small counts dominate |
| **DD-O14** Abuse reports hide an entry automatically after reports from 3 different clubs until an operator decides; operators act through a CLI command (`yarn mercato training library-moderate`) | there is no operator UI yet (E22 has CLI commands only); automatic hiding limits harm before review | pre-moderating every public outline | a queue nobody staffs blocks every share (Q-O04) |
| **DD-O15** The public page is `/library/o/[entryId]` on the platform host (D-036: `vereino.org`), with only `visibility = public` entries, through `trainingLibrary` | public outlines belong to no club's subdomain; no slug lookup is needed | a page under each club's public site | the entry may outlive the club's publication settings |

## Domain Vocabulary and Business Rules

| Term / invariant | Precise meaning or rule | Source of truth | Failure behavior |
|---|---|---|---|
| Medical expiry date | the date until which the sports medical certificate is valid, as written by the doctor | `people_persons.medical_valid_until` (encrypted) | missing → status red "missing" |
| Medical status | `red` (missing, or date < today), `orange` (today ≤ date ≤ today + 30 days), `green` (date > today + 30) in the club's time zone | computed by `people/lib/medical.ts` | an unreadable date (decryption failure) shows red with "unknown" and logs |
| BR-O1 | a medical date is stored only while a `medical` consent is in force: the adult person's own, or for a minor the consent of any one active guardian. Only the data subject or a guardian gives or withdraws it — never staff; a staff write without a consent in force is refused. Any guardian's withdrawal clears the date. When a minor comes of age (`people.person.came_of_age`) the person is asked to give their own consent; the guardian's consent stays in force for 30 days, then the date is cleared if the person gave none | `people` commands; `holdsOwnConsents` | write without consent → 409 `medical_consent_missing` |
| Outline | a training plan for one session in the PZPN minimum content | `training_outlines` | — |
| Series outline / session copy | an outline with `activity_id` is the template of a recurring activity; each session of the activity gets a copy with `occurrence_id` and `source_outline_id` | `training_outlines` | — |
| BR-O2 | a session has at most one outline; a session copy is changed only by the session's coach, a coordinator of its section or the club administrator; editing the series outline never changes an existing copy | unique `(organization_id, occurrence_id)` | 409 `outline_exists` |
| BR-O3 | an outline of a closed session is read-only after 72 hours from the session's end (matches PZPN's lock and the monitoring visit) | `training` commands | 409 `outline_locked` |
| Library entry | a published snapshot of an outline with a visibility of `clubs` or `public` | `training_library_entries` in the library tenant | — |
| BR-O4 | a coach may publish only up to the club's widest level (`ClubSettings.outlineLibraryMaxVisibility`: `club`, `clubs`, `public`; default `clubs`) | `training` command reads `clubCoreSettings` | 403 `visibility_above_club_level` |
| BR-O5 | a club lowering its widest level withdraws its entries above the new level (post-commit job) | `training` subscriber | entries stay hidden until the job finishes |
| Author credit | the club name always; the author's "First L." only with the author's `publishNameConsentAt` (the instructor name consent, DD-29), captured at publish time; a copy keeps the origin's credit and adds "adapted by" | `training_library_entries.credit` | consent withdrawn → name removed from every entry by a subscriber |
| Use | a session closed (`activities.occurrence.completed`) whose outline came from an entry | `training_library_uses` | — |
| BR-O6 | a rating needs a use by the same rater key; one rating per rater key per entry, changeable | unique `(entry_id, rater_key)` | 409 `rating_requires_use` |

## Users, Permissions, and Scope

| Actor | Medical date | Outlines | Library | Exports |
|---|---|---|---|---|
| Club administrator | read/write all (`people.medical.manage`) | all of the club (`training.manage`) | publish/withdraw any club outline; sets the club level | all teams |
| Coordinator | read/write for own sections (Q-O01) | own sections | publish within the club level | own sections' teams (`activities.reports.view`) |
| Coach / assistant | status and date for own groups (`people.medical.view`), no write | own outlines and own groups' sessions (`training.outlines.write`) | browse, copy, rate, report, publish own (`training.library.use`, `training.library.publish`) | own groups (`activities.reports.view_own`) |
| Guardian | read/write for wards (Q-O01), on `/club/profile` of the ward | — | — | — |
| Adult participant | read/write own | — | — | — |
| Signed-in user of another club | — | — | sees `clubs` and `public` entries only | — |
| Anyone | — | — | `public` entries on the public page | — |
| Instance operator | — | — | moderation by CLI | — |

Scope is derived on the server: `personScope()` and `authorizeScoped` for club data; for the library the fixed library
scope (DD-O10). New features are seeded in `packages/core/src/roles.ts` (coach, coordinator, club_admin).

## Reuse and Ownership Map

| Need | Owner | Reused primitive |
|---|---|---|
| Medical date, consent, status, reminders | `people` | `encryptedField`, `consentColumn`/`StoredConsents`, `registerModuleSchedule` → `foundationClubJobs`, `foundationDispatch`, `defineEmailTemplate`, notification types |
| Status on roster / attendance / match squad | `groups`, `activities` pages | optional DI `people.medicalStatus` |
| Outlines, images, print page, library, ratings, reports | `training` (new) | `makeCrudRoute`, commands, `CrudForm` (back office), member pages on Tailwind (D-029), `attachmentService.createScoped` (as `facilities/commands/incident-photos.ts`) |
| Outline on the session page | `activities` page, `training` widget | UMES widget injection into a new spot `vereino:club:occurrence:sections` that `activities` adds to `/club/occurrences/[id]` (DD-O07a) |
| Session facts for `training` | `activities` | new optional DI `activities.occurrenceFacts` (DD-O07a) |
| PZPN exports | `activities` reports | `csvSeparatorFor`, `csvField` (`activities/lib/coach-units.ts`) |
| Club level setting | `club_core` | `ClubSettings`, `clubSettingsPatchSchema`, `club_core.settings.update` |
| Data export / anonymisation | `people`, `training` | `people.dataExport.<module>` (#527), `people.departure.<module>` `erase` |
| Club export / deletion | `training` | `club_core.clubExport.training`, `club_core.clubDelete.training` (E22) |

## Architecture and Data Flow

```
coach phone ──► /club/training/outlines (training) ──► training_outlines (club tenant)
                       │ attach to session/activity (scalar ids)
activities.occurrence.generated ──► training subscriber ──► session copies
/club/occurrences/[id] (activities) ◄── injected widget (training) shows outline
                       │ publish (snapshot, no person/session ids)
                       ▼
trainingLibrary (DI, fixed library scope) ──► training_library_* (library tenant)
   ▲ browse/copy/rate/report from any club            ▲ /library/o/[id] public page
activities.occurrence.completed ──► training subscriber ──► use (rater_key) in library

people.medicalStatus (DI) ◄── groups roster, activities attendance & match squad
people job medical-reminders ──► foundationDispatch (in-app + e-mail)
activities/api/reports/pzpn-* ──► CSV (topic via optional training.outlineTopics)
```

The library tenant is created once per instance by `yarn mercato training library-init` (idempotent; prints the ids to
put in configuration). Without the configuration the library is off: publish and browse answer 404
`library_not_configured`, everything else works.

## User Journeys

### Journey J-O01 — Coach sees who may not play

Kacper opens the U11 squad of Saturday's match on his phone. Two players show red ("expired 2026-11-02", "missing") and
one orange ("until 2026-12-10"). He calls the guardians; with Q-O05 at its default he can still keep them in the squad
and sees a warning on confirming it.

### Journey J-O02 — Guardian is reminded

Anna gets "Ola's medical certificate expires on 2026-12-23" a month before, in the app and by e-mail, books the doctor,
and enters the new date on Ola's profile. The reminder on the day is not sent because the date changed.

### Journey J-O03 — Coach plans a session

Kacper opens Tuesday's training, taps "Add outline", picks "From the library", filters U11 / main part / "1v1
defending", copies an outline by another club (credit kept), changes two exercises and saves. On the pitch he opens the
session and reads it. At home he taps "PDF", saves it and uploads it to the event in PZPN's system.

### Journey J-O04 — Recurring activity

The coordinator attaches "Week 1 – rondo" to the U9 Monday activity; every Monday session shows its own copy, and Kacper
changes one Monday's warm-up without touching the others.

### Journey J-O05 — Export for PZPN

At the end of the month the coordinator downloads the U11 schedule and attendance for November and copies them into
PZPN's system before the 72-hour lock.

### Journey J-O06 — Share and rate

Kacper publishes his outline to clubs on Vereino (the club level allows it; his name shows because he gave the
instructor name consent). A coach in another club uses it, closes the session and rates it 5.

## UI and Interaction Contracts

### UI architecture

Every non-administrator task has a member page on `/club/**` at 375 px (D-029), Tailwind with Open Mercato tokens;
the back office (`/backend/**`) gets the same data in `DataTable`/`CrudForm` for the administrator. Every page covers
loading, empty, error, conflict (409 with the version), keyboard and a11y, in `en` and `pl`, light and dark. Status
colours come from status variants (`StatusBadge` error / warning / success), never hard-coded, never the `brand`
variant; the status also carries text ("expired", "under a month", "valid") for colour-blind users.

### M-O1 `/club/groups/[id]` (roster, `groups`) and M-O2 `/club/occurrences/[id]/attendance` (`activities`)

A status chip with the date per participant, for users holding `people.medical.view` in scope. A filter "medical: not
valid". Empty date shows "missing".

### M-O3 match squad on `/club/occurrences/[id]` for a match (`activities`)

The confirmed and called-up players with the chip; a banner "2 players without a valid medical certificate" with the
names. Under Q-O05 default, confirming does not block.

### M-O4 `/club/profile` (person or ward, `people`)

A date field "Sports medical certificate valid until" with the `medical` consent checkbox and its text from
`ClubSettings.consentTexts` (shown to the adult person or a guardian only); clearing the consent clears the date after a
confirmation dialog. The back-office person page shows the date field disabled with "needs the consent of the person or
a guardian" while no consent is in force.

### M-O5 `/club/training/outlines` and `/club/training/outlines/[id]` (`training`)

List (mine, my groups, the club), filters by age category, part, topic. The editor is a single-column form: header
(topic, goal, specific goals, age category, duration, players, equipment), then three collapsible parts with exercises
(name, minutes, organisation, coaching points, image). Total minutes shown against the planned duration. Saving sends
`updatedAt`; a 409 shows "changed by someone else — reload".

### M-O6 outline on the session page (widget in `/club/occurrences/[id]`)

"Outline" card: none → "Add outline" (new / from my outlines / from the library); present → read view with parts and
exercises, "Edit" (if allowed and not locked), "PDF".

### M-O7 `/club/training/outlines/[id]/print`

The PZPN layout on A4: header table (club, team, age category, date, place, coach, number of players, duration, topic,
goal, specific goals, equipment); three part tables with columns *Ćwiczenie / organizacja*, *Czas*, *Uwagi metodyczne*,
images below their exercise. Labels follow the outline's language; a "Print / Save as PDF" button hidden in print.

### M-O8 `/club/training/library` and `/club/training/library/[entryId]`

Search and filters (age category, part, topic text), sort (ranking, most used, newest), cards with rating, uses, credit.
Entry page: read view, "Copy to my club", "Report", rating stars (enabled after a use).

### M-O9 `/club/reports/pzpn` (`activities`)

Team, period (default the current month), two buttons: "Schedule (CSV)", "Attendance (CSV)".

### B-O1 `/backend/club/settings` (`club_core`)

Field "Widest outline library level" (club / clubs on Vereino / public) with help text naming the licence (Q-O03).

### P-O1 `/library/o/[entryId]` (public)

Read-only outline, credit, licence notice, "Report" (rate-limited), no rating; `noindex` until Q-O03 is answered.

## Data Models

### `people_persons` (changed)

- `medical_valid_until` — text, encrypted (`encryptedField`, `people:person`), nullable; ISO date inside.
- Consent: the `medical` kind in `Person.consents` / `Guardianship.consents` (json; adding a kind to `CONSENT_KINDS`
  needs no migration).

Migration: one nullable column, no backfill. Anonymisation (`people/services/erasure.ts`) clears the date and the
`medical` consent entries.

**Querying an encrypted date.** The column has no hash, so no SQL filter or range on it. Every use loads the scoped
persons with `medical_valid_until IS NOT NULL` and decrypts in memory: the roster and attendance pages over the
already-scoped group (≤ ~40 people); the match squad likewise; the "medical: not valid" filter runs on the client over
that set; the daily reminder and retention job over the club's active participants (≤ ~500 per club; at 1,000 clubs
about 0.5 M decrypts a day, spread by the E22 offsets). No unencrypted sibling column is added.

### `training_outlines` (new, club tenant)

`id`, `tenant_id`, `organization_id`, `author_person_id`, `section_id?`, `group_id?`, `activity_id?`,
`occurrence_id?` (unique per organization when set), `source_outline_id?`, `origin_entry_id?`, `origin_credit jsonb?`,
`language`, `topic` (3–200), `goal` (≤ 1000), `specific_goals` (≤ 2000), `age_category` (dictionary of the club's age
categories, `groups` `AgeCategoryRange` labels), `duration_minutes` (10–240), `players_count?`, `equipment` (≤ 1000),
`parts jsonb` (validated: exactly three parts `warm_up`, `main`, `cool_down`; each 0–12 exercises
`{ name ≤ 200, minutes 1–120, organisation ≤ 2000, coaching_points ≤ 2000, image_attachment_id? }`),
`published_entry_id?`, `published_visibility?`, `created_at`, `updated_at`, `deleted_at`. Free text is not encrypted:
outlines are coaching content, not personal data, and the author id is a scalar.

### `training_library_entries` (new, library tenant)

`id`, scope = library tenant, `source_organization_id` (the club), `source_outline_id`, `visibility` (`clubs`,
`public`), `status` (`listed`, `hidden_reported`, `removed`), snapshot fields as above without ids, `images`
(attachment ids in the library tenant), `credit jsonb` (`{ clubName, authorName?, adaptedFrom? }`), `licence`,
`rating_sum`, `rating_count`, `user_count`, `report_count`, `published_at`, `updated_at`. Indexes on
`(status, visibility, age_category)`, a trigram or `ILIKE` index on topic.

### `training_library_ratings`, `training_library_uses`, `training_library_reports` (new, library tenant)

`entry_id`, `rater_key` (HMAC, DD-O12), `rater_organization_id`, `stars` 1–5 / `occurrence_count` / `reason` (enum:
copyright, wrong content, offensive, other) + `note ≤ 500`, `created_at`. Unique `(entry_id, rater_key)` for ratings
and uses; reports unique per `(entry_id, rater_key)` (public reports use a hashed IP, rate-limited).

### `club_core_club_settings` (changed)

`outline_library_max_visibility` text default `clubs` (existing clubs get `clubs` per D-038).

## API, Command, and Error Contracts

| Route / command | Method | Feature | Notes |
|---|---|---|---|
| `/api/people/persons/[id]/medical` → `people.persons.medical.set` | PUT | `people.medical.manage`, or guardian/self scope | `{ validUntil: date \| null, updatedAt }`; 409 `medical_consent_missing`, 409 version |
| `/api/me/consents`, `/api/guardianships/[id]/consents` (existing) | PUT | self / guardian | gain the `medical` kind; staff cannot set it |
| `/api/people/medical-status?personIds=` | GET | `people.medical.view` | ids outside scope are dropped, never 403 per id; coach reads go through `auditedRead` (foundation) |
| `/api/training/outlines` (`makeCrudRoute`) | GET/POST/PUT/DELETE | `training.outlines.write` / `training.manage` | list `{ items, total, page, pageSize, totalPages }`; 409 `outline_exists`, `outline_locked` |
| `/api/training/outlines/[id]/attach` → `training.outlines.attach` | POST | write + `authorizeScoped` on the occurrence or activity | `{ occurrenceId } \| { activityId }` |
| `/api/training/outlines/ensure-copy` | POST | write + `authorizeScoped` on the occurrence | `{ occurrenceId }`; idempotent; 200 with the existing copy or 201 |
| `/api/training/outlines/[id]/images` | POST/DELETE | write | `attachmentService.createScoped`, JPEG/PNG/WebP ≤ 5 MB, ≤ 12 per outline |
| `/api/training/library/[entryId]/images/[n]` and `/api/training/public/library/[entryId]/images/[n]` | GET | `training.library.use` / public | served by `trainingLibrary` after checking the entry's status and visibility (the platform attachment route serves only the owning tenant); images are re-encoded with EXIF stripped at publish; cached privately for signed-in, publicly for `public` |
| `/api/training/outlines/[id]/publish` → `training.library.publish` | POST/DELETE | `training.library.publish` | `{ visibility }`; 403 `visibility_above_club_level`; 404 `library_not_configured` |
| `/api/training/library` | GET | `training.library.use` | `q`, `ageCategory`, `part`, `sort`; only `listed` |
| `/api/training/library/[entryId]` | GET | `training.library.use` | 404 for hidden or removed |
| `/api/training/library/[entryId]/copy` → `training.library.copy` | POST | `training.outlines.write` | creates a club outline with `origin_entry_id`, `origin_credit` |
| `/api/training/library/[entryId]/rating` → `training.library.rate` | PUT | `training.library.use` | 409 `rating_requires_use` |
| `/api/training/library/[entryId]/report` | POST | `training.library.use` | one per rater key |
| `/api/training/public/library/[entryId]` (+ `/report`) | GET/POST | public | only `public` + `listed`; rate-limited |
| `/api/activities/reports/pzpn-schedule` | GET | `activities.reports.view` or `view_own` | `groupId`, `from`, `to` (≤ 1 year), `format=csv` |
| `/api/activities/reports/pzpn-attendance` | GET | same | same |

Every route declares per-method `metadata` and `openApi`, and gets probes in
`.ai/qa/tests/_fixtures/isolation/inventory/{people,training,activities}.json`. Error codes are declared in
`training/lib/error-codes.ts` and `people/lib/error-codes.ts`.

**Schedule CSV columns** (PZPN *Harmonogram treningowy*, Regulamin §3.8): team, event type (Trening / Mecz / Turniej /
Sparing / Obóz / Inne, from `ActivityType`), date, start, end, place (club place name or typed venue), name / general
goal (outline topic when present, else the activity name), coach, status (planned / cancelled).
**Attendance CSV columns** (*Lista obecności*, ch. 12: Obecny / Nieobecny / Usprawiedliwiony): team, date, start, last
name, first name, birth date, status — `actual` `present` or `late` → Obecny; `actual = absent` with a final
declaration `declared = no` made before the session start → Usprawiedliwiony (declarations are `yes`/`no`/`unknown`,
`activities/lib/policy.ts`; there is no separate acceptance); other `absent` → Nieobecny; not marked → empty. Column labels in the user's language; status values in
Polish always (they are PZPN's values). The exact column order is checked against the system (V-O1).

## Events, Jobs, Notifications, and Cross-Module Flows

- `people.person.medical_updated` (payload ids only) — consumed by nothing in phase 1; used by tests.
- Job `people:medical-reminders` daily 07:00 club time: persons with `medical_valid_until` in {today + 30, today} and a
  reachable recipient (guardians of a minor with the account; the adult person) → notification type
  `people.medical_expiring` / `people.medical_expired` (in-app) and e-mail templates of the same ids (opt-out allowed),
  dispatch key DD-O04. A missed day (job down) is caught up: the job looks back 3 days for each threshold, the key
  prevents a second send.
- `activities.occurrence.generated` → `training` subscriber creates session copies for activities with a series
  outline (idempotent by the unique index).
- `activities.occurrence.completed` → `training` subscriber records a library use when the session outline has an
  `origin_entry_id`.
- `people.person.updated` (name consent withdrawn) and anonymisation → `training` subscriber strips the author name from
  the person's entries.
- `club_core.settings.updated` (level lowered) → `training` job withdraws entries above the level (BR-O5).
- Club offboarding (E22, when its contributors land): `club_core.clubExport.training` exports the club's outlines;
  `club_core.clubDelete.training` deletes them, withdraws the club's library entries (Q-O08 default) and deletes every
  rating, use and report row with the club's `rater_organization_id`, recomputing the aggregates — so a deleted club
  leaves no rows (many-clubs BR-M4).
- Person departure / anonymisation: `people.departure.training` (`erase`) deletes the library rows with the person's
  rater keys (all versions) and recomputes the aggregates.

## Security, Privacy, and Compliance

- **Legal basis (Art. 9).** No law obliges the club to keep the date (D-038 research). Default (Q-O06): explicit consent,
  Art. 9(2)(a) with Art. 6(1)(a), given by the adult participant or a guardian of a minor, withdrawable at any time.
  Without consent no date is stored and the status is "missing". ⚠ To be confirmed by the lawyer with the D-035 items.
- **Minimisation.** One date; no scan, result, doctor or diagnosis; the coach sees status and date only for own groups.
- **Encryption.** `medical_valid_until` encrypted with the club's tenant key; status computed in memory.
- **Compliance pack (E19), changed in phase 1:** `docs/compliance/ropa.md` new activity A15 "Medical certificate
  validity" (purpose, Art. 9(2)(a), data subjects participants, table `people_persons.medical_valid_until`,
  recipients coaches and coordinators of the person's groups, retention R20); the "Special categories" paragraph
  updated; `dpia.md` new risk D-14 (a coach sees health-related data of players; exposure if an account is taken over)
  with measures (scope, encryption, no detail beyond a date); `retention.md` R20: until consent is withdrawn, the person
  leaves (with the departure clearing), or 12 months after the date passed without renewal — then cleared by the
  daily `medical-reminders` job (the date cannot be filtered in SQL); `data-subject-requests.md` names the field.
  Coach reads of the status go through `auditedRead` (foundation), the DPIA measure for D-14.
- **Compliance pack, changed in phase 4:** `ropa.md` activity A16 "Shared outline library" (author credit with consent,
  pseudonymous rater keys, report notes; Art. 6(1)(f) / (a) for the name; recipients all clubs on the instance or the
  public), and `retention.md` R21 (entries until withdrawn; rater rows until the person or club leaves).
- **Export and anonymisation.** The person data export (#527) includes the date and consent in the `people` section
  (activity A15); a `training` contributor exports outlines the person authored. Anonymisation clears the date and the
  consent and strips the author name from library entries.
- **Library isolation (REQ-O16).** Only `trainingLibrary` touches the library tenant, with configured scope; publish
  copies a snapshot built from an allow-list of fields; images are re-uploaded into the library tenant. The isolation
  guard gets a probe kind `library` (an `exempt`-like probe with a `why`, plus a test that club B sees club A's
  `clubs` entries but no `club`-level outline, no session id, no person id, no rater key). Changing
  `check-route-isolation.mjs` is part of phase 4.
- **Public content.** Licence (Q-O03), terms accepted by the author at first publish (recorded on a
  `training_authors` row in the club tenant: `person_id`, `terms_version`, `accepted_at`), images checked for type and
  size, text escaped, public page `noindex` until the owner decides.
- **Abuse.** Reports, automatic hiding at 3 clubs, operator CLI (Q-O04); rate limits on public report and read routes.

## Integration Coverage

| Test ID | Level | Setup / fixture | Actions | Assertions | Requirement IDs |
|---|---|---|---|---|---|
| TEST-O01 | integration | club with a U11 group, coach, guardian, three wards | guardian gives consent and sets a date; admin sets a date for a ward with consent and is refused (409) for one without; one left empty | statuses red/orange/green on roster, attendance and match pages for the coach; coach of another group sees none; staff cannot set the consent | REQ-O01, REQ-O02 |
| TEST-O02 | integration | date = today + 30 and = today | run `people:medical-reminders` twice | one in-app notification and one e-mail per threshold; none after the date changes | REQ-O03 |
| TEST-O03 | integration | ward with date | withdraw consent; anonymise another person | date cleared; write without consent → 409; data export includes the date (when #527 exists) | REQ-O04 |
| TEST-O04 | integration | match with a red player | coach confirms squad | warning shown, not blocked (Q-O05 default) | REQ-O05 |
| TEST-O05 | integration (375 px, en/pl) | coach phone | write an outline with three parts, an image; attach to a session; open the session | outline visible on the session page; 409 on a stale save | REQ-O06, REQ-O08 |
| TEST-O06 | integration | weekly activity with 4 generated sessions | attach a series outline; edit one session copy; edit the series; move one session, cancel one, shorten the series by one | each session has its own copy; the edited copy and past copies unchanged; moved keeps its copy; cancelled keeps it without a use; the removed session's unedited copy is soft-deleted; `ensure-copy` twice returns one copy | REQ-O07 |
| TEST-O07 | integration (browser print media) | outline | open print page | PZPN header and three part tables present; no app chrome in print media | REQ-O09 |
| TEST-O08 | integration | U11 with 5 sessions, marks and declarations | download both CSVs | columns and values as specified; coach of another group gets 404 | REQ-O10 |
| TEST-O09 | integration | two clubs, library configured | publish at `clubs`; club B browses, copies, closes a session, rates | credit kept; rating before use 409; ranking order | REQ-O11, REQ-O12 |
| TEST-O10 | integration | club level `club` | publish | 403 `visibility_above_club_level`; lowering the level withdraws entries | REQ-O11 |
| TEST-O11 | integration (no session) | public entry and a `clubs` entry | open public page for both | public 200; `clubs` 404 | REQ-O13 |
| TEST-O12 | integration | author with and without name consent | publish; withdraw consent | name shown only with consent; removed after withdrawal | REQ-O14 |
| TEST-O13 | integration | three clubs report | report | entry hidden; operator CLI restores | REQ-O15 |
| TEST-O14 | integration | `ISSUE-628-cross-club-isolation` with the new inventory; library tenant initialised | run; run the club sweeps; delete club B's library rows through its delete contributor | all new routes pass; library payloads carry no club ids beyond the source organization and no rater key; sweeps never enqueue the library tenant; no row with club B's organization id remains | REQ-O16 |

## Implementation Phases

### Phase 1 — Medical certificate expiry (E24-S02)

- **Depends on:** nothing to start. Uses `registerModuleSchedule` until E22-S03 (#629) lands, then
  `foundationClubJobs`. The data-export part of REQ-O04 is delivered with #527 (its `people` section gains the date);
  until #527 lands, AC-O04 checks erasure and consent only and the export check moves to #527's acceptance.
- **Outcome / value:** coaches stop finding expired certificates on match day.
- **Deliverables:** `people` column (migration, Ask First) and the `medical` consent kind; command, route, status
  service; chips on M-O1…M-O3; field on M-O4 and the back-office person page; job, notification types, e-mail
  templates (en, pl); came-of-age re-consent; compliance pack updates; erasure contribution; isolation inventory.
- **Requirements closed:** REQ-O01…REQ-O05. **Tests:** TEST-O01…TEST-O04.
- **Exit gate:** `yarn verify` green; the four tests pass locally; checked at 375 px, en/pl, light/dark.

### Phase 2 — Outlines on sessions with the PDF (E24-S03)

- **Depends on:** phase 1 not required; new module `training` registered (Ask First).
- **Outcome / value:** a coach plans and runs sessions from the phone and uploads the PDF to PZPN's system.
- **Deliverables:** module scaffold (`training` in `src/modules.ts` and `vereino-modules.json`), `training_outlines` and
  `training_authors` (migration), CRUD, attach, ensure-copy, images, subscribers for generated and cancelled sessions;
  in `activities`: the `activities.occurrenceFacts` DI contract and the `vereino:club:occurrence:sections` spot on the
  session page; the session widget, the print page, ACL and role seeds, i18n, isolation inventory.
- **Requirements closed:** REQ-O06…REQ-O09. **Tests:** TEST-O05…TEST-O07.
- **Exit gate:** as phase 1, plus a printed PDF checked against the PZPN sample outline (V-O2).

### Phase 3 — PZPN exports (E24-S04)

- **Depends on:** phase 2 for the topic column (optional; blank without `training`).
- **Deliverables:** two report routes and M-O9; `training.outlineTopics` resolver; isolation inventory.
- **Requirements closed:** REQ-O10. **Tests:** TEST-O08. **Exit gate:** V-O1 checked with a certified club.

### Phase 4 — The shared library with ratings (E24-S05)

- **Depends on:** phase 2; the library tenant (Ask First: new tenant, configuration, the AGENTS.md exception of
  DD-O10a); Q-O02, Q-O03, Q-O04, Q-O08 answered. Club export/delete contributors land with E22's offboarding work.
- **Deliverables:** `library-init` and `library-moderate` commands, `trainingLibrary` service, library tables
  (migration), publish/withdraw/copy/rate/report, the library image routes, M-O8, P-O1, the club setting B-O1, consent
  and settings subscribers, `people.departure.training` erasure, isolation probe kind `library`, a test that sweeps and
  club loops skip the library tenant, compliance pack A16/R21.
- **Requirements closed:** REQ-O11…REQ-O16. **Tests:** TEST-O09…TEST-O14.
- **Exit gate:** as phase 1; the isolation guard green with two clubs.

### Ask First items (need the owner's approval before the phase starts)

The owner approved on 2026-11-24 ([decision on #671](https://github.com/wladku/Vereino/issues/671#issuecomment-7123134361)) the new module `training` and every migration this spec
defines for phases 1–4, as specified. Anything beyond the spec still needs a separate approval; the items below marked
*open* are asked before their phase starts.

| Item | Phase | Kind | Approval |
|---|---|---|---|
| `people_persons.medical_valid_until` and the `medical` consent kind | 1 | migration; Art. 9 data | approved 2026-11-24 (migration as specified) |
| `activities.occurrenceFacts` DI contract and the `vereino:club:occurrence:sections` spot | 2 | new contract surfaces (additive) | open — ask before phase 2 |
| `VEREINO_LIBRARY_TENANT_ID`, `VEREINO_LIBRARY_ORGANIZATION_ID`, `VEREINO_LIBRARY_RATER_SECRET` | 4 | configuration; secret | open — ask before phase 4 |
| New module `training` (registration, ACL, roles) | 2 | new module | approved 2026-11-24 (Q-O09) |
| `training_outlines`, `training_authors` | 2 | migration | approved 2026-11-24 |
| `club_core_club_settings.outline_library_max_visibility` | 4 | migration; contract (settings schema) | approved 2026-11-24 (migration as specified) |
| Library tenant, its configuration and the `trainingLibrary` scope rule in AGENTS.md | 4 | architecture; scope | open — ask before phase 4 |
| `training_library_entries`, `_ratings`, `_uses`, `_reports` | 4 | migration | approved 2026-11-24 |
| New probe kind in `check-route-isolation.mjs` | 4 | change to a gate script | open — ask before phase 4 |
| A server-side PDF library, only if Q-O07 chooses it | 2 | dependency | not needed — Q-O07 chose the print page |

## Requirement Traceability

| Requirement | Journey / surface | Data/API/event contracts | Phase | Tests | Acceptance criterion |
|---|---|---|---|---|---|
| REQ-O01 | J-O02, M-O4 | `people_persons.medical_*`, `people.persons.medical.set` | 1 | TEST-O01 | AC-O01 |
| REQ-O02 | J-O01, M-O1–M-O3 | `people.medicalStatus`, `/api/people/medical-status` | 1 | TEST-O01 | AC-O02 |
| REQ-O03 | J-O02 | `people:medical-reminders`, `people.medical_expiring/expired` | 1 | TEST-O02 | AC-O03 |
| REQ-O04 | — | erasure, data export, compliance docs | 1 | TEST-O03 | AC-O04 |
| REQ-O05 | J-O01, M-O3 | match squad banner | 1 | TEST-O04 | AC-O05 |
| REQ-O06 | J-O03, M-O5 | `training_outlines`, `/api/training/outlines` | 2 | TEST-O05 | AC-O06 |
| REQ-O07 | J-O04, M-O6 | `training.outlines.attach`, `activities.occurrence.generated` subscriber | 2 | TEST-O06 | AC-O07 |
| REQ-O08 | J-O03, M-O6 | session widget | 2 | TEST-O05 | AC-O06 |
| REQ-O09 | J-O03, M-O7 | print page | 2 | TEST-O07 | AC-O08 |
| REQ-O10 | J-O05, M-O9 | `pzpn-schedule`, `pzpn-attendance` | 3 | TEST-O08 | AC-O09 |
| REQ-O11 | J-O06, M-O8, B-O1 | publish, `outline_library_max_visibility` | 4 | TEST-O09, TEST-O10 | AC-O10 |
| REQ-O12 | J-O06, M-O8 | copy, rating, uses, ranking | 4 | TEST-O09 | AC-O10 |
| REQ-O13 | P-O1 | public routes | 4 | TEST-O11 | AC-O11 |
| REQ-O14 | J-O06 | credit, consent subscriber | 4 | TEST-O12 | AC-O11 |
| REQ-O15 | M-O8, P-O1 | reports, `library-moderate` | 4 | TEST-O13 | AC-O12 |
| REQ-O16 | — | library tenant, `trainingLibrary`, isolation probes | 4 | TEST-O14 | AC-O13 |

## Rollout, Migration, and Rollback

- Every phase ships behind its own migration; columns are nullable, tables new — no backfill, no lock on large tables.
- Phase 1 rollback: hide the field and chips (feature not granted), keep the column; the job no-ops without dates.
  Removing the column is a new migration after the data is cleared.
- Phase 2 rollback: disable `training` in `src/modules.ts`; outlines stay in their tables; the session widget
  disappears because the injection has no provider.
- Phase 4 rollback: unset the library configuration → library routes 404 `library_not_configured`; entries stay in the
  library tenant until an operator deletes them.
- Existing clubs get `outline_library_max_visibility = clubs` (D-038); the release note tells administrators where to
  change it.

## Risks and Tradeoffs

| Risk | Scenario | Mitigation |
|---|---|---|
| Art. 9 basis wrong | a supervisory authority finds consent inappropriate for a club relationship | lawyer item (Q-O06); data is one date and can be cleared everywhere by one migration |
| Coach trusts a wrong date | guardian types the wrong year | status shows the date; admin can correct; no blocking by default |
| Library leaks club data | a snapshot carries an id or a name without consent | allow-list snapshot, TEST-O14, credit only from consent |
| Copyright | a coach publishes a scanned book page | terms at first publish, reports, automatic hiding, licence notice |
| Rating gaming | a club rates its own entries | one rating per coach, only after a use; Bayesian average; operator can remove |
| Print-to-PDF differs per browser | page breaks differ on Android and iOS | print CSS tested in Chromium and WebKit; server PDF later (Q-O07) |
| PZPN changes its forms | export columns drift | columns in one helper with a unit test; V-O1 recheck each season |

## Acceptance Criteria

Every criterion that names a phone page is checked at 375 px, in English and Polish, in light and dark mode (D-029).

- [x] **AC-O01** — A guardian, an adult participant, a coordinator and the administrator can set and clear the date per
  Q-O01 while a consent of the person or a guardian is in force; only the person or a guardian gives the consent; a
  coach cannot write (TEST-O01). — PR #705, `people/TEST-O01-medical-status.spec.ts`; the adult's own date in TEST-O02/TEST-O03 (close-out V #842)
- [x] **AC-O02** — The coach sees red/orange/green with the date for own groups on the roster, the attendance list and
  the match squad, and nothing for other groups (TEST-O01). — PR #705, `people/TEST-O01-medical-status.spec.ts`, `activities/TEST-O04-match-squad-medical.spec.ts` (close-out V #842)
- [x] **AC-O03** — Reminders arrive once a month before and once on the day, in-app and by e-mail (TEST-O02). — PR #705, `people/TEST-O02-medical-reminders.spec.ts` (close-out V #842)
- [x] **AC-O04** — Without consent no date is stored; anonymisation and consent withdrawal clear it; the compliance
  pack lists the field (TEST-O03). — PR #705, `people/TEST-O03-medical-consent-erasure.spec.ts`; `docs/compliance/ropa.md` A15, `dpia.md` D-14, `retention.md` R20 (close-out V #842)
- [x] **AC-O05** — A red player in a match squad produces a warning, not a block (TEST-O04, Q-O05). — PR #705, `activities/TEST-O04-match-squad-medical.spec.ts` (close-out V #842)
- [x] **AC-O06** — A coach writes, attaches and reads an outline on the phone (TEST-O05). — PR #706, `training/TEST-O05-outline-on-the-phone.spec.ts` at 375 px in en/pl; axe in light and dark mode and 320 px reflow on the editor and the session card by PR #860 (#846)
- [x] **AC-O07** — Every session of a recurring activity has its own copy (TEST-O06). — PR #706, `training/TEST-O06-series-outline-copies.spec.ts` (close-out V #842)
- [x] **AC-O08** — The print page yields a PDF in the PZPN layout (TEST-O07). — PR #706, `training/TEST-O07-outline-print.spec.ts`; V-O2 (a certified club's comparison) stays an owner action on #671 (close-out V #842)
- [x] **AC-O09** — Schedule and attendance CSVs match the columns above (TEST-O08). — PR #696, `activities/TEST-O08-pzpn-exports.spec.ts`; V-O1 stays an owner action on #671 (close-out V #842)
- [x] **AC-O10** — Publishing respects the club level; copy keeps credit; rating needs a use; ranking per DD-O13
  (TEST-O09, TEST-O10). — PR #729, `training/TEST-O09-library-share-copy-rate.spec.ts`, `training/TEST-O10-library-club-level.spec.ts` (close-out V #842)
- [x] **AC-O11** — Public entries open without signing in; the author's name shows only with consent (TEST-O11,
  TEST-O12). — PR #729, `training/TEST-O11-library-public-page.spec.ts`, `training/TEST-O12-library-author-name.spec.ts` (close-out V #842)
- [x] **AC-O12** — Reports from 3 clubs hide an entry; the operator CLI restores or removes it (TEST-O13). — PR #729, `training/TEST-O13-library-reports-moderation.spec.ts` (close-out V #842)
- [x] **AC-O13** — The cross-club isolation guard passes with the library routes (TEST-O14). — PR #729, `training/TEST-O14-library-isolation-offboarding.spec.ts`, probes in `_fixtures/isolation/inventory/training.json` (close-out V #842)
- [ ] Every affected API and UI path has self-contained integration coverage; `yarn verify` is green. — gap: the deferred back-office outline pages and part filter of M-O5 wait for the owner on #847

## Final Compliance Report

| Check | Status | Evidence / resolution |
|---|---|---|
| Tenant and organization scope derived on the server | pass | club data via `personScope`/`authorizeScoped`; library via fixed configured scope (DD-O10) |
| No system-scope query added | pass with open item | the library tenant is a real tenant, no `organizationId: null`; the cross-tenant write still needs the AGENTS.md exception of DD-O10a (Ask First) |
| No cross-module ORM relation | pass | scalar ids, optional DI (`people.medicalStatus`, `training.outlineTopics`), events |
| Sensitive data | pass with open item | encrypted date, consent, compliance pack; legal basis Q-O06 decided (explicit consent), the lawyer confirms it before the production release of phase 1 |
| Canonical UI primitives | pass | `CrudForm`/`DataTable` back office, Tailwind member pages, status variants |
| Every requirement has a phase, test and AC | pass | *Requirement Traceability* |
| Migrations and new module listed as Ask First | pass | *Ask First items*; module and migrations approved 2026-11-24 |
| Backward compatibility | pass | additive columns, routes and settings; settings schema gains one optional key |

Verdict: `Ready for implementation — the owner answered Q-O01…Q-O10 and approved the module and the migrations on 2026-11-24; the lawyer items of Q-O03 and Q-O06 block the production release of phases 4 and 1 (not building); V-O1 and V-O2 stay open as exit-gate checks of phases 3 and 2; the remaining Ask First items are asked before their phase.`

## Open Questions

Each question had a recommended default that the design above already assumes. The owner accepted every default on
2026-11-24 ([decision on #671](https://github.com/wladku/Vereino/issues/671#issuecomment-7123134361)). The lawyer items (Q-O03, Q-O06) do not block building; they block the
production release of phase 4 (public library) and phase 1 (medical date). V-O1 and V-O2 stay open as exit-gate checks.

| ID | Question | Owner | Blocking? | Resolution / decision date |
|---|---|---|---|---|
| Q-O01 | Who enters the medical date: (a) administrator + coordinator + guardian + adult self (recommended), (b) administrator and coordinator only, (c) guardian and adult self only? | Władek Kuć | phase 1 | decided 2026-11-24 — (a) administrator, coordinator, guardian and adult self |
| Q-O02 | Does a coach choose the visibility per outline within the club's level (recommended: yes, new outlines start at "club"), or does every published outline take the club's level? | Władek Kuć | phase 4 | decided 2026-11-24 — per outline within the club's level; new outlines start at "club" |
| Q-O03 | The licence and terms for shared outlines: CC BY-SA 4.0 (D-038 proposal) or CC BY 4.0; who signs the terms text (with the D-035 lawyer items)? | Władek Kuć | phase 4 | decided 2026-11-24 — CC BY-SA 4.0; ⚠ the lawyer confirms the licence and the terms text before the production release of phase 4 (with the D-035 lawyer items) |
| Q-O04 | Moderation: automatic hiding after reports from 3 clubs plus an operator CLI (recommended), pre-moderation of public outlines, or no hiding until an operator acts? | Władek Kuć | phase 4 | decided 2026-11-24 — automatic hiding after reports from 3 clubs, plus an operator CLI |
| Q-O05 | Does a red medical status block confirming a player for a match, or only warn (recommended: warn; the duty is the player's, and the club may hold a paper certificate)? | Władek Kuć | phase 1 | decided 2026-11-24 — warn, never block |
| Q-O06 | Legal basis for the date: explicit consent Art. 9(2)(a) (recommended) or another basis named by the lawyer? | Władek Kuć | phase 1 | decided 2026-11-24 — explicit consent, Art. 9(2)(a) GDPR; ⚠ the lawyer confirms the legal basis before the production release of phase 1 |
| Q-O07 | PDF: the print page with "Save as PDF" (recommended, no dependency) or a server-side PDF library (Ask First dependency)? | Władek Kuć | phase 2 | decided 2026-11-24 — the print page with "Save as PDF"; no PDF dependency |
| Q-O08 | When a club leaves Vereino, do its shared outlines stay in the library under the licence (credit "former club") or are they withdrawn (recommended)? | Władek Kuć | phase 4 | decided 2026-11-24 — withdrawn |
| Q-O09 | Do outlines, the PDF and the library go into a new module `training` (recommended, DD-O05) or into `activities`? | Władek Kuć | phase 2 | decided 2026-11-24 — new module `training` (DD-O05) |
| Q-O10 | Keep one spec with four independent phases (recommended; the issue asks for one spec and each phase is its own story with its own Ask First), or split into three specs: medical expiry, outlines with PDF and exports, and the shared library (the new cross-tenant architecture)? | Władek Kuć | no | decided 2026-11-24 — one spec with four independent phases |
| V-O1 | Check the export columns against PZPN's system with a certified club's administrator (the system has no import; the order of fields in its forms decides copying). | Władek Kuć | phase 3 | open — exit-gate check of phase 3 |
| V-O2 | Get a filled outline from a certified club and compare it with the print layout (the sample outlines in the PZPN programme are images; their field labels could not be read as text). | Władek Kuć | phase 2 | open — exit-gate check of phase 2 |

## Changelog

Each change is its own file in `.ai/specs/changelog/2026-11-23-vereino-training-outlines-and-medical-expiry/`
(`YYYY-MM-DD-<slug>.md`, one `| date | change |` row). Never add rows to this section.
