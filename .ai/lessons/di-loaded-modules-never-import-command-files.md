---
title: "A module that di.ts loads never imports a command file"
modules: ["facilities", "platform"]
areas: ["module-data", "debugging"]
topics: ["di", "commands", "cli"]
---

# A module that di.ts loads never imports a command file

**Context**: In #124, `facilities/di.ts` registered a public block provider whose service imported `zoneRuleShapeOf` and `rentalRateShapeOf` from `commands/zone-rules.ts` and `commands/rental-rates.ts`. Every page and route kept working, but `yarn mercato facilities rental-lifecycle` failed with `Duplicate command registration for id facilities.rental_rates.create`, so TEST-023 failed only in CI. To reproduce it without a database, run `DATABASE_URL=postgres://nobody:none@127.0.0.1:1/none yarn mercato facilities rental-lifecycle --tenant <uuid> --org <uuid>`: the duplicate error appears before the connection error.

**Problem**: A command file calls `registerCommand` when it is imported. The CLI loads each module's `di.ts` and also loads the generated command registry, so a command file reached through `di.ts` registers twice. The app server does not show this, so typecheck, unit tests and the page tests all stay green.

**Rule**: Nothing imported, directly or indirectly, by a module's `di.ts` (services, providers, subscribers' helpers) may import from `commands/`. Put pure mappers and helpers that commands share with services in `data/` or `lib/` (for example `facilities/data/shapes.ts`), and have the command file re-export them. After changing what `di.ts` reaches, run one module CLI command with an unreachable `DATABASE_URL` to check.

**Applies to**: `packages/app/src/modules/*/di.ts` and everything it imports; module CLI commands (`cli.ts`).
