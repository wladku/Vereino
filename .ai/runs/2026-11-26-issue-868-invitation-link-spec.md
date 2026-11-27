# Issue #868 — spec for the personal invitation link and QR code

- **Date:** 2026-11-26
- **Agent / tool:** Claude Code (Opus 5.5), om-auto-fix-issue → feature route (om-auto-write-spec, om-spec-writing --autonomous), Cezar run
- **Trigger:** `cezar` label on #868 (E29-S01, epic #865)
- **Spec / issue / branch:** `.ai/specs/2026-11-26-vereino-invitation-link-and-qr.md`, #868, `docs/issue-868-invitation-link-qr`
- **Status:** stopped (spec PR opened; implementation waits for the owner's answers)

## Goal

Let staff copy a guardian's pending invitation as a link or show it as a QR code, and let the guardian activate the account from it.

## Steps

1. Read #868 (owner-authored, `feature`), classified it as a feature request; FR triage: nothing built, no covering spec, no open PR.
2. Claimed the issue (assignee, `in-progress`, 🤖 claim comment naming this worktree and branch).
3. Mapped the code with a read-only Explore subagent: invitation and re-send commands, rate limits, the platform reset page, social sign-in rules, coach and coordinator scopes, the account tab, QR libraries, existing tests.
4. Wrote the spec (Draft) with three phases and five open questions, and its changelog entry.
5. Opened the design-only spec PR and released the claim with a comment listing what the owner must approve.

## Decisions

- Spec first, no code — the story adds routes, a feature, a table and a sessionless lookup (`AGENTS.md` spec gate), and the cezar run contract forbids building Ask First items without recorded approval.
- Open questions kept as a Draft spec's Open Questions table (repository template) with a recommendation each, instead of autonomous defaults, because every one of them is an Ask First item.
- Recommended a Vereino token link (P-10) over returning the platform `/reset/{raw}` link: only the former can show the club and an "ask your club" invalid state (story acceptance criteria 4 and 5).
- Google activation from the link split into phase 3: the current activation has no Google step and D27 / DD-S02 forbid linking without a session.

## Findings worth keeping

- The raw invitation token never reaches Vereino code today; `resendInvitation` sends a 60-minute reset link by e-mail and keeps earlier links valid.
- No QR runtime library is installed; only `@types/qrcode` is in `packages/app`.
- A coach has no `people.view` and sees guardians only in consented occurrence contacts.

## Files changed

- `.ai/specs/2026-11-26-vereino-invitation-link-and-qr.md` (new)
- `.ai/specs/changelog/2026-11-26-vereino-invitation-link-and-qr/2026-11-26-initial-draft.md` (new)
- `.ai/runs/2026-11-26-issue-868-invitation-link-spec.md` (this log)

## Commands and results

- `yarn spec-questions:check` → "Spec Open Questions are valid"; `yarn spec-changelogs:check` → "Spec changelogs are valid"; `yarn glossary:check` → 0 problems; `yarn guard` → "No blocking findings". Full `yarn verify` not run: the change is documentation only (no code, catalog or test file), and its steps do not read specs beyond the checks above.

## Open problems / next steps

- Owner answers Q-IL01…Q-IL05 on the spec PR or #868; then a new run builds phase 1 (`om-auto-implement-spec`).
