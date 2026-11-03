// Pure rules of the groups list (E06-S08 #90; README B-11): the list state kept in the page URL — the perspective
// (All / Teams / Class groups, which is the kind filter) and the section, season and status filters — and the
// list-time roster summary of each group (its coaches and its number of active participants). Nothing here reads the
// database or the clock.
import { COACHING_ROLES, GROUP_KINDS, type GroupKind, type MembershipRole } from './groups-rules'

/** The list state a groups URL carries; an absent key is "no filter". */
export type GroupListState = {
  readonly kind?: GroupKind
  readonly sectionId?: string
  readonly seasonId?: string
  readonly isActive?: 'true' | 'false'
  readonly search?: string
}

/** The keys of the state, in the order a URL writes them. */
const STATE_KEYS = ['kind', 'sectionId', 'seasonId', 'isActive', 'search'] as const

const MAX_TEXT = 200

/** The perspectives of the list: `all` (no kind) and one per group kind. */
export const GROUP_PERSPECTIVES = ['all', ...GROUP_KINDS] as const
export type GroupPerspective = (typeof GROUP_PERSPECTIVES)[number]

function isKind(value: string): value is GroupKind {
  return (GROUP_KINDS as readonly string[]).includes(value)
}

function text(value: string | null): string | undefined {
  const trimmed = value?.trim() ?? ''
  return trimmed.length > 0 && trimmed.length <= MAX_TEXT ? trimmed : undefined
}

/**
 * The list state of a URL's query (`?kind=team&sectionId=…`). Unknown kinds and statuses and blank or over-long values
 * are dropped, so a hand-edited URL never sends a request the list API would refuse; ids are passed as given (the API
 * validates them, and the record scope decides what a valid id shows).
 */
export function parseGroupListState(query: { get(key: string): string | null }): GroupListState {
  const kind = query.get('kind')
  const isActive = query.get('isActive')
  const state: { -readonly [key in keyof GroupListState]: GroupListState[key] } = {}
  if (kind && isKind(kind)) state.kind = kind
  const sectionId = text(query.get('sectionId'))
  if (sectionId) state.sectionId = sectionId
  const seasonId = text(query.get('seasonId'))
  if (seasonId) state.seasonId = seasonId
  if (isActive === 'true' || isActive === 'false') state.isActive = isActive
  const search = text(query.get('search'))
  if (search) state.search = search
  return state
}

/** The query string of a list state (no leading `?`; empty when no filter is set), in a stable key order. */
export function groupListQuery(state: GroupListState): string {
  const params = new URLSearchParams()
  for (const key of STATE_KEYS) {
    const value = state[key]
    if (value) params.set(key, value)
  }
  return params.toString()
}

/** The perspective a state shows: its kind, or `all`. */
export function perspectiveOf(state: GroupListState): GroupPerspective {
  return state.kind ?? 'all'
}

/** The state with another perspective: `all` clears the kind; the other filters stay. */
export function withPerspective(state: GroupListState, perspective: GroupPerspective): GroupListState {
  const next: { -readonly [key in keyof GroupListState]: GroupListState[key] } = { ...state }
  delete next.kind
  return perspective === 'all' ? next : { ...next, kind: perspective }
}

/** Whether any filter or search narrows the list (the empty state then offers "Clear filters", not "Add group"). */
export function hasGroupFilters(state: GroupListState): boolean {
  return STATE_KEYS.some((key) => Boolean(state[key]))
}

/** An active membership of a listed group, as the roster summary reads it. */
export type ActiveMembership = {
  readonly groupId: string
  readonly personId: string
  readonly role: MembershipRole
}

export type GroupRosterSummary = {
  /** The persons who lead the group (coaches first, then assistants), each once, in the order first met. */
  readonly coachIds: string[]
  /** The distinct persons with an active `participant` membership. */
  readonly participantCount: number
}

/**
 * The roster summary of each group among `groupIds` from its memberships active today: the coaching persons (coach
 * before assistant) and the number of distinct participants. A group without active memberships gets an empty
 * summary; memberships of other groups are ignored.
 */
export function summarizeRosters(
  groupIds: readonly string[],
  memberships: readonly ActiveMembership[],
): Map<string, GroupRosterSummary> {
  const rosters = new Map(
    groupIds.map((id) => [id, { coaches: new Map<string, number>(), participants: new Set<string>() }]),
  )
  for (const membership of memberships) {
    const roster = rosters.get(membership.groupId)
    if (!roster) continue
    const rank = COACHING_ROLES.indexOf(membership.role)
    if (rank < 0) {
      roster.participants.add(membership.personId)
      continue
    }
    const known = roster.coaches.get(membership.personId)
    if (known === undefined || rank < known) roster.coaches.set(membership.personId, rank)
  }
  const summaries = new Map<string, GroupRosterSummary>()
  for (const [id, roster] of rosters) {
    // `sort` is stable, so persons of the same role keep the order the memberships came in.
    const coachIds = [...roster.coaches.entries()].sort((a, b) => a[1] - b[1]).map(([personId]) => personId)
    summaries.set(id, { coachIds, participantCount: roster.participants.size })
  }
  return summaries
}
