// `/api/facilities/entry-bans` — entry bans of the club's places (facilities spec the CRUD row for `/entry-bans`,
// REQ-016; #122): listed and issued with `facilities.incidents.manage` by the club administrator; the facility
// attendant lists the bans of their places, which they enforce at the door, but does not issue or revoke one (the
// club spec gives them an entry ban request, #126); a rental for a banned renter answers 409 `entry_ban_active`. The
// reason is decrypted by the query engine. Since E08-S06 (#126) a ban names its incident and issuer, the list filters
// by `state` and carries the place, subject and issuer names, and `POST …/{id}/revoke` ends a ban.
import { z } from 'zod'
import { makeCrudRoute, type CrudCtx } from '@open-mercato/shared/lib/crud/factory'
import { createCrudOpenApiFactory, createPagedListResponseSchema } from '@open-mercato/shared/lib/openapi/crud'
import type { Where } from '@open-mercato/shared/lib/query/types'
import { scopeWhere } from '@vereino/core'
import { scopeContract } from '@/modules/foundation'
import type { EntryBanCommandResult } from '../../commands/entry-bans'
import { PLACE_KINDS } from '../../commands/shared'
import { EntryBan } from '../../data/entities'
import { entryBanCreateSchema, entryBanListQuerySchema } from '../../data/validators'
import { attachEntryBanNames } from '../records'
import { ENTRY_BAN_ENTITY_ID, PLACE_COLUMNS, entryBanListItem, entryBanListItemSchema } from '../shared'

type EntryBanListQuery = z.infer<typeof entryBanListQuerySchema>

const rawBodySchema = z.object({}).loose()

export const { metadata, GET, POST } = makeCrudRoute({
  metadata: {
    GET: { requireAuth: true, requireFeatures: ['facilities.incidents.manage'] },
    POST: { requireAuth: true, requireFeatures: ['facilities.incidents.manage'] },
  },
  orm: {
    entity: EntryBan,
    idField: 'id',
    orgField: 'organizationId',
    tenantField: 'tenantId',
    softDeleteField: 'deletedAt',
  },
  list: {
    schema: entryBanListQuerySchema,
    entityId: ENTRY_BAN_ENTITY_ID,
    fields: [
      'id',
      'place_id',
      'subject_type',
      'subject_id',
      'starts_on',
      'ends_on',
      'reason',
      'incident_id',
      'issued_by_person_id',
      'revoked_at',
      'tenant_id',
      'organization_id',
      'created_at',
      'updated_at',
    ],
    sortFieldMap: { startsOn: 'starts_on', createdAt: 'created_at', updatedAt: 'updated_at' },
    export: { enabled: false },
    disableListCache: true,
    buildFilters: async (query: EntryBanListQuery, ctx: CrudCtx): Promise<Where> => {
      const scope = await scopeContract.resolve(ctx)
      const business: Where[] = []
      if (query.placeId) business.push({ place_id: query.placeId })
      if (query.subjectId) business.push({ subject_id: query.subjectId })
      if (query.state === 'active') business.push({ revoked_at: null })
      if (query.state === 'revoked') business.push({ revoked_at: { $ne: null } })
      return { $and: [scopeWhere(scope, PLACE_KINDS, PLACE_COLUMNS), ...business] } as Where
    },
    transformItem: entryBanListItem,
  },
  hooks: {
    afterList: attachEntryBanNames,
  },
  actions: {
    create: {
      commandId: 'facilities.entry_bans.create',
      schema: rawBodySchema,
      mapInput: ({ parsed }) => parsed as Record<string, unknown>,
      response: ({ result }) => ({ id: (result as EntryBanCommandResult).entity.id }),
      status: 201,
    },
  },
})

const buildOpenApi = createCrudOpenApiFactory({ defaultTag: 'Facilities' })

export const openApi = buildOpenApi({
  resourceName: 'EntryBan',
  pluralName: 'EntryBans',
  querySchema: entryBanListQuerySchema,
  listResponseSchema: createPagedListResponseSchema(entryBanListItemSchema),
  create: {
    schema: entryBanCreateSchema,
    responseSchema: z.object({ id: z.uuid() }),
    description:
      'Bans an institution or a person from a place (and its sub-places) from `startsOn` to `endsOn` (inclusive; open-ended without it). Errors: 400 invalid input, 403 `scope_denied`, 422 `entry_ban_period_invalid`, 422 `facilities_reference_invalid` (unknown place or subject).',
  },
})
