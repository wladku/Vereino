# Run: per-club export, deletion and single-club restore (E22-S06, #632)

- **Trigger:** Cezar `om-auto-fix-issue` run on issue #632 (label `cezar`, 2026-11-23T13:04Z), unattended.
- **Spec:** `.ai/specs/2026-11-22-vereino-many-clubs-one-instance.md`, phase 4 (REQ-M06, DD-M09, BR-M4, TEST-M07).
- **Branch:** `feat/issue-632-per-club-export-deletion-restore`; worktree `.ai/cezar/worktrees/f1d7f123-…`.
- **Approval:** owner comment on #632 (2026-11-23) approves the migrations the phase needs as the spec defines them;
  #644 (spec `Ready for implementation`) merged 2026-11-23T06:59Z, so the build gate was met.

## Goal

Per the issue: a per-club export (every row and file of one club, open format), a per-club deletion after the
notice period with one audit entry, a documented single-club restore drill; tested with two clubs (the other club
untouched, the export round-trips into an empty staging database); `docs/ops/backups.md` and
`docs/compliance/retention.md` updated.

## Steps

1. Claimed the issue (assignee, `in-progress`, `🤖` claim comment naming the run).
2. Read the spec, the create-club implementation (#630) and the person-export contributor pattern of open PR #609.
3. Started a scratch PostgreSQL container of this run (`vereino-632-scratch`, own port) and `yarn initialize`d it to
   read the catalogue: 120+ tables carry `tenant_id`; `tenants`, `sessions`, `password_resets` and `user_roles` do
   not; only 11 foreign keys exist, all among platform tables.
4. Migration `Migration20261123131637_club_core` (two nullable `timestamptz` columns on `club_core_club_settings`),
   generated with `yarn db:generate`, applied only to the scratch database.
5. Contributors: each Vereino module lists its tables in `lib/club-tables.ts` and registers them in `di.ts` through
   the foundation's `registerClubDataContributor` under `club_core.clubExport.<module>` and
   `club_core.clubDelete.<module>`; the platform tables are in `PLATFORM_CLUB_TABLES` (`club_core/lib/club-offboarding.ts`)
   with a key (`tenant`, `user`, `tenant_row`) and a kind (`data`, `derived`, `secret`).
6. Engine `club_core/services/club-offboarding.ts`; job commands `club_core.clubs.offboard|export|delete|restore`
   (audit entries); CLI `club_core/services/offboarding-cli.ts`; event `club_core.club.deleted`.
7. Hand checks on the scratch database (two clubs): export, refusal before notice, delete, restore into the same
   database and into a freshly migrated empty database `staging`; re-exports equal the original apart from the audit
   log.
8. Unit tests (100 % for the new `lib/` files), TEST-M07 integration test, docs, AGENTS.md note, BC entry, spec
   changelog file, lesson, follow-up issue #676.

## Decisions

- **Accounting rows are returned, not kept** (the issue said "kept as the retention rules require"; the spec's REQ-M06
  and AC-M06 say "deleted completely"). The owner told the run to proceed without questions, so the approved spec
  wins: the archive hands the club its accounting records (the club, not the processor, carries the obligation of
  *ustawa o rachunkowości* art. 74) and `delete-club` deletes them; written into `docs/compliance/retention.md`.
- **Banner and administrator export route split out** to #676: the issue's acceptance criteria do not ask for them,
  the spec lists the route as Ask First, and the PR was already large.
- **Catalogue check at run time**: export and deletion refuse (`tables_not_covered`) while a table with `tenant_id`
  is not listed, instead of only a test catching it.
- **Rows as PostgreSQL prints them** (`to_jsonb(t)::text`, restored with `json_populate_recordset`), numbers kept
  exact through the JSON source text; encrypted columns decrypted on export (fail closed if one stays sealed) and
  encrypted again on restore with the target's key.
- **Tombstone**: the club's settings row stays with `deleted_at`, the slug, time zone and dates (contact data cleared)
  for 90 days (BR-M4); the deletion's audit entry stays as the club's only other row.
- **Minimum notice 30 days**, `--notice-days` 30–365 (Q-M06). Tests move the date in SQL.
- **Not exported**: sessions, password resets, API keys, integration credentials, channel thread tokens (secret);
  search and query indexes, progress jobs, quota reservations, dead letters (derived).
- **Not done**: a BullMQ payload scan for pending one-off jobs (repeatables are unregistered through the scheduler;
  a stray job finds no rows); key destruction waits for a key store (Q-M07).

## Files

- `packages/app/src/modules/club_core/`: `lib/club-offboarding.ts`, `services/club-offboarding.ts`,
  `services/offboarding-cli.ts`, `commands/offboarding.ts`, `cli.ts`, `data/entities.ts`, `data/queries.ts`,
  `events.ts`, `lib/error-codes.ts`, `i18n/en.json`, `i18n/pl.json`, migration + snapshot, tests.
- `packages/app/src/modules/foundation/`: `lib/club-data.ts`, `services/club-data.ts`, `index.ts`, `di.ts`.
- Every Vereino module: `lib/club-tables.ts`, its test, `di.ts`.
- `packages/app/.ai/qa/tests/club_core/TEST-M07-club-export-delete-restore.spec.ts`.
- `docs/ops/clubs.md`, `docs/ops/backups.md`, `docs/compliance/retention.md`, `docs/compliance/ropa.md`,
  `AGENTS.md`, `BACKWARD_COMPATIBILITY.md`, spec changelog file, lesson
  `cli-json-result-line-is-not-the-last-json-line`.

## Commands and results

- `yarn typecheck` — pass. `yarn test` — 1818 tests pass, coverage thresholds met.
- Scratch database by hand: export 20 KB archive; delete left `{action_logs: 1, club_core_club_settings: 1}` for the
  club, the other club's 144 rows unchanged; restore into the same and into an empty migrated database; re-exports
  equal apart from `audit_logs`.
- `yarn test:integration:vereino --filter TEST-M07` — first run failed:
  `expect(shortNotice.output).toEqual({ status: 'invalid', … })` received a pino log line
  (`"msg":"pg pool created with options"`): in production mode the logger prints JSON lines after the command's line.
  Fixed (options checked before boot; the test picks the line with `status`) and recorded as a lesson. Second run
  failed: `TypeError: Cannot read properties of null (reading 'async')` — the test read the `data/` directory entry of
  the ZIP; fixed. Final result: see the PR.

## Open problems / next steps

- #676: the administrator's banner and export route (Ask First for the route).
- Key store (Q-M07) before a second club's real data; then `delete-club` destroys the key.
- Phase 1 (#629) subscribes `removeClub` to `club_core.club.deleted` and adds `foundation_club_jobs` to the
  foundation's `lib/club-tables.ts` (the catalogue check will refuse until it does).
