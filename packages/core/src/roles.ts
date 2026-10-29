// P-04 role catalogue: the `vereino_*` roles as data (club spec *Users, Permissions, and Scope*), plus the pure
// role-set computations of P-04/P-05 (DD-F05). Role names serve only for assignment, never for checking (DD-06).
import { isActiveAt, type Validity } from '#src/validity'
import type { CalendarDate } from '#src/calendar-date'

/**
 * Phase 1 roles (foundation spec Q17); `treasurer` and `facility_operator` arrive with phases 4 and 5.
 * `member` and `payer` are derived roles, never assigned.
 */
export type VereinoRole = 'club_admin' | 'coordinator' | 'coach' | 'member' | 'payer'

/** Roles a `people_role_assignments` row can carry in phase 1. */
export type AssignableRole = 'club_admin' | 'coordinator' | 'coach'

export const VEREINO_AUTH_ROLE_PREFIX = 'vereino_'

export type VereinoAuthRole = `${typeof VEREINO_AUTH_ROLE_PREFIX}${VereinoRole}`

export type RoleDefinition = {
  readonly authRole: VereinoAuthRole
  /** ACL features seeded on the `auth` role (`setup.ts` `defaultRoleFeatures`). */
  readonly features: readonly string[]
  /** Roles a holder of this role also holds (Odoo `implied_ids`); expanded transitively. */
  readonly implies?: readonly VereinoRole[]
  /** The record a role assignment must name: a section for a coordinator. */
  readonly requiresScope?: 'section' | 'place' | null
}

export const roleCatalogue: Readonly<Record<VereinoRole, RoleDefinition>> = {
  club_admin: {
    authRole: 'vereino_club_admin',
    features: ['club_core.*', 'people.*', 'groups.*', 'activities.*', 'communication.*', 'payments.*', 'facilities.*'],
    implies: ['member'],
    requiresScope: null,
  },
  coordinator: {
    authRole: 'vereino_coordinator',
    features: [
      'club_core.view',
      'club_core.sections.public_content',
      'people.view',
      // The platform does not expand `dependsOn` at check time (`aclDependencies.ts` only reports missing
      // dependencies), so `groups.manage` does not imply `groups.view`: the coordinator gets both (#30).
      'groups.view',
      'groups.manage',
      'activities.manage',
      'activities.coach',
      'activities.events.create',
      'activities.reports.view',
      'communication.post',
      'communication.cases.manage',
      'facilities.view',
      'facilities.bookings.create',
      'payments.groups.view',
      'payments.groups.collect',
    ],
    implies: ['member'],
    requiresScope: 'section',
  },
  coach: {
    authRole: 'vereino_coach',
    features: [
      'people.self',
      'communication.view',
      'groups.view',
      'activities.coach',
      'activities.events.create',
      'communication.post',
      'activities.reports.view_own',
      'facilities.view',
      'facilities.bookings.create',
      'payments.groups.view',
      'payments.groups.collect',
    ],
    implies: ['member'],
    requiresScope: null,
  },
  member: {
    authRole: 'vereino_member',
    features: ['people.self', 'activities.attendance.declare', 'communication.view'],
    requiresScope: null,
  },
  payer: {
    authRole: 'vereino_payer',
    features: ['payments.view_own', 'payments.pay_online', 'payments.orders.place'],
    requiresScope: null,
  },
}

export const VEREINO_ROLES: readonly VereinoRole[] = ['club_admin', 'coordinator', 'coach', 'member', 'payer']

/** True for an `auth` role name Vereino owns; a role sync never removes any other role. */
export function isVereinoAuthRole(roleName: string): boolean {
  return roleName.startsWith(VEREINO_AUTH_ROLE_PREFIX)
}

/** The roles plus every role they imply, transitively, in catalogue order. */
export function expandImpliedRoles(roles: readonly VereinoRole[]): VereinoRole[] {
  const held = new Set<VereinoRole>()
  const pending = [...roles]
  for (let role = pending.pop(); role !== undefined; role = pending.pop()) {
    if (held.has(role)) continue
    held.add(role)
    pending.push(...(roleCatalogue[role].implies ?? []))
  }
  return VEREINO_ROLES.filter((role) => held.has(role))
}

/** Sorted, de-duplicated `auth` role names of the roles and the roles they imply. */
export function authRolesFor(roles: readonly VereinoRole[]): VereinoAuthRole[] {
  return expandImpliedRoles(roles)
    .map((role) => roleCatalogue[role].authRole)
    .sort()
}

/** Every `auth` role name of the catalogue, sorted: what `seedRoles` creates. */
export function catalogueAuthRoles(): VereinoAuthRole[] {
  return authRolesFor(VEREINO_ROLES)
}

/** `{ vereino_<role>: features }` for the seeding module's `setup.ts` `defaultRoleFeatures`. */
export function catalogueRoleFeatures(): Record<VereinoAuthRole, string[]> {
  const entries = VEREINO_ROLES.map((role) => [roleCatalogue[role].authRole, [...roleCatalogue[role].features]])
  return Object.fromEntries(entries) as Record<VereinoAuthRole, string[]>
}

/** A role assignment as the role sync needs it: the role and its validity period. */
export type RoleAssignmentPeriod = Validity & { readonly role: AssignableRole }

/**
 * Sorted, de-duplicated `auth` role names granted by the assignments active on `today` (a calendar date in
 * the club time zone), including the roles they imply.
 */
export function rolesForAssignments(
  assignments: readonly RoleAssignmentPeriod[],
  today: CalendarDate,
): VereinoAuthRole[] {
  return authRolesFor(assignments.filter((assignment) => isActiveAt(assignment, today)).map(({ role }) => role))
}

export type DesiredRolesInput = {
  /** The user's current `auth` role names; every name outside `vereino_*` is kept. */
  readonly currentRoles: readonly string[]
  readonly assignments: readonly RoleAssignmentPeriod[]
  /** The person has an account: adds `vereino_member`. */
  readonly hasAccount: boolean
  /** An adult guardian or adult participant, computed by `people`: adds `vereino_payer`. */
  readonly payerEligible: boolean
}

/**
 * The full `roles` list for `auth.users.update` (DD-F05): the current roles outside `vereino_*`, the roles of
 * the active assignments and the derived roles. The platform replaces the user's roles with this list, so a
 * role Vereino does not own must be in it to survive.
 */
export function desiredRoles(input: DesiredRolesInput, today: CalendarDate): string[] {
  const derived: VereinoRole[] = []
  if (input.hasAccount) derived.push('member')
  if (input.payerEligible) derived.push('payer')
  const roles = new Set<string>(input.currentRoles.filter((role) => !isVereinoAuthRole(role)))
  for (const role of rolesForAssignments(input.assignments, today)) roles.add(role)
  for (const role of authRolesFor(derived)) roles.add(role)
  return [...roles].sort()
}

/** Set comparison of two role lists: order and duplicates do not matter. */
export function sameRoleSet(a: readonly string[], b: readonly string[]): boolean {
  const left = new Set(a)
  const right = new Set(b)
  return left.size === right.size && [...left].every((role) => right.has(role))
}
