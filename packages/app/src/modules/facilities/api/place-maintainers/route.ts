// `/api/facilities/place-maintainers` — the people who maintain each place (facilities spec the CRUD row, DD-36;
// REQ-022; B-27 "Maintainers" tab; #128): listed, assigned and removed by the club administrator with
// `facilities.manage`. Assigning or removing commits the row, then `people.roleSync.syncPerson` adds or removes the
// derived role `vereino_maintenance_planner`. Removing a row ends the person's maintenance scope for the place at once.
import { z } from 'zod'
import { makeCrudRoute, type CrudCtx } from '@open-mercato/shared/lib/crud/factory'
import { createCrudOpenApiFactory, createPagedListResponseSchema } from '@open-mercato/shared/lib/openapi/crud'
import type { Where } from '@open-mercato/shared/lib/query/types'
import { scopeWhere } from '@vereino/core'
import { scopeContract } from '@/modules/foundation'
import type { PlaceMaintainerCommandResult } from '../../commands/maintenance'
import { READ_KINDS } from '../../commands/shared'
import { PlaceMaintainer } from '../../data/entities'
import {
  placeMaintainerCreateSchema,
  placeMaintainerDeleteSchema,
  placeMaintainerListQuerySchema,
} from '../../data/validators'
import {
  PLACE_MAINTAINER_ENTITY_ID,
  attachMaintainerNames,
  placeMaintainerListItem,
  placeMaintainerListItemSchema,
} from '../maintenance-records'
import { FACILITY_COLUMNS } from '../shared'

type MaintainerListQuery = z.infer<typeof placeMaintainerListQuerySchema>

const rawBodySchema = z.object({}).loose()

export const { metadata, GET, POST, DELETE } = makeCrudRoute({
  metadata: {
    GET: { requireAuth: true, requireFeatures: ['facilities.manage'] },
    POST: { requireAuth: true, requireFeatures: ['facilities.manage'] },
    DELETE: { requireAuth: true, requireFeatures: ['facilities.manage'] },
  },
  orm: {
    entity: PlaceMaintainer,
    idField: 'id',
    orgField: 'organizationId',
    tenantField: 'tenantId',
    softDeleteField: 'deletedAt',
  },
  list: {
    schema: placeMaintainerListQuerySchema,
    entityId: PLACE_MAINTAINER_ENTITY_ID,
    fields: ['id', 'place_id', 'person_id', 'assigned_at', 'tenant_id', 'organization_id', 'created_at', 'updated_at'],
    sortFieldMap: { createdAt: 'created_at' },
    export: { enabled: false },
    disableListCache: true,
    buildFilters: async (query: MaintainerListQuery, ctx: CrudCtx): Promise<Where> => {
      const scope = await scopeContract.resolve(ctx)
      const business: Where[] = []
      if (query.placeId) business.push({ place_id: query.placeId })
      if (query.personId) business.push({ person_id: query.personId })
      return { $and: [scopeWhere(scope, READ_KINDS, FACILITY_COLUMNS), ...business] } as Where
    },
    transformItem: placeMaintainerListItem,
  },
  hooks: {
    afterList: attachMaintainerNames,
  },
  actions: {
    create: {
      commandId: 'facilities.place_maintainers.create',
      schema: rawBodySchema,
      mapInput: ({ parsed }) => parsed as Record<string, unknown>,
      response: ({ result }) => ({ id: (result as PlaceMaintainerCommandResult).entity.id }),
      status: 201,
    },
    delete: {
      commandId: 'facilities.place_maintainers.delete',
      mapInput: ({ raw }) => ({ id: (raw as { query?: { id?: unknown } }).query?.id }),
      response: () => ({ ok: true }),
    },
  },
})

const buildOpenApi = createCrudOpenApiFactory({ defaultTag: 'Facilities' })

export const openApi = buildOpenApi({
  resourceName: 'PlaceMaintainer',
  pluralName: 'PlaceMaintainers',
  querySchema: placeMaintainerListQuerySchema,
  listResponseSchema: createPagedListResponseSchema(placeMaintainerListItemSchema),
  create: {
    schema: placeMaintainerCreateSchema,
    responseSchema: z.object({ id: z.uuid() }),
    description:
      'Assigns a person to maintain a place (club administrator); the person then holds the derived role `vereino_maintenance_planner` (`facilities.maintenance.manage`) for the places assigned to them. Errors: 400 invalid input, 403 `scope_denied`, 409 `maintainer_exists`, 422 `maintainer_person_invalid`, 422 `facilities_reference_invalid` (unknown place).',
  },
  del: {
    schema: placeMaintainerDeleteSchema,
    description:
      'Removes an assignment (`?id=`); the person loses the maintenance scope for that place at once, and the derived role with their last place. Errors: 403 `scope_denied`, 404.',
  },
})
