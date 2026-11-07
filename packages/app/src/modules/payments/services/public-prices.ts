// `payments.publicPrices` (club spec DD-28, Q-024; payments spec REQ-026, TEST-038; issue #112, E07-S05): the prices
// block of a section's public page, registered as an optional DI provider `club_core` reads with `hasRegistration`
// (`club_core/services/public-blocks.ts`). `club_core` calls it only for a public section of a club that publishes
// `prices`, inside the tenant and organization its slug lookup found; every query here carries that scope. The public
// groups come from `groups.directory`, so a card's price never names a group the guest cannot see.
import type { EntityManager } from '@mikro-orm/postgresql'
import type { AwilixContainer } from 'awilix'
import type { PublicBlockProvider, PublicSectionBlockContext } from '../../club_core/services/public-blocks'
import { DiscountRule, Fee } from '../data/entities'
import { publicPricesBlock, type PublicPricesBlock } from '../lib/public-prices'
import { clubClock, publicGroups } from './directory'

export const PAYMENTS_PUBLIC_PRICES = 'payments.publicPrices' as const

/** The response key of the block on the section page. */
export const PUBLIC_PRICES_KEY = 'prices'

export function createPublicPrices(container: AwilixContainer): PublicBlockProvider {
  return {
    block: 'prices',
    key: PUBLIC_PRICES_KEY,
    async sectionBlock(ctx: PublicSectionBlockContext): Promise<PublicPricesBlock | null> {
      const scope = { tenantId: ctx.tenantId, organizationId: ctx.organizationId }
      const em = container.resolve<EntityManager>('em').fork()
      const groups = await publicGroups(container, scope, [ctx.sectionId], em)
      if (groups.length === 0) return null
      const groupIds = groups.map((group) => group.id)
      const fees = await em.find(
        Fee,
        { ...scope, groupId: { $in: groupIds }, deletedAt: null },
        { fields: ['id', 'groupId', 'amount', 'period', 'validFrom', 'validTo'] },
      )
      if (fees.length === 0) return null
      const rules = await em.find(
        DiscountRule,
        { ...scope, kind: 'sibling', deletedAt: null },
        { fields: ['id', 'kind', 'percent', 'conditions', 'validFrom', 'validTo'] },
      )
      const clock = await clubClock(container, scope)
      return publicPricesBlock(
        groupIds,
        fees.map((fee) => ({
          groupId: fee.groupId ?? null,
          amount: fee.amount,
          period: fee.period,
          validFrom: fee.validFrom,
          validTo: fee.validTo ?? null,
        })),
        rules.map((rule) => ({
          kind: rule.kind,
          percent: rule.percent ?? null,
          conditions: rule.conditions,
          validFrom: rule.validFrom,
          validTo: rule.validTo ?? null,
        })),
        clock.today,
      )
    },
  }
}
