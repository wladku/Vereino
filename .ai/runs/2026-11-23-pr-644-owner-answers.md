# Run: record the owner's answers on the many-clubs spec (PR #644, #627)

- **Goal and trigger:** cezar task 7039bf54 (`om-auto-fix-pr 644`). The owner answered the spec's Open Questions in a PR comment on 2026-11-23; record them, set the spec to `Ready for implementation`, verify, push, mark the PR ready. Design only.
- **Issue / epic / branch:** #627 (E22-S01), epic #626; PR #644, branch `docs/issue-627-many-clubs-one-instance` (worked on a detached HEAD at `origin/<branch>`, pushed with `git push origin HEAD:<branch>`).
- **Started / finished:** 2026-11-23.

## Steps

1. Merged `origin/main` into the PR head (no conflicts; merge commit signed off).
2. `.ai/specs/2026-11-22-vereino-many-clubs-one-instance.md`: status `Ready for implementation`; TLDR, Non-goals, DD-M01, DD-M02, DD-M07 (Q-M05 approved), DD-M09 (Q-M07), security section, phase dependencies, a phase 2 pre-condition (key store before a second club's real data), phase 4 deliverable, Ask First items, risks, verdict and the Open Questions table all carry the decisions of 2026-11-23.
3. `.ai/specs/2026-10-20-vereino-club-management.md`: DD-02 amended to one tenant per club.
4. Changelog files for both specs.
5. `yarn verify`, push, `gh pr ready 644`.

## Decisions

- Q-M07's pre-condition sits on phase 2 (where a second club is created) and in DD-M09, the security section and the risk table, so whoever onboards a real second club meets it.
- The owner's comment also asks to record Q-M07 in E22; the epic issue #626 body was not edited by this run (outward-facing tracker edit outside the requested steps) — noted in the PR comment for the owner.
- Phases stay Ask First for migrations and destructive steps, as the owner stated.

## Files changed

- `.ai/specs/2026-11-22-vereino-many-clubs-one-instance.md`
- `.ai/specs/2026-10-20-vereino-club-management.md`
- `.ai/specs/changelog/2026-11-22-vereino-many-clubs-one-instance/2026-11-23-issue-627-owner-answers.md`
- `.ai/specs/changelog/2026-10-20-vereino-club-management/2026-11-23-issue-627-dd-02-tenant-per-club.md`
- `.ai/runs/2026-11-23-pr-644-owner-answers.md`

## Commands and results

- `yarn verify`: all 21 steps passed (after the main merge and the spec edits).
- `yarn guard`: no blocking findings.

## Open problems / next steps

- E22-S03…S07 (#629–#633) implement phases 1–5 with `om-auto-implement-spec`, each with its own Ask First approvals.
