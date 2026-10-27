import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  GRANT_KINDS,
  PROVIDER_GRANT_KINDS,
  actingRoleFor,
  findActingRole,
  grantContaining,
  hasKind,
  sanitizeProviderGrants,
  scopeWhere,
  unionScopes,
} from '../scope.ts'

const ORG = { tenantId: 't1', organizationId: 'o1' }
const SECTION_A = 'section-a'
const SECTION_B = 'section-b'

test('the phase 1 grant kinds exclude treasurer, facility_operator and maintenance_planner', () => {
  assert.deepEqual([...GRANT_KINDS].sort(), [
    'club_admin',
    'coach',
    'coordinator',
    'guardian',
    'self',
    'self_user',
    'system_job',
  ])
  assert.equal(PROVIDER_GRANT_KINDS.includes('self_user'), false)
  assert.equal(PROVIDER_GRANT_KINDS.includes('system_job'), false)
})

test('actingRoleFor maps self_user to self and system_job to system', () => {
  assert.equal(actingRoleFor('club_admin'), 'club_admin')
  assert.equal(actingRoleFor('coordinator'), 'coordinator')
  assert.equal(actingRoleFor('coach'), 'coach')
  assert.equal(actingRoleFor('guardian'), 'guardian')
  assert.equal(actingRoleFor('self'), 'self')
  assert.equal(actingRoleFor('self_user'), 'self')
  assert.equal(actingRoleFor('system_job'), 'system')
})

test('unionScopes concatenates and hasKind finds a kind', () => {
  const scope = unionScopes([{ kind: 'coordinator', ids: [SECTION_A] }], [{ kind: 'self_user', ids: ['u1'] }])
  assert.deepEqual(scope, [
    { kind: 'coordinator', ids: [SECTION_A] },
    { kind: 'self_user', ids: ['u1'] },
  ])
  assert.equal(hasKind(scope, 'coordinator'), true)
  assert.equal(hasKind(scope, 'club_admin'), false)
})

test('grantContaining matches each kind on its own target field', () => {
  const scope = [
    { kind: 'coordinator', ids: [SECTION_A] },
    { kind: 'coach', ids: ['group-1', 'occurrence-9'] },
    { kind: 'guardian', ids: ['ward-1'] },
    { kind: 'self', ids: ['person-1'] },
    { kind: 'self_user', ids: ['user-1'] },
  ]
  const target = (fields) => ({ id: 'r1', ...ORG, ...fields })
  assert.equal(grantContaining(scope, ['coordinator'], target({ sectionId: SECTION_A }))?.kind, 'coordinator')
  assert.equal(grantContaining(scope, ['coordinator'], target({ sectionId: SECTION_B })), null)
  assert.equal(grantContaining(scope, ['coach'], target({ groupId: 'group-1' }))?.kind, 'coach')
  assert.equal(
    grantContaining(scope, ['coach'], target({ groupId: 'group-2', occurrenceId: 'occurrence-9' }))?.kind,
    'coach',
  )
  assert.equal(grantContaining(scope, ['guardian'], target({ personId: 'ward-1' }))?.kind, 'guardian')
  assert.equal(grantContaining(scope, ['self'], target({ personId: 'person-1' }))?.kind, 'self')
  assert.equal(grantContaining(scope, ['self_user'], target({ userId: 'user-1' }))?.kind, 'self_user')
  assert.equal(grantContaining(scope, ['self_user'], target({ userId: null })), null)
  assert.equal(grantContaining(scope, ['club_admin', 'system_job'], target({})), null)
})

test('grantContaining walks the allowed kinds least-privileged first (DD-F08)', () => {
  const scope = [{ kind: 'club_admin' }, { kind: 'guardian', ids: ['child-1'] }]
  const target = { id: 'decl-1', ...ORG, personId: 'child-1' }
  assert.equal(grantContaining(scope, ['self', 'guardian', 'club_admin'], target)?.kind, 'guardian')
  assert.equal(findActingRole(scope, ['self', 'guardian', 'club_admin'], target), 'guardian')
  assert.equal(findActingRole(scope, ['club_admin', 'guardian'], target), 'club_admin')
  assert.equal(findActingRole([{ kind: 'system_job' }], ['system_job'], target), 'system')
  assert.equal(findActingRole(scope, ['self'], target), null)
})

