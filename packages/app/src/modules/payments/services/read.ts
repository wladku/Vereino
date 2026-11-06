// Reads of `payments`' own tables for its routes (foundation spec REQ-F16: routes reach the ORM only through
// services): the names of discount rules for the charge list and the club's stored payment settings.
import type { EntityManager } from '@mikro-orm/postgresql'
import type { AwilixContainer } from 'awilix'
import { DiscountRule, PaymentsSettings } from '../data/entities'
import type { PaymentsScope } from './directory'

function freshEm(container: AwilixContainer): EntityManager {
  return container.resolve<EntityManager>('em').fork()
}

/** The names of the club's discount rules among `ids`, deleted ones included (a charge keeps its rule's name). */
export async function discountRuleNames(
  container: AwilixContainer,
  scope: PaymentsScope,
  ids: readonly string[],
): Promise<Map<string, string>> {
  const unique = [...new Set(ids)]
  if (unique.length === 0) return new Map()
  const rows = await freshEm(container).find(
    DiscountRule,
    { ...scope, id: { $in: unique } },
    { fields: ['id', 'name'] },
  )
  return new Map(rows.map((row) => [row.id, row.name]))
}

/** The club's stored payment settings, or null before the first change. */
export function storedPaymentsSettings(
  container: AwilixContainer,
  scope: PaymentsScope,
): Promise<PaymentsSettings | null> {
  return freshEm(container).findOne(PaymentsSettings, { ...scope, deletedAt: null })
}
