// `/api/facilities/rentals` — external rentals of the club's places (facilities spec the `facilities.rentals.create`
// row of *API, Command, and Error Contracts*, B-24; REQ-013; #122): listed with `facilities.rentals.manage` by the club
// administrator and, for their places, the facility attendant (#126) — the B-24 tabs (`tab=active|awaiting_approval`), a status, a place, the reschedule flag and a time
// window for the calendar — with the renter's name and contact decrypted by the query engine; a staff entry runs
// `facilities.rentals.create` and answers 201 with the amount and the deadlines. Status actions live under `[id]/`.
// Since #279 (facilities parity spec phase 5, REQ-R04, REQ-R05): `PUT` corrects a rental (`facilities.rentals.update`,
// DD-R08); the list reads one rental (`id`), a perspective (`view=to_move|unpaid`) and a start window (`from`, `to`),
// and each item carries the payee, the charge state and the request's history fields.
import { z } from 'zod'
import { makeCrudRoute, type CrudCtx } from '@open-mercato/shared/lib/crud/factory'
import { createCrudOpenApiFactory, createPagedListResponseSchema } from '@open-mercato/shared/lib/openapi/crud'
import type { Where } from '@open-mercato/shared/lib/query/types'
import { scopeWhere } from '@vereino/core'
import { scopeContract } from '@/modules/foundation'
import type { RentalCommandResult, RentalUpdateResult } from '../../commands/rentals'
import { PLACE_KINDS } from '../../commands/shared'
import { Rental } from '../../data/entities'
import { rentalCreateSchema, rentalListQuerySchema, rentalUpdateSchema } from '../../data/validators'
import { rentalViewWhere } from '../../lib/rental-record'
import { RENTAL_TABS } from '../../lib/rentals'
import { attachRentalFacts } from '../rental-facts'
import { PLACE_COLUMNS, RENTAL_ENTITY_ID, rentalListItem, rentalListItemSchema, updateResponseSchema } from '../shared'

type RentalListQuery = z.infer<typeof rentalListQuerySchema>

const rawBodySchema = z.object({}).loose()

const createResponseSchema = z.object({
  id: z.uuid(),
  status: z.string(),
  amount: z.number().int(),
  endsAt: z.string(),
  cancellationDeadline: z.string().nullable(),
  paymentDeadline: z.string().nullable(),
  chargeId: z.string().nullable().describe('Only when `payments` provides the charge service (DD-19)'),
})

