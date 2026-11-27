// Shared pieces of the `training` routes: the error and response schemas, the list item and its names (#683).
import { z } from 'zod'
import type { CrudCtx } from '@open-mercato/shared/lib/crud/factory'
import { OUTLINE_LANGUAGES } from '../lib/outline'
import { findGroups, findOccurrences, findPersons, type TrainingScope } from '../services/directory'
import { outlinesWithPart as clubOutlinesWithPart } from '../services/outline-view'

export const OUTLINE_ENTITY_ID = 'training:outline'

export const errorSchema = z.object({ error: z.string(), code: z.string().optional() }).loose()

export const updateResponseSchema = z.object({ ok: z.literal(true), id: z.uuid(), updatedAt: z.string() })

export const createdResponseSchema = z.object({
  id: z.uuid(),
  updatedAt: z.string(),
  copyIds: z.array(z.uuid()).describe('The session copies made of a series outline (DD-O07)'),
})

/** The outline columns the scope filter matches: the author, the group, the section and the session. */
export const OUTLINE_COLUMNS = {
  personId: 'author_person_id',
  groupId: 'group_id',
  sectionId: 'section_id',
  occurrenceId: 'occurrence_id',
} as const

type Row = Record<string, unknown>

const text = (value: unknown): string | null => (typeof value === 'string' ? value : null)

function iso(value: unknown): string | null {
  let date: Date | null = null
  if (value instanceof Date) date = value
  else if (typeof value === 'string' || typeof value === 'number') date = new Date(value)
  return date && !Number.isNaN(date.getTime()) ? date.toISOString() : null
}

export function outlineListItem(row: Row) {
  return {
    id: String(row.id),
    topic: text(row.topic) ?? '',
    ageCategory: text(row.age_category) ?? '',
    language: text(row.language) ?? 'pl',
    durationMinutes: Number(row.duration_minutes ?? 0),
    authorPersonId: text(row.author_person_id),
    authorName: null as string | null,
    groupId: text(row.group_id),
    groupName: null as string | null,
    activityId: text(row.activity_id),
    occurrenceId: text(row.occurrence_id),
    sessionDate: null as string | null,
    sourceOutlineId: text(row.source_outline_id),
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
  }
}

export const outlineListItemSchema = z.object({
  id: z.uuid(),
  topic: z.string(),
  ageCategory: z.string(),
  language: z.enum(OUTLINE_LANGUAGES),
  durationMinutes: z.number().int(),
  authorPersonId: z.string().nullable(),
  authorName: z.string().nullable(),
  groupId: z.string().nullable(),
  groupName: z.string().nullable(),
  activityId: z.string().nullable().describe('Set on the series outline of a recurring activity'),
  occurrenceId: z.string().nullable().describe('Set on the outline of one session'),
  sessionDate: z.string().nullable().describe('The session’s day (club calendar) of a session outline'),
  sourceOutlineId: z.string().nullable(),
  createdAt: z.string().nullable(),
  updatedAt: z.string().nullable(),
})

function trustedScope(ctx: CrudCtx): TrainingScope | null {
  const tenantId = ctx.auth?.tenantId
  const organizationId = ctx.selectedOrganizationId ?? ctx.auth?.orgId
  return tenantId && organizationId ? { tenantId, organizationId } : null
}

/**
 * The outlines of the caller's club with at least one exercise in `part` (the list's part filter, M-O5; #847), or an
 * empty list without a trusted scope. The list route still narrows them by the record scope.
 */
export async function outlinesWithPart(ctx: CrudCtx, part: string): Promise<string[]> {
  const scope = trustedScope(ctx)
  if (!scope) return []
  return clubOutlinesWithPart(ctx.container, scope, part)
}

/** The author's and the group's names and the session's day of the listed outlines. */
export async function attachOutlineNames(payload: { items?: unknown[] }, ctx: CrudCtx): Promise<void> {
  const items = (payload.items ?? []) as Array<ReturnType<typeof outlineListItem>>
  const scope = trustedScope(ctx)
  if (items.length === 0 || !scope) return
  const ids = (pick: (item: (typeof items)[number]) => string | null) => [
    ...new Set(items.flatMap((item) => (pick(item) ? [pick(item) as string] : []))),
  ]
  const [persons, groups, sessions] = await Promise.all([
    findPersons(
      ctx.container,
      scope,
      ids((item) => item.authorPersonId),
    ),
    findGroups(
      ctx.container,
      scope,
      ids((item) => item.groupId),
    ),
    findOccurrences(
      ctx.container,
      scope,
      ids((item) => item.occurrenceId),
    ),
  ])
  for (const item of items) {
    const author = item.authorPersonId ? persons.get(item.authorPersonId) : undefined
    item.authorName = author ? `${author.firstName} ${author.lastName}`.trim() : null
    item.groupName = item.groupId ? (groups.get(item.groupId)?.name ?? null) : null
    item.sessionDate = item.occurrenceId ? (sessions.get(item.occurrenceId)?.occurrenceDate ?? null) : null
  }
}
