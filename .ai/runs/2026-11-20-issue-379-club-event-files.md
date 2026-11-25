# Run: issue #379 — club event poster and funder logos (E14-S04)

- **Trigger:** Cezar queued `om-auto-fix-issue 379` after the `cezar` label (2026-11-20T02:38Z), task 544f0c2a.
- **Issue:** #379 (epic #375), feature route; dependencies E14-S01 (#376) and E14-S03 (#378) closed; migration T2, the routes, command ids and error codes approved by the owner on 2026-11-19 (Q-T20, PR #418).
- **Spec:** `.ai/specs/implemented/2026-11-18-vereino-club-events-with-parts.md`, phase 4 (REQ-T08, DD-T10; TEST-T08, TEST-T11 files steps).
- **Branch:** `feat/issue-379-admin-uploads-event-poster-logos` (Cezar worktree).

## Goal

The club administrator (and a coordinator of the event's section) uploads one poster and up to 12 funder logos with names to a club event, checked by their bytes, on the Files tab of B-T3; replacing the poster and removing a logo are undoable.

## Steps

1. Claimed the issue (assignee, `in-progress`, `🤖` claim comment naming the run, worktree and branch).
2. Read phase 4, the data model, the API contract and the references (`club_core` place files, uploads, `facilities` incident photos, `PlaceFilesPanel`).
3. Pure rules `lib/club-event-files.ts` (formats, limits, funder name, position, order, staff image URL) with unit tests at 100 %.
4. Entity `ClubEventFile`, migration T2 from `yarn db:generate` (offline, from the snapshot), `down()` written by hand.
5. Commands `activities.club_event_files.add|delete` (undoable; add with a `redo` hook), upload reader `api/club-event-uploads.ts`, routes `POST …/files`, `DELETE …/files/{fileId}`, `files[]` on the event read; error codes and en/pl messages.
6. Files tab `ClubEventFilesPanel` in `ClubEventRecord`; en/pl keys.
7. TEST-T08 spec (API test + TEST-T11 files steps in the browser).

## Decisions

- **The add is undoable** (the place-files add is not): the issue's acceptance criterion asks the first poster to return on undo. The undo soft-deletes the new link and relinks the replaced poster (`replacedId` in `snapshotAfter`); the platform `redo` hook relinks the same stored attachment, so a redo never needs the bytes. Lesson `undoable-upload-redo-relinks-stored-file`.
- **Error code `club_event_file_missing`** instead of the spec's `upload_file_missing`: `contracts:check` requires error codes to be unique across modules and `club_core` declares `upload_file_missing` (400). Recorded in the spec changelog entry.
- **`club_event_funder_name_invalid` (422)** for a logo without a name or with one outside 2–120: the spec asks for "422" without naming a code.
- **Delete takes the file's `updatedAt` as lock token** (the spec's "version; 409 version"), unlike the place-files delete; `files[]` items carry `updatedAt`.
- **A cancelled event refuses file writes** (409 `club_event_cancelled`), as every other event write.
- **Upload progress** is a status line with a spinner naming the file (`role="status"`): `apiCall` exposes no byte progress, and a raw XHR is not allowed on admin pages.
- **The confirm dialog's button is "Remove"** (our key), so the test picks it through `uiText` (`qa-texts:check`).

## Files changed

`packages/app/src/modules/activities/{data/entities.ts, data/validators.ts, lib/club-event-files.ts (+ test), lib/error-codes.ts, commands/club-event-files.ts, api/club-event-uploads.ts, api/club-events/[id]/route.ts, api/club-events/[id]/files/route.ts, api/club-events/[id]/files/[fileId]/route.ts, services/club-events.ts, components/{ClubEventFilesPanel,ClubEventRecord}.tsx, components/club-events-client.ts, migrations/Migration20261120025027_activities.ts + snapshot, i18n/{en,pl}.json, README.md}`, `packages/app/.ai/qa/tests/activities/TEST-T08-club-event-files.spec.ts`, the spec changelog entry `2026-11-20-issue-379-phase-4.md`, the lesson `undoable-upload-redo-relinks-stored-file.md`.

## Commands and results

- `jest lib/__tests__/club-event-files.test.ts --coverage` — 8 passed, 100 % lines/branches/functions.
- `yarn db:generate` — `activities: generated Migration20261120025027_activities.ts`, other modules no changes.
- `yarn verify`:
  - run 1 failed at `lint`: `no-unnecessary-type-conversion` (test) and `no-redundant-type-constituents` (`'invalid'` in `string | null | 'invalid'`); `funderNameOf` now returns `{ valid, name }`.
  - run 2 (`--from lint`) failed at `contracts:check`: "activities: error code upload_file_missing is already declared by club_core" — renamed to `club_event_file_missing`.
  - run 3 failed at `qa-texts:check`: the hardcoded confirm button regex — the dialog now uses our "Remove" key.
  - run 4 (`--from qa-texts:check`): all steps passed (with runs 2–3 covering lint … glossary).
- `yarn test:integration:vereino --filter TEST-T08`:
  - run 1: the UI test passed; the API test failed at redo: `{"error":"Forbidden","requiredFeatures":["audit_logs.redo_self"]}` — the test now grants the feature to the club's platform role, as TEST-027 does.
  - run 2: 2 passed (48.2s).
- `yarn test:integration:vereino --filter TEST-T11` (regression of the record page, which gained the Files tab): 1 passed (58.0s).

## Review

A fresh-eyes reviewer subagent read the diff (no serious finding) and raised two low ones, both fixed in a second commit: (1) undoing a poster's removal after a newer poster was uploaded would retire the newer one without any log entry recording it, so it could be lost — the undo now answers 409 `club_event_poster_replaced` (new error code) while another poster is live; (2) the undo of an add did not check `club_event_cancelled` like the other replays — it does now. Nit kept: a restored logo may share its position number with a newer logo (ordering breaks the tie by creation time). TEST-T08 gained the delete → new poster → undo (409) → remove the new one → undo (200) scenario. After the fixes: `yarn verify` all 18 steps passed; `--filter TEST-T08` 2 passed (47.8s).

## Open problems

- `down()` of migration T2 was not run against a database (the integration runs apply `up()`).

## Next steps

- E14-S05 (phone files block), E14-S06 (public tournament page and the public file route).
