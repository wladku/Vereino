# Run: Polish wording review sheet for the owner (#603, AC-N11)

- **Goal and trigger:** Cezar run of `om-auto-fix-issue 603` (label `cezar`). #603 asks for a native-reader review of the Polish catalogs (glossary rules 1–5) recorded on a PR, the open part of AC-N11 in `.ai/specs/2026-11-14-vereino-parity-navigation-and-naming.md`. Owner decision of 2026-11-24 on #603: the owner reviews the wording; this run prepares a docs PR with a review sheet (every Polish string of the menu, page titles, tabs, statuses and buttons, grouped by module, English source next to it, an empty "change to" column). A follow-up applies the marked changes and ticks AC-N11.
- **Issue / branch:** #603, `docs/issue-603-native-reader-review-polish-wording`.

## Steps

1. Claimed #603 (assignee, `in-progress`, `🤖` claim comment naming this worktree and branch).
2. Read the spec's *Glossary (D-031 §2)* rules 1–5 and the "Retired term" business rule (already enforced by `glossary:check`).
3. Collected the strings with a throw-away Node script (kept outside the repository, one-off): it reads the `pl.json`/`en.json` of the eight modules in `packages/app/vereino-modules.json` and the `page.meta.ts`/`page.tsx` files of each module, and sorts keys into five kinds — menu (`pageTitleKey` of sidebar pages, `pageGroupKey`, `nav` keys), page titles (`pageTitleKey`/`titleKey` of other pages, last breadcrumb label, `<area>.title`), tabs, statuses, buttons. The rules are written out in the sheet's *Scope* section so the follow-up can reproduce the selection.
4. Merged the member and public shell labels, which are copied into up to six modules with the same text, into one row per text listing every key holding a copy (a change there applies to all copies).
5. Wrote `.ai/qa/polish-review-2026-11.md`: 737 rows (31 shell rows + 706 module rows) at `main` `5683e44c`.

## Decisions

- The app catalog `packages/app/src/i18n/pl.json` (Open Mercato platform strings) is out of scope: the issue and AC-N11 are about the Vereino wording and the mockup's catalogs.
- Field labels, help texts, messages and e-mail bodies are not in the sheet; the owner's decision names the five kinds above.
- The spec and its changelog are not changed here: AC-N11 is ticked by the follow-up that applies the review, with this PR's link.
- The generator is not committed: a committed tooling script needs 100 % unit-test coverage, and the sheet is a one-off snapshot keyed by catalog keys.

## Files changed

- `.ai/qa/polish-review-2026-11.md` (new)
- `.ai/runs/2026-11-24-issue-603-polish-review-sheet.md` (this log)

## Commands and results

- `yarn verify`: all 22 steps passed (exit 0).
- `yarn guard`: no blocking findings.

## Open problems / next steps

- The owner fills the **Change to** column and the **Result** section on the PR.
- Follow-up: apply the marked changes to the catalogs (both copies where a key is duplicated), run `yarn verify` (`glossary:check`, `qa-texts:check`) and the integration tests asserting changed texts, then tick AC-N11 with this PR's link.
