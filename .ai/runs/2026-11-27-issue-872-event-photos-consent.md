# Run: photos and graphics on club events, public only with consent (E30-S03, #872)

- **Trigger:** cezar task a534a72e (`om-auto-fix-issue 872`), unattended.
- **Issue / branch:** #872 / `feat/issue-872-event-photos-consent` (claimed: assignee, `in-progress`, 🤖 comment
  7224339178 naming the worktree, branch and start time).
- **Spec:** `.ai/specs/2026-11-26-vereino-event-photos-and-image-consent.md`, phase 2 (owner approved the `activities`
  migration on #870, comment 7203995918; phase 1 merged in #896).

## Steps

1. First commit, before any upload accepts the new kinds: the public club event read and file route list and stream
   only `poster` and `funder_logo` (spec *Rollback*).
