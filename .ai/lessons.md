# Lessons

This catalog indexes the focused lessons without loading their full text. Route the task first, then read only records whose **modules**, standalone-harness **areas**, or **topics** match the work.

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
- Add or update exactly one catalog row under its primary area below, in file-name order within the section (`lessons:check` enforces it, so parallel branches rarely touch the same line). `.gitattributes` merges this file with `merge=union`, so a local `git merge` keeps rows both sides added; GitHub's merge button ignores that, so merge `main` locally when it reports a conflict here. Keep the title stable when code or specs cite it.
- Put hard boundaries in `AGENTS.md`; lessons explain recurring evidence and the durable rule.
- Run `node scripts/check-lessons.mjs` before committing.

## Catalog

### ai-workflow

- [A rule that must answer 422 is checked in the command, not in the Zod request schema, because a parse failure answers 400](lessons/business-rule-422-not-in-zod-schema.md) — area:module-data,testing; module:club_core,foundation; topic:validation,error-codes,field-errors,zod
- [A claim belongs to the run that made it: a fork or a second session of the same account must not re-enter it](lessons/claim-belongs-to-the-run-not-the-account.md) — area:ai-workflow; module:platform; topic:claim-protocol,parallel-agents,forks,worktrees,orchestration
- [db:generate needs `length` for a bounded varchar, and a concurrent index gets its own non-transactional migration; TabsTrigger drops data-testid](lessons/db-generate-varchar-length-and-concurrent-index-migrations.md) — area:module-data,testing; module:club_core,platform; topic:db-generate,migrations,create-index-concurrently,tabs,playwright,sign-in-browser
- [App Jest maps react to the app's copy, because @vereino/ui dependencies otherwise load a second React](lessons/jest-one-react-for-vereino-ui.md) — area:testing; module:ui,platform; topic:jest,react,duplicate-react,vereino-ui,lucide-react,nm-hoisting
- [yarn mercato copies .env.example to .env; pass DATABASE_URL explicitly and remove .env and storage/ after a run](lessons/mercato-cli-writes-env-and-storage.md) — area:ai-workflow; module:platform; topic:mercato-cli,db-generate,env,uploads,worktrees
- [Book online payments from the provider state, not from payment_gateways events alone](lessons/payment-gateway-events-miss-late-captures.md) — area:integration,framework-context; module:payments,platform; topic:payment-gateways,stripe,events,idempotency,refunds
- [Run Prettier --write on the changed files only, never on a whole module folder](lessons/prettier-write-changed-files-only.md) — area:ai-workflow; module:platform; topic:prettier,formatting,subagents,diff-noise
- [A stopped integration run can leave its next build running; wait for a quiet build directory before the next run](lessons/stopped-integration-run-leaves-its-build-running.md) — area:testing,debugging; module:platform; topic:integration-tests,next-build,background-tasks,host-suspend,worktrees
- [Subagents never stage changes; commit only explicit paths](lessons/subagents-never-stage-changes.md) — area:ai-workflow; module:platform; topic:subagents,git-staging,commits

### architecture

- [date-fns-tz offsets are wrong around DST: read them through formatInTimeZone and resolve the gap and the ambiguity yourself](lessons/date-fns-tz-dst-offsets-and-wall-time-resolution.md) — area:architecture,testing; module:activities,platform; topic:date-fns-tz,time-zones,dst,recurrence,rfc-5545
- [Treat @open-mercato/enterprise as commercial and keep its modules disabled](lessons/enterprise-package-is-commercial.md) — area:architecture,spec-pr; module:platform; topic:licensing,modules-ts,enterprise-modules,dependencies
- [A disabled module's features are never granted; an auth/login interceptor must never throw; pass tenantId to superadmin ACL writes](lessons/future-module-gates-and-auth-login-interceptors.md) — area:architecture,testing; module:people,platform; topic:acl,feature-policy,api-interceptor,auth-login,payments-gate,superadmin
- [A cross-module hook that writes through nested commands hands back its after-commit side effects; a purge that keeps rows for later must sweep purged imports](lessons/hook-side-effects-and-purge-of-waiting-rows.md) — area:architecture,module-data; module:people,groups,platform; topic:commands,events,di-hooks,purge,imports
- [Nested commandBus calls flush their side effects at once; pass transactionalEm and bulkImport, emit after the commit](lessons/nested-commands-in-one-transaction.md) — area:architecture; module:people,platform; topic:commands,transactions,events,indexing,optimistic-lock
- [Add Open Mercato UI's undeclared dependencies to any workspace that renders its primitives](lessons/open-mercato-ui-undeclared-deps.md) — area:architecture,backend-ui; module:platform; topic:dependencies,open-mercato-ui,workspaces,storybook
- [Shared packages import their own files through #src/* and take MikroORM decorators from the app](lessons/shared-packages-subpath-imports-and-app-decorators.md) — area:architecture,testing; module:platform; topic:workspaces,typescript,node-test,mikro-orm,dependencies

### backend-ui

- [Injection spots on /club need the member client-bootstrap profile; StatusBadge drops data-testid; member buttons must wrap at 320 px](lessons/club-routes-need-the-member-bootstrap-profile.md) — area:backend-ui,testing; module:activities,people,platform; topic:injection-widgets,client-bootstrap,member-pages,status-badge,reflow,playwright
- [Use minmax(0, 1fr) for a grid track that holds a horizontally scrolling child](lessons/collapsed-grid-track-needs-minmax-zero.md) — area:backend-ui,debugging; module:platform; topic:css-grid,responsive,overflow,mockups
- [A CrudForm shows a 403's server message but drops its code; put what the user must do in the API message](lessons/crudform-403-keeps-message-drops-code.md) — area:backend-ui; module:foundation,platform; topic:crud-form,forbidden,error-codes,i18n,api-client
- [An embedded CrudForm renders extraActions twice; close a dialog form with the dialog, not a Cancel extra action](lessons/embedded-crudform-extra-actions-render-twice.md) — area:backend-ui; module:platform,communication; topic:crud-form,dialog,embedded,member-pages
- [An empty platform DataTable fails axe scrollable-region-focusable at 375 px; render the empty state outside the table](lessons/empty-datatable-axe-at-375.md) — area:backend-ui; module:people,platform; topic:data-table,axe,empty-state,mobile
- [The first .tsx of a Vereino module needs jsx-a11y rules without the plugin object; a stale lock token answers 409 before validation](lessons/eslint-jsx-a11y-and-stale-lock-before-validation.md) — area:backend-ui,debugging; module:club_core,platform; topic:eslint,jsx-a11y,flat-config,optimistic-lock,crud-factory,integration-tests
- [Scan Vereino pages with the platform axe baseline; CrudForm 0.9.0 labels are not associated](lessons/platform-crudform-labels-axe-baseline.md) — area:backend-ui,testing; module:platform,club_core; topic:accessibility,axe,crud-form,app-shell,wcag
- [A sticky bar above the member bottom navigation uses a spacing-scale offset (bottom-24); ds:check refuses arbitrary values and inline styles](lessons/sticky-bar-above-member-bottom-nav-uses-spacing-scale.md) — area:backend-ui; module:activities,ui; topic:ds-check,tailwind,sticky,member-shell,safe-area,mobile

### debugging

- [The dev banner's recovery actions crashed yarn dev; the supervisor must expose appendDiagnosticLine](lessons/dev-runtime-recovery-action-crash.md) — area:debugging; module:platform; topic:dev-runtime,yarn-dev,local-patch,scaffold
- [Enable api_keys with auth and set real secrets before the app boots](lessons/empty-preset-needs-api-keys-and-real-secrets.md) — area:debugging,architecture; module:auth,api_keys; topic:modules-ts,mercato-init,env-secrets,empty-preset

### module-data

- [The upload service adds the owner as an assignment; releaseScoped needs it to be the only one](lessons/attachment-owner-assignment-and-release.md) — area:module-data; module:people,platform; topic:attachments,uploads,purge,retention
- [A makeCrudRoute list query schema stays a plain z.object: no .refine, cross-field checks go in buildFilters](lessons/crud-list-schema-no-refine.md) — area:module-data; module:people,platform; topic:zod,openapi,make-crud-route,validation
- [db:generate rewrites a module snapshot in its own JSON style, and a public block provider takes its public sections from club_core](lessons/db-generate-snapshot-style-and-public-block-scope.md) — area:module-data,architecture; module:groups,people,activities,club_core; topic:db-generate,migrations,snapshots,public-pages,di-providers,data-scoping
- [Hide a per-caller column outside the CRUD projection; a club-wide read of a section-scoped kind uses clubWideKinds](lessons/hidden-columns-and-club-wide-reads-in-scoped-lists.md) — area:module-data,architecture; module:people,foundation; topic:data-scoping,crud-factory,after-list,consents,acting-role
- [After merging main, re-check main's new filters against the records your branch starts writing](lessons/merge-main-recheck-new-filters-against-branch-records.md) — area:module-data,testing; module:communication; topic:merge-main,parallel-agents,query-filters,data-scoping
- [Declare a uuid[] column with columnType; serialize capacity checks with a per-organization advisory lock](lessons/mikro-orm-uuid-array-column-and-advisory-schedule-lock.md) — area:module-data; module:activities,platform; topic:mikro-orm,migrations,postgres-arrays,advisory-lock,concurrency,conflicts
- [Serve a public file through attachmentService.readScoped with the slug-derived scope and its exact owner, assignment and partition](lessons/public-attachments-through-read-scoped.md) — area:module-data; module:club_core,platform; topic:attachments,public-pages,sessionless,uploads,content-type
- [A list entityId must match the ORM class name; ACL dependsOn is diagnostics only, so grant *.view explicitly](lessons/query-engine-entity-ids-and-acl-depends-on.md) — area:module-data,architecture; module:groups,platform; topic:query-engine,crud-factory,entity-id,acl,role-features
- [A required lock token must spare the audit redo and a singleton's first save](lessons/required-lock-token-redo-and-first-save.md) — area:module-data,debugging; module:foundation,club_core,platform; topic:optimistic-locking,commands,undo-redo,authorize-scoped
- [Scoped CRUD lists disable the full export and never send an empty $in; API-created test tenants need the init steps](lessons/scoped-crud-lists-and-api-created-tenants.md) — area:module-data,testing; module:people,foundation; topic:data-scoping,query-engine,crud-export,integration-tests,tenant-setup
- [Refuse an unlinked account before any target lookup; a hand-written no-person refusal throws scopeDenialCode](lessons/unlinked-account-refusal-before-target-lookup.md) — area:module-data,debugging; module:foundation,communication,activities,people; topic:data-scoping,error-codes,authorize-scoped,forbidden

### spec-pr

- [Parallel PRs must not append to one shared table: each spec change is its own file, and merge=union helps only local merges](lessons/append-only-rows-conflict-one-file-per-entry.md) — area:spec-pr,ai-workflow; module:platform; topic:merge-conflicts,parallel-agents,spec-changelog,gitattributes,merge-union
- [Keep explicit pay rates out of research notes in this public repository](lessons/no-explicit-pay-rates-in-research.md) — area:spec-pr; module:platform; topic:discovery,research-notes,privacy,public-repository
- [Retarget a stacked pull request to main before merging it](lessons/retarget-stacked-pr-before-merge.md) — area:spec-pr; module:platform; topic:pull-requests,stacked-branches,github,merge

### testing

- [Action log command ids and context are encrypted at rest, so tests read entries through the audit API or match on unencrypted columns](lessons/action-log-columns-encrypted-at-rest.md) — area:testing,integration; module:platform,communication,activities; topic:audit-logs,action-log,encryption,integration-tests
- [The platform apiFetch throws ForbiddenError on every 403, so a page's own 403 branch never runs; test the forbidden state in the UI](lessons/apifetch-403-throws-before-page-branch.md) — area:backend-ui,testing; module:activities,platform; topic:api-client,forbidden,error-states,journeys
- [Reload after emulateMedia before an axe scan; a react-query refetch after an error keeps status error](lessons/axe-after-color-scheme-and-react-query-error-refetch.md) — area:testing,backend-ui; module:people,platform; topic:axe,dark-mode,playwright,react-query,loading-state
- [One axe baseline entry per rule; a test reported at hours means a suspended host; db:generate for a new module needs a seed snapshot](lessons/axe-baseline-suspended-runs-and-offline-db-generate.md) — area:testing,debugging; module:groups,platform; topic:axe,accessibility-baseline,playwright,host-suspend,db-generate,migrations
- [Integration test clubs never run a module's seedDefaults; a CrudForm select clicked before its options load opens nothing](lessons/integration-clubs-skip-seed-defaults-and-crudform-select-race.md) — area:testing,module-data; module:groups,platform; topic:seed-defaults,cli,playwright,crudform,select
- [Integration fixtures: a new password ends old tokens, CrudForm inputs need data-crud-field-id, undo takes the actor's latest action only](lessons/integration-fixture-pitfalls-tokens-crudform-undo.md) — area:testing; module:people,platform; topic:integration-tests,playwright,auth-tokens,crud-form,undo
- [Integration tests that move sessions to now must survive any weekday and hour, including the fixture's own series](lessons/integration-tests-must-not-depend-on-the-clock.md) — area:testing; module:activities; topic:integration-tests,time,fixtures,conflicts,flaky
- [In journey tests a UI sign-in resets that user's password and kills their fixture token, and the messaging probe cannot run lock-protected commands](lessons/journey-test-sign-in-tokens-and-probe-limits.md) — area:testing,integration; module:communication,activities,people; topic:journeys,playwright,fixtures,auth,messaging-probe,optimistic-lock
- [Leave a /backend page (goto about:blank) before clearing cookies to switch users in a test](lessons/leave-backend-page-before-clearing-cookies.md) — area:testing; module:platform,people; topic:playwright,sign-in-browser,clear-cookies,navigation-race,backend-pages,flaky
- [Copy both locales' strings for a UI test regex from the i18n catalogs, never translate them by hand](lessons/locale-regexes-copied-from-catalogs.md) — area:testing; module:activities,platform; topic:integration-tests,playwright,i18n,locale,assertions
- [A non-undoable command leaves no undo token, and only the platform club role can read and undo action logs, so test an undo refusal on an action that role performed](lessons/non-undoable-command-undo-test.md) — area:testing,integration; module:communication,platform,audit_logs; topic:commands,undo,action-log,audit-logs
- [Take a 'nothing was created' count right before the refused action, after every fixture](lessons/nothing-created-baseline-right-before-action.md) — area:testing; module:people,platform; topic:integration-tests,fixtures,assertions,counts
- [The platform's notification type registry is filled only in the web runtime, so a module whose in-app type is delivered by dispatch registers it in di.ts](lessons/notification-type-registry-in-worker-runtime.md) — area:integration,architecture; module:communication,foundation,platform,notifications; topic:workers,notifications,di,dispatch
- [OM_TEST_MODE counts as e-mail delivery disabled, its capture does not render components, and an encrypted lookup hash needs its property present at insert](lessons/om-test-mode-capture-and-encrypted-hash.md) — area:integration,testing,module-data; module:foundation,platform; topic:email,test-mode,encryption,capture
- [A one-way flag on a row that authorizeScoped locks is set with a conditional UPDATE ... WHERE flag = false RETURNING, which also sets updated_at](lessons/one-way-flag-conditional-update.md) — area:module-data; module:communication; topic:commands,concurrency,optimistic-lock,sql
- [Parallel integration runs need one worktree each; the test runner picks a free port, start stays on 5001](lessons/parallel-integration-runs-need-own-worktree.md) — area:testing,ai-workflow; module:platform; topic:integration-tests,parallel-agents,ports,worktrees
- [Drive the platform date picker through its grid after networkidle; assert the row, not the flash, after a CrudForm redirect](lessons/platform-date-picker-and-crudform-redirects-in-tests.md) — area:testing; module:platform,people; topic:date-picker,crudform,playwright,journeys
- [Use yarn test:integration:vereino; the platform runner waits for the customers module](lessons/platform-integration-runner-needs-customers.md) — area:testing,debugging; module:platform; topic:integration-tests,ephemeral-runner,testcontainers,readiness-probe,agent-browser
- [In Playwright an arrow key on a Radix radio group (SegmentedControl) only moves focus; select with Space or a click](lessons/radix-radio-group-arrow-moves-focus-only.md) — area:testing,backend-ui; module:platform,activities; topic:playwright,keyboard,segmented-control,radix,accessibility
- [Scripted file edits on Windows write bytes, so a CRLF never enters an LF repository](lessons/scripted-edits-keep-lf-on-windows.md) — area:architecture; module:platform; topic:windows,line-endings,crlf,scripted-edits
- [A sessionless integration check needs request.newContext(); rate limits are off under OM_INTEGRATION_TEST](lessons/sessionless-tests-new-request-context.md) — area:testing; module:club_core,platform; topic:playwright,sessionless,public-pages,rate-limits,status-badge
- [A sessionless token page that changes a versioned record still reads and sends its lock token](lessons/sessionless-write-sends-lock-token.md) — area:module-data,backend-ui; module:activities,foundation; topic:optimistic-lock,token-links,sessionless,public-pages,concurrency
- [signInBrowser sets a new password: fetch a fresh API token for that user afterwards](lessons/sign-in-browser-ends-the-api-token.md) — area:testing; module:platform,people; topic:playwright,sign-in-browser,auth-token,integration-tests
- [Event subscribers get no event id, so a persistent subscriber keys its idempotency on a value the event carries](lessons/subscriber-idempotency-without-event-id.md) — area:module-data,integration; module:communication,activities,platform; topic:events,subscribers,idempotency,dispatch
- [Build conditional Tailwind class names from constants; the formatter trims whitespace inside a className template literal](lessons/tailwind-class-strings-in-constants.md) — area:backend-ui; module:ui,platform; topic:prettier,tailwind,classname,template-literal,formatting
- [@vereino/ui admin components cannot use DataTable or CrudForm, so they build on primitives and keep every effect and handler in a tested .ts model](lessons/vereino-ui-admin-components-without-next.md) — area:backend-ui,testing; module:ui,communication; topic:vereino-ui,datatable,crudform,coverage,next-navigation
- [A response that gains a field breaks every exact key-list assertion, including tests main added after the branch was cut](lessons/widened-response-shape-breaks-key-list-assertions.md) — area:testing,spec-pr; module:activities,communication; topic:integration-tests,public-api,parallel-agents,merge-main,contract-tests
- [Code that platform workers or the CLI load may import only .ts from @vereino/ui, and the notification delivery strategies exist only in the web runtime](lessons/worker-runtime-imports-and-notification-strategies.md) — area:architecture,integration; module:foundation,platform,notifications; topic:workers,cli,tsx,notifications,di,email
