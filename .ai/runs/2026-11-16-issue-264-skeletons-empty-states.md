# Run: #264 — E09-S10 member and public pages load with a skeleton, and every empty list names the next action

- **Goal and trigger:** unattended cezar run (task 7158d1ca) of `om-auto-fix-issue` on #264, queued by the `cezar` label. Feature route: spec N phase 10 (REQ-N15, TEST-N16, AC-N15).
- **Spec:** `.ai/specs/2026-11-14-vereino-parity-navigation-and-naming.md` (Ready for implementation; Ask First item 5 — the skeletons in the `@vereino/ui` public API — approved by the owner on 2026-11-15 on #251; the dependency E09-S04 #258 is closed). **Issue:** #264, epic #251. **Branch:** `feat/issue-264-member-pages-skeleton-empty-lists`.

## Steps

1. Checked the issue's two blocking questions against the spec: status `Ready for implementation`, Ask First item 5 names "the skeletons (#264)" as approved. Claimed the issue (assignee, `in-progress`, `🤖` comment).
2. Listed the `LoadingMessage` call sites under `components/club*` and `components/public*` (26 in six modules) and the text loading lines of the Today tiles (`activities` club-today, `payments` today tile, `groups` ward groups), the link-request page and `TokenPageShell`.
3. `@vereino/ui`: `member/member-skeleton.tsx` — `MemberSkeleton({ shape: 'tiles' | 'rows' | 'fields', label, count?, className?, data-testid? })` on `@open-mercato/ui/primitives/skeleton`; the pieces sit in an `aria-hidden` box, the region has `aria-busy` and a visually hidden `role="status"` line. Exported from `index.ts`, README entry, `node --test` at 100 %. `TokenPageShell` loads with it (`/club/d/[token]`, `/club/o/[token]`).
4. One commit per module: `people` (the `ClubFrame` takes a `skeleton` shape — tiles on Today, fields on the profile), `activities` (frame prop, fields on the new-event form, rows elsewhere; Today tiles; link request; coach units empty → "Open the calendar"), `communication` (frame prop; inbox empty → "Write to the coach" when the household has staff; "nobody to write to" → "All messages"; Messages tile one-row skeleton), `facilities` (frame prop, tiles on the places list; the three hand-rolled skeletons replaced, test ids kept; empty places list → "Add a facility" for `club_core.manage`), `payments` (frame prop, tiles on orders, fields on an order; Today tile), `club_core` (public pages; empty sections → "Ask the club" to `#contact`; a section without classes → its contact or the club's sections; no upcoming events → "See the sections"), and `groups` (the ward groups widget).
5. TEST-N16 (`.ai/qa/tests/people/TEST-N16-member-skeletons-empty-states.spec.ts`), E06-S14's units empty assertion updated, the spec changelog entry and this log.

## Decisions

- **Frames take the shape (`skeleton` prop, default `rows`)** instead of every page rendering its own loading state: the frames load the profile before any page content, so that is where the first skeleton appears.
- **A visually hidden status line stays** (as `ClubPlacesPage` already did) so a screen reader still hears what is loading; the visible text "Loading…" is gone.
- **Informational empties keep their sentence without an action** where no member action fills the list — all paid, no open orders, no guardian shares contacts, nothing scheduled at the facility today, no published schedule this month — as the mock-up's `empty()` calls for those screens do. Lists a person can fill or reach got one action.
- **"Add a facility" only for `club_core.manage`:** the panel's place form needs it; `usePlacesFeatures` checks it in the same feature-check call.
- **Catalog reuse:** "Open the calendar" (`activities.club.today.openCalendar`), "All messages" (`communication.club.back`), "Write to the coach" (`communication.direct.action`) and `communication.club.loading` for the tile; new keys `facilities.places.list.add`, `club_core.public.askClub`, `club_core.public.askSection`, `club_core.public.events.seeSections` in en and pl.

## Commands and results

- `yarn workspace @vereino/ui test` → all pass, 100 % lines/branches/functions (`member-skeleton.tsx`, `token-page-shell.tsx` included).
- `yarn typecheck` in the fresh worktree before `yarn generate` → `TS2307 Cannot find module '@/.mercato/generated/…'` (generated files missing); `yarn verify` generates them first.
- `yarn format` → reformatted 4 call sites (committed as `style:`).
- `yarn verify` → `[verify] all 17 step(s) passed`.
- Exit gate: `grep -rln LoadingMessage */components/club* */components/public* */widgets/injection/club*` → no file.
- `yarn qa-texts:check` → `169 test file(s), 92 hardcoded UI text(s) left, 0 problem(s)`.
- `yarn test:integration:vereino --filter TEST-N16` → run 1: `1 passed (4.0m)`.
- Regression `--filter E06-S14` (its `club-units-empty` assertion compared the whole text, which now includes the calendar link; rewritten to `uiText` plus the link): run 1 stopped before any test with `SyntaxError: Identifier 'empty' has already been declared. (381:10)` and `Error: No tests found.` (the runner still exited 0); variable renamed, run 2: `1 passed (2.4m)`.
- Regression `--filter TEST-M13` (inbox and direct empty states) → `1 passed (2.4m)`.

## Open problems

- None. The PR leaves the inbox's "Write to the coach" twice on an empty inbox (header button and the empty-state link); reviewers may prefer only one.

## Next steps

- Phase 11 (README corrections, #265 or its successor) remains.
