// `@mikro-orm/decorators/legacy` cannot be loaded from packages/db (its optional peer `reflect-metadata` is
// installed in packages/app only), so these tests pass recording decorators; the probe entity against the
// real ORM runs with the consumer's decorators in the integration suite.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  ScopedEntityBase,
  consentColumn,
  decorateScopedEntityBase,
  scopedEntityColumns,
  validFromColumn,
  validToColumn,
} from '../index.ts'

function recordingDecorators() {
  const calls = []
  const decorator = (kind) => (options) => (target, property) => {
    calls.push({ kind, target, property, options })
  }
  return { calls, decorators: { PrimaryKey: decorator('primary'), Property: decorator('property') } }
}

test('decorateScopedEntityBase records the scope and lifecycle columns on the base prototype', () => {
  const { calls, decorators } = recordingDecorators()
  decorateScopedEntityBase(decorators)
  assert.ok(calls.every((call) => call.target === ScopedEntityBase.prototype))
  const columns = Object.fromEntries(
    calls.map((call) => [call.property, { kind: call.kind, name: call.options.name, type: call.options.type }]),
  )
  assert.deepEqual(columns, {
    id: { kind: 'primary', name: undefined, type: 'uuid' },
    organizationId: { kind: 'property', name: 'organization_id', type: 'uuid' },
    tenantId: { kind: 'property', name: 'tenant_id', type: 'uuid' },
    createdAt: { kind: 'property', name: 'created_at', type: Date },
    updatedAt: { kind: 'property', name: 'updated_at', type: Date },
    deletedAt: { kind: 'property', name: 'deleted_at', type: Date },
  })
  const byProperty = Object.fromEntries(calls.map((call) => [call.property, call.options]))
  assert.equal(byProperty.id.defaultRaw, 'gen_random_uuid()')
  assert.equal(byProperty.deletedAt.nullable, true)
  assert.ok(byProperty.createdAt.onCreate() instanceof Date)
  assert.ok(byProperty.updatedAt.onUpdate() instanceof Date)
})

test('each call gets fresh option objects (the decorators mutate them)', () => {
  const first = scopedEntityColumns()
  const second = scopedEntityColumns()
  assert.notEqual(first.id, second.id)
  assert.notEqual(first.properties.tenantId, second.properties.tenantId)
  assert.notEqual(validFromColumn(), validFromColumn())
})

test('a subclass instance starts with fresh timestamps', () => {
  class Probe extends ScopedEntityBase {}
  const before = Date.now()
  const probe = new Probe()
  assert.ok(probe.createdAt.getTime() >= before)
  assert.ok(probe.updatedAt.getTime() >= before)
  assert.equal(Object.hasOwn(probe, 'id'), false)
})

test('validity columns map to valid_from and valid_to dates', () => {
  assert.deepEqual(validFromColumn(), { name: 'valid_from', type: 'date' })
  assert.deepEqual(validToColumn(), { name: 'valid_to', type: 'date', nullable: true })
})

test('consentColumn maps a consent name to its <name>_at timestamptz column', () => {
  assert.deepEqual(consentColumn('share_contact_with_coaches'), {
    name: 'share_contact_with_coaches_at',
    type: Date,
    nullable: true,
  })
  assert.throws(() => consentColumn('Publish'), RangeError)
  assert.throws(() => consentColumn('publish__name'), RangeError)
})
