# Run: issue #246 — the Club group is missing from the admin sidebar

- **Goal and trigger:** unattended cezar run (task 0ef31199) of `om-auto-fix-issue 246`.
- **Issue:** #246 (`bug`, `priority-high`, `risk-medium`). **Spec:** `.ai/specs/2026-11-14-vereino-parity-navigation-and-naming.md` (REQ-N01, DD-N01, TEST-N01, TEST-N02, phase 1). **Branch:** `fix/issue-246-club-sidebar-group`.

## Steps

1. Concurrency check: no assignee, no `in-progress`, no open PR referencing #246 → claimed (assignee, `in-progress`, 🤖 comment).
2. Scope: the owner's correction comment of 2026-11-15 replaces the issue's original fix (a guard in `layout.tsx`) and waits for "the owner's go on this issue or for PR #249 to merge". PR #249 merged on 2026-11-15 06:28 UTC, so the corrected scope applies: remove `pageContext: 'settings'` from Settings and Publication, order the Club group, a sidebar regression test after the chrome payload, a `yarn verify` guard.
3. Root cause confirmed: `club_core/backend/club/publication/page.meta.ts` declared `pageContext: 'settings'`; both prefix rules (`layout.tsx` `collectStaticSettingsPathPrefixes`, platform `computeSettingsPathPrefixes`) add the parent `/backend/club` as a settings prefix, and `AppShell` `isMainItem` drops every main item under it.
4. Wrote the guard `packages/app/scripts/check-settings-prefixes.mjs` first and ran it on the unfixed tree: 12 problems (every `/backend/club/**` page). After the fix: 74 Vereino pages, 0 problems — no other Vereino module has the same trap (`club_core` was the only module with `pageContext`).
5. Fix: removed `pageContext` from both pages; `pageOrder` Sections 10, Places 20, Institutions 30, Contracts 40, Settings 50, Publication 60.
6. Wired `settings-prefixes:check` into `scripts/verify.mjs` (after `contracts:check`), the app and root `package.json`, the `test:scripts` coverage includes, `coverage-scope.test.mjs`, and the coverage lists of `AGENTS.md` and `CODE_REVIEW.md`.
7. Tests: unit `check-settings-prefixes.test.mjs` (TEST-N02); integration `club_core/TEST-N01-club-sidebar-group.spec.ts`.

## Decisions

- **Contracts stays a visible menu item.** The spec hides it once phase 2 makes it a tab of "Institutions and contracts"; hiding it now would make the page unreachable from the menu, which is this issue's bug.
- **The guard reads the generated route metadata** (spec wording), not `page.meta.ts` sources, so it sees the paths exactly as the shell does. It fails closed: a missing file, no Vereino entry, or a Vereino entry whose metadata is not inline JSON is an error.
- **Every non-settings page counts, hidden and dynamic ones included**: under a settings prefix such a page opens the settings sidebar instead of the main one.
- **Only part of phase 1.** `overrides.nav.groupOrder`, the other groups and the menu labels belong to the spec's phase 1 too but are outside #246; the Places title rename ("Miejsca", D-031 §2) is phase 3.
- **TEST-N01 is scoped to the Club group**; phase 1's remainder extends it to the six groups and the attendant.

## Commands and results

- `node scripts/check-settings-prefixes.mjs` before the fix → exit 1, 12 problems; after → `74 Vereino page(s), 0 problem(s)`.
- `yarn test:scripts` → 157 tests pass, 100 % lines/branches/functions including `check-settings-prefixes.mjs`.
- `yarn typecheck:qa` → clean.
- `yarn test:integration:vereino --filter TEST-N01` with the fix → `1 passed (2.0m)`.
- Same run with the six `page.meta.ts` files restored to `main` (58b7757) → failed on both attempts at the first sidebar read: `Error: expect(locator).toHaveCount(expected) failed — Expected: 1, Received: 0` (`clubGroupLinks`, no Club group in the sidebar). The fixed files were put back afterwards.
- `yarn verify` → generate, typecheck, typecheck:packages, typecheck:qa pass; lint failed on `packages/app/.ai/qa/test-results/html/trace/assets/*.js` (the Playwright report of the deliberately failing run above — lesson `verify-lint-scans-integration-report-and-scope-is-trusted-only`). Removed the ignored report folder; `yarn verify --from lint` → all 11 remaining steps pass, including the new `settings-prefixes:check` and `build`.
- A first `yarn verify` attempt lost its log when the shell's `/tmp` was emptied mid-run; it was rerun with the log in the task's tmp folder and its result was not used.

## Open problems and next steps

- Rest of navigation spec phase 1: `overrides.nav.groupOrder` (V-N02), the other five groups and menu labels (V-N03), TEST-N01 extended to every group and the attendant.
- The `[verify] summary` column is 22 characters wide, so `settings-prefixes:check` (23) pushes its duration one space right; cosmetic, left as is because `verify.test.mjs` pins the width.
