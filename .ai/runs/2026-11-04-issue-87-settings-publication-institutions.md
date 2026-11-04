# Issue #87: E06-S05, club settings, publication and institutions (not picked up)

- **Date:** 2026-11-04
- **Agent / tool:** Claude Code (Opus 5.5), `om-auto-fix-issue` with the repo-local override applied, run by cezar; no subagents
- **Trigger:** `/om-auto-fix-issue 87` (E06-S05, epic #82)
- **Branch:** `feat/issue-87-settings-publication-institutions` (local only, run log commit; not pushed)
- **Status:** stopped before claim; the ticket fails the Definition of Ready

## Goal

Ship B-02 settings (IANA time zone select, age threshold range, editable club name), B-03 public address with an always-visible Preview, and B-07 bank account column, NRB validation and type filter.

## Steps

1. Read the issue, its comments and the related #135. Checked for open PRs that reference #87: none.
2. Checked the ticket against the `SDLC.md` Definition of Ready. Two blocking open questions have no owner answer:
   - Q1: the validator range for the own-account age threshold (13–18 vs 1–18). #135 explicitly leaves it to #87.
   - Q2: whether the club name is editable on B-02. The proposed club-owned display name needs a new `club_core` column and a migration, which is Ask First under `AGENTS.md`, and no approval is recorded.
3. Did not claim the issue. Posted a not-ready comment that names both answers needed and offers a split (time zone, B-03, B-07 first): https://github.com/wladku/Vereino/issues/87#issuecomment-6639859760

## Decisions

- Stop rather than implement the unblocked parts: the issue's pickup line says "once Q1 and Q2 are answered", and one issue = one PR. Splitting is offered to the owner instead of decided by the run.

## Files changed

- `.ai/runs/2026-11-04-issue-87-settings-publication-institutions.md` (this log)

## Commands and results

- `gh issue view 87`, `gh issue view 135`, `gh pr list --search "87 in:body"`: no open PR.
- `gh issue comment 87`: posted. The first attempt hung on a stray `cat >` that was reading stdin and was stopped; the second attempt posted the comment.
- No code changed, so no gate was run.

## Open problems / next steps

- Owner answers Q1 and Q2 (and approves or rejects the Q2 migration) on #87, or replies "split". Then re-run `om-auto-fix-issue 87`.
