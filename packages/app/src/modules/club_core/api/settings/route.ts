// `/api/club_core/settings` — the club's settings with their defaults (foundation spec DD-F16, TEST-F09; club spec
// DD-37). The read is organization-wide (club settings are not person-scoped records); the write is the
// `club_core.settings.update` command, which only the club administrator's scope allows. Since #29 the body may carry
// the club's public slug, description, phone and `publication`; `publication` additionally needs
// `club_core.publication.manage` (club spec API table). The logo is read here and written through `/api/club_core/logo`.
// Since #87 (Q2) the read carries `clubName`, the platform organization's name, and the write may change it: after the
// settings command has authorized the club administrator, the installed `directory.organizations.update` command
// renames the caller's own organization — no Vereino column holds a second name.
import { z } from 'zod'
import type { CommandBus, CommandRuntimeContext } from '@open-mercato/shared/lib/commands'
import type { RbacService } from '@open-mercato/core/modules/auth/services/rbacService'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { commandContextForRequest, errorResponse, trustedScopeOf } from '@/modules/foundation'
import { clubCoreErrors } from '../errors'
import type { ClubSettingsUpdateResult } from '../../commands/settings'
import { throwFieldError } from '../../commands/shared'
import { clubSettingsUpdateSchema } from '../../data/validators'
import {
  CALLED_UP_CHILDREN_VISIBILITY,
  COACH_SETTLEMENT_MODELS,
  ONLINE_FEE_MODES,
  ORDER_SALES_DOCUMENTS,
  declarationKindsPatchSchema,
} from '../../lib/settings'
import { PUBLICATION_BLOCKS } from '../../lib/publication'
import type { ClubCoreSettingsService, ClubPublicSettings, ClubSettingsScope } from '../../services/settings'
import { CLUB_CORE_SETTINGS_SERVICE } from '../../di'

export const metadata = {
  GET: { requireAuth: true, requireFeatures: ['club_core.view'] },
  PUT: { requireAuth: true, requireFeatures: ['club_core.manage'] },
}

const unauthorized = (): Response => Response.json({ error: 'Unauthorized' }, { status: 401 })

const PUBLICATION_FEATURE = 'club_core.publication.manage'

/** The club name as the platform organization stores it (`directory` allows 1–200 characters). */
const clubNameSchema = z.string().trim().min(1).max(200)

/** The name of the caller's own organization, or null when it cannot be read. */
function organizationName(ctx: CommandRuntimeContext, scope: ClubSettingsScope): Promise<string | null> {
  return ctx.container.resolve<ClubCoreSettingsService>(CLUB_CORE_SETTINGS_SERVICE).organizationName(scope)
}

/** `clubName` taken out of the body (the settings command rejects unknown keys); 422 `club_name_invalid` when bad. */
async function splitClubName(body: unknown): Promise<{ settings: unknown; clubName: string | undefined }> {
  if (!body || typeof body !== 'object' || !('clubName' in body)) return { settings: body ?? {}, clubName: undefined }
  const { clubName, ...settings } = body as Record<string, unknown>
  const parsed = clubNameSchema.safeParse(clubName)
  if (!parsed.success) return throwFieldError('club_name_invalid', 'clubName')
  return { settings, clubName: parsed.data }
}

/** 403 `publication_forbidden` unless the caller holds `club_core.publication.manage` (wildcard-aware). */
async function assertMayPublish(ctx: CommandRuntimeContext): Promise<void> {
  const auth = ctx.auth
  const scope = trustedScopeOf(ctx)
  const rbac = ctx.container.resolve<RbacService>('rbacService')
  const allowed =
    !!auth?.sub &&
    !!scope &&
    (await rbac.userHasAllFeatures(auth.sub, [PUBLICATION_FEATURE], {
      tenantId: scope.tenantId,
      organizationId: scope.organizationId,
    }))
  if (!allowed) await clubCoreErrors.throw('publication_forbidden')
}

function publicFields(settings: ClubPublicSettings) {
  return {
    publicSlug: settings.publicSlug,
    publicDescription: settings.publicDescription,
    contactPhone: settings.contactPhone,
    logoAttachmentId: settings.logoAttachmentId,
    logoUrl: settings.logoUrl,
    publication: settings.publication,
  }
}

export async function GET(request: Request): Promise<Response> {
  try {
    const ctx = await commandContextForRequest(request)
    const scope = ctx ? trustedScopeOf(ctx) : null
    if (!ctx || !scope) return unauthorized()
    const settings = await ctx.container.resolve<ClubCoreSettingsService>(CLUB_CORE_SETTINGS_SERVICE).get(scope)
    return Response.json({
      ...settings.values,
      clubName: await organizationName(ctx, scope),
      ...publicFields(settings.publicSettings),
      defaultsApplied: settings.defaultsApplied,
      updatedAt: settings.updatedAt ? settings.updatedAt.toISOString() : null,
    })
  } catch (error: unknown) {
    return errorResponse(error, 'club_core.settings.read')
  }
}

