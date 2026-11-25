# Run: issue #709 — QA instruction block and the train's "QA instruction missing" hold (QM-P1)

- **Date**: 2026-11-25
- **Trigger**: Cezar issue-label automation (`cezar` label on #709), skill `om-auto-fix-issue` (feature route, spec exists)
- **Spec**: `.ai/specs/2026-11-24-qa-request-email.md`, Phase 1 (QM-D01, QM-D02, REQ-QM01)
- **Branch**: `feat/issue-709-qa-instruction-block-pr-bodies`
- **Dependency**: #708 merged on 2026-11-25 in #722, already in this branch's base.

## Goal

A `risk-high` + `needs-qa` PR carries a Polish `<!-- qa-instruction:start -->…<!-- qa-instruction:end -->` block; the merge train adds the hold reason "QA instruction missing" via `hasQaInstruction(body)`; agents get the template and the rule. MT-D02 stays: the train never sets `qa`.

## Steps

1. Claimed #709 (assignee, `in-progress`, `🤖` claim comment naming this run's worktree and branch).
2. Step 1.1 — `scripts/merge-train-plan.mjs`: markers `QA_INSTRUCTION_START`/`END`, `hasQaInstruction(body)` (start marker, non-blank text, end marker after it), `QA_INSTRUCTION_MISSING` appended to the held entry's reason, held entries now `{ pr, reason, instruction }`; `qaHoldComment({ instruction, url })` and `qaHoldCommentAction(comments, wanted)` replace `needsQaHoldComment`.
3. Step 1.2 — new `scripts/merge-train-holds.mjs` (`announceHolds` with an injected GitHub client, like `merge-train-stacked.mjs`), so QM-TEST-02 runs on recorded fixtures; `scripts/merge-train.mjs` reads `pull.body` into the queue and delegates to it.
4. Step 1.3 — `SDLC.md` "QA" (block template and rules) and "The automation contract" (who writes and keeps the block); new repo-local override `.ai/skills/om-open-pr/SKILL.md`; `.github/PULL_REQUEST_TEMPLATE.md` points to the block; `BACKWARD_COMPATIBILITY.md` lists the four markers as merge-train surfaces.
5. Tests: QM-TEST-01 in `merge-train-plan.test.mjs`, QM-TEST-02 in `merge-train-holds.test.mjs` + `fixtures/merge-train-holds.json`; held-shape assertions updated in the plan and batch tests.
6. Live dry run of the train (`MERGE_TRAIN_DRY_RUN=1`, read-only) against `wladku/Vereino`.

## Decisions

- **The hold comment is edited, not re-posted.** Spec: "WHEN the block exists THEN the hold comment links to it". A PR held before this change, or whose block is written later, would otherwise keep a stale comment; the train PATCHes its one marked comment when its wanted text differs. Existing pre-QM-P1 hold comments are rewritten on the first pass after merge.
- **A hidden marker `<!-- merge-train:qa-instruction-missing -->`** in the missing-variant comment, so the picker (ops, outside the repository) finds held PRs without a block without parsing prose.
- **An empty block counts as missing**, so a template pasted unfilled does not pass. For the same reason the PR template only points at `SDLC.md` instead of shipping the markers with placeholders.
- **Separate module** for the comment I/O (`merge-train-holds.mjs`) rather than more code in `merge-train.mjs`, which is excluded from coverage; the new file is covered at 100 %.

## Files changed

`scripts/merge-train-plan.mjs`, `scripts/merge-train-holds.mjs` (new), `scripts/merge-train.mjs`, `packages/app/scripts/__tests__/merge-train-plan.test.mjs`, `merge-train-batch.test.mjs`, `merge-train-holds.test.mjs` (new), `fixtures/merge-train-holds.json` (new), `SDLC.md`, `BACKWARD_COMPATIBILITY.md`, `.github/PULL_REQUEST_TEMPLATE.md`, `.ai/skills/om-open-pr/SKILL.md` (new), the spec (status `In progress`) and its changelog entry.

## Commands and results

- `yarn workspace @vereino/app test:scripts` → `tests 564, pass 564, fail 0`; coverage 100/100/100 for every file, `merge-train-holds.mjs` and `merge-train-plan.mjs` included.
- `MERGE_TRAIN_DRY_RUN=1 node scripts/merge-train.mjs` (read-only) → `#729: held — risk-high and needs-qa without qa: waits for the owner's manual QA (MT-D02); QA instruction missing`.
- `yarn verify` → passed: 7 steps green, then `format:check` failed on the two new/changed test files; after `yarn format`, `yarn verify --from format:check` → "all 16 step(s) passed".
- Integration tests: none — the change touches no route, command, subscriber or page.

## Open problems / next steps

- **Step 1.4 (backfill, QM-AC-01)**: #729 is the one PR held today and has no block. This run does not edit another run's PR; after merge the train rewrites #729's hold comment with "QA instruction missing", and a `vereino-pr` run (picker rule — ops) or the owner writes the block.
- **Picker rule** for the missing marker and Phase 2 (the e-mail) are ops on the build server, out of scope for #709.
