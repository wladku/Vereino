---
title: "An archive a restore reads is untrusted input; checksums inside it prove nothing"
modules: ["club_core", "attachments", "auth"]
areas: ["module-data", "architecture"]
topics: ["restore", "archive", "tenant-isolation", "path-traversal", "credentials", "privilege-escalation"]
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

**Rule, part 2 (#806)**: a row inside the archive's own tenant can still carry a privilege no club holds, or point
outside the club. In Open Mercato a super-admin ACL (`role_acls` / `user_acls.is_super_admin`) is instance-wide, and a
`user_roles` row may name any role, including the instance's own super administrator role. So a restore also (a)
checks the user, role and organization references of the privilege-bearing platform tables against the archive's own
records and refuses a `system` schedule (`ARCHIVE_REFERENCES` in `club_core/lib/club-offboarding.ts`), and (b) writes
every row through `sanitizeRestoreRow`: no super-admin flag, no tenant-restricted feature (`*`, `directory.*`,
`directory.tenants…`, the same set the platform's ACL editor drops for a tenant's users), only the archive's
organizations, redacted columns null. Restoring a value a club could never set through the app is the test: if a
tenant administrator cannot grant it, the restore must not write it.

**Applies to**: `club_core` export and restore, the person data export (`people`), any future import that writes rows
or files from a user-supplied archive, and any code path that calls a storage driver's `store` with a path from data.
