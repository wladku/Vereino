// The in-app notices of a minor's own declaration (club spec *Events, Jobs, Notifications* row
// `activities.attendance.declared`; foundation II DD-G12; #32): under `immediate` the guardians learn what the ward
// declared (`activities.ward_declared`); under `guardian_confirm` they are asked to decide
// (`activities.guardian_confirmation_needed`). Recipients are the ward's active guardians with an account, never the
// user who declared; the notification is grouped by the declaration id, so a retry refreshes it.
import type { EntityManager } from '@mikro-orm/postgresql'
import type { AwilixContainer } from 'awilix'
import { buildBatchNotificationFromType } from '@open-mercato/core/modules/notifications/lib/notificationBuilder'
import { resolveNotificationService } from '@open-mercato/core/modules/notifications/lib/notificationService'
import { Activity, Attendance, Occurrence } from '../data/entities'
import { wallTimeInZone } from '../lib/activities-rules'
import notificationTypes from '../notifications'
import type { GuardianNotice } from '../commands/attendance'
import { activeGuardians, clubTimeZone, findPersons, findUserIds, type ActivitiesScope } from './directory'

const TYPE_BY_NOTICE: Record<NonNullable<GuardianNotice>, string> = {
  ward_declared: 'activities.ward_declared',
  guardian_confirmation_needed: 'activities.guardian_confirmation_needed',
}

/** Sends the notice for a declaration; returns the notified users (none when nothing is due). */
export async function notifyGuardiansOfDeclaration(
  container: AwilixContainer,
  scope: ActivitiesScope,
  event: { attendanceId: string; notice: NonNullable<GuardianNotice>; actorUserId: string | null },
): Promise<string[]> {
  const em = container.resolve<EntityManager>('em').fork()
  const row = await em.findOne(Attendance, { id: event.attendanceId, ...scope, deletedAt: null })
  if (!row) return []
  const occurrence = await em.findOne(Occurrence, { id: row.occurrenceId, ...scope, deletedAt: null })
  if (!occurrence) return []
  const activity = await em.findOne(Activity, { id: occurrence.activityId, ...scope }, { fields: ['id', 'name'] })
  const guardians =
    (await activeGuardians(container, scope, [row.personId], occurrence.occurrenceDate)).get(row.personId) ?? []
  const userIds = await findUserIds(container, scope, guardians)
  const recipientUserIds = [...new Set([...userIds.values()])].filter((userId) => userId !== event.actorUserId).sort()
  const type = notificationTypes.find((entry) => entry.type === TYPE_BY_NOTICE[event.notice])
  if (!type || recipientUserIds.length === 0) return []
  const ward = (await findPersons(container, scope, [row.personId])).get(row.personId)
  const timeZone = await clubTimeZone(container, scope)
  const variables = {
    ward: ward ? `${ward.firstName} ${ward.lastName}` : '',
    activity: activity?.name ?? '',
    date: occurrence.occurrenceDate,
    time: wallTimeInZone(occurrence.startAt, timeZone).slice(0, 5),
    declared: row.declared,
  }
  await resolveNotificationService(container).createBatch(
    buildBatchNotificationFromType(type, {
      recipientUserIds,
      sourceEntityType: 'activities:attendance',
      sourceEntityId: row.id,
      linkHref: `/club/occurrences/${occurrence.id}`,
      groupKey: `${type.type}:${row.id}`,
      titleVariables: variables,
      bodyVariables: variables,
    }),
    scope,
  )
  return recipientUserIds
}
