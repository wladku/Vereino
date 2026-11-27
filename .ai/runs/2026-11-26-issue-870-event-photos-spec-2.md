# Run: issue #870 — record the owner's decisions in the event photos spec (PR #877)

- **Goal and trigger:** cezar task (`om-auto-fix-issue` 870, label `cezar` re-added 2026-11-26T21:44Z) after the owner answered the spec's open questions on #870 (comment 7203995918): write the answers into the spec, set it to `Ready for implementation`, take PR #877 out of draft.
- **Branch:** `docs/issue-870-photo-image-consent-spec` (PR #877). The branch is still checked out in the first run's worktree, so this run worked on its own local branch reset to the PR head and pushed to the PR branch.
- **Spec:** `.ai/specs/implemented/2026-11-26-vereino-event-photos-and-image-consent.md`.

## Steps

1. Checked the claim: the first run (worktree `10312fe9…`) had released its lock; no process of it was running. Claimed #870 again for this run (`in-progress`, `🤖` comment).
2. Read the owner decisions on #870 and the related decision on #857 (the shared `ConsentToggle` is built by #871).
3. Edited the spec:
   - Status → `Ready for implementation` with the approval reference;
   - Open Questions: Q-I01 (veto), Q-I02 (staff consents do not count; staff record withdrawals only), Q-I03 (no recognisable outsiders) decided; Q-I05 and Q-I06 recommendations accepted; Q-I04 and Q-I07 stay with the lawyer, non-blocking;
   - Rollout: every Ask First item marked approved; anything beyond the spec is Ask First again; never `db:migrate` against a dev or real database;
   - OA-I1: the consent text is with the lawyer and may still change; texts stay in the i18n catalogs;
   - Phase 1 deliverables and the ward page UI row: the shared `ConsentToggle` in `packages/ui/src/member/` (#857);
   - TLDR, DD-I05, the contract narrowing, the phase dependencies, the risks row and the compliance verdict follow the decisions.
4. Added the changelog file `2026-11-26-issue-870-owner-decisions.md`.
5. Ran the gate; added the lesson `verify-lint-heap-out-of-memory` after the lint OOM crash.

## Decisions

- The owner's approval mentions "the new module the spec names"; the spec names no new module, so nothing new is approved there, and the spec says a new module would be Ask First again.
- The DI contract (`imagePublishable`, `people.imageUsage.activities`) is additive and in the spec; it is recorded as approved with the spec.

## Commands and results

- `yarn guard`: no blocking findings.
- `yarn verify`: failed at `lint` after 102 s with `FATAL ERROR: Ineffective mark-compacts near heap limit Allocation failed - JavaScript heap out of memory` (exit 129; generate, typecheck, typecheck:packages, typecheck:qa passed). Resumed with `NODE_OPTIONS=--max-old-space-size=8192 yarn verify --from lint`: all 19 remaining steps passed. Recorded as lesson `verify-lint-heap-out-of-memory`.
- `yarn spec-changelogs:check`, `yarn spec-questions:check`, `yarn format:check`: pass.

## Open problems / next steps

- OA-I1: the lawyer's wording and the answers to Q-I04 and Q-I07, before real club data.
- #871 (phase 1) and #872 (phase 2) can start after PR #877 merges.
