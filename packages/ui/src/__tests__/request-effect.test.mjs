// P-32 (foundation III): the debounced request effect behind `AudiencePicker` and `DeliveryStatusList`.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { globalTimers, noEffect, requestEffect } from '../admin/request-effect.ts'
import { fakeTimers, flush } from './admin-test-helpers.mjs'

test('starts the request after the delay and reports its result', async () => {
  const timers = fakeTimers()
  const results = []
  const cleanup = requestEffect({
    delayMs: 300,
    timers,
    request: async () => 'answer',
    onSuccess: (result) => results.push(['ok', result]),
    onFailure: () => results.push(['failed']),
  })()
  assert.deepEqual(timers.delays(), [300])
  await flush()
  assert.deepEqual(results, [])
  timers.runAll()
  await flush()
  assert.deepEqual(results, [['ok', 'answer']])
  assert.equal(typeof cleanup, 'function')
})

test('reports a rejected or synchronously throwing request as a failure', async () => {
  const timers = fakeTimers()
  const results = []
  const effect = (request) =>
    requestEffect({
      delayMs: 0,
      timers,
      request,
      onSuccess: () => results.push('ok'),
      onFailure: () => results.push('failed'),
    })()
  effect(async () => {
    throw new Error('offline')
  })
  effect(() => {
    throw new Error('bug')
  })
  timers.runAll()
  await flush()
  assert.deepEqual(results, ['failed', 'failed'])
})

test('the cleanup cancels a pending request and drops a late answer or failure', async () => {
  const timers = fakeTimers()
  const results = []
  const pending = requestEffect({
    delayMs: 300,
    timers,
    request: async () => 'never',
    onSuccess: () => results.push('pending'),
    onFailure: () => results.push('pending failed'),
  })()
  pending()
  assert.deepEqual(timers.delays(), [])

  let resolve
  let reject
  const late = requestEffect({
    delayMs: 0,
    timers,
    request: () => new Promise((ok) => (resolve = ok)),
    onSuccess: () => results.push('late'),
    onFailure: () => results.push('late failed'),
  })()
  const lateFailure = requestEffect({
    delayMs: 0,
    timers,
    request: () => new Promise((_, fail) => (reject = fail)),
    onSuccess: () => results.push('late 2'),
    onFailure: () => results.push('late 2 failed'),
  })()
  timers.runAll()
  await flush()
  late()
  lateFailure()
  resolve('stale')
  reject(new Error('stale'))
  await flush()
  assert.deepEqual(results, [])
})

test('uses the global timers by default; the no-op effect returns no cleanup', async () => {
  const results = []
  const cleanup = requestEffect({
    delayMs: 0,
    request: async () => 1,
    onSuccess: (value) => results.push(value),
    onFailure: () => results.push('failed'),
  })()
  await new Promise((resolve) => globalThis.setTimeout(resolve, 5))
  await flush()
  assert.deepEqual(results, [1])
  cleanup()
  const handle = globalTimers.setTimeout(() => results.push('cancelled'), 0)
  globalTimers.clearTimeout(handle)
  await new Promise((resolve) => globalThis.setTimeout(resolve, 5))
  assert.deepEqual(results, [1])
  assert.equal(noEffect(), undefined)
})
