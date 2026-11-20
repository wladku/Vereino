# Run: issue #308 — anonymise a former person with a retention hold; delete a person created by mistake (E13-S06, phase L6)

- **Trigger:** Cezar `vereino-issue` workflow, label `cezar` on #308 (2026-11-20T03:19Z); skill `om-auto-fix-issue` with the repo-local override (feature route).
- **Spec:** `.ai/specs/2026-11-14-vereino-people-life-cycle-and-data-entry.md`, phase L6 (REQ-L05, TEST-L07, TEST-L08, TEST-L20, AC-L06, J-L04). Ready; migration B, the feature `people.persons.anonymize`, the event `people.person.anonymized` and the first emission of `people.person.deleted` approved on #255 (2026-11-16, items 2, 5, 7). Dependencies #306, #307 merged; #310 (the job) merged, so step 5 lands here (gap c9).
- **Branch:** `feat/issue-308-anonymise-former-person` (worktree created by Cezar for this run). Claim: assignee, `in-progress`, 🤖 comment on #308 naming the worktree and the run.

## Steps

1. Read the spec (Erasure, *Anonymised person*, *Retention hold*, *Mistaken person*, the API rows, *Security → Erasure*, phase L6, TEST-L07/L08) and the L4/L5 seam (`people/services/departure.ts` already carries `hasHistory` and the optional `retentionHoldUntil`).
2. V-L03 (phase step 1): the installed `audit_logs` has no per-record purge or redaction (`actionLogService`: log, list, undo/redo claims, backfill; no command). Fallback stands: the residual risk under *Security*.
3. Migration B (`anonymized_at`, `erasure_hold_until`, partial index per organization) generated with `yarn db:generate` against an unreachable database, `lock_timeout` added; never applied.
4. Pure rules `people/lib/erasure-rules.ts` (refusal reasons, typed last name, hold, step 5 due, delete reasons, visible name) with 100 % unit coverage.
5. `people/services/erasure.ts` (facts through the contributors, the erasure writes, photo file ids and release) and `people/commands/erasure.ts` (`people.persons.anonymize`, not undoable; `people.persons.delete`, undoable); routes `POST /api/people/persons/{id}/anonymize` and `DELETE /api/people/persons/{id}`; error codes `anonymize_blocked`, `confirmation_mismatch`, `person_in_use`, `person_anonymized`; feature and event.
6. Guards: 409 `person_anonymized` on return, person edit, and the undo of person/profile edits, own consents, photo, departure and guardianship commands.
7. Read side: "Former member" in the detail and list reads, the person directory (`findPersons`) and the global search presenter; name searches drop anonymised persons; `anonymizedAt` / `erasureHoldUntil` (manage only) in the views.
8. Job step 5 `erasure_names` (`namesErased`), registered in `LIFE_CYCLE_STEPS`.
9. `payments` notice `open_charges` carries the oldest open charge as `recordId`; `facilities` `hasHistory` counts person rentals and internal bookings; the `facilities:person-anonymized` subscriber clears rental contact snapshots (`services/person-erasure.ts`).
10. Leaving tab: "Anonymise" dialog (request, what goes now and on the hold date, typed last name, reasons with links, Ctrl/Cmd+Enter), the anonymised state, "Delete person" with the reasons; header badge; en/pl texts.
11. TEST-L07 (with TEST-L08 and TEST-L20) integration spec.

## Decisions

- Both routes require the person's version (default `authorizeScoped` lock): the delete is a delete of an editable record (AGENTS.md), and an irreversible erasure should not run on a stale page. The UI sends the header and reloads on a 409.
- The name under the hold stays in `first_name`/`last_name`; a cleared name is two empty strings and every reader shows the label. The directory returns the label in `firstName` with an empty `lastName` (consumers join `first last`) and `anonymized: true`.
- Search tokens cannot be deleted durably (the query index rebuilds them from the row), so name searches filter `anonymized_at` (lesson `search-tokens-rebuild-from-the-stored-row`).
- Person photos: #312 uploaded them with a second assignment, which `releaseScoped` refuses. New uploads carry the owner only and the read expects the owner assignment; the erasure releases every photo file id found in the photo audit entries (read through the audit API); a pre-#308 file is counted as kept.
- "Messages" in *Mistaken person* is covered without a `communication` contributor: messaging needs an account, a role, a guardianship or a membership, each a reason already.
- TEST-L08 uses a manual charge (the `payments` history) and a guardianship instead of an attendance: an attendance needs a group membership, which would be the first reason found.
- The undo guard (`person_anonymized`) is unit-of-replay code; in TEST-L07 the platform refuses the superseded token first, so the test accepts either refusal.
- TEST-L07 does not open a thread or an attendance list in the browser; the directory label is what those screens read.
- The departure-request "done" state: an open erasure request becomes `done` with the anonymisation.

