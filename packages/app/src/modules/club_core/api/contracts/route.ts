// `/api/club_core/contracts` — the club's contracts (club spec API table, DD-09, REQ-021; README B-07; #96): the
// list is the club administrator's, with a coach's rates decrypted by the query engine and the party's name added;
// `?kind=` and `?partyId=` filter it. Create, update and delete run the `club_core` commands (an overlapping active
// contract of the same kind for the party → 409 `contract_overlap`).
import { z } from 'zod'
import { makeCrudRoute, type CrudCtx } from '@open-mercato/shared/lib/crud/factory'
import { createCrudOpenApiFactory, createPagedListResponseSchema } from '@open-mercato/shared/lib/openapi/crud'
import type { Where } from '@open-mercato/shared/lib/query/types'
import { scopeWhere } from '@vereino/core'
import { scopeContract } from '@/modules/foundation'
import { Contract } from '../../data/entities'
import {
  contractCreateSchema,
  contractDeleteSchema,
  contractListQuerySchema,
  contractUpdateSchema,
} from '../../data/validators'
import { partyNames } from '../../services/contracts'
import {
  CONTRACT_LIST_ENTITY_ID,
  STRUCTURE_COLUMNS,
  STRUCTURE_READ_KINDS,
  contractListItem,
  contractListItemSchema,
  updateResponseSchema,
  type ContractListItem,
} from '../shared'

type ContractListQuery = z.infer<typeof contractListQuerySchema>

const rawBodySchema = z.object({}).loose()

type CommandResult = { entity: Contract }

/** Adds the party's name to the rows the scope filter already admitted (one read per party kind and page). */
async function attachPartyNames(payload: { items?: unknown[] }, ctx: CrudCtx): Promise<void> {
  const items = (payload.items ?? []) as ContractListItem[]
  const tenantId = ctx.auth?.tenantId
  const organizationId = ctx.selectedOrganizationId ?? ctx.auth?.orgId
  if (items.length === 0 || !tenantId || !organizationId) return
  const em = ctx.container.resolve<Parameters<typeof partyNames>[1]>('em').fork()
  const parties = items.flatMap((item) =>
    item.partyType && item.partyId ? [{ partyType: item.partyType, partyId: item.partyId }] : [],
  )
  const names = await partyNames(ctx.container, em, { tenantId, organizationId }, parties)
  for (const item of items) item.partyName = item.partyId ? (names.get(item.partyId) ?? null) : null
}

export const { metadata, GET, POST, PUT, DELETE } = makeCrudRoute({
  metadata: {
    GET: { requireAuth: true, requireFeatures: ['club_core.contracts.manage'] },
    POST: { requireAuth: true, requireFeatures: ['club_core.contracts.manage'] },
    PUT: { requireAuth: true, requireFeatures: ['club_core.contracts.manage'] },
    DELETE: { requireAuth: true, requireFeatures: ['club_core.contracts.manage'] },
  },
  orm: {
    entity: Contract,
    idField: 'id',
    orgField: 'organizationId',
    tenantField: 'tenantId',
    softDeleteField: 'deletedAt',
  },
  list: {
    schema: contractListQuerySchema,
    entityId: CONTRACT_LIST_ENTITY_ID,
    fields: [
      'id',
      'party_type',
      'party_id',
      'kind',
      'valid_from',
      'valid_to',
      'terms',
      'tenant_id',
      'organization_id',
      'created_at',
      'updated_at',
    ],
    sortFieldMap: {
      validFrom: 'valid_from',
      validTo: 'valid_to',
      kind: 'kind',
      createdAt: 'created_at',
      updatedAt: 'updated_at',
    },
    // A full export would skip `buildFilters` and with it the record scope.
    export: { enabled: false },
    disableListCache: true,
    buildFilters: async (query: ContractListQuery, ctx: CrudCtx): Promise<Where> => {
      const scope = await scopeContract.resolve(ctx)
      const business: Where = {}
      if (query.kind) business.kind = query.kind
      if (query.partyId) business.party_id = query.partyId
      return { $and: [scopeWhere(scope, STRUCTURE_READ_KINDS, STRUCTURE_COLUMNS), business] } as Where
    },
    transformItem: contractListItem,
  },
  hooks: {
    afterList: attachPartyNames,
  },
  actions: {
    create: {
      commandId: 'club_core.contracts.create',
      schema: rawBodySchema,
      mapInput: ({ parsed }) => parsed as Record<string, unknown>,
      response: ({ result }) => ({ id: (result as CommandResult).entity.id }),
      status: 201,
    },
    update: {
      commandId: 'club_core.contracts.update',
      schema: rawBodySchema,
      mapInput: ({ parsed }) => parsed as Record<string, unknown>,
      response: ({ result }) => {
        const { entity } = result as CommandResult
        return { ok: true, id: entity.id, updatedAt: entity.updatedAt.toISOString() }
      },
    },
    delete: {
      commandId: 'club_core.contracts.delete',
      mapInput: ({ raw }) => ({ id: (raw as { query?: { id?: unknown } }).query?.id }),
      response: () => ({ ok: true }),
    },
  },
})

const buildOpenApi = createCrudOpenApiFactory({ defaultTag: 'Club core' })

export const openApi = buildOpenApi({
  resourceName: 'Contract',
  pluralName: 'Contracts',
  querySchema: contractListQuerySchema,
  listResponseSchema: createPagedListResponseSchema(contractListItemSchema),
  create: {
    schema: contractCreateSchema,
    description:
      "Creates a contract (club administrator). A `coach` contract names a person and carries every rate of the club's settlement model in grosz (`units_per_contract`: `baseMonthly`, `unitRate`, `matchRate`, `travelRate`; `fixed_base_adjusted`: `baseMonthly`, `sessionAmount`, `tripAmount`); the other kinds store no terms. Errors: 400 invalid input, 403 `scope_denied`, 409 `contract_overlap`, 422 `contract_party_invalid`, `contract_terms_invalid`, `validity_inverted`.",
  },
  update: {
    schema: contractUpdateSchema,
    responseSchema: updateResponseSchema,
    description:
      'Changes the period and terms of a contract (its party and kind are fixed); send the lock token in the platform optimistic-lock header (400 `lock_token_required` without it). Errors: 403 `scope_denied`, 404, 409 `optimistic_lock_conflict`, `contract_overlap`, 422 `contract_terms_invalid`, `validity_inverted`.',
  },
  del: {
    schema: contractDeleteSchema,
    description:
      'Soft-deletes a contract (`?id=`); send the lock token in the platform optimistic-lock header (400 `lock_token_required` without it). Errors: 403 `scope_denied`, 404, 409 `optimistic_lock_conflict`.',
  },
})
