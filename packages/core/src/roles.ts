// P-04 role catalogue: the `vereino_*` roles as data (club spec *Users, Permissions, and Scope*), plus the pure
// role-set computations of P-04/P-05 (DD-F05). Role names serve only for assignment, never for checking (DD-06).
import { isActiveAt, type Validity } from '#src/validity'
import type { CalendarDate } from '#src/calendar-date'

/**
 * Phase 1 roles (foundation spec Q17), the facility attendant `facility_operator` of phase 5 (#126; its assignment
 * names a place) and the treasurer `treasurer` of phase 4 (payments spec REQ-034, DD-33; #245). `member`, `payer` and
 * `maintenance_planner` are derived roles, never assigned: the last one (facilities spec DD-36, #128) carries only
 * `facilities.maintenance.manage` and is held while the person maintains at least one place.
 */
export type VereinoRole =
  | 'club_admin'
  | 'coordinator'
  | 'coach'
  | 'facility_operator'
  | 'treasurer'
  | 'member'
  | 'payer'
  | 'maintenance_planner'

/** Roles a `people_role_assignments` row can carry. */
export type AssignableRole = 'club_admin' | 'coordinator' | 'coach' | 'facility_operator' | 'treasurer'

export const VEREINO_AUTH_ROLE_PREFIX = 'vereino_'

export type VereinoAuthRole = `${typeof VEREINO_AUTH_ROLE_PREFIX}${VereinoRole}`

export type RoleDefinition = {
  readonly authRole: VereinoAuthRole
  /** ACL features seeded on the `auth` role (`setup.ts` `defaultRoleFeatures`). */
  readonly features: readonly string[]
  /** Roles a holder of this role also holds (Odoo `implied_ids`); expanded transitively. */
  readonly implies?: readonly VereinoRole[]
  /** The record a role assignment must name: a section for a coordinator, a place for a facility attendant. */
  readonly requiresScope?: 'section' | 'place' | null
}

