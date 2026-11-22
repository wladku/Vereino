// `facilities.rentals.create|confirm|cancel|move|no_show` and the job `facilities.rentals.advance_lifecycle`
// (facilities spec glossary *Booking (external rental)*, *Rental statuses*, the rental rows of *API, Command, and
// Error Contracts*; REQ-013, DD-19, DD-43, DD-46; #122):
// - staff enter a rental after a phone call: the slot is checked under the organization's occupancy lock (DD-43) —
//   units 1–4 (422), a rate for the category on the date (422), a closure or the opening hours (409 `place_closed`),
//   the `reservable_paid` zone (409 `zone_not_reservable`), sessions and other rentals on the place, its ancestors and
//   descendants (409 `rental_conflict`), the renter's entry ban (409 `entry_ban_active`) — and stored as `requested`
//   with the amount and the deadlines; with `payments` the charge is created in the same transaction (DD-19);
// - confirm (`requested → confirmed`), cancel (free up to 24 h before, else late: the charge is forfeited), no-show
//   and move (same checks for the new slot, the rental itself left out; keeps the status, re-quotes the amount on a new
//   place and re-dates the payment deadline and the unpaid charge, #221; clears the reschedule flag) go through the
//   status table (409 `invalid_transition`) with the lock token;
// - the lifecycle job closes the confirmed rentals whose end has passed (`confirmed → done`) with `advanceWhere`, and —
//   where the management agreement with the place's owner turns automatic expiry on — cancels free of charge the
//   unpaid `requested` rentals whose payment deadline has passed (facilities parity spec DD-R11, REQ-R07; #284).
// The payment deadline of an entry or a move follows that agreement (DD-R10), else 3 days.
// The status commands are not undoable: the status only moves forward (DD-46); a wrong entry is cancelled. The one
// undoable command is `facilities.rentals.update` (facilities parity spec DD-R08, REQ-R05; #279): it corrects the
// contact, the purpose and the notes, and assigns a registered renter (institution or person, ban-checked) to an
// unregistered rental — while the rental is `requested` or `confirmed`; the notes also later (409 `rental_closed`).
// Money and the slot never change here. Staff commands run for the club administrator and, within their places, the
// facility attendant (`PLACE_KINDS`, #126): a create or a move names a place of the caller's grant (403
// `scope_denied` otherwise).
import { randomUUID } from 'node:crypto'
import { LockMode } from '@mikro-orm/core'
import type { EntityManager } from '@mikro-orm/postgresql'
import { registerCommand, type CommandHandler, type CommandRuntimeContext } from '@open-mercato/shared/lib/commands'
import { resolveTranslations } from '@open-mercato/shared/lib/i18n/server'
import { createLogger } from '@open-mercato/shared/lib/logger'
import { z } from 'zod'
import { calendarDateInZone, type ActingRole } from '@vereino/core'
import {
  advanceWhere,
  assertInScope,
  assertTransition,
  authorizeScoped,
  foundationErrors,
  jobCommandContext,
} from '@/modules/foundation'
import { facilitiesErrors } from '../api/errors'
import { Rental } from '../data/entities'
import {
  rentalActionSchema,
  rentalCancelByLinkSchema,
  rentalCancelSchema,
  rentalCreateSchema,
  rentalMoveSchema,
  rentalUpdateSchema,
} from '../data/validators'
import { rentalCancellable } from '../lib/rental-links'
import {
  awaitsPayment,
  correctionClosed,
  rentalChargeState,
  type RentalChargeState,
  type RentalCorrectionField,
} from '../lib/rental-record'
import {
  cancellationDeadline,
  cancellationOutcome,
  MOVABLE_RENTAL_STATUSES,
  expiresUnpaid,
  noShowAllowed,
  rentalTransitions,
  startAllowed,
  UNPAID_EXPIRY_REASON,
  type RentalAgreementTerms,
  type RentalStatus,
} from '../lib/rentals'
import { labelConflicts } from '../services/calendar'
import { chargeService, rentalChargeInput } from '../services/charges'
import { clubTimeZone, institutionNames, personNames, type FacilitiesScope } from '../services/directory'
import { rentalLinks, rentalOfLink } from '../services/rental-links'
import { assessRentalSlot, rentalAgreement, renterBanned, type RentalIssue } from '../services/rental-slot'
import {
  PLACE_KINDS,
  assertPlaces,
  emitAfterCommit,
  existingPlaceSpec,
  facilitiesLog,
  inWriteTransaction,
  lockForOccupancy,
  rowLoader,
  placeTarget,
  throwFieldError,
  type FacilitiesCommandResult,
} from './shared'

