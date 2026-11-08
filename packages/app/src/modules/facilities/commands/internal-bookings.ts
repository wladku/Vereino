// `facilities.internal_bookings.create|cancel` (facilities spec glossary *Internal booking*, *Slot occupancy*, DD-25,
// DD-43, DD-46; club spec the internal-bookings row of *API*; REQ-023, R06; #123):
// - a coach, coordinator or administrator of any section books a place at once, without approval and in any zone:
//   under the organization's occupancy lock (DD-43) the period (422), a closure or the opening hours (409
//   `place_closed`) and the sessions, rentals and other bookings on the place, its ancestors and descendants (409
//   `rental_conflict` with the list and names — staff see them) are checked; the booking is stored `confirmed`, and the
//   external requests holding the slot become `superseded` in the same unit of work;
// - the booker, the coordinator of the booking's section or the administrator cancels it (`confirmed → cancelled`).
// A booking for a group is a one-off event of `activities` (`POST /api/activities/events`, DD-26), not a booking.
// Not undoable: the status only moves forward (DD-46); a wrong booking is cancelled.
import { randomUUID } from 'node:crypto'
import { registerCommand, type CommandHandler } from '@open-mercato/shared/lib/commands'
import { z } from 'zod'
import type { GrantKind, Scope } from '@vereino/core'
import { advanceWhere, assertTransition, authorizeScoped, foundationErrors } from '@/modules/foundation'
import { InternalBooking, Rental } from '../data/entities'
import { internalBookingCancelSchema, internalBookingCreateSchema } from '../data/validators'
import {
  bookingPeriodProblem,
  bookingStartAllowed,
  internalBookingTransitions,
  supersededRequests,
  type InternalBookingStatus,
} from '../lib/internal-bookings'
import { localSlotOf, rentalTransitions, slotWithinOpeningHours } from '../lib/rentals'
import { calendarEntries, type CalendarEntry } from '../services/calendar'
import { clubTimeZone, findSections, openingHours, sessionsByIds } from '../services/directory'
import { placeFamilyIds } from '../services/occupancy'
import {
  assertPlaces,
  emitAfterCommit,
  facilitiesLog,
  inWriteTransaction,
  lockForOccupancy,
  rowLoader,
  throwFieldError,
  type FacilitiesCommandResult,
} from './shared'

export const INTERNAL_BOOKING_RESOURCE_KIND = 'facilities.internal_booking'

/** Who books (least privileged first, DD-F08): facilities are club-wide for coaches and coordinators (club spec). */
export const BOOKING_KINDS: readonly GrantKind[] = ['coach', 'coordinator', 'club_admin']
export const BOOKING_MATCH = { clubWideKinds: ['coach', 'coordinator'] as GrantKind[] }

/** Who cancels: the booker (`self`), the coordinator of the booking's section, the administrator. */
export const CANCEL_KINDS: readonly GrantKind[] = ['self', 'coordinator', 'club_admin']

export type InternalBookingSnapshot = {
  id: string
  tenantId: string
  organizationId: string
  placeId: string
  sectionId: string
  startsAt: string
  endsAt: string
  bookedByPersonId: string
  actingRole: string
  status: InternalBookingStatus
  needsReschedule: boolean
  cancelledByPersonId: string | null
}

/** A conflicting entry as staff see it: ids, times and the label (activity, renter, purpose, closure reason). */
export type BookingConflictView = {
  kind: CalendarEntry['kind']
  id: string
  placeId: string
  start: string
  end: string
  label: string | null
}

export type InternalBookingCommandResult = FacilitiesCommandResult<InternalBooking, InternalBookingSnapshot> & {
  /** The external requests the booking superseded. */
  supersededRequestIds?: string[]
}

