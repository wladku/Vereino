# Product discovery session and first product brief

- **Date:** 2026-10-21 to 2026-10-23
- **Agent / tool:** Claude Code (Opus 5.5), a side session of the agent-pipeline work. It ran `om-discover` (`--mode own`), `om-setup-discovery-pipeline --refresh` and `om-spec-writing` for one revision, and used two fresh-context reviewer subagents.
- **Sessions started from this one:**
  - "Competitor benchmark for Vereino": its own branch, commits `ea4d3ad`, `3879de6`, `5a1abf1`, not merged here.
  - "Lay out the discovery board in Miro": Miro board only, no repository files.
- **Trigger:** the product owner ran `/om-discover Vereino --mode own`, steered every round, and asked for this commit.
- **Spec / issue / branch:** `.ai/specs/product-brief.md` (new) and `.ai/specs/2026-10-20-vereino-club-management.md` (Draft, revised). Branch `docs/product-discovery`, cut from `chore/discovery-pipeline-setup` (commit `1b14f12`).
- **Status:** completed. Discovery continues with more interviews.

## Goal

Establish the product context that later skills read: who has which problem, the scope decided so far, what is protected, and which beliefs still need evidence. Record it in a brief that is honest about how little outside evidence exists.

## Steps

1. Read the research package, decision records D-001…D-013 and the spec.
   - Finding: no interview with anyone outside the team existed.
   - The decision to frame was agreed as "learn which beliefs behind the decided 1.0 scope hold before treating it as closed".
2. **Interview with the product owner as a guardian**, following `interviews/2026-10-20-script-parent.md`. Note: `interviews/2026-10-23-interview-guardian-founder.md`.
3. **Cross-club view.** The owner proposed a guardian view across several clubs. It was recorded as later (D-014, an accepted agent recommendation).
4. **First draft of the brief.**
   - A skeptic subagent returned 3 CRITICAL and 11 WARNING findings. The agent fixed the source-fidelity errors itself.
   - The owner decided that phase 1 planning waits for the interviews (D-015).
   - Q08 and Q10 were left open.
5. **Interview with a guardian from another club, which uses SportBM**, recorded by the owner (Wispr transcript).
   - Note: `interviews/2026-10-23-interview-guardian-multi-club.md`.
   - Brief refreshed. A second skeptic pass returned 2 CRITICAL and 8 WARNING findings, which were fixed.
   - The guardian's screenshots became `2026-10-23-benchmark-sportbm.md`; the screenshots themselves were not stored because they show children's names.
6. **Brief written** to `.ai/specs/product-brief.md` after the owner's confirmation.
7. **Interview with the academy coordinator.**
   - Questions were prepared in the session; the owner ran the call.
   - Note: `interviews/2026-10-23-interview-coordinator.md`.
   - D-016: grants (N07) and training plans (N01) stay out of 1.0.
8. **Owner correction:** no explicit pay rates in this public repository.
   - Coach pay amounts were removed from the coordinator note.
   - An example match fee was removed from the 2026-09-26 meeting note.
   - Lesson `no-explicit-pay-rates-in-research.md` was added.
9. **`om-setup-discovery-pipeline --refresh`:** already current. The only difference is the Intake row sentence, kept by the owner's choice.
10. **Miro and capture templates.**
    - Miro MCP was connected and the discovery board was laid out by a side session: 10 frames, 189 stickies.
    - Capture templates were written to `research/templates/`.
11. **D-017.** The owner moved REQ-022 (facility maintenance and inspections) from Could to Must.
    - `om-spec-writing` gate questions Q-040…Q-042 were answered by the owner: maintenance blocks the calendar; a separate feature `facilities.maintenance.manage`; usage-hour counting in 1.0.
    - The spec and the brief were revised after the owner approved the diff.
12. **D-018.** The owner accepted a separate discovery track for grant settlement, as a possible separate product. Whether to move the team's energy there stays open (Q13).
13. **`om-discover --refresh`.**
    - The owner approved merging `claude/competitor-benchmark-08a1cc` locally (merge commit `978d747`). It also brought in the `main` commits the branch contained, including the PR #6 installer.
    - The owner's answers: no substitution dispute recalled in the last year; the grant settlement account is left to the administrator.
    - The brief was refreshed with the coordinator interview, the 13-product benchmark, D16 and D18, A10, and Q13–Q16.
    - A skeptic subagent returned 3 CRITICAL and 8 WARNING findings, which were fixed. The owner approved the write.
