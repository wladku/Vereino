# Every touch target on the member pages is at least 44 × 44 px (E20-S12, #491)

- **Date:** 2026-11-20
- **Agent / tool:** Claude Code (claude-opus-5-5), om-auto-fix-issue, Cezar run 25189a89
- **Trigger:** Cezar automation on the `cezar` label of #491
- **Spec / issue / branch:** UX concept R05.1 (`docs/ux-concept/tokens.md`), #491, epic #479, branch `fix/issue-491-touch-target-44px-member-pages`
- **Status:** completed

## Goal

Every interactive element on the main `/club` pages has a hit area of at least 44 × 44 px at 375 px; a consent row toggles its switch when its text is tapped; an automated measuring test.

## Steps

1. Claimed #491 (assignee, `in-progress`, `🤖` comment naming this worktree).
2. `MemberSwitchField` in `@vereino/ui` (member): the whole row is one `<label>` (`min-h-11`), the platform `Switch` button grows to 44 × 44 px around its unchanged 28 × 16 px track; name by `aria-labelledby` (label text only), description by `aria-describedby`. Unit tests at 100 % coverage.
3. Replaced the platform `SwitchField` on the member pages: `/club/profile` (contact, presence, public name), own consents (M-10), `/club/wards/[id]`, the coach's and the phone cash forms.
4. `/club/calendar`: Week/Month and My sessions/Section segmented items `h-11` (track `h-auto`), section view tabs `min-h-11` (list `h-auto`). Day chips (M-11) `min-h-11`.
5. Toast "Dismiss": a 44 × 44 px hit area through a rule in `globals.css` (`.z-toast [data-slot="alert-dismiss"]`, negative margins keep the layout); `CONTRIBUTING.md` patch row and an engineering-standards changelog file.
6. Radios on `/club` were already inside `min-h-11` labels (new message, venue mode, attendance, slot type); the audit measured the bare 20 px radio. The measuring test counts a control's label as its hit area.
7. Integration test `platform/E20-S12-member-touch-targets.spec.ts` with the fixture `_fixtures/touch-targets.ts`.
8. Run 2 of the test found more targets the audit had not listed: the platform `Input` is a wrapper `div` with a 20 px `<input>` inside (profile e-mail and phone, message subject, "Other day" date) — now `className="h-12"` + `inputClassName="self-stretch"`; the place-name heading links on `/club/places` (22 px) — `inline-flex min-h-11`; the "Only to be moved" checkbox (16 px) — the whole row is now a `<label>`.
9. The locale cookie alone does not change a member page's language (the person's preferred language wins), so the first "en" pass was Polish. The test now sets `preferredLocale` through `PUT /api/people/me` and checks `<html lang>`; the English pass found the Today messages tile link "All" (15 px wide) and the inbox ward filter "All" (39 px) — both `min-w-11`.
10. Screenshots (375 px and 1280 px, pl and en, light and dark) from a temporary spec that was not committed; attached to the PR.

## Decisions

