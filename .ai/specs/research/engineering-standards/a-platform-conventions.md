# A. Platform conventions Vereino MUST follow (Open Mercato 0.9.0 + repository rules)

Research input for the engineering-standards specification. Read-only extraction; nothing was edited.

Source roots (all paths below are relative to the repository root unless absolute):

- `AGENTS.md` (root, standalone-harness rules) and `CLAUDE.md` (Claude-specific additions).
- `.ai/guides/*.md` — concept guides for the standalone app; `.ai/guides/upstream/AGENTS.md` and `.ai/guides/upstream/BACKWARD_COMPATIBILITY.md` are the framework's own monorepo rules (copied verbatim, some paths refer to `apps/mercato/`, `packages/core/` of the upstream repo).
- `packages/app/src/modules/example/` — reference module, source-present, runtime-disabled (not in `src/modules.ts`).
- `packages/app/node_modules/@open-mercato/{core,shared,ui,cli}/AGENTS.md` (installed 0.9.0) and `@open-mercato/shared/src/lib/commands/types.ts`.
- Tooling: `packages/app/{package.json,tsconfig.json,eslint.config.mjs,jest.config.cjs,next.config.ts,.ds-check-ignore}`, `packages/app/scripts/{ds-check.mjs,i18n-check-hardcoded.mjs}`, root `package.json`, `.yarnrc.yml`, `.ai/agentic.config.json`, `.ai/review-checklist.md`.
- `.ai/specs/2026-10-20-vereino-club-management.md` (the only active spec; sections Architecture and Data Flow L315-351, Data Models L659-743, API/Command/Error Contracts L744-810, Security L850-858, Integration Coverage L860-914, Implementation Phases L915-1023).

Precedence stated by the harness: root `AGENTS.md` → `BACKWARD_COMPATIBILITY.md` → installed package `AGENTS.md` → generated facts; "stop on skew/conflict; never guess" (`AGENTS.md` L174).

---

## 1. Module anatomy

### 1.1 Where modules live and how they are discovered

- App code lives only in `packages/app/src/modules/<id>/`; Open Mercato discovers entities, migrations, routes and pages only there (`AGENTS.md` L12, L18, L28). Never put `page.tsx` directly under `src/app/(backend)/**` or `src/app/(frontend)/**` — such a page renders unregistered without nav, ACL or breadcrumbs (`.ai/guides/backend-ui.md` L11).
- A module is activated by adding `{ id: '<id>', from: '@app' }` to `packages/app/src/modules.ts` (`.ai/guides/architecture.md` L26; `src/modules.ts` L6-8). Installed modules come from `@open-mercato/core` etc.; the spec requires approval before enabling additional installed modules per phase (`spec` L917).
- Run `yarn generate` after any discovered file changes (`src/modules.ts`, routes, pages, events, widgets, agents, tools, workflows, entities, `translations.ts`, `enrichers.ts`) and never repair `.mercato/generated/**` by hand (`AGENTS.md` L34, L48; `architecture.md` L81). A dev server started before `yarn generate` keeps the old registry — restart it (`testing-debugging.md` L38).
- Canonical module shape (`architecture.md` L45-69):

```text
src/modules/<id>/
├── index.ts                     metadata: ModuleInfo
├── data/{entities,validators,extensions,enrichers,guards}.ts
├── api/**/route.ts              + api/openapi.ts, api/interceptors.ts
├── backend/**/{page.tsx,page.meta.ts}   frontend/**/{page.tsx,page.meta.ts}
├── commands/  subscribers/  workers/  migrations/  i18n/
├── widgets/{injection/**,injection-table.ts,components.ts,dashboard/**}
├── acl.ts  setup.ts  di.ts  events.ts  search.ts  ce.ts  translations.ts
├── notifications.ts  encryption.ts  ai-agents.ts  ai-tools.ts  cli.ts
```

- "Create only files required by the capability" (`architecture.md` L71). Convention file names and their required exports are FROZEN (`BACKWARD_COMPATIBILITY.md` §1, L31-67): `index.ts` → `metadata: ModuleInfo`; `acl.ts` → `features`; `setup.ts` → `setup: ModuleSetupConfig`; `events.ts` → `eventsConfig` via `createModuleEvents()`; `di.ts` → `register(container)`; `data/entities.ts` → entity classes; `data/validators.ts` → Zod exports; `subscribers/*.ts` → default handler + `metadata {event, persistent?, id?}`; `workers/*.ts` → default handler + `metadata {queue, id?, concurrency?}`.
- Minimal `index.ts` (example `index.ts` L1-10):

```ts
import type { ModuleInfo } from '@open-mercato/shared/modules/registry'
export const metadata: ModuleInfo = {
  name: 'example', title: 'Example Module', version: '0.1.0',
  description: 'Demonstrates pages, APIs, entities and DI.',
  author: 'Open Mercato Team', license: 'MIT',
}
```

### 1.2 Naming rules

- Module id: plural `snake_case` (folder and `metadata.name`); special cases `auth`, `example` (`upstream/AGENTS.md` L205; example `README.md` L55). Vereino modules per spec: `club_core`, `people`, `groups`, `activities`, `communication`, `payments`, `facilities` (spec L346).
- Entity id: `<module>:<entity>` colon form (`example:todo`); used in `ce.ts`, `indexer.entityType`, `entityId` props on `DataTable`/`CrudForm`, query-engine calls (example `README.md` L56).
- ORM table names: plural snake_case with `<module>_` prefix (`contracts.md` L10; `core/AGENTS.md` L634; spec L661 "Tables prefixed with the module name", e.g. `people_persons`).
- Command ids: `<module>.<entity>.<action>` (`example.todos.create`) (`README.md` L59).
- Event ids: `<module>.<entity>.<past-tense-action>`, dots as separators, singular entity (`example.todo.created`; `upstream/AGENTS.md` L206; `README.md` L60).
- ACL feature ids: `<module>.<capability>` (`example.todos.manage`) (`contracts.md` L64).
- Widget / injection ids: `<module>.injection.*`, `<module>.dashboard.*`; menu item ids `<module>-<feature>-<action>` (`README.md` L61; `core/AGENTS.md` L444).
- DI tokens: camelCase string constants exported from `di.ts` (`EXAMPLE_TODO_SUMMARY_SERVICE = 'exampleTodoSummaryService'`, example `di.ts` L25).
- Subscriber/worker ids: `<module>:<kebab-name>` (`example:invalidate-todo-summary`, `example:todos-bulk-complete`).
- Notification type ids: `<module>.<name>`; i18n keys `<module>.*` (`README.md` L63-64).
- JS/TS identifiers camelCase; DB columns snake_case (`upstream/AGENTS.md` L209-210).
- "Keep entity/event/feature/spot/agent/tool identifiers stable once used" (`architecture.md` L71).

### 1.3 i18n catalogs

- Every Vereino module ships `i18n/en.json` and `i18n/pl.json`; a new language = new catalog file (`AGENTS.md` L37). Keys are flat, dotted, module-prefixed (example `i18n/en.json` L2: `"example.adminTitle": "Example Admin"`), with `{count}`-style placeholders.
- UI text lives only in catalogs; `useT()` client-side, `resolveTranslations()` server-side (`backend-ui.md` L74-75; `shared/AGENTS.md` L183-193).
- `translations.ts` is reserved for Translation-Manager entity fields, not UI copy (`backend-ui.md` L76).

---

## 2. Data layer

### 2.1 Entity conventions

- Decorators from `@mikro-orm/decorators/legacy`, ORM types from the installed MikroORM v7 (`contracts.md` L7; `core/AGENTS.md` L184). `tsconfig.json` sets `experimentalDecorators`, `emitDecoratorMetadata`, `useDefineForClassFields: false` (L19-21).
- UUID primary keys (`defaultRaw: 'gen_random_uuid()'`), explicit scalar FK ids, junction tables for M2M (`contracts.md` L10; `upstream/AGENTS.md` L212).
- Standard columns: `id`, `created_at`, `updated_at`, `deleted_at`, `is_active`, `organization_id`, `tenant_id` (`upstream/AGENTS.md` L211). Standard-column contract and FK column names are frozen (`BACKWARD_COMPATIBILITY.md` §8 L200, L205).
- Organization-owned rows carry `tenant_id` + `organization_id` plus a composite index for common filters (`contracts.md` L8). Spec: both required, "only from trusted context" (spec L661).
- Reference shape (example `data/entities.ts` L144-170):

```ts
@Entity({ tableName: 'example_customer_priorities' })
export class ExampleCustomerPriority {
  @PrimaryKey({ type: 'uuid', defaultRaw: 'gen_random_uuid()' }) id!: string
  @Property({ name: 'customer_id', type: 'uuid' }) customerId!: string
  @Property({ name: 'tenant_id', type: 'uuid' }) tenantId!: string
  @Property({ name: 'organization_id', type: 'uuid' }) organizationId!: string
  @Property({ name: 'created_at', type: Date, onCreate: () => new Date() }) createdAt: Date = new Date()
  @Property({ name: 'updated_at', type: Date, onUpdate: () => new Date() }) updatedAt: Date = new Date()
  @Property({ name: 'deleted_at', type: Date, nullable: true }) deletedAt?: Date | null
}
```

