---
number: D-026
date: 2026-10-24
owner: Władek Kuć
source: om-discover session 2026-10-24 — Władek's answers to the three decision points of the second spec consistency review (`.ai/runs/2026-10-23-spec-consistency-review-2.md`)
status: confirmed
---
# D-026 The three decision points of the second spec consistency review

1. **Bulk import and group memberships (REQ-036, DD-38).** The import ships in phase 1 with the `people` module, before `groups` exists, and `people` must not depend on `groups`.
   - Phase 1: the commit creates persons and guardianships; the group column of a row is kept on the row.
   - Phase 2: `groups` registers an optional DI hook (`groups.membershipImporter`) that the import calls when it is present; it creates the memberships. Without it, rows that carry a group stay in the review queue.
   - REQ-036 stays Must and is closed in two phases (people in phase 1, memberships in phase 2).
2. **The DD-35 exception in `AGENTS.md`.** The exception Władek approved in D-024 (one read-only, index-backed system-scope lookup of a public slug or token hash for the sessionless routes, only while V-12 finds no installed contract) is written into `AGENTS.md`, in the same pull request as the spec, so that an implementing agent does not treat it as a forbidden operation.
3. **Scope of the declaration kind (REQ-007).** What is declared (`absence_only` or `confirm`) is a club setting per activity type (`club_settings.declaration_kinds`, D-022). The group policy (`activities_attendance_policies`) decides only who declares for a ward with an account. No per-group override of the kind in 1.0.
   - The journeys and mock-ups follow the default: a training or class asks only for absences; a match asks for confirmation.

**Consequences in the spec:**
- REQ-036, DD-38, the import route, TEST-051, phases 1 and 2, the traceability row and the DI surface row carry the two-phase split and the optional hook.
- DD-35 and the Security section cite the `AGENTS.md` exception; the compliance report no longer lists the decision point as open.
- REQ-007, the Declaration policy row, `/backend/activities/policies`, J-002 step 3, the Today and coach-list mock-ups, TEST-009 follow the per-activity-type kind.

**To change:** a superseding record approved by the owner.

**Revisit:** at the exit gate of phase 2 (the hook and the first club running `absence_only` and `confirm` side by side).
