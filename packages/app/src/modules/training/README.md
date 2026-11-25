# `training` — training outlines (E24)

Training outlines spec `.ai/specs/2026-11-23-vereino-training-outlines-and-medical-expiry.md`, phase 2 (E24-S03, #683).
The module and its migration were approved by the product owner on 2026-11-24 (#671, Q-O09); the `activities`
contract surfaces it uses on 2026-11-25 (#683).

| Area | What |
| --- | --- |
| Tables | `training_outlines` (an outline in the PZPN template's minimum content; `activity_id` = a series outline, `occurrence_id` = one session's outline, neither = the author's own outline; one live outline per session and per activity), `training_authors` (terms accepted before a first publication; written from phase 4) |
| Pure logic | `lib/outline.ts` — the three parts and their limits, the planned minutes, the images an outline references, the 72-hour lock (BR-O3), the unedited-copy check, the PDF file name; `lib/images.ts` — JPEG/PNG/WebP up to 5 MB, 12 per outline |
| Commands | `training.outlines.create`, `update`, `delete` (undoable), `attach` (copies an outline into a session or as an activity's series outline with its sessions' copies), `ensure_copy` (the session's copy of its series outline, idempotent), `sync_sessions` (job), `images.add`, `images.remove` |
| Routes | CRUD `/api/training/outlines` (`training.outlines.write`; list views `mine`, `sessions`, `series`), `GET /api/training/outlines/{id}`, `POST …/{id}/attach`, `POST /api/training/outlines/ensure-copy`, `POST …/{id}/images` (multipart), `GET`/`DELETE …/{id}/images/{attachmentId}` |
| Subscriber | `training:session-copies` on `activities.occurrence.generated`: a created session of an activity with a series outline gets its copy; a removed session's unedited copy is deleted, an edited one is kept as its author's own outline. A moved or cancelled session keeps its copy. |
| DI | `trainingOutlineTopics` — the session's outline topic for the PZPN schedule export of `activities` (DD-O06); the club data contributor of `TRAINING_CLUB_TABLES` |
| Pages | `/club/training/outlines` (M-O5 list; More → Training outlines), `/club/training/outlines/new` (`?occurrenceId=`, `?activityId=`), `/club/training/outlines/[id]` (M-O5 editor), `/club/training/outlines/[id]/print` (M-O7, the PZPN layout; the browser's "Save as PDF"); the "Outline" card on `/club/occurrences/[id]` (M-O6, widget `training.injection.session-outline` on `vereino:club:occurrence:sections`) |
| ACL | `training.outlines.write` (coach, coordinator), `training.manage` (club administrator through `training.*`) |

Rules:

- **Scope.** An outline is written by its author (`self`), a coach of its group or session, a coordinator of its section and the club administrator (`OUTLINE_KINDS`); attaching also needs the session's or activity's scope (`SESSION_KINDS`). Session facts come only from `activities.occurrenceFacts`, names from the `groups` and `people` directories — no cross-module ORM read.
- **Copies (DD-O07).** Each session has its own copy; editing the series outline never changes an existing copy. Attaching copies the source, which stays where it was, so an own outline is a reusable template.
- **Images.** An image is uploaded to one exercise of a saved outline and owned by that outline (owner assignment only); a session copy references its series outline's images. An edit keeps only images the outline already referenced; a dropped image's file is released once no live outline of the club references it.
- **Lock (BR-O3).** A session's outline is read-only 72 hours after the session's end: update, delete and image writes answer 409 `outline_locked`.
- **Print (DD-O08, Q-O07).** No server-side PDF: the print page's labels follow the outline's language (both catalogs' `training.print.sheet.*` texts come from the server page), print media show only the sheet, and the document title is the PDF's file name.

Not in phase 2: the shared library, ratings and reports (phase 4, E24-S05), the back-office outline pages, and the part filter of the list.

Tests: `lib/__tests__/*` (100 % coverage); integration TEST-O05 (phone editor, image, session card, 409), TEST-O06 (series copies through moves, cancellations and series edits), TEST-O07 (print page); cross-club probes `.ai/qa/tests/_fixtures/isolation/inventory/training.json`.