- `updated_at` on every user-editable entity (optimistic locking default ON); return it as `updatedAt` from list/detail APIs (`AGENTS.md` L32; `contracts.md` L9; `core/AGENTS.md` L637). Exempt: append-only logs, junction tables, session/token rows, background-job rows, parent-guarded sub-resource lines (`core/AGENTS.md` L637; example `entities.ts` L78-79). Spec applies this: `SubstitutionEntry` "append-only: no `updated_at`" (spec L696).
- Soft delete: `deleted_at timestamptz null`; `makeCrudRoute` `orm.softDeleteField` must be declared explicitly, `null` when absent (`contracts.md` L30; `core/AGENTS.md` L636).
- Never create cross-module ORM relations; use scalar ids + snapshots, events, enrichers, extensions, optional DI (`AGENTS.md` L49; `contracts.md` L10, L70-78). Extension data for an installed entity goes in a separate entity declared in `data/extensions.ts` (`contracts.md` L77).
- Model nullable/clearable fields consistently through validator → command → entity → response → form; test clearing to `null` (`contracts.md` L12).
- Amounts: integers in minor units (grosz) + club currency (spec L661).

### 2.2 Optimistic locking / 409

- `makeCrudRoute` entities lock by default (`OM_OPTIMISTIC_LOCK=off` opts out) (`upstream/AGENTS.md` L88).
- Commands: `expected_updated_at` is an app convention; validate it in the Zod schema, load the record inside the mutation and call `assertOptimisticLock` (no-op when the token is absent, throws the shared 409 on mismatch) (`framework-contracts.md` L62-64). Example `commands/todos.ts` L313-334 runs it in `prepare` (always awaited before `execute`):

```ts
assertOptimisticLock({
  resourceKind: ENTITY_ID, resourceId: parsed.id,
  expected: parsed.expected_updated_at, current: existing.updatedAt,
})
```

- Guard the aggregate parent when lines share a parent version; per-child header override when a parent form mutates children (`contracts.md` L44, L58).
- UI: `CrudForm` derives the header from `initialValues.updatedAt` for update and delete; custom clients wrap the call with `withScopedApiRequestHeaders(buildOptimisticLockHeader(record.updatedAt), …)` and surface 409 via `surfaceRecordConflict(err, t)`; never silently retry over newer data (`contracts.md` L55-59; `ui/AGENTS.md` L121; example `TodosTable.tsx` L316-323).

### 2.3 Encryption

- Sensitive/PII fields are declared in `encryption.ts` `defaultEncryptionMaps`; reads go through `findWithDecryption` / `findOneWithDecryption` / `findAndCountWithDecryption` with both scope ids (`contracts.md` L11; `core/AGENTS.md` L525; `shared/AGENTS.md` L93-98). Example `encryption.ts` L20-25:

```ts
export const defaultEncryptionMaps: ModuleEncryptionMap[] = [
  { entityId: 'example:todo', fields: [{ field: 'notes' }] },
]
```

- Encryption is a decision about every read path: an encrypted column cannot be sorted, `$ilike`-filtered or exported; search uses the hashed `search_tokens` index (`encryption.ts` L12-18; `surface-map.md` L74-82; `shared/AGENTS.md` L102-120).
- `nativeUpdate` bypasses ORM hooks: encrypt explicitly with `encryptEntityPayload` and fail closed when the service is unavailable (example `commands/todos.ts` L92-136).
- Undo snapshots must be built from the decrypted entity (`todos.ts` L317-325).
- Equality lookup needs an explicitly approved deterministic hash sibling (`contracts.md` L11); spec uses `pesel_hash` = HMAC (spec L677) and SHA-256 for link tokens (spec L699, L854). Review checklist forbids raw SHA-256 for low-entropy PII; use `lookupHashCandidates`/`hashForLookup` (`.ai/review-checklist.md` L27).
- Never hand-roll AES/KMS; never bypass `TenantDataEncryptionService` (`core/AGENTS.md` L29). A deployed module adding an encryption map needs a `buildEncryptionMapBackfillSql` migration (`core/AGENTS.md` L529).

### 2.4 Validators

- All inputs validated with Zod in `data/validators.ts`; types via `z.infer` (`upstream/AGENTS.md` L243-244). Example `data/validators.ts` L13-37:

```ts
export const todoNotesSchema = z.string().max(5000).nullable()   // nullable so a client can clear it
export const customerPriorityValueSchema = z.enum(['low', 'normal', 'high', 'critical'])
export const customerPriorityListSchema = z.object({
  page: z.coerce.number().min(1).default(1),
  pageSize: z.coerce.number().min(1).max(100).default(50),
  sortField: z.enum(['id', 'customer_id', 'priority', 'created_at']).optional().default('created_at'),
  sortDir: z.enum(['asc', 'desc']).optional().default('desc'),
})
```

- Existing schemas must never be removed or narrowed (`BACKWARD_COMPATIBILITY.md` L53). Public schemas never accept runtime `tenantId`/`organizationId` (`review-checklist.md` L16). `pageSize` ≤ 100 (`upstream/AGENTS.md` L265).
- Zod is pinned by root `resolutions` to `4.4.3` (root `package.json` L53).

### 2.5 Custom fields

- Custom entities/fields declared in `ce.ts`; use `E.<module>.<entity>` generated ids; helpers `splitCustomFieldPayload`, `normalizeCustomFieldValues`, `collectCustomFieldValues`; command undo restores through `buildCustomFieldResetMap` (`core/AGENTS.md` L448-480). New modules should opt into `decorateCustomFields.stripPrefixedKeys: true` (L466-480).

### 2.6 Migrations workflow

1. Change `data/entities.ts` and the validator/command/response contracts.
2. `yarn generate` if discovery changed.
3. `yarn db:generate` as a schema-diff probe; review every emitted statement; keep only the intended module change; update that module's `migrations/.snapshot-open-mercato.json` to the post-change schema.
4. Never edit a shipped migration; add a corrective migration.
5. Ask before `yarn db:migrate`; delivery includes migration + snapshot, never local DB state. "Never migrate to validate." (`contracts.md` L16-21; `AGENTS.md` L33, L43, L80; `cli/AGENTS.md` L84-97).

- Migration shape (example `migrations/Migration20260804120546_example.ts`):

```ts
export class Migration20260804120546_example extends Migration {
  override up(): void | Promise<void> { this.addSql(`alter table "todos" add "notes" text null;`); }
  override down(): void | Promise<void> { this.addSql(`alter table "todos" drop column "notes";`); }
}
```

- A migration rewriting a query-indexed column must export `queryIndexReindexEntityTypes` via `declareQueryIndexReindex([...])` (`review-checklist.md` L15; `cli/AGENTS.md` L99).
- Spec: one migration per module per phase; after first deployment, corrective migrations only (spec L742).

### 2.7 Query index and search

- CRUD routes declare `indexer: { entityType }` for query-index coverage (`contracts.md` L33; `core/AGENTS.md` L9).
- `search.ts` exports `searchConfig: SearchModuleConfig` with `buildSource`/`checksumSource`, `formatResult`, `resolveUrl`, per-entity `aclFeatures`, and a `fieldPolicy` that excludes encrypted columns (`surface-map.md` L78-79). Tests use deterministic convergence polling, never sleeps (`contracts.md` L86).

---

## 3. Commands and API

### 3.1 CommandHandler contract (`@open-mercato/shared/src/lib/commands/types.ts` L218-270)

```ts
export interface CommandHandler<TInput = unknown, TResult = unknown> {
  readonly id: string
  readonly isUndoable?: boolean
  readonly atomicReplay?: boolean
  readonly outputSchema?: ZodTypeAny
  prepare?(input, ctx): Promise<{ before?: unknown } | null> | { before?: unknown } | null
  execute(input, ctx): Promise<TResult> | TResult
  buildLog?(args: CommandLogBuilderArgs<TInput, TResult>): CommandLogMetadata | null | undefined | Promise<…>
  captureAfter?(input, result, ctx): Promise<unknown> | unknown
  authorizeReplay?(params): Promise<void> | void
  undo?(params: { input; ctx; logEntry: CommandUndoLogEntry }): Promise<void> | void
  redo?(params: { input; ctx; logEntry }): Promise<TResult> | TResult
}
```

- `CommandRuntimeContext` (L40-104) carries `container`, `auth`, `organizationScope`, `selectedOrganizationId`, `organizationIds`, optional `request`, `syncOrigin`, `bulkImport` suppression flags, `systemActor` (never set from HTTP paths), `transactionalEm` (must be reused when supplied), `runAs`.
- `CommandUndoLogEntry` intentionally has no `payload`; read snapshots via `extractUndoPayload(logEntry)` from `@open-mercato/shared/lib/commands/undo` (L167-179; `shared/AGENTS.md` L273-281).
- Register via `registerCommand(handler)`; ids global and stable, duplicates throw outside dev (`framework-contracts.md` L17; example `commands/todos.ts` L606-608).
- There is no `validate` member on the handler; validation happens inside `execute`/`prepare` by parsing the raw input with Zod (`parseWithCustomFields(schema, rawInput)`, example L172, L314).
- Scope enforcement inside commands via a local `ensureScope(ctx)` helper that throws when tenant/org is missing; undo re-validates scope against `ctx.organizationIds` (`todos.ts` L610-628).
- Reference shape of a create command (example `commands/todos.ts` L168-221):

