// Client-side pieces of the order campaign pages (B-30…B-32; payments spec REQ-032; issue #115): row and detail
// types as the API returns them, links, the stage badge colours and the option loaders of the form. Authorization
// stays on the routes and commands.
import { fetchCrudList } from '@open-mercato/ui/backend/utils/crud'
import type { CampaignAction, CampaignKpis, CampaignStatus, ProductKind } from '../../lib/order-campaigns'

export const ORDERS_HREF = '/backend/payments/orders'

export function campaignHref(id: string): string {
  return `${ORDERS_HREF}/${encodeURIComponent(id)}`
}

export function campaignApi(id: string, path = ''): string {
  return `/api/payments/order-campaigns/${encodeURIComponent(id)}${path}`
}

export const STAGE_VARIANTS: Record<CampaignStatus, 'success' | 'warning' | 'error' | 'info' | 'neutral'> = {
  draft: 'neutral',
  open: 'info',
  closed: 'warning',
  ordered: 'warning',
  delivered: 'success',
  completed: 'neutral',
}

export type CampaignRow = {
  id: string
  name: string | null
  sectionId: string | null
  sectionName?: string | null
  groupIds: string[]
  groupNames?: string[]
  closesOn: string | null
  paymentDueOn: string | null
  status: CampaignStatus | null
  kpis?: CampaignKpis
  updatedAt: string | null
}

export type CampaignProduct = {
  id: string
  name: string
  kind: ProductKind
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
  description: string | null
  sectionId: string
  sectionName: string | null
  groups: { id: string; name: string | null }[]
  closesOn: string
  paymentDueOn: string
  status: CampaignStatus
  nextAction: CampaignAction | null
  askPrintName: boolean
  askPrintNumber: boolean
  notesLabel: string | null
  supplierName: string | null
  products: CampaignProduct[]
  kpis: CampaignKpis
  updatedAt: string
}

type PersonName = { firstName: string; lastName: string } | null

export type CampaignOrderRow = {
  id: string
  participant: PersonName
  groupName: string | null
  orderedBy: PersonName
  printName: string | null
  printNumber: number | null
  lines: { productId: string; productName: string; size: string | null; sizes: string | null; unitPrice: number }[]
  total: number
  paid: number
  remaining: number
  chargeId: string
  chargeStatus: string | null
  handedOver: boolean
}

export type MissingChildRow = { personId: string; participant: PersonName; groupId: string; groupName: string | null }

export type SupplierSummaryView = {
  units: { productId: string; productName: string; size: string | null; quantity: number }[]
  prints: {
    printName: string | null
    printNumber: number | null
    groupName: string | null
    sizes: { productName: string; size: string | null }[]
  }[]
}

export type Option = { value: string; label: string }

/** The club's active sections, by name. */
export async function sectionOptions(): Promise<Option[]> {
  const data = await fetchCrudList<{ id: string; name: string | null }>('club_core/sections', {
    pageSize: 100,
    sortField: 'name',
    sortDir: 'asc',
  })
  return data.items.map((item) => ({ value: item.id, label: item.name ?? item.id }))
}

/** The active groups of a section, by name (the campaign's group chips). */
export async function sectionGroups(sectionId: string): Promise<Option[]> {
  const data = await fetchCrudList<{ id: string; name: string | null }>('groups/groups', {
    pageSize: 100,
    sortField: 'name',
    sortDir: 'asc',
    isActive: 'true',
    sectionId,
  })
  return data.items.map((item) => ({ value: item.id, label: item.name ?? item.id }))
}

/** The club's campaigns a new form may copy, newest first. */
export async function campaignOptions(): Promise<Option[]> {
  const data = await fetchCrudList<CampaignRow>('payments/order-campaigns', {
    pageSize: 50,
    sortField: 'createdAt',
    sortDir: 'desc',
  })
  return data.items.map((item) => ({ value: item.id, label: item.name ?? item.id }))
}

/** A comma-separated size list typed in the form as the list the API takes. */
export function parseSizes(value: string): string[] {
  return [
    ...new Set(
      value
        .split(',')
        .map((size) => size.trim())
        .filter(Boolean),
    ),
  ]
}
