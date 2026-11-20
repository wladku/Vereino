# Run: #481 — visible focus everywhere, dialogs return focus to their opener (E20-S02)

- **Trigger:** Cezar `vereino-issue` workflow, `om-auto-fix-issue 481` (label `cezar` added 2026-11-20T10:49Z), unattended.
- **Issue:** #481 (epic #479, owner decision 1 of 2026-11-20). **Branch:** `feat/issue-481-focus-visible-dialog-return`. **Worktree:** Cezar task f76fc11a.
- **Route:** `direct` (Axis 3): token overrides, CSS utilities, a React helper and a test; no schema, API, migration or new module. The issue carries scope, acceptance criteria and the owner's decisions; the design authority is `docs/ux-concept/tokens.md` (C1, C2).

## Steps

1. Claimed #481 (assignee, `in-progress`, `🤖` claim comment naming the worktree, branch and start time).
2. Read `tokens.md` (C1, C2 proposals), `globals.css`, the platform `Button`, `Input`, `Textarea`, `Dialog`, `Sheet`, `AppShell` sidebar markup.
3. `globals.css`: one marked Vereino block after the platform tokens — `--focus-indicator` (new), `--focus-ring-outer: var(--foreground)` (both themes), `--input` (light `oklch(0.64 0 0)`, dark `oklch(0.56 0 0)`), `--ring` (light `oklch(0.64 0 0)`); the sidebar group heading colour (`--muted-foreground`); utilities `focus-indicator` / `focus-indicator-inset`; a base `:focus-visible` outline for elements without their own focus style; the schedule calendar outlines use `--focus-indicator`.
4. Every Vereino class with `focus-visible:shadow-focus` or a `focus-visible:ring-2 … ring-ring` combination now uses `focus-visible:focus-indicator` (`-inset` for the day-axis cells): 25 files in `packages/app/src/modules/*` and `packages/ui/src/*`.
5. Focus return: Radix returns focus only to a `DialogTrigger`; Vereino dialogs open from state, so focus fell to `<body>`. `@vereino/ui` gained `createReturnFocus` / `withReturnFocus` (pure) and `useReturnFocus` / `withReturnFocusContent` (React only); `packages/app/src/components/ui/dialog.tsx` wraps the app's platform `DialogContent` and `SheetContent`; 43 module files import them from there; ESLint `no-restricted-imports` (`DIALOG_CONTENT_RESTRICTIONS`) stops a new import of the platform ones in Vereino modules.
6. Axe baseline: removed the "AppShell sidebar group heading" `color-contrast` entry and its helper.
7. `tokens.md`: `--input`, `--focus-indicator` rows, the light and dark contrast tables, C1 and C2 status.
8. Integration test `ISSUE-481` (`packages/app/.ai/qa/tests/foundation/ISSUE-481-visible-focus.spec.ts`).

## Decisions

- **No spec:** the change is a styling contract plus one UI behaviour, fully specified on the issue; `AGENTS.md` Axis 3 `direct`.
- **Platform components keep `shadow-focus`:** overriding `--focus-ring-outer` makes their ring a 2 px foreground ring at 2 px offset — the same look as `--focus-indicator` — without ejecting anything (owner decision 1: no ejection).
- **The wrapper lives in the app, the logic in `@vereino/ui`:** `packages/ui/node_modules` has its own `@open-mercato/ui` and Radix; a `DialogContent` imported there would not share the app's `Dialog` and i18n contexts (lesson `vereino-ui-wraps-app-platform-components`). The first version did import it and was replaced before commit.
- **Override block instead of `vereino-tokens.css`:** the separate file is C4, decided with the club colour story (#482); this run keeps a marked block in `globals.css` so #482 can move it.

## Files changed

See the PR diff; main ones: `packages/app/src/app/globals.css`, `packages/app/src/components/ui/dialog.tsx`, `packages/ui/src/admin/return-focus.ts`, `packages/ui/src/admin/return-focus-content.ts`, `packages/ui/src/__tests__/return-focus.test.mjs`, `eslint.vereino.mjs`, `packages/app/scripts/__tests__/eslint-vereino.test.mjs`, `packages/app/.ai/qa/tests/_fixtures/axe.ts`, `docs/ux-concept/tokens.md`, 43 dialog call sites, 25 focus-class call sites, lessons.

## Commands and results

- `yarn workspace @vereino/ui test` — pass, coverage 100 % lines/branches/functions.
- `node --test packages/app/scripts/__tests__/eslint-vereino.test.mjs` — pass.
- `yarn generate`, `yarn typecheck` — pass.
- `yarn test:integration:vereino --filter ISSUE-481` — first run failed: `pl light button: indicator width (box-shadow) Expected: >= 2 Received: 0` (the platform button's `transition-all` was still fading the ring in); the helper now waits for the element's animations; rerun with `--no-build` — 1 passed.
- Axe tests touched by the baseline change, `--no-build`: `ENG-TEST-25` 1 passed, `E03-S02` 4 passed, `ISSUE-139` 1 passed.
- `yarn verify` — first run failed at `lint` (`react-hooks/rules-of-hooks` on the test helper `useScheme`, renamed `applyScheme`), then at `test` (`src/__tests__/ui/calendar-list.test.tsx` asserted the old `focus-visible:shadow-focus` class, updated); resumed from each step to green, then one full green run.

## Review round (PR #502)

An independent review (subagent, read-only) found:
1. **High, fixed:** a dialog whose first field has native `autoFocus` (CrudForm, e.g. "Add part" in `ClubEventPartDialog`) opens with focus already inside, so Radix's FocusScope skips `onOpenAutoFocus`; the opener was never recorded and Esc dropped focus on `<body>`. Fix: `OpenerProbe`, rendered inside the content, records the opener in an insertion effect (before React applies the commit's DOM changes and autofocus); `onOpenAutoFocus` stays as a fallback and does not overwrite it.
2. **Low, fixed:** a footer button that closes one dialog and opens another would focus the page opener behind the new modal; `onCloseAutoFocus` now leaves focus alone while another dialog is open.
3. **Low, fixed:** the test's contrast helpers ignored alpha; colours and translucent backgrounds are now composited, so a regression to a translucent token (the old dark `--input`) fails.
4. **Nit, kept:** the unlayered sidebar heading rule also fixes the hover text colour; harmless.

ISSUE-481 now also opens "Add part" on a club event in the panel, checks that its title field is focused, presses Esc, and expects "Add part" to have focus, in light and dark. Its first runs failed in the new test code: 401 (the club event was created with the admin token after the admin's browser sign-in ended it) and 400 (`sectionId` is required, `null` for a club-wide event). After those fixes: `ISSUE-481` 1 passed, `TEST-T11` 1 passed, `yarn verify` all 18 steps passed.

## Open problems

- Platform bugs worked around here (focus ring colour, sidebar heading contrast, controlled dialogs losing focus) are to be reported upstream to Open Mercato (owner decision 7).

## Next steps

- Review, QA evidence, merge train.
