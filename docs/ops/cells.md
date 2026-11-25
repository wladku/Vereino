# Cells: when one instance is full

One production instance (a **cell**) serves many clubs: one app service, one worker service, one PostgreSQL and one
Redis on Railway, updated by one deploy (D-034; many-clubs spec
[`2026-11-22-vereino-many-clubs-one-instance.md`](../../.ai/specs/2026-11-22-vereino-many-clubs-one-instance.md),
DD-M12). When a cell reaches the limits of the capacity report ([`capacity.md`](capacity.md)), the next clubs go to a
**new, identical cell**; the database is never split between cells and a club lives in exactly one cell.

## What a cell is

| Part | Same in every cell | Own per cell |
|---|---|---|
| Code | the same Docker image and release tag, deployed by the same pipeline ([`deploy.md`](deploy.md)) | — |
| Services | app, worker, PostgreSQL, Redis (Railway templates, the settings of `deploy.md`) | the Railway environment and its variables |
| Database | the same migrations | its own PostgreSQL, its own backups ([`backups.md`](backups.md)) |
| Secrets | — | `JWT_SECRET`, `AUTH_SECRET`, `TENANT_DATA_ENCRYPTION_FALLBACK_KEY` (or its key store) |
| Addresses | the address scheme `<public_slug>.<club domain>` | its own club domain, e.g. `c2.vereino.org` (`VEREINO_CLUB_DOMAIN`) and `APP_URL` |
| Clubs | — | its clubs; a slug is unique inside a cell, and the maintainers keep slugs unique across cells too (the cell list below) |

The reserved slugs `c1`…`c9` (`clubs.md`) keep cell names free as subdomains.

## When to open a new cell

Open the next cell **before** the current one reaches any limit of the capacity report, not after:

- the number of clubs reaches the planning ceiling of `capacity.md` for the cell's sizing; or
- the p95 of a hot route at the evening peak stays above 800 ms for a week (monitoring, [`monitoring.md`](monitoring.md)); or
- the 06:00 burst does not drain within 20 minutes (`yarn mercato foundation club-jobs status`); or
- the database outgrows its plan (size, connections, CPU), per `capacity.md`.

Moving an existing club between cells is an export and a re-import, not a database move; it is not automated and is
avoided: new clubs go to the new cell, existing clubs stay.

## Opening a cell (runbook)

1. **Railway.** Create an environment (or project) `production-c<N>` with the four services, the same settings as
   production (`deploy.md`: Redis persistence and `noeviction`, the worker's start command, `RATE_LIMIT_STRATEGY=redis`).
2. **Variables.** New secrets for this cell (never copy another cell's `JWT_SECRET`, `AUTH_SECRET` or encryption key);
   `APP_URL` and `VEREINO_CLUB_DOMAIN` of the cell; the e-mail sender of production.
3. **Domain.** A wildcard DNS record and certificate for `*.c<N>.<domain>` (owner action, as D12 for the first cell).
4. **Deploy and initialise.** Deploy the current release tag; run the one-time initialisation of `deploy.md`. The
   pre-deploy step migrates the new database.
5. **Backups and monitoring.** The nightly off-site dump of the new database ([`backups.md`](backups.md)), its restore
   drill, the heartbeat checks and alerts of `monitoring.md`, each named with the cell.
6. **Demo club.** Create the maintainers' demo club in the cell (`clubs.md`) and run the smoke check.
7. **Register the cell** in the list below, in the same pull request as any change to this runbook.

From then on every release deploys to every cell, one after the other, in the release window; the release issue
lists the cells and the smoke check of each.

## Cells

| Cell | Railway environment | Club domain | Opened | Clubs (ceiling) |
|---|---|---|---|---|
| c1 | `production` | `vereino.org` (D-036) | — | ≈ 250–300 clubs at the sizing of the 300-club step of `capacity.md` |
