// The optional `payments.chargeService` (facilities spec DD-19 transaction contract, D-028; #122): `facilities`
// resolves it with `hasRegistration` and never imports `payments`. With it, a staff entry or an approved request
// creates the rental's charge payable to the place owner in the rental's own transaction, a cancellation cancels or
// forfeits it, and the rental is confirmed by the payment recorded on the charge (facilities parity spec DD-R09,
// #285); without it a rental carries only its amount and staff confirm it by hand (the rental register). `payments`
// implements the contract (its spec points to DD-19) and registers the token since #291 (payments parity spec phase
// 1); without `payments` every call here is a no-op.
import type { EntityManager } from '@mikro-orm/postgresql'
import type { CommandRuntimeContext } from '@open-mercato/shared/lib/commands'
import type { AwilixContainer } from 'awilix'
import { calendarDateInZone } from '@vereino/core'
import { renderLocalized } from '@/modules/foundation'
import type { Rental } from '../data/entities'
import { rentalChargeDescription } from '../lib/rental-record'
import { clubRequestSettings, findPlaces, placePayee, type FacilitiesScope } from './directory'

export const PAYMENTS_CHARGE_SERVICE = 'payments.chargeService' as const

export type RentalChargeInput = {
  sourceType: 'rental'
  sourceId: string
  payee: 'owner_institution'
  payeeInstitutionId: string | null
  payerInstitutionId?: string | null
  payerPersonId?: string | null
  /** The typed-in name of an unregistered renter, the payer when neither id is given (payments parity DD-C01). */
  payerDisplayName?: string | null
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
  /** The stored status of each charge of the caller's organization; unknown or foreign ids are absent (#279). */
  statusOf(chargeIds: readonly string[], ctx: CommandRuntimeContext): Promise<Map<string, string>>
}

/** The registered charge service, or null while `payments` provides none. */
export function chargeService(container: AwilixContainer): PaymentsChargeService | null {
  if (!container.hasRegistration(PAYMENTS_CHARGE_SERVICE)) return null
  return container.resolve<PaymentsChargeService>(PAYMENTS_CHARGE_SERVICE)
}

/**
 * The charge of a rental (facilities parity spec *Charge of a rental*, REQ-R06): payable to the place's payee — the
 * nearest owner institution up the place tree, or null when the club owns it —, the payer the renter's institution
 * or person, or the typed-in name of an unregistered renter, the `charge.rentalDesc` description in the club's
 * default locale, and the payment deadline's club-zone date as the due date.
 */
export async function rentalChargeInput(
  container: AwilixContainer,
  em: EntityManager,
  scope: FacilitiesScope,
  row: Rental,
): Promise<RentalChargeInput> {
  const settings = await clubRequestSettings(container, scope)
  const payee = await placePayee(container, scope, row.placeId, em)
  const place = (await findPlaces(container, scope, [row.placeId], em)).get(row.placeId)
  const description = await renderLocalized(settings.locale, (t, locale) =>
    rentalChargeDescription(t, {
      placeName: place?.name ?? '',
      startsAt: row.startsAt,
      endsAt: row.endsAt,
      timeZone: settings.timeZone,
      locale,
    }),
  )
  return {
    sourceType: 'rental',
    sourceId: row.id,
    payee: 'owner_institution',
    payeeInstitutionId: payee?.institutionId ?? null,
    payerInstitutionId: row.renterType === 'institution' ? (row.renterId ?? null) : null,
    payerPersonId: row.renterType === 'person' ? (row.renterId ?? null) : null,
    payerDisplayName: row.renterType === 'unregistered' ? row.renterDisplayName : null,
    amount: row.amount,
    dueDate: calendarDateInZone(row.paymentDeadline ?? row.startsAt, settings.timeZone),
    description,
  }
}
