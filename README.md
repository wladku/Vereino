# Vereino

**Open-source management for small multi-section sports clubs — football academy first — built on [Open Mercato](https://www.openmercato.com/).**

> Status: **specification / pre-implementation** — see [`.ai/specs/`](.ai/specs/README.md) and the discovery in [`.ai/specs/research/`](.ai/specs/research/README.md).
> License: MIT.

---

## About

Vereino (from German *Verein* — association, club) is being built for small, typically suburban multi-section clubs: a football academy of up to ~200 players as the main section, alongside a swimming pool and extra classes (zumba, pilates, gym). Today such clubs are run through Messenger groups, Excel and phone calls — often on a facility owned by the municipality.

**What the first release should do**

- people with multiple roles (guardian, coach, coordinator, facility attendant), a guardian account with child profiles, an own login from age 13;
- sections with coordinators, groups (teams and class groups on an equal footing), recurring activities → sessions, a calendar filtered by role — a single one for a parent whose children are in different sections;
- attendance declarations and actual attendance, coach substitutions with automatic settlement of coach units;
- announcements to a group/session/section with push and e-mail, a record of difficult cases;
- membership fees, sibling discounts, charges, online payment;
- a sports facility administered on behalf of the municipality (e.g. an Orlik, a municipal sports pitch complex): hour zones, a public schedule without sign-in, bookings, an attendant log, an owner report.

**What we deliberately do not build:** training diagrams, a medical module, scouting, individual statistics, Messenger/WhatsApp integration.

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
.ai/specs/research/     discovery: business case, stakeholders, benchmark, MoSCoW, decisions D-001…D-012
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

```
yarn install
cp packages/app/.env.example packages/app/.env   # database settings; Docker stack in docker-compose*.yml
yarn setup
yarn dev
```

Before running the production server (`yarn build && yarn start`, Docker, Railway), replace the placeholder `JWT_SECRET` and `AUTH_SECRET` in `packages/app/.env` with fresh values (`openssl rand -hex 32`); the server refuses to start with the example secrets.

Every application command can be run from the repository root (`yarn dev`, `yarn generate`, `yarn typecheck`, `yarn test`, `yarn build`, `yarn mercato …`) — it is delegated to `@vereino/app`. Shared packages: `yarn typecheck:packages`.

See [`AGENTS.md`](AGENTS.md) for the rules coding agents must follow and `.ai/guides/` for framework context.
