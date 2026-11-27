// The managers' notice when a consent withdrawal holds pictures back (event photos spec REQ-I09, DD-I10; #872): after
// `people.consent.image_withdrawn`, the managers of every club event with published, confirmed pictures that mark the
// person and now fail BR-I01 for a missing consent — the club administrators and the coordinators of the event's
// section — get one in-app `activities.club_event.pictures_held_back` per event, naming the event and the count, never
// the person or why. Grouped by the event and the consent event, so a retried delivery refreshes the same notice. The
// pictures themselves are already hidden: the public read decides on every read (DD-I01); this only tells staff.
import type { EntityManager } from '@mikro-orm/postgresql'
import type { AwilixContainer } from 'awilix'
import { buildBatchNotificationFromType } from '@open-mercato/core/modules/notifications/lib/notificationBuilder'
import { resolveNotificationService } from '@open-mercato/core/modules/notifications/lib/notificationService'
import { ClubEvent, ClubEventFile } from '../data/entities'
import { CLUB_EVENT_PICTURE_KINDS, type ClubEventPictureKind } from '../lib/club-event-files'
import { heldBackCount } from '../lib/public-pictures'
import notificationTypes from '../notifications'
import { marksByFile, picturesMarking } from './club-event-pictures'
import {
  clubAdminIds,
  clubClock,
  findUserIds,
  imagePublishable,
  sectionCoordinatorIdsOn,
  type ActivitiesScope,
} from './directory'

export const PICTURES_HELD_BACK = 'activities.club_event.pictures_held_back'

/** Notifies the managers of each club event whose pictures the withdrawal holds back; returns the events notified. */
export async function notifyPicturesHeldBack(
  container: AwilixContainer,
  scope: ActivitiesScope,
  event: { subjectPersonId: string; consentEventId: string },
): Promise<string[]> {
  const type = notificationTypes.find((entry) => entry.type === PICTURES_HELD_BACK)
  if (!type) return []
  const em = container.resolve<EntityManager>('em').fork()
  const fileIds = await picturesMarking(em, scope, event.subjectPersonId)
  if (fileIds.length === 0) return []
  const pictures = await em.find(ClubEventFile, {
    ...scope,
    id: { $in: fileIds },
    kind: { $in: [...CLUB_EVENT_PICTURE_KINDS] },
    deletedAt: null,
    publishedAt: { $ne: null },
  })
  if (pictures.length === 0) return []
  const marks = await marksByFile(
    em,
    scope,
    pictures.map((picture) => picture.id),
  )
  const { today } = await clubClock(container, scope, undefined, em)
  const publishable = await imagePublishable(container, scope, [...new Set([...marks.values()].flat())], today, em)
  const byEvent = new Map<string, number>()
  for (const picture of pictures) {
    const facts = {
      kind: picture.kind as ClubEventPictureKind,
      publishedAt: picture.publishedAt ?? null,
      peopleConfirmedAt: picture.peopleConfirmedAt ?? null,
      personIds: marks.get(picture.id) ?? [],
    }
    const held = heldBackCount([facts], event.subjectPersonId, publishable)
    if (held > 0) byEvent.set(picture.clubEventId, (byEvent.get(picture.clubEventId) ?? 0) + held)
  }
  if (byEvent.size === 0) return []
  const events = await em.find(
    ClubEvent,
    { ...scope, id: { $in: [...byEvent.keys()] }, deletedAt: null },
    { fields: ['id', 'name', 'sectionId'] },
  )
  const admins = await clubAdminIds(container, scope, today, em)
  const notified: string[] = []
  for (const clubEvent of events) {
    const coordinators = clubEvent.sectionId
      ? await sectionCoordinatorIdsOn(container, scope, clubEvent.sectionId, today, em)
      : []
    const managers = [...new Set([...admins, ...coordinators])]
    const userIds = await findUserIds(container, scope, managers, em)
    const recipientUserIds = [...new Set(userIds.values())].sort()
    if (recipientUserIds.length === 0) continue
    const variables = { event: clubEvent.name, count: String(byEvent.get(clubEvent.id) ?? 0) }
    await resolveNotificationService(container).createBatch(
      buildBatchNotificationFromType(type, {
        recipientUserIds,
        sourceEntityType: 'activities:club_event',
        sourceEntityId: clubEvent.id,
        linkHref: `/backend/activities/club-events/${clubEvent.id}?tab=files`,
        groupKey: `${PICTURES_HELD_BACK}:${clubEvent.id}:${event.consentEventId}`,
        titleVariables: variables,
        bodyVariables: variables,
      }),
      scope,
    )
    notified.push(clubEvent.id)
  }
  return notified
}
