// The list items of the maintenance tasks and the place maintainers (B-27 maintenance tab and its "Maintainers" tab;
// REQ-022, DD-36; #128), as the query engine returns them (the notes already decrypted), plus what `afterList` adds to
// the rows the scope filter admitted: the place, the planner's and the maintainer's names and, for a planned usage
// task, the hours counted since `usage_counted_from`.
import type { EntityManager } from '@mikro-orm/postgresql'
import { z } from 'zod'
import type { CrudCtx } from '@open-mercato/shared/lib/crud/factory'
import { findPlaces, personNames, type FacilitiesScope } from '../services/directory'
import { usageHoursSince } from '../services/maintenance'

export const MAINTENANCE_TASK_ENTITY_ID = 'facilities:maintenance_task'
export const PLACE_MAINTAINER_ENTITY_ID = 'facilities:place_maintainer'

type Row = Record<string, unknown>

const text = (value: unknown): string | null => (typeof value === 'string' ? value : null)
const int = (value: unknown): number | null => (value === null || value === undefined ? null : Number(value))

function iso(value: unknown): string | null {
  let date: Date | null = null
  if (value instanceof Date) date = value
  else if (typeof value === 'string' || typeof value === 'number') date = new Date(value)
  return date && !Number.isNaN(date.getTime()) ? date.toISOString() : null
}

function day(value: unknown): string | null {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value.toISOString().slice(0, 10)
  return typeof value === 'string' ? value.slice(0, 10) : null
}

function trustedScope(ctx: CrudCtx): FacilitiesScope | null {
  const tenantId = ctx.auth?.tenantId
  const organizationId = ctx.selectedOrganizationId ?? ctx.auth?.orgId
  return tenantId && organizationId ? { tenantId, organizationId } : null
}

export function maintenanceTaskListItem(row: Row) {
  return {
    id: String(row.id),
    placeId: String(row.place_id),
    placeName: null as string | null,
    kind: String(row.kind),
    responsible: String(row.responsible),
    scheduleType: String(row.schedule_type),
    startsAt: iso(row.starts_at),
    endsAt: iso(row.ends_at),
    dueDate: day(row.due_date),
    recurrenceRule: text(row.recurrence_rule),
    usageHoursThreshold: int(row.usage_hours_threshold),
    usageCountedFrom: iso(row.usage_counted_from),
    usageHours: null as number | null,
    seriesId: text(row.series_id),
    status: String(row.status),
    plannedByPersonId: text(row.planned_by_person_id),
    plannedByName: null as string | null,
    doneAt: iso(row.done_at),
    doneByPersonId: text(row.done_by_person_id),
    doneByName: null as string | null,
    cost: int(row.cost),
    notes: text(row.notes),
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
  }
}

export const maintenanceTaskListItemSchema = z.object({
  id: z.uuid(),
  placeId: z.uuid(),
  placeName: z.string().nullable(),
  kind: z.string(),
  responsible: z.string(),
  scheduleType: z.string(),
  startsAt: z.string().nullable(),
  endsAt: z.string().nullable(),
  dueDate: z.string().nullable(),
  recurrenceRule: z.string().nullable(),
  usageHoursThreshold: z.number().nullable(),
  usageCountedFrom: z.string().nullable(),
  usageHours: z.number().nullable().describe('A planned usage task: the hours counted so far'),
  seriesId: z.string().nullable(),
  status: z.string(),
  plannedByPersonId: z.string().nullable(),
  plannedByName: z.string().nullable(),
  doneAt: z.string().nullable(),
  doneByPersonId: z.string().nullable(),
  doneByName: z.string().nullable(),
  cost: z.number().nullable(),
  notes: z.string().nullable(),
  createdAt: z.string().nullable(),
  updatedAt: z.string().nullable(),
})

type TaskItem = ReturnType<typeof maintenanceTaskListItem>

/** Adds the place, the planner's and completer's names and the counted hours of the planned usage tasks. */
export async function attachMaintenanceNames(payload: { items?: unknown[] }, ctx: CrudCtx): Promise<void> {
  const items = (payload.items ?? []) as TaskItem[]
  const scope = trustedScope(ctx)
  if (items.length === 0 || !scope) return
  const places = await findPlaces(ctx.container, scope, [...new Set(items.map((item) => item.placeId))])
  const personIds = items.flatMap((item) => [item.plannedByPersonId, item.doneByPersonId]).filter(Boolean) as string[]
  const persons = await personNames(ctx.container, scope, [...new Set(personIds)])
  const em = ctx.container.resolve<EntityManager>('em').fork()
  const now = new Date()
  for (const item of items) {
    item.placeName = places.get(item.placeId)?.name ?? null
    item.plannedByName = item.plannedByPersonId ? (persons.get(item.plannedByPersonId) ?? null) : null
    item.doneByName = item.doneByPersonId ? (persons.get(item.doneByPersonId) ?? null) : null
    if (item.status === 'planned' && item.scheduleType === 'usage_hours' && item.usageCountedFrom) {
      const hours = await usageHoursSince(ctx.container, em, scope, item.placeId, new Date(item.usageCountedFrom), now)
      item.usageHours = Math.round(hours * 10) / 10
    }
  }
}

export function placeMaintainerListItem(row: Row) {
  return {
    id: String(row.id),
    placeId: String(row.place_id),
    placeName: null as string | null,
    personId: String(row.person_id),
    personName: null as string | null,
    assignedAt: iso(row.assigned_at),
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
  }
}

export const placeMaintainerListItemSchema = z.object({
  id: z.uuid(),
  placeId: z.uuid(),
  placeName: z.string().nullable(),
  personId: z.uuid(),
  personName: z.string().nullable(),
  assignedAt: z.string().nullable(),
  createdAt: z.string().nullable(),
  updatedAt: z.string().nullable(),
})

/** Adds the place and the person's name to the maintainer rows. */
export async function attachMaintainerNames(payload: { items?: unknown[] }, ctx: CrudCtx): Promise<void> {
  const items = (payload.items ?? []) as Array<ReturnType<typeof placeMaintainerListItem>>
  const scope = trustedScope(ctx)
  if (items.length === 0 || !scope) return
  const places = await findPlaces(ctx.container, scope, [...new Set(items.map((item) => item.placeId))])
  const persons = await personNames(ctx.container, scope, [...new Set(items.map((item) => item.personId))])
  for (const item of items) {
    item.placeName = places.get(item.placeId)?.name ?? null
    item.personName = persons.get(item.personId) ?? null
  }
}
