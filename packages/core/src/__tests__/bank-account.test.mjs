import assert from 'node:assert/strict'
import { test } from 'node:test'
import { formatBankAccount, normalizeBankAccount } from '../bank-account.ts'

test('normalizeBankAccount accepts 26 digits with spaces and an optional PL prefix', () => {
  assert.equal(normalizeBankAccount('61109010140000071219812874'), '61109010140000071219812874')
  assert.equal(normalizeBankAccount('61 1090 1014 0000 0712 1981 2874'), '61109010140000071219812874')
  assert.equal(normalizeBankAccount('PL61109010140000071219812874'), '61109010140000071219812874')
  assert.equal(normalizeBankAccount('pl 61 1090 1014 0000 0712 1981 2874'), '61109010140000071219812874')
})

test('normalizeBankAccount rejects anything that is not 26 digits', () => {
  assert.equal(normalizeBankAccount('6110901014000007121981287'), null)
  assert.equal(normalizeBankAccount('611090101400000712198128745'), null)
  assert.equal(normalizeBankAccount('61-1090-1014-0000-0712-1981-2874'), null)
  assert.equal(normalizeBankAccount('DE61109010140000071219812874'), null)
  assert.equal(normalizeBankAccount(''), null)
})

test('formatBankAccount prints an NRB as 2 + 6 × 4 digits and leaves other values as they are', () => {
  assert.equal(formatBankAccount('61109010140000071219812874'), '61 1090 1014 0000 0712 1981 2874')
  assert.equal(formatBankAccount('PL61109010140000071219812874'), '61 1090 1014 0000 0712 1981 2874')
  assert.equal(formatBankAccount('legacy 123'), 'legacy 123')
})
