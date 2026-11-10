import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  VEREINO_ROLES,
  authRolesFor,
  catalogueAuthRoles,
  catalogueRoleFeatures,
  desiredRoles,
  expandImpliedRoles,
  isVereinoAuthRole,
  roleCatalogue,
  rolesForAssignments,
  sameRoleSet,
} from '../roles.ts'

const TODAY = '2026-10-27'

test('the catalogue holds the five phase 1 roles (Q17), the facility attendant and the derived maintenance planner', () => {
  assert.deepEqual(catalogueAuthRoles(), [
    'vereino_club_admin',
    'vereino_coach',
    'vereino_coordinator',
    'vereino_facility_operator',
    'vereino_maintenance_planner',
    'vereino_member',
    'vereino_payer',
  ])
  assert.deepEqual(VEREINO_ROLES, [
    'club_admin',
    'coordinator',
    'coach',
    'facility_operator',
    'member',
    'payer',
    'maintenance_planner',
  ])
  assert.deepEqual(roleCatalogue.facility_operator.features, [
    'facilities.view',
    'facilities.rentals.manage',
    'facilities.log.write',
    'facilities.incidents.manage',
  ])
  assert.equal(roleCatalogue.facility_operator.requiresScope, 'place')
  assert.ok(!roleCatalogue.facility_operator.features.includes('facilities.rentals.approve'))
  assert.deepEqual(authRolesFor(['facility_operator']), ['vereino_facility_operator', 'vereino_member'])
  assert.deepEqual(roleCatalogue.maintenance_planner.features, ['facilities.maintenance.manage'])
  assert.equal(roleCatalogue.maintenance_planner.implies, undefined)
  assert.ok(!roleCatalogue.coordinator.features.includes('facilities.maintenance.manage'))
  assert.equal(roleCatalogue.coordinator.requiresScope, 'section')
  assert.equal(roleCatalogue.club_admin.requiresScope, null)
})

test('catalogueRoleFeatures returns copies keyed by auth role', () => {
  const features = catalogueRoleFeatures()
  assert.deepEqual(features.vereino_payer, ['payments.view_own', 'payments.pay_online', 'payments.orders.place'])
  assert.deepEqual(features.vereino_member, ['people.self', 'activities.attendance.declare', 'communication.view'])
  assert.ok(features.vereino_club_admin.includes('people.*'))
  assert.ok(features.vereino_club_admin.includes('dashboards.view'))
  assert.ok(!features.vereino_coordinator.includes('dashboards.view'))
  assert.ok(features.vereino_club_admin.includes('dictionaries.*'))
  assert.equal(
    features.vereino_coordinator.some((feature) => feature.startsWith('dictionaries.')),
    false,
  )
  assert.ok(features.vereino_coordinator.includes('communication.cases.manage'))
  assert.ok(features.vereino_coordinator.includes('groups.view'))
  assert.ok(features.vereino_coordinator.includes('groups.manage'))
  assert.ok(features.vereino_coordinator.includes('activities.view'))
  assert.ok(features.vereino_coordinator.includes('activities.manage'))
  assert.ok(features.vereino_coach.includes('activities.coach'))
  features.vereino_payer.push('mutated')
  assert.equal(roleCatalogue.payer.features.includes('mutated'), false)
})

test('isVereinoAuthRole recognises the vereino_ prefix only', () => {
  assert.equal(isVereinoAuthRole('vereino_coach'), true)
  assert.equal(isVereinoAuthRole('admin'), false)
  assert.equal(isVereinoAuthRole('vereino'), false)
})

test('implications expand transitively and without duplicates', () => {
  assert.deepEqual(expandImpliedRoles(['coach', 'coordinator', 'coach']), ['coordinator', 'coach', 'member'])
  assert.deepEqual(expandImpliedRoles(['payer']), ['payer'])
  assert.deepEqual(expandImpliedRoles([]), [])
  assert.deepEqual(authRolesFor(['coordinator']), ['vereino_coordinator', 'vereino_member'])
})

test('rolesForAssignments keeps the assignments active today', () => {
  const assignments = [
    { role: 'coordinator', validFrom: '2026-01-01', validTo: '2026-10-26' },
    { role: 'coach', validFrom: '2026-10-27', validTo: null },
    { role: 'club_admin', validFrom: '2026-10-28', validTo: null },
  ]
  assert.deepEqual(rolesForAssignments(assignments, TODAY), ['vereino_coach', 'vereino_member'])
  assert.deepEqual(rolesForAssignments(assignments, '2026-10-28'), [
    'vereino_club_admin',
    'vereino_coach',
    'vereino_member',
  ])
  assert.deepEqual(rolesForAssignments([], TODAY), [])
})

test('desiredRoles keeps roles outside vereino_* and adds the derived roles (DD-F05)', () => {
  const roles = desiredRoles(
    {
      currentRoles: ['admin', 'vereino_coordinator', 'employee', 'vereino_payer'],
      assignments: [{ role: 'coach', validFrom: '2026-01-01', validTo: null }],
      hasAccount: true,
      payerEligible: true,
    },
    TODAY,
  )
  assert.deepEqual(roles, ['admin', 'employee', 'vereino_coach', 'vereino_member', 'vereino_payer'])
})

test('desiredRoles drops every vereino_* role that is no longer earned', () => {
  const roles = desiredRoles(
    {
      currentRoles: ['vereino_coordinator', 'vereino_payer'],
      assignments: [],
      hasAccount: false,
      payerEligible: false,
    },
    TODAY,
  )
  assert.deepEqual(roles, [])
  assert.deepEqual(desiredRoles({ currentRoles: [], assignments: [], hasAccount: true, payerEligible: false }, TODAY), [
    'vereino_member',
  ])
})

test('desiredRoles adds vereino_maintenance_planner only for a place maintainer (DD-36)', () => {
  const base = {
    currentRoles: ['vereino_maintenance_planner'],
    assignments: [],
    hasAccount: true,
    payerEligible: false,
  }
  assert.deepEqual(desiredRoles({ ...base, maintenancePlanner: true }, TODAY), [
    'vereino_maintenance_planner',
    'vereino_member',
  ])
  assert.deepEqual(desiredRoles({ ...base, maintenancePlanner: false }, TODAY), ['vereino_member'])
  assert.deepEqual(desiredRoles(base, TODAY), ['vereino_member'])
})

test('sameRoleSet compares as sets', () => {
  assert.equal(sameRoleSet(['b', 'a'], ['a', 'b', 'a']), true)
  assert.equal(sameRoleSet(['a'], ['a', 'b']), false)
  assert.equal(sameRoleSet(['a', 'c'], ['a', 'b']), false)
  assert.equal(sameRoleSet([], []), true)
})
