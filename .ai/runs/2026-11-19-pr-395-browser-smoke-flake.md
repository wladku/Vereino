# PR #395: browser-smoke failure triage and main merge

- **Date:** 2026-11-19
- **Agent / tool:** Claude Code (Opus 5.5), om-auto-fix-pr (CI stabilization), cezar task
- **Trigger:** cezar task: required check `browser-smoke` concluded FAILURE on #395
- **Spec / issue / branch:** PR #395 (no issue), branch `chore/di-reaches-no-command-file`
- **Status:** completed

## Goal

Get the required `browser-smoke` check green on #395 and bring the branch up to date with `main`, without force-pushing or rewriting history.

## Steps

1. Read the failed job (run 44408367363, job 135169557417). The ephemeral app reported ready, then `login-smoke.mjs` failed at `wait --url **/backend**`: `agent-browser wait failed (exit 1): ✗ Wait timed out after 25000ms`. The screenshot shows the filled login form, still on `/login`.
2. Compared it with other runs. The same base (`e6a95fde`) passed `browser-smoke` on `main` (run 44412236645) and on four sibling PR runs started within minutes of this one.
3. Merged `origin/main` (`d6304d82`, #399: six integration shards) into the branch on a detached HEAD.
4. Ran `yarn di-commands:check`: `8 di.ts file(s), 0 problem(s)`.
5. Pushed with `git push origin HEAD:chore/di-reaches-no-command-file`. The push starts a fresh CI run.

## Decisions

- Treated the failure as a flake, not a defect: #395 changes only tooling (`scripts/verify.mjs`, `packages/app/scripts/vereino-di-commands.mjs` and its test, `package.json` scripts, AGENTS.md, a lesson). The app it builds and serves is the same as on `main`, where the smoke passes.
- No code change and no test change. The smoke script was left as is: one timeout on a CI runner does not justify a longer wait.

## Files changed

- `.ai/runs/2026-11-19-pr-395-browser-smoke-flake.md` (this log)
- merge of `origin/main` (`.github/workflows/ci.yml` from #399)

## Open problems

- If `browser-smoke` times out again on sign-in, look into the `/login` → `/backend` redirect latency on cold CI runners as a separate issue.
