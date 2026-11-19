// Shared pieces of the `/api/activities/club-events*` routes (club events spec REQ-T01, REQ-T11, Q-T18): who reads club
// events (the coordinators of the club and the club administrator; a coach does not), the list item and its schema,
// the derived columns of the list rows and the `notified` counts of the moves and cancellations an event write makes.
import { z } from 'zod'
import type { CrudCtx } from '@open-mercato/shared/lib/crud/factory'
import type { GrantKind, ScopeColumnMap, ScopeMatchOptions } from '@vereino/core'
import { scopeContract } from '@/modules/foundation'
import { selfPersonId } from '../commands/shared'
import { countCancellationNotified } from '../services/cancellation-notice'
import { clubEventDerived, type ClubEventDerived } from '../services/club-events'
import { attendanceSettings } from '../services/directory'
import { countMoveNotified } from '../services/session-notice'

/** Coordinators read every club event of the club (Q-T18); the administrator too. A coach reads none. */
export const CLUB_EVENT_READ_KINDS: readonly GrantKind[] = ['coordinator', 'club_admin']
export const CLUB_EVENT_READ_OPTIONS: ScopeMatchOptions = { clubWideKinds: ['coordinator'] }
export const CLUB_EVENT_LIST_COLUMNS: ScopeColumnMap = { sectionId: 'section_id' }
export const CLUB_EVENT_ENTITY_ID = 'activities:club_event'

type Row = Record<string, unknown>

const text = (value: unknown): string | null => (typeof value === 'string' ? value : null)
const bool = (value: unknown): boolean => value === true || value === 't' || value === 'true'

function integer(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim() !== '' && Number.isFinite(Number(value))) return Number(value)
  return null
}

function iso(value: unknown): string | null {
  let date: Date | null = null
  if (value instanceof Date) date = value
  else if (typeof value === 'string' || typeof value === 'number') date = new Date(value)
  return date && !Number.isNaN(date.getTime()) ? date.toISOString() : null
}

/** The trusted tenant and organization of a CRUD request, or null. */
export function crudScope(ctx: CrudCtx): { tenantId: string; organizationId: string } | null {
  const tenantId = ctx.auth?.tenantId
  const organizationId = ctx.selectedOrganizationId ?? ctx.auth?.orgId
  return tenantId && organizationId ? { tenantId, organizationId } : null
}

export function clubEventListItem(row: Row) {
  return {
    id: String(row.id),
    name: text(row.name),
    publicSlug: text(row.public_slug),
    sectionId: text(row.section_id),
    placeId: text(row.place_id),
    description: text(row.description),
    gatheringMinutesBefore: integer(row.gathering_minutes_before),
    confirmByMinutesBefore: integer(row.confirm_by_minutes_before),
    isPublic: bool(row.is_public),
    status: text(row.status),
    cancelReason: text(row.cancel_reason),
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
  }
}

export type ClubEventListItem = ReturnType<typeof clubEventListItem> & Partial<ClubEventDerived>

export const clubEventListItemSchema = z.object({
  id: z.uuid(),
  name: z.string().nullable(),
  publicSlug: z.string().nullable(),
  sectionId: z.uuid().nullable().describe('Null for a whole-club event.'),
  sectionName: z.string().nullable().optional(),
  placeId: z.uuid().nullable(),
  placeName: z.string().nullable().optional(),
  placeExternal: z.boolean().optional().describe('The place is outside the club’s own places.'),
  description: z.string().nullable(),
  gatheringMinutesBefore: z.number().int().nullable(),
  confirmByMinutesBefore: z.number().int().nullable(),
  isPublic: z.boolean(),
  status: z.string().nullable().describe('`planned` or `cancelled`.'),
  cancelReason: z.string().nullable(),
  dateFrom: z
    .string()
    .nullable()
    .optional()
    .describe('The first part’s start date in the club zone; null without parts.'),
  dateTo: z.string().nullable().optional().describe('The last part’s end date in the club zone; null without parts.'),
  partsCount: z.number().int().optional(),
  mayManage: z.boolean().optional().describe('The caller manages the event (DD-T06).'),
  createdAt: z.string().nullable(),
  updatedAt: z.string().nullable(),
})

/** Adds the dates, place, section, parts count and `mayManage` to the rows the scope filter admitted. */
export async function attachClubEventDerived(payload: { items?: unknown[] }, ctx: CrudCtx): Promise<void> {
  const items = (payload.items ?? []) as ClubEventListItem[]
  const scope = crudScope(ctx)
  if (items.length === 0 || !scope) return
  const grants = await scopeContract.resolve(ctx)
  const { timeZone } = await attendanceSettings(ctx.container, scope)
  const derived = await clubEventDerived(
    ctx.container,
    scope,
    grants,
    items.flatMap((item) =>
      item.placeId
        ? [
            {
              id: item.id,
              ...scope,
              sectionId: item.sectionId,
              placeId: item.placeId,
              status: (item.status ?? 'planned') as 'planned' | 'cancelled',
              publicSlug: item.publicSlug ?? '',
              isPublic: item.isPublic,
            },
          ]
        : [],
    ),
    timeZone,
  )
  for (const item of items) Object.assign(item, derived.get(item.id) ?? {})
}

/** How many people the moves of an event's place change tell, summed over the moved sessions (0 on failure). */
export async function countMovedNotified(
  ctx: CrudCtx,
  sessionIds: readonly string[],
  actingRole: string,
): Promise<number> {
  const scope = crudScope(ctx)
  if (!scope || sessionIds.length === 0) return 0
  const personId = selfPersonId(await scopeContract.resolve(ctx))
  let total = 0
  for (const id of sessionIds) {
    total += await countMoveNotified(ctx.container, scope, id, { personId, actingRole }).catch(() => 0)
  }
  return total
}

/** How many people the cancellations of an event tell, summed over the cancelled sessions (0 on failure). */
export async function countCancelledNotified(
  container: CrudCtx['container'],
  scope: { tenantId: string; organizationId: string },
  personId: string | null,
  sessionIds: readonly string[],
  actingRole: string,
): Promise<number> {
  let total = 0
  for (const id of sessionIds) {
    total += await countCancellationNotified(container, scope, id, { personId, actingRole }).catch(() => 0)
  }
  return total
}
