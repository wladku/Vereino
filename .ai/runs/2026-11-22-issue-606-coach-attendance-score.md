# Run log — issue #606: the coach saves attendance and records a score on his club event part (AC-T04)

- **Trigger:** Cezar run 7af12ab4 (`om-auto-fix-issue`), issue labelled `cezar`.
- **Issue:** #606 (epic #565). **Spec:** `.ai/specs/2026-11-18-vereino-club-events-with-parts.md`, AC-T04 (coach half).
- **Branch:** `test/issue-606-coach-attendance-score`.
- **Route:** `direct` (test only, no product code), `testing`.

## Steps

1. Claimed the issue (assignee, `in-progress`, `🤖` claim comment naming this worktree and branch).
2. Read TEST-T03 (calendar reads, `mayEdit`/`mayCancel`), TEST-T04 (part session guards; it reports an absence but saves no attendance), TEST-A21 (score route) and TEST-009 (attendance check-off) for the fixtures.
3. Added `packages/app/.ai/qa/tests/activities/ISSUE-606-coach-part-attendance-score.spec.ts`: `familyFor` + the external hall; the academy coordinator adds a `match` part of the Żaki with coach Marek and one visiting team; before the start the coach's entry has `mayEdit`/`mayCancel`/`mayScore` false; `startNow` starts the session; the coach saves present/late/absent marks (200, `actingRole: coach`), a fresh list read returns them marked by the coach; the coach records 2:1 with a note (200); the coach's session read and the session record return the score; `mayEdit`/`mayCancel` stay false.
4. Spec changelog entry `.ai/specs/changelog/2026-11-18-vereino-club-events-with-parts/2026-11-22-issue-606-coach-attendance-score.md`.

## Decisions

- **A match part, not the poster's default `tournament`:** the score applies only to `match`/`sparring` (`activities/lib/score.ts`), so `partFamily` (tournament part) could not take a score; the test builds its own part instead of changing the shared fixture.
- **New `ISSUE-606` file rather than editing TEST-T03/TEST-T04:** keeps the existing tests untouched; the spec's status line and the AC-T04 tick stay with the close-out (#568, PR #608), which edits those lines.
- **API, not browser:** TEST-T13 already shows the coach's session page without Edit/Cancel; the gap was persistence of attendance and score.

## Commands and results

- `yarn test:integration:vereino --filter ISSUE-606` → `1 passed (40.1s)`.
- `yarn verify` → "[verify] all 20 step(s) passed".
- `yarn guard` → "No blocking findings."

## Open problems / next steps

- AC-T04 can be ticked by the close-out with this test and TEST-T03/TEST-T13 as evidence.
