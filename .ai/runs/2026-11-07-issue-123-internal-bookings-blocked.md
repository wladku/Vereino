# Run: issue #123 (E08-S03) — internal bookings, stopped on a dependency

- **Goal and trigger:** cezar task, `om-auto-fix-issue 123` — staff internal bookings and the `/club/places` facility calendar (facilities spec phase 5 step 4, TEST-033).
- **Spec / issue / branch:** `.ai/specs/2026-10-27-vereino-facilities.md` (Ready for implementation, phase 5 in progress); #123 (epic #119, depends on #122); `feat/issue-123-internal-bookings`.

## Steps

1. Read #123: feature, depends on E08-S02 (#122).
2. Checked the dependency: #122 open; its PR #210 open, not merged, `CONFLICTING` with `merge-train-conflict`.
3. Read the spec's phase 5 steps: step 4 (this issue) builds on step 3 (#122) — the shared occupancy lock `lockOccupancy` (DD-43), the occupancy provider and rentals, which internal bookings must collide with.
4. Stopped before claiming. Posted the blocker comment on #123 (issuecomment-6709765818).

## Decisions

- Not built on `main`: it would duplicate DD-43's lock and the occupancy service of #210 and conflict with it. The issue's own pickup note says "once phase 5 is ready".
- No claim taken, so none to release; no push, no PR.

## Files changed

- this run log only.

## Commands and results

- `gh issue view 122` → `OPEN`; `gh pr view 210` → `OPEN`, `mergeable: CONFLICTING`.
- No code changed, so no `yarn verify`.

## Open problems / next steps

- Merge #210 (E08-S02), then re-run `om-auto-fix-issue 123`.
