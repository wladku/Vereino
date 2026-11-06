# Issue #86 slice (b): a place's regulations text, regulations PDF and photos (UX parity spec phase 3)

- **Date:** 2026-11-06
- **Agent / tool:** Claude Code (Opus 5.5) under cezar (task 10b7e615), `om-auto-fix-issue` with the repo-local override; no subagents
- **Trigger:** `om-auto-fix-issue 86`, after the owner recorded the phase 3 migration approval on #86 (2026-11-05)
- **Branch:** `feat/issue-86-place-regulations-photos`, from `main` at 5aa6b8f
- **Status:** see *Commands and results*; PR opened with `Closes #86`

## Goal

Finish E06-S04 (#86): slice (a) (filters, owner, hierarchy) shipped in PR #163. Slice (b) adds the place's regulations text, one regulations PDF and up to 10 photos, as phase 3 of `.ai/specs/implemented/2026-11-03-vereino-ux-parity-phases-1-3.md` defines them (REQ-U03, DD-U06, TEST-U08, TEST-U09, AC-U05).

## Steps

1. Read the issue and its comments. It is a `feature`; the spec covers it; slice (a) is merged (#163). The owner's comment of 2026-11-05 approves exactly this migration: the nullable `club_core_places.regulations_text` and the table `club_core_place_files` with the partial unique index for one regulations file. It is generated and committed, never applied by an agent. No open PR referenced the issue, and no other actor held a claim. Claimed #86 (`in-progress`, the existing assignee `wladku`, 🤖 comment issuecomment-6678096754) and renamed the task branch.
2. Entities: `Place.regulationsText` and the new `PlaceFile` (owner `club_core:place`, assignment `club_core:place_file`, private partition). `yarn db:generate` ran offline from the module snapshot with an unreachable `DATABASE_URL`. It generated only `club_core` (`Migration20261106055958_club_core.ts`; the other modules reported "no changes") and an additive snapshot diff. The generated `packages/app/.env` was deleted. The migration was rewritten in the module's style, with `set local lock_timeout = '5s'` and a `down()` that drops the column and the table.
3. Pure logic in `lib/files.ts`: `checkPlaceFile` (a PNG, JPEG or WebP photo up to 5 MB; a regulations PDF up to 10 MB, both by magic bytes), `PLACE_PHOTOS_MAX` (10) and `nextPhotoPosition`, with unit tests.
4. `api/uploads.ts`: `readCheckedUpload` takes the upload kind from the route or from the form's own fields (a place file names its `kind`). One table maps each kind to its check and its error codes. New error codes: `place_file_format_unsupported`, `place_file_too_large`, `place_photos_limit_reached` (422).
5. Commands `club_core.places.files.add` and `club_core.places.files.delete` (`commands/place-files.ts`), service `services/place-files.ts`, routes `GET`/`POST /api/club_core/places/{id}/files` and `DELETE …/{fileId}` with `metadata` and `openApi`. `regulationsText` goes through the place validators, the snapshot, restore, create, update and the list.
6. UI: the place form gets the group "Regulations and photos" with the regulations text and `PlaceFilesPanel` (the PDF with Remove, a "replace" upload, a photo grid with Remove behind the shared confirmation, an upload of several photos at once, 422 shown for each file). A new place shows a hint that files come after the first save. en and pl strings.
7. Integration test `club_core/TEST-U08-place-regulations-photos.spec.ts`; module README; spec status, AC-U05 and a changelog entry.

## Decisions

- **Delete keeps the bytes and is undoable**, like section materials. The spec's data model says "the attachment is removed with the link". Releasing the attachment for good (`releaseScoped`) would make the delete impossible to undo, and weakening undo is Ask First. The link is soft-deleted, the file stays private and unreachable from the place, and the undo restores it. The README already lists the clean-up of unreferenced files as a non-goal.
- **The photo limit is enforced in `persistLink`**, in the upload transaction, after `authorizeScoped` locks the place row again (`PESSIMISTIC_WRITE`). Throwing there rolls back the attachment row and the platform deletes the stored bytes (`scoped-upload-service.ts`, `compensateStorage`). A check before the upload rejects the common case without storing anything.
- **A second regulations PDF** soft-deletes the live one in the same transaction before the new row is inserted, which the partial unique index requires. The response's `replacedId` names the replaced file.
- **The undo of a delete** counts the photos again under the place lock (422 at 10). For a regulations file, it replaces the newer one, which can be restored again from its own removal.
- **No lock token on file writes.** A file link has no editable fields. Adding a file does not change the place row, so the place form's own lock token stays valid.
- **No new events.** The spec's events table lists none for place files; the audit log records each add and delete.
- **`GET` returns `thumbnailUrl`** (the authenticated image route at 160 px) in addition to the spec's `url`. This is additive, and the photo grid uses it.

## Files changed

- `packages/app/src/modules/club_core/data/entities.ts`, `data/validators.ts`, `migrations/Migration20261106055958_club_core.ts` (new), `migrations/.snapshot-open-mercato.json`
- `packages/app/src/modules/club_core/lib/files.ts`, `lib/error-codes.ts`, `lib/__tests__/files.test.ts`, `lib/__tests__/error-codes.test.ts`
- `packages/app/src/modules/club_core/api/uploads.ts`, `api/shared.ts`, `api/places/route.ts`, `api/places/[id]/files/route.ts` (new), `api/places/[id]/files/[fileId]/route.ts` (new)
- `packages/app/src/modules/club_core/commands/places.ts`, `commands/place-files.ts` (new), `services/place-files.ts` (new)
- `packages/app/src/modules/club_core/components/PlaceForm.tsx`, `components/PlaceFilesPanel.tsx` (new), `components/places-shared.ts`
- `packages/app/src/modules/club_core/i18n/en.json`, `i18n/pl.json`, `README.md`
- `packages/app/.ai/qa/tests/club_core/TEST-U08-place-regulations-photos.spec.ts` (new)
- `.ai/specs/implemented/2026-11-03-vereino-ux-parity-phases-1-3.md` (moved; status Implemented, AC-U05 and the two closing criteria ticked) and its changelog entry; this log

## Commands and results

- `yarn generate`: completed.
- `DATABASE_URL=postgres://none:none@127.0.0.1:1/none yarn db:generate`: `club_core: generated Migration20261106055958_club_core.ts`, the other five modules "no changes"; "Skipped the encryption map backfill check: connect ECONNREFUSED" (expected, no database). No `yarn db:migrate`.
- `npx jest src/modules/club_core/lib/__tests__/files.test.ts --coverage`: 12 passed; `files.ts` 100 % statements, branches, functions and lines.
- `yarn typecheck`: the first run failed with `place-files.ts(114,3): error TS2322: Type 'Promise<Loaded<PlaceFile, never, "id" | "position", never>[]>' is not assignable to type 'Promise<PlaceFile[]>'`. Fixed: the helper returns the positions. The second run was clean.

- `yarn test:integration:vereino --filter TEST-U08`, run 1: everything up to the stale-save step passed (byte checks, the parallel pair at 9 photos → `[201, 422]`, the eleventh photo 422, PDF replacement, removal, the browser list, remove and upload, axe in light and dark mode). It then failed with `Expected: 200 Received: 401` on the setup PUT of the stale-save check: `signInBrowser` resets the password and ends the earlier API token (lesson `db-generate-varchar-length-and-concurrent-index-migrations`, point 4). Fixed with a fresh `getAuthToken` after the browser sign-in. Run 2: **1 passed (59.7s)**.
- `yarn format`, then `yarn verify`: **all 14 steps passed** (jest 41 suites, 461 tests, coverage thresholds held; build green).

## Open problems

- None known at the time of writing; see the PR for the review and QA state.

## Next steps

- Review and QA of the PR. After it merges, the owner's deployment applies `Migration20261106055958_club_core`.
