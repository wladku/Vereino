# Run: QM-P2 — e-mail the QA instruction to the owner when the train first holds a PR (#712)

- **Goal and trigger**: cezar task (om-auto-fix-issue, run 80f40eac), issue #712 labelled `cezar`. Phase 2 of `.ai/specs/2026-11-24-qa-request-email.md`: when the merge train first holds a `risk-high` + `needs-qa` PR, the owner gets its `qa-instruction` block by e-mail through Resend, once per PR and head SHA.
- **Spec / issue / branch**: spec phase 2 (steps 2.1, 2.2), issue #712 (depends on #709, merged as #780), branch `feat/issue-712-qm-p2-email-qa-instruction`.

## Steps

1. Claimed #712 (assignee, `in-progress`, 🤖 claim comment naming this worktree and branch).
2. Read the ops job on cezar-ws: `~/vereino-alerts/vereino_alerts.py` (systemd user timer `vereino-alerts.timer`, every 10 min; config transport currently `resend`, key in `~/.config/vereino-alerts/resend-key`).
3. Staged a copy outside the repository and added the kind `qa-request`:
   - `qa_block` mirrors `hasQaInstruction` of `scripts/merge-train-plan.mjs` (start marker, then end marker, non-empty text); `qa_plain` strips HTML comments and tags, heading marks, `**`, `__` and backticks, and caps the text at 4 000 characters.
   - A PR counts as held when it is open, not a draft, has `risk-high` + `needs-qa`, none of `qa`, `qa-failed`, `do-not-merge`, `blocked`, `in-progress`, `changes-requested`, and carries the train's hold comment (`<!-- merge-train:qa-hold -->`).
   - `qa_decide`: first mail when held with a block; nothing more for the same head; the train's own head updates mail nothing; after `qa-failed` a new head mails again. A PR held without a block is mailed once the block is written.
   - Mails always go through Resend (`send(dict(cfg, transport="resend"))`), so they still go out when other kinds are set to `outbox`; a Resend refusal or network error keeps the mail in the outbox and the state records `via: outbox`. `send` now returns the transport it used, and also falls back to the outbox when Resend is unreachable (before, only an HTTP error did).
   - Sent state: `~/vereino-alerts/qa-requests.json` (`{"<pr>": {"head", "failed", "via", "at"}}`); closed and merged PRs drop out of it.
   - Mail: subject `[Vereino] Do przetestowania: #<n> <title>`; body: what waits, title, PR link, the block as plain text, the preview command, what to do after the test, the other PRs still waiting (marked "instrukcja w drodze" when their block is missing).
   - Morning report: section "Czekają na Twój test (etykieta qa)" lists every held PR.
   - `--dry-run` prints qa-request mails and writes no qa state; `--qa-preview <PR>` prints the mail of any PR and exits.
4. Installed: backup `~/vereino-alerts/vereino_alerts.py.before-qa-request-20261126-0012`, then an atomic `mv` of the new file.
5. `SDLC.md` "QA" gained the paragraph "QA request e-mail"; spec changelog file `2026-11-26-issue-712-phase-2.md`.

## Decisions

- The ops job stays outside the repository, as the spec says (Architecture: "Ops"); the repository records the behaviour in `SDLC.md`, the spec changelog and this log.
- The hold comment is required, not only the labels: it proves the train holds the PR (not a draft, no skip label), matching "when the train's hold comment appears".
- A mail refused by Resend is recorded as sent with `via: outbox` instead of retried every 10 minutes, so the outbox does not fill; the morning report keeps listing the PR (REQ-QM02 third scenario).
- The full `--dry-run` was not used for the live check, because the existing job records the other alerts in `state.json` even in a dry run; the qa path was called directly with `dry=True` instead.

## Commands and results

- Throwaway test `test_qa.py` (temp HOME, fake `gh` and `send`): block present / missing / out of order / empty; plain-text conversion and cap; first mail, no duplicate on the same head, mail after the block is written later, no mail during `qa-failed`, mail after `qa-failed` + new head, no mail on a train head update, closed PR dropped from the state, dry run writes nothing, Resend refusal recorded as `outbox`, Resend used while the config says `outbox` — `qa-request tests: all passed`. `python3 -m py_compile`: OK.
- Live dry run (qa path only, real GitHub): held PRs `[(783, False)]` — #783 is held with "QA instruction missing", so no mail; no state written.
- `vereino_alerts.py --qa-preview 780` printed the mail for the #780 block; `--qa-preview 783` printed "has no qa-instruction block".
- `systemctl --user start vereino-alerts.service`: finished without errors; `qa-requests.json` = `{}`.

## Open problems / next steps

- Step 2.2 / QM-AC-02: the first live mail goes out when a held PR has its block (today #783, once the picker's run writes it). The owner confirms he received one mail with the block, the preview command and the link, and no duplicate for the same head; then the spec can move to `implemented/`.
- Rollback: `cp ~/vereino-alerts/vereino_alerts.py.before-qa-request-20261126-0012 ~/vereino-alerts/vereino_alerts.py`.
