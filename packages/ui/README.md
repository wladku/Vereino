# @vereino/ui

Reusable Vereino React components.

- **Admin (backend) pages:** components built on shadcn/ui through `@open-mercato/ui` primitives and design tokens. Add new shadcn components here with the shadcn CLI (`components.json` in this package).
- **Member and public (frontend) pages:** components styled with Tailwind CSS utilities and the shared tokens from `packages/app/src/app/globals.css`, which scans this package (`@source`).
- All user-facing text comes from i18n catalogs through props or `useT()` — never hard-coded strings.
- May import `@vereino/core`, React and `@open-mercato/ui`; never `@vereino/app` or `@vereino/db`.
- Public API only through `src/index.ts`.

Check: `yarn workspace @vereino/ui typecheck`.

## Storybook

- Run `yarn generate` once (the tokens import a generated file), then `yarn storybook` and open http://127.0.0.1:6006. `yarn build-storybook` writes a static build to `packages/ui/storybook-static/` (ignored by git).
- Tokens come from `packages/app/src/app/globals.css` through `.storybook/preview.css`; Storybook keeps no copy (S7.1). **Foundations/Tokens** shows them.
- The toolbar switches the language (Polish, English — every story renders through `I18nProvider` with the catalogs in `stories/i18n/`), the theme (light, dark — the `.dark` class) and the viewport (320, 375, 768, 1440 px), which covers the UI evidence of S7.8. The Accessibility panel runs axe with the WCAG 2.2 AA rules (S7.4).
- Stories live in `stories/`, outside `src/`, so the 100 % coverage guard of `src/**` is not affected. Components in `src/` still need their own tests.
- `@open-mercato/ui` imports `class-variance-authority`, `clsx`, `lucide-react` and `tailwind-merge` without declaring them; this package lists them as dev dependencies (same ranges as `packages/app`).
