# Manual QA scenarios for changes merged since 20 November (#569)

- **Date:** 2026-11-22
- **Agent / tool:** Claude Code (Opus 5.5), Cezar run, `om-auto-fix-issue` → `om-auto-qa-scenarios`
- **Trigger:** the `cezar` label on issue #569 (epic #565)
- **Spec / issue / branch:** issue [#569](https://github.com/wladku/Vereino/issues/569); branch `docs/issue-569-manual-qa-scenarios`
- **Status:** completed

## Goal

Run `om-auto-qa-scenarios` for PRs merged since 2026-11-20 and ship the report as a docs PR. Put first the open PRs
that wait for the owner's `qa` label (`risk-high` + `needs-qa`), each with where to tap on the phone, what to check
and what must be seen to pass it.

## Steps

1. Claimed #569 (assignee, `in-progress`, `🤖` claim comment naming this worktree and branch).
2. Enumerated merged PRs with `merged:>=2026-11-20 merged:<=2026-11-22`: 64 PRs (under the 250 limit, one chunk),
   all into `main`. Excluded #473 (the previous run of this report). 12 PRs merged on 20 November already appear in
   `qa-scenarios-2026-11-20` and are only listed in the appendix. That leaves 51 new PRs.
3. Listed open PRs: four carry `risk-high` + `needs-qa` — #530, #506 and #563 from the issue, plus #570, opened
   after the issue was written.
4. Ran four read-only research subagents in parallel with disjoint PR sets: the four open PRs, two E20 UI batches,
   and the privacy, payments-internals and ops PRs. Each read the PRs, the diffs and the `pl.json` catalogs and
   returned scenarios in the format of the previous report. 20 docs, test and CI PRs went to "no manual check
   needed" without research; the ops agent added three more (#457, #542, #543).
5. Edited the drafts by hand: fixed two typos the agents had flagged, set the link-purge scenario to P1, noted that
   staging does not exist yet, and merged related PRs into one scenario each.
6. Built the appendix and the HTML from the same markdown with a throw-away generator outside the repository.
   Self-checks:
   - every PR is in a scenario, in "no manual check", or in "covered in qa-scenarios-2026-11-20";
   - all 128 links resolve on GitHub to the right type (pull vs issue);
   - the HTML has no script, handler, import or remote asset;
   - no trailing whitespace;
   - every quoted „label” in S01–S22 exists in a Polish catalog. The four title templates are composed from
     `club_core.public.documentTitle` and the root layout's `{page} — Vereino`.

## Decisions

- Kept the previous report's structure (Recommended order table, scenario cards, no-check list, unresolved items,
  appendix) so the owner reads both the same way. Scenarios are ordered by priority instead of grouped by role,
  because there are only 22 of them.
- The window starts on 2026-11-20, as the issue asks, so it overlaps the previous report's last day. Those 12 PRs
  are not repeated as scenarios.
- Included #570 in "Waiting for your `qa` label": it meets the issue's criterion even though it is newer than the
  issue's list.
- Labels on the four open PRs come from their diffs, not from `main`, so the catalog check skips that section.

## Files changed

- `.ai/qa/scenarios/qa-scenarios-2026-11-22.md`
- `.ai/qa/scenarios/qa-scenarios-2026-11-22.html`
- `.ai/runs/2026-11-22-issue-569-qa-scenarios-since-20-november.md`

## Commands and results

- `gh pr list --state merged --search "merged:>=2026-11-20 merged:<=2026-11-22" --limit 250` → 64 PRs.
- `gh pr list --state open` → 5 open PRs, 4 with `risk-high` + `needs-qa`.
- Generator → 26 scenario cards (Q1–Q4, S01–S22), 23 no-check PRs, coverage problems: none.
- GraphQL `issueOrPullRequest` over the 128 linked numbers → 0 mismatches.
- Label check → 135 quoted labels; the only 4 not found verbatim are the composed tab titles above.
- `git diff --check` → clean.
- `yarn verify` → see the PR body.

## Open problems

- No staging host exists yet, so Q1 and S18 need a local production build until it does.
- 14 unresolved items are listed in the report (sandbox slugs, platform labels, operator lookups of tenant ids).
- No integration tests were run: the change is documentation only.

## Next steps

- The owner passes Q1–Q4 (adds `qa`), then runs S01–S03.

## Lessons recorded

none
