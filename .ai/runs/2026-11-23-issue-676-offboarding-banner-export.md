# Run: offboarding banner and the administrator's club export (E22-S06b, #676)

- **Trigger:** Cezar `om-auto-fix-issue` run on issue #676 (label `cezar`, 2026-11-23T13:56Z), unattended.
- **Spec:** `.ai/specs/2026-11-22-vereino-many-clubs-one-instance.md`, phase 4 (REQ-M06, *UI and Interaction
  Contracts* banner row, *API* table); epic E22 #626; follow-up of #632.
- **Branch:** `feat/issue-676-offboarding-banner-export`, stacked on PR #677 (`feat/issue-632-per-club-export-deletion-restore`,
  open and in the merge train when the run started): the story needs its `exportClub` service, the offboarding columns
  and the `club_core.clubs.export` command. Worktree `.ai/cezar/worktrees/a2460fe9-…`.
- **Approval:** owner comment on #676 (2026-11-23) approves the Ask First item *the export route and feature use*:
  `GET /api/club_core/offboarding`, and the export as `POST` (queued job, same `exportClub` service, private storage)
  plus `GET` (download), 409 `club_core.export_running`; the spec table to be updated in the same PR. Anything else
  (table, column, new feature id, platform override, hard deletion) stays Ask First.

## Goal

The club administrator's side of REQ-M06: a `/backend` banner during the notice period with the deletion date and an
"Export club data" action; `GET /api/club_core/offboarding`; the administrator's own export as a queued job with a
download of the finished archive; route isolation probes; an integration test that downloads the archive as the
administrator and gets 403 as another role.

## Steps

1. Claimed the issue (assignee, `in-progress`, `🤖` claim comment naming the run).
2. Found #632's work unmerged (PR #677 open); reset the task branch onto #677's head so this PR builds on it.
3. Read the export engine (`services/club-offboarding.ts`), the job commands, the people import's progress-job use,
   the example module's queued bulk operation, the foundation dispatch queue and the people first-administrator banner
   (`backend:layout:top`).
4. Pure helpers `club_core/lib/club-export.ts` (job type, queue, private partition, archive path per job, the
   offboarding view, which archive a download serves, which archives a new export replaces) with unit tests at 100 %.
5. Command `club_core.clubs.export_request` (club administrator's grant, settings row locked, 409
   `export_unavailable` without a notice, 409 `export_running` while one runs, creates the progress job, audited).
6. Service `club_core/services/club-export.ts` (queue, job lookup through the platform `ProgressJob`, worker body,
   archive read) and worker `club_core:club-export`; `deleteClub` also deletes the stored archives.
7. Routes `GET /api/club_core/offboarding`, `POST`/`GET /api/club_core/offboarding/export` with `openApi`; error
   codes `export_unavailable`, `export_running`, `export_not_found`; i18n in `en` and `pl`.
8. Banner widget `club_core.injection.offboarding-banner` on `backend:layout:top` (feature `club_core.manage`).
9. Isolation inventory: both GETs probed as reads; the POST exempt (it names no record).
10. TEST-M11; spec tables, test row and phase-4 test list updated; changelog file; `docs/ops/clubs.md` and
    `docs/compliance/ropa.md`.

## Decisions

- **Feature gate `club_core.manage`, not `club_core.settings.manage`.** The spec and the approval call
  `club_core.settings.manage` "existing", but no such feature is declared (`club_core/acl.ts`). Declaring it would be a
  new feature id (Ask First again). `club_core.manage` ("Manage club settings and structure") is the existing feature
  the club administrator's role holds through `club_core.*` and no other role holds; the request command additionally
  requires the club administrator's grant (`authorizeScoped`, `club_admin`).
- **No table, no column:** the platform progress job is the export's only state; the archive's path is derived from the
  job's organization and id (`club-exports/org_<org>/<job>.zip` in the private `privateAttachments` partition through
  the storage driver, so the S3 driver works too).
- **One export at a time** is enforced under the settings row's lock, so two simultaneous requests start one job.
- **The worker runs the operator's `club_core.clubs.export` command** with the club's job context, so the export keeps
  its audit entry (file name, checksum, row counts); the request has its own entry naming the job.
- **`GET /api/club_core/offboarding` adds `export`** (the newest job) to the approved `{ noticeAt, deleteAfter,
  exportAvailable }`, so the banner can follow a running export and offer the download.
- **Retention:** a newer export deletes the older archives; `delete-club` deletes every archive with the club.
- **Banner states:** loading and "no notice" render nothing (it sits on every backend page); a failed read shows a
  retry; pending/running, ready (date and size) and failed exports each have a line.

## Files changed

See the PR diff: `club_core` (`lib/club-export.ts` + test, `lib/error-codes.ts` + test, `commands/offboarding.ts`,
`services/club-export.ts`, `services/club-offboarding.ts`, `workers/club-export.ts`, `api/offboarding/**`,
`widgets/injection/offboarding-banner/**`, `widgets/injection-table.ts`, `i18n/*.json`), the isolation inventory,
TEST-M11, the spec, its changelog file, `docs/ops/clubs.md`, `docs/compliance/ropa.md`, this log.

## Commands and results

- `npx jest src/modules/club_core/lib/__tests__/club-export.test.ts …error-codes.test.ts --coverage` — 16 passed,
  `club-export.ts` 100 % lines/branches/functions.
- `yarn generate`, `yarn typecheck`, `yarn typecheck:qa`, `yarn format:check`, `yarn route-isolation:check` (213 routes,
  0 problems), `yarn di-commands:check`, `yarn qa-texts:check`, `yarn i18n:check-hardcoded --strict`,
  `yarn contracts:check`, `yarn ds:check`, `yarn spec-changelogs:check` — all pass.
- `yarn test:integration:vereino --filter TEST-M11` — first run failed on the test's own expectation:
  `Expected: "club_core.export_unavailable" Received: "export_unavailable"` (the API answers the bare code); fixed
  the test; then `1 passed` (twice, the second after the lint fixes below).
- `yarn test:integration:vereino --filter ISSUE-628` (the edited isolation inventory) — `1 passed (2.1m)`.
- `yarn verify` — first run `FAIL lint`: `@mikro-orm/postgresql` imported in a route (REQ-F16; the read moved into
  `services/club-export.ts` `readOffboardingView`), an unnecessary type assertion, a promise passed to `onClick`, and
  `Date.now` called during render in the banner (now compared with the query's `dataUpdatedAt`), plus `String()` on a
  string in the test. After the fixes `yarn verify` — `all 22 step(s) passed`.

## Open problems / next steps

- The PR is stacked on #677; once #677 merges, merge `main` into this branch (no conflicts expected outside #677's own
  files) and rerun TEST-M07 and TEST-M11.
