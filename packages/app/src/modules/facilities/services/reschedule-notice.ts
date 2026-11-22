// The reschedule notices (facilities parity spec REQ-R18, DD-R14, the `facilities.closure.created|updated` and
// `facilities.maintenance.scheduled` row of *Events*, J-R05; #287): after `flagUnderWindow` flagged entries, the people
// who must move them are told through the foundation `dispatch` — one message per person and cause, listing only the
// entries flagged now (`lib/reschedule-notice.ts`), in-app for a person with an account and by e-mail when they have
// an address, nothing (logged) when neither — and the renter of a flagged rental gets an e-mail at the rental's address.
// The key `facilities:reschedule:<causeId>:<updatedAt ms>:<personId>` (renter: `…:<rentalId>`) is the "sent" marker,
// so a redelivery sends nothing twice and a moved window (a new `updatedAt`) is a new cause. The messages name places,
// times and the kind of cause; never a renter or their contact. The reads do not grow with the flagged entries (#394):
// one read per kind of entry, one for the coordinators of every (section, day) and one for the places.
import type { EntityManager } from '@mikro-orm/postgresql'
import type { AwilixContainer } from 'awilix'
import { createLogger } from '@open-mercato/shared/lib/logger'
import { findWithDecryption } from '@open-mercato/shared/lib/encryption/find'
import { calendarDateInZone, type CalendarDate } from '@vereino/core'
import { resolveMembers, type DispatchService } from '@/modules/foundation'
import { InternalBooking, Rental } from '../data/entities'
import {
  RESCHEDULE_RENTALS_TEMPLATE,
  RESCHEDULE_RENTER_TEMPLATE,
  RESCHEDULE_TEMPLATE,
  type RescheduleParams,
} from '../emails/templates'
import {
  limitNoticeEntries,
  planRescheduleNotices,
  rescheduleNoticeKey,
  sectionDays,
  type FlaggedBooking,
  type FlaggedRental,
  type FlaggedSession,
  type RescheduleCause,
  type RescheduleNotice,
} from '../lib/reschedule-notice'
import {
  clubAdminPersonIds,
  clubRequestSettings,
  findPlaces,
  sectionCoordinatorIdsOnDays,
  sessionsByIds,
  type FacilitiesScope,
} from './directory'
import { requestLocale } from './requests'

const FOUNDATION_DISPATCH = 'foundationDispatch'
const logger = createLogger('facilities').child({ component: 'reschedule-notices' })

/** The ids `flagUnderWindow` flagged now, by kind. */
export type FlaggedIds = { sessions: readonly string[]; rentals: readonly string[]; bookings: readonly string[] }

export type RescheduleNoticeCounts = { people: number; renters: number }

type Context = {
  container: AwilixContainer
  scope: FacilitiesScope
  em: EntityManager
  cause: RescheduleCause
  timeZone: string
  dayOf: (instant: Date) => CalendarDate
}

/** Sends the notices of the entries `flagged` by `cause`; the number of people and renters reached by a new dispatch. */
export async function notifyRescheduleNeeded(
  container: AwilixContainer,
  scope: FacilitiesScope,
  cause: RescheduleCause,
  flagged: FlaggedIds,
  now: Date = new Date(),
): Promise<RescheduleNoticeCounts> {
  if (flagged.sessions.length + flagged.rentals.length + flagged.bookings.length === 0) return { people: 0, renters: 0 }
  const em = container.resolve<EntityManager>('em').fork()
  const settings = await clubRequestSettings(container, scope)
  const timeZone = settings.timeZone
  const dayOf = (instant: Date) => calendarDateInZone(instant, timeZone)
  const ctx: Context = { container, scope, em, cause, timeZone, dayOf }

  const sessions = await flaggedSessions(ctx, flagged.sessions)
  const bookings = await flaggedBookings(ctx, flagged.bookings)
  // One decrypting read serves the entries and the renters' e-mails (their address and language are encrypted).
  const rentals =
    flagged.rentals.length > 0
      ? await findWithDecryption(
          em,
          Rental,
          { ...scope, deletedAt: null, id: { $in: [...flagged.rentals] } },
          {},
          scope,
        )
      : []
  const rentalEntries: FlaggedRental[] = rentals.map((row) => ({
    kind: 'rental',
    id: row.id,
    placeId: row.placeId,
    startsAt: row.startsAt,
    endsAt: row.endsAt,
    label: null,
  }))
  const pairs = sectionDays(sessions, dayOf)
  const coordinators =
    pairs.length > 0 ? await sectionCoordinatorIdsOnDays(container, scope, pairs, em) : new Map<string, string[]>()
  const admins = rentalEntries.length > 0 ? await clubAdminPersonIds(container, scope, dayOf(now), em) : []
  const notices = planRescheduleNotices({
    sessions,
    bookings,
    rentals: rentalEntries,
    admins,
    coordinatorsOf: (sectionId, date) => coordinators.get(`${sectionId}:${date}`) ?? [],
    dayOf,
  })
  const placeIds = [...new Set([...sessions, ...bookings, ...rentalEntries].map((entry) => entry.placeId))]
  const places = await findPlaces(container, scope, placeIds, em)
  const placeName = (placeId: string) => places.get(placeId)?.name ?? '—'

  // Each recipient on its own: one failed dispatch is logged and never stops the notices after it.
  let people = 0
  for (const notice of notices) {
    if (await isolated(ctx, { personId: notice.personId }, () => sendNotice(ctx, notice, placeName))) people += 1
  }
  let renters = 0
  for (const rental of rentals) {
    const send = () => sendRenterMail(ctx, rental, placeName, settings.locale)
    if (await isolated(ctx, { rentalId: rental.id }, send)) renters += 1
  }
  return { people, renters }
}

