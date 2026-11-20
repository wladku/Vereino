# Run: issue #440 — club events on the phone: options error state, Past list order, lighter form imports

- **Goal and trigger:** Cezar run (task fc53ba0b) of `om-auto-fix-issue` on #440, queued by the `cezar` label. Follow-up findings of the review of PR #438 (E14-S05, #380).
- **Issue / branch:** #440, `feat/issue-440-club-events-options-error`.
- **Spec:** none changed — the findings fix the shipped phone pages of the club events spec without changing its contract.

## Steps

1. Claimed #440 (assignee, `in-progress`, `🤖` claim comment naming this worktree and branch).
2. **Options error state:** `useClubEventOptions` now returns `{ status: 'ok', options } | { status: 'denied' }` (403) and throws on any other status, like `useClubEvent`; `clubEventOptionsOf` gives the options or null. The phone event form and part form show "denied" only for a real 403, and the retry `ErrorMessage` for a failed read (the part form used to say "denied" for any failed options read once the event had loaded). The panel form gate and the record's Parts tab read the options through the helper.
3. **Past list order:** the route cannot sort by the dates (they are derived from the parts, no column), so the phone list reads every page of each view (200 a page, at most 10 pages), sorts by date on the client (upcoming soonest first, past latest first) and shows 20 cards a view with **Show more ({shown} of {total})**. No API contract change.
4. **Lighter imports:** `CLUB_EVENT_ADD_PLACE_SPOT_ID` and `VisitingTeamsField` (with its external-teams query) moved to `components/club-event-fields.tsx`, which imports no CrudForm; the panel files and the phone pages import them from there.
5. **Nits:** one `MAX_CONFIRM_BY_HOURS = 336` in `lib/activities-rules.ts` (replaces `PART_CONFIRM_BY_MAX_HOURS`, `EVENT_CONFIRM_BY_MAX_HOURS`, the components' own constant — re-exported from `client-helpers` — and the literal `max={336}` of the phone event page); the read-only fields of the part form and the locked place of the session edit are `<dl>/<dt>/<dd>` instead of `aria-labelledby` on a `<p>`. The map-link address nit is deferred: the club event read does not carry the place address yet, and adding it is a response change outside this follow-up.
6. TEST-T12 gains a step: the options request answers 500 (`page.route`), the form shows the options error with Try again and no "denied"; Try again loads the form.

## Decisions

- Client-side paging instead of a server date sort: a date sort needs a join over the parts the CRUD factory cannot express, and a club holds a handful of club events a season, so reading all rows is cheap.

## Files changed

- `packages/app/src/modules/activities/components/club-events-client.ts`, `club-event-fields.tsx` (new), `ClubEventForm.tsx`, `ClubEventPartDialog.tsx`, `ClubEventRecord.tsx`, `client-helpers.ts`
- `packages/app/src/modules/activities/components/club/ClubEventFormPage.tsx`, `ClubEventPartFormPage.tsx`, `ClubEventsListPage.tsx`, `ClubEventPage.tsx`, `ClubSessionEditPage.tsx`
- `packages/app/src/modules/activities/lib/activities-rules.ts`, `member-event.ts`, `member-club-event.ts`
- `packages/app/src/modules/activities/i18n/en.json`, `pl.json` (`activities.clubEvents.club.list.showMore`)
- `packages/app/.ai/qa/tests/activities/TEST-T12-club-events-phone.spec.ts`

## Commands and results

- `yarn verify` — first run failed at `lint` (2 errors: unused `prefix` prop of `ReadOnly` in `ClubEventPartFormPage.tsx` after the `<dl>` change; a void arrow shorthand in the **Show more** handler). Fixed, `yarn verify --from lint`: all 14 steps passed (generate, typecheck, typecheck:packages and typecheck:qa passed in the first run).
- `sg docker -c "yarn test:integration:vereino --filter TEST-T12"` — 1 passed (36.5s), including the new options-500 step.
- `sg docker -c "yarn test:integration:vereino --filter TEST-T11"` — 1 passed (30.6s; the panel form and part dialog import the moved pieces).

## Open problems / next steps

- The map link of the phone event page still searches by place name; add the address once the club event read carries it.
