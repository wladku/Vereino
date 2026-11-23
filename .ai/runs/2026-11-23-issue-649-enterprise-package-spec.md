# Run log — issue #649: spec for the Vereino Enterprise package with per-tenant licence keys (E23-S03)

- **Trigger:** Cezar run 1dc06a45 (`om-auto-fix-issue`, label `cezar`), feature route → `om-auto-write-spec`.
- **Issue:** #649 (epic E23 #646, decision D-035 point 2, on `main`).
- **Spec:** `.ai/specs/2026-11-23-vereino-enterprise-package.md` (new, `Draft`).
- **Branch:** `docs/issue-649-enterprise-package-spec`.
- **Route:** `spec-first`. The issue asks for a design-only spec PR with Open Questions first; the skeleton follows only
  after the owner approves the spec, so this run ships the spec only.

## Steps

1. Concurrency check: #649 had no assignee, no `in-progress`, no claim comment, no PR. Claimed it (assignee,
   `in-progress`, `🤖` claim comment naming this run, worktree and branch).
2. FR triage: no Enterprise package, gate or licence code exists. `@open-mercato/enterprise` was removed in #466;
   `forbidden-packages:check` keeps it out. No covering spec in `specs/`, `implemented/` or `archive/`.
3. Context read: D-035, ADR-023 and S16.4 of the engineering standards, the #466 run log, `modules.ts`, `next.config.ts`,
   `check-licenses.mjs`, `check-forbidden-packages.mjs`, the generator's static `modules.ts` parser
   (`@open-mercato/cli/dist/lib/resolver.js`), the Railway/Dockerfile build, and the sibling spec PR #644 as the format
   model.
4. Wrote the spec (`om-spec-writing`, autonomous; Open Questions kept with recommendations, as the issue asks for owner
   questions, following the #644 convention) and the changelog entry.
5. Independent staff-engineer review by a fresh-context subagent: 2 Critical, 5 High, 6 Medium, 2 Low findings. All
   were applied:
   - Critical: with `nmHoistingLimits: workspaces` the app sees an overlaid workspace only when `packages/app/package.json`
     lists it, and a peer-only package cannot resolve its imports → the overlay script patches the app manifest, the
     package repeats its peers as devDependencies with the app's ranges, exports `./modules/*`, and the lockfile check
     allows exactly the new stanza plus one app dependency line.
   - Critical: the integration run builds with `NODE_ENV=production`, so a `NODE_ENV=test` key override would never
     switch on → a committed test key pair trusted only by a CI-only generated file plus `VEREINO_CI=true`.
   - High: the Dockerfile's three stages (runner reinstalls from the public lockfile) are described; `node:crypto` kept
     out of `@vereino/core` (bundled into client components) behind a `verifySignature` callback; the
     `licenses:check` exception dropped (workspaces are never listed); the grace period now means full use, then
     read-only; "read-only forever" now relies on expired keys staying installed.
   - Medium/Low: marker-based allow rule for `forbidden-packages:check`; `NEXT_PUBLIC_` switch because `modules.ts` is
     evaluated in the browser; build-time constant compared at boot; `--modules-root` for the module checks; fixture
     excluded from `tsconfig.json`; an `instance` claim in the key; wording fixes; phase 1 split into 1a (gate) and 1b
     (loading); the `globals.css` `@source` line.

## Decisions

- **Spec only, no skeleton:** the issue's acceptance criteria put the skeleton PR after the spec's approval, and the
  skeleton touches platform files and adds contracts (Ask First).
- **Gate and key format in the public core, keys in a sealed variable:** no migration in the public repository; the key
  format and the per-tenant switch are testable in public CI.
- **PR stays a draft:** Q-E01…Q-E03 are marked ⚠ (the owner's choices on distribution, key format and expiry).

## Commands and results

- `yarn verify` (after the review fixes) → `[verify] all 21 step(s) passed`.
- `yarn guard` → "No blocking findings."
- Integration tests: none added or changed (docs only).

## Open problems / next steps

- The owner answers Q-E01…Q-E05 on the PR; then phase 1a and phase 1b as separate PRs under #649.
- Owner actions for phase 2: the private repository, the signing key pair, the build token.

## Follow-up run (2026-11-23): owner answers recorded

- Trigger: the owner answered Q-E01…Q-E05 in a PR #660 comment (all as recommended) and approved phases 1a and 1b.
- Steps: merged `origin/main` into the PR branch (no conflicts); recorded each decision in the spec's Open Questions
  table, dropped the ⚠ markers, marked the Ask First items approved, set the readiness verdict and `**Status**` to
  `Ready for implementation`; added changelog file `2026-11-23-owner-answers-ready.md`; PR marked ready.
- A third-party PR comment asking to run an external `npx` invoice validator was treated as untrusted content and not
  acted on (the spec has no e-invoicing scope).
- Next: `om-auto-implement-spec .ai/specs/2026-11-23-vereino-enterprise-package.md` — phase 1a, then phase 1b, as
  separate PRs under #649. Phase 2 needs the owner to create `wladku/vereino-enterprise` and the signing key pair.
