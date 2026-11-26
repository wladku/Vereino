# Run: issue #806 — internal security review finding U5-1

- **Goal and trigger**: Cezar queued `om-auto-fix-issue` for #806 (label `cezar`). Fix the one high finding of the
  internal security review of 2026-11-26 (#743, unit U5). The details sit in a private draft security advisory, so
  comments, commits and the PR title stay neutral until the fix is merged.
- **Issue / branch**: #806, `fix/issue-806-security-u5-1` (worktree under `.ai/cezar/worktrees/`).
- **Route**: bug chain, `module-data` + `debugging` (club_core restore). No spec gate: a security fix inside an existing
  phase-4 feature of `.ai/specs/2026-11-22-vereino-many-clubs-one-instance.md`; changelog entry added.

## Steps

1. Read the private advisory through the GitHub API (maintainer access) and the restore code
   (`club_core/lib/club-offboarding.ts`, `club_core/services/club-offboarding.ts`).
2. Checked the platform (`@open-mercato/core` 0.9.0, read-only) for what makes a restored row instance-wide:
   `rbacService.loadAcl` → `isGlobalSuperAdmin` treats a user ACL or an unrestricted role ACL with `is_super_admin` as
   global; a `user_roles` row may name any role, including the instance's super administrator role; the platform's ACL
   editor drops `*`, `directory.*`, `directory.tenants*` for a tenant's users; club tenants are created with
   `includeSuperadminRole: false`, so no club's own seeded role holds these grants. The scheduler runs a command as the
   schedule's `created_by_user_id`, whose ACL is loaded the same way.
3. Fixed the restore so that the archive is untrusted beyond its tenant key:
   - `archiveScopeViolations` also refuses rows of the privilege-bearing platform tables whose user, role or
     organization reference is not one of the archive's own records, and a `system` schedule
     (`ARCHIVE_REFERENCES`; reason `<table>: a reference outside the club`).
   - `sanitizeRestoreRow` (new) is applied to every row `restoreClub` writes: role/user ACLs lose the super-admin flag,
     tenant-restricted features and organizations outside the archive; the export's redacted columns stay null.
4. Unit tests in `club_core/lib/__tests__/club-offboarding.test.ts` (100 % line/branch/function coverage of the file).
5. Extended integration test `TEST-M07` (`packages/app/.ai/qa/tests/club_core/TEST-M07-club-export-delete-restore.spec.ts`):
   a foreign-role `user_roles` row is refused; the on-instance restore uses an archive edited to grant every club role
   the super-admin flag plus `*` and `directory.tenants.manage`, and the restored ACLs carry none of them while the
   administrator still reads the club's persons.
6. Docs `docs/ops/backups.md` (*Restoring one club*), lesson `restore-archive-is-untrusted-input` (part 2), spec
   changelog entry.

## Decisions

- **No archive signature (HMAC) in this PR.** The advisory names it as "better still". `BACKWARD_COMPATIBILITY.md`
  §7 protects the archive format `vereino-club-export` v1, "which `restore-club` must keep reading", and the key would
  be a new instance secret (config contract). Both are Ask First, and the row checks above close the instance-wide
  path without them. Left as a follow-up for the owner to decide (noted in the advisory hand-off, not in public text).
- **Sanitize rather than refuse ACL grants.** A legitimate archive of a tenant created before `create-club` could hold a
  super-admin role; refusing it would block a disaster-recovery restore. Writing it without the grant is safe, and the
  operator can re-grant by hand (documented).
- **References checked only on the privilege-bearing platform tables**, not on every `organization_id` / user column:
  audit rows may legitimately name the operator, and a refused legitimate restore is the worse failure.

## Files changed

- `packages/app/src/modules/club_core/lib/club-offboarding.ts`
- `packages/app/src/modules/club_core/services/club-offboarding.ts`
- `packages/app/src/modules/club_core/lib/__tests__/club-offboarding.test.ts`
- `packages/app/.ai/qa/tests/club_core/TEST-M07-club-export-delete-restore.spec.ts`
- `docs/ops/backups.md`
- `.ai/lessons/restore-archive-is-untrusted-input.md`
- `.ai/specs/changelog/2026-11-22-vereino-many-clubs-one-instance/2026-11-26-issue-806-restore-grants.md`
- `.ai/runs/2026-11-26-issue-806-security-u5-1.md`

## Commands and results

- `yarn workspace @vereino/app jest src/modules/club_core/lib/__tests__/club-offboarding.test.ts` — 36 passed;
  coverage of `club-offboarding.ts` 100 / 100 / 100 / 100.
- `yarn lessons:check`, `yarn spec-changelogs:check` — valid.
- `yarn verify` — first run failed at `format:check` (`TEST-M07-club-export-delete-restore.spec.ts` and
  `club-offboarding.test.ts` "is not formatted"); after `yarn format`, `yarn verify --from format:check` passed all 17
  remaining steps (the 6 before it had passed).
- `yarn test:integration:vereino --filter TEST-M07` — 2 passed (1.7 m), including
  `TEST-M07 a club is exported, deleted after notice, restored, and round-trips into an empty database` (44.6 s).

## Open problems / next steps

- Owner decision on archive authenticity (instance-key HMAC on the manifest, refusing unsigned archives unless the
  operator overrides) — a format and config contract change.
- Re-run `om-auto-sec-report-pr` on the PR (acceptance criterion); close or publish the advisory after the merge.
