// `/api/payments/fees` — fee schedules (payments spec API table, REQ-011, REQ-018; B-20; issue #108): the club
// administrator reads and writes them through the `payments` commands (both a group and an activity, or neither → 422
// `fee_target_invalid`). The list adds the name of each fee's group or activity.
import { z } from 'zod'
import { makeCrudRoute, type CrudCtx } from '@open-mercato/shared/lib/crud/factory'
import { escapeLikePattern } from '@open-mercato/shared/lib/db/escapeLikePattern'
import { createCrudOpenApiFactory, createPagedListResponseSchema } from '@open-mercato/shared/lib/openapi/crud'
import type { Where } from '@open-mercato/shared/lib/query/types'
import { scopeWhere } from '@vereino/core'
import { scopeContract } from '@/modules/foundation'
import type { FeeCommandResult } from '../../commands/fees'
import { Fee } from '../../data/entities'
import { feeCreateSchema, feeDeleteSchema, feeListQuerySchema, feeUpdateSchema } from '../../data/validators'
import {
  CLUB_WIDE_COLUMNS,
  FEE_ENTITY_ID,
  PAYMENTS_READ_KINDS,
  attachFeeTargets,
  feeListItem,
  feeListItemSchema,
  updateResponseSchema,
} from '../shared'

type FeeListQuery = z.infer<typeof feeListQuerySchema>

const rawBodySchema = z.object({}).loose()

export const { metadata, GET, POST, PUT, DELETE } = makeCrudRoute({
  metadata: {
    GET: { requireAuth: true, requireFeatures: ['payments.manage'] },
    POST: { requireAuth: true, requireFeatures: ['payments.manage'] },
    PUT: { requireAuth: true, requireFeatures: ['payments.manage'] },
    DELETE: { requireAuth: true, requireFeatures: ['payments.manage'] },
  },
  orm: {
    entity: Fee,
    idField: 'id',
    orgField: 'organizationId',
    tenantField: 'tenantId',
    softDeleteField: 'deletedAt',
  },
  list: {
    schema: feeListQuerySchema,
    entityId: FEE_ENTITY_ID,
    fields: [
      'id',
      'name',
      'amount',
      'period',
      'group_id',
      'activity_id',
      'due_day',
      'valid_from',
      'valid_to',
      'tenant_id',
      'organization_id',
      'created_at',
      'updated_at',
    ],
    sortFieldMap: {
      name: 'name',
      amount: 'amount',
      validFrom: 'valid_from',
      createdAt: 'created_at',
      updatedAt: 'updated_at',
    },
    // A full export would skip `buildFilters` and with it the record scope.
    export: { enabled: false },
    disableListCache: true,
    buildFilters: async (query: FeeListQuery, ctx: CrudCtx): Promise<Where> => {
      const scope = await scopeContract.resolve(ctx)
      const business: Where = {}
      if (query.search) business.name = { $ilike: `%${escapeLikePattern(query.search)}%` }
      if (query.period) business.period = query.period
      if (query.groupId) business.group_id = query.groupId
      if (query.activityId) business.activity_id = query.activityId
      return { $and: [scopeWhere(scope, PAYMENTS_READ_KINDS, CLUB_WIDE_COLUMNS), business] } as Where
    },
    transformItem: feeListItem,
  },
  hooks: {
    afterList: attachFeeTargets,
  },
  actions: {
    create: {
      commandId: 'payments.fees.create',
      schema: rawBodySchema,
      mapInput: ({ parsed }) => parsed as Record<string, unknown>,
      response: ({ result }) => ({ id: (result as FeeCommandResult).entity.id }),
      status: 201,
    },
    update: {
      commandId: 'payments.fees.update',
      schema: rawBodySchema,
      mapInput: ({ parsed }) => parsed as Record<string, unknown>,
      response: ({ result }) => {
        const { entity, actingRole } = result as FeeCommandResult
        return { ok: true, id: entity.id, updatedAt: entity.updatedAt.toISOString(), actingRole }
      },
    },
    delete: {
      commandId: 'payments.fees.delete',
      mapInput: ({ raw }) => ({ id: (raw as { query?: { id?: unknown } }).query?.id }),
      response: () => ({ ok: true }),
    },
  },
})

const buildOpenApi = createCrudOpenApiFactory({ defaultTag: 'Payments' })

export const openApi = buildOpenApi({
  resourceName: 'Fee',
  pluralName: 'Fees',
  querySchema: feeListQuerySchema,
  listResponseSchema: createPagedListResponseSchema(feeListItemSchema),
  create: {
    schema: feeCreateSchema,
    description:
      'Creates a fee schedule (club administrator): `amount` in grosz, `period` `monthly` / `one_off` / `per_occurrence`, exactly one of `groupId` and `activityId`, `dueDay` 1–28 and the validity. Errors: 400 invalid input, 403 `scope_denied`, 422 `fee_target_invalid` (both or neither), 422 `fee_target_unknown`, 422 `validity_inverted`.',
  },
  update: {
    schema: feeUpdateSchema,
    responseSchema: updateResponseSchema,
    description:
      'Changes a fee schedule; charges already issued keep their amounts, and the `period` cannot change once the fee has charges. Send the lock token in the platform optimistic-lock header (400 `lock_token_required` without it). Errors: 403 `scope_denied`, 404, 409 `optimistic_lock_conflict`, 422 `fee_target_invalid`, 422 `fee_target_unknown`, 422 `fee_period_locked`, 422 `validity_inverted`.',
  },
  del: {
    schema: feeDeleteSchema,
    description:
      'Soft-deletes a fee schedule (`?id=`); its charges stay. Send the lock token in the platform optimistic-lock header (400 `lock_token_required` without it). Errors: 403 `scope_denied`, 404, 409 `optimistic_lock_conflict`.',
  },
})
