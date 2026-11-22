# Run — issue #586: TEST-F11, member shell switchers by keyboard and their absence

- **Trigger:** Cezar queue (`cezar` label on #586), skill `om-auto-fix-issue`, unattended.
- **Issue:** #586 (epic #565); spec `.ai/specs/2026-10-27-vereino-foundation-primitives.md` — AC-F13, TEST-F11.
- **Branch:** `test/issue-586-member-shell-switchers`.

## Goal

Write TEST-F11: drive the `/club` role-context and ward switchers with the keyboard only, and assert that the ward
switcher is absent without wards and the role switcher with fewer than two grant kinds. Amend the spec's component
names (`MemberPage`, `TodayTiles`, `RoleContextSwitcher`, `WardSelector`) to what was built (`MemberShell` and its header
switchers, the `people` Today page).

## Steps

1. Claimed #586 (assignee, `in-progress`, `🤖` claim comment naming this worktree and branch).
2. Read `MemberShell` (`packages/ui/src/member/member-shell.tsx`), `memberSwitchers`/`showsWardSwitcher`
   (`member-context.ts`) and `E06-S19-member-shell` (the mouse-driven switcher test) and the `familyFor` fixture.
3. Wrote `packages/app/.ai/qa/tests/foundation/TEST-F11-member-shell-switchers.spec.ts`.
4. Amended the spec's UI table, the Phase A2 implementation status and the Today mock-up caption; changelog file
   `.ai/specs/changelog/2026-10-27-vereino-foundation-primitives/2026-11-22-issue-586-test-f11.md`; ticked AC-F13.
5. Lesson `radix-select-keyboard-wait-on-focus-not-highlight` for the keyboard-loop race.

## Decisions

- Users: the coach of Żaki made guardian of two wards (two grant kinds, two wards: both switchers); the 16-year-old
  participant with an account (member only, no wards) and the pool instructor (staff only, no wards) for the absence.
  All come from `familyFor`, no new fixture.
- Keyboard: Tab/Shift+Tab to the trigger, Enter (and Space) to open, ArrowUp/ArrowDown one key at a time to the option, Enter to pick,
  Escape to close without a change; focus is asserted back on the trigger after each choice.
- One axe scan (light and dark, 375 px) with both switchers shown; the other states are already scanned by
  `E06-S19-member-shell` and `ISSUE-493-today-and-calendar-phone`.
- `aria-live` of `DeclarationControls` stays proven by its `packages/ui` unit test (#537), as the issue states.
- No product code changed.

## Commands and results

- `yarn test:integration:vereino --filter TEST-F11`, run 1: failed both attempts —
  `expect(locator).toHaveAttribute(expected) failed … getByRole('listbox').getByRole('option', { name: 'Stanislaw Nowak' }) … unexpected value "null"`
  (the ArrowDown loop read `data-highlighted` one render late and overshot).
- Run 2 (focus check instead of the attribute): failed both attempts on returning to "Everyone" —
  `expect(locator).toBeFocused() failed … { name: /^(?:Everyone|Wszyscy)$/ }`; the screenshot showed focus on "Me".
- Run 3 (waiting for the opening focus before `Home`): flaky, failed first, passed on retry.
- Cause: Radix Select moves focus for arrow keys and `Home` in a `setTimeout`. Fixed by pressing one arrow key at a time
  and waiting for the expected option's focus after each press (lesson `radix-select-keyboard-wait-on-focus-not-highlight`).
- Runs 4 and 5, and run 6 after `yarn format`: `1 passed` on the first attempt, about 14 s each.
- `yarn verify`: first run failed at `typecheck:qa` (`TS2345: Argument of type 'Element' is not assignable to parameter
  of type 'SVGElement | HTMLElement'`), fixed; `yarn verify --from typecheck:qa`: all 17 steps passed (earlier steps passed in the first run).
- `yarn guard`: no blocking findings.

## Open problems / next steps

None.
