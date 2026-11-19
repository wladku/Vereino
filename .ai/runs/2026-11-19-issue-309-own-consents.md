# Run log — issue #309, phase L7 "Consents: the adult's own, effects, texts"

- **Goal and trigger:** cezar queued `om-auto-fix-issue` on #309 (label `cezar`, 2026-11-19 04:00 UTC). Feature route: implement phase L7 of `.ai/specs/2026-11-14-vereino-people-life-cycle-and-data-entry.md` (Ready for implementation; migration C and the `consentFlags` contract approved by the owner on #255, 2026-11-16, Ask First items 3 and 6; Q-L15 and Q-L16 confirmed there).
- **Spec / issue / branch:** spec above; issue #309 (E13-S07, epic #255); branch `feat/issue-309-adult-participant-consents`, worktree `.ai/cezar/worktrees/bf3230ce-…`.

## Steps

1. Claimed #309 (assignee, `in-progress`, `🤖` claim comment naming this run's worktree, branch and start). Read REQ-L10, DD-L11, DD-L12, the effects table, the API rows, the UI rows M-10, B-02, B-10, B-09, M-05, phase L7, TEST-L11, TEST-L12, TEST-L20, and the existing consent code (`people/lib/people-rules.ts`, `commands/guardianships.ts`, `commands/self.ts`, `services/member-profile.ts`, `services/person-directory.ts`, `club_core` settings).
2. Slice (b) texts in `club_core`: `lib/consent-texts.ts` (six keys, parse, the 1000-character check, the patch with `changedAt`; 100 % covered), `consent_texts` on the entity, the validator, the settings command (422 `consent_text_too_long` on `consentTexts.<key>`, snapshot and undo), the snapshot of `clubCoreSettings` and `GET/PUT /api/club_core/settings`.
3. Slice (a) own consents in `people`: `people_persons.consents`; `holdsOwnConsents`, `effectiveConsents`, `givenToEarlierWording` in `lib/people-rules.ts` (unit tests); `people.persons.set_own_consents` (`commands/own-consents.ts`, undoable, P-08 transitions, 422 `consents_minor`); `PUT /api/people/me/consents` and `POST /api/people/persons/{id}/consents`; `GET /api/people/me` gains `ownConsents` and `consentTexts`; `GET /api/people/persons/{id}` gains `holdsOwnConsents` and `ownConsents` for `people.manage`.
4. Slice (c) flags and filter: `consentFlags(scope, ids, today, em?)` and `effectiveConsentsOf` on the person directory; the `activities` attendance list adds `consentFlags` per row for the acting role `coach`; `attention=missing_consents` on `GET /api/people/persons` (participants without the regulations consent; `people.manage` only, 403 otherwise).
5. Migration C: `yarn db:generate` with `DATABASE_URL` pointing at an unreachable port (never applied); the `club_core` snapshot is committed in mixed style, so it was restored from git and the column block inserted by hand; a second `db:generate` reported no changes for both modules; `lock_timeout` and header comments added; the generated `packages/app/.env` deleted (lesson `mercato-cli-writes-env-and-storage`).
6. UI: M-10 `OwnConsentsSection.tsx` (switches, state with author and date, effect line, confirmation before a withdrawal), the club's wording and "given to an earlier wording" on every consent of the profile and the ward page (`ConsentList.tsx` helpers), effect lines on the ward page; B-10 `OwnConsentsPanel.tsx` on the Guardianship tab; B-02 group "Consent texts" in `ClubSettingsForm.tsx`; B-09 filter "Needs attention → Missing consents". Texts in `en` and `pl`.
7. Integration tests `people/TEST-L11-own-consents.spec.ts` and `people/TEST-L12-consent-texts.spec.ts`, each an API test (with TEST-L20 cases) and a browser test (375 px, both locales, light and dark, axe).
8. Docs: READMEs of `people` and `club_core`, spec changelog `2026-11-19-issue-309-phase-l7.md`, AC-L11 ticked; lesson `cezar-host-integration-runs-without-browser` extended.

## Decisions

- **No birth date → no own consents** (422 `consents_minor`): the conservative reading of "aged 18 or more"; otherwise a minor without a recorded birth date could consent alone.
- **Field name `ownConsents`** on the person read (the spec row says `consents`), so it cannot be confused with the guardian's `share_*_at` consents of the same view; `holdsOwnConsents` tells B-10 whether to show the panel.
- **Effective consent:** an adult's own decision wins; otherwise the most recent decision among the active guardianships (the DD-L08 carry-over reads them the same way).
- **Flags for the coach only:** the acting role `coach` of the attendance list (the group's coach or the session's assigned coach); a coordinator's and an administrator's list carry none ("for the coach of the session only").
- **"Missing consents"** = an active participant (through `groups.personFilter`) without the regulations consent; the filter reveals consent state, so it needs `people.manage`.
- **Built-in texts** for B-02's placeholders live in `club_core`'s catalogs; `people` keeps its own labels (the mockup's `m.screenProfile.consent*` wording for own consents). `club_core` never reads `people` keys.
- **Left to the consumers (out of scope, stated in the issue):** drawing the flags on M-05 and the roster (spec A) and the away-session trip prompt; this phase ships the contract, the flags in the attendance read and the effect lines.

## Results

- Unit: `npx jest src/modules/people/lib` — 234 passed; `club_core/lib/consent-texts.ts` 100 % lines, branches and functions (8 tests).
- `yarn typecheck`, `yarn typecheck:qa`: exit 0. `yarn lint`: first run 2 errors (`no-dynamic-delete` in `consent-texts.ts`, `no-unnecessary-boolean-literal-compare` in `OwnConsentsPanel.tsx`), fixed.
- `yarn test:integration:vereino --filter TEST-L11`: first run failed in the API test at the guardian's person read — `Expected: 200 Received: 403` (a member holds no `people.view`; the read is refused outright, which is the fail-closed outcome); the assertion now expects 403. The browser test failed at launch (`browserType.launch: Target page, context or browser has been closed`, the host's missing Chromium libraries — lesson `cezar-host-integration-runs-without-browser`); it runs in CI. Second run: the API test **1 passed** (11.3 s); the browser test failed only at launch (`libatk-1.0.so.0: cannot open shared object file`).
- `yarn test:integration:vereino --filter TEST-L12`: the API test **1 passed**; the browser test failed only at launch (`libatk-1.0.so.0`), CI runs it.
- `yarn test` (all workspaces, coverage thresholds): 1501 tests passed.
- `yarn verify`: first run failed at `lint` with 4 errors in the new test files (`no-unnecessary-type-assertion`, `no-unnecessary-type-arguments`); fixed with typed calls, then `yarn verify --from lint`: all remaining steps passed (generate, typecheck, typecheck:packages and typecheck:qa had passed in the first run; `typecheck:qa` re-run after the fix: exit 0).

## Open problems / next steps

- The browser halves of TEST-L11 and TEST-L12 run only in CI on this host.
- Spec A should draw the `image` and `trips` flags on M-05 and the roster from `consentFlags`, and the away-session declaration should ask for the trips consent (non-blocking question on #309: which E10 story consumes it).
