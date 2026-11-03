import assert from 'node:assert/strict'
import { test } from 'node:test'
import { errorCodeOf, findErrorCode } from '../error-codes.ts'

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

test('errorCodeOf reads the code of an error body or a thrown error', () => {
  assert.equal(errorCodeOf({ error: 'Not linked', code: 'scope_unlinked' }), 'scope_unlinked')
  assert.equal(errorCodeOf(Object.assign(new Error('Denied'), { code: 'scope_denied' })), 'scope_denied')
})

test('errorCodeOf answers null without a string code', () => {
  assert.equal(errorCodeOf(null), null)
  assert.equal(errorCodeOf(undefined), null)
  assert.equal(errorCodeOf('scope_denied'), null)
  assert.equal(errorCodeOf({ error: 'Forbidden' }), null)
  assert.equal(errorCodeOf({ code: 403 }), null)
})
