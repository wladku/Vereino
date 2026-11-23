# Run: AC-N16 follow-up — treasurer no longer held back, Club events in the menu (#604)

- **Goal and trigger:** Cezar run of `om-auto-fix-issue` on #604 (label `cezar`). The close-out III (#568) found that `docs/ux-concept/README.md` §1, §3.1, §3.2, the navigation spec's *Menu structure*, D-030 and D-031 still said the treasurer role is held back, and that the README and *Menu structure* lacked the Club events item.
- **Issue / branch:** #604, `docs/issue-604-update-ux-concept-decisions`. Spec: `.ai/specs/2026-11-14-vereino-parity-navigation-and-naming.md` (AC-N16).

## Steps

1. Claimed #604 (assignee, `in-progress`, `🤖` claim comment naming this worktree).
2. Read the owner's two comments on #245 (2026-11-19: hold lifted; Ask First approved, "exactly as DD-33") and PR #432 (the role as built: Finance and dashboard only, landing on `/backend`, "Admin panel" in More).
3. Read the code for the facts written down: Club events is `/backend/activities/club-events`, `activities.view`, `pageOrder` 25 (third in Classes); `memberLanding` sends a `treasurer` grant without a member side to `/backend`; `STAFF_CONTEXTS` in `@vereino/ui` member nav includes `treasurer`.
4. Wrote D-037, which supersedes the treasurer hold of D-030 point 2 and cites both #245 comments; added notes to D-030 (status and a "Superseded in part" paragraph) and D-031 ("Already decided elsewhere"), and the D30 row status in the product brief.
5. Updated the README (§1 treasurer row, the §3 diagram, §3.1 Classes table, Admin panel entry, landing table, phone-first paragraph, §3.2 route index rows B-T1…B-T3) and *Menu structure* (Classes item 3, the club events spec sentence, Admin panel, landing, `/club/cash` entry point, a Treasurer row in the role table, the treasurer non-goal).
6. Added the spec changelog file `2026-11-23-issue-604-treasurer-and-club-events.md`.

## Decisions

- New record number D-037: D-036 is taken by the open PR #657.
- No D37 row is appended to the product brief's decision log: PR #657 appends D36 at the same place and the two would conflict; only the D30 row's status column points to D-037. A D37 row can follow once #657 lands.
- The "Cash to settle" count cells (`#118`) are left as written: not part of this issue.

## Files changed

- `.ai/specs/research/decisions/D-037-treasurer-role-released.md` (new), `D-030-unblock-held-back-work.md`, `D-031-mockup-is-the-model-and-eight-parity-decisions.md`
- `.ai/specs/product-brief.md` (D30 row status)
- `.ai/specs/2026-11-14-vereino-parity-navigation-and-naming.md`
- `.ai/specs/changelog/2026-11-14-vereino-parity-navigation-and-naming/2026-11-23-issue-604-treasurer-and-club-events.md` (new)
- `docs/ux-concept/README.md`
- this log

## Commands and results

- `yarn verify`: all 21 steps passed (exit 0).
- `yarn guard`: "No blocking findings".
- No integration test: documentation only, no test added or edited.

## Open problems / next steps

- A D37 row in the product brief's decision log after #657 merges.
