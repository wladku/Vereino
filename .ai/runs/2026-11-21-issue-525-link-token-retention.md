# Run: issue #525 — dead link tokens deleted 30 days after use or expiry (S9.5)

- **Goal and trigger:** cezar task (`om-auto-fix-issue 525`, workflow step 1 of 3: build, draft PR). The owner added the `cezar` label to #525, which the issue named as the scope confirmation it waited for.
- **Branch:** `feat/issue-525-link-token-retention`.
- **Spec/issue:** #525; engineering standards S9.5; `docs/compliance/retention.md` row R9, open item R-D. No spec change.

## Steps

1. Claimed #525 (assignee, `in-progress`, 🤖 comment naming this run).
2. Foundation: `DEAD_LINK_RETENTION_DAYS = 30` and `deadLinkCutoff(now)` in `foundation/lib/token-link.ts` (unit-tested); `TokenLinkService.purgeDead(em, scope, now)` hard-deletes the organization's rows that expired, were used (single-use links) or were deleted at or before the cutoff. It only runs for a service built with `dedicatedTable: true`, so the facilities online-request link that lives on `facilities_rentals` can never be purged through it.
3. One job per module, each a command + worker + daily schedule + operator CLI:
   - `activities.declaration_links.purge_dead` / `activities:purge-declaration-links` / `activities purge-declaration-links`;
   - `payments.order_links.purge_dead` / `payments:purge-order-links` / `payments run-job --job purge-order-links`;
   - `facilities.rental_links.purge_dead` / `facilities:purge-rental-links` / `facilities purge-rental-links`.
   Registered in each module's `setUpClub…` (so `seedDefaults` and `set-up-club` add it); a run that deleted nothing writes no audit entry (as #405).
4. New integration test `ISSUE-525` (seeds dead and live rows in the three tables for two clubs, runs the three jobs, checks deleted vs kept, a rerun deletes nothing, the other club untouched, `set-up-club` registers each job once with interval `1d`). Updated the exact `set-up-club` assertions in `ISSUE-221` (facilities) and `TEST-C14` (payments).
5. Docs: retention.md R9 names the jobs, R-D closed; DPIA lines on R9; `docs/ops/deploy.md` backfill table; payments and activities READMEs. Lesson `new-module-schedule-updates-set-up-club-tests`.

## Decisions

- Interval `1d` instead of a club-zone cron: the time of day does not matter, and an interval needs no re-registration on a time-zone change.
- "Dead" for until-expiry links (declaration, order) is the expiry only: they are reusable until then, so a use does not kill them. For the single-use rental link it is also `used_at`. A soft-deleted row counts as dead from `deleted_at`.
- No Ask First item: no migration (no index added; the purge filters on the existing `(tenant_id, organization_id)` index of each table), no new module, no dependency; the CLI and `set-up-club` output changes are additive.

## Results

- `yarn test:integration:vereino --filter ISSUE-525`: 1 passed (1.1 m).
- `yarn test:integration:vereino --filter ISSUE-221`: 1 passed (40.2 s).
- `yarn test:integration:vereino --filter TEST-C14`: 1 passed (1.4 m).
- `yarn verify`: all 18 steps passed (lint reports one pre-existing warning in `packages/ui/src/member/error-summary-model.ts`, untouched here).

## Open problems / next steps

- Existing clubs get the schedules from the next `set-up-club` run of each module (deployment checklist) or, for activities/payments, the next club settings change.
- Reviewer (workflow step 2) marks the draft PR ready.
