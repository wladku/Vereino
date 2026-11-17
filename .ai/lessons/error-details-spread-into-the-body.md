---
title: "A coded error's details sit at the top of the body, next to code and error — not under `details`"
modules: ['foundation', 'activities']
areas: ['module-data', 'testing']
topics: ['error-codes', 'api-errors', 'integration-tests', 'specs']
---

# A coded error's details sit at the top of the body, next to code and error — not under `details`

**Context**: #269 (declaration deadline) followed the spec text "409 `declaration_deadline_passed` with `details.confirmBy`" and threw `activitiesErrors.throw('declaration_deadline_passed', { confirmBy })`. TEST-A09 then read `body.details.confirmBy` and got `undefined`.

**Problem**: The foundation error factory (`foundation/services/errors.ts`, S6.7) spreads the details object into the response body: `{ code, ...details, error }`. Spec and issue texts often write `details.<field>` as prose, so a test or a client written from the spec looks in the wrong place. A route's `openApi` text copied from the spec repeats the mistake.

**Rule**: A coded error's details are top-level body fields (`body.confirmBy`, `body.kind`, `body.conflicts`). When a spec says `details.<field>`, implement the factory call as usual, read `body.<field>` in tests and clients, and write "with `<field>` in the body" in the route's `openApi` description.

**Applies to**: every `<module>Errors.throw(code, details)` call, the integration tests and clients that read a coded refusal, and specs that name error details.
