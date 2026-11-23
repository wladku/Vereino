# Run: amend ENG-AC-09 and ENG-TEST-09 to the no-PITR decision (#580)

- **Goal and trigger:** cezar task 34d0da83, `om-auto-fix-issue 580` (issue labelled `cezar`). ENG-AC-09 and ENG-TEST-09 of the engineering standards spec still required a PITR restore, which the owner dropped in ENG-Q-03 (2026-11-20, epic #460).
- **Spec / issue / branch:** `.ai/specs/2026-10-21-engineering-standards-and-patterns.md` / #580 / `docs/issue-580-amend-eng-ac-09-no-pitr`.
- **Started / finished:** 2026-11-22.

## Steps

1. Claimed #580 (assignee, `in-progress`, claim comment naming this worktree and branch).
2. Rewrote ENG-TEST-09: restore the latest nightly off-site dump into a sibling service (no PITR, ENG-Q-03), run the verification script; expected RTO ≤ 60 min and RPO ≤ 24 h recorded. The id is kept so the traceability rows (ENG-10) stay valid.
3. Rewrote ENG-AC-09: an off-site dump restore into a sibling service with RTO ≤ 60 min and RPO ≤ 24 h recorded, naming ENG-Q-03 and `backup-drill.yml`; the gap link now points only at #460 (real nightly dump, staging, monitoring). The criterion stays unticked.
4. Added the changelog file `.ai/specs/changelog/2026-10-21-engineering-standards-and-patterns/2026-11-22-issue-580-no-pitr.md`.

## Decisions

- Scope kept to the two rows the issue names. Other PITR mentions (S15.7, S15.10, EJ-07 step 1, ADR-012, the E4 deliverable "PITR enabled", the risk row) are already superseded by the ENG-Q-03 answer, which says so explicitly; rewriting them is left to #460's E4 work so this PR does not collide with it.
- ENG-TEST-09 was redefined rather than deleted: ENG-TEST-10 (local dump restore) does not measure RTO, and ENG-AC-09 still needs a recorded RTO.

## Results

- `yarn verify`: `[verify] all 20 step(s) passed` (including `spec-changelogs:check`).
- `yarn guard`: `No blocking findings.`
- No integration test is added or changed (docs-only).

## Files changed by this run

The spec (two rows), the changelog file, this log.

## Open problems / next steps

None from this run; the rest of ENG-AC-09 stays with #460.
