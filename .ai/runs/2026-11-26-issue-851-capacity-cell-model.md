# Run: issue #851 — amend AC-M08/AC-M09 of the many-clubs spec to the cell model

- **Trigger:** cezar task, `om-auto-fix-issue 851` (unattended).
- **Spec:** `.ai/specs/2026-11-22-vereino-many-clubs-one-instance.md` (AC-M08, AC-M09). **Issue:** #851 (epic #626). **Branch:** `docs/issue-851-capacity-cell-model`.

## Steps

1. Read the issue and the owner's comment of 2026-11-26 (author association `OWNER`): accept the 124-club capacity report and the 4-cell plan, no paid 1,000-club run; amend AC-M08 and AC-M09 to the cell model, add a changelog line, tick both criteria.
2. Claimed the issue (assignee, `in-progress`, 🤖 claim comment naming this run's worktree and branch).
3. Amended the spec:
   - *Overview*: one sentence after the targets — beyond the measured size they hold per cell, 1,000 clubs are served by cells (DD-M12, `docs/ops/cells.md`), and the 1,000-club figures stay extrapolations.
   - AC-M08 and AC-M09 rewritten to the cell model and ticked, each with its evidence from `docs/ops/capacity.md` and PR #675 (TEST-M10).
4. Added the changelog file `.ai/specs/changelog/2026-11-22-vereino-many-clubs-one-instance/2026-11-26-issue-851-cell-model-criteria.md`.
5. Ran `yarn verify`.

## Decisions

- AC-M08 does not claim more than the report measured. It names what passed (member pages p95 < 0.5 s at 100 req/s, the 06:00 burst drained in ≈ 75 s). Where the API p95 missed 800 ms at 100 req/s, it points to the limit and sizing the report names; that is the phase 5 exit gate's "or the report names the limit and the fix".
- The spec status stays `In progress`: other criteria are still open (#740, #850, #852).
- Open PR #861 (spec close-out V, #842) edits the same AC lines, adding "gap: #851" notes. Whichever PR merges second resolves the conflict on its own branch. This PR's text replaces the gap note.

## Files changed

- `.ai/specs/2026-11-22-vereino-many-clubs-one-instance.md`
- `.ai/specs/changelog/2026-11-22-vereino-many-clubs-one-instance/2026-11-26-issue-851-cell-model-criteria.md`
- `.ai/runs/2026-11-26-issue-851-capacity-cell-model.md`

## Commands and results

- `NODE_OPTIONS=--max-old-space-size=12288 yarn verify`: `[verify] all 23 step(s) passed`. After a one-word fix (the PR number of #633), `format:check` and `spec-changelogs:check` passed again.
- No integration tests: documentation only, no test added or changed.

## Open problems / next steps

- None for #851 once merged. The PR closes #851.