async function isolated(
  ctx: Context,
  recipient: Record<string, string>,
  send: () => Promise<boolean>,
): Promise<boolean> {
  try {
    return await send()
  } catch (error: unknown) {
    logger.warn('Reschedule notice failed for one recipient', {
      ...recipient,
      causeId: ctx.cause.id,
      error: error instanceof Error ? error.message : String(error),
    })
    return false
  }
}

async function flaggedSessions(ctx: Context, ids: readonly string[]): Promise<FlaggedSession[]> {
  if (ids.length === 0) return []
  const rows = await sessionsByIds(ctx.container, ctx.scope, ids, ctx.em)
  return rows.map((row) => ({
    kind: 'session',
    id: row.id,
    placeId: row.placeId,
    startsAt: row.startAt,
    endsAt: row.endAt,
    label: row.groupName ?? row.activityName,
    sectionId: row.sectionId,
    coachPersonId: row.coachPersonId,
  }))
}

async function flaggedBookings(ctx: Context, ids: readonly string[]): Promise<FlaggedBooking[]> {
  if (ids.length === 0) return []
  const rows = await ctx.em.find(
    InternalBooking,
    { ...ctx.scope, deletedAt: null, id: { $in: [...ids] } },
    { fields: ['id', 'placeId', 'startsAt', 'endsAt', 'bookedByPersonId'] },
  )
  return rows.map((row) => ({
    kind: 'booking',
    id: row.id,
    placeId: row.placeId,
    startsAt: row.startsAt,
    endsAt: row.endsAt,
    label: null,
    bookedByPersonId: row.bookedByPersonId,
  }))
}

async function enqueue(
  ctx: Context,
  request: Parameters<DispatchService['enqueue']>[1],
  dispatch: DispatchService,
): Promise<boolean> {
  const context = { container: ctx.container, ...ctx.scope, scope: [{ kind: 'system_job' as const }] }
  const enqueued = await ctx.em.transactional((tx) => dispatch.enqueue(tx, request, { ...context, em: tx }))
  if (!enqueued.created) return false
  await dispatch.publish(enqueued.dispatchId, ctx.scope)
  return true
}

/** One person's message: in-app and e-mail by their channels; nothing (logged) when they have neither. */
async function sendNotice(
  ctx: Context,
  notice: RescheduleNotice,
  placeName: (placeId: string) => string,
): Promise<boolean> {
  const context = { container: ctx.container, ...ctx.scope, scope: [{ kind: 'system_job' as const }] }
  const audience = await resolveMembers([{ personId: notice.personId, reason: 'direct' }], context)
  const recipients = audience.recipients.filter((recipient) => recipient.channels.length > 0)
  if (recipients.length === 0) {
    logger.info('Reschedule notice not sent: the person has no account and no address', {
      personId: notice.personId,
      causeId: ctx.cause.id,
    })
    return false
  }
  const first = notice.entries[0]
  const { shown, more } = limitNoticeEntries(notice.entries)
  const params: RescheduleParams = {
    causeKind: ctx.cause.kind,
    timeZone: ctx.timeZone,
    ...(more > 0 ? { more } : {}),
    entries: shown.map((entry) => ({
      kind: entry.kind,
      placeName: placeName(entry.placeId),
      startsAt: entry.startsAt.toISOString(),
      endsAt: entry.endsAt.toISOString(),
      label: entry.label,
    })),
    linkPlaceId: first.placeId,
    linkDate: ctx.dayOf(first.startsAt),
    ...(notice.coordinatedSectionIds.length > 0 ? { linkSectionIds: notice.coordinatedSectionIds.slice(0, 2) } : {}),
  }
  return enqueue(
    ctx,
    {
      template: notice.audience === 'admin' ? RESCHEDULE_RENTALS_TEMPLATE : RESCHEDULE_TEMPLATE,
      params,
      recipients,
      source: { module: 'facilities', type: `facilities:${ctx.cause.kind}`, id: ctx.cause.id },
      idempotencyKey: rescheduleNoticeKey(ctx.cause, notice.personId),
      actor: { userId: null, actingRole: 'system' },
    },
    ctx.container.resolve<DispatchService>(FOUNDATION_DISPATCH),
  )
}

/** The renter's e-mail at the rental's address, in its language; nothing (logged) without an address. */
async function sendRenterMail(
  ctx: Context,
  row: Rental,
  placeName: (placeId: string) => string,
  clubLocale: string,
): Promise<boolean> {
  if (!row.contactEmail) {
    logger.info('Reschedule e-mail to the renter not sent: the rental has no address', {
      rentalId: row.id,
      causeId: ctx.cause.id,
    })
    return false
  }
  return enqueue(
    ctx,
    {
      template: RESCHEDULE_RENTER_TEMPLATE,
      params: {
        rentalId: row.id,
        placeName: placeName(row.placeId),
        startsAt: row.startsAt.toISOString(),
        endsAt: row.endsAt.toISOString(),
        timeZone: ctx.timeZone,
        causeKind: ctx.cause.kind,
      },
      addresses: [{ email: row.contactEmail, locale: requestLocale(row.contactLocale, clubLocale) }],
      source: { module: 'facilities', type: 'facilities:rental', id: row.id },
      idempotencyKey: rescheduleNoticeKey(ctx.cause, row.id),
      actor: { userId: null, actingRole: 'system' },
    },
    ctx.container.resolve<DispatchService>(FOUNDATION_DISPATCH),
  )
}
