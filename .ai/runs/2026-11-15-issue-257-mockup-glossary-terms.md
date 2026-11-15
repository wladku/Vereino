# Run — #257 E09-S03: the mockup's glossary in every catalog, and a retired-term check

- **Date:** 2026-11-15
- **Trigger:** cezar run `43abfddf` (`om-auto-fix-issue 257`, label `cezar` added to the issue)
- **Issue:** [#257](https://github.com/wladku/Vereino/issues/257) (epic #251)
- **Spec:** `.ai/specs/2026-11-14-vereino-parity-navigation-and-naming.md`, phase 3 — REQ-N11, TEST-N10, TEST-N11, AC-N11; DD-N11, DD-N12 (status `Ready for implementation`, owner decisions of 2026-11-15 on #251 approve the `check-glossary` verify step)
- **Branch:** `feat/issue-257-mockup-glossary-terms`

## Goal

Catalog values of the seven Vereino modules follow the glossary (D-031 §2) and a `yarn verify` step keeps the five retired Polish terms out.

## Steps

1. Triage: issue unclaimed, no open PR, spec Ready, the new verify step approved (#251 owner decisions, spec *Ask First* item 4). Claimed the issue (assignee, `in-progress`, 🤖 comment).
2. Split the catalog work into three subagents with disjoint module scopes (slice a: `activities`, `groups`, `communication`; slice b: `club_core`, `people`, `payments`; slice c: `facilities`), each also owning its module's fallback strings and tests.
3. Built `packages/app/scripts/check-glossary.mjs` + `check-glossary.allow.json` + unit tests (TEST-N10, 100 % coverage) and wired `glossary:check` into `scripts/verify.mjs`, both `package.json` files, `test:scripts` coverage, `coverage-scope.test.mjs`, `AGENTS.md` and `CODE_REVIEW.md`.
4. Added TEST-N11 (`packages/app/src/__tests__/i18n/member-nav-labels.test.ts`).
5. Subagent reports integrated: slice a (activities 177 pl / 10 en, groups 1, communication 14 / 3), slice b (club_core 63 / 10, people 5 / 3, payments 37 / 4), slice c (facilities 182 / 6). Relayed slice b's two cross-slice findings to slice a (the „Trenerzy mogą odwoływać terminy” quote in `activities.errors.coach_cancel_disabled`; the "jako trener" option in two activities specs).
6. Updated the out-of-slice assertions myself: `journeys/J-002` (context option, "Nowa aktywność", "Deklaracje zamknięte: termin już się rozpoczął.", "Zamknij termin", "To nie jest Twój termin"), `journeys/J-003` ("jest odwołany.", "Odwołany przez:"), `people/E06-S19` ("Moje terminy dziś i jutro").
7. Sweeps: every changed old value searched across `.ai/qa`, `src`, `packages/ui/src` (remaining hits are short words used elsewhere, comments, or `packages/ui` tests' own fixture labels); every `t('key', 'fallback')`, `pageTitle`/`pageTitleKey` and `pageGroup`/`pageGroupKey` pair compared with the English catalog (0 mismatches); key sets of all 14 catalogs identical to `HEAD` and pl = en per module.
8. Spot-read the Polish diff of each module (grammar of the gender changes "aktywność" f., "miejsce" n., "termin" m.).

## Decisions

- **Group names stay out of scope** (issue: "the menu labels and group names (E09-S01)"). Phase 1 (#246, closed by #313) did not move the activities pages to the shared group key, so `activities.nav.group` still reads "Harmonogram". The check's `harmonogram` rule would fail on it; it is allow-listed with that reason instead of renaming the value, which would show a second "Zajęcia" group next to "Grupy". The entry goes stale (and fails) as soon as phase 1's remainder renames the value.
- **Catalog scope of the check:** every `src/modules/*/i18n/pl.json` plus `src/i18n/pl.json`, literally as the spec's business rule says (not only the Vereino module list); the platform/example catalogs hold no in-scope match.

- **Single key for menu and page title:** where one key feeds both the sidebar and the heading, the page title wins (requests: "Zgłoszenia do akceptacji"). Titles that only fit a page with tabs ("Instytucje i umowy", "Wątki i sprawy", "Strefy i cennik", "Dziennik i incydenty") wait for phase 2 (#256), because those pages are still separate today. No key was added (DD-N11).
- **`facilities.public.state.requested*`** is the pending outside request on the public calendar, not the rental status `requested`, so it follows the mockup legend "Zgłoszone — oczekuje"; the rental status reads "Zaakceptowany — czeka na wpłatę".
- **Status casing:** rental statuses keep the catalog's capitalised style ("Czeka na akceptację") rather than the mockup's lower-case badges.
- **"Termin" as the schedule column** would now mean one meeting, so the activity's schedule column/field reads "Reguła" (the mockup's column word); English stays "Schedule".

## Files changed

- Catalogs: `packages/app/src/modules/{activities,groups,communication,club_core,people,payments,facilities}/i18n/{pl,en}.json` (479 pl / 36 en values).
- Code fallbacks: `facilities/backend/facilities/requests/page.meta.ts`, `payments/backend/payments/bank/page.meta.ts`.
- Check: `packages/app/scripts/check-glossary.mjs`, `check-glossary.allow.json`, `scripts/__tests__/check-glossary.test.mjs`, `scripts/__tests__/coverage-scope.test.mjs`, `packages/app/package.json`, `package.json`, `scripts/verify.mjs`, `AGENTS.md`, `CODE_REVIEW.md`.
- TEST-N11: `packages/app/src/__tests__/i18n/member-nav-labels.test.ts`.
- Integration specs (text expectations): 12 in `activities/`, 2 in `club_core/`, 2 in `facilities/`, 2 in `journeys/`, 1 in `payments/`, 1 in `people/`.
- Spec changelog: `.ai/specs/changelog/2026-11-14-vereino-parity-navigation-and-naming/2026-11-15-issue-257-glossary.md`.

## Commands and results

- `node --test --experimental-test-coverage --test-coverage-include=scripts/check-glossary.mjs scripts/__tests__/check-glossary.test.mjs` — 11/12 pass before the catalog edits; "the real catalogs pass" fails listing the ~100 `wnios`/`zdarze`/`stawki najmu`/… keys (expected), coverage 100/100/100.
- `npx jest src/__tests__/i18n` — 36 passed.

- `yarn glossary:check` — `12 Polish catalog(s), 0 problem(s)` after the catalog edits.
- Subagents: `npx jest src/modules/activities src/modules/groups src/modules/communication` 24 suites / 270 tests passed; `src/modules/club_core src/modules/people src/modules/payments` 31 suites / 557 passed; `src/modules/facilities` 15 suites / 146 passed.

- `yarn verify` (first run) — generate, typecheck, typecheck:packages, typecheck:qa, lint passed; `format:check` failed: `packages/app/scripts/__tests__/check-glossary.test.mjs is not formatted (run yarn format)`. Fixed with `yarn format`; `yarn verify --from format:check` passed the remaining 11 steps (`test:scripts` coverage 100 % for `check-glossary.mjs`).
- `yarn verify` (full, on the four commits) — `all 16 step(s) passed`.
- `yarn test:integration:vereino --filter E06-S19` (member shell: context labels, "Wyloguj", "Moje terminy dziś i jutro") — `1 passed (2.3m)`.

## Open problems

- **Native-reader review** (phase 3 exit gate, the oracle for glossary rules 1–2): not done by an agent; the owner reviews the Polish diff per module on the pull request.
- **Only E06-S19 of the integration specs with changed text expectations ran** here (the other 12 activities specs, J-002, J-003 and the rest run in CI); CI's integration job runs them. The E06-S11 coach picker now types `'no'` to find "— no coach —".
- Places use the shared `club_core.common.active` ("Aktywna", feminine) next to the neuter "miejsce" in the list's status column; a separate key would be a new key (out of scope).
- Group names (`*.nav.group`) and short menu labels remain phase 1 work (E09-S01); the allow-list entry for `activities.nav.group` must go with it.

## Next steps

- Owner: native-reader review of the Polish diff per module; remaining phase 1 slice (group names, shared `groups.nav.group`, menu labels) — the allow-list entry turns stale and fails the check then, which forces its removal.
