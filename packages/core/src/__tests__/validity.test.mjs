import assert from 'node:assert/strict'
import { test } from 'node:test'
import { Validity, endsBefore, isActiveAt, isInvertedPeriod } from '../validity.ts'

test('Validity.parse accepts an open-ended and a closed period', () => {
  assert.deepEqual(Validity.parse({ validFrom: '2026-09-01' }), {
    ok: true,
    value: { validFrom: '2026-09-01', validTo: null },
  })
  assert.deepEqual(Validity.parse({ validFrom: '2026-09-01', validTo: null }), {
    ok: true,
    value: { validFrom: '2026-09-01', validTo: null },
  })
  assert.deepEqual(Validity.parse({ validFrom: '2026-09-01', validTo: '2026-09-01' }), {
    ok: true,
    value: { validFrom: '2026-09-01', validTo: '2026-09-01' },
  })
})

test('Validity.parse reports an inverted period (validity_inverted)', () => {
  assert.deepEqual(Validity.parse({ validFrom: '2026-09-02', validTo: '2026-09-01' }), {
    ok: false,
    problem: 'inverted',
  })
})

test('Validity.parse reports malformed input', () => {
  for (const input of [
    null,
    'x',
    {},
    { validFrom: '2026-02-30' },
    { validFrom: '2026-09-01', validTo: 'tomorrow' },
    { validFrom: '2026-09-01', validTo: 5 },
  ]) {
    assert.deepEqual(Validity.parse(input), { ok: false, problem: 'malformed' })
  }
})

test('isInvertedPeriod is true only when the end precedes the start', () => {
  assert.equal(isInvertedPeriod('2026-09-02', '2026-09-01'), true)
  assert.equal(isInvertedPeriod('2026-09-01', '2026-09-01'), false)
  assert.equal(isInvertedPeriod('2026-09-01', null), false)
  assert.equal(isInvertedPeriod('2026-09-01', undefined), false)
})

test('isActiveAt includes both ends and treats an empty end as open', () => {
  const closed = { validFrom: '2026-09-01', validTo: '2026-09-30' }
  assert.equal(isActiveAt(closed, '2026-08-31'), false)
  assert.equal(isActiveAt(closed, '2026-09-01'), true)
  assert.equal(isActiveAt(closed, '2026-09-30'), true)
  assert.equal(isActiveAt(closed, '2026-10-01'), false)
  assert.equal(isActiveAt({ validFrom: '2026-09-01', validTo: null }, '2099-01-01'), true)
  assert.equal(Validity.isActiveAt, isActiveAt)
})

test('endsBefore is true once the last day has passed', () => {
  const closed = { validFrom: '2026-09-01', validTo: '2026-09-30' }
  assert.equal(endsBefore(closed, '2026-09-30'), false)
  assert.equal(endsBefore(closed, '2026-10-01'), true)
  assert.equal(endsBefore({ validFrom: '2026-09-01', validTo: null }, '2099-01-01'), false)
  assert.equal(Validity.endsBefore, endsBefore)
})