const linkPurgeLogger = createLogger('facilities').child({ component: 'purge-rental-links' })

export const RENTAL_RESOURCE_KIND = 'facilities.rental'

const lifecycleLogger = createLogger('facilities').child({ component: 'rental-lifecycle' })

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

/**
 * Throws the first issue at its field; its conflicts carry their places and the labels staff see (the activity, the
 * renter, the booking's purpose, the closure reason — facilities parity spec, #277), as the internal booking's do.
 */
async function throwFirstIssue(
  ctx: CommandRuntimeContext,
  em: EntityManager,
  scope: FacilitiesScope,
  placeId: string,
  issues: readonly RentalIssue[],
  now: Date,
): Promise<void> {
  const first = issues.at(0)
  if (!first) return
  const conflicts = first.conflicts
    ? await labelConflicts(ctx.container, em, scope, placeId, first.conflicts, now)
    : null
  await throwFieldError(first.code, ISSUE_FIELDS[first.code], conflicts ? { conflicts } : {})
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

async function emitRental(row: Rental, event: string, extra: Record<string, unknown> = {}): Promise<void> {
  await emitAfterCommit(
    `facilities.rental.${event}` as Parameters<typeof emitAfterCommit>[0],
    { tenantId: row.tenantId, organizationId: row.organizationId },
    { id: row.id, placeId: row.placeId, ...extra },
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
          allowedKinds: PLACE_KINDS,
          resolveTarget: (parsed, _entity, scope) => placeTarget({ id, ...scope, placeId: parsed.placeId }),
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
      await throwFirstIssue(ctx, em, scope, parsed.placeId, assessment.issues, now)
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
      if (charges) {
        await em.flush()
        const charge = await charges.createForSource(em, await rentalChargeInput(ctx.container, em, scope, row), ctx)
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
  /** A check after the transition table allows the move (a no-show only after the start, a confirm once paid). */
  guard?: (row: Rental, now: Date, ctx: CommandRuntimeContext) => Promise<void>
}

/** Cancels (free) or forfeits (late) the rental's charge in `em`'s transaction; nothing without `payments` or a charge. */
async function cancelCharge(
  ctx: CommandRuntimeContext,
  em: EntityManager,
  row: Rental,
  to: 'cancelled_free' | 'cancelled_late',
): Promise<{ warning?: 'charge_paid'; afterCommit?: () => Promise<void> }> {
  const charges = chargeService(ctx.container)
  if (!charges || !row.chargeId) return {}
  return charges.cancelForSource(
    em,
    { sourceType: 'rental', sourceId: row.id, outcome: to === 'cancelled_free' ? 'cancelled' : 'forfeited' },
    ctx,
  )
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
          existingPlaceSpec(spec.schema, RENTAL_RESOURCE_KIND, rowLoader(ctx, Rental)),
          rawInput,
          ctx,
          em,
        )
        const row = authorized.entity as Rental
        const before = rentalSnapshot(row)
        const to = typeof spec.to === 'function' ? spec.to(row, now) : spec.to
        await assertTransition(rentalTransitions, row.status, to)
        if (spec.guard) await spec.guard(row, now, ctx)
        row.status = to
        row.updatedAt = now
        if (to === 'cancelled_free' || to === 'cancelled_late') {
          const reason = (authorized.parsed as { reason?: string | null }).reason
          if (reason) row.decisionReason = reason
          const outcome = await cancelCharge(ctx, em, row, to)
          chargeWarning = outcome.warning
          if (outcome.afterCommit) afterCommit.push(outcome.afterCommit)
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

/** The live state of the rental's charge (`none` without a charge or without the charge service). */
async function chargeStateOf(ctx: CommandRuntimeContext, row: Rental): Promise<RentalChargeState> {
  const charges = chargeService(ctx.container)
  if (!charges || !row.chargeId) return 'none'
  return rentalChargeState(row.chargeId, await charges.statusOf([row.chargeId], ctx))
}

/**
 * A rental with a charge is confirmed by its payment (DD-R09): while the charge is open or partly paid a direct
 * confirm answers 409 `rental_awaits_payment` with the charge to record the payment on; once it is paid the confirm
 * succeeds (the repair path for a missed payment event). A rental without a charge is confirmed at once (the register).
 */
const confirmRentalCommand = transitionCommand({
  id: 'facilities.rentals.confirm',
  to: 'confirmed',
  event: 'confirmed',
  labelKey: 'facilities.audit.rentals.confirm',
  fallback: 'Confirm a rental',
  schema: rentalActionSchema,
  guard: async (row, _now, ctx) => {
    if (awaitsPayment(row.chargeId, await chargeStateOf(ctx, row))) {
      await facilitiesErrors.throw('rental_awaits_payment', { chargeId: row.chargeId as string })
    }
  },
})

const cancelRentalCommand = transitionCommand({
  id: 'facilities.rentals.cancel',
  to: (row, now) => cancellationOutcome(now, row.cancellationDeadline ?? cancellationDeadline(row.startsAt)),
  event: 'cancelled',
  labelKey: 'facilities.audit.rentals.cancel',
  fallback: 'Cancel a rental',
  schema: rentalCancelSchema,
})

/**
 * `facilities.rentals.cancel_by_link` (facilities parity spec REQ-R17, J-R06, the public cancel row of *API, Command,
 * and Error Contracts*; DD-R13; #286): the renter cancels through the e-mailed link, without a session. The link is
 * looked up once by its token hash (DD-35, the AGENTS.md exception approved on #253) and names the club; the rental
 * must still hold its slot and the link must be live (410 `token_link_expired` / `token_link_used` otherwise, with
 * no data). The outcome follows the staff rule — free up to the cancellation deadline, late after it (the charge
 * forfeited) — and the link is spent in the same transaction. Acting role `system`, `actor: guest` in the log, and
 * no input kept (the input is the raw token, DD-44).
 */
const cancelByLinkCommand: CommandHandler<Record<string, unknown>, RentalCommandResult> = {
  id: 'facilities.rentals.cancel_by_link',
  isUndoable: false,
  async execute(rawInput, ctx) {
    const input = rentalCancelByLinkSchema.parse(rawInput)
    const now = new Date()
    const afterCommit: Array<() => Promise<void>> = []
    let chargeWarning: 'charge_paid' | undefined
    const result = await inWriteTransaction(ctx, 'facilities.rentals.cancel_by_link', async (em) => {
      const found = await rentalOfLink(ctx.container, em, input.token)
      const scope = found.scope
      // The row lock serializes this with a staff action on the same rental; the status is read again under it.
      const row = await em.findOne(
        Rental,
        { id: found.row.id, ...scope, deletedAt: null },
        { lockMode: LockMode.PESSIMISTIC_WRITE, refresh: true },
      )
      if (!row || !rentalCancellable(row.status)) return foundationErrors.throw('token_link_expired')
      const redeemed = await rentalLinks(ctx.container).redeem(em, input.token, { scope })
      if (!redeemed) return foundationErrors.throw('token_link_expired')
      const before = rentalSnapshot(row)
      const to = cancellationOutcome(now, row.cancellationDeadline ?? cancellationDeadline(row.startsAt))
      await assertTransition(rentalTransitions, row.status, to)
      row.status = to
      row.updatedAt = now
      // The charge is cancelled in the club the link named: a sessionless request has no scope of its own.
      const outcome = await cancelCharge({ ...ctx, ...jobCommandContext(ctx.container, scope) }, em, row, to)
      chargeWarning = outcome.warning
      if (outcome.afterCommit) afterCommit.push(outcome.afterCommit)
      return { entity: row, actingRole: 'system' as const, before }
    })
    for (const effect of afterCommit) await effect()
    await emitRental(result.entity, 'cancelled')
    return chargeWarning ? { ...result, chargeWarning } : result
  },
  buildLog: async ({ result }) => ({
    ...(await facilitiesLog({
      result,
      resourceKind: RENTAL_RESOURCE_KIND,
      labelKey: 'facilities.audit.rentals.cancelByLink',
      fallback: 'Cancel a rental through the renter link',
      after: rentalSnapshot(result.entity),
      context: { actor: 'guest' },
    })),
    // The input is the raw token: keep it out of `action_logs` (DD-44).
    replayable: false,
  }),
}

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
        existingPlaceSpec(rentalMoveSchema, RENTAL_RESOURCE_KIND, rowLoader(ctx, Rental)),
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
      const placeChanged = placeId !== row.placeId
      if (placeChanged) {
        await assertInScope(authorized.scope, PLACE_KINDS, placeTarget({ id: row.id, ...scope, placeId }))
        await assertPlaces(ctx, em, scope, [placeId])
      }
      const startsAt = new Date(authorized.parsed.startsAt)
      if (!startAllowed(startsAt, now)) await throwFieldError('rental_start_past', 'startsAt')
      // A charge that holds a payment is never repriced or re-dated: such a rental keeps its amount and its deadline.
      // Every other move re-dates the deadline (and the charge, #221 L2), and a move to another place re-quotes the
      // amount from that place's rates, so a missing rate there answers `rental_rate_missing` as an entry does.
      const chargeState = await chargeStateOf(ctx, row)
      const holdsPayment = chargeState === 'partially_paid' || (chargeState === 'paid' && row.amount > 0)
      const requote = placeChanged && !holdsPayment
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
      await throwFirstIssue(
        ctx,
        em,
        scope,
        placeId,
        requote ? assessment.issues : assessment.issues.filter((issue) => issue.code !== 'rental_rate_missing'),
        now,
      )
      const kept = { amount: row.amount, rateId: row.rateId, paymentDeadline: row.paymentDeadline }
      row.placeId = placeId
      row.startsAt = startsAt
      row.endsAt = assessment.endsAt
      row.cancellationDeadline = cancellationDeadline(startsAt)
      if (requote) {
        row.amount = assessment.amount ?? 0
        row.rateId = assessment.rateId
      }
      if (!holdsPayment) row.paymentDeadline = assessment.paymentDeadline
      const charges = chargeService(ctx.container)
      if (charges && row.chargeId && !holdsPayment) {
        // The charge follows the rental in this transaction: due date, description, amount and payee (#221 L2).
        const charge = await rentalChargeInput(ctx.container, em, scope, row)
        const outcome = await charges.rescheduleForSource(
          em,
          {
            sourceType: charge.sourceType,
            sourceId: charge.sourceId,
            payeeInstitutionId: charge.payeeInstitutionId,
            amount: charge.amount,
            dueDate: charge.dueDate,
            description: charge.description,
          },
          ctx,
        )
        // A payment recorded since the state was read: the charge kept its terms, so the rental keeps them too.
        if (outcome.warning === 'charge_paid') Object.assign(row, kept)
      }
      row.needsReschedule = false
      row.updatedAt = now
      return { entity: row, actingRole: authorized.actingRole, before }
    })
    // The move's own id keys the renter's "moved" e-mail (#286): one e-mail per move, even back to an earlier slot.
    await emitRental(result.entity, 'moved', { moveId: randomUUID() })
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

/**
 * The snapshot of a correction (DD-R08): the status snapshot plus the fields a correction changes, so its undo can
 * restore them. Unlike the status commands' snapshot it holds the renter's name and contact, because the undo needs
 * them; the action log keeps its snapshots encrypted at rest (lesson `action-log-columns-encrypted-at-rest`).
 */
export type RentalCorrectionSnapshot = RentalSnapshot & {
  renterDisplayName: string
  contactName: string | null
  contactPhone: string | null
  contactEmail: string | null
  purpose: string | null
  notes: string | null
}

export type RentalUpdateResult = FacilitiesCommandResult<Rental, RentalCorrectionSnapshot>

export function rentalCorrectionSnapshot(row: Rental): RentalCorrectionSnapshot {
  return {
    ...rentalSnapshot(row),
    renterDisplayName: row.renterDisplayName,
    contactName: row.contactName ?? null,
    contactPhone: row.contactPhone ?? null,
    contactEmail: row.contactEmail ?? null,
    purpose: row.purpose ?? null,
    notes: row.notes ?? null,
  }
}

const TEXT_FIELDS = ['contactName', 'contactPhone', 'contactEmail', 'purpose', 'notes'] as const
type TextField = (typeof TEXT_FIELDS)[number]

type RentalUpdateParsed = z.output<typeof rentalUpdateSchema>
type CorrectionValues = Pick<RentalCorrectionSnapshot, TextField | 'renterType' | 'renterId'>

/** A text the form sends: undefined keeps the stored value, an empty one clears it. */
function textOrNull(value: string | null | undefined): string | null | undefined {
  return value === undefined ? undefined : value?.trim() || null
}

/** The fields whose value differs between `current` and `next` (an unchanged value is no change). */
function differingFields(current: CorrectionValues, next: Partial<CorrectionValues>): RentalCorrectionField[] {
  const fields: RentalCorrectionField[] = TEXT_FIELDS.filter(
    (field) => next[field] !== undefined && next[field] !== current[field],
  )
  const renterChanged =
    (next.renterType !== undefined && next.renterType !== current.renterType) ||
    (next.renterId !== undefined && next.renterId !== current.renterId)
  return renterChanged ? [...fields, 'renter'] : fields
}

function correctionValues(row: Rental): CorrectionValues {
  return {
    renterType: row.renterType,
    renterId: row.renterId ?? null,
    contactName: row.contactName ?? null,
    contactPhone: row.contactPhone ?? null,
    contactEmail: row.contactEmail ?? null,
    purpose: row.purpose ?? null,
    notes: row.notes ?? null,
  }
}

/**
 * Assigns a registered renter to an unregistered rental: both `renterType` and `renterId` (422
 * `rental_renter_invalid` otherwise, and for a rental whose renter is already a record or an unknown id); the name
 * becomes the record's; a renter with an entry ban in force on the rental's day on its place family answers 409
 * `entry_ban_active`.
 */
async function assignRenter(
  ctx: CommandRuntimeContext,
  em: EntityManager,
  row: Rental,
  parsed: RentalUpdateParsed,
): Promise<void> {
  const renterType = parsed.renterType
  const renterId = parsed.renterId
  if (!renterType || !renterId || row.renterType !== 'unregistered') {
    return throwFieldError('rental_renter_invalid', 'renterId')
  }
  const scope = { tenantId: row.tenantId, organizationId: row.organizationId }
  const names =
    renterType === 'institution'
      ? await institutionNames(ctx.container, scope, [renterId], em)
      : await personNames(ctx.container, scope, [renterId], em)
  const name = names.get(renterId)
  if (!name) return throwFieldError('rental_renter_invalid', 'renterId')
  const date = calendarDateInZone(row.startsAt, await clubTimeZone(ctx.container, scope))
  if (await renterBanned(ctx.container, em, scope, { placeId: row.placeId, renterType, renterId }, date)) {
    await throwFieldError('entry_ban_active', 'renterId')
  }
  row.renterType = renterType
  row.renterId = renterId
  row.renterDisplayName = name
}

/** Re-authorizes an undo or redo of a correction on the current scope: the rental's place, as the first execution. */
async function authorizeRentalReplay(ctx: CommandRuntimeContext, id: string | null | undefined): Promise<Rental> {
  const em = ctx.transactionalEm
  if (!em || !id) throw new Error('[internal] a rental replay needs the replay transaction and the id')
  const { entity } = await authorizeScoped(
    existingPlaceSpec(z.object({ id: z.uuid() }), RENTAL_RESOURCE_KIND, rowLoader(ctx, Rental)),
    { id },
    ctx,
    em,
    { mode: 'replay' },
  )
  return entity as Rental
}

const updateRentalCommand: CommandHandler<Record<string, unknown>, RentalUpdateResult> = {
  id: 'facilities.rentals.update',
  isUndoable: true,
  atomicReplay: true,
  async execute(rawInput, ctx) {
    const result = await inWriteTransaction(ctx, 'facilities.rentals.update', async (em) => {
      const authorized = await authorizeScoped(
        existingPlaceSpec(rentalUpdateSchema, RENTAL_RESOURCE_KIND, rowLoader(ctx, Rental)),
        rawInput,
        ctx,
        em,
      )
      const row = authorized.entity as Rental
      const parsed = authorized.parsed
      const before = rentalCorrectionSnapshot(row)
      const texts: Partial<Record<TextField, string | null>> = {}
      for (const field of TEXT_FIELDS) {
        const value = textOrNull(parsed[field])
        if (value !== undefined) texts[field] = value
      }
      const fields = differingFields(correctionValues(row), {
        ...texts,
        ...(parsed.renterType !== undefined ? { renterType: parsed.renterType } : {}),
        ...(parsed.renterId !== undefined ? { renterId: parsed.renterId } : {}),
      })
      if (correctionClosed(row.status, fields)) await facilitiesErrors.throw('rental_closed', { status: row.status })
      if (fields.includes('renter')) await assignRenter(ctx, em, row, parsed)
      Object.assign(row, texts)
      row.updatedAt = new Date()
      return { entity: row, actingRole: authorized.actingRole, before }
    })
    await emitRental(result.entity, 'updated')
    return result
  },
  buildLog: ({ result }) =>
    facilitiesLog({
      result,
      resourceKind: RENTAL_RESOURCE_KIND,
      labelKey: 'facilities.audit.rentals.update',
      fallback: 'Correct a rental',
      after: rentalCorrectionSnapshot(result.entity),
    }),
  async authorizeReplay({ ctx, logEntry }) {
    await authorizeRentalReplay(ctx, logEntry.resourceId)
  },
  async undo({ ctx, logEntry }) {
    const before = logEntry.snapshotBefore as RentalCorrectionSnapshot | null | undefined
    if (!before?.id) throw new Error('[internal] missing rental snapshot for undo')
    const row = await authorizeRentalReplay(ctx, before.id)
    // The undo follows the rule of the correction: a rental that left its slot keeps all but its notes.
    if (correctionClosed(row.status, differingFields(correctionValues(row), before))) {
      await facilitiesErrors.throw('rental_closed', { status: row.status })
    }
    row.renterType = before.renterType
    row.renterId = before.renterId
    row.renterDisplayName = before.renterDisplayName
    for (const field of TEXT_FIELDS) row[field] = before[field]
    row.updatedAt = new Date()
    await (ctx.transactionalEm as EntityManager).flush()
    await emitRental(row, 'updated')
  },
}

const lifecycleSchema = z.object({ now: z.iso.datetime({ offset: true }).optional() }).strict()

export type LifecycleJobResult = {
  now: string
  counts: { done: number; expired: number }
  changedIds: string[]
  /** The rentals cancelled free of charge as unpaid after their payment deadline (DD-R11). */
  expiredIds: string[]
}

/**
 * The unpaid `requested` rentals that expire at `at` (DD-R11): past their payment deadline, with no charge or an
 * untouched one, under a management agreement — in force on the day each was entered — that turns expiry on. The
 * agreement is read once per place and day.
 */
async function expiringRentals(
  ctx: CommandRuntimeContext,
  em: EntityManager,
  scope: FacilitiesScope,
  at: Date,
): Promise<Rental[]> {
  const unpaid = await em.find(
    Rental,
    { ...scope, deletedAt: null, status: 'requested', paymentDeadline: { $lt: at } },
    { orderBy: { id: 'asc' } },
  )
  if (unpaid.length === 0) return []
  const charges = chargeService(ctx.container)
  const chargeIds = unpaid.flatMap((row) => (row.chargeId ? [row.chargeId] : []))
  const statuses = charges && chargeIds.length > 0 ? await charges.statusOf(chargeIds, ctx) : new Map<string, string>()
  const timeZone = await clubTimeZone(ctx.container, scope)
  const agreements = new Map<string, RentalAgreementTerms | null>()
  const expiring: Rental[] = []
  for (const row of unpaid) {
    const enteredOn = calendarDateInZone(row.createdAt, timeZone)
    const key = `${row.placeId}:${enteredOn}`
    if (!agreements.has(key)) {
      agreements.set(key, await rentalAgreement(ctx.container, em, scope, row.placeId, enteredOn))
    }
    const shape = {
      status: row.status,
      startsAt: row.startsAt,
      paymentDeadline: row.paymentDeadline ?? null,
      cancellationDeadline: row.cancellationDeadline ?? null,
    }
    if (expiresUnpaid(shape, rentalChargeState(row.chargeId, statuses), agreements.get(key) ?? null, at)) {
      expiring.push(row)
    }
  }
  return expiring
}

/**
 * `facilities.rentals.advance_lifecycle` (DD-46; the `facilities:rental-lifecycle` row of *Events, Jobs*): the
 * confirmed rentals whose end has passed become `done`, and the unpaid rentals that expire (DD-R11) become
 * `cancelled_free` with the reason `unpaid_after_deadline` and their open charge cancelled. `now` comes from the
 * operator CLI (`--now`); a worker never sets it. Each move is one conditional update, so a retry changes nothing twice.
 */
const advanceLifecycleCommand: CommandHandler<Record<string, unknown>, LifecycleJobResult> = {
  id: 'facilities.rentals.advance_lifecycle',
  isUndoable: false,
  async execute(rawInput, ctx) {
    const afterCommit: Array<() => Promise<void>> = []
    const { scope, ids, expired, now } = await inWriteTransaction(
      ctx,
      'facilities.rentals.advance_lifecycle',
      async (em) => {
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
          // `at` decides which rentals ended; the row itself changes now (the CLI's `--now` may be in the past).
          set: { updatedAt: new Date() },
        })
        const charges = chargeService(ctx.container)
        const expiredRows: Rental[] = []
        for (const row of await expiringRentals(ctx, em, trusted, at)) {
          // The charge first, under its row lock: a payment recorded since the read leaves it paid in part, and the
          // rental then stays on the unpaid list instead of becoming free while money is held.
          if (charges && row.chargeId) {
            const outcome = await charges.cancelForSource(
              em,
              { sourceType: 'rental', sourceId: row.id, outcome: 'cancelled' },
              ctx,
            )
            if (outcome.warning) continue
            if (outcome.afterCommit) afterCommit.push(outcome.afterCommit)
          }
          const moved = await advanceWhere(em, Rental, {
            transitions: rentalTransitions,
            where: { ...trusted, id: row.id, deletedAt: null, paymentDeadline: { $lt: at } },
            from: 'requested',
            to: 'cancelled_free',
            set: { updatedAt: new Date() },
          })
          if (moved.length === 1) expiredRows.push(row)
        }
        // The reason is an encrypted column, so it is written through the entity, not the conditional update.
        for (const row of expiredRows) {
          row.status = 'cancelled_free'
          row.decisionReason = UNPAID_EXPIRY_REASON
        }
        await em.flush()
        return {
          scope: trusted,
          ids: changed,
          expired: expiredRows.map((row) => ({ id: row.id, placeId: row.placeId })),
          now: at,
        }
      },
    )
    for (const effect of afterCommit) await effect()
    for (const id of ids) {
      await emitAfterCommit('facilities.rental.done', scope, { id })
    }
    for (const entry of expired) {
      await emitAfterCommit('facilities.rental.cancelled', scope, { ...entry, reason: UNPAID_EXPIRY_REASON })
    }
    if (expired.length > 0) {
      lifecycleLogger.info('facilities:rental-lifecycle cancelled unpaid rentals after their payment deadline', {
        organizationId: scope.organizationId,
        rentalIds: expired.map((entry) => entry.id),
      })
    }
    return {
      now: now.toISOString(),
      counts: { done: ids.length, expired: expired.length },
      changedIds: ids,
      expiredIds: expired.map((entry) => entry.id),
    }
  },
}

