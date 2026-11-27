# Run: issue #874 — ESLint in packages/app runs out of memory in the CI gate

- **Goal and trigger:** Cezar task (om-auto-fix-issue, label `cezar`) for #874: `yarn lint` in `packages/app` ran out of memory at Node's default heap in the CI `gate` job and on the factory server.
- **Issue / branch:** #874, `docs/issue-874-lint-heap-verified` (Cezar run `dfe9dbd3`).

## Steps

1. Triage: the issue asks to raise the heap of `packages/app`'s `lint` script to 8 GB. `main` already does this. #838 (merged 2026-11-26T20:43Z, after the issue was filed at 20:34Z) changed it to `cross-env NODE_OPTIONS=--max-old-space-size=8192 eslint .`. No code change was needed.
2. Verified on the factory server at `ee5ddb2a` (main) with no `NODE_OPTIONS` override: `/usr/bin/time -v yarn lint` in `packages/app`.
3. Cause, as the issue optionally asks: `vereinoTypeScriptConfigs` in `eslint.vereino.mjs` applies `strictTypeChecked` with `parserOptions.projectService` to every Vereino module, so lint memory grows with the code base. No single change caused the OOM; main reached the 4 GB default limit. Recorded as lesson `app-lint-heap-grows-with-type-aware-modules`.

## Decisions

- No rule severity or lint scope changed (issue: a weakened check is a guard finding).
- The PR is docs-only (run log + lesson) and closes #874, since the fix itself landed through #838.

## Commands and results

- `yarn lint` (packages/app, heap 8192 MB from the script): exit 0, `✖ 166 problems (0 errors, 166 warnings)`, wall clock 1:41.63, maximum resident set size 5,945,708 kB (~5.95 GB). About 2 GB of headroom under the 8 GB heap.
- `yarn lessons:check`: valid.
- No integration tests: no route, command, subscriber or page changed.

## Open problems / next steps

- The issue's CI check (the `gate` job passing on #814 and #843 once they merge main) is left to the merge train. Main's CI run with #838 (45893157244) was still queued when this run ended.
- If lint memory keeps growing past ~7 GB peak, raise the heap again or split lint (#835).
