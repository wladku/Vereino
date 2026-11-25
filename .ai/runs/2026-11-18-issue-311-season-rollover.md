# Run log — issue #311, phase L9 "New season" (season rollover)

- **Goal and trigger:** cezar queued `om-auto-fix-issue` on #311 (label `cezar`, 2026-11-18 22:00 UTC). Feature route: implement phase L9 of `.ai/specs/implemented/2026-11-14-vereino-people-life-cycle-and-data-entry.md` (Ready for implementation; the DI contracts `groups.season.<module>`, the event `groups.season.rolled_over` and the two routes approved by the owner on #255, 2026-11-16, Ask First items 6–8; no migration).
- **Spec / issue / branch:** spec above; issue #311 (E13-S09, epic #255); branch `feat/issue-311-season-rollover-preview`.

## Steps

1. Claimed #311 (assignee, `in-progress`, `🤖` claim comment naming this run's worktree and branch). Read the spec sections REQ-L08, DD-L10, *API*, *Events*, J-L06, phase L9, and the phase L4 departure code it mirrors (`people/services/departure.ts`, `departure-plan.ts`, `commands/departures.ts`, `lib/departure-token.ts`, the `groups` departure contributor).
2. Slice (a) plan rules and `groups`: `groups/lib/season-rollover.ts` (plan validation, record actions, membership outcome of a closed group, copy end) and `groups/lib/rollover-token.ts` (server-only preview token), both 100 % covered; the contract `groups/services/season-rollover.ts`; `groups.seasons.rollover` and `previewRollover` in `groups/commands/season-rollover.ts`; `POST /api/groups/seasons/rollover/preview` and `POST /api/groups/seasons/rollover`; eleven `rollover_*` error codes; the event `groups.season.rolled_over`.
3. Slice (b) `activities/services/season-rollover.ts` (registered as `groups.season.activities`): recurring activities end on the last day through `replanSeries`, copies start on the new season's first day; the preview runs the save's conflict check (place, rental and closure blocks, coach) with the original's later sessions ignored.
4. Slice (c) `payments/services/season-rollover.ts` (registered as `groups.season.payments`): fees end and copy with a new name, amount or payment day; a fee of a copied activity points at the copy; only the club administrator's grants change fees.
5. Slice (d) the wizard `groups/components/SeasonRolloverWizard.tsx` at `/backend/groups/seasons/rollover` (navHidden), "Start a new season" on the Seasons tab, texts in `en` and `pl`.
6. Integration test `groups/TEST-L16-season-rollover.spec.ts` (TEST-L16, TEST-L20, the wizard in the browser with axe in light and dark).
7. Docs: spec changelog `2026-11-18-issue-311-phase-l9.md`, AC-L09 ticked; lessons `contributor-gets-rules-through-context` and `local-playwright-report-breaks-lint`.

## Decisions

- **Contributors get the rules as values.** The module boundaries lint (`boundaries/dependencies`) allows `activities` and `payments` to import only types from `groups`; the rules they need (record action, `runsPast`, `copyEndsOn`, the 422 `rollover_copy_invalid`) travel in the context (`SeasonRolloverContext.rules`).
- **Contract shape.** The spec names `preview(em, plan)` and `apply(em, plan)`; both also take the context (container, the actor's command context, the rules), `apply` takes the ids of the copies made by earlier contributors, and `afterCommit` emits the module's events, as in the departure contract. The plan carries the trusted scope, the dates and the groups in the actor's scope with their action.
- **Plan rows.** One moving action per group (continue, rename, close) and any number of `copy` rows, so J-L06's "continue and copy" is one plan; an unnamed group is left alone; record actions only for continued or renamed groups (default `keep`); a closed group's activities and fees always end.
- **Stale and twice.** The token binds the plan as sent and what the preview showed: the groups' and records' versions, every item, the memberships a close ends and the conflicts. A second apply of the same plan finds the groups already moved, so it answers 409 `rollover_plan_stale` and changes nothing; no idempotency table is needed.
- **Announcement.** Posted after the commit through `communication.threads.create` as the acting user, one per continued or renamed group, not by a subscriber: an announcement needs an author person, which a subscriber does not have. `groups.season.rolled_over` is still emitted. Recorded in the spec changelog.
- **Fees and coordinators.** `payments` writes stay `club_admin` only; for a coordinator the payments contributor lists no fee and changes none, and the preview shows `fees_unchanged`.
- **Old season outside the club:** 404 (TEST-L20 fail closed).

## Results

- Unit: `groups/lib/season-rollover.ts` and `rollover-token.ts` at 100 % line, branch and function coverage (`npx jest src/modules/groups/lib` — 5 suites, 62 tests passed).
- `yarn typecheck` and `yarn typecheck:qa`: exit 0. `eslint` on the changed files: 0 errors (the remaining warnings are `no-unnecessary-condition` on record lookups, the existing kind).
- `yarn test:integration:vereino --filter TEST-L16`: first run (one test with the browser) failed before any step — `browserType.launch: … chrome-headless-shell: error while loading shared libraries: libatk-1.0.so.0: cannot open shared object file` (the machine lacks the system library; installing system packages is outside this run). The test was split: the API scenario (TEST-L16, TEST-L20) and a separate browser test of the wizard. Second run: the API scenario failed at the repeated apply — `Expected: "rollover_plan_stale" Received: "season_name_taken"` (the plan's new season now existed); the apply now answers a season name taken since the preview as `rollover_plan_stale`. Third run: API scenario **1 passed**; the browser test failed again only on the missing `libatk` (not run locally — CI runs it).
- `yarn verify`: first run failed at `lint` with 162 `react-hooks/rules-of-hooks` errors, all in the gitignored `packages/app/.ai/qa/test-results/html/trace/*.js` left by the local integration run (removed; lesson `local-playwright-report-breaks-lint`); then `format:check` on the wizard (fixed with `yarn format`). Final full run: **all 17 steps passed**.

## Open problems / next steps

- The browser test `TEST-L16 the wizard opens from the Seasons tab…` (light and dark, axe) did not run locally (missing `libatk`); it runs in CI with the integration suite.

- A copy that collides only with another copy of the same plan is not shown in the preview; the apply still refuses it (409 `occurrence_place_conflict`) and applies nothing.
- When spec A's new activity fields land, the activity copy should carry them (the contributor copies the stored fields of `activities_activities` as they are today).