/** The snapshot of the audit log: ids, times and status — never the encrypted purpose or cancellation reason. */
export function internalBookingSnapshot(row: InternalBooking): InternalBookingSnapshot {
  return {
    id: row.id,
    tenantId: row.tenantId,
    organizationId: row.organizationId,
    placeId: row.placeId,
    sectionId: row.sectionId,
    startsAt: row.startsAt.toISOString(),
    endsAt: row.endsAt.toISOString(),
    bookedByPersonId: row.bookedByPersonId,
    actingRole: row.actingRole,
    status: row.status,
    needsReschedule: row.needsReschedule,
    cancelledByPersonId: row.cancelledByPersonId ?? null,
  }
}

function conflictView(entry: CalendarEntry): BookingConflictView {
  return {
    kind: entry.kind,
    id: entry.id,
    placeId: entry.placeId,
    start: entry.start.toISOString(),
    end: entry.end.toISOString(),
    label: entry.bookedByName && entry.label ? `${entry.label} · ${entry.bookedByName}` : entry.label,
  }
}

/** The caller's person (the `self` grant); a user without a linked person cannot book (403 `scope_unlinked`). */
async function bookerPersonId(scope: Scope): Promise<string> {
  const personId = scope.find((grant) => grant.kind === 'self')?.ids?.[0]
  if (!personId) return foundationErrors.throw('scope_unlinked')
  return personId
}

const createInternalBookingCommand: CommandHandler<Record<string, unknown>, InternalBookingCommandResult> = {
  id: 'facilities.internal_bookings.create',
  isUndoable: false,
  async execute(rawInput, ctx) {
    const id = randomUUID()
    const now = new Date()
    let superseded: Array<{ id: string; placeId: string }> = []
    const result = await inWriteTransaction(ctx, 'facilities.internal_bookings.create', async (em) => {
      await lockForOccupancy(ctx, em)
      const authorized = await authorizeScoped(
        {
          input: internalBookingCreateSchema,
          resourceKind: INTERNAL_BOOKING_RESOURCE_KIND,
          allowedKinds: BOOKING_KINDS,
          matchOptions: BOOKING_MATCH,
          resolveTarget: (parsed, _entity, scope) => ({ id, ...scope, sectionId: parsed.sectionId }),
        },
        rawInput,
        ctx,
        em,
      )
      const { parsed, tenantId, organizationId } = authorized
      const scope = { tenantId, organizationId }
      const personId = await bookerPersonId(authorized.scope)
      await assertPlaces(ctx, em, scope, [parsed.placeId])
      const section = (await findSections(ctx.container, scope, [parsed.sectionId], em)).get(parsed.sectionId)
      if (!section?.isActive) await throwFieldError('booking_section_invalid', 'sectionId')
      const startsAt = new Date(parsed.startsAt)
      const endsAt = new Date(parsed.endsAt)
      if (bookingPeriodProblem(startsAt, endsAt)) await throwFieldError('booking_period_invalid', 'endsAt')
      if (!bookingStartAllowed(startsAt, now)) await throwFieldError('booking_start_past', 'startsAt')

      const window = { start: startsAt, end: endsAt }
      const placeIds = await placeFamilyIds(ctx.container, scope, parsed.placeId, em)
      const entries = await calendarEntries(ctx.container, em, scope, placeIds, window, now)
      const closures = entries.filter((entry) => entry.kind === 'closure')
      const timeZone = await clubTimeZone(ctx.container, scope)
      const hours = (await openingHours(ctx.container, scope, [parsed.placeId], em)).get(parsed.placeId) ?? null
      // No opening hours on the place chain means no limit, overnight and multi-day bookings included (DD-41).
      const outsideHours = hours !== null && !slotWithinOpeningHours(hours, localSlotOf(startsAt, endsAt, timeZone))
      if (closures.length > 0 || outsideHours) {
        await throwFieldError('place_closed', 'startsAt', { conflicts: closures.map(conflictView) })
      }
      const occupying = entries.filter((entry) => entry.kind !== 'closure' && entry.kind !== 'request')
      if (occupying.length > 0) {
        await throwFieldError('rental_conflict', 'startsAt', { conflicts: occupying.map(conflictView) })
      }

      const row = em.create(InternalBooking, {
        id,
        ...scope,
        placeId: parsed.placeId,
        startsAt,
        endsAt,
        sectionId: parsed.sectionId,
        purpose: parsed.purpose,
        bookedByPersonId: personId,
        actingRole: authorized.actingRole,
        status: 'confirmed',
      })
      em.persist(row)
      await em.flush()

      // A club booking supersedes the external requests holding the slot (glossary *External request*), in this unit
      // of work; only the requests whose hold is still valid, and each only while it is still `pending_approval`.
      const holds = supersededRequests(
        entries
          .filter((entry) => entry.kind === 'request')
          .map((entry) => ({ ...entry, status: 'pending_approval' as const })),
        window,
        now,
      )
      const won =
        holds.length > 0
          ? await advanceWhere(em, Rental, {
              transitions: rentalTransitions,
              where: {
                ...scope,
                deletedAt: null,
                id: { $in: holds.map((hold) => hold.id) },
                holdExpiresAt: { $gt: now },
              },
              from: 'pending_approval',
              to: 'superseded',
              set: { updatedAt: now, decidedAt: now, decidedByPersonId: personId },
            })
          : []
      superseded = holds.filter((hold) => won.includes(hold.id)).map((hold) => ({ id: hold.id, placeId: hold.placeId }))
      return { entity: row, actingRole: authorized.actingRole, before: null }
    })
    const scope = { tenantId: result.entity.tenantId, organizationId: result.entity.organizationId }
    await emitAfterCommit('facilities.internal_booking.created', scope, {
      id: result.entity.id,
      placeId: result.entity.placeId,
    })
    for (const request of superseded) await emitAfterCommit('facilities.rental.superseded', scope, request)
    return { ...result, supersededRequestIds: superseded.map((request) => request.id) }
  },
  buildLog: ({ result }) =>
    facilitiesLog({
      result,
      resourceKind: INTERNAL_BOOKING_RESOURCE_KIND,
      labelKey: 'facilities.audit.internalBookings.create',
      fallback: 'Book a place',
      after: internalBookingSnapshot(result.entity),
      context: { supersededRequestIds: result.supersededRequestIds ?? [] },
    }),
}

