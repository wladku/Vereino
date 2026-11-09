// `facilities.rentals.create|confirm|cancel|move|no_show` and the job `facilities.rentals.advance_lifecycle`
// (facilities spec glossary *Booking (external rental)*, *Rental statuses*, the rental rows of *API, Command, and
// Error Contracts*; REQ-013, DD-19, DD-43, DD-46; #122):
// - staff enter a rental after a phone call: the slot is checked under the organization's occupancy lock (DD-43) —
//   units 1–4 (422), a rate for the category on the date (422), a closure or the opening hours (409 `place_closed`),
//   the `reservable_paid` zone (409 `zone_not_reservable`), sessions and other rentals on the place, its ancestors and
//   descendants (409 `rental_conflict`), the renter's entry ban (409 `entry_ban_active`) — and stored as `requested`
//   with the amount and the deadlines; with `payments` the charge is created in the same transaction (DD-19);
// - confirm (`requested → confirmed`), cancel (free up to 24 h before, else late: the charge is forfeited), no-show
//   and move (same checks for the new slot, the rental itself left out; keeps the status and the amount, clears the
//   reschedule flag) go through the status table (409 `invalid_transition`) with the lock token;
// - the lifecycle job closes the confirmed rentals whose end has passed (`confirmed → done`) with `advanceWhere`.
// Rental commands are not undoable: the status only moves forward (DD-46); a wrong entry is cancelled.
import { randomUUID } from 'node:crypto'
import type { EntityManager } from '@mikro-orm/postgresql'
import { registerCommand, type CommandHandler, type CommandRuntimeContext } from '@open-mercato/shared/lib/commands'
import { z } from 'zod'
import { calendarDateInZone } from '@vereino/core'
import { advanceWhere, assertTransition, authorizeScoped, foundationErrors } from '@/modules/foundation'
import { facilitiesErrors } from '../api/errors'
import { Rental } from '../data/entities'
import { rentalActionSchema, rentalCancelSchema, rentalCreateSchema, rentalMoveSchema } from '../data/validators'
import {
  cancellationDeadline,
  cancellationOutcome,
  MOVABLE_RENTAL_STATUSES,
  noShowAllowed,
  paymentDeadline,
  rentalTransitions,
  startAllowed,
  type RentalStatus,
} from '../lib/rentals'
import { chargeService } from '../services/charges'
import { clubTimeZone, institutionNames, personNames, type FacilitiesScope } from '../services/directory'
import { assessRentalSlot, type RentalIssue } from '../services/rental-slot'
import {
  MANAGE_KINDS,
  assertPlaces,
  emitAfterCommit,
  existingSpec,
  facilitiesLog,
  facilityTarget,
  inWriteTransaction,
  lockForOccupancy,
  rowLoader,
  throwFieldError,
  type FacilitiesCommandResult,
} from './shared'

export const RENTAL_RESOURCE_KIND = 'facilities.rental'

export type RentalSnapshot = {
  id: string
  tenantId: string
  organizationId: string
  placeId: string
  renterType: Rental['renterType']
  renterId: string | null
  renterCategory: Rental['renterCategory']
  requestedVia: Rental['requestedVia']
  startsAt: string
  endsAt: string
  units: number
  amount: number
  chargeId: string | null
  status: RentalStatus
  cancellationDeadline: string | null
  paymentDeadline: string | null
  needsReschedule: boolean
}

export type RentalCommandResult = FacilitiesCommandResult<Rental, RentalSnapshot> & {
  /** `charge_paid` when a cancellation left a paid charge as it was (refunds belong to `payments`). */
  chargeWarning?: 'charge_paid'
}

/** The snapshot of the audit log: ids, times, money and status — never the encrypted renter or contact fields. */
export function rentalSnapshot(row: Rental): RentalSnapshot {
  return {
    id: row.id,
    tenantId: row.tenantId,
    organizationId: row.organizationId,
    placeId: row.placeId,
    renterType: row.renterType,
    renterId: row.renterId ?? null,
    renterCategory: row.renterCategory,
    requestedVia: row.requestedVia,
    startsAt: row.startsAt.toISOString(),
    endsAt: row.endsAt.toISOString(),
    units: row.units,
    amount: row.amount,
    chargeId: row.chargeId ?? null,
    status: row.status,
    cancellationDeadline: row.cancellationDeadline?.toISOString() ?? null,
    paymentDeadline: row.paymentDeadline?.toISOString() ?? null,
    needsReschedule: row.needsReschedule,
  }
}

/** The field a slot issue is shown at in the rental form. */
const ISSUE_FIELDS: Record<RentalIssue['code'], string> = {
  rental_units_invalid: 'units',
  rental_rate_missing: 'renterCategory',
  place_closed: 'startsAt',
  maintenance_scheduled: 'startsAt',
  zone_not_reservable: 'startsAt',
  rental_conflict: 'startsAt',
  entry_ban_active: 'renterId',
}

