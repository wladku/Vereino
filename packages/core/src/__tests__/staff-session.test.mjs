import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  ACTIVITY_REPORT_INTERVAL_MS,
  MEMBER_SESSION_AUTH_ROLES,
  STAFF_IDLE_MINUTES_MAX,
  STAFF_SESSION_DEFAULTS,
  activityReportDue,
  isOwnEmailChange,
  isStaffAccount,
  normalizeLoginEmail,
  readStaffIdleMinutes,
  staffSessionExpiry,
  staffSessionIdle,
} from '../staff-session.ts'

test('only the member and payer roles keep the member session lifetime', () => {
  assert.deepEqual([...MEMBER_SESSION_AUTH_ROLES].sort(), ['vereino_member', 'vereino_payer'])
})

test('an account is staff when it holds any role outside the member-session roles (fails closed)', () => {
  assert.equal(isStaffAccount(['vereino_member']), false)
  assert.equal(isStaffAccount(['vereino_member', 'vereino_payer']), false)
  assert.equal(isStaffAccount([]), false)
  assert.equal(isStaffAccount(null), false)
  assert.equal(isStaffAccount(undefined), false)
  assert.equal(isStaffAccount(['vereino_member', 'vereino_coach']), true)
  assert.equal(isStaffAccount(['vereino_treasurer']), true)
  assert.equal(isStaffAccount(['vereino_maintenance_planner', 'vereino_member']), true)
  assert.equal(isStaffAccount(['superadmin']), true)
  assert.equal(isStaffAccount(['admin']), true)
  assert.equal(isStaffAccount(['a-role-added-later']), true)
})

test('the idle timeout reads VEREINO_STAFF_IDLE_MINUTES within 1 … 480 and falls back to 30', () => {
  assert.equal(STAFF_SESSION_DEFAULTS.idleMinutes, 30)
  assert.equal(STAFF_IDLE_MINUTES_MAX, 480)
  assert.equal(readStaffIdleMinutes({}), 30)
  assert.equal(readStaffIdleMinutes({ VEREINO_STAFF_IDLE_MINUTES: '  ' }), 30)
  assert.equal(readStaffIdleMinutes({ VEREINO_STAFF_IDLE_MINUTES: '15' }), 15)
  assert.equal(readStaffIdleMinutes({ VEREINO_STAFF_IDLE_MINUTES: '1' }), 1)
  assert.equal(readStaffIdleMinutes({ VEREINO_STAFF_IDLE_MINUTES: '480' }), 480)
  assert.equal(readStaffIdleMinutes({ VEREINO_STAFF_IDLE_MINUTES: '481' }), 30)
  assert.equal(readStaffIdleMinutes({ VEREINO_STAFF_IDLE_MINUTES: '0' }), 30)
  assert.equal(readStaffIdleMinutes({ VEREINO_STAFF_IDLE_MINUTES: '12.5' }), 30)
  assert.equal(readStaffIdleMinutes({ VEREINO_STAFF_IDLE_MINUTES: 'thirty' }), 30)
})

test('a staff session expires the idle timeout after activity, never past 8 hours after sign-in', () => {
  const createdAt = new Date('2026-11-26T08:00:00Z')
  assert.equal(
    staffSessionExpiry({ createdAt, now: createdAt, idleMinutes: 30 }).toISOString(),
    '2026-11-26T08:30:00.000Z',
  )
  assert.equal(
    staffSessionExpiry({ createdAt, now: new Date('2026-11-26T12:10:00Z'), idleMinutes: 30 }).toISOString(),
    '2026-11-26T12:40:00.000Z',
  )
  assert.equal(
    staffSessionExpiry({ createdAt, now: new Date('2026-11-26T15:50:00Z'), idleMinutes: 30 }).toISOString(),
    '2026-11-26T16:00:00.000Z',
  )
})

test('the browser reports activity at most once a minute and only after new activity', () => {
  assert.equal(ACTIVITY_REPORT_INTERVAL_MS, 60_000)
  assert.equal(activityReportDue({ lastActivityAt: 0, lastReportAt: null, now: 0 }), true)
  assert.equal(activityReportDue({ lastActivityAt: 1_000, lastReportAt: 1_000, now: 120_000 }), false)
  assert.equal(activityReportDue({ lastActivityAt: 30_000, lastReportAt: 1_000, now: 30_000 }), false)
  assert.equal(activityReportDue({ lastActivityAt: 61_000, lastReportAt: 1_000, now: 61_000 }), true)
})

test('the staff user is idle once the whole timeout passed without activity', () => {
  assert.equal(staffSessionIdle({ lastActivityAt: 0, now: 29 * 60_000, idleMinutes: 30 }), false)
  assert.equal(staffSessionIdle({ lastActivityAt: 0, now: 30 * 60_000, idleMinutes: 30 }), true)
})

test('an own e-mail change is an update of the actor that carries a different e-mail', () => {
  assert.equal(normalizeLoginEmail('  Anna@Example.COM '), 'anna@example.com')
  const actorId = 'u-1'
  assert.equal(
    isOwnEmailChange({ actorId, targetId: 'u-1', email: 'new@example.com', storedEmail: 'old@example.com' }),
    true,
  )
  assert.equal(
    isOwnEmailChange({ actorId, targetId: 'u-1', email: ' OLD@example.com', storedEmail: 'old@example.com' }),
    false,
  )
  assert.equal(isOwnEmailChange({ actorId, targetId: 'u-1', email: 'new@example.com', storedEmail: null }), true)
  assert.equal(
    isOwnEmailChange({ actorId, targetId: 'u-2', email: 'new@example.com', storedEmail: 'old@example.com' }),
    false,
  )
  assert.equal(isOwnEmailChange({ actorId, targetId: 'u-1', email: undefined, storedEmail: 'old@example.com' }), false)
  assert.equal(
    isOwnEmailChange({ actorId: null, targetId: 'u-1', email: 'new@example.com', storedEmail: 'old@example.com' }),
    false,
  )
})