```ts
const createTodoCommand: CommandHandler<Record<string, unknown>, Todo> = {
  id: 'example.todos.create',
  isUndoable: true,
  async execute(rawInput, ctx) {
    const { parsed, custom } = parseWithCustomFields(todoCreateSchema, rawInput)
    const scope = ensureScope(ctx)
    const de = (ctx.container.resolve('dataEngine') as DataEngine)
    const todo = await de.createOrmEntity({ entity: Todo, data: { …, tenantId: scope.tenantId, organizationId: scope.organizationId } })
    await setCustomFieldsIfAny({ dataEngine: de, entityId: ENTITY_ID, recordId: String(todo.id), …, values: custom })
    await emitCrudSideEffects({ dataEngine: de, action: 'created', entity: todo, identifiers: {…}, syncOrigin: ctx.syncOrigin, events: todoCrudEvents, indexer: todoCrudIndexer })
    return todo
  },
  captureAfter: (_input, result) => serializeTodo(result),
  buildLog: async ({ result, ctx }) => ({ actionLabel: translate('example.audit.todos.create', 'Create todo'), resourceKind: 'example.todo', resourceId: String(result.id), tenantId, organizationId, snapshotAfter }),
  async undo({ logEntry, ctx }) { /* scope-validated soft delete + emitCrudUndoSideEffects */ },
  redo: makeCreateRedo({ … }),
}
```

- Rules: domain mutations go through commands so audit, undo, events, cache invalidation and indexing share one path; routes validate and dispatch only (`contracts.md` L42). Prefer `runCrudCommandWrite` for entity + custom fields + side effects; otherwise `withAtomicFlush(em, phases, { transaction: true, label })` with `emitCrudSideEffects` / cache invalidation OUTSIDE the atomic block (`core/AGENTS.md` L538-615; `framework-contracts.md` L19-25). Undo emits symmetric side effects with the same index/cache aliases (`contracts.md` L46). Audit labels are translated (`buildLog` uses `resolveTranslations()`).
- Retries and idempotency explicit; never advance cursors/one-time keys before the durable unit commits (`contracts.md` L47). Racing uniqueness decisions use a DB constraint, lock, CAS or atomic claim, never check-then-create (`review-checklist.md` L18).
- `eventsConfig.emit` does not join a transaction; emit only after the durable write (`framework-contracts.md` L58).

### 3.2 `makeCrudRoute`

- Handlers live in `api/<resource>/route.ts` (never HTTP-method directories); import from `@open-mercato/shared/lib/crud/factory`; export the factory's handlers plus a separate `openApi` (`contracts.md` L25-36; `architecture.md` L78). Example `api/todos/route.ts` L240-255, L357-376:

```ts
export const { metadata, GET, POST, PUT, DELETE } = makeCrudRoute({
  metadata: {
    GET:    { requireAuth: true, requireFeatures: ['example.todos.view'] },
    POST:   { requireAuth: true, requireFeatures: ['example.todos.manage'] },
    PUT:    { requireAuth: true, requireFeatures: ['example.todos.manage'] },
    DELETE: { requireAuth: true, requireFeatures: ['example.todos.manage'] },
  },
  orm: { entity: Todo, idField: 'id', orgField: 'organizationId', tenantField: 'tenantId', softDeleteField: 'deletedAt' },
  events: { module: 'example', entity: 'todo', persistent: true },
  indexer: { entityType: ENTITY_ID },
  list: { schema: querySchema, entityId: ENTITY_ID, fields, sortFieldMap, buildFilters, transformItem, allowCsv: true, csv: {…} },
  actions: {
    create: { commandId: 'example.todos.create', schema: rawBodySchema, mapInput: ({ parsed }) => parsed, response: ({ result }) => ({ id: String(result.id) }), status: 201 },
    update: { commandId: 'example.todos.update', schema: rawBodySchema, mapInput: ({ parsed }) => parsed, response: () => ({ ok: true }) },
    delete: { commandId: 'example.todos.delete', response: () => ({ ok: true }) },
  },
})
```

- ORM defaults `id`, `organizationId`, `tenantId`, `deletedAt`; `null` disables a field; never disable scope because the handler also checks it (`framework-contracts.md` L31).
- `list.transformItem` is synchronous (no I/O); `buildFilters` may be async; `hooks.beforeList/afterList` resolve request state through `ctx`, never module globals (`framework-contracts.md` L35-40). List projection includes `updated_at` and returns `updatedAt` as ISO (example L74, L319).
- Reject malformed id lists/filters explicitly; preserve response keys (`contracts.md` L38). `?ids=uuid1,uuid2` is the multi-id contract (`shared/AGENTS.md` L268-271). Parse query params with `buildQueryParams`/`readQueryParamList`, never `Object.fromEntries` (`shared/AGENTS.md` L260-266).
- The factory still runs auth, scope rejection, interceptors, schema validation, mutation guards, sync lifecycle subscribers, command bus, operation headers, response interceptors, guard callbacks and cache invalidation; the command owns async CRUD event/index work (`framework-contracts.md` L44-52).
- Rate limits are per-method `metadata` on the route (`framework-contracts.md` L29); the spec relies on them for public routes (spec L800, L857).

### 3.3 OpenAPI

- Every API route file exports `openApi` (`core/AGENTS.md` L8, L113). Build it with `createCrudOpenApiFactory` + `createPagedListResponseSchema` from `@open-mercato/shared/lib/openapi/crud` or a typed `OpenApiRouteDoc` (`contracts.md` L36). Module helper in `api/openapi.ts` (example L58-68):

```ts
const buildExampleCrudOpenApi = createCrudOpenApiFactory({
  defaultTag: exampleTag,
  defaultCreateResponseSchema: exampleCreatedSchema,   // { id: uuid }
  defaultOkResponseSchema: exampleOkSchema,            // { ok: true }
  makeListDescription: ({ pluralLower }) => `Returns a paginated collection of ${pluralLower} in the current tenant scope.`,
})
export function createExampleCrudOpenApi(options: CrudOpenApiOptions): OpenApiRouteDoc { return buildExampleCrudOpenApi(options) }
```

- Retiring a route: `deprecated: true` in `openApi`, keep ≥ 1 minor version (`BACKWARD_COMPATIBILITY.md` L190).

### 3.4 Custom (non-CRUD) write routes

- Run registered mutation guards before the mutation (`getAllMutationGuardInstances()` + `bridgeLegacyGuard`, `runMutationGuards(...)` with `{ userFeatures }`), return `guardResult.errorBody/errorStatus` when blocked, merge `modifiedPayload`, run `afterSuccessCallbacks` after commit and log callback failures (`core/AGENTS.md` L115-119; `contracts.md` L43).
- Enforce command-level optimistic locking on action/sub-resource endpoints (`contracts.md` L44).
- Custom routes opt into interceptors via `runCustomRouteAfterInterceptors` (`core/AGENTS.md` L426).

### 3.5 Error conventions

- Use the shared helpers from `@open-mercato/shared/lib/crud/errors`: `badRequest` 400, `forbidden` 403, `notFound`/`assertFound` 404, `conflict` 409; do not hand-roll `new CrudHttpError(404, …)`; 404 copy goes through `translate(...)` (`shared/AGENTS.md` L236-258). (The example module still hand-rolls `CrudHttpError` — `todos.ts` L326 — noted as outdated vs the shared guide.)
- Status semantics in use across the platform and the spec: 400 malformed input/range; 401 unauthenticated; 403 scope/feature denied; 404 not found or not public; 409 version conflict, FK violation (`code: 'FOREIGN_KEY_VIOLATION'`), state-transition/business conflict with a machine code (`occurrence_place_conflict`, `declaration_closed`, `rental_conflict`, `place_closed`, `entry_ban_active`, `slot_unavailable`, `case_immutable`); 410 expired/used token; 413 size; 422 validation/business rule (`account_age_below_threshold`, XOR fields, overpayment); 429 rate limit; 502 upstream gateway (spec L750-809; `BACKWARD_COMPATIBILITY.md` L386-398).
- Command interceptors may reject with `{ ok: false, message, status, body }`; transports map it through `getCommandInterceptorHttpRejection(err)` (`BACKWARD_COMPATIBILITY.md` L344-359).
- `organizationScopeRequiredResponse()` → 400 `organization_scope_required`, never 401, when an authenticated caller has no organization (`shared/AGENTS.md` L38).
- Error reporting: a `catch` that records an error must also `reportError` with a `module.reason` code (`upstream/AGENTS.md` L102; `BACKWARD_COMPATIBILITY.md` L477-496).
- Internal assertions prefix messages with `[internal]`; user-facing messages route through `t('module.errors.<key>')` (`upstream/AGENTS.md` L263; example `todos.ts` L121).
- Read JSON defensively with `readJsonSafe(response, fallback)` and then zod-parse (`framework-contracts.md` L66-68).

### 3.6 Logging (runtime)

- `createLogger('<module>')` from `@open-mercato/shared/lib/logger`, `.child({ component, … })`; stable messages, dynamic values in structured metadata, errors under `err`; redact credentials/tokens/PII/payload bodies; no raw `console.*` in runtime code (CLI scripts and test spies excepted) (`contracts.md` L49-53; `shared/AGENTS.md` L54). Level via `OM_LOG_LEVEL`. Example `setup.ts` L37: `const logger = createLogger('example').child({ component: 'setup' })`.

---

## 4. DI and events

### 4.1 Awilix registration (`di.ts`)

- `register(container: AppContainer)` signature is FROZEN (`BACKWARD_COMPATIBILITY.md` L50). Example `di.ts` L25-39:

```ts
export const EXAMPLE_TODO_SUMMARY_SERVICE = 'exampleTodoSummaryService' as const
export function register(container: AppContainer) {
  container.register({
    [EXAMPLE_TODO_SUMMARY_SERVICE]: asFunction(createExampleTodoSummaryService).scoped(),
    [EXAMPLE_CURRENCY_RATE_PROVIDER]: asValue(exampleCurrencyRateProvider),
  })
}
```

