// Who else a session cancellation tells, and the role it is recorded in (club spec REQ-009, R01; #139).
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { CANCELLING_ROLES, cancellationCoordinatorIds, cancellingRole } from '../audience.ts'

test('a coach cancellation adds the section coordinators, unique and sorted, never the canceller', () => {
  assert.deepEqual(cancellationCoordinatorIds('coach', ['c-2', 'c-1', 'c-2'], 'p-9'), ['c-1', 'c-2'])
  // Wojtek coaches the group and coordinates its section: he is not told of his own cancellation.
  assert.deepEqual(cancellationCoordinatorIds('coach', ['wojtek', 'ola'], 'wojtek'), ['ola'])
  assert.deepEqual(cancellationCoordinatorIds('coach', ['ola'], null), ['ola'])
})

test('a coordinator, an administrator or an unknown role adds no coordinators', () => {
  assert.deepEqual(cancellationCoordinatorIds('coordinator', ['c-1'], 'p-1'), [])
  assert.deepEqual(cancellationCoordinatorIds('club_admin', ['c-1'], 'p-1'), [])
  assert.deepEqual(cancellationCoordinatorIds(null, ['c-1'], null), [])
})

test('cancellingRole keeps the known roles and drops the rest', () => {
  assert.deepEqual(CANCELLING_ROLES, ['coach', 'coordinator', 'club_admin'])
  for (const role of CANCELLING_ROLES) assert.equal(cancellingRole(role), role)
  assert.equal(cancellingRole('system'), null)
  assert.equal(cancellingRole(null), null)
  assert.equal(cancellingRole(undefined), null)
})
