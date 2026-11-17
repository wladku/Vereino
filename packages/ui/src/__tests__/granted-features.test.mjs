// People life-cycle spec REQ-L14: the shared feature check behind the empty-picker hint (wildcard-aware; nothing is
// granted before the answer or after a failure).
import assert from 'node:assert/strict'
import { test } from 'node:test'
import * as React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { featureCheckDeps, featureCheckEffect, featureGrants, grantsFeature } from '../admin/granted-features.ts'
import { useGrantedFeatures } from '../admin/use-granted-features.tsx'
import { fakeTimers, flush } from './admin-test-helpers.mjs'

test('a feature is granted exactly, by `*` or by a module wildcard', () => {
  assert.equal(grantsFeature(['club_core.manage'], 'club_core.manage'), true)
  assert.equal(grantsFeature(['*'], 'club_core.manage'), true)
  assert.equal(grantsFeature(['club_core.*'], 'club_core.manage'), true)
  assert.equal(grantsFeature(['club_core.view'], 'club_core.manage'), false)
  assert.equal(grantsFeature(['people.*'], 'club_core.manage'), false)
  assert.equal(grantsFeature([], 'club_core.manage'), false)
})

test('the flags stay false and not loaded until the answer', () => {
  assert.deepEqual(featureGrants(['club_core.manage', 'people.manage'], null), {
    'club_core.manage': false,
    'people.manage': false,
    loaded: false,
  })
  assert.deepEqual(featureGrants(['club_core.manage', 'people.manage'], ['people.*']), {
    'club_core.manage': false,
    'people.manage': true,
    loaded: true,
  })
})

test('the effect reports the answer, and a failed check as no grant', async () => {
  const timers = fakeTimers()
  const answers = []
  featureCheckEffect({
    features: ['a.b'],
    check: async (features) => features,
    onGranted: (granted) => answers.push(granted),
    timers,
  })()
  featureCheckEffect({
    features: ['a.b'],
    check: async () => {
      throw new Error('down')
    },
    onGranted: (granted) => answers.push(granted),
    timers,
  })()
  timers.runAll()
  await flush()
  assert.deepEqual(answers, [['a.b'], []])
})

test('the dependencies compare the list by value', () => {
  const check = async () => []
  assert.deepEqual(featureCheckDeps(['a', 'b'], check), ['a\nb', check])
})

test('the hook renders with every flag false before the answer', () => {
  let seen
  function Probe() {
    seen = useGrantedFeatures(['club_core.manage'], async () => ({
      ok: true,
      result: { granted: ['club_core.manage'] },
    }))
    return null
  }
  renderToStaticMarkup(React.createElement(Probe))
  assert.deepEqual(seen, { 'club_core.manage': false, loaded: false })
})

test('a refused check (null) grants nothing', async () => {
  const timers = fakeTimers()
  const answers = []
  featureCheckEffect({
    features: ['a.b'],
    check: async () => null,
    onGranted: (granted) => answers.push(granted),
    timers,
  })()
  timers.runAll()
  await flush()
  assert.deepEqual(answers, [[]])
})
