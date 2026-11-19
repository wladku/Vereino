// `/api/activities/club-events` — club events (club events spec REQ-T01, REQ-T05, REQ-T11, *API, Command, and Error
// Contracts*; #376): the list is readable club-wide by a coordinator and by the club administrator (Q-T18) with the
// derived dates, place, parts count and whether the caller manages each event; create and update run
// `activities.club_events.create|update` (a coordinator only for their own section, a whole-club event only for the
// club administrator — 403 `scope_denied`; a change of the place moves the planned future part sessions and answers
// with `sessionsMoved` and `notified`).
import { z } from 'zod'
import { makeCrudRoute, type CrudCtx } from '@open-mercato/shared/lib/crud/factory'
import { escapeLikePattern } from '@open-mercato/shared/lib/db/escapeLikePattern'
import { createCrudOpenApiFactory, createPagedListResponseSchema } from '@open-mercato/shared/lib/openapi/crud'
import type { Where } from '@open-mercato/shared/lib/query/types'
import { scopeWhere } from '@vereino/core'
import { scopeContract } from '@/modules/foundation'
import type { ClubEventCommandResult } from '../../commands/club-events'
import { ClubEvent } from '../../data/entities'
import { pastClubEvents } from '../../services/club-events'
import { clubEventCreateSchema, clubEventListQuerySchema, clubEventUpdateSchema } from '../../data/validators'
import {
  CLUB_EVENT_ENTITY_ID,
  CLUB_EVENT_LIST_COLUMNS,
  CLUB_EVENT_READ_KINDS,
  CLUB_EVENT_READ_OPTIONS,
  attachClubEventDerived,
  clubEventListItem,
  clubEventListItemSchema,
  countMovedNotified,
  crudScope,
} from '../club-event-shared'

type ClubEventListQuery = z.infer<typeof clubEventListQuerySchema>

const rawBodySchema = z.object({}).loose()

/** `{ id: { $exists: false } }` matches no row (an empty `$in` is a syntax error in the query engine). */
const NO_ROW: Where = { id: { $exists: false } } as Where

export const { metadata, GET, POST, PUT } = makeCrudRoute({
  metadata: {
    GET: { requireAuth: true, requireFeatures: ['activities.view'] },
    POST: { requireAuth: true, requireFeatures: ['activities.manage'] },
    PUT: { requireAuth: true, requireFeatures: ['activities.manage'] },
  },
  orm: {
    entity: ClubEvent,
    idField: 'id',
    orgField: 'organizationId',
    tenantField: 'tenantId',
    softDeleteField: 'deletedAt',
  },
  list: {
    schema: clubEventListQuerySchema,
    entityId: CLUB_EVENT_ENTITY_ID,
    fields: [
      'id',
      'section_id',
      'name',
      'public_slug',
      'description',
      'place_id',
      'gathering_minutes_before',
      'confirm_by_minutes_before',
      'is_public',
      'status',
      'cancel_reason',
      'tenant_id',
      'organization_id',
      'created_at',
      'updated_at',
    ],
    sortFieldMap: { name: 'name', createdAt: 'created_at', updatedAt: 'updated_at' },
    // A full export would skip `buildFilters` and with it the record scope.
    export: { enabled: false },
    disableListCache: true,
    buildFilters: async (query: ClubEventListQuery, ctx: CrudCtx): Promise<Where> => {
      const scope = await scopeContract.resolve(ctx)
      const business: Where = {}
      if (query.search) business.name = { $ilike: `%${escapeLikePattern(query.search)}%` }
      if (query.sectionId) business.section_id = query.sectionId
      const filters: Where[] = [
        scopeWhere(scope, CLUB_EVENT_READ_KINDS, CLUB_EVENT_LIST_COLUMNS, CLUB_EVENT_READ_OPTIONS) as Where,
        business,
      ]
      if (query.view === 'cancelled') filters.push({ status: 'cancelled' } as Where)
      if (query.view === 'upcoming' || query.view === 'past') {
        const trusted = crudScope(ctx)
        const past = trusted ? await pastClubEvents(ctx.container, trusted, new Date()) : []
        filters.push({ status: 'planned' } as Where)
        if (query.view === 'past') filters.push(past.length > 0 ? ({ id: { $in: past } } as Where) : NO_ROW)
        else if (past.length > 0) filters.push({ id: { $nin: past } } as Where)
      }
      return { $and: filters } as Where
    },
    transformItem: clubEventListItem,
  },
  hooks: {
    afterList: attachClubEventDerived,
  },
  actions: {
    create: {
      commandId: 'activities.club_events.create',
      schema: rawBodySchema,
      mapInput: ({ parsed }) => parsed as Record<string, unknown>,
      response: ({ result }) => {
        const { entity, actingRole } = result as ClubEventCommandResult
        return { id: entity.id, publicSlug: entity.publicSlug, actingRole }
      },
      status: 201,
    },
    update: {
      commandId: 'activities.club_events.update',
      schema: rawBodySchema,
      mapInput: ({ parsed }) => parsed as Record<string, unknown>,
      response: async ({ result, ctx }) => {
        const { entity, actingRole, sessionIds } = result as ClubEventCommandResult
        return {
          ok: true,
          id: entity.id,
          updatedAt: entity.updatedAt.toISOString(),
          actingRole,
          sessionsMoved: sessionIds.length,
          notified: await countMovedNotified(ctx, sessionIds, actingRole),
        }
      },
    },
  },
})

const buildOpenApi = createCrudOpenApiFactory({ defaultTag: 'Activities' })

export const openApi = buildOpenApi({
  resourceName: 'Club event',
  pluralName: 'Club events',
  querySchema: clubEventListQuerySchema,
  listResponseSchema: createPagedListResponseSchema(clubEventListItemSchema),
  create: {
    schema: clubEventCreateSchema,
    responseSchema: z.object({ id: z.uuid(), publicSlug: z.string(), actingRole: z.string() }),
    description:
      'Creates a club event (club events spec REQ-T01): a coordinator for a section they coordinate, the club administrator for any section or the whole club (`sectionId: null`). Without `publicSlug` the slug is proposed from the name. The place is a live active leaf of the club, own or external. Errors: 403 `scope_denied`, 404 unknown place, 409 `club_event_slug_taken`, 422 `place_not_bookable`, `activities_reference_invalid` (`field: "sectionId"`), `club_event_slug_invalid`.',
  },
  update: {
    schema: clubEventUpdateSchema,
    responseSchema: z.object({
      ok: z.literal(true),
      id: z.uuid(),
      updatedAt: z.string(),
      actingRole: z.string(),
      sessionsMoved: z.number().int().min(0),
      notified: z.number().int().min(0),
    }),
    description:
      'Changes a club event; send the lock token in the platform optimistic-lock header. A new `placeId` moves every planned future part session there after the collision check of each (DD-T07: an external place checks only the coach) and announces each move to that part’s audience; `notified` counts the people told. Errors: 403 `scope_denied`, 404, 409 `optimistic_lock_conflict`, `club_event_cancelled`, `club_event_slug_taken`, `occurrence_place_conflict` / `occurrence_coach_conflict` with `conflicts` (nothing saved), `event_place_closed`, 422 `club_event_open_part_needs_external_place`, `club_event_section_fixed`, `place_not_bookable`.',
  },
})
