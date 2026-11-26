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
platform's demo e-mail with the password `secret`; it skips the password policy by default and always adds two
derived users (`packages/app/node_modules/@open-mercato/cli/src/mercato.ts`, step 7, passes `--include-demo-users`).
Setting only `OM_INIT_ADMIN_PASSWORD` leaves the super-administrator on the defaults. A run on a throwaway database
(#747, 2026-11-25) showed two more traps the code comments hide: the derived users are `admin` and `employee` at
the platform's demo domain `acme.com` (`auth/lib/setup-app.ts` `DEFAULT_DERIVED_EMAIL_DOMAIN`), **not** the super-administrator's
domain, unless `OM_INIT_ADMIN_EMAIL` / `OM_INIT_EMPLOYEE_EMAIL` are set; and `mercato init` prints all three
passwords in its closing box, while every `yarn mercato <cmd>` echoes its arguments (`Running auth:set-password
--email … --password …`), so a password passed as an argument lands in the terminal.

**Rule**: Any runbook or script that initialises a shared environment sets `OM_INIT_SUPERADMIN_EMAIL` and a generated
`OM_INIT_SUPERADMIN_PASSWORD`, sets `OM_INIT_ADMIN_EMAIL` / `OM_INIT_EMPLOYEE_EMAIL` to own addresses and deletes
those two accounts afterwards, passes no password as a CLI argument it would keep, and checks with
`yarn mercato auth list-users` (it decrypts e-mails with the environment's key) that no `@acme.com` account exists. Read the installed `mercato init` before documenting its variables; do not infer
them from the variable names in older docs.

**Applies to**: `docs/ops/deploy.md` first deploy, staging and production initialisation, ASVS V6.3.2.
