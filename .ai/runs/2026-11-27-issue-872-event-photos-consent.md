# Run: photos and graphics on club events, public only with consent (E30-S03, #872)

- **Trigger:** cezar task a534a72e (`om-auto-fix-issue 872`), unattended.
- **Issue / branch:** #872 / `feat/issue-872-event-photos-consent` (claimed: assignee, `in-progress`, 🤖 comment
  7224339178 naming the worktree, branch and start time).
- **Spec:** `.ai/specs/implemented/2026-11-26-vereino-event-photos-and-image-consent.md`, phase 2 (owner approved the `activities`
  migration on #870, comment 7203995918; phase 1 merged in #896).

## Steps

1. First commit, before any upload accepts the new kinds: the public club event read and file route list and stream
   only `poster` and `funder_logo` (spec *Rollback*).
2. `@vereino/core` `stripImageMetadata` (JPEG APP1/APP13/COM/APPn stripped with a minimal orientation EXIF; PNG text,
   `eXIf`, `tIME`; WebP `EXIF`/`XMP ` and VP8X flags), 100 % coverage (TEST-I04) — built by a subagent, reviewed.
3. Data: picture columns and checks on `activities_club_event_files`, the marks table
   `activities_club_event_file_people`; migration `Migration20261127172542_activities` generated offline with
   `yarn db:generate` (additive only, `down()` completed by hand); the table added to `ACTIVITIES_CLUB_TABLES`.
4. Pure rules: picture limits, description, reordering (`lib/club-event-files.ts`), BR-I01 states
   (`lib/public-pictures.ts`), the export section of marks (`lib/data-export.ts`), the erasure tombstones
   (`people/lib/erasure-rules.ts`: `ErasurePart.erased`, `afterCommit`).
5. Commands and routes: `add`/`delete` for pictures, `update`, `set_people`, `publish`, `unpublish`, `publish_all`; the
   manager-only content route and people picker; `pictures[]` on the event read for managers only.
6. Public read under BR-I01 (`activities.publicEvents`), `private, no-store` bytes (`club_core` `fileResponse`), the
   held-back notice subscriber, the erasure contributor `erase`, `people.imageUsage.activities`, the export of marks.
7. UI: phone Pictures block, panel pictures table (B-T3 Files tab), shared hook and dialogs; P-T1 gallery with a
   keyboard viewer (built by a subagent in `club_core`); en/pl catalogs.
8. Compliance pack (subagent): RoPA A18, retention R25, DPIA D-12 and D-16, data-subject requests, legal verification
   OA-I2.
9. Isolation probes for every new route and a seeded picture; TEST-I05, TEST-I06, TEST-I07, TEST-I08, TEST-I10.
10. Spec close-out: criteria ticked with evidence, status Implemented, moved to `implemented/`, links fixed.

## Decisions

- A staff delete of a picture is a hard delete with the bytes released after the commit (DD-I12); the undo of an
  `add` still only unlinks (soft delete), and every replay of a picture that is gone answers 409
  `club_event_picture_erased` (BR-I07).
- A picture's attachment owner is the picture itself (`activities:club_event_picture`), so the owner is its only
  assignment and `releaseScoped` works; the poster and logos keep their pattern.
- The erasure releases bytes through a new optional `afterCommit` on the contributor's `ErasurePart` and lists the ids
  as `erasedRecords` on the anonymisation's audit entry.
- New pictures are described "{event} — photo {n}" so a multi-file upload needs no description per file; staff edit
  it. The uploaded file name of a picture is never stored.
- A fifth staff state `unconfirmed` (Waiting for confirmation) for a published picture whose marks changed.
- Compliance numbers R25 and D-16 (the spec's R23 and D-13 were taken); spec body and changelog say so.
- TEST-I09 is covered by the isolation probes (ISSUE-628) and the public part of TEST-I06; no separate file.

## Commands and results

- `yarn typecheck`, `yarn typecheck:qa`, `yarn lint`: pass (lint first failed on `@mikro-orm` imports in two routes,
  a synchronous setState in an effect, a `require-await` in a test, and later `String()` on a string — fixed).
- `yarn ds:check` failed once on `max-h-[70vh]` in the gallery — fixed.
- Unit: `jest src/modules/activities/lib src/modules/people/lib/...erasure-rules` → 461 passed; `@vereino/core` 184
  passed at 100 %.
- Integration, one id per run: TEST-I05 1 passed; TEST-I06 1 passed; TEST-I07 1 passed; TEST-I08 failed twice
  (`GET actions … requiredFeatures ["audit_logs.view_self"]` as the coordinator; `Undo token not available` for an
  earlier action; then `requiredFeatures ["audit_logs.redo_self"]` for the redo) and passed after acting as the club
  administrator, undoing the latest write and dropping the redo check; TEST-I10 1 passed. Older: TEST-T08 2, TEST-T09
  1, ISSUE-628 1, TEST-L07 3, TEST-X01 1, TEST-M07 2, TEST-I01 1, TEST-T13 1 passed.
- `yarn verify`: all 20 steps passed (generate–typecheck:qa in the first run, lint–build after the lint fix).
- `yarn guard`: no blocking findings.

## Open problems / next steps

- OA-I1 and OA-I2: the lawyer reviews the consent and confirmation texts before real club data.
- The panel table has no bulk selection; "Publish all" covers the bulk publish of the spec's B-T3 row.
