---
title: "Platform client pages that read process.env by a computed key need the server value handed over"
modules: ["foundation", "auth", "platform"]
areas: ["backend-ui", "umes"]
topics: ["process-env", "password-policy", "client-components", "nextjs"]
---

# Platform client pages that read process.env by a computed key need the server value handed over

**Context**: #779. Production sets `OM_PASSWORD_MIN_LENGTH=12` and turns the character classes off, but the platform's
change-password, profile, reset and user create/edit pages are client components that call `getPasswordPolicy()` in
the browser. It reads `env[key]` with a computed key, which Next.js never inlines, so the forms kept the platform
default (6 characters, a digit, upper case, special) and refused passphrases the server accepts.

**Problem**: `next.config.ts` `env` and `NEXT_PUBLIC_*` only replace literal `process.env.X` references; a computed
read in platform code gets an empty object in the browser. Copying the five pages to fix it means owning ~1 500 lines
of platform UI.

**Rule**: Read the value on the server (root layout) and hand it to a small client component that writes it into the
browser's `process.env` during its render, before the pages below it (`src/components/PasswordPolicyBridge.tsx`). The
bundler's `process` polyfill is one shared object, so the platform module sees the values. Protect such a bridge with a
browser test in a production build that fails without it (TEST-PW02: a lower-case passphrase is accepted by the reset
form). Also: a command interceptor on `auth.users.create`/`update` runs before the platform's own password validation,
so its refusal (422) is what `PUT /api/auth/users` answers even for a too-short password.

**Applies to**: `packages/app/src/app/layout.tsx`, `src/components/PasswordPolicyBridge.tsx`, any platform client page
that reads server configuration through `process.env[...]`; `foundation/commands/interceptors.ts`.
