---
title: "A new member More entry needs its label in all seven frame catalogs and the exact More lists of E09-S04"
modules: ["ui", "people", "groups", "activities", "payments", "facilities", "communication", "training"]
areas: ["backend-ui", "testing"]
topics: ["member-nav", "more-menu", "i18n", "member-shell", "integration-tests", "react-hooks-lint"]
---

# A new member More entry needs its label in all seven frame catalogs and the exact More lists of E09-S04

**Context**: #868 added **Invitations** (`/club/invitations`, feature `people.invitations.share`) to the member bottom
bar's More menu (`MEMBER_MORE_DESTINATIONS` in `packages/ui/src/member/member-nav.ts`). The same run's share dialog
first issued its link from a `useEffect` and kept the latest callback in a ref assigned during render; `yarn lint`
(React Compiler rules `react-hooks/set-state-in-effect` and `react-hooks/refs`) refused both.

**Problem**: Every member frame builds its labels with `memberShellLabels(t, '<module>.<…>.nav')`, so a new key in
`MemberShellLabels` must exist in seven modules' `en.json` and `pl.json` (people, groups, activities, payments,
facilities, communication, training); a missing one shows the raw key on that module's pages only. The feature joins
`MEMBER_NAV_FEATURES`, so every role holding it gets one more More entry, and
`people/E09-S04-member-bottom-bar.spec.ts` asserts the coach's More length and the coordinator's exact More list.

**Rule**: When adding a More destination: add the label key after its neighbour in all seven frame catalogs (both
locales), extend `MEMBER_SHELL_LABEL_KEYS` and the unit tests' label count, and update the exact lists and lengths in
`E09-S04-member-bottom-bar.spec.ts` for every role that gains the feature (its `followEveryEntry` also opens the new
page). For a dialog that must call the server when it opens, issue through `useQuery` with `enabled: open`,
`gcTime: 0` and mount the dialog only while open, and wrap a parent callback the effect calls in
`React.useEffectEvent` — never a ref written during render.

**Applies to**: `packages/ui/src/member/member-nav.ts`, the `*ClubFrame.tsx` frames and their `i18n` catalogs,
`packages/app/.ai/qa/tests/people/E09-S04-member-bottom-bar.spec.ts`, client dialogs under `packages/app/src/modules`.