async function throwFirstIssue(issues: readonly RentalIssue[]): Promise<void> {
  const first = issues.at(0)
  if (!first) return
  await throwFieldError(first.code, ISSUE_FIELDS[first.code], first.conflicts ? { conflicts: first.conflicts } : {})
}

type RentalCreateParsed = z.output<typeof rentalCreateSchema>

/** The renter's name: the institution's or person's name for a registered renter, the typed name otherwise (422). */
async function renterName(
  ctx: CommandRuntimeContext,
  em: EntityManager,
  scope: FacilitiesScope,
  parsed: RentalCreateParsed,
): Promise<string> {
  if (parsed.renterType === 'unregistered') {
    const name = parsed.renterDisplayName?.trim()
    if (!name) await throwFieldError('rental_renter_invalid', 'renterDisplayName')
    return name as string
  }
  if (!parsed.renterId) return throwFieldError('rental_renter_invalid', 'renterId')
  const names =
    parsed.renterType === 'institution'
      ? await institutionNames(ctx.container, scope, [parsed.renterId], em)
      : await personNames(ctx.container, scope, [parsed.renterId], em)
  const name = names.get(parsed.renterId)
  if (!name) return throwFieldError('rental_renter_invalid', 'renterId')
  return name
}

async function emitRental(row: Rental, event: string): Promise<void> {
  await emitAfterCommit(
    `facilities.rental.${event}` as Parameters<typeof emitAfterCommit>[0],
    { tenantId: row.tenantId, organizationId: row.organizationId },
    { id: row.id, placeId: row.placeId },
  )
}

const createRentalCommand: CommandHandler<Record<string, unknown>, RentalCommandResult> = {
  id: 'facilities.rentals.create',
  isUndoable: false,
  async execute(rawInput, ctx) {
    const id = randomUUID()
    const now = new Date()
    const afterCommit: Array<() => Promise<void>> = []
    const result = await inWriteTransaction(ctx, 'facilities.rentals.create', async (em) => {
      await lockForOccupancy(ctx, em)
      const authorized = await authorizeScoped(
        {
          input: rentalCreateSchema,
          resourceKind: RENTAL_RESOURCE_KIND,
          allowedKinds: MANAGE_KINDS,
          resolveTarget: (_parsed, _entity, scope) => facilityTarget({ id, ...scope }),
        },
        rawInput,
        ctx,
        em,
      )
      const { parsed, tenantId, organizationId } = authorized
      const scope = { tenantId, organizationId }
      await assertPlaces(ctx, em, scope, [parsed.placeId])
      const name = await renterName(ctx, em, scope, parsed)
      const startsAt = new Date(parsed.startsAt)
      if (!startAllowed(startsAt, now)) await throwFieldError('rental_start_past', 'startsAt')
      const renterId = parsed.renterType === 'unregistered' ? null : (parsed.renterId ?? null)
      const assessment = await assessRentalSlot(
        ctx.container,
        em,
        scope,
        {
          placeId: parsed.placeId,
          startsAt,
          units: parsed.units,
          renterCategory: parsed.renterCategory,
          renterType: parsed.renterType,
          renterId,
        },
        now,
      )
      await throwFirstIssue(assessment.issues)
      const row = em.create(Rental, {
        id,
        ...scope,
        placeId: parsed.placeId,
        renterType: parsed.renterType,
        renterId,
        renterDisplayName: name,
        // The requested category stays on the rental (a move re-quotes with it); `rate_id` names the rate applied.
        renterCategory: parsed.renterCategory,
        contactName: parsed.contactName ?? null,
        contactPhone: parsed.contactPhone ?? null,
        contactEmail: parsed.contactEmail ?? null,
        purpose: parsed.purpose ?? null,
        requestedVia: parsed.requestedVia,
        startsAt,
        endsAt: assessment.endsAt,
        units: parsed.units,
        rateId: assessment.rateId,
        amount: assessment.amount ?? 0,
        status: 'requested',
        cancellationDeadline: assessment.cancellationDeadline,
        paymentDeadline: assessment.paymentDeadline,
        regulationsAcceptedAt: parsed.regulationsAccepted ? now : null,
        regulationsAcceptedVia: parsed.regulationsAccepted ? parsed.requestedVia : null,
        notes: parsed.notes ?? null,
      })
      em.persist(row)
      // DD-19: with `payments` the charge is written in this transaction; a throw rolls the rental back with it.
      const charges = chargeService(ctx.container)
      if (charges && row.chargeId == null) {
        await em.flush()
        const timeZone = await clubTimeZone(ctx.container, scope)
        const charge = await charges.createForSource(
          em,
          {
            sourceType: 'rental',
            sourceId: row.id,
            payee: 'owner_institution',
            payeeInstitutionId: null,
            payerInstitutionId: row.renterType === 'institution' ? row.renterId : null,
            payerPersonId: row.renterType === 'person' ? row.renterId : null,
            amount: row.amount,
            dueDate: calendarDateInZone(row.paymentDeadline ?? row.startsAt, timeZone),
            description: name,
          },
          ctx,
        )
        row.chargeId = charge.chargeId
        afterCommit.push(charge.afterCommit)
      }
      return { entity: row, actingRole: authorized.actingRole, before: null }
    })
    for (const effect of afterCommit) await effect()
    await emitRental(result.entity, 'requested')
    return result
  },
  buildLog: ({ result }) =>
    facilitiesLog({
      result,
      resourceKind: RENTAL_RESOURCE_KIND,
      labelKey: 'facilities.audit.rentals.create',
      fallback: 'Enter a rental',
      after: rentalSnapshot(result.entity),
    }),
}

