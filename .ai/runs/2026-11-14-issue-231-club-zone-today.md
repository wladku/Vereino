# Run: fix #231, a page's "today" from the club zone instead of the browser clock

- **Goal / trigger:** cezar task `d4197cbe` started `om-auto-fix-issue 231`. Fix the person record's Groups tab, which shows a membership starting today as `upcoming` around midnight. Per the owner's comment, also fix every client-side `localToday()` compared with club calendar dates (the second instance: the cash form in `TEST-043`).
- **Issue / branch:** #231, `fix/issue-231-club-zone-today` (renamed from `cez/231`). No spec: a bug fix (`direct`).
- **Claim:** assignee `wladku`, `in-progress` label and a `🤖` claim comment, posted 2026-11-14.

## Steps

1. Triage: still unfixed on `main` (`a312199`). Six modules (activities, club_core, facilities, groups, payments, people) each build "today" from `new Date()` getters (form defaults, `max` limits, status comparisons, period presets). The `/club` units pages and the coach units report also have a `currentMonth()` of the same kind.
2. Design: the backend layout already reads `clubCoreSettings` on the server for the club logo. It now also reads `values.timezone` and provides it through a React context. Components call `useClubToday()` synchronously: no new route, no extra request and no first-render flicker.
3. Added `clubToday`, `browserTimeZone` and `monthOf` (`packages/ui/src/admin/club-today.ts`), plus `ClubTimeZoneProvider`, `useClubTimeZone` and `useClubToday` (`club-today-context.tsx`), with unit tests at 100 % coverage.
4. Wired the provider into the backend layout through the client boundary `packages/app/src/components/ClubTimeZone.tsx`, so the `@vereino/ui` barrel stays out of the server graph. Also wired it into `ActivitiesClubFrame` and `PaymentsClubFrame`, from `/api/people/me` → `club.timezone`, which those frames already read.
5. Replaced every `localToday()` / `localMonth()` / `currentMonth()` and removed the module helpers. Click-time values (removing a day's availability, the preview's "current week", resetting the cash form, a campaign's starting point, a person's birth-date check on save) and the live `max` of payment dates use `clubToday(new Date(), timeZone)`.
6. Pinned a browser zone in the two specs that failed in CI: `E06-S02` uses `Pacific/Pago_Pago` (12 h behind Warsaw) and `TEST-043` uses `Pacific/Kiritimati` (13 h ahead). Each catches a regression for half of every day, not only in the 23:00 UTC hour.
7. Lesson `client-today-is-the-club-zone-date`.

## Decisions

- **Context, not a new route.** A `GET /api/club_core/today` would be a new contract. Each page fetching the zone would delay form defaults until the response, and coaches lack `club_core.view` for `/api/club_core/settings`. The layout already holds the snapshot.
- **`useClubToday` is memoized per zone, so it is the date at first render.** `CrudForm` re-applies changed `initialValues`, so a date that rolled over at midnight would discard typed input. Values that must be current at the moment of an action use `clubToday(new Date(), …)` instead.
- **Fallback is the browser zone** when there is no provider or the zone is unknown, which is the previous behavior. Example: a platform superadmin without an organization.
- **Out of scope:** `activities` `instantDate`/`instantTime` and `facilities` `instantLabel` render instants in the browser zone. That is a display concern, not "today", and is noted in the PR as a possible follow-up.

## Files changed

- `packages/ui/src/admin/club-today.ts`, `packages/ui/src/admin/club-today-context.tsx`, `packages/ui/src/index.ts`, `packages/ui/src/__tests__/club-today.test.mjs`
- `packages/app/src/app/(backend)/backend/layout.tsx`, `packages/app/src/components/ClubTimeZone.tsx`
- `packages/app/src/modules/{activities,club_core,facilities,groups,payments,people}/components/**`, `groups/widgets/injection/person-groups/widget.client.tsx`
- `packages/app/.ai/qa/tests/people/E06-S02-person-record-tabs.spec.ts`, `packages/app/.ai/qa/tests/payments/TEST-043-cash-with-receipts.spec.ts`
- `.ai/lessons/client-today-is-the-club-zone-date.md`

## Commands and results

- `yarn workspace @vereino/ui test`: 119 pass, 100 % lines/branches/functions.
- `yarn generate && yarn typecheck && yarn typecheck:packages && yarn lint`: green (lint: 0 errors, only warnings that were already there).
- `yarn lessons:check`: valid.
- `yarn test:integration:vereino --filter TEST-043`: 1 passed (2.7 min), run around 21:45 UTC. That is 22:45 in Warsaw, while the browser (`Pacific/Kiritimati`) was already on 2026-11-15, so browser and club dates differed during the run.
- `yarn test:integration:vereino --filter E06-S02`: 1 passed (1.9 min). Browser and club dates were the same during this run, so it shows no regression; the pinned zone catches the bug from midnight to noon in Warsaw.
- `yarn verify`: all 14 steps passed.

## Open problems / next steps

- Possible follow-up: show instants (`instantDate`, `instantTime`, `instantLabel`) in the club zone.
