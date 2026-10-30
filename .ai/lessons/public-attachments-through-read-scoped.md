---
title: "Serve a public file through attachmentService.readScoped with the slug-derived scope and its exact owner, assignment and partition"
modules: ["club_core", "platform"]
areas: ["module-data"]
topics: ["attachments", "public-pages", "sessionless", "uploads", "content-type"]
---

# Serve a public file through attachmentService.readScoped with the slug-derived scope and its exact owner, assignment and partition

**Context**: Issue #29 (club spec phase 1 steps 6 and 7, 2026-10-30) serves club and section logos and published section materials on the sessionless pages `/p/[clubSlug]`.

**Problem**: (1) `attachmentService.readScoped` serves a file only to a principal of its organization, and the public partition does not serve tenant-scoped rows to guests (`attachments/lib/access.ts`); `createScoped` always forces a private partition. (2) `ScopedAttachmentUploadService.upload` adds an owner assignment by itself, so two kinds of file on one record cannot be told apart by owner alone. (3) The platform serves a PDF as `application/octet-stream`.

**Rule**: Read a public file with a synthetic principal carrying only the tenant and organization the DD-35 slug lookup found (never a value from the request), and pass `expectedOwner`, `expectedAssignment`, `expectedPartitionCode` and `requirePrivatePartition: true`, so no other attachment can be reached. Give each kind of file its own assignment type (`club_core:club_logo`, `club_core:section_logo`, `club_core:section_material`). Check the format from the bytes at upload, store that type, and send it with `X-Content-Type-Options: nosniff`.

**Applies to**: `club_core/api/public-shared.ts`, `club_core/services/public-site.ts` and any later public file (facility photos, price lists).
