# Run: Polish wording review sheet brought up to date with `main` (#603, AC-N11)

- **Goal and trigger:** Cezar run of `om-auto-fix-issue 603`. #693 merged the review sheet `.ai/qa/polish-review-2026-11.md` on 2026-11-24, but the owner had not marked any row: every **Change to** cell was empty and **Result** was unticked. The owner told the run to continue autonomously without asking. The review itself has to come from a native Polish reader (the owner, decision of 2026-11-24 on #603), so the run does not fill it in or tick AC-N11. It brings the sheet up to date with `main` so the owner reviews what the app shows today.
- **Issue / branch:** #603, `docs/issue-603-polish-review-addendum`.

## Steps

1. Read #603 and #693. #693 is merged; the sheet has no marks and #693 has no review comments. Commented on #603 (status), then claimed it (assignee, `in-progress`, `🤖` claim comment naming this run, worktree and branch).
2. Extracted the module catalogs at `5683e44c` (the commit the sheet was built at) to a temporary directory with `git archive`.
3. Wrote a throw-away Node script outside the repository. It uses the sheet's own *Scope* rules (page `pageTitleKey`/`titleKey`/`pageGroupKey`/last breadcrumb label, `nav` keys, `<area>.title`, tab/status/button keys; audit, error, notification and column keys left out) and lists every in-scope key of the modules in `packages/app/vereino-modules.json` whose Polish value is new or changed since `5683e44c`. The `training` module did not exist at `5683e44c`, so all its in-scope keys are new.
4. Folded member-shell copies (`<module>.club.nav.*`, `facilities.places.nav.*`) into one row per label. 25 `training` copies carry the same text as rows 1–25 of the shell section; they are listed as copies, not reviewed again. The new label `nav.outlines` (7 copies) is one new shell row.
5. Appended *Addendum — new strings on `main` at `ee5ddb2a`* before **Result**: 54 rows to review (1 shell row and 53 module rows). No Polish value already in the sheet changed and no sheet key was removed.

## Decisions

- No review result is recorded and AC-N11 stays open: only a native reader can accept the wording (issue "Done when"; owner decision on #603). Recording "accepted" without the owner would invent a review.
- Rows A48/A49 (`training.library.report.open` "Zgłoś", `training.library.report.send` "Wyślij zgłoszenie") are flagged in the addendum: glossary rule 4 keeps "zgłoszenie" for outside booking requests only. The run does not reword them; that is the reviewer's call.
- The script is not committed, as in the first run: a committed tooling script needs 100 % unit coverage, and the addendum is a one-off snapshot keyed by catalog keys.

## Files changed

- `.ai/qa/polish-review-2026-11.md` (addendum section)
- `.ai/runs/2026-11-26-issue-603-polish-review-addendum.md` (this log)

## Commands and results

- `yarn verify`: all 23 steps passed (exit 0), including `glossary:check` and `qa-texts:check`.
- `yarn guard`: no blocking findings (compared with `ee5ddb2a`).
- No integration test was run: the change is documentation only and adds or edits no test.

## Open problems / next steps

- The owner fills in **Change to** (the table and the addendum) and **Result** on the PR.
- Follow-up: apply the marked changes to every copy of a key, run `yarn verify` (`glossary:check`, `qa-texts:check`) and the integration tests that assert changed texts, then tick AC-N11 with the review PR link.
