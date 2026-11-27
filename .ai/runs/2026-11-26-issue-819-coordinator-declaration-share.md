# Run — #819 E27-S02 a section coordinator sees the declaration share on the phone

- **Goal and trigger:** Cezar run (task d145d738) of `om-auto-fix-issue 819`, queued by the `cezar` label. Give section coordinators the "Declarations in Vereino" numbers of E27-S01 for their own sections under `/club`, at 375 px.
- **Issue / spec / branch:** #819 (epic #816, depends on E27-S01 #818, merged in cc3de13d); design authority the issue body with the owner decision of 2026-11-26 (own sections only, numbers only, same formula, `activities.reports.view` with the record scope, no ACL change); no per-story spec (ready under `om-backlog`). Branch `feat/issue-819-coordinator-declaration-share`.

## Steps

1. Two earlier Cezar runs stopped without claiming because #818 had not merged. This run found #818 merged on `main` and claimed: assignee, `in-progress`, `🤖` claim comment naming the worktree and branch.
2. Member navigation (`@vereino/ui` `member-nav.ts`): a More destination `/club/reports/declaration-share` for `activities.reports.view`, label key `declarationShare` in the shell labels; the key added to the seven member frames' catalogs (en, pl). Unit tests in `member-nav.test.mjs` (coordinator sees it, a coach does not, current mark), 100 % coverage kept.
3. `DeclarationShareReport.tsx`: the cell texts moved into an exported `declarationShareText`, so the panel table and the phone cards render the same numbers the same way.
4. Member page `activities/frontend/club/reports/declaration-share/` and `components/club/ClubDeclarationSharePage.tsx`: period (last 28 days, month, range ≤ 12 months), one card per section, skeleton, error with retry, refusal, empty, invalid range; 44 px targets (`min-h-11`).
5. Older test `E09-S04-member-bottom-bar` lists a coordinator's exact More entries: the new entry added there (AGENTS rule on menu changes).
6. Integration test `E27-S02-declaration-share-on-the-phone.spec.ts`: three sections, a coordinator of A and B, the coordinator of A, a forged `sectionId`, a coach, the page at 375 px in both languages, error and empty states through route interception.

## Decisions

- **No new route or service:** the E27-S01 read already applies the record scope (coordinator grants → their sections; admin → every section) and its query schema takes `from`/`to` only, so a forged `sectionId` is dropped by the schema and can never widen the reach. The integration test proves it.
- **`page.meta.ts` asks only for a signed-in user**, not for `activities.reports.view` as the issue's implementation note suggests: with the feature in the page metadata a coach gets the platform's bare "Access denied", while the acceptance criterion asks for a refusal that names who can see the report. This follows the E20-S10 pattern (`/club/places/maintenance`, `/club/events/new`): the route enforces the feature, the page shows its own refusal. No data is served without the feature.
- **The administrator also gets the More entry** (they hold `activities.reports.view`); they see every section, as in the panel.
- **Placement in More:** last before the admin panel, after Training outlines.

## Files changed

- `packages/ui/src/member/member-nav.ts`, `packages/ui/src/__tests__/member-nav.test.mjs`
- `packages/app/src/modules/activities/components/DeclarationShareReport.tsx`, `components/club/ClubDeclarationSharePage.tsx`
- `packages/app/src/modules/activities/frontend/club/reports/declaration-share/page.meta.ts`, `page.tsx`
- `packages/app/src/modules/{activities,communication,facilities,groups,payments,people,training}/i18n/{en,pl}.json`
- `packages/app/src/modules/activities/README.md`
- `packages/app/.ai/qa/tests/activities/E27-S02-declaration-share-on-the-phone.spec.ts`, `packages/app/.ai/qa/tests/people/E09-S04-member-bottom-bar.spec.ts`

## Commands and results

- `yarn workspace @vereino/ui test` — 287 pass, 0 fail, 100 % lines/branches/functions.
- `yarn generate` — ok. `yarn typecheck` — ok.
- `yarn test:integration:vereino --filter E27-S02` — first run failed: `Expected: >= 44, Received: 20` on the month input (the platform `Input` puts `className` on its wrapper; fixed with `inputClassName="min-h-11 text-base"`). Second run failed: `Expected: "2 z 3 (67%) zadeklarowanych w Vereino"`, `Received: "2 of 3 (67%) declared in Vereino"` (the test set only the `locale` cookie; the member shell follows the club default — lesson `member-pages-locale-follows-the-member-not-the-cookie`, evidence added). Third run: 1 passed.
- `yarn test:integration:vereino --filter E09-S04` — 1 passed (More list with the new entry). `--filter E27-S01` — 1 passed (the panel table after the `declarationShareText` refactor).
- `yarn verify` — failed at `lint` with a JavaScript heap-out-of-memory crash (no findings). `NODE_OPTIONS=--max-old-space-size=8192 yarn lint` — 0 errors (166 warnings, none in changed files). `yarn verify --from secrets:check` with the same heap — all 18 steps passed. New lesson `local-lint-needs-a-larger-heap`.

## Open problems

- `lint` needs more than Node's default heap locally; raising it in the script is for the owner to decide (lesson above).

## Next steps

- Review and merge through the merge train.
