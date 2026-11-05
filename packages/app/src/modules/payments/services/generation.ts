// The inputs of a period generation (payments spec *Domain Vocabulary* → Charge, Payer, Sibling discount; issue #108):
// the fees and discount rules valid in the period, each fee's participants (its group's roster, or its activity's
// group roster, on the reference day), the sessions of per-session fees, the persons' birth dates, the primary payers
// and the live charges that already exist. Read in the generation's transaction; the plan itself is pure
// (`lib/charge-plan.ts`).
import type { EntityManager } from '@mikro-orm/postgresql'
import type { AwilixContainer } from 'awilix'
import { addCalendarDays, zonedInstant, type CalendarDate } from '@vereino/core'
import { Charge, DiscountRule, Fee } from '../data/entities'
import type { PlanInput, PlanRule } from '../lib/charge-plan'
import { ONE_OFF_PERIOD_LABEL, activeInPeriod, countSessions, periodWindow, referenceDate } from '../lib/payments-rules'
import { findActivities, findPersons, listOccurrences, primaryPayers, rosterOn, type PaymentsScope } from './directory'

export async function loadGenerationInputs(
  container: AwilixContainer,
  em: EntityManager,
  scope: PaymentsScope,
  period: string,
  clock: { today: CalendarDate; timeZone: string },
): Promise<PlanInput> {
  const refDate = referenceDate(period, clock.today)
  const allFees = await em.find(Fee, { ...scope, deletedAt: null }, { orderBy: { name: 'asc', id: 'asc' } })
  const fees = allFees.filter((fee) =>
    activeInPeriod({ validFrom: fee.validFrom, validTo: fee.validTo ?? null }, period),
  )

  // The group each fee bills: its own, or its activity's.
  const activityIds = fees.flatMap((fee) => (fee.activityId ? [fee.activityId] : []))
  const activities = await findActivities(container, scope, activityIds, em)
  const groupOf = new Map<string, string>()
  for (const fee of fees) {
    const groupId = fee.groupId ?? (fee.activityId ? activities.get(fee.activityId)?.groupId : undefined)
    if (groupId) groupOf.set(fee.id, groupId)
  }

  const rosters = new Map<string, string[]>()
  for (const groupId of new Set(groupOf.values())) {
    const roster = await rosterOn(container, scope, groupId, refDate, em)
    rosters.set(
      groupId,
      roster.filter((entry) => entry.role === 'participant').map((entry) => entry.personId),
    )
  }
  const participants = new Map<string, string[]>()
  for (const [feeId, groupId] of groupOf) participants.set(feeId, rosters.get(groupId) ?? [])

  // Per-session fees: the sessions of the period in the club zone.
  const perSession = fees.filter((fee) => fee.period === 'per_occurrence' && groupOf.has(fee.id))
  const window = periodWindow(period)
  const sessions = await listOccurrences(
    container,
    scope,
    [...new Set(perSession.map((fee) => groupOf.get(fee.id) as string))],
    {
      from: zonedInstant(window.from, '00:00', clock.timeZone),
      to: zonedInstant(addCalendarDays(window.to, 1), '00:00', clock.timeZone),
    },
    em,
  )

  const personIds = [...new Set([...participants.values()].flat())]
  const [persons, payers] = await Promise.all([
    findPersons(container, scope, personIds, em),
    primaryPayers(container, scope, personIds, refDate, em),
  ])
  const birthDates = new Map(personIds.map((id) => [id, persons.get(id)?.birthDate ?? null]))

  const allRules = await em.find(DiscountRule, { ...scope, deletedAt: null }, { orderBy: { name: 'asc', id: 'asc' } })
  const rules: PlanRule[] = allRules
    .filter((rule) => activeInPeriod({ validFrom: rule.validFrom, validTo: rule.validTo ?? null }, period))
    .map((rule) => ({
      id: rule.id,
      name: rule.name,
      kind: rule.kind,
      percent: rule.percent ?? null,
      amount: rule.amount ?? null,
      conditions: rule.conditions,
    }))

  const existing =
    fees.length === 0
      ? []
      : await em.find(
          Charge,
          {
            ...scope,
            sourceType: 'fee',
            sourceId: { $in: fees.map((fee) => fee.id) },
            periodLabel: { $in: [period, ONE_OFF_PERIOD_LABEL] },
            status: { $ne: 'cancelled' },
            deletedAt: null,
          },
          { fields: ['id', 'sourceId', 'personId', 'payerPersonId'] },
        )

  return {
    period,
    referenceDate: refDate,
    fees: fees.map((fee) => ({
      id: fee.id,
      name: fee.name,
      amount: fee.amount,
      period: fee.period,
      dueDay: fee.dueDay,
      ...(fee.period === 'per_occurrence' ? { sessionCount: countSessions(sessions, fee) } : {}),
    })),
    participants,
    birthDates,
    primaryPayers: payers,
    rules,
    existing: existing.map((charge) => ({
      feeId: charge.sourceId as string,
      personId: charge.personId as string,
      payerPersonId: charge.payerPersonId ?? null,
    })),
  }
}
