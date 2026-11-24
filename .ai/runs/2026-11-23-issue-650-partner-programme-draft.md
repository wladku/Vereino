# Run: partner programme draft (E23-S04, #650)

- **Goal and trigger:** Cezar run of `om-auto-fix-issue 650` (label `cezar` added 2026-11-23). Draft the partner
  programme in `docs/partners/` from D-035 point 6 for the owner and the lawyer.
- **Issue / epic / branch:** #650, epic E23 #646, `docs/issue-650-partner-programme-draft-tiers`.
- **Route:** `direct` (docs only, no spec; the issue is the brief, D-035 the source). Prerequisite #630 is merged
  (`4180f80d`), so the certification builds on the real onboarding runbook `docs/ops/clubs.md`.

## Steps

1. Claimed #650 (assignee, `in-progress`, `🤖` claim comment naming this run's worktree and branch).
2. Read D-035, D-034/D-036 (cloud, one tenant per club, `vereino.org` addresses), the onboarding runbook
   `docs/ops/clubs.md`, the support objective in `docs/ops/incident.md`, the business case and epic #646.
3. Wrote `docs/partners/`: `README.md` (overview, what D-035 fixes, the list of open owner decisions PD-01…PD-14),
   `tiers.md`, `certification.md`, `working-rules.md`, `trademark.md`, `agreement-outline.md`.
4. Checked every relative link in the folder resolves.

## Decisions

- Every open number is an owner decision with an id (`PD-…`) and listed once in the README, so the owner can answer
  them in one place; D-035's "about 20–25 %" is shown as the direction for PD-01, not as a term.
- Partners do not run `club_core create-club`: the runbook runs it on the production shell, which only Vereino's
  operators reach. Partners request the club and do the runbook's steps 4–5 in the club's panel.
- Until PD-11 (reselling) and PD-12 (closed partner modules) are decided, the drafts take the conservative default:
  the club pays Vereino directly; partner modules on the cloud are contributed upstream under the CLA.
- Lead data and its retention are flagged for the compliance pack rather than decided here.

## Files changed

- `docs/partners/README.md`, `tiers.md`, `certification.md`, `working-rules.md`, `trademark.md`,
  `agreement-outline.md` (new)
- `.ai/runs/2026-11-23-issue-650-partner-programme-draft.md` (this log)

## Commands and results

- `yarn guard`: no blocking findings.
- `yarn verify`: all 21 steps passed (exit 0).
- Relative-link check over `docs/partners/*.md`: every link resolves.
- No integration tests: docs only, no code or test files changed.

## Open problems / next steps

- The owner answers PD-01…PD-14; the lawyer writes the agreement from `agreement-outline.md` (questions listed there).
- Lead handling needs a contact form on `vereino.org` and a retention entry for lead data when the site is built.