- Lifetime: a service that closes over the request `em` must be `.scoped()`; a singleton would pin one request's tenant for the process lifetime (`di.ts` L32-35).
- Inject via DI, avoid `new`-ing (`upstream/AGENTS.md` L237). DI registration keys are STABLE contract surfaces (`BACKWARD_COMPATIBILITY.md` §9).
- Optional cross-module service: the optional consumer owns the glue and uses a guarded `tryResolve` (try/catch around `container.resolve`), returning a defined degraded result; the host never imports the consumer; never a hard `requires` on an optional peer (`contracts.md` L78; `core/AGENTS.md` L250; example `setup.ts` L66-70 `hasRegistration('schedulerService')`). Spec wires `people.scopeService`, `facilities.occupancyService`, `payments` DI charge creation, and public-page block services this way (spec L318-343).
- Non-request runtimes (workers, CLI) build their own container with `createRequestContainer()` (example `workers/todos-bulk-complete.ts` L34).

### 4.2 Typed events (`events.ts`)

- Declare with `createModuleEvents({ moduleId, events })` over an `as const` table; export `eventsConfig`, the typed emitter and the id union; `yarn generate` afterwards (`contracts.md` L82; `core/AGENTS.md` L284-304). Example `events.ts` L8-55:

```ts
const events = [
  { id: 'example.todo.created', label: 'Todo Created', entity: 'todo', category: 'crud', clientBroadcast: true },
  { id: 'example.todo_announcement.published', label: 'Todo Announcement Published', entity: 'todo_announcement', category: 'lifecycle', portalBroadcast: true },
] as const
export const eventsConfig = createModuleEvents({ moduleId: 'example', events })
export const emitExampleEvent = eventsConfig.emit
export type ExampleEventId = typeof events[number]['id']
export default eventsConfig
```

- Fields: `id`, `label` (required), `description`, `category` (`crud|lifecycle|system|custom`), `entity`, `excludeFromTriggers`, `clientBroadcast` (SSE to backend), `portalBroadcast` (SSE to portal) (`core/AGENTS.md` L300; `upstream/AGENTS.md` L207-208).
- Published event ids and payload fields are FROZEN; payload `id`, `tenantId`, `organizationId` must stay (`BACKWARD_COMPATIBILITY.md` §5, L80). Broadcast payloads must carry scope and must not carry staff-authored text (`surface-map.md` L120-122).
- A fan-out event that must not re-enter a wildcard subscriber uses its own entity segment (`events.ts` L23-27).

### 4.3 Subscribers

- `subscribers/*.ts`: default handler + `metadata { event, persistent?, id? }`. Ephemeral (`persistent: false`) for real-time UI/cache invalidation; persistent (`persistent: true`) for notifications, indexing, audit — retried, so handlers must be idempotent (`core/AGENTS.md` L335-349; `contracts.md` L83). Example `subscribers/invalidate-todo-summary.ts` L21-25, L41-49:

```ts
export const metadata = { event: 'example.todo.*', persistent: false, id: 'example:invalidate-todo-summary' }
export default async function handler(payload: TodoCrudEventPayload, ctx: { resolve: <T>(name: string) => T }) {
  const tenantId = typeof payload?.tenantId === 'string' ? payload.tenantId : null
  const organizationId = typeof payload?.organizationId === 'string' ? payload.organizationId : null
  if (!tenantId || !organizationId) return   // an unscoped write cannot name a scoped entry
  …
}
```

- Sync subscribers (`metadata.sync`/`priority`) may rewrite a before-create payload or reject a before-update with a status (`extensions.md` L36; `surface-map.md` L112). One side effect per subscriber (`core/AGENTS.md` L342).

### 4.4 Workers, queues, progress, scheduler

- `workers/*.ts`: default handler + `metadata: WorkerMeta { queue, id?, concurrency? }`; idempotent, bounded concurrency/retry, scoped serializable payloads, domain writes through commands (`contracts.md` L85; `core/AGENTS.md` L310-316). Example `workers/todos-bulk-complete.ts` L14-18:

```ts
export const metadata: WorkerMeta = { queue: EXAMPLE_TODO_BULK_COMPLETE_QUEUE, id: 'example:todos-bulk-complete', concurrency: 1 }
```

- User-visible bulk/long work creates a `ProgressJob` and returns `progressJobId`; browser bulk loops use shared progress helpers, never page-local bars (`core/AGENTS.md` L310-316; `ui/AGENTS.md` L296-297).
- Durable outbox pattern: unique `(tenant_id, organization_id, user_id, idempotency_key)`, `published_at`, lease + checkpoint columns (example `entities.ts` L59-142).
- Scheduler targets are registered idempotently from `setup.ts` `seedDefaults` (the only always-running hook with a container) with a deterministic id and a wrapped call so a cap error degrades to a warning (`setup.ts` L48-102; spec jobs `activities:generate-occurrences`, `payments:generate-charges`, etc., spec L325, L330).
- Cache: resolve through DI, mirror tenant+organization in keys/tags, invalidate after commit, bounded TTL (`contracts.md` L87; `surface-map.md` L43-49).
- DB pool: `web_pool_max + worker_pool_max + overhead ≤ max_connections`; `DB_POOL_MAX`, `OM_WORKERS_DB_CONNECTION_BUDGET` (`shared/AGENTS.md` L82-91).

---

## 5. RBAC and scoping

- Features declared in `acl.ts` as `{ id, title, module, dependsOn? }`; array item shape FROZEN (`BACKWARD_COMPATIBILITY.md` L38). Example `acl.ts` L1-16:

```ts
export const features = [
  { id: 'example.backend', title: 'Access example backend', module: 'example' },
  { id: 'example.todos.view', title: 'View todos', module: 'example' },
  { id: 'example.todos.manage', title: 'Manage todos', module: 'example', dependsOn: ['example.todos.view'] },
]
export default features
```

- Feature ids are FROZEN once stored in role configs; removal needs a data migration; `entry.overrides.acl.features[id] = null` is the reversible exception (`BACKWARD_COMPATIBILITY.md` §10).
- Gate API methods and pages declaratively with `requireAuth` + `requireFeatures`; never gate by role names (mutable, spoofable); portal pages use `requireCustomerAuth`/`requireCustomerFeatures` (`contracts.md` L65; `upstream/AGENTS.md` L250-251; `AGENTS.md` L50).
- Wildcard-aware matching everywhere raw feature arrays are evaluated (`module.*`, `*` satisfy concrete grants); never `includes`/`Set.has` (`contracts.md` L67; `shared/AGENTS.md` L21, L209-234). Server authorization uses `rbacService.userHasAllFeatures` or `authorizeFeatures`; browser capability payloads carry concrete ids only (`BACKWARD_COMPATIBILITY.md` L225).
- `setup.ts` grants new features in `defaultRoleFeatures` (roles `superadmin`, `admin`, `employee`, custom module roles); existing tenants need `yarn mercato auth sync-role-acls` (`contracts.md` L66; `core/AGENTS.md` L254-263). Example `setup.ts` L104-109:

```ts
export const setup: ModuleSetupConfig = {
  defaultRoleFeatures: {
    superadmin: ['example.*', …], admin: ['example.*', …],
    employee: ['example.*', 'example.widgets.*', …],
  },
  async onTenantCreated({ em, tenantId }) { /* em only, no container: definitions */ },
  async seedDefaults({ container, tenantId, organizationId }) { /* reference records, scheduler targets */ },
  async seedExamples({ em, container, tenantId, organizationId }) { /* demo rows; skipped by --no-examples */ },
}
```

- `onTenantCreated`, `seedDefaults`, `seedExamples` and provider setup must be idempotent; hooks must not be removed (`contracts.md` L68; `BACKWARD_COMPATIBILITY.md` L39). Spec: `vereino_*` roles and club settings seeded in `setup.ts` (spec L924).
- Tenant isolation: derive trusted `tenantId` + `organizationId` from authenticated context and fail closed; never trust payload scope; missing scope ≠ unrestricted; only an installed contract may use system scope (`organizationId: null`) (`AGENTS.md` L29, L47). Spec records one deliberate deviation: sessionless public routes do exactly one read-only index-backed system-scope lookup by slug/token hash, then every query carries the found scope (spec L853, DD-35).
- Scope service pattern: `people.scopeService` is the single source of row-level scope (`section_ids`, `place_ids`, `ward_person_ids`, `coached_group_ids`); every record read/write passes through it; `acting_role` is determined server-side (spec L346, L852).
- Workers: scope in the job payload comes from the schedule registration, not user data (spec L853).
- Regression oracle: two tenants × two organizations; allowed/denied/null-scope/wildcard (`testing-debugging.md` L53).

---

## 6. UI

### 6.1 Backend (admin) pages

- Page = `backend/**/page.tsx` + sibling `page.meta.ts` with `requireAuth`, `requireFeatures`, localized `pageTitleKey`/`pageGroupKey`, `pageOrder`, `icon` from the installed icon registry (an unlisted name renders nothing), `breadcrumb` with `labelKey`; create/edit/detail pages `navHidden` (`backend-ui.md` L13-21). Example `backend/todos/page.meta.ts`:

