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

(filled in at the end of the run)

## Open problems / next steps

- The lawyer confirms the legal basis (Q-O06) before the production release.
- The club privacy notice (`club_core.privacy`) does not mention the medical date yet — a follow-up.
- An e-mail opt-out for the reminders waits for the foundation's opt-out mechanism.
