# Run: #848 — social sign-in: the state-store-down 503 and the administrator's sign-in methods

- **Goal and trigger:** cezar task (om-auto-fix-issue) for issue #848 (AC-S04 of `.ai/specs/2026-10-27-vereino-social-sign-in.md`, found by the spec close-out #842): prove the 503 `identity_unavailable` path with the state store down, and cover the person record's "Sign-in methods" section in a browser test.
- **Spec / issue / branch:** social sign-in spec; #848 (epic #565); `test/issue-848-social-sign-in-503-admin`.

## Steps

1. Claimed #848 (assignee, `in-progress`, `🤖` claim comment naming this run's worktree and branch).
2. Chose how to take the store down. The shared test app's cache (sqlite) cannot be stopped from a test, and a broken sqlite or a missing `ioredis` is masked: the platform cache falls back to memory on `CacheDependencyUnavailableError`. The `jsonfile` strategy pointed at a path below a regular file fails every write with a plain `ENOTDIR` (not masked) and misses every read, so `storeStateMarker` reaches its 503 branch. `startClubDomainApp` (the second app process of TEST-M03/TEST-S05) gained an optional `env` argument to start such a process.
3. TEST-S06: on that process `start` for Google and Facebook answers 503 `identity_unavailable` with no redirect and no state cookie; a callback with a matching state and cookie ends on `/login?identity=invalid` without a session cookie; the user count is unchanged. TEST-S01's header now points to it.
4. TEST-S07: the administrator opens the person record's Account tab at 375 px: Google link with the shared e-mail and no "Connect", no horizontal scroll, button at least 44 px; list failing (aborted request) → error + "Try again" by keyboard → recovers; a stale version (response rewritten in the browser) → real 409 announced and the list reloaded; Escape cancels the confirmation, Ctrl+Enter confirms → unlink announced, empty state; the last method → "Unlink" disabled and described; axe clean in light and dark twice.
5. Spec: TEST-S06/S07 rows in *Integration Coverage* and the traceability table, AC-S04 and the two generic criteria ticked; changelog file `2026-11-26-issue-848-ac-s04-coverage.md`.

## Decisions

- No product code changed; no Ask First item (no migration, dependency or contract change). The fixture's new argument is optional, so its other callers are unchanged.
- The callback with the store down cannot be distinguished from a missing marker in this setup (reads miss rather than throw); the outcome asserted is the spec's one: no session, the generic sentence's `identity=invalid`.

## Commands and results

- `yarn test:integration:vereino --filter TEST-S06` — 1 passed (with the production build; the runner's exit 143 line is its own server shut down at teardown).
- `yarn test:integration:vereino --filter TEST-S07 --no-build` — first run failed: the confirmation is `role="alertdialog"`, not `dialog` (`getByRole('dialog')` not found); fixed; second run 1 passed.
- `yarn verify` — generate, typecheck, typecheck:packages, typecheck:qa passed; `lint` failed with `FATAL ERROR: Ineffective mark-compacts near heap limit Allocation failed - JavaScript heap out of memory` (machine heap, no finding); `NODE_OPTIONS=--max-old-space-size=8192 yarn verify --from lint` — all 19 steps passed.
- `yarn guard` — no blocking findings.

## Open problems / next steps

- None known; the PR goes to the merge train once CI is green.
