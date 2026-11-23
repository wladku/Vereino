# Onboarding a club

How the maintainers start a new club on the shared production instance, from the signed agreement to the first coach
signing in. One club is one tenant with one organization (many clubs spec
[`2026-11-22-vereino-many-clubs-one-instance.md`](../../.ai/specs/2026-11-22-vereino-many-clubs-one-instance.md),
DD-M01); the club is created with one command, `club_core create-club` (#630). Self-service sign-up stays off
(`SELF_SERVICE_ONBOARDING_ENABLED=false`), and billing is outside this runbook.

Time: about 15 minutes of operator time (steps 1–4); the rest is the club's own work, with the operator on call.

## Before you start

- [ ] **The agreement is signed**: the service agreement and the data processing agreement (GDPR art. 28) are signed by
      the club and filed. Nothing below runs before that.
- [ ] **Pre-conditions of a second real club** (Q-M07, #628): while only the maintainers' demo club runs on the
      instance, skip this. Before the first *real* club after it, a key store (Vault or a managed KMS) holds the
      tenants' data-encryption keys in production, and the cross-club isolation test (`ISSUE-628-cross-club-isolation`)
      is green on `main`. If either is missing, stop and tell the product owner.
- [ ] **From the club** (by e-mail, never in a ticket or chat): the club's full name, the public slug it wants, the
      first administrator's first name, last name and e-mail address, and its time zone and language if not
      `Europe/Warsaw` and Polish.
- [ ] **The slug**: lower-case letters, digits and single hyphens, 3–60 characters, for example `orlik-zielonka`. It
      becomes the club's address (`https://<slug>.<club domain>` once `VEREINO_CLUB_DOMAIN` is set, until then
      `<APP_URL>/p/<slug>`) and is printed on notice boards and QR codes, so agree it with the club. Reserved, never a
      club's: `www`, `app`, `api`, `admin`, `mail`, `status`, `c1`…`c9`.
- [ ] **The administrator's e-mail** has no account on the instance yet. One address can administer one club through
      this command; for a person who already has an account in another club, ask for another address, or have the
      club's administrator add them later from the panel.

## 1. Check the command (dry run)

Open a shell on the production **app** service (`railway ssh`, or the service's shell in Railway) and run:

```bash
yarn mercato club_core create-club --dry-run \
  --slug orlik-zielonka --name "UKS Orlik Zielonka" \
  --admin-email anna.nowak@example.org --admin-first-name Anna --admin-last-name Nowak \
  --timezone Europe/Warsaw --locale pl
```

It writes nothing and prints one JSON line:

| `status` | Meaning | Next |
|---|---|---|
| `dry-run`, `problems: []` | The slug is free and the e-mail has no account | Step 2 |
| `dry-run`, `problems: ["admin_email_taken"]` | The e-mail already has an account | Ask the club for another address |
| `dry-run`, `problems: ["organization_slug_taken"]` | An organization on the instance already uses the slug | Agree another slug |
| `exists` | A club already holds the slug | Stop: agree another slug, or the club exists already (its ids are printed) |
| `invalid` (exit 1) | An option is missing or malformed (`problems` names it, e.g. `slug` `reserved`) | Fix the option |

## 2. Create the club

The same command without `--dry-run`. In one run it:

1. creates the club's tenant and organization through the platform's own setup (`setupInitialTenant`): the tenant's
   data-encryption key, the encryption maps, the platform roles, and the administrator's user **without a password**;
2. stores the club's address (the public slug), time zone and language in the club settings;
3. runs every module's club setup (`seedDefaults`, as `yarn initialize` does): the `vereino_*` roles and their
   features, the dictionaries such as the PZPN age categories, and the club's scheduled jobs (role expiry, import
   purge, life cycle, occurrences, reminders, charges, rentals, e-mail dispatch, …);
4. makes the administrator the club's first `club_admin` (`people.persons.bootstrap_admin`);
5. e-mails the administrator an invitation in the club's name and language (`--locale`): a one-time link to set the password, valid 48 hours.
   No password is ever typed on the command line or shown to the operator;
6. emits `club_core.club.created`.

It prints one JSON line: `status: "created"`, the `tenantId`, `organizationId`, `address`, `adminUserId`,
`adminPersonId`, the tenant's `roles`, the organization's `schedules` and `invitation.expiresAt`. Paste the ids (not
the e-mail) into the club's onboarding issue.

| Result | Meaning | What to do |
|---|---|---|
| `created`, no `invitation.warning` | Done | Step 3 |
| `created`, `invitation.warning: "invite_email_failed"` | The club exists; the e-mail did not leave | Check the mail provider (`monitoring.md`), then run the finish command of *A run that stopped halfway* |
| `exists` (exit 0) | A finished club already holds the slug; **nothing was changed** | Running the command twice is safe; check the printed ids are the club you meant |
| `incomplete`, `step: "unknown"` (exit 1) | A club holds the slug but its first run stopped before it had an administrator | Finish it: *A run that stopped halfway* below |
| `refused`, `admin_email_taken` / `organization_slug_taken` (exit 1) | Nothing was written | Another e-mail; another slug |
| `incomplete` (exit 1) | The tenant was created but the named `step` failed; `tenantId` and `organizationId` are printed | Finish it: *A run that stopped halfway* below |

## 3. Verify the club

- [ ] `schedules` lists the club's jobs, at least `foundation:dispatch-sweep`, `people:sync-role-expiry`,
      `people:life-cycle`, `activities:generate-occurrences`, `payments:generate-charges`,
      `facilities:rental-lifecycle`. With the sweep jobs of phase 1 (#629) this check moves to
      `yarn mercato foundation club-jobs status`.
- [ ] `roles` contains `admin`, `employee` and the `vereino_*` roles, and **not** `superadmin`.
- [ ] Sign in as the maintainers' superadmin, open **Settings → Organizations**: the club is a new tenant with exactly
      one organization.
- [ ] The administrator received the invitation (ask them). If not, or after 48 hours, see the end of
      *A run that stopped halfway*.

## 4. Hand the club over

Send the administrator, in Polish and English as they prefer:

- the club address and that the invitation link is valid 48 hours;
- the first-steps list below;
- how to reach the maintainers (support address) and the release window (`deploy.md`, *Release window*).

## 5. The club's first steps (the administrator, with the operator on call)

1. **Set the password** from the invitation link and sign in; the panel opens at `/backend`.
2. **Club settings** (`/backend/club/settings`): short name, bank account (26 digits, shown to payers), contact
   phone, consent texts if the club has its own, rules and privacy-policy links.
3. **Structure**: sections (`/backend/club/sections`), places (`/backend/club/places`) and institutions; the season
   (`/backend/groups/seasons`); check the PZPN age categories (`/backend/groups/age-categories`).
4. **Groups** (`/backend/groups/groups`): one group per team or training group, with its age category. Create the
   groups **before** the import, so the import's `group` column finds them.
5. **Import the families from the club's spreadsheet** (D23; club spec REQ-036; #28), `/backend/people/imports`:
   - the file is CSV or XLSX, at most 5 MB and 1,000 rows, one row per participant, with the participant and up to
     two guardians in columns: first name, last name, birth date, PESEL, the club's own identifier, e-mail, phone —
     for the participant, guardian 1 and guardian 2 — and the group name;
   - upload it, check the suggested column mapping (Polish and English headers are recognised), then read the
     preview: every row is `new`, `matched` (an existing person by the identifier or PESEL), `review` (decide: match,
     create or skip) or `error` (the column is named; fix the sheet and upload again);
   - commit. People, guardianships and group memberships are created; each can be undone on its own record. The
     staged rows and the file are deleted 30 days after the commit (`people:purge-import-rows`);
   - re-importing the same sheet with the identifier column matches the people instead of creating them twice.
6. **Fees** (`/backend/payments/fees`) and discounts, if the club collects fees through Vereino; the first charges
   are generated at 06:00 club time.
7. **Coaches**: for each coach, the person record (from the import or `/backend/people/persons/create`) → **Roles**
   → `coach` of their section or group; then **Account** → **Create account** with the coach's e-mail. The coach gets
   an invitation e-mail.
8. **Publish the club page** when it is ready (`/backend/club/publication`): switch the page and the blocks on; it is
   then at the club address.
9. **The first coach signs in** from their invitation and sees their groups on the phone. Onboarding is complete;
   close the club's onboarding issue with the date.

## A run that stopped halfway

`status: "incomplete"` (exit 1) names the `step` that failed (`tenant` — the platform setup after the tenant and
organization were created —, `settings`, `module defaults`, `club administrator`, `invitation`, `event`, or `unknown`
for a re-run that found a half-created club) and prints the club's `tenantId` and `organizationId`; the earlier steps are done. Read the
error on stderr and fix its cause (database, mail provider). Then run the **same command with the printed ids**:

```bash
yarn mercato club_core create-club \
  --slug orlik-zielonka --name "UKS Orlik Zielonka" \
  --admin-email anna.nowak@example.org --admin-first-name Anna --admin-last-name Nowak \
  --timezone Europe/Warsaw --locale pl \
  --tenant <tenantId> --org <organizationId>
```

It finds the organization and the administrator inside that tenant, runs every step after the tenant again — each is
idempotent — and prints `status: "completed"`. On a club that already has its administrator it seeds nothing and
emits nothing again: it only sends the invitation anew. The invitation goes out only while the administrator has no
password, and a new one makes every earlier link stop working. After a failed `tenant` step the administrator's user
may be missing (`admin_not_found`): ask the maintainers' lead before creating it by hand. It refuses (exit 1, nothing written) with `organization_not_found`, `admin_not_found` (the e-mail is not a
user of that organization) or `public_slug_taken` (another club holds the slug). `--dry-run` checks the same without
writing.

Never run `create-club` again **without** the ids for a half-created club: the administrator's e-mail already has an
account, so it is refused, and a run with another e-mail would create a second tenant.

The administrator lost the invitation or it expired (48 hours): run the finish command above. While the
administrator has no password it sends a new 48-hour link and the old one stops working; nothing else changes.

## Related

- `deploy.md` — releases, the per-club setup commands after a release, the first deploy of an environment.
- `monitoring.md` — the jobs and e-mail checks.
- `backups.md` — the backup and restore runbook; a club's export and deletion come with phase 4 (#632).
