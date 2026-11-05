# Issue #108 — fee schedules, discount rules and the period generator (stopped)

- **Date:** 2026-11-05
- **Agent / tool:** Claude Code (claude-opus-5-5), `om-auto-fix-issue` with the repo-local override, cezar task
- **Trigger:** cezar task "108"
- **Spec / issue / branch:** `.ai/specs/2026-10-27-vereino-club-payments.md` phase 4 step 2; issue #108 (epic #106); branch `feat/issue-108-fee-schedules-generator`
- **Status:** stopped

## Goal

Build the `payments` module slice from E07-S01: fee schedules (B-20), discount rules, the "Coaches and payments" setting, the idempotent period generator (B-21) and the one-off camp fee (REQ-011, REQ-018, TEST-018, TEST-048).

## Steps

1. Read issue #108, its dependency #107 (closed) and epic #106.
2. Checked the spec. Its status is `Ready for implementation` for phase 4 without the treasurer role (D30). However, the *Final Compliance Report* still lists "the reverse command and charge-generation undo" as open, and the issue lists the generation undo as a **blocking** open question.
3. Read `D-030-unblock-held-back-work.md`. It approves only the `payment_gateways` and `gateway_stripe` migrations, and says "any other module, dependency or migration stays Ask First". The issue also says "ask before migrations". No issue, spec or owner comment approves the new `payments` tables.
4. Stopped before claiming the issue. Posted the needs on #108 (https://github.com/wladku/Vereino/issues/108#issuecomment-6657581340), with a proposed undo default and the list of tables.

## Decisions

- Did not implement. Per the run rules, an Ask First item counts as approved only when the issue, the spec or an owner comment records it. Here neither the migration nor the generation-undo contract is recorded.
- Q1 (online fee setting) was judged not blocking: the issue puts it out of scope, and REQ-012/DD-37 already decide it.

## Files changed

- `.ai/runs/2026-11-05-issue-108-fee-schedules-generator.md` (this log)

## Commands and results

- `gh issue view 108|107|106`, `gh pr list` — no existing PR for #108.
- `gh issue comment 108 --body-file …` — posted.
- A first attempt to post the comment hung: a stray `cat >` read stdin because `CEZ_TREE_DIR` was unset. It left an empty file `/../tmp-108-comment.md` at the Git Bash root, and deleting it was denied by the permission mode.

## Open problems

- Owner decision on the charge-generation undo (proposed: undo cancels the run's still-open, unpaid charges; or a non-undoable generation).
- Owner approval of the `payments` migration (`payments_fees`, `payments_discount_rules`, `payments_charges`, `payments_settings`, plus a generation-run/lock table).

## Next steps

After the owner answers on #108, re-run `om-auto-fix-issue 108`. In the same PR, update the spec's compliance row for the generation undo.