test('a grant without ids contains nothing', () => {
  assert.equal(
    grantContaining([{ kind: 'coordinator' }], ['coordinator'], { id: 'g', ...ORG, sectionId: SECTION_A }),
    null,
  )
})

test('scopeWhere fails closed without a matching grant', () => {
  assert.deepEqual(scopeWhere([], ['coordinator'], { sectionId: 'sectionId' }), { id: { $in: [] } })
  assert.deepEqual(scopeWhere([{ kind: 'self_user', ids: ['u1'] }], ['coordinator'], { sectionId: 'sectionId' }), {
    id: { $in: [] },
  })
  assert.deepEqual(scopeWhere([{ kind: 'coordinator', ids: [SECTION_A] }], ['coordinator'], { personId: 'id' }), {
    id: { $in: [] },
  })
  assert.deepEqual(scopeWhere([{ kind: 'coordinator', ids: [] }], ['coordinator'], { sectionId: 'sectionId' }), {
    id: { $in: [] },
  })
  assert.deepEqual(scopeWhere([{ kind: 'coordinator' }], ['coordinator'], { sectionId: 'sectionId' }), {
    id: { $in: [] },
  })
})

test('scopeWhere adds no condition for a club-wide grant', () => {
  assert.deepEqual(
    scopeWhere([{ kind: 'coordinator', ids: [SECTION_A] }, { kind: 'club_admin' }], ['coordinator', 'club_admin'], {}),
    {},
  )
  assert.deepEqual(scopeWhere([{ kind: 'system_job' }], ['system_job'], {}), {})
  assert.deepEqual(scopeWhere([{ kind: 'club_admin' }], ['coordinator'], { sectionId: 'sectionId' }), {
    id: { $in: [] },
  })
})

test('scopeWhere merges ids per column and ors the columns', () => {
  const scope = [
    { kind: 'coordinator', ids: [SECTION_B, SECTION_A] },
    { kind: 'coordinator', ids: [SECTION_A] },
  ]
  assert.deepEqual(scopeWhere(scope, ['coordinator'], { sectionId: 'sectionId' }), {
    sectionId: { $in: [SECTION_A, SECTION_B] },
  })
  const mixed = [
    { kind: 'self', ids: ['person-1'] },
    { kind: 'guardian', ids: ['ward-1'] },
    { kind: 'coach', ids: ['group-1'] },
  ]
  assert.deepEqual(scopeWhere(mixed, ['self', 'guardian', 'coach'], { personId: 'personId', groupId: 'groupId' }), {
    $or: [{ personId: { $in: ['person-1', 'ward-1'] } }, { groupId: { $in: ['group-1'] } }],
  })
})

test('sanitizeProviderGrants keeps well-formed provider kinds only', () => {
  assert.deepEqual(sanitizeProviderGrants(null), [])
  assert.deepEqual(sanitizeProviderGrants({ kind: 'club_admin' }), [])
  assert.deepEqual(
    sanitizeProviderGrants([
      null,
      'club_admin',
      { kind: 'club_admin', ids: ['ignored'] },
      { kind: 'system_job' },
      { kind: 'self_user', ids: ['u1'] },
      { kind: 'treasurer' },
      { kind: 'coordinator' },
      { kind: 'coordinator', ids: 'section-a' },
      { kind: 'coordinator', ids: ['', 7, SECTION_A] },
      { kind: 'coach', ids: [] },
      { kind: 'guardian', ids: ['ward-1'] },
    ]),
    [{ kind: 'club_admin' }, { kind: 'coordinator', ids: [SECTION_A] }, { kind: 'guardian', ids: ['ward-1'] }],
  )
})
