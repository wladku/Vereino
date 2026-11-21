# Run log — issue #452: finished specs show what was built (E17-S01)

- **Trigger:** Cezar run (label `cezar` on #452), skill `om-auto-fix-issue` with the repo-local override.
- **Issue:** #452 (epic #444). **Branch:** `docs/issue-452-finished-specs-show-evidence`. **Spec:** `.ai/specs/README.md` (status folders); each spec's Acceptance Criteria and phase state.
- **Goal:** for every spec whose epics are closed, tick each acceptance criterion that a merged PR and a test prove (PR and test id next to it), name the rest in a changelog entry, set the phase state and the `Status` line, move fully proven specs to `implemented/`, fix links. Documentation only.

## Steps

1. Claimed #452 (assignee, `in-progress`, `🤖` claim comment naming this worktree and branch).
2. Six subagents gathered evidence in parallel, each on disjoint spec files (club management; foundation + scheduling; messaging + club payments + facilities; parity navigation + parity facilities; parity payments; people life cycle + club events). Evidence: `gh pr list/view` on the merged PRs of each phase issue, the integration tests under `packages/app/.ai/qa/tests/**` (opened to check the assertion matches the criterion), unit tests, `yarn verify` steps.
3. Coordinator review of the subagents' borderline ticks, made stricter where a test proves only part of a criterion: AC-R14 (parity facilities: only the fallback link is proven although the "Needs a new time" view now exists), AC-L05 and AC-L06 (people: the cash blocker's link and "Former member" on the history screens untested), AC-F02 (foundation: proven through a ward edit, not the administrator's own child) — unticked, marked "partial evidence", named in the changelog entries.
4. AC-003 of the club spec said 409 for a place-hierarchy cycle; the spec's own TEST-001, the glossary and the code answer 422 `place_hierarchy_cycle`. Reworded to the built behaviour and recorded in the changelog entry.
5. Checked every cited test id resolves to a file under `packages/app/.ai/qa/tests/` (all do).
6. `git mv` of the facilities spec to `implemented/`; rewrote every reference (`.ai/specs/…` and bare file names, in specs, runs, backlog, brief, decisions) to `implemented/2026-10-27-vereino-facilities.md`. `git grep "2026-10-27-vereino-facilities\.md"` now finds only the new path.

## Result per spec

| Spec | Ticked | Status | Left |
|---|---|---|---|
| club management | 20/25 | In progress | AC-004, AC-039 (fixtures import not built), AC-040 (social sign-in Draft), two generic criteria |
| foundation primitives | 9/17 | In progress | phase A2 as specified, phase B shared pieces; AC-F02, F04, F08, F11, F13, F14, two generic |
| scheduling primitives | 4/10 | In progress | AC-G02, G03, G05, G07, G08, coverage criterion |
| messaging primitives | 13/14 | In progress | AC-M11 (spec-text amendments, no test or scripted audit) |
| club payments | 7/8 | In progress | AC-012 (no Stripe sandbox run; tests use the `vereino_test` gateway); step 1 sandbox run |
| facilities | 9/9 | **Implemented**, moved to `implemented/` | — |
| parity navigation and naming | 13/18 | In progress | rest of phase 1 (sidebar group order, AC-N01), AC-N11, AC-N16, two generic |
| parity facilities | 16/18 | In progress | AC-R05, AC-R14 |
| parity payments | 14/16 | In progress | AC-C10, AC-C12 (both locales not checked) |
| people life cycle | 11/18 | In progress | AC-L05, L06, L07, L15 (TEST-L22 quarantined), L16 (not built as written), two generic |
| club events with parts | 11/14 | In progress | AC-T01, T04, T11 |

Parity groups and activities was already in `implemented/` and is out of this issue's scope.

## Decisions

- A criterion is ticked only when a merged PR and a test prove all of it; partly proven criteria stay unticked with "partial evidence" so the next story can close the gap.
- Phase state recorded as a `State: Done (#PR)` line or in the existing phase-readiness table, since most specs have no Implementation Status table.
- Historical run logs were also rewritten to the new path so the "no stale name" check holds repository-wide.

## Open problems / next steps (for the owner)

- No issue tracks the rest of navigation phase 1 (the sidebar group order, AC-N01).
- Missing tests named above (e.g. AC-R05 renter e-mail on expiry, TEST-L22 quarantine #433, both-locale checks for AC-C10/AC-C12, J-004…J-010 journey tests).
- AC-G07, AC-G08 and AC-M11 are design or documentation criteria that no test can prove; the owner may decide them by policy.

## Validation

See the PR body for the `yarn verify` result.
