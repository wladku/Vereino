# Run log — #584 invitation e-mail locale (AC-F04/AC-F11, Q18)

- **Trigger:** cezar run (`om-auto-fix-issue 584`), issue labelled `cezar` on 2026-11-24.
- **Issue:** #584 (epic #565); spec `.ai/specs/2026-10-27-vereino-foundation-primitives.md` — AC-F04, AC-F11, Q18.
- **Branch:** `fix/issue-584-invitation-email-locale`.
- **Owner decision (issue comment, 2026-11-24):** (a) accept the platform limit — the first invitation stays in the
  request locale; amend AC-F04/AC-F11 and Q18; the resend switches to `localeForPerson`; Q18 resolved by #339; TEST-F04
  resends through the Vereino route instead of the platform route with a superadmin token.

## Steps

1. Claimed the issue (assignee, `in-progress`, `🤖` claim comment naming this worktree and branch).
2. `foundation/services/accounts.ts`: `resendInvitation` takes an explicit `locale` and renders through
   `renderLocalized` instead of `resolveTranslations()` (request locale). Doc comments record the accepted deviation of
   `createAccount`.
3. `people/commands/accounts.ts`: `invitationLocale` = `localeForPerson(person, clubSettings.defaultLocale)`, passed by
   `people.persons.resend_invitation` and by `people.persons.update_account` (an invited account's new address).
4. Tests: `TEST-F04-create-account` resends the failed invitation through
   `POST /api/people/persons/{id}/account/invitation` with the club administrator's token; `TEST-F10-localized-invitation`
   resends to the `pl` person with an `en` request and to the `en` person with a `pl` request and expects each person's
   own subject (`uiTextIn`).
5. Spec: AC-F04 and AC-F11 rewritten to the accepted deviation and ticked; Q18 resolved; TEST-F04/TEST-F10 rows updated;
   changelog file `2026-11-24-issue-584-invitation-locale.md`. The status line is left as written (spec status rule).

## Decisions

- The locale is resolved in `people` (which owns the person and reads the club settings), not in `foundation`, so the
  foundation helper stays free of `people` data (no cross-module reads); the parameter is required so no caller can fall
  back to the request locale silently.
- No new i18n keys: the resend copy already exists in both catalogs.

## Files changed

- `packages/app/src/modules/foundation/services/accounts.ts`
- `packages/app/src/modules/people/commands/accounts.ts`
- `packages/app/.ai/qa/tests/foundation/TEST-F04-create-account.spec.ts`
- `packages/app/.ai/qa/tests/foundation/TEST-F10-localized-invitation.spec.ts`
- `.ai/specs/2026-10-27-vereino-foundation-primitives.md`
- `.ai/specs/changelog/2026-10-27-vereino-foundation-primitives/2026-11-24-issue-584-invitation-locale.md`

## Commands and results

- `yarn install && yarn generate` (fresh worktree had no root `node_modules`) — ok.
- `yarn typecheck` — exit 0.
- `yarn format:check` — 0 unformatted.
- `yarn spec-changelogs:check` — valid.
- `yarn test:integration:vereino --filter TEST-F10` — 1 passed (resend reaches each person in their own locale).
- `yarn test:integration:vereino --filter TEST-F04` — 1 passed (resend through the Vereino route, club admin token).
- `yarn test:integration:vereino --filter TEST-L01` — 1 passed (resend limits and update-account resend unchanged).

## Open problems / next steps

- None beyond the PR review.
