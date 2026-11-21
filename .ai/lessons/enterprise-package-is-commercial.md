---
title: "Treat @open-mercato/enterprise as commercial: it is removed and must not come back"
modules: ["platform"]
areas: ["architecture", "spec-pr"]
topics: ["licensing", "modules-ts", "enterprise-modules", "dependencies"]
---

# Treat @open-mercato/enterprise as commercial: it is removed and must not come back

**Context**: On 2026-10-21 a fact check of the engineering-standards spec found that the scaffold's `packages/app/package.json` lists `@open-mercato/enterprise` 0.9.0 as a production dependency, while every other `@open-mercato/*` package is MIT. Its `package.json` says "SEE LICENSE IN LICENSE.md", and that file forbids production or commercial use, redistribution and derived features without a commercial licence. The first spec draft had claimed "all `@open-mercato/*` packages are MIT".

**Problem**: The package looks like any other platform dependency, and its modules (`record_locks`, `sso`, `security` with MFA, `agent_orchestrator`, plus the scaffold's `agent_examples`) are one environment variable away from being enabled in `packages/app/src/modules.ts` (`OM_ENABLE_ENTERPRISE_MODULES*`). A licence check that only reads the `license` field, or a spec that promises MFA "from the platform", silently depends on commercial code. On 2026-11-21 (#466, owner decision ENG-Q-10) the package was removed: the spike #448 found no installed import, only the scaffold example `agent_examples`, which was deleted with it.

**Rule**: Never reinstall or import `@open-mercato/enterprise` (`yarn forbidden-packages:check` in `yarn verify` fails on a manifest entry, a `yarn.lock` resolution — also a transitive one after a platform upgrade — or an import), never set `OM_ENABLE_ENTERPRISE_MODULES` (or its variants) to true, and do not plan features (MFA, SSO, record locks) on enterprise modules without a product-owner licence decision. Check each package's licence text, not only the `license` field, before stating a licence fact. Governing decision: ADR-023 and ENG-Q-10 in `.ai/specs/2026-10-21-engineering-standards-and-patterns.md`.

**Applies to**: `packages/app/package.json`, `packages/app/src/modules.ts`, `.env*`, Railway variables, licence checks (`yarn licenses:check`, `yarn forbidden-packages:check`), platform upgrades that could pull it back in, specs that rely on platform security features.
