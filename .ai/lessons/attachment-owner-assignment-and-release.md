---
title: "The upload service adds the owner as an assignment; releaseScoped needs it to be the only one"
modules: ["people", "payments", "platform"]
areas: ["module-data"]
topics: ["attachments", "uploads", "purge", "retention"]
---

# The upload service adds the owner as an assignment; releaseScoped needs it to be the only one

**Context**: Issue #28 (club spec phase 1 step 8, 2026-10-30) stores the import file in the private `attachments` partition and deletes it 30 days after commit or cancellation (`people:purge-import-rows`).

Issue #294 (payments parity phase 4, 2026-11-18) hit it again: the bank statement import (#113) added `payments:bank_statement` next to the owner, so deleting an import could not release its file; new imports now carry the owner alone, and an import stored before keeps its file when deleted (`fileKept` in the audit context). The rule is promoted to `AGENTS.md` → Never.

Issue #308 (people life-cycle phase L6, 2026-11-20) found the person photo of #312 uploaded with the second assignment `people:person_photo`, so the erasure could not release it; photo uploads now carry the owner alone, the scoped read expects the owner assignment, and a photo stored before is counted as kept in the anonymisation's audit context.

**Problem**: `ScopedAttachmentUploadService.upload` adds the owner as an assignment by itself, and `attachmentService.releaseScoped` refuses with 409 when the file has more than one assignment. Adding a module's own assignment on top made the first purge fail. Separately, `/api/attachments/file/{id}` serves any attachment to any signed-in user of the organization without a feature check, so a file's id must never appear in a response the reader is not entitled to.

**Rule**: For a file the module must release later, rely on the owner assignment alone and release exactly that one; cover the release path with a purge test. Keep attachment ids of sensitive files out of every response, and say in the PR that their protection is the id's secrecy.

**Applies to**: `people/commands/imports.ts`, `people/commands/jobs.ts`, `payments/commands/bank.ts` and any module that uploads and later deletes a file.
