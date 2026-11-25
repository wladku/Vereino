import { describe, expect, it } from '@jest/globals'
import {
  clubDataContributor,
  clubDeleteBeyondTenantToken,
  clubDeleteContributorToken,
  clubExportContributorToken,
} from '../club-data'

describe('club data contributor tokens', () => {
  it('names the export and deletion tokens after the module', () => {
    expect(clubExportContributorToken('payments')).toBe('club_core.clubExport.payments')
    expect(clubDeleteContributorToken('payments')).toBe('club_core.clubDelete.payments')
    expect(clubDeleteBeyondTenantToken('training')).toBe('club_core.clubDeleteBeyondTenant.training')
  })
})

describe('clubDataContributor', () => {
  it('returns a frozen copy of the declaration', () => {
    const tables = ['payments_fees', 'payments_charges']
    const contributor = clubDataContributor('payments', tables)
    tables.push('payments_other')
    expect(contributor).toEqual({ module: 'payments', tables: ['payments_fees', 'payments_charges'] })
    expect(Object.isFrozen(contributor)).toBe(true)
    expect(Object.isFrozen(contributor.tables)).toBe(true)
  })

  it('refuses a malformed module id, an empty list, a malformed table and a table listed twice', () => {
    expect(() => clubDataContributor('Payments', ['payments_fees'])).toThrow('invalid module id: Payments')
    expect(() => clubDataContributor('payments', [])).toThrow('without tables: payments')
    expect(() => clubDataContributor('payments', ['payments fees'])).toThrow('invalid table: payments / payments fees')
    expect(() => clubDataContributor('payments', ['payments_fees', 'payments_fees'])).toThrow(
      'lists a table twice: payments',
    )
  })
})
