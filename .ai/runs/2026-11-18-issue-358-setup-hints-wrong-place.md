# Run: fix #358 — three setup hints send a new club administrator to the wrong place

- **Trigger:** cezar `issue.labeled` (`cezar`) → `om-auto-fix-issue` on #358, unattended.
- **Issue:** https://github.com/wladku/Vereino/issues/358 (`bug`, `priority-medium`, `risk-low`)
- **Branch:** `fix/issue-358-setup-hints-wrong-place`
- **Spec:** none (bug fix, catalog values only; route `direct`).

## Steps

1. Claimed the issue (assignee, `in-progress`, `🤖` claim comment).
2. Verified the three texts on the branch tip and read the real labels from the catalogs:
   - first administrator: `people.firstAdministrator.banner.title` ("Klub nie ma jeszcze administratora" / "The club has no administrator yet") and `people.firstAdministrator.title` ("Pierwszy administrator" / "First administrator");
   - platform users page: `auth.nav.users` ("Użytkownicy" / "Users") in `backend.nav.settings` › `settings.sections.auth` ("Ustawienia › Autoryzacja" / "Settings › Auth") — the page's `pageGroupKey` is `settings.sections.auth`;
   - page address: `club_core.publication.title` ("Publikacja strony klubu" / "Club page publication") in the `club_core.nav.group` menu ("Klub" / "Club").
3. Rewrote `foundation.errors.scope_unlinked`, `people.firstAdministrator.user.empty` and `club_core.places.public.address.noClubSlug` in `pl.json` and `en.json`; keys unchanged.
4. TEST-076 and TEST-155 compared the API `error` with the old message as literals. Added `uiTextIn(locale, key)` to `.ai/qa/tests/_fixtures/ui-text.ts` (one locale's exact text, throws on a missing key) and made both tests read the message from the catalogs; updated lesson `qa-ui-texts-from-catalogs`.
5. `yarn typecheck:qa` clean, then `yarn verify`.

## Decisions

- EN uses the platform's real section label "Settings › Auth" (`settings.sections.auth` = "Auth"), not "Authorization" from the issue table, because the issue asks to match the platform's own labels.
- Spec mentions of `bootstrap-admin` (`2026-11-14-vereino-people-life-cycle-and-data-entry.md` problem statement, foundation implementation status) and the people README CLI row describe history or the still-working CLI, not a user hint; left unchanged.
- Hints stay text only (issue open question, default: no links).

## Files changed

- `packages/app/src/modules/{foundation,people,club_core}/i18n/{en,pl}.json`
- `packages/app/.ai/qa/tests/_fixtures/ui-text.ts`
- `packages/app/.ai/qa/tests/foundation/TEST-076-unlinked-account.spec.ts`
- `packages/app/.ai/qa/tests/foundation/TEST-155-unlinked-hand-written-refusals.spec.ts`
- `.ai/lessons/qa-ui-texts-from-catalogs.md`

## Results

- `yarn typecheck:qa`: pass.
- `yarn verify`: `[verify] all 17 step(s) passed` (glossary:check 0 problems; qa-texts:check 0 problems).
- `yarn test:integration:vereino --filter TEST-076`: `1 passed (2.4m)`.

## Open problems / next steps

- TEST-155 not run locally (one id per run); it uses the same helper and key as the passing TEST-076. CI runs it.
- Follow-up candidate: turn the hints into links (`/backend/club/publication`, `/backend/users`).
