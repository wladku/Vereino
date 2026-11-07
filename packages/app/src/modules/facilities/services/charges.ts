// The optional `payments.chargeService` (facilities spec DD-19 transaction contract, D-028; #122): `facilities`
// resolves it with `hasRegistration` and never imports `payments`. With it, a staff entry creates the rental's charge
// payable to the place owner in the rental's own transaction and a cancellation cancels or forfeits it; without it a
// rental carries only its amount and staff confirm it by hand. `payments` implements the contract (its spec points to
// DD-19); until it registers the token every call here is a no-op.
import type { EntityManager } from '@mikro-orm/postgresql'
import type { CommandRuntimeContext } from '@open-mercato/shared/lib/commands'
import type { AwilixContainer } from 'awilix'

export const PAYMENTS_CHARGE_SERVICE = 'payments.chargeService' as const

export type RentalChargeInput = {
  sourceType: 'rental'
  sourceId: string
  payee: 'owner_institution'
  payeeInstitutionId: string | null
  payerInstitutionId?: string | null
  payerPersonId?: string | null
  amount: number
  dueDate: string
  description: string
}

export type ChargeOutcome = 'cancelled' | 'forfeited'

/** DD-19: writes only through `em`, takes the scope from `ctx`, emits nothing until `afterCommit()`. */
export type PaymentsChargeService = {
  createForSource(
    em: EntityManager,
    input: RentalChargeInput,
    ctx: CommandRuntimeContext,
  ): Promise<{ chargeId: string; afterCommit: () => Promise<void> }>
  cancelForSource(
    em: EntityManager,
    input: { sourceType: 'rental'; sourceId: string; outcome: ChargeOutcome },
    ctx: CommandRuntimeContext,
  ): Promise<{ warning?: 'charge_paid'; afterCommit?: () => Promise<void> }>
}

/** The registered charge service, or null while `payments` provides none. */
export function chargeService(container: AwilixContainer): PaymentsChargeService | null {
  if (!container.hasRegistration(PAYMENTS_CHARGE_SERVICE)) return null
  return container.resolve<PaymentsChargeService>(PAYMENTS_CHARGE_SERVICE)
}
