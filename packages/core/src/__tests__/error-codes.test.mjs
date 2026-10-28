import assert from 'node:assert/strict'
import { test } from 'node:test'
import { findErrorCode } from '../error-codes.ts'

const table = [
  { code: 'scope_denied', status: 403, messageKey: 'foundation.errors.scope_denied' },
  { code: 'email_taken', status: 409, messageKey: 'foundation.errors.email_taken' },
]

test('findErrorCode returns the declared entry', () => {
  assert.equal(findErrorCode(table, 'email_taken'), table[1])
})

test('findErrorCode rejects an undeclared code', () => {
  assert.throws(() => findErrorCode(table, 'nope'), {
    message: '[internal] error code nope is not declared in this table',
  })
})
