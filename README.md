# Vereino

**Open-source management for small multi-section sports clubs — football academy first — built on [Open Mercato](https://www.openmercato.com/).**

> Status: **discovery / pre-implementation** — see [`.ai/specs/research/`](.ai/specs/research/README.md).
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

## Structure

```
.ai/specs/research/     discovery: business case, stakeholders, benchmark, MoSCoW,
                        decisions D-001…D-012, interview scripts, domain-model draft
.ai/specs/              specifications (SPEC-000 template, authored via om-spec-writing)
src/modules/            Vereino modules (club_core, people, groups, activities,
                        communication, payments, facilities) — to be created
```

## Getting started

```
yarn install
cp .env.example .env     # database settings; Docker stack in docker-compose*.yml
yarn setup
yarn dev
```

See `AGENTS.md` for agent rules and `.ai/guides/` for framework context.
