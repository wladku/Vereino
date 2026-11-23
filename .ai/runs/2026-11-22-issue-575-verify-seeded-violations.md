# Run: issue #575 — ENG-TEST-01, one seeded violation per `yarn verify` step

- **Goal / trigger:** Cezar task (`om-auto-fix-issue`, label `cezar`) for #575 (ENG-AC-01, epic #565). ENG-TEST-01 of `.ai/specs/2026-10-21-engineering-standards-and-patterns.md` had never been run: one seeded violation per gate step must stop `yarn verify` at the expected step, and a clean tree must exit 0.
- **Branch:** `test/issue-575-verify-seeded-violations`, base `main` at `8dcedd0e`.
- **Scope:** evidence only. No product or tooling change.

## Method

Every run used the full `yarn verify` (all 20 steps of `scripts/verify.mjs`, no `--from`) in this task's worktree, which only this run uses. Before each run a runner script outside the repository (`/tmp/v575/run-seeds.sh`) put one violation into the `club_core` module, ran `yarn verify`, read the `[verify] failed at <step>` line and removed the violation. Nothing seeded was committed. The seeds:

| Seed | Change | Expected step |
|---|---|---|
| hard-coded JSX text | new `club_core/components/SeedHardcodedText.tsx` rendering `<p>Welcome to the club</p>` | `i18n:check-hardcoded` (`--strict`, Vereino modules) |
| `any` | new `club_core/lib/seed-any.ts`: `export const seedAny: any = 1` | `lint` (`@typescript-eslint/no-explicit-any`, `eslint.vereino.mjs`) |
| unformatted file | new `club_core/lib/seed-unformatted.ts`: `export const seedUnformatted = {a:1}` | `format:check` |
| palette class | new `club_core/components/SeedPalette.tsx` with `className="text-red-500"` | `ds:check` (`hardcoded-palette`) |
| missing `pl` key | `club_core.seed.onlyEnglish` added to `club_core/i18n/en.json` only | `contracts:check` (en/pl key parity) |
| failing unit test | new `club_core/lib/__tests__/seed-failing.test.ts`: `expect(1).toBe(2)` | `test` |

Each seed is valid for every step before its own (typed, formatted, free of palette classes and hard-coded text), so a run reaches the step it targets.

## Results

| Run | `yarn verify` exit | Steps passed | Failed at | Output of the failing step |
|---|---|---|---|---|
| clean tree (`8dcedd0e`) | 0 | 20 of 20 | — | `[verify] all 20 step(s) passed` (3 min 38 s, build included) |
| hard-coded JSX text | 1 | 8 | `i18n:check-hardcoded` | `src/modules/club_core/components/SeedHardcodedText.tsx:2:13 [jsx-text] "Welcome to the club"`; `--strict: 1 findings in Vereino modules must be translated or allowlisted with a reason.` |
| `any` | 1 | 4 | `lint` | `1:23  error  Unexpected any. Specify a different type  @typescript-eslint/no-explicit-any` |
| unformatted file | 1 | 6 | `format:check` | `format:check: packages/app/src/modules/club_core/lib/seed-unformatted.ts is not formatted (run yarn format)` |
| palette class | 1 | 7 | `ds:check` | `src/modules/club_core/components/SeedPalette.tsx:2:24 [hardcoded-palette] Use semantic or status design tokens instead of palette shades.` |
| missing `pl` key | 1 | 9 | `contracts:check` | `contracts:check: club_core: key club_core.seed.onlyEnglish is in en.json but not in pl.json` |
| failing unit test | 1 | 17 | `test` | `● ENG-TEST-01 seed › fails on purpose`; `Tests: 1 failed, 1768 passed, 1769 total` |

Every seeded run exits non-zero at the expected step, and the clean tree exits 0. ENG-TEST-01 passes and ENG-AC-01 is met. The other half of ENG-AC-01 holds too: `yarn verify` is the only gate command in `AGENTS.md` (Validation), `.ai/agentic.config.json` (`validation.commands`), CI (`.github/workflows/ci.yml`, job `gate`: `run: yarn verify`) and the club spec (phasing: "Validation for each phase: `yarn verify`").

## Decisions

- **Recorded runs, no script test.** The issue accepts either. A test that runs the real gate six times would take about 15 minutes and would need its own coverage at 100 % (AGENTS.md). `packages/app/scripts/__tests__/verify.test.mjs` already covers the runner's order and stop logic with fakes. So the runs are recorded here and cited next to ENG-AC-01.
- **The first failing-test seed was invalid, and was redone.** It used the jest globals without `import { describe, expect, it } from '@jest/globals'`. That run stopped at `typecheck` (exit 2, `TS2593: Cannot find name 'describe'`), not at `test`, because test files under `src/` are typechecked. With the import added, as the existing tests have it, the run stopped at `test`. The first result shows that `typecheck` also covers test files. It does not count toward ENG-TEST-01.

## Observations

- During the runs, something outside the repository's scripts (most likely the cockpit's diff view) added the untracked seed files to the index as intent-to-add entries. After a seed was removed, `git status` still listed it as ` D`. On disk each run held only its own seed, so the results stand. The stale index entries were cleared with `git rm --cached` before committing.

## Files changed

- `.ai/specs/2026-10-21-engineering-standards-and-patterns.md`: ENG-AC-01 ticked, with evidence pointing to this run log.
- `.ai/specs/changelog/2026-10-21-engineering-standards-and-patterns/2026-11-22-issue-575-eng-test-01.md`: changelog entry.
- `.ai/runs/2026-11-22-issue-575-verify-seeded-violations.md`: this log.

## Open problems / next steps

None. The other open ENG-TEST items (#576, #578, #580–#582) remain with their own issues.
