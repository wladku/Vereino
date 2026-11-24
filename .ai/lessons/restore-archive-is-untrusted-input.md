---
title: "An archive a restore reads is untrusted input; checksums inside it prove nothing"
modules: ["club_core", "attachments", "auth"]
areas: ["module-data", "architecture"]
topics: ["export", "restore", "archive", "tenant-isolation", "path-traversal", "credentials"]
---

# An archive a restore reads is untrusted input; checksums inside it prove nothing

**Context**: PR #677 (#632) added `club_core export-club` and `restore-club`. The archive is handed to the club that
leaves, and the club may bring it back. A review after the `main` merge found that `restore-club` inserted every table
the manifest named and every row as written, so an archive edited with its `manifest.json` checksums recomputed could
add a session or API key for any user, a row with another club's `tenant_id`, or an attachment whose `storage_path`
(`../../…`) made the local storage driver write outside its partition (its `store` has no containment check, unlike
`read` and `delete`). The export also carried every member's `users.password_hash`.

**Problem**: Checksums stored inside the file only catch corruption. Anyone holding the file can recompute them. A
format "we wrote ourselves" feels trusted, but once it leaves the instance it is not.

**Rule**: A restore or import from a file validates scope on every row, not only the file's integrity. Accept only
the tables the export itself would write, with the same module and key. Every tenant-keyed row must carry the
archive's tenant, and every user-keyed row must belong to a user in the archive. Every storage location must be a
plain partition code (checked for shape: a freshly migrated target has no partition rows yet) and a relative path without `..` (`archiveScopeViolations`, `safeAttachmentLocation` in
`club_core/lib/club-offboarding.ts`). Run these checks before writing anything. An export handed to the data subject
or club leaves credentials out: drop the secret tables and null the credential columns (`CLUB_EXPORT_REDACTED_COLUMNS`).
A restored user then sets a password again.

**Applies to**: `club_core` export and restore, the person data export (`people`), any future import that writes rows
or files from a user-supplied archive, and any code path that calls a storage driver's `store` with a path from data.
