---
title: "Treat @open-mercato/enterprise as commercial and keep its modules disabled"
modules: ["platform"]
areas: ["architecture", "spec-pr"]
topics: ["licensing", "modules-ts", "enterprise-modules", "dependencies"]
---

# Treat @open-mercato/enterprise as commercial and keep its modules disabled

**Context**: On 2026-10-21 a fact check of the engineering-standards spec found that the scaffold's `packages/app/package.json` lists `@open-mercato/enterprise` 0.9.0 as a production dependency, while every other `@open-mercato/*` package is MIT. Its `package.json` says "SEE LICENSE IN LICENSE.md", and that file forbids production or commercial use, redistribution and derived features without a commercial licence. The first spec draft had claimed "all `@open-mercato/*` packages are MIT".

**Problem**: The package looks like any other platform dependency, and its modules (`record_locks`, `sso`, `security` with MFA, `agent_orchestrator`, plus the scaffold's `agent_examples`) are one environment variable away from being enabled in `packages/app/src/modules.ts` (`OM_ENABLE_ENTERPRISE_MODULES*`). A licence check that only reads the `license` field, or a spec that promises MFA "from the platform", silently depends on commercial code.

**Rule**: Never set `OM_ENABLE_ENTERPRISE_MODULES` (or its `_SSO`, `_SECURITY`, `_AGENTS` variants) to true in any Vereino environment, never import `@open-mercato/enterprise` from Vereino code, and do not plan features (MFA, SSO, record locks) on enterprise modules without a product-owner licence decision. Check each package's licence text, not only the `license` field, before stating a licence fact. Governing decision: ADR-023 and ENG-Q-10 in `.ai/specs/2026-10-21-engineering-standards-and-patterns.md`.

**Applies to**: `packages/app/package.json`, `packages/app/src/modules.ts`, `.env*`, Railway variables, licence checks (`yarn licenses:check`), specs that rely on platform security features.
