---
title: "yarn initialize seeds a default super-administrator unless its e-mail and password are set"
modules: ["platform", "auth"]
areas: ["debugging", "framework-context"]
topics: ["initialize", "default-account", "deploy"]
---

# yarn initialize seeds a default super-administrator unless its e-mail and password are set

**Context**: The ASVS refresh of 2026-11-25 (#742) found that `docs/ops/deploy.md` runs `yarn initialize --no-examples`
on the first deploy with only `OM_INIT_ADMIN_PASSWORD` set (#747).

**Problem**: `yarn initialize` is the platform's `mercato init`. Its RBAC step creates a super-administrator from
`OM_INIT_SUPERADMIN_EMAIL` / `OM_INIT_SUPERADMIN_PASSWORD` (or `--email=` / `--password=`) and falls back to the
platform's demo e-mail with the password `secret`; it skips the password policy by default and adds derived demo
`admin@` / `employee@` users (`packages/app/node_modules/@open-mercato/cli/src/mercato.ts`, step 7). Setting only
`OM_INIT_ADMIN_PASSWORD` leaves the super-administrator on the defaults.

**Rule**: Any runbook or script that initialises a shared environment sets `OM_INIT_SUPERADMIN_EMAIL` and a generated
`OM_INIT_SUPERADMIN_PASSWORD` (or passes `--email` / `--password`), and afterwards checks that no account with the
platform's demo e-mail domain exists. Read the installed `mercato init` before documenting its variables; do not infer
them from the variable names in older docs.

**Applies to**: `docs/ops/deploy.md` first deploy, staging and production initialisation, ASVS V6.3.2.
