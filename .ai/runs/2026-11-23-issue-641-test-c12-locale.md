# Run: #641 — TEST-C12 switches the locale through the club default, not the cookie alone

- **Goal and trigger:** unattended cezar run (task 8d837662) of `om-auto-fix-issue` on #641, queued by the `cezar` label. Test-only bug: TEST-C12's `pl` passes set only the `locale` cookie, which the member shell rewrites to the member's resolved locale (club `defaultLocale`, set to `en` by the test), and its `uiText()` patterns match both catalogs, so a pass that rendered English still passed.
- **Issue:** #641 (found in #640 / #595). **Branch:** `fix/issue-641-test-c12-locale-cookie`. No spec change: the test's coverage claim (payments parity spec, TEST-C12) stays the same; the test now proves it.

## Steps

1. Claimed #641 (assignee, `in-progress`, `🤖` claim comment naming this run).
2. `TEST-C12-guardian-orders-on-the-phone.spec.ts`: a `switchLocale(locale)` helper sets the club's `defaultLocale` (`updateClubSettings`, admin token — Kasia's browser sign-in does not end it) and the `locale` cookie; a `visit(path)` helper navigates and asserts `<html lang>` equals the active locale. All three locale loops (Today/M-16/M-17 open, M-16/M-17 picked up, M-19 guest link) and every other navigation go through them; each `en` reset before an axe scan re-visits the page so the scan runs on an English render.
3. Lesson `panel-language-follows-club-default-locale` extended: a locale loop asserts `<html lang>` after each navigation. (Lesson `member-pages-locale-follows-the-member-not-the-cookie` named by the issue lands with #640, not yet on `main`, so the test comment points at the existing lesson.)

## Decisions

- The club default rather than Kasia's preferred locale: the same mechanism TEST-C11/TEST-C13 use in #640, and it also drives the guest M-19 page.
- `<html lang>` on every navigation, not only the first of each pass, as the issue's done-when asks.

## Files changed

- `packages/app/.ai/qa/tests/payments/TEST-C12-guardian-orders-on-the-phone.spec.ts`
- `.ai/lessons/panel-language-follows-club-default-locale.md`
- this log

## Commands and results

- `npx tsc --noEmit -p .ai/qa/tests/tsconfig.json` (in `packages/app`) — clean; `npx prettier --check` on the spec — clean.
- `yarn test:integration:vereino --filter TEST-C12` — `1 passed (56.3s)` (the test itself 24.0s), including the `lang="pl"` checks on `/club`, `/club/orders`, `/club/orders/[id]` and `/club/o/[token]`.
- `yarn verify` (first run) — failed at `lint`:
  ```
  226:13  error  React Hook "useLocale" may be executed more than once. Possibly because it is called in a loop.  react-hooks/rules-of-hooks
  ```
  The helper was named like a hook; renamed to `switchLocale`.
- `yarn verify --from lint` — all 17 steps passed (generate, typecheck, typecheck:packages, typecheck:qa passed in the first run; `tsc -p .ai/qa/tests/tsconfig.json` clean again after the rename).
- `yarn test:integration:vereino --filter TEST-C12` after the rename — `1 passed (55.5s)`.

## Open problems / next steps

- None for this issue.
