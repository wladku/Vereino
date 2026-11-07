// The payments undo probe (TEST-018, #184): a QA-only process that boots the app the way the `mercato` CLI does and
// replays one undo token through the real command bus as a club member, recording every event the bus emits. With
// `failAuditWrite` the bus's audit write (`actionLogService.markUndone`, which runs after the undo handler inside the
// same replay transaction) throws, so the replay rolls back after the handler ran — the case where an event emitted by
// the handler itself would leak out for a rolled-back undo.
//
// Usage (cwd = packages/app, a private QUEUE_BASE_DIR): node .ai/qa/tests/_fixtures/payments-undo-probe/probe.mjs '<json>'
//   input: { tenantId, organizationId, userId, undoToken, failAuditWrite? } — the last stdout line is the JSON result
//   `{ error, events: [{ event, payload }] }` with the `payments.*` events only.
const input = JSON.parse(process.argv[2] ?? '{}')
if (!process.env.QUEUE_BASE_DIR) throw new Error('[internal] the probe needs a private QUEUE_BASE_DIR')

const { bootstrapFromAppRoot } = await import('@open-mercato/shared/lib/bootstrap/dynamicLoader')
await bootstrapFromAppRoot(process.cwd())
const di = await import('@open-mercato/shared/lib/di/container')

const events = []
const BUS_KEY = '__openMercatoGlobalEventBus__'

function recording(bus) {
  if (!bus || typeof bus.emit !== 'function' || bus.__probeRecording) return bus
  const emit = bus.emit.bind(bus)
  bus.emit = async (event, payload, options) => {
    events.push({ event, payload })
    return emit(event, payload, options)
  }
  bus.__probeRecording = true
  return bus
}

let currentBus = recording(globalThis[BUS_KEY])
Object.defineProperty(globalThis, BUS_KEY, {
  configurable: true,
  get: () => currentBus,
  set: (bus) => {
    currentBus = recording(bus)
  },
})

const scope = { tenantId: input.tenantId, organizationId: input.organizationId }
const container = await di.createRequestContainer()
if (input.failAuditWrite) {
  // `actionLogService` is request-scoped: the bus resolves this same instance from the container.
  const logs = container.resolve('actionLogService')
  logs.markUndone = async () => {
    throw new Error('probe: the audit write failed')
  }
}
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
}

let error = null
try {
  await container.resolve('commandBus').undo(input.undoToken, ctx)
} catch (caught) {
  error = caught instanceof Error ? caught.message.slice(0, 200) : String(caught)
}

const result = { error, events: events.filter((entry) => String(entry.event).startsWith('payments.')) }
process.stdout.write(`\n${JSON.stringify(result)}\n`, () => process.exit(0))