const confirmPaidSchema = z.object({ chargeId: z.uuid() }).strict()

export type ConfirmPaidResult = { confirmedIds: string[] }

/**
 * `facilities.rentals.confirm_paid` (facilities parity spec DD-R09, REQ-R06; the `payments.payment.recorded` row of
 * *Events*; #285): the organization's `requested` rental whose charge is `chargeId` becomes `confirmed` once the
 * charge service reports that charge `paid`. One conditional update (`advanceWhere`), so a repeated event, a partial
 * payment or a charge of another source advances nothing (DD-46); without the charge service it does nothing. Run by
 * the `facilities:payment-recorded` subscriber with a session-less job context.
 */
const confirmPaidCommand: CommandHandler<Record<string, unknown>, ConfirmPaidResult> = {
  id: 'facilities.rentals.confirm_paid',
  isUndoable: false,
  async execute(rawInput, ctx) {
    const charges = chargeService(ctx.container)
    const { scope, confirmed } = await inWriteTransaction(ctx, 'facilities.rentals.confirm_paid', async (em) => {
      const authorized = await authorizeScoped(
        {
          input: confirmPaidSchema,
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
      const trusted = { tenantId: authorized.tenantId, organizationId: authorized.organizationId }
      const none = { scope: trusted, confirmed: [] as Array<{ id: string; placeId: string }> }
      if (!charges) return none
      const { chargeId } = authorized.parsed
      // No index on `charge_id` (facilities parity spec *Data Models*): the organization's requested rentals are few.
      const rental = await em.findOne(Rental, { ...trusted, chargeId, status: 'requested', deletedAt: null })
      if (!rental) return none
      if (rentalChargeState(chargeId, await charges.statusOf([chargeId], ctx)) !== 'paid') return none
      const moved = await advanceWhere(em, Rental, {
        transitions: rentalTransitions,
        where: { ...trusted, id: rental.id, chargeId, deletedAt: null },
        from: 'requested',
        to: 'confirmed',
        set: { updatedAt: new Date() },
      })
      return { scope: trusted, confirmed: moved.length === 1 ? [{ id: rental.id, placeId: rental.placeId }] : [] }
    })
    for (const entry of confirmed) await emitAfterCommit('facilities.rental.confirmed', scope, entry)
    return { confirmedIds: confirmed.map((entry) => entry.id) }
  },
}

// --- The purge job (engineering standards S9.5; `docs/compliance/retention.md` row R9; #525) ---

export type PurgeRentalLinksJobResult = {
  tenantId: string
  organizationId: string
  actingRole: ActingRole
  now: string
  deleted: number
}

/**
 * `facilities.rental_links.purge_dead` — the daily `facilities:purge-rental-links` job: deletes the club's rental links
 * that expired (the rental started), were used (the cancellation) or were deleted at least 30 days ago
 * (`DEAD_LINK_RETENTION_DAYS`); a valid link, or one dead for less, is kept. A repeated run deletes nothing more. Not
 * undoable: the link is dead and its raw token exists nowhere. A run that deleted nothing leaves no audit entry.
 */
const purgeRentalLinksCommand: CommandHandler<Record<string, unknown>, PurgeRentalLinksJobResult> = {
  id: 'facilities.rental_links.purge_dead',
  isUndoable: false,
  async execute(rawInput, ctx) {
    return inWriteTransaction(ctx, 'facilities.rental_links.purge_dead', async (em) => {
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
      const trusted = { tenantId: authorized.tenantId, organizationId: authorized.organizationId }
      const now = authorized.parsed.now ? new Date(authorized.parsed.now) : new Date()
      const deleted = await rentalLinks(ctx.container).purgeDead(em, trusted, now)
      linkPurgeLogger.info('Dead rental links purged', { ...trusted, now: now.toISOString(), deleted })
      return { ...trusted, actingRole: authorized.actingRole, now: now.toISOString(), deleted }
    })
  },
  async buildLog({ result }) {
    if (result.deleted === 0) return null
    const { translate } = await resolveTranslations()
    return {
      actionLabel: translate('facilities.audit.jobs.purgeRentalLinks', 'Delete the rental links dead for 30 days'),
      resourceKind: 'facilities.organization',
      resourceId: result.organizationId,
      tenantId: result.tenantId,
      organizationId: result.organizationId,
      context: { actingRole: result.actingRole, now: result.now, deleted: result.deleted },
    }
  },
}

registerCommand(createRentalCommand)
registerCommand(confirmRentalCommand)
registerCommand(cancelRentalCommand)
registerCommand(cancelByLinkCommand)
registerCommand(noShowRentalCommand)
registerCommand(moveRentalCommand)
registerCommand(updateRentalCommand)
registerCommand(advanceLifecycleCommand)
registerCommand(purgeRentalLinksCommand)
registerCommand(confirmPaidCommand)
