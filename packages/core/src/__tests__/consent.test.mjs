import assert from 'node:assert/strict'
import { test } from 'node:test'
import { grantConsent, isConsentGranted, withdrawConsent } from '../consent.ts'

const T1 = new Date('2026-10-01T10:00:00.000Z')
const T2 = new Date('2026-10-02T10:00:00.000Z')
const T3 = new Date('2026-10-03T10:00:00.000Z')

test('grant, withdraw and grant again (TEST-F05 unit part)', () => {
  const granted = grantConsent({ grantedAt: null }, T1)
  assert.deepEqual(granted, { state: { grantedAt: T1 }, changed: true, at: T1 })
  assert.equal(isConsentGranted(granted.state), true)

  const withdrawn = withdrawConsent(granted.state, T2)
  assert.deepEqual(withdrawn, { state: { grantedAt: null }, changed: true, at: T2 })
  assert.equal(isConsentGranted(withdrawn.state), false)

  const regranted = grantConsent(withdrawn.state, T3)
  assert.deepEqual(regranted, { state: { grantedAt: T3 }, changed: true, at: T3 })
})

test('granting a granted consent keeps its original date', () => {
  const state = { grantedAt: T1 }
  const result = grantConsent(state, T2)
  assert.equal(result.state, state)
  assert.equal(result.changed, false)
  assert.equal(result.at, null)
})

test('withdrawing a consent that is not granted is a no-op', () => {
  const state = { grantedAt: null }
  const result = withdrawConsent(state, T2)
  assert.equal(result.state, state)
  assert.equal(result.changed, false)
  assert.equal(result.at, null)
})
