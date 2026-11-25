# Run: TEST-F05 — assert the consent audit dates (#720)

- **Trigger:** Cezar run, issue #720 labelled `cezar` (om-auto-fix-issue).
- **Spec:** `.ai/specs/2026-10-27-vereino-foundation-primitives.md` (TEST-F05, REQ-F05, AC-F05).
- **Branch:** `test/issue-720-assert-consent-audit-dates`.

## Goal

TEST-F05 expects "the audit entries carry the dates"; no test asserted it. Add the assertion to an existing integration test (test-only change).

## Steps

1. Read `people/commands/own-consents.ts`: `people.persons.set_own_consents` logs `snapshotBefore` / `snapshotAfter` with the stored consents `{ granted, at, by_person_id }` and `context.consentsChanged`.
2. Chose `people/TEST-L11-own-consents.spec.ts`: it already grants, withdraws and grants the `image` consent again as the adult. After the second grant it reads `GET /api/audit_logs/audit-logs/actions?resourceId=<person>` and asserts three `image` entries whose before/after snapshots carry the grant, withdrawal and second-grant instants returned by the API.
3. First local run failed: `Expected length: 3, Received length: 0`. The fixture administrator holds only `audit_logs.view_self`, so the route lists only the administrator's own actions and hides the adult's. Fix: the test gives the fixture tenant role `audit_logs.view_tenant` (as the superadmin, via `setRoleAclFeatures`) right before the read.
4. Second run: 2 passed.
5. Spec AC-F05 evidence extended; changelog file `.ai/specs/changelog/2026-10-27-vereino-foundation-primitives/2026-11-25-issue-720-consent-audit-dates.md`.

## Decisions

- Assert on the snapshots, not on the order of the entries (`arrayContaining`), so the check doesn't depend on how the audit list is sorted.
- Widen the audit read only inside this test, so the shared fixture's default stays unchanged for other tests.

## Files changed

- `packages/app/.ai/qa/tests/people/TEST-L11-own-consents.spec.ts`
- `.ai/specs/2026-10-27-vereino-foundation-primitives.md` (AC-F05 evidence)
- `.ai/specs/changelog/2026-10-27-vereino-foundation-primitives/2026-11-25-issue-720-consent-audit-dates.md`

## Commands and results

- `yarn test:integration:vereino --filter TEST-L11` — run 1: 1 failed (length 0, see step 3); run 2: 2 passed (1.0m).
- `yarn spec-changelogs:check` — valid.
- `yarn verify` — all 22 steps passed.
- `yarn guard` — no blocking findings.

## Open problems / next steps

None.