```ts
export const metadata = {
  requireAuth: true, requireFeatures: ['example.todos.view'],
  pageTitle: 'General tasks', pageTitleKey: 'example.todos.page.title',
  pageGroup: 'Work plan', pageGroupKey: 'example.workPlan.nav.group', pageOrder: 120,
  icon: 'check-square',
  breadcrumb: [{ label: 'General tasks', labelKey: 'example.todos.page.title' }],
}
```

- Page shell: server `Page`/`PageBody` from `@open-mercato/ui/backend/Page` delegating to a client island (example `backend/todos/page.tsx` L1-12). Settings pages: `pageContext: 'settings'`, `navHidden: true`; profile: `pageContext: 'profile'` (`backend-ui.md` L16-17).
- Default CRUD completeness: list + create + view/edit + delete as one slice; the `DataTable` owns filter/search, an add action and a linked row action; `CrudForm` owns create/update/delete, custom fields, `updatedAt` conflicts and return navigation (`backend-ui.md` L25).
- `DataTable` with stable colon-form `entityId`, `extensionTableId`/`perspective.tableId`, shared column helpers, `RowActions` with stable ids, built-in filter/search/export/column controls, server pagination not re-sliced, empty state and shared loading/error; no `apiPath` prop (`backend-ui.md` L33-37). Example `TodosTable.tsx` L267-300:

```tsx
<DataTable
  title={t('example.todos.table.title')} titleHeadingLevel={1}
  actions={<Button asChild><Link href="/backend/todos/create">{t('example.todos.table.actions.create')}</Link></Button>}
  columns={effectiveColumns} data={todosWithOrgNames} exporter={exportConfig}
  searchValue={title} onSearchChange={…}
  filters={[{ id: 'is_done', label: t('…filters.done'), type: 'checkbox' }, { id: 'created_at', …, type: 'dateRange' }]}
  entityId="example:todo" sortable sorting={sorting} onSortingChange={handleSortingChange}
  perspective={{ tableId: extensionPoints.hosts.todosTable.tableId }}
  rowActions={(row) => <RowActions items={[{ label: t('…actions.edit'), href: `/backend/todos/${row.id}/edit` }, …]} />}
/>
```

- `CrudForm` with typed `fields`/`groups` (memoized), `createCrud`/`updateCrud`/`deleteCrud`, `initialValues` including `updatedAt`, `entityId`/`entityIds` for custom fields, explicit `null` clearing, `createCrudFormError` for local validation, `flash()` for feedback (`backend-ui.md` L41-46; `ui/AGENTS.md` L108-121). Example `TodoForm.tsx` L113-126:

```tsx
<CrudForm
  title={t('example.todos.form.create.title')} titleHeadingLevel={1}
  backHref={LIST_HREF} entityId={ENTITY_ID}
  fields={fields} groups={groups}
  submitLabel={t('example.todos.form.create.submit')} cancelHref={LIST_HREF}
  successRedirect={successRedirect}
  onSubmit={async (vals) => { await createCrud('example/todos', vals) }}
/>
```

- Data access: `apiCall`/`apiCallOrThrow`/`readApiResultOrThrow` from `@open-mercato/ui/backend/utils/apiCall`; never raw `fetch`; writes outside `CrudForm` go through `useGuardedMutation(...).runMutation(...)` (`backend-ui.md` L50; `upstream/AGENTS.md` L255-256; `ui/AGENTS.md` L111-113).
- States: `LoadingMessage`, `ErrorMessage`, `EmptyState`, `RecordNotFoundState` (not-found is not an error), `TabEmptyState`, `Alert`, flash; preserve input after errors; disable duplicate submits (`backend-ui.md` L51-52; `ui/AGENTS.md` L393-400).
- Cross-record references render display names, never UUIDs; selection controls backed by scoped option-source routes (`backend-ui.md` L29).
- Status display via `StatusBadge` with semantic tokens; `Tag` for user labels; `EnumBadge`/`BooleanIcon` for cell values (`backend-ui.md` L67; `ui/AGENTS.md` L219-230; example `TodosTable.tsx` L12, L60).
- Primitives only: `Button`/`IconButton`/`LinkButton`, `Checkbox`, `Input` family, `Select`, `Drawer`, `Kbd`, etc.; never raw `<button>`, raw checkbox, `<Link>` styled as button, `window.confirm` (use `useConfirmDialog`); `type="button"` on non-submit buttons; same-row buttons share `size` (`ui/AGENTS.md` L25-33, L99-106).
- Raw `<table>`/`<tr>`… in `backend/**` fails `ds:check` (`scripts/ds-check.mjs` L35-40, L208-213).

### 6.2 Design-system check (`yarn ds:check`, hard gate)

`scripts/ds-check.mjs` scans `src/**/*.{ts,tsx}` (excluding tests) and fails on:

| rule id | pattern / meaning |
|---|---|
| `hardcoded-palette` | `(text|bg|border|ring)-(red|green|emerald|blue|amber|orange|yellow|rose|lime|cyan|teal|indigo|violet|purple|pink)-NNN` in string literals (L6) |
| `arbitrary-tailwind` | `foo-[…]` arbitrary values (L7, L164-169) |
| `manual-dark-override` | any `dark:` prefix (L8) |
| `inline-style` | `style=` in JSX (L31-34) |
| `raw-backend-table` | raw table tags in files under `backend/` (L35-40) |

Exceptions live in `.ds-check-ignore` with `file`, `rule`, `match`, non-empty `reason`; stale entries fail the check (L133-162, L216-220). The current ignore file holds only scaffold/example baselines ("Existing scaffold styling retained as a bounded migration baseline"). Rules restated by `upstream/AGENTS.md` L282-288: use `{property}-status-{status}-{role}` tokens, DS scale, no `dark:` on semantic/status tokens, no hex/rgb in `className`, `border-border`/`border-input`; Boy Scout rule on touched lines.

### 6.3 Frontend (member `/club`, public `/p/...`) pages

- `frontend/**/page.tsx` with explicit auth posture in metadata; portal pages require `frontend/[orgSlug]/portal/**` (`backend-ui.md` L18-19). The spec rejected the customer portal for parents (Q-001) and uses `frontend` pages with `requireAuth`/`requireFeatures` for `auth` users (spec L926, V-1).
- Tailwind for member/public pages, shadcn via `@open-mercato/ui` for admin (`AGENTS.md` L7). Example `frontend/example.tsx` uses `"use client"` + `useT()`.
- Frontend middleware (`frontend/middleware.ts`) runs with `context.auth === null` for anonymous visitors and never on portal routes; use it only for URL canonicalization (`surface-map.md` L149-155).
- Public/portal or visually substantial work loads `om-backend-ui-design → references/frontend-and-design-system.md` (route shell, hierarchy, responsive, a11y, UX states) (`backend-ui.md` L65; `AGENTS.md` L96).

### 6.4 A11y, keyboard, responsiveness, dark mode

- Every dialog: Cmd/Ctrl+Enter submit and Escape cancel; every icon-only control has an accessible label (`backend-ui.md` L53; `ui/AGENTS.md` L124, L187).
- Keep responsive behavior, keyboard navigation, focus order, contrast and reduced-motion intact (`backend-ui.md` L70).
- Verification for every UI change: both locales, 375 px width, light and dark mode, console without errors, loading/empty/error/conflict/keyboard states (`AGENTS.md` L73; `spec-delivery.md` L54; spec exit gates L938, L960).
- Deterministic server/client locale, timezone and environment-derived render to avoid hydration mismatches (`backend-ui.md` L54).

### 6.5 i18n enforcement

- `useT()` in client components, `resolveTranslations()` on the server; translate titles, actions, placeholders, validation, empty/error states, notifications, navigation; never put translated output in machine ids, enums, logs or protocol values (`backend-ui.md` L74-77).
- `scripts/i18n-check-hardcoded.mjs` (advisory, exit 0 on findings, exit 1 only on allowlist errors — L166, L184) flags JSX text, JSX attributes `label|title|placeholder|description|tooltip|aria-label|alt|message|subtitle|helperText|emptyMessage` (L6-18), `toast.*`, `flash*`, `createCrudFormError`, `raiseCrudError` first arguments and `new Error(...)` messages that look like English phrases; `[internal]`-prefixed strings, technical tokens and dotted keys are skipped (L23-29). Per-module exceptions in `<module>/i18n/.hardcoded-allowlist.json` with a `reason` (L116-137). The spec adds this check to every phase's validation line and requires it green per module (spec L917, L930).
- Hardcoded-string rule is also gate 5 of the reference-quality audit (example `README.md` L76).

---

## 7. Integrations

