// `GET /api/club_core/public/{clubSlug}/sections/{sectionSlug}/materials/{materialId}` — a published material of a
// public section (club spec glossary *Section*, REQ-025; #29): only a file marked public, while the club publishes
// the `materials` block. Read through the platform's `attachmentService` with the exact owner and assignment of the
// material; anything else answers the public 404. Rate-limited per client IP.
import { z } from 'zod'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import {
  PUBLIC_RATE_LIMIT,
  fileResponse,
  notOkResponse,
  publicErrorSchema,
  publicRoute,
  publicSite,
  routeParam,
  type PublicRouteContext,
} from '../../../../../../public-shared'

export const metadata = {
  GET: { requireAuth: false, rateLimit: { ...PUBLIC_RATE_LIMIT, keyPrefix: 'club_core_public_material' } },
}

export async function GET(_request: Request, context: PublicRouteContext): Promise<Response> {
  return publicRoute('club_core.public.material', async () => {
    const clubSlug = await routeParam(context, 'clubSlug')
    const sectionSlug = await routeParam(context, 'sectionSlug')
    const materialId = await routeParam(context, 'materialId')
    const { site, container } = await publicSite()
    const result = await site.material(clubSlug, sectionSlug, materialId)
    return result.status === 'ok' ? fileResponse(container, result.value) : notOkResponse(result)
  })
}

export const openApi: OpenApiRouteDoc = {
  tag: 'Club core',
  summary: 'Public section material',
  methods: {
    GET: {
      summary: 'Download a published material of a public section',
      description: 'Sessionless. The PDF or image file of a material marked public. Rate-limited per client IP.',
      responses: [{ status: 200, description: 'The file', schema: z.unknown() }],
      errors: [
        { status: 404, description: '`public_page_not_found`, `public_page_disabled`', schema: publicErrorSchema },
        { status: 429, description: 'Too many requests', schema: publicErrorSchema },
      ],
    },
  },
}
