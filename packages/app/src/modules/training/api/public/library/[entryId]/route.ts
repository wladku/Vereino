// `GET /api/training/public/library/{entryId}` (training outlines spec P-O1, DD-O15; REQ-O13; E24-S05, #685): a public
// entry for anyone, without a session — only `public` and `listed` entries, read through `trainingLibrary` with its
// configured scope (no slug lookup, no club scope). 404 for anything else. Rate-limited per client address.
import { z } from 'zod'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { errorResponse } from '@/modules/foundation'
import { trainingErrors } from '../../../errors'
import { LIBRARY_PUBLIC_RATE_LIMIT, errorSchema, libraryEntrySchema, libraryOf } from '../../../library-shared'

export const metadata = {
  GET: { requireAuth: false, rateLimit: { ...LIBRARY_PUBLIC_RATE_LIMIT, keyPrefix: 'training_public_library' } },
}

const paramsSchema = z.object({ entryId: z.uuid() })

export async function GET(_request: Request, context: { params: Promise<{ entryId: string }> }): Promise<Response> {
  try {
    const params = paramsSchema.safeParse(await context.params)
    if (!params.success) return trainingErrors.throw('library_entry_not_found')
    const container = await createRequestContainer()
    const view = await libraryOf({ container }).view(params.data.entryId, { kind: 'public' })
    if (!view) return trainingErrors.throw('library_entry_not_found')
    return Response.json(view, { headers: { 'Cache-Control': 'public, s-maxage=60' } })
  } catch (error: unknown) {
    return errorResponse(error, 'training.public.library.read')
  }
}

export const openApi: OpenApiRouteDoc = {
  tag: 'Training',
  summary: 'Public library outline',
  methods: {
    GET: {
      summary: 'Read a public shared outline',
      description: 'Sessionless. Only outlines shared with the public; no rating controls, no personal data.',
      responses: [{ status: 200, description: 'The entry', schema: libraryEntrySchema }],
      errors: [
        { status: 404, description: '`library_entry_not_found`, `library_not_configured`', schema: errorSchema },
        { status: 429, description: 'Too many requests', schema: errorSchema },
      ],
    },
  },
}