- Work around the platform components (owner decision 7 in #479) instead of ejecting: a Vereino component for the switch row, one CSS rule for the toast.
- The measuring rule: hit area = the larger of the control's box and any of its labels; exempt disabled, visually hidden (≤ 1 px), nested and inline-in-text targets (WCAG inline exception).

- A round switch's corners are outside its hit shape; the test taps beside the track at the middle of the 44 px button, and the label catches the rest.

## Files changed

- `packages/ui/src/member/member-switch-field.tsx`, `packages/ui/src/index.ts`, `packages/ui/src/__tests__/member-switch-field.test.mjs`
- `packages/app/src/modules/people/components/club/{ClubProfilePage,ClubWardPage,OwnConsentsSection}.tsx`
- `packages/app/src/modules/payments/components/{cash/CashAcceptForm,club/coach/CoachPaymentsPage}.tsx`
- `packages/app/src/modules/activities/components/club/ClubCalendarPage.tsx`
- `packages/app/src/modules/facilities/components/{day-axis/DayChips,club-places/ClubPlacePage,club-places/ClubPlacesPage}.tsx`
- `packages/app/src/modules/communication/components/club/{ClubMessagesPage,ClubNewMessagePage}.tsx`, `communication/widgets/injection/club-messages/widget.client.tsx`
- `packages/app/src/app/globals.css`, `CONTRIBUTING.md`, `.ai/specs/changelog/2026-10-21-engineering-standards-and-patterns/2026-11-20-issue-491-toast-dismiss-hit-area.md`
- `packages/app/.ai/qa/tests/_fixtures/touch-targets.ts`, `packages/app/.ai/qa/tests/platform/E20-S12-member-touch-targets.spec.ts`
- `.ai/lessons/member-touch-targets-measure-the-hit-area.md`, this log

## Commands and results

- `yarn workspace @vereino/ui test` → 215 pass, 100 % lines / branches / functions.
- `yarn test:integration:vereino --filter E20-S12` run 1 → failed: `locator.click … <label …> intercepts pointer events` (corner of the round switch); run 2 → failed with the undersized list (inputs 20 px, place links 22 px, checkbox 16 px); run 3 → passed; run 4 (real English) → failed: `a[club-tile-messages] "All (Open the messages)" 15×44`, `button[club-messages-ward] "All" 39×44`; run 5 → 1 passed.
- Related tests after the change, each `--filter <ID> --no-build`, all passed: TEST-006, TEST-L11, TEST-L12, E06-S22, TEST-R18, TEST-R12, TEST-R03, E08-S03, TEST-C13, E06-S18, TEST-A16, TEST-008, TEST-N16, E06-S19, TEST-N15, TEST-M10.
- `yarn verify` → failed at lint (`restrict-template-expressions` in the fixture), fixed; `yarn verify --from lint` → 14 steps passed; full `yarn verify` → all steps passed.

## Open problems / next steps

- Upstream report draft (with E20-S18): the platform `Switch` (32 × 20 px), `Radio` (20 × 20 px) and `Alert` dismiss (20 × 20 px) have no touch-size variant; a `size="touch"` (44 px hit area) would let apps drop the wrappers.

## Follow-up run 2026-11-20: PR #512 brought up to date with `main` (om-auto-fix-pr)

- Trigger: the merge train flagged #512 as conflicting with `main`. Worked on a detached HEAD at `origin/fix/issue-491-touch-target-44px-member-pages`; merged `origin/main` (no rebase, no force-push).
- Conflict: `CONTRIBUTING.md` only, in the platform-patch table. Kept this PR's `globals.css` row (toast dismiss hit area, #491) and `main`'s `backend/layout.tsx` row (#485). `globals.css`, `ClubMessagesPage.tsx`, `CashAcceptForm.tsx` and `packages/ui/src/index.ts` merged automatically. `main`'s focus work (#481) changes nothing in this PR's controls: the platform `Switch` inside `MemberSwitchField` draws `shadow-focus`, which #481 recoloured, and no file of this PR imports the platform `DialogContent`.
- Review of the PR diff: no blocking findings.
- `yarn verify` on the merge result → all 18 steps passed.
- `yarn test:integration:vereino --filter E20-S12-member` on the merge result → 1 passed (1.0m).

## Follow-up run 2026-11-20 (2): second `main` merge into PR #512 (om-auto-fix-pr)

- Trigger: the merge train flagged #512 as conflicting again after E20-S03 (#500, `StatusTag`) landed. Detached HEAD at `origin/fix/issue-491-touch-target-44px-member-pages`; merged `origin/main` (no rebase, no force-push).
- Conflicts: imports only, in `CashAcceptForm.tsx`, `CoachPaymentsPage.tsx`, `ClubProfilePage.tsx` and `ClubWardPage.tsx`. This PR replaced the platform `SwitchField` with `MemberSwitchField`; `main` replaced `StatusBadge` with `StatusTag`. Neither old import is used any more, so both are dropped and `MemberSwitchField` and `StatusTag` come from one `@vereino/ui` import per file. `StatusTag` is not interactive, so the touch-target check does not count it.
- Review: no open review findings on the PR; no new ones on the merge result.
- `yarn verify` on the merge result → all 18 steps passed.
- `yarn test:integration:vereino --filter E20-S12-member` → 1 passed (58.3s).
- `yarn test:integration:vereino --filter E20-S03` → 1 passed (40.8s).
