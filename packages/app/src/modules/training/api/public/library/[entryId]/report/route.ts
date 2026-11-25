// `POST /api/training/public/library/{entryId}/report` (training outlines spec P-O1, DD-O14; REQ-O15; E24-S05, #685):
// anyone may report a public entry, once per client address (kept only as an HMAC), rate-limited. A public report does
// not count towards hiding the entry (that takes reports from three clubs); the operator sees it.
import { z } from 'zod'
import type { EntityManager } from '@mikro-orm/postgresql'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { errorResponse } from '@/modules/foundation'
import { reportSchema } from '../../../../../data/validators'
import { trainingErrors } from '../../../../errors'
import {
  LIBRARY_PUBLIC_REPORT_RATE_LIMIT,
  clientAddress,
  errorSchema,
  libraryOf,
  reportBodySchema,
} from '../../../../library-shared'

export const metadata = {
  POST: {
    requireAuth: false,
    rateLimit: { ...LIBRARY_PUBLIC_REPORT_RATE_LIMIT, keyPrefix: 'training_public_library_report' },
  },
}

const paramsSchema = z.object({ entryId: z.uuid() })

export async function POST(request: Request, context: { params: Promise<{ entryId: string }> }): Promise<Response> {
  try {
    const params = paramsSchema.safeParse(await context.params)
    if (!params.success) return trainingErrors.throw('library_entry_not_found')
    const body: unknown = await request.json().catch(() => ({}))
    const parsed = reportSchema.safeParse({
      ...(body && typeof body === 'object' ? body : {}),
      entryId: params.data.entryId,
    })
    if (!parsed.success) return Response.json({ error: 'Invalid input' }, { status: 400 })
    const container = await createRequestContainer()
    const library = libraryOf({ container })
    await library.requireScope()
    const address = await clientAddress(request)
    const em = container.resolve<EntityManager>('em').fork()
    await em.transactional((tx) =>
      library.report(
        tx,
        parsed.data.entryId,
        { address },
        { reason: parsed.data.reason, note: parsed.data.note },
        { kind: 'public' },
      ),
    )
    return Response.json({ ok: true }, { status: 201 })
  } catch (error: unknown) {
    return errorResponse(error, 'training.public.library.report')
  }
}

export const openApi: OpenApiRouteDoc = {
  tag: 'Training',
  summary: 'Report a public library outline',
  methods: {
    POST: {
      summary: 'Report a public shared outline',
      description: 'Sessionless; one report per client address and entry; rate-limited.',
      requestBody: { contentType: 'application/json', schema: reportBodySchema },
      responses: [{ status: 201, description: 'Reported', schema: z.object({ ok: z.literal(true) }) }],
      errors: [
        { status: 400, description: 'Invalid input', schema: errorSchema },
        { status: 404, description: '`library_entry_not_found`, `library_not_configured`', schema: errorSchema },
        { status: 409, description: '`library_report_exists`', schema: errorSchema },
        { status: 429, description: 'Too many requests', schema: errorSchema },
      ],
    },
  },
}
