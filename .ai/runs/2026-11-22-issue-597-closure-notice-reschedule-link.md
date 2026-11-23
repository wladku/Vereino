# Run log — #597: closure notices link coordinators to "Needs a new time"

- **Trigger:** Cezar run b17e477d (`om-auto-fix-issue`), issue labelled `cezar`.
- **Issue:** #597 (epic #565). **Spec:** `.ai/specs/2026-11-14-vereino-parity-facilities.md` AC-R14; groups and activities spec REQ-A05 / REQ-A10.
- **Branch:** `fix/issue-597-closure-notices-needs-new-time`. **Route:** `direct` (bug: code deviates from an accepted criterion).

## Steps

1. Claimed the issue (assignee, `in-progress`, `🤖` claim comment).
2. Found the "Needs a new time" view for staff on the phone: `/club/calendar?as=coordinator&view=reschedule[&section=]` (`activities/lib/coordinator-sessions.ts` `sectionCalendarHref`). It exists only for a person with the `coordinator` scope (`staffCalendarChoice`); a coach without it and a booker have no such view.
3. `facilities/lib/reschedule-notice.ts`: `planRescheduleNotices` records per notice the sections the person is told about as a coordinator (`coordinatedSectionIds`); new `rescheduleStaffHref` returns the section calendar's reschedule view (narrowed to the section when one) for a coordinator, and the M-11 fallback (`placeDayToMoveHref`) otherwise.
4. `emails/templates.ts`: optional param `linkSectionIds` (≤ 2 — the link needs only "one" or "several"; absent for dispatches enqueued before this change, which keep the fallback); action label "Open sessions that need a new time" for the coordinator's link (new key `facilities.email.reschedule.actionSessions`, en + pl). `services/reschedule-notice.ts` passes the ids.
5. Unit tests for the plan and the link (100 % lib coverage kept). `TEST-R18-reschedule-notices`: the coordinator's e-mail link opens "Needs a new time" at 375 px (tab selected, the two flagged sessions listed, the unflagged one absent, axe in pl/en light/dark, no overflow); the coach's link keeps proving the M-11 fallback with the earlier checks.
6. Spec: AC-R14 ticked with evidence; changelog file `2026-11-22-issue-597-ac-r14-link.md`. Status line untouched (AC-R05 still open).

## Decisions

- **Coach keeps the fallback:** the spec makes M-11 "the permanent fallback when the view is not available"; a coach without the coordinator scope sees only "My sessions", so a reschedule link would show the wrong page.
- **URL built in facilities, not imported:** the eslint `boundaries` policy refuses a value import from `activities` into `facilities` (first gate run failed at `lint`); the URL is built in the lib with a comment naming `sectionCalendarHref`, and TEST-R18 proves the page reads it.
- **In-app notification unchanged:** its link is static per notification type (`/club/places`); a per-recipient in-app link would need a new type (contract change), out of scope.

## Commands and results

- `yarn verify` → first run failed at `lint` (boundaries/dependencies on the activities import; fixed), then at `glossary:check` ("zajęcia" is a retired term → "terminy"); resumed with `--from` and all remaining steps passed (`[verify] all 9 step(s) passed`).
- `yarn test:integration:vereino --filter TEST-R18` → `1 passed (49.3s)`.

## Open problems / next steps

- None. AC-R05 (renter e-mail on automatic expiry) remains open in the spec, tracked separately.
