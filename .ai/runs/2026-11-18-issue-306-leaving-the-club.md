# Run log — issue #306, phase L4 "Leaving the club: members and guardians"

- **Goal and trigger:** cezar queued `om-auto-fix-issue` on #306 (label `cezar`, 2026-11-18 01:00 UTC). Feature route: implement phase L4 of `.ai/specs/implemented/2026-11-14-vereino-people-life-cycle-and-data-entry.md` (Ready for implementation; migration A, the DI contract, the events, the routes and the list behaviour change approved by the owner on #255, 2026-11-16).
- **Spec / issue / branch:** spec above; issue #306 (E13-S04, epic #255); branch `feat/issue-306-phone-leave-family-flow`.

## Steps

1. Claimed #306 (assignee, `in-progress`, `🤖` claim comment). Read the spec end to end, the L1–L3 code (`commands/accounts.ts`, `services/account-guards.ts`), the membership commands of #267 and the existing optional-DI contracts (`groups.membershipContribution`).
2. Slice (a): `lib/departure-rules.ts` (blockers, payer hand-over, suggestions, request scope, dates) and `lib/departure-token.ts` (preview token), both at 100 % coverage; `Person.leftOn`, `DepartureRequest`; migration A generated with `yarn db:generate` against an unreachable database (never applied), `lock_timeout` and `down()` added by hand; snapshot kept in its raw style (382 inserted lines, no reformatting).
3. Slice (b): `services/departure.ts` (contract, `people.departure.<module>` tokens read with `hasRegistration`), `services/departure-plan.ts` (one plan for the preview and the command), `commands/departures.ts` (`people.persons.depart` with undo, `people.persons.return`), the `groups` contributor (`groups/services/departure-contribution.ts`, registered in `groups/di.ts`), the `activities` subscribers on `groups.membership.updated|deleted` (`activities/services/ended-membership.ts`), account closing of departed persons in the daily role sync (`services/departure-accounts.ts`).
4. Slice (c)/(d): the routes (`/api/people/departures`, `…/preview`, `/api/people/departure-requests`, `/api/people/me/departure-requests[/{batchId}]`, `/api/people/persons/{id}/return`), the request commands with the 5-in-24-hours limit, the notices through the foundation dispatch (in-app and e-mail templates), the Leaving tab (`components/LeavingPanel.tsx`), the "Former" perspective and its predicate in `GET /api/people/persons`, `expandAudience` leaving former persons out (`@vereino/core`), the dashboard widget `people.dashboard.departureRequests`, the phone page `/club/profile/leave` and the link on `/club/profile`.
5. Integration tests: `people/TEST-L03-departure.spec.ts` (TEST-L03, TEST-L04, TEST-L20) and `people/TEST-L05-departure-requests.spec.ts` (TEST-L05).
6. Docs: `BACKWARD_COMPATIBILITY.md` §2 behaviour-change note; the spec changelog file `2026-11-18-issue-306-phase-l4.md`.

## Decisions

- **Undo:** through the audit log, until the last day (409 `departure_undo_expired` after it). Every restore checks that the value is still the one the departure wrote, so a record changed since is left alone (the same rule as the contributors' undo in the spec).
- **Rows that start after the last day** (role assignments, guardianships, memberships) are soft-deleted: they cannot end before they start. Spec A's delete rule (#267) is on `main`, so the `groups` contributor uses it directly, with no fallback.
- **Payer hand-over:** the next payer's row ends on the last day and a primary-payer copy starts the day after; the flush order keeps the partial unique index on the open-ended primary payer satisfied. The open charges follow through spec C's `people.guardianship.created` subscriber (#295).
- **Accounts:** closed the day after the last day by the daily role sync (`people.persons.sync_roles`), which gains the step "dated departures" until phase L8 builds the life-cycle job; the job's audit entry counts the closed and failed accounts.
- **Preview token:** `<expiresAt>.<sha256 of the canonical binding>`, not a secret: the command rebuilds the plan in its transaction and compares; anything else (expired, forged, data changed) is 409 `departure_preview_stale`. It lives in its own server-only lib file, because `node:crypto` must not reach the client bundle that imports the rules.
- **Withdraw by batch:** the member's request for a family is one batch; `DELETE /api/people/me/departure-requests/{batchId}` withdraws its open rows.
- **Notices:** dispatch templates (in-app and e-mail), ids and dates only; the decline notice does not carry the reason (encrypted, read in the app).

## Results

- Unit: `departure-rules.ts`, `departure-token.ts`, `person-list-filters.ts`, `account-limits.ts` 100 % (jest); `@vereino/core` `yarn test` 100 % with the new audience case.
- `yarn typecheck`, `yarn typecheck:qa`, `eslint` on the changed files: green (warnings of the existing kind only).
- `yarn test:integration:vereino --filter TEST-L03`: first run failed in the test's own setup — `declare(…, 'yes')` on a training session answered `422 {"code":"declaration_kind_absence_only"}`; after switching to `no`, `Expected: 200 Received: 201` (a new declaration is 201). After both fixes: 3 passed (TEST-L03, TEST-L04, TEST-L20).
- `yarn test:integration:vereino --filter TEST-L05`: 1 passed (phone page at 375 px in pl and en, light and dark, axe clean).
- Lesson: `.ai/lessons/departure-contributor-writes-in-callers-transaction.md`.

## Open problems / next steps

- A departure with today as the last day sends no confirmation to the leaving persons: they are former at once and the audience leaves them out (recorded in the spec changelog).
- The late-undo case of TEST-L03 (409 `departure_undo_expired` after the last day) is covered by the unit rule only: the undo reads the real club date, which a test cannot move.
- Phase L5 adds the `activities`, `payments`, `club_core` and `facilities` contributors and the hand-over controls; phase L8 moves the account closing into `people.persons.life_cycle`.
