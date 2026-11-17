# Run — issue #266: groups list and record as in the mockup, a team with matches cannot become a class group (E10-S01)

- **Date:** 2026-11-17
- **Trigger:** cezar run 0ac84a70 (`issue.labeled` `cezar`), skill `om-auto-fix-issue` with the vereino override.
- **Issue:** [#266](https://github.com/wladku/Vereino/issues/266) — feature route.
- **Spec:** `.ai/specs/2026-11-14-vereino-parity-groups-and-activities.md`, phase 1 (REQ-A01, REQ-A02; TEST-A01, TEST-A02; AC-A01, AC-A02).
- **Branch:** `feat/issue-266-groups-list-class-group`

## Gate decisions

- The issue's "blocking" open question (spec Draft, DI token and 409 unapproved) is stale: the spec is `Ready for implementation` and its *Rollout* table records the owner's approval of the DI token `activities.groupUsage` (item (a)6) and the additive `isPublic` parameter (item (a)8) on 2026-11-16 ([#252](https://github.com/wladku/Vereino/issues/252#issuecomment-6910004411)). No migration, no dependency, no new module.
- Claimed the issue (assignee, `in-progress`, 🤖 comment).

## Steps

1. Contract: `groups/services/group-usage.ts` (token `activities.groupUsage`, `GroupUsageContract.matchActivityCount`, `groupUsageContract(container)` with `hasRegistration`); `activities/services/group-usage.ts` counts the group's live `match`/`sparring` activities; registered in `activities/di.ts`.
2. Guard in `groups.groups.update` and its undo (`assertNoMatches`): `needsMatchGuard(from, to)` in `lib/groups-rules.ts`; 409 `group_has_matches` with `details.total` and a field error on `kind`; 503 `group_usage_failed` when the contract throws; no registration → no guard.
3. List: `isPublic` in `groupListQuerySchema`, the route filter and the URL state (`lib/group-list.ts`); `GroupsTable` subtitle, kind badge, "Category / level" (`categoryOrLevel`), "Public" badge and filter, row action "Activities".
4. Record: tabs Details / Roster / Public page under `?tab=` (default `roster`), Level on Details (form and read-only view), header links "Activities" and "Public preview", "Edit age categories" beside the category select for `dictionaries.manage`.
5. Activities: `ActivitiesTable` reads `?groupId=` and links "New activity" with it; `ActivityCreateForm` preselects `?groupId=` (create page wrapped in Suspense).
6. Integration tests TEST-A01 (list, record, links) and TEST-A02 (the guard, the total, a soft-deleted sparring not counted, the token hidden in a probe process `_fixtures/groups-usage-probe/probe.mjs`).
7. i18n en/pl, module READMEs, spec changelog entry.

## Decisions

- **"Live" match = not soft-deleted, active or not.** An inactive match is still history a class group could not have; the count follows the `deleted_at IS NULL` meaning of `groups.sectionUsage`.
- **The undo is guarded too.** Undoing "class group → team" turns a team back into a class group, which is the same change.
- **503 `group_usage_failed`** as the spec's API row states for a throwing contract.
- **Token string duplicated in `activities`.** The module boundary lint forbids value imports from `groups` into `activities`; the token constant is repeated as `groups.sectionUsage` does for `club_core`.
- **Public preview is client-resolved** from `/api/club_core/settings` and `/api/club_core/sections?ids=` and hidden when either is refused (a coordinator without `club_core.view`), so no response field was added.
- **The spec text and status are not edited** (phases 1–3 run in parallel; the status changes when the last phase lands); the change is recorded in one changelog file.

## Files changed

`groups` (services, commands, lib + tests, validators, route, components, i18n, README), `activities` (services, di, components, create page, i18n, README), the QA fixture and probe, TEST-A01, TEST-A02, the spec changelog entry and this log.

## Commands and results

- `yarn generate`, `yarn typecheck` — exit 0.
- First `yarn verify`: `generate`, `typecheck`, `typecheck:packages`, `typecheck:qa` pass; `lint` failed with `boundaries/dependencies` on `activities/services/group-usage.ts` (a value re-export from `groups`) — fixed by a local token constant.
- Resumed `yarn verify --from lint`: lint … spec-changelogs pass; `test` failed — `groups error codes › declares the groups codes with their statuses` (the table gained two codes); the test lists them now. `yarn verify --from test`: test, test:scripts, build pass.
- `yarn test:integration:vereino --filter TEST-A02`: first run failed — the probe answered `{"ok":false,"status":400,"code":"lock_token_required"}` (the probe context had no `request` with the lock header); fixed in the probe (lesson `probe-commands-need-request-lock-header`). Second run: 1 passed.
- `yarn test:integration:vereino --filter TEST-A01`: run 1 failed in the fixture (`activity_group_inactive`: a training on the inactive group); run 2 failed on `toContainText(/^(?:Team|Drużyna)$/)` (an exact catalog matcher against a row's text); run 3: 1 passed.
- Final full `yarn verify`: all 17 steps passed.

## Open problems / next steps

- Browser exit gate in both locales, light and dark: covered by TEST-A01 (catalog texts through `uiText`, axe in both colour schemes); a Polish-locale manual pass is left to QA.
