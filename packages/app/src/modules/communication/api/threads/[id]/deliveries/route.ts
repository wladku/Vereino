// `GET /api/communication/threads/{id}/deliveries` — the delivery status of a message of the thread (the first one
// unless `messageId` names another), per recipient and channel: `sent`, `queued`, `failed` ("not delivered") or
// `skipped` with its coded reason (foundation III REQ-M05, DD-M09; `DeliveryStatusList`). For the thread's author,
// the coordinator of its section and the administrator; never an address. `problems=1` lists failed and skipped only.
import { z } from 'zod'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { errorResponse } from '@/modules/foundation'
import { deliveriesQuerySchema } from '../../../../data/validators'
import { threadDeliveries } from '../../../../services/threads'
import { errorSchema, notFoundResponse, queryOf, requestReader } from '../../../shared'

export const metadata = {
  GET: { requireAuth: true, requireFeatures: ['communication.post'] },
}

const paramsSchema = z.object({ id: z.uuid() })

export async function GET(request: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
  try {
    const { id } = paramsSchema.parse(await context.params)
    const reader = await requestReader(request)
    if (reader instanceof Response) return reader
    const query = deliveriesQuerySchema.parse(queryOf(request))
    const page = await threadDeliveries(reader.viewer, id, {
      messageId: query.messageId,
      page: query.page,
      pageSize: query.pageSize,
      problemsOnly: query.problems === '1',
    })
    return page ? Response.json(page) : await notFoundResponse()
  } catch (error: unknown) {
    return errorResponse(error, 'communication.threads.deliveries')
  }
}

const deliverySchema = z.object({
  id: z.uuid(),
  personId: z.string().nullable(),
  name: z.string().nullable(),
  channel: z.enum(['in_app', 'email']),
  reasons: z.array(z.string()),
  status: z.enum(['queued', 'sent', 'failed', 'skipped']),
  skipReason: z.string().nullable().describe('`unreachable`, `opted_out`, `delivery_disabled`'),
  failureCode: z
    .string()
    .nullable()
    .describe('`transport_unavailable`, `provider_rejected`, `address_invalid`, `render_failed`'),
  attempts: z.number(),
  lastAttemptAt: z.string().nullable(),
})

export const openApi: OpenApiRouteDoc = {
  tag: 'Communication',
  summary: 'Delivery status of a thread message',
  methods: {
    GET: {
      summary: 'List the deliveries of a message',
      query: deliveriesQuerySchema,
      responses: [
        {
          status: 200,
          description: 'A page of deliveries',
          schema: z.object({
            items: z.array(deliverySchema),
            total: z.number(),
            page: z.number(),
            pageSize: z.number(),
            totalPages: z.number(),
          }),
        },
      ],
      errors: [
        { status: 403, description: '`scope_denied`', schema: errorSchema },
        { status: 404, description: 'Not found', schema: errorSchema },
      ],
    },
  },
}
