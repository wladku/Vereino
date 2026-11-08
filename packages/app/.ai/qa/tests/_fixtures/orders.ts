// Fixtures of the order campaign tests (payments spec phase 4 step 9, REQ-032; issue #115 E07-S08): the campaign
// routes, and — until guardians place orders (E07-S09) — a submitted order with its `order` charge and lines written
// straight into the test database, the way E07-S09's command will store them.
import { randomUUID } from 'node:crypto'
import { expect, type APIRequestContext } from '@playwright/test'
import { withClient } from '@open-mercato/core/helpers/integration/dbFixtures'
import { OPTIMISTIC_LOCK_HEADER, call } from './club'

export type CampaignBody = {
  error?: string
  code?: string
  fieldErrors?: Record<string, string>
  details?: { path?: (string | number)[]; message?: string }[]
  id?: string
  status?: string
  updatedAt?: string
}

export type CampaignProduct = {
  id: string
  name: string
  kind: 'item' | 'set'
  componentProductIds: string[]
  sizesChild: string[]
  sizesAdult: string[]
  priceChild: number
  priceAdult: number | null
  requiredAnswer: boolean
  used: boolean
}

export type CampaignDetail = {
  id: string
  name: string
  sectionId: string
  groups: { id: string; name: string | null }[]
  closesOn: string
  paymentDueOn: string
  status: string
  nextAction: string | null
  products: CampaignProduct[]
  kpis: { orders: number; children: number; missing: number; value: number; paid: number; handedOver: number }
  updatedAt: string
}

export async function postCampaign(request: APIRequestContext, token: string, data: Record<string, unknown>) {
  return call<CampaignBody>(request, 'POST', '/api/payments/order-campaigns', token, { data })
}

export async function putCampaign(
  request: APIRequestContext,
  token: string,
  lock: string,
  data: Record<string, unknown>,
) {
  return call<CampaignBody>(request, 'PUT', '/api/payments/order-campaigns', token, {
    data,
    headers: { [OPTIMISTIC_LOCK_HEADER]: lock },
  })
}

export async function getCampaign(request: APIRequestContext, token: string, id: string): Promise<CampaignDetail> {
  const result = await call<CampaignDetail>(request, 'GET', `/api/payments/order-campaigns/${id}`, token)
  expect(result.status, `GET /api/payments/order-campaigns/${id} ${JSON.stringify(result.body)}`).toBe(200)
  return result.body as CampaignDetail
}

export async function transition(
  request: APIRequestContext,
  token: string,
  id: string,
  action: string,
  lock: string | null,
) {
  return call<CampaignBody>(request, 'POST', `/api/payments/order-campaigns/${id}/${action}`, token, {
    data: {},
    headers: lock ? { [OPTIMISTIC_LOCK_HEADER]: lock } : {},
  })
}

/** The whole form of a stored campaign again, products by id: the body an update sends. */
export function formOf(detail: CampaignDetail): Record<string, unknown> {
  return {
    id: detail.id,
    name: detail.name,
    sectionId: detail.sectionId,
    groupIds: detail.groups.map((group) => group.id),
    closesOn: detail.closesOn,
    paymentDueOn: detail.paymentDueOn,
    askPrintName: true,
    askPrintNumber: true,
    products: detail.products.map((product) => ({
      id: product.id,
      key: product.id,
      name: product.name,
      kind: product.kind,
      componentKeys: product.componentProductIds,
      sizesChild: product.sizesChild,
      sizesAdult: product.sizesAdult,
      priceChild: product.priceChild,
      priceAdult: product.priceAdult,
      requiredAnswer: product.requiredAnswer,
    })),
  }
}

export type SeededLine = {
  productId: string
  size?: string | null
  componentSizes?: Record<string, string> | null
  unitPrice: number
}

/**
 * A submitted order of `participantPersonId` with its open `order` charge (payer = the person ordering, due on the
 * payment deadline) and lines at the given prices, written in one transaction.
 */
export async function seedOrder(
  scope: { tenantId: string; organizationId: string },
  input: {
    campaignId: string
    participantPersonId: string
    orderedByPersonId: string
    paymentDueOn: string
    printName?: string | null
    printNumber?: number | null
    lines: SeededLine[]
  },
): Promise<{ orderId: string; chargeId: string; total: number }> {
  const orderId = randomUUID()
  const chargeId = randomUUID()
  const total = input.lines.reduce((sum, line) => sum + line.unitPrice, 0)
  await withClient(async (client) => {
    await client.query('begin')
    try {
      await client.query(
        `insert into payments_charges (id, tenant_id, organization_id, created_at, updated_at, source_type, source_id,
           person_id, payer_person_id, description, amount, due_date, status)
         values ($1, $2, $3, now(), now(), 'order', $4, $5, $6, 'Kit order', $7, $8, 'open')`,
        [
          chargeId,
          scope.tenantId,
          scope.organizationId,
          orderId,
          input.participantPersonId,
          input.orderedByPersonId,
          total,
          input.paymentDueOn,
        ],
      )
      await client.query(
        `insert into payments_orders (id, tenant_id, organization_id, created_at, updated_at, campaign_id,
           participant_person_id, ordered_by_person_id, print_name, print_number, status, charge_id, submitted_via)
         values ($1, $2, $3, now(), now(), $4, $5, $6, $7, $8, 'submitted', $9, 'app')`,
        [
          orderId,
          scope.tenantId,
          scope.organizationId,
          input.campaignId,
          input.participantPersonId,
          input.orderedByPersonId,
          input.printName ?? null,
          input.printNumber ?? null,
          chargeId,
        ],
      )
      for (const line of input.lines) {
        await client.query(
          `insert into payments_order_lines (id, tenant_id, organization_id, created_at, updated_at, order_id,
             product_id, size, component_sizes, unit_price)
           values ($1, $2, $3, now(), now(), $4, $5, $6, $7, $8)`,
          [
            randomUUID(),
            scope.tenantId,
            scope.organizationId,
            orderId,
            line.productId,
            line.size ?? null,
            line.componentSizes ? JSON.stringify(line.componentSizes) : null,
            line.unitPrice,
          ],
        )
      }
      await client.query('commit')
    } catch (error) {
      await client.query('rollback')
      throw error
    }
  })
  return { orderId, chargeId, total }
}

/** The stored unit prices of an order's lines, by product. */
export async function linePrices(orderId: string): Promise<Record<string, number>> {
  const result = await withClient((client) =>
    client.query<{ product_id: string; unit_price: number }>(
      'select product_id, unit_price from payments_order_lines where order_id = $1',
      [orderId],
    ),
  )
  return Object.fromEntries(result.rows.map((row) => [row.product_id, row.unit_price]))
}
