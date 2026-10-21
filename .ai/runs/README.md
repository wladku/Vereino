# AI run logs

One Markdown file per autonomous AI run: any multi-step AI work done without the user steering each step (auto-implement, scheduled or background agents, workflows, side sessions, overnight tasks). Rules: `AGENTS.md` → **Project memory (`.ai/`)**.

## Naming

`YYYY-MM-DD-slug.md` — the date the run started and a kebab-case English slug, e.g. `2026-10-21-payments-phase-4.md`. A second run with the same slug on the same day gets `-2`, `-3`, …

## Template

Copy this skeleton into the new file when the run starts, and complete it before the run ends:

```markdown
# <Run title>

- **Date:** YYYY-MM-DD
- **Agent / tool:** e.g. Claude Code (model), om-auto-implement-spec, scheduled task
- **Trigger:** who or what started the run
- **Spec / issue / branch:** links
- **Status:** in progress | completed | failed | stopped

## Goal

## Steps

1. …

## Decisions

- Decision — reason.

## Files changed

## Commands and results

Commands run (typecheck, tests, build) with their results; failures verbatim.

## Open problems

## Next steps

## Lessons recorded

Links to `.ai/lessons/<slug>.md` records added or updated in this run, or "none".
```
