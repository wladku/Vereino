// The facilities charge probe (TEST-R08, #285): a QA-only process that boots the app the way the `mercato` CLI does,
// hides `payments.chargeService` from every container it creates (the way the messaging probe hides tokens), and runs
// the rental commands as a club member — a deployment without the charge service, which the running app (with
// `payments`) cannot be. It also replays `facilities.rentals.confirm_paid` for a charge, as a redelivered
// `payments.payment.recorded` would (with the service visible).
//
// Usage (cwd = packages/app, a private QUEUE_BASE_DIR): node .ai/qa/tests/_fixtures/facilities-charge-probe/probe.mjs '<json>'
//   input: { tenantId, organizationId, userId, op: 'without', rental: <the create input> }
//            → { hidden, id, chargeId, created, confirmed }: entered and confirmed with the service hidden
//          { tenantId, organizationId, op: 'replay', chargeId } → { confirmedIds }: `confirm_paid` once more
//   the last stdout line is the JSON result.
const input = JSON.parse(process.argv[2] ?? '{}')
if (!process.env.QUEUE_BASE_DIR) throw new Error('[internal] the probe needs a private QUEUE_BASE_DIR')

const CHARGE_SERVICE = 'payments.chargeService'
const LOCK_HEADER = 'x-om-ext-optimistic-lock-expected-updated-at'

const { bootstrapFromAppRoot } = await import('@open-mercato/shared/lib/bootstrap/dynamicLoader')
await bootstrapFromAppRoot(process.cwd())
const di = await import('@open-mercato/shared/lib/di/container')

if (input.op === 'without') {
  di.registerDiRegistrars([
    ...di.getDiRegistrars(),
    (container) => {
      const has = container.hasRegistration.bind(container)
      container.hasRegistration = (name) => (String(name) === CHARGE_SERVICE ? false : has(name))
    },
  ])
}

const scope = { tenantId: input.tenantId, organizationId: input.organizationId }
const container = await di.createRequestContainer()
const commandBus = container.resolve('commandBus')

/** A club member's command context; `lock` becomes the optimistic-lock header of the request. */
function memberContext(lock) {
  return {
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
    request: new Request('http://probe.local/', { headers: lock ? { [LOCK_HEADER]: lock } : {} }),
  }
}

let result
if (input.op === 'without') {
  const created = await commandBus.execute('facilities.rentals.create', { input: input.rental, ctx: memberContext() })
  const row = created.result.entity
  const createdStatus = row.status
  const chargeId = row.chargeId ?? null
  const confirmed = await commandBus.execute('facilities.rentals.confirm', {
    input: { id: row.id },
    ctx: memberContext(row.updatedAt.toISOString()),
  })
  result = {
    hidden: !container.hasRegistration(CHARGE_SERVICE),
    id: row.id,
    chargeId,
    created: createdStatus,
    confirmed: confirmed.result.entity.status,
  }
} else if (input.op === 'replay') {
  // The context a worker passes to a command (foundation `jobCommandContext`): no session, the system actor.
  const replayed = await commandBus.execute('facilities.rentals.confirm_paid', {
    input: { chargeId: input.chargeId },
    ctx: { ...memberContext(), auth: null, request: undefined, systemActor: true },
  })
  result = { confirmedIds: replayed.result.confirmedIds }
} else {
  throw new Error(`[internal] unknown probe op ${String(input.op)}`)
}

process.stdout.write(`\n${JSON.stringify(result)}\n`, () => process.exit(0))
