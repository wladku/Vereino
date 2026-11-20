---
title: "An upload command can be undoable: its redo hook relinks the stored file instead of re-uploading"
modules: ["activities", "club_core", "platform"]
areas: ["module-data"]
topics: ["attachments", "undo-redo", "commands", "uploads"]
---

# An upload command can be undoable: its redo hook relinks the stored file instead of re-uploading

**Context**: 2026-11-20, #379 (club event poster and funder logos). The issue asked that a second poster replace the first and that the first come back on undo. The earlier upload commands (`club_core.places.files.add`, `club_core.logos.set`, `facilities.incidents.photos.add`) are not undoable, because the platform redo replays `execute` and the bytes are not part of the stored input.

**Problem**: Without undo on the add, a replaced file can only be restored by hand. Marking the add undoable alone breaks redo: `execute` finds no upload in the context and answers 400.

**Rule**: The platform `CommandHandler` has an optional `redo({ ctx, logEntry })` that the bus calls instead of `execute` on a redo (`command-bus.js` `executeCore`). For an upload: keep the link row soft-deleted on undo (never release the attachment), write what the undo needs into `snapshotAfter` (for a replacing upload, the id of the replaced row), and implement `redo` to un-delete the same link row under the parent's lock, re-applying the limits and the replacement. Test redo with `audit_logs.redo_self` granted to the club's platform role (no Vereino role holds it).

**Applies to**: `activities/commands/club-event-files.ts` (reference), any future undoable upload; `club_core` place files and logos if they ever become undoable.
