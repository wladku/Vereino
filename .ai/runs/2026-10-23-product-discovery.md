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

## Decisions and their reasons

- **Interview tag for a co-founder.** The co-founder's account is tagged `[INTERVIEW]`, with its limits stated, because it is a real guardian's own experience. `research/README.md` reserves the tag for people outside the team; the brief says so.
- **Brief readiness.** The brief is ready for research only. Problems and Target group rest on two guardian accounts, one of them a co-founder's; there is no account from coaches or the treasurer.
- **D-007 and D-016 left in place.** Coordinator findings that weaken D-007 (substitution disputes) or touch non-goals (grants, training plans) are recorded as evidence. Only the owner changed decisions: D-016 kept both non-goals, and D-007 is untouched pending the brief refresh.
- **REQ-022 design (DD-36).** Maintenance windows join the single occupancy service, like closures. Usage hours are computed from occupancy data rather than stored, so corrections propagate. The new feature is checked by name, never by role, with a fallback in V-13.

## Files changed

- `.ai/specs/product-brief.md`: new.
- `.ai/specs/2026-10-20-vereino-club-management.md`:
  - REQ-022 is Must, with a maintenance vocabulary row and slot occupancy;
  - public calendar, roles and features updated, and the J-006 errors;
  - `MaintenanceTask` fields;
  - a complete command, a guard error, an event and the reminder job;
  - TEST-031 rewritten and TEST-049 added; phase 5, traceability, risk and AC-022 updated;
  - Q-014 and Q-040…Q-042, DD-36, V-13 and a Changelog row.
- `.ai/specs/research/interviews/2026-10-23-interview-guardian-founder.md`, `…-guardian-multi-club.md`, `…-coordinator.md`: new.
- `.ai/specs/research/interviews/2026-09-26-meeting-wk-kk.md`: pay example removed.
- `.ai/specs/research/decisions/D-014…D-017`: new.
- `.ai/specs/research/2026-10-23-benchmark-sportbm.md`: new.
- `.ai/specs/research/templates/interview-note.md`, `data-request.md`, `benchmark-check.md`: new.
- `.ai/lessons/no-explicit-pay-rates-in-research.md` and one row in `.ai/lessons.md`.
- `.ai/runs/2026-10-23-product-discovery.md`: this log.

## Commands and results

- `yarn format:check`: `29 Vereino file(s), 0 unformatted`.
- `node scripts/check-lessons.mjs`: `Lessons catalog is valid`.
- `claude mcp list`: `miro: https://mcp.miro.com (HTTP) - ✔ Connected`, after the owner's authentication.
- Coverage of the brief, recounted by script: `94 claims — 75 sourced (interview 21, data 0, document 50, product 1, benchmark 3), 0 synthetic, 19 assumed`, with 6 collection-plan entries.

## Open problems

- **Lost amount in git history.** The example pay amount removed from the meeting note remains in the history of the public `main`. Rewriting history needs the owner's explicit request.
- **Pending conversations:** the treasurer interview, the second part of the coordinator interview, two more guardian interviews, and the 4-week declaration count.
- **Open questions in the brief:** Q01, Q02, Q03, Q04, Q05, Q06, Q07, Q08, Q09, Q10 and Q12 remain open.
- **Benchmark not merged.** The competitor benchmark and the revised business case live on the side session's branch `claude/competitor-benchmark-08a1cc`. They are not merged here, and the brief does not yet cite them.
- **Coordinator findings not yet in the brief.** They are in the interview note and partly in D-016/D-017. The brief takes them in at its next refresh, as the owner decided.

## Next steps

- After the next interviews, run `/om-discover --refresh`. That refresh brings in the coordinator note, the treasurer note and the benchmark branch, and revisits D-007, REQ-021 and REQ-030 against the evidence.
- Push and open a pull request only on the owner's request. This branch is stacked on `chore/discovery-pipeline-setup`.
