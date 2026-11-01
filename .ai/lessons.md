# Lessons

This catalog indexes 31 focused lessons without loading their full text. Route the task first, then read only records whose **modules**, standalone-harness **areas**, or **topics** match the work.

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
- [Run Prettier --write on the changed files only, never on a whole module folder](lessons/prettier-write-changed-files-only.md) — area:ai-workflow; module:platform; topic:prettier,formatting,subagents,diff-noise
- [yarn mercato copies .env.example to .env; pass DATABASE_URL explicitly and remove .env and storage/ after a run](lessons/mercato-cli-writes-env-and-storage.md) — area:ai-workflow; module:platform; topic:mercato-cli,db-generate,env,uploads,worktrees

### architecture

- [Treat @open-mercato/enterprise as commercial and keep its modules disabled](lessons/enterprise-package-is-commercial.md) — area:architecture,spec-pr; module:platform; topic:licensing,modules-ts,enterprise-modules,dependencies
- [Add Open Mercato UI's undeclared dependencies to any workspace that renders its primitives](lessons/open-mercato-ui-undeclared-deps.md) — area:architecture,backend-ui; module:platform; topic:dependencies,open-mercato-ui,workspaces,storybook
- [Shared packages import their own files through #src/* and take MikroORM decorators from the app](lessons/shared-packages-subpath-imports-and-app-decorators.md) — area:architecture,testing; module:platform; topic:workspaces,typescript,node-test,mikro-orm,dependencies
- [A disabled module's features are never granted; an auth/login interceptor must never throw; pass tenantId to superadmin ACL writes](lessons/future-module-gates-and-auth-login-interceptors.md) — area:architecture,testing; module:people,platform; topic:acl,feature-policy,api-interceptor,auth-login,payments-gate,superadmin
- [date-fns-tz offsets are wrong around DST: read them through formatInTimeZone and resolve the gap and the ambiguity yourself](lessons/date-fns-tz-dst-offsets-and-wall-time-resolution.md) — area:architecture,testing; module:activities,platform; topic:date-fns-tz,time-zones,dst,recurrence,rfc-5545
- [Nested commandBus calls flush their side effects at once; pass transactionalEm and bulkImport, emit after the commit](lessons/nested-commands-in-one-transaction.md) — area:architecture; module:people,platform; topic:commands,transactions,events,indexing,optimistic-lock

### backend-ui

- [Injection spots on /club need the member client-bootstrap profile; StatusBadge drops data-testid; member buttons must wrap at 320 px](lessons/club-routes-need-the-member-bootstrap-profile.md) — area:backend-ui,testing; module:activities,people,platform; topic:injection-widgets,client-bootstrap,member-pages,status-badge,reflow,playwright
- [Use minmax(0, 1fr) for a grid track that holds a horizontally scrolling child](lessons/collapsed-grid-track-needs-minmax-zero.md) — area:backend-ui,debugging; module:platform; topic:css-grid,responsive,overflow,mockups
- [The first .tsx of a Vereino module needs jsx-a11y rules without the plugin object; a stale lock token answers 409 before validation](lessons/eslint-jsx-a11y-and-stale-lock-before-validation.md) — area:backend-ui,debugging; module:club_core,platform; topic:eslint,jsx-a11y,flat-config,optimistic-lock,crud-factory,integration-tests
- [Scan Vereino pages with the platform axe baseline; CrudForm 0.9.0 labels are not associated](lessons/platform-crudform-labels-axe-baseline.md) — area:backend-ui,testing; module:platform,club_core; topic:accessibility,axe,crud-form,app-shell,wcag
- [An empty platform DataTable fails axe scrollable-region-focusable at 375 px; render the empty state outside the table](lessons/empty-datatable-axe-at-375.md) — area:backend-ui; module:people,platform; topic:data-table,axe,empty-state,mobile

### debugging

- [Enable api_keys with auth and set real secrets before the app boots](lessons/empty-preset-needs-api-keys-and-real-secrets.md) — area:debugging,architecture; module:auth,api_keys; topic:modules-ts,mercato-init,env-secrets,empty-preset

### module-data

- [Scoped CRUD lists disable the full export and never send an empty $in; API-created test tenants need the init steps](lessons/scoped-crud-lists-and-api-created-tenants.md) — area:module-data,testing; module:people,foundation; topic:data-scoping,query-engine,crud-export,integration-tests,tenant-setup
- [Hide a per-caller column outside the CRUD projection; a club-wide read of a section-scoped kind uses clubWideKinds](lessons/hidden-columns-and-club-wide-reads-in-scoped-lists.md) — area:module-data,architecture; module:people,foundation; topic:data-scoping,crud-factory,after-list,consents,acting-role
- [A list entityId must match the ORM class name; ACL dependsOn is diagnostics only, so grant *.view explicitly](lessons/query-engine-entity-ids-and-acl-depends-on.md) — area:module-data,architecture; module:groups,platform; topic:query-engine,crud-factory,entity-id,acl,role-features
- [Declare a uuid[] column with columnType; serialize capacity checks with a per-organization advisory lock](lessons/mikro-orm-uuid-array-column-and-advisory-schedule-lock.md) — area:module-data; module:activities,platform; topic:mikro-orm,migrations,postgres-arrays,advisory-lock,concurrency,conflicts
- [Serve a public file through attachmentService.readScoped with the slug-derived scope and its exact owner, assignment and partition](lessons/public-attachments-through-read-scoped.md) — area:module-data; module:club_core,platform; topic:attachments,public-pages,sessionless,uploads,content-type
- [The upload service adds the owner as an assignment; releaseScoped needs it to be the only one](lessons/attachment-owner-assignment-and-release.md) — area:module-data; module:people,platform; topic:attachments,uploads,purge,retention
- [A required lock token must spare the audit redo and a singleton's first save](lessons/required-lock-token-redo-and-first-save.md) — area:module-data,debugging; module:foundation,club_core,platform; topic:optimistic-locking,commands,undo-redo,authorize-scoped

### spec-pr

- [Keep explicit pay rates out of research notes in this public repository](lessons/no-explicit-pay-rates-in-research.md) — area:spec-pr; module:platform; topic:discovery,research-notes,privacy,public-repository
- [Retarget a stacked pull request to main before merging it](lessons/retarget-stacked-pr-before-merge.md) — area:spec-pr; module:platform; topic:pull-requests,stacked-branches,github,merge

### testing

- [Use yarn test:integration:vereino; the platform runner waits for the customers module](lessons/platform-integration-runner-needs-customers.md) — area:testing,debugging; module:platform; topic:integration-tests,ephemeral-runner,testcontainers,readiness-probe,agent-browser
- [Integration fixtures: a new password ends old tokens, CrudForm inputs need data-crud-field-id, undo takes the actor's latest action only](lessons/integration-fixture-pitfalls-tokens-crudform-undo.md) — area:testing; module:people,platform; topic:integration-tests,playwright,auth-tokens,crud-form,undo
- [One axe baseline entry per rule; a test reported at hours means a suspended host; db:generate for a new module needs a seed snapshot](lessons/axe-baseline-suspended-runs-and-offline-db-generate.md) — area:testing,debugging; module:groups,platform; topic:axe,accessibility-baseline,playwright,host-suspend,db-generate,migrations
- [Reload after emulateMedia before an axe scan; a react-query refetch after an error keeps status error](lessons/axe-after-color-scheme-and-react-query-error-refetch.md) — area:testing,backend-ui; module:people,platform; topic:axe,dark-mode,playwright,react-query,loading-state
- [A sessionless integration check needs request.newContext(); rate limits are off under OM_INTEGRATION_TEST](lessons/sessionless-tests-new-request-context.md) — area:testing; module:club_core,platform; topic:playwright,sessionless,public-pages,rate-limits,status-badge
- [Drive the platform date picker through its grid after networkidle; assert the row, not the flash, after a CrudForm redirect](lessons/platform-date-picker-and-crudform-redirects-in-tests.md) — area:testing; module:platform,people; topic:date-picker,crudform,playwright,journeys
- [The platform apiFetch throws ForbiddenError on every 403, so a page's own 403 branch never runs; test the forbidden state in the UI](lessons/apifetch-403-throws-before-page-branch.md) — area:backend-ui,testing; module:activities,platform; topic:api-client,forbidden,error-states,journeys
