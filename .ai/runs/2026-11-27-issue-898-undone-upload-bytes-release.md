# Run: #898 — release the bytes of a picture whose upload was undone

- **Trigger:** cezar run b9dd5f2e (issue labelled `cezar`), skill `om-auto-fix-issue`.
- **Issue:** #898 (follow-up of the #897 review, E30-S03 #872). Depends on PR #897, still open.
- **Branch:** `fix/issue-898-undone-upload-bytes-release`, stacked on `feat/issue-872-event-photos-consent` (SDLC.md ST-D04); the PR targets that branch and the merge train retargets it to `main` once #897 merges.

## Goal

Undoing a picture upload (`activities.club_event_files.add` undo) only soft-deleted the row, so the photo's bytes stayed in `attachments` with no release path.

## Decision

Of the three options in the issue, the undo of a picture's `add` is now a hard delete like the staff delete (DD-I12): the row and its marks are deleted (`deletePictureRows`) and the bytes released by `releasePictureFiles` in an `onTransactionLifetimeComplete` callback, so nothing is released when the replay rolls back (same pattern as `payments/commands/shared.ts` `emitAfterReplayCommit`). The redo then answers 409 `club_event_picture_erased` through the existing `assertPictureNotErased` in `authorizeFileReplay`. Reasons: a manager who undoes a wrong upload of a child's photo expects it gone; no sweep job, no new table or migration; club roles cannot redo anyway (no `audit_logs.redo_self`), so losing the redo costs nothing in practice. Like the staff delete, the undo of a picture's upload is allowed on a cancelled event.

## Files changed

- `packages/app/src/modules/activities/commands/club-event-files.ts` — picture branch in the `add` undo; header and redo comments.
- `packages/app/.ai/qa/tests/activities/TEST-I08-erasure-deletes-pictures.spec.ts` — a fourth picture uploaded and its upload undone: row gone, attachment released, not in the event's pictures, a second undo of the same token refused.
- `.ai/specs/implemented/2026-11-26-vereino-event-photos-and-image-consent.md` — summary, DD-I12, retention line.
- `docs/compliance/retention.md` — R25.
- `.ai/specs/changelog/2026-11-26-vereino-event-photos-and-image-consent/2026-11-27-issue-898-undo-upload-final.md`.

## Commands and results

- `yarn typecheck` — passed.
- `yarn test:integration:vereino --filter TEST-I08` — `1 passed (1.1m)`. Without the fix the new step fails: the undone row stays (soft-deleted) and `pictureRows` is not empty.
- `yarn verify` — `all 24 step(s) passed`.

## Open problems / next steps

- The PR merges only after #897; the train retargets it to `main` then.
