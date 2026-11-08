// The pieces shared by the guardian's order routes (payments spec API rows `/api/payments/orders`, `/order-links`,
// `/public/order-campaigns`; REQ-032, issue #116, M-16, M-17, M-19): running an order command, its response, the
// sessionless request context, and the OpenAPI schemas of the order form.
import { z } from 'zod'
import type { CommandBus, CommandRuntimeContext } from '@open-mercato/shared/lib/commands'
import type { OrderCommandResult } from '../commands/orders'
import { CAMPAIGN_STATUSES, PRODUCT_KINDS } from '../lib/order-campaigns'
import { errorSchema } from './shared'

export type OrderCommandId = 'payments.orders.place' | 'payments.orders.update' | 'payments.orders.cancel'

/** Runs an order command and answers its result (201 for a placed order). */
export async function orderCommandResponse(
  ctx: CommandRuntimeContext,
  commandId: OrderCommandId,
  input: Record<string, unknown>,
): Promise<Response> {
  const { result } = await ctx.container
    .resolve<CommandBus>('commandBus')
    .execute<unknown, OrderCommandResult>(commandId, { input, ctx })
  return Response.json(
    {
      ok: true,
      orderId: result.entity.id,
      chargeId: result.charge.id,
      status: result.entity.status,
      total: result.total,
      updatedAt: result.entity.updatedAt.toISOString(),
      actingRole: result.actingRole,
    },
    { status: commandId === 'payments.orders.place' ? 201 : 200 },
  )
}

/** The context of a sessionless route: no session, the link alone names the tenant and organization. */
export function sessionlessContext(container: CommandRuntimeContext['container'], request: Request) {
  return {
    container,
    auth: null,
    organizationScope: null,
    selectedOrganizationId: null,
    organizationIds: null,
    request,
  } satisfies CommandRuntimeContext
}

/** A personal page: never kept by a shared cache. */
export function noStore(response: Response): Response {
  response.headers.set('Cache-Control', 'no-store')
  return response
}

export const orderWriteResponseSchema = z.object({
  ok: z.literal(true),
  orderId: z.uuid(),
  chargeId: z.uuid(),
  status: z.string(),
  total: z.number().int().describe('Grosz'),
  updatedAt: z.string().describe("The order's new lock token"),
  actingRole: z.string(),
})

const stateSchema = z.enum(['not_ordered', 'to_pay', 'paid', 'picked_up'])

export const orderFormSchema = z.object({
  campaign: z.object({
    id: z.uuid(),
    name: z.string(),
    description: z.string().nullable(),
    closesOn: z.string(),
    paymentDueOn: z.string(),
    status: z.enum(CAMPAIGN_STATUSES),
    ordersOpen: z.boolean().describe('False once the campaign is closed or its deadline passed: "Orders are closed"'),
    askPrintName: z.boolean(),
    askPrintNumber: z.boolean(),
    notesLabel: z.string().nullable(),
  }),
  products: z.array(
    z.object({
      id: z.uuid(),
      name: z.string(),
      kind: z.enum(PRODUCT_KINDS),
      componentProductIds: z.array(z.string()),
      sizesChild: z.array(z.string()),
      sizesAdult: z.array(z.string()),
      priceChild: z.number().int(),
      priceAdult: z.number().int().nullable(),
      requiredAnswer: z.boolean(),
    }),
  ),
  children: z.array(
    z.object({
      personId: z.uuid(),
      firstName: z.string(),
      lastName: z.string(),
      groupId: z.uuid(),
      groupName: z.string().nullable(),
      defaultPrintName: z.string(),
      takenNumbers: z.array(z.number().int()).describe('Numbers other children of the group already took'),
    }),
  ),
  orders: z.array(
    z.object({
      id: z.uuid(),
      participantPersonId: z.uuid(),
      setSelected: z.boolean(),
      choices: z.record(z.string(), z.string()),
      printName: z.string().nullable(),
      printNumber: z.number().int().nullable(),
      contactEmail: z.string().nullable(),
      contactPhone: z.string().nullable(),
      notes: z.string().nullable(),
      lines: z.array(
        z.object({
          productId: z.string(),
          productName: z.string(),
          size: z.string().nullable(),
          sizes: z.string().nullable(),
          unitPrice: z.number().int(),
        }),
      ),
      total: z.number().int(),
      paid: z.number().int(),
      remaining: z.number().int(),
      chargeId: z.uuid(),
      state: stateSchema,
      updatedAt: z.string().describe('The lock token of a change or a cancellation'),
    }),
  ),
  contact: z.object({ email: z.string().nullable(), phone: z.string().nullable() }),
  transfer: z
    .object({ bankAccount: z.string().nullable(), recipient: z.string().nullable(), payerCode: z.string() })
    .nullable(),
})

export const myOrderCampaignSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  description: z.string().nullable(),
  closesOn: z.string(),
  paymentDueOn: z.string(),
  status: z.enum(CAMPAIGN_STATUSES),
  ordersOpen: z.boolean(),
  children: z.array(
    z.object({
      personId: z.uuid(),
      firstName: z.string(),
      groupName: z.string().nullable(),
      state: stateSchema,
      orderId: z.string().nullable(),
      total: z.number().int(),
      remaining: z.number().int(),
    }),
  ),
})

/** The errors every order write may answer. */
export const orderWriteErrors = [
  { status: 400, description: 'Validation failed, `lock_token_required`', schema: errorSchema },
  {
    status: 403,
    description: '`order_child_not_in_campaign`, `scope_denied`, `payments_minor` (R10)',
    schema: errorSchema,
  },
  { status: 404, description: '`order_campaign_not_found`, `order_not_found`, not found', schema: errorSchema },
  {
    status: 409,
    description:
      '`campaign_closed` (deadline passed or the campaign closed), `order_exists`, `order_below_paid`, `order_cancel_paid`, `optimistic_lock_conflict`',
    schema: errorSchema,
  },
  {
    status: 422,
    description:
      '`order_answer_missing`, `order_answer_invalid`, `order_set_size_missing`, `order_empty`, `order_print_number_taken` (with `fieldErrors`)',
    schema: errorSchema,
  },
]
