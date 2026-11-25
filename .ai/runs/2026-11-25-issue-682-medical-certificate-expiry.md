# Run log — #682 E24-S02 medical certificate expiry (phase 1)

- **Goal and trigger:** Cezar queued `om-auto-fix-issue 682` (label `cezar`, 2026-11-25 05:32 UTC) after the spec PR #687 set
  `.ai/specs/2026-11-23-vereino-training-outlines-and-medical-expiry.md` to Ready. Build phase 1 (REQ-O01…REQ-O05,
  TEST-O01…TEST-O04).
- **Approvals:** owner decisions on #671 (2026-11-24): every Q-O default accepted (Q-O01 a, Q-O05 warn, Q-O06 explicit
  consent), the phase 1 migration `people_persons.medical_valid_until` and the `medical` consent kind approved; recorded
  on #682 (comment 7123135012).
- **Branch / worktree:** `feat/issue-682-medical-certificate-expiry`, Cezar worktree `0276c128`.
- **Route:** feature route of `om-auto-fix-issue` (spec found) → implementation on one PR, `Closes #682`.

## Steps

1. Claimed #682 (assignee, `in-progress`, 🤖 claim comment naming the worktree and branch).
2. Read the spec, the `people` consent model, the life-cycle job, the foundation dispatch, the club job sweep (#629
   landed, so the job is a `declareClubJobs` entry, not `registerModuleSchedule`) and the person data export (#527
   landed, so REQ-O04's export part is delivered here).
3. Backend (commit 1): `lib/medical.ts` (status, reminder days and keys, R20, BR-O1 consent rule, the job's decision;
   100 % unit coverage); `medical` added to `CONSENT_KINDS` and to the club's consent texts; the encrypted column and its
   migration (`yarn db:generate`, one nullable column, scoped); `people.persons.medical.set` + `PUT …/medical`;
   `GET /api/people/medical-status` + DI `people.medicalStatus`; consent commands refuse staff on `medical` and clear the
   date on a withdrawal; erasure and data export; job `people:medical-reminders` (07:00), worker, CLI, e-mail templates
   and notification types; ACL `people.medical.view|manage` and role seeds; isolation probes.
4. Subagent (docs only): compliance pack A15, D-14, R20, data-subject requests; R20 corrected afterwards (the job also
   clears after a departure and the 30-day grace).
5. Subagent (UI, disjoint files): `MedicalStatusTag` in `@vereino/ui`, chips + filter on the roster and the attendance
   list, the match squad section with the warning. Reviewed its diff before committing.
6. Profile (M-O4) on `/club/profile` and `/club/wards/[personId]`, back-office `MedicalPanel` on the person record.
7. Integration tests TEST-O01…TEST-O04 and the `_fixtures/medical.ts` helpers; local runs below.

## Decisions

- **Staff refusal only on an actual change** of the `medical` consent (403 `medical_consent_subject_only`): the back
  office forms send unchanged keys, so a request naming `medical: false` that changes nothing is accepted.
- **Coordinator writes** need `people.medical.manage` and a membership of the person in one of the coordinator's
  sections (through `groups.personFilter`); the coordinator's club-wide basic read does not reach health data, and the
  person record returns the `medical` block to a coordinator only for members of their sections.
- **Not undoable:** `people.persons.medical.set` keeps the date out of audit snapshots (minimisation); the audit context
  says only `set` / `cleared`.
- **Coach reads logged** through `auditedRead` into `people_data_export_log` (purpose `medical_status_read`) instead of
  a new table — no migration beyond the approved one.
- **The 30-day grace at 18** is enforced by the daily job (no consent in force → cleared); `carriedOverConsents` never
  copies `medical` to the adult.
- **Departure clearing (R20):** the job clears the date of a person whose last day has passed.
- **E-mail opt-out:** the spec allows one, but `foundation` refuses `optOut: 'preferences'` today
  (`isOptOutAvailable`), so the templates use `never`.
- **M-O3:** there is no squad-confirmation action in `activities`; the squad (declarations not "no") is listed in the
  coach block with chips and a warning banner; nothing is disabled (Q-O05).
- **Filter "medical: not valid"** = red only (missing, unknown, expired); orange is still valid and its chip warns.
- **Spec status line** left as it is (phase PRs of other phases are open; the first-phase rule says *may*).

## Files changed

See the PR diff: `packages/app/src/modules/people/**` (lib, commands, services, routes, worker, emails, i18n,
migration), `club_core` consent texts, `groups` / `activities` member pages and i18n, `packages/ui/src/member/medical-*`,
`packages/core/src/roles.ts`, `docs/compliance/*`, isolation inventory, `.ai/qa/tests/{people,activities}/TEST-O0*`.

## Commands and results

- `yarn typecheck`, `yarn typecheck:qa`: clean.
- `jest src/modules/people/lib` with coverage of `medical.ts` and `people-rules.ts`: 335 passed, 100 %.
- `yarn workspace @vereino/ui test`: 269 passed, 100 % coverage (subagent run).
- `yarn route-isolation:check`: 219 routes, 566 probes, 0 problems.
- Integration and `yarn verify`: see *Results* below.

## Results

- `yarn test:integration:vereino --filter TEST-O02`: 1 passed (53.5 s) on the first run.
- TEST-O03 and TEST-O04 failed on the first run because of test bugs, verbatim:
  `{"reasons":[{"code":"account_open"}],"error":"This person cannot be anonymised yet.","code":"anonymize_blocked"}`
  (the account closes the day after the last day; the test now closes it first) and `Expected: 200 Received: 201`
  (a new declaration answers 201). After the fixes: TEST-O03 1 passed (45.9 s), TEST-O04 1 passed (48.7 s).
- `yarn test:integration:vereino --filter TEST-O01`: 2 passed (1.0 m), and again after the last refactor.
- `yarn verify`: the first run failed at `lint` (MikroORM imported in two routes, `no-restricted-imports`; a value import
  used only as a type); fixed by moving the reads into `services/medical.ts`; then one full run, all 22 steps passed.
- `yarn guard`: no blocking findings. `yarn test:integration:vereino --filter ISSUE-628`: 1 passed (2.2 m).

## Open problems / next steps

- The lawyer confirms the legal basis (Q-O06) before the production release.
- The club privacy notice (`club_core.privacy`) does not mention the medical date yet — a follow-up.
- An e-mail opt-out for the reminders waits for the foundation's opt-out mechanism.

## Follow-up run: CI integration failures on PR #705 (2026-11-25)

Trigger: required checks `integration (shard 4/6)`, `integration (shard 6/6)` and `integration` failed (run 45559952973).

- Merged `origin/main` into the PR branch (no conflicts).
- `ISSUE-629-retire-club-schedules` (TEST-M06) failed with `Expected: 20 Received: 21`: the new `people:medical-reminders`
  job adds one sweep schedule. Test updated to 21 sweep schedules (real behaviour of this PR, not a regression).
- `TEST-006` failed with `strict mode violation: getByRole('switch', { name: /coaches|trenerom/ }) resolved to 2
  elements`: the new medical consent switch on `/club/profile` names the coaches too. The test now picks the
  share-contact switch by its id `#club-consent-share-contact`.
- `E20-S03-status-word-and-icon` failed once (`Expected: >= 4 Received: 0`) and passed on retry: a race in the test
  (the tags are counted while the list refetches), unrelated to this PR; left as is.
- Local: `yarn test:integration:vereino --filter ISSUE-629-retire-club-schedules`: 1 passed (1.3 m);
  `--filter TEST-006`: 2 passed (1.1 m).
- The CI gate then failed at `qa-texts:check` (the TEST-006 locator change removed hardcoded texts; the baseline only
  shrinks): `TEST-006 ... has 9 hardcoded UI text(s) now; lower its entry to 9`. Baseline lowered 11 → 9;
  `yarn verify --from qa-texts:check`: all remaining steps passed.

## Merge of main after #683 (2026-11-25)

Trigger: PR #705 became `CONFLICTING`/`DIRTY` after #706 (training outlines) merged into `main`. The owner is testing
the PR, so the feature stays unchanged.

- Worked on a detached HEAD at `origin/feat/issue-682-medical-certificate-expiry`, merged `origin/main` (no rewrite,
  no force-push).
- Conflicts only in `groups/i18n/en.json` and `pl.json` (both sides appended keys at the end): kept this PR's
  `groups.club.medical.*` keys and main's `groups.club.nav.outlines`. `packages/core/src/roles.ts`, the activities and
  people catalogs merged automatically.
- `yarn verify`: all 22 steps passed. `yarn test:integration:vereino --filter TEST-O01` (roster medical chips and
  filter, the area of the conflict): 2 passed (1.1 m).
