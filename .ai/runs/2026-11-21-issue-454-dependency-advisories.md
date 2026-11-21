# Run: issue #454 — high and critical dependency advisories

- **Trigger:** Cezar run (`om-auto-fix-issue`, step 1 of 3 "Build, draft PR"), issue labelled `cezar` on 2026-11-21.
- **Issue:** #454. **Branch:** `fix/issue-454-dependency-advisories` (from `main` at `81bc312e`).
- **Spec:** `.ai/specs/2026-10-21-engineering-standards-and-patterns.md` — P2, P4, P6, S16.3.

## Goal

Make `yarn npm audit --all --recursive --severity high` exit 0. The issue marks the `next` and `zod` upgrades as blocking on an owner decision (Ask First: dependencies, P2 under P6); the transitive fixes are in the issue's own scope (P4 `resolutions` when compatible).

## Steps and decisions

1. Claimed the issue (assignee, `in-progress`, `🤖` claim comment).
2. Baseline audit on `main`: `body-parser` 2.3.0, `happy-dom` 20.14.6, `next` 16.3.6 (2 critical, 2 high), `node-forge` 1.3.1 (14 advisories), `re2js` 2.8.6, `zod` 4.4.3.
3. Transitive fixes, each version older than the 5-day `npmMinimalAgeGate`:
   - `happy-dom` → 21.0.4 (P4). Major bump, but `@open-mercato/documents` 0.9.0 declares it and imports it nowhere in `src` or `dist` (grep), so no runtime path changes. No 20.x release carries the fix.
   - `node-forge` → 1.4.3 (P4). `@parse/node-apn` 6.5.0 pins 1.3.1; its own 8.x line depends on 1.4.2, so 1.4 is API-compatible. Smoke: `require('@parse/node-apn')` and `node-forge` load.
   - `re2js` → 2.8.8 (P4), patch of the pinned 2.8.6 in `@open-mercato/shared`. Smoke: `RE2JS.compile('a+b')` matches.
   - `body-parser` → 2.4.0 by `yarn up -R body-parser`: already inside `express` 5.3.0's `^2.3.0`, so lockfile only, no resolution.
   - Rows added to `CONTRIBUTING.md` → *Root `resolutions` (P4)* with reason and removal condition.
4. Not done, owner decision asked on the issue: `next`/`eslint-config-next` 16.3.6 → 16.4.6 (a minor, needs ≥ 16.4.1) and `zod` 4.4.3 → 4.6.6+ (overrides the platform's exact pin in `@open-mercato/core`). Upstream issues in `open-mercato` not filed (outward action, left to the owner).

## Commands and results

- `yarn npm audit --all --recursive --severity high` after the change: remaining only `next` (1241496, 1242816, 1242818, 1242859) and `zod` (1243066).
- `yarn verify`: all 18 steps passed (generate, typecheck, lint, format, checks, test, test:scripts, build).
- Integration: no test added or edited; none run (the change touches no app route, command or page).

## Files changed

- `package.json` (root `resolutions`), `yarn.lock`, `CONTRIBUTING.md`, this run log.

## Open problems / next steps

- Owner approves `next` and `zod` versions → follow-up run on `fix/security-next` / `fix/security-zod` with the full gate and integration suite; then the audit exits 0 and #454 closes.
- File upstream issues for the platform-owned transitives.
