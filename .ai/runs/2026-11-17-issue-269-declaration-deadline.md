# Run: issue #269 — declaration deadline (E10-S04)

- **Trigger:** cezar run 1bdb9b0b (`om-auto-fix-issue 269`, label `cezar` added 2026-11-17).
- **Issue:** [#269](https://github.com/wladku/Vereino/issues/269) — feature, priority-high, risk-high.
- **Spec:** `.ai/specs/2026-11-14-vereino-parity-groups-and-activities.md`, phase 4 (REQ-A07, REQ-A04 complete; TEST-A09, TEST-A10, TEST-A22 deadline part). Status `Ready for implementation`; migration A and the behaviour changes approved by the owner on #252 (2026-11-16).
- **Branch:** `feat/issue-269-guardian-declaration-deadline`.

## Steps

1. Triage: the spec is Ready, migration A is approved (spec _Compatibility_, #252 comment 6910004411), the dependency E10-S03 (#268) is merged (`62abbf61`), no open PR references #269. Feature route; claimed the issue (assignee, `in-progress`, claim comment).
2. Data and commands: `lib/confirm-by.ts` (offset, limits, passed, edit rule, member refusal, reminder day, list order) with unit tests; migration A via offline `yarn db:generate` (snapshot diff = the two columns only), `down` rewritten with `if exists` like the DD-43 migration; validators; activity, event, session update commands and their undo snapshots; series planning and the generator job copy the default; the declare command and the personal link share the 409 in `writeDeclaration`; reads gain `confirmBy`, `deadlinePassed`, `unansweredCount`; the evening reminder targets the day before the deadline's day.
3. UI: the wizard (hours, shown for a `confirm` type), the panel and phone event forms, the move dialog (date and time, untouched = kept offset), the B-15 record row; `CalendarItem.notes` in `@vereino/core` rendered by `@vereino/ui` `CalendarList` (M-03), the Today card lines (M-02), the session page row and hint (M-04), the attendance list line (M-05). `GET /api/activities/events/options` gains `declarationKinds` (every form user holds `activities.events.create`). The deadline-day reminder e-mail names the deadline (optional template param `confirmBy`) instead of "Tomorrow:".
4. Tests: TEST-A09 (API, reminder job) and TEST-A10 (browser, 375 px, en/pl, light/dark, axe). The first TEST-A09 run failed on `details.confirmBy`: the error factory spreads details into the body — fixed to `body.confirmBy`, lesson `error-details-spread-into-the-body`.

## Decisions

- The in-past check (`occurrence_confirm_by_in_past`) applies to a submitted instant (session edit), to a one-off event's own deadline, and to a move that keeps an offset with effect (a `confirm` kind). A series default is an offset and is not checked: near sessions of a new series may start with a passed deadline, where staff still record declarations.
- Member reads (calendar, session, attendance list) show `confirmBy` only for a `confirm` kind; the staff panel reads (`/occurrences`, `/occurrences/{id}`) return the stored instant whatever the kind, because the panel forms edit the stored value.
- `declarationsOpen` keeps its meaning (the start and the status); the deadline closes `persons[].canDeclare` only, so a guardian can still decide a pending declaration made before the deadline until the start (spec glossary _Deadline passed_).
- The forms take the series/event default in whole hours (1–336), not minutes; the API stays in minutes.
- `declarationKinds` rides on the events options read instead of a new route: coordinators, administrators and coaches all hold `activities.events.create`.
- The attendance list puts "no answer" first once the deadline instant is reached, the start included (the coach checks off after the start).

## Files changed

See the PR diff.

## Commands and results

- `npx jest src/modules/activities/lib/__tests__/confirm-by.test.ts --coverage` — 100 % lines, branches, functions.
- `yarn db:generate` (offline, snapshot-based) — `activities: generated Migration20261117091218_activities.ts`, every other module "no changes".
- `yarn typecheck`, `yarn typecheck:qa` — exit 0.
- `yarn test` — 92 suites, 1282 tests passed; `confirm-by.ts`, `member-event.ts`, `calendar-list.tsx` at 100 %.
- `yarn test:integration:vereino --filter TEST-A09` — first run: 1 failed (`Expected: "2026-11-17T09:48:00.000Z" Received: undefined` at `details.confirmBy`); after the fix: 1 passed (2.8m).
- `yarn test:integration:vereino --filter TEST-A10` — 1 passed (2.8m).

## Open problems

- Migration A is committed but not applied anywhere; the owner applies it after reading the SQL in the PR.
- No separate screenshots attached; TEST-A10 drives the phone pages in both locales and schemes.

## Next steps

- Review and merge through the merge train; phase 6 (moved-session notice) and phase 5 (typed venue) follow per Q-A27.
