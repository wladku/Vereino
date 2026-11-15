// The granted member navigation features (navigation spec REQ-N05, #258): one feature check per session, cached,
// asked again on focus after five minutes; pending and failed answers degrade to `null` without an error.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import * as React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MEMBER_NAV_FEATURES } from '../member/member-nav.ts'
import {
  MEMBER_NAV_FEATURES_STALE_MS,
  createMemberNavFeaturesStore,
  featureCheckOver,
  memberNavFeaturesEffect,
  sharedMemberNavFeaturesStore,
  useMemberNavFeatures,
} from '../member/member-nav-features.ts'

const flush = () => new Promise((resolve) => setTimeout(resolve, 0))

function checker(...answers) {
  const calls = []
  const check = async (features) => {
    calls.push(features)
    const answer = answers.length > 1 ? answers.shift() : answers[0]
    if (answer instanceof Error) throw answer
    return answer
  }
  return { check, calls }
}

test('asks once for the fixed list, keeps only the listed grants and notifies its listeners', async () => {
  const { check, calls } = checker(['facilities.view', 'payments.cash.record', 'unrelated.feature'])
  const store = createMemberNavFeaturesStore(check)
  let notified = 0
  const unsubscribe = store.subscribe(() => notified++)
  assert.equal(store.snapshot(), null)
  store.load()
  store.load()
  await flush()
  assert.deepEqual(calls, [MEMBER_NAV_FEATURES])
  assert.deepEqual(store.snapshot(), ['facilities.view', 'payments.cash.record'])
  assert.equal(notified, 1)
  const first = store.snapshot()
  store.load()
  await flush()
  assert.equal(calls.length, 1)
  assert.equal(store.snapshot(), first)
  unsubscribe()
  store.load(true)
  await flush()
  assert.equal(calls.length, 2)
  assert.equal(notified, 1)
})

test('a failed or refused first check stays `null` and the next load asks again', async () => {
  const { check, calls } = checker(new Error('offline'), null, ['facilities.view'])
  const store = createMemberNavFeaturesStore(check)
  store.load()
  await flush()
  assert.equal(store.snapshot(), null)
  store.load()
  await flush()
  assert.equal(store.snapshot(), null)
  store.load()
  await flush()
  assert.deepEqual(store.snapshot(), ['facilities.view'])
  assert.equal(calls.length, 3)
})

test('a check that throws before answering counts as failed', async () => {
  const store = createMemberNavFeaturesStore(() => {
    throw new Error('bug')
  })
  store.load()
  await flush()
  assert.equal(store.snapshot(), null)
})

test('asks again on focus only once the answer is five minutes old, keeping it when the refresh fails', async () => {
  let clock = 1_000
  const { check, calls } = checker(['facilities.view'], new Error('offline'), ['payments.groups.view'])
  const store = createMemberNavFeaturesStore(check, () => clock)
  store.refreshIfStale()
  await flush()
  assert.equal(calls.length, 0)
  store.load()
  await flush()
  clock += MEMBER_NAV_FEATURES_STALE_MS - 1
  store.refreshIfStale()
  await flush()
  assert.equal(calls.length, 1)
  clock += 1
  store.refreshIfStale()
  await flush()
  assert.equal(calls.length, 2)
  assert.deepEqual(store.snapshot(), ['facilities.view'])
  store.refreshIfStale()
  await flush()
  assert.equal(calls.length, 3)
  assert.deepEqual(store.snapshot(), ['payments.groups.view'])
})

test('the effect loads, listens for focus and stops listening on cleanup', async () => {
  const listeners = new Map()
  const target = {
    addEventListener: (type, listener) => listeners.set(type, listener),
    removeEventListener: (type, listener) => {
      if (listeners.get(type) === listener) listeners.delete(type)
    },
  }
  let clock = 0
  const { check, calls } = checker(['facilities.view'])
  const store = createMemberNavFeaturesStore(check, () => clock)
  const cleanup = memberNavFeaturesEffect(store, target)()
  await flush()
  assert.equal(calls.length, 1)
  clock = MEMBER_NAV_FEATURES_STALE_MS
  listeners.get('focus')()
  await flush()
  assert.equal(calls.length, 2)
  cleanup()
  assert.equal(listeners.size, 0)
  // On the server there is no window: the effect only loads.
  const serverStore = createMemberNavFeaturesStore(checker(null).check)
  const serverCleanup = memberNavFeaturesEffect(serverStore)()
  serverCleanup()
  assert.equal(typeof serverCleanup, 'function')
})

test('the hook renders `null` on the server and reads a given or the one shared store', () => {
  const store = createMemberNavFeaturesStore(checker(null).check)
  const call = async () => ({ ok: false })
  const Probe = ({ value }) =>
    React.createElement(
      'span',
      null,
      JSON.stringify(value ? useMemberNavFeatures(call, value) : useMemberNavFeatures(call)),
    )
  assert.equal(renderToStaticMarkup(React.createElement(Probe, { value: store })), '<span>null</span>')
  assert.equal(renderToStaticMarkup(React.createElement(Probe, { value: null })), '<span>null</span>')
  assert.equal(
    sharedMemberNavFeaturesStore(call),
    sharedMemberNavFeaturesStore(async () => ({ ok: true })),
  )
})

test('the API check posts the list and reads `granted`; a refused or malformed answer is `null`', async () => {
  const requests = []
  const answering = (answer) =>
    featureCheckOver(async (url, init) => {
      requests.push({ url, method: init.method, body: init.body })
      return answer
    })
  assert.deepEqual(await answering({ ok: true, result: { granted: ['facilities.view', 7] } })(['facilities.view']), [
    'facilities.view',
    '7',
  ])
  assert.deepEqual(requests[0], {
    url: '/api/auth/feature-check',
    method: 'POST',
    body: '{"features":["facilities.view"]}',
  })
  assert.equal(await answering({ ok: true, result: { ok: true } })(['facilities.view']), null)
  assert.equal(await answering({ ok: true, result: null })(['facilities.view']), null)
  assert.equal(await answering({ ok: true })(['facilities.view']), null)
  assert.equal(await answering({ ok: false, result: { granted: [] } })(['facilities.view']), null)
})
