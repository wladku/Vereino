# Product discovery layer setup

- **Date:** 2026-10-21
- **Agent / tool:** Claude Code (Opus 5.5) side session via `om-setup-discovery-pipeline`
- **Trigger:** a parent Claude Code session started this side session to run `/om-setup-discovery-pipeline`; the product owner answered the questions and asked for a signed-off commit on a new branch, without push
- **Spec / issue / branch:** no spec (process configuration); branch `chore/discovery-pipeline-setup`, stacked on `chore/agent-pipeline-setup` (PR #4, which carries the generated `SDLC.md`)
- **Status:** completed

## Goal

Add the product layer to the agent pipeline: the `discovery` config block, the Discovery stage, Definition of Ready, the Product owner role and protected product decisions in `SDLC.md`, and an agent routing pointer.

## Steps

1. Checked the branch: `chore/agent-pipeline-setup` has the generated `SDLC.md`, `.ai/agentic.config.json` and `.ai/trackers/github.md`; no `discovery` block existed yet.
2. Asked the product owner:
   - Domain expert: "Nie (domyślnie)".
   - Designer: "Nie (domyślnie)".
   - Intake spec-gate sentence: "Zachować (zalecane)".
   - `AGENTS.md` pointer: "Krótki akapit (zalecane)".
3. Rendered the template blocks into a scratch copy, showed the full diff and the plain-words summary, then wrote the files after "Tak, zapisz".
4. Ran the format, lessons and harness checks (below).

## Decisions

- The "Before intake, the work is shaped" paragraph does not exist in this `SDLC.md`, so the before-intake block went after the last *Purpose* paragraph (the skill's fallback anchor).
- The delivery-only Intake row was replaced by the Discovery and Intake pair. The repository's spec-gate sentence ("New capability, schema, API contract or multi-phase work goes through a spec…") was appended to the new Intake row so the team's prose survives. A later `--refresh` will therefore treat that row as team-edited.
- `AGENTS.md` has no `| When the task involves… |` table, so the skill would add nothing there. The product owner chose one marked paragraph under the Axis 3 table instead of a new route row, which keeps the harness route IDs unchanged.
- `.ai/specs/research/` already existed and was tracked (including `decisions/` D-001…D-013), so no `.gitkeep` was added.

## Files changed

- `.ai/agentic.config.json` — `discovery: { enabled: true, roles: { domainExpert: false, designer: false } }`
- `SDLC.md`:
  - before-intake paragraph;
  - Product owner role;
  - Discovery and Intake rows;
  - *Definition of Ready* and *Product decisions as a protected contract*;
  - amending paragraph.
- `AGENTS.md` — `discovery:routing` paragraph after the Axis 3 table
- `.ai/runs/2026-10-21-discovery-pipeline-setup.md` — this log

## Commands and results

- Product-skill coverage: `om-discover`, `om-synthetic-users`, `om-backlog` and `om-mockup-prototype` are present in `.claude/skills`.
- `node -e JSON.parse` on the config: valid.
- `yarn format:check`: `29 Vereino file(s), 0 unformatted`.
- `yarn lessons:check`: `Lessons catalog is valid`.
- `node scripts/evaluate-agent-harness.mjs` (deterministic), run with and without the `AGENTS.md` change:
  - `Deterministic: 57/237 selected cases passed` both times, with an identical pass/fail set.
  - The 180 failures already existed before this change: missing `.ai/guides/modules/*` facts, a missing example root, unreadable installed sources, and `maxInitialContextBytes` overruns.
  - The new paragraph adds about 300 bytes to each case's initial context.

## Open problems

- The deterministic harness fails 180/237 cases on this branch independently of this change, and `AGENTS.md` initial context is already over several case budgets.

## Next steps

- `/om-discover`: write `.ai/specs/product-brief.md` from the existing `research/` material and decision records.
