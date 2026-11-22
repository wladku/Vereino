# Run: issue #599 — "Former member" on the history screens (AC-L06)

- **Trigger:** Cezar run 82955a06 (`om-auto-fix-issue 599`, label `cezar`), unattended.
- **Issue:** #599 (epic #565); spec `.ai/specs/2026-11-14-vereino-people-life-cycle-and-data-entry.md`, AC-L06.
- **Branch:** `test/issue-599-anonymised-former-member-labels`.

## Goal

After anonymising a person with history, prove that the attendance list, the coach units report, a message thread and
the charges list read "Former member" with no former name or contact; fix any screen that still shows the old name.

## Steps

1. Claimed the issue (assignee, `in-progress`, `🤖` claim comment naming this run).
2. Traced how each screen gets names: every one reads them through `people.personDirectory.findPersons`, which already
   returns the localised "Former member" with an empty last name for an anonymised person (`people/services/person-directory.ts`).
   The attendance list, the thread reads and the charges list trim the joined name; the coach units report did not
   (`activities/services/coach-units.ts`: `"Former member "` with a trailing space, also in the CSV).
3. Fixed the units report join with `.trim()`, as the attendance list and the thread reads already do.
4. Added `TEST-L24-former-member-history-screens` (new id: TEST-L07 is already a long test at its 420 s budget; the
   new file stays one id per run). A coach and an adult participant, both with accounts, build history (a closed
   session with a mark, a group announcement with a reply, a paid charge); the reads first show the real names (the
   oracle), then both leave, their accounts are closed, erasure requests recorded, both anonymised, and every read
   shows "Former member" with no name, e-mail or phone, the marks, counts, bodies and amounts kept.
5. Spec: TEST-L24 row in *Integration Coverage*, AC-L06 ticked with the new evidence, changelog file
   `2026-11-22-issue-599-former-member-screens.md`. The status line is left as written (rule *Spec status line*;
   parallel close-out PRs edit it).

## Decisions

- API-level reads of the routes the screens use (the issue allows it); no browser part — the screens render the
  route's `firstName`/`lastName`/`authorName`/`coachName` as given.
- Other name joins without `.trim()` (`activities/services/read.ts`, `substitutions.ts`, notices) are outside the four
  screens of the issue and left alone.

## Files changed

- `packages/app/src/modules/activities/services/coach-units.ts`
- `packages/app/.ai/qa/tests/people/TEST-L24-former-member-history-screens.spec.ts`
- `.ai/specs/2026-11-14-vereino-people-life-cycle-and-data-entry.md`
- `.ai/specs/changelog/2026-11-14-vereino-people-life-cycle-and-data-entry/2026-11-22-issue-599-former-member-screens.md`
- this log

## Commands and results

- `yarn test:integration:vereino --filter TEST-L24` — run 1 failed at the departure:
  `{"groupIds":[…],"error":"Choose for every group who takes over the sessions, or leave them unassigned.","code":"departure_handover_required"}`
  (the leaving coach's group needs a `handOver` choice; the test leaves it unassigned).
- Run 2 (`--no-build`) failed closing the accounts on the last day:
  `{"error":"The account cannot be closed while the person has an active role, guardianship or membership.","code":"account_has_purpose"}`
  — the memberships end only after today; the test now runs the next day's job (`people sync-role-expiry --today
  <tomorrow>`), as TEST-L03 does, and asserts both accounts are closed.
- Run 3 (`--no-build`, same build as run 1, which already held the units fix): `1 passed (38.3s)`.
- `yarn verify`: failed at `format:check` (the new spec file); after `prettier --write`, `yarn verify --from
  format:check` passed all remaining steps (generate, typecheck, typecheck:packages, typecheck:qa, lint, secrets:check
  had passed in the first run).
- `yarn guard`: no blocking findings.

## Open problems / next steps

- None for this issue. Other name joins without `.trim()` (session notices, substitutions, `activities/services/read.ts`)
  would show a trailing space after "Former member"; invisible in HTML, left out of scope.
