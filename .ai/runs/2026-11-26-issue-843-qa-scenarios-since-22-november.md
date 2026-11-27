# Manual QA scenarios for changes merged since 22 November (#843)

- **Date:** 2026-11-26
- **Agent / tool:** Claude Code (Opus 5.5), Cezar run, `om-auto-fix-issue` → `om-auto-qa-scenarios`
- **Trigger:** the `cezar` label on issue #843
- **Spec / issue / branch:** issue [#843](https://github.com/wladku/Vereino/issues/843); branch `docs/issue-843-manual-qa-scenarios`
- **Status:** completed

## Goal

Run `om-auto-qa-scenarios` for PRs merged since 2026-11-22 and ship the report as a docs PR. Put first the open PRs
that wait for the owner's `qa` label (`risk-high` + `needs-qa`: #837, #835, #831, #830 and #809), each with the
sandbox preview command, where to tap on the phone and what to check.

## Steps

1. Claimed #843 (assignee, `in-progress`, `🤖` claim comment naming this worktree and branch). The issue was opened
   by the owner.
2. Enumerated merged PRs in four date chunks (22–23, 24, 25, 26 November): 63 + 18 + 33 + 26 = 140 PRs, every
   chunk under the 250 limit, all into `main`. Excluded #574 (the previous run of this report). 17 PRs already appear
   in `qa-scenarios-2026-11-22` (merged on 22 November before it, or open PRs it described) and are only listed in
   the appendix. That leaves 122 new PRs.
3. Listed open PRs. The five named in the issue still carry `risk-high` + `needs-qa`; the label history shows the
   owner added `qa` to all five on 2026-11-26 (12:34–19:28 UTC), while this run was starting. Their sections stay as
   the checklist behind that label. #838 and #839 also carry `needs-qa` but are `risk-medium`, so the train does not
   hold them and they get no section.
4. Wrote the five open-PR sections (Q1–Q5) from each PR's `qa-instruction` block (#835, #830, #809), its description
   (#837, #831, which have no block) and the Polish catalogs on the PR branches (`git fetch origin pull/<n>/head`).
5. Ran four read-only research subagents (Sonnet) in parallel with disjoint PR sets: sign-in and security (14 PRs),
   many clubs and operator (17), activities and training (8), groups, calendar and payments (9). Each read the PRs,
   the diffs and the `pl.json` catalogs and wrote a fragment outside the repository. The other 74 PRs (docs, tests,
   CI, merge train, tooling, one dependency bump) went to "no manual check needed" by title.
6. Edited the drafts: raised the person-data export (#609, `risk-high`) to P0, replaced three labels that were not in
   a catalog („Następny dzień”, „Miejsca: {places}”, a count), and normalised mismatched quotes.
7. Built the report and its HTML from the same markdown with a throw-away generator outside the repository, which
   also renumbers the scenarios S01–S43 by priority and area.

## Decisions

- Kept the previous report's structure (order table, Q and S cards, no-check list, unresolved items, appendix) so the
  owner reads both the same way. Scenarios are grouped by priority, then by area (sign-in, many clubs, activities,
  groups and payments), because there are 43 of them.
- The window starts on 2026-11-22, as the issue asks, so it overlaps the previous report's last day. Those PRs are
  listed, not repeated.
- Each Q section names the preview command from `SDLC.md` ("QA") with the PR number filled in.
- The issue expected about 40 PRs; the window holds 140, most of them docs, test and CI changes. All are in the
  appendix.

## Files changed

- `.ai/qa/scenarios/qa-scenarios-2026-11-26.md`
- `.ai/qa/scenarios/qa-scenarios-2026-11-26.html`
- `.ai/runs/2026-11-26-issue-843-qa-scenarios-since-22-november.md`

## Commands and results

- `gh pr list --state merged --search "merged:<date range>" --limit 250` per chunk → 140 PRs, none truncated.
- `gh pr list --state open` → 10 open PRs; 5 with `risk-high` + `needs-qa` (all five also carry `qa`).
- Generator → 48 cards (Q1–Q5, S01–S43: 14 P0, 23 P1, 6 P2) covering 44 of the 122 new PRs; 78 in "no manual check";
  every new PR in exactly one of the two; 25 unresolved items.
- GraphQL `issueOrPullRequest` over the 260 linked numbers → 0 mismatches (pull vs issue).
- Label check: every quoted „label” in S01–S43 is found in a Polish catalog on `main`; Q1–Q5 labels were checked
  against the PR branches.
- Self-check: links only to `github.com/wladku/Vereino/(pull|issues)/<n>`, no script, handler, import or `src=` in
  the HTML, no trailing whitespace, no diff hunks.
- `yarn verify` → see the PR body.

## Open problems

- 25 unresolved items are listed in the report: where the preview delivers e-mail, the hidden sign-up switch for Q2,
  the rate-limit setting in the sandbox, a second club for the isolation check, some operator command options.
- No integration tests were run: the change is documentation only.
