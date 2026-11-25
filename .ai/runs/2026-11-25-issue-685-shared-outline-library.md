# Run log — #685 E24-S05 shared outline library with ratings (training outlines spec phase 4)

- **Trigger:** cezar queue (`cezar` label), skill `om-auto-fix-issue`; started 2026-11-25.
- **Issue:** #685 (epic #671). **Spec:** `.ai/specs/2026-11-23-vereino-training-outlines-and-medical-expiry.md`, phase 4.
- **Branch:** `feat/issue-685-shared-outline-library` (worktree `.ai/cezar/worktrees/32f3ac99-…`).
- **Approvals:** module and migrations on #671 (2026-11-24); the three phase-4 Ask First items (library config and
  secret, library tenant and the AGENTS.md exception DD-O10a, the `library` probe kind) on #685 (2026-11-25, owner
  comment 7154123767). Phase 2 (#683) merged as #706.

## Plan

1. Pure logic `training/lib/library.ts` (config, rater keys, visibility, ranking, credit, snapshot allow-list, report
   threshold) and `lib/image-metadata.ts` (EXIF/metadata strip) with 100 % unit tests.
2. Library entities + migration; `club_core_club_settings.outline_library_max_visibility` + migration.
3. `trainingLibrary` service, commands (publish/withdraw/copy/rate/report/uses/level/author), routes, subscribers.
4. CLI `library-init`, `library-moderate`; departure (`people.departure.training`) and club-delete contributions.
5. ACL + role seeds; isolation probe kind `library`, inventory, seed.
6. UI: M-O8 library pages, publish control, P-O1 public page, B-O1 setting; i18n en/pl.
7. Integration tests TEST-O09…TEST-O14; compliance A16/R21; AGENTS.md exception; README; spec changelog.

## Steps
