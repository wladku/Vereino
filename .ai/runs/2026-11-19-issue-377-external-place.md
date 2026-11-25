# Run: issue #377 — a coordinator adds a missing external place (E14-S02)

- **Trigger:** Cezar queued `om-auto-fix-issue 377` after the `cezar` label (2026-11-19T19:00Z), task 8be7bd55.
- **Issue:** #377 (epic #375), feature route; dependency E13-S03 (#305) closed; readiness cleared by the owner on 2026-11-19 (Q-T20 approved, PR #418 merged).
- **Spec:** `.ai/specs/implemented/2026-11-18-vereino-club-events-with-parts.md`, phase 2 (REQ-T06; TEST-T07, TEST-T15 club_core part, TEST-T16 external-place route; DD-T08; Q-T10).
- **Branch:** `feat/issue-377-coordinator-adds-external-place` (Cezar worktree).

## Goal

A section coordinator adds a venue missing from the club's places from the event form as an external place that stays on the list; one narrow feature, never `club_core.manage`.

## Steps

1. Claimed the issue (assignee, `in-progress`, `🤖` claim comment naming the run, worktree and branch).
2. Read the spec phase 2, the `club_core` place command/route/validators, the options routes and the `groups.sectionUsage` DI precedent.
3. Slice (a): feature `club_core.places.add_external` (`acl.ts`), coordinator grant in `packages/core/src/roles.ts` (+ catalogue test), error codes `external_place_exists` (409) and `place_in_use` (409), pure duplicate key and draft length rule in `club_core/lib/places.ts` (+ tests), `placeAddExternalSchema`, command `club_core.places.add_external` (`commands/external-places.ts`), route `POST /api/club_core/places/external`, optional `activities.placeUsage` DI contract (declared in `club_core/services/place-usage.ts`, registered by `activities`).
4. Slice (b): `useAddExternalPlace` + `AddExternalPlaceFields` shared by `AddExternalPlaceDialog` (panel) and `AddExternalPlaceSheet` (member); en/pl strings.
5. `yarn generate`, `yarn typecheck`, unit tests, TEST-T07 locally, `yarn verify`.

## Decisions

- **Coordinator acts club-wide** (`clubWideKinds: ['coordinator']`), as `/api/club_core/options/places` and the institution options do: a place has no section.
- **Duplicate check** under the place hierarchy's advisory lock (`lockPlaceHierarchy`), so two concurrent adds of the same hall cannot both pass; candidates narrowed by `ILIKE %name%` in SQL, the exact rule (trimmed, case-insensitive name + address) is the pure `duplicateExternalPlaceId`. Any live place counts, external or not (spec: "a live place").
- **Error answers follow the platform, not the spec's draft row:** lengths answer 400 (the platform's validation response every Vereino route gives) and an unknown owner 422 `place_reference_invalid` at the field (as the B-06 place form) instead of 404, so the dialog shows it next to the owner select. The spec rows were updated and a changelog entry added.
- **Undo guard via a new optional DI contract `activities.placeUsage`** (live activity with the default place, or live session there), the `groups.sectionUsage` pattern, so `club_core` never reads `activities` tables. Club events (phase 1) are not on `main` yet; they add their place to this contract when they land. The undo is re-authorized for the same kinds as the command (coordinator club-wide or administrator).
- **Response** is the picker option the host selects (`id`, `name`, `label`, `kind`, `address`, `ownerInstitutionId`, `parentId: null`, `isExternal: true`, `isPublicSchedule: false`).
- **No host form yet** (E14-S03/E14-S05 open the dialog and the sheet). The live region (`aria-live="polite"`) is rendered next to the dialog/sheet so the announcement survives the close.

## Files changed

