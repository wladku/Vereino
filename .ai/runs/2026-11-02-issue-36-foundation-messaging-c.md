# Issue #36: foundation III phase C — cases

- **Date:** 2026-11-02
- **Agent / tool:** Claude Code (Opus 5.5), `om-auto-fix-issue` with the repo-local override applied, one implementation subagent, and the coordinator's own review and gate
- **Trigger:** `/om-auto-fix-issue 36`, the last story of epic #23, after phase B (#35) was built.
- **Spec / issue / branch:**
  - Spec: `.ai/specs/2026-10-27-vereino-foundation-messaging-primitives.md`, *Implementation Phases → Phase C* (REQ-M09, J-M03, TEST-M09, AC-M09), with the club spec's phase 3 step 3 (REQ-010, TEST-016, AC-010, R01).
  - Issue: #36 (E04-S02), epic #23.
  - Branch: `feat/issue-36-cases`, cut from #35's branch; merged with `main` after PR #74 (#35) merged.
- **Status:** completed, PR open for review (#74 merged on 2026-11-02).

## Goal

A coordinator or the administrator marks a thread as a case. From then on no message of it can be edited or deleted, the marking cannot be undone, and only the section's coordinator and the administrator see it in a case register.

## Steps

1. Claimed #36 and created a worktree stacked on #35's branch.
2. **Subagent:** the `mark_case` command and route, the case guard in revise and delete, the read model fields, the case register, the "Mark as case" action with a confirmation, the read-only banner, TEST-M09 / TEST-016, and unit tests.
3. While it worked, #35's whole suite found the axe baseline defect; the subagent applied the same fixture patch unchanged, and the coordinator merged #35's branch afterwards.
4. **Coordinator review:**
   - `openCase` is a conditional update narrowed to tenant and organization;
   - the route requires `communication.cases.manage`, the command a coordinator grant on the thread's section or the club administrator, and the thread version;
   - the case refusal comes first in revise and delete, for every author and staff role;
   - no migration, no dependency, nothing from REQ-017, A05 or retention.
5. **Coordinator gate:** `yarn verify` and the whole integration suite.

## Decisions

- **Acting role (R01):** recorded in the action log (`context.actingRole`) and the response; who and when are in `case_opened_by_person_id` and `case_opened_at`. No new column.
- **Replies on a case** are still appended; only edits and deletions are refused, and the banner says so.
- **The banner** is shown on the admin thread page only; the member page is unchanged.
- **The register** is the threads list with `?isCase=1`, newest activity first, with "Case since" and "Marked by".
- **One test file** `TEST-M09-TEST-016-cases.spec.ts` asserts every oracle of both rows, so either filter selects it.

## Installed behaviour that differed from the spec

- A non-undoable command has no undo token at all; the undo endpoint answers 400 "Undo token not available". Only the club's platform role can read and undo action logs, so the undo refusal is checked on a marking by the administrator.
- The platform confirmation dialog is a native `<dialog role="alertdialog">`.
- `authorizeScoped` checks the lock first, so a second marking with a stale token answers `optimistic_lock_conflict` before `case_already_open`.

## Files changed

- `packages/app/src/modules/communication/`: `lib/case-rules.ts` with its test, error codes, events, validators, `data/queries.ts` (`openCase`), `commands/threads.ts`, `services/threads.ts`, route `api/threads/[id]/case`, the revise/delete route's OpenAPI, `components/{ThreadRecord,ThreadsTable,CasesTable,client-helpers}`, page `backend/communication/cases`, i18n, README.
- QA: `communication/TEST-M09-TEST-016-cases.spec.ts`; `_fixtures/communication.ts`; the `Family` type in `_fixtures/attendance.ts`; the axe fixture patch from #35.
- `.ai/lessons.md` and two lessons; this run log.

## Commands and results

- **`yarn verify`:** subagent's final run 13/13; coordinator's rerun 13/13 (159 s).
- **`yarn test:integration:vereino --filter <id> --port 5101`**, subagent's runs: TEST-M09 (2 passed), TEST-016 (2 passed), TEST-M05, TEST-M06, TEST-M10 and ENG-TEST-25 (each passed).
- **`yarn test:integration:vereino`**, whole suite, coordinator's run: 97 passed, none flaky (51.9 min).
- No migration, no dependency, no `db:migrate`.

## Open problems

- Edit and delete controls in the UI are still not built (the API exists and is integration-tested here).
- No case banner on the member page; no test asserts the `communication.case.opened` event.
- Case export and retention (Q13 / Q-019) stay out.

## Next steps

- Owner review of this PR.
- Epic #23's exit gate: the J-003 journey (steps 1, 2, 4 and 5).
