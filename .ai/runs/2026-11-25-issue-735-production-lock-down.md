# Production lock-down checklist for Railway (#735)

- **Date:** 2026-11-25
- **Agent / tool:** Claude Code (Opus 5.5), `om-auto-fix-issue` with the repo-local override, Cezar run 5846bf7e
- **Trigger:** `cezar` label on issue #735 (E25-S01, epic #734)
- **Spec / issue / branch:** no spec (documentation, route `direct`); #735; `docs/issue-735-lock-down-production-railway`
- **Status:** documentation completed; the owner's first pass on Railway is still open (table below)

## Goal

Write the "Lock down production" checklist in `docs/ops/deploy.md` with the source of each item, point `incident.md`
to the audit log export for investigations longer than 30 days, and prepare the record of the owner's first pass.
Change no Railway setting (an agent holds no Railway access, and must not).

## Steps

1. Claimed #735 (assignee, `in-progress`, `🤖` claim comment naming this run, worktree and branch).
2. Read the epic #734, `docs/ops/deploy.md`, `backups.md`, `incident.md` and the open D-039 PR #725 (Railway Pro;
   its `deploy.md` edits are in the *Environments* section, so the new section was placed after *Per-club jobs* to
   avoid a conflict).
3. Read Railway's documentation on 2026-11-25 (through a web-fetch subagent): PostgreSQL guide, TCP proxy, private
   networking, variables (sealed variables), environments (PR environments), public API (token types), two-factor
   enforcement, audit logs, workspaces and roles.
4. Checked the repository's GitHub Actions secrets by name (`gh secret list`): only `MERGE_TRAIN_TOKEN`; no Railway
   token, which matches L-7.
5. Wrote `deploy.md` → *Lock down production* (items L-1 … L-9, token inventory, audit log export), a step 4 in
   *First deploy of a new environment*, and two pointers in `incident.md`.

## Decisions

- **Sources per item** link the Railway page and give the read date once in the table header.
- **Facts Railway does not state** are written as checks for the owner, not as facts: how a TCP proxy is deleted (the
  docs only describe adding one), and the pagination argument names of `auditLogs` (the docs show `workspaceId` and
  `pageInfo` only). The export command uses `after` and asks the owner to confirm it on the first export.
- **Audit log exports are personal data of the maintainers** (the events identify who acted), so they stay in the
  maintainers' storage for 12 months, never in the repository; a run log records only month, count and place.
- **`TENANT_DATA_ENCRYPTION_FALLBACK_KEY` and the licence keys** are copied to the team password manager before
  sealing: a sealed value cannot be read back, and that key must never change.
- **Workspace members (L-8)** is in the list because D-039 records that every role reaches every project; the
  decision who is a member stays the owner's (D-039 *Not decided here*).
- No Railway token is introduced for the audit export in CI: the export is a manual, monthly owner task, consistent
  with L-7.

## Files changed

- `docs/ops/deploy.md`
- `docs/ops/incident.md`
- `.ai/runs/2026-11-25-issue-735-production-lock-down.md` (this file)

## Commands and results

- `gh secret list --repo wladku/Vereino` → `MERGE_TRAIN_TOKEN` only.
- `yarn verify` → `[verify] all 22 step(s) passed`.

## Owner's first pass (to fill in, without values)

The owner fills this table on the production environment before the first real club data, then commits it (or asks
an agent to commit the filled table). Write **done**, **not applicable** with the reason, or **open** with what is
missing. Names only: never a value, a URL with a password or a token.

| # | Item | Result | Note (names only) | Date |
|---|---|---|---|---|
| L-1 | No public TCP proxy on PostgreSQL and Redis | open | | |
| L-2 | App, worker, backup job reach the databases over `*.railway.internal` | open | | |
| L-3 | Every production secret sealed; fallback key and licence keys copied to the password manager first | open | | |
| L-4 | No secret shared with staging | open | | |
| L-5 | PR environments off for the project | open | | |
| L-6 | Token inventory complete; tokens not on it revoked | open | | |
| L-7 | CI and build agents hold no production Railway token | open (GitHub Actions secrets checked by the agent on 2026-11-25: none) | | |
| L-8 | Workspace members and roles match the owner's decision | open | | |
| L-9 | First audit log export done and stored; pagination arguments confirmed | open | | |

## Open problems

- The owner's first pass (table above); #735 stays open until it is recorded.
- D-039 (PR #725) is not merged yet; this checklist refers to it by number and does not repeat its content.

## Next steps

- Owner: run the checklist on Railway, fill the table, and re-run it after every change of plan, members or services.
- After the first export, correct the `auditLogs` command in `deploy.md` if the argument names differ.
