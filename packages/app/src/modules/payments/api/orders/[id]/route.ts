// `PUT /api/payments/orders/{id}` — a guardian changes a kit order until the deadline (payments spec API row
// `payments.orders.place`; REQ-032, issue #116, M-17): the whole order again (`payments.orders.update`) with the
// order's lock token in the platform optimistic-lock header. The charge follows the new total, never below what was
// paid (409 `order_below_paid`).
import { z } from 'zod'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { commandContextForRequest, errorResponse } from '@/modules/foundation'
import { orderUpdateSchema } from '../../../data/validators'
import { orderCommandResponse, orderWriteErrors, orderWriteResponseSchema } from '../../order-routes'

export const metadata = {
  PUT: { requireAuth: true, requireFeatures: ['payments.orders.place'] },
}

export async function PUT(request: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
  try {
    const { id } = z.object({ id: z.uuid() }).parse(await context.params)
    const ctx = await commandContextForRequest(request)
    if (!ctx) return Response.json({ error: 'Unauthorized' }, { status: 401 })
    const body: unknown = await request.json().catch(() => ({}))
    return await orderCommandResponse(ctx, 'payments.orders.update', { ...(body as Record<string, unknown>), id })
  } catch (error: unknown) {
    return errorResponse(error, 'payments.orders.update')
  }
}

export const openApi: OpenApiRouteDoc = {
  tag: 'Payments',
  summary: 'Change a kit order',
  methods: {
    PUT: {
      summary: 'Change a kit order until the deadline',
      description:
        "The whole order again (`payments.orders.update`). Send the order's `updatedAt` in the platform optimistic-lock header. The charge's amount follows the new total; a total below what was already paid answers 409 `order_below_paid`.",
      requestBody: { contentType: 'application/json', schema: orderUpdateSchema.omit({ id: true }) },
      responses: [{ status: 200, description: 'The changed order', schema: orderWriteResponseSchema }],
      errors: orderWriteErrors,
    },
  },
}
