# Run: PR #829 (issue #567, Facebook sign-in) — merge main and drive to merge-ready

- **Trigger:** cezar task, `om-auto-fix-pr 829`; the PR was `CONFLICTING` / `DIRTY` against `main`.
- **Spec:** `.ai/specs/2026-10-27-vereino-social-sign-in.md` (phase 2). **Issue:** #567. **Branch:** `feat/issue-567-facebook-sign-in`, worked on a detached HEAD and pushed with `git push origin HEAD:feat/issue-567-facebook-sign-in` (no force push, no history rewrite).

## Steps

1. Claimed the PR (`in-progress` label and a 🤖 comment). The PR is not a fork and its author is the owner.
2. Merged `origin/main`. Main had landed DD-S07, the central callback host (#700, #783). Three files conflicted:
   - `api/identity/[provider]/callback/route.ts`: took main's hand-off flow. The PR's one change there (`IdentityProviderError` → its message as the failure reason) moved into the shared `failureReason` in `api/identity/round-trip.ts`.
   - `_fixtures/isolation/inventory/foundation.json`: kept both the `deletion` (PR) and `handoff` (main) entries.
   - `lib/__tests__/identity.test.ts`: kept both import lists.
3. Fixed a semantic conflict that `yarn verify` (`typecheck:qa`) caught: main's new TEST-S05 imported `startGoogleFake` / `GoogleFake`, which this PR renamed to `startOAuthFake` / `OAuthFake`.
4. Review by a fresh subagent of the merged diff: no blocking finding beyond step 3. The Facebook (`graph`) provider works through start → central callback → hand-off without changes. Non-blocking findings were filed as follow-ups: #832 (Graph version pin) and #833 (deletion callback body size).
5. Ran `yarn verify` and the identity integration tests locally, one id per run.

## Decisions

- The spec stays `In progress`. DD-S07 is now built, but the phase 2 exit gate still needs the owner's tasks: a real Facebook app, App Review, and a run with a real test user.
- The Graph version pin and the deletion body-size check are left as follow-ups, not added here, to keep this run to the merge.

## Commands and results

- `yarn typecheck`: pass. `npx jest src/modules/foundation/lib`: 191 tests passed.
- `yarn verify`:
  - The first run failed at `typecheck:qa` (TEST-S05 imports); fixed in step 3.
  - `lint` was then killed twice by an ESLint out-of-memory error at Node's default heap ("FATAL ERROR: Ineffective mark-compacts near heap limit Allocation failed - JavaScript heap out of memory"). That is an environment limit on this server, not a lint finding.
  - `NODE_OPTIONS=--max-old-space-size=12288 yarn verify --from lint`: every step passed.
- Integration tests, run locally on `952948f4`, one id per run:
  - TEST-S05: passed (55.7s).
  - TEST-S01: passed (1.2m).
  - TEST-S02: passed (1.0m).
  - TEST-S03: passed (1.0m).
  - TEST-S04: passed (55.1s).
  - ISSUE-628-cross-club-isolation: passed (2.6m).
- `yarn guard`: no blocking findings. One warning: `AGENTS.md` changed (the PR's D-027 sentence).

## Open problems / next steps

- Owner tasks before real users, as listed in the PR body.
- Follow-ups #832 and #833.
