# Spec consistency review: Vereino club management (third pass, after D-022…D-025)

- **Date:** 2026-10-23
- **Agent / tool:** Claude Code (Fable 5.1) coordinating three read-only review subagents plus a scripted id and table audit
- **Trigger:** product owner — "check the specification's consistency", then "fix everything in group A (no decision from me needed) and show the diff; we discuss the B points separately"
- **Spec / issue / branch:** `.ai/specs/2026-10-20-vereino-club-management.md` (Draft); branch `docs/discovery-coordinator-2` (PR #19)
- **Status:** completed — group A fixes applied after the owner approved the diff (2026-10-23); the three decision points B1–B3 were decided by the owner on 2026-10-24 (D-026) and applied after a second approved diff

## Goal

Find contradictions and gaps left by the two revisions of 2026-10-23 that followed the discovery close: the D-022 club settings (DD-37), REQ-036…REQ-039 with DD-38/DD-39, the D-024 maintenance planner scope, and the D-025 replacement of KS Gwiazda by the example club "Dev Academy".

## Steps

1. Scripted audit of ids and tables (REQ/DD/Q/V/TEST/AC/J defined once, no gaps, every reference resolves; table cell counts ignoring code spans and `\|`; traceability tests vs phase test lists).
2. Three subagents, one dimension each, with line evidence: (A) internal consistency of the new content and its seams; (B) spec vs the brief and D-021…D-025, including the brief's Definition of Ready addendum; (C) the new parts vs `AGENTS.md`, `BACKWARD_COMPATIBILITY.md`, the engineering standards and the `auth` facts.
3. The coordinator re-checked every Blocking and Major finding in the spec (lines 33, 46, 75, 102, 156, 189, 218, 251, 371, 382–383, 391, 414, 433, 441, 525, 569, 594, 693, 705–706, 722, 747, 783, 794, 822, 824–829, 882, 890, 894, 904–955, 1025–1027, 1042, 1107–1110, 1120, 1162–1176, 1233–1245, 1337) and in the brief (the DoR addendum, line 20 and 52).
4. Findings split into group A (mechanical fixes, no owner decision) and group B (decision points); group A scripted on a scratch copy (`spec_review2_fix.py`), re-audited, shown as a diff, written after approval.
5. 2026-10-24: B1–B3 put to the owner as three questions with a recommended option each; the owner chose the recommended option in all three. Recorded as `research/decisions/D-026-spec-review-2-decisions.md`; the spec, `AGENTS.md` and the brief (D26 row, Coverage recount) edited by `apply_d026.py` on scratch copies, re-audited, shown as a diff, written after approval.

## Results

| Dimension | Blocking | Major | Minor |
|---|---|---|---|
| Scripted audit | 0 | 3 (stale compliance report, TEST-055 in phase 4 and the REQ-006 row) | 0 |
| A. Internal consistency | 3 | 7 | 12 |
| B. Brief and decisions | 5 | 11 | 3 |
| C. Repository rules | 1 | 7 | 9 |
| **Deduplicated** | **3** | **~12** | **~15** |

Consistent: all ids defined once without gaps; every reference resolves; 0 table mismatches; every REQ in traceability; D-023 priorities, D-024 (DD-35, roles table, public request route, TEST-049/050) and D-025 (TLDR, Q-005/Q-008/Q-039, rollout, seeds) match the records; provenance of REQ-036…REQ-039 exists and says what the spec claims; brief R10–R16 map to spec settings; scope derivation and fail-closed wording, the optional DI token for the maintainer scope, no role-name guards, every new route carries a feature, commit of the import through existing `people` commands, encrypted `raw` with a 30-day purge; TEST-051…TEST-055 are integration tests per S13.1.

### Blocking (verified)

1. Account age threshold 13 vs 16: the entity, REQ-002, AC-002 and Q-007 say 16 (D-022), but the glossary said 13, the roles row "(13–17)", Security "under 13", and J-001 plus TEST-003/008/009/015/021/044 rely on a 14-year-old with an account. **Fixed (A):** 16 everywhere; the test club and Dev Academy lower the setting to 13 for those fixtures, stated in the test preamble and in J-001 step 1.
2. Maintenance planner: REQ-022 said coordinators plan by default and the `setup.ts` row seeded the feature on `vereino_coordinator`, against D-024, the feature list and Q-041. **Fixed (A):** administrator by default, per-person grants with place assignments; seed row corrected; coordinator navigation qualified.
3. The import commit creates group memberships in phase 1 "through the `people` and `groups` commands" while `groups` lands in phase 2 and the dependency direction is `groups → people`. **Decided (B1, D-026) and fixed:** phase 1 commits persons and guardianships and keeps the group column on the row; memberships are created in phase 2 through the optional DI token `groups.membershipImporter`; rows with a group wait in `review` until then.

### Major (verified)

- Held-back work: the brief's DoR addendum keeps work resting only on A02 (treasurer) and A05 (settlement automation) out of implementation planning; the spec treated REQ-034, DD-33, phase 4 and the settlement part of REQ-021 as ready. **Fixed (A):** *Readiness* paragraph under Goals, notes in phase 2 step 7 and phase 4, verdict.
- Stale pre-D-022/D-023 wording: sibling rule "to be confirmed", legal opinion before the pilot, Q-016 and Q-034 as board decisions, DD-14 "brief Q14", interviews per D-015 and the D-011 revisit, the treasurer interview script, grants without "parked". **Fixed (A).**
- Missing contracts: `show_called_up_children` had no API field; the two new consents were not writable through `PUT /api/people/me`; the checkout had no surcharge field or quote. **Fixed (A):** `calledUpChildren[]`, `shareContactWithCoaches`/`sharePresenceWithGuardians`, `fee_amount` + `/quote`.
- Import and fixtures: uncoded 422/409, no idempotency column for fixtures, the import file without a private partition or purge, `error text?` able to echo PII, two decision mechanisms. **Fixed (A):** four error codes, `external_fixture_id`, private partition and purge with the rows, `error_code` + `error_column`, decisions on rows and commit with version only.
- Guardian contacts: REQ-037 promised the group member list but only the per-session route exists; a `GET` is not a command, so the audit entry must be explicit. **Fixed (A):** REQ-037 narrowed to the session's attendance list; explicit `audit_logs` entry; paged shape.
- Changelog rows of 2026-10-23 named no protected surfaces. **Fixed (A):** the new Changelog row lists them, including those of the two earlier rows.
- Phases and tables: TEST-055 missing from phase 4 and the REQ-006 row; V-14 scheduled nowhere; no steps for the import, the contacts endpoint, fixtures and the rented-hours report; UI rows missing for three Must/Should surfaces; `lib/**` list without the new pure logic; traceability feature `people.imports.*` undefined. **Fixed (A).**
- DD-35 vs `AGENTS.md`: the spec (DD-35, Scope, Security) consistently records the owner's exception (D-024, conditional on V-12), but `AGENTS.md` still stated the rule without the exception. **Decided (B2, D-026) and fixed:** one sentence in the `AGENTS.md` scope bullet records the exception; DD-35, Security and the compliance report cite it.
- REQ-007 said `declaration_kind` applies "per club, group or activity type" but the setting exists only per activity type; J-002 step 3 and the Today mock showed "Attending" on a training despite `absence_only`. **Decided (B3, D-026) and fixed:** the kind is a club setting per activity type, the group policy decides only who declares; REQ-007, the Declaration policy row, `/backend/activities/policies`, J-002, both mock-ups and TEST-009 follow it.

### Minor (fixed in A unless noted)

`/p/gwiazda…` slugs → `/p/dev-academy…`; "Piotr" → Bartek in the two mocks; the treasurer is now "Iwona" (Ewa stays the swimming-pool coordinator); glossary "pilot:" → "example club Dev Academy"; DD-37 marks `coach_settlement_model` and `show_called_up_children` defaults as the specification's choice where D-022 is silent and no longer says "match the pilot club"; `confirm` for `camp`/`other` stated as the spec's extension; `rented_by_club` on the places form; settlement model on the contract form and in the report header (AC-021); `people.import.committed` event row; `people:purge-import-rows` in the workers row and REQ-036 in the scheduler-targets row; V-13 write path reworded as pending; Open Questions header lists Q-044…Q-047; compliance report counts and verdict updated; the club-website note of D-023 added to Non-goals. Not changed: the phase/test splits REQ-002/TEST-021 and REQ-003/TEST-008 (deliberate, from the first review).

## Decisions and reasons

- Fixes were split into "no owner decision" (A) and "decision" (B) because the owner asked for exactly that split; B1–B3 change scope sequencing, a repository rule, or a requirement's wording, so they wait.
- The 14-year-old fixtures were kept (rather than aged to 16) because they exercise the minor-with-account rules; lowering the club setting in tests mirrors what a club may do (D-022).
- REQ-037 was narrowed to the session list instead of adding a group route: the smallest change that makes the requirement match its contract; a group-level list can be added later as an additive route.
- Decisions on import rows live on the rows (`PUT …/rows/{rowId}` with a version) and commit takes only a version, so one mechanism carries the review queue and 409s stay meaningful.
- The import file follows the bank-import precedent (private `attachments` partition, purge with the rows).
- B1: an optional DI hook was preferred over moving the whole import to phase 2 (families would wait for the schedule work) and over dropping the group column (manual enrolment of ~150 families); it follows the `facilities.maintainerScopeProvider` pattern already in DD-36.
- B2: the exception goes into `AGENTS.md` rather than staying a spec-only note, because `AGENTS.md` says hard boundaries live there and an implementing agent reads it first.
- B3: no per-group override of the kind in 1.0 — D-022 recorded the kind as a club setting and no interview asked for a group-level difference; a group override stays an additive field for later.

## Files changed

- `.ai/specs/2026-10-20-vereino-club-management.md` — group A fixes (77 insertions, 67 deletions) and a Changelog row naming the new protected surfaces; D-026 edits (2026-10-24) with their own Changelog row.
- `.ai/specs/research/decisions/D-026-spec-review-2-decisions.md` — new decision record.
- `AGENTS.md` — the DD-35 exception sentence in the scope bullet (D-024, D-026).
- `.ai/specs/product-brief.md` — D26 row, sources `D-001…D-026`, Coverage recount (136 → 137 claims, document 69 → 70).
- `.ai/runs/2026-10-23-spec-consistency-review-2.md` — this log.

## Commands and results

- Scripted audit before and after the fixes (`audit2.py` on a scratch copy and on the written file): REQ 39, DD 39, AC 39, TEST 55, Q 47, J 10, V 14, no duplicates, no gaps, no undefined references, 0 table mismatches, 39 REQ in traceability; phase/test mismatches only REQ-002/TEST-021 and REQ-003/TEST-008 (pre-existing splits).
- `cmp` of the written spec against the approved scratch copy: identical (both passes).
- Audit after the D-026 edits: the same clean result; the brief's Coverage recounted with the om-discover counting rule (137 claims — 116 sourced: interview 41, data 0, document 70, product 1, benchmark 4; 0 synthetic, 21 assumed).
- `node scripts/check-lessons.mjs`: not needed — no lesson added (the findings were drift after revisions, not a repeated mistake; the earlier lesson on explicit pay rates is unaffected).
- No code, tests or migrations were touched; `yarn verify` not run (documentation-only change).

## Open problems

- None from this review. Not verified: V-1…V-14 remain unexecuted; the pilot club is still to be chosen (D-025, brief Q18); the phase/test splits REQ-002/TEST-021 and REQ-003/TEST-008 are deliberate.

## Next steps

1. Commit this review (spec, D-026, `AGENTS.md`, brief, this log) on `docs/discovery-coordinator-2` when the owner asks; PR #19 body to be updated when the branch is pushed.
2. The next spec change is the first phase-1 verification round (V-1…V-3, V-10…V-12), which appends its results to *Open Questions*.
