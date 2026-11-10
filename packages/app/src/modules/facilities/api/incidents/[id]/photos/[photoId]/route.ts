// `GET /api/facilities/incidents/{id}/photos/{photoId}` — one photo of an incident (B-27, M-12; #126), for callers with
// `facilities.log.write` whose grant covers the incident's place (the attendant's places, or the club administrator):
// 403 `scope_denied` otherwise, 404 for an unknown incident or photo. Served inline with the type its bytes were checked
// as, never cached by a shared cache.
import { z } from 'zod'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { commandContextForRequest, errorResponse, scopeContract, trustedScopeOf } from '@/modules/foundation'
import { readIncidentPhoto } from '../../../../../services/incident-photos'
import { errorSchema } from '../../../../shared'

export const metadata = {
  GET: { requireAuth: true, requireFeatures: ['facilities.log.write'] },
}

const paramsSchema = z.object({ id: z.uuid(), photoId: z.uuid() })

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string; photoId: string }> },
): Promise<Response> {
  try {
    const params = paramsSchema.safeParse(await context.params)
    if (!params.success) return Response.json({ error: 'Not found' }, { status: 404 })
    const ctx = await commandContextForRequest(request)
    const scope = ctx ? trustedScopeOf(ctx) : null
    if (!ctx || !scope || !ctx.auth) return Response.json({ error: 'Unauthorized' }, { status: 401 })
    const photo = await readIncidentPhoto(ctx.container, scope, await scopeContract.resolve(ctx), ctx.auth, {
      incidentId: params.data.id,
      photoId: params.data.photoId,
    })
    if (!photo) return Response.json({ error: 'Not found' }, { status: 404 })
    return new Response(new Uint8Array(photo.buffer), {
      headers: {
        'Content-Type': photo.mimeType,
        'Content-Disposition': `inline; filename="${encodeURIComponent(photo.fileName)}"`,
        'Content-Length': String(photo.buffer.length),
        'Cache-Control': 'private, no-store',
        'X-Content-Type-Options': 'nosniff',
      },
    })
  } catch (error: unknown) {
    return errorResponse(error, 'facilities.incidents.photos.read')
  }
}

export const openApi: OpenApiRouteDoc = {
  tag: 'Facilities',
  summary: 'Incident photo',
  methods: {
    GET: {
      summary: 'Read one photo of an incident',
      description:
        'The photo bytes (PNG, JPEG or WebP), for the facility attendant at the incident’s place and the club administrator.',
      responses: [{ status: 200, description: 'The photo', schema: z.unknown() }],
      errors: [
        { status: 401, description: 'Unauthorized', schema: errorSchema },
        { status: 403, description: '`scope_denied` (another place)', schema: errorSchema },
        { status: 404, description: 'Unknown incident or photo', schema: errorSchema },
      ],
    },
  },
}
