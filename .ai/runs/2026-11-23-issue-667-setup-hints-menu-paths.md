# Run: fix #667 — setup hints still name the old menu paths

- **Trigger**: Cezar run a168f686 (`om-auto-fix-issue`), issue labelled `cezar` on 2026-11-23.
- **Issue**: #667 · **Branch**: `fix/issue-667-setup-hints-menu-paths` · **Spec**: none (bug fix, `direct`).

## Goal

The refusal on `/club/places/maintenance` (`facilities.places.maintenance.forbidden`) named "Obiekty → Konserwacja → Opiekunowie" / "Facilities → Maintenance → Maintainers", a path the navigation rework (#513, D-031) removed. Name the current path, keep it from going stale, and fix any other hint naming an old panel path.

## Steps

1. Claimed the issue (assignee, `in-progress`, `🤖` claim comment naming this worktree).
2. Searched every module's `i18n/*.json` for "Harmonogram", "Płatności ›", "Obiekty →/›", "Wiadomości ›", "Grupy ›", any `→`/`›` path, and "w panelu" / "in the panel" / "w menu" / "zakładce". Only `facilities.places.maintenance.forbidden` names a stale panel path; the other hits are column labels ("Harmonogram" = schedule field), `{from} → {to}` date changes, or hints that still match the current UI ("Settings › Auth", the first-administrator banner, "Publikacja strony klubu" in the Klub menu).
3. Replaced the literal path in both catalogs by a `{path}` placeholder; `MaintenanceList.tsx` fills it from the keys the menu renders: `pageGroupKey` and `pageTitleKey` imported from `backend/facilities/logs/page.meta.ts` (the sidebar entry of "Log and incidents"), then `facilities.records.tabs.maintenance` and `facilities.maintenance.tabs.maintainers`, joined with ` › `. Result: "Obiekt › Dziennik i incydenty › Konserwacja › Opiekunowie" / "Facility › Log and incidents › Maintenance › Maintainers".
4. TEST-489 (which asserts the refusal in both locales) now fills `{path}` from the same four keys.
5. Lesson `ui-hint-menu-path-from-menu-labels`.

## Decisions

- Build the path at render time instead of adding a check: a renamed label renames the hint with no extra tooling (AC 2 allows either).
- Import the page's `metadata` rather than repeating the two keys, so the group and item come from the same object the sidebar reads.

## Files changed

- `packages/app/src/modules/facilities/i18n/en.json`, `pl.json`
- `packages/app/src/modules/facilities/components/club-places/MaintenanceList.tsx`
- `packages/app/.ai/qa/tests/activities/TEST-489-staff-actions-and-refusals.spec.ts`
- `.ai/lessons/ui-hint-menu-path-from-menu-labels.md`

## Commands and results

- `yarn verify`: all 21 steps passed (unit tests 1779 passed, coverage 100 %).
- `yarn test:integration:vereino --filter TEST-489`: 1 passed (1.5m); the attendant sees the refusal with the new path in both locales.
- `yarn guard`: no blocking findings.

## Open problems / next steps

None.
