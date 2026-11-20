// `/api/groups/age-categories` (people life-cycle spec REQ-L16, DD-L17, *API* rows; #384): the club's age categories
// with their PZPN "U" ranges and the birth years in a season's reference year (GET, everyone who works with groups),
// and a new category with its range in one step (POST, the club administrator: `dictionaries.manage` and the
// `club_admin` grant). The reference year is the calendar year in which the season starts (Q-L25); without `seasonId`
// the season of today, or today's year when no season contains today.
import { z } from 'zod'
import type { CommandBus } from '@open-mercato/shared/lib/commands'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { notFound } from '@open-mercato/shared/lib/crud/errors'
import { resolveTranslations } from '@open-mercato/shared/lib/i18n/server'
import { commandContextForRequest, errorResponse, trustedScopeOf } from '@/modules/foundation'
import type { AgeCategoryCreateResult } from '../../commands/age-categories'
import { ageCategoryCreateSchema, ageCategoryListQuerySchema } from '../../data/validators'
import { listAgeCategoryRanges } from '../../services/age-categories'
import { clubToday } from '../../services/club-clock'
import { errorSchema } from '../shared'

export const metadata = {
  GET: { requireAuth: true, requireFeatures: ['groups.view'] },
  POST: { requireAuth: true, requireFeatures: ['dictionaries.manage'] },
}

const birthYearsSchema = z.object({ from: z.number().int().nullable(), to: z.number().int() })

const itemSchema = z.object({
  entryId: z.uuid(),
  value: z.string(),
  label: z.string(),
  uFrom: z.number().int().nullable(),
  uTo: z.number().int().nullable(),
  birthYears: birthYearsSchema.nullable(),
  updatedAt: z.string().nullable(),
})

const listResponseSchema = z.object({
  items: z.array(itemSchema),
  referenceYear: z.number().int(),
  season: z.object({ id: z.uuid(), name: z.string(), startsOn: z.string() }).nullable(),
})

const createResponseSchema = z.object({
  entryId: z.uuid(),
  value: z.string(),
  label: z.string(),
  uFrom: z.number().int(),
  uTo: z.number().int().nullable(),
  updatedAt: z.string(),
})

export async function GET(request: Request): Promise<Response> {
  try {
    const ctx = await commandContextForRequest(request)
    const scope = ctx ? trustedScopeOf(ctx) : null
    if (!ctx || !scope) return Response.json({ error: 'Unauthorized' }, { status: 401 })
    const query = ageCategoryListQuerySchema.parse(Object.fromEntries(new URL(request.url).searchParams))
    const today = await clubToday(ctx.container, scope)
    const list = await listAgeCategoryRanges(ctx.container, scope, query.seasonId ?? null, today)
    if (!list) {
      const { translate } = await resolveTranslations()
      throw notFound(translate('foundation.errors.not_found', 'Not found'))
    }
    return Response.json({
      ...list,
      items: list.items.map(({ id, ...item }) => ({ entryId: id, ...item })),
    })
  } catch (error: unknown) {
    return errorResponse(error, 'groups.age_categories.list')
  }
}

export async function POST(request: Request): Promise<Response> {
  try {
    const ctx = await commandContextForRequest(request)
    if (!ctx) return Response.json({ error: 'Unauthorized' }, { status: 401 })
    const body: unknown = await request.json().catch(() => null)
    const { result } = await ctx.container
      .resolve<CommandBus>('commandBus')
      .execute<unknown, AgeCategoryCreateResult>('groups.age_categories.create', { input: body, ctx })
    return Response.json(
      {
        entryId: result.entry.id,
        value: result.entry.value,
        label: result.entry.label,
        uFrom: result.entity.uFrom,
        uTo: result.entity.uTo ?? null,
        updatedAt: result.entity.updatedAt.toISOString(),
      },
      { status: 201 },
    )
  } catch (error: unknown) {
    return errorResponse(error, 'groups.age_categories.create')
  }
}

export const openApi: OpenApiRouteDoc = {
  tag: 'Groups',
  summary: 'Age categories with their birth-year ranges',
  methods: {
    GET: {
      summary: 'List the age categories with their "U" ranges and birth years',
      description:
        'The entries of the club’s age category dictionary in the dictionary’s order, each with its PZPN "U" range (`uFrom`, `uTo`; `uTo` null is open, both null when the category has none) and the birth years in the reference year: the year `seasonId`’s season starts, else the year the season of today starts, else today’s year. `updatedAt` is the range’s lock token. Errors: 404 an unknown `seasonId`.',
      query: ageCategoryListQuerySchema,
      responses: [{ status: 200, description: 'The categories and the reference year', schema: listResponseSchema }],
      errors: [
        { status: 401, description: 'Unauthorized', schema: errorSchema },
        { status: 404, description: 'Unknown season', schema: errorSchema },
      ],
    },
    POST: {
      summary: 'Add an age category with its range',
      description:
        'Creates an entry of the club’s age category dictionary (value and label = `label`) and its "U" range in one transaction. Only the club administrator. Errors: 403 `scope_denied`, 409 `age_category_name_taken`, 422 `age_range_inverted` ("U od" above "U do"), 422 `age_categories_missing` (the club has no active age category dictionary).',
      requestBody: { contentType: 'application/json', schema: ageCategoryCreateSchema },
      responses: [{ status: 201, description: 'The new category and its range', schema: createResponseSchema }],
      errors: [
        { status: 400, description: 'Invalid body', schema: errorSchema },
        { status: 403, description: 'scope_denied', schema: errorSchema },
        { status: 409, description: 'age_category_name_taken', schema: errorSchema },
        { status: 422, description: 'age_range_inverted or age_categories_missing', schema: errorSchema },
      ],
    },
  },
}
