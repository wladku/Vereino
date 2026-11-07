# Run: skip Next.js reserved ports in the ephemeral test runner (#189)

- **Goal and trigger:** cezar task ba4ac66b (unattended `om-auto-fix-issue 189`). `vereino-ephemeral.mjs` could choose 5060 or 5061 from its 5001–5999 range. Next.js refuses both ports, so the integration run failed before running any test.
- **Issue / branch:** #189, `fix/issue-189-skip-reserved-ports`. Route: `debugging` + `direct`, a minor tooling fix that needs no spec.

## Steps

1. Claimed #189: assignee, the `in-progress` label and a `🤖` comment.
2. Checked the reserved list in `packages/app/node_modules/next/dist/lib/helpers/get-reserved-port.js`. The only reserved ports inside 5001–5999 are 5060 and 5061.
3. Added `RESERVED_PORTS = new Set([5060, 5061])` to `packages/app/scripts/vereino-ephemeral.mjs`. `findFreePort` now skips those ports without probing them.
4. Added two unit tests. In the first, a random start on 5060 returns 5062 and probes only 5062. In the second, every other port is busy, the run rejects, and no reserved port is probed.
5. Updated lesson `parallel-integration-runs-need-own-worktree` with the skipped ports.

## Decisions

- I hard-coded the two ports and did not import Next's `isPortIsReserved`. The helper is in `next/dist` internals, which are not a public contract, and the script stays free of dependencies. The comment beside the constant names the source file, so the list can be checked after a Next upgrade.

## Files changed

- `packages/app/scripts/vereino-ephemeral.mjs`
- `packages/app/scripts/__tests__/vereino-ephemeral.test.mjs`
- `.ai/lessons/parallel-integration-runs-need-own-worktree.md`
- `.ai/runs/2026-11-06-issue-189-skip-reserved-ports.md`

## Commands and results

- `yarn test:scripts`: 123 tests pass, 0 fail; `vereino-ephemeral.mjs` has 100 % line, branch and function coverage.
- `yarn verify`: the first run passed generate, typecheck, typecheck:packages, typecheck:qa and lint, then failed at `format:check` (`packages/app/scripts/__tests__/vereino-ephemeral.test.mjs is not formatted (run yarn format)`). After `prettier --write`, `yarn verify --from format:check` passed all 9 remaining steps, build included.
- No integration test was run. The change touches only the port choice, which the unit tests cover. CI's integration jobs exercise the runner itself.

## Open problems / next steps

- None.
