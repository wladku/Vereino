// `GET /api/club_core/public/{clubSlug}/sections/{sectionSlug}` — the public section page (club spec API table, DD-28,
// DD-29, REQ-025; #29): the section's name and effective logo and the blocks the club publishes — `description`,
// `conditions`, `materials` and `contact` from `club_core`, and the blocks of optional providers of other modules. A
// block the club disabled is absent from the response. An unknown slug, a section that is not public, inactive or of
// another club all answer the same 404 `public_page_not_found`; rate-limited per client IP.
import { z } from 'zod'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import {
  PUBLIC_RATE_LIMIT,
  jsonResponse,
  notOkResponse,
  publicErrorSchema,
  publicLogoSchema,
  publicRoute,
  publicSite,
  routeParam,
  type PublicRouteContext,
} from '../../../../public-shared'

export const metadata = {
  GET: { requireAuth: false, rateLimit: { ...PUBLIC_RATE_LIMIT, keyPrefix: 'club_core_public_section' } },
}

export async function GET(_request: Request, context: PublicRouteContext): Promise<Response> {
  return publicRoute('club_core.public.section', async () => {
    const clubSlug = await routeParam(context, 'clubSlug')
    const sectionSlug = await routeParam(context, 'sectionSlug')
    const { site } = await publicSite()
    const result = await site.sectionPage(clubSlug, sectionSlug)
    return result.status === 'ok' ? jsonResponse(result.value) : notOkResponse(result)
  })
}

const textBlock = z.object({ text: z.string() })

const sectionPageSchema = z.object({
  club: z.object({ name: z.string(), slug: z.string(), logo: publicLogoSchema }),
  section: z.object({ name: z.string(), slug: z.string(), logo: publicLogoSchema }),
  blocks: z
    .object({
      description: textBlock.optional().describe('With `description_schedule`'),
      conditions: textBlock.optional().describe('With `conditions`'),
      materials: z
        .object({
          items: z.array(
            z.object({
              id: z.uuid(),
              title: z.string(),
              fileName: z.string(),
              mimeType: z.string(),
              fileSize: z.number().int(),
              url: z.string(),
            }),
          ),
        })
        .optional()
        .describe('With `materials`: the files marked public'),
      contact: z
        .object({ name: z.string().nullable(), email: z.string().nullable(), phone: z.string().nullable() })
        .optional()
        .describe('With `contact`: the contact written for publication'),
    })
    .catchall(z.unknown())
    .describe('Only the blocks the club publishes; other keys come from optional providers (DD-28)'),
})

export const openApi: OpenApiRouteDoc = {
  tag: 'Club core',
  summary: 'Public section page',
  methods: {
    GET: {
      summary: 'Read a public section page',
      description:
        'Sessionless. A public, active section of the club with the blocks the club publishes; disabled blocks are absent. Rate-limited per client IP.',
      responses: [{ status: 200, description: 'The section page', schema: sectionPageSchema }],
      errors: [
        { status: 404, description: '`public_page_not_found`, `public_page_disabled`', schema: publicErrorSchema },
        { status: 429, description: 'Too many requests', schema: publicErrorSchema },
      ],
    },
  },
}
