# Issue #791 — the coach starts a cash handover, the treasurer or administrator confirms it (D-042)

- **Date:** 2026-11-26
- **Agent / tool:** Claude Code (Opus 5.5), `om-auto-fix-issue` (feature route), Cezar run
- **Trigger:** issue #791 labelled `cezar` by the owner; the owner approved the `payments_cash_handovers` migration on the issue (2026-11-26)
- **Spec / issue / branch:** `.ai/specs/2026-10-27-vereino-club-payments.md` (REQ-033a, DD-31a, J-010a, TEST-089, AC-033a); #791; `feat/issue-791-cash-handover-confirm`
- **Status:** in progress

## Goal

Amend the payments spec with the two-sided cash handover of D-042 and build it: the coach sends a pending `RG/…` handover from the phone, the treasurer or administrator confirms or rejects it (phone and panel), the coach can withdraw it, the one-sided "Accept handover" stays as a fallback and tells the coach; notifications in the app and by e-mail; audit entries for every step.

## Steps

1. Claimed #791 (assignee, `in-progress`, claim comment).

## Decisions

## Files changed

## Commands and results

## Open problems

## Next steps