const cancelInternalBookingCommand: CommandHandler<Record<string, unknown>, InternalBookingCommandResult> = {
  id: 'facilities.internal_bookings.cancel',
  isUndoable: false,
  async execute(rawInput, ctx) {
    const now = new Date()
    const result = await inWriteTransaction(ctx, 'facilities.internal_bookings.cancel', async (em) => {
      const load = rowLoader(ctx, InternalBooking)
      const authorized = await authorizeScoped(
        {
          input: internalBookingCancelSchema,
          resourceKind: INTERNAL_BOOKING_RESOURCE_KIND,
          allowedKinds: CANCEL_KINDS,
          loadTarget: (parsed, txEm, lock) => load(txEm, parsed.id, lock),
          resolveTarget: (_parsed, entity) => {
            const row = entity as InternalBooking
            return {
              id: row.id,
              tenantId: row.tenantId,
              organizationId: row.organizationId,
              sectionId: row.sectionId,
              personId: row.bookedByPersonId,
            }
          },
        },
        rawInput,
        ctx,
        em,
      )
      const row = authorized.entity as InternalBooking
      const before = internalBookingSnapshot(row)
      await assertTransition(internalBookingTransitions, row.status, 'cancelled')
      row.status = 'cancelled'
      row.cancelledByPersonId = authorized.scope.find((grant) => grant.kind === 'self')?.ids?.[0] ?? null
      row.cancelReason = authorized.parsed.reason ?? null
      row.needsReschedule = false
      row.updatedAt = now
      return { entity: row, actingRole: authorized.actingRole, before }
    })
    await emitAfterCommit(
      'facilities.internal_booking.cancelled',
      { tenantId: result.entity.tenantId, organizationId: result.entity.organizationId },
      { id: result.entity.id, placeId: result.entity.placeId },
    )
    return result
  },
  buildLog: ({ result }) =>
    facilitiesLog({
      result,
      resourceKind: INTERNAL_BOOKING_RESOURCE_KIND,
      labelKey: 'facilities.audit.internalBookings.cancel',
      fallback: 'Cancel a booking',
      after: internalBookingSnapshot(result.entity),
    }),
}

