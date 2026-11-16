// The payments charge service probe (TEST-C01, TEST-C02; #291): a QA-only process that boots the app the way the
// `mercato` CLI does and calls `payments.chargeService` directly as a club member, the way a `facilities` command does
// inside its own transaction — the cases the facilities API cannot produce: a rental with no payer of any kind, the
// moment `payments.charge.created` goes out, a second create for the same rental, and `statusOf` with foreign ids.
//
// Usage (cwd = packages/app, a private QUEUE_BASE_DIR): node .ai/qa/tests/_fixtures/payments-charge-service-probe/probe.mjs '<json>'
//   input: { tenantId, organizationId, userId, statusOf: string[] } — the last stdout line is the JSON result.
import { randomUUID } from 'node:crypto'

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
const service = container.resolve('payments.chargeService')
const em = container.resolve('em')
const chargeEvents = () => events.filter((entry) => String(entry.event) === 'payments.charge.created').length

async function chargeRows(sourceId) {
  return em
    .fork()
    .getConnection()
    .execute('select id, payer_label, status from payments_charges where source_id = ?', [sourceId])
}

const base = {
  sourceType: 'rental',
  payee: 'owner_institution',
  payeeInstitutionId: null,
  amount: 12_000,
  dueDate: '2030-01-15',
  description: 'Probe rental',
}

// A rental with no payer of any kind: 422 `charge_payer_required`, and the transaction (the rental with it) rolls back.
const noPayerSource = randomUUID()
let noPayer = null
try {
  await em.fork().transactional((tx) => service.createForSource(tx, { ...base, sourceId: noPayerSource }, ctx))
} catch (caught) {
  noPayer = { status: caught?.status ?? null, code: caught?.body?.code ?? caught?.code ?? null }
}
const noPayerRows = (await chargeRows(noPayerSource)).length

// A typed-in renter: the charge exists, `payments.charge.created` waits for `afterCommit`, the name is stored encrypted,
// and a second create for the same rental returns the same charge and writes nothing.
const labelSource = randomUUID()
const label = 'Jan Probny Najemca'
let insideTransaction = -1
const created = await em.fork().transactional(async (tx) => {
  const result = await service.createForSource(tx, { ...base, sourceId: labelSource, payerDisplayName: label }, ctx)
  insideTransaction = chargeEvents()
  return result
})
const beforeAfterCommit = chargeEvents()
await created.afterCommit()
const afterCommit = chargeEvents()
const again = await em
  .fork()
  .transactional((tx) => service.createForSource(tx, { ...base, sourceId: labelSource, payerDisplayName: label }, ctx))
await again.afterCommit()
const rows = await chargeRows(labelSource)

const statuses = await service.statusOf([created.chargeId, ...(input.statusOf ?? []), 'not-a-uuid', randomUUID()], ctx)

const result = {
  noPayer,
  noPayerRows,
  chargeId: created.chargeId,
  againChargeId: again.chargeId,
  rows: rows.length,
  status: rows[0]?.status ?? null,
  labelStoredPlain: rows.some((row) => String(row.payer_label ?? '').includes(label)),
  labelStored: rows.some((row) => !!row.payer_label),
  events: { insideTransaction, beforeAfterCommit, afterCommit, afterSecondCreate: chargeEvents() },
  statusOf: Object.fromEntries(statuses),
}
process.stdout.write(`\n${JSON.stringify(result)}\n`, () => process.exit(0))
