// Freed places and closed groups (sign-up form spec DD-J15, DD-J15a, REQ-J15; phase 3, #800): the deciders of a
// section (its coordinators, else the club administrators, BR-J5, Q-J03) are told in the app
// - when a place is free on the club's day in a group with a waiting list (`enrolment.place_freed`), once per group
//   and day (the notification's group key carries the day; the platform refreshes an existing one instead of adding
//   a second), from the membership subscribers and the daily job;
// - when a season rollover closed the group of open applications (`enrolment.group_closed`).
// Stored bodies name the group only, never an applicant (nothing outlives the 30-day anonymisation). A failed notice
// is logged; it never undoes the write that caused it.
import type { EntityManager } from '@mikro-orm/postgresql'
import type { AwilixContainer } from 'awilix'
import { buildBatchNotificationFromType } from '@open-mercato/core/modules/notifications/lib/notificationBuilder'
import { resolveNotificationService } from '@open-mercato/core/modules/notifications/lib/notificationService'
import type { CalendarDate } from '@vereino/core'
import { Application } from '../data/entities'
import { freedPlaceGroups, freedPlaceKey } from '../lib/accept'
import notificationTypes from '../notifications'
import { applicationTargets, clubDay, deciderUserIds, enrolmentSettings, type EnrolmentScope } from './directory'

async function notify(
  container: AwilixContainer,
  scope: EnrolmentScope,
  input: { type: string; userIds: string[]; group: string; groupKey: string; groupId: string; linkHref: string },
): Promise<boolean> {
  const type = notificationTypes.find((entry) => entry.type === input.type)
  if (!type || input.userIds.length === 0) return false
  const notification = buildBatchNotificationFromType(type, {
    recipientUserIds: input.userIds,
    bodyVariables: { group: input.group },
    sourceEntityType: 'groups:group',
    sourceEntityId: input.groupId,
    linkHref: input.linkHref,
    groupKey: input.groupKey,
  })
  await resolveNotificationService(container).createBatch(notification, scope)
  return true
}

/**
 * DD-J15: re-counts the places on `today` of the groups with waiting applications (only `groupIds` when given) and
 * tells the deciders about every group with a free place. Returns the ids of the groups announced.
 */
export async function announceFreedPlaces(
  container: AwilixContainer,
  scope: EnrolmentScope,
  today: CalendarDate,
  groupIds?: readonly string[],
): Promise<string[]> {
  const em = container.resolve<EntityManager>('em').fork()
  const waiting = await em.find(
    Application,
    {
      ...scope,
      state: 'waiting',
      deletedAt: null,
      groupId: groupIds ? { $in: [...groupIds] } : { $ne: null },
    },
    { fields: ['id', 'groupId', 'sectionId'] },
  )
  const bySection = new Map<string, Set<string>>()
  for (const row of waiting) {
    if (!row.groupId) continue
    const set = bySection.get(row.sectionId) ?? new Set<string>()
    set.add(row.groupId)
    bySection.set(row.sectionId, set)
  }
  const announced: string[] = []
  for (const [sectionId, groups] of bySection) {
    const targets = await applicationTargets(container, scope, { sectionId, date: today, groupIds: [...groups], em })
    const free = freedPlaceGroups(targets, groups)
    if (free.length === 0) continue
    const userIds = await deciderUserIds(container, scope, sectionId, today, em)
    for (const groupId of free) {
      const target = targets.find((entry) => entry.groupId === groupId)
      const sent = await notify(container, scope, {
        type: 'enrolment.place_freed',
        userIds,
        group: target?.name ?? '—',
        groupId,
        groupKey: `enrolment:${freedPlaceKey(groupId, today)}`,
        linkHref: '/club/applications?tab=waiting',
      })
      if (sent) announced.push(groupId)
    }
  }
  return announced
}

/** DD-J15a: tells the deciders of a section that a rollover closed a group of open applications. */
export async function announceClosedGroup(
  container: AwilixContainer,
  scope: EnrolmentScope,
  input: { sectionId: string; groupId: string; groupName: string; today: CalendarDate },
): Promise<boolean> {
  const userIds = await deciderUserIds(container, scope, input.sectionId, input.today)
  return notify(container, scope, {
    type: 'enrolment.group_closed',
    userIds,
    group: input.groupName,
    groupId: input.groupId,
    groupKey: `enrolment:group_closed:${input.groupId}`,
    linkHref: '/club/applications',
  })
}

/**
 * The membership subscribers' handler (DD-J15): a participant membership of a group changed or was removed, so the
 * group's places are counted again on the club's today. An end date in the future frees nothing yet; the daily job
 * announces it on that day.
 */
export async function onMembershipChanged(
  container: AwilixContainer,
  scope: EnrolmentScope,
  groupId: string,
): Promise<void> {
  const settings = await enrolmentSettings(container, scope)
  await announceFreedPlaces(container, scope, clubDay(settings), [groupId])
}
