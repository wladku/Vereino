# @vereino/ui

Reusable Vereino React components.

- **Admin (backend) pages:** components built on shadcn/ui through `@open-mercato/ui` primitives and design tokens. Add new shadcn components here with the shadcn CLI (`components.json` in this package).
- **Member and public (frontend) pages:** components styled with Tailwind CSS utilities and the shared tokens from `packages/app/src/app/globals.css`, which scans this package (`@source`).
- All user-facing text comes from i18n catalogs through props or `useT()` — never hard-coded strings.
- May import `@vereino/core`, React and `@open-mercato/ui`; never `@vereino/app` or `@vereino/db`.
- Public API only through `src/index.ts`.

Check: `yarn workspace @vereino/ui typecheck`.