export async function PUT(request: Request): Promise<Response> {
  try {
    const ctx = await commandContextForRequest(request)
    if (!ctx) return unauthorized()
    const body: unknown = await request.json().catch(() => null)
    if (body && typeof body === 'object' && 'publication' in body) await assertMayPublish(ctx)
    const { settings, clubName } = await splitClubName(body)
    const commandBus = ctx.container.resolve<CommandBus>('commandBus')
    const { result } = await commandBus.execute<unknown, ClubSettingsUpdateResult>('club_core.settings.update', {
      input: settings,
      ctx,
    })
    const scope = { tenantId: result.settings.tenantId, organizationId: result.settings.organizationId }
    const currentName = await organizationName(ctx, scope)
    if (clubName !== undefined && clubName !== currentName) {
      await commandBus.execute('directory.organizations.update', {
        input: { id: scope.organizationId, name: clubName },
        ctx,
      })
    }
    return Response.json({
      ...result.values,
      clubName: clubName ?? currentName,
      ...publicFields(result.publicSettings),
      updatedAt: result.settings.updatedAt.toISOString(),
    })
  } catch (error: unknown) {
    return errorResponse(error, 'club_core.settings.update')
  }
}

const settingsResponseSchema = z.object({
  clubName: z.string().nullable().describe("The platform organization's name"),
  ownAccountMinAge: z.number().int(),
  defaultLocale: z.string(),
  timezone: z.string(),
  shortName: z.string().nullable(),
  currency: z.string(),
  declarationKinds: declarationKindsPatchSchema.required(),
  onlineFeeMode: z.enum(ONLINE_FEE_MODES),
  onlineFeePercent: z.number().describe('Percentage of the paid amount, two decimals'),
  onlineFeeFixed: z.number().int().describe('Minor units (grosz) of the club currency'),
  coachSettlementModel: z.enum(COACH_SETTLEMENT_MODELS),
  showCalledUpChildren: z.enum(CALLED_UP_CHILDREN_VISIBILITY),
  orderSalesDocument: z.enum(ORDER_SALES_DOCUMENTS),
  publicSlug: z.string().nullable().describe('Globally unique slug of `/p/{publicSlug}`'),
  publicDescription: z.string().nullable(),
  contactPhone: z.string().nullable(),
  logoAttachmentId: z.string().nullable(),
  logoUrl: z.string().nullable().describe('The logo through the authenticated attachment image route'),
  publication: z.object({
    enabled: z.boolean(),
    blocks: z.object(Object.fromEntries(PUBLICATION_BLOCKS.map((block) => [block, z.boolean()]))),
  }),
  defaultsApplied: z.array(z.string()).optional(),
  updatedAt: z.string().nullable(),
})
const errorSchema = z.object({ error: z.string(), code: z.string().optional() }).loose()

export const openApi: OpenApiRouteDoc = {
  tag: 'Club core',
  summary: 'Club settings',
  methods: {
    GET: {
      summary: 'Read the club settings',
      description:
        'Returns the effective settings: stored values, or their defaults when unset; `defaultsApplied` lists stored values that were invalid and were replaced by their default.',
      responses: [{ status: 200, description: 'Effective settings', schema: settingsResponseSchema }],
      errors: [{ status: 401, description: 'Unauthorized', schema: errorSchema }],
    },
    PUT: {
      summary: 'Update the club settings',
      description:
        'Partial update by the club administrator; `timezone` must be an IANA zone and `ownAccountMinAge` 13–18 (422 with a field error otherwise); `clubName` renames the platform organization of the club; `declarationKinds` may name a subset of the activity types, `shortName: null` clears the short name and `orderSalesDocument` accepts only `none` in 1.0. `publicSlug` (lower-case letters, digits and single hyphens, 3–60 characters; globally unique), `publicDescription`, `contactPhone` and a partial `publication` (`{ enabled?, blocks?: { <block>: boolean } }`, which also needs `club_core.publication.manage`) configure the public page. Send the lock token in the platform optimistic-lock header once the settings exist (the read returns `updatedAt`); without it the save answers 400 `lock_token_required` unless it is the first one.',
      requestBody: {
        contentType: 'application/json',
        schema: clubSettingsUpdateSchema.extend({ clubName: clubNameSchema.optional() }),
      },
      responses: [{ status: 200, description: 'Updated settings', schema: settingsResponseSchema }],
      errors: [
        { status: 400, description: 'Invalid setting value', schema: errorSchema },
        { status: 401, description: 'Unauthorized', schema: errorSchema },
        { status: 403, description: '`scope_denied`, `publication_forbidden`', schema: errorSchema },
        { status: 409, description: '`optimistic_lock_conflict`, `public_slug_taken`', schema: errorSchema },
        {
          status: 422,
          description:
            '`publication_slug_required`, `locale_unsupported`, `timezone_unknown`, `account_age_threshold_out_of_range`, `club_name_invalid`',
          schema: errorSchema,
        },
      ],
    },
  },
}
