# Photos and graphics on club events, with the guardian's image consent

**Date**: 2026-11-26
**Status**: In progress — approved by the product owner on 2026-11-26 (#870 comment 7203995918: Q-I01–Q-I03 decided as recommended, the migrations of *Rollout* approved); the consent wording is under the lawyer's review (OA-I1) and may still change

> Design authority: `.ai/specs/product-brief.md` (refresh of 2026-11-26, PR #864) with D-044 (the club page stays a simple club card; only photos and graphics on club events), Q19 (closed 2026-11-26: Vereino collects each child's image consent from the guardian and blocks publishing without it), N06 (no page editor), D-029 (phone first for every role but the administrator) and D-035 (the lawyer items). This spec completes `.ai/specs/implemented/2026-11-18-vereino-club-events-with-parts.md` (REQ-T08, REQ-T09, DD-T10, DD-T11: the poster and funder logos of a club event) and `.ai/specs/implemented/2026-11-14-vereino-people-life-cycle-and-data-entry.md` (REQ-L10, DD-L11, DD-L12: the `image` consent and the consent texts). It does not edit their bodies. Ids carry the letter **I** (`REQ-I01`, `DD-I01`, `BR-I01`, `J-I01`, `TEST-I01`, `AC-I01`, `Q-I01`), which no other spec uses.

## TLDR

- Staff who manage a club event (the club administrator, the coordinator of its section) add up to 30 **pictures** to it from the phone or the panel: a **photo** that shows people, or a **graphic** (a drawing, a result board, or a photo in which no person can be recognised).
- On a photo, staff **mark every club member who can be recognised** with a picker of the club's people. They confirm that nobody else can be recognised. A photo that shows people from outside the club, such as a visiting team's children, is not published.
- A picture becomes public only when three things hold: staff published it, the club event is public (REQ-T09), and **every marked person's image consent is in force at the moment of the read**. For a minor, the consent comes from the guardians: at least one active guardian gave it, and no active guardian withdrew it. For an adult, it is the person's own consent. Publication is decided on every read, not stored, so a withdrawal hides the photo on the next read, within the 60-second public cache.
- The guardian gives, withdraws and sees the **history** of the image consent for each child on the phone (the ward page `/club/wards/[personId]`; an adult on M-10). Every decision is kept in a new append-only `people_consent_events` table, with the wording it was given to. Staff can no longer *grant* the image consent for someone, but they may still record a withdrawal.
- Pictures are private attachments in `activities`, with the metadata removed (GPS included). Unpublished pictures are streamed only to the event's managers, through a route that checks the manager. Pictures are deleted when staff delete them, with the club, and with the erasure of any person marked on them. Undo can never bring back a withdrawn consent or an erased picture (BR-I06, BR-I07).
- No new module and no new dependency. The work needs two migrations (`activities`, `people`) and one narrowing of a command; the owner approved all three on 2026-11-26 (*Rollout*). The consent wording is with the lawyer (D-035 items) and may still change before real club data.

## Problem Statement

- **What a club event shows today.** A public club event (P-T1, `/p/[clubSlug]/events/[eventSlug]`) shows one poster and up to 12 funder logos (DD-T10). After a tournament the club cannot show what happened. Clubs post these photos on Facebook today, and the first prospective club's coach asked whether the club page could replace Facebook (D-044 *Context*). Municipal grant reports also need photos as proof that a project took place (brief, *Grant settlement rules*).
- **No consent gate exists.** The `image` consent is already stored on every guardianship and on adults (`people_guardianships.consents`, `people_persons.consents`; REQ-L10). Today it only adds a "no image consent" flag on the coach's attendance list. Nothing connects it to publishing, because Vereino publishes no images of participants (life-cycle spec *Consents*, `image` row).
- **The stored consent cannot serve as proof.** A guardianship keeps only the last decision (`{ granted, at, by_person_id }`). The history exists only in the encrypted audit log, which a guardian cannot read and which must not be searched in SQL (lesson `action-log-columns-encrypted-at-rest`). GDPR Art. 7(1) requires the club to show that consent was given, and to which wording.
- **Staff can grant it today.** The administrator can set `image: true` on a guardianship through `people.guardianships.set_consents`. Q19 asks for consent collected *from the guardian*, so a consent typed in by staff cannot be what allows a child's photo to be published.
- **Who has the problem:** club staff who want to show an event (the coordinator at the pitch, on the phone; the administrator); guardians who decide about their child's image; the public who view the event page; and the club, which carries the legal risk (DPIA D-12: "a child's name or image is published without permission").

## Overview and Success Measures

- **Primary outcome:** after a club event, a coordinator publishes its photos from the phone in under 5 minutes for 10 photos. No photo of a club member is ever public without that person's image consent in force. A withdrawal removes the photo from the public page within 60 seconds.
- **Leading indicators:** the share of active wards whose image consent was given by a guardian (`people_consent_events`); the number of pictures per published club event; the number of photos kept back (blocked) because a consent is missing.
- **Baseline:** 0 pictures per event beyond the poster; no publishing gate. The share of wards with a guardian-given image consent is unknown. Consents imported or typed in by staff are not counted (BR-I04).
- **Market / product reference:**
  - **Adopted.** School and club apps (Klassly/Klassroom, Spond, ClassDojo) ask the parent once per child for photo consent and hide or blur a child without it. Photo platforms for schools (for example Pixevety) tag children on a photo and block sharing a tagged child without consent, re-checking at every share. Facebook groups and WhatsApp, the clubs' tools today, have no consent check at all.
  - **Rejected.** Automatic face recognition (Pixevety and Google Photos): it is biometric processing under GDPR Art. 9, it is out of scope (issue #870), and it would bring a new dependency. Blurring a child without consent instead of hiding the photo: it needs image processing (`sharp`, a new dependency; club events spec *Re-encoding images*), and a blurred child can still often be recognised by their kit and context.

## Goals

- **REQ-I01** — A manager of a club event (DD-T06: the club administrator, or the coordinator of the event's section) adds pictures to the event from the phone (`/club/club-events/[id]`) and the panel (B-T3 Files tab): JPEG, PNG or WebP, checked by their bytes, up to 10 MB each and up to 30 live pictures per event. Each picture is a **photo** (it shows people) or a **graphic** (no person can be recognised), and has a required description (2–200 characters) that serves as its alternative text.
- **REQ-I02** — When a picture is stored, its metadata is removed: EXIF (with GPS), XMP, IPTC and comments. Only the JPEG orientation is kept. The bytes are not re-encoded.
- **REQ-I03** — On a photo, the manager marks the people who can be recognised. The picker offers the active persons of the club, and first the participants of the event's parts. The manager then confirms "every recognisable person is marked, and nobody outside the club can be recognised". For a graphic, the manager confirms "no person can be recognised". The system records who confirmed and when. A photo cannot be published until at least one person is marked and the confirmation is given.
- **REQ-I04** — A manager publishes or withdraws each picture, one at a time or all at once. A new picture starts unpublished. Staff see each picture's state: *Draft*, *Public*, *Waiting for consent* (published, but held back by a missing consent; it names the marked people without consent) or *Event not public*. Picture states, marks and missing consents are returned only to the event's managers.
- **REQ-I05** — A guest sees a picture on the public event page (P-T1), in a gallery below the description, only while BR-I01 holds at the moment of the read. The JSON read and the file route apply the same check. A picture that fails it answers like an unknown file (404).
- **REQ-I06** — A guardian gives and withdraws the image consent for each ward on the phone, on the ward page `/club/wards/[personId]` (an adult does the same for themself on M-10). Before deciding, the guardian sees what the consent allows: the club's wording, the effect line, and the number of public photos that show the child now, each linking to its public event page. A withdrawal asks for confirmation.
- **REQ-I07** — A guardian, an adult for their own consent, and the club administrator see the **history** of a person's image consent: each decision with its date, who made it (a guardian, the person, or staff recording a withdrawal) and whether it was given to the current wording.
- **REQ-I08** — Only the person concerned or a guardian may *grant* the image consent. Staff may only record a *withdrawal* that a guardian or the person asked for (for example on paper or by phone). A guardian changes the image consent only on their own guardianship, never on the other guardian's (BR-I05). Undo never turns a withdrawn image consent back into a grant (BR-I06). Consents granted earlier by staff stay visible, but they do not allow publishing (BR-I04).
- **REQ-I09** — When a consent is withdrawn and a published photo of that person is held back as a result, the event's managers get one in-app notification per event, naming the event and the number of photos held back. The notification never names the person or says why.
- **REQ-I10** — Pictures are stored privately, never cached by shared caches for longer than the public pages (60 s), and deleted, with their bytes released after the commit, when staff delete them, when the club is deleted (`club_core delete-club`), and when any person marked on them is anonymised (`people.persons.anonymize`). Club events have no delete command (only cancel), so a cancelled event keeps its pictures under BR-I01.
- **REQ-I11** — Every change is audited: picture uploads, marks, confirmations, publications and deletions through the command log, and every consent decision through `people_consent_events`. A person's data export lists the photos they are marked on and their consent history.
- **REQ-I12** — The club page stays a simple club card (N06, D-044): no gallery on the club page, the section pages or P-06, no news, no editor. The P-06 card and the poster are unchanged.
- **REQ-I13** — Every new route has its cross-club probes (`route-isolation:check`, #628) and an integration test.

## Non-goals

- Face recognition, automatic tagging, or any processing of biometric data (issue #870 scope).
- Consent for anything other than images: the `regulations`, `trips`, `medical` and contact consents keep their current rules.
- Pictures anywhere other than the public club event page: no gallery on the club page, section pages, single sessions (`/p/[clubSlug]/s/[id]`), one-off activities, P-06 cards or member pages (D-044, N06).
- Blurring, cropping or re-encoding images (no `sharp`; club events spec *Re-encoding images*).
- Videos, albums, comments, likes, downloads in original resolution, or a member-only gallery.
- Showing unpublished photos to guardians, or asking guardians for consent with a photo attached (Q-I06).
- Upload by coaches who do not manage the event (Q-I05).
- Taking back copies that third parties saved while a photo was public. The consent wording says so.
- The consent wording itself: the lawyer writes it (D-035 lawyer items; owner action OA-I1).

## Proposed Solution

The two halves meet in one pure rule, BR-I01, which is evaluated on every read.

1. **The consent half (`people`, phase 1 = E30-S02 #871).** The `image` consent keeps its place on the guardianship and on the adult (one consent model, DD-L12). Three things change:
   - granting `image` becomes guardian-or-self only (REQ-I08);
   - each decision is also appended to a new `people_consent_events` table, which serves as proof and history (REQ-I07);
   - `people` exposes a new read in its person directory, `imagePublishable(personIds)`, which answers per person with BR-I01's consent part.

   The ward page and M-10 gain the history, the effect line with the count of public photos (through an optional contract that `activities` registers), and the confirmation sheet.
2. **The photo half (`activities`, phase 2 = E30-S03 #872).** Pictures are two new kinds, `photo` and `graphic`, of the existing club event files (DD-T10). They use the same upload route, byte check, attachments partition and public file streamer. A new link table `activities_club_event_file_people` holds the marks. The public read (`activities.publicEvents.clubEvent` / `clubEventFile`, DD-T11) filters pictures with BR-I01. It asks `people.imagePublishable` inside the found tenant, so no new system-scope lookup is added. A subscriber on the new event `people.consent.image_withdrawn` notifies the managers (REQ-I09). A subscriber on `people.person.anonymized` deletes the photos that marked the person (REQ-I10).

This closes each stated problem with the smallest platform-native surface:

| Problem | Closed by |
|---|---|
| Only a poster can be shown | `photo`/`graphic` kinds of the existing files |
| No consent gate | BR-I01, evaluated on every read |
| No proof or history | `people_consent_events` |
| Staff can grant consent | Grant is guardian-or-self only |

### Design Decisions and Alternatives

| Decision | Rationale | Alternative considered | Why rejected / deferred |
|---|---|---|---|
| **DD-I01** Publication is computed on every public read from the current consents (BR-I01); no stored "public" flag is maintained by jobs | A withdrawal takes effect on the next read; no job, queue or eventual consistency can leave a photo public after the consent is gone | A `visibility` column updated by a subscriber on consent changes | A missed or failed event would leave a child's photo public; rebuild logic for imports and undo |
| **DD-I02** Pictures are two new kinds, `photo` and `graphic`, of `activities_club_event_files`, with new nullable columns; marks live in a new link table | Same upload route, byte check, partition, file streamer and club-data handling as the poster (DD-T10, DD-T11); one public streamer | A separate `activities_club_event_pictures` table | Duplicates the upload, streaming and deletion paths for the same kind of record |
| **DD-I03** Marks are explicit, made by staff with a picker of club persons; the staff confirmation that nobody else is recognisable is recorded with author and time | Without face recognition only a person can tell who is in a photo; the confirmation puts that duty on a named person and makes it auditable | Face recognition; the club just asserts it holds consents (Q19 option a) | Biometric data and a new dependency (out of scope); Q19 chose (b), Vereino collects consent |
| **DD-I04** A photo with recognisable people from outside the club cannot be published (the confirmation excludes it) | Vereino cannot collect consent from another club's guardians; Q19 blocks publishing without consent | Let staff confirm they hold outside consents on paper | Reintroduces Q19 option (a) for exactly the children Vereino knows least about (Q-I03) |
| **DD-I05** A minor's image consent for publishing holds when at least one active guardian granted it and no active guardian's current decision is a withdrawal (a withdrawal by any guardian is a veto) | Publishing a child's image is a decision a single objecting parent should be able to stop; decided by the owner on 2026-11-26 (Q-I01) | The existing "most recent decision among guardians" rule of `effectiveConsents` | A parent who withdrew could be overruled silently by the other parent granting later |
| **DD-I06** Only grants made by a guardian of the ward or by the adult person count for publishing (`by_person_id`); staff may record a withdrawal only | Q19: consent collected *from the guardian*; earlier staff-entered grants have no proof of the guardian's will | Accept staff-entered grants with a "paper consent" checkbox | No evidence trail; reopens Q19 option (a) (Q-I02) |
| **DD-I07** An append-only `people_consent_events` row per consent decision (every kind, not only `image`), with the wording's `changedAt` and a SHA-256 of the wording shown | Proof under Art. 7(1) independent of the audit log's encryption and retention; the history read is a plain indexed query | Read the history from `action_logs` through the audit API | Encrypted columns, no guardian access to audit, audit retention is not a consent-proof retention |
| **DD-I08** Metadata is removed byte by byte at upload by a pure function in `@vereino/core` (JPEG APP1/APP13/COM segments except a minimal orientation tag; PNG `eXIf`/`tEXt`/`iTXt`/`zTXt`; WebP `EXIF`/`XMP ` chunks) | Phone photos carry GPS: where children train; no re-encoding dependency is needed | Re-encode with `sharp` | New dependency (Ask First), CPU cost; rejected by the club events spec |
| **DD-I09** Gallery only on the public club event page, below the description; the P-06 card is unchanged | D-044: the club page stays a club card; the event page is where the poster already is | A gallery on the club page or section pages | Rejected by D-044 and N06 |
| **DD-I10** The manager notification on a held-back photo names the event and a count, never the child; the names of marked people without consent appear only on the manager's picture sheet, for the pictures they marked | A person's consents stay out of general staff reads (TEST-L11); a manager needs to know why a picture they published is held back, and only for people they marked themselves | Name the child in the notification | Spreads the consent decision of one family to staff by push |
| **DD-I11** The public cache stays `public, s-maxage=60` for the event JSON; picture bytes are `private, no-store` | A withdrawal is honoured within one cache lifetime; bytes cannot outlive the JSON in a shared cache | `no-store` on everything | Every public page view hits the server; P-T1 is the page most likely to be shared |
| **DD-I12** Pictures are stored with the owner assignment only (no `assignments` on `createScoped`), deleting a picture is final (not undoable) and releases its bytes after the commit; staff open pictures through `GET …/files/{fileId}/content`, which checks the event manager | `releaseScoped` refuses a file with a second assignment (lesson `attachment-owner-assignment-and-release`); the platform route `/api/attachments/image/{id}` serves any file of the organization to any signed-in user, so it must never see a picture's id | Keep the poster's pattern (assignment + soft delete + undo) | Bytes could not be released, an undone delete or redone add could bring back a picture after an erasure, and any member could open an unpublished photo by id |
| **DD-I13** Undo and redo are made safe for consents and erasure instead of being disabled: an undo that would turn `image` from withdrawn to granted keeps it withdrawn (the rest is restored); an undo or redo of a picture command answers 409 `club_event_picture_erased` when the picture or a marked person was erased | The command log can be replayed by the administrator (`audit_logs.undo_tenant`); a replay must never undo a withdrawal or an erasure, as `people` already refuses to revive an anonymised ward's link (#308) | Make the consent commands not undoable | Undo of the other consent kinds and of guardianship edits is useful and already shipped |

## Domain Vocabulary and Business Rules

| Term / invariant | Precise meaning or rule | Source of truth | Failure behavior |
|---|---|---|---|
| Picture | A live `activities_club_event_files` row of kind `photo` or `graphic` | `activities` | — |
| Photo | A picture that shows at least one recognisable person; has ≥ 1 mark before it can be published | `activities_club_event_files.kind = 'photo'` | publish → 422 `club_event_photo_unmarked` |
| Graphic | A picture in which no person can be recognised (a drawing, a result board, a photo of an empty pitch or from behind at a distance) | `kind = 'graphic'` | marking a person on a graphic → 422 `club_event_graphic_has_no_people` |
| Mark | A link picture → person (a club person, never a free-text name) | `activities_club_event_file_people` | unknown or other-club person → 404 like an unknown id |
| People confirmation | `people_confirmed_at` + `people_confirmed_by_person_id`: the manager's statement for a photo ("every recognisable person is marked; nobody outside the club is recognisable") or for a graphic ("no person can be recognised"). Any change of marks clears it | `activities_club_event_files` | publish without it → 422 `club_event_people_unconfirmed` |
| Published | `published_at` set by a manager; staff's intention, not public visibility | `activities_club_event_files` | — |
| **BR-I01** Public picture | Public ⇔ (a) the club page and its `events` block are published and the club event is public with a live part (REQ-T09), (b) the picture is published and people-confirmed, (c) the picture is a graphic, or every marked person has `imagePublishable = true` now (BR-I02, BR-I03) | computed per read in `activities/lib/public-pictures.ts` (pure) | fails → absent from the JSON, 404 on the file route |
| **BR-I02** Image consent of a minor (publishing) | `true` ⇔ among the guardianships active today, at least one has `image.granted = true` with `by_person_id` = that guardianship's guardian, **and** none has `image.granted = false`. A withdrawal on a guardianship is lifted only by that guardianship's own guardian (BR-I05) | `people_guardianships.consents` via `people/lib/image-consent.ts` (pure) | no active guardianship → `false` |
| **BR-I03** Image consent of an adult (publishing) | `true` ⇔ `people_persons.consents.image.granted = true` with `by_person_id` = the person, or a carried-over grant. At the 18th birthday the carry-over (DD-L08) copies `image` with the BR-I02 rule instead of the latest decision: granted only when BR-I02 held on the last day of the guardianships, recorded with `by_person_id` = the granting guardian and `by_role = system` in the consent event | `people_persons.consents` | no decision → `false` |
| **BR-I04** Grant author | A grant counts only when `by_person_id` names the guardian of that guardianship (BR-I02) or the person (BR-I03). Staff grants made before phase 1 stay stored and shown as "recorded by staff", and count as not given for publishing | `by_person_id` | — |
| **BR-I05** Who may change `image` | Grant: only the guardian of that guardianship row (`guardian_person_id` = the caller), or the adult person. A guardian never changes `image` on the other guardian's row (403 `scope_denied`). Withdraw: also the club administrator, on the guardian's or person's request, with a required note (2–200 characters, encrypted). The same rule applies wherever consents are written: `set_consents`, `set_own_consents`, `guardianships.create` and `guardianships.update` (both accept consents today) | `people.guardianships.set_consents`, `people.persons.set_own_consents`, `people.guardianships.create`, `people.guardianships.update` | staff grant → 422 `image_consent_subject_only`; another guardian's row → 403 |
| **BR-I06** Undo keeps a withdrawal | The undo of `set_consents`, `set_own_consents`, `guardianships.update` and `guardianships.end` restores its snapshot, except that `image` stays withdrawn when the current value is withdrawn and the snapshot holds a grant. The undo appends a consent event only when it changes something | `people/lib/people-rules.ts` (pure, `restoreConsentsKeepingWithdrawals`) | — |
| **BR-I07** Erasure is final for pictures | Erasing a person deletes every picture that marks them, including soft-deleted ones, and records the picture ids in a tombstone list on the erasure's audit entry. Undo or redo of `add`, `set_people`, `publish` or `unpublish` for such a picture answers 409 `club_event_picture_erased` | `activities` commands | 409 |
| Consent event | An append-only row per changed consent kind: who, for whom, through which guardianship, granted or withdrawn, when, the wording's `changedAt` (null = the built-in text) and the SHA-256 of the text shown | `people_consent_events` | the `foundation` append-only guard refuses update and delete except the erasure |
| Picture limits | JPEG, PNG or WebP by bytes (`checkFileBytes`); ≤ 10 MB; ≤ 30 live pictures per event; description 2–200 characters | `activities` | 422 `club_event_file_too_large`, `club_event_file_format_unsupported`, `club_event_pictures_limit`, `club_event_picture_description_invalid` |
| Order | Pictures are shown in `position` order (upload order; a manager can move one up or down) | `position` | 409 version on a stale move |
| Erasure | Anonymising a person deletes, in the erasure's transaction through the departure contributor, every picture that marks them (live or soft-deleted) and their marks, and deletes their consent events (`nativeDelete`, because the append-only guard has no exception). The bytes are released after the commit, as `people` releases a person's photo files (`releasePhotoFiles`) | `people.departure.activities` (`erase`), `people.persons.anonymize` | the erasure fails as a whole (existing behavior); a failed release is logged and retried by the next erasure sweep |
| Leaving | A person who leaves keeps their consents, but has no active guardianship as a ward, so BR-I02 is false and their photos stop being public | computed | — |

## Users, Permissions, and Scope

| Actor | Allowed outcomes | Scope rule | Required feature IDs |
|---|---|---|---|
| Guardian | Give/withdraw `image` for a ward; see the ward's history and the count of public photos with links | own active guardianships | `people.self` |
| Adult person (18+) | The same for themself | self | `people.self` |
| Club administrator | Manage pictures of every club event; record a withdrawal for anyone; see any person's image consent history | club | `activities.manage` (club events, existing DD-T06 guard), `people.manage` |
| Section coordinator | Manage pictures of the club events of their sections; on a picture they manage, see which marked people lack consent (BR-I01 reason), never their history. Other coordinators who can read the event (`activities.view`, club-wide coordinator read) get no `pictures[]` | section grant (`clubEventManagerRole`) | existing club-event management features |
| Coach, other staff | No change (Q-I05) | — | — |
| Guest (no session) | View public pictures of a public club event | the club found by its public slug (DD-35 lookup, D-024), then the found tenant and organization only | none |

`tenantId` and `organizationId` come from the authenticated principal (`trustedScopeOf`) on every member and panel route, and from the one approved public-slug lookup on the public routes. The public read calls `people.imagePublishable` with the found scope, never one from the request. No new system-scope operation is added.

## Reuse and Ownership Map

| Capability | Reuse / extend / app-own | Existing module or new module | Integration seam | Why |
|---|---|---|---|---|
| Picture storage, byte check, streaming | reuse | `activities` club event files (DD-T10), platform `attachments`, `@vereino/core` `checkFileBytes`, `club_core` `fileResponse` | `attachmentService` (`readUploadForm`, `persistLink`, `readScoped`, `releaseScoped`) | One file pattern |
| Metadata removal | app-own (pure) | `@vereino/core` `stripImageMetadata` | function | Framework-free byte logic used by `activities` and by `people` photos later |
| Marks | app-own | `activities` (new link table) | person ids only (no ORM relation to `people`) | Cross-module rule: ids and snapshots |
| Person picker | reuse | `people` person directory `searchPersonIds`, `findPersons` | existing `activities/services/directory.ts` | No new picker contract |
| Consent state for publishing | extend | `people` person directory: new `imagePublishable(scope, ids, today, em?)` | optional DI contract | `activities` never reads `people` tables |
| Consent history | app-own | `people` (new table) | — | DD-I07 |
| Public photo count on the ward page | extend | `activities` registers `people.imageUsage.activities` (optional) | `hasRegistration` | `people` never imports `activities` |
| Public page | extend | `club_core` P-T1 view, `activities.publicEvents` | existing optional methods `clubEvent`, `clubEventFile` | DD-T11 |
| Notifications | reuse | platform `notifications` | the module's notification types | — |
| Club deletion / export | reuse | `club_core.clubDelete.activities`, `club_core.clubExport.activities`, `…people` | contributor table lists | DD-M09 |
| Person data export | extend | `people` export + `activities` data export contribution | existing contributions | REQ-I11 |

The installed sources of truth stay as they are: persons and guardianships in `people`, club events in `activities`, files in `attachments`, the public frame in `club_core`, and notifications in the platform's `notifications`.

## Architecture and Data Flow

```text
Manager (phone/panel) -> POST /api/activities/club-events/{id}/files (kind photo|graphic) -> activities.club_event_files.add
                           (checkFileBytes -> stripImageMetadata -> attachments.persistLink)
                      -> PUT  …/files/{fileId}/people   -> activities.club_event_files.set_people   (marks + confirmation)
                      -> POST …/files/{fileId}/publish|unpublish, …/files/publish-all -> activities.club_event_files.publish|unpublish
Guest -> GET /api/club_core/public/{clubSlug}/events/{eventSlug}       -> activities.publicEvents.clubEvent()
                                                                        -> people.imagePublishable(found scope, marked ids)
                                                                        -> BR-I01 filter -> gallery[]
      -> GET …/events/{eventSlug}/files/{fileId}                         -> clubEventFile() (same BR-I01) -> fileResponse (no-store)
Guardian (ward page) -> POST /api/people/guardianships/{id}/consents (existing) -> people.guardianships.set_consents
                                                                     -> people_consent_events (append, same tx)
                                                                     -> after commit: people.consent.image_withdrawn
                                                                           -> activities subscriber -> notify managers (REQ-I09)
              -> GET /api/people/me/consents/{personId}/image-history -> people_consent_events
                                                                      -> people.imageUsage.activities (count + links)
Manager -> GET …/files/{fileId}/content (manager check) -> attachments.readScoped   (staff view; never /api/attachments/image)
Administrator -> people.persons.anonymize -> people.departure.activities.erase -> delete marked pictures; release bytes after commit
```

- **Module boundaries:** no new module. `activities` owns pictures and marks, because they are files of its club events and are deleted with them. `people` owns consents and their history. `club_core` owns the public frame and the streamer. Calls cross modules only through the optional DI contracts named above. No module imports another module's entities.
- **Extension points:** the existing optional contribution `activities.publicEvents` (`club_core/services/public-blocks.ts`); the `people` person directory; the departure contributor `people.departure.activities`; a new optional token `people.imageUsage.activities`; the platform `notifications`.
- **Alternatives considered:** a new `media` module, rejected because it would hold a single table whose lifecycle is the club event's (see also DD-I02); and a stored visibility flag, rejected by DD-I01.
- **Compatibility:**
  - **Additive:**
    - the new kinds, columns and table in `activities`;
    - the new table in `people`;
    - the new routes and error codes;
    - the new directory method and optional token;
    - the new event `people.consent.image_withdrawn`;
    - the optional field `pictures` on the P-T1 response and on the B-T3 / phone event read.
  - **Contract narrowing, approved by the owner on 2026-11-26 (Q-I02; BC §2, §3):** `people.guardianships.set_consents`, `people.guardianships.create|update` and `POST /api/people/persons/{id}/consents` refuse a *grant* of `image` by anyone other than the guardian of that row or the person (422 `image_consent_subject_only`, as `medical` does today), and a guardian's change of `image` on the other guardian's row (403). Staff can still withdraw. The undo of those commands keeps a withdrawal (BR-I06). The coach's attendance flag `consentFlags.image` switches to the same rule as `imagePublishable`, so "no image consent" means the same thing everywhere. No external consumer exists (`BACKWARD_COMPATIBILITY.md`: no shared environment is deployed). The change lands in one PR together with its only UI consumer, `GuardianshipsPanel.tsx`.

## User Journeys

The example is the club events spec's tournament: LKS Przykład Dolina, "PRZYKŁAD CUP 2026". Rafał Malinowski coordinates the section; Joanna Wiśniewska is the club administrator; Kasia Nowak is the guardian of Jaś (Orlik młodszy); Tomek Nowak is Jaś's second guardian.

### Journey J-I01 — A guardian gives the image consent (phase 1)

1. Kasia opens Jaś's ward page (`/club/wards/{personId}`) on her phone. Under "Consents", the image consent reads "Not given". She sees the club's wording, the effect line "Photos showing Jaś on the club's event pages are public only while this consent is given", and "0 public photos".
2. She switches it on. The sheet repeats the wording and saves it. The history now shows "Given by Kasia Nowak · 26.11.2026 14:02 · current wording".
3. Failure: a stale profile answers 409 and the page reloads. Tomek can do the same on his own phone. When the administrator tries to grant it in the panel, the switch is disabled with "Only a guardian can give this consent", and the API answers 422 `image_consent_subject_only`.

### Journey J-I02 — The coordinator publishes photos after the tournament (phase 2)

1. On `/club/club-events/{id}`, Rafał taps **Add photos** in the Pictures block and picks 8 photos from the camera roll. Each one uploads with a progress bar, and the metadata is removed on the server.
2. For each photo he types a short description and taps **Who is in the photo?**. The picker lists the participants of the event's parts first; he marks Jaś and two teammates. He ticks "Everyone recognisable is marked and nobody from outside the club is recognisable". One photo shows the result board: he sets it as a **Graphic** and confirms "No person can be recognised".
3. He taps **Publish all**. Six pictures read *Public*. Two read *Waiting for consent — 1 person without consent* (one marked teammate's guardians have not decided). One photo also shows a visiting team's goalkeeper, so he leaves it unconfirmed and deletes it.
4. Failures: a 12 MB photo answers 422 `club_event_file_too_large`; the 31st picture answers 422 `club_event_pictures_limit`; publishing an unconfirmed photo answers 422 `club_event_people_unconfirmed`; a stale picture answers 409 with the shared conflict message.

### Journey J-I03 — A visitor sees the gallery (phase 2)

1. A parent opens `/p/przyklad/events/przyklad-cup-2026`. Below the description there is a gallery of 6 pictures with their descriptions as alternative text. Tapping a picture opens it at full width with Previous and Next, and Escape closes it.
2. The two held-back photos are not in the page, and their file URLs answer 404.

### Journey J-I04 — Tomek withdraws the consent (phases 1–2)

1. Tomek opens Jaś's ward page and sees "3 public photos" with links. He switches the image consent off and confirms "The photos will disappear from the club's pages within a minute. Copies that someone already saved cannot be taken back."
2. On the next read, the three photos that mark Jaś leave the public page (BR-I02 veto), even though Kasia's grant stands. Rafał and Joanna get one notification: "PRZYKŁAD CUP 2026: 3 photos were held back after a consent change."
3. In the panel those photos read *Waiting for consent — 1 person without consent*. The history shows both decisions. If Tomek gives the consent again, the photos return without anyone republishing them.

### Journey J-I05 — Erasure (phase 2)

1. Joanna anonymises a former participant on a recorded erasure request. In the same transaction, every picture that marks the person is deleted and its bytes released, and the person's consent events are deleted. The erasure's audit entry lists the number of pictures deleted.

## UI and Interaction Contracts

Closest installed references:
- the Files tab of B-T3 (`activities` club event record, built on `PlaceFilesPanel.tsx`);
- the phone event page `/club/club-events/[id]` (`ClubSessionPage.tsx` patterns);
- the ward page `ClubWardPage.tsx` and M-10 `ClubProfilePage.tsx` with `ConsentList.tsx`;
- P-T1 in `PublicEventsView.tsx`;
- `.ai/guides/backend-ui.md`.

All texts come from the `activities`, `people` and `club_core` i18n catalogs, in `en` and `pl`.

| Surface / route | Purpose and primary actions | Data source / mutations | Closest installed reference | Canonical shell / components | Required states | Requirement IDs |
|---|---|---|---|---|---|---|
| `/club/wards/[personId]` (ward consents) and M-10 `/club/profile` (an adult's own consents) (changed) | Image consent row: wording, effect line, "{n} public photos" with links, history disclosure; withdrawal confirmation sheet | `GET /api/people/me` (adds `imagePublishable` per ward and for self), `POST /api/people/guardianships/{id}/consents` (existing), `PUT /api/people/me/consents` (existing), `GET /api/people/me/consents/{personId}/image-history` (new) | `ClubWardPage.tsx`, `ConsentList.tsx` | `MemberShell`, `ConsentToggle` (`@vereino/ui`, new shared primitive, #857), `Card`, bottom sheet, `StatusBadge` (status variants only) | loading, error with retry, 409 version, saved toast, empty history ("No decision yet") | REQ-I06, REQ-I07, REQ-I08 |
| B-10 `/backend/people/persons/[id]?tab=guardians` (changed) | Image consent: grant switch disabled for staff with an explanation; **Record withdrawal** with a note; **History** dialog | `POST /api/people/guardianships/{id}/consents` (existing, narrowed), `GET /api/people/persons/{id}/consents/image-history` (new) | `GuardianshipsPanel.tsx` | `Dialog`, `DataTable` (history), `CrudForm` field for the note | loading, empty history, 422 subject-only, 409 version | REQ-I07, REQ-I08 |
| `/club/club-events/[id]` — Pictures block (changed) | **Add photos** (camera or files, several at once), per picture: description, **Who is in the photo?** (picker sheet), photo/graphic switch, confirmation, Publish/Unpublish, Move up/down, Delete; **Publish all** | `POST/DELETE …/{id}/files`, `PUT …/files/{fileId}`, `PUT …/files/{fileId}/people`, `POST …/files/{fileId}/publish|unpublish`, `POST …/files/publish-all`, people options from `GET /api/activities/club-events/{id}/people-options` (new, scoped) | the existing files block of the phone page | member page, bottom sheets, `useConfirmDialog`, upload progress, `StatusBadge` | loading, empty ("No pictures yet — add the first"), upload progress and per-file 422, 409 with refresh, state badges Draft / Public / Waiting for consent / Event not public | REQ-I01–REQ-I04 |
| B-T3 `/backend/activities/club-events/[id]?tab=files` (changed) | The same as the phone block, as a `DataTable` of pictures (thumbnail, description, kind, people count, state, actions) and a mark dialog | the same routes | `PlaceFilesPanel.tsx`, `RowActions` | `DataTable`, `Dialog`, `LookupSelect` (multi) for people | as above + bulk selection publish/unpublish | REQ-I01–REQ-I04 |
| P-T1 `/p/[clubSlug]/events/[eventSlug]` (changed) | Gallery below the description: grid of thumbnails, full-width viewer with Previous/Next | `GET /api/club_core/public/{clubSlug}/events/{eventSlug}` (`pictures[]`), `…/files/{fileId}` | `PublicEventsView.tsx` | `PublicFrame`, native `<img loading="lazy">`, `Dialog` viewer | no pictures → no gallery section; broken image → hidden tile | REQ-I05, REQ-I12 |

### UI architecture

| Role | Navigation groups in order | Dashboard / injected widgets | Login-to-primary-task flow |
|---|---|---|---|
| Guardian | Profile → ward page | none | Profile → ward → image consent switch: 2 taps |
| Coordinator | Club events (existing) | none | Club events → event → Add photos: 3 taps |
| Administrator | Panel: Activities → Club events → Files tab | notification bell (REQ-I09) | notification → event Files tab: 1 click |
| Guest | public menu Club · Sections · Facilities · Events | — | Events → card → event page gallery |

| Surface / widget | Empty state guidance and action | Responsive behavior | Keyboard / focus behavior |
|---|---|---|---|
| Pictures block (phone) | "No pictures yet. Add photos from the event; a photo becomes public only with the consent of everyone marked on it." + **Add photos** | one column at 375 px; thumbnails 2 per row | picker sheet traps focus; state changes announced in a polite live region |
| Gallery (P-T1) | section absent | 2 columns at 375 px, 4 from 768 px | viewer: arrow keys, Escape closes and returns focus to the tile |
| Image consent row (ward page, M-10) | "No decision yet" | full width | switch has an accessible name with the child's name; confirmation sheet focuses its primary action |

### `/club/club-events/[id]` — Pictures block

```text
┌──────────────────────────────────────┐
│ Pictures (6/30)            [Add photos]│
│ ┌──────┐ Final, Orlik młodszy          │
│ │ img  │ Photo · 3 people · ● Public   │
│ └──────┘                          [⋯]  │
│ ┌──────┐ Result board                  │
│ │ img  │ Graphic · ● Public       [⋯]  │
│ └──────┘                               │
│ ┌──────┐ Warm-up                       │
│ │ img  │ Photo · 4 people              │
│ └──────┘ ◐ Waiting for consent (1) [⋯] │
│                         [Publish all]  │
└──────────────────────────────────────┘
⋯ → Edit description · Who is in the photo? · Publish/Unpublish · Move up · Move down · Delete
```

- **Behavior:**
  - Adding several files uploads them one by one with a progress bar for each; a failed file shows its error and the others continue.
  - Changing the marks clears the confirmation, and a published photo shows *Waiting for confirmation* until it is confirmed again.
  - "Waiting for consent (n)" opens a sheet listing the marked people without consent, by name, visible to managers only.
  - Delete asks for confirmation and is final: the bytes are released (DD-I12).
- **Responsive and accessibility:** works at 375 px. Every thumbnail has its description as alternative text. Status is shown with a status variant and text, never by colour alone.
- **Localization:** `activities.clubEvents.pictures.*`, `people.consents.image.*`, `club_core.public.event.gallery.*`.
- **Design system and theming:** semantic tokens only. Check light and dark modes. No `brand` variant on text.

### `/club/wards/[personId]` — image consent row

```text
┌──────────────────────────────────────┐
│ Jaś — consents                        │
│ Image                         [ ◯ ]   │
│ Photos showing Jaś on the club's      │
│ event pages are public only while     │
│ this consent is given. 0 public photos│
│ ▸ Wording   ▸ History                  │
└──────────────────────────────────────┘
History: Given · Kasia Nowak · 26.11.2026 14:02 · current wording
         Withdrawn · Tomek Nowak · 27.11.2026 09:15
```

## Data Models

### `activities_club_event_files` (changed, migration in `activities`)

| Field | Type / nullability | Scope / index | Sensitive / encrypted | Lifecycle and validation |
|---|---|---|---|---|
| `kind` | varchar(16) | existing `org_event_kind_idx` | no | adds `photo`, `graphic` to `poster`, `funder_logo` |
| `description` | text, null | — | no | required (2–200) for `photo`/`graphic`, null otherwise (check constraint); alternative text |
| `people_confirmed_at` | timestamptz, null | — | no | set by the confirmation, cleared by a mark change |
| `people_confirmed_by_person_id` | uuid, null | — | no | the confirming manager |
| `published_at` | timestamptz, null | partial index `(organization_id, club_event_id) where kind in ('photo','graphic') and published_at is not null and deleted_at is null` | no | set by publish, cleared by unpublish |
| `published_by_person_id` | uuid, null | — | no | — |
| `updated_at` | timestamptz (existing) | — | no | the optimistic lock of every picture change |

Check constraints: `(kind in ('photo','graphic')) = (description is not null)`. The existing `funder_name` check stays. The limit of 30 is checked by the command under the club event's row lock. Pictures are stored with the owner assignment only (DD-I12); the poster and logos keep their pattern.

### `activities_club_event_file_people` (new, migration in `activities`)

| Field | Type / nullability | Scope / index | Sensitive / encrypted | Lifecycle and validation |
|---|---|---|---|---|
| `id` | uuid | primary key | no | immutable |
| `tenant_id` / `organization_id` | uuid | `(tenant_id, organization_id)` | no | trusted scope |
| `file_id` | uuid | unique `(file_id, person_id)`; index `(organization_id, person_id)` | no | the picture |
| `person_id` | uuid | see above | personal data (the link says a person is in a photo); not encrypted, never shown publicly | the person must be in the club's scope at marking time |
| `created_at`, `created_by_person_id` | | | | rows are replaced as a set by `set_people`; no soft delete (the command log keeps the before set for undo) |

### `people_consent_events` (new, migration in `people`)

| Field | Type / nullability | Scope / index | Sensitive / encrypted | Lifecycle and validation |
|---|---|---|---|---|
| `id` | uuid | primary key | no | immutable |
| `tenant_id` / `organization_id` | uuid | `(tenant_id, organization_id)` | no | trusted scope |
| `subject_person_id` | uuid | `(organization_id, subject_person_id, kind, created_at desc)` | no | the ward or the adult |
| `guardianship_id` | uuid, null | — | no | null for an own consent |
| `kind` | varchar(24) | — | no | a `CONSENT_KINDS` value |
| `granted` | boolean | — | no | — |
| `by_person_id` | uuid, null | — | no | null = system (carry-over at 18) |
| `by_role` | varchar(16) | — | no | `guardian`, `self`, `club_admin`, `system` |
| `note` | text, null | — | **encrypted** (tenant key) | required for a staff withdrawal (BR-I05) |
| `wording_changed_at` | timestamptz, null | — | no | the club text's `changedAt` at the decision; null = built-in text |
| `wording_sha256` | char(64) | — | no | hash of the exact text shown, in the decision's locale |
| `locale` | varchar(8) | — | no | — |
| `created_at` | timestamptz | — | no | append-only: the `foundation` append-only guard refuses update and delete, except the erasure command's delete |

The decision is written in the same transaction as the consent change by every command that changes consents: `set_consents`, `set_own_consents`, `guardianships.create`, `guardianships.update`, and the carry-over at 18. An undo that changes a consent appends a correcting event (`by_role` of the undoing actor; BR-I06); it never deletes one. Only the erasure deletes rows, with `nativeDelete`. The club export archive (`club_core export-club`) includes the table, with the note encrypted as stored. No backfill is done. History starts at phase 1. A consent stored before that shows "decided before history was kept · {at}" as its first history line, taken from the stored entry.

## API, Command, and Error Contracts

| Method / command | Path / ID | Auth and feature gate | Input | Success response / event | Errors and concurrency | Requirement IDs |
|---|---|---|---|---|---|---|
| `POST` / `people.guardianships.set_consents` (narrowed) | `/api/people/guardianships/{id}/consents` (existing; the guardian's ward page and B-10 call it) | auth + `people.self`; a guardian of the ward or the club administrator (as today) | `{ consents, note? }` (today's body plus `note`), lock token in the optimistic-lock header as today | 200 consents; appends `people_consent_events`; after commit `people.consent.image_withdrawn` when `image` went to false | 422 `image_consent_subject_only` (staff grant), 422 `consent_note_required` (staff withdrawal without note), 403 `scope_denied` (another guardian's row), 409 version | REQ-I06, REQ-I08 |
| `PUT` / `POST` — `people.persons.set_own_consents` (narrowed) | `PUT /api/people/me/consents`, `POST /api/people/persons/{id}/consents` | as today | as today + `note?` | as above | as above | REQ-I08 |
| `GET` | `/api/people/me/consents/{personId}/image-history` (new) | auth + `people.self`; self or ward of an active guardianship | — | `{ items: [{ granted, at, byName, byRole, currentWording }], total, page, pageSize, totalPages }` + `publicPhotos: { count, events: [{ name, url }] }` | 404 | REQ-I06, REQ-I07 |
| `GET` | `/api/people/persons/{id}/consents/image-history` (new) | auth + `people.manage` | page | same list (no `publicPhotos`) | 404 | REQ-I07 |
| `POST` / `activities.club_event_files.add` (extended) | `/api/activities/club-events/{id}/files` | event manager (DD-T06) | multipart `kind=photo|graphic`, `description`, file | 201 file record (`state: draft`) | 422 file codes, `club_event_pictures_limit`, `club_event_picture_description_invalid`; 404 | REQ-I01, REQ-I02 |
| `PUT` / `activities.club_event_files.update` (new) | `/api/activities/club-events/{id}/files/{fileId}` | event manager | `{ description?, kind?, position? }`, lock token in the optimistic-lock header | 200 | 422; 409 version; changing kind clears marks and confirmation | REQ-I01, REQ-I04 |
| `PUT` / `activities.club_event_files.set_people` (new, undoable) | `…/files/{fileId}/people` | event manager | `{ personIds: uuid[] (≤ 60), confirmed: boolean }`, lock header | 200 with marks, confirmation and `missingConsentCount` | 422 `club_event_graphic_has_no_people`, `club_event_photo_unmarked` (confirmed photo without marks); 404 unknown person; 409 | REQ-I03 |
| `POST` / `activities.club_event_files.publish` / `unpublish` (new, undoable) | `…/files/{fileId}/publish`, `…/unpublish`, `…/files/publish-all` | event manager | lock header / `{}` | 200 with states; `publish-all` publishes every confirmed draft and reports skipped ones | 422 `club_event_people_unconfirmed`; 409 | REQ-I04 |
| `DELETE` / `activities.club_event_files.delete` (existing, extended to pictures) | `…/files/{fileId}` | event manager | — | 204; for a picture final (not undoable), bytes released after commit (DD-I12) | 409 | REQ-I10 |
| `GET` | `/api/activities/club-events/{id}/files/{fileId}/content` (new) | event manager | — | bytes, `private, no-store`, `nosniff` | 404 for non-managers and unknown ids | REQ-I04 |
| `GET` | `/api/activities/club-events/{id}/people-options?q=` (new) | event manager | search term | `{ items: [{ id, displayName, isParticipant }], … }` participants first | 404 | REQ-I03 |
| `GET` (extended) | `/api/activities/club-events/{id}` | as today (`activities.view`) | — | adds `pictures[]` (`id`, `description`, `kind`, `state`, `marks`, `missingConsentCount`, content URL; never an attachment id) only when the caller manages the event (`clubEventManagerRole`); absent otherwise | — | REQ-I04 |
| `GET` (extended) | `/api/club_core/public/{clubSlug}/events/{eventSlug}` | none | — | adds optional `pictures: [{ id, description, kind, url }]` (BR-I01 only) | 404 as today | REQ-I05 |
| `GET` (extended) | `/api/club_core/public/{clubSlug}/events/{eventSlug}/files/{fileId}` | none | — | bytes, `Cache-Control: private, no-store`, `nosniff` for pictures | 404 when BR-I01 fails | REQ-I05, REQ-I10 |

Every route is a custom guarded command route (as are the existing club-event file routes). Each has per-method `metadata` and `openApi`, and business error codes in the module's `lib/error-codes.ts`. Every new route or method gets its probes in `_fixtures/isolation/inventory/activities.json` and `people.json`; a club B id answers 404.

## Events, Jobs, Notifications, and Cross-Module Flows

| Trigger | Producer | Consumer | Side effect | Retry / idempotency / audit behavior |
|---|---|---|---|---|
| `people.consent.image_withdrawn` `{ tenantId, organizationId, subjectPersonId, consentEventId }` (new, after commit) | `people` | `activities` subscriber | Finds published pictures that mark the person and now fail BR-I01; one notification per club event to its managers (REQ-I09) | Idempotent per (club event id, `consentEventId`) as the notification's dedupe key; a failure leaves no public photo (DD-I01), only a missing notice |
| `people.persons.anonymize` | `people` | `people.departure.activities` `erase` (in the transaction) | Pictures marking the person deleted (live and soft-deleted), marks and consent events deleted; bytes released after the commit | Erasure is atomic; the audit entry lists the picture ids (tombstone for BR-I07) |
| `club_core delete-club` | `club_core` | `club_core.clubDelete.activities`, `…people` lists | the new tables join the lists; attachments go with the tenant | as today |

No new scheduled job. The `notifications` type `activities.club_event.pictures_held_back` is localized and links to the event's Files tab (panel) or the phone page.

## Security, Privacy, and Compliance

- **Authorization:** management uses `clubEventManagerRole` (DD-T06) on every picture command. The consent routes use the guardianship guard and `people.manage`. There are no role-name checks.
- **Tenant isolation:**
  - Every read and write is scoped by the trusted tenant and organization.
  - Marks accept only persons that `findPersons` returns in the caller's scope.
  - The public read narrows to the found club before it calls `imagePublishable`.
  - A club B picture or person id answers 404 (TEST-I09).
- **Legal basis:** image publication rests on Art. 6(1)(a) GDPR, consent; Polish copyright law Art. 81 also requires permission to disseminate an image. Consent is given by the guardian for a minor and by the person for an adult. Who must consent for a 13–17-year-old is a question for the lawyer (Q-I04).
- **Children:** the rules are fail-closed. No decision means no publication. One guardian's withdrawal is a veto. A photo with recognisable outsiders cannot be published. Names are never published: the alternative text is the staff description, never the marked names.
- **Metadata:** GPS and the device data are removed before storage (REQ-I02). Original bytes are never kept.
- **Caching:** the bytes are sent with `private, no-store`; the JSON with `s-maxage=60`. A withdrawal is honoured within 60 s.
- **Unpublished pictures:** only the event's managers can open them, through `…/files/{fileId}/content`, which runs the manager check. No response carries a picture's attachment id, so the platform route `/api/attachments/image/{id}` (any signed-in user of the organization) is never given one. The public route answers 404.
- **Encryption:** the staff withdrawal note is encrypted. Marks, consent events and picture descriptions hold no free text about the child, beyond the description staff write; the UI warns "Do not write children's names".
- **Retention (`docs/compliance/retention.md`, new row R23):** a picture is kept until staff delete it, the club is deleted, or a marked person is anonymised. Consent events are kept until the person is anonymised or the club is deleted (Q-I07).
- **Compliance pack, changed in phase 2:**
  - `ropa.md` A2 adds `people_consent_events`;
  - a new activity A18 "Event photos" (Art. 6(1)(a), categories, recipients: the public);
  - `dpia.md` D-12 is updated to this design, and a new row D-13 covers "a photo shows a recognisable child of another club";
  - `data-subject-requests.md` gains the export of marks and consent history.
- **Abuse and failure modes:**
  - File route enumeration answers 404, the same as for unknown ids.
  - A fake image (an SVG renamed `.png`) answers 422 from the byte check.
  - A huge upload is refused at the size limit before it is parsed.
  - Concurrent mark and publish requests are serialised by `updatedAt`.
  - Withdrawal races: the read rule decides at read time, so the order of events cannot leave a photo public.
  - Replays: undo never restores a withdrawn image consent (BR-I06) or an erased picture (BR-I07); one guardian cannot lift the other's withdrawal (BR-I05).
- **Owner action OA-I1 (D-035 lawyer items):** before real club data, the lawyer writes or approves:
  - the `image` consent wording (pl, en);
  - the effect line;
  - the withdrawal note;
  - the confirmation texts for marking people (REQ-I03).

  The owner sent the consent text to the lawyer on 2026-11-26; the wording may still change, so phase 1 keeps every one of these texts in the i18n catalogs (no wording in code or tests: tests read them through `uiText`). The owner decided Q-I01 and Q-I03 (2026-11-26); the lawyer still answers Q-I04 and Q-I07 and may ask to revisit Q-I01 or Q-I03, which would be a spec change. Until the review ends the built-in texts are marked as drafts in the catalogs, and `docs/compliance/legal-verification.md` lists them.

## Integration Coverage

| Test ID | Level | Setup / fixture | Actions | Assertions | Requirement IDs |
|---|---|---|---|---|---|
| TEST-I01 | integration + UI (phone) | a ward with two guardians; club texts | guardian 1 grants `image` on the ward page; reads history; guardian 2 withdraws | consents stored; two `people_consent_events` with wording hash; history lists both; `imagePublishable` false (veto) | REQ-I06, REQ-I07 |
| TEST-I02 | integration | administrator; a ward with two guardians | the administrator grants `image` (set_consents and guardianships.update) and withdraws without and with a note; guardian 1 posts `image: true` to guardian 2's row; guardian 2 withdraws, the administrator undoes that withdrawal | 422 `image_consent_subject_only`; 422 `consent_note_required`; withdrawal stored with `by_role = club_admin` and encrypted note; 403 on the other row; after the undo `image` stays withdrawn and `imagePublishable` stays false | REQ-I08 |
| TEST-I03 | unit (pure) | — | `imagePublishable` / BR-I02, BR-I03 cases incl. staff-granted legacy entry, carry-over with a veto, no guardianship; `restoreConsentsKeepingWithdrawals` (BR-I06) | expected booleans; 100 % coverage | REQ-I08 |
| TEST-I04 | unit (pure) | JPEG with EXIF GPS + orientation, PNG with `tEXt`/`eXIf`, WebP with `EXIF`/`XMP ` | `stripImageMetadata` | no GPS/XMP/text chunks remain; orientation kept; image data bytes identical; malformed input rejected | REQ-I02 |
| TEST-I05 | integration + UI (phone) | a public club event; coordinator | upload 3 pictures (one 12 MB, one fake), mark people, confirm, publish all | 422 codes; states Draft → Public / Waiting for consent; 31st picture 422 | REQ-I01, REQ-I03, REQ-I04 |
| TEST-I06 | integration + UI (public) | event with a consented photo, an unconsented photo, a graphic, an unpublished photo; a member who does not manage the event | open P-T1; request each public file URL; the member reads the event and requests `…/content` | gallery holds exactly the consented photo and the graphic; others 404; `Cache-Control: private, no-store`; the member's event read has no `pictures[]` and `…/content` answers 404 | REQ-I04, REQ-I05, REQ-I12 |
| TEST-I07 | integration | TEST-I06 state | guardian withdraws; read P-T1 again; check managers' notifications | the photo is gone from JSON and file route; one notification per event without the child's name | REQ-I05, REQ-I09 |
| TEST-I08 | integration | a former participant marked on 2 pictures (one already deleted by staff); a third picture deleted by staff | anonymize; then undo the earlier `add` and `set_people` of the erased pictures; delete a club with pictures | pictures and marks gone, attachments released (`readScoped` 404), consent events gone, audit entry lists the ids; undo/redo answer 409 `club_event_picture_erased`; the staff-deleted picture's bytes are released; club deletion leaves no rows in the new tables | REQ-I10, REQ-I11 |
| TEST-I09 | security | two clubs | club A manager marks a club B person; reads a club B picture; public read of club B picture under club A slug | 404 each; no data leak | REQ-I13 |
| TEST-I10 | integration | a person marked on a public photo with consent history | person data export | export lists the event, picture id and consent history | REQ-I11 |
| TEST-I11 | UI | B-T3 Files tab and the ward page | keyboard-only mark dialog and gallery viewer; 375 px; pl and en; light/dark | focus order, Escape returns focus, axe passes, no console errors | REQ-I04, REQ-I05, REQ-I06 |

## Implementation Phases

### Phase 1 — Guardian's image consent with history (E30-S02, #871)

- **Depends on:** nothing open: the owner approved the `people` migration and the narrowing of `set_consents` on 2026-11-26 (Rollout). OA-I1 (the lawyer's wording) is not needed to build, but it is needed before real club data.
- **Outcome:** guardians and adults give, withdraw and see the history of the image consent on the phone. Staff can only record withdrawals. `imagePublishable` is available to other modules.
- **Why this order / value delivered:** photos are useless without consents. Clubs can start collecting consents before the photo feature ships, so photos can be published on day one of phase 2.
- **Deliverables:**
  - `people_consent_events` (entity, migration);
  - `people/lib/image-consent.ts` (BR-I02, BR-I03, BR-I04; pure);
  - the narrowing in `people/lib/people-rules.ts` (grant-only subject rule for `image`, own-row rule, `restoreConsentsKeepingWithdrawals`, the veto at carry-over) and in `set_consents`, `set_own_consents`, `guardianships.create|update|end` and their undo;
  - `consentFlags.image` on the same rule as `imagePublishable`;
  - both history routes;
  - the directory method `imagePublishable`;
  - the event `people.consent.image_withdrawn`;
  - the shared `ConsentToggle` in `packages/ui/src/member/` (the foundation primitive of phase A2 of `.ai/specs/2026-10-27-vereino-foundation-primitives.md`; owner decision on #857, 2026-11-26: #871 builds it, as its second consumer next to the M-10 consent switch), used by the ward page and M-10, with its unit tests;
  - ward page, M-10 and B-10 changes;
  - i18n `en`/`pl`;
  - the person data export of consent history;
  - isolation inventory rows;
  - `docs/compliance` ropa A2.
- **Independent slices / estimated commits:** (a) pure rules and tests; (b) entity, migration and command changes; (c) routes and OpenAPI; (d) ward page, M-10 and B-10 UI; (e) export and compliance docs. About 6 commits.
- **Requirements closed:** REQ-I06 (without the photo count, which shows 0 until phase 2 registers `people.imageUsage.activities`), REQ-I07, REQ-I08, REQ-I13 for its routes.
- **Tests:** TEST-I01, TEST-I02, TEST-I03, TEST-I09 (people part), TEST-I11 (ward page part).
- **Validation:** `yarn db:generate` (review the SQL; apply only after approval), `yarn generate`, `yarn verify`, `yarn test:integration:vereino --filter TEST-I01` (one id per run), then `--filter TEST-I02`.
- **Exit gate:** a guardian on a 375 px phone gives and withdraws the image consent in both locales, light and dark. The history shows both decisions. An administrator's grant answers 422. `imagePublishable` returns the veto result.

### Phase 2 — Photos and graphics on club events, public only with consent (E30-S03, #872)

- **Depends on:** the Phase 1 exit gate (the owner approved the `activities` migration on 2026-11-26).
- **Outcome:** managers add, mark, confirm and publish pictures on the phone and in the panel. Guests see only the pictures BR-I01 allows. Withdrawals hide photos and notify managers. Erasure deletes marked pictures.
- **Why this order / value delivered:** it delivers D-044's only addition to the club page on top of consents that already exist.
- **Deliverables:**
  - first commit, before any upload accepts the new kinds: `clubEventFile` and `clubEvent` in `activities/services/public-events.ts` stream and list only `poster` and `funder_logo` (pictures only through BR-I01 later in the phase), so no intermediate state or rollback can expose a picture;
  - in `@vereino/core`: `stripImageMetadata` with tests;
  - in `activities`:
    - the migration (kinds, columns, checks, link table);
    - `activities/lib/public-pictures.ts` (BR-I01, pure);
    - the commands `add` (extended, owner assignment only), `update`, `set_people`, `publish`, `unpublish`, `publish-all`, `delete` (extended; final for pictures), with the BR-I07 undo/redo refusal;
    - the manager-only `…/files/{fileId}/content` route;
    - the people-options route;
    - the extended event read;
    - the `publicEvents.clubEvent`/`clubEventFile` filter;
  - the `club_core` P-T1 gallery and the `no-store` header for pictures;
  - the phone Pictures block and the B-T3 Files tab;
  - the subscriber and notification type for `people.consent.image_withdrawn`;
  - the erasure in `people.departure.activities` `erase`;
  - `people.imageUsage.activities` for the ward page count;
  - the club export and delete table lists, and the person data export of marks;
  - isolation inventory rows;
  - the compliance pack: retention R23, ropa A18, dpia D-12 and D-13, legal-verification items.
- **Independent slices / estimated commits:** (a) metadata stripper (core); (b) migration and commands; (c) public read and gallery; (d) phone and panel UI; (e) subscriber, erasure and exports; (f) compliance docs. About 8 commits.
- **Requirements closed:** REQ-I01–REQ-I05, REQ-I06 (count), REQ-I09–REQ-I13.
- **Tests:** TEST-I04–TEST-I11.
- **Validation:** `yarn db:generate` (review), `yarn generate`, `yarn verify`, and `yarn test:integration:vereino --filter <ID>` for each of TEST-I05–TEST-I10, one id per run.
- **Exit gate:**
  - J-I02, J-I03 and J-I04 pass in a browser at 375 px, in pl and en, light and dark;
  - a photo without consent never appears in the JSON or on its file URL;
  - a withdrawal hides the photo on the next uncached read;
  - erasure deletes the photo's bytes.

## Requirement Traceability

| Requirement | Journey / surface | Data/API/event contracts | Phase | Tests | Acceptance criterion |
|---|---|---|---|---|---|
| REQ-I01 | J-I02, phone Pictures, B-T3 | `activities_club_event_files`, `POST …/files`, `PUT …/files/{fileId}` | 2 | TEST-I05 | AC-I03 |
| REQ-I02 | J-I02 | `stripImageMetadata` | 2 | TEST-I04 | AC-I04 |
| REQ-I03 | J-I02 | `activities_club_event_file_people`, `PUT …/people`, people-options | 2 | TEST-I05, TEST-I09 | AC-I03 |
| REQ-I04 | J-I02, J-I04 | `publish`/`unpublish`/`publish-all`, event read states | 2 | TEST-I05, TEST-I11 | AC-I03 |
| REQ-I05 | J-I03, P-T1 | public JSON `pictures[]`, file route, BR-I01 | 2 | TEST-I06, TEST-I07 | AC-I05 |
| REQ-I06 | J-I01, J-I04, ward page, M-10 | `POST /api/people/guardianships/{id}/consents`, history route, `people.imageUsage.activities` | 1, 2 | TEST-I01, TEST-I11 | AC-I01 |
| REQ-I07 | J-I01, ward page, B-10 | `people_consent_events`, history routes | 1 | TEST-I01 | AC-I01 |
| REQ-I08 | J-I01, B-10 | narrowed `set_consents`, BR-I04, BR-I05 | 1 | TEST-I02, TEST-I03 | AC-I02 |
| REQ-I09 | J-I04 | `people.consent.image_withdrawn`, notification type | 2 | TEST-I07 | AC-I06 |
| REQ-I10 | J-I05 | departure `erase`, club delete lists, `no-store` | 2 | TEST-I06, TEST-I08 | AC-I07 |
| REQ-I11 | J-I05 | command log, `people_consent_events`, data exports | 1, 2 | TEST-I08, TEST-I10 | AC-I07 |
| REQ-I12 | P-T1, P-06 | no gallery elsewhere | 2 | TEST-I06 | AC-I05 |
| REQ-I13 | all new routes | isolation inventory | 1, 2 | TEST-I09 | AC-I08 |

## Rollout, Migration, and Rollback

- **Ask First items, approved by the owner on 2026-11-26 (#870 comment 7203995918):**
  1. the `people` migration (`people_consent_events`, append-only) — approved;
  2. the `activities` migration (new kinds, columns and checks on `activities_club_event_files`; the new table `activities_club_event_file_people`) — approved;
  3. the narrowing of `people.guardianships.set_consents`, `people.guardianships.create|update` and `people.persons.set_own_consents` (staff may not grant `image`) — approved with Q-I02;
  4. the new DI contract method `imagePublishable` and the optional token `people.imageUsage.activities` (additive) — approved with the spec;
  5. no new module and no new dependency are proposed. A separate `media` module was considered and rejected (Architecture).

  Anything beyond what this spec names (another migration, a new module, a dependency, a further contract change) is Ask First again. Migrations are never applied by an agent to a dev or real database.
- **Owner action OA-I1:** the lawyer's review of the wording (sent by the owner on 2026-11-26) and the answers to Q-I04 and Q-I07, before real club data (D-035). Q-I01 and Q-I03 are decided by the owner; the lawyer may ask to revisit them.
- **Order:**
  - Phase 1 ships first. Clubs collect consents while phase 2 is built.
  - Phase 2 adds the pictures. Until a club adds a picture, nothing changes on its public pages.
  - Migrations are generated with `yarn db:generate` and reviewed. They are applied only by the deploy pipeline after approval, never against a dev or real database by an agent.
- **Rollback:**
  - Both migrations are additive: new columns are nullable, the new tables have no foreign keys into other modules, and the kind values are new.
  - Before phase 2, the public file read (`clubEventFile`) streams any live file of a public event, of any kind. The first commit of phase 2 therefore limits it to `poster` and `funder_logo` and ships ahead of the new kinds. A rollback of the later phase 2 commits keeps that commit, so picture rows stay unreachable from the public routes. Rolling back past it is allowed only after the picture rows are deleted.
  - Rolling back phase 1 restores staff grants. Consent events stay as unused history.
- **Observability:** the command log for every picture and consent command, the notification count, and a structured log line when the public read drops pictures (count only, no ids of persons).

## Risks and Tradeoffs

| Risk / tradeoff | Impact | Mitigation / detection | Residual risk |
|---|---|---|---|
| Staff mark the wrong child or forget one | A child without consent is public | Confirmation recorded with author and time; changing marks clears it; the picker lists the event's participants first; guardians see the count of public photos of their child | Human error remains; the confirmation makes it accountable (DPIA D-12) |
| A visiting team's child is recognisable | Publication without any consent | DD-I04: the confirmation excludes outsiders; DPIA D-13 | Staff may confirm wrongly |
| A withdrawal while a page is open in a browser or in a shared cache | Photo stays visible for up to 60 s, or in a tab already loaded | `no-store` bytes; `s-maxage=60` JSON; the wording says so | Copies saved by others |
| Veto rule (DD-I05) surprises a parent whose grant is overruled | A photo stays hidden | The history shows both decisions; the owner decided the rule (Q-I01, 2026-11-26) | — |
| Staff-entered consents no longer count | Fewer publishable photos at first | Phase 1 ships first; the B-09 filter "Needs attention" can list wards without a guardian-given image consent | Slower start for clubs that typed consents in |
| Metadata stripper misses a format variant | GPS leaks | Unit tests on real phone samples (iPhone HEIC→JPEG export, Android JPEG, WebP); unknown segments in APP1–APP15 are removed except orientation | Rare formats; byte check refuses non-JPEG/PNG/WebP |
| A replay through undo or redo revives a withdrawn consent or an erased picture | A child's photo public again | BR-I06, BR-I07, TEST-I02, TEST-I08 | — |
| Erasure deletes a photo that shows other children | The club loses a picture | It is the subject's right; the audit entry counts it | Accepted |
| Storage growth (30 × 10 MB per event) | Storage cost | Limit per event; no originals kept | Monitored on the host |
| Read-time consent evaluation on every public view | Load | One indexed query per page for ≤ 30 pictures and ≤ 60 marks each; 60 s shared cache | — |

## Acceptance Criteria

- [ ] **AC-I01** — A guardian gives and withdraws a ward's image consent on the ward page at 375 px, in pl and en, light and dark. The history lists every decision with author, date and wording state, and the withdrawal asks for confirmation.
- [ ] **AC-I02** — Staff cannot grant the image consent (422 `image_consent_subject_only`), one guardian cannot change the other's, and no undo turns a withdrawal back into a grant. A staff withdrawal needs a note and is recorded as staff. A staff-granted legacy consent does not allow publishing.
- [ ] **AC-I03** — A coordinator adds, describes, marks, confirms and publishes pictures of a club event on the phone and in the panel. The limits and file checks answer their 422 codes, and stale writes answer 409.
- [ ] **AC-I04** — A stored picture has no EXIF GPS, XMP, IPTC or text metadata, and a phone photo keeps its orientation.
- [ ] **AC-I05** — The public event page and the file route show only pictures that satisfy BR-I01. No other public page shows pictures.
- [ ] **AC-I06** — After a withdrawal, the affected photos disappear from the public read and the event's managers get one notification per event without the child's name.
- [ ] **AC-I07** — Anonymising a person deletes the pictures that mark them, with their bytes, and deletes the person's consent events; no undo or redo brings them back. Club deletion removes the new tables. The person's data export lists marks and consent history.
- [ ] **AC-I08** — Every new route passes its cross-club probes (club B ids answer 404).
- [ ] Every listed backend surface matches its recorded Open Mercato reference and uses the canonical shell and components, the shared API helpers and semantic tokens. Each has complete loading, empty, error, conflict, keyboard, accessibility, responsive, light-mode and dark-mode states.
- [ ] Every affected API and UI path has self-contained integration coverage, and `yarn verify` passes.

## Final Compliance Report

| Check | Status | Evidence / resolution |
|---|---|---|
| Applicable `AGENTS.md` files and routed guides/skills reviewed | pass | `AGENTS.md`, `.ai/guides/spec-delivery.md`, `om-spec-writing`, `BACKWARD_COMPATIBILITY.md` (narrowing flagged), club events spec, people life-cycle spec |
| Data models, APIs, events, UI, and tests are internally consistent | pass | Requirement Traceability |
| Every workflow completes end to end without a catch-all integration phase | pass | J-I01–J-I05 map to phases 1 and 2 |
| Platform-native reuse and extension points were chosen before custom code | pass | Reuse and Ownership Map; no new module or dependency |
| UI contracts identify references, canonical components, and theme/state coverage | pass | UI and Interaction Contracts |
| Every phase has dependencies, bounded slices, tests, value, and an observable exit gate | pass | Implementation Phases |

Verdict: **Ready for implementation** — the owner decided Q-I01–Q-I03 and approved the Ask First items on 2026-11-26 (#870). The lawyer's wording (OA-I1) and the answers to Q-I04 and Q-I07 are needed before real club data, not before the build.

## Open Questions

Each question carries the recommended default that this spec applies. The owner accepted every recommendation on 2026-11-26 (#870 comment 7203995918); Q-I04 and Q-I07 still wait for the lawyer (OA-I1) and block nothing.

| ID | Question | Owner | Blocking? | Resolution / decision date |
|---|---|---|---|---|
| Q-I01 | With two guardians, does a withdrawal by either one block publication (veto), or does the most recent decision win (the current `effectiveConsents` rule)? | Władek Kuć, lawyer | phase 1 | **Decided 2026-11-26 (owner): veto.** For a minor, one guardian's withdrawal blocks publication; a picture is public only when at least one guardian granted the consent and no guardian withdrew it (DD-I05, BR-I02) |
| Q-I02 | Do image consents typed in by staff before this spec (or recorded from paper) count for publishing? | Władek Kuć | phase 1 | **Decided 2026-11-26 (owner): no.** Consents recorded by staff do not count; staff may only record a withdrawal; only the guardian, or the adult member, grants the consent, in the app (DD-I06, BR-I04, BR-I05; the narrowing is approved) |
| Q-I03 | May a photo be published when it also shows recognisable people from outside the club (for example a visiting team)? | Władek Kuć, lawyer | phase 2 | **Decided 2026-11-26 (owner): no.** No picture showing recognisable people from outside the club is published; staff confirm on each photo that nobody else can be recognised (DD-I04, REQ-I03) |
| Q-I04 | For a participant aged 13–17, is the guardian's consent enough, or is the young person's own agreement also needed? | lawyer | no | Recommended default: the guardian's consent (BR-I02), as for every minor today; the lawyer's answer may add the young person's own switch later without a schema change (`people_consent_events.by_role = self`). Pending (OA-I1) |
| Q-I05 | May coaches who do not manage the event upload photos (for the manager to publish)? | Władek Kuć | no | **Decided 2026-11-26 (owner, recommendation accepted): no**, managers only (DD-T06); revisit after the first season |
| Q-I06 | Should guardians see unpublished photos of their child, or be asked for consent with the photo attached? | Władek Kuć | no | **Decided 2026-11-26 (owner, recommendation accepted): no**; it discloses other children before any consent and could pressure the decision (Non-goals) |
| Q-I07 | How long are consent decisions kept as proof after the consent ends? | lawyer | no | Recommended default: until the person is anonymised or the club deleted (Security, R23). Pending (OA-I1) |

## Changelog

Each change is its own file in `.ai/specs/changelog/2026-11-26-vereino-event-photos-and-image-consent/` (`YYYY-MM-DD-<slug>.md`, one `| date | change |` row), so parallel PRs never conflict here; `cat .ai/specs/changelog/2026-11-26-vereino-event-photos-and-image-consent/*.md` lists them in date order. Never add rows to this section.