type TransitionSpec = {
  id: string
  to: RentalStatus | ((row: Rental, now: Date) => RentalStatus)
  event: string
  labelKey: string
  fallback: string
  schema: typeof rentalActionSchema | typeof rentalCancelSchema
  /** A check after the transition table allows the move (a no-show only after the start). */
  guard?: (row: Rental, now: Date) => Promise<void>
}

/** A status move on an existing rental with the lock token; a cancellation also cancels or forfeits the charge. */
function transitionCommand(spec: TransitionSpec): CommandHandler<Record<string, unknown>, RentalCommandResult> {
  return {
    id: spec.id,
    isUndoable: false,
    async execute(rawInput, ctx) {
      const now = new Date()
      const afterCommit: Array<() => Promise<void>> = []
      let chargeWarning: 'charge_paid' | undefined
      const result = await inWriteTransaction(ctx, spec.id, async (em) => {
        const authorized = await authorizeScoped(
          existingSpec(spec.schema, RENTAL_RESOURCE_KIND, rowLoader(ctx, Rental)),
          rawInput,
          ctx,
          em,
        )
        const row = authorized.entity as Rental
        const before = rentalSnapshot(row)
        const to = typeof spec.to === 'function' ? spec.to(row, now) : spec.to
        await assertTransition(rentalTransitions, row.status, to)
        if (spec.guard) await spec.guard(row, now)
        row.status = to
        row.updatedAt = now
        if (to === 'cancelled_free' || to === 'cancelled_late') {
          const reason = (authorized.parsed as { reason?: string | null }).reason
          if (reason) row.decisionReason = reason
          const charges = chargeService(ctx.container)
          if (charges && row.chargeId) {
            const outcome = await charges.cancelForSource(
              em,
              { sourceType: 'rental', sourceId: row.id, outcome: to === 'cancelled_free' ? 'cancelled' : 'forfeited' },
              ctx,
            )
            chargeWarning = outcome.warning
            if (outcome.afterCommit) afterCommit.push(outcome.afterCommit)
          }
        }
        return { entity: row, actingRole: authorized.actingRole, before }
      })
      for (const effect of afterCommit) await effect()
      await emitRental(result.entity, spec.event)
      return chargeWarning ? { ...result, chargeWarning } : result
    },
    buildLog: ({ result }) =>
      facilitiesLog({
        result,
        resourceKind: RENTAL_RESOURCE_KIND,
        labelKey: spec.labelKey,
        fallback: spec.fallback,
        after: rentalSnapshot(result.entity),
      }),
  }
}

const confirmRentalCommand = transitionCommand({
  id: 'facilities.rentals.confirm',
  to: 'confirmed',
  event: 'confirmed',
  labelKey: 'facilities.audit.rentals.confirm',
  fallback: 'Confirm a rental',
  schema: rentalActionSchema,
})

const cancelRentalCommand = transitionCommand({
  id: 'facilities.rentals.cancel',
  to: (row, now) => cancellationOutcome(now, row.cancellationDeadline ?? cancellationDeadline(row.startsAt)),
  event: 'cancelled',
  labelKey: 'facilities.audit.rentals.cancel',
  fallback: 'Cancel a rental',
  schema: rentalCancelSchema,
})

const noShowRentalCommand = transitionCommand({
  id: 'facilities.rentals.no_show',
  to: 'no_show',
  event: 'no_show',
  labelKey: 'facilities.audit.rentals.noShow',
  fallback: 'Record a no-show',
  schema: rentalActionSchema,
  guard: async (row, now) => {
    if (!noShowAllowed(row.startsAt, now)) await facilitiesErrors.throw('rental_not_started')
  },
})