- Provider-specific behavior never lives in a generic host module; an app provider is `src/modules/<provider>/` activated in `src/modules.ts` (`integrations.md` L3, L20). A complete provider = `index.ts`, `integration.ts` (credentials, health, versions, bundle, detail spot), `di.ts`, typed host adapter, `setup.ts`/`acl.ts` when needed, activation (L24). Provider env names prefixed and stable (L26).
- Family contracts (L7-16): transactional email `IntegrationDefinition` + DI sender/health; mailbox → `communication_channels` `ChannelAdapter`; payment gateway → `GatewayAdapter` + `registerGatewayAdapter`/`registerWebhookHandler`/`registerPaymentGatewayDescriptor` (example `di.ts` L41-69); commerce sync → `DataSyncAdapter`; file import/export → streaming parser, format adapter, progress, row errors, formula neutralization.
- Credentials: stored through the integrations credential service/encryption maps; never logged or returned; `userId` threaded on per-user reads/writes; tenant-wide credentials must not touch organization-owned rows without deriving the organization (L31-32).
- SSRF: validate external base URLs including redirects and private ranges; private endpoints only via an explicit dev setting (L33). Redact auth headers, tokens, signed URLs, provider payload bodies from errors/logs (L34).
- Webhooks: verify signatures against the raw body, enforce timestamp/replay bounds, atomically claim each inbox delivery (`atomic-inbox-claim`) (L36). Spec: gateway subscriber idempotent by `gateway_transaction_id` (spec L794).
- Reliability: timeouts, bounded retries with jitter, rate-limit handling, circuit/health, correlation ids; durable idempotency key per remote mutation preserved across rollback/retry; transport success ≠ domain reconciliation (L40-44).
- Data sync: queue workers + `ProgressJob`, no overlapping runs, cursor persisted only after the batch and external-id mappings commit (L48-53).
- Import/export: stream, bound memory/file size, validate content type/extension/encoding/columns/rows, neutralize spreadsheet formulas, avoid zip/path traversal, clean temp files in `finally`, deterministic locale/timezone/decimal handling, cancellation + progress, domain writes through commands (L57-60). Spec: bank statement CSV/MT940 import routes to `om-integration-builder` (spec L993).
- Testing: contract server/mock for normal/timeout/rate-limit/malformed/partial/retry/duplicate/signature/pagination; verify redaction, SSRF rejection, scope isolation, replay; rerun produces no duplicates; injected batch failure does not advance the cursor (L77-81).
- Mock adapters are credential-free and network-free (`surface-map.md` L237-238); the spec replaces Stripe with a test adapter conforming to the `payment_gateways` contract (spec L862).

---

## 8. Testing and validation

### 8.1 Unit tests (Jest)

- `packages/app/jest.config.cjs`: `testEnvironment: 'node'`, `testTimeout: 30000`, `passWithNoTests: true`, `roots: ['<rootDir>/src']`, `setupFilesAfterEnv: jest.setup.ts` (jest-dom + ResizeObserver/pointer-capture stubs), module mapper `@/* → src/*`, `#generated/* → .mercato/generated/*`, custom transformer `scripts/jest-mikroorm-transformer.cjs` (strips `import.meta.resolve` before ts-jest; `diagnostics: false`, so type errors do not fail tests), `transformIgnorePatterns` allowing `@open-mercato`, `@mikro-orm`, `@tanstack/*`; ignores `/.ai/qa/`.
- Test file locations by convention of the reference module: `__tests__/*.test.ts(x)` next to the code (`src/modules/<id>/__tests__/`, `commands/__tests__/`, `api/__tests__/`, `lib/__tests__/`, `widgets/__tests__/`) and `__integration__/TC-<MODULE>-NNN-*.spec.ts` (`surface-map.md` L14, L33, L51, L66…). Both are filtered out of emitted apps, so `example` ships no tests here. `ds-check` and `i18n-check` skip `__tests__`, `__integration__`, `*.test.*`, `*.spec.*`.
- Standalone Jest files import globals from `@jest/globals` when `tsconfig` does not provide them (`review-checklist.md` L37).
- Test tooling available: `@testing-library/react` 16, `@testing-library/jest-dom` 7, `jest-environment-jsdom`, `ts-jest`, `@playwright/test` 1.58 (`package.json` L134-150).

### 8.2 Integration / E2E (Playwright)

- `yarn test:integration` → `npx playwright test --config .ai/qa/tests/playwright.config.ts`; `yarn test:integration:ephemeral` → `yarn mercato test:integration` (ephemeral DB/app) (`package.json` L25-28). NOTE: `.ai/qa/` does not exist in the repository today (`ls .ai` shows no `qa`), so the config path is unbacked.
- Spec contract: tests live in `.ai/qa/tests/<module>/TEST-0xx-*.spec.ts` (relative to `packages/app/`); a phase runs `yarn test:integration:ephemeral --grep "TEST-0(01|02|…)"`; each test creates its own tenant, organization, users and records through the API; each phase has at least one test that reads an encrypted column raw from the database (spec L862). Test levels used: `integration`, `security`, `UI`, `integration + UI` (spec L864-913).
- Integration tests must be self-contained: API fixtures created in setup, cleaned in `finally`, no reliance on seeded/demo data (`upstream/AGENTS.md` L167; `testing-debugging.md` L63).
- Every new or materially changed extension surface names its own self-contained integration test in the spec traceability table (`spec-delivery.md` L16, L18-28).
- Oracles to cover (`testing-debugging.md` L51-66): two tenants/two orgs allowed/denied/null-scope/wildcard; injected failure between multi-phase writes; update/delete with current/stale/missing versions; malformed ids/filters; retry/duplicate/cancel/worker restart; UI loading/empty/validation/server error/conflict/retry/success/authorization; two locales/timezones; semantic assertions over snapshots.
- No sleeps for convergence; never suppress or weaken failing tests (`testing-debugging.md` L81).

### 8.3 Validation command line

- Broad gate: `yarn generate && yarn typecheck && yarn typecheck:packages && yarn lint && yarn ds:check && yarn test && yarn build`; integration `yarn test:integration:ephemeral`; lessons `yarn lessons:check`; never migrate to validate (`AGENTS.md` L80).
- Spec per-phase line adds `yarn i18n:check-hardcoded`: `yarn generate && yarn typecheck && yarn typecheck:packages && yarn lint && yarn ds:check && yarn i18n:check-hardcoded && yarn test && yarn build`, plus `yarn test:integration:ephemeral` and SQL review from `yarn db:generate` (spec L917).
- `.ai/agentic.config.json` `validation.commands` (used by review/automation skills): `yarn generate`, `yarn typecheck`, `yarn lint`, `yarn ds:check`, `yarn test`, `yarn build` (no `typecheck:packages`, no i18n check — drift vs `AGENTS.md`/spec).
- Run gates so the shell status is the gate's status; no `| grep`/`| tail`; `pipefail` when capturing (`testing-debugging.md` L79).
- Validation ladder: focused test → `yarn generate` → focused typecheck → broad gate → integration → packed standalone validation when package exports change (`testing-debugging.md` L70-77).
- Tooling facts: `yarn lint` = ESLint flat config, `eslint-config-next/core-web-vitals` with several `react-hooks/*` rules disabled (`eslint.config.mjs` L17-25); `yarn typecheck` = `tsc --noEmit` strict (`tsconfig.json` L10); `yarn build` runs `yarn generate` first (`package.json` L16); Node ≥ 24 enforced by `preinstall` (root `package.json` L11).

### 8.4 Harness scripts

- Root scripts: `harness:validate` (`scripts/evaluate-agent-harness.mjs`), `harness:fixture`, `harness:release`, `harness:validate-knowledge-change`, `lessons:check` (`scripts/check-lessons.mjs`), `install-skills` (root `package.json` L42-47). `.ai/harness/` holds case files, oracles (`writable-ast-oracles.mjs`, `writable-behavior-oracles.mjs`, `writable-spec-oracles.mjs`), schemas and a generated-code review policy. `om-evolve-harness` adds/fixes recurring harness cases (`AGENTS.md` L134).
- `scripts/check-lessons.mjs` enforces lesson records: front matter exactly `title, modules, areas, topics` (JSON values), one H1, kebab-case file names, areas from the router set, exactly one catalog row per record, index byte budget (L7-45).

### 8.5 Backward compatibility for contract changes

- Any route/schema/ID/export/seam/signature/event-payload/CLI change must read `BACKWARD_COMPATIBILITY.md`; tenant/org scope alone is not a contract (`AGENTS.md` L35).
- Frozen surfaces: API routes, public imports/signatures, DB schema, event/entity/ACL/DI/widget/notification/AI ids, CLI commands/flags, generated bootstrap exports; prefer additive fields and aliases; rename/removal needs a deprecation bridge and migration plan (`contracts.md` L92).
- Deprecation protocol (`BACKWARD_COMPATIBILITY.md` L5-11): never remove/rename in one release; `@deprecated` JSDoc with target version; bridge (re-export/alias/dual-emit) ≥ 1 minor; document in `UPGRADE_NOTES.md`; PR references a spec with "Migration & Backward Compatibility". Emergency security exception only when the surface itself is the vulnerability, with a dated entry and maintainer sign-off (L13-25).
- Quick reference (L286-304): adding is OK; removing/renaming fields, routes, columns, DI names, feature ids, event ids, import paths is BREAKING; column type narrowing BREAKING, widening OK; feature-id removal needs a data migration.
- Spec declares Vereino's own surfaces stable from first deployment: API routes, event ids, ACL features, notification types, schedule targets, DB schema (spec L350).

---

## 9. Delivery

