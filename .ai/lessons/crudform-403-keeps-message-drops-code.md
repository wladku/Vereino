---
title: "A CrudForm shows a 403's server message but drops its code; put what the user must do in the API message"
modules: ["foundation", "platform"]
areas: ["backend-ui"]
topics: ["crud-form", "forbidden", "error-codes", "i18n", "api-client"]
---

# A CrudForm shows a 403's server message but drops its code; put what the user must do in the API message

**Context**: Issue #76 (2026-11-03) gave an account with no linked club person its own 403, `scope_unlinked`, and the persons create form had to explain it.

**Problem**: When a `CrudForm` submit gets a 403, the platform turns the response into an error that keeps the server's `error` message but not its `code`. A form cannot branch on the code, so a hint written only in the UI would need code in every create and edit form of every module.

**Rule**: When a coded 403 must tell the user what to do, write that in the code's registered en + pl message (the API message), because every `CrudForm` shows it as is. A page that renders its own 403 state passes `OWN_FORBIDDEN_STATE` and reads the code with `errorCodeOf(call.result)` from `@vereino/core`.

**Applies to**: Error codes in `packages/app/src/modules/*/lib/error-codes.ts` and their i18n messages; backend pages and forms that show a refusal.
