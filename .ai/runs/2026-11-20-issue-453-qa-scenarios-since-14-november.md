# Manual QA scenarios for everything merged since 14 November (#453)

- **Date:** 2026-11-20
- **Agent / tool:** Claude Code (Opus 5.5), Cezar run, `om-auto-fix-issue` → `om-auto-qa-scenarios`
- **Trigger:** the `cezar` label on issue #453 (E17-S02)
- **Spec / issue / branch:** issue [#453](https://github.com/wladku/Vereino/issues/453), epic #444; branch `docs/issue-453-manual-qa-scenarios-since-14-november`
- **Status:** completed

## Goal

Give the owner a manual QA scenarios report for every PR merged since 2026-11-14: grouped by role, P0/P1/P2 per
scenario, each with route, steps, what to verify, what can go wrong, PR and story id; UI names as the Polish catalogs
show them; markdown + HTML under the configured `paths.qa`; docs PR only.

## Steps

1. Claimed #453 (assignee, `in-progress`, `🤖` claim comment naming this worktree and branch).
2. Enumerated merged PRs with `merged:>=2026-11-14` in three date chunks (29 + 37 + 41 = 107, every chunk under the
   250 limit, all into `main`, none excluded) and the 93 issues closed since 2026-11-14. Every closed story is a
   closing reference of at least one PR; the only unreferenced ones are the epics (E06–E14) and #193 (CI sharding).
3. Split the 82 PRs with possible user-visible change into five domain groups (navigation and people, groups and
   sessions, facilities, payments, club events) and ran one read-only research subagent per group. Each read the
   PRs, the stories' acceptance criteria, the changed pages and the `pl.json` catalogs, and returned structured
   scenarios with the catalog key of every quoted label. The other 25 PRs (docs, tests, CI) went to
   "no manual check needed" without research.
4. Built both artifacts from the same data with a throw-away generator outside the repository, which also checked:
   every quoted „label” exists in a Polish catalog (module catalogs plus `packages/app/src/i18n/pl.json`; values with
   `{placeholders}` match a filled-in label), every PR is in a scenario or in "no manual check", every closed issue
   maps to a scenario (or is an epic / a no-check PR), links point only to tracker URLs, no scripts or remote assets.
5. Wrote `.ai/qa/scenarios/qa-scenarios-2026-11-20.md` and `.html`, ran the gate, opened the docs PR.

## Decisions

- Location `.ai/qa/scenarios/` — `.ai/agentic.config.json` sets `paths.qa` to `.ai/qa` (the repository root, where
  `.ai/qa/.gitkeep` waits for it); the issue's `packages/app/.ai/qa/` holds the integration tests. The config is
  authoritative for the pipeline and the next `om-auto-qa-scenarios` run will write to the same folder.
- Grouped by role instead of the skill's default testing areas — the issue asks for roles (administrator on the
  desktop; coordinator, coach, guardian, attendant on the phone).
- Priority per scenario from the PRs' `priority-*` labels (high → P0, medium → P1, low → P2), raised to P0 when the
  journey moves money, deletes or anonymises personal data, or changes access. Result: 50 P0, 22 P1, 3 P2.
- 28 PRs listed as "no manual check needed" (25 docs/test/CI PRs, the refactor #409 and the scheduler-only fixes #417
  and #419), as the issue's negative acceptance criterion asks.
- Labels the research could not tie to a catalog key (platform toasts, undo controls, English-only dashboard widget
  titles) are listed under "Unresolved items" instead of being guessed.

## Files changed

- `.ai/qa/scenarios/qa-scenarios-2026-11-20.md`
- `.ai/qa/scenarios/qa-scenarios-2026-11-20.html`
- `.ai/runs/2026-11-20-issue-453-qa-scenarios-since-14-november.md`

## Commands and results

- `gh pr list --state merged --search "merged:<chunk>" --limit 250` ×3 → 29, 37, 41 PRs (107 unique).
- Generator self-check → 75 scenarios, 28 no-check PRs, 93 closed issues mapped, 0 catalog or coverage problems.
- `git diff --check` → clean.
- `yarn verify` → see the PR body.

## Open problems

- S16: the people catalog says a re-sent invitation link is valid for 60 minutes, while story E13-S01 says 48 hours —
  worth confirming while testing.
- The payments dashboard widget titles (S43) have no Polish catalog key; they show in English in the Polish UI.
- No integration tests were run: the change is documentation only.

## Next steps

- The owner runs the P0 scenarios first and files an issue for each finding.

## Lessons recorded

none
