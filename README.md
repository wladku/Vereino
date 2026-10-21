# Vereino

**Open-source management for small multi-section sports clubs — football academy first — built on [Open Mercato](https://www.openmercato.com/).**

> Status: **specification / pre-implementation** — see [`.ai/specs/`](.ai/specs/README.md) and the discovery in [`.ai/specs/research/`](.ai/specs/research/README.md).
> License: MIT.

---

## About

Vereino (from German *Verein* — association, club) is being built for small, typically suburban multi-section clubs: a football academy of up to ~200 players as the main section, alongside other sections on an equal footing (in the pilot: swimming pool, zumba, chess, cheerleading). Today such clubs are run through Messenger groups, Excel and phone calls — often on a facility owned by the municipality.

**What the first release should do** (the Must requirements REQ-001…REQ-035 of the specification)

- people with multiple roles (guardian, coach, coordinator, treasurer, facility attendant), a guardian account with child profiles, an own login from age 13; a minor participant never sees payments;
- sections with coordinators, groups (teams and class groups on an equal footing), recurring activities → sessions, a calendar filtered by role — a single one for a parent whose children are in different sections;
- attendance declarations and actual attendance, coach substitutions with automatic settlement of coach units;
- announcements to a group/session/section with in-app notifications and e-mail (plus a text with a link to paste into the group chat), a record of difficult cases;
- membership fees, sibling discounts, charges, online payment (Stripe), bank statement import with automatic matching, cash payments with numbered receipts, order campaigns (e.g. kits) instead of Google Forms, the coach's view of their groups' payments with cash handover to the treasurer, a treasurer role limited to finances;
- a sports facility administered on behalf of the municipality (e.g. an Orlik, a municipal sports pitch complex): hour zones, a public schedule without sign-in, bookings entered by staff, internal bookings by coaches of any section without approval, online booking requests from outsiders with administrator approval, bulk-set booking availability, an attendant log (Should), an owner report;
- a public club page with section pages (schedule, terms, prices, instructors, materials, contact — each block switchable), club and section logos;
- a multilingual interface — complete English and Polish catalogs in 1.0, another language = another catalog.

**What we deliberately do not build in 1.0:** training diagrams, a medical module, scouting, individual statistics, Messenger/WhatsApp integration (replaced by the share-to-group text), push notifications (they return with a native app — in 1.0 the channels are in-app and e-mail), online payment for facility renters (requests are online, payment goes to the owner's account), a page editor (CMS), translation of club-entered content, volunteer duty sign-up for sessions (planned for 1.1), a guardians' contact list for coaches, several clubs on one instance (the architecture does not prevent it).

Pilot: KS Gwiazda Ściejowice. Authors: Władek Kuć (product), Kacper Kuć (technology).

## Architecture

### Stack

| Concern | Technology |
|---|---|
| Application framework | [Open Mercato](https://www.openmercato.com/) — modules, commands, CRUD routes, RBAC, events, i18n |
| Web | Next.js (App Router), React, TypeScript (strict) |
| Database | PostgreSQL via MikroORM (entities, migrations, connection pool) |
| Dependency injection | Awilix — each module registers its services in `di.ts` |
| Styling — member and public pages | Tailwind CSS |
| Styling — admin (backend) pages | shadcn/ui (through `@open-mercato/ui` primitives) on Tailwind tokens |
| Background work | Open Mercato queue/workers and scheduler (Redis in production) |
| Payments | Open Mercato `payment_gateways` + Stripe |

### Monorepo

Yarn 4 workspaces. Each workspace keeps its own `node_modules` (`nmHoistingLimits: workspaces`), because Open Mercato tooling resolves framework packages from the application's `node_modules`.

```
packages/
  app/   @vereino/app   the Open Mercato application: Next.js app, Vereino modules in
                        src/modules/<id>/ (entities, migrations, commands, API routes,
                        pages, events, i18n, DI), configuration, dev/runtime scripts
  core/  @vereino/core  reusable domain logic — pure TypeScript, no React/Next.js/database
  db/    @vereino/db    MikroORM/PostgreSQL tooling — shared persistence helpers, migration
                        and seed utilities, test-database helpers
  ui/    @vereino/ui    reusable React components — admin (shadcn/ui) and member/public (Tailwind)
```

Dependency direction (no cycles; packages never import the app):

```
@vereino/app ──► @vereino/ui ──► @vereino/core
      │                                ▲
      └────────► @vereino/db ──────────┘
```

Rules that keep Open Mercato working:

- Module entities, migrations, routes and pages stay in `packages/app/src/modules/<id>/` — Open Mercato discovers them only there. Shared packages hold reusable code, not module surfaces.
- Code moves to `core`/`db`/`ui` when it is reused by at least two modules or is framework-free; module-specific code stays in its module.
- Each package exposes its public API from `src/index.ts`; the app transpiles `@vereino/*` packages (`next.config.ts`) and Tailwind scans `@vereino/ui` (`globals.css`).

### Repository layout

```
packages/               the four workspaces above
.ai/specs/              specifications (YYYY-MM-DD-slug.md); implemented/ and archive/ for the lifecycle
.ai/specs/research/     discovery: business case, stakeholders, benchmark, MoSCoW, decisions D-001…D-013
.ai/runs/               logs of autonomous AI runs
.ai/lessons.md, .ai/lessons/   durable lessons for agents
.ai/guides/             Open Mercato framework guides and generated module facts
docs/ux-concept/        UX concept and clickable mockups (English / Polish)
scripts/                repository and agent tooling (lessons check, skills, harness, Railway start)
docker*, Dockerfile     local infrastructure and the production image
```

The first Vereino modules (`club_core`, `people`, `groups`, `activities`, `communication`, `payments`, `facilities`) are specified in [`.ai/specs/2026-10-20-vereino-club-management.md`](.ai/specs/2026-10-20-vereino-club-management.md).

## Getting started

Requirements: Node.js ≥ 24, Yarn 4 (Corepack), Docker (PostgreSQL and Redis for local development).

### One command

```
npm run setup
```

The installer runs every manual step below. Before each step it checks whether that step is already done and skips it, so you can run it again at any time (for example after pulling new dependencies or migrations). In order, it:

1. checks Node.js;
2. enables Corepack when the pinned Yarn version is missing;
3. installs dependencies when `yarn.lock` or a workspace manifest changed;
4. copies `packages/app/.env.example` when `packages/app/.env` is missing;
5. starts `postgres` and `redis` with `docker compose` when the local database is unreachable;
6. runs `generate` and `db:migrate`;
7. initializes the app only when the database has no users yet;
8. starts `yarn dev`.

`yarn setup` is the same command. Options:

- `--no-dev`: stop before starting the app.
- `--reinstall`: re-initialize a database that already has data.
- `--classic`, `--verbose`, `--database-name <name>`: passed on as before.

If a step fails, the installer stops and names it. Fix the problem and run the installer again.

### Manual steps

```
yarn install
cp packages/app/.env.example packages/app/.env   # database settings; Docker stack in docker-compose*.yml
docker compose --env-file packages/app/.env up -d --wait postgres redis
yarn workspace @vereino/app setup                # generate, migrate, initialize, then start the dev runtime
yarn dev                                         # later runs
```

Before running the production server (`yarn build && yarn start`, Docker, Railway), replace the placeholder `JWT_SECRET` and `AUTH_SECRET` in `packages/app/.env` with fresh values (`openssl rand -hex 32`); the server refuses to start with the example secrets.

Every application command can be run from the repository root (`yarn dev`, `yarn generate`, `yarn typecheck`, `yarn test`, `yarn build`, `yarn mercato …`) — it is delegated to `@vereino/app`. Shared packages: `yarn typecheck:packages`.

See [`AGENTS.md`](AGENTS.md) for the rules coding agents must follow and `.ai/guides/` for framework context.
