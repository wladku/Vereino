# Run: issue #527 — spec for the person data export (access and portability)

- **Goal and trigger:** cezar task (`om-auto-fix-issue 527`, label `cezar`), step 1 of 3 (build, draft PR).
- **Spec/issue:** #527. New spec `.ai/specs/implemented/2026-11-21-vereino-person-data-export.md`.
- **Branch:** `docs/issue-527-person-data-export-spec`.

## Steps

1. Read issue #527, `docs/compliance/data-subject-requests.md` (open item D-1) and `docs/compliance/ropa.md`.
2. FR triage:
   - The issue is a feature, labelled `feature`.
   - No export route exists. `people` CRUD routes set `export: { enabled: false }`.
   - No spec in `.ai/specs`, `implemented/` or `archive/` covers it.
   - The only PR mentioning #527 is #529 (merged), the compliance pack that filed it.
3. Claimed the issue: assignee, `in-progress`, and a 🤖 comment naming this run.
4. Inventoried the person-referencing tables, encryption, the `people.departure.*` contributor seam, `auditedRead`
   (P-27) and the scope helpers. A read-only subagent did this.
5. Wrote the spec with `om-spec-writing --autonomous` and the template sections. Added its changelog file.
6. Ran a scope-cohesion review in a fresh-context subagent (om-spec-writing step 8) and fixed every finding:
   - art. 15(4): coached sessions, substitutions and other participants are now counts only; payments on a charge
     paid by someone else leave out the payer details; free text goes into `reviewRequired` (new assumption A-9).
   - The `userId` lookups are bound to the organization, and TEST-X02 adds the subject's rows in a second
     organization.
   - `foundation` contributes through a public helper, so it never imports `people`.
   - Only the `club_admin` grant kind may export.
   - The `omitted`, section and failure-log contracts were made consistent, test traceability fixed, and the
     `people.*` grant source corrected (`packages/core/src/roles.ts`).
7. Opened the spec PR as a draft (owner workflow decision of 2026-11-20).

## Decisions

- **Spec only, no implementation.** The issue says "Needs a spec … Ask First before implementation". The design adds a
  route, an ACL feature and a migration (`people_data_export_log`), which are Ask First items with no recorded
  approval.
- **Contributors behind optional DI tokens `people.dataExport.<module>`.** This mirrors `people.departure.*`, so
  `people` imports no other module.
- **Audit through `auditedRead` and a new append-only table.** The platform access log rotates. `action_logs` rows are
  encrypted and serve mutations.
- Assumptions A-2 (audit logs left out), A-3 (staff actor rows as counts) and A-4 (migration) are marked
  `⚠ NEEDS HUMAN CONFIRMATION`.

## Files changed

- `.ai/specs/implemented/2026-11-21-vereino-person-data-export.md` (new)
- `.ai/specs/changelog/2026-11-21-vereino-person-data-export/2026-11-21-initial-draft.md` (new)
- this run log

## Commands and results

- `yarn verify`: all 18 steps passed (build 54 s). After the review fixes, `yarn verify --from format:check`: all 13 steps passed.
- Integration tests: none. The change is docs-only and adds or edits no test under `packages/app/.ai/qa/tests`.

## Open problems / next steps

- The owner answers Q-X01 (A-2, A-3, A-4, A-9). Then `om-auto-implement-spec` builds phases X1–X3 on their own PR, which
  carries `Closes #527`.

## Step 3 — review round 1 (#540)

- The independent reviewer asked for changes and raised one Important finding. The contributor inventory counted two
  `activities` tables that hold the subject's own data:
  - `activities_contact_access_log`, which records who read a guardian's contacts (art. 15(1)(c));
  - `activities_substitution_entries`, which holds the reason a coach gave for an absence.
- Fixed in the spec:
  - Both tables are now exported rows. The reader appears as a role only. The substitution `reason` is listed in
    `reviewFields`, because it may hold health data.
  - The free-text vocabulary row names `activities_substitution_entries.reason`.
  - TEST-X01 now seeds both tables and also exports the guardian and the coach.
  - A changelog file records the change.
- Findings 2–4 (Minor, optional) are left for the reviewer and owner. The fix scope was Blocking and Important only.
