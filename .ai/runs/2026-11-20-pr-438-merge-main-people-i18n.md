# Run: PR #438 — merge `main` in, resolve the people i18n conflict (merge-train-conflict)

- **Goal and trigger:** cezar task (om-auto-fix-pr) — PR #438 (issue #380, E14-S05 club events on the phone) was `CONFLICTING` and labelled `merge-train-conflict`; merge `main` in, no force-push, never merge.
- **Branch:** `feat/issue-380-section-coordinator-club-event`, worked on a detached HEAD at its origin tip `e6690ba4`, pushed with `git push origin HEAD:feat/issue-380-section-coordinator-club-event`.
- **Spec:** `.ai/specs/2026-11-18-vereino-club-events-with-parts.md` — unchanged by this run.

## Steps

1. Merged `origin/main` (`c3cc830a`, includes #437 anonymise/delete a person, #439 public tournament page, #436 club event files) into the PR head.
2. Conflicts only in `packages/app/src/modules/people/i18n/en.json` and `pl.json`: both sides appended keys at the end of the catalog (this PR `people.club.nav.clubEvents`, main the `people.person.formerMember`, `people.errors.*`, `people.audit.persons.*`, `people.erasure.*` keys of #437). Resolved as the union of both sides; both files parse as JSON.
3. `yarn verify` on the merge result: all 18 steps passed (generate, typecheck, lint, i18n, contracts, qa-texts, test, test:scripts, build …).
4. Ran the integration tests of the conflicting area (people More menu) and of this PR locally under `sg docker` (results below).

## Decisions

- No code conflict, so no review finding came from the merge; the merge commit keeps both sides' keys verbatim.

## Files changed

- `packages/app/src/modules/people/i18n/en.json`, `pl.json` (merge resolution)
- `.ai/runs/2026-11-20-pr-438-merge-main-people-i18n.md` (this log)

## Results

- `yarn verify`: `[verify] all 18 step(s) passed`.
- Local integration under `sg docker` (Testcontainers PostgreSQL, Chromium): `--filter TEST-T12` `1 passed (1.0m)`; `--filter E09-S04` `1 passed (55.7s)`.

## Open problems / next steps

- PR keeps `needs-qa`; the merge train and a QA reviewer own the rest.
