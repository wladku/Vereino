# Run: issue #471 — former participants anonymised after the club's retention period (E19-S05)

- **Trigger:** Cezar run (task 4434cdc0), `om-auto-fix-issue 471`, after the owner approved the migration on the issue (2026-11-22).
- **Issue / spec:** #471; club spec `.ai/specs/2026-10-20-vereino-club-management.md` REQ-041, AC-041, TEST-086 (amendment B); engineering standards S9.5, S9.6.
- **Branch:** `feat/issue-471-anonymise-former-participants` (worktree `.ai/cezar/worktrees/4434cdc0-c20c-4e41-9d4e-352bf9abfb4d`).
- **Route:** feature with a covering spec (REQ-041 already specified, no new spec); Ask First item (migration) approved on the issue.

## Goal

A club setting "anonymise former participants after N months" (default 12, 1–120) on the club settings page, and a daily job per club that anonymises former participants and guardians through the existing `people.persons.anonymize`, keeping accounting rows, one audit entry each, idempotent, counts-only logs.

## Steps

1. Read the issue, the previous run's stop comment (migration proposal) and the owner's approval: migration approved as written; "retention hold" = an unpaid or disputed charge, no separate flag. Claimed the issue (assignee, `in-progress`, 🤖 comment).
2. `club_core`: `formerParticipantRetentionMonths` added to the typed settings (`lib/settings.ts`: range, default, rule problem `retention_months_out_of_range` 422 on the field), entity column with `@Check`, update validator, service, command (write + undo), route OpenAPI, the settings form (group "Data retention"), catalogs `en`/`pl`, README error code.
3. Migration generated with `yarn db:generate` against an unreachable database (`DATABASE_URL=postgres://x:x@127.0.0.1:1/none`), then edited: `lock_timeout`, `drop … if exists` in `down`, header comment. Snapshot reformatted with prettier (`--parser json`) so the diff holds only the column and the check.
4. `people`: pure rule `lib/retention-rules.ts` (`monthsBefore`, `latestEnd`, `retentionKeepReasons`) with 100 % unit coverage; `services/retention-sweep.ts` (facts from role assignments, guardianships, every departure contributor's `preview` on the cutoff, and the payments notices; one command per person); `people.persons.anonymize` accepts `{ id, reason: 'retention_sweep' }` from a job context only and re-checks the rule on the locked row; job command `people.persons.retention_sweep`, worker `people:retention-sweep`, schedule (03:00 club zone) registered at setup for a new club, CLI `people retention-sweep [--dry-run | --register-schedule]`.
5. Docs: `docs/ops/deploy.md` per-club line (dry run, then `--register-schedule`), `docs/compliance/retention.md` R3 from "Gap" to the job, people README, spec changelog file.
6. TEST-086 written and run locally.

## Decisions

- **Anchor on `left_on`.** A person qualifies only after a departure; everything else (roles, guardianships, other modules' records) must end on or before the cutoff. A person who never left (e.g. a guardian not recorded as departed) is not swept — conservative; see open problems.
- **Other modules through the departure contributors' `preview(lastDay = cutoff)`.** It already answers "what of this person is live after this day" for groups, activities, club_core, facilities and gives the payments open charges and cash held, so `people` imports no other module and no contract changes.
- **Same command, job-only variant.** REQ-041 names `people.persons.anonymize`; the variant is selected by `reason: 'retention_sweep'`, parsed by its own strict schema and authorized only with the `system_job` grant (`scopeSource: { job: true }`), so a session gets 403 and the HTTP route (which strips unknown keys) cannot send it. The rule is checked again in the transaction.
- **Audit:** `reason` and `requestId` (null for the sweep) added to the result and the log context; `erasure_request_and_decision` is kept only for an erasure on request.
- **Existing clubs get the schedule after a dry run** (like `people:life-cycle`), because the first real run anonymises everyone who left long ago; `bootstrap-admin` leaves it out.
- **Check constraint name** shortened to `club_core_club_settings_retention_months_check`: the approved name has 65 characters, over PostgreSQL's 63, and would be truncated silently. Recorded in the migration and the spec changelog.

## Files changed

- `packages/app/src/modules/club_core/`: `lib/settings.ts`, `lib/error-codes.ts`, `data/entities.ts`, `data/validators.ts`, `services/settings.ts`, `commands/settings.ts`, `api/settings/route.ts`, `components/ClubSettingsForm.tsx`, `i18n/en.json`, `i18n/pl.json`, `README.md`, `migrations/Migration20261122073929_club_core.ts`, `migrations/.snapshot-open-mercato.json`, `lib/__tests__/settings.test.ts`, `lib/__tests__/error-codes.test.ts`.
- `packages/app/src/modules/people/`: `lib/retention-rules.ts` (+ test), `lib/erasure-rules.ts` (+ test), `services/retention-sweep.ts`, `services/club-clock.ts`, `services/club-setup.ts`, `commands/erasure.ts`, `commands/jobs.ts`, `data/validators.ts`, `workers/retention-sweep.ts`, `cli.ts`, `i18n/en.json`, `i18n/pl.json`, `README.md`.
- `packages/app/.ai/qa/tests/people/TEST-086-retention-sweep.spec.ts`.
- `docs/ops/deploy.md`, `docs/compliance/retention.md`, `.ai/specs/changelog/2026-10-20-vereino-club-management/2026-11-22-issue-471-retention-sweep.md`.

## Commands and results

- `yarn typecheck` — exit 0.
- `npx jest src/modules/people/lib src/modules/club_core/lib` — after updating `error-codes.test.ts` for the new code: all suites pass; `retention-rules.ts`, `erasure-rules.ts`, `settings.ts` at 100 % lines/branches/functions.
- `yarn test:integration:vereino --filter TEST-086` — first run failed on an exact label match (the label carries the required marker " *"); second on the audit read (a job entry needs `audit_logs.view_tenant`, lesson updated); third run: 1 passed (43.6 s).
- Older tests touched by the change, one id per run: TEST-L07, TEST-078, E02-S01, TEST-F09, ENG-TEST-25 — all passed.
- `yarn verify` — first run failed at `lint` (`CalendarDate | 'open'` is a redundant union; replaced by the `OPEN_END` date); after the fix a full run passed all 19 steps.
- `yarn guard` — no blocking findings.

## Open problems / next steps

- The public privacy text (`club_core.privacy.retention.item1`) still says "12 months"; with a club-set period it should name the club's value. Follow-up.
- A guardian who is never recorded as departed (no `left_on`) is not swept even when their wards left long ago; sweeping persons without `left_on` needs a decision on what counts as "membership ended" for a non-participant.
- People schedules are not re-registered when the club's time zone changes (as for `people:life-cycle`).
