# Lessons

This catalog indexes 12 focused lessons without loading their full text. Route the task first, then read only records whose **modules**, standalone-harness **areas**, or **topics** match the work.

## How to use this catalog

1. Start with the exact module ID when one is named by the task.
2. Add every matching area from the standalone harness router: `architecture`, `module-data`, `umes`, `backend-ui`, `integration`, `ai-workflow`, `debugging`, `testing`, `framework-context`, or `spec-pr`.
3. Use topics to narrow cross-cutting concerns such as `data-scoping`, `optimistic-locking`, `query-index`, or `generated-files`.
4. Open only the linked lesson records that match; do not bulk-read `.ai/lessons/`.

Useful searches:

```bash
rg -n '\b<module-or-topic>\b' .ai/lessons.md
rg -l '"<area>"|"<module>"|"<topic>"' .ai/lessons/*.md
```

## Adding or updating a lesson

- Copy `.ai/lessons/_template.md` to one focused `.ai/lessons/<kebab-case-slug>.md`; update an existing record instead of duplicating it.
- Preserve the front matter keys `title`, `modules`, `areas`, and `topics`. Use `platform` only when no module or package owns the lesson, and put the primary area first.
- Add or update exactly one catalog row under its primary area below. Keep the title stable when code or specs cite it.
- Put hard boundaries in `AGENTS.md`; lessons explain recurring evidence and the durable rule.
- Run `node scripts/check-lessons.mjs` before committing.

## Catalog

### ai-workflow

- [Subagents never stage changes; commit only explicit paths](lessons/subagents-never-stage-changes.md) — area:ai-workflow; module:platform; topic:subagents,git-staging,commits

### architecture

- [Treat @open-mercato/enterprise as commercial and keep its modules disabled](lessons/enterprise-package-is-commercial.md) — area:architecture,spec-pr; module:platform; topic:licensing,modules-ts,enterprise-modules,dependencies
- [Add Open Mercato UI's undeclared dependencies to any workspace that renders its primitives](lessons/open-mercato-ui-undeclared-deps.md) — area:architecture,backend-ui; module:platform; topic:dependencies,open-mercato-ui,workspaces,storybook
- [Shared packages import their own files through #src/* and take MikroORM decorators from the app](lessons/shared-packages-subpath-imports-and-app-decorators.md) — area:architecture,testing; module:platform; topic:workspaces,typescript,node-test,mikro-orm,dependencies

### backend-ui

- [Use minmax(0, 1fr) for a grid track that holds a horizontally scrolling child](lessons/collapsed-grid-track-needs-minmax-zero.md) — area:backend-ui,debugging; module:platform; topic:css-grid,responsive,overflow,mockups
- [The first .tsx of a Vereino module needs jsx-a11y rules without the plugin object; a stale lock token answers 409 before validation](lessons/eslint-jsx-a11y-and-stale-lock-before-validation.md) — area:backend-ui,debugging; module:club_core,platform; topic:eslint,jsx-a11y,flat-config,optimistic-lock,crud-factory,integration-tests
- [Scan Vereino pages with the platform axe baseline; CrudForm 0.9.0 labels are not associated](lessons/platform-crudform-labels-axe-baseline.md) — area:backend-ui,testing; module:platform,club_core; topic:accessibility,axe,crud-form,app-shell,wcag

### debugging

- [Enable api_keys with auth and set real secrets before the app boots](lessons/empty-preset-needs-api-keys-and-real-secrets.md) — area:debugging,architecture; module:auth,api_keys; topic:modules-ts,mercato-init,env-secrets,empty-preset

### module-data

- [Scoped CRUD lists disable the full export and never send an empty $in; API-created test tenants need the init steps](lessons/scoped-crud-lists-and-api-created-tenants.md) — area:module-data,testing; module:people,foundation; topic:data-scoping,query-engine,crud-export,integration-tests,tenant-setup

### spec-pr

- [Keep explicit pay rates out of research notes in this public repository](lessons/no-explicit-pay-rates-in-research.md) — area:spec-pr; module:platform; topic:discovery,research-notes,privacy,public-repository
- [Retarget a stacked pull request to main before merging it](lessons/retarget-stacked-pr-before-merge.md) — area:spec-pr; module:platform; topic:pull-requests,stacked-branches,github,merge

### testing

- [Use yarn test:integration:vereino; the platform runner waits for the customers module](lessons/platform-integration-runner-needs-customers.md) — area:testing,debugging; module:platform; topic:integration-tests,ephemeral-runner,testcontainers,readiness-probe,agent-browser
