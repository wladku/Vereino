// `facilities.zone_rules.bulk_upsert` — `POST /api/facilities/zone-rules/bulk` (facilities spec REQ-029, glossary
// *Booking availability*; #121): the club administrator opens weekly booking availability for one or more places in
// one go. Every window is checked per place and day (422 `availability_time_order`, `availability_too_short`,
// `availability_outside_opening_hours`, with `dayErrors`); "replace" (default) first removes the existing availability
// on the selected days within the period, "append" keeps it and answers 409 `zone_rule_overlap` on an equal-priority
// overlap. One transaction for all places: an error in one rolls back everything. The response warns about planned
// club sessions inside the new windows (they stay occupied) and about pending requests outside them (0 until online
// requests arrive, E08-S05). Not undoable: the audit log keeps the whole batch.
import { randomUUID } from 'node:crypto'
import type { EntityManager } from '@mikro-orm/postgresql'
import { registerCommand, type CommandHandler } from '@open-mercato/shared/lib/commands'
import { resolveTranslations } from '@open-mercato/shared/lib/i18n/server'
import { addDays, calendarDateInZone, type ActingRole, type CalendarDate, type WeeklyWindow } from '@vereino/core'
import { authorizeScoped } from '@/modules/foundation'
import { facilitiesErrors } from '../api/errors'
import { ZoneRule } from '../data/entities'
import { lockZoneRules } from '../data/queries'
import { availabilityBulkSchema } from '../data/validators'
import {
  availabilityRules,
  availabilityWindowProblem,
  conflictingZoneRule,
  localSessionOf,
  replaceAvailabilityPlan,
  sessionsInWindows,
  wallTimeOf,
  type AvailabilityWindowProblem,
  type ZoneRuleShape,
} from '../lib/zones'
import { clubTimeZone, openingHours, placeFamily, plannedSessions, type FacilitiesScope } from '../services/directory'
import {
  MANAGE_KINDS,
  assertPlaces,
  emitAfterCommit,
  facilitiesLog,
  facilityTarget,
  inWriteTransaction,
} from './shared'
import { ZONE_RULE_RESOURCE_KIND, liveZoneRules } from './zone-rules'

/** The horizon of the session warning for an open-ended period: the 16 weeks the generator fills (club spec DD-10). */
const WARNING_HORIZON_DAYS = 112

const PROBLEM_CODES: Record<
  AvailabilityWindowProblem,
  'availability_time_order' | 'availability_too_short' | 'availability_outside_opening_hours'
> = {
  time_order: 'availability_time_order',
  too_short: 'availability_too_short',
  outside_opening_hours: 'availability_outside_opening_hours',
}

export type AvailabilityWarnings = { clubOccurrencesInWindows: number; pendingRequestsOutside: number }

export type AvailabilityBulkResult = {
  entity: { id: string; tenantId: string; organizationId: string }
  actingRole: ActingRole
  before: null
  placeIds: string[]
  created: number
  removed: number
  createdIds: string[]
  warnings: AvailabilityWarnings
}

/** A day of the request that cannot be saved, with the place it fails for. */
type DayError = { placeId: string; weekday: number; code: string }

function toRow(em: EntityManager, scope: FacilitiesScope, shape: ZoneRuleShape): ZoneRule {
  return em.create(ZoneRule, {
    id: randomUUID(),
    ...scope,
    placeId: shape.placeId,
    weekdays: [...shape.weekdays],
    timeFrom: shape.timeFrom,
    timeTo: shape.timeTo,
    zone: shape.zone,
    priority: shape.priority,
    source: shape.source,
    validFrom: shape.validFrom,
    validTo: shape.validTo,
  })
}

/** How many planned sessions on the places (and their sub-places) fall into the new windows (a warning only). */
async function sessionWarning(
  ctx: Parameters<CommandHandler['execute']>[1],
  em: EntityManager,
  scope: FacilitiesScope,
  placeIds: readonly string[],
  windows: readonly WeeklyWindow[],
  period: { validFrom: CalendarDate; validTo: CalendarDate | null },
): Promise<number> {
  if (windows.length === 0) return 0
  const timeZone = await clubTimeZone(ctx.container, scope)
  const today = calendarDateInZone(new Date(), timeZone)
  const from = period.validFrom > today ? period.validFrom : today
  const to = period.validTo ?? addDays(from, WARNING_HORIZON_DAYS)
  if (to < from) return 0
  const familyIds = new Set<string>()
  for (const placeId of placeIds) {
    const family = await placeFamily(ctx.container, scope, placeId, em)
    familyIds.add(placeId)
    for (const id of family?.descendantIds ?? []) familyIds.add(id)
  }
  // A day of margin on both ends covers every time zone; `sessionsInWindows` keeps the club-zone dates of the period.
  const sessions = await plannedSessions(
    ctx.container,
    scope,
    [...familyIds],
    { start: new Date(`${addDays(from, -1)}T00:00:00Z`), end: new Date(`${addDays(to, 2)}T00:00:00Z`) },
    em,
  )
  const local = sessions.map((session) => localSessionOf(session.startAt, session.endAt, timeZone))
  return sessionsInWindows(local, windows, { validFrom: from, validTo: to })
}

