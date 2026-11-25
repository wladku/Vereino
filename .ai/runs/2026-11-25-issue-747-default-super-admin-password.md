# Default super-administrator on first deploy and the production password policy (#747)

- **Date:** 2026-11-25
- **Agent / tool:** Claude Code (Opus 5.5), `om-auto-fix-issue` with the repo-local override, Cezar run 46622e17
- **Trigger:** `cezar` label on issue #747 (epic #734, found by the ASVS refresh #742)
- **Spec / issue / branch:** no spec (runbook and compliance docs, route `direct`); #747; `fix/issue-747-default-super-admin-password`
- **Status:** documentation done; the owner's check of staging and production for default accounts is still open

## Goal

Make the first deploy create no default account (ASVS V6.3.2), set the production password policy through the
platform's `OM_PASSWORD_*` variables (V6.2.x), and update the ASVS rows. Platform `auth` source stays untouched (S3.1).

## Steps

1. Claimed #747 (assignee, `in-progress`, `🤖` claim comment naming this run, worktree and branch).
2. Read the installed `mercato init` (`OM/cli/src/mercato.ts` step 7, `lib/init-secrets.ts`), `mercato auth setup`,
   `list-users` and `set-password` (`OM/core/src/modules/auth/cli.ts`, `lib/setup-app.ts`) and
   `OM/shared/src/lib/auth/passwordPolicy.ts` with its callers.
3. Ran the runbook on a throwaway PostgreSQL 17 container (`docker run … postgres:17`, random local port; removed
   afterwards) with `NODE_ENV=production`, `yarn generate`, then `yarn initialize --no-examples`:
   - with `OM_INIT_SUPERADMIN_EMAIL`, `OM_INIT_SUPERADMIN_PASSWORD`, `OM_INIT_ADMIN_EMAIL`, `OM_INIT_EMPLOYEE_EMAIL`
     set: `init=0`, users created for the three given addresses;
   - with only the super-administrator variables: `yarn mercato auth list-users` showed the `admin` and `employee` accounts at
     the demo domain `acme.com`, and the check `yarn mercato auth list-users | grep -iE '@acme\.com|^[^|]*\| *(admin|employee)@'`
     printed exactly those two lines;
   - `list-users` with a wrong `TENANT_DATA_ENCRYPTION_FALLBACK_KEY` prints ciphertext instead of e-mails.
4. Checked the policy with `yarn mercato auth set-password` on the same database:
   default policy: `Ab1!xyz` accepted, `correcthorsebattery` refused ("At least {min} characters, One number, One
   uppercase letter, One special character"); with `OM_PASSWORD_MIN_LENGTH=12` and the three `REQUIRE_*=false`:
   `Ab1!xyz` refused ("At least {min} characters"), `correcthorsebattery` accepted.
5. Wrote `docs/ops/deploy.md` (variables, first-deploy steps 2–4, *Default account check*, *Password policy*),
   `packages/app/.env.example` (commented placeholders), the V6 rows of `docs/compliance/asvs-requirements.md` and the
   V6 row and A-7 of `asvs-checklist.md`; updated lesson `mercato-init-seeds-a-default-superadmin`.
6. Filed #779 for what the platform cannot do: one policy for the browser forms, common, breached and context-word
   checks, and the 72-byte/trim issue of V6.2.8.

## Decisions

- **12 characters, no class rules.** ASVS 5.0 level 2 asks at least 8 (15 recommended) and no composition rules; 12
  keeps passphrases practical for club members while well above the minimum. One variable to change if the owner
  wants 15.
- **Derived accounts get own addresses and are deleted**, because `mercato init` always passes
  `--include-demo-users` and would otherwise create `@acme.com` accounts; there is no CLI to delete a user, so the
  runbook uses **Settings → Users**.
- **No password on the command line**: the CLI echoes its arguments, so the runbook uses the variables, and the
  `set-password` fallback uses a throw-away generated value followed by a password reset.
- **Common / breached lists are not accepted in writing here**: that is the owner's call, so #779 asks for a spec.
- **Staging and production were not touched**: an agent holds no Railway access; the check is the owner's (A-7).

## Open problems

- Code read, not browser-checked: the platform's browser password forms read the policy in the browser and keep the
  platform default (#779).
- The owner runs the *Default account check* on staging and production and records the result in #747.

## Next steps

Owner: run the check and set the four `OM_PASSWORD_*` variables on staging and production; decide #779.