const supersedeSchema = z
  .object({ occurrenceIds: z.array(z.uuid()).max(5000), now: z.iso.datetime({ offset: true }).optional() })
  .strict()

export type SupersedeJobResult = { supersededIds: string[] }

/**
 * `facilities.rentals.supersede_by_sessions` (glossary *External request*; J-006 step 4; #123): a club session that
 * takes a requested slot — a coach's group event ("Book" → "For a group", DD-26) or a generated series — supersedes the
 * `pending_approval` requests holding that slot, as an internal booking does. Dispatched by the subscriber of
 * `activities.occurrence.generated` with a job context; each move is one conditional update, so a repeated event
 * supersedes nothing twice. It only frees request holds, so it takes no occupancy lock (DD-43).
 */
const supersedeBySessionsCommand: CommandHandler<Record<string, unknown>, SupersedeJobResult> = {
  id: 'facilities.rentals.supersede_by_sessions',
  isUndoable: false,
  async execute(rawInput, ctx) {
    let superseded: Array<{ id: string; placeId: string }> = []
    const scope = await inWriteTransaction(ctx, 'facilities.rentals.supersede_by_sessions', async (em) => {
      const authorized = await authorizeScoped(
        {
          input: supersedeSchema,
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
      const now = authorized.parsed.now ? new Date(authorized.parsed.now) : new Date()
      const trusted = { tenantId: authorized.tenantId, organizationId: authorized.organizationId }
      // Most clubs hold no request most of the time: one cheap probe before reading the sessions.
      const anyHeld = await em.count(Rental, {
        ...trusted,
        deletedAt: null,
        status: 'pending_approval',
        holdExpiresAt: { $gt: now },
      })
      if (anyHeld === 0) return trusted
      const sessions = await sessionsByIds(ctx.container, trusted, authorized.parsed.occurrenceIds, em)
      const families = new Map<string, string[]>()
      const holds = new Map<string, string>()
      for (const session of sessions) {
        let placeIds = families.get(session.placeId)
        if (!placeIds) {
          placeIds = await placeFamilyIds(ctx.container, trusted, session.placeId, em)
          families.set(session.placeId, placeIds)
        }
        const requests = await em.find(
          Rental,
          {
            ...trusted,
            deletedAt: null,
            status: 'pending_approval',
            placeId: { $in: placeIds },
            startsAt: { $lt: session.endAt },
            endsAt: { $gt: session.startAt },
          },
          { fields: ['id', 'placeId', 'status', 'startsAt', 'endsAt', 'holdExpiresAt'] },
        )
        const candidates = requests.map((row) => ({
          id: row.id,
          placeId: row.placeId,
          status: row.status,
          start: row.startsAt,
          end: row.endsAt,
          holdExpiresAt: row.holdExpiresAt ?? null,
        }))
        const window = { start: session.startAt, end: session.endAt }
        for (const hold of supersededRequests(candidates, window, now)) holds.set(hold.id, hold.placeId)
      }
      const won =
        holds.size > 0
          ? await advanceWhere(em, Rental, {
              transitions: rentalTransitions,
              where: { ...trusted, deletedAt: null, id: { $in: [...holds.keys()] }, holdExpiresAt: { $gt: now } },
              from: 'pending_approval',
              to: 'superseded',
              set: { updatedAt: now, decidedAt: now },
            })
          : []
      superseded = won.map((id) => ({ id, placeId: holds.get(id) as string }))
      return trusted
    })
    for (const request of superseded) await emitAfterCommit('facilities.rental.superseded', scope, request)
    return { supersededIds: superseded.map((request) => request.id) }
  },
}

registerCommand(createInternalBookingCommand)
registerCommand(cancelInternalBookingCommand)
registerCommand(supersedeBySessionsCommand)
