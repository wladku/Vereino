# Issue #101: a member moves around /club with a bottom bar, switches the ward and signs out from More

- **Date:** 2026-11-03
- **Agent / tool:** Claude Code (Opus 5.5), `om-auto-fix-issue` with the repo-local override applied, run unattended under cezar
- **Trigger:** `/om-auto-fix-issue 101` (E06-S19, epic #82)
- **Spec / issue / branch:** #101; club spec `.ai/specs/2026-10-20-vereino-club-management.md` (*UI architecture*, phase 1 step 5); `feat/issue-101-member-bottom-bar` from `main` at 9dba789
- **Status:** completed, PR open for review.

## Goal

Every `/club` page gets a bottom bar (Today · Calendar · Messages · [fourth tab a later module grants] · More) with 48 × 48 px targets and `aria-current`. More offers Profile, the admin panel for staff and Sign out. The header gets a ward switcher and a role-context switcher that drive Today and the calendar. One nav definition in `@vereino/ui` serves all three member frames (README 3.1, M-02, M-03).

## Steps

1. Claimed #101 (assignee, `in-progress`, 🤖 comment). Classified as a feature. No spec covers the member shell; following the #103 precedent, the story and its acceptance criteria were the brief, and the club spec's *UI architecture* was updated in the same PR instead of opening a separate spec PR.
2. `@vereino/ui`:
   - `member-nav.ts`: the paths, `memberNav`, `memberShellLabels` and `hasStaffContext`.
   - `member-context.ts`: the roles and ward options, `memberCalendarScope`, a per-person session-storage store and `useMemberContext`.
   - `member-shell.tsx`: the bottom bar, More as a native `<details>`, sign-out as Open Mercato's own `<form action="/api/auth/logout" method="post">` pattern, and the header switchers on the platform `Select`.
3. The three frames (`people` ClubFrame, `activities` ActivitiesClubFrame, `communication` MessagesClubFrame) now use the shared definition. The duplicated path constants and `hasStaffContext` copies became re-exports.
4. Today's activities widget and `/club/calendar` read the header context:
   - acting as a coach, Today shows "My sessions today and tomorrow" with links to the attendance lists;
   - the calendar's own perspective and ward selects (and `perspectivesOf`, with their catalog keys) were removed.
5. Labels in en + pl for all three modules. Unit tests (node, 100 %), the app's Jest shell test, and the integration test `people/E06-S19-member-shell.spec.ts`. E03-S04, J-002 and TEST-047 were adapted to the new navigation.
6. Lessons, the club spec section and changelog row, and this log.

## Decisions

- **Role context:** "member" (guardian or own) and "coach", offered only to a person with the `coach` context. README 3.1 asks for a role switcher only for a person with more than one role, and the `self` context is always present, so it cannot tell a pure guardian from a guardian who also trains.
- **Ward switcher:** offered to a guardian of more than one ward (per the issue), with Everyone, each ward, and Me. Me replaces the calendar's old "My sessions" perspective for such guardians. A guardian with one ward no longer has an "own sessions" view on the calendar; this is a minor narrowing, recorded below.
- **Where the choice lives:** session storage, keyed by person id and cleared on sign-out. The choice must survive moving between frames that belong to different modules, but must never carry over to another person on a shared phone. It stays a view filter only (DD-07); the routes still authorize.
- **Sign-out:** a native form POST to the installed `auth` route, the same pattern as Open Mercato's `UserMenu`. The route revokes the session, clears the cookies and redirects to `/login`; nothing new was built.
- **Icons:** `lucide-react` (already an app dependency and a `@vereino/ui` devDependency) is now also a `@vereino/ui` peerDependency. No new package; the lockfile gains one peer line.
- **Jest:** maps `react` to the app's copy (lesson `jest-one-react-for-vereino-ui`).

## Commands and results

- `yarn verify`:
  - first run: failed at `test`. `yarn format` had trimmed `' pb-28'` inside a className template literal into `py-6pb-28` (lesson `tailwind-class-strings-in-constants`).
  - after the fix: `yarn verify --from test` passed 3/3, and the final full run before the commit passed 13/13.
- `@vereino/ui` `yarn test`: 91 passed, 100 % lines, branches and functions.
- App Jest `src/__tests__/ui`: 8 passed.
- `yarn test:integration:vereino --filter E06-S19`: the first run failed because the test's selector counted the Profile link inside the closed More panel (5 ≠ 4 targets); after fixing the selector, 1 passed (2.6 min).
- Reruns, one id each:
  - TEST-014: 1 passed. TEST-M10: 1 passed.
  - E03-S04 failed: `getByLabel(/^(Show|Pokaż)$/)` not found. J-002 used the same step. Both chose the coach perspective through the calendar's old select, which now lives in the header, so both now use the role-context switcher. After the change: E03-S04 1 passed, J-002 1 passed.
  - TEST-047 failed: `getByRole('link', { name: 'Profile' })` not found, because Profile is now behind More. The test opens More first; after the change, 2 passed.

## Open problems

- A guardian of exactly one ward has no "own sessions" view on the calendar any more (previously a perspective select). Follow-up if a guardian who also trains needs it.
- The fourth tab (Payments in E07, Facilities in E08) is a parameter of `memberNav` (`extraTab`); the modules that grant it wire it in.
- The More panel is a native disclosure: Escape and a tap outside do not close it.
