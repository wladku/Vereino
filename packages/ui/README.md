# @vereino/ui

Reusable Vereino React components.

- **Admin (backend) pages:** components built on shadcn/ui through `@open-mercato/ui` primitives and design tokens. Add new shadcn components here with the shadcn CLI (`components.json` in this package).
- **Member and public (frontend) pages:** components styled with Tailwind CSS utilities and the shared tokens from `packages/app/src/app/globals.css`, which scans this package (`@source`).
- All user-facing text comes from i18n catalogs through props or `useT()` — never hard-coded strings.
- May import `@vereino/core`, React and `@open-mercato/ui`; never `@vereino/app` or `@vereino/db`.
- Public API only through `src/index.ts`.

Check: `yarn workspace @vereino/ui typecheck`, `yarn workspace @vereino/ui lint`, `yarn workspace @vereino/ui test`.

## Member components (`src/member/`)

The member layer of the foundation II spec (P-23, DD-G08, DD-G09), Tailwind on the platform's semantic tokens:

- `MemberShell` — the frame of the `/club` pages (brand with an optional logo, the member navigation with `aria-current`, a banner slot, `main`). The router's link component (`Link: React.ComponentType<MemberLinkProps>`) and every label come in through props; the `people` module passes `next/link` and its `t()` results.
- `CalendarList` — one section per club-zone day over `CalendarDay[]` from `@vereino/core`; each item shows the time range (`formatTimeRange`, 24-hour clock in the club zone), the status badge (`done`, `cancelled`; a planned item has none), the title (struck through when cancelled, muted when done, a link when both `Link` and `href` are given), subtitle, group, place with its address, badges as `StatusBadge`s and actions as `Button`s (`onAction(itemId, actionId)`, disabled while `busyItemId` is the item).
- `calendar-format.ts` — the pure helpers behind the list (`formatDayHeading`, `formatTimeRange`, `calendarItemTone`, `badgeVariant`, `actionButtonVariant`, `calendarStatusLabel`, `calendarTitleClassName`).
- `toScheduleItem` — the adapter to the installed schedule family's `ScheduleItem` for the coordinator's `ScheduleView` (`planned` and `done` → `confirmed`, `cancelled` → `cancelled`, `kind: 'event'`, no `color`).

Testing: `yarn workspace @vereino/ui test` runs `node --test` over `src/**/__tests__/*.test.{ts,mjs}` with 100 % line, branch and function thresholds. Node strips types from `.ts` files itself; `scripts/register-tsx.mjs` (loaded through `--import`) transpiles the `.tsx` components with the package's TypeScript so the same run renders them with `react-dom/server` and the coverage report (`--enable-source-maps`) points at the `.tsx` lines. The coverage guard `src/__tests__/coverage-scope.test.mjs` imports every `src/**/*.ts` file, `index.ts` included, so an unexported or untested file fails the threshold. Inside the package, modules import each other through `#src/*` (`.ts`) and `#tsx/*` (`.tsx`) from the `imports` map of `package.json`, which Node, Jest, TypeScript and the bundler all resolve without extension suffixes. `packages/app/src/__tests__/ui/` renders the same components through the app's Jest config, which proves the package resolves from the app.

## Storybook

- Run `yarn generate` once (the tokens import a generated file), then `yarn storybook` and open http://127.0.0.1:6006. `yarn build-storybook` writes a static build to `packages/ui/storybook-static/` (ignored by git).
- Tokens come from `packages/app/src/app/globals.css` through `.storybook/preview.css`; Storybook keeps no copy (S7.1). **Foundations/Tokens** shows them.
- The toolbar switches the language (Polish, English — every story renders through `I18nProvider` with the catalogs in `stories/i18n/`), the theme (light, dark — the `.dark` class) and the viewport (320, 375, 768, 1440 px), which covers the UI evidence of S7.8. The Accessibility panel runs axe with the WCAG 2.2 AA rules (S7.4).
- Stories live in `stories/`, outside `src/`, so the 100 % coverage guard of `src/**` is not affected. Components in `src/` still need their own tests.
- `@open-mercato/ui` imports `class-variance-authority`, `clsx`, `lucide-react` and `tailwind-merge` without declaring them; this package lists them as dev dependencies (same ranges as `packages/app`).