export const { metadata, GET, POST, PUT } = makeCrudRoute({
  metadata: {
    GET: { requireAuth: true, requireFeatures: ['facilities.rentals.manage'] },
    POST: { requireAuth: true, requireFeatures: ['facilities.rentals.manage'] },
    PUT: { requireAuth: true, requireFeatures: ['facilities.rentals.manage'] },
  },
  orm: {
    entity: Rental,
    idField: 'id',
    orgField: 'organizationId',
    tenantField: 'tenantId',
    softDeleteField: 'deletedAt',
  },
  list: {
    schema: rentalListQuerySchema,
    entityId: RENTAL_ENTITY_ID,
    fields: [
      'id',
      'place_id',
      'renter_type',
      'renter_id',
      'renter_display_name',
      'renter_category',
      'contact_name',
      'contact_phone',
      'contact_email',
      'purpose',
      'requested_via',
      'starts_at',
      'ends_at',
      'units',
      'amount',
      'charge_id',
      'status',
      'cancellation_deadline',
      'payment_deadline',
      'regulations_accepted_at',
      'regulations_accepted_via',
      'email_verified_at',
      'decision_reason',
      'needs_reschedule',
      'notes',
      'tenant_id',
      'organization_id',
      'created_at',
      'updated_at',
    ],
    sortFieldMap: { startsAt: 'starts_at', amount: 'amount', createdAt: 'created_at', updatedAt: 'updated_at' },
    // A full export would skip `buildFilters` and with it the record scope.
    export: { enabled: false },
    disableListCache: true,
    buildFilters: async (query: RentalListQuery, ctx: CrudCtx): Promise<Where> => {
      const scope = await scopeContract.resolve(ctx)
      const business: Where[] = []
      if (query.placeId) business.push({ place_id: query.placeId })
      if (query.status) business.push({ status: query.status })
      if (query.tab) business.push({ status: { $in: [...RENTAL_TABS[query.tab]] } })
      if (query.needsReschedule) business.push({ needs_reschedule: query.needsReschedule === 'true' })
      if (query.endsAfter) business.push({ ends_at: { $gt: query.endsAfter } })
      if (query.startsBefore) business.push({ starts_at: { $lt: query.startsBefore } })
      if (query.id) business.push({ id: query.id })
      if (query.view) business.push(rentalViewWhere(query.view, new Date()) as Where)
      if (query.from) business.push({ starts_at: { $gte: query.from } })
      if (query.to) business.push({ starts_at: { $lt: query.to } })
      return { $and: [scopeWhere(scope, PLACE_KINDS, PLACE_COLUMNS), ...business] } as Where
    },
    transformItem: rentalListItem,
  },
  hooks: {
    afterList: attachRentalFacts,
  },
  actions: {
    create: {
      commandId: 'facilities.rentals.create',
      schema: rawBodySchema,
      mapInput: ({ parsed }) => parsed as Record<string, unknown>,
      response: ({ result }) => {
        const { entity } = result as RentalCommandResult
        return {
          id: entity.id,
          status: entity.status,
          amount: entity.amount,
          endsAt: entity.endsAt.toISOString(),
          cancellationDeadline: entity.cancellationDeadline?.toISOString() ?? null,
          paymentDeadline: entity.paymentDeadline?.toISOString() ?? null,
          chargeId: entity.chargeId ?? null,
        }
      },
      status: 201,
    },
    update: {
      commandId: 'facilities.rentals.update',
      schema: rawBodySchema,
      mapInput: ({ parsed }) => parsed as Record<string, unknown>,
      response: ({ result }) => {
        const { entity } = result as RentalUpdateResult
        return { ok: true, id: entity.id, updatedAt: entity.updatedAt.toISOString() }
      },
    },
  },
})

const buildOpenApi = createCrudOpenApiFactory({ defaultTag: 'Facilities' })

export const openApi = buildOpenApi({
  resourceName: 'Rental',
  pluralName: 'Rentals',
  querySchema: rentalListQuerySchema,
  listResponseSchema: createPagedListResponseSchema(rentalListItemSchema),
  create: {
    schema: rentalCreateSchema,
    responseSchema: createResponseSchema,
    description:
      'Enters an external rental taken by phone, e-mail or in person (club administrator): 1–4 units of 90 minutes in a `reservable_paid` zone of the place, free of sessions, other rentals and closures, for a renter without an active entry ban; stored as `requested` with the amount from the rate and the payment and free-cancellation deadlines (with `payments`, the charge in the same transaction). Errors: 400 invalid input, 403 `scope_denied`, 409 `zone_not_reservable` / `rental_conflict` (with `conflicts`, each with its place and the label staff see: the activity, the renter, the booking purpose and booker, the closure reason) / `place_closed` / `entry_ban_active`, 422 `rental_units_invalid` / `rental_rate_missing` / `rental_renter_invalid` / `facilities_reference_invalid`.',
  },
  update: {
    schema: rentalUpdateSchema,
    responseSchema: updateResponseSchema,
    description:
      'Corrects a rental (DD-R08): the contact, the purpose and the notes; `renterType` + `renterId` assign a registered institution or person to an unregistered rental (its name becomes the name of the record; the entry-ban check runs). The contact, the purpose and the renter only while the rental is `requested` or `confirmed`, the notes in every status; the slot and the amount never change here. Undoable. Send the lock token in the platform optimistic-lock header. Errors: 400 invalid input, 403 `scope_denied`, 404, 409 `rental_closed` / `entry_ban_active` / stale version, 422 `rental_renter_invalid`.',
  },
})
