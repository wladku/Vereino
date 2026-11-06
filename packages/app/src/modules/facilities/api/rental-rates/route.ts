// `/api/facilities/rental-rates` — the rental rates of the club's places (facilities spec *Data Models* →
// `facilities_rental_rates`, the CRUD row of *API, Command, and Error Contracts*; REQ-013; #121): read with
// `facilities.view` by the club administrator, written with `facilities.manage` through the
// `facilities.rental_rates.*` commands (season → 422 `rental_rate_season_invalid`, ambiguous rate → 409
// `rental_rate_overlap`). Quotes (`POST /api/facilities/rentals/quote`) arrive with the rentals (E08-S02).
import { z } from 'zod'
import { makeCrudRoute, type CrudCtx } from '@open-mercato/shared/lib/crud/factory'
import { createCrudOpenApiFactory, createPagedListResponseSchema } from '@open-mercato/shared/lib/openapi/crud'
import type { Where } from '@open-mercato/shared/lib/query/types'
import { scopeWhere } from '@vereino/core'
import { scopeContract } from '@/modules/foundation'
import type { RentalRateCommandResult } from '../../commands/rental-rates'
import { READ_KINDS } from '../../commands/shared'
import { RentalRate } from '../../data/entities'
import {
  rentalRateCreateSchema,
  rentalRateDeleteSchema,
  rentalRateListQuerySchema,
  rentalRateUpdateSchema,
} from '../../data/validators'
import {
  FACILITY_COLUMNS,
  RENTAL_RATE_ENTITY_ID,
  rentalRateListItem,
  rentalRateListItemSchema,
  updateResponseSchema,
} from '../shared'

type RentalRateListQuery = z.infer<typeof rentalRateListQuerySchema>

const rawBodySchema = z.object({}).loose()

export const { metadata, GET, POST, PUT, DELETE } = makeCrudRoute({
  metadata: {
    GET: { requireAuth: true, requireFeatures: ['facilities.view'] },
    POST: { requireAuth: true, requireFeatures: ['facilities.manage'] },
    PUT: { requireAuth: true, requireFeatures: ['facilities.manage'] },
    DELETE: { requireAuth: true, requireFeatures: ['facilities.manage'] },
  },
  orm: {
    entity: RentalRate,
    idField: 'id',
    orgField: 'organizationId',
    tenantField: 'tenantId',
    softDeleteField: 'deletedAt',
  },
  list: {
    schema: rentalRateListQuerySchema,
    entityId: RENTAL_RATE_ENTITY_ID,
    fields: [
      'id',
      'place_id',
      'renter_category',
      'price_per_90',
      'season_from',
      'season_to',
      'includes_lighting',
      'valid_from',
      'valid_to',
      'tenant_id',
      'organization_id',
      'created_at',
      'updated_at',
    ],
    sortFieldMap: {
      renterCategory: 'renter_category',
      validFrom: 'valid_from',
      createdAt: 'created_at',
      updatedAt: 'updated_at',
    },
    // A full export would skip `buildFilters` and with it the record scope.
    export: { enabled: false },
    disableListCache: true,
    buildFilters: async (query: RentalRateListQuery, ctx: CrudCtx): Promise<Where> => {
      const scope = await scopeContract.resolve(ctx)
      const business: Where[] = []
      if (query.placeId) business.push({ place_id: query.placeId })
      if (query.renterCategory) business.push({ renter_category: query.renterCategory })
      return { $and: [scopeWhere(scope, READ_KINDS, FACILITY_COLUMNS), ...business] } as Where
    },
    transformItem: rentalRateListItem,
  },
  actions: {
    create: {
      commandId: 'facilities.rental_rates.create',
      schema: rawBodySchema,
      mapInput: ({ parsed }) => parsed as Record<string, unknown>,
      response: ({ result }) => ({ id: (result as RentalRateCommandResult).entity.id }),
      status: 201,
    },
    update: {
      commandId: 'facilities.rental_rates.update',
      schema: rawBodySchema,
      mapInput: ({ parsed }) => parsed as Record<string, unknown>,
      response: ({ result }) => {
        const { entity } = result as RentalRateCommandResult
        return { ok: true, id: entity.id, updatedAt: entity.updatedAt.toISOString() }
      },
    },
    delete: {
      commandId: 'facilities.rental_rates.delete',
      mapInput: ({ raw }) => ({ id: (raw as { query?: { id?: unknown } }).query?.id }),
      response: () => ({ ok: true }),
    },
  },
})

const buildOpenApi = createCrudOpenApiFactory({ defaultTag: 'Facilities' })

export const openApi = buildOpenApi({
  resourceName: 'Rental rate',
  pluralName: 'Rental rates',
  querySchema: rentalRateListQuerySchema,
  listResponseSchema: createPagedListResponseSchema(rentalRateListItemSchema),
  create: {
    schema: rentalRateCreateSchema,
    description:
      'Creates a rental rate (club administrator): price per 90-minute unit in minor units for a place and a renter category, optionally for a season `MM-DD`–`MM-DD` with lighting. Errors: 400 invalid input, 403 `scope_denied`, 409 `rental_rate_overlap`, 422 `rental_rate_season_invalid`, 422 `facilities_reference_invalid`, 422 `validity_inverted`.',
  },
  update: {
    schema: rentalRateUpdateSchema,
    responseSchema: updateResponseSchema,
    description:
      'Changes a rental rate; the place and the category are fixed. Send the lock token in the platform optimistic-lock header (400 `lock_token_required` without it). Errors: 403 `scope_denied`, 404, 409 `optimistic_lock_conflict`, 409 `rental_rate_overlap`, 422 `rental_rate_season_invalid`, 422 `validity_inverted`.',
  },
  del: {
    schema: rentalRateDeleteSchema,
    description:
      'Soft-deletes a rental rate (`?id=`); send the lock token in the platform optimistic-lock header (400 `lock_token_required` without it). Errors: 403 `scope_denied`, 404, 409 `optimistic_lock_conflict`.',
  },
})
