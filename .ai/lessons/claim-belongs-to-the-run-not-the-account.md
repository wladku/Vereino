---
title: "A claim belongs to the run that made it: a fork or a second session of the same account must not re-enter it"
modules: ["platform"]
areas: ["ai-workflow"]
topics: ["claim-protocol", "parallel-agents", "forks", "worktrees", "orchestration"]
---

# A claim belongs to the run that made it: a fork or a second session of the same account must not re-enter it

**Context**: On 2026-11-03 the coordinator session claimed #100 and a subagent started building it in `C:\Users\wkuc\vereino-issue-100`. The user had forked the coordinator session earlier; the fork inherited the context, picked #100 up as well, wrote a test and ran `yarn verify` in the same worktree while the subagent was still writing there.

**Problem**: The external `om-auto-fix-issue` step 1 treats a claim by the current GitHub user as a re-entry. Every session, subagent, fork and orchestrated run here acts as the same user (`wladku`), so the three-signal claim (assignee, `in-progress`, `🤖` comment) stopped nobody. The subagent noticed only because its own write was refused and files changed under it.

**Rule**: Own a claim per run: the claim comment names the worktree, branch and start time; only the conversation that posted it re-enters, never a fork, a new conversation or another orchestrator run, which ask or use `--force`. Before writing in a worktree the run did not create, check for live processes in that path and for recent changes it did not make. One issue, one run, one worktree, one source of runs (`.ai/skills/om-auto-fix-issue/SKILL.md` §5, `SDLC.md` claim protocol).

**Applies to**: every autonomous run in this repository — desktop sessions, their forks and subagents, and Cezar runs.
