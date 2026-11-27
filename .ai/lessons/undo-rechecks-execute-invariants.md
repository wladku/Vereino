---
title: "An undo writes the snapshot back past execute's checks; re-run every state invariant in undo, under the same lock"
modules: ["payments", "platform"]
areas: ["module-data"]
topics: ["commands", "undo-redo", "invariants", "advisory-lock"]
---

# An undo writes the snapshot back past execute's checks; re-run every state invariant in undo, under the same lock

**Context**: PR #183 (issue #108) locked a fee's period once the fee had charges (422 `fee_period_locked`), but only in `payments.fees.update.execute`. The update's `undo` called `undoRestore`, which wrote `before.period` back unchecked. Changing a fee from `monthly` to `one_off`, generating, then undoing the change turned the fee monthly again with one-off charges already issued, so the next month billed the same people again. The audit undo route reaches it, because it picks the latest undoable entry per resource and the generation is another resource. The check also ran without the club's generation lock, so a running generation could still read the old period.

**Problem**: An invariant that depends on other records (charges, bookings, memberships) can change between the original command and its undo. `undoRestore`-style helpers copy the snapshot back field by field and know nothing about the invariant, so any check that lives only in `execute` is bypassed.

**Rule**: Put every invariant that guards a field transition in one helper, and call it from both `execute` and `undo` with the value about to be written (the patch in execute, the snapshot in undo). When the invariant counts rows that another command writes, take that command's lock (here `tryLockGeneration`, answering 409 `generation_in_progress`) before counting. Cover it with an integration case that changes, triggers the dependent write, undoes and expects the coded refusal.

**Also for consents and erasure (#870 spec review, 2026-11-26)**: the same bypass applies to a person's decision. If an administrator undoes a guardian's withdrawal of the `image` consent, the snapshot's grant comes back and a child's photo becomes public again. Replaying the undo or redo of a file command after an erasure relinks the erased person's picture (lesson `undoable-upload-redo-relinks-stored-file`). When you design an undoable command that touches consent or erasable data, state in the spec which transitions undo must never write back: a withdrawal never becomes a grant, and an erased record never returns. Test the undo explicitly (`.ai/specs/implemented/2026-11-26-vereino-event-photos-and-image-consent.md`, BR-I06, BR-I07).

**Applies to**: `packages/app/src/modules/*/commands/*.ts`, every undoable update whose execute refuses a transition based on dependent records; `payments.fees.update` (`assertPeriodChangeAllowed`); consent commands in `people` (`set_consents`, `set_own_consents`, `guardianships.update|end`) and picture commands in `activities`.
