import assert from 'node:assert/strict'
import { test } from 'node:test'
import { MAX_AGE_YEARS, birthDateBounds, birthDateProblem } from '../birth-date.ts'

test('birthDateBounds spans MAX_AGE_YEARS up to today', () => {
  assert.equal(MAX_AGE_YEARS, 120)
  assert.deepEqual(birthDateBounds('2026-11-03'), { min: '1906-11-03', max: '2026-11-03' })
})

test('birthDateBounds moves 29 February to 28 February when the earliest year is a common year', () => {
  assert.deepEqual(birthDateBounds('2028-02-29'), { min: '1908-02-29', max: '2028-02-29' })
  assert.deepEqual(birthDateBounds('2024-02-29'), { min: '1904-02-29', max: '2024-02-29' })
  assert.deepEqual(birthDateBounds('2020-02-29'), { min: '1900-02-28', max: '2020-02-29' })
})

test('birthDateBounds rejects a malformed today', () => {
  assert.throws(() => birthDateBounds('today'), RangeError)
})

test('birthDateProblem accepts dates from the earliest bound up to today', () => {
  assert.equal(birthDateProblem('2014-05-03', '2026-11-03'), null)
  assert.equal(birthDateProblem('2026-11-03', '2026-11-03'), null)
  assert.equal(birthDateProblem('1906-11-03', '2026-11-03'), null)
})

test('birthDateProblem names the problem', () => {
  assert.equal(birthDateProblem('2014-02-30', '2026-11-03'), 'malformed')
  assert.equal(birthDateProblem('03.05.2014', '2026-11-03'), 'malformed')
  assert.equal(birthDateProblem('2026-11-04', '2026-11-03'), 'future')
  assert.equal(birthDateProblem('1906-11-02', '2026-11-03'), 'too_old')
})
