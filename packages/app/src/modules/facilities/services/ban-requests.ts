// The entry ban request notice (facilities parity spec DD-R12, the `facilities.incident.created|updated` row of *Events*,
// J-R08; #282): an incident whose actions include `entry_ban_requested` tells the club's administrators — in the app
// and by e-mail — that an attendant asks for an entry ban at the place, through the foundation `dispatch`. The key
// `facilities:ban-request:<incidentId>` is the "sent" marker, so the request is announced once per incident, however
// often the incident is saved or the event redelivered. The message names the place only: no renter contact and no
// incident description (*Security*), and the incident's encrypted columns are never read. The panel's "Ban request"
// filter and the "ban issued" mark read which requests a ban was issued from (B-27, DD-R12; #281): a ban saved with the
// incident's id closes the request, revoked later or not.
import type { EntityManager } from '@mikro-orm/postgresql'
import type { AwilixContainer } from 'awilix'
import { calendarDateInZone } from '@vereino/core'
import { resolveMembers, type DispatchService } from '@/modules/foundation'
import { EntryBan, Incident } from '../data/entities'
import { BAN_REQUEST_TEMPLATE } from '../emails/templates'
import { clubAdminPersonIds, clubTimeZone, findPlaces, type FacilitiesScope } from './directory'

const FOUNDATION_DISPATCH = 'foundationDispatch'

/** The idempotency key of one incident's ban request notice. */
export function banRequestKey(incidentId: string): string {
  return `facilities:ban-request:${incidentId}`
}

/**
 * Sends the notice of `incidentId` when it carries `entry_ban_requested`; the number of recipients reached by a new
 * dispatch, 0 when there is nothing to send (no request, no administrator, or sent before).
 */
export async function notifyBanRequest(
  container: AwilixContainer,
  scope: FacilitiesScope,
  incidentId: string,
  now: Date = new Date(),
): Promise<number> {
  const em = container.resolve<EntityManager>('em').fork()
  const incident = await em.findOne(
    Incident,
    { id: incidentId, ...scope, deletedAt: null },
    { fields: ['id', 'placeId', 'actionTaken'] },
  )
  if (!incident?.actionTaken.includes('entry_ban_requested')) return 0
  const today = calendarDateInZone(now, await clubTimeZone(container, scope))
  const admins = await clubAdminPersonIds(container, scope, today, em)
  if (admins.length === 0) return 0
  const context = { container, ...scope, scope: [{ kind: 'system_job' as const }] }
  const audience = await resolveMembers(
    admins.map((personId) => ({ personId, reason: 'direct' as const })),
    context,
  )
  const recipients = audience.recipients.filter((recipient) => recipient.channels.length > 0)
  if (recipients.length === 0) return 0
  const place = (await findPlaces(container, scope, [incident.placeId], em)).get(incident.placeId)
  const dispatch = container.resolve<DispatchService>(FOUNDATION_DISPATCH)
  const enqueued = await em.transactional((tx) =>
    dispatch.enqueue(
      tx,
      {
        template: BAN_REQUEST_TEMPLATE,
        params: { incidentId: incident.id, placeName: place?.name ?? '' },
        recipients,
        source: { module: 'facilities', type: 'facilities:incident', id: incident.id },
        idempotencyKey: banRequestKey(incident.id),
        actor: { userId: null, actingRole: 'system' },
      },
      { ...context, em: tx },
    ),
  )
  if (!enqueued.created) return 0
  await dispatch.publish(enqueued.dispatchId, scope)
  return recipients.length
}

/** The incidents among `incidentIds` an entry ban was issued from (DD-R12: the incident shows "ban issued"). */
export async function incidentsWithBan(
  container: AwilixContainer,
  scope: FacilitiesScope,
  incidentIds: readonly string[],
): Promise<Set<string>> {
  if (incidentIds.length === 0) return new Set()
  const em = container.resolve<EntityManager>('em').fork()
  const bans = await em.find(
    EntryBan,
    { ...scope, deletedAt: null, incidentId: { $in: [...incidentIds] } },
    { fields: ['id', 'incidentId'] },
  )
  return new Set(bans.flatMap((ban) => (ban.incidentId ? [ban.incidentId] : [])))
}

/** The incidents whose ban request is still open: `entry_ban_requested` among the actions, and no ban issued yet. */
export async function openBanRequestIds(container: AwilixContainer, scope: FacilitiesScope): Promise<string[]> {
  const em = container.resolve<EntityManager>('em').fork()
  const requested = await em.find(
    Incident,
    { ...scope, deletedAt: null, actionTaken: { $contains: ['entry_ban_requested'] } },
    { fields: ['id'] },
  )
  const issued = await incidentsWithBan(
    container,
    scope,
    requested.map((incident) => incident.id),
  )
  return requested.map((incident) => incident.id).filter((id) => !issued.has(id))
}
