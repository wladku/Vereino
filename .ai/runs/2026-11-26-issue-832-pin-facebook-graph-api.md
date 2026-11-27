# Run: pin a current Facebook Graph API version (#832)

- **Goal and trigger:** Cezar run of `om-auto-fix-issue` for #832 (owner issue, labels `enhancement`, `priority-low`, `risk-low`, `cezar`); follow-up of the PR #829 review.
- **Spec:** `.ai/specs/2026-10-27-vereino-social-sign-in.md` (phase 2). **Branch:** `feat/issue-832-pin-facebook-graph-api`.

## Steps

1. Claimed #832 (assignee, `in-progress`, `🤖` claim comment naming this worktree). Dependency #829 is merged (`04be7daf`).
2. Read Meta's Graph API versions table (https://developers.facebook.com/docs/graph-api/changelog/versions/, 2026-11-26): v26.0 released 2026-07-29, expiry "TBD"; v25.0 expires 2028-07-29; v21.0 expires 2027-01-21. The Marketing API changelog names a v27.0 (2026-11-04), but the Graph versions table and `changelog/version27.0` (404) do not list it yet.
3. `FACEBOOK_GRAPH_VERSION` in `foundation/lib/identity.ts`: `v21.0` → `v26.0`, with the release date, the guaranteed availability (at least two years, so until at least 2028-07-29) and the source in the comment. Updated the URL in `lib/__tests__/facebook.test.ts`.
4. Spec phase 2 exit gate: the real Facebook test user also rechecks the token exchange (POST with `code_verifier`) and `/me?fields=id,email` on the pinned version; changelog file `2026-11-26-issue-832-graph-v26.md`.

## Decisions

- v26.0 over v27.0: the Graph API versions table, the authoritative source for Graph, lists v26.0 as the newest; v27.0 appears only in the Marketing API changelog. v26.0 over v25.0: newer, longer life.
- No integration test change: the provider fake overrides every Facebook URL through `VEREINO_OAUTH_FACEBOOK_*`, so the pinned version never reaches CI. The real-user recheck stays an owner task at the phase 2 exit gate (no Facebook app is live yet).

## Commands and results

- `npx jest .../facebook.test.ts .../identity.test.ts`: 47 passed.
- `yarn verify`: generate, typecheck, typecheck:packages, typecheck:qa passed; `lint` failed with `FATAL ERROR: Ineffective mark-compacts near heap limit Allocation failed - JavaScript heap out of memory` (exit 129, no lint errors). `NODE_OPTIONS=--max-old-space-size=8192 yarn verify --from lint`: all 19 steps passed (lint through build). No code changed between the two runs.
- `yarn guard`: no blocking findings.
- Lesson added: `verify-lint-heap-out-of-memory`.

## Open problems / next steps

- Owner: at the phase 2 exit gate, sign in with a real Facebook test user on v26.0.
