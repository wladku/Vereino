---
title: "PUT /api/auth/profile validates its body before command interceptors run; the users routes do not"
modules: ["foundation", "auth", "platform"]
areas: ["testing", "umes"]
topics: ["command-interceptors", "password-check", "error-codes", "integration-tests"]
---

# PUT /api/auth/profile validates its body before command interceptors run; the users routes do not

**Context**: #845 extended TEST-PW01 to send every password refusal to `PUT /api/auth/profile`. A password shorter than
the policy (`only eleven`, policy 12) came back 400 `Invalid profile update.` with zod issues on `password`, not the
422 `password_policy` that `POST`/`PUT /api/auth/users` answer for the same password.

**Problem**: The platform's profile handler parses its body with `buildPasswordSchema()` and answers 400 before it
calls the command bus, so the `foundation.password-check` command interceptor (`auth.users.update`) never sees a
password below the platform policy. The users routes reach the interceptor first and answer with the Vereino code. A
test that expects one status for one rule across all paths fails on the profile path.

**Rule**: A refusal that the platform route's own schema also enforces (minimum length, character classes) answers in
the platform's shape on `PUT /api/auth/profile`: assert 400 with an issue on `password` there, and the Vereino 422 code
only for the rules the platform schema does not know (common list, too long, whitespace, context words). Do not change
the route to unify the codes without a spec change.

**Applies to**: `packages/app/.ai/qa/tests/foundation/TEST-PW01-password-check-api.spec.ts`,
`packages/app/src/modules/foundation/commands/interceptors.ts`, `packages/app/src/app/api/auth/profile/route.ts`,
any command interceptor whose target command sits behind a platform route that validates first.
