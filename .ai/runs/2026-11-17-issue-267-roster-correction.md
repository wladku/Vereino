# Run: issue #267 — a coordinator corrects a roster mistake (E10-S02, parity spec phase 2)

- **Goal and trigger:** cezar task (`om-auto-fix-issue 267`, label `cezar`). Feature route: the issue is covered by
  `.ai/specs/2026-11-14-vereino-parity-groups-and-activities.md` phase 2 (REQ-A03), which is `Ready for
  implementation`. Its contract changes (`DELETE /api/groups/memberships`, `status` and `sortField=roster`, 422
  `membership_not_started` on `…/end`, `activities.groupUsage.membershipUsed`) were approved by the owner on
  2026-11-16 ([#252](https://github.com/wladku/Vereino/issues/252#issuecomment-6910004411), item (a)6).
- **Spec / issue / branch:** parity spec phase 2; #267 (epic #252); `feat/issue-267-coordinator-corrects-roster-mistake`.

## Steps

1. Claimed #267 (assignee, `in-progress`, 🤖 claim comment). Checked that no open PR referenced it.
2. Pure rules in `groups/lib/groups-rules.ts`: `ROSTER_VIEWS`, `ROSTER_ROLE_ORDER`, `rosterRoleRank`,
   `rosterRoleOrder`, `rosterViewBounds`, `membershipActions`, `endRefused`, `mayRemoveMembership`, with unit tests.
3. Error codes `membership_in_use` (409) and `membership_not_started` (422), with en/pl texts.
4. `groups.memberships.delete` (soft delete, undoable; the undo re-checks the overlap and emits `created`). The end
   command now answers 422 `membership_not_started`.
5. `activities.groupUsage.membershipUsed`: the person's live attendance rows, then the group's live sessions among
   them whose slot day lies within the period. Without the contract, Remove is allowed only before the start. A
   failing contract answers 503 `group_usage_failed`.
6. `/api/groups/memberships`: `DELETE` through `makeCrudRoute`, the `status` filter on the CRUD list, and
   `sortField=roster` served by `services/roster-list.ts` (MikroORM `findAndCount` ordered by a `case` on the role,
   then `valid_from desc`, then `id`) under the same record scope (`readableGroupIds`).
7. UI: `RosterPanel.tsx` rebuilt on `DataTable` with view tabs and totals (`?status=`), plus `MembershipDialogs.tsx`
   (add/edit dialog with a first- or last-name person search that leaves out current members, and an end dialog with
   a date). Remove has a confirmation; on 409 `membership_in_use` the panel offers End. The `?personId=…&role=…` deep
   link opens the add dialog.
8. Tests: TEST-A03 (API, 130 seeded memberships) and TEST-A04 (browser). E03-S01-groups-pages and J-002 now follow
   the new roster UI; the qa-texts baseline for E03-S01-groups-pages went down to 0.

## Decisions

- **Roster order outside the CRUD factory:** the query engine sorts by one column only, so `sortField=roster` cannot
  be expressed through `sortFieldMap`. That one sort is read by a small ORM service under the same scope. Every
  other list request still runs through `makeCrudRoute`. No migration (a generated rank column would need one).
- **Remove is offered on every row:** the server decides "used" (409), and the UI then offers End (J-A01 step 5).
  Upcoming rows offer Edit and Remove only. Ended rows offer Edit and Remove.
- **"Current members"** in the add dialog are the persons with an active or upcoming membership of the group.
- The dialogs use the `Dialog` primitives with labelled inputs, like the other Vereino dialogs (for example
  `MaintenanceTaskDialog`), rather than an embedded `CrudForm`.

## Commands and results

- `yarn verify` — all 17 steps passed (unit tests 1318 passed, coverage 100 %; build passed).
- `yarn test:integration:vereino --filter TEST-A03` — 1 passed (1.9 min).
- `yarn test:integration:vereino --filter TEST-A04` — first two runs failed:
  - Run 1: `expect(locator).toHaveAttribute(expected) failed … element(s) not found`. The platform `TabsTrigger`
    drops `data-testid` (lesson `tabs-primitives-drop-data-testid`), so the test now finds the tabs by role.
  - Run 2: `Expected: "2026-12-27" Received: undefined`. `signInBrowser` ends the API token (lesson
    `sign-in-browser-ends-the-api-token`), so the test now takes a fresh token and asserts a 200 read.
  - Run 3: 1 passed (2.4 min).
- `--filter E03-S01` — 6 passed. `--filter J-002` — 1 passed. `--filter TEST-030` — 2 passed.

## Open problems

- None known.

## Next steps

- New lesson: `crud-list-sorts-by-one-column-only`.
- Review, merge train. Spec phase 9 (the phone roster, E10-S09) builds on this.
