# Run: issue #710 — `phase-ready` template and rules (PL-P1)

- **Trigger:** Cezar run c43a9fc5 (`om-auto-fix-issue 710`, label `cezar`), 2026-11-26.
- **Spec:** `.ai/specs/2026-11-24-phase-level-story-start.md`, Phase 1 (Steps 1.1, 1.2; PS-TEST-01, PS-AC-01).
- **Branch:** `docs/issue-710-phase-ready-story-template`.

## Steps

1. Claimed #710 (assignee, `in-progress`, `🤖` claim comment naming the worktree and branch).
2. Surveyed the *Blocking?* values of every existing spec: 56 × `yes`, 72 × `no` and about 30 free-text variants (`yes — phase 4`, `phase gate`, `was yes`). Rewriting them would rewrite decided history, so the rule applies only to specs dated from 2026-11-27.
3. Added `scripts/check-spec-questions.mjs` (`yarn spec-questions:check`, a new `yarn verify` step after `spec-changelogs:check`) with unit tests at 100 % line/branch/function coverage. It reads every table with a `Blocking?` header cell, accepts `no`, `phase N`, `phases N, M`, and checks each named phase has a `### Phase N` heading.
4. `SPEC-000-template.md`: the *Blocking?* values and the `phase-ready` pointer. `.ai/specs/README.md` and `.ai/guides/spec-delivery.md`: the rule for spec authors and spec runs.
5. `SDLC.md`: Definition of Ready (a story is ready when its spec is Ready or it carries `phase-ready`), the `phase-ready` rules (set only by the owner-attended decision session after `## Owner decision` comments; removed on a later spec change to that phase), the label in the Meta group, and the automation contract (automation never sets it).
6. `.ai/skills/om-auto-fix-issue/SKILL.md` §6: how a fix run treats a story of a Draft spec with and without `phase-ready`.
7. Created the GitHub label `phase-ready` (Step 1.2) and added it to the meta labels in `.ai/agentic.config.json`; `CODE_REVIEW.md` lists the 23 gate steps (the list had fallen behind by three).

## Decisions

- **Separate script, not an extension of `check-spec-changelogs.mjs`:** different concern; each check keeps one reason to fail.
- **Start date instead of a migration of old specs:** older tables hold owner decisions in free text; the decision session reads them as they are.
- **No `yes` value:** a question that blocks the whole spec lists every phase, so the decision session always knows which stories an answer unblocks.
- **Spec status line unchanged** (`Ready for implementation`): Phase 2 (decision-session prompt, picker rule) lives on the build server.

## Validation

See the PR body for the `yarn verify` and `yarn guard` results. No integration test: the change is docs and a tooling script (no route, command, subscriber or page).

## Open / next

- Phase 2 (decision-session prompt and picker rule, PS-AC-02) is a separate story.
