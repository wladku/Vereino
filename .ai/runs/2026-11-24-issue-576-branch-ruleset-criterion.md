# Run: #576 — ENG-AC-02 amended to the three required checks, ENG-TEST-02 recorded

- **Trigger:** cezar run 8831c8a2 (`om-auto-fix-issue 576`), issue labelled `cezar` on 2026-11-24.
- **Issue:** #576 (epic #565). **Spec:** `.ai/specs/2026-10-21-engineering-standards-and-patterns.md` (ENG-AC-02, ENG-TEST-02, S14.3). **Branch:** `docs/issue-576-branch-ruleset-criterion`.
- **Goal:** apply the owner decision of 2026-11-24 on #576, option (b): amend ENG-AC-02 to the checks required today (`gate`, `integration`, `browser-smoke`, strict, empty bypass list); `pr-title` stays advisory and DCO is not required (CLA of D-035, #648). Make the spec and `docs/ops/github-settings.md` agree, record ENG-TEST-02 from the live ruleset and a pull request with a red required check. No repository setting changed.

## Steps

1. Claimed #576 (assignee, `in-progress`, `🤖` claim comment naming this worktree and branch).
2. Read the live ruleset as the owner (permission `admin`).
3. No open pull request had a red required check (all were green, pending or behind), so opened throwaway probe PR #689 (`test/eng-test-02-red-check-probe`, one commit off `main` adding `packages/core/src/eng-test-02-probe.ts` with a deliberate type error; not a draft, so GitHub reports its merge state; no labels, so the merge train skips it). Read its merge state once `gate` was red, then cancelled the CI run, closed it unmerged and deleted its branch. No merge was attempted.
4. Amended the spec (primary outcome, S14.3, ENG-TEST-02 row, ENG-AC-02 ticked, E1 checklist item (b) ticked), `docs/ops/github-settings.md` (sections 2, 3, 8), the `CONTRIBUTING.md` DCO sentence and the `ci.yml` header comment; added the spec changelog file.

## ENG-TEST-02 evidence (2026-11-24)

Live ruleset `main: merge only when up to date and green`, id 26707580 (`gh api repos/wladku/Vereino/rulesets/26707580`, read as `wladku`, permission `admin`):

```json
{"bypass_actors":[],"conditions":{"ref_name":{"exclude":[],"include":["~DEFAULT_BRANCH"]}},"current_user_can_bypass":"never","enforcement":"active","rules":[{"parameters":{"do_not_enforce_on_create":false,"required_status_checks":[{"context":"gate","integration_id":15368},{"context":"integration","integration_id":15368},{"context":"browser-smoke","integration_id":15368}],"strict_required_status_checks_policy":true},"type":"required_status_checks"}]}
```

`gh api repos/wladku/Vereino/branches/main/protection` → `404 Branch not protected`: the ruleset is the only protection.

Probe PR #689, head `c28c2428`, at 2026-11-24T06:09:51Z (`gh pr view 689 --json mergeStateStatus,mergeable,statusCheckRollup`):

```
PR #689 state=OPEN draft=false head=c28c2428 mergeStateStatus=BLOCKED mergeable=MERGEABLE
  gate=COMPLETED/FAILURE      https://github.com/wladku/Vereino/actions/runs/45336969615/job/138251241760
  integration (shard 1..6)=QUEUED / IN_PROGRESS
  browser-smoke=COMPLETED/SUCCESS
  pr-title=COMPLETED/SUCCESS
```

`gate` annotation: `Type 'string' is not assignable to type 'number'.` The PR had no conflicts (`MERGEABLE`) and was blocked only by its checks; with `bypass_actors: []` and `current_user_can_bypass: never` the administrator cannot merge it either. Closed unmerged: `CLOSED merged=null`.

The "merge succeeds after fixing" half is shown by every merged PR: for example #680 had a red `integration` on `dcd27395` (run 45221011943) and merged at 2026-11-23T18:01Z only after its head `d61098f3` was green.

## Decisions

- **Probe PR, not an admin merge attempt.** This run never merges, and a merge attempt that succeeded would land a failing commit on `main`. The ruleset's empty bypass list plus `current_user_can_bypass: never` for the admin token, together with `BLOCKED`, is the evidence. ENG-TEST-02 is rewritten to match.
- **pr-title and DCO not tested.** They are not required any more (owner decision), so ENG-TEST-02 no longer has a title or sign-off case; ENG-13 is dropped from its requirement ids (ENG-TEST-20 still covers ENG-13).
- **Ruleset is narrower than S1.1.** The live ruleset holds only the status-check rule; S1.1 and section 2 of the settings page also list a pull request requirement, linear history, restricted deletions and a force-push block. Recorded in the settings page as live state; changing settings is outside this issue and the owner's call.

## Files changed

- `.ai/specs/2026-10-21-engineering-standards-and-patterns.md`
- `.ai/specs/changelog/2026-10-21-engineering-standards-and-patterns/2026-11-24-issue-576-eng-ac-02-three-checks.md`
- `docs/ops/github-settings.md`
- `CONTRIBUTING.md`
- `.github/workflows/ci.yml` (header comment only)
- `.ai/runs/2026-11-24-issue-576-branch-ruleset-criterion.md`
- `.ai/lessons/ruleset-check-reads-merge-state-not-a-merge-attempt.md`

## Commands and results

- `yarn verify` — `[verify] all 22 step(s) passed` (exit 0).
- `yarn guard` — no blocking findings; 1 warning (`.github/workflows/ci.yml` agent rule file changed: header comment only).
- `yarn lessons:check` — pass.

## Open problems / next steps

- The owner may want the ruleset to carry the other S1.1 rules (pull request required, linear history, no deletion, no force-push); not done here.
- E1 phase status stays `in_progress` for its other exit-gate items.
