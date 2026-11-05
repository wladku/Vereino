import { describe, expect, it } from '@jest/globals'
import { formatBankAccount, normalizeBankAccount } from '../institutions'

describe('institution bank accounts (#87)', () => {
  it('accepts 26 digits with spaces and an optional PL prefix', () => {
    expect(normalizeBankAccount('61109010140000071219812874')).toBe('61109010140000071219812874')
    expect(normalizeBankAccount('61 1090 1014 0000 0712 1981 2874')).toBe('61109010140000071219812874')
    expect(normalizeBankAccount('PL61109010140000071219812874')).toBe('61109010140000071219812874')
    expect(normalizeBankAccount('pl 61 1090 1014 0000 0712 1981 2874')).toBe('61109010140000071219812874')
  })

  it('rejects anything that is not 26 digits', () => {
    expect(normalizeBankAccount('6110901014000007121981287')).toBeNull()
    expect(normalizeBankAccount('611090101400000712198128745')).toBeNull()
    expect(normalizeBankAccount('61-1090-1014-0000-0712-1981-2874')).toBeNull()
    expect(normalizeBankAccount('DE61109010140000071219812874')).toBeNull()
    expect(normalizeBankAccount('')).toBeNull()
  })

  it('prints an NRB as 2 + 6 × 4 digits and leaves other values as they are', () => {
    expect(formatBankAccount('61109010140000071219812874')).toBe('61 1090 1014 0000 0712 1981 2874')
    expect(formatBankAccount('PL61109010140000071219812874')).toBe('61 1090 1014 0000 0712 1981 2874')
    expect(formatBankAccount('legacy 123')).toBe('legacy 123')
  })
})
