# Run: PR #896 — merge `main` again (merge-train-conflict)

- **Goal / trigger:** cezar task (om-auto-fix-pr) — PR #896 (issue #871) was `CONFLICTING` with `main` after later merges (label `merge-train-conflict`). Merge `main` in without rewriting history; never merge the PR.
- **Branch:** `feat/issue-871-guardian-image-consent`, worked on a detached HEAD at its `origin` tip and pushed with `git push origin HEAD:feat/issue-871-guardian-image-consent`.

## Steps

1. Checked the PR: same-repository head (no fork), author `wladku`; claimed it (assignee, `in-progress`, 🤖 comment).
2. `git merge origin/main` — 2 conflicts, both caused by #868 (PR #888, personal invitation links) adding a people table next to this PR's `people_consent_events`:
   - `packages/app/src/modules/people/data/entities.ts`: kept both `ConsentEvent` and `InvitationLink` (with its `invitationLinkColumns` constant).
   - `packages/app/src/modules/people/lib/club-tables.ts`: kept both `people_consent_events` and `people_invitation_links` in `PEOPLE_CLUB_TABLES`.
3. Migrations: `main`'s `Migration20261126215230_people` (invitation links) runs before this PR's `Migration20261127065234_people`; the auto-merged `.snapshot-open-mercato.json` is valid JSON and holds both tables. No migration was edited or added.
4. `yarn install`, `yarn generate`, `yarn typecheck`, `yarn verify`, `yarn guard` and the integration tests of the conflicting area (see Results).

## Decisions

- Both sides only added independent entries; order follows the files' existing append order (this PR's entry, then the newer `main` entry).

## Results

- `yarn typecheck`: passed. `yarn verify --from typecheck:packages`: all 22 steps passed (`generate` and `typecheck` were run just before).
- `yarn guard`: no blocking findings.
- Integration, one id per run with `yarn test:integration:vereino --filter <ID>`: `TEST-I01` 1 passed (58.2s), `TEST-I02` 1 passed (56.6s), `TEST-M07` 2 passed (1.8m), `TEST-IL01` 1 passed (1.1m), `ISSUE-628` 1 passed (2.6m).

## Files changed

- `packages/app/src/modules/people/data/entities.ts`, `packages/app/src/modules/people/lib/club-tables.ts` (merge resolution), this log.

## Open problems / next steps

- The merge train picks the PR up again once CI is green; `needs-qa` stays until a QA reviewer signs off.
