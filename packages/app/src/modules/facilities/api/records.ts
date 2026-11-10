// The list items of the facility records (B-27; REQ-016; #126): the daily logs, the incidents and the entry bans, as
// the query engine returns them (encrypted columns already decrypted), plus the names the panel shows — the place, the
// person who wrote or reported, the banned institution or person and the issuer — added by `afterList` to the rows the
// scope filter already admitted.
import { z } from 'zod'
import type { CrudCtx } from '@open-mercato/shared/lib/crud/factory'
import { findPlaces, institutionNames, personNames, type FacilitiesScope } from '../services/directory'
import { photosOfIncidents, type IncidentPhotoView } from '../services/incident-photos'

export const LOG_ENTITY_ID = 'facilities:facility_log'
export const INCIDENT_ENTITY_ID = 'facilities:incident'

type Row = Record<string, unknown>

const text = (value: unknown): string | null => (typeof value === 'string' ? value : null)

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

/** A `jsonb` or `text[]` column: an array, or its JSON / Postgres text. */
function list(value: unknown): unknown[] {
  if (Array.isArray(value)) return value
  if (typeof value !== 'string') return []
  if (value.startsWith('[')) {
    try {
      const parsed: unknown = JSON.parse(value)
      return Array.isArray(parsed) ? parsed : []
    } catch {
      return []
    }
  }
  return value
    .replace(/[{}"]/g, '')
    .split(',')
    .filter((item) => item.length > 0)
}

function trustedScope(ctx: CrudCtx): FacilitiesScope | null {
  const tenantId = ctx.auth?.tenantId
  const organizationId = ctx.selectedOrganizationId ?? ctx.auth?.orgId
  return tenantId && organizationId ? { tenantId, organizationId } : null
}

const groupPresentItemSchema = z.object({
  occurrenceId: z.string().nullable(),
  rentalId: z.string().nullable(),
  headcount: z.number(),
  adultSupervisorPresent: z.boolean(),
})

function groupsPresent(value: unknown): Array<z.infer<typeof groupPresentItemSchema>> {
  return list(value).flatMap((item) => {
    if (typeof item !== 'object' || item === null) return []
    const group = item as Record<string, unknown>
    return [
      {
        occurrenceId: text(group.occurrenceId),
        rentalId: text(group.rentalId),
        headcount: typeof group.headcount === 'number' ? group.headcount : 0,
        adultSupervisorPresent: group.adultSupervisorPresent === true,
      },
    ]
  })
}

export function logListItem(row: Row) {
  return {
    id: String(row.id),
    placeId: String(row.place_id),
    placeName: null as string | null,
    logDate: day(row.log_date),
    operatorPersonId: text(row.operator_person_id),
    operatorName: null as string | null,
    openedAt: iso(row.opened_at),
    closedAt: iso(row.closed_at),
    conditionBefore: text(row.condition_before),
    conditionAfter: text(row.condition_after),
    groupsPresent: groupsPresent(row.groups_present),
    remarks: text(row.remarks),
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
  }
}

export const logListItemSchema = z.object({
  id: z.uuid(),
  placeId: z.uuid(),
  placeName: z.string().nullable(),
  logDate: z.string().nullable(),
  operatorPersonId: z.string().nullable(),
  operatorName: z.string().nullable(),
  openedAt: z.string().nullable(),
  closedAt: z.string().nullable(),
  conditionBefore: z.string().nullable(),
  conditionAfter: z.string().nullable(),
  groupsPresent: z.array(groupPresentItemSchema),
  remarks: z.string().nullable(),
  createdAt: z.string().nullable(),
  updatedAt: z.string().nullable(),
})

export function incidentListItem(row: Row) {
  return {
    id: String(row.id),
    placeId: String(row.place_id),
    placeName: null as string | null,
    occurredAt: iso(row.occurred_at),
    reportedByPersonId: text(row.reported_by_person_id),
    reportedByName: null as string | null,
    kind: text(row.kind),
    description: text(row.description),
    involved: text(row.involved),
    actionTaken: list(row.action_taken).filter((item): item is string => typeof item === 'string'),
    threadId: text(row.thread_id),
    photos: [] as IncidentPhotoView[],
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
  }
}

export const incidentListItemSchema = z.object({
  id: z.uuid(),
  placeId: z.uuid(),
  placeName: z.string().nullable(),
  occurredAt: z.string().nullable(),
  reportedByPersonId: z.string().nullable(),
  reportedByName: z.string().nullable(),
  kind: z.string().nullable(),
  description: z.string().nullable(),
  involved: z.string().nullable(),
  actionTaken: z.array(z.string()),
  threadId: z.string().nullable(),
  photos: z
    .array(
      z.object({
        id: z.uuid(),
        fileName: z.string(),
        mimeType: z.string(),
        size: z.number().int(),
        url: z.string().describe('The authenticated photo route'),
      }),
    )
    .describe('The incident photos in upload order (#126)'),
  createdAt: z.string().nullable(),
  updatedAt: z.string().nullable(),
})

type Named = { placeId: string; placeName: string | null }

async function namePlaces(ctx: CrudCtx, scope: FacilitiesScope, items: Named[]): Promise<void> {
  const places = await findPlaces(ctx.container, scope, Array.from(new Set(items.map((item) => item.placeId))))
  for (const item of items) item.placeName = places.get(item.placeId)?.name ?? null
}

/** Adds the place and the operator's name to the log rows. */
export async function attachLogNames(payload: { items?: unknown[] }, ctx: CrudCtx): Promise<void> {
  const items = (payload.items ?? []) as Array<ReturnType<typeof logListItem>>
  const scope = trustedScope(ctx)
  if (items.length === 0 || !scope) return
  await namePlaces(ctx, scope, items)
  const persons = await personNames(ctx.container, scope, [
    ...new Set(items.flatMap((item) => (item.operatorPersonId ? [item.operatorPersonId] : []))),
  ])
  for (const item of items)
    item.operatorName = item.operatorPersonId ? (persons.get(item.operatorPersonId) ?? null) : null
}

/** Adds the place, the reporter's name and the photos to the incident rows. */
export async function attachIncidentNames(payload: { items?: unknown[] }, ctx: CrudCtx): Promise<void> {
  const items = (payload.items ?? []) as Array<ReturnType<typeof incidentListItem>>
  const scope = trustedScope(ctx)
  if (items.length === 0 || !scope) return
  await namePlaces(ctx, scope, items)
  const persons = await personNames(ctx.container, scope, [
    ...new Set(items.flatMap((item) => (item.reportedByPersonId ? [item.reportedByPersonId] : []))),
  ])
  const photos = await photosOfIncidents(
    ctx.container,
    scope,
    items.map((item) => item.id),
  )
  for (const item of items) {
    item.reportedByName = item.reportedByPersonId ? (persons.get(item.reportedByPersonId) ?? null) : null
    item.photos = photos.get(item.id) ?? []
  }
}

type BanItem = Named & {
  subjectType: string | null
  subjectId: string | null
  subjectName?: string | null
  issuedByPersonId?: string | null
  issuedByName?: string | null
}

/** Adds the place, the banned institution or person and the issuer's name to the ban rows. */
export async function attachEntryBanNames(payload: { items?: unknown[] }, ctx: CrudCtx): Promise<void> {
  const items = (payload.items ?? []) as BanItem[]
  const scope = trustedScope(ctx)
  if (items.length === 0 || !scope) return
  await namePlaces(ctx, scope, items)
  const institutionIds = items.flatMap((item) =>
    item.subjectType === 'institution' && item.subjectId ? [item.subjectId] : [],
  )
  const personIds = items.flatMap((item) => [
    ...(item.subjectType === 'person' && item.subjectId ? [item.subjectId] : []),
    ...(item.issuedByPersonId ? [item.issuedByPersonId] : []),
  ])
  const institutions = await institutionNames(ctx.container, scope, Array.from(new Set(institutionIds)))
  const persons = await personNames(ctx.container, scope, Array.from(new Set(personIds)))
  for (const item of items) {
    const names = item.subjectType === 'institution' ? institutions : persons
    item.subjectName = item.subjectId ? (names.get(item.subjectId) ?? null) : null
    item.issuedByName = item.issuedByPersonId ? (persons.get(item.issuedByPersonId) ?? null) : null
  }
}
