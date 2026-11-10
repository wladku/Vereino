# Run log — #127 E08-S07 the municipality (owner) report with CSV

- **Date:** 2026-11-10
- **Trigger:** cezar task `om-auto-fix-issue 127` (unattended). The run of 2026-11-07 stopped before claiming because #123, #126 and #128 were not merged; all three are on `main` now (#126 merged as `4566ca4` while its issue stays open for the attendant role).
- **Spec:** `.ai/specs/2026-10-27-vereino-facilities.md` phase 5 step 8 (REQ-015, TEST-025, AC-015); README B-28, flow F-12.
- **Issue / branch:** #127 / `feat/issue-127-owner-report`.
- **Route:** feature (label `feature`), spec found → implemented directly on one implementation PR (the spec covers the work; no spec PR). No migration, no new module, no dependency: nothing Ask First.

## Goal

A facility and a period picker (month or quarter; from ≤ to; at most a year), hours by zone including club time, rentals (count and value), payments to the municipality's account, incidents and maintenance, the rentals table, CSV export with the same figures, and "No data for this period".

## Steps

1. Claimed #127 (assignee, `in-progress`, claim comment); renamed the task branch.
2. `lib/owner-report.ts` (pure): the period check (`report_period_order`, `report_period_too_long`), period dates and the month/quarter presets, scheduled zone minutes, club time split by zone, the reported and paid rental statuses, the empty check, the CSV; unit tests at 100 %.
3. `activities.placeSessions.clubSessionTimes` (planned and done sessions with their place, no limit) — additive to the DI contract; `facilities/services/directory.ts` wraps it.
4. `services/owner-report.ts`, `GET /api/facilities/reports/owner` (JSON and `format=csv`, `metadata` + `openApi`), feature `facilities.reports.view`, error codes and their en/pl messages.
5. `/backend/facilities/reports/owner` (B-28): place select, month/quarter with previous/next, KPI cards, rentals `DataTable`, "Export CSV", loading, empty and error states; en/pl catalogs.
6. Integration test TEST-025 (API figures against a count made in the test, CSV, empty period, 422/400/403/404, the page at 375 px).
7. Spec step 8 marked built, status and phase row updated, changelog file added.

## Decisions

- **The facility is the place and its sub-places.** The report is asked for one place; work on a sub-place (a court of a hall) belongs to the facility, work on the parent does not.
- **Zone hours are scheduled wall-clock hours from the zone rules**, summed over the facility's places; closures are not subtracted (the mockup does the same; closures are not in the scope list).
- **Club time is summed per entry, not merged**: two groups on two courts at once count twice, which is what a manual count of sessions and bookings gives. Each entry is split by the zones of its own place; time outside every zone is `none`.
- **Club time = `planned` and `done` sessions + confirmed internal bookings**, clipped to the period. Cancelled sessions and bookings do not count. `plannedSessions` has a 2000-row cap and `doneSessionTimes` has no place, so a new uncapped `clubSessionTimes` was added to `activities.placeSessions` (additive).
- **Rentals count by start in the period** with the billable statuses `requested`, `confirmed`, `done`, `cancelled_late`, `no_show` (as in the mockup); value = the sum of their amounts.
- **Payments always come from the rental register today** (`confirmed` and `done` rentals, `source: rental_register`): `payments` does not register `payments.chargeService`, so no rental has a charge. A late cancellation or no-show may have been paid, but the register keeps no payment record, so it is not counted; the screen states the source. When `payments` implements the DD-19 charge service with `statusOf`, the report can read charges instead (follow-up).
- **Maintenance = tasks done in the period** (`done_at` in the window), with their cost; incidents by `occurred_at`.
- **CSV keys and section names are English machine keys** (like the coach units report); amounts are plain decimals, rental times are club-zone wall times.
- **Validation:** shape errors 400 `report_query_invalid` (in the route, like `today_query_invalid`); the business rules 422 with module codes (lesson `business-rule-422-not-in-zod-schema`).

## Files changed

`packages/app/src/modules/facilities/{acl.ts,data/validators.ts,lib/owner-report.ts,lib/error-codes.ts,lib/__tests__/{owner-report,error-codes}.test.ts,services/{owner-report,directory}.ts,api/reports/owner/route.ts,components/OwnerReport.tsx,backend/facilities/reports/owner/page{,.meta}.ts(x),i18n/{en,pl}.json}`, `packages/app/src/modules/activities/services/place-sessions.ts`, `packages/app/.ai/qa/tests/facilities/TEST-025-owner-report.spec.ts`, the spec and its changelog file.

## Commands and results

- `npx jest src/modules/facilities/lib/__tests__/owner-report.test.ts --coverage` — 16 passed, `owner-report.ts` 100 % statements, branches, functions and lines (one first-run failure fixed: numeric CSV values went through the formula guard, so `-0.05` became `'-0.05`; now only the place name and renter are escaped).
- `yarn generate`, `yarn typecheck` — green.
- `yarn lint` — 0 errors (48 warnings, none in the changed files); `yarn ds:check` — 1232 files passed; `yarn i18n:check-hardcoded --strict` — exit 0.
- `yarn test:integration:vereino --filter TEST-025` — 1 passed (1.9 min); the `QueryIndexScopeError` log lines are the platform's club cleanup noise, also present in other runs.
- `yarn verify` — all 14 steps passed (`yarn test`: 76 suites, 971 tests; build green).

## Review (PR #241)

A fresh-context review subagent read the diff and the requirements. Its verdict was approve, with no high-severity findings:

- **Medium, deferred on purpose:** payments leave out a late cancellation or no-show of a rental that was confirmed (paid). The register stores no payment marker, and `requested → cancelled_late` / `no_show` also exist, so the status cannot tell paid from unpaid. The screen names the source ("confirmed or completed rentals"). This is solved by the `payments` charge service follow-up, or by a confirmation timestamp on the rental, which would need an owner-approved migration.
- **Low, fixed:** the club-time total was rounded separately from its parts, so it could differ from sessions + bookings by 0.01 h. The total is now the sum of the shown parts. The per-zone figures can still differ by 0.01 h through rounding. After the fix: `yarn typecheck`, `yarn format:check` green, and `--filter TEST-025` 1 passed again.
- **Low, kept:** scheduled zone hours are wall-clock, while club time is real time, so they differ on the two DST days. The rentals table shows times in the browser zone (the existing rentals pattern), while the CSV uses the club zone.

## Not verified

- The page was checked by TEST-025 at 375 px in English only (KPIs visible, export link, no overflow, no console errors); Polish was not walked in a browser, its catalog keys match the English ones.

## Open problems / follow-ups

- Payments from `payments` charges once `payments.chargeService` (with `statusOf`) exists; until then the register is the only source.
- The pilot municipality's agreement may ask for a different layout or more columns (Q-008 open); the CSV is a plain `section,item,value` summary plus the rentals.
