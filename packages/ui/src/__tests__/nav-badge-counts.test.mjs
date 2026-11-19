// Navigation spec REQ-N03 (issue #260): the shared effect behind the menu-count widgets.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  NAV_BADGE_REFRESH_MS,
  navBadgeCount,
  navBadgeEffect,
  navBadgeValue,
} from '../admin/nav-badge-counts.ts'
import { fakeTimers, flush } from './admin-test-helpers.mjs'

const label = (count) => `${count} waiting`

test('navBadgeCount accepts non-negative integers only', () => {
  assert.equal(navBadgeCount(0), 0)
  assert.equal(navBadgeCount(7), 7)
  assert.equal(navBadgeCount(-1), null)
  assert.equal(navBadgeCount(1.5), null)
  assert.equal(navBadgeCount('3'), null)
  assert.equal(navBadgeCount(undefined), null)
})

test('navBadgeValue shows a positive count with its label and nothing at zero or for an unknown value', () => {
  assert.deepEqual(navBadgeValue(150, label), { count: 150, label: '150 waiting' })
  assert.equal(navBadgeValue(0, label), null)
  assert.equal(navBadgeValue(null, label), null)
})

test('reads at once, publishes every owned item and reads again after the interval', async () => {
  const timers = fakeTimers()
  const published = []
  const answers = [{ '/a': 2, '/b': 0 }, { '/a': 1 }]
  navBadgeEffect({
    hrefs: ['/a', '/b'],
    read: async () => answers.shift(),
    publish: (href, badge) => published.push([href, badge]),
    label,
    timers,
  })()
  assert.deepEqual(timers.delays(), [0])
  timers.runAll()
  await flush()
  assert.deepEqual(published, [
    ['/a', { count: 2, label: '2 waiting' }],
    ['/b', null],
  ])
  assert.deepEqual(timers.delays(), [NAV_BADGE_REFRESH_MS])
  timers.runAll()
  await flush()
  assert.deepEqual(published.slice(2), [
    ['/a', { count: 1, label: '1 waiting' }],
    ['/b', null],
  ])
})

test('a failed read clears the owned items and keeps the schedule', async () => {
  const timers = fakeTimers()
  const published = []
  navBadgeEffect({
    hrefs: ['/a'],
    read: async () => {
      throw new Error('offline')
    },
    publish: (href, badge) => published.push([href, badge]),
    label,
    intervalMs: 5,
    timers,
  })()
  timers.runAll()
  await flush()
  assert.deepEqual(published, [['/a', null]])
  assert.deepEqual(timers.delays(), [5])
})

test('the cleanup drops an answer in flight and stops the schedule', async () => {
  const timers = fakeTimers()
  const published = []
  const effect = (read) =>
    navBadgeEffect({ hrefs: ['/a'], read, publish: (href, badge) => published.push([href, badge]), label, timers })()
  let cleanup = effect(async () => ({ '/a': 3 }))
  timers.runAll()
  cleanup()
  await flush()
  cleanup = effect(async () => {
    throw new Error('offline')
  })
  timers.runAll()
  cleanup()
  await flush()
  assert.deepEqual(published, [])
  assert.deepEqual(timers.delays(), [])
  // A cleanup before the first read cancels it.
  effect(async () => ({ '/a': 1 }))()
  assert.deepEqual(timers.delays(), [])
})

test('uses the global timers by default', async () => {
  const published = []
  const cleanup = navBadgeEffect({
    hrefs: ['/a'],
    read: async () => ({ '/a': 4 }),
    publish: (href, badge) => published.push([href, badge]),
    label,
  })()
  await new Promise((resolve) => setTimeout(resolve, 5))
  cleanup()
  assert.deepEqual(published, [['/a', { count: 4, label: '4 waiting' }]])
})
