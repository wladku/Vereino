// The group usage probe (TEST-A02, parity spec REQ-A02; #266): a QA-only process that boots the app the way the
// `mercato` CLI does, hides the DI token `activities.groupUsage` from its request container (a deployment without
// `activities`, as the messaging probe hides its providers) and runs `groups.groups.update` through the real command bus
// as a club member: without the contract the kind guard is skipped, so a team with matches becomes a class group.
//
// Usage (cwd = packages/app, a private QUEUE_BASE_DIR): node .ai/qa/tests/_fixtures/groups-usage-probe/probe.mjs '<json>'
//   input: { tenantId, organizationId, userId, groupId, kind, lockToken } — the last stdout line is the JSON result
//   `{ hidden, ok, kind, status, code }`.
const input = JSON.parse(process.argv[2] ?? '{}')
if (!process.env.QUEUE_BASE_DIR) throw new Error('[internal] the probe needs a private QUEUE_BASE_DIR')

const HIDDEN_TOKEN = 'activities.groupUsage'
const OPTIMISTIC_LOCK_HEADER = 'x-om-ext-optimistic-lock-expected-updated-at'

const { bootstrapFromAppRoot } = await import('@open-mercato/shared/lib/bootstrap/dynamicLoader')
await bootstrapFromAppRoot(process.cwd())
const di = await import('@open-mercato/shared/lib/di/container')

const scope = { tenantId: input.tenantId, organizationId: input.organizationId }
const container = await di.createRequestContainer()
const has = container.hasRegistration.bind(container)
container.hasRegistration = (token) => (token === HIDDEN_TOKEN ? false : has(token))

const ctx = {
  container,
  auth: { sub: input.userId, tenantId: scope.tenantId, orgId: scope.organizationId },
  organizationScope: {
    selectedId: scope.organizationId,
    filterIds: [scope.organizationId],
    allowedIds: [scope.organizationId],
    tenantId: scope.tenantId,
  },
  selectedOrganizationId: scope.organizationId,
  organizationIds: [scope.organizationId],
  // The group's lock token, as the route reads it from the request header.
  request: new Request('http://probe.local/api/groups/groups', {
    method: 'PUT',
    headers: { [OPTIMISTIC_LOCK_HEADER]: String(input.lockToken ?? '') },
  }),
}

let ok = false
let kind = null
let status = null
let code = null
try {
  const { result } = await container
    .resolve('commandBus')
    .execute('groups.groups.update', { input: { id: input.groupId, kind: input.kind }, ctx })
  ok = true
  kind = result?.entity?.kind ?? null
} catch (caught) {
  status = caught?.status ?? null
  code = caught?.body?.code ?? null
}

const result = { hidden: !container.hasRegistration(HIDDEN_TOKEN), ok, kind, status, code }
process.stdout.write(`\n${JSON.stringify(result)}\n`, () => process.exit(0))