const bulkUpsertCommand: CommandHandler<Record<string, unknown>, AvailabilityBulkResult> = {
  id: 'facilities.zone_rules.bulk_upsert',
  isUndoable: false,
  async execute(rawInput, ctx) {
    const batchId = randomUUID()
    const result = await inWriteTransaction(ctx, 'facilities.zone_rules.bulk_upsert', async (em) => {
      const authorized = await authorizeScoped(
        {
          input: availabilityBulkSchema,
          resourceKind: ZONE_RULE_RESOURCE_KIND,
          allowedKinds: MANAGE_KINDS,
          resolveTarget: (_parsed, _entity, scope) => facilityTarget({ id: batchId, ...scope }),
        },
        rawInput,
        ctx,
        em,
      )
      const { parsed, tenantId, organizationId } = authorized
      const scope = { tenantId, organizationId }
      const placeIds = [...new Set(parsed.placeIds)]
      const period = { validFrom: parsed.validFrom, validTo: parsed.validTo ?? null }
      const windows: WeeklyWindow[] = parsed.windows.map((window) => ({
        weekday: window.weekday,
        from: wallTimeOf(window.from),
        to: wallTimeOf(window.to),
      }))
      const selectedDays = [...new Set(parsed.weekdays ?? windows.map((window) => window.weekday))]
      const outsideSelection = windows.some((window) => !selectedDays.includes(window.weekday))
      if (selectedDays.length === 0 || outsideSelection || (parsed.mode === 'append' && windows.length === 0)) {
        await facilitiesErrors.throw('availability_days_invalid')
      }
      await assertPlaces(ctx, em, scope, placeIds)

      const hours = await openingHours(ctx.container, scope, placeIds, em)
      const dayErrors: DayError[] = []
      for (const placeId of placeIds) {
        for (const window of windows) {
          const problem = availabilityWindowProblem(window, hours.get(placeId) ?? null, period)
          if (problem) dayErrors.push({ placeId, weekday: window.weekday, code: PROBLEM_CODES[problem] })
        }
      }
      const firstError = dayErrors.at(0)
      if (firstError) {
        const error = await facilitiesErrors.create(
          firstError.code as (typeof PROBLEM_CODES)[AvailabilityWindowProblem],
          {
            dayErrors,
          },
        )
        const { translate } = await resolveTranslations()
        error.body = {
          ...error.body,
          fieldErrors: Object.fromEntries(
            dayErrors.map((entry) => [
              `day-${String(entry.weekday)}`,
              translate(`facilities.errors.${entry.code}`, entry.code),
            ]),
          ),
        }
        throw error
      }

      await lockZoneRules(em, organizationId)
      const live = await liveZoneRules(em, scope, placeIds)
      let removed = 0
      const kept: ZoneRuleShape[] = []
      const fragments: ZoneRuleShape[] = []
      for (const rule of live) {
        const plan =
          parsed.mode === 'replace' ? replaceAvailabilityPlan(rule, selectedDays, period) : { replaced: false as const }
        if (!plan.replaced) {
          kept.push(rule)
          continue
        }
        removed += 1
        rule.row.deletedAt = new Date()
        rule.row.updatedAt = new Date()
        fragments.push(...plan.fragments)
      }
      const created = placeIds.flatMap((placeId) => availabilityRules(placeId, windows, period))
      const others: ZoneRuleShape[] = [...kept, ...fragments]
      for (const candidate of created) {
        const conflict = conflictingZoneRule(candidate, others)
        if (conflict) await facilitiesErrors.throw('zone_rule_overlap', { conflictingRuleId: conflict.id ?? null })
        others.push(candidate)
      }
      for (const fragment of fragments) em.persist(toRow(em, scope, fragment))
      const createdRows = created.map((shape) => toRow(em, scope, shape))
      for (const row of createdRows) em.persist(row)
      await em.flush()

      const clubOccurrencesInWindows = await sessionWarning(ctx, em, scope, placeIds, windows, period)
      return {
        entity: { id: batchId, tenantId, organizationId },
        actingRole: authorized.actingRole,
        before: null,
        placeIds,
        created: createdRows.length,
        removed,
        createdIds: createdRows.map((row) => row.id),
        warnings: { clubOccurrencesInWindows, pendingRequestsOutside: 0 },
      }
    })
    await emitAfterCommit(
      'facilities.zone_rules.bulk_updated',
      { tenantId: result.entity.tenantId, organizationId: result.entity.organizationId },
      { id: result.entity.id, placeIds: result.placeIds },
    )
    return result
  },
  buildLog: ({ result }) =>
    facilitiesLog({
      result,
      resourceKind: ZONE_RULE_RESOURCE_KIND,
      labelKey: 'facilities.audit.zoneRules.bulk',
      fallback: 'Set booking availability',
      after: null,
      context: {
        placeIds: result.placeIds,
        created: result.created,
        removed: result.removed,
        createdIds: result.createdIds,
      },
    }),
}

registerCommand(bulkUpsertCommand)
