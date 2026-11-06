# One PR into `main` at a time: a ruleset on `main` and serial Cezar runs

- **Date:** 2026-11-06
- **Agent / tool:** Claude Code (Opus 5.5), coordinator session
- **Trigger:** the owner asked that PRs stop landing together, after #149/#150 broke `main` and #166, #176, #177, #182, #183, #190 and #197 needed follow-up runs for conflicts or red CI.
- **Branch:** `docs/main-merge-one-at-a-time`, from `main`
- **Status:** completed, PR open for review.

## Goal

A PR merges into `main` only after its CI passed on the current `main`, and fewer PRs are open at once.

## Findings

- Cezar ran up to two issues at once (`resources.maxParallel: 2` in `~/.cezar/config.json`), and the queue was fed several issues in a row (for example #87, #84, #83 and #86 within 25 minutes on 2026-11-04). Each run branched from `main` at its start.
- `main` had no branch protection and no ruleset, so a PR whose CI was green on an older `main` could be merged. Two PRs each green alone broke `main` together (#149 + #150), and later PRs conflicted with `main`.
- Nearly every PR touches the same files: `.ai/lessons.md` (a sorted catalog), spec changelogs, `packages/app/src/modules.ts`.
- Creating PRs by hand would not help: the problem is when they merge, not who opens them. The pipeline config (`.ai/agentic.config.json`, the repo-local `om-auto-fix-issue` override) was otherwise consistent.

## Changes (owner approved, "Yes, both")

1. GitHub ruleset 26707580 on the default branch, "main: merge only when up to date and green": required status checks `gate`, `integration`, `browser-smoke` (GitHub Actions), strict (the branch must be up to date with `main`). No bypass actors. The repository is public, so rulesets are available on the free plan; a merge queue is not (user-owned repository).
2. Cezar `resources.maxParallel` 2 → 1 in `C:\Users\wkuc\.cezar\config.json` (backup `config.json.before-maxparallel-1`). Two runs were in progress at the time; the setting may need a Cezar restart to apply.
3. `SDLC.md`, *Validation gate*: the one-PR-at-a-time rule.

## Commands and results

- `gh api repos/wladku/Vereino/rules/branches/main`: `required_status_checks strict=true gate,integration,browser-smoke`.
- Open PRs at the time: #197 and #190, both conflicting with `main`.

## Open problems

- Each merge now waits for one CI run (about 30 minutes) on the updated branch.
- Docs-only PRs also need `integration` to pass.
