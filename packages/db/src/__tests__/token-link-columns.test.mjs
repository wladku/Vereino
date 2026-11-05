// P-10 TokenLinkColumns: the column options of a token-link table for each use policy.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { tokenLinkColumns } from '../index.ts'

test('a single-use table gets the unique hash column, the expiry and used_at', () => {
  const columns = tokenLinkColumns({ use: 'single' })
  assert.deepEqual(columns, {
    tokenHash: { name: 'token_hash', type: 'text', unique: true },
    expiresAt: { name: 'expires_at', type: Date },
    usedAt: { name: 'used_at', type: Date, nullable: true },
  })
})

test('an until-expiry table gets used_count (default 0) and last_used_at', () => {
  const columns = tokenLinkColumns({ use: 'until_expiry', hashColumn: 'link_hash' })
  assert.deepEqual(columns, {
    tokenHash: { name: 'link_hash', type: 'text', unique: true },
    expiresAt: { name: 'expires_at', type: Date },
    usedCount: { name: 'used_count', type: 'integer', default: 0 },
    lastUsedAt: { name: 'last_used_at', type: Date, nullable: true },
  })
})

test('every call returns fresh option objects', () => {
  const first = tokenLinkColumns({ use: 'single' })
  const second = tokenLinkColumns({ use: 'single' })
  assert.notEqual(first.tokenHash, second.tokenHash)
  first.tokenHash.name = 'mutated'
  assert.equal(second.tokenHash.name, 'token_hash')
})

test('a hash column that is not lower snake_case and an unknown use are programming errors', () => {
  assert.throws(() => tokenLinkColumns({ use: 'single', hashColumn: 'TokenHash' }), RangeError)
  assert.throws(() => tokenLinkColumns({ use: 'single', hashColumn: 'token hash' }), RangeError)
  assert.throws(() => tokenLinkColumns({ use: 'forever' }), /unknown token link use/)
})
