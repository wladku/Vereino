# English repository and multilingual interface

- **Date:** 2026-10-20
- **Agent / tool:** Claude Code (Opus) coordinating six background subagents
- **Trigger:** product owner — "everything in git must be in English; the interface must be available in Polish and English, with the option to add more languages"
- **Spec / issue / branch:** `.ai/specs/2026-10-20-vereino-club-management.md` (REQ-035, DD-34, Q-038, V-11, TEST-047, AC-035); branch `main`
- **Status:** completed

## Goal

Translate every Vereino document in the repository into English, rename Polish file names, and make the clickable mockup bilingual (en + pl) with catalogs that allow adding languages without code changes; record the multilingual interface as a requirement in the spec.

## Steps

1. Asked the product owner three questions: club content language (one per club), Polish copies and file names (English only, rename files), mockup demo data (stays Polish).
2. Wrote a binding Polish → English glossary (domain terms and UI labels) shared by all subagents.
3. Started six subagents in parallel: spec lines 1–404, 405–821, 822–1219 (line-for-line into scratch files); UX concept; research folder + root README (in place, with renames); mockup internationalization (in place).
4. Forwarded the UX translator's extra UI labels to the mockup agent and the research translator's English source tags to the spec translator, so labels and tags match.
5. Assembled the three spec parts, checked line count (1219), table pipe counts and blank lines per line, harmonized two terms, replaced the spec and the UX concept.
6. Added REQ-035 (multilingual interface) with DD-34, vocabulary row, data fields (`default_locale`, `preferred_locale`), Q-038, V-11, TEST-047, AC-035, phase 1 step 4a; removed "kit orders" from Non-goals (in scope since REQ-032).
7. Added the repository-language rule to `AGENTS.md`; documented the language switcher in the UX concept.
8. Verified the mockup myself in the browser and rebuilt the shareable files.

## Decisions

- One content language per club; only the interface is multilingual — simplest for 1.0, content translation can come later (Q-038).
- Research files renamed to English slugs; the domain-model draft keeps its Polish → entity glossary on purpose (it maps Polish UI terms to entities).
- Mockup: English source text in `i18n/en.json`, Polish in `i18n/pl.json`; the build fails when catalogs have different keys; enum values in code are English codes with translated labels.
- Spec split line-for-line into three parts so the result could be checked mechanically against the source.

## Files changed

- `.ai/specs/2026-10-20-vereino-club-management.md` (translated + REQ-035)
- `.ai/specs/research/**` (translated, 18 files renamed), `README.md`
- `docs/ux-concept/README.md` (translated + language switcher)
- `docs/ux-concept/mockups/`: `app.ts`, `app.js`, `index.html`, `build.mjs`, `build-artifact.mjs`, new `i18n/en.json`, `i18n/pl.json`, `i18n.js`
- `AGENTS.md` (repository language rule, committed earlier in `dd41fe2`)

## Commands and results

- Spec assembly script: 1219 lines, 0 pipe/blank mismatches; remaining Polish words are names and club data only.
- `python tblcheck.py` / `pipecheck.py` on the spec and UX concept: no table or code-span pipe issues.
- `node build.mjs`: `i18n.js: en (English) 2016 keys, pl (Polski) 2016 keys`; `app.js` built.
- `node build-artifact.mjs <out>` and `--real`: both written, no anonymization warnings.
- Browser (localhost:8790): all 58 screens in English and Polish (116 visits) — no JS errors, no raw keys, no `undefined`/`NaN`.
- `node scripts/check-lessons.mjs`: valid.

## Open problems

- V-11: how the platform resolves the request locale and renders server-side emails in a given locale must be verified at the start of phase 1.
- The first commit on `main` (`31e32c5`) has a Polish message; history was not rewritten (it is already pushed).
- Kit order confirmation emails in the mockup keep the order lines in the language used when sent.

## Next steps

- Push when the product owner asks.
- Phase 1 implementation starts with V-11 and the i18n foundation (step 4a).

## Lessons recorded

- `.ai/lessons/subagents-never-stage-changes.md` — a subagent's `git mv` staged renames that slipped into an unrelated commit.