const moveRentalCommand: CommandHandler<Record<string, unknown>, RentalCommandResult> = {
  id: 'facilities.rentals.move',
  isUndoable: false,
  async execute(rawInput, ctx) {
    const now = new Date()
    const result = await inWriteTransaction(ctx, 'facilities.rentals.move', async (em) => {
      await lockForOccupancy(ctx, em)
      const authorized = await authorizeScoped(
        existingSpec(rentalMoveSchema, RENTAL_RESOURCE_KIND, rowLoader(ctx, Rental)),
        rawInput,
        ctx,
        em,
      )
      const row = authorized.entity as Rental
      const before = rentalSnapshot(row)
      // A move keeps the status: only a rental that still holds its slot can move.
      if (!MOVABLE_RENTAL_STATUSES.includes(row.status)) {
        await foundationErrors.throw('invalid_transition', { from: row.status, to: row.status })
      }
      const scope = { tenantId: row.tenantId, organizationId: row.organizationId }
      const placeId = authorized.parsed.placeId ?? row.placeId
      if (placeId !== row.placeId) await assertPlaces(ctx, em, scope, [placeId])
      const startsAt = new Date(authorized.parsed.startsAt)
      if (!startAllowed(startsAt, now)) await throwFieldError('rental_start_past', 'startsAt')
      const assessment = await assessRentalSlot(
        ctx.container,
        em,
        scope,
        {
          placeId,
          startsAt,
          units: row.units,
          renterCategory: row.renterCategory,
          renterType: row.renterType,
          renterId: row.renterId ?? null,
          ignoreIds: [row.id],
        },
        now,
      )
      // The amount stays as agreed, so a missing rate on the new date does not block the move.
      await throwFirstIssue(assessment.issues.filter((issue) => issue.code !== 'rental_rate_missing'))
      row.placeId = placeId
      row.startsAt = startsAt
      row.endsAt = assessment.endsAt
      row.cancellationDeadline = cancellationDeadline(startsAt)
      row.paymentDeadline = paymentDeadline(startsAt, now)
      row.needsReschedule = false
      row.updatedAt = now
      return { entity: row, actingRole: authorized.actingRole, before }
    })
    await emitRental(result.entity, 'moved')
    return result
  },
  buildLog: ({ result }) =>
    facilitiesLog({
      result,
      resourceKind: RENTAL_RESOURCE_KIND,
      labelKey: 'facilities.audit.rentals.move',
      fallback: 'Move a rental',
      after: rentalSnapshot(result.entity),
    }),
}

const lifecycleSchema = z.object({ now: z.iso.datetime({ offset: true }).optional() }).strict()

export type LifecycleJobResult = { now: string; counts: { done: number }; changedIds: string[] }

/**
 * `facilities.rentals.advance_lifecycle` (DD-46; the `facilities:rental-lifecycle` row of *Events, Jobs*): the
 * confirmed rentals whose end has passed become `done`. `now` comes from the operator CLI (`--now`); a worker never
 * sets it. Each move is one conditional update, so a retry changes nothing twice.
 */
const advanceLifecycleCommand: CommandHandler<Record<string, unknown>, LifecycleJobResult> = {
  id: 'facilities.rentals.advance_lifecycle',
  isUndoable: false,
  async execute(rawInput, ctx) {
    const { scope, ids, now } = await inWriteTransaction(ctx, 'facilities.rentals.advance_lifecycle', async (em) => {
      const authorized = await authorizeScoped(
        {
          input: lifecycleSchema,
          resourceKind: 'facilities.organization',
          allowedKinds: ['system_job'],
          resolveTarget: (_parsed, _entity, trusted) => ({ id: trusted.organizationId, ...trusted }),
          lock: 'none',
          scopeSource: { job: true },
        },
        rawInput,
        ctx,
        em,
      )
      const at = authorized.parsed.now ? new Date(authorized.parsed.now) : new Date()
      const trusted = { tenantId: authorized.tenantId, organizationId: authorized.organizationId }
      const changed = await advanceWhere(em, Rental, {
        transitions: rentalTransitions,
        where: { ...trusted, deletedAt: null, endsAt: { $lte: at } },
        from: 'confirmed',
        to: 'done',
        set: { updatedAt: at },
      })
      return { scope: trusted, ids: changed, now: at }
    })
    for (const id of ids) {
      await emitAfterCommit('facilities.rental.done', scope, { id })
    }
    return { now: now.toISOString(), counts: { done: ids.length }, changedIds: ids }
  },
}

registerCommand(createRentalCommand)
registerCommand(confirmRentalCommand)
registerCommand(cancelRentalCommand)
registerCommand(noShowRentalCommand)
registerCommand(moveRentalCommand)
registerCommand(advanceLifecycleCommand)
