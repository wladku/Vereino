# Run: #259 — E09-S05 a coach-only person starts in the staff context, and each role lands on its own page after sign-in

- **Goal and trigger:** unattended cezar run (task 7f23eefa) of `om-auto-fix-issue` on #259, queued by the `cezar` label. Feature route: spec N phase 5 (REQ-N07, REQ-N08; TEST-N07, TEST-N08; AC-N07, AC-N08).
- **Spec:** `.ai/specs/2026-11-14-vereino-parity-navigation-and-naming.md` (Ready for implementation; Ask First item 2 — `isParticipant` and the `facility_operator` context on `GET /api/people/me`, and the landing rule — approved by the owner on 2026-11-15 on #251, together with A-N08, A-N09, A-N10, A-N17 and Q-N02). **Issue:** #259, epic #251, depends on #258 (closed). **Branch:** `feat/issue-259-staff-context-and-landing`.

## Steps

1. Concurrency check (no assignee, no `in-progress`, no open PR) and claim: assignee, `in-progress`, `🤖` claim comment. Confirmed the spec status and the owner approvals on #251.
2. `people`: `memberContexts` lists `facility_operator`; `memberLanding` takes the member side, the grant kinds and `facilities.log.write` and returns `/club/facility`, `/backend` or `/club` (an explicit redirect and the "not linked" notice unchanged); `services/member-landing.ts` reads the person's grants through the people scope provider (`grantsForPerson`), the wards from the `guardian` grant and, without a ward, `groups.membershipContribution.isActiveParticipant`; `GET /api/people/me` answers `isParticipant` (OpenAPI schema and description updated). Unit tests in `member-rules.test.ts`.
3. `@vereino/ui` `member-context.ts`: `MemberRoleContext` is `member` · `staff`; `hasMemberSide`, `memberStaffScopes`, `memberRoles` (staff alone without a member side), `resolveMemberContext` (the default is the first offered role), `memberSideScope`, `memberCalendarScopes` (replaces `memberCalendarScope`), `staffContextLabel`; the switcher labels the staff context "as coach" or "as coach / coordinator". `member-nav.ts` offers the admin panel to `facility_operator`. Unit tests at 100 %.
4. `activities`: `mergeCalendarEntries` in `lib/member-calendar.ts` (by start time; a shared session once, in the later — the coach's — perspective); the calendar page runs the member and the `as=coach` reads, merges them, shows "New event" in the staff context only, and a retry line (`activities.club.calendar.partial`) when one of the two reads fails. Today reads `memberSideScope` and passes `isParticipant`.
5. Catalogs: `*.nav.contextCoachCoordinator` reads "jako trener / koordynator" / "as coach / coordinator" in the five modules (the glossary row of spec N); `people.club.today.title` (pl) reads "Dzień dobry, {name}".
6. Integration tests: new `people/E09-S05-staff-context-and-landing.spec.ts` (TEST-N07, TEST-N08). E03-S04, ISSUE-140 and J-002 drove the context switcher for a coach-only person, who now has none and starts in the staff context: they assert that instead. The greeting assertions of J-001 and E02-S03 read `people.club.today.title` through `uiText`; TEST-047 asserts the new Polish greeting.
7. People README (landing row, `GET /api/people/me` paragraph) and the spec changelog entry `2026-11-16-issue-259-staff-context-and-landing.md`.

## Decisions

- **The stored role value is `staff`, not `coach`** (DD-N08: one staff context for coach and coordinator). A tab that stored `coach` under #101 falls back to the default once; nothing else reads the value.
- **The default context is the first offered role**: `staff` for a person with a staff grant and no member side, else `member` (A-N08). A person with neither a member side nor a staff grant (the attendant, an administrator without wards) keeps the member context: it is what their Today and calendar always showed.
- **Member side = a ward or an active participant membership today** (spec N *Business rules*), read the same way in the landing service (scope grants + contribution) and in the profile (`isParticipant`); without `groups` it is the wards only.
- **"New event" stays a staff-context action**: in the member context a coach with a ward sees the merged list without it, as before under the member context.
- **A shared session takes the coach's item** (opens with `?as=coach`, the attendance link), as the spec says; the ward's declaration for that session is then made from the session page.
- **One commit** instead of the issue's two slices: the context slice and the landing slice share `GET /api/people/me` and its consumers, and the frames' typecheck needs both (AGENTS.md: never commit a failing typecheck).

## Commands and results

- `yarn workspace @vereino/ui test` → first run 2 failures in `member-nav.test.mjs` (the attendant's More now ends with the admin panel: `actual: ['/club/profile', '/club/facility', '/backend']`); expectations updated. Rerun: `pass 142, fail 0`, 100 % lines/branches/functions.
- `npx jest src/modules/people/lib/__tests__/member-rules.test.ts src/modules/activities/lib/__tests__/member-calendar.test.ts` → 39 passed; coverage of `member-rules.ts` and `member-calendar.ts` 100 %.
- `yarn typecheck` → first run failed on missing `.mercato/generated/*` (fresh worktree); after `yarn generate` it passed.
- `yarn typecheck:packages` → failed: `Type 'undefined' is not assignable to type 'MemberRoleContext'` (`roles[0]` under `noUncheckedIndexedAccess`); `memberRoles` now returns a non-empty tuple.
- `yarn qa-texts:check` → J-001 and E02-S03 have fewer hardcoded texts; baseline lowered to 11 and 3.
- `yarn lint` → `React Hook "useLocale" may be executed more than once` in the new spec (a test helper named like a hook); renamed `switchLocale`. The Playwright HTML report under `.ai/qa/test-results` is linted too; it is removed before `yarn verify`.
- `yarn test:integration:vereino --filter E09-S05` → first run failed: `POST /api/people/guardianships {"error":"Unauthorized"}` (401) — resetting the administrator's password ended `club.adminToken` (lesson `sign-in-browser-ends-the-api-token`); the test now uses the token of the administrator's sign-in answer. Rerun: `1 passed (2.3m)`.
- `yarn verify` → `[verify] all 17 step(s) passed`.
- Regression runs, one id each: E03-S04 `1 passed (2.3m)`, ISSUE-140 `1 passed (1.8m)`, J-002 `1 passed (2.7m)`, E09-S04 `1 passed (4.4m)`, E06-S19 `1 passed (2.4m)`, J-001 `1 flaky` (first attempt timed out in step 1 waiting for the place form option `Gmina Testowo`, unrelated to this change; the retry passed, including the greeting checks), E02-S03 `7 passed (5.6m)`, TEST-047 `2 passed (2.5m)`.

## Open problems

- AC-N07/AC-N08 stay unticked in the spec until the owner accepts them (the convention of the previous phases).

## Next steps

- Spec A phase 8 (the coordinator on the phone) can read `memberStaffScopes`.

## Review round (PR #325)

An independent review agent (read-only, given the diff and the requirements, not my conclusions) returned approve with follow-ups, no blockers. Applied:

- Today in the staff context asks for the coach scope too, so a coordinator who does not coach is not left with an empty Today (spec N, "Staff scopes").
- The calendar shows loading until every read has settled (no half list that offers "Next week"), and counts a read as failed only on `isError`.
- E09-S05 also checks the participant's and a non-coaching coordinator's landing (`/club`) and a member's explicit redirect.

Not applied: the ordering assertion of the integration test (the merge sort is covered by the `mergeCalendarEntries` unit test); a shared session in the merged list carrying the coach's item, which drops the ward's declaration buttons on M-03 for that session — this is what the spec says ("opens with `?as=coach`"), raised for the owner on the PR.

After the fixes: `yarn verify` → all 17 steps passed; `yarn test:integration:vereino --filter E09-S05` → `1 passed (2.6m)`.
