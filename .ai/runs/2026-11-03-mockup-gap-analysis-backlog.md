# Mockup gap analysis and backlog E06–E08

- **Date:** 2026-11-03
- **Agent / tool:** Claude Code (Opus 5.5), a side session started by the design session. Four read-only analysis subagents, then `om-backlog` with `om-prepare-issue`'s body template, labels and label-rationale comment.
- **Trigger:** the product owner reported that the sandbox lacks many functions the clickable mockup shows, and asked: "specify everything that was in the mockup and prepare it for implementation".
- **Spec / issue / branch:**
  - Sources: `docs/ux-concept/README.md`, `docs/ux-concept/mockups/app.ts`, `.ai/specs/2026-10-20-vereino-club-management.md`, `.ai/specs/2026-10-27-vereino-club-payments.md`, `.ai/specs/2026-10-27-vereino-facilities.md`.
  - Issues: epics #82 (E06), #106 (E07), #119 (E08) and 45 children (#83–#105, #107–#118, #120–#129); a comment on the parked epic #24.
  - Branch: `docs/backlog-mockup-parity`.
- **Status:** completed. Issues filed; this branch records the backlog.

## Goal

List every difference between the clickable mockup and `main`, grouped by module and phase. File each gap as a tracker issue ready for `om-auto-fix-issue`, without duplicating planned or existing work.

## Steps

1. **Sandbox identified:**
   - the local production build in `C:\Users\wkuc\vereino-sandbox` at `261a8d0` (#79), served on port 4200;
   - its database is the `vereino-sandbox-db` container on port 5442;
   - it is two merges behind `main`.

   The source of truth was `origin/main` at `db2bd67`, read from a detached worktree.
2. **Four read-only subagents compared the screens** against the concept and the mockup:
   - member M-01…M-14;
   - panel B-01…B-12;
   - B-13…B-19 with P-01 and P-02;
   - payments and facilities M/B/P screens, where neither module exists.

   Their reports cite file paths and mockup lines. Key claims were re-checked in code:
   - no public block provider is registered;
   - there is no sign-out under `/club`;
   - the member session page has only the self and guardian perspectives;
   - the people list has no filters.
3. **Checked against the tracker and the specs:**
   - no open issue covers any gap; #76 is related (a 403 message) but not a duplicate;
   - six items are spec steps that were never filed: phase 2 steps 6, 7 and 9, the scheduling spec's coordinator calendar, phase 3 step 5, and the `dictionaries` field.
4. **Plan approved:** the gap list and a 48-issue plan were shown to the product owner, who approved filing with the recommended process choices.
5. **Filed in one idempotent run** of the script (by exact title):
   - epics first, then children;
   - dependency links and epic checklists;
   - one label-rationale comment per issue.

## Decisions

- **One backlog source,** `docs/ux-concept/README.md`, so the tree does not collide with the product-brief source; ids continue after E05.
- **Phases 4 and 5 filed in full** as stories that stay not ready, with the blockers on each ticket (V-5, review findings, A02; Q18, Q04, V-7). The owner wanted the whole mockup in the tracker. `om-auto-manage-issues` records the readiness.
- **A05 items (substitutions, coach units report) filed blocked,** not lifted: the hold is the owner's decision (D21).
- **One covering spec** "UX parity for phases 1–3" is proposed for the three stories that add API contracts or columns (E06-S01, E06-S03, E06-S04). The rest are UI on existing contracts or covered by an existing spec step.
- **Mockup-versus-spec conflicts became blocking questions** on their stories, each with a proposed default, rather than being decided by the agent. Examples:
  - the age-threshold range and the editable club name;
  - the month view and the announcement limits;
  - the online-fee setting and the B-21 perspectives;
  - the TEST-045 scope;
  - the P-04 categories and the no-show permission;
  - maintenance without a mockup.

## Files changed

- `.ai/specs/backlog.md`: a new section for the `docs/ux-concept/README.md` source.
- `.ai/runs/2026-11-03-mockup-gap-analysis-backlog.md`: this log.

## Commands and results

- `gh issue create` × 48, `gh issue comment` × 49, `gh issue edit` × 51 — all exit 0.
- No `yarn verify` run: documentation only, and no code changed.

## Open problems

- **M-01 sign-in not checked:** the page is installed from the platform, and the checkout has no `node_modules`; check it in a browser.
- **The verifications behind E07 and E08** are tasks on the tickets: V-5 is E07-T01, and V-7, V-10 and V-13 are E08-T01.
- **E06 needs one owner pass** to answer the blocking per-story questions (E06-S05, E06-S18, E06-S20).

## Next steps

- `om-auto-fix-issue 97` (E06-S15, priority high) and `om-auto-fix-issue 101` (E06-S19, sign-out).
- Write the covering spec for E06-S01, E06-S03 and E06-S04 with `om-auto-write-spec` on #82.
- `om-auto-manage-issues` over #82–#129 to record `READY_STATUS`.
