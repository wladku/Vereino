---
title: "Integration fixtures: a new password ends old tokens, CrudForm inputs need data-crud-field-id, undo takes the actor's latest action only"
modules: ["people", "platform"]
areas: ["testing"]
topics: ["integration-tests", "playwright", "auth-tokens", "crud-form", "undo"]
---

# Integration fixtures: a new password ends old tokens, CrudForm inputs need data-crud-field-id, undo takes the actor's latest action only

**Context**: Issue #26 (2026-10-29) added the first Playwright tests that mix API calls with a browser session of the same user and the first tests that undo hand-written action routes.

**Problem**: (1) Setting a user's password for the browser sign-in ends that user's earlier API tokens, so later API calls fail with 401. (2) `CrudForm` labels are not bound to their inputs, so `getByLabel` finds nothing. (3) The platform undo endpoint (`audit_logs/api/audit-logs/actions/undo/route.ts`) undoes only the actor's latest undoable action on a resource, and hand-written action routes return no undo token header. (4) `createStaff` builds the e-mail address from the first name, so a non-ASCII name gives an invalid address.

**Rule**: Take a fresh API token after setting a password. Reach CrudForm inputs through `[data-crud-field-id="<field>"] input`. Read the undo token from the actions list and undo in reverse order of the actor's actions. Use ASCII first names in staff fixtures.

**Applies to**: `packages/app/.ai/qa/tests/**`, `packages/app/.ai/qa/tests/_fixtures/**`.
