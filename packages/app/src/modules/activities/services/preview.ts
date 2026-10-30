// The preview behind `POST /api/activities/activities/preview` (club spec J-002 step 1; foundation II J-G01): the
// sessions a new series — or an edit of an activity — would have in the 16-week horizon with their place and coach
// conflicts, through the same scope, reference, rule and time checks as the save; a failing occupancy provider only
// warns (`providerFailed`).
import type { EntityManager } from '@mikro-orm/postgresql'
import type { CommandRuntimeContext } from '@open-mercato/shared/lib/commands'
import type { z } from 'zod'
import { assertInScope, scopeContract, type TrustedScope } from '@/modules/foundation'
import { activitiesErrors } from '../api/errors'
import { PLAN_KINDS, assertReferences, groupTarget, scheduleTarget } from '../commands/shared'
import type { activityPreviewSchema } from '../data/validators'
import { horizonEnd } from '../lib/activities-rules'
import { clubClock, findGroups } from './directory'
import { findActivity } from './read'
import { findConflicts, futureSessions, plannedSessions, sessionPlan, type ConflictEntry } from './schedule'
import { assertSeriesShape, storedRule } from './series'

export type SeriesPreview = {
  items: Array<{ date: string; startAt: string; endAt: string; existingId: string | null; conflicts: ConflictEntry[] }>
  total: number
  conflictCount: number
  generatedUntil: string | null
  horizonEnd: string
  providerFailed: boolean
}

/** null when `activityId` names no activity of the club (404). */
export async function previewSeries(
  ctx: CommandRuntimeContext,
  scope: TrustedScope,
  input: z.output<typeof activityPreviewSchema>,
): Promise<SeriesPreview | null> {
  const grants = await scopeContract.resolve(ctx)
  const em = ctx.container.resolve<EntityManager>('em').fork()
  const group = (await findGroups(ctx.container, scope, [input.groupId], em)).get(input.groupId) ?? null
  await assertInScope(grants, PLAN_KINDS, groupTarget(input.groupId, scope, group))
  const edited = input.activityId ? await findActivity(ctx.container, scope, input.activityId) : null
  if (input.activityId) {
    if (!edited) return null
    await assertInScope(grants, PLAN_KINDS, scheduleTarget(edited))
    if (edited.groupId !== input.groupId) {
      await activitiesErrors.throw('activities_reference_invalid', { field: 'groupId' })
    }
  }
  await assertReferences(ctx, em, scope, {
    group,
    type: input.type,
    placeId: input.placeId,
    coachPersonId: input.coachPersonId ?? null,
    externalTeamIds: [
      ...(input.invitedExternalTeamIds ?? []),
      ...(input.opponentExternalTeamId ? [input.opponentExternalTeamId] : []),
    ],
  })
  const clock = await clubClock(ctx.container, scope)
  const { rule } = await storedRule(input.recurrenceRule, input.exdates, input.startsOn)
  const endsOn = input.endsOn ?? null
  await assertSeriesShape(
    { startTime: input.startTime, endTime: input.endTime, startsOn: input.startsOn, endsOn, rule },
    clock,
  )
  const { sessions, generatedUntil } = plannedSessions(
    {
      rule,
      startsOn: input.startsOn,
      endsOn,
      startTime: input.startTime,
      endTime: input.endTime,
      isActive: input.isActive ?? true,
    },
    clock.today,
    clock.timeZone,
  )
  const stored = edited ? await futureSessions(em, scope, edited.id, clock.today) : []
  const plan = sessionPlan(stored, sessions, clock.today)
  const report = await findConflicts(
    ctx.container,
    em,
    scope,
    {
      candidates: plan.upsert.map(({ occurrence }) => ({
        key: occurrence.date,
        startAt: occurrence.startAt,
        endAt: occurrence.endAt,
      })),
      placeId: input.placeId,
      coachPersonId: input.coachPersonId ?? null,
      ignoreIds: [
        ...plan.upsert.flatMap((entry) => (entry.existing ? [entry.existing.id] : [])),
        ...plan.remove.map((entry) => entry.id),
      ],
    },
    'preview',
  )
  const items = plan.upsert.map(({ occurrence, existing }) => ({
    date: occurrence.date,
    startAt: occurrence.startAt.toISOString(),
    endAt: occurrence.endAt.toISOString(),
    existingId: existing?.id ?? null,
    conflicts: report.conflicts.filter((conflict) => conflict.key === occurrence.date),
  }))
  return {
    items,
    total: items.length,
    conflictCount: items.filter((item) => item.conflicts.length > 0).length,
    generatedUntil,
    horizonEnd: horizonEnd(clock.today),
    providerFailed: report.providerFailed,
  }
}
