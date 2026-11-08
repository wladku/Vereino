// The facilities request probe (TEST-033, #123): a QA-only process that boots the app the way the `mercato` CLI does and
// stands in for the online request flow of E08-S05, which is not built yet — it stores an external request that holds
// its slot (`pending_approval` with a valid `hold_expires_at`) through the ORM, so the platform encrypts its renter and
// contact fields as the real command will, and reads a request's status back.
//
// Usage (cwd = packages/app): node .ai/qa/tests/_fixtures/facilities-request-probe/probe.mjs '<json>'
//   input: { tenantId, organizationId, op: 'seed', placeId, startsAt, endsAt, holdHours } → `{ id }`
//          { tenantId, organizationId, op: 'status', id } → `{ status, decidedAt }`
//   the last stdout line is the JSON result.
import { randomUUID } from 'node:crypto'

const input = JSON.parse(process.argv[2] ?? '{}')

const { bootstrapFromAppRoot } = await import('@open-mercato/shared/lib/bootstrap/dynamicLoader')
await bootstrapFromAppRoot(process.cwd())
const di = await import('@open-mercato/shared/lib/di/container')

const container = await di.createRequestContainer()
const em = container.resolve('em').fork()
const meta = em.getMetadata().getAll()
const rental = Object.values(meta).find((entity) => entity.tableName === 'facilities_rentals')
if (!rental) throw new Error('[internal] facilities_rentals is not registered')
const scope = { tenantId: input.tenantId, organizationId: input.organizationId }

let result
if (input.op === 'seed') {
  const now = new Date()
  const row = em.create(rental.className, {
    id: randomUUID(),
    ...scope,
    createdAt: now,
    updatedAt: now,
    placeId: input.placeId,
    renterType: 'unregistered',
    renterDisplayName: 'Organizator z zewnątrz',
    renterCategory: 'external_commercial',
    contactName: 'Anna Wnioskująca',
    contactEmail: 'wniosek@example.test',
    requestedVia: 'online_form',
    startsAt: new Date(input.startsAt),
    endsAt: new Date(input.endsAt),
    units: 1,
    amount: 0,
    status: 'pending_approval',
    emailVerifiedAt: now,
    holdExpiresAt: new Date(now.getTime() + Number(input.holdHours ?? 48) * 3_600_000),
  })
  await em.persistAndFlush(row)
  result = { id: row.id }
} else if (input.op === 'status') {
  const row = await em.findOne(rental.className, { ...scope, id: input.id }, { fields: ['id', 'status', 'decidedAt'] })
  result = { status: row?.status ?? null, decidedAt: row?.decidedAt ? row.decidedAt.toISOString() : null }
} else {
  throw new Error(`[internal] unknown probe op ${String(input.op)}`)
}

process.stdout.write(`\n${JSON.stringify(result)}\n`, () => process.exit(0))
