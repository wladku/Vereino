// The facts a rental list item gains after the scope filter admitted it (facilities parity spec phase 5, REQ-R04,
// REQ-R05; #279): the payee — the nearest owner institution up the place tree (`clubCoreDirectory.placePayee`), name
// only, never its account — and the charge state read live from `payments.chargeService.statusOf` (`none` while the
// service is absent or the rental has no charge).
import type { CrudCtx } from '@open-mercato/shared/lib/crud/factory'
import { rentalChargeState } from '../lib/rental-record'
import { chargeService } from '../services/charges'
import { placePayee, type FacilitiesScope } from '../services/directory'
import type { rentalListItem } from './shared'

type RentalItem = ReturnType<typeof rentalListItem>

function trustedScope(ctx: CrudCtx): FacilitiesScope | null {
  const tenantId = ctx.auth?.tenantId
  const organizationId = ctx.selectedOrganizationId ?? ctx.auth?.orgId
  return tenantId && organizationId ? { tenantId, organizationId } : null
}

/** Adds `payee` and `chargeState` to the rental rows. */
export async function attachRentalFacts(payload: { items?: unknown[] }, ctx: CrudCtx): Promise<void> {
  const items = (payload.items ?? []) as RentalItem[]
  const scope = trustedScope(ctx)
  if (items.length === 0 || !scope) return
  const payees = new Map<string, RentalItem['payee']>()
  for (const placeId of new Set(items.map((item) => item.placeId))) {
    const payee = await placePayee(ctx.container, scope, placeId)
    payees.set(placeId, payee ? { institutionId: payee.institutionId, name: payee.name } : null)
  }
  const charges = chargeService(ctx.container)
  const chargeIds = items.flatMap((item) => (item.chargeId ? [item.chargeId] : []))
  // The list context carries the same session and organization a command context does (`trustedScopeOf`).
  const statuses = charges && chargeIds.length > 0 ? await charges.statusOf(chargeIds, ctx) : new Map<string, string>()
  for (const item of items) {
    item.payee = payees.get(item.placeId) ?? null
    item.chargeState = rentalChargeState(item.chargeId, statuses)
  }
}
