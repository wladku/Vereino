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
1. Claimed #685 (assignee, `in-progress`, 🤖 comment); renamed the branch. Phase 2 (#706) and phase 3 were on `main`.
2. Pure logic `training/lib/library.ts` and `lib/image-metadata.ts` with 100 % unit tests.
3. Entities and migrations (`db:generate` offline against an unreachable database; the club_core snapshot kept in its
   style by inserting only the new column; a second `db:generate` reports no changes).
4. `trainingLibrary` service, commands, routes, subscribers, CLI, departure and club-deletion contributions, ACL and
   role seeds; club setting B-O1; guard probe kind `library`; harness configures `VEREINO_LIBRARY_*`. Committed.
5. UI: library list and entry pages, Sharing panel, public page, session-card link; en/pl catalogs.
6. Integration tests TEST-O09…TEST-O14 and `_fixtures/library.ts`; docs (AGENTS.md exception, BACKWARD_COMPATIBILITY.md,
   `.env.example`, ropa A16, retention R21, README, spec changelog), lesson `cross-tenant-library-and-test-pitfalls`.

## Decisions

- Rater secret format `v<n>:<secret>` (comma list) so rotation never re-keys (DD-O12); newest keys new rows.
- Published images keep their bytes with metadata blocks stripped (no image dependency; a dependency is Ask First).
- A club's library rows are deleted by a new optional DI token `club_core.clubDeleteBeyondTenant.<module>`, run in
  `delete-club`'s transaction (the existing contributor names tenant tables only).
- Entry payloads never carry the source club or outline id; public reports count but never hide; `restore` settles
  reports. Copies (and their session copies) keep `origin_entry_id`, so a library outline attached to a session via
  "my outlines" still records a use.
- A15/R20 of the compliance pack are left to phase 1 (#682); phase 4 adds A16 and R21.

## Commands and results

- `yarn jest src/modules/training/lib` — 100 % coverage; `node --test scripts/__tests__/check-route-isolation.test.mjs` — 12 pass.
- `yarn test:integration:vereino --filter TEST-O09` (build) then `--no-build` O10, O11, O12, O13, O14 — each `1 passed`.
  First runs failed and were fixed: O09 `attendance_version_required` (wrong lock token in the fixture), O14
  `notice_running` (dry run before the notice ended).
- `VEREINO_ISOLATION_MODULES=training … --filter ISSUE-628` — 1 passed (CI runs all modules).
- Regression of touched areas: TEST-M07 (club deletion, 2 passed), TEST-L07 (anonymisation, 3 passed), E20-S07
  (settings page, 1 passed).
- Screenshots at 375 px, en/pl, light/dark (cockpit artifacts `shots/`): no console errors; axe scans in O09/O11 pass.
- `yarn verify` — all 18 steps pass (after lint fixes: return-await, `@mikro-orm` imports moved into the service).
- `yarn guard` — no blocking findings (warning: AGENTS.md changed — the owner-approved DD-O10a exception).

## Open problems / next steps

- The lawyer confirms the licence and terms (Q-O03) before the production release; the public page stays `noindex`.
- The operator sets `VEREINO_LIBRARY_*` (and the secret) and runs `yarn mercato training library-init` on deploy.
- The full ISSUE-628 run (all modules) is left to CI.
