# Run: issue #870 — spec for event photos and graphics with the guardian's image consent

- **Goal and trigger:** cezar task (`om-auto-fix-issue` 870, label `cezar`). Story E30-S01 of epic #866 asks for a spec under `.ai/specs/`, written with `om-spec-writing`, that is ready for the two build stories #871 and #872.
- **Route:** the issue is a feature story whose deliverable is documentation, so it took the feature route, spec only (`om-auto-write-spec` → `om-spec-writing --autonomous`). Building is out of scope (issue *Scope*).
- **Branch:** `docs/issue-870-photo-image-consent-spec` (renamed from `cez/870`), Cezar worktree.
- **Spec:** `.ai/specs/implemented/2026-11-26-vereino-event-photos-and-image-consent.md` (Status Draft).

## Steps

1. Claimed #870: assignee, `in-progress`, and a `🤖` claim comment naming the worktree, branch and start time. No earlier claim and no open PR referenced the issue.
2. FR triage: no covering spec exists. The closest specs are the club events spec (poster and logos, DD-T10) and the people life-cycle spec (the `image` consent, REQ-L10).
3. Read D-044 and the Q19 row from the open brief-refresh PR #864, without checking it out (`git show FETCH_HEAD:…`).
4. Read the code the design builds on:
   - `people/lib/people-rules.ts` (`effectiveConsents`, subject-only kinds), the guardianship consents route and `ClubWardPage.tsx`;
   - `activities` `ClubEventFile`, `club-event-scope.ts` and `public-events.ts`;
   - `club_core/api/public-shared.ts` (`fileResponse`, `PUBLIC_CACHE_CONTROL`);
   - `docs/compliance` (ropa A2, dpia D-12, retention).
5. Wrote the spec: ids with the letter I, two phases mapped to #871 and #872, seven open questions with recommended defaults, the Ask First items and the lawyer action OA-I1.
6. Corrected an invented route: the guardian already changes consents on `/club/wards/[personId]` through `POST /api/people/guardianships/{id}/consents`.
7. A fresh-context subagent reviewed the spec. Its verified findings were all applied:
   - one guardian could lift the other's veto (fixed by an own-row rule, BR-I05);
   - an administrator's undo could restore a withdrawn grant (fixed by BR-I06);
   - the rollback claim was false, because `clubEventFile` streams any kind (fixed by a filter in the first commit of phase 2);
   - the platform attachment route serves any file of the organization (fixed by a manager-only content route, DD-I12);
   - bytes could not be released while a file has a second assignment, and undo or redo could revive an erased picture (fixed by owner-only storage, a final delete and the BR-I07 tombstone);
   - the carry-over at 18 ignored the veto;
   - the list of consent writers and the request bodies of the existing routes were wrong;
   - the event read is visible to non-managers;
   - "club event deletion" does not exist.
8. Extended the lesson `undo-rechecks-execute-invariants` with the consent and erasure case.

## Decisions

- **No new module.** Pictures are new kinds of `activities_club_event_files`; the consent history goes in a new `people` table.
- **Consent is checked on every public read (DD-I01), not stored.** A withdrawal can never be missed by a job.
- **Defaults that need the owner (⚠):**
  - Q-I01, a veto by either guardian;
  - Q-I02, consents entered by staff do not count;
  - Q-I03, no photos of recognisable people from outside the club.

  The PR stays a draft until these are confirmed.

## Files changed

- `.ai/specs/implemented/2026-11-26-vereino-event-photos-and-image-consent.md` (new)
- `.ai/specs/changelog/2026-11-26-vereino-event-photos-and-image-consent/2026-11-26-issue-870-spec-created.md`, `…-issue-870-review-fixes.md` (new)
- `.ai/lessons/undo-rechecks-execute-invariants.md` (extended)
- this run log

## Commands and results

- `yarn format:check` — 0 unformatted
- `yarn glossary:check` — 0 problems
- `yarn secrets:check` — no secrets found
- `yarn lessons:check` — valid
- `yarn spec-changelogs:check` — valid
- `yarn spec-questions:check` — valid
- `yarn guard` — no blocking findings
- Not run: integration tests and the full `yarn verify` build. This is a docs-only change and touches no code, routes or test files.

## Open problems / next steps

- The owner decides Q-I01–Q-I03 and the Ask First items: two migrations, the narrowing of `set_consents`, and the new DI contract surface. After that the spec can be marked Ready, and #871 (phase 1) and #872 (phase 2) can start.
- The lawyer writes the consent wording and answers Q-I04 and Q-I07 (OA-I1, D-035), before real club data.
- PR #864 (D-044) is still open, so this spec cites decisions that are not yet on `main`.
