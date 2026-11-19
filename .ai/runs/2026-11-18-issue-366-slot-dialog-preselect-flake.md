# Run: issue #366 — the slot dialog preselects "General purpose" for a coach before their groups load

- **Trigger:** cezar `om-auto-fix-issue 366` (label `cezar` added).
- **Issue / PR / branch:** #366 / (opened by this run) / `fix/issue-366-slot-dialog-preselect-flake`
- **Date:** 2026-11-18

## Goal

The slot dialog preselects the first allowed kind (DD-R04) even when the kinds change after it mounts, unless the user already picked one, so TEST-R04 passes without retries.

## Steps

1. Claimed the issue (assignee, `in-progress`, `🤖` claim comment).
2. Root cause confirmed in `SlotDialog.tsx`: `React.useState<SlotKind>(kinds[0] ?? 'rental')` reads `kinds` only at mount; a coach's `kinds` gain `group` (first in DD-R04 order) only once their groups load, so a dialog opened earlier stayed on `general`.
3. Added the pure `selectedSlotKind(kinds, picked)` to `facilities/lib/slot.ts` (the pick while still offered, else the first offered kind, else `rental`) with unit tests.
4. `SlotDialog` now stores only the user's pick (`null` until they choose) and derives the shown kind every render.
5. Recorded lesson `dialog-preselection-follows-async-options`.

## Decisions

- Derive the kind instead of waiting for the groups before opening the dialog: it also covers a kind that disappears (the pick falls back to the first offered kind) and keeps the dialog responsive on slow connections.
- TEST-R04 unchanged: its `toContainText(group)` assertion retries and now converges once the groups load.

## Files changed

- `packages/app/src/modules/facilities/lib/slot.ts`
- `packages/app/src/modules/facilities/lib/__tests__/slot.test.ts`
- `packages/app/src/modules/facilities/components/slot/SlotDialog.tsx`
- `.ai/lessons/dialog-preselection-follows-async-options.md`
- `.ai/runs/2026-11-18-issue-366-slot-dialog-preselect-flake.md`

## Commands and results

- `npx jest src/modules/facilities/lib/__tests__/slot.test.ts` — 14 passed.
- `yarn verify` — first run failed at `format:check` (`slot.test.ts is not formatted`); fixed with `yarn format`, then a full `yarn verify` passed all steps.
- `yarn test:integration:vereino --filter TEST-R04` — not run: `Could not find a working container runtime strategy`; this user cannot reach `/var/run/docker.sock` (`permission denied`, not in the `docker` group) and the run must not change the Docker configuration. CI's integration shards run TEST-R04.

## Open problems / next steps

- TEST-R04 is verified only by CI for this run.
