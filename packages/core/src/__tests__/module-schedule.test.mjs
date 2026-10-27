import assert from 'node:assert/strict'
import { test } from 'node:test'
import { moduleScheduleKey, moduleScheduleQueue, moduleScheduleTiming, moduleWorkerId } from '../module-schedule.ts'

const SCOPE = { tenantId: 't1', organizationId: 'o1' }

test('worker id, queue and key follow DD-G07', () => {
  assert.equal(moduleWorkerId('people', 'sync-role-expiry'), 'people:sync-role-expiry')
  assert.equal(moduleScheduleQueue('people', 'sync-role-expiry'), 'people-sync-role-expiry')
  assert.equal(moduleScheduleKey('club_core', 'purge-import-rows', SCOPE), 'club_core:purge-import-rows:t1:o1')
})

test('invalid module ids and job names are rejected', () => {
  assert.throws(() => moduleWorkerId('People', 'sync'), RangeError)
  assert.throws(() => moduleScheduleQueue('people', 'Sync_Roles'), RangeError)
  assert.throws(() => moduleWorkerId('people', 'sync-'), RangeError)
})

test('a schedule key needs a tenant and an organization', () => {
  assert.throws(() => moduleScheduleKey('people', 'sync', { tenantId: '', organizationId: 'o1' }), RangeError)
  assert.throws(() => moduleScheduleKey('people', 'sync', { tenantId: 't1', organizationId: '' }), RangeError)
})

test('cron timing carries the club time zone', () => {
  assert.deepEqual(moduleScheduleTiming({ cron: ' 0 2 * * * ', timezone: 'Europe/Warsaw ' }), {
    scheduleType: 'cron',
    scheduleValue: '0 2 * * *',
    timezone: 'Europe/Warsaw',
  })
  assert.throws(() => moduleScheduleTiming({ cron: ' ', timezone: 'Europe/Warsaw' }), RangeError)
  assert.throws(() => moduleScheduleTiming({ cron: '0 2 * * *', timezone: '' }), RangeError)
})

test('intervals of at least one minute are accepted', () => {
  assert.deepEqual(moduleScheduleTiming({ interval: '15m' }), {
    scheduleType: 'interval',
    scheduleValue: '15m',
    timezone: 'UTC',
  })
  assert.equal(moduleScheduleTiming({ interval: '2h' }).scheduleValue, '2h')
  assert.equal(moduleScheduleTiming({ interval: '1d' }).scheduleValue, '1d')
})

test('intervals below one minute or malformed are rejected', () => {
  assert.throws(() => moduleScheduleTiming({ interval: '0m' }), RangeError)
  assert.throws(() => moduleScheduleTiming({ interval: '1.5m' }), RangeError)
  assert.throws(() => moduleScheduleTiming({ interval: '30s' }), RangeError)
})
