---
title: "A disabled module's features are never granted; an auth/login interceptor must never throw; pass tenantId to superadmin ACL writes"
modules: ["people", "platform"]
areas: ["architecture", "testing"]
topics: ["acl", "feature-policy", "api-interceptor", "auth-login", "payments-gate", "superadmin"]
---

# A disabled module's features are never granted; an auth/login interceptor must never throw; pass tenantId to superadmin ACL writes

**Context**: Issue #27 (club spec phase 1 steps 4–5, 2026-10-29) built the R10 payments gate before the `payments` module exists and an API interceptor on `POST /api/auth/login` that sends members to `/club`.

**Problem**: (1) The platform denies every feature of a module that is not enabled (`@open-mercato/shared` `security/featurePolicy.ts`), so a test that grants `payments.view_own` by hand still sees it denied — the age layer of the gate cannot be reached through the feature. (2) An error or timeout in an interceptor on `auth/login` turns the sign-in into a 500 / 504 (`shared/src/lib/crud/interceptor-runner.ts`). (3) A superadmin's `PUT /api/auth/users/acl` without `tenantId` writes into the superadmin's own tenant, and a per-user ACL replaces the role ACL instead of adding to it.

**Rule**: A gate for a future module checks its own rule (age, scope) before the feature and is unit-tested for the case the feature cannot reach yet; integration tests drive it through a module CLI command. An interceptor on a sign-in or other critical route catches every error and returns `{}`, and keeps a short `timeoutMs`. Fixtures pass `tenantId` explicitly to superadmin ACL writes and list every feature the user needs.

**Applies to**: gates other modules resolve from DI before they exist; `api/interceptors.ts` of every Vereino module; integration fixtures that write ACLs.
