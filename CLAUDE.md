@AGENTS.md

## Claude Code

All rules live in `AGENTS.md` (imported above); this file only adds what is specific to Claude Code.

- The **Project memory (`.ai/`)** section of `AGENTS.md` is mandatory for Claude Code sessions too:
  - specs in `.ai/specs/YYYY-MM-DD-slug.md`, moved to `.ai/specs/implemented/` or `.ai/specs/archive/` when their status changes;
  - a run log `.ai/runs/YYYY-MM-DD-slug.md` for every autonomous run (background agents, workflows, side sessions, scheduled tasks, unattended implementation);
  - lessons in `.ai/lessons/<slug>.md` + one row in `.ai/lessons.md`.
- Claude's own auto-memory is private to one machine; anything another agent or teammate needs goes into `.ai/lessons/` instead.
- A Claude session that starts subagents or side sessions for one task keeps one run log for the whole task and adds each delegated piece as a step.
- Repository language is English (see `AGENTS.md`), even when the conversation with the user is in another language.
