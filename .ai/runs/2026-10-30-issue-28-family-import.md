# Issue #28 — bulk import of families from CSV and XLSX (club spec phase 1 step 8)

- **Date:** 2026-10-30
- **Agent / tool:** Claude Code (Opus 5.5), `om-auto-fix-issue` (installed from `open-mercato/skills`, repo-local override applied; feature route) with one implementation subagent (which used a reader subagent) and the coordinator's own review and gate
- **Trigger:** product owner — "/om-auto-fix-issue 21"; #28 was the last open story of epic #21. Owner decisions: "CSV + XLSX przez jszip" and "Tylko osoby i opiekunowie"; migrations generated on a throwaway database as for #29
- **Spec / issue / branch:** `.ai/specs/2026-10-20-vereino-club-management.md` phase 1 step 8 (REQ-036, AC-036, DD-38, D-023, D-026, Q-044, TEST-051); issue #28 (epic #21); branch `feat/issue-28-people-import`
- **Status:** completed — PR open for review

## Goal

The administrator uploads the club's CSV or XLSX, maps the columns once, sees every row classified, decides the doubtful ones and commits; people and guardianships exist once, without duplicates, and the import is recorded with who ran it.

## Steps

1. Read #21: #25, #26, #27 and #29 were merged, #28 was the last story. Asked the owner about the XLSX reader (no spreadsheet package declared; `jszip` and `fast-xml-parser` already resolved in `yarn.lock` through platform modules) and the group column (`groups` is enabled since #30).
2. Claimed #28 (assignee, `in-progress`, 🤖 comment with both decisions); worktree from `main` (55b0e9e).
3. Subagent: FR triage (the two step 8 consents were built by #27; `pesel_hash`, encryption, scope primitives, the job pattern and `attachments` reused), then the readers, mapping and classification rules, data model and migration, commands, routes, the purge job, pages and integration tests. Interrupted once by an API session limit and resumed in the same worktree; nothing was half-written.
4. Coordinator review: `package.json` gains the two declarations and `yarn.lock` only the two workspace descriptor lines, no new resolution; the migration adds two tables and two nullable columns plus a partial unique index on `people_persons` with `lock_timeout` and a hand-written `down()`; every import route needs `people.manage` and `people.pesel.view`; matching never uses a name without an identifier anchor; `yarn verify` and the whole integration suite rerun by the coordinator.

## Decisions

- Limits: files up to 5 MB, 1 000 data rows, 100 columns; a cell over 1 000 characters is cut; XLSX at most 500 zip entries and 30 MB inflated across the parts read, enforced while streaming; an XML part with a DOCTYPE is refused; the format is read from the bytes.
- Mapping: headers normalised (lower case, no Polish diacritics, no punctuation) and matched against en and pl synonyms with child / guardian qualifiers and the numbers 1 and 2; the page reads the header in the browser with the same pure reader. One row holds the participant, up to two guardians and a group.
- Matching (Q-044): only by `pesel_hash` or the new `external_id_hash`; a person without an identifier only through a matched relative of the same row with the same name (a guardian of the matched child, a ward of the matched guardian); a row with no identifier goes to `review` (`identifier_missing`). Within one file the same identifier is one person, a guardian without an identifier is the same person by name and e-mail or phone, a participant by name and birth date; a repeated row is `import_row_duplicate`; an identifier seen with a different name or birth date, or a PESEL and identifier pointing at two people, is `import_identifier_conflict`.
- Updates: a matched person gets only the values the file has and that differ; PESEL and identifier are set only when the record has none. The first guardian becomes primary payer when the ward has none.
- Commit: the whole import is one batch in one transaction, re-planned against the club, so it writes everything or nothing; re-importing the same file creates nothing.
- Undo: `decide_row` and `cancel` undoable while the import is open; `create` not (the bytes are not in the command input; cancel compensates); `commit` not as a whole, but each person and guardianship it writes has its own undoable audit entry.
- Group column: kept on the row; at commit a row with a group gets `group_name` and `membership_status = 'groups_not_enabled'`; no membership is created. The purge deletes every other row but keeps such a row with only its ids and the group label (`raw` set to null) until the `groups` hook processes it (product owner, 2026-10-30: "Keep them").
- A preview left open for 30 days is cancelled and purged by the job.

## Installed behaviour that differed from the spec

- The generic `/api/attachments` upload needs `attachments.manage`, which no Vereino role holds, so `POST /api/people/imports` takes the file and the mapping in one multipart request (the `club_core` pattern of #29).
- `ScopedAttachmentUploadService` adds the owner as an assignment, and `releaseScoped` refuses a file with more than one; the import file carries only the owner `people:person_import`.
- `/api/attachments/file/{id}` serves any attachment to any signed-in user of the organization without a feature check; the import file's id appears in no response, so "readable only with `people.pesel.view`" rests on the id's secrecy.
- Encrypted fields decrypt to strings, so `raw` is encrypted `text` holding JSON, not `jsonb`.
- Nested `commandBus.execute` flushes side effects at once; the commit passes `transactionalEm` and `bulkImport` suppression, drops `request` from the nested context and emits events and index updates after its own commit.
- `groups` is enabled and no `groups.membershipImporter` exists, so the spec's `groups_not_enabled` path is a stored state, not a module check.
- An empty platform `DataTable` fails axe `scrollable-region-focusable` at 375 px; the empty history is a heading and a sentence.

## Files changed

- `packages/app/package.json`, `yarn.lock` — `jszip` and `fast-xml-parser` declared at the resolved ranges
- `packages/app/src/modules/people/{lib/import-*.ts,lib/error-codes.ts,lib/__tests__/*}` — readers, mapping, classification, codes, unit tests
- `packages/app/src/modules/people/{data,encryption.ts,search.ts,migrations,commands/imports.ts,commands/jobs.ts,commands/persons.ts,commands/shared.ts,events.ts,services/import-*.ts,services/club-setup.ts,workers/purge-import-rows.ts,cli.ts}` — model, commands, job
- `packages/app/src/modules/people/{api/imports/**,api/imports-shared.ts,api/persons/route.ts,api/shared.ts,backend/people/imports/**,components/imports/**,i18n,README.md}` — routes and pages
- `packages/app/.ai/qa/tests/{_fixtures/imports.ts,people/TEST-051-family-import.spec.ts,people/E02-S04-family-import.spec.ts}` — tests (the XLSX is built in the test with JSZip)
- `.ai/specs/2026-10-20-vereino-club-management.md` — note under phase 1 step 8, changelog
- `.ai/lessons.md`, three lessons; `.ai/runs/2026-10-30-issue-28-family-import.md` — this log

## Commands and results

- `yarn verify` — 13/13 passed in the subagent's run (Jest 15 suites, 200 tests; 100 % coverage of the import readers and rules); coordinator's rerun: 13/13 passed.
- `yarn test:integration:vereino` (whole suite) — 69/69 passed in the subagent's run (28.3 min); coordinator's rerun: 69/69 passed (16.6 min).
- `yarn db:generate` against a throwaway pgvector container with an explicit `DATABASE_URL` (port 55441, removed afterwards); up, down, up as raw SQL there, then a second `db:generate` with no changes; the generated `.env` deleted. No `yarn db:migrate` against a real or dev database.

## Open problems

- Resolved: the product owner confirmed (2026-10-30, "Keep them") that rows with a group outlive the 30-day purge with only ids and the group label until the `groups` hook, as an exception to DD-38.
- The import file's protection is the secrecy of its attachment id (platform behaviour of `/api/attachments/file/{id}`).
- Deferred: the `groups.membershipImporter` hook and memberships (D-026); a progress job for large files; `externalId` on the person pages; re-registering the purge schedule when the club's time zone changes.

## Next steps

- Owner review of the PR.
- Phase 2: the `groups` hook picks up rows with `membership_status = 'groups_not_enabled'`.
