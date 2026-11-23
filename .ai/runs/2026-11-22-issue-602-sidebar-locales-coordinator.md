# Run: issue #602 — AC-N01, the sidebar in both locales, Dashboard first, no Finanse for a coordinator

- **Goal / trigger:** cezar task (om-auto-fix-issue), issue #602 labelled `cezar`. Test-only gap found by the navigation spec's close-out III (#568).
- **Spec:** `.ai/specs/2026-11-14-vereino-parity-navigation-and-naming.md`, AC-N01.
- **Branch:** `test/issue-602-sidebar-locales-coordinator`.

## Steps

1. Claimed #602 (assignee, `in-progress`, `🤖` claim comment naming this run's worktree and branch).
2. Read `TEST-N01-club-sidebar-group` (#513) and the platform `AppShell`: the "Dashboard" item of the spec's *Menu structure* is the platform's sidebar home link (`href="/backend"`, accessible name `<brand> – appShell.goToDashboard`), rendered above the `sidebar` nav in the same `aside`.
3. Second test case now runs per locale (`POST /api/auth/locale`, `pl` then `en`): checks `<html lang>`, that the first link of the sidebar column is Dashboard and the next one is the first Klub item, and compares every group name and item label with that locale's exact catalog text (`uiTextIn`) instead of the either-locale pattern.
4. First test case: the coordinator's sidebar has no group named `payments.nav.group` and no link to `/backend/payments*`.
5. Ticked AC-N01 with its evidence; changelog file `2026-11-22-issue-602-ac-n01.md`. The status line is unchanged (lifecycle state only).

## Decisions

- Dashboard's accessible name carries the brand prefix ("Vereino – Przejdź do pulpitu"), so the test asserts it *contains* the catalog text; the href is asserted exactly.

## Commands and results

- `yarn test:integration:vereino --filter TEST-N01`, first run: case 2 failed — `pl: Dashboard first`, expected label `"Przejdź do pulpitu"`, received `"Vereino – Przejdź do pulpitu"` (fixed as above).
- `yarn test:integration:vereino --filter TEST-N01`, second run: 2 passed (48.1 s).
- `yarn verify`: all 20 steps passed.
- `yarn guard`: no blocking findings.

## Open problems / next steps

None.
