// Client-side shapes and money helpers of the contracts screens (`/backend/club/contracts`, README B-07, #96).
import type { CoachTermField } from '../lib/contracts'
import type { Translate } from './client-helpers'

/** A row of `GET /api/club_core/contracts` (rates in grosz). */
export type ContractRow = {
  id: string
  partyType: string | null
  partyId: string | null
  partyName?: string | null
  kind: string | null
  validFrom: string | null
  validTo: string | null
  terms: Partial<Record<CoachTermField, number>> | null
  createdAt: string | null
  updatedAt: string | null
}

/** Grosz as PLN money in the user's locale (`150000` → `1 500,00 zł`). */
export function formatRate(grosz: number, locale: string): string {
  return new Intl.NumberFormat(locale, { style: 'currency', currency: 'PLN' }).format(grosz / 100)
}

/** A PLN amount typed in a form (`1500`, `1500,50`, `1500.5`) as whole grosz, or null when it is not an amount. */
export function zlotyToGrosz(value: unknown): number | null {
  const text =
    typeof value === 'number' ? String(value) : typeof value === 'string' ? value.trim().replace(/\s/g, '') : ''
  if (!/^\d+([.,]\d{1,2})?$/.test(text)) return null
  return Math.round(Number(text.replace(',', '.')) * 100)
}

/** Grosz as the PLN text a form field shows (`150000` → `1500`, `150050` → `1500.50`). */
export function groszToZloty(grosz: number | null | undefined): string {
  if (typeof grosz !== 'number') return ''
  return grosz % 100 === 0 ? String(grosz / 100) : (grosz / 100).toFixed(2)
}

/** The rates of a coach contract as one line (`Base 1 500,00 zł · unit 80,00 zł`); empty without rates. */
export function ratesSummary(
  terms: ContractRow['terms'],
  fields: readonly CoachTermField[],
  locale: string,
  t: Translate,
) {
  if (!terms) return ''
  return fields
    .flatMap((field) => {
      const rate = terms[field]
      return typeof rate === 'number' ? [`${t(`club_core.contracts.rates.${field}`)} ${formatRate(rate, locale)}`] : []
    })
    .join(' · ')
}
