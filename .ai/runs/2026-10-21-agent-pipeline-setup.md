# Agent PR pipeline setup refresh

- **Date:** 2026-10-21
- **Agent / tool:** Claude Code (Opus 5.5) via `om-setup-agent-pipeline` and `om-open-pr`; two read-only drafting subagents
- **Trigger:** product owner ran `/om-setup-agent-pipeline`, then asked to enable labels, fix the stale pointers and overrides, and open a PR (`/om-open-pr commit and push current changes as a new pr`)
- **Spec / issue / branch:** no spec (process configuration); branch `chore/agent-pipeline-setup`, stacked on `build/e1-gate-and-ci` (PR #3)
- **Status:** completed

## Goal

Bring `.ai/agentic.config.json` up to the current `om-setup-agent-pipeline` schema, turn on the label workflow, add the missing process documents, and make the repo-local `om-auto-*` overrides describe this monorepo and the `yarn verify` gate.

## Steps

1. Existing config shown and kept; the product owner chose to add `browser.provider` (`agent-browser`, which CI already uses), the `engine` block with defaults, and the missing `.ai/analysis`, `.ai/scripts`, `.ai/qa` directories.
2. `.ai/trackers/github.md` kept as is: it is a superset of the shipped descriptor (`ci-monitoring`, session-share publishing, issue-state filter).
3. Labels: first kept disabled, then the product owner asked to enable them ("Chcę jednak włączyć etykiety") and approved creating the 26 missing labels on GitHub ("Utwórz wszystkie 26"), including `do-not-close` and `screenshots` (`c5def5`, "PR carries UI screenshots as evidence"). QA gate stays off ("Zostaw wyłączony").
4. `SDLC.md` generated from the skill template; `CODE_REVIEW.md` and `BACKWARD_COMPATIBILITY.md` drafted by read-only subagents from `AGENTS.md`, the engineering standards spec, `scripts/verify.mjs`, CI and the module checklist, then reviewed and approved by the product owner ("Zapisz wszystkie trzy").
5. Bare `TODO:` markers in the drafts replaced with `**Gap:**`, because S1.6 forbids `TODO` without an issue link.
6. On request: `AGENTS.md` contract rule now points to the root `BACKWARD_COMPATIBILITY.md` as well as the upstream file; the overrides `om-auto-create-pr`, `om-auto-continue-pr`, `om-auto-fix-issue`, `om-auto-review-pr` rewritten for the monorepo layout, enabled labels and `yarn verify`.
7. PR base: the documents reference E1 artefacts not yet on `main`, so the product owner chose a branch stacked on `build/e1-gate-and-ci` ("Stos na E1").

## Decisions

- Keep the extended tracker descriptor instead of refreshing it — refreshing would drop repo-specific operations.
- `CODE_REVIEW.md` complements `.ai/review-checklist.md` instead of repeating it.
- `BACKWARD_COMPATIBILITY.md` uses three protection tiers (now / first deployment / release), because the project is pre-release with no Vereino module yet.

## Files changed

- `.ai/agentic.config.json` — `browser`, `engine`, `labels.enabled: true`
- `.ai/browsers/agent-browser.md` — browser descriptor copied from the skill
- `.ai/analysis/.gitkeep`, `.ai/scripts/.gitkeep`, `.ai/qa/.gitkeep`
- `SDLC.md`, `CODE_REVIEW.md`, `BACKWARD_COMPATIBILITY.md` — new
- `AGENTS.md` — contract-surface pointer
- `.ai/skills/om-auto-{create-pr,continue-pr,fix-issue,review-pr}/SKILL.md` — monorepo overrides

## Commands and results

- Cross-skill coverage check (`om-setup-agent-pipeline` `references/skill-coverage.md`) on `.claude/skills` and `.agents/skills`: `SKILL_COVERAGE_OK` for both.
- `node scripts/check-lessons.mjs`: "Lessons catalog is valid".
- `gh label create` ×26: all created.
- `yarn verify` not run locally: the change is Markdown and JSON configuration that no gate step covers; CI runs the full gate on the PR.

## Open problems

- `.ai/harness/manifest.json` pins the four overrides by SHA-256 with `userEditable: false`; an Open Mercato upgrade may overwrite them with the shipped versions.
- The `om-auto-implement-spec` override still says "standalone"; its rules remain valid, so it was left unchanged.
- `**Gap:**` items in `CODE_REVIEW.md` (3) and `BACKWARD_COMPATIBILITY.md` (9) have no issues yet.
- After PR #3 is squash-merged, this branch needs a rebase onto `main`.

## Next steps

- Review and merge after PR #3; rebase onto `main` then.

## Lessons recorded

none
