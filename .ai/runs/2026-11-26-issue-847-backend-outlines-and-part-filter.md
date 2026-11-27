# Run — #847 back-office outline pages and the outline list's part filter

- **Goal and trigger:** cezar run (task 389dbe21) on issue #847 (label `cezar`), `om-auto-fix-issue`. The owner decided on #847 (2026-11-26): build both — the administrator's `/backend` outline pages (`DataTable`/`CrudForm`, spec *UI architecture*, M-O5) and the part filter on `/club/training/outlines` and its list route, with integration coverage; anything beyond the spec is Ask First.
- **Spec:** `.ai/specs/2026-11-23-vereino-training-outlines-and-medical-expiry.md` (M-O5, *UI architecture*). Epic #671.
- **Branch:** `feat/issue-847-back-office-outline-pages`.

## Steps

1. Claimed #847 (assignee, `in-progress`, 🤖 claim comment naming the worktree and branch).
2. Part filter: `outlineListQuerySchema.part` (enum of `OUTLINE_PARTS`); `outlineIdsWithPart` in `training/data/queries.ts` (organization-scoped `jsonb_array_length(parts -> part) > 0`, same predicate as the library search); the list route narrows to those ids inside the record-scope `$and` (the `activities/club-events` id pre-query pattern, `NO_ROW` for none). Member page: a part select next to the topic and age filters.
3. Back office: `backend/training/outlines` (`OutlinesTable`, `DataTable` with views, age category, part, search, server sort, row actions open / edit exercises / PDF / delete with the optimistic-lock header) and `backend/training/outlines/[id]` (`OutlineEditForm`, `CrudForm` of the header; the version is sent automatically from `initialValues.updatedAt`; parts read-only through `OutlineReadView facts={false}`). Both require `training.manage`. Sidebar: Classes group (`groups.nav.group`), `pageOrder: 35` (after Sessions) — TEST-N01 updated for the new item.
4. i18n `training.backend.*` in en and pl.
5. Integration test `ISSUE-847-backend-outlines-and-part-filter`.

## Decisions

- Creating an outline stays on the member editor (it needs the author's person); the back-office list links "New outline" there.
- Exercises and images are not edited in the `CrudForm`: the nested part editor exists once, on the member page; the back-office form links to it. Avoids a second editor of the same JSON.
- The part filter is an id pre-query because the platform query engine has no JSON operators; the record scope still applies.
- The spec body is not edited (PR #861 is changing it); the change is recorded in a changelog file.

## Files

See the PR diff: `training/{api,data,components,backend,i18n}`, `.ai/qa/tests/training/ISSUE-847-*.spec.ts`, `.ai/qa/tests/club_core/TEST-N01-club-sidebar-group.spec.ts`, the spec changelog file, this log.

## Commands and results

- `yarn generate` — ok. `yarn typecheck` — ok.
- `yarn lint` first run: 1 error — `@mikro-orm/postgresql` imported in `api/shared.ts` (REQ-F16 restricts it to data/commands/services); the helper moved to `services/outline-view.ts`. A later lint run also failed on the Playwright HTML report under `packages/app/.ai/qa/test-results/` (gitignored, but linted when present); removed the generated folder.
- `yarn test:integration:vereino --filter ISSUE-847` first run: failed at the read after the browser part — `expected 200` — because `signInBrowser` ended the coach's API token (lesson `sign-in-browser-ends-the-api-token`); the test now takes a fresh admin token from the returned password. Second run: `1 passed (1.1m)`.
- `--filter TEST-N01` (sidebar item added): `2 passed`. `--filter TEST-O05` (member outline list changed): `1 passed`.
- `yarn verify`: `all 23 step(s) passed`. `yarn guard`: no blocking findings.

## Open problems / next steps

- None for this issue. The spec's acceptance list is being ticked by PR #861 (close-out V); this PR leaves the spec body untouched to avoid a conflict.
