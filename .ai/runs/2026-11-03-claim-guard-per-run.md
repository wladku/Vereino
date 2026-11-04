# 2026-11-03: the claim protocol owns a claim per run, not per GitHub account

- **Date:** 2026-11-03
- **Agent / tool:** Claude Code (Opus 5.5), coordinator session
- **Trigger:** two sessions built #100 in the same worktree; the product owner asked how to run `/om-auto-fix-issue` without such collisions (also overnight, with Cezar) and answered "Yes, add the guard".
- **Branch:** `chore/claim-guard-per-run`
- **Status:** completed, docs-only PR open for review.

## What happened

The coordinator claimed #100 and its subagent built it in `C:\Users\wkuc\vereino-issue-100`. A fork of the coordinator session, made earlier by the user, inherited the context and picked #100 up as well: it wrote the E06-S18 test, reformatted files and ran `yarn verify` in the same worktree. The external skill treats a claim by the current GitHub user as a re-entry, and every session, subagent, fork and Cezar run acts as `wladku`, so the claim stopped nobody. The subagent noticed when its own write was refused; the user chose to let the fork finish.

## What changed

- `.ai/skills/om-auto-fix-issue/SKILL.md` §5: a claim belongs to the run; the claim comment names the worktree, branch and start time, with progress comments per phase; only the conversation that posted the claim re-enters it (never a fork, a new conversation or another orchestrator run, which ask or use `--force`); a live-work check (processes and recent changes) before writing in a worktree the run did not create; one source of runs (Cezar or by hand, not both).
- `SDLC.md`, *The claim protocol*: the same rule in one paragraph.
- New lesson `claim-belongs-to-the-run-not-the-account`.

## Commands and results

- `yarn format:check` and `yarn lessons:check` pass. Documentation only.

## Open problems

- The rule relies on agents reading their own context (a fork knows it was forked); an orchestrator that hides this needs its own one-run-per-issue queue.
