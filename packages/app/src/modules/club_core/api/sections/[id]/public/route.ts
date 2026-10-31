// `PUT /api/club_core/sections/{id}/public` — `club_core.sections.update_public` (club spec UI table "Public page"
// group, DD-29, glossary *Section*; #29): the section's public switch, slug, description, conditions and the contact
// written for publication. The club administrator, or a coordinator of this section (403 `scope_denied` for another
// section). The fields are read back through the section list. Send the section lock token in the platform
// optimistic-lock header.
import { z } from 'zod'
import type { CommandBus } from '@open-mercato/shared/lib/commands'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { commandContextForRequest, errorResponse } from '@/modules/foundation'
import type { SectionPublicResult } from '../../../../commands/section-public'
import { sectionPublicUpdateSchema } from '../../../../data/validators'
import { errorSchema, updateResponseSchema } from '../../../shared'

export const metadata = {
  PUT: { requireAuth: true, requireFeatures: ['club_core.sections.public_content'] },
}

const paramsSchema = z.object({ id: z.uuid() })

export async function PUT(request: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
  try {
    const { id } = paramsSchema.parse(await context.params)
    const ctx = await commandContextForRequest(request)
    if (!ctx) return Response.json({ error: 'Unauthorized' }, { status: 401 })
    const body: unknown = await request.json().catch(() => ({}))
    const { result } = await ctx.container
      .resolve<CommandBus>('commandBus')
      .execute<unknown, SectionPublicResult>('club_core.sections.update_public', {
        input: { ...(typeof body === 'object' && body !== null ? body : {}), id },
        ctx,
      })
    return Response.json({ ok: true, id: result.entity.id, updatedAt: result.entity.updatedAt.toISOString() })
  } catch (error: unknown) {
    return errorResponse(error, 'club_core.sections.update_public')
  }
}

export const openApi: OpenApiRouteDoc = {
  tag: 'Club core',
  summary: 'Section public page',
  methods: {
    PUT: {
      summary: "Change a section's public page content",
      description:
        '`isPublic`, `publicSlug` (lower-case letters, digits and single hyphens, 3–60 characters, unique in the club), `publicDescription`, `publicConditions`, `publicContactName`, `publicContactEmail`, `publicContactPhone`; blank or null clears a field. A public section needs a slug. Send the section lock token in the platform optimistic-lock header (400 `lock_token_required` without it).',
      requestBody: { contentType: 'application/json', schema: sectionPublicUpdateSchema.omit({ id: true }) },
      responses: [{ status: 200, description: 'Updated', schema: updateResponseSchema }],
      errors: [
        { status: 400, description: 'Invalid input', schema: errorSchema },
        { status: 403, description: '`scope_denied`', schema: errorSchema },
        { status: 404, description: 'Not found', schema: errorSchema },
        { status: 409, description: '`optimistic_lock_conflict`, `public_slug_taken`', schema: errorSchema },
        { status: 422, description: '`section_public_slug_required`', schema: errorSchema },
      ],
    },
  },
}
