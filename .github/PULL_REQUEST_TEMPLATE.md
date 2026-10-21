<!-- Title: Conventional Commits, e.g. "feat(payments): add cash receipt numbering" (S1.3, S1.4). -->

## What and why

<!-- One or two sentences. Link the governing spec section and requirement ids. -->

- Spec: `.ai/specs/…` — requirements / acceptance ids: …

## Checklist

- [ ] `yarn verify` passes locally (or CI shows why not)
- [ ] Tests added or updated; integration tests are self-contained (`--filter <TEST-ID>` run listed below)
- [ ] UI text only in catalogs, `en.json` and `pl.json` both updated
- [ ] Migrations: generated SQL pasted below and reviewed; expand/contract respected (S5.4) — or no migration
- [ ] Contract surface changed? `.ai/guides/upstream/BACKWARD_COMPATIBILITY.md` read and deprecation handled (S6.9) — or no change
- [ ] UI changed? Screenshots attached: both locales, 375 px, light and dark, loading/empty/error/conflict states — or no UI change
- [ ] Spec updated (Implementation Status, acceptance checkbox, Changelog row) and lessons recorded where something was learned
- [ ] Every commit is signed off (`git commit -s`, DCO)

## Agent work

<!-- Only when an AI agent produced this pull request (S19.3). -->

- Agent and model: …
- Run log: `.ai/runs/…`

## Evidence

<!-- Commands run and their results; SQL of migrations; screenshots. -->
