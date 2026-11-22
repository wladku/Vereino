# Run log — issue #568: spec close-out III (open acceptance criteria vs. code, gaps filed)

- **Trigger:** Cezar run (label `cezar` on #568), skill `om-auto-fix-issue` with the repo-local override.
- **Issue:** #568 (epic #565). **Branch:** `docs/issue-568-spec-close-out-gaps`.
- **Goal:** for every unticked acceptance criterion in the `In progress` specs (club management, foundation, scheduling, people life cycle, navigation, events with parts, payments, facilities, messaging, engineering standards), tick it with evidence (merged PR + passing test) or file one issue per real gap (`Epic: #565`). Move a spec to `implemented/` when all criteria are ticked. Documentation only.

## Steps

1. Claimed #568 (assignee, `in-progress`, `🤖` claim comment naming this worktree and branch).
2. Inventory: 58 unticked criteria in 11 specs (`grep '^\s*- \[ \]'`); Draft specs (person data export, social sign-in, reference module activation) and the template are out of scope; merge throughput and batch train have no unticked boxes.
3. Four read-only subagents audited disjoint spec groups (engineering standards; foundation + scheduling + messaging; club management + club payments + parity payments + parity facilities; people life cycle + navigation + club events): merged PRs (`gh pr list --state merged --search …`), the tests under `packages/app/.ai/qa/tests/` opened to match assertions, unit tests, `yarn verify --list`, CI workflows, live GitHub settings.
4. Coordinator spot-checks: cited tests exist (`ISSUE-525-dead-link-purge`, `TEST-088-payments-invariants`, `TEST-N01`, `TEST-N03`, `vereino-lint.test.mjs`, `vereino-contracts.test.mjs`); PRs #541, #555, #513 merged; `facilities/lib/reschedule-notice.ts` still builds the fallback link; `fitsAgeCategory` has no caller; the club spec line references behind AC-G08/AC-M11.
5. Filed 33 gap issues #575–#607 (`om-prepare-issue` template, `Epic: #565`, category + priority + risk, label rationale in the body; dedupe against the 23 open issues). Owner decisions are labelled `question` and ask in the issue. No issue carries `cezar`: the owner queues the agent-buildable ones.
6. Edited every open criterion: ticked with evidence, or ` — gap: #N` appended (`; gap: #N` after an existing "partial evidence" note). One changelog file per spec.
7. Messaging primitives: every criterion ticked and every phase Done → `Status: Implemented`, `git mv` to `implemented/`, references rewritten (`git grep` finds only the new path).

## Result per spec

| Spec | Ticked now | Open → issue |
|---|---|---|
| engineering standards | ENG-AC-04, backend-surface (N/A) | (b) #576/#582, AC-01 #575, AC-02 #576, AC-03 #577, AC-05 #578, AC-07 #579, AC-08 #460, AC-09 #460/#580, AC-10 #463/#557/#460, AC-11 #461, AC-12 #581, AC-14 #582, coverage (closes with these) |
| foundation primitives | — | F02 #583, F04/F11 #584, F08 #585, F13 #586, F14 #587, generic (close with these) |
| scheduling primitives | AC-G07, AC-G08 (verified by reading) | G02 #588/#589, G03 #590, G05 #591, coverage |
| messaging primitives | AC-M11 (verified by reading) | — → **Implemented**, moved |
| club management | AC-042, AC-043 | AC-004 #592, AC-039 #593, AC-040 #566/#567, AC-041 #471, generic |
| club payments | — | AC-012 #594 |
| parity payments | — | AC-C10/C12 #595 |
| parity facilities | — | AC-R05 #596, AC-R14 #597 |
| people life cycle | — | L05 #598, L06 #599, L07 #600, L15 #433, L16 #601/#545, generic |
| parity navigation | AC-N16, UI-states | AC-N01 #602, AC-N11 #603, coverage; stale docs #604 |
| club events with parts | — | T01 #605, T04 #606, T11 #607 |

## Decisions

- Strict ticking as in #452: partial proof stays unticked and is linked to the issue that closes the missing part.
- Design/documentation criteria (AC-G07, AC-G08, AC-M11, AC-N16) ticked as "verified by reading" with the files read; the stale facts AC-N16's documents share went to #604 instead of blocking the tick.
- Generic criteria ("integration coverage", "all UI states") are not separate issues; their line names the issues they close with.
- `cezar` not applied to any filed issue: queuing ~20 autonomous runs is the owner's call.

## Open problems / next steps (for the owner)

- `release.yml` fails on every run until "Allow GitHub Actions to create and approve pull requests" is on (#581).
- Owner decisions: #576, #579, #581, #584, #587, #588, #591, #593, #594, #603 (and the Windows half of #578).
- Agent-buildable, ready to queue: #575, #577, #580, #582, #583, #585, #586, #589, #590, #592, #595–#602, #604–#607.