export const roleCatalogue: Readonly<Record<VereinoRole, RoleDefinition>> = {
  club_admin: {
    authRole: 'vereino_club_admin',
    // `dictionaries.*`: the club administrator edits the club dictionaries, e.g. the PZPN age categories (#92).
    features: [
      'club_core.*',
      'people.*',
      'groups.*',
      'activities.*',
      'communication.*',
      'payments.*',
      'facilities.*',
      // Training outlines (training outlines spec, #683): every outline of the club.
      'training.*',
      'dictionaries.*',
      // Social sign-in (#566): the administrator lists and unlinks any person's sign-in identities.
      'foundation.identity.manage',
      // The panel dashboard (README B-01) with the Vereino widgets the other features offer (#88).
      'dashboards.view',
    ],
    implies: ['member'],
    requiresScope: null,
  },
  coordinator: {
    authRole: 'vereino_coordinator',
    features: [
      'club_core.view',
      'club_core.sections.public_content',
      // A missing external place added from the club event form (club events spec REQ-T06, DD-T08; Q-T20 approved
      // 2026-11-19, #377): the coordinator creates it, editing and deleting it stay `club_core.manage`.
      'club_core.places.add_external',
      'people.view',
      // The medical certificate date of the own sections' members: status and date, and the write (Q-O01; #682).
      'people.medical.view',
      'people.medical.manage',
      // Personal invitation links of the families of the own sections (personal invitation link spec REQ-IL02, Q-IL05
      // approved 2026-11-26; #868).
      'people.invitations.share',
      // The platform does not expand `dependsOn` at check time (`aclDependencies.ts` only reports missing
      // dependencies), so `groups.manage` does not imply `groups.view`: the coordinator gets both (#30).
      'groups.view',
      'groups.manage',
      // Likewise `activities.manage` does not imply `activities.view`: the coordinator lists sessions with it (#31).
      'activities.view',
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
      // Training outlines of the coordinator's sections (training outlines spec, #683).
      'training.outlines.write',
      // The shared outline library: browse, copy, rate, report, publish up to the club level (#685).
      'training.library.use',
      'training.library.publish',
      // The panel dashboard with the widgets of the coordinator's other features: "Sessions needing a coach" and
      // "Unsettled sessions" for the own sections (navigation spec REQ-N04, Q-N03 approved 2026-11-15; #260).
      'dashboards.view',
    ],
    implies: ['member'],
    requiresScope: 'section',
  },
  coach: {
    authRole: 'vereino_coach',
    features: [
      'people.self',
      // Social sign-in (#566): own identities follow `people.self`.
      'foundation.identity.self',
      // The medical certificate status and date of the own groups' players, no write (REQ-O02; #682).
      'people.medical.view',
      // Personal invitation links of the families of the own groups (personal invitation link spec REQ-IL02, Q-IL05
      // approved 2026-11-26; #868).
      'people.invitations.share',
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
      // Own outlines and those of the groups the coach runs (training outlines spec, #683).
      'training.outlines.write',
      // The shared outline library: browse, copy, rate, report, publish own outlines (#685).
      'training.library.use',
      'training.library.publish',
    ],
    implies: ['member'],
    requiresScope: null,
  },
  facility_operator: {
    authRole: 'vereino_facility_operator',
    // The facility attendant (club spec *Users, Permissions, and Scope*; #126): the calendar, rentals entered after a
    // phone call, the log and incidents — limited by the `facility_operator` grant to the assigned place and its
    // descendants. Approving online requests stays the administrator's (`facilities.rentals.approve`, Q-025). The panel
    // dashboard shows the attendant only the widgets of these features (navigation spec REQ-N04, Q-N03; #260).
    features: [
      'facilities.view',
      'facilities.rentals.manage',
      'facilities.log.write',
      'facilities.incidents.manage',
      'dashboards.view',
    ],
    implies: ['member'],
    requiresScope: 'place',
  },
  treasurer: {
    authRole: 'vereino_treasurer',
    // The treasurer (payments spec REQ-034, DD-33; #245): the club's finances only — fee schedules and discounts,
    // charges and overdue amounts, statement imports, cash and its handovers, order campaigns — and none of `people.*`,
    // `groups.*`, `activities.*`, `club_core.manage` or `facilities.*`. The panel shows the dashboard and Finance only
    // (owner approval of 2026-11-19 on #245); the coach units report and coach settlement stay the administrator's.
    features: [
      'payments.view',
      'payments.manage',
      'payments.bank.import',
      'payments.cash.record',
      'payments.cash.settle',
      'payments.orders.manage',
      'dashboards.view',
    ],
    implies: ['member'],
    requiresScope: null,
  },
  member: {
    authRole: 'vereino_member',
    // `foundation.identity.self` (#566): own social sign-in identities follow `people.self`.
    features: ['people.self', 'foundation.identity.self', 'activities.attendance.declare', 'communication.view'],
    requiresScope: null,
  },
  payer: {
    authRole: 'vereino_payer',
    features: ['payments.view_own', 'payments.pay_online', 'payments.orders.place'],
    requiresScope: null,
  },
  maintenance_planner: {
    authRole: 'vereino_maintenance_planner',
    // That feature only (DD-36): the place scope comes from the person's `facilities_place_maintainers` rows.
    features: ['facilities.maintenance.manage'],
    requiresScope: null,
  },
}

export const VEREINO_ROLES: readonly VereinoRole[] = [
  'club_admin',
  'coordinator',
  'coach',
  'facility_operator',
  'treasurer',
  'member',
  'payer',
  'maintenance_planner',
]

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
  /** The person maintains at least one place (`facilities.maintainerScopeProvider`): adds `vereino_maintenance_planner`. */
  readonly maintenancePlanner?: boolean
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
  if (input.maintenancePlanner === true) derived.push('maintenance_planner')
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
