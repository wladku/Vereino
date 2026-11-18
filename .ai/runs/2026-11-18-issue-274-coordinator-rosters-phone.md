# Run: issue #274 — a section coordinator edits rosters, marks a case and deletes a message from the phone

- **Trigger:** cezar `om-auto-fix-issue 274` (the `cezar` label added to the issue on 2026-11-18).
- **Issue / spec / branch:** #274 (E10-S09) / `.ai/specs/implemented/2026-11-14-vereino-parity-groups-and-activities.md` phase 9 (REQ-A11, REQ-A12, TEST-A17, TEST-A18, AC-A13) / `feat/issue-274-coordinator-edits-rosters-phone`
- **Date:** 2026-11-18

## Goal

Give the section coordinator the roster and the thread actions on the phone (D-031 §3, D-029): `/club/groups` and `/club/groups/[id]` with Add, Edit, End and Remove in bottom sheets (read-only for a coach), the More entry "Groups", and on `/club/messages/[threadId]` "Mark as case" and "Delete" with 409 `case_immutable` shown as text.

## Steps

1. Concurrency check: no assignee, no `in-progress`, no claim comment, no PR referencing #274. Classified as a feature (label `feature`); FR triage: the spec is `Ready for implementation` (owner approval 2026-11-16, Q-A03 and Q-A26 answered), the dependencies #267 and #258 are closed, nothing built yet. Claimed the issue (assignee, `in-progress`, 🤖 comment).
2. Read phase 9, the B-12 / M-07 rows, `RosterPanel.tsx`, `MembershipDialogs.tsx`, `ClubThreadPage.tsx`, `ThreadRecord.tsx`, the groups and memberships routes (record scope, no contact fields), the member frames and `member-nav.ts`.
3. Groups: `MembershipDialog` / `EndMembershipDialog` take `surface="sheet"` (a bottom `Sheet` with full-width buttons, same rules and refusals); the remove flow moved from `RosterPanel` into `useRemoveMembership` (shared); new `GroupsClubFrame`, `ClubGroupsPage`, `ClubGroupPage` and the two frontend pages with `requireFeatures: ['people.self', 'groups.view']`; i18n en/pl (`groups.club.*`, the 24 nav labels).
4. `@vereino/ui`: the More row "Groups" becomes `available: true`; `member-nav.test.mjs` updated (feature list, admin order, a new case for a coordinator and the current page).
5. Communication: `useMarkCase` and `useDeleteMessage` exported from `ThreadRecord.tsx` (the latter with an optional `onRefused`); `useCanPost.ts` exposes `useHasFeature`; `ClubThreadPage` adds the two actions behind `communication.cases.manage` and an inline refusal alert.
6. Lesson `tabs-without-tabscontent-fail-axe`. TEST-A17 (groups) and TEST-A18 (communication) integration tests; READMEs; the spec moved to `implemented/` (every phase landed) with its path fixed in the groups README and the earlier run logs; changelog entry `2026-11-18-phase-9-implemented.md`.

## Decisions

- **Sheets reuse the panel forms** (`surface` prop) rather than new phone forms, so the 409 overlap, 422 `membership_not_started`, 409 `membership_in_use` → End and version-conflict handling stay one code path (spec: "with the API and rules of E10-S02").
- **Actions as buttons on each card** (Edit, End, Remove per `membershipActions`), not a row menu: 44 px targets and no hidden menu on a phone; each button's accessible name starts with its visible label ("Edit: Ola Lis").
- **`canManage` = `groups.manage`**, as the panel record does; the commands keep refusing another section (the coordinator never lists another section's group, and opening one by URL shows "not yours").
- **"Delete" on the phone is gated on `communication.cases.manage`** as the spec says (Q-A26), on top of the read model's `canDelete`, so an author without the feature does not get it on the phone.
- **The `case_immutable` refusal is shown inline**, not only as a toast, because the issue asks for readable text on the page. Through the UI it can only occur in a race (a case thread hides Delete); TEST-A18 provokes it by marking the case over the API and letting the page's DELETE carry the newest version (`page.route`), the order the command's row lock produces when the marking commits first.
- **Spec status.** Phase 9 is the last phase; every phase's issue (#266–#274) has landed, so the spec is `Implemented` and moved, its acceptance criteria ticked on the evidence of each phase's merged tests (listed in the changelog entry). Bare file names in frozen changelog rows and in other specs are not links and were left as they are.

## Files changed

- `packages/app/src/modules/groups/components/MembershipDialogs.tsx`, `RosterPanel.tsx`, `useRemoveMembership.ts` (new), `club/GroupsClubFrame.tsx`, `club/ClubGroupsPage.tsx`, `club/ClubGroupPage.tsx` (new), `frontend/club/groups/**` (new), `i18n/en.json`, `i18n/pl.json`, `README.md`
- `packages/app/src/modules/communication/components/ThreadRecord.tsx`, `useCanPost.ts`, `club/ClubThreadPage.tsx`, `README.md`
- `packages/ui/src/member/member-nav.ts`, `packages/ui/src/__tests__/member-nav.test.mjs`
- `packages/app/.ai/qa/tests/groups/TEST-A17-coordinator-roster-phone.spec.ts`, `packages/app/.ai/qa/tests/communication/TEST-A18-coordinator-case-phone.spec.ts` (new)
- `.ai/specs/implemented/2026-11-14-vereino-parity-groups-and-activities.md` (moved), its changelog entry, path fixes in `.ai/runs/2026-11-1*-*.md`

## Commands and results

- `yarn generate` — ok; `yarn typecheck` — ok (one error on the first try: `Alert` takes no `role`; removed).
- `yarn workspace @vereino/ui test` — 204 / 204 pass, 100 % lines, branches, functions.
- `yarn spec-changelogs:check` — valid.
- `yarn test:integration:vereino --filter TEST-A17` — first run failed, verbatim: `expect(violations).toEqual({})` with `"/club/groups/[id] (en) (light)": [{ "id": "aria-valid-attr-value", "impact": "critical", "nodes": 1 }]` (the same for en dark, pl light and pl dark); every functional step had passed. Cause: the view `Tabs` had no `TabsContent`, so the triggers' `aria-controls` pointed nowhere; fixed by rendering the list in `TabsContent` (lesson `tabs-without-tabscontent-fail-axe`). Second run: 1 passed (2.6m).
- `yarn test:integration:vereino --filter TEST-A18` — first run failed, verbatim: `expect(locator).toContainText(expected) failed` at `await expect(tombstone).toContainText(uiText('communication.message.deleted', { exact: true }))` — a test bug (an anchored pattern in `toContainText`, AGENTS.md Validation); `exact` dropped. Second run: 1 passed (2.4m).
- `yarn verify` — all 17 step(s) passed (lint: 0 errors, warnings only).

## Open problems

- None known.

## Next steps

- Review and merge through the merge train.
