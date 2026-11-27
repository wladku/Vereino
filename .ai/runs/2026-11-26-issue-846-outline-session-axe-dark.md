# Run: #846 — TEST-O05 axe scans in light and dark mode

- **Goal / trigger:** Cezar run (label `cezar`) of `om-auto-fix-issue` for #846 (AC-O06 of `.ai/specs/2026-11-23-vereino-training-outlines-and-medical-expiry.md`, found by close-out #842).
- **Branch:** `test/issue-846-outline-session-axe-dark`

## Steps

1. Claimed #846 (assignee, `in-progress`, 🤖 claim comment naming this run's worktree).
2. Extended `training/TEST-O05-outline-on-the-phone.spec.ts`: the language loop now opens the session page and the outline editor in each locale (en, pl), runs `scanInColorSchemes` (light and dark) on each and `expectNoPageOverflow` (320 px), then returns to the 375 px phone. The older hand-written `scrollWidth <= 375` check is replaced by `expectNoPageOverflow`, which is stricter.
3. Ticked AC-O06 in the spec; changelog file `changelog/2026-11-23-vereino-training-outlines-and-medical-expiry/2026-11-26-issue-846-ac-o06.md`.

## Decisions

- No `platformBaseline`: neither surface uses the baselined platform components, and the scan passed without it.
- The scans run after the outline is attached and carries an image, so both surfaces show their fullest state.

## Results

- `yarn test:integration:vereino --filter TEST-O05` → `1 passed (1.1m)`; no axe violations in light or dark, en or pl; no overflow at 320 px. No contrast fix was needed.
- `yarn verify` → the first run stopped at `lint` with `FATAL ERROR: Ineffective mark-compacts near heap limit Allocation failed - JavaScript heap out of memory` (an environment limit: `yarn lint` sets no `--max-old-space-size`, unlike `build` and `typecheck`); `NODE_OPTIONS=--max-old-space-size=12288 yarn verify --from lint` → all remaining steps passed (generate, typecheck, typecheck:packages and typecheck:qa had passed in the first run).
- `yarn guard` → no blocking findings.

## Open problems / next steps

- `yarn lint` may run out of the default Node heap on this server; giving it the same `--max-old-space-size` as `typecheck` would be a separate tooling change.
