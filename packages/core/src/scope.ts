// P-03 scope contract: a user's record scope is a list of grants (club spec *Record scope*). The union of
// two scopes is their concatenation, so no combination can add a kind a provider did not return; every
// predicate here fails closed.

/**
 * Grant kinds of club spec phase 1. Q17 of the foundation spec limits phase 1 to the roles
 * `vereino_club_admin`, `vereino_coordinator`, `vereino_coach`, `vereino_member` and `vereino_payer`, so the
 * kinds `treasurer` (with its `modules` payload), `facility_operator` and `maintenance_planner` arrive with
 * phases 4 and 5 and are not part of this union yet.
 */
export type GrantKind = 'club_admin' | 'coordinator' | 'coach' | 'guardian' | 'self' | 'self_user' | 'system_job'

export const GRANT_KINDS: readonly GrantKind[] = [
  'club_admin',
  'coordinator',
  'coach',
  'guardian',
  'self',
  'self_user',
  'system_job',
]

/** Kinds a registered scope provider may return; `self_user` and `system_job` are computed by the foundation. */
export const PROVIDER_GRANT_KINDS: readonly GrantKind[] = ['club_admin', 'coordinator', 'coach', 'guardian', 'self']

export type ScopeGrant = {
  readonly kind: GrantKind
  /** Section, group/occurrence, person or user ids, depending on the kind; absent for club-wide kinds. */
  readonly ids?: readonly string[]
}

export type Scope = readonly ScopeGrant[]

/** The role recorded as `acting_role`: the kind of the grant that allowed the action. */
export type ActingRole = 'club_admin' | 'coordinator' | 'coach' | 'guardian' | 'self' | 'system'

/** Target fields a grant can match, and the fields a list column map can name. */
export type ScopeTargetField = 'sectionId' | 'groupId' | 'occurrenceId' | 'placeId' | 'personId' | 'userId'

/** The record a command acts on, as the command describes it (`resolveTarget`). */
export type ScopeTarget = {
  readonly id: string
  readonly tenantId: string
  readonly organizationId: string
} & { readonly [field in ScopeTargetField]?: string | null }

/** Maps target fields to the entity's filter keys for `scopeWhere`, e.g. `{ sectionId: 'sectionId' }`. */
export type ScopeColumnMap = { readonly [field in ScopeTargetField]?: string }

/** A plain MikroORM-style filter object for `makeCrudRoute`'s `list.buildFilters`. */
export type WhereFragment = Record<string, unknown>

/** Grants of these kinds cover every record of the organization the scope was resolved for. */
const CLUB_WIDE_KINDS: ReadonlySet<GrantKind> = new Set<GrantKind>(['club_admin', 'system_job'])

/** Which target fields a grant of each id-carrying kind matches. */
const KIND_TARGET_FIELDS: Readonly<Record<GrantKind, readonly ScopeTargetField[]>> = {
  club_admin: [],
  system_job: [],
  coordinator: ['sectionId'],
  coach: ['groupId', 'occurrenceId'],
  guardian: ['personId'],
  self: ['personId'],
  self_user: ['userId'],
}

const ACTING_ROLES: Readonly<Record<GrantKind, ActingRole>> = {
  club_admin: 'club_admin',
  coordinator: 'coordinator',
  coach: 'coach',
  guardian: 'guardian',
  self: 'self',
  self_user: 'self',
  system_job: 'system',
}

/** The `acting_role` recorded for an action allowed by a grant of `kind`. */
export function actingRoleFor(kind: GrantKind): ActingRole {
  return ACTING_ROLES[kind]
}

/** The union of two scopes is their concatenation (club spec *Record scope*). */
export function unionScopes(a: Scope, b: Scope): Scope {
  return [...a, ...b]
}

export function hasKind(scope: Scope, kind: GrantKind): boolean {
  return scope.some((grant) => grant.kind === kind)
}

function grantMatches(grant: ScopeGrant, target: ScopeTarget): boolean {
  if (CLUB_WIDE_KINDS.has(grant.kind)) return true
  const ids = grant.ids ?? []
  return KIND_TARGET_FIELDS[grant.kind].some((field) => {
    const value = target[field]
    return typeof value === 'string' && ids.includes(value)
  })
}

/**
 * Walks `kinds` in the given order (least-privileged first, DD-F08) and returns the first grant of that kind
 * containing the target, or null. The caller checks the target's tenant and organization against the scope's.
 */
export function grantContaining(scope: Scope, kinds: readonly GrantKind[], target: ScopeTarget): ScopeGrant | null {
  for (const kind of kinds) {
    const grant = scope.find((candidate) => candidate.kind === kind && grantMatches(candidate, target))
    if (grant) return grant
  }
  return null
}

/** The acting role of the first allowed grant containing the target, or null when none does. */
export function findActingRole(scope: Scope, kinds: readonly GrantKind[], target: ScopeTarget): ActingRole | null {
  const grant = grantContaining(scope, kinds, target)
  return grant ? actingRoleFor(grant.kind) : null
}

/**
 * Turns the grants of the allowed kinds into a list filter, so a list and a detail check agree by construction.
 * A club-wide grant adds no condition; a grant whose fields the column map does not name adds nothing; no
 * matching grant yields `{ id: { $exists: false } }` (`id IS NULL`; the primary key is never null), which matches no row (fail
 * closed). Not `{ id: { $in: [] } }`: the installed query engine compiles an empty `$in` to `in ()`, a PostgreSQL
 * syntax error.
 */
export function scopeWhere(scope: Scope, kinds: readonly GrantKind[], columnMap: ScopeColumnMap): WhereFragment {
  const allowed = scope.filter((grant) => kinds.includes(grant.kind))
  if (allowed.some((grant) => CLUB_WIDE_KINDS.has(grant.kind))) return {}
  const idsByColumn = new Map<string, Set<string>>()
  for (const grant of allowed) {
    for (const field of KIND_TARGET_FIELDS[grant.kind]) {
      const column = columnMap[field]
      if (column === undefined || !grant.ids || grant.ids.length === 0) continue
      const ids = idsByColumn.get(column) ?? new Set<string>()
      for (const id of grant.ids) ids.add(id)
      idsByColumn.set(column, ids)
    }
  }
  const conditions: WhereFragment[] = [...idsByColumn].map(([column, ids]) => ({ [column]: { $in: [...ids].sort() } }))
  const [first, ...rest] = conditions
  if (!first) return { id: { $exists: false } }
  return rest.length === 0 ? first : { $or: conditions }
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0
}

/**
 * Keeps only well-formed grants of the kinds a provider may return; anything else is dropped, so a faulty
 * provider can narrow a scope but never widen it.
 */
export function sanitizeProviderGrants(grants: unknown): Scope {
  if (!Array.isArray(grants)) return []
  const result: ScopeGrant[] = []
  for (const grant of grants as unknown[]) {
    if (grant === null || typeof grant !== 'object') continue
    const { kind, ids } = grant as { kind?: unknown; ids?: unknown }
    if (!PROVIDER_GRANT_KINDS.includes(kind as GrantKind)) continue
    const providerKind = kind as GrantKind
    if (CLUB_WIDE_KINDS.has(providerKind)) {
      result.push({ kind: providerKind })
      continue
    }
    if (!Array.isArray(ids)) continue
    const cleanIds = (ids as unknown[]).filter(isNonEmptyString)
    if (cleanIds.length > 0) result.push({ kind: providerKind, ids: cleanIds })
  }
  return result
}