See the PR diff: `packages/core/src/roles.ts` (+ test), `club_core/{acl.ts, lib/places.ts, lib/error-codes.ts, data/validators.ts, commands/external-places.ts, api/places/external/route.ts, services/place-usage.ts, components/{useAddExternalPlace.ts, AddExternalPlaceFields.tsx, AddExternalPlaceDialog.tsx, AddExternalPlaceSheet.tsx}, i18n/{en,pl}.json, README.md}`, `activities/{di.ts, services/place-usage.ts}`, `.ai/qa/tests/club_core/TEST-T07-external-place.spec.ts`, the spec rows and its changelog entry.

## Commands and results

- `yarn generate` — ok; `yarn typecheck` — ok.
- `yarn workspace @vereino/app jest club_core/lib/__tests__/{places,error-codes}.test.ts` — 19 passed.
- `yarn workspace @vereino/core test` — all passed, 100 % coverage.
- `yarn test:integration:vereino --filter TEST-T07` — `1 passed (34.5s)` (the `QueryIndexScopeError` log lines come from the platform's tenant cleanup).
- Browser check through a temporary harness page and spec (removed before the commit, never committed): coordinator Wojtek, the dialog at 1280 px and the sheet at 375 px, en and pl, light and dark — add → host selects `added:<id>` and the live region reads "Hala … added and selected" / "Dodano i wybrano: Hala …"; the same name and address upper-cased with spaces → the 409 problem line and "Pick this place" → host selects `picked:<id>`; empty submit → the field problem; Escape closes. Axe serious findings were all outside the new markup: the platform sidebar group headings behind the dialog (`PLATFORM_BASELINE` covers them; the harness did not pass `platformBaseline`) and the platform Select listbox caught in its close animation (`data-state="closed"`). Console errors: only the expected 409 resource loads. Screenshots in the Cezar task artifacts (`shots/`).
- First `yarn verify`: `FAIL lint` — 6 errors in the new components (`no-confusing-void-expression` ×5, react-hooks "Calling setState synchronously within an effect"); fixed (braces; state adjusted during render), then `FAIL format:check` fixed with `yarn format`; final full `yarn verify` — all 18 steps passed.
- Lesson added: `.ai/lessons/react-lint-no-set-state-in-effect-or-void-arrow.md`.

## Release note

Run `yarn mercato auth sync-role-acls` once after the deploy so existing coordinators get `club_core.places.add_external`.

## Open problems / next steps

- E14-S03 (panel event form) and E14-S05 (phone form) mount the dialog and the sheet and cover TEST-T11/TEST-T12 in the browser.
- Phase 1 adds the club event's place to `activities.placeUsage`.

## Review round (PR #425)

- Independent review task `f5815175` (read-only, `--kind review`): verdict **changes**.
  - **M1** (fixed): the 409 `external_place_exists` could name an inactive place or a complex with sub-places, which no picker lists, so "Pick this place" selected an unusable id. The 409 now carries `details.pickable` (pure `isPickablePlace`: active and no live sub-places). The dialog offers the pick only when the place is pickable; otherwise it says the place cannot be picked here and points to the administrator (`club_core.externalPlace.errors.existsUnavailable`).
  - **M2** (fixed): the undo soft-deleted without the hierarchy lock and the sub-places check. It now takes `lockPlaceHierarchy` and answers 409 `place_has_children`, like a delete.
  - **L1** (documented, not changed): `activities.placeUsage` does not check facility closures, rentals or zone rules. The administrator sets those on the club's own places; the gap is noted in the command header.
  - **L2** (fixed): TEST-T07 now also reads `/api/activities/events/options` and checks the inactive or complex duplicate (`pickable: false`) and the undo refused with a sub-place.
  - **N1/N2** (accepted): an administrator's B-06 root create is not serialized with the duplicate check (B-06 has no duplicate rule). Coordinators hold no `audit_logs.undo_self`, so in practice the undo is the administrator's.
- `yarn test:integration:vereino --filter TEST-T07` after the fixes: `1 passed (36.6s)`; full `yarn verify`: all 18 steps passed.
