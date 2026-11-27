---
title: "Narrowing who may write a value: search every test that seeds it through the old writer"
modules: ["people"]
areas: ["testing", "module-data"]
topics: ["consents", "contract-narrowing", "integration-tests", "fixtures"]
---

# Narrowing who may write a value: search every test that seeds it through the old writer

**Context**: #871 made the `image` consent guardian-or-self only (event photos spec BR-I05). Ten older integration tests
(J-001, E02-S02, E02-S03, ISSUE-191, TEST-002, TEST-003, TEST-006, TEST-L11, TEST-O01, E20-S12) gave `image: true` as the
club administrator — in `createGuardianship`, `setConsents`, the B-10 add form or the ward page form — only as setup or as
"some consent to change", and would have failed with 422 `image_consent_subject_only`.

**Problem**: A test that seeds a value through a writer the change now refuses fails far from the change, in a module
that looks unrelated, and only in CI's integration run; unit tests and `yarn verify` stay green.

**Rule**: When a change narrows who may write a field or a consent, grep `packages/app/.ai/qa/tests` for the field in
API bodies (`image: true`, `"image"`, the form label or testid) and change each staff-seeded case to a value the old
writer may still set (here `regulations` or `trips`), keeping the test's intent; run every changed test locally, one
`--filter` id per run, before the PR.

**Applies to**: `people` consent commands and any later contract narrowing (role-only writes, subject-only consents);
integration fixtures `_fixtures/people.ts` (`createGuardianship`, `setConsents`).
