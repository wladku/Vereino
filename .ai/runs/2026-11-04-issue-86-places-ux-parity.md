# Issue #86: places filters, owner and hierarchy (phase 3 slice (a)); regulations and photos wait for the migration approval

- **Date:** 2026-11-04
- **Agent / tool:** Claude Code (Opus 5.5) under cezar (task b2915263), `om-auto-fix-issue` with the repo-local override applied; no subagents
- **Trigger:** `/om-auto-fix-issue 86` (E06-S04, epic #82); resumed after the user told the run to continue autonomously
- **Branch:** `feat/issue-86-places-ux-parity`, from `main` at e21adbc
- **Status:** slice (a) completed, PR open for review (`Refs #86`, not `Closes`). Slice (b) is blocked on the migration approval.

## Goal

The places list (B-06) gets filters for kind, parent and active state, an Owner column, and the hierarchy in the name cell with an External badge. The place form gets regulations (text and one PDF) and photos. This is phase 3 of `.ai/specs/implemented/2026-11-03-vereino-ux-parity-phases-1-3.md`.

## Steps

1. Read the issue: it is open and unassigned, carries the `feature` label and has no open PR that references it. Classified it as a feature, so it takes the feature route. FR triage: the list API already accepted the filters, but the page exposed none, and the list had no owner or hierarchy, so the feature is real and unbuilt.
2. Resolved the covering spec from the issue comment (spec PR #131, merged): `.ai/specs/implemented/2026-11-03-vereino-ux-parity-phases-1-3.md`, phase 3, which is `In progress` and has an implementation breakdown.
3. Ask First check: phase 3 needs a new `club_core` migration (`club_core_places.regulations_text` and the table `club_core_place_files`). The spec's status line records the owner's approval only for the two phase 2 migrations (DD-U05): "any other migration, module or dependency stays Ask First". No approval is recorded on #86, #82 or #131. Stopped without claiming and asked on #86 (issuecomment-6640300737). Committed the run log.
4. The user said to continue autonomously without questions. A general go-ahead is not a recorded migration approval, so the run took the spec's own independent slice (a), which needs no migration. Claimed #86 (assignee, `in-progress`, 🤖 comment issuecomment-6640361208).
5. Pure logic `club_core/lib/place-hierarchy.ts`: the URL state (`parsePlaceListState`, `placeListQuery`, `hasPlaceFilters`) and `orderParentFirst`, which orders a page parent first, puts children by name under their parent, marks orphans and breaks corrupt loops. Unit tests at 100 %.
6. Server: an `afterList` hook on `/api/club_core/places` adds `ownerName` (through `findInstitutions`) and `parentName`. The OpenAPI item schema is extended (additive, optional fields).
7. UI: `PlacesTable` keeps the kind, parent and active filters in the URL (the `GroupsTable` pattern of #90). The name cell shows `↳` with an indent per depth, the parent's name for a child whose parent is not on the page, and the External badge. The page adds the Owner column, the empty and filtered-empty states, and retry. `PlaceForm`: the `isExternal` checkbox is relabelled, with a help text.
8. en and pl strings; module README; spec status and Changelog.
9. Integration test `club_core/E06-S04-places-filters-hierarchy.spec.ts` covers the API filters and names, the 400 on an unknown kind, and in the UI the hierarchy, the badge, the overlay kind filter in the URL with a reload, the filtered-empty and empty states, axe in light and dark mode, and 375 px.

10. Opened PR #163 (`Refs #86`; labels `review`, `feature`, `needs-qa`, `priority-medium`, `risk-medium`, with a rationale comment), and released the issue lock with a hand-off comment on #86 (issuecomment-6642228215). The full `om-auto-review-pr` and `om-auto-qa-pr` loop was not run in this session. The PR is left in the `review` state for the review sweep; the integration test captured the axe scans and the 375 px check.

## Decisions

- **Slice (a) only, `Refs #86`:** the regulations and photos need an unapproved migration. The PR does not close the issue; slice (b) stays on #86.
- **External = outside the club.** The UX parity spec, the issue and the mockup (`place.external` on "Boisko Wisły Liszki") all read `is_external` this way. The form had labelled it "Outdoor place", and the club spec's J-001 narrative calls the outdoor pool `is_external`. No behaviour reads the flag, so the form label now matches the spec, and the PR asks the owner to confirm.
- **`parentName` from the server** instead of the second client request the table used to make; additive.
- **Parent filter options** are the places with sub-places, taken from `/api/club_core/options/places`, which already exists.
- **The Parent column was dropped**, because the hierarchy now sits in the name cell (spec wireframe: Place, Kind, Owner, Capacity, plus Status).

## Files changed

- `packages/app/src/modules/club_core/lib/place-hierarchy.ts`, `lib/__tests__/place-hierarchy.test.ts` (new)
- `packages/app/src/modules/club_core/api/places/route.ts`, `api/shared.ts`
- `packages/app/src/modules/club_core/components/PlacesTable.tsx`, `PlaceForm.tsx`, `places-shared.ts`
- `packages/app/src/modules/club_core/i18n/en.json`, `i18n/pl.json`, `README.md`
- `packages/app/.ai/qa/tests/club_core/E06-S04-places-filters-hierarchy.spec.ts` (new)
- `.ai/specs/implemented/2026-11-03-vereino-ux-parity-phases-1-3.md` (status and Changelog)
- this log

## Commands and results

- `npx jest src/modules/club_core/lib/__tests__/place-hierarchy.test.ts --coverage`: 11 passed. The first runs reached 95.12 % and then 97.56 % branches (the name and id tie-break comparator branches); after two more cases, `place-hierarchy.ts` is at 100 % lines, branches and functions.
- `yarn verify`, first run: failed at `lint` with 3 errors. They were `'@mikro-orm/postgresql' import is restricted … (foundation spec REQ-F16)` in `api/places/route.ts`, and `Invalid type "number" of template literal expression` in `PlacesTable.tsx` and in the unit test. Fixed: the name reads moved to `services/directory.ts` (`placeListNames`), and the numbers are wrapped in `String(...)`.
- `yarn verify --from lint`: failed at `format:check` (two new test files). Fixed by running `yarn format`.
- `yarn verify`: failed at `ds:check` (`PlacesTable.tsx:71:13 [inline-style] Use shared components and design tokens instead of inline style props.`). Fixed: the indent per depth now uses static Tailwind classes (`ps-5` … `ps-20`).
- `yarn verify`: failed at `lessons:check` (`.ai/lessons.md` rows out of order). The cause was already on `main` and was fixed there by #156. Committed the slice, merged `origin/main`, and the next run passed.
- `yarn verify` (after the merge): all 13 steps passed.
- `yarn test:integration:vereino --filter E06-S04`, run 1: failed with `TimeoutError: locator.click … getByRole('dialog').getByRole('combobox')`, because the filter overlay is an inline panel, not a dialog. Run 2 hit `SyntaxError … Unexpected token (134:0)`, because a scripted edit had truncated the file; the tail was restored from the commit. Run 3 failed on the expected row order: an orphan branch sorts by its own name, so "Boisko piłkarskie" comes before "Boisko Wisły Liszki". The expectation was corrected. Run 4: **1 passed (2.1 min)**.
- `yarn test:integration:vereino --filter ENG-TEST-25` (the existing `club_core` accessibility test over the changed places pages): **1 passed (2.0 min)**.

## Open problems

- Slice (b), regulations and photos: waits for the owner's approval of the phase 3 migration on #86.
- The meaning of `is_external` needs the owner's confirmation (see Decisions).

## Next steps

- After the approval on #86, re-run `om-auto-fix-issue 86` for slice (b): the migration, the `places/[id]/files` routes and the form group.
