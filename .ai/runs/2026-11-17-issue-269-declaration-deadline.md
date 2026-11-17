# Run: issue #269 — declaration deadline (E10-S04)

- **Trigger:** cezar run 1bdb9b0b (`om-auto-fix-issue 269`, label `cezar` added 2026-11-17).
- **Issue:** [#269](https://github.com/wladku/Vereino/issues/269) — feature, priority-high, risk-high.
- **Spec:** `.ai/specs/2026-11-14-vereino-parity-groups-and-activities.md`, phase 4 (REQ-A07, REQ-A04 complete; TEST-A09, TEST-A10, TEST-A22 deadline part). Status `Ready for implementation`; migration A and the behaviour changes approved by the owner on #252 (2026-11-16).
- **Branch:** `feat/issue-269-guardian-declaration-deadline`.

## Steps

1. Triage: the spec is Ready, migration A is approved (spec _Compatibility_, #252 comment 6910004411), the dependency E10-S03 (#268) is merged (`62abbf61`), no open PR references #269. Feature route; claimed the issue (assignee, `in-progress`, claim comment).
2. Data and commands: `lib/confirm-by.ts` (offset, limits, passed, edit rule, member refusal, reminder day, list order) with unit tests; migration A via offline `yarn db:generate` (snapshot diff = the two columns only), `down` rewritten with `if exists` like the DD-43 migration; validators; activity, event, session update commands and their undo snapshots; series planning and the generator job copy the default; the declare command and the personal link share the 409 in `writeDeclaration`; reads gain `confirmBy`, `deadlinePassed`, `unansweredCount`; the evening reminder targets the day before the deadline's day.

## Decisions

- The in-past check (`occurrence_confirm_by_in_past`) applies to a submitted instant (session edit), to a one-off event's own deadline, and to a move that keeps an offset with effect (a `confirm` kind). A series default is an offset and is not checked: near sessions of a new series may start with a passed deadline, where staff still record declarations.
- Member reads (calendar, session, attendance list) show `confirmBy` only for a `confirm` kind; the staff panel reads (`/occurrences`, `/occurrences/{id}`) return the stored instant whatever the kind, because the panel forms edit the stored value.
- `declarationsOpen` keeps its meaning (the start and the status); the deadline closes `persons[].canDeclare` only, so a guardian can still decide a pending declaration made before the deadline until the start (spec glossary _Deadline passed_).
- The attendance list puts "no answer" first once the deadline instant is reached, the start included (the coach checks off after the start).

## Files changed

See the PR diff.

## Commands and results

- `npx jest src/modules/activities/lib/__tests__/confirm-by.test.ts --coverage` — 100 % lines, branches, functions.
- `yarn db:generate` (offline, snapshot-based) — `activities: generated Migration20261117091218_activities.ts`, every other module "no changes".
- `yarn typecheck` — exit 0.

## Open problems

## Next steps
