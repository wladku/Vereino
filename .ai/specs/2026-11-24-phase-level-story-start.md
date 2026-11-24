# Phase-level story start: a story starts when its own phase is decided

**Date**: 2026-11-24
**Status**: Ready for implementation — direction approved by the owner on 2026-11-24 (ST-Q5); this spec needs its own review before the changes land

> Related: `.ai/specs/2026-11-24-cezar-stall-prevention.md` (split out of it on review); `.ai/specs/SPEC-000-template.md`; `SDLC.md` → Definition of Ready and "The automation contract"; the picker automations on cezar-ws; the decision session `vereino-sesja-decyzji`. Identifiers: decisions `PS-D01…`, requirements `REQ-PS01…`, tests `PS-TEST-01…`, acceptance `PS-AC-01…`.

## 📝 TLDR

Today a story can be built only when its spec is Ready, so one open question anywhere in a spec blocks every story. E24 (#671) had ten owner questions, two of them for a lawyer; all four stories were filed `blocked`, although phases 2 and 3 depended on none of the lawyer questions. The proposal: the decision session marks a story `phase-ready` once the owner has answered every question that blocks the story's phase and approved its Ask First items; the picker builds a `phase-ready` story even while its spec is Draft.

## 📝 Problem Statement

- E24: Q-O01…Q-O10 and V-O1/V-O2 open on 23.11; #682–#685 filed `blocked`; the picker skipped #684 ("the spec is still Draft") although its phase 3 had no blocking question except the exit check V-O1.
- Owner questions are only seen when someone looks; the decision session (live since 24.11) now asks them twice a day, so the remaining delay is the all-or-nothing Ready rule.

## Non-goals

- Auto-accepting defaults or answering questions without the owner.
- Building a phase whose Ask First items (migrations, modules, dependencies, contracts) are not approved.
- Changing how specs are reviewed or merged.

## 📝 Proposed Solution

1. **Template** — the spec's Open Questions table keeps a *Blocking?* column whose values are `no` or a list of phase numbers (`phase 1`, `phases 2, 4`). `om-spec-writing` and spec runs fill it.
2. **`phase-ready` label** — set **only by the decision session** on a story issue, right after the owner's answer, when: every question whose *Blocking?* names the story's phase is answered and recorded (`## Owner decision` comment on the epic or spec issue), and the phase's Ask First items are approved in a decision comment on the story. The session also records which spec commit the story is built against.
3. **Picker rule** — a story is ready to build when its spec is Ready, **or** when it has `phase-ready`. Later phases that depend on an earlier phase's code still wait for that phase's PR to merge (stated in the story's "Before building").
4. **Spec runs** file `blocked` only on stories whose phase has an open blocking question, and name those questions in the story.
5. **Spec changes after `phase-ready`** — when the spec changes the decided phase later, the decision session removes `phase-ready` from unbuilt stories of that phase and asks again; built work is not reopened (a change is a new issue).

### Design Decisions and Alternatives

| Decision | Why | Alternatives | Why not |
|---|---|---|---|
| **PS-D01** A label set only by the owner-attended decision session gates the start (owner ST-Q5; label on review, 2026-11-24). | Machine-checkable for the picker; set only after the owner's recorded answer. | The picker parses the *Blocking?* column | Free text in a table is not a reliable gate. |
| **PS-D02** Ask First approval per phase, recorded on the story (review). | Migrations and modules stay owner-approved before any build. | Approval per spec | Blocks independent phases again. |

## 📝 Delta

### Capability: story-readiness

#### MODIFIED — Definition of Ready (`SDLC.md`): the linked spec is Ready

Becomes: the linked spec is Ready, or the story carries `phase-ready`.

- **Scenario** — WHEN a story's spec is Draft and the story has `phase-ready` THEN the picker may build it; WHEN it has no `phase-ready` THEN the picker skips it as today.

Frozen by: none — the picker is a prompt; evidence by run log (PS-AC-02).

#### ADDED — REQ-PS01 `phase-ready` is set only after a recorded owner decision

- **Scenario** — WHEN the decision session sets `phase-ready` THEN the story has a `## Owner decision` comment approving its phase's Ask First items, and every question blocking that phase is answered on the epic or spec issue.

## 📋 Implementation Plan

### Phase 1 — Template and rules
- Step 1.1 — `SPEC-000-template.md`: the *Blocking?* column values. PS-TEST-01: the spec lint (`yarn verify` docs step) accepts `no` and `phase N` lists and rejects other values in new specs.
- Step 1.2 — `SDLC.md`: Definition of Ready and the automation contract (`phase-ready` set only by the decision session after an owner decision; removed on a spec change to that phase). Create the `phase-ready` label.

### Phase 2 — Operations
- Step 2.1 — The decision session's prompt: set and remove `phase-ready` per the rules; list stories it unblocked.
- Step 2.2 — The picker rule. Evidence: a story built from a Draft spec after `phase-ready`. *(PS-AC-02)*

## Acceptance

- **PS-AC-01** — PS-TEST-01 passes; `SDLC.md` states the rule.
- **PS-AC-02** — A story with `phase-ready` is built while its spec is Draft; a story without it is skipped.

## Rollback

Remove the picker rule and the label; the Ready-only rule returns.

## 📝 Risks & Impact Review

- A phase can be built against a spec that later changes; mitigated by recording the spec commit and removing `phase-ready` on change.
- The owner's decisions become the only gate for Draft-spec work; the session records them before labelling.
