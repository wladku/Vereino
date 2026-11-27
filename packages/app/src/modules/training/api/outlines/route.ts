// `/api/training/outlines` — training outlines (training outlines spec *API* → `/api/training/outlines`, M-O5; REQ-O06,
// REQ-O07; #683): listed, written and deleted with `training.outlines.write` within the caller's grants — their own
// outlines, the outlines of the groups they coach, of the sections they coordinate, or (the club administrator) every
// outline of the club. `view=mine` lists the caller's own outlines attached nowhere (the ones to copy into a session),
// `sessions` the session outlines, `series` the series outlines. A session's outline is read-only 72 hours after the
// session's end (409 `outline_locked`); a session or an activity has at most one outline (409 `outline_exists`).
// `part` keeps the outlines with at least one exercise in that part (M-O5's part filter; #847).
import { z } from 'zod'
import { escapeLikePattern } from '@open-mercato/shared/lib/db/escapeLikePattern'
import { makeCrudRoute, type CrudCtx } from '@open-mercato/shared/lib/crud/factory'
import { createCrudOpenApiFactory, createPagedListResponseSchema } from '@open-mercato/shared/lib/openapi/crud'
import type { Where } from '@open-mercato/shared/lib/query/types'
import { scopeWhere } from '@vereino/core'
import { scopeContract } from '@/modules/foundation'
import type { OutlineCommandResult } from '../../commands/outlines'
import { OUTLINE_KINDS, selfPersonId } from '../../commands/shared'
import { Outline } from '../../data/entities'
import { outlineCreateSchema, outlineListQuerySchema, outlineUpdateSchema } from '../../data/validators'
import {
  OUTLINE_COLUMNS,
  OUTLINE_ENTITY_ID,
  attachOutlineNames,
  createdResponseSchema,
  outlineListItem,
  outlineListItemSchema,
  outlinesWithPart,
  updateResponseSchema,
} from '../shared'

type OutlineListQuery = z.infer<typeof outlineListQuerySchema>

const NO_ROW: Where = { id: { $exists: false } } as Where

const rawBodySchema = z.object({}).loose()

export const { metadata, GET, POST, PUT, DELETE } = makeCrudRoute({
  metadata: {
    GET: { requireAuth: true, requireFeatures: ['training.outlines.write'] },
    POST: { requireAuth: true, requireFeatures: ['training.outlines.write'] },
    PUT: { requireAuth: true, requireFeatures: ['training.outlines.write'] },
    DELETE: { requireAuth: true, requireFeatures: ['training.outlines.write'] },
  },
  orm: {
    entity: Outline,
    idField: 'id',
    orgField: 'organizationId',
    tenantField: 'tenantId',
    softDeleteField: 'deletedAt',
  },
  list: {
    schema: outlineListQuerySchema,
    entityId: OUTLINE_ENTITY_ID,
    fields: [
      'id',
      'topic',
      'age_category',
      'language',
      'duration_minutes',
      'author_person_id',
      'group_id',
      'activity_id',
      'occurrence_id',
      'source_outline_id',
      'tenant_id',
      'organization_id',
      'created_at',
      'updated_at',
    ],
    sortFieldMap: { topic: 'topic', createdAt: 'created_at', updatedAt: 'updated_at' },
    export: { enabled: false },
    disableListCache: true,
    buildFilters: async (query: OutlineListQuery, ctx: CrudCtx): Promise<Where> => {
      const scope = await scopeContract.resolve(ctx)
      const business: Where[] = []
      if (query.view === 'mine') {
        business.push({ author_person_id: selfPersonId(scope) ?? '00000000-0000-0000-0000-000000000000' })
        business.push({ occurrence_id: null }, { activity_id: null })
      } else if (query.view === 'sessions') {
        business.push({ occurrence_id: { $ne: null } })
      } else if (query.view === 'series') {
        business.push({ activity_id: { $ne: null } })
      }
      if (query.occurrenceId) business.push({ occurrence_id: query.occurrenceId })
      if (query.activityId) business.push({ activity_id: query.activityId })
      if (query.ageCategory) business.push({ age_category: query.ageCategory })
      if (query.search) business.push({ topic: { $ilike: `%${escapeLikePattern(query.search)}%` } })
      if (query.part) {
        const ids = await outlinesWithPart(ctx, query.part)
        business.push(ids.length > 0 ? ({ id: { $in: ids } } as Where) : NO_ROW)
      }
      return { $and: [scopeWhere(scope, OUTLINE_KINDS, OUTLINE_COLUMNS), ...business] } as Where
    },
    transformItem: outlineListItem,
  },
  hooks: {
    afterList: attachOutlineNames,
  },
  actions: {
    create: {
      commandId: 'training.outlines.create',
      schema: rawBodySchema,
      mapInput: ({ parsed }) => parsed as Record<string, unknown>,
      response: ({ result }) => {
        const { entity, copyIds } = result as OutlineCommandResult
        return { id: entity.id, updatedAt: entity.updatedAt.toISOString(), copyIds }
      },
      status: 201,
    },
    update: {
      commandId: 'training.outlines.update',
      schema: rawBodySchema,
      mapInput: ({ parsed }) => parsed as Record<string, unknown>,
      response: ({ result }) => {
        const { entity } = result as OutlineCommandResult
        return { ok: true, id: entity.id, updatedAt: entity.updatedAt.toISOString() }
      },
    },
    delete: {
      commandId: 'training.outlines.delete',
      mapInput: ({ raw }) => ({ id: (raw as { query?: { id?: unknown } }).query?.id }),
      response: () => ({ ok: true }),
    },
  },
})

const buildOpenApi = createCrudOpenApiFactory({ defaultTag: 'Training' })

export const openApi = buildOpenApi({
  resourceName: 'Training outline',
  pluralName: 'Training outlines',
  querySchema: outlineListQuerySchema,
  listResponseSchema: createPagedListResponseSchema(outlineListItemSchema),
  create: {
    schema: outlineCreateSchema,
    responseSchema: createdResponseSchema,
    description:
      'Writes an outline in the PZPN template (REQ-O06): an own outline, one for a session (`occurrenceId`) or the series outline of a recurring activity (`activityId`), whose planned future sessions each get their own copy (DD-O07). Errors: 400 invalid input, 403 `scope_denied`, 403 `scope_unlinked`, 409 `outline_exists`, 409 `outline_locked`, 422 `outline_reference_invalid`, 422 `outline_activity_not_recurring`.',
  },
  update: {
    schema: outlineUpdateSchema,
    responseSchema: updateResponseSchema,
    description:
      'Changes the content of an outline; a series outline’s edit never changes the sessions’ copies (BR-O2). Images are kept only as the outline already references them (they are added by the image route). Send the lock token in the platform optimistic-lock header (400 `lock_token_required` without it). Errors: 403 `scope_denied`, 404, 409 `optimistic_lock_conflict`, 409 `outline_locked`.',
  },
  del: {
    description:
      'Deletes an outline (soft delete; undoable). Send the lock token in the platform optimistic-lock header. Errors: 403 `scope_denied`, 404, 409 `optimistic_lock_conflict`, 409 `outline_locked`.',
  },
})
