// P-28 (foundation II DD-G11): the append-only base records id, scope and creation columns only — no lock token, no
// soft delete — and tells the `foundation` guard which rows it protects.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  AppendOnlyEntityBase,
  ScopedEntityBase,
  appendOnlyEntityColumns,
  decorateAppendOnlyEntityBase,
  isAppendOnlyEntity,
} from '../index.ts'

function recordingDecorators() {
  const calls = []
  const decorator = (kind) => (options) => (target, property) => {
    calls.push({ kind, target, property, options })
  }
  return { calls, decorators: { PrimaryKey: decorator('primary'), Property: decorator('property') } }
}

test('decorateAppendOnlyEntityBase records id, scope and created_at — no updated_at, no deleted_at', () => {
  const { calls, decorators } = recordingDecorators()
  decorateAppendOnlyEntityBase(decorators)
  assert.ok(calls.every((call) => call.target === AppendOnlyEntityBase.prototype))
  assert.deepEqual(
    Object.fromEntries(calls.map((call) => [call.property, { kind: call.kind, name: call.options.name }])),
    {
      id: { kind: 'primary', name: undefined },
      organizationId: { kind: 'property', name: 'organization_id' },
      tenantId: { kind: 'property', name: 'tenant_id' },
      createdAt: { kind: 'property', name: 'created_at' },
    },
  )
  const byProperty = Object.fromEntries(calls.map((call) => [call.property, call.options]))
  assert.equal(byProperty.id.defaultRaw, 'gen_random_uuid()')
  assert.ok(byProperty.createdAt.onCreate() instanceof Date)
  assert.notEqual(appendOnlyEntityColumns().id, appendOnlyEntityColumns().id)
})

test('isAppendOnlyEntity tells append-only rows from scoped ones', () => {
  class Log extends AppendOnlyEntityBase {}
  class Row extends ScopedEntityBase {}
  const log = new Log()
  assert.ok(log.createdAt instanceof Date)
  assert.equal(Object.hasOwn(log, 'updatedAt'), false)
  assert.equal(isAppendOnlyEntity(log), true)
  assert.equal(isAppendOnlyEntity(new Row()), false)
  assert.equal(isAppendOnlyEntity(null), false)
})
