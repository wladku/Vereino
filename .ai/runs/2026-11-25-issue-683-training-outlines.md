# Run log — #683 E24-S03 training outlines on sessions with a PDF in the PZPN layout

- **Trigger:** cezar automation (`cezar` label), `om-auto-fix-issue` with the repo-local override; one run, one worktree.
- **Issue / spec / branch:** #683; `.ai/specs/2026-11-23-vereino-training-outlines-and-medical-expiry.md` phase 2;
  `feat/issue-683-training-outlines-pzpn-pdf`.
- **Approvals found before claiming:** module `training` and its migrations, Q-O07 (print page) and Q-O09 (new module)
  on #671 (2026-11-24); the `activities.occurrenceFacts` contract and the `vereino:club:occurrence:sections` spot on #683
  (owner comment, 2026-11-25). The spec is Ready on `main` (#687). A previous run (worktree `70dc5ae1…`) had stopped
  without claiming, so nothing to take over.

## Steps

1. Claimed #683 (assignee, `in-progress`, 🤖 comment naming this worktree and branch).
2. `activities`: `services/occurrence-facts.ts` (`occurrences`, `activities`, `upcomingSessions`), registered as
   `activities.occurrenceFacts`; the spot `vereino:club:occurrence:sections` on `ClubSessionPage` for staff readers.
3. New module `training` (registered in `src/modules.ts`, `vereino-modules.json`; ACL; role features in
   `@vereino/core` `roleCatalogue`): entities `Outline` (`training_outlines`) and `OutlineAuthor` (`training_authors`),
   pure rules in `lib/outline.ts` and `lib/images.ts` (100 % unit coverage), commands (create/update/delete undoable,
   attach, ensure_copy, sync_sessions job, images add/remove), routes with `metadata` + `openApi`, the subscriber on
   `activities.occurrence.generated`, the `trainingOutlineTopics` resolver phase 3 waits for, club data contributor.
4. Migration `Migration20261125055558_training` generated with `yarn db:generate` against a throwaway PostgreSQL
   container (`tmp-pg-issue683`, random port, stopped afterwards; `packages/app/.env` written by the CLI deleted);
   `db:generate` reports no changes after applying it there. `down()` hand-written.
5. Member UI: list and phone editor (M-O5), the session card widget (M-O6), the print page (M-O7, labels in the
   outline's language from both catalogs, print CSS shows only the sheet, document title = PDF file name), the member
   "More" entry "Training outlines" (`@vereino/ui` `memberNav` + the label in all six frames' catalogs).
6. Isolation inventory `training.json` + `seed-training.ts`; integration tests TEST-O05, TEST-O06, TEST-O07; E09-S04
   updated for the new More entry.

## Decisions

- **Attach copies, the source stays.** An own outline is a reusable template; every session gets its own copy (DD-O07).
- **Images live in the parts JSON** (`{ attachmentId, ownerOutlineId }`) — the approved migration has no image table.
  A session copy shares its series outline's files; a dropped image's file is released only when no live outline of
  the club references it (raw count in `data/queries.ts`). Owner assignment only (lesson
  `attachment-owner-assignment-and-release`).
- **Unedited copy = untouched since it was made** (`updatedAt` within 1 s of `createdAt`), not "same content as the
  series": TEST-O06 showed the series may change first, which kept a removed session's untouched copy. MikroORM's
  `onCreate` restamps `createdAt` at flush, hence the tolerance.
- **No cancelled-session subscriber in phase 2:** a cancelled session keeps its copy by doing nothing; excluding it from
  library uses is phase 4.
- **Outline author must be a person** (spec: `author_person_id` not null); a caller linked to no person gets
  `scope_unlinked`. The isolation seed writes outlines as Żaki's coach.
- **Polish wording:** "termin" instead of "zajęcia" (glossary gate).
- **Not built (left for later, recorded in the spec changelog):** back-office outline pages, the list's part filter,
  the library (phase 4).

## Commands and results

- `yarn test` (training lib): 19 tests, 100 % lines/branches/functions; `packages/ui` 262 tests, `packages/core` 133 tests pass.
- `yarn test:integration:vereino --filter TEST-O05` → 1 passed; `TEST-O06` → first runs failed
  (`Expected: 404 / Received: 200` — the removed session's copy was detached, then `Expected length: 2 / Received
  length: 1` — the RRULE `UNTIL` caps the extension; test corrected), then 1 passed; `TEST-O07` → first run failed
  (`Expected: "konspekt-…-gra-1-1-w-obronie" / Received: "konspekt-…-gra-11-w-obronie"`; slug fixed), then 1 passed;
  `VEREINO_ISOLATION_MODULES=training … --filter ISSUE-628` → 1 passed; `E09-S04` → failed on the More count (4 → 5),
  updated, 1 passed.
- `yarn verify`: first run failed at `glossary:check` (19 × "zajęcia"); fixed; resumed and final full run green.

## Open problems / next steps

- V-O2 (compare a printed PDF with a certified club's filled outline) stays an exit-gate check for the owner; TEST-O07
  attaches the generated PDF to its report.
- The spec's Ask First row for the `activities` contract still reads "open"; the approval is recorded on #683 and in
  the spec changelog file of this PR.
