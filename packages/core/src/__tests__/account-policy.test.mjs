import assert from 'node:assert/strict'
import { test } from 'node:test'
import { ADULT_AGE, accountAgePolicy, accountState, ageOn, isAdultOn } from '../account-policy.ts'

test('ageOn counts completed years', () => {
  assert.equal(ageOn('2011-10-27', '2026-10-26'), 14)
  assert.equal(ageOn('2011-10-27', '2026-10-27'), 15)
  assert.equal(ageOn('2026-10-27', '2026-10-27'), 0)
})

test('a 29 February birthday completes the year on 1 March in a common year', () => {
  assert.equal(ageOn('2008-02-29', '2026-02-28'), 17)
  assert.equal(ageOn('2008-02-29', '2026-03-01'), 18)
  assert.equal(ageOn('2008-02-29', '2028-02-29'), 20)
})

test('ageOn rejects malformed dates', () => {
  assert.throws(() => ageOn('2008-02-30', '2026-03-01'), RangeError)
  assert.throws(() => ageOn('2008-02-01', 'today'), RangeError)
})

test('isAdultOn turns true on the 18th birthday', () => {
  assert.equal(ADULT_AGE, 18)
  assert.equal(isAdultOn('2008-10-27', '2026-10-26'), false)
  assert.equal(isAdultOn('2008-10-27', '2026-10-27'), true)
})

test('accountAgePolicy compares the age with the threshold (TEST-F04 policy part)', () => {
  assert.equal(accountAgePolicy({ birthDate: '2011-10-27', threshold: 16, today: '2026-10-27' }), 'below_threshold')
  assert.equal(accountAgePolicy({ birthDate: '1986-10-27', threshold: 16, today: '2026-10-27' }), 'ok')
  assert.equal(accountAgePolicy({ birthDate: '2010-10-27', threshold: 16, today: '2026-10-27' }), 'ok')
  assert.equal(accountAgePolicy({ birthDate: '2026-10-27', threshold: 0, today: '2026-10-27' }), 'ok')
})

test('accountAgePolicy rejects an invalid threshold', () => {
  assert.throws(() => accountAgePolicy({ birthDate: '2010-10-27', threshold: -1, today: '2026-10-27' }), RangeError)
  assert.throws(() => accountAgePolicy({ birthDate: '2010-10-27', threshold: 1.5, today: '2026-10-27' }), RangeError)
})

test('accountState reads none, blocked, invited and active from the platform user (DD-L02, TEST-L19)', () => {
  const signedIn = new Date('2026-11-01T10:00:00Z')
  assert.equal(accountState(null), 'none')
  assert.equal(accountState({ hasPassword: true, lastSignInAt: signedIn, isConfirmed: false }), 'blocked')
  assert.equal(accountState({ hasPassword: false, lastSignInAt: null, isConfirmed: false }), 'blocked')
  assert.equal(accountState({ hasPassword: false, lastSignInAt: null, isConfirmed: true }), 'invited')
  assert.equal(accountState({ hasPassword: true, lastSignInAt: null, isConfirmed: true }), 'active')
  assert.equal(accountState({ hasPassword: false, lastSignInAt: signedIn, isConfirmed: true }), 'active')
})