- Spec-first gate (`AGENTS.md` L140; `spec-delivery.md` L7-16): new capability/architecture/schema/API contract/cross-module/multi-phase → spec first; covering spec → reuse and update in place; bug fix/minor/docs/dependency/isolated refactor → direct; only the user's explicit words waive a spec; ambiguity → one bounded question.
- Specs: `.ai/specs/YYYY-MM-DD-slug.md` (English kebab slug), statuses `Draft` → `Ready for implementation` → `In progress` → `Implemented` (moved to `implemented/`) or `Archived` (moved to `archive/` with successor link); never delete a spec; fix links in the same commit; template `.ai/specs/SPEC-000-template.md` with every section preserved (`AGENTS.md` L55-65; `spec-delivery.md` L39-47). Spec writing requires invoking `om-spec-writing`; PR delivery `om-auto-create-pr`; local phases `om-implement-spec` (`AGENTS.md` L144-147).
- Phases: only the current unblocked phase in progress; parallelize only independent slices; every brief names phase, guides/skills, reference page, primitives, acceptance ids, owned files, validation oracle; a phase stays open while stubs, missing evidence or failing validation remain (`spec-delivery.md` L49-56).
- Plan first for multi-file tasks; large plans get a staff-engineer subagent review; verify before "done" with the narrowest real check and report the evidence; review your own diff; redo hacks cleanly (`AGENTS.md` L72-74).
- Git (`AGENTS.md` L38, L43): after each completed task stage only the changed files and commit with Conventional Commits (`docs:`, `feat(<module>):`, `fix:`, `chore:`); one task = one commit; never commit half-done code or a failing typecheck; push only when asked; ask before push/force-push/rebase of shared branches or any commit touching migrations; never commit `.env*`, `node_modules/`, `.mercato/`. Observed history matches: `feat(i18n): …`, `docs(spec): …`, `chore(monorepo): …`, `docs(ai): …`.
- Subagents never stage, commit or push; the coordinator integrates and commits; give each disjoint files (`AGENTS.md` L75; lesson `subagents-never-stage-changes.md`).
- Run logs: `.ai/runs/YYYY-MM-DD-slug.md` for every autonomous run, created at start, completed before end (goal/trigger, spec/branch, steps, decisions with reasons, files changed, commands and results with failures verbatim, open problems, next steps); committed with the run's work; template in `.ai/runs/README.md` (`AGENTS.md` L60, L66; `CLAUDE.md` L9, L12).
- Lessons: after a bug fix, user correction, failed approach or durable fact → `.ai/lessons/<slug>.md` from `_template.md` (Context/Problem/Rule/Applies to) + one row in `.ai/lessons.md`; `node scripts/check-lessons.mjs`; a mistake corrected twice becomes an `AGENTS.md` rule (`AGENTS.md` L61, L67). Claude auto-memory is private; shared knowledge goes to lessons (`CLAUDE.md` L11).
- Before finishing: spec status/folder correct, run log complete, lessons recorded, all in the same commit (`AGENTS.md` L68).
- Repository language: English for docs, specs, research, code, comments, commit messages, even when the conversation is Polish; UI text only in catalogs (`AGENTS.md` L37; `CLAUDE.md` L13).
- Automate repetition: work done more than twice becomes `.ai/skills/<id>/SKILL.md` or a script in `scripts/` (`AGENTS.md` L76).
- Review: `.ai/review-checklist.md` applies to every diff touching `src/modules/**`, `src/modules.ts` or discovered surfaces, in addition to `om-code-review`.
- Upstream PR labels/QA gate exist in `upstream/AGENTS.md` L149-161, but the local `.ai/agentic.config.json` sets `labels.enabled: false`, `qaGate: false`, `tracker: github`; no `.github/` directory exists.

---

## 10. Monorepo

- Yarn 4 workspaces under `packages/*`, `nodeLinker: node-modules`, `nmHoistingLimits: workspaces` (each workspace has its own `node_modules`), `npmMinimalAgeGate: 5d` with `@open-mercato/*` preapproved (`.yarnrc.yml`). `packageManager: yarn@4.17.1`; Node ≥ 24 (root `package.json` L6, L55).
- Packages and allowed imports (`AGENTS.md` L10-17):

| Package | Name | Holds | May import |
|---|---|---|---|
| `packages/app` | `@vereino/app` | Open Mercato app, modules, config, scripts, `.ai/qa` tests | `@vereino/core`, `@vereino/db`, `@vereino/ui`, `@open-mercato/*` |
| `packages/core` | `@vereino/core` | pure domain logic, types, validation schemas | nothing app/React/Next/DB-specific |
| `packages/db` | `@vereino/db` | MikroORM/PostgreSQL helpers, migration/seed/test-db utilities | `@vereino/core`, MikroORM |
| `packages/ui` | `@vereino/ui` | reusable React components (shadcn admin, Tailwind member/public) | `@vereino/core`, React, `@open-mercato/ui` |

- Dependency direction `app → ui | db → core`; no cycles; nothing imports `@vereino/app` (L17). Code moves out of a module only when ≥ 2 modules reuse it or it is framework-free (L18; spec L347).
- Each package exposes its public API from `src/index.ts`; no deep imports; new packages go into `transpilePackages` in `next.config.ts` (L77-90 lists `@vereino/core|db|ui`) and UI packages need an `@source` line in `src/app/globals.css` (L19).
- Dependencies are added to the workspace that uses them (`yarn workspace @vereino/<name> add …`); root holds only workspaces, `resolutions` (`lodash`, `lodash-es`, `zod`) and delegating scripts (L20; root `package.json`).
- `yarn typecheck:packages` = `yarn workspaces foreach -Apt --include '@vereino/core' --include '@vereino/db' --include '@vereino/ui' run typecheck` (root `package.json` L48); each package has `typecheck: tsc --noEmit -p tsconfig.json`; it is part of every phase validation (spec L347).
- `postinstall` links root `node_modules/@open-mercato` → `packages/app/node_modules/@open-mercato` so `.ai/guides` links resolve; read-only (`scripts/link-framework-sources.mjs`).
- Paths in `AGENTS.md`/guides starting with `src/`, `scripts/`, `.mercato/` or naming app config files are relative to `packages/app/`; run app commands from the root (`yarn dev`, `yarn generate`, `yarn mercato …`) (L21).
- Framework pin: every `@open-mercato/*` dependency is exactly `0.9.0` (`package.json` L52-79). Installed framework packages are read-only; never edit `node_modules`, `.mercato/generated/**`, generated facts or shipped migrations (`AGENTS.md` L48).
- Import strategy (upstream): package-level `@open-mercato/<pkg>/...` across boundaries; short relative imports for siblings (`upstream/AGENTS.md` L199-201).

---

## 11. Hard "Never" list (verbatim)

From `AGENTS.md` L45-51 (root, highest precedence):

- Never leak tenants, trust payload scope, or treat missing scope as unrestricted.
- Never edit `node_modules`/`.mercato/generated/**`/generated facts/shipped migrations.
- Never use cross-module ORM relations; use IDs/snapshots/events/enrichers/extensions/optional DI.
- Never use raw admin `fetch`/`<form>`, ad hoc crypto/cache/queues, role-name guards, or direct mutations when helpers exist.
- Never hard-code user strings/status colors; expose secrets/transcripts; or guess answerable contracts.

Plus from `AGENTS.md` L38, L80: "never commit half-done code or a failing typecheck"; "Never commit `.env*`, `node_modules/`, `.mercato/`"; "Never migrate to validate."

From `.ai/guides/upstream/AGENTS.md` L32-40:

- Never expose cross-tenant data or skip tenant/organization scoping.
- Never edit generated files by hand.
- Never add code directly under `apps/mercato/src/` except committed, typed `*.generated.ts` registries described below.
- Never create direct ORM relationships between modules.
- Never bypass mutation guards, command side effects, encryption helpers, RBAC wildcard matching, or shared UI data-call helpers.
- Never hard-code user-facing strings or design-system status colors.
- Never commit credentials, raw tokens, private keys, local-only ops files, or fork-only infrastructure notes into upstream-friendly branches.

From `.ai/guides/upstream/AGENTS.md` L282-286 (Design System):

- NEVER use hardcoded Tailwind status colors (`text-red-*`, `bg-green-*`, `text-amber-*`, etc.) — use `{property}-status-{status}-{role}` tokens
- NEVER use arbitrary values (`text-[13px]`, `p-[13px]`, `rounded-[24px]`, `z-[9999]`) — use DS scale
- NEVER add `dark:` overrides on semantic/status tokens — they already handle dark mode
- NEVER hardcode hex/rgb in `className` — always use CSS token names
- NEVER use hardcoded Tailwind color shades for borders (`border-gray-300`) — use `border-border`, `border-input`

From `@open-mercato/core/AGENTS.md` L22-30:

- Never create direct ORM relationships between modules; use foreign key IDs and fetch separately.
- Never expose cross-tenant data or omit tenant/organization scoping.
- Never hand-edit generated files.
- Never import generated app bootstrap files from packages.
- Never run raw `em.find` / `em.findOne` between scalar mutations and `em.flush()` on the same `EntityManager` without `withAtomicFlush`.
- Never hand-roll AES/KMS encryption or bypass `TenantDataEncryptionService`.
- Never compare raw feature arrays with exact string checks when wildcard grants apply.

From `@open-mercato/shared/AGENTS.md` L17-23:

- Never add domain-specific logic; this package is infrastructure only.
- Never import from `@open-mercato/core` or any domain package; shared has zero domain dependencies.
- Never gate raw feature arrays with `includes(...)`, `Set.has(...)`, or ad hoc wildcard matching.
- Never use `any` for exported shared interfaces.
- Never call `getCliModules()` / `hasCliModules()` / `registerCliModules()` from runtime code. (…)

From `@open-mercato/ui/AGENTS.md` L25-33:

- Never use raw `<button>`, raw checkbox inputs, or raw `<Link>` styled as a button.
- Never use raw `fetch` in UI data flows where `apiCall` is available.
- Never hard-code user-facing strings.
- Never use `window.confirm`; use the shared confirmation dialog.
- Never add custom per-page progress bars for DataTable bulk work.
- Never omit `page.meta.ts` for guarded portal pages.
- Never gate wildcard feature arrays with `includes(...)` or `Set.has(...)`.

