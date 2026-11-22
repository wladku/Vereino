# Run: fix TEST-L23's Save timeout and lift its quarantine (#545)

- **Trigger:** Cezar run (`om-auto-fix-issue`) on issue #545, after the owner's decision of 2026-11-22: build the real fix, remove the `test.fixme` of #546, show it passing repeatedly, close the issue with the PR.
- **Branch:** `fix/issue-545-test-l23-editor-remount`
- **Issue:** #545 (epic #565); quarantine PR #546 (merged).

## Root cause

CI runs 44952205773 and 44655962809 timed out clicking Save in `age-range-editor-skrzat` (B-11, club administrator):
the button detached after "U do" was filled and came back disabled, so the editor had remounted and lost the typed value.

The administrator signs in through `POST /api/auth/login` after `clearCookies()`, so `/backend/groups/age-categories`
is the session's first backend page and has no `om_selected_org`/`om_selected_tenant` cookies. `organizationScopeSeed`
(lesson `admin-lists-load-once-scope-seed`) therefore cannot seed the scope, and the organization switcher's first
answer bumps `useOrganizationScopeVersion()` from 0 to 1. `AgeCategoriesTable` keys its list query on that version: the
new key had no data, DataTable showed its spinner row, and every `RangeEditor` remounted with the stored values. On a
fast machine the switcher answers before the list; on a slow CI runner after the editors rendered — the race. The
earlier wait on the reference line (#431) never helped: today's season is 2026/27 too, so the line read 2026/27 before
the season was chosen.

## Steps

1. Claimed #545 (assignee, `in-progress`, `🤖` comment naming this worktree); renamed the branch.
2. Read the quarantine PR's CI analysis, `AgeCategoriesTable.tsx`, DataTable's loading branch, the platform scope events,
   `OrganizationSwitcher.tsx` and `@vereino/ui` `organization-scope-seed.ts`.
3. Test: removed `test.fixme`; the administrator's page now holds the switcher's answer (`page.route`) until a value is
   typed, releases it, waits for the re-keyed list and asserts the typed value survived; waits for the chosen season's
   own list response instead of the reference line.
4. Reproduced against the unchanged UI (see results), then fixed the UI.

## Decisions

- Fix the UI, not only the test: a person typing on that first page loses the input the same way. The ranges query keeps
  the previous rows while a new key loads (`placeholderData: keepPreviousData`), so DataTable does not swap the rows for
  its spinner, and the editor key is `entryId` + `updatedAt` (a different club's row never inherits typed state).
- Keep the held switcher in the test as a permanent regression oracle: it makes the CI ordering certain on every machine.

## Results

The app ran through `node scripts/vereino-ephemeral.mjs start --port <free port>` (Testcontainers PostgreSQL, production
build), and Playwright ran against it with the app's own environment, because the `test` mode has no repeat option.

- Unchanged UI, edited test, `--retries=0`: **failed** as in CI —
  `expect(locator).toHaveValue(expected) failed … getByTestId('age-range-editor-skrzat').locator('input').nth(1) Expected: "5" Received: "7"`
  (the switcher's answer re-keyed the list and the editor came back with the stored value).
- With the fix, `--retries=0`: 1 passed (20.7 s).
- With the fix, `--retries=0 --repeat-each=5`: 5 passed (2.4 min).
- `yarn verify`: all 20 steps passed.
- `yarn test:integration:vereino --filter TEST-L23` (official runner, retries as in CI): 1 passed (55.2 s), exit 0.
- `yarn guard`: no blocking findings.

## Files changed

- `packages/app/src/modules/groups/components/AgeCategoriesTable.tsx` — `placeholderData: keepPreviousData`; editor key
  `entryId:updatedAt`.
- `packages/app/.ai/qa/tests/groups/TEST-L23-age-category-birth-years.spec.ts` — `test.fixme` → `test`; held switcher;
  wait for the season's list response.
- `.ai/lessons/admin-lists-load-once-scope-seed.md` — the unseeded first page and the rule for tables with local row state.

## Open problems / next steps

None known. Other admin tables with inline editors keyed on the scope version would hit the same first-page reload;
checked: of the scope-keyed tables with inputs (`BansTable`, `IncidentsTable`, `LogsTable`, `CoachUnitsReport`), all
hold them in dialogs or filters, not in row cells, so none besides this one keeps typed state in its rows.
