# Issue #91: public groups, schedule, instructors and club events on the public pages

- **Date:** 2026-11-04
- **Agent / tool:** Claude Code (Opus 5.5), `om-auto-fix-issue` with the repo-local override applied, run unattended by cezar
- **Trigger:** `/om-auto-fix-issue 91` (E06-S09, epic #82)
- **Branch:** `feat/issue-91-public-groups-schedule`, from `main` at 26bda24
- **Status:** stopped before implementation; waiting for the product owner to approve two migrations.

## Goal

The section page (P-02) shows a card for each public group: schedule, the next sessions, requirements and the instructor (if the instructor consents). The club page (P-01) lists upcoming events. Covering spec: `.ai/specs/2026-10-20-vereino-club-management.md`, phase 2 step 9 (TEST-037, REQ-025, AC-025).

## Steps

1. Read the issue, its comments and epic #82. The issue is labelled `feature` with no assignee, no `in-progress` label, no claim comment and no open PR, so the run could take it.
2. Classified it as a feature. The covering spec is `Ready for implementation` for phase 2, step 9.
3. Checked what the issue needs against the schema:
   - `groups_groups` has none of the public fields (public flag, public description, conditions, age from/to, level). `groups/data/entities.ts` defers them to the public page story.
   - `people_persons` has no `publish_name_consent_at`. `people/data/entities.ts` and `validators.ts` defer it to this story.
   - So the work needs a `groups` migration and a `people` migration.
4. Looked for the approval that the run contract requires for a migration (from the issue, its spec or an owner comment). The spec's *Rollout, Migration, and Rollback* section asks for user approval before a migration is committed. The issue's Open questions read "None blocking", but neither the issue, epic #82 nor the spec records an approval for these two migrations. Earlier runs had a recorded approval (#85: DD-U05 plus an issue comment; #35/#71: the owner's approval of 2026-11-01).
5. Stopped before claiming. Posted a comment on #91 that names the two migrations and asks for approval. No lock was taken, so there is none to release.

## Decisions

- Stopped rather than implemented: AGENTS.md *Ask First* covers migrations, and the run contract counts one as approved only when the approval is recorded.
- Did not claim the issue, so a stopped run leaves no stray lock (`om-auto-fix-issue` rule: claims belong to the run that made them).

## Files changed

- `.ai/runs/2026-11-04-issue-91-public-groups-schedule.md` (this log).

## Commands and results

- `gh issue view 91` / `gh issue view 82`: read the issue state, labels and comments. No approval found.
- No gate was run because no code changed.

## Open problems

- The owner needs to approve (on #91 or in the spec) the `groups` migration (public flag, public description, conditions, age from/to, level) and the `people` migration (`publish_name_consent_at`).

## Next steps

- Once the approval is recorded, rerun `/om-auto-fix-issue 91`. The feature route runs `om-auto-implement-spec` on phase 2 step 9 of the club management spec.