From `@open-mercato/cli/AGENTS.md` L17-21:

- Never commit unrelated generated migrations caused by stale snapshots in other modules.
- Never make generator post-steps fail generation when optional cache tooling is unavailable.
- Never use runtime imports in `generators.ts` plugin files.

From the concept guides (`.ai/guides`):

- "Never edit a shipped migration. Add a corrective migration." (`contracts.md` L20)
- "never gate by mutable role names" (`contracts.md` L65)
- "Never call raw `fetch` from app backend UI." (`backend-ui.md` L50)
- "Never use raw buttons/checkboxes, a button-styled raw `Link`, or `window.confirm`" (`backend-ui.md` L69)
- "Never place a `page.tsx`/`page.meta.ts` directly under `src/app/(backend)/**` or `src/app/(frontend)/**`" (`backend-ui.md` L11)
- "never derive `menu:sidebar:*` or `menu:topbar:*` from memory" (`extensions.md` L83)
- "Never leave UI-only gating around a live mutation." (`extensions.md` L111)
- "never invent spot, route, entity, event, registry, or override IDs" (`extensions.md` L3)
- "Never place provider-specific behavior inside a generic host module." (`integrations.md` L3)
- "never log raw values or return secrets to list/detail APIs" (`integrations.md` L31)
- "never use raw `console.*` or place credentials/provider payload bodies in log fields" (`integrations.md` L35)
- "Never edit generated output to prove a theory." (`testing-debugging.md` L46)
- "Never stash and drop active work just to reproduce a baseline failure" (`testing-debugging.md` L23)
- "Never copy [raw agent transcripts] into the app repository." (`testing-debugging.md` L25)
- "Never write directly before approval." (AI write tools, `ai-workflows.md` L23)
- "Never cache MCP server instances or ACL context across requests." (`ai-workflows.md` L31)
- "Never propose a second teaching module, copy the example tree wholesale, or treat `ratelimit_probe` as a blueprint." (`spec-delivery.md` L16)
- "Never open a second spec for the same capability." (`spec-delivery.md` L12)
- "never repair a registry by hand" (`architecture.md` L81); "never patch `node_modules`" (L31)
- "Never bulk-read guide, skill, fact, or source trees." (`AGENTS.md` L157)
- "Never infer work from specs/PRs." (`AGENTS.md` L88)
- "**Never** copy the whole tree, or copy a file 'because it is in `example`'." (example `README.md` L27)

---

## 12. Gaps — what these sources do NOT define (the standards spec must add)

Repository-level engineering process

1. **Branch naming / branching model.** Only observed branches (`main`, `feat/spec-i18n-monorepo`, `docs/engineering-standards`); no written rule, no protection rules, no PR-vs-direct-commit policy for `main`.
2. **CI.** No `.github/`, `.gitlab-ci.yml` or other pipeline exists; `.ai/agentic.config.json` names `tracker: github` with labels and QA gate disabled. Which gates run where, on which events, and what blocks merge is undefined (the upstream label/QA workflow is for the framework repo, not this app).
3. **Commit message scope vocabulary.** Conventional Commits are required but the allowed types beyond `docs|feat|fix|chore` (`refactor`, `test`, `perf`, `ci`, `build`) and the scope list (`<module>` ids, `spec`, `ai`, `monorepo`, `i18n` observed) are not enumerated; no commitlint/husky enforcement.
4. **Code formatting.** No Prettier, no `.editorconfig`; ESLint is `next/core-web-vitals` only with several hooks rules disabled; the upstream "no `any`", "no one-letter names", "no inline comments" rules (`upstream/AGENTS.md` L269-274) are not enforced by any local tool (no `@typescript-eslint/no-explicit-any` config, ts-jest `diagnostics: false`). Line length, quote style, semicolons (example uses none), import ordering are unspecified.
5. **Definition of done / PR template / review ownership.** `.ai/review-checklist.md` exists for module diffs, but who reviews, required approvals, self-merge rules and PR description format are undefined.
6. **Versioning and release.** No app version policy (`0.1.0` everywhere), no changelog, no tagging, no deployment procedure (Railway scripts exist in `scripts/railway-*.sh` without documentation), no rollback runbook beyond the spec's "Rollout, Migration, and Rollback" section.
7. **Dependency updates.** `.yarnrc.yml` sets a 5-day age gate and root `resolutions` pin `zod`/`lodash`; no cadence, no audit policy (`yarn npm audit`), no rule for bumping the `@open-mercato/*` pin (the `om-auto-upgrade-*` skills exist but no schedule/approval rule), no license policy.
8. **Environment and secrets management.** Only "never commit `.env*`" and "provider env names prefixed and stable"; no `.env.example` ownership rule, no naming convention for Vereino env vars (`OM_*` is the framework prefix), no secret-storage/rotation policy, no rule for `NEXT_PUBLIC_*` exposure beyond the upstream override note.

Runtime and operations

9. **Logging format and levels.** `createLogger` + structured fields + `OM_LOG_LEVEL` are given, but no message vocabulary, no required fields (request id, tenant, correlation id), no retention/shipping, no level-per-environment policy.
10. **Error taxonomy.** HTTP statuses and some machine codes are used ad hoc (spec routes list `occurrence_place_conflict`, `declaration_closed`, …); no app-wide registry of error `code` values, no response-body shape beyond `{ error, code?, requestId }` from the framework, no rule for `module.reason` fingerprints per Vereino module, no client-side mapping/translation convention for codes.
11. **Observability.** `@open-mercato/telemetry` and `newrelic` are installed and `reportError` is mandated upstream, but no tracing/metrics/alerting standard, no SLOs, no health-check contract for Vereino jobs (`activities:generate-occurrences` etc.), no dashboard ownership.
12. **Performance budgets.** None: no bundle size, no API latency targets, no DB query limits (only `pageSize ≤ 100`, the 62-day calendar range in the spec), no N+1 policy beyond enrichers' `enrichMany`.
13. **Security headers / CSP ownership.** `next.config.ts` ships a CSP with `'unsafe-inline' 'unsafe-eval'` and `connect-src https:`; no rule on tightening it, no HSTS, no cookie attributes policy, no rate-limit defaults (the spec says "rate limit in `metadata`" but the exact limits per public route are unspecified), no CSRF statement for custom routes, no file-upload scanning policy (spec forbids SVG and > 3 MB for logos only).
14. **Data retention and backups.** Only placeholders in the spec (accounting retention "to be confirmed", Q-019); no backup/restore, no DB migration rollback (`down()` exists but no policy for when it must be reversible), no PII export (data portability) procedure.
15. **Accessibility standard.** Rules are behavioral (keyboard, labels, contrast, reduced motion, 375 px, light/dark) but no named conformance level (e.g. WCAG 2.2 AA), no automated a11y check in the gate, no screen-reader test requirement beyond "a11y" in the exit gate.
16. **Testing policy details.** `passWithNoTests: true` and `diagnostics: false` make the unit gate permissive; no coverage threshold, no rule on test naming for unit files (`*.test.ts` vs `*.spec.ts`), no unit-vs-integration split rule for Vereino (reference module uses `__tests__/` + `__integration__/TC-…`, spec uses `.ai/qa/tests/<module>/TEST-0xx-*.spec.ts`), and `.ai/qa/` is absent — the Playwright config and the `om-integration-tests` skill referenced by the harness are not present locally.
17. **Validation drift.** Three different gate lines exist (`AGENTS.md`, spec phase line with `i18n:check-hardcoded`, `.ai/agentic.config.json` without `typecheck:packages`); the i18n check is advisory (exit 0) while the spec wants it "green/in CI" — the standard must declare the single canonical gate and which checks are blocking.
18. **Design-system reference docs.** Upstream points to `.ai/ds-rules.md`, `.ai/ui-components.md`, `.ai/ui-backend-components.md`; none exist in this repo. Token names (`status-*`, `brand-*`), typography scale and spacing scale must be sourced from the installed `@open-mercato/ui` or restated.
19. **API conventions not fixed by the framework.** Pagination response shape for custom routes (spec uses `{ items, totalCount }` for CRUD; custom lists vary), date/time serialization (ISO with timezone?), money field naming (`amount` int minor units + currency column), enum casing (snake_case strings observed), query-param naming (camelCase `payerPersonId` vs snake_case `sortField=created_at` both appear), no API versioning policy, no deprecation window for Vereino's own routes beyond "stable from first deployment".
20. **Public/sessionless route standard.** The spec's DD-35 system-scope lookup is a documented deviation from the root rule; the standard must codify the allowed pattern (one indexed lookup, rate limit, honeypot, 202-no-enumeration, token hashing) as a reusable rule.
21. **Frontend (`/club`, `/p`) component standard.** Admin pages have DataTable/CrudForm; member/public pages have only "Tailwind" + `om-backend-ui-design` references; no Vereino design tokens, layout shell, or component library decision for `@vereino/ui` yet.
22. **Monorepo package internals.** `@vereino/core|db|ui` are empty; no rules for their test setup, build output, export naming, or how `@vereino/db` test-database helpers integrate with the ephemeral test runner.
23. **Documentation standards.** Where module READMEs live, ADR format (the spec embeds DD-nn decisions), docs for operators, and the English-only rule's exceptions (Polish UI copy, legal texts) are not formalized.
24. **Local dev environment.** No standard for Docker/Postgres setup, Node version manager, Windows/WSL specifics (scripts exist: `fix-wsl-inotify.mjs`, `dev-*`), seed data for development, or test-account conventions.
