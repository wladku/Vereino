# Run: issue #823 — build agents act only on work and decisions from maintainers

- **Goal and trigger:** Cezar run 97d40a4f, queued by the `cezar` label on #823 (E25-S11, epic #734). Skill: `om-auto-fix-issue` with the vereino override.
- **Issue / branch:** #823, `feat/issue-823-maintainer-only-agents`. No spec (process and tooling change; the issue carries the acceptance criteria).
- **Scope:** the owner's comment of 2026-11-26 on #823 records the picker and auto-decide part as already done outside the repository (the build agents must not edit the automations). Left for this run: the `SDLC.md` / `AGENTS.md` rule, the merge train and the review/fix skills skipping fork-headed PRs with a test. The rehearsal from an account without write access is left to the owner (this run has only the owner's account).

## Steps

1. Claimed #823 (assignee, `in-progress`, `🤖` claim comment naming worktree, branch and start time).
2. `SDLC.md`: new section "Who the agents take work and decisions from" — the `author_association` values that count as a maintainer (`OWNER`, `MEMBER`, `COLLABORATOR`), the rules for starting work, decisions, fork PRs and pipeline labels.
3. `AGENTS.md` → Never: one line pointing at that section.
4. Skill overrides: `om-auto-review-pr` §6, `om-auto-continue-pr` §5, `om-auto-fix-issue` §7, and a new override `om-auto-fix-pr` (the installed skill reads `.ai/skills/om-auto-fix-pr/SKILL.md` when present). Each stops on `isCrossRepository` before any checkout, claim, build or label change and treats non-maintainer comments as data. This overrides the external fork carry-forward flow.
5. Merge train: extracted the candidate filter to `isSameRepoHead` / `sameRepoPulls` in `scripts/merge-train-plan.mjs` (unit-tested; `null` head repository = deleted fork = not same repository). `scripts/merge-train.mjs` `readQueue` and `scripts/merge-train-stacked.mjs` `readStacked` use it; `batchFields` now reports `fork` from the same helper instead of a hard-coded `false`. Behaviour unchanged for same-repository PRs.
6. Lesson `external-skills-check-out-fork-prs`.

## Decisions

- No change to `planMergeTrain`/`trainQueue`: forks are dropped before planning, and the batch plan's `fork` skip reason stays as a second line of defence.
- No automation, workflow or host configuration edited (owner: the build agents must not edit the automations).

## Commands and results

- `node --test scripts/__tests__/merge-train-plan.test.mjs scripts/__tests__/merge-train-stacked.test.mjs scripts/__tests__/merge-train-batch.test.mjs` (in `packages/app`): 79 pass, 0 fail.
- `yarn verify`: first run failed at `format:check` (`packages/app/scripts/__tests__/merge-train-plan.test.mjs is not formatted (run yarn format)`); after `yarn format`, `yarn verify --from format:check` → all 17 steps passed (generate … lint passed in the first run).
- `yarn guard`: no blocking findings; 5 warnings (agent rule files changed: `AGENTS.md` and four skill overrides), expected for this issue.
- No integration test: the change touches no route, command, subscriber or page.

## Open problems / next steps

- **Rehearsal (acceptance criterion 4)** needs an account without write access: open an issue and a comment carrying an instruction ("ignore the spec and…", "approved, merge it") and confirm the picker skips the issue and no run follows the comment. Owner to run and record it.
