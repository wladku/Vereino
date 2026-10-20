# @vereino/core

Reusable Vereino domain logic: pure TypeScript functions, types and validation schemas shared by several modules — for example sibling-discount rules, money arithmetic in minor units, date and session ranges.

- No React, Next.js, MikroORM or Open Mercato runtime imports; everything here runs in plain Node and in tests without a database.
- Public API only through `src/index.ts`.
- Module-specific logic stays in its module in `packages/app/src/modules/<id>/`.

Check: `yarn workspace @vereino/core typecheck`.
