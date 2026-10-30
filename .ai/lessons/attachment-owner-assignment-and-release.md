---
title: "The upload service adds the owner as an assignment; releaseScoped needs it to be the only one"
modules: ["people", "platform"]
areas: ["module-data"]
topics: ["attachments", "uploads", "purge", "retention"]
---

# The upload service adds the owner as an assignment; releaseScoped needs it to be the only one

**Context**: Issue #28 (club spec phase 1 step 8, 2026-10-30) stores the import file in the private `attachments` partition and deletes it 30 days after commit or cancellation (`people:purge-import-rows`).

**Problem**: `ScopedAttachmentUploadService.upload` adds the owner as an assignment by itself, and `attachmentService.releaseScoped` refuses with 409 when the file has more than one assignment. Adding a module's own assignment on top made the first purge fail. Separately, `/api/attachments/file/{id}` serves any attachment to any signed-in user of the organization without a feature check, so a file's id must never appear in a response the reader is not entitled to.

**Rule**: For a file the module must release later, rely on the owner assignment alone and release exactly that one; cover the release path with a purge test. Keep attachment ids of sensitive files out of every response, and say in the PR that their protection is the id's secrecy.

**Applies to**: `people/commands/imports.ts`, `people/commands/jobs.ts` and any module that uploads and later deletes a file.