14. **Maintenance planner (Q-043).** The owner kept the feature instead of a role. The spec now covers a person holding only `facilities.maintenance.manage`:
    - places are assigned per person in `facilities_place_maintainers`;
    - the facility calendar is redacted like the public one;
    - maintenance work is limited to those places;
    - the change adds a roles row and a navigation row, scope, API, UI, DD-36, TEST-050 and AC-022.
    - The owner approved the diff.
15. **Second `om-discover --refresh`.**
    - No new interviews, data or research files since the first refresh; no spec PRs on the tracker.
    - The owner's Q-041 and Q-043 answers (the maintenance planner is a permission, not a role) were recorded as D-019, with a D19 row in the brief.
    - The answers about time and a services company given in the benchmark session were not added; the owner gave no preference.
    - This was a single-row change, so the agent checked it inline, without an independent skeptic pass.

## Decisions and their reasons

- **Interview tag for a co-founder.** The co-founder's account is tagged `[INTERVIEW]`, with its limits stated, because it is a real guardian's own experience. `research/README.md` reserves the tag for people outside the team; the brief says so.
- **Brief readiness.** The brief is ready for research only. Problems and Target group rest on two guardian accounts, one of them a co-founder's; there is no account from coaches or the treasurer.
- **D-007 and D-016 left in place.** Coordinator findings that weaken D-007 (substitution disputes) or touch non-goals (grants, training plans) are recorded as evidence. Only the owner changed decisions: D-016 kept both non-goals, and D-007 is untouched pending the brief refresh.
- **REQ-022 design (DD-36).** Maintenance windows join the single occupancy service, like closures. Usage hours are computed from occupancy data rather than stored, so corrections propagate. The new feature is checked by name, never by role, with a fallback in V-13.

## Files changed

- `.ai/specs/product-brief.md`: new, refreshed on 2026-10-23.
- `.ai/specs/2026-10-20-vereino-club-management.md`:
  - REQ-022 is Must, with a maintenance vocabulary row and slot occupancy;
  - public calendar, roles and features updated, and the J-006 errors;
  - `MaintenanceTask` fields;
  - a complete command, a guard error, an event and the reminder job;
  - TEST-031 rewritten and TEST-049 added; phase 5, traceability, risk and AC-022 updated;
  - Q-014 and Q-040…Q-043, DD-36, V-13, TEST-050, the maintenance planner row and Changelog rows.
- `.ai/specs/research/interviews/2026-10-23-interview-guardian-founder.md`, `…-guardian-multi-club.md`, `…-coordinator.md`: new.
- `.ai/specs/research/interviews/2026-09-26-meeting-wk-kk.md`: pay example removed.
- `.ai/specs/research/decisions/D-014…D-019`: new.
- `.ai/specs/research/2026-10-23-benchmark-sportbm.md`: new.
- `.ai/specs/research/templates/interview-note.md`, `data-request.md`, `benchmark-check.md`: new.
- `.ai/lessons/no-explicit-pay-rates-in-research.md` and one row in `.ai/lessons.md`.
- `.ai/runs/2026-10-23-product-discovery.md`: this log.

## Commands and results

- `yarn format:check`: `29 Vereino file(s), 0 unformatted`.
- `node scripts/check-lessons.mjs`: `Lessons catalog is valid`.
- `claude mcp list`: `miro: https://mcp.miro.com (HTTP) - ✔ Connected`, after the owner's authentication.
- Coverage of the brief after the refresh, recounted by script: `110 claims — 88 sourced (interview 30, data 0, document 53, product 1, benchmark 4), 0 synthetic, 22 assumed`, with 8 collection-plan entries.
- `yarn format:check` after the refresh: `31 Vereino file(s), 0 unformatted`.

## Open problems

- **Lost amount in git history.** The example pay amount removed from the meeting note remains in the history of the public `main`. Rewriting history needs the owner's explicit request.
- **Pending conversations:** the treasurer interview, the second part of the coordinator interview, two more guardian interviews, and the 4-week declaration count.
- **Open questions in the brief:** Q01–Q10 and Q12–Q16 remain open.

## Next steps

- After the next interviews, run `/om-discover --refresh`. That refresh brings in the treasurer note and the second coordinator conversation, and revisits D-007 (A05), REQ-021 (Q14) and REQ-030 against the evidence.
- Push and open a pull request only on the owner's request. This branch is cut from `chore/discovery-pipeline-setup` and now also contains the merged benchmark branch.