## Commands and results

- `yarn generate`, `yarn typecheck`, `yarn typecheck:qa` — pass.
- `npx jest` erasure rules — 18 passed, 100 % coverage.
- `yarn test`: first failed — `people error codes › declares the people codes…` (the four new codes); updated; 116 suites, 1644 tests passed.
- `yarn test:integration:vereino --filter TEST-L07`:
  - run 1: TEST-L07 and TEST-L08 failed — `{"code":"lock_token_required"}` (400) on the anonymise and delete calls; TEST-L20 passed. Kept the version check (decision above), the UI and the test send the header.
  - run 2: TEST-L07 failed — `{"error":"Undo token not available"}` (400) on the undo of the earlier edit: the platform already refuses a superseded token; the assertion accepts 400 or 409 and still checks the phone stays null.
  - run 3: TEST-L07 failed — the raw `first_name` was the ciphertext of `''` (the column is encrypted); the cleared name is now checked through the read and the page header.
  - run 4: **3 passed** (TEST-L07 14.2 s, TEST-L08, TEST-L20).
- Regressions: `--filter TEST-L03` (departure, return; 3 passed), `--filter TEST-L18` (photo upload and read; 2 passed).
- `yarn lint` on the changed files: fixed `module` variable, type-only imports, `@mikro-orm` import in a subscriber (moved to `facilities/services/person-erasure.ts`), set-state-in-effect, template literal numbers; an apostrophe that broke two OpenAPI strings.
- `yarn verify`: all 18 steps passed.

## Files

`people/migrations/Migration20261120032800_people.ts` (+ snapshot), `people/data/entities.ts`, `data/validators.ts`, `acl.ts`, `events.ts`, `lib/error-codes.ts`, `lib/erasure-rules.ts` (+test), `lib/life-cycle-rules.ts` (+test), `lib/person-photo.ts`, `lib/__tests__/people-rules.test.ts`, `services/erasure.ts`, `services/former-member.ts`, `services/life-cycle.ts`, `services/person-directory.ts`, `commands/erasure.ts`, `commands/shared.ts`, `commands/persons.ts`, `commands/self.ts`, `commands/own-consents.ts`, `commands/photos.ts`, `commands/departures.ts`, `commands/guardianships.ts`, `api/shared.ts`, `api/persons/route.ts`, `api/persons/[id]/route.ts`, `api/persons/[id]/anonymize/route.ts`, `api/persons/[id]/photo/route.ts`, `search.ts`, `components/ErasurePanel.tsx`, `LeavingPanel.tsx`, `PersonRecord.tsx`, `client-helpers.ts`, `useGrantedFeatures.ts`, `i18n/en.json`, `i18n/pl.json`; `payments/services/departure-contribution.ts`; `facilities/services/departure-contribution.ts`, `services/person-erasure.ts`, `subscribers/person-anonymized.ts`; `packages/app/.ai/qa/tests/people/TEST-L07-anonymise-and-delete.spec.ts`; `BACKWARD_COMPATIBILITY.md`; spec changelog entry; lessons `search-tokens-rebuild-from-the-stored-row` (new), `attachment-owner-assignment-and-release` (updated).

## Open problems / next steps

- V-L03: audit snapshots written before an erasure keep old values (encrypted); needs a platform purge contract (upstream).
- A photo stored before #308 cannot be released by `releaseScoped` (second assignment); its pointer is cleared and the audit context counts it as kept.
- The global search still lists an anonymised person under hold as a "Former member" hit for an old-name query (tokens remain until step 5).

## Run 2 — merge-train failure (om-auto-fix-pr, 2026-11-20)

- Trigger: PR #437 labelled `merge-train-failed`; `integration (shard 6/6)` failed on the up-to-date head (run 44672672908).
- Failure, verbatim: `TEST-L09-coming-of-age.spec.ts:241` — `expect(first.steps).toEqual(['turns_18_soon', 'came_of_age', 'account_age', 'departed_accounts'])` received an extra `"erasure_names"` (both attempts).
- Cause: a test bug, not a product bug. This PR registers life-cycle step 5 `erasure_names` (`people/lib/life-cycle-rules.ts`), and TEST-L09 pins the exact step list of the job. The run 1 regression set (L03, L18) did not include L09.
- Fix: TEST-L09 now expects the five steps in `LIFE_CYCLE_STEPS` order. No other spec asserts the full list (`grep '\.steps)'`).
- Base: `origin/main` (9f036b5c) was already merged into the head; nothing to merge.
- `sg docker -c "yarn test:integration:vereino --filter TEST-L09"` — **1 passed** (18.9 s). `yarn typecheck:qa` and `yarn lessons:check` pass.
- Lesson: `life-cycle-step-added-update-test-l09` (new).
