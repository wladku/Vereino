import assert from 'node:assert/strict'
import { test } from 'node:test'
import { STAFF_STEPS, STAFF_STEP_VARIANT, accountStep, periodStep } from '../staff-setup.ts'

const TODAY = '2026-11-19'

test('a period step is done when a period is active, pending when one starts later, else missing (#312)', () => {
  assert.equal(periodStep([{ validFrom: '2026-09-01', validTo: null }], TODAY), 'done')
  assert.equal(
    periodStep(
      [
        { validFrom: '2026-09-01', validTo: '2026-10-31' },
        { validFrom: TODAY, validTo: TODAY },
      ],
      TODAY,
    ),
    'done',
  )
  assert.equal(periodStep([{ validFrom: '2026-12-01', validTo: null }], TODAY), 'pending')
  assert.equal(periodStep([{ validFrom: '2026-09-01', validTo: '2026-10-31' }], TODAY), 'missing')
  assert.equal(periodStep([], TODAY), 'missing')
})

test('the account step reads the account state (DD-L02)', () => {
  assert.equal(accountStep('active'), 'done')
  assert.equal(accountStep('invited'), 'pending')
  assert.equal(accountStep('blocked'), 'pending')
  assert.equal(accountStep('none'), 'missing')
})

test('every step has a status variant other than brand', () => {
  assert.deepEqual(STAFF_STEPS, ['done', 'pending', 'missing'])
  assert.deepEqual(STAFF_STEP_VARIANT, { done: 'success', pending: 'warning', missing: 'neutral' })
})
