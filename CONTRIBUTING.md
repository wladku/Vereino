# Contributing to Vereino

Thank you for helping. Vereino is an MIT-licensed club management application built on [Open Mercato](https://www.openmercato.com/). This guide says how to set up the repository, how a change travels from an idea to `main`, and which dependencies and platform files need special care.

The engineering reference is [`.ai/specs/2026-10-21-engineering-standards-and-patterns.md`](.ai/specs/2026-10-21-engineering-standards-and-patterns.md) (standards S1–S19). The binding rules for every contributor — people and coding agents alike — are in [`AGENTS.md`](AGENTS.md); the delivery process is in [`SDLC.md`](SDLC.md). This page summarises them; when they disagree, those files win.

By taking part you agree to follow the [Code of Conduct](CODE_OF_CONDUCT.md). To report a vulnerability, do **not** open an issue: follow [`SECURITY.md`](SECURITY.md).

## Local setup

Requirements: Node.js 24 or newer (`.nvmrc`), Yarn 4 through Corepack (the exact version is pinned in `package.json` → `packageManager`), and Docker for the local PostgreSQL and Redis.

```
corepack enable
yarn setup          # install, .env, Docker services, generate, migrate, initialize, yarn dev
```

`yarn setup` checks every step before it runs it, so you can repeat it at any time. The manual steps and options are in the [README](README.md#getting-started). The repository is a Yarn workspace monorepo: the Open Mercato application lives in `packages/app`, and the shared packages `@vereino/core`, `@vereino/db` and `@vereino/ui` in `packages/core`, `packages/db` and `packages/ui` (see the README's *Monorepo* section for what may import what).

Recommended editor extensions for VS Code are listed in [`.vscode/extensions.json`](.vscode/extensions.json); VS Code offers them when you open the folder.

## How a change gets to `main`

1. **Find or file an issue.** Use the bug or feature template under *New issue*. One issue is one change.
2. **Spec first for new capability.** A new capability, a database schema, an API contract, work across modules or work in several phases starts with a spec in `.ai/specs/YYYY-MM-DD-slug.md` (search `.ai/specs/`, `implemented/` and `archive/` for a covering one first and update it instead). Bug fixes, small fixes, documentation, dependency updates and isolated refactors go straight to code. See `AGENTS.md` → *Three-Axis Context Assembler*, Axis 3.
3. **Branch.** Work on `<type>/<kebab-slug>` from `main` — `feat`, `fix`, `docs`, `chore`, `refactor`, `test`, `ci`, `build` or `perf`; for an issue, `<type>/issue-<number>-<slug>`. Never commit to `main`.
4. **Ask first** before you add a dependency, a migration, a new module, or change a public contract (route, schema, event payload, CLI, configuration): say so on the issue and wait for a maintainer. Contract changes follow [`BACKWARD_COMPATIBILITY.md`](BACKWARD_COMPATIBILITY.md).
5. **Commit** with a signed-off [Conventional Commits](https://www.conventionalcommits.org/) message (below).
6. **Run the gate** (`yarn verify`) and the integration tests your change touches.
7. **Open one pull request per change** against `main`. Its title is a Conventional Commits subject, because the squash commit takes it; its description follows [the template](.github/PULL_REQUEST_TEMPLATE.md).
8. **Review and merge.** After the required checks are green and a maintainer approved, the merge train updates the pull request from `main` and squash-merges it, one pull request at a time. Do not merge `main` into an open pull request only to refresh it or to rerun CI, and do not merge by hand while the train runs: fix real failures and conflicts on your branch and push (`SDLC.md` → *Validation gate*).

### Commits and the DCO

Every commit message has the form `type(scope): subject` in English, imperative, with a subject of at most 72 characters (S1.3):

- **Types:** `feat`, `fix`, `docs`, `chore`, `refactor`, `test`, `ci`, `build`, `perf`, `revert`.
- **Scopes:** a Vereino module id (`club_core`, `people`, `groups`, `activities`, `communication`, `payments`, `facilities`, …), a package (`core`, `db`, `ui`), or `spec`, `ai`, `ci`, `deps`, `ops`, `compliance`, `i18n`, `monorepo`.
- **Breaking change** to a contract surface: `type(scope)!: subject` and a `BREAKING CHANGE:` footer.

Every commit is signed off under the [Developer Certificate of Origin](https://developercertificate.org/): commit with `git commit -s`, which adds `Signed-off-by: Your Name <you@example.com>`. The sign-off states that you wrote the change, or have the right to submit it, under the project's MIT licence. The `DCO` check blocks a pull request with an unsigned commit; to fix one, `git commit --amend -s` (last commit) or `git rebase --signoff main` on your own branch, then push.

### The gate

```
yarn verify             # the only gate: the same steps run locally and in CI
yarn verify --list      # the steps
yarn verify --from lint # resume from a step after a fix
```

`yarn verify` runs code generation, type checks, lint, formatting, the design-system, i18n, contract, lesson and spec-changelog checks, unit tests with their coverage thresholds, tooling tests and the production build, and stops at the first failure. Do not replace it with single scripts. `yarn format` fixes formatting of Vereino-owned files.

Routes, commands, subscribers and pages are covered by integration tests (Playwright against a Testcontainers PostgreSQL and a production build):

```
yarn test:integration:vereino --filter <TEST-ID>
```

New or changed pure logic (`packages/app/src/modules/<id>/lib/**`, `packages/core|db|ui/src/**`, the Vereino tooling scripts) ships with unit tests that keep line, branch and function coverage at 100 %. Never lower a threshold, exclude a file or add a coverage-ignore comment to pass.

### Definition of done

A pull request is done when the required checks are green; the governing spec is updated (a changelog file in `.ai/specs/changelog/`, acceptance checkbox); lessons learned are recorded in `.ai/lessons/`; UI changes carry screenshots (both locales, 375 px, light and dark); this guide or a runbook is updated when tooling or operations change; and no `TODO` is left without an issue link (`TODO(#123)`). Work produced by an AI agent also commits its run log in `.ai/runs/` and needs an approving review from a human maintainer.

UI text lives only in the i18n catalogs; every Vereino module ships `i18n/en.json` and `i18n/pl.json`. Repository language is English.

## Review and governance

Vereino has two maintainers with equal merge rights: Władek Kuć (product owner, [@wladku](https://github.com/wladku)) and Kacper Kuć (technology). When they disagree, the product owner decides. Paths listed in [`.github/CODEOWNERS`](.github/CODEOWNERS) — payments, people, migrations, access control, encryption, setup, CI, deployment, `SECURITY.md` and the compliance documents — need the approval of a maintainer who is not the author (S1.5). A maintainer may merge an own pull request outside those paths after the required checks pass.

## Pinned and overridden dependencies

Dependency versions follow the pin rules P1–P6 of the engineering standards: the Open Mercato platform and the packages it is coupled to are pinned exactly and move only together in a platform upgrade run; every other dependency uses a caret range, and `yarn.lock` is the exact pin (`yarn install --immutable` in CI). A new pin or override needs a row in the matching table below in the same pull request; a pin missing from these tables fails review.

### Root `resolutions` (P4)

`resolutions` exist only to force a single copy or a security fix.

| Package | Forced version | Pulled in by | Reason | Remove when |
|---|---|---|---|---|
| `lodash` | 4.18.1 | `react-big-calendar`, `archiver-utils` | Inherited from the Open Mercato 0.9.0 application scaffold: one patched copy for every transitive user. | A platform upgrade run finds the scaffold no longer sets it and every dependent accepts ≥ 4.18.1 without it (`yarn why lodash`). |
| `lodash-es` | 4.18.1 | `react-big-calendar` | Same as `lodash`: inherited from the scaffold, keeps the ES-module build on the same patched release. | Together with `lodash`. |
| `zod` | 4.4.3 | `@open-mercato/core`, `@open-mercato/search`, `@modelcontextprotocol/sdk`, the app | Single copy: the platform's validators and the app's schemas must be the same Zod instance, or schema composition and `instanceof` checks break (P2). Inherited from the scaffold. | Never on its own; it moves with a platform upgrade (P1/P2). |
| `handlebars` | 4.7.10 | `eslint-plugin-boundaries` 7.2.0, `@boundaries/elements` 3.1.1, `ts-jest` | Security fix: 4.7.9, pinned exactly by the boundaries packages, has two critical advisories (GHSA-8r5x-fm3f-whwj, GHSA-p8wg-vrv2-v86f); commit `6fae5849`. | `eslint-plugin-boundaries` and `@boundaries/elements` release a version that depends on ≥ 4.7.10. |

### Exact versions in workspace manifests (P1, P2)

| Package | Version | Workspaces | Rule and reason | Moves when |
|---|---|---|---|---|
| `@open-mercato/*` (every package) | 0.9.0 | `app` (dependencies), `ui` (dev and peer: `shared`, `ui`) | P1: the platform is pinned exactly and every package has the same version. | Only in an upgrade run on `chore/upgrade-open-mercato-<version>` that follows the matching `om-auto-upgrade` skill. Renovate never touches it. |
| `next`, `eslint-config-next` | 16.3.6 | `app` | P2: pinned exactly by the platform scaffold; the platform is built and tested against this release. | With a P1 upgrade. |
| `react`, `react-dom` | 19.2.8 | `app`; `ui` (dev and peer) | P2: scaffold pin; `@vereino/ui` declares the same version as a peer so only one React is installed. | With a P1 upgrade. |
| `@mikro-orm/core`, `@mikro-orm/decorators`, `@mikro-orm/postgresql` | 7.2.5 | `app`; `db` (dev and peer) | P2: platform-coupled ORM; entity metadata and migrations must match the platform's copy. `@mikro-orm/migrations` keeps `^7.1.14` and resolves to the same release through `yarn.lock`. | With a P1 upgrade. |
| `pg` | 8.23.0 | `app` | P2: scaffold pin of the PostgreSQL driver used by MikroORM. | With a P1 upgrade. |
| `date-fns` | 4.4.0 | `app`, `core` | P2: scaffold pin; `@vereino/core` uses the same version so date logic has one copy. | With a P1 upgrade. |
| `awilix` (`^13.0.5`), `zod` (`^4.4.3`) | caret in the manifest | `app` | P2: platform-coupled; the caret range is held by `yarn.lock` and, for `zod`, the root resolution. Renovate ignores them. | With a P1 upgrade. |
| `storybook`, `@storybook/addon-a11y`, `@storybook/addon-docs`, `@storybook/addon-themes`, `@storybook/react-vite` | 10.6.2 | `ui` (dev) | Storybook packages must be the same version as each other; an exact pin keeps the set consistent. | Together, as one update. |
| `vite` | 8.3.4 | `ui` (dev) | Pinned with the Storybook set it builds. | With the Storybook set. |
| `@tailwindcss/vite` | 4.3.3 | `ui` (dev) | Matches the Tailwind CSS release the app resolves (4.3.3), so Storybook renders the same styles. | With the app's Tailwind CSS. |

### Other pins

| What | Where | Pin | Reason |
|---|---|---|---|
| Yarn | root `package.json` → `packageManager` | 4.17.1 with hash | Same package manager for everyone through Corepack. |
| Node.js | `.nvmrc`, `engines`, root `preinstall` guard | ≥ 24 | Runtime baseline of the platform. |
| Package age gate | `.yarnrc.yml` → `npmMinimalAgeGate: 5d` | 5 days, `@open-mercato/*` preapproved | Supply-chain cooldown (P5); `--no-time-gate` only for a security fix, named in the pull request. |
| GitHub Actions | `.github/workflows/*.yml` | full commit SHA | Third-party actions are pinned by SHA (S14.2). |

## Local patches to platform files

Everything in `packages/app` outside the Vereino modules (`packages/app/src/modules/<id>/` for the ids in `packages/app/vereino-modules.json`), the integration tests and the Vereino scripts is *platform-owned*: it comes from the Open Mercato 0.9.0 scaffold and changes only in a platform upgrade or as a recorded local patch (S3.1). The table below is the live list as of 2026-11-20. Every platform upgrade run re-applies and re-checks each row; a new patch needs a row here in the same pull request (and, when it is not planned in S3.1, a changelog entry for the engineering standards spec first). Never edit `node_modules/@open-mercato/*` or `.mercato/generated/**`.

| Platform-owned file | Local patch | Rule / origin |
|---|---|---|
| `packages/app/package.json` | Vereino scripts (`format`, `format:check`, `contracts:check`, `typecheck:qa`, `test:scripts`, `test:integration:vereino`, `glossary:check`, `qa-texts:check`, `di-commands:check`, …) and development tools | S2.1 |
| `packages/app/scripts/i18n-check-hardcoded.mjs` | `--strict` mode for Vereino module paths | S2.4 |
| `packages/app/eslint.config.mjs` | Vereino-path rules, package boundaries, re-enabled React rules | S3.10, ADR-018 |
| `packages/app/jest.config.cjs` | 100 % coverage thresholds for the `lib/` folders of the listed Vereino modules; `react` mapped to the app's single copy so `@vereino/ui` components render in tests | S13.6 |
| `packages/app/scripts/dev-runtime-supervisor.mjs` | Exposes `appendDiagnosticLine`, which `scripts/dev.mjs` calls while a banner recovery action runs; without it `yarn dev` exits with a `TypeError` | S3.1; lesson `dev-runtime-recovery-action-crash` |
| `packages/app/next.config.ts` | `transpilePackages` for `@vereino/*`; `Referrer-Policy: no-referrer` (and `Cache-Control: no-store`) on the token pages and APIs: declaration links, booking request confirmation, rental cancellation | Monorepo; #192, #125, #286 |
| `packages/app/src/modules.ts` | Registers the Vereino modules (`{ id, from: '@app' }`) | `AGENTS.md` |
| `packages/app/src/app/globals.css` | `@source` for `@vereino/ui`; sign-in page body rule; focus ring for the coordinator calendar's scroll regions | Monorepo; #261, #248 |
| `packages/app/src/app/(backend)/backend/layout.tsx` | Club logo and club time zone from the optional `clubCoreSettings` service; `ClubTimeZone` and `SidebarNavBadges` | #29, #231, #260 |
| `packages/app/src/app/(backend)/backend/page.tsx` | `BackendGreeting` above the platform dashboard | #260 |
| `packages/app/src/app/login/page.tsx` | Club header above the platform sign-in form; Vereino page title | #261 |
| `packages/app/src/app/start/page.tsx`, `packages/app/src/components/DemoFeedbackWidget.tsx` | Design tokens instead of hard-coded sizes and colours | `ds:check` |
| `packages/app/src/components/BackendHeaderChrome.tsx` | "Member interface" link for staff linked to a person; organization scope seeded from cookies before the first render; token width | #260, #334 |
| `packages/app/src/components/OrganizationSwitcher.tsx` | Announces scope changes through `organizationScopeSeed` (`@vereino/ui`) so admin lists load once | #334; lesson `admin-lists-load-once-scope-seed` |
| `packages/app/src/components/ClientBootstrap.tsx` | A `member` profile: `/club` pages load translations, injection and the `payments` client registries | S4.3; #32, #110 |
| `packages/app/src/i18n/{en,pl,de,es,ko}.json` | Vereino brand for the app shell and sign-in page; dashboard empty state; `vereino.*` keys of the platform-owned components above | #260, #261 |
| `packages/app/public/open-mercato.svg` | The Vereino mark in place of the platform logo | #261 |
| `packages/app/.ds-check-ignore` | Bounded baseline of scaffold styling that `ds:check` accepts in platform-owned files, each entry with a reason | `ds:check` |
| `packages/app/.env.example` | E-mail delivery settings of the `foundation` dispatch (`OM_TEST_MODE`, `OM_DISABLE_EMAIL_DELIVERY`) | #71 |
| `Dockerfile`, `.dockerignore`, `docker-compose*.yml`, `docker/scripts/dev-entrypoint.sh`, `scripts/railway-start.sh`, `scripts/railway-worker.sh`, `.railwayignore` | Paths moved to the `packages/app` workspace; image installs only `@vereino/app` and copies the shared packages | Monorepo |

Files Vereino added inside platform-owned folders (for example `packages/app/src/components/BackendGreeting.tsx`, `ClubTimeZone.tsx`, `SidebarNavBadges.tsx`, `use-staff-person.ts` and `packages/app/src/__tests__/`) are Vereino code, not patches; an upgrade keeps them as they are.

## Questions

Ask on the issue you are working on, or open a feature issue for an idea. For anything about conduct, see the [Code of Conduct](CODE_OF_CONDUCT.md); for security, [`SECURITY.md`](SECURITY.md).
