# Run: person data export for access and portability requests (#527)

- **Trigger:** Cezar `om-auto-fix-issue` run on the `cezar` label of issue #527 (task 56b9d224), 2026-11-22.
- **Spec:** `.ai/specs/implemented/2026-11-21-vereino-person-data-export.md` (merged in #540, approved by the owner on
  #527 on 2026-11-22: Q-X01 resolved, the A-2, A-3, A-4 (with the DD-X04 migration) and A-9 defaults accepted).
- **Branch:** `feat/issue-527-club-admin-person-data-export`; one PR, `Closes #527`.

## Goal

A club administrator downloads one JSON file holding one person's data from every Vereino module. The file must
leave out other people's data, be tenant- and organization-scoped, and be logged before any data is read (GDPR art. 15
and art. 20).

## Steps

1. Claimed #527 with three signals: the assignee, the `in-progress` label and a `🤖` comment naming this run. The
   earlier spec run (54df79ad) had released its claim on 2026-11-21.
2. **Phase X1** (by hand):
   - `people/lib/data-export.ts`: the pure rules (`redactPerson`, `redactConsents`, `omittedParts`, `reviewRequiredOf`,
     `withoutSecrets`, `assembleDataExport`, `dataExportFileName`), with unit tests at 100 %.
   - `people/services/data-export.ts`: the contract `PersonDataExportContributor`, the `people.dataExport.<module>`
     tokens, the people part, the foundation part and the assembly.
   - `foundation/services/data-export.ts`: the public helper `personDeliveriesForExport`.
   - The `PersonDataExportLog` entity, with a migration generated against a throwaway PostgreSQL container
     (`pg-527-dbgen`, stopped afterwards, never migrated).
   - The route `GET /api/people/persons/{id}/data-export`, the ACL feature `people.persons.export` and the error code
     `person_not_found` (404).
3. **Phase X2** went to five child tasks, each scoped to one module's files: groups + club_core, activities,
   communication, payments, facilities. I reviewed each diff for leaked person ids, scope filters and type-only imports
   of the contract, then merged each one with `--no-ff`.
4. **Phase X3** (by hand): `DataExportPanel` on the Details tab, shown only with `people.persons.export` and a full
   read, with the en/pl keys.
5. Docs:
   - `data-subject-requests.md` §2 rewritten around the export; D-1 closed.
   - DPIA D-13 reduced; DP-5 done.
   - RoPA A10 and retention R12 list `people_data_export_log`.
   - `BACKWARD_COMPATIBILITY.md` documents the versioned document format.
6. Integration tests TEST-X01 to TEST-X04, each run locally with `yarn test:integration:vereino --filter <ID>`.
7. Spec set to `Implemented` and moved to `implemented/`, with a changelog entry. Code links to the spec path updated.

## Decisions

- **One PR for X1–X3.** The owner asked for one implementation PR (`Closes #527`). X2's per-module slices touch
  disjoint files, so they ran in parallel child tasks.
- **`person_not_found` (404) as a coded error.** The spec names it; the person detail route answers an uncoded
  404 instead.
- **The PESEL marker is built from parts.** `ds:check` reads the literal `[withheld: …]` as a Tailwind arbitrary
  value. The value stays as DD-X08 defines it, and a unit test pins it (lesson
  `ds-check-reads-bracketed-word-colon-as-tailwind`).
- **Extra `reviewFields`.** The children added free-text fields beyond the inventory: order notes, bank skip note,
  rental decision reason and notes, entry-ban reason, internal-booking purpose and cancel reason, thread subject and
  message body. All are free text that may name other people (A-9), so they stay; the spec changelog records them.
- **Memberships are not `portable`, contracts are.** Memberships are assigned by the club; a contract is concluded by
  the person.
- **Not exported:** attendance declarations a guardian made for a ward appear in the ward's export, not as an actor
  count in the guardian's. The inventory does not list them (suggestion from the activities child).

## Files changed

- `people`:
  - `lib/data-export.ts` and its test
  - `services/data-export.ts`
  - `api/persons/[id]/data-export/route.ts`
  - `data/entities.ts`
  - `migrations/Migration20261122094238_people.ts` and the snapshot
  - `acl.ts`
  - `lib/error-codes.ts` and the error-code test
  - `components/DataExportPanel.tsx`, `PersonRecord.tsx`, `useGrantedFeatures.ts`
  - `i18n/en.json`, `pl.json`
- `foundation`: `services/data-export.ts`, `index.ts`.
- `groups`, `club_core`, `activities`, `communication`, `payments`, `facilities`: each has
  `services/data-export-contribution.ts`, `lib/data-export.ts` and its test, and a `di.ts` registration.
- Tests: `packages/app/.ai/qa/tests/_fixtures/data-export.ts` and the people specs TEST-X01 to TEST-X04.
- Docs: `BACKWARD_COMPATIBILITY.md`, `docs/compliance/{data-subject-requests,dpia,retention,ropa}.md`.
- Lessons: `ds-check-reads-bracketed-word-colon-as-tailwind` (new), `sessionless-tests-new-request-context` (recurrence).

## Commands and results

- `yarn typecheck`, `yarn typecheck:qa`: exit 0.
- `npx jest` on the new lib tests: every `lib/data-export.ts` at 100 % lines, branches and functions.
- `yarn db:generate` against the throwaway database: only `people: generated Migration20261122094238_people.ts`. One
  table and one index; `down()` added by hand.
- TEST-X02, first run: `error: inconsistent types deduced for parameter $1`. The test's own SQL used `$1` for a uuid
  and a text column. Fixed.
- TEST-X02, second run: `Expected: 401 Received: 403`. The `request` fixture kept the session cookies. Fixed with a
  fresh request context. Third run: `1 passed`.
- TEST-X03: `1 passed`.
- TEST-X04, first run: `POST /api/club_core/sections {"error":"Unauthorized"}`. `signInBrowser` ends the
  administrator's API token, so the coordinator setup moved before it. Second run: `1 passed`.
- TEST-X01, first run: `declaration_kind_absence_only`. Training sessions take absence reports only; the declaration
  is now `no`. Second run: `Received: 201`, so the setup calls accept 200 or 201. Third run: 403 `scope_denied` on
  `/absence`, because the group's coach is not the session's assigned coach; the administrator now assigns the coach
  with a reason. Fourth run: `1 passed`.
- `yarn verify`: see the PR body.

## Open problems / next steps

- No rate limit on the export (spec *Risks*, accepted for v1).
- Self-service export by the member stays deferred (A-5).
