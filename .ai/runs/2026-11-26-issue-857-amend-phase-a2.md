# Run — #857: amend phase A2 of the foundation primitives spec

- **Goal and trigger:** cezar run (task 4d8a2acb) on issue #857, labelled `cezar`; skill `om-auto-fix-issue` with the repo-local override.
- **Issue / spec / branch:** #857; `.ai/specs/implemented/2026-10-27-vereino-foundation-primitives.md` (moved from `.ai/specs/`); branch `docs/issue-857-foundation-primitives-consent-toggle`.

## Steps

1. Read the issue and the owner's decision comment (2026-11-26, `OWNER`): build the shared `ConsentToggle` with #871 (E30-S02, the guardian's image consent, its second consumer — #871 owns it); drop the `vereino:club:header` spot; this issue is done once the spec amendment lands.
2. Claimed the issue (assignee, `in-progress`, `🤖` claim comment naming the run).
3. Amended the spec: the extension-point list drops `vereino:club:header` with the reason; the `ConsentToggle` UI row and the phase A2 deliverables and implementation status name the hand-over to #871 and the dropped spot; status set to `Implemented`.
4. Added the changelog file `2026-11-26-issue-857-amend-phase-a2.md` (no row appended to the frozen table).
5. Moved the spec to `implemented/` with `git mv` and fixed every path-qualified link (`AGENTS.md`, the `foundation`, `club_core` and `people` READMEs, the scheduling primitives spec's sources line). Bare file-name mentions in sibling specs are names, not links, and stay.
6. Ran `yarn verify`.

## Decisions

- **Spec set to Implemented although `ConsentToggle` is not built:** every acceptance criterion was already ticked (#719), and the owner moved the primitive's delivery to #871, which builds it with its second consumer under REQ-F16. Tracking it on #871 rather than keeping this spec open follows the issue's "done when" and the owner's comment.

## Files changed

- `.ai/specs/implemented/2026-10-27-vereino-foundation-primitives.md` (moved + amended)
- `.ai/specs/changelog/2026-10-27-vereino-foundation-primitives/2026-11-26-issue-857-amend-phase-a2.md`
- `AGENTS.md`, `packages/app/src/modules/{foundation,club_core,people}/README.md`, `.ai/specs/implemented/2026-10-27-vereino-foundation-scheduling-primitives.md` (links)
- this run log

## Commands and results

- `yarn spec-changelogs:check` — valid.
- `yarn verify` — all 23 steps passed.

## Open problems / next steps

- `ConsentToggle` in `packages/ui/src/member/` is built on #871.
