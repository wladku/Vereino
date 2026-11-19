---
title: "A module's di.ts never reaches a file that registers commands"
modules: ["platform", "facilities"]
areas: ["architecture"]
topics: ["commands", "dependency-injection", "cli"]
---

# A module's di.ts never reaches a file that registers commands

**Context**: On 2026-11-18 #386 added a rental-link service to `facilities/di.ts`. Its imports led through `request-queue` and `services/calendar.ts` to `commands/zone-rules.ts`, because `calendar.ts` took the `zoneRuleShapeOf` helper from the command file. Every `yarn mercato facilities …` call then failed with "Duplicate command registration for id facilities.zone_rules.create", and eight integration tests broke.

**Problem**: Importing a command file runs its `registerCommand(...)` calls. The CLI loads every module's `di.ts` and also loads the command files through the generated command loaders, so a command file reached from DI registers twice. The Next app does not fail, so only the integration tests, 25 minutes into CI, show it.

**Rule**: Nothing a `di.ts` imports at runtime may import a command file. A helper that services and commands share lives in `lib/` or `data/`, and the command file re-exports it if needed (`data/shapes.ts` holds `zoneRuleShapeOf` and `rentalRateShapeOf`). `yarn verify` runs `di-commands:check` (`packages/app/scripts/vereino-di-commands.mjs`), which walks the runtime imports from each Vereino module's `di.ts` and fails with the import chain.

**Applies to**: every Vereino module's `di.ts` and the services, subscribers and lib files it imports.
