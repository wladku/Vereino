// The departure notices (people life-cycle spec *Events, Jobs, Notifications* rows `people.departure_request.created`
// and `people.person.departed`; phase L4, #306), in the app and by e-mail through the foundation `dispatch`: a member
// asked to leave (to the club administrators, key `people:departure-request:{batchId}`), the club declined a request
// (to the member who filed it) and the club confirmed a departure (to the persons who leave; a minor is reached
// through the guardians). Each key is the "sent" marker, so a redelivered event sends nothing twice.
import type { EntityManager } from '@mikro-orm/postgresql'
import type { AwilixContainer } from 'awilix'
import { resolveMembers, type DispatchService } from '@/modules/foundation'
import {
  DEPARTURE_CONFIRMED_TEMPLATE,
  DEPARTURE_REQUEST_DECLINED_TEMPLATE,
  DEPARTURE_REQUEST_RECEIVED_TEMPLATE,
} from '../emails/templates'
import { roleHolderIdsOn } from './person-directory'
import { clubToday, type ClubScope } from './club-clock'

const FOUNDATION_DISPATCH = 'foundationDispatch'

type Notice = {
  template: string
  params: Record<string, unknown>
  personIds: readonly string[]
  source: { module: string; type: string; id: string }
  idempotencyKey: string
}

/** Enqueues and publishes one notice to `personIds`; the number of reachable recipients of a new dispatch. */
async function send(container: AwilixContainer, scope: ClubScope, notice: Notice): Promise<number> {
  if (notice.personIds.length === 0) return 0
  const em = container.resolve<EntityManager>('em').fork()
  const context = { container, ...scope, scope: [{ kind: 'system_job' as const }] }
  const audience = await resolveMembers(
    [...new Set(notice.personIds)].map((personId) => ({ personId, reason: 'direct' as const })),
    context,
  )
  const recipients = audience.recipients.filter((recipient) => recipient.channels.length > 0)
  if (recipients.length === 0) return 0
  const dispatch = container.resolve<DispatchService>(FOUNDATION_DISPATCH)
  const enqueued = await em.transactional((tx) =>
    dispatch.enqueue(
      tx,
      {
        template: notice.template,
        params: notice.params,
        recipients,
        source: notice.source,
        idempotencyKey: notice.idempotencyKey,
        actor: { userId: null, actingRole: 'system' },
      },
      { ...context, em: tx },
    ),
  )
  if (!enqueued.created) return 0
  await dispatch.publish(enqueued.dispatchId, scope)
  return recipients.length
}

/** A member filed a request: the club administrators are told. */
export async function notifyDepartureRequest(
  container: AwilixContainer,
  scope: ClubScope,
  request: { batchId: string; subjectPersonIds: readonly string[] },
): Promise<number> {
  const em = container.resolve<EntityManager>('em').fork()
  const admins = await roleHolderIdsOn(em, scope, 'club_admin', await clubToday(container, scope))
  const [first] = [...request.subjectPersonIds].sort()
  if (!first) return 0
  return send(container, scope, {
    template: DEPARTURE_REQUEST_RECEIVED_TEMPLATE,
    params: { batchId: request.batchId, subjectPersonId: first, subjectCount: request.subjectPersonIds.length },
    personIds: admins,
    source: { module: 'people', type: 'people:departure_request', id: request.batchId },
    idempotencyKey: `people:departure-request:${request.batchId}`,
  })
}

/** The club declined a request: the member who filed it is told (the reason stays in the app). */
export function notifyDepartureDeclined(
  container: AwilixContainer,
  scope: ClubScope,
  request: { id: string; batchId: string; requestedByPersonId: string | null },
): Promise<number> {
  return send(container, scope, {
    template: DEPARTURE_REQUEST_DECLINED_TEMPLATE,
    params: { batchId: request.batchId },
    personIds: request.requestedByPersonId ? [request.requestedByPersonId] : [],
    source: { module: 'people', type: 'people:departure_request', id: request.id },
    idempotencyKey: `people:departure-request-declined:${request.id}`,
  })
}

/** The club confirmed a departure: the persons who leave are told on the day of the decision. */
export function notifyDepartureConfirmed(
  container: AwilixContainer,
  scope: ClubScope,
  departure: { departureId: string; personIds: readonly string[]; lastDay: string },
): Promise<number> {
  return send(container, scope, {
    template: DEPARTURE_CONFIRMED_TEMPLATE,
    params: { departureId: departure.departureId, lastDay: departure.lastDay },
    personIds: departure.personIds,
    source: { module: 'people', type: 'people:person', id: departure.personIds[0] },
    idempotencyKey: `people:departure:${departure.departureId}`,
  })
}
